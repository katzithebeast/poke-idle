/* =====================================================================
   Pixelové arény kreslené kódem
   ---------------------------------------------------------------------
   Každá aréna se kreslí do plátna PX_W × PX_H (skutečné pixely) a hra ho
   pak ostře zvětší. Pokémoni se zvětší stejným poměrem (1 pixel spritu =
   1 pixel arény, sprity zezadu 2× – jako v Pokémon Black/White), takže
   všechno leží v jedné pixelové mřížce.

   Aréna = seznam vrstev. Statická vrstva se nakreslí jednou a uloží,
   dynamická (mraky, láva, jiskry…) se překresluje cca 12× za sekundu.
   ===================================================================== */
const PX_W = 480, PX_H = 270;

// volby arén, které jde přepnout ve hře (menu ARÉNA); po změně se aréna znovu připraví
const PX_OPTIONS = {
  volcanoMovingClouds: true, volcanoEruptions: true, volcanoFlyers: true,
  stormImpact: true, stormSheet: true, stormSplash: true, stormWindBirds: true, stormDebris: true,
  snowBlizzard: true, snowPlume: true, snowDrift: true, snowSparkle: true,
  oceanGulls: true, oceanWhale: true, oceanGlitter: true, oceanSpray: true, oceanFish: true,
  desertStorm: true, desertStreams: true, desertTumble: true, desertDevil: true,
  graveFog: true, graveWisps: true, graveBats: true, graveGhost: true,
  jungleRays: true, jungleWaterfall: true, jungleVines: true, jungleSpiders: true, jungleShrooms: true, jungleBugs: true, jungleMist: true,
  netherRift: true, netherIslands: true, netherLightning: true, netherDebris: true, netherBeam: true,
  aetherClouds: true, aetherRays: true, aetherHalo: true, aetherWaterfall: true, aetherBirds: true, aetherFeathers: true,
  felPortal: true, felZeppelin: true, felMeteors: true, felFire: true, felCracks: true, felEmbers: true,
};

// promíchá semínko – po sobě jdoucí semínka pak dávají nezávislá čísla
function pxMix(seed){
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  return (seed ^ (seed >>> 16)) >>> 0;
}
// deterministické "náhodné" číslo – aréna vypadá pokaždé stejně
function pxRng(seed){
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------- kreslicí pomůcky (vše na celé pixely) ---------- */
function pxPainter(ctx){
  const R = Math.round;
  const P = {
    ctx,
    rect(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(R(x), R(y), R(w), R(h)); },
    px(x, y, c){ ctx.fillStyle = c; ctx.fillRect(R(x), R(y), 1, 1); },

    // plná pixelová elipsa
    ellipse(cx, cy, rx, ry, c){
      ctx.fillStyle = c;
      cx = R(cx); cy = R(cy); rx = R(rx); ry = R(ry);
      for (let dy = -ry; dy <= ry; dy++){
        const hw = R(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
        ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
      }
    },

    // svislý přechod po pásech; na hranách pásů dithering (šachovnice)
    bands(y0, y1, colors){
      const n = colors.length;
      for (let y = y0; y < y1; y++){
        const f = (y - y0) / (y1 - y0) * (n - 1);
        const i = Math.min(n - 1, Math.floor(f)), fr = f - i;
        P.rect(0, y, PX_W, 1, colors[i]);
        if (fr > 0.55 && colors[i + 1]){
          ctx.fillStyle = colors[i + 1];
          const step = fr > 0.8 ? 2 : 4;
          for (let x = (y % 2) * (step / 2); x < PX_W; x += step) ctx.fillRect(x, y, 1, 1);
        }
      }
    },

    // horský hřbet: světlá a stinná strana podle sklonu, volitelně sníh
    ridge(h, base, c){
      // stinná strana = kde hřbet dlouhodobě klesá (vyhlazený sklon, ať nevznikají svislé pruhy)
      const sm = h.map((_, x) => {
        let a = 0, n = 0;
        for (let k = -7; k <= 7; k++){ const v = h[x + k]; if (v != null){ a += v; n++; } }
        return a / n;
      });
      for (let x = 0; x < PX_W; x++){
        const top = R(base - h[x]);
        const slope = sm[Math.min(PX_W - 1, x + 3)] - sm[Math.max(0, x - 3)];
        P.rect(x, top, 1, PX_H - top, slope < 0 ? c.shade : c.body);
        if (c.snow && h[x] > c.snowLine){
          const d = R((h[x] - c.snowLine) * 0.55) + 1;
          P.rect(x, top, 1, d, slope < 0 ? c.snowShade : c.snow);
        }
        P.px(x, top, c.line);
      }
    },

    // smrk: patra, osvětlená levá strana, tmavý obrys
    pine(x, by, h, c){
      x = R(x); by = R(by);
      P.rect(x - 1, by - 3, 2, 4, c.trunk);
      const top = by - 3 - h;
      P.px(x, top - 1, c.out);
      for (let i = 0; i < h; i++){
        const y = top + i;
        const hw = Math.floor((i % 6) * 0.75 + i * 0.26);
        P.rect(x - hw - 1, y, hw * 2 + 3, 1, c.out);
        P.rect(x - hw, y, hw * 2 + 1, 1, c.mid);
        P.rect(x - hw, y, Math.max(1, Math.floor(hw * 0.6)), 1, c.light);
        P.rect(x + Math.ceil(hw * 0.3) + 1, y, Math.max(0, hw - Math.ceil(hw * 0.3)), 1, c.dark);
      }
      const lw = Math.floor(((h - 1) % 6) * 0.75 + (h - 1) * 0.26);
      P.rect(x - lw - 1, top + h, lw * 2 + 3, 1, c.out);
    },

    // mrak z několika elips se stínem zespodu
    cloud(x, y, s, c){
      P.ellipse(x + 2 * s, y + 3 * s, 15 * s, 4 * s, c.lo);
      P.ellipse(x - 8 * s, y + 1 * s, 8 * s, 5 * s, c.hi);
      P.ellipse(x + 3 * s, y - 2 * s, 10 * s, 7 * s, c.hi);
      P.ellipse(x + 13 * s, y + 1 * s, 7 * s, 4 * s, c.hi);
      P.rect(x - 14 * s, y + 4 * s, 34 * s, 1, c.lo);
    },

    // pixelový balvan: nepravidelný mnohoúhelník s ploškami stínovanými podle světla
    // zleva shora, selektivním obrysem, prasklinkou, odlesky a stínem padajícím doprava.
    // (cx, by) = střed spodku na zemi, w = poloviční šířka, h = výška.
    // c = { out, dark, mid, light, hi, shadow, glint? }
    rock(cx, by, w, h, rk, c){
      w = Math.max(2, w); h = Math.max(2, h);
      const cy = by - h / 2, n = 7 + Math.floor(rk() * 3), verts = [];
      for (let i = 0; i < n; i++){
        const ang = (i / n) * Math.PI * 2 + (rk() - 0.5) * 0.5, rad = 0.72 + rk() * 0.32;
        const vx = cx + Math.cos(ang) * w * rad;
        let vy = cy + Math.sin(ang) * h / 2 * rad;
        if (vy > by) vy = by - rk() * 0.8;                       // zploštělý spodek
        verts.push([vx, vy, Math.atan2(vy - cy, vx - cx)]);
      }
      verts.sort((a, b) => a[2] - b[2]);
      // tón každé plošky podle toho, jak je natočená ke světlu (zleva shora)
      const LX = -0.7071, LY = -0.7071;
      const facet = verts.map((v, i) => {
        const u = verts[(i + 1) % n], ex = u[0] - v[0], ey = u[1] - v[1], len = Math.hypot(ex, ey) || 1;
        const dot = (ey / len) * LX + (-ex / len) * LY;           // vnější normála · světlo
        return dot > 0.45 ? c.light : dot > -0.25 ? c.mid : c.dark;
      });
      const inside = (px, py) => {
        let a = false;
        for (let i = 0, j = n - 1; i < n; j = i++){
          const [xi, yi] = verts[i], [xj, yj] = verts[j];
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) a = !a;
        }
        return a;
      };
      const x0 = Math.floor(cx - w * 1.1), x1 = Math.ceil(cx + w * 1.1), y0 = Math.floor(cy - h * 0.6), y1 = Math.ceil(by) + 1;
      const W = x1 - x0 + 1, H = y1 - y0 + 1, m = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = inside(x0 + x + 0.5, y0 + y + 0.5) ? 1 : 0;
      const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
      // stín na zemi (padá doprava jako u pokémonů)
      P.ellipse(cx + w * 0.5, by - 1, w * 0.95, Math.max(1, h * 0.14), c.shadow);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        if (!at(x, y)) continue;
        const X = x0 + x, Y = y0 + y;
        let col;
        const snowy = c.snow && Y < cy - h * 0.05 + Math.sin(X * 0.9) * 1.2;   // sněhová čepice
        if (!at(x - 1, y) || !at(x, y - 1)) col = snowy ? c.snowShade : c.dark;   // obrys na osvětlené straně – jemnější
        else if (!at(x + 1, y) || !at(x, y + 1)) col = c.out;      // obrys na stinné straně – tmavý
        else {
          const dx = (X + 0.5 - cx) / w, dy = (Y + 0.5 - cy) / (h / 2);
          if (dx * dx + dy * dy < 0.22) col = dy < 0.1 ? c.light : c.mid;   // horní plocha
          else {
            const ang = Math.atan2(Y + 0.5 - cy, X + 0.5 - cx);
            let f = n - 1;
            for (let i = 0; i < n; i++) if (ang >= verts[i][2]) f = i;
            col = facet[f];
          }
          if (snowy) col = dx < 0.2 ? c.snow : c.snowShade;
        }
        P.px(X, Y, col);
      }
      // prasklinka, světlé body a odlesk
      let kx = cx + (rk() - 0.5) * w, ky = cy - h * 0.1;
      for (let k = 0; k < 2 + rk() * h * 0.5; k++){
        if (at(Math.round(kx) - x0, Math.round(ky) - y0)) P.px(kx, ky, c.out);
        kx += rk() < 0.5 ? 1 : 0; ky += 1;
      }
      for (let k = 0; k < 2 + w * 0.3; k++){
        const hx = Math.round(cx - w * (0.15 + rk() * 0.5)), hy = Math.round(cy - h * (0.05 + rk() * 0.3));
        if (at(hx - x0, hy - y0) && at(hx - x0 - 1, hy - y0) && at(hx - x0, hy - y0 - 1)) P.px(hx, hy, c.hi);
      }
      if (c.glint){
        const gx = Math.round(cx - w * 0.45), gy = Math.round(cy - h * 0.25);
        for (let k = 0; k < Math.max(2, w * 0.5); k++){
          const yy = gy - Math.round(k * 0.4);
          if (at(gx + k - x0, yy - y0)) P.px(gx + k, yy, c.glint);
        }
      }
    },

    // horizont: zvlněná linie (oblé vlny + nepravidelné výběžky). clip() ořízne vrstvu
    // nad linií – volat jako poslední krok kreslení země; limit(x) = nejnižší dovolená výška
    horizon(r, base, amp, line, lit){
      const h = pxRidgeLine(r, amp, 0.8);
      const hz = h.map((v, x) => Math.round(base - v + Math.sin(x * 0.045 + 1) * amp * 0.25));
      return {
        hz,
        clip(limit){
          if (limit) for (let x = 0; x < PX_W; x++) hz[x] = Math.min(hz[x], limit(x));
          for (let x = 0; x < PX_W; x++){
            ctx.clearRect(x, 0, 1, hz[x]);
            P.px(x, hz[x], line);
            if (lit && hz[x] <= hz[Math.max(0, x - 1)]) P.px(x, hz[x] + 1, lit);   // hrany stoupající zleva chytají světlo
          }
        },
      };
    },

    // ledový krystal: (x, by) = střed paty, w šířka, h výška, lean = náklon; c = { out, lit, mid, dark, hi }
    crystal(x, by, w, h, lean, c){
      const tx = x + lean * h, hw = w / 2;
      const L = [[x - hw, by], [x - hw + lean * h * 0.75, by - h * 0.72], [tx, by - h], [tx, by]];
      const Rr = [[tx, by], [tx, by - h], [x + hw + lean * h * 0.75, by - h * 0.72], [x + hw, by]];
      const all = [[x - hw - 1, by + 1], [x - hw - 1 + lean * h * 0.75, by - h * 0.72], [tx, by - h - 1.5], [x + hw + 1 + lean * h * 0.75, by - h * 0.72], [x + hw + 1, by + 1]];
      P.poly(all, c.out);
      P.poly(Rr, c.dark); P.poly(L, c.lit);
      P.poly([[x - hw * 0.3, by], [x - hw * 0.3 + lean * h * 0.72, by - h * 0.7], [tx, by - h], [tx, by]], c.mid);   // střední ploška
      P.line(tx, by - h, tx, by - 1, 1, c.hi);                                      // hřebenová hrana
      P.line(x - hw + lean * h * 0.75, by - h * 0.72, tx, by - h, 1, c.hi);         // horní hrana ke světlu
    },

    // vyplněný mnohoúhelník (scanline), pts = [[x, y], ...]
    poly(pts, c){
      const ys = pts.map(p => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
      ctx.fillStyle = c;
      for (let y = y0; y <= y1; y++){
        const xs = [];
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y + 0.5) !== (yj > y + 0.5)) xs.push(xi + (y + 0.5 - yi) * (xj - xi) / (yj - yi));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) ctx.fillRect(R(xs[k]), y, Math.max(1, R(xs[k + 1]) - R(xs[k])), 1);
      }
    },
    // čára o tloušťce w (po pixelech)
    line(x0, y0, x1, y1, w, c){
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i <= n; i++) P.rect(x0 + (x1 - x0) * i / n - (w >> 1), y0 + (y1 - y0) * i / n - (w >> 1), w, w, c);
    },

    // skalnatý pahorek pod plošinkou (E = {x, y, rx}), y1 = kde končí v zemi.
    // c.tuft = trsy trávy u paty (nebo null), c.seam = žhavé pukliny ve skále (nebo nic)
    mound(E, y1, rk, c){
      const y0 = E.y + 3;
      let jl = 0, jr = 0, baseL = 0, baseR = 0;
      for (let y = y0; y <= y1; y++){
        const k = (y - y0) / (y1 - y0);
        jl = jl * 0.6 + (rk() - 0.5) * 3; jr = jr * 0.6 + (rk() - 0.5) * 3;
        const hw = E.rx * 0.9 + k ** 0.8 * 26;
        const l = R(E.x - hw + jl), r2 = R(E.x + hw + jr);
        P.rect(l - 1, y, r2 - l + 3, 1, c.out);
        P.rect(l, y, r2 - l + 1, 1, c.body);
        P.rect(l, y, 3, 1, c.lit);                // hrana nasvícená zleva
        P.rect(r2 - 6, y, 6, 1, c.shade);         // stinná pravá strana
        baseL = l; baseR = r2;
      }
      // přechod do země: nerovná pata skály a lem (bahno / popel) řídnoucí od skály
      for (let x = baseL - 10; x <= baseR + 10; x++){
        const inside = x >= baseL && x <= baseR;
        const d = 1 + Math.floor(rk() * 4);
        if (inside) for (let k = 1; k <= d; k++) P.px(x, y1 + k, k === d ? c.foot : c.body);
        const dist = inside ? 0 : Math.min(Math.abs(x - baseL), Math.abs(x - baseR));
        for (let k = 0; k < 5; k++){
          if (rk() < 0.75 - dist * 0.07 - k * 0.12) P.px(x, y1 + d + k, (x + k) % 2 ? c.mud[0] : c.mud[1]);
        }
      }
      if (c.tuft) for (let i = 0; i < 70; i++){
        const x = baseL - 8 + rk() * (baseR - baseL + 16), y = y1 - 3 + rk() * 9, h = 2 + Math.floor(rk() * 4);
        const lean = rk() < 0.5 ? 0 : 1;
        for (let k = 0; k < h; k++) P.px(x + (k > h / 2 ? lean : 0), y - k, k === h - 1 ? c.tuft[1] : c.tuft[0]);
      }
      for (let i = 0; i < 18; i++){
        const x = baseL - 12 + rk() * (baseR - baseL + 24), y = y1 + 2 + rk() * 8;
        P.rect(x, y, 2 + Math.floor(rk() * 2), 1, c.pebble); P.rect(x, y + 1, 3, 1, c.out);
      }
      // vrstvy horniny
      for (let i = 0; i < 6; i++){
        let x = E.x - E.rx * 0.8 + rk() * E.rx * 1.6, y = y0 + 8 + rk() * 20;
        for (let k = 0; k < 10 + rk() * 18; k++){ x += 1; y += (rk() - 0.5) * 0.8; P.px(x, y, c.strata[0]); P.px(x, y - 1, c.strata[1]); }
      }
      // balvany u paty
      for (let i = 0; i < 7; i++){
        const side = i % 2 ? 1 : -1;
        const bx = E.x + side * (E.rx * 0.75 + rk() * 34), by = y1 - 1 + rk() * 7, bw = 6 + rk() * 7, bh = 8 + rk() * 7;
        P.rock(bx, by, bw, bh, rk, c.rock);
      }
      // žhavé pukliny (klikatí se shora dolů)
      if (c.seam) for (let i = 0; i < 5; i++){
        let x = E.x - E.rx * 0.7 + rk() * E.rx * 1.4, y = y0 + 5 + rk() * 6;
        const len = 8 + rk() * (y1 - y0 - 12);
        for (let k = 0; k < len; k++, y++){
          x += (rk() - 0.5) * 1.6;
          P.px(x - 1, y, c.seam[0]); P.px(x, y, k % 3 ? c.seam[1] : c.seam[2]);
        }
      }
      P.ellipse(E.x + 4, y0 + 6, E.rx * 0.88, 3, c.platShadow);   // stín plošinky na skále
    },

    // bojová plošinka jako v BW: obrys, boční stěna s pruhy, soustředné kruhy nahoře
    platform(cx, cy, rx, ry, side, c){
      for (let s = side; s >= 0; s--) P.ellipse(cx, cy + s, rx + 1, ry + 1, c.out);
      for (let s = side; s >= 1; s--) P.ellipse(cx, cy + s, rx, ry, c.side);
      for (let x = cx - rx + 4; x < cx + rx - 3; x += 7){
        const dy = ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rx + 0.5)) ** 2));
        P.rect(x, cy + R(dy) + 1, 1, side - 1, c.sideDark);
        if (c.seam) P.rect(x + 3, cy + R(dy) + 2, 1, side - 3, c.seam);
      }
      P.ellipse(cx, cy, rx, ry, c.edge);
      P.ellipse(cx, cy - 1, rx - 2, ry - 1, c.top);
      P.ellipse(cx, cy, R(rx * 0.74), R(ry * 0.66), c.center);
      P.ellipse(cx, cy, R(rx * 0.46), R(ry * 0.4), c.top);
      for (let x = cx - R(rx * 0.75); x <= cx + R(rx * 0.75); x++){
        const dy = (ry - 1) * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rx - 1.5)) ** 2));
        P.px(x, cy - 1 - R(dy) + 1, c.hi);
      }
    },
  };
  return P;
}

// hřbet metodou "midpoint displacement"
function pxRidgeLine(r, amp, rough){
  let n = 1; while (n < PX_W) n *= 2;
  const h = new Float32Array(n + 1);
  h[0] = r() * amp; h[n] = r() * amp;
  for (let step = n; step > 1; step /= 2){
    for (let i = step / 2; i < n; i += step){
      h[i] = (h[i - step / 2] + h[i + step / 2]) / 2 + (r() - 0.5) * amp * (step / n) * rough * 2;
    }
  }
  const arr = Array.from(h.slice(0, PX_W));
  const min = Math.min(...arr), max = Math.max(...arr) || 1;
  return arr.map(v => amp * (0.15 + 0.85 * (v - min) / (max - min || 1)));
}

/* =====================================================================
   ARÉNA 1: Sopečný kráter – žhavá, "agresivní" aréna na rudém nebi
   ===================================================================== */
const VOLCANO_ROCK = { out: '#120a12', dark: '#22161e', mid: '#36262f', light: '#56404e', hi: '#7c5e6c', shadow: '#160c14', glint: '#ff7a28' };
const VOLCANO = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 356, y: 156, rx: 72, ry: 14 } };
  const V = { cx: 300, top: 54, base: 156, crater: 24, half: 250 };
  const vy = x => {   // výška siluety sopky
    const d = Math.abs(x - V.cx);
    if (d < V.crater) return V.top + 2;
    const t = (d - V.crater) / (V.half - V.crater);
    return t > 1 ? null : V.top + (V.base - V.top) * (1 - (1 - t) ** 2);
  };

  // lávové proudy: cesty od kráteru dolů
  const lr = pxRng(41);
  const streams = [-18, -6, 9, 20].map(off => {
    const pts = []; let x = V.cx + off;
    for (let y = V.top + 3; y < V.base; y++){
      x += (lr() - 0.5) * 1.6 + Math.sign(off) * 0.55;
      const surf = vy(Math.round(x));
      if (surf != null && y >= surf - 1) pts.push([Math.round(x), y]);
    }
    return pts;
  });
  // praskliny v zemi
  const cr = pxRng(77);
  const cracks = Array.from({ length: 9 }, () => {
    const pts = []; let x = cr() * PX_W, y = 168 + cr() * 100, dir = cr() < 0.5 ? -1 : 1;
    for (let i = 0; i < 30 + cr() * 50; i++){
      x += dir; if (cr() < 0.35) y += cr() < 0.5 ? -1 : 1;
      pts.push([Math.round(x), Math.round(y)]);
      if (cr() < 0.05) dir = -dir;
    }
    return pts;
  });
  // lávová řeka: vlní se zleva k patě sopky
  const river = [];
  for (let x = 0; x < 290; x++){
    const y = 166 + Math.round(Math.sin(x * 0.035) * 2 + Math.sin(x * 0.11) * 1);
    const w = Math.max(1, Math.round(4 - x / 90 + Math.sin(x * 0.07)));
    river.push([x, y, w]);
  }
  // popelové mraky (stejná místa pro statickou i pohyblivou verzi)
  const ar = pxRng(11);
  const ash = Array.from({ length: 9 }, (_, i) => ({ x: ar() * PX_W, y: 18 + ar() * 70, w: 30 + ar() * 60, v: 1.2 + (i % 3) * 0.9 }));
  const drawAsh = (P, x, c) => { P.ellipse(x, c.y, c.w, 3, '#2a0c1c'); P.rect(x - c.w * 0.7, c.y + 3, c.w * 1.4, 1, '#5a1828'); };
  const er = pxRng(5);
  const embers = Array.from({ length: 46 }, () => ({ x: er() * PX_W, p: er(), v: 0.5 + er() * 0.9, w: er() * 6 }));

  /* ---------- letci na obloze ----------
     Několik nezávislých "kanálů": každý jednou za čas pošle přes celou oblohu letce –
     zleva doprava nebo zprava doleva, za sopkou se schová a na druhé straně vynoří.
     Hejno / drak (občas dva) / vzácně ohnivý pták (občas dva) + vzdálená hejna teček.
     Siluety jsou zespodu podsvícené žárem lávy. Křídla mají 8 fází mávnutí,
     mění se po 100 ms – stejný rytmus jako GIFy pokémonů. */
  const SIL = '#22091a', RIM = '#7a2432';
  const CHANNELS = [
    { period: 22, salt: 7,  far: false },
    { period: 31, salt: 13, far: false },
    { period: 18, salt: 23, far: true },
  ];
  const SPEED = { flock: 17, dragon: 19, firebird: 30, far: 9 };
  function flyers(t, ch){
    const out = [], n = Math.floor(t / ch.period);
    for (let k = n; k >= n - 4 && k >= 0; k--){ const f = spawn(t, ch, k); if (f) out.push(f); }
    return out;
  }
  // letec, kterého poslal interval n (nebo null, pokud v čase t neletí)
  function spawn(t, ch, n){
    const r = pxRng(n * 6151 + ch.salt);
    if (r() < 0.2) return null;                                   // občas nic
    const roll = r();
    const kind = ch.far ? 'far' : roll < 0.5 ? 'flock' : roll < 0.88 ? 'dragon' : 'firebird';
    const dir = r() < 0.5 ? 1 : -1;
    const xa = -50, xb = PX_W + 50, speed = SPEED[kind], dur = (xb - xa) / speed;
    const start = r() * ch.period;
    const ph = t - n * ch.period - start;
    if (ph < 0 || ph > dur) return null;
    const baseY = ch.far ? 22 + r() * 30 : 62 + r() * 46;
    const drift = (r() - 0.5) * 0.8;
    return {
      kind, dir, ph, seed: n * 97 + ch.salt,
      x: dir > 0 ? xa + ph * speed : xb - ph * speed,
      y: baseY + Math.sin(ph * 0.9) * 4 + ph * drift,
      count: 3 + Math.floor(r() * 4),
      pair: (kind === 'dragon' && r() < 0.4) || (kind === 'firebird' && r() < 0.3),
    };
  }
  // 8 fází mávnutí: hodnota = výška konce křídla (1 nahoře, −1 dole)
  const WING = [1.0, 0.75, 0.25, -0.35, -0.85, -0.6, -0.1, 0.5];
  const wingAt = (t, off = 0) => WING[(Math.floor(t / 0.1) + off) % WING.length];
  const bodyBob = w => (w < -0.3 ? -1 : 0);                        // při mávnutí dolů se tělo zvedne
  const lit = draw => { draw(0, 1, RIM); draw(0, 0, SIL); };       // podsvícený spodní okraj

  function drawBird(P, x, y, w, dir){
    lit((dx, dy, c) => {
      const X = x + dx, Y = y + dy + bodyBob(w);
      P.rect(X - 1, Y, 3, 1, c);
      const ty = Y - Math.round(w * 3), mx = Math.round(w > 0 ? 2 : 3);
      P.line(X - 1, Y, X - mx, Y - Math.round(w * 1.5), 1, c); P.line(X - mx, Y - Math.round(w * 1.5), X - 5, ty, 1, c);
      P.line(X + 1, Y, X + mx, Y - Math.round(w * 1.5), 1, c); P.line(X + mx, Y - Math.round(w * 1.5), X + 5, ty, 1, c);
      P.px(X + dir * 2, Y - 1, c);
    });
  }
  // křídlo z ramene: konec se otáčí podle fáze, zadní okraj blány se táhne za ním
  function wingPoly(X, Y, d, w, len){
    const tipX = X - d * (len * 0.25 + (1 - Math.abs(w)) * len * 0.35), tipY = Y - w * len;
    const backX = X - d * len * 0.62, backY = Y - w * len * 0.55;
    return [[X - d * 2, Y - 1], [X + d * 3, Y - 1], [tipX, tipY], [backX, backY]];
  }
  function drawDragon(P, x, y, w, dir, t){
    lit((dx, dy, c) => {
      const X = x + dx, Y = y + dy + bodyBob(w), d = dir;
      P.ellipse(X, Y, 6, 2, c);                                           // tělo
      P.line(X + d * 5, Y - 1, X + d * 9, Y - 4, 2, c);                  // krk
      P.ellipse(X + d * 11, Y - 5, 2, 1, c); P.px(X + d * 13, Y - 4, c); // hlava + čumák
      P.px(X + d * 10, Y - 7, c);                                         // roh
      P.line(X - d * 5, Y, X - d * 11, Y + 2, 2, c); P.line(X - d * 11, Y + 2, X - d * 15, Y + 1, 1, c);   // ocas
      P.line(X + d * 2, Y + 2, X + d * 3, Y + 4, 1, c);                  // nohy
      P.poly(wingPoly(X, Y, d, w, 13), c);
    });
    const fx = x - dir * 16, fy = y + bodyBob(w);                       // plamínek na ocase
    P.px(fx, fy, Math.floor(t * 10) % 2 ? '#ffd060' : '#ff8a30'); P.px(fx, fy - 1, '#ff6a20');
  }
  function drawFirebird(P, x, y, w, dir, t, ph){
    for (let k = 1; k <= 16; k++){                                       // ohnivá stopa
      if ((k + Math.floor(t * 10)) % 3 === 0) continue;
      const tx = x - dir * k * 3, ty = y + Math.sin((ph - k * 0.05) * 0.9) * 4 + (k % 3) - 1;
      P.px(tx, ty, k < 4 ? '#ffe070' : k < 8 ? '#ff9a30' : k < 12 ? '#e2502a' : '#8a2a22');
    }
    lit((dx, dy, c) => {
      const X = x + dx, Y = y + dy + bodyBob(w), d = dir;
      P.ellipse(X, Y, 5, 2, c);
      P.line(X + d * 4, Y - 1, X + d * 8, Y - 3, 1, c); P.px(X + d * 9, Y - 3, c);
      P.line(X - d * 4, Y, X - d * 10, Y - 1, 1, c);
      P.poly(wingPoly(X, Y, d, w, 12), c);
    });
    const tip = wingPoly(x, y + bodyBob(w), dir, w, 12)[2];             // žhavý konec křídla a hřebínek
    P.px(tip[0], tip[1], '#ffd060'); P.px(tip[0] + dir, tip[1] + (w > 0 ? 1 : -1), '#ff8a30');
    P.px(x + dir * 9, y - 4 + bodyBob(w), '#ffd060');
  }
  // vločky popela snášející se oblohou
  const fl = pxRng(91);
  const flakes = Array.from({ length: 38 }, () => ({ x: fl() * PX_W, y: fl() * 150, v: 3 + fl() * 5, w: fl() * 6 }));

  /* ---------- erupce ----------
     Každých ERUPT_PERIOD sekund jedna, v náhodném okamžiku (deterministicky podle pořadí).
     ph < 0: předzvěst (kráter pulzuje), 0–0,35 s: záblesk + gejzír, pak lávové bomby
     po balistických drahách; kde dopadnou, zůstane žhnoucí skvrna, která chladne. */
  const ERUPT_PERIOD = 12.5, ERUPT_LEN = 7, GRAVITY = 115;
  const PRE_LEN = 3.8, FILL_LEN = 0.8;   // předzvěst: naplnění kráteru, pak bublání
  const BUBBLE_STEP = 0.1;               // bubliny se mění po 100 ms – stejně jako snímky GIFů pokémonů
  const landY = x => { const s0 = vy(Math.round(x)); return s0 == null ? 158 : s0 + 1; };
  const eruptCache = new Map();
  function eruption(t){
    const n = Math.floor(t / ERUPT_PERIOD);
    let e = eruptCache.get(n);
    if (!e){
      const r = pxRng(n * 977 + 31);
      const at = PRE_LEN + r() * (ERUPT_PERIOD - ERUPT_LEN - PRE_LEN);
      const bombs = Array.from({ length: 22 + Math.floor(r() * 12) }, () => {
        const b = { x0: V.cx + (r() - 0.5) * 16, y0: V.top - 2, vx: (r() - 0.5) * 150, vy: -(62 + r() * 52), big: r() < 0.4, delay: r() * 0.5 };
        // kdy a kde bomba dopadne
        for (let tau = 0.05; tau < 5; tau += 0.02){
          const x = b.x0 + b.vx * tau, y = b.y0 + b.vy * tau + 0.5 * GRAVITY * tau * tau;
          if (b.vy + GRAVITY * tau > 0 && y >= landY(x)){ b.tl = tau; b.lx = x; b.ly = landY(x); break; }
        }
        b.tl ??= 5;
        return b;
      });
      e = { n, at, bombs };
      eruptCache.set(n, e);
      if (eruptCache.size > 4) eruptCache.delete(eruptCache.keys().next().value);
    }
    return { ...e, ph: t - e.n * ERUPT_PERIOD - e.at };
  }
  return {
    name: 'Sopečný kráter',
    fps: 20,
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    layers: [
      { seed: 11, draw(P){   // rudé nebe (+ statické popelové mraky, když se nemají hýbat)
        P.bands(0, 160, ['#14081a', '#22091f', '#360d26', '#52122c', '#74192e', '#9a2430', '#c23a2e', '#e2602c', '#f58a34']);
        if (!PX_OPTIONS.volcanoMovingClouds) for (const c of ash) drawAsh(P, c.x, c);
      } },
      { dynamic: true, draw(P, r, t){   // pomalu plující popelové mraky
        if (!PX_OPTIONS.volcanoMovingClouds) return;
        for (const c of ash){
          const span = PX_W + c.w * 2;
          drawAsh(P, ((c.x + c.w + t * c.v) % span + span) % span - c.w, c);
        }
      } },
      { dynamic: true, draw(P, r, t){   // živé nebe: letci, vzdálená hejna, vločky popela
        // vločky popela (pomalu padají a vlní se)
        for (const f of flakes){
          const y = (f.y + t * f.v) % 160, x = ((f.x - t * f.v * 0.6 + Math.sin(t * 0.8 + f.w) * 3) % PX_W + PX_W) % PX_W;
          P.px(x, y, (Math.floor(t * 5 + f.w) % 4) ? '#5a3a44' : '#7a5260');
        }
        if (!PX_OPTIONS.volcanoFlyers) return;
        for (const ch of CHANNELS) for (const f of flyers(t, ch)){
          if (f.kind === 'far'){
            // vzdálené hejno: drobné mávající tečky vysoko na obloze
            const fr = pxRng(f.seed);
            for (let i = 0; i < f.count + 2; i++){
              const bx = Math.round(f.x - f.dir * i * 5 + fr() * 4), by = Math.round(f.y + (i % 2 ? 3 : -2) + fr() * 3);
              const up = wingAt(t, i * 3) > 0;
              P.px(bx, by, SIL); P.px(bx - 1, by - (up ? 1 : 0), SIL); P.px(bx + 1, by - (up ? 1 : 0), SIL);
            }
          } else if (f.kind === 'flock'){
            const fr = pxRng(f.seed * 31 + 3);
            for (let i = 0; i < f.count; i++){
              const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;            // formace do "V"
              const bx = f.x - f.dir * row * 9 + fr() * 3, by = f.y + side * row * 5 + Math.sin(t * 2 + i) * 1.5;
              drawBird(P, Math.round(bx), Math.round(by), wingAt(t, i * 2), f.dir);
            }
          } else {
            const draw = f.kind === 'dragon' ? drawDragon : drawFirebird;
            draw(P, Math.round(f.x), Math.round(f.y), wingAt(t), f.dir, t, f.ph);
            // parťák: o kus vzadu a výš, mává v jiné fázi
            if (f.pair) draw(P, Math.round(f.x - f.dir * 26), Math.round(f.y - 9 + Math.sin(t * 1.1) * 2), wingAt(t, 3), f.dir, t + 0.37, f.ph);
          }
        }
      } },
      { seed: 12, draw(P, r){   // vzdálené skály + sopka
        P.ridge(pxRidgeLine(r, 52, 1.3), 160, { body: '#3c1628', shade: '#30101f', line: '#7a2a34' });
        // hranice světla a stínu: nepravidelná, lomená linie (ne svislé pravítko)
        const term = [];
        let bx = V.cx - 3;
        for (let y = 0; y <= V.base + 10; y++){
          if (y > V.top) bx += (r() - 0.42) * 1.8 + (r() < 0.08 ? (r() - 0.5) * 6 : 0);
          bx = Math.max(V.cx - 26, Math.min(V.cx + 34, bx));
          term.push(Math.round(bx));
        }
        const LIT = '#3a1a28', MID = '#321624', DARK = '#2a1220';
        for (let x = 0; x < PX_W; x++){
          const top = vy(x); if (top == null) continue;
          const t = Math.round(top + (r() < 0.2 ? 1 : 0));
          for (let y = t; y < V.base + 10; y++){
            const d = x - term[y];
            let c = d < -2 ? LIT : d > 2 ? DARK : MID;
            if (Math.abs(d) <= 3 && (x + y) % 2 === 0) c = d < 0 ? LIT : DARK;   // dithering na přechodu
            P.px(x, y, c);
          }
          P.px(x, t, x < term[t] ? '#8a3238' : '#5a2030');
        }
        // erozní rýhy stékající ze svahů (každá trochu jinak křivá)
        for (let g = 0; g < 16; g++){
          let x = V.cx + (r() - 0.5) * 300;
          const top = vy(Math.round(x)); if (top == null) continue;
          const len = 12 + r() * 60;
          let y = top + 4 + r() * 10;
          for (let k = 0; k < len && y < V.base + 6; k++, y++){
            x += (x < V.cx ? -0.45 : 0.45) + (r() - 0.5) * 0.9;
            const xi = Math.round(x), yi = Math.round(y);
            const s0 = vy(xi); if (s0 == null || yi < s0 + 2) continue;
            const lit = xi < term[yi];
            P.px(xi, yi, lit ? '#2a1220' : '#3e1c2a');
            if (k % 3) P.px(xi + (lit ? 1 : -1), yi, lit ? '#43202e' : '#331626');
          }
        }
        // žhavá záře u paty sopky
        for (let y = V.base - 8; y < V.base + 4; y++)
          for (let x = 0; x < PX_W; x++) if ((x + y) % 4 === 0 && r() < (y - V.base + 8) / 14) P.px(x, y, '#5a1a24');
        // kráter a záře nad ním
        for (let y = V.top - 12; y < V.top; y++){
          const k = (V.top - y) / 12;
          for (let x = V.cx - 30; x <= V.cx + 30; x++) if ((x + y) % (k < 0.4 ? 2 : 4) === 0 && Math.abs(x - V.cx) < 30 * (1 - k)) P.px(x, y, '#c2442c');
        }
        P.ellipse(V.cx, V.top + 2, V.crater, 3, '#ff7a28');
        P.ellipse(V.cx, V.top + 2, V.crater - 6, 2, '#ffd060');
      } },
      { dynamic: true, draw(P, r, t){   // tekoucí láva + kouř
        streams.forEach((pts, si) => pts.forEach(([x, y], j) => {
          const k = (j - Math.floor(t * 9) + si * 3) % 7;
          const c = k < 2 ? '#ffe070' : k < 4 ? '#ff9a30' : '#ff5a1e';
          P.px(x, y, c); P.px(x + 1, y, k < 3 ? '#ff5a1e' : '#c23820');
        }));
        const N = 18, puffs = [];
        for (let i = 0; i < N; i++){
          const ph = (t * 0.05 + i / N) % 1;
          puffs.push({ ph, x: V.cx + ph * ph * 120 + Math.sin(t * 0.7 + i * 1.7) * 4 * ph, y: V.top - 2 - ph * 78, s: 5 + ph * 20 });
        }
        puffs.sort((a, b) => b.ph - a.ph);   // starší (výš) vzadu
        for (const p of puffs) P.ellipse(p.x, p.y + 2, p.s + 1, p.s * 0.62 + 1, '#1c0c16');
        for (const p of puffs){
          P.ellipse(p.x, p.y, p.s, p.s * 0.62, p.ph < 0.2 ? '#5a2228' : '#33202c');
          P.ellipse(p.x - p.s * 0.25, p.y - p.s * 0.2, p.s * 0.55, p.s * 0.3, p.ph < 0.2 ? '#8a3a30' : '#46303c');
        }
      } },
      { dynamic: true, draw(P, r, t){   // erupce: předzvěst, gejzír, tlaková vlna, lávové bomby, dopady
        if (!PX_OPTIONS.volcanoEruptions) return;
        const { ph, bombs } = eruption(t);
        if (ph < -PRE_LEN || ph > ERUPT_LEN) return;
        // předzvěst: kráter se naplní žhavým magmatem a pak čím dál víc bublá
        if (ph < 0){
          const fill = Math.min(1, (ph + PRE_LEN) / FILL_LEN);   // hladina jednou vystoupá a zůstane
          P.ellipse(V.cx, V.top + 2, Math.round((V.crater - 2) * fill), Math.max(1, Math.round(2.5 * fill)), '#ffb040');
          P.ellipse(V.cx, V.top + 2, Math.round((V.crater - 9) * fill), 1, '#ffe070');
          const BUB = PRE_LEN - FILL_LEN;
          if (ph > -BUB){
            const k = (ph + BUB) / BUB;                         // 0 → 1: bublá o něco rychleji a víc
            const tq = Math.floor(t / BUBBLE_STEP) * BUBBLE_STEP;   // čas po krocích jako GIF
            for (let i = 0; i < 2 + Math.round(k * 3); i++){
              const period = 1.5 - k * 0.4 + i * 0.13, tt = tq + i * 0.53;
              const cyc = Math.floor(tt / period), local = (tt % period) / period;
              // mimo střed kráteru (tam stoupá kouř), střídavě vlevo a vpravo
              const side = (i + cyc) % 2 ? 1 : -1;
              const bx = Math.round(V.cx + side * (6 + Math.abs(Math.sin(i * 12.99 + cyc * 3.7)) * (V.crater - 10))), by = V.top + 1;
              if (local < 0.7){
                // bublina se nafukuje nad hladinu: tmavý okraj, žhavé tělo, světlá čepička
                const br = 1 + Math.round(local / 0.7 * (1.5 + k * 2.5));
                P.ellipse(bx, by - br * 0.6, br + 1, br * 0.8 + 1, '#a02a1e');
                P.ellipse(bx, by - br * 0.6, br, Math.max(1, br * 0.8), '#ff9a30');
                P.px(bx - Math.floor(br * 0.4), by - br * 1.2, '#fff4c0');
                P.px(bx - Math.floor(br * 0.4) + 1, by - br * 1.2, '#ffe070');
              } else {
                // prasknutí: kapky odstříknou do stran a nahoru
                const d = (local - 0.7) / 0.3;
                for (let sx = -2; sx <= 2; sx++){
                  const x = bx + sx * d * (2 + k * 3), y = by - d * (4 + k * 7) * (1 - Math.abs(sx) * 0.25) + d * d * 6;
                  P.px(x, y, Math.abs(sx) === 2 ? '#e2502a' : '#ffd060');
                  if (sx === 0) P.px(x, y + 1, '#ff8a30');
                }
              }
            }
          }
          return;
        }
        // mohutný kouř z výbuchu
        if (ph < 5){
          for (let i = 0; i < 9; i++){
            const p = Math.min(1, ph / 5 + i / 18);
            const x = V.cx + (i - 4) * 7 + p * 40, y = V.top - 6 - p * 50, sz = 8 + p * 20;
            P.ellipse(x, y + 2, sz + 1, sz * 0.6 + 1, '#1c0c16');
            P.ellipse(x, y, sz, sz * 0.6, ph < 1 ? '#7a3030' : '#3a2230');
            P.ellipse(x - sz * 0.3, y - sz * 0.2, sz * 0.5, sz * 0.25, ph < 1.5 ? '#a8443a' : '#4a2c38');
          }
        }
        // tlaková vlna – rozpínající se prstenec na obloze
        if (ph < 0.8){
          const rad = 8 + ph * 120, k = ph / 0.8;
          for (let a = 0; a < Math.PI; a += 1 / rad){
            const x = V.cx + Math.cos(a) * rad, y = V.top - Math.sin(a) * rad * 0.55;
            if ((Math.round(a * rad) % (k < 0.5 ? 1 : 2)) === 0) P.px(x, y, k < 0.4 ? '#ffd060' : '#c2442c');
          }
        }
        // lávový gejzír
        if (ph < 1.1){
          const hgt = Math.round(78 * Math.sin(Math.min(1, ph / 1.1) * Math.PI));
          for (let y = 0; y < hgt; y++){
            const f = y / Math.max(1, hgt);
            const w = Math.round(4 + f * 9 + Math.sin(t * 40 + y * 0.7) * 1.5);
            P.rect(V.cx - w - 1, V.top - y, w * 2 + 3, 1, '#c2401e');
            P.rect(V.cx - w, V.top - y, w * 2 + 1, 1, y > hgt - 8 ? '#ffe070' : (y + Math.floor(t * 30)) % 3 ? '#ff8a30' : '#ffd060');
            if (f < 0.6) P.rect(V.cx - Math.round(w * 0.35), V.top - y, Math.round(w * 0.7) + 1, 1, '#fff0a0');
          }
        }
        // lávové bomby (se září a ohnivou stopou) a jejich dopady
        for (const b of bombs){
          const tau = ph - b.delay;
          if (tau < 0) continue;
          if (tau < b.tl){
            for (let k = 6; k >= 0; k--){
              const tt = Math.max(0, tau - k * 0.035);
              const x = Math.round(b.x0 + b.vx * tt), y = Math.round(b.y0 + b.vy * tt + 0.5 * GRAVITY * tt * tt);
              const c = k === 0 ? '#fff0a0' : k < 2 ? '#ffd060' : k < 4 ? '#ff8a30' : k < 6 ? '#e2502a' : '#8a2a22';
              if (k === 0){
                const s2 = b.big ? 3 : 2;
                // žhavá záře kolem (dithering)
                for (let dy = -2; dy <= s2 + 1; dy++) for (let dx = -2; dx <= s2 + 1; dx++)
                  if ((x + dx + y + dy) % 2 === 0 && (dx < 0 || dy < 0 || dx >= s2 || dy >= s2)) P.px(x + dx, y + dy, '#c2401e');
                P.rect(x, y, s2, s2, '#ffd060');
                P.px(x, y, '#fff8d0');
              } else {
                P.rect(x, y, k < 3 && b.big ? 2 : 1, k < 3 ? 2 : 1, c);
              }
            }
          } else {
            // dopad: odstříknuté jiskry a žhnoucí skvrna, která chladne
            const age = tau - b.tl;
            if (age > 3.5) continue;
            if (age < 0.45){
              for (let k = 0; k < 4; k++){
                const a = Math.PI * (0.15 + k * 0.23), d = age * 26;
                P.px(b.lx + Math.cos(a) * d * (k % 2 ? 1 : -1), b.ly - Math.sin(a) * d + age * age * 40, age < 0.2 ? '#ffe070' : '#ff8a30');
              }
            }
            const c = age < 0.5 ? '#ffe070' : age < 1.4 ? '#ff8a30' : age < 2.4 ? '#d2401e' : '#6a1e22';
            const w = b.big ? 3 : 2;
            P.rect(b.lx - w, b.ly, w * 2 + 1, 1, c);
            P.rect(b.lx - w + 1, b.ly - 1, w * 2 - 1, 1, age < 1.4 ? '#ffd060' : c);
          }
        }
      } },
      { seed: 13, draw(P, r){   // čedičová zem
        P.bands(150, PX_H, ['#3a2834', '#3a2834', '#33232e', '#2d1f29', '#271a23', '#221620']);
        for (let i = 0; i < 520; i++){
          const x = Math.floor(r() * PX_W), y = 162 + Math.floor(Math.pow(r(), 0.8) * (PX_H - 162));
          const big = y > 200 && r() < 0.3;
          P.px(x, y, '#4a3644'); if (big){ P.px(x + 1, y, '#4a3644'); P.px(x, y + 1, '#160c14'); P.px(x + 1, y + 1, '#160c14'); }
        }
        // čedičové balvany (vepředu větší – perspektiva)
        const rr = pxRng(81);
        for (let i = 0; i < 8; i++){
          const y = 192 + rr() * 76, k = (y - 170) / 100;
          P.rock(rr() * PX_W, y, 5 + k * 12 + rr() * 5, 6 + k * 13 + rr() * 5, rr, VOLCANO_ROCK);
        }
        // tlumená záře kolem prasklin
        cracks.forEach(pts => pts.forEach(([x, y]) => { P.px(x, y - 1, '#5a1e24'); P.px(x, y + 1, '#4a1822'); }));
        // zvlněný horizont – nesmí jít níž než horní břeh lávové řeky
        const riverTop = x => x < river.length ? river[x][1] - river[x][2] - 3 : PX_H;
        P.horizon(pxRng(82), 160, 9, '#140a12', '#4a2a34').clip(riverTop);
      } },
      { seed: 15, draw(P){   // břehy lávové řeky (statické)
        for (const [x, y, w] of river){
          P.px(x, y - w - 1, '#140a12'); P.px(x, y + w + 1, '#140a12');
          P.px(x, y - w - 2, '#6a2026'); P.px(x, y + w + 2, '#5a1a22');
        }
      } },
      { dynamic: true, draw(P, r, t){   // tekoucí láva v řece
        for (const [x, y, w] of river){
          for (let dy = -w; dy <= w; dy++){
            const k = Math.sin((x - t * 14) * 0.22 + dy * 1.3) + Math.sin((x - t * 9) * 0.07);
            P.px(x, y + dy, k > 1.1 ? '#ffe070' : k > 0.1 ? '#ff9a30' : k > -0.9 ? '#ff6a20' : '#d2401e');
          }
        }
      } },
      { dynamic: true, draw(P, r, t){   // pulzující praskliny
        cracks.forEach((pts, ci) => pts.forEach(([x, y], j) => {
          const k = Math.sin(t * 2.2 + j * 0.25 + ci) ;
          P.px(x, y, k > 0.55 ? '#ffd060' : k > -0.2 ? '#ff7a28' : '#d2401e');
        }));
      } },
      { seed: 14, draw(P){   // čedičové plošinky se žhavými spárami
        const b = { out: '#120a12', side: '#33242e', sideDark: '#22161e', seam: '#c2401e', edge: '#4a3644', top: '#5c4656', center: '#6c5466', hi: '#8a6e7e' };
        // čedičový pahorek pod plošinkou soupeře – se žhavými puklinami a popelem u paty
        P.mound(PL.enemy, 194, pxRng(62), {
          out: '#120a12', body: '#2a1e28', lit: '#6a2a2c', shade: '#1a1018', foot: '#140a12',
          mud: ['#1e141c', '#261a24'], tuft: null, pebble: '#3e2c38',
          strata: ['#1c121a', '#3a2834'], platShadow: '#160c14',
          rock: VOLCANO_ROCK,
          seam: ['#5a1a22', '#ff6a20', '#ffd060'],
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, b);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, b);
      } },
      { dynamic: true, draw(P, r, t){   // jiskry stoupající vzhůru
        for (const e of embers){
          const ph = (t * 0.08 * e.v + e.p) % 1;
          const y = PX_H + 4 - ph * (PX_H * 0.85), x = e.x + Math.sin(t * 1.5 + e.w) * 4;
          if (Math.floor(t * 8 + e.w) % 5 === 0) continue;   // blikání
          P.px(x, y, ph < 0.5 ? '#ffd060' : '#ff7a28');
          if (ph < 0.3) P.px(x, y + 1, '#c2401e');
        }
      } },
    ],
  };
})();


