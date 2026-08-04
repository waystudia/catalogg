do $$
declare
  v_catalog_id uuid;
begin
  select id into v_catalog_id
  from public.catalogs
  where slug = 'mangal';

  if v_catalog_id is null then
    raise exception 'Catalog mangal was not found';
  end if;

  update public.catalog_sections as section
  set settings = jsonb_set(
        coalesce(section.settings, '{}'::jsonb),
        '{images}',
        coalesce(
          (
            select jsonb_agg(
              to_jsonb(
                case
                  when image ~ '^https?://' or image like '/media/unsplash/%'
                    then '/assets/mangal-demo/cover.webp'
                  else image
                end
              )
              order by ordinal
            )
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(section.settings -> 'images') = 'array'
                  then section.settings -> 'images'
                else '[]'::jsonb
              end
            ) with ordinality as gallery(image, ordinal)
          ),
          jsonb_build_array('/assets/mangal-demo/cover.webp')
        ),
        true
      )
  where section.catalog_id = v_catalog_id
    and section.key = 'restaurant-gallery';
end $$;
