# CLAUDE.md — Wood Panel Optimization Web App (nesting-pro)

> Durable project context for Claude Code. This file is auto-loaded every session.
> Keep the **Current state** section updated as work lands so a lost/closed session
> costs nothing to resume. The full build spec lives in `instructions.md`.

---

## What this app is

Ingests panel cutting data (CSV) → runs machine-appropriate 2D cutting optimization →
exports either:

- **NanXing FCC nesting XML** for the **Nanxing NCG2812LE** CNC nesting router, or
- a **labeled layout PDF** for the **panel saw** operator.

It replaces **NirvanaTec PLUS 2D** for the panel-saw workflow.

### The one non-negotiable design principle
**Two machines = two different optimizers, not one optimizer with two exporters.**

| | Panel Saw | Nanxing NCG2812LE |
|---|---|---|
| Cut | Straight, edge-to-edge | Each part routed individually |
| Algorithm | **Guillotine** bin-packing | **Free / true-shape** nesting |
| Output | Labeled layout PDF + cut sequence | FCC nesting **XML** + per-part toolpaths |

Never feed free-nest output to the saw exporter — a non-guillotine layout **cannot** be
cut on a panel saw. Target machine is chosen up front by the user and drives everything.

### Confirmed shop parameters
- Router tool Ø: **fixed 6mm**. Board margin: **variable — user input**.
- Offcut/oddment reuse: **in scope** (returnable stock, M8).
- **Grain-directional stock IS used** — rotation must be lockable per material/part.
  Do not assume rotation is free just because sample CSVs showed grain=0.
- Golden machine-cut XML files exist and were reverse-engineered → see `instructions.md`
  **Appendix A** (turns M6 from guesswork into a derived spec).

---

## Architecture (CONFIRMED)

- **Core + exporters: Python (FastAPI).** Pure, framework-free `optimizer/` package that
  FastAPI wraps, so it's independently testable.
  Endpoints: `POST /optimize`, `POST /export/xml`, `POST /export/pdf`.
- **Frontend: React + TypeScript (Vite).** PapaParse for CSV, SVG/Canvas for previews.
- Everything crosses the boundary as the **normalized JSON contract** (see `instructions.md` §3).

Key libs: `shapely` (geometry), `rectpack`/custom packers (nesting), `lxml` (FCC XML),
`reportlab`/`svglib` (PDF).

---

## Milestone status

> Verified 2026-08-12 by actually running the code against `sample_data/` (both CSVs and the
> real golden XML files), not just reading it. A three-phase fix plan was written to
> `~/.claude/plans/delegated-moseying-robin.md`; **Phases A, B, and C are all done**, plus
> follow-on M6 and M7 passes (each planned separately, same plan file, overwritten per pass).
> Remaining work is M3 polish and M8.

