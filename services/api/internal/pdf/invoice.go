package pdf

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"hisab/internal/inr"
)

// ── Snapshot (docs/schema.md "Snapshot document") ───────────────────────

type State struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type Party struct {
	Name    string  `json:"name"`
	Address string  `json:"address"`
	State   *State  `json:"state"`
	GSTIN   *string `json:"gstin"`
	Phone   *string `json:"phone"`
	PAN     *string `json:"pan"`
}

type Bank struct {
	Name        *string `json:"name"`
	AccountName *string `json:"account_name"`
	AccountNo   *string `json:"account_no"`
	IFSC        *string `json:"ifsc"`
	Branch      *string `json:"branch"`
	UPI         *string `json:"upi_id"`
}

type Seller struct {
	LegalName string  `json:"legal_name"`
	TradeName string  `json:"trade_name"`
	Address   string  `json:"address"`
	State     State   `json:"state"`
	GSTIN     *string `json:"gstin"`
	UdyamNo   *string `json:"udyam_no"`
	Phone     *string `json:"phone"`
	Email     *string `json:"email"`
	LogoID    *string `json:"logo_id"`
	Bank      Bank    `json:"bank"`
}

type Making struct {
	Mode  string `json:"mode"`
	Value int64  `json:"value"`
	Paise int64  `json:"paise"`
}

type Line struct {
	SNo           int     `json:"sno"`
	Kind          string  `json:"kind"`
	Description   string  `json:"description"`
	HSN           *string `json:"hsn"`
	Purity        *string `json:"purity"`
	HUID          *string `json:"huid"`
	Unit          string  `json:"unit"`
	GrossWeightMg *int64  `json:"gross_weight_mg"`
	QtyMilli      int64   `json:"qty_milli"`
	RatePaise     int64   `json:"rate_paise"`
	RateDerived   bool    `json:"rate_derived"`
	MetalPaise    int64   `json:"metal_paise"`
	Making        *Making `json:"making"`
	OtherPaise    int64   `json:"other_paise"`
	OtherLabel    *string `json:"other_label"`
	TaxablePaise  int64   `json:"taxable_paise"`
	GSTRate       int64   `json:"gst_rate"`
}

type Group struct {
	HSN          string `json:"hsn"`
	GSTRate      int64  `json:"gst_rate"`
	TaxablePaise int64  `json:"taxable_paise"`
	CGSTPaise    int64  `json:"cgst_paise"`
	SGSTPaise    int64  `json:"sgst_paise"`
	IGSTPaise    int64  `json:"igst_paise"`
}

type Totals struct {
	SupplyType      string `json:"supply_type"`
	SGSTLabel       string `json:"sgst_label"`
	TaxablePaise    int64  `json:"taxable_paise"`
	CGSTPaise       int64  `json:"cgst_paise"`
	SGSTPaise       int64  `json:"sgst_paise"`
	IGSTPaise       int64  `json:"igst_paise"`
	TCSPaise        int64  `json:"tcs_paise"`
	RoundOffPaise   int64  `json:"round_off_paise"`
	GrandTotalPaise int64  `json:"grand_total_paise"`
	OldGoldPaise    int64  `json:"old_gold_paise"`
	NetPayablePaise int64  `json:"net_payable_paise"`
}

type OldGoldLine struct {
	Description   string  `json:"description"`
	Purity        *string `json:"purity"`
	GrossWeightMg int64   `json:"gross_weight_mg"`
	LessWeightMg  int64   `json:"less_weight_mg"`
	NetWeightMg   int64   `json:"net_weight_mg"`
	RatePaise     int64   `json:"rate_paise"`
	AmountPaise   int64   `json:"amount_paise"`
}

type OldGold struct {
	VoucherNo     string        `json:"voucher_no"`
	SellerKind    string        `json:"seller_kind"`
	Lines         []OldGoldLine `json:"lines"`
	RoundOffPaise int64         `json:"round_off_paise"`
	TotalPaise    int64         `json:"total_paise"`
}

