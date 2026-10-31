import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CatalogScreen } from '../../src/app/App';
import { ExactBackProvider, useExactBack, useHistoryViewState } from '../../src/shared/ExactBackNavigation';
import { categories, products, restaurant } from '../../src/data/catalog';
import '../../src/app/styles.css';
function Journey() {
 const [view,setView]=useHistoryViewState('test.catalog.view','catalog');
 const back=useExactBack('/');
 return <div className="app-shell">{view==='product'?<main><h1>Карточка соуса</h1><button onClick={back}>Назад из товара</button></main>:<CatalogScreen restaurant={restaurant} categories={categories} products={products} initialCategory="all" onCart={vi.fn()} onShare={vi.fn()} onBack={back} onOpenProduct={()=>setView('product')} onEditProduct={vi.fn()} onDeleteProduct={vi.fn()} onToggleProduct={vi.fn()} onStockChange={vi.fn()} reviewRating={0} reviewCount={0} onReviews={vi.fn()} />}</div>;
}
test('the real catalog restores its chosen category and scroll after its sticky toolbar remounts',async()=>{
 await page.viewport(319,620);
 const screen=await render(<MemoryRouter initialEntries={['/mangal']}><ExactBackProvider><Journey /></ExactBackProvider></MemoryRouter>);
 await screen.getByRole('button',{name:'Соусы',exact:true}).click();
 await screen.getByRole('heading',{name:'Соус фирменный',exact:true}).first().click();
 await expect.element(screen.getByRole('heading',{name:'Карточка соуса',exact:true})).toBeVisible();
 const journal=JSON.parse(sessionStorage.getItem('wayyaam:client-navigation:v1')!);
 const source=journal.entries[journal.index-1];expect(source.y).toBeGreaterThan(0);
 await screen.getByRole('button',{name:'Назад из товара',exact:true}).click();
 await expect.poll(()=>Math.abs(window.scrollY-source.y)).toBeLessThan(3);
 const selected=source.views['catalog.category'];
 const expected=selected==='sauces'?'Соусы':selected==='hits'?'Хиты 🔥':selected==='all'?'Все':categories.find(item=>item.id===selected)!.name;
 await expect.poll(()=>document.querySelector('.catalog-nav__rail .is-active')?.textContent).toBe(expected);
});
