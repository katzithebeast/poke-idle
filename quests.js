/* =====================================================================
   Denní úkoly + úspěchy (záložky v Deníku) a herní statistiky
   ---------------------------------------------------------------------
   gameEvent(typ, data) volají ostatní části hry (výhra, chycení, speciál,
   návnada, evoluce, boss, trenér). Úkoly: každý den 3 nové (podle data,
   pro všechny stejné), úspěchy: dlouhodobé milníky. Odměny se vyzvedávají
   v Deníku → Úkoly / Úspěchy.
   ===================================================================== */

const STATS_KEY = 'pokeIdle.stats', QUEST_KEY = 'pokeIdle.quests', ACH_KEY = 'pokeIdle.ach';
let stats = {};
try { stats = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch {}
let quests = null;
try { quests = JSON.parse(localStorage.getItem(QUEST_KEY)); } catch {}
let achClaimed = {};
try { achClaimed = JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch {}
const saveQuestState = () => {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    localStorage.setItem(QUEST_KEY, JSON.stringify(quests));
    localStorage.setItem(ACH_KEY, JSON.stringify(achClaimed));
  } catch {}
};

/* ---------- Odměny ---------- */
function rewardText(r){
  const parts = [];
  if (r.coins) parts.push(`${r.coins.toLocaleString('cs-CZ')} mincí`);
  for (const [k, n] of Object.entries(r.balls || {})) parts.push(`${n}× ${BALL_TYPES[k].name}`);
  for (const [k, n] of Object.entries(r.lures || {})) parts.push(`${n}× ${SHOP_BALLS[k].name}`);
  for (const [k, n] of Object.entries(r.items || {})) parts.push(`${n}× ${ITEM_DEFS[k].name}`);
  return parts.join(', ');
}
function giveReward(r){
  shop.coins += r.coins || 0;
  for (const [k, n] of Object.entries(r.balls || {})) shop.balls[k] = (shop.balls[k] || 0) + n;
  for (const [k, n] of Object.entries(r.lures || {})) shop.lures[k] = (shop.lures[k] || 0) + n;
  for (const [k, n] of Object.entries(r.items || {})) shop.items[k] = (shop.items[k] || 0) + n;
  saveShop(); updateCoins();
  jingle(3);
}

/* ---------- Denní úkoly ---------- */
const QUEST_POOL = [
  { k: 'win',     ns: [15, 30, 50], text: n => `Vyhraj ${n} soubojů` },
  { k: 'mwin',    ns: [3, 6, 10],   text: n => `Vyhraj ${n} soubojů ručně` },
  { k: 'catch',   ns: [1, 2, 3],    text: n => `Chyť ${n} ${n === 1 ? 'pokémona' : 'pokémony'}` },
  { k: 'catchT',  ns: [1],          text: (n, p) => `Chyť pokémona typu ${p}` },
  { k: 'special', ns: [5, 10],      text: n => `Použij ${n}× speciál` },
  { k: 'lure',    ns: [1, 2],       text: n => `Otevři ${n}× návnadu` },
  { k: 'trainer', ns: [1],          text: () => 'Poraz trenéra Team Rocket' },
];
const QUEST_TYPES = ['water', 'grass', 'fire', 'bug', 'normal', 'flying', 'poison', 'ground', 'electric', 'rock'];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function rollQuests(){
  let seed = [...today()].reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7);
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pool = [...QUEST_POOL], list = [];
  while (list.length < 3){
    const q = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const lvl = Math.floor(r() * q.ns.length), n = q.ns[lvl];
    const param = q.k === 'catchT' ? QUEST_TYPES[Math.floor(r() * QUEST_TYPES.length)] : null;
    const reward = { coins: 150 + lvl * 150 + Math.round(r() * 3) * 50 };
    if (r() < 0.5) reward.balls = { [lvl >= 1 ? 'great' : 'poke']: 3 };
    else reward.lures = { [lvl >= 2 ? 'great' : 'poke']: 1 };
    list.push({ k: q.k, n, param, prog: 0, claimed: false, reward });
  }
  quests = { day: today(), list };
  saveQuestState();
}
if (!quests || quests.day !== today()) rollQuests();
const questText = q => QUEST_POOL.find(p => p.k === q.k).text(q.n, q.param);