/* =====================================================================
   ARÉNA 2: Bouřkový tesák – noční bouře, blesky bijí do skalní věže
   ===================================================================== */
const STORM_ROCK = { out: '#05060c', dark: '#151a2a', mid: '#222a40', light: '#34405e', hi: '#56668e', shadow: '#0c141c', glint: '#8fa0d8' };
const STORM = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const SP = { cx: 236, top: 70, base: 172 };      // skalní tesák uprostřed

  // silueta tesáku: zúžená, lehce zahnutá, zubatá
  const spr = pxRng(301);
  const spire = [];                                   // pro každý řádek [levý okraj, pravý okraj]
  let jl = 0, jr = 0;
  for (let y = SP.top; y <= SP.base; y++){
    const k = (y - SP.top) / (SP.base - SP.top);
    jl = jl * 0.7 + (spr() - 0.5) * 2.4; jr = jr * 0.7 + (spr() - 0.5) * 2.4;
    // skalní římsy: na několika místech se tesák skokově rozšíří
    const hw = 3 + 40 * k ** 1.3 + (k > 0.28 ? 4 : 0) + (k > 0.55 ? 5 : 0) + (k > 0.8 ? 6 : 0);
    const c = SP.cx + Math.sin(k * 2.4) * 6;
    spire.push([Math.round(c - hw * 1.05 + jl), Math.round(c + hw * 0.95 + jr)]);
  }
  // mrakový strop: zvlněná spodní hrana + boule (mammatus), pomalu se valí
  const CEIL_P = PX_W + 220;
  const ceilY = X => 46 + 9 * Math.sin(X * 0.021) + 6 * Math.sin(X * 0.057 + 1) + 3 * Math.sin(X * 0.16 + 2);
  const lr = pxRng(51);
  const lobes = Array.from({ length: 80 }, () => ({ x: lr() * CEIL_P, dy: lr() * 18 - 14, r: 9 + lr() * 14 }))
    .sort((a, b) => a.dy - b.dy);   // výš položené boule vzadu

  // mraky (sdílené statickou vrstvou i bleskovým nasvícením)
  const cr = pxRng(17);
  const clouds = Array.from({ length: 22 }, () => ({
    x: cr() * (PX_W + 80) - 40, y: 6 + cr() * 64, w: 26 + cr() * 50, h: 7 + cr() * 9,
  }));

  // kaluže
  const pr = pxRng(23);
  const puddles = Array.from({ length: 9 }, () => {
    const y = 178 + pr() * 88;
    return { x: pr() * PX_W, y, w: 8 + (y - 170) * 0.22 + pr() * 10, h: 1 + (y - 170) * 0.025 };
  });

  const puddleMask = new Uint8Array(PX_W * PX_H), puddlePx = [];   // naplní vrstva země
  const onPuddle = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && x < PX_W && puddleMask[y * PX_W + x]; };

  // tráva ve větru a kapky deště
  const gr = pxRng(29);
  const grass = Array.from({ length: 240 }, () => {
    const y = 172 + Math.floor(Math.pow(gr(), 0.75) * (PX_H - 174));
    return { x: Math.floor(gr() * PX_W), y, h: 2 + Math.floor((y - 170) / 30) + Math.floor(gr() * 2), p: gr() * 6 };
  });
  const rr = pxRng(31);
  const drops = Array.from({ length: 170 }, () => ({ x: rr() * (PX_W + 120), y: rr() * PX_H, v: 0.8 + rr() * 0.5, far: rr() < 0.5 }));

  // vítr: nárazy foukají doleva (stejným směrem jako déšť); 0 = bezvětří, ~1,4 = silný náraz
  const gustAt = t => Math.sin(t * 0.9) * 0.5 + Math.sin(t * 2.3) * 0.25 + 0.6;
  const trees = [];   // naplní statická vrstva, kreslí dynamická

  // blesky: každých ~4,2 s jeden, náhodný čas a cíl (deterministicky podle pořadí)
  const PERIOD = 4.2;
  function strike(t){
    const n = Math.floor(t / PERIOD), r = pxRng(n * 7919 + 13);
    const at = 0.6 + r() * 2.6, ph = t - n * PERIOD - at;
    const toSpire = r() < 0.55;
    return { n, r, ph, toSpire };
  }
  // intenzita záblesku 0–1 (dvojité mihnutí jako u skutečného blesku)
  function light(t){
    const { ph } = strike(t);
    if (ph < 0 || ph > 0.9) return 0;
    if (ph < 0.09) return 1;
    if (ph < 0.16) return 0.25;
    if (ph < 0.26) return 0.85;
    return Math.max(0, 0.6 * (1 - (ph - 0.26) / 0.64));
  }
  function boltPath(r, toSpire){
    const pts = [];
    let x = toSpire ? SP.cx + (r() - 0.5) * 70 : 30 + r() * 420, y = 40 + r() * 8;
    const tx = toSpire ? SP.cx : x + (r() - 0.5) * 80;
    const ty = toSpire ? SP.top + 1 : 172 + r() * 6;
    while (y < ty){
      const steps = 3 + Math.floor(r() * 5);
      x += (tx - x) * 0.18 + (r() - 0.5) * 9;
      for (let i = 0; i < steps && y < ty; i++){ y++; pts.push([Math.round(x + (r() - 0.5) * 1.5), Math.round(y)]); }
    }
    return pts;
  }

  /* ---------- efekty bouřky (každý jde vypnout v menu ARÉNA → Bouřková) ---------- */
  const step = t => Math.floor(t / 0.1);   // animace po 100 ms – stejný rytmus jako GIFy pokémonů

  // 2) vzdálené blýskání uvnitř mraků
  function sheetFlash(t){
    const P2 = 1.1, n = Math.floor(t / P2), r = pxRng(n * 3301 + 5);
    if (r() < 0.35) return null;
    const at = r() * 0.7, ph = t - n * P2 - at;
    if (ph < 0 || ph > 0.32) return null;
    const on = ph < 0.08 || (ph > 0.14 && ph < 0.24);
    return on ? { x: 20 + r() * 440, y: 18 + r() * 22, w: 22 + r() * 30, strong: ph < 0.08 } : null;
  }

  // 1) úder do tesáku: hvězdicový záblesk, tlaková vlna, sprška jisker, žhnoucí špička
  const IMPACT_LEN = 3, SPARK_G = 80;
  function drawImpact(P, t){
    const { n, ph, toSpire } = strike(t);
    if (!toSpire || ph < 0 || ph > IMPACT_LEN) return;
    const tx = SP.cx, ty = SP.top, st = step(t);
    // žhnoucí špička (chladne z bílé přes modrou)
    const glow = ph < 0.4 ? '#ffffff' : ph < 0.9 ? '#c8d4ff' : ph < 1.4 ? '#8a9ae0' : '#4a5aa0';
    P.ellipse(tx, ty, 2, 1, glow);
    // hvězdicový záblesk – paprsky blikají po 100 ms
    if (ph < 0.35){
      const rr = pxRng(st * 31 + n);
      for (let i = 0; i < 10; i++){
        const a = (i / 10) * Math.PI * 2 + rr() * 0.3, len = 5 + rr() * 12 * (1 - ph / 0.35);
        for (let k = 1; k < len; k++) P.px(tx + Math.cos(a) * k, ty + Math.sin(a) * k * 0.8, k < len * 0.4 ? '#ffffff' : '#a8b8ff');
      }
      P.ellipse(tx, ty, 4, 3, '#ffffff');
    }
    // sprška jisker po balistických drahách, s krátkou stopou, postupně dohasínají
    const r = pxRng(n * 911 + 17);
    const count = 20 + Math.floor(r() * 10);
    for (let i = 0; i < count; i++){
      const vx = (r() - 0.5) * 150, vy = -(20 + r() * 80), life = 1.2 + r() * 1.6, big = r() < 0.45;
      if (ph > life) continue;
      const fade = ph / life;
      const col = fade < 0.2 ? '#fffbe0' : fade < 0.45 ? '#ffe8a0' : fade < 0.7 ? '#c8d4ff' : '#6a7ad0';   // žhavé → chladnoucí
      if (fade > 0.75 && (step(t) + i) % 2) continue;                      // na konci doblikávají
      // stopa (5 předchozích poloh)
      for (let k = 5; k >= 1; k--){
        const tt = Math.max(0, ph - k * 0.035);
        P.px(tx + vx * tt, ty + vy * tt + 0.5 * SPARK_G * tt * tt, fade < 0.45 ? (k < 3 ? '#ffd080' : '#a0703a') : (k < 3 ? '#8a9ae0' : '#3a4890'));
      }
      // hlava jiskry: 2×2 (velké 3×3 s křížkem záře)
      const x = Math.round(tx + vx * ph), y = Math.round(ty + vy * ph + 0.5 * SPARK_G * ph * ph);
      if (big && fade < 0.6){
        P.px(x, y - 2, '#a8b8ff'); P.px(x, y + 2, '#a8b8ff'); P.px(x - 2, y, '#a8b8ff'); P.px(x + 2, y, '#a8b8ff');
        P.rect(x - 1, y - 1, 3, 3, col); P.px(x, y, '#ffffff');
      } else {
        P.rect(x, y, 2, 2, col);
      }
    }
  }

  // 10) hejno, které se pere s větrem (letí doprava proti větru, nárazy ho vrací)
  function windBirds(t){
    const out = [], PER = 26, n = Math.floor(t / PER);
    for (let k = n; k >= n - 2 && k >= 0; k--){
      const r = pxRng(k * 2713 + 3);
      if (r() < 0.3) continue;
      const start = r() * PER, ph = t - k * PER - start, dur = 42;
      if (ph < 0 || ph > dur) continue;
      out.push({ ph, y: 82 + r() * 40, count: 3 + Math.floor(r() * 4), seed: k });
    }
    return out;
  }
  function drawWindBirds(P, t){
    for (const f of windBirds(t)){
      // dopředu 16 px/s, nárazy větru je strkají zpátky a nahoru/dolů
      const x = -30 + f.ph * 16 - (gustAt(t) - 0.6) * 18;
      const fr = pxRng(f.seed * 17 + 1);
      for (let i = 0; i < f.count; i++){
        const bx = Math.round(x - i * 8 - fr() * 6), by = Math.round(f.y + Math.sin(t * 3 + i * 1.7) * 3 + (fr() - 0.5) * 10 + gustAt(t) * (i % 2 ? 2 : -2));
        const w = [2, 1, -1, -2][(step(t) + i) % 4];                        // rychlé zoufalé mávání
        P.rect(bx - 1, by, 4, 1, '#05060c'); P.px(bx + 3, by - 1, '#05060c');
        P.line(bx - 1, by, bx - 4, by - w, 1, '#05060c'); P.line(bx - 4, by - w, bx - 6, by - w * 2, 1, '#05060c');
        P.line(bx + 2, by, bx + 4, by - w, 1, '#05060c'); P.line(bx + 4, by - w, bx + 6, by - w * 2, 1, '#05060c');
      }
    }
  }

  // 5) cákance dopadajících kapek na plošinkách, kamenech a v trávě
  const sr2 = pxRng(57);
  const splashSlots = Array.from({ length: 70 }, () => ({ p: 0.45 + sr2() * 0.5, o: sr2() * 3, s: sr2() * 1000 }));
  function splashPos(r){
    const pick = r();
    if (pick < 0.35){                                                       // plošinka hráče
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      return [PL.player.x + Math.cos(a) * PL.player.rx * d * 0.95, PL.player.y + Math.sin(a) * PL.player.ry * d * 0.9];
    }
    if (pick < 0.5){                                                        // plošinka soupeře
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      return [PL.enemy.x + Math.cos(a) * PL.enemy.rx * d * 0.95, PL.enemy.y + Math.sin(a) * PL.enemy.ry * d * 0.9];
    }
    return [r() * PX_W, 180 + Math.pow(r(), 0.7) * 88];                     // tráva a kaluže (víc vepředu)
  }
  function drawSplashes(P, t, L){
    for (const sl of splashSlots){
      const tt = t + sl.o, n = Math.floor(tt / sl.p), ph = (tt % sl.p) / sl.p;
      const f = Math.floor(ph * sl.p / 0.1);                                // snímek cákance po 100 ms
      if (f > 2) continue;
      const [x, y] = splashPos(pxRng(pxMix(Math.floor(sl.s) * 7919 + n)));
      const c = L > 0.5 ? '#e0e8ff' : f === 0 ? '#9aaae0' : '#6a7ab0';
      if (f === 0){ P.px(x, y, c); P.px(x, y - 1, c); P.px(x, y - 2, '#c8d4ff'); }
      else if (f === 1){ P.px(x - 1, y - 1, c); P.px(x + 1, y - 1, c); P.px(x - 2, y - 2, c); P.px(x + 2, y - 2, c); P.rect(x - 1, y, 3, 1, c); }
      else { P.px(x - 3, y - 1, c); P.px(x + 3, y - 1, c); P.px(x - 2, y, '#4a5a90'); P.px(x + 2, y, '#4a5a90'); }
    }
  }

  // 11) listí a větvičky unášené větrem (doleva)
  function drawDebris(P, t){
    const PER = 1.3, n = Math.floor(t / PER);
    for (let k = n; k >= n - 6 && k >= 0; k--){
      const r = pxRng(k * 1931 + 11);
      if (r() < 0.15) continue;
      const pieces = 2 + Math.floor(r() * 4);
      for (let i = 0; i < pieces; i++){
        const start = r() * PER + i * 0.3, ph = t - k * PER - start, v = 90 + r() * 70;
        const y0 = 110 + r() * 150, leaf = r() < 0.7, col = r() < 0.5 ? '#3e6a62' : '#5a7a4a';
        if (ph < 0) continue;
        const x = PX_W + 10 - ph * v, y = y0 + Math.sin(ph * 4 + i) * 8 + ph * 6;
        if (x < -10) continue;
        const rot = (step(t) + i) % 4;                                       // otáčí se po 100 ms
        if (leaf){
          const shapes = [[[0, 0], [1, 0], [1, -1]], [[0, 0], [0, -1], [1, -1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [1, -1], [2, -1]]];
          for (const [dx, dy] of shapes[rot]) P.px(x + dx, y + dy, col);
        } else {
          const tw = [[[0, 0], [1, 0], [2, 0], [3, -1]], [[0, 0], [1, -1], [2, -1], [3, -2]], [[0, 0], [0, -1], [1, -2], [1, -3]], [[0, -2], [1, -1], [2, -1], [3, 0]]];
          for (const [dx, dy] of tw[rot]) P.px(x + dx, y + dy, '#2a1e18');
        }
      }
    }
  }

  return {
    name: 'Bouřkový tesák',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 20,
    light,
    layers: [
      { seed: 31, draw(P){   // noční nebe
        P.bands(0, 172, ['#07080f', '#0b0d1a', '#101326', '#161a33', '#1d2340', '#252c4d', '#2f375a']);
      } },
      { dynamic: true, draw(P, r, t){   // ptáci bojující s větrem (za tesákem)
        if (PX_OPTIONS.stormWindBirds) drawWindBirds(P, t);
      } },
      { seed: 32, draw(P, r){   // vzdálené hřebeny + tesák
        P.ridge(pxRidgeLine(r, 40, 1.2), 170, { body: '#141a2e', shade: '#10142a', line: '#232b48' });
        P.ridge(pxRidgeLine(r, 20, 0.8), 174, { body: '#0f1424', shade: '#0c101e', line: '#1b2238' });
        spire.forEach(([l, rr2], i) => {
          const y = SP.top + i;
          P.rect(l - 1, y, rr2 - l + 3, 1, '#05060c');
          // hrana nasvícená zleva + nepravidelný přechod do stínu
          const split = l + Math.round((rr2 - l) * (0.35 + Math.sin(i * 0.21) * 0.08 + (r() - 0.5) * 0.06));
          P.rect(l, y, split - l, 1, '#1f2640');
          P.rect(split, y, rr2 - split + 1, 1, '#151a2e');
          if ((i + split) % 2) P.px(split, y, '#1a2036');
          P.px(l, y, '#38446a');
        });
        // suché pokroucené stromy na obzoru – tady se jen "postaví",
        // kreslí se v dynamické vrstvě, protože se ohýbají ve větru
        const tree = (x0, y0, h, dir) => {
          const T = { h, amp: h * 0.14, trunk: [], branches: [] };
          let x = x0;
          for (let k = 0; k < h; k++){ x += dir * (k / h) * 0.5; T.trunk.push({ x, y: y0 - k, w: k < h * 0.3 ? 3 : 2, hf: k / h }); }
          for (let b = 0; b < 6; b++){
            let bx = x0 + dir * (b / 6) * h * 0.25, by = y0 - h * (0.35 + b * 0.1);
            const bd = (b % 2 ? 1 : -1) * 0.8 + dir * 0.9, pts = [];
            for (let k = 0; k < 6 + r() * 10; k++){ bx += bd + (r() - 0.5) * 0.6; by -= 0.5 + r() * 0.6; pts.push({ x: bx, y: by, hf: (y0 - by) / h }); }
            T.branches.push(pts);
          }
          return T;
        };
        trees.length = 0;
        trees.push(tree(440, 175, 52, -1), tree(26, 176, 36, 1));
        // praskliny ve skále
        for (let k = 0; k < 7; k++){
          let i = Math.floor(r() * (spire.length - 20)) + 10, x = spire[i][0] + 3 + r() * (spire[i][1] - spire[i][0] - 6);
          for (let j = 0; j < 8 + r() * 14 && i < spire.length; j++, i++){ x += (r() - 0.5) * 1.4; P.px(x, SP.top + i, '#0a0c18'); }
        }
      } },
      { dynamic: true, draw(P, r, t){   // stromy ohýbané větrem
        const L = light(t);
        trees.forEach((T, ti) => {
          // ohyb roste od kořenů ke špičce; k nárazu přidává rychlé chvění
          const sway = -(gustAt(t) * 0.9 + Math.sin(t * 4.3 + ti * 2) * 0.22);
          const off = hf => Math.round(sway * hf ** 1.6 * T.amp);
          for (const p of T.trunk){
            P.rect(p.x + off(p.hf), p.y, p.w, 1, '#05060c');
            if (L > 0.6) P.px(p.x + off(p.hf), p.y, '#3a4670');            // okraj nasvícený bleskem
          }
          T.branches.forEach((br, bi) => br.forEach((p, i) => {
            const flutter = Math.round(Math.sin(t * 7.5 + ti * 3 + bi * 1.3) * 1.2 * (i / br.length));
            P.px(p.x + off(p.hf) + flutter, p.y, '#05060c');
          }));
        });
      } },
      { dynamic: true, draw(P, r, t){   // valící se mrakový strop, nasvícení tesáku, blesk
        const L = light(t), off = t * 5;
        const body = L > 0.7 ? '#2a3256' : '#151a33', fill = L > 0.7 ? '#20284a' : '#10142a';
        for (let x = 0; x < PX_W; x++) P.rect(x, 0, 1, Math.round(ceilY(x + off)) - 4, fill);
        for (const lb of lobes){
          const x = ((lb.x - off) % CEIL_P + CEIL_P) % CEIL_P - 110;
          const y = ceilY(x + off) + lb.dy;
          P.ellipse(x, y + 2, lb.r + 1, lb.r * 0.55 + 1, '#070912');
          P.ellipse(x, y, lb.r, lb.r * 0.55, body);
          P.ellipse(x - lb.r * 0.3, y - lb.r * 0.2, lb.r * 0.5, lb.r * 0.25, L > 0.7 ? '#3a4678' : '#1b2140');
          // spodní okraj boule chytá světlo zespodu
          P.rect(x - lb.r * 0.6, y + Math.round(lb.r * 0.55), lb.r * 1.2, 1, L > 0.5 ? '#aab6ee' : '#232a4a');
        }
        // vzdálené blýskání uvnitř mraků
        if (PX_OPTIONS.stormSheet && L < 0.3){
          const sf = sheetFlash(t);
          if (sf) for (const lb of lobes){
            const x = ((lb.x - off) % CEIL_P + CEIL_P) % CEIL_P - 110;
            if (Math.abs(x - sf.x) > sf.w) continue;
            const y = ceilY(x + off) + lb.dy;
            P.ellipse(x - lb.r * 0.2, y - lb.r * 0.1, lb.r * 0.7, lb.r * 0.38, sf.strong ? '#3a4680' : '#262e58');
            P.rect(x - lb.r * 0.5, y + Math.round(lb.r * 0.55), lb.r, 1, sf.strong ? '#7a88c8' : '#4a5690');
          }
        }
        // tesák při záblesku: nasvícená levá hrana
        if (L > 0.4) spire.forEach(([l], i) => { P.px(l, SP.top + i, '#c8d4ff'); P.px(l + 1, SP.top + i, '#5a6aa8'); });

        const s = strike(t);
        if (s.ph >= 0 && s.ph < 0.3 && (s.ph < 0.09 || s.ph > 0.16)){
          const pts = boltPath(s.r, s.toSpire);
          for (const [x, y] of pts){ P.px(x - 1, y, '#5a6ad0'); P.px(x + 1, y, '#5a6ad0'); }
          for (const [x, y] of pts) P.px(x, y, '#ffffff');
          for (let b = 0; b < 3; b++){   // větve
            const start = pts[Math.floor(s.r() * pts.length * 0.7)]; if (!start) continue;
            let [x, y] = start; const dir = s.r() < 0.5 ? -1 : 1;
            for (let k = 0; k < 8 + s.r() * 18; k++){ x += dir * (0.4 + s.r() * 1.2); y += 1; P.px(x, y, '#c8d4ff'); }
          }
          const end = pts[pts.length - 1];
          if (end){ P.ellipse(end[0], end[1], 6, 3, '#c8d4ff'); P.ellipse(end[0], end[1], 3, 1, '#ffffff'); }
        }
        if (PX_OPTIONS.stormImpact) drawImpact(P, t);
      } },
      { seed: 34, draw(P, r){   // mokrá noční pláň
        P.bands(162, PX_H, ['#16222a', '#16222a', '#182630', '#1a2a33', '#1c2d36', '#1e3039']);
        for (let i = 0; i < 400; i++){
          const x = Math.floor(r() * PX_W), y = 174 + Math.floor(Math.pow(r(), 0.8) * (PX_H - 174));
          P.px(x, y, r() < 0.5 ? '#122028' : '#24383f');
        }
        for (const p of puddles){
          P.ellipse(p.x, p.y, p.w + 1, p.h + 1, '#0c141c');
          P.ellipse(p.x, p.y, p.w, p.h, '#1e2b4a');
          P.rect(p.x - p.w * 0.6, p.y - p.h, p.w * 0.5, 1, '#2c3c64');
        }
        // mokré balvany rozházené po pláni
        const sr = pxRng(71);
        for (let i = 0; i < 6; i++){
          const y = 188 + sr() * 78, k = (y - 170) / 100;
          P.rock(20 + sr() * 440, y, 5 + k * 12 + sr() * 4, 6 + k * 12 + sr() * 4, sr, STORM_ROCK);
        }
        // zvlněný horizont
        P.horizon(pxRng(72), 173, 8, '#0a1016', '#24383f').clip();
        // viditelné pixely kaluží (kameny, které na nich leží, je zakrývají) – pro záblesk a kroužky
        const d = P.ctx.getImageData(0, 0, PX_W, PX_H).data;
        puddleMask.fill(0); puddlePx.length = 0;
        for (let i = 0; i < PX_W * PX_H; i++){
          const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
          const body = R === 0x1e && G === 0x2b && B === 0x4a, hl = R === 0x2c && G === 0x3c && B === 0x64;
          if (body || hl){ puddleMask[i] = 1; puddlePx.push(i, hl ? 1 : 0); }
        }
      } },
      { dynamic: true, draw(P, r, t){   // kaluže při blesku, kroužky od kapek, tráva ve větru
        const L = light(t);
        if (L > 0.2){
          const body = L > 0.7 ? '#9aaae0' : '#4a5a90';
          for (let k = 0; k < puddlePx.length; k += 2){
            const i = puddlePx[k];
            P.px(i % PX_W, Math.floor(i / PX_W), puddlePx[k + 1] ? '#d8e0ff' : body);
          }
        }
        puddles.forEach((p, i) => {
          for (let k = 0; k < 2; k++){
            const ph = (t * 1.3 + i * 0.37 + k * 0.5) % 1;
            const rx = 1 + ph * 4, x = p.x + Math.sin(i * 7 + k * 3 + Math.floor(t * 1.3 + i * 0.37 + k * 0.5) * 5) * p.w * 0.6;
            if (ph < 0.8){
              if (onPuddle(x - rx, p.y)) P.px(x - rx, p.y, '#5a6a9a');
              if (onPuddle(x + rx, p.y)) P.px(x + rx, p.y, '#5a6a9a');
            }
          }
        });
        const gust = gustAt(t);
        for (const g of grass){
          const bend = -Math.round((Math.sin(t * 3 + g.p + g.x * 0.05) * 0.5 + gust) * g.h * 0.7);
          for (let k = 0; k < g.h; k++){
            const x = g.x + Math.round(bend * k / g.h);
            P.px(x, g.y - k, L > 0.6 ? '#5a8a8a' : k === g.h - 1 ? '#3e6a62' : '#24443e');
          }
        }
      } },
      { seed: 35, draw(P){   // mokré kamenné plošinky
        const st = { out: '#05060c', side: '#232a3e', sideDark: '#161b2a', seam: '#2e3854', edge: '#2c3450', top: '#3a4462', center: '#46527a', hi: '#7484b8' };
        // skalnatý pahorek pod plošinkou soupeře, ať nevisí ve vzduchu
        P.mound(PL.enemy, 198, pxRng(61), {
          out: '#05060c', body: '#1a2032', lit: '#2e3854', shade: '#12162a', foot: '#0a0e16',
          mud: ['#141c22', '#18232a'], tuft: ['#24443e', '#3e6a62'], pebble: '#2c3550',
          strata: ['#121626', '#252d46'], platShadow: '#0a0c16',
          rock: STORM_ROCK,
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        // louže na plošinkách
        P.ellipse(PL.player.x + 38, PL.player.y + 6, 14, 2, '#566394'); P.rect(PL.player.x + 30, PL.player.y + 5, 6, 1, '#8fa0d8');
        P.ellipse(PL.enemy.x - 24, PL.enemy.y + 3, 9, 1, '#566394');
      } },
      { dynamic: true, draw(P, r, t){   // šikmý déšť + celkový záblesk
        const L = light(t);
        for (const d of drops){
          const y = (d.y + t * 260 * d.v) % (PX_H + 10) - 5;
          const x = ((d.x - t * 70 * d.v - y * 0.27) % (PX_W + 120) + PX_W + 120) % (PX_W + 120) - 60;
          const c = L > 0.5 ? '#c0ccf0' : d.far ? '#34406a' : '#5a6a9e';
          P.px(x, y, c); P.px(x - 1, y + 3, c);
          if (!d.far){ P.px(x, y + 1, c); P.px(x - 1, y + 2, c); }
        }
        if (PX_OPTIONS.stormSplash) drawSplashes(P, t, L);
        if (PX_OPTIONS.stormDebris) drawDebris(P, t);
        if (L > 0){
          P.ctx.globalAlpha = L * 0.16;
          P.rect(0, 0, PX_W, PX_H, '#b8c6ff');
          P.ctx.globalAlpha = 1;
        }
      } },
    ],
  };
})();


/* =====================================================================
   ARÉNA 3: Sněžný štít – noční vánice pod zubatým štítem, měsíc vlevo
   ===================================================================== */
const SNOW_ROCK = { out: '#0a0e1a', dark: '#1e2638', mid: '#2c3650', light: '#3e4a68', hi: '#5a6a8a', shadow: '#7a88a8',
                    snow: '#dce6f2', snowShade: '#9aa8c4' };
const MOUNTAIN = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const MOON = { x: 70, y: 40 };
  const PK = { cx: 214, top: 22, base: 176 };
  const step = t => Math.floor(t / 0.1);

  // vítr: nárazy foukají doleva; při silném poryvu se zvedne vánice
  const gustAt = t => 0.7 + Math.sin(t * 0.45) * 0.45 + Math.sin(t * 1.7 + 1) * 0.25 + Math.sin(t * 3.1) * 0.1;
  // integrál gustAt: kolik větru "proteklo" do času t – roste vždy, jen různě rychle
  const gustInt = t => 0.7 * t - Math.cos(t * 0.45) - Math.cos(t * 1.7 + 1) * 0.25 / 1.7 - Math.cos(t * 3.1) * 0.1 / 3.1;
  // posun větrem: základní rychlost + poryvy (vždy dopředu, nikdy zpátky)
  const windPos = (t, base, gustK) => base * t + gustK * gustInt(t);

  // silueta štítu (pro každý sloupec horní okraj, nebo null)
  const pr = pxRng(401);
  const jag = pxRidgeLine(pr, 24, 1.9);
  const haze = pxRidgeLine(pr, 1, 1.2);                          // nepravidelná hranice spodního oparu
  const peakY = Array.from({ length: PX_W }, (_, x) => {
    const d = x - PK.cx, t = d < 0 ? -d / 200 : d / 230;
    if (t > 1) return null;
    let y = PK.top + (PK.base - PK.top) * Math.pow(t, 0.72) + (jag[x] - 12) * (0.3 + t * 1.1);
    y -= 18 * Math.exp(-(((x - 338) / 22) ** 2));               // rameno vpravo
    y -= 14 * Math.exp(-(((x - 140) / 14) ** 2));               // vedlejší vrchol vlevo
    y -= 8 * Math.exp(-(((x - 270) / 10) ** 2));                // zub na pravém hřebeni
    return Math.max(PK.top, Math.round(y));
  });
  // hranice světla a stínu (měsíc vlevo → osvětlená levá strana), lomená
  const term = [];
  { let bx = PK.cx + 2; for (let y = 0; y <= PK.base + 4; y++){ if (y > PK.top) bx += (pr() - 0.45) * 2 + (pr() < 0.07 ? (pr() - 0.5) * 7 : 0); bx = Math.max(PK.cx - 20, Math.min(PK.cx + 46, bx)); term.push(Math.round(bx)); } }
  // skalní žlaby (kuloáry), kde vítr odfoukal sníh
  const gullies = Array.from({ length: 14 }, () => {
    const pts = []; let x = PK.cx + (pr() - 0.5) * 300;
    const top = peakY[Math.round(x)]; if (top == null) return pts;
    let y = top + 2 + pr() * 10; const len = 10 + pr() * 55;
    for (let k = 0; k < len; k++, y++){ x += (x < PK.cx ? -0.5 : 0.5) + (pr() - 0.5) * 1.1; pts.push([Math.round(x), Math.round(y), pr() < 0.5 ? 2 : 1]); }
    return pts;
  });

  // sněhový chochol strhávaný ze špičky
  const pq = pxRng(777);
  const plume = Array.from({ length: 170 }, (_, i) => ({ o: i / 170, a: pq(), b: pq() }));
  // zvířený sníh nad zemí
  const dr = pxRng(503);
  const drifts = Array.from({ length: 34 }, () => ({ x: dr() * PX_W, y: 178 + Math.pow(dr(), 0.7) * 88, v: 40 + dr() * 45, len: 5 + dr() * 12, o: dr() * 10 }));
  // třpyt sněhu
  const sparkles = Array.from({ length: 50 }, () => ({ x: dr() * PX_W, y: 180 + dr() * 88, p: 1.5 + dr() * 3, o: dr() * 5 }));
  // vločky ve třech hloubkách: vzdálené / střední / blízké
  const fr = pxRng(607);
  const flakes = Array.from({ length: 560 }, (_, i) => {
    const layer = i < 240 ? 0 : i < 450 ? 1 : 2;
    return { layer, x: fr() * (PX_W + 200), y: fr() * PX_H, w: fr() * 6, th: fr() };
  });
  const FLAKE = [
    { v: 18, drift: 30, col: '#7a8aaa', size: 1 },
    { v: 32, drift: 60, col: '#c8d4e8', size: 1 },
    { v: 52, drift: 105, col: '#f2f6ff', size: 2 },
  ];

  /* zasněžené smrky: patra s převislými konci větví, sněhové čepice (světlé ze strany měsíce),
     visící hroudy sněhu; v dynamické vrstvě se pohupují ve větru (víc ke špičce) a při
     silném poryvu z nich vítr sfoukne trochu sněhu */
  const PINE_FRONT = { out: '#081020', d: '#122238', m: '#1a2e46', l: '#24405a', s1: '#f2f6ff', s2: '#dce6f2', s3: '#9aa8c4', trunk: '#1a1410' };
  const PINE_BACK  = { out: '#24304c', d: '#2e3c5a', m: '#36466a', l: '#40527a', s1: '#c8d4e8', s2: '#aebcd8', s3: '#7e8cae', trunk: '#2a3048' };
  const pines = [];   // naplní statická vrstva (kvůli tvaru kopců), kreslí dynamická
  function drawPine(P, p, t, g, idx){
    const c = p.back ? PINE_BACK : PINE_FRONT, h = p.h, T = p.tier, top = p.by - 3 - h;
    const sway = -(g * 0.55 + Math.sin(t * 2.1 + p.ph) * 0.22);
    const amp = h * (p.back ? 0.06 : 0.09);
    const off = i => Math.round(sway * ((h - i) / h) ** 1.6 * amp);   // i = řádek od špičky
    P.rect(p.x - 1, p.by - 3, 2, 4, c.trunk);
    P.px(p.x + off(0), top - 1, c.s1);
    for (let i = 0; i < h; i++){
      const y = top + i, k = i % T, X = p.x + off(i);
      const hw = Math.floor(k * (p.back ? 0.8 : 0.95) + i * 0.27);
      P.rect(X - hw - 1, y, hw * 2 + 3, 1, c.out);
      if (k <= 1){                                                   // sněhová čepice patra
        P.rect(X - hw, y, hw, 1, c.s1); P.rect(X, y, hw + 1, 1, c.s3); P.px(X, y, c.s2);
      } else if (k === 2){                                           // sníh jen na osvětlené straně
        P.rect(X - hw, y, hw + 1, 1, c.m); P.rect(X - hw, y, Math.max(1, Math.floor(hw * 0.6)), 1, c.s2);
        P.rect(X + Math.ceil(hw * 0.4), y, Math.max(0, hw - Math.ceil(hw * 0.4)) + 1, 1, c.d);
      } else {                                                       // jehličí
        P.rect(X - hw, y, hw * 2 + 1, 1, c.m);
        P.rect(X - hw, y, Math.max(1, Math.floor(hw * 0.5)), 1, c.l);
        P.rect(X + Math.ceil(hw * 0.35) + 1, y, Math.max(0, hw - Math.ceil(hw * 0.35)), 1, c.d);
      }
      if (k === T - 1 && i > 2){                                     // převislé konce větví s hroudou sněhu
        P.px(X - hw - 1, y + 1, c.out); P.px(X + hw + 1, y + 1, c.out);
        if ((i + p.x) % 3) P.px(X - hw - 1, y + 2, c.s2);
      }
    }
    // silný poryv sfoukne z vršku sníh
    if (!p.back && g > 1.05 && (idx + Math.floor(t * 1.5)) % 5 === 0){
      const ph = (t * 1.5) % 1;
      for (let k = 0; k < 5; k++) P.px(p.x + off(0) - ph * 14 - k * 2, top + 2 + k * 0.6 + ph * 4, k < 2 ? c.s1 : c.s3);
    }
  }

  return {
    name: 'Sněžný štít',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 20,
    layers: [
      { seed: 41, draw(P){   // noční obloha + měsíc za vánicí
        P.bands(0, 178, ['#0b1020', '#101830', '#16203a', '#1e2a46', '#283654', '#344462', '#425272']);
        for (let y = -26; y <= 26; y++) for (let x = -34; x <= 34; x++){           // měkká záře (dithering)
          const d = Math.hypot(x, y * 1.2);
          if (d < 34 && (x + y) % (d < 18 ? 2 : 3) === 0) P.px(MOON.x + x, MOON.y + y, d < 18 ? '#4a5a7e' : '#34446a');
        }
        P.ellipse(MOON.x, MOON.y, 10, 10, '#c8d6ea'); P.ellipse(MOON.x - 1, MOON.y - 1, 8, 8, '#e8f0fa');
        P.ellipse(MOON.x + 3, MOON.y + 2, 2, 2, '#c0cee2'); P.ellipse(MOON.x - 3, MOON.y - 3, 1, 1, '#c8d6ea'); P.px(MOON.x + 4, MOON.y - 4, '#c8d6ea');
      } },
      { dynamic: true, draw(P, r, t){   // pruhy sněhového oparu hnané větrem přes oblohu
        if (!PX_OPTIONS.snowBlizzard) return;
        const g = gustAt(t);
        for (let b = 0; b < 6; b++){
          const span = PX_W + 220, cx = ((b * 97 + 40 - windPos(t, 7 + b * 2, 7 + b * 2)) % span + span) % span - 110;
          const cy = 40 + (b * 37) % 110, rx = 40 + (b % 3) * 18, ry = 7 + (b % 2) * 5;
          for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++){
            const d = (x / rx) ** 2 + (y / ry) ** 2 + Math.sin((x + cx) * 0.15 + y) * 0.15;
            if (d > 1) continue;
            const dens = d < 0.35 ? 2 : d < 0.7 ? 3 : 5;
            if ((x + y * 2 + step(t)) % dens === 0) P.px(cx + x - y * 0.6, cy + y, d < 0.35 ? '#5a6a8e' : '#46567a');
          }
        }
      } },
      { seed: 42, draw(P, r){   // vzdálené hory, štít, zasněžené kopce a smrky
        P.ridge(pxRidgeLine(r, 56, 1.2), 156, { body: '#3a4866', shade: '#2e3c58', line: '#56688a', snow: '#8696b6', snowShade: '#6a7a9a', snowLine: 18 });
        // štít
        for (let x = 0; x < PX_W; x++){
          const top = peakY[x]; if (top == null) continue;
          for (let y = top; y < PK.base + 4; y++){
            const d = x - term[y], depth = (y - PK.top) / (PK.base - PK.top);
            const lowEdge = 0.5 + (haze[x] - 0.5) * 0.35, dith = ((x * 7 + y * 13) % 10) / 10 * 0.08;
            const low = depth + dith > lowEdge;
            let c;
            if (d < -2) c = low ? '#b4c2da' : '#d0dcee';
            else if (d > 2) c = low ? '#5a6888' : '#6a7a9a';
            else c = (x + y) % 2 ? (d < 0 ? '#b4c2da' : '#6a7a9a') : '#8a98b8';
            P.px(x, y, c);
          }
          P.px(x, top, x < term[top] ? '#f2f6ff' : '#8a98b8');          // hřebenová hrana
        }
        // skalní výchozy (tmavá skála se sněhem nahoře)
        const PEAK_ROCK = { ...SNOW_ROCK, shadow: '#9aa8c4' };
        for (let i = 0; i < 18; i++){
          const x0 = PK.cx + (r() - 0.5) * 330, top = peakY[Math.round(x0)]; if (top == null) continue;
          const y0 = top + 8 + r() * 60;
          if (y0 > PK.base - 6) continue;
          P.rock(x0, y0, 2 + r() * 4, 3 + r() * 3, r, PEAK_ROCK);
        }
        // skalní žlaby
        for (const g of gullies) for (const [x, y, w] of g){
          const top = peakY[x]; if (top == null || y < top + 1) continue;
          const lit = x < term[y];
          P.rect(x, y, w, 1, lit ? '#3a4462' : '#262e44');
          if (lit) P.px(x - 1, y, '#8a98b8');
        }
        // zasněžené kopce u paty a smrky
        const hills = pxRidgeLine(r, 16, 0.7);
        P.ridge(hills, 176, { body: '#8e9cbc', shade: '#7a88a8', line: '#c8d4e8' });
        pines.length = 0;
        const pr2 = pxRng(4201);
        for (let x = 4; x < PX_W; x += 10 + Math.floor(r() * 9))
          pines.push({ x, by: Math.round(178 - hills[x] * 0.5), h: 12 + Math.floor(r() * 9), back: true, tier: 5, ph: pr2() * 6 });
        for (let x = 0; x < PX_W; x += 16 + Math.floor(r() * 16))
          pines.push({ x, by: 182, h: 18 + Math.floor(r() * 12), back: false, tier: 5 + Math.floor(pr2() * 2), ph: pr2() * 6 });
      } },
      { dynamic: true, draw(P, r, t){   // zasněžené smrky pohupující se ve větru
        const g = gustAt(t);
        pines.forEach((p, i) => drawPine(P, p, t, g, i));
      } },
      { dynamic: true, draw(P, r, t){   // sněhový chochol strhávaný ze špičky
        if (!PX_OPTIONS.snowPlume) return;
        const g = gustAt(t);
        for (const q of plume){
          const ph = (windPos(t, 0.22, 0.12) + q.o) % 1;
          const x = PK.cx - ph * 150 - q.a * 10;
          const y = PK.top + 1 + ph * 10 + (q.b - 0.5) * ph * 34 + Math.sin(ph * 9 + q.a * 6) * 3 * ph;   // rozšiřuje se
          if (ph > 0.6 && (Math.round(x) + Math.round(y)) % 2) continue;     // na konci řídne
          const c = ph < 0.25 ? '#f2f6ff' : ph < 0.55 ? '#c8d4e8' : '#8a98b8';
          if (ph < 0.4) P.rect(x, y, 2, 1, c); else P.px(x, y, c);
        }
      } },
      { seed: 43, draw(P, r){   // zasněžená pláň: závěje, vlnky od větru, kameny
        P.bands(160, PX_H, ['#8e9cbc', '#8e9cbc', '#98a6c4', '#a4b2ce', '#aebcd8', '#b8c6e0']);
        // vlnky navátého sněhu (sastrugi)
        for (let i = 0; i < 40; i++){
          const y = 182 + Math.pow(r(), 0.8) * 84, x0 = r() * PX_W, len = 14 + r() * 40 * ((y - 170) / 100);
          for (let k = 0; k < len; k++){ const x = x0 + k, yy = y + Math.round(Math.sin(k * 0.3 + i) * 1); P.px(x, yy, '#7e8cae'); P.px(x, yy - 1, '#c8d4e8'); }
        }
        // kameny se sněhovými čepicemi
        const sr = pxRng(91);
        for (let i = 0; i < 7; i++){
          const y = 190 + sr() * 76, k = (y - 170) / 100;
          P.rock(20 + sr() * 440, y, 5 + k * 11 + sr() * 4, 6 + k * 11 + sr() * 4, sr, SNOW_ROCK);
        }
        P.horizon(pxRng(92), 175, 8, '#5a6888', '#dce6f2').clip();
      } },
      { dynamic: true, draw(P, r, t){   // zvířený sníh nad zemí + třpyt v měsíčním světle
        const g = gustAt(t);
        if (PX_OPTIONS.snowDrift) for (const d of drifts){
          const span = PX_W + 40, x = ((d.x - windPos(t, d.v * 0.5, d.v * 0.45)) % span + span) % span - 20;
          const y = d.y + Math.sin(t * 2 + d.o) * 2;
          for (let k = 0; k < d.len * (0.5 + g * 0.6); k++) if ((k + step(t)) % 3) P.px(x + k, y - (k > d.len * 0.6 ? 1 : 0), k < 3 ? '#f2f6ff' : '#dce6f2');
        }
        if (PX_OPTIONS.snowSparkle) for (const s of sparkles){
          const ph = ((t + s.o) % s.p) / s.p;
          if (ph < 0.06){ P.px(s.x, s.y, '#ffffff'); P.px(s.x - 1, s.y, '#dce6f2'); P.px(s.x + 1, s.y, '#dce6f2'); P.px(s.x, s.y - 1, '#dce6f2'); }
          else if (ph < 0.12) P.px(s.x, s.y, '#eef4ff');
        }
      } },
      { seed: 44, draw(P){   // kamenné plošinky pod sněhem s rampouchy
        const st = { out: '#0a0e1a', side: '#3a4462', sideDark: '#2a3248', seam: '#4a5672', edge: '#8a9ab8', top: '#c8d4e8', center: '#dce6f2', hi: '#f6f9ff' };
        P.mound(PL.enemy, 194, pxRng(63), {
          out: '#0a0e1a', body: '#2c3650', lit: '#5a6a8a', shade: '#1e2638', foot: '#5a6888',
          mud: ['#a4b2ce', '#b8c6e0'], tuft: null, pebble: '#5a6a8a',
          strata: ['#1e2638', '#3e4a68'], platShadow: '#1a2234', rock: SNOW_ROCK,
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        // rampouchy visící z přední hrany plošinek
        const ic = pxRng(64);
        for (const [E, side] of [[PL.enemy, 6], [PL.player, 9]]){
          for (let x = E.x - E.rx + 6; x < E.x + E.rx - 5; x += 4 + Math.floor(ic() * 6)){
            const dy = E.ry * Math.sqrt(Math.max(0, 1 - ((x - E.x) / (E.rx + 0.5)) ** 2));
            const y0 = E.y + Math.round(dy) + side + 1, len = 2 + Math.floor(ic() * (side > 6 ? 6 : 4));
            for (let k = 0; k < len; k++) P.rect(x, y0 + k, k < len * 0.5 ? 2 : 1, 1, k === 0 ? '#e0ecff' : k < len - 1 ? '#a8c0e0' : '#7a98c8');
          }
        }
      } },
      { dynamic: true, draw(P, r, t){   // vánice: vločky ve třech hloubkách + zbělání při poryvu
        if (!PX_OPTIONS.snowBlizzard) return;
        const g = gustAt(t);
        for (const f of flakes){
          if (f.th > 0.5 + g * 0.45) continue;                        // při slabém větru méně vloček
          const L = FLAKE[f.layer], span = PX_W + 200;
          const y = (f.y + t * L.v) % (PX_H + 10) - 5;
          const x = ((f.x - windPos(t, L.drift * 0.5, L.drift * 0.5) + Math.sin(t * 1.2 + f.w) * 3) % span + span) % span - 100;
          if (L.size === 2){
            P.rect(x, y, 2, 2, L.col);
            P.px(x + 2, y - 1, '#c8d4e8'); if (g > 0.9) P.px(x + 3, y - 1, '#8a98b8');   // šmouha po větru
          } else {
            P.px(x, y, L.col);
            if (f.layer === 1 && g > 1) P.px(x + 1, y, '#8a98b8');
          }
        }
        const white = Math.max(0, g - 0.95) * 0.35;
        if (white > 0){ P.ctx.globalAlpha = white; P.rect(0, 0, PX_W, PX_H, '#c8d4e8'); P.ctx.globalAlpha = 1; }
      } },
    ],
  };
})();


