import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  Clock,
  Minus,
  PackagePlus,
  Plus,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatClientDishQuantity } from "../client-platform/clientPlatformLogic";
import {
  confirmPostOrderAddon,
  getPostOrderAddonOffer,
  initializePostOrderAddon,
  markPostOrderAddonOfferViewed,
  quotePostOrderAddon,
  type CombinedOrderAddonConfirmation,
  type CombinedOrderAddonMerchant,
  type CombinedOrderAddonQuote,
} from "../../shared/api/combinedOrderApi";
import { getClientPlatformSnapshot } from "../../shared/api/clientPlatformApi";
import { getPhotoQualityFilter } from "../../shared/photoQuality";
import {
  calculateAddonCartSubtotal,
  toCombinedOrderAddonItems,
  updateAddonCartLine,
  type AddonCartLine,
} from "./addonCart";
import "./combined-order.css";

type AddonStep = "merchants" | "catalog" | "quote" | "success";

const formatPrice = (value: number) =>
  `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
const createIdempotencyKey = (prefix: string) =>
  `${prefix}:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;

const expiresInLabel = (expiresAt: string, now: number) => {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((Date.parse(expiresAt) - now) / 1000),
  );
  if (remainingSeconds <= 0) return "Предложение завершено";
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `Доступно ещё ${minutes}:${String(seconds).padStart(2, "0")}`;
};

