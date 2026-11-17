package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"hisab/internal/db"
	"hisab/migrations"
)

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if os.Getenv("APP_ENV") == "dev" {
		log = slog.New(slog.NewTextHandler(os.Stdout, nil))
	}
	slog.SetDefault(log)

	if err := run(*migrateOnly); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(migrateOnly bool) error {
	dbURL := must("DATABASE_URL")
	directURL := os.Getenv("DATABASE_URL_DIRECT")
	if directURL == "" {
		directURL = dbURL
	}
	if err := migrate(directURL); err != nil {
		return err
	}
	if migrateOnly {
		return nil
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	srv := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           routes(pool),
		ReadHeaderTimeout: 10 * time.Second,
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	slog.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	<-done // ListenAndServe returns as soon as Shutdown starts; wait for in-flight requests before pool.Close
	return nil
}

func migrate(url string) error {
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(sqlDB, ".")
}

func routes(pool *pgxpool.Pool) http.Handler {
	mux := http.NewServeMux()
	q := db.New(pool)

	// Health check for the host; never touches the DB so Neon can sleep.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		states, err := q.ListStates(r.Context())
		if err != nil {
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "states": len(states)})
	})

	// ponytail: Phase 0 only — delete once the cookie-through-rewrite check is recorded in PLAN.md.
	if os.Getenv("DEBUG_ROUTES") == "1" {
		name := env("SESSION_COOKIE_NAME", "__Host-sid")
		mux.HandleFunc("POST /api/debug/cookie", func(w http.ResponseWriter, _ *http.Request) {
			http.SetCookie(w, &http.Cookie{Name: name, Value: "test", Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 600})
			writeJSON(w, map[string]any{"set": name})
		})
		mux.HandleFunc("GET /api/debug/cookie", func(w http.ResponseWriter, r *http.Request) {
			v := ""
			if c, err := r.Cookie(name); err == nil {
				v = c.Value
			}
			writeJSON(w, map[string]any{"cookie": v, "server_time": time.Now().UTC()})
		})
	}

	cop := http.NewCrossOriginProtection()
	for _, k := range []string{"APP_ORIGIN", "ADMIN_ORIGIN"} {
		if o := os.Getenv(k); o != "" {
			if err := cop.AddTrustedOrigin(o); err != nil {
				slog.Error("bad origin", "var", k, "err", err)
			}
		}
	}
	return cop.Handler(mux)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func must(k string) string {
	v := os.Getenv(k)
	if v == "" {
		slog.Error("missing env", "var", k)
		os.Exit(1)
	}
	return v
}
