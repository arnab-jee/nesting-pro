import { useRef, useState } from "react";
import Papa from "papaparse";
import { guessSchema, type SchemaKind } from "../csvSchemas";

export interface CsvLoaded {
  csvText: string;
  headers: string[];
  previewRows: string[][];
  guessedSchema: SchemaKind | null;
}

interface Props {
  onLoaded: (result: CsvLoaded) => void;
}

export function CsvUpload({ onLoaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    file
      .text()
      .then((csvText) => {
        const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true, preview: 6 });
        if (parsed.errors.length > 0 || parsed.data.length === 0) {
          setError("Could not read this file as CSV.");
          return;
        }
        const [headers, ...previewRows] = parsed.data;
        onLoaded({ csvText, headers, previewRows, guessedSchema: guessSchema(headers) });
      })
      .catch(() => setError("Could not read this file."));
  }

  return (
    <div
      className={`csv-upload ${dragging ? "csv-upload--dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <svg className="csv-upload__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4v11m0-11 4 4m-4-4-4 4M5 17v1.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V17"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="csv-upload__title">Drag a parts CSV here</p>
      <p className="csv-upload__hint">or click to choose a file</p>
      {error && <p className="alert alert--error">{error}</p>}
    </div>
  );
}
