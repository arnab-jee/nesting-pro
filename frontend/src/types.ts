// Mirrors backend/optimizer/model.py — the JSON contract both sides must agree on.

export type Grain = "none" | "length" | "width";
export type TargetMachine = "saw" | "nanxing";
export type WasteStrategy = "balanced" | "edge";

export interface EdgeSet {
  l1: string;
  l2: string;
  w1: string;
  w2: string;
}

export interface Part {
  id: string;
  posId: string;
  name: string;
  cutLength: number;
  cutWidth: number;
  finishedLength: number;
  finishedWidth: number;
  thickness: number;
  qty: number;
  material: string;
  grain: Grain;
  edges: EdgeSet;
  faceTop?: string | null;
  faceBottom?: string | null;
  core?: string | null;
  customer?: string | null;
}

export interface StockBoard {
  material: string;
  length: number;
  width: number;
  thickness: number;
  grain: Grain;
}

// Currency is always ₹. A plain string union rather than trying to be exhaustive — more units
// (e.g. "sqm") are an explicitly expected future addition, one line here and in the matching
// backend VALID_COST_UNITS tuple (storage.py), not a schema change.
export type CostUnit = "board" | "sqft";

// The job-config and stock-board-library shape adds a display-only cost (Phase 3, ROADMAP.md)
// that's never sent to /optimize or /export/* — the backend's StockBoard dataclass has no such
// field and would reject it. App.tsx strips cost/costUnit back down to plain StockBoard when
// building an OptRequest. cost === 0 means "not entered" (waste-cost figures hide, not show ₹0).
export interface StockBoardWithCost extends StockBoard {
  cost: number;
  costUnit: CostUnit;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface OptRequest {
  parts: Part[];
  stock: StockBoard[];
  kerf: number;
  toolDiameter: number;
  partSpacing: number;
  margin: Margin;
  allowRotation: boolean;
  target: TargetMachine;
  wasteStrategy: WasteStrategy;
  showCutLines: boolean;
}

export interface PlacedPart {
  partId: string;
  x: number;
  y: number;
  rotated: boolean;
  w: number;
  h: number;
  name: string;
  material: string;
  thickness: number;
  grain: Grain;
}

export interface Offcut {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sheet {
  index: number;
  material: string;
  boardL: number;
  boardW: number;
  thickness: number;
  placed: PlacedPart[];
  offcuts: Offcut[];
  utilizationPct: number;
}

export interface CutInstruction {
  orientation: "horizontal" | "vertical";
  offset: number;
  length: number;
  sheetIndex: number;
}

export interface OptResult {
  sheets: Sheet[];
  unplaced: Part[];
  cuts: CutInstruction[];
}

// A saved margin/kerf/waste-strategy bundle (Phase 3, ROADMAP.md) — everything ParamsPanel.tsx
// controls except stock boards and parts, which are per-job, not reusable across jobs.
export interface Preset {
  name: string;
  target: TargetMachine;
  margin: Margin;
  kerf: number;
  toolDiameter: number;
  partSpacing: number;
  allowRotation: boolean;
  wasteStrategy: WasteStrategy;
}

// Response shape for POST /import/xml (Updates/update_006.md) — loading an existing Nanxing FCC
// nesting XML and viewing it the same way a fresh /optimize result is viewed. No `parts`/`cuts`:
// this app doesn't re-export an imported job (see App.tsx's isImported gating), since /export/*
// re-runs the optimizer from parts+stock+params rather than re-serializing a given result.
export interface ImportXmlResult {
  sheets: Sheet[];
  unplaced: Part[];
  cuts: CutInstruction[];
  margin: Margin;
  toolDiameter: number;
  partSpacing: number;
  stock: StockBoard[];
}
