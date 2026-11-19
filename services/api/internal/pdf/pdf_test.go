package pdf

import (
	"bytes"
	"os"
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

func sampleInvoice() Invoice {
	s := func(v string) *string { return &v }
	g := int64(300000)
	return Invoice{
		Doc: Doc{Type: "tax_invoice", Title: "Tax Invoice", No: "VTS/26-27/000001", Date: "2026-11-19", PlaceOfSupply: &State{"06", "Haryana"}},
		Seller: Seller{LegalName: "Vansh Testing", TradeName: "Testing Jewellers", Address: "Shop no 9B, 1A NIT 1, Faridabad - 121001", State: State{"06", "Haryana"}, GSTIN: s("06AABCU9603R1ZR"), Phone: s("+919999999999"), Email: s("shop@example.com"),
			Bank: Bank{Name: s("HDFC Bank"), AccountName: s("Testing Jewellers"), AccountNo: s("123456789098"), IFSC: s("HDFC0001242"), Branch: s("Faridabad"), UPI: s("shop@upi")}},
		Buyer:     Party{Name: "Jewl 1", Address: "House 12, Sector 15\nFaridabad", State: &State{"06", "Haryana"}, Phone: s("123456789"), PAN: s("ABCDE1234F")},
		Lines:     []Line{{SNo: 1, Description: "18K Jewellery", HSN: s("7113"), Purity: s("18K"), Unit: "g", GrossWeightMg: &g, QtyMilli: 250000, RatePaise: 950000, Making: &Making{Paise: 4750000}, TaxablePaise: 242250000, GSTRate: 3000}},
		TaxGroups: []Group{{HSN: "7113", GSTRate: 3000, TaxablePaise: 242250000, CGSTPaise: 3633750, SGSTPaise: 3633750}},
		Totals:    Totals{SupplyType: "intra", SGSTLabel: "SGST", TaxablePaise: 242250000, CGSTPaise: 3633750, SGSTPaise: 3633750, GrandTotalPaise: 249517500},
		Settings:  Print{Copies: []string{"original", "duplicate"}, Terms: "Goods once sold will not be taken back. Subject to hallmark verification.", Declaration: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", Jurisdiction: "Subject to Faridabad jurisdiction", SignatoryName: "Vansh"},
		Words:     Words{GrandTotal: "Rupees Twenty-Four Lakh Ninety-Five Thousand One Hundred Seventy-Five Only", Tax: "Rupees Seventy-Two Thousand Six Hundred Seventy-Five Only"},
		Notes:     "test bill generated",
	}
}

// Set PDF_OUT=/path/x.pdf to eyeball the layout.
func TestRenderInvoiceDeterministic(t *testing.T) {
	a, err := RenderInvoice(sampleInvoice(), nil, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := RenderInvoice(sampleInvoice(), nil, nil, false)
	if !bytes.Equal(a, b) {
		t.Fatal("same snapshot produced different PDF bytes")
	}
	if out := os.Getenv("PDF_OUT"); out != "" {
		_ = os.WriteFile(out, a, 0o644)
	}
}
