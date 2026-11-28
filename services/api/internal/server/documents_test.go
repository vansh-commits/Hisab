package server

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"testing"
)

// active makes an onboarded regular-GST business in Maharashtra (27) with prefix SJ/ and 4 digits.
func (hs *harness) active(emailAddr string) *http.Cookie {
	hs.t.Helper()
	c := hs.approved(emailAddr)
	expect(hs.t, hs.do("PATCH", "/api/business", map[string]any{"registration_type": "regular", "gstin": "27AAPFU0939F1ZV",
		"legal_name": "Soni Jewellers", "trade_name": "Soni Jewellers", "address_line1": "12 Zaveri Bazaar", "city": "Mumbai", "pincode": "400002"}, c), 200)
	expect(hs.t, hs.do("PATCH", "/api/settings", map[string]any{"invoice_prefix": "SJ/", "number_min_digits": 4, "copies": []string{"Customer", "Store"}}, c), 200)
	expect(hs.t, hs.do("POST", "/api/onboarding/complete", nil, c), 200)
	return c
}

func billB() map[string]any {
	return map[string]any{"description": "22K Gold Jewellery", "hsn": "7113", "purity": "22K", "unit": "g", "gross_weight_mg": 31800,
		"qty_milli": 31370, "rate_paise": 1345700, "making": map[string]any{"mode": "per_gram", "value": 35000}, "gst_rate": 3000}
}

func input(lines ...map[string]any) map[string]any {
	return map[string]any{"invoice_date": "2026-11-16", "buyer": map[string]any{"name": "Ramesh", "address": "Andheri, Mumbai", "state_code": "27"}, "lines": lines}
}

