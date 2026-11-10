// Test Zap's official public, read-only MCP endpoint (announced in zap.co.il/llms.txt).
const URL_ = "https://mcp.zap.co.il/claude/mcp";
let sid = null, idn = 0;
async function rpc(method, params, notify = false) {
  const body = { jsonrpc: "2.0", method, ...(params ? { params } : {}), ...(notify ? {} : { id: ++idn }) };
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sid ? { "mcp-session-id": sid } : {}) },
    body: JSON.stringify(body),
  });
  sid = r.headers.get("mcp-session-id") || sid;
  const t = await r.text();
  if (notify) return { status: r.status };
  // streamable HTTP may answer as SSE: take the last "data:" line
  const data = t.includes("data:") ? t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() : t;
  try { return { status: r.status, json: JSON.parse(data) }; } catch { return { status: r.status, text: t.slice(0, 500) }; }
}

const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args });
  const c = r.json?.result?.structuredContent || (() => { try { return JSON.parse(r.json?.result?.content?.[0]?.text || "null"); } catch { return r.json?.result?.content?.[0]?.text; } })();
  return c;
};
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "buildengine-pricecheck-test", version: "0.1" } });
await rpc("notifications/initialized", null, true);
const PARTS = [["RTX 5060 Ti 16GB","c-graphiccard"], ["RTX 5070 12GB","c-graphiccard"], ["Ryzen 7 7800X3D","c-cpu"], ["Ryzen 5 7600","c-cpu"]];
const WANT = /KSP|ק\.?ס\.?פ|אייבורי|ivory|TMS|טי אם אס|באג|bug/i;
let md = "## Тест цен через Zap\n";
let first = true;
for (const [q, cat] of PARTS) {
  const s = await call("zap_search_products", { query: q, category: cat, page_size: 3 });
  
  const models = (s?.products || []).filter((p) => p.kind === "model").concat((s?.products || []).filter((p) => p.kind !== "model"));
  const m = models[0];
  if (!m) { md += `\n### ${q}\nне найдено (${s?.status || "?"})\n`; continue; }
  const id = m.model_id || m.id;
  const o = await call("zap_get_offers", { model_id: id, limit: 50 });
  if (first) { console.log("RAW-OFFERS", JSON.stringify(o).slice(0, 2000)); first = false; }
  const offers = o?.offers || o?.items || [];
  md += `\n### ${q} → ${m.name || m.title} (мин ${m.min_price ?? m.price_min ?? "?"} ₪, магазинов ${offers.length})\n| Магазин | Цена ₪ |\n|---|---|\n`;
  for (const x of offers) {
    const store = x.store_name || x.store?.name || x.name || "";
    if (WANT.test(store)) md += `| ${store} | ${x.price ?? x.total_price} |\n`;
  }
  md += `| _самая низкая из всех_ | ${Math.min(...offers.map((x) => Number(x.price ?? x.total_price) || 1e9))} |\n`;
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) (await import("node:fs")).appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
