// Package tax is the only GST implementation (docs/tax-engine.md). Pure functions, stdlib only.
//
// Units: money in paise, quantity/weight in milli-units (mg), rates in milli-percent (3% = 3000).
package tax

import (
	"errors"
	"fmt"
	"math/big"
)

// EngineVersion is stored on every document; bump on any change that could alter a number.
const EngineVersion = 1

// ── R0: one rounding function ─────────────────────────────────────────────

// mulDivRound returns roundHalfUp(a*b, d): a*b/d rounded to nearest, ties away from zero. d > 0.
// math/big because qty × rate × 10^5 overflows int64 for large bills.
func mulDivRound(a, b, d int64) int64 {
	n := new(big.Int).Mul(big.NewInt(a), big.NewInt(b))
	return roundBig(n, d)
}

func roundHalfUp(n, d int64) int64 { return roundBig(big.NewInt(n), d) }

func roundBig(n *big.Int, d int64) int64 {
	bd := big.NewInt(d)
	q, r := new(big.Int).QuoRem(n, bd, new(big.Int)) // truncated toward zero
	r.Abs(r).Lsh(r, 1)
	if r.Cmp(bd) >= 0 {
		q.Add(q, big.NewInt(int64(n.Sign())))
	}
	return q.Int64()
}

// floorDiv returns floor(a*b/d) for d > 0.
func floorDiv(a, b, d int64) int64 {
	n := new(big.Int).Mul(big.NewInt(a), big.NewInt(b))
	return n.Div(n, big.NewInt(d)).Int64() // Euclidean division == floor for d > 0
}

func roundRupee(p int64) int64 { return roundHalfUp(p, 100) * 100 }

// ── §3 Place of supply ────────────────────────────────────────────────────

type POSInput struct {
	ShopState       string
	BuyerRegistered bool   // buyer has a valid GSTIN
	BuyerState      string // recorded state of the buyer ("" if none)
	ConsigneeState  string
	GoodsMovement   bool
	DeliveryState   string // where movement terminates / delivery address state
	Override        string // per-bill override; always wins
}

// PlaceOfSupply implements the rule in tax-engine.md §3 (s.10(1)(ca) / s.10(1)(a),(b) IGST Act).
func PlaceOfSupply(in POSInput) string {
	if in.Override != "" {
		return in.Override
	}
	if !in.BuyerRegistered {
		return first(in.DeliveryState, in.BuyerState, in.ShopState)
	}
	if in.GoodsMovement {
		return first(in.DeliveryState, in.ConsigneeState, in.BuyerState, in.ShopState)
	}
	return in.ShopState // goods located at the shop at delivery
}

func first(s ...string) string {
	for _, v := range s {
		if v != "" {
			return v
		}
	}
	return ""
}

// ── Input / output ────────────────────────────────────────────────────────

type MakingMode string

const (
	MakingPerGram MakingMode = "per_gram" // Value: paise per gram
	MakingFlat    MakingMode = "flat"     // Value: paise
	MakingPercent MakingMode = "percent"  // Value: milli-percent of metal value
)

type Making struct {
	Mode  MakingMode
	Value int64
}

type Line struct {
	HSN       string
	GSTRate   int64 // milli-percent
	QtyMilli  int64 // 0 for a pure charge line (job work, repair)
	RatePaise int64 // forward mode
	Making    *Making
	Other     int64 // paise
	Target    int64 // reverse mode: inclusive total (GST incl., TCS excl.)
}

type OldGoldLine struct {
	GrossMg, LessMg int64
	RatePaise       int64 // per gram
}

type Input struct {
	POS              POSInput
	SellerUT         bool // seller state is a UT without legislature → UTGST label
	BillOfSupply     bool // composition / unregistered seller: no tax
	Reverse          bool // "Total se" mode
	ReverseStepRupee bool // reverse taxable rounded to the rupee
	RoundOff         bool
	TCSRate          int64 // milli-percent, 0 = off
	Lines            []Line
	OldGold          []OldGoldLine
}

