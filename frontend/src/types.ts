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
