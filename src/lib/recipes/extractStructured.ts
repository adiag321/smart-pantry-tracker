import * as cheerio from "cheerio";
import { parseIngredientLine } from "./parseIngredientLine";
import type { ParsedRecipe } from "./types";

type JsonLdNode = Record<string, unknown>;

// Some sites embed literal HTML entities inside JSON-LD string fields (e.g.
// "375&deg;F"); decode them so saved recipes read correctly.
function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return cheerio.load(`<div>${text}</div>`)("div").text();
}

function isRecipeNode(node: unknown): node is JsonLdNode {
  if (!node || typeof node !== "object") return false;
  const type = (node as JsonLdNode)["@type"];
  if (typeof type === "string") return type === "Recipe";
  if (Array.isArray(type)) return type.includes("Recipe");
  return false;
}

// schema.org Recipe allows recipeInstructions as a plain string, an array of
// strings, or an array of HowToStep/HowToSection objects (which can nest).
function flattenInstructions(value: unknown): string {
  if (typeof value === "string") return decodeEntities(value);
  if (Array.isArray(value)) {
    return value.map(flattenInstructions).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    const node = value as JsonLdNode;
    if (typeof node.text === "string") return decodeEntities(node.text);
    if (node.itemListElement) return flattenInstructions(node.itemListElement);
  }
  return "";
}

function extractIngredients(value: unknown) {
  const lines = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
  return lines.map((l) => parseIngredientLine(decodeEntities(l)));
}

// Walks a JSON-LD document looking for a Recipe node - top-level, inside
// `@graph`, or nested under `mainEntity` (used by some sites' Article/
// WebPage wrappers).
function findRecipeNode(data: unknown): JsonLdNode | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (isRecipeNode(data)) return data as JsonLdNode;

  const node = data as JsonLdNode;
  if (node["@graph"]) return findRecipeNode(node["@graph"]);
  if (node.mainEntity) return findRecipeNode(node.mainEntity);
  return null;
}

export async function extractStructured(
  html: string,
): Promise<ParsedRecipe | null> {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (const el of scripts.toArray()) {
    const raw = $(el).contents().text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }

    const recipe = findRecipeNode(data);
    if (!recipe) continue;

    const title = typeof recipe.name === "string" ? decodeEntities(recipe.name) : null;
    if (!title) continue;

    return {
      title,
      instructions: flattenInstructions(recipe.recipeInstructions) || "",
      ingredients: extractIngredients(recipe.recipeIngredient),
    };
  }

  return null;
}
