package server

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"hisab/internal/db"
	"hisab/internal/gstin"
)

// Status sets for tenant(): rw may edit; ro may also be suspended (read-only access to old data).
const (
	rw = "approved active"
	ro = "approved active suspended"
)

type bizKey struct{}

// tenant = app session + membership + status gate. Handlers take business_id only from here, never from the request.
func (s *Server) tenant(statuses string, next http.HandlerFunc) http.HandlerFunc {
	return s.session(audApp, func(w http.ResponseWriter, r *http.Request) {
		b, err := s.Q.MyBusiness(r.Context(), sessionFrom(r).UserID)
		if notFound(err) {
			apiError(w, 403, "no_business", "Join the waitlist first", nil)
			return
		} else if err != nil {
			internalError(w, r, err)
			return
		}
		if !slices.Contains(strings.Fields(statuses), b.Status) {
			apiError(w, 403, "status_"+b.Status, "Not available for a "+b.Status+" account", nil)
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), bizKey{}, &b)))
	})
}

func bizFrom(r *http.Request) *db.Business { return r.Context().Value(bizKey{}).(*db.Business) }

// ── helpers ──────────────────────────────────────────────────────────────

// overlay copies cur into dst via JSON (same field names), then decodes the request body on top: a partial PATCH.
func overlay(w http.ResponseWriter, r *http.Request, cur, dst any) bool {
	copyJSON(cur, dst)
	return decode(w, r, dst)
}

func copyJSON(src, dst any) {
	b, _ := json.Marshal(src)
	_ = json.Unmarshal(b, dst)
}

// clean trims a nullable string; empty becomes nil.
func clean(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func upper(p *string) *string {
	if p = clean(p); p != nil {
		*p = strings.ToUpper(*p)
	}
	return p
}

// normMobile accepts "98765 43210", "+91-98765-43210", "098765…" → "+919876543210".
func normMobile(raw string) (string, bool) {
	p := strings.NewReplacer(" ", "", "-", "").Replace(raw)
	p = strings.TrimPrefix(strings.TrimPrefix(p, "+91"), "0")
	return "+91" + p, mobileRe.MatchString(p)
}

// checkGSTIN normalises *g, validates it and fills/compares the state code.
func checkGSTIN(g, state **string, f map[string]string, prefix string) {
	*g = upper(*g)
	if *g == nil {
		return
	}
	if err := gstin.Validate(**g); err != nil {
		f[prefix+"gstin"] = err.Error()
		return
	}
	sc := gstin.StateCode(**g)
	if *state == nil {
		*state = &sc
	} else if **state != sc {
		f[prefix+"gstin"] = "GSTIN state (" + sc + ") doesn't match the selected state"
	}
}

// dbInvalid turns a constraint violation into a 422; the DB is the last line of validation.
func dbInvalid(w http.ResponseWriter, err error) bool {
	var pe *pgconn.PgError
	if !errors.As(err, &pe) || !slices.Contains([]string{"23514", "23503", "23505", "23502", "22001"}, pe.Code) {
		return false
	}
	field := strings.TrimPrefix(pe.ConstraintName, pe.TableName+"_")
	for _, suf := range []string{"_check", "_fkey", "_key"} {
		field = strings.TrimSuffix(field, suf)
	}
	var f map[string]string
	if field != "" && field != pe.ConstraintName && !strings.HasPrefix(field, "check") && !strings.HasPrefix(field, "regular") {
		f = map[string]string{field: "invalid value"}
	}
	apiError(w, 422, "validation_failed", "Please check the highlighted fields", f)
	return true
}

func invalid(w http.ResponseWriter, f map[string]string) bool {
	if len(f) == 0 {
		return false
	}
	apiError(w, 422, "validation_failed", "Please fix the highlighted fields", f)
	return true
}

// ── numbering ────────────────────────────────────────────────────────────

var ist = time.FixedZone("IST", 5*3600+1800)

// fyStart: FY 2026-27 → 2026 (April–March, IST).
func fyStart(t time.Time) int {
	t = t.In(ist)
	if t.Month() < time.April {
		return t.Year() - 1
	}
	return t.Year()
}

// docNumber formats "SJ/" + "26-27/" + "0148". Phase 4's issue transaction uses the same function.
func docNumber(st db.BusinessSetting, fy int, n int32) string {
	s := st.InvoicePrefix
	if st.IncludeFy {
		s += fmt.Sprintf("%02d-%02d/", fy%100, (fy+1)%100)
	}
	return s + fmt.Sprintf("%0*d", st.NumberMinDigits, n)
}

func seriesKey(st db.BusinessSetting, fy int) int16 {
	if st.FyReset {
		return int16(fy)
	}
	return 0
}

const maxDocNo = 16 // GST Rule 46(b)

// ── business profile ─────────────────────────────────────────────────────

func (s *Server) getBusiness(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, bizFrom(r))
}

