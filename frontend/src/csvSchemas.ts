import Papa from "papaparse";

// Mirrors the canonical header sets in backend/optimizer/parser.py's SCHEMA_COLUMNS — used
// here only as a lightweight client-side guess for immediate UI feedback. The authoritative
// parse (numeric coercion, quoted-space edge normalization, grain mapping, qty expansion,
// validation) always happens server-side via /api/parse.
export type SchemaKind = "nesting" | "saw";

export const SCHEMA_HEADERS: Record<SchemaKind, string[]> = {
  nesting: [
    "Project Name", "Pos. barcode", "Barcode", "Part Name",
    "Cutting Length", "Cutting Width", "Qty", "Lenght", "Width",
    "Panel Thickness", "Material Name", "Face Material 1", "Face Material 2",
    "Core material", "Edge 1", "Edge 2", "Edge 3", "Edge 4", "Grain",
  ],
  saw: [
    "Mate", "NAME", "Pos.#", "Barcode", "Length", "Width", "Thickness",
    "Length2", "Width2", "Thickness2", "Top", "Bottom",
    "Edge 1", "Edge 2", "Edge 3", "Edge 4", "Qty",
  ],
};

const SCHEMA_LABELS: Record<SchemaKind, string> = {
  nesting: "Nesting machine",
  saw: "Panel saw",
};

export function schemaLabel(kind: SchemaKind): string {
  return SCHEMA_LABELS[kind];
}

function matchScore(headers: Set<string>, kind: SchemaKind): number {
  const canonical = SCHEMA_HEADERS[kind];
  const hits = canonical.filter((h) => headers.has(h.toLowerCase())).length;
  return hits / canonical.length;
}

export function guessSchema(headers: string[]): SchemaKind | null {
  const lower = new Set(headers.map((h) => h.trim().toLowerCase()));
  const nestingScore = matchScore(lower, "nesting");
  const sawScore = matchScore(lower, "saw");
  if (nestingScore >= 0.8 && nestingScore >= sawScore) return "nesting";
  if (sawScore >= 0.8 && sawScore > nestingScore) return "saw";
  return null;
}

/** canonical header -> best-guess matching column from the uploaded file (or "" if none found) */
export function buildColumnMapping(headers: string[], kind: SchemaKind): Record<string, string> {
  const byLower = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  const mapping: Record<string, string> = {};
  for (const canonical of SCHEMA_HEADERS[kind]) {
    mapping[canonical] = byLower.get(canonical.toLowerCase()) ?? "";
  }
  return mapping;
}

/** Rewrites only the header row so the backend's exact-name column matching succeeds,
 * leaving every data row untouched. */
export function rewriteCsvHeaders(csvText: string, mapping: Record<string, string>): string {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  const rows = parsed.data;
  if (rows.length === 0) return csvText;
  const reverse = new Map<string, string>();
  for (const [canonical, actual] of Object.entries(mapping)) {
    if (actual) reverse.set(actual, canonical);
  }
  rows[0] = rows[0].map((cell) => reverse.get(cell) ?? cell);
  return Papa.unparse(rows);
}