/* =====================================================================
   ARÉNA 4: Širý oceán – soumrak na otevřeném moři, skalní věže v dálce
   ===================================================================== */
const OCEAN_ROCK = { out: '#120c18', dark: '#2a2030', mid: '#3e3044', light: '#5a4656', hi: '#c87a58', shadow: '#0e1a30', glint: '#ffc890' };
const OCEAN = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const HZ = 132;                                   // obzor
  const SUN = { x: 80, y: 112 };
  const step = t => Math.floor(t / 0.1);
  const depthY = u => HZ + 2 + (PX_H - HZ - 2) * u ** 1.9;   // u: 0 = obzor, 1 = popředí
  const pathW = u => 4 + u * 58;                    // šířka sluneční cesty na vodě

  // skalní věže z moře: [střed x, šířka, výška, je to brána?]
  const STACKS = [[170, 46, 24, true], [250, 22, 54, false], [279, 12, 27, false], [455, 9, 12, false], [26, 7, 9, false]];
  const sr = pxRng(711);
  const stackShapes = STACKS.map(([cx, w, h, arch]) => {
    const pts = [], n = 9;
    for (let i = 0; i <= n; i++){                                 // zubatý obrys zleva doprava přes vršek
      const k = i / n, x = cx - w / 2 + k * w;
      const top = HZ - h * (arch ? 0.75 + Math.sin(k * Math.PI) * 0.25 : Math.sin(Math.min(1, k * 1.15) * Math.PI) ** 0.35) + (sr() - 0.5) * 4;
      pts.push([x, top]);
    }
    pts.push([cx + w / 2 + 2, HZ + 1], [cx - w / 2 - 2, HZ + 1]);
    return { cx, w, h, arch, pts, spray: sr() * 4 };
  });

  // mraky: dlouhé pruhy podsvícené zespodu
  const cr = pxRng(733);
  const clouds = Array.from({ length: 9 }, (_, i) => ({ x: cr() * (PX_W + 200), y: 16 + i * 9 + cr() * 6, w: 40 + cr() * 90, v: 1 + cr() * 2 }));

  /* hladina jako vlnové pole: každý pixel je na svahu vlny natočeném k nebi (světlejší) nebo od
     něj (tmavší). Vzdouvání se valí k nám, vzadu jemné, vepředu velké. Barva se plynule přelévá
     přes paletu pomocí Bayerova ditheringu 4×4 – pixely zůstávají ostré, přechody jsou hladké. */
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const WATER_PAL = ['#0c1430', '#121c3a', '#1a2444', '#232c50', '#30345a', '#463c5e', '#64465c', '#8a5656',
                     '#b46a50', '#d8864c', '#f0a858', '#ffd890', '#fff0c8'].map(hex);
  const FOAM = hex('#a8bcdc');
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let waterCv = null, waterImg = null;
  function drawWater(P, t){
    const H = PX_H - HZ - 1;
    if (!waterCv){
      waterCv = document.createElement('canvas'); waterCv.width = PX_W; waterCv.height = H;
      waterImg = waterCv.getContext('2d').createImageData(PX_W, H);
    }
    const d = waterImg.data, n = WATER_PAL.length - 1;
    for (let y = HZ + 1; y < PX_H; y++){
      const u = Math.pow((y - HZ - 1) / H, 1 / 1.9);                 // 0 = obzor, 1 = popředí
      const z = 1 / (u + 0.06);                                        // vzdálenost
      const fx = 0.05 / (0.12 + u);                                    // vzadu jemnější vlnky
      const amp = 0.05 + u * 0.13;
      const base = 0.6 - u * 0.4;                                      // u obzoru odráží nebe, vepředu tmavší
      const pw = pathW(u), rowPh = z * 26 - t * 1.6, by = (y & 3) * 4;
      for (let x = 0; x < PX_W; x++){
        // hřebeny zhruba rovnoběžné s obzorem, mírně zvlněné a rozlámané na kousky
        const a = rowPh + Math.sin(x * fx * 0.9 + z * 1.3) * 1.6;
        const m = 0.55 + 0.45 * Math.sin(x * fx * 2.6 + z * 9.1 + t * 0.3);
        const ca = Math.cos(a), slope = ca * m + 0.35 * Math.cos(x * fx * 5.2 - z * 17 + t * 1.1);
        let v = base + slope * amp;
        const e = Math.abs(x - SUN.x) / pw;                            // sluneční cesta se láme na vlnách
        if (e < 1) v += Math.pow(1 - e, 1.6) * (0.33 + slope * 0.14) * (1 - u * 0.3);
        v = Math.max(0, Math.min(0.999, v)) * n;
        const i0 = Math.floor(v);
        const thr = BAYER[(x & 3) + by];
        let c = WATER_PAL[(v - i0) * 16 > thr ? i0 + 1 : i0];
        if (u > 0.4 && ca > 0.95 && m > 0.75 && thr < 4 + u * 5) c = FOAM;   // pěna na hřebenech blízkých vln
        const k = ((y - HZ - 1) * PX_W + x) * 4;
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
    }
    waterCv.getContext('2d').putImageData(waterImg, 0, 0);
    P.ctx.drawImage(waterCv, 0, HZ + 1);
  }

  /* vyskakující ryby: z náhodného místa hladiny vyskočí, ve vzduchu se natáčí podle letu,
     kape z nich voda, při výskoku i dopadu šplouchne. Vepředu větší. Vzácně Magikarp. */
  function fishJump(t){
    const PER = 4.5, n = Math.floor(t / PER), r = pxRng(pxMix(n * 41 + 3));
    if (r() < 0.3) return null;
    const u = 0.2 + r() * 0.65, x0 = 20 + r() * 440, y0 = depthY(u), sc = 0.5 + u * 1.1;
    // nevyskakovat zpoza skalisek s plošinkami
    if (Math.abs(x0 - PL.enemy.x) < 100 && y0 < 200 || Math.abs(x0 - PL.player.x) < 140 && y0 > 196) return null;
    const dir = r() < 0.5 ? 1 : -1, vx = dir * (10 + r() * 14) * sc, vy = -(28 + r() * 20) * sc, g = 75 * sc;
    const air = -2 * vy / g, start = r() * (PER - air - 1);
    const ph = t - n * PER - start;
    if (ph < 0 || ph > air + 0.6) return null;
    return { ph, air, x0, y0, vx, vy, g, sc, dir, karp: r() < 0.12 };
  }
  function drawFish(P, f){
    const splash = (x, y, age, big) => {                              // šplouchnutí: kapky do stran a nahoru
      if (age < 0 || age > 0.5) return;
      const k = age / 0.5;
      for (let i = -3; i <= 3; i++){
        const dx = i * (1 + k * 3) * f.sc, dy = -Math.sin(k * Math.PI) * (3 + (3 - Math.abs(i)) * 2) * f.sc * (big ? 1.2 : 0.8);
        P.px(x + dx, y + dy, Math.abs(i) > 1 ? '#a8bcdc' : '#ffffff');
      }
      P.rect(x - 4 * f.sc * (0.5 + k), y, 8 * f.sc * (0.5 + k), 1, '#c8d8f0');
    };
    splash(f.x0, f.y0, f.ph, true);
    const lx = f.x0 + f.vx * f.air;
    splash(lx, f.y0, f.ph - f.air, false);
    if (f.ph > f.air) return;
    const tt = f.ph, x = f.x0 + f.vx * tt, y = f.y0 + f.vy * tt + 0.5 * f.g * tt * tt;
    const vxx = f.vx, vyy = f.vy + f.g * tt, len = Math.hypot(vxx, vyy) || 1, dx = vxx / len, dy = vyy / len;
    const L = Math.max(3, Math.round(4.2 * f.sc + (f.karp ? 1 : 0)));
    const body = f.karp ? '#f07030' : '#c8d0e0', back = f.karp ? '#c84020' : '#4a5a7a', belly = f.karp ? '#ffe8c0' : '#eef2fa';
    for (let i = -L; i <= L; i++){                                     // tělo podél směru letu
      const px = x + dx * i, py = y + dy * i, w = Math.abs(i) < L * 0.6 ? 1 : 0;
      P.px(px, py, body);
      if (w){ P.px(px - dy, py + dx, back); P.px(px + dy, py - dx, belly); }
      if (w && f.sc > 1 && Math.abs(i) < L * 0.35){ P.px(px - dy * 2, py + dx * 2, back); P.px(px + dy * 2, py - dx * 2, body); }   // blízké ryby jsou silnější
    }
    const tx = x - dx * (L + 1), ty = y - dy * (L + 1);                 // ocasní ploutev
    P.px(tx - dy, ty + dx, back); P.px(tx + dy, ty - dx, back);
    P.px(x + dx * L, y + dy * L, f.karp ? '#ffd060' : '#ffe6a0');      // odlesk slunce na hlavě
    if (f.karp){ P.px(x - dy * 2, y + dx * 2, '#ffd060'); }            // hřbetní ploutev
    for (let k = 1; k <= 3; k++){                                       // kapky padající z ryby
      const kt = Math.max(0, tt - k * 0.06);
      P.px(f.x0 + f.vx * kt, f.y0 + f.vy * kt + 0.5 * f.g * kt * kt + k * 2, '#a8bcdc');
    }
  }

  // racci (plachtí, občas mávnou), přelet může trvat déle než interval
  function gulls(t){
    const out = [], PER = 14, n = Math.floor(t / PER);
    for (let k = n; k >= n - 4 && k >= 0; k--){
      const r = pxRng(pxMix(k * 31 + 5));
      if (r() < 0.3) continue;
      const dir = r() < 0.5 ? 1 : -1, v = 10 + r() * 6, start = r() * PER, ph = t - k * PER - start;
      const dur = (PX_W + 80) / v;
      if (ph < 0 || ph > dur) continue;
      const count = 1 + Math.floor(r() * 3);
      for (let i = 0; i < count; i++) out.push({ x: dir > 0 ? -40 + ph * v - i * 14 : PX_W + 40 - ph * v + i * 14, y: 40 + r() * 60 + Math.sin(ph * 0.7 + i) * 4 + i * 6, dir, ph: ph + i * 0.9 });
    }
    return out;
  }
  function drawGull(P, g, t){
    const flap = (Math.floor(g.ph * 4) % 9) < 2;                        // většinou plachtí, občas mávne
    const w = flap ? ((step(t) % 2) ? 2 : -1) : 1;
    const x = Math.round(g.x), y = Math.round(g.y);
    P.rect(x - 1, y, 3, 1, '#f0e2d4'); P.px(x + g.dir * 2, y, '#f0e2d4'); P.px(x + g.dir * 3, y, '#e0a050');
    P.line(x - 1, y, x - 4, y - w, 1, '#f0e2d4'); P.line(x - 4, y - w, x - 6, y - w + 1, 1, '#8a7a90');
    P.line(x + 1, y, x + 4, y - w, 1, '#f0e2d4'); P.line(x + 4, y - w, x + 6, y - w + 1, 1, '#8a7a90');
    P.px(x, y + 1, '#8a7a90');
  }

  // velryba v dálce: hřbet se vynoří, vystříkne gejzír a zase se ponoří
  function whale(t){
    const PER = 24, n = Math.floor(t / PER), r = pxRng(pxMix(n * 97 + 3));
    if (r() < 0.25) return null;
    const ph = t - n * PER - (2 + r() * (PER - 9));
    if (ph < 0 || ph > 5) return null;
    return { ph, x: 300 + r() * 150, y: HZ + 3 + r() * 4, dir: r() < 0.5 ? 1 : -1 };
  }

  return {
    name: 'Širý oceán',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    layers: [
      { seed: 51, draw(P){   // obloha za soumraku + nízké slunce
        const SKY = ['#141432', '#1c1c40', '#2a2450', '#3e2c5c', '#5a325e', '#7a3a5a', '#a04a52', '#c8604a', '#e08048', '#f0a050'];
        P.bands(0, HZ + 1, SKY);
        for (let y = -30; y <= 30; y++) for (let x = -44; x <= 44; x++){           // záře kolem slunce
          const d = Math.hypot(x, y * 1.3);
          if (d < 44 && y < HZ - SUN.y && (x + y) % (d < 22 ? 2 : 3) === 0) P.px(SUN.x + x, SUN.y + y, d < 22 ? '#ffd890' : '#f0b060');
        }
        P.ellipse(SUN.x, SUN.y, 13, 13, '#ffe6a0'); P.ellipse(SUN.x - 1, SUN.y - 1, 10, 10, '#fff4d0');
        // opar nad hladinou: pár řádků nad obzorem, u slunce jasnější (Bayerův dithering)
        const BY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        for (let y = HZ - 8; y <= HZ; y++) for (let x = 0; x < PX_W; x++){
          const v = (1 - (HZ - y) / 9) * (0.35 + 0.65 * Math.max(0, 1 - Math.abs(x - SUN.x) / 220));
          if (v * 16 > BY[(x & 3) + (y & 3) * 4]) P.px(x, y, v > 0.55 ? '#f8c070' : '#f0a050');
        }
      } },
      { dynamic: true, draw(P, r, t){   // dlouhé mraky podsvícené zespodu, pomalu plují
        for (const c of clouds){
          const span = PX_W + 200, x = ((c.x + t * c.v) % span + span) % span - 100;
          P.ellipse(x, c.y, c.w, 3, '#2a2048');
          P.rect(x - c.w * 0.85, c.y + 2, c.w * 1.7, 1, c.y > 50 ? '#e08048' : '#a04a52');   // spodek chytá světlo
          P.rect(x - c.w * 0.5, c.y + 3, c.w, 1, c.y > 50 ? '#ffb060' : '#c8604a');
        }
      } },
      { seed: 52, draw(P, r){   // skalní věže na obzoru
        for (const st of stackShapes){
          P.poly(st.pts, '#2a1e36');
          // brána: otvor uprostřed, skrz který svítí obloha
          if (st.arch) P.ellipse(st.cx, HZ - 2, st.w * 0.22, st.h * 0.38, '#e08048');
          // nasvícená levá hrana a vršek (slunce vlevo)
          for (let y = Math.floor(HZ - st.h - 3); y <= HZ; y++){
            for (let x = Math.floor(st.cx - st.w / 2 - 3); x <= st.cx + st.w / 2 + 3; x++){
              if (P.ctx.getImageData(x, y, 1, 1).data[0] === 0x2a){   // první pixel siluety v řádku
                P.px(x, y, '#c8704a'); P.px(x + 1, y, '#7a3a4a'); break;
              }
            }
          }
        }
      } },
      { dynamic: true, draw(P, r, t){   // vlnící se hladina, horizont, třpyt slunce, tříštění u věží, velryba
        drawWater(P, t);
        if (PX_OPTIONS.oceanFish){ const f = fishJump(t); if (f) drawFish(P, f); }
        // horizont: u slunce září, do stran slábne (rozptýleně, ne ostrá čára)
        for (let x = 0; x < PX_W; x++){
          const near = Math.max(0, 1 - Math.abs(x - SUN.x) / 190);
          const c = near > 0.6 ? '#ffe6a0' : near > 0.3 ? '#f0b060' : near > 0.05 ? '#d8864c' : '#a8604e';
          if (near > 0.3 || (x + step(t)) % 3) P.px(x, HZ + 1, c);
          if (near > 0.45 && x % 2) P.px(x, HZ + 2, '#f0b060');
        }
        // pěna u paty skalních věží
        for (const st of stackShapes) for (let x = st.cx - st.w / 2 - 3; x < st.cx + st.w / 2 + 3; x++) if ((x | 0) % 2) P.px(x, HZ + 2, '#f0e0d0');
        // třpyt na sluneční cestě (bliká po 100 ms)
        if (PX_OPTIONS.oceanGlitter){
          const gr = pxRng(pxMix(step(t) * 7 + 1));
          for (let i = 0; i < 40; i++){
            const u = Math.pow(gr(), 0.7), y = depthY(u), x = SUN.x + (gr() - 0.5) * 2 * pathW(u) * 0.6;
            const c = gr() < 0.4 ? '#fff4c0' : '#ffc070';
            if (u > 0.5) P.rect(x, y, 2, 1, c); else P.px(x, y, c);
          }
        }
        // tříštící se vlny u paty skalních věží
        if (PX_OPTIONS.oceanSpray) for (const st of stackShapes){
          const ph = ((t + st.spray) % 4.5) / 4.5;
          if (ph > 0.35) continue;
          const k = ph / 0.35, hgt = Math.sin(k * Math.PI) * Math.min(14, st.h * 0.4);
          const sp = pxRng(pxMix(Math.floor((t + st.spray) / 4.5) * 13 + st.cx));
          for (let i = 0; i < 10 + st.w * 0.4; i++){
            const x = st.cx + (sp() - 0.5) * (st.w + 6) * (0.6 + k * 0.6), y = HZ + 1 - sp() * hgt;
            P.px(x, y, sp() < 0.5 ? '#ffffff' : '#d8e0f0');
          }
        }
        // velryba
        if (PX_OPTIONS.oceanWhale){
          const w = whale(t);
          if (w){
            const rise = w.ph < 1 ? w.ph : w.ph > 4 ? 5 - w.ph : 1;          // vynoří se, chvíli vydrží, ponoří se
            const hump = Math.round(rise * 4);
            if (hump > 0){
              P.ellipse(w.x, w.y, 9 + hump, hump, '#1a1830');
              P.rect(w.x - 6 - hump, w.y - hump + 1, 6, 1, '#c8784e');            // lesk na hřbetě
              P.rect(w.x - 10 - hump, w.y + 1, 22 + hump * 2, 1, '#f0e0d0');      // pěna kolem
            }
            if (w.ph > 1.1 && w.ph < 3.2){                                       // gejzír vody
              const k = (w.ph - 1.1) / 2.1, hgt = Math.sin(Math.min(1, k * 2.5) * Math.PI / 2) * 16;
              const sp = pxRng(pxMix(step(t) * 3 + 9));
              for (let i = 0; i < 26; i++){
                const f = sp(), y = w.y - hump - f * hgt, x = w.x - w.dir * 4 + (sp() - 0.5) * (1 + f * 10 * (k + 0.3));
                if (k > 0.7 && sp() < 0.5) continue;
                P.px(x, y, f > 0.7 ? '#ffffff' : '#c8d8f0');
              }
            }
          }
        }
      } },
      { seed: 53, draw(P){   // skaliska z vody s plošinkami
        const st = { out: '#120c18', side: '#3a2e3e', sideDark: '#2a2030', seam: '#4a3a4e', edge: '#5a4a5a', top: '#7a6a78', center: '#8a7a88', hi: '#e8b088' };
        const rockMound = (E, y1, seed) => P.mound(E, y1, pxRng(seed), {
          out: '#120c18', body: '#2e2434', lit: '#a0583e', shade: '#1e1824', foot: '#0e1a30',
          mud: ['#e8eef8', '#a8c0d8'], tuft: null, pebble: '#e8eef8',
          strata: ['#1e1824', '#4a3a48'], platShadow: '#1a1420', rock: OCEAN_ROCK,
        });
        rockMound(PL.enemy, 190, 81);
        rockMound(PL.player, 266, 82);
        // řasy u čáry vody
        for (const [E, y1] of [[PL.enemy, 190], [PL.player, 266]]){
          const hw = E.rx * 0.9 + 26;
          for (let x = E.x - hw; x < E.x + hw; x++) if ((x | 0) % 3) P.px(x, y1 - 2 - ((x | 0) % 2), '#2a4a3a');
        }
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
      } },
      { dynamic: true, draw(P, r, t){   // pěna a šplouchání u skalisek, racci
        for (const [E, y1, o] of [[PL.enemy, 190, 0], [PL.player, 266, 1.7]]){
          const hw = E.rx * 0.9 + 28;
          for (let x = Math.round(E.x - hw); x < E.x + hw; x++){
            const v = Math.sin(x * 0.35 + t * 2.2 + o) + Math.sin(x * 0.13 - t * 1.3);
            if (v > 0.2) P.px(x, y1 + 1 + Math.round(Math.sin(x * 0.2 + t * 1.5) * 1), v > 1.1 ? '#ffffff' : '#c8d8f0');
          }
          // vlna narazí do skály a vystříkne
          if (PX_OPTIONS.oceanSpray){
            const ph = ((t + o * 1.9) % 3.6) / 3.6;
            if (ph < 0.3){
              const k = ph / 0.3, sp = pxRng(pxMix(Math.floor((t + o * 1.9) / 3.6) * 17 + (o > 0 ? 1 : 0)));
              for (let i = 0; i < 26; i++){
                const x = E.x + (sp() - 0.5) * hw * 1.8, y = y1 - sp() * Math.sin(k * Math.PI) * 14;
                P.px(x, y, sp() < 0.5 ? '#ffffff' : '#c8d8f0');
              }
            }
          }
        }
        if (PX_OPTIONS.oceanGulls) for (const g of gulls(t)) drawGull(P, g, t);
      } },
    ],
  };
})();