/* ---------- Úspěchy (počítají se ze stavu hry) ---------- */
const caughtCount = () => Object.values(dex).filter(e => e.caught).length;
const shinyCount = () => Object.values(dex).filter(e => e.shiny).length;
const genDone = g => { const [a, b] = GENS[g - 1]; for (let i = a; i <= b; i++) if (!dex[i]?.caught) return false; return true; };
const bossCount = () => Object.values(progress.bosses || {}).filter(Boolean).length;
const legendCount = () => party.mons.filter(m => monRarity(m.id) === 4).reduce((s, m, i, a) => s + (a.findIndex(x => x.id === m.id) === i ? 1 : 0), 0);
const ACHIEVEMENTS = [
  ...[[10, 500], [50, 1500, { balls: { ultra: 3 } }], [150, 4000, { balls: { master: 1 } }], [300, 8000, { lures: { master: 1 } }], [649, 30000, { balls: { master: 3 } }]]
    .map(([n, c, x]) => ({ k: 'dex' + n, name: `Sběratel ${n}`, desc: `Chyť ${n} různých pokémonů`, cur: caughtCount, goal: n, reward: { coins: c, ...(x || {}) } })),
  ...GENS.map(([, , reg], i) => ({ k: 'gen' + (i + 1), name: `Deník ${reg}`, desc: `Chyť všechny pokémony generace ${'I II III IV V'.split(' ')[i]}`,
    cur: () => genDone(i + 1) ? 1 : 0, goal: 1, reward: { coins: 6000, balls: { master: 1 } } })),
  { k: 'shiny1', name: 'Třpyt', desc: 'Chyť shiny pokémona', cur: shinyCount, goal: 1, reward: { coins: 1000, lures: { ultra: 1 } } },
  { k: 'shiny10', name: 'Lovec třpytu', desc: 'Chyť 10 shiny pokémonů', cur: shinyCount, goal: 10, reward: { coins: 8000, lures: { master: 1 } } },
  { k: 'boss1', name: 'První odznak', desc: 'Poraz Pána arény', cur: bossCount, goal: 1, reward: { coins: 800, balls: { great: 5 } } },
  { k: 'boss5', name: 'Půlka cesty', desc: 'Poraz 5 Pánů arén', cur: bossCount, goal: 5, reward: { coins: 4000, balls: { ultra: 5 } } },
  { k: 'boss10', name: 'Šampion', desc: 'Poraz všech 10 Pánů arén', cur: bossCount, goal: 10, reward: { coins: 20000, balls: { master: 2 } } },
  { k: 'legend1', name: 'Legenda', desc: 'Chyť legendárního pokémona', cur: legendCount, goal: 1, reward: { coins: 3000 } },
  { k: 'legend5', name: 'Mýtus', desc: 'Chyť 5 legendárních pokémonů', cur: legendCount, goal: 5, reward: { coins: 15000, balls: { master: 1 } } },
  { k: 'wins100', name: 'Bojovník', desc: 'Vyhraj 100 soubojů', cur: () => stats.win || 0, goal: 100, reward: { coins: 600 } },
  { k: 'wins1000', name: 'Veterán', desc: 'Vyhraj 1 000 soubojů', cur: () => stats.win || 0, goal: 1000, reward: { coins: 5000, items: { candy: 3 } } },
  { k: 'mwin50', name: 'Taktik', desc: 'Vyhraj 50 soubojů ručně', cur: () => stats.mwin || 0, goal: 50, reward: { coins: 2000, items: { candy: 2 } } },
  { k: 'evolve10', name: 'Proměna', desc: 'Vyvinout 10 pokémonů', cur: () => stats.evolve || 0, goal: 10, reward: { coins: 2500, items: { 'fire-stone': 1, 'water-stone': 1, 'thunder-stone': 1 } } },
  { k: 'trainer5', name: 'Postrach Rocketů', desc: 'Poraz 5 trenérů Team Rocket', cur: () => stats.trainer || 0, goal: 5, reward: { coins: 3000, lures: { great: 2 } } },
  { k: 'trainer25', name: 'Konec Team Rocket', desc: 'Poraz 25 trenérů Team Rocket', cur: () => stats.trainer || 0, goal: 25, reward: { coins: 12000, lures: { master: 1 } } },
  { k: 'star5', name: 'Dokonalost', desc: 'Měj pokémona s 5 ★', cur: () => party.mons.some(m => m.stars >= 5) ? 1 : 0, goal: 1, reward: { coins: 3000 } },
  { k: 'lv50', name: 'Trenér', desc: 'Vytrénuj pokémona na Lv 50', cur: () => Math.max(0, ...party.mons.map(m => m.lvl)), goal: 50, reward: { coins: 4000, balls: { ultra: 3 } } },
  { k: 'lv100', name: 'Mistr', desc: 'Vytrénuj pokémona na Lv 100', cur: () => Math.max(0, ...party.mons.map(m => m.lvl)), goal: 100, reward: { coins: 20000, balls: { master: 1 } } },
];
const achDone = a => a.cur() >= a.goal;
const claimableCount = () => mainClaimable().length + quests.list.filter(q => q.prog >= q.n && !q.claimed).length + ACHIEVEMENTS.filter(a => achDone(a) && !achClaimed[a.k]).length;

