/* =====================================================================
   Ruční tahový souboj (jako v originálních hrách) + speciály podle typu
   ---------------------------------------------------------------------
   SELECT / Auto boj vyp = ruční režim. Každé kolo vybereš akci:
     A Útok (+1 energie, kritický +2) · X Speciál 1 · Y Speciál 2 (dvojtypoví od Lv 20)
     B Krytí (−60 % poškození v tomto kole, +2 energie, jedná vždy první)
   Kdo je rychlejší, jedná první; soupeř volí taky (útok / svůj speciál).
   Speciály stojí energii (EP, max 10) a dávají stavy: popálení, otrava, paralýza,
   zmrazení, mokrý, prokletí, okouzlení, štít, železná obrana, úhyb, předtucha.
   Kombinace: Mokrý + elektrický útok ×1,5 · Zmražený + bojový/ocelový ×2 (roztříštění).
   Ruční výhra = +50 % mincí a XP.
   ===================================================================== */

const EP_MAX = 10, SPECIAL2_LVL = 20, MANUAL_BONUS = 1.5;

// speciál pro každý typ: cena v EP, popis, provedení (A = útočník, D = obránce, viz fight())
const SPECIALS = {
  normal:   { name: 'Rychlý útok',     cost: 2, desc: 'zaútočí vždy první', priority: true, run: (A, D) => hit(A, D, 0.8) },
  fire:     { name: 'Popálení',        cost: 3, desc: 'zásah + popálení na 3 kola', run: async (A, D) => { if (await hit(A, D, 0.6)) addStatus(D, 'burn', 3); } },
  water:    { name: 'Léčivá vlna',     cost: 3, desc: 'vyléčí 25 %, smyje stavy, soupeř zmokne', run: async (A, D) => { heal(A, 0.25); cleanse(A); addStatus(D, 'wet', 2); } },
  grass:    { name: 'Pijavice',        cost: 3, desc: 'zásah, vyléčí polovinu poškození', run: async (A, D) => { const d = await hit(A, D, 0.9); if (d) heal(A, d / 2 / maxHp(A)); } },
  electric: { name: 'Paralýza',        cost: 3, desc: 'zásah + paralýza (pomalejší, občas nejedná)', run: async (A, D) => { if (await hit(A, D, 0.5)) addStatus(D, 'para', 3); } },
  ice:      { name: 'Zmrazení',        cost: 4, desc: 'zásah, 70 % šance zmrazit (vynechá tah)', run: async (A, D) => { if (await hit(A, D, 0.5) && Math.random() < 0.7) addStatus(D, 'frozen', 1); } },
  fighting: { name: 'Kombo',           cost: 4, desc: '3 rychlé zásahy', run: async (A, D) => { for (let i = 0; i < 3 && alive(D); i++) await hit(A, D, 0.45); } },
  poison:   { name: 'Otrava',          cost: 3, desc: 'zásah + jed (sčítá se až 3×)', run: async (A, D) => { if (await hit(A, D, 0.4)) addStatus(D, 'poison', 4, true); } },
  ground:   { name: 'Zemětřesení',     cost: 4, desc: 'silný zásah, ignoruje obranu a krytí', run: (A, D) => hit(A, D, 1.1, { pierce: true }) },
  flying:   { name: 'Úhyb',            cost: 2, desc: 'další útok soupeře mine', run: async (A) => addStatus(A, 'dodge', 1) },
  psychic:  { name: 'Předtucha',       cost: 3, desc: '+30 % poškození na 3 kola, ukáže tah soupeře', run: async (A) => addStatus(A, 'foresight', 3) },
  bug:      { name: 'Roj',             cost: 3, desc: '5 slabých zásahů (rozbije štít)', run: async (A, D) => { for (let i = 0; i < 5 && alive(D); i++) await hit(A, D, 0.25, { quick: true }); } },
  rock:     { name: 'Kamenná kůže',    cost: 3, desc: 'štít pohltí 2 zásahy', run: async (A) => addStatus(A, 'shield', 2) },
  ghost:    { name: 'Prokletí',        cost: 3, desc: 'soupeř dostává o 25 % víc (3 kola), zdvojí jed', run: async (A, D) => { addStatus(D, 'curse', 3); if (D.st.poison) D.st.poisonStack = Math.min(6, (D.st.poisonStack || 1) * 2); } },
  dragon:   { name: 'Dračí hněv',      cost: 5, desc: 'obří zásah', run: (A, D) => hit(A, D, 1.8) },
  dark:     { name: 'Úskok',           cost: 3, desc: 'zásah, ukradne soupeřovy posily, +1 EP', run: async (A, D) => { await hit(A, D, 0.7); steal(A, D); gainEp(A, 1); } },
  steel:    { name: 'Železná obrana',  cost: 3, desc: '+50 % obrany na 3 kola', run: async (A) => addStatus(A, 'iron', 3) },
  fairy:    { name: 'Okouzlení',       cost: 3, desc: 'soupeř −30 % útoku na 3 kola, občas zaváhá', run: async (A, D) => addStatus(D, 'charm', 3) },
};
const STATUS = {
  burn: { name: 'popálený', bad: true }, poison: { name: 'otrávený', bad: true }, para: { name: 'paralyzovaný', bad: true },
  frozen: { name: 'zmražený', bad: true }, wet: { name: 'mokrý', bad: true }, curse: { name: 'prokletý', bad: true },
  charm: { name: 'okouzlený', bad: true }, shield: { name: 'štít', bad: false }, iron: { name: 'železná obrana', bad: false },
  dodge: { name: 'úhyb', bad: false }, foresight: { name: 'předtucha', bad: false }, guard: { name: 'krytí', bad: false },
};


