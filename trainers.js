/* =====================================================================
   Trenéři Team Rocket – výzvy 1v1 (ruční boj s týmem 2–3 pokémonů)
   ---------------------------------------------------------------------
   Po výhrách občas přijde výzva (banner na spodním displeji / dole na PC).
   Přijmeš → postupně porazíš jejich pokémony (cizí chytit nejde).
   Výhra = mince, návnada a předmět. Útěk = prohra, výzva zmizí.
   Výzva počká ~3 minuty, idle boj mezitím běží dál.
   ===================================================================== */

const TRAINERS = [
  { name: 'Jessie', title: 'Team Rocket', team: [23, 108, 202, 24, 52] },     // Ekans, Lickitung, Wobbuffet, Arbok, Meowth
  { name: 'James', title: 'Team Rocket', team: [109, 70, 52, 110, 71] },      // Koffing, Weepinbell, Meowth, Weezing, Victreebel
  { name: 'Raketák', title: 'Team Rocket', team: [19, 41, 88, 20, 42, 89] },  // Rattata, Zubat, Grimer, Raticate, Golbat, Muk
  { name: 'Butch', title: 'Team Rocket', team: [216, 228, 229, 217] },        // Teddiursa, Houndour, Houndoom, Ursaring
  { name: 'Cassidy', title: 'Team Rocket', team: [88, 261, 262, 89] },        // Grimer, Poochyena, Mightyena, Muk
];
const CHALLENGE_CHANCE = 0.06, CHALLENGE_MS = 3 * 60e3, CHALLENGE_MIN_WINS = 8;
let winsSinceChallenge = 0;
const trainerCall = document.createElement('div');
trainerCall.className = 'boss-call trainer-call';
trainerCall.hidden = true;
trainerCall.innerHTML = '<span></span><button class="btn primary">Přijmout</button>';
document.body.appendChild(trainerCall);

function challengeActive(){ return battle.challenge && Date.now() < battle.challenge.until; }
function maybeChallenge(){
  if (battle.enemy.trainer || battle.enemy.track || bossFight || hunt || challengeActive()) return;
  if (++winsSinceChallenge < CHALLENGE_MIN_WINS || Math.random() > CHALLENGE_CHANCE) return;
  winsSinceChallenge = 0;
  const t = Math.floor(Math.random() * TRAINERS.length);
  battle.challenge = { t, until: Date.now() + CHALLENGE_MS };
  saveBattle();
  toast(`${TRAINERS[t].title} ${TRAINERS[t].name} tě vyzývá k souboji!`, true);
  [392, 330, 392, 494].forEach((f, i) => beep(f, 0.12, 0.05, 'square', i * 0.11));
  updateTrainerCall();
}
function updateTrainerCall(){
  if (battle.challenge && !challengeActive()){ delete battle.challenge; saveBattle(); }
  const on = challengeActive() && !battle.enemy.trainer && !hunt && !bossFight;
  const t = on && TRAINERS[battle.challenge.t];
  trainerCall.hidden = !on || document.body.classList.contains('ds');
  if (t) trainerCall.querySelector('span').textContent = `${t.title} ${t.name} tě vyzývá`;
  const ds = document.getElementById('dspTrainer');
  if (ds){
    ds.hidden = !on;
    if (t) ds.innerHTML = `<b>☠ ${t.title} ${t.name}</b> tě vyzývá · přijmout`;
  }
}

async function startTrainer(){
  if (!challengeActive() || hunt || bossFight || battle.enemy.track || battle.enemy.trainer) return;
  if (!activeMon() || activeMon().fainted) return toast('Nejdřív pošli do boje zdravého pokémona (Tým).');
  closeShop(); closeTeam(); closeJournal(); closePanel();
  const tr = TRAINERS[battle.challenge.t], [a, b] = ARENA_LEVELS[arena];
  const size = 2 + (ARENA_ORDER.indexOf(arena) >= 3 ? 1 : 0);
  const pool = [...tr.team].sort(() => Math.random() - 0.5).slice(0, size);
  const lvl = Math.min(100, Math.max(a, Math.min(b + 3, (activeMon()?.lvl || a) + 1)));
  battle.trainerCtx = { t: battle.challenge.t, team: pool, idx: 0, lvl, prevEnemy: battle.enemy };
  delete battle.challenge;
  updateTrainerCall();
  await fadeTo(1);
  clearTimeout(enemyBox._spawnTimer);
  await fadeTo(0);
  sendTrainerMon(true);
}
function sendTrainerMon(first){
  const c = battle.trainerCtx, tr = TRAINERS[c.t], id = c.team[c.idx];
  const data = { id, shiny: false, lvl: c.lvl, hp: wildStats(id, c.lvl).hp, trainer: true, _k: Date.now() + Math.random() };
  spawnEnemy(data);
  openFight();
  say(first ? `${tr.name}: „Připrav se na potíže!“ Posílá ${NAMES[id - 1]} (Lv ${c.lvl}).`
            : `${tr.name} posílá dalšího: ${NAMES[id - 1]}! (${c.idx + 1}/${c.team.length})`);
}
// pokémon trenéra poražen (volá onEnemyDefeated v index.html)
function trainerNext(){
  const c = battle.trainerCtx;
  if (!c) return;
  c.idx++;
  if (c.idx < c.team.length){ setTimeout(() => sendTrainerMon(false), 1500); return; }
  const tr = TRAINERS[c.t], tier = ARENA_ORDER.indexOf(arena) + 1;
  const reward = { coins: 250 * tier + 150, lures: { [tier >= 6 ? 'ultra' : tier >= 3 ? 'great' : 'poke']: 1 },
    items: { [['potion', 'revive', 'candy'][Math.floor(Math.random() * 3)]]: 1 } };
  giveReward(reward);
  gameEvent('trainer');
  setTimeout(() => {
    toast(`${tr.name}: „Team Rocket zase prohrává!“ Odměna: ${rewardText(reward)}`, true);
    endTrainer();
  }, 1400);
}
function endTrainer(){
  const c = battle.trainerCtx;
  delete battle.trainerCtx;
  battle.enemy = c?.prevEnemy?.hp > 0 && !c.prevEnemy.trainer ? c.prevEnemy : wildMon();
  saveBattle();
  setMonSprite(enemyBox, battle.enemy);
  setState(enemyBox, 'idle');
  window.spawnGlow?.(enemyBox, '#bfe4ff');
  closeFight();
  updateTrainerCall();
}
// útěk z trenérského souboje = prohra
async function leaveTrainer(){
  const tr = battle.trainerCtx && TRAINERS[battle.trainerCtx.t];
  toast(`Utekl jsi před ${tr?.name || 'trenérem'}. Team Rocket se směje…`);
  await fadeTo(1); endTrainer(); await fadeTo(0);
}

trainerCall.querySelector('button').addEventListener('click', startTrainer);
setInterval(updateTrainerCall, 1000);
// rozpracovaný souboj z minula (zavřená hra): pokračovat
if (battle.trainerCtx && !battle.enemy.trainer) delete battle.trainerCtx;
document.head.insertAdjacentHTML('beforeend', `<style>
.trainer-call{ bottom:auto; top:70px; }
.dsp-trainer{ background:#3a2a5a !important; color:#fff !important; animation:bossPulse 1.2s steps(2) infinite !important; }
</style>`);
