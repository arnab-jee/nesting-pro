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
> follow-on M6, M7, M3-redesign, and M9 passes (each planned separately, same plan file,
> overwritten per pass). Remaining work is M8 and the deferred parts of M9 (login/tenancy,
> per-machine config, schema-template renaming).

| # | Milestone | Status | Evidence |
|---|-----------|--------|----------|
| M1 | Parser + normalized model | 🟢 Fixed + tested | Parses both real CSVs cleanly (55 + 50 parts, 0 errors). Quoted-space edge codes (`""" """` → `'" "'`) now normalize to `""` (`normalize_edge_value` in `parser.py`). Job grouping now splits by `(material, thickness, grain)` as independent nesting jobs (both optimizers). `GRAIN_MAP` in `parser.py` now maps raw CSV codes `1`/`2` to `"length"`/`"width"` (`Business Logic/grain_logic.md`'s spec: 0=free, 1=part's length parallel to grain, 2=length perpendicular to grain i.e. width parallel to grain) — previously `1`/`2` fell through the `.get()` default to `"none"`, silently treating grain-locked parts as rotatable in both the packer (`can_rotate()`) and the exported FCC `Grain` attribute. No real sample CSV has ever contained `1`/`2` (only `0` observed), so this had never surfaced in the test suite until now. Covered by `backend/tests/test_parser.py` (12 tests, +2 this pass). |
| M2 | Guillotine optimizer (saw) | 🟢 Fixed + tested | Rewrote placement around a true binary guillotine split (`guillotine_split`) instead of the old 4-way maxrects-style split — free rectangles can no longer overlap by construction. Multi-sheet loop opens new sheets of a board type until every part is placed or genuinely too large for an empty board. Covered by `backend/tests/test_guillotine.py` (7 invariant tests × 2 real sample files, incl. an automated guillotine-decomposability check per spec §7.4). **Verified the suite has teeth**: temporarily restored the original buggy version and reran — 8/14 tests failed (overlaps, dropped parts, non-decomposable layouts), confirming these tests would have caught the original bug. Cut list now flows through to `/optimize`'s response. **`Updates/update_003.md` (2026-08-13): un-shared the placement engine.** It briefly lived in one shared `optimizer/packing.py` (extracted so M4 could reuse it, see that row's old text) — update_003 asked to "maintain separate packers" for the two machines, reinstating this file's own "two machines = two different optimizers" principle at the code level, not just the exporter level. `guillotine.py` now imports its own copy from `optimizer/saw_packing.py`; `nanxing.py` imports an independent copy from `optimizer/nanxing_packing.py` (see M4 row) — deliberately duplicated, not shared, so a future change to one can't silently affect the other. Both copies also gained a free-rectangle merge step (`merge_free_rects`, folds adjacent free rectangles back into one after every placement) and a `waste_strategy` param (`"balanced"` default reproduces prior behavior exactly; `"edge"` — see M4 row for what it does and its measured effect). |
| M3 | PDF layout export (saw) | 🟢 Redesigned + tested | `optimizer/export/pdf.py` went through two full redesigns this project. **Rev 1** (`Updates/update_002.md` → moved to `Business Logic/grain_logic.md`, unrelated to grain — see below) matched `sample_data/NirvanaTec Plus2D Optimization Drawing PDFs/`: landscape board (transposed render axes), colored panels, 2-per-page. **Rev 2, current** (a *second, different* `Updates/update_002.md` — the filename was reused for an unrelated spec; see the "reused filenames" note above) replaces Rev 1 entirely, following `sample_data/Max Cut Optimization Drawings/max_cut.pdf` instead: a left sidebar (material + sheet size, a per-sheet "Cutting List" grouped by `(name, nominal L, nominal W)` with running Symbol numbers via `_cutting_list()`, an "Occurrences ×N" box, a "Grain Direction" arrow box) beside a main area (a "Job Layout" header, a Client/Job/Sheet/Job stats grid, the board diagram). Board draws **portrait** this time (`board.length` vertical) — the *opposite* of Rev 1's landscape, and matching the packer's native axes directly, so no render-axis transform is needed (removed `_render_sheet_area`/`_render_offcut_area` along with it). Per the update's explicit instructions: (1) **occurrence deduplication** — `_deduplicate_layouts()` collapses physically-identical sheets (same board + same placed-part positions) into one printed page with an `×N` badge instead of N near-duplicate pages (real-data result: the 21-sheet saw sample collapses to **9** printed pages, one page alone absorbing 9 duplicate sheets); "Job Sheets"/"Job Panels"/etc. still count the *physical*, un-deduplicated sheet list. (2) **date format** `DD-MMM-YYYY hh:mm:ss` in the footer via `datetime.now().strftime(...)`. (3) **grain-direction arrow**: empty box for `grain="none"` (per the update's literal instruction — the reference itself shows an ambiguous always-on 4-way icon that didn't reliably indicate this, see below); a single vertical double-headed arrow for `grain="length"`, horizontal for `"width"` — **this mapping was NOT derivable from the reference alone** (same material showed different icons across different sheets in the reference, ruling out a simple per-material constant, and MaxCut's own internal packing-axis convention doesn't visibly match ours) and was confirmed directly with the project owner via `AskUserQuestion` rather than guessed, given the real risk (wrong grain direction → scrapped material). (4) **kept colored panels** (palette cycling by placement order, same approach as Rev 1) — the one explicit departure from the reference, which is plain black-and-white. (5) **reverted to 1 layout per page** (Rev 1's 2-per-page doesn't fit this denser layout, per the update). Client Name/Job Reference/Phone/Fax/Cell No/Date Required are left blank (labels only) — no such data exists in this app, and the reference's own sample pages leave them blank too, so this isn't a fabrication gap. "Sheet/Job Cut Length" reuse `OptResult.cuts` (already computed by M2's guillotine cut-list builder); "Job Wastage" is an area-weighted average of each sheet's own utilization (no per-sheet margin data is stored on `Sheet` to compute it more precisely — documented approximation, not a fabrication). Covered by `backend/tests/test_pdf.py` (10 tests, fully rewritten for Rev 2: dedup-page-count, page-text sanity, empty-result, dedup grouping + signature equality, cutting-list grouping/symbol assignment incl. the nominal-vs-rotated-footprint distinction, the confirmed grain-direction mapping, palette-cycling, and a sidebar/footer-overlap geometry regression — see next). **Found and fixed one real bug via visual inspection** (not caught by any test until added after the fact): the Occurrences/Grain Direction sidebar boxes extended down to the page's true bottom margin instead of stopping above the footer strip, so they visually overlapped the footer text — full pages were rendered and eyeballed, not just computed from geometry math, which is what caught it. Fixed via a `_sidebar_bottom_boxes()` helper now covered by a dedicated regression test; verified that test fails against the pre-fix geometry and passes after restoring the fix. Still open from spec §6a: no cut-sequence list/overlay (neither reference PDF shows one). |
| M4 | Free-nest optimizer (router) | 🟢 Fixed + tested | Same multi-sheet loop and grain-grouping fix as M2. **The naive shelf packer flagged in earlier passes is gone**: prompted by `update_001` comparing our output against the real Nanxing machine's own software on the same job (identical board/margin/spacing — a real efficiency benchmark), found the shelf packer's root cause (once a row wraps, its leftover space is never reconsidered by later, smaller parts) and replaced it with the same class of free-rectangle best-fit engine `guillotine.py` uses (now `optimizer/nanxing_packing.py`, its own independent copy — see M2 row). Real-data result at the time: the sheet holding the most parts in `nesting_machine_data.csv` went from 21 parts at 21.4% utilization to 29 parts at 73.8% — still below the real machine's 78–92%. Covered by `backend/tests/test_nanxing.py` (7 tests incl. a new dominant-sheet-utilization regression guard) + `test_guillotine.py`. Verified the new test has teeth the same way as always: reverted to the old shelf packer, confirmed it fails (21.4% < 55% threshold), restored. **`Updates/update_003.md` (2026-08-13): `waste_strategy` option closes most of that remaining gap.** Prompted by a real screenshot (`Updates/image.png`) of this app's own Nanxing PDF output showing thin wastage slivers scattered between placed drawer parts instead of consolidated at one edge — added a selectable `waste_strategy`: `"balanced"` (default, prior behavior) vs `"edge"` (forces the guillotine split to always cut along the same fixed axis instead of picking whichever leaves the shorter leftover strip, so leftover space keeps accumulating into fewer, larger regions instead of a new sliver on every placement — see `optimizer/saw_packing.py`'s `guillotine_split` docstring for the full reasoning). Verified on the real `nesting_machine_data.csv` job: the busiest sheet went from 28 parts/73.56% utilization (`"balanced"`, re-measured after the M2 merge-step addition — was 29/73.8% before it, an incidental ~0.2pp shift from a scoring tie now resolving differently, not a regression) to **33 parts/78.41%** under `"edge"` — now inside the real machine's 78–92% range instead of below it. Job-wide, the largest single offcut's share of total offcut area rose from ~65% to ~73% (a direct, measured consolidation metric, not just an aggregate utilization number). Re-rendered and visually compared both strategies' PDF page for the same sheet to confirm the *pattern* actually changed, not just the numbers — "balanced" still shows several similar-sized gaps between strips; "edge" shows one larger consolidated gap. Covered by new `backend/tests/test_packing_engines.py` (12 tests: packer-module independence, `merge_free_rects` correctness, `"edge"`'s fixed-axis behavior, guillotine-decomposability preserved under `"edge"` for both machines, and the largest-offcut-fraction consolidation regression guard) — verified that last test and the axis-forcing test both have teeth by temporarily reverting the fix and confirming failure, then restoring. Exposed as a "Waste placement" dropdown in `frontend/src/components/ParamsPanel.tsx` (`tsc -b`/lint/build all clean) for both machine targets, not just Nanxing, since both packers now support it identically. |
| M5 | FCC XML geometry | 🟢 Rebuilt + tested | `optimizer/export/xml.py` fully rewritten around the real `FccRoot`/`Patterns`/`Pattern`/`Workpieces`/`Workpiece`(+`EdgeGroup`/`Lineament`/`Lineament2`/`FccOutline`/`BenchmarkInfo`)/`OddmentsList` structure (spec §6b + Appendix A). Byte-exact on the empty-job case (Appendix A.8). `MachiningPoint` now uses the exact rule M6 discovered (see below) — **0 mismatches across all 4 non-empty golden files (1039 workpieces)**, not the ~83%/17% Appendix A.3 describes. |
| M6 | FCC XML toolpaths | 🟢 Implemented + tested | `CutInfos.ToolPointList`/`ToolPoint` implemented per Appendix A.5's lead-in-ramp formula, plus two rules the appendix doesn't document, both found by testing against real files: **(1)** when an edge is shorter than `SlopeLen` (70mm), both of that edge's candidate points clamp to the edge midpoint instead of the raw corner-offset formula; **(2)** the `Lineament`/`Lineament2`/`FccOutline` polygon winding — and the `ToolPointList` idx→corner assignment — starts one corner later exactly when `CutWidth > CutLength` **and** the part isn't grain-locked (grain-locked parts never shift, confirmed against 207 grain-directional workpieces, all unrotated). This same signal turned out to fully explain `MachiningPoint`'s "~83%/17%" split from Appendix A.3 (now exact, see M5). `ToolPointList` itself lands at 88.1–96.4% exact match across the 4 golden files — the remaining mismatches look like isolated real-world manual adjustments (e.g. a single corner off by 6.8mm on one otherwise-perfect 55/56-attribute workpiece) rather than a missed rule; Appendix A.5 itself expects this needs machine dry-run refinement, so it's tracked as a documented tolerance (`backend/tests/test_xml_roundtrip.py`'s `MIN_TOOL_POINT_LIST_MATCH_RATE`), not chased to 100%. `ToolPoint` (which of the 4 lead-in points the cut starts at) has no discovered rule — defaults to `"0"` per Appendix A.5's own stated fallback. Point-winding and `MachiningPoint` comparisons in the round-trip test were tightened from tolerant to strict now that the real rules are known, and confirmed to have teeth (broke the shift logic, reran, 4/4 golden-file tests failed on the exact-match `MachiningPoint` assertion; restored, all green). |
| M7 | Frontend integration | 🟢 Built + browser-verified | New `frontend/` (Vite + React + TypeScript), sibling to `backend/`. Wizard flow: CSV drag-drop → column-mapping (client-side schema guess in `csvSchemas.ts` for immediate feedback; actual parsing delegated to the already-tested `/api/parse`, not reimplemented in TS) → machine selector + params panel (margins, stock boards derived from parts, kerf/saw or tool Ø+spacing/nanxing) → per-sheet SVG preview (`SheetPreview.tsx`) + summary (`Summary.tsx`, with a client-computed unplaced-reason since the backend doesn't attach one) → PDF/XML download via the existing `/api/export/*` endpoints. Dev wiring is a Vite `server.proxy` (`/api` → `127.0.0.1:8000`), zero backend changes. `tsc -b`/`npm run build`/`npm run lint` all clean. **Actually driven in a headless browser** (Playwright, no project `run` skill existed yet so used the generic browser-driven fallback): uploaded both real sample CSVs — correct schema auto-detection for both, part counts matched exactly (50, 55); ran optimize for both Panel Saw and Nanxing — 21 sheets / 0 unplaced / 46.8% avg utilization each, matching Phase A's known-good numbers exactly; 21 SVG sheet previews rendered with 50 total placed-part rects (matches part count); downloaded a real 21-page PDF and a real `FccRoot` XML; a deliberately malformed CSV correctly surfaced the backend's exact validation error in the UI instead of crashing. Zero console/page/network errors throughout. **Scope decision:** the per-sheet preview does *not* share a renderer with the PDF (spec §8's aspiration) — that would mean redesigning M3's still-skeletal `reportlab` renderer, a separate concern; downloads call the existing `/export/pdf`/`/export/xml` endpoints as-is. **Visual polish pass** (presentation-only, no logic changes): real design tokens + dark-mode support in `index.css`, a `Stepper.tsx` progress indicator, card-based layout, stat cards, selectable machine-option cards, and a responsive sheet-preview grid. Found and fixed one real bug while at it — the Vite scaffold's leftover `#root { text-align: center }` was inheriting into every form label/paragraph in the app. Reverified in a headless browser (screenshots at each wizard step) with the same real CSV — same known-good numbers (21 sheets, 0 unplaced), zero console errors, confirmed `text-align: left` via computed style. |
| M8 | Offcut/oddment reuse | ⬜ Not started | `Sheet.offcuts` are computed as leftover free rectangles per run but never persisted or fed back as input stock for a later job. |
| M9 | Data persistence, phase 1 (stock boards + settings) | 🟢 Implemented + tested | `Updates/update_004.md` originally asked for a much bigger scope in one pass — login, multi-tenant "company system," stock boards, per-machine optimization availability, waste-placement defaults, and renaming/editing the CSV schema templates — but explicitly asked to "discuss and ask relevant questions before start updating the code" first. Scoped down via two `AskUserQuestion` rounds before writing anything: **SQLite** (not Postgres/MySQL — single-tenant local deployment, no need for a DB server), **single-tenant** (no `tenant`/company isolation), **simple internal login deferred entirely** (this pass has no auth at all), **persistence-first sequencing** (only Stock Boards + a Waste Placement default land now; login/tenancy, per-machine availability config, and schema-template renaming are explicitly future passes, not started). New `backend/storage.py`: stdlib `sqlite3` (no ORM — two small tables don't justify one), a `stock_boards` table and a generic `key/value` `settings` table (chosen over a rigid single-column settings table so future single-value defaults don't need a schema migration each time). New endpoints: `GET/POST /stock-boards`, `PUT/DELETE /stock-boards/{id}`, `GET/PUT /settings`, using a per-request `sqlite3.Connection` via FastAPI `Depends` (safe under SQLite's threading model; the DB file itself is gitignored, not committed). Frontend: new `StockBoardLibrary.tsx` (list/add/delete saved boards, "Use" appends one to the current job's stock list) rendered in the configure step, and `wasteStrategy` now loads its initial value from `GET /settings` on mount and round-trips every change back via `PUT /settings` (a "sticky default," not a separate save button). Covered by `backend/tests/test_storage.py` (11 tests, direct CRUD unit tests against an in-memory DB) and `backend/tests/test_api_persistence.py` (8 tests, real FastAPI `TestClient` HTTP-level tests against a temp-file DB — `:memory:` doesn't work here since `get_db` opens a fresh connection per request and in-memory SQLite doesn't survive across separate connections) — this also closes a sliver of the long-standing "no test touches `api.py` directly" gap, scoped just to the new endpoints. Verified the validation-error path has teeth: temporarily disabled the waste-strategy value check in `storage.py`, reran, both the unit test and the HTTP test failed as expected, restored. **Also verified end-to-end in a real headless browser** (Playwright via a scratch script, no project `run` skill existed yet): fresh SQLite DB → confirmed `GET /settings` defaults to `"balanced"` → uploaded a real sample CSV → added a stock board through the library form → confirmed it appeared in the library table → clicked "Use" and confirmed it appeared in the job's own Stock boards table → changed the waste-placement dropdown and confirmed the change round-tripped to the server (`GET /settings` reflected it, not just React state) → deleted the library entry and confirmed it disappeared. Zero console/page errors throughout. `tsc -b`/lint/build all clean. Deferred to a later pass: login/auth, tenant/company modeling, per-machine "available optimizations" config, and the CSV-schema-template rename (Nanxing Nesting → "Template 1", Panel Saw → "Template 2" — mapping confirmed with the project owner, not yet implemented). |

**Cross-cutting:** `backend/tests/` now has `conftest.py`, `helpers.py`, `fcc_golden.py` (golden
XML → exporter-input importer, test-only), `test_parser.py`, `test_guillotine.py`,
`test_nanxing.py`, `test_xml_roundtrip.py` (now parametrized across all 4 non-empty golden
files, not just one), `test_pdf.py`, `test_packing_engines.py`, `test_storage.py`,
`test_api_persistence.py` — **95 tests**, all green from a clean `pip install -e ".[dev]"`.
`test_api_persistence.py` is the first test file to exercise `api.py` directly over real HTTP
(via FastAPI's `TestClient`, new `httpx` dev dep) — scoped just to the new `/stock-boards` and
`/settings` endpoints; `/parse`, `/optimize`, `/export/pdf`, `/export/xml` still aren't covered
as HTTP endpoints, only their underlying `optimizer/` functions are. `frontend/` has no
automated tests yet (type-check + build + manual browser runs only) — no test framework wired up.

**Directory reorg (post-M7):** `sample_data/` now nests its CSVs under `CSV Files from IMOS/`
and golden XMLs under `XML Data for Nanxing Nesting Machine/` (previously flat), and gained a
`NirvanaTec Plus2D Optimization Drawing PDFs/` folder (M3 Rev 1's reference, now superseded)
and a `Max Cut Optimization Drawings/` folder (M3 Rev 2's reference, current — see M3 row). A
`results/` folder was also added holding this app's own prior exports side-by-side with a real
Nanxing-software export, for comparison. `backend/tests/conftest.py` and `test_xml_roundtrip.py`
were updated to the new nested paths (`CSV_SAMPLE_DIR`, `XML_GOLDEN_DIR`) — **if a fresh session
sees `FileNotFoundError` from the test suite, check `sample_data/`'s actual layout before
assuming it's a code bug**; it has moved before and may again. Also note: **`Updates/update_002.md`
has been reused for two unrelated specs in this project** (first the grain-code fix, now moved to
`Business Logic/grain_logic.md`; then this PDF redesign) — don't assume a filename identifies
content across sessions, always re-read it.

**M6's output has never touched a real machine.** Byte-level structure and the discovered rules
are verified against historical golden files, but per spec §7.3/Appendix A.5 a small,
reproducible dry-run cut is still required before trusting this on real material — especially
since `ToolPoint`'s rule and `MachiningPoint=7`'s actual on-machine behavior are unconfirmed.
M8 (offcut reuse) is the remaining open backend item; M3's cut-sequence overlay was deliberately
not built (see M3 row).

---

## Current state

<!-- Update after each work block. This is what a fresh session needs most. -->

- **Last worked:** 2026-08-14 — five passes across three sessions. (1) Applied
  `Business Logic/grain_logic.md` (raw CSV `Grain` codes are `0`/`1`/`2`, not just `0`/`x`/`y`;
  `1`/`2` were previously unmapped and silently treated as ungrained/rotatable). Fixed in
  `GRAIN_MAP` (`backend/optimizer/parser.py`), see M1 row. (2) Redesigned M3's PDF export to
  match the NirvanaTec PLUS 2D reference (M3 Rev 1: colored panels, landscape orientation,
  2-per-page) after the user reorganized `sample_data/`/`results/` and pointed at that
  reference; the reorg also nested the CSV/XML fixture files the test suite reads, requiring a
  `conftest.py`/`test_xml_roundtrip.py` path fix first (see "Directory reorg" above). (3) A new
  `Updates/update_002.md` (reusing that filename for an unrelated spec — see the reused-filenames
  note above) asked for a *second*, different PDF redesign matching MaxCut software's own
  reference instead (`Max Cut Optimization Drawings/max_cut.pdf`) — sidebar with cutting
  list/occurrence badge/grain arrow, portrait board orientation, occurrence deduplication, new
  date format, back to 1-per-page. This **replaced** Rev 1 entirely (M3 row now describes both
  revisions). One point needed the project owner's direct input rather than a guess: which
  physical board axis the grain-direction arrow points along for grain-locked sheets — the
  reference itself didn't unambiguously establish this (see M3 row), and guessing wrong on a
  real job risks scrapped material, so this was resolved via `AskUserQuestion`, not inferred.
  (4) `Updates/update_003.md` asked for two things: un-share the saw/router packers (done, see
  M2 row) and a selectable wastage-placement option, prompted by a real screenshot of this app's
  own Nanxing output (`Updates/image.png`) showing scattered wastage slivers instead of
  consolidated ones — added `waste_strategy` (see M4 row), measured a real utilization
  improvement on the busiest sheet of the real sample job (73.56%→78.41%), and exposed it in the
  frontend `ParamsPanel`. (5) `Updates/update_004.md` first asked for a large, one-shot
  persistence/auth/multi-tenancy build, but explicitly asked to discuss and ask questions before
  touching code — two `AskUserQuestion` rounds scoped it down to SQLite, single-tenant, no
  login yet, and just Stock Boards + a Waste Placement default persisted this pass (see M9 row
  for the full scoping trail and what got deferred). Before all five: Phases A/B/C of
  `~/.claude/plans/delegated-moseying-robin.md` complete, plus follow-on M6, M7, and
  Nanxing-packer-efficiency passes (same plan file, rewritten fresh for each pass), prompted by
  `update_001` (a user-supplied real-world comparison against the actual Nanxing machine
  software's output for the same job) rather than by spec/milestone review — worth checking both
  `Updates/` and `Business Logic/` for similar drop-in spec/reference files in future sessions,
  since they carry real-world ground-truth this project otherwise doesn't have.
- **Backend entry point:** `backend/api.py` (FastAPI app object `app`), run via `backend/start-backend.sh`
  → `uvicorn api:app --reload --host 127.0.0.1 --port 8000`. `backend/.venv` has the `dev`
  extra installed (`pip install -e ".[dev]"`, now including `pypdf` for PDF-export test
  assertions and `httpx` for FastAPI `TestClient` HTTP tests) — `pytest -q` from `backend/` runs
  95 tests, all green. New runtime dependency: a SQLite file at `backend/nesting_pro.db`
  (gitignored, auto-created on first request via `storage.get_connection()` — no manual setup
  step, but a fresh clone's first `/stock-boards` or `/settings` call creates it).
- **Frontend entry point:** `frontend/` (Vite + React + TypeScript), `npm run dev` serves on
  `http://localhost:5173` with `/api/*` proxied to the backend on `:8000` (`vite.config.ts`) —
  run both dev servers side by side, no backend changes needed for local dev. `npm run build`
  and `npm run lint` are clean; no test framework wired up yet (type-check + build + one
  Playwright-driven manual browser pass is the only verification so far).
- **What's done & passing:** M1 parser works for both CSV schemas on real sample data (0 parse
  errors on 55 + 50 rows), quoted-space edges now normalize correctly. M2 and M4 both place
  every part from a real job (0 unplaced, was 62%/70%) with zero overlaps, each running its own
  independent copy of the same class of free-rectangle best-fit engine (`optimizer/saw_packing.py`
  / `optimizer/nanxing_packing.py` — previously one shared `optimizer/packing.py`, deliberately
  un-shared per `update_003`, see M2 row). M4's packer additionally went through a real
  efficiency fix in an earlier pass (see the M4 row) — its old shelf-packing approach was
  replaced after `update_001` showed a real-machine-software comparison exposing just how bad it
  was (a 21-part sheet at 21.4% utilization) — and, this pass, gained the `waste_strategy`
  option that closed most of the remaining gap to the real machine's utilization (see M4 row).
  M5's
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
  non-empty bodies on real data end-to-end (smoke-tested manually; `/export/pdf`'s output is now
  also asserted by `test_pdf.py`, see M3 row — `/parse`, `/optimize`, `/export/xml` still aren't
  covered as HTTP endpoints, only their underlying `optimizer/` functions are).
- **What's done & passing (M7):** the full CSV → map → configure → preview → download wizard,
  built fresh this pass — see the M7 milestone row for the exact Playwright-driven verification
  (both real sample CSVs, both machine targets, real PDF/XML downloads, a deliberately bad CSV
  correctly surfacing the backend's error instead of crashing, zero console/page/network errors).
- **What's in progress / half-done:** M7's frontend `SheetPreview.tsx` SVG draws boards with
  `boardW` horizontal / `boardL` vertical (portrait) — this briefly diverged from M3 Rev 1's
  landscape PDF, but M3 Rev 2 switched the PDF back to portrait using the same native
  (`x` along `board.width`, `y` along `board.length`) axes the packer and `SheetPreview.tsx`
  already use, so **the preview and the PDF happen to agree again** — coincidentally, not
  because anyone reconciled them; worth being aware this could drift apart again on a future
  PDF-only change. They still don't share a renderer (M7's own aspiration, still deferred).
  `ToolPointList`'s
  exact-match rate (88.1–96.4% across the 4 golden files) has residual, likely-irreducible
  noise — Appendix A.5 itself expects this needs machine dry-run refinement, so it's tracked as
  a documented tolerance rather than chased further. `ToolPoint` (which of the 4 lead-in points
  a cut starts at) has no discovered rule; defaults to `"0"` per Appendix A.5's own stated
  fallback. `frontend/` has no automated test suite (Vitest/RTL or similar never set up) — only
  type-check, build, lint, and one manual browser-driven pass exist as verification.
- **Immediate next step:** M6's output has never touched a real machine — before relying on it,
  a small reproducible dry-run cut is needed (spec §7.3/Appendix A.5), which isn't something a
  coding session can do unattended. Barring that, remaining work is M8 (offcut reuse), the
  deferred parts of M9 (login/auth, tenant/company modeling, per-machine "available
  optimizations" config, CSV-schema-template renaming — see M9 row for the confirmed
  Template-1/Template-2 mapping, not yet wired in), the frontend/PDF board-orientation mismatch
  noted above, possibly a `frontend/` test suite, and giving the `waste_strategy="edge"` option
  a real cut/dry-run check of its own — it's verified geometrically (decomposable, no overlaps,
  no drops) and against a real CSV job's numbers, but "wastage visually pushed to one edge"
  hasn't been confirmed on an actual cut sheet, only in a rendered PDF.
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
2. **Share a renderer between `SheetPreview.tsx` and the PDF:** still two independent
   implementations (M7's own deferred aspiration) — they currently happen to agree on board
   orientation (both portrait, both using the packer's native axes) after M3 Rev 2 switched the
   PDF back to portrait, but that's incidental, not enforced; a future PDF-only orientation
   change could silently diverge them again (see M3/Current-state notes). M3's own remaining
   gap — a cut-sequence overlay — was deliberately skipped since neither reference PDF (Rev 1
   nor Rev 2) shows one; the `cuts` data still isn't wired into `export/pdf.py`, but nothing
   currently calls for it to be.
3. **Grain-direction arrow, real-world confirmation:** the length↔vertical/width↔horizontal
   mapping in M3 Rev 2 was confirmed with the project owner (not derived from the MaxCut
   reference, which was ambiguous — see M3 row), but still hasn't been checked against an
   actual grain-locked job on real material. Low risk since it's a documented, deliberate
   choice rather than a guess, but worth a sanity check if/when a grain-locked CSV shows up.
4. **Frontend test suite:** `frontend/` has none yet — M7 was verified via type-check, build,
   lint, and one manual Playwright-driven browser pass, not an automated suite (Vitest/RTL or
   similar).
5. **`waste_strategy="edge"`, real-world confirmation:** verified geometrically (guillotine-
   decomposable, no overlaps, nothing dropped, both machines) and against real CSV job numbers
   (measured utilization + offcut-consolidation improvement — see M4 row), plus visually via a
   rendered PDF. Not yet confirmed on an actual cut sheet that the consolidated wastage is where
   it visually appears to be and is actually more usable as offcut stock in practice.
6. **M8 offcut reuse:** larger oddments become returnable stock (see Appendix A.6).
7. **M9, deferred scope:** `update_004.md`'s login/auth, tenant/company modeling, per-machine
   "available optimizations" config, and CSV-schema-template renaming (Nanxing Nesting →
   "Template 1", Panel Saw → "Template 2" — mapping already confirmed with the project owner,
   just not implemented yet) were all explicitly scoped out of the first persistence pass (see
   M9 row) to land Stock Boards + Waste Placement defaults first. Pick up in that order unless
   priorities change.

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