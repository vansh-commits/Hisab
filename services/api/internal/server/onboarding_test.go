package server

import (
	"bytes"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// approved makes a user with an approved business and returns their app cookie.
func (hs *harness) approved(emailAddr string) *http.Cookie {
	hs.t.Helper()
	c := hs.login(emailAddr, audApp)
	w := hs.do("POST", "/api/waitlist", app, c)
	if w.Code != 201 {
		hs.t.Fatalf("apply: %d %s", w.Code, w.Body)
	}
	id := decodeBody(hs.t, w)["business"].(map[string]any)["id"].(string)
	if w := hs.do("POST", "/api/admin/applications/"+id+"/approve", map[string]any{}, hs.login("admin@example.com", audAdmin)); w.Code != 200 {
		hs.t.Fatalf("approve: %d %s", w.Code, w.Body)
	}
	return c
}

func (hs *harness) upload(path string, data []byte, c *http.Cookie) *httptest.ResponseRecorder {
	var b bytes.Buffer
	mw := multipart.NewWriter(&b)
	fw, _ := mw.CreateFormFile("file", "logo")
	_, _ = fw.Write(data)
	_ = mw.Close()
	r := httptest.NewRequest("PUT", path, &b)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.AddCookie(c)
	w := httptest.NewRecorder()
	hs.h.ServeHTTP(w, r)
	return w
}

func expect(t *testing.T, w *httptest.ResponseRecorder, code int, contains ...string) map[string]any {
	t.Helper()
	if w.Code != code {
		t.Fatalf("want %d, got %d: %s", code, w.Code, w.Body)
	}
	for _, s := range contains {
		if !strings.Contains(w.Body.String(), s) {
			t.Fatalf("body lacks %q: %s", s, w.Body)
		}
	}
	if w.Body.Len() == 0 || w.Header().Get("Content-Type") != "application/json" {
		return nil
	}
	return decodeBody(t, w)
}

var png1x1 = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")

func TestOnboardingFlow(t *testing.T) {
	hs := newHarness(t)

	pending := hs.login("pending@example.com", audApp)
	hs.do("POST", "/api/waitlist", app, pending)
	expect(t, hs.do("GET", "/api/business", nil, pending), 403, "status_pending")
	expect(t, hs.do("GET", "/api/parties", nil, hs.login("nobody@example.com", audApp)), 403, "no_business")

	c := hs.approved("owner@example.com")
	expect(t, hs.do("GET", "/api/states", nil, nil), 200, `"27"`)

	// Business identity: checksum, state derived from the GSTIN, mismatch rejected.
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"gstin": "27AAPFU0939F1ZX"}, c), 422, `"gstin"`)
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"status": "active"}, c), 400)
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"registration_type": "regular"}, c), 200)
	expect(t, hs.do("POST", "/api/onboarding/complete", nil, c), 422, `"legal_name"`, `"gstin"`)
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"gstin": "27aapfu0939f1zv", "state_code": "08"}, c), 422, "doesn't match")
	b := expect(t, hs.do("PATCH", "/api/business", map[string]any{"gstin": "27aapfu0939f1zv", "legal_name": " Soni Jewellers Pvt Ltd ",
		"address_line1": "12 Johari Bazaar", "city": "Mumbai", "pincode": "400002", "phone": "98765 43210"}, c), 200)
	if b["state_code"] != "27" || b["legal_name"] != "Soni Jewellers Pvt Ltd" || b["phone"] != "+919876543210" || b["registration_type"] != "regular" {
		t.Fatalf("profile: %v", b)
	}
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"pincode": "0123"}, c), 422, `"pincode"`)

	// Numbering: preview, starting number, 16-char limit.
	fy := fyStart(time.Now())
	fyTok := fmt.Sprintf("%02d-%02d/", fy%100, (fy+1)%100)
	st := expect(t, hs.do("PATCH", "/api/settings", map[string]any{"invoice_prefix": "SJ/", "number_min_digits": 4}, c), 200)
	if st["preview"] != "SJ/"+fyTok+"0001" {
		t.Fatalf("preview: %v", st["preview"])
	}
	st = expect(t, hs.do("PUT", "/api/settings/number-series", map[string]any{"starting_no": 148}, c), 200)
	if st["preview"] != "SJ/"+fyTok+"0148" || st["next_no"].(float64) != 148 {
		t.Fatalf("series: %v", st)
	}
	expect(t, hs.do("PATCH", "/api/settings", map[string]any{"invoice_prefix": "ABCDEFGH", "number_min_digits": 8}, c), 422, "longer than 16")
	expect(t, hs.do("PATCH", "/api/settings", map[string]any{"bank_ifsc": "hdfc0001234", "copies": []string{"original", "duplicate"}}, c), 200, `"HDFC0001234"`)
	expect(t, hs.do("PATCH", "/api/settings", map[string]any{"copies": []string{"quadruplicate"}}, c), 422)

	// Rate board replaces the whole set.
	expect(t, hs.do("PUT", "/api/metal-rates", []map[string]any{{"metal": "22K", "rate_paise": 1345700}, {"metal": "22k", "rate_paise": 1}}, c), 422, "unique")
	r := expect(t, hs.do("PUT", "/api/metal-rates", []map[string]any{{"metal": "24K", "rate_paise": 1468000}, {"metal": "22K", "rate_paise": 1345700}}, c), 200)
	if len(r["items"].([]any)) != 2 {
		t.Fatalf("rates: %v", r)
	}

	// Customers: bulk is all-or-nothing.
	expect(t, hs.do("POST", "/api/parties/bulk", []map[string]any{{"name": "Meena Traders"}, {"name": ""}}, c), 422, `"[1].name"`)
	expect(t, hs.do("POST", "/api/parties/bulk", []map[string]any{{"name": "X", "bogus": 1}}, c), 422, `"[0]"`)
	if l := expect(t, hs.do("GET", "/api/parties", nil, c), 200); len(l["items"].([]any)) != 0 {
		t.Fatalf("partial bulk insert: %v", l)
	}
	ps := expect(t, hs.do("POST", "/api/parties/bulk", []map[string]any{
		{"name": "Meena Traders", "gstin": "27AAPFU0939F1ZV", "opening_balance_paise": 1500000, "opening_balance_date": "2026-04-01"},
		{"name": "Walk-in Ravi", "phone": "9811111111"},
	}, c), 201)
	party := ps["items"].([]any)[0].(map[string]any)
	if party["bill_state_code"] != "27" || party["opening_balance_date"] != "2026-04-01" {
		t.Fatalf("party: %v", party)
	}
	pid := party["id"].(string)
	if l := expect(t, hs.do("GET", "/api/parties?q=meena", nil, c), 200); len(l["items"].([]any)) != 1 {
		t.Fatalf("search: %v", l)
	}
	expect(t, hs.do("PATCH", "/api/parties/"+pid, map[string]any{"pan": "abcde1234f"}, c), 200, `"ABCDE1234F"`, `"Meena Traders"`)
	expect(t, hs.do("PATCH", "/api/parties/"+pid, map[string]any{"bill_state_code": "07"}, c), 422, "doesn't match")

	// Items: presets with defaults.
	it := expect(t, hs.do("POST", "/api/items/bulk", []map[string]any{{"name": "22K Jewellery", "hsn": "7113", "purity": "22K", "metal": "22K"},
		{"name": "Job work", "hsn": "9988", "unit": "nos", "gst_rate": 5000}}, c), 201)
	if first := it["items"].([]any)[0].(map[string]any); first["gst_rate"].(float64) != 3000 || first["unit"] != "g" {
		t.Fatalf("item defaults: %v", first)
	}
	expect(t, hs.do("POST", "/api/items", map[string]any{"name": "Bad", "hsn": "71"}, c), 422, `"hsn"`)

	// Logo: magic bytes, size, served back.
	expect(t, hs.upload("/api/business/logo", []byte("hello, not an image"), c), 422)
	expect(t, hs.upload("/api/business/logo", bytes.Repeat([]byte{0x89}, 210000), c), 422)
	logo := expect(t, hs.upload("/api/business/logo", png1x1, c), 200)["logo_id"].(string)
	if w := hs.do("GET", "/api/logos/"+logo, nil, c); w.Code != 200 || w.Header().Get("Content-Type") != "image/png" || !bytes.Equal(w.Body.Bytes(), png1x1) {
		t.Fatalf("logo get: %d %q", w.Code, w.Header())
	}

	// Resume: step persists and shows in /me.
	expect(t, hs.do("PATCH", "/api/onboarding", map[string]any{"step": 99}, c), 422)
	expect(t, hs.do("PATCH", "/api/onboarding", map[string]any{"step": 5}, c), 200)
	if me := decodeBody(t, hs.do("GET", "/api/me", nil, c)); me["business"].(map[string]any)["onboarding_step"].(float64) != 5 {
		t.Fatalf("me step: %v", me)
	}

	// Tenant isolation: another business can't see or touch these rows.
	other := hs.approved("other@example.com")
	for _, rq := range [][2]string{{"GET", "/api/parties/" + pid}, {"PATCH", "/api/parties/" + pid}, {"DELETE", "/api/parties/" + pid}, {"GET", "/api/logos/" + logo}} {
		expect(t, hs.do(rq[0], rq[1], map[string]any{}, other), 404)
	}
	if l := expect(t, hs.do("GET", "/api/parties", nil, other), 200); len(l["items"].([]any)) != 0 {
		t.Fatalf("other tenant sees parties: %v", l)
	}

	// Finish → active; onboarding-only routes close.
	done := expect(t, hs.do("POST", "/api/onboarding/complete", nil, c), 200, `"active"`)
	if done["onboarded_at"] == nil {
		t.Fatalf("complete: %v", done)
	}
	expect(t, hs.do("PATCH", "/api/onboarding", map[string]any{"step": 1}, c), 403)
	expect(t, hs.do("GET", "/api/settings", nil, c), 200)
	expect(t, hs.do("DELETE", "/api/parties/"+pid, nil, c), 204)
	expect(t, hs.do("GET", "/api/parties/"+pid, nil, c), 404)
}

