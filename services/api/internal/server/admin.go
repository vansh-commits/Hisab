package server

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"hisab/internal/db"
)

func optParam(r *http.Request, k string) *string {
	if v := strings.TrimSpace(r.URL.Query().Get(k)); v != "" {
		return &v
	}
	return nil
}

// listBusinesses serves both the waitlist queue and the clients list (same table, status filter).
// Cursor = "<applied_at RFC3339Nano>_<id>" of the last row.
func (s *Server) listBusinesses(w http.ResponseWriter, r *http.Request) {
	p := db.ListApplicationsParams{Status: optParam(r, "status"), Q: optParam(r, "q")}
	if c := optParam(r, "cursor"); c != nil {
		at, id, ok := strings.Cut(*c, "_")
		t, err := time.Parse(time.RFC3339Nano, at)
		if !ok || err != nil {
			apiError(w, 400, "bad_cursor", "Invalid cursor", nil)
			return
		}
		p.CursorAt, p.CursorID = &t, &id
	}
	rows, err := s.Q.ListApplications(r.Context(), p)
	if err != nil {
		internalError(w, r, err)
		return
	}
	var next *string
	if len(rows) == 50 {
		last := rows[len(rows)-1]
		next = ptr(last.AppliedAt.Format(time.RFC3339Nano) + "_" + last.ID)
	}
	if rows == nil {
		rows = []db.ListApplicationsRow{}
	}
	writeJSON(w, 200, map[string]any{"items": rows, "next_cursor": next})
}

func (s *Server) review(status string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Note string `json:"note"`
		}
		if !decode(w, r, &in) {
			return
		}
		se := sessionFrom(r)
		id := r.PathValue("id")
		note := strings.TrimSpace(in.Note)
		var b db.BusinessWithOwnerRow
		err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
			q := s.Q.WithTx(tx)
			var notePtr *string
			if note != "" {
				notePtr = &note
			}
			if _, err := q.ReviewBusiness(r.Context(), db.ReviewBusinessParams{ID: id, Status: status, Reviewer: &se.Email, Note: notePtr}); err != nil {
				return err
			}
			var err error
			if b, err = q.BusinessWithOwner(r.Context(), id); err != nil {
				return err
			}
			return audit(r.Context(), q, r, "business."+status, id, map[string]any{"note": note})
		})
		if notFound(err) {
			apiError(w, 409, "not_reviewable", "Application not found or already approved", nil)
			return
		} else if err != nil {
			internalError(w, r, err)
			return
		}
		sent := s.sendStatusEmail(r, b)
		writeJSON(w, 200, map[string]any{
			"business":   map[string]any{"id": b.ID, "status": b.Status, "reviewed_at": b.ReviewedAt},
			"email_sent": sent,
		})
	}
}

// sendStatusEmail mails the owner about the current status and audits a failure,
// so the admin queue can show it and offer "resend".
func (s *Server) sendStatusEmail(r *http.Request, b db.BusinessWithOwnerRow) bool {
	if b.OwnerEmail == nil {
		return false
	}
	note := ""
	if b.ReviewNote != nil {
		note = *b.ReviewNote
	}
	m := mailReceived(b.ApplicantOwnerName, b.ApplicantBusinessName, s.Cfg.AppOrigin)
	switch b.Status {
	case "approved", "active":
		m = mailApproved(b.ApplicantOwnerName, s.Cfg.AppOrigin)
	case "rejected":
		m = mailRejected(b.ApplicantOwnerName, note, s.Cfg.AppOrigin)
	}
	sent := s.mail(r.Context(), *b.OwnerEmail, m)
	action := "email.sent"
	if !sent {
		action = "email.failed"
	}
	_ = audit(r.Context(), s.Q, r, action, b.ID, map[string]any{"subject": m.Subject})
	return sent
}

func (s *Server) resendEmail(w http.ResponseWriter, r *http.Request) {
	b, err := s.Q.BusinessWithOwner(r.Context(), r.PathValue("id"))
	if notFound(err) {
		apiError(w, 404, "not_found", "Not found", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"email_sent": s.sendStatusEmail(r, b)})
}

func (s *Server) clientDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	b, err := s.Q.BusinessWithOwner(r.Context(), id)
	if notFound(err) {
		apiError(w, 404, "not_found", "Not found", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	var lastActive *time.Time
	if t, err := s.Q.LastActive(r.Context(), id); err == nil {
		lastActive = &t
	} else if !notFound(err) {
		internalError(w, r, err)
		return
	}
	logs, err := s.Q.ListAudit(r.Context(), db.ListAuditParams{BusinessID: &id})
	if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"business": b, "last_active": lastActive, "audit": nonNil(logs)})
}

func (s *Server) suspend(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Reason) == "" {
		apiError(w, 422, "validation_failed", "Reason is required", map[string]string{"reason": "required"})
		return
	}
	s.setStatus(w, r, "business.suspended", in.Reason, func(q *db.Queries, id string) (db.Business, error) {
		return q.SuspendBusiness(r.Context(), db.SuspendBusinessParams{ID: id, SuspendReason: &in.Reason})
	})
}

func (s *Server) reactivate(w http.ResponseWriter, r *http.Request) {
	s.setStatus(w, r, "business.reactivated", "", func(q *db.Queries, id string) (db.Business, error) {
		return q.ReactivateBusiness(r.Context(), id)
	})
}

func (s *Server) setStatus(w http.ResponseWriter, r *http.Request, action, reason string, fn func(*db.Queries, string) (db.Business, error)) {
	id := r.PathValue("id")
	var b db.Business
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		var err error
		if b, err = fn(q, id); err != nil {
			return err
		}
		return audit(r.Context(), q, r, action, id, map[string]any{"reason": reason})
	})
	if notFound(err) {
		apiError(w, 409, "invalid_status", "Not found or not in a state that allows this", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"business": map[string]any{"id": b.ID, "status": b.Status}})
}

const dbCapBytes = 1 << 30 // Neon free tier

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	counts, err := s.Q.CountByStatus(r.Context())
	if err != nil {
		internalError(w, r, err)
		return
	}
	size, err := s.Q.DBSize(r.Context())
	if err != nil {
		internalError(w, r, err)
		return
	}
	byStatus := map[string]int64{}
	for _, c := range counts {
		byStatus[c.Status] = c.Count
	}
	issued := map[string]int64{}
	for _, days := range []int{7, 30} {
		n, err := s.Q.InvoicesIssuedSince(r.Context(), ptr(time.Now().AddDate(0, 0, -days)))
		if err != nil {
			internalError(w, r, err)
			return
		}
		issued[strconv.Itoa(days)+"d"] = n
	}
	writeJSON(w, 200, map[string]any{"by_status": byStatus, "db_size_bytes": size, "db_cap_bytes": dbCapBytes, "invoices_issued": issued})
}

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	p := db.ListAuditParams{BusinessID: optParam(r, "business_id"), Action: optParam(r, "action")}
	if c := optParam(r, "cursor"); c != nil {
		n, err := strconv.ParseInt(*c, 10, 64)
		if err != nil {
			apiError(w, 400, "bad_cursor", "Invalid cursor", nil)
			return
		}
		p.Cursor = &n
	}
	rows, err := s.Q.ListAudit(r.Context(), p)
	if err != nil {
		internalError(w, r, err)
		return
	}
	var next *string
	if len(rows) == 50 {
		next = ptr(strconv.FormatInt(rows[len(rows)-1].ID, 10))
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows), "next_cursor": next})
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
