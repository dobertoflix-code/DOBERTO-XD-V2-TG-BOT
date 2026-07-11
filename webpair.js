require('./setting/config');
const express = require('express');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const startpairing = require('./pair.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PAIRING_DIR = './richstore/pairing';
const PAIRING_FILE = path.join(PAIRING_DIR, 'pairing.json');
const MAX_PAIRED = 70;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// Menm règ validasyon ak Telegram /connect la, pou konpòtman rete konsistan
function validateNumber(raw) {
  if (!raw) return { ok: false, error: 'Antre yon nimewo WhatsApp.' };
  const text = String(raw).trim();

  if (/[a-z]/i.test(text)) return { ok: false, error: 'Sèlman chif, pa mete lèt.' };
  if (!/^\d{7,15}$/.test(text)) return { ok: false, error: 'Fòma nimewo a pa bon. Egzanp: 509xxxxxxxx' };
  if (text.startsWith('0')) return { ok: false, error: 'Pa mete "0" devan nimewo a.' };

  const countryCode = text.slice(0, 3);
  const prefix = text.slice(0, 1);
  if (['252', '229', '92', '0'].includes(countryCode) || prefix === '0') {
    return { ok: false, error: 'Peyi sa a pa sipòte pou kounye a.' };
  }

  return { ok: true, jid: `${text}@s.whatsapp.net`, number: text };
}

function tooManyPairedUsers() {
  ensureDirectoryExists(PAIRING_DIR);
  const count = fs.readdirSync(PAIRING_DIR).filter((f) => f.endsWith('@s.whatsapp.net')).length;
  return count >= MAX_PAIRED;
}

// Tann pairing.json la ekri kòd ki koresponn ak nimewo n ap tann lan
async function waitForPairingCode(expectedJid, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(800);
    try {
      if (fs.existsSync(PAIRING_FILE)) {
        const data = JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
        const isFresh = Date.now() - new Date(data.timestamp).getTime() < timeoutMs + 5000;
        if (data.number === expectedJid && isFresh) return data.code;
      }
    } catch (_) {
      // ignore, retry
    }
  }
  return null;
}

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ht">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DOBERTO MD - Pairing</title>
<style>
  :root { --bg:#0B0D12; --card:#12151C; --gold:#F2C26B; --text:#F5F5F5; --muted:#8A8F98; }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:var(--bg); color:var(--text);
    font-family:'Segoe UI', Roboto, Arial, sans-serif;
    padding:24px;
  }
  .card {
    background:var(--card); border:1px solid rgba(242,194,107,0.15);
    border-radius:16px; padding:32px 28px; width:100%; max-width:400px;
    box-shadow:0 20px 60px rgba(0,0,0,0.5);
  }
  h1 { font-size:20px; margin:0 0 4px; letter-spacing:0.5px; }
  .brand { color:var(--gold); }
  p.sub { color:var(--muted); font-size:13px; margin:0 0 24px; }
  label { font-size:13px; color:var(--muted); display:block; margin-bottom:6px; }
  input {
    width:100%; padding:14px; border-radius:10px; border:1px solid #262A33;
    background:#0F1218; color:var(--text); font-size:16px; margin-bottom:16px;
  }
  input:focus { outline:none; border-color:var(--gold); }
  button {
    width:100%; padding:14px; border:none; border-radius:10px;
    background:var(--gold); color:#12151C; font-weight:700; font-size:15px;
    cursor:pointer;
  }
  button:disabled { opacity:0.6; cursor:not-allowed; }
  #result { margin-top:20px; text-align:center; }
  .code {
    font-size:28px; font-weight:800; letter-spacing:3px; color:var(--gold);
    background:#0F1218; padding:14px; border-radius:10px; margin-top:10px;
    word-break:break-all;
  }
  .error { color:#FF6B6B; font-size:13px; margin-top:14px; text-align:center; }
  .hint { color:var(--muted); font-size:12px; margin-top:14px; text-align:center; }
</style>
</head>
<body>
  <div class="card">
    <h1>DOBERTO <span class="brand">MD</span></h1>
    <p class="sub">Konekte WhatsApp ou ak bot la — pa bezwen Telegram</p>

    <label for="num">Nimewo WhatsApp (san +, san 0 devan)</label>
    <input id="num" type="tel" placeholder="509xxxxxxxx" inputmode="numeric">
    <button id="btn" onclick="pair()">Jenere kòd pairing</button>

    <div id="result"></div>
    <div class="hint">Apre w resevwa kòd la, mete l nan WhatsApp: Aparèy Konekte → Konekte ak nimewo telefòn</div>
  </div>

<script>
async function pair() {
  const num = document.getElementById('num').value.trim();
  const btn = document.getElementById('btn');
  const result = document.getElementById('result');
  result.innerHTML = '';

  if (!num) {
    result.innerHTML = '<div class="error">Antre yon nimewo dabò.</div>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Ap jenere kòd...';

  try {
    const res = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: num })
    });
    const data = await res.json();

    if (data.success) {
      result.innerHTML = '<div class="code">' + data.code + '</div>';
    } else {
      result.innerHTML = '<div class="error">' + data.error + '</div>';
    }
  } catch (e) {
    result.innerHTML = '<div class="error">Yon erè rive. Eseye ankò.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Jenere kòd pairing';
  }
}
</script>
</body>
</html>`);
});

app.post('/api/pair', async (req, res) => {
  try {
    const { number } = req.body;
    const validation = validateNumber(number);
    if (!validation.ok) {
      return res.json({ success: false, error: validation.error });
    }

    if (tooManyPairedUsers()) {
      return res.json({ success: false, error: 'Pa gen plas pairing disponib kounye a. Kontakte owner la.' });
    }

    console.log(chalk.blue(`🌐 [WEB] Pairing request for ${validation.jid}`));
    await startpairing(validation.jid);

    const code = await waitForPairingCode(validation.jid);
    if (!code) {
      return res.json({ success: false, error: 'Pa t rive jenere kòd la. Eseye ankò nan 30 segond.' });
    }

    console.log(chalk.green(`✅ [WEB] Code generated for ${validation.jid}: ${code}`));
    return res.json({ success: true, code });
  } catch (err) {
    console.error(chalk.red('[WEB] Pairing error:'), err);
    return res.json({ success: false, error: 'Erè sèvè. Eseye ankò pita.' });
  }
});

const PORT = process.env.WEBPAIR_PORT || process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(chalk.green(`✅ Web pairing page ap kouri sou pò ${PORT} (san Telegram)`));
});

module.exports = app;
