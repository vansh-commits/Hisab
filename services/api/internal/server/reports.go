package server

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"hisab/internal/db"
	"hisab/internal/inr"
)

// period reads ?from=&to=, defaulting to the current FY to date.
func period(r *http.Request) (pgtype.Date, pgtype.Date, bool) {
	now := time.Now().In(ist)
	from, ok1 := parseDate(r.URL.Query().Get("from"))
	to, ok2 := parseDate(r.URL.Query().Get("to"))
	if r.URL.Query().Get("from") == "" {
		from, ok1 = pgtype.Date{Time: time.Date(fyStart(now), time.April, 1, 0, 0, 0, 0, time.UTC), Valid: true}, true
	}
	if r.URL.Query().Get("to") == "" {
		to, ok2 = parseDate(now.Format("2006-01-02"))
	}
	return from, to, ok1 && ok2
}

func badPeriod(w http.ResponseWriter, r *http.Request) {
	fail(w, r, unprocessable(map[string]string{"from": "use YYYY-MM-DD"}, ""))
}

// report writes JSON, or CSV when ?format=csv (amounts as plain rupees for spreadsheets).
func report(w http.ResponseWriter, r *http.Request, name string, items any, header []string, rows [][]string) {
	if r.URL.Query().Get("format") != "csv" {
		writeJSON(w, 200, map[string]any{"items": items})
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`.csv"`)
	cw := csv.NewWriter(w)
	_ = cw.Write(header)
	_ = cw.WriteAll(rows)
}

func rupees(p int64) string {
	sign := ""
	if p < 0 {
		sign, p = "-", -p
	}
	return fmt.Sprintf("%s%d.%02d", sign, p/100, p%100)
}

func grams(mg int64) string { return fmt.Sprintf("%d.%03d", mg/1000, mg%1000) }

func (s *Server) salesRegister(w http.ResponseWriter, r *http.Request) {
	from, to, ok := period(r)
	if !ok {
		badPeriod(w, r)
		return
	}
	items, err := s.Q.SalesRegister(r.Context(), db.SalesRegisterParams{BusinessID: bizFrom(r).ID, DateFrom: from, DateTo: to})
	if err != nil {
		fail(w, r, err)
		return
	}
	rows := [][]string{}
	for _, i := range items {
		rows = append(rows, []string{deref(i.InvoiceNo), dateStr(i.InvoiceDate), i.DocType, i.Status, i.BuyerName, deref(i.BuyerGstin),
			deref(i.PlaceOfSupply), deref(i.SupplyType), rupees(i.TaxablePaise), rupees(i.CgstPaise), rupees(i.SgstPaise), rupees(i.IgstPaise),
			rupees(i.TcsPaise), rupees(i.RoundOffPaise), rupees(i.GrandTotalPaise)})
	}
	report(w, r, "sales-register", nonNil(items), []string{"Invoice no", "Date", "Type", "Status", "Buyer", "GSTIN", "POS", "Supply",
		"Taxable", "CGST", "SGST", "IGST", "TCS", "Round off", "Total"}, rows)
}

func (s *Server) gstSummary(w http.ResponseWriter, r *http.Request) {
	from, to, ok := period(r)
	if !ok {
		badPeriod(w, r)
		return
	}
	items, err := s.Q.GSTSummary(r.Context(), db.GSTSummaryParams{BusinessID: bizFrom(r).ID, DateFrom: from, DateTo: to})
	if err != nil {
		fail(w, r, err)
		return
	}
	rows := [][]string{}
	for _, i := range items {
		kind := "B2C"
		if i.B2b {
			kind = "B2B"
		}
		rows = append(rows, []string{i.Month, kind, i.SupplyType, strconv.FormatInt(i.Invoices, 10), rupees(i.TaxablePaise),
			rupees(i.CgstPaise), rupees(i.SgstPaise), rupees(i.IgstPaise), rupees(i.TotalPaise)})
	}
	report(w, r, "gst-summary", nonNil(items), []string{"Month", "B2B/B2C", "Supply", "Invoices", "Taxable", "CGST", "SGST", "IGST", "Total"}, rows)
}

