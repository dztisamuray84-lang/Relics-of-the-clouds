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
const zlib = require('zlib');

const PORT = +process.env.PORT || 8787;

// ===== CONFIGURAÇÃO DOS SERVIDORES (mude o "max" para o limite de jogadores) =====
const SERVERS = [
  { id: 1, name: 'Mar Calmo',       seed: 20260101, max: 30 },
  { id: 2, name: 'Tempestade',      seed: 71828182, max: 20 },
  { id: 3, name: 'Ilha do Tesouro', seed: 31415926, max: 10 },
];
const VIEW_RANGE = 7000;        // só envia jogadores dentro dessa distância
const LOOK_RE = /^[rbch]\|[-0-9.]{1,40}\|[-0-9.]{1,30}\|[-0-9.]{1,30}\|[-0-9.]{1,40}$/; // visual do personagem (só formato; o servidor não interpreta)
const TICK_MS = 125;            // 8 atualizações por segundo
const RESERVE_MS = 25000;       // vaga guardada entre "escolher servidor" e a conexão do jogo
const TOKEN_MS = 7 * 24 * 3600e3;   // login vale 7 dias
const MAX_SAVE = 3 * 1024 * 1024;
// Pausa diária de manutenção (o servidor "recarrega tudo" e volta sozinho). Hora do relógio do servidor.
//   MAINT_AT=04:00 (padrão) · MAINT_AT=off desliga · MAINT_MIN=5 (duração, em minutos)
const MAINT_AT = String(process.env.MAINT_AT || '04:00,12:00,20:00'); // várias pausas por dia, separadas por vírgula
const MAINT_MIN = +process.env.MAINT_MIN || 5;
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // ligue (=1) quando houver proxy na frente (Render, Railway, Fly, nginx…)
// ================================================================================

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data'); // DATA_DIR: pasta do disco persistente da hospedagem

// ===== BACKUP EXTERNO NO GITHUB (contas, saves e tudo de DATA_DIR) =====
// Hospedagem grátis (Render) apaga o disco a cada reinício. Com estas variáveis, o servidor copia os dados para um repositório PRIVADO do GitHub
// e, se subir com o disco vazio, baixa tudo de volta ANTES de ler as contas.
//   BACKUP_GH_TOKEN  token do GitHub com acesso de leitura e escrita a "Contents" desse repositório
//   BACKUP_GH_REPO   "usuario/repositorio" (privado, pode estar vazio)
//   BACKUP_GH_BRANCH branch (padrão: main) · BACKUP_MIN minutos entre backups (padrão: 5) · BACKUP_GH_API (padrão: https://api.github.com)
const BK = { token: process.env.BACKUP_GH_TOKEN || '', repo: process.env.BACKUP_GH_REPO || '', branch: process.env.BACKUP_GH_BRANCH || 'main', api: (process.env.BACKUP_GH_API || 'https://api.github.com').replace(/\/+$/, ''), min: +process.env.BACKUP_MIN || 5 };
const BK_ON = !!(BK.token && BK.repo && typeof fetch === 'function');
const bkHeaders = { Authorization: 'Bearer ' + BK.token, 'User-Agent': 'relic-of-the-clouds-backup', 'X-GitHub-Api-Version': '2022-11-28', Accept: 'application/vnd.github+json' };
async function bkRestoreRun() { // roda num processo filho (para esperar o download antes de o servidor ler os arquivos)
  const fs = require('fs'), path = require('path'), zlib = require('zlib'), E = process.env;
  const api = (E.BACKUP_GH_API || 'https://api.github.com').replace(/\/+$/, ''), br = E.BACKUP_GH_BRANCH || 'main';
  const H = { Authorization: 'Bearer ' + E.BACKUP_GH_TOKEN, 'User-Agent': 'relic-of-the-clouds-backup', 'X-GitHub-Api-Version': '2022-11-28', Accept: 'application/vnd.github+json' };
  const tr = await fetch(api + '/repos/' + E.BACKUP_GH_REPO + '/git/trees/' + encodeURIComponent(br) + '?recursive=1', { headers: H });
  if (tr.status === 404 || tr.status === 409) { console.log('Backup: nada para restaurar (repositório vazio ou sem a branch)'); return; }
  if (!tr.ok) throw new Error('GitHub respondeu ' + tr.status + ' (confira BACKUP_GH_TOKEN e BACKUP_GH_REPO)');
  const j = await tr.json(); let n = 0;
  for (const f of j.tree || []) {
    if (f.type !== 'blob' || !f.path.startsWith('data/') || !f.path.endsWith('.gz')) continue;
    const rel = f.path.slice(5, -3); if (!rel || rel.includes('..') || rel.startsWith('/')) continue;
    const r = await fetch(api + '/repos/' + E.BACKUP_GH_REPO + '/git/blobs/' + f.sha, { headers: H });
    if (!r.ok) throw new Error('GitHub respondeu ' + r.status + ' ao baixar ' + rel);
    const out = path.join(E.BK_DATA, rel); fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zlib.gunzipSync(Buffer.from((await r.json()).content, 'base64'))); n++;
  }
  console.log('Backup: ' + n + ' arquivo(s) restaurado(s) do GitHub');
}
if (BK_ON && !fs.existsSync(path.join(DATA, 'users.json'))) { // disco vazio (primeira vez ou reinício do Render): baixa o backup antes de tudo
  console.log('Backup: disco sem contas, restaurando do GitHub…');
  try { require('child_process').execFileSync(process.execPath, ['-e', '(' + bkRestoreRun.toString() + ')().catch(e=>{console.log("Restauração falhou: "+e.message);process.exit(1)})'], { stdio: 'inherit', timeout: 240000, env: { ...process.env, BK_DATA: DATA } }); }
  catch (e) { console.log('Backup: a restauração falhou; encerrando para não começar com contas vazias (a hospedagem tenta de novo). Para ignorar: apague BACKUP_GH_TOKEN.'); process.exit(1); }
}
const SAVES = path.join(DATA, 'saves');
fs.mkdirSync(SAVES, { recursive: true });
const USERS_FILE = path.join(DATA, 'users.json');

let users = {};
try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || {}; } catch (e) { users = {}; }
function writeAtomic(file, text) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
const saveUsers = () => writeAtomic(USERS_FILE, JSON.stringify(users));
// ===== NUVEM DA CONTA (arquivo por usuário em DATA_DIR/cloud) =====
const CLOUD_DIR = path.join(DATA, 'cloud'); fs.mkdirSync(CLOUD_DIR, { recursive: true });
const CLOUD_KEY_RE = /^(npv_|rotc_|relicDiario_|lilith)[A-Za-z0-9_:.\-]{0,90}$/; // só chaves do jogo
const CLOUD_MAX_KEY = 3 * 1024 * 1024, CLOUD_MAX_TOTAL = 12 * 1024 * 1024;
const cloudFile = u => path.join(CLOUD_DIR, u + '.json');
function cloudRead(u) { try { const o = JSON.parse(fs.readFileSync(cloudFile(u), 'utf8')); return o && o.k && typeof o.k === 'object' ? o : { k: {}, t: 0 }; } catch (e) { return { k: {}, t: 0 }; } }

