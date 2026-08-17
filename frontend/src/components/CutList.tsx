import type { CutInstruction } from "../types";

interface Props {
  cuts: CutInstruction[];
  open: boolean;
  onToggle: (open: boolean) => void;
}

// OptResult.cuts (built in backend/optimizer/guillotine.py's build_cuts_for_sheet, M2) already
// comes back from /optimize but was never rendered anywhere — this is that data's first UI.
// Rendered in the order the API returns it (vertical cuts by ascending offset, then horizontal
// by ascending offset); each entry is a full-span straight cut line, not a claim about which
// physical sub-piece it applies to mid-sequence.
// Controlled (open/onToggle) rather than a plain uncontrolled <details> so SheetPreview can tie
// the SVG cut-line overlay's visibility to this same disclosure instead of adding a second toggle.
export function CutList({ cuts, open, onToggle }: Props) {
  if (cuts.length === 0) return null;
  return (
    <details className="cut-list" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>Cut list ({cuts.length})</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Orientation</th>
              <th>Offset (mm)</th>
              <th>Length (mm)</th>
            </tr>
          </thead>
          <tbody>
            {cuts.map((c, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className={`cut-orientation cut-orientation--${c.orientation}`}>{c.orientation}</td>
                <td>{c.offset.toFixed(1)}</td>
                <td>{c.length.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
