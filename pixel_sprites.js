/* =====================================================================
   Pixelové sprity kreslené kódem: pokébally, mince a trenér
   ---------------------------------------------------------------------
   Stejný přístup jako arény: všechno na celé pixely, světlo zleva shora,
   ostré pásy stínu (světlo / základ / stín) a tmavé obrysy.
   ===================================================================== */

const PX_LIGHT = (() => { const v = [-0.5, -0.7, 0.55], l = Math.hypot(...v); return v.map(c => c / l); })();

function pxHex(c){
  const n = parseInt(c.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255, 255];
}

// ze 2D normály (nx, ny ∈ −1…1) vybere pás z palety [světlo, základ, stín]
function pxShade(pal, nx, ny, hi = 0.72, lo = 0.2){
  const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const d = nx * PX_LIGHT[0] + ny * PX_LIGHT[1] + z * PX_LIGHT[2];
  return d > hi ? pal[0] : d > lo ? pal[1] : pal[2];
}

/* ---------- Pokébally ----------
   Každý typ: barvy vršku [světlo, základ, stín] a dekor (pruhy, H, písmeno M).
   Dekor dostává u, v ∈ 0–1 (pozice v ballu) a vrací paletu nebo null. */
const BALL_TYPES = {
  poke: {
    name: 'Poké Ball',
    top: ['#ff8a78', '#e83a3a', '#a01f2e'],
  },
  great: {
    name: 'Great Ball',
    top: ['#7ab4ff', '#3a74d8', '#22468e'],
    decor: (u, v) => (u < 0.31 || u > 0.69) && v > 0.17 && v < 0.44 ? ['#ff8a78', '#e83a3a', '#a01f2e'] : null,
  },
  ultra: {
    name: 'Ultra Ball',
    top: ['#4a4a58', '#2a2a34', '#16161c'],
    decor: (u, v) => ((u > 0.19 && u < 0.35) || (u > 0.65 && u < 0.81)) && v > 0.1 ? ['#fff2a0', '#f2c230', '#b8860e'] : null,
  },
  master: {
    name: 'Master Ball',
    top: ['#b07ae8', '#7a3ab8', '#4a1e78'],
    decor: (u, v) => {
      if (Math.hypot(u - 0.23, v - 0.3) < 0.1 || Math.hypot(u - 0.77, v - 0.3) < 0.1) return ['#ffb0e0', '#e060b8', '#a83088'];
      // písmeno M (5 × 4 políčka) uprostřed vršku
      const gx = Math.floor((u - 0.35) / 0.3 * 5), gy = Math.floor((v - 0.13) / 0.24 * 4);
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 4 && '10001110111010110001'[gy * 5 + gx] === '1') return ['#ffffff', '#ffffff', '#e8e0f0'];
      return null;
    },
  },
};
const BALL_OUT = '#16121e';
const BALL_WHITE = ['#ffffff', '#e8e8f0', '#a8a8c0'];

// barva pixelu (x, y) ballu velikosti size, nebo null = průhledný
function pxBallPixel(type, size, x, y){
  const def = BALL_TYPES[type] || BALL_TYPES.poke;
  const r = size / 2;
  const dx = x + 0.5 - r, dy = y + 0.5 - r, d = Math.hypot(dx, dy);
  if (d > r - 0.1) return null;
  if (d > r - 1.1) return BALL_OUT;
  const band = Math.max(1, size * 0.07);
  if (Math.abs(dy) < band) return d < size * 0.2 ? (d < size * 0.13 ? '#ffffff' : BALL_OUT) : BALL_OUT;
  if (d < size * 0.2) return d < size * 0.13 ? '#f4f4fa' : BALL_OUT;      // tlačítko uprostřed
  const u = (x + 0.5) / size, v = (y + 0.5) / size;
  if (Math.hypot(u - 0.3, v - 0.26) < 0.07) return '#ffffff';            // odlesk
  if (dy > 0) return pxShade(BALL_WHITE, dx / r, dy / r, 0.62, -0.15);
  return pxShade(def.decor?.(u, v) || def.top, dx / r, dy / r, 0.78, 0.25);
}

// plátno s ballem (1 pixel = 1 pixel)
function pxBallCanvas(type, size = 16){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    const col = pxBallPixel(type, size, x, y);
    if (col){ ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  }
  return c;
}

// pixelová mince (měna) – zlatá s vyraženým kroužkem
function pxCoinCanvas(size = 10){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), r = size / 2;
  const gold = ['#fff2a8', '#f2c230', '#a87b12'];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    const dx = x + 0.5 - r, dy = y + 0.5 - r, d = Math.hypot(dx, dy);
    if (d > r - 0.1) continue;
    let col = d > r - 1.1 ? '#5a3a08' : pxShade(gold, dx / r, dy / r, 0.75, 0.2);
    if (d > r * 0.45 && d < r * 0.45 + 1 && d <= r - 2) col = gold[2];   // vyražený kroužek
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/* ---------- Trenér (zezadu, chibi proporce jako v Pokémon Black/White) ----------
   Červená kšiltovka (zapínání vzadu, kšilt vykukuje dopředu), světle hnědé rozcuchané
   vlasy, černá mikina se staženou kapucí, žlutý batoh, džíny, červené tenisky.
   Každý materiál má 3 tóny + vlastní tmavou linku (selektivní obrys místo černé).
   Snímky: 2× idle (dýchání), 2× nápřah, hod, dohoz. Ball v ruce je typ, kterým se loví. */
