/* =====================================================================
   Mapa regionu: pixelová mapa na horním displeji, cestování mezi arénami
   ---------------------------------------------------------------------
   - Aréna v menu → zobrazí se mapa a tečka hráče dojde po cestě k cíli,
     pak se scéna prolne do nové arény.
   - Dlaždice Mapa → mapa + info o vybraném místě dole (D-pad výběr, A cestovat, B zpět).
   Mapa 400 × 300 px (poměr 4:3 jako horní displej), kreslená kódem jako arény.
   Na mapě: zámky, odznaky poražených Pánů, stopy (!) a legendy (★) v arénách.
   ===================================================================== */

const MAP_W = 400, MAP_H = 300;
const MAP_NODES = {
  ocean:    { x: 66,  y: 232 }, desert:  { x: 150, y: 248 }, jungle: { x: 236, y: 226 }, grave: { x: 300, y: 172 },
  mountain: { x: 352, y: 224 }, storm:   { x: 350, y: 116 }, volcano: { x: 268, y: 92 }, nether: { x: 186, y: 128 },
  fel:      { x: 108, y: 140 }, aether:  { x: 66,  y: 46 },
};
// zvláštní místa: Pokémon Center (vyléčí tým) a skrýš Team Rocket (série soubojů); "near" = ke které aréně vede odbočka
const MAP_SPECIAL = {
  center1: { x: 196, y: 262, near: 'desert', kind: 'center', name: 'Pokémon Center (jih)' },
  center2: { x: 228, y: 88,  near: 'volcano', kind: 'center', name: 'Pokémon Center (sever)' },
  hideout: { x: 150, y: 196, near: 'fel', kind: 'hideout', name: 'Skrýš Team Rocket' },
};
const MAP_STOPS = ['ocean', 'desert', 'center1', 'jungle', 'grave', 'mountain', 'storm', 'volcano', 'center2', 'nether', 'hideout', 'fel', 'aether'];
const isSpecial = k => !!MAP_SPECIAL[k];
const stopPos = k => MAP_SPECIAL[k] || MAP_NODES[k];
// cesta = posloupnost arén (ARENA_ORDER); mezi sousedními uzly křivka
function mapPathPoints(a, b){
  const A = MAP_NODES[a], B = MAP_NODES[b];
  const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.18, my = (A.y + B.y) / 2 - (B.x - A.x) * 0.18;
  const pts = [];
  for (let i = 0; i <= 40; i++){
    const t = i / 40, u = 1 - t;
    pts.push([u * u * A.x + 2 * u * t * mx + t * t * B.x, u * u * A.y + 2 * u * t * my + t * t * B.y]);
  }
  return pts;
}

