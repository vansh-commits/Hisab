// Package email sends transactional mail via the Gmail API (prod) or logs it (dev).
// Render/Railway block SMTP, so Gmail goes over HTTPS.
package email

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"strings"

	"golang.org/x/oauth2"
)

type Message struct {
	To, Subject, Text string
}

// Send is the one sending function the app uses.
type Send func(ctx context.Context, m Message) error

// FromEnv picks the driver from EMAIL_DRIVER (console | gmail).
func FromEnv() (Send, error) {
	switch d := os.Getenv("EMAIL_DRIVER"); d {
	case "", "console":
		return Console, nil
	case "gmail":
		return Gmail(os.Getenv("GMAIL_CLIENT_ID"), os.Getenv("GMAIL_CLIENT_SECRET"), os.Getenv("GMAIL_REFRESH_TOKEN"), os.Getenv("EMAIL_FROM"))
	default:
		return nil, fmt.Errorf("unknown EMAIL_DRIVER %q", d)
	}
}

func Console(_ context.Context, m Message) error {
	slog.Info("email (console driver)", "to", m.To, "subject", m.Subject, "text", m.Text)
	return nil
}

func Gmail(clientID, secret, refreshToken, from string) (Send, error) {
	if clientID == "" || secret == "" || refreshToken == "" || from == "" {
		return nil, fmt.Errorf("gmail driver needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, EMAIL_FROM")
	}
	cfg := &oauth2.Config{ClientID: clientID, ClientSecret: secret, Endpoint: oauth2.Endpoint{TokenURL: "https://oauth2.googleapis.com/token"},
		Scopes: []string{"https://www.googleapis.com/auth/gmail.send"}}
	src := cfg.TokenSource(context.Background(), &oauth2.Token{RefreshToken: refreshToken})
	client := oauth2.NewClient(context.Background(), src)

	return func(ctx context.Context, m Message) error {
		if strings.ContainsAny(m.To, "\r\n") {
			return fmt.Errorf("invalid recipient %q", m.To)
		}
		raw := buildRFC822(from, m)
		body, _ := json.Marshal(map[string]string{"raw": base64.RawURLEncoding.EncodeToString(raw)})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			"https://gmail.googleapis.com/gmail/v1/users/me/messages/send", bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
			return fmt.Errorf("gmail send: %s: %s", resp.Status, b)
		}
		return nil
	}, nil
}

func buildRFC822(from string, m Message) []byte {
	var b strings.Builder
	b.WriteString("From: Hisab <" + from + ">\r\n")
	b.WriteString("To: " + m.To + "\r\n")
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", m.Subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
	enc := base64.StdEncoding.EncodeToString([]byte(m.Text))
	for len(enc) > 76 { // RFC 2045 line limit
		b.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	b.WriteString(enc)
	return []byte(b.String())
}
