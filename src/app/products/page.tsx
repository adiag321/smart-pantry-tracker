"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  store: "Walmart" | "HEB";
  aisle: string | null;
  price: number | null;
  last_updated: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [store, setStore] = useState<"Walmart" | "HEB">("Walmart");
  const [aisle, setAisle] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  async function loadProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    if (res.ok) setProducts(data.products);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadProducts();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        store,
        aisle: aisle || null,
        price: parseFloat(price),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }

    setName("");
    setAisle("");
    setPrice("");
    loadProducts();
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold">Update prices</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Entered manually - Walmart and H-E-B both block automated price
        scraping, so this is the weekly data entry step.
      </p>

      <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-3 rounded-lg border p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name (e.g. H-E-B Whole Milk)"
          className="rounded border px-3 py-2"
          required
        />
        <div className="flex gap-3">
          <select
            value={store}
            onChange={(e) => setStore(e.target.value as "Walmart" | "HEB")}
            className="rounded border px-3 py-2"
          >
            <option value="Walmart">Walmart</option>
            <option value="HEB">HEB</option>
          </select>
          <input
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
            placeholder="Aisle (e.g. Dairy - A12)"
            className="flex-1 rounded border px-3 py-2"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            type="number"
            step="0.01"
            min="0"
            className="w-28 rounded border px-3 py-2"
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>

      <h2 className="mb-2 font-medium">Current products</h2>
      <ul className="divide-y rounded-lg border">
        {products.map((p) => (
          <li key={p.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
            <span>
              {p.name} <span className="text-neutral-500">({p.store})</span>
            </span>
            <span className="text-neutral-500">{p.aisle ?? "—"}</span>
            <span>{p.price != null ? `$${p.price.toFixed(2)}` : "—"}</span>
          </li>
        ))}
        {products.length === 0 && (
          <li className="px-4 py-2 text-sm text-neutral-500">No products yet.</li>
        )}
      </ul>
    </main>
  );
}