/* ---------- Vzhled (CSS je tady, ať se styl a logika nikdy nerozejdou mezi verzemi) ---------- */
document.head.insertAdjacentHTML('beforeend', `<style>
.manual-panel{
  position:fixed; left:50%; bottom:16px; z-index:45; transform:translateX(-50%);
  display:none; flex-direction:column; gap:6px; box-sizing:border-box;
  width:min(440px, calc(100vw - 24px)); height:330px; padding:10px 12px 10px;
  color:var(--w-fg); background:var(--w-bg); box-shadow:var(--w-frame);
  font-family:var(--font-body); -webkit-font-smoothing:none; zoom:var(--zoom, 1);
}
body.manual .manual-panel{ display:flex; }
body.manual-wait:not(.ds) .manual-panel{ display:flex; height:auto; padding:6px; }
.mp-start{ all:unset; cursor:pointer; text-align:center; padding:12px; font:700 13px var(--font-title); color:#fff; background:#e85a3a; }
body.ds .manual-panel{
  zoom:var(--dsk); transform:none; box-shadow:none;
  left:calc(var(--bx) / var(--dsk)); top:calc(var(--by) / var(--dsk)); bottom:auto;
  width:calc(var(--bw) / var(--dsk)); height:calc(var(--bh) / var(--dsk));
}
body.ds.manual #dsPanel{ visibility:hidden; }
.mp-msg{ font:13px var(--font-body); min-height:34px; padding:6px 8px; background:var(--w-card); line-height:1.3; }
.mp-row{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.mp-who{ font:700 10px var(--font-title); }
.mp-ep{ display:flex; gap:2px; }
.mp-ep i{ width:8px; height:6px; background:var(--w-track); }
.mp-ep i.on{ background:#5ab0ff; }
.mp-epn{ font:700 9px var(--font-title); color:#5ab0ff; }
.mp-sts{ display:flex; gap:4px; flex-wrap:wrap; margin-left:auto; align-items:center; }
.mp-st{ font:700 8px var(--font-title); text-transform:uppercase; padding:2px 4px 1px; }
.mp-st.bad{ background:#7a2430; color:#ffd0d0; } .mp-st.good{ background:#2a5a3a; color:#d0ffd8; }
.mp-vs{ color:var(--w-muted); font-size:9px; margin-left:4px; }
/* kosočtverec přesně jako na konzoli: tlačítka v pravidelné mřížce (stejné rozestupy),
   popisky jsou mimo mřížku (absolutně), takže rozložení tlačítek neposouvají */
.mp-pad{ flex:1; min-height:0; position:relative; }
.mp-key{ all:unset; cursor:pointer; position:absolute; width:52px; height:52px; margin:-26px 0 0 -26px; -webkit-tap-highlight-color:transparent; }
.k-x{ left:50%; top:20%; } .k-b{ left:50%; top:80%; }
.k-y{ left:calc(50% - 60px); top:50%; } .k-a{ left:calc(50% + 60px); top:50%; }
.mp-lbl{ position:absolute; top:50%; transform:translateY(-50%); left:calc(100% + 8px); }
.k-y .mp-lbl{ left:auto; right:calc(100% + 8px); text-align:right; align-items:flex-end; }
.mp-ball{
  width:52px; height:52px; display:flex; align-items:center; justify-content:center;
  background:center / 100% 100% no-repeat; image-rendering:pixelated;
  font:700 19px var(--font-title); color:#ececf2; text-shadow:0 2px 0 #000;
}
.mp-key:active .mp-ball, .mp-key.ds-focus .mp-ball{ filter:brightness(1.35); }
.mp-key.ds-focus{ outline:none !important; }
.mp-key.ds-focus .mp-ball{ box-shadow:0 0 0 3px var(--gold); border-radius:50%; }
.mp-lbl{ display:flex; flex-direction:column; gap:2px; }
.mp-lbl b{ font:700 13px var(--font-title); white-space:nowrap; letter-spacing:.03em; }
.mp-lbl small{ font:700 9px var(--font-title); color:var(--w-muted); white-space:nowrap; text-transform:uppercase; }
.k-a .mp-lbl b{ color:#ff8a6a; } .k-b .mp-lbl b{ color:#7ae08a; } .k-x .mp-lbl b, .k-y .mp-lbl b{ color:#7ab8ff; }
.mp-key:disabled{ opacity:.35; cursor:default; }
.mp-foot{ display:flex; justify-content:space-between; }
.mp-side{ all:unset; cursor:pointer; font:700 9px var(--font-title); text-transform:uppercase; color:var(--w-muted); padding:3px 4px; }
.mp-side:disabled{ opacity:.35; }
.dsp-fight{ background:#e85a3a !important; color:#fff !important; animation:none !important; }
</style>`);

