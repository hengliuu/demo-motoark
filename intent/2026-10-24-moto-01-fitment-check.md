# Intent: buyers order used parts that do not fit their car

Author: Hengky (engineer, demo). Status: accepted.
Code: MOTO-01. Baseline: [PRD](../docs/product/MOTO-01-prd.md) and [FSD](../docs/product/MOTO-01-fsd.md).

## Problem

A buyer who orders a part that does not fit returns it. In escrow that return is a dispute:
the seller is not paid, the courier is paid twice, and trust drops. Buyers cannot check fit
themselves because part numbers get superseded and few buyers know their chassis code.

## Proposed outcome

Before paying, a buyer enters a part number and the VIN from their registration card, and
sees one of three answers: Fits, Superseded (the newer number fits) or Does not fit.

## Success measure

Orders returned as "does not fit" fall to half of the baseline within 3 months of launch.
Source: MotoArk order and return records. The baseline is measured for 4 weeks before launch.

## Affected users and systems

Buyers on web and mobile web. The listing catalogue and its fitment data. Customer support,
who handle disputes today.

## Constraints

Fictional seed data only. Mercedes-Benz only. English only. No personal data stored, and the
full VIN is never logged.

## Risks

- Wrong fitment data tells a buyer a part fits when it does not. That is worse than no check.
- A supersession chain with a cycle could hang a request if it is not capped.
- An outage of the fitment API must not block browsing or checkout.

## Operating procedure

| Signal | Where | Action |
|---|---|---|
| `/healthz` fails on staging or production | Cloudflare health check, GitHub Actions smoke job | Roll back to the previous Worker version with `wrangler rollback`, then open an incident note |
| Error rate on `/v1/fitment` above 2% for 10 minutes | Cloudflare Workers observability | Check the logs by request ID, roll back if the last deploy is the cause |
| A buyer reports a wrong "Fits" answer | Customer support | Mark the fitment record as disputed, add a test case for it, fix the data first |

Every incident ends as a new intent or a new test case, so the next change has a check for it.

## Open questions

- Which fitment data source will MotoArk license, and how often does it update?
- Who owns the fitment data once it is wrong: catalogue team or support?