/* ---------- Události ze hry ---------- */
let achSeen = new Set(ACHIEVEMENTS.filter(achDone).map(a => a.k));
function gameEvent(type, data = {}){
  if (!quests || quests.day !== today()) rollQuests();
  stats[type] = (stats[type] || 0) + 1;
  if (type === 'win' && data.manual) stats.mwin = (stats.mwin || 0) + 1;
  for (const q of quests.list){
    if (q.claimed || q.prog >= q.n) continue;
    const hit = q.k === type || (q.k === 'mwin' && type === 'win' && data.manual)
      || (q.k === 'catchT' && type === 'catch' && monTypes(data.id).includes(q.param));
    if (!hit) continue;
    q.prog++;
    if (q.prog >= q.n) toast(`Úkol splněn: ${questText(q)}! Odměna v Deníku → Úkoly`, true);
  }
  for (const a of ACHIEVEMENTS) if (!achSeen.has(a.k) && achDone(a)){
    achSeen.add(a.k);
    toast(`Úspěch: ${a.name}! Odměna v Deníku → Úspěchy`, true);
  }
  saveQuestState();
  updateJournalBadge();
}

/* ---------- Záložky v Deníku ---------- */
const jPanel = document.getElementById('journalPanel');
let journalTab = 'dex';
function setJournalTab(t){
  journalTab = t;
  journal.classList.toggle('tab-other', t !== 'dex');
  journal.querySelectorAll('[data-jtab]').forEach(b => b.classList.toggle('active', b.dataset.jtab === t));
  jPanel.hidden = t === 'dex';
  if (t === 'main') renderMain();
  if (t === 'quests') renderQuests();
  if (t === 'ach') renderAch();
  if (t === 'dex') renderDex();
}
const bar = (cur, goal) => `<div class="q-bar"><i style="width:${Math.min(100, cur / goal * 100)}%"></i></div><span class="q-num">${Math.min(cur, goal).toLocaleString('cs-CZ')}/${goal.toLocaleString('cs-CZ')}</span>`;
function rowHtml(id, title, desc, cur, goal, reward, claimed){
  const done = cur >= goal;
  return `<div class="q-row ${done ? 'done' : ''} ${claimed ? 'claimed' : ''}">
    <div class="q-main"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}<div class="q-prog">${bar(cur, goal)}</div><small class="q-rew">Odměna: ${rewardText(reward)}</small></div>
    ${claimed ? '<span class="q-ok">✓</span>' : `<button class="btn ${done ? 'primary' : ''}" data-claim="${id}" ${done ? '' : 'disabled'}>${done ? 'Vyzvednout' : 'Rozpracováno'}</button>`}
  </div>`;
}
function renderQuests(){
  const ms = new Date(); ms.setHours(24, 0, 0, 0);
  const left = Math.max(0, ms - Date.now()), h = Math.floor(left / 3600e3), m = Math.floor(left / 60e3) % 60;
  jPanel.innerHTML = `<div class="q-head">Denní úkoly · nové za ${h} h ${m} min</div>` +
    quests.list.map((q, i) => rowHtml('q' + i, questText(q), '', q.prog, q.n, q.reward, q.claimed)).join('');
}
function renderAch(){
  const list = [...ACHIEVEMENTS].sort((a, b) => (achClaimed[a.k] ? 1 : 0) - (achClaimed[b.k] ? 1 : 0) || (achDone(b) - achDone(a)));
  const got = ACHIEVEMENTS.filter(a => achClaimed[a.k]).length;
  jPanel.innerHTML = `<div class="q-head">Úspěchy · ${got}/${ACHIEVEMENTS.length}</div>` +
    list.map(a => rowHtml('a:' + a.k, a.name, a.desc, a.cur(), a.goal, a.reward, !!achClaimed[a.k])).join('');
}
jPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-claim]');
  if (!b || b.disabled) return;
  const id = b.dataset.claim;
  if (id.startsWith('m:')) return claimMain(id.slice(2));
  if (id.startsWith('q')){
    const q = quests.list[Number(id.slice(1))];
    if (!q || q.claimed || q.prog < q.n) return;
    q.claimed = true; giveReward(q.reward);
    toast(`Odměna: ${rewardText(q.reward)}`, true);
  } else {
    const a = ACHIEVEMENTS.find(x => x.k === id.slice(2));
    if (!a || achClaimed[a.k] || !achDone(a)) return;
    achClaimed[a.k] = true; giveReward(a.reward);
    toast(`${a.name}: ${rewardText(a.reward)}`, true);
  }
  saveQuestState();
  updateJournalBadge();
  journalTab === 'quests' ? renderQuests() : renderAch();
});
journal.querySelectorAll('[data-jtab]').forEach(b => b.addEventListener('click', () => setJournalTab(b.dataset.jtab)));

