/* =====================================================================
   Vývojářský režim – testovací nástroje v samostatném uložení
   ---------------------------------------------------------------------
   Zapnutím se stránka znovu načte a hraje se z "pokeIdleDev.*" (přesměrování
   localStorage je hned na začátku index.html). Normální hra zůstane, jak byla;
   vypnutím se k ní vrátíš. Nástroje jsou vidět jen v dev režimu.
   ===================================================================== */

const devBtn = document.getElementById('devBtn');
setRow(devBtn, 'Vývojářský režim', DEV_MODE ? 'zap · testovací uložení' : 'vyp', DEV_MODE);
document.getElementById('devTools').hidden = !DEV_MODE;
document.getElementById('devBadge').hidden = !DEV_MODE;

devBtn.addEventListener('click', () => {
  try {
    if (DEV_MODE) localStorage.removeItem('pokeIdle:devMode');
    else localStorage.setItem('pokeIdle:devMode', '1');
  } catch {}
  toast(DEV_MODE ? 'Zpátky do normální hry…' : 'Přepínám do testovacího uložení…');
  setTimeout(() => location.reload(), 500);
});

function devFindMon(q){
  q = q.trim().replace(/^#/, '');
  if (/^\d+$/.test(q)){ const id = Number(q); return id >= 1 && id <= DEX_MAX ? id : 0; }
  const i = NAMES.findIndex(n => n.toLowerCase() === q.toLowerCase());
  return i >= 0 ? i + 1 : 0;
}

const DEV_ACTIONS = {
  coins(){ addCoins(10000); },
  balls(){ for (const k of Object.keys(SHOP_BALLS)) shop.balls[k] = (shop.balls[k] || 0) + 5; saveShop(); toast('+5 od každého pokéballu'); },
  items(){ for (const k of Object.keys(ITEM_DEFS)) shop.items[k] = (shop.items[k] || 0) + 1; saveShop(); toast('+1 od každého předmětu'); },
  lvl(){
    const p = activeMon();
    if (!p) return;
    for (let i = 0; i < 5 && p.lvl < 100; i++) giveXp(p, xpToNext(p.lvl) - p.xp);
    saveParty(); checkEvoReady(p);
    toast(`${NAMES[p.id - 1]} je na levelu ${p.lvl}`);
  },
  evo(){
    const p = activeMon(), e = p && monEvolutions(p.id)[0];
    if (!e) return toast('Bojující pokémon se dál nevyvíjí.');
    settingsMenu.classList.remove('open');
    startEvolution(p.uid, e.to, true);
  },
  heal(){
    for (const m of party.mons){ m.hp = monStats(m).hp; m.fainted = false; }
    saveParty();
    if (monState.get(playerBox) === 'faint') sendMon(party.active);
    toast('Celý tým je vyléčený');
  },
  arenas(){
    for (const k of ARENA_ORDER) progress.bosses[k] = true;
    saveProgress(); decorateArenaMenu();
    toast('Všechny arény odemčené');
  },
  boss(){
    progress.wins[arena] = Math.max(progress.wins[arena] || 0, BOSS_WINS);
    delete progress.bosses[arena];
    saveProgress(); decorateArenaMenu(); updateBossCall();
    settingsMenu.classList.remove('open');
    toast('Pán arény čeká – tlačítko Vyzvat dole');
  },
  offline(){ settingsMenu.classList.remove('open'); showAway(runOffline(3600e3)); },
  add(){
    const id = devFindMon(document.getElementById('devMonId').value);
    if (!id) return toast('Takového pokémona neznám (číslo 1–649 nebo anglické jméno).');
    const shiny = document.getElementById('devShiny').checked;
    addToDex(id, shiny);
    const m = addMon({ id, shiny, stars: 3 });
    toast(`Přidán ${shiny ? 'shiny ' : ''}${NAMES[id - 1]} (Lv ${m.lvl}, 3★)`, shiny);
  },
  reset(){
    const keys = [];
    for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k.startsWith('pokeIdleDev.')) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
    toast('Testovací uložení smazáno');
    setTimeout(() => location.reload(), 500);
  },
};
document.getElementById('devTools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dev]');
  if (b && DEV_MODE) DEV_ACTIONS[b.dataset.dev]();
});
document.getElementById('devMonId').addEventListener('keydown', (e) => { if (e.key === 'Enter') DEV_ACTIONS.add(); });

/* ---------- Verze a aktualizace (sw.js) ---------- */
const versionBtn = document.getElementById('versionBtn');
setRow(versionBtn, 'Verze hry', typeof GAME_VERSION === 'string' ? GAME_VERSION : '?');
versionBtn.addEventListener('click', () => { toast('Kontroluji aktualizaci…'); setTimeout(() => location.reload(), 400); });
try {
  const last = localStorage.getItem('pokeIdle:version');
  if (last && typeof GAME_VERSION === 'string' && last !== GAME_VERSION) setTimeout(() => toast(`Hra aktualizována: ${GAME_VERSION}`, true), 1500);
  if (typeof GAME_VERSION === 'string') localStorage.setItem('pokeIdle:version', GAME_VERSION);
} catch {}
// offline + samoaktualizace přes service worker (jen na http/https, ne při otevření ze souboru)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