// ===== FRAGMENTO CARREGADO DO SAMURAI (compartilhado por servidor): se pelo menos uma pessoa entregou o fragmento, o contador de aparições começa =====
const SF_FILE = path.join(DATA, 'samfrag.json');
let SF = {}; try { SF = JSON.parse(fs.readFileSync(SF_FILE, 'utf8')) || {}; } catch (e) { SF = {}; }
const sfOf = sid => SF[sid] || (SF[sid] = { c: 0, st: 0, t: 0, k: {} }); // c: aparições contadas (0-12) · st: alguém já entregou o fragmento · t: fim da janela de 30 min do Shirogane Ryu (ms) · k: chave da aparição -> número dela
const SF_WIN = 30 * 60 * 1000; // o Shirogane Ryu fica 30 min na ilha de sakura; sem vitória, as 12 aparições recomeçam
const sfTr = s => (s.c === 12 && s.t > Date.now()) ? s.t - Date.now() : 0; // tempo que falta da janela
const sfSave = () => { try { writeAtomic(SF_FILE, JSON.stringify(SF)); } catch (e) { } };
// ===== TERRAS E CONSTRUÇÕES · compradas e construídas por servidor, guardadas em disco =====
// BLD[sid] = { c: { 'ci,cj': dono }, f: { 'ci,cj': [amigos] }, p: { 'i,j': [tipo, quem colocou] }, n: { usuário: nº de peças } }
//   ci,cj = chunk do jogo (12000 px) · i,j = célula de 80 px da peça.
// Cada chunk só tem UM dono por servidor (o primeiro que compra). O dono dá permissão a amigos (até 20): amigo constrói e recolhe as próprias peças;
// o dono recolhe qualquer peça da sua terra. Quem não é dono nem amigo só vê as peças e esbarra nelas.
const BLD_FILE = path.join(DATA, 'builds.json');
let BLD = {}; try { BLD = JSON.parse(fs.readFileSync(BLD_FILE, 'utf8')) || {}; } catch (e) { BLD = {}; }
const bldOf = sid => { const b = BLD[sid] || (BLD[sid] = { c: {}, f: {}, p: {}, n: {} }); if (!b.f) b.f = {}; if (!b.n || !Object.keys(b.n).length) { b.n = {}; for (const v of Object.values(b.p)) b.n[v[1]] = (b.n[v[1]] | 0) + 1; } return b; };
let bldTm = 0; const bldSave = () => { if (bldTm) return; bldTm = setTimeout(() => { bldTm = 0; try { writeAtomic(BLD_FILE, JSON.stringify(BLD)); } catch (e) { } }, 2000); };
const BLD_S = 80, BLD_CS = 12000, BLD_OX = -14500, BLD_OY = -6000, BLD_MAX = 6000, BLD_LV = 4, BLD_CHUNKS = 300, BLD_FR = 20;
// mesmos ids de PECAS no jogo. Classe: s = sólida · f = piso/passável · t = escada (usada na checagem de apoio dos andares)
const BLD_T = {}; for (const k of 'wm wp wn wo co ce ja mz ca st fn gr lr wv vt aq fp fg fh fq fs'.split(' ')) BLD_T[k] = 's'; for (const k of 'pm pp pg po tm pq ar pf lm pb tc tp ct bd lc pv fz fc fa'.split(' ')) BLD_T[k] = 'f'; for (const k of 'es ep'.split(' ')) BLD_T[k] = 't';
for (const k of 'serra escultor bigorna forja tear alquimia planta'.split(' ')) BLD_T['b_' + k] = 's';
const BLD_OK = { test: k => Object.prototype.hasOwnProperty.call(BLD_T, k) };
const bldKey = (i, j, z) => z ? i + ',' + j + ',' + z : i + ',' + j;
function bldAnch(B, i, j, z) { // mesma regra de apoio do jogo (anch): peça embaixo, peça vizinha no andar, ou sólida a até 2 células no andar de baixo
  if (!z) return true; const g = (a, b, c) => { const v = B.p[bldKey(a, b, c)]; return v ? BLD_T[v[0]] : ''; };
  if (g(i, j, z - 1)) return true;
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g(i + a, j + b, z)) return true;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (g(i + a, j + b, z - 1) === 's') return true;
  return false;
}
const BLD_NAME = /^[a-z0-9_]{3,12}$/;
const bldCell = (i, j) => Number.isInteger(i) && Number.isInteger(j) && Math.abs(i) < 2e5 && Math.abs(j) < 2e5;
const bldChunk = (ci, cj) => Number.isInteger(ci) && Number.isInteger(cj) && Math.abs(ci) < 5e3 && Math.abs(cj) < 5e3;
const bldCk = (i, j) => Math.floor(((i + .5) * BLD_S - BLD_OX) / BLD_CS) + ',' + Math.floor(((j + .5) * BLD_S - BLD_OY) / BLD_CS);
const bldCan = (B, ck, u) => B.c[ck] === u || (B.f[ck] || []).includes(u);
function bldClaim(me, ci, cj) { // compra do chunk: null = é seu agora (ou já era), senão o motivo
  if (!bldChunk(ci, cj)) return 'bad';
  const B = bldOf(me.sid), ck = ci + ',' + cj, cl = B.c[ck];
  if (cl) return cl === me.u ? null : 'land:' + cl;
  if (Object.values(B.c).filter(x => x === me.u).length >= BLD_CHUNKS) return 'max';
  B.c[ck] = me.u; return null;
}
function bldPlace(me, i, j, k, z) { // devolve null se deu certo, ou o motivo da recusa (z = andar 0 a 3)
  z = z | 0; if (!bldCell(i, j) || z < 0 || z >= BLD_LV) return 'bad';
  const B = bldOf(me.sid), key = bldKey(i, j, z), cur = B.p[key], ck = bldCk(i, j), cl = B.c[ck];
  if (k === '') { if (!cur) return null; if (cur[1] !== me.u && cl !== me.u) return 'owner'; delete B.p[key]; B.n[cur[1]] = Math.max(0, (B.n[cur[1]] | 0) - 1); return null; }
  if (typeof k !== 'string' || !BLD_OK.test(k)) return 'bad';
  if (!cl) return 'noland';
  if (!bldCan(B, ck, me.u)) return 'land:' + cl;
  if (cur) return (cur[1] === me.u && cur[0] === k) ? null : 'busy';
  if (!bldAnch(B, i, j, z)) return 'anchor';
  if ((B.n[me.u] | 0) >= BLD_MAX) return 'max';
  B.p[key] = [k, me.u]; B.n[me.u] = (B.n[me.u] | 0) + 1; return null;
}
const SF_KEY = /^sam-?\d{1,12}-\d{1,9}$/;

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
setInterval(() => { // janela do Shirogane Ryu esgotada sem vitória: as 12 aparições recomeçam (o fragmento já entregue continua valendo)
  const now = Date.now();
  for (const sid of Object.keys(SF)) { const s = SF[sid]; if (s.c === 12 && !s.t) { s.t = now + SF_WIN; sfSave(); } if (s.c === 12 && s.t && now > s.t) { s.c = 0; s.t = 0; s.k = {}; sfSave(); const room = rooms.get(sid); if (room) { const o = JSON.stringify({ t: 'sfr', c: 0, k: '', n: 0, tr: 0, rs: 1 }); for (const q of room.values()) q.ws.send(o); } } }
}, 5000);

  // ===== CHEFES DE ILHA COMPARTILHADOS ENTRE OS JOGADORES DO MESMO SERVIDOR =====
  // O servidor guarda vida, dono da simulação e morte de cada chefe de ilha (chave "b<seed>"). Um jogador por chefe (o "dono") roda a IA no aparelho dele e manda o estado;
  // os outros veem o MESMO chefe, tiram da MESMA vida e dividem a recompensa. Depois de morrer o chefe renasce em BOSS_RESPAWN_MIN minutos (padrão 10; 0 = nunca renasce).
  // tempo para renascer (segundos), igual ao BRSM do jogo; BOSS_RESPAWN_MIN=N no ambiente força N minutos para todos (0 = nunca renasce)
  const BOSS_RESPAWN_ENV = (process.env.BOSS_RESPAWN_MIN !== undefined && process.env.BOSS_RESPAWN_MIN !== '' && isFinite(+process.env.BOSS_RESPAWN_MIN)) ? +process.env.BOSS_RESPAWN_MIN * 60e3 : null;
  const BOSS_RESPAWN_TBL = { b: 600, s: 600, sam: 900, gato: 1200, vag: 1200 };
  const bossRespawn = k => BOSS_RESPAWN_ENV !== null ? BOSS_RESPAWN_ENV : (BOSS_RESPAWN_TBL[String(k).replace(/-?\d+$/, '')] || 600) * 1000;
  const BOSS_RE = /^(?:b|s|sam|gato|vag)-?\d{1,12}$/, BOSS_MIN_SHARE = 0.01, BOSS_IDLE_MS = 180e3, BOSS_STALE_MS = 4000;
  const bosses = new Map(SERVERS.map(s => [s.id, new Map()])); // sid -> Map(chave -> chefe)
  const bnum = v => (typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e9 ? v : null);
  function bossOwnerPick(sid, b, skip) { // passa a simulação para o jogador engajado mais perto do chefe
    const room = rooms.get(sid); let best = null, bd = 1e30;
    for (const id of b.eng) { if (id === skip) continue; const q = room.get(id); if (!q) continue; const d = b.st ? (q.x - b.st[0]) ** 2 + (q.y - b.st[1]) ** 2 : 0; if (d < bd) { bd = d; best = q; } }
    if (!best) return false;
    b.owner = best.id; b.lastBs = Date.now();
    best.ws.send(JSON.stringify({ t: 'bown', k: b.k, s: b.st }));
    return true;
  }
  // Vida e nível do chefe = SOMA do que cada jogador na luta daria sozinho (cada um manda a sua parte ao entrar). Ao entrar/sair alguém a vida atual acompanha a mesma porcentagem.
  const BOSS_LV_MAX = 600;
  function bossRecalc(b) {
    if (!b.parts.size) return;
    let hp = 0, lv = 0; for (const p of b.parts.values()) { hp += p.h; lv += p.lv; }
    const ratio = b.max > 0 ? b.hp / b.max : 1;
    b.max = Math.max(10, Math.round(hp)); b.hp = Math.max(1, Math.round(b.max * ratio)); b.lv = Math.min(BOSS_LV_MAX, Math.round(lv)); b.dirty = 1;
  }
  function bossLeave(p, k) {
    p.bk.delete(k); const b = bosses.get(p.sid).get(k); if (!b) return;
    b.eng.delete(p.id); if (b.parts.delete(p.id)) bossRecalc(b); if (!b.eng.size) b.idle = Date.now();
    if (b.owner === p.id) { b.owner = 0; bossOwnerPick(p.sid, b, 0); }
  }
  function bossDie(sid, b, killer) {
    const room = rooms.get(sid), now = Date.now();
    b.hp = 0; b.deadAt = now;
    const win = new Set([...b.dmg].filter(([u, d]) => d >= b.max * BOSS_MIN_SHARE).map(x => x[0])); if (killer) win.add(killer);
    const names = [...win].slice(0, 6);
    for (const id of b.eng) { const q = room.get(id); if (!q) continue; q.bk.delete(b.k); q.ws.send(JSON.stringify({ t: 'bdead', k: b.k, r: win.has(q.u) ? 1 : 0, w: names, rs: bossRespawn(b.k) })); }
    b.eng.clear(); b.parts.clear(); b.owner = 0; b.dmg.clear(); b.st = null;
  }

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

