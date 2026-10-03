/* =====================================================================
   Mince, obchod, pokébally s ruletou a lov (experimentální)
   ---------------------------------------------------------------------
   Smyčka: idle boje → mince → pokéball v obchodě → otevření (ruleta jako
   bedny v CS) → vylosovaný pokémon čeká v "Lovech" → lov: místo hráčova
   pokémona stojí trenér, hodí ball → chycený pokémon se zapíše do deníku.
   Navazuje na globální funkce z index.html (attack, faint, setMonSprite…).
   ===================================================================== */

const RARITIES = [
  { name: 'Běžný',      color: '#9aa0b0' },
  { name: 'Neobvyklý',  color: '#4cb84c' },
  { name: 'Vzácný',     color: '#3f82e8' },
  { name: 'Epický',     color: '#a64ce8' },
  { name: 'Legendární', color: '#f2b418' },
];
const MONS_BY_RARITY = RARITIES.map((_, r) => {
  const ids = [];
  for (let id = 1; id <= DEX_MAX; id++) if (monRarity(id) === r) ids.push(id);
  return ids;
});

// cena, šance na vzácnosti (v %, pořadí jako RARITIES), šance na shiny, násobek šance na chycení,
// šance na kvalitu 1–5 ★ (party.js)
const SHOP_BALLS = {
  poke:   { price: 100,  odds: [70, 24, 5, 1, 0],      shiny: 1 / 256, catch: 1,        stars: [55, 30, 11, 3.5, 0.5], accent: '#e83a3a', tag: 'Pro začátek' },
  great:  { price: 300,  odds: [38, 38, 18, 5.5, 0.5], shiny: 1 / 200, catch: 1.3,      stars: [40, 33, 18, 7, 2],     accent: '#3a74d8', tag: 'Lepší šance' },
  ultra:  { price: 800,  odds: [12, 30, 38, 16, 4],    shiny: 1 / 128, catch: 1.6,      stars: [25, 33, 25, 12, 5],    accent: '#f2c230', tag: 'Pro sběratele' },
  master: { price: 2500, odds: [0, 0, 30, 50, 20],     shiny: 1 / 64,  catch: Infinity, stars: [0, 20, 40, 28, 12],    accent: '#a64ce8', tag: 'Jen to nejlepší' },
};
const PITY_MAX = 30;                            // nejpozději každý 30. ball dá aspoň epického
const RELEASE_COINS = [10, 20, 45, 100, 250];   // kolik mincí vrátí puštění vylosovaného pokémona
const CATCH_BASE = [0.9, 0.75, 0.55, 0.4, 0.25];
// kroužek při hodu: čím menší, když hodíš, tím líp
const RING_MS = 1300;
const RING_ZONES = [
  { max: 0.34, mult: 1.5,  label: 'Skvělý hod!', color: '#5cff6a' },
  { max: 0.67, mult: 1.15, label: 'Dobrý hod!',  color: '#ffd84a' },
  { max: 1.01, mult: 0.75, label: 'Hod',         color: '#ff6a5a' },
];
// kde pokémon žije → do které arény se na něj jde
const HABITAT = {
  fire: 'volcano', electric: 'storm', dragon: 'storm', ice: 'mountain', water: 'ocean',
  ground: 'desert', rock: 'desert', ghost: 'grave', bug: 'jungle', grass: 'jungle', poison: 'jungle',
  psychic: 'nether', dark: 'nether', fairy: 'aether', flying: 'aether', fighting: 'fel', steel: 'fel', normal: 'ocean',
};
function habitatOf(id){
  const types = monTypes(id);
  const t = types.find(t => t !== 'normal') || types[0];
  return ARENAS[HABITAT[t]] ? HABITAT[t] : arena;
}

const BALL_ICON = Object.fromEntries(Object.keys(BALL_TYPES).map(k => [k, pxBallCanvas(k, 16).toDataURL()]));
const COIN_ICON = pxCoinCanvas(10).toDataURL();
document.querySelectorAll('img.coin').forEach(i => { i.src = COIN_ICON; });
const wait = ms => new Promise(r => setTimeout(r, ms));
const coinHtml = n => `<img class="coin" alt="" src="${COIN_ICON}">${n.toLocaleString('cs-CZ')}`;

/* ---------- Uložený stav ---------- */
const SHOP_KEY = 'pokeIdle.shop';
let shop = null;
try { shop = JSON.parse(localStorage.getItem(SHOP_KEY)); } catch {}
shop = { coins: 300, balls: {}, hunts: [], pity: 0, nextUid: 1, items: {}, upg: {}, ...(shop || {}) };
shop.items ||= {}; shop.upg ||= {};

/* ---------- Předměty a trvalá vylepšení trenéra ----------
   Předměty se kupují tady a používají v Týmu (léčení, level, evoluce).
   Vylepšení platí pro celou hru, každá další úroveň je dražší. */
