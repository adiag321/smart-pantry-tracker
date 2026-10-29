export type ParsedIngredient = {
  name: string;
  amount: number | null;
  unit: string | null;
};

export type ParsedRecipe = {
  title: string;
  instructions: string;
  ingredients: ParsedIngredient[];
};

export type ExtractionMethod = "structured" | "llm" | "readability";
