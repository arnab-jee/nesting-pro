import { useState } from "react";
import { buildColumnMapping, rewriteCsvHeaders, schemaLabel, SCHEMA_HEADERS, type SchemaKind } from "../csvSchemas";

interface Props {
  csvText: string;
  headers: string[];
  previewRows: string[][];
  guessedSchema: SchemaKind | null;
  onConfirm: (finalCsvText: string) => void;
  onBack: () => void;
}

export function ColumnMapping({ csvText, headers, previewRows, guessedSchema, onConfirm, onBack }: Props) {
  const [schemaKind, setSchemaKind] = useState<SchemaKind>(guessedSchema ?? "nesting");
  const [mapping, setMapping] = useState<Record<string, string>>(() => buildColumnMapping(headers, schemaKind));

  function selectSchema(kind: SchemaKind) {
    setSchemaKind(kind);
    setMapping(buildColumnMapping(headers, kind));
  }

  const unmapped = SCHEMA_HEADERS[schemaKind].filter((field) => !mapping[field]);

  return (
    <div className="column-mapping">
      <h2>Confirm columns</h2>
      {guessedSchema ? (
        <p>Detected as <strong>{schemaLabel(guessedSchema)}</strong> format.</p>
      ) : (
        <p>Could not auto-detect the format — pick one and map the columns below.</p>
      )}

      <label>
        Schema:{" "}
        <select value={schemaKind} onChange={(e) => selectSchema(e.target.value as SchemaKind)}>
          <option value="nesting">{schemaLabel("nesting")}</option>
          <option value="saw">{schemaLabel("saw")}</option>
        </select>
      </label>

      <table className="mapping-table">
        <thead>
          <tr>
            <th>Expected column</th>
            <th>Your CSV column</th>
          </tr>
        </thead>
        <tbody>
          {SCHEMA_HEADERS[schemaKind].map((field) => (
            <tr key={field}>
              <td>{field}</td>
              <td>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                >
                  <option value="">— none —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {unmapped.length > 0 && (
        <p className="alert alert--warning">Unmapped: {unmapped.join(", ")} — rows may fail to parse.</p>
      )}

      <h3>Preview</h3>
      <div className="table-scroll">
        <table className="csv-preview">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button className="btn btn--secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn btn--primary" onClick={() => onConfirm(rewriteCsvHeaders(csvText, mapping))}>
          Continue
        </button>
      </div>
    </div>
  );
}
