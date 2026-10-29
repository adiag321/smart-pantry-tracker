-- Phase 4 prerequisite, defined in Phase 1 alongside the schema: deducts
-- `amount` of a product's inventory starting from the oldest batch
-- (purchase_date ascending), rolling over to the next-oldest batch when one
-- hits zero. Runs as a single function invocation so Postgres executes it
-- atomically, avoiding the race condition that sequential app-layer
-- read-then-write calls would have if used from two devices at once.
--
-- Raises an exception if the product does not have enough total quantity
-- remaining across all batches, so the caller's transaction rolls back
-- rather than leaving a partial deduction.
create or replace function deduct_inventory_fifo(
  p_product_id uuid,
  p_amount numeric
) returns void as $$
declare
  remaining_to_deduct numeric := p_amount;
  batch record;
begin
  if p_amount <= 0 then
    raise exception 'Deduction amount must be positive';
  end if;

  for batch in
    select batch_id, quantity_remaining
    from inventory_batches
    where product_id = p_product_id
      and quantity_remaining > 0
    order by purchase_date asc
    for update
  loop
    if remaining_to_deduct <= 0 then
      exit;
    end if;

    if batch.quantity_remaining >= remaining_to_deduct then
      update inventory_batches
      set quantity_remaining = quantity_remaining - remaining_to_deduct
      where batch_id = batch.batch_id;
      remaining_to_deduct := 0;
    else
      remaining_to_deduct := remaining_to_deduct - batch.quantity_remaining;
      update inventory_batches
      set quantity_remaining = 0
      where batch_id = batch.batch_id;
    end if;
  end loop;

  if remaining_to_deduct > 0 then
    raise exception
      'Insufficient inventory for product %: short by %',
      p_product_id, remaining_to_deduct;
  end if;
end;
$$ language plpgsql;
