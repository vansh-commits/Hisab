package pdf

import (
	"bytes"
	"testing"
	"time"
)

func TestClassicV1Deterministic(t *testing.T) {
	at := time.Date(2026, 11, 16, 10, 30, 0, 0, time.UTC)
	a, err := ClassicV1("Tax Invoice", "7,37,864.00", at)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := ClassicV1("Tax Invoice", "7,37,864.00", at)
	if !bytes.Equal(a, b) {
		t.Fatal("same input produced different PDF bytes")
	}
	if !bytes.HasPrefix(a, []byte("%PDF-")) {
		t.Fatal("not a PDF")
	}
}
