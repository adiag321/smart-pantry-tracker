"use client";

import { useEffect, useRef, useState } from "react";

type LookupResult = {
  upc: string;
  source: "products" | "openfoodfacts" | "none";
  name?: string;
  product?: { name: string; store: "Walmart" | "HEB"; id: string };
};

// Camera-based barcode scanning (PRD section 3F). Prefers the native
// `BarcodeDetector` API (Chrome/Edge/Android); falls back to @zxing/browser
// (pure-JS decoder over the same camera stream) for Safari/iOS and Firefox,
// which don't implement BarcodeDetector as of writing.
export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [upc, setUpc] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [store, setStore] = useState<"Walmart" | "HEB">("Walmart");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("ea");
  const [expiryDate, setExpiryDate] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let detectInterval: ReturnType<typeof setInterval> | null = null;
    let zxingControls: { stop: () => void } | null = null;

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (stopped || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if ("BarcodeDetector" in window) {
        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector: new (opts: { formats: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
        const detector = new BarcodeDetectorCtor({ formats: ["ean_13", "upc_a", "upc_e"] });
        detectInterval = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]) handleDetected(codes[0].rawValue);
          } catch {
            // transient decode failure on a mid-motion frame - just retry next tick
          }
        }, 500);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
          if (result) handleDetected(result.getText());
        });
      }
    }

    start().catch((err) => setError((err as Error).message));

    return () => {
      stopped = true;
      if (detectInterval) clearInterval(detectInterval);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDetected is stable enough for this effect's lifetime
  }, [scanning]);

  async function handleDetected(code: string) {
    setScanning(false);
    setUpc(code);
    await runLookup(code);
  }

  async function runLookup(code: string) {
    setError("");
    setSaved(false);
    const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
    const data = await res.json();
    setLookup(data);

    if (res.ok && data.source === "products") {
      setName(data.product.name);
      setStore(data.product.store);
    } else if (res.ok && data.source === "openfoodfacts") {
      setName(data.name);
    } else {
      setName("");
      setError("Barcode not found - enter the product manually.");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const body: Record<string, unknown> = {
      quantity: parseFloat(quantity),
      unit,
      expiryDate: expiryDate || null,
      barcode: upc || undefined,
    };
    if (lookup?.source === "products" && lookup.product) {
      body.productId = lookup.product.id;
    } else {
      body.name = name;
      body.store = store;
    }

    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }

    setSaved(true);
    setUpc("");
    setLookup(null);
    setName("");
    setQuantity("1");
    setExpiryDate("");
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold">Log a purchase</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Scan a barcode to auto-fill the product, or enter it manually below.
      </p>

      {!scanning && (
        <button
          onClick={() => setScanning(true)}
          className="mb-6 rounded bg-black px-3 py-2 text-sm text-white"
        >
          Start camera scan
        </button>
      )}

      {scanning && (
        <div className="mb-6">
          <video ref={videoRef} className="w-full rounded-lg border" muted playsInline />
          <button
            onClick={() => setScanning(false)}
            className="mt-2 rounded border px-3 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <input
          value={upc}
          onChange={(e) => setUpc(e.target.value)}
          placeholder="Or type a UPC"
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          onClick={() => upc && runLookup(upc)}
          className="rounded border px-3 py-2 text-sm"
        >
          Look up
        </button>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-lg border p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          className="rounded border px-3 py-2"
          required
        />
        <div className="flex gap-3">
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as "Walmart" | "HEB")}
            disabled={lookup?.source === "products"}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            <option value="Walmart">Walmart</option>
            <option value="HEB">HEB</option>
          </select>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            type="number"
            step="any"
            min="0"
            placeholder="Quantity"
            className="w-24 rounded border px-3 py-2"
            required
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Unit (e.g. ea, g, cup)"
            className="w-32 rounded border px-3 py-2"
            required
          />
        </div>
        <label className="text-sm text-neutral-500">
          Expiry date (optional)
          <input
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            type="date"
            className="mt-1 block rounded border px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">Saved to pantry.</p>}
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save to pantry
        </button>
      </form>
    </main>
  );
}
