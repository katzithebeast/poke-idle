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

/* Pokébally = spotřební, na chytání (hod v ručním boji). Návnady = ruleta: padne STOPA
   vzácného pokémona, za kterým pak dojdeš do jeho arény, oslabíš ho a chytíš.
   Legendární pokémoni z návnad nepadají – ti jsou odměnou za Pány arén (boss.js). */
const CATCH_BALLS = {
  poke:   { price: 40,   catch: 1,        desc: 'Základní pokéball.' },
  great:  { price: 120,  catch: 1.5,      desc: 'Šance na chycení ×1,5.' },
  ultra:  { price: 350,  catch: 2,        desc: 'Šance na chycení ×2.' },
  master: { price: 6000, catch: Infinity, desc: 'Chytí vždy.' },
};
// návnady (dříve "pokébally" v ruletě): cena, šance na vzácnosti (%), shiny, kvalita 1–5 ★
const SHOP_BALLS = {
  poke:   { name: 'Návnada',            price: 100,  odds: [70, 24, 5, 1, 0],    shiny: 1 / 256, stars: [55, 30, 11, 3.5, 0.5], accent: '#e83a3a', tag: 'Pro začátek' },
  great:  { name: 'Lepší návnada',      price: 300,  odds: [38, 38, 18.5, 5.5, 0], shiny: 1 / 200, stars: [40, 33, 18, 7, 2],   accent: '#3a74d8', tag: 'Lepší šance' },
  ultra:  { name: 'Super návnada',      price: 800,  odds: [12, 30, 40, 18, 0],  shiny: 1 / 128, stars: [25, 33, 25, 12, 5],    accent: '#f2c230', tag: 'Pro sběratele' },
  master: { name: 'Mistrovská návnada', price: 2500, odds: [0, 0, 40, 60, 0],    shiny: 1 / 64,  stars: [0, 20, 40, 28, 12],    accent: '#a64ce8', tag: 'Jen to nejlepší' },
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
// ikona návnady: pixelová tlapka (stopa) v barvě návnady
const LURE_ICON = Object.fromEntries(Object.entries(SHOP_BALLS).map(([k, d]) => [k, pxIcon((x, y, dx, dy) => {
  const pal = [pxMixHex(d.accent, '#ffffff', 0.45), d.accent, pxMixHex(d.accent, '#000000', 0.45)];
  if (Math.hypot(dx, (dy - 2.2) * 1.15) < 3.4) return pxShade(pal, dx / 4, (dy - 2) / 4);          // polštářek
  for (const [tx, ty] of [[-3.6, -2], [-1.2, -4.2], [1.4, -4.2], [3.8, -2]]) if (Math.hypot(dx - tx, dy - ty) < 1.45) return pal[1];   // prsty
  return null;
}, 12).toDataURL()]));
const COIN_ICON = pxCoinCanvas(10).toDataURL();
document.querySelectorAll('img.coin').forEach(i => { i.src = COIN_ICON; });
const wait = ms => new Promise(r => setTimeout(r, ms));
const coinHtml = n => `<img class="coin" alt="" src="${COIN_ICON}">${n.toLocaleString('cs-CZ')}`;

/* ---------- Uložený stav ---------- */
const SHOP_KEY = 'pokeIdle.shop';
let shop = null;
try { shop = JSON.parse(localStorage.getItem(SHOP_KEY)); } catch {}
shop = { coins: 300, balls: {}, hunts: [], pity: 0, nextUid: 1, items: {}, upg: {}, lures: {}, ...(shop || {}) };
shop.items ||= {}; shop.upg ||= {}; shop.lures ||= {};
// převod ze staré verze: co se dřív kupovalo jako "pokéball" do rulety, je teď návnada
if (!shop.v2){
  for (const [k, n] of Object.entries(shop.balls || {})) shop.lures[k] = (shop.lures[k] || 0) + n;
  shop.balls = { poke: 5 };
  shop.v2 = true;
  try { localStorage.setItem(SHOP_KEY, JSON.stringify(shop)); } catch {}
}

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
      <button class="btn primary" data-hunt="${h.uid}"><img class="coin" alt="" src="${h.legend ? BALL_ICON.master : LURE_ICON[h.ball] || LURE_ICON.poke}">Vyrazit</button>
      ${h.legend ? '' : `<button class="btn" data-release="${h.uid}" title="Zahodit stopu a dostat mince zpět">Zahodit +${RELEASE_COINS[monRarity(h.id)]}</button>`}
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
    for (const [k, def] of Object.entries(CATCH_BALLS)){
      const n = shop.balls[k] || 0;
      html += `<div class="item-card">
        <img alt="" src="${BALL_ICON[k]}">
        <div class="ic-body">
          <div class="bc-head"><span class="bc-name">${BALL_TYPES[k].name}</span><span class="bc-price">${coinHtml(def.price)}</span></div>
          <div class="ic-desc">${def.desc}${n ? ` · máš ${n}×` : ''}</div>
          <div class="bc-actions"><button class="btn" data-cball="${k}" data-price="${def.price}">Koupit</button><button class="btn" data-cball="${k}" data-n="5" data-price="${def.price * 5}">×5</button></div>
        </div>
      </div>`;
    }
  } else if (shopTab === 'lures'){
    for (const [k, def] of Object.entries(SHOP_BALLS)){
      html += `<div class="ball-card" data-card="${k}">
        <div class="ball-show" style="--ac:${def.accent}"><span class="ball-tag">${def.tag}</span><img alt="" src="${LURE_ICON[k]}"></div>
        <div class="bc-body">
          <div class="bc-head"><span class="bc-name">${def.name}</span><span class="bc-price">${coinHtml(def.price)}</span></div>
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
    for (const k of Object.keys(CATCH_BALLS)) if (shop.balls[k]) html += `<div class="item-card"><img alt="" src="${BALL_ICON[k]}"><div class="ic-body"><div class="bc-head"><span class="bc-name">${BALL_TYPES[k].name}</span></div><div class="ic-desc">${shop.balls[k]}× · hází se v ručním boji</div></div></div>`;
    for (const k of Object.keys(SHOP_BALLS)){
      if (!shop.lures[k]) continue;
      html += `<div class="ball-card">
        <div class="ball-show" style="--ac:${SHOP_BALLS[k].accent}"><span class="ball-tag">${shop.lures[k]}× v batohu</span><img alt="" src="${LURE_ICON[k]}"></div>
        <div class="bc-body">
          <div class="bc-head"><span class="bc-name">${SHOP_BALLS[k].name}</span></div>
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
    html = shop.hunts.map(monCardHtml).join('') || '<div class="dm-empty">Žádná stopa. Otevři návnadu – nebo poraz Pána arény.</div>';
  }
  shopBody.innerHTML = html;
  shopPage = 0;
  applyShopPage();   // nová záložka vždy od začátku
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
  shopBody.querySelectorAll('[data-owned]').forEach(el => { const n = shop.lures[el.dataset.owned] || 0; el.textContent = n ? `V batohu: ${n}` : ''; });
  const bagN = [shop.balls, shop.lures, shop.items].reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b, 0), 0);
  shopEl.querySelectorAll('[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === shopTab);
    const n = b.dataset.tab === 'bag' ? bagN : b.dataset.tab === 'hunts' ? shop.hunts.length : 0;
    b.textContent = { buy: 'Pokébally', lures: 'Návnady', items: 'Předměty', upgrades: 'Vylepšení', bag: 'Batoh', hunts: 'Stopy' }[b.dataset.tab] + (n ? ` · ${n}` : '');
  });
}