const TRAINER_W = 56, TRAINER_H = 84;
const TRAINER_PAL = {
  hoodie: ['#5a5a70', '#30303e', '#1e1e28', '#0e0e14'],
  hood:   ['#7a7a90', '#4c4c5c', '#30303c', '#14141a'],
  pack:   ['#ffd877', '#e9a83a', '#a8681a', '#4e2e08'],
  strap:  ['#b07a2a', '#7a4e14', '#4e2e08', '#2e1a04'],
  hair:   ['#f8dcaa', '#dcae72', '#a8783e', '#5e3c18'],
  skin:   ['#ffe4cf', '#f2c4a0', '#cc9474', '#7a4a32'],
  cap:    ['#ff7a68', '#dc3432', '#962030', '#4e0c16'],
  jeans:  ['#7a8cc4', '#4a5c96', '#2e3a6a', '#141c38'],
  shoe:   ['#ff7a6a', '#d63a34', '#8e1e26', '#4a0c12'],
  sole:   ['#ffffff', '#e2e2ec', '#a8a8bc', '#5a5a6a'],
};
// pózy pravé (házecí) ruky: loket, dlaň, ball (null = už hozený); up = nádech (horní polovina o pixel dolů)
const TRAINER_POSES = {
  idle:   { elbow: [41, 57], hand: [41, 63], ball: [43, 62], up: 0 },
  idle2:  { elbow: [41, 58], hand: [41, 64], ball: [43, 63], up: 1 },
  wind1:  { elbow: [45, 45], hand: [43, 36], ball: [43, 32], up: 0 },
  wind2:  { elbow: [44, 43], hand: [39, 34], ball: [38, 30], up: 0 },
  throw:  { elbow: [46, 45], hand: [51, 38], ball: null, up: 0 },
  follow: { elbow: [45, 53], hand: [50, 57], ball: null, up: 1 },
};
const TRAINER_RELEASE = [52, 36];   // kde ball opouští ruku (v pixelech spritu)

function pxTrainerFrame(pose, ballType){
  const W = TRAINER_W, H = TRAINER_H, P = TRAINER_PAL;
  const buf = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, col) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b, a] = pxHex(col), i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  let dy = 0;
  const shade = (pal, nx, ny) => pxShade(pal, nx, ny, 0.7, 0.18);
  // elipsa: výplň se stínováním + linka v tmavém tónu materiálu; clip(y) omezí kreslení
  const ellipse = (cx, cy, rx, ry, pal, o = {}) => {
    cy += dy;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++){
      if (o.clip && !o.clip(x, y - dy)) continue;
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, shade(pal, nx, ny));
      else if (o.line !== false && ((x + 0.5 - cx) / (rx + 1)) ** 2 + ((y + 0.5 - cy) / (ry + 1)) ** 2 <= 1) put(x, y, pal[3]);
    }
  };
  const capsule = (x1, y1, x2, y2, r, pal, o = {}) => {
    y1 += dy; y2 += dy;
    const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - r - 2); y <= Math.max(y1, y2) + r + 2; y++)
      for (let x = Math.floor(Math.min(x1, x2) - r - 2); x <= Math.max(x1, x2) + r + 2; x++){
        const px = x + 0.5, py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / L2));
        const ex = px - (x1 + vx * t), ey = py - (y1 + vy * t), d = Math.hypot(ex, ey);
        if (d <= r) put(x, y, shade(pal, ex / r, ey / r));
        else if (o.line !== false && d <= r + 1) put(x, y, pal[3]);
      }
  };
  const box = (x0, y0, x1, y1, pal, o = {}) => {
    y0 += dy; y1 += dy;
    const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2 + 0.5;
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++){
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (inside) put(x, y, o.flat || shade(pal, (x - cx) / hw * 0.9, o.ny ?? -0.1));
      else if (o.line !== false) put(x, y, pal[3]);
    }
  };
  const merged = draw => { draw(true); draw(false); };   // víc tvarů = jedna silueta (linka jen kolem)

  // nohy a tenisky
  merged(l => { capsule(21, 66, 21, 76, 3.6, P.jeans, { line: l }); capsule(33, 66, 33, 76, 3.6, P.jeans, { line: l }); });
  ellipse(21, 79, 4.6, 2.8, P.shoe); ellipse(33, 79, 4.6, 2.8, P.shoe);
  for (const sx of [21, 33]) for (let x = sx - 4; x <= sx + 4; x++) put(x, 81, x === sx - 4 || x === sx + 4 ? P.sole[3] : P.sole[1]);

  dy = pose.up;
  // levá ruka (u těla) a mikina
  capsule(15, 50, 13, 61, 3.3, P.hoodie);
  ellipse(13, 63.5, 2.3, 2.2, P.skin);
  merged(l => { ellipse(27, 55, 13, 10, P.hoodie, { line: l }); box(15, 56, 39, 66, P.hoodie, { line: l }); });
  for (let x = 15; x <= 39; x++) put(x, 65 + dy, P.hoodie[0]);                 // lem
  for (let x = 15; x <= 39; x++) put(x, 66 + dy, P.hoodie[2]);
  // stažená kapuce za krkem
  ellipse(27, 45.5, 9, 3.6, P.hood);
  for (let x = 21; x <= 33; x++) put(x, 45 + dy, P.hood[2]);                  // záhyb
  // batoh: popruhy přes ramena, tělo, kapsa, klopa
  capsule(18.5, 46, 18, 52, 1.3, P.strap); capsule(35.5, 46, 36, 52, 1.3, P.strap);
  merged(l => { ellipse(27, 53, 9, 4, P.pack, { line: l }); box(18, 53, 36, 65, P.pack, { line: l }); });
  for (let x = 19; x <= 35; x++) put(x, 56 + dy, P.pack[2]);                   // okraj klopy
  for (let x = 20; x <= 34; x++) put(x, 55 + dy, P.pack[0]);
  box(21, 59, 33, 64, P.pack, { flat: P.pack[1] });                             // kapsa
  for (let x = 21; x <= 33; x++) put(x, 59 + dy, P.pack[0]);
  put(27, 57 + dy, P.strap[0]); put(27, 58 + dy, P.strap[1]);                   // přezka
  // hlava: vlasy, ucho, kšiltovka
  ellipse(39.5, 31, 2, 3, P.skin);
  merged(l => {
    ellipse(27, 30, 12, 9.5, P.hair, { line: l });
    for (const [x, len, tilt] of [[19, 2, -1], [24, 4, -0.5], [30, 4, 0.8], [35, 2, 1]]) capsule(x, 36, x + tilt, 36 + len, 1.8, P.hair, { line: l });   // krátké rozcuchané prameny
    capsule(15.5, 29, 14.5, 33, 1.6, P.hair, { line: l });                                                 // pramen u ucha
  });
  ellipse(27, 23, 13, 9.5, P.cap, { clip: (x, y) => y <= 26 });
  for (let x = 14; x <= 40; x++) put(x, 27 + dy, P.cap[3]);                     // spodní hrana čepice
  ellipse(27, 25, 4, 2, P.hair, { line: false, clip: (x, y) => y <= 26 });      // otvor vzadu, prosvítají vlasy
  for (let x = 23; x <= 31; x++) put(x, 24 + dy, P.cap[3]);                     // zapínání
  put(27, 14 + dy, P.cap[0]); put(26, 14 + dy, P.cap[1]); put(28, 14 + dy, P.cap[1]);   // knoflík nahoře
  capsule(37, 26, 44, 25, 1.5, P.cap);                                          // kšilt dopředu vpravo

  // pravá ruka podle pózy + ball v dlani
  const { elbow, hand, ball } = pose, S = [38, 50];
  const drawBall = () => {
    if (!ball) return;
    const n = 7, d = pxBallCanvas(ballType, n).getContext('2d').getImageData(0, 0, n, n).data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
      const i = (y * n + x) * 4;
      if (d[i + 3]) put(ball[0] - 3 + x, ball[1] - 3 + y + dy, '#' + [d[i], d[i + 1], d[i + 2]].map(c => c.toString(16).padStart(2, '0')).join(''));
    }
  };
  const ballBehind = ball && ball[1] < hand[1];
  capsule(S[0], S[1], elbow[0], elbow[1], 3.4, P.hoodie);
  capsule(elbow[0], elbow[1], hand[0], hand[1], 3, P.hoodie);
  if (ballBehind) drawBall();
  ellipse(hand[0], hand[1], 2.4, 2.3, P.skin);
  if (!ballBehind) drawBall();
  return buf;
}

