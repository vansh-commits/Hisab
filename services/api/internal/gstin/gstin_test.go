package gstin

import (
	"errors"
	"testing"
)

func TestValid(t *testing.T) {
	for _, g := range []string{"27AAPFU0939F1ZV", "29AAGCB7383J1Z4", "33AAACH7409R1Z8", "24AAACC1206D1ZM", "27AAACR5055K1Z7"} {
		if err := Validate(g); err != nil {
			t.Errorf("%s: %v", g, err)
		}
	}
}

func TestInvalid(t *testing.T) {
	for g, want := range map[string]error{
		"27AAPFU0939F1ZW": ErrChecksum, // last char changed
		"27AAPFU0939F1Z":  ErrFormat,
		"27aapfu0939f1zv": ErrFormat, // must be normalised first
		"27AAPFU0939F0ZV": ErrFormat, // entity code can't be 0
		"25AAPFU0939F1ZV": ErrState,
		"27AAPF10939F1ZV": ErrFormat, // PAN pattern broken
	} {
		if err := Validate(g); !errors.Is(err, want) {
			t.Errorf("%s: got %v, want %v", g, err, want)
		}
	}
	if Validate(Normalize(" 27aapfu0939f1zv ")) != nil {
		t.Error("normalised GSTIN rejected")
	}
}
