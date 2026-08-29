select pg_advisory_xact_lock(hashtextextended('photo-products-20260829', 0));

create temporary table photo_import_candidates (
  id uuid primary key,
  category_id uuid not null,
  title text not null,
  brand text not null,
  description text not null,
  net_content_value numeric(12, 3) not null,
  net_content_unit text not null,
  media_id uuid not null,
  media_path text not null,
  media_width integer not null,
  media_height integer not null,
  quality_score numeric(5, 4) not null,
  observed_on text not null,
  image_kind text not null,
  reference_url text not null default ''
) on commit drop;

insert into photo_import_candidates values
  ('3fccc0c4-2cd7-4024-a189-a2e22f7f1340', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Барбекю, 50 г', 'Drive Chips', 'Картофельные чипсы со вкусом барбекю.', 50, 'g', '8f7bf680-274a-49be-a49d-e06539b5e1a0', 'drive-bbq.jpg', 800, 800, 0.7800, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('ae2c6d89-db94-4873-9a12-a7ae2fc6dd35', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Барбекю, 100 г', 'Drive Chips', 'Картофельные чипсы со вкусом барбекю.', 100, 'g', 'ddfa7ce9-9212-42ee-a4e2-212e08f8464e', 'drive-bbq.jpg', 800, 800, 0.7800, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('f425c6c9-edf4-4216-ac04-86c24cdcdf15', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Сметана и сыр, 50 г', 'Drive Chips', 'Картофельные чипсы со вкусом сметаны и сыра.', 50, 'g', 'd965e523-25ad-456e-aa70-c82f4b3fa078', 'drive-sour-cream-cheese.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('7b50b178-de93-48f9-8f3f-ea6d3853c850', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Сметана и сыр, 100 г', 'Drive Chips', 'Картофельные чипсы со вкусом сметаны и сыра.', 100, 'g', '553b0a84-b92c-4727-8e68-f28fa200a5e9', 'drive-sour-cream-cheese.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('e1f9253c-5414-4f9a-84d3-ecc2846e0788', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Мексиканский перец, 100 г', 'Drive Chips', 'Картофельные чипсы со вкусом мексиканского перца.', 100, 'g', 'c19a32b5-32de-4f6e-b743-1103c1ab3702', 'drive-mexican-pepper.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('527da44e-55c9-4479-9d40-f1a252eedc06', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Сметана и лук, 50 г', 'Drive Chips', 'Картофельные чипсы со вкусом сметаны и лука.', 50, 'g', '59d2abae-c060-4254-bb3f-41067dc2d446', 'drive-sour-cream-onion.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('048e6862-6582-4b5b-9eaa-cf42d920b880', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Сметана и лук, 100 г', 'Drive Chips', 'Картофельные чипсы со вкусом сметаны и лука.', 100, 'g', '037330ea-42f6-470f-8e5b-3acb846c66c7', 'drive-sour-cream-onion.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('8b5db5c1-7dd7-4217-a4de-f34cb7d27fa5', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Курочка-гриль, 50 г', 'Drive Chips', 'Картофельные чипсы со вкусом курочки-гриль.', 50, 'g', 'bc82f2d1-201a-441e-9113-f844a509ba1f', 'drive-chicken-grill.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('2bb8d74a-46ed-4873-8a1b-36215bbf8d9e', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Курочка-гриль, 100 г', 'Drive Chips', 'Картофельные чипсы со вкусом курочки-гриль.', 100, 'g', 'b0287d6d-e5e5-4ca9-a488-d7936b15136b', 'drive-chicken-grill.jpg', 800, 800, 0.8000, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('759eda60-1fad-4919-82ef-c9109f138660', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Креветки, 50 г', 'Drive Chips', 'Картофельные чипсы со вкусом креветок.', 50, 'g', '71da6436-e0d8-4aaa-a2f1-ece23e1f0d14', 'drive-shrimp.jpg', 800, 800, 0.7800, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('490c704b-4367-40c8-8c1a-4a0e2eb7d928', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Натуральные, 100 г', 'Drive Chips', 'Картофельные чипсы с натуральным вкусом.', 100, 'g', 'a7e3718e-7be1-4fc6-a788-50105edd299f', 'drive-natural.jpg', 800, 800, 0.7800, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),
  ('1dc70f04-bca4-4bb2-bb27-3f336c5fce6f', 'be5e6fbd-fafe-57f9-972c-1f4c8eda4bd4', 'Чипсы картофельные Drive Васаби, 50 г', 'Drive Chips', 'Картофельные чипсы со вкусом васаби.', 50, 'g', 'e2aed3b5-04db-4c8c-8494-a3c1f1bb473b', 'drive-wasabi.jpg', 800, 800, 0.7800, 'IMG_5794.DNG', 'source_photo_crop', 'https://sibbalt.com/smetana-i-syr'),

  ('521b5ca2-346d-4724-a51f-96fb554e70a7', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток LIT Energy Цитрусовый удар, 450 мл', 'LIT Energy', 'Энергетический напиток со вкусом цитрусовых.', 450, 'ml', '73e6999b-3624-483c-9cd2-3be186efc029', 'lit-citrus.webp', 1080, 1920, 0.9500, 'IMG_5797.DNG', 'official_packshot', 'https://litenergy.ru/drinks'),
  ('d3945d30-1dbd-42ab-b90e-0384a307db53', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток LIT Energy Манго-кокос, 450 мл', 'LIT Energy', 'Энергетический напиток со вкусом манго и кокоса.', 450, 'ml', '17a1611f-c3e1-4dc3-935d-ee92d91dff6a', 'lit-mango-coconut.webp', 1080, 1920, 0.9500, 'IMG_5797.DNG', 'official_packshot', 'https://litenergy.ru/drinks'),
  ('152fa727-bfc0-4817-be34-ca0e48f61184', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток LIT Energy Классик, 450 мл', 'LIT Energy', 'Энергетический напиток с классическим вкусом.', 450, 'ml', '06534899-5063-4f8b-af3d-5110783177a0', 'lit-classic.webp', 1080, 1920, 0.9500, 'IMG_5797.DNG', 'official_packshot', 'https://litenergy.ru/drinks'),
  ('39c6eaaa-e39e-4aa5-8bcd-a889a811455f', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток LIT Energy Клубничная жвачка, 450 мл', 'LIT Energy', 'Энергетический напиток со вкусом клубничной жвачки.', 450, 'ml', '064359f7-cb3e-4658-b7b1-aea000a00172', 'lit-strawberry.webp', 1080, 1920, 0.9500, 'IMG_5797.DNG', 'official_packshot', 'https://litenergy.ru/drinks'),
  ('757bc871-bd5e-4455-bbe5-49c80f18e1cc', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток LIT Energy Малина, 450 мл', 'LIT Energy', 'Энергетический напиток со вкусом малины.', 450, 'ml', '43999460-c336-4284-bad7-6e6c02622fef', 'lit-raspberry.webp', 1080, 1920, 0.9500, 'IMG_5797.DNG', 'official_packshot', 'https://litenergy.ru/drinks'),
  ('175f014b-c8d2-4c41-be7c-4698eb3c9799', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток LIT Energy Оригинал без сахара, 450 мл', 'LIT Energy', 'Оригинальный энергетический напиток без сахара.', 450, 'ml', '943d83f8-a326-4c63-9016-6a9d7f166fc5', 'lit-original.webp', 1080, 1920, 0.9500, 'IMG_5797.DNG', 'official_packshot', 'https://litenergy.ru/drinks'),

  ('f7484d21-255c-4c66-91db-1bba23ea151b', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Энергия первых Солнечный манго, 450 мл', 'Энергия первых', 'Энергетический напиток со вкусом манго.', 450, 'ml', '973fd69d-8c4a-471c-b4bb-8a6c21416669', 'energy-first-sunny-mango.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),
  ('d6721a35-bcad-445b-880b-d153d2ed1856', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Энергия первых Малина с Венеры, 450 мл', 'Энергия первых', 'Энергетический напиток со вкусом малины.', 450, 'ml', '41f874af-c4c4-4a11-aa61-12e29a795893', 'energy-first-raspberry-venus.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),
  ('7c59826e-793e-40c8-a700-94a0c92512ee', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Энергия первых Марсианский цитрус, 450 мл', 'Энергия первых', 'Энергетический напиток со вкусом цитрусовых.', 450, 'ml', 'ec15b4d5-95e5-4f7f-84b9-37a9361e7eaf', 'energy-first-martian-citrus.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),

  ('369527fc-88b8-4aae-a410-aa8fa3b785b7', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Tornado Max Energy Black, 450 мл', 'Tornado Max Energy', 'Энергетический напиток Black.', 450, 'ml', 'df394861-c254-413b-b8e1-9eefcba19b7b', 'tornado-black.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),
  ('84937f38-1fb8-489e-abf9-d07922829c55', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Tornado Max Energy Watermelon, 450 мл', 'Tornado Max Energy', 'Энергетический напиток со вкусом арбуза.', 450, 'ml', '86923697-5149-43a1-92f1-30d6afb61048', 'tornado-watermelon.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),
  ('87723396-e3f4-4eb9-b3f8-8c94a7ddd90d', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Tornado Max Energy Mango, 450 мл', 'Tornado Max Energy', 'Энергетический напиток со вкусом манго.', 450, 'ml', '4789684f-5717-4a71-8fd7-148b8d2ce696', 'tornado-mango.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),

  ('6de93aef-ccb4-4ef1-981d-2a889de4de91', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток IDC Pome Boost Гранат, 450 мл', 'IDC Energy', 'Энергетический напиток со вкусом граната.', 450, 'ml', '07f25bf1-85bf-4866-846c-65bddbb10657', 'idc-energy-trio.jpg', 800, 800, 0.7600, 'IMG_5795.DNG', 'source_photo_crop', 'https://xn--b1aaibo6aawehcb.xn--p1acf/declarations/eaes-n-ru-d-ru-ra07-v-70558-25'),
  ('b370315c-8cc6-4ce5-8c12-bff4612da442', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток IDC Tropic Charge Манго-кокос, 450 мл', 'IDC Energy', 'Энергетический напиток со вкусом манго и кокоса.', 450, 'ml', '0a2e6c0e-a39d-4944-af4d-35b8d2022b20', 'idc-energy-trio.jpg', 800, 800, 0.7600, 'IMG_5795.DNG', 'source_photo_crop', 'https://xn--b1aaibo6aawehcb.xn--p1acf/declarations/eaes-n-ru-d-ru-ra07-v-70558-25'),
  ('e03c69d8-5c77-436e-989c-57a97af23238', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток IDC Original Taste Тутти-фрутти, 450 мл', 'IDC Energy', 'Энергетический напиток со вкусом тутти-фрутти.', 450, 'ml', '48df1420-da8f-4607-8090-0df9ec762239', 'idc-energy-trio.jpg', 800, 800, 0.7600, 'IMG_5795.DNG', 'source_photo_crop', 'https://xn--b1aaibo6aawehcb.xn--p1acf/declarations/eaes-n-ru-d-ru-ra07-v-70558-25'),

  ('08ee0d40-7c27-4efc-8f46-e7c15e280de1', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Cactus Apple & Kiwi, 450 мл', 'Cactus', 'Энергетический напиток со вкусом яблока и киви.', 450, 'ml', '554629b0-453e-4b74-83f9-a5ad6f4fc490', 'cactus-apple-kiwi.jpg', 800, 800, 0.7600, 'IMG_5795.DNG', 'source_photo_crop', ''),
  ('02d8bfb2-ffa2-46d1-ab1f-28d28d093765', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Ten Strike Sky, 450 мл', 'Ten Strike', 'Энергетический напиток со вкусом тропических фруктов.', 450, 'ml', '1311f642-682b-461b-b700-dc3650fb22c8', 'ten-strike-sky.jpg', 800, 800, 0.7600, 'IMG_5795.DNG', 'source_photo_crop', 'https://prs-trade.ru/strike-sky'),
  ('50dedeca-2828-429d-b7bc-5f608d63bc82', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток Flash Up Energy Original, 450 мл', 'Flash Up Energy', 'Энергетический напиток с оригинальным вкусом.', 450, 'ml', '97d8bc9d-6db4-49dc-bc5e-fd04be416262', 'flash-up-original.jpg', 800, 800, 0.7800, 'IMG_5795.DNG', 'source_photo_crop', ''),
  ('f111d603-c39f-45f4-a0e4-a47a4b54b261', 'f9784a80-0b76-585f-b1f5-cf7e2915f10b', 'Энергетический напиток BOLD Light Edition, 500 мл', 'BOLD', 'Энергетический напиток Light Edition.', 500, 'ml', '009654be-9e42-4c58-af08-5d1ea92c12d4', 'bold-light-edition.png', 280, 560, 0.9500, 'IMG_5795.DNG, IMG_5796.DNG', 'official_packshot', 'https://yupekchi.com/ru/brands/bold/'),
  ('b5395ffa-f50a-4057-8906-8a2d6a1ac395', '3b1000e8-fe92-52a6-8819-f003c1c90cf0', 'Кофейный напиток Let''s Be Cappuccino, 240 мл', 'Let''s Be', 'Готовый кофейный напиток капучино.', 240, 'ml', 'b5c00043-aa67-4684-a07f-4d30c01abbb4', 'lets-be-cappuccino.jpg', 800, 800, 0.8000, 'IMG_5797.DNG', 'source_photo_crop', 'https://lottedrinks.ru/production/post/5-kofe-lets-be'),

  ('9b176c01-704c-403f-b2cd-1c9edb4d871c', '771f5af6-cabd-57cb-9cfd-b57b6ce132df', 'Кетчуп Стоевъ Острый чили, 700 г', 'Стоевъ', 'Томатный кетчуп с острым перцем чили.', 700, 'g', '9f0c2663-734c-4864-92ff-cea0da979914', 'stoev-ketchup-hot-chili-700.jpg', 800, 800, 0.8200, 'IMG_5799.DNG', 'source_photo_crop', 'https://stoev.ru/chili-700-gr.html'),
  ('70bb8e8c-7222-4a84-b3da-25ab24e50354', '9c66f4e2-6571-5c2c-81e1-de732d0e0bf6', 'Соус Стоевъ Чили, 480 г', 'Стоевъ', 'Острый соус чили.', 480, 'g', '30199d4f-6497-4008-99a9-f467cd645098', 'stoev-chili-sauce-480.jpg', 800, 800, 0.8200, 'IMG_5799.DNG', 'source_photo_crop', 'https://stoev.ru/chili-sladkij.html'),
  ('fee8e69e-7c0d-41bf-93ba-37261e8f1e19', '771f5af6-cabd-57cb-9cfd-b57b6ce132df', 'Кетчуп Стоевъ Татарский, 310 г', 'Стоевъ', 'Томатный кетчуп Татарский.', 310, 'g', 'b50bf35b-4af0-44d3-9bec-bd57cbeed484', 'stoev-ketchup-tatar-310.jpg', 800, 800, 0.7800, 'IMG_5799.DNG', 'source_photo_crop', 'https://stoev.ru/ketchup-stoev.html'),
  ('45d7449d-b407-4c47-b68f-0c51fcfab997', '771f5af6-cabd-57cb-9cfd-b57b6ce132df', 'Кетчуп Стоевъ Цыганский, 310 г', 'Стоевъ', 'Томатный кетчуп Цыганский.', 310, 'g', '63218212-742a-4c02-9ed4-b226a48ee228', 'stoev-ketchup-gypsy-310.jpg', 800, 800, 0.7800, 'IMG_5799.DNG', 'source_photo_crop', 'https://stoev.ru/ketchup-stoev.html');

insert into public.master_products (
  id,
  category_id,
  title,
  brand,
  description,
  net_content_value,
  net_content_unit,
  attributes,
  status,
  source_type,
  verified_at
)
select
  candidate.id,
  candidate.category_id,
  candidate.title,
  candidate.brand,
  candidate.description,
  candidate.net_content_value,
  candidate.net_content_unit,
  jsonb_build_object(
    'import_batch', 'photo-products-20260829',
    'observed_on', candidate.observed_on,
    'recognition_basis', 'visible_product_label',
    'barcode_status', 'not_visible_not_required',
    'image_kind', candidate.image_kind,
    'reference_url', nullif(candidate.reference_url, '')
  ),
  'verified',
  'import',
  now()
from photo_import_candidates candidate
where not exists (
  select 1
  from public.master_products existing
  where existing.id <> candidate.id
    and existing.status <> 'archived'
    and existing.category_id = candidate.category_id
    and regexp_replace(lower(existing.title), '[^[:alnum:]]+', '', 'g')
      = regexp_replace(lower(candidate.title), '[^[:alnum:]]+', '', 'g')
)
on conflict (id) do nothing;

insert into public.master_product_media (
  id,
  master_product_id,
  role,
  url,
  storage_path,
  alt,
  width,
  height,
  quality_score,
  processing_status,
  moderation_status,
  is_primary,
  sort_order
)
select
  candidate.media_id,
  candidate.id,
  'front',
  'https://wayyaam.ru/product-media/photo-import-20260829/' || candidate.media_path,
  'product-media/photo-import-20260829/' || candidate.media_path,
  candidate.title,
  candidate.media_width,
  candidate.media_height,
  candidate.quality_score,
  'ready',
  'verified',
  true,
  0
from photo_import_candidates candidate
join public.master_products product on product.id = candidate.id
on conflict (id) do nothing;

select
  candidate.id,
  candidate.title,
  category.name as category_name,
  case when product.id = candidate.id then 'present_in_batch' else 'skipped_existing' end as import_result,
  media.url as image_url
from photo_import_candidates candidate
join public.master_categories category on category.id = candidate.category_id
left join public.master_products product on product.id = candidate.id
left join public.master_product_media media
  on media.master_product_id = candidate.id
  and media.is_primary
order by category.name, candidate.title;
