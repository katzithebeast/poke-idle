/* =====================================================================
   Pán arény – aktivní souboj s bossem
   ---------------------------------------------------------------------
   Po BOSS_WINS výhrách v aréně tě vyzve její pán (silný pokémon ve stylu
   arény). Na rozdíl od idle boje útočíš ty: ukazatel jezdí po liště a čím
   blíž středu ho zastavíš, tím silnější zásah. Boss útočí sám.
   Výhra = velká odměna + odemčení další arény. Prohra = zkusíš to znovu.
   ===================================================================== */

const BOSSES = {
  ocean:    { id: 55,  title: 'Vládce vln' },        // Golduck
  desert:   { id: 112, title: 'Strážce dun' },       // Rhydon
  jungle:   { id: 168, title: 'Královna pavouků' },  // Ariados
  mountain: { id: 460, title: 'Duch velehor' },      // Abomasnow
  grave:    { id: 94,  title: 'Pán stínů' },         // Gengar
  storm:    { id: 149, title: 'Drak bouře' },        // Dragonite
  volcano:  { id: 6,   title: 'Plamen kráteru' },    // Charizard
  nether:   { id: 65,  title: 'Mistr mysli' },       // Alakazam
  fel:      { id: 448, title: 'Ocelový bojovník' },  // Lucario
  aether:   { id: 384, title: 'Nebeský drak' },      // Rayquaza
};
// vyladěno simulací: na stejném levelu vyhraješ zhruba v polovině případů,
// o 5 levelů výš nebo se správným typem skoro vždy (pozdější bossové chtějí silný tým)
const BOSS_HP = 2.5;        // boss vydrží 2,5× víc
const BOSS_STARS = 1;
const BOSS_LEVEL_UP = 0;    // level = maximum arény
const BOSS_DMG = 0.5;       // síla jeho útoků
const BOSS_SLOW = 1.3;      // a útočí o něco pomaleji
const TIMING_MS = 1100;     // jedna jízda ukazatele tam a zpět
const TIMING = [
  { max: 0.08, mult: 1.6, label: 'Perfektní!' },
  { max: 0.22, mult: 1.15, label: 'Dobrý zásah' },
  { max: 1.01, mult: 0.6, label: 'Slabý zásah' },
];

const bossCall = document.getElementById('bossCall');
const bossHud = document.getElementById('bossHud');
const bossBtn = document.getElementById('bossAttack');
const bossMarker = document.getElementById('bossMarker');
const bossCd = document.getElementById('bossCd');
const bossMsg = document.getElementById('bossMsg');

const bossAvailable = () => !progress.bosses[arena] && (progress.wins[arena] || 0) >= BOSS_WINS && !!BOSSES[arena];
function updateBossCall(){
  const b = BOSSES[arena];
  bossCall.hidden = !bossAvailable() || !!bossFight || !!hunt;
  if (b) bossCall.querySelector('span').textContent = `${b.title}: ${NAMES[b.id - 1]} tě vyzývá`;
}

async function startBoss(){
  if (bossFight || hunt || !bossAvailable()) return;
  const p = activeMon();
  if (!p || p.fainted) return toast('Nejdřív pošli do boje zdravého pokémona (Tým).');
  closePanel(); closeTeam(); closeShop(); closeJournal();
  const def = BOSSES[arena], lvl = Math.min(100, ARENA_LEVELS[arena][1] + BOSS_LEVEL_UP);
  const st = monStats({ id: def.id, lvl, stars: BOSS_STARS });
  bossFight = { arena, id: def.id, shiny: false, lvl, st, maxHp: st.hp * BOSS_HP, hp: st.hp * BOSS_HP, cdUntil: 0, busy: false, over: false };
  document.body.classList.add('bossing');
  bossCall.hidden = true;
  await fadeTo(1);
  clearTimeout(enemyBox._spawnTimer);
  (enemyBox._faintAnims || []).forEach(a => a.cancel());
  enemyBox._faintAnims = null;
  setMonSprite(enemyBox, { id: def.id, shiny: false });
  setState(enemyBox, 'idle');
  bossMsg.textContent = 'Zastav ukazatel uprostřed (mezerník / klik)';
  bossHud.classList.add('open');
  await fadeTo(0);
  toast(`${def.title} ${NAMES[def.id - 1]} (Lv ${lvl}) přijímá výzvu!`, true);
  [392, 523, 659].forEach((f, i) => beep(f, 0.14, 0.05, 'square', i * 0.12));
  requestAnimationFrame(bossTick);
  bossAi();
}

// ukazatel jezdí tam a zpět; cooldown lišta podle rychlosti tvého pokémona
function markerPos(now){ const t = (now % TIMING_MS) / TIMING_MS; return t < 0.5 ? t * 2 : 2 - t * 2; }
function bossTick(now){
  if (!bossFight) return;
  bossMarker.style.left = markerPos(now) * 100 + '%';
  const left = Math.max(0, bossFight.cdUntil - performance.now());
  bossCd.style.width = (bossFight.cdTotal ? left / bossFight.cdTotal : 0) * 100 + '%';
  bossBtn.disabled = left > 0 || bossFight.busy || bossFight.over || monState.get(playerBox) !== 'idle';
  renderBattleHud();
  requestAnimationFrame(bossTick);
}