// zlatá tečka na Deníku, když je co vyzvednout
function updateJournalBadge(){
  const n = claimableCount();
  document.querySelectorAll('[data-act="dex"], #journalBtn').forEach(el => el.classList.toggle('has-claim', n > 0));
  journal.querySelectorAll('[data-jtab]').forEach(b => {
    const c = b.dataset.jtab === 'main' ? mainClaimable().length : b.dataset.jtab === 'quests' ? quests.list.filter(q => q.prog >= q.n && !q.claimed).length
      : b.dataset.jtab === 'ach' ? ACHIEVEMENTS.filter(a => achDone(a) && !achClaimed[a.k]).length : 0;
    b.dataset.badge = c || '';
  });
}
setInterval(() => { if (journal.classList.contains('open') && journalTab === 'quests') renderQuests(); updateJournalBadge(); }, 30000);
setTimeout(updateJournalBadge, 500);

document.head.insertAdjacentHTML('beforeend', `<style>
.journal-tabs{ display:flex; gap:22px; padding:8px 16px 0; box-shadow:inset 0 -2px 0 var(--w-line, rgba(0,0,0,.15)); }
.journal-tabs button{ all:unset; cursor:pointer; position:relative; padding:6px 0 8px; font:700 12px var(--font-title); text-transform:uppercase; letter-spacing:.07em; color:var(--w-faint, #998); }
.journal-tabs button.active{ color:var(--w-fg, #222); box-shadow:inset 0 -3px 0 var(--gold); }
.journal-tabs button[data-badge]:not([data-badge=""])::after{ content:attr(data-badge); margin-left:5px; font-size:.85em; color:var(--ink); background:var(--gold); padding:1px 4px; vertical-align:1px; }
.journal.tab-other .journal-tools, .journal.tab-other .dex-grid, .journal.tab-other .journal-foot{ display:none !important; }
.journal-panel{ flex:1; min-height:0; overflow-y:auto; padding:12px 16px; display:flex; flex-direction:column; gap:8px; scrollbar-width:thin; }
.journal-panel[hidden]{ display:none; }
.q-head{ font:700 11px var(--font-title); text-transform:uppercase; letter-spacing:.08em; color:var(--w-muted, #776); }
.q-row{ display:flex; align-items:center; gap:10px; padding:8px 10px; background:var(--w-card, #eee5c8); }
.q-row.claimed{ opacity:.45; }
.q-main{ flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
.q-main b{ font:700 12px var(--font-title); }
.q-main small{ font-size:12px; color:var(--w-muted, #776); }
.q-prog{ display:flex; align-items:center; gap:8px; }
.q-bar{ flex:1; height:6px; background:var(--w-track, #3a3a4a); }
.q-bar i{ display:block; height:100%; background:#5ab0ff; }
.q-row.done .q-bar i{ background:var(--gold); }
.q-num{ font:700 10px var(--font-title); }
.q-rew{ color:var(--gold-lo) !important; }
body.theme-dark .q-rew{ color:var(--gold) !important; }
.q-ok{ font:700 16px var(--font-title); color:#7ae08a; }
.has-claim{ position:relative; }
.has-claim::before{ content:''; position:absolute; top:6px; right:8px; width:8px; height:8px; background:var(--gold); box-shadow:0 0 0 2px var(--ink); animation:bossPulse 1s steps(2) infinite; }
body.ds .journal-tabs{ gap:14px; padding:4px 10px 0; }
body.ds .journal-tabs button{ font-size:9px; padding:4px 0 5px; }
body.ds .journal-panel{ padding:8px 10px; gap:6px; }
body.ds .q-row{ padding:6px 8px; gap:8px; }
body.ds .q-main b{ font-size:10px; } body.ds .q-main small{ font-size:10px; }
body.ds .q-row .btn{ font-size:8px; padding:6px 7px; }
</style>`);

