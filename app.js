// BuildEngine owner admin app. Talks only to the `admin` edge function; the server checks the
// session on every call. Everything people wrote (names, comments, feedback) is put on the page
// as plain text (textContent), never as HTML, so a crafted comment can't run code here.
// Notes, marks, "seen" markers and settings live only in this phone's localStorage.
"use strict";

const VERSION = "2.3";
const API = "https://hvleqwnawexcyxiciehu.supabase.co/functions/v1/admin";
const KEY = "be.admin.session";
const PREF = "be.admin.prefs";
const LOCAL = "be.admin.local";
const app = document.getElementById("app");

// ── storage ──
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const prefs = { lang: "ru", theme: "auto", refresh: 0, veil: true, big: false, ...load(PREF) };
const local = { seen: {}, notes: {}, tags: {}, names: {}, recent: [], ...load(LOCAL) };
const savePrefs = () => save(PREF, prefs);
const saveLocal = () => save(LOCAL, local);

// ── language ──
const LOCALES = { ru: "ru-RU", en: "en-GB", he: "he-IL" };
const loc = () => LOCALES[prefs.lang] || "ru-RU";
function t(key, vars) {
  let s = I18N[prefs.lang]?.[key] ?? I18N.ru[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  return s;
}
/** Translate a server value (reason, page, platform…) and fall back to the raw value. */
const tk = (prefix, k) => { const key = `${prefix}.${k}`; const s = t(key); return s === key ? String(k ?? "") : s; };

// ── navigation ──
const BAR = ["summary", "visits", "search", "reports", "more"];
const MORE = ["feedback", "ai", "crashes", "log", "settings"];
const ICONS = {
  summary: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  visits: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  reports: "M5 21V4M5 4h12l-2.5 4.5L17 13H5",
  more: "M4 7h16M4 12h16M4 17h16",
  feedback: "M21 12a8 8 0 0 1-11.8 7L4 20l1-4.5A8 8 0 1 1 21 12z",
  ai: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  crashes: "M12 3l10 18H2zM12 10v4M12 17.5v.5",
  log: "M8 6h13M8 12h13M8 18h13M3.5 6h.5M3.5 12h.5M3.5 18h.5",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
};
/** Line icons drawn as SVG elements (no inline styles, so the page CSP is happy). */
function icon(name) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ico");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}
const TAGS = ["star", "watch", "bad"];

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
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const show = (...nodes) => fill(app, ...nodes);
const empty = (text, icon) => h("div", { class: "empty" }, icon ? h("div", { class: "empty-i" }, icon) : null, text);
const sect = (title, extra) => h("div", { class: "sect" }, h("h2", {}, title), extra || null);

// ── formatting ──
const fmt = (o, d) => new Intl.DateTimeFormat(loc(), o).format(d);
const when = (iso) => (iso ? fmt({ timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }, new Date(iso)) : "");
const clock = () => fmt({ timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }, new Date());
const dayLabel = (d) => fmt({ timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }, new Date(d + "T00:00:00Z"));
const shortDay = (d) => fmt({ timeZone: "UTC", day: "numeric", month: "short" }, new Date(d + "T00:00:00Z"));
const num = (n) => Number(n || 0).toLocaleString(loc());
const money = (n) => `₪${num(n)}`;
const weekdays = () => Array.from({ length: 7 }, (_, i) => fmt({ timeZone: "UTC", weekday: "short" }, new Date(Date.UTC(2024, 0, 1 + i))));
const initial = (name) => (String(name || "?").trim()[0] || "?").toUpperCase();
const israelHour = (iso) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
const dayKey = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - offset * 864e5));
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const byDate = (f, dir = -1) => (a, b) => dir * String(a[f] || "").localeCompare(String(b[f] || ""));
const byPlatform = (p) => ["ios", "android", "web"].filter((k) => p[k]).map((k) => `${tk("platform", k)} ${p[k]}`).join(", ");

// ── feedback to the user ──
function toast(text, ms = 2200) {
  document.querySelectorAll(".toast").forEach((x) => x.remove());
  const el = h("div", { class: "toast", role: "status" }, text);
  el.close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 220); };
  document.body.append(el);
  if (ms) setTimeout(el.close, ms);
  return el;
}
const errText = (e) => (["WRONG", "LOCKED", "NOT_FOUND", "SHORT"].includes(e.message) ? t(`err.${e.message}`) : e.message);
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t("copied")); }
  catch { prompt(t("copy.manual"), text); }
}
async function share(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  copy(text);
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
    throw new Error(t("err.net"));
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.error === "NO_SESSION") {
    localStorage.removeItem(KEY);
    renderLogin(t("err.expired"));
    throw new Error("NO_SESSION");
  }
  if (!res.ok) throw new Error(data.error || t("err.http", { n: res.status }));
  return data;
}

// ── settings applied to the page ──
function applyPrefs() {
  const root = document.documentElement;
  root.lang = prefs.lang;
  root.dir = prefs.lang === "he" ? "rtl" : "ltr";
  root.dataset.theme = prefs.theme;
  root.classList.toggle("big", !!prefs.big);
  document.title = `BuildEngine — ${t("admin")}`;
  setupAutoRefresh();
}

// ── segmented control ──
function seg(options, value, onChange) {
  const thumb = h("span", { class: "thumb", "aria-hidden": "true" });
  const box = h("div", { class: "seg", role: "radiogroup" }, thumb);
  const place = (animate) => {
    const on = box.querySelector("button.on");
    if (!on || !box.isConnected) return;
    thumb.classList.toggle("anim", animate && !calm());
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.transform = `translateX(${on.offsetLeft}px)`;
    thumb.classList.add("shown");
  };
  for (const [v, label] of options) {
    const b = h("button", { class: v === value ? "on" : null, role: "radio", "aria-checked": String(v === value), onclick: () => {
      if (b.classList.contains("on")) return;
      box.querySelectorAll("button").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); });
      b.classList.add("on"); b.setAttribute("aria-checked", "true");
      place(true);
      onChange(v);
    } }, label);
    box.append(b);
  }
  // measure once it is on the page
  const wait = (n = 0) => requestAnimationFrame(() => (box.isConnected ? place(false) : n < 30 && wait(n + 1)));
  wait();
  new ResizeObserver(() => place(false)).observe(box);
  return box;
}

// ── login ──
function renderLogin(message = "") {
  stopSelecting();
  document.body.classList.remove("authed");
  const err = h("div", { class: "err", role: "alert" }, message);
  const pass = h("input", { type: "password", autocomplete: "current-password", name: "password", placeholder: t("login.pass") });
  const code = h("input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", name: "code", maxlength: "6", placeholder: t("login.code.ph") });
  const btn = h("button", { class: "btn wide" }, t("login.go"));
  const go = async () => {
    err.textContent = "";
    if (!pass.value || !/^\d{6}$/.test(code.value.trim())) { err.textContent = t("login.need"); return; }
    btn.disabled = true;
    btn.textContent = t("login.checking");
    try {
      const r = await call("login", { password: pass.value, code: code.value.trim() });
      localStorage.setItem(KEY, r.session);
      pass.value = "";
      renderMain("summary");
    } catch (e) {
      err.textContent = errText(e);
      btn.disabled = false;
      btn.textContent = t("login.go");
    }
  };
  btn.addEventListener("click", go);
  code.addEventListener("keydown", (e) => e.key === "Enter" && go());
  const langs = seg([["ru", "Рус"], ["en", "Eng"], ["he", "עב"]], prefs.lang, (v) => { prefs.lang = v; savePrefs(); applyPrefs(); renderLogin(); });
  show(
    h("section", { class: "login" },
      h("img", { class: "logo", src: "icon-180.png", alt: "" }),
      h("h1", {}, "BuildEngine"),
      h("p", { class: "muted" }, t("login.hint")),
      h("input", { type: "text", name: "username", autocomplete: "username", value: "BuildEngine Admin", hidden: true, readonly: true }),
      h("label", {}, t("login.pass")), pass,
      h("label", {}, t("login.code")), code,
      btn, err,
      h("div", { class: "login-lang" }, langs),
    ),
  );
}

