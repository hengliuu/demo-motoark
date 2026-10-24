---
code: MOTO-01
title: Fitment check
type: FSD
status: approved
created: 2026-10-24
prd: docs/product/MOTO-01-prd.md
test_cases: Google Sheet "MOTO-01 Test cases"
---

# MOTO-01 Fitment check

Functional specification. Read the [PRD](MOTO-01-prd.md) first for the why.

## System

| Part | Technology | Deployed to |
|---|---|---|
| `web/` | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | Cloudflare Workers, through OpenNext |
| `api/` | Go with Gin, seed data embedded in the binary | Cloudflare Containers |

The page calls the API from the server. The browser never calls the API directly.

## Screen: Fitment check (`/fitment`)

| Field | Rule | Error message |
|---|---|---|
| Part number | Required. Spaces, dots and dashes are removed, letters uppercased | Enter a part number |
| VIN | Required. 17 letters and digits, never I, O or Q | Enter the 17-character VIN from your registration card |

Validation runs in the browser before any request. The API validates again and returns the
same error codes.

| State | What the page shows |
|---|---|
| Empty | The form, with an example of where to find the VIN |
| Checking | The button shows a spinner and is disabled |
| Fits | Green banner, vehicle, part, listings |
| Superseded | Amber banner, old number to new number, listings for the new number |
| Does not fit | Red banner, the vehicle, and Check another part, which keeps the VIN and clears the part number |
| Unknown VIN | Inline message: We couldn't find this VIN. Check it against your registration card |
| API unavailable | Fitment check is unavailable right now, and a Try again button |

## Listings

Each listing shows the yard, grade (A, B or C), price, warranty in days and delivery estimate.
Listings are sorted by price, lowest first. Price reads `AED 1,250`. Under it:
`or 4 payments of AED 312.50 with Tabby`, which is the price divided by 4, two decimals.

## API

`GET /v1/fitment?part=<part number>&vin=<VIN>`

| Status | Body |
|---|---|
| 200 | `result` (`fits`, `superseded` or `no_fit`), `vehicle`, `part`, `resolved` (number and chain), `listings` |
| 400 | `error.code` is `invalid_part` or `invalid_vin` |
| 404 | `error.code` is `unknown_vin` |

`GET /healthz` returns 200 with `ok`.

## Rules

- Supersession is followed to the newest number, at most 5 hops. A cycle in the data stops
  at the cap, so a request can never hang.
- A result of `superseded` means the newest number fits the vehicle.
- A well-formed part number that is not in the catalogue answers 200 `no_fit`, never an error.
- The API logs one line per request with a request ID, and never logs the full VIN (the last
  6 characters are masked).

## Seed data (fictional)

Vehicle: VIN `WDD2050421R123456` is a Mercedes-Benz C 200, chassis W205, 2019.

| Part number | Name | Result for the seed VIN |
|---|---|---|
| `A0004204102` | Front brake pad set | Fits |
| `A2059062203` | Headlamp, left | Superseded by `A2059065903`, which fits |
| `A1669060103` | Headlamp, left (W166) | Does not fit |

Yards: Al Quoz Auto Recyclers, Sharjah Parts Yard, Ras Al Khor Dismantling.

## Acceptance criteria

| ID | Criterion | Story |
|---|---|---|
| MOTO-01-AC01 | A fitting part shows the green Fits result, the vehicle and its listings | US1 |
| MOTO-01-AC02 | A superseded part shows the amber result, old to new number, and listings for the new number | US2 |
| MOTO-01-AC03 | A part that does not fit shows the red result and a way to check another part for the same vehicle | US3 |
| MOTO-01-AC04 | `A 205 906 22 03`, `a2059062203` and `A-205.906.22.03` are treated as the same number | US1 |
| MOTO-01-AC05 | An invalid VIN shows the inline error and sends no request | US1 |
| MOTO-01-AC06 | A valid but unknown VIN shows the unknown VIN message | US1 |
| MOTO-01-AC07 | A supersession cycle stops at 5 hops | US2 |
| MOTO-01-AC08 | Prices read `AED 1,250` with the Tabby line under each one | US1 |
| MOTO-01-AC09 | When the API is down, the page shows the unavailable state with Try again | US1 |
| MOTO-01-AC10 | At 390 px wide the page has no horizontal scroll and the form is stacked | US1 |

Each criterion has at least one test case in the "MOTO-01 Test cases" sheet. Test names in
code start with the test case ID, so a CI failure points straight back to the sheet.
