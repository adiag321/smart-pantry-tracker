"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkline } from "@/components/Sparkline";

type Batch = {
  batch_id: string;
  product_id: string;
  quantity_remaining: number;
  unit: string;
  purchase_date: string;
  expiry_date: string | null;
  useSoon: boolean;
  products: { name: string; store: "Walmart" | "HEB" } | null;
};

type RecipeMatch = {
  recipe: { id: string; title: string };
  missing: { ingredient: string; required: number; available: number; unit: string | null }[];
};

type PriceHistory = { price: number; recorded_at: string }[];

export default function PantryPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [ready, setReady] = useState<RecipeMatch[]>([]);
  const [almost, setAlmost] = useState<RecipeMatch[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, PriceHistory>>({});

  useEffect(() => {
    async function load() {
      const [pantryRes, cookRes] = await Promise.all([
        fetch("/api/pantry"),
        fetch("/api/recipes/ready-to-cook"),
      ]);
      const pantryData = await pantryRes.json();
      const cookData = await cookRes.json();
      if (pantryRes.ok) setBatches(pantryData.batches);
      if (cookRes.ok) {
        setReady(cookData.ready);
        setAlmost(cookData.almost);
      }

      const productIds: string[] = Array.from(
        new Set((pantryData.batches ?? []).map((b: Batch) => b.product_id)),
      );
      const entries = await Promise.all(
        productIds.map(async (id) => {
          const res = await fetch(`/api/products/${id}/price-history`);
          const data = await res.json();
          return [id, res.ok ? data.history : []] as const;
        }),
      );
      setSparklines(Object.fromEntries(entries));
    }
    load();
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pantry</h1>
        <Link href="/pantry/scan" className="rounded bg-black px-3 py-2 text-sm text-white">
          Scan to log purchase
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 font-medium">Use soon</h2>
        <ul className="divide-y rounded-lg border">
          {batches?.map((b) => (
            <li key={b.batch_id} className="flex justify-between gap-3 px-4 py-2 text-sm">
              <span>
                {b.products?.name ?? "Unknown product"}{" "}
                <span className="text-neutral-500">
                  ({b.quantity_remaining} {b.unit})
                </span>
              </span>
              <span className="flex items-center gap-3">
                {sparklines[b.product_id] && <Sparkline history={sparklines[b.product_id]} />}
                <span className={b.useSoon ? "font-medium text-red-700" : "text-neutral-500"}>
                  {b.expiry_date
                    ? new Date(b.expiry_date).toLocaleDateString()
                    : "no expiry set"}
                </span>
              </span>
            </li>
          ))}
          {batches && batches.length === 0 && (
            <li className="px-4 py-2 text-sm text-neutral-500">No inventory logged yet.</li>
          )}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-medium">Ready to cook</h2>
        <ul className="divide-y rounded-lg border">
          {ready.map((r) => (
            <li key={r.recipe.id} className="px-4 py-2 text-sm">
              <Link href={`/recipes/${r.recipe.id}`} className="underline">
                {r.recipe.title}
              </Link>
            </li>
          ))}
          {ready.length === 0 && (
            <li className="px-4 py-2 text-sm text-neutral-500">
              Nothing fully stocked yet.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Almost there</h2>
        <ul className="divide-y rounded-lg border">
          {almost.map((r) => (
            <li key={r.recipe.id} className="px-4 py-2 text-sm">
              <Link href={`/recipes/${r.recipe.id}`} className="underline">
                {r.recipe.title}
              </Link>
              <p className="mt-1 text-neutral-500">
                Missing: {r.missing.map((m) => m.ingredient).join(", ")}
              </p>
            </li>
          ))}
          {almost.length === 0 && (
            <li className="px-4 py-2 text-sm text-neutral-500">Nothing close yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
