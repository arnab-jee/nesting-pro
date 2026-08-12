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
> `~/.claude/plans/delegated-moseying-robin.md`; **Phases A, B, and C are all done** —
> M2/M4 correctness, test infra, and the M5 XML schema rebuild. M6 (toolpaths) is next.

| # | Milestone | Status | Evidence |
|---|-----------|--------|----------|
| M1 | Parser + normalized model | 🟢 Fixed + tested | Parses both real CSVs cleanly (55 + 50 parts, 0 errors). Quoted-space edge codes (`""" """` → `'" "'`) now normalize to `""` (`normalize_edge_value` in `parser.py`). Job grouping now splits by `(material, thickness, grain)` as independent nesting jobs (both optimizers). Covered by `backend/tests/test_parser.py` (10 tests). |
| M2 | Guillotine optimizer (saw) | 🟢 Fixed + tested | Rewrote placement in `guillotine.py` around a true binary guillotine split (`guillotine_split`) instead of the old 4-way maxrects-style split — free rectangles can no longer overlap by construction. Multi-sheet loop opens new sheets of a board type until every part is placed or genuinely too large for an empty board. Covered by `backend/tests/test_guillotine.py` (7 invariant tests × 2 real sample files, incl. an automated guillotine-decomposability check per spec §7.4). **Verified the suite has teeth**: temporarily restored the original buggy `guillotine.py` and reran — 8/14 tests failed (overlaps, dropped parts, non-decomposable layouts), confirming these tests would have caught the original bug. Cut list now flows through to `/optimize`'s response. |
| M3 | PDF layout export (saw) | 🟡 Skeletal | Unchanged this pass. Runs and returns real PDF bytes via `/export/pdf`. Missing most of spec §6a: no cut L×W label per part (only barcode), no footer summary line (`Stock# · Dim · Qty · Material · Thk · Utl%`), no cut-sequence list/overlay (the `cuts` data is still not wired into the PDF renderer, only into the `/optimize` JSON). Never visually inspected. No tests. |
| M4 | Free-nest optimizer (router) | 🟢 Fixed + tested | Same multi-sheet loop and grain-grouping fix as M2. Covered by `backend/tests/test_nanxing.py` (5 invariant tests × 2 real sample files: no overlaps, in-bounds, every part placed, utilization in range). Algorithm itself is still a naive left-to-right row/shelf packer, not maxrects/skyline/BLF — valid but likely below achievable utilization; not part of this fix pass. |
| M5 | FCC XML geometry | 🟢 Rebuilt + tested | `optimizer/export/xml.py` fully rewritten around the real `FccRoot`/`Patterns`/`Pattern`/`Workpieces`/`Workpiece`(+`EdgeGroup`/`Lineament`/`Lineament2`/`FccOutline`/`BenchmarkInfo`)/`OddmentsList` structure (spec §6b + Appendix A). Byte-exact on the empty-job case (Appendix A.8). Golden-file round-trip test (`backend/tests/test_xml_roundtrip.py`) parses a real machine-cut file straight into exporter inputs (bypassing the optimizer — this tests the *serializer*, not the nesting algorithm) and diffs structurally against the regenerated output; **0 structural failures across all 4 non-empty golden files** (55, 168, 168, 648 workpieces). `SamllWorkpieceFlg` match rate 97–99%, matching Appendix A's own documented "~97%, long thin strips are exceptions" tolerance exactly — not chased to 100%. `CutInfos.ToolPoint`/`ToolPointList` intentionally not emitted (that's M6). Three things Appendix A got wrong or didn't document, found and fixed by testing against real files instead of just the appendix text: **(1)** `Lineament` spans `CutLength+6 × CutWidth+6`, not the raw cut size — it's the router's tool-path envelope (cut rect inflated by `ProOffsetX/Y=3` per side), not the cut rectangle itself; **(2)** `Workpiece.Grain` is not always `"N"` — grain-locked parts (confirmed via a golden file with 207/648 grain-directional workpieces) get `"L"`; **(3)** an undocumented secondary rotation axis (`Lineament.RotationAngle`, independent of `Workpiece.RotateAngle`) shifts the `Points`/`FccOutline` winding start-corner and `EdgeGroup` face order on ~38% of workpieces — reproduced as the same rectangle/face-set either way (verified `Edge` sub-elements carry no distinguishing data regardless of order) rather than fully reverse-engineered, since chasing it further needs machine dry-run data this project doesn't have yet. |
| M6 | FCC XML toolpaths | ⬜ Not started | Blocked on M5 being rebuilt to the correct schema first — no longer blocked as of this pass. `ToolPointList`/`ToolPoint`/`MachiningPoint`'s rotated-datum-corner nuance, and the newly-found `Lineament.RotationAngle` secondary-axis question, are the concrete open items per Appendix A.5. |
| M7 | Frontend integration | ⬜ Not started | No frontend directory exists anywhere in the repo. |
| M8 | Offcut/oddment reuse | ⬜ Not started | `Sheet.offcuts` are computed as leftover free rectangles per run but never persisted or fed back as input stock for a later job. |