func (s *Server) hsnSummary(w http.ResponseWriter, r *http.Request) {
	from, to, ok := period(r)
	if !ok {
		badPeriod(w, r)
		return
	}
	b := bizFrom(r)
	groups, err := s.Q.HSNSummary(r.Context(), db.HSNSummaryParams{BusinessID: b.ID, DateFrom: from, DateTo: to})
	if err != nil {
		fail(w, r, err)
		return
	}
	qty, err := s.Q.HSNQuantities(r.Context(), db.HSNQuantitiesParams{BusinessID: b.ID, DateFrom: from, DateTo: to})
	if err != nil {
		fail(w, r, err)
		return
	}
	if r.URL.Query().Get("format") != "csv" {
		writeJSON(w, 200, map[string]any{"items": nonNil(groups), "quantities": nonNil(qty)})
		return
	}
	rows := [][]string{}
	for _, g := range groups {
		q := ""
		for _, x := range qty {
			if x.Hsn == g.Hsn && x.GstRate == g.GstRate {
				q += fmt.Sprintf("%s %s ", grams(x.QtyMilli), x.Unit)
			}
		}
		rows = append(rows, []string{g.Hsn, fmt.Sprintf("%d.%03d%%", g.GstRate/1000, g.GstRate%1000), q,
			rupees(g.TaxablePaise), rupees(g.CgstPaise), rupees(g.SgstPaise), rupees(g.IgstPaise)})
	}
	report(w, r, "hsn-summary", nil, []string{"HSN", "Rate", "Quantity", "Taxable", "CGST", "SGST", "IGST"}, rows)
}

func (s *Server) oldGoldRegister(w http.ResponseWriter, r *http.Request) {
	from, to, ok := period(r)
	if !ok {
		badPeriod(w, r)
		return
	}
	items, err := s.Q.OldGoldRegister(r.Context(), db.OldGoldRegisterParams{BusinessID: bizFrom(r).ID, DateFrom: from, DateTo: to})
	if err != nil {
		fail(w, r, err)
		return
	}
	rows := [][]string{}
	for _, i := range items {
		rows = append(rows, []string{i.VoucherNo, dateStr(i.VoucherDate), i.Status, i.SellerName, i.SellerKind, i.Settlement,
			deref(i.InvoiceNo), grams(i.NetWeightMg), rupees(i.TotalPaise)})
	}
	report(w, r, "old-gold-register", nonNil(items), []string{"Voucher no", "Date", "Status", "Seller", "Seller kind", "Settlement",
		"Against bill", "Net wt (g)", "Amount"}, rows)
}

type ledgerEntry struct {
	db.PartyLedgerRow
	BalancePaise int64 `json:"balance_paise"`
}

func (s *Server) partyLedger(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	party, err := s.Q.GetParty(r.Context(), db.GetPartyParams{ID: r.PathValue("id"), BusinessID: b.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	rows, err := s.Q.PartyLedger(r.Context(), db.PartyLedgerParams{BusinessID: b.ID, PartyID: &party.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	from, _ := parseDate(r.URL.Query().Get("from"))
	to, _ := parseDate(r.URL.Query().Get("to"))
	// Entries before ?from roll into the opening balance; entries after ?to are dropped.
	opening := party.OpeningBalancePaise
	bal := opening
	entries := []ledgerEntry{}
	for _, e := range rows {
		if to.Valid && e.Date.Time.After(to.Time) {
			break
		}
		bal += e.DebitPaise - e.CreditPaise
		if from.Valid && e.Date.Time.Before(from.Time) {
			opening = bal
			continue
		}
		entries = append(entries, ledgerEntry{e, bal})
	}
	writeJSON(w, 200, map[string]any{"party": map[string]any{"id": party.ID, "name": party.Name, "phone": party.Phone},
		"opening_balance_paise": opening, "entries": entries, "closing_balance_paise": bal})
}

func (s *Server) partyBalances(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Q.PartyBalances(r.Context(), bizFrom(r).ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": nonNil(rows)})
}

func (s *Server) home(w http.ResponseWriter, r *http.Request) {
	b := bizFrom(r)
	now := time.Now().In(ist)
	today, _ := parseDate(now.Format("2006-01-02"))
	month, _ := parseDate(now.Format("2006-01") + "-01")
	sales, err := s.Q.HomeSales(r.Context(), db.HomeSalesParams{BusinessID: b.ID, Today: today, MonthStart: month})
	if err != nil {
		fail(w, r, err)
		return
	}
	out, err := s.Q.Outstanding(r.Context(), b.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	recent, err := s.Q.ListInvoices(r.Context(), db.ListInvoicesParams{BusinessID: b.ID})
	if err != nil {
		fail(w, r, err)
		return
	}
	if len(recent) > 5 {
		recent = recent[:5]
	}
	rates, err := s.Q.ListRates(r.Context(), b.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"today_paise": sales.TodayPaise, "today_count": sales.TodayCount, "month_paise": sales.MonthPaise,
		"month_count": sales.MonthCount, "outstanding_paise": out, "outstanding": inr.Format(out), "recent": nonNil(recent), "rates": nonNil(rates)})
}
