import { useCallback, useEffect, useState } from "react";
import { ApiError, createStockBoard, deleteStockBoard, listStockBoards, type PersistedStockBoard } from "../api";
import { formatRate } from "../costUtils";
import { SortableTh } from "./SortableTh";
import { useTableControls } from "../hooks/useTableControls";
import type { CostUnit, Grain, StockBoardWithCost } from "../types";

interface Props {
  onUse: (board: StockBoardWithCost) => void;
}

const EMPTY_FORM = { material: "", length: "", width: "", thickness: "", grain: "none" as Grain, cost: "", costUnit: "board" as CostUnit };

const BOARD_SORTERS: Record<string, (a: PersistedStockBoard, b: PersistedStockBoard) => number> = {
  material: (a, b) => a.material.localeCompare(b.material),
  length: (a, b) => a.length - b.length,
  width: (a, b) => a.width - b.width,
  thickness: (a, b) => a.thickness - b.thickness,
  grain: (a, b) => a.grain.localeCompare(b.grain),
  cost: (a, b) => a.cost - b.cost,
};

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
        cost: form.cost ? Number(form.cost) : 0,
        costUnit: form.costUnit,
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

  const searchBoards = useCallback((b: PersistedStockBoard) => b.material, []);
  const boardTable = useTableControls(boards, { searchText: searchBoards, sorters: BOARD_SORTERS });

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
        <>
          <label className="field table-search">
            <span className="field__label">Search by material</span>
            <input type="text" placeholder="Material…" value={boardTable.query} onChange={(e) => boardTable.setQuery(e.target.value)} />
          </label>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <SortableTh label="Material" sortKey="material" activeKey={boardTable.sortKey} dir={boardTable.sortDir} onSort={boardTable.toggleSort} />
                  <SortableTh label="Length" sortKey="length" activeKey={boardTable.sortKey} dir={boardTable.sortDir} onSort={boardTable.toggleSort} />
                  <SortableTh label="Width" sortKey="width" activeKey={boardTable.sortKey} dir={boardTable.sortDir} onSort={boardTable.toggleSort} />
                  <SortableTh label="Thickness" sortKey="thickness" activeKey={boardTable.sortKey} dir={boardTable.sortDir} onSort={boardTable.toggleSort} />
                  <SortableTh label="Grain" sortKey="grain" activeKey={boardTable.sortKey} dir={boardTable.sortDir} onSort={boardTable.toggleSort} />
                  <SortableTh label="Cost" sortKey="cost" activeKey={boardTable.sortKey} dir={boardTable.sortDir} onSort={boardTable.toggleSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {boardTable.rows.map((board) => (
                  <tr key={board.id}>
                    <td>{board.material}</td>
                    <td>{board.length}</td>
                    <td>{board.width}</td>
                    <td>{board.thickness}</td>
                    <td>{board.grain}</td>
                    <td>{board.cost > 0 ? formatRate(board.cost, board.costUnit) : "—"}</td>
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
            {boardTable.rows.length === 0 && <p className="muted">No saved boards match "{boardTable.query}".</p>}
          </div>
        </>
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
        <label className="field">
          <span className="field__label">Cost (₹)</span>
          <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Cost unit</span>
          <select value={form.costUnit} onChange={(e) => setForm({ ...form, costUnit: e.target.value as CostUnit })}>
            <option value="board">₹ per board</option>
            <option value="sqft">₹ per sqft</option>
          </select>
        </label>
      </div>
      <button type="button" className="btn btn--secondary" onClick={handleAdd} disabled={saving}>
        {saving ? "Saving…" : "Save to library"}
      </button>
    </fieldset>
  );
}