// sprite trenéra ve stejném tvaru jako rozložený GIF pokémona (viz loadGifSprite v index.html);
// shadowFn(data, W, H) dodá vržený stín (projectShadow z index.html), jinak bez stínu
function pxTrainerSprite(ballType = 'poke', shadowFn = null){
  const order = ['idle', 'idle2', 'wind1', 'wind2', 'throw', 'follow'];
  const data = order.map(k => pxTrainerFrame(TRAINER_POSES[k], ballType));
  const frames = data.map(d => {
    const c = document.createElement('canvas');
    c.width = TRAINER_W; c.height = TRAINER_H;
    c.getContext('2d').putImageData(new ImageData(d, TRAINER_W, TRAINER_H), 0, 0);
    return c;
  });
  const empty = document.createElement('canvas');
  empty.width = empty.height = 1;
  const delays = [700, 700, 110, 130, 90, 260];
  return {
    W: TRAINER_W, H: TRAINER_H, frames, data, delays,
    shadows: data.map(d => shadowFn ? shadowFn(d, TRAINER_W, TRAINER_H) : empty),
    idle: [0, 1], action: [2, 5], method: 'trenér',
    releaseMs: delays[2] + delays[3],          // ball se pustí na začátku snímku "throw"
  };
}

/* ---------- Záře reflektoru (jako výběr startéra v Pokémon Black/White) ----------
   Tmavě šedé pozadí, kužel světla shora a světlá louže na zemi, kde pokémon stojí.
   Okraje kuželu a louže jsou ditherované (šachovnice), ať to drží pixelový styl.
   tint = barva, do které se scéna ladí (typ pokémona nebo vzácnost výhry). */
const SPOT_W = 192, SPOT_H = 100, SPOT_FLOOR = 62, SPOT_POOL = [96, 84, 50, 11];
const spotCache = new Map();

function pxMixHex(a, b, k){
  const A = pxHex(a), B = pxHex(b);
  return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * k).toString(16).padStart(2, '0')).join('');
}

function pxSpotlight(tint = '#e8a050'){
  if (spotCache.has(tint)) return spotCache.get(tint);
  const W = SPOT_W, H = SPOT_H, [px, py, prx, pry] = SPOT_POOL;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const dot = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  const checker = (x, y) => (x + y) % 2 === 0;
  const C = {
    // tmavě šedé pozadí, barvu má jen světlo
    wallTop: '#18181e', wall: '#222228', floorFar: '#2a2a31', floor: '#303038',
    cone: pxMixHex(tint, '#fff4d8', 0.42), coneCore: pxMixHex(tint, '#fffaf0', 0.6),
    pool: pxMixHex(tint, '#fff8e8', 0.62), poolHi: pxMixHex(tint, '#ffffff', 0.8),
  };
  // stěna (tmavší nahoře) a podlaha
  for (let y = 0; y < H; y++){
    const col = y < SPOT_FLOOR ? (y < SPOT_FLOOR * 0.45 ? C.wallTop : C.wall) : (y < SPOT_FLOOR + 8 ? C.floorFar : C.floor);
    ctx.fillStyle = col; ctx.fillRect(0, y, W, 1);
    // dithering na přechodu barev stěny
    if (y >= SPOT_FLOOR * 0.45 - 3 && y < SPOT_FLOOR * 0.45) for (let x = 0; x < W; x++) if (checker(x, y)) dot(x, y, C.wall);
  }
  for (let x = 0; x < W; x++) dot(x, SPOT_FLOOR, pxMixHex(C.wall, '#000000', 0.25));   // hrana stěny a podlahy
  // kužel světla: úzký nahoře, široký u louže; jádro plné, okraj ditherovaný
  for (let y = 0; y <= py; y++){
    const t = y / py, half = 13 + (prx - 4 - 13) * t;
    for (let x = 0; x < W; x++){
      const d = Math.abs(x + 0.5 - px) / half;
      if (d < 0.62) dot(x, y, d < 0.3 && y > 6 ? C.coneCore : C.cone);
      else if (d < 0.82 ? true : d < 1 && checker(x, y)) dot(x, y, d < 0.82 ? C.cone : C.cone);
    }
  }
  // louže světla na zemi
  for (let y = py - pry - 1; y <= py + pry + 1; y++) for (let x = px - prx - 1; x <= px + prx + 1; x++){
    const d = Math.hypot((x + 0.5 - px) / prx, (y + 0.5 - py) / pry);
    if (d < 0.55) dot(x, y, C.poolHi);
    else if (d < 0.85) dot(x, y, C.pool);
    else if (d < 1 && checker(x, y)) dot(x, y, C.pool);
    else if (d < 1.12 && checker(x, y + 1) && (x % 4 < 2)) dot(x, y, C.cone);
  }
  // prach ve světle
  const r = pxRng(7);
  for (let i = 0; i < 14; i++){
    const y = Math.floor(r() * (py - 10)) + 4, half = 13 + (prx - 17) * (y / py);
    dot(Math.round(px + (r() * 2 - 1) * half * 0.8), y, C.poolHi);
  }
  const url = c.toDataURL();
  spotCache.set(tint, url);
  return url;
}

