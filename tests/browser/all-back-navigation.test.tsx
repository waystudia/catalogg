import { useEffect, useState } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ExactBackProvider, useExactBack, useHistoryViewState, useEntrySnapshotState, useViewNavigate, useBackAction } from '../../src/shared/ExactBackNavigation';
function Controls({ fallback }: { fallback: string }) {
  const back = useExactBack(fallback), navigate = useNavigate(), location = useLocation();
  return <><output aria-label="Маршрут">{location.pathname + location.search}</output><output aria-label="Ключ истории">{location.key}</output><button onClick={back}>Назад</button><button onClick={() => navigate(-1)}>Системный назад</button><button onClick={() => navigate(1)}>Вперёд</button></>;
}
for (const root of ['/driver', '/mangal/settings', '/finik/settings', '/admin', '/admin/catalogs/mangal']) {
  test(`${root}: nested route Back restores the exact origin and does not jump to the fallback`, async () => {
    await page.viewport(319, 620);
    const screen = await render(<MemoryRouter initialEntries={[root]}><ExactBackProvider><Controls fallback={root} /><Routes><Route path={root} element={<Link to={`${root}/one?tab=selected`}>Первый экран</Link>} /><Route path={`${root}/one`} element={<Link to={`${root}/two`}>Второй экран</Link>} /><Route path={`${root}/two`} element={<p>Конец</p>} /></Routes></ExactBackProvider></MemoryRouter>);
    await screen.getByRole('link', { name: 'Первый экран' }).click();
    await screen.getByRole('link', { name: 'Второй экран' }).click();
    await screen.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect.element(screen.getByLabelText('Маршрут')).toHaveTextContent(`${root}/one?tab=selected`);
    await screen.getByRole('button', { name: 'Системный назад' }).click();
    await expect.element(screen.getByLabelText('Маршрут')).toHaveTextContent(new RegExp(`^${root}$`));
  });
}

function LocalViews() {
  const [view, setView] = useHistoryViewState('test-view', 'catalog');
  const [selection, setSelection] = useHistoryViewState('test-selection', 'none');
  const back = useExactBack('/driver');
  return <main style={{ minHeight: 1600 }}><h1>{view}</h1><output aria-label="Выбор">{selection}</output><button onClick={() => { setView('product'); setSelection('coffee'); }}>Товар</button><button onClick={() => setView('settings')}>Настройки</button><button onClick={back}>Назад локально</button></main>;
}
test('local catalog/product/settings steps share browser history and batch screen with selection', async () => {
  const screen = await render(<MemoryRouter initialEntries={['/finik/settings']}><ExactBackProvider><Controls fallback="/finik/settings" /><LocalViews /></ExactBackProvider></MemoryRouter>);
  await screen.getByRole('button', { name: 'Товар', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'product' })).toBeVisible();
  await screen.getByRole('button', { name: 'Настройки', exact: true }).click();
  await screen.getByRole('button', { name: 'Назад локально' }).click();
  await expect.element(screen.getByRole('heading', { name: 'product' })).toBeVisible();
  await expect.element(screen.getByLabelText('Выбор')).toHaveTextContent('coffee');
  await screen.getByRole('button', { name: 'Системный назад' }).click();
  await expect.element(screen.getByRole('heading', { name: 'catalog' })).toBeVisible();
  await expect.element(screen.getByLabelText('Выбор')).toHaveTextContent('none');
  await screen.getByRole('button', { name: 'Вперёд' }).click();
  await expect.element(screen.getByRole('heading', { name: 'product' })).toBeVisible();
});

function ScrollableViews() {
 const [view,setView]=useHistoryViewState('scrollable-view','list');const back=useExactBack('/driver');
 return view==='list' ? <section data-navigation-scroll="fixture" style={{height:140,overflowY:'auto'}}><button style={{position:'sticky',top:0}} onClick={()=>setView('detail')}>Открыть из списка</button><div style={{height:1800}}>Длинный список</div></section> : <button onClick={back}>Вернуть список</button>;
}
test('Back restores an independently scrolling list, not only the window',async()=>{
 const screen=await render(<MemoryRouter initialEntries={['/driver/orders']}><ExactBackProvider><ScrollableViews /></ExactBackProvider></MemoryRouter>);
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const list=document.querySelector<HTMLElement>('[data-navigation-scroll="fixture"]')!;
 window.dispatchEvent(new WheelEvent('wheel', { deltaY: 350 })); list.scrollTop=350;
 await expect.poll(()=>list.scrollTop).toBe(350);
 await screen.getByRole('button',{name:'Открыть из списка'}).click();
 await screen.getByRole('button',{name:'Вернуть список'}).click();
 await expect.poll(()=>document.querySelector<HTMLElement>('[data-navigation-scroll="fixture"]')?.scrollTop).toBe(350);
});

test('a different establishment starts its own safe return chain', async () => {
 const screen=await render(<MemoryRouter initialEntries={['/mangal/settings']}><ExactBackProvider><Controls fallback="/finik/settings" /><Routes><Route path="/mangal/settings" element={<Link to="/finik/settings">Другой магазин</Link>} /><Route path="/finik/settings" element={<><h1>Магазин Финик</h1><Link to="/finik/settings/delivery">Доставка магазина</Link></>} /><Route path="/finik/settings/delivery" element={<h1>Доставка Финика</h1>} /></Routes></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('link',{name:'Другой магазин'}).click();
 await screen.getByRole('link',{name:'Доставка магазина'}).click();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'Магазин Финик'})).toBeVisible();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByRole('heading',{name:'Магазин Финик'})).toBeVisible();
});
test('local history still works when private browsing blocks session storage',async()=>{
 const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
 const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
 try {
  const screen=await render(<MemoryRouter initialEntries={['/driver']}><ExactBackProvider><LocalViews /></ExactBackProvider></MemoryRouter>);
  await screen.getByRole('button',{name:'Товар',exact:true}).click();
  await screen.getByRole('button',{name:'Назад локально'}).click();
  await expect.element(screen.getByRole('heading',{name:'catalog',exact:true})).toBeVisible();
 } finally {get.mockRestore();set.mockRestore();}
});