/* ---------- Kreslení podkladu (jednou, do cache): šedý obrys kontinentu a značky krajiny ---------- */
const MAP_C = { sea: '#141418', wave: '#2c2c34', land: '#1e1e24', coast: '#a4a4b0', mark: '#5e5e6a', path: '#4c4c58', pathHi: '#6a6a76' };
function drawMapBase(){
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext('2d'), r = pxRng(91);
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  g.fillStyle = MAP_C.sea; g.fillRect(0, 0, MAP_W, MAP_H);
  // pevnina = sjednocení kruhů kolem arén + střed kontinentu, okraj zvlněný šumem; Nebeská říše je samostatný ostrov
  const blobs = Object.entries(MAP_NODES).filter(([k]) => k !== 'aether').map(([, n]) => [n.x, n.y, 36, 30]).concat([[210, 175, 120, 70], [140, 200, 60, 50], [300, 140, 50, 50], [168, 238, 54, 28]]);
  const sky = [[66, 46, 46, 26], [96, 56, 26, 18]];
  const noise = (x, y) => Math.sin(x * 0.21 + y * 0.07) * 0.05 + Math.sin(y * 0.19 - x * 0.11) * 0.05 + Math.sin((x + y) * 0.43) * 0.025;
  const inside = (x, y, list) => list.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + noise(x, y) < 1);
  const mask = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) mask[y * MAP_W + x] = inside(x, y, blobs) ? 1 : inside(x, y, sky) ? 2 : 0;
  const at = (x, y) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 0 : mask[y * MAP_W + x];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++){
    const m = at(x, y);
    if (!m){
      // vlnky kolem pobřeží (jako na kreslené mapě)
      let near = 0;
      for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) if (at(x + dx, y + dy)) near = 1;
      if (near && (y % 7 === 0) && ((x + Math.floor(y / 7) * 3) % 9 < 3)) dot(x, y - ((x % 3) === 1 ? 1 : 0), MAP_C.wave);
      continue;
    }
    const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
    const edge2 = !at(x - 2, y) || !at(x + 2, y) || !at(x, y - 2) || !at(x, y + 2);
    dot(x, y, edge ? MAP_C.coast : edge2 ? '#56565f' : m === 2 ? '#26262e' : MAP_C.land);
  }
  // značky krajiny (čárová kresba)
  const tri = (x, y, h, fill) => { for (let i = 0; i < h; i++) for (let k = -i; k <= i; k++) dot(x + k, y + i, Math.abs(k) === i || i === h - 1 ? MAP_C.coast : fill); };
  for (const [x, y] of [[338, 210], [352, 204], [366, 212], [344, 226], [362, 230]]) tri(x, y, 7, '#2a2a32');                    // hory
  tri(268, 76, 10, '#2a2a32'); for (let i = 0; i < 5; i++) dot(267 + (i % 2), 74 - i * 2, MAP_C.mark);                         // sopka + kouř
  const tree = (x, y) => { dot(x, y - 2, MAP_C.mark); for (let k = -1; k <= 1; k++) dot(x + k, y - 1, MAP_C.mark); for (let k = -2; k <= 2; k++) dot(x + k, y, MAP_C.mark); dot(x, y + 1, MAP_C.mark); };
  for (let i = 0; i < 16; i++) tree(214 + r() * 44, 208 + r() * 34);                                                            // džungle
  for (let i = 0; i < 40; i++) dot(126 + r() * 52, 236 + r() * 22, MAP_C.mark);                                                // poušť (tečky)
  for (const [x, y] of [[288, 166], [300, 160], [312, 170], [296, 180]]){ for (let k = -1; k <= 1; k++) dot(x + k, y, MAP_C.mark); dot(x, y - 1, MAP_C.mark); dot(x, y + 1, MAP_C.mark); dot(x, y + 2, MAP_C.mark); }   // hřbitov (kříže)
  for (const [x, y] of [[336, 104], [356, 112], [346, 124]]) for (let k = 0; k < 5; k++) dot(x + (k % 2 ? 1 : 0) + k, y + k, MAP_C.mark);   // bouře (blesky)
  for (let i = 0; i < 14; i++){ const a = i * 0.7, rr = 4 + i * 0.9; dot(186 + Math.cos(a) * rr, 128 + Math.sin(a) * rr * 0.7, MAP_C.mark); }   // nether (spirála)
  for (const [x, y] of [[96, 130], [112, 150], [120, 132]]) for (let k = 0; k < 6; k++) dot(x + k, y + (k % 3 === 1 ? 1 : 0) - (k > 3 ? 1 : 0), MAP_C.mark);   // fel (pukliny)
  for (const [x, y] of [[50, 40], [80, 52]]) for (let k = 0; k < 9; k++) dot(x + k, y + (k > 1 && k < 7 ? -1 : 0), MAP_C.mark);   // oblaka
  // cesty: čárkované (2 px), odbočky ke zvláštním místům
  const dash = pts => pts.forEach(([x, y], k) => { if (k % 4 < 2){ g.fillStyle = MAP_C.path; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); } });
  for (let i = 0; i < ARENA_ORDER.length - 1; i++) dash(mapPathPoints(ARENA_ORDER[i], ARENA_ORDER[i + 1]));
  for (const sp of Object.values(MAP_SPECIAL)){ const n = MAP_NODES[sp.near]; dash(Array.from({ length: 30 }, (_, i) => [n.x + (sp.x - n.x) * i / 29, n.y + (sp.y - n.y) * i / 29])); }
  return c;
}