// ── main frame ──
let current = "summary";
let badges = {};
let selecting = false;
const state = { q: "", person: null };

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, calm() ? 0 : ms));
/** Restart a CSS entrance animation on an element. */
function animateIn(el, cls) {
  if (!el) return;
  el.classList.remove("push-in", "pop-in", "fade-in");
  void el.offsetWidth;
  el.classList.add(cls);
}
const skeleton = () => h("div", { class: "skel", "aria-label": "…" }, h("i", { class: "s1" }), h("i", { class: "s2" }), h("i", { class: "s3" }), h("i", { class: "s3" }));

// ── the tab bar is built once and only moves its highlight (never re-created) ──
let barEl = null;
function ensureBar() {
  if (barEl) return barEl;
  barEl = h("nav", { class: "bar" }, h("span", { class: "pill", "aria-hidden": "true" }), BAR.map((id) =>
    h("button", { "data-tab": id, onclick: () => {
      if (selecting) return;
      if (id === current && !state.person && !MORE.includes(current)) { app.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" }); return; }
      state.person = null; state.q = "";
      renderMain(id);
    } }, h("span", { class: "bi" }, icon(id)), h("span", { class: "bl" }, t(`tab.${id}`)))));
  document.body.append(barEl);
  window.addEventListener("resize", () => movePill(false));
  return barEl;
}
function movePill(animate) {
  const bar = ensureBar();
  const target = bar.querySelector("button.on");
  const pill = bar.querySelector(".pill");
  if (!target) return;
  pill.classList.toggle("anim", !!animate && !calm());
  pill.style.width = `${target.offsetWidth - 16}px`;
  pill.style.transform = `translateX(${target.offsetLeft + 8}px)`;
}
function updateBar() {
  const bar = ensureBar();
  const first = !document.body.classList.contains("authed");
  document.body.classList.add("authed");
  const active = MORE.includes(current) ? "more" : current;
  bar.querySelectorAll("button").forEach((b) => {
    const on = b.dataset.tab === active;
    if (on && !b.classList.contains("on") && !first) animateIn(b.querySelector(".bi"), "fade-in");
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    b.querySelector(".bl").textContent = t(`tab.${b.dataset.tab}`);
  });
  requestAnimationFrame(() => movePill(!first));
}

function renderMain(tab, opts = {}) {
  const prev = current;
  current = tab;
  stopSelecting();
  updateBar();
  if (opts.soft && prev === tab && document.querySelector(".view")) { softRender(tab, opts); return; }
  const inMore = MORE.includes(tab);
  const dir = inMore && prev === "more" ? "push-in" : tab === "more" && MORE.includes(prev) ? "pop-in" : "fade-in";
  const body = h("div", { class: "view" }, skeleton());
  show(h("div", { class: `screen ${prev === tab ? "" : dir}` },
    h("header", { class: "top" },
      inMore ? h("button", { class: "back", onclick: () => renderMain("more") }, t("back.more")) : h("img", { class: "logo", src: "icon-180.png", alt: "" }),
      h("span", { class: "grow" }),
      h("span", { class: "stamp" }),
      tab !== "settings" && tab !== "more" ? h("button", { class: "icon", "aria-label": t("refresh"), onclick: refresh }, icon("refresh")) : null),
    h("h1", { class: "big-title" }, t(`tab.${tab}`)),
    body));
  app.scrollTo(0, 0);
  paintBadges();
  Promise.resolve(VIEWS[tab](body, opts))
    .then(() => { if (current === tab) { setStamp(); body.classList.add("ready"); } })
    .catch((e) => {
      if (e.message !== "NO_SESSION") fill(body, empty(errText(e), "⚠"), h("div", { class: "center" }, h("button", { class: "ghost", onclick: () => renderMain(tab) }, t("retry"))));
    });
}
const setStamp = () => { const s = document.querySelector(".stamp"); if (s) s.textContent = t("updated", { time: clock() }); };

/** Refresh in place: the old screen stays until the new data is ready, then swaps without a jump. */
let softBusy = false;
async function softRender(tab, opts) {
  if (softBusy) return;
  softBusy = true;
  const old = document.querySelector(".view");
  const spin = document.querySelector(".top .icon");
  spin?.classList.add("spin");
  document.querySelector(".ptr")?.classList.add("busy");
  const y = app.scrollTop;
  const fresh = h("div", { class: "view ready soft" });
  try {
    await VIEWS[tab](fresh, opts);
    if (current === tab && old.isConnected) {
      if (fresh.contains(fresh.querySelector(".bulkbar"))) stopSelecting();
      old.replaceWith(fresh);
      app.scrollTo(0, y);
      setStamp();
    }
  } catch (e) {
    if (e.message !== "NO_SESSION") toast(errText(e));
  } finally {
    softBusy = false;
    spin?.classList.remove("spin");
    document.querySelector(".ptr")?.classList.remove("busy");
  }
}

function refresh() {
  if (!localStorage.getItem(KEY) || current === "settings" || current === "more") return;
  if (current === "search") renderMain("search", { q: state.q, person: state.person, soft: true });
  else renderMain(current, { soft: true });
}

// ── badges & "new" markers ──
function countNew(list, tab, field = "created_at") {
  const seen = local.seen[tab];
  return (list || []).filter((x) => !seen || String(x[field] || "") > seen).length;
}
function setBadges(s, fb, ai) {
  if (s) { badges.reports = s.reports; badges.crashes = s.newCrashes; }
  if (fb) badges.feedback = countNew(fb.feedback, "feedback");
  if (ai) badges.ai = countNew(ai.ratings, "ai");
  paintBadges();
}
function paintBadges() {
  const val = (id) => (id === "more" ? MORE.reduce((n, m) => n + (badges[m] || 0), 0) : badges[id] || 0);
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.querySelector(".badge")?.remove();
    const n = val(b.dataset.tab);
    if (!n) return;
    const badge = h("span", { class: "badge" }, n > 99 ? "99+" : n);
    const chev = b.querySelector(".chev");
    if (chev) chev.before(badge); else b.append(badge);
  });
  const total = (badges.reports || 0) + (badges.crashes || 0);
  if (navigator.setAppBadge) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {});
}
async function bgBadges() {
  const [s, fb, ai] = await Promise.allSettled([call("summary"), call("feedback"), call("ai")]);
  setBadges(s.value, fb.value, ai.value);
}
/** Remember the newest item of a tab as seen; returns the previous mark for "new" chips. */
function markSeen(tab, list, field = "created_at") {
  const prev = local.seen[tab];
  const newest = (list || []).reduce((m, x) => (String(x[field] || "") > m ? String(x[field]) : m), prev || "");
  if (newest) { local.seen[tab] = newest; saveLocal(); }
  if (tab === "feedback" || tab === "ai") { badges[tab] = 0; paintBadges(); }
  return prev;
}
const newChip = (x, prev, field = "created_at") => (prev && String(x[field] || "") > prev ? h("span", { class: "chip new" }, t("new")) : null);

// ── auto refresh, return to app, privacy veil ──
let timer = null;
let hiddenAt = 0;
function setupAutoRefresh() {
  clearInterval(timer);
  if (prefs.refresh > 0) timer = setInterval(tick, prefs.refresh * 60000);
}
function tick() {
  if (document.hidden || selecting || !localStorage.getItem(KEY) || !document.body.classList.contains("authed")) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  // lists keep their filters: only refresh the screens without any, badges everywhere
  if (current === "summary" || current === "visits") refresh();
  else bgBadges().catch(() => {});
}
document.addEventListener("visibilitychange", () => {
  if (prefs.veil) document.body.classList.toggle("veil", document.hidden);
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 120000) tick();
});

