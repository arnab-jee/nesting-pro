# Wood Panel Optimization Web App — Build Instructions for Claude Code

> **Purpose:** Build a web application that ingests panel cutting data (CSV), runs
> machine-appropriate 2D cutting optimization, and exports (a) NanXing FCC nesting
> XML for the **Nanxing NCG2812LE** CNC nesting router and (b) a labeled layout PDF
> for the **panel saw** operator.

---

## 0. The single most important design principle

**Two machines require two different optimizers, not one optimizer with two exporters.**

| | Panel Saw | Nanxing NCG2812LE (nesting router) |
|---|---|---|
| Physical cut | Straight, edge-to-edge only | Each part routed out individually |
| Required algorithm | **Guillotine** bin-packing | **Free / true-shape** nesting (non-guillotine OK) |
| Output | Labeled layout PDF + cut sequence | FCC nesting **XML** with per-part toolpaths |
| Yield | Lower (constrained) | Higher |

A layout that is not guillotine-decomposable **cannot be produced on a panel saw**. Never
feed free-nest output to the saw exporter. The optimizer choice is driven by target machine,
selected up front by the user.

**Confirmed shop parameters (from the owner):**
- Router tool diameter: **fixed at 6mm**. Board margin: **variable — user input**.
- **Offcut / oddment reuse: in scope** (returnable stock — see M8 + Section 3 stock model).
- **Grain-directional stock IS used** — rotation must be lockable per material/part. Do not
  assume rotation is always free just because the sample CSVs showed grain=0.
- This app **replaces NirvanaTec PLUS 2D** for the panel-saw workflow too. The operator today
  reads the PLUS 2D drawing; your PDF becomes that drawing, so it must be at least as readable
  (see 6a). You are free to design the PDF — you are not required to reproduce the PLUS 2D
  ZIP/JPEG container.
- Real machine-verified golden XML files exist and were analyzed — see **Appendix A**, which
  turns milestone M6 from guesswork into a derived spec.

---

## 1. Recommended architecture

```
┌─────────────────────────────────────────────┐
│  React frontend (Vite + TypeScript)          │
│  - CSV upload & column mapping UI            │
│  - Machine selection (Saw | Nanxing)         │
│  - Params (kerf, margins, stock, grain)      │
│  - Interactive layout preview (SVG/Canvas)   │
│  - Download XML / PDF                         │
└───────────────┬─────────────────────────────┘
                │ (in-process WASM  OR  HTTP)
┌───────────────▼─────────────────────────────┐
│  Optimization core                           │
│  - parser (CSV → normalized Part[])          │
│  - guillotine optimizer (saw)                │
│  - free-nest optimizer (router)              │
│  - FCC XML serializer                        │
│  - PDF layout generator                      │
└──────────────────────────────────────────────┘
```

**Language decision — CONFIRMED: Python core + React/TypeScript frontend.**
- **Optimization core + exporters: Python (FastAPI backend).** Rich ecosystem for exactly
  this work: `rectpack`/custom packers for nesting, `shapely` for geometry, `lxml` for the
  FCC XML, `reportlab`/`svglib` for PDF. Owner knows Python.
- **Frontend: React + TypeScript (Vite).** Owner knows JS.
- Endpoints: `POST /optimize`, `POST /export/xml`, `POST /export/pdf`.

Build the core as a **pure, framework-free Python package** (`optimizer/`) that FastAPI merely
wraps, so it's independently testable. Everything crosses the frontend↔backend boundary as the
normalized JSON contract (Section 3).

---

## 2. Build order (milestones)

Build and verify each milestone before moving on. Do **not** attempt the XML toolpaths first.

1. **M1 — Parser + normalized model.** CSV in → `Part[]` out, grouped into nesting jobs.
2. **M2 — Guillotine optimizer** (panel saw). Placement rectangles only.
3. **M3 — PDF layout export** (panel saw). This validates the whole pipeline visually.
4. **M4 — Free-nest optimizer** (router). Placement rectangles only.
5. **M5 — FCC XML geometry** (placement polygons + oddments, **no toolpaths yet**).
6. **M6 — FCC XML toolpaths** (`Lineament`/`CutInfos`/`ToolPointList`). Hardest; validate
   against a golden reference file (Section 7) before trusting it on the machine.
