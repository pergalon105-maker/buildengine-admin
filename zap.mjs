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
const card = await fetch("https://mcp.zap.co.il/.well-known/mcp/server-card.json").then((r) => r.text()).catch((e) => "ERR " + e.message);
console.log("CARD", card.slice(0, 3000));
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "buildengine-pricecheck-test", version: "0.1" } });
console.log("INIT", init.status, JSON.stringify(init.json || init.text).slice(0, 600));
await rpc("notifications/initialized", null, true);
const tools = await rpc("tools/list", {});
console.log("TOOLS", tools.status, JSON.stringify((tools.json?.result?.tools || []).map((t) => ({ name: t.name, desc: (t.description || "").slice(0, 160), args: Object.keys(t.inputSchema?.properties || {}) })), null, 1).slice(0, 5000) || tools.text);
