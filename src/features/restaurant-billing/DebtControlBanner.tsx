import { AlertTriangle, Clock3, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BillingDebtStatus } from '../../shared/api/billingDebtApi';
import { getDebtControlState } from './debtControl';
import './debt-control-banner.css';

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const formatDebtCountdown = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':');
};

export function DebtControlBanner({
  status,
  accountLabel,
  now
}: {
  status: BillingDebtStatus | null;
  accountLabel: 'ресторана' | 'водителя';
  now?: Date;
}) {
  const [clock, setClock] = useState(() => now ?? new Date());

  useEffect(() => {
    if (now) {
      setClock(now);
      return undefined;
    }
    const intervalId = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [now]);

  if (!status) return null;
  const state = getDebtControlState({ ...status, now: clock });
  if (state.tone === 'clear') return null;

  const isDriver = status.accountType === 'driver';
  const workLabel = isDriver ? 'доставки' : 'заказы';
  const workGenitive = isDriver ? 'доставок' : 'заказов';
  const Icon = state.tone === 'warning' ? AlertTriangle : state.tone === 'countdown' ? Clock3 : ShieldAlert;

  return (
    <section className={`debt-control-banner debt-control-banner--${state.tone}`} role="status" aria-label={`Задолженность ${accountLabel}`}>
      <Icon aria-hidden="true" />
      <div>
        <strong>
          {state.tone === 'warning'
            ? 'Задолженность приближается к лимиту'
            : state.tone === 'countdown'
              ? `До ограничения новых ${workGenitive}`
              : `Новые ${workLabel} временно заблокированы`}
        </strong>
        <p>{formatMoney(status.debtAmount)} из {formatMoney(status.limitAmount)}</p>
        {state.tone === 'warning' && <small>Новые {workLabel} продолжают поступать. Погасите долг до достижения лимита.</small>}
        {state.tone === 'countdown' && (
          <>
            <b className="debt-control-banner__countdown">{formatDebtCountdown(state.secondsRemaining ?? 0)}</b>
            <small>{isDriver ? 'Текущую доставку можно завершить.' : 'Текущие заказы можно завершить.'} Погасите долг до окончания отсчёта.</small>
          </>
        )}
        {state.tone === 'blocked' && (
          <small>Погасите долг WayYaam, чтобы автоматически возобновить новые {workLabel}. Текущая работа не прерывается.</small>
        )}
      </div>
    </section>
  );
}