/* ---------- Pohled mapy ---------- */
const mapView = document.createElement('div');
mapView.id = 'mapView';
mapView.className = 'map-view';
mapView.innerHTML = '<canvas width="400" height="300"></canvas><div class="map-tag"></div>';
document.getElementById('shell').appendChild(mapView);
const mapPanel = document.createElement('div');
mapPanel.id = 'mapPanel';
mapPanel.className = 'map-panel';
document.body.appendChild(mapPanel);
const mapCanvas = mapView.querySelector('canvas'), mctx = mapCanvas.getContext('2d');
let mapBase = null, mapSel = arena, mapDot = null, mapMode = null;   // mapMode: 'browse' | 'travel'

function nodeState(k){
  return {
    locked: arenaLocked(k), boss: !!progress.bosses[k],
    track: shop.hunts.some(h => !h.legend && trackArena(h) === k), legend: shop.hunts.some(h => h.legend && trackArena(h) === k),
  };
}
function drawMap(now){
  if (!mapView.classList.contains('open')) return;
  mapBase ||= drawMapBase();
  mctx.clearRect(0, 0, MAP_W, MAP_H);
  mctx.drawImage(mapBase, 0, 0);
  const dot = (x, y, col) => { mctx.fillStyle = col; mctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const disc = (cx, cy, r, col, line) => {
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++){
      const d = Math.hypot(x, y);
      if (d <= r) dot(cx + x, cy + y, col); else if (line && d <= r + 1) dot(cx + x, cy + y, line);
    }
  };
  for (const k of ARENA_ORDER){
    const n = MAP_NODES[k], st = nodeState(k);
    disc(n.x, n.y, 4, st.locked ? '#2a2a32' : '#8a8a96', st.locked ? '#5e5e6a' : '#c8c8d4');
    if (!st.locked) disc(n.x - 1, n.y - 1, 1, '#c8c8d4');
    if (st.boss){ for (const [x, y] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1]]) dot(n.x + 7 + x, n.y - 6 + y, '#f2c230'); }
    if (st.track && Math.floor(now / 400) % 2){ mctx.fillStyle = '#ff5a4a'; mctx.fillRect(n.x - 9, n.y - 11, 2, 5); mctx.fillRect(n.x - 9, n.y - 5, 2, 2); }
    if (st.legend && Math.floor(now / 300) % 2){ for (const [x, y] of [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]) dot(n.x - 10 + x, n.y + 7 + y, '#e070ff'); }
  }
  for (const [k, sp] of Object.entries(MAP_SPECIAL)){
    mctx.fillStyle = '#c8c8d4'; mctx.fillRect(sp.x - 5, sp.y - 5, 11, 11);
    mctx.fillStyle = MAP_C.land; mctx.fillRect(sp.x - 4, sp.y - 4, 9, 9);
    if (sp.kind === 'center'){ mctx.fillStyle = '#ff5a6a'; mctx.fillRect(sp.x - 1, sp.y - 3, 3, 7); mctx.fillRect(sp.x - 3, sp.y - 1, 7, 3); }
    else ['111', '101', '110', '101', '101'].forEach((row, y) => [...row].forEach((c2, x) => c2 === '1' && dot(sp.x - 1 + x, sp.y - 2 + y, hideoutOpen() ? '#ff3a3a' : '#5e5e6a')));
  }
  // výběr (blikající rámeček) a hráč
  if (mapMode === 'browse'){
    const n = stopPos(mapSel), o = 9 + (Math.floor(now / 250) % 2);
    for (let i = 0; i < 48; i++){ const a = i / 48 * Math.PI * 2; if (i % 4 < 3) dot(n.x + Math.cos(a) * o, n.y + Math.sin(a) * o, '#ffe066'); }
  }
  const p = mapDot || MAP_NODES[arena];
  disc(p.x, p.y, 3, '#ff3a3a', '#141018');                       // hráč = červený bod
  if (Math.floor(now / 400) % 2) dot(p.x - 1, p.y - 1, '#ffb0a8');
  requestAnimationFrame(drawMap);
}
function placeTag(k){
  const tag = mapView.querySelector('.map-tag'), n = stopPos(k), r = mapCanvas.getBoundingClientRect(), vr = mapView.getBoundingClientRect();
  const sx = r.width / MAP_W, sy = r.height / MAP_H;
  tag.textContent = isSpecial(k) ? MAP_SPECIAL[k].name : ARENAS[k].name;
  tag.style.left = (r.left - vr.left + n.x * sx) + 'px';
  tag.style.top = (r.top - vr.top + (n.y + 12) * sy) + 'px';
}
function openMap(mode = 'browse'){
  if (hunt || bossFight || battle.enemy.track || battle.enemy.trainer) return toast('Teď cestovat nejde – nejdřív dokonči souboj.');
  closeShop(); closeTeam(); closeJournal(); closePanel();
  document.querySelectorAll('.pop.open').forEach(p => p.classList.remove('open'));
  mapMode = mode;
  mapSel = arena;
  mapDot = null;
  mapView.classList.add('open');
  document.body.classList.add('map-open');
  document.body.classList.toggle('map-browse', mode === 'browse');
  requestAnimationFrame(drawMap);
  renderMapPanel();
}
function closeMap(){
  mapView.classList.remove('open');
  document.body.classList.remove('map-open', 'map-browse');
  mapMode = null;
}
function renderMapPanel(){
  placeTag(mapSel);
  if (mapMode !== 'browse') return;
  if (isSpecial(mapSel)) return renderSpecialPanel(mapSel);
  const k = mapSel, st = nodeState(k), lv = ARENA_LEVELS[k], here = k === arena;
  const tags = [st.locked ? '🔒 zamčeno – poraz předchozího Pána arény' : `Lv ${lv.join('–')} · výher ${progress.wins[k] || 0}`,
    st.boss ? '★ Pán arény poražen' : `Pán arény: ${LEADERS[k]?.name || '?'}`,
    st.track ? '! čeká tu tvoje stopa' : '', st.legend ? '✦ stopa legendy!' : ''].filter(Boolean);
  mapPanel.innerHTML = `<div class="mp-head"><b>${ARENAS[k].name}</b><span>${ARENA_ORDER.indexOf(k) + 1}/${ARENA_ORDER.length}</span></div>
    <div class="mp-info">${tags.map(t => `<div>${t}</div>`).join('')}</div>
    <div class="mp-act">
      <button class="btn" data-map="prev">◀</button>
      <button class="btn primary" data-map="go" ${st.locked || here ? 'disabled' : ''}>${here ? 'Tady jsi' : 'Cestovat'}</button>
      <button class="btn" data-map="next">▶</button>
    </div>
    <button class="btn mp-close" data-map="close">Zavřít mapu</button>`;
}
function mapStep(d){
  const i = MAP_STOPS.indexOf(mapSel);
  mapSel = MAP_STOPS[(i + d + MAP_STOPS.length) % MAP_STOPS.length];
  beep(900, 0.03, 0.02);
  renderMapPanel();
}
mapPanel.addEventListener('click', (e) => {
  const a = e.target.closest('[data-map]')?.dataset.map;
  if (!a || e.target.closest('[disabled]')) return;
  if (a === 'prev') mapStep(-1);
  if (a === 'next') mapStep(1);
  if (a === 'go') travelTo(mapSel);
  if (a === 'visit') visitSpecial(mapSel);
  if (a === 'close') closeMap();
});
mapCanvas.addEventListener('click', (e) => {
  if (mapMode !== 'browse') return;
  const r = mapCanvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MAP_W, y = (e.clientY - r.top) / r.height * MAP_H;
  let best = null, bd = 22;
  for (const k of MAP_STOPS){ const n = stopPos(k), d = Math.hypot(n.x - x, n.y - y); if (d < bd){ bd = d; best = k; } }
  if (best){ mapSel = best; renderMapPanel(); }
});

