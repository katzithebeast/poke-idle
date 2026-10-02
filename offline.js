/* =====================================================================
   Postup, když hra neběží (zavřená stránka nebo karta na pozadí)
   ---------------------------------------------------------------------
   Prohlížeč hru na pozadí zastaví, takže po návratu se souboje dopočítají:
   stejné vzorce jako na scéně (poškození, XP, mince), jen bez animací.
   Boj končí, když tvůj pokémon omdlí (s Automatickou výměnou nastoupí další).
   Odměny jsou poloviční (OFFLINE_RATE), max. 8 hodin zpětně. Ostatní pokémoni se léčí podle reálného času (party.js).
   ===================================================================== */

const OFFLINE_MAX = 8 * 3600e3, OFFLINE_MIN = 60e3;
const ANIM_MS = 1000, SPAWN_MS = 2600;  // přibližný čas animace útoku a příchodu nového soupeře (jako na scéně)
const OFFLINE_RATE = 0.5;               // offline dostaneš polovinu odměn (jako v jiných idle hrách)

// jeden souboj bez animací: { won, ms }
function simulateFight(p, e){
  const pSt = monStats(p), eSt = wildStats(e.id, e.lvl);
  let nextP = 500, nextE = 500 + turnGap(eSt, pSt) * 0.6, t = 0;
  for (let i = 0; i < 400; i++){
    if (nextP <= nextE){
      t = nextP + ANIM_MS;
      const r = hitDamage(p, pSt, e, eSt);
      if (!r.miss) e.hp -= r.dmg;
      if (e.hp < 1) return { won: true, ms: t };
      nextP = t + turnGap(pSt, eSt);
    } else {
      t = nextE + ANIM_MS;
      const r = hitDamage(e, eSt, p, pSt);
      if (!r.miss) p.hp -= r.dmg;
      if (p.hp < 1){ p.hp = 0; return { won: false, ms: t }; }
      nextE = t + turnGap(eSt, pSt);
    }
  }
  return { won: false, ms: t };
}

function runOffline(ms){
  ms = Math.min(ms, OFFLINE_MAX);
  if (!autoOn || ms < OFFLINE_MIN) return null;
  const before = new Map(party.mons.map(m => [m.uid, { lvl: m.lvl, id: m.id }]));
  const coins0 = shop.coins;
  let t = 0, wins = 0, faints = 0;
  while (t < ms && wins < 5000){
    let p = activeMon();
    if (!p || p.fainted || p.hp < 1){
      const next = upg('swap') && party.team.map(monByUid).find(m => m && !m.fainted && m.hp >= 1);
      if (!next) break;
      party.active = next.uid;
      p = next;
    }
    const e = wildMon();
    const r = simulateFight(p, e);
    t += r.ms + SPAWN_MS;
    if (r.won){ applyWin(e, false, OFFLINE_RATE); wins++; }
    else { p.fainted = true; p.hp = 0; p.t = Date.now(); faints++; }
  }
  const lvls = party.mons.filter(m => before.get(m.uid) && m.lvl > before.get(m.uid).lvl)
    .map(m => ({ m, from: before.get(m.uid).lvl }));
  healTick();
  saveShop(); saveParty(); saveProgress();
  // bojující pokémon se mohl změnit (výměna) nebo omdlít → srovnat scénu
  const a = activeMon();
  if (a && (Number(playerBox.dataset.id) !== a.id || !!playerBox.dataset.shiny !== a.shiny)){
    battle.player = { id: a.id, shiny: a.shiny, uid: a.uid };
    saveBattle();
    setMonSprite(playerBox, battle.player);
  }
  if (a?.fainted && monState.get(playerBox) !== 'faint') faint(playerBox);
  for (const m of party.team.map(monByUid)) if (m) checkEvoReady(m);
  updateCoins();
  decorateArenaMenu();
  updateBossCall();
  return { ms: Math.min(t, ms), away: ms, wins, coins: shop.coins - coins0, lvls, faints, stopped: t < ms };
}

/* ---------- Okno "Zatímco jsi byl pryč" ---------- */
const awayEl = document.getElementById('away');
const fmtDur = ms => { const m = Math.round(ms / 60e3); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
function showAway(r){
  if (!r || (!r.wins && !r.faints)) return;
  document.getElementById('awayTitle').textContent = `Byl jsi pryč ${fmtDur(r.away)}`;
  document.getElementById('awayBody').innerHTML = `
    <div class="away-stats">
      <div><b>${r.wins}</b><span>výher</span></div>
      <div><b>${r.coins.toLocaleString('cs-CZ')}</b><span>mincí</span></div>
      <div><b>${r.lvls.reduce((a, x) => a + x.m.lvl - x.from, 0)}</b><span>levelů</span></div>
    </div>
    ${r.lvls.length ? `<div class="away-lvls">${r.lvls.map(x => `<div class="evo-row"><img alt="" src="${spriteUrl(x.m.id, { shiny: x.m.shiny, animated: false })}"><div><div class="en">${NAMES[x.m.id - 1]}</div><div class="er">Lv ${x.from} → ${x.m.lvl}</div></div></div>`).join('')}</div>` : ''}
    ${r.stopped ? `<div class="dm-sub">Po ${fmtDur(r.ms)} tvůj pokémon omdlel a boj se zastavil${upg('swap') ? ' (v týmu už nikdo zdravý nebyl)' : ' – Automatická výměna v obchodě to pohlídá'}.</div>` : ''}`;
  awayEl.classList.add('open');
  jingle(2);
}
document.getElementById('awayOk').addEventListener('click', () => awayEl.classList.remove('open'));
awayEl.addEventListener('pointerdown', (e) => { if (e.target === awayEl) awayEl.classList.remove('open'); });

/* ---------- Kdy počítat: po načtení a po návratu na kartu ---------- */
let hiddenAt = 0;
function markSeen(){ progress.lastSeen = Date.now(); saveProgress(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ hiddenAt = Date.now(); markSeen(); return; }
  if (hiddenAt && !hunt && !bossFight) showAway(runOffline(Date.now() - hiddenAt));
  hiddenAt = 0;
  markSeen();
});
if (progress.lastSeen) showAway(runOffline(Date.now() - progress.lastSeen));
markSeen();
setInterval(() => { if (!document.hidden) markSeen(); }, 5000);