func (s *Server) patchBusiness(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	var p db.UpdateProfileParams
	if !overlay(w, r, b, &p) {
		return
	}
	p.ID = b.ID
	f := map[string]string{}
	for _, v := range []**string{&p.LegalName, &p.TradeName, &p.AddressLine1, &p.AddressLine2, &p.City, &p.Pincode, &p.Email} {
		*v = clean(*v)
	}
	p.RegistrationType, p.StateCode, p.UdyamNo = clean(p.RegistrationType), clean(p.StateCode), upper(p.UdyamNo)
	if p.RegistrationType != nil && *p.RegistrationType == "unregistered" {
		p.Gstin = nil
	}
	checkGSTIN(&p.Gstin, &p.StateCode, f, "")
	if p.Phone = clean(p.Phone); p.Phone != nil {
		if n, ok := normMobile(*p.Phone); ok {
			p.Phone = &n
		} else {
			f["phone"] = "enter a 10-digit mobile number"
		}
	}
	if invalid(w, f) {
		return
	}
	out, err := s.Q.UpdateProfile(r.Context(), p)
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) putLogo(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	file, _, err := r.FormFile("file")
	if err != nil {
		apiError(w, 422, "validation_failed", "Upload a PNG, JPEG or WebP under 200 KB", map[string]string{"file": "required"})
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, 204801))
	if err != nil || len(data) > 204800 {
		apiError(w, 422, "validation_failed", "Logo must be under 200 KB", map[string]string{"file": "too large"})
		return
	}
	ct := http.DetectContentType(data)
	if !slices.Contains([]string{"image/png", "image/jpeg", "image/webp"}, ct) {
		apiError(w, 422, "validation_failed", "Upload a PNG, JPEG or WebP image", map[string]string{"file": "unsupported type"})
		return
	}
	sum := sha256.Sum256(data)
	var id string
	err = pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if id, err = q.UpsertLogo(r.Context(), db.UpsertLogoParams{BusinessID: b.ID, Sha256: sum[:], ContentType: ct, Data: data}); err != nil {
			return err
		}
		return q.SetLogo(r.Context(), db.SetLogoParams{ID: b.ID, LogoID: &id})
	})
	if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]string{"logo_id": id})
}

// deleteLogo only unlinks: issued invoices keep pointing at the old logo row (Phase 4 snapshots).
func (s *Server) deleteLogo(w http.ResponseWriter, r *http.Request) {
	if err := s.Q.SetLogo(r.Context(), db.SetLogoParams{ID: bizFrom(r).ID}); err != nil {
		internalError(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *Server) getLogo(w http.ResponseWriter, r *http.Request) {
	l, err := s.Q.GetLogo(r.Context(), db.GetLogoParams{ID: r.PathValue("id"), BusinessID: bizFrom(r).ID})
	if notFound(err) {
		apiError(w, 404, "not_found", "Logo not found", nil)
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", l.ContentType)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	_, _ = w.Write(l.Data)
}

// ── settings & numbering ─────────────────────────────────────────────────

type settingsOut struct {
	db.BusinessSetting
	NextNo  int32  `json:"next_no"`
	Preview string `json:"preview"`
}

func (s *Server) loadSettings(ctx context.Context, q *db.Queries, bizID string) (settingsOut, error) {
	if err := q.EnsureSettings(ctx, bizID); err != nil {
		return settingsOut{}, err
	}
	st, err := q.GetSettings(ctx, bizID)
	if err != nil {
		return settingsOut{}, err
	}
	fy := fyStart(time.Now())
	n, err := q.NextNo(ctx, db.NextNoParams{BusinessID: bizID, DocType: "invoice", SeriesKey: seriesKey(st, fy)})
	if notFound(err) {
		n, err = 1, nil
	}
	return settingsOut{st, n, docNumber(st, fy, n)}, err
}

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	out, err := s.loadSettings(r.Context(), s.Q, bizFrom(r).ID)
	if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) patchSettings(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	cur, err := s.loadSettings(r.Context(), s.Q, b.ID)
	if err != nil {
		internalError(w, r, err)
		return
	}
	var p db.UpdateSettingsParams
	if !overlay(w, r, cur.BusinessSetting, &p) {
		return
	}
	p.BusinessID = b.ID
	p.InvoicePrefix = strings.TrimSpace(p.InvoicePrefix)
	p.BankIfsc, p.UpiID = upper(p.BankIfsc), clean(p.UpiID)
	for _, v := range []**string{&p.BankName, &p.BankAccountName, &p.BankAccountNo, &p.BankBranch} {
		*v = clean(*v)
	}
	if len(p.TemplateConfig) == 0 || string(p.TemplateConfig) == "null" {
		p.TemplateConfig = json.RawMessage("{}")
	}
	f := map[string]string{}
	var next db.BusinessSetting
	copyJSON(p, &next)
	if n := docNumber(next, fyStart(time.Now()), cur.NextNo); len(n) > maxDocNo {
		f["invoice_prefix"] = fmt.Sprintf("Bill number %q is longer than %d characters", n, maxDocNo)
	}
	if invalid(w, f) {
		return
	}
	if _, err := s.Q.UpdateSettings(r.Context(), p); dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	s.getSettings(w, r)
}

// putNumberSeries sets the next invoice number for the current series ("purani bill book ka agla number").
// ponytail: Phase 4 adds the "no invoice issued in this series yet" guard once the invoices table exists.
func (s *Server) putNumberSeries(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	var in struct {
		StartingNo int32 `json:"starting_no"`
	}
	if !decode(w, r, &in) {
		return
	}
	cur, err := s.loadSettings(r.Context(), s.Q, b.ID)
	if err != nil {
		internalError(w, r, err)
		return
	}
	fy := fyStart(time.Now())
	if in.StartingNo < 1 || in.StartingNo > 99999999 {
		invalid(w, map[string]string{"starting_no": "must be between 1 and 99999999"})
		return
	} else if n := docNumber(cur.BusinessSetting, fy, in.StartingNo); len(n) > maxDocNo {
		invalid(w, map[string]string{"starting_no": fmt.Sprintf("Bill number %q is longer than %d characters", n, maxDocNo)})
		return
	}
	err = pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if err := q.SetNextNo(r.Context(), db.SetNextNoParams{BusinessID: b.ID, DocType: "invoice",
			SeriesKey: seriesKey(cur.BusinessSetting, fy), NextNo: in.StartingNo}); err != nil {
			return err
		}
		return audit(r.Context(), q, r, "settings.number_series", b.ID, in)
	})
	if err != nil {
		internalError(w, r, err)
		return
	}
	s.getSettings(w, r)
}