const ITEM_DEFS = {
  potion: { name: 'Lektvar', price: 80, desc: 'Vyléčí 50 % HP.', group: 'heal' },
  revive: { name: 'Oživení', price: 250, desc: 'Probudí omdlelého na 50 % HP.', group: 'heal' },
  candy:  { name: 'Rare Candy', price: 450, desc: 'Okamžitě +1 level.', group: 'heal' },
  cable:  { name: 'Spojovací kabel', price: 1500, desc: 'Nahrazuje evoluci výměnou.', group: 'trade' },
};
for (const [k, name] of Object.entries(EVO_ITEMS)){
  const stone = k.endsWith('-stone');
  ITEM_DEFS[k] = { name, price: stone ? 1200 : 1800, desc: stone ? 'Evoluční kámen.' : 'Předmět k evoluci výměnou.', group: stone ? 'stone' : 'trade' };
}
const ITEM_GROUPS = { heal: 'Léčení a levely', stone: 'Evoluční kameny', trade: 'Výměna a předměty k evoluci' };
const itemIcon = (() => { const c = {}; return k => c[k] ||= pxItemIcon(k).toDataURL(); })();
const itemCount = k => shop.items[k] || 0;
function useItem(k){ if (!itemCount(k)) return false; shop.items[k]--; saveShop(); return true; }

const UPGRADES = {
  coins: { name: 'Bohatší výhry', desc: '+10 % mincí za výhru', max: 5, base: 600 },
  xp:    { name: 'Rychlejší trénink', desc: '+10 % XP', max: 5, base: 600 },
  heal:  { name: 'Pokémon Center', desc: 'léčení o 15 % rychlejší', max: 4, base: 800 },
  swap:  { name: 'Automatická výměna', desc: 'když tvůj pokémon omdlí, nastoupí další zdravý z týmu', max: 1, base: 4000 },
  charm: { name: 'Shiny Charm', desc: '×1,5 šance na shiny z pokéballů', max: 2, base: 6000 },
};
const upg = k => shop.upg[k] || 0;
const upgCost = k => Math.round(UPGRADES[k].base * 2.2 ** upg(k) / 50) * 50;
function saveShop(){ try { localStorage.setItem(SHOP_KEY, JSON.stringify(shop)); } catch {} }