// ── pull to refresh (a home-screen app has none of its own) ──
(() => {
  const ptr = h("div", { class: "ptr", "aria-hidden": "true" }, icon("refresh"));
  document.body.append(ptr);
  let y0 = null, dy = 0;
  document.addEventListener("touchstart", (e) => {
    y0 = app.scrollTop <= 0 && e.touches.length === 1 && document.body.classList.contains("authed") && !selecting && !softBusy ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    const d = Math.min(dy, 110);
    ptr.classList.add("drag");
    ptr.style.transform = `translate(-50%, ${d * 0.8 - 50}px) rotate(${d * 3}deg)`;
    ptr.classList.toggle("ready", dy > 80);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    const go = y0 != null && dy > 80;
    y0 = null; dy = 0;
    ptr.classList.remove("drag", "ready");
    ptr.style.transform = "";
    if (go) refresh();
  });
})();

// ── deleting ──
// the card the last tapped button belongs to, so a deletion can fade it out first
let lastItem = null;
document.addEventListener("click", (e) => { lastItem = e.target.closest?.(".item") || null; }, true);
async function vanish(nodes) {
  nodes = [...nodes].filter(Boolean);
  if (!nodes.length) return;
  nodes.forEach((n) => { n.style.height = `${n.offsetHeight}px`; });
  void document.body.offsetHeight;
  nodes.forEach((n) => n.classList.add("leaving"));
  await sleep(280);
}
async function remove(type, id, what, after) {
  const node = lastItem;
  if (!confirm(t("del.q", { what }))) return;
  try {
    await call("delete", { type, id });
    toast(t("deleted"));
    await vanish([node]);
    after();
  } catch (e) {
    if (e.message !== "NO_SESSION") alert(errText(e));
    after();
  }
}
/** Deletes one by one with the same `delete` action; one confirm for the whole batch. */
async function removeMany(entries, question, twice) {
  if (!entries.length || !confirm(question)) return false;
  if (twice && !confirm(t("sure"))) return false;
  let ok = 0, fail = 0;
  const bar = toast(t("bulk.progress", { i: 0, n: entries.length }), 0);
  for (const [i, e] of entries.entries()) {
    bar.textContent = t("bulk.progress", { i: i + 1, n: entries.length });
    try { await call("delete", e); ok++; } catch (err) {
      if (err.message === "NO_SESSION") { bar.close(); return false; }
      if (err.message === "NOT_FOUND") ok++; else fail++;
    }
  }
  bar.close();
  toast(fail ? t("bulk.partial", { ok, fail }) : t("bulk.done", { n: ok }), 3000);
  return true;
}
const uniq = (entries) => [...new Map(entries.map((e) => [`${e.type}:${e.id}`, e])).values()];