/* ---------- Stav souboje (bojovníci: hráčův pokémon P a soupeř E) ---------- */
let fightKey = null;
const P = { side: 'p', ep: 0, st: {} }, E = { side: 'e', ep: 0, st: {} };
let turnBusy = false, nextEnemyMove = null;
// ruční režim: soupeř čeká, souboj se otevře až tlačítkem "Bojovat"; po výhře/prohře zpět do menu
let fightOpen = false;
const manualPanel = document.getElementById('manualPanel');

const manualActive = () => !autoOn && !hunt && !bossFight && !!activeMon() && !activeMon().fainted && activeMon().hp >= 1 && battle.enemy?.hp >= 1;
function syncFight(){
  if (!battle.enemy._k) battle.enemy._k = Date.now() + Math.random();   // nový soupeř = nové EP a stavy
  if (fightKey !== battle.enemy._k){ fightKey = battle.enemy._k; E.ep = 0; E.st = {}; nextEnemyMove = null; }
  const p = activeMon();
  if (P.uid !== p?.uid){ P.uid = p?.uid; P.ep = 0; P.st = {}; }
  P.mon = p; P.box = playerBox; E.mon = battle.enemy; E.box = enemyBox;
}
const isPlayer = X => X.side === 'p';
const nameOf = X => (isPlayer(X) ? '' : 'Divoký ') + NAMES[X.mon.id - 1];
const statsOf = X => isPlayer(X) ? monStats(X.mon) : wildStats(X.mon.id, X.mon.lvl);
const maxHp = X => statsOf(X).hp;
const alive = X => X.mon.hp >= 1;   // pod 1 HP = omdlel (HP může být desetinné po léčení)
const other = X => X === P ? E : P;
const typesOf = X => monTypes(X.mon.id);
function specialsOf(X){
  const t = typesOf(X), list = [SPECIALS[t[0]]];
  if (t[1] && (!isPlayer(X) || X.mon.lvl >= SPECIAL2_LVL)) list.push(SPECIALS[t[1]]);
  return list;
}
function gainEp(X, n){ X.ep = Math.min(EP_MAX, X.ep + n); }
function addStatus(X, k, n, stack){
  if (k === 'poison' && stack) X.st.poisonStack = Math.min(3, (X.st.poisonStack || 0) + 1);
  X.st[k] = Math.max(X.st[k] || 0, n);
  floatText(X.box, STATUS[k].name + '!', STATUS[k].bad ? 'eff' : 'eff up');
}
function cleanse(X){ for (const k of Object.keys(X.st)) if (STATUS[k]?.bad) delete X.st[k]; delete X.st.poisonStack; }
function steal(A, D){
  for (const k of ['shield', 'iron', 'dodge', 'foresight']) if (D.st[k]){ A.st[k] = D.st[k]; delete D.st[k]; }
}
function heal(X, frac){
  const max = maxHp(X), before = X.mon.hp;
  X.mon.hp = Math.min(max, X.mon.hp + max * frac);
  const n = Math.round(X.mon.hp - before);
  if (n > 0) floatText(X.box, '+' + n, 'lvl');
  glow(X.box, '#7aff8a');
}
function glow(box, color){
  box.querySelector('.anim').animate([{ filter: 'none' }, { filter: `drop-shadow(0 0 8px ${color}) brightness(1.4)` }, { filter: 'none' }], { duration: 500, easing: 'steps(4)' });
}
async function waitIdle(box){ for (let i = 0; i < 30 && monState.get(box) !== 'idle'; i++) await wait(60); }

