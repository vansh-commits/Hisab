package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"

	"hisab/internal/db"
)

const (
	audApp   = "app"
	audAdmin = "admin"
)

type Session struct {
	UserID, Email, Name string
	AvatarURL           *string
	Audience            string
	tokenHash           []byte
}

type ctxKey struct{}

func sessionFrom(r *http.Request) *Session {
	se, _ := r.Context().Value(ctxKey{}).(*Session)
	return se
}

// secure: prod runs on https, so cookies get Secure and the __Host- prefix.
func (s *Server) secure() bool { return strings.HasPrefix(s.Cfg.AppOrigin, "https://") }

func (s *Server) cookieName(base string) string {
	if s.secure() {
		return "__Host-" + base
	}
	return base
}

func (s *Server) sessionCookie(aud string) string {
	if aud == audAdmin {
		return s.cookieName("asid")
	}
	return s.cookieName("sid")
}

func (s *Server) setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: maxAge,
		Secure: s.secure(), HttpOnly: true, SameSite: http.SameSiteLaxMode})
}

func (s *Server) allowed(email string) bool { return s.Cfg.AdminEmails[strings.ToLower(email)] }

func lifetimes(aud string) (idle, absolute time.Duration) {
	if aud == audAdmin {
		return 12 * time.Hour, 12 * time.Hour
	}
	return 7 * 24 * time.Hour, 30 * 24 * time.Hour
}

func randToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(raw string) []byte {
	h := sha256.Sum256([]byte(raw))
	return h[:]
}

// session is the middleware for the "session" and "admin" chains: valid cookie of the
// given audience, sliding idle expiry, and for admin a fresh allowlist check every request.
func (s *Server) session(aud string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(s.sessionCookie(aud))
		if err != nil {
			apiError(w, 401, "unauthenticated", "Please log in", nil)
			return
		}
		hash := hashToken(c.Value)
		row, err := s.Q.SessionUser(r.Context(), db.SessionUserParams{TokenHash: hash, Audience: aud})
		if notFound(err) {
			apiError(w, 401, "unauthenticated", "Session expired, please log in again", nil)
			return
		} else if err != nil {
			internalError(w, r, err)
			return
		}
		se := &Session{UserID: row.UserID, Name: row.Name, AvatarURL: row.AvatarUrl, Audience: aud, tokenHash: hash}
		if row.Email != nil {
			se.Email = *row.Email
		}
		if aud == audAdmin && !s.allowed(se.Email) {
			apiError(w, 403, "forbidden", "Not an admin", nil)
			return
		}
		if time.Since(row.LastSeenAt) > time.Hour { // write at most hourly
			idle, _ := lifetimes(aud)
			if err := s.Q.TouchSession(r.Context(), db.TouchSessionParams{TokenHash: hash, IdleSecs: int32(idle.Seconds())}); err != nil {
				slog.Warn("touch session", "err", err)
			}
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, se)))
	}
}

func (s *Server) createSession(ctx context.Context, w http.ResponseWriter, r *http.Request, userID, aud string) error {
	if err := s.Q.PruneSessions(ctx); err != nil {
		slog.Warn("prune sessions", "err", err)
	}
	raw := randToken()
	idle, abs := lifetimes(aud)
	now := time.Now()
	ua := r.UserAgent()
	if err := s.Q.CreateSession(ctx, db.CreateSessionParams{TokenHash: hashToken(raw), UserID: userID, Audience: aud,
		ExpiresAt: now.Add(idle), AbsoluteExpiresAt: now.Add(abs), Ip: clientIP(r), UserAgent: &ua}); err != nil {
		return err
	}
	s.setCookie(w, s.sessionCookie(aud), raw, int(abs.Seconds()))
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	se := sessionFrom(r)
	if err := s.Q.DeleteSession(r.Context(), se.tokenHash); err != nil {
		internalError(w, r, err)
		return
	}
	s.setCookie(w, s.sessionCookie(se.Audience), "", -1)
	w.WriteHeader(204)
}

