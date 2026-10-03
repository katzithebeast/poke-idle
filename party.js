/* =====================================================================
   Pokémoni hráče: jedinci, hvězdičky kvality, staty, levely, tým a léčení
   ---------------------------------------------------------------------
   Každý chycený pokémon je samostatný jedinec { uid, id, shiny, stars, lvl, xp, hp, t }.
   Deník (dex) ukazuje druhy, tady jsou konkrétní pokémoni. Tým má 6 míst,
   jeden z nich bojuje (active). Ostatní se léčí v čase – i když hra neběží.
   ===================================================================== */

const PARTY_KEY = 'pokeIdle.party';
const TEAM_MAX = 6;
const STAR_BONUS = 0.08;          // +8 % ke všem statům za každou hvězdu nad první
const TEAM_XP_SHARE = 0.3;        // pokémoni v týmu, kteří nebojují, dostanou 30 % XP
const WIN_HEAL = 0.25;            // po výhře si bojující pokémon odpočine o 25 % HP
const healMs = m => (30000 + m.lvl * 3000) * (1 - 0.15 * upg('heal'));   // z nuly na plno; vylepšení Pokémon Center zrychluje
const xpToNext = L => Math.round(10 * L ** 1.8 + 20);
const FRIEND_MAX = 200;           // přátelství: +2 za výhru v boji, +1 pro zbytek týmu
const isDay = () => { const h = new Date().getHours(); return h >= 6 && h < 18; };

/* ---------- Staty ----------
   Ze 6 base statů 4 herní: HP, Útok (vyšší z útoků), Obrana (průměr obran), Rychlost.
   Vzorec jako v originálních hrách (bez IV/EV), hvězdy přidávají procenta. */
function monStats(m){
  const [hp, atk, def, spa, spd, spe] = monBaseStats(m.id), L = m.lvl, k = 1 + STAR_BONUS * ((m.stars || 1) - 1);
  const st = b => Math.floor((b * 2 * L / 100 + 5) * k);
  return { hp: Math.floor((hp * 2 * L / 100 + L + 10) * k), atk: st(Math.max(atk, spa)), def: st((def + spd) / 2), spe: st(spe) };
}

/* ---------- Uložený stav + převod ze staré verze ---------- */
let party = null;
try { party = JSON.parse(localStorage.getItem(PARTY_KEY)); } catch {}
function saveParty(){ try { localStorage.setItem(PARTY_KEY, JSON.stringify(party)); } catch {} }
function newMon({ id, shiny = false, stars = 1, lvl = 5 }){
  const m = { uid: party.nextUid++, id, shiny: !!shiny, stars, lvl, xp: 0, hp: 0, t: Date.now(), caught: Date.now() };
  m.hp = monStats(m).hp;
  return m;
}
if (!party?.mons){
  // první spuštění: startér z boje + jeden jedinec za každé dřívější chycení
  party = { mons: [], team: [], active: 0, nextUid: 1 };
  const starter = newMon({ id: battle.player.id, shiny: battle.player.shiny, stars: 2 });
  party.mons.push(starter);
  for (const [id, e] of Object.entries(dex)) for (let i = 0; i < (e.catches || 0); i++){
    if (Number(id) === starter.id && i === 0) continue;
    party.mons.push(newMon({ id: Number(id), stars: 1 + Math.floor(Math.random() * 3) }));
  }
  party.team = party.mons.slice(0, TEAM_MAX).map(m => m.uid);
  party.active = starter.uid;
  saveParty();
}

const monByUid = uid => party.mons.find(m => m.uid === uid);
const activeMon = () => monByUid(party.active);
const inTeam = m => party.team.includes(m.uid);
const highestLevel = () => Math.max(5, ...party.mons.map(m => m.lvl));

// nový jedinec (z lovu) – když je v týmu místo, rovnou do týmu
function addMon(data){
  const m = newMon({ lvl: Math.max(5, Math.round(highestLevel() * 0.6)), ...data });
  party.mons.push(m);
  if (party.team.length < TEAM_MAX) party.team.push(m.uid);
  saveParty();
  if (teamEl.classList.contains('open')) renderTeam();
  return m;
}

// XP → levely; vrací počet nových levelů
function giveXp(m, xp){
  if (m.lvl >= 100) return 0;
  m.xp += xp;
  let ups = 0;
  while (m.lvl < 100 && m.xp >= xpToNext(m.lvl)){
    m.xp -= xpToNext(m.lvl);
    const before = monStats(m).hp;
    m.lvl++;
    m.hp += monStats(m).hp - before;
    ups++;
  }
  if (m.lvl >= 100) m.xp = 0;
  return ups;
}

/* ---------- Léčení v čase ----------
   Léčí se každý kromě toho, kdo zrovna bojuje. Omdlelý pokémon může zpátky
   do boje, až když je úplně vyléčený. Počítá se podle reálného času (i offline). */