func TestInvoiceLifecycle(t *testing.T) {
	hs := newHarness(t)
	approvedOnly := hs.approved("half@example.com")
	expect(t, hs.do("POST", "/api/invoices/compute", map[string]any{"input": input(billB())}, approvedOnly), 403)

	c := hs.active("owner@example.com")

	// Bill B: compute, then a wrong expected total burns no number.
	comp := expect(t, hs.do("POST", "/api/invoices/compute", map[string]any{"input": input(billB())}, c), 200)
	if comp["grand_total_paise"].(float64) != 44611900 || comp["cgst_paise"].(float64) != 649688 || comp["supply_type"] != "intra" {
		t.Fatalf("bill B compute: %v", comp)
	}
	expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": input(billB()), "issue": true, "expected_grand_total_paise": 1}, c), 409, "totals_mismatch")
	inv := expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": input(billB()), "issue": true, "expected_grand_total_paise": 44611900}, c), 201)["invoice"].(map[string]any)
	if inv["invoice_no"] != "SJ/26-27/0001" || inv["status"] != "issued" {
		t.Fatalf("issued: %v", inv)
	}
	b1 := inv["id"].(string)

	// Bill A: reverse ("Total se").
	billA := input(map[string]any{"description": "Standard Gold 0.995", "hsn": "71081310", "qty_milli": 52161, "gst_rate": 3000, "target_total_paise": 76000000})
	billA["calc_mode"] = "reverse"
	a := expect(t, hs.do("POST", "/api/invoices/compute", map[string]any{"input": billA}, c), 200)
	if a["grand_total_paise"].(float64) != 76000000 || a["taxable_paise"].(float64) != 73786400 || a["words"].(map[string]any)["grand_total"] != "Rupees Seven Lakh Sixty Thousand Only" {
		t.Fatalf("bill A: %v", a)
	}
	if !strings.Contains(fmt.Sprint(a["warnings"]), "pan_recommended") {
		t.Fatalf("PAN warning missing: %v", a["warnings"])
	}

	// PDF: deterministic, and unaffected by later profile/settings edits.
	pdf1 := hs.do("GET", "/api/invoices/"+b1+"/pdf", nil, c)
	if pdf1.Code != 200 || !bytes.HasPrefix(pdf1.Body.Bytes(), []byte("%PDF")) {
		t.Fatalf("pdf: %d", pdf1.Code)
	}
	snap1 := hs.do("GET", "/api/invoices/"+b1, nil, c).Body.String()
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"trade_name": "Renamed Jewellers"}, c), 200)
	expect(t, hs.do("PATCH", "/api/settings", map[string]any{"terms": "changed"}, c), 200)
	if pdf2 := hs.do("GET", "/api/invoices/"+b1+"/pdf", nil, c); !bytes.Equal(pdf1.Body.Bytes(), pdf2.Body.Bytes()) {
		t.Fatal("PDF changed after settings edit")
	}
	if hs.do("GET", "/api/invoices/"+b1, nil, c).Body.String() != snap1 {
		t.Fatal("snapshot changed after settings edit")
	}
	expect(t, hs.do("PUT", "/api/settings/number-series", map[string]any{"starting_no": 500}, c), 409, "series_in_use")
	expect(t, hs.do("PATCH", "/api/settings", map[string]any{"fy_reset": false}, c), 422, `"fy_reset"`)

	// Immutability below the app.
	if _, err := hs.s.Pool.Exec(context.Background(), "UPDATE invoices SET grand_total_paise = 1 WHERE id = $1", b1); err == nil {
		t.Fatal("issued invoice was updatable")
	}
	expect(t, hs.do("DELETE", "/api/invoices/"+b1, nil, c), 409)
	expect(t, hs.do("PUT", "/api/invoices/"+b1, map[string]any{"input": input(billB())}, c), 409)

	// Drafts: no number, editable, deletable, draft PDF.
	d := expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": input(billB())}, c), 201)["invoice"].(map[string]any)
	if d["invoice_no"] != nil || d["grand_total_paise"].(float64) != 44611900 {
		t.Fatalf("draft: %v", d)
	}
	did := d["id"].(string)
	expect(t, hs.do("PUT", "/api/invoices/"+did, map[string]any{"input": input(billB(), billB())}, c), 200)
	expect(t, hs.do("GET", "/api/invoices/"+did+"/pdf", nil, c), 200)
	expect(t, hs.do("POST", "/api/invoices/"+did+"/issue", map[string]any{"expected_grand_total_paise": 89223900}, c), 200, "SJ/26-27/0002")
	d2 := expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": input(billB())}, c), 201)["invoice"].(map[string]any)
	expect(t, hs.do("DELETE", "/api/invoices/"+d2["id"].(string), nil, c), 204)

	// Validation.
	bad := input(map[string]any{"description": "", "hsn": "71", "qty_milli": 0, "gst_rate": 3000})
	expect(t, hs.do("POST", "/api/invoices/compute", map[string]any{"input": bad}, c), 422, `"lines[0].hsn"`, `"lines[0].description"`, `"lines[0].qty_milli"`)
	big := input(billB())
	big["buyer"] = map[string]any{"name": ""}
	expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": big, "issue": true, "expected_grand_total_paise": 44611900}, c), 422, "Rule 46")

	// Payments: partial, overpayment, cancel blocked until voided.
	expect(t, hs.do("POST", "/api/payments", map[string]any{"invoice_id": b1, "amount_paise": 20000000, "mode": "upi", "reference": "UTR1"}, c), 201)
	expect(t, hs.do("POST", "/api/payments", map[string]any{"invoice_id": b1, "amount_paise": 24611901, "mode": "cash"}, c), 409, "overpayment")
	pay := expect(t, hs.do("POST", "/api/payments", map[string]any{"invoice_id": b1, "amount_paise": 24611900, "mode": "cash"}, c), 201)
	if !strings.Contains(fmt.Sprint(pay["warnings"]), "cash_269st") {
		t.Fatalf("269ST warning missing: %v", pay)
	}
	if got := expect(t, hs.do("GET", "/api/invoices/"+b1, nil, c), 200); got["paid_paise"].(float64) != 44611900 {
		t.Fatalf("paid: %v", got["paid_paise"])
	}
	expect(t, hs.do("POST", "/api/invoices/"+b1+"/cancel", map[string]any{"reason": "wrong item"}, c), 409, "has_payments")
	for _, p := range expect(t, hs.do("GET", "/api/payments?invoice_id="+b1, nil, c), 200)["items"].([]any) {
		expect(t, hs.do("POST", "/api/payments/"+p.(map[string]any)["id"].(string)+"/void", map[string]any{"reason": "refund"}, c), 204)
	}
	expect(t, hs.do("POST", "/api/invoices/"+b1+"/cancel", map[string]any{"reason": "wrong item"}, c), 200, `"cancelled"`)
	expect(t, hs.do("POST", "/api/payments", map[string]any{"invoice_id": b1, "amount_paise": 100, "mode": "cash"}, c), 409)
	expect(t, hs.do("GET", "/api/invoices/"+b1+"/pdf", nil, c), 200)

	// Tenant isolation for documents.
	other := hs.active("other@example.com")
	for _, rq := range []struct {
		m, p string
		body any
	}{{"GET", "/api/invoices/" + b1, nil}, {"GET", "/api/invoices/" + b1 + "/pdf", nil}, {"POST", "/api/invoices/" + b1 + "/cancel", map[string]any{"reason": "x"}},
		{"PUT", "/api/invoices/" + did, map[string]any{"input": input(billB())}}, {"POST", "/api/invoices/" + did + "/issue", map[string]any{"expected_grand_total_paise": 1}}} {
		expect(t, hs.do(rq.m, rq.p, rq.body, other), 404)
	}
	expect(t, hs.do("POST", "/api/payments", map[string]any{"invoice_id": did, "amount_paise": 100, "mode": "cash"}, other), 422)
	if l := expect(t, hs.do("GET", "/api/invoices", nil, other), 200); len(l["items"].([]any)) != 0 {
		t.Fatalf("other tenant sees bills: %v", l)
	}
	// Other business has its own series.
	o := expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": input(billB()), "issue": true, "expected_grand_total_paise": 44611900}, other), 201)
	if o["invoice"].(map[string]any)["invoice_no"] != "SJ/26-27/0001" {
		t.Fatalf("second tenant numbering: %v", o)
	}
}

