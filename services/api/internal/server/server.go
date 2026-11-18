// Package server holds the HTTP handlers, middleware and route table.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/netip"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"hisab/internal/db"
	"hisab/internal/email"
)

type Config struct {
	Dev            bool
	AppOrigin      string // https://hisab-….vercel.app (prod) | http://localhost:5173
	AdminOrigin    string // same as AppOrigin in prod | http://localhost:5174
	AdminEmails    map[string]bool
	GoogleClientID string
	GoogleSecret   string
	GoogleAuthURL  string // overridable in tests
	GoogleTokenURL string
}

type Server struct {
	Pool *pgxpool.Pool
	Q    *db.Queries
	Cfg  Config
	Send email.Send
}

func New(pool *pgxpool.Pool, cfg Config, send email.Send) *Server {
	if cfg.AdminOrigin == "" {
		cfg.AdminOrigin = cfg.AppOrigin
	}
	if cfg.GoogleAuthURL == "" {
		cfg.GoogleAuthURL = "https://accounts.google.com/o/oauth2/v2/auth"
	}
	if cfg.GoogleTokenURL == "" {
		cfg.GoogleTokenURL = "https://oauth2.googleapis.com/token"
	}
	return &Server{Pool: pool, Q: db.New(pool), Cfg: cfg, Send: send}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	h := mux.HandleFunc

	// Health check for the host; never touches the DB so Neon can sleep.
	h("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	h("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		states, err := s.Q.ListStates(r.Context())
		if err != nil {
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "states": len(states)})
	})

	h("GET /api/auth/google/start", s.googleStart(audApp))
	h("GET /api/auth/google/callback", s.googleCallback(audApp))
	h("POST /api/auth/logout", s.session(audApp, s.logout))
	h("GET /api/me", s.session(audApp, s.me))

	h("POST /api/waitlist", s.session(audApp, s.applyWaitlist))
	h("GET /api/waitlist", s.session(audApp, s.getWaitlist))
	h("PUT /api/waitlist", s.session(audApp, s.updateWaitlist))

	h("GET /api/admin/auth/google/start", s.googleStart(audAdmin))
	h("GET /api/admin/auth/google/callback", s.googleCallback(audAdmin))
	for pattern, fn := range s.adminRoutes() {
		h(pattern, s.session(audAdmin, fn))
	}

	if s.Cfg.Dev {
		h("POST /api/dev/login", s.devLogin)
	}

	cop := http.NewCrossOriginProtection()
	for _, o := range []string{s.Cfg.AppOrigin, s.Cfg.AdminOrigin} {
		if err := cop.AddTrustedOrigin(o); err != nil {
			slog.Error("bad origin", "origin", o, "err", err)
		}
	}
	return recoverer(cop.Handler(mux))
}

// adminRoutes is also used by the tests to hit every admin route.
func (s *Server) adminRoutes() map[string]http.HandlerFunc {
	return map[string]http.HandlerFunc{
		"POST /api/admin/auth/logout":                    s.logout,
		"GET /api/admin/me":                              s.adminMe,
		"GET /api/admin/applications":                    s.listBusinesses,
		"POST /api/admin/applications/{id}/approve":      s.review("approved"),
		"POST /api/admin/applications/{id}/reject":       s.review("rejected"),
		"POST /api/admin/applications/{id}/resend-email": s.resendEmail,
		"GET /api/admin/clients":                         s.listBusinesses,
		"GET /api/admin/clients/{id}":                    s.clientDetail,
		"POST /api/admin/clients/{id}/suspend":           s.suspend,
		"POST /api/admin/clients/{id}/reactivate":        s.reactivate,
		"GET /api/admin/metrics":                         s.metrics,
		"GET /api/admin/audit":                           s.listAudit,
	}
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.Error("panic", "path", r.URL.Path, "err", v)
				apiError(w, 500, "internal", "Something went wrong", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// ── helpers ──────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func apiError(w http.ResponseWriter, status int, code, msg string, fields map[string]string) {
	e := map[string]any{"code": code, "message": msg}
	if len(fields) > 0 {
		e["fields"] = fields
	}
	writeJSON(w, status, map[string]any{"error": e})
}

// decode reads a JSON body (≤1 MB, unknown fields rejected); on failure it writes 400 and returns false.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil && !errors.Is(err, io.EOF) {
		apiError(w, 400, "bad_json", err.Error(), nil)
		return false
	}
	return true
}

func internalError(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("handler", "path", r.URL.Path, "err", err)
	apiError(w, 500, "internal", "Something went wrong", nil)
}

// notFound also covers a malformed UUID in the path (22P02), which is a 404 to the client, not a 500.
func notFound(err error) bool {
	var pe *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pe) && pe.Code == "22P02")
}

// clientIP: Vercel puts the real client first in X-Forwarded-For.
func clientIP(r *http.Request) *netip.Addr {
	v := r.Header.Get("X-Forwarded-For")
	if v == "" {
		v = r.RemoteAddr
		if ap, err := netip.ParseAddrPort(v); err == nil {
			a := ap.Addr()
			return &a
		}
	}
	if a, err := netip.ParseAddr(strings.TrimSpace(strings.Split(v, ",")[0])); err == nil {
		return &a
	}
	return nil
}

func ptr[T any](v T) *T { return &v }

// audit writes one audit row with the current session as actor.
func audit(ctx context.Context, q *db.Queries, r *http.Request, action, businessID string, data any) error {
	se := sessionFrom(r)
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	p := db.AuditParams{ActorType: "system", Action: action, Data: b, Ip: clientIP(r), EntityType: ptr("business")}
	if se != nil {
		p.ActorType, p.ActorUserID, p.ActorEmail = "user", &se.UserID, &se.Email
		if se.Audience == audAdmin {
			p.ActorType = "admin"
		}
	}
	if businessID != "" {
		p.BusinessID, p.EntityID = &businessID, &businessID
	}
	return q.Audit(ctx, p)
}
