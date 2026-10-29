import Link from "next/link";

const LINKS = [
  { href: "/pantry", label: "Pantry", description: "Use-soon alerts, ready-to-cook recipes, price trends" },
  { href: "/pantry/scan", label: "Log a purchase", description: "Scan a barcode or enter inventory manually" },
  { href: "/recipes", label: "Recipes", description: "Parse a recipe URL, cook it, or build a shopping list" },
  { href: "/products", label: "Products", description: "Manual price/aisle entry for Walmart and H-E-B" },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Smart Pantry and Grocery Tracker</h1>
      <nav className="flex flex-col gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border p-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <div className="font-medium">{link.label}</div>
            <div className="text-sm text-neutral-500">{link.description}</div>
          </Link>
        ))}
      </nav>
    </main>
  );
}
