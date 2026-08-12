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
      <p>Drag a parts CSV here, or click to choose a file</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