/* ---------- Ikony pro navigaci (12 × 12, obrys se dokreslí automaticky) ---------- */
const ICON_OUT = '#0b0b14';
function pxIcon(paint, size = 12){
  const c = document.createElement('canvas');
  c.width = c.height = size + 2;
  const ctx = c.getContext('2d');
  const cols = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cols.push(paint(x, y, x + 0.5 - size / 2, y + 0.5 - size / 2));
  const at = (x, y) => x >= 0 && y >= 0 && x < size && y < size ? cols[y * size + x] : null;
  for (let y = -1; y <= size; y++) for (let x = -1; x <= size; x++){
    const col = at(x, y) || (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) ? ICON_OUT : null);
    if (col){ ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, 1, 1); }
  }
  return c;
}
const NAV_ICONS = {
  // tým = pokéball
  team: () => pxBallCanvas('poke', 14),
  // deník = červený Pokédex s modrou čočkou
  dex: () => pxIcon((x, y) => {
    if (x < 1 || x > 10 || y < 0 || y > 11) return null;
    if (Math.hypot(x - 3.5, y - 2.5) < 1.6) return Math.hypot(x - 3, y - 2) < 0.8 ? '#d8f0ff' : '#4a9ef0';
    if (y === 5) return ICON_OUT;
    if (x === 1) return '#8e2430';
    if (y > 7 && y < 10 && x > 3 && x < 9) return '#2a2a34';
    return x < 4 && y < 5 ? '#f0705f' : '#d13b3b';
  }),
  // obchod = zlatá mince
  shop: () => pxCoinCanvas(14),
  // aréna = hora s vlajkou
  arena: () => pxIcon((x, y) => {
    if (x === 6 && y <= 3) return '#e8e8f0';                       // stožár
    if (y <= 1 && x > 6 && x < 10) return '#e83a3a';                // vlajka
    const half = (y - 3) * 0.75;
    if (y < 4 || Math.abs(x + 0.5 - 6.5) > half + 0.5) return null;
    if (y < 6) return '#ffffff';                                      // sníh
    return x + 0.5 < 6.5 ? '#9a9ab8' : '#6a6a88';
  }),
  // nastavení = ozubené kolo
  settings: () => pxIcon((x, y, dx, dy) => {
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < 1.7) return null;
    const tooth = Math.cos(a * 8) > 0.35;
    if (d < 3.9 || (tooth && d < 5.6)) return pxShade(['#e8e8f4', '#b0b0c8', '#70708c'], dx / 6, dy / 6);
    return null;
  }),
};

/* ---------- Ikony předmětů (obchod, batoh, Tým) ---------- */
const STONE_COLORS = {
  'fire-stone': ['#ffb070', '#f06a2a', '#a8381a'], 'water-stone': ['#9ad8ff', '#3a8ee8', '#1e4e9a'],
  'thunder-stone': ['#fff2a0', '#e8c830', '#8a8a20'], 'leaf-stone': ['#b8f0a0', '#4ab84a', '#24703a'],
  'moon-stone': ['#c8c8e0', '#7a7a9a', '#3e3e58'], 'sun-stone': ['#ffd8a0', '#f09a3a', '#a85a1a'],
  'shiny-stone': ['#ffffff', '#d8e0f0', '#9aa8c8'], 'dusk-stone': ['#b08ad8', '#5a3a8a', '#2a1a48'],
  'dawn-stone': ['#c8f0ff', '#7ad0e8', '#3a8aa8'], 'ice-stone': ['#e8ffff', '#9ae0f0', '#4a9ab8'],
  'oval-stone': ['#fff8e8', '#e8dcc0', '#a89a78'],
};
function pxItemIcon(key){
  if (STONE_COLORS[key]){
    const pal = STONE_COLORS[key];
    return pxIcon((x, y, dx, dy) => {
      const d = (dx / 5) ** 2 + ((dy + 0.5) / 5.5) ** 2 + Math.abs(dx * dy) * 0.012;
      if (d > 1) return null;
      if (Math.hypot(dx + 2, dy + 2.5) < 1.3) return '#ffffff';
      return pxShade(pal, dx / 5, dy / 5.5, 0.7, 0.2);
    });
  }
  if (key === 'potion') return pxIcon((x, y, dx, dy) => {
    if (y < 2) return x > 4 && x < 7 ? '#e8e8f0' : null;                              // víčko
    if (y < 4) return x > 3 && x < 8 ? '#a8a8c0' : null;
    if (Math.abs(dx) > 4.5) return null;
    return y < 6 ? '#d8d0ff' : pxShade(['#e8a0ff', '#a84ad8', '#6a2290'], dx / 5, (dy - 2) / 4);
  });
  if (key === 'revive') return pxIcon((x, y, dx, dy) => {
    const d = Math.abs(dx) + Math.abs(dy);
    if (d > 5.6) return null;
    return d < 2.2 ? '#ffffff' : pxShade(['#fff6a0', '#f2c230', '#a87b12'], dx / 5, dy / 5);
  });
  if (key === 'candy') return pxIcon((x, y, dx, dy) => {
    if (Math.abs(dy) < 1.6 && Math.abs(dx) > 3 && Math.abs(dx) < 6) return '#7ab4ff';  // obal
    if (Math.hypot(dx, dy) > 3.4) return null;
    return Math.abs(dx - dy) < 1 ? '#ffffff' : pxShade(['#9ad0ff', '#3a74d8', '#22468e'], dx / 3.4, dy / 3.4);
  });
  if (key === 'cable') return pxIcon((x, y, dx, dy) => {
    if (Math.abs(Math.hypot(dx, dy) - 3.6) < 0.8 && !(dx > 2 && dy > 0)) return '#5a6a8a';      // smyčka kabelu
    if (x >= 8 && x <= 11 && y >= 7 && y <= 10) return x === 11 ? '#c8c8d8' : '#e83a3a';          // konektor
    if (x >= 0 && x <= 2 && y >= 1 && y <= 4) return '#3a74d8';
    return null;
  });
  // předměty k výměně: malý barevný váček
  const hue = { 'kings-rock': '#f2c230', 'metal-coat': '#b0b0c8', 'dragon-scale': '#e86a6a', 'up-grade': '#6ab0f0',
    'protector': '#a07850', 'electirizer': '#f0d040', 'magmarizer': '#f07030', 'dubious-disc': '#c060c0',
    'reaper-cloth': '#7a5a9a', 'deep-sea-tooth': '#d8d8e8', 'deep-sea-scale': '#f0a0c0', 'prism-scale': '#a0e0ff',
    'razor-claw': '#e8e8f0', 'razor-fang': '#e8e8f0' }[key] || '#c0c0d0';
  return pxIcon((x, y, dx, dy) => {
    if (y < 3) return x > 3 && x < 8 ? (y === 2 ? '#7a5a3a' : '#a07850') : null;
    const d = Math.hypot(dx / 5, (dy - 1) / 4.6);
    if (d > 1) return null;
    return pxShade([pxMixHex(hue, '#ffffff', 0.4), hue, pxMixHex(hue, '#000000', 0.4)], dx / 5, (dy - 1) / 4.6);
  });
}