func TestOldGoldLedgerReports(t *testing.T) {
	hs := newHarness(t)
	c := hs.active("owner@example.com")
	party := expect(t, hs.do("POST", "/api/parties", map[string]any{"name": "Meena Traders", "opening_balance_paise": 1500000}, c), 201)
	pid := party["id"].(string)

	// Exchange: Bill B with old gold → net payable ₹3,15,559.00, voucher + old-gold credit in the same tx.
	in := input(billB())
	in["party_id"] = pid
	in["buyer"] = map[string]any{"name": "Meena Traders", "address": "Mumbai", "state_code": "27"}
	in["old_gold"] = map[string]any{"seller_kind": "individual", "lines": []map[string]any{{"description": "Old bangles", "purity": "22K",
		"gross_weight_mg": 10500, "less_weight_mg": 300, "rate_paise": 1280000}}}
	comp := expect(t, hs.do("POST", "/api/invoices/compute", map[string]any{"input": in}, c), 200)
	if comp["net_payable_paise"].(float64) != 31555900 || comp["words"].(map[string]any)["net_payable"] != "Rupees Three Lakh Fifteen Thousand Five Hundred Fifty-Nine Only" {
		t.Fatalf("exchange compute: %v", comp)
	}
	inv := expect(t, hs.do("POST", "/api/invoices", map[string]any{"input": in, "issue": true, "expected_grand_total_paise": 44611900}, c), 201)["invoice"].(map[string]any)
	id := inv["id"].(string)
	if inv["old_gold_paise"].(float64) != 13056000 || inv["net_payable_paise"].(float64) != 31555900 {
		t.Fatalf("exchange invoice: %v", inv)
	}
	got := expect(t, hs.do("GET", "/api/invoices/"+id, nil, c), 200)
	if got["paid_paise"].(float64) != 13056000 || got["voucher_id"] == nil {
		t.Fatalf("old gold credit: %v", got["paid_paise"])
	}
	expect(t, hs.do("GET", "/api/purchase-vouchers/"+got["voucher_id"].(string)+"/pdf", nil, c), 200)
	expect(t, hs.do("POST", "/api/purchase-vouchers/"+got["voucher_id"].(string)+"/cancel", map[string]any{"reason": "x"}, c), 409, "exchange_voucher")
	tooMuch := input(billB())
	tooMuch["old_gold"] = map[string]any{"lines": []map[string]any{{"gross_weight_mg": 100000, "rate_paise": 1280000}}}
	expect(t, hs.do("POST", "/api/invoices/compute", map[string]any{"input": tooMuch}, c), 422, "standalone")

	// Payment + standalone on-account voucher → ledger = opening + invoices − payments − vouchers.
	expect(t, hs.do("POST", "/api/payments", map[string]any{"invoice_id": id, "amount_paise": 20000000, "mode": "upi", "received_on": "2026-11-17"}, c), 201)
	expect(t, hs.do("POST", "/api/purchase-vouchers", map[string]any{"settlement": "on_account", "seller": map[string]any{"name": "Meena"},
		"lines": []map[string]any{{"gross_weight_mg": 1000, "rate_paise": 1280000}}}, c), 422, `"party_id"`)
	v := expect(t, hs.do("POST", "/api/purchase-vouchers", map[string]any{"voucher_date": "2026-11-18", "party_id": pid, "settlement": "on_account",
		"seller": map[string]any{"name": "Meena Traders"}, "lines": []map[string]any{{"description": "Old ring", "gross_weight_mg": 1000, "rate_paise": 1280000}}}, c), 201)["voucher"].(map[string]any)
	if v["voucher_no"] != "PV/26-27/0002" || v["total_paise"].(float64) != 1280000 {
		t.Fatalf("standalone voucher: %v", v)
	}
	expect(t, hs.do("POST", "/api/purchase-vouchers", map[string]any{"settlement": "paid", "paid_mode": "cash", "seller": map[string]any{"name": "Sunita Devi"},
		"lines": []map[string]any{{"gross_weight_mg": 2000, "rate_paise": 1280000}}}, c), 201)

	l := expect(t, hs.do("GET", "/api/parties/"+pid+"/ledger", nil, c), 200)
	want := int64(1500000 + 44611900 - 13056000 - 20000000 - 1280000)
	if int64(l["closing_balance_paise"].(float64)) != want || len(l["entries"].([]any)) != 4 {
		t.Fatalf("ledger closing %v want %d: %v", l["closing_balance_paise"], want, l["entries"])
	}
	if lf := expect(t, hs.do("GET", "/api/parties/"+pid+"/ledger?from=2026-11-17", nil, c), 200); int64(lf["opening_balance_paise"].(float64)) != 1500000+44611900-13056000 {
		t.Fatalf("ledger from: %v", lf["opening_balance_paise"])
	}
	bal := expect(t, hs.do("GET", "/api/parties/balances", nil, c), 200)["items"].([]any)[0].(map[string]any)
	if int64(bal["balance_paise"].(float64)) != want {
		t.Fatalf("balances: %v", bal)
	}
	home := expect(t, hs.do("GET", "/api/home", nil, c), 200)
	if int64(home["outstanding_paise"].(float64)) != want {
		t.Fatalf("home outstanding: %v", home["outstanding_paise"])
	}

	// Reports reconcile.
	q := "?from=2026-04-01&to=2027-03-31"
	sr := expect(t, hs.do("GET", "/api/reports/sales-register"+q, nil, c), 200)["items"].([]any)
	if len(sr) != 1 || sr[0].(map[string]any)["grand_total_paise"].(float64) != 44611900 {
		t.Fatalf("sales register: %v", sr)
	}
	gs := expect(t, hs.do("GET", "/api/reports/gst-summary"+q, nil, c), 200)["items"].([]any)[0].(map[string]any)
	if gs["cgst_paise"].(float64) != 649688 || gs["b2b"] != false {
		t.Fatalf("gst summary: %v", gs)
	}
	hsn := expect(t, hs.do("GET", "/api/reports/hsn-summary"+q, nil, c), 200)
	if g := hsn["items"].([]any)[0].(map[string]any); g["hsn"] != "7113" || g["taxable_paise"].(float64) != 43312559 {
		t.Fatalf("hsn: %v", hsn)
	}
	if og := expect(t, hs.do("GET", "/api/reports/old-gold-register"+q, nil, c), 200)["items"].([]any); len(og) != 3 {
		t.Fatalf("old gold register: %v", og)
	}
	if w := hs.do("GET", "/api/reports/sales-register"+q+"&format=csv", nil, c); !strings.HasPrefix(w.Body.String(), "Invoice no,Date") || !strings.Contains(w.Body.String(), "446119.00") {
		t.Fatalf("csv: %s", w.Body)
	}

	// Cancelling the bill cancels the exchange voucher and its credit.
	pays := expect(t, hs.do("GET", "/api/payments?invoice_id="+id, nil, c), 200)["items"].([]any)
	for _, p := range pays {
		if p.(map[string]any)["mode"] == "old_gold" {
			expect(t, hs.do("POST", "/api/payments/"+p.(map[string]any)["id"].(string)+"/void", map[string]any{"reason": "x"}, c), 409)
		} else {
			expect(t, hs.do("POST", "/api/payments/"+p.(map[string]any)["id"].(string)+"/void", map[string]any{"reason": "x"}, c), 204)
		}
	}
	expect(t, hs.do("POST", "/api/invoices/"+id+"/cancel", map[string]any{"reason": "customer returned"}, c), 200)
	vv := expect(t, hs.do("GET", "/api/purchase-vouchers/"+got["voucher_id"].(string), nil, c), 200)["voucher"].(map[string]any)
	if vv["status"] != "cancelled" {
		t.Fatalf("exchange voucher not cancelled: %v", vv)
	}
	if l := expect(t, hs.do("GET", "/api/parties/"+pid+"/ledger", nil, c), 200); int64(l["closing_balance_paise"].(float64)) != 1500000-1280000 {
		t.Fatalf("ledger after cancel: %v", l["closing_balance_paise"])
	}
	expect(t, hs.do("DELETE", "/api/parties/"+pid, nil, c), 204) // referenced → archived, not deleted
	expect(t, hs.do("GET", "/api/parties/"+pid, nil, c), 200, "archived_at")
}