// loginOrSignup finds the user by (provider, subject), else links a verified email to an
// existing user (e.g. a seeded one), else creates the user. Phone OTP later = provider "phone".
func (s *Server) loginOrSignup(ctx context.Context, provider, subject, email, name string, avatar *string) (db.User, error) {
	var u db.User
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		var err error
		u, err = q.UserByIdentity(ctx, db.UserByIdentityParams{Provider: provider, Subject: subject})
		if notFound(err) {
			u, err = q.UserByEmail(ctx, &email)
			if notFound(err) {
				u, err = q.CreateUser(ctx, db.CreateUserParams{Email: &email, Name: name, AvatarUrl: avatar})
			}
			if err != nil {
				return err
			}
			err = q.CreateIdentity(ctx, db.CreateIdentityParams{UserID: u.ID, Provider: provider, Subject: subject, Email: &email})
		}
		if err != nil {
			return err
		}
		return q.TouchUserLogin(ctx, db.TouchUserLoginParams{ID: u.ID, Name: name, AvatarUrl: avatar})
	})
	return u, err
}

// ── Google OIDC (authorization code + PKCE) ──────────────────────────────

func (s *Server) oauthConfig(aud string) *oauth2.Config {
	origin, path := s.Cfg.AppOrigin, "/api/auth/google/callback"
	if aud == audAdmin {
		origin, path = s.Cfg.AdminOrigin, "/api/admin/auth/google/callback"
	}
	return &oauth2.Config{
		ClientID: s.Cfg.GoogleClientID, ClientSecret: s.Cfg.GoogleSecret, RedirectURL: origin + path,
		Endpoint: oauth2.Endpoint{AuthURL: s.Cfg.GoogleAuthURL, TokenURL: s.Cfg.GoogleTokenURL},
		Scopes:   []string{"openid", "email", "profile"},
	}
}

type oauthState struct {
	State, Nonce, Verifier, ReturnTo string
}

