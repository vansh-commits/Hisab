// Package ibja reads the IBJA benchmark gold/silver rates from ibjarates.com.
// There is no official API, so this parses the public home page: the AM/PM tables
// (last few days, all purities) and the hidden chart data (~4 months of PM closes).
package ibja

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const URL = "https://www.ibjarates.com/"

// Rate is one benchmark price. Day is YYYY-MM-DD, Session "AM"/"PM", Paise per gram (ex-GST).
type Rate struct {
	Day     string
	Session string
	Purity  string // gold999 gold995 gold916 gold750 gold585 silver999
	Paise   int64
}

// Fetch downloads and parses the page.
func Fetch(ctx context.Context, c *http.Client, url string) ([]Rate, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; HisabRates/1.0)")
	res, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("ibja: status %d", res.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	return Parse(string(b))
}

var (
	cellRe   = regexp.MustCompile(`data-label="([^"]+)">\s*(?:<strong>)?\s*([^<]*?)\s*(?:</strong>)?\s*</td>`)
	hiddenRe = regexp.MustCompile(`id="(HdnGold|HdnSilver)" value="([^"]*)"`)
	purities = map[string]string{"Gold 999": "gold999", "Gold 995": "gold995", "Gold 916": "gold916", "Gold 750": "gold750", "Gold 585": "gold585", "Silver 999": "silver999"}
)

// toPaise converts the site's units (gold ₹/10g, silver ₹/kg) to paise per gram.
func toPaise(purity string, rupees int64) int64 {
	if purity == "silver999" {
		return (rupees + 5) / 10
	}
	return rupees * 10
}

func day(ddmmyyyy string) (string, error) {
	t, err := time.Parse("02/01/2006", strings.TrimSpace(ddmmyyyy))
	return t.Format("2006-01-02"), err
}

// Parse extracts every rate it can find; it errors only if it finds none.
func Parse(page string) ([]Rate, error) {
	var out []Rate

	// Chart history first, so the table rows (same PM day) win on upsert order.
	for _, m := range hiddenRe.FindAllStringSubmatch(page, -1) {
		var h map[string]json.RawMessage
		if json.Unmarshal([]byte(html.UnescapeString(m[2])), &h) != nil {
			continue
		}
		var labels []string
		_ = json.Unmarshal(h["labels"], &labels)
		series := map[string]string{"purity999": "gold999", "purity916": "gold916", "silverRate": "silver999"}
		for key, purity := range series {
			var vals []int64
			if json.Unmarshal(h[key], &vals) != nil || len(vals) != len(labels) {
				continue
			}
			for i, v := range vals {
				if d, err := day(labels[i]); err == nil && v > 0 {
					out = append(out, Rate{d, "PM", purity, toPaise(purity, v)})
				}
			}
		}
	}

	// AM/PM tables: a row starts with data-label="AM|PM" (the date), then one cell per purity.
	var d, session string
	for _, m := range cellRe.FindAllStringSubmatch(page, -1) {
		label, val := m[1], m[2]
		if label == "AM" || label == "PM" {
			session = label
			var err error
			if d, err = day(val); err != nil {
				d = ""
			}
			continue
		}
		p, ok := purities[label]
		if !ok || d == "" {
			continue
		}
		if v, err := strconv.ParseInt(val, 10, 64); err == nil && v > 0 {
			out = append(out, Rate{d, session, p, toPaise(p, v)})
		}
	}

	if len(out) == 0 {
		return nil, errors.New("ibja: no rates found on page")
	}
	// Chart and table repeat recent PM days; keep the last (table) value per key.
	idx := map[[3]string]int{}
	uniq := out[:0]
	for _, r := range out {
		k := [3]string{r.Day, r.Session, r.Purity}
		if i, ok := idx[k]; ok {
			uniq[i] = r
			continue
		}
		idx[k] = len(uniq)
		uniq = append(uniq, r)
	}
	return uniq, nil
}
