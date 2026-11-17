package tax

import (
	"errors"
	"testing"
)

const shop = "08" // Rajasthan

func walkIn() POSInput { return POSInput{ShopState: shop} }

func billBLine() Line {
	return Line{HSN: "7113", GSTRate: 3000, QtyMilli: 31370, RatePaise: 1345700, Making: &Making{MakingPerGram, 35000}}
}

func mustCompute(t *testing.T, in Input) Result {
	t.Helper()
	r, err := Compute(in)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

type want map[string]int64

func check(t *testing.T, got want, exp want) {
	t.Helper()
	for k, v := range exp {
		if got[k] != v {
			t.Errorf("%s = %d, want %d", k, got[k], v)
		}
	}
}

func flat(r Result) want {
	w := want{"taxable": r.Taxable, "cgst": r.CGST, "sgst": r.SGST, "igst": r.IGST, "tcs": r.TCS,
		"round_off": r.RoundOff, "grand": r.GrandTotal, "net_payable": r.NetPayable}
	if len(r.Lines) > 0 {
		w["metal"], w["making"], w["rate"] = r.Lines[0].Metal, r.Lines[0].Making, r.Lines[0].RatePaise
	}
	return w
}

// ── tax-engine.md §6 vectors ──────────────────────────────────────────────

func TestBillA(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), Reverse: true, ReverseStepRupee: true, RoundOff: true,
		Lines: []Line{{HSN: "71081310", GSTRate: 3000, QtyMilli: 52161, Target: 76000000}}})
	check(t, flat(r), want{"taxable": 73786400, "cgst": 1106796, "sgst": 1106796, "igst": 0,
		"round_off": 8, "grand": 76000000, "rate": 1414589})
	if !r.Intra || !r.Lines[0].RateDerived || len(r.Warnings) > 0 {
		t.Errorf("intra=%v derived=%v warnings=%v", r.Intra, r.Lines[0].RateDerived, r.Warnings)
	}
}

func TestBillB(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, Lines: []Line{billBLine()}})
	check(t, flat(r), want{"metal": 42214609, "making": 1097950, "taxable": 43312559,
		"cgst": 649688, "sgst": 649688, "round_off": -35, "grand": 44611900})
}

func TestBillBPrimeInterState(t *testing.T) {
	pos := POSInput{ShopState: shop, BuyerRegistered: true, BuyerState: "07", GoodsMovement: true}
	r := mustCompute(t, Input{POS: pos, RoundOff: true, Lines: []Line{billBLine()}})
	check(t, flat(r), want{"igst": 1299377, "cgst": 0, "round_off": -36, "grand": 44611900})
	if r.Intra || r.PlaceOfSupply != "07" {
		t.Errorf("pos=%s intra=%v", r.PlaceOfSupply, r.Intra)
	}
}

func TestBillBOldGoldExchange(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, Lines: []Line{billBLine()},
		OldGold: []OldGoldLine{{GrossMg: 10500, LessMg: 300, RatePaise: 1280000}}})
	check(t, flat(r), want{"grand": 44611900, "net_payable": 31555900})
	if r.OldGold.Total != 13056000 || r.OldGold.RoundOff != 0 || r.OldGold.NetMg != 10200 {
		t.Errorf("old gold = %+v", *r.OldGold)
	}
}

func TestOldGoldVoucherRounding(t *testing.T) {
	og, err := OldGold([]OldGoldLine{{GrossMg: 3333, RatePaise: 1234500}})
	if err != nil {
		t.Fatal(err)
	}
	if og.Lines[0].Amount != 4114589 || og.Total != 4114600 || og.RoundOff != 11 {
		t.Errorf("got %+v", og)
	}
}

func TestOldGoldErrors(t *testing.T) {
	_, err := Compute(Input{POS: walkIn(), RoundOff: true, Lines: []Line{billBLine()},
		OldGold: []OldGoldLine{{GrossMg: 100000, RatePaise: 1280000}}})
	if !errors.Is(err, ErrOldGoldExceedsTotal) {
		t.Errorf("want ErrOldGoldExceedsTotal, got %v", err)
	}
	if _, err := OldGold([]OldGoldLine{{GrossMg: 300, LessMg: 300, RatePaise: 1}}); err == nil {
		t.Error("zero net weight accepted")
	}
}

// ── §3 Place of supply ────────────────────────────────────────────────────

