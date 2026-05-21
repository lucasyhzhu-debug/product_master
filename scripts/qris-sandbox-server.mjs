#!/usr/bin/env node
/**
 * QRIS sandbox visual demo — Xendit Test Mode.
 *
 * THROWAWAY SPIKE. Launches a tiny local web page (http://localhost:4399) that
 * mirrors the eventual in-app "Charge via QRIS" dialog:
 *   - Generate a DYNAMIC (exact-amount) QR via Xendit.
 *   - Render the qr_string as a scannable QR image.
 *   - "Simulate customer payment" (Test Mode) → flips to ✓ Paid with the
 *     receipt_id (RRN) + source (paying wallet) the production webhook delivers.
 *
 * The Xendit secret key is read from .env.local and used SERVER-SIDE only —
 * it never reaches the browser.
 *
 * Run:  node scripts/qris-sandbox-server.mjs   (then open http://localhost:4399)
 * Requires Node 18+. No npm deps.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PORT = 4399;
const BASE = "https://api.xendit.co";

function loadApiKey() {
  if (process.env.XENDIT_API_KEY) return process.env.XENDIT_API_KEY.trim();
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const txt = readFileSync(resolve(here, "..", ".env.local"), "utf8");
    const line = txt.split(/\r?\n/).find((l) => l.startsWith("XENDIT_API_KEY="));
    if (line) return line.slice("XENDIT_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* ignore */
  }
  return null;
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error("✗ No XENDIT_API_KEY in env or .env.local"); process.exit(1);
}
const authHeader = "Basic " + Buffer.from(`${API_KEY}:`).toString("base64");

