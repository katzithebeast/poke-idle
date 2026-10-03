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
  { name: 'Raketačka', title: 'Team Rocket', portrait: 'gruntf', team: [52, 23, 41, 109, 53],   // Meowth, Ekans, Zubat, Koffing, Persian
    hi: ['Hej ty! Kam se ženeš?', 'Tvoji pokémoni se nám budou hodit.'], lose: ['Ugh… řeknu to veliteli.'], flee: ['Zbabělec!'] },
  { name: 'Proton', title: 'Velitel Team Rocket', portrait: 'proton', team: [41, 42, 109, 110],  // Zubat, Golbat, Koffing, Weezing
    hi: ['Jsem Proton, nejkrutější muž Team Rocket.', 'Nebudu se s tebou mazlit.'], lose: ['Tohle… se nestalo. Jasné?'], flee: ['Uteč, dokud můžeš!'] },
  { name: 'Ariana', title: 'Velitelka Team Rocket', portrait: 'ariana', team: [24, 45, 198],     // Arbok, Vileplume, Murkrow
    hi: ['Jsem Ariana, vrchní velitelka.', 'Giovanni se vrátí – a ty mi v tom nezabráníš.'], lose: ['Nepřijatelné! Ustupujeme!'], flee: ['Moudré rozhodnutí, dítě.'] },
  { name: 'Archer', title: 'Velitel Team Rocket', portrait: 'archer', team: [228, 109, 229],      // Houndour, Koffing, Houndoom
    hi: ['Archer, zástupce velitele.', 'Team Rocket znovu povstane!'], lose: ['Ten trenér je nebezpečný…'], flee: ['Ani bojovat neumíš?'] },
  { name: 'Petrel', title: 'Velitel Team Rocket', portrait: 'petrel', team: [109, 110, 20],      // Koffing, Weezing, Raticate
    hi: ['Hahaha! Petrel, mistr převleků!', 'Poznal jsi mě? Ne? Tak bojuj!'], lose: ['No dobře, dobře… prohrál jsem.'], flee: ['Hahaha, utekl!'] },
];
const PLAYER_LINES = { hi: ['Team Rocket? Zase vy!', 'Jdeme na to!', 'Tohle si s vámi vyřídím.'], win: ['A zůstaňte pryč!', 'Dobrá práce, týme!', 'Příště to zkuste líp.'] };
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- Dialog jako ve vizuálním románu ----------
   Celý spodní displej: vlevo ty, vpravo druhá postava (busty 64 × 64 z pixel_sprites.js),
   kdo mluví, svítí a je vepředu, druhý je ztlumený. Pozadí v barvě mluvčího,
   dole textové okno s jménem a textem po písmenech (A / ťuk = dál). */
const dialogEl = document.createElement('div');
dialogEl.className = 'dialog';
dialogEl.id = 'dialog';
dialogEl.innerHTML = `<div class="dl-stage"><i class="dl-rays"></i><img class="dl-p dl-l" alt=""><img class="dl-p dl-r" alt=""></div>
  <div class="dl-box"><b class="dl-name"></b><p class="dl-text"></p><i class="dl-next">▼</i></div>`;
document.body.appendChild(dialogEl);
// originální sprity trenérů (Pokémon Showdown, uložené v assets/trainers)
const TRAINER_SPRITES = {
  player: 'red', prof: 'oak', jessie: 'teamrocket', james: 'teamrocket', grunt: 'rocketgrunt', gruntf: 'rocketgruntf',
  proton: 'proton', ariana: 'ariana', archer: 'archer', petrel: 'petrel', giovanni: 'giovanni',
  l_ocean: 'misty', l_desert: 'clay', l_jungle: 'bugsy', l_mountain: 'pryce', l_grave: 'morty',
  l_storm: 'volkner', l_volcano: 'blaine', l_nether: 'sabrina', l_fel: 'jasmine', l_aether: 'cynthia',
};
const SPRITE_ACCENT = { red: '#d83a3a', oak: '#3aa8a0', teamrocket: '#e04a7a', rocketgrunt: '#5a5a6a', rocketgruntf: '#8a3a5a', proton: '#3a7a5a', ariana: '#c03a3a',
  archer: '#4a8ac8', petrel: '#8a5ac8', giovanni: '#6a5040', misty: '#3a8ee8', clay: '#c8a868', bugsy: '#6ab06a', pryce: '#7ab4e8', morty: '#9a4ae0',
  volkner: '#f2c230', blaine: '#e0502a', sabrina: '#c040c0', jasmine: '#9aa0b4', cynthia: '#f2d26a' };
