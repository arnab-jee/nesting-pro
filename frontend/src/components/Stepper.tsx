import type { Step } from "../App";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map columns" },
  { key: "configure", label: "Configure" },
  { key: "results", label: "Results" },
];

interface Props {
  current: Step;
}

export function Stepper({ current }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="stepper">
      {STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "upcoming";
        return (
          <li key={step.key} className={`stepper__item stepper__item--${state}`}>
            <span className="stepper__marker">{state === "done" ? "✓" : i + 1}</span>
            <span className="stepper__label">{step.label}</span>
            {i < STEPS.length - 1 && <span className="stepper__connector" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
