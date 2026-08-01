alter table public.asphalt_road_corridors
add column if not exists group_name text not null default 'Без группы'
check (char_length(trim(group_name)) between 1 and 120);

comment on column public.asphalt_road_corridors.group_name is
  'Settlement or administrative group used to organize manually confirmed asphalt corridors.';

create index if not exists asphalt_road_corridors_group_name_idx
on public.asphalt_road_corridors (group_name);
