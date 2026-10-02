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

/* ---------- Trenér (celá postava zezadu, stojí na plošince místo hráčova pokémona) ----------
   Kluk v černé mikině s nataženou kapucí, pod ní červená kšiltovka (kšilt kouká
   dopředu), světle hnědé vlasy, džíny a červené tenisky; zezadu na mikině vybledlý
   potisk pokéballu. Kreslí se 1:1 v pixelech arény (stejná mřížka jako pozadí).
   Snímky: 2× idle (dýchání), 2× nápřah, hod, dohoz. Ball v ruce je typ, kterým se loví. */
const TRAINER_W = 56, TRAINER_H = 96;
const TRAINER_PAL = {
  out: '#08080c',
  hood: ['#50506a', '#282834', '#15151c'],
  rim: ['#70708a', '#4a4a60', '#30303e'],
  print: '#3e3e52',
  skin: ['#ffe2cc', '#f2c4a0', '#cc9474'],
  hair: ['#f6dcaa', '#dcae74', '#a87c4a'],
  cap: ['#ff7464', '#d8322e', '#8e1c26'],
  jeans: ['#7080b0', '#435282', '#283258'],
  shoe: ['#ff7a6a', '#d23a34', '#8a1e26'],
  sole: ['#ffffff', '#e4e4ee', '#a8a8bc'],
};
// pózy pravé (házecí) ruky: loket, dlaň, ball (null = už hozený); lean = náklon hlavy, up = nádech (horní polovina těla o pixel dolů)
const TRAINER_POSES = {
  idle:   { elbow: [43, 47], hand: [44, 56], ball: [47, 55], lean: 0,  up: 0 },
  idle2:  { elbow: [43, 47], hand: [44, 56], ball: [47, 55], lean: 0,  up: 1 },
  wind1:  { elbow: [47, 30], hand: [45, 21], ball: [45, 17], lean: 0,  up: 0 },
  wind2:  { elbow: [46, 28], hand: [41, 19], ball: [40, 15], lean: -1, up: 0 },
  throw:  { elbow: [48, 31], hand: [52, 23], ball: null,     lean: 1,  up: 0 },
  follow: { elbow: [48, 41], hand: [52, 45], ball: null,     lean: 1,  up: 1 },
};
const TRAINER_RELEASE = [53, 21];   // kde ball opouští ruku (v pixelech spritu)

