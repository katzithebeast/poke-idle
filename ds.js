/* =====================================================================
   DS rozložení (Galaxy Z Fold): hra v kabátku Nintenda DSi
   ---------------------------------------------------------------------
   assets/ds_skin.png (2176 × 1812 = vnitřní displej Foldu) se roztáhne přes
   celou obrazovku. Horní displej = souboj, spodní = info a menu, bezely
   (rámeček konzole) ukazují kde jsi a nápovědu ovládání.
   Tlačítka konzole: D-pad posouvá výběr po všem, co je zrovna vidět (i v oknech),
   A potvrdí, B zpět/zavřít, X Tým, Y Obchod, START menu, SELECT auto boj,
   POWER celá obrazovka.
   ===================================================================== */

const SKIN = { w: 2176, h: 1812 };
const SCREEN_TOP = { x: 665, y: 113, w: 846, h: 634 };
const SCREEN_BOT = { x: 665, y: 1058, w: 846, h: 635 };
const MIDDLE = { x: 540, w: 1100 };   // pás mezi D-padem a ABXY – tam se otevírají okna
// tlačítka konzole (v pixelech obrázku): střed + poloměr dotykové plochy
const DS_BUTTONS = {
  up:     { x: 296, y: 1170, r: 70 }, down: { x: 296, y: 1404, r: 70 },
  left:   { x: 179, y: 1287, r: 70 }, right: { x: 413, y: 1287, r: 70 },
  a:      { x: 2023, y: 1298, r: 78 }, b: { x: 1883, y: 1435, r: 78 },
  x:      { x: 1881, y: 1156, r: 78 }, y: { x: 1743, y: 1295, r: 78 },
  start:  { x: 1760, y: 1589, r: 60, wide: 1.9 }, select: { x: 1760, y: 1691, r: 60, wide: 1.9 },
  power:  { x: 480, y: 1680, r: 60, wide: 1.9 },
};

/* ---------- Zapnutí: Nastavení → Rozložení (auto = DS na Foldu / v APK) ---------- */
const LAYOUTS = [{ key: 'auto', label: 'automaticky' }, { key: 'ds', label: 'DS (Fold)' }, { key: 'classic', label: 'klasické' }];
let layoutMode = 'auto';
try { const v = localStorage.getItem('pokeIdle.layout'); if (LAYOUTS.some(l => l.key === v)) layoutMode = v; } catch {}
if (new URLSearchParams(location.search).get('ds') === '1') layoutMode = 'ds';
function wantDs(){
  if (layoutMode !== 'auto') return layoutMode === 'ds';
  const ratio = innerWidth / innerHeight;
  const touch = !!window.Capacitor || matchMedia('(pointer: coarse)').matches;
  return touch && ratio > 1.02 && ratio < 1.5;     // rozložený Fold na šířku
}

/* ---------- DOM: kabátek, tlačítka, spodní displej, bezely ---------- */
const dsEl = document.createElement('div');
dsEl.id = 'ds';
const dsBtns = document.createElement('div');
dsBtns.id = 'dsButtons';
for (const [k, b] of Object.entries(DS_BUTTONS)){
  const el = document.createElement('div');
  el.className = 'ds-btn';
  el.dataset.btn = k;
  el.style.left = (b.x - b.r * (b.wide || 1)) / SKIN.w * 100 + '%';
  el.style.top = (b.y - b.r) / SKIN.h * 100 + '%';
  el.style.width = b.r * 2 * (b.wide || 1) / SKIN.w * 100 + '%';
  el.style.height = b.r * 2 / SKIN.h * 100 + '%';
  dsBtns.appendChild(el);
}
dsEl.appendChild(dsBtns);
document.body.appendChild(dsEl);