type Doc struct {
	Type          string             `json:"type"`
	Title         string             `json:"title"`
	No            string             `json:"no"`
	Date          string             `json:"date"`
	DateOfSupply  *string            `json:"date_of_supply"`
	PlaceOfSupply *State             `json:"place_of_supply"`
	ReverseCharge bool               `json:"reverse_charge"`
	Refs          map[string]*string `json:"refs"`
}

type Print struct {
	Copies        []string `json:"copies"`
	Terms         string   `json:"terms"`
	Declaration   string   `json:"declaration"`
	Jurisdiction  string   `json:"jurisdiction"`
	SignatoryName string   `json:"signatory_name"`
}

type Template struct {
	Version string          `json:"version"`
	Config  json.RawMessage `json:"config"`
}

type Invoice struct {
	Schema        int      `json:"schema"`
	EngineVersion int      `json:"engine_version"`
	Template      Template `json:"template"`
	Doc           Doc      `json:"doc"`
	Seller        Seller   `json:"seller"`
	Buyer         Party    `json:"buyer"`
	Consignee     *Party   `json:"consignee"`
	Lines         []Line   `json:"lines"`
	TaxGroups     []Group  `json:"tax_groups"`
	Totals        Totals   `json:"totals"`
	OldGold       *OldGold `json:"old_gold"`
	Settings      Print    `json:"settings"`
	Words         Words    `json:"words"`
	Notes         string   `json:"notes"`
}

type Words struct {
	GrandTotal string `json:"grand_total"`
	Tax        string `json:"tax"`
	NetPayable string `json:"net_payable"`
}

// Voucher is the purchase_vouchers.snapshot shape.
type Voucher struct {
	Schema     int           `json:"schema"`
	Template   Template      `json:"template"`
	Doc        Doc           `json:"doc"`
	Seller     Seller        `json:"seller"` // our business (the buyer of the gold)
	From       Party         `json:"from"`   // who sold us the gold
	SellerKind string        `json:"seller_kind"`
	Lines      []OldGoldLine `json:"lines"`
	Totals     struct {
		TotalPaise    int64 `json:"total_paise"`
		RoundOffPaise int64 `json:"round_off_paise"`
	} `json:"totals"`
	Settlement string  `json:"settlement"`
	PaidMode   *string `json:"paid_mode"`
	InvoiceNo  *string `json:"invoice_no"`
	Words      string  `json:"words"`
	Print      Print   `json:"settings"`
}

// Logo is the raw image; Type is "PNG" or "JPG" (WebP isn't supported by fpdf and is skipped).
type Logo struct {
	Data []byte
	Type string
}

// ── rendering ────────────────────────────────────────────────────────────

var copyLabel = map[string]string{
	"original":   "ORIGINAL FOR RECIPIENT",
	"duplicate":  "DUPLICATE FOR TRANSPORTER",
	"triplicate": "TRIPLICATE FOR SUPPLIER",
}

const pageW = 190.0 // A4 minus 10 mm margins

func rs(p int64) string { return inr.Format(p) }

// weight renders milli-units: 31370 → "31.370".
func weight(m int64) string { return fmt.Sprintf("%d.%03d", m/1000, m%1000) }

func qty(m int64, unit string) string {
	if unit == "g" || unit == "ct" {
		return weight(m) + " " + unit
	}
	s := strings.TrimRight(strings.TrimRight(weight(m), "0"), ".")
	return s + " " + unit
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func pct(milli int64) string {
	s := strings.TrimRight(strings.TrimRight(fmt.Sprintf("%d.%03d", milli/1000, milli%1000), "0"), ".")
	return s + "%"
}

// docTime turns the document date into the PDF creation date, so re-renders are byte-identical.
func docTime(date string) time.Time {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	}
	return t
}

type page struct {
	*fpdf.Fpdf
	logo *Logo
}

func (p page) text(style string, size float64) { p.SetFont("Noto", style, size) }

