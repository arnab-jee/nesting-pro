import type { TargetMachine } from "../types";

interface Props {
  target: TargetMachine;
  onChange: (target: TargetMachine) => void;
}

export function MachineSelector({ target, onChange }: Props) {
  return (
    <div className="machine-selector">
      <label className="machine-option">
        <input type="radio" checked={target === "saw"} onChange={() => onChange("saw")} />
        <span className="machine-option__title">Panel Saw</span>
        <span className="machine-option__desc">Guillotine cuts, edge-to-edge</span>
      </label>
      <label className="machine-option">
        <input type="radio" checked={target === "nanxing"} onChange={() => onChange("nanxing")} />
        <span className="machine-option__title">Nanxing</span>
        <span className="machine-option__desc">Free-shape nesting router</span>
      </label>
    </div>
  );
}