/* DS: obchod po stránkách po 3 kartách – vidět je jen aktuální stránka (žádné posouvání,
   žádné useknuté karty), šipky ◀ ▶ ukazují, že je další nabídka. Přepíná D-pad ←→, šipky i tah prstem. */
let shopPage = 0;
const shopCards = () => [...shopBody.children].filter(el => !el.matches('.dm-section, .dm-empty'));
function shopPages(){ return Math.max(1, Math.ceil(shopCards().length / 3)); }
function applyShopPage(){
  const ds = document.body.classList.contains('ds'), cards = shopCards(), pages = shopPages();
  shopPage = Math.min(Math.max(0, shopPage), pages - 1);
  cards.forEach((c, i) => { c.hidden = ds && Math.floor(i / 3) !== shopPage; });
  shopBody.querySelectorAll('.pad-slot').forEach(p => p.remove());
  if (ds && pages > 1) for (let k = cards.slice(shopPage * 3, shopPage * 3 + 3).length; k < 3; k++) shopBody.insertAdjacentHTML('beforeend', '<div class="pad-slot"></div>');
  const navL = shopNav[0], navR = shopNav[1];
  navL.hidden = !ds || shopPage === 0;
  navR.hidden = !ds || shopPage >= pages - 1;
  // šipky po stranách uprostřed výšky karet
  for (const n of shopNav){ n.style.top = shopBody.offsetTop + 'px'; n.style.height = shopBody.offsetHeight + 'px'; }
}
function shopTurnPage(d){
  const pages = shopPages();
  if (!document.body.classList.contains('ds') || pages < 2 || shopPage + d < 0 || shopPage + d >= pages) return false;
  shopPage += d;
  applyShopPage();
  beep(900, 0.03, 0.02);
  return true;
}
// malé šedé pixelové šipky po stranách (CSS je tady, ať se styl a logika nerozejdou mezi verzemi)
const arrowImg = (() => {
  const c = document.createElement('canvas'); c.width = 6; c.height = 11;
  const g = c.getContext('2d');
  for (let y = 0; y < 11; y++){
    const w = 5 - Math.abs(y - 5);                  // trojúhelník ▶
    for (let x = 0; x <= w; x++){ g.fillStyle = x === w || y === 0 || y === 10 ? '#3c3c46' : '#9a9aa6'; g.fillRect(x, y, 1, 1); }
  }
  return c.toDataURL();
})();
document.head.insertAdjacentHTML('beforeend', `<style>
.shop-arrow{ all:unset; cursor:pointer; position:absolute; z-index:3; width:16px; display:flex; align-items:center; justify-content:center; -webkit-tap-highlight-color:transparent; }
.shop-arrow[hidden]{ display:none; }
.shop-arrow i{ width:9px; height:17px; background:url(${arrowImg}) center / 100% 100% no-repeat; image-rendering:pixelated; animation:arrowNudge 1.2s steps(2) infinite; }
.shop-arrow.l{ left:0; } .shop-arrow.l i{ transform:scaleX(-1); animation-name:arrowNudgeL; }
.shop-arrow.r{ right:0; }
@keyframes arrowNudge{ 50%{ translate:2px 0; } }
@keyframes arrowNudgeL{ 50%{ translate:-2px 0; } }
body.ds #shopBody{ padding-left:16px !important; padding-right:16px !important; }
body.ds .ball-card .ball-show{ flex:none; height:50px !important; }
body.theme-dark .hunt-hud{ --bg:var(--w-bg); --hi:transparent; --lo:transparent; background:var(--w-bg); color:var(--w-fg); box-shadow:none; filter:none; }
body.theme-dark .hunt-hud .hunt-sub{ color:var(--w-muted); }
body.theme-dark .hunt-hud .pbtn{ --bg:var(--w-card); --hi:transparent; --lo:transparent; --fg:#fff; box-shadow:none; }
body.theme-dark .hunt-hud .pbtn.red{ --bg:var(--gold); --fg:var(--ink); }
body.theme-dark .hunt-hud .rtag{ box-shadow:none; }
body.ds .ball-card .ball-show img{ width:34px !important; height:34px !important; margin-top:12px !important; }
body.ds .ball-card .bc-body{ gap:4px; padding:6px 7px 7px; }
body.ds .ball-card .odds{ gap:0; }
</style>`);
const shopNav = ['l', 'r'].map(side => {
  const b = document.createElement('button');
  b.className = 'shop-arrow ' + side;
  b.hidden = true;
  b.setAttribute('aria-label', side === 'l' ? 'Předchozí' : 'Další');
  b.innerHTML = '<i></i>';
  b.addEventListener('click', () => shopTurnPage(side === 'l' ? -1 : 1));
  shopBody.parentElement.appendChild(b);
  return b;
});
shopBody.parentElement.style.position = 'relative';
let swipeX = null;
shopBody.addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
shopBody.addEventListener('pointerup', (e) => {
  if (swipeX == null) return;
  const dx = e.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 40) shopTurnPage(dx < 0 ? 1 : -1);
});

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
    toast(`Na ${def.name} ti chybí ${(def.price - shop.coins).toLocaleString('cs-CZ')} mincí.`);
    return false;
  }
  shop.coins -= def.price;
  shop.lures[k] = (shop.lures[k] || 0) + 1;
  saveShop();
  updateCoins();
  replay('flash');
  [880, 1320].forEach((f, i) => beep(f, 0.07, 0.04, 'square', i * 0.07));
  return true;
}
shopBody.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.item || b.dataset.upg || b.dataset.cball){
    const price = Number(b.dataset.price), card = b.closest('.item-card');
    if (shop.coins < price){
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      beep(140, 0.12, 0.04, 'square');
      return toast(`Chybí ti ${(price - shop.coins).toLocaleString('cs-CZ')} mincí.`);
    }
    shop.coins -= price;
    if (b.dataset.cball) shop.balls[b.dataset.cball] = (shop.balls[b.dataset.cball] || 0) + Number(b.dataset.n || 1);
    else if (b.dataset.item) shop.items[b.dataset.item] = itemCount(b.dataset.item) + 1;
    else { shop.upg[b.dataset.upg] = upg(b.dataset.upg) + 1; toast(`${UPGRADES[b.dataset.upg].name}: úroveň ${upg(b.dataset.upg)}!`, true); }
    saveShop(); updateCoins();
    [880, 1320].forEach((f, i) => beep(f, 0.07, 0.04, 'square', i * 0.07));
    renderShop();
    return;
  }
  if (b.dataset.buy) buyBall(b.dataset.buy, b);
  else if (b.dataset.buyopen){ if (buyBall(b.dataset.buyopen, b)) openBall(b.dataset.buyopen); }
  else if (b.dataset.open) openBall(b.dataset.open);
  else if (b.dataset.hunt) startTrack(Number(b.dataset.hunt));
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
  if (caseBusy || !shop.lures[type]) return;
  caseBusy = true;
  shop.lures[type]--;
  gameEvent('lure');
  const res = rollMon(type);
  const rec = { uid: shop.nextUid++, id: res.id, shiny: res.shiny, ball: type, stars: 1 + rollRarity(SHOP_BALLS[type].stars) };
  shop.hunts.push(rec);
  saveShop();
  if (shopEl.classList.contains('open')) renderShop();

  const items = Array.from({ length: CASE_N }, (_, i) => i === CASE_WIN ? res : rollMon(type, false));
  caseStrip.style.transform = '';
  caseStrip.getAnimations().forEach(a => a.cancel());
  caseStrip.innerHTML = items.map(caseItemHtml).join('');
  document.getElementById('caseTitle').innerHTML = `<img alt="" src="${LURE_ICON[type]}">${SHOP_BALLS[type].name}: hledám stopu…`;
  caseActions.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'case-intro';
  intro.innerHTML = `<img alt="" src="${LURE_ICON[type]}">`;
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

