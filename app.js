// BuildEngine owner admin app. Talks only to the `admin` edge function; the server checks the
// session on every call. Everything people wrote (names, comments, feedback) is put on the page
// as plain text (textContent), never as HTML, so a crafted comment can't run code here.
"use strict";

const API = "https://hvleqwnawexcyxiciehu.supabase.co/functions/v1/admin";
const KEY = "be.admin.session";
const app = document.getElementById("app");

const REASONS = { spam: "спам", offensive: "оскорбление", fake: "фейк / обман", other: "другое" };
const PAGES = { home: "Сборки", builder: "Конфигуратор", stores: "Магазины", tips: "На чай", other: "Другое" };
const PLATFORMS = { ios: "iPhone", android: "Android", web: "сайт" };
const TABS = [
  ["summary", "Сводка"], ["visits", "Люди"], ["search", "Поиск"], ["reports", "Жалобы"],
  ["feedback", "Отзывы"], ["ai", "Engine AI"], ["crashes", "Ошибки"], ["log", "Журнал"],
];

// ── tiny DOM helper: strings and numbers always become text nodes ──
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const show = (...nodes) => app.replaceChildren(...nodes);
const when = (iso) =>
  iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
const dayLabel = (d) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(d + "T00:00:00Z"));
const money = (n) => `₪${Number(n || 0).toLocaleString("ru-RU")}`;
function toast(text) {
  const t = h("div", { class: "toast" }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

// ── server ──
async function call(action, extra = {}) {
  const session = localStorage.getItem(KEY);
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", ...(session ? { "x-admin-session": session } : {}) },
      body: JSON.stringify({ action, ...extra }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Нет связи с сервером. Проверь интернет.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.error === "NO_SESSION") {
    localStorage.removeItem(KEY);
    renderLogin("Вход истёк — войди снова.");
    throw new Error("NO_SESSION");
  }
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

// ── login ──
function renderLogin(message = "") {
  const err = h("div", { class: "err" }, message);
  const pass = h("input", { type: "password", autocomplete: "current-password", name: "password", placeholder: "Пароль" });
  const code = h("input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", name: "code", maxlength: "6", placeholder: "6 цифр" });
  const btn = h("button", { class: "btn" }, "Войти");
  const go = async () => {
    err.textContent = "";
    if (!pass.value || !/^\d{6}$/.test(code.value.trim())) {
      err.textContent = "Введи пароль и 6 цифр из «Паролей».";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Проверяю…";
    try {
      const r = await call("login", { password: pass.value, code: code.value.trim() });
      localStorage.setItem(KEY, r.session);
      pass.value = "";
      renderMain("summary");
    } catch (e) {
      const m = String(e.message);
      err.textContent = m === "WRONG" ? "Неверный пароль или код." : m === "LOCKED" ? "Слишком много ошибок — вход закрыт на 15 минут." : m;
      btn.disabled = false;
      btn.textContent = "Войти";
    }
  };
  btn.addEventListener("click", go);
  code.addEventListener("keydown", (e) => e.key === "Enter" && go());
  show(
    h("section", { class: "login" },
      h("img", { class: "logo", src: "icon-180.png", alt: "" }),
      h("h1", {}, "BuildEngine Админ"),
      h("p", { class: "muted" }, "Только для владельца. Пароль и код — из приложения «Пароли» на iPhone."),
      h("input", { type: "text", name: "username", autocomplete: "username", value: "BuildEngine Admin", hidden: true, readonly: true }),
      h("label", {}, "Пароль"), pass,
      h("label", {}, "Код проверки"), code,
      btn, err,
    ),
  );
}

// ── main frame ──
let current = "summary";
let badges = {};
function renderMain(tab) {
  current = tab;
  const body = h("div", {}, h("div", { class: "empty" }, "Загружаю…"));
  const logout = h("button", { class: "ghost", onclick: async () => {
    if (!confirm("Выйти из админки на этом телефоне?")) return;
    try { await call("logout"); } catch { /* the session goes anyway */ }
    localStorage.removeItem(KEY);
    renderLogin();
  } }, "Выйти");
  show(
    h("div", { class: "top" }, h("img", { class: "logo", src: "icon-180.png", alt: "" }), h("div", { class: "title" }, "BuildEngine ", h("span", {}, "Админ")), logout),
    h("nav", { class: "tabs" }, TABS.map(([id, label]) =>
      h("button", { class: `tab${id === tab ? " on" : ""}`, onclick: () => renderMain(id) }, label, badges[id] ? h("span", { class: "badge" }, badges[id]) : null))),
    body,
  );
  VIEWS[tab](body).catch((e) => {
    if (e.message !== "NO_SESSION") body.replaceChildren(h("div", { class: "empty" }, e.message, h("br"), h("button", { class: "ghost", onclick: () => renderMain(tab) }, "Повторить")));
  });
}

async function remove(type, id, what, after) {
  if (!confirm(`Удалить ${what}? Это насовсем (копия останется в журнале).`)) return;
  try {
    await call("delete", { type, id });
    toast("Удалено");
    after();
  } catch (e) {
    if (e.message !== "NO_SESSION") alert(e.message === "NOT_FOUND" ? "Уже удалено." : e.message);
    after();
  }
}
const stat = (n, label, sub, warn) => h("div", { class: `stat${warn ? " warn" : ""}` }, h("div", { class: "n" }, n), h("div", { class: "l" }, label), sub ? h("div", { class: "s" }, sub) : null);
const byPlatform = (p) => Object.entries(PLATFORMS).filter(([k]) => p[k]).map(([k, l]) => `${l} ${p[k]}`).join(" · ");
const empty = (text) => h("div", { class: "empty" }, text);

const shortDay = (d) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(d + "T00:00:00Z"));
const initial = (name) => (String(name || "?").trim()[0] || "?").toUpperCase();
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const israelHour = (iso) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
const dayKey = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - offset * 864e5));
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
function columns(values, labels) {
  const max = Math.max(1, ...values);
  const box = h("div", { class: "cols" }, values.map((v, i) => h("div", { class: "c" }, h("b", { "data-h": (100 * v) / max, title: String(v) }), h("span", {}, labels[i]))));
  queueMicrotask(() => box.querySelectorAll("[data-h]").forEach((el) => (el.style.height = `${Math.max(2, el.dataset.h * 0.75)}%`)));
  return box;
}