// ── small pieces ──
/** Today's number counts up once when the summary opens. */
function countUp(el, target) {
  if (!el || calm() || target < 2) return;
  const t0 = performance.now(), dur = 700;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = num(Math.round(target * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = num(0);
  requestAnimationFrame(step);
}
function stat(n, label, sub, tone, trendNode) {
  return h("div", { class: `stat${tone ? " " + tone : ""}` },
    h("div", { class: "n" }, n), h("div", { class: "l" }, label), sub ? h("div", { class: "s" }, sub) : null, trendNode || null);
}
function trend(a, b) {
  if (!b) return a ? h("div", { class: "tr up" }, `▲ ${t("trend.new")}`) : null;
  const p = Math.round(((a - b) / b) * 100);
  if (!p) return h("div", { class: "tr" }, t("trend.same"));
  return h("div", { class: `tr ${p > 0 ? "up" : "down"}` }, `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}% ${t("trend.vs")}`);
}
function columns(values, labels, highlightLast) {
  const max = Math.max(1, ...values);
  const box = h("div", { class: "cols" }, values.map((v, i) =>
    h("div", { class: `c${highlightLast && i === values.length - 1 ? " last" : ""}` },
      h("em", {}, v || ""), h("b", { "data-h": (100 * v) / max, title: String(v) }), h("span", {}, labels[i]))));
  // heights through the CSSOM (inline style attributes are blocked by the page's CSP)
  queueMicrotask(() => box.querySelectorAll("[data-h]").forEach((el) => (el.style.height = `${Math.max(3, el.dataset.h * 0.7)}%`)));
  return box;
}
const legend = () => h("div", { class: "legend" }, ["ios", "android", "web"].map((k) => h("span", {}, h("i", { class: k }), tk("platform", k))));
const authorLink = (name) => (name ? h("button", { class: "link", onclick: (e) => { e.stopPropagation(); renderMain("search", { q: name }); } }, name) : null);
const tagMarks = (hash) => (local.tags[hash] || []).map((k) => tk("tagicon", k)).join("");

// ── list toolkit: filter, chips, sort, copy, select & bulk actions ──
function stopSelecting() {
  selecting = false;
  document.body.classList.remove("selecting");
}
function listTool(box, cfg) {
  const st = { q: "", chip: "all", sort: cfg.sorts?.[0]?.id, sel: new Set() };
  const list = h("div", { class: "list" });
  const count = h("span", { class: "count" });
  const input = h("input", { type: "search", class: "filter", placeholder: t("filter"), autocapitalize: "off", autocorrect: "off", "aria-label": t("filter") });
  input.addEventListener("input", () => { st.q = input.value.trim().toLowerCase(); draw(); });
  const chipRow = cfg.chips?.length ? h("div", { class: "fchips" }) : null;
  const sortSel = cfg.sorts?.length > 1
    ? h("select", { class: "sort", "aria-label": t("sort"), onchange: (e) => { st.sort = e.target.value; draw(); animateIn(list, "fade-in"); } }, cfg.sorts.map((s) => h("option", { value: s.id }, s.label)))
    : null;
  const bulkBar = h("div", { class: "bulkbar" });
  const selBtn = cfg.bulk?.length ? h("button", { class: "ghost sm", onclick: () => toggleSel() }, t("select")) : null;
  const copyBtn = cfg.copy ? h("button", { class: "ghost sm", onclick: () => copy(cfg.copy(visible())) }, t("copy")) : null;

  function drawChips() {
    if (!chipRow) return;
    fill(chipRow, [{ id: "all", label: t("all") }, ...cfg.chips].map((c) => {
      const n = c.id === "all" ? cfg.items.length : cfg.items.filter(c.test).length;
      if (!n && c.id !== "all") return null;
      return h("button", { class: `fchip${st.chip === c.id ? " on" : ""}`, onclick: () => { st.chip = c.id; drawChips(); draw(); animateIn(list, "fade-in"); } }, c.label, h("span", { class: "cnt" }, n));
    }));
  }
  function visible() {
    const chip = cfg.chips?.find((c) => c.id === st.chip);
    let xs = cfg.items.filter((x) => (!chip || chip.test(x)) && (!st.q || cfg.text(x).toLowerCase().includes(st.q)));
    const s = cfg.sorts?.find((x) => x.id === st.sort);
    if (s) xs = [...xs].sort(s.cmp);
    return xs;
  }
  function toggleSel(on = !selecting) {
    selecting = on;
    st.sel.clear();
    document.body.classList.toggle("selecting", on);
    if (selBtn) selBtn.textContent = on ? t("cancel") : t("select");
    draw();
  }
  function draw() {
    const xs = visible();
    count.textContent = xs.length === cfg.items.length ? t("count.all", { n: xs.length }) : t("count.of", { n: xs.length, m: cfg.items.length });
    fill(list, xs.length ? xs.map((x) => {
      const node = cfg.item(x);
      if (selecting) {
        node.classList.add("pick");
        if (st.sel.has(x)) node.classList.add("picked");
        node.prepend(h("span", { class: "tick", "aria-hidden": "true" }));
        node.setAttribute("role", "checkbox");
        node.setAttribute("aria-checked", String(st.sel.has(x)));
        node.addEventListener("click", () => {
          if (st.sel.has(x)) st.sel.delete(x); else st.sel.add(x);
          node.classList.toggle("picked", st.sel.has(x));
          node.setAttribute("aria-checked", String(st.sel.has(x)));
          drawBar();
        });
      }
      return node;
    }) : [empty(cfg.items.length ? t("nothing.filter") : cfg.emptyText, cfg.items.length ? "⌕" : "✓")]);
    drawBar();
  }
  function drawBar() {
    if (!selecting) { bulkBar.classList.remove("on"); bulkBar.replaceChildren(); return; }
    bulkBar.classList.add("on");
    const chosen = [...st.sel];
    fill(bulkBar,
      h("div", { class: "bulk-top" },
        h("b", {}, t("selected", { n: chosen.length })),
        h("span", { class: "grow" }),
        h("button", { class: "link", onclick: () => { const xs = visible(); if (st.sel.size === xs.length) st.sel.clear(); else xs.forEach((x) => st.sel.add(x)); draw(); } }, t("select.all")),
        h("button", { class: "link", onclick: () => toggleSel(false) }, t("cancel"))),
      h("div", { class: "bulk-acts" }, cfg.bulk.map((b) => h("button", {
        class: b.danger ? "danger" : "ghost", disabled: !chosen.length,
        onclick: async () => { if (await b.act(chosen)) { await vanish(list.querySelectorAll(".picked")); toggleSel(false); cfg.reload(); } },
      }, b.label))));
  }
  fill(box,
    cfg.head || null,
    cfg.items.length ? h("div", { class: "tools" },
      h("div", { class: "tools-row" }, input, sortSel),
      chipRow,
      h("div", { class: "tools-row small" }, count, h("span", { class: "grow" }), copyBtn, selBtn)) : null,
    list,
    cfg.foot || null,
    bulkBar);
  drawChips();
  draw();
}

// ── one person (device) ──
function rememberPerson(hash, name) {
  local.names[hash] = name || "";
  local.recent = [{ hash, name: name || "" }, ...local.recent.filter((x) => x.hash !== hash)].slice(0, 12);
  saveLocal();
}
function toggleTag(hash, tag) {
  const cur = new Set(local.tags[hash] || []);
  if (cur.has(tag)) cur.delete(tag); else cur.add(tag);
  if (cur.size) local.tags[hash] = [...cur]; else delete local.tags[hash];
  saveLocal();
}

/** Everything the server knows about one device (person), with moderation tools. */
async function openPerson(out, hash, back) {
  state.person = hash;
  out.parentElement?.classList.add("in-person");
  const goBack = () => { state.person = null; out.parentElement?.classList.remove("in-person"); back(); animateIn(out, "pop-in"); app.scrollTo(0, 0); };
  fill(out, h("div", { class: "loading" }, h("i"), h("i"), h("i")));
  let p;
  try {
    p = await call("person", { hash });
  } catch (e) {
    if (e.message !== "NO_SESSION") fill(out, h("button", { class: "back", onclick: goBack }, t("back")), empty(errText(e), "⚠"));
    return;
  }
  rememberPerson(hash, p.name);
  const again = () => openPerson(out, hash, back);
  const visits = p.visits;
  const days = new Set(visits.map((v) => v.day));
  const platforms = [...new Set(visits.map((v) => v.platform))];
  const first = visits[0]?.day, last = visits.at(-1)?.day, today = dayKey(0);
  const inLast = (n) => visits.filter((v) => daysBetween(v.day, today) < n).length;
  const tipsIls = p.tips.reduce((s, x) => s + Number(x.amount_ils), 0);
  const title = (id) => p.titles.find((x) => x.id === id);
  const weekday = Array(7).fill(0);
  for (const v of visits) weekday[(new Date(v.day + "T12:00:00Z").getUTCDay() + 6) % 7]++;
  const timed = visits.filter((v) => v.first_at);
  const hours = Array(8).fill(0); // 3-hour blocks
  for (const v of timed) hours[Math.floor(israelHour(v.first_at) / 3)]++;
  const platformOf = new Map(visits.map((v) => [v.day, v.platform]));
  const calendar = Array.from({ length: 60 }, (_, i) => dayKey(59 - i));
  const status = !visits.length ? null
    : daysBetween(last, today) > 14 ? "gone"
    : daysBetween(first, today) < 7 ? "fresh"
    : inLast(7) >= 4 ? "active" : "regular";
  const name = p.name || t("noname");

  const note = h("textarea", { class: "note", rows: "3", placeholder: t("note.ph"), "aria-label": t("note") });
  note.value = local.notes[hash] || "";
  note.addEventListener("input", () => {
    if (note.value.trim()) local.notes[hash] = note.value; else delete local.notes[hash];
    saveLocal();
  });

  const summaryText = () => [
    `${name}`,
    `${t("p.days")}: ${days.size} · ${t("p.last7")}: ${inLast(7)} · ${t("p.last30")}: ${inLast(30)}`,
    `${t("p.first")}: ${first ? shortDay(first) : "—"} · ${t("p.last")}: ${last ? shortDay(last) : "—"}`,
    `${t("p.builds")}: ${p.builds.length} · ${t("p.comments")}: ${p.comments.length} · ${t("p.likes")}: ${p.likes.length} · ${t("p.tips")}: ${money(tipsIls)}`,
    local.notes[hash] ? `${t("note")}: ${local.notes[hash]}` : null,
  ].filter(Boolean).join("\n");

  const mod = [
    p.comments.length ? h("button", { class: "danger", onclick: async () => {
      if (await removeMany(p.comments.map((c) => ({ type: "comment", id: c.id })), t("p.delComments.q", { n: p.comments.length, name }), true)) again();
    } }, t("p.delComments", { n: p.comments.length })) : null,
    p.builds.length ? h("button", { class: "danger", onclick: async () => {
      if (await removeMany(p.builds.map((b) => ({ type: "build", id: b.id })), t("p.delBuilds.q", { n: p.builds.length, name }), true)) again();
    } }, t("p.delBuilds", { n: p.builds.length })) : null,
  ];

  fill(out,
    h("button", { class: "back", onclick: goBack }, t("back")),
    h("div", { class: "person-head" },
      h("span", { class: "avatar lg" }, initial(p.name)),
      h("div", { class: "grow" },
        h("div", { class: "name" }, name, h("span", { class: "marks" }, tagMarks(hash))),
        h("div", { class: "chips" },
          status ? h("span", { class: `chip st-${status}` }, tk("status", status)) : null,
          platforms.map((k) => h("span", { class: "chip" }, tk("platform", k))),
          p.reservedName ? h("span", { class: "chip" }, t("p.nickSince", { d: when(p.nameSince) })) : h("span", { class: "chip" }, t("p.nickFree"))))),
    h("div", { class: "tagrow" }, TAGS.map((k) => {
      const on = (local.tags[hash] || []).includes(k);
      return h("button", { class: `fchip${on ? " on" : ""}`, "aria-pressed": String(on), onclick: (e) => {
        toggleTag(hash, k);
        const now = (local.tags[hash] || []).includes(k);
        e.currentTarget.classList.toggle("on", now);
        e.currentTarget.setAttribute("aria-pressed", String(now));
        out.querySelector(".marks").textContent = tagMarks(hash);
      } }, `${tk("tagicon", k)} ${tk("tag", k)}`);
    })),
    note,
    h("p", { class: "hint" }, t("note.local")),
    h("div", { class: "grid3" },
      stat(days.size, t("p.days")), stat(inLast(7), t("p.last7")), stat(inLast(30), t("p.last30")),
      stat(first ? shortDay(first) : "—", t("p.first")), stat(last ? shortDay(last) : "—", t("p.last")), stat(money(tipsIls), t("p.tipsN", { n: p.tips.length })),
      stat(p.builds.length, t("p.builds")), stat(p.comments.length, t("p.comments")), stat(p.likes.length, t("p.likes"))),
    sect(t("p.cal")),
    h("div", { class: "panel pad" }, h("div", { class: "days" }, calendar.map((d) => h("i", { class: days.has(d) ? platformOf.get(d) : "", title: dayLabel(d) }))), legend()),
    sect(t("p.weekdays")),
    h("div", { class: "panel pad" }, columns(weekday, weekdays())),
    sect(t("p.hours")),
    timed.length ? h("div", { class: "panel pad" }, columns(hours, ["0", "3", "6", "9", "12", "15", "18", "21"])) : empty(t("p.hours.none")),
    p.builds.length ? [sect(t("p.buildsN", { n: p.builds.length })), h("div", { class: "list" }, p.builds.map((b) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "who" }, b.title), h("span", { class: "when" }, when(b.created_at))),
      h("div", { class: "meta" }, `${money(b.price_ils)}   ♥ ${b.favorite_count}   💬 ${b.comment_count}${b.tags?.length ? "   " + b.tags.join(" ") : ""}`),
      h("div", { class: "actions" }, h("button", { class: "danger sm", onclick: () => remove("build", b.id, t("what.build", { title: b.title }), again) }, t("del.build"))))))] : null,
    p.comments.length ? [sect(t("p.commentsN", { n: p.comments.length })), h("div", { class: "list" }, p.comments.map((c) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "meta" }, t("p.to", { title: title(c.build_id)?.title ?? t("deletedBuild") })), h("span", { class: "when" }, when(c.created_at))),
      h("div", { class: "body" }, c.message),
      h("div", { class: "actions" }, h("button", { class: "danger sm", onclick: () => remove("comment", c.id, t("what.comment"), again) }, t("del"))))))] : null,
    p.likes.length ? [sect(t("p.likesN", { n: p.likes.length })), h("div", { class: "panel" }, p.likes.map((l) => h("div", { class: "row" },
      h("div", { class: "grow" }, `♥ ${title(l.build_id)?.title ?? t("deletedBuild")}`, h("span", { class: "meta" }, title(l.build_id) ? ` — ${title(l.build_id).author_name}` : "")),
      h("span", { class: "when" }, when(l.created_at)))))] : null,
    p.tips.length ? [sect(t("p.tipsList", { n: p.tips.length })), h("div", { class: "list" }, p.tips.map((x) => h("div", { class: "item" },
      h("div", { class: "head" }, h("span", { class: "who" }, money(x.amount_ils)), h("span", { class: "when" }, when(x.created_at))),
      h("div", { class: "actions" }, h("button", { class: "danger sm", onclick: () => remove("tip", x.id, t("what.tip"), again) }, t("del.wall"))))))] : null,
    p.reportsSent.length ? [sect(t("p.reportsN", { n: p.reportsSent.length })), h("div", { class: "panel" }, p.reportsSent.map((x) => h("div", { class: "row" },
      h("div", { class: "grow" }, `${x.target_type === "build" ? t("p.onBuild") : t("p.onComment")} — ${tk("reason", x.reason)}`), h("span", { class: "when" }, when(x.created_at)))))] : null,
    sect(t("p.tools")),
    h("div", { class: "panel pad stack" },
      h("button", { class: "ghost", onclick: () => copy(summaryText()) }, t("p.copy")),
      h("button", { class: "ghost", onclick: () => renderMain("search", { q: p.name || "" }) }, t("p.findAll")),
      mod,
      mod.some(Boolean) ? h("p", { class: "hint" }, t("p.mod.hint")) : null),
    h("p", { class: "hint" }, t("p.device")),
  );
  animateIn(out, "push-in");
  app.scrollTo(0, 0);
}

