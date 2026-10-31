import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ExactBackProvider, useNavigationPrincipal, useHistoryViewState } from '../../src/shared/ExactBackNavigation';
import { DriverHeader } from '../../src/pages/driver/DriverApp';
import { ExistingRestaurantSettingsPage } from '../../src/features/restaurant-admin/ExistingRestaurantSettingsPage';
import { PlatformSettingsPage } from '../../src/pages/platform-admin/PlatformAdminApp';
import { PartnerRegistrationPreview } from '../../src/features/partner-registration-preview/PartnerRegistrationPreview';
import { cabins, categories, products, restaurant, themeSettings } from '../../src/data/catalog';
import { defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import { DEFAULT_PHOTO_QUALITY_SETTINGS } from '../../src/shared/photoQuality';
function BrowserBack() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Браузер назад</button>; }
function queryClient() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
for (const slug of ['mangal','finik']) {
 test(`${slug}: actual settings Back returns Theme → Design → settings and delivery section → delivery → settings`, async () => {
  await page.viewport(319,620);
  const screen = await render(<QueryClientProvider client={queryClient()}><MemoryRouter initialEntries={[`/${slug}/settings`]}><ExactBackProvider><BrowserBack /><ExistingRestaurantSettingsPage catalogSlug={slug} restaurant={{...restaurant,business_type:'restaurant',business_type_raw:slug==='finik'?'shop':'restaurant'}} categories={categories} cabins={cabins} tags={[]} products={products} theme={themeSettings} photoQuality={DEFAULT_PHOTO_QUALITY_SETTINGS} paymentSettings={defaultPaymentSettings} deliverySettings={defaultRestaurantDeliverySettings} onSaveRestaurant={vi.fn()} onSaveCategories={vi.fn()} onSaveCabins={vi.fn()} onSaveTags={vi.fn()} onSaveTheme={vi.fn()} onSavePhotoQuality={vi.fn()} onSavePayments={vi.fn()} onSaveDelivery={vi.fn()} onImport={vi.fn()} onSignOut={vi.fn()} /></ExactBackProvider></MemoryRouter></QueryClientProvider>);
  await screen.getByRole('button',{name:'Дизайн',exact:true}).click();
  await screen.getByRole('button',{name:/^Тема/}).click();
  await screen.getByRole('button',{name:'Вернуться к настройкам',exact:true}).click();
  await expect.element(screen.getByRole('button',{name:/^Тема/})).toBeVisible();
  await screen.getByRole('button',{name:'Браузер назад'}).click();
  await expect.element(screen.getByRole('button',{name:'Дизайн',exact:true})).toBeVisible();
  await screen.getByRole('button',{name:'Доставка и заказы',exact:true}).click();
  await screen.getByRole('button',{name:'Параметры доставки',exact:true}).click();
  await screen.getByRole('button',{name:'Назад к доставке',exact:true}).click();
  await expect.element(screen.getByRole('button',{name:'Параметры доставки',exact:true})).toBeVisible();
  await screen.getByRole('button',{name:'Назад к настройкам',exact:true}).click();
  await expect.element(screen.getByRole('button',{name:'Дизайн',exact:true})).toBeVisible();
 });
}
test('actual courier header returns settings to its real source, including a source other than profile', async () => {
 const screen = await render(<MemoryRouter initialEntries={['/driver/orders']}><ExactBackProvider><Routes><Route path="/driver/orders" element={<><h1>Выбранные заказы</h1><Link to="/driver/settings">Настройки из заказов</Link></>} /><Route path="/driver/settings" element={<DriverHeader title="Настройки" />} /><Route path="/driver/profile" element={<h1>Неверный профиль</h1>} /></Routes></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('link',{name:'Настройки из заказов'}).click();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'Выбранные заказы'})).toBeVisible();
});
test('actual platform banner editor Back returns to banners before settings overview', async () => {
 const client=queryClient();client.setQueryData(['platform-banners'],[]);client.setQueryData(['platform-content-pages'],[]);
 const screen=await render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/settings']}><ExactBackProvider><BrowserBack /><PlatformSettingsPage onSignOut={vi.fn()} /></ExactBackProvider></MemoryRouter></QueryClientProvider>);
 await screen.getByRole('button',{name:/^Баннеры/}).click();
 await screen.getByRole('button',{name:'Создать',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'Создать материал'})).toBeVisible();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'Баннеры',exact:true})).toBeVisible();
 await screen.getByRole('button',{name:'Браузер назад'}).click();
 await expect.element(screen.getByRole('heading',{name:'Настройки',exact:true})).toBeVisible();
});
test('partner preview Back returns to the real previous screen', async () => {
 const screen=await render(<MemoryRouter initialEntries={['/registration-preview']}><ExactBackProvider><BrowserBack /><PartnerRegistrationPreview /></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('button',{name:'Регистрация',exact:true}).click();
 await screen.getByRole('button',{name:/курьер доставка/i}).click();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'Как будете работать?'})).toBeVisible();
 await screen.getByRole('button',{name:'Браузер назад'}).click();
 await expect.element(screen.getByRole('button',{name:'Регистрация',exact:true})).toBeVisible();
});
function PrincipalFixture() {
 const [identity,setIdentity]=useState('alice');useNavigationPrincipal(identity);
 const [view,setView]=useHistoryViewState('private.view','home');
 return <><h1>{view}</h1><button onClick={()=>setView('private')}>Данные</button><button onClick={()=>setIdentity('bob')}>Другой пользователь</button></>;
}
test('changing the verified principal discards another account’s local snapshots',async()=>{
 const screen=await render(<MemoryRouter initialEntries={['/driver']}><ExactBackProvider><BrowserBack /><PrincipalFixture /></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('button',{name:'Данные',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'private',exact:true})).toBeVisible();
 await screen.getByRole('button',{name:'Другой пользователь',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'home',exact:true})).toBeVisible();
 await screen.getByRole('button',{name:'Браузер назад'}).click();
 await expect.element(screen.getByRole('heading',{name:'home',exact:true})).toBeVisible();
});