| # | Milestone | Status | Evidence |
|---|-----------|--------|----------|
| M1 | Parser + normalized model | 🟢 Fixed + tested | Parses both real CSVs cleanly (55 + 50 parts, 0 errors). Quoted-space edge codes (`""" """` → `'" "'`) now normalize to `""` (`normalize_edge_value` in `parser.py`). Job grouping now splits by `(material, thickness, grain)` as independent nesting jobs (both optimizers). Covered by `backend/tests/test_parser.py` (10 tests). |
| M2 | Guillotine optimizer (saw) | 🟢 Fixed + tested | Rewrote placement in `guillotine.py` around a true binary guillotine split (`guillotine_split`) instead of the old 4-way maxrects-style split — free rectangles can no longer overlap by construction. Multi-sheet loop opens new sheets of a board type until every part is placed or genuinely too large for an empty board. Covered by `backend/tests/test_guillotine.py` (7 invariant tests × 2 real sample files, incl. an automated guillotine-decomposability check per spec §7.4). **Verified the suite has teeth**: temporarily restored the original buggy `guillotine.py` and reran — 8/14 tests failed (overlaps, dropped parts, non-decomposable layouts), confirming these tests would have caught the original bug. Cut list now flows through to `/optimize`'s response. |
| M3 | PDF layout export (saw) | 🟡 Skeletal | Unchanged this pass. Runs and returns real PDF bytes via `/export/pdf`. Missing most of spec §6a: no cut L×W label per part (only barcode), no footer summary line (`Stock# · Dim · Qty · Material · Thk · Utl%`), no cut-sequence list/overlay (the `cuts` data is still not wired into the PDF renderer, only into the `/optimize` JSON). Never visually inspected. No tests. |
| M4 | Free-nest optimizer (router) | 🟢 Fixed + tested | Same multi-sheet loop and grain-grouping fix as M2. Covered by `backend/tests/test_nanxing.py` (5 invariant tests × 2 real sample files: no overlaps, in-bounds, every part placed, utilization in range). Algorithm itself is still a naive left-to-right row/shelf packer, not maxrects/skyline/BLF — valid but likely below achievable utilization; not part of this fix pass. |
| M5 | FCC XML geometry | 🟢 Rebuilt + tested | `optimizer/export/xml.py` fully rewritten around the real `FccRoot`/`Patterns`/`Pattern`/`Workpieces`/`Workpiece`(+`EdgeGroup`/`Lineament`/`Lineament2`/`FccOutline`/`BenchmarkInfo`)/`OddmentsList` structure (spec §6b + Appendix A). Byte-exact on the empty-job case (Appendix A.8). `MachiningPoint` now uses the exact rule M6 discovered (see below) — **0 mismatches across all 4 non-empty golden files (1039 workpieces)**, not the ~83%/17% Appendix A.3 describes. |
| M6 | FCC XML toolpaths | 🟢 Implemented + tested | `CutInfos.ToolPointList`/`ToolPoint` implemented per Appendix A.5's lead-in-ramp formula, plus two rules the appendix doesn't document, both found by testing against real files: **(1)** when an edge is shorter than `SlopeLen` (70mm), both of that edge's candidate points clamp to the edge midpoint instead of the raw corner-offset formula; **(2)** the `Lineament`/`Lineament2`/`FccOutline` polygon winding — and the `ToolPointList` idx→corner assignment — starts one corner later exactly when `CutWidth > CutLength` **and** the part isn't grain-locked (grain-locked parts never shift, confirmed against 207 grain-directional workpieces, all unrotated). This same signal turned out to fully explain `MachiningPoint`'s "~83%/17%" split from Appendix A.3 (now exact, see M5). `ToolPointList` itself lands at 88.1–96.4% exact match across the 4 golden files — the remaining mismatches look like isolated real-world manual adjustments (e.g. a single corner off by 6.8mm on one otherwise-perfect 55/56-attribute workpiece) rather than a missed rule; Appendix A.5 itself expects this needs machine dry-run refinement, so it's tracked as a documented tolerance (`backend/tests/test_xml_roundtrip.py`'s `MIN_TOOL_POINT_LIST_MATCH_RATE`), not chased to 100%. `ToolPoint` (which of the 4 lead-in points the cut starts at) has no discovered rule — defaults to `"0"` per Appendix A.5's own stated fallback. Point-winding and `MachiningPoint` comparisons in the round-trip test were tightened from tolerant to strict now that the real rules are known, and confirmed to have teeth (broke the shift logic, reran, 4/4 golden-file tests failed on the exact-match `MachiningPoint` assertion; restored, all green). |
| M7 | Frontend integration | 🟢 Built + browser-verified | New `frontend/` (Vite + React + TypeScript), sibling to `backend/`. Wizard flow: CSV drag-drop → column-mapping (client-side schema guess in `csvSchemas.ts` for immediate feedback; actual parsing delegated to the already-tested `/api/parse`, not reimplemented in TS) → machine selector + params panel (margins, stock boards derived from parts, kerf/saw or tool Ø+spacing/nanxing) → per-sheet SVG preview (`SheetPreview.tsx`) + summary (`Summary.tsx`, with a client-computed unplaced-reason since the backend doesn't attach one) → PDF/XML download via the existing `/api/export/*` endpoints. Dev wiring is a Vite `server.proxy` (`/api` → `127.0.0.1:8000`), zero backend changes. `tsc -b`/`npm run build`/`npm run lint` all clean. **Actually driven in a headless browser** (Playwright, no project `run` skill existed yet so used the generic browser-driven fallback): uploaded both real sample CSVs — correct schema auto-detection for both, part counts matched exactly (50, 55); ran optimize for both Panel Saw and Nanxing — 21 sheets / 0 unplaced / 46.8% avg utilization each, matching Phase A's known-good numbers exactly; 21 SVG sheet previews rendered with 50 total placed-part rects (matches part count); downloaded a real 21-page PDF and a real `FccRoot` XML; a deliberately malformed CSV correctly surfaced the backend's exact validation error in the UI instead of crashing. Zero console/page/network errors throughout. **Scope decision:** the per-sheet preview does *not* share a renderer with the PDF (spec §8's aspiration) — that would mean redesigning M3's still-skeletal `reportlab` renderer, a separate concern; downloads call the existing `/export/pdf`/`/export/xml` endpoints as-is. |
| M8 | Offcut/oddment reuse | ⬜ Not started | `Sheet.offcuts` are computed as leftover free rectangles per run but never persisted or fed back as input stock for a later job. |

**Cross-cutting:** `backend/tests/` now has `conftest.py`, `helpers.py`, `fcc_golden.py` (golden
XML → exporter-input importer, test-only), `test_parser.py`, `test_guillotine.py`,
`test_nanxing.py`, `test_xml_roundtrip.py` (now parametrized across all 4 non-empty golden
files, not just one) — **51 tests**, all green from a clean `pip install -e ".[dev]"`. Not yet
covered: any test touching `api.py`/`export/pdf.py` directly. `frontend/` has no automated
tests yet (type-check + build + one manual browser run only) — no test framework wired up.

**M6's output has never touched a real machine.** Byte-level structure and the discovered rules
are verified against historical golden files, but per spec §7.3/Appendix A.5 a small,
reproducible dry-run cut is still required before trusting this on real material — especially
since `ToolPoint`'s rule and `MachiningPoint=7`'s actual on-machine behavior are unconfirmed.
M3 (PDF polish) and M8 (offcut reuse) are the remaining open backend items.

---

## Current state

<!-- Update after each work block. This is what a fresh session needs most. -->

- **Last worked:** 2026-08-12 — Phases A/B/C of `~/.claude/plans/delegated-moseying-robin.md`
  complete, plus follow-on M6 and M7 passes (same plan file, rewritten fresh for each pass).
- **Backend entry point:** `backend/api.py` (FastAPI app object `app`), run via `backend/start-backend.sh`
  → `uvicorn api:app --reload --host 127.0.0.1 --port 8000`. `backend/.venv` has the `dev`
  extra installed (`pip install -e ".[dev]"`) — `pytest -q` from `backend/` runs 51 tests, all green.
- **Frontend entry point:** `frontend/` (Vite + React + TypeScript), `npm run dev` serves on
  `http://localhost:5173` with `/api/*` proxied to the backend on `:8000` (`vite.config.ts`) —
  run both dev servers side by side, no backend changes needed for local dev. `npm run build`
  and `npm run lint` are clean; no test framework wired up yet (type-check + build + one
  Playwright-driven manual browser pass is the only verification so far).
- **What's done & passing:** M1 parser works for both CSV schemas on real sample data (0 parse
  errors on 55 + 50 rows), quoted-space edges now normalize correctly. M2 and M4 both place
  every part from a real job (0 unplaced, was 62%/70%) with zero overlaps (M2's overlap bug is
  fixed via a real guillotine binary split in `guillotine.py`'s `guillotine_split`). M5's
  `optimizer/export/xml.py` is a full rewrite against the real `FccRoot` schema. M6 added
  `ToolPointList`/`ToolPoint` and, along the way, found the *exact* rule behind `MachiningPoint`
  and the undocumented `Lineament.RotationAngle` secondary axis that Phase C had only worked
  around — both are now implemented for real, not tolerated as noise. The golden-file round-trip
  test (`backend/tests/test_xml_roundtrip.py` + `tests/fcc_golden.py`) now runs against all 4
  non-empty golden files via parametrization (was previously wired to only the primary one).
  All of this is covered by `backend/tests/` instead of one-off scripts — verified both the
  guillotine suite (Phase A) and the tightened round-trip assertions (M6) catch real regressions
  by temporarily breaking the fix, rerunning, and confirming failures, then restoring. All four
  endpoints (`/parse`, `/optimize`, `/export/pdf`, `/export/xml`) still respond 200 with
  non-empty bodies on real data end-to-end (smoke-tested manually, not yet part of the suite).
- **What's done & passing (M7):** the full CSV → map → configure → preview → download wizard,
  built fresh this pass — see the M7 milestone row for the exact Playwright-driven verification
  (both real sample CSVs, both machine targets, real PDF/XML downloads, a deliberately bad CSV
  correctly surfacing the backend's error instead of crashing, zero console/page/network errors).
- **What's in progress / half-done:** `backend/optimizer/export/pdf.py` (M3) still doesn't render
  cut L×W labels, the footer summary line, or the cut sequence — out of scope for every fix pass
  so far, not yet scheduled; M7's preview intentionally doesn't share a renderer with it (see M7
  row). `ToolPointList`'s exact-match rate (88.1–96.4% across the 4 golden files) has residual,
  likely-irreducible noise — Appendix A.5 itself expects this needs machine dry-run refinement,
  so it's tracked as a documented tolerance rather than chased further. `ToolPoint` (which of the
  4 lead-in points a cut starts at) has no discovered rule; defaults to `"0"` per Appendix A.5's
  own stated fallback. `frontend/` has no automated test suite (Vitest/RTL or similar never set
  up) — only type-check, build, lint, and one manual browser-driven pass exist as verification.
- **Immediate next step:** M6's output has never touched a real machine — before relying on it,
  a small reproducible dry-run cut is needed (spec §7.3/Appendix A.5), which isn't something a
  coding session can do unattended. Barring that, remaining work is M3 (PDF polish — cut labels,
  footer, cut-sequence overlay; the `cuts` data already exists from M2) and M8 (offcut reuse).
  Worth considering: a `frontend/` test suite, since none exists yet.
- **Open questions / blockers:** none new beyond what's already in `instructions.md` §10 (still
  needs owner confirmation on kerf value, ZIP/JPEG vs plain PDF acceptance, etc). `ToolPoint`'s
  rule is unresolved (see above) — needs either more/different golden data or real machine
  feedback, neither of which this project currently has.