7. **M7 — Frontend integration**, previews, download, params.
8. **M8 — Offcut/oddment reuse** (optional, high value).

---

## 3. Normalized data model (the cross-boundary contract)

```ts
type Grain = "none" | "length" | "width";   // "none" ⇒ rotation allowed

interface Part {
  id: string;            // barcode, e.g. "26Y111T1F1B3_1001"
  posId: string;         // "Pos. barcode" / ProdutionNo, e.g. "01.26Y111T1F1B3_1001"
  name: string;          // "Bed Foot Side"
  cutLength: number;     // dimension actually routed/sawn (mm)  ← NEST ON THIS
  cutWidth: number;      // (mm)                                  ← NEST ON THIS
  finishedLength: number;// includes edgeband allowance (cut + ~3.6mm)
  finishedWidth: number;
  thickness: number;     // mm
  qty: number;
  material: string;      // group key part 1
  grain: Grain;          // group key part 3
  edges: { l1:string; l2:string; w1:string; w2:string }; // edgebanding codes ("" = none)
  faceTop?: string; faceBottom?: string; core?: string;
  customer?: string;
}

interface StockBoard { material:string; length:number; width:number; thickness:number; grain:Grain; }

interface OptRequest {
  parts: Part[];
  stock: StockBoard[];        // default 2440 × 1220 × T
  kerf: number;               // saw blade width  (panel saw)
  toolDiameter: number;       // router bit Ø     (nanxing), default 6
  partSpacing: number;        // gap between parts (nanxing WorkpieceSpace≈6.1)
  margin: { top:number; right:number; bottom:number; left:number }; // e.g. 0,10,10,5
  allowRotation: boolean;     // false when grain != none
  target: "saw" | "nanxing";
}

interface PlacedPart { partId:string; x:number; y:number; rotated:boolean; w:number; h:number; }
interface Sheet {
  index:number; material:string; boardL:number; boardW:number; thickness:number;
  placed: PlacedPart[];
  offcuts: { x:number; y:number; w:number; h:number }[];
  utilizationPct: number;
}
interface OptResult { sheets: Sheet[]; unplaced: Part[]; }
```

**Grouping rule (M1):** parts must be split into independent nesting jobs keyed by
`(material, thickness, grain)`. You cannot nest 6mm and 17mm parts on the same board.
Expand `qty` into individual placeable units.

**Grain (confirmed used):** when a part's `grain != "none"`, rotation is **locked** — the part
may only be placed at 0° so its grain aligns with the board's grain direction. `allowRotation`
must be computed per-part from grain, not set globally. The board's grain axis comes from the
stock (`Patterns.Grain="L"` = length-wise in the sample data).

---

## 4. Input CSV formats (both observed; support both via a column-mapping step)

The app must not hard-code column order. Provide an auto-detect + manual override mapper.

### 4a. "Nesting machine" CSV schema
`Project Name, Pos. barcode, Barcode, Part Name, Cutting Length, Cutting Width, Qty,
Lenght, Width, Panel Thickness, Material Name, Face Material 1, Face Material 2,
Core material, Edge 1, Edge 2, Edge 3, Edge 4, Grain`

- `Cutting Length/Width` → `cutLength/cutWidth` (nest on these).
- `Lenght/Width` → finished size (note the vendor typo "Lenght"; handle it).
- `Grain` observed `0` ⇒ map to `"none"`.

### 4b. "Panel saw" CSV schema
`Mate, NAME, Pos.#, Barcode, Length, Width, Thickness, Length2, Width2, Thickness2,
Top, Bottom, Edge 1, Edge 2, Edge 3, Edge 4, Qty`

