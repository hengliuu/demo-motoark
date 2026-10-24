---
code: MOTO-01
type: decision
date: 2026-10-24
decided_by: Hengky
---

# MOTO-01: why this feature

How the demo feature was chosen, before the PRD and FSD existed. The conversation with the
agent was in Indonesian, quoted here as it happened (trimmed to the relevant part).

## The ask

> Sesi video 2: mulailah disini untuk coba show bahwa kita akan ngebuat salah satu fitur untuk
> motoark, boleh kasi saran ga? soalnya aku cek di figma isinya kayak cuma 4 doang. goalsnya
> belum jelas tujuannya untuk apa.

## The options the agent proposed

**Fitment check (recommended).** Pembeli memasukkan VIN dan langsung tahu apakah part-nya
cocok, sudah diganti nomor baru (superseded), atau tidak cocok. Goal-nya menekan retur dan
sengketa escrow, yang paling mahal bagi marketplace part bekas. Scope-nya kecil, deterministik
dan aman untuk direkam. Logikanya ditaruh di Go API.

**Reservasi part (transaksional).** Part bekas hanya ada satu unit, jadi ditahan 15 menit untuk
pembeli pertama. Ada uji dua pembeli berebut part yang sama, dan ini nyambung langsung ke
proposal transaksional. Lebih mengesankan, tapi butuh database (Postgres), lebih banyak bagian
yang bisa gagal saat rekaman, dan build-nya lebih lama.

## Decision

Fitment check, as MOTO-01. It goes after the most expensive failure in a used parts
marketplace (a part that does not fit becomes a return and an escrow dispute), and it is small
enough to build end to end in one session. The reservation flow moves to the call with MotoArk
as an engineering proposal.

## What followed

1. The agent drafted the [PRD](MOTO-01-prd.md) and [FSD](MOTO-01-fsd.md) from this decision.
2. Hengky reviewed and approved both. They are the baseline: the FSD's acceptance criteria are
   what "done" means.
3. The [intent](../../intent/2026-10-24-moto-01-fitment-check.md), the
   [design spec](../superpowers/specs/2026-10-24-moto-01-fitment-check-design.md), the Figma
   screens and the [plan](../superpowers/plans/2026-10-24-moto-01-fitment-check.md) came next.