// ===== MAPA EXPLORADO CONFERIDO PELO SERVIDOR =====
// O servidor calcula sozinho quais ladrilhos de 1000 px o jogador revelou, a partir da posição que ele manda (mesma regra do jogo: raio de 5200 px).
// O save na nuvem sempre sai com a lista "ex" (e os limites "bnd") do servidor: tiles inventados pelo aparelho do jogador não entram.
// Contas antigas: na primeira vez, o mapa já salvo no arquivo vira o ponto de partida (migração).
const EXP_DIR = path.join(DATA, 'explored'); fs.mkdirSync(EXP_DIR, { recursive: true });
const EXP_TILE = 1000, EXP_R = Math.ceil(5200 / EXP_TILE), EXP_MAX = 400000, EXP_BURST = 400, EXP_REFILL = 0.06; // 0,06 tile/ms = 60 tiles novos por segundo, rajada de 400
const expFile = (u, sid) => path.join(EXP_DIR, u + '_' + sid + '.json');
const expKey = (a, b) => (a + 5000) * 10007 + (b + 5000); // mesma chave K() do jogo
const expValid = k => Number.isInteger(k) && k >= 0 && (k % 10007) <= 10000 && Math.floor(k / 10007) <= 10000;
const expCache = new Map(); // "u:sid" -> { s: Set de chaves, b: [x0,y0,x1,y1] em ladrilhos, dirty }
function expBounds(set) {
  let b = null;
  for (const k of set) { const x = Math.floor(k / 10007) - 5000, y = (k % 10007) - 5000; if (!b) b = [x, y, x, y]; else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } }
  return b;
}
function expGet(u, sid) {
  const ck = u + ':' + sid; let e = expCache.get(ck); if (e) return e;
  let arr = null, fromSave = false;
  try { arr = JSON.parse(fs.readFileSync(expFile(u, sid), 'utf8')); } catch (er) { arr = null; }
  if (!Array.isArray(arr)) { const sv = readSave(u, sid); arr = (sv && Array.isArray(sv.ex)) ? sv.ex : []; fromSave = arr.length > 0; } // sem registro do servidor: parte do que já estava salvo
  const s = new Set(); for (const k of arr) { if (s.size >= EXP_MAX) break; if (expValid(k)) s.add(k); }
  e = { s, b: expBounds(s), dirty: fromSave ? 1 : 0 }; expCache.set(ck, e); return e;
}
function expSee(me) { // chamado a cada posição recebida: revela os ladrilhos em volta (com limite de velocidade contra teleporte/spam)
  const e = me.ex; if (!e) return;
  const tx = Math.round(me.x / EXP_TILE), ty = Math.round(me.y / EXP_TILE);
  if (tx === me.etx && ty === me.ety) return;
  if (Math.abs(tx) > 4900 || Math.abs(ty) > 4900) return;
  const now = Date.now(); me.eb = Math.min(EXP_BURST, me.eb + (now - me.et) * EXP_REFILL); me.et = now;
  let skipped = 0, added = 0;
  for (let dy = -EXP_R; dy <= EXP_R; dy++) for (let dx = -EXP_R; dx <= EXP_R; dx++) {
    if (dx * dx + dy * dy > EXP_R * EXP_R) continue;
    const k = expKey(tx + dx, ty + dy); if (e.s.has(k)) continue;
    if (e.s.size >= EXP_MAX) continue;
    if (me.eb < 1) { skipped++; continue; }
    me.eb--; e.s.add(k); added++;
  }
  if (added) { e.dirty = 1; const lo = [tx - EXP_R, ty - EXP_R, tx + EXP_R, ty + EXP_R]; e.b = e.b ? [Math.min(e.b[0], lo[0]), Math.min(e.b[1], lo[1]), Math.max(e.b[2], lo[2]), Math.max(e.b[3], lo[3])] : lo; }
  if (!skipped) { me.etx = tx; me.ety = ty; }
}
function expFlushAll(clear) { // grava os mapas alterados e esquece os de quem saiu
  for (const [ck, e] of [...expCache]) {
    if (e.dirty) { const i = ck.lastIndexOf(':'); try { writeAtomic(expFile(ck.slice(0, i), ck.slice(i + 1)), JSON.stringify([...e.s])); e.dirty = 0; } catch (er) { } }
    if (clear) { expCache.delete(ck); continue; }
    const i = ck.lastIndexOf(':'), u = ck.slice(0, i), sid = +ck.slice(i + 1), room = rooms.get(sid);
    if (!room || ![...room.values()].some(p => p.u === u)) expCache.delete(ck);
  }
}
setInterval(() => expFlushAll(false), 15000);