/* =====================================================================
   Hlavní úkoly (Příběh): kapitola na každou arénu, zadává Prof. Oak.
   Vedou hráče od začátku – učí hru postupně (návnada, chytání, ruční boj,
   mapa, evoluce, trenéři, Centrum, skrýš, legendy). Podmínky se počítají
   ze stavu hry, takže co už máš hotové ze starší hry, se samo odškrtne
   a čeká na vyzvednutí. Splněný úkol zůstane splněný (uloží se).
   Další kapitola se otevře, až jsou splněné všechny úkoly té předchozí.
   ===================================================================== */
const MAIN_KEY = 'pokeIdle.main';
let mainSt = null;
try { mainSt = JSON.parse(localStorage.getItem(MAIN_KEY)); } catch {}
mainSt = { done: {}, claimed: {}, seen: -1, ...(mainSt || {}) };
const saveMain = () => { try { localStorage.setItem(MAIN_KEY, JSON.stringify(mainSt)); } catch {} };

const totalWins = () => Object.values(progress.wins || {}).reduce((a, b) => a + b, 0);
const maxLvl = () => Math.max(0, ...party.mons.map(m => m.lvl));
const maxStars = () => Math.max(0, ...party.mons.map(m => m.stars || 1));
const stat = k => stats[k] || 0;
// stavební kameny úkolů: text, aktuální hodnota, cíl, kam vede ťuknutí
const Q = {
  wins:  n => ({ text: `Vyhraj ${n} soubojů`, cur: totalWins, goal: n }),
  lvl:   n => ({ text: `Vytrénuj pokémona na Lv ${n}`, cur: maxLvl, goal: n, go: 'team' }),
  dex:   n => ({ text: `Měj v deníku ${n} druhů pokémonů`, cur: caughtCount, goal: n, go: 'shop' }),
  stars: n => ({ text: `Spoj kopie – měj pokémona s ${n} ★`, cur: maxStars, goal: n, go: 'team' }),
  team:  n => ({ text: `Měj v týmu ${n} pokémony`, cur: () => party.team.length, goal: n, go: 'team' }),
  legend: n => ({ text: n === 1 ? 'Chyť legendárního pokémona' : `Chyť ${n} legendární pokémony`, cur: legendCount, goal: n, go: 'hunts' }),
  stat:  (k, n, text, go) => ({ text, cur: () => stat(k), goal: n, go }),
  visit: k => ({ text: `Vycestuj do arény ${ARENAS[k].name} a vyhraj tam souboj`, cur: () => progress.wins[k] || 0, goal: 1, go: 'map:' + k }),
  boss:  k => ({ text: `Poraz Pána arény: ${ARENAS[k].name}`, cur: () => progress.bosses[k] ? 1 : 0, goal: 1, go: 'boss:' + k, boss: true }),
};
const CH = (arena, oak, list) => ({ arena, oak, list });
const MAIN_CHAPTERS = [
  CH('ocean', ['Začneme zlehka. Tvůj pokémon bojuje sám – za výhry dostáváš mince.', 'Úkoly ode mě uvidíš dole na displeji. Ťukni na ně a ukážu ti cestu.'], [
    Q.wins(5),
    { ...Q.stat('lure', 1, 'Otevři v Obchodě první návnadu', 'shop:lures'), r: { balls: { poke: 5 } } },
    { text: 'Chyť pokémona do pokéballu', cur: () => Math.max(stat('catch'), party.mons.length - 1), goal: 1, go: 'hunts', r: { lures: { poke: 1 } } },
    Q.stat('mwin', 1, 'Vyhraj souboj ručně (SELECT → Bojovat)', 'fight'),
    { ...Q.lvl(6), r: { items: { candy: 1 } } },
    Q.boss('ocean'),
  ]),
  CH('desert', ['Výborně! Na Mapě teď můžeš cestovat do další arény.', 'V Poušti jsou silnější pokémoni – přiber do týmu parťáky.'], [
    Q.visit('desert'),
    { ...Q.team(3), r: { balls: { poke: 5 } } },
    Q.stat('special', 5, 'Použij v ručním boji 5× speciál (X / Y)', 'fight'),
    { ...Q.lvl(12), r: { items: { candy: 1 } } },
    Q.boss('desert'),
  ]),
  CH('jungle', ['Pokémoni se s levelem vyvíjejí – sleduj v Týmu záložku Evoluce.', 'A dávej pozor, v okolí se potuluje Team Rocket.'], [
    Q.visit('jungle'),
    { ...Q.stat('evolve', 1, 'Vyviň pokémona', 'team'), r: { items: { candy: 2 } } },
    Q.stat('trainer', 1, 'Poraz trenéra Team Rocket (až tě vyzve)'),
    { ...Q.stat('center', 1, 'Nech se vyléčit v Pokémon Center (Mapa)', 'map:center1'), r: { items: { potion: 3 } } },
    { ...Q.dex(10), r: { lures: { poke: 2 } } },
    Q.lvl(20),
    Q.boss('jungle'),
  ]),
  CH('mountain', ['Team Rocket má na Mapě svou skrýš. Vyčisti ji!', 'Kopie stejného pokémona můžeš spojit – dostane hvězdu navíc.'], [
    Q.visit('mountain'),
    { ...Q.stat('hideout', 1, 'Vyčisti skrýš Team Rocket', 'map:hideout'), r: { balls: { ultra: 2 } } },
    Q.stars(3),
    Q.dex(20),
    Q.lvl(30),
    Q.boss('mountain'),
  ]),
  CH('grave', ['Po každém poraženém Pánovi arény se objeví stopa legendy.', 'Najdeš ji v Obchodě → Stopy. Legendu chytíš jen silným ballem!'], [
    Q.visit('grave'),
    { ...Q.legend(1), r: { balls: { ultra: 3 } } },
    Q.stat('mwin', 25, 'Vyhraj 25 soubojů ručně', 'fight'),
    Q.dex(35),
    Q.lvl(40),
    Q.boss('grave'),
  ]),
  CH('storm', ['V Bouřlivých horách jsou elektrické typy silné. Vyber tým s rozmyslem.'], [
    Q.visit('storm'),
    Q.stat('evolve', 5, 'Vyviň celkem 5 pokémonů', 'team'),
    Q.stat('trainer', 5, 'Poraz celkem 5 trenérů Team Rocket'),
    Q.dex(50),
    Q.lvl(50),
    Q.boss('storm'),
  ]),
  CH('volcano', ['Sopečný kráter prověří, jak silný tým jsi postavil.'], [
    Q.visit('volcano'),
    Q.stars(4),
    Q.stat('hideout', 3, 'Vyčisti skrýš Team Rocket celkem 3×', 'map:hideout'),
    Q.dex(70),
    Q.lvl(60),
    Q.boss('volcano'),
  ]),
  CH('nether', ['Podsvětí… sem se moc trenérů neodváží. Ty ano.'], [
    Q.visit('nether'),
    { ...Q.legend(3), r: { balls: { ultra: 5 } } },
    Q.stat('lure', 25, 'Otevři celkem 25 návnad', 'shop:lures'),
    Q.dex(100),
    Q.lvl(72),
    Q.boss('nether'),
  ]),
  CH('fel', ['Skoro u cíle. Ještě dvě arény a budeš šampion.'], [
    Q.visit('fel'),
    Q.stars(5),
    Q.stat('trainer', 15, 'Poraz celkem 15 trenérů Team Rocket'),
    Q.dex(130),
    Q.lvl(85),
    Q.boss('fel'),
  ]),
  CH('aether', ['Nebeská říše. Poslední zkouška – Cynthia tě čeká.'], [
    Q.visit('aether'),
    Q.legend(5),
    Q.dex(151),
    Q.lvl(95),
    Q.boss('aether'),
  ]),
  CH(null, ['Jsi šampion! Ale deník ještě není plný…', 'Shiny pokémoni, legendy a Lv 100 – to je výzva pro opravdové mistry.'], [
    { text: 'Chyť shiny pokémona', cur: shinyCount, goal: 1, go: 'hunts', r: { coins: 5000, lures: { master: 1 } } },
    { ...Q.legend(8), r: { coins: 8000, balls: { master: 1 } } },
    { ...Q.stat('hideout', 10, 'Vyčisti skrýš Team Rocket celkem 10×', 'map:hideout'), r: { coins: 8000 } },
    { ...Q.lvl(100), r: { coins: 15000, balls: { master: 1 } } },
    { ...Q.dex(300), r: { coins: 20000, balls: { master: 2 } } },
  ]),
];
// klíče a výchozí odměny (rostou s kapitolou; Pán arény dává víc)
MAIN_CHAPTERS.forEach((ch, ci) => ch.list.forEach((q, i) => {
  q.k = `${ci}.${i}`; q.ci = ci;
  q.reward = q.r || (q.boss ? { coins: 500 * (ci + 1), balls: { [ci < 3 ? 'great' : 'ultra']: 3 } } : { coins: 150 * (ci + 1) });
}));
const chapterTitle = ci => MAIN_CHAPTERS[ci].arena ? `Kapitola ${ci + 1} · ${ARENAS[MAIN_CHAPTERS[ci].arena].name}` : 'Šampion';
const mainDone = q => !!mainSt.done[q.k];
const chapterDone = ci => MAIN_CHAPTERS[ci].list.every(mainDone);
// aktuální kapitola = první nesplněná (index za poslední = všechno hotovo)
function mainChapter(){
  let ci = 0;
  while (ci < MAIN_CHAPTERS.length && chapterDone(ci)) ci++;
  return ci;
}
// odškrtne splněné úkoly v otevřených kapitolách (postupně, kapitolu po kapitole)
function checkMain(silent = false){
  let changed = false;
  for (let ci = 0; ci < MAIN_CHAPTERS.length; ci++){
    for (const q of MAIN_CHAPTERS[ci].list) if (!mainDone(q) && q.cur() >= q.goal){
      mainSt.done[q.k] = true; changed = true;
      if (!silent) toast(`Úkol splněn: ${q.text}! Vyzvedni odměnu`, true);
    }
    if (!chapterDone(ci)) break;
  }
  if (changed){ saveMain(); updateJournalBadge(); }
  return changed;
}
const mainClaimable = () => MAIN_CHAPTERS.flatMap(ch => ch.list).filter(q => mainDone(q) && !mainSt.claimed[q.k]);
const currentQuest = () => { const ci = mainChapter(); return ci < MAIN_CHAPTERS.length ? MAIN_CHAPTERS[ci].list.find(q => !mainDone(q)) : null; };

