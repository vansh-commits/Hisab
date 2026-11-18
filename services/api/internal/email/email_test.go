package email

import (
	"io"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"testing"
)

func TestBuildRFC822RoundTrip(t *testing.T) {
	text := "Namaste! ₹7,37,864.00 " + strings.Repeat("long line ", 20)
	msg, err := mail.ReadMessage(strings.NewReader(string(buildRFC822("a@gmail.com", Message{To: "b@x.in", Subject: "Hi ₹", Text: text}))))
	if err != nil {
		t.Fatal(err)
	}
	if got := msg.Header.Get("Content-Transfer-Encoding"); got != "quoted-printable" {
		t.Fatalf("encoding %q", got)
	}
	body, _ := io.ReadAll(quotedprintable.NewReader(msg.Body))
	if string(body) != text {
		t.Fatalf("body %q", body)
	}
}
