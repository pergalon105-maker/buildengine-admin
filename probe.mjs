// One polite request per site: is a server (outside Israel) let in at all, and what does a refusal say?
const H = { "user-agent": "BuildEngine-PriceCheck/0.1 (price comparison test)", "accept": "text/html,application/json" };
const urls = [
  "https://ksp.co.il/m_action/api/search/?q=rtx",
  "https://ksp.co.il/web/",
  "https://www.ivory.co.il/",
  "https://www.ivory.co.il/catalog.php?act=cat&q=rtx%205060",
  "https://www.tms.co.il/",
];
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: H, redirect: "follow" });
    const t = await r.text();
    const title = (t.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
    const hint = (t.match(/(access denied|forbidden|blocked|captcha|cloudflare|incapsula|imperva|perimeterx|akamai|geo|israel|ישראל|חסום)/i) || [])[0] || "";
    console.log(`RESULT ${r.status}  ${u}  title="${title.trim().slice(0, 80)}"  hint="${hint}"  server="${r.headers.get("server") || ""}"  len=${t.length}`);
  } catch (e) { console.log(`RESULT ERR ${u} ${e.message}`); }
  await new Promise((r) => setTimeout(r, 2000));
}