function healTick(now = Date.now()){
  for (const m of party.mons){
    const max = monStats(m).hp;
    const fighting = m.uid === party.active && m.hp > 0 && !m.fainted;
    if (!fighting && m.hp < max) m.hp = Math.min(max, m.hp + max * (now - (m.t || now)) / healMs(m));
    if (m.fainted && m.hp >= max) m.fainted = false;
    m.t = now;
  }
}
function healLeftMs(m){
  const max = monStats(m).hp;
  return m.hp >= max ? 0 : (max - m.hp) / max * healMs(m);
}
const fmtTime = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- Výměna pokémona v boji ---------- */
function sendMon(uid){
  const m = monByUid(uid);
  if (!m) return false;
  if (m.fainted){ toast(`${NAMES[m.id - 1]} se ještě léčí (${fmtTime(healLeftMs(m))}).`); return false; }
  if (!inTeam(m)){
    if (party.team.length >= TEAM_MAX){ toast('Tým je plný – nejdřív někoho dej do boxu.'); return false; }
    party.team.push(m.uid);
  }
  if (party.active === uid && !playerBox.hidden && monState.get(playerBox) !== 'faint') return true;
  healTick();
  party.active = uid;
  saveParty();
  sendToBattle({ id: m.id, shiny: m.shiny, uid: m.uid });
  return true;
}
// z deníku: pošle nejsilnějšího zdravého jedince daného druhu
function sendSpeciesToBattle(id, shiny){
  const c = party.mons.filter(m => m.id === id && !m.fainted).sort((a, b) => (b.shiny === shiny) - (a.shiny === shiny) || b.lvl - a.lvl);
  if (!c.length){ toast(`Žádný zdravý ${NAMES[id - 1]} – všichni se léčí.`); return false; }
  return sendMon(c[0].uid);
}

/* ---------- Společné kousky UI: hvězdy, stav, staty, evoluce ---------- */
const qstars = n => `<span class="stars" title="${n}★">${'<i class="qstar"></i>'.repeat(n)}</span>`;
const hpClass = p => p > 0.5 ? '' : p > 0.2 ? 'mid' : 'low';
const typeChips = id => monTypes(id).map(t => `<span class="type" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`).join('');

function monStatus(m){
  const max = monStats(m).hp;
  if (m.fainted) return { text: `Omdlel · léčí se ${fmtTime(healLeftMs(m))}`, cls: 'bad' };
  if (m.uid === party.active) return { text: 'V boji', cls: 'ok' };
  if (m.hp < max) return { text: `Léčí se · ${fmtTime(healLeftMs(m))}`, cls: '' };
  return { text: 'Připraven', cls: 'ok' };
}

// co je potřeba na evoluci (text, průběh) a jestli to tenhle jedinec (m) už splňuje
function evoReq(e, m){
  if (e.kind === 'lvl'){
    const left = m ? e.param - m.lvl : null;
    return { text: `Level ${e.param}`, prog: m && left > 0 ? `ještě ${left} lvl` : '', ok: !!m && left <= 0 };
  }
  if (e.kind === 'item'){
    const n = itemCount(e.param);
    return { text: EVO_ITEMS[e.param] || e.param, prog: n ? `máš ${n}×` : 'v obchodě', ok: !!m && n > 0 };
  }
  if (e.kind === 'trade'){
    const have = ['cable', ...(e.param ? [e.param] : [])].every(k => itemCount(k) > 0);
    return { text: 'Spojovací kabel' + (e.param ? ' + ' + (EVO_ITEMS[e.param] || e.param) : ''), prog: have ? 'máš vše' : 'v obchodě', ok: !!m && have };
  }
  if (e.kind === 'friend'){
    const f = Math.floor(m?.friend || 0), timeOk = !e.param || (e.param === 'day') === isDay();
    return {
      text: 'Přátelství' + (e.param === 'day' ? ' · ve dne' : e.param === 'night' ? ' · v noci' : ''),
      prog: m ? `${Math.min(f, FRIEND_MAX)}/${FRIEND_MAX}${f >= FRIEND_MAX && !timeOk ? ' · jiná denní doba' : ''}` : `${FRIEND_MAX} bodů`,
      ok: !!m && f >= FRIEND_MAX && timeOk,
    };
  }
  return { text: '?', prog: '', ok: false };
}
// řádky evoluce: z čeho se vyvinul + v co se může vyvinout (m = konkrétní jedinec, nepovinné)
function evoHtml(id, m){
  const row = (toId, req, label) => `<div class="evo-row ${dex[toId]?.caught ? 'link' : ''}" data-dex="${toId}">
      <img alt="" src="${spriteUrl(toId, { animated: false })}">
      <div><div class="en">${label} ${NAMES[toId - 1]}</div>${req ? `<div class="er">${req.text}</div>` : ''}</div>
      ${req?.ok && m ? `<button class="btn primary" data-evolve="${m.uid}" data-to="${toId}">Vyvinout</button>`
        : req?.prog ? `<span class="ep">${req.prog}</span>` : ''}
    </div>`;
  const pre = MON_PREVO[id];
  const next = monEvolutions(id);
  let html = pre ? row(pre, null, 'Z:') : '';
  html += next.map(e => row(e.to, evoReq(e, m), '→')).join('');
  if (!next.length) html += `<div class="evo-none">${pre ? 'Konečná forma – dál se nevyvíjí.' : 'Tenhle pokémon se nevyvíjí.'}</div>`;
  return `<div class="evo">${html}</div>`;
}