/* ---------- Cestování: tečka jde po cestách (přes mezilehlé arény), pak prolnutí ---------- */
let traveling = false;
async function travelTo(key){
  if (isSpecial(key)) return visitSpecial(key);
  if (traveling || key === arena) return;
  if (arenaLocked(key)) return toast('Aréna je zamčená – vyhraj nad Pánem předchozí arény.');
  if (!mapView.classList.contains('open')) openMap('travel');
  if (!mapView.classList.contains('open')) return;
  traveling = true;
  mapMode = 'travel';
  document.body.classList.remove('map-browse');
  const a = ARENA_ORDER.indexOf(arena), b = ARENA_ORDER.indexOf(key), step = b > a ? 1 : -1;
  let pts = [];
  for (let i = a; i !== b; i += step){
    const seg = mapPathPoints(ARENA_ORDER[Math.min(i, i + step)], ARENA_ORDER[Math.max(i, i + step)]);
    pts = pts.concat(step > 0 ? seg : seg.reverse());
  }
  placeTag(key);
  const SPEED = 110;                                     // px mapy za sekundu
  const len = pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
  const dur = Math.min(3200, Math.max(700, len / SPEED * 1000)), t0 = performance.now();
  await new Promise(res => {
    const tick = now => {
      const t = Math.min(1, (now - t0) / dur);
      let want = t * len, i = 1;
      for (; i < pts.length; i++){ const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (want <= d) break; want -= d; }
      const p = pts[Math.min(i, pts.length - 1)];
      mapDot = { x: p[0], y: p[1] };
      if (Math.floor(now / 160) !== Math.floor((now - 16) / 160)) beep(480, 0.012, 0.01, 'square');   // kroky
      t < 1 ? requestAnimationFrame(tick) : res();
    };
    requestAnimationFrame(tick);
  });
  await wait(300);
  await fadeTo(1);                                       // prolnutí do nové arény
  closeMap();
  showArena(key);
  spawnEnemy();
  updateBossCall();
  await fadeTo(0);
  traveling = false;
}

