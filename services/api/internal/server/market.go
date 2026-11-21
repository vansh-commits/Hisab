package server

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"hisab/internal/db"
	"hisab/internal/ibja"
)

// ── market (IBJA) rates ─────────────────────────────────────────────────
// IBJA publishes twice a weekday (~12pm AM, ~5pm PM IST), so there is no live stream:
// reads fetch lazily when a newer session should exist, and Refresh forces a fetch.

// expectedSession is the latest IBJA session that should be out by now ("" before noon or on weekends).
func expectedSession(now time.Time) (day, session string) {
	t := now.In(ist)
	if wd := t.Weekday(); wd == time.Saturday || wd == time.Sunday {
		return "", ""
	}
	mins := t.Hour()*60 + t.Minute()
	switch {
	case mins >= 17*60+15:
		return t.Format("2006-01-02"), "PM"
	case mins >= 12*60+15:
		return t.Format("2006-01-02"), "AM"
	}
	return "", ""
}

func pgDate(s string) pgtype.Date {
	t, _ := time.Parse("2006-01-02", s)
	return pgtype.Date{Time: t, Valid: true}
}

// syncMarket fetches IBJA unless it fetched within `every`. With force=false it also skips
// when the expected session is already stored (holidays retry at most every `every`).
// ponytail: throttle state is per instance; move to a DB row if instances multiply.
func (s *Server) syncMarket(ctx context.Context, every time.Duration, force bool) {
	if !force {
		d, sess := expectedSession(time.Now())
		if d == "" {
			// Nothing new due (weekend/morning): fetch only if we have nothing recent at all.
			if last, err := s.Q.LatestMarketDay(ctx); err != nil || time.Since(last.Time) < 5*24*time.Hour {
				return
			}
		} else if ok, err := s.Q.HasMarketRate(ctx, db.HasMarketRateParams{Day: pgDate(d), Session: sess}); err != nil || ok {
			return
		}
	}
	s.mu.Lock()
	if time.Since(s.marketTry) < every {
		s.mu.Unlock()
		return
	}
	s.marketTry = time.Now()
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	rates, err := ibja.Fetch(ctx, &http.Client{}, s.Cfg.IBJAURL)
	if err == nil {
		p := db.UpsertMarketRatesParams{}
		for _, r := range rates {
			p.Days = append(p.Days, pgDate(r.Day))
			p.Sessions, p.Purities, p.Paise = append(p.Sessions, r.Session), append(p.Purities, r.Purity), append(p.Paise, r.Paise)
		}
		err = s.Q.UpsertMarketRates(ctx, p)
	}
	s.mu.Lock()
	s.marketErr = err
	s.mu.Unlock()
	if err != nil {
		slog.Warn("ibja fetch failed", "err", err)
	}
}

func (s *Server) writeMarket(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days <= 0 || days > 3650 {
		days = 400
	}
	since := time.Now().In(ist).AddDate(0, 0, -days).Format("2006-01-02")
	rows, err := s.Q.ListMarketRates(r.Context(), pgDate(since))
	if err != nil {
		internalError(w, r, err)
		return
	}
	s.mu.Lock()
	stale := s.marketErr != nil
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"items": nonNil(rows), "stale": stale})
}

func (s *Server) getMarket(w http.ResponseWriter, r *http.Request) {
	s.syncMarket(r.Context(), 10*time.Minute, false)
	s.writeMarket(w, r)
}

func (s *Server) refreshMarket(w http.ResponseWriter, r *http.Request) {
	s.syncMarket(r.Context(), 2*time.Minute, true)
	s.writeMarket(w, r)
}
