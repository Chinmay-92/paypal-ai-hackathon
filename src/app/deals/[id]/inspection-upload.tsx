"use client";

import { useState } from "react";
import type { Deal } from "@/lib/deal/types";

type Point = { x: number; y: number };
type Tap = { fieldId: string; shotId: string; sample?: Point; neutral?: Point };

const MAX_EDGE = 2000;

/** Re-encodes a photo as an upright JPEG with its long edge capped, keeping uploads small. */
async function shrink(file: File): Promise<{ blob: Blob; url: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", 0.9),
  );
  return { blob, url: URL.createObjectURL(blob) };
}

export function InspectionUpload({ deal, onDone, onError }: { deal: Deal; onDone: (d: Deal) => void; onError: (e: string) => void }) {
  const shots = deal.challenge!.shots;
  const colorFields = deal.spec!.fields.filter((f) => f.method === "color_delta_e");
  const [photos, setPhotos] = useState<Record<string, { blob: Blob; url: string }>>({});
  const [taps, setTaps] = useState<Tap[]>([]);
  const [mode, setMode] = useState<{ fieldId: string; target: "sample" | "neutral" } | null>(
    colorFields[0] ? { fieldId: colorFields[0].id, target: "sample" } : null,
  );
  const [busy, setBusy] = useState(false);

  function tap(shotId: string, e: React.MouseEvent<HTMLImageElement>) {
    if (!mode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    setTaps((prev) => {
      const rest = prev.filter((t) => t.fieldId !== mode.fieldId || t.shotId !== shotId);
      const current = prev.find((t) => t.fieldId === mode.fieldId && t.shotId === shotId) ?? { fieldId: mode.fieldId, shotId };
      return [...rest, { ...current, [mode.target]: point }];
    });
    setMode({ ...mode, target: mode.target === "sample" ? "neutral" : "sample" });
  }

  async function submit() {
    setBusy(true);
    const form = new FormData();
    for (const [shotId, p] of Object.entries(photos)) form.append(shotId, p.blob, `${shotId}.jpg`);
    form.append("colorTaps", JSON.stringify(taps.filter((t) => t.sample && t.neutral)));
    const res = await fetch(`/api/deals/${deal.id}/inspection`, { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) onError(json.error ?? "Inspection failed");
    else onDone(json);
  }

  return (
    <div className="space-y-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
      <p className="font-medium">Supplier: upload the requested shots</p>
      {colorFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>Colour check — tap on a unit photo:</span>
          {colorFields.map((f) => (
            <span key={f.id} className="flex gap-1">
              {(["sample", "neutral"] as const).map((target) => (
                <button key={target} onClick={() => setMode({ fieldId: f.id, target })}
                  className={`rounded px-2 py-1 ${mode?.fieldId === f.id && mode.target === target ? "bg-neutral-900 text-white" : "bg-white text-neutral-900"}`}>
                  {target === "sample" ? `${f.attribute}: product colour` : "reference card white patch"}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {shots.map((s) => {
          const shotTaps = taps.filter((t) => t.shotId === s.id);
          return (
            <label key={s.id} className="block space-y-1 text-xs">
              <span className="font-mono">{s.id}</span>
              <input type="file" accept="image/*" capture="environment" className="block w-full text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const shrunk = await shrink(file);
                  setPhotos((p) => ({ ...p, [s.id]: shrunk }));
                }} />
              {photos[s.id] && (
                <span className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photos[s.id].url} alt={s.id} onClick={(e) => { e.preventDefault(); tap(s.id, e); }} className="w-full cursor-crosshair rounded" />
                  {shotTaps.flatMap((t) => [t.sample && ["sample", t.sample], t.neutral && ["neutral", t.neutral]].filter(Boolean) as [string, Point][]).map(([kind, p]) => (
                    <span key={kind} className={`pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${kind === "sample" ? "border-sky-500" : "border-white"}`}
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
                  ))}
                </span>
              )}
            </label>
          );
        })}
      </div>
      <button onClick={submit} disabled={busy || Object.keys(photos).length === 0}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Inspecting…" : "Submit for QC"}
      </button>
    </div>
  );
}