function pxTrainerFrame(pose, ballType){
  const W = TRAINER_W, H = TRAINER_H, P = TRAINER_PAL, OUT = pxHex(P.out);
  const buf = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, col) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b, a] = pxHex(col), i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const isFill = (x, y) => { const i = (y * W + x) * 4; return buf[i + 3] && !(buf[i] === OUT[0] && buf[i + 1] === OUT[1] && buf[i + 2] === OUT[2]); };
  let dy = 0;   // posun aktuálně kreslené části (horní polovina těla se při nádechu posune)
  // elipsa s obrysem a stínováním podle normály
  const ellipse = (cx, cy, rx, ry, pal, outline = true) => {
    cy += dy;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++){
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, pxShade(pal, nx, ny));
      else if (outline && ((x + 0.5 - cx) / (rx + 1)) ** 2 + ((y + 0.5 - cy) / (ry + 1)) ** 2 <= 1) put(x, y, P.out);
    }
  };
  // "kapsle" (zaoblená úsečka) – ruce, nohy, kšilt, prameny vlasů
  const capsule = (x1, y1, x2, y2, r, pal, outline = true) => {
    y1 += dy; y2 += dy;
    const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - r - 2); y <= Math.max(y1, y2) + r + 2; y++)
      for (let x = Math.floor(Math.min(x1, x2) - r - 2); x <= Math.max(x1, x2) + r + 2; x++){
        const px = x + 0.5, py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / L2));
        const ex = px - (x1 + vx * t), ey = py - (y1 + vy * t), d = Math.hypot(ex, ey);
        if (d <= r) put(x, y, pxShade(pal, ex / r, ey / r));
        else if (outline && d <= r + 1) put(x, y, P.out);
      }
  };
  // obdélník (rovně visící látka) – stín jen podle vodorovné polohy
  const box = (x0, y0, x1, y1, pal, outline = true) => {
    y0 += dy; y1 += dy;
    const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2 + 0.5;
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++){
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) put(x, y, pxShade(pal, (x - cx) / hw * 0.95, -0.15));
      else if (outline) put(x, y, P.out);
    }
  };
  // víc tvarů jako jedna silueta: nejdřív všechno s obrysem, pak znovu bez něj
  const merged = draw => { draw(true); draw(false); };

  // nohy (džíny) a tenisky – ty se při dýchání nehýbou
  merged(o => {
    capsule(21, 60, 20, 85, 4.4, P.jeans, o);
    capsule(33, 60, 34, 85, 4.4, P.jeans, o);
  });
  ellipse(19, 89, 5, 3, P.shoe);
  ellipse(35, 89, 5, 3, P.shoe);
  capsule(16, 91, 22, 91, 0.9, P.sole, false);
  capsule(32, 91, 38, 91, 0.9, P.sole, false);

  dy = pose.up;
  const lean = pose.lean, hx = 27 + lean;
  // trup a ramena v černé mikině
  merged(o => {
    ellipse(27, 38, 16, 8, P.hood, o);
    box(14, 38, 40, 59, P.hood, o);
  });
  // žebrovaný lem mikiny
  for (let y = 57; y <= 59; y++) for (let x = 0; x < W; x++)
    if (isFill(x, y + dy)) put(x, y + dy, pxShade(P.rim, (x - 27) / 15, 0.2));
  // potisk pokéballu na zádech (vybledlý)
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++){
    const d = Math.hypot(x, y);
    if ((d > 3.8 && d <= 4.8) || (Math.abs(y) < 0.6 && d < 4) || (d <= 1.5 && d > 0.6)) put(26 + x, 44 + y + dy, P.print);
  }
  // levá ruka visí podél těla
  capsule(14, 36, 11, 55, 3.8, P.hood);
  ellipse(11, 58, 2.4, 2.4, P.skin);
  // kapuce přes hlavu
  ellipse(27 + lean * 0.5, 30, 10, 4, P.hood, false);
  ellipse(hx, 17, 11, 12, P.hood);
  for (let y = 7; y < 27; y++) put(hx - 1 + (y > 20 ? 1 : 0), y + dy, P.hood[2]);   // šev
  // tvář a světle hnědé vlasy vykukují vpravo (hlava je otočená k soupeři)
  ellipse(hx + 11.5, 20, 2, 3.2, P.skin);
  merged(o => {
    ellipse(hx + 11, 15.5, 3, 3, P.hair, o);
    capsule(hx + 12, 14, hx + 15.5, 17, 1.2, P.hair, o);
    capsule(hx + 11, 17, hx + 13.5, 21.5, 1.2, P.hair, o);
    capsule(hx + 9.5, 18, hx + 10.5, 24, 1.1, P.hair, o);
  });
  capsule(hx + 8.5, 7, hx + 9.5, 25, 1.4, P.rim);           // lem kapuce
  capsule(hx + 9, 11.5, hx + 15.5, 10.5, 1.3, P.cap);       // kšilt kšiltovky

  // pravá ruka podle pózy + ball v dlani
  const { elbow, hand, ball } = pose;
  const drawBall = () => {
    if (!ball) return;
    const n = 7, d = pxBallCanvas(ballType, n).getContext('2d').getImageData(0, 0, n, n).data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
      const i = (y * n + x) * 4;
      if (d[i + 3]) put(ball[0] - 3 + x, ball[1] - 3 + y + dy, '#' + [d[i], d[i + 1], d[i + 2]].map(c => c.toString(16).padStart(2, '0')).join(''));
    }
  };
  const ballBehind = ball && ball[1] < hand[1];   // ve vzpaženém nápřahu je ball nad dlaní
  capsule(40, 37, elbow[0], elbow[1], 3.8, P.hood);
  capsule(elbow[0], elbow[1], hand[0], hand[1], 3.3, P.hood);
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
