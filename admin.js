/* ===== MENU ADM / TESTE · Relic of the Clouds =====
   Coloque este arquivo ao lado do index.html. Abrir: botão "ADM" (topo da tela), tecla ` ou F2.
   Tudo é descoberto em tempo de execução (armas, acessórios, monstros, chefes, eventos, funções e variáveis do jogo),
   então novas armas/monstros que você adicionar ao jogo aparecem aqui sozinhos. Para desligar: apague o arquivo. */
(function () {
'use strict';
if (window.__ADM) return; window.__ADM = 1;
const E = (0, eval); // eval global: enxerga os let/const dos scripts do jogo
const A = window.__A = { god: 0, nuc: 0, one: 0, ts: 1, spd: 1, fz: -1, pause: 0 };
const get = n => { try { return E(n); } catch (e) { } };
const set = (n, v) => { try { window.__v = v; E(n + '=window.__v'); return 1; } catch (e) { return 0; } };
const call = (n, ...a) => { try { const f = E(n); if (typeof f !== 'function') { toast('Função ' + n + ' não existe nesta versão'); return; } return f(...a); } catch (e) { toast('⚠ ' + n + ': ' + e.message); } };
const num = (n, d = 0) => { const v = get(n); return typeof v === 'number' && isFinite(v) ? v : d; };

/* ---------- ganchos: modo deus, dano 1 golpe, velocidade do jogo ---------- */
for (const c of [
  'const h=hit;hit=function(b,d,s){return h(b,window.__A.one?1e9:d,s)}',
  'const u=hurt;hurt=function(){if(window.__A.god)return;return u.apply(this,arguments)}',
  'const p=update;update=function(dt){return p(dt*window.__A.ts)}']) { try { E('(function(){' + c + '})()'); } catch (e) { } }
setInterval(() => {
  try {
    if (A.god) { const m = num('PHPMAX'); if (num('php') < m) set('php', m); }
    if (A.nuc) set('NUC', num('NUCMAX'));
    if (A.spd !== 1 && get('SPEED') !== undefined) set('SPEED', 260 * num('R_SPD', 1) * A.spd);
    if (A.fz >= 0 && window.DNX) DNX.setHour(A.fz);
  } catch (e) { }
}, 120);

/* ---------- helpers de posição / spawn ---------- */
const land = () => !!get('onLand');
const pos = () => { const o = land() ? get('pw') : get('ship'); return { x: o.x, y: o.y }; };
function spawnMobs(t, n, elite) {
  const p = pos(), M = E('MONS');
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, d = 260 + Math.random() * 220;
    let m = E('newM')(t, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    if (elite && typeof get('mkElite') === 'function') m = E('mkElite')(m) || m;
    M.push(m);
  }
}
function spawnBossAt(key, B2) {
  const p = pos();
  call('spawnBoss', { b: key, x: p.x, y: p.y, seed: 1 }, { x: p.x + 420, y: p.y }, 'adm_' + key + Date.now(), B2);
}
function setLv(n) { set('LV', Math.max(1, n | 0)); set('XP', 0); call('applyLv'); call('updLvUI'); set('php', num('PHPMAX')); }
function addGold(v) { set('GOLD', Math.max(0, num('GOLD') + v)); call('updGold'); }
function giveWeapon(i) { if (i < 3) return; if (i === 3) set('HASLS', true); else { const o = E('OWNR'); while (o.length <= i - 4) o.push(false); o[i - 4] = true; } }
function giveAcc(i, equip) { E('ACCOWN')[i] = true; if (equip) { const a = E('ACCS')[i]; E('ACCEQ')[a.sl] = i; call('armSync'); } }
function allItems(lv) {
  setLv(lv); addGold(1e6);
  const W = get('WEAP') || []; for (let i = 3; i < W.length; i++) giveWeapon(i);
  const C = get('ACCS') || []; for (let i = 0; i < C.length; i++) giveAcc(i, false);
  const M = get('MAT') || {}; for (const k in M) M[k] += 99;
  for (const [k] of potions()) E('POT')[k] = (E('POT')[k] | 0) + 20;
  for (const t of get('TOOLS') || []) E('OWN2')[t[0]] = 1;
  A.god = 1; A.nuc = 1; toast('Kit completo aplicado');
}
function potions() { // ['p_x','🧪','Nome',...] achados no código-fonte
  if (potions.c) return potions.c; const out = [], seen = new Set();
  for (const s of document.scripts) { if (s.src || s.type === 'text/x-server') continue; for (const m of s.textContent.matchAll(/\['(p_[a-z0-9_]+)','([^']{1,8})','([^']{2,40})'/g)) if (!seen.has(m[1])) { seen.add(m[1]); out.push([m[1], m[2] + ' ' + m[3]]); } }
  return potions.c = out;
}
function toLand(x, y) { const pw = get('pw'), c = get('cam'), pl = get('player'); set('onLand', true); pw.x = x; pw.y = y; c.x = x; c.y = y; pl.vx = pl.vy = 0; call('fade'); }
function tpBiome(b) { set('php', num('PHPMAX')); call('tpPick', b); }
function bm(v) { try { return JSON.parse(localStorage.getItem('adm_bm') || '[]'); } catch (e) { return []; } }

/* ---------- interface ---------- */
const BS = 'margin:3px;padding:6px 9px;min-height:32px;border:2px solid #fff;background:#2a2547;color:#fff;font:13px monospace;cursor:pointer;border-radius:4px';
const el = (t, css, txt, p) => { const e = document.createElement(t); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; if (p) p.appendChild(e); return e; };
function toast(m) { let d = document.getElementById('admt'); if (!d) d = el('div', 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:100000;background:#000c;color:#ffe9a0;font:14px monospace;padding:6px 12px;border:2px solid #ffe9a0;border-radius:4px;max-width:90vw;pointer-events:none', '', document.body); d.id = 'admt'; d.textContent = m; d.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => d.style.display = 'none', 2400); }
const H = (p, t) => { const e = el('div', 'width:100%;margin:8px 3px 2px;color:#ffd36e;font:bold 13px monospace;border-bottom:1px solid #ffd36e55', t, p); e.dataset.s = 1; };
function B(p, label, fn, on) { const e = el('button', BS + (on ? ';background:#2e7d32' : ''), label, p); e.dataset.t = label.toLowerCase(); e.onclick = () => { try { fn(e); } catch (x) { toast('⚠ ' + x.message); } }; return e; }
function T(p, label, key) { const e = B(p, label + ': ' + (A[key] ? 'ON' : 'OFF'), () => { A[key] = A[key] ? 0 : 1; e.textContent = label + ': ' + (A[key] ? 'ON' : 'OFF'); e.style.background = A[key] ? '#2e7d32' : '#2a2547'; }, A[key]); return e; }
function IN(p, ph, val, w) { const e = el('input', 'margin:3px;padding:5px;width:' + (w || 70) + 'px;background:#120f22;color:#fff;border:2px solid #888;font:13px monospace', '', p); e.placeholder = ph; e.value = val == null ? '' : val; e.dataset.t = ph.toLowerCase(); return e; }

let panel, body, info, search, cur = 'Jogador', Q = '', cfg = { n: 1, elite: 0 };
const TABS = {
  Jogador(p) {
    H(p, 'Estado'); T(p, '🛡 Modo deus', 'god'); T(p, '🔋 Núcleo infinito', 'nuc'); T(p, '⚔ 1 golpe mata', 'one');
    B(p, '❤ Curar tudo', () => { set('php', num('PHPMAX')); set('NUC', num('NUCMAX')); toast('Curado'); });
    B(p, '🔋 Núcleo cheio', () => set('NUC', num('NUCMAX')));
    H(p, 'Ouro'); for (const v of [100, 1000, 10000, 100000, 1e6, 1e7]) B(p, '+' + v.toLocaleString(), () => addGold(v)); B(p, 'Zerar ouro', () => addGold(-1e12));
    H(p, 'Nível'); for (const v of [1, 5, 10, 25, 50, 100]) B(p, '+' + v + ' nv', () => setLv(num('LV', 1) + v)); for (const v of [1, 10, 30, 60, 100, 200]) B(p, 'Nv = ' + v, () => setLv(v)); B(p, '-1 nv', () => setLv(num('LV', 1) - 1));
    H(p, 'XP'); for (const v of [1, 10, 50, 200]) B(p, '+' + v + ' XP', () => { for (let i = 0; i < v; i++) call('gainXp'); });
    H(p, 'Velocidade do jogador'); for (const v of [1, 1.5, 2, 3, 5]) B(p, v + 'x', () => { A.spd = v; if (v === 1) call('applyLv'); toast('Velocidade ' + v + 'x'); });
    H(p, 'Velocidade do jogo (câmera lenta / pausa)'); for (const v of [0, .1, .25, .5, 1, 2, 3, 5]) B(p, v === 0 ? '⏸ Pausar' : v + 'x', () => { A.ts = v; toast('Jogo a ' + v + 'x'); });
    H(p, 'Pacotes'); B(p, '🎁 KIT COMPLETO (nv 60)', () => allItems(60)); B(p, '🎁 KIT MÁXIMO (nv 200)', () => allItems(200));
  },
  Itens(p) {
    const W = get('WEAP') || [], C = get('ACCS') || [], M = get('MATS') || get('MAT') || {}, MA = get('MAT') || {};
    H(p, 'Materiais'); B(p, 'TODOS +99', () => { for (const k in MA) MA[k] += 99; toast('Materiais +99'); }); B(p, 'TODOS = 999', () => { for (const k in MA) MA[k] = 999; });
    for (const k in MA) { const n = M[k] ? M[k][0] + ' ' + M[k][1] : k; B(p, n + ' +10', () => { MA[k] += 10; toast(n + ': ' + MA[k]); }); B(p, n + ' +99', () => { MA[k] += 99; toast(n + ': ' + MA[k]); }); }
    H(p, 'Poções (' + potions().length + ')'); for (const [k, n] of potions()) B(p, n + ' +5', () => { const P = E('POT'); P[k] = (P[k] | 0) + 5; toast(n + ': ' + P[k]); });
    H(p, 'Ferramentas'); for (const t of get('TOOLS') || []) B(p, t[1] + ' ' + t[2], () => { E('OWN2')[t[0]] = 1; call('armSync'); toast('Ganhou ' + t[2]); });
    H(p, 'Armas / relíquias / estilos (' + W.length + ')'); B(p, 'TODAS AS ARMAS', () => { for (let i = 3; i < W.length; i++) giveWeapon(i); toast('Todas as armas liberadas'); });
    W.forEach((w, i) => { if (i >= 3) B(p, i + ' · ' + (w.n || w.w && w.w.n || '?'), () => { giveWeapon(i); toast('Arma liberada: ' + (w.n || w.w && w.w.n)); }); });
    H(p, 'Acessórios (' + C.length + ') · clique = ganhar e equipar'); B(p, 'TODOS OS ACESSÓRIOS', () => { for (let i = 0; i < C.length; i++) giveAcc(i, false); toast('Todos liberados'); });
    C.forEach((a, i) => B(p, a.e + ' ' + a.n, () => { giveAcc(i, true); toast('Equipado: ' + a.n); }));
  },
  Monstros(p) {
    const MD = get('MD') || {};
    H(p, 'Quantidade'); for (const n of [1, 3, 5, 10, 25, 50]) B(p, '×' + n, e => { cfg.n = n; toast('Spawnar ×' + n); }, cfg.n === n); T2(p, 'Elite');
    H(p, 'Inimigos comuns (' + Object.keys(MD).length + ') · aparecem em volta de você');
    for (const k in MD) B(p, MD[k].n + ' [' + k + ']', () => { spawnMobs(k, cfg.n, cfg.elite); toast(cfg.n + '× ' + MD[k].n); });
    H(p, 'Limpar'); B(p, '☠ Matar todos (com drops)', () => { for (const m of E('MONS').slice()) call('hit', m, 1e9, 0); }); B(p, 'Remover todos (sem drops)', () => { E('MONS').length = 0; toast('Removidos'); });
  },
  Bosses(p) {
    const BD = get('BD') || {};
    H(p, 'Chefes de ilha · aparecem ao seu lado'); for (const k in BD) B(p, BD[k].n + ' [' + k + ']', () => { spawnBossAt(k); });
    if (get('BDS')) B(p, '🦈 ' + E('BDS').n, () => spawnBossAt('shark', E('BDS')));
    H(p, 'Controle'); B(p, '☠ Matar todos os chefes', () => { for (const m of E('MONS').slice()) if (m.boss) call('hit', m, 1e12, 0); });
    B(p, '♻ Resetar chefes derrotados', () => { E('OPENED').clear(); E('BSEEN').clear(); toast('Chefes e baús reiniciados (ilhas já geradas voltam ao reentrar)'); });
    H(p, 'Chefes especiais'); toastNote(p, 'O Vagador, Nyx, Samurai, Gato, Megacamarão etc. têm gatilhos próprios: use a aba "Funções" (busque boss, nyx, vag, sam) ou os eventos/ilhas da aba Teleporte.');
  },
  Teleporte(p) {
    const TPD = get('TPD') || ['home', 'jungle', 'desert', 'glacier', 'volcano', 'cloud', 'ruins', 'lagoon'], BIO = get('BIO') || {};
    H(p, 'Biomas (ignora a exigência de vida cheia)'); for (const b of TPD) B(p, '🌍 ' + (BIO[b] ? BIO[b].name : b), () => tpBiome(b)); B(p, '🏰 Castelo Nuvem', () => { set('php', num('PHPMAX')); call('tpCastle'); });
    H(p, 'Navegar (mar)'); const s = get('ship');
    for (const d of [1000, 5000, 20000, 60000]) for (const [n, dx, dy] of [['→', 1, 0], ['←', -1, 0], ['↑', 0, -1], ['↓', 0, 1]]) B(p, n + ' ' + d / 1000 + 'km', () => { const s = get('ship'); call('tpGo', s.x + dx * d, s.y + dy * d, s.h, 'ADM: ' + n + ' ' + d / 1000 + 'km'); });
    H(p, 'Ilhas especiais (criam a ilha perto do navio)'); for (const f of fnNames().filter(n => /^spawn\w*(Isle|Castle|Farol|Ahead)$/.test(n))) B(p, '🏝 ' + f.replace(/^spawn/, ''), () => { call(f); toast(f + '()'); });
    H(p, 'Coordenadas'); const x = IN(p, 'x', Math.round(pos().x)), y = IN(p, 'y', Math.round(pos().y));
    B(p, 'Ir (mar)', () => call('tpGo', +x.value, +y.value, 0, 'ADM')); B(p, 'Ir (a pé)', () => toLand(+x.value, +y.value));
    B(p, 'Usar minha posição', () => { x.value = Math.round(pos().x); y.value = Math.round(pos().y); });
    H(p, 'Favoritos'); const nm = IN(p, 'nome do favorito', '', 130); B(p, '★ Salvar aqui', () => { const L = bm(); L.push({ n: nm.value || 'Ponto ' + (L.length + 1), x: pos().x, y: pos().y, land: land() }); localStorage.setItem('adm_bm', JSON.stringify(L)); render(); });
    bm().forEach((q, i) => { B(p, '➤ ' + q.n, () => q.land ? toLand(q.x, q.y) : call('tpGo', q.x, q.y, 0, 'ADM: ' + q.n)); B(p, '✕', () => { const L = bm(); L.splice(i, 1); localStorage.setItem('adm_bm', JSON.stringify(L)); render(); }); });
  },
  Mundo(p) {
    const D = window.DNX; if (!D) return toastNote(p, 'Ciclo dia/noite não encontrado.');
    H(p, 'Hora do dia'); for (let h = 0; h < 24; h++) B(p, (h < 10 ? '0' : '') + h + ':00', () => { A.fz = -1; D.setHour(h); toast('Hora ' + h + ':00'); });
    B(p, '❄ Congelar nesta hora', () => { A.fz = D.state.h; toast('Hora congelada'); }); B(p, '▶ Descongelar', () => { A.fz = -1; });
    H(p, 'Período'); B(p, '⏭ Pular período', () => D.jump()); B(p, '🩸 Lua de Sangue (meia-noite)', () => { D.setHour(0); D.state.blood = true; });
    H(p, 'Eventos (' + Object.keys(get('EVS') || {}).length + ')'); for (const k in get('EVS') || {}) B(p, '✨ ' + k, () => { D.force(k); toast('Evento ' + k); }); B(p, '■ Encerrar evento', () => D.end(0, ''));
    H(p, 'Clima'); const w = D.state.wx; for (const [n, k] of [['🌧 Chuva', 'rainT'], ['🌫 Névoa', 'fogT'], ['☀ Sol', 'sunT'], ['☄ Meteoros', 'metT']]) B(p, n, () => { w[k] = 1; }); B(p, 'Limpar clima', () => { w.rainT = w.fogT = w.sunT = w.metT = 0; });
  },
  Funções(p) { scan(p, 'fn'); },
  Variáveis(p) { scan(p, 'var'); },
  Sistema(p) {
    H(p, 'Gráficos'); B(p, 'Modo HD (recarrega)', () => call('setHD', 1)); B(p, 'Modo pixelado (recarrega)', () => call('setHD', 0)); T(p, '⏸ Pausar ao abrir menu', 'pause');
    H(p, 'Save'); B(p, '💾 Salvar agora', () => { try { localStorage.setItem(E('SV_PRE') + '0', JSON.stringify(E('svSnap')())); toast('Salvo no slot 0'); } catch (e) { toast('⚠ ' + e.message); } });
    B(p, '📋 Copiar save (JSON)', () => { const s = JSON.stringify(E('svSnap')()); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => toast('Copiado'), () => prompt('Copie:', s)); });
    B(p, '🗑 Apagar TODOS os saves locais', () => { if (!confirm('Apagar todos os saves deste navegador?')) return; const pre = E('SV_PRE'); Object.keys(localStorage).filter(k => k.startsWith(pre)).forEach(k => localStorage.removeItem(k)); toast('Saves apagados · recarregue'); });
    B(p, '🔄 Recarregar página', () => location.reload());
    H(p, 'Depuração'); B(p, 'Copiar posição', () => { const q = pos(); navigator.clipboard && navigator.clipboard.writeText(Math.round(q.x) + ',' + Math.round(q.y)); toast(Math.round(q.x) + ', ' + Math.round(q.y)); });
    toastNote(p, 'Modo online: cheats só valem no seu cliente; o servidor pode ignorar ou corrigir. Para testes, use o modo solo.');
  }
};
function T2(p, label) { const e = B(p, label + ': ' + (cfg.elite ? 'ON' : 'OFF'), () => { cfg.elite = cfg.elite ? 0 : 1; e.textContent = label + ': ' + (cfg.elite ? 'ON' : 'OFF'); e.style.background = cfg.elite ? '#2e7d32' : '#2a2547'; }, cfg.elite); }
function toastNote(p, t) { el('div', 'width:100%;margin:4px;color:#bcd;font:12px monospace', t, p); }

/* ---------- varredura de funções e variáveis do jogo ---------- */
let CAT;
function catalog() {
  if (CAT) return CAT; const fn = new Set(), vr = new Set();
  for (const s of document.scripts) {
    if (s.src || s.type === 'text/x-server' || s.textContent.length < 500) continue; const t = s.textContent;
    for (const m of t.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) fn.add(m[1]);
    for (const m of t.matchAll(/^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/gm)) vr.add(m[1]);
  }
  CAT = { fn: [...fn].filter(n => typeof get(n) === 'function').sort(), vr: [...vr].filter(n => { const v = get(n); return typeof v === 'number' || typeof v === 'boolean'; }).sort() };
  return CAT;
}
const fnNames = () => catalog().fn;
function scan(p, mode) {
  const c = catalog(), L = mode === 'fn' ? c.fn : c.vr;
  toastNote(p, (mode === 'fn' ? 'Funções globais do jogo (' + L.length + '). Use a busca acima. Clique para executar' : 'Variáveis numéricas/booleanas (' + L.length + '). Edite e aperte Enter') + (Q ? '' : ' · mostrando as 120 primeiras; busque para filtrar') + '.');
  let ar; if (mode === 'fn') { ar = IN(p, 'args JSON [..]', '', 160); }
  let shown = 0;
  for (const n of L) {
    if (Q && !n.toLowerCase().includes(Q)) continue; if (!Q && shown >= 120) break; shown++;
    if (mode === 'fn') B(p, n + '()', () => { let a = []; try { a = ar.value ? JSON.parse(ar.value) : []; } catch (e) { return toast('args inválidos'); } const r = call(n, ...a); toast(n + ' → ' + (r === undefined ? 'ok' : String(typeof r === 'object' ? JSON.stringify(r) : r).slice(0, 80))); });
    else { const w = el('span', 'display:inline-flex;align-items:center;margin:2px;border:1px solid #556;border-radius:4px;padding:1px 4px', '', p); w.dataset.t = n.toLowerCase(); el('span', 'font:12px monospace;color:#cde', n, w); const v = get(n), i = IN(w, n, v, 70); i.onkeydown = e => { if (e.key === 'Enter') { const x = typeof v === 'boolean' ? /^(1|true|on)$/i.test(i.value) : +i.value; toast(set(n, x) ? n + ' = ' + x : 'não foi possível alterar ' + n); } }; }
  }
}

/* ---------- montagem do painel ---------- */
function render() {
  body.innerHTML = ''; TABS[cur](body);
  for (const t of tabs.children) t.style.background = t.dataset.k === cur ? '#7a4cd6' : '#2a2547';
  if (Q) { for (const c of body.children) { if (c.dataset.s) c.style.display = 'none'; else if (c.dataset.t != null && !c.dataset.t.includes(Q)) c.style.display = 'none'; } }
}
let tabs;
function build() {
  panel = el('div', 'display:none;position:fixed;top:4px;left:4px;width:min(96vw,620px);height:calc(100% - 8px);z-index:99999;background:#14102aee;border:3px solid #b48cff;border-radius:6px;color:#fff;font:13px monospace;flex-direction:column', '', document.body);
  const hd = el('div', 'display:flex;align-items:center;padding:4px;background:#2a1f5a', '', panel);
  el('b', 'margin:0 6px;color:#ffd36e', 'ADM', hd); search = IN(hd, 'buscar…', '', 120); search.style.flex = '1'; search.oninput = () => { Q = search.value.trim().toLowerCase(); render(); };
  B(hd, '✕', () => toggle(0));
  tabs = el('div', 'display:flex;overflow-x:auto;white-space:nowrap;flex:none', '', panel);
  for (const k in TABS) { const t = B(tabs, k, () => { cur = k; render(); body.scrollTop = 0; }); t.dataset.k = k; t.style.flex = 'none'; }
  info = el('div', 'padding:2px 8px;color:#9fe8ff;font:12px monospace;flex:none', '', panel);
  body = el('div', 'flex:1;overflow-y:auto;padding:4px;display:flex;flex-wrap:wrap;align-content:flex-start;-webkit-overflow-scrolling:touch', '', panel);
  const open = el('button', 'position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:99998;opacity:.45;padding:2px 12px;font:bold 12px monospace;background:#7a4cd6;color:#fff;border:2px solid #fff;border-radius:4px;cursor:pointer', 'ADM', document.body); open.onclick = () => toggle();
  addEventListener('keydown', e => { if ((e.code === 'Backquote' || e.code === 'F2') && !/INPUT|TEXTAREA/.test((e.target || {}).tagName)) { e.preventDefault(); toggle(); } });
  setInterval(() => { if (panel.style.display === 'none') return; const q = pos(); info.textContent = (land() ? 'terra' : 'mar') + ' x:' + Math.round(q.x) + ' y:' + Math.round(q.y) + ' · Nv ' + num('LV') + ' · ouro ' + num('GOLD') + ' · vida ' + Math.round(num('php')) + '/' + Math.round(num('PHPMAX')) + ' · inimigos ' + ((get('MONS') || []).length) + (get('MPC') ? ' · ⚠ ONLINE' : ''); }, 300);
}
function toggle(v) {
  const on = v === undefined ? panel.style.display === 'none' : !!v; panel.style.display = on ? 'flex' : 'none';
  if (A.pause) { if (on) { A.t0 = A.ts; A.ts = 0; } else if (A.t0 !== undefined) { A.ts = A.t0; A.t0 = undefined; } }
  if (on) render();
}
const go = () => { try { build(); } catch (e) { console.error('ADM', e); } };
document.body ? go() : addEventListener('DOMContentLoaded', go);
window.ADM = { open: () => toggle(1), close: () => toggle(0), state: A, get, set, call };
})();
