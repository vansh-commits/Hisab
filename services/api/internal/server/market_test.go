package server

import (
	"testing"
	"time"
)

func TestMarketRates(t *testing.T) {
	hs := newHarness(t)
	c := hs.active("market@example.com")

	find := func(m map[string]any, day, session, purity string) float64 {
		for _, it := range m["items"].([]any) {
			r := it.(map[string]any)
			if r["day"] == day && r["session"] == session && r["purity"] == purity {
				return r["paise_per_gram"].(float64)
			}
		}
		return 0
	}

	// Empty table: a plain read fetches, whatever the day or time.
	m := decodeBody(t, hs.do("GET", "/api/market-rates?days=3650", nil, c))
	if got := find(m, "2026-11-20", "PM", "gold999"); got != 1238930 {
		t.Fatalf("gold999 PM = %v", got)
	}
	if find(m, "2026-07-21", "PM", "silver999") == 0 || m["stale"] != false {
		t.Fatalf("history missing or stale: %v", m["stale"])
	}

	// IBJA down: keep serving stored rates, flagged stale.
	hs.mu.Lock()
	hs.ibjaDown = true
	hs.mu.Unlock()
	hs.s.marketTry = time.Time{}
	m = decodeBody(t, hs.do("POST", "/api/market-rates/refresh?days=3650", nil, c))
	if m["stale"] != true || find(m, "2026-11-20", "AM", "gold916") != 1132030 {
		t.Fatalf("want stale with stored rates, got stale=%v", m["stale"])
	}

	// Throttled: a second refresh within 2 minutes does not refetch.
	hs.mu.Lock()
	hs.ibjaDown = false
	hs.mu.Unlock()
	m = decodeBody(t, hs.do("POST", "/api/market-rates/refresh", nil, c))
	if m["stale"] != true {
		t.Fatal("refresh should be throttled")
	}
}

func TestExpectedSession(t *testing.T) {
	at := func(s string) time.Time { v, _ := time.ParseInLocation("2006-01-02 15:04", s, ist); return v }
	for in, want := range map[string]string{
		"2026-11-20 11:00": "",   // Friday morning
		"2026-11-20 12:20": "AM", // after AM fixing
		"2026-11-20 18:00": "PM",
		"2026-11-21 13:00": "", // Saturday
	} {
		if _, got := expectedSession(at(in)); got != want {
			t.Errorf("%s: got %q want %q", in, got, want)
		}
	}
}