- `Mate` = material code (e.g. `CC_HDH_6_8134_BS`); `Length/Width/Thickness` = cut size.
- `Length2/Width2/Thickness2` = secondary/backer layer — keep but not needed for nesting.
- Edge fields may contain the literal `" "` (quoted space) meaning "no edge" — treat as empty.

Robustness: strip BOM, tolerate `\r\n`, tolerate quoted spaces, tolerate the "Lenght" typo,
coerce numerics, and reject rows with non-positive dimensions with a clear error list.

---

## 5. Optimizer specs

### 5a. Guillotine optimizer — PANEL SAW (M2)
- Constraint: every cut spans the full current sub-rectangle (edge-to-edge). Recursive
  guillotine partition only.
- Approach: guillotine bin-packing with a scoring heuristic (best-area-fit / best-short-side),
  then improve with a few restarts or a beam search over split direction. Keep it deterministic
  given a seed.
- Respect `kerf` between adjacent parts and `margin` at board edges.
- `allowRotation`: only when part grain is `"none"`.
- Emit, in addition to `Sheet`, an **ordered cut list** (each cut = orientation + offset),
  because the saw operator follows cuts in sequence.
- Report `utilizationPct` per sheet (matches PLUS 2D "Utl%").

### 5b. Free-nest optimizer — NANXING (M4)
- No guillotine constraint; parts may be placed freely (shelf/skyline/maximal-rectangles or a
  bottom-left-fill with rotation).
- Respect `partSpacing` (≈ toolDiameter, observed `WorkpieceSpace=6.1`) and `margin`.
- Rotation 0°/90° only, gated by grain.
- Compute leftover **oddments** = maximal free rectangles remaining on each sheet (the XML
  records these; larger ones are reusable stock).

**Libraries:** Rust — implement or port `maxrects`/guillotine (no heavy deps). Python —
`rectpack` gets you a fast M2/M4 baseline; graduate to custom code for oddment extraction and
cut-sequence output.

---

## 6. Exporters

### 6a. Panel-saw layout PDF (M3)
Match the *usefulness* of the PLUS 2D output; you are free to redesign the styling.
Per sheet, one page containing:
- Scaled rectangle diagram of the 2440×1220 board with each placed part drawn to scale,
  filled with a distinct color, labeled with **barcode** and **cut L × W**.
- Footer summary line: `Stock# · Dim · Qty · Material · Thk · Utl%`.
- (Recommended addition) the ordered **cut sequence** as a numbered list or overlaid cut lines,
  which PLUS 2D does not show clearly — a real usability win for the operator.

Implementation: render SVG per sheet (reuse the frontend preview renderer), convert SVG→PDF
(Python `svglib`/`reportlab`, or `@react-pdf` / `svg2pdf.js` on the client). Multi-page = one
page per sheet, like the reference bundle.

> Note: the reference `.pdf` is actually a **ZIP** of JPEGs + `manifest.json` produced by PLUS
> 2D. You are **not** required to replicate that container — emit a real PDF unless the user
> confirms their downstream tooling needs the ZIP/JPEG bundle.

### 6b. NanXing FCC XML (M5 geometry, M6 toolpaths)

**Treat a known-good reference XML as the golden template.** Do not invent the schema; replicate
it and vary only what geometry requires. Observed structure (from real files):

