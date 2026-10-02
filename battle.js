/* =====================================================================
   Souboj: idle boj s HP, typy a XP, HP lišty se jmény, divocí pokémoni
   podle arény a odemykání arén
   ---------------------------------------------------------------------
   Oba pokémoni útočí sami; kdo je rychlejší, útočí častěji. Poškození počítá
   zjednodušený vzorec z originálních her (level, útok/obrana, typ, STAB).
   Když tvůj pokémon omdlí, boj stojí, dokud nepošleš dalšího (panel Tým).
   ===================================================================== */

// arény od nejlehčí po nejtěžší: rozsah levelů divokých pokémonů
const ARENA_ORDER = ['ocean', 'desert', 'jungle', 'mountain', 'grave', 'storm', 'volcano', 'nether', 'fel', 'aether'];
const ARENA_LEVELS = {
  ocean: [2, 6], desert: [5, 12], jungle: [10, 20], mountain: [18, 30], grave: [27, 40],
  storm: [37, 50], volcano: [47, 60], nether: [57, 72], fel: [68, 85], aether: [80, 100],
};
const BOSS_WINS = 15;                   // po tolika výhrách v aréně tě vyzve Pán arény; jeho porážka odemkne další arénu
// vzácnost divokých podle pořadí arény (legendární jen z pokéballů); v prvních arénách
// se navíc přimíchají pokémoni odjinud, ať se startér nezasekne na nevýhodném typu
const WILD_RARITY = [[90, 10, 0, 0, 0], [75, 22, 3, 0, 0], [62, 28, 9, 1, 0], [55, 30, 12, 3, 0], [45, 35, 16, 4, 0]];
const WILD_MIX = [0.4, 0.3, 0.2, 0.1];
const WILD_STAT = 0.75;                 // divocí jsou slabší (v originálu nemají trénink ani IV)
const ATTACK_POWER = 50, STAB = 1.5, CRIT = 1 / 16;
const DAMAGE_SCALE = 0.4;               // ztlumené poškození → souboj trvá ~8 zásahů (s typovou výhodou ~4)
const MISS = 0.07;                      // šance, že útok mine
const REWARD_MULT = 2.5;                // delší souboje = větší odměna za jeden (tempo postupu zůstává)
const TURN_MS = 1300;                   // základní pauza mezi útoky (upraví ji rychlost)
var bossFight = null;                   // probíhající souboj s Pánem arény (boss.js)

const PROGRESS_KEY = 'pokeIdle.progress';
let progress = null;
try { progress = JSON.parse(localStorage.getItem(PROGRESS_KEY)); } catch {}
progress = { wins: {}, bosses: {}, lastSeen: 0, ...(progress || {}) };
progress.bosses ||= {};
// ze starší verze (arény se odemykaly 25 výhrami): kdo to už splnil, má bosse za sebou
for (const [k, n] of Object.entries(progress.wins)) if (n >= 25) progress.bosses[k] = true;
function saveProgress(){ try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {} }

function arenaLocked(key){
  const i = ARENA_ORDER.indexOf(key);
  return i > 0 && !progress.bosses[ARENA_ORDER[i - 1]];
}

// kdo kde žije (podle typu, viz habitatOf v shop.js), bez legendárních
const MONS_BY_HABITAT = {};
for (let id = 1; id <= DEX_MAX; id++){
  if (monRarity(id) === 4) continue;
  (MONS_BY_HABITAT[habitatOf(id)] ||= []).push(id);
}

const ALL_WILD = Object.values(MONS_BY_HABITAT).flat();
const wildStats = (id, lvl) => {
  const s = monStats({ id, lvl, stars: 1 });
  for (const k in s) s[k] = Math.max(1, Math.floor(s[k] * WILD_STAT));
  return s;
};
function wildMon(key = arena){
  const [a, b] = ARENA_LEVELS[key] || [2, 10];
  const tier = Math.max(0, ARENA_ORDER.indexOf(key));
  const r = rollRarity(WILD_RARITY[Math.min(tier, WILD_RARITY.length - 1)]);
  const all = Math.random() < (WILD_MIX[tier] || 0) ? ALL_WILD : (MONS_BY_HABITAT[key] || ALL_WILD);
  const pool = all.filter(id => monRarity(id) === r);
  const list = pool.length ? pool : all;
  const id = list[Math.floor(Math.random() * list.length)];
  // level podle tvého pokémona (±2), ale v rozsahu arény – když arénu přerosteš, je čas jít dál
  const pl = activeMon()?.lvl ?? a;
  const lvl = Math.min(b, Math.max(a, pl - 2 + Math.floor(Math.random() * 4)));
  return { id, shiny: Math.random() < SHINY_CHANCE, lvl, hp: wildStats(id, lvl).hp };
}
const enemyStats = () => wildStats(battle.enemy.id, battle.enemy.lvl);

