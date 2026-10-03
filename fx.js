/* =====================================================================
   Efekty pokémonů: rozpad na pixely (omdlení) a zářivý kruh (příchod)
   ---------------------------------------------------------------------
   Rozpad: obraz spritu se rozloží na kostičky po 2×2 pixelech, které vítr
   postupně odfoukne doprava nahoru (zleva doprava, s náhodou) a zmizí.
   Příchod: z místa, kde pokémon stojí, se rozběhne pixelový kruh světla,
   pokémon se objeví jako bílá silueta a "rozsvítí se" do barev.
   Vše v pixelech spritu, aby to sedělo do pixelové mřížky scény.
   ===================================================================== */

// plátno efektu ve "world" nad spritem; scale = kolik obrazovkových px má 1 pixel spritu
function fxCanvas(box, padL, padT, padR, padB){
  const el = box.querySelector('.pokemon');
  const r = el.getBoundingClientRect(), wr = world.getBoundingClientRect();
  const W = el.width || el.naturalWidth || 96, H = el.height || el.naturalHeight || 96;
  const k = r.width / W;
  const c = document.createElement('canvas');
  c.width = W + padL + padR; c.height = H + padT + padB;
  Object.assign(c.style, {
    position: 'absolute', zIndex: 9, pointerEvents: 'none', imageRendering: 'pixelated',
    left: (r.left - wr.left - padL * k) + 'px', top: (r.top - wr.top - padT * k) + 'px',
    width: c.width * k + 'px', height: c.height * k + 'px',
  });
  world.appendChild(c);
  return { c, ctx: c.getContext('2d'), W, H, el };
}