```
FccRoot  Version="2" DataValid="5" CreateG="false"
         RefreshCuttingOrder="false" OptCreateFile="true"
 └ Patterns  Index ID Name(=material) Length Width Thickness Grain   ← one per material
    └ Pattern  Index LayoutOrigin="2" WorkpieceSpace="6.1" X="0" Y="0"
               ToolName="80" ToolDiameter="6" CutOddmentsFlg="2"
               Margin="0,10,10,5"                                     ← one per sheet
       ├ Workpieces
       │  └ Workpiece  ID WorkpieceId CuttingOrderNo Qty Name Material
       │               Length Width Thickness CutLength CutWidth
       │               MachiningPoint Grain ProdutionNo ProductionName
       │               Customer HasFace5 HasFace6 OnlyHasFace6
       │               EBL1 EBL2 EBW1 EBW2 RotateAngle Info1 Info2
       │     ├ EdgeGroup(X1,Y1) → 4× Edge(Face,Thickness,Pre_Milling,X,Y,CentralAngle)
       │     ├ Lineament  RotationAngle X Y ProOffsetX ProOffsetY
       │     │   ├ Points → 5× Point(Index,X,Y,Angle)   ← closed placed rectangle, board coords
       │     │   └ CutInfos SamllWorkpieceFlg ToolPoint ToolPointList
       │     │        └ CutInfo CutNo ToolDirection SlopeLen
       │     ├ Lineament2 → Points (mirror of Lineament polygon)
       │     ├ FccOutline → 5× FccOutlinePoint(X,Y,Angle,EdgeThickness,EdgePreMilling)
       │     └ BenchmarkInfo ProLength ProWidth
       └ OddmentsList
          └ Oddments  Index Type="0" Length Width
             └ Lineament → Points(5) + CutInfos/CutInfo         ← leftover offcut rectangle
```

**Field handling guidance (confirm the empirical ones on the machine):**

*Compute from geometry (must be correct):*
- `Patterns`: `Name`=material, `Length/Width/Thickness` from stock, `Grain`="L".
- `Pattern`: one per sheet; `Index` sequential.
- `Workpiece`: `Length/Width` = finished, `CutLength/CutWidth` = cut size, `Material`,
  `WorkpieceId`, `ProdutionNo`, `Name`, `Customer`, `EB*` = edge codes,
  `RotateAngle` = 0 or 90 from placement, `Qty`.
- `Lineament.X/Y` + its 5 `Point`s = the placed rectangle in **absolute board coordinates**
  (2440 along X, 1220 along Y). `Lineament2` mirrors the polygon. `FccOutline` = local
  0-origin outline. `BenchmarkInfo` = cut dims.
- `Oddments` = free-rectangle list from the optimizer; each with its own closing polygon.
- `CuttingOrderNo` = the emit/cut order (sequence parts sensibly, e.g. by position).

*Likely constant for this shop config — copy verbatim from the golden file, expose as config:*
- `FccRoot` attributes; `Pattern`: `LayoutOrigin=2`, `WorkpieceSpace=6.1`, `ToolName=80`,
  `ToolDiameter=6`, `CutOddmentsFlg=2`, `Margin="0,10,10,5"`.
- `Workpiece`: `Grain="N"`, `HasFace5/6="false"`, `OnlyHasFace6="false"`.
- `Edge` rows: four faces (1,2,3,4) with observed defaults.

*Derived from 391 real placed parts across 3 machine-verified files — see **Appendix A** for
exact rules:*
- `SlopeLen=70`, `ToolDirection=0`, `Grain="N"`, all `HasFace*="false"` → **constants**.
- `MachiningPoint`: **1** when unrotated, **3/7** when rotated 90° (rule in Appendix A).
- `SamllWorkpieceFlg`: **true when shorter side ≤ ~265mm** (~97% match; refine on machine).
- `CutInfos.ToolPointList`: **four lead-in ramp points**, each `SlopeLen`(70mm) from a corner
  along an edge — a closed geometric construction, fully specified in Appendix A.
- `ToolPoint`: index (0–3) of the starting lead-in point; default `0`, refine via test cut.

Still generate M6 output by **replicating golden-file patterns and byte-diffing** before cutting
real material — but Appendix A means you're matching a derived formula, not guessing.

Serialization details: UTF-8, `\r\n` line endings, 2-space indent, self-closing empty elements —
match the reference exactly so the machine's parser accepts it.

---

## 7. Validation strategy (do this — it prevents scrapped material and broken tools)

1. **Golden-file round-trip:** obtain one reference XML the Nanxing cut successfully. Parse it
   into the normalized model, re-serialize, and **diff** against the original. Drive the diff to
   near-zero (allowing only float-format noise). This proves the serializer before any new nest.