const restoreConfirmKey = (orderGroupId: string) => {
  const storageKey = `wayyaam:combined-order:confirm:${orderGroupId}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = createIdempotencyKey("addon-confirm");
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return createIdempotencyKey("addon-confirm");
  }
};

export function CombinedOrderAddonPanel({
  primaryOrderId,
  primaryOrderNumber,
  onCreated,
  openSignal = 0,
}: {
  primaryOrderId: string;
  primaryOrderNumber?: string;
  onCreated?: (confirmation: CombinedOrderAddonConfirmation) => void;
  openSignal?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<AddonStep>("merchants");
  const [selectedMerchant, setSelectedMerchant] =
    useState<CombinedOrderAddonMerchant | null>(null);
  const [cartLines, setCartLines] = useState<readonly AddonCartLine[]>([]);
  const [quote, setQuote] = useState<CombinedOrderAddonQuote | null>(null);
  const [confirmation, setConfirmation] =
    useState<CombinedOrderAddonConfirmation | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const viewedRef = useRef(false);
  const queryClient = useQueryClient();

  const initializationQuery = useQuery({
    queryKey: ["combined-order-initialization", primaryOrderId],
    queryFn: () => initializePostOrderAddon(primaryOrderId),
    staleTime: 30_000,
    retry: 1,
  });
  const initialization = initializationQuery.data;
  const offerQuery = useQuery({
    queryKey: ["combined-order-offer", initialization?.orderGroupId],
    queryFn: () => getPostOrderAddonOffer(initialization?.orderGroupId ?? ""),
    enabled: Boolean(initialization?.available && initialization.orderGroupId),
    staleTime: 30_000,
    retry: 1,
  });
  const offer = offerQuery.data;
  const catalogQuery = useQuery({
    queryKey: ["client-platform"],
    queryFn: getClientPlatformSnapshot,
    enabled: isOpen,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!offer?.expiresAt || confirmation) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [confirmation, offer?.expiresAt]);

  const offerExpired = Boolean(
    offer?.expiresAt && Date.parse(offer.expiresAt) <= now,
  );
  const dishes = useMemo(() => {
    if (!selectedMerchant) return [];
    return (catalogQuery.data?.dishes ?? [])
      .filter((dish) => dish.restaurantSlug === selectedMerchant.slug)
      .filter(
        (dish) =>
          dish.isAvailable !== false &&
          (dish.isUnlimited || dish.stockQuantity >= dish.minimumQuantity),
      )
      .sort(
        (left, right) =>
          Number(right.isPopular) - Number(left.isPopular) ||
          left.name.localeCompare(right.name, "ru"),
      );
  }, [catalogQuery.data?.dishes, selectedMerchant]);
  const cartSubtotal = calculateAddonCartSubtotal(cartLines, dishes);

  const openOffer = useCallback(() => {
    if (!offer?.available || offerExpired) return;
    setIsOpen(true);
    setStep(confirmation ? "success" : "merchants");
    setErrorMessage("");
    if (!viewedRef.current) {
      viewedRef.current = true;
      void markPostOrderAddonOfferViewed(offer.orderGroupId).catch(
        () => undefined,
      );
    }
  }, [confirmation, offer, offerExpired]);

  useEffect(() => {
    if (openSignal > 0) openOffer();
  }, [openOffer, openSignal]);

  const selectMerchant = (merchant: CombinedOrderAddonMerchant) => {
    setSelectedMerchant(merchant);
    setCartLines([]);
    setQuote(null);
    setErrorMessage("");
    setStep("catalog");
  };

  const requestQuote = async () => {
    if (!offer || !selectedMerchant || cartLines.length === 0 || isWorking)
      return;
    setIsWorking(true);
    setErrorMessage("");
    try {
      const nextQuote = await quotePostOrderAddon({
        orderGroupId: offer.orderGroupId,
        merchantId: selectedMerchant.id,
        items: toCombinedOrderAddonItems(cartLines, dishes),
        idempotencyKey: createIdempotencyKey("addon-quote"),
      });
      setQuote(nextQuote);
      setStep("quote");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось рассчитать добавление к доставке.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const confirmAddon = async () => {
    if (!offer || !quote || isWorking) return;
    setIsWorking(true);
    setErrorMessage("");
    try {
      const result = await confirmPostOrderAddon({
        orderGroupId: offer.orderGroupId,
        quoteId: quote.quoteId,
        quoteToken: quote.quoteToken,
        idempotencyKey: restoreConfirmKey(offer.orderGroupId),
      });
      setConfirmation(result);
      setStep("success");
      await queryClient.invalidateQueries({
        queryKey: ["combined-order-summary", primaryOrderId],
      });
      onCreated?.(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось добавить заказ.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  if (!offer?.available || offerExpired) return null;

  return (
    <section
      id="combined-order-addon-panel"
      className="combined-addon"
      aria-label="Добавить товары к текущей доставке"
    >
      <div className="combined-addon__icon">
        <PackagePlus />
      </div>
      <div className="combined-addon__copy">
        <small>
          {confirmation ? "Объединённая доставка" : "Заказ успешно оформлен"}
        </small>
        <strong>
          {confirmation
            ? "Магазин добавлен к заказу"
            : "Добавить к доставке? 🥤"}
        </strong>
        <p>
          {confirmation
            ? `Оба заказа привезёт один курьер. Общая сумма ${formatPrice(confirmation.grandTotal)}.`
            : `Напитки, снеки и другие товары из магазина по пути — всего +${formatPrice(offer.addonDeliveryFee)} к доставке.`}
        </p>
        {!confirmation && (
          <span>
            <Clock /> {expiresInLabel(offer.expiresAt, now)}
          </span>
        )}
      </div>
      <button type="button" onClick={openOffer}>
        {confirmation ? "Подробнее" : "Посмотреть"}
      </button>

      {isOpen && (
        <div
          className="combined-addon-sheet__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsOpen(false);
          }}
        >
          <section
            className="combined-addon-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="combined-addon-title"
          >
            <header>
              {step !== "merchants" && step !== "success" ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage("");
                    setStep(step === "quote" ? "catalog" : "merchants");
                  }}
                  aria-label="Назад"
                >
                  <ChevronLeft />
                </button>
              ) : (
                <span />
              )}
              <div>
                <small>
                  Добавляется к заказу{" "}
                  {primaryOrderNumber ? `№${primaryOrderNumber}` : ""}
                </small>
                <h2 id="combined-addon-title">
                  {step === "merchants"
                    ? "Магазины по пути"
                    : step === "catalog"
                      ? selectedMerchant?.name
                      : step === "quote"
                        ? "Добавить к текущей доставке"
                        : "Готово"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Закрыть"
              >
                <X />
              </button>
            </header>

            <div className="combined-addon-sheet__body">
              {step === "merchants" && (
                <div className="combined-addon-merchants">
                  <p>
                    Мы отобрали магазины без существенного крюка для курьера.
                  </p>
                  {offer.merchants.map((merchant) => (
                    <button
                      type="button"
                      onClick={() => selectMerchant(merchant)}
                      key={merchant.id}
                    >
                      <span className="combined-addon-merchant__logo">
                        {merchant.logoUrl ? (
                          <img src={merchant.logoUrl} alt="" />
                        ) : (
                          <Store />
                        )}
                      </span>
                      <span>
                        <strong>{merchant.name}</strong>
                        <small>
                          Сборка ≈{" "}
                          {Math.max(1, Math.round(merchant.assemblyMinutes))}{" "}
                          мин · крюк {merchant.extraDistanceKm.toFixed(1)} км
                        </small>
                        <em>
                          Доплата к доставке:{" "}
                          {formatPrice(offer.addonDeliveryFee)}
                        </em>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {step === "catalog" && (
                <>
                  <div className="combined-addon-mode-note">
                    <ShoppingBag />
                    <span>
                      <strong>К текущей доставке</strong>
                      <small>Адрес и курьера повторно выбирать не нужно.</small>
                    </span>
                    <b>+{formatPrice(offer.addonDeliveryFee)}</b>
                  </div>
                  {catalogQuery.isLoading ? (
                    <div
                      className="combined-addon-skeleton"
                      aria-label="Загружаем товары"
                    >
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : dishes.length === 0 ? (
                    <p className="combined-addon-empty">
                      У этого магазина сейчас нет доступных товаров.
                    </p>
                  ) : (
                    <div className="combined-addon-products">
                      {dishes.map((dish) => {
                        const quantity =
                          cartLines.find((line) => line.productId === dish.id)
                            ?.quantity ?? 0;
                        return (
                          <article key={dish.id}>
                            <img
                              src={dish.imageUrl}
                              alt=""
                              loading="lazy"
                              style={{
                                filter: getPhotoQualityFilter(
                                  dish.photoQuality,
                                ),
                              }}
                            />
                            <div>
                              <strong>{dish.name}</strong>
                              <small>{dish.description}</small>
                              <b>
                                {formatPrice(dish.price)}
                                {dish.saleUnit === "weight"
                                  ? ` / ${formatClientDishQuantity(dish, dish.priceBasisQuantity)}`
                                  : ""}
                              </b>
                            </div>
                            {quantity === 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setCartLines((lines) =>
                                    updateAddonCartLine(lines, dish, 1),
                                  )
                                }
                                aria-label={`Добавить ${dish.name}`}
                              >
                                <Plus />
                              </button>
                            ) : (
                              <span className="combined-addon-stepper">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCartLines((lines) =>
                                      updateAddonCartLine(lines, dish, -1),
                                    )
                                  }
                                  aria-label="Уменьшить"
                                >
                                  <Minus />
                                </button>
                                <b>
                                  {formatClientDishQuantity(dish, quantity)}
                                </b>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCartLines((lines) =>
                                      updateAddonCartLine(lines, dish, 1),
                                    )
                                  }
                                  aria-label="Увеличить"
                                >
                                  <Plus />
                                </button>
                              </span>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {step === "quote" && quote && selectedMerchant && (
                <div className="combined-addon-quote">
                  <strong>Магазин «{selectedMerchant.name}»</strong>
                  {cartLines.map((line) => {
                    const dish = dishes.find(
                      (item) => item.id === line.productId,
                    );
                    return dish ? (
                      <span key={line.productId}>
                        <small>
                          {dish.name} ×{" "}
                          {formatClientDishQuantity(dish, line.quantity)}
                        </small>
                        <b>
                          {formatPrice(
                            Math.round(
                              (dish.price * line.quantity) /
                                Math.max(1, dish.priceBasisQuantity),
                            ),
                          )}
                        </b>
                      </span>
                    ) : null;
                  })}
                  <span>
                    <small>Товары</small>
                    <b>{formatPrice(quote.itemsSubtotal)}</b>
                  </span>
                  <span>
                    <small>Доплата к доставке</small>
                    <b>{formatPrice(quote.addonDeliveryFee)}</b>
                  </span>
                  <span className="combined-addon-quote__total">
                    <strong>Дополнительно</strong>
                    <strong>{formatPrice(quote.total)}</strong>
                  </span>
                  <p>
                    Цена и маршрут повторно проверятся сервером перед созданием
                    заказа.
                  </p>
                </div>
              )}

              {step === "success" && confirmation && (
                <div className="combined-addon-success">
                  <span>
                    <Check />
                  </span>
                  <h3>Заказ магазина добавлен</h3>
                  <p>
                    Магазин и ресторан получили отдельные подзаказы. Курьер
                    заберёт оба и привезёт вместе.
                  </p>
                  <dl>
                    <div>
                      <dt>Товары магазина</dt>
                      <dd>{formatPrice(confirmation.merchantSubtotal)}</dd>
                    </div>
                    <div>
                      <dt>Доп. остановка</dt>
                      <dd>{formatPrice(confirmation.addonDeliveryFee)}</dd>
                    </div>
                    <div>
                      <dt>Общий итог</dt>
                      <dd>{formatPrice(confirmation.grandTotal)}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {errorMessage && (
                <p className="combined-addon-error" role="alert">
                  {errorMessage}
                </p>
              )}
            </div>

            <footer>
              {step === "catalog" && (
                <button
                  type="button"
                  onClick={() => void requestQuote()}
                  disabled={cartLines.length === 0 || isWorking}
                >
                  {isWorking
                    ? "Рассчитываем…"
                    : `Продолжить · ${formatPrice(cartSubtotal + offer.addonDeliveryFee)}`}
                </button>
              )}
              {step === "quote" && quote && (
                <button
                  type="button"
                  onClick={() => void confirmAddon()}
                  disabled={isWorking}
                >
                  {isWorking
                    ? "Добавляем…"
                    : `Добавить к заказу · ${formatPrice(quote.total)}`}
                </button>
              )}
              {step === "success" && (
                <button type="button" onClick={() => setIsOpen(false)}>
                  Понятно
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
