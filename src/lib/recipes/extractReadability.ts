import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { parseIngredientLine } from "./parseIngredientLine";
import type { ParsedRecipe } from "./types";

const INGREDIENTS_HEADING = /^\s*ingredients\s*:?\s*$/im;
const INSTRUCTIONS_HEADING = /^\s*(instructions|directions|method|steps)\s*:?\s*$/im;

// Last-resort fallback when a page has no JSON-LD Recipe data and the LLM
// step either isn't configured or failed. Readability gives us clean
// article text, but recovering structured ingredients from it is a
// heuristic, not a guarantee - this looks for "Ingredients" / "Instructions"
// section headings in the plain text and splits on them. If those headings
// aren't found, ingredients comes back empty and the full text lands in
// `instructions` so the user still has something to read, rather than
// nothing at all.
export function extractReadability(
  html: string,
  url: string,
): ParsedRecipe | null {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent) return null;

  const text = article.textContent.trim();
  const ingredientsMatch = text.match(INGREDIENTS_HEADING);
  const instructionsMatch = text.match(INSTRUCTIONS_HEADING);

  let ingredientsBlock = "";
  let instructions = text;

  if (ingredientsMatch && instructionsMatch) {
    const ingredientsStart = ingredientsMatch.index! + ingredientsMatch[0].length;
    const instructionsStart = instructionsMatch.index!;
    if (instructionsStart > ingredientsStart) {
      ingredientsBlock = text.slice(ingredientsStart, instructionsStart);
      instructions = text.slice(instructionsStart + instructionsMatch[0].length).trim();
    }
  }

  const ingredients = ingredientsBlock
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine);

  return {
    title: article.title || "Untitled recipe",
    instructions: instructions || text,
    ingredients,
  };
}