/* ---------- Mince ---------- */
const coinValue = document.getElementById('coinValue');
// číslo mincí doskáče k nové hodnotě po krocích (retro počítadlo)
let coinShown = shop.coins, coinAnim = 0;
function updateCoins(){
  const from = coinShown, to = shop.coins, id = ++coinAnim, t0 = performance.now();
  const step = now => {
    if (id !== coinAnim) return;
    const k = Math.min(1, (now - t0) / 450);
    coinShown = Math.round(from + (to - from) * Math.floor(k * 8) / 8);
    coinValue.textContent = coinShown.toLocaleString('cs-CZ');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  if (shopEl.classList.contains('open')) refreshShopState();
}
function addCoins(n, box){
  shop.coins += n;
  saveShop();
  updateCoins();
  if (box) floatText(box, '+' + n);
}
function floatText(box, text, cls = ''){
  const el = document.createElement('div');
  el.className = 'coin-float ' + cls;
  el.textContent = text;
  box.appendChild(el);
  el.animate([
    { transform: 'translate(-50%, 0)', opacity: 1 },
    { transform: 'translate(-50%, -40px)', opacity: 1, offset: 0.7 },
    { transform: 'translate(-50%, -56px)', opacity: 0 },
  ], { duration: 1100, easing: 'steps(8)' }).finished.then(() => el.remove());
}
/* ---------- Losování ---------- */
function rollRarity(odds){
  let x = Math.random() * odds.reduce((a, b) => a + b, 0);
  for (let r = 0; r < odds.length; r++){ x -= odds[r]; if (x < 0) return r; }
  return 0;
}
function rollMon(type, usePity = true){
  const def = SHOP_BALLS[type];
  let r = rollRarity(def.odds);
  if (usePity){
    if (r >= 3) shop.pity = 0;
    else if (++shop.pity >= PITY_MAX){ r = rollRarity([0, 0, 0, def.odds[3] || 1, def.odds[4]]); shop.pity = 0; }
  }
  const pool = MONS_BY_RARITY[r];
  return { id: pool[Math.floor(Math.random() * pool.length)], shiny: Math.random() < def.shiny * 1.5 ** upg('charm'), r };
}

/* ---------- Zvuky (krátké pípnutí přes Web Audio, žádné soubory) ---------- */
let audioCtx = null;
function beep(freq, dur = 0.04, vol = 0.035, type = 'square', at = 0){
  try {
    audioCtx ||= new AudioContext();
    const t0 = audioCtx.currentTime + at;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch {}
}
function jingle(r){
  const notes = [[523], [523, 659], [523, 659, 784], [523, 659, 784, 1047], [523, 659, 784, 1047, 1319, 1568]][r];
  notes.forEach((f, i) => beep(f, 0.14, 0.05, 'square', i * 0.09));
}

/* ---------- Obchod ---------- */
const shopEl = document.getElementById('shop');
const shopBody = document.getElementById('shopBody');
let shopTab = 'buy';

function oddsHtml(def){
  return `<div class="odds-bar">${def.odds.map((o, r) => o ? `<i style="width:${o}%;background:${RARITIES[r].color}"></i>` : '').join('')}</div>
    <div class="odds">${def.odds.map((o, r) => o ? `<div class="odd"><i style="background:${RARITIES[r].color}"></i>${RARITIES[r].name}<b>${o.toLocaleString('cs-CZ')} %</b></div>` : '').join('')}
    <div class="odd"><i class="pstar" style="box-shadow:none"></i>Shiny<b>1/${Math.round(1 / def.shiny)}</b></div></div>`;
}
function monCardHtml(h){
  const R = RARITIES[monRarity(h.id)];
  const owned = h.shiny ? dex[h.id]?.shiny : dex[h.id]?.caught;
  return `<div class="mon-tile" style="--rc:${R.color};cursor:default">
    <span class="badge" style="color:${R.color}">${R.name}</span>
    <img alt="" src="${spriteUrl(h.id, { shiny: h.shiny, animated: false })}">
    <div class="mt-name">${h.shiny ? STAR : ''}${NAMES[h.id - 1]}</div>
    <div class="mt-sub">${qstars(h.stars || 1)}</div>
    <div class="mt-sub">${ARENAS[habitatOf(h.id)].name}<br>${owned ? 'už máš v deníku' : h.shiny ? 'nový shiny do deníku!' : 'nový do deníku!'}</div>
    <div class="actions">
      <button class="btn primary" data-hunt="${h.uid}"><img class="coin" alt="" src="${BALL_ICON[h.ball]}">Vyrazit</button>
      <button class="btn" data-release="${h.uid}" title="Pustit a dostat mince zpět">Pustit +${RELEASE_COINS[monRarity(h.id)]}</button>
    </div>
  </div>`;
}

function itemCardHtml(k, bag = false){
  const d = ITEM_DEFS[k], n = itemCount(k);
  return `<div class="item-card">
    <img alt="" src="${itemIcon(k)}">
    <div class="ic-body">
      <div class="bc-head"><span class="bc-name">${d.name}</span>${bag ? '' : `<span class="bc-price">${coinHtml(d.price)}</span>`}</div>
      <div class="ic-desc">${d.desc}${n ? ` · máš ${n}×` : ''}</div>
      ${bag ? '' : `<div class="bc-actions"><button class="btn" data-item="${k}" data-price="${d.price}">Koupit</button></div>`}
    </div>
  </div>`;
}

function renderShop(){
  let html = '';
  if (shopTab === 'buy'){
    for (const [k, def] of Object.entries(SHOP_BALLS)){
      html += `<div class="ball-card" data-card="${k}">
        <div class="ball-show" style="--ac:${def.accent}"><span class="ball-tag">${def.tag}</span><img alt="" src="${BALL_ICON[k]}"></div>
        <div class="bc-body">
          <div class="bc-head"><span class="bc-name">${BALL_TYPES[k].name}</span><span class="bc-price">${coinHtml(def.price)}</span></div>
          ${oddsHtml(def)}
          <div class="bc-owned" data-owned="${k}"></div>
          <div class="bc-actions">
            <button class="btn" data-buy="${k}">Koupit</button>
            <button class="btn primary" data-buyopen="${k}">Koupit a otevřít</button>
          </div>
        </div>
      </div>`;
    }
  } else if (shopTab === 'bag'){
    for (const k of Object.keys(SHOP_BALLS)){
      if (!shop.balls[k]) continue;
      html += `<div class="ball-card">
        <div class="ball-show" style="--ac:${SHOP_BALLS[k].accent}"><span class="ball-tag">${shop.balls[k]}× v batohu</span><img alt="" src="${BALL_ICON[k]}"></div>
        <div class="bc-body">
          <div class="bc-head"><span class="bc-name">${BALL_TYPES[k].name}</span></div>
          <div class="bc-actions"><button class="btn primary" data-open="${k}">Otevřít</button></div>
        </div>
      </div>`;
    }
    const items = Object.keys(ITEM_DEFS).filter(itemCount);
    if (items.length) html += `<div class="dm-section">Předměty – použiješ je v Týmu</div>` + items.map(k => itemCardHtml(k, true)).join('');
    if (!html) html = '<div class="dm-empty">Batoh je prázdný – kup si pokéball nebo předmět.</div>';
  } else if (shopTab === 'items'){
    for (const [g, title] of Object.entries(ITEM_GROUPS)){
      html += `<div class="dm-section">${title}</div>` + Object.keys(ITEM_DEFS).filter(k => ITEM_DEFS[k].group === g).map(k => itemCardHtml(k)).join('');
    }
  } else if (shopTab === 'upgrades'){
    html = Object.entries(UPGRADES).map(([k, u]) => {
      const lv = upg(k), maxed = lv >= u.max;
      return `<div class="item-card upg-card">
        <div class="ic-body">
          <div class="bc-head"><span class="bc-name">${u.name}</span><span class="bc-price">${maxed ? 'MAX' : coinHtml(upgCost(k))}</span></div>
          <div class="ic-desc">${u.desc}</div>
          <div class="upg-dots">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
          <div class="bc-actions">${maxed ? '<span class="btn" style="cursor:default">Hotovo</span>' : `<button class="btn primary" data-upg="${k}" data-price="${upgCost(k)}">Vylepšit</button>`}</div>
        </div>
      </div>`;
    }).join('');
  } else {
    html = shop.hunts.map(monCardHtml).join('') || '<div class="dm-empty">Žádný vylosovaný pokémon nečeká. Otevři pokéball!</div>';
  }
  // DS: celé stránky po 3 kartách (prázdná místa doplnit), ať je vždy vidět přesně 3 celé
  const n = (html.match(/class="(ball-card|item-card|mon-tile)/g) || []).length;
  if (n > 3 && n % 3) html += '<div class="pad-slot"></div>'.repeat(3 - n % 3);
  shopBody.innerHTML = html;
  shopBody.scrollLeft = 0;   // nová záložka vždy od začátku
  refreshShopState();
}
// jen čísla, záložky a dostupnost tlačítek – bez překreslení (ať se neresetují animace vitrín)
function refreshShopState(){
  document.getElementById('shopCoins').textContent = shop.coins.toLocaleString('cs-CZ');
  document.getElementById('shopPity').textContent = `Pojistka ${shop.pity}/${PITY_MAX} do zaručeného epického`;
  shopBody.querySelectorAll('[data-buy], [data-buyopen]').forEach(b => {
    b.classList.toggle('poor', shop.coins < SHOP_BALLS[b.dataset.buy || b.dataset.buyopen].price);
  });
  shopBody.querySelectorAll('[data-price]').forEach(b => b.classList.toggle('poor', shop.coins < Number(b.dataset.price)));
  shopBody.querySelectorAll('[data-owned]').forEach(el => { const n = shop.balls[el.dataset.owned] || 0; el.textContent = n ? `V batohu: ${n}` : ''; });
  const bagN = Object.values(shop.balls).reduce((a, b) => a + b, 0) + Object.values(shop.items).reduce((a, b) => a + b, 0);
  shopEl.querySelectorAll('[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === shopTab);
    const n = b.dataset.tab === 'bag' ? bagN : b.dataset.tab === 'hunts' ? shop.hunts.length : 0;
    b.textContent = { buy: 'Pokébally', items: 'Předměty', upgrades: 'Vylepšení', bag: 'Batoh', hunts: 'Lovy' }[b.dataset.tab] + (n ? ` · ${n}` : '');
  });
}

function openShop(tab){
  if (hunt) return;
  closePanel();
  closeJournal();
  if (tab) shopTab = tab;
  shopEl.classList.add('open');
  renderShop();
}
function closeShop(){ shopEl.classList.remove('open'); }

document.getElementById('shopBtn').addEventListener('click', () => openShop());
document.getElementById('shopClose').addEventListener('click', closeShop);
shopEl.addEventListener('pointerdown', (e) => { if (e.target === shopEl) closeShop(); });
shopEl.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); }));
document.getElementById('shopDebugCoins').addEventListener('click', () => addCoins(1000));

