-- NULLIF is SQL conditional syntax rather than a pg_catalog function. The
-- qualified form made secure order finalization fail after the inner order
-- insert, causing the complete transaction to roll back before WhatsApp.
--
-- Rebuild only the two affected functions from their installed definitions so
-- this corrective migration remains safe both for existing deployments and
-- clean databases where the source migration is already corrected.
do $$
declare
  target_signature text;
  target_function regprocedure;
  current_definition text;
  fixed_definition text;
begin
  foreach target_signature in array array[
    'public.finish_secure_client_order(uuid,uuid,text,boolean,text,text,text,text,boolean,text,text)',
    'public.activate_current_driver(jsonb)'
  ] loop
    target_function := pg_catalog.to_regprocedure(target_signature);

    if target_function is null then
      raise exception 'required function is missing: %', target_signature;
    end if;

    select pg_catalog.pg_get_functiondef(target_function)
    into current_definition;

    fixed_definition := pg_catalog.replace(
      current_definition,
      'pg_catalog.' || 'nullif(',
      'nullif('
    );

    if fixed_definition is distinct from current_definition then
      execute fixed_definition;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid in (
      pg_catalog.to_regprocedure(
        'public.finish_secure_client_order(uuid,uuid,text,boolean,text,text,text,text,boolean,text,text)'
      ),
      pg_catalog.to_regprocedure('public.activate_current_driver(jsonb)')
    )
      and pg_catalog.strpos(
        procedure.prosrc,
        'pg_catalog.' || 'nullif('
      ) > 0
  ) then
    raise exception 'schema-qualified NULLIF remains in a protected function';
  end if;
end;
$$;

notify pgrst, 'reload schema';
