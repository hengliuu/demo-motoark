.PHONY: dev test e2e

dev:
	(cd api && go run ./cmd/api) & API=$$!; pnpm -C web dev & WEB=$$!; trap "kill $$API $$WEB 2>/dev/null" INT TERM; wait

test:
	cd api && go test ./...
	pnpm -C web test

e2e:
	pnpm -C web build
	pnpm -C e2e exec playwright test