// header draws the seller block, the copy label and the title bar.
func (p page) header(s Seller, title, label string, draft bool) {
	x0 := p.GetX()
	if p.logo != nil && (p.logo.Type == "PNG" || p.logo.Type == "JPG") {
		opt := fpdf.ImageOptions{ImageType: p.logo.Type, ReadDpi: false}
		p.RegisterImageOptionsReader("logo", opt, bytes.NewReader(p.logo.Data))
		if p.Ok() {
			p.ImageOptions("logo", 10, 10, 22, 0, false, opt, 0, "")
			x0 = 36
		} else {
			p.ClearError() // a broken logo never blocks the bill
		}
	}
	p.SetXY(x0, 10)
	p.text("", 7)
	p.CellFormat(pageW+10-x0, 4, label, "", 1, "R", false, 0, "")
	p.SetX(x0)
	p.text("B", 15)
	name := s.TradeName
	if name == "" {
		name = s.LegalName
	}
	p.CellFormat(0, 7, name, "", 1, "L", false, 0, "")
	p.text("", 8)
	lines := []string{}
	if s.TradeName != "" && s.TradeName != s.LegalName {
		lines = append(lines, s.LegalName)
	}
	lines = append(lines, s.Address, s.State.Name+" ("+s.State.Code+")")
	id := []string{}
	if s.GSTIN != nil {
		id = append(id, "GSTIN: "+*s.GSTIN)
	}
	if s.UdyamNo != nil {
		id = append(id, "Udyam: "+*s.UdyamNo)
	}
	if s.Phone != nil {
		id = append(id, "Ph: "+*s.Phone)
	}
	if s.Email != nil {
		id = append(id, *s.Email)
	}
	lines = append(lines, strings.Join(id, "  ·  "))
	for _, l := range lines {
		p.SetX(x0)
		p.CellFormat(0, 4, l, "", 1, "L", false, 0, "")
	}
	if p.GetY() < 34 {
		p.SetY(34)
	}
	p.Ln(1)
	p.SetFillColor(246, 238, 217)
	p.text("B", 11)
	p.CellFormat(pageW, 7, title, "1", 1, "C", true, 0, "")
	if draft {
		p.watermark()
	}
}

func (p page) watermark() {
	p.SetTextColor(220, 200, 200)
	p.text("B", 90)
	p.TransformBegin()
	p.TransformRotate(35, 105, 160)
	p.Text(45, 190, "DRAFT")
	p.TransformEnd()
	p.SetTextColor(0, 0, 0)
}

// kv draws "label: value" rows in a box at x with width w; returns the bottom y.
func (p page) kv(x, y, w float64, title string, rows [][2]string) float64 {
	p.SetXY(x, y)
	p.text("B", 8)
	p.CellFormat(w, 5, title, "", 2, "L", false, 0, "")
	for _, r := range rows {
		if r[1] == "" {
			continue
		}
		p.SetX(x)
		p.text("", 8)
		if r[0] == "" {
			p.MultiCell(w, 4, r[1], "", "L", false)
			continue
		}
		p.CellFormat(28, 4, r[0], "", 0, "L", false, 0, "")
		p.MultiCell(w-28, 4, r[1], "", "L", false)
	}
	return p.GetY()
}

func partyRows(b Party) [][2]string {
	st := ""
	if b.State != nil {
		st = b.State.Name + " (" + b.State.Code + ")"
	}
	return [][2]string{{"", b.Name}, {"", b.Address}, {"State", st}, {"GSTIN", str(b.GSTIN)}, {"Phone", str(b.Phone)}, {"PAN", str(b.PAN)}}
}

type col struct {
	w     float64
	head  string
	align string
}