/* =====================================================================
   ARÉNA 5: Písečná bouře – pyramidy a sfinga, prach žene vítr doleva
   ===================================================================== */
const DESERT_ROCK = { out: '#2a1a10', dark: '#5a3a22', mid: '#7a5232', light: '#a8763e', hi: '#e0b070', shadow: '#a87a48' };
const DESERT = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const HZ = 158, SUN = { x: 92, y: 48 };
  const step = t => Math.floor(t / 0.1);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // vítr: síla v nárazech + "ujetá dráha" (integrál) → písek letí vždy jedním směrem
  const gustAt = t => 0.75 + Math.sin(t * 0.37) * 0.4 + Math.sin(t * 1.3 + 2) * 0.22 + Math.sin(t * 2.9) * 0.08;
  const gustInt = t => 0.75 * t - Math.cos(t * 0.37) * 0.4 / 0.37 - Math.cos(t * 1.3 + 2) * 0.22 / 1.3 - Math.cos(t * 2.9) * 0.08 / 2.9;
  const windPos = (t, base, k) => base * t + k * gustInt(t);

  // pyramida: [vrchol x, vrchol y, poloviční šířka základny, opar 0–1]
  const PYRAMIDS = [[62, 120, 34, 0.75], [384, 84, 76, 0.45], [242, 56, 112, 0]];
  const BASE_Y = 160;
  const mixCol = (a, b, k) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  const HAZE = '#c89060';

  /* pyramida ve tříčtvrtečním pohledu: přední hrana jde z vrcholu šikmo dolů, osvětlená (levá)
     stěna je užší, stinná širší. Kamenné bloky ve vazbě (řady posunuté), horní hrana bloků
     chytá světlo, ulámané bloky na hranách, zrnitost a navátý písek u paty. */
  function drawPyramid(P, r, [cx, top, hw, haze]){
    const C = (c) => mixCol(c, HAZE, haze);
    const L = { face: C('#d8a866'), joint: C('#c0904f'), top: C('#ecc282'), grain: C('#caa060'), edge: C('#f6d494') };
    const S = { face: C('#8e5e3a'), joint: C('#764a2c'), top: C('#a06c44'), grain: C('#805232'), edge: C('#5e3a22') };
    const ridgeBase = cx - hw * 0.28;                               // kam dopadá přední hrana
    const CH = haze > 0.5 ? 4 : 3, BW = haze > 0.5 ? 8 : 6;          // výška řady a šířka bloku
    for (let y = top; y <= BASE_Y; y++){
      const k = (y - top) / (BASE_Y - top);
      const xl = Math.floor((cx - hw * k) / 2) * 2, xR = Math.ceil((cx + hw * k) / 2) * 2;
      const xr = Math.round(cx + (ridgeBase - cx) * k);
      const row = y - top, course = Math.floor(row / CH), inC = row % CH;
      for (let x = xl; x <= xR; x++){
        const lit = x < xr, F = lit ? L : S;
        let c = F.face;
        if (inC === 0) c = F.top;                                     // horní hrana řady bloků
        else if (((x - (lit ? xl : xr)) + course * (BW >> 1)) % BW === 0) c = F.joint;   // svislé spáry
        else if (r() < 0.05) c = F.grain;                             // zrnitost kamene
        if (k > 0.75 && r() < (k - 0.75) * 1.6) c = lit ? L.joint : S.joint;   // prach a stín u paty
        P.px(x, y, c);
      }
      P.px(xl, y, L.edge);                                            // levá hrana ve světle
      P.px(xr, y, haze > 0.5 ? L.top : '#fff0c0');                    // přední hrana – nejjasnější
      P.px(xR, y, S.edge);
      // ulámané bloky na vnějších hranách
      if (haze < 0.6 && inC === 1 && r() < 0.18) P.rect(xl, y - 1, 2 + Math.floor(r() * 3), 2, C('#c89060'));
      if (haze < 0.6 && inC === 1 && r() < 0.18) P.rect(xR - 2 - Math.floor(r() * 3), y - 1, 3, 2, C('#c89060'));
    }
    // navátý písek u paty
    for (let x = cx - hw - 6; x <= cx + hw + 6; x++){
      const hgt = 2 + Math.round((Math.sin(x * 0.11) + 1) * 1.5 + Math.sin(x * 0.37) * 0.8);
      P.rect(x, BASE_Y - hgt + 1, 1, hgt, C(x < ridgeBase ? '#d4a466' : '#b8844e'));
      P.px(x, BASE_Y - hgt + 1, C('#ecc488'));
    }
  }

  // prachový závoj: počítá se pixel po pixelu do vlastního obrázku (rychlé)
  const DUST = [hex('#c08a58'), hex('#d0a06a'), hex('#e0b880')];
  let veilCv = null, veilImg = null;
  function drawVeil(P, t){
    const H = 176;
    if (!veilCv){ veilCv = document.createElement('canvas'); veilCv.width = PX_W; veilCv.height = H; veilImg = veilCv.getContext('2d').createImageData(PX_W, H); }
    const d = veilImg.data, g = gustAt(t), wp = windPos(t, 22, 22);
    for (let y = 0; y < H; y++){
      const low = 0.25 + 0.75 * (y / H);                                           // u země hustší
      for (let x = 0; x < PX_W; x++){
        const X = x + wp;
        let v = (0.08 + g * 0.22) * low + 0.2 * Math.sin(X * 0.017 + y * 0.03) + 0.13 * Math.sin(X * 0.043 - y * 0.07 + 1) + 0.08 * Math.sin(X * 0.11 + y * 0.2);
        v = Math.max(0, Math.min(0.95, v));
        const k = (y * PX_W + x) * 4;
        if (v * 16 > BAYER[(x & 3) + (y & 3) * 4] + 4){
          const c = DUST[v > 0.6 ? 2 : v > 0.4 ? 1 : 0];
          d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
        } else d[k + 3] = 0;
      }
    }
    veilCv.getContext('2d').putImageData(veilImg, 0, 0);
    P.ctx.drawImage(veilCv, 0, 0);
  }

  // zrnka písku ve vzduchu (tři hloubky) a proudy písku u země
  const fr = pxRng(901);
  const grains = Array.from({ length: 380 }, (_, i) => ({ layer: i < 160 ? 0 : i < 310 ? 1 : 2, x: fr() * (PX_W + 200), y: fr() * PX_H, w: fr() * 6, th: fr() }));
  const GRAIN = [{ v: 6, drift: 45, col: '#b8844e', len: 1 }, { v: 9, drift: 80, col: '#d8a868', len: 2 }, { v: 14, drift: 140, col: '#f0cc90', len: 3 }];
  const streams = Array.from({ length: 36 }, () => ({ x: fr() * PX_W, y: 168 + Math.pow(fr(), 0.7) * 98, v: 45 + fr() * 50, len: 6 + fr() * 14, o: fr() * 10 }));

  // válející se suchý keř
  function tumble(t){
    const PER = 9, n = Math.floor(t / PER), r = pxRng(pxMix(n * 53 + 1));
    if (r() < 0.35) return null;
    const v = 34 + r() * 26, ph = t - n * PER - r() * 2;
    const x = PX_W + 20 - ph * v;
    if (ph < 0 || x < -20) return null;
    const y0 = 196 + r() * 60, sc = 0.6 + (y0 - 190) / 100;
    return { x, y0, y: y0 - Math.abs(Math.sin(ph * 3.2)) * 10 * sc, sc, rot: ph * v / (6 * sc) };
  }
  function drawTumble(P, k){
    const R = 5 * k.sc;
    P.ellipse(k.x + 3, k.y0 + R, R * 0.9, 1, '#a87a48');   // stín zůstává na zemi
    for (let i = 0; i < 18; i++){                                                    // větvičky kolem dokola, otáčí se
      const a = k.rot + i * 2.4, rr = R * (0.4 + (i % 3) * 0.3);
      P.line(k.x, k.y, k.x + Math.cos(a) * rr, k.y + Math.sin(a) * rr, 1, i % 2 ? '#7a5232' : '#a8763e');
    }
    P.px(k.x, k.y, '#5a3a22');
  }
  // prachový vír
  function devil(t){
    const PER = 16, n = Math.floor(t / PER), r = pxRng(pxMix(n * 67 + 5));
    if (r() < 0.4) return null;
    const ph = t - n * PER - r() * 4;
    if (ph < 0 || ph > 7) return null;
    const life = ph < 1 ? ph : ph > 6 ? 7 - ph : 1;
    return { x: 300 - ph * 14 + r() * 80, y: 176 + r() * 10, life, ph };
  }
  function drawDevil(P, dv, t){
    const H = 46 * dv.life;
    for (let k = 0; k < H; k++){
      const w = 3 + k * 0.28, sway = Math.sin(t * 2 + k * 0.12) * (k * 0.12);
      for (let i = 0; i < 3; i++){
        const a = t * 9 + k * 0.5 + i * 2.1, x = dv.x + sway + Math.cos(a) * w;
        if ((k + i + step(t)) % 2) P.px(x, dv.y - k, Math.sin(a) > 0 ? '#e0b880' : '#a8763e');
      }
    }
  }

  return {
    name: 'Písečná bouře',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    layers: [
      { seed: 61, draw(P){   // prašná obloha + bledé slunce v prachu
        P.bands(0, 182, ['#3a2418', '#4e2e1c', '#643a22', '#7e4a2a', '#9a5e34', '#b47440', '#c88a4e', '#d8a060', '#d8a060']);
        for (let y = -34; y <= 34; y++) for (let x = -46; x <= 46; x++){
          const dd = Math.hypot(x, y * 1.2);
          if (dd < 46 && (x + y) % (dd < 24 ? 2 : 3) === 0) P.px(SUN.x + x, SUN.y + y, dd < 24 ? '#e8b878' : '#c88a50');
        }
        P.ellipse(SUN.x, SUN.y, 12, 12, '#f4d8a0'); P.ellipse(SUN.x - 1, SUN.y - 1, 9, 9, '#fff0cc');
      } },
      { seed: 62, draw(P, r){   // pyramidy, sfinga, duny
        for (const py of PYRAMIDS) drawPyramid(P, r, py);
        // duny: hřebeny osvětlené zleva, stinná strana vpravo
        for (const [base, amp, f, off, lit, sh] of [[170, 10, 0.021, 0, '#c8945a', '#9a6a40'], [176, 8, 0.034, 40, '#d4a466', '#a8763e']]){
          const litAt = x => { const ph = (x + off) * f; return Math.cos(ph) * Math.sin(ph) > 0; };
          for (let x = 0; x < PX_W; x++){
            const ph = (x + off) * f, crest = Math.pow(Math.abs(Math.sin(ph)), 0.6);
            const top = Math.round(base - amp * crest);
            for (let y = top; y < PX_H; y++){
              const d = y - top;
              // hranice stínu se s hloubkou šikmo posouvá (zaoblený tvar duny), dole stín slábne
              const xs = x - d * 0.85, l = litAt(xs);
              let c = l ? lit : sh;
              if (litAt(xs - 1.2) !== litAt(xs + 1.2) && (x + y) % 2) c = l ? sh : lit;   // dithering na hranici
              if (d > amp * 1.4 && !l && (x + y) % 2 === 0) c = lit;                     // hlouběji stín řídne
              if (d > amp * 1.9) c = lit;
              P.px(x, y, c);
            }
            P.px(x, top, litAt(x) ? '#ecc488' : '#b8844e');
          }
        }
      } },
      { dynamic: true, draw(P, r, t){   // prachový závoj přes krajinu + prachový vír
        if (PX_OPTIONS.desertStorm) drawVeil(P, t);
        if (PX_OPTIONS.desertDevil){ const dv = devil(t); if (dv) drawDevil(P, dv, t); }
      } },
      { seed: 63, draw(P, r){   // písečná pláň: vlnky, zasypané kameny, zlomený sloup
        P.bands(170, PX_H, ['#c8945a', '#c8945a', '#d0a064', '#d8aa6e', '#dcb076', '#e0b47c']);
        for (let i = 0; i < 70; i++){                                                // vlnky navátého písku
          const y = 180 + Math.pow(r(), 0.8) * 88, x0 = r() * PX_W, len = 10 + r() * 34 * ((y - 170) / 100);
          for (let k = 0; k < len; k++){ const x = x0 + k, yy = y + Math.round(Math.sin(k * 0.35 + i) * 1); P.px(x, yy, '#ecc488'); P.px(x, yy + 1, '#a8763e'); }
        }
        const sr = pxRng(95);
        for (let i = 0; i < 6; i++){
          const y = 192 + sr() * 74, k = (y - 170) / 100;
          P.rock(20 + sr() * 440, y, 4 + k * 10 + sr() * 4, 4 + k * 8 + sr() * 3, sr, DESERT_ROCK);
        }
        // zlomený sloup napůl v písku + spadlý článek vedle něj
        {
          const cx = 418, base = 238, cw = 16, ch = 24, x0 = cx - cw / 2;
          const CYL = ['#f0cc8a', '#d8a868', '#c4945a', '#a8763e', '#86593a'];   // válec: světlo zleva
          const cr = pxRng(97);
          P.ellipse(cx + 6, base, 14, 2, '#a8763e');                               // stín na písku doprava
          for (let x = 0; x < cw; x++){
            const t = x / (cw - 1), tone = Math.min(4, Math.floor(Math.pow(t, 0.8) * 5));
            const top = base - ch + Math.round(Math.abs(Math.sin(x * 1.3)) * 3 + (x > cw * 0.6 ? 3 : 0) + cr() * 1.5);   // ulomený vršek
            for (let y = top; y < base; y++){
              let c = CYL[tone];
              if (x % 3 === 2 && x > 0 && x < cw - 1) c = CYL[Math.min(4, tone + 1)];   // žlábkování
              if (y === top) c = tone < 3 ? '#fff0c0' : '#c4945a';                      // lom chytá světlo
              P.px(x0 + x, y, c);
            }
            P.px(x0 + x, top - 1, '#4a2a18');                                           // obrys lomu
          }
          for (let y = base - ch; y < base; y++){ P.px(x0 - 1, y, '#4a2a18'); P.px(x0 + cw, y, '#4a2a18'); }
          P.rect(x0, base - 9, cw, 1, '#a8763e');                                      // spára mezi články
          // spadlý článek: ležící válec, čelem ke světlu kruhový průřez
          const dx0 = 438, dy = 242, len = 22, r = 7;
          for (let y = -r; y <= r; y++){
            const t = (y + r) / (2 * r), c = CYL[Math.min(4, Math.floor(t * 5))];
            P.rect(dx0, dy + y, len, 1, c);
            if ((y + r) % 3 === 2) P.rect(dx0, dy + y, len, 1, CYL[Math.min(4, Math.floor(t * 5) + 1)]);
          }
          P.rect(dx0, dy - r - 1, len, 1, '#4a2a18'); P.rect(dx0, dy + r + 1, len, 1, '#4a2a18');
          P.ellipse(dx0, dy, 4, r + 1, '#4a2a18'); P.ellipse(dx0, dy, 3, r, '#e0b47a');   // průřez (čelo článku)
          P.ellipse(dx0, dy, 2, r - 3, '#c89a5e'); P.px(dx0, dy, '#a8763e');
          P.ellipse(dx0 + len / 2 + 4, dy + r + 1, len * 0.6, 2, '#d8aa6e');            // napůl zasypaný
          P.ellipse(cx + 1, base + 1, cw * 0.8, 2, '#d8aa6e'); P.rect(x0 - 3, base, cw + 6, 1, '#ecc488');
        }
        P.horizon(pxRng(96), 172, 6, '#a8763e', '#ecc488').clip();
      } },
      { dynamic: true, draw(P, r, t){   // proudy písku u země + válející se keř
        const g = gustAt(t);
        if (PX_OPTIONS.desertStreams) for (const s2 of streams){
          const span = PX_W + 40, x = ((s2.x - windPos(t, s2.v * 0.5, s2.v * 0.45)) % span + span) % span - 20;
          const y = s2.y + Math.sin(t * 2 + s2.o) * 2;
          for (let k = 0; k < s2.len * (0.5 + g * 0.6); k++) if ((k + step(t)) % 3) P.px(x + k, y - (k > s2.len * 0.6 ? 1 : 0), k < 3 ? '#f4d8a0' : '#e0b880');
        }
        if (PX_OPTIONS.desertTumble){ const k = tumble(t); if (k) drawTumble(P, k); }
      } },
      { seed: 64, draw(P){   // pískovcové plošinky
        const st = { out: '#2a1a10', side: '#8a5a36', sideDark: '#6a4228', seam: '#a06a40', edge: '#c08a50', top: '#dcae6c', center: '#e8c084', hi: '#fff0c0' };
        P.mound(PL.enemy, 194, pxRng(65), {
          out: '#2a1a10', body: '#7a5030', lit: '#d8a060', shade: '#5a3820', foot: '#c89a5a',
          mud: ['#d8aa66', '#c89a5a'], tuft: null, pebble: '#a8763e',
          strata: ['#5a3820', '#9a6a3e'], platShadow: '#5a3820', rock: DESERT_ROCK,
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        // hieroglyfy na boku plošinek
        for (const [E, side] of [[PL.enemy, 6], [PL.player, 9]]){
          for (let x = E.x - E.rx * 0.6; x < E.x + E.rx * 0.6; x += 9){
            const dy = E.ry * Math.sqrt(Math.max(0, 1 - ((x - E.x) / (E.rx + 0.5)) ** 2)), y = E.y + Math.round(dy) + 2;
            const gl = Math.floor(x) % 3;
            if (gl === 0){ P.px(x, y, '#4a2a18'); P.px(x + 1, y + 1, '#4a2a18'); P.px(x, y + 2, '#4a2a18'); }
            else if (gl === 1){ P.rect(x, y, 3, 1, '#4a2a18'); P.px(x + 1, y + 1, '#4a2a18'); P.rect(x, y + 2, 3, 1, '#4a2a18'); }
            else { P.px(x + 1, y, '#4a2a18'); P.rect(x, y + 1, 3, 1, '#4a2a18'); P.px(x + 1, y + 2, '#4a2a18'); }
          }
        }
      } },
      { dynamic: true, draw(P, r, t){   // zrnka písku ve vzduchu
        if (!PX_OPTIONS.desertStorm) return;
        const g = gustAt(t);
        for (const gr of grains){
          if (gr.th > 0.45 + g * 0.45) continue;
          const L = GRAIN[gr.layer], span = PX_W + 200;
          const y = (gr.y + t * L.v + Math.sin(t * 1.3 + gr.w) * 3) % PX_H;
          const x = ((gr.x - windPos(t, L.drift * 0.5, L.drift * 0.5)) % span + span) % span - 100;
          P.rect(x, y, L.len, 1, L.col);
        }
      } },
    ],
  };
})();


/* =====================================================================
   ARÉNA 6: Strašidelný hřbitov – noc, obří měsíc, pokroucené stromy, mlha
   ===================================================================== */
