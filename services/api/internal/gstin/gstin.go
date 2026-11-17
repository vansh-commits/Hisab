// Package gstin validates GSTINs: format, state prefix, embedded PAN pattern and checksum.
package gstin

import (
	"errors"
	"regexp"
	"strings"
)

const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

var format = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)

// GST state codes (01–38 except retired 25/28) + 97 Other Territory + 99 Centre Jurisdiction.
var states = map[string]bool{}

func init() {
	for _, c := range strings.Fields("01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 26 27 29 30 31 32 33 34 35 36 37 38 97 99") {
		states[c] = true
	}
}

var (
	ErrFormat   = errors.New("GSTIN must be 15 characters like 08ABCDE1234F1Z5")
	ErrState    = errors.New("GSTIN starts with an unknown state code")
	ErrChecksum = errors.New("GSTIN check digit doesn't match; please re-check the number")
)

// Normalize upper-cases and trims; call before Validate and before storing.
func Normalize(s string) string { return strings.ToUpper(strings.TrimSpace(s)) }

func Validate(g string) error {
	if !format.MatchString(g) {
		return ErrFormat
	}
	if !states[g[:2]] {
		return ErrState
	}
	if CheckChar(g[:14]) != g[14] {
		return ErrChecksum
	}
	return nil
}

// CheckChar computes the 15th character from the first 14 (tax-engine.md §8).
func CheckChar(first14 string) byte {
	sum := 0
	for i := 0; i < 14; i++ {
		p := strings.IndexByte(chars, first14[i]) * (1 + i%2)
		sum += p/36 + p%36
	}
	return chars[(36-sum%36)%36]
}

// StateCode returns the 2-digit state prefix.
func StateCode(g string) string { return g[:2] }
