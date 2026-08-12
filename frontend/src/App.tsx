import { useState } from "react";
import "./App.css";
import { ApiError, downloadPdf, downloadXml, optimize, parseCsv } from "./api";
import { CsvUpload, type CsvLoaded } from "./components/CsvUpload";
import { ColumnMapping } from "./components/ColumnMapping";
import { MachineSelector } from "./components/MachineSelector";
import { ParamsPanel } from "./components/ParamsPanel";
import { SheetPreview } from "./components/SheetPreview";
import { Summary } from "./components/Summary";
import type { Margin, OptRequest, OptResult, Part, StockBoard, TargetMachine } from "./types";

type Step = "upload" | "map" | "configure" | "results";

function deriveDefaultStock(parts: Part[]): StockBoard[] {
  const seen = new Map<string, StockBoard>();
  for (const p of parts) {
    const key = `${p.material}__${p.thickness}`;
    if (!seen.has(key)) {
      seen.set(key, { material: p.material, length: 2440, width: 1220, thickness: p.thickness, grain: "none" });
    }
  }
  return Array.from(seen.values());
}

function App() {
  const [step, setStep] = useState<Step>("upload");
  const [csvLoaded, setCsvLoaded] = useState<CsvLoaded | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);

  const [target, setTarget] = useState<TargetMachine>("saw");
  const [stock, setStock] = useState<StockBoard[]>([]);
  const [margin, setMargin] = useState<Margin>({ top: 0, right: 10, bottom: 10, left: 5 });
  const [kerf, setKerf] = useState(4);
  const [toolDiameter, setToolDiameter] = useState(6);
  const [partSpacing, setPartSpacing] = useState(6.1);
  const [allowRotation, setAllowRotation] = useState(true);

  const [optResult, setOptResult] = useState<OptResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeErrors, setOptimizeErrors] = useState<string[]>([]);
  const [downloadErrors, setDownloadErrors] = useState<string[]>([]);

  const projectName = parts[0]?.customer?.replace(/\s+/g, "-") ?? "nesting-job";

  function currentRequest(): OptRequest {
    return { parts, stock, kerf, toolDiameter, partSpacing, margin, allowRotation, target };
  }

  async function handleMappingConfirmed(finalCsvText: string) {
    setParsing(true);
    setParseErrors([]);
    try {
      const { parts: parsed } = await parseCsv(finalCsvText);
      setParts(parsed);
      setStock(deriveDefaultStock(parsed));
      setStep("configure");
    } catch (e) {
      setParseErrors(e instanceof ApiError ? e.errors : [String(e)]);
    } finally {
      setParsing(false);
    }
  }

  async function handleRunOptimize() {
    setOptimizing(true);
    setOptimizeErrors([]);
    try {
      const result = await optimize(currentRequest());
      setOptResult(result);
      setStep("results");
    } catch (e) {
      setOptimizeErrors(e instanceof ApiError ? e.errors : [String(e)]);
    } finally {
      setOptimizing(false);
    }
  }

  async function handleDownload(kind: "pdf" | "xml") {
    setDownloadErrors([]);
    try {
      if (kind === "pdf") await downloadPdf(currentRequest(), projectName);
      else await downloadXml(currentRequest(), projectName);
    } catch (e) {
      setDownloadErrors(e instanceof ApiError ? e.errors : [String(e)]);
    }
  }

  function startOver() {
    setStep("upload");
    setCsvLoaded(null);
    setParts([]);
    setParseErrors([]);
    setOptResult(null);
    setOptimizeErrors([]);
    setDownloadErrors([]);
  }

  return (
    <div className="app">
      <h1>Nesting Pro</h1>

      {step === "upload" && (
        <CsvUpload
          onLoaded={(loaded) => {
            setCsvLoaded(loaded);
            setStep("map");
          }}
        />
      )}

      {step === "map" && csvLoaded && (
        <>
          <ColumnMapping
            csvText={csvLoaded.csvText}
            headers={csvLoaded.headers}
            previewRows={csvLoaded.previewRows}
            guessedSchema={csvLoaded.guessedSchema}
            onConfirm={handleMappingConfirmed}
            onBack={() => setStep("upload")}
          />
          {parsing && <p>Parsing…</p>}
          {parseErrors.length > 0 && (
            <ul className="error">
              {parseErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {step === "configure" && (
        <div className="configure">
          <p>{parts.length} parts loaded.</p>
          <MachineSelector target={target} onChange={setTarget} />
          <ParamsPanel
            target={target}
            margin={margin}
            onMarginChange={setMargin}
            stock={stock}
            onStockChange={setStock}
            kerf={kerf}
            onKerfChange={setKerf}
            toolDiameter={toolDiameter}
            onToolDiameterChange={setToolDiameter}
            partSpacing={partSpacing}
            onPartSpacingChange={setPartSpacing}
            allowRotation={allowRotation}
            onAllowRotationChange={setAllowRotation}
          />
          {optimizeErrors.length > 0 && (
            <ul className="error">
              {optimizeErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="actions">
            <button onClick={() => setStep("map")}>Back</button>
            <button onClick={handleRunOptimize} disabled={optimizing}>
              {optimizing ? "Optimizing…" : "Run optimize"}
            </button>
          </div>
        </div>
      )}

      {step === "results" && optResult && (
        <div className="results">
          <Summary result={optResult} stock={stock} />
          <div className="actions">
            {/* the drawing (PDF) is a plain layout render — works for either machine's
                placement result. The FCC XML is Nanxing-specific (it's the router's own
                machine format), so only offer it for that target. */}
            <button onClick={() => handleDownload("pdf")}>Download drawing (PDF)</button>
            {target === "nanxing" && <button onClick={() => handleDownload("xml")}>Download XML</button>}
            <button onClick={() => setStep("configure")}>Adjust parameters</button>
            <button onClick={startOver}>Start over</button>
          </div>
          {downloadErrors.length > 0 && (
            <ul className="error">
              {downloadErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {optResult.sheets.map((sheet) => (
            <SheetPreview key={sheet.index} sheet={sheet} />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