function claimMain(k){
  const list = k === 'all' ? mainClaimable() : mainClaimable().filter(q => q.k === k);
  if (!list.length) return;
  const sum = { coins: 0, balls: {}, lures: {}, items: {} };
  for (const q of list){
    mainSt.claimed[q.k] = true;
    sum.coins += q.reward.coins || 0;
    for (const g of ['balls', 'lures', 'items']) for (const [x, n] of Object.entries(q.reward[g] || {})) sum[g][x] = (sum[g][x] || 0) + n;
  }
  saveMain(); giveReward(sum);
  toast(`${list.length > 1 ? `Odměny za ${list.length} úkolů` : 'Odměna'}: ${rewardText(sum)}`, true);
  updateJournalBadge();
  if (journalTab === 'main') renderMain();
}

function renderMain(){
  checkMain(true);
  const cur = mainChapter(), n = mainClaimable().length;
  let html = n > 1 ? `<button class="btn primary q-claimall" data-claim="m:all">Vyzvednout vše (${n})</button>` : '';
  // od aktuální kapitoly zpět; starší hotové a vyzvednuté kapitoly jen jako sbalený řádek
  for (let ci = Math.min(cur, MAIN_CHAPTERS.length - 1); ci >= 0; ci--){
    const ch = MAIN_CHAPTERS[ci], allClaimed = ch.list.every(q => mainSt.claimed[q.k]);
    if (allClaimed && ci < cur){ html += `<div class="q-head q-chdone">✓ ${chapterTitle(ci)}</div>`; continue; }
    html += `<div class="q-head">${chapterTitle(ci)} · ${ch.list.filter(mainDone).length}/${ch.list.length}</div>`
      + `<div class="q-oak"><b>Prof. Oak:</b> ${ch.oak.join(' ')}</div>`
      + ch.list.map(q => rowHtml('m:' + q.k, q.text, '', mainDone(q) ? q.goal : Math.min(q.goal, q.cur()), q.goal, q.reward, !!mainSt.claimed[q.k])).join('');
  }
  if (cur >= MAIN_CHAPTERS.length) html = '<div class="q-oak"><b>Prof. Oak:</b> Splnil jsi všechno, co jsem pro tebe měl. Jsi opravdový mistr pokémonů!</div>' + html;
  jPanel.innerHTML = html;
}