/* ---------- Zvláštní místa: Pokémon Center a skrýš Team Rocket ---------- */
const todayKey = () => new Date().toDateString();
const hideoutOpen = () => !!progress.bosses?.desert && progress.hideoutDay !== todayKey();
function renderSpecialPanel(k){
  const sp = MAP_SPECIAL[k];
  const info = sp.kind === 'center'
    ? ['Sestra Joy vyléčí celý tvůj tým zdarma.', 'Oživí i omdlelé pokémony.']
    : hideoutOpen() ? ['3 souboje s Team Rocket za sebou.', 'Na konci velitel a velká odměna.', 'Otevřeno 1× denně.']
      : progress.bosses?.desert ? ['Dnes už jsi skrýš vyčistil.', 'Vrať se zítra.'] : ['Zamčeno – poraz Pána Pouště.'];
  mapPanel.innerHTML = `<div class="mp-head"><b>${sp.name}</b><span>${sp.kind === 'center' ? '✚' : 'R'}</span></div>
    <div class="mp-info">${info.map(t => `<div>${t}</div>`).join('')}</div>
    <div class="mp-act">
      <button class="btn" data-map="prev">◀</button>
      <button class="btn primary" data-map="visit" ${sp.kind === 'hideout' && !hideoutOpen() ? 'disabled' : ''}>${sp.kind === 'center' ? 'Vyléčit tým' : 'Vstoupit'}</button>
      <button class="btn" data-map="next">▶</button>
    </div>
    <button class="btn mp-close" data-map="close">Zavřít mapu</button>`;
}
// tečka dojde z aktuální arény k místu (a u Centra zase zpátky)
async function walkTo(from, to){
  const t0 = performance.now(), dur = Math.max(500, Math.hypot(to.x - from.x, to.y - from.y) / 110 * 1000);
  await new Promise(res => { const tick = now => { const t = Math.min(1, (now - t0) / dur); mapDot = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }; t < 1 ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
}
async function visitSpecial(k){
  if (traveling) return;
  const sp = MAP_SPECIAL[k], home = MAP_NODES[arena];
  if (sp.kind === 'hideout' && !hideoutOpen()) return;
  traveling = true;
  mapMode = 'travel'; document.body.classList.remove('map-browse');
  placeTag(k);
  await walkTo(home, sp);
  if (sp.kind === 'center'){
    for (const m of party.mons){ m.hp = monStats(m).hp; m.fainted = false; }
    saveParty();
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 0.05, 'square', i * 0.12));
    toast('Tvoji pokémoni jsou plně vyléčení! Přijď zas.', true);
    await wait(900);
    await walkTo(sp, home);
    mapDot = null;
    if (monState.get(playerBox) === 'faint') sendMon(party.active);
    closeMap();
  } else {
    await wait(300);
    closeMap();
    startHideout();                                      // trainers.js
  }
  traveling = false;
}