// safeReturn allows only same-site relative paths ("/app", not "//evil" or "https://…").
func safeReturn(p string) bool {
	return strings.HasPrefix(p, "/") && !strings.HasPrefix(p, "//") && !strings.Contains(p, `\`)
}

func (s *Server) homePath(aud string) string {
	if aud == audAdmin {
		return "/admin/"
	}
	return "/app"
}

func (s *Server) googleStart(aud string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		st := oauthState{State: randToken(), Nonce: randToken(), Verifier: oauth2.GenerateVerifier(), ReturnTo: s.homePath(aud)}
		if p := r.URL.Query().Get("return_to"); safeReturn(p) {
			st.ReturnTo = p
		}
		b, _ := json.Marshal(st)
		s.setCookie(w, s.cookieName("oauth"), base64.RawURLEncoding.EncodeToString(b), 600)
		url := s.oauthConfig(aud).AuthCodeURL(st.State, oauth2.S256ChallengeOption(st.Verifier),
			oauth2.SetAuthURLParam("nonce", st.Nonce), oauth2.SetAuthURLParam("prompt", "select_account"))
		http.Redirect(w, r, url, http.StatusFound)
	}
}

type idClaims struct {
	Iss           string `json:"iss"`
	Aud           string `json:"aud"`
	Exp           int64  `json:"exp"`
	Nonce         string `json:"nonce"`
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// parseIDToken reads the claims without checking the signature. That is allowed because the
// token came straight from Google's token endpoint over TLS (OIDC Core §3.1.3.7 step 6);
// iss, aud, exp and nonce are still checked by the caller.
func parseIDToken(raw string) (idClaims, error) {
	var c idClaims
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return c, errors.New("malformed id_token")
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return c, err
	}
	return c, json.Unmarshal(b, &c)
}

func (s *Server) googleCallback(aud string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(code string, err error) {
			slog.Warn("login failed", "aud", aud, "code", code, "err", err)
			target := "/login?error=" + code
			if aud == audAdmin {
				target = "/admin/?error=" + code
			}
			http.Redirect(w, r, target, http.StatusFound)
		}
		var st oauthState
		c, err := r.Cookie(s.cookieName("oauth"))
		if err != nil {
			fail("expired", err)
			return
		}
		s.setCookie(w, s.cookieName("oauth"), "", -1)
		if b, err := base64.RawURLEncoding.DecodeString(c.Value); err != nil || json.Unmarshal(b, &st) != nil {
			fail("expired", err)
			return
		}
		q := r.URL.Query()
		if q.Get("error") != "" {
			fail("denied", errors.New(q.Get("error")))
			return
		}
		if subtle.ConstantTimeCompare([]byte(q.Get("state")), []byte(st.State)) != 1 {
			fail("state", nil)
			return
		}
		tok, err := s.oauthConfig(aud).Exchange(r.Context(), q.Get("code"), oauth2.VerifierOption(st.Verifier))
		if err != nil {
			fail("exchange", err)
			return
		}
		raw, _ := tok.Extra("id_token").(string)
		cl, err := parseIDToken(raw)
		switch {
		case err != nil:
			fail("token", err)
			return
		case cl.Iss != "https://accounts.google.com" && cl.Iss != "accounts.google.com",
			cl.Aud != s.Cfg.GoogleClientID, time.Now().Unix() > cl.Exp, cl.Sub == "":
			fail("token", errors.New("bad iss/aud/exp/sub"))
			return
		case subtle.ConstantTimeCompare([]byte(cl.Nonce), []byte(st.Nonce)) != 1:
			fail("token", errors.New("nonce mismatch"))
			return
		case !cl.EmailVerified || cl.Email == "":
			fail("unverified", nil)
			return
		case aud == audAdmin && !s.allowed(cl.Email):
			fail("not_allowed", errors.New(cl.Email))
			return
		}
		var avatar *string
		if cl.Picture != "" {
			avatar = &cl.Picture
		}
		u, err := s.loginOrSignup(r.Context(), "google", cl.Sub, strings.ToLower(cl.Email), cl.Name, avatar)
		if err != nil {
			fail("internal", err)
			return
		}
		if err := s.createSession(r.Context(), w, r, u.ID, aud); err != nil {
			fail("internal", err)
			return
		}
		http.Redirect(w, r, st.ReturnTo, http.StatusFound)
	}
}

// devLogin exists only with APP_ENV=dev (main refuses dev against a non-local DB).
func (s *Server) devLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
		Admin bool   `json:"admin"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	aud := audApp
	if in.Admin {
		if !s.allowed(in.Email) {
			apiError(w, 403, "forbidden", "Not in ADMIN_EMAILS", nil)
			return
		}
		aud = audAdmin
	}
	u, err := s.loginOrSignup(r.Context(), "google", "dev:"+in.Email, in.Email, strings.Split(in.Email, "@")[0], nil)
	if err != nil {
		internalError(w, r, err)
		return
	}
	if err := s.createSession(r.Context(), w, r, u.ID, aud); err != nil {
		internalError(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	se := sessionFrom(r)
	out := map[string]any{
		"user":     map[string]any{"id": se.UserID, "email": se.Email, "name": se.Name, "avatar_url": se.AvatarURL},
		"business": nil,
	}
	b, err := s.Q.MyBusiness(r.Context(), se.UserID)
	if err == nil {
		out["business"] = map[string]any{"id": b.ID, "status": b.Status, "onboarding_step": b.OnboardingStep,
			"trade_name": b.TradeName, "review_note": b.ReviewNote, "logo_id": b.LogoID}
	} else if !notFound(err) {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) adminMe(w http.ResponseWriter, r *http.Request) {
	se := sessionFrom(r)
	writeJSON(w, 200, map[string]any{"email": se.Email, "name": se.Name})
}