/** Everything the server knows about one device (person), with the usual delete buttons. */
async function openPerson(out, hash, back) {
  out.replaceChildren(empty("Загружаю…"));
  let p;
  try {
    p = await call("person", { hash });
  } catch (e) {
    if (e.message !== "NO_SESSION") out.replaceChildren(h("button", { class: "ghost back", onclick: back }, "‹ Назад"), empty(e.message));
    return;
  }
  const again = () => openPerson(out, hash, back);
  const visits = p.visits;
  const days = new Set(visits.map((v) => v.day));
  const platforms = [...new Set(visits.map((v) => v.platform))];
  const first = visits[0]?.day, last = visits.at(-1)?.day, today = dayKey(0);
  const inLast = (n) => visits.filter((v) => daysBetween(v.day, today) < n).length;
  const tipsIls = p.tips.reduce((s, t) => s + Number(t.amount_ils), 0);
  const title = (id) => p.titles.find((t) => t.id === id);
  const weekday = Array(7).fill(0);
  for (const v of visits) weekday[(new Date(v.day + "T12:00:00Z").getUTCDay() + 6) % 7]++;
  const timed = visits.filter((v) => v.first_at);
  const hours = Array(8).fill(0); // 3-hour blocks
  for (const v of timed) hours[Math.floor(israelHour(v.first_at) / 3)]++;
  const platformOf = new Map(visits.map((v) => [v.day, v.platform]));
  const calendar = Array.from({ length: 60 }, (_, i) => dayKey(59 - i));

  out.replaceChildren(...[
    h("button", { class: "ghost back", onclick: back }, "‹ Назад к поиску"),
    h("div", { class: "person-head" },
      h("span", { class: "avatar" }, initial(p.name)),
      h("div", { class: "grow" },
        h("div", { class: "name" }, p.name || "Без ника"),
        h("div", { class: "chips" },
          platforms.map((k) => h("span", { class: "chip" }, PLATFORMS[k] || k)),
          p.reservedName ? h("span", { class: "chip" }, `ник с ${when(p.nameSince)}`) : h("span", { class: "chip" }, "ник не занят")))),
    h("div", { class: "grid3" },
      stat(days.size, "дней в приложении"),
      stat(inLast(7), "из последних 7"),
      stat(inLast(30), "из последних 30"),
      stat(first ? shortDay(first) : "—", "первый раз"),
      stat(last ? shortDay(last) : "—", "последний раз"),
      stat(money(tipsIls), `чаевые (${p.tips.length})`),
      stat(p.builds.length, "сборок"),
      stat(p.comments.length, "комментариев"),
      stat(p.likes.length, "лайков поставил")),
    h("h2", {}, "Последние 60 дней (цвет = устройство)"),
    h("div", { class: "card" },
      h("div", { class: "days" }, calendar.map((d) => h("i", { class: days.has(d) ? platformOf.get(d) : "", title: dayLabel(d) }))),
      h("div", { class: "legend" }, ["ios", "android", "web"].map((k) => h("span", {}, h("i", { class: k }), PLATFORMS[k])))),
    h("h2", {}, "По дням недели"),
    h("div", { class: "card" }, columns(weekday, WEEKDAYS)),
    h("h2", {}, "Во сколько впервые открывает за день"),
    timed.length
      ? h("div", { class: "card" }, columns(hours, ["0–3", "3–6", "6–9", "9–12", "12–15", "15–18", "18–21", "21–24"]))
      : empty("Время записывается с 04.11 — появится, когда человек снова зайдёт."),
    p.builds.length ? [h("h2", {}, `Сборки (${p.builds.length})`), p.builds.map((b) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "who" }, b.title), h("span", { class: "when" }, when(b.created_at))),
      h("div", { class: "muted" }, `${money(b.price_ils)} · ♥ ${b.favorite_count} · 💬 ${b.comment_count}${b.tags?.length ? " · " + b.tags.join(" ") : ""}`),
      h("div", { class: "actions" }, h("button", { class: "danger", onclick: () => remove("build", b.id, `сборку «${b.title}»`, again) }, "Удалить сборку"))))] : null,
    p.comments.length ? [h("h2", {}, `Комментарии (${p.comments.length})`), p.comments.map((c) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "muted" }, `к «${title(c.build_id)?.title ?? "удалённой сборке"}»`), h("span", { class: "when" }, when(c.created_at))),
      h("div", { class: "body" }, c.message),
      h("div", { class: "actions" }, h("button", { class: "danger", onclick: () => remove("comment", c.id, "комментарий", again) }, "Удалить"))))] : null,
    p.likes.length ? [h("h2", {}, `Лайкнул (${p.likes.length})`), h("div", { class: "card" }, p.likes.map((l) => h("div", { class: "row" },
      h("div", { class: "grow" }, `♥ ${title(l.build_id)?.title ?? "удалённая сборка"}`, h("span", { class: "muted" }, title(l.build_id) ? ` — ${title(l.build_id).author_name}` : "")),
      h("span", { class: "muted" }, when(l.created_at)))))] : null,
    p.tips.length ? [h("h2", {}, `Чаевые (${p.tips.length}) — по нику`), p.tips.map((t) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "who" }, money(t.amount_ils)), h("span", { class: "when" }, when(t.created_at))),
      h("div", { class: "actions" }, h("button", { class: "danger", onclick: () => remove("tip", t.id, "эти чаевые со стены", again) }, "Убрать со стены"))))] : null,
    p.reportsSent.length ? [h("h2", {}, `Жаловался (${p.reportsSent.length})`), h("div", { class: "card" }, p.reportsSent.map((x) => h("div", { class: "row" },
      h("div", { class: "grow" }, `${x.target_type === "build" ? "на сборку" : "на комментарий"} — ${REASONS[x.reason] || x.reason}`), h("span", { class: "muted" }, when(x.created_at)))))] : null,
    h("p", { class: "muted" }, "Устройство = одна установка приложения. Если человек переустановит приложение или зайдёт с другого телефона, это будет новый «человек»."),
  ].flat(Infinity).filter(Boolean));
  window.scrollTo(0, 0);
}

