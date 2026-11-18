// Package migrations holds the goose SQL files and runs them.
package migrations

import (
	"context"
	"database/sql"
	"embed"
	"log/slog"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed *.sql
var FS embed.FS

// Up runs on every cold start. Vercel may start several instances at once,
// so a Postgres advisory lock serialises them.
func Up(ctx context.Context, url string) error {
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return err
	}
	p, err := goose.NewProvider(goose.DialectPostgres, sqlDB, FS, goose.WithSessionLocker(locker))
	if err != nil {
		return err
	}
	res, err := p.Up(ctx)
	for _, r := range res {
		slog.Info("migrated", "file", r.Source.Path, "took", r.Duration)
	}
	return err
}