// 50 concurrent issues get exactly 1..50; failures don't leave gaps.
func TestConcurrentNumbering(t *testing.T) {
	hs := newHarness(t)
	c := hs.active("owner@example.com")
	var mu sync.Mutex
	var nos []string
	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			exp := 44611900
			if i%10 == 0 {
				exp = 1 // forced failure inside the tx
			}
			w := hs.do("POST", "/api/invoices", map[string]any{"input": input(billB()), "issue": true, "expected_grand_total_paise": exp}, c)
			if w.Code == 201 {
				mu.Lock()
				nos = append(nos, decodeBody(t, w)["invoice"].(map[string]any)["invoice_no"].(string))
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	sort.Strings(nos)
	if len(nos) != 45 {
		t.Fatalf("issued %d", len(nos))
	}
	for i, n := range nos {
		if want := fmt.Sprintf("SJ/26-27/%04d", i+1); n != want {
			t.Fatalf("gap: got %s want %s", n, want)
		}
	}
}

func TestCSVSafe(t *testing.T) {
	for in, want := range map[string]string{"=HYPERLINK(1)": "'=HYPERLINK(1)", "-0.50": "-0.50", "+91 98": "'+91 98", "@x": "'@x", "Ramesh": "Ramesh", "": ""} {
		if got := csvSafe(in); got != want {
			t.Errorf("csvSafe(%q) = %q, want %q", in, got, want)
		}
	}
}