// staty jedince: HP, EXP, Útok, Obrana, Rychlost + stav (sdílené s deníkem)
function monDetailHtml(m){
  const s = monStats(m), hp = m.hp / s.hp, st = monStatus(m);
  const cap = Math.max(10, Math.floor((150 * 2 * m.lvl / 100 + 5) * 1.3));   // ~ silný pokémon na stejném levelu
  const stat = (k, v, col) => `<div class="md-line"><span class="k">${k}</span><div class="statbar" style="--sc:${col}"><i style="width:${Math.min(100, v / cap * 100)}%"></i></div><span class="v">${v}</span></div>`;
  return `<div class="md">
    <div class="md-line"><span class="k">HP</span><div class="hpbar"><i class="${hpClass(hp)}" data-hp="${m.uid}" style="width:${hp * 100}%"></i></div><span class="v" data-hpv="${m.uid}">${Math.ceil(m.hp)}/${s.hp}</span></div>
    <div class="md-line"><span class="k">EXP</span><div class="xpbar"><i style="width:${m.lvl >= 100 ? 100 : m.xp / xpToNext(m.lvl) * 100}%"></i></div><span class="v">${m.lvl >= 100 ? 'max' : `${m.xp}/${xpToNext(m.lvl)}`}</span></div>
    ${stat('Útok', s.atk, '#f0805f')}${stat('Obrana', s.def, '#6ba3e0')}${stat('Rychl.', s.spe, '#7ae08a')}
    <div class="md-line"><span class="k">Přátel.</span><div class="statbar" style="--sc:#f0a0c8"><i style="width:${Math.min(100, (m.friend || 0) / FRIEND_MAX * 100)}%"></i></div><span class="v">${Math.min(FRIEND_MAX, Math.floor(m.friend || 0))}</span></div>
    <div class="md-status ${st.cls}" data-status="${m.uid}">${st.text}</div>
  </div>`;
}

/* ---------- Panel Tým: seznam vlevo, detail vybraného vpravo ---------- */
const teamEl = document.getElementById('team');
const teamBody = document.getElementById('teamBody');
const teamDetail = document.getElementById('teamDetail');
let teamSel = 0;

