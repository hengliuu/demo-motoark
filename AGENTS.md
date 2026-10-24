# demo-motoark

A demo feature for MotoArk, a UAE marketplace for used genuine OEM parts: MOTO-01 Fitment
check. A buyer enters a part number and a VIN and learns whether the part fits before paying.
Seed data is fictional. Not affiliated with MotoArk.

## Repo map

- `docs/product/` holds the PRD and FSD. They are the baseline, and the FSD's acceptance
  criteria (MOTO-01-AC01 to AC10) are what "done" means. The FSD's API section is the contract.
- `intent/` holds the intent, including the operating procedure.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design and the plan.
- `web/` is Next.js on Cloudflare Workers, feature code in `web/src/features/fitment/`. `api/` is
  Go with Gin on Cloudflare Containers, fronted by `api/worker/`. `e2e/` is Playwright.
- The browser calls only the web route `/api/fitment`. It calls Go `/v1/fitment` through the
  `API` service binding on Cloudflare and `API_BASE_URL` elsewhere, so the browser never sees
  the API address.

## Stack skills

Load before writing code: `typescript-conventions`, then `web-frontend-patterns` for `web/`,
and `go-backend-patterns` for `api/`. Two deliberate differences in this repo:

- English only, so UI strings are inline, with no i18n keys.
- No database. The fitment repository reads seed JSON embedded with `go:embed`.

## Product rules

- Out of scope: checkout, accounts, brands other than Mercedes-Benz, Arabic.
- Every control on screen must work. No placeholder links, buttons or fake controls.

## Conventions

- pnpm workspace (`web`, `e2e`, `api/worker`). A dependency with a build script needs an
  `allowBuilds` entry in `pnpm-workspace.yaml`, or `pnpm install` fails.
- Every test name starts with the ID of the test case it checks, for example
  `MOTO-01-TC02 superseded part`. IDs come from the "MOTO-01 Test cases" Google Sheet linked in
  the plan. Never invent or borrow one: a test with no matching case gets a proposed row first.
- Never log a full VIN, whichever field it arrives in. Mask the last 6 characters. Cloudflare
  invocation logs stay off in both `wrangler.jsonc` files because request URLs carry the VIN.
- Look up library APIs with Context7 before writing code against them.

## Agents

- Roles: worker, chore, reviewer. At most 4 agents at once.
- Checks before reporting: `make test` for unit tests, `make e2e` for Playwright. `make e2e`
  owns ports 8080 and 3000, so an agent running servers next to it uses other ports.
- Reviewer lenses, in order: acceptance criteria covered by tests, error contracts against the
  FSD, secrets and logging, then the stack skills.
- Never deploy. GitHub Actions deploys on push to `main`: staging, the `@smoke` run, then
  production after a reviewer approves. Change `.github/workflows/deploy.yml` only in a deploy task.
- The Cloudflare account is shared with another product. Every Worker name, container name and
  service-binding target in a `wrangler.jsonc` starts with `motoark-demo-`, and
  `.github/scripts/check-names.mjs` fails the deploy otherwise. Never reference, list or change
  any other Worker.

## Commands

- `make dev` runs the Go API on 8080 and Next.js on 3000, wired with `API_BASE_URL`.
- `make test` runs Go and Vitest. `make e2e` builds the web app and runs Playwright on the
  `desktop` and `mobile` (390 by 844) projects against `next start` on Node.
- `make e2e-workers` builds with OpenNext and runs the `@smoke` tests against the Workers
  runtime (ports 8080 and 8787). Node passing does not prove the Worker renders, so run it
  after any change to `next.config.ts`, `open-next.config.ts` or `web/wrangler.jsonc`.
- Never commit secrets, never read `.env` files, never print a token. Cloudflare credentials
  live only in GitHub environment secrets.

When a task is complete and there are uncommitted changes, offer `commit-group`.
