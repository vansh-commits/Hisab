// Package pdf renders documents from their frozen snapshot. Output is deterministic:
// the same snapshot always gives the same bytes (fixed dates, versioned templates).
package pdf

import (
	"bytes"
	"embed"
	"time"

	"github.com/go-pdf/fpdf"
)

//go:embed fonts/*.ttf
var fonts embed.FS

func newDoc(created time.Time) *fpdf.Fpdf {
	f := fpdf.New("P", "mm", "A4", "")
	for _, s := range []struct{ style, file string }{{"", "NotoSans-Regular.ttf"}, {"B", "NotoSans-Bold.ttf"}} {
		b, err := fonts.ReadFile("fonts/" + s.file)
		if err != nil {
			panic(err) // embedded; cannot fail
		}
		f.AddUTF8FontFromBytes("Noto", s.style, b)
	}
	f.SetCreationDate(created)
	f.SetModificationDate(created)
	f.SetCompression(true)
	f.SetCatalogSort(true) // fonts/images in a fixed order, so output is byte-identical
	f.SetCreator("Hisab", true)
	return f
}

// ClassicV1 is the Phase 0 stub: proves ₹ and Indian grouping render. The real template replaces the body.
func ClassicV1(title, amount string, issuedAt time.Time) ([]byte, error) {
	f := newDoc(issuedAt)
	f.AddPage()
	f.SetFont("Noto", "B", 18)
	f.Cell(0, 10, title)
	f.Ln(12)
	f.SetFont("Noto", "", 14)
	f.Cell(0, 10, "Taxable value: ₹"+amount)
	var buf bytes.Buffer
	if err := f.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
