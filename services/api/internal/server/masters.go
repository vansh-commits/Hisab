package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"hisab/internal/db"
)

var panRe = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]$`)

// ── parties ──────────────────────────────────────────────────────────────

func cleanParty(p *db.CreatePartyParams, k string, f map[string]string) {
	p.Name, p.BillAddress = strings.TrimSpace(p.Name), strings.TrimSpace(p.BillAddress)
	if p.Name == "" || len(p.Name) > 120 {
		f[k+"name"] = "required (max 120 characters)"
	}
	p.Phone, p.Email, p.BillStateCode = clean(p.Phone), clean(p.Email), clean(p.BillStateCode)
	if p.Pan = upper(p.Pan); p.Pan != nil && !panRe.MatchString(*p.Pan) {
		f[k+"pan"] = "PAN looks like ABCDE1234F"
	}
	checkGSTIN(&p.Gstin, &p.BillStateCode, f, k)
	if p.ShipSameAsBill {
		p.ShipName, p.ShipAddress, p.ShipStateCode = nil, nil, nil
	} else {
		p.ShipName, p.ShipAddress, p.ShipStateCode = clean(p.ShipName), clean(p.ShipAddress), clean(p.ShipStateCode)
	}
}

func newParty() db.CreatePartyParams { return db.CreatePartyParams{ShipSameAsBill: true} }

func (s *Server) listParties(w http.ResponseWriter, r *http.Request) {
	p := db.ListPartiesParams{BusinessID: bizFrom(r).ID, Q: clean(ptr(r.URL.Query().Get("q")))}
	if c := r.URL.Query().Get("cursor"); c != "" {
		i := strings.LastIndex(c, "|")
		if i < 0 {
			invalid(w, map[string]string{"cursor": "invalid"})
			return
		}
		p.AfterName, p.AfterID = ptr(c[:i]), ptr(c[i+1:])
	}
	rows, err := s.Q.ListParties(r.Context(), p)
	if notFound(err) { // malformed cursor uuid
		invalid(w, map[string]string{"cursor": "invalid"})
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	var next *string
	if len(rows) == 50 {
		last := rows[len(rows)-1]
		next = ptr(last.Name + "|" + last.ID)
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows), "next_cursor": next})
}

func (s *Server) createParty(w http.ResponseWriter, r *http.Request) {
	p := newParty()
	if !decode(w, r, &p) {
		return
	}
	p.BusinessID = bizFrom(r).ID
	f := map[string]string{}
	if cleanParty(&p, "", f); invalid(w, f) {
		return
	}
	out, err := s.Q.CreateParty(r.Context(), p)
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 201, out)
}

// bulkParties: onboarding "add several", all or nothing.
func (s *Server) bulkParties(w http.ResponseWriter, r *http.Request) {
	var raw []json.RawMessage
	if !decode(w, r, &raw) {
		return
	}
	ps, f := make([]db.CreatePartyParams, len(raw)), map[string]string{}
	for i := range raw {
		ps[i] = newParty()
		if err := strict(raw[i], &ps[i]); err != nil {
			f[fmt.Sprintf("[%d]", i)] = err.Error()
		}
		ps[i].BusinessID = bizFrom(r).ID
		cleanParty(&ps[i], fmt.Sprintf("[%d].", i), f)
	}
	if invalid(w, f) {
		return
	}
	out := make([]db.Party, 0, len(ps))
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		for _, p := range ps {
			row, err := q.CreateParty(r.Context(), p)
			if err != nil {
				return err
			}
			out = append(out, row)
		}
		return nil
	})
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 201, map[string]any{"items": out})
}

func (s *Server) getParty(w http.ResponseWriter, r *http.Request) {
	p, err := s.Q.GetParty(r.Context(), db.GetPartyParams{ID: r.PathValue("id"), BusinessID: bizFrom(r).ID})
	if !found(w, r, err) {
		return
	}
	writeJSON(w, 200, p)
}

func (s *Server) patchParty(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	cur, err := s.Q.GetParty(r.Context(), db.GetPartyParams{ID: r.PathValue("id"), BusinessID: b.ID})
	if !found(w, r, err) {
		return
	}
	var p db.CreatePartyParams
	if !overlay(w, r, cur, &p) {
		return
	}
	f := map[string]string{}
	if cleanParty(&p, "", f); invalid(w, f) {
		return
	}
	var up db.UpdatePartyParams
	copyJSON(p, &up)
	up.ID, up.BusinessID = cur.ID, b.ID
	out, err := s.Q.UpdateParty(r.Context(), up)
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}

// ── items ────────────────────────────────────────────────────────────────

func cleanItem(p *db.CreateItemParams, k string, f map[string]string) {
	if p.Name = strings.TrimSpace(p.Name); p.Name == "" || len(p.Name) > 120 {
		f[k+"name"] = "required (max 120 characters)"
	}
	p.Hsn, p.Purity, p.Metal, p.MakingMode = clean(p.Hsn), clean(p.Purity), clean(p.Metal), clean(p.MakingMode)
	if (p.MakingMode == nil) != (p.MakingValue == nil) {
		f[k+"making_value"] = "set both making mode and value, or neither"
	}
}

func newItem() db.CreateItemParams { return db.CreateItemParams{Unit: "g", GstRate: 3000} }

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Q.ListItems(r.Context(), db.ListItemsParams{BusinessID: bizFrom(r).ID, Q: clean(ptr(r.URL.Query().Get("q")))})
	if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows)}) // ponytail: no paging, 200 items is plenty for one shop
}

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	p := newItem()
	if !decode(w, r, &p) {
		return
	}
	p.BusinessID = bizFrom(r).ID
	f := map[string]string{}
	if cleanItem(&p, "", f); invalid(w, f) {
		return
	}
	out, err := s.Q.CreateItem(r.Context(), p)
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 201, out)
}

func (s *Server) bulkItems(w http.ResponseWriter, r *http.Request) {
	var raw []json.RawMessage
	if !decode(w, r, &raw) {
		return
	}
	ps, f := make([]db.CreateItemParams, len(raw)), map[string]string{}
	for i := range raw {
		ps[i] = newItem()
		if err := strict(raw[i], &ps[i]); err != nil {
			f[fmt.Sprintf("[%d]", i)] = err.Error()
		}
		ps[i].BusinessID = bizFrom(r).ID
		cleanItem(&ps[i], fmt.Sprintf("[%d].", i), f)
	}
	if invalid(w, f) {
		return
	}
	out := make([]db.Item, 0, len(ps))
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		for _, p := range ps {
			row, err := q.CreateItem(r.Context(), p)
			if err != nil {
				return err
			}
			out = append(out, row)
		}
		return nil
	})
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 201, map[string]any{"items": out})
}

func (s *Server) patchItem(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	cur, err := s.Q.GetItem(r.Context(), db.GetItemParams{ID: r.PathValue("id"), BusinessID: b.ID})
	if !found(w, r, err) {
		return
	}
	var p db.CreateItemParams
	if !overlay(w, r, cur, &p) {
		return
	}
	f := map[string]string{}
	if cleanItem(&p, "", f); invalid(w, f) {
		return
	}
	var up db.UpdateItemParams
	copyJSON(p, &up)
	up.ID, up.BusinessID = cur.ID, b.ID
	out, err := s.Q.UpdateItem(r.Context(), up)
	if dbInvalid(w, err) {
		return
	} else if err != nil {
		internalError(w, r, err)
		return
	}
	writeJSON(w, 200, out)
}

// ── shared ───────────────────────────────────────────────────────────────

// found writes 404/500 and returns false when err isn't nil.
func found(w http.ResponseWriter, r *http.Request, err error) bool {
	if notFound(err) {
		apiError(w, 404, "not_found", "Not found", nil)
		return false
	} else if err != nil {
		internalError(w, r, err)
		return false
	}
	return true
}

// remove deletes the row, or archives it when invoices/payments still reference it (FK violation).
func (s *Server) remove(del, archive func(*http.Request, string, string) (int64, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, biz := r.PathValue("id"), bizFrom(r).ID
		n, err := del(r, id, biz)
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23503" {
			n, err = archive(r, id, biz)
		}
		if err == nil && n == 0 {
			err = pgx.ErrNoRows
		}
		if !found(w, r, err) {
			return
		}
		w.WriteHeader(204)
	}
}

func (s *Server) deleteParty() http.HandlerFunc {
	return s.remove(
		func(r *http.Request, id, biz string) (int64, error) {
			return s.Q.DeleteParty(r.Context(), db.DeletePartyParams{ID: id, BusinessID: biz})
		},
		func(r *http.Request, id, biz string) (int64, error) {
			return s.Q.ArchiveParty(r.Context(), db.ArchivePartyParams{ID: id, BusinessID: biz})
		})
}

func (s *Server) deleteItem() http.HandlerFunc {
	return s.remove(
		func(r *http.Request, id, biz string) (int64, error) {
			return s.Q.DeleteItem(r.Context(), db.DeleteItemParams{ID: id, BusinessID: biz})
		},
		func(r *http.Request, id, biz string) (int64, error) {
			return s.Q.ArchiveItem(r.Context(), db.ArchiveItemParams{ID: id, BusinessID: biz})
		})
}

// strict decodes one bulk row with the same rules as decode (unknown fields rejected).
func strict(raw json.RawMessage, dst any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
