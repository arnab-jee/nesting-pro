import type { TargetMachine } from "../types";

interface Props {
  target: TargetMachine;
  onChange: (target: TargetMachine) => void;
}

export function MachineSelector({ target, onChange }: Props) {
  return (
    <div className="machine-selector">
      <label>
        <input type="radio" checked={target === "saw"} onChange={() => onChange("saw")} />
        Panel Saw
      </label>
      <label>
        <input type="radio" checked={target === "nanxing"} onChange={() => onChange("nanxing")} />
        Nanxing (nesting router)
      </label>
    </div>
  );
}
