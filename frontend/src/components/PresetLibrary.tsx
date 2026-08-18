import { useEffect, useState } from "react";
import { ApiError, createPreset, deletePreset, listPresets, type PersistedPreset } from "../api";
import type { Preset } from "../types";

interface Props {
  // The bundle a saved preset would capture if the user hit "Save" right now — everything
  // ParamsPanel.tsx controls except stock/parts, which are per-job, not reusable.
  current: Omit<Preset, "name">;
  onApply: (preset: Preset) => void;
}

// Mirrors StockBoardLibrary.tsx's list/add/delete pattern, but presets have no separate add-form
// fields to fill in — a preset IS the current configuration, so "save" just names and persists
// whatever's already set in ParamsPanel.tsx rather than asking the user to re-enter it.
export function PresetLibrary({ current, onApply }: Props) {
  const [presets, setPresets] = useState<PersistedPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listPresets()
      .then(setPresets)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load saved presets"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const preset = await createPreset({ ...current, name: name.trim() });
      setPresets((prev) => [...prev, preset]);
      setName("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save preset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    try {
      await deletePreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete preset");
    }
  }

  return (
    <fieldset className="params-section">
      <legend className="params-section__title">Parameter Presets</legend>
      {error && (
        <ul className="alert alert--error">
          <li>{error}</li>
        </ul>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : presets.length === 0 ? (
        <p className="muted">No saved presets yet — configure the parameters above, then save them as one below.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Target</th>
                <th>Margin (T/R/B/L)</th>
                <th>Kerf</th>
                <th>Waste placement</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {presets.map((preset) => (
                <tr key={preset.id}>
                  <td>{preset.name}</td>
                  <td>{preset.target === "saw" ? "Panel Saw" : "Nanxing"}</td>
                  <td>
                    {preset.margin.top}/{preset.margin.right}/{preset.margin.bottom}/{preset.margin.left}
                  </td>
                  <td>{preset.kerf}</td>
                  <td>{preset.wasteStrategy === "balanced" ? "Balanced" : "Edge"}</td>
                  <td>
                    <button type="button" className="btn btn--quiet" onClick={() => onApply(preset)}>
                      Use
                    </button>
                    <button type="button" className="btn btn--quiet" onClick={() => handleDelete(preset.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="field-grid field-grid--2">
        <label className="field">
          <span className="field__label">Save current parameters as</span>
          <input type="text" placeholder="e.g. Standard Panel Saw run" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn--secondary" onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? "Saving…" : "Save to library"}
      </button>
    </fieldset>
  );
}