func TestPlaceOfSupply(t *testing.T) {
	cases := []struct {
		name string
		in   POSInput
		want string
	}{
		{"unregistered, state recorded", POSInput{ShopState: "07", BuyerState: "06"}, "06"},
		{"unregistered, delivery state wins", POSInput{ShopState: "07", BuyerState: "06", DeliveryState: "09"}, "09"},
		{"unregistered, nothing recorded", POSInput{ShopState: "07"}, "07"},
		{"registered, movement to delivery state", POSInput{ShopState: "07", BuyerRegistered: true, BuyerState: "06", GoodsMovement: true, DeliveryState: "27"}, "27"},
		{"registered, movement to consignee", POSInput{ShopState: "07", BuyerRegistered: true, BuyerState: "06", GoodsMovement: true, ConsigneeState: "24"}, "24"},
		{"registered, movement to buyer", POSInput{ShopState: "07", BuyerRegistered: true, BuyerState: "06", GoodsMovement: true}, "06"},
		{"registered, no movement", POSInput{ShopState: "07", BuyerRegistered: true, BuyerState: "06"}, "07"},
		{"override wins", POSInput{ShopState: "07", BuyerState: "06", Override: "07"}, "07"},
	}
	for _, c := range cases {
		if got := PlaceOfSupply(c.in); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

// Circular 209/03/2024: Delhi shop, Haryana walk-in collecting at the counter → IGST.
func TestDelhiShopHaryanaWalkIn(t *testing.T) {
	r := mustCompute(t, Input{POS: POSInput{ShopState: "07", BuyerState: "06"}, RoundOff: true, Lines: []Line{billBLine()}})
	if r.Intra || r.IGST != 1299377 {
		t.Errorf("intra=%v igst=%d", r.Intra, r.IGST)
	}
}

// ── §7 other cases ────────────────────────────────────────────────────────

func TestRoundHalfUp(t *testing.T) {
	for _, c := range []struct{ n, d, want int64 }{
		{5, 10, 1}, {-5, 10, -1}, {15, 10, 2}, {-15, 10, -2}, {4, 10, 0}, {-4, 10, 0}, {150, 100, 2}, {149, 100, 1},
	} {
		if got := roundHalfUp(c.n, c.d); got != c.want {
			t.Errorf("roundHalfUp(%d,%d) = %d, want %d", c.n, c.d, got, c.want)
		}
	}
}

func TestNegativeCreditNoteIsSymmetric(t *testing.T) {
	l := billBLine()
	l.QtyMilli = -l.QtyMilli
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, Lines: []Line{l}})
	check(t, flat(r), want{"taxable": -43312559, "cgst": -649688, "round_off": 35, "grand": -44611900})
}

func TestMakingModes(t *testing.T) {
	pct := mustCompute(t, Input{POS: walkIn(), Lines: []Line{{HSN: "7113", GSTRate: 3000, QtyMilli: 10000, RatePaise: 1000000, Making: &Making{MakingPercent, 12000}}}})
	check(t, flat(pct), want{"metal": 10000000, "making": 1200000, "taxable": 11200000})
	fl := mustCompute(t, Input{POS: walkIn(), Lines: []Line{{HSN: "7113", GSTRate: 3000, QtyMilli: 10000, RatePaise: 1000000, Making: &Making{MakingFlat, 50000}}}})
	check(t, flat(fl), want{"making": 50000, "taxable": 10050000})
}

func TestTwoHSNGroupsWithJobWork(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, Lines: []Line{
		billBLine(),
		{HSN: "9988", GSTRate: 5000, Other: 1500000}, // job work charge line, 5%
	}})
	if len(r.Groups) != 2 || r.Groups[1].CGST != 37500 || r.Groups[0].CGST != 649688 {
		t.Fatalf("groups = %+v", r.Groups)
	}
	if r.CGST != 649688+37500 || r.Taxable != 43312559+1500000 {
		t.Errorf("cgst=%d taxable=%d", r.CGST, r.Taxable)
	}
}

func TestSameHSNLinesShareAGroup(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), Lines: []Line{billBLine(), billBLine()}})
	if len(r.Groups) != 1 || r.CGST != mulDivRound(2*43312559, 3000, 200000) {
		t.Errorf("groups=%+v", r.Groups)
	}
}

func TestSmallAndZeroRates(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), Lines: []Line{{HSN: "7102", GSTRate: 250, Other: 1234567}}})
	check(t, flat(r), want{"cgst": 1543, "sgst": 1543}) // 1234567 × 0.125% = 1543.21
	z := mustCompute(t, Input{POS: walkIn(), Lines: []Line{{HSN: "7113", GSTRate: 0, Other: 1234567}}})
	check(t, flat(z), want{"cgst": 0, "grand": 1234567})
}

