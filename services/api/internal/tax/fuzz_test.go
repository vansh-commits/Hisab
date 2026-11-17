package tax

import "testing"

var fuzzRates = []int64{0, 250, 1000, 3000, 5000, 12000, 18000, 28000}

// Invariant (tax-engine.md §4): with round-off on, a reverse bill always totals exactly T.
func FuzzReverse(f *testing.F) {
	f.Add(uint32(760000), uint8(3), true, true, uint32(52161))
	f.Add(uint32(1), uint8(7), true, false, uint32(1))
	f.Add(uint32(99999999), uint8(1), false, true, uint32(999999))
	f.Fuzz(func(t *testing.T, rupees uint32, ri uint8, stepRupee, intra bool, qty uint32) {
		T := (int64(rupees)%1_000_000_000 + 1) * 100 // ₹1 .. ₹100 crore
		rate := fuzzRates[int(ri)%len(fuzzRates)]
		pos := POSInput{ShopState: "08"}
		if !intra {
			pos.BuyerState = "07"
		}
		r, err := Compute(Input{POS: pos, Reverse: true, ReverseStepRupee: stepRupee, RoundOff: true,
			Lines: []Line{{HSN: "7113", GSTRate: rate, QtyMilli: int64(qty%10_000_000) + 1, Target: T}}})
		if err != nil {
			t.Fatal(err)
		}
		if r.GrandTotal != T {
			t.Fatalf("T=%d rate=%d step=%v: grand=%d", T, rate, stepRupee, r.GrandTotal)
		}
		if r.RoundOff < -50 || r.RoundOff > 50 {
			t.Fatalf("round off %d out of range", r.RoundOff)
		}
		if r.CGST != r.SGST {
			t.Fatalf("cgst %d != sgst %d", r.CGST, r.SGST)
		}
	})
}

// Forward bills: round-off always in [−50, 50], cgst == sgst.
func FuzzForward(f *testing.F) {
	f.Add(uint32(31370), uint32(1345700), uint32(35000), uint8(3), true)
	f.Fuzz(func(t *testing.T, qty, rate, mk uint32, ri uint8, intra bool) {
		pos := POSInput{ShopState: "08"}
		if !intra {
			pos.BuyerState = "07"
		}
		r, err := Compute(Input{POS: pos, RoundOff: true, Lines: []Line{{HSN: "7113", GSTRate: fuzzRates[int(ri)%len(fuzzRates)],
			QtyMilli: int64(qty), RatePaise: int64(rate), Making: &Making{MakingPerGram, int64(mk)}}}})
		if err != nil {
			t.Fatal(err)
		}
		if r.RoundOff < -50 || r.RoundOff > 50 || r.CGST != r.SGST || r.GrandTotal%100 != 0 {
			t.Fatalf("bad result %+v", r)
		}
	})
}
