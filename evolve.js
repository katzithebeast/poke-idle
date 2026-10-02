/* =====================================================================
   Evoluce, předměty v Týmu a spojování duplikátů
   ---------------------------------------------------------------------
   Evoluce se nespouští sama (idle hra by tě jinak přerušovala): když je
   podmínka splněná, objeví se upozornění a tlačítko "Vyvinout" (Tým, deník).
   Animace jako v originále: bílá silueta problikává mezi starou a novou
   formou, jde zrušit (B / Esc) – předměty se spotřebují až při dokončení.
   ===================================================================== */

const evoEl = document.getElementById('evoOverlay');
const evoStage = document.getElementById('evoStage');
const evoFrom = document.getElementById('evoFrom');
const evoTo = document.getElementById('evoTo');
const evoText = document.getElementById('evoText');
const evoCancelBtn = document.getElementById('evoCancel');
let evoRun = null;

// upozornění, když jedinec splní level/přátelství (předměty kupuješ vědomě, tam se neupozorňuje)
function checkEvoReady(m){
  for (const e of monEvolutions(m.id)){
    if (e.kind !== 'lvl' && e.kind !== 'friend') continue;
    const key = m.id + '>' + e.to;
    if (m.evoNoted === key || !evoReq(e, m).ok) continue;
    m.evoNoted = key;
    toast(`${NAMES[m.id - 1]} se může vyvinout v ${NAMES[e.to - 1]}! Otevři Tým.`, true);
  }
}

// provedení evoluce: spotřebovat předměty, změnit druh, zapsat do deníku, vyměnit sprite v boji
function applyEvolution(m, e, force = false){
  if (!force && e.kind === 'item') useItem(e.param);
  if (!force && e.kind === 'trade'){ useItem('cable'); if (e.param) useItem(e.param); }
  const before = monStats(m).hp;
  m.id = e.to;
  const after = monStats(m).hp;
  m.hp = m.fainted ? m.hp : Math.min(after, m.hp + (after - before));
  const d = dex[e.to] || (dex[e.to] = { count: 0 });
  const isNew = !d.caught;
  if (!d.caught) d.caught = Date.now();
  if (m.shiny && !d.shiny) d.shiny = Date.now();
  saveDex();
  saveParty();
  if (m.uid === party.active && !hunt){
    battle.player = { id: m.id, shiny: m.shiny, uid: m.uid };
    saveBattle();
    setMonSprite(playerBox, battle.player);
  }
  return isNew;
}

// force = bez podmínek a bez spotřeby předmětů (dev nástroje)
async function startEvolution(uid, to, force = false){
  const m = monByUid(uid);
  const e = m && monEvolutions(m.id).find(x => x.to === to);
  if (!e || evoRun) return;
  if (!force && !evoReq(e, m).ok) return toast('Podmínka evoluce ještě není splněná.');
  closeTeam(); closeJournal(); closeShop();
  const run = evoRun = { cancelled: false };
  const from = m.id, name = NAMES[from - 1];
  evoFrom.src = spriteUrl(from, { shiny: m.shiny });
  evoTo.src = spriteUrl(to, { shiny: m.shiny });
  await Promise.all([evoFrom, evoTo].map(i => i.decode().catch(() => {})));
  evoFrom.className = ''; evoTo.className = 'hide';
  evoText.textContent = `Co se to děje? ${name} se vyvíjí!`;
  evoCancelBtn.hidden = false;
  evoEl.classList.add('open');
  await wait(1300);

  // problikávání bílých siluet, čím dál rychleji
  evoFrom.className = 'sil'; evoTo.className = 'sil hide';
  let gap = 560, showTo = false;
  while (gap > 45 && !run.cancelled){
    showTo = !showTo;
    evoFrom.classList.toggle('hide', showTo);
    evoTo.classList.toggle('hide', !showTo);
    beep(showTo ? 660 : 520, 0.05, 0.03, 'square');
    await wait(gap);
    gap *= 0.86;
  }
  evoCancelBtn.hidden = true;

  if (run.cancelled){
    evoFrom.className = ''; evoTo.className = 'hide';
    evoText.textContent = `Hm? ${name} se přestal vyvíjet.`;
    beep(300, 0.15, 0.04, 'square');
    await wait(1700);
  } else {
    const f = document.createElement('div');
    f.className = 'screen-flash';
    document.body.appendChild(f);
    f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'steps(7)' }).finished.then(() => f.remove());
    evoFrom.className = 'hide'; evoTo.className = '';
    const isNew = applyEvolution(m, e, force);
    evoText.textContent = `Gratuluji! Tvůj ${name} se vyvinul v ${NAMES[to - 1]}!`;
    jingle(3);
    sparkleAt(evoStage, 18);
    if (isNew) setTimeout(() => toast(`Nový záznam v deníku: #${pad3(to)} ${NAMES[to - 1]}`), 900);
    await wait(2800);
  }
  evoEl.classList.remove('open');
  evoRun = null;
}
evoCancelBtn.addEventListener('click', () => { if (evoRun) evoRun.cancelled = true; });
document.addEventListener('keydown', (e) => {
  if (evoRun && (e.key === 'b' || e.key === 'B' || e.key === 'Escape')) evoRun.cancelled = true;
});