let revealDone = null;      // showCatch čeká, až hráč oslavu zavře
/* oslava chycení: paprsky v barvě vzácnosti, velký animovaný sprite, hvězdy, level, typy, „Nový v deníku!“ */
function showCatch(mon, news, ball){
  const r = monRarity(mon.id), R = RARITIES[r];
  revealEl.style.setProperty('--rc', R.color);
  revealEl.classList.add('catch');
  revealCard.innerHTML = `
    <div class="reveal-head"><span class="rtag" style="--rc:${R.color}">${R.name}</span>${mon.shiny ? `<span class="rtag" style="--rc:var(--gold-lo)">${STAR} Shiny</span>` : ''}</div>
    <div class="reveal-stage" data-name="Gotcha! ${NAMES[mon.id - 1]} je chycen!"><img alt="" src="${spriteUrl(mon.id, { shiny: mon.shiny })}"></div>
    <div class="reveal-name">${mon.shiny ? STAR : ''}${NAMES[mon.id - 1]} <small>#${pad3(mon.id)} · Lv ${mon.lvl}</small></div>
    <div class="reveal-stars">${qstars(mon.stars || 1)}</div>
    <div class="reveal-types">${monTypes(mon.id).map(t => `<span class="type" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`).join('')}</div>
    <span class="reveal-badge ${news ? '' : 'old'}">${news === 'shiny' ? 'Nový shiny v deníku!' : news === 'new' ? 'Nový v deníku!' : 'Další kopie do sbírky'}</span>
    <div class="reveal-info"><img alt="" src="${BALL_ICON[ball]}" style="width:14px;height:14px;image-rendering:pixelated;vertical-align:-2px"> Chycen do: ${BALL_TYPES[ball].name}. Najdeš ho v Týmu.</div>
    <div class="case-actions"><button class="pbtn red" data-rv="ok">Super!</button></div>`;
  revealCard.querySelector('.reveal-stage').style.backgroundImage = `url(${pxSpotlight(R.color)})`;
  revealEl.classList.add('open');
  revealCard.style.animation = 'none'; void revealCard.offsetWidth; revealCard.style.animation = '';
  const st = revealCard.querySelector('.reveal-stage img');
  st.animate([{ transform: 'scale(.2)', filter: 'brightness(0) invert(1)' }, { transform: 'scale(1.1)', filter: 'brightness(0) invert(1)', offset: 0.6 }, { transform: 'scale(1)', filter: 'none' }],
    { duration: 650, easing: 'ease-out' });
  [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, i > 3 ? 0.2 : 0.1, 0.05, 'square', i * 0.11));
  if (mon.shiny || r === 4){
    const f = document.createElement('div');
    f.className = 'screen-flash';
    document.body.appendChild(f);
    f.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 600, easing: 'steps(6)' }).finished.then(() => f.remove());
  }
  confetti(R.color, 24 + r * 8);
  if (mon.shiny || news) sparkleAt(revealCard.querySelector('.reveal-stage'), mon.shiny ? 20 : 10);
  revealCard.onclick = (ev) => { if (ev.target.closest('[data-rv]')) closeReveal(); };
  return new Promise(res => { revealDone = res; });
}
document.head.insertAdjacentHTML('beforeend', `<style>
/* DS: oslava chycení – velký pokémon v záři přes celý horní displej, info dole */
body.ds .reveal.catch .reveal-stage{
  position:fixed; z-index:34; margin:0; background-size:cover;
  left:calc(var(--tx) / var(--dsk)); top:calc(var(--ty) / var(--dsk));
  width:calc(var(--tw) / var(--dsk)); height:calc(var(--th) / var(--dsk));
}
body.ds .reveal.catch .reveal-stage img{ height:66%; margin-bottom:9%; }
body.ds .reveal.catch .reveal-stage::after{
  content:attr(data-name); position:absolute; left:50%; top:10px; transform:translateX(-50%);
  font:700 16px var(--font-title); letter-spacing:.06em; color:#fff; text-shadow:var(--outline); white-space:nowrap;
}
body.ds .reveal.catch .reveal-card{ display:flex; flex-direction:column; justify-content:center; gap:6px; }
body.ds .reveal.catch .reveal-name{ font-size:20px; }
body.ds .reveal.catch .reveal-badge{ font-size:11px; align-self:center; }
</style>`);

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
    <div class="reveal-info">Stopa vede do arény ${ARENAS[habitatOf(rec.id)].name}.<br>Dojdi tam, oslab ho a chyť pokéballem.</div>
    <div class="case-actions">
      <button class="pbtn red" data-rv="hunt">Vyrazit po stopě</button>
      <button class="pbtn" data-rv="later">Uložit stopu</button>
      ${shop.lures[type] ? `<button class="pbtn" data-rv="again">Otevřít další (${shop.lures[type]})</button>` : ''}
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
    if (a === 'hunt') startTrack(rec.uid);
    else if (a === 'again') openBall(type);
    else if (shopEl.classList.contains('open')){ shopTab = 'hunts'; renderShop(); }
  };
}
function closeReveal(){
  revealEl.classList.remove('open', 'catch');
  const done = revealDone; revealDone = null; done?.();
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

// vzhled trenéra (Nastavení): originální Red zezadu, nebo vlastní pixelová postava
let trainerLook = 'red';
try { if (localStorage.getItem('pokeIdle.trainerLook') === 'pixel') trainerLook = 'pixel'; } catch {}
function setupTrainer(ballType){
  const red = trainerLook === 'red' && redBackSprite();
  trainerBox.dataset.half = red ? '1' : '';
  // vržený stín stejně jako u pokémonů (projectShadow z index.html), zem = nejnižší neprůhledný řádek
  const sprite = red || pxTrainerSprite(ballType, (d, W, H) => {
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

// šance na chycení: vzácnost × ball × hod × zbylé HP (oslabený = snáz) × stav (paralýza, zmrazení…)
function catchChance(h, zone){
  const def = CATCH_BALLS[h.ball];
  if (def.catch === Infinity) return 1;
  const hpF = 0.3 + 1.0 * (1 - Math.max(0, Math.min(1, h.hpFrac ?? 1)));
  return Math.min(0.97, CATCH_BASE[monRarity(h.id)] * def.catch * zone.mult * hpF * (h.statusBonus || 1) * (h.legend ? 0.5 : 1));
}
const ownedBalls = () => Object.keys(CATCH_BALLS).filter(k => shop.balls[k] > 0);

function renderHuntHud(msg){
  const h = hunt.h, R = RARITIES[monRarity(h.id)], n = shop.balls[h.ball] || 0;
  document.getElementById('huntTitle').innerHTML =
    `${h.shiny ? STAR : ''}${h.legend ? 'Legendární' : 'Divoký'} ${NAMES[h.id - 1]} <span class="rtag" style="--rc:${R.color}">${R.name}</span>`;
  document.getElementById('huntSub').innerHTML = (msg ? msg + '<br>' : '') +
    `HP ${Math.round((h.hpFrac ?? 1) * 100)} % · šance cca ${Math.round(catchChance(h, RING_ZONES[1]) * 100)} %<br>Hoď, když je kroužek co nejmenší.`;
  const bb = document.getElementById('ballPick');
  bb.innerHTML = `<img alt="" src="${BALL_ICON[h.ball]}">${BALL_TYPES[h.ball].name} ×${n}`;
  document.getElementById('throwBtn').disabled = hunt.busy || !n;
  document.getElementById('fleeBtn').disabled = hunt.busy;
  bb.disabled = hunt.busy || ownedBalls().length < 2;
}
function cycleBall(){
  if (!hunt || hunt.busy) return;
  const list = ownedBalls();
  if (list.length < 2) return;
  hunt.h.ball = list[(list.indexOf(hunt.h.ball) + 1) % list.length];
  setupTrainer(hunt.h.ball);
  renderHuntHud();
}

/* ---------- Chytací režim: z ručního boje (catchFromFight) ----------
   Trenér nastoupí místo pokémona, hází pokébally (každý hod = 1 ball).
   Chyceno / utekl → konec setkání. "Zpět do boje" → vrátí pokémona a pokračuje se v boji. */
async function startCatch(info){
  if (hunt || bossFight) return;
  const balls = ownedBalls();
  if (!balls.length){ toast('Nemáš žádné pokébally – kup je v Obchodě.'); return; }
  closePanel(); closeTeam(); closeShop(); closeJournal();
  hunt = { h: { ...info, ball: balls.includes(info.ball) ? info.ball : balls[0] }, busy: true, throws: 0, absorb: null };
  document.body.classList.add('hunting');
  await fadeTo(1);
  playerBox.hidden = true;
  setupTrainer(hunt.h.ball);
  trainerBox.hidden = false;
  applyMon(trainerBox);
  huntHud.classList.add('open');
  renderHuntHud();
  await fadeTo(0);
  hunt.busy = false;
  renderHuntHud();
  startRing();
}
async function endCatch(result){
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
  hunt = null;
  document.body.classList.remove('hunting');
  if (result === 'back') setMonSprite(enemyBox, battle.enemy);     // zpět do boje se stejným soupeřem
  await finishCatch?.(result);                                        // manual.js: konec setkání / návrat do boje
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
  const h = hunt.h;
  if (!(shop.balls[h.ball] > 0)) return toast('Došly ti pokébally tohoto typu.');
  hunt.busy = true;
  shop.balls[h.ball]--;
  saveShop();
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
  const rel = tp.sprite.release || TRAINER_RELEASE;
  const start = worldPoint(tr.left + rel[0] / tp.sprite.W * tr.width, tr.top + rel[1] / tp.sprite.H * tr.height);
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
    const mon = addMon({ id: h.id, shiny: h.shiny, stars: h.stars || 1, lvl: h.lvl });
    gameEvent('catch', { id: h.id, shiny: h.shiny });
    if (h.track) shop.hunts = shop.hunts.filter(x => x.uid !== h.track);
    saveShop();
    renderHuntHud('Chyceno!');
    await wait(1100);
    await showCatch(mon, news, h.ball);
    endCatch('caught');
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
    // divoký může po vysmeknutí utéct (stopa i legenda ne – ty zůstanou v seznamu)
    if (!h.track && Math.random() < 0.15){
      await wait(500);
      toast(`${NAMES[h.id - 1]} utekl!`);
      await wait(700);
      return endCatch('fled');
    }
    hunt.busy = false;
    if (!shop.balls[h.ball] && ownedBalls().length) h.ball = ownedBalls()[0], setupTrainer(h.ball);
    renderHuntHud('Vysmekl se!' + (ownedBalls().length ? '' : ' Došly ti pokébally.'));
    startRing();
  }
}

document.getElementById('throwBtn').addEventListener('click', throwBall);
document.getElementById('fleeBtn').addEventListener('click', () => {
  if (!hunt || hunt.busy) return;
  endCatch('back');
});
document.getElementById('ballPick').addEventListener('click', cycleBall);
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
