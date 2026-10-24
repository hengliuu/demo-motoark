# demo-motoark

A demo feature for MotoArk, a UAE marketplace for used genuine OEM parts: MOTO-01 Fitment
check. A buyer enters a part number and a VIN and learns whether the part fits before paying.
Seed data is fictional. Not affiliated with MotoArk.

## Repo map

- `docs/product/` holds the PRD and FSD. They are the baseline, and the FSD's acceptance
  criteria (MOTO-01-AC01 to AC10) are what "done" means.
- `intent/` holds the intent, including the operating procedure.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design and the plan. The
  plan's task table drives execution.
- `web/` is Next.js on Cloudflare Workers. `api/` is Go on Cloudflare Containers, fronted by
  `api/worker/`. `e2e/` is Playwright. These appear when the plan runs.

## Stack skills

Load before writing code: `typescript-conventions`, then `web-frontend-patterns` for `web/`,
and `go-backend-patterns` for `api/`. Two deliberate differences in this repo:

- English only, so UI strings are inline, with no i18n keys.
- No database. The fitment repository reads seed JSON embedded with `go:embed`.

## Conventions

- pnpm workspace (`web`, `e2e`, `api/worker`). Go with Gin.
- Every test name starts with its test case ID, for example `MOTO-01-TC02 superseded part`.
  The IDs come from the "MOTO-01 Test cases" Google Sheet linked in the plan.
- Never log a full VIN. Mask the last 6 characters.
- Look up library APIs with Context7 before writing code against them.

## Agents

- Roles: worker, chore, reviewer. At most 4 agents at once.
- Checks before reporting: `make test` for unit tests, `make e2e` for Playwright.
- Reviewer lenses, in order: acceptance criteria covered by tests, error contracts against the
  FSD, secrets and logging, then the stack skills.
- Never touch `.github/workflows/deploy.yml` outside its plan task, and never deploy. Deploys
  run from GitHub Actions only.
- The Cloudflare account is shared with another product. Every Worker, container and binding
  name in a `wrangler.jsonc` starts with `motoark-demo-`. Never reference, list or change any
  other Worker.

## Commands

- `make dev` runs the Go API and Next.js together.
- `make test` runs Go and Vitest. `make e2e` runs Playwright.
- Never commit secrets, never read `.env` files, never print a token. Cloudflare credentials
  live only in GitHub environment secrets.

When a task is complete and there are uncommitted changes, offer `commit-group`.
