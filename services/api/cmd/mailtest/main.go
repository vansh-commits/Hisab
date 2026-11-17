// Phase 0 check 3: send one mail with the configured driver.
//
//	EMAIL_DRIVER=gmail GMAIL_...=... go run ./cmd/mailtest -to you@example.com
package main

import (
	"context"
	"flag"
	"log"

	"hisab/internal/email"
)

func main() {
	to := flag.String("to", "", "recipient")
	flag.Parse()
	if *to == "" {
		log.Fatal("-to is required")
	}
	send, err := email.FromEnv()
	if err != nil {
		log.Fatal(err)
	}
	if err := send(context.Background(), email.Message{To: *to, Subject: "Hisab test ✓ ₹", Text: "Namaste! Gmail API se mail aa gaya. ₹7,37,864.00"}); err != nil {
		log.Fatal(err)
	}
	log.Println("sent")
}
