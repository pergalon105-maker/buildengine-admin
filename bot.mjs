// Price bot test: asks KSP's public product API for a few parts and prints name, price, stock.
// Polite on purpose: few requests, a pause between them, and an honest name in User-Agent.
// Reads only price and availability; no images or descriptions.
const PARTS = [
  "RTX 5060 Ti 16GB",
  "RTX 5070",
  "Ryzen 7 7800X3D",
  "Ryzen 5 7600",
  "DDR5 32GB",
];
const API = "https://ksp.co.il/m_action/api/";
const HEADERS = {
  "user-agent": "BuildEngine-PriceCheck/0.1 (price comparison test)",
  "lang": "he",
  "referer": "https://ksp.co.il/web/",
  "accept": "application/json",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const res = await fetch(API + path, { headers: HEADERS });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

const rows = [];
const log = [];
for (const q of PARTS) {
  const r = await get(`search/?q=${encodeURIComponent(q)}`);
  log.push(`search "${q}": HTTP ${r.status}${r.json ? "" : " (not JSON: " + r.text.slice(0, 120).replace(/\s+/g, " ") + ")"}`);
  const items = r.json?.result?.items || [];
  for (const it of items.slice(0, 3)) {
    let stock = "?";
    await sleep(1500);
    const s = await get(`mlay/${it.uinsql}`);
    if (s.json?.result) {
      const branches = Object.values(s.json.result).filter((b) => b && typeof b === "object" && "qnt" in b);
      const inStock = branches.filter((b) => b.qnt > 0).length;
      stock = branches.length ? `${inStock}/${branches.length}` : "?";
    } else stock = `HTTP ${s.status}`;
    rows.push({ q, name: it.name, price: it.price, uin: it.uin, stock });
  }
  if (!items.length) rows.push({ q, name: "— not found —", price: "", uin: "", stock: "" });
  await sleep(2000);
}

const table = [
  "| Искали | Товар в KSP | Цена ₪ | В наличии (филиалов) |",
  "|---|---|---|---|",
  ...rows.map((x) => `| ${x.q} | ${String(x.name).replace(/\|/g, "/")} | ${x.price} | ${x.stock} |`),
].join("\n");
const out = `## Тест бота цен KSP\n\n${table}\n\n<details><summary>Технический журнал</summary>\n\n${log.map((l) => "- " + l).join("\n")}\n</details>\n`;
console.log(out);
const fs = await import("node:fs");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