// Skipping every optional step still gives a valid business.
func TestOnboardingMinimal(t *testing.T) {
	hs := newHarness(t)
	c := hs.approved("min@example.com")
	expect(t, hs.do("PATCH", "/api/business", map[string]any{"registration_type": "unregistered", "gstin": "27AAPFU0939F1ZV",
		"legal_name": "Ram Jewellers", "address_line1": "Main Bazaar", "city": "Jaipur", "state_code": "08"}, c), 200, `"gstin":null`)
	expect(t, hs.do("POST", "/api/onboarding/complete", nil, c), 200, `"active"`)
}

// Every query touching a tenant table must filter on business_id (schema.md "Tenant isolation").
func TestQueriesScopedToTenant(t *testing.T) {
	tenant := regexp.MustCompile(`\b(logos|business_settings|number_series|metal_rates|parties|items|invoices|purchase_vouchers|payments)\b`)
	files, _ := filepath.Glob("../../queries/*.sql")
	for _, f := range files {
		src, _ := os.ReadFile(f)
		for _, q := range strings.Split(string(src), "-- name: ")[1:] {
			if tenant.MatchString(q) && !strings.Contains(q, "business_id") && !strings.Contains(q, "cross-tenant") {
				t.Errorf("%s: query not scoped to business_id:\n%s", f, q)
			}
		}
	}
}