async function bossPlayerAttack(){
  const b = bossFight;
  if (!b || b.busy || b.over || performance.now() < b.cdUntil || monState.get(playerBox) !== 'idle') return;
  const p = activeMon();
  if (!p || p.fainted) return;
  const off = Math.abs(markerPos(performance.now()) - 0.5) * 2;   // 0 = střed
  const zone = TIMING.find(z => off <= z.max);
  bossMsg.textContent = zone.label;
  b.busy = true;
  const pSt = monStats(p);
  let res = null;
  await attack(playerBox, () => {
    res = hitDamage(p, pSt, b, b.st, zone.mult);
    if (!res.miss) b.hp = Math.max(0, b.hp - res.dmg);
    showHit(enemyBox, res);
    return !res.miss;
  });
  b.busy = false;
  b.cdTotal = turnGap(pSt, b.st) * 0.9;
  b.cdUntil = performance.now() + b.cdTotal;
  if (b.hp <= 0 && !b.over) bossWon();
}

async function bossAi(){
  const b = bossFight;
  await wait(1600);
  while (bossFight === b && !b.over){
    const p = activeMon();
    await wait(turnGap(b.st, monStats(p)) * BOSS_SLOW);
    if (bossFight !== b || b.over) return;
    while (b.busy || monState.get(enemyBox) !== 'idle' || monState.get(playerBox) === 'attack') await wait(80);
    const pSt = monStats(p);
    await attack(enemyBox, () => {
      const res = hitDamage(b, b.st, p, pSt, BOSS_DMG);
      if (!res.miss) p.hp = p.hp - res.dmg < 1 ? 0 : p.hp - res.dmg;
      showHit(playerBox, res);
      return !res.miss;
    });
    saveParty();
    if (p.hp <= 0 && !b.over){ bossLost(p); return; }
  }
}

async function bossWon(){
  const b = bossFight;
  b.over = true;
  bossBtn.disabled = true;
  await wait(250);
  faint(enemyBox);   // onEnemyDefeated se při bossovi přeskočí
  const tier = ARENA_ORDER.indexOf(b.arena);
  const coins = Math.round(400 * (tier + 1) * (1 + 0.1 * upg('coins')));
  const stones = Object.keys(EVO_ITEMS).filter(k => k.endsWith('-stone'));
  const stone = stones[Math.floor(Math.random() * stones.length)];
  const ball = tier >= 7 ? 'master' : tier >= 3 ? 'ultra' : 'great';
  shop.coins += coins;
  shop.items[stone] = (shop.items[stone] || 0) + 1;
  shop.balls[ball] = (shop.balls[ball] || 0) + 1;
  const p = activeMon();
  if (p){ giveXp(p, Math.round(b.lvl * 60 * (1 + 0.1 * upg('xp')))); p.friend = (p.friend || 0) + 20; checkEvoReady(p); }
  progress.bosses[b.arena] = true;
  saveShop(); saveParty(); saveProgress();
  updateCoins();
  jingle(4);
  bossMsg.textContent = 'Vítězství!';
  toast(`Porazil jsi Pána arény! +${coins.toLocaleString('cs-CZ')} mincí, ${EVO_ITEMS[stone]}, ${BALL_TYPES[ball].name}`, true);
  const next = ARENA_ORDER[tier + 1];
  if (next) setTimeout(() => toast(`Odemčena nová aréna: ${ARENAS[next].name} (Lv ${ARENA_LEVELS[next].join('–')})!`, true), 1600);
  decorateArenaMenu();
  await wait(2600);
  endBoss();
}

async function bossLost(p){
  const b = bossFight;
  b.over = true;
  playerFainted();
  bossMsg.textContent = 'Prohra…';
  toast(`${NAMES[b.id - 1]} tě tentokrát porazil. Potrénuj a zkus to znovu!`);
  await wait(2200);
  endBoss();
}

async function endBoss(){
  if (!bossFight) return;
  bossHud.classList.remove('open');
  await fadeTo(1);
  bossFight = null;
  document.body.classList.remove('bossing');
  (enemyBox._faintAnims || []).forEach(a => a.cancel());
  enemyBox._faintAnims = null;
  setMonSprite(enemyBox, battle.enemy);
  setState(enemyBox, 'idle');
  hud.shown.e = null;
  updateBossCall();
  await fadeTo(0);
}

bossCall.querySelector('button').addEventListener('click', startBoss);
bossBtn.addEventListener('click', bossPlayerAttack);
document.getElementById('bossFlee').addEventListener('click', () => {
  if (!bossFight || bossFight.over) return;
  bossFight.over = true;
  toast('Utekl jsi. Pán arény na tebe počká.');
  endBoss();
});
document.addEventListener('keydown', (e) => {
  if (!bossFight || e.target.matches('input')) return;
  if (e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); bossPlayerAttack(); }
});
// na mobilu stačí ťuknout do scény
shell.addEventListener('click', () => { if (bossFight) bossPlayerAttack(); });
updateBossCall();
