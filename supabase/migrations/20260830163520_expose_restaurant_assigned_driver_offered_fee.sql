-- The orders relation can be visible while its nested delivery relation is
-- hidden by RLS. The restaurant then hydrates the assigned driver through this
-- protected RPC, which must include the actual courier payout for an accurate
-- cash handover amount.
do $$
declare
  target_function regprocedure := pg_catalog.to_regprocedure(
    'public.get_restaurant_assigned_drivers(uuid)'
  );
  current_definition text;
  fixed_definition text;
begin
  if target_function is null then
    raise exception 'required function is missing: public.get_restaurant_assigned_drivers(uuid)';
  end if;

  select pg_catalog.pg_get_functiondef(target_function)
  into current_definition;

  fixed_definition := pg_catalog.replace(
    current_definition,
    $needle$'delivery_updated_at', delivery.updated_at,$needle$,
    $replacement$'delivery_updated_at', delivery.updated_at,
        'offered_fee', delivery.offered_fee,$replacement$
  );

  if fixed_definition is distinct from current_definition then
    execute fixed_definition;
  end if;

  if pg_catalog.strpos(
    (select procedure.prosrc from pg_catalog.pg_proc procedure where procedure.oid = target_function),
    $check$'offered_fee', delivery.offered_fee$check$
  ) = 0 then
    raise exception 'assigned-driver courier payout field is missing';
  end if;
end;
$$;

notify pgrst, 'reload schema';