2. **Geometry invariants (assert in tests):** no part overlaps; all parts within
   `margin`-inset board; `Σ part area + Σ oddment area + kerf/spacing area ≈ board area`;
   placed polygons closed; utilization ∈ (0,100].
3. **Machine dry-run:** first real export = a *small* job you can reproduce, cut on the machine,
   confirm before scaling up.
4. **Saw guillotine check:** assert every saw layout is recursively guillotine-decomposable;
   fail loudly if not.

---

## 8. Frontend requirements (M7)

- CSV drag-drop → column-mapping screen (auto-detect both known schemas, allow manual map).
- Machine selector: **Panel Saw** | **Nanxing** (drives optimizer + exporter).
- Params panel: kerf, tool Ø, spacing, margins, stock boards, rotation/grain lock.
- Per-sheet interactive preview (SVG/Canvas) — reuse the same renderer for the PDF.
- Summary: sheet count, total utilization, unplaced parts (with reasons).
- Download buttons: **XML** (Nanxing) / **PDF** (saw). Filename from project + timestamp.
- Client-side only if using Rust/WASM; otherwise thin FastAPI endpoints
  (`/optimize`, `/export/xml`, `/export/pdf`).

---

## 9. Tech stack summary

- **Frontend:** Vite + React + TypeScript; SVG or Canvas rendering; PapaParse for CSV.
- **Core:** Rust (+wasm-pack) *or* Python (FastAPI). Pick one; keep the JSON contract stable.
- **XML:** hand-built templating (Rust `quick-xml`/string builder, or Python
  `xml.etree`/`lxml`) — must match reference byte-formatting.
- **PDF:** SVG→PDF (`reportlab`/`svglib`, or `@react-pdf`/`svg2pdf.js`).
- **Tests:** golden-file diff + geometry-invariant property tests. Set these up in M1.

---

## 10. Open parameters to get from the project owner before M6

- Real kerf (saw) and confirmed router tool Ø.
- Whether offcut/oddment reuse is in scope (affects stock model + M8).
- One machine-verified golden XML from a reproducible small job.
- Whether any grain-directional stock is used (locks rotation).
- Whether the saw output must be the PLUS-2D ZIP/JPEG bundle or a plain PDF is acceptable.

---

### Definition of done
A user uploads a parts CSV, picks a machine, sets params, sees a correct per-sheet preview,
and downloads either a machine-accepted Nanxing FCC XML **or** an operator-ready saw layout PDF,
with utilization reported and any unplaced parts flagged.

---

## Appendix A — Derived FCC XML rules (from 391 real parts in 3 machine-cut files)

These rules were reverse-engineered from the owner's successfully-cut golden files. They make
M5/M6 a matter of matching a derived spec, not guessing. **Still byte-diff against a golden file
and dry-run a small job before production.**

### A.1 Coordinate system
- Board is `Length` along **X** (e.g. 2440), `Width` along **Y** (e.g. 1220). `LayoutOrigin=2`.
- Each placed part's `Lineament` has 5 `Point`s forming a **closed rectangle in absolute board
  coordinates**; `Lineament.X/Y` equals the first point. `Lineament2` repeats the same polygon.
- `FccOutline` is the same rectangle in **local (0,0)-origin** coordinates. `BenchmarkInfo` =
  `ProLength`/`ProWidth` = cut dimensions.

### A.2 Constants (copy verbatim; expose only if a later job proves them variable)
| Field | Value |
|---|---|
| `CutInfo.SlopeLen` | `70` |
| `CutInfo.ToolDirection` | `0` |
| `CutInfo.CutNo` | `1` |
| `Workpiece.Grain` | `N` |
| `Workpiece.HasFace5 / HasFace6 / OnlyHasFace6` | `false` |
| `Pattern.LayoutOrigin` | `2` |
| `Pattern.WorkpieceSpace` | `6.1` (≈ tool Ø + clearance) |
| `Pattern.ToolName` | `80` |
| `Pattern.ToolDiameter` | `6` |
| `Pattern.CutOddmentsFlg` | `2` |
| `Pattern.X / Pattern.Y` | `0` |
| `Lineament.ProOffsetX / ProOffsetY` | `3` |
| `FccRoot` attrs | `Version=2 DataValid=5 CreateG=false RefreshCuttingOrder=false OptCreateFile=true` |