// ťuknutí na úkol: vezme hráče tam, kde se dá splnit
function goQuest(){
  const n = mainClaimable().length, q = currentQuest();
  const journalMain = () => { openJournal(); setJournalTab('main'); };
  if (n || !q?.go) return journalMain();
  const [where, arg] = q.go.split(':');
  if (where === 'shop') return openShop(arg || 'buy');
  if (where === 'hunts') return openShop('hunts');
  if (where === 'team') return openTeam();
  if (where === 'fight'){
    if (!$('dspFight').hidden) return $('dspFight').click();
    return toast('Ruční boj: zmáčkni SELECT, nebo počkej na tlačítko Bojovat.');
  }
  if (where === 'map' || (where === 'boss' && arg !== arena)){
    openMap('browse');
    if (arg && typeof stopPos === 'function' && stopPos(arg)){ mapSel = arg; renderMapPanel(); }
    return;
  }
  if (where === 'boss'){
    if (bossAvailable()) return startBoss();
    return toast(`Pán arény tě vyzve po ${BOSS_WINS} výhrách tady (máš ${Math.min(BOSS_WINS, progress.wins[arena] || 0)}).`);
  }
  journalMain();
}

// proužek s aktuálním úkolem na spodním displeji (místo řádku "Soupeř")
const dspGoal = document.createElement('button');
dspGoal.className = 'dsp-goal';
dspGoal.id = 'dspGoal';
dspGoal.addEventListener('click', goQuest);
function renderGoal(){
  if (!document.body.classList.contains('ds')) return;
  if (!dspGoal.isConnected) document.getElementById('dspEnemy')?.after(dspGoal);   // panel vytváří ds.js (načte se později)
  checkMain();
  const n = mainClaimable().length, q = currentQuest();
  const banner = ['dspBoss', 'dspFight', 'dspTrainer'].some(id => !$(id).hidden);
  dspGoal.hidden = banner || hunt || bossFight || (!n && !q);
  $('dspEnemy').hidden = !dspGoal.hidden;
  if (dspGoal.hidden) return;
  if (n){
    dspGoal.className = 'dsp-goal claim';
    dspGoal.innerHTML = `<span class="g-ic">★</span><span class="g-t">${n > 1 ? `${n} odměny za úkoly` : 'Odměna za úkol'} – vyzvedni si ji</span><span class="g-n">→</span>`;
    return;
  }
  const cur = Math.min(q.goal, q.cur()), ch = MAIN_CHAPTERS[q.ci];
  dspGoal.className = 'dsp-goal';
  dspGoal.innerHTML = `<span class="g-ic">▸</span><span class="g-t">${q.text}</span>`
    + `<span class="g-n">${q.goal > 1 ? `${cur}/${q.goal}` : ch.arena ? `Kap. ${q.ci + 1}` : 'Šampion'}</span>`
    + (q.goal > 1 ? `<i class="g-bar" style="--p:${cur / q.goal * 100}%"></i>` : '');
}
setInterval(renderGoal, 1000);
setTimeout(() => { checkMain(true); renderGoal(); }, 600);