function buyBall(k, btn){
  const def = SHOP_BALLS[k], card = btn?.closest('.ball-card');
  const replay = cls => { if (!card) return; card.classList.remove('flash', 'shake'); void card.offsetWidth; card.classList.add(cls); };
  if (shop.coins < def.price){
    replay('shake');
    beep(140, 0.12, 0.04, 'square');
    toast(`Na ${BALL_TYPES[k].name} ti chybí ${(def.price - shop.coins).toLocaleString('cs-CZ')} mincí.`);
    return false;
  }
  shop.coins -= def.price;
  shop.balls[k] = (shop.balls[k] || 0) + 1;
  saveShop();
  updateCoins();
  replay('flash');
  [880, 1320].forEach((f, i) => beep(f, 0.07, 0.04, 'square', i * 0.07));
  return true;
}
shopBody.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.item || b.dataset.upg){
    const price = Number(b.dataset.price), card = b.closest('.item-card');
    if (shop.coins < price){
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      beep(140, 0.12, 0.04, 'square');
      return toast(`Chybí ti ${(price - shop.coins).toLocaleString('cs-CZ')} mincí.`);
    }
    shop.coins -= price;
    if (b.dataset.item) shop.items[b.dataset.item] = itemCount(b.dataset.item) + 1;
    else { shop.upg[b.dataset.upg] = upg(b.dataset.upg) + 1; toast(`${UPGRADES[b.dataset.upg].name}: úroveň ${upg(b.dataset.upg)}!`, true); }
    saveShop(); updateCoins();
    [880, 1320].forEach((f, i) => beep(f, 0.07, 0.04, 'square', i * 0.07));
    renderShop();
    return;
  }
  if (b.dataset.buy) buyBall(b.dataset.buy, b);
  else if (b.dataset.buyopen){ if (buyBall(b.dataset.buyopen, b)) openBall(b.dataset.buyopen); }
  else if (b.dataset.open) openBall(b.dataset.open);
  else if (b.dataset.hunt) startHunt(Number(b.dataset.hunt));
  else if (b.dataset.release){
    const i = shop.hunts.findIndex(h => h.uid === Number(b.dataset.release));
    if (i < 0) return;
    const [h] = shop.hunts.splice(i, 1);
    addCoins(RELEASE_COINS[monRarity(h.id)]);
    toast(`${NAMES[h.id - 1]} byl puštěn na svobodu.`);
    renderShop();
  }
});

/* ---------- Ruleta ----------
   Výsledek se vylosuje a uloží hned (zavření stránky ho neztratí), pás s pokémony
   je jen efekt: vítěz leží na pozici CASE_WIN, okolní karty jsou náhodné hody
   ze stejného ballu, takže pás ukazuje, co z něj typicky padá.
   Než se pás roztočí, ball se třese a mezitím se načtou všechny obrázky. */
const caseEl = document.getElementById('caseOverlay');
const caseStrip = document.getElementById('caseStrip');
const caseWindow = document.getElementById('caseWindow');
const caseActions = document.getElementById('caseActions');
const revealEl = document.getElementById('reveal');
const revealCard = document.getElementById('revealCard');
const CASE_N = 64, CASE_WIN = 56, CASE_STEP = 110, CASE_MS = 6500;
let caseSpin = null, caseBusy = false;

