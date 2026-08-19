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

// The job-config and stock-board-library shape adds display-only fields (cost/costUnit, Phase 3;
// density/quantity, To DOs.md) that are never sent to /optimize or /export/* — the backend's
// StockBoard dataclass has none of these and would reject them. App.tsx strips all four back
// down to plain StockBoard when building an OptRequest. cost === 0 means "not entered"
// (waste-cost figures hide, not show ₹0); density/quantity are plain metadata (kg/m³, sheet
// count on hand) with no derived figures depending on them yet, so 0 is just "not entered".
export interface StockBoardWithCost extends StockBoard {
  cost: number;
  costUnit: CostUnit;
  density: number;
  quantity: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Which board corner the layout's fill origin sits in — "bottom-left" (the packer's native fill
// origin) is a no-op; the other three are a rigid mirror of the same layout (Issues/issues_005.md
// — a real dry-run cut one axis short prompted testing whether table position, not software,
// explains it, which needs the exact same layout reproducible in a different board corner).
export type PlacementCorner = "bottom-left" | "bottom-right" | "top-left" | "top-right";

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
  placementCorner: PlacementCorner;
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
