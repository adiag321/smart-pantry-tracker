export type Database = {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          store: "Walmart" | "HEB";
          aisle: string | null;
          price: number | null;
          barcode: string | null;
          last_updated: string;
        };
        Insert: {
          id?: string;
          name: string;
          store: "Walmart" | "HEB";
          aisle?: string | null;
          price?: number | null;
          barcode?: string | null;
          last_updated?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      price_history: {
        Row: {
          id: string;
          product_id: string;
          price: number;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          price: number;
          recorded_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["price_history"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_batches: {
        Row: {
          batch_id: string;
          product_id: string;
          quantity_remaining: number;
          unit: string;
          purchase_date: string;
          expiry_date: string | null;
        };
        Insert: {
          batch_id?: string;
          product_id: string;
          quantity_remaining: number;
          unit: string;
          purchase_date?: string;
          expiry_date?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["inventory_batches"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          id: string;
          title: string;
          source_url: string | null;
          instructions: string;
          extraction_method: "structured" | "llm" | "readability" | null;
        };
        Insert: {
          id?: string;
          title: string;
          source_url?: string | null;
          instructions: string;
          extraction_method?: "structured" | "llm" | "readability" | null;
        };
        Update: Partial<Database["public"]["Tables"]["recipes"]["Insert"]>;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          standardized_name: string;
          required_quantity: number;
          unit: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          standardized_name: string;
          required_quantity: number;
          unit: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_ingredients"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      deduct_inventory_fifo: {
        Args: { p_product_id: string; p_amount: number };
        Returns: void;
      };
    };
  };
};