/* ---------- Předměty v Týmu ---------- */
function teamItems(m){
  const s = monStats(m), out = [];
  if (itemCount('potion') && !m.fainted && m.hp < s.hp) out.push({ k: 'potion', label: `Lektvar · ${itemCount('potion')}` });
  if (itemCount('revive') && m.fainted) out.push({ k: 'revive', label: `Oživení · ${itemCount('revive')}` });
  if (itemCount('candy') && m.lvl < 100) out.push({ k: 'candy', label: `Rare Candy · ${itemCount('candy')}` });
  return out;
}
function applyItem(k, m){
  const s = monStats(m);
  if (!useItem(k)) return;
  if (k === 'potion') m.hp = Math.min(s.hp, m.hp + s.hp * 0.5);
  if (k === 'revive'){ m.fainted = false; m.hp = Math.max(m.hp, s.hp * 0.5); }
  if (k === 'candy'){
    giveXp(m, xpToNext(m.lvl) - m.xp);
    toast(`${NAMES[m.id - 1]} je teď na levelu ${m.lvl}!`);
    checkEvoReady(m);
  }
  [880, 1320].forEach((f, i) => beep(f, 0.07, 0.04, 'square', i * 0.07));
  saveParty();
  // oživený pokémon, který byl v boji, se vrátí na scénu
  if (k === 'revive' && m.uid === party.active && monState.get(playerBox) === 'faint') sendMon(m.uid);
  renderTeam();
}

/* ---------- Spojování duplikátů: obětuješ kopii stejného druhu → +1 ★ ---------- */
function mergeCandidate(m){
  if (m.stars >= 5) return null;
  return party.mons.filter(x => x.id === m.id && x.uid !== m.uid && x.uid !== party.active)
    .sort((a, b) => a.stars - b.stars || a.lvl - b.lvl)[0] || null;
}
function mergeMon(m, x){
  const before = monStats(m).hp;
  m.stars = Math.min(5, m.stars + 1);
  m.hp = Math.min(monStats(m).hp, m.hp + monStats(m).hp - before);
  party.mons = party.mons.filter(y => y !== x);
  party.team = party.team.filter(u => u !== x.uid);
  saveParty();
  jingle(2);
  toast(`${NAMES[m.id - 1]} má teď ${m.stars}★!`, m.stars === 5);
  renderTeam();
}

/* ---------- Kliknutí: Vyvinout / předmět / spojit (Tým i deník) ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-evolve], [data-use], [data-merge]');
  if (!b) return;
  if (b.dataset.evolve) return startEvolution(Number(b.dataset.evolve), Number(b.dataset.to));
  const m = monByUid(Number(b.dataset.uid || b.dataset.merge));
  if (!m) return;
  if (b.dataset.use) return applyItem(b.dataset.use, m);
  // spojení je nevratné → první klik jen "natáhne" tlačítko, druhý potvrdí
  const x = monByUid(Number(b.dataset.with));
  if (!x) return;
  if (b.dataset.armed !== '1'){
    b.dataset.armed = '1';
    b.textContent = `Opravdu? ${NAMES[x.id - 1]} (Lv ${x.lvl}, ${x.stars}★) zmizí – klikni znovu`;
    b.classList.add('danger');
    setTimeout(() => { if (b.isConnected && b.dataset.armed === '1') renderTeam(); }, 4000);
    return;
  }
  mergeMon(m, x);
});