const dsPanel = document.createElement('div');
dsPanel.id = 'dsPanel';
dsPanel.innerHTML = `
  <div class="dsp-head">
    <div class="dsp-loc"><b id="dspArena"></b><span id="dspArenaSub"></span></div>
    <div class="dsp-coins"><img class="coin" alt="" src="${COIN_ICON}"><span id="dspCoins"></span></div>
  </div>
  <div class="dsp-mons">
    <div class="dsp-mon" id="dspPlayer"></div>
    <div class="dsp-vs" id="dspEnemy"></div>
  </div>
  <button class="dsp-boss" id="dspBoss" hidden></button>
  <div class="dsp-tiles">
    <button class="dsp-tile" data-act="team"><span>Tým</span><small>X</small></button>
    <button class="dsp-tile" data-act="dex"><span>Deník</span></button>
    <button class="dsp-tile" data-act="shop"><span>Obchod</span><small>Y</small></button>
    <button class="dsp-tile" data-act="arena"><span>Aréna</span></button>
    <button class="dsp-tile" data-act="auto"><span id="dspAuto">Auto boj</span><small>SELECT</small></button>
    <button class="dsp-tile" data-act="settings"><span>Menu</span><small>START</small></button>
  </div>`;
document.body.appendChild(dsPanel);
const tileIcon = { team: 'team', dex: 'dex', shop: 'shop', arena: 'arena', settings: 'settings', auto: 'settings' };
dsPanel.querySelectorAll('.dsp-tile').forEach(t => {
  const ic = t.dataset.act === 'auto' ? pxBallCanvas('ultra', 14) : NAV_ICONS[tileIcon[t.dataset.act]]();
  t.prepend(ic);
});
const dsTopBar = document.createElement('div');
dsTopBar.id = 'dsTopBar';
const dsHint = document.createElement('div');
dsHint.id = 'dsHint';
document.body.append(dsTopBar, dsHint);

