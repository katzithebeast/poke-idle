/* =====================================================================
   Příběh: profesor Javor (úvod při prvním spuštění) a Páni arén jako postavy
   ---------------------------------------------------------------------
   Dialogy používají showDialog() z trainers.js a portréty pxPortrait()
   z pixel_sprites.js (specifikace se sem doplňují do PORTRAITS).
   ===================================================================== */

Object.assign(PORTRAITS, {
  prof:      { hair: ['#f0f0f4', '#c8c8d4', '#8a8a9a', '#3a3a46'], style: 'short', outfit: ['#e86a5a', '#c03a32', '#7a2020', '#3a0c0c'],
               coat: '#f4f4f8', eyes: '#3a3a3a', beard: null },
  l_ocean:   { hair: ['#9ad8ff', '#3a8ee8', '#1e4e9a', '#0a2050'], style: 'jessie', outfit: ['#4a6ab0', '#2a4280', '#18284e', '#0a1228'], eyes: '#1a4a8a', lips: '#e07080' },
  l_desert:  { hair: ['#c89a6a', '#8a5e34', '#5a3a1a', '#2a1808'], style: 'cap', hat: ['#e8d0a0', '#c8a868', '#8a6a3a', '#4a3418'],
               outfit: ['#d8b880', '#a88848', '#6a5228', '#342408'], eyes: '#3a2a1a' },
  l_jungle:  { hair: ['#9a7ab8', '#5a3a7a', '#3a2050', '#180a28'], style: 'puffy', outfit: ['#6ab06a', '#3a7a3a', '#225022', '#0e2a0e'], eyes: '#a02a2a', lips: '#8a3a5a' },
  l_mountain:{ hair: ['#ffffff', '#dce8f4', '#a0b4c8', '#4a5a6a'], style: 'short', outfit: ['#a0d0f0', '#5a9ad0', '#2a5a8a', '#0e2a48'], eyes: '#2a4a6a', beard: ['#ffffff', '#e4ecf4', '#b0bccc', '#5a6a7a'] },
  l_grave:   { hair: ['#7a5a9a', '#3a2450', '#22142e', '#0a0612'], style: 'jessie', outfit: ['#5a3a7a', '#3a2050', '#22122e', '#0a0612'], eyes: '#c040c0', lips: '#6a2a5a' },
  l_storm:   { hair: ['#5a5a6a', '#2c2c38', '#1a1a22', '#08080c'], style: 'cap', hat: ['#fff07a', '#f2c230', '#a87b12', '#4a3408'],
               outfit: ['#4a6ab0', '#2a3a7a', '#18224e', '#080c28'], eyes: '#2a2a3a' },
  l_volcano: { hair: ['#ff9a6a', '#e0502a', '#a02a14', '#4a0e06'], style: 'short', outfit: ['#ffb070', '#e07a2a', '#a04a14', '#4a1e06'], eyes: '#2a1a0a', beard: ['#ff9a6a', '#e0502a', '#a02a14', '#4a0e06'] },
  l_nether:  { hair: ['#d8a0ff', '#9a4ae0', '#5a2aa0', '#240a4a'], style: 'james', outfit: ['#4a3a5a', '#2a1e3a', '#180e24', '#08040e'], eyes: '#e050e0' },
  l_fel:     { hair: ['#d0d4e0', '#9aa0b4', '#5a6074', '#24283a'], style: 'short', outfit: ['#b0b4c8', '#7a7e94', '#4a4e62', '#1e2030'], eyes: '#3a3a4a' },
  l_aether:  { hair: ['#fff6c8', '#f2d26a', '#b8962a', '#5a440a'], style: 'puffy', outfit: ['#ffffff', '#f2ecd8', '#c8bc96', '#5a5038'], eyes: '#3a7ac8', lips: '#e08a9a' },
});