**Cross-cutting:** `backend/tests/` now has `conftest.py`, `helpers.py`, `fcc_golden.py` (golden
XML → exporter-input importer, test-only), `test_parser.py`, `test_guillotine.py`,
`test_nanxing.py`, `test_xml_roundtrip.py` — **39 tests**, all green from a clean
`pip install -e ".[dev]"`. Not yet covered: any test touching `api.py`/`export/pdf.py` directly.

**Do NOT start M7 (frontend) yet** — still nothing to integrate against. M6 (toolpaths) is now
unblocked and is the natural next step, but per spec §7.1/A.5 still needs a machine dry-run
before the generated XML (once M6 lands) should be trusted for a real cut.

---

## Current state

<!-- Update after each work block. This is what a fresh session needs most. -->

- **Last worked:** 2026-08-12 — all three phases of `~/.claude/plans/delegated-moseying-robin.md`
  complete (M2/M4 correctness fixes, a real pytest suite, and the M5 XML schema rebuild).
- **Backend entry point:** `backend/api.py` (FastAPI app object `app`), run via `backend/start-backend.sh`
  → `uvicorn api:app --reload --host 127.0.0.1 --port 8000`. `backend/.venv` has the `dev`
  extra installed (`pip install -e ".[dev]"`) — `pytest -q` from `backend/` runs 39 tests, all green.
- **What's done & passing:** M1 parser works for both CSV schemas on real sample data (0 parse
  errors on 55 + 50 rows), quoted-space edges now normalize correctly. M2 and M4 both place
  every part from a real job (0 unplaced, was 62%/70%) with zero overlaps (M2's overlap bug is
  fixed via a real guillotine binary split in `guillotine.py`'s `guillotine_split`). M5's
  `optimizer/export/xml.py` is a full rewrite against the real `FccRoot` schema, verified via a
  golden-file round-trip test (`backend/tests/test_xml_roundtrip.py` + `tests/fcc_golden.py`)
  against all 4 non-empty golden files in `sample_data/`, not just the one it was built against.
  All of this is covered by `backend/tests/` instead of one-off scripts — verified the guillotine
  suite catches the original bug by temporarily swapping the buggy version back in (8/14 failed).
  All four endpoints (`/parse`, `/optimize`, `/export/pdf`, `/export/xml`) still respond 200 with
  non-empty bodies on real data end-to-end (smoke-tested manually, not yet part of the suite).
- **What's in progress / half-done:** `backend/optimizer/export/pdf.py` (M3) still doesn't render
  cut L×W labels, the footer summary line, or the cut sequence — out of scope for the fix plan,
  not yet scheduled. M5's `CutInfos.ToolPoint`/`ToolPointList` are deliberately not emitted
  (that's M6). An undocumented secondary rotation axis found while building the round-trip test
  (`Lineament.RotationAngle`, independent of `Workpiece.RotateAngle`, affects ~38% of workpieces'
  point-winding start and `EdgeGroup` face order) was worked around rather than fully reverse
  engineered — see the M5 row above for what was and wasn't chased down.
- **Immediate next step:** M6 (FCC XML toolpaths) is next and no longer blocked. Implement
  `CutInfos.ToolPointList`/`ToolPoint` per Appendix A.5's lead-in ramp formula, byte-diff against
  golden files for both rotated and unrotated parts, and figure out whether the `Lineament.RotationAngle`
  secondary axis needs to be solved first (it may interact with which `ToolPointList` idx→corner
  mapping applies). A machine dry-run is still required before trusting the result on real material.
- **Open questions / blockers:** none new beyond what's already in `instructions.md` §10 (still
  needs owner confirmation on kerf value, ZIP/JPEG vs plain PDF acceptance, etc). M6's
  idx→corner `ToolPointList` mapping for rotated parts is still unimplemented, not just unverified,
  and now has one more open variable (`Lineament.RotationAngle`) than Appendix A anticipated.

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

1. **M7 frontend** (your JS/React wheelhouse):
   - CSV drag-drop → column-mapping screen (auto-detect both schemas in §4, manual override).
   - Machine selector: Panel Saw | Nanxing (drives optimizer + exporter).
   - Params panel: kerf, tool Ø, spacing, margins, stock boards, rotation/grain lock.
   - Per-sheet interactive SVG/Canvas preview — **reuse the same renderer for the PDF**.
   - Summary: sheet count, total utilization, unplaced parts (with reasons).
   - Download: XML (Nanxing) / PDF (saw); filename from project + timestamp.
2. **Harden M6** if not machine-verified: byte-diff `ToolPointList` for rotated AND unrotated
   parts against golden files until clean (idx→corner mapping shifts with `RotateAngle`).
3. **M8 offcut reuse:** larger oddments become returnable stock (see Appendix A.6).

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