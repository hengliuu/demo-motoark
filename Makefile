.PHONY: dev test e2e

dev:
	(cd api && PORT=8080 go run ./cmd/api) & API=$$!; API_BASE_URL=http://localhost:8080 pnpm -C web dev & WEB=$$!; trap "kill $$API $$WEB 2>/dev/null" INT TERM; wait

test:
	cd api && go test ./...
	pnpm -C web test

e2e:
	pnpm -C web build
	pnpm -C e2e exec playwright test
