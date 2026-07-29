import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gift,
  Image as ImageIcon,
  Plus,
  Ticket,
  Trash2,
  Trophy,
  UsersRound,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deletePlatformContestTicket,
  getPlatformBanners,
  getPlatformContestTickets
} from '../../shared/api/clientsApi';
import type { PlatformBannerAdmin, PlatformContestTicket } from '../../shared/api/platformTypes';
import './platform-contests.css';

type PromotionFilter = 'all' | 'active' | 'completed' | 'draft';

const dateLabel = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).format(new Date(value));

const participantKey = (ticket: PlatformContestTicket) =>
  ticket.customerPhone.replace(/\D/g, '') || ticket.customerName.trim().toLocaleLowerCase('ru-RU');

const promotionStatus = (promotion: PlatformBannerAdmin) => {
  if (promotion.isActive) return { key: 'active' as const, label: 'Активная' };
  if (!promotion.imageUrl && !promotion.linkUrl) return { key: 'draft' as const, label: 'Черновик' };
  return { key: 'completed' as const, label: 'Завершена' };
};

function navigateToBannerSettings() {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  window.history.pushState(null, '', `${base}#/admin/settings`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function PromotionDetails({
  promotion,
  tickets,
  onClose,
  onTicketRemoved
}: {
  promotion: PlatformBannerAdmin;
  tickets: PlatformContestTicket[];
  onClose: () => void;
  onTicketRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
  const visibleTickets = tickets.filter((ticket) =>
    !normalizedSearch || [
      ticket.customerName,
      ticket.customerPhone,
      ticket.restaurantName,
      ticket.deliveryCity
    ].some((value) => value.toLocaleLowerCase('ru-RU').includes(normalizedSearch))
  );

  const removeTicket = async (ticket: PlatformContestTicket) => {
    await deletePlatformContestTicket(ticket.id);
    toast.success('Билет удалён из списка');
    await queryClient.invalidateQueries({ queryKey: ['platform-contest-tickets'] });
    onTicketRemoved();
  };

  return (
    <div className="platform-promotion-modal__backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="platform-promotion-modal" role="dialog" aria-modal="true" aria-label={promotion.title}>
        <header>
          <div>
            <span className={`platform-promotion-status is-${promotionStatus(promotion).key}`}>
              {promotionStatus(promotion).label}
            </span>
            <h2>{promotion.title}</h2>
            <p>{promotion.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
        </header>
        <label className="platform-promotion-modal__search">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон, ресторан или город" />
        </label>
        <div className="platform-promotion-ticket-list">
          {visibleTickets.map((ticket) => (
            <article key={ticket.id}>
              <Ticket />
              <span>
                <strong>{ticket.customerName}</strong>
                <small>{ticket.customerPhone || 'Телефон не указан'} · {ticket.restaurantName}</small>
                <em>{ticket.deliveryCity || 'Город не указан'} · {dateLabel(ticket.createdAt)}</em>
              </span>
              <b>{new Intl.NumberFormat('ru-RU').format(ticket.totalAmount)} ₽</b>
              <button type="button" onClick={() => void removeTicket(ticket)} aria-label="Удалить билет"><Trash2 /></button>
            </article>
          ))}
          {visibleTickets.length === 0 && <p>Билетов по этому фильтру пока нет.</p>}
        </div>
      </section>
    </div>
  );
}

export function PlatformContestsPage() {
  const bannersQuery = useQuery({ queryKey: ['platform-banners'], queryFn: getPlatformBanners });
  const promotions = useMemo(
    () => (bannersQuery.data ?? []).filter((banner) => banner.kind === 'contest' || banner.kind === 'promo'),
    [bannersQuery.data]
  );
  const [selectedPromotionId, setSelectedPromotionId] = useState('all');
  const [filter, setFilter] = useState<PromotionFilter>('all');
  const [openPromotion, setOpenPromotion] = useState<PlatformBannerAdmin | null>(null);
  const ticketsQuery = useQuery({
    queryKey: ['platform-contest-tickets', selectedPromotionId],
    queryFn: () => getPlatformContestTickets(selectedPromotionId)
  });
  const tickets = ticketsQuery.data ?? [];
  const participants = new Set(tickets.map(participantKey)).size;
  const activeCount = promotions.filter((promotion) => promotion.isActive).length;
  const completedCount = promotions.filter((promotion) => promotionStatus(promotion).key === 'completed').length;
  const draftCount = promotions.filter((promotion) => promotionStatus(promotion).key === 'draft').length;
  const visiblePromotions = promotions.filter((promotion) => {
    if (selectedPromotionId !== 'all' && promotion.id !== selectedPromotionId) return false;
    return filter === 'all' || promotionStatus(promotion).key === filter;
  });
  const countFor = (value: PromotionFilter) => {
    if (value === 'all') return promotions.length;
    if (value === 'active') return activeCount;
    if (value === 'completed') return completedCount;
    return draftCount;
  };

  return (
    <main className="platform-page platform-contests-page">
      <header className="platform-page-head platform-contests-page__head">
        <div>
          <h1>Акции и конкурсы</h1>
          <p>Один заказ создаёт один билет для активного конкурса</p>
        </div>
        <button type="button" onClick={navigateToBannerSettings}><Plus />Создать акцию</button>
      </header>

      <section className="platform-promotion-stats" aria-label="Статистика акций">
        <article><span><Ticket /></span><strong>{activeCount}</strong><small>Активных акций</small></article>
        <article className="is-participants"><span><UsersRound /></span><strong>{participants}</strong><small>Всего участников</small></article>
        <article className="is-prizes"><span><Gift /></span><strong>{completedCount}</strong><small>Призов разыграно</small></article>
        <article className="is-tickets"><span><Ticket /></span><strong>{tickets.length}</strong><small>Билетов выдано</small></article>
      </section>

      <label className="platform-promotion-select">
        <Trophy />
        <select value={selectedPromotionId} onChange={(event) => setSelectedPromotionId(event.target.value)}>
          <option value="all">Все заказы</option>
          {promotions.map((promotion) => <option value={promotion.id} key={promotion.id}>{promotion.title}</option>)}
        </select>
        <ChevronDown />
      </label>

      <nav className="platform-promotion-filters" aria-label="Статусы акций">
        {([
          ['all', 'Все'],
          ['active', 'Активные'],
          ['completed', 'Завершённые'],
          ['draft', 'Черновики']
        ] as Array<[PromotionFilter, string]>).map(([value, label]) => (
          <button type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} key={value}>
            {label}<span>{countFor(value)}</span>
          </button>
        ))}
      </nav>

      <section className="platform-promotion-list">
        {bannersQuery.isLoading && <div className="platform-state">Загружаем акции…</div>}
        {bannersQuery.isError && <div className="platform-state">Не удалось загрузить акции.</div>}
        {!bannersQuery.isLoading && visiblePromotions.length === 0 && (
          <div className="platform-promotion-empty">
            <Trophy /><strong>Акций пока нет</strong><small>Создайте конкурс в настройках главного баннера.</small>
          </div>
        )}
        {visiblePromotions.map((promotion) => {
          const status = promotionStatus(promotion);
          const ticketCount = tickets.length;
          const participantCount = participants;
          const progress = ticketCount ? Math.min(100, Math.max(8, Math.round((participantCount / ticketCount) * 100))) : 0;
          return (
            <button type="button" className="platform-promotion-row" onClick={() => setOpenPromotion(promotion)} key={promotion.id}>
              <span className="platform-promotion-row__media" style={{ backgroundColor: promotion.backgroundColor }}>
                {promotion.imageUrl ? <img src={promotion.imageUrl} alt="" /> : <ImageIcon />}
              </span>
              <span className="platform-promotion-row__identity">
                <em className={`platform-promotion-status is-${status.key}`}>{status.label}</em>
                <strong>{promotion.title}</strong>
                <small><CalendarDays />Период не задан</small>
                <small><ImageIcon />Главный баннер</small>
              </span>
              <span className="platform-promotion-row__metrics">
                <strong>{new Intl.NumberFormat('ru-RU').format(ticketCount)}</strong>
                <small>билетов выдано</small>
                <i><b style={{ width: `${progress}%` }} /></i>
                <em>{participantCount} участников</em>
              </span>
              <ChevronRight />
            </button>
          );
        })}
      </section>

      <aside className="platform-promotion-help">
        <span>i</span>
        <div><strong>Как это работает?</strong><small>Каждый заказ = один билет. Билеты доступны в подробностях акции.</small></div>
        <ChevronRight />
      </aside>

      {openPromotion && (
        <PromotionDetails
          promotion={openPromotion}
          tickets={tickets}
          onClose={() => setOpenPromotion(null)}
          onTicketRemoved={() => void ticketsQuery.refetch()}
        />
      )}
    </main>
  );
}
