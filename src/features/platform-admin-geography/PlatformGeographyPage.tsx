import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileClock,
  MapPin,
  Plus,
  Route,
  Search,
  Settings2,
  Store,
  Truck,
  UserRound,
  X
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { getClients, getPlatformUserDirectory } from '../../shared/api/clientsApi';
import {
  getDeliveryPriceRequests,
  getDeliveryPricingRules,
  reviewDeliveryPriceRequest,
  saveDeliveryPricingRule
} from '../../shared/api/deliveryPricingApi';
import { getDrivers } from '../../shared/api/driversApi';
import {
  createDeliverySettlement,
  getDeliverySettlements,
  getSettlementRequests
} from '../../shared/api/settlementsApi';
import type { PlatformDeliverySettlement } from '../../shared/api/platformTypes';
import { downloadCsv, downloadXlsx, type ExportCell } from '../../shared/exportTable';
import './platform-geography.css';

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru-RU');
const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

async function getGeographyDirectory() {
  const [settlements, requests, pricingRules, priceRequests, drivers, clients, users] = await Promise.all([
    getDeliverySettlements(),
    getSettlementRequests(),
    getDeliveryPricingRules(),
    getDeliveryPriceRequests(),
    getDrivers(),
    getClients({ page: 1, pageSize: 1000, status: 'all', payment: 'all', templateId: 'all' }),
    getPlatformUserDirectory()
  ]);

  return {
    settlements,
    requests,
    pricingRules,
    priceRequests,
    drivers,
    clients: clients.data,
    users
  };
}

type SettlementSummary = {
  settlement: PlatformDeliverySettlement;
  restaurants: number;
  drivers: number;
  customers: number;
  orders: number;
  turnover: number;
};