async function xendit(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}
function readJson(req) {
  return new Promise((r) => {
    let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } });
  });
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>QRIS Sandbox — Xendit Test Mode</title>
<script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"></script>
<style>
  :root{--bg:#0b0f17;--card:#141b27;--line:#243044;--ink:#e8eef7;--mut:#8aa0bd;--ok:#1db887;--accent:#5b8cff;--warn:#f5a623}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{width:420px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
  .tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--warn);background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.3);padding:3px 9px;border-radius:999px;text-transform:uppercase}
  h1{font-size:18px;margin:14px 0 2px} .sub{color:var(--mut);font-size:13px;margin:0 0 18px}
  .order{display:flex;justify-content:space-between;align-items:baseline;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:18px}
  .order .num{color:var(--mut);font-size:13px} .order .amt{font-size:24px;font-weight:700}
  button{width:100%;border:0;border-radius:12px;padding:13px;font-size:15px;font-weight:600;cursor:pointer;transition:.15s}
  .primary{background:var(--accent);color:#fff} .primary:hover{filter:brightness(1.08)}
  .sim{background:transparent;color:var(--ink);border:1px solid var(--line);margin-top:10px} .sim:hover{border-color:var(--accent)}
  button:disabled{opacity:.45;cursor:not-allowed}
  .qrwrap{display:none;flex-direction:column;align-items:center;margin:18px 0}
  #qr{background:#fff;padding:14px;border-radius:14px}
  .meta{margin-top:12px;text-align:center;color:var(--mut);font-size:12.5px}
  .meta b{color:var(--ink)} .countdown{font-variant-numeric:tabular-nums}
  .status{display:none;margin-top:16px;border-radius:12px;padding:14px 16px;font-size:14px}
  .status.wait{display:block;background:rgba(91,140,255,.1);border:1px solid rgba(91,140,255,.3);color:#bcd0ff}
  .status.paid{display:block;background:rgba(29,184,135,.12);border:1px solid rgba(29,184,135,.35);color:#7ff0cb}
  .status .big{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
  .status .row{display:flex;justify-content:space-between;margin-top:8px;color:var(--mut)} .status .row b{color:var(--ink)}
  .spin{width:14px;height:14px;border:2px solid #bcd0ff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:s 1s linear infinite} @keyframes s{to{transform:rotate(360deg)}}
  .err{display:none;margin-top:14px;color:#ff9a9a;font-size:13px;white-space:pre-wrap}
</style></head>
<body>
  <div class="card">
    <span class="tag">● Xendit Test Mode</span>
    <h1>Charge via QRIS</h1>
    <p class="sub">Dynamic exact-amount QR · in-person payment</p>
    <div class="order"><div><div class="num">Order #0521-001</div>Frollie</div><div class="amt">Rp 35.000</div></div>

    <button class="primary" id="gen" onclick="generate()">Generate QRIS QR</button>

    <div class="qrwrap" id="qrwrap">
      <div id="qr"></div>
      <div class="meta">NMID <b id="nmid">—</b> · expires in <b class="countdown" id="cd">30:00</b></div>
    </div>

    <div class="status" id="status"></div>
    <button class="sim" id="sim" style="display:none" onclick="simulate()">▶ Simulate customer scan &amp; pay (Test Mode)</button>
    <div class="err" id="err"></div>
  </div>

<script>
let externalId=null, qrId=null, cdTimer=null;
const $=(id)=>document.getElementById(id);
function showErr(m){ $('err').style.display='block'; $('err').textContent=m; }

async function generate(){
  $('gen').disabled=true; $('gen').textContent='Generating…'; $('err').style.display='none';
  try{
    const r=await fetch('/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:35000})});
    const d=await r.json();
    if(!r.ok){ showErr('Create failed:\\n'+JSON.stringify(d,null,2)); $('gen').disabled=false; $('gen').textContent='Generate QRIS QR'; return; }
    externalId=d.external_id||d.reference_id; qrId=d.id;
    $('qr').innerHTML=''; new QRCode($('qr'),{text:d.qr_string||externalId,width:200,height:200});
    $('nmid').textContent=(d.qr_string&&d.qr_string.length>20)?'ID'+(qrId||'').slice(3,12):'(test placeholder)';
    $('qrwrap').style.display='flex';
    $('gen').style.display='none';
    $('sim').style.display='block';
    setStatus('wait','<div class="big"><span class="spin"></span> Waiting for payment…</div><div class="row"><span>QR status</span><b>'+d.status+'</b></div>');
    startCountdown(30*60);
  }catch(e){ showErr(String(e)); $('gen').disabled=false; $('gen').textContent='Generate QRIS QR'; }
}

async function simulate(){
  $('sim').disabled=true; $('sim').textContent='Processing payment…';
  try{
    const r=await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({externalId,amount:35000})});
    const d=await r.json();
    if(!r.ok||d.status!=='COMPLETED'){ showErr('Simulate response:\\n'+JSON.stringify(d,null,2)); $('sim').disabled=false; $('sim').textContent='▶ Simulate customer scan & pay (Test Mode)'; return; }
    clearInterval(cdTimer);
    const pd=d.payment_details||{};
    setStatus('paid','<div class="big">✓ Paid via '+(pd.source||'?')+'</div>'+
      '<div class="row"><span>Amount</span><b>Rp '+Number(d.amount).toLocaleString("id-ID")+'</b></div>'+
      '<div class="row"><span>Receipt (RRN)</span><b>'+(pd.receipt_id||'?')+'</b></div>'+
      '<div class="row"><span>Payment ID</span><b>'+d.id+'</b></div>');
    $('sim').style.display='none';
    $('cd').textContent='—';
  }catch(e){ showErr(String(e)); $('sim').disabled=false; }
}

function setStatus(cls,html){ const s=$('status'); s.className='status '+cls; s.innerHTML=html; }
function startCountdown(secs){ clearInterval(cdTimer); let t=secs; const tick=()=>{ const m=String(Math.floor(t/60)).padStart(2,'0'),s=String(t%60).padStart(2,'0'); $('cd').textContent=m+':'+s; if(t--<=0)clearInterval(cdTimer); }; tick(); cdTimer=setInterval(tick,1000); }
</script>
</body></html>`;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") return send(res, 200, "text/html; charset=utf-8", PAGE);
    if (req.method === "POST" && req.url === "/api/create") {
      const { amount } = await readJson(req);
      const ref = `qris-poc-${Date.now()}`;
      const r = await xendit("POST", "/qr_codes", {
        reference_id: ref, external_id: ref, type: "DYNAMIC", currency: "IDR",
        amount: Number(amount) || 35000, callback_url: "https://example.com/qris-poc-webhook",
      });
      return send(res, r.status, "application/json", JSON.stringify(r.json));
    }
    if (req.method === "POST" && req.url === "/api/simulate") {
      const { externalId, amount } = await readJson(req);
      const r = await xendit("POST", `/qr_codes/${externalId}/payments/simulate`, { amount: Number(amount) || 35000 });
      return send(res, r.status, "application/json", JSON.stringify(r.json));
    }
    send(res, 404, "text/plain", "not found");
  } catch (e) {
    send(res, 500, "application/json", JSON.stringify({ error: String(e) }));
  }
});

server.listen(PORT, () => console.log(`QRIS sandbox demo → http://localhost:${PORT}`));
