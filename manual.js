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

/* ---------- Stav souboje (bojovníci: hráčův pokémon P a soupeř E) ---------- */
let fightKey = null;
const P = { side: 'p', ep: 0, st: {} }, E = { side: 'e', ep: 0, st: {} };
let turnBusy = false, nextEnemyMove = null;
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
  if (!alive(E)){ E.mon.hp = 0; say(`${nameOf(E)} byl poražen!`); await wait(300); faint(enemyBox); }    // → onEnemyDefeated → odměna s bonusem
  else if (!alive(P)){ P.mon.hp = 0; say(`${nameOf(P)} omdlel!`); playerFainted(); }
  else {
    gainEp(E, 1);
    if (P.st.foresight){ nextEnemyMove = enemyChoose(); say(`Předtucha: soupeř chystá ${moveLabel(nextEnemyMove)}.`); }
    else say('Co uděláš?');
  }
  turnBusy = false;
  renderManual();
}

/* ---------- Panel s akcemi (DS: spodní displej, jinak dole uprostřed) ---------- */
let lastMsg = 'Co uděláš?';
function say(t){ lastMsg = t; const m = manualPanel.querySelector('.mp-msg'); if (m) m.textContent = t; }
const stTags = X => Object.keys(X.st).filter(k => STATUS[k]).map(k =>
  `<span class="mp-st ${STATUS[k].bad ? 'bad' : 'good'}">${STATUS[k].name}${k === 'poison' && X.st.poisonStack > 1 ? ' ×' + X.st.poisonStack : ''}</span>`).join('');
function renderManual(){
  const on = manualActive() || (turnBusy && !autoOn);
  document.body.classList.toggle('manual', on);
  if (!on) return;
  syncFight();
  const sp = specialsOf(P), t = typesOf(P);
  const btn = (key, label, sub, cls, ok, title) =>
    `<button class="mp-btn ${cls}" data-mp="${key}" ${ok && !turnBusy ? '' : 'disabled'} title="${title || ''}"><b>${label}</b><small>${sub}</small><i>${key === 'attack' ? 'A' : key === 'guard' ? 'B' : key === 'special1' ? 'X' : 'Y'}</i></button>`;
  const s2 = sp[1] ? btn('special2', sp[1].name, `${sp[1].cost} EP · ${t[1]}`, 'sp', P.ep >= sp[1].cost, sp[1].desc)
    : btn('special2', t[1] ? 'Zamčeno' : '—', t[1] ? `${SPECIALS[t[1]].name} od Lv ${SPECIAL2_LVL}` : 'jen jeden typ', 'sp off', false);
  manualPanel.innerHTML = `
    <div class="mp-msg">${lastMsg}</div>
    <div class="mp-row"><span class="mp-who">${NAMES[P.mon.id - 1]}</span>
      <span class="mp-ep">${Array.from({ length: EP_MAX }, (_, i) => `<i class="${i < P.ep ? 'on' : ''}"></i>`).join('')}</span><span class="mp-epn">${P.ep} EP</span></div>
    <div class="mp-row mp-sts">${stTags(P) || '<span class="mp-none">bez stavů</span>'}<span class="mp-vs">soupeř:</span>${stTags(E) || '<span class="mp-none">—</span>'}</div>
    <div class="mp-grid">
      ${btn('attack', 'Útok', '+1 EP', 'atk', true)}
      ${btn('special1', sp[0].name, `${sp[0].cost} EP · ${t[0]}`, 'sp', P.ep >= sp[0].cost, sp[0].desc)}
      ${s2}
      ${btn('guard', 'Krytí', '−60 % · +2 EP', 'grd', true)}
    </div>`;
}
manualPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mp]');
  if (b && !b.disabled) takeTurn(b.dataset.mp);
});
// klávesnice (PC): A útok, X/Y speciály, B krytí – jen když není otevřené okno
document.addEventListener('keydown', (e) => {
  if (!manualActive() || e.target.matches('input') || document.querySelector('.dm.open, .journal.open, .pop.open')) return;
  const k = { a: 'attack', x: 'special1', y: 'special2', b: 'guard' }[e.key.toLowerCase()];
  if (k){ e.preventDefault(); takeTurn(k); }
});
setInterval(() => { if (!turnBusy) renderManual(); }, 500);
renderManual();