/* ---------- Zásah se všemi modifikátory; vrací způsobené poškození ---------- */
async function hit(A, D, mult, o = {}){
  if (!alive(A) || !alive(D)) return 0;
  await waitIdle(A.box);
  let dealt = 0;
  await attack(A.box, () => {
    if (D.st.dodge && !o.pierce){ delete D.st.dodge; showHit(D.box, { miss: true }); return false; }
    let m = mult * (A.st.foresight ? 1.3 : 1) * (A.st.charm ? 0.7 : 1) * (D.st.curse ? 1.25 : 1);
    if (!o.pierce) m *= (D.st.guard ? 0.4 : 1) / (D.st.iron ? 1.5 : 1);
    const res = hitDamage(A.mon, statsOf(A), D.mon, statsOf(D), m);
    if (res.miss){ showHit(D.box, res); return false; }
    if (D.st.wet && res.type === 'electric'){ res.dmg = Math.round(res.dmg * 1.5); floatText(D.box, 'Vodivost!', 'eff up'); }
    if (D.st.frozen && (res.type === 'fighting' || res.type === 'steel')){ res.dmg *= 2; delete D.st.frozen; floatText(D.box, 'Roztříštění!', 'eff up'); }
    if (D.st.shield){ D.st.shield--; if (!D.st.shield) delete D.st.shield; floatText(D.box, 'Štít!', 'eff'); return false; }
    D.mon.hp = D.mon.hp - res.dmg < 1 ? 0 : D.mon.hp - res.dmg;
    dealt = res.dmg;
    showHit(D.box, res);
    if (!o.quick) gainEp(A, res.crit ? 2 : 1);
    return true;
  });
  await wait(o.quick ? 120 : 250);
  return dealt;
}

/* ---------- Kolo ---------- */
function enemyChoose(){
  const sp = specialsOf(E).filter(s => s.cost <= E.ep);
  const low = E.mon.hp / maxHp(E) < 0.35;
  const defensive = sp.find(s => ['Léčivá vlna', 'Kamenná kůže', 'Železná obrana', 'Úhyb'].includes(s.name));
  if (low && defensive) return { kind: 'special', sp: defensive };
  if (sp.length && Math.random() < 0.45) return { kind: 'special', sp: sp[Math.floor(Math.random() * sp.length)] };
  if (Math.random() < 0.08) return { kind: 'guard' };
  return { kind: 'attack' };
}
function moveLabel(m){ return m.kind === 'special' ? m.sp.name : m.kind === 'guard' ? 'Krytí' : 'Útok'; }

async function act(X, move){
  const D = other(X);
  if (!alive(X)) return;
  if (X.st.frozen){ delete X.st.frozen; say(`${nameOf(X)} je zmražený a nemůže jednat!`); floatText(X.box, 'zmražený', 'eff'); await wait(700); return; }
  if (X.st.para && Math.random() < 0.25){ say(`${nameOf(X)} je paralyzovaný!`); floatText(X.box, 'paralýza', 'eff'); await wait(700); return; }
  if (X.st.charm && Math.random() < 0.2){ say(`${nameOf(X)} zaváhal…`); floatText(X.box, 'zaváhal', 'eff'); await wait(700); return; }
  if (move.kind === 'guard'){ say(`${nameOf(X)} se kryje.`); return; }
  if (move.kind === 'attack'){ say(`${nameOf(X)} útočí!`); await hit(X, D, 1); return; }
  X.ep -= move.sp.cost;
  say(`${nameOf(X)} použil ${move.sp.name}!`);
  await move.sp.run(X, D);
}