/* ---------- Geometrie: kabátek "contain" přes celou obrazovku, displeje dopočítat ---------- */
function layoutDs(){
  const on = wantDs();
  document.body.classList.toggle('ds', on);
  if (!on) return;
  const s = Math.min(innerWidth / SKIN.w, innerHeight / SKIN.h);
  const ox = (innerWidth - SKIN.w * s) / 2, oy = (innerHeight - SKIN.h * s) / 2;
  const R = document.documentElement.style;
  const px = (k, v) => R.setProperty(k, v.toFixed(2) + 'px');
  px('--ox', ox); px('--oy', oy); px('--sw', SKIN.w * s); px('--sh', SKIN.h * s);
  px('--tx', ox + SCREEN_TOP.x * s); px('--ty', oy + SCREEN_TOP.y * s); px('--tw', SCREEN_TOP.w * s); px('--th', SCREEN_TOP.h * s);
  px('--bx', ox + SCREEN_BOT.x * s); px('--by', oy + SCREEN_BOT.y * s); px('--bw', SCREEN_BOT.w * s); px('--bh', SCREEN_BOT.h * s);
  px('--mx', ox + MIDDLE.x * s); px('--mw', MIDDLE.w * s);
  px('--topbar', SCREEN_TOP.y * s); px('--botbar', (SKIN.h - SCREEN_BOT.y - SCREEN_BOT.h) * s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  R.setProperty('--dsk', clamp(SCREEN_BOT.w * s / 440, 0.4, 2).toFixed(3));        // spodní displej je navržený na 440 px
  R.setProperty('--pz', clamp(SCREEN_TOP.w * s / 560, 0.45, 1.4).toFixed(3));      // cedulky a hlášky na horním displeji
  R.setProperty('--zoom', clamp(MIDDLE.w * s / 700, 0.55, 1.3).toFixed(3));        // okna v pásu mezi tlačítky
}
let dsResizing = false;
function relayout(){
  if (dsResizing) return;
  layoutDs();
  dsResizing = true;
  window.dispatchEvent(new Event('resize'));   // pokémoni a arény se přepočítají na nový displej
  dsResizing = false;
}
window.addEventListener('resize', () => { if (!dsResizing) layoutDs(); });

/* ---------- Spodní displej: kde jsi, kdo bojuje, menu ---------- */
function dsRender(){
  if (!document.body.classList.contains('ds')) return;
  const a = ARENAS[arena], lv = ARENA_LEVELS[arena];
  $('dspArena').textContent = a.name;
  $('dspArenaSub').textContent = `Lv ${lv.join('–')} · výher ${progress.wins[arena] || 0} · ${progress.bosses[arena] ? 'pán arény ✓' : `pán arény ${Math.min(BOSS_WINS, progress.wins[arena] || 0)}/${BOSS_WINS}`}`;
  $('dspCoins').textContent = shop.coins.toLocaleString('cs-CZ');
  const p = activeMon();
  if (p){
    const st = monStats(p), q = p.hp / st.hp, s = monStatus(p);
    $('dspPlayer').innerHTML = `<img alt="" src="${spriteUrl(p.id, { shiny: p.shiny, animated: false })}">
      <div class="dsp-info"><div class="dsp-name">${p.shiny ? STAR : ''}${NAMES[p.id - 1]} ${qstars(p.stars)} <em>Lv ${p.lvl}</em></div>
      <div class="hpbar"><i class="${hpClass(q)}" style="width:${q * 100}%"></i></div>
      <div class="dsp-sub ${s.cls}">${Math.ceil(p.hp)}/${st.hp} HP · ${s.text}</div></div>`;
  }
  const e = bossFight || battle.enemy;
  $('dspEnemy').textContent = hunt ? `Lov: divoký ${NAMES[hunt.h.id - 1]}` : e?.lvl ? `${bossFight ? 'Pán arény' : 'Soupeř'}: ${NAMES[e.id - 1]} Lv ${e.lvl}` : '';
  const boss = !bossFight && !hunt && bossAvailable() && BOSSES[arena];
  $('dspBoss').hidden = !boss;
  if (boss) $('dspBoss').innerHTML = `<b>${boss.title}</b> ${NAMES[boss.id - 1]} tě vyzývá · A`;
  $('dspAuto').textContent = autoOn ? 'Auto: zap' : 'Auto: vyp';
  // bezely: nahoře kde jsi, dole nápověda ovládání
  dsTopBar.textContent = bossFight ? `Pán arény · ${a.name}` : hunt ? `Lov · ${a.name}` : `${a.name} · Lv ${lv.join('–')}`;
  const L = topLayer();
  dsHint.innerHTML = hintFor(L);
  document.body.classList.toggle('modal-open', !!L.matches?.('.dm, .journal, .case, .reveal, .dex-detail'));
}
const K = k => `<kbd>${k}</kbd>`;
function hintFor(L){
  if (evoRun) return `${K('B')} zrušit evoluci`;
  if (L === caseEl) return `${K('B')} přeskočit`;
  if (L === huntHud) return `${K('A')} hodit ball · nebo ťukni na horní displej`;
  if (L === bossHud) return `${K('A')} útok – zastav ukazatel uprostřed`;
  if (L !== dsPanel) return `${K('✚')} výběr · ${K('A')} potvrdit · ${K('B')} zpět`;
  return `${K('✚')} výběr ${K('A')} ok ${K('X')} tým ${K('Y')} obchod ${K('START')} menu ${K('SELECT')} auto`;
}
dsPanel.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act], #dspBoss');
  if (!t) return;
  if (t.id === 'dspBoss') return startBoss();
  ({
    team: openTeam, dex: openJournal, shop: () => openShop(),
    arena: () => arenaBtn.click(), settings: () => document.getElementById('settingsBtn').click(),
    auto: () => { autoBtn.click(); toast(autoOn ? 'Auto boj zapnutý' : 'Auto boj vypnutý'); },
  })[t.dataset.act]?.();
});