/* ---------- Poškození ---------- */
function hitDamage(att, attSt, def, defSt, mult = 1){
  const defTypes = monTypes(def.id);
  let type = null, eff = -1;
  for (const t of monTypes(att.id)){ const e = typeEffect(t, defTypes); if (e > eff){ eff = e; type = t; } }
  if (Math.random() < MISS) return { dmg: 0, eff: 1, crit: false, type, miss: true };
  const crit = Math.random() < CRIT;
  const base = (2 * att.lvl / 5 + 2) * ATTACK_POWER * attSt.atk / Math.max(1, defSt.def) / 50 + 2;
  const dmg = eff === 0 ? 0 : Math.max(1, Math.floor(base * STAB * eff * DAMAGE_SCALE * mult * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15)));
  return { dmg, eff, crit, type };
}
const turnGap = (me, them) => TURN_MS * Math.min(1.7, Math.max(0.6, Math.sqrt(Math.max(1, them.spe) / Math.max(1, me.spe))));

/* ---------- Auto boj ---------- */
const $ = id => document.getElementById(id);
const AUTO_KEY = 'pokeIdle.auto';
let autoOn = true;
try { autoOn = localStorage.getItem(AUTO_KEY) !== '0'; } catch {}
const autoBtn = document.getElementById('autoBtn');
function updateAutoBtn(){
  setRow(autoBtn, 'Auto boj', autoOn ? 'zap' : 'vyp', autoOn);
  $('playerInfo').classList.toggle('paused', !autoOn);
}
autoBtn.addEventListener('click', () => {
  autoOn = !autoOn;
  try { localStorage.setItem(AUTO_KEY, autoOn ? '1' : '0'); } catch {}
  updateAutoBtn();
});
updateAutoBtn();

function canFight(){
  const p = activeMon();
  return autoOn && !hunt && !bossFight && !document.hidden && p && p.hp > 0 && !p.fainted && battle.enemy.hp > 0
    && Number(playerBox.dataset.id) === p.id
    && monState.get(playerBox) === 'idle' && monState.get(enemyBox) === 'idle';
}

let nextP = null, nextE = null, stuckSince = 0;
async function battleLoop(){
  for (;;){
    await wait(100);
    renderBattleHud();
    // pojistka: soupeř s 0 HP, který neomdlívá (např. po lovu/bossovi zrušený příchod nového) → nový soupeř
    if (battle.enemy.hp <= 0 && !hunt && !bossFight && monState.get(enemyBox) === 'idle'){
      if (!stuckSince) stuckSince = performance.now();
      else if (performance.now() - stuckSince > 1200){ stuckSince = 0; spawnEnemy(); }
    } else stuckSince = 0;
    if (!canFight()){ nextP = nextE = null; continue; }
    const p = activeMon(), pSt = monStats(p), eSt = enemyStats(), now = performance.now();
    if (nextP == null){ nextP = now + 500; nextE = now + 500 + turnGap(eSt, pSt) * 0.6; }
    const playerTurn = nextP <= nextE;
    if (now < (playerTurn ? nextP : nextE)) continue;
    if (playerTurn){
      await doAttack(playerBox, enemyBox, p, pSt, battle.enemy, eSt);
      nextP = performance.now() + turnGap(pSt, eSt);
    } else {
      await doAttack(enemyBox, playerBox, battle.enemy, eSt, p, pSt);
      nextE = performance.now() + turnGap(eSt, pSt);
    }
  }
}

// zásah s čísly a hláškami nad zasaženým (sdílí i boss.js)
function showHit(dBox, res){
  if (res.miss){ floatText(dBox, 'Vedle!', 'eff'); beep(140, 0.05, 0.02, 'triangle'); return; }
  floatText(dBox, res.dmg ? '-' + res.dmg : '0', 'dmg' + (res.crit ? ' crit' : ''));
  if (res.eff > 1) floatText(dBox, 'Velmi účinné!', 'eff up');
  else if (res.eff === 0) floatText(dBox, 'Bez účinku…', 'eff');
  else if (res.eff < 1) floatText(dBox, 'Neúčinné…', 'eff');
  if (res.crit) floatText(dBox, 'Kritický zásah!', 'eff up');
  beep(res.eff > 1 ? 260 : 200, 0.06, 0.03, 'square');
}
async function doAttack(aBox, dBox, att, attSt, def, defSt){
  let res = null;
  await attack(aBox, () => {
    res = hitDamage(att, attSt, def, defSt);
    if (!res.miss) def.hp = def.hp - res.dmg < 1 ? 0 : def.hp - res.dmg;
    showHit(dBox, res);
    renderBattleHud();
    return !res.miss;
  });
  if (!res) return;
  if (dBox === enemyBox) saveBattle(); else saveParty();
  if (def.hp > 0) return;
  await wait(250);
  if (hunt) return;
  if (dBox === enemyBox) faint(enemyBox);   // → onEnemyDefeated → rewardDefeat
  else playerFainted();
}

