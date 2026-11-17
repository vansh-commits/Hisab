package inr

import "testing"

func TestFormat(t *testing.T) {
	for in, want := range map[int64]string{
		0: "0.00", 99999: "999.99", 10000000: "1,00,000.00", 73786400: "7,37,864.00",
		100000: "1,000.00", 1234567890123: "12,34,56,78,901.23", -44611900: "-4,46,119.00", 5: "0.05",
	} {
		if got := Format(in); got != want {
			t.Errorf("Format(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestWords(t *testing.T) {
	for in, want := range map[int64]string{
		0:               "Rupees Zero Only",
		8:               "Rupees Zero and Eight Paise Only",
		10000000:        "Rupees One Lakh Only",
		1000000000:      "Rupees One Crore Only",
		100000000000:    "Rupees One Hundred Crore Only",
		76000000:        "Rupees Seven Lakh Sixty Thousand Only",
		2213592:         "Rupees Twenty-Two Thousand One Hundred Thirty-Five and Ninety-Two Paise Only",
		1299376:         "Rupees Twelve Thousand Nine Hundred Ninety-Three and Seventy-Six Paise Only",
		31555900:        "Rupees Three Lakh Fifteen Thousand Five Hundred Fifty-Nine Only",
		-4500:           "Minus Rupees Forty-Five Only",
		123456789012345: "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six Crore Seventy-Eight Lakh Ninety Thousand One Hundred Twenty-Three and Forty-Five Paise Only",
	} {
		if got := Words(in); got != want {
			t.Errorf("Words(%d)\n got %q\nwant %q", in, got, want)
		}
	}
}
