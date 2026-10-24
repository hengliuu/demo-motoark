---
code: MOTO-01
status: IN_PROGRESS
created_by: Hengky
current_handler: Hengky (first push, green CI run, merge)
tier: role-orchestrator
spec: docs/superpowers/specs/2026-10-24-moto-01-fitment-check-design.md
fsd: docs/product/MOTO-01-fsd.md
test_cases: https://docs.google.com/spreadsheets/d/1j8HJRov6OscoXFrF6r0uDkDZsXdzwwJM6ZRdQ1MAtfI/edit
---

# MOTO-01 Fitment check: implementation plan

> **For agentic workers:** use `test-driven-development` for every task that adds behaviour.
> Steps use checkboxes. Tick a box the moment its check passes.

**Goal:** a buyer enters a part number and a VIN and sees Fits, Superseded or Does not fit,
with listings, before paying. Acceptance criteria MOTO-01-AC01 to AC10 in the FSD.

**Architecture:** Next.js web app on Cloudflare Workers calls a Go API that runs in a
Cloudflare Container, through a service binding. Seed data is embedded in the Go binary.
Details in the spec.

**Tech stack:** Next.js (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query,
react-hook-form and Zod, Vitest, Playwright, pnpm. Go with Gin. wrangler,
`@opennextjs/cloudflare`, `@cloudflare/containers`, GitHub Actions.

**Conventions:** load the project skills before writing code: `typescript-conventions`, then
`web-frontend-patterns` for `web/`, and `go-backend-patterns` for `api/`. The project
`AGENTS.md` wins where they differ. Two deliberate differences for this demo: English only, so
no i18n keys (strings inline), and no database, so the fitment repository reads seed JSON
embedded with `go:embed` instead of GORM. Look up library APIs with Context7 before writing
code against them.

**Design:** Figma file "Demo-Motoark", page "MOTO-01 Fitment check". Each screen is a section:

| Section | Link |
|---|---|
| 00 Brief | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=23-723 |
| 01 Flow | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=23-724 |
| 02 Empty | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=24-561 |
| 03 Validation error | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=24-661 |
| 04 Checking | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=24-787 |
| 05 Fits | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=24-1050 |
| 06 Superseded | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=25-1156 |
| 07 Does not fit | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=25-1244 |
| 08 Unknown VIN | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=25-1339 |
| 09 API unavailable | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=25-1448 |
| 10 Mobile | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=25-1708 |
| Components | https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark?node-id=20-101 |

---

### Task 1: Scaffold the repo

**Files:** `web/**`, `api/go.mod`, `api/go.sum`, `api/cmd/api/main.go`, `api/worker/package.json`, `e2e/**` (config only), `package.json`, `pnpm-workspace.yaml`, `Makefile`, `.gitignore`

- [x] pnpm workspace with `web`, `e2e` and `api/worker`. Create `web/` with create-next-app: TypeScript, App Router, Tailwind, ESLint, `src/` dir.
- [x] Scripts in `web/package.json`: `lint`, `type-check` (`tsc --noEmit`), `test` (Vitest).
- [x] Install every dependency the later tasks need now (TanStack Query, react-hook-form, Zod, Vitest, Testing Library, Playwright, `@opennextjs/cloudflare`, wrangler, `@cloudflare/containers`, and `github.com/gin-gonic/gin` in Go), so the parallel tasks never edit a `package.json`, lockfile or `go.mod` at the same time.
- [x] Init shadcn/ui and add `button input label card alert badge separator skeleton form`.
- [x] Put the Figma tokens into the Tailwind theme: ink `#111827`, red `#E60115`, card radius 14, input radius 10, Archivo for display, Manrope for UI, Geist Mono for part numbers.
- [x] `api/cmd/api/main.go`: Gin router serving `GET /healthz` on `PORT` (default 8080).
- [x] `e2e/playwright.config.ts`: two web servers (`go run ./api/cmd/api` on 8080, `next start` on 3000 with `API_BASE_URL=http://localhost:8080`), projects `desktop` and `mobile` (390 by 844).
- [x] Root `Makefile` with `dev` (Go API and Next.js together), `test` (Go and Vitest) and `e2e` (Playwright).
- [x] `.gitignore` covers `node_modules`, `.next`, `.open-next`, `.wrangler`, `.dev.vars`, `.env*`, `playwright-report`, `test-results`, `coverage`.
- [x] Check: `pnpm -C web lint && pnpm -C web type-check && pnpm -C web build`, `cd api && go build ./...` and `pnpm -C e2e exec playwright test --list` all succeed.

### Task 2: Go fitment module, domain

**Files:** `api/internal/fitment/service.go`, `params.go`, `model.go`, `errors.go`, `repository.go`, `seed.json`, `service_test.go`

- [x] Failing tests first in `service_test.go`, with a fake repository: TC04 normalisation, TC06 VIN rule, TC08 cycle stops at 5 hops, and one test per result (fits, superseded, no fit) against the seed VIN.
- [x] `seed.json` from the FSD, read by the repository through `go:embed`. Listings: 3 for `A0004204102`, 2 for `A2059065903`, none for `A1669060103`.
- [x] `Service` with `NormalizePart`, `ValidateVIN`, `ResolveSupersession`, `Check`. Errors `ErrInvalidPart`, `ErrInvalidVIN`, `ErrUnknownVIN`.
- [x] Check: `cd api && go test ./internal/fitment/...` passes.

### Task 3: Go HTTP layer

**Files:** `api/internal/fitment/module.go`, `handler.go`, `dto.go`, `handler_test.go`, `api/internal/platform/**`, `api/cmd/api/main.go`

- [x] Failing tests first with `httptest`: 200 for each result, 400 `invalid_part` and `invalid_vin`, 404 `unknown_vin`. TC13 in `internal/platform/httpx`: the log line masks the VIN and carries a request ID.
- [x] `GET /v1/fitment` through `module.RegisterRoutes`, JSON shape from the FSD, errors mapped in `platform/apperr` and written by `httpx.WriteError`, graceful shutdown on SIGTERM.
- [x] Check: `cd api && go vet ./... && go test ./...` passes.

### Task 4: Web fitment feature

**Files:** `web/src/features/fitment/**`, `web/src/lib/**`

- [x] Failing Vitest first: TC06 (the Zod VIN rule in `types/`), TC09 (`formatAED(1250)` is `AED 1,250`, `tabbySplit(1250)` is `AED 312.50`, in `utils/`), TC10 (the service maps a network error to `unavailable`, in `api/`).
- [x] `types/` Zod schemas for the form and the response. `api/fitment-service.ts` on the shared client, `api/use-fitment-mutations.ts` with the check as a mutation. `utils/format.ts`.
- [x] `components/`: `FitmentCheck`, `FitmentForm` (react-hook-form and the form wrappers), `ResultBanner`, `ListingCard`, exported through `components/index.ts`. Built on shadcn, matching the Figma sections above. Pull design context from the section links.
- [x] Check: `pnpm -C web test && pnpm -C web lint && pnpm -C web type-check` passes.

### Task 5: Routes

**Files:** `web/src/app/**`

- [x] `app/fitment/page.tsx` renders `FitmentCheck`. `app/api/fitment/route.ts` calls the Go API from the server (the `API` service binding on Cloudflare, `API_BASE_URL` elsewhere), so the browser never sees the API address. `/` links to `/fitment`.
- [x] Every state in the FSD renders: empty, checking, three results, unknown VIN, unavailable with Try again.
- [x] Check: `pnpm -C web build` passes and each state renders against `go run`.

### Task 6: End-to-end tests

**Files:** `e2e/**` (specs)

- [x] `e2e/fitment.spec.ts`: TC01, TC02, TC03, TC05, TC07, TC09, TC11. Test titles start with the TC ID. TC01 is tagged `@smoke`.
- [x] `e2e/smoke.spec.ts`: TC12, reads `BASE_URL`, tagged `@smoke`.
- [x] Check: `pnpm -C e2e exec playwright test` passes on both projects.

### Task 7: CI

**Files:** `.github/workflows/ci.yml`

- [x] On pull request and push: gitleaks over the diff, Go vet and test, `pnpm install --frozen-lockfile`, lint, type check, Vitest, build, `playwright install --with-deps chromium`, Playwright, upload `playwright-report` as an artifact.
- [x] `permissions: contents: read` at the top. Actions pinned to a major version.
- [ ] Check: `actionlint` passes, and the first pull request shows the run green. (actionlint passed 2026-10-25. Green run pending the first push.)

### Task 8: Cloudflare deploy

**Files:** `api/Dockerfile`, `api/worker/**` (except `package.json`), `web/wrangler.jsonc`, `web/open-next.config.ts`, `.github/workflows/deploy.yml`

- [x] `api/Dockerfile`: multi-stage Go build for `linux/amd64` into a small runtime image, listens on 8080.
- [x] `api/worker/`: Worker plus `wrangler.jsonc` with a `containers` entry (`image: ../Dockerfile`), the Durable Object binding and `new_sqlite_classes` migration, routing every request to the container. Envs `staging` and `production`.
- [x] `web/`: OpenNext config and `wrangler.jsonc` with a service binding `API` to the api Worker, envs `staging` and `production`.
- [x] `deploy.yml` on push to `main` only: a `staging` job with `environment: staging` deploys api then web and runs `playwright test --grep @smoke` against the staging URL. A `production` job with `environment: production` waits for the required reviewer, then deploys. Cloudflare credentials come from environment secrets, never from repo secrets or code.
- [x] Every Worker name starts with `motoark-demo-` (for example `motoark-demo-web-staging`, `motoark-demo-api-production`). The Cloudflare account is shared, so `deploy.yml` first runs a guard step that fails when any `name` in a `wrangler.jsonc`, top level or per env, lacks that prefix.
- [x] Check: `wrangler deploy --dry-run` succeeds for both Workers, the guard fails on a wrong name and passes on the real config, `actionlint` passes.

### Task 9: Review

- [x] Reviewer checks the branch against the spec and FSD: every AC has a passing test, error codes match the FSD, the VIN is never logged in full, no secret is committed, the project skills were followed.
- [x] Reviewer lists any missing test case as a proposal (TC ID, AC, steps, expected) for the sheet.

### Task 10: QA record

- [x] Read the "MOTO-01 Test cases" sheet, run the suite, write Pass or Fail and the run date per TC, add reviewer proposals with status Proposed, and add one row to "Runs".

---

## Task table

| # | Task | Depends on | Files it writes | Role | Effort | Check |
|---|---|---|---|---|---|---|
| 1 | Scaffold the repo | none | `web/**`, `api/go.mod`, `api/cmd/**`, `e2e/` config, workspace files, `Makefile` | chore | medium | lint, type check, build, `go build`, `playwright --list` |
| 2 | Go fitment module, domain | 1 | `api/internal/fitment/` (service, params, model, errors, repository, seed) | worker | medium | `go test ./internal/fitment/...` (TC04, TC06, TC08) |
| 3 | Go HTTP layer | 2 | `api/internal/fitment/` (module, handler, dto), `api/internal/platform/**`, `api/cmd/api/main.go` | worker | medium | `go vet`, `go test ./...` (TC13) |
| 4 | Web fitment feature | 1 | `web/src/features/fitment/**`, `web/src/lib/**` | worker | high | Vitest (TC06, TC09, TC10), lint, type check |
| 5 | Routes | 3, 4 | `web/src/app/**` | worker | high | build, each state renders |
| 6 | End-to-end tests | 5 | `e2e/**` specs | worker | medium | `playwright test` |
| 7 | CI | 1 | `.github/workflows/ci.yml` | chore | medium | actionlint, green run on the pull request |
| 8 | Cloudflare deploy | 1 | `api/Dockerfile`, `api/worker/**`, `web/wrangler.jsonc`, `web/open-next.config.ts`, `.github/workflows/deploy.yml` | worker | medium | `wrangler deploy --dry-run` both, name guard, actionlint |
| 9 | Review | 2 to 8 | none (read only) | reviewer | high | findings list with file and line |
| 10 | QA record | 6, 9 | none in the repo, the test case sheet | main session | medium | sheet updated, one row in Runs |

Waves: Task 1 first. Then 2, 4, 7 and 8 in parallel (different files). Then 3, then 5, then 6.
Then 9 and 10.

## Batch notes (role-orchestrator run, 2026-10-25)

Run start: 2026-10-25 00:24:02 WIB. Tier: role-orchestrator.

## Decisions
- Hengky: a well-formed part number not in the catalogue answers 200 `no_fit` with an empty name. Needs a proposed TC.
- Orchestrator: shadcn `field` instead of `form` (base-nova style has no `form`, and form-wrappers.md supports `field`).
- Orchestrator: pnpm 11 `allowBuilds` instead of `onlyBuiltDependencies`.
- Orchestrator: Playwright Go server runs `go run ./cmd/api` with `cwd ../api` (plan text says `go run ./api/cmd/api`, no go.work).
- Orchestrator: gitleaks-action@v3, not @v2 (Node 20 runtime removed from hosted runners). No GITLEAKS_LICENSE, repo owner is a User.
- Jev route: UNSURE on Task 1 (chore vs worker 0.55). Kept chore on Haiku, Hengky asked for it.

## For the reviewer
- T2 labels the "part outside the catalogue" subtest TC03. It is new behaviour: propose a TC instead.
- T7 check half pending: green CI run on the first pull request.
- Orchestrator: T3 maps domain sentinels to HTTP in fitment/handler.go (apperr importing fitment would cycle). 500 is `internal` / "Something went wrong".
- T3 proposes a TC: AC05, blank part number, 400 invalid_part "Enter a part number".
- T8 needs from Hengky in GitHub: environments staging and production (main only), required reviewer on production, env secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, env variable STAGING_URL on staging, token scoped for Workers, DO and Containers.
- T8: guard checks Worker and container names, not service-binding targets (all prefixed today). api/worker has no tsconfig or workers-types (would need a package.json change).
- T8 red step was weak (missing-module failure). The real failing case is the bad-name copy.
- GitHub setup verified 2026-10-25 (read only): staging and production, main-only branch policy, required reviewer hengliuu on production, both Cloudflare secrets on each, STAGING_URL variable on staging.
- T4 read 15 Figma nodes itself (banner 24:825, 25:1012, 25:1194 first). Banner values recorded in its report. Feature-local tokens in web/src/features/fitment/fitment-tokens.css.
- Hengky: no "Add to cart" on the listing card (checkout out of scope). Removed by chore T4b. Seller location line and verified tick omitted (not in the contract).
- T4 adapted copy: delivery "Delivery: Next day", no_fit banner text without part chassis, "1 seller has this part".
- T4 proposes a TC: AC01 checking state (button disabled with spinner, skeleton shown).
- Orchestrator review of T5 screenshots against Figma 25:1010: superseded summary showed only the old number and the header said "this part". Fixed in T5b (old → new, "You searched ...", "the new part").
- Orchestrator: TC12 needs a health check on the web URL. T5b adds /api/healthz proxying Go /healthz. Red in T6's worktree until T5b merges.
- Orchestrator: next dev request log printed the full VIN. T5b sets logging.incomingRequests to skip /api/fitment.
- Open for Hengky: T5 NavBar has a cart icon and inert Brands, How it works, Log in, Create Account and search (copied from Figma). Nav colours are hardcoded hex.
- Hengky: nav is only the MotoArk wordmark with DEMO and a Fitment Check link. Every control on screen must work. Done in chore T5c (1c71757).
- Orchestrator (from Hengky's rule): "Sort: Lowest price" box becomes plain text "Sorted by lowest price". In T5b.
- Hengky: no-fit "Search parts" link dropped. "Check another part" keeps the VIN and clears the part number. AC03 reworded in the FSD to "a way to check another part for the same vehicle". In T5b. Sheet TC03 expected result and AC03 in Figma brief (23:568) need the same wording at QA time.
- Review (T9, Opus high): merge after fixes. 1 major, 4 minor, 9 nits, 8 borrowed TC IDs, TC14 to TC24 proposed. Orchestrator error: accepted T3's "import cycle" reason for not wrapping apperr. The reviewer showed fitment importing apperr is no cycle.
- Hengky: fix all findings and nits, rename the 8 borrowed IDs to TC14 to TC24.
- Hengky: keep observability on, disable invocation logs. Verified with Context7 (Workers Logs docs: `observability.logs.invocation_logs = false`, a fetch invocation log's message is `<Method> <URL>`). `redact_query_string` also present in the installed wrangler schema, set true. No POST switch needed.
- Hengky: port stays 3000 (6000 is on Chrome's unsafe-port list, ERR_UNSAFE_PORT verified with Playwright Chromium).
- Hengky: deploy.yml polls /api/healthz for up to 90 s before the staging smoke test. make dev passes API_BASE_URL=http://localhost:8080.
- Hengky sets the required CI check on main after the first pull request run.
- Orchestrator: FSD server line says Gin. AGENTS.md (CLAUDE.md symlinks to it) says "Worker name, container name and service-binding target".
- R1 merged (10 commits). Orchestrator review added one: a VIN typed into the part field with separators was not masked (fixed, red then green).
- R2 merged (7 commits). Banner colour assertion proven to bite (TC03 red on a style swap). Lint boundary proven. TC16 aria-busy, TC17, TC19, TC21 and TC22 pinned by deliberate breaks, not fake reds. TC21's next.config half and TC14 e2e are unproven pins.
- Orchestrator ID calls on R2's open questions: "a valid VIN passes" to TC17, healthz failure branches to TC20, formatPartNumber tests to a new proposed TC25 "Part numbers display spaced in OEM groups". TC04 accepted, route TC01 pass-through, TC03 no-link and TC24 stay.
- Task 10: 25 test cases ran on edc4904. TC01 to TC11, TC13 and TC14 to TC25 pass. TC12 passed against localhost and stays Not run until the staging smoke job. TC14 to TC25 added to the sheet as Proposed. One row in Runs.
- Open before status DONE: the green CI run on the first pull request (Task 7 check), Hengky accepting TC14 to TC25, and the required CI check on main (Hengky).