type LineResult struct {
	Metal, Making, Other, Taxable int64
	RatePaise                     int64
	RateDerived                   bool
}

type Group struct {
	HSN                       string
	GSTRate                   int64
	Taxable, CGST, SGST, IGST int64
}

type OldGoldLineResult struct{ NetMg, Amount int64 }

type OldGoldResult struct {
	Lines           []OldGoldLineResult
	NetMg           int64
	Total, RoundOff int64
}

type Result struct {
	EngineVersion                                        int
	PlaceOfSupply                                        string
	Intra                                                bool
	BillOfSupply                                         bool
	StateTaxLabel                                        string // "SGST" | "UTGST"
	Lines                                                []LineResult
	Groups                                               []Group
	Taxable, CGST, SGST, IGST, TCS, RoundOff, GrandTotal int64
	OldGold                                              *OldGoldResult
	NetPayable                                           int64
	Warnings                                             []string
}

var ErrOldGoldExceedsTotal = errors.New("old gold value exceeds the bill total; use a standalone purchase voucher")

// ── Compute ───────────────────────────────────────────────────────────────

func Compute(in Input) (Result, error) {
	if len(in.Lines) == 0 {
		return Result{}, errors.New("at least one line is required")
	}
	for i, l := range in.Lines {
		if l.GSTRate < 0 || l.GSTRate > 100000 {
			return Result{}, fmt.Errorf("line %d: gst rate out of range", i+1)
		}
		if l.Making != nil && l.Making.Mode != MakingPerGram && l.Making.Mode != MakingFlat && l.Making.Mode != MakingPercent {
			return Result{}, fmt.Errorf("line %d: unknown making mode %q", i+1, l.Making.Mode)
		}
		if l.Making != nil && l.Making.Mode == MakingPercent && l.Making.Value < 0 {
			return Result{}, fmt.Errorf("line %d: making percent must not be negative", i+1)
		}
		if in.Reverse && l.Target <= 0 {
			return Result{}, fmt.Errorf("line %d: target total is required in reverse mode", i+1)
		}
		if in.Reverse && l.QtyMilli < 0 {
			return Result{}, fmt.Errorf("line %d: quantity must not be negative in reverse mode", i+1)
		}
	}
	if in.TCSRate < 0 || in.TCSRate > 10000 {
		return Result{}, errors.New("tcs rate out of range")
	}

	r := Result{EngineVersion: EngineVersion, BillOfSupply: in.BillOfSupply, StateTaxLabel: "SGST"}
	r.PlaceOfSupply = PlaceOfSupply(in.POS)
	r.Intra = r.PlaceOfSupply == in.POS.ShopState
	if in.SellerUT {
		r.StateTaxLabel = "UTGST"
	}

	r.Lines = make([]LineResult, len(in.Lines))
	if in.Reverse {
		if err := reverse(in, &r); err != nil {
			return Result{}, err
		}
	} else {
		for i, l := range in.Lines {
			r.Lines[i] = forwardLine(l)
		}
	}
	totals(in, &r)

	if len(in.OldGold) > 0 {
		og, err := OldGold(in.OldGold)
		if err != nil {
			return Result{}, err
		}
		if og.Total > r.GrandTotal {
			return Result{}, ErrOldGoldExceedsTotal
		}
		r.OldGold = &og
		r.NetPayable = r.GrandTotal - og.Total
	} else {
		r.NetPayable = r.GrandTotal
	}
	return r, nil
}

// R1
func forwardLine(l Line) LineResult {
	lr := LineResult{RatePaise: l.RatePaise, Other: l.Other}
	lr.Metal = mulDivRound(l.QtyMilli, l.RatePaise, 1000)
	lr.Making = making(l, lr.Metal)
	lr.Taxable = lr.Metal + lr.Making + lr.Other
	return lr
}

func making(l Line, metal int64) int64 {
	if l.Making == nil {
		return 0
	}
	switch l.Making.Mode {
	case MakingPerGram:
		return mulDivRound(l.QtyMilli, l.Making.Value, 1000)
	case MakingFlat:
		return l.Making.Value
	default: // percent
		return mulDivRound(metal, l.Making.Value, 100000)
	}
}