/* ---------- Výběr D-padem (prostorová navigace) ---------- */
const FOCUSABLE = 'button:not([disabled]), [data-sel], .dex-card, .evo-row.link, input, .arena-opt';
function topLayer(){
  const order = ['#reveal.open', '#caseOverlay.open', '#dexDetail.open', '#journal.open', '#away.open', '#shop.open',
    '#team.open', '#settingsMenu.open', '#arenaMenu.open', '#huntHud.open', '#bossHud.open'];
  for (const sel of order){ const el = document.querySelector(sel); if (el) return el; }
  return dsPanel;
}
function focusables(L){
  return [...L.querySelectorAll(FOCUSABLE)].filter(el => {
    if (el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}
let focused = null, focusLayer = null;
function setFocus(el){
  focused?.classList.remove('ds-focus');
  focused = el;
  if (!el) return;
  el.classList.add('ds-focus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function ensureFocus(){
  const L = topLayer();
  const list = focusables(L);
  if (L !== focusLayer || !focused || !list.includes(focused)){
    focusLayer = L;
    setFocus(list.find(el => el.matches('.primary, #throwBtn, #bossAttack, .dm-tab.active')) || list[0] || null);
  }
  return list;
}
function moveFocus(dir){
  const list = ensureFocus();
  if (!focused) return;
  const a = focused.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list){
    if (el === focused) continue;
    const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (main <= 2) continue;
    const score = main + side * 2.2;
    if (score < bestScore){ bestScore = score; best = el; }
  }
  if (best) setFocus(best);
  else beep(150, 0.04, 0.02, 'triangle');
}

/* ---------- Tlačítka konzole ---------- */
function pressA(){
  const L = topLayer();
  if (L === dsPanel && !$('dspBoss').hidden && (!focused || focused === $('dspBoss'))) return startBoss();
  ensureFocus();
  if (focused){ if (focused.matches('input')) focused.focus(); else focused.click(); return; }
  if (hunt) throwBall();
  else if (bossFight) bossPlayerAttack();
}
function pressB(){
  if (evoRun){ evoRun.cancelled = true; return; }
  const L = topLayer();
  if (L === dsPanel || L === huntHud || L === bossHud) return;
  if (L === caseEl){ document.getElementById('caseSkip')?.click(); return; }
  if (L === revealEl) return closeReveal();
  if (L === dexDetail) return closeDetail();
  if (L === journal) return closeJournal();
  if (L === awayEl) return awayEl.classList.remove('open');
  if (L === shopEl) return closeShop();
  if (L === teamEl) return closeTeam();
  L.classList.remove('open');   // menu Nastavení / Aréna
}
function toggleFullscreen(){
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {}
}
const DS_ACTIONS = {
  up: () => moveFocus('up'), down: () => moveFocus('down'), left: () => moveFocus('left'), right: () => moveFocus('right'),
  a: pressA, b: pressB,
  x: () => teamEl.classList.contains('open') ? closeTeam() : openTeam(),
  y: () => shopEl.classList.contains('open') ? closeShop() : openShop(),
  start: () => document.getElementById('settingsBtn').click(),
  select: () => { autoBtn.click(); toast(autoOn ? 'Auto boj zapnutý' : 'Auto boj vypnutý'); },
  power: toggleFullscreen,
};
let repeatTimer = 0;
dsBtns.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.ds-btn');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();           // ať se kvůli stisku nezavřou menu (zavírají se při kliku mimo)
  b.classList.add('down');
  try { navigator.vibrate?.(12); } catch {}
  const act = DS_ACTIONS[b.dataset.btn];
  act();
  dsRender();
  // podržený D-pad opakuje pohyb
  if (['up', 'down', 'left', 'right'].includes(b.dataset.btn)){
    clearInterval(repeatTimer);
    repeatTimer = setTimeout(() => { repeatTimer = setInterval(() => { act(); dsRender(); }, 110); }, 380);
  }
});
const release = () => { clearTimeout(repeatTimer); clearInterval(repeatTimer); dsBtns.querySelectorAll('.down').forEach(b => b.classList.remove('down')); };
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => dsBtns.addEventListener(ev, release));

/* ---------- Nastavení: Rozložení ---------- */
const layoutBtn = document.createElement('button');
layoutBtn.className = 'set-row';
layoutBtn.title = 'DS kabátek pro rozložený Fold, nebo klasická obrazovka';
document.getElementById('themeBtn').after(layoutBtn);
function updateLayoutBtn(){
  const l = LAYOUTS.find(x => x.key === layoutMode);
  setRow(layoutBtn, 'Rozložení', l.key === 'auto' ? `automaticky (${wantDs() ? 'DS' : 'klasické'})` : l.label);
}
layoutBtn.addEventListener('click', () => {
  const i = LAYOUTS.findIndex(l => l.key === layoutMode);
  layoutMode = LAYOUTS[(i + 1) % LAYOUTS.length].key;
  try { localStorage.setItem('pokeIdle.layout', layoutMode); } catch {}
  relayout();
  updateLayoutBtn();
});

// Android (APK): systémové tlačítko Zpět = B; na hlavní obrazovce aplikaci jen schová
try {
  window.Capacitor?.Plugins?.App?.addListener('backButton', () => {
    if (topLayer() === dsPanel && !evoRun) window.Capacitor.Plugins.App.minimizeApp();
    else { pressB(); dsRender(); }
  });
} catch {}

relayout();
updateLayoutBtn();
dsRender();
setInterval(dsRender, 400);
