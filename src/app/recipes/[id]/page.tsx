"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";

type Recipe = {
  id: string;
  title: string;
  source_url: string | null;
  instructions: string;
  recipe_ingredients: {
    id: string;
    standardized_name: string;
    required_quantity: number;
    unit: string;
  }[];
};

type CookResult = {
  ingredient: string;
  status: "deducted" | "no_product_match" | "no_inventory" | "unit_mismatch" | "insufficient";
  detail?: string;
};

type ShoppingItem = {
  ingredient: string;
  neededQuantity: number;
  unit: string | null;
  store: "Walmart" | "HEB" | null;
  aisle: string | null;
  price: number | null;
};

const STATUS_LABEL: Record<CookResult["status"], string> = {
  deducted: "Deducted from pantry",
  no_product_match: "No matching product in your list",
  no_inventory: "No stock on hand",
  unit_mismatch: "Can't convert units",
  insufficient: "Not enough in stock",
};

function RecipeDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [cookResults, setCookResults] = useState<CookResult[] | null>(null);
  const [shoppingList, setShoppingList] = useState<Record<string, ShoppingItem[]> | null>(null);
  const [loading, setLoading] = useState<"cook" | "list" | null>(null);

  useEffect(() => {
    fetch(`/api/recipes/${id}`)
      .then((res) => res.json())
      .then((data) => setRecipe(data.recipe ?? null));
  }, [id]);

  async function handleCook() {
    setLoading("cook");
    setCookResults(null);
    const res = await fetch(`/api/recipes/${id}/cook`, { method: "POST" });
    const data = await res.json();
    setLoading(null);
    if (res.ok) setCookResults(data.results);
  }

  async function handleShoppingList() {
    setLoading("list");
    setShoppingList(null);
    const res = await fetch(`/api/recipes/${id}/shopping-list`);
    const data = await res.json();
    setLoading(null);
    if (res.ok) setShoppingList(data.groupedByStore);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/recipes" className="mb-4 inline-block text-sm text-neutral-500 underline">
        ← All recipes
      </Link>

      {recipe && (
        <div className="mb-6">
          <h1 className="text-lg font-semibold">{recipe.title}</h1>
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-500 underline"
            >
              original source
            </a>
          )}
          {recipe.recipe_ingredients.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
              {recipe.recipe_ingredients.map((i) => (
                <li key={i.id}>
                  {i.required_quantity || ""} {i.unit} {i.standardized_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-6 flex gap-3">
        <button
          onClick={handleCook}
          disabled={loading !== null}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {loading === "cook" ? "Cooking…" : "Cook this recipe"}
        </button>
        <button
          onClick={handleShoppingList}
          disabled={loading !== null}
          className="rounded border px-3 py-2 disabled:opacity-50"
        >
          {loading === "list" ? "Calculating…" : "Shopping list"}
        </button>
      </div>

      {cookResults && (
        <div className="mb-6 rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Cook results</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {cookResults.map((r, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{r.ingredient}</span>
                <span
                  className={r.status === "deducted" ? "text-green-700" : "text-amber-700"}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shoppingList && (
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Shopping list</h2>
          {Object.keys(shoppingList).length === 0 && (
            <p className="text-sm text-neutral-500">Everything needed is already in stock.</p>
          )}
          {Object.entries(shoppingList).map(([store, items]) => {
            const priced = items.filter((item) => item.price != null);
            const subtotal = priced.reduce((sum, item) => sum + (item.price ?? 0), 0);
            return (
              <div key={store} className="mb-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">{store}</h3>
                  {priced.length > 0 && (
                    <span className="text-xs text-neutral-500">
                      est. ${subtotal.toFixed(2)}
                      {priced.length < items.length ? ` (+${items.length - priced.length} unpriced)` : ""}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {item.neededQuantity.toFixed(2)} {item.unit || ""} {item.ingredient}
                      </span>
                      <span className="text-neutral-500">
                        {item.aisle || "aisle unknown"}
                        {item.price != null ? ` · $${item.price.toFixed(2)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-2xl p-6">Loading…</main>}>
      <RecipeDetailContent params={params} />
    </Suspense>
  );
}
