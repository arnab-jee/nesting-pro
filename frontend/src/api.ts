import type { OptRequest, OptResult, Part } from "./types";

export class ApiError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join("; "));
    this.name = "ApiError";
    this.errors = errors;
  }
}

async function postJson(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const detail = payload?.detail;
    const errors = Array.isArray(detail) ? detail.map(String) : [detail ?? res.statusText];
    throw new ApiError(errors);
  }
  return res;
}

export async function parseCsv(csvText: string): Promise<{ parts: Part[] }> {
  return (await postJson("/parse", { csv_text: csvText })).json();
}

export async function optimize(request: OptRequest): Promise<OptResult> {
  return (await postJson("/optimize", request)).json();
}

async function fetchExportBlob(path: string, request: OptRequest): Promise<Blob> {
  return (await postJson(path, request)).blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function downloadPdf(request: OptRequest, projectName: string): Promise<void> {
  const blob = await fetchExportBlob("/export/pdf", request);
  triggerDownload(blob, `${projectName}-${timestamp()}.pdf`);
}

export async function downloadXml(request: OptRequest, projectName: string): Promise<void> {
  const blob = await fetchExportBlob("/export/xml", request);
  triggerDownload(blob, `${projectName}-${timestamp()}.xml`);
}