// ===== OURO CONFERIDO PELO SERVIDOR (livro-caixa por jogador) =====
// O servidor guarda o saldo de cada jogador (parte do ouro do último save) e o jogo manda o saldo a cada mudança ("gd").
//  - Gastar (compras, aposta, banco) sempre é aceito: o saldo do servidor só desce.
//  - Ganhar é aceito até um limite: o que o jogador já tinha gasto pode voltar (banco, aposta) e o resto sai de uma "bolsa" que enche GOLD_RATE por segundo (máximo GOLD_BURST).
//  - O excesso é cortado: o servidor responde com o saldo certo ("fix") e o jogo corrige na hora. O save na nuvem nunca guarda mais ouro que o saldo do servidor.
//  - O jogo só deixa comprar se o saldo CONFIRMADO pelo servidor cobre o preço (ver gLow no index.html).
//   GOLD_RATE=1500 (por segundo) e GOLD_BURST=200000 mudam o limite de ganho.
const GOLD_RATE = +process.env.GOLD_RATE || 1500, GOLD_BURST = +process.env.GOLD_BURST || 200000, GOLD_CRMAX = 100000;
function goldInit(me) { const sv = readSave(me.u, me.sid); me.gold = (sv && Number.isFinite(sv.gold)) ? Math.max(0, Math.floor(sv.gold)) : 0; me.gt = Date.now(); me.gtok = GOLD_BURST; me.gcr = 0; me.gset = 0; }
function goldReport(me, g) { // devolve { g: saldo do servidor, fix: 1 se o jogo precisa corrigir }
  const now = Date.now(); me.gtok = Math.min(GOLD_BURST, me.gtok + (now - me.gt) * GOLD_RATE / 1000); me.gt = now; me.gset = 1;
  const G = Math.floor(g); let fix = 0;
  if (G <= me.gold) { me.gcr = Math.min(GOLD_CRMAX, me.gcr + (me.gold - G)); me.gold = G; }
  else {
    const d = G - me.gold, c = Math.min(d, me.gcr), r = d - c, ok = Math.min(r, Math.floor(me.gtok));
    me.gcr -= c; me.gtok -= ok; me.gold += c + ok; if (ok < r) fix = 1;
  }
  return { g: me.gold, fix };
}

