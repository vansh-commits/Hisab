package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"hisab/internal/email"
	"hisab/internal/server"
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
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	dev := os.Getenv("APP_ENV") == "dev"
	if u, err := url.Parse(dbURL); err != nil || (dev && u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1") {
		return errors.New("APP_ENV=dev is only allowed with a local DATABASE_URL")
	}
	directURL := os.Getenv("DATABASE_URL_DIRECT")
	if directURL == "" {
		directURL = dbURL
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := migrations.Up(ctx, directURL); err != nil {
		return err
	}
	if migrateOnly {
		return nil
	}

	cfg := server.Config{
		Dev:            dev,
		AppOrigin:      os.Getenv("APP_ORIGIN"),
		AdminOrigin:    os.Getenv("ADMIN_ORIGIN"),
		AdminEmails:    map[string]bool{},
		GoogleClientID: os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleSecret:   os.Getenv("GOOGLE_CLIENT_SECRET"),
	}
	if cfg.AppOrigin == "" {
		return errors.New("APP_ORIGIN is required")
	}
	for _, e := range strings.Split(os.Getenv("ADMIN_EMAILS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			cfg.AdminEmails[e] = true
		}
	}
	send, err := email.FromEnv()
	if err != nil {
		return err
	}

	pcfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return err
	}
	pcfg.MaxConns = 4 // per instance; Neon's pooler fans in
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           server.New(pool, cfg, send).Routes(),
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
	slog.Info("listening", "addr", srv.Addr, "dev", dev)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("listen: %w", err)
	}
	<-done // ListenAndServe returns as soon as Shutdown starts; wait for in-flight requests before pool.Close
	return nil
}