// ── metal rates ──────────────────────────────────────────────────────────

func (s *Server) getRates(w http.ResponseWriter, r *http.Request) {
	rates, err := s.Q.ListRates(r.Context(), bizFrom(r).ID)
	if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rates)})
}

// putRates replaces the whole board.
func (s *Server) putRates(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	var in []db.InsertRateParams
	if !decode(w, r, &in) {
		return
	}
	f, seen := map[string]string{}, map[string]bool{}
	for i := range in {
		in[i].BusinessID, in[i].Metal = b.ID, strings.TrimSpace(in[i].Metal)
		k := fmt.Sprintf("[%d].", i)
		if in[i].Metal == "" || len(in[i].Metal) > 20 || seen[strings.ToLower(in[i].Metal)] {
			f[k+"metal"] = "enter a unique name"
		}
		if in[i].RatePaise <= 0 {
			f[k+"rate_paise"] = "must be more than 0"
		}
		seen[strings.ToLower(in[i].Metal)] = true
	}
	if invalid(w, f) {
		return
	}
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if err := q.DeleteRates(r.Context(), b.ID); err != nil {
			return err
		}
		for _, p := range in {
			if err := q.InsertRate(r.Context(), p); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		internalError(w, r, err)
		return
	}
	s.getRates(w, r)
}

// ── onboarding ───────────────────────────────────────────────────────────

const lastStep = 11

// missing lists what onboarding/complete still needs. Optional steps never appear here.
func missing(b *db.Business) map[string]string {
	f := map[string]string{}
	for k, v := range map[string]*string{"registration_type": b.RegistrationType, "legal_name": b.LegalName,
		"address_line1": b.AddressLine1, "city": b.City, "state_code": b.StateCode} {
		if v == nil {
			f[k] = "required"
		}
	}
	if b.RegistrationType != nil && *b.RegistrationType != "unregistered" && b.Gstin == nil {
		f["gstin"] = "required for registered businesses"
	}
	return f
}

func (s *Server) getOnboarding(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	writeJSON(w, 200, map[string]any{"step": b.OnboardingStep, "status": b.Status, "missing": missing(b)})
}

func (s *Server) patchOnboarding(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Step int16 `json:"step"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Step < 0 || in.Step > lastStep {
		invalid(w, map[string]string{"step": "out of range"})
		return
	}
	if err := s.Q.SetOnboardingStep(r.Context(), db.SetOnboardingStepParams{ID: bizFrom(r).ID, OnboardingStep: in.Step}); err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"step": in.Step})
}

func (s *Server) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	if f := missing(b); len(f) > 0 {
		apiError(w, 422, "incomplete", "A few required details are missing", f)
		return
	}
	var out db.Business
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if err := q.EnsureSettings(r.Context(), b.ID); err != nil {
			return err
		}
		var err error
		if out, err = q.CompleteOnboarding(r.Context(), b.ID); err != nil {
			return err
		}
		return audit(r.Context(), q, r, "business.onboarded", b.ID, nil)
	})
	if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}

func (s *Server) listStates(w http.ResponseWriter, r *http.Request) {
	st, err := s.Q.ListStates(r.Context())
	if err != nil {
		internalError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	writeJSON(w, 200, map[string]any{"items": st})
}
