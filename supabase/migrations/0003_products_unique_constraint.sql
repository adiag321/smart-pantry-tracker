-- Phase 2 prerequisite: the weekly scraper upserts products by (name,
-- store), which requires a unique constraint for Postgres's ON CONFLICT
-- to target.
alter table products
  add constraint products_name_store_unique unique (name, store);
