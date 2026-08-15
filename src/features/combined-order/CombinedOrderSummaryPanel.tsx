import { useQuery } from "@tanstack/react-query";
import { Check, Clock, MapPin, PackageCheck, Store, Truck } from "lucide-react";
import { useEffect } from "react";
import {
  getCombinedOrderSummary,
  subscribeCombinedOrderSummary,
} from "../../shared/api/combinedOrderApi";

const formatPrice = (value: number) =>
  `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
const merchantStatusLabels: Record<string, string> = {
  new: "Ожидает принятия",
  waiting_payment_confirmation: "Ожидает оплаты",
  payment_confirmed: "Оплата подтверждена",
  accepted: "Принят",
  confirmed: "Принят",
  preparing: "Готовится",
  cooking: "Готовится",
  ready: "Готов",
  waiting_driver: "Ожидает курьера",
  driver_assigned: "Курьер назначен",
  assigned_driver: "Курьер назначен",
  picked_up: "Забран курьером",
  on_the_way: "В пути",
  delivered: "Доставлен",
  completed: "Выполнен",
  cancelled: "Отменён",
  canceled: "Отменён",
};

export function CombinedOrderSummaryPanel({
  primaryOrderId,
}: {
  primaryOrderId: string;
}) {
  const { data: summary, refetch } = useQuery({
    queryKey: ["combined-order-summary", primaryOrderId],
    queryFn: () => getCombinedOrderSummary(primaryOrderId),
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 1,
  });
  useEffect(() => {
    if (!summary?.orderGroupId) return undefined;
    return subscribeCombinedOrderSummary(
      summary.orderGroupId,
      summary.delivery?.id ?? null,
      () => {
        void refetch();
      },
    );
  }, [refetch, summary?.delivery?.id, summary?.orderGroupId]);

  if (!summary || summary.merchantOrders.length < 2) return null;

  return (
    <section className="combined-summary" aria-label="Объединённый заказ">
      <header>
        <span>
          <PackageCheck />
        </span>
        <div>
          <small>Один общий заказ</small>
          <h2>Объединённая доставка</h2>
        </div>
      </header>
      <div className="combined-summary__merchants">
        {summary.merchantOrders.map((order) => {
          const cancelled = ["cancelled", "canceled"].includes(order.status);
          return (
            <article data-cancelled={cancelled || undefined} key={order.id}>
              <span>{order.isAddon ? <Store /> : <PackageCheck />}</span>
              <div>
                <small>
                  {order.isAddon ? "Дополнительный заказ" : "Основной заказ"}
                </small>
                <strong>{order.merchantName}</strong>
                <em>{merchantStatusLabels[order.status] ?? order.status}</em>
                {order.estimatedReadyAt && !cancelled && (
                  <time dateTime={order.estimatedReadyAt}>
                    <Clock /> Готовность около{" "}
                    {new Date(order.estimatedReadyAt).toLocaleTimeString(
                      "ru-RU",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </time>
                )}
              </div>
              <b>{formatPrice(order.subtotal)}</b>
            </article>
          );
        })}
      </div>

      {summary.delivery && summary.delivery.stops.length > 0 && (
        <div className="combined-summary__route">
          <h3>
            <Truck /> Маршрут курьера
          </h3>
          {summary.delivery.stops.map((stop) => (
            <div
              data-complete={stop.status === "completed" || undefined}
              key={stop.id}
            >
              <span>
                {stop.status === "completed" ? <Check /> : stop.sequence}
              </span>
              <p>
                <strong>
                  {stop.type === "dropoff"
                    ? "Клиент"
                    : stop.merchantName || "Точка выдачи"}
                </strong>
                <small>
                  {stop.type === "dropoff" ? "Доставка" : "Забрать заказ"} ·{" "}
                  {stop.address}
                </small>
              </p>
              <MapPin />
            </div>
          ))}
        </div>
      )}

      <dl className="combined-summary__totals">
        <div>
          <dt>Товары</dt>
          <dd>{formatPrice(summary.merchantSubtotal)}</dd>
        </div>
        <div>
          <dt>Доставка</dt>
          <dd>{formatPrice(summary.baseDeliveryFee)}</dd>
        </div>
        <div>
          <dt>Доп. остановка</dt>
          <dd>{formatPrice(summary.addonDeliveryFee)}</dd>
        </div>
        <div>
          <dt>Итого</dt>
          <dd>{formatPrice(summary.grandTotal)}</dd>
        </div>
      </dl>
      <p className="combined-summary__note">
        Курьер заберёт оба заказа и привезёт вместе.
      </p>
    </section>
  );
}
