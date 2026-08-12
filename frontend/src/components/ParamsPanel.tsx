import type { Margin, StockBoard, TargetMachine } from "../types";

interface Props {
  target: TargetMachine;
  margin: Margin;
  onMarginChange: (margin: Margin) => void;
  stock: StockBoard[];
  onStockChange: (stock: StockBoard[]) => void;
  kerf: number;
  onKerfChange: (kerf: number) => void;
  toolDiameter: number;
  onToolDiameterChange: (v: number) => void;
  partSpacing: number;
  onPartSpacingChange: (v: number) => void;
  allowRotation: boolean;
  onAllowRotationChange: (v: boolean) => void;
}

export function ParamsPanel({
  target,
  margin,
  onMarginChange,
  stock,
  onStockChange,
  kerf,
  onKerfChange,
  toolDiameter,
  onToolDiameterChange,
  partSpacing,
  onPartSpacingChange,
  allowRotation,
  onAllowRotationChange,
}: Props) {
  function updateStockDim(index: number, field: "length" | "width", value: number) {
    const next = stock.slice();
    next[index] = { ...next[index], [field]: value };
    onStockChange(next);
  }

  return (
    <div className="params-panel">
      <h2>Parameters</h2>

      <fieldset>
        <legend>Margin (mm)</legend>
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <label key={side}>
            {side}
            <input
              type="number"
              value={margin[side]}
              onChange={(e) => onMarginChange({ ...margin, [side]: Number(e.target.value) })}
            />
          </label>
        ))}
      </fieldset>

      {target === "saw" ? (
        <fieldset>
          <legend>Saw</legend>
          <label>
            Kerf (mm)
            <input type="number" value={kerf} onChange={(e) => onKerfChange(Number(e.target.value))} />
          </label>
          <label>
            <input type="checkbox" checked={allowRotation} onChange={(e) => onAllowRotationChange(e.target.checked)} />
            Allow rotation (grain-free parts only)
          </label>
        </fieldset>
      ) : (
        <fieldset>
          <legend>Nanxing</legend>
          <label>
            Tool Ø (mm)
            <input type="number" value={toolDiameter} onChange={(e) => onToolDiameterChange(Number(e.target.value))} />
          </label>
          <label>
            Part spacing (mm)
            <input type="number" value={partSpacing} onChange={(e) => onPartSpacingChange(Number(e.target.value))} />
          </label>
        </fieldset>
      )}

      <fieldset>
        <legend>Stock boards</legend>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Thickness</th>
              <th>Length</th>
              <th>Width</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((board, i) => (
              <tr key={`${board.material}-${board.thickness}`}>
                <td>{board.material}</td>
                <td>{board.thickness}</td>
                <td>
                  <input type="number" value={board.length} onChange={(e) => updateStockDim(i, "length", Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={board.width} onChange={(e) => updateStockDim(i, "width", Number(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </div>
  );
}