function playerFainted(){
  const m = activeMon();
  m.fainted = true;
  m.hp = 0;
  m.t = Date.now();
  saveParty();
  faint(playerBox);
  beep(330, 0.12, 0.05, 'square'); beep(220, 0.2, 0.05, 'square', 0.12);
  const ready = party.team.map(monByUid).filter(x => x && !x.fainted);
  // vylepšení Automatická výměna: nastoupí další zdravý z týmu
  if (upg('swap') && ready.length){
    toast(`${NAMES[m.id - 1]} omdlel! Nastupuje ${NAMES[ready[0].id - 1]}.`);
    setTimeout(() => { if (!hunt && activeMon() === m) sendMon(ready[0].uid); }, 1400);
    return;
  }
  toast(`${NAMES[m.id - 1]} omdlel! ${ready.length ? 'Pošli dalšího z Týmu.' : 'Celý tým se léčí…'}`);
}

// odměna za výhru: mince, XP (i pro tým), přátelství, odpočinek, výhra v aréně.
// Bez efektů, ať jde použít i pro dopočítání postupu, když hra neběžela (live = false).
// XP jako v Gen 5: za slabší soupeře výrazně méně (přirozený strop – je čas jít do další arény)
const xpLevelFactor = (e, p) => ((2 * e + 10) / (e + p + 10)) ** 2.5;
function applyWin(e, live, mult = 1){
  const r = monRarity(e.id), p = activeMon();
  const coins = Math.round((8 + 6 * r * r) * (1 + e.lvl / 10) * (e.shiny ? 5 : 1) * (0.85 + Math.random() * 0.3) * (1 + 0.1 * upg('coins')) * REWARD_MULT * mult);
  shop.coins += coins;
  let xp = 0, ups = 0;
  if (p){
    xp = Math.max(1, Math.round(e.lvl * (8 + 4 * r) * xpLevelFactor(e.lvl, p.lvl) * (1 + 0.1 * upg('xp')) * REWARD_MULT * mult));
    ups = giveXp(p, xp);
    p.friend = (p.friend || 0) + 2;
    for (const m of party.team.map(monByUid)) if (m && m !== p && !m.fainted){
      giveXp(m, Math.round(xp * TEAM_XP_SHARE));
      m.friend = (m.friend || 0) + 1;
    }
    p.hp = Math.min(monStats(p).hp, p.hp + monStats(p).hp * WIN_HEAL);
  }
  progress.wins[arena] = (progress.wins[arena] || 0) + 1;
  if (live){ saveShop(); saveParty(); saveProgress(); }
  return { coins, xp, ups };
}
// odměna za poraženého soupeře na scéně (volá onEnemyDefeated v index.html)
function rewardDefeat(box){
  const { coins, ups } = applyWin(battle.enemy, true);
  updateCoins();
  floatText(box, '+' + coins);
  const p = activeMon();
  if (!p) return;
  for (const m of party.team.map(monByUid)) if (m) checkEvoReady(m);
  if (ups){
    floatText(playerBox, `Lv ${p.lvl}!`, 'lvl');
    toast(`${NAMES[p.id - 1]} je teď na levelu ${p.lvl}!`);
    [523, 659, 784].forEach((f, i) => beep(f, 0.1, 0.05, 'square', i * 0.08));
  }
  if (progress.wins[arena] === BOSS_WINS && !progress.bosses[arena]) toast(`Pán arény ${ARENAS[arena].name} tě vyzývá!`, true);
  decorateArenaMenu();
  updateBossCall?.();
}

/* ---------- HP lišty se jmény (jako v Black/White) ---------- */
const hud = { shown: {} };
function setBar(el, p){
  el.style.width = Math.max(0, Math.min(1, p)) * 100 + '%';
  el.className = hpClass(p);
}
function renderBattleHud(){
  const e = bossFight || battle.enemy, p = activeMon();
  if (e?.lvl){
    const key = `${e.id}|${e.shiny}|${e.lvl}|${!!bossFight}`;
    if (hud.shown.e !== key){
      hud.shown.e = key;
      $('eiName').innerHTML = (bossFight ? '<span class="bi-boss">Pán arény</span>' : '') + (e.shiny ? STAR : '') + NAMES[e.id - 1];
      $('eiLv').textContent = 'Lv' + e.lvl;
      $('eiRar').style.background = RARITIES[monRarity(e.id)].color;
    }
    setBar($('eiHp'), e.hp / (bossFight ? bossFight.maxHp : enemyStats().hp));
  }
  if (p){
    const s = monStats(p);
    const key = `${p.uid}|${p.lvl}`;
    if (hud.shown.p !== key){
      hud.shown.p = key;
      $('piName').innerHTML = (p.shiny ? STAR : '') + NAMES[p.id - 1];
      $('piStars').innerHTML = qstars(p.stars);
      $('piLv').textContent = 'Lv' + p.lvl;
    }
    setBar($('piHp'), p.hp / s.hp);
    $('piNums').textContent = `${Math.ceil(p.hp)}/${s.hp}`;
    $('piXp').style.width = (p.lvl >= 100 ? 100 : p.xp / xpToNext(p.lvl) * 100) + '%';
    $('playerInfo').classList.toggle('down', !!p.fainted);
    $('playerInfo').classList.toggle('danger', !p.fainted && p.hp / s.hp <= 0.2);
  }
}
$('piTeamBtn').addEventListener('click', openTeam);

