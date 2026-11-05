
/* SERVIDOR MULTIJOGADOR EMBUTIDO NO JOGO: o navegador/APK ignora este bloco; só o Node o executa.
   Para ligar o servidor, na pasta deste arquivo (Node 18+):
   node -e "const f='index.html';new Function('require','process','__dirname','GAME_FILE',require('fs').readFileSync(f,'utf8').match(/<script type=\"text\/x-server\">([\s\S]*?)<\/script>/)[1])(require,process,process.cwd(),f)"
   (PORT=3000 antes do comando muda a porta) */
'use strict';
/*
 * Servidor multijogador de "Relic of the Clouds".
 * Sem dependências: só o Node.js (versão 18 ou mais nova).
 *
 *   node server.js            → http://localhost:8787  (também serve o index.html)
 *   PORT=3000 node server.js  → outra porta
 *
 * Faz: contas (senha com scrypt), 3 servidores com limite de jogadores,
 * posição dos jogadores ao vivo e save na nuvem por conta + servidor.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8787;

// ===== CONFIGURAÇÃO DOS SERVIDORES (mude o "max" para o limite de jogadores) =====
const SERVERS = [
  { id: 1, name: 'Mar Calmo',       seed: 20260101, max: 30 },
  { id: 2, name: 'Tempestade',      seed: 71828182, max: 20 },
  { id: 3, name: 'Ilha do Tesouro', seed: 31415926, max: 10 },
];
const VIEW_RANGE = 7000;        // só envia jogadores dentro dessa distância
const TICK_MS = 125;            // 8 atualizações por segundo
const RESERVE_MS = 25000;       // vaga guardada entre "escolher servidor" e a conexão do jogo
const TOKEN_MS = 24 * 3600e3;   // login vale 24 h
const MAX_SAVE = 3 * 1024 * 1024;
// Pausa diária de manutenção (o servidor "recarrega tudo" e volta sozinho). Hora do relógio do servidor.
//   MAINT_AT=04:00 (padrão) · MAINT_AT=off desliga · MAINT_MIN=5 (duração, em minutos)
const MAINT_AT = String(process.env.MAINT_AT || '04:00,12:00,20:00'); // várias pausas por dia, separadas por vírgula
const MAINT_MIN = +process.env.MAINT_MIN || 5;
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // ligue (=1) quando houver proxy na frente (Render, Railway, Fly, nginx…)
// ================================================================================

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data'); // DATA_DIR: pasta do disco persistente da hospedagem
const SAVES = path.join(DATA, 'saves');
fs.mkdirSync(SAVES, { recursive: true });
const USERS_FILE = path.join(DATA, 'users.json');

let users = {};
try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || {}; } catch (e) { users = {}; }
function writeAtomic(file, text) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
const saveUsers = () => writeAtomic(USERS_FILE, JSON.stringify(users));

const scrypt = (p, salt) => new Promise((res, rej) => crypto.scrypt(p, salt, 32, (e, k) => (e ? rej(e) : res(k))));
const USER_RE = /^[a-z0-9_]{3,12}$/;

const th = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const TOKENS_FILE = path.join(DATA, 'tokens.json');
const tokens = new Map();       // sha256(token) -> { u, exp }  (salvo em disco: o login sobrevive à manutenção)
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) || {})) if (v && v.exp > Date.now()) tokens.set(k, v); } catch (e) { }
let tokDirty = false;
const markTok = () => { tokDirty = true; };
const flushTokens = () => { if (!tokDirty) return; tokDirty = false; try { writeAtomic(TOKENS_FILE, JSON.stringify(Object.fromEntries(tokens))); } catch (e) { } };
const reservations = new Map(); // "u:sid" -> exp
const rooms = new Map(SERVERS.map(s => [s.id, new Map()])); // sid -> Map(playerId -> player)
let nextId = 1;

// resumo do save (raça, nível, ouro) para mostrar no menu sem ler o arquivo todo
const sumCache = new Map();
const saveFile = (u, sid) => path.join(SAVES, u + '_' + sid + '.json');
function summary(u, sid) {
  const k = u + ':' + sid;
  if (sumCache.has(k)) return sumCache.get(k);
  let r = null;
  try { const o = JSON.parse(fs.readFileSync(saveFile(u, sid), 'utf8')); if (o && o.v === 1) r = { race: o.race, lv: o.lv, gold: o.gold }; } catch (e) { }
  sumCache.set(k, r); return r;
}
function readSave(u, sid) { try { const o = JSON.parse(fs.readFileSync(saveFile(u, sid), 'utf8')); return o && o.v === 1 ? o : null; } catch (e) { return null; } }

function liveReservations(sid) {
  const now = Date.now(); let n = 0;
  for (const [k, exp] of reservations) {
    if (exp < now) { reservations.delete(k); continue; }
    const [u, s] = k.split(':');
    if (+s === sid && ![...rooms.get(sid).values()].some(p => p.u === u)) n++;
  }
  return n;
}
const online = sid => rooms.get(sid).size;
const taken = sid => online(sid) + liveReservations(sid);

// ===== HTTP =====
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS }); res.end(JSON.stringify(obj)); }
function body(req, limit = 4096) {
  return new Promise((res, rej) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > limit) { rej(new Error('big')); req.destroy(); } else ch.push(c); });
    req.on('end', () => { try { res(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}
function authUser(req) {
  const m = /^Bearer (\w{20,})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const t = tokens.get(th(m[1]));
  if (!t || t.exp < Date.now()) { tokens.delete(th(m[1])); markTok(); return null; }
  return t.u;
}
const tries = new Map(); // ip -> { n, reset }
function throttled(ip) {
  const now = Date.now(); let t = tries.get(ip);
  if (!t || t.reset < now) t = { n: 0, reset: now + 60e3 };
  t.n++; tries.set(ip, t); return t.n > 30;
}
const statusList = u => SERVERS.map(s => ({ id: s.id, name: s.name, seed: s.seed, max: s.max, on: taken(s.id), mine: u ? summary(u, s.id) : undefined }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const f = path.join(__dirname, (typeof GAME_FILE !== 'undefined' && GAME_FILE) || 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('index.html não encontrado ao lado do server.js'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(f).pipe(res);
    }
    if (req.method === 'GET' && url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { servers: statusList(authUser(req)), maint: maintNow() });

    if (req.method === 'POST' && url.pathname === '/api/auth') {
      if (maintNow()) return json(res, 503, maintErr());
      if (throttled(ip)) return json(res, 429, { err: 'Muitas tentativas. Espere um minuto.' });
      const b = await body(req);
      const u = String(b.u || '').trim().toLowerCase(), p = String(b.p || '');
      if (!USER_RE.test(u)) return json(res, 400, { err: 'Usuário: 3 a 12 letras, números ou _' });
      if (p.length < 4 || p.length > 64) return json(res, 400, { err: 'A senha precisa de 4 a 64 caracteres' });
      if (b.mode === 'register') {
        if (users[u]) return json(res, 409, { err: 'Esse usuário já existe' });
        if (Object.keys(users).length >= 5000) return json(res, 503, { err: 'Servidor sem vagas para novas contas' });
        const salt = crypto.randomBytes(16);
        users[u] = { salt: salt.toString('hex'), hash: (await scrypt(p, salt)).toString('hex'), t: Date.now() };
        saveUsers();
      } else {
        const r = users[u];
        const salt = Buffer.from(r ? r.salt : '00'.repeat(16), 'hex');
        const h = await scrypt(p, salt); // roda mesmo sem conta, para não revelar quais usuários existem
        if (!r || !crypto.timingSafeEqual(h, Buffer.from(r.hash, 'hex'))) return json(res, 401, { err: 'Usuário ou senha incorretos' });
      }
      const tok = crypto.randomBytes(24).toString('hex');
      tokens.set(th(tok), { u, exp: Date.now() + TOKEN_MS }); markTok();
      return json(res, 200, { tok, u });
    }

    if (req.method === 'POST' && url.pathname === '/api/enter') {
      if (maintNow()) return json(res, 503, maintErr());
      const u = authUser(req);
      if (!u) return json(res, 401, { err: 'Sessão expirada. Entre de novo.' });
      const b = await body(req);
      const s = SERVERS.find(x => x.id === +b.s);
      if (!s) return json(res, 400, { err: 'Servidor inválido' });
      const already = [...rooms.get(s.id).values()].some(p => p.u === u);
      if (!already && taken(s.id) >= s.max && !reservations.has(u + ':' + s.id)) return json(res, 409, { err: 'Servidor cheio (' + s.max + '/' + s.max + ')', full: 1 });
      reservations.set(u + ':' + s.id, Date.now() + RESERVE_MS);
      return json(res, 200, { seed: s.seed, name: s.name, save: readSave(u, s.id) });
    }
    res.writeHead(404, CORS); res.end('Not found');
  } catch (e) { try { json(res, 400, { err: 'Pedido inválido' }); } catch (e2) { } }
});

// ===== WebSocket (implementação mínima do RFC 6455) =====
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 4 * 1024 * 1024;

function frame(op, payload) {
  const len = payload.length;
  let h;
  if (len < 126) h = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, payload]);
}

class Sock {
  constructor(socket, onMsg, onClose) {
    this.s = socket; this.buf = Buffer.alloc(0); this.parts = []; this.partsLen = 0; this.alive = true; this.seen = Date.now();
    socket.setNoDelay(true);
    socket.on('data', d => this.data(d));
    socket.on('close', () => this.end());
    socket.on('error', () => this.end());
    this.onMsg = onMsg; this.onClose = onClose;
  }
  end() { if (!this.alive) return; this.alive = false; try { this.s.destroy(); } catch (e) { } this.onClose(); }
  send(text) { if (this.alive && this.s.writable) this.s.write(frame(1, Buffer.from(text))); }
  close(code = 1000) { if (!this.alive) return; try { const b = Buffer.alloc(2); b.writeUInt16BE(code); this.s.write(frame(8, b)); } catch (e) { } setTimeout(() => this.end(), 200); }
  ping() { if (this.alive) try { this.s.write(frame(9, Buffer.alloc(0))); } catch (e) { } }
  data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (; ;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 15, masked = !!(b[1] & 0x80);
      let len = b[1] & 127, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME) return this.close(1009);
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let p = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = b.subarray(off, off + 4); p = Buffer.from(p); for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; }
      this.buf = b.subarray(need);
      this.seen = Date.now();
      if (op === 8) return this.close();
      if (op === 9) { try { this.s.write(frame(10, p)); } catch (e) { } continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) {
        this.parts.push(p); this.partsLen += p.length;
        if (this.partsLen > MAX_FRAME) return this.close(1009);
        if (fin) { const t = Buffer.concat(this.parts).toString('utf8'); this.parts = []; this.partsLen = 0; try { this.onMsg(t); } catch (e) { } }
      }
    }
  }
}

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

  let me = null; // jogador desta conexão
  const num = v => (typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e9 ? v : null);
  const ws = new Sock(socket, text => {
    if (text.length > MAX_SAVE + 1024) return;
    const m = JSON.parse(text);
    if (!me) {
      if (m.t !== 'join') return ws.close(1008);
      if (maintNow()) { ws.send(JSON.stringify({ t: 'err', ...maintErr() })); return ws.close(1013); }
      const t = tokens.get(th(m.tok));
      const s = SERVERS.find(x => x.id === +m.s);
      if (!t || t.exp < Date.now() || !s) { ws.send(JSON.stringify({ t: 'err', err: 'Sessão inválida. Entre de novo.' })); return ws.close(1008); }
      const room = rooms.get(s.id);
      for (const [id, p] of room) if (p.u === t.u) { p.ws.send(JSON.stringify({ t: 'err', err: 'Sua conta entrou em outro lugar.', kicked: 1 })); p.ws.close(1000); room.delete(id); }
      const hasRes = reservations.has(t.u + ':' + s.id);
      if (!hasRes && taken(s.id) >= s.max) { ws.send(JSON.stringify({ t: 'err', err: 'Servidor cheio (' + s.max + '/' + s.max + ')', full: 1 })); return ws.close(1008); }
      reservations.delete(t.u + ':' + s.id);
      me = { id: nextId++, u: t.u, sid: s.id, ws, x: 0, y: 0, h: 0, l: 0, r: 'h', has: false, lastPos: 0, lastSave: 0 };
      room.set(me.id, me);
      ws.send(JSON.stringify({ t: 'joined', id: me.id, max: s.max, on: room.size }));
      return;
    }
    if (m.t === 'pos') {
      const now = Date.now(); if (now - me.lastPos < 40) return; me.lastPos = now;
      const x = num(m.x), y = num(m.y), h = num(m.h);
      if (x === null || y === null || h === null) return;
      me.x = x; me.y = y; me.h = h; me.l = m.l ? 1 : 0; if (typeof m.r === 'string' && 'rbch'.includes(m.r) && m.r.length === 1) me.r = m.r; me.has = true; me.p = m.p ? 1 : 0;
    } else if (m.t === 'hit') { // PvP: o servidor valida (ambos com PvP ligado, alcance, dano máximo, limite de golpes) e repassa ao alvo
      const now = Date.now(); if (now - (me.hw || 0) > 1000) { me.hw = now; me.hn = 0; } if (++me.hn > 40) return;
      const v = rooms.get(me.sid).get(m.to | 0), d = num(m.d);
      if (!v || v === me || !me.p || !v.p || !me.has || !v.has || d === null || d <= 0 || d > 400) return;
      if (Math.hypot(v.x - me.x, v.y - me.y) > 3500) return;
      v.by = me.id; v.byT = now; v.ws.send(JSON.stringify({ t: 'hurt', d: Math.round(d), f: me.u }));
    } else if (m.t === 'died') {
      const now = Date.now(), room = rooms.get(me.sid), k = room.get(me.by);
      if (!k || !me.byT || now - me.byT > 10000 || now - (me.dd || 0) < 5000) return; me.dd = now; me.byT = 0;
      k.ws.send(JSON.stringify({ t: 'won', v: me.u, g: 150 }));
      const f = JSON.stringify({ t: 'feed', a: k.u, b: me.u }); for (const q of room.values()) q.ws.send(f);
    } else if (m.t === 'save') {
      const now = Date.now(); if (now - me.lastSave < 4000) return; me.lastSave = now;
      const d = m.d; if (!d || typeof d !== 'object' || d.v !== 1) return;
      const txt = JSON.stringify(d); if (txt.length > MAX_SAVE) return;
      writeAtomic(saveFile(me.u, me.sid), txt);
      sumCache.set(me.u + ':' + me.sid, { race: d.race, lv: d.lv, gold: d.gold });
      ws.send('{"t":"saved"}');
    }
  }, () => { if (me) { const room = rooms.get(me.sid); if (room.get(me.id) === me) room.delete(me.id); } });
});

// envia as posições (só quem está por perto) 8x por segundo
setInterval(() => {
  for (const s of SERVERS) {
    const room = rooms.get(s.id);
    if (!room.size) continue;
    const all = [...room.values()];
    for (const a of all) {
      if (!a.has) { a.ws.send(JSON.stringify({ t: 'ps', p: [], on: room.size, max: s.max })); continue; }
      const p = [];
      for (const b of all) {
        if (b === a || !b.has) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy <= VIEW_RANGE * VIEW_RANGE) p.push([b.id, b.u, Math.round(b.x), Math.round(b.y), Math.round(b.h * 100) / 100, b.l, b.r, b.p ? 1 : 0]);
      }
      a.ws.send(JSON.stringify({ t: 'ps', p, on: room.size, max: s.max }));
    }
  }
}, TICK_MS);

// derruba conexões mudas e limpa tokens vencidos
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) for (const p of room.values()) { if (now - p.ws.seen > 45000) p.ws.end(); else p.ws.ping(); }
  for (const [k, t] of tokens) if (t.exp < now) { tokens.delete(k); markTok(); }
  flushTokens();
}, 15000);

// ===== MANUTENÇÃO DIÁRIA: pausa de MAINT_MIN minutos, com aviso 5 e 1 minuto antes =====
function maintWindow(now) {
  const times = MAINT_AT.split(',').map(x => /^(\d{1,2}):(\d{2})$/.exec(x.trim())).filter(Boolean);
  if (!times.length) return null; // "off" (ou valor inválido) desliga
  const len = MAINT_MIN * 60e3; let best = null;
  for (const m of times) for (const add of [-1, 0, 1]) {
    const d = new Date(now); d.setDate(d.getDate() + add); d.setHours(+m[1], +m[2], 0, 0);
    const start = d.getTime(); if (start + len > now && (!best || start < best.start)) best = { start, end: start + len };
  }
  return best;
}
function maintNow() { const n = Date.now(), w = maintWindow(n); return w && n >= w.start && n < w.end ? Math.max(1, Math.ceil((w.end - n) / 60e3)) : 0; }
const maintErr = () => ({ err: 'Servidor em manutenção. Volta em ~' + maintNow() + ' min.', maint: 1, mins: maintNow() });
function broadcastAll(msg, kick) {
  const txt = JSON.stringify(msg);
  for (const room of rooms.values()) for (const p of [...room.values()]) { p.ws.send(txt); if (kick) p.ws.close(1001); }
  if (kick) for (const room of rooms.values()) room.clear();
}
let warned = {}, wasDown = false;
setInterval(() => {
  const now = Date.now(), w = maintWindow(now); if (!w) return;
  const left = w.start - now;
  for (const m of [5, 1]) { const key = w.start + ':' + m; if (left > 0 && left <= m * 60e3 && !warned[key]) { warned[key] = 1; broadcastAll({ t: 'maint', min: m }); } }
  const down = now >= w.start && now < w.end;
  if (down && !wasDown) {
    wasDown = true; console.log('Manutenção iniciada (' + MAINT_MIN + ' min)');
    broadcastAll({ t: 'down', mins: maintNow() }, true);
    saveUsers(); tokDirty = true; flushTokens();
    sumCache.clear(); reservations.clear(); // recarrega tudo do disco
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || {}; } catch (e) { }
  } else if (!down && wasDown) { wasDown = false; warned = {}; console.log('Manutenção terminou: servidor de volta'); }
}, 1000);

// ===== estabilidade: encerra salvando, e só desiste se os erros não pararem =====
function shutdown(sig) { console.log(sig + ': salvando e encerrando'); try { saveUsers(); tokDirty = true; flushTokens(); } catch (e) { } broadcastAll({ t: 'down', mins: 1 }, true); setTimeout(() => process.exit(0), 400); }
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
let errN = 0, errT = 0;
const onErr = e => { console.error('Erro:', (e && e.stack) || e); const n = Date.now(); if (n - errT > 60e3) { errN = 0; errT = n; } if (++errN > 10) process.exit(1); }; // 10+ erros em 1 min: sai e a hospedagem reinicia
process.on('uncaughtException', onErr); process.on('unhandledRejection', onErr);

// ===== mantém acordado em hospedagens que dormem por falta de visitas (Render define RENDER_EXTERNAL_URL sozinho) =====
const KEEP_URL = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '';
if (KEEP_URL && typeof fetch === 'function') setInterval(() => { fetch(KEEP_URL.replace(/\/+$/, '') + '/health').catch(() => { }); }, 10 * 60e3);

server.listen(PORT, () => {
  console.log('Relic of the Clouds · servidor multijogador em http://localhost:' + PORT);
  console.log('  Pausas diárias (recarga): ' + (maintWindow(Date.now()) ? MAINT_AT + ' · ' + MAINT_MIN + ' min cada' : 'desligadas'));
  for (const s of SERVERS) console.log('  Servidor ' + s.id + ' · ' + s.name + ' · máx. ' + s.max + ' jogadores');
});