const bustUrl = k => `assets/trainers/${TRAINER_SPRITES[k] || 'rocketgrunt'}.png`;
const accentOf = k => SPRITE_ACCENT[TRAINER_SPRITES[k]] || '#5a5a6a';
let dialogRun = null;
function showDialog(lines){
  return new Promise(resolve => {
    let i = 0, typing = null;
    const other = lines.find(l => l.who !== 'player')?.who;
    const imgL = dialogEl.querySelector('.dl-l'), imgR = dialogEl.querySelector('.dl-r');
    imgL.src = bustUrl('player');
    imgR.hidden = !other; if (other) imgR.src = bustUrl(other);
    const show = () => {
      const L = lines[i], me = L.who === 'player';
      dialogEl.classList.toggle('speak-l', me);
      dialogEl.classList.toggle('speak-r', !me);
      dialogEl.style.setProperty('--acc', accentOf(L.who));
      dialogEl.querySelector('.dl-name').textContent = L.name;
      const t = dialogEl.querySelector('.dl-text');
      t.textContent = '';
      let n = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        t.textContent = L.text.slice(0, ++n);
        if (n % 2) beep(me ? 700 : 520, 0.015, 0.012, 'square');
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
  if (!guardReady()) return;
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
  fightOpen = false; renderManual();
  spawnEnemy(data, { ball: c.t === 2 ? 'poke' : 'great' }).then(() => {
    openFight();
    say(first ? `${tr.name}: „Připrav se na potíže!“ Posílá ${NAMES[id - 1]} (Lv ${c.lvl}).`
              : `${tr.name} posílá dalšího: ${NAMES[id - 1]}! (${c.idx + 1}/${c.team.length})`);
  });
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
  position:fixed; left:50%; bottom:16px; z-index:93; transform:translateX(-50%);
  display:none; flex-direction:column; box-sizing:border-box; overflow:hidden;
  width:min(440px, calc(100vw - 24px)); height:330px;
  color:#fff; background:#101016; box-shadow:var(--w-frame);
  font-family:var(--font-body); -webkit-font-smoothing:none; zoom:var(--zoom, 1); cursor:pointer;
}
.dialog.open{ display:flex; }
.dl-stage{
  position:relative; flex:1; overflow:hidden;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 2px, transparent 2px 4px),
    radial-gradient(ellipse 70% 90% at var(--sx, 70%) 100%, color-mix(in srgb, var(--acc) 55%, #101016) 0, #101016 75%);
  transition:background-position .2s;
}
.dialog.speak-l .dl-stage{ --sx:28%; }
.dl-rays{ position:absolute; inset:-40%; background:repeating-conic-gradient(from 0deg at var(--sx, 70%) 80%, color-mix(in srgb, var(--acc) 20%, transparent) 0 6deg, transparent 6deg 18deg); animation:spin 30s steps(60) infinite; opacity:.6; }
.dl-p{ position:absolute; bottom:-14px; width:220px; height:220px; image-rendering:pixelated; transition:filter .15s, transform .15s; }
.dl-p[hidden]{ display:none; }
.dl-l{ left:-24px; } .dl-r{ right:-24px; }
.dialog.speak-l .dl-r, .dialog.speak-r .dl-l{ filter:brightness(.35) saturate(.4); }
.dialog.speak-r .dl-r{ transform:translateY(-4px); }
.dialog.speak-l .dl-l{ transform:translateY(-4px); }
.dl-box{
  position:relative; flex:none; min-height:96px; box-sizing:border-box; padding:22px 14px 12px;
  background:#f4eedb; color:var(--ink);
  box-shadow:inset 0 0 0 3px var(--ink), inset 0 0 0 6px #fff, inset 0 0 0 8px var(--acc);
}
.dl-name{
  position:absolute; top:-12px; left:14px; padding:5px 9px 4px;
  font:700 12px var(--font-title); letter-spacing:.05em; color:#fff; background:var(--acc);
  box-shadow:0 0 0 3px var(--ink); text-shadow:1px 1px 0 rgba(0,0,0,.4);
}
.dialog.speak-r .dl-name{ left:auto; right:14px; }
.dl-text{ margin:0; font:15px var(--font-body); line-height:1.4; min-height:42px; }
.dl-next{ position:absolute; right:12px; bottom:8px; font:700 12px var(--font-title); font-style:normal; color:var(--acc); animation:bossPulse .8s steps(2) infinite; }
body.ds .dialog{
  zoom:var(--dsk); transform:none; box-shadow:none; bottom:auto;
  left:calc(var(--bx) / var(--dsk)); top:calc(var(--by) / var(--dsk));
  width:calc(var(--bw) / var(--dsk)); height:calc(var(--bh) / var(--dsk));
}
body.ds.dialoging #dsPanel, body.ds.dialoging .manual-panel{ visibility:hidden; }
.dsp-trainer{ background:#3a2a5a !important; color:#fff !important; animation:bossPulse 1.2s steps(2) infinite !important; }
</style>`);
