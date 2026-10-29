"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Recipe = {
  id: string;
  title: string;
  source_url: string | null;
  instructions: string;
  extraction_method: "structured" | "llm" | "readability" | null;
  recipe_ingredients: {
    id: string;
    standardized_name: string;
    required_quantity: number;
    unit: string;
  }[];
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadRecipes() {
    const res = await fetch("/api/recipes");
    const data = await res.json();
    if (res.ok) setRecipes(data.recipes);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadRecipes();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to extract recipe");
      return;
    }

    setUrl("");
    loadRecipes();
  }

  const query = search.trim().toLowerCase();
  const visibleRecipes = query
    ? recipes.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.recipe_ingredients.some((i) =>
            i.standardized_name.toLowerCase().includes(query),
          ),
      )
    : recipes;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold">Recipes</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Paste a recipe URL - structured data is tried first, then an LLM
        fallback, then a plain-text best-effort extraction.
      </p>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-3 rounded-lg border p-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/some-recipe"
          type="url"
          className="flex-1 rounded border px-3 py-2"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Extracting…" : "Add"}
        </button>
      </form>
      {error && <p className="mb-6 text-sm text-red-600">{error}</p>}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium">Saved recipes</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or ingredient…"
          className="w-56 rounded border px-3 py-1.5 text-sm"
        />
      </div>
      <ul className="flex flex-col gap-3">
        {visibleRecipes.map((r) => (
          <li key={r.id} className="rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/recipes/${r.id}`} className="font-medium underline">
                {r.title}
              </Link>
              <span className="text-xs text-neutral-500">{r.extraction_method}</span>
            </div>
            {r.recipe_ingredients.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-neutral-600">
                {r.recipe_ingredients.map((i) => (
                  <li key={i.id}>
                    {i.required_quantity || ""} {i.unit} {i.standardized_name}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-600">
              {r.instructions.slice(0, 300)}
              {r.instructions.length > 300 ? "…" : ""}
            </p>
          </li>
        ))}
        {visibleRecipes.length === 0 && recipes.length > 0 && (
          <li className="text-sm text-neutral-500">No recipes match &quot;{search}&quot;.</li>
        )}
        {recipes.length === 0 && (
          <li className="text-sm text-neutral-500">No recipes saved yet.</li>
        )}
      </ul>
    </main>
  );
}
