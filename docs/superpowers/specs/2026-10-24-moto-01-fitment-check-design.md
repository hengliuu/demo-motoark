---
code: MOTO-01
title: Fitment check, design
status: approved
created: 2026-10-24
intent: intent/2026-10-24-moto-01-fitment-check.md
prd: docs/product/MOTO-01-prd.md
fsd: docs/product/MOTO-01-fsd.md
figma: https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark
test_cases: https://docs.google.com/spreadsheets/d/1j8HJRov6OscoXFrF6r0uDkDZsXdzwwJM6ZRdQ1MAtfI/edit
---

# MOTO-01 Fitment check: design

The FSD says what the feature does. This document says how it is built.

## Shape

```
browser ──▶ web (Next.js on Workers) ──service binding──▶ api Worker ──▶ Go container
                 /api/fitment route                              /v1/fitment, /healthz
```

- **web/** is a Next.js App Router app with Tailwind CSS, shadcn/ui and TanStack Query, laid out
  module-first (`src/features/fitment/`). The form validates with Zod in the browser, then a
  mutation calls the route handler `/api/fitment`, which calls the Go API from the server. The
  browser never sees the API address.
- **api/** is a Go service on Gin, laid out module-first: one `fitment` module owns its handler,
  service and repository. The repository reads seed JSON embedded with `go:embed`, so there is
  no database and every test is deterministic.
- **api/worker/** is a small Worker that fronts the Go container through `@cloudflare/containers`.
  The web Worker reaches it through a service binding named `API`. Locally and in CI the web
  app reads `API_BASE_URL` instead, pointing at `go run`.

## Go layout

| Path | Holds | Tested by |
|---|---|---|
| `internal/fitment/service.go`, `params.go`, `model.go`, `errors.go` | `NormalizePart`, `ValidateVIN`, `ResolveSupersession` (5 hop cap), `Check`, and `ErrInvalidPart`, `ErrInvalidVIN`, `ErrUnknownVIN` | TC04, TC06, TC08 in `service_test.go` |
| `internal/fitment/repository.go`, `seed.json` | Repository interface and its implementation over the embedded seed | Through the service tests, with a fake |
| `internal/fitment/module.go`, `handler.go`, `dto.go` | Wiring, the Gin handler, JSON shapes | `handler_test.go` |
| `internal/platform/httpx`, `apperr` | Router, request ID, logging that masks the VIN, error kinds to HTTP status, graceful shutdown | TC13 |
| `cmd/api/main.go` | Config and wiring only | Build check |

## Web layout

| Path | Holds | Tested by |
|---|---|---|
| `src/features/fitment/types/` | Zod schemas for the form (the VIN rule) and the response | TC06 |
| `src/features/fitment/utils/format.ts` | `formatAED`, `tabbySplit` | TC09 |
| `src/features/fitment/api/` | `fitment-service.ts`, `use-fitment-mutations.ts`, maps errors and network failure to UI states | TC10 |
| `src/features/fitment/components/` | `FitmentCheck`, `FitmentForm`, `ResultBanner`, `ListingCard`, exported through `index.ts` | E2E |
| `src/app/fitment/page.tsx` | Thin route that renders `FitmentCheck` | E2E |
| `src/app/api/fitment/route.ts` | Server side call to the Go API | E2E |
| `src/components/ui/` | shadcn primitives, managed by the CLI | N/A |

The project skills `typescript-conventions`, `web-frontend-patterns` and `go-backend-patterns`
set the conventions. This demo differs in two places on purpose: English only, so strings are
inline instead of i18n keys, and no database, so the repository reads embedded JSON.

Components follow the Figma sections for MOTO-01. Tokens (colours, radii, fonts) live in the
Tailwind theme and match the Figma "Demo tokens" collection.

## Tests

- Unit and integration tests are written before the code they cover.
- Every test name starts with its test case ID, for example `MOTO-01-TC02 superseded part`.
- Playwright starts both servers (`go run ./api/cmd/api` and `next start`), runs a desktop and a
  390 px mobile project, and tags `@smoke` on TC01 and TC12 so the staging job can run only those.

## CI and deploy

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | Every pull request and push | Go vet and test, lint, type check, Vitest, build, Playwright, upload the Playwright report |
| `deploy.yml` | Push to `main` | Deploy staging with wrangler, run `@smoke` against the staging URL, wait for approval in the `production` environment, deploy production |

Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are environment secrets on the
GitHub environments `staging` and `production`. Both environments accept deployments from
`main` only, and `production` needs a reviewer. Pull requests, including ones from forks,
never see them.

## Rejected alternatives

- **Logic in Next.js route handlers only.** Simpler, but MotoArk's real catalogue logic belongs in
  a backend service, and the demo should show both halves.
- **A database for seed data.** Adds a moving part the feature does not need yet.
