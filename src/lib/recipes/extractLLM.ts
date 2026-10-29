import type { ParsedIngredient, ParsedRecipe } from "./types";

const SYSTEM_PROMPT =
  "Extract the recipe title, instructions, and ingredients. Return ONLY a " +
  'valid JSON object with keys: title, instructions, ingredients (array of ' +
  "objects with name, amount, unit). instructions should be plain text with " +
  "steps separated by newlines. amount should be a number or null; unit " +
  "should be a short string (e.g. \"cup\", \"oz\") or null.";

// Page text is truncated before being sent to any provider - keeps token
// usage (and cost/rate-limit pressure) down, and recipe pages rarely need
// more than this to extract title/ingredients/instructions.
const MAX_PAGE_TEXT_CHARS = 12_000;

function buildUserPrompt(pageText: string): string {
  return `Recipe page content:\n\n${pageText.slice(0, MAX_PAGE_TEXT_CHARS)}`;
}

function normalizeIngredient(raw: unknown): ParsedIngredient | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name : null;
  if (!name) return null;
  return {
    name,
    amount: typeof obj.amount === "number" ? obj.amount : null,
    unit: typeof obj.unit === "string" ? obj.unit : null,
  };
}

function parseModelJson(raw: string): ParsedRecipe | null {
  // Models sometimes wrap JSON in markdown code fences despite instructions
  // not to - strip those before parsing rather than failing outright.
  const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title : null;
  const instructions = typeof obj.instructions === "string" ? obj.instructions : null;
  if (!title || !instructions) return null;

  const ingredients = Array.isArray(obj.ingredients)
    ? obj.ingredients.map(normalizeIngredient).filter((i): i is ParsedIngredient => i !== null)
    : [];

  return { title, instructions, ingredients };
}

async function tryGroq(pageText: string): Promise<ParsedRecipe | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const { default: Groq } = await import("groq-sdk");
  const client = new Groq({ apiKey });
  const completion = await client.chat.completions.create({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(pageText) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  return content ? parseModelJson(content) : null;
}

async function tryGemini(pageText: string): Promise<ParsedRecipe | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    contents: buildUserPrompt(pageText),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    },
  });

  return response.text ? parseModelJson(response.text) : null;
}

async function tryOpenRouter(pageText: string): Promise<ParsedRecipe | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
  const completion = await client.chat.completions.create({
    // "openrouter/free" randomly routes across OpenRouter's free-tier model
    // pool, so this default doesn't go stale when any one free model is
    // deprecated - override via OPENROUTER_MODEL to pin a specific one.
    model: process.env.OPENROUTER_MODEL || "openrouter/free",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(pageText) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  return content ? parseModelJson(content) : null;
}

async function tryNvidia(pageText: string): Promise<ParsedRecipe | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, baseURL: "https://integrate.api.nvidia.com/v1" });
  const completion = await client.chat.completions.create({
    model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(pageText) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  return content ? parseModelJson(content) : null;
}

// Tries every LLM provider that has an API key configured, in order, and
// returns the first successful parse. None configured (or all fail/rate
// limited) returns null so the caller falls through to the Readability
// extractor - this is the fallback step, not the primary extraction path.
export async function extractLLM(pageText: string): Promise<ParsedRecipe | null> {
  const providers = [tryGroq, tryGemini, tryOpenRouter, tryNvidia];

  for (const provider of providers) {
    try {
      const result = await provider(pageText);
      if (result) return result;
    } catch (err) {
      console.error(`LLM provider ${provider.name} failed:`, err);
    }
  }

  return null;
}
