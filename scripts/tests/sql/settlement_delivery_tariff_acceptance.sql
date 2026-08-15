\set ON_ERROR_STOP on

do $$
declare
  route_count integer;
begin
  select count(*)
  into route_count
  from public.delivery_pricing_rules
  where from_settlement = any(array['Цоци-Юрт', 'Гелдаган', 'Автуры', 'Курчалой', 'Мескер-Юрт'])
    and to_settlement = any(array['Цоци-Юрт', 'Гелдаган', 'Автуры', 'Курчалой', 'Мескер-Юрт']);

  if route_count <> 25 then
    raise exception 'Expected 25 cluster routes, got %', route_count;
  end if;

  if public.get_delivery_route_price(' цоци юрт ', 'ЦОЦИ‑ЮРТ') <> 200 then
    raise exception 'Same-settlement normalized price must be 200';
  end if;

  if public.get_delivery_route_price('Гелдаган', 'Цоци-Юрт') <> 300 then
    raise exception 'Geldagan to Tsotsi-Yurt price must be 300';
  end if;

  if public.get_delivery_route_price('Мескер-Юрт', 'Автуры') <> 600 then
    raise exception 'Mesker-Yurt to Avtury price must be 600';
  end if;

  if public.get_delivery_route_price('Автуры', 'Мескер-Юрт')
      <> public.get_delivery_route_price('Мескер-Юрт', 'Автуры') then
    raise exception 'Customer tariffs must be symmetric';
  end if;
end $$;

select
  count(*) as route_count,
  min(amount) as minimum_fee,
  max(amount) as maximum_fee
from public.delivery_pricing_rules
where from_settlement = any(array['Цоци-Юрт', 'Гелдаган', 'Автуры', 'Курчалой', 'Мескер-Юрт'])
  and to_settlement = any(array['Цоци-Юрт', 'Гелдаган', 'Автуры', 'Курчалой', 'Мескер-Юрт']);