const caseImg = m => spriteUrl(m.id, { shiny: m.shiny, animated: false });
function caseItemHtml(m){
  return `<div class="case-item r${m.r}" style="--rc:${RARITIES[m.r].color}">${m.shiny ? STAR : ''}<img alt="" src="${caseImg(m)}"></div>`;
}
// načte obrázky dopředu (max. ms), ať se při točení neobjevují opožděně
function preloadImages(urls, ms){
  const all = Promise.all([...new Set(urls)].map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
  return Promise.race([all, wait(ms)]);
}

async function openBall(type){
  if (caseBusy || !shop.balls[type]) return;
  caseBusy = true;
  shop.balls[type]--;
  const res = rollMon(type);
  const rec = { uid: shop.nextUid++, id: res.id, shiny: res.shiny, ball: type, stars: 1 + rollRarity(SHOP_BALLS[type].stars) };
  shop.hunts.push(rec);
  saveShop();
  if (shopEl.classList.contains('open')) renderShop();

  const items = Array.from({ length: CASE_N }, (_, i) => i === CASE_WIN ? res : rollMon(type, false));
  caseStrip.style.transform = '';
  caseStrip.getAnimations().forEach(a => a.cancel());
  caseStrip.innerHTML = items.map(caseItemHtml).join('');
  document.getElementById('caseTitle').innerHTML = `<img alt="" src="${BALL_ICON[type]}">Otevírám ${BALL_TYPES[type].name}…`;
  caseActions.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'case-intro';
  intro.innerHTML = `<img alt="" src="${BALL_ICON[type]}">`;
  caseWindow.appendChild(intro);
  caseEl.classList.add('open');

  // napětí: ball se třese (aspoň chvilku), mezitím se načtou obrázky; pak záblesk a pás
  const shakeTick = setInterval(() => beep(260, 0.04, 0.03, 'triangle'), 350);
  await Promise.all([preloadImages(items.map(caseImg).concat(spriteUrl(res.id, { shiny: res.shiny })), 5000), wait(900)]);
  clearInterval(shakeTick);
  beep(1800, 0.08, 0.04);
  intro.classList.add('burst');
  setTimeout(() => intro.remove(), 400);

  const win = caseWindow.clientWidth;
  const jitter = (Math.random() - 0.5) * CASE_STEP * 0.75;
  const target = -(CASE_WIN * CASE_STEP + CASE_STEP / 2 - win / 2 + jitter);
  const anim = caseStrip.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${target}px)` }],
    { duration: CASE_MS, easing: 'cubic-bezier(.1, .65, .08, 1)', fill: 'forwards' });
  caseSpin = anim;
  caseActions.innerHTML = '<button class="pbtn small" id="caseSkip">Přeskočit</button>';
  document.getElementById('caseSkip').onclick = () => anim.finish();

  // cvaknutí pokaždé, když středem projede další karta
  let last = -1;
  const tickLoop = () => {
    if (caseSpin !== anim) return;
    const x = new DOMMatrix(getComputedStyle(caseStrip).transform).m41;
    const idx = Math.floor((-x + win / 2) / CASE_STEP);
    if (idx !== last){ if (last >= 0) beep(1500 + Math.random() * 200, 0.025, 0.025); last = idx; }
    requestAnimationFrame(tickLoop);
  };
  requestAnimationFrame(tickLoop);

  await anim.finished;
  caseSpin = null;
  caseActions.innerHTML = '';
  caseStrip.children[CASE_WIN].classList.add('win');
  beep(600 + res.r * 200, 0.1, 0.05);
  await wait(750);
  caseEl.classList.remove('open');
  caseBusy = false;
  showReveal(rec, res.r, type);
}

/* velké odhalení výhry: paprsky v barvě vzácnosti, animovaný sprite, konfety */
function showReveal(rec, r, type){
  const R = RARITIES[r], e = dex[rec.id];
  const isNew = !(rec.shiny ? e?.shiny : e?.caught);
  revealEl.style.setProperty('--rc', R.color);
  revealCard.innerHTML = `
    <div class="reveal-head"><span class="rtag" style="--rc:${R.color}">${R.name}</span>${rec.shiny ? `<span class="rtag" style="--rc:var(--gold-lo)">${STAR} Shiny</span>` : ''}</div>
    <div class="reveal-stage"><img alt="" src="${spriteUrl(rec.id, { shiny: rec.shiny })}"></div>
    <div class="reveal-name">${rec.shiny ? STAR : ''}${NAMES[rec.id - 1]} <small>#${pad3(rec.id)}</small></div>
    <div class="reveal-stars">${qstars(rec.stars || 1)}</div>
    <div class="reveal-types">${monTypes(rec.id).map(t => `<span class="type" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`).join('')}</div>
    <span class="reveal-badge ${isNew ? '' : 'old'}">${isNew ? 'Nový do deníku!' : 'Už máš v deníku'}</span>
    <div class="reveal-info">Žije v aréně ${ARENAS[habitatOf(rec.id)].name}.<br>Čeká v Lovech – vyraz si pro něj s ${BALL_TYPES[type].name}em.</div>
    <div class="case-actions">
      <button class="pbtn red" data-rv="hunt">Vyrazit na lov</button>
      <button class="pbtn" data-rv="later">Do Lovů</button>
      ${shop.balls[type] ? `<button class="pbtn" data-rv="again">Otevřít další (${shop.balls[type]})</button>` : ''}
    </div>`;
  revealCard.querySelector('.reveal-stage').style.backgroundImage = `url(${pxSpotlight(R.color)})`;
  revealEl.classList.add('open');
  revealCard.style.animation = 'none'; void revealCard.offsetWidth; revealCard.style.animation = '';
  jingle(r);
  if (r === 4 || rec.shiny){
    const f = document.createElement('div');
    f.className = 'screen-flash';
    document.body.appendChild(f);
    f.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 600, easing: 'steps(6)' }).finished.then(() => f.remove());
  }
  confetti(R.color, 12 + r * 10);
  if (rec.shiny) sparkleAt(revealCard.querySelector('.reveal-stage'), 18);
  if (r >= 3 || rec.shiny) toast(`Padl ${R.name.toLowerCase()} ${rec.shiny ? 'shiny ' : ''}${NAMES[rec.id - 1]}!`, rec.shiny || r === 4);

  revealCard.onclick = (ev) => {
    const a = ev.target.closest('[data-rv]')?.dataset.rv;
    if (!a) return;
    closeReveal();
    if (a === 'hunt') startHunt(rec.uid);
    else if (a === 'again') openBall(type);
    else if (shopEl.classList.contains('open')){ shopTab = 'hunts'; renderShop(); }
  };
}
function closeReveal(){
  revealEl.classList.remove('open');
  revealEl.querySelectorAll('.confetti').forEach(c => c.remove());
  revealCard.onclick = null;
}
revealEl.addEventListener('pointerdown', (e) => { if (e.target === revealEl || e.target.classList.contains('reveal-rays')) closeReveal(); });

// pixelové konfety vystřelí z karty a padají
function confetti(color, n){
  const box = revealCard.getBoundingClientRect();
  const cx = box.left + box.width / 2, cy = box.top + box.height * 0.35;
  for (let i = 0; i < n; i++){
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.background = [color, '#fff', 'var(--gold)'][i % 3];
    c.style.left = cx + 'px'; c.style.top = cy + 'px';
    revealEl.appendChild(c);
    const ang = Math.random() * Math.PI * 2, d = 120 + Math.random() * 240;
    const dx = Math.cos(ang) * d, dy = Math.sin(ang) * d * 0.7;
    c.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx * 1.15}px, ${dy + 260}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, delay: Math.random() * 150, easing: 'steps(14)' }).finished.then(() => c.remove());
  }
}

/* ---------- Lov ---------- */
const trainerBox = document.getElementById('trainerBox');
const playerBox = document.getElementById('playerBox');
const enemyBox = document.getElementById('enemyBox');
const huntHud = document.getElementById('huntHud');
const fadeTo = to => fade.animate([{ opacity: 1 - to }, { opacity: to }],
  { duration: to ? 300 : 400, easing: 'steps(5)', fill: 'forwards' }).finished;

function setupTrainer(ballType){
  // vržený stín stejně jako u pokémonů (projectShadow z index.html), zem = nejnižší neprůhledný řádek
  const sprite = pxTrainerSprite(ballType, (d, W, H) => {
    let ground = H - 1;
    while (ground > 0 && ![...Array(W).keys()].some(x => d[(ground * W + x) * 4 + 3] > 127)) ground--;
    return projectShadow((x, y) => d[(y * W + x) * 4 + 3] > 127, W, H, ground);
  });
  const canvas = trainerBox.querySelector('.pokemon');
  canvas.width = sprite.W; canvas.height = sprite.H;
  const sc = setupShadowCanvas(trainerBox, sprite.W, sprite.shadows[0]);
  spritePlayers.set(trainerBox, {
    sprite, canvas, ctx: canvas.getContext('2d'), sctx: sc.getContext('2d'),
    mode: 'idle', frame: 0, acc: 0, speed: 1, onDone: null, drawn: -1,
  });
}
window.addEventListener('resize', () => { if (!trainerBox.hidden) applyMon(trainerBox); });

function catchChance(h, zone){
  const def = SHOP_BALLS[h.ball];
  if (def.catch === Infinity) return 1;
  return Math.min(0.97, CATCH_BASE[monRarity(h.id)] * def.catch * zone.mult);
}

function renderHuntHud(msg){
  const h = hunt.h, R = RARITIES[monRarity(h.id)];
  document.getElementById('huntTitle').innerHTML =
    `${h.shiny ? STAR : ''}Divoký ${NAMES[h.id - 1]} ${qstars(h.stars || 1)} <span class="rtag" style="--rc:${R.color}">${R.name}</span>`;
  document.getElementById('huntSub').innerHTML = msg ||
    `${BALL_TYPES[h.ball].name}${hunt.throws ? ` · hod č. ${hunt.throws + 1}` : ''}<br>Hoď, když je kroužek co nejmenší.`;
  document.getElementById('throwBtn').disabled = hunt.busy;
  document.getElementById('fleeBtn').disabled = hunt.busy;
}

async function startHunt(uid){
  const h = shop.hunts.find(x => x.uid === uid);
  if (!h || hunt || bossFight) return;
  closeReveal(); closeShop(); closePanel(); closeJournal(); closeTeam();
  arenaMenu.classList.remove('open');
  hunt = { h, prevArena: arena, busy: true, throws: 0, absorb: null };
  document.body.classList.add('hunting');
  await fadeTo(1);

  const target = habitatOf(h.id);
  if (target !== arena){
    showArena(target);
    try { localStorage.setItem(ARENA_KEY, hunt.prevArena); } catch {}   // po lovu se vrátí do původní arény
  }
  playerBox.hidden = true;
  setupTrainer(h.ball);
  trainerBox.hidden = false;
  applyMon(trainerBox);
  clearTimeout(enemyBox._spawnTimer);
  (enemyBox._faintAnims || []).forEach(a => a.cancel());
  enemyBox._faintAnims = null;
  setMonSprite(enemyBox, { id: h.id, shiny: h.shiny });
  setState(enemyBox, 'idle');
  huntHud.classList.add('open');
  renderHuntHud();

  await fadeTo(0);
  toast(`Divoký ${h.shiny ? 'shiny ' : ''}${NAMES[h.id - 1]} se objevil!`, h.shiny);
  if (h.shiny) sparkle(enemyBox);
  hunt.busy = false;
  renderHuntHud();
  startRing();
}

async function endHunt(){
  if (!hunt) return;
  hunt.busy = true;
  stopRing();
  huntHud.classList.remove('open');
  await fadeTo(1);
  document.querySelectorAll('.thrown-ball').forEach(b => b.remove());
  hunt.absorb?.forEach(a => a.cancel());
  trainerBox.hidden = true;
  spritePlayers.delete(trainerBox);
  playerBox.hidden = false;
  if (arena !== hunt.prevArena) showArena(hunt.prevArena);
  setMonSprite(enemyBox, battle.enemy);
  setState(enemyBox, 'idle');
  hunt = null;
  document.body.classList.remove('hunting');
  updateBossCall();
  await fadeTo(0);
}

/* kroužek kolem pokémona – zmenšuje se pořád dokola, barva = jak dobrý by byl hod */
let ring = null;
function spriteBBox(box){
  const sp = spritePlayers.get(box);
  if (!sp) return null;
  const { W, H, data, idle } = sp.sprite, d = data[idle[0]];
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 127){
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 >= x0 ? { W, H, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.max(x1 - x0, y1 - y0) } : null;
}
function startRing(){
  stopRing();
  const c = document.createElement('canvas');
  c.className = 'catch-ring';
  enemyBox.querySelector('.anim').appendChild(c);
  ring = { c, ctx: c.getContext('2d'), t0: performance.now(), k: 1 };
  requestAnimationFrame(drawRing);
}
function stopRing(){ ring?.c.remove(); ring = null; }
function drawRing(now){
  if (!ring) return;
  // rozměry podle aktuálního spritu (GIF se může rozložit až během lovu)
  const bb = spriteBBox(enemyBox) || { W: 96, H: 96, cx: 48, cy: 56, size: 50 };
  const { c, ctx } = ring;
  if (c.width !== bb.W || c.height !== bb.H){ c.width = bb.W; c.height = bb.H; }
  ctx.clearRect(0, 0, c.width, c.height);
  const p = ((now - ring.t0) % RING_MS) / RING_MS;
  ring.k = 1 - p;
  const maxR = Math.max(10, bb.size * 0.62);
  const zone = RING_ZONES.find(z => ring.k <= z.max);
  const circle = (r, col) => {
    ctx.fillStyle = col;
    const steps = Math.ceil(r * 7);
    for (let i = 0; i < steps; i++){
      const a = i / steps * Math.PI * 2;
      ctx.fillRect(Math.round(bb.cx + Math.cos(a) * r), Math.round(bb.cy + Math.sin(a) * r), 1, 1);
    }
  };
  circle(maxR + 1, 'rgba(255,255,255,.55)');
  circle(maxR * (0.12 + 0.88 * ring.k), zone.color);
  requestAnimationFrame(drawRing);
}

// pozice ve "world" (px) – ball se kreslí do world, ať se hýbe s kamerou
function worldPoint(clientX, clientY){
  const wr = world.getBoundingClientRect();
  return { x: clientX - wr.left, y: clientY - wr.top };
}

async function throwBall(){
  if (!hunt || hunt.busy) return;
  hunt.busy = true;
  const h = hunt.h;
  const zone = RING_ZONES.find(z => (ring ? ring.k : 1) <= z.max);
  stopRing();
  hunt.throws++;
  renderHuntHud(zone.label);

  // trenér se napřáhne a hodí; ball opouští ruku na začátku snímku "throw"
  const tp = spritePlayers.get(trainerBox);
  playAction(trainerBox, 1);
  await wait(tp.sprite.releaseMs);

  const unit = arenaPixelSize();
  const tr = trainerBox.querySelector('.pokemon').getBoundingClientRect();
  const start = worldPoint(tr.left + TRAINER_RELEASE[0] / TRAINER_W * tr.width, tr.top + TRAINER_RELEASE[1] / TRAINER_H * tr.height);
  const monEl = enemyBox.querySelector('.pokemon');
  const er = monEl.getBoundingClientRect();
  const bb = spriteBBox(enemyBox) || { W: 96, H: 96, cx: 48, cy: 56 };
  const hit = worldPoint(er.left + bb.cx / bb.W * er.width, er.top + bb.cy / bb.H * er.height);
  const ground = worldPoint(0, enemyBox.getBoundingClientRect().bottom).y;

  const ball = document.createElement('div');
  ball.className = 'thrown-ball';
  const bc = pxBallCanvas(h.ball, 12);
  bc.style.width = bc.style.height = 12 * unit + 'px';
  ball.appendChild(bc);
  world.appendChild(ball);
  const place = (x, y, s = 1, rot = 0) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s}) rotate(${rot}deg)`;

  // let po oblouku (po krocích – retro), ball se vzdáleností zmenšuje
  const arc = [], N = 18, lift = 34 * unit;
  for (let i = 0; i <= N; i++){
    const t = i / N;
    arc.push({ transform: place(start.x + (hit.x - start.x) * t, start.y + (hit.y - start.y) * t - 4 * lift * t * (1 - t), 1.3 - 0.4 * t, t * 900) });
  }
  ball.style.transform = arc[N].transform;
  await ball.animate(arc, { duration: 620, easing: 'linear' }).finished;

  // zásah: ball odskočí, pokémon zbělá a zmizí v ballu
  beep(300, 0.12, 0.05, 'triangle');
  monEl.style.transformOrigin = `${bb.cx / bb.W * 100}% ${bb.cy / bb.H * 100}%`;
  hunt.absorb = [
    monEl.animate([
      { filter: 'brightness(1)', transform: 'scale(1)', opacity: 1 },
      { filter: 'brightness(6)', transform: 'scale(1)', opacity: 1, offset: 0.3 },
      { filter: 'brightness(6)', transform: 'scale(0)', opacity: 0 },
    ], { duration: 520, easing: 'ease-in', fill: 'forwards' }),
    enemyBox.querySelector('.shadow').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }),
  ];
  const up = hit.y - 10 * unit;
  ball.style.transform = place(hit.x - 4 * unit, up, 0.9, -20);
  await ball.animate([
    { transform: place(hit.x, hit.y, 0.9, 0) },
    { transform: place(hit.x - 4 * unit, up, 0.9, -20) },
  ], { duration: 520, easing: 'ease-out' }).finished;

  // pád na zem se dvěma odskoky
  const gx = hit.x - 4 * unit, gy = ground - 6 * unit;
  ball.style.transform = place(gx, gy, 0.9);
  await ball.animate([
    { transform: place(gx, up, 0.9), offset: 0 },
    { transform: place(gx, gy, 0.9), offset: 0.45, easing: 'ease-out' },
    { transform: place(gx, gy - 6 * unit, 0.9), offset: 0.65, easing: 'ease-in' },
    { transform: place(gx, gy, 0.9), offset: 0.82, easing: 'ease-out' },
    { transform: place(gx, gy - 2 * unit, 0.9), offset: 0.91, easing: 'ease-in' },
    { transform: place(gx, gy, 0.9), offset: 1 },
  ], { duration: 700, easing: 'ease-in' }).finished;
  beep(220, 0.05, 0.04, 'triangle');

  // zatřesení (1–3×) a výsledek
  const ok = Math.random() < catchChance(h, zone);
  const shakes = ok ? 3 : 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < shakes; i++){
    await wait(450);
    beep(180, 0.06, 0.04, 'triangle');
    await bc.animate([
      { transform: 'rotate(0)' }, { transform: 'rotate(-24deg)' }, { transform: 'rotate(20deg)' }, { transform: 'rotate(0)' },
    ], { duration: 420, easing: 'steps(6)' }).finished;
  }
  await wait(500);

  if (ok){
    bc.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(.55)' }], { duration: 200, fill: 'forwards' });
    beep(1400, 0.08, 0.05);
    jingle(Math.max(2, monRarity(h.id)));
    sparkleAt(ball, 12);
    const news = addToDex(h.id, h.shiny);
    const mon = addMon({ id: h.id, shiny: h.shiny, stars: h.stars || 1 });
    shop.hunts = shop.hunts.filter(x => x.uid !== h.uid);
    saveShop();
    toast(`Gotcha! ${NAMES[h.id - 1]} (${mon.stars}★, Lv ${mon.lvl}) je chycen${news === 'new' ? ' – nový v deníku!' : news === 'shiny' ? ' – nový shiny v deníku!' : '!'}`, h.shiny);
    renderHuntHud('Chyceno!');
    await wait(2200);
    endHunt();
  } else {
    // vysmekl se: záblesk, ball zmizí, pokémon vyskočí zpátky
    beep(500, 0.15, 0.05, 'sawtooth');
    ball.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: 0, filter: 'brightness(5)' }], { duration: 250, fill: 'forwards' })
      .finished.then(() => ball.remove());
    hunt.absorb.forEach(a => a.cancel());
    hunt.absorb = null;
    await monEl.animate([
      { filter: 'brightness(6)', transform: 'scale(0.2)', opacity: 0.6 },
      { filter: 'brightness(1)', transform: 'scale(1)', opacity: 1 },
    ], { duration: 320, easing: 'ease-out' }).finished;
    toast(`Ach ne! ${NAMES[h.id - 1]} se vysmekl!`);
    hunt.busy = false;
    renderHuntHud(`Vysmekl se! Zkus to znovu.<br>${BALL_TYPES[h.ball].name} · hod č. ${hunt.throws + 1}`);
    startRing();
  }
}

document.getElementById('throwBtn').addEventListener('click', throwBall);
document.getElementById('fleeBtn').addEventListener('click', () => {
  if (!hunt || hunt.busy) return;
  toast(`Utekl jsi. ${NAMES[hunt.h.id - 1]} na tebe počká v Lovech.`);
  endHunt();
});
// na mobilu stačí ťuknout kamkoliv do scény
shell.addEventListener('click', () => { if (hunt) throwBall(); });

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (hunt && (e.key === ' ' || e.key === 'Enter')){ e.preventDefault(); throwBall(); }
  if (e.key === 'Escape'){
    if (revealEl.classList.contains('open')) closeReveal();
    else if (!caseBusy) closeShop();
  }
  if ((e.key === 'o' || e.key === 'O') && !hunt) shopEl.classList.contains('open') ? closeShop() : openShop();
});

updateCoins();
