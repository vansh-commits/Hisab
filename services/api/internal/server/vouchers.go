package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"hisab/internal/db"
	"hisab/internal/inr"
	"hisab/internal/pdf"
	"hisab/internal/tax"
)

// ── old gold purchase vouchers (standalone; exchange vouchers are created by issue) ──

type voucherBody struct {
	VoucherDate string          `json:"voucher_date"`
	PartyID     *string         `json:"party_id"`
	Seller      partyIn         `json:"seller"`
	SellerKind  string          `json:"seller_kind"`
	Settlement  string          `json:"settlement"`
	PaidMode    *string         `json:"paid_mode"`
	Lines       []oldGoldLineIn `json:"lines"`
}

func oldGoldCompute(lines []oldGoldLineIn) (tax.OldGoldResult, map[string]string) {
	f := map[string]string{}
	var tl []tax.OldGoldLine
	for i := range lines {
		l, k := &lines[i], fmt.Sprintf("lines[%d].", i)
		if l.Description = strings.TrimSpace(l.Description); l.Description == "" {
			l.Description = "Old gold"
		}
		l.Purity = clean(l.Purity)
		if l.LessWeightMg < 0 || l.GrossWeightMg-l.LessWeightMg <= 0 {
			f[k+"gross_weight_mg"] = "net weight must be more than 0"
		}
		if l.RatePaise <= 0 {
			f[k+"rate_paise"] = "must be more than 0"
		}
		tl = append(tl, tax.OldGoldLine{GrossMg: l.GrossWeightMg, LessMg: l.LessWeightMg, RatePaise: l.RatePaise})
	}
	if len(lines) == 0 {
		f["lines"] = "add at least one line"
	}
	if len(f) > 0 {
		return tax.OldGoldResult{}, f
	}
	og, err := tax.OldGold(tl)
	if err != nil {
		return og, map[string]string{"lines": err.Error()}
	}
	return og, nil
}

func ogJSON(og tax.OldGoldResult) ogOut {
	o := ogOut{NetWeightMg: og.NetMg, RoundOffPaise: og.RoundOff, TotalPaise: og.Total}
	for _, l := range og.Lines {
		o.Lines = append(o.Lines, ogLineOut{l.NetMg, l.Amount})
	}
	return o
}

func (s *Server) computeVoucher(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Lines []oldGoldLineIn `json:"lines"`
	}
	if !decode(w, r, &body) {
		return
	}
	og, f := oldGoldCompute(body.Lines)
	if f != nil {
		fail(w, r, unprocessable(f, ""))
		return
	}
	writeJSON(w, 200, ogJSON(og))
}

func (s *Server) createVoucher(w http.ResponseWriter, r *http.Request) {
	var in voucherBody
	if !decode(w, r, &in) {
		return
	}
	b, se := bizFrom(r), sessionFrom(r)
	og, f := oldGoldCompute(in.Lines)
	if f == nil {
		f = map[string]string{}
	}
	cleanPartyIn(&in.Seller, "seller.", f)
	if in.Seller.Name == "" {
		f["seller.name"] = "required"
	}
	if in.SellerKind != "business" {
		in.SellerKind = "individual"
	}
	if in.VoucherDate == "" {
		in.VoucherDate = todayIST()
	}
	date, ok := parseDate(in.VoucherDate)
	if !ok {
		f["voucher_date"] = "use YYYY-MM-DD"
	}
	in.PartyID, in.PaidMode = clean(in.PartyID), clean(in.PaidMode)
	switch in.Settlement {
	case "paid":
		if in.PaidMode == nil || !slices.Contains([]string{"cash", "upi", "bank", "cheque"}, *in.PaidMode) {
			f["paid_mode"] = "choose cash, UPI, bank or cheque"
		}
	case "on_account":
		in.PaidMode = nil
		if in.PartyID == nil {
			f["party_id"] = "choose the customer to credit"
		}
	default:
		f["settlement"] = "paid or on_account"
	}
	if len(f) > 0 {
		fail(w, r, unprocessable(f, ""))
		return
	}
	var v db.PurchaseVoucher
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if in.PartyID != nil {
			if _, err := q.GetParty(r.Context(), db.GetPartyParams{ID: *in.PartyID, BusinessID: b.ID}); notFound(err) {
				return unprocessable(map[string]string{"party_id": "customer not found"}, "")
			} else if err != nil {
				return err
			}
		}
		st, err := s.loadSettings(r.Context(), q, b.ID)
		if err != nil {
			return err
		}
		states, err := s.stateMap(r.Context())
		if err != nil {
			return err
		}
		fy := fyStart(date.Time)
		no, key, err := takeNumber(r.Context(), q, st.BusinessSetting, b.ID, "purchase_voucher", voucherPrefix, fy)
		if err != nil {
			return err
		}
		out := ogJSON(og)
		vs := pdf.Voucher{Schema: 1, Template: pdf.Template{Version: "voucher-v1", Config: json.RawMessage("{}")},
			Doc:    pdf.Doc{Type: "purchase_voucher", Title: "PURCHASE VOUCHER (OLD GOLD)", No: no, Date: in.VoucherDate},
			Seller: sellerBlock(b, st.BusinessSetting, states), From: partyBlock(in.Seller, states), SellerKind: in.SellerKind,
			Lines: ogLines(in.Lines, out.Lines), Settlement: in.Settlement, PaidMode: in.PaidMode, Words: inr.Words(og.Total),
			Print: printBlock(st.BusinessSetting)}
		vs.Totals.TotalPaise, vs.Totals.RoundOffPaise = og.Total, og.RoundOff
		raw, _ := json.Marshal(vs)
		v, err = q.CreateVoucher(r.Context(), db.CreateVoucherParams{BusinessID: b.ID, SeriesKey: key, VoucherNo: no, VoucherDate: date, Fy: int16(fy),
			PartyID: in.PartyID, SellerName: in.Seller.Name, SellerKind: in.SellerKind, Settlement: in.Settlement, PaidMode: in.PaidMode,
			Snapshot: raw, NetWeightMg: og.NetMg, TotalPaise: og.Total, RoundOffPaise: og.RoundOff, CreatedBy: &se.UserID})
		if err != nil {
			return err
		}
		return docAudit(r.Context(), q, r, b.ID, "voucher.issued", "purchase_voucher", v.ID, map[string]any{"voucher_no": no, "total_paise": og.Total})
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 201, map[string]any{"voucher": v})
}

