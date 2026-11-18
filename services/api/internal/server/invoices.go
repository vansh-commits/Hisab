package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"hisab/internal/db"
	"hisab/internal/inr"
	"hisab/internal/pdf"
	"hisab/internal/tax"
)

// ── input (docs/api.md "Invoice input") ──────────────────────────────────

type makingIn struct {
	Mode  string `json:"mode"`
	Value int64  `json:"value"`
}

type lineIn struct {
	Kind             string    `json:"kind"`
	ItemID           *string   `json:"item_id"`
	Description      string    `json:"description"`
	HSN              *string   `json:"hsn"`
	Purity           *string   `json:"purity"`
	HUID             *string   `json:"huid"`
	Unit             string    `json:"unit"`
	GrossWeightMg    *int64    `json:"gross_weight_mg"`
	QtyMilli         int64     `json:"qty_milli"`
	RatePaise        int64     `json:"rate_paise"`
	Making           *makingIn `json:"making"`
	OtherPaise       int64     `json:"other_paise"`
	OtherLabel       *string   `json:"other_label"`
	GSTRate          int64     `json:"gst_rate"`
	TargetTotalPaise *int64    `json:"target_total_paise"`
}

type partyIn struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	StateCode *string `json:"state_code"`
	GSTIN     *string `json:"gstin"`
	Phone     *string `json:"phone"`
	PAN       *string `json:"pan"`
}

type oldGoldLineIn struct {
	Description   string  `json:"description"`
	Purity        *string `json:"purity"`
	GrossWeightMg int64   `json:"gross_weight_mg"`
	LessWeightMg  int64   `json:"less_weight_mg"`
	RatePaise     int64   `json:"rate_paise"`
}

type oldGoldIn struct {
	SellerKind string          `json:"seller_kind"`
	Lines      []oldGoldLineIn `json:"lines"`
}

type invoiceInput struct {
	DocType               string             `json:"doc_type"`
	InvoiceDate           string             `json:"invoice_date"`
	DateOfSupply          *string            `json:"date_of_supply"`
	CalcMode              string             `json:"calc_mode"`
	PartyID               *string            `json:"party_id"`
	Buyer                 partyIn            `json:"buyer"`
	Consignee             *partyIn           `json:"consignee"`
	GoodsMovement         bool               `json:"goods_movement"`
	DeliveryState         *string            `json:"delivery_state"`
	PlaceOfSupplyOverride *string            `json:"place_of_supply_override"`
	ReverseCharge         bool               `json:"reverse_charge"`
	TCSRate               *int64             `json:"tcs_rate"`
	Refs                  map[string]*string `json:"refs"`
	Lines                 []lineIn           `json:"lines"`
	OldGold               *oldGoldIn         `json:"old_gold"`
	Notes                 string             `json:"notes"`
}

// ── computed result (docs/api.md "Computed result") ──────────────────────

type warning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type lineOut struct {
	MetalPaise   int64 `json:"metal_paise"`
	MakingPaise  int64 `json:"making_paise"`
	OtherPaise   int64 `json:"other_paise"`
	TaxablePaise int64 `json:"taxable_paise"`
	RatePaise    int64 `json:"rate_paise"`
	RateDerived  bool  `json:"rate_derived"`
}

type ogLineOut struct {
	NetWeightMg int64 `json:"net_weight_mg"`
	AmountPaise int64 `json:"amount_paise"`
}

type ogOut struct {
	Lines         []ogLineOut `json:"lines"`
	NetWeightMg   int64       `json:"net_weight_mg"`
	RoundOffPaise int64       `json:"round_off_paise"`
	TotalPaise    int64       `json:"total_paise"`
}

type computed struct {
	DocType         string      `json:"doc_type"`
	SupplyType      string      `json:"supply_type"`
	PlaceOfSupply   string      `json:"place_of_supply"`
	SGSTLabel       string      `json:"sgst_label"`
	Lines           []lineOut   `json:"lines"`
	TaxGroups       []pdf.Group `json:"tax_groups"`
	TaxablePaise    int64       `json:"taxable_paise"`
	CGSTPaise       int64       `json:"cgst_paise"`
	SGSTPaise       int64       `json:"sgst_paise"`
	IGSTPaise       int64       `json:"igst_paise"`
	TCSPaise        int64       `json:"tcs_paise"`
	RoundOffPaise   int64       `json:"round_off_paise"`
	GrandTotalPaise int64       `json:"grand_total_paise"`
	OldGold         *ogOut      `json:"old_gold"`
	NetPayablePaise int64       `json:"net_payable_paise"`
	Words           pdf.Words   `json:"words"`
	Warnings        []warning   `json:"warnings"`
}

// httpErr is a client error raised deep inside a transaction.
type httpErr struct {
	status int
	code   string
	msg    string
	fields map[string]string
	extra  map[string]any
}

func (e *httpErr) Error() string { return e.msg }

func unprocessable(fields map[string]string, msg string) *httpErr {
	if msg == "" {
		msg = "Please fix the highlighted fields"
	}
	return &httpErr{status: 422, code: "validation_failed", msg: msg, fields: fields}
}