function monTileHtml(m){
  const s = monStats(m), p = m.hp / s.hp, R = RARITIES[monRarity(m.id)];
  const badge = m.uid === party.active ? 'V boji' : m.fainted ? 'Omdlel' : '';
  return `<div class="mon-tile ${m.uid === teamSel ? 'sel' : ''} ${m.fainted ? 'fainted' : ''}" data-sel="${m.uid}" style="--rc:${R.color}">
    ${badge ? `<span class="badge">${badge}</span>` : ''}
    <img alt="" src="${spriteUrl(m.id, { shiny: m.shiny, animated: false })}">
    <div class="mt-name">${m.shiny ? STAR : ''}${NAMES[m.id - 1]}</div>
    <div class="mt-sub">Lv ${m.lvl} ${qstars(m.stars)}</div>
    <div class="hpbar"><i class="${hpClass(p)}" data-hp="${m.uid}" style="width:${p * 100}%"></i></div>
  </div>`;
}
function renderTeam(){
  healTick();
  if (!monByUid(teamSel)) teamSel = party.active;
  const team = party.team.map(monByUid).filter(Boolean);
  const box = party.mons.filter(m => !inTeam(m)).sort((a, b) => b.lvl - a.lvl || b.stars - a.stars);
  document.getElementById('teamStats').textContent = `${team.length}/${TEAM_MAX} v týmu · ${party.mons.length} pokémonů celkem`;
  const empty = Array.from({ length: TEAM_MAX - team.length }, () => '<div class="mon-tile empty">volné místo</div>').join('');
  teamBody.innerHTML =
    `<div class="dm-section">Tým</div><div class="team-slots">${team.map(monTileHtml).join('')}${empty}</div>` +
    `<div class="dm-section">Box · ${box.length}</div>` +
    (box.length ? `<div class="box-grid">${box.map(monTileHtml).join('')}</div>` : '<div class="dm-empty">Box je prázdný. Další pokémony chytíš na lovu.</div>');
  renderTeamDetail();
}
function renderTeamDetail(){
  const m = monByUid(teamSel);
  if (!m){ teamDetail.innerHTML = ''; return; }
  const active = m.uid === party.active;
  teamDetail.innerHTML = `
    <div class="side-stage" style="background-image:url(${pxSpotlight(TYPE_COLORS[monTypes(m.id)[0]] || '#e8a050')})"><img alt="" src="${spriteUrl(m.id, { shiny: m.shiny })}"></div>
    <div class="sd-name">${m.shiny ? STAR : ''}${NAMES[m.id - 1]} ${qstars(m.stars)}</div>
    <div class="dm-sub">Lv ${m.lvl} · #${pad3(m.id)} · <span class="tag" style="--rc:${RARITIES[monRarity(m.id)].color}">${RARITIES[monRarity(m.id)].name}</span></div>
    <div class="sd-types">${typeChips(m.id)}</div>
    ${monDetailHtml(m)}
    <div class="sd-items">
      ${teamItems(m).map(u => `<button class="btn" data-use="${u.k}" data-uid="${m.uid}"><img alt="" src="${itemIcon(u.k)}">${u.label}</button>`).join('')}
      ${(() => { const x = mergeCandidate(m); return x ? `<button class="btn" data-merge="${m.uid}" data-with="${x.uid}" title="Kopie zmizí, tenhle pokémon dostane +1 ★">Spojit s kopií → ${m.stars + 1}★</button>` : ''; })()}
    </div>
    <div class="sd-actions">
      ${active ? '<span class="btn" style="cursor:default">V boji</span>' : `<button class="btn primary" data-send="${m.uid}">Do boje</button>`}
      ${inTeam(m) ? (active ? '' : `<button class="btn" data-box="${m.uid}">Do boxu</button>`) : `<button class="btn" data-team="${m.uid}">Do týmu</button>`}
    </div>
    <div class="dm-section" style="margin-top:20px">Evoluce</div>
    ${evoHtml(m.id, m)}`;
  if (typeof sheet !== 'undefined' && sheet?.kind === 'team') renderSheet();   // DS karta (sheet.js)
}
// jednou za vteřinu jen HP lišty a odpočty (bez překreslení, ať neztratíš klik)
function refreshTeam(){
  healTick();
  for (const m of party.mons){
    const p = m.hp / monStats(m).hp;
    teamEl.querySelectorAll(`[data-hp="${m.uid}"]`).forEach(bar => { bar.style.width = p * 100 + '%'; bar.className = hpClass(p); });
    const v = teamEl.querySelector(`[data-hpv="${m.uid}"]`);
    if (v) v.textContent = `${Math.ceil(m.hp)}/${monStats(m).hp}`;
    const st = teamEl.querySelector(`[data-status="${m.uid}"]`);
    if (st){ const x = monStatus(m); st.textContent = x.text; st.className = 'md-status ' + x.cls; }
  }
}
function openTeam(){
  if (hunt) return;
  closePanel(); closeJournal(); closeShop();
  teamSel = party.active;
  teamEl.classList.add('open');
  renderTeam();
  teamPreview(teamSel);                 // DS: vybraný pokémon nahoře (sheet.js)
}
function closeTeam(){
  teamEl.classList.remove('open');
  if (sheet?.kind === 'team') closeSheet();
  if (!sheet) hideStage();
}

document.getElementById('teamBtn').addEventListener('click', openTeam);
document.getElementById('teamClose').addEventListener('click', closeTeam);
teamEl.addEventListener('pointerdown', (e) => { if (e.target === teamEl) closeTeam(); });
teamEl.addEventListener('click', (e) => {
  const tile = e.target.closest('[data-sel]');
  if (tile){ teamSel = Number(tile.dataset.sel); renderTeam(); if (isDs()) openSheet('team'); return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.send){ if (sendMon(Number(b.dataset.send))) closeTeam(); }
  else if (b.dataset.box){ party.team = party.team.filter(u => u !== Number(b.dataset.box)); saveParty(); renderTeam(); }
  else if (b.dataset.team){
    if (party.team.length >= TEAM_MAX) return toast('Tým je plný – nejdřív někoho dej do boxu.');
    party.team.push(Number(b.dataset.team)); saveParty(); renderTeam();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if ((e.key === 't' || e.key === 'T') && !hunt) teamEl.classList.contains('open') ? closeTeam() : openTeam();
  if (e.key === 'Escape') closeTeam();
});
setInterval(() => {
  if (teamEl.classList.contains('open')) refreshTeam();
  else healTick();
  saveParty();
}, 1000);