func TestUTGSTLabel(t *testing.T) {
	r := mustCompute(t, Input{POS: POSInput{ShopState: "04"}, SellerUT: true, Lines: []Line{billBLine()}})
	if r.StateTaxLabel != "UTGST" || !r.Intra {
		t.Errorf("label=%s intra=%v", r.StateTaxLabel, r.Intra)
	}
}

func TestTCS(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, TCSRate: 2000, Lines: []Line{billBLine()}})
	check(t, flat(r), want{"tcs": 892239, "round_off": 26, "grand": 45504200})
}

func TestRoundOffOff(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), Lines: []Line{billBLine()}})
	check(t, flat(r), want{"round_off": 0, "grand": 44611935})
}

func TestFiftyPaiseRoundsUp(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, Lines: []Line{{HSN: "7113", Other: 10050}}})
	check(t, flat(r), want{"round_off": 50, "grand": 10100})
}

func TestReverseStepPaisa(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), Reverse: true, RoundOff: true,
		Lines: []Line{{HSN: "71081310", GSTRate: 3000, QtyMilli: 52161, Target: 76000000}}})
	check(t, flat(r), want{"taxable": 73786408, "cgst": 1106796, "round_off": 0, "grand": 76000000})
}

func TestReverseWithMakingPercent(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), Reverse: true, RoundOff: true,
		Lines: []Line{{HSN: "7113", GSTRate: 3000, QtyMilli: 10000, Making: &Making{MakingPercent, 12000}, Target: 11536000}}})
	l := r.Lines[0]
	if r.GrandTotal != 11536000 || l.Metal+l.Making != l.Taxable || l.Metal != 10000000 {
		t.Errorf("grand=%d line=%+v", r.GrandTotal, l)
	}
}

func TestReverseMultiLine(t *testing.T) {
	// Every pair here must land exactly on ΣT (exercises the nudge when grouping shifts the total).
	targets := []int64{76000000, 4500100, 1233300, 999900, 100, 37700, 20022200}
	for _, step := range []bool{false, true} {
		for i := range targets {
			for j := range targets {
				in := Input{POS: walkIn(), Reverse: true, ReverseStepRupee: step, RoundOff: true, Lines: []Line{
					{HSN: "7113", GSTRate: 3000, QtyMilli: 10000, Target: targets[i]},
					{HSN: "7113", GSTRate: 3000, QtyMilli: 5000, Target: targets[j]},
				}}
				r, err := Compute(in)
				if err != nil {
					t.Fatal(err)
				}
				if r.GrandTotal != targets[i]+targets[j] {
					t.Errorf("step=%v %d+%d: grand=%d warnings=%v", step, targets[i], targets[j], r.GrandTotal, r.Warnings)
				}
			}
		}
	}
}

func TestReverseTooSmallForMaking(t *testing.T) {
	_, err := Compute(Input{POS: walkIn(), Reverse: true, RoundOff: true,
		Lines: []Line{{HSN: "7113", GSTRate: 3000, QtyMilli: 10000, Making: &Making{MakingFlat, 500000}, Target: 10000}}})
	if err == nil {
		t.Error("expected error")
	}
}

func TestLargeBillNoOverflow(t *testing.T) {
	// 100 kg @ ₹10,000/g = ₹100 crore
	r := mustCompute(t, Input{POS: walkIn(), RoundOff: true, Lines: []Line{{HSN: "7108", GSTRate: 3000, QtyMilli: 100_000_000, RatePaise: 1_000_000}}})
	check(t, flat(r), want{"taxable": 100_000_000_000, "cgst": 1_500_000_000, "grand": 103_000_000_000})
}

func TestBillOfSupply(t *testing.T) {
	r := mustCompute(t, Input{POS: walkIn(), BillOfSupply: true, RoundOff: true, Lines: []Line{billBLine()}})
	check(t, flat(r), want{"cgst": 0, "igst": 0, "taxable": 43312559, "grand": 43312600})
	rr := mustCompute(t, Input{POS: walkIn(), BillOfSupply: true, Reverse: true, RoundOff: true,
		Lines: []Line{{HSN: "7113", GSTRate: 3000, QtyMilli: 10000, Target: 5000000}}})
	check(t, flat(rr), want{"taxable": 5000000, "grand": 5000000})
}