// fail writes any error from a handler: httpErr, constraint violation, not found, or 500.
func fail(w http.ResponseWriter, r *http.Request, err error) {
	var he *httpErr
	switch {
	case errors.As(err, &he):
		e := map[string]any{"code": he.code, "message": he.msg}
		if len(he.fields) > 0 {
			e["fields"] = he.fields
		}
		for k, v := range he.extra {
			e[k] = v
		}
		writeJSON(w, he.status, map[string]any{"error": e})
	case notFound(err):
		apiError(w, 404, "not_found", "Not found", nil)
	case dbInvalid(w, err):
	default:
		internalError(w, r, err)
	}
}

// ── helpers ──────────────────────────────────────────────────────────────

var hsnRe = regexp.MustCompile(`^[0-9]{4}([0-9]{2}){0,2}$`)

func todayIST() string { return time.Now().In(ist).Format("2006-01-02") }

func parseDate(s string) (pgtype.Date, bool) {
	t, err := time.Parse("2006-01-02", s)
	return pgtype.Date{Time: t, Valid: err == nil}, err == nil
}

func dateStr(d pgtype.Date) string { return d.Time.Format("2006-01-02") }

func (s *Server) stateMap(ctx context.Context) (map[string]db.State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.states != nil {
		return s.states, nil
	}
	list, err := s.Q.ListStates(ctx)
	if err != nil {
		return nil, err
	}
	s.states = map[string]db.State{}
	for _, st := range list {
		s.states[st.Code] = st
	}
	return s.states, nil
}

