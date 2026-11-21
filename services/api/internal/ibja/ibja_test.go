package ibja

import (
	"os"
	"testing"
)

func TestParseFixture(t *testing.T) {
	b, err := os.ReadFile("testdata/home.html")
	if err != nil {
		t.Fatal(err)
	}
	rates, err := Parse(string(b))
	if err != nil {
		t.Fatal(err)
	}
	got := map[[3]string]int64{}
	for _, r := range rates {
		got[[3]string{r.Day, r.Session, r.Purity}] = r.Paise
	}
	for k, want := range map[[3]string]int64{
		{"2026-11-20", "PM", "gold999"}:   1238930, // ₹1,23,893 /10g → ₹12,389.30/g
		{"2026-11-20", "AM", "gold916"}:   1132030,
		{"2026-11-20", "PM", "silver999"}: 15253,   // ₹1,52,528 /kg → ₹152.53/g
		{"2026-11-17", "AM", "gold585"}:   0,       // filled below
		{"2026-07-21", "PM", "gold999"}:   1431370, // chart history
	} {
		if want == 0 {
			if got[k] == 0 {
				t.Errorf("%v missing", k)
			}
			continue
		}
		if got[k] != want {
			t.Errorf("%v = %d, want %d", k, got[k], want)
		}
	}
	if _, err := Parse("<html>nothing</html>"); err == nil {
		t.Error("empty page should error")
	}
}
