/* =====================================================================
   Trenéři Team Rocket – výzvy 1v1 (ruční boj s týmem 2–3 pokémonů)
   ---------------------------------------------------------------------
   Po výhrách občas přijde výzva (banner na spodním displeji / dole na PC).
   Přijmeš → postupně porazíš jejich pokémony (cizí chytit nejde).
   Výhra = mince, návnada a předmět. Útěk = prohra, výzva zmizí.
   Výzva počká ~3 minuty, idle boj mezitím běží dál.
   ===================================================================== */

// portrait = klíč do PORTRAITS (pixel_sprites.js); hi/win/lose = repliky před a po souboji
const TRAINERS = [
  { name: 'Jessie', title: 'Team Rocket', portrait: 'jessie', team: [23, 108, 202, 24, 52],      // Ekans, Lickitung, Wobbuffet, Arbok, Meowth
    hi: ['Připrav se na potíže!', 'Tvoji pokémoni budou patřit Team Rocket!'], lose: ['Cože?! Team Rocket zase prohrává!'], flee: ['Haha! Utíká jako malé dítě!'] },
  { name: 'James', title: 'Team Rocket', portrait: 'james', team: [109, 70, 52, 110, 71],        // Koffing, Weepinbell, Meowth, Weezing, Victreebel
    hi: ['A ať je jich dvojnásob!', 'Bránit svět před zkázou… a pak ti vzít pokémony!'], lose: ['To snad ne… Team Rocket odlétá rychlostí světla!'], flee: ['Ani nestihl předvést svůj nejlepší útok!'] },
  { name: 'Raketák', title: 'Team Rocket', portrait: 'grunt', team: [19, 41, 88, 20, 42, 89],   // Rattata, Zubat, Grimer, Raticate, Golbat, Muk
    hi: ['Stůj! Tohle území patří Team Rocket.', 'Odevzdej pokémony, nebo bojuj!'], lose: ['Šéf mě zabije…'], flee: ['Tak jo, utíkej si!'] },
  { name: 'Butch', title: 'Team Rocket', portrait: 'butch', team: [216, 228, 229, 217],          // Teddiursa, Houndour, Houndoom, Ursaring
    hi: ['Jsem Butch! Ne Bob, ne Botch – BUTCH!', 'Ukaž, co umíš.'], lose: ['Tohle si Cassidy neodpustí…'], flee: ['Zbabělec! Ani jméno si nezapamatoval.'] },
  { name: 'Cassidy', title: 'Team Rocket', portrait: 'cassidy', team: [88, 261, 262, 89],        // Grimer, Poochyena, Mightyena, Muk
    hi: ['Jessie a James jsou amatéři.', 'Já jsem elita Team Rocket!'], lose: ['Nemožné! Tohle nikdo nesmí vědět!'], flee: ['Elita vždycky vyhraje.'] },
];
const PLAYER_LINES = { hi: ['Team Rocket? Zase vy!', 'Jdeme na to!', 'Tohle si s vámi vyřídím.'], win: ['A zůstaňte pryč!', 'Dobrá práce, týme!', 'Příště to zkuste líp.'] };
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- Dialog: portrét + jméno + text po písmenech (A / ťuk = dál) ---------- */
const dialogEl = document.createElement('div');
dialogEl.className = 'dialog';
dialogEl.id = 'dialog';
dialogEl.innerHTML = '<div class="dl-face"></div><div class="dl-body"><b class="dl-name"></b><p class="dl-text"></p></div><i class="dl-next">▼</i>';
document.body.appendChild(dialogEl);
const portraitCache = {};
const portraitUrl = k => portraitCache[k] ||= pxPortrait(k).toDataURL();
let dialogRun = null;
function showDialog(lines){
  return new Promise(resolve => {
    let i = 0, typing = null;
    const show = () => {
      const L = lines[i], left = L.who === 'player';
      dialogEl.classList.toggle('right', !left);
      dialogEl.querySelector('.dl-face').style.backgroundImage = `url(${portraitUrl(L.who === 'player' ? 'player' : L.who)})`;
      dialogEl.querySelector('.dl-name').textContent = L.name;
      const t = dialogEl.querySelector('.dl-text');
      t.textContent = '';
      let n = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        t.textContent = L.text.slice(0, ++n);
        if (n % 2) beep(L.who === 'player' ? 700 : 520, 0.015, 0.012, 'square');
        if (n >= L.text.length){ clearInterval(typing); typing = null; }
      }, 24);
    };
    dialogRun = {
      next(){
        if (typing){ clearInterval(typing); typing = null; dialogEl.querySelector('.dl-text').textContent = lines[i].text; return; }
        if (++i >= lines.length){ dialogEl.classList.remove('open'); document.body.classList.remove('dialoging'); dialogRun = null; resolve(); return; }
        show();
      },
    };
    dialogEl.classList.add('open');
    document.body.classList.add('dialoging');
    show();
  });
}
dialogEl.addEventListener('click', () => dialogRun?.next());
document.addEventListener('keydown', (e) => { if (dialogRun && (e.key === ' ' || e.key === 'Enter' || e.key === 'a')){ e.preventDefault(); dialogRun.next(); } });
const tLine = (tr, text) => ({ who: tr.portrait, name: tr.name, text });
const pLine = text => ({ who: 'player', name: 'Ty', text });
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
  await showDialog([...tr.hi.map(t => tLine(tr, t)), pLine(pick(PLAYER_LINES.hi))]);
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
  setTimeout(async () => {
    closeFight();
    await showDialog([...tr.lose.map(t => tLine(tr, t)), pLine(pick(PLAYER_LINES.win))]);
    toast(`Výhra nad ${tr.name}! Odměna: ${rewardText(reward)}`, true);
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
  closeFight();
  if (tr) await showDialog(tr.flee.map(t => tLine(tr, t)));
  await fadeTo(1); endTrainer(); await fadeTo(0);
}

trainerCall.querySelector('button').addEventListener('click', startTrainer);
setInterval(updateTrainerCall, 1000);
// rozpracovaný souboj z minula (zavřená hra): pokračovat
if (battle.trainerCtx && !battle.enemy.trainer) delete battle.trainerCtx;
document.head.insertAdjacentHTML('beforeend', `<style>
.trainer-call{ bottom:auto; top:70px; }
.dialog{
  position:fixed; left:50%; bottom:20px; z-index:93; transform:translateX(-50%);
  display:none; align-items:flex-start; gap:12px; box-sizing:border-box;
  width:min(520px, calc(100vw - 24px)); min-height:110px; padding:12px 14px;
  color:var(--w-fg); background:var(--w-bg); box-shadow:var(--w-frame);
  font-family:var(--font-body); -webkit-font-smoothing:none; zoom:var(--zoom, 1); cursor:pointer;
}
.dialog.open{ display:flex; }
.dialog.right{ flex-direction:row-reverse; text-align:right; }
.dl-face{ width:84px; height:84px; flex:none; background:#3a4a6a center / 100% 100% no-repeat; image-rendering:pixelated; box-shadow:0 0 0 3px var(--ink); }
.dialog.right .dl-face{ background-color:#5a2a3a; }
.dl-body{ flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
.dl-name{ font:700 13px var(--font-title); color:var(--gold); }
.dialog.right .dl-name{ color:#ff8a9a; }
.dl-text{ margin:0; font:15px var(--font-body); line-height:1.35; }
.dl-next{ position:absolute; right:12px; bottom:8px; font:700 12px var(--font-title); font-style:normal; color:var(--gold); animation:bossPulse 0.8s steps(2) infinite; }
.dialog.right .dl-next{ right:auto; left:12px; }
body.ds .dialog{
  zoom:var(--dsk); transform:none; box-shadow:none; bottom:auto;
  left:calc(var(--bx) / var(--dsk)); top:calc((var(--by) + var(--bh)) / var(--dsk) - 132px);
  width:calc(var(--bw) / var(--dsk)); min-height:132px; z-index:93;
}
body.ds.dialoging #dsPanel, body.ds.dialoging .manual-panel{ visibility:hidden; }
.dsp-trainer{ background:#3a2a5a !important; color:#fff !important; animation:bossPulse 1.2s steps(2) infinite !important; }
</style>`);