document.getElementById('mapBtn').addEventListener('click', () => mapView.classList.contains('open') ? closeMap() : openMap());
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.key === 'm' || e.key === 'M') mapView.classList.contains('open') ? closeMap() : openMap();
  if (mapMode === 'browse'){
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') mapStep(-1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') mapStep(1);
    if (e.key === 'Enter') travelTo(mapSel);
    if (e.key === 'Escape') closeMap();
  }
});
document.head.insertAdjacentHTML('beforeend', `<style>
.map-view{ position:absolute; inset:0; z-index:30; display:none; background:#0c0c10; }
body.map-open .battle-info, body.map-open .boss-call, body.map-open .trainer-call{ display:none !important; }
.map-view.open{ display:block; }
.map-view canvas{ width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
.map-tag{ position:absolute; transform:translateX(-50%); padding:3px 6px 2px; font:700 10px var(--font-title); color:#fff; background:rgba(12,12,20,.8); white-space:nowrap; pointer-events:none; }
.map-panel{ display:none; }
body.map-browse .map-panel{
  display:flex; flex-direction:column; gap:8px; position:fixed; z-index:46; box-sizing:border-box;
  left:50%; bottom:16px; transform:translateX(-50%); width:min(440px, calc(100vw - 24px)); padding:14px;
  color:var(--w-fg); background:var(--w-bg); box-shadow:var(--w-frame); font-family:var(--font-body); -webkit-font-smoothing:none; zoom:var(--zoom, 1);
}
body.ds.map-browse .map-panel{
  zoom:var(--dsk); transform:none; box-shadow:none; bottom:auto;
  left:calc(var(--bx) / var(--dsk)); top:calc(var(--by) / var(--dsk)); width:calc(var(--bw) / var(--dsk)); height:calc(var(--bh) / var(--dsk));
}
body.ds.map-browse #dsPanel, body.ds.map-browse .manual-panel{ visibility:hidden; }
.mp-head{ display:flex; align-items:baseline; gap:10px; }
.mp-head b{ font:700 17px var(--font-title); flex:1; }
.mp-head span{ font:700 11px var(--font-title); color:var(--w-muted); }
.mp-info{ flex:1; display:flex; flex-direction:column; gap:6px; font-size:14px; color:var(--w-muted); }
.mp-info div:first-child{ color:var(--w-fg); }
.mp-act{ display:flex; gap:8px; }
.mp-act .btn{ padding:12px; } .mp-act .primary{ flex:1; }
.mp-close{ align-self:stretch; }
</style>`);