const GRAVE_ROCK = { out: '#0a0814', dark: '#2a2a3a', mid: '#3a3a4e', light: '#55557a', hi: '#8a90b8', shadow: '#10101c' };
const GRAVE = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const MOON = { x: 92, y: 60, r: 30 };
  const HZ = 170;
  const step = t => Math.floor(t / 0.1);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const SIL = '#0a0814', RIM = '#4a4e78';

  /* pokroucené stromy: rekurzivně se větvící, zkroucené větve končící drápy.
     Segmenty se spočítají jednou, kreslí se každý snímek s jemným pohupováním. */
  function growTree(x, y, h, seed){
    const r = pxRng(pxMix(seed)), segs = [];
    const branch = (x, y, ang, len, w, depth) => {
      let cx = x, cy = y, a = ang;
      const n = Math.max(2, Math.round(len));
      for (let i = 0; i < n; i++){
        a += (r() - 0.5) * 0.35 + Math.sin(i * 0.7 + seed) * 0.04;     // zkroucení
        cx += Math.cos(a); cy += Math.sin(a);
        segs.push({ x: cx, y: cy, w: Math.max(1, Math.round(w * (1 - i / n * 0.5))), hf: Math.max(0, (y - cy) / h + (depth * 0.15)) });
      }
      if (depth >= 4 || len < 3) return;
      const kids = depth < 1 ? 3 : 2;
      for (let k = 0; k < kids; k++){
        const da = (k - (kids - 1) / 2) * (0.7 + r() * 0.5) + (r() - 0.5) * 0.4;
        branch(cx, cy, a + da, len * (0.6 + r() * 0.15), w * 0.62, depth + 1);
      }
    };
    branch(x, y, -Math.PI / 2 + (r() - 0.5) * 0.2, h * 0.45, h * 0.06, 0);
    // kořeny u paty
    for (let k = -1; k <= 1; k += 2) for (let i = 0; i < 6 + r() * 4; i++) segs.push({ x: x + k * i * 1.4, y: y + i * 0.25, w: Math.max(1, 3 - i * 0.4), hf: 0 });
    return segs;
  }
  const TREES = [growTree(26, 186, 120, 11), growTree(462, 180, 110, 23), growTree(150, 170, 52, 37)];

  // náhrobky: [x, zem y, typ, velikost, náklon]
  const STONES = [
    [214, 176, 'round', 0.7, 0], [236, 174, 'cross', 0.6, 0.05], [256, 175, 'round', 0.55, -0.08], [470, 176, 'obelisk', 0.7, 0],
    [56, 176, 'cross', 0.6, -0.06], [10, 178, 'round', 0.5, 0],
    [270, 232, 'round', 1.25, 0.06], [300, 254, 'cross', 1.35, -0.04], [448, 228, 'round', 1.1, -0.12], [474, 258, 'slab', 1.3, 0.05],
    [250, 262, 'slab', 1.0, 0],
  ];
  function drawStone(P, [x, gy, type, sc, tilt]){
    const w = Math.round(12 * sc), h = Math.round(18 * sc);
    P.ellipse(x + w * 0.6, gy, w * 0.9, Math.max(1, 2 * sc), '#0c0c16');                // stín doprava
    const pts = [];
    if (type === 'round'){
      for (let i = 0; i <= 10; i++){ const a = Math.PI + i / 10 * Math.PI; pts.push([x + Math.cos(a) * w / 2, gy - h + w / 2 + Math.sin(a) * w / 2]); }
      pts.push([x + w / 2, gy], [x - w / 2, gy]);
    } else if (type === 'cross'){
      const t = Math.max(2, Math.round(w * 0.3));
      pts.push([x - t / 2, gy], [x - t / 2, gy - h * 0.62], [x - w / 2, gy - h * 0.62], [x - w / 2, gy - h * 0.62 - t], [x - t / 2, gy - h * 0.62 - t],
               [x - t / 2, gy - h], [x + t / 2, gy - h], [x + t / 2, gy - h * 0.62 - t], [x + w / 2, gy - h * 0.62 - t], [x + w / 2, gy - h * 0.62],
               [x + t / 2, gy - h * 0.62], [x + t / 2, gy]);
    } else if (type === 'obelisk'){
      pts.push([x - w * 0.35, gy], [x - w * 0.25, gy - h * 1.2], [x, gy - h * 1.4], [x + w * 0.25, gy - h * 1.2], [x + w * 0.35, gy]);
    } else {   // slab – hranatý se zkosenými rohy
      pts.push([x - w / 2, gy], [x - w / 2, gy - h + 3], [x - w / 2 + 3, gy - h], [x + w / 2 - 3, gy - h], [x + w / 2, gy - h + 3], [x + w / 2, gy]);
    }
    const sh = pts.map(([px, py]) => [px + (gy - py) * tilt, py]);              // náklon
    P.poly(sh.map(([a, b]) => [a - 1, b]), SIL); P.poly(sh.map(([a, b]) => [a + 1, b]), SIL); P.poly(sh.map(([a, b]) => [a, b - 1]), SIL);
    P.poly(sh, '#3a3a4e');
    // nasvícená levá strana (měsíc vlevo) a stinná pravá
    const ys = sh.map(p => p[1]), y0 = Math.ceil(Math.min(...ys)), y1 = Math.floor(Math.max(...ys));
    for (let yy = y0; yy <= y1; yy++){
      let l = 1e9, rgt = -1e9;
      for (let i = 0, j = sh.length - 1; i < sh.length; j = i++){
        const [xi, yi] = sh[i], [xj, yj] = sh[j];
        if ((yi > yy + 0.5) !== (yj > yy + 0.5)){ const xx = xi + (yy + 0.5 - yi) * (xj - xi) / (yj - yi); l = Math.min(l, xx); rgt = Math.max(rgt, xx); }
      }
      if (l > rgt) continue;
      P.rect(l, yy, Math.max(1, (rgt - l) * 0.3), 1, '#55557a'); P.px(l, yy, '#8a90b8');
      P.rect(rgt - Math.max(1, (rgt - l) * 0.3), yy, Math.max(1, (rgt - l) * 0.3), 1, '#2a2a3a');
    }
    if (type !== 'cross' && type !== 'obelisk'){                                  // vyryté řádky + prasklina
      const cy = gy - h * 0.55;
      P.rect(x - w * 0.25, cy, w * 0.5, 1, '#22223a'); P.rect(x - w * 0.2, cy + 3 * sc, w * 0.4, 1, '#22223a');
      P.line(x + w * 0.15, gy - h * 0.85, x + w * 0.05, gy - h * 0.6, 1, '#1a1a2a');
    }
    for (let i = 0; i < w; i += 2) P.px(x - w / 2 + i + (gy - gy) * tilt, gy - 1 - (i % 3 ? 0 : 1), '#3a5040');   // mech u paty
  }

  // mlha: počítá se pixel po pixelu (Bayerův dithering), dvě vrstvy
  const FOG = [hex('#3a3c5a'), hex('#585a7c'), hex('#7a7c9e')];
  const fogBuf = {};
  function drawFog(P, t, y0, y1, dens, speed, salt){
    const H = y1 - y0;
    let f = fogBuf[salt];
    if (!f){ const cv = document.createElement('canvas'); cv.width = PX_W; cv.height = H; f = fogBuf[salt] = { cv, img: cv.getContext('2d').createImageData(PX_W, H) }; }
    const d = f.img.data, off = t * speed;
    for (let y = 0; y < H; y++){
      const k = y / H, Y = y + y0;
      for (let x = 0; x < PX_W; x++){
        const X = x + off;
        let v = dens(k) + 0.22 * Math.sin(X * 0.021 + Y * 0.05 + salt) + 0.16 * Math.sin(X * 0.047 - Y * 0.09 + t * 0.2) + 0.1 * Math.sin(X * 0.11 + Y * 0.21 - t * 0.4);
        const i = (y * PX_W + x) * 4;
        if (v * 16 > BAYER[(x & 3) + (Y & 3) * 4] + 3){
          const c = FOG[v > 0.7 ? 2 : v > 0.45 ? 1 : 0];
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        } else d[i + 3] = 0;
      }
    }
    f.cv.getContext('2d').putImageData(f.img, 0, 0);
    P.ctx.drawImage(f.cv, 0, y0);
  }

  // bludičky
  const wr = pxRng(1301);
  const WISPS = Array.from({ length: 7 }, () => ({ x: 20 + wr() * 440, y: 150 + wr() * 100, ax: 20 + wr() * 40, ay: 6 + wr() * 10, sp: 0.15 + wr() * 0.25, ph: wr() * 6, green: wr() < 0.6 }));
  // netopýři (přelet přes noc) a duch
  function bats(t){
    const out = [], PER = 13, n = Math.floor(t / PER);
    for (let k = n; k >= n - 3 && k >= 0; k--){
      const r = pxRng(pxMix(k * 71 + 9));
      if (r() < 0.25) continue;
      const dir = r() < 0.5 ? 1 : -1, v = 28 + r() * 18, start = r() * PER, ph = t - k * PER - start, dur = (PX_W + 80) / v;
      if (ph < 0 || ph > dur) continue;
      const cnt = 2 + Math.floor(r() * 4), y0 = 30 + r() * 70;
      for (let i = 0; i < cnt; i++) out.push({ x: (dir > 0 ? -40 + ph * v : PX_W + 40 - ph * v) - dir * i * (8 + r() * 6), y: y0 + Math.sin(ph * 5 + i * 2) * 5 + (r() - 0.5) * 16, i });
    }
    return out;
  }
  function ghost(t){
    const PER = 28, n = Math.floor(t / PER), r = pxRng(pxMix(n * 131 + 5));
    if (r() < 0.45) return null;
    const ph = t - n * PER - r() * 6, dur = 16;
    if (ph < 0 || ph > dur) return null;
    const dir = r() < 0.5 ? 1 : -1;
    return { x: dir > 0 ? -20 + ph * 33 : PX_W + 20 - ph * 33, y: 70 + r() * 40 + Math.sin(ph * 1.6) * 8, ph, fade: Math.min(1, ph, dur - ph) };
  }
  function drawGhost(P, g, t){
    const x = Math.round(g.x), y = Math.round(g.y), st = step(t);
    // plynný obal (bliká a vlní se)
    const gr = pxRng(st * 7 + 3);
    for (let i = 0; i < 40; i++){
      const a = gr() * Math.PI * 2, d = 7 + gr() * 6;
      if (gr() > g.fade) continue;
      P.px(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, gr() < 0.5 ? '#6a3a8a' : '#4a2a6a');
    }
    if (g.fade < 0.35 && st % 2) return;                                         // při objevení/mizení bliká
    P.ellipse(x, y, 7, 7, '#1a0a24'); P.ellipse(x, y, 6, 6, '#3a1a4a'); P.ellipse(x - 2, y - 2, 3, 3, '#5a2a6a');
    P.rect(x - 4, y - 2, 3, 2, '#f0f0ff'); P.rect(x + 1, y - 2, 3, 2, '#f0f0ff');   // oči
    P.px(x - 3, y - 2, '#1a0a24'); P.px(x + 2, y - 2, '#1a0a24');
    P.rect(x - 3, y + 2, 7, 1, '#f0f0ff'); P.px(x - 1, y + 3, '#f0f0ff'); P.px(x + 2, y + 3, '#f0f0ff');   // úsměv se zuby
  }

  return {
    name: 'Strašidelný hřbitov',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    layers: [
      { seed: 71, draw(P, r){   // noční nebe, hvězdy, obří měsíc
        P.bands(0, HZ + 4, ['#06040e', '#0a0818', '#100c24', '#18122e', '#201838', '#2a2042', '#342a4e']);
        for (let i = 0; i < 90; i++){ const x = r() * PX_W, y = r() * 130; if (Math.hypot(x - MOON.x, y - MOON.y) > MOON.r + 26) P.px(x, y, r() < 0.2 ? '#c8c8e8' : '#6a6a90'); }
        for (let y = -70; y <= 70; y++) for (let x = -80; x <= 80; x++){            // záře měsíce
          const d = Math.hypot(x, y);
          if (d < MOON.r || d > MOON.r + 60) continue;
          const v = 1 - (d - MOON.r) / 60;
          if (v * v * 16 > BAYER[((MOON.x + x) & 3) + ((MOON.y + y) & 3) * 4]) P.px(MOON.x + x, MOON.y + y, v > 0.6 ? '#4a4a72' : '#2c2848');
        }
        P.ellipse(MOON.x, MOON.y, MOON.r, MOON.r, '#e8ecd8');
        P.ellipse(MOON.x + 4, MOON.y + 3, MOON.r - 3, MOON.r - 3, '#d8dcc6');       // jemný stín na pravé straně měsíce
        P.ellipse(MOON.x - 2, MOON.y - 2, MOON.r - 6, MOON.r - 6, '#eef2e0');
        for (const [cx, cy, rr] of [[-8, -6, 6], [9, -11, 4], [6, 8, 8], [-13, 11, 3], [14, 2, 3], [-4, 16, 4]]){   // moře a krátery
          P.ellipse(MOON.x + cx, MOON.y + cy, rr, rr * 0.9, '#c4c8b2'); P.px(MOON.x + cx - rr * 0.5, MOON.y + cy - rr * 0.5, '#f4f8e8');
        }
      } },
      { dynamic: true, draw(P, r, t){   // cáry mraků táhnoucí přes měsíc + netopýři
        for (let i = 0; i < 6; i++){
          const span = PX_W + 260, x = ((i * 97 + t * (3 + i * 0.7)) % span) - 130, y = 30 + i * 13;
          const w = 40 + (i % 3) * 22, cr = pxRng(i * 17 + 5);
          const nearMoon = Math.abs(x - MOON.x) < w + MOON.r && Math.abs(y - MOON.y) < MOON.r + 6;
          // vysoký chuchvalcovitý mrak: spodní řada širokých chomáčů a nad ní menší, které ho zvedají
          for (let k = 0; k < 5; k++){
            const bx = x + (k - 2) * w * 0.4 + cr() * 8, by = y + (cr() - 0.5) * 3, bw = w * (0.3 + cr() * 0.25), bh = 5 + cr() * 3;
            P.ellipse(bx, by, bw, bh, '#120e22');
            P.rect(bx - bw * 0.7, by + bh, bw * 1.4, 1, nearMoon ? '#8a8ca8' : '#2a2444');      // spodek chytá měsíc
          }
          for (let k = 0; k < 3; k++){
            const bx = x + (k - 1) * w * 0.45 + cr() * 10, by = y - 6 - cr() * 4, br = 5 + cr() * 5;
            P.ellipse(bx, by, br * 1.3, br, '#120e22');
            for (let xx = -br; xx < br; xx += 2) if (cr() < 0.6) P.px(bx + xx, by - br - 1 + ((xx | 0) % 3 === 0 ? 0 : 1), '#120e22');   // roztřepený vršek
            P.px(bx - br * 0.6, by - br * 0.6, nearMoon ? '#3a3a5a' : '#1a1630');               // jemný lem nahoře
          }
        }
        if (PX_OPTIONS.graveBats) for (const b of bats(t)){
          const up = (step(t) + b.i) % 2, x = Math.round(b.x), y = Math.round(b.y);
          P.rect(x - 1, y, 3, 2, SIL); P.px(x - 1, y - 1, SIL); P.px(x + 1, y - 1, SIL);   // tělo s oušky
          if (up){ P.line(x - 1, y, x - 5, y - 3, 1, SIL); P.line(x + 1, y, x + 5, y - 3, 1, SIL); P.px(x - 4, y - 2, SIL); P.px(x + 4, y - 2, SIL); }
          else { P.line(x - 1, y + 1, x - 5, y + 3, 1, SIL); P.line(x + 1, y + 1, x + 5, y + 3, 1, SIL); P.px(x - 3, y + 3, SIL); P.px(x + 3, y + 3, SIL); }
        }
        if (PX_OPTIONS.graveGhost){ const g = ghost(t); if (g) drawGhost(P, g, t); }
      } },
      { seed: 72, draw(P, r){   // kopce, kaple se zvonicí, plot
        P.ridge(pxRidgeLine(r, 30, 1.0), HZ + 2, { body: '#120e20', shade: '#0e0a1a', line: '#2a2444' });
        // kaple: loď + zvonice se špičatou střechou a křížem
        const cx = 214, gy = HZ + 2;
        P.rect(cx - 24, gy - 30, 30, 30, SIL); P.poly([[cx - 26, gy - 30], [cx - 9, gy - 44], [cx + 8, gy - 30]], SIL);
        P.rect(cx + 6, gy - 58, 14, 58, SIL); P.poly([[cx + 4, gy - 58], [cx + 13, gy - 80], [cx + 22, gy - 58]], SIL);
        P.rect(cx + 12, gy - 90, 2, 10, SIL); P.rect(cx + 9, gy - 87, 8, 2, SIL);                     // kříž
        for (let y = gy - 80; y < gy; y++){ const k = (y - (gy - 80)) / 80; P.px(cx + 4 + (y < gy - 58 ? (y - (gy - 80)) * 0.41 : 2), y, RIM); }   // nasvícená hrana věže
        P.line(cx - 26, gy - 30, cx - 9, gy - 44, 1, RIM);
        P.rect(cx - 24, gy - 30, 1, 30, RIM);
        P.rect(cx + 10, gy - 50, 6, 9, '#1a1430'); P.poly([[cx + 10, gy - 50], [cx + 13, gy - 54], [cx + 16, gy - 50]], '#1a1430');   // okno zvonice
        // kovaný plot vzadu (místy vylomený)
        for (let x = 0; x < PX_W; x += 4){
          if ((x > 120 && x < 140) || (x > 330 && x < 350)) continue;
          const yb = HZ + 6, hgt = 9 + ((x / 4) % 3 === 0 ? 2 : 0);
          P.rect(x, yb - hgt, 1, hgt, SIL); P.px(x - 1, yb - hgt, SIL); P.px(x + 1, yb - hgt, SIL); P.px(x, yb - hgt - 1, SIL);
        }
        P.rect(0, HZ, 120, 1, SIL); P.rect(140, HZ, 190, 1, SIL); P.rect(350, HZ, 130, 1, SIL);
        P.rect(0, HZ + 4, 120, 1, SIL); P.rect(140, HZ + 4, 190, 1, SIL); P.rect(350, HZ + 4, 130, 1, SIL);
      } },
      { dynamic: true, draw(P, r, t){   // světlo v okně kaple + zadní mlha mezi kopci
        const fl = Math.sin(t * 3.1) + Math.sin(t * 7.3) * 0.5;
        if (fl > -0.4){ const cx = 214, gy = HZ + 2; P.rect(cx + 11, gy - 49, 4, 7, fl > 0.6 ? '#7ac8a0' : '#3a7a6a'); P.px(cx + 12, gy - 51, '#3a7a6a'); }
        if (PX_OPTIONS.graveFog) drawFog(P, t, 96, HZ + 12, k => 0.12 + k * 0.58, 4, 1);
      } },
      { dynamic: true, draw(P, r, t){   // pokroucené stromy (jemně se pohupují)
        TREES.forEach((segs, ti) => {
          const sway = Math.sin(t * 0.6 + ti * 2) * 0.8 + Math.sin(t * 1.7 + ti) * 0.3;
          for (const sg of segs){
            const x = sg.x + Math.round(sway * sg.hf * sg.hf * 4);
            P.rect(x - (sg.w >> 1), sg.y, sg.w, 1, SIL);
            if (sg.w > 1) P.px(x - (sg.w >> 1), sg.y, RIM);                       // okraj nasvícený měsícem
          }
        });
      } },
      { seed: 73, draw(P, r){   // tráva, cestička, náhrobky
        P.bands(HZ - 6, PX_H, ['#141a1c', '#161e1e', '#1a2422', '#1e2a26', '#222e2a']);
        for (let i = 0; i < 300; i++){
          const x = Math.floor(r() * PX_W), y = HZ + Math.floor(Math.pow(r(), 0.8) * (PX_H - HZ)), hgt = 1 + Math.floor((y - HZ) / 30 + r() * 2);
          P.rect(x, y - hgt, 1, hgt, r() < 0.3 ? '#3a4a3a' : '#28342c');
        }
        for (const st of STONES.filter(st => st[1] < 200)) drawStone(P, st);
        for (const st of STONES.filter(st => st[1] >= 200)) drawStone(P, st);
        const sr = pxRng(77);
        for (let i = 0; i < 5; i++){ const y = 196 + sr() * 70, k = (y - 170) / 100; P.rock(360 + sr() * 110, y, 3 + k * 6, 3 + k * 5, sr, GRAVE_ROCK); }
        P.horizon(pxRng(74), HZ + 2, 5, '#0a0814', '#2a2e44').clip();
      } },
      { dynamic: true, draw(P, r, t){   // přízemní mlha valící se mezi hroby
        if (PX_OPTIONS.graveFog) drawFog(P, t, HZ - 8, 220, k => 0.26 + k * 0.36, 6, 2);
      } },
      { seed: 75, draw(P){   // kamenné plošinky porostlé mechem
        const st = { out: '#0a0814', side: '#3a3a4e', sideDark: '#2a2a38', seam: '#3a5040', edge: '#4e4e66', top: '#62627e', center: '#6e6e8a', hi: '#9a9ec0' };
        P.mound(PL.enemy, 196, pxRng(76), {
          out: '#0a0814', body: '#221c28', lit: '#44466a', shade: '#16121c', foot: '#1a2422',
          mud: ['#1e2a26', '#222e2a'], tuft: ['#28342c', '#3a4a3a'], pebble: '#3a3a4e',
          strata: ['#16121c', '#34304a'], platShadow: '#100c16', rock: GRAVE_ROCK,
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        // mech a praskliny na plošinkách
        const mr = pxRng(78);
        for (const E of [PL.enemy, PL.player]){
          for (let i = 0; i < 26; i++){
            const a = mr() * Math.PI * 2, d = Math.sqrt(mr());
            P.px(E.x + Math.cos(a) * E.rx * d * 0.9, E.y + Math.sin(a) * E.ry * d * 0.85, mr() < 0.5 ? '#3a5040' : '#4a6050');
          }
          P.line(E.x - E.rx * 0.3, E.y - 2, E.x - E.rx * 0.1, E.y + 3, 1, '#2a2a38');
        }
      } },
      { dynamic: true, draw(P, r, t){   // nízká mlha kolem plošinek + bludičky
        if (PX_OPTIONS.graveFog) drawFog(P, t, 210, PX_H, k => 0.26 - k * 0.1, -5, 3);
        if (PX_OPTIONS.graveWisps) for (const w of WISPS){
          const x = w.x + Math.sin(t * w.sp + w.ph) * w.ax, y = w.y + Math.sin(t * w.sp * 2.3 + w.ph) * w.ay;
          const on = (step(t) + Math.round(w.ph * 10)) % 9 !== 0;                 // občas zabliká
          const core = w.green ? '#d0ffe0' : '#d0e8ff', glow = w.green ? '#5ac0a0' : '#5a8ad0', dim = w.green ? '#2a6a5a' : '#2a4a7a';
          for (let k = 1; k <= 4; k++){                                          // stopa
            const tt = t - k * 0.12;
            P.px(w.x + Math.sin(tt * w.sp + w.ph) * w.ax, w.y + Math.sin(tt * w.sp * 2.3 + w.ph) * w.ay + k * 0.5, dim);
          }
          if (!on) continue;
          for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++){       // měkká aura
            const d = Math.hypot(xx, yy);
            if (d > 2.5 && d < 6.5 && (xx + yy + step(t)) % (d < 4.5 ? 2 : 4) === 0) P.px(x + xx, y + yy, d < 4.5 ? glow : dim);
          }
          P.ellipse(x, y, 2, 2, glow); P.rect(x - 1, y - 1, 2, 2, core); P.px(x, y - 3, core);
        }
      } },
    ],
  };
})();


/* =====================================================================
   ARÉNA 7: Pavoučí jeskyně – zarostlá jeskyně v džungli. Propadlým stropem vlevo nahoře
   padají sluneční paprsky, vzadu temná chodba zatažená obří pavučinou, v koutech pavučiny.
   ===================================================================== */