func effRate(in Input, rate int64) int64 {
	if in.BillOfSupply {
		return 0
	}
	return rate
}

// tax on one taxable amount (R3).
func lineTax(in Input, intra bool, taxable, rate int64) int64 {
	rate = effRate(in, rate)
	if intra {
		return 2 * mulDivRound(taxable, rate, 200000)
	}
	return mulDivRound(taxable, rate, 100000)
}

// R2, R3, R5, R6
func totals(in Input, r *Result) {
	type key struct {
		hsn  string
		rate int64
	}
	idx := map[key]int{}
	r.Groups = r.Groups[:0]
	for i, l := range in.Lines {
		k := key{l.HSN, effRate(in, l.GSTRate)}
		j, ok := idx[k]
		if !ok {
			j = len(r.Groups)
			idx[k] = j
			r.Groups = append(r.Groups, Group{HSN: k.hsn, GSTRate: k.rate})
		}
		r.Groups[j].Taxable += r.Lines[i].Taxable
	}
	r.Taxable, r.CGST, r.SGST, r.IGST = 0, 0, 0, 0
	for j := range r.Groups {
		g := &r.Groups[j]
		if r.Intra {
			g.CGST = mulDivRound(g.Taxable, g.GSTRate, 200000)
			g.SGST = g.CGST
		} else {
			g.IGST = mulDivRound(g.Taxable, g.GSTRate, 100000)
		}
		r.Taxable += g.Taxable
		r.CGST += g.CGST
		r.SGST += g.SGST
		r.IGST += g.IGST
	}
	gst := r.CGST + r.SGST + r.IGST
	r.TCS = mulDivRound(r.Taxable+gst, in.TCSRate, 100000)
	pre := r.Taxable + gst + r.TCS
	r.GrandTotal, r.RoundOff = pre, 0
	if in.RoundOff {
		r.GrandTotal = roundRupee(pre)
		r.RoundOff = r.GrandTotal - pre
	}
}

// ── §4 Reverse ("Total se") ───────────────────────────────────────────────

func reverse(in Input, r *Result) error {
	step := int64(1)
	if in.ReverseStepRupee {
		step = 100
	}
	for i, l := range in.Lines {
		c, ok := solveLine(in, r.Intra, l, step)
		if !ok && step > 1 {
			c, ok = solveLine(in, r.Intra, l, 1) // a rupee-step taxable can't always hit T (e.g. 28%)
		}
		if !ok {
			got := c + lineTax(in, r.Intra, c, l.GSTRate)
			dir := "short of"
			if got > l.Target {
				dir = "over"
			}
			r.Warnings = append(r.Warnings, fmt.Sprintf("line %d: ₹%s %s target", i+1, paiseString(l.Target-got), dir))
		}
		lr, err := splitTaxable(l, c)
		if err != nil {
			return fmt.Errorf("line %d: %w", i+1, err)
		}
		r.Lines[i] = lr
	}

	// Multi-line: grouping can shift the rounded total; nudge the largest line (≤ 2 tries).
	var sumT int64
	for _, l := range in.Lines {
		sumT += l.Target
	}
	for try := 0; try < 2 && len(in.Lines) > 1; try++ {
		totals(in, r)
		pre := r.Taxable + r.CGST + r.SGST + r.IGST
		if (in.RoundOff && roundRupee(pre) == sumT) || (!in.RoundOff && pre == sumT) {
			return nil
		}
		li := largest(r.Lines)
		l := in.Lines[li]
		delta := mulDivRound(sumT-pre, 100000, 100000+effRate(in, l.GSTRate))
		if try == 0 && step > 1 {
			delta = roundHalfUp(delta, step) * step
		}
		if delta == 0 {
			delta = sign(sumT - pre)
		}
		lr, err := splitTaxable(l, r.Lines[li].Taxable+delta)
		if err != nil {
			return err
		}
		r.Lines[li] = lr
	}
	if len(in.Lines) > 1 {
		totals(in, r)
		pre := r.Taxable + r.CGST + r.SGST + r.IGST
		if (in.RoundOff && roundRupee(pre) != sumT) || (!in.RoundOff && pre != sumT) {
			r.Warnings = append(r.Warnings, "total differs from the sum of line targets")
		}
	}
	return nil
}