const VIEWS = {
  async summary(box) {
    const s = await call("summary");
    badges = { reports: s.reports, crashes: s.newCrashes };
    box.replaceChildren(
      h("h2", {}, "Люди (устройства)"),
      h("div", { class: "grid" },
        stat(s.today.total, "сегодня", byPlatform(s.today)),
        stat(s.yesterday.total, "вчера", byPlatform(s.yesterday))),
      h("h2", {}, "Сообщество"),
      h("div", { class: "grid" },
        stat(s.builds, "сборок всего", s.builds24 ? `+${s.builds24} за сутки` : "за сутки новых нет"),
        stat(s.comments, "комментариев", s.comments24 ? `+${s.comments24} за сутки` : "за сутки новых нет"),
        stat(s.reports, "жалоб ждут", s.reports ? "открой «Жалобы»" : "всё чисто", s.reports > 0),
        stat(s.newCrashes, "новых ошибок", s.newCrashes ? "открой «Ошибки»" : "всё чисто", s.newCrashes > 0)),
      h("h2", {}, "Чаевые"),
      h("div", { class: "grid" },
        stat(money(s.tipsIls), "на стене всего", `${s.tips} чел.`),
        stat(s.tips24, "за сутки", "")),
      h("h2", {}, "Сервер"),
      h("div", { class: "grid" }, stat(`${s.dbMb} МБ`, "база из 500 МБ бесплатно", s.dbMb > 400 ? "скоро нужен план Pro" : "места хватает", s.dbMb > 400)),
      h("p", { class: "muted"}, "Люди = разные устройства за день, каждое считается один раз. Точное число, без догадок."),
    );
    // refresh the tab badges
    document.querySelectorAll(".tab").forEach((b, i) => {
      const id = TABS[i][0];
      b.querySelector(".badge")?.remove();
      if (badges[id]) b.append(h("span", { class: "badge" }, badges[id]));
    });
  },

  async visits(box) {
    const v = await call("visits");
    const days = new Map();
    for (const r of v.days) {
      const d = days.get(r.day) || { total: 0 };
      d[r.platform] = Number(r.people);
      d.total += Number(r.people);
      days.set(r.day, d);
    }
    const max = Math.max(1, ...[...days.values()].map((d) => d.total));
    box.replaceChildren(
      h("div", { class: "grid" }, stat(v.unique7, "разных устройств за 7 дней"), stat(v.unique30, "за 30 дней")),
      h("h2", {}, "По дням"),
      h("div", { class: "legend" }, ["ios", "android", "web"].map((k) => h("span", {}, h("i", { class: k }), PLATFORMS[k]))),
      days.size
        ? h("div", { class: "card bars" }, [...days.entries()].map(([day, d]) =>
          h("div", { class: "bar" },
            h("span", { class: "muted" }, dayLabel(day)),
            h("div", { class: "track" }, ["ios", "android", "web"].map((k) => d[k] ? h("div", { class: k, "data-w": (100 * d[k]) / max }) : null)),
            h("span", { class: "num" }, d.total))))
        : empty("Пока нет данных."),
    );
    // widths through the CSSOM (inline style attributes are blocked by the page's CSP)
    box.querySelectorAll("[data-w]").forEach((el) => (el.style.width = `${el.dataset.w}%`));
  },

  async search(box) {
    const input = h("input", { type: "search", placeholder: "Ник (минимум 2 буквы)", autocapitalize: "off", autocorrect: "off" });
    const out = h("div", {});
    const run = async () => {
      if (input.value.trim().length < 2) return;
      out.replaceChildren(empty("Ищу…"));
      try {
        const r = await call("search", { q: input.value });
        const parts = [];
        const results = () => out.replaceChildren(...(parts.length ? parts.flat() : [empty("Ничего не нашлось.")]));
        if (r.people.length) parts.push(h("h2", {}, `Люди (${r.people.length}) — нажми, чтобы открыть всё о человеке`), r.people.map((p) =>
          h("button", { class: "person-link", onclick: () => openPerson(out, p.hash, results) },
            h("span", { class: "avatar" }, initial(p.name)), h("span", { class: "grow" }, p.name), h("span", { class: "muted" }, "›"))));
        if (r.builds.length) parts.push(h("h2", {}, `Сборки (${r.builds.length})`), r.builds.map((b) => h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: "who" }, b.title), h("span", { class: "when" }, when(b.created_at))),
          h("div", { class: "muted" }, `${b.author_name} · ${money(b.price_ils)} · ♥ ${b.favorite_count} · 💬 ${b.comment_count}`),
          h("div", { class: "actions" }, h("button", { class: "danger", onclick: () => remove("build", b.id, `сборку «${b.title}»`, run) }, "Удалить сборку")))));
        if (r.comments.length) parts.push(h("h2", {}, `Комментарии (${r.comments.length})`), r.comments.map((c) => h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: "who" }, c.author_name), h("span", { class: "when" }, when(c.created_at))),
          h("div", { class: "body" }, c.message),
          h("div", { class: "actions" }, h("button", { class: "danger", onclick: () => remove("comment", c.id, "комментарий", run) }, "Удалить")))));
        if (r.tips.length) parts.push(h("h2", {}, `Чаевые (${r.tips.length})`), r.tips.map((t) => h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: "who" }, t.name), h("span", {}, money(t.amount_ils)), h("span", { class: "when" }, when(t.created_at))),
          h("div", { class: "actions" }, h("button", { class: "danger", onclick: () => remove("tip", t.id, `имя «${t.name}» со стены`, run) }, "Убрать со стены")))));
        results();
      } catch (e) {
        if (e.message !== "NO_SESSION") out.replaceChildren(empty(e.message === "SHORT" ? "Нужно минимум 2 буквы." : e.message));
      }
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && run());
    box.replaceChildren(h("div", { class: "searchbar" }, input, h("button", { class: "btn", onclick: run }, "Найти")), out);
    input.focus();
  },

  async reports(box) {
    const r = await call("reports");
    const again = () => renderMain("reports");
    box.replaceChildren(...(r.reports.length ? r.reports.map((x) => {
      const t = x.target;
      const isBuild = x.target_type === "build";
      return h("div", { class: "item" },
        h("div", { class: "head" },
          h("span", { class: "chip red" }, REASONS[x.reason] || x.reason),
          h("span", { class: "chip" }, isBuild ? "сборка" : "комментарий"),
          h("span", { class: "when" }, when(x.created_at))),
        t ? h("div", { class: "body" }, h("b", {}, isBuild ? t.title : t.message), h("div", { class: "muted" }, `автор: ${t.author_name}`))
          : h("div", { class: "body muted" }, "Уже удалено."),
        x.details ? h("div", { class: "body muted" }, `Пояснение: ${x.details}`) : null,
        h("div", { class: "actions" },
          t ? h("button", { class: "danger", onclick: () => remove(isBuild ? "build" : "comment", x.target_id, isBuild ? `сборку «${t.title}»` : "комментарий", again) }, isBuild ? "Удалить сборку" : "Удалить комментарий") : null,
          h("button", { class: "ghost", onclick: () => remove("report", x.id, "эту жалобу (контент останется)", again) }, "Жалоба не по делу")));
    }) : [empty("Жалоб нет 👍")]));
  },

  async feedback(box) {
    const r = await call("feedback");
    const again = () => renderMain("feedback");
    box.replaceChildren(
      h("p", { class: "muted" }, "«Что исправить» — видишь только ты, пользователи их не видят."),
      h("div", {}, ...(r.feedback.length ? r.feedback.map((f) => h("div", { class: "item" },
        h("div", { class: "head" }, h("span", { class: "who" }, f.author_name || "Аноним"), h("span", { class: "chip" }, PAGES[f.page] || f.page), f.like_count ? h("span", { class: "chip green" }, `👍 ${f.like_count}`) : null, h("span", { class: "when" }, when(f.created_at))),
        h("div", { class: "body" }, f.message),
        h("div", { class: "actions" }, h("button", { class: "ghost", onclick: () => remove("feedback", f.id, "этот отзыв", again) }, "Убрать")))) : [empty("Отзывов нет.")])),
    );
  },

  async ai(box) {
    const r = await call("ai");
    const again = () => renderMain("ai");
    const up = r.ratings.filter((x) => x.vote === "up" || x.vote === 1 || x.vote === true).length;
    box.replaceChildren(
      h("div", { class: "grid" }, stat(`👍 ${up}`, "понравилось"), stat(`👎 ${r.ratings.length - up}`, "не понравилось")),
      h("h2", {}, "Оценки ответов"),
      ...(r.ratings.length ? r.ratings.map((x) => {
        const good = x.vote === "up" || x.vote === 1 || x.vote === true;
        return h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: `chip ${good ? "green" : "red"}` }, good ? "👍" : "👎"), h("span", { class: "chip" }, x.lang || ""), h("span", { class: "when" }, when(x.created_at))),
          h("div", { class: "body" }, h("b", {}, "Вопрос: "), x.question || "—"),
          x.answer ? h("div", { class: "body muted" }, `Ответ: ${String(x.answer).slice(0, 400)}`) : null,
          x.reason ? h("div", { class: "body" }, h("b", {}, "Пояснение: "), x.reason) : null,
          h("div", { class: "actions" }, h("button", { class: "ghost", onclick: () => remove("rating", x.id, "эту оценку", again) }, "Убрать")));
      }) : [empty("Оценок пока нет.")]),
      h("h2", {}, "AI не понял (ждут обучения)"),
      r.unknown.length
        ? h("div", { class: "card" }, r.unknown.map((q) => h("div", { class: "row" }, h("div", { class: "grow" }, q.question), h("span", { class: "chip" }, `×${q.times}`))))
        : empty("Все вопросы понятны."),
      h("p", { class: "muted" }, "Чтобы научить AI, напиши Claude «научи AI»."),
    );
  },

  async crashes(box) {
    const r = await call("crashes");
    const again = () => renderMain("crashes");
    box.replaceChildren(...(r.crashes.length ? r.crashes.map((c) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "chip red" }, `${c.count} раз`), h("span", { class: "chip" }, `${c.devices} устр.`), h("span", { class: "chip" }, PLATFORMS[c.platform] || c.platform || ""), h("span", { class: "when" }, when(c.last_seen))),
      h("div", { class: "body" }, c.message),
      h("div", { class: "muted" }, [c.screen && `экран: ${c.screen}`, c.app_version && `версия ${c.app_version}`, `впервые ${when(c.first_seen)}`].filter(Boolean).join(" · ")),
      h("div", { class: "actions" }, h("button", { class: "ghost", onclick: () => remove("crash", c.id, "эту ошибку из списка (если повторится — появится снова)", again) }, "Исправлено — убрать")))) : [empty("Ошибок нет 👍")]));
  },

  async log(box) {
    const r = await call("log");
    const NAMES = { "delete build": "Удалена сборка", "delete comment": "Удалён комментарий", "delete tip": "Убрано со стены", "delete report": "Жалоба отклонена", "delete feedback": "Убран отзыв", "delete rating": "Убрана оценка AI", "delete crash": "Ошибка убрана" };
    box.replaceChildren(...(r.log.length ? r.log.map((x) => {
      const d = x.detail || {};
      const what = d.title || d.message || d.name || d.question || d.reason || "";
      return h("div", { class: "item" },
        h("div", { class: "head" }, h("span", { class: "who" }, NAMES[x.action] || x.action), h("span", { class: "when" }, when(x.created_at))),
        what ? h("div", { class: "body muted" }, String(what).slice(0, 200)) : null);
    }) : [empty("Пока ничего не удаляли.")]));
  },
};

if (localStorage.getItem(KEY)) renderMain("summary");
else renderLogin();