async function endOfTurn(){
  for (const X of [P, E]){
    if (!alive(X)) continue;
    const max = maxHp(X);
    const dot = (X.st.burn ? max / 12 : 0) + (X.st.poison ? max / 16 * (X.st.poisonStack || 1) : 0);
    if (dot){
      const n = Math.max(1, Math.round(dot));
      X.mon.hp = X.mon.hp - n < 1 ? 0 : X.mon.hp - n;
      floatText(X.box, '-' + n, 'dmg');
      glow(X.box, X.st.burn ? '#ff7a3a' : '#c060f0');
    }
    for (const k of Object.keys(X.st)){
      if (k === 'poisonStack' || k === 'shield' || k === 'dodge' || k === 'frozen') continue;
      if (--X.st[k] <= 0){ delete X.st[k]; if (k === 'poison') delete X.st.poisonStack; }
    }
    delete X.st.guard;
  }
}

async function takeTurn(choice){
  if (turnBusy || !manualActive()) return;
  syncFight();
  const p = P.mon, mine = choice === 'attack' ? { kind: 'attack' } : choice === 'guard' ? { kind: 'guard' }
    : { kind: 'special', sp: specialsOf(P)[choice === 'special2' ? 1 : 0] };
  if (mine.kind === 'special' && (!mine.sp || mine.sp.cost > P.ep)) return beep(150, 0.05, 0.03, 'triangle');
  turnBusy = true;
  renderManual();
  const theirs = nextEnemyMove || enemyChoose();
  nextEnemyMove = null;
  if (mine.kind === 'guard'){ P.st.guard = 1; gainEp(P, 2); }
  if (theirs.kind === 'guard') E.st.guard = 1;
  // pořadí: krytí a Rychlý útok vždy první, jinak rychlost (paralýza ji půlí)
  const spd = X => statsOf(X).spe * (X.st.para ? 0.5 : 1);
  const prio = m => m.kind === 'guard' || m.sp?.priority ? 1 : 0;
  const pFirst = prio(mine) !== prio(theirs) ? prio(mine) > prio(theirs) : spd(P) !== spd(E) ? spd(P) > spd(E) : Math.random() < 0.5;
  for (const [X, m] of pFirst ? [[P, mine], [E, theirs]] : [[E, theirs], [P, mine]]){
    await act(X, m);
    renderManual();
    if (!alive(P) || !alive(E)) break;
  }
  if (alive(P) && alive(E)) await endOfTurn();
  saveParty(); saveBattle();
  if (!alive(E)){ E.mon.hp = 0; say(`${nameOf(E)} byl poražen!`); await wait(300); faint(enemyBox); await wait(900); closeFight(); }    // → onEnemyDefeated → odměna s bonusem
  else if (!alive(P)){ P.mon.hp = 0; say(`${nameOf(P)} omdlel!`); playerFainted(); await wait(900); closeFight(); }
  else {
    gainEp(E, 1);
    if (P.st.foresight){ nextEnemyMove = enemyChoose(); say(`Předtucha: soupeř chystá ${moveLabel(nextEnemyMove)}.`); }
    else say('Co uděláš?');
  }
  turnBusy = false;
  renderManual();
}

/* ---------- Otevření / zavření souboje ---------- */
const fightReady = () => manualActive() && !fightOpen;
function openFight(){
  if (!manualActive()) return;
  syncFight();
  fightOpen = true;
  lastMsg = `Divoký ${NAMES[battle.enemy.id - 1]} (Lv ${battle.enemy.lvl}) se postavil do cesty! Co uděláš?`;
  renderManual();
}
function closeFight(){ fightOpen = false; renderManual(); }
function fleeFight(){
  if (turnBusy) return;
  toast(`Utekl jsi před ${NAMES[battle.enemy.id - 1]}.`);
  fightOpen = false;
  spawnEnemy();
  renderManual();
}

/* ---------- Panel s akcemi: pixelová tlačítka jako na konzoli (X nahoře, Y vlevo, A vpravo, B dole) ---------- */
let lastMsg = 'Co uděláš?';
function say(t){ lastMsg = t; const m = manualPanel.querySelector('.mp-msg'); if (m) m.textContent = t; }
const stTags = X => Object.keys(X.st).filter(k => STATUS[k]).map(k =>
  `<span class="mp-st ${STATUS[k].bad ? 'bad' : 'good'}">${STATUS[k].name}${k === 'poison' && X.st.poisonStack > 1 ? ' ×' + X.st.poisonStack : ''}</span>`).join('');
