// Phase 0 check 4: writes out.pdf; open it and confirm ₹7,37,864.00 renders.
package main

import (
	"log"
	"os"
	"time"

	"hisab/internal/pdf"
)

func main() {
	b, err := pdf.ClassicV1("Tax Invoice", "7,37,864.00", time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC))
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile("out.pdf", b, 0o644); err != nil {
		log.Fatal(err)
	}
	log.Println("wrote out.pdf")
}