const JUNGLE_ROCK = { out: '#0a0c08', dark: '#1e2418', mid: '#2c3422', light: '#44503a', hi: '#6a7a52', shadow: '#080a06' };
const JUNGLE = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const HZ = 170;
  const HOLE = { x: 112, y: 2, rx: 54, ry: 26 };                    // propadlý strop
  // temná chodba do hlubin jeskyně v zadní stěně
  const TN = { x: 252, y: HZ + 2, rx: 54, ry: 94 };
  const tnW = y => TN.rx + Math.sin(y * 0.3) * 1.5 + Math.sin(y * 0.11 + 1) * 3;
  const inTunnel = (x, y) => ((x - TN.x) / tnW(y)) ** 2 + ((y - TN.y) / TN.ry) ** 2 < 1;
  const tnDepth = (x, y) => 1 - Math.sqrt(((x - TN.x) / tnW(y)) ** 2 + ((y - TN.y) / TN.ry) ** 2);
  const EYES = [[236, 128], [270, 112], [256, 150], [226, 154], [284, 140]];
  const step = t => Math.floor(t / 0.1);
  const ts = t => step(t) * 0.1;                                    // čas po 100 ms krocích
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[(x & 3) + (y & 3) * 4];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // horní hrana dutiny (nad ní skála); u kraje sahá až k zemi, u otvoru se zvedá
  const top = x => {
    const u = Math.abs(x / PX_W - 0.52) * 2;
    return 30 + 150 * u * u * u - 30 * Math.exp(-(((x - HOLE.x) / 48) ** 2)) + Math.sin(x * 0.17) * 2.5 + Math.sin(x * 0.41 + 1) * 1.2;
  };
  const inHole = (x, y) => ((x - HOLE.x) / HOLE.rx) ** 2 + ((y - HOLE.y) / HOLE.ry) ** 2 <= 1;
  const WF = { x0: 446, x1: 454, top: Math.round(top(450)) - 1, bot: 176 };   // pramen ze skály
  // sluneční paprsky z otvoru: [x u otvoru, šířka]
  const RAYS = [[76, 10], [98, 17], [124, 12], [148, 19]];
  const RAY_K = 0.62;

  // tón skály: šum + světlo z otvoru
  const ROCK = ['#080a06', '#11150d', '#1a2014', '#262e1c', '#36422a'];
  function cellNoise(size, seed){
    const H = size * 0.7;
    const pt = (i, j) => { const r = pxRng(pxMix(i * 7919 + j * 104729 + seed)); return [(i + 0.15 + r() * 0.7) * size, (j + 0.15 + r() * 0.7) * H, r()]; };
    const memo = new Map(), P2 = (i, j) => { const k = i * 1000 + j; let v = memo.get(k); if (!v){ v = pt(i, j); memo.set(k, v); } return v; };
    return (x0, y0) => {
      const x = x0 + Math.sin(y0 * 0.09) * 7 + Math.sin(y0 * 0.23 + 1) * 3, y = y0 + Math.sin(x0 * 0.07 + 2) * 6 + Math.sin(x0 * 0.19) * 2;   // pokřivení
      const ci = Math.floor(x / size), cj = Math.floor(y / H);
      let d1 = 1e9, d2 = 1e9, best = null;
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++){
        const q = P2(i, j), d = Math.hypot(x - q[0], (y - q[1]) * 1.3);
        if (d < d1){ d2 = d1; d1 = d; best = q; } else if (d < d2) d2 = d;
      }
      return { edge: d2 - d1, fx: (x - best[0]) / size, fy: (y - best[1]) / H, v: best[2] };
    };
  }
  const shellCells = cellNoise(44, 31), backCells = cellNoise(54, 57);
  // tón skály: lámané plochy nasvícené zleva shora + světlo z otvoru; edge < 1.4 = prasklina
  function rockTone(x, y, dim, cells = shellCells){
    const c = cells(x, y);
    const gate = Math.sin(x * 0.13 + y * 0.07) + Math.sin(x * 0.05 - y * 0.11 + 2) * 0.7;
    if (c.edge < 1.2 && gate > -0.2) return 0;                          // praskliny jen místy
    const L = Math.max(0, 1 - Math.hypot(x - HOLE.x, (y - HOLE.y) * 1.2) / 200);
    let v = 0.2 + c.v * 0.12 + L * 0.55 - dim - (c.fx + c.fy) * 0.24 + Math.sin(x * 0.3 + y * 0.5) * 0.04 + (bay(x, y) / 16 - 0.5) * 0.12;
    if (c.edge < 2.4 && c.fy < 0 && gate > -0.2) v += 0.12;                          // horní hrana plochy chytá světlo
    return v < 0.16 ? 0 : v < 0.3 ? 1 : v < 0.46 ? 2 : v < 0.62 ? 3 : 4;
  }
  function haze(P, y0, y1, col, maxD){
    for (let y = y0; y < y1; y++){
      const k = (y - y0) / (y1 - y0);
      for (let x = 0; x < PX_W; x++) if (k * maxD * 16 > bay(x, y) + 0.5) P.px(x, y, col);
    }
  }
  function fern(P, x, y, s, r, c){
    for (let f = 0; f < 5; f++){
      let a = -Math.PI / 2 + (f - 2) * 0.55 + (r() - 0.5) * 0.2, px = x, py = y;
      const len = s * (0.7 + r() * 0.5), bend = (f - 2 || (r() < 0.5 ? -1 : 1)) > 0 ? 1 : -1;
      for (let k = 0; k < len; k++){
        a += bend * 0.9 / len; px += Math.cos(a); py += Math.sin(a);
        P.px(px, py, c.stem);
        if (k % 2 === 0 && k < len - 1){
          const nx = -Math.sin(a), ny = Math.cos(a), l = Math.max(1, Math.round((1 - k / len) * 3));
          for (let j = 1; j <= l; j++){ P.px(px + nx * j, py + ny * j, c.leaf); P.px(px - nx * j, py - ny * j, nx < 0 ? c.lit : c.leaf); }
        }
      }
    }
  }
  function bigLeaf(P, bx, by, ang, len, wid, c){
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    for (let k = 0; k < len; k++){
      const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, (k + 2) / len)), 0.8);
      const cx = bx + dx * k + nx * Math.sin(k / len * 2) * 4, cy = by + dy * k + ny * Math.sin(k / len * 2) * 4;
      for (let j = -w; j <= w; j += 0.7){
        if ((k % 7 === 3) && Math.abs(j) > w * 0.55) continue;
        P.rect(cx + nx * j, cy + ny * j, 2, 2, Math.abs(j) > w - 1.2 ? c.out : j * ny < 0 ? c.lit : c.mid);
      }
      P.px(cx, cy, c.spine);
    }
  }
  // pavučina: paprsky od středu ke skále (kde ji nenajdou, nejsou), mezi nimi prověšené kruhy
  function web(P, cx, cy, R, r, solid = (x, y) => y < top(x), col = ['#5e6a5e', '#4a564a']){
    const sp = [];
    for (let i = 0; i < 14; i++){
      const a = i / 14 * Math.PI * 2 + (r() - 0.5) * 0.2;
      let d = 0;
      while (d < R){ d++; const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; if (solid(x, y) || x < 0 || x >= PX_W) break; }
      sp.push(d < R ? { a, d } : null);
    }
    const th = (x0, y0, x1, y1, c, salt) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i <= n; i++) if ((i + salt) % 3) P.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, (i + salt) % 7 ? c : '#b8c4b4');
    };
    sp.forEach((s, i) => { if (s) th(cx, cy, cx + Math.cos(s.a) * s.d, cy + Math.sin(s.a) * s.d, col[0], i); });
    for (let k = 1; k <= 6; k++) sp.forEach((s, i) => {
      const s2 = sp[(i + 1) % sp.length];
      if (!s || !s2) return;
      const d1 = Math.min(s.d, R * k / 6.5), d2 = Math.min(s2.d, R * k / 6.5);
      const x0 = cx + Math.cos(s.a) * d1, y0 = cy + Math.sin(s.a) * d1, x1 = cx + Math.cos(s2.a) * d2, y1 = cy + Math.sin(s2.a) * d2;
      const mx = (x0 + x1) / 2 - (x0 + x1 - 2 * cx) * 0.06, my = (y0 + y1) / 2 - (y0 + y1 - 2 * cy) * 0.06;   // prověšení ke středu
      th(x0, y0, mx, my, col[1], k); th(mx, my, x1, y1, col[1], k + 1);
    });
    if (r() < 0.7){ P.px(cx + 3, cy + 2, '#3a3028'); P.px(cx - 4, cy - 3, '#3a3028'); P.rect(cx - 5, cy + 4, 2, 3, '#8a8a72'); }   // chycený hmyz / kokon
  }

  // mlha
  const MIST = [hex('#1e3026'), hex('#2e4636'), hex('#46604a')];
  const mistBuf = {};
  function drawMist(P, t, y0, y1, dens, speed, salt){
    const H = y1 - y0;
    let f = mistBuf[salt];
    if (!f){ const cv = document.createElement('canvas'); cv.width = PX_W; cv.height = H; f = mistBuf[salt] = { cv, img: cv.getContext('2d').createImageData(PX_W, H) }; }
    const d = f.img.data, off = t * speed;
    for (let y = 0; y < H; y++){
      const k = y / H, Y = y + y0;
      for (let x = 0; x < PX_W; x++){
        const X = x - off;
        const v = dens(k, x) + 0.2 * Math.sin(X * 0.024 + Y * 0.07 + salt) + 0.13 * Math.sin(X * 0.053 - Y * 0.11 + t * 0.2) + 0.07 * Math.sin(X * 0.13 + Y * 0.2 - t * 0.4);
        const i = (y * PX_W + x) * 4;
        if (v * 16 > bay(x, Y) + 4){ const c = MIST[v > 0.72 ? 2 : v > 0.48 ? 1 : 0]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
        else d[i + 3] = 0;
      }
    }
    f.cv.getContext('2d').putImageData(f.img, 0, 0);
    P.ctx.drawImage(f.cv, 0, y0);
  }

  // liány a kořeny visící z okraje otvoru a ze stropu
  const vr = pxRng(1701);
  const VINES = [62, 74, 90, 106, 128, 146, 160, 214, 300, 372].map(x => ({ x: x + vr() * 5, len: 18 + Math.floor(vr() * 50), ph: vr() * 6, root: x > 200 }));
  // pavouci spouštějící se na vlákně
  const SPIDERS = [{ x: 196, len: 34, ph: 0 }, { x: 318, len: 46, ph: 2.1 }, { x: 404, len: 30, ph: 4.2 }];
  // svítící houby: [x, y, velikost]
  const SHROOM_SPOTS = [[26, 200, 4], [454, 202, 4], [306, 180, 3], [190, 182, 3], [64, 266, 4], [274, 254, 3], [420, 256, 4],
                        [10, 154, 2], [472, 150, 2], [340, 264, 3]];
  // trsy: hlavní houba + menší kolem; tvar zvonek (vysoká tenká noha) nebo kopule
  const SHROOMS = (() => {
    const r = pxRng(1741), out = [];
    SHROOM_SPOTS.forEach(([x, y, sz], ci) => {
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++){
        const k = i === 0 ? 1 : 0.35 + r() * 0.5;
        out.push({ x: Math.round(x + (i === 0 ? 0 : (r() - 0.5) * sz * 6)), y: Math.round(y + (i === 0 ? 0 : (r() - 0.2) * 3)),
                   sz: Math.max(1, Math.round(sz * k)), lean: Math.round((r() - 0.5) * 3), bell: r() < 0.55, ci, ph: r() * 6 });
      }
    });
    return out.sort((a, b) => a.y - b.y);
  })();
  // bioluminiscenční houba: tmavý průsvitný klobouk, svítí okraj a lupeny; on = 0..1
  function shroom(P, m, on){
    const { x, y, sz, lean, bell } = m;
    const h = bell ? sz * 3 + 2 : sz * 2 + 1, rc = bell ? Math.max(1, sz) : sz + 1, capH = bell ? sz + 2 : Math.max(2, Math.ceil(rc * 0.7));
    const glow = on > 0.6 ? '#9affd8' : on > 0.3 ? '#6ae8c0' : '#48c0a0';
    for (let k = 0; k <= h; k++){                                         // tenká tmavá noha, prohnutá
      const xx = x + Math.round(lean * (k / h) ** 2), yy = y - k;
      P.px(xx, yy, k < 2 ? '#1a2a22' : '#3a5e56');
      if (sz >= 3 && k > 1) P.px(xx - 1, yy, '#5a8a7e');
    }
    const cx = x + lean, ty = y - h;
    for (let dy = 0; dy <= capH; dy++){
      const f = dy / (capH + 0.5);
      const hw = Math.round(bell ? rc * (1 - f * f * 0.9) : rc * Math.sqrt(1 - f * f)), yy = ty - dy;
      P.rect(cx - hw - 1, yy, hw * 2 + 3, 1, '#04120e');
      P.rect(cx - hw, yy, hw * 2 + 1, 1, dy < 2 ? '#2a8a74' : '#1a5a4c');      // spodek klobouku prosvítá
      if (hw > 1 && dy >= 2) P.px(cx - hw + 1, yy, '#3a9a84');                  // jemně nasvícená levá strana
      if (dy === capH && hw >= 0) P.px(cx - Math.max(0, hw - 1), yy, '#4ab098');
    }
    const w0 = Math.round(bell ? rc : rc);                                  // svítící okraj a lupeny
    P.rect(cx - w0, ty + 1, w0 * 2 + 1, 1, glow);
    if (w0 >= 2) for (let gx = cx - w0 + 1; gx < cx + w0; gx += 2) P.px(gx, ty + 1, '#2ab894');
    P.px(cx - w0 - 1, ty + 1, on > 0.5 ? glow : '#2a8a74'); P.px(cx + w0 + 1, ty + 1, '#2a8a74');
    if (sz >= 3) P.px(cx - 1, ty - Math.round(capH * 0.5), on > 0.5 ? '#5ad0b0' : '#2a8a74');   // svítící skvrnka
  }
  const br = pxRng(1709);
  const MOTES = Array.from({ length: 50 }, () => ({ x: br() * 260, y: 20 + br() * 160, v: 1 + br() * 3, w: br() * 6, tw: Math.floor(br() * 16) }));
  const FLIES = Array.from({ length: 24 }, () => ({ x: br() * PX_W, y: 120 + br() * 140, ph: Math.floor(br() * 30), w: br() * 6 }));
  const rayAt = (x, y) => {                                         // 0..1 – jak moc je bod v paprsku
    let best = 0;
    for (const [x0, w] of RAYS){ const cx = x0 + (y - 28) * RAY_K, v = 1 - Math.abs(x - cx) / w; if (v > best) best = v; }
    return best;
  };

  return {
    name: 'Pavoučí jeskyně',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    layers: [
      { seed: 111, draw(P, r){   // nebe a džungle v otvoru, zadní stěna jeskyně, průčelí chrámu
        // otvor: zářivé nebe a koruny stromů nad ním
        for (let y = 0; y < HOLE.y + HOLE.ry; y++) for (let x = HOLE.x - HOLE.rx; x <= HOLE.x + HOLE.rx; x++){
          const d = Math.hypot(x - HOLE.x + 14, (y - 8) * 1.4);
          P.px(x, y, d < 14 ? '#fff6d0' : d < 26 ? '#f4e2a0' : d < 40 ? '#d8c880' : '#a8a868');
        }
        for (let x = HOLE.x - HOLE.rx; x < HOLE.x + HOLE.rx; x += 4 + Math.floor(r() * 4)){
          const rr = 4 + r() * 6, y = 2 + Math.sin(x * 0.3) * 3;
          P.ellipse(x, y, rr, rr * 0.7, x < HOLE.x - 10 ? '#4e6e3a' : '#3a5a30'); P.px(x - rr * 0.4, y - rr * 0.4, '#8aa860');
        }
        // zadní stěna: tmavší lámaná skála, u dopadu paprsků světlejší
        const BACK = ['#050604', '#0a0d08', '#10150c', '#171e11', '#202a17'];
        for (let x = 0; x < PX_W; x++) for (let y = Math.max(0, Math.floor(top(x)) - 2); y < HZ + 6; y++){
          const L = Math.max(0, 1 - Math.hypot(x - 206, (y - 160) * 1.3) / 130) * 0.3;
          P.px(x, y, BACK[rockTone(x, y, 0.2 - L, backCells)]);
        }
        for (let i = 0; i < 18; i++){                                           // římsy a praskliny
          let x = r() * PX_W, y = 60 + r() * 100;
          const len = 10 + r() * 34;
          for (let k = 0; k < len; k++){ x += 1; y += (r() - 0.5) * 0.9; if (y > top(x) + 2){ P.px(x, y, '#060805'); P.px(x, y - 1, '#24301c'); } }
        }
        for (const [x, h] of [[166, 22], [176, 14], [336, 26], [350, 16], [96, 18]]){   // krápníky vzadu
          P.poly([[x - 5, HZ + 2], [x - 1, HZ + 2 - h], [x + 1, HZ + 2 - h], [x + 5, HZ + 2]], '#0c100a');
          P.line(x - 5, HZ + 2, x - 1, HZ + 2 - h, 1, '#2c3826');
        }
        // temná chodba: nasvícený okraj vlevo, uvnitř tma houstne do hloubky, vzadu druhý oblouk
        for (let y = TN.y - TN.ry - 14; y < HZ + 6; y++) for (let x = TN.x - TN.rx - 16; x <= TN.x + TN.rx + 16; x++){   // skalní oblouk kolem ústí
          if (inTunnel(x, y)) continue;
          const o = Math.sqrt(((x - TN.x) / (tnW(y) + 12)) ** 2 + ((y - TN.y) / (TN.ry + 12)) ** 2);
          if (o >= 1 || o * 16 > 16 - bay(x, y) * 0.4) continue;
          const lit = (x - TN.x) / TN.rx * 0.6 + (y - TN.y) / TN.ry * 0.8 < -0.3;
          P.px(x, y, rockTone(x, y, lit ? -0.05 : 0.15) >= 2 ? (lit ? '#4a5a38' : '#262e1c') : (lit ? '#34402a' : '#141a10'));
        }
        for (let y = TN.y - TN.ry; y < HZ + 6; y++) for (let x = TN.x - TN.rx - 6; x <= TN.x + TN.rx + 6; x++){
          if (!inTunnel(x, y)) continue;
          const d = tnDepth(x, y), b = bay(x, y) / 16;
          let c = d < 0.03 ? '#040503' : d < 0.08 ? (x < TN.x - 10 ? '#56663e' : '#11150d') : d < 0.14 ? (x < TN.x ? '#1e2616' : '#0a0c08') : d < 0.3 + b * 0.1 ? '#080a06' : d < 0.5 + b * 0.1 ? '#050604' : '#020302';
          const d2 = 1 - Math.hypot((x - TN.x - 6) / 26, (y - HZ) / 50);                    // vzdálenější oblouk
          if (d2 > 0 && d2 < 0.08) c = x < TN.x + 6 ? '#10150c' : '#050604';
          P.px(x, y, c);
        }
        for (let y = HZ - 26; y < HZ + 4; y++) for (let x = TN.x - 20; x < TN.x + 30; x++){     // slabý svit hub hluboko v chodbě
          const v = 1 - Math.hypot((x - TN.x - 6) / 22, (y - HZ + 4) / 14);
          if (v > 0 && v * 12 > bay(x, y) + 3) P.px(x, y, v > 0.5 ? '#12302a' : '#0a1c18');
        }
        for (const [x, y] of [[TN.x, HZ - 2], [TN.x + 12, HZ], [TN.x - 6, HZ + 1]]){ P.px(x, y - 1, '#3ab8a8'); P.px(x, y, '#5a7a6a'); }
        // krápníky visící z oblouku chodby
        for (let x = TN.x - TN.rx + 10; x < TN.x + TN.rx - 8; x += 5 + Math.floor(r() * 7)){
          let y0 = TN.y - TN.ry; while (y0 < HZ && !inTunnel(x, y0)) y0++;
          const len = 3 + Math.floor(r() * 12);
          for (let k = 0; k < len; k++){ const w = Math.max(1, Math.round(2.5 * (1 - k / len))); P.rect(x - w, y0 + k, w * 2, 1, k % 3 ? '#1a2014' : '#262e1c'); P.px(x - w, y0 + k, '#36422a'); }
        }
        // stalagmity po stranách chodby
        for (const [x, h, w] of [[184, 40, 9], [200, 24, 6], [172, 18, 5], [318, 34, 8], [334, 20, 6], [306, 14, 4]]){
          P.poly([[x - w - 1, HZ + 3], [x - 1, HZ + 3 - h - 1], [x + 1, HZ + 3 - h - 1], [x + w + 1, HZ + 3]], '#060805');
          P.poly([[x - w, HZ + 3], [x, HZ + 3 - h], [x + w, HZ + 3]], '#2a3420');
          P.poly([[x - w, HZ + 3], [x, HZ + 3 - h], [x - w * 0.2, HZ + 3]], '#4a5a38');
          P.poly([[x + w * 0.4, HZ + 3], [x, HZ + 3 - h], [x + w, HZ + 3]], '#11150d');
          P.line(x - w, HZ + 3, x, HZ + 3 - h, 1, '#6a7a4e');
          for (let k = 0; k < 6; k++) P.px(x - w * 0.6 + r() * w, HZ + 2 - r() * h * 0.5, '#2e4a22');
        }
        // obří pavučina přes ústí chodby
        web(P, TN.x + 2, 124, 80, pxRng(1731), (x, y) => !inTunnel(x, y) || y > HZ + 2, ['#8a968a', '#6a766a']);
        haze(P, HZ - 30, HZ + 6, '#141c12', 0.3);
      } },
      { dynamic: true, draw(P, r, t){   // pavoučí oči, které občas zasvítí v chodbě
        if (!PX_OPTIONS.jungleSpiders) return;
        const s = step(t);
        EYES.forEach(([x, y], i) => {
          const c = (s + i * 47) % 110;
          if (c > 34 || c === 12 || c === 13) return;                       // jinak zhasnuté / mrknutí
          const dim = c < 3 || c > 31;
          for (const [dx, dy, big] of [[0, 0, 1], [4, 0, 1], [-1, -2, 0], [5, -2, 0], [1, -3, 0], [3, -3, 0]]){
            P.px(x + dx, y + dy, dim ? '#5a1408' : big ? '#ff4a2a' : '#c8281a');
            if (big && !dim) P.px(x + dx, y + dy - 1, '#ffb090');
          }
        });
      } },
      { seed: 112, draw(P, r){   // vlhké dno jeskyně: světlá skvrna od paprsků, mech, louže, kapradí, kosti
        P.bands(HZ - 4, PX_H, ['#1a2416', '#162014', '#131c12', '#101810', '#0c140c', '#0a100a']);
        for (let y = HZ; y < HZ + 46; y++) for (let x = 120; x < 300; x++){     // kam dopadají paprsky
          const v = 1 - Math.hypot((x - 206) / 80, (y - HZ - 14) / 26);
          if (v > 0 && v * 16 > bay(x, y) + 2) P.px(x, y, v > 0.55 ? '#5e7a36' : v > 0.3 ? '#3e5a2a' : '#2a4020');
        }
        for (let i = 0; i < 300; i++){                                           // mech a tráva (víc ve světle)
          const x = r() * PX_W, y = HZ + r() * (PX_H - HZ), lit = Math.hypot((x - 206) / 90, (y - HZ - 14) / 30) < 1;
          if (!lit && r() < 0.6) continue;
          const h = 1 + Math.floor(r() * (2 + (y - HZ) * 0.03));
          for (let k = 0; k < h; k++) P.px(x, y - k, k === h - 1 ? (lit ? '#6a8a3a' : '#2e4424') : (lit ? '#3e5a28' : '#1e2e18'));
        }
        for (const [x, y, w] of [[338, 236, 26], [96, 258, 18], [428, 214, 16], [270, 196, 12]]){   // louže s odrazem
          P.ellipse(x, y, w + 1, w * 0.2 + 1, '#060a08'); P.ellipse(x, y, w, w * 0.2, '#0e1c1a');
          P.rect(x - w * 0.5, y - 1, w * 0.6, 1, '#3a5a50'); P.px(x + w * 0.3, y, '#2a4440');
        }
        const FC = { stem: '#24401c', leaf: '#3a6428', lit: '#6a9a3c' }, FD = { stem: '#121e10', leaf: '#1a2c16', lit: '#2e4424' };
        for (const [x, y, sz, lit] of [[170, 178, 11, 1], [236, 182, 10, 1], [260, 176, 8, 1], [206, 196, 13, 1], [14, 210, 15, 0], [40, 236, 12, 0],
                                        [462, 228, 16, 0], [300, 262, 16, 0], [440, 262, 14, 0], [394, 192, 9, 0]]) fern(P, x, y, sz, r, lit ? FC : FD);
        for (let i = 0; i < 8; i++){ const y = 186 + r() * 80, k = (y - 170) / 100; P.rock(240 + r() * 230, y, 3 + k * 6, 3 + k * 5, r, JUNGLE_ROCK); }
        // kosti: lebka, napůl zarostlý hrudní koš, hnáty a menší zvířecí lebka s tesáky
        const BONE = { o: '#14120c', h: '#f0e8c8', l: '#d0c6a2', m: '#a09878', d: '#6e6852', s: '#060504' };
        const bone = (x0, y0, x1, y1) => {
          P.line(x0 + 1, y0 + 2, x1 + 1, y1 + 2, 1, '#080a06');                          // stín doprava dolů
          P.line(x0, y0 + 1, x1, y1 + 1, 1, BONE.d); P.line(x0, y0, x1, y1, 1, BONE.l);
          for (const [ex, ey] of [[x0, y0], [x1, y1]]){ P.rect(ex - 1, ey - 1, 3, 3, BONE.o); P.px(ex - 1, ey - 1, BONE.h); P.px(ex, ey, BONE.l); P.px(ex + 1, ey - 1, BONE.l); P.px(ex - 1, ey + 1, BONE.m); P.px(ex + 1, ey + 1, BONE.d); }
        };
        const art = (x, y, rows, pal) => rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') P.px(x + i, y + j, pal[ch]); }));
        const SKULL = ['..ooooo..', '.ohhhllo.', 'ohhllllmo', 'ohsslssmo', 'olsslssdo', 'ollmsmldo', '.oltltdo.', '..odtdo..', '...ooo...'];
        const BP = { o: BONE.o, h: BONE.h, l: BONE.l, m: BONE.m, d: BONE.d, s: BONE.s, t: '#c8c0a0' };
        // hromádka u plošinky soupeře
        const bx = 258, by = 212;
        P.ellipse(bx + 12, by + 9, 20, 3, '#0a0e08');
        for (let i = 0; i < 5; i++){                                                    // hrudní koš (žebra z páteře)
          const cx = bx + 14 + i * 4;
          for (let a = Math.PI; a < Math.PI * 1.85; a += 0.12){ const xx = cx + Math.cos(a) * 3, yy = by + 7 + Math.sin(a) * (6 - i * 0.6); P.px(xx, yy, a < Math.PI * 1.3 ? BONE.l : BONE.m); P.px(xx + 1, yy + 1, '#080a06'); }
        }
        P.line(bx + 10, by + 7, bx + 34, by + 8, 1, BONE.m); P.line(bx + 10, by + 6, bx + 34, by + 7, 1, BONE.l);
        for (let x = bx + 11; x < bx + 34; x += 3) P.px(x, by + 6, BONE.h);              // obratle
        for (let x = bx + 12; x < bx + 36; x += 2) P.px(x, by + 9, r() < 0.5 ? '#2e4424' : '#3e5a28');   // tráva přes kosti
        bone(bx - 14, by + 9, bx - 2, by + 6); bone(bx + 36, by + 4, bx + 46, by + 10);
        art(bx, by, SKULL, BP);
        P.px(bx + 2, by, '#3e6428'); P.px(bx + 3, by, '#2e4a22'); P.px(bx + 6, by + 1, '#3e6428');   // mech na lebce
        for (const [x0, y0, x1, y1] of [[bx - 2, by - 3, bx + 9, by + 4], [bx + 4, by - 4, bx + 4, by + 3], [bx - 3, by + 2, bx + 10, by - 2]])   // pavučina přes lebku
          for (let i = 0, n = Math.hypot(x1 - x0, y1 - y0); i <= n; i++) if (i % 2) P.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, '#6a766a');
        // menší zvířecí lebka s tesáky a rozházené kosti vpravo
        const ax = 386, ay = 240;
        P.ellipse(ax + 6, ay + 6, 10, 2, '#0a0e08');
        art(ax, ay, ['.oooo....', 'ohhlloooo', 'ohslllllo', 'olllmmmdo', '.otdtdtdo', '..t...t..'], BP);
        bone(ax + 12, ay + 5, ax + 22, ay + 2); bone(ax - 10, ay + 6, ax - 3, ay + 8);
        bone(70, 264, 82, 262);
        // tůňka pod pramenem
        P.ellipse(452, 180, 30, 6, '#060a08'); P.ellipse(452, 180, 28, 5, '#14302c'); P.ellipse(448, 179, 18, 3, '#1e4440');
        P.horizon(pxRng(113), HZ + 1, 4, '#0a100a', '#2e4424').clip();
      } },
      { seed: 114, draw(P, r){   // skalní plášť jeskyně: stěny, klenba s otvorem, krápníky, kořeny, pavučiny
        for (let x = 0; x < PX_W; x++){
          const tp = Math.round(top(x));
          for (let y = 0; y < tp; y++){
            if (inHole(x, y)) continue;
            const e = tp - y;
            let c = ROCK[rockTone(x, y, 0)];
            if (e === 1) c = '#0a0c08'; else if (e === 2 && x < 300) c = '#4a5a36'; else if (e <= 4) c = ROCK[Math.min(4, rockTone(x, y, 0) + 1)];
            P.px(x, y, c);
          }
        }
        for (let x = 0; x < PX_W; x++){                                         // mech na hraně u otvoru
          const L = Math.max(0, 1 - Math.abs(x - HOLE.x) / 130);
          if (r() < L) for (let k = 0; k < 1 + r() * 4 * L; k++) P.px(x, top(x) - 2 - k * r() * 3, r() < 0.5 ? '#3e6428' : '#2e4a22');
        }
        // okraj otvoru: nasvícená skála a převislá vegetace
        for (let a = 0; a < Math.PI * 2; a += 0.02){
          const x = Math.round(HOLE.x + Math.cos(a) * (HOLE.rx + 1)), y = Math.round(HOLE.y + Math.sin(a) * (HOLE.ry + 1));
          if (y >= 0 && y < top(x) - 1){ P.px(x, y, '#8a9a5a'); P.px(x, y + 1, '#3e4a2a'); }
        }
        for (let a = 0.15; a < Math.PI - 0.15; a += 0.16){
          const x = HOLE.x + Math.cos(a) * HOLE.rx, y = HOLE.y + Math.sin(a) * HOLE.ry, rr = 3 + r() * 4;
          if (y > top(x) - 1) continue;
          P.ellipse(x, y, rr + 1, rr * 0.7 + 1, '#0e180c'); P.ellipse(x, y, rr, rr * 0.7, '#2e4a22'); P.ellipse(x - 1, y - 1, rr * 0.5, rr * 0.35, '#5a8034');
        }
        // krápníky ze stropu
        for (let x = 6; x < PX_W - 4; x += 6 + Math.floor(r() * 12)){
          const y0 = top(x) - 1;
          if (inHole(x, y0 - 2) || y0 > 150) continue;
          const len = 4 + Math.floor(r() ** 1.5 * 24), w = 2 + Math.floor(r() * 3);
          for (let k = 0; k < len; k++){
            const ww = Math.max(1, Math.round(w * (1 - k / len)));
            P.rect(x - ww - 1, y0 + k, ww * 2 + 2, 1, '#060805');
            P.rect(x - ww, y0 + k, ww * 2, 1, ROCK[2]); P.rect(x - ww, y0 + k, 1, 1, ROCK[4]);
          }
          if (r() < 0.4) P.px(x, y0 + len + 1, '#6a8a7a');
        }
        // suché kořeny prorůstající stropem
        for (let i = 0; i < 9; i++){
          let x = 190 + r() * 250, y = top(x) - 1;
          const len = 10 + r() * 34;
          for (let k = 0; k < len; k++){ x += (r() - 0.5) * 1.4; y += 1; P.px(x, y, '#2e2418'); if (k % 4 === 0) P.px(x + 1, y, '#4a3a26'); if (r() < 0.08) P.line(x, y, x + (r() - 0.5) * 8, y + 4, 1, '#2e2418'); }
        }
        // pavučiny v koutech
        web(P, 34, 150, 38, pxRng(1721));
        web(P, 420, 98, 30, pxRng(1722));
        web(P, 328, 48, 18, pxRng(1723));
        web(P, 470, 150, 20, pxRng(1724));
        web(P, 12, 112, 22, pxRng(1725));
      } },
      { dynamic: true, draw(P, r, t){   // pramen, vlnky, paprsky, prach v paprscích, mlha
        const s = step(t), T = ts(t);
        if (PX_OPTIONS.jungleWaterfall){
          for (let x = WF.x0 - 2; x <= WF.x1 + 2; x++){
            const sp = 6 + ((x * 7) % 3) * 2;
            for (let y = WF.top; y < WF.bot; y++){
              const k = (y - WF.top) / (WF.bot - WF.top), l = WF.x0 + Math.round(Math.sin(y * 0.11) * 1.2 - k * 2), rr = WF.x1 + Math.round(Math.sin(y * 0.13 + 2) * 1.2 + k * 2);
              if (x < l || x > rr) continue;
              const band = Math.floor((y - s * sp) / 4), h = (((x * 73856093) ^ (band * 19349663)) >>> 0) % 7;
              P.px(x, y, x === l || x === rr ? '#2e5450' : h < 2 ? '#e0f4ec' : h < 5 ? '#8ac0b8' : '#4a8480');
            }
          }
          const sr = pxRng(pxMix(s * 13 + 1)), cx = (WF.x0 + WF.x1) / 2;
          for (let i = 0; i < 16; i++) P.px(cx + (sr() - 0.5) * 30, WF.bot - sr() * sr() * 12, sr() < 0.5 ? '#e0f4ec' : '#8ac0b8');
          for (let k = 0; k < 3; k++){
            const ph = ((s + k * 8) % 24) / 24, rx = 5 + ph * 22, ry = 1 + ph * 4;
            for (let a = 0; a < Math.PI * 2; a += 0.1){
              if (Math.sin(a) > -0.2 && (Math.floor(a * 10) + k) % 3) P.px(cx + Math.cos(a) * rx, 180 + Math.sin(a) * ry, ph < 0.5 ? '#6aa8a0' : '#2e5a56');
            }
          }
        }
        if (PX_OPTIONS.jungleRays) RAYS.forEach(([x0, w], i) => {
          const pulse = 0.72 + 0.28 * Math.sin(T * 0.5 + i * 1.9), y0 = Math.round(top(x0)) - 4;
          for (let y = y0; y < HZ + 22; y++){
            const cx = x0 + (y - y0) * RAY_K, fade = Math.min(1, (y - y0) / 10) * (1 - (y - y0) / (HZ + 28 - y0) * 0.6);
            for (let x = Math.floor(cx - w); x <= cx + w; x++){
              if (y < top(x)) continue;
              const v = (1 - Math.abs(x - cx) / w) * fade * pulse * 0.82;
              if (v > 0 && v * 16 > bay(x, y) + 2) P.px(x, y, v > 0.42 ? '#f4e4a0' : v > 0.22 ? '#c8c078' : '#7a8a4e');
            }
          }
        });
        if (PX_OPTIONS.jungleRays) for (const m of MOTES){                       // prach třpytící se v paprscích
          const y = 20 + ((m.y + T * m.v) % 160), x = m.x + Math.sin(T * 0.4 + m.w) * 6 + (y - 20) * 0.3;
          if (rayAt(x, y) < 0.15 || y < top(x)) continue;
          P.px(x, y, (s + m.tw) % 16 === 0 ? '#ffffff' : '#f4e4a0');
        }
        if (PX_OPTIONS.jungleMist) drawMist(P, t, 130, HZ + 6, k => 0.04 + k * 0.34, 3, 1);
      } },
      { seed: 116, draw(P, r){   // kamenné plošinky chrámu porostlé mechem
        const st = { out: '#0a0c08', side: '#34382a', sideDark: '#22261c', seam: '#2e4a22', edge: '#4e5440', top: '#5c624a', center: '#666c52', hi: '#9a9c72' };
        P.mound(PL.enemy, 196, pxRng(117), {
          out: '#060805', body: '#1e2418', lit: '#44503a', shade: '#11150d', foot: '#1a2416',
          mud: ['#162014', '#1e2c1a'], tuft: ['#1e3418', '#3e5a28'], pebble: '#2c3422',
          strata: ['#11150d', '#36422a'], platShadow: '#0c100a', rock: JUNGLE_ROCK,
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        const mr = pxRng(118);
        for (const [E, side] of [[PL.enemy, 6], [PL.player, 9]]){
          for (let i = 0; i < 40; i++){
            const a = mr() * Math.PI * 2, d = Math.sqrt(mr());
            P.px(E.x + Math.cos(a) * E.rx * d * 0.9, E.y + Math.sin(a) * E.ry * d * 0.85, mr() < 0.5 ? '#3e5a2a' : '#4e6e34');
          }
          for (let x = E.x - E.rx + 4; x < E.x + E.rx - 4; x += 5 + Math.floor(mr() * 9)){
            const dy = E.ry * Math.sqrt(Math.max(0, 1 - ((x - E.x) / (E.rx + 0.5)) ** 2));
            const y0 = E.y + Math.round(dy), len = 2 + Math.floor(mr() * (side + 3));
            for (let k = 0; k < len; k++) P.px(x + (k % 3 === 2 ? 1 : 0), y0 + k, k % 2 ? '#1e3418' : '#3e5a28');
          }
          P.line(E.x - E.rx * 0.3, E.y - 2, E.x - E.rx * 0.1, E.y + 3, 1, '#34382a');
          P.line(E.x + E.rx * 0.25, E.y - 3, E.x + E.rx * 0.4, E.y + 1, 1, '#34382a');
        }
        // pavučina mezi plošinkou soupeře a skálou
        const wr = pxRng(119);
        for (let i = 0; i < 5; i++){ const x0 = PL.enemy.x + PL.enemy.rx - 4 - i * 3, y0 = PL.enemy.y + 6; P.line(x0, y0, x0 + 12 + i * 4, y0 + 18 + wr() * 6, 1, i % 2 ? '#3a463a' : '#4a564a'); }
      } },
      { dynamic: true, draw(P, r, t){   // liány, pavouci, svítící houby, světlušky, listy v popředí
        const s = step(t), T = ts(t);
        if (PX_OPTIONS.jungleVines) for (const v of VINES){
          const y0 = v.root ? Math.round(top(v.x)) - 2 : Math.round(HOLE.y + HOLE.ry * Math.sqrt(Math.max(0, 1 - ((v.x - HOLE.x) / HOLE.rx) ** 2))) - 1;
          for (let k = 0; k < v.len; k++){
            const u = k / v.len, x = v.x + Math.sin(T * 0.9 + v.ph) * 4 * u * u, y = y0 + k;
            if (v.root){ P.px(x, y, '#2e2418'); if (k % 3 === 0) P.px(x + 1, y, '#4a3a26'); continue; }
            P.px(x, y, '#0e180c'); P.px(x + 1, y, '#1e3418');
            if (k % 5 === 2){ const sd = (k / 5) % 2 ? 1 : -1; P.px(x + sd * 2, y, '#3a6424'); P.px(x + sd, y - 1, '#2e5220'); if (sd < 0) P.px(x - 3, y, '#6a9a3c'); }
          }
        }
        if (PX_OPTIONS.jungleSpiders) for (const sp of SPIDERS){
          const y0 = Math.round(top(sp.x)), len = Math.round(sp.len * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(T * 0.35 + sp.ph)))), x = sp.x;
          for (let y = y0; y < y0 + len; y++) if (y % 2) P.px(x, y, '#6a766a');
          const y = y0 + len, f = s % 2;
          P.rect(x - 1, y, 3, 3, '#0a0806'); P.rect(x - 1, y + 3, 3, 2, '#1a120c'); P.px(x, y + 1, '#c83a2a');
          for (const d of [-1, 1]){
            P.px(x + d * 2, y - f, '#0a0806'); P.px(x + d * 3, y - 1 + f, '#0a0806');
            P.px(x + d * 2, y + 2, '#0a0806'); P.px(x + d * 3, y + 3 - f, '#0a0806');
            P.px(x + d * 2, y + 4, '#0a0806'); P.px(x + d * 3, y + 5 + f, '#0a0806');
          }
        }
        if (PX_OPTIONS.jungleShrooms){
          SHROOM_SPOTS.forEach(([x, y, sz], ci) => {                           // měkká kulatá záře: v okolí řídká, u hub hustší
            const on = 0.5 + 0.5 * Math.sin(T * 0.8 + ci * 1.7), R = sz * 4 + 5 + on * 2, cy = y - sz * 1.5;
            for (let yy = -R; yy <= R; yy++) for (let xx = -R * 1.4; xx <= R * 1.4; xx++){
              const v = 1 - Math.hypot(xx / 1.4, yy * (yy > sz * 1.5 ? 2.5 : 1)) / R, X = Math.round(x + xx), Y = Math.round(cy + yy);
              if (v > 0 && v * v * 16 > bay(X, Y) + 1) P.px(X, Y, Y >= y - 1 ? (v > 0.55 ? '#1a4a3a' : '#122e24') : (v > 0.6 ? '#174a40' : '#0f2c26'));
            }
          });
          for (const m of SHROOMS) shroom(P, m, 0.5 + 0.5 * Math.sin(T * 0.8 + m.ci * 1.7 + m.ph * 0.2));
          SHROOM_SPOTS.forEach(([x, y, sz], ci) => {                           // mech u paty a stébla vpředu
            const r2 = pxRng(1751 + ci);
            for (let i = -sz * 3; i <= sz * 3; i++){ const xx = x + i; P.px(xx, y + 1, '#0e1a10'); if (r2() < 0.7) P.px(xx, y, r2() < 0.5 ? '#1e3418' : '#2a4420'); }
            for (let i = 0; i < sz * 3; i++){
              const xx = x + Math.round((r2() - 0.5) * sz * 6), hh = 1 + Math.floor(r2() * (sz + 1));
              for (let k = 0; k < hh; k++) P.px(xx + (k === hh - 1 && r2() < 0.5 ? 1 : 0), y + 1 - k, k === hh - 1 ? '#3e5a28' : '#24381c');
            }
          });
          SHROOM_SPOTS.forEach(([x, y, sz], ci) => {                           // výtrusy pomalu stoupají
            for (let k = 0; k < 2; k++){
              const ph = (T * 0.25 + ci * 0.37 + k * 0.5) % 1, yy = y - sz * 4 - ph * 30, xx = x + Math.sin(ph * 8 + ci + k * 2) * 4 + ph * 5;
              if (ph < 0.8 && (step(t) + k + ci) % 3) P.px(xx, yy, ph < 0.4 ? '#6ae8c0' : '#2a8a74');
            }
          });
        }
        if (PX_OPTIONS.jungleBugs) for (const f of FLIES){
          const on = (s + f.ph) % 30;
          if (on > 9) continue;
          const x = f.x + Math.sin(T * 0.3 + f.w) * 10, y = f.y + Math.sin(T * 0.5 + f.w * 2) * 5;
          P.px(x, y, on < 3 || on > 7 ? '#a8b850' : '#f0f890');
          if (on >= 3 && on <= 7){ P.px(x - 1, y, '#6a7a30'); P.px(x + 1, y, '#6a7a30'); P.px(x, y - 1, '#6a7a30'); P.px(x, y + 1, '#6a7a30'); }
        }
        const LC = { out: '#020402', mid: '#0c180a', lit: '#1a3014', spine: '#24401a' };
        const sw = PX_OPTIONS.jungleVines ? 1 : 0;
        for (const [bx, by, a, len, wid, ph] of [[488, 278, -2.3, 76, 13, 0], [490, 254, -2.85, 60, 10, 1.3], [-8, 282, -0.8, 46, 9, 0.7]])
          bigLeaf(P, bx, by, a + sw * Math.sin(T * 1.2 + ph) * 0.03, len, wid, LC);
      } },
    ],
  };
})();

/* =====================================================================
   ARÉNA 8: Netherová bouře – fialová dimenze s plovoucími kusy skal (inspirace Netherstorm).
   Světlo vychází z rotující trhliny vlevo nahoře, dominantou je éterická věž na ostrově.
   ===================================================================== */