// ── screens ──
const VIEWS = {
  async summary(box) {
    const [s, v, fb, ai] = await Promise.all([call("summary"), call("visits").catch(() => null), call("feedback").catch(() => null), call("ai").catch(() => null)]);
    setBadges(s, fb, ai);
    const unknown = ai?.unknown?.length || 0;
    const queues = [
      ["reports", s.reports, t("q.reports")],
      ["crashes", s.newCrashes, t("q.crashes")],
      ["feedback", badges.feedback || 0, t("q.feedback")],
      ["ai", unknown, t("q.ai")],
    ];
    const pending = queues.filter((q) => q[1]).length;
    let chart = null;
    if (v) {
      const tot = new Map();
      for (const r of v.days) tot.set(r.day, (tot.get(r.day) || 0) + Number(r.people));
      const keys = Array.from({ length: 14 }, (_, i) => dayKey(13 - i));
      chart = columns(keys.map((k) => tot.get(k) || 0), keys.map((k) => String(Number(k.slice(8)))), true);
    }
    const report = () => [
      `BuildEngine — ${fmt({ timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" }, new Date())}`,
      `${t("r.today")}: ${s.today.total} (${t("yesterday").toLowerCase()}: ${s.yesterday.total})`,
      v ? `${t("unique7")}: ${v.unique7} · ${t("unique30")}: ${v.unique30}` : null,
      `${t("r.builds")}: ${s.builds} (+${s.builds24 || 0})`,
      `${t("r.comments")}: ${s.comments} (+${s.comments24 || 0})`,
      `${t("r.tips")}: ${money(s.tipsIls)} (${s.tips})`,
      `${t("q.reports")}: ${s.reports} · ${t("q.crashes")}: ${s.newCrashes}`,
    ].filter(Boolean).join("\n");

    fill(box,
      h("section", { class: "hero" },
        h("div", { class: "hero-top" },
          h("div", {},
            h("div", { class: "hero-n" }, num(s.today.total)),
            h("div", { class: "hero-l" }, t("hero.today"))),
          h("div", { class: "hero-side" },
            trend(s.today.total, s.yesterday.total),
            h("div", { class: "hero-s" }, byPlatform(s.today) || t("hero.nobody")))),
        h("div", { class: "leds" }, queues.map(([tab, n, label]) =>
          h("button", { class: `led${n ? " on" : ""}`, onclick: () => renderMain(tab) },
            h("i"), h("span", { class: "ll" }, label), h("span", { class: "ln" }, n ? num(n) : "0")))),
        h("div", { class: "hero-foot" }, pending ? t("hero.todo", { n: pending }) : t("hero.clean"))),
      chart ? [sect(t("sum.14"), h("span", { class: "sect-r" }, v ? t("sum.u7", { n: v.unique7 }) : "")), h("div", { class: "panel pad" }, chart)] : null,
      sect(t("sum.people")),
      h("div", { class: "grid" },
        stat(num(s.yesterday.total), t("yesterday"), byPlatform(s.yesterday)),
        v ? stat(num(v.unique30), t("unique30")) : null),
      sect(t("sum.community")),
      h("div", { class: "grid" },
        stat(num(s.builds), t("sum.builds"), s.builds24 ? t("plus24", { n: s.builds24 }) : t("none24")),
        stat(num(s.comments), t("sum.comments"), s.comments24 ? t("plus24", { n: s.comments24 }) : t("none24"))),
      sect(t("sum.tips")),
      h("div", { class: "grid" },
        stat(money(s.tipsIls), t("sum.wall"), t("sum.tipsPeople", { n: s.tips })),
        stat(num(s.tips24), t("sum.tips24"))),
      sect(t("sum.server")),
      h("div", { class: "panel pad" },
        h("div", { class: "meter-l" }, h("b", {}, `${s.dbMb} MB`), h("span", {}, t("sum.of500"))),
        h("div", { class: `meter${s.dbMb > 400 ? " warn" : ""}` }, h("i", { "data-w": Math.min(100, (s.dbMb / 500) * 100) })),
        h("div", { class: "hint" }, s.dbMb > 400 ? t("sum.pro") : t("sum.space"))),
      h("div", { class: "center" }, h("button", { class: "ghost", onclick: () => share(report()) }, t("sum.share"))),
      h("p", { class: "hint" }, t("sum.note")),
    );
    box.querySelectorAll("[data-w]").forEach((el) => (el.style.width = `${el.dataset.w}%`));
    if (!box.classList.contains("soft")) countUp(box.querySelector(".hero-n"), Number(s.today.total) || 0);
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
    let range = 14;
    const out = h("div", {});
    const draw = () => {
      const today = dayKey(0);
      const entries = [...days.entries()].filter(([d]) => !range || daysBetween(d, today) < range);
      const totals = entries.map(([, d]) => d.total);
      const sum = totals.reduce((a, b) => a + b, 0);
      const best = entries.reduce((m, e) => (!m || e[1].total > m[1].total ? e : m), null);
      const plat = { ios: 0, android: 0, web: 0 };
      for (const [, d] of entries) for (const k in plat) plat[k] += d[k] || 0;
      const max = Math.max(1, ...totals);
      fill(out,
        h("div", { class: "grid" },
          stat(entries.length ? (sum / entries.length).toFixed(1) : "0", t("vis.avg")),
          stat(best ? num(best[1].total) : "—", t("vis.best"), best ? dayLabel(best[0]) : "")),
        sum ? [sect(t("vis.share")), h("div", { class: "panel pad" },
          h("div", { class: "split" }, ["ios", "android", "web"].map((k) => (plat[k] ? h("i", { class: k, "data-w": (100 * plat[k]) / sum }) : null))),
          h("div", { class: "legend" }, ["ios", "android", "web"].map((k) => h("span", {}, h("i", { class: k }), `${tk("platform", k)} ${Math.round((100 * plat[k]) / sum)}%`))))] : null,
        sect(t("vis.byday")),
        entries.length ? h("div", { class: "panel pad bars" }, entries.map(([day, d]) =>
          h("div", { class: "bar-row" },
            h("span", { class: "meta" }, dayLabel(day)),
            h("div", { class: "track" }, ["ios", "android", "web"].map((k) => (d[k] ? h("i", { class: k, "data-w": (100 * d[k]) / max }) : null))),
            h("span", { class: "num" }, d.total)))) : empty(t("nodata"), "◔"),
        entries.length ? legend() : null,
      );
      // widths through the CSSOM (inline style attributes are blocked by the page's CSP)
      out.querySelectorAll("[data-w]").forEach((el) => (el.style.width = `${el.dataset.w}%`));
    };
    fill(box,
      h("div", { class: "grid" }, stat(num(v.unique7), t("unique7")), stat(num(v.unique30), t("unique30"))),
      h("div", { class: "seg-wrap" }, h("span", { class: "meta" }, t("vis.period")),
        seg([[7, "7"], [14, "14"], [30, "30"], [0, t("all")]], range, (x) => { range = x; draw(); })),
      out);
    draw();
  },

  async search(box, opts = {}) {
    const input = h("input", { type: "search", placeholder: t("search.ph"), autocapitalize: "off", autocorrect: "off", "aria-label": t("search.ph") });
    const out = h("div", {});
    const personRow = (hash, name, back) => h("button", { class: "person-link", onclick: () => openPerson(out, hash, back) },
      h("span", { class: "avatar" }, initial(name)),
      h("span", { class: "grow" }, name || t("noname"), h("span", { class: "marks" }, tagMarks(hash))),
      local.notes[hash] ? h("span", { class: "chip" }, "✎") : null,
      h("span", { class: "chev" }, t("chev")));
    const home = () => {
      state.q = ""; state.person = null;
      const marked = Object.keys(local.tags).filter((k) => local.tags[k]?.length);
      const blocks = [];
      for (const tag of TAGS) {
        const people = marked.filter((k) => local.tags[k].includes(tag));
        if (people.length) blocks.push(sect(`${tk("tagicon", tag)} ${tk("tags", tag)}`), h("div", { class: "list" }, people.map((k) => personRow(k, local.names[k], home))));
      }
      if (local.recent.length) blocks.push(sect(t("search.recent"), h("button", { class: "link sect-r", onclick: () => { local.recent = []; saveLocal(); home(); } }, t("clear"))),
        h("div", { class: "list" }, local.recent.map((x) => personRow(x.hash, x.name, home))));
      fill(out, blocks.length ? blocks : empty(t("search.tip"), "⌕"));
    };
    const run = async () => {
      const q = input.value.trim();
      if (q.length < 2) { if (!q) home(); else toast(t("err.SHORT")); return; }
      state.q = q; state.person = null;
      fill(out, h("div", { class: "loading" }, h("i"), h("i"), h("i")));
      try {
        const r = await call("search", { q });
        const parts = [];
        const results = () => { state.person = null; fill(out, parts.length ? parts : empty(t("search.none"), "⌕")); };
        if (r.people.length) parts.push(sect(t("search.people", { n: r.people.length })), h("div", { class: "list" }, r.people.map((p) => personRow(p.hash, p.name, results))));
        if (r.builds.length) parts.push(sect(t("search.builds", { n: r.builds.length })), h("div", { class: "list" }, r.builds.map((b) => h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: "who" }, b.title), h("span", { class: "when" }, when(b.created_at))),
          h("div", { class: "meta" }, authorLink(b.author_name), `   ${money(b.price_ils)}   ♥ ${b.favorite_count}   💬 ${b.comment_count}`),
          h("div", { class: "actions" }, h("button", { class: "danger sm", onclick: () => remove("build", b.id, t("what.build", { title: b.title }), run) }, t("del.build")))))));
        if (r.comments.length) parts.push(sect(t("search.comments", { n: r.comments.length })), h("div", { class: "list" }, r.comments.map((c) => h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: "who" }, authorLink(c.author_name)), h("span", { class: "when" }, when(c.created_at))),
          h("div", { class: "body" }, c.message),
          h("div", { class: "actions" },
            h("button", { class: "ghost sm", onclick: () => copy(c.message) }, t("copy")),
            h("button", { class: "danger sm", onclick: () => remove("comment", c.id, t("what.comment"), run) }, t("del")))))));
        if (r.tips.length) parts.push(sect(t("search.tips", { n: r.tips.length })), h("div", { class: "list" }, r.tips.map((x) => h("div", { class: "item" },
          h("div", { class: "head" }, h("span", { class: "who" }, x.name), h("span", { class: "money" }, money(x.amount_ils)), h("span", { class: "when" }, when(x.created_at))),
          h("div", { class: "actions" }, h("button", { class: "danger sm", onclick: () => remove("tip", x.id, t("what.tipName", { name: x.name }), run) }, t("del.wall")))))));
        results();
        animateIn(out, "fade-in");
      } catch (e) {
        if (e.message !== "NO_SESSION") fill(out, empty(errText(e), "⚠"));
      }
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && run());
    input.addEventListener("search", () => { if (!input.value) home(); });
    fill(box, h("div", { class: "searchbar" }, input, h("button", { class: "btn", onclick: run }, t("search.go"))), out);
    if (opts.person) { input.value = opts.q || ""; openPerson(out, opts.person, opts.q ? run : home); }
    else if (opts.q) { input.value = opts.q; await run(); }
    else home();
  },

  async reports(box) {
    const r = await call("reports");
    const prev = markSeen("reports", r.reports);
    const again = () => renderMain("reports", { soft: true });
    const per = new Map();
    for (const x of r.reports) per.set(x.target_id, (per.get(x.target_id) || 0) + 1);
    const content = (x) => ({ type: x.target_type === "build" ? "build" : "comment", id: x.target_id });
    listTool(box, {
      items: r.reports, emptyText: t("reports.none"), reload: again,
      text: (x) => [x.target?.title, x.target?.message, x.target?.author_name, x.details, tk("reason", x.reason)].filter(Boolean).join(" "),
      chips: [
        ...["spam", "offensive", "fake", "other"].map((k) => ({ id: k, label: tk("reason", k), test: (x) => x.reason === k })),
        { id: "build", label: t("type.build"), test: (x) => x.target_type === "build" },
        { id: "comment", label: t("type.comment"), test: (x) => x.target_type !== "build" },
      ],
      sorts: [
        { id: "new", label: t("sort.new"), cmp: byDate("created_at") },
        { id: "old", label: t("sort.old"), cmp: byDate("created_at", 1) },
        { id: "most", label: t("sort.most"), cmp: (a, b) => per.get(b.target_id) - per.get(a.target_id) },
      ],
      item: (x) => {
        const tg = x.target;
        const isBuild = x.target_type === "build";
        return h("div", { class: "item" },
          h("div", { class: "head" },
            newChip(x, prev),
            h("span", { class: "chip red" }, tk("reason", x.reason)),
            h("span", { class: "chip" }, isBuild ? t("type.build") : t("type.comment")),
            per.get(x.target_id) > 1 ? h("span", { class: "chip red" }, t("reports.times", { n: per.get(x.target_id) })) : null,
            h("span", { class: "when" }, when(x.created_at))),
          tg ? h("div", { class: "body" }, h("b", {}, isBuild ? tg.title : tg.message), h("div", { class: "meta" }, t("author"), " ", authorLink(tg.author_name)))
            : h("div", { class: "body meta" }, t("gone")),
          x.details ? h("div", { class: "quote" }, x.details) : null,
          h("div", { class: "actions" },
            tg ? h("button", { class: "danger sm", onclick: () => remove(content(x).type, x.target_id, isBuild ? t("what.build", { title: tg.title }) : t("what.comment"), again) }, isBuild ? t("del.build") : t("del.comment")) : null,
            h("button", { class: "ghost sm", onclick: () => remove("report", x.id, t("what.report"), again) }, t("reports.reject"))));
      },
      bulk: [
        { label: t("bulk.delContent"), danger: true, act: (xs) => { const e = uniq(xs.filter((x) => x.target).map(content)); return removeMany(e, t("bulk.delContent.q", { n: e.length })); } },
        { label: t("bulk.reject"), act: (xs) => removeMany(xs.map((x) => ({ type: "report", id: x.id })), t("bulk.reject.q", { n: xs.length })) },
      ],
    });
  },

  async feedback(box) {
    const r = await call("feedback");
    const prev = markSeen("feedback", r.feedback);
    const again = () => renderMain("feedback", { soft: true });
    const pages = [...new Set(r.feedback.map((f) => f.page))];
    listTool(box, {
      head: h("p", { class: "hint top-hint" }, t("fb.hint")),
      items: r.feedback, emptyText: t("fb.none"), reload: again,
      text: (f) => `${f.author_name || ""} ${f.message || ""}`,
      chips: pages.map((p) => ({ id: `p:${p}`, label: tk("page", p), test: (f) => f.page === p })),
      sorts: [
        { id: "new", label: t("sort.new"), cmp: byDate("created_at") },
        { id: "likes", label: t("sort.likes"), cmp: (a, b) => (b.like_count || 0) - (a.like_count || 0) },
        { id: "old", label: t("sort.old"), cmp: byDate("created_at", 1) },
      ],
      copy: (xs) => xs.map((f) => `• [${tk("page", f.page)}${f.like_count ? ` 👍${f.like_count}` : ""}] ${f.message}`).join("\n"),
      item: (f) => h("div", { class: "item" },
        h("div", { class: "head" },
          newChip(f, prev),
          h("span", { class: "who" }, f.author_name ? authorLink(f.author_name) : t("anon")),
          h("span", { class: "chip" }, tk("page", f.page)),
          f.like_count ? h("span", { class: "chip green" }, `👍 ${f.like_count}`) : null,
          h("span", { class: "when" }, when(f.created_at))),
        h("div", { class: "body" }, f.message),
        h("div", { class: "actions" },
          h("button", { class: "ghost sm", onclick: () => copy(f.message) }, t("copy")),
          h("button", { class: "ghost sm", onclick: () => remove("feedback", f.id, t("what.feedback"), again) }, t("remove")))),
      bulk: [{ label: t("remove"), act: (xs) => removeMany(xs.map((f) => ({ type: "feedback", id: f.id })), t("bulk.remove.q", { n: xs.length })) }],
    });
  },

  async ai(box) {
    const r = await call("ai");
    const prev = markSeen("ai", r.ratings);
    const again = () => renderMain("ai", { soft: true });
    const good = (x) => x.vote === "up" || x.vote === 1 || x.vote === true;
    const up = r.ratings.filter(good).length;
    const pct = r.ratings.length ? Math.round((100 * up) / r.ratings.length) : null;
    const unknown = [...r.unknown].sort((a, b) => (b.times || 0) - (a.times || 0));
    const teach = () => `${t("ai.teach.head")}\n${unknown.map((q) => `• ${q.question} (×${q.times})`).join("\n")}`;
    listTool(box, {
      head: [
        h("div", { class: "grid3" }, stat(`${up}`, t("ai.up"), null, "good"), stat(`${r.ratings.length - up}`, t("ai.down"), null, r.ratings.length - up ? "bad" : null), stat(pct == null ? "—" : `${pct}%`, t("ai.pct"))),
        sect(t("ai.unknown"), unknown.length ? h("button", { class: "link sect-r", onclick: () => copy(teach()) }, t("ai.copyTeach")) : null),
        unknown.length
          ? h("div", { class: "panel" }, unknown.map((q) => h("div", { class: "row" }, h("div", { class: "grow" }, q.question), h("span", { class: "chip" }, `×${q.times}`))))
          : empty(t("ai.allClear"), "✦"),
        unknown.length ? h("p", { class: "hint" }, t("ai.teach")) : null,
        sect(t("ai.ratings")),
      ],
      items: r.ratings, emptyText: t("ai.none"), reload: again,
      text: (x) => `${x.question || ""} ${x.answer || ""} ${x.reason || ""}`,
      chips: [{ id: "up", label: "👍", test: good }, { id: "down", label: "👎", test: (x) => !good(x) },
        ...[...new Set(r.ratings.map((x) => x.lang).filter(Boolean))].map((l) => ({ id: `l:${l}`, label: l, test: (x) => x.lang === l }))],
      sorts: [{ id: "new", label: t("sort.new"), cmp: byDate("created_at") }, { id: "old", label: t("sort.old"), cmp: byDate("created_at", 1) }],
      copy: (xs) => xs.map((x) => `${good(x) ? "👍" : "👎"} ${t("ai.q")}: ${x.question || "—"}${x.reason ? `\n   ${t("ai.why")}: ${x.reason}` : ""}`).join("\n"),
      item: (x) => h("div", { class: "item" },
        h("div", { class: "head" }, newChip(x, prev), h("span", { class: `chip ${good(x) ? "green" : "red"}` }, good(x) ? "👍" : "👎"), x.lang ? h("span", { class: "chip" }, x.lang) : null, h("span", { class: "when" }, when(x.created_at))),
        h("div", { class: "body" }, h("b", {}, `${t("ai.q")}: `), x.question || "—"),
        x.answer ? h("div", { class: "quote" }, String(x.answer).slice(0, 400)) : null,
        x.reason ? h("div", { class: "body" }, h("b", {}, `${t("ai.why")}: `), x.reason) : null,
        h("div", { class: "actions" }, h("button", { class: "ghost sm", onclick: () => remove("rating", x.id, t("what.rating"), again) }, t("remove")))),
      bulk: [{ label: t("remove"), act: (xs) => removeMany(xs.map((x) => ({ type: "rating", id: x.id })), t("bulk.remove.q", { n: xs.length })) }],
    });
  },

  async crashes(box) {
    const r = await call("crashes");
    const prev = markSeen("crashes", r.crashes, "last_seen");
    const again = () => renderMain("crashes", { soft: true });
    const forClaude = (c) => [
      `${t("cr.title")} (×${c.count}, ${t("cr.devices", { n: c.devices })}${c.platform ? ", " + tk("platform", c.platform) : ""})`,
      c.message,
      [c.screen && `${t("cr.screen")}: ${c.screen}`, c.app_version && `${t("cr.version")} ${c.app_version}`, `${t("cr.first")} ${when(c.first_seen)}`, `${t("cr.last")} ${when(c.last_seen)}`].filter(Boolean).join(" · "),
    ].join("\n");
    listTool(box, {
      items: r.crashes, emptyText: t("cr.none"), reload: again,
      text: (c) => `${c.message || ""} ${c.screen || ""} ${c.app_version || ""}`,
      chips: [...new Set(r.crashes.map((c) => c.platform).filter(Boolean))].map((p) => ({ id: p, label: tk("platform", p), test: (c) => c.platform === p })),
      sorts: [
        { id: "count", label: t("sort.count"), cmp: (a, b) => (b.count || 0) - (a.count || 0) },
        { id: "last", label: t("sort.new"), cmp: byDate("last_seen") },
        { id: "devices", label: t("sort.devices"), cmp: (a, b) => (b.devices || 0) - (a.devices || 0) },
      ],
      copy: (xs) => xs.map(forClaude).join("\n\n"),
      item: (c) => h("div", { class: "item" },
        h("div", { class: "head" },
          newChip(c, prev, "last_seen"),
          h("span", { class: "chip red" }, `×${c.count}`),
          h("span", { class: "chip" }, t("cr.devices", { n: c.devices })),
          c.platform ? h("span", { class: "chip" }, tk("platform", c.platform)) : null,
          h("span", { class: "when" }, when(c.last_seen))),
        h("div", { class: "body code" }, c.message),
        h("div", { class: "meta" }, [c.screen && `${t("cr.screen")}: ${c.screen}`, c.app_version && `${t("cr.version")} ${c.app_version}`, `${t("cr.first")} ${when(c.first_seen)}`].filter(Boolean).join("   ")),
        h("div", { class: "actions" },
          h("button", { class: "ghost sm", onclick: () => copy(forClaude(c)) }, t("cr.copy")),
          h("button", { class: "ghost sm", onclick: () => remove("crash", c.id, t("what.crash"), again) }, t("cr.fixed")))),
      bulk: [{ label: t("cr.fixed"), act: (xs) => removeMany(xs.map((c) => ({ type: "crash", id: c.id })), t("bulk.fixed.q", { n: xs.length })) }],
      foot: h("p", { class: "hint" }, t("cr.hint")),
    });
  },

  async log(box) {
    const r = await call("log");
    const actions = [...new Set(r.log.map((x) => x.action))];
    const what = (x) => { const d = x.detail || {}; return String(d.title || d.message || d.name || d.question || d.reason || ""); };
    listTool(box, {
      items: r.log, emptyText: t("log.none"), reload: () => renderMain("log"),
      text: (x) => `${tk("act", x.action)} ${what(x)}`,
      chips: actions.map((a) => ({ id: a, label: tk("act", a), test: (x) => x.action === a })),
      sorts: [{ id: "new", label: t("sort.new"), cmp: byDate("created_at") }, { id: "old", label: t("sort.old"), cmp: byDate("created_at", 1) }],
      copy: (xs) => xs.map((x) => `${when(x.created_at)} — ${tk("act", x.action)}${what(x) ? ": " + what(x).slice(0, 200) : ""}`).join("\n"),
      item: (x) => h("div", { class: "item" },
        h("div", { class: "head" }, h("span", { class: "who" }, tk("act", x.action)), h("span", { class: "when" }, when(x.created_at))),
        what(x) ? h("div", { class: "body meta" }, what(x).slice(0, 200)) : null),
    });
  },

  async more(box) {
    fill(box, h("div", { class: "list menu" }, MORE.map((id) =>
      h("button", { class: "menu-row", "data-tab": id, onclick: () => renderMain(id) },
        h("span", { class: `mi mi-${id}` }, icon(id)),
        h("span", { class: "grow" }, h("b", {}, t(`tab.${id}`)), h("span", { class: "meta" }, t(`more.${id}`))),
        h("span", { class: "chev" }, t("chev"))))));
    paintBadges();
  },

  async settings(box) {
    const opt = (label, control, hint) => h("div", { class: "set" }, h("div", { class: "set-l" }, label), control, hint ? h("p", { class: "hint" }, hint) : null);
    const notes = Object.keys(local.notes).length, marked = Object.keys(local.tags).length;
    fill(box,
      h("div", { class: "panel pad stack" },
        opt(t("set.lang"), seg([["ru", "Русский"], ["en", "English"], ["he", "עברית"]], prefs.lang, (v) => { prefs.lang = v; savePrefs(); applyPrefs(); renderMain("settings"); })),
        opt(t("set.theme"), seg([["auto", t("theme.auto")], ["dark", t("theme.dark")], ["light", t("theme.light")]], prefs.theme, (v) => { prefs.theme = v; savePrefs(); applyPrefs(); })),
        opt(t("set.text"), seg([[false, t("text.normal")], [true, t("text.big")]], !!prefs.big, (v) => { prefs.big = v; savePrefs(); applyPrefs(); }))),
      h("div", { class: "panel pad stack" },
        opt(t("set.refresh"), seg([[0, t("off")], [1, t("min", { n: 1 })], [5, t("min", { n: 5 })], [15, t("min", { n: 15 })]], prefs.refresh, (v) => { prefs.refresh = v; savePrefs(); setupAutoRefresh(); }), t("set.refresh.hint")),
        opt(t("set.veil"), seg([[true, t("on")], [false, t("off")]], !!prefs.veil, (v) => { prefs.veil = v; savePrefs(); }), t("set.veil.hint"))),
      sect(t("set.local")),
      h("div", { class: "panel pad stack" },
        h("p", { class: "meta" }, t("set.local.hint", { notes, marked })),
        h("button", { class: "ghost", onclick: () => { local.seen = {}; saveLocal(); toast(t("done")); } }, t("set.resetSeen")),
        h("button", { class: "danger", disabled: !notes && !marked && !local.recent.length, onclick: () => {
          if (!confirm(t("set.wipe.q"))) return;
          local.notes = {}; local.tags = {}; local.names = {}; local.recent = []; saveLocal();
          toast(t("done")); renderMain("settings");
        } }, t("set.wipe"))),
      sect(t("set.account")),
      h("div", { class: "panel pad stack" },
        h("button", { class: "danger", onclick: async () => {
          if (!confirm(t("logout.q"))) return;
          try { await call("logout"); } catch { /* the session goes anyway */ }
          localStorage.removeItem(KEY);
          renderLogin();
        } }, t("logout"))),
      h("p", { class: "hint center" }, `BuildEngine ${t("admin")} · v${VERSION}`),
      h("p", { class: "hint center" }, t("set.safe")),
    );
  },
};

// ── self-update: a home-screen app keeps old files for a long time, so ask the site which
// version is live and reload once when it's newer (version.json is never cached) ──
async function checkUpdate() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const { v } = await r.json();
    if (!v || v === VERSION) return;
    const tried = sessionStorage.getItem("be.admin.reloaded");
    if (tried === v) return; // already reloaded for this version; don't loop
    sessionStorage.setItem("be.admin.reloaded", v);
    location.reload();
  } catch { /* offline: keep what we have */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
checkUpdate();

applyPrefs();
if (localStorage.getItem(KEY)) renderMain("summary");
else renderLogin();