function SlowList() {
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setLoaded(true),1300);return()=>clearTimeout(timer);},[]);
 return <main style={{minHeight:loaded?2000:100}}><Link style={{display:'block',position:'sticky',top:0}} to="/driver/settings">Открыть настройки</Link><p>{loaded?'Список готов':'Загрузка списка'}</p></main>;
}
test('Back waits for a slowly remounting list before restoring its scroll',async()=>{
 const screen=await render(<MemoryRouter initialEntries={['/driver/orders']}><ExactBackProvider><Controls fallback="/driver/orders" /><Routes><Route path="/driver/orders" element={<SlowList />} /><Route path="/driver/settings" element={<p>Настройки водителя</p>} /></Routes></ExactBackProvider></MemoryRouter>);
 await expect.element(screen.getByText('Список готов',{exact:true})).toBeInTheDocument();
 window.scrollTo(0,500);await expect.poll(()=>window.scrollY).toBe(500);
 await screen.getByRole('link',{name:'Открыть настройки'}).click();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByText('Список готов',{exact:true})).toBeInTheDocument();
 await expect.poll(()=>window.scrollY,{timeout:3000}).toBe(500);
});

function SnapshotViews() {
 const [view,setView]=useHistoryViewState('snapshot.view','list');
 const [filter,setFilter]=useEntrySnapshotState('snapshot.filter','');
 const back=useExactBack('/driver');
 return <><Controls fallback="/driver" />{view==='list'?<><input aria-label="Фильтр" value={filter} onChange={event=>setFilter(event.target.value)} /><button onClick={()=>setView('detail')}>Открыть карточку</button></>:<button onClick={back}>Назад к фильтру</button>}</>;
}
test('typing a filter preserves the entry and Back restores the filter without extra typing steps',async()=>{
 const screen=await render(<MemoryRouter initialEntries={['/driver']}><ExactBackProvider><SnapshotViews /></ExactBackProvider></MemoryRouter>);
 const key=screen.getByLabelText('Ключ истории').element().textContent!;
 await screen.getByLabelText('Фильтр').fill('кофе');
 await expect.element(screen.getByLabelText('Ключ истории')).toHaveTextContent(key);
 await screen.getByRole('button',{name:'Открыть карточку'}).click();
 await screen.getByRole('button',{name:'Назад к фильтру'}).click();
 await expect.element(screen.getByLabelText('Фильтр')).toHaveValue('кофе');
});

function CartTransfer() {
 const location=useLocation(),navigate=useViewNavigate();
 const [open,setOpen]=useHistoryViewState('catalog.cart',false);
 const [screen,setScreen]=useHistoryViewState('catalog.screen','home');
 return <><output aria-label="Корзина">{open?'open':'closed'}</output><output aria-label="Экран">{screen}</output><button onClick={()=>{setOpen(false);setScreen('home');navigate('/mangal',{replace:true,state:location.state});}}>Свернуть в каталог</button></>;
}
test('collapsing a sheet commits both pending UI changes with the query transition',async()=>{
 const screen=await render(<MemoryRouter initialEntries={[{pathname:'/mangal',search:'?cart=1',state:{wayyaamViews:{'catalog.cart':true,'catalog.screen':'product'}}}]}><ExactBackProvider><CartTransfer /></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('button',{name:'Свернуть в каталог'}).click();
 await expect.element(screen.getByLabelText('Корзина')).toHaveTextContent('closed');
 await expect.element(screen.getByLabelText('Экран')).toHaveTextContent('home');
});
function DirectLocalBack() {
 const [view,setView]=useHistoryViewState('direct.view','settings');
 const back=useBackAction(()=>setView('home'));
 return <><h1>{view}</h1><button onClick={back}>Локально назад</button></>;
}
test('a direct-entry local fallback replaces its view instead of creating a Back loop',async()=>{
 const screen=await render(<MemoryRouter initialEntries={['/driver/settings']}><ExactBackProvider><DirectLocalBack /></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('button',{name:'Локально назад'}).click();
 await expect.element(screen.getByRole('heading',{name:'home',exact:true})).toBeVisible();
 await screen.getByRole('button',{name:'Локально назад'}).click();
 await expect.element(screen.getByRole('heading',{name:'home',exact:true})).toBeVisible();
});

test('browser Back into an older untracked route does not invent another safe app entry',async()=>{
 const screen=await render(<MemoryRouter initialEntries={['/driver/untracked','/driver/settings']}><ExactBackProvider><Controls fallback="/driver" /><Routes><Route path="/driver/untracked" element={<p>Старый экран</p>} /><Route path="/driver/settings" element={<p>Настройки</p>} /><Route path="/driver" element={<p>Главная курьера</p>} /></Routes></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('button',{name:'Системный назад'}).click();
 await expect.element(screen.getByText('Старый экран',{exact:true})).toBeVisible();
 await screen.getByRole('button',{name:'Назад',exact:true}).click();
 await expect.element(screen.getByText('Главная курьера',{exact:true})).toBeVisible();
});