// table draws a header row and body rows; the first wrapped column grows the row height.
func (p page) table(cols []col, rows [][]string, wrap int) {
	p.SetFillColor(246, 238, 217)
	p.text("B", 7.5)
	for _, c := range cols {
		p.CellFormat(c.w, 6, c.head, "1", 0, "C", true, 0, "")
	}
	p.Ln(-1)
	p.text("", 8)
	for _, r := range rows {
		parts := p.SplitText(r[wrap], cols[wrap].w-2)
		h := 5 * float64(max(1, len(parts)))
		if p.GetY()+h > 277 {
			p.AddPage()
		}
		x, y := p.GetX(), p.GetY()
		for i, c := range cols {
			if i == wrap {
				p.Rect(x, y, c.w, h, "D")
				p.SetXY(x+1, y)
				p.MultiCell(c.w-2, 5, r[i], "", "L", false)
				p.SetXY(x+c.w, y)
			} else {
				p.CellFormat(c.w, h, r[i], "1", 0, c.align, false, 0, "")
			}
			x += c.w
		}
		p.SetXY(10, y+h)
	}
}

func (p page) totalRow(label, value string, bold bool) {
	st := ""
	if bold {
		st = "B"
	}
	p.text(st, 9)
	p.SetX(110)
	p.CellFormat(55, 5.5, label, "1", 0, "L", false, 0, "")
	p.CellFormat(35, 5.5, value, "1", 1, "R", false, 0, "")
}

func (p page) footer(s Seller, pr Print, notes string) {
	p.Ln(2)
	p.text("", 7.5)
	b := s.Bank
	if b.Name != nil || b.AccountNo != nil || b.UPI != nil {
		parts := []string{}
		for _, kv := range [][2]string{{"Bank", str(b.Name)}, {"A/c name", str(b.AccountName)}, {"A/c no", str(b.AccountNo)}, {"IFSC", str(b.IFSC)}, {"Branch", str(b.Branch)}, {"UPI", str(b.UPI)}} {
			if kv[1] != "" {
				parts = append(parts, kv[0]+": "+kv[1])
			}
		}
		p.MultiCell(pageW, 4, strings.Join(parts, "  ·  "), "", "L", false)
	}
	for _, t := range []string{notes, pr.Terms, pr.Declaration, pr.Jurisdiction} {
		if t != "" {
			p.MultiCell(pageW, 4, t, "", "L", false)
		}
	}
	if p.GetY() > 255 {
		p.AddPage()
	}
	p.Ln(4)
	name := s.TradeName
	if name == "" {
		name = s.LegalName
	}
	p.text("B", 8.5)
	p.CellFormat(pageW, 5, "For "+name, "", 1, "R", false, 0, "")
	p.Ln(10)
	p.text("", 8)
	p.CellFormat(pageW, 4, pr.SignatoryName, "", 1, "R", false, 0, "")
	p.CellFormat(pageW, 4, "Authorised Signatory", "", 1, "R", false, 0, "")
}