/* ---------- Portréty do dialogů (32 × 32, zepředu) ----------
   Hráč (červená kšiltovka, světle hnědé vlasy, černá mikina) a trenéři Team Rocket.
   Stejný styl jako trenér: 3 tóny na materiál + tmavá linka v odstínu materiálu. */
const PORTRAITS = {
  player:  { hair: ['#f8dcaa', '#dcae72', '#a8783e', '#5e3c18'], style: 'cap', hat: ['#ff7a68', '#dc3432', '#962030', '#4e0c16'],
             outfit: ['#5a5a70', '#30303e', '#1e1e28', '#0e0e14'], eyes: '#3a2a1a' },
  jessie:  { hair: ['#ff8ab0', '#e04a7a', '#a02852', '#4e0a24'], style: 'jessie', outfit: 'rocket', eyes: '#2a6a8a', lips: '#e04a6a', earring: '#4ad86a' },
  james:   { hair: ['#c8b8ff', '#8a78d8', '#5a4aa8', '#2a1e5a'], style: 'james', outfit: 'rocket', eyes: '#3a5a2a' },
  butch:   { hair: ['#8ae0a0', '#3aa868', '#1e6a3e', '#0a3018'], style: 'short', outfit: 'rocket-black', eyes: '#2a2a3a' },
  cassidy: { hair: ['#fff2a8', '#f2c84a', '#b88a1a', '#5a3e08'], style: 'puffy', outfit: 'rocket-black', eyes: '#6a2a8a', lips: '#e05a7a' },
  grunt:   { hair: ['#6a5a50', '#3e322c', '#241c18', '#0e0a08'], style: 'rocketcap', hat: ['#4a4a5a', '#24242e', '#141418', '#060608'],
             outfit: 'rocket-black', eyes: '#1a1a1a' },
};
function pxPortrait(key){
  const S = PORTRAITS[key] || PORTRAITS.grunt, N = 32;
  const buf = new Uint8ClampedArray(N * N * 4);
  const put = (x, y, col) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N || !col) return;
    const [r, g, b, a] = pxHex(col), i = (y * N + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const shade = (pal, nx, ny) => pxShade(pal, nx, ny, 0.7, 0.15);
  const ell = (cx, cy, rx, ry, pal, line = true, clip) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++){
      if (clip && !clip(x, y)) continue;
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, shade(pal, nx, ny));
      else if (line && ((x + 0.5 - cx) / (rx + 1)) ** 2 + ((y + 0.5 - cy) / (ry + 1)) ** 2 <= 1) put(x, y, pal[3]);
    }
  };
  const rect = (x0, y0, x1, y1, col) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, col); };
  const skin = ['#ffe4cf', '#f2c4a0', '#cc9474', '#7a4a32'];
  const rocket = S.outfit === 'rocket' ? ['#ffffff', '#e2e2ec', '#a8a8bc', '#4a4a5a'] : S.outfit === 'rocket-black' ? ['#5a5a6a', '#2c2c36', '#1a1a22', '#08080c'] : S.outfit;
  // ramena / oblečení
  ell(16, 34, 15, 7, rocket);
  if (S.outfit === 'player' || key === 'player'){ ell(16, 27.5, 7, 2.2, ['#7a7a90', '#4c4c5c', '#30303c', '#14141a']); }   // stažená kapuce
  if (S.outfit !== rocket || key !== 'player'){
    if (typeof S.outfit === 'string' && S.outfit.startsWith('rocket')){ // velké červené R na hrudi
      const R = ['111', '101', '110', '101'];
      R.forEach((row, y) => [...row].forEach((c, x) => c === '1' && put(14 + x, 28 + y, '#d82020')));
    }
  }
  // vlasy vzadu (dlouhé účesy)
  const H = S.hair;
  if (S.style === 'jessie'){ ell(16, 15, 13, 12, H); ell(26, 22, 5, 9, H); ell(27, 30, 4, 3, H); }
  if (S.style === 'puffy'){ ell(8, 20, 5, 7, H); ell(24, 20, 5, 7, H); }
  if (S.style === 'james'){ ell(16, 13, 11, 9, H); }
  // krk a hlava
  rect(14, 25, 18, 27, skin[2]);
  ell(7.5, 17, 1.6, 2.4, skin); ell(24.5, 17, 1.6, 2.4, skin);           // uši
  ell(16, 16.5, 8.2, 9.2, skin);
  // oči, obočí, nos, pusa
  for (const ex of [12, 20]){
    rect(ex - 1, 16, ex, 18, S.eyes); put(ex - 1, 16, '#ffffff');
    rect(ex - 2, 14, ex + 1, 14, H[3]);
  }
  put(16, 20, skin[2]);
  if (S.coat){                                                              // plášť (profesor): bílé klopy přes košili
    for (let y = 27; y < 32; y++){ rect(4, y, 12 - (y - 27), y, S.coat); rect(20 + (y - 27), y, 28, y, S.coat); }
  }
  if (S.beard) ell(16, 22.5, 5, 3, S.beard, false);
  rect(14, 23, 18, 23, S.lips || '#9a5a4a'); put(13, 22, S.lips || '#9a5a4a'); put(19, 22, S.lips || '#9a5a4a');
  if (S.earring){ put(7, 20, S.earring); put(25, 20, S.earring); }
  // vlasy vpředu / pokrývky hlavy
  if (S.style === 'cap' || S.style === 'rocketcap'){
    const hat = S.hat;
    ell(16, 9, 10, 6, hat, true, (x, y) => y <= 11);
    rect(5, 11, 27, 12, hat[2]); rect(4, 12, 28, 12, hat[3]);              // kšilt
    if (S.style === 'rocketcap') [[15, 6], [16, 6], [15, 7], [17, 7], [15, 8], [16, 8], [15, 9], [17, 9]].forEach(([x, y]) => put(x, y, '#e02828'));
    else rect(13, 6, 19, 9, '#ffffff');                                     // bílý předek čepice
    for (const [x, len] of [[8, 4], [10, 3], [22, 3], [24, 4]]) rect(x, 13, x + 1, 13 + len, H[1]);   // vlasy pod čepicí
    rect(13, 13, 14, 14, H[1]); rect(18, 13, 19, 14, H[1]);
  } else if (S.style === 'jessie'){
    ell(16, 9, 9, 5, H); ell(10, 11, 4, 3, H); ell(23, 10, 4, 4, H);
  } else if (S.style === 'james'){
    ell(14, 9, 9, 5, H); ell(9, 13, 3, 4, H); ell(21, 11, 5, 3, H);
  } else if (S.style === 'puffy'){
    ell(16, 8, 9, 5, H); ell(10, 11, 3, 3, H); ell(22, 11, 3, 3, H);
  } else {
    ell(16, 8.5, 9, 4.5, H); for (let x = 8; x <= 24; x += 3) rect(x, 11, x, 13, H[1]);
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  c.getContext('2d').putImageData(new ImageData(buf, N, N), 0, 0);
  return c;
}

