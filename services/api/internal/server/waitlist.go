package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"hisab/internal/db"
	"hisab/internal/email"
	"hisab/internal/gstin"
)

type application struct {
	BusinessName string  `json:"business_name"`
	OwnerName    string  `json:"owner_name"`
	Phone        string  `json:"phone"`
	City         string  `json:"city"`
	GSTIN        *string `json:"gstin"`
}

var mobileRe = regexp.MustCompile(`^[6-9][0-9]{9}$`)

// clean normalises and validates; the returned map is the 422 "fields" body.
func (a *application) clean() map[string]string {
	f := map[string]string{}
	a.BusinessName, a.OwnerName, a.City = strings.TrimSpace(a.BusinessName), strings.TrimSpace(a.OwnerName), strings.TrimSpace(a.City)
	for k, v := range map[string]string{"business_name": a.BusinessName, "owner_name": a.OwnerName, "city": a.City} {
		if v == "" {
			f[k] = "required"
		} else if len(v) > 120 {
			f[k] = "too long"
		}
	}
	p := strings.NewReplacer(" ", "", "-", "").Replace(a.Phone)
	p = strings.TrimPrefix(strings.TrimPrefix(p, "+91"), "0")
	if !mobileRe.MatchString(p) {
		f["phone"] = "enter a 10-digit mobile number"
	}
	a.Phone = "+91" + p
	if a.GSTIN != nil {
		g := gstin.Normalize(*a.GSTIN)
		if g == "" {
			a.GSTIN = nil
		} else if err := gstin.Validate(g); err != nil {
			f["gstin"] = err.Error()
		} else {
			a.GSTIN = &g
		}
	}
	return f
}

func (s *Server) applyWaitlist(w http.ResponseWriter, r *http.Request) {
	se := sessionFrom(r)
	var in application
	if !decode(w, r, &in) {
		return
	}
	if f := in.clean(); len(f) > 0 {
		apiError(w, 422, "validation_failed", "Please fix the highlighted fields", f)
		return
	}
	var b db.Business
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if _, err := q.MyBusiness(r.Context(), se.UserID); err == nil {
			return errAlreadyApplied
		} else if !notFound(err) {
			return err
		}
		var err error
		b, err = q.CreateApplication(r.Context(), db.CreateApplicationParams{ApplicantBusinessName: in.BusinessName,
			ApplicantOwnerName: in.OwnerName, ApplicantPhone: in.Phone, ApplicantCity: in.City, ApplicantGstin: in.GSTIN})
		if err != nil {
			return err
		}
		if err := q.CreateMembership(r.Context(), db.CreateMembershipParams{BusinessID: b.ID, UserID: se.UserID}); err != nil {
			return err
		}
		return audit(r.Context(), q, r, "waitlist.applied", b.ID, in)
	})
	if errors.Is(err, errAlreadyApplied) {
		apiError(w, 409, "already_applied", "You have already applied", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	s.mail(r.Context(), se.Email, mailReceived(in.OwnerName, in.BusinessName, s.Cfg.AppOrigin))
	writeJSON(w, 201, map[string]any{"business": map[string]any{"id": b.ID, "status": b.Status}})
}

var errAlreadyApplied = errors.New("already applied")

func applicationJSON(b db.Business) map[string]any {
	return map[string]any{"id": b.ID, "status": b.Status, "business_name": b.ApplicantBusinessName,
		"owner_name": b.ApplicantOwnerName, "phone": b.ApplicantPhone, "city": b.ApplicantCity,
		"gstin": b.ApplicantGstin, "applied_at": b.AppliedAt, "review_note": b.ReviewNote}
}

func (s *Server) getWaitlist(w http.ResponseWriter, r *http.Request) {
	b, err := s.Q.MyBusiness(r.Context(), sessionFrom(r).UserID)
	if notFound(err) {
		apiError(w, 404, "not_found", "No application yet", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"application": applicationJSON(b)})
}

func (s *Server) updateWaitlist(w http.ResponseWriter, r *http.Request) {
	se := sessionFrom(r)
	var in application
	if !decode(w, r, &in) {
		return
	}
	if f := in.clean(); len(f) > 0 {
		apiError(w, 422, "validation_failed", "Please fix the highlighted fields", f)
		return
	}
	var b db.Business
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		mine, err := q.MyBusiness(r.Context(), se.UserID)
		if err != nil {
			return err
		}
		b, err = q.UpdateApplication(r.Context(), db.UpdateApplicationParams{ID: mine.ID, ApplicantBusinessName: in.BusinessName,
			ApplicantOwnerName: in.OwnerName, ApplicantPhone: in.Phone, ApplicantCity: in.City, ApplicantGstin: in.GSTIN})
		if err != nil {
			return err
		}
		return audit(r.Context(), q, r, "waitlist.updated", b.ID, in)
	})
	if notFound(err) {
		apiError(w, 409, "not_editable", "This application can no longer be edited", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"application": applicationJSON(b)})
}

// ── email ────────────────────────────────────────────────────────────────

// mail sends and logs a failure; callers that report email_sent use the bool.
func (s *Server) mail(ctx context.Context, to string, m email.Message) bool {
	m.To = to
	if err := s.Send(ctx, m); err != nil {
		slog.Error("email failed", "subject", m.Subject, "err", err)
		return false
	}
	return true
}

const mailFooter = "\n\nIf our emails land in Spam, please mark Hisab as \"Not spam\" so you don't miss updates.\n\nTeam Hisab\n"

func mailReceived(owner, business, origin string) email.Message {
	return email.Message{Subject: "We received your Hisab application",
		Text: fmt.Sprintf("Namaste %s,\n\nThank you for applying to Hisab for %s. We review every application ourselves and will email you here once it is approved.%s%s", owner, business, mailFooter, origin)}
}

func mailApproved(owner, origin string) email.Message {
	return email.Message{Subject: "Your Hisab account is approved",
		Text: fmt.Sprintf("Namaste %s,\n\nGood news: your Hisab account is approved. Log in to set up your business and create your first bill:\n%s/login%s", owner, origin, mailFooter)}
}

func mailRejected(owner, note, origin string) email.Message {
	n := ""
	if note != "" {
		n = "\n\nNote from our team: " + note
	}
	return email.Message{Subject: "Update on your Hisab application",
		Text: fmt.Sprintf("Namaste %s,\n\nWe could not approve your Hisab application yet.%s\n\nYou can edit your details and apply again here:\n%s/login%s", owner, n, origin, mailFooter)}
}