func finish(f *fpdf.Fpdf) ([]byte, error) {
	var buf bytes.Buffer
	if err := f.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// RenderInvoice draws one page set per copy. copies overrides snap.Settings.Copies when non-empty.
func RenderInvoice(snap Invoice, logo *Logo, copies []string, draft bool) ([]byte, error) {
	if len(copies) == 0 {
		copies = snap.Settings.Copies
	}
	if len(copies) == 0 {
		copies = []string{"original"}
	}
	f := newDoc(docTime(snap.Doc.Date))
	f.SetMargins(10, 10, 10)
	f.SetAutoPageBreak(false, 10)
	p := page{f, logo}
	tax := snap.Doc.Type == "tax_invoice"
	t := snap.Totals
	for _, c := range copies {
		p.AddPage()
		label := copyLabel[c]
		if draft {
			label = "DRAFT — NOT A VALID INVOICE"
		}
		p.header(snap.Seller, snap.Doc.Title, label, draft)

		y := p.GetY() + 1
		pos := ""
		if snap.Doc.PlaceOfSupply != nil {
			pos = snap.Doc.PlaceOfSupply.Name + " (" + snap.Doc.PlaceOfSupply.Code + ")"
		}
		rc := "No"
		if snap.Doc.ReverseCharge {
			rc = "Yes"
		}
		docRows := [][2]string{{"Invoice no", snap.Doc.No}, {"Date", snap.Doc.Date}, {"Date of supply", str(snap.Doc.DateOfSupply)}, {"Place of supply", pos}}
		if tax {
			docRows = append(docRows, [2]string{"Reverse charge", rc})
		}
		for _, k := range []string{"eway_bill_no", "buyer_order_no", "dispatch_doc_no", "terms_of_delivery"} {
			if v := snap.Doc.Refs[k]; v != nil {
				docRows = append(docRows, [2]string{strings.ReplaceAll(strings.TrimSuffix(k, "_no"), "_", " "), *v})
			}
		}
		y1 := p.kv(10, y, 92, "", docRows)
		y2 := p.kv(105, y, 95, "Bill to", partyRows(snap.Buyer))
		if snap.Consignee != nil {
			y2 = p.kv(105, y2+1, 95, "Ship to", partyRows(*snap.Consignee))
		}
		p.SetXY(10, max(y1, y2)+2)

		cols := []col{{8, "#", "C"}, {58, "Description", "L"}, {16, "HSN", "C"}, {18, "Gross wt", "R"}, {22, "Net wt / Qty", "R"}, {22, "Rate", "R"}, {20, "Making / other", "R"}, {26, "Taxable value", "R"}}
		rows := [][]string{}
		for _, l := range snap.Lines {
			d := l.Description
			if l.Purity != nil {
				d += " · " + *l.Purity
			}
			if l.HUID != nil {
				d += " · HUID " + *l.HUID
			}
			if tax {
				d += " · GST " + pct(l.GSTRate)
			}
			gross, q, rate := "", "", ""
			if l.GrossWeightMg != nil {
				gross = weight(*l.GrossWeightMg)
			}
			if l.QtyMilli != 0 {
				q = qty(l.QtyMilli, l.Unit)
				rate = rs(l.RatePaise)
				if l.RateDerived {
					rate += "*"
				}
			}
			mk := int64(0)
			if l.Making != nil {
				mk = l.Making.Paise
			}
			extra := ""
			if mk+l.OtherPaise != 0 {
				extra = rs(mk + l.OtherPaise)
			}
			rows = append(rows, []string{fmt.Sprint(l.SNo), d, str(l.HSN), gross, q, rate, extra, rs(l.TaxablePaise)})
		}
		p.table(cols, rows, 1)

		if tax && len(snap.TaxGroups) > 0 {
			p.Ln(2)
			gc := []col{{30, "HSN/SAC", "C"}, {20, "GST rate", "C"}, {40, "Taxable", "R"}, {33, "CGST", "R"}, {33, t.SGSTLabel, "R"}, {34, "IGST", "R"}}
			gr := [][]string{}
			for _, g := range snap.TaxGroups {
				gr = append(gr, []string{g.HSN, pct(g.GSTRate), rs(g.TaxablePaise), rs(g.CGSTPaise), rs(g.SGSTPaise), rs(g.IGSTPaise)})
			}
			p.table(gc, gr, 0)
		}

		p.Ln(2)
		if p.GetY() > 230 {
			p.AddPage()
		}
		top := p.GetY()
		p.totalRow("Taxable value", rs(t.TaxablePaise), false)
		if tax {
			if t.SupplyType == "inter" {
				p.totalRow("IGST", rs(t.IGSTPaise), false)
			} else {
				p.totalRow("CGST", rs(t.CGSTPaise), false)
				p.totalRow(t.SGSTLabel, rs(t.SGSTPaise), false)
			}
		}
		if t.TCSPaise != 0 {
			p.totalRow("TCS", rs(t.TCSPaise), false)
		}
		if t.RoundOffPaise != 0 {
			p.totalRow("Round off", rs(t.RoundOffPaise), false)
		}
		p.totalRow("Grand total (₹)", rs(t.GrandTotalPaise), true)
		if t.OldGoldPaise != 0 {
			p.totalRow("Less: old gold ("+snap.OldGold.VoucherNo+")", "-"+rs(t.OldGoldPaise), false)
			p.totalRow("Net payable (₹)", rs(t.NetPayablePaise), true)
		}
		bottom := p.GetY()
		p.SetXY(10, top)
		p.text("", 8)
		w := []string{"Amount in words: " + snap.Words.GrandTotal}
		if tax && snap.Words.Tax != "" {
			w = append(w, "Tax in words: "+snap.Words.Tax)
		}
		if t.OldGoldPaise != 0 {
			w = append(w, "Net payable: "+snap.Words.NetPayable)
		}
		for _, s := range w {
			p.SetX(10)
			p.MultiCell(96, 4, s, "", "L", false)
		}
		p.SetY(max(bottom, p.GetY()) + 2)

		if og := snap.OldGold; og != nil {
			p.text("B", 8)
			p.CellFormat(pageW, 5, "Old gold received in exchange — purchase voucher "+og.VoucherNo+" (no GST)", "", 1, "L", false, 0, "")
			oc := []col{{70, "Description", "L"}, {24, "Gross wt", "R"}, {22, "Less", "R"}, {24, "Net wt", "R"}, {22, "Rate/g", "R"}, {28, "Amount", "R"}}
			or := [][]string{}
			for _, l := range og.Lines {
				or = append(or, []string{l.Description + " " + str(l.Purity), weight(l.GrossWeightMg), weight(l.LessWeightMg), weight(l.NetWeightMg), rs(l.RatePaise), rs(l.AmountPaise)})
			}
			p.table(oc, or, 0)
		}
		p.footer(snap.Seller, snap.Settings, snap.Notes)
	}
	return finish(f)
}

// RenderVoucher draws an old-gold purchase voucher (one copy).
func RenderVoucher(v Voucher, logo *Logo) ([]byte, error) {
	f := newDoc(docTime(v.Doc.Date))
	f.SetMargins(10, 10, 10)
	f.SetAutoPageBreak(false, 10)
	p := page{f, logo}
	p.AddPage()
	p.header(v.Seller, v.Doc.Title, "", false)
	y := p.GetY() + 1
	settle := map[string]string{"exchange": "Adjusted against invoice " + str(v.InvoiceNo), "paid": "Paid (" + str(v.PaidMode) + ")", "on_account": "Credited to customer account"}[v.Settlement]
	kind := map[string]string{"individual": "Individual (personal jewellery)", "business": "Unregistered dealer"}[v.SellerKind]
	y1 := p.kv(10, y, 92, "", [][2]string{{"Voucher no", v.Doc.No}, {"Date", v.Doc.Date}, {"Settlement", settle}, {"Seller type", kind}})
	y2 := p.kv(105, y, 95, "Purchased from", partyRows(v.From))
	p.SetXY(10, max(y1, y2)+2)
	oc := []col{{70, "Description", "L"}, {24, "Gross wt", "R"}, {22, "Less", "R"}, {24, "Net wt", "R"}, {22, "Rate/g", "R"}, {28, "Amount", "R"}}
	or := [][]string{}
	for _, l := range v.Lines {
		or = append(or, []string{l.Description + " " + str(l.Purity), weight(l.GrossWeightMg), weight(l.LessWeightMg), weight(l.NetWeightMg), rs(l.RatePaise), rs(l.AmountPaise)})
	}
	p.table(oc, or, 0)
	p.Ln(2)
	if v.Totals.RoundOffPaise != 0 {
		p.totalRow("Round off", rs(v.Totals.RoundOffPaise), false)
	}
	p.totalRow("Total (₹)", rs(v.Totals.TotalPaise), true)
	p.text("", 8)
	p.MultiCell(pageW, 4, "Amount in words: "+v.Words, "", "L", false)
	p.MultiCell(pageW, 4, "Purchase of used gold from an unregistered person. No GST charged.", "", "L", false)
	p.Ln(10)
	p.CellFormat(95, 4, "Seller's signature", "", 0, "L", false, 0, "")
	p.footer(v.Seller, Print{SignatoryName: v.Print.SignatoryName}, "")
	return finish(f)
}