`Pattern.Margin` = `"top,right,bottom,left"` (observed `0,10,10,5`) → **driven by the user's
variable-margin input**, not constant.

### A.3 MachiningPoint (datum corner)
- `RotateAngle` unset or `0` (part NOT rotated) → **`MachiningPoint = 1`**.
- `RotateAngle = 90` (part rotated) → **`MachiningPoint = 3`** by default, occasionally `7`.
  Across the data, `3` is the common rotated datum (~83%) and `7` appears on a minority
  (correlates loosely with larger panels vs. thin strips). **Rule:** emit `1` for unrotated,
  `3` for rotated; treat `7` as an acceptable machine-side variant. Verify holding on the first
  rotated-part dry run; if the machine prefers `7` for large panels, add that refinement later.

### A.4 SamllWorkpieceFlg (per `CutInfos`)
`true` when **min(CutLength, CutWidth) ≤ ~265mm**, else `false` (~97% match on real data; a few
long thin strips are exceptions). This flag tells the router a part is small enough to need extra
holding — getting a borderline part wrong is a quality nuance, not a "won't cut". Make the
threshold a config constant so it can be tuned after machine trials.

### A.5 ToolPointList — the lead-in ramp geometry (the crux of M6)
For a placed rectangle with bounds `X∈[minx,maxx]`, `Y∈[miny,maxy]` and `SL = SlopeLen = 70`,
the router uses **four candidate lead-in points**, one per edge, each `SL` from a corner. The
observed construction (going around the rectangle) is:

```
idx0 : (maxx - SL, miny)   # on bottom edge, SL left of bottom-right corner
idx1 : (maxx, maxy - SL)   # on right edge,  SL below top-right corner
idx2 : (minx + SL, maxy)   # on top edge,    SL right of top-left corner
idx3 : (minx, miny + SL)   # on left edge,   SL above bottom-left corner
```

Serialize as `ToolPointList="x,y,idx$;x,y,idx$;x,y,idx$;x,y,idx$"` (2-decimal coords, trailing
`$` inside each item, `;`-separated). **Important:** the exact idx→corner assignment shifts with
`RotateAngle` — do not assume the mapping above holds for rotated parts. Implement it, then
**byte-diff generated `ToolPointList` against the golden files for both rotated and unrotated
parts** and correct the mapping until the diff is clean. `ToolPoint` = which idx the cut starts
at; default `0` and refine after a test cut (all four are geometrically valid entry points).

### A.6 OddmentsList
Each leftover free-rectangle from the optimizer becomes an `Oddments Index Type="0" Length Width`
with its own `Lineament`/`Points`(5, closed)/`CutInfos`/`CutInfo`. `CutInfos.SamllWorkpieceFlg`
here follows the same size rule. These larger oddments are the returnable stock for M8.

### A.7 Cutting order
`Workpiece.CuttingOrderNo` is a per-sheet 1..N sequence. Assign a sensible traversal (e.g. sorted
by position) — it controls cut order, not correctness. `Workpiece.ID` is a stable per-part id.

### A.8 Empty / aborted export
A valid empty job is a **self-closed root**: `<FccRoot …attrs… />` (one of the golden files was
exactly this). The exporter must produce this gracefully when a job has zero placeable parts,
rather than emitting malformed XML.

### A.9 Serialization fidelity checklist
UTF-8 · `\r\n` line endings · 2-space indent · self-closing empty elements · numbers formatted
like the reference (integers vs. 1–2 decimals as seen). Drive the golden-file round-trip diff
(Section 7.1) to float-noise-only before trusting any new nest on the machine.