const PROF = { who: 'prof', name: 'Prof. Oak' };
const LEADERS = {
  ocean:    { name: 'Misty', hi: ['Vlny tu šeptají o tvých výhrách.', 'Uvidíme, jestli ustojíš bouři mého Golducka!'],
              win: ['Ach! Moře dnes stojí při tobě.', 'Prý se tu z hlubin vynořila stopa Kyogra…'], lose: ['Příliv tě smetl. Vrať se, až budeš silnější!'] },
  desert:   { name: 'Clay', hi: ['Kopal jsem tisíc let starý písek…', 'a nikdo ještě neprošel přes mého Rhydona!'],
              win: ['Úžasné! Takový nález jsem nečekal.', 'Pod dunami se hýbe něco obrovského. Groudon?'], lose: ['Písek tě pohřbil. Zkus to znovu!'] },
  jungle:   { name: 'Bugsy', hi: ['Lezeš mi do mé hmyzí říše!', 'Ariados, pomaž ho!'],
              win: ['Moje síť… roztrhaná.', 'Mezi stromy prý zahlédli Celebiho.'], lose: ['Zamotal ses. Příště se dívej, kam šlapeš.'] },
  mountain: { name: 'Pryce', hi: ['Na vrcholu je zima, mladíku.', 'Abomasnow tě zmrazí na kost!'],
              win: ['Hoho! Máš srdce horké jako sopka.', 'Nad ledovcem krouží modrý pták… Articuno.'], lose: ['Zmrzl jsi. Ohřej se a vrať se!'] },
  grave:    { name: 'Morty', hi: ['Duchové mi o tobě vyprávěli…', 'Gengar se na tebe těší.'],
              win: ['Duchové… mlčí. To se nestává.', 'Z jiného světa prý prosvítá Giratina.'], lose: ['Duchové se smějí. Ještě nejsi připraven.'] },
  storm:    { name: 'Volkner', hi: ['Létám bouřkami každý den.', 'Dragonite a já jsme rychlejší než blesk!'],
              win: ['Přistání do bahna! Zasloužené.', 'V mracích se mihl Zapdos. Chytíš ho?'], lose: ['Blesk tě srazil. Zkus to znovu!'] },
  volcano:  { name: 'Blaine', hi: ['V tomhle žáru kovám jen ty nejlepší.', 'Charizard, rozpal výheň!'],
              win: ['Ukul sis vítězství. Klobouk dolů!', 'Nad kráterem prý létá ohnivý pták… Moltres.'], lose: ['Spálil ses. Vychladni a přijď znovu.'] },
  nether:   { name: 'Sabrina', hi: ['Viděl jsem tvou porážku ve snu.', 'Alakazam ji teď uskuteční.'],
              win: ['Moje vize… se mýlila?!', 'Hluboko v rozpolceném světě čeká Mewtwo.'], lose: ['Jak jsem předpověděl.'] },
  fel:      { name: 'Jasmine', hi: ['Žádné triky. Jen síla a čest.', 'Lucario, do boje!'],
              win: ['Čestný boj. Byl jsi lepší.', 'V troskách se objevil stín… Darkrai.'], lose: ['Trénuj tvrději!'] },
  aether:   { name: 'Cynthia', hi: ['Došel jsi až do nebes.', 'Rayquaza tě poslední zkouškou provede.'],
              win: ['Jsi skutečný šampion.', 'Nad oblaky se probouzí Arceus – stvořitel všeho.'], lose: ['Nebesa tě ještě nepřijala. Vrať se!'] },
};
const leaderLines = (key, kind) => (LEADERS[key]?.[kind] || []).map(text => ({ who: 'l_' + key, name: LEADERS[key].name, text }));

/* ---------- Úvod s profesorem (jednou, po prvním načtení) ---------- */
const INTRO = [
  [PROF, 'Ahoj! Já jsem profesor Oak. Vítej ve světě pokémonů!'],
  [PROF, 'Tvůj pokémon bojuje sám – za výhry dostáváš mince a zkušenosti.'],
  [PROF, 'Chceš bojovat sám? SELECTEM přepneš na ruční boj: A útok, X a Y speciály, B krytí.'],
  [PROF, 'Pokémony chytáš v boji: oslab je a zmáčkni SELECT. Pokébally koupíš v Obchodě (Y).'],
  [PROF, 'Z návnad padají stopy vzácných pokémonů. Za stopou pak vyraz do jejich arény.'],
  [PROF, 'Každá aréna má svého Pána. Poraz ho a otevře se cesta dál – i stopa legendy!'],
  [PROF, 'A dej si pozor na Team Rocket. Kradou pokémony!'],
  [{ who: 'player', name: 'Ty' }, 'Rozumím, profesore. Jdu na to!'],
  [PROF, 'Denní úkoly a úspěchy najdeš v Deníku. Hodně štěstí!'],
].map(([w, text]) => ({ ...w, text }));
function playIntro(){
  try { localStorage.setItem('pokeIdle.introDone', '1'); } catch {}
  closeShop(); closeTeam(); closeJournal(); closePanel();
  document.querySelectorAll('.pop.open').forEach(p => p.classList.remove('open'));
  return showDialog(INTRO);
}
let introDone = false;
try { introDone = localStorage.getItem('pokeIdle.introDone') === '1'; } catch {}
if (!introDone){
  const waitLoader = setInterval(() => {
    if (document.getElementById('loader')) return;
    clearInterval(waitLoader);
    setTimeout(playIntro, 600);
  }, 300);
}

/* ---------- Nastavení: přehrát úvod; dev nástroje: testy dialogů ---------- */
const introBtn = document.createElement('button');
introBtn.className = 'set-row';
introBtn.innerHTML = '<span>Přehrát úvod s profesorem Oakem</span>';
introBtn.addEventListener('click', () => { settingsMenu.classList.remove('open'); playIntro(); });
document.getElementById('versionBtn').before(introBtn);
const devT = document.getElementById('devTools');
devT.querySelector('.pop-title').insertAdjacentHTML('afterend', `
  <button class="set-row" data-dev2="rocket"><span>Test: výzva Team Rocket</span></button>
  <button class="set-row" data-dev2="leader"><span>Test: dialog Pána arény</span></button>
  <button class="set-row" data-dev2="leaderwin"><span>Test: dialog po výhře nad Pánem</span></button>`);
devT.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dev2]');
  if (!b || !DEV_MODE) return;
  settingsMenu.classList.remove('open');
  const k = b.dataset.dev2;
  if (k === 'rocket'){
    battle.challenge = { t: Math.floor(Math.random() * TRAINERS.length), until: Date.now() + CHALLENGE_MS };
    updateTrainerCall();
    toast(`${TRAINERS[battle.challenge.t].name} tě vyzývá – přijmi na spodním displeji`, true);
  }
  if (k === 'leader') showDialog([...leaderLines(arena, 'hi'), { who: 'player', name: 'Ty', text: 'Jsem připravený!' }]);
  if (k === 'leaderwin') showDialog(leaderLines(arena, 'win'));
});