// Prof. Oak zadá novou kapitolu (jednou; při skoku o víc kapitol jen tu poslední)
setInterval(() => {
  const ci = mainChapter();
  if (ci <= mainSt.seen || ci >= MAIN_CHAPTERS.length) return;
  if (dialogRun || hunt || bossFight || battle.trainerCtx || evoRun || mapMode || document.querySelector('.dm.open, .journal.open, .reveal.open, .case.open')) return;
  if (!localStorage.getItem('pokeIdle.introDone') && !localStorage.getItem('pokeIdleDev.introDone')) return;
  mainSt.seen = ci; saveMain();
  if (ci === 0 && totalWins() < 3) return;   // úplně nový hráč: první kapitolu uvedl už úvod
  const lines = [{ ...PROF, text: `${chapterTitle(ci)}!` }, ...MAIN_CHAPTERS[ci].oak.map(text => ({ ...PROF, text }))];
  showDialog(lines);
}, 3000);

document.head.insertAdjacentHTML('beforeend', `<style>
.q-oak{ font-size:12px; line-height:1.45; color:var(--w-muted); padding:2px 2px 4px; }
.q-oak b{ color:var(--w-fg); font-weight:400; }
.q-chdone{ opacity:.5; }
.q-claimall{ align-self:flex-start; }
.dsp-goal{
  all:unset; cursor:pointer; position:relative; box-sizing:border-box;
  display:flex; align-items:center; gap:8px; padding:7px 10px 8px;
  background:var(--w-card); box-shadow:inset 3px 0 0 var(--gold);
  font-size:12px;
}
.dsp-goal[hidden]{ display:none; }
.dsp-goal .g-ic{ font:700 12px var(--font-title); color:var(--gold); }
.dsp-goal .g-t{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsp-goal .g-n{ font:700 10px var(--font-title); color:var(--w-muted); letter-spacing:.04em; }
.dsp-goal .g-bar{ position:absolute; left:3px; right:0; bottom:0; height:2px; background:var(--w-track); }
.dsp-goal .g-bar::after{ content:''; position:absolute; left:0; top:0; bottom:0; width:var(--p); background:var(--gold); }
.dsp-goal.claim{ background:var(--gold); color:var(--ink); box-shadow:none; animation:bossPulse 1.2s steps(2) infinite; }
.dsp-goal.claim .g-ic, .dsp-goal.claim .g-n{ color:var(--ink); }
.dsp-goal:active{ background:var(--w-card-h); }
</style>`);
