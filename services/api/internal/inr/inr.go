// Package inr formats paise in Indian grouping and writes amounts in words (lakh/crore).
package inr

import (
	"strconv"
	"strings"
)

// Format renders paise as "7,37,864.00" (Indian grouping, no ₹ sign).
func Format(paise int64) string {
	neg := paise < 0
	if neg {
		paise = -paise
	}
	rupees := strconv.FormatInt(paise/100, 10)
	if len(rupees) > 3 {
		head, tail := rupees[:len(rupees)-3], rupees[len(rupees)-3:]
		var parts []string
		for len(head) > 2 {
			parts = append([]string{head[len(head)-2:]}, parts...)
			head = head[:len(head)-2]
		}
		rupees = strings.Join(append(append([]string{head}, parts...), tail), ",")
	}
	s := rupees + "." + pad2(paise%100)
	if neg {
		return "-" + s
	}
	return s
}

func pad2(n int64) string {
	if n < 10 {
		return "0" + strconv.FormatInt(n, 10)
	}
	return strconv.FormatInt(n, 10)
}

var ones = []string{"Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
	"Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"}
var tens = []string{"", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"}

// Words renders paise as "Rupees Seven Lakh Sixty Thousand Only" /
// "Rupees Twenty-Two Thousand One Hundred Thirty-Five and Ninety-Two Paise Only".
func Words(paise int64) string {
	prefix := "Rupees "
	if paise < 0 {
		prefix, paise = "Minus Rupees ", -paise
	}
	s := prefix + number(paise/100)
	if p := paise % 100; p > 0 {
		s += " and " + number(p) + " Paise"
	}
	return s + " Only"
}

func number(n int64) string {
	if n < 20 {
		return ones[n]
	}
	if n < 100 {
		if n%10 == 0 {
			return tens[n/10]
		}
		return tens[n/10] + "-" + ones[n%10]
	}
	var parts []string
	for _, u := range []struct {
		div  int64
		name string
	}{{10_000_000, "Crore"}, {100_000, "Lakh"}, {1000, "Thousand"}, {100, "Hundred"}} {
		if q := n / u.div; q > 0 {
			parts = append(parts, number(q)+" "+u.name)
			n %= u.div
		}
	}
	if n > 0 {
		parts = append(parts, number(n))
	}
	return strings.Join(parts, " ")
}
