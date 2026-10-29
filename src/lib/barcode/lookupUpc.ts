export type UpcLookupResult = {
  name: string;
  quantity: string | null;
};

// Open Food Facts (PRD section 3F) - free, no API key, no rate-limit
// registration required. Used only to auto-fill a product name/size when
// scanning a new barcode; if the UPC isn't in their database the caller
// falls back to manual entry with the UPC pre-filled.
export async function lookupUpc(upc: string): Promise<UpcLookupResult | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json?fields=product_name,quantity`,
    { headers: { "User-Agent": "SmartPantryTracker/1.0 - personal use" } },
  );
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product?.product_name) return null;

  return {
    name: data.product.product_name,
    quantity: data.product.quantity ?? null,
  };
}