/* ---------- Rozpad na pixely (vrací false, když nejde přečíst obraz → stará animace) ---------- */
function disintegrate(box){
  const PADR = 70, PADT = 46, B = 2;
  let fx, data;
  try {
    fx = fxCanvas(box, 4, PADT, PADR, 4);
    const src = document.createElement('canvas');
    src.width = fx.W; src.height = fx.H;
    src.getContext('2d').drawImage(fx.el, 0, 0, fx.W, fx.H);
    data = src.getContext('2d').getImageData(0, 0, fx.W, fx.H).data;   // GIF bez CORS → výjimka
  } catch { fx?.c.remove(); return false; }
  const { c, ctx, W, H } = fx;
  const parts = [];
  for (let y = 0; y < H; y += B) for (let x = 0; x < W; x += B){
    const i = ((y + 1) * W + x + 1) * 4;
    if (data[i + 3] < 128) continue;
    parts.push({
      x: x + 4, y: y + PADT, col: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`,
      delay: (x / W) * 0.55 + Math.random() * 0.35 + (1 - y / H) * 0.1,
      vx: 18 + Math.random() * 26, vy: -(6 + Math.random() * 18), w: Math.random() * 6,
      life: 0.7 + Math.random() * 0.6,
    });
  }
  const t0 = performance.now();
  let last = t0;
  const step = now => {
    const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of parts){
      const age = t - p.delay;
      if (age > p.life) continue;
      alive++;
      if (age > 0){
        p.vx += 40 * dt;                                  // vítr zrychluje
        p.x += p.vx * dt;
        p.y += (p.vy + Math.sin(age * 9 + p.w) * 10) * dt;
        ctx.globalAlpha = Math.max(0, 1 - age / p.life);
      } else ctx.globalAlpha = 1;
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), age > 0.25 ? 1 : B, age > 0.25 ? 1 : B);
    }
    if (alive) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
  return true;
}

/* ---------- Příchod: zářivý pixelový kruh + rozsvícení ze siluety ---------- */
function spawnGlow(box, color = '#fff2b0'){
  // ukotvení na nohy (spodek boxu) – nový sprite se v tu chvíli teprve načítá
  const br = box.getBoundingClientRect(), wr = world.getBoundingClientRect();
  const k = arenaPixelSize ? arenaPixelSize() : 2, W = Math.max(40, Math.round(br.width / k)), H = Math.round(W * 1.1);
  const c = document.createElement('canvas');
  c.width = W + 60; c.height = H + 30;
  Object.assign(c.style, { position: 'absolute', zIndex: 9, pointerEvents: 'none', imageRendering: 'pixelated',
    left: (br.left + br.width / 2 - wr.left - c.width / 2 * k) + 'px', top: (br.bottom - wr.top - (H + 10) * k) + 'px',
    width: c.width * k + 'px', height: c.height * k + 'px' });
  world.appendChild(c);
  const ctx = c.getContext('2d');
  const cx = c.width / 2, cy = H + 10;                 // u nohou
  const t0 = performance.now(), DUR = 950;
  const ring = (r, a, col) => {
    ctx.globalAlpha = a; ctx.fillStyle = col;
    const n = Math.ceil(r * 6);
    for (let i = 0; i < n; i++){
      const ang = i / n * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.32), 1, 1);   // elipsa na zemi
    }
  };
  const step = now => {
    const p = Math.min(1, (now - t0) / DUR);
    ctx.clearRect(0, 0, c.width, c.height);
    const r = 4 + (1 - (1 - p) ** 2) * (W * 0.8);
    // záře na zemi (ditherovaná elipsa) + dva prstence
    ctx.globalAlpha = (1 - p) * 0.55; ctx.fillStyle = color;
    const gr = r * 0.85;
    for (let y = -gr * 0.32; y <= gr * 0.32; y++) for (let x = -gr; x <= gr; x++)
      if ((x / gr) ** 2 + (y / (gr * 0.32)) ** 2 <= 1 && (Math.round(x) + Math.round(y)) % 2 === 0) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    for (const dr of [0, 1]) ring(r + dr, 1 - p, color);
    for (const dr of [0, 1]) ring(r * 0.7 + dr, (1 - p) * 0.85, '#ffffff');
    // sloup světla, který zhasíná
    ctx.globalAlpha = (1 - p) * 0.5; ctx.fillStyle = color;
    const bw = Math.round(W * 0.5 * (1 - p * 0.5));
    for (let y = 0; y < cy; y += 2) if ((y / 2) % 2 === 0 || p < 0.3) ctx.fillRect(Math.round(cx - bw / 2), y, bw, 1);
    // jiskry stoupají vzhůru
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++){
      const a = i * 2.39996, rr = (W * 0.35) * ((i * 37 % 10) / 10);
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy - p * (20 + i * 4) - Math.sin(a) * 4), 1, 1);
    }
    if (p < 1) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
  // pokémon: bílá silueta → barvy
  // na obal (.anim) – sprite se během příchodu vyměňuje (GIF → plátno)
  box.querySelector('.anim').animate([
    { filter: 'brightness(0) invert(1) drop-shadow(0 0 6px #fff)' },
    { filter: 'brightness(0) invert(1) drop-shadow(0 0 6px #fff)', offset: 0.4 },
    { filter: 'none' },
  ], { duration: 800, easing: 'steps(7)' });
}

/* ---------- Pokémon trenéra: shora spadne pokéball, odrazí se, otevře se a vyleze z něj ---------- */
async function ballDrop(box, type = 'poke'){
  const anim = box.querySelector('.anim');
  anim.style.opacity = '0';
  const k = arenaPixelSize ? arenaPixelSize() : 2;
  const br = box.getBoundingClientRect(), wr = world.getBoundingClientRect();
  const x = br.left + br.width / 2 - wr.left, gy = br.bottom - wr.top - 6 * k;
  const ball = document.createElement('div');
  ball.className = 'thrown-ball';
  const bc = pxBallCanvas(type, 12);
  bc.style.width = bc.style.height = 12 * k + 'px';
  ball.appendChild(bc);
  world.appendChild(ball);
  const at = (y, rot = 0, s = 1) => `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${s})`;
  const top = -20 * k;
  ball.style.transform = at(gy);
  beep(600, 0.05, 0.03, 'triangle');
  await ball.animate([
    { transform: at(top, -200), offset: 0, easing: 'ease-in' },
    { transform: at(gy, 0), offset: 0.5, easing: 'ease-out' },
    { transform: at(gy - 14 * k, 40), offset: 0.68, easing: 'ease-in' },
    { transform: at(gy, 60), offset: 0.82, easing: 'ease-out' },
    { transform: at(gy - 4 * k, 70), offset: 0.91, easing: 'ease-in' },
    { transform: at(gy, 80), offset: 1 },
  ], { duration: 900, easing: 'linear' }).finished;
  beep(220, 0.05, 0.04, 'triangle');
  ball.style.transform = at(gy, 0);
  await bc.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(0)' }],
    { duration: 380, easing: 'steps(6)' }).finished;
  // otevření: záblesk + kruh světla, ball zmizí, pokémon vyroste z bílé siluety
  beep(1200, 0.08, 0.05); beep(1600, 0.1, 0.04, 'square', 0.06);
  ball.animate([{ filter: 'brightness(1)', transform: at(gy, 0, 1) }, { filter: 'brightness(5)', transform: at(gy, 0, 1.6), opacity: 0 }],
    { duration: 260, fill: 'forwards' }).finished.then(() => ball.remove());
  window.spawnGlow?.(box, '#ffffff');
  anim.style.opacity = '';
  await anim.animate([
    { transform: 'scale(.15)', filter: 'brightness(0) invert(1)', opacity: 0.9, transformOrigin: '50% 100%' },
    { transform: 'scale(1.08)', filter: 'brightness(0) invert(1)', opacity: 1, offset: 0.55, transformOrigin: '50% 100%' },
    { transform: 'scale(1)', filter: 'none', opacity: 1, transformOrigin: '50% 100%' },
  ], { duration: 520, easing: 'ease-out' }).finished;
}
