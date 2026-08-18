import { useRef, useState } from "react";
import { ApiError, importNanxingXml } from "../api";
import type { ImportXmlResult } from "../types";

interface Props {
  onLoaded: (result: ImportXmlResult) => void;
}

// Updates/update_006.md: load an existing Nanxing FCC nesting XML (from the real machine's own
// software, or an earlier export from this app) straight into the results view, bypassing the
// CSV -> map -> configure -> optimize wizard entirely — the file's own placement is already
// final. Deliberately a plain file input, not a CsvUpload.tsx-style dropzone: this is a rare,
// secondary path (most jobs start from a parts CSV), so it reads as an "or" alternative rather
// than competing visually with the primary upload flow.
export function XmlImport({ onLoaded }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setImporting(true);
    setError(null);
    try {
      const xmlText = await file.text();
      const result = await importNanxingXml(xmlText);
      onLoaded(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.errors.join("; ") : "Could not read this file.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="xml-import">
      <p className="xml-import__divider">or</p>
      <button type="button" className="btn btn--secondary" onClick={() => inputRef.current?.click()} disabled={importing}>
        {importing && <span className="spinner" aria-hidden="true" />}
        {importing ? "Importing…" : "Import an existing Nanxing XML layout"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {error && <p className="alert alert--error">{error}</p>}
    </div>
  );
}