// kulaté pixelové tlačítko (tmavé jako na kabátku), písmeno se kreslí přes něj
const BTN_IMG = (() => {
  const c = document.createElement('canvas'), n = 26, r = n / 2;
  c.width = c.height = n;
  const g = c.getContext('2d');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
    const dx = x + .5 - r, dy = y + .5 - r, d = Math.hypot(dx, dy);
    if (d > r - .1) continue;
    g.fillStyle = d > r - 1.2 ? '#050507' : d > r - 2.2 ? (dy < 0 ? '#5a5a66' : '#2a2a30') : pxShade(['#4a4a54', '#26262c', '#18181c'], dx / r, dy / r, 0.75, 0.15);
    g.fillRect(x, y, 1, 1);
  }
  return c.toDataURL();
})();
function renderManual(){
  const on = fightOpen && (manualActive() || turnBusy) && !autoOn;
  if (fightOpen && !on && !turnBusy) fightOpen = false;
  document.body.classList.toggle('manual', on);
  document.body.classList.toggle('manual-wait', !on && fightReady());
  if (!on){ manualPanel.innerHTML = fightReady() ? `<button class="mp-start" data-mp="open">⚔ Bojovat: ${NAMES[battle.enemy.id - 1]} Lv ${battle.enemy.lvl}</button>` : ''; return; }
  syncFight();
  const sp = specialsOf(P), t = typesOf(P);
  const btn = (key, letter, label, sub, ok, title) =>
    `<button class="mp-key k-${letter.toLowerCase()}" data-mp="${key}" ${ok && !turnBusy ? '' : 'disabled'} title="${title || ''}">
      <span class="mp-ball" style="background-image:url(${BTN_IMG})">${letter}</span>
      <span class="mp-lbl"><b>${label}</b><small>${sub}</small></span></button>`;
  const s1 = btn('special1', 'X', sp[0].name, `${sp[0].cost} EP`, P.ep >= sp[0].cost, sp[0].desc);
  const s2 = sp[1] ? btn('special2', 'Y', sp[1].name, `${sp[1].cost} EP`, P.ep >= sp[1].cost, sp[1].desc)
    : btn('special2', 'Y', t[1] ? SPECIALS[t[1]].name : '—', t[1] ? `od Lv ${SPECIAL2_LVL}` : 'jen 1 typ', false);
  manualPanel.innerHTML = `
    <div class="mp-msg">${lastMsg}</div>
    <div class="mp-row"><span class="mp-who">${NAMES[P.mon.id - 1]}</span>
      <span class="mp-ep">${Array.from({ length: EP_MAX }, (_, i) => `<i class="${i < P.ep ? 'on' : ''}"></i>`).join('')}</span><span class="mp-epn">${P.ep} EP</span>
      <span class="mp-sts">${stTags(P)}${Object.keys(E.st).some(k => STATUS[k]) ? `<span class="mp-vs">soupeř</span>${stTags(E)}` : ''}</span></div>
    <div class="mp-pad">
      ${s1}${s2}
      ${btn('attack', 'A', 'Útok', '+1 EP', true)}
      ${btn('guard', 'B', 'Krytí', '−60 % · +2 EP', true)}
    </div>
    <div class="mp-foot">
      <button class="mp-side" data-mp="flee" ${turnBusy ? 'disabled' : ''}>◂ Utéct</button>
      <button class="mp-side" data-mp="menu" ${turnBusy ? 'disabled' : ''}>Menu · START ▸</button>
    </div>`;
}
manualPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mp]');
  if (!b || b.disabled) return;
  const k = b.dataset.mp;
  if (k === 'open') openFight();
  else if (k === 'menu') closeFight();
  else if (k === 'flee') fleeFight();
  else takeTurn(k);
});
// klávesnice (PC): A útok, X/Y speciály, B krytí – jen když není otevřené okno
document.addEventListener('keydown', (e) => {
  if (!fightOpen || !manualActive() || e.target.matches('input') || document.querySelector('.dm.open, .journal.open, .pop.open')) return;
  const k = { a: 'attack', x: 'special1', y: 'special2', b: 'guard' }[e.key.toLowerCase()];
  if (k){ e.preventDefault(); takeTurn(k); }
});
setInterval(() => { if (!turnBusy) renderManual(); }, 500);
renderManual();