// ===== MERCADO: lojas e encomendas dos jogadores (a horta vira dinheiro) =====
// Loja: o jogador põe produtos à venda (K m a), outros compram (K m b): o servidor confere e desconta o ouro de quem compra e guarda o caixa do vendedor (taxa de 5%).
// Encomenda: um jogador pede um produto e paga adiantado (K o c, o ouro fica guardado); outro jogador entrega (K o f) e recebe o pagamento (taxa de 5%). Tudo por servidor (sid).
// O saldo é o mesmo livro-caixa de ouro (me.gold); o jogo aplica o mesmo valor do lado dele. market.json guarda lojas, encomendas, caixas e entregas pendentes.
const MK_FILE = path.join(DATA, 'market.json'); let MK = {}; try { MK = JSON.parse(fs.readFileSync(MK_FILE, 'utf8')) || {}; } catch (e) { MK = {}; }
let mkDirty = false; const mkFlush = () => { if (!mkDirty) return; mkDirty = false; try { writeAtomic(MK_FILE, JSON.stringify(MK)); } catch (e) { } };
setInterval(mkFlush, 5000);
const MK_GOODS = new Set(['r_wood', 'r_fiber', 'r_coco', 'r_olive', 'r_cloud', 'r_coral', 'r_ice', 'ovo', 'mel']);
const mkOf = sid => MK[sid] || (MK[sid] = { shops: {}, orders: [], inbox: {}, earn: {}, nid: 1 });
function mkState(me) {
  const M = mkOf(me.sid), shops = [];
  for (const u in M.shops) { const l = M.shops[u]; if (l.length && shops.length < 40) shops.push({ u, l: l.map(x => [x.k, x.q, x.p]) }); }
  return { t: 'Kmq', shops, orders: M.orders.slice(0, 100).map(o => [o.id, o.u, o.k, o.q, o.p]), mine: { earn: M.earn[me.u] | 0, inbox: (M.inbox[me.u] || []).map(x => [x.k, x.q]) } };
}
function mkHandle(me, ws, m) {
  const now = Date.now(); if (now - (me.mkT || 0) < 120) return; me.mkT = now;
  const M = mkOf(me.sid), rep = o => ws.send(JSON.stringify(Object.assign({ t: 'Kmr', op: m.t }, o))), num = (v, a, b) => { v = Math.floor(+v); return Number.isFinite(v) && v >= a && v <= b ? v : null; };
  const done = () => { mkDirty = true; ws.send(JSON.stringify(mkState(me))); }, take = c => { me.gold -= c; me.gcr = Math.min(GOLD_CRMAX, me.gcr + c); };
  if (m.t === 'Kmq') { ws.send(JSON.stringify(mkState(me))); return; }
  if (m.t === 'Kma') { const k = String(m.k), q = num(m.q, 1, 999), p = num(m.p, 1, 9999); if (!MK_GOODS.has(k) || q === null || p === null) return rep({ ok: 0, why: 'bad' });
    const l = M.shops[me.u] || (M.shops[me.u] = []), e = l.find(x => x.k === k && x.p === p); if (e) { if (e.q + q > 9999) return rep({ ok: 0, why: 'bad' }); e.q += q; } else { if (l.length >= 10) return rep({ ok: 0, why: 'full' }); l.push({ k, q, p }); }
    rep({ ok: 1, k, q }); return done(); }
  if (m.t === 'Kmr') { const l = M.shops[me.u] || [], i = num(m.i, 0, l.length - 1); if (i === null) return rep({ ok: 0, why: 'bad' }); const x = l.splice(i, 1)[0]; rep({ ok: 1, k: x.k, q: x.q }); return done(); }
  if (m.t === 'Kmb') { const u = String(m.u), l = M.shops[u] || [], i = num(m.i, 0, l.length - 1), x = i === null ? null : l[i], q = num(m.q, 1, 9999); if (!x || q === null || u === me.u) return rep({ ok: 0, why: 'bad' });
    if (q > x.q) return rep({ ok: 0, why: 'stock' }); const cost = x.p * q; if ((me.gold | 0) < cost) return rep({ ok: 0, why: 'gold' });
    take(cost); const k = x.k; x.q -= q; if (x.q <= 0) l.splice(i, 1); M.earn[u] = (M.earn[u] | 0) + Math.floor(cost * .95); rep({ ok: 1, k, q, cost, g: me.gold }); return done(); }
  if (m.t === 'Koc') { const k = String(m.k), q = num(m.q, 1, 999), p = num(m.p, 1, 9999); if (!MK_GOODS.has(k) || q === null || p === null) return rep({ ok: 0, why: 'bad' });
    if (M.orders.filter(o => o.u === me.u).length >= 6 || M.orders.length >= 200) return rep({ ok: 0, why: 'full' }); const cost = q * p; if ((me.gold | 0) < cost) return rep({ ok: 0, why: 'gold' });
    take(cost); M.orders.push({ id: M.nid++, u: me.u, k, q, p }); rep({ ok: 1, cost, g: me.gold }); return done(); }
  if (m.t === 'Kof') { const id = num(m.id, 1, 1e9), o = M.orders.find(x => x.id === id), q = num(m.q, 1, 9999); if (!o || q === null || o.u === me.u) return rep({ ok: 0, why: 'bad' }); if (q > o.q) return rep({ ok: 0, why: 'stock' });
    const pay = Math.floor(q * o.p * .95), k = o.k; me.gold += pay; (M.inbox[o.u] || (M.inbox[o.u] = [])).push({ k, q }); o.q -= q; if (o.q <= 0) M.orders.splice(M.orders.indexOf(o), 1); rep({ ok: 1, k, q, pay, g: me.gold }); return done(); }
  if (m.t === 'Kox') { const id = num(m.id, 1, 1e9), o = M.orders.find(x => x.id === id && x.u === me.u); if (!o) return rep({ ok: 0, why: 'bad' }); const refund = o.q * o.p; me.gold += refund; M.orders.splice(M.orders.indexOf(o), 1); rep({ ok: 1, refund, g: me.gold }); return done(); }
  if (m.t === 'Kmc') { const e = M.earn[me.u] | 0, inbox = M.inbox[me.u] || []; if (!e && !inbox.length) return rep({ ok: 0, why: 'empty' }); me.gold += e; M.earn[me.u] = 0; M.inbox[me.u] = []; rep({ ok: 1, gold: e, items: inbox.map(x => [x.k, x.q]), g: me.gold }); return done(); }
}
function savePub(u, sid) { // save que vai para o jogador: o mapa explorado é o do servidor
  const sv = readSave(u, sid); if (!sv) return null;
  const e = expGet(u, sid); sv.ex = [...e.s]; if (e.b) sv.bnd = e.b; return sv;
}

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
    if (req.method === 'GET' && url.pathname === '/admin.js') {
      const f = path.join(__dirname, 'admin.js');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
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
      return json(res, 200, { seed: s.seed, name: s.name, save: savePub(u, s.id) });
    }
    // ===== NUVEM DA CONTA: saves e progresso de quem joga sozinho ficam na conta, não no aparelho =====
    // GET  /api/cloud  → { k: { chave: texto }, t }   ·   POST /api/cloud { set: { chave: texto }, del: [chaves], tok? } (tok no corpo serve para o sendBeacon ao fechar a página)
    if (url.pathname === '/api/cloud' && (req.method === 'GET' || req.method === 'POST')) {
      if (maintNow()) return json(res, 503, maintErr());
      let u = authUser(req), b = null;
      if (req.method === 'POST') {
        b = await body(req, CLOUD_MAX_TOTAL + 1024 * 1024);
        if (!u && typeof b.tok === 'string' && /^\w{20,}$/.test(b.tok)) { const t = tokens.get(th(b.tok)); if (t && t.exp > Date.now()) u = t.u; }
      }
      if (!u) return json(res, 401, { err: 'Sessão expirada. Entre de novo.' });
      const c = cloudRead(u);
      if (req.method === 'GET') return json(res, 200, c);
      let bad = 0;
      for (const [k, v] of Object.entries(b.set && typeof b.set === 'object' ? b.set : {})) {
        if (!CLOUD_KEY_RE.test(k) || typeof v !== 'string' || v.length > CLOUD_MAX_KEY) { bad++; continue; }
        c.k[k] = v;
      }
      for (const k of Array.isArray(b.del) ? b.del : []) if (typeof k === 'string') delete c.k[k];
      let tot = 0; for (const v of Object.values(c.k)) tot += v.length;
      if (tot > CLOUD_MAX_TOTAL) return json(res, 413, { err: 'Conta cheia (limite de dados na nuvem)' });
      c.t = Date.now(); writeAtomic(cloudFile(u), JSON.stringify(c));
      return json(res, 200, { ok: 1, t: c.t, bad });
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
      me = { id: nextId++, u: t.u, sid: s.id, ws, x: 0, y: 0, h: 0, l: 0, r: 'h', has: false, lastPos: 0, lastSave: 0, bk: new Set() };
      room.set(me.id, me);
      me.ex = expGet(me.u, me.sid); me.eb = EXP_BURST; me.et = Date.now(); goldInit(me);
      ws.send(JSON.stringify({ t: 'joined', id: me.id, max: s.max, on: room.size }));
      return;
    }
    if (m.t === 'pos') {
      const now = Date.now(); if (now - me.lastPos < 40) return; me.lastPos = now;
      const x = num(m.x), y = num(m.y), h = num(m.h);
      if (x === null || y === null || h === null) return;
      me.x = x; me.y = y; me.h = h; me.l = m.l ? 1 : 0; if (typeof m.r === 'string' && 'rbch'.includes(m.r) && m.r.length === 1) me.r = m.r; me.has = true; me.p = m.p ? 1 : 0; expSee(me);
      // extras (só repassados): direção da mira, posição no convés, arma, estado e visual
      const a = num(m.a); if (a !== null && Math.abs(a) < 20) me.a = Math.round(a * 100) / 100;
      const px = num(m.px), py = num(m.py); if (px !== null && py !== null && Math.abs(px) < 5000 && Math.abs(py) < 5000) { me.px = Math.round(px); me.py = Math.round(py); }
      const w = num(m.w); if (w !== null && w >= 0 && w < 400) me.w = w | 0;
      const fl = num(m.f); if (fl !== null) me.fl = fl & 255;
      if (typeof m.k === 'string' && m.k.length <= 100 && LOOK_RE.test(m.k)) me.lk = m.k;
      const sl = num(m.sl); if (sl !== null && sl >= 0 && sl <= 7) me.sl = sl | 0;
    } else if (m.t === 'gd') { // saldo de ouro informado pelo jogo: o servidor confere e responde com o saldo dele
      const now = Date.now(); if (now - (me.gdT || 0) < 100) return; me.gdT = now;
      const g = num(m.g); if (g === null || g < 0 || g > 1e12) return;
      const r = goldReport(me, g); ws.send(JSON.stringify({ t: 'gold', g: r.g, fix: r.fix }));
    } else if (m.t === 'hit') { // PvP: o servidor valida (ambos com PvP ligado, alcance, dano máximo, limite de golpes) e repassa ao alvo
      const now = Date.now(); if (now - (me.hw || 0) > 1000) { me.hw = now; me.hn = 0; } if (++me.hn > 40) return;
      const v = rooms.get(me.sid).get(m.to | 0), d = num(m.d);
      if (!v || v === me || !me.p || !v.p || !me.has || !v.has || d === null || d <= 0 || d > 400) return;
      if (Math.hypot(v.x - me.x, v.y - me.y) > 3500) return;
      v.by = me.id; v.byT = now; v.ws.send(JSON.stringify({ t: 'hurt', d: Math.round(d), f: me.u }));
    } else if (m.t === 'mn') { // monstros comuns da ilha deste jogador (tipo, posição, vida real, nível/dano reais): o servidor confere o formato e mostra a quem está por perto
      const now = Date.now(); if (now - (me.mnT || 0) < 90) return; me.mnT = now;
      const out = [];
      if (Array.isArray(m.d)) for (const e of m.d.slice(0, 8)) {
        if (!Array.isArray(e) || e.length < 11) continue;
        const ty = e[0], x = num(e[1]), y = num(e[2]), hp = num(e[3]), fx = num(e[4]), lv = num(e[5]), mid = num(e[7]), mhp = num(e[8]), dm = num(e[9]);
        if (typeof ty !== 'string' || !/^[A-Za-z0-9_]{2,24}$/.test(ty) || x === null || y === null || hp === null || fx === null || lv === null || mid === null || mhp === null || dm === null) continue;
        if (mid < 1 || mid > 1e9 || mhp < 1 || mhp > 1e8 || dm < 0 || dm > 1e6 || hp < 0) continue;
        out.push([ty, Math.round(x), Math.round(y), Math.min(Math.round(mhp), Math.round(hp)), fx < 0 ? -1 : 1, Math.max(1, Math.min(999, lv | 0)), e[6] ? 1 : 0, mid | 0, Math.round(mhp), Math.round(dm * 10) / 10, e[10] ? 1 : 0]);
      }
      me.mn = out; me.mnAt = now;
    } else if (m.t === 'mh') { // golpe num monstro comum de outro jogador: o servidor confere (os dois em terra, alcance, dano máximo, limite de golpes) e repassa ao dono, que aplica na vida real
      const now = Date.now(); if (now - (me.mhw || 0) > 1000) { me.mhw = now; me.mhn = 0; } if (++me.mhn > 40) return;
      const o = rooms.get(me.sid).get(m.to | 0), d = num(m.d), k = num(m.k);
      if (!o || o === me || !o.has || !me.has || !me.l || !o.l || !o.mn || now - (o.mnAt || 0) > 1500 || d === null || d <= 0 || k === null) return;
      const e = o.mn.find(q => q[7] === k); if (!e || Math.hypot(e[1] - me.x, e[2] - me.y) > 1300) return;
      o.ws.send(JSON.stringify({ t: 'mh', k, d: Math.min(Math.round(d), e[8]), f: me.id }));
    } else if (m.t === 'ev') { // efeitos visuais de golpes/habilidades: o servidor só confere o formato e repassa a quem está por perto
      const now = Date.now(); if (now - (me.ew || 0) > 1000) { me.ew = now; me.en = 0; } if (++me.en > 24 || !me.has) return;
      const ok = v => typeof v === 'number' ? (isFinite(v) && Math.abs(v) < 1e9) : v === null || (typeof v === 'string' && v.length <= 24);
      const cl = (arr, mx, wd) => Array.isArray(arr) ? arr.slice(0, mx).filter(e => Array.isArray(e) && e.length <= wd && e.every(ok)) : [];
      const d = cl(m.d, 40, 12), q = cl(m.q, 14, 12), a = num(m.a), w = num(m.w), sw = num(m.sw), sp = num(m.sp);
      const out = JSON.stringify({ t: 'ev', id: me.id, a: a === null ? 0 : a, w: w === null ? 0 : w | 0, sw: sw === null ? 0 : sw, sp: sp === null ? 0 : sp, na: m.na ? 1 : 0, d, q });
      for (const q2 of rooms.get(me.sid).values()) { if (q2 === me || !q2.has) continue; const dx = q2.x - me.x, dy = q2.y - me.y; if (dx * dx + dy * dy <= VIEW_RANGE * VIEW_RANGE) q2.ws.send(out); }
    } else if (m.t === 'bj') { // entrar na luta de um chefe de ilha (o servidor decide se ele existe, de quem é a simulação e se já morreu)
        const k = String(m.k || ''), now = Date.now(); if (!BOSS_RE.test(k) || now - (me.bjT || 0) < 250 || me.bk.size > 6) return; me.bjT = now;
        const room = rooms.get(me.sid), bm = bosses.get(me.sid); let b = bm.get(k);
        if (b && b.deadAt) {
          if (bossRespawn(k) > 0 && now - b.deadAt >= bossRespawn(k)) { bm.delete(k); b = null; }
          else { ws.send(JSON.stringify({ t: 'bst', k, dead: bossRespawn(k) > 0 ? Math.max(1000, bossRespawn(k) - (now - b.deadAt)) : -1 })); return; }
        }
        const mh = bnum(m.hp), ml = bnum(m.lv); if (mh === null || mh < 10 || mh > 5e6 || ml === null || ml < 1 || ml > 300) return; // parte deste jogador: vida e nível que o chefe teria para ele sozinho
        if (!b) { if (bm.size >= 600) return; b = { k, hp: mh, max: mh, lv: Math.round(ml), owner: 0, eng: new Set(), parts: new Map(), dmg: new Map(), deadAt: 0, st: null, lastBs: now, idle: 0, dirty: 0 }; bm.set(k, b); }
        for (const id of [...b.eng]) if (!room.has(id)) { b.eng.delete(id); b.parts.delete(id); }
        b.eng.add(me.id); me.bk.add(k); b.idle = 0;
        b.parts.set(me.id, { h: mh, lv: Math.round(ml) }); bossRecalc(b);
        if (!b.owner || !b.eng.has(b.owner)) { b.owner = me.id; b.lastBs = now; }
        ws.send(JSON.stringify({ t: 'bst', k, hp: Math.round(b.hp), max: b.max, lv: b.lv, n: b.parts.size, own: b.owner === me.id ? 1 : 0, s: b.owner === me.id ? b.st : null }));
      } else if (m.t === 'bl') { bossLeave(me, String(m.k || ''));
      } else if (m.t === 'bs') { // estado do chefe vindo do dono: o servidor guarda e repassa aos outros engajados
        const b = bosses.get(me.sid).get(String(m.k || '')); if (!b || b.deadAt || b.owner !== me.id) return;
        const now = Date.now(); if (now - (b.rel || 0) < 40) return; b.rel = now;
        const st = m.s; if (!Array.isArray(st) || st.length < 17 || st.length > 24 || !st.every(v => (typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e8) || (typeof v === 'string' && v.length <= 12))) return;
        b.st = st; b.lastBs = now;
        const out = JSON.stringify({ t: 'bs', k: b.k, s: st }), room = rooms.get(me.sid);
        for (const id of b.eng) { if (id === me.id) continue; const q = room.get(id); if (q) q.ws.send(out); }
      } else if (m.t === 'bd') { // dano que o jogador causou no chefe (limitado): tira da vida compartilhada
        const b = bosses.get(me.sid).get(String(m.k || '')); if (!b || b.deadAt || !b.eng.has(me.id)) return;
        const now = Date.now(); if (now - (me.bdw || 0) > 1000) { me.bdw = now; me.bdn = 0; } if (++me.bdn > 20) return;
        const d = bnum(m.d); if (d === null || d <= 0) return;
        const dd = Math.min(d, b.max * 0.35); b.hp -= dd; b.dmg.set(me.u, (b.dmg.get(me.u) || 0) + dd); b.dirty = 1;
        if (b.hp <= 0) bossDie(me.sid, b, me.u);
      } else if (m.t === 'sfg') { // alguém entregou o Fragmento Carregado ao samurai
        const s = sfOf(me.sid); if (!s.st) { s.st = 1; sfSave(); }
        ws.send(JSON.stringify({ t: 'sfr', c: s.c, k: '', n: 0, tr: sfTr(s) }));
      } else if (m.t === 'sfq') { // aparição do samurai errante: o servidor diz qual fala (1-12) vale para essa aparição; k vazio = só pedir o estado
        const s = sfOf(me.sid), k = String(m.k || ''), now = Date.now(); if (now - (me.sfT || 0) < 300) return; me.sfT = now;
        if (!k) { ws.send(JSON.stringify({ t: 'sfr', c: s.c, k: '', n: 0, tr: sfTr(s) })); return; }
        if (!SF_KEY.test(k)) return;
        let n = 0, ch = 0;
        if (s.st) {
          if (s.k[k] !== undefined) n = s.k[k];
          else {
            if (s.c < 11) { s.c++; n = s.c; ch = 1; }
            else if (s.c === 11 && m.sak) { s.c = 12; n = 12; ch = 1; s.t = Date.now() + SF_WIN; } // a 12ª aparição só vale na ilha de sakura
            s.k[k] = n; const ks = Object.keys(s.k); if (ks.length > 400) for (const q of ks.slice(0, ks.length - 300)) delete s.k[q];
            sfSave();
          }
        }
        ws.send(JSON.stringify({ t: 'sfr', c: s.c, k, n, tr: sfTr(s) }));
        if (ch) { const o = JSON.stringify({ t: 'sfr', c: s.c, k: '', n: 0, ann: s.c === 12 ? 1 : 0, tr: sfTr(s) }); for (const q of rooms.get(me.sid).values()) if (q !== me || s.c === 12) q.ws.send(o); } // 12ª aparição: aviso rosa para o servidor inteiro
      } else if (m.t === 'sfw') { // Shirogane Ryu derrotado: tudo recomeça (o samurai volta a vagar até alguém entregar outro fragmento)
        const s = sfOf(me.sid); if (s.c === 12) { s.c = 0; s.st = 0; s.t = 0; s.k = {}; sfSave(); const o = JSON.stringify({ t: 'sfr', c: 0, k: '', n: 0, tr: 0, rs: 2, w: me.u }); for (const q of rooms.get(me.sid).values()) q.ws.send(o); }
      } else if (m.t === 'died') {
      const now = Date.now(), room = rooms.get(me.sid), k = room.get(me.by);
      if (!k || !me.byT || now - me.byT > 10000 || now - (me.dd || 0) < 5000) return; me.dd = now; me.byT = 0;
      k.ws.send(JSON.stringify({ t: 'won', v: me.u, g: 150 }));
      const f = JSON.stringify({ t: 'feed', a: k.u, b: me.u }); for (const q of room.values()) q.ws.send(f);
    } else if (m.t === 'Kp') { // construção: colocar (k = tipo) ou recolher (k vazio) uma peça
      const now = Date.now(); if (now - (me.kW || 0) > 1000) { me.kW = now; me.kN = 0; } if (++me.kN > 120) return;
      const i = m.i, j = m.j, z = m.z | 0, k = (m.k === '' || m.k == null) ? '' : String(m.k), why = bldPlace(me, i, j, k, z);
      if (why) { ws.send(JSON.stringify({ t: 'Kx', i, j, z, k, why })); return; }
      bldSave(); const o = JSON.stringify({ t: 'Kc', i, j, z, k, u: me.u }); for (const q of rooms.get(me.sid).values()) q.ws.send(o);
    } else if (m.t === 'Km') { // construção: o jogador manda de uma vez as peças que já tinha no save local (no máximo a cada 8 s)
      const now = Date.now(); if (now - (me.kM || 0) < 8000) return; me.kM = now;
      const L = Array.isArray(m.l) ? m.l.slice(0, 1000) : [], ok = [];
      for (const a of L) { if (!Array.isArray(a)) continue; const k = String(a[2] || ''); if (!k) continue; if (!bldPlace(me, a[0], a[1], k, a[3])) ok.push([a[0], a[1], k, me.u, a[3] | 0]); }
      if (ok.length) { bldSave(); const o = JSON.stringify({ t: 'Kb', l: ok }); for (const q of rooms.get(me.sid).values()) q.ws.send(o); }
    } else if (/^K(m[qabrc]|o[cfx])$/.test(m.t)) { mkHandle(me, ws, m); // mercado: lojas e encomendas dos jogadores
    } else if (m.t === 'Kq') { // construção: peças dos chunks em volta (3x3) do chunk onde o jogador está
      const now = Date.now(); if (now - (me.kQ || 0) < 500) return; me.kQ = now;
      const ci = m.ci | 0, cj = m.cj | 0, B = bldOf(me.sid), l = [];
      for (const key of Object.keys(B.p)) { if (l.length >= 12000) break; const a = key.split(','), c = bldCk(+a[0], +a[1]).split(','), v = B.p[key]; if (Math.abs(c[0] - ci) <= 1 && Math.abs(c[1] - cj) <= 1) l.push([+a[0], +a[1], v[0], v[1], +(a[2] || 0)]); }
      ws.send(JSON.stringify({ t: 'Ks', a: [ci - 1, cj - 1, ci + 1, cj + 1], l }));
    } else if (m.t === 'Kr') { // todas as terras com dono neste servidor (e os amigos de cada uma)
      const now = Date.now(); if (now - (me.kR || 0) < 2000) return; me.kR = now;
      const B = bldOf(me.sid), c = []; for (const ck of Object.keys(B.c)) { const a = ck.split(','); c.push([+a[0], +a[1], B.c[ck], B.f[ck] || []]); }
      ws.send(JSON.stringify({ t: 'Ka', c: c.slice(0, 8000) }));
    } else if (m.t === 'Kl') { // comprar um chunk: só um jogador por chunk
      const now = Date.now(); if (now - (me.kL || 0) < 300) return; me.kL = now;
      const ci = m.ci, cj = m.cj, why = bldClaim(me, ci, cj), B = bldOf(me.sid), ck = ci + ',' + cj;
      if (why) { ws.send(JSON.stringify({ t: 'Kk', ci, cj, ok: 0, u: why.startsWith('land:') ? why.slice(5) : '', why })); return; }
      bldSave(); ws.send(JSON.stringify({ t: 'Kk', ci, cj, ok: 1, u: me.u }));
      const o = JSON.stringify({ t: 'Ko', ci, cj, u: me.u, f: B.f[ck] || [] }); for (const q of rooms.get(me.sid).values()) q.ws.send(o);
    } else if (m.t === 'Kn') { // chunks que o jogador já tinha comprado antes do servidor guardar a posse (valem para quem chegou primeiro; no máximo a cada 8 s)
      const now = Date.now(); if (now - (me.kO || 0) < 8000) return; me.kO = now;
      const B = bldOf(me.sid), L = Array.isArray(m.l) ? m.l.slice(0, 300) : [], out = [];
      for (const a of L) { if (!Array.isArray(a)) continue; const ci = a[0], cj = a[1]; if (!bldClaim(me, ci, cj)) out.push(JSON.stringify({ t: 'Ko', ci, cj, u: me.u, f: B.f[ci + ',' + cj] || [] })); }
      if (out.length) { bldSave(); for (const q of rooms.get(me.sid).values()) for (const o of out) q.ws.send(o); }
    } else if (m.t === 'Kf') { // dono dá (on) ou tira permissão de construir para um amigo
      const now = Date.now(); if (now - (me.kF || 0) < 300) return; me.kF = now;
      const ci = m.ci, cj = m.cj, u = String(m.u || '').toLowerCase(), B = bldOf(me.sid), ck = ci + ',' + cj;
      const no = why => ws.send(JSON.stringify({ t: 'Kk', ci, cj, ok: 0, why, f: 1 }));
      if (!bldChunk(ci, cj) || B.c[ck] !== me.u) return no('owner');
      if (!BLD_NAME.test(u) || u === me.u) return no('name');
      const f = B.f[ck] || []; if (m.on) { if (!f.includes(u)) { if (f.length >= BLD_FR) return no('frmax'); f.push(u); } B.f[ck] = f; } else { B.f[ck] = f.filter(x => x !== u); if (!B.f[ck].length) delete B.f[ck]; }
      bldSave(); const o = JSON.stringify({ t: 'Ko', ci, cj, u: me.u, f: B.f[ck] || [] }); for (const q of rooms.get(me.sid).values()) q.ws.send(o);
    } else if (m.t === 'save') {
      const now = Date.now(); if (now - me.lastSave < 4000) return; me.lastSave = now;
      const d = m.d; if (!d || typeof d !== 'object' || d.v !== 1) return;
      if (me.gset && typeof d.gold === 'number' && isFinite(d.gold)) d.gold = Math.min(Math.max(0, Math.floor(d.gold)), me.gold); // ouro salvo nunca passa do saldo do servidor
      { const e = me.ex || expGet(me.u, me.sid); d.ex = [...e.s]; if (e.b) d.bnd = e.b; } // mapa explorado: só o que o servidor conferiu
      const txt = JSON.stringify(d); if (txt.length > MAX_SAVE) return;
      writeAtomic(saveFile(me.u, me.sid), txt);
      sumCache.set(me.u + ':' + me.sid, { race: d.race, lv: d.lv, gold: d.gold });
      ws.send('{"t":"saved"}');
    }
  }, () => { if (me) { for (const k of [...me.bk]) bossLeave(me, k); const room = rooms.get(me.sid); if (room.get(me.id) === me) room.delete(me.id); } });
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
        if (dx * dx + dy * dy <= VIEW_RANGE * VIEW_RANGE) p.push([b.id, b.u, Math.round(b.x), Math.round(b.y), Math.round(b.h * 100) / 100, b.l, b.r, b.p ? 1 : 0, b.a || 0, b.px || 0, b.py || 0, b.w || 0, b.fl || 0, b.lk || '', null, b.sl | 0]);
      }
      const mn = [], nowMn = Date.now(); // monstros das ilhas dos outros jogadores (só quem está em terra e por perto)
      if (a.l) for (const b of all) {
        if (b === a || !b.has || !b.l || !b.mn || !b.mn.length || nowMn - (b.mnAt || 0) > 1500) continue;
        for (const e of b.mn) { const dx = e[1] - a.x, dy = e[2] - a.y; if (dx * dx + dy * dy <= 2000 * 2000 && mn.length < 48) mn.push([b.id, ...e]); }
      }
      a.ws.send(JSON.stringify({ t: 'ps', p, mn, on: room.size, max: s.max }));
    }
  }
}, TICK_MS);

  // chefes compartilhados: manda a vida a quem está na luta, troca o dono que parou de responder e esquece chefes sem ninguém por perto (voltam com a vida cheia)
  setInterval(() => {
    const now = Date.now();
    for (const [sid, bm] of bosses) {
      const room = rooms.get(sid);
      for (const [k, b] of bm) {
        if (b.deadAt) { if (bossRespawn(k) > 0 && now - b.deadAt >= bossRespawn(k) + 60e3) bm.delete(k); continue; }
        { let ch = 0; for (const id of [...b.eng]) if (!room.has(id)) { b.eng.delete(id); if (b.parts.delete(id)) ch = 1; if (b.owner === id) b.owner = 0; } if (ch) bossRecalc(b); }
        if (!b.eng.size) { if (!b.idle) b.idle = now; if (now - b.idle > BOSS_IDLE_MS) bm.delete(k); continue; }
        b.idle = 0;
        if (b.owner && now - b.lastBs > BOSS_STALE_MS && b.eng.size > 1) { const old = b.owner; b.owner = 0; if (!bossOwnerPick(sid, b, old)) b.owner = old; }
        if (!b.owner) bossOwnerPick(sid, b, 0);
        if (b.dirty) { b.dirty = 0; const out = JSON.stringify({ t: 'bh', k, hp: Math.round(b.hp), max: b.max, lv: b.lv, n: b.parts.size }); for (const id of b.eng) { const q = room.get(id); if (q) q.ws.send(out); } }
      }
    }
  }, 250);

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
    saveUsers(); tokDirty = true; flushTokens(); expFlushAll(true); mkFlush(); bkRun().catch(() => { });
    sumCache.clear(); reservations.clear(); // recarrega tudo do disco
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || {}; } catch (e) { }
  } else if (!down && wasDown) { wasDown = false; warned = {}; console.log('Manutenção terminou: servidor de volta'); }
}, 1000);