---

## Validation strategy (do this — prevents scrapped material)

1. **Golden-file round-trip:** parse a real machine-cut XML into the normalized model,
   re-serialize, **diff** against the original, drive to near-zero (float noise only).
   This proves the serializer before any new nest.
2. **Geometry invariants (assert in tests):** no overlaps; all parts within margin-inset
   board; `Σ part area + Σ oddment area + kerf/spacing ≈ board area`; polygons closed;
   utilization ∈ (0,100].
3. **Saw guillotine check:** assert every saw layout is recursively guillotine-decomposable;
   fail loudly if not.
4. **Machine dry-run:** first real export = a small reproducible job, cut & confirmed before scaling.

### FCC serialization fidelity (M5/M6)
UTF-8 · `\r\n` line endings · 2-space indent · self-closing empty elements · numbers
formatted like the reference. A valid empty job is a self-closed root `<FccRoot …/>`.

---

## Remaining work — likely priority order

1. **Machine dry-run M6's output** before trusting it on real material (spec §7.3/Appendix
   A.5) — a small, reproducible job, cut and inspected. `ToolPointList`/`MachiningPoint` are
   now implemented against exact rules discovered from golden-file analysis, but neither has
   been confirmed against an actual cut; `ToolPoint`'s rule is still unknown (defaults to `0`).
   Not something a coding session can do unattended — needs the owner and the physical machine.
2. **M3 PDF polish:** cut L×W labels, footer summary line, cut-sequence overlay (spec §6a) —
   the `cuts` data already exists from M2, just isn't wired into `export/pdf.py` yet. Also the
   natural point to revisit M7's "reuse the same renderer for the PDF" aspiration, deferred
   when M7 was built (see M7's milestone row).
3. **Frontend test suite:** `frontend/` has none yet — M7 was verified via type-check, build,
   lint, and one manual Playwright-driven browser pass, not an automated suite (Vitest/RTL or
   similar).
4. **M8 offcut reuse:** larger oddments become returnable stock (see Appendix A.6).

---

## Keeping this file honest (run at the start/end of a session)

```bash
git log --oneline -20
git status
git stash list
# what source exists:
find . -type f \( -name '*.py' -o -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/__pycache__/*' | sort
# do backend tests pass?
pytest -q 2>/dev/null || true
```

## Avoiding another lost session
- This `CLAUDE.md` is durable memory — a closed/crashed window resumes from it, not from a transcript.
- Claude Code only persists a session to disk once it writes; a window that lived only in the
  extension's memory (opened, never messaged, then closed on restart) can vanish. Send at least
  one message early, and prefer resuming via `claude --resume <id>` in the project dir.