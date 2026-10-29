-- Phase 1: core schema (PRD section 4)
create extension if not exists "pgcrypto";

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  store text not null check (store in ('Walmart', 'HEB')),
  aisle text,
  price numeric(10, 2),
  barcode text,
  last_updated timestamptz not null default now()
);

create table price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  price numeric(10, 2) not null,
  recorded_at timestamptz not null default now()
);
create index price_history_product_id_idx on price_history (product_id);

create table inventory_batches (
  batch_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  quantity_remaining numeric(10, 2) not null check (quantity_remaining >= 0),
  unit text not null,
  purchase_date timestamptz not null default now(),
  expiry_date timestamptz
);
create index inventory_batches_product_id_purchase_date_idx
  on inventory_batches (product_id, purchase_date);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  instructions text not null,
  extraction_method text check (
    extraction_method in ('structured', 'llm', 'readability')
  )
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes (id) on delete cascade,
  standardized_name text not null,
  required_quantity numeric(10, 2) not null,
  unit text not null
);
create index recipe_ingredients_recipe_id_idx on recipe_ingredients (recipe_id);
