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

// Copies are shop-chosen labels ("Customer", "Store"); old snapshots still hold these keys.
var copyLabel = map[string]string{
	"original":   "ORIGINAL — CUSTOMER COPY",
	"duplicate":  "DUPLICATE — SHOP COPY",
	"triplicate": "EXTRA COPY",
}

const (
	margin  = 14.0
	pageW   = 210 - 2*margin // usable width
	bottomY = 297 - margin
	lh      = 4.6 // body line height
)

type rgb [3]int

var (
	cGold  = rgb{154, 123, 47}
	cTint  = rgb{248, 242, 226}
	cRule  = rgb{222, 211, 184}
	cMuted = rgb{112, 104, 92}
	cInk   = rgb{30, 26, 22}
)

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

// day turns "2026-11-19" into "19 Nov 2026".
func day(d string) string {
	t, err := time.Parse("2006-01-02", d)
	if err != nil {
		return d
	}
	return t.Format("02 Jan 2006")
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
func (p page) ink(c rgb)                       { p.SetTextColor(c[0], c[1], c[2]) }
func (p page) draw(c rgb)                      { p.SetDrawColor(c[0], c[1], c[2]) }
func (p page) fill(c rgb)                      { p.SetFillColor(c[0], c[1], c[2]) }

// ensure starts a new page when h mm won't fit.
func (p page) ensure(h float64) {
	if p.GetY()+h > bottomY {
		p.AddPage()
		p.SetY(margin)
	}
}

func (p page) rule(y float64, c rgb, w float64) {
	p.draw(c)
	p.SetLineWidth(w)
	p.Line(margin, y, margin+pageW, y)
	p.SetLineWidth(0.2)
}

func shopName(s Seller) string {
	if s.TradeName != "" {
		return s.TradeName
	}
	return s.LegalName
}

// header draws logo + seller block, the copy label, and the document title.
func (p page) header(s Seller, title, label string, draft bool) {
	x0, logoBottom := margin, margin
	if p.logo != nil && (p.logo.Type == "PNG" || p.logo.Type == "JPG") {
		opt := fpdf.ImageOptions{ImageType: p.logo.Type, ReadDpi: false}
		info := p.RegisterImageOptionsReader("logo", opt, bytes.NewReader(p.logo.Data))
		if p.Ok() && info != nil && info.Width() > 0 {
			w, h := 24.0, 24*info.Height()/info.Width()
			if h > 26 {
				w, h = 26*info.Width()/info.Height(), 26
			}
			p.ImageOptions("logo", margin, margin, w, h, false, opt, 0, "")
			x0, logoBottom = margin+w+6, margin+h
		} else {
			p.ClearError() // a broken logo never blocks the bill
		}
	}
	right := 0.0
	if label != "" {
		p.text("B", 7)
		right = p.GetStringWidth(label) + 8
		p.draw(cGold)
		p.ink(cGold)
		p.SetXY(margin+pageW-right, margin)
		p.CellFormat(right, 6, label, "1", 0, "C", false, 0, "")
	}
	w := margin + pageW - x0
	p.SetXY(x0, margin-1)
	p.ink(cInk)
	p.text("B", 17)
	p.MultiCell(w-right-4, 8, shopName(s), "", "L", false)
	p.text("", 8.5)
	p.ink(cMuted)
	if s.TradeName != "" && s.TradeName != s.LegalName {
		p.SetX(x0)
		p.MultiCell(w, lh, s.LegalName, "", "L", false)
	}
	p.SetX(x0)
	p.MultiCell(w, lh, strings.TrimSpace(s.Address)+"\n"+s.State.Name+" ("+s.State.Code+")", "", "L", false)
	p.SetY(p.GetY() + 1)
	if s.GSTIN != nil || s.UdyamNo != nil {
		p.SetX(x0)
		p.ink(cInk)
		p.text("B", 8.5)
		id := []string{}
		if s.GSTIN != nil {
			id = append(id, "GSTIN: "+*s.GSTIN)
		}
		if s.UdyamNo != nil {
			id = append(id, "Udyam: "+*s.UdyamNo)
		}
		p.MultiCell(w, lh, strings.Join(id, "     "), "", "L", false)
	}
	contact := []string{}
	if s.Phone != nil {
		contact = append(contact, "Phone: "+*s.Phone)
	}
	if s.Email != nil {
		contact = append(contact, "Email: "+*s.Email)
	}
	if len(contact) > 0 {
		p.SetX(x0)
		p.ink(cMuted)
		p.text("", 8.5)
		p.MultiCell(w, lh, strings.Join(contact, "     "), "", "L", false)
	}
	y := max(p.GetY(), logoBottom) + 4
	p.rule(y, cGold, 0.6)
	p.SetXY(margin, y+2.5)
	p.ink(cGold)
	p.text("B", 13)
	p.CellFormat(pageW, 7, strings.ToUpper(title), "", 1, "C", false, 0, "")
	p.ink(cInk)
	p.SetY(p.GetY() + 2)
	if draft {
		p.watermark()
	}
}

func (p page) watermark() {
	p.SetTextColor(225, 205, 205)
	p.text("B", 90)
	p.TransformBegin()
	p.TransformRotate(35, 105, 160)
	p.Text(45, 190, "DRAFT")
	p.TransformEnd()
	p.ink(cInk)
}

// panel draws a titled, boxed block: an optional bold lead line (a name), free text (an
// address, kept on its own lines) and label/value rows. Empty values are skipped.
// h > 0 forces the box height (so side-by-side panels line up); it returns the content bottom.
type panelData struct {
	title, lead, body string
	rows              [][2]string
}

func (p page) panelContent(x, y, w float64, d panelData) float64 {
	in := w - 8
	p.SetXY(x+4, y+3.5)
	p.ink(cGold)
	p.text("B", 7.5)
	p.CellFormat(in, 4, strings.ToUpper(d.title), "", 2, "L", false, 0, "")
	p.SetY(p.GetY() + 1.5)
	if d.lead != "" {
		p.SetX(x + 4)
		p.ink(cInk)
		p.text("B", 10)
		p.MultiCell(in, 5.5, d.lead, "", "L", false)
	}
	if b := strings.TrimSpace(d.body); b != "" {
		p.SetX(x + 4)
		p.ink(cMuted)
		p.text("", 8.5)
		p.MultiCell(in, lh, b, "", "L", false)
		p.SetY(p.GetY() + 1.5)
	}
	for _, r := range d.rows {
		if r[1] == "" {
			continue
		}
		p.SetX(x + 4)
		p.ink(cMuted)
		p.text("", 8.5)
		p.CellFormat(30, 4.9, r[0], "", 0, "L", false, 0, "")
		p.ink(cInk)
		p.MultiCell(in-30, 4.9, r[1], "", "L", false)
	}
	return p.GetY() + 3
}

func (p page) box(x, y, w, h float64) {
	p.draw(cRule)
	p.RoundedRect(x, y, w, h, 2, "1234", "D")
}

// panels draws two panels side by side with equal heights; returns the bottom y.
func (p page) panels(l, r panelData) float64 {
	p.ensure(45)
	y, w := p.GetY(), (pageW-5)/2
	b := max(p.panelContent(margin, y, w, l), p.panelContent(margin+w+5, y, w, r))
	p.box(margin, y, w, b-y)
	p.box(margin+w+5, y, w, b-y)
	p.ink(cInk)
	return b
}

func partyPanel(title string, b Party) panelData {
	st := ""
	if b.State != nil {
		st = b.State.Name + " (" + b.State.Code + ")"
	}
	return panelData{title: title, lead: b.Name, body: b.Address, rows: [][2]string{{"GSTIN", str(b.GSTIN)}, {"State", st}, {"Phone", str(b.Phone)}, {"PAN", str(b.PAN)}}}
}

type col struct {
	w     float64
	head  string
	align string
}

// table draws a header row and body rows; the wrap column may span several lines.
func (p page) table(cols []col, rows [][]string, wrap int) {
	head := func() {
		p.fill(cTint)
		p.draw(cRule)
		p.ink(cMuted)
		p.text("B", 7.5)
		p.SetX(margin)
		for _, c := range cols {
			p.CellFormat(c.w, 8, c.head, "1", 0, c.align, true, 0, "")
		}
		p.Ln(-1)
	}
	p.SetCellMargin(2)
	defer p.SetCellMargin(1)
	p.ensure(20)
	head()
	for _, r := range rows {
		p.text("", 8.5)
		lines := p.SplitText(r[wrap], cols[wrap].w-4)
		h := max(8, float64(len(lines))*lh+3.4)
		if p.GetY()+h > bottomY {
			p.AddPage()
			p.SetY(margin)
			head()
			p.text("", 8.5)
		}
		p.ink(cInk)
		p.draw(cRule)
		x, y := margin, p.GetY()
		for i, c := range cols {
			if i == wrap {
				p.Rect(x, y, c.w, h, "D")
				p.SetXY(x, y+1.7)
				p.MultiCell(c.w, lh, r[i], "", "L", false)
			} else {
				p.SetXY(x, y)
				p.CellFormat(c.w, h, r[i], "1", 0, c.align, false, 0, "")
			}
			x += c.w
		}
		p.SetXY(margin, y+h)
	}
}

// section prints a small gold heading with space above it.
func (p page) section(title string) {
	p.SetY(p.GetY() + 4)
	p.ensure(18)
	p.SetX(margin)
	p.ink(cGold)
	p.text("B", 7.5)
	p.CellFormat(pageW, 5, strings.ToUpper(title), "", 1, "L", false, 0, "")
	p.SetY(p.GetY() + 1)
	p.ink(cInk)
}

const totW = 82.0

func (p page) totalRow(label, value string, strong bool) {
	x := margin + pageW - totW
	p.SetX(x)
	p.SetCellMargin(3)
	defer p.SetCellMargin(1)
	if strong {
		p.fill(cTint)
		p.ink(cInk)
		p.text("B", 10.5)
		y := p.GetY() + 1
		p.SetXY(x, y)
		p.CellFormat(totW-36, 9, label, "", 0, "L", true, 0, "")
		p.CellFormat(36, 9, value, "", 1, "R", true, 0, "")
		p.SetY(y + 10)
		return
	}
	p.ink(cMuted)
	p.text("", 9)
	p.CellFormat(totW-36, 6.5, label, "", 0, "L", false, 0, "")
	p.ink(cInk)
	p.CellFormat(36, 6.5, value, "", 1, "R", false, 0, "")
}

// words prints "label" over the amount in words in the left column of the totals band.
func (p page) words(label, text string) {
	w := pageW - totW - 8
	p.SetX(margin)
	p.ink(cMuted)
	p.text("", 7.5)
	p.CellFormat(w, 4.5, label, "", 2, "L", false, 0, "")
	p.SetX(margin)
	p.ink(cInk)
	p.text("B", 8.5)
	p.MultiCell(w, lh, text, "", "L", false)
	p.SetY(p.GetY() + 2.5)
}

// footer: bank details (one per line) beside the signature, then notes/terms/declaration.
func (p page) footer(s Seller, pr Print, notes string) {
	p.SetY(p.GetY() + 4)
	p.ensure(48)
	y, w := p.GetY(), 100.0
	b := s.Bank
	bottom := y + 32
	if b.Name != nil || b.AccountNo != nil || b.UPI != nil {
		bottom = max(bottom, p.panelContent(margin, y, w, panelData{title: "Bank details", rows: [][2]string{
			{"Bank", str(b.Name)}, {"Account name", str(b.AccountName)}, {"Account no", str(b.AccountNo)},
			{"IFSC", str(b.IFSC)}, {"Branch", str(b.Branch)}, {"UPI", str(b.UPI)}}}))
		p.box(margin, y, w, bottom-y)
	}
	sx, sw := margin+w+8, pageW-w-8
	p.SetXY(sx, y+3.5)
	p.ink(cInk)
	p.text("B", 9)
	p.MultiCell(sw, 5, "For "+shopName(s), "", "R", false)
	p.draw(cMuted)
	p.Line(sx+12, bottom-10, sx+sw, bottom-10)
	p.SetXY(sx, bottom-9)
	p.text("", 8.5)
	p.CellFormat(sw, 4.5, pr.SignatoryName, "", 2, "R", false, 0, "")
	p.ink(cMuted)
	p.text("", 7.5)
	p.CellFormat(sw, 4, "Authorised Signatory", "", 2, "R", false, 0, "")
	p.SetY(bottom + 4)

	for _, t := range [][2]string{{"Notes", notes}, {"Terms & conditions", pr.Terms}} {
		if strings.TrimSpace(t[1]) == "" {
			continue
		}
		p.ensure(14)
		p.SetX(margin)
		p.ink(cGold)
		p.text("B", 7.5)
		p.CellFormat(pageW, 4.5, strings.ToUpper(t[0]), "", 2, "L", false, 0, "")
		p.SetX(margin)
		p.ink(cInk)
		p.text("", 8)
		p.MultiCell(pageW, 4.2, strings.TrimSpace(t[1]), "", "L", false)
		p.SetY(p.GetY() + 2)
	}
	p.text("", 7.5)
	decl := p.SplitText(strings.TrimSpace(pr.Declaration), pageW)
	p.ensure(float64(len(decl))*3.8 + 9)
	p.ink(cMuted)
	if len(decl) > 0 && decl[0] != "" {
		p.SetX(margin)
		p.MultiCell(pageW, 3.8, strings.TrimSpace(pr.Declaration), "", "L", false)
	}
	p.rule(p.GetY()+1.5, cRule, 0.2)
	p.SetXY(margin, p.GetY()+3)
	end := "This is a computer-generated document."
	if pr.Jurisdiction != "" {
		end = pr.Jurisdiction + "  ·  " + end
	}
	p.CellFormat(pageW, 4, end, "", 1, "C", false, 0, "")
	p.ink(cInk)
}

func finish(f *fpdf.Fpdf) ([]byte, error) {
	var buf bytes.Buffer
	if err := f.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func newPage(created time.Time, logo *Logo) page {
	f := newDoc(created)
	f.SetMargins(margin, margin, margin)
	f.SetAutoPageBreak(false, margin)
	f.SetLineWidth(0.2)
	return page{f, logo}
}

var oldGoldCols = []col{{62, "Description", "L"}, {24, "Gross wt (g)", "R"}, {22, "Less (g)", "R"}, {24, "Net wt (g)", "R"}, {22, "Rate / g", "R"}, {28, "Amount", "R"}}

func oldGoldRows(ls []OldGoldLine) [][]string {
	out := [][]string{}
	for _, l := range ls {
		d := l.Description
		if l.Purity != nil {
			d += "\n" + *l.Purity
		}
		out = append(out, []string{d, weight(l.GrossWeightMg), weight(l.LessWeightMg), weight(l.NetWeightMg), rs(l.RatePaise), rs(l.AmountPaise)})
	}
	return out
}

// copyTitle turns a copy label into its page header: "Store" → "STORE COPY".
func copyTitle(c string) string {
	if l, ok := copyLabel[c]; ok {
		return l
	}
	l := strings.ToUpper(strings.TrimSpace(c))
	if !strings.Contains(l, "COPY") {
		l += " COPY"
	}
	return l
}

// RenderInvoice draws one page set per copy label in snap.Settings.Copies.
func RenderInvoice(snap Invoice, logo *Logo, draft bool) ([]byte, error) {
	copies := snap.Settings.Copies
	if len(copies) == 0 {
		copies = []string{"Customer"}
	}
	p := newPage(docTime(snap.Doc.Date), logo)
	tax := snap.Doc.Type == "tax_invoice"
	t := snap.Totals
	for _, c := range copies {
		p.AddPage()
		label := copyTitle(c)
		if draft {
			label = "DRAFT — NOT A VALID INVOICE"
		}
		p.header(snap.Seller, snap.Doc.Title, label, draft)

		pos := ""
		if snap.Doc.PlaceOfSupply != nil {
			pos = snap.Doc.PlaceOfSupply.Name + " (" + snap.Doc.PlaceOfSupply.Code + ")"
		}
		docRows := [][2]string{{"Invoice no", snap.Doc.No}, {"Invoice date", day(snap.Doc.Date)}}
		if d := str(snap.Doc.DateOfSupply); d != "" {
			docRows = append(docRows, [2]string{"Date of supply", day(d)})
		}
		docRows = append(docRows, [2]string{"Place of supply", pos})
		if tax {
			rc := "No"
			if snap.Doc.ReverseCharge {
				rc = "Yes"
			}
			docRows = append(docRows, [2]string{"Reverse charge", rc})
		}
		for _, k := range [][2]string{{"eway_bill_no", "E-way bill"}, {"buyer_order_no", "Buyer order"}, {"dispatch_doc_no", "Dispatch doc"}, {"terms_of_delivery", "Delivery terms"}} {
			if v := snap.Doc.Refs[k[0]]; v != nil {
				docRows = append(docRows, [2]string{k[1], *v})
			}
		}
		p.SetY(p.panels(panelData{title: "Invoice details", rows: docRows}, partyPanel("Bill to", snap.Buyer)))
		if snap.Consignee != nil {
			p.SetY(p.GetY() + 4)
			p.ensure(40)
			y := p.GetY()
			b := p.panelContent(margin, y, pageW, partyPanel("Ship to", *snap.Consignee))
			p.box(margin, y, pageW, b-y)
			p.SetY(b)
		}

		p.SetY(p.GetY() + 5)
		cols := []col{{8, "#", "C"}, {50, "Description", "L"}, {15, "HSN", "C"}, {20, "Gross wt", "R"}, {23, "Net wt / Qty", "R"}, {21, "Rate", "R"}, {20, "Making", "R"}, {25, "Amount", "R"}}
		rows := [][]string{}
		derived := false
		for _, l := range snap.Lines {
			meta := []string{}
			if l.Purity != nil {
				meta = append(meta, *l.Purity)
			}
			if l.HUID != nil {
				meta = append(meta, "HUID "+*l.HUID)
			}
			if tax {
				meta = append(meta, "GST "+pct(l.GSTRate))
			}
			d := l.Description
			if len(meta) > 0 {
				d += "\n" + strings.Join(meta, "  ·  ")
			}
			gross, q, rate := "—", "", ""
			if l.GrossWeightMg != nil {
				gross = weight(*l.GrossWeightMg) + " g"
			}
			if l.QtyMilli != 0 {
				q = qty(l.QtyMilli, l.Unit)
				rate = rs(l.RatePaise)
				if l.RateDerived {
					rate += "*"
					derived = true
				}
			}
			mk := int64(0)
			if l.Making != nil {
				mk = l.Making.Paise
			}
			extra := "—"
			if mk+l.OtherPaise != 0 {
				extra = rs(mk + l.OtherPaise)
			}
			rows = append(rows, []string{fmt.Sprint(l.SNo), d, str(l.HSN), gross, q, rate, extra, rs(l.TaxablePaise)})
		}
		p.table(cols, rows, 1)
		if derived {
			p.SetX(margin)
			p.ink(cMuted)
			p.text("", 7.5)
			p.CellFormat(pageW, 5, "* Rate worked out from the total amount.", "", 1, "L", false, 0, "")
			p.ink(cInk)
		}

		if tax && len(snap.TaxGroups) > 0 {
			p.section("Tax summary (HSN-wise)")
			var gc []col
			gr := [][]string{}
			if t.SupplyType == "inter" {
				gc = []col{{40, "HSN / SAC", "C"}, {30, "GST rate", "C"}, {56, "Taxable value", "R"}, {56, "IGST", "R"}}
				for _, g := range snap.TaxGroups {
					gr = append(gr, []string{g.HSN, pct(g.GSTRate), rs(g.TaxablePaise), rs(g.IGSTPaise)})
				}
			} else {
				gc = []col{{34, "HSN / SAC", "C"}, {24, "GST rate", "C"}, {44, "Taxable value", "R"}, {40, "CGST", "R"}, {40, t.SGSTLabel, "R"}}
				for _, g := range snap.TaxGroups {
					gr = append(gr, []string{g.HSN, pct(g.GSTRate), rs(g.TaxablePaise), rs(g.CGSTPaise), rs(g.SGSTPaise)})
				}
			}
			p.table(gc, gr, 0)
		}

		// totals on the right, amount in words on the left
		p.SetY(p.GetY() + 4)
		p.ensure(55)
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
			p.totalRow("Less: old gold ("+snap.OldGold.VoucherNo+")", "− "+rs(t.OldGoldPaise), false)
			p.totalRow("Net payable (₹)", rs(t.NetPayablePaise), true)
		}
		bottom := p.GetY()
		p.SetY(top + 1)
		p.words("Amount in words", snap.Words.GrandTotal)
		if tax && snap.Words.Tax != "" {
			p.words("Tax in words", snap.Words.Tax)
		}
		if t.OldGoldPaise != 0 {
			p.words("Net payable in words", snap.Words.NetPayable)
		}
		p.SetY(max(bottom, p.GetY()))

		if og := snap.OldGold; og != nil {
			p.section("Old gold received in exchange — voucher " + og.VoucherNo + " (no GST)")
			p.table(oldGoldCols, oldGoldRows(og.Lines), 0)
		}
		p.footer(snap.Seller, snap.Settings, snap.Notes)
	}
	return finish(p.Fpdf)
}

// RenderVoucher draws an old-gold purchase voucher (one copy).
func RenderVoucher(v Voucher, logo *Logo) ([]byte, error) {
	p := newPage(docTime(v.Doc.Date), logo)
	p.AddPage()
	p.header(v.Seller, v.Doc.Title, "", false)
	settle := map[string]string{"exchange": "Adjusted against invoice " + str(v.InvoiceNo), "paid": "Paid (" + str(v.PaidMode) + ")", "on_account": "Credited to customer account"}[v.Settlement]
	kind := map[string]string{"individual": "Individual (personal jewellery)", "business": "Unregistered dealer"}[v.SellerKind]
	p.SetY(p.panels(
		panelData{title: "Voucher details", rows: [][2]string{{"Voucher no", v.Doc.No}, {"Date", day(v.Doc.Date)}, {"Settlement", settle}, {"Seller type", kind}}},
		partyPanel("Purchased from", v.From)))
	p.section("Old gold")
	p.table(oldGoldCols, oldGoldRows(v.Lines), 0)
	p.SetY(p.GetY() + 6)
	p.ensure(40)
	top := p.GetY()
	if v.Totals.RoundOffPaise != 0 {
		p.totalRow("Round off", rs(v.Totals.RoundOffPaise), false)
	}
	p.totalRow("Total (₹)", rs(v.Totals.TotalPaise), true)
	bottom := p.GetY()
	p.SetY(top + 1)
	p.words("Amount in words", v.Words)
	p.words("Note", "Purchase of used gold from an unregistered person. No GST charged.")
	p.SetY(max(bottom, p.GetY()) + 14)
	p.draw(cMuted)
	p.Line(margin, p.GetY(), margin+60, p.GetY())
	p.SetXY(margin, p.GetY()+1)
	p.text("", 8)
	p.ink(cMuted)
	p.CellFormat(60, 4, "Seller's signature", "", 1, "L", false, 0, "")
	p.ink(cInk)
	p.footer(v.Seller, Print{SignatoryName: v.Print.SignatoryName}, "")
	return finish(p.Fpdf)
}