// ===== BACKUP: envia para o GitHub o que mudou (cada arquivo compactado em data/<caminho>.gz) =====
const BK_REMOTE = new Map(), BK_SEEN = new Map(); let bkBusy = false, bkReady = false;
function bkWalk(dir, rel, out) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) bkWalk(path.join(dir, e.name), r, out); else if (e.isFile() && !e.name.endsWith('.tmp')) out.push(r); } return out; }
const bkGitSha = buf => crypto.createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex');
async function bkInit() {
  const r = await fetch(BK.api + '/repos/' + BK.repo + '/git/trees/' + encodeURIComponent(BK.branch) + '?recursive=1', { headers: bkHeaders });
  if (r.ok) { const j = await r.json(); for (const f of j.tree || []) if (f.type === 'blob' && f.path.startsWith('data/') && f.path.endsWith('.gz')) BK_REMOTE.set(f.path.slice(5, -3), f.sha); }
  else if (r.status !== 404 && r.status !== 409) throw new Error('GitHub respondeu ' + r.status);
  bkReady = true;
}
async function bkPut(rel, gz) {
  const url = BK.api + '/repos/' + BK.repo + '/contents/data/' + rel.split('/').map(encodeURIComponent).join('/') + '.gz';
  const body = { message: 'backup ' + rel, content: gz.toString('base64'), branch: BK.branch };
  if (BK_REMOTE.has(rel)) body.sha = BK_REMOTE.get(rel);
  for (let k = 0; k < 2; k++) {
    const r = await fetch(url, { method: 'PUT', headers: bkHeaders, body: JSON.stringify(body) });
    if (r.ok) { BK_REMOTE.set(rel, (await r.json()).content.sha); return; }
    if ((r.status === 409 || r.status === 422) && k === 0) { // sha desatualizado: pega o atual e tenta de novo
      const g = await fetch(url + '?ref=' + encodeURIComponent(BK.branch), { headers: bkHeaders });
      if (g.ok) body.sha = (await g.json()).sha; else delete body.sha; continue;
    }
    throw new Error('GitHub respondeu ' + r.status + ' em ' + rel);
  }
}
async function bkRun() {
  if (!BK_ON || bkBusy) return; bkBusy = true;
  try {
    if (!bkReady) await bkInit();
    let n = 0;
    for (const rel of bkWalk(DATA, '', [])) {
      let st; try { st = fs.statSync(path.join(DATA, rel)); } catch (e) { continue; }
      const sig = st.mtimeMs + ':' + st.size; if (BK_SEEN.get(rel) === sig) continue;
      const gz = zlib.gzipSync(fs.readFileSync(path.join(DATA, rel)), { level: 9 });
      if (bkGitSha(gz) !== BK_REMOTE.get(rel)) { await bkPut(rel, gz); n++; }
      BK_SEEN.set(rel, sig);
    }
    if (n) console.log('Backup: ' + n + ' arquivo(s) enviado(s) ao GitHub');
  } finally { bkBusy = false; }
}
async function bkFlush() { if (!BK_ON) return; for (let i = 0; bkBusy && i < 100; i++) await new Promise(r => setTimeout(r, 200)); try { await bkRun(); } catch (e) { console.log('Backup falhou: ' + e.message); } }
if (BK_ON) {
  console.log('Backup no GitHub ligado: ' + BK.repo + ' (a cada ' + BK.min + ' min e ao desligar)');
  const bkTick = () => bkRun().catch(e => console.log('Backup falhou: ' + e.message));
  setTimeout(bkTick, 20000); setInterval(bkTick, BK.min * 60e3);
} else console.log('Backup no GitHub desligado (defina BACKUP_GH_TOKEN e BACKUP_GH_REPO): neste modo os dados só vivem no disco da hospedagem');

// ===== estabilidade: encerra salvando, e só desiste se os erros não pararem =====
function shutdown(sig) { console.log(sig + ': salvando e encerrando'); try { saveUsers(); tokDirty = true; flushTokens(); expFlushAll(true); mkFlush(); } catch (e) { } broadcastAll({ t: 'down', mins: 1 }, true); Promise.race([bkFlush(), new Promise(r => setTimeout(r, 20000))]).then(() => setTimeout(() => process.exit(0), 400)); }
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