func (s *Server) listVouchers(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	p := db.ListVouchersParams{BusinessID: bizFrom(r).ID, PartyID: clean(ptr(v.Get("party_id")))}
	p.From, _ = parseDate(v.Get("from"))
	p.To, _ = parseDate(v.Get("to"))
	if c := v.Get("cursor"); c != "" {
		d, id, _ := strings.Cut(c, "|")
		p.AfterDate, _ = parseDate(d)
		p.AfterID = &id
	}
	rows, err := s.Q.ListVouchers(r.Context(), p)
	if err != nil {
		fail(w, r, err)
		return
	}
	var next *string
	if len(rows) == 50 {
		l := rows[len(rows)-1]
		next = ptr(dateStr(l.VoucherDate) + "|" + l.ID)
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows), "next_cursor": next})
}

func (s *Server) getVoucher(w http.ResponseWriter, r *http.Request) {
	v, err := s.Q.GetVoucher(r.Context(), db.GetVoucherParams{ID: r.PathValue("id"), BusinessID: bizFrom(r).ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"voucher": v})
}

func (s *Server) voucherPDF(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	v, err := s.Q.GetVoucher(r.Context(), db.GetVoucherParams{ID: r.PathValue("id"), BusinessID: b.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	var snap pdf.Voucher
	if err := json.Unmarshal(v.Snapshot, &snap); err != nil {
		fail(w, r, err)
		return
	}
	if v.Status == "cancelled" {
		snap.Doc.Title = "CANCELLED — " + snap.Doc.Title
	}
	data, err := pdf.RenderVoucher(snap, s.logoFor(r.Context(), b.ID, snap.Seller.LogoID))
	if err != nil {
		fail(w, r, err)
		return
	}
	writePDF(w, v.VoucherNo, data)
}

func (s *Server) cancelVoucher(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.Reason = strings.TrimSpace(body.Reason); body.Reason == "" {
		fail(w, r, unprocessable(map[string]string{"reason": "required"}, ""))
		return
	}
	b, se := bizFrom(r), sessionFrom(r)
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		v, err := q.LockVoucher(r.Context(), db.LockVoucherParams{ID: r.PathValue("id"), BusinessID: b.ID})
		if err != nil {
			return err
		}
		if v.Settlement == "exchange" {
			return &httpErr{status: 409, code: "exchange_voucher", msg: "This voucher belongs to a bill; cancel the bill instead"}
		}
		if v.Status != "issued" {
			return &httpErr{status: 409, code: "not_issued", msg: "Already cancelled"}
		}
		if err := q.CancelVoucher(r.Context(), db.CancelVoucherParams{ID: v.ID, BusinessID: b.ID, CancelReason: &body.Reason, CancelledBy: &se.UserID}); err != nil {
			return err
		}
		return docAudit(r.Context(), q, r, b.ID, "voucher.cancelled", "purchase_voucher", v.ID, map[string]any{"voucher_no": v.VoucherNo, "reason": body.Reason})
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	s.getVoucher(w, r)
}

// ── payments ─────────────────────────────────────────────────────────────

type paymentBody struct {
	InvoiceID   *string `json:"invoice_id"`
	PartyID     *string `json:"party_id"`
	ReceivedOn  string  `json:"received_on"`
	AmountPaise int64   `json:"amount_paise"`
	Mode        string  `json:"mode"`
	Reference   *string `json:"reference"`
	Note        *string `json:"note"`
}

func (s *Server) createPayment(w http.ResponseWriter, r *http.Request) {
	var in paymentBody
	if !decode(w, r, &in) {
		return
	}
	b, se := bizFrom(r), sessionFrom(r)
	f := map[string]string{}
	in.InvoiceID, in.PartyID, in.Reference, in.Note = clean(in.InvoiceID), clean(in.PartyID), clean(in.Reference), clean(in.Note)
	if in.ReceivedOn == "" {
		in.ReceivedOn = todayIST()
	}
	date, ok := parseDate(in.ReceivedOn)
	if !ok {
		f["received_on"] = "use YYYY-MM-DD"
	}
	if in.AmountPaise <= 0 {
		f["amount_paise"] = "must be more than 0"
	}
	if !slices.Contains([]string{"cash", "upi", "bank", "cheque", "card"}, in.Mode) {
		f["mode"] = "choose cash, UPI, bank, cheque or card"
	}
	if in.InvoiceID == nil && in.PartyID == nil {
		f["party_id"] = "choose a bill or a customer"
	}
	if len(f) > 0 {
		fail(w, r, unprocessable(f, ""))
		return
	}
	var pay db.Payment
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		if in.InvoiceID != nil {
			inv, err := q.LockInvoice(r.Context(), db.LockInvoiceParams{ID: *in.InvoiceID, BusinessID: b.ID}) // serialises concurrent payments
			if notFound(err) {
				return unprocessable(map[string]string{"invoice_id": "bill not found"}, "")
			} else if err != nil {
				return err
			}
			if inv.Status != "issued" {
				return &httpErr{status: 409, code: "not_issued", msg: "Payments can only be recorded on issued bills"}
			}
			if in.PartyID == nil {
				in.PartyID = inv.PartyID
			} else if inv.PartyID == nil || *inv.PartyID != *in.PartyID {
				return unprocessable(map[string]string{"party_id": "doesn't match the bill's customer"}, "")
			}
			paid, err := q.PaidForInvoice(r.Context(), db.PaidForInvoiceParams{BusinessID: b.ID, InvoiceID: &inv.ID})
			if err != nil {
				return err
			}
			if due := inv.GrandTotalPaise - paid; in.AmountPaise > due {
				return &httpErr{status: 409, code: "overpayment", msg: "Amount is more than the balance due (₹" + inr.Format(due) + ")",
					extra: map[string]any{"due_paise": due}}
			}
		} else if _, err := q.GetParty(r.Context(), db.GetPartyParams{ID: *in.PartyID, BusinessID: b.ID}); notFound(err) {
			return unprocessable(map[string]string{"party_id": "customer not found"}, "")
		} else if err != nil {
			return err
		}
		var err error
		pay, err = q.CreatePayment(r.Context(), db.CreatePaymentParams{BusinessID: b.ID, PartyID: in.PartyID, InvoiceID: in.InvoiceID,
			ReceivedOn: date, AmountPaise: in.AmountPaise, Mode: in.Mode, Reference: in.Reference, Note: in.Note, CreatedBy: &se.UserID})
		if err != nil {
			return err
		}
		return docAudit(r.Context(), q, r, b.ID, "payment.recorded", "payment", pay.ID, map[string]any{"amount_paise": in.AmountPaise, "mode": in.Mode})
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	warnings := []warning{}
	if in.Mode == "cash" && in.AmountPaise >= 20000000 {
		warnings = append(warnings, warning{"cash_269st", "Cash receipts of ₹2,00,000 or more from one person are not allowed (s.269ST)"})
	}
	writeJSON(w, 201, map[string]any{"payment": pay, "warnings": warnings})
}

func (s *Server) listPayments(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	p := db.ListPaymentsParams{BusinessID: bizFrom(r).ID, PartyID: clean(ptr(v.Get("party_id"))), InvoiceID: clean(ptr(v.Get("invoice_id")))}
	p.From, _ = parseDate(v.Get("from"))
	p.To, _ = parseDate(v.Get("to"))
	rows, err := s.Q.ListPayments(r.Context(), p)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows)})
}

func (s *Server) voidPayment(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.Reason = strings.TrimSpace(body.Reason); body.Reason == "" {
		fail(w, r, unprocessable(map[string]string{"reason": "required"}, ""))
		return
	}
	b := bizFrom(r)
	id := r.PathValue("id")
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		n, err := q.VoidPayment(r.Context(), db.VoidPaymentParams{ID: id, BusinessID: b.ID, VoidReason: &body.Reason})
		if err != nil {
			return err
		}
		if n == 0 {
			if _, err := q.GetPayment(r.Context(), db.GetPaymentParams{ID: id, BusinessID: b.ID}); err != nil {
				return err
			}
			return &httpErr{status: 409, code: "not_voidable", msg: "Already voided, or an old-gold credit (cancel the bill instead)"}
		}
		return docAudit(r.Context(), q, r, b.ID, "payment.voided", "payment", id, map[string]any{"reason": body.Reason})
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(204)
}