const NETHER = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const RIFT = { x: 74, y: 48, r: 50 };
  const TW = { x: 246, top: 118 };                                   // ostrov s věží (vršek)
  const step = t => Math.floor(t / 0.1);
  const ts = t => step(t) * 0.1;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[(x & 3) + (y & 3) * 4];
  const ROCK = { out: '#08040e', top: '#6a5a8e', topLit: '#9a88c0', topDark: '#463a66', lit: '#5a4a7e', mid: '#3a2e56', dark: '#22183a', deep: '#140e24', crack: '#c060ff', crackDim: '#7a2ab0' };
  const CRY = { out: '#12062a', lit: '#f0b8ff', mid: '#c060f0', dark: '#6a1ea8', hi: '#ffffff' };
  const CRY_T = { out: '#06142a', lit: '#a8f0ff', mid: '#40c0e8', dark: '#1a5a9a', hi: '#ffffff' };

  /* plovoucí ostrov: plochý vršek (elipsa) a zubaté tělo zužující se dolů do špičky.
     Levá strana ke světlu trhliny, svítící pukliny, krystaly, visící úlomky. */
  function island(P, cx, ty, w, depth, r, o = {}){
    const ry = Math.max(2, Math.round(w * 0.22));
    const jag = Array.from({ length: depth + 1 }, () => 0);
    for (let y = 1; y <= depth; y++) jag[y] = jag[y - 1] * 0.55 + (r() - 0.5) * 3.2;
    const tip = (r() - 0.5) * w * 0.3;
    for (let y = 0; y <= depth; y++){
      const k = y / depth, hw = w * Math.pow(1 - k, 1.25) * (1 + Math.sin(k * 9 + w) * 0.06) + jag[y];
      if (hw < 0.5) continue;
      const c0 = cx + tip * k * k, l = Math.round(c0 - hw), rr = Math.round(c0 + hw + jag[Math.max(0, y - 3)] * 0.6), Y = ty + y;
      P.rect(l - 1, Y, rr - l + 3, 1, ROCK.out);
      P.rect(l, Y, rr - l + 1, 1, ROCK.mid);
      P.rect(l, Y, Math.max(1, Math.round((rr - l) * 0.28)), 1, ROCK.lit);
      P.rect(rr - Math.round((rr - l) * 0.35), Y, Math.round((rr - l) * 0.35) + 1, 1, ROCK.dark);
      if (k > 0.55) P.rect(rr - Math.round((rr - l) * 0.6), Y, Math.round((rr - l) * 0.6) + 1, 1, k > 0.8 ? ROCK.deep : ROCK.dark);
      P.px(l, Y, k < 0.6 ? ROCK.topLit : ROCK.lit);
      if (y % 6 === 3) for (let x = l + 2; x < rr - 2; x++) if ((x * 7 + y) % 5 < 2) P.px(x, Y, ROCK.deep);   // vrstvy horniny
    }
    for (let i = 0; i < Math.max(1, w / 14); i++){                            // svítící pukliny
      let x = cx - w * 0.5 + r() * w, y = ty + ry + 1;
      const len = depth * (0.3 + r() * 0.4);
      for (let k = 0; k < len; k++, y++){ x += (r() - 0.5) * 1.6; P.px(x, y, k % 4 ? ROCK.crack : ROCK.crackDim); }
    }
    if (!o.noTop){                                                           // vršek
      P.ellipse(cx, ty + 1, w + 1, ry + 1, ROCK.out);
      P.ellipse(cx, ty + 1, w, ry, ROCK.topDark);
      P.ellipse(cx - 1, ty, w - 1, ry - 1, ROCK.top);
      P.ellipse(cx - w * 0.35, ty - 1, w * 0.45, Math.max(1, ry * 0.45), ROCK.topLit);
      for (let i = 0; i < w * 0.5; i++){ const a = r() * Math.PI * 2, d = Math.sqrt(r()); P.px(cx + Math.cos(a) * w * 0.85 * d, ty + Math.sin(a) * ry * 0.8 * d, r() < 0.5 ? ROCK.topDark : '#7a2ab0'); }
    }
    if (o.crystals) for (const [dx, h, cw, lean, t] of o.crystals) P.crystal(cx + dx, ty + Math.round(ry * 0.4), cw, h, lean, t ? CRY_T : CRY);
    for (let i = 0; i < 2 + w / 12; i++){                                    // visící úlomky pod špičkou
      const x = cx + tip + (r() - 0.5) * w * 0.5, y = ty + depth * (0.75 + r() * 0.2) + 3 + r() * 6, sz = 1 + Math.floor(r() * 3);
      P.rect(x - 1, y - 1, sz + 2, sz + 2, ROCK.out); P.rect(x, y, sz, sz, ROCK.mid); P.px(x, y, ROCK.lit);
    }
  }
  // ostrovy v mezivzdálenosti se pohupují – kreslí se jednou do vlastního plátna
  const FLOATERS = [
    { x: 160, y: 92, w: 16, d: 22, seed: 1801, ph: 0, cr: [[-4, 10, 4, -0.2, 0], [3, 7, 3, 0.15, 0]] },
    { x: 338, y: 64, w: 22, d: 30, seed: 1802, ph: 1.7, cr: [[-8, 14, 5, -0.15, 1], [6, 9, 4, 0.2, 0]] },
    { x: 440, y: 104, w: 14, d: 20, seed: 1803, ph: 3.1, cr: [[2, 8, 3, 0.1, 0]] },
    { x: 34, y: 150, w: 18, d: 26, seed: 1804, ph: 4.4, cr: [[-5, 9, 4, -0.2, 0]] },
    { x: 392, y: 26, w: 10, d: 14, seed: 1805, ph: 2.4, cr: [] },
  ];
  const sprite = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(pxPainter(c.getContext('2d'))); return c; };
  let floatSprites = null, towerSprite = null;
  const TOWER_PAD = { w: 120, h: 190 };
  function buildSprites(){
    floatSprites = FLOATERS.map(f => sprite(f.w * 2 + 30, f.d + f.w + 40, P => island(P, f.w + 15, f.w + 10, f.w, f.d, pxRng(f.seed), { crystals: f.cr })));
    towerSprite = sprite(TOWER_PAD.w, TOWER_PAD.h, P => {
      const X = 60, T = 118;                                               // vršek ostrova v plátně = y 118
      island(P, X, T, 46, 56, pxRng(1811), { crystals: [[-34, 16, 6, -0.3, 0], [36, 12, 5, 0.3, 0], [-26, 9, 4, -0.1, 1]] });
      // věž: zužující se kovová špice s panely a okny, levá strana ke světlu
      const O = '#0a0614';
      for (let y = 30; y <= T + 2; y++){
        const k = (T + 2 - y) / (T + 2 - 30), hw = Math.max(1, Math.round(11 * (1 - k) ** 0.9 + 1.5 + (y > T - 10 ? (y - T + 10) * 0.5 : 0)));
        P.rect(X - hw - 1, y, hw * 2 + 3, 1, O);
        P.rect(X - hw, y, hw * 2 + 1, 1, '#3a2a5e');
        P.rect(X - hw, y, Math.max(1, Math.round(hw * 0.7)), 1, '#6a54a0');
        P.px(X - hw, y, '#a890e0');
        P.rect(X + Math.round(hw * 0.4), y, Math.max(1, hw - Math.round(hw * 0.4)) + 1, 1, '#22183e');
        if (y % 12 === 0) P.rect(X - hw, y, hw * 2 + 1, 1, O);              // spáry panelů
      }
      for (const y of [56, 76, 96]) { P.rect(X - 1, y, 3, 4, '#100620'); P.px(X, y + 1, '#e080ff'); }
      // křídla (opěry) po stranách paty věže
      for (const d of [-1, 1]){
        P.poly([[X + d * 6, T - 30], [X + d * 22, T - 6], [X + d * 18, T + 2], [X + d * 4, T - 8]], O);
        P.poly([[X + d * 6, T - 28], [X + d * 20, T - 6], [X + d * 17, T], [X + d * 5, T - 9]], d < 0 ? '#5a4890' : '#2a1e48');
        P.line(X + d * 6, T - 28, X + d * 20, T - 6, 1, d < 0 ? '#a890e0' : '#4a3a78');
      }
      P.ellipse(X, T + 2, 16, 3, O); P.ellipse(X, T + 1, 15, 2, '#4a3a78'); P.rect(X - 14, T, 10, 1, '#8a74c8');
    });
  }
  // blesk: každých pár vteřin, mezi trhlinou / oblohou a ostrovem
  function strike(t){
    const PER = 4.6, n = Math.floor(t / PER), r = pxRng(pxMix(n * 71 + 3));
    const on = r() < 0.75, ph = (t - n * PER - r() * 2.2) / 0.5;
    return { n, r, ph: on ? ph : -1 };
  }
  function light(t){
    if (!PX_OPTIONS.netherLightning) return 0;
    const { ph } = strike(t);
    if (ph < 0 || ph > 0.8) return 0;
    return ph < 0.1 ? 0.55 : ph < 0.18 ? 0.1 : ph < 0.3 ? 0.4 : Math.max(0, 0.3 * (1 - (ph - 0.3) / 0.5));
  }
  const dr = pxRng(1821);
  const DEBRIS = Array.from({ length: 34 }, () => ({ x: dr() * PX_W, y: dr() * PX_H, v: 2 + dr() * 6, s: dr() < 0.25 ? 2 : 1, w: dr() * 6 }));
  const MOTES = Array.from({ length: 50 }, () => ({ x: dr() * PX_W, y: dr() * PX_H, v: 3 + dr() * 7, w: dr() * 6, tw: Math.floor(dr() * 12), c: dr() < 0.3 }));
  const STARS = Array.from({ length: 90 }, () => [Math.floor(dr() * PX_W), Math.floor(dr() * PX_H), Math.floor(dr() * 12)]);
  const fp = t => Math.round(Math.sin(ts(t) * 0.55) * 2);                  // pohup věže

  return {
    name: 'Netherová bouře',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    light,
    layers: [
      { seed: 121, draw(P, r){   // fialová prázdnota, mlhoviny, rozpukaná planeta, vzdálené úlomky
        P.bands(0, PX_H, ['#14062a', '#1c0a36', '#260e44', '#2e1250', '#26104a', '#1c0a3a', '#12062a', '#0a0420']);
        for (let y = 0; y < PX_H; y++) for (let x = 0; x < PX_W; x++){       // mlhoviny (dithering)
          const n = Math.sin(x * 0.018 + y * 0.03) * 0.5 + Math.sin(x * 0.041 - y * 0.022 + 2) * 0.35 + Math.sin(x * 0.09 + y * 0.07) * 0.15;
          const m = Math.sin(x * 0.012 - y * 0.035 + 4) * 0.5 + Math.sin(x * 0.05 + y * 0.015) * 0.3;
          if (n > 0.35 && (n - 0.35) * 30 > bay(x, y)) P.px(x, y, n > 0.62 ? '#7a2a9a' : '#4a1a6e');
          else if (m > 0.45 && (m - 0.45) * 30 > bay(x, y)) P.px(x, y, m > 0.68 ? '#2a5a8a' : '#1e3260');
        }
        // rozpukaná planeta vpravo nahoře
        const PX0 = 420, PY0 = 44, PR = 30;
        for (let y = -PR; y <= PR; y++) for (let x = -PR; x <= PR; x++){
          const d = Math.hypot(x, y);
          if (d > PR) continue;
          const lit = (-x * 0.7 - y * 0.5) / PR + (bay(x + PX0, y + PY0) / 16 - 0.5) * 0.3;
          P.px(PX0 + x, PY0 + y, d > PR - 1 ? '#a890d0' : lit > 0.45 ? '#7a6aa0' : lit > 0.1 ? '#5a4a80' : lit > -0.3 ? '#3a2e5a' : '#22183a');
        }
        for (const [a, len] of [[2.3, 22], [3.4, 16], [0.6, 18]]){           // zářící zlom
          let x = PX0, y = PY0;
          for (let k = 0; k < len; k++){ x += Math.cos(a + Math.sin(k) * 0.5); y += Math.sin(a + Math.sin(k) * 0.5); P.px(x, y, '#e080ff'); P.px(x + 1, y, '#8a2ac0'); }
        }
        for (const [x, y, w] of [[468, 82, 6], [452, 92, 4], [474, 98, 3], [380, 78, 3]]) island(P, x, y, w, w + 3, r, { noTop: false });
        // vzdálené úlomky (tmavé, menší)
        for (let i = 0; i < 14; i++){
          const x = 100 + r() * 360, y = 120 + r() * 130, w = 2 + r() * 5;
          if (Math.abs(x - PL.enemy.x) < 90 && y < 200) continue;
          P.poly([[x - w, y], [x + w, y], [x + w * 0.2, y + w * 1.6]], '#1a1030'); P.rect(x - w, y, w * 2, 1, '#4a3a70');
        }
      } },
      { dynamic: true, draw(P, r, t){   // hvězdy, rotující trhlina
        const s = step(t), T = ts(t);
        for (const [x, y, ph] of STARS){ const tw = (s + ph) % 12; if (tw > 1) P.px(x, y, tw > 9 ? '#ffffff' : '#a890d0'); }
        const spin = PX_OPTIONS.netherRift ? T * 0.9 : 0;
        for (let y = RIFT.y - RIFT.r; y < RIFT.y + RIFT.r; y++) for (let x = RIFT.x - RIFT.r * 1.3; x < RIFT.x + RIFT.r * 1.3; x++){
          const dx = (x - RIFT.x) / 1.3, dy = (y - RIFT.y) * 1.1, d = Math.hypot(dx, dy) / RIFT.r;
          if (d >= 1) continue;
          const a = Math.atan2(dy, dx), arm = Math.sin(a * 3 + d * 9 - spin * 2.2) * 0.5 + 0.5;
          const v = Math.pow(1 - d, 1.3) * (0.35 + 0.65 * arm) + (d < 0.12 ? 0.6 : 0);
          const q = v * 16 - bay(x, y) * 0.5;
          if (q < 1.5) continue;
          P.px(x, y, v > 0.82 ? '#ffffff' : v > 0.6 ? '#f8c8ff' : v > 0.42 ? '#e070ff' : v > 0.25 ? '#a030e0' : v > 0.14 ? '#6a1aa8' : '#3a0e6a');
        }
      } },
      { dynamic: true, draw(P, r, t){   // pohupující se ostrovy a věž s paprskem
        if (!floatSprites) buildSprites();
        const T = ts(t), bob = PX_OPTIONS.netherIslands;
        FLOATERS.forEach((f, i) => {
          const dy = bob ? Math.round(Math.sin(T * 0.6 + f.ph) * 2.5) : 0;
          P.ctx.drawImage(floatSprites[i], f.x - f.w - 15, f.y - f.w - 10 + dy);
        });
        const dy = bob ? fp(t) : 0, X = TW.x, top = TW.top + dy;
        if (PX_OPTIONS.netherBeam){                                          // paprsek z vrcholu věže do nebe
          const s = step(t), pulse = 0.7 + 0.3 * Math.sin(T * 2.1);
          for (let y = 0; y < top - 86; y++){
            const w = 2 + Math.sin(y * 0.2 - T * 6) * 0.8 + (top - 86 - y) * 0.015;
            for (let x = Math.floor(X - w - 2); x <= X + w + 2; x++){
              const v = (1 - Math.abs(x - X) / (w + 2)) * pulse;
              if (v > 0 && v * 16 > bay(x, y + s) + 2) P.px(x, y, v > 0.65 ? '#ffffff' : v > 0.4 ? '#f0a0ff' : '#9a30e0');
            }
          }
        }
        P.ctx.drawImage(towerSprite, X - 60, top - 118);
        // prstenec obíhající kolem věže a energetické jádro
        const T2 = T * 1.6, ry = 4, rx = 20, cy = top - 46;
        for (let a = 0; a < Math.PI * 2; a += 0.05){
          const front = Math.sin(a) > 0, x = X + Math.cos(a + T2) * rx, y = cy + Math.sin(a) * ry;
          if (!front && Math.abs(x - X) < 5) continue;
          P.px(x, y, front ? '#f0b8ff' : '#6a2aa8');
        }
        const on = (step(t) % 6) < 3;
        P.rect(X - 2, top - 90, 5, 5, '#10061e'); P.rect(X - 1, top - 89, 3, 3, on ? '#ffffff' : '#f0a0ff'); P.px(X - 3, top - 88, '#c060f0'); P.px(X + 3, top - 88, '#c060f0');
      } },
      { dynamic: true, draw(P, r, t){   // netherové blesky
        if (!PX_OPTIONS.netherLightning) return;
        const { r: rr, ph } = strike(t);
        if (ph < 0 || ph > 0.6 || (ph > 0.12 && ph < 0.2)) return;
        const toTower = rr() < 0.4;
        let x = RIFT.x + (rr() - 0.3) * 30, y = RIFT.y + (rr() - 0.5) * 20;
        const tx = toTower ? TW.x : 140 + rr() * 320, ty = toTower ? TW.top - 92 : 40 + rr() * 100;
        const pts = [];
        for (let i = 0; i < 40; i++){ x += (tx - x) * 0.12 + (rr() - 0.5) * 10; y += (ty - y) * 0.12 + (rr() - 0.5) * 8; pts.push([x, y]); }
        const core = ph < 0.3 ? '#ffffff' : '#e0a0ff';
        for (let i = 1; i < pts.length; i++){
          P.line(pts[i - 1][0], pts[i - 1][1] + 1, pts[i][0], pts[i][1] + 1, 1, '#7a2ab0');
          P.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 1, core);
          if (i % 9 === 4){ let bx = pts[i][0], by = pts[i][1]; for (let k = 0; k < 8; k++){ const nx = bx + (rr() - 0.3) * 6, ny = by + 2 + rr() * 4; P.line(bx, by, nx, ny, 1, '#c060f0'); bx = nx; by = ny; } }
        }
      } },
      { seed: 124, draw(P, r){   // ostrovy pod plošinkami a plošinky
        island(P, PL.enemy.x + 4, PL.enemy.y + 2, PL.enemy.rx + 12, 58, pxRng(125), { noTop: true, crystals: [[-PL.enemy.rx - 6, 18, 6, -0.25, 0], [PL.enemy.rx + 4, 13, 5, 0.25, 1]] });
        island(P, PL.player.x + 6, PL.player.y + 4, PL.player.rx + 14, 74, pxRng(126), { noTop: true, crystals: [[PL.player.rx + 6, 22, 7, 0.25, 0], [PL.player.rx - 4, 12, 5, 0.1, 0]] });
        const st = { out: '#08040e', side: '#3a2e56', sideDark: '#22183a', seam: '#a030e0', edge: '#5a4a7e', top: '#6a5a8e', center: '#76669a', hi: '#b8a8e0' };
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        for (const E of [PL.enemy, PL.player]){                              // svítící runové linky na plošinkách
          P.line(E.x - E.rx * 0.35, E.y - 2, E.x - E.rx * 0.15, E.y + 3, 1, '#8a3ac8');
          P.line(E.x + E.rx * 0.2, E.y - 4, E.x + E.rx * 0.35, E.y + 1, 1, '#8a3ac8');
        }
      } },
      { dynamic: true, draw(P, r, t){   // úlomky létající vzhůru, energetické jiskry, záře krystalů
        const s = step(t), T = ts(t);
        if (PX_OPTIONS.netherDebris){
          for (const d of DEBRIS){
            const y = PX_H - ((PX_H - d.y + T * d.v) % (PX_H + 10)), x = (d.x + T * d.v * 0.5 + Math.sin(T * 0.4 + d.w) * 4) % PX_W;
            P.rect(x - 1, y - 1, d.s + 2, d.s + 2, '#08040e'); P.rect(x, y, d.s, d.s, '#5a4a7e'); P.px(x, y, '#9a88c0');
          }
          for (const m of MOTES){
            const y = PX_H - ((PX_H - m.y + T * m.v) % PX_H), x = m.x + Math.sin(T * 0.6 + m.w) * 6, tw = (s + m.tw) % 12;
            if (tw > 8) continue;
            P.px(x, y, m.c ? '#a8f0ff' : tw < 2 ? '#ffffff' : '#e070ff');
          }
        }
        for (const [x, y, ph] of [[PL.enemy.x - PL.enemy.rx + 2, PL.enemy.y - 14, 0], [PL.player.x + PL.player.rx + 12, PL.player.y - 18, 1.7]]){
          const on = 0.5 + 0.5 * Math.sin(T * 1.6 + ph);
          for (let a = 0; a < 10; a++) if ((a + s) % 2) P.px(x + Math.cos(a * 0.63) * (3 + on * 3), y + Math.sin(a * 0.63) * (3 + on * 3), on > 0.5 ? '#f0b8ff' : '#a030e0');
          P.px(x, y, '#ffffff');
        }
      } },
    ],
  };
})();

/* =====================================================================
   ARÉNA 9: Nebeská říše (Aether) – západ slunce nad mořem mraků, plovoucí ostrov
   s mramorovým chrámem a zlatou svatozáří. Slunce nízko vlevo = zdroj světla.
   ===================================================================== */
const AETHER = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const SUN = { x: 58, y: 120 };
  const TI = { x: 244, top: 124, w: 52, d: 46 };                     // ostrov s chrámem
  const step = t => Math.floor(t / 0.1);
  const ts = t => step(t) * 0.1;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[(x & 3) + (y & 3) * 4];
  const MAR = { out: '#2a2040', lit: '#fff6e6', mid: '#e2d4d0', shade: '#aa98b8', dark: '#6a5a88', deep: '#4a3e6a' };
  const GOLD = { hi: '#fff2a0', lit: '#ffd860', mid: '#d8a030', dark: '#8a5a20' };
  const CL = {                                                        // mraky podle vzdálenosti
    far:  { lit: '#ffd8a8', mid: '#e0a098', shade: '#9a7aa8', deep: '#6a5a92', rim: '#fff0c8' },
    mid:  { lit: '#ffe8c8', mid: '#f0c0a8', shade: '#b490b8', deep: '#7a68a0', rim: '#fff8e0' },
    near: { lit: '#fff4e0', mid: '#f4d4c4', shade: '#c4a4c8', deep: '#8a78b0', rim: '#ffffff' },
  };

  // obláček: stín vpravo dole, tělo, nasvícená čepička vlevo nahoře a zlatý okraj
  function puff(P, x, y, rad, c){
    P.ellipse(x + rad * 0.22, y + rad * 0.28, rad, rad * 0.62, c.shade);
    P.ellipse(x, y, rad * 0.92, rad * 0.6, c.mid);
    P.ellipse(x - rad * 0.28, y - rad * 0.2, rad * 0.58, rad * 0.36, c.lit);
    for (let a = Math.PI * 1.02; a < Math.PI * 1.55; a += 0.5 / rad) P.px(x + Math.cos(a) * rad * 0.92, y + Math.sin(a) * rad * 0.6, c.rim);
  }
  // nekonečný pás mraků (bezešvý v šířce PX_W) – plyne doprava
  function cloudStrip(H, base, seed, c, minR, maxR){
    const cv = document.createElement('canvas'); cv.width = PX_W; cv.height = H;
    const P = pxPainter(cv.getContext('2d')), r = pxRng(seed);
    P.rect(0, base + 4, PX_W, H - base - 4, c.shade);
    for (let y = base + 4; y < H; y++) for (let x = 0; x < PX_W; x++) if ((y - base) * 1.2 > 16 + bay(x, y) * 1.5) P.px(x, y, c.deep);
    const puffs = [];
    for (let x = 0; x < PX_W; x += 5 + Math.floor(r() * 8)){
      const rad = minR + r() * (maxR - minR), y = base + Math.sin(x / PX_W * Math.PI * 6) * 3 + (r() - 0.5) * 5;
      puffs.push([x, y, rad]);
      if (r() < 0.45) puffs.push([x + r() * 6, base + 6 + r() * (H - base - 10), rad * (0.4 + r() * 0.3)]);
    }
    puffs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rad] of puffs) for (const o of [-PX_W, 0, PX_W]) puff(P, x + o, y, rad, c);
    return cv;
  }
  let strips = null;
  const STRIPS = [
    { y: 146, H: 60, base: 14, seed: 1901, c: CL.far, r: [6, 12], sp: 2 },
    { y: 172, H: 70, base: 16, seed: 1902, c: CL.mid, r: [9, 17], sp: 4.5 },
    { y: 236, H: 40, base: 12, seed: 1903, c: CL.near, r: [12, 22], sp: 8 },
  ];
  function drawStrip(P, i, t){
    if (!strips) strips = STRIPS.map(S => cloudStrip(S.H, S.base, S.seed, S.c, S.r[0], S.r[1]));
    const S = STRIPS[i], off = PX_OPTIONS.aetherClouds ? Math.floor(ts(t) * S.sp) % PX_W : 0;
    P.ctx.drawImage(strips[i], off - PX_W, S.y); P.ctx.drawImage(strips[i], off, S.y);
  }

  // mramorový ostrov: vršek s trávou, tělo do špičky, zlaté žilky
  function marbleIsland(P, cx, ty, w, depth, r, o = {}){
    const ry = Math.max(2, Math.round(w * 0.22)), jag = [0];
    for (let y = 1; y <= depth; y++) jag[y] = jag[y - 1] * 0.55 + (r() - 0.5) * 3;
    const tip = (r() - 0.5) * w * 0.3;
    for (let y = 0; y <= depth; y++){
      const k = y / depth, hw = w * Math.pow(1 - k, 1.2) * (1 + Math.sin(k * 8 + w) * 0.05) + jag[y];
      if (hw < 0.5) continue;
      const c0 = cx + tip * k * k, l = Math.round(c0 - hw), rr = Math.round(c0 + hw), Y = ty + y;
      P.rect(l - 1, Y, rr - l + 3, 1, MAR.out);
      P.rect(l, Y, rr - l + 1, 1, MAR.shade);
      P.rect(l, Y, Math.max(1, Math.round((rr - l) * 0.35)), 1, k < 0.15 ? MAR.lit : MAR.mid);
      P.rect(rr - Math.round((rr - l) * 0.3), Y, Math.round((rr - l) * 0.3) + 1, 1, k > 0.6 ? MAR.deep : MAR.dark);
      if (y % 7 === 4) for (let x = l + 2; x < rr - 2; x++) if ((x * 5 + y) % 6 < 2) P.px(x, Y, MAR.dark);
    }
    for (let i = 0; i < Math.max(1, w / 16); i++){                            // zlaté žilky
      let x = cx - w * 0.5 + r() * w, y = ty + ry + 1;
      for (let k = 0; k < depth * (0.25 + r() * 0.35); k++, y++){ x += (r() - 0.5) * 1.6; P.px(x, y, k % 3 ? GOLD.mid : GOLD.lit); }
    }
    if (!o.noTop){
      P.ellipse(cx, ty + 1, w + 1, ry + 1, '#1e3a2a');
      P.ellipse(cx, ty + 1, w, ry, '#4a8a4a');
      P.ellipse(cx - 1, ty, w - 1, ry - 1, '#7ac060');
      P.ellipse(cx - w * 0.35, ty - 1, w * 0.45, Math.max(1, ry * 0.45), '#b8e070');
      for (let x = cx - w + 2; x < cx + w - 1; x += 2 + Math.floor(r() * 3)) P.rect(x, ty + ry - 1 + Math.round(r() * 2), 1, 2 + Math.floor(r() * 4), '#4a8a4a');   // tráva přes okraj
      for (let i = 0; i < w * 0.3; i++){ const a = r() * Math.PI * 2, d = Math.sqrt(r()); P.px(cx + Math.cos(a) * w * 0.8 * d, ty + Math.sin(a) * ry * 0.7 * d, ['#ffffff', '#ffe080', '#ffa0c0'][Math.floor(r() * 3)]); }
    }
  }
  const sprite = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(pxPainter(c.getContext('2d'))); return c; };
  const FLOATERS = [
    { x: 150, y: 78, w: 14, d: 18, seed: 1911, ph: 0 },
    { x: 330, y: 58, w: 20, d: 24, seed: 1912, ph: 1.9 },
    { x: 446, y: 100, w: 12, d: 15, seed: 1913, ph: 3.3 },
  ];
  let floatSprites = null;

  // holubice: hejno přeletí jednou za čas, z obou stran
  function doves(t){
    const PER = 12, n = Math.floor(t / PER), out = [];
    for (const m of [n - 1, n]){
      const r = pxRng(pxMix(m * 53 + 9));
      if (r() < 0.25) continue;
      const dir = r() < 0.6 ? 1 : -1, y = 40 + r() * 60, spd = 22 + r() * 8, cnt = 1 + Math.floor(r() * 5), ph = t - m * PER - r() * 3;
      if (ph < 0) continue;
      const x0 = dir > 0 ? -16 + ph * spd : PX_W + 16 - ph * spd;
      for (let i = 0; i < cnt; i++){
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        out.push({ x: x0 - dir * row * 11, y: y + (i ? side * row * 6 : 0) + Math.sin(ph * 2 + i) * 2, dir, fo: i % 4 });
      }
    }
    return out;
  }
  function drawDove(P, b, fr){
    const q = (dx, dy, w, h, c) => P.rect(b.dir > 0 ? b.x + dx : b.x - dx - w + 1, b.y + dy, w, h, c);
    q(-6, 0, 3, 1, '#c8c0d8'); q(-3, -1, 6, 3, '#3a3050'); q(-3, 0, 6, 2, '#ffffff'); q(-3, 1, 5, 1, '#d8d0e8');
    q(3, -2, 3, 3, '#3a3050'); q(3, -1, 2, 2, '#ffffff'); q(5, 0, 1, 1, '#f0a040');
    if (fr === 0){ q(-2, -5, 4, 4, '#ffffff'); q(-1, -6, 2, 1, '#ffffff'); q(1, -5, 1, 4, '#d8d0e8'); }
    else if (fr === 2){ q(-2, 2, 4, 3, '#e8e0f0'); q(-1, 5, 2, 1, '#c8c0d8'); }
    else { q(-4, -1, 8, 1, '#ffffff'); }
  }
  const fr2 = pxRng(1921);
  const FEATHERS = Array.from({ length: 10 }, () => ({ x: fr2() * PX_W, y: fr2() * PX_H, v: 4 + fr2() * 5, w: fr2() * 6 }));
  const GLITTER = Array.from({ length: 60 }, () => ({ x: fr2() * PX_W, y: fr2() * 240, v: 1 + fr2() * 3, w: fr2() * 6, tw: Math.floor(fr2() * 14) }));
  const STARS = Array.from({ length: 40 }, () => [Math.floor(fr2() * PX_W), Math.floor(fr2() * 50), Math.floor(fr2() * 14)]);

  return {
    name: 'Nebeská říše',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    layers: [
      { seed: 131, draw(P, r){   // nebe při západu, slunce, obří kupovité mraky v dálce
        P.bands(0, 190, ['#141842', '#20225a', '#30286c', '#46307a', '#643c86', '#8a4c88', '#b06480', '#d48474', '#eca86c', '#f8c878']);
        for (let y = 40; y < 200; y++) for (let x = 0; x < 260; x++){
          const d = Math.hypot(x - SUN.x, (y - SUN.y) * 1.3);
          if (d < 13) P.px(x, y, '#fffbe8');
          else if (d < 17) P.px(x, y, '#fff0b8');
          else if (d < 120 && (1 - d / 120) ** 1.4 * 20 > bay(x, y) + 1) P.px(x, y, d < 34 ? '#ffe4a0' : d < 64 ? '#f8c880' : '#e8a070');
        }
        // věže kupovitých mraků: hromady obláčků, výš menší
        for (const [cx, base, hgt, wid] of [[150, 150, 96, 58], [404, 148, 120, 70], [282, 150, 54, 40], [24, 150, 50, 36]]){
          const pts = [];
          for (let i = 0; i < 46; i++){
            const k = r(), y = base - k * hgt, w = wid * (1 - k * 0.6);
            pts.push([cx + (r() - 0.5) * 2 * w, y, 8 + (1 - k) * 12 * r() + 4]);
          }
          pts.sort((a, b) => b[1] - a[1]);
          for (const [x, y, rad] of pts) puff(P, x, y, rad, CL.far);
        }
      } },
      { dynamic: true, draw(P, r, t){   // hvězdy nahoře, sluneční paprsky do strany, pohupující se ostrůvky
        const s = step(t), T = ts(t);
        for (const [x, y, ph] of STARS){ const tw = (s + ph) % 14; if (tw > 2) P.px(x, y, tw > 11 ? '#ffffff' : '#8a88c8'); }
        if (PX_OPTIONS.aetherRays) for (let i = 0; i < 5; i++){
          const a = -0.3 + i * 0.17, w = 0.05 + (i % 2) * 0.03, pulse = 0.7 + 0.3 * Math.sin(T * 0.5 + i * 2.1);
          const ca = Math.cos(a), sa = Math.sin(a);
          for (let d = 22; d < 300; d++){
            const half = d * w, fade = (1 - d / 300) ** 1.3 * pulse * 0.8;
            for (let j = -half; j <= half; j++){
              const x = Math.round(SUN.x + ca * d - sa * j), y = Math.round(SUN.y + sa * d + ca * j);
              const v = (1 - Math.abs(j) / (half + 0.5)) * fade;
              if (y >= 0 && v > 0 && v * 16 > bay(x, y) + 3) P.px(x, y, v > 0.4 ? '#fff0c0' : '#ffd890');
            }
          }
        }
        if (!floatSprites) floatSprites = FLOATERS.map(f => sprite(f.w * 2 + 10, f.d + f.w + 10, P2 => marbleIsland(P2, f.w + 5, f.w * 0.3 + 4, f.w, f.d, pxRng(f.seed))));
        FLOATERS.forEach((f, i) => P.ctx.drawImage(floatSprites[i], f.x - f.w - 5, f.y - f.w * 0.3 - 4 + Math.round(Math.sin(T * 0.6 + f.ph) * 2)));
      } },
      { dynamic: true, draw(P, r, t){ drawStrip(P, 0, t); } },   // vzdálené moře mraků
      { seed: 133, draw(P, r){   // ostrov s mramorovým chrámem
        const X = TI.x, B = TI.top;
        marbleIsland(P, X, B, TI.w, TI.d, pxRng(1931));
        const O = MAR.out;
        for (const [w, y] of [[40, B - 2], [36, B - 5], [32, B - 8]]){               // stupně
          P.rect(X - w - 1, y - 1, w * 2 + 2, 4, O); P.rect(X - w, y, w * 2, 3, MAR.mid);
          P.rect(X - w, y, w * 2, 1, MAR.lit); P.rect(X + w - 10, y, 10, 3, MAR.shade);
        }
        for (let i = 0; i < 6; i++){                                                // sloupy s kanelurami
          const cx = X - 25 + i * 10, top = B - 36;
          P.rect(cx - 3, top, 7, B - 8 - top, O);
          P.rect(cx - 2, top, 5, B - 8 - top, MAR.mid); P.rect(cx - 2, top, 2, B - 8 - top, MAR.lit); P.rect(cx + 2, top, 1, B - 8 - top, MAR.shade);
          P.rect(cx - 3, top, 7, 2, MAR.lit); P.rect(cx - 3, B - 10, 7, 2, MAR.mid);
        }
        P.rect(X - 30, B - 36, 60, 30, 'rgba(0,0,0,0)');
        for (let y = B - 34; y < B - 10; y++) for (let x = X - 22; x < X + 24; x++) if ((x - X + 25) % 10 > 4) P.px(x, y, (x + y) % 2 ? '#3a2a5a' : '#4a3a6a');   // stín uvnitř
        P.rect(X - 31, B - 43, 62, 8, O); P.rect(X - 30, B - 42, 60, 6, MAR.mid);       // kladí
        P.rect(X - 30, B - 42, 60, 1, MAR.lit); P.rect(X - 30, B - 39, 60, 1, GOLD.mid); P.rect(X + 18, B - 42, 12, 6, MAR.shade);
        for (let x = X - 28; x < X + 28; x += 4) P.px(x, B - 38, GOLD.lit);
        // kupole se zlatou špicí
        for (let dy = 0; dy <= 18; dy++){
          const hw = Math.round(22 * Math.sqrt(1 - (dy / 18.5) ** 2)), y = B - 43 - dy;
          P.rect(X - hw - 1, y, hw * 2 + 3, 1, O);
          P.rect(X - hw, y, hw * 2 + 1, 1, GOLD.mid);
          P.rect(X - hw, y, Math.max(1, Math.round(hw * 0.7)), 1, GOLD.lit);
          P.rect(X + Math.round(hw * 0.45), y, Math.max(1, hw - Math.round(hw * 0.45)) + 1, 1, GOLD.dark);
          if (dy % 5 === 2) P.px(X - Math.round(hw * 0.5), y, GOLD.hi);
        }
        for (const dx of [-12, -4, 4, 12]) P.line(X + dx * 0.4, B - 61, X + dx * 1.7, B - 44, 1, GOLD.dark);   // žebra kupole
        P.rect(X - 1, B - 72, 3, 11, O); P.rect(X, B - 72, 1, 11, GOLD.lit); P.ellipse(X, B - 74, 2, 2, GOLD.hi);
        for (const d of [-1, 1]){ P.rect(X + d * 34 - 2, B - 50, 5, 8, O); P.rect(X + d * 34 - 1, B - 49, 3, 7, d < 0 ? MAR.lit : MAR.shade); P.rect(X + d * 34 - 2, B - 52, 5, 2, GOLD.mid); }   // akroteria
      } },
      { dynamic: true, draw(P, r, t){   // vodopád z ostrova, svatozář nad chrámem
        const s = step(t), T = ts(t);
        if (PX_OPTIONS.aetherWaterfall){
          const x0 = TI.x - 44, y0 = TI.top + 6, y1 = 186;
          for (let y = y0; y < y1; y++){
            const k = (y - y0) / (y1 - y0), w = 3 + k * 4, cx = x0 - k * k * 6;
            for (let x = Math.floor(cx - w); x <= cx + w; x++){
              const band = Math.floor((y - s * 7) / 4), h = (((x * 73856093) ^ (band * 19349663)) >>> 0) % 7, e = Math.abs(x - cx) > w - 1;
              if (k > 0.6 && (x + y + s) % 3 === 0) continue;                 // rozprašuje se
              P.px(x, y, e ? '#a8c8e8' : h < 2 ? '#ffffff' : h < 5 ? '#d8ecff' : '#a8d0f0');
            }
          }
        }
        if (PX_OPTIONS.aetherHalo){
          const cy = TI.top - 84, rx = 16, ry = 4;
          for (let a = 0; a < Math.PI * 2; a += 0.04){
            const x = TI.x + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, sp = (Math.floor((a + T * 1.4) / (Math.PI / 5)) % 2) === 0;
            P.px(x, y, Math.sin(a) > 0 ? (sp ? '#fff8c0' : GOLD.lit) : GOLD.mid);
            P.px(x, y + 1, GOLD.dark);
          }
          for (let k = 0; k < 4; k++){ const a = T * 1.4 + k * Math.PI / 2; if (Math.sin(a) > 0 && (s + k) % 4) P.px(TI.x + Math.cos(a) * rx, cy + Math.sin(a) * ry - 1, '#ffffff'); }
        }
      } },
      { dynamic: true, draw(P, r, t){ drawStrip(P, 1, t); } },   // střední vrstva mraků
      { seed: 136, draw(P, r){   // mramorové ostrovy pod plošinkami s obláčky kolem
        marbleIsland(P, PL.enemy.x + 4, PL.enemy.y + 2, PL.enemy.rx + 10, 44, pxRng(1937), { noTop: true });
        marbleIsland(P, PL.player.x + 6, PL.player.y + 4, PL.player.rx + 12, 60, pxRng(1938), { noTop: true });
        const cr = pxRng(1939);
        for (let i = 0; i < 9; i++){                                               // obláčky u paty soupeřova ostrova
          const x = PL.enemy.x - PL.enemy.rx + cr() * PL.enemy.rx * 2.2, y = PL.enemy.y + 22 + cr() * 18;
          puff(P, x, y, 7 + cr() * 8, CL.mid);
        }
        const st = { out: '#2a2040', side: '#c4b4c8', sideDark: '#8a78a0', seam: '#d8a030', edge: '#e8dcd8', top: '#f4ece6', center: '#fff8f0', hi: '#ffffff' };
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        for (const E of [PL.enemy, PL.player]){                                    // zlatý ornament na plošinách
          for (let a = 0; a < Math.PI * 2; a += 0.05) P.px(E.x + Math.cos(a) * E.rx * 0.6, E.y + Math.sin(a) * E.ry * 0.55, (Math.floor(a * 10) % 4) ? '#e8c060' : '#fff2a0');
        }
      } },
      { dynamic: true, draw(P, r, t){   // nejbližší mraky, holubice, peříčka, zlatý třpyt
        drawStrip(P, 2, t);
        const s = step(t), T = ts(t);
        if (PX_OPTIONS.aetherBirds) for (const d of doves(T)) drawDove(P, { ...d, x: Math.round(d.x), y: Math.round(d.y) }, (s + d.fo) % 4);
        if (PX_OPTIONS.aetherFeathers){
          for (const f of FEATHERS){
            const y = (f.y + T * f.v) % (PX_H + 10) - 5, x = (f.x + T * 6 + Math.sin(T * 0.9 + f.w) * 8) % PX_W, tilt = Math.sin(T * 0.9 + f.w) > 0;
            P.px(x, y, '#ffffff'); P.px(x + (tilt ? 1 : -1), y + 1, '#ffffff'); P.px(x + (tilt ? 2 : -2), y + 2, '#d8d0e8'); P.px(x - (tilt ? 1 : -1), y - 1, '#e8e0f0');
          }
          for (const g of GLITTER){
            const y = (g.y + T * g.v) % 240, x = g.x + Math.sin(T * 0.5 + g.w) * 6, tw = (s + g.tw) % 14;
            if (tw > 5) continue;
            P.px(x, y, tw === 0 ? '#ffffff' : '#ffe080');
            if (tw === 0){ P.px(x - 1, y, '#ffd860'); P.px(x + 1, y, '#ffd860'); P.px(x, y - 1, '#ffd860'); P.px(x, y + 1, '#ffd860'); }
          }
        }
      } },
    ],
  };
})();

/* =====================================================================
   ARÉNA 10: Zpustošená země – Outland zničený fel energií (inspirace Hellfire Peninsula).
   Rudé slunce vlevo = hlavní světlo, uprostřed Temný portál se zeleným vírem.
   ===================================================================== */
