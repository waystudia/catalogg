import React, { useState, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  MapPin,
  ChevronDown,
  Bell,
  Search,
  Home,
  Store,
  ShoppingCart,
  ReceiptText,
  CircleUserRound,
  ArrowLeft,
  ArrowRight,
  Check,
  Phone,
  Clock,
  Heart,
  Repeat2,
  Star,
  PackageCheck,
} from "lucide-react";
import "../../../src/app/styles.css";
import "../../../src/pages/client-platform/client-platform.css";
import "./project-preview.css";

const initial = location.pathname.includes("02-orders")
  ? "orders"
  : location.pathname.includes("03-order")
    ? "detail"
    : "home";
const testItems = [
  { name: "Жижиг-галнаш", price: 450, quantity: 2, image: "zhizhig-galnash" },
  { name: "Стейк на кости", price: 850, quantity: 1, image: "bone-steak" },
  { name: "Комбо шаурма", price: 390, quantity: 2, image: "shawarma-combo" },
  {
    name: "Овощи на гриле",
    price: 250,
    quantity: 1,
    image: "grilled-vegetables",
  },
  { name: "Фирменный соус", price: 70, quantity: 2, image: "signature-sauce" },
  { name: "Айран", price: 150, quantity: 1, image: "ayran" },
  {
    name: "Клубничный лимонад",
    price: 180,
    quantity: 1,
    image: "strawberry-lemonade",
  },
  { name: "Чеченский чай", price: 120, quantity: 1, image: "chechen-tea" },
  { name: "Тархун", price: 160, quantity: 1, image: "tarhun" },
  { name: "Яблочный сок", price: 130, quantity: 1, image: "apple-juice" },
];
const testTotal = testItems.reduce(
  (sum, item) => sum + item.price * item.quantity,
  0,
);
function TestOrderItems() {
  return (
    <div className="test-order-items">
      <h3>Состав заказа · 10 позиций</h3>
      {testItems.map((item) => (
        <div className="order-live-product" key={item.name}>
          <img src={`/assets/mangal-demo/products/${item.image}.webp`} alt="" />
          <span>
            {item.name}
            <small>
              {item.quantity} × {item.price} ₽
            </small>
          </span>
          <b>{item.quantity * item.price} ₽</b>
        </div>
      ))}
      <div className="test-order-total">
        <strong>Итого</strong>
        <strong>{testTotal} ₽</strong>
      </div>
      <p className="preview-muted">Наличными при получении</p>
    </div>
  );
}
const samples = [
  {
    name: "Мангал",
    id: "5712",
    sum: String(testTotal),
    item: "Жижиг-галнаш и ещё 9 позиций",
    image: "/assets/mangal-demo/products/ayran.webp",
    state: "waiting",
  },
  {
    name: "Финик",
    id: "5709",
    sum: "620",
    item: "Круассан классический × 2",
    image:
      "/assets/template-coffee-shop/products/bakery/classic-croissant.webp",
    state: "cooking",
  },
  {
    name: "Мангал",
    id: "5701",
    sum: "450",
    item: "Заказ из ресторана",
    image: "/assets/mangal-demo/products/ayran.webp",
    state: "delivery",
  },
];
const states = {
  waiting: {
    title: "Заказ отправлен",
    text: "Ожидает принятия",
    hint: "Ресторан скоро подтвердит заказ",
    step: 1,
  },
  cooking: {
    title: "Заказ готовится",
    text: "Готовят заказ",
    hint: "Ориентировочно 20–25 минут",
    step: 2,
  },
  ready: {
    title: "Заказ готов",
    text: "Можно забирать",
    hint: "Самовывоз · ул. Центральная, 12",
    step: 4,
  },
  delivery: {
    title: "Курьер в пути",
    text: "Заказ едет к вам",
    hint: "Ориентировочно 10–15 минут",
    step: 3,
  },
  delay: {
    title: "Готовим чуть дольше",
    text: "Заказ задерживается",
    hint: "Ориентировочно ещё 10 минут",
    step: 2,
  },
  cancelled: {
    title: "Заказ отменён",
    text: "Ресторан не принял заказ",
    hint: "При оплате наличными списания не было",
    step: 0,
  },
};
type Stage = keyof typeof states;
function App() {
  const [screen, setScreen] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [stage, setStage] = useState<Stage>(
    initial === "detail" ? "waiting" : "cooking",
  );
  const [variant, setVariant] = useState("fan");
  const [expanded, setExpanded] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  const previousLayout = useRef<
    { top: number; left: number; width: number }[] | null
  >(null);
  function toggleExpanded() {
    previousLayout.current = Array.from(stackRef.current?.children ?? []).map(
      (el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width };
      },
    );
    setExpanded((value) => !value);
  }
  useLayoutEffect(() => {
    const previous = previousLayout.current;
    previousLayout.current = null;
    if (
      !previous ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animations = Array.from(stackRef.current?.children ?? []).map(
      (el, i) => {
        const next = el.getBoundingClientRect();
        const before = previous[i];
        return el.animate(
          [
            {
              transform: `translate(${before.left - next.left}px, ${before.top - next.top}px) scaleX(${before.width / next.width})`,
              transformOrigin: "top left",
            },
            { transform: "none", transformOrigin: "top left" },
          ],
          { duration: 600, easing: "cubic-bezier(.22,1,.36,1)" },
        );
      },
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [expanded]);
  const [empty, setEmpty] = useState(false);
  const [history, setHistory] = useState(false);
  const [notice, setNotice] = useState("");
  const order = samples[selected];
  const status = states[stage];
  function navigate(next: string) {
    setScreen(next);
    setNotice("");
    window.scrollTo(0, 0);
  }
  function open(i: number) {
    setSelected(i);
    setStage(samples[i].state as Stage);
    navigate("detail");
  }
  const progress = (step: number) => (
    <div className="order-preview-progress" aria-label={`Этап ${step} из 4`}>
      {[1, 2, 3, 4].map((n) => (
        <i key={n} className={n <= step ? "done" : ""} />
      ))}
    </div>
  );
  return (
    <>
      <aside className="preview-toolbar">
        <span>Макет на стилях проекта</span>
        {screen === "orders" ? (
          <select
            aria-label="Вариант карточек"
            value={variant}
            onChange={(e) => {
              setVariant(e.target.value);
              setExpanded(false);
            }}
          >
            <option value="fan">A · Веер</option>
            <option value="deck">B · Горизонтально</option>
            <option value="list">C · Список</option>
          </select>
        ) : screen === "detail" ? (
          <select
            aria-label="Состояние заказа"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
          >
            {Object.entries(states).map(([key, value]) => (
              <option key={key} value={key}>
                {value.title}
              </option>
            ))}
          </select>
        ) : (
          <button onClick={() => setEmpty(!empty)}>
            {empty ? "Показать заказ" : "Без активного заказа"}
          </button>
        )}
      </aside>
      <div className="client-platform platform-theme">
        <main className="platform-page">
          {screen === "home" ? (
            <>
              <header className="home-topbar">
                <button
                  className="city-pill"
                  onClick={() => setNotice("В макете выбран Цоци-Юрт")}
                >
                  <MapPin />
                  <span>Цоци-Юрт</span>
                  <ChevronDown />
                </button>
                <button
                  className="icon-button notification-button has-unread"
                  aria-label="Уведомления"
                  onClick={() => setNotice("Новых уведомлений нет")}
                >
                  <Bell />
                </button>
              </header>
              <div className="platform-search platform-search--home">
                <Search />
                <span>Что хотите заказать?</span>
              </div>
              <section className="promo-carousel" aria-label="Баннеры">
                <div className="promo-carousel__track">
                  <article className="promo-band promo-band--media">
                    <span className="promo-band__media">
                      <img
                        src="https://api.wayyaam.ru/storage/v1/object/public/platform-banner-media/2026-08-10/2328c283-7185-4c58-a8fa-cae333e56b4e.png"
                        alt="Конкурс WayYaam"
                      />
                    </span>
                    <div className="promo-band__copy promo-band__copy--top-left">
                      <strong>Конкурс</strong>
                    </div>
                    <a
                      href="#promo"
                      className="promo-band__action promo-band__action--bottom-left"
                      onClick={() => setNotice("Баннер из текущего проекта")}
                    >
                      Подробнее
                    </a>
                  </article>
                </div>
                <div className="preview-dots">
                  <i />
                  <i className="active" />
                </div>
              </section>
              {!empty && (
                <button className="home-order-strip" onClick={() => open(0)}>
                  <span className="home-order-strip__icon">
                    <ReceiptText />
                  </span>
                  <span>
                    <strong>Мангал · заказ №5712</strong>
                    <small>Ожидает принятия · {testTotal} ₽ · 10 позиций</small>
                    {progress(1)}
                  </span>
                  <ArrowRight />
                </button>
              )}
              <div className="marketplace-section-heading">
                <h2>Рядом с вами</h2>
                <p>83 позиции</p>
              </div>
              <div className="marketplace-feed-grid">
                {samples.slice(0, 2).map((item, i) => (
                  <article key={item.id} className="marketplace-product-card">
                    <div className="marketplace-product-card__media">
                      <img src={item.image} alt={item.item} />
                    </div>
                    <button
                      className="marketplace-product-card__favorite"
                      aria-label={`В избранное: ${item.item}`}
                      onClick={() =>
                        setNotice("Добавлено в избранное в макете")
                      }
                    >
                      <Heart />
                    </button>
                    <div className="marketplace-product-card__body">
                      <strong>
                        {i === 0 ? "Айран" : "Круассан классический"}
                      </strong>
                      <small>{item.name}</small>
                      <div className="marketplace-product-card__bottom">
                        <b>{i === 0 ? "150" : "310"} ₽</b>
                        <button
                          className="marketplace-product-card__action"
                          aria-label="Открыть оформление"
                          onClick={() => navigate("checkout")}
                        >
                          <ArrowRight />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <>
              <header className="platform-header">
                <button
                  className="icon-button"
                  aria-label="Назад"
                  onClick={() =>
                    navigate(screen === "detail" ? "orders" : "home")
                  }
                >
                  <ArrowLeft />
                </button>
                <h1>
                  {screen === "orders"
                    ? "Мои заказы"
                    : screen === "checkout"
                      ? "Оформление заказа"
                      : `Заказ №${order.id}`}
                </h1>
                <span className="platform-header__action" />
              </header>
              {screen === "orders" ? (
                <>
                  <div className="marketplace-filter-row">
                    <button
                      className={!history ? "is-active" : ""}
                      onClick={() => setHistory(false)}
                    >
                      Текущие · 3
                    </button>
                    <button
                      className={history ? "is-active" : ""}
                      onClick={() => setHistory(true)}
                    >
                      Завершённые
                    </button>
                  </div>
                  {history ? (
                    <section className="empty-state">
                      <PackageCheck />
                      <strong>Завершённых заказов пока нет</strong>
                    </section>
                  ) : (
                    <section className="plain-section">
                      <h2>Текущие</h2>
                      <div
                        ref={stackRef}
                        className={`order-preview-stack ${variant} ${expanded ? "expanded" : ""}`}
                      >
                        {samples.map((item, i) => (
                          <article
                            className="order-card order-preview-card"
                            key={item.id}
                          >
                            <span className="order-card__summary">
                              <strong>{item.name}</strong>
                              <small>15.10.2026 · {item.sum} ₽</small>
                              <em>{states[item.state as Stage].text}</em>
                            </span>
                            <button
                              className="order-preview-expand"
                              aria-label={`Открыть заказ ${item.id}`}
                              onClick={() => open(i)}
                            >
                              <ArrowRight />
                            </button>
                            <button
                              className="order-mini-screen"
                              onClick={() => open(i)}
                            >
                              <span className="order-mini-screen__title">
                                <Clock />
                                <strong>
                                  {states[item.state as Stage].title}
                                </strong>
                              </span>
                              {progress(states[item.state as Stage].step)}
                              <small>{states[item.state as Stage].hint}</small>
                              <span className="order-mini-screen__product">
                                <img src={item.image} alt="" />
                                <span>{item.item}</span>
                                <ReceiptText />
                              </span>
                            </button>
                            <div className="order-card__actions">
                              <button onClick={() => open(i)}>
                                <ReceiptText />
                                Подробнее о заказе
                              </button>
                              <button
                                onClick={() =>
                                  setNotice(
                                    "Повтор заказа доступен после внедрения",
                                  )
                                }
                              >
                                <Repeat2 />
                                Повторить
                              </button>
                              <button
                                onClick={() =>
                                  setNotice(
                                    "Отзыв доступен после получения заказа",
                                  )
                                }
                              >
                                <Star />
                                Отзыв
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {variant === "fan" && (
                        <button
                          className="marketplace-load-more"
                          onClick={toggleExpanded}
                        >
                          {expanded
                            ? "Свернуть заказы"
                            : "Показать все 3 заказа"}
                          <ChevronDown />
                        </button>
                      )}
                    </section>
                  )}
                </>
              ) : screen === "checkout" ? (
                <section className="plain-section">
                  <h2>Мангал</h2>
                  <article className="order-card">
                    <span className="order-card__summary">
                      <strong>10 позиций · 13 шт.</strong>
                      <small>Самовывоз · ул. Центральная, 12</small>
                      <small>Наличными при получении</small>
                    </span>
                    <b>{testTotal} ₽</b>
                  </article>
                  <TestOrderItems />
                  <p className="preview-muted">
                    Тестовый заказ: 10 позиций, цены демонстрационные
                  </p>
                  <button
                    className="order-preview-primary"
                    onClick={() => {
                      setSelected(0);
                      setStage("waiting");
                      navigate("detail");
                    }}
                  >
                    Отправить заказ <ArrowRight />
                  </button>
                </section>
              ) : (
                <section className="order-live-panel" key={selected}>
                  <div
                    className={`order-live-check ${stage === "cancelled" ? "cancelled" : ""}`}
                  >
                    {stage === "cancelled" ? (
                      <span>×</span>
                    ) : stage === "delay" ? (
                      <Clock />
                    ) : (
                      <Check />
                    )}
                  </div>
                  <h2>{status.title}</h2>
                  <p className="preview-muted">{status.hint}</p>
                  <article className="order-card order-live-card">
                    <span className="order-card__summary">
                      <strong>{order.name}</strong>
                      <small>
                        {selected === 0 ? "Самовывоз" : "Доставка курьером"} ·
                        Цоци-Юрт
                      </small>
                    </span>
                    <b>{order.sum} ₽</b>
                    <div className="order-live-status">
                      <strong>{status.text}</strong>
                      {progress(status.step)}
                      <div className="order-live-steps">
                        <span>Отправлен</span>
                        <span>Принят</span>
                        <span>{selected === 0 ? "Готовится" : "В пути"}</span>
                        <span>{selected === 0 ? "Готов" : "Доставлен"}</span>
                      </div>
                    </div>
                    {selected === 0 ? (
                      <TestOrderItems />
                    ) : (
                      <div className="order-live-product">
                        <img src={order.image} alt="" />
                        <span>
                          {order.item}
                          <small>Наличными при получении</small>
                        </span>
                      </div>
                    )}
                    <div className="order-card__actions">
                      <button
                        onClick={() =>
                          setNotice("Демо: здесь будут контакты ресторана")
                        }
                      >
                        <Phone />
                        Ресторан
                      </button>
                      <button onClick={() => navigate("orders")}>
                        <ReceiptText />
                        Все заказы
                      </button>
                    </div>
                  </article>
                  <button
                    className="order-preview-primary"
                    onClick={() => navigate("home")}
                  >
                    На главную
                  </button>
                </section>
              )}
            </>
          )}
          {notice && (
            <p className="preview-notice" role="status">
              {notice}
            </p>
          )}
        </main>
        <nav className="bottom-nav" aria-label="Основная навигация">
          {(
            [
              [Home, "Главная", "home"],
              [Store, "Категории", "categories"],
              [ShoppingCart, "Корзина", "checkout"],
              [ReceiptText, "Заказы", "orders"],
              [CircleUserRound, "Профиль", "profile"],
            ] as const
          ).map(([Icon, label, target]) => (
            <a
              key={String(target)}
              href={"#" + target}
              className={screen === target ? "is-active" : ""}
              onClick={(e) => {
                e.preventDefault();
                if (target === "categories" || target === "profile")
                  setNotice("Этот раздел остаётся как в текущем проекте");
                else navigate(String(target));
              }}
            >
              <span className="bottom-nav__icon">
                <Icon />
              </span>
              <span>{String(label)}</span>
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