/* ---------- Busty do dialogů (64 × 64) ----------
   Větší a podrobnější portréty: tvar obličeje s bradou, anime oči (duhovka, zornice,
   odlesk, linka řas), obočí podle povahy, účesy z několika vrstev (vzadu / vpředu),
   oblečení (uniforma Team Rocket s R, mikina, plášť). Selektivní obrysy jako u trenéra. */
const BUST_SKIN = ['#ffe6d2', '#f4c8a6', '#d29a78', '#7a4a32'];
const BUSTS = {
  player:  { accent: '#d83a3a', hair: ['#f8dcaa', '#dcae72', '#a8783e', '#5e3c18'], style: 'cap', hat: ['#ff7a68', '#dc3432', '#962030', '#4e0c16'], hatFront: '#ffffff',
             outfit: 'hoodie', eyes: '#5a3a1a', brow: 'calm', mouth: 'smile' },
  jessie:  { accent: '#e04a7a', hair: ['#ff9ac0', '#e8508a', '#a82a5a', '#4e0a26'], style: 'jessie', outfit: 'rocketW', eyes: '#2a7aa8', brow: 'smug', mouth: 'smirk', lips: '#d83a5a', earring: '#4ad86a' },
  james:   { accent: '#8a78d8', hair: ['#d4c8ff', '#9484e0', '#5c4caa', '#26195a'], style: 'james', outfit: 'rocketW', eyes: '#3a7a3a', brow: 'smug', mouth: 'smirk', rose: true },
  butch:   { accent: '#3aa868', hair: ['#9aecb0', '#40b070', '#1e6a3e', '#0a3018'], style: 'butch', outfit: 'rocketB', eyes: '#2a2a3a', brow: 'angry', mouth: 'frown' },
  cassidy: { accent: '#f2c84a', hair: ['#fff4b0', '#f4cc50', '#b88a1a', '#5a3e08'], style: 'cassidy', outfit: 'rocketB', eyes: '#7a2a9a', brow: 'smug', mouth: 'smirk', lips: '#d84a6a' },
  grunt:   { accent: '#5a5a6a', hair: ['#7a6a5a', '#4a3a30', '#2a201a', '#0e0a08'], style: 'cap', hat: ['#5a5a6a', '#2c2c36', '#18181e', '#060608'], hatFront: null, hatR: true,
             outfit: 'rocketB', eyes: '#1a1a1a', brow: 'angry', mouth: 'frown' },
  prof:    { accent: '#3aa8a0', hair: ['#f4f4f8', '#cfcfdc', '#8e8ea0', '#3a3a48'], style: 'prof', outfit: 'coat', eyes: '#4a3a2a', brow: 'calm', mouth: 'smile', wrinkle: true },
  l_ocean:   { accent: '#3a8ee8', hair: ['#a4dcff', '#3a8ee8', '#1e4e9a', '#0a2050'], style: 'long', outfit: ['#5a7ac0', '#2e4888', '#1a2c56', '#0a142c'], eyes: '#1a5aa8', brow: 'calm', mouth: 'smile', lips: '#e07080' },
  l_desert:  { accent: '#c8a868', hair: ['#c89a6a', '#8a5e34', '#5a3a1a', '#2a1808'], style: 'cap', hat: ['#f0dcb0', '#cfae70', '#8a6a3a', '#4a3418'], hatFront: null,
               outfit: ['#e0c088', '#b08e50', '#6e5428', '#342408'], eyes: '#3a2a1a', brow: 'calm', mouth: 'smile' },
  l_jungle:  { accent: '#6ab06a', hair: ['#a888c8', '#664088', '#3e2256', '#1a0a2c'], style: 'cassidy', outfit: ['#78bc78', '#3e823e', '#245424', '#0e2a0e'], eyes: '#b02a2a', brow: 'smug', mouth: 'smirk', lips: '#8a3a5a' },
  l_mountain:{ accent: '#7ab4e8', hair: ['#ffffff', '#dce8f4', '#a0b4c8', '#4a5a6a'], style: 'prof', outfit: ['#aad6f4', '#5e9ed4', '#2c5c8c', '#0e2a48'], eyes: '#2a4a6a', brow: 'calm', mouth: 'smile', beard: true },
  l_grave:   { accent: '#9a4ae0', hair: ['#8a6aaa', '#42285a', '#261634', '#0c0614'], style: 'long', outfit: ['#664488', '#40245a', '#261434', '#0c0614'], eyes: '#d040d0', brow: 'calm', mouth: 'flat', lips: '#6a2a5a' },
  l_storm:   { accent: '#f2c230', hair: ['#606070', '#30303c', '#1c1c24', '#08080c'], style: 'cap', hat: ['#fff27a', '#f2c230', '#a87b12', '#4a3408'], hatFront: null,
               outfit: ['#5272b8', '#2e3e80', '#1a2452', '#080c28'], eyes: '#2a2a3a', brow: 'smug', mouth: 'smile' },
  l_volcano: { accent: '#e0502a', hair: ['#ffa070', '#e2522a', '#a42c14', '#4a0e06'], style: 'butch', outfit: ['#ffb474', '#e07c2a', '#a24c14', '#4a1e06'], eyes: '#2a1a0a', brow: 'angry', mouth: 'smile', beard: true },
  l_nether:  { accent: '#9a4ae0', hair: ['#dca4ff', '#9c4ce2', '#5c2aa2', '#240a4a'], style: 'james', outfit: ['#504060', '#2e2240', '#1a1028', '#08040e'], eyes: '#e050e0', brow: 'calm', mouth: 'flat' },
  l_fel:     { accent: '#9aa0b4', hair: ['#d4d8e4', '#9ea4b8', '#5c6276', '#24283a'], style: 'butch', outfit: ['#b4b8cc', '#7e8298', '#4c5064', '#1e2030'], eyes: '#3a3a4a', brow: 'angry', mouth: 'flat' },
  l_aether:  { accent: '#f2d26a', hair: ['#fff8d0', '#f4d670', '#b8962a', '#5a440a'], style: 'long', outfit: ['#ffffff', '#f2ecd8', '#c8bc96', '#5a5038'], eyes: '#3a7ac8', brow: 'calm', mouth: 'smile', lips: '#e08a9a' },
};
function pxBust(key){
  const S = BUSTS[key] || BUSTS.grunt, N = 64, H = S.hair;
  const buf = new Uint8ClampedArray(N * N * 4);
  const put = (x, y, col) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N || !col) return;
    const [r, g, b, a] = pxHex(col), i = (y * N + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const shade = (pal, nx, ny) => pxShade(pal, nx, ny, 0.68, 0.12);
  const ell = (cx, cy, rx, ry, pal, o = {}) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++){
      if (o.clip && !o.clip(x, y)) continue;
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, o.flat || shade(pal, nx, ny));
      else if (o.line !== false && ((x + 0.5 - cx) / (rx + 1)) ** 2 + ((y + 0.5 - cy) / (ry + 1)) ** 2 <= 1) put(x, y, pal[3]);
    }
  };
  const cap = (x1, y1, x2, y2, r, pal, o = {}) => {
    const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - r - 2); y <= Math.max(y1, y2) + r + 2; y++)
      for (let x = Math.floor(Math.min(x1, x2) - r - 2); x <= Math.max(x1, x2) + r + 2; x++){
        const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / L2));
        const ex = px - (x1 + vx * t), ey = py - (y1 + vy * t), d = Math.hypot(ex, ey), rr = r * (o.taper ? 1 - t * o.taper : 1);
        if (d <= rr) put(x, y, shade(pal, ex / rr, ey / rr));
        else if (o.line !== false && d <= rr + 1) put(x, y, pal[3]);
      }
  };
  const merged = f => { f(true); f(false); };
  const rect = (x0, y0, x1, y1, col) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, col); };
  const OUT = {
    rocketW: ['#ffffff', '#e4e4ee', '#a8a8bc', '#3a3a4a'], rocketB: ['#5e5e70', '#30303c', '#1c1c24', '#08080c'],
    hoodie: ['#5a5a70', '#30303e', '#1e1e28', '#0e0e14'], coat: ['#ffffff', '#ecedf4', '#b0b2c4', '#4a4c5a'],
  };
  const outfit = typeof S.outfit === 'string' ? OUT[S.outfit] : S.outfit;

  // 1) vlasy vzadu
  if (S.style === 'jessie'){
    merged(l => {
      ell(32, 26, 18, 17, H, { line: l });
      cap(46, 22, 56, 38, 7, H, { line: l }); cap(56, 38, 52, 54, 6.5, H, { line: l }); cap(52, 54, 58, 63, 5.5, H, { line: l, taper: 0.4 });
    });
  }
  if (S.style === 'long'){ merged(l => { ell(32, 27, 16, 16, H, { line: l }); cap(19, 30, 17, 56, 6, H, { line: l, taper: 0.3 }); cap(45, 30, 47, 56, 6, H, { line: l, taper: 0.3 }); }); }
  if (S.style === 'cassidy'){ merged(l => { ell(32, 26, 16, 15, H, { line: l }); ell(17, 40, 7, 9, H, { line: l }); ell(47, 40, 7, 9, H, { line: l }); }); }
  if (S.style === 'james'){ merged(l => { ell(32, 25, 15.5, 14, H, { line: l }); cap(22, 30, 21, 44, 5, H, { line: l, taper: 0.5 }); cap(42, 30, 44, 44, 5, H, { line: l, taper: 0.5 }); }); }
  if (S.style === 'cap' || S.style === 'butch' || S.style === 'prof') ell(32, 26, 15, 14, H);

  // 2) tělo: ramena, krk, oblečení
  ell(32, 64, 27, 15, outfit);
  if (S.outfit === 'hoodie'){ ell(32, 50, 11, 3.5, ['#7a7a90', '#4c4c5c', '#30303c', '#14141a']); rect(27, 53, 27, 60, '#a0a0b0'); rect(37, 53, 37, 60, '#a0a0b0'); }
  if (S.outfit === 'rocketW' || S.outfit === 'rocketB'){
    for (let y = 49; y < 60; y++){ const w = Math.max(0, 6 - (y - 49) * 0.6); rect(Math.round(32 - w), y, Math.round(32 + w), y, S.outfit === 'rocketW' ? '#22222c' : '#0c0c10'); }   // černý límec / tričko do V
    const R = ['1110', '1001', '1110', '1010', '1001'];
    R.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '1'){ put(37 + x, 53 + y, '#e02828'); put(37 + x, 54 + y, null); } }));
    R.forEach((row, y) => [...row].forEach((ch, x) => ch === '1' && put(37 + x, 53 + y, '#e02828')));
  }
  if (S.outfit === 'coat'){ for (let y = 49; y < 64; y++){ const w = Math.max(1, 7 - (y - 49) * 0.45); rect(Math.round(32 - w), y, Math.round(32 + w), y, '#d83a3a'); } rect(31, 52, 33, 63, '#7a1a1a'); }
  cap(32, 42, 32, 49, 4, BUST_SKIN);

  // 3) hlava: uši, obličej s bradou
  ell(18.5, 31, 2.6, 4, BUST_SKIN); ell(45.5, 31, 2.6, 4, BUST_SKIN);
  merged(l => { ell(32, 28, 13, 13, BUST_SKIN, { line: l }); ell(32, 35, 9.5, 9, BUST_SKIN, { line: l }); });
  if (S.earring){ put(18, 36, S.earring); put(18, 37, S.earring); put(46, 36, S.earring); put(46, 37, S.earring); }
  // oči
  for (const [ex, side] of [[26, -1], [38, 1]]){
    rect(ex - 3, 27, ex + 2, 27, '#1a1420');                               // linka řas
    put(ex + 3 * side, 26, '#1a1420');
    rect(ex - 2, 28, ex + 1, 31, '#ffffff');                               // bělmo
    rect(ex - 1, 28, ex + 1, 31, S.eyes); rect(ex - 1, 28, ex + 1, 28, '#1a1420');
    rect(ex, 29, ex, 30, '#0a0810');                                        // zornice
    put(ex - 1, 29, '#ffffff');                                             // odlesk
    // obočí podle povahy
    const by = 23, tilt = { calm: [0, 0], smug: [1, -1], angry: [-1, 1] }[S.brow] || [0, 0];
    for (let i = -2; i <= 2; i++) put(ex + i, by + Math.round((i * side > 0 ? tilt[1] : tilt[0]) * Math.abs(i) / 2), H[3]);
  }
  put(32, 34, BUST_SKIN[2]); put(33, 35, BUST_SKIN[2]);                    // nos
  put(23, 34, '#f4a8a0'); put(24, 34, '#f4a8a0'); put(40, 34, '#f4a8a0'); put(41, 34, '#f4a8a0');   // tváře
  const mc = S.lips || '#8a4a40';
  if (S.mouth === 'smile'){ rect(30, 39, 34, 39, mc); put(29, 38, mc); put(35, 38, mc); }
  else if (S.mouth === 'smirk'){ rect(30, 39, 33, 39, mc); put(34, 38, mc); put(35, 37, mc); }
  else if (S.mouth === 'frown'){ rect(30, 39, 34, 39, mc); put(29, 40, mc); put(35, 40, mc); }
  else rect(30, 39, 34, 39, mc);
  if (S.beard) merged(l => { ell(32, 41, 9, 5, H, { line: l }); ell(26, 37, 3, 3, H, { line: l }); ell(38, 37, 3, 3, H, { line: l }); });
  if (S.wrinkle){ put(21, 30, BUST_SKIN[2]); put(43, 30, BUST_SKIN[2]); }
  if (S.rose){ ell(46, 56, 3, 3, ['#ff7a8a', '#e0304a', '#901a2a', '#4a0a14']); put(45, 55, '#ffb0c0'); cap(46, 59, 44, 63, 0.8, ['#4ad86a', '#2a9a48', '#1a6030', '#0a2a14'], { line: false }); }

  // 4) vlasy vpředu / čepice
  if (S.style === 'cap'){
    const hat = S.hat;
    ell(32, 19, 15.5, 10, hat, { clip: (x, y) => y <= 22 });
    merged(l => cap(16, 23, 48, 23, 2.2, hat, { line: l }));               // kšilt zepředu
    for (let x = 17; x <= 47; x++) put(x, 25, hat[3]);
    if (S.hatFront) ell(32, 16, 6, 4.5, [S.hatFront, S.hatFront, '#dcdce8', hat[3]], { clip: (x, y) => y <= 20 });
    if (S.hatR) ['1110', '1001', '1110', '1010', '1001'].forEach((row, y) => [...row].forEach((c, x) => c === '1' && put(30 + x, 12 + y, '#e02828')));
    // vlasy pod kšiltem jen po stranách (u spánků) a krátká ofina uprostřed – oči zůstanou volné
    merged(l => { cap(19, 25, 18, 33, 2, H, { line: l, taper: 0.4 }); cap(45, 25, 46, 33, 2, H, { line: l, taper: 0.4 }); cap(31, 26, 30, 27, 1.4, H, { line: l }); cap(33.5, 26, 34.5, 27, 1.4, H, { line: l }); });
  } else if (S.style === 'jessie'){
    merged(l => { ell(32, 18, 15, 9, H, { line: l }); cap(20, 18, 17, 34, 4.5, H, { line: l, taper: 0.5 }); cap(25, 16, 22, 25, 4, H, { line: l, taper: 0.6 }); cap(36, 15, 42, 24, 4, H, { line: l, taper: 0.6 }); cap(30, 15, 31, 23, 3.4, H, { line: l, taper: 0.6 }); });
  } else if (S.style === 'james'){
    merged(l => { ell(32, 18, 14.5, 8.5, H, { line: l }); cap(26, 15, 38, 28, 5, H, { line: l, taper: 0.55 }); cap(20, 20, 19, 31, 3.4, H, { line: l, taper: 0.5 }); });
  } else if (S.style === 'butch'){
    merged(l => { ell(32, 18, 14, 8, H, { line: l }); for (const [x, y] of [[20, 12], [27, 9], [35, 9], [43, 12]]) cap(x, y + 6, x + (x - 32) * 0.15, y, 2.6, H, { line: l, taper: 0.7 }); cap(19, 22, 19, 29, 1.6, H, { line: l }); cap(45, 22, 45, 29, 1.6, H, { line: l }); });
  } else if (S.style === 'cassidy'){
    merged(l => { ell(32, 18, 15, 9, H, { line: l }); for (const x of [22, 27, 32, 37, 42]) ell(x, 22, 3, 3.5, H, { line: l }); });
  } else if (S.style === 'long'){
    merged(l => { ell(32, 18, 14.5, 8.5, H, { line: l }); cap(22, 18, 24, 26, 3.6, H, { line: l, taper: 0.5 }); cap(42, 18, 40, 26, 3.6, H, { line: l, taper: 0.5 }); cap(32, 15, 33, 22, 3, H, { line: l, taper: 0.5 }); });
  } else if (S.style === 'prof'){
    merged(l => { ell(32, 18, 14, 7.5, H, { line: l }); cap(20, 20, 18, 30, 3, H, { line: l, taper: 0.4 }); cap(44, 20, 46, 30, 3, H, { line: l, taper: 0.4 }); cap(26, 14, 40, 13, 3, H, { line: l }); });
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  c.getContext('2d').putImageData(new ImageData(buf, N, N), 0, 0);
  return c;
}