export function PlatformGeographyPage() {
  const queryClient = useQueryClient();
  const directoryQuery = useQuery({
    queryKey: ['platform-geography-directory'],
    queryFn: getGeographyDirectory,
    staleTime: 15_000
  });
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [allRequestsOpen, setAllRequestsOpen] = useState(false);
  const [tariffsOpen, setTariffsOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementSummary | null>(null);
  const [cityName, setCityName] = useState('');
  const [settlementName, setSettlementName] = useState('');
  const [fromSettlement, setFromSettlement] = useState('');
  const [toSettlement, setToSettlement] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const directory = directoryQuery.data;

  const summaries = useMemo<SettlementSummary[]>(() => {
    if (!directory) return [];
    return directory.settlements.map((settlement) => {
      const settlementKey = normalize(settlement.settlementName);
      const matches = (values: string[]) => values.some((value) => normalize(value) === settlementKey);
      const restaurantCount = directory.clients.filter((client) =>
        matches([client.primaryCity, ...client.serviceSettlements].filter(Boolean))
      ).length;
      const driverCount = directory.drivers.filter((driver) =>
        matches([driver.cityName, ...driver.serviceSettlements].filter(Boolean))
      ).length;
      const users = directory.users.users.filter((user) => normalize(user.cityName) === settlementKey);
      const orders = users.flatMap((user) => user.orders);
      return {
        settlement,
        restaurants: restaurantCount,
        drivers: driverCount,
        customers: users.length,
        orders: orders.length,
        turnover: orders.reduce((sum, order) => sum + order.amount, 0)
      };
    });
  }, [directory]);

  const filteredSummaries = useMemo(() => {
    const query = normalize(search);
    if (!query) return summaries;
    return summaries.filter(({ settlement }) =>
      [settlement.settlementName, settlement.cityName].join(' ').toLocaleLowerCase('ru-RU').includes(query)
    );
  }, [search, summaries]);

  const visibleRequests = useMemo(() => {
    const existing = new Set((directory?.settlements ?? []).map((item) => normalize(item.settlementName)));
    const requests = (directory?.requests ?? []).filter((item) => !existing.has(normalize(item.settlementName)));
    return allRequestsOpen ? requests : requests.slice(0, 3);
  }, [allRequestsOpen, directory]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['platform-geography-directory'] });
  };

  const addSettlement = async (name = settlementName, city = cityName) => {
    setSaving(true);
    try {
      await createDeliverySettlement({ cityName: city, settlementName: name });
      setSettlementName('');
      setCityName('');
      setAddOpen(false);
      await refresh();
      toast.success('Населённый пункт добавлен');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить населённый пункт');
    } finally {
      setSaving(false);
    }
  };

  const saveTariff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveDeliveryPricingRule({
        fromSettlement,
        toSettlement,
        amount: Number(priceAmount)
      });
      setFromSettlement('');
      setToSettlement('');
      setPriceAmount('');
      await refresh();
      toast.success('Тариф сохранён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить тариф');
    } finally {
      setSaving(false);
    }
  };

  const reviewPrice = async (requestId: string, approved: boolean, amount?: number) => {
    try {
      await reviewDeliveryPriceRequest({ requestId, approved, amount });
      await refresh();
      toast.success(approved ? 'Цена согласована' : 'Запрос отклонён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обработать запрос');
    }
  };

  const exportHeaders = ['Населённый пункт', 'Район', 'Рестораны', 'Водители', 'Клиенты', 'Заказы', 'Оборот', 'Статус'];
  const exportRows: ExportCell[][] = summaries.map((item) => [
    item.settlement.settlementName,
    item.settlement.cityName,
    item.restaurants,
    item.drivers,
    item.customers,
    item.orders,
    item.turnover,
    item.settlement.isActive ? 'Активен' : 'Скрыт'
  ]);

  return (
    <main className="platform-page platform-geography-page">
      <header className="platform-page-head">
        <div>
          <h1>География</h1>
          <p>Управление зонами работы платформы</p>
        </div>
        <div className="platform-geography-export">
          <button type="button" onClick={() => downloadCsv('waycatalog-geography', exportHeaders, exportRows)}>
            <Download />CSV
          </button>
          <button type="button" onClick={() => void downloadXlsx('waycatalog-geography', 'География', exportHeaders, exportRows)}>
            XLSX
          </button>
        </div>
      </header>

      <section className="platform-geography-stats">
        <article><span><MapPin /></span><small>Населённые пункты</small><strong>{directory?.settlements.length ?? 0}</strong></article>
        <article><span><Store /></span><small>Рестораны</small><strong>{directory?.clients.length ?? 0}</strong></article>
        <article><span><Truck /></span><small>Водители</small><strong>{directory?.drivers.length ?? 0}</strong></article>
        <article><span><FileClock /></span><small>Запросы</small><strong>{directory?.requests.length ?? 0}</strong></article>
      </section>

      <section className="platform-geography-card platform-settlements-card">
        <header>
          <h2>Города и сёла</h2>
          <button type="button" onClick={() => setAddOpen((value) => !value)}><Plus />Добавить</button>
        </header>
        {addOpen && (
          <form className="platform-geography-add" onSubmit={(event) => { event.preventDefault(); void addSettlement(); }}>
            <input value={settlementName} onChange={(event) => setSettlementName(event.target.value)} placeholder="Село или город" required />
            <input value={cityName} onChange={(event) => setCityName(event.target.value)} placeholder="Район (необязательно)" />
            <button type="submit" disabled={saving}>{saving ? 'Добавляем…' : 'Сохранить'}</button>
          </form>
        )}
        <label className="platform-geography-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск населённого пункта" /></label>

        {directoryQuery.isLoading && <div className="platform-state">Загружаем географию…</div>}
        {directoryQuery.isError && <div className="platform-state">Не удалось загрузить данные.<button type="button" onClick={() => void directoryQuery.refetch()}>Повторить</button></div>}
        {!directoryQuery.isLoading && !directoryQuery.isError && (
          <div className="platform-settlement-list">
            <div className="platform-settlement-list__head"><span>Населённый пункт</span><span>Рест.</span><span>Вод.</span><span>Клиенты</span></div>
            {filteredSummaries.map((item) => (
              <button type="button" key={item.settlement.id} onClick={() => setSelectedSettlement(item)}>
                <span className="platform-settlement-name"><i><MapPin /></i><span><b>{item.settlement.settlementName}</b><small>{item.settlement.cityName || 'Район не указан'}</small></span></span>
                <strong>{item.restaurants}</strong><strong>{item.drivers}</strong><strong>{item.customers}</strong><ChevronRight />
              </button>
            ))}
            {filteredSummaries.length === 0 && <p>Населённые пункты не найдены.</p>}
          </div>
        )}
      </section>

      <section className="platform-geography-card platform-request-summary">
        <header>
          <h2>Запросы на добавление <em>{directory?.requests.length ?? 0}</em></h2>
          <button type="button" onClick={() => setAllRequestsOpen((value) => !value)}>
            {allRequestsOpen ? 'Свернуть' : 'Все запросы'} <ChevronRight />
          </button>
        </header>
        <div>
          {visibleRequests.map((request) => (
            <article key={request.id}>
              <span><UserRound /></span>
              <div><b>{request.settlementName}</b><small>{request.source} · {request.count} запроса</small></div>
              <button type="button" disabled={saving} onClick={() => void addSettlement(request.settlementName, request.cityName)}>Добавить</button>
            </article>
          ))}
          {visibleRequests.length === 0 && <p>Новых запросов нет.</p>}
        </div>
      </section>

      <section className="platform-geography-card platform-geography-links">
        <button type="button" onClick={() => setTariffsOpen((value) => !value)}>
          <span><Truck /></span><span><b>Тарифы доставки</b><small>{directory?.pricingRules.length ?? 0} маршрутов настроено</small></span><ChevronRight />
        </button>
        {tariffsOpen && (
          <div className="platform-geography-panel">
            <form onSubmit={(event) => void saveTariff(event)}>
              <input value={fromSettlement} onChange={(event) => setFromSettlement(event.target.value)} placeholder="Откуда" required />
              <input value={toSettlement} onChange={(event) => setToSettlement(event.target.value)} placeholder="Куда" required />
              <input value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} type="number" min="0" placeholder="Цена" required />
              <button type="submit" disabled={saving}><Plus />Сохранить</button>
            </form>
            {directory?.pricingRules.map((rule) => <p key={rule.id}><span>{rule.fromSettlement} → {rule.toSettlement}</span><b>{formatMoney(rule.amount)}</b></p>)}
          </div>
        )}
        <button type="button" onClick={() => setApprovalsOpen((value) => !value)}>
          <span><Settings2 /></span><span><b>Правила согласования цены</b><small>Согласование цены водителем · {directory?.priceRequests.length ?? 0} новых</small></span><ChevronRight />
        </button>
        {approvalsOpen && (
          <div className="platform-geography-panel">
            {directory?.priceRequests.map((request) => (
              <article key={request.id}>
                <div><b>{request.driverName}</b><small>{formatMoney(request.currentAmount)} → {formatMoney(request.requestedAmount)}</small></div>
                <button type="button" onClick={() => void reviewPrice(request.id, true, request.requestedAmount)}><CheckCircle2 /></button>
                <button type="button" onClick={() => void reviewPrice(request.id, false)}><X /></button>
              </article>
            ))}
            {directory?.priceRequests.length === 0 && <p>Новых запросов на согласование нет.</p>}
          </div>
        )}
      </section>

      {selectedSettlement && (
        <div className="platform-settlement-modal" role="dialog" aria-modal="true">
          <button type="button" aria-label="Закрыть" onClick={() => setSelectedSettlement(null)} />
          <section>
            <header><div><small>Населённый пункт</small><h2>{selectedSettlement.settlement.settlementName}</h2></div><button type="button" onClick={() => setSelectedSettlement(null)}><X /></button></header>
            <p><MapPin />{selectedSettlement.settlement.cityName || 'Район не указан'}</p>
            <div>
              <article><Store /><small>Рестораны</small><b>{selectedSettlement.restaurants}</b></article>
              <article><Truck /><small>Водители</small><b>{selectedSettlement.drivers}</b></article>
              <article><UserRound /><small>Клиенты</small><b>{selectedSettlement.customers}</b></article>
              <article><Route /><small>Заказы</small><b>{selectedSettlement.orders}</b></article>
            </div>
            <footer><span>Оборот</span><strong>{formatMoney(selectedSettlement.turnover)}</strong></footer>
          </section>
        </div>
      )}
    </main>
  );
}