// solveLine finds a taxable c (multiple of step) such that c + tax(c) hits the target.
func solveLine(in Input, intra bool, l Line, step int64) (int64, bool) {
	den := 100000 + effRate(in, l.GSTRate)
	lo := floorDiv(l.Target, 100000, den*step) * step
	cands := []int64{lo, lo + step}
	// order by distance to the exact estimate T*100000/den, compared as c*den vs T*100000
	dist := func(c int64) *big.Int {
		d := new(big.Int).Sub(new(big.Int).Mul(big.NewInt(c), big.NewInt(den)), new(big.Int).Mul(big.NewInt(l.Target), big.NewInt(100000)))
		return d.Abs(d)
	}
	if dist(cands[1]).Cmp(dist(cands[0])) < 0 {
		cands[0], cands[1] = cands[1], cands[0]
	}
	for _, c := range cands {
		got := c + lineTax(in, intra, c, l.GSTRate)
		if (in.RoundOff && roundRupee(got) == l.Target) || (!in.RoundOff && got == l.Target) {
			return c, true
		}
	}
	return cands[0], false
}

// splitTaxable breaks a line's taxable value back into metal/making/other and derives the rate (R7).
func splitTaxable(l Line, c int64) (LineResult, error) {
	lr := LineResult{Taxable: c, Other: l.Other}
	if l.Making != nil && l.Making.Mode == MakingPercent {
		base := c - l.Other
		lr.Metal = mulDivRound(base, 100000, 100000+l.Making.Value)
		lr.Making = base - lr.Metal
	} else {
		lr.Making = making(l, 0)
		lr.Metal = c - lr.Making - lr.Other
	}
	if lr.Metal < 0 || (l.QtyMilli != 0 && lr.Metal == 0) {
		return LineResult{}, errors.New("target total is too small for the making/other charges")
	}
	if l.QtyMilli == 0 {
		// pure charge line: everything that isn't making is "other"
		lr.Other += lr.Metal
		lr.Metal = 0
		return lr, nil
	}
	lr.RatePaise = mulDivRound(lr.Metal, 1000, l.QtyMilli)
	lr.RateDerived = true
	return lr, nil
}

func largest(ls []LineResult) int {
	b := 0
	for i, l := range ls {
		if l.Taxable > ls[b].Taxable {
			b = i
		}
	}
	return b
}

func sign(x int64) int64 {
	switch {
	case x > 0:
		return 1
	case x < 0:
		return -1
	}
	return 0
}

func paiseString(p int64) string {
	if p < 0 {
		p = -p
	}
	return fmt.Sprintf("%d.%02d", p/100, p%100)
}

// ── §5 Old gold (R8) ──────────────────────────────────────────────────────

// OldGold values old gold bought from a customer. No GST. Total is rounded to the rupee.
func OldGold(lines []OldGoldLine) (OldGoldResult, error) {
	var og OldGoldResult
	var pre int64
	for i, l := range lines {
		net := l.GrossMg - l.LessMg
		if net <= 0 || l.LessMg < 0 {
			return OldGoldResult{}, fmt.Errorf("old gold line %d: net weight must be positive", i+1)
		}
		if l.RatePaise <= 0 {
			return OldGoldResult{}, fmt.Errorf("old gold line %d: rate must be positive", i+1)
		}
		amt := mulDivRound(net, l.RatePaise, 1000)
		og.Lines = append(og.Lines, OldGoldLineResult{NetMg: net, Amount: amt})
		og.NetMg += net
		pre += amt
	}
	if len(og.Lines) == 0 {
		return OldGoldResult{}, errors.New("old gold needs at least one line")
	}
	og.Total = roundRupee(pre)
	og.RoundOff = og.Total - pre
	return og, nil
}
