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
  ocean:    { x: 62,  y: 236, col: '#3a8ee8' },
  desert:   { x: 150, y: 250, col: '#e0b050' },
  jungle:   { x: 236, y: 226, col: '#3a9a48' },
  grave:    { x: 300, y: 170, col: '#8a7aa8' },
  mountain: { x: 360, y: 230, col: '#dce8f4' },
  storm:    { x: 352, y: 112, col: '#5a6ad0' },
  volcano:  { x: 268, y: 92,  col: '#e0502a' },
  nether:   { x: 186, y: 128, col: '#a04ae0' },
  fel:      { x: 104, y: 136, col: '#c03a2a' },
  aether:   { x: 70,  y: 48,  col: '#fff2b0' },
};
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

/* ---------- Kreslení podkladu (jednou, do cache) ---------- */
function drawMapBase(){
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext('2d'), P = pxPainter(g), r = pxRng(91);
  const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  // moře s ditheringem a vlnkami
  g.fillStyle = '#1e3a6a'; g.fillRect(0, 0, MAP_W, MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = (y % 2); x < MAP_W; x += 2) if ((x * 7 + y * 13) % 11 === 0) dot(x, y, '#28488a');
  for (let i = 0; i < 90; i++){ const x = r() * MAP_W, y = r() * MAP_H; for (let k = 0; k < 3; k++) dot(x + k, y + (k === 1 ? -1 : 0), '#4a6aaa'); }
  // pevnina: hrbolaté ostrovy kolem uzlů (biomy) + spojnice
  const land = (cx, cy, rx, ry, cols, seed) => {
    const rr = pxRng(seed);
    const bumps = Array.from({ length: 12 }, () => 0.82 + rr() * 0.3);
    for (let y = Math.floor(cy - ry * 1.25); y <= cy + ry * 1.25; y++) for (let x = Math.floor(cx - rx * 1.25); x <= cx + rx * 1.25; x++){
      const a = Math.atan2((y - cy) / ry, (x - cx) / rx), k = bumps[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 12) % 12];
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) / k;
      if (d > 1.06) continue;
      if (d > 1){ if ((x + y) % 2 === 0) dot(x, y, '#e8d8a0'); continue; }                 // písek u břehu (dither)
      if (d > 0.93){ dot(x, y, '#e8d8a0'); continue; }
      const n = (x * 3 + y * 5 + Math.floor(rr() * 3)) % 7;
      dot(x, y, d < 0.55 ? cols[0] : n === 0 ? cols[2] : cols[1]);
    }
  };
  land(200, 170, 165, 118, ['#5aa850', '#4a9a48', '#3a7a3a'], 3);                        // hlavní kontinent
  land(70, 52, 52, 30, ['#f4f4fa', '#e4e8f4', '#c8d0e4'], 5);                            // Nebeská říše – oblaka
  land(150, 250, 52, 30, ['#f0d080', '#e0b858', '#c89a40'], 7);                          // poušť
  land(236, 226, 44, 32, ['#2e8a3e', '#22702e', '#185a24'], 9);                          // džungle
  land(300, 170, 34, 26, ['#6a6a7a', '#5a5a6a', '#4a4a58'], 11);                         // hřbitov
  land(360, 230, 34, 30, ['#e8eef8', '#c8d4e8', '#a0b0c8'], 13);                         // hory
  land(352, 112, 34, 28, ['#4a5070', '#3a4060', '#2a3050'], 15);                         // bouře
  land(268, 92, 36, 28, ['#8a3a2a', '#6a2a20', '#4a1a14'], 17);                          // sopka
  land(186, 128, 34, 26, ['#5a2a7a', '#4a1e6a', '#36145a'], 19);                         // nether
  land(104, 136, 34, 28, ['#7a2a1e', '#5a1e16', '#3a1410'], 21);                         // zpustošená země
  // detaily biomů
  const tri = (x, y, h, cA, cB, snow) => { for (let i = 0; i < h; i++) for (let k = -i; k <= i; k++) dot(x + k, y + i, i < 2 && snow ? '#ffffff' : k < 0 ? cA : cB); };
  for (const [x, y] of [[346, 216], [364, 226], [378, 212], [352, 238]]) tri(x, y, 9, '#ffffff', '#b8c4d8', true);         // hory
  tri(268, 78, 13, '#a04030', '#702418'); for (let i = 0; i < 4; i++) dot(267 + i % 2, 77 - i, '#ff9040');               // sopka + kouř
  for (const [x, y] of [[226, 216], [244, 222], [232, 236], [250, 232], [220, 230]]) { P.ellipse(x, y, 4, 3, '#1a5a24'); dot(x - 1, y - 1, '#3aaa48'); }   // stromy
  for (const [x, y] of [[292, 164], [304, 172], [298, 180], [310, 162]]){ g.fillStyle = '#c8c8d8'; g.fillRect(x, y, 3, 4); dot(x + 1, y - 1, '#c8c8d8'); }   // náhrobky
  for (const [x, y] of [[140, 244], [158, 254], [164, 240]]){ tri(x, y, 5, '#f8e098', '#d8b060'); }                     // pyramidy / duny
  for (let i = 0; i < 30; i++){ const x = 330 + r() * 46, y = 92 + r() * 36; dot(x, y, '#fff27a'); }                    // blesky v bouři
  for (let i = 0; i < 24; i++){ const x = 160 + r() * 52, y = 108 + r() * 40; dot(x, y, '#e090ff'); }                  // nether jiskry
  for (let i = 0; i < 26; i++){ const x = 82 + r() * 44, y = 120 + r() * 34; dot(x, y, '#80ff60'); }                   // fel pukliny
  // tečkované cesty mezi arénami
  for (let i = 0; i < ARENA_ORDER.length - 1; i++){
    const pts = mapPathPoints(ARENA_ORDER[i], ARENA_ORDER[i + 1]);
    pts.forEach(([x, y], k) => { if (k % 2 === 0){ g.fillStyle = '#3a2a18'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 4); g.fillStyle = '#f4e8c0'; g.fillRect(Math.round(x), Math.round(y), 2, 2); } });
  }
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
    disc(n.x, n.y, 5, st.locked ? '#5a5a66' : n.col, '#141018');
    disc(n.x - 1, n.y - 1, 1, st.locked ? '#7a7a86' : '#ffffff');
    if (st.locked){ mctx.fillStyle = '#2a2a32'; mctx.fillRect(n.x - 2, n.y - 1, 5, 4); mctx.fillRect(n.x - 1, n.y - 3, 1, 2); mctx.fillRect(n.x + 1, n.y - 3, 1, 2); }
    if (st.boss){ for (const [x, y] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1]]) dot(n.x + 7 + x, n.y - 6 + y, '#f2c230'); }
    if (st.track && Math.floor(now / 400) % 2){ mctx.fillStyle = '#ff5a4a'; mctx.fillRect(n.x - 9, n.y - 11, 2, 5); mctx.fillRect(n.x - 9, n.y - 5, 2, 2); }
    if (st.legend && Math.floor(now / 300) % 2){ for (const [x, y] of [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]) dot(n.x - 10 + x, n.y + 7 + y, '#e070ff'); }
  }
  // výběr (blikající rámeček) a hráč
  if (mapMode === 'browse'){
    const n = MAP_NODES[mapSel], o = 9 + (Math.floor(now / 250) % 2);
    for (let i = 0; i < 48; i++){ const a = i / 48 * Math.PI * 2; if (i % 4 < 3) dot(n.x + Math.cos(a) * o, n.y + Math.sin(a) * o, '#ffe066'); }
  }
  const p = mapDot || MAP_NODES[arena];
  disc(p.x, p.y - 7, 2.5, Math.floor(now / 300) % 2 ? '#ff3a3a' : '#ffffff', '#141018');
  dot(p.x, p.y - 3, '#141018'); dot(p.x, p.y - 4, '#ff3a3a');
  requestAnimationFrame(drawMap);
}
function placeTag(k){
  const tag = mapView.querySelector('.map-tag'), n = MAP_NODES[k], r = mapCanvas.getBoundingClientRect(), vr = mapView.getBoundingClientRect();
  const sx = r.width / MAP_W, sy = r.height / MAP_H;
  tag.textContent = ARENAS[k].name;
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
  const i = ARENA_ORDER.indexOf(mapSel);
  mapSel = ARENA_ORDER[(i + d + ARENA_ORDER.length) % ARENA_ORDER.length];
  beep(900, 0.03, 0.02);
  renderMapPanel();
}
mapPanel.addEventListener('click', (e) => {
  const a = e.target.closest('[data-map]')?.dataset.map;
  if (!a || e.target.closest('[disabled]')) return;
  if (a === 'prev') mapStep(-1);
  if (a === 'next') mapStep(1);
  if (a === 'go') travelTo(mapSel);
  if (a === 'close') closeMap();
});
mapCanvas.addEventListener('click', (e) => {
  if (mapMode !== 'browse') return;
  const r = mapCanvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MAP_W, y = (e.clientY - r.top) / r.height * MAP_H;
  let best = null, bd = 22;
  for (const k of ARENA_ORDER){ const n = MAP_NODES[k], d = Math.hypot(n.x - x, n.y - y); if (d < bd){ bd = d; best = k; } }
  if (best){ mapSel = best; renderMapPanel(); }
});

/* ---------- Cestování: tečka jde po cestách (přes mezilehlé arény), pak prolnutí ---------- */
let traveling = false;
async function travelTo(key){
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
