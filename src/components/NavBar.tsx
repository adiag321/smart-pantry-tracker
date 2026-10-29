"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/pantry", label: "Pantry" },
  { href: "/pantry/scan", label: "Scan" },
  { href: "/recipes", label: "Recipes" },
  { href: "/products", label: "Products" },
];

export function NavBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto px-6 py-3 text-sm">
        <Link href="/pantry" className="mr-2 font-semibold whitespace-nowrap">
          Smart Pantry
        </Link>
        {LINKS.map((link) => {
          const active =
            link.href === "/pantry"
              ? pathname === "/pantry"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded px-3 py-1.5 ${
                active
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