// cedulky se životy visí nad hlavou pokémona (podle neprůhledné části spritu)
const bboxCache = new WeakMap();
function visibleTop(box){
  const el = box.querySelector('.pokemon'), r = el.getBoundingClientRect();
  const sp = spritePlayers.get(box);
  if (!sp) return { x: r.left + r.width / 2, y: r.top + r.height * 0.2 };
  let bb = bboxCache.get(sp.sprite);
  if (!bb){
    const { W, H, data, idle } = sp.sprite, d = data[idle[0]];
    let x0 = W, x1 = 0, y0 = H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 127){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
    bb = { cx: (x0 + x1 + 1) / 2 / W, top: y0 / H };
    bboxCache.set(sp.sprite, bb);
  }
  return { x: r.left + bb.cx * r.width, y: r.top + bb.top * r.height };
}
function placePlates(){
  for (const [plate, box] of [[$('enemyInfo'), enemyBox], [$('playerInfo'), playerBox]]){
    if (box.hidden || hunt){ plate.style.left = '-999px'; continue; }
    const cs = getComputedStyle(document.documentElement);
    const p = visibleTop(box), k = parseFloat(cs.getPropertyValue('--pz')) || parseFloat(cs.getPropertyValue('--zoom')) || 1;
    const sr = shell.getBoundingClientRect();   // v DS rozložení = horní displej
    const w = plate.offsetWidth * k / 2 + 6, h = plate.offsetHeight * k + 8;
    plate.style.left = Math.min(sr.right - w, Math.max(sr.left + w, p.x)) + 'px';
    plate.style.top = Math.max(sr.top + h, p.y - 10 * k) + 'px';
  }
  requestAnimationFrame(placePlates);
}
requestAnimationFrame(placePlates);

/* ---------- Menu arén: levely a zámky ---------- */
function decorateArenaMenu(){
  const first = arenaMenu.querySelector('.effects-title');
  for (const k of ARENA_ORDER){
    const b = arenaMenu.querySelector(`.arena-opt[data-arena="${k}"]`);
    if (!b) continue;
    arenaMenu.insertBefore(b, first);
    const locked = arenaLocked(k), i = ARENA_ORDER.indexOf(k);
    b.classList.toggle('locked', locked);
    let sub = b.querySelector('small');
    if (!sub){ sub = document.createElement('small'); b.lastElementChild.append(document.createElement('br'), sub); }
    sub.textContent = locked
      ? `Zamčeno · poraz Pána arény ${ARENAS[ARENA_ORDER[i - 1]].name}`
      : `Lv ${ARENA_LEVELS[k].join('–')} · výher ${progress.wins[k] || 0} · ${progress.bosses[k] ? 'Pán arény poražen ✓' : `Pán arény ${Math.min(BOSS_WINS, progress.wins[k] || 0)}/${BOSS_WINS}`}`;
  }
}
decorateArenaMenu();

/* ---------- Start ---------- */
// zamčená aréna z dřívějška → zpátky do první
if (arenaLocked(arena)) showArena(ARENA_ORDER[0]);
// soupeř ze staré verze (bez levelu, nebo legendární, který divoce nežije) → nový divoký z arény
if (!battle.enemy.lvl || monRarity(battle.enemy.id) === 4){
  battle.enemy = wildMon();
  saveBattle();
  setMonSprite(enemyBox, battle.enemy);
}
// hráčův pokémon na scéně = aktivní jedinec z týmu
healTick();
{
  const p = activeMon() || party.mons[0];
  party.active = p.uid;
  if (Number(playerBox.dataset.id) !== p.id || !!playerBox.dataset.shiny !== p.shiny){
    battle.player = { id: p.id, shiny: p.shiny, uid: p.uid };
    saveBattle();
    setMonSprite(playerBox, battle.player);
  }
  if (p.fainted) faint(playerBox);
}
battleLoop();
