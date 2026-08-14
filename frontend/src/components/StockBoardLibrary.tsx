import { useEffect, useState } from "react";
import { ApiError, createStockBoard, deleteStockBoard, listStockBoards, type PersistedStockBoard } from "../api";
import type { Grain, StockBoard } from "../types";

interface Props {
  onUse: (board: StockBoard) => void;
}

const EMPTY_FORM = { material: "", length: "", width: "", thickness: "", grain: "none" as Grain };

export function StockBoardLibrary({ onUse }: Props) {
  const [boards, setBoards] = useState<PersistedStockBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listStockBoards()
      .then(setBoards)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load saved stock boards"))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!form.material || !form.length || !form.width || !form.thickness) return;
    setSaving(true);
    setError(null);
    try {
      const board = await createStockBoard({
        material: form.material,
        length: Number(form.length),
        width: Number(form.width),
        thickness: Number(form.thickness),
        grain: form.grain,
      });
      setBoards((prev) => [...prev, board]);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save stock board");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    try {
      await deleteStockBoard(id);
      setBoards((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete stock board");
    }
  }

  return (
    <fieldset className="params-section">
      <legend className="params-section__title">Stock Board Library</legend>
      {error && (
        <ul className="alert alert--error">
          <li>{error}</li>
        </ul>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : boards.length === 0 ? (
        <p className="muted">No saved stock boards yet — add one below.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Length</th>
              <th>Width</th>
              <th>Thickness</th>
              <th>Grain</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id}>
                <td>{board.material}</td>
                <td>{board.length}</td>
                <td>{board.width}</td>
                <td>{board.thickness}</td>
                <td>{board.grain}</td>
                <td>
                  <button type="button" className="btn btn--quiet" onClick={() => onUse(board)}>
                    Use
                  </button>
                  <button type="button" className="btn btn--quiet" onClick={() => handleDelete(board.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-grid field-grid--4">
        <label className="field">
          <span className="field__label">Material</span>
          <input type="text" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Length (mm)</span>
          <input type="number" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Width (mm)</span>
          <input type="number" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Thickness (mm)</span>
          <input type="number" value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Grain</span>
          <select value={form.grain} onChange={(e) => setForm({ ...form, grain: e.target.value as Grain })}>
            <option value="none">None</option>
            <option value="length">Length</option>
            <option value="width">Width</option>
          </select>
        </label>
      </div>
      <button type="button" className="btn btn--secondary" onClick={handleAdd} disabled={saving}>
        {saving ? "Saving…" : "Save to library"}
      </button>
    </fieldset>
  );
}
