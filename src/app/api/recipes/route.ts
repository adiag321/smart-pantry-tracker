import { NextResponse, type NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractStructured } from "@/lib/recipes/extractStructured";
import { extractLLM } from "@/lib/recipes/extractLLM";
import { extractReadability } from "@/lib/recipes/extractReadability";
import type { ExtractionMethod, ParsedRecipe } from "@/lib/recipes/types";

function extractPageText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function saveRecipe(
  parsed: ParsedRecipe,
  sourceUrl: string,
  method: ExtractionMethod,
) {
  const supabase = createAdminClient();

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      title: parsed.title,
      source_url: sourceUrl,
      instructions: parsed.instructions,
      extraction_method: method,
    })
    .select()
    .single();

  if (recipeError) throw new Error(recipeError.message);

  if (parsed.ingredients.length > 0) {
    const { error: ingredientsError } = await supabase
      .from("recipe_ingredients")
      .insert(
        parsed.ingredients.map((i) => ({
          recipe_id: recipe.id,
          standardized_name: i.name,
          required_quantity: i.amount ?? 0,
          unit: i.unit ?? "",
        })),
      );
    if (ingredientsError) throw new Error(ingredientsError.message);
  }

  return recipe;
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .order("title");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ recipes: data });
}

// Recipe ingestion (PRD section 3B): check DB first, then try extraction
// engines in order - structured JSON-LD (no API cost, no rate limit), LLM
// (only for sites without structured data), Readability DOM parsing as a
// last resort so the user gets something even if both prior steps fail.
export async function POST(request: NextRequest) {
  const { url } = await request.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("source_url", url)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ recipe: existing, cached: true });
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartPantryBot/1.0)" },
    });
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch URL: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  let parsed: ParsedRecipe | null = null;
  let method: ExtractionMethod = "structured";

  try {
    parsed = await extractStructured(html);
  } catch (err) {
    console.error("Structured extraction failed:", err);
  }

  if (!parsed) {
    method = "llm";
    try {
      parsed = await extractLLM(extractPageText(html));
    } catch (err) {
      console.error("LLM extraction failed:", err);
    }
  }

  if (!parsed) {
    method = "readability";
    try {
      parsed = extractReadability(html, url);
    } catch (err) {
      console.error("Readability extraction failed:", err);
    }
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "Could not extract a recipe from this URL" },
      { status: 422 },
    );
  }

  try {
    const recipe = await saveRecipe(parsed, url, method);
    return NextResponse.json({ recipe, cached: false, extraction_method: method });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
