---
code: MOTO-01
title: Fitment check
type: PRD
status: approved
created: 2026-10-24
fsd: docs/product/MOTO-01-fsd.md
figma: https://www.figma.com/design/YCIlnlqh1GWYBDsZwxKjOV/Demo-Motoark
---

# MOTO-01 Fitment check

Product requirements. A demo feature for MotoArk, built on fictional seed data.

## Problem

MotoArk sells used genuine OEM parts. When a buyer orders a part that does not fit their car,
the order comes back as a return. In an escrow marketplace that return is also a dispute: the
seller is not paid, the courier is paid twice, and the buyer trusts the next listing less.

Buyers cannot check fit themselves. The number on a used part's label has often been
superseded by a newer number, and most buyers do not know their car's chassis code. They do
know their VIN, because it is printed on the vehicle registration card (Mulkiya).

## Goal

A buyer knows, before paying, whether a part fits their car.

## Success metrics

These are hypotheses. The baseline has to come from MotoArk's own order data.

| Metric | Baseline | Target |
|---|---|---|
| Orders returned as "does not fit" | Measure for 4 weeks first | Half of baseline, 3 months after launch |
| Part searches that include a VIN check | 0 | 30% of searches |
| Add to cart after a "Fits" result | N/A | Higher than searches with no check |

## Users

A buyer in the UAE, on desktop or mobile, with the registration card at hand. English only
for this release.

## User stories

| ID | Story |
|---|---|
| MOTO-01-US1 | As a buyer, I enter a part number and my VIN and see whether that part fits my car |
| MOTO-01-US2 | As a buyer whose part number was replaced, I see the new number and listings for it |
| MOTO-01-US3 | As a buyer whose car does not take this part, I am told clearly and shown where to go next |

## Scope

In scope: Mercedes-Benz, one seed vehicle, three seed part numbers, the fitment check page
and its three results, listings with price and Tabby split, desktop and mobile.

Out of scope: checkout, accounts, real catalogue data, other brands, photo or label search,
Arabic and right-to-left layout.

## Release

Every pull request runs the full test suite. A merge to `main` deploys to staging and runs
smoke tests there. Production needs a person's approval in GitHub.

## Open questions for MotoArk

- Where does fitment data come from today: an EPC licence, a supplier feed, or manual entry?
- How are "does not fit" returns recorded, so the baseline can be measured?
