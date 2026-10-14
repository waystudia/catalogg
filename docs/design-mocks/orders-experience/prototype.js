(() => {
  const home = "01-home-active-order.html";
  const orders = "02-orders-fan.html";
  const live = "03-order-live.html";
  const go = (path) => {
    location.href = path;
  };
  const bind = (selector, action) =>
    document
      .querySelectorAll(selector)
      .forEach((el) => el.addEventListener("click", action));
  const message = (text) => {
    let box = document.querySelector(".demo-message");
    if (!box) {
      box = document.createElement("div");
      box.className = "demo-message";
      box.setAttribute("role", "status");
      document.querySelector(".phone").append(box);
    }
    box.textContent = text;
  };
  const tools = (label, options, change) => {
    const box = document.createElement("div");
    box.className = "demo-tools";
    const caption = document.createElement("label");
    caption.textContent = label;
    caption.htmlFor = "demo-select";
    const select = document.createElement("select");
    select.id = "demo-select";
    options.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    });
    select.addEventListener("change", () => change(select.value));
    box.append(caption, select);
    document.querySelector(".phone").prepend(box);
    return select;
  };
  document.querySelectorAll(".nav span").forEach((el, i) => {
    if (i !== 0 && i !== 3) return;
    const a = document.createElement("a");
    a.href = i === 0 ? home : orders;
    a.innerHTML = el.innerHTML;
    el.replaceChildren(a);
  });
  bind('.top button[aria-label="Назад"]', () => go(home));
  if (location.pathname.endsWith(home)) {
    bind(".active-order", () => go(live + "?state=cooking"));
    const all = document.querySelector(".section-head span");
    const a = document.createElement("a");
    a.href = orders;
    a.textContent = all.textContent;
    all.replaceChildren(a);
    tools(
      "Демо · состояние главной",
      [
        ["active", "Есть активный заказ"],
        ["empty", "Нет активных заказов"],
      ],
      (state) => {
        document.querySelector(".active-order").hidden = state === "empty";
        document.querySelector(".section-head").hidden = state === "empty";
        document.querySelector(".hint").hidden = state === "empty";
      },
    );
  }
  if (location.pathname.endsWith(orders)) {
    const fan = document.querySelector(".fan");
    const switcher = document.querySelector(".switch");
    tools(
      "Демо · вариант «Моих заказов»",
      [
        ["fan", "A · Веер с мини-экраном"],
        ["deck", "B · Горизонтальные карточки"],
        ["timeline", "C · Лента этапов"],
      ],
      (variant) => {
        fan.className =
          "fan" +
          (variant === "fan"
            ? ""
            : variant === "deck"
              ? " deck"
              : " is-open timeline");
        switcher.hidden = variant !== "fan";
        switcher.textContent = "Развернуть веер";
        document.querySelector(".note").textContent =
          variant === "deck"
            ? "Листайте карточки горизонтально."
            : variant === "timeline"
              ? "Все активные заказы видны в вертикальной ленте."
              : "Нажмите «Развернуть веер», чтобы увидеть все заказы.";
      },
    );
    document.querySelectorAll(".order").forEach((card, i) => {
      card.removeAttribute("onclick");
      if (!card.querySelector(".details")) {
        const actions = document.createElement("div");
        actions.className = "actions";
        const button = document.createElement("button");
        button.className = "details";
        button.textContent = "Подробнее о заказе";
        actions.append(button);
        card.append(actions);
      }
      card.querySelector(".details").onclick = () =>
        go(
          live +
            "?state=" +
            ["cooking", "cooking", "delivery"][i] +
            "&merchant=" +
            encodeURIComponent(
              card.querySelector(".order-head strong").textContent,
            ) +
            "&id=" +
            [5712, 5709, 5701][i] +
            "&sum=" +
            [150, 620, 890][i],
        );
    });
    bind(".more", () =>
      message("Демо: здесь будут повтор заказа и связь с рестораном."),
    );
    bind('.top button[aria-label="Обновить"]', () =>
      message("Демонстрационные статусы актуальны."),
    );
    document.querySelectorAll(".tabs button").forEach(
      (tab, i) =>
        (tab.onclick = () => {
          document
            .querySelectorAll(".tabs button")
            .forEach((t) => t.classList.toggle("active", t === tab));
          fan.hidden = i === 1;
          switcher.hidden =
            i === 1 ||
            fan.classList.contains("deck") ||
            fan.classList.contains("timeline");
          document.querySelector(".label h2").textContent =
            i === 1 ? "Завершённые" : "Текущие";
          document.querySelector(".note").textContent =
            i === 1
              ? "Завершённых заказов пока нет. Здесь появится история ваших покупок."
              : "Выберите заказ, чтобы посмотреть подробности.";
        }),
    );
  }
  if (location.pathname.endsWith(live)) {
    const states = {
      waiting: [
        "Заказ оформлен",
        "Ожидаем подтверждение",
        "обычно 2–3 мин",
        25,
      ],
      cooking: ["Заказ готовится", "Готовят заказ", "≈ 20–25 мин", 55],
      ready: ["Можно забирать", "Готов к выдаче", "Ждём вас", 100],
      delivery: ["Курьер в пути", "Едет к вам", "≈ 10–15 мин", 80],
      delay: [
        "Нужно немного времени",
        "Приготовление задерживается",
        "ещё ≈ 10 мин",
        55,
      ],
      cancelled: [
        "Заказ отменён",
        "Ресторан не смог принять заказ",
        "Оплата при получении не списывалась",
        0,
      ],
    };
    const apply = (state) => {
      const [title, stage, time, progress] = states[state] || states.waiting;
      document.querySelector(".hero h1").textContent = title;
      document.querySelector(".hero p").textContent =
        state === "cancelled"
          ? "Можно выбрать другое заведение"
          : "Демонстрационный заказ · данные для просмотра";
      document.querySelector(".eta b").textContent = stage;
      document.querySelector(".eta span").textContent = time;
      const bar = document.querySelector(".track i");
      bar.style.animation = "none";
      bar.style.width = progress + "%";
      document.querySelector(".check").textContent =
        state === "cancelled" ? "×" : state === "delay" ? "◷" : "✓";
      document.querySelector(".check").setAttribute("aria-label", title);
      document.querySelector(".live strong").textContent =
        state === "cancelled" ? "Заказ завершён" : "Демо статуса заказа";
      document.querySelector(".live small").textContent =
        "Переключайте состояния в меню над экраном";
      document.querySelector(".steps").innerHTML = (
        state === "delivery"
          ? ["Отправлен", "Принят", "В пути", "Доставлен"]
          : ["Отправлен", "Принят", "Готовится", "Готов"]
      )
        .map(
          (text, i) =>
            `<span style="color:${progress > i * 25 ? "#5b3df4" : "#667085"}">${text}</span>`,
        )
        .join("");
    };
    const select = tools(
      "Демо · состояние заказа",
      Object.entries(states).map(([key, value]) => [key, value[0]]),
      apply,
    );
    const params = new URLSearchParams(location.search);
    select.value = states[params.get("state")]
      ? params.get("state")
      : "waiting";
    apply(select.value);
    if (params.has("merchant"))
      document.querySelector(".merchant strong").textContent =
        params.get("merchant");
    if (params.has("id"))
      document.querySelector(".top span").textContent =
        "Заказ №" + params.get("id");
    if (params.has("sum")) {
      document.querySelector(".sum").textContent = params.get("sum") + " ₽";
      document.querySelector(".items div").textContent =
        "Состав заказа · " + params.get("sum") + " ₽";
    }
    if (
      params.get("id") === "5709" ||
      params.get("id") === "5701" ||
      select.value === "delivery"
    )
      document.querySelector(".merchant small").textContent =
        "Доставка курьером · Цоци-Юрт";
    bind(".primary", () => go(home));
    bind(".secondary", () =>
      message(
        "Демо: здесь откроются способы связи с рестораном. Звонок не выполняется.",
      ),
    );
    bind('.top button[aria-label="Ещё действия"]', () => go(orders));
  }
})();