const FEL_ROCK = { out: '#120606', dark: '#3a1610', mid: '#5a2418', light: '#8a3a22', hi: '#c06a3a', shadow: '#1a0806' };
const FEL = (() => {
  const PL = { player: { x: 128, y: 218, rx: 110, ry: 25 }, enemy: { x: 358, y: 154, rx: 72, ry: 14 } };
  const HZ = 172;
  const SUN = { x: 64, y: 124 };
  const PO = { x: 238, l: 208, r: 268, top: 66, bot: 152 };          // vnitřek portálu
  const PLINTH = 152;                                                // horní hrana podstavce
  // otvor portálu s lomeným vrcholem
  const inOpen = (x, y) => {
    if (x < PO.l || x >= PO.r || y >= PO.bot) return false;
    if (y >= PO.top + 14) return y >= PO.top;
    const k = (PO.top + 14 - y) / 22, hw = (PO.r - PO.l) / 2 * (1 - k * k);
    return Math.abs(x + 0.5 - PO.x) < hw;
  };
  const step = t => Math.floor(t / 0.1);
  const ts = t => step(t) * 0.1;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[(x & 3) + (y & 3) * 4];
  const ST = { out: '#0c0406', dark: '#1e1014', mid: '#2e1a1e', lit: '#5a3a34', rim: '#9a6248', shade: '#160a0c' };
  const FELC = ['#0a2a08', '#1a6a10', '#3ac020', '#8aff40', '#e0ffa0'];

  // pukliny v zemi (cesty bodů), spočítané jednou
  const cr = pxRng(2001);
  const CRACKS = Array.from({ length: 11 }, () => {
    let x = cr() * PX_W, y = HZ + 6 + cr() * 90, a = (cr() - 0.5) * 0.6;
    const pts = [], len = 30 + cr() * 70;
    for (let k = 0; k < len; k++){ a += (cr() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a) * 0.35; if (y < HZ + 4) y = HZ + 4; pts.push([Math.round(x), Math.round(y)]); }
    return pts;
  });
  // fel ohně: [x, y, velikost]; první dva jsou koše u portálu
  const FIRES = [[164, 146, 0.8], [312, 146, 0.8], [66, 182, 1], [404, 178, 1], [454, 222, 1.3], [16, 236, 1.3], [300, 256, 1.1]];

  function spike(P, x, y, h, w, dir){                                // zahnutý démonický trn
    for (let k = 0; k < h; k++){
      const u = k / h, cx = x + dir * u * u * h * 0.45, hw = Math.max(0.5, w * (1 - u));
      P.rect(cx - hw - 1, y - k, hw * 2 + 2, 1, ST.out);
      P.rect(cx - hw, y - k, hw * 2, 1, ST.mid);
      P.rect(cx - hw, y - k, Math.max(1, hw * 0.6), 1, ST.lit);
      if (hw > 2) P.px(cx - hw, y - k, ST.rim);
    }
  }
  function flame(P, x, y, sc, s, salt){
    sc *= 1.7; const w = Math.round(3 * sc + 1);
    for (let i = -w; i <= w; i++){
      const hsh = (((i + 17) * 73856093) ^ ((s + salt) * 19349663)) >>> 0;
      const h = Math.round((7 + (hsh % 5)) * sc * (1 - Math.abs(i) / (w + 1)) ** 0.7);
      for (let k = 0; k < h; k++){
        const u = k / h;
        P.px(x + i + (u > 0.6 ? ((hsh >> 3) % 3) - 1 : 0), y - k, u < 0.25 ? FELC[4] : u < 0.5 ? FELC[3] : u < 0.8 ? FELC[2] : FELC[1]);
      }
    }
  }
  // meteor: každých pár vteřin, šikmo doprava dolů, dopad v dálce
  function meteor(t){
    const PER = 6.5, n = Math.floor(t / PER), r = pxRng(pxMix(n * 61 + 13));
    if (r() < 0.3) return null;
    const x1 = 40 + r() * 400, y1 = 150 + r() * 16, x0 = x1 - 70 - r() * 60, y0 = -10, ph = t - n * PER - r() * 3;
    if (Math.abs(x1 - PO.x) < 40) return null;
    return ph >= 0 && ph < 2.2 ? { x0, y0, x1, y1, ph, r } : null;
  }
  const FALL = 0.9;
  function light(t){
    const m = PX_OPTIONS.felMeteors && meteor(t);
    if (!m || m.ph < FALL) return 0;
    const k = (m.ph - FALL) / 0.6;
    return k < 1 ? 0.3 * (1 - k) : 0;
  }
  // vzducholoď (goblinský zeppelin) – silueta v dálce, nasvícená zleva rudým sluncem
  const ZW = 70, ZH = 34;
  let zepSprites = null;
  function buildZeppelin(){
    const cv = document.createElement('canvas'); cv.width = ZW; cv.height = ZH;
    const P = pxPainter(cv.getContext('2d')), B = '#1e0a0e', D = '#14060a', RIM = '#8a4a30', RIB = '#2c1216', O = '#0a0306';
    const cx = 38, cy = 11, rx = 28, ry = 9;
    for (const [fx, fy, d] of [[12, cy, -1], [12, cy, 1]]) P.poly([[fx + 2, fy], [fx - 9, fy + d * 11], [fx - 4, fy + d * 11], [fx + 8, fy + d * 2]], O);   // ocasní ploutve
    for (const [fx, fy, d] of [[12, cy, -1], [12, cy, 1]]) P.poly([[fx + 2, fy], [fx - 8, fy + d * 10], [fx - 4, fy + d * 10], [fx + 7, fy + d * 2]], d < 0 ? '#2a1014' : D);
    P.poly([[4, cy - 1], [14, cy - 2], [14, cy + 2], [4, cy + 1]], O);
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++){                              // balon: na zádi užší
      const u = (x - cx) / rx, k = x < cx ? 1 - (cx - x) / rx * 0.25 : 1;
      const h = ry * k * Math.sqrt(Math.max(0, 1 - u * u));
      if (h < 0.5) continue;
      P.rect(x, cy - h - 1, 1, h * 2 + 2, O);
      P.rect(x, cy - h, 1, h * 2, B);
      P.rect(x, cy + h * 0.35, 1, h * 0.65, D);
      P.px(x, cy - h, x < cx + rx * 0.6 ? RIM : '#4a2018');
      if (x < cx - rx * 0.55) P.px(x, cy - h + 1, '#5a2a20');
      if ((x - cx) % 7 === 0) P.rect(x, cy - h + 1, 1, h * 2 - 2, RIB);           // žebra
    }
    P.rect(cx - rx + 3, cy, rx * 2 - 6, 1, RIB);
    for (let i = -1; i <= 1; i++) P.line(cx - 8 + i * 7, cy + ry - 1, cx - 6 + i * 6, cy + ry + 6, 1, '#3a1a1a');   // lana ke gondole
    P.rect(cx - 15, cy + ry + 6, 20, 6, O); P.rect(cx - 14, cy + ry + 6, 18, 5, B);
    P.rect(cx - 14, cy + ry + 6, 18, 1, RIM); P.rect(cx - 15, cy + ry + 11, 22, 1, O);
    P.rect(cx + 4, cy + ry + 7, 3, 3, B);                                            // příď gondoly
    P.rect(cx - 19, cy + ry + 7, 4, 2, O);                                           // držák vrtule
    const flip = document.createElement('canvas'); flip.width = ZW; flip.height = ZH;
    const fc = flip.getContext('2d'); fc.translate(ZW, 0); fc.scale(-1, 1); fc.drawImage(cv, 0, 0);
    zepSprites = [cv, flip];
  }
  function zeppelin(t){
    const PER = 80, n = Math.floor(t / PER), r = pxRng(pxMix(n * 29 + 2)), dir = n % 2 ? -1 : 1;
    const ph = t - n * PER, sp = 7 + r() * 2, y = 78 + r() * 22;
    const x = dir > 0 ? -ZW + ph * sp : PX_W + ph * -sp;
    return x < -ZW - 2 || x > PX_W + 2 ? null : { x: Math.round(x), y: Math.round(y + Math.sin(ph * 0.5) * 1.2), dir };
  }
  const er = pxRng(2009);
  const EMBERS = Array.from({ length: 60 }, () => ({ x: er() * PX_W, y: er() * PX_H, v: 5 + er() * 10, w: er() * 6, g: er() < 0.55, tw: Math.floor(er() * 10) }));
  const ASH = Array.from({ length: 40 }, () => ({ x: er() * PX_W, y: er() * PX_H, v: 6 + er() * 10, w: er() * 6 }));

  return {
    name: 'Zpustošená země',
    spots: { playerBox: [PL.player.x / PX_W, (PL.player.y + 1) / PX_H], enemyBox: [PL.enemy.x / PX_W, (PL.enemy.y - 1) / PX_H] },
    fps: 15,
    light,
    layers: [
      { seed: 141, draw(P, r){   // rudé nebe, slunce, mlhoviny, plynný obr s prstencem, plovoucí úlomky
        P.bands(0, HZ + 4, ['#12040c', '#200612', '#340a16', '#4e1018', '#6a1a1a', '#8a2a1c', '#a8401e', '#c45a24', '#d87830']);
        for (let y = 0; y < 150; y++) for (let x = 0; x < PX_W; x++){
          const n = Math.sin(x * 0.02 + y * 0.04) * 0.5 + Math.sin(x * 0.047 - y * 0.02 + 1) * 0.35 + Math.sin(x * 0.11 + y * 0.09) * 0.15;
          if (n > 0.4 && (n - 0.4) * 30 > bay(x, y)) P.px(x, y, y < 60 ? '#3a0e2a' : '#5a1a26');
        }
        for (let y = 40; y < HZ + 4; y++) for (let x = 0; x < 260; x++){            // rudé slunce
          const d = Math.hypot(x - SUN.x, (y - SUN.y) * 1.2);
          if (d < 15) P.px(x, y, d < 11 ? '#ffd8a0' : '#ff9a50');
          else if (d < 110 && (1 - d / 110) ** 1.5 * 20 > bay(x, y) + 1) P.px(x, y, d < 34 ? '#f08040' : d < 64 ? '#d0582a' : '#a83e22');
        }
        const GX = 404, GY = 46, GR = 26;                                            // plynný obr
        for (let y = -GR; y <= GR; y++) for (let x = -GR; x <= GR; x++){
          if (Math.hypot(x, y) > GR) continue;
          const lit = (-x * 0.7 - y * 0.4) / GR + (bay(x + GX, y + GY) / 16 - 0.5) * 0.3, band = Math.sin((y + x * 0.25) * 0.5) > 0.3;
          P.px(GX + x, GY + y, lit > 0.4 ? (band ? '#8ab89a' : '#6a9a80') : lit > 0 ? (band ? '#5a8070' : '#4a6a5e') : lit > -0.4 ? '#2e4a44' : '#1a2e2c');
        }
        for (let a = 0; a < Math.PI * 2; a += 0.012){
          const x = GX + Math.cos(a) * 44, y = GY + Math.sin(a) * 7 - Math.cos(a) * 6;
          if (Math.sin(a) < 0 && Math.hypot(x - GX, y - GY) < GR) continue;
          P.px(x, y, Math.sin(a) > 0 ? '#c8b890' : '#7a6a58');
        }
        for (const [x, y, w] of [[150, 46, 8], [176, 34, 4], [300, 28, 6], [470, 108, 5], [342, 84, 3]]){   // plovoucí kusy země
          P.poly([[x - w, y], [x + w, y], [x + w * 0.3, y + w * 1.4], [x - w * 0.2, y + w * 1.1]], '#1e0a0c');
          P.rect(x - w, y - 1, w * 2, 2, '#5a2418'); P.rect(x - w, y - 1, w * 0.6, 1, '#a8502a');
        }
        // vzdálené rudé mesy a skalní věže
        const h1 = pxRidgeLine(pxRng(142), 46, 1.1);
        for (let x = 0; x < PX_W; x++){ const y = Math.round(HZ - 12 - h1[x]); P.rect(x, y, 1, PX_H - y, '#4a1a16'); P.px(x, y, '#8a3a24'); if (h1[x] > h1[Math.max(0, x - 1)]) P.px(x, y + 1, '#7a3020'); }
        for (const [x, w, h] of [[30, 6, 60], [96, 4, 40], [350, 7, 70], [452, 5, 50], [420, 3, 30]]){
          P.poly([[x - w - 2, HZ], [x - w * 0.6, HZ - h], [x + w * 0.6, HZ - h - 3], [x + w + 2, HZ]], '#3a1410');
          P.line(x - w - 2, HZ, x - w * 0.6, HZ - h, 1, '#8a3a24');
        }
        const h2 = pxRidgeLine(pxRng(143), 18, 1);
        for (let x = 0; x < PX_W; x++){ const y = Math.round(HZ - 2 - h2[x]); P.rect(x, y, 1, PX_H - y, '#2e0e0c'); P.px(x, y, '#6a2a1a'); }
      } },
      { dynamic: true, draw(P, r, t){   // vzducholoď proplouvající v dálce (za portálem)
        if (!PX_OPTIONS.felZeppelin) return;
        if (!zepSprites) buildZeppelin();
        const z = zeppelin(ts(t));
        if (!z) return;
        P.ctx.drawImage(zepSprites[z.dir > 0 ? 0 : 1], z.x, z.y);
        const s = step(t), mx = v => z.dir > 0 ? z.x + v : z.x + ZW - 1 - v;
        const px0 = mx(17), py = z.y + 27;                                              // vrtule
        if (s % 2) P.rect(px0, py - 3, 1, 7, '#2c1216'); else P.rect(px0, py, 1, 1, '#2c1216');
        for (const v of [26, 30, 34]) if ((s + v) % 10 < 7) P.px(mx(v), z.y + 27, '#f0a040');   // okénka gondoly
      } },
      { dynamic: true, draw(P, r, t){   // fel meteory (let a dopad v dálce)
        if (!PX_OPTIONS.felMeteors) return;
        const m = meteor(ts(t));
        if (!m) return;
        const k = Math.min(1, m.ph / FALL), hx = m.x0 + (m.x1 - m.x0) * k, hy = m.y0 + (m.y1 - m.y0) * k * k;
        if (m.ph < FALL){
          for (let i = 0; i < 26; i++){                                              // ohon
            const kk = Math.max(0, k - i * 0.012), x = m.x0 + (m.x1 - m.x0) * kk, y = m.y0 + (m.y1 - m.y0) * kk * kk;
            P.px(x, y, i < 3 ? FELC[4] : i < 9 ? FELC[3] : i < 16 ? FELC[2] : '#4a2a26');
            if (i < 12) P.px(x, y + 1, i < 6 ? FELC[3] : FELC[1]);
          }
          P.rect(hx - 1, hy - 1, 3, 3, FELC[4]);
        } else {
          const tt = m.ph - FALL, sr = pxRng(pxMix(Math.round(m.x1) * 7));
          if (tt < 0.3) for (let yy = -10; yy <= 4; yy++) for (let xx = -16; xx <= 16; xx++){
            const v = 1 - Math.hypot(xx / 16, yy / 10) - tt * 2;
            if (v > 0 && v * 16 > bay(m.x1 + xx, m.y1 + yy)) P.px(m.x1 + xx, m.y1 + yy, v > 0.4 ? FELC[4] : FELC[3]);
          }
          for (let i = 0; i < 18; i++){
            const vx = (sr() - 0.5) * 50, vy = -(10 + sr() * 30);
            if (tt < 0.9) P.px(m.x1 + vx * tt, m.y1 + vy * tt + 40 * tt * tt, sr() < 0.5 ? FELC[3] : FELC[2]);
          }
          for (let i = 0; i < 5; i++){ const rr = 3 + tt * 10 + i; P.ellipse(m.x1 - 4 + i * 3 + tt * 8, m.y1 - 2 - tt * 10 - i, rr * 0.6, rr * 0.4, tt < 0.6 ? '#4a2a26' : '#3a1e1e'); }
        }
      } },
      { seed: 144, draw(P, r){   // Temný portál: podstavec se schodištěm, pilíře, rohy, řetězy
        const O = ST.out, X = PO.x;
        // řetězy z horních rohů ke kotvám v zemi (za pilíři)
        const chain = (x0, y0, x1, y1, sag) => {
          const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
          for (let i = 0; i <= n; i++){
            const u = i / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag;
            if (i % 2){ P.rect(x - 2, y - 1, 5, 3, O); P.rect(x - 1, y, 3, 1, ST.lit); P.px(x - 1, y - 1, ST.rim); }
            else { P.rect(x - 1, y - 2, 3, 5, O); P.rect(x, y - 1, 1, 3, ST.mid); P.px(x, y - 1, ST.rim); }
          }
        };
        chain(PO.l - 26, PO.top - 4, 120, HZ + 2, 14); chain(PO.r + 26, PO.top - 4, 360, HZ - 2, 14);
        for (const [x, y] of [[120, HZ + 2], [360, HZ - 2]]){ P.rect(x - 5, y - 4, 11, 8, O); P.rect(x - 4, y - 3, 9, 6, ST.mid); P.rect(x - 4, y - 3, 9, 1, ST.rim); P.rect(x - 4, y - 3, 3, 6, ST.lit); }
        // stupňovitý podstavec
        for (const [w, y0, h] of [[96, PLINTH + 12, 8], [86, PLINTH + 5, 8], [76, PLINTH - 1, 7]]){
          P.rect(X - w - 1, y0 - 1, w * 2 + 2, h + 2, O);
          P.rect(X - w, y0, w * 2, h, ST.mid); P.rect(X - w, y0, w * 2, 1, ST.rim);
          P.rect(X - w, y0, 10, h, ST.lit); P.rect(X + w - 14, y0, 14, h, ST.shade);
          for (let x = X - w + 12; x < X + w - 8; x += 12) P.rect(x, y0 + 1, 1, h - 1, O);
        }
        // široké schodiště vepředu
        for (let k = 0; k < 9; k++){
          const y = PLINTH + 2 + k * 2, w = 22 + k * 3;
          P.rect(X - w - 1, y, w * 2 + 2, 2, O); P.rect(X - w, y, w * 2, 1, ST.rim); P.rect(X - w, y + 1, w * 2, 1, ST.mid);
          P.rect(X + w * 0.5, y + 1, w * 0.5, 1, ST.dark);
        }
        // pilíře: rozšiřují se dolů, vytesaná lebka, sloupec run
        for (const side of [-1, 1]){
          const inner = side < 0 ? PO.l : PO.r;
          for (let y = PO.top - 14; y < PLINTH; y++){
            const k = (y - PO.top + 14) / (PLINTH - PO.top + 14), wdt = Math.round(22 + k * 10);
            const x0 = side < 0 ? inner - wdt : inner, x1 = side < 0 ? inner : inner + wdt;
            P.rect(x0 - 1, y, x1 - x0 + 2, 1, O);
            P.rect(x0, y, x1 - x0, 1, ST.mid);
            P.rect(x0, y, 7, 1, side < 0 ? ST.lit : ST.mid); P.px(x0, y, side < 0 ? ST.rim : ST.lit);
            P.rect(x1 - 7, y, 7, 1, side < 0 ? ST.dark : ST.shade);
            if (y % 16 === 0) P.rect(x0, y, x1 - x0, 1, O);
          }
          // vytesaná postava v kápi (smrťák) s mečem hrotem dolů
          const cx = inner + side * 15, H0 = PO.top + 2, FOOT = PLINTH - 2;
          const hoodW = y => y < H0 + 4 ? (y - H0) * 1.2 : Math.min(8, 4.8 + (y - H0 - 4) * 0.25);
          const robeW = y => y < H0 + 22 ? 8 + (y - H0 - 18) * 0.9 : 11.5 + (y - H0 - 22) * 0.05;
          for (let y = H0 - 2; y < FOOT + 1; y++){                                  // výklenek
            const w = (y < H0 + 18 ? hoodW(y) + 3 : robeW(y) + 3);
            if (w > 0) P.rect(cx - w, y, w * 2 + 1, 1, '#120808');
          }
          for (let y = H0 + 18; y < FOOT; y++){                                    // roucho se záhyby
            const w = robeW(y), l = Math.round(cx - w), rr = Math.round(cx + w);
            P.rect(l - 1, y, rr - l + 3, 1, O);
            P.rect(l, y, rr - l + 1, 1, ST.mid);
            P.rect(l, y, 3, 1, ST.lit); P.px(l, y, ST.rim);
            P.rect(rr - 3, y, 4, 1, ST.dark);
            for (const fx of [-6, -2, 3, 7]){ const x = cx + fx + Math.round(Math.sin(y * 0.15 + fx) * 0.8); if (x > l + 1 && x < rr - 1) P.px(x, y, fx < 0 ? ST.dark : ST.shade); }
          }
          P.rect(cx - robeW(FOOT) - 1, FOOT - 1, robeW(FOOT) * 2 + 3, 2, O);
          for (let y = H0; y < H0 + 22; y++){                                      // kápě
            const w = hoodW(y);
            if (w <= 0) continue;
            const l = Math.round(cx - w), rr = Math.round(cx + w);
            P.rect(l - 1, y, rr - l + 3, 1, O);
            P.rect(l, y, rr - l + 1, 1, ST.mid);
            P.rect(l, y, Math.max(1, Math.round(w * 0.6)), 1, ST.lit); P.px(l, y, ST.rim);
            P.rect(rr - Math.round(w * 0.5), y, Math.round(w * 0.5) + 1, 1, ST.dark);
          }
          P.px(cx, H0 - 1, O);
          P.ellipse(cx, H0 + 13, 4, 6, '#030101');                                // temná tvář
          P.rect(cx - 4, H0 + 7, 9, 1, ST.dark);
          // rukávy sbíhající se k sepnutým rukám
          const HY = H0 + 40;
          for (const d of [-1, 1]){
            P.poly([[cx + d * 10, H0 + 22], [cx + d * 12, H0 + 30], [cx + d * 4, HY + 3], [cx + d * 1, HY - 2], [cx + d * 6, H0 + 24]], O);
            P.poly([[cx + d * 9, H0 + 23], [cx + d * 11, H0 + 30], [cx + d * 4, HY + 2], [cx + d * 2, HY - 2], [cx + d * 6, H0 + 25]], d < 0 ? ST.lit : ST.dark);
            P.line(cx + d * 9, H0 + 23, cx + d * 11, H0 + 30, 1, d < 0 ? ST.rim : ST.mid);
          }
          // meč: hlavice, záštita, čepel dolů mezi záhyby
          P.rect(cx - 1, HY - 7, 3, 3, O); P.px(cx, HY - 6, '#8a7a6a');
          P.rect(cx - 1, HY - 4, 3, 4, '#3a2a22');
          P.rect(cx - 6, HY + 1, 13, 3, O); P.rect(cx - 5, HY + 2, 11, 1, '#9a8a7a'); P.px(cx - 5, HY + 2, '#d8c8b0');
          for (let y = HY + 4; y < FOOT - 4; y++){ P.rect(cx - 2, y, 5, 1, O); P.px(cx - 1, y, '#a89a8a'); P.px(cx, y, '#6a5a50'); P.px(cx + 1, y, '#4a3a34'); }
          P.poly([[cx - 2, FOOT - 4], [cx + 3, FOOT - 4], [cx + 0.5, FOOT]], O); P.px(cx, FOOT - 3, '#a89a8a');
          for (const d of [-1, 1]){ P.rect(cx + d * 2 - 1, HY - 3, 3, 4, O); P.px(cx + d * 2, HY - 2, '#d8c8a8'); P.px(cx + d * 2, HY - 1, '#a89070'); }   // kostnaté ruce
          // obří zahnutý roh na horním rohu, otočený ven
          const hx = inner + side * 18, hy = PO.top - 18;
          const horn = [];
          for (let k = 0; k <= 60; k++){
            const u = k / 60;
            horn.push([hx + side * Math.sin(u * 1.8) * 26, hy - Math.sin(u * 2.2) * 34 + u * u * 22, Math.max(0.6, 7 * (1 - u) ** 0.9), u]);
          }
          for (const [x, y, w] of horn) P.ellipse(x, y, w + 1, w + 1, O);                     // obrys
          for (const [x, y, w, u] of horn){                                                    // kost: světlá ke slunci, rýhy
            P.ellipse(x, y, w, w, u > 0.8 ? '#d8c8a8' : '#a89070');
            P.ellipse(x - w * 0.35, y - w * 0.35, Math.max(0.5, w * 0.45), Math.max(0.5, w * 0.45), '#e8dcc0');
            P.px(x + w * 0.6, y + w * 0.5, '#5a4a3a');
          }
          horn.forEach(([x, y, w], k) => { if (k % 7 === 3 && w > 1.5) P.line(x - w, y + w * 0.3, x + w, y - w * 0.3, 1, '#6a5a44'); });
          spike(P, inner - side * 4, PO.top - 14, 14, 2, side * 0.6);
        }
        // nadpraží přes celou šířku + hřeben uprostřed
        P.rect(PO.l - 33, PO.top - 26, PO.r - PO.l + 66, 14, O);
        P.rect(PO.l - 32, PO.top - 25, PO.r - PO.l + 64, 12, ST.mid);
        P.rect(PO.l - 32, PO.top - 25, PO.r - PO.l + 64, 2, ST.rim); P.rect(PO.l - 32, PO.top - 25, 12, 12, ST.lit); P.rect(PO.r + 18, PO.top - 25, 14, 12, ST.shade);
        for (let x = PO.l - 26; x < PO.r + 26; x += 9) P.rect(x, PO.top - 21, 4, 4, ST.dark);
        P.poly([[X - 16, PO.top - 25], [X - 8, PO.top - 40], [X, PO.top - 34], [X + 8, PO.top - 40], [X + 16, PO.top - 25]], O);
        P.poly([[X - 14, PO.top - 25], [X - 8, PO.top - 37], [X, PO.top - 32], [X + 8, PO.top - 37], [X + 14, PO.top - 25]], ST.mid);
        P.line(X - 14, PO.top - 25, X - 8, PO.top - 37, 1, ST.rim);
        spike(P, X, PO.top - 34, 18, 3, 0); spike(P, X - 22, PO.top - 25, 12, 2, -0.6); spike(P, X + 22, PO.top - 25, 12, 2, 0.6);
        // rám otvoru (lomený oblouk) se zuby
        for (let y = PO.top - 12; y < PO.bot; y++) for (let x = PO.l - 2; x < PO.r + 2; x++){
          if (inOpen(x, y)) continue;
          if (inOpen(x + 1, y) || inOpen(x - 1, y) || inOpen(x, y + 1) || inOpen(x, y - 1)) P.px(x, y, x < PO.x ? ST.rim : ST.lit);
          else if (y < PO.top + 14 && x > PO.l && x < PO.r - 1) P.px(x, y, ST.mid);
        }
        // žeroucí koše na podstavci
        for (const [x, y] of FIRES.slice(0, 2)){ P.rect(x - 5, y, 11, 4, O); P.rect(x - 4, y, 9, 3, ST.lit); P.rect(x - 1, y + 4, 3, 3, O); }
      } },
      { dynamic: true, draw(P, r, t){   // zelený vír v portálu a jeho záře
        const s = step(t), T = ts(t), spin = PX_OPTIONS.felPortal ? T * 1.8 : 0;
        const cx = PO.x, cy = (PO.top + PO.bot) / 2, hw = (PO.r - PO.l) / 2, hh = (PO.bot - PO.top) / 2;
        for (let y = PO.top - 8; y < PO.bot; y++) for (let x = PO.l; x < PO.r; x++){
          if (!inOpen(x, y)) continue;
          const dx = (x - cx) / hw, dy = (y - cy) / hh, d = Math.hypot(dx, dy * 0.9);
          const a = Math.atan2(dy, dx), arm = Math.sin(a * 2 + d * 7 - spin * 1.6) * 0.5 + 0.5;
          const v = 0.25 + 0.5 * arm * (1 - d * 0.35) + (d < 0.18 ? 0.45 : 0) - Math.max(0, Math.abs(dx) - 0.8) * 1.2 + (bay(x, y) / 16 - 0.5) * 0.25;
          P.px(x, y, FELC[v > 0.9 ? 4 : v > 0.68 ? 3 : v > 0.44 ? 2 : v > 0.2 ? 1 : 0]);
        }
        if (PX_OPTIONS.felPortal){
          const pulse = 0.75 + 0.25 * Math.sin(T * 1.3);
          for (let y = PO.top - 4; y < PO.bot + 14; y++) for (let x = PO.l - 26; x < PO.r + 26; x++){   // záře na pilíře a zem
            if (inOpen(x, y)) continue;
            const v = (1 - Math.hypot((x - cx) / (hw + 30), (y - cy) / (hh + 16))) * pulse;
            const face = ((x >= PO.l - 6 && x < PO.l) || (x >= PO.r && x < PO.r + 6)) && y >= PO.top || (y >= PO.bot && y < PO.bot + 22 && Math.abs(x - cx) < 60);   // vnitřní hrany pilířů a zem
            if (face && v > 0 && v * 14 > bay(x, y) + 3) P.px(x, y, v > 0.5 ? '#4aa828' : v > 0.3 ? '#2e6a1a' : '#1e4a12');
          }
          for (const side of [-1, 1]){                                              // oči smrťáků žhnou ze tmy kápě
            const cx2 = (side < 0 ? PO.l : PO.r) + side * 15, ey = PO.top + 14, on = 0.5 + 0.5 * Math.sin(T * 1.1 + side);
            for (let yy = -6; yy <= 6; yy++) for (let xx = -5; xx <= 5; xx++){
              const v = (1 - Math.hypot(xx / 5, yy / 6)) * on;
              if (v > 0 && v * 12 > bay(cx2 + xx, ey + yy) + 4 && Math.hypot(xx / 4, (yy + 1) / 6) < 1) P.px(cx2 + xx, ey + yy, '#0e3008');
            }
            for (const dx of [-2, 2]){ P.px(cx2 + dx, ey, on > 0.3 ? FELC[4] : FELC[3]); P.px(cx2 + dx + (dx < 0 ? -1 : 1), ey, FELC[2]); }
          }
          if (s % 37 < 3){                                                            // výboj přes portál
            const rr = pxRng(pxMix(Math.floor(s / 37) * 5));
            let x = PO.l + 2, y = PO.top + 10 + rr() * 70;
            while (x < PO.r - 2){ const nx = x + 2 + rr() * 4, ny = y + (rr() - 0.5) * 8; P.line(x, y, nx, ny, 1, '#f0ffd0'); x = nx; y = ny; }
          }
        }
      } },
      { seed: 145, draw(P, r){   // rozpukaná pustina: pukliny, trny, kameny, kosti
        P.bands(HZ - 2, PX_H, ['#6a2a1a', '#5a2418', '#4a1c14', '#3e1810', '#32140e', '#26100a']);
        for (let y = HZ; y < HZ + 40; y++) for (let x = 120; x < 360; x++){              // zelený svit portálu na zemi
          const v = 1 - Math.hypot((x - PO.x) / 110, (y - HZ - 4) / 22);
          if (v > 0 && v * 14 > bay(x, y) + 3) P.px(x, y, v > 0.5 ? '#3e4a1a' : '#4a3216');
        }
        for (let i = 0; i < 220; i++){ const x = r() * PX_W, y = HZ + r() * (PX_H - HZ); P.px(x, y, r() < 0.5 ? '#7a3420' : '#2a0e0a'); }
        for (let i = 0; i < 40; i++){                                                     // suché praskliny (tmavé)
          let x = r() * PX_W, y = HZ + 4 + r() * 96; const len = 4 + r() * 12;
          for (let k = 0; k < len; k++){ x += 1; y += (r() - 0.5) * 1.4; P.px(x, y, '#1a0806'); }
        }
        for (const c of CRACKS) for (const [x, y] of c){ P.px(x, y - 1, '#1a0806'); P.px(x, y, '#0e2a08'); P.px(x, y + 1, '#120604'); }
        for (const [x, y, h, w, d] of [[14, 200, 44, 6, 1], [40, 190, 28, 4, 1], [446, 196, 50, 6, -1], [470, 210, 34, 5, -1], [392, 186, 20, 3, -1], [176, 180, 16, 3, 1]]) spike(P, x, y, h, w, d);
        for (let i = 0; i < 9; i++){ const y = 184 + r() * 80, k = (y - 170) / 100; P.rock(240 + r() * 230, y, 3 + k * 7, 3 + k * 6, r, FEL_ROCK); }
        for (const [x, y] of [[262, 214], [70, 262]]){                                   // kosti
          P.rect(x, y, 6, 4, '#1a0806'); P.rect(x + 1, y, 4, 3, '#c8b8a0'); P.px(x + 1, y + 1, '#1a0806'); P.px(x + 3, y + 1, '#1a0806');
          P.line(x + 8, y + 3, x + 18, y + 2, 1, '#a89880'); P.px(x + 8, y + 2, '#d8c8b0'); P.px(x + 18, y + 1, '#d8c8b0');
        }
        P.horizon(pxRng(146), HZ + 1, 4, '#1a0806', '#8a3a24').clip();
      } },
      { dynamic: true, draw(P, r, t){   // pulzující pukliny a fel ohně
        const s = step(t), T = ts(t);
        if (PX_OPTIONS.felCracks) CRACKS.forEach((c, ci) => c.forEach(([x, y], k) => {
          const w = Math.sin(k * 0.25 - T * 3 + ci * 1.3);
          if (w > 0.2) P.px(x, y, w > 0.75 ? FELC[4] : w > 0.5 ? FELC[3] : FELC[2]);
          if (w > 0.8 && k % 3 === 0) P.px(x, y - 1, FELC[2]);
        }));
        if (PX_OPTIONS.felFire) FIRES.forEach(([x, y, sc], i) => {
          const R = 18 * sc + (s + i) % 2;
          for (let yy = -R; yy <= R * 0.4; yy++) for (let xx = -R; xx <= R; xx++){
            const v = 1 - Math.hypot(xx, yy * 1.3) / R;
            if (v > 0 && v * 10 > bay(x + xx, y + yy) + 4) P.px(x + xx, y + yy - 3, '#2a5a14');
          }
          flame(P, x, y, sc, s, i * 7);
        });
      } },
      { seed: 147, draw(P, r){   // rudé skalní plošinky s fel puklinami
        const st = { out: '#120606', side: '#5a2418', sideDark: '#3a1610', seam: '#3ac020', edge: '#7a3420', top: '#8a3e26', center: '#96482c', hi: '#c06a3a' };
        P.mound(PL.enemy, 196, pxRng(148), {
          out: '#120606', body: '#4a1c14', lit: '#8a3a22', shade: '#2a0e0a', foot: '#3a1610',
          mud: ['#4a1c14', '#5a2418'], tuft: null, pebble: '#7a3420',
          strata: ['#2a0e0a', '#6a2a1a'], platShadow: '#1a0806', rock: FEL_ROCK, seam: ['#0a2a08', '#3ac020', '#8aff40'],
        });
        P.platform(PL.enemy.x, PL.enemy.y, PL.enemy.rx, PL.enemy.ry, 6, st);
        P.platform(PL.player.x, PL.player.y, PL.player.rx, PL.player.ry, 9, st);
        for (const E of [PL.enemy, PL.player]){
          P.line(E.x - E.rx * 0.35, E.y - 2, E.x - E.rx * 0.15, E.y + 3, 1, '#3a1610');
          P.line(E.x + E.rx * 0.2, E.y - 4, E.x + E.rx * 0.35, E.y + 1, 1, '#3a1610');
          P.px(E.x - E.rx * 0.25, E.y, '#3ac020');
        }
      } },
      { dynamic: true, draw(P, r, t){   // jiskry stoupají, popel letí doprava
        if (!PX_OPTIONS.felEmbers) return;
        const s = step(t), T = ts(t);
        for (const e of EMBERS){
          const y = PX_H - ((PX_H - e.y + T * e.v) % PX_H), x = (e.x + T * e.v * 0.6 + Math.sin(T * 0.8 + e.w) * 5) % PX_W, tw = (s + e.tw) % 10;
          if (tw > 7) continue;
          P.px(x, y, e.g ? (tw < 2 ? FELC[4] : FELC[3]) : (tw < 2 ? '#ffd080' : '#f07a30'));
        }
        for (const a of ASH){
          const x = (a.x + T * a.v) % PX_W, y = (a.y + T * 3 + Math.sin(T * 0.7 + a.w) * 6) % PX_H;
          P.px(x, y, '#2a1a1a'); P.px(x + 1, y, '#3a2626');
        }
      } },
    ],
  };
})();

const PIXEL_ARENA_DEFS = { volcano: VOLCANO, storm: STORM, mountain: MOUNTAIN, ocean: OCEAN, desert: DESERT, grave: GRAVE, jungle: JUNGLE, nether: NETHER, aether: AETHER, fel: FEL };

// připraví plátno arény: statické vrstvy nakreslí jednou, vrátí funkci render(t)
function pxSetupArena(canvas, def){
  canvas.width = PX_W; canvas.height = PX_H;
  const ctx = canvas.getContext('2d');
  for (const L of def.layers){
    if (L.dynamic) continue;
    const c = document.createElement('canvas');
    c.width = PX_W; c.height = PX_H;
    L.draw(pxPainter(c.getContext('2d')), pxRng(L.seed || 1), 0);
    L.cache = c;
  }
  const P = pxPainter(ctx);
  return function render(t){
    ctx.clearRect(0, 0, PX_W, PX_H);
    for (const L of def.layers){
      if (L.cache) ctx.drawImage(L.cache, 0, 0);
      else L.draw(P, pxRng(L.seed || 1), t);
    }
  };
}
