import type { CostUnit, Sheet, StockBoardWithCost } from "./types";

export const CURRENCY = "₹";

const UNIT_LABEL: Record<CostUnit, string> = {
  board: "/board",
  sqft: "/sqft",
};

// Shared so every place that shows a stock board's entered rate (library table, job stock
// table) reads the same way — e.g. "₹80.00/board" or "₹5.50/sqft".
export function formatRate(cost: number, unit: CostUnit): string {
  return `${CURRENCY}${cost.toFixed(2)}${UNIT_LABEL[unit]}`;
}

// 1 sqft = 304.8mm x 304.8mm (board dimensions are always mm elsewhere in this app, but ₹/sqft
// pricing is how boards are commonly quoted regardless of the dimension unit used to spec them).
const MM2_PER_SQFT = 304.8 * 304.8;

// Cost is display-only (Phase 3, ROADMAP.md) and lives entirely client-side — the backend's
// OptResult has no cost data, so every figure here is derived from the job's own stock list.
// Matched by (material, thickness), not material alone: the same material can have different
// costs at different thicknesses, and Sheet already carries both.
function boardFor(sheet: Sheet, stock: StockBoardWithCost[]): StockBoardWithCost | undefined {
  return stock.find((b) => b.material === sheet.material && b.thickness === sheet.thickness);
}

// Normalizes any CostUnit down to "cost of one whole board" — the one thing every downstream sum
// actually needs, regardless of how the cost was quoted. ₹/board is already that; ₹/sqft needs
// scaling by the sheet's own area, which is exactly what "one board" means for this sheet.
function costPerBoardFor(sheet: Sheet, stock: StockBoardWithCost[]): number {
  const board = boardFor(sheet, stock);
  if (!board) return 0;
  if (board.costUnit === "sqft") {
    const areaSqft = (sheet.boardL * sheet.boardW) / MM2_PER_SQFT;
    return board.cost * areaSqft;
  }
  return board.cost;
}

// A job where no stock board has a cost entered shouldn't show "₹0.00 waste" — that reads as
// "confirmed zero waste," not "cost unknown." Callers use this to hide cost figures entirely
// rather than showing a misleading zero.
export function hasCostData(stock: StockBoardWithCost[]): boolean {
  return stock.some((b) => b.cost > 0);
}

export function totalMaterialCost(sheets: Sheet[], stock: StockBoardWithCost[]): number {
  return sheets.reduce((sum, s) => sum + costPerBoardFor(s, stock), 0);
}

// Each sheet's waste cost is its board cost scaled by the wasted fraction — proportional to how
// much of what was paid for went unused, not a claim about which physical piece is "the waste."
// Works for any sheet subset — the full job (Summary.tsx) or one material's sheets
// (MaterialBreakdown.tsx) — since it's a plain reduce with no job-wide state.
export function totalWasteCost(sheets: Sheet[], stock: StockBoardWithCost[]): number {
  return sheets.reduce((sum, s) => sum + (costPerBoardFor(s, stock) * (100 - s.utilizationPct)) / 100, 0);
}
