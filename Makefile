SHELL := /bin/bash
API := services/api
-include .env
export

.PHONY: db dev migrate gen test fuzz

# Postgres 17 in Docker on :5433 (5432 is often taken). No compose file.
db:
	docker start hisab-pg 2>/dev/null || docker run -d --name hisab-pg -p 5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
	until docker exec hisab-pg pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do sleep 0.5; done
	docker exec hisab-pg psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='hisab'" | grep -q 1 || docker exec hisab-pg createdb -U postgres hisab
	docker exec hisab-pg psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='hisab_test'" | grep -q 1 || docker exec hisab-pg createdb -U postgres hisab_test

dev:
	trap 'kill 0' EXIT; \
	(cd $(API) && go run ./cmd/api) & \
	pnpm --filter web dev & \
	pnpm --filter admin dev & \
	wait

migrate:
	cd $(API) && go run ./cmd/api -migrate-only

gen:
	cd $(API) && sqlc generate

test:
	cd $(API) && go test ./...
	pnpm -r typecheck

fuzz:
	cd $(API) && go test ./internal/tax -run '^$$' -fuzz=FuzzReverse -fuzztime=10m
