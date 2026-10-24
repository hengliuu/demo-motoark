# MotoArk demo: MOTO-01 Fitment check

A demo feature for MotoArk, a UAE marketplace for used genuine OEM parts. A buyer enters a part
number and the VIN from their registration card, and learns before paying whether the part fits:
Fits, Superseded (the newer number fits) or Does not fit.

The seed data is fictional, and this project is not affiliated with MotoArk.

## How it works

```
browser ──▶ web (Next.js on Cloudflare Workers) ──service binding API──▶ api Worker ──▶ Go container
                 /fitment, /api/fitment, /api/healthz                         /v1/fitment, /healthz
```

- `web/` is Next.js (App Router) with Tailwind CSS, shadcn/ui and TanStack Query, deployed to
  Cloudflare Workers with OpenNext. The browser only calls the web route `/api/fitment`, which
  calls the Go API from the server.
- `api/` is a Go service on Gin. The fitment data is seed JSON embedded in the binary, so there
  is no database. It runs in a Cloudflare Container, fronted by the Worker in `api/worker/`.
- `e2e/` holds the Playwright tests. They run on a desktop and a mobile (390 by 844) project.

## Try it

| Part number | Name | Result for VIN `WDD2050421R123456` (Mercedes-Benz C 200, W205, 2019) |
|---|---|---|
| `A0004204102` | Front brake pad set | Fits, with 3 listings |
| `A2059062203` | Headlamp, left | Superseded by `A2059065903`, which fits, with 2 listings |
| `A1669060103` | Headlamp, left (W166) | Does not fit |

Part numbers can be typed with spaces, dots or dashes (`A-205.906.22.03`). An unknown VIN such as
`WDD2050421R999999` shows the unknown VIN message.

## Run it locally

You need Go 1.27, Node 24 or later and pnpm 11.

```
pnpm install
make dev
```

`make dev` starts the Go API on port 8080 and Next.js on port 3000. Open
http://localhost:3000/fitment.

## Test it

| Command | Runs |
|---|---|
| `make test` | Go unit tests and Vitest |
| `make e2e` | Builds the web app and runs every Playwright test against `next start` on Node |
| `make e2e-workers` | Builds with OpenNext and runs the `@smoke` tests against the Workers runtime, the one staging uses |

`make e2e` uses ports 8080 and 3000, and `make e2e-workers` uses 8080 and 8787. Every test name
starts with its test case ID (for example `MOTO-01-TC08`), which maps to the "MOTO-01 Test
cases" sheet linked in the plan.

## Deploy

Deploys run from GitHub Actions only, never from a laptop. A push to `main` runs
`.github/workflows/deploy.yml`: it deploys staging, waits for `/api/healthz`, runs the `@smoke`
tests against the staging URL, and deploys production after a reviewer approves. Cloudflare
credentials live only in the `staging` and `production` GitHub environments.

The Cloudflare account is shared with another product, so every Worker, container and
service-binding target name starts with `motoark-demo-`. A guard step fails the deploy otherwise.

## Docs

| Document | Holds |
|---|---|
| `docs/product/MOTO-01-prd.md` | The problem, users and success metrics |
| `docs/product/MOTO-01-fsd.md` | Screens, the API contract and acceptance criteria MOTO-01-AC01 to AC10 |
| `intent/2026-10-24-moto-01-fitment-check.md` | Why it was built, and the operating procedure |
| `docs/superpowers/specs/` | The design |
| `docs/superpowers/plans/` | The implementation plan and its task table |
| `AGENTS.md` | Working rules for agents in this repo |