func stateRef(m map[string]db.State, code *string) *pdf.State {
	if code == nil {
		return nil
	}
	return &pdf.State{Code: *code, Name: m[*code].Name}
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// ── normalise + compute ──────────────────────────────────────────────────

// normalize fills defaults that never fail (drafts can be incomplete).
func normalize(in *invoiceInput, b *db.Business) map[string]string {
	f := map[string]string{}
	if b.RegistrationType == nil || *b.RegistrationType != "regular" {
		in.DocType = "bill_of_supply" // composition / unregistered sellers can't issue tax invoices
	} else if in.DocType != "bill_of_supply" {
		in.DocType = "tax_invoice"
	}
	if in.InvoiceDate == "" {
		in.InvoiceDate = todayIST()
	}
	if _, ok := parseDate(in.InvoiceDate); !ok {
		f["invoice_date"] = "use YYYY-MM-DD"
	}
	if in.DateOfSupply = clean(in.DateOfSupply); in.DateOfSupply != nil {
		if _, ok := parseDate(*in.DateOfSupply); !ok {
			f["date_of_supply"] = "use YYYY-MM-DD"
		}
	}
	if in.CalcMode != "reverse" {
		in.CalcMode = "forward"
	}
	in.Buyer.Name, in.Buyer.Address = strings.TrimSpace(in.Buyer.Name), strings.TrimSpace(in.Buyer.Address)
	in.PartyID = clean(in.PartyID)
	return f
}

func cleanPartyIn(p *partyIn, k string, f map[string]string) {
	p.Name, p.Address = strings.TrimSpace(p.Name), strings.TrimSpace(p.Address)
	p.StateCode, p.Phone = clean(p.StateCode), clean(p.Phone)
	if p.PAN = upper(p.PAN); p.PAN != nil && !panRe.MatchString(*p.PAN) {
		f[k+"pan"] = "PAN looks like ABCDE1234F"
	}
	checkGSTIN(&p.GSTIN, &p.StateCode, f, k)
}

type prepared struct {
	in   invoiceInput
	res  tax.Result
	out  computed
	date pgtype.Date
	fy   int
}

// prepare validates the input and runs the tax engine. Client problems come back as *httpErr.
func (s *Server) prepare(ctx context.Context, q *db.Queries, b *db.Business, st db.BusinessSetting, in invoiceInput) (prepared, error) {
	f := normalize(&in, b)
	states, err := s.stateMap(ctx)
	if err != nil {
		return prepared{}, err
	}
	if b.StateCode == nil {
		return prepared{}, unprocessable(nil, "Set your shop's state in Settings first")
	}
	cleanPartyIn(&in.Buyer, "buyer.", f)
	if in.Consignee != nil {
		cleanPartyIn(in.Consignee, "consignee.", f)
	}
	for k, v := range map[string]*string{"buyer.state_code": in.Buyer.StateCode, "delivery_state": in.DeliveryState, "place_of_supply_override": in.PlaceOfSupplyOverride} {
		if v != nil && *v != "" && states[*v].Code == "" {
			f[k] = "unknown state code"
		}
	}
	in.DeliveryState, in.PlaceOfSupplyOverride = clean(in.DeliveryState), clean(in.PlaceOfSupplyOverride)
	if in.PartyID != nil {
		if _, err := q.GetParty(ctx, db.GetPartyParams{ID: *in.PartyID, BusinessID: b.ID}); notFound(err) {
			f["party_id"] = "customer not found"
		} else if err != nil {
			return prepared{}, err
		}
	}
	if len(in.Lines) == 0 {
		f["lines"] = "add at least one line"
	}
	reverse := in.CalcMode == "reverse"
	tin := tax.Input{
		SellerUT:         states[*b.StateCode].IsUtWithoutLegislature,
		BillOfSupply:     in.DocType == "bill_of_supply",
		Reverse:          reverse,
		ReverseStepRupee: st.ReverseRoundTaxableRupee,
		RoundOff:         st.RoundOffEnabled,
		POS: tax.POSInput{ShopState: *b.StateCode, BuyerRegistered: in.Buyer.GSTIN != nil, BuyerState: deref(in.Buyer.StateCode),
			GoodsMovement: in.GoodsMovement, DeliveryState: deref(in.DeliveryState), Override: deref(in.PlaceOfSupplyOverride)},
	}
	if in.Consignee != nil {
		tin.POS.ConsigneeState = deref(in.Consignee.StateCode)
	}
	if in.TCSRate != nil {
		if *in.TCSRate < 0 || *in.TCSRate > 10000 {
			f["tcs_rate"] = "0 to 10%"
		}
		tin.TCSRate = *in.TCSRate
	}
	for i := range in.Lines {
		l, k := &in.Lines[i], fmt.Sprintf("lines[%d].", i)
		if l.Kind != "charge" {
			l.Kind = "goods"
		}
		if l.Unit == "" {
			l.Unit = "g"
		}
		if !slices.Contains([]string{"g", "pcs", "ct", "pair", "set", "nos"}, l.Unit) {
			f[k+"unit"] = "unknown unit"
		}
		if l.Description = strings.TrimSpace(l.Description); l.Description == "" {
			f[k+"description"] = "required"
		}
		if l.HSN, l.Purity, l.HUID = clean(l.HSN), clean(l.Purity), upper(l.HUID); l.HSN != nil && !hsnRe.MatchString(*l.HSN) {
			f[k+"hsn"] = "must be 4, 6 or 8 digits"
		}
		if l.GSTRate < 0 || l.GSTRate > 28000 {
			f[k+"gst_rate"] = "0 to 28%"
		}
		if l.Kind == "goods" && l.QtyMilli <= 0 {
			f[k+"qty_milli"] = "must be more than 0"
		}
		if l.QtyMilli < 0 || l.RatePaise < 0 || l.OtherPaise < 0 {
			f[k+"rate_paise"] = "must not be negative"
		}
		if reverse && (l.TargetTotalPaise == nil || *l.TargetTotalPaise <= 0) {
			f[k+"target_total_paise"] = "enter the total for this line"
		}
		tl := tax.Line{HSN: deref(l.HSN), GSTRate: l.GSTRate, QtyMilli: l.QtyMilli, RatePaise: l.RatePaise, Other: l.OtherPaise}
		if reverse && l.TargetTotalPaise != nil {
			tl.Target = *l.TargetTotalPaise
		}
		if l.Making != nil && l.Making.Value != 0 {
			if !slices.Contains([]string{"per_gram", "flat", "percent"}, l.Making.Mode) || l.Making.Value < 0 {
				f[k+"making"] = "invalid making charge"
			}
			tl.Making = &tax.Making{Mode: tax.MakingMode(l.Making.Mode), Value: l.Making.Value}
		}
		tin.Lines = append(tin.Lines, tl)
	}
	if og := in.OldGold; og != nil && len(og.Lines) == 0 {
		in.OldGold = nil
	} else if og != nil {
		if og.SellerKind != "business" {
			og.SellerKind = "individual"
		}
		for i := range og.Lines {
			l, k := &og.Lines[i], fmt.Sprintf("old_gold.lines[%d].", i)
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
			tin.OldGold = append(tin.OldGold, tax.OldGoldLine{GrossMg: l.GrossWeightMg, LessMg: l.LessWeightMg, RatePaise: l.RatePaise})
		}
	}
	if len(f) > 0 {
		return prepared{}, unprocessable(f, "")
	}
	res, err := tax.Compute(tin)
	if err != nil {
		return prepared{}, unprocessable(nil, err.Error())
	}
	date, _ := parseDate(in.InvoiceDate)
	p := prepared{in: in, res: res, date: date, fy: fyStart(date.Time)}
	p.out = toComputed(in, res)

	// Non-blocking compliance hints.
	if res.GrandTotal > 20000000 && in.Buyer.PAN == nil {
		p.out.Warnings = append(p.out.Warnings, warning{"pan_recommended", "PAN is required for jewellery sales above ₹2,00,000 (Rule 114B)"})
	}
	if rule46Missing(in, res) {
		p.out.Warnings = append(p.out.Warnings, warning{"rule46_address", "Bills of ₹50,000+ to unregistered buyers need the buyer's name, address and state (Rule 46)"})
	}
	if last, err := q.LastIssuedDate(ctx, b.ID); err == nil && date.Time.Before(last.Time) {
		p.out.Warnings = append(p.out.Warnings, warning{"backdated", "Bill date is earlier than your last bill (" + dateStr(last) + ")"})
	}
	return p, nil
}

func rule46Missing(in invoiceInput, res tax.Result) bool {
	return in.Buyer.GSTIN == nil && res.GrandTotal >= 5000000 && (in.Buyer.Name == "" || in.Buyer.Address == "" || in.Buyer.StateCode == nil)
}

func toComputed(in invoiceInput, r tax.Result) computed {
	c := computed{DocType: in.DocType, SupplyType: "inter", PlaceOfSupply: r.PlaceOfSupply, SGSTLabel: r.StateTaxLabel,
		TaxablePaise: r.Taxable, CGSTPaise: r.CGST, SGSTPaise: r.SGST, IGSTPaise: r.IGST, TCSPaise: r.TCS,
		RoundOffPaise: r.RoundOff, GrandTotalPaise: r.GrandTotal, NetPayablePaise: r.NetPayable, Warnings: []warning{}}
	if r.Intra {
		c.SupplyType = "intra"
	}
	for _, l := range r.Lines {
		c.Lines = append(c.Lines, lineOut{l.Metal, l.Making, l.Other, l.Taxable, l.RatePaise, l.RateDerived})
	}
	c.TaxGroups = []pdf.Group{}
	for _, g := range r.Groups {
		c.TaxGroups = append(c.TaxGroups, pdf.Group{HSN: g.HSN, GSTRate: g.GSTRate, TaxablePaise: g.Taxable, CGSTPaise: g.CGST, SGSTPaise: g.SGST, IGSTPaise: g.IGST})
	}
	if og := r.OldGold; og != nil {
		c.OldGold = &ogOut{NetWeightMg: og.NetMg, RoundOffPaise: og.RoundOff, TotalPaise: og.Total}
		for _, l := range og.Lines {
			c.OldGold.Lines = append(c.OldGold.Lines, ogLineOut{l.NetMg, l.Amount})
		}
	}
	for _, w := range r.Warnings {
		c.Warnings = append(c.Warnings, warning{"reverse_adjusted", w})
	}
	c.Words = pdf.Words{GrandTotal: inr.Words(r.GrandTotal), NetPayable: inr.Words(r.NetPayable)}
	if t := r.CGST + r.SGST + r.IGST; t > 0 {
		c.Words.Tax = inr.Words(t)
	}
	return c
}

// ── snapshot ─────────────────────────────────────────────────────────────

func sellerBlock(b *db.Business, st db.BusinessSetting, states map[string]db.State) pdf.Seller {
	addr := []string{}
	for _, p := range []*string{b.AddressLine1, b.AddressLine2, b.City} {
		if p != nil {
			addr = append(addr, *p)
		}
	}
	a := strings.Join(addr, ", ")
	if b.Pincode != nil {
		a += " - " + *b.Pincode
	}
	sel := pdf.Seller{LegalName: deref(b.LegalName), TradeName: deref(b.TradeName), Address: a, GSTIN: b.Gstin, UdyamNo: b.UdyamNo,
		Phone: b.Phone, Email: b.Email, LogoID: b.LogoID,
		Bank: pdf.Bank{Name: st.BankName, AccountName: st.BankAccountName, AccountNo: st.BankAccountNo, IFSC: st.BankIfsc, Branch: st.BankBranch, UPI: st.UpiID}}
	if b.StateCode != nil {
		sel.State = pdf.State{Code: *b.StateCode, Name: states[*b.StateCode].Name}
	}
	return sel
}

func partyBlock(p partyIn, states map[string]db.State) pdf.Party {
	return pdf.Party{Name: p.Name, Address: p.Address, State: stateRef(states, p.StateCode), GSTIN: p.GSTIN, Phone: p.Phone, PAN: p.PAN}
}

func printBlock(st db.BusinessSetting) pdf.Print {
	return pdf.Print{Copies: st.Copies, Terms: st.Terms, Declaration: st.Declaration, Jurisdiction: st.Jurisdiction, SignatoryName: st.SignatoryName}
}

func (s *Server) buildSnapshot(ctx context.Context, b *db.Business, st db.BusinessSetting, p prepared, no, voucherNo string) (pdf.Invoice, error) {
	states, err := s.stateMap(ctx)
	if err != nil {
		return pdf.Invoice{}, err
	}
	in, c := p.in, p.out
	title := "TAX INVOICE"
	if in.DocType == "bill_of_supply" {
		title = "BILL OF SUPPLY"
	}
	buyer := partyBlock(in.Buyer, states)
	if buyer.Name == "" {
		buyer.Name = "Cash customer"
	}
	snap := pdf.Invoice{Schema: 1, EngineVersion: tax.EngineVersion,
		Template: pdf.Template{Version: "classic-v1", Config: st.TemplateConfig},
		Doc: pdf.Doc{Type: in.DocType, Title: title, No: no, Date: in.InvoiceDate, DateOfSupply: in.DateOfSupply,
			PlaceOfSupply: stateRef(states, &c.PlaceOfSupply), ReverseCharge: in.ReverseCharge, Refs: in.Refs},
		Seller: sellerBlock(b, st, states), Buyer: buyer, Settings: printBlock(st), Words: c.Words, Notes: strings.TrimSpace(in.Notes),
		TaxGroups: c.TaxGroups,
		Totals: pdf.Totals{SupplyType: c.SupplyType, SGSTLabel: c.SGSTLabel, TaxablePaise: c.TaxablePaise, CGSTPaise: c.CGSTPaise,
			SGSTPaise: c.SGSTPaise, IGSTPaise: c.IGSTPaise, TCSPaise: c.TCSPaise, RoundOffPaise: c.RoundOffPaise,
			GrandTotalPaise: c.GrandTotalPaise, NetPayablePaise: c.NetPayablePaise}}
	if in.Consignee != nil {
		cb := partyBlock(*in.Consignee, states)
		snap.Consignee = &cb
	}
	for i, l := range in.Lines {
		r := c.Lines[i]
		sl := pdf.Line{SNo: i + 1, Kind: l.Kind, Description: l.Description, HSN: l.HSN, Purity: l.Purity, HUID: l.HUID, Unit: l.Unit,
			GrossWeightMg: l.GrossWeightMg, QtyMilli: l.QtyMilli, RatePaise: r.RatePaise, RateDerived: r.RateDerived,
			MetalPaise: r.MetalPaise, OtherPaise: r.OtherPaise, OtherLabel: l.OtherLabel, TaxablePaise: r.TaxablePaise, GSTRate: l.GSTRate}
		if l.Making != nil && r.MakingPaise != 0 {
			sl.Making = &pdf.Making{Mode: l.Making.Mode, Value: l.Making.Value, Paise: r.MakingPaise}
		}
		snap.Lines = append(snap.Lines, sl)
	}
	if c.OldGold != nil {
		snap.Totals.OldGoldPaise = c.OldGold.TotalPaise
		snap.OldGold = &pdf.OldGold{VoucherNo: voucherNo, SellerKind: in.OldGold.SellerKind, RoundOffPaise: c.OldGold.RoundOffPaise, TotalPaise: c.OldGold.TotalPaise,
			Lines: ogLines(in.OldGold.Lines, c.OldGold.Lines)}
	}
	return snap, nil
}

func ogLines(in []oldGoldLineIn, out []ogLineOut) []pdf.OldGoldLine {
	ls := []pdf.OldGoldLine{}
	for i, l := range in {
		ls = append(ls, pdf.OldGoldLine{Description: l.Description, Purity: l.Purity, GrossWeightMg: l.GrossWeightMg, LessWeightMg: l.LessWeightMg,
			NetWeightMg: out[i].NetWeightMg, RatePaise: l.RatePaise, AmountPaise: out[i].AmountPaise})
	}
	return ls
}

// ── numbering ────────────────────────────────────────────────────────────

// takeNumber reserves the next number in the series; the row lock serialises concurrent issuers and a
// rollback un-reserves it, so numbers stay gapless.
func takeNumber(ctx context.Context, q *db.Queries, st db.BusinessSetting, bizID, docType, prefix string, fy int) (string, int16, error) {
	key := seriesKey(st, fy)
	if err := q.EnsureSeries(ctx, db.EnsureSeriesParams{BusinessID: bizID, DocType: docType, SeriesKey: key}); err != nil {
		return "", 0, err
	}
	n, err := q.TakeNumber(ctx, db.TakeNumberParams{BusinessID: bizID, DocType: docType, SeriesKey: key})
	if err != nil {
		return "", 0, err
	}
	st.InvoicePrefix = prefix
	no := docNumber(st, fy, n)
	if len(no) > maxDocNo {
		return "", 0, unprocessable(nil, fmt.Sprintf("Bill number %q is longer than %d characters; shorten the prefix in Settings", no, maxDocNo))
	}
	return no, key, nil
}

const voucherPrefix = "PV/"

// ── handlers ─────────────────────────────────────────────────────────────

type invoiceBody struct {
	Input    invoiceInput `json:"input"`
	Issue    bool         `json:"issue"`
	Expected *int64       `json:"expected_grand_total_paise"`
}

func (s *Server) computeInvoice(w http.ResponseWriter, r *http.Request) {
	var body invoiceBody
	if !decode(w, r, &body) {
		return
	}
	b := bizFrom(r)
	st, err := s.loadSettings(r.Context(), s.Q, b.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	p, err := s.prepare(r.Context(), s.Q, b, st.BusinessSetting, body.Input)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, p.out)
}

// draftColumns derives the list columns of a draft; totals only when the input already computes.
func (s *Server) draftColumns(ctx context.Context, b *db.Business, st db.BusinessSetting, in *invoiceInput) (db.UpdateDraftParams, error) {
	if f := normalize(in, b); len(f) > 0 {
		return db.UpdateDraftParams{}, unprocessable(f, "")
	}
	raw, _ := json.Marshal(in)
	date, _ := parseDate(in.InvoiceDate)
	d := db.UpdateDraftParams{BusinessID: b.ID, DocType: in.DocType, InvoiceDate: date, Fy: int16(fyStart(date.Time)),
		PartyID: in.PartyID, BuyerName: in.Buyer.Name, BuyerGstin: upper(in.Buyer.GSTIN), Input: raw}
	if p, err := s.prepare(ctx, s.Q, b, st, *in); err == nil {
		d.TaxablePaise, d.GrandTotalPaise, d.NetPayablePaise = p.out.TaxablePaise, p.out.GrandTotalPaise, p.out.NetPayablePaise
		if p.out.OldGold != nil {
			d.OldGoldPaise = p.out.OldGold.TotalPaise
		}
	}
	return d, nil
}

func (s *Server) createInvoice(w http.ResponseWriter, r *http.Request) {
	var body invoiceBody
	if !decode(w, r, &body) {
		return
	}
	b, se := bizFrom(r), sessionFrom(r)
	if body.Issue && body.Expected == nil {
		fail(w, r, unprocessable(map[string]string{"expected_grand_total_paise": "required to issue"}, ""))
		return
	}
	st, err := s.loadSettings(r.Context(), s.Q, b.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	d, err := s.draftColumns(r.Context(), b, st.BusinessSetting, &body.Input)
	if err != nil {
		fail(w, r, err)
		return
	}
	var inv db.Invoice
	err = pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		var err error
		inv, err = q.CreateInvoice(r.Context(), db.CreateInvoiceParams{BusinessID: b.ID, DocType: d.DocType, InvoiceDate: d.InvoiceDate, Fy: d.Fy,
			PartyID: d.PartyID, BuyerName: d.BuyerName, BuyerGstin: d.BuyerGstin, Input: d.Input, CreatedBy: &se.UserID,
			TaxablePaise: d.TaxablePaise, GrandTotalPaise: d.GrandTotalPaise, OldGoldPaise: d.OldGoldPaise, NetPayablePaise: d.NetPayablePaise})
		if err != nil || !body.Issue {
			return err
		}
		inv, err = s.issue(r.Context(), q, r, b, inv, *body.Expected)
		return err
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 201, map[string]any{"invoice": inv})
}

func (s *Server) updateInvoice(w http.ResponseWriter, r *http.Request) {
	var body invoiceBody
	if !decode(w, r, &body) {
		return
	}
	b := bizFrom(r)
	st, err := s.loadSettings(r.Context(), s.Q, b.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	d, err := s.draftColumns(r.Context(), b, st.BusinessSetting, &body.Input)
	if err != nil {
		fail(w, r, err)
		return
	}
	d.ID = r.PathValue("id")
	inv, err := s.Q.UpdateDraft(r.Context(), d)
	if notFound(err) {
		err = &httpErr{status: 409, code: "not_draft", msg: "Only drafts can be edited"}
		if _, gerr := s.Q.GetInvoice(r.Context(), db.GetInvoiceParams{ID: d.ID, BusinessID: b.ID}); notFound(gerr) {
			err = pgx.ErrNoRows
		}
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"invoice": inv})
}

func (s *Server) deleteInvoice(w http.ResponseWriter, r *http.Request) {
	n, err := s.Q.DeleteDraft(r.Context(), db.DeleteDraftParams{ID: r.PathValue("id"), BusinessID: bizFrom(r).ID})
	if err == nil && n == 0 {
		err = &httpErr{status: 409, code: "not_draft", msg: "Only drafts can be deleted; cancel an issued bill instead"}
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(204)
}

func (s *Server) issueInvoice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Expected *int64 `json:"expected_grand_total_paise"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.Expected == nil {
		fail(w, r, unprocessable(map[string]string{"expected_grand_total_paise": "required"}, ""))
		return
	}
	b := bizFrom(r)
	var inv db.Invoice
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		cur, err := q.LockInvoice(r.Context(), db.LockInvoiceParams{ID: r.PathValue("id"), BusinessID: b.ID})
		if err != nil {
			return err
		}
		if cur.Status != "draft" {
			return &httpErr{status: 409, code: "not_draft", msg: "This bill is already issued"}
		}
		inv, err = s.issue(r.Context(), q, r, b, cur, *body.Expected)
		return err
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"invoice": inv})
}

// issue turns a locked draft into an issued invoice: recompute, number, snapshot, exchange voucher, audit.
func (s *Server) issue(ctx context.Context, q *db.Queries, r *http.Request, b *db.Business, inv db.Invoice, expected int64) (db.Invoice, error) {
	st, err := s.loadSettings(ctx, q, b.ID)
	if err != nil {
		return inv, err
	}
	var in invoiceInput
	if err := json.Unmarshal(inv.Input, &in); err != nil {
		return inv, err
	}
	p, err := s.prepare(ctx, q, b, st.BusinessSetting, in)
	if err != nil {
		return inv, err
	}
	if rule46Missing(p.in, p.res) {
		return inv, unprocessable(map[string]string{"buyer.address": "required for ₹50,000+ to an unregistered buyer", "buyer.state_code": "required"},
			"Add the buyer's name, address and state (Rule 46)")
	}
	if p.out.GrandTotalPaise != expected {
		return inv, &httpErr{status: 409, code: "totals_mismatch", msg: "Totals changed; please review and try again", extra: map[string]any{"computed": p.out}}
	}
	no, key, err := takeNumber(ctx, q, st.BusinessSetting, b.ID, "invoice", st.InvoicePrefix, p.fy)
	if err != nil {
		return inv, err
	}
	vno, vkey := "", int16(0)
	if p.out.OldGold != nil {
		if vno, vkey, err = takeNumber(ctx, q, st.BusinessSetting, b.ID, "purchase_voucher", voucherPrefix, p.fy); err != nil {
			return inv, err
		}
	}
	snap, err := s.buildSnapshot(ctx, b, st.BusinessSetting, p, no, vno)
	if err != nil {
		return inv, err
	}
	snapRaw, _ := json.Marshal(snap)
	inRaw, _ := json.Marshal(p.in)
	c, se := p.out, sessionFrom(r)
	out, err := q.IssueInvoice(ctx, db.IssueInvoiceParams{ID: inv.ID, BusinessID: b.ID, DocType: p.in.DocType, InvoiceDate: p.date, Fy: int16(p.fy),
		PartyID: p.in.PartyID, BuyerName: p.in.Buyer.Name, BuyerGstin: p.in.Buyer.GSTIN, Input: inRaw, SeriesKey: &key, InvoiceNo: &no,
		Snapshot: snapRaw, TemplateVersion: ptr("classic-v1"), EngineVersion: ptr(int16(tax.EngineVersion)), PlaceOfSupply: &c.PlaceOfSupply,
		SupplyType: &c.SupplyType, TaxablePaise: c.TaxablePaise, CgstPaise: c.CGSTPaise, SgstPaise: c.SGSTPaise, IgstPaise: c.IGSTPaise,
		TcsRate: int32(deref64(p.in.TCSRate)), TcsPaise: c.TCSPaise, RoundOffPaise: c.RoundOffPaise,
		GrandTotalPaise: c.GrandTotalPaise, OldGoldPaise: snap.Totals.OldGoldPaise, NetPayablePaise: c.NetPayablePaise, IssuedBy: &se.UserID})
	if err != nil {
		return inv, err
	}
	if og := snap.OldGold; og != nil {
		vs := pdf.Voucher{Schema: 1, Template: pdf.Template{Version: "voucher-v1", Config: json.RawMessage("{}")},
			Doc:    pdf.Doc{Type: "purchase_voucher", Title: "PURCHASE VOUCHER (OLD GOLD)", No: vno, Date: p.in.InvoiceDate},
			Seller: snap.Seller, From: snap.Buyer, SellerKind: og.SellerKind, Lines: og.Lines, Settlement: "exchange", InvoiceNo: &no,
			Words: inr.Words(og.TotalPaise), Print: snap.Settings}
		vs.Totals.TotalPaise, vs.Totals.RoundOffPaise = og.TotalPaise, og.RoundOffPaise
		vraw, _ := json.Marshal(vs)
		v, err := q.CreateVoucher(ctx, db.CreateVoucherParams{BusinessID: b.ID, SeriesKey: vkey, VoucherNo: vno, VoucherDate: p.date, Fy: int16(p.fy),
			PartyID: p.in.PartyID, SellerName: snap.Buyer.Name, SellerKind: og.SellerKind, Settlement: "exchange", InvoiceID: &inv.ID,
			Snapshot: vraw, NetWeightMg: p.out.OldGold.NetWeightMg, TotalPaise: og.TotalPaise, RoundOffPaise: og.RoundOffPaise, CreatedBy: &se.UserID})
		if err != nil {
			return inv, err
		}
		if _, err := q.CreatePayment(ctx, db.CreatePaymentParams{BusinessID: b.ID, PartyID: p.in.PartyID, InvoiceID: &inv.ID, VoucherID: &v.ID,
			ReceivedOn: p.date, AmountPaise: og.TotalPaise, Mode: "old_gold", Reference: &vno, CreatedBy: &se.UserID}); err != nil {
			return inv, err
		}
	}
	return out, docAudit(ctx, q, r, b.ID, "invoice.issued", "invoice", inv.ID, map[string]any{"invoice_no": no, "total_paise": c.GrandTotalPaise, "voucher_no": vno})
}

func deref64(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

// docAudit is audit() with the document as the entity.
func docAudit(ctx context.Context, q *db.Queries, r *http.Request, bizID, action, entity, id string, data any) error {
	se := sessionFrom(r)
	raw, _ := json.Marshal(data)
	return q.Audit(ctx, db.AuditParams{ActorType: "user", ActorUserID: &se.UserID, ActorEmail: &se.Email, BusinessID: &bizID,
		Action: action, EntityType: &entity, EntityID: &id, Data: raw, Ip: clientIP(r)})
}

func (s *Server) cancelInvoice(w http.ResponseWriter, r *http.Request) {
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
	var inv db.Invoice
	err := pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		q := s.Q.WithTx(tx)
		cur, err := q.LockInvoice(r.Context(), db.LockInvoiceParams{ID: r.PathValue("id"), BusinessID: b.ID})
		if err != nil {
			return err
		}
		if cur.Status != "issued" {
			return &httpErr{status: 409, code: "not_issued", msg: "Only issued bills can be cancelled (delete drafts instead)"}
		}
		if n, err := q.LiveCashPayments(r.Context(), db.LiveCashPaymentsParams{BusinessID: b.ID, InvoiceID: &cur.ID}); err != nil {
			return err
		} else if n > 0 {
			return &httpErr{status: 409, code: "has_payments", msg: "Void the payments on this bill first"}
		}
		if inv, err = q.CancelInvoice(r.Context(), db.CancelInvoiceParams{ID: cur.ID, BusinessID: b.ID, CancelReason: &body.Reason, CancelledBy: &se.UserID}); err != nil {
			return err
		}
		if v, err := q.VoucherForInvoice(r.Context(), db.VoucherForInvoiceParams{BusinessID: b.ID, InvoiceID: &cur.ID}); err == nil {
			if err := q.CancelVoucher(r.Context(), db.CancelVoucherParams{ID: v.ID, BusinessID: b.ID, CancelReason: &body.Reason, CancelledBy: &se.UserID}); err != nil {
				return err
			}
			if err := q.VoidVoucherPayments(r.Context(), db.VoidVoucherPaymentsParams{BusinessID: b.ID, VoucherID: &v.ID, VoidReason: ptr("bill cancelled")}); err != nil {
				return err
			}
		} else if !notFound(err) {
			return err
		}
		return docAudit(r.Context(), q, r, b.ID, "invoice.cancelled", "invoice", cur.ID, map[string]any{"invoice_no": cur.InvoiceNo, "reason": body.Reason})
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"invoice": inv})
}

func (s *Server) listInvoices(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	p := db.ListInvoicesParams{BusinessID: bizFrom(r).ID, Status: clean(ptr(v.Get("status"))), DocType: clean(ptr(v.Get("doc_type"))),
		PartyID: clean(ptr(v.Get("party_id"))), Q: clean(ptr(v.Get("q")))}
	p.From, _ = parseDate(v.Get("from"))
	p.To, _ = parseDate(v.Get("to"))
	if c := v.Get("cursor"); c != "" {
		d, id, _ := strings.Cut(c, "|")
		p.AfterDate, _ = parseDate(d)
		p.AfterID = &id
	}
	rows, err := s.Q.ListInvoices(r.Context(), p)
	if err != nil {
		fail(w, r, err)
		return
	}
	var next *string
	if len(rows) == 50 {
		l := rows[len(rows)-1]
		next = ptr(dateStr(l.InvoiceDate) + "|" + l.ID)
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows), "next_cursor": next})
}

func (s *Server) getInvoice(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	inv, err := s.Q.GetInvoice(r.Context(), db.GetInvoiceParams{ID: r.PathValue("id"), BusinessID: b.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	out := map[string]any{"invoice": inv}
	if inv.Status == "draft" {
		var in invoiceInput
		_ = json.Unmarshal(inv.Input, &in)
		st, err := s.loadSettings(r.Context(), s.Q, b.ID)
		if err != nil {
			fail(w, r, err)
			return
		}
		out["computed"] = nil
		if p, err := s.prepare(r.Context(), s.Q, b, st.BusinessSetting, in); err == nil {
			out["computed"] = p.out
		}
	} else {
		out["snapshot"] = inv.Snapshot
	}
	pays, err := s.Q.InvoicePayments(r.Context(), db.InvoicePaymentsParams{BusinessID: b.ID, InvoiceID: &inv.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	var paid int64
	for _, p := range pays {
		if p.VoidedAt == nil {
			paid += p.AmountPaise
		}
	}
	if v, err := s.Q.VoucherForInvoice(r.Context(), db.VoucherForInvoiceParams{BusinessID: b.ID, InvoiceID: &inv.ID}); err == nil {
		out["voucher_id"] = v.ID
	}
	out["payments"], out["paid_paise"] = nonNil(pays), paid
	writeJSON(w, 200, out)
}

func (s *Server) logoFor(ctx context.Context, bizID string, id *string) *pdf.Logo {
	if id == nil {
		return nil
	}
	l, err := s.Q.GetLogo(ctx, db.GetLogoParams{ID: *id, BusinessID: bizID})
	if err != nil {
		return nil
	}
	return &pdf.Logo{Data: l.Data, Type: map[string]string{"image/png": "PNG", "image/jpeg": "JPG"}[l.ContentType]}
}

func writePDF(w http.ResponseWriter, name string, data []byte) {
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+strings.NewReplacer("/", "-", `"`, "").Replace(name)+`.pdf"`)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func (s *Server) invoicePDF(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	inv, err := s.Q.GetInvoice(r.Context(), db.GetInvoiceParams{ID: r.PathValue("id"), BusinessID: b.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	var snap pdf.Invoice
	draft := inv.Status == "draft"
	if draft {
		var in invoiceInput
		_ = json.Unmarshal(inv.Input, &in)
		st, err := s.loadSettings(r.Context(), s.Q, b.ID)
		if err != nil {
			fail(w, r, err)
			return
		}
		p, err := s.prepare(r.Context(), s.Q, b, st.BusinessSetting, in)
		if err != nil {
			fail(w, r, err)
			return
		}
		if snap, err = s.buildSnapshot(r.Context(), b, st.BusinessSetting, p, "DRAFT", "DRAFT"); err != nil {
			fail(w, r, err)
			return
		}
	} else if err := json.Unmarshal(inv.Snapshot, &snap); err != nil {
		fail(w, r, err)
		return
	}
	var copies []string
	if c := r.URL.Query().Get("copies"); c != "" {
		for _, x := range strings.Split(c, ",") {
			if _, ok := map[string]bool{"original": true, "duplicate": true, "triplicate": true}[x]; ok {
				copies = append(copies, x)
			}
		}
	}
	if inv.Status == "cancelled" {
		snap.Doc.Title = "CANCELLED — " + snap.Doc.Title
	}
	data, err := pdf.RenderInvoice(snap, s.logoFor(r.Context(), b.ID, snap.Seller.LogoID), copies, draft)
	if err != nil {
		fail(w, r, err)
		return
	}
	writePDF(w, snap.Doc.No, data)
}
