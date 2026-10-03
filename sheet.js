/* =====================================================================
   DS karta pokémona: nahoře velký animovaný pokémon v záři, dole
   přehledné info rozdělené do záložek (Staty / Info / Evoluce / Předměty)
   ---------------------------------------------------------------------
   Používá detail v deníku (openDetail v index.html) i Tým (party.js),
   jen v DS rozložení. Tlačítka v kartě používají stejné data-atributy
   jako původní panely (data-evolve, data-use, data-merge…), takže
   akce obsluhují stávající handlery.
   ===================================================================== */

const dsStage = document.createElement('div');
dsStage.className = 'ds-stage';
dsStage.innerHTML = '<img alt=""><b></b>';
document.body.appendChild(dsStage);
const dsSheet = document.createElement('div');
dsSheet.className = 'ds-sheet';
dsSheet.id = 'dsSheet';
document.body.appendChild(dsSheet);

let sheet = null;                // { kind: 'dex' | 'team', tab }
const isDs = () => document.body.classList.contains('ds');

// horní displej: pokémon v záři + nadpis
function showStage(id, shiny, title){
  const img = dsStage.querySelector('img'), src = spriteUrl(id, { shiny });
  if (img.getAttribute('src') !== src) img.src = src;
  dsStage.querySelector('b').textContent = title;
  dsStage.style.backgroundImage = `url(${pxSpotlight(TYPE_COLORS[monTypes(id)[0]] || '#e8a050')})`;
  dsStage.classList.add('open');
}
function hideStage(){ dsStage.classList.remove('open'); }

/* ---------- obsah záložek ---------- */
const fmtDate = ts => new Date(ts).toLocaleDateString('cs-CZ');
function sheetRow(k, v){ return `<div class="sh-row"><span>${k}</span><b>${v}</b></div>`; }

function sheetData(){
  if (sheet.kind === 'dex'){
    const id = detail.id, shiny = detail.shiny, e = dex[id] || {};
    const copies = party.mons.filter(m => m.id === id).sort((a, b) => (b.shiny === shiny) - (a.shiny === shiny) || b.lvl - a.lvl || b.stars - a.stars);
    const m = copies[detail.copyIdx] || null;
    return { id, shiny, m, copies, e };
  }
  const m = monByUid(teamSel);
  return { id: m.id, shiny: m.shiny, m, copies: null, e: dex[m.id] || {} };
}

function tabStats({ m }){
  if (!m) return '<div class="sh-empty">Tohohle pokémona zrovna nemáš.<br>Chyť ho na lovu a uvidíš jeho staty.</div>';
  return `<div class="sh-sub">${inTeam(m) ? 'V týmu' : 'V boxu'} · chycen ${fmtDate(m.caught || Date.now())}</div>${monDetailHtml(m)}`;
}
function tabInfo({ id, shiny, m, e }){
  const R = RARITIES[monRarity(id)];
  let html = '';
  if (sheet.kind === 'dex') html += `<div class="sh-toggle">
      <button class="btn ${!shiny ? 'on' : ''}" data-sh="normal">Normální</button>
      <button class="btn ${shiny ? 'on' : ''}" data-sh="shiny" ${e.shiny ? '' : 'disabled'}><i class="pstar"></i>Shiny</button>
    </div>`;
  html += sheetRow('Vzácnost', `<span class="tag" style="--rc:${R.color}">${R.name}</span>`)
    + sheetRow('Generace', `${genOf(id)} (${GENS[genOf(id) - 1][2]})`)
    + sheetRow('Žije v aréně', ARENAS[habitatOf(id)]?.name || '—')
    + sheetRow('Poprvé chycen', e.caught ? fmtDate(e.caught) : '—')
    + sheetRow('Shiny', e.shiny ? 'od ' + fmtDate(e.shiny) : 'zatím ne')
    + sheetRow('Chyceno / poraženo', `${e.catches || 0}× / ${e.count || 0}×`);
  if (m) html += sheetRow('Tvoje kopie', `Lv ${m.lvl} ${qstars(m.stars)} · ${inTeam(m) ? 'v týmu' : 'v boxu'}`);
  return html;
}
function tabItems({ m }){
  const items = teamItems(m).map(u => `<button class="btn" data-use="${u.k}" data-uid="${m.uid}"><img alt="" src="${itemIcon(u.k)}">${u.label}</button>`).join('');
  const x = mergeCandidate(m);
  const merge = x ? `<button class="btn" data-merge="${m.uid}" data-with="${x.uid}">Spojit s kopií → ${m.stars + 1}★</button>` : '';
  return items || merge ? `<div class="sh-items">${items}${merge}</div>` : '<div class="sh-empty">Žádný předmět teď nejde použít.<br>Lektvary, bonbóny a kameny koupíš v Obchodě.</div>';
}

function renderSheet(){
  if (!sheet) return;
  if (sheet.kind === 'team' && !monByUid(teamSel)) return closeSheet();
  const d = sheetData(), { id, shiny, m } = d;
  const tabs = [['stats', 'Staty'], ['info', 'Info'], ['evo', 'Evoluce']];
  if (sheet.kind === 'team') tabs.push(['items', 'Předměty']);
  if (!tabs.some(t => t[0] === sheet.tab)) sheet.tab = 'stats';
  const body = sheet.tab === 'stats' ? tabStats(d) : sheet.tab === 'info' ? tabInfo(d) : sheet.tab === 'items' ? tabItems(d) : evoHtml(id, m);
  const active = m && m.uid === party.active;
  let foot = '';
  if (sheet.kind === 'dex'){
    const n = d.copies.length;
    foot = `<button class="btn" data-sh="prev" ${n < 2 ? 'disabled' : ''}>◀</button>
      <span class="sh-copy">${n ? `Kopie ${detail.copyIdx + 1}/${n}` : 'Žádná kopie'}</span>
      <button class="btn" data-sh="next" ${n < 2 ? 'disabled' : ''}>▶</button>
      <button class="btn primary" data-sh="send" ${!m || active ? 'disabled' : ''}>${!m ? 'Do boje' : active ? 'V boji' : m.fainted ? 'Léčí se' : 'Do boje'}</button>`;
  } else {
    foot = `${active ? '<span class="sh-copy">V boji</span>' : `<button class="btn primary" data-send="${m.uid}">Do boje</button>`}
      ${inTeam(m) ? (active ? '' : `<button class="btn" data-box="${m.uid}">Do boxu</button>`) : `<button class="btn" data-team="${m.uid}">Do týmu</button>`}
      <button class="btn" data-sh="close">Zpět</button>`;
  }
  dsSheet.innerHTML = `<div class="sh-in">
    <div class="sh-head">
      <div class="sh-title">
        <b>${shiny ? STAR : ''}${NAMES[id - 1]}</b>
        <span>#${pad3(id)}${m ? ` · Lv ${m.lvl}` : ''}</span>${m ? qstars(m.stars) : ''}
      </div>
      <div class="sh-types">${typeChips(id)}</div>
      <button class="dm-close" data-sh="close" title="Zavřít (B)">✕</button>
    </div>
    <div class="sh-tabs">${tabs.map(([k, l]) => `<button class="dm-tab ${k === sheet.tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="sh-body sh-${sheet.tab}">${body}</div>
    <div class="sh-foot">${foot}</div>
  </div>`;
  showStage(id, shiny, `#${pad3(id)} ${NAMES[id - 1]}`);
}

function openSheet(kind){
  if (!isDs()) return;
  if (!sheet || sheet.kind !== kind) sheet = { kind, tab: 'stats' };
  dsSheet.classList.add('open');
  renderSheet();
}
// B / ✕: z deníku zavře detail, z Týmu se vrátí na seznam
function closeSheet(){
  if (!sheet) return;
  const kind = sheet.kind;
  sheet = null;
  dsSheet.classList.remove('open');
  if (kind === 'dex'){ hideStage(); if (dexDetail.classList.contains('open')) closeDetail(); }
  else if (teamEl.classList.contains('open')) teamPreview(teamSel);
  else hideStage();
}
// Tým (DS): na horním displeji pokémon, na kterém je výběr
function teamPreview(uid){
  const m = monByUid(uid);
  if (!m || !isDs() || !teamEl.classList.contains('open') || sheet) return;
  showStage(m.id, m.shiny, `${NAMES[m.id - 1]} · Lv ${m.lvl}`);
}

dsSheet.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t){ sheet.tab = t.dataset.tab; renderSheet(); return; }
  const b = e.target.closest('[data-sh]');
  if (b && !b.disabled){
    const a = b.dataset.sh;
    if (a === 'close') return closeSheet();
    if (a === 'prev') return stepCopy(-1);
    if (a === 'next') return stepCopy(1);
    if (a === 'normal') return openDetail(detail.id, false);
    if (a === 'shiny') return openDetail(detail.id, true);
    if (a === 'send') return document.getElementById('detailSend').click();
  }
  // Tým: Do boje / Do boxu / Do týmu (jako v panelu Tým, party.js)
  const tb = e.target.closest('[data-send], [data-box], [data-team]');
  if (!tb || sheet?.kind !== 'team') return;
  if (tb.dataset.send){ if (sendMon(Number(tb.dataset.send))){ closeSheet(); closeTeam(); } }
  else if (tb.dataset.box){ party.team = party.team.filter(u => u !== Number(tb.dataset.box)); saveParty(); renderTeam(); }
  else if (tb.dataset.team){
    if (party.team.length >= TEAM_MAX) return toast('Tým je plný – nejdřív někoho dej do boxu.');
    party.team.push(Number(tb.dataset.team)); saveParty(); renderTeam();
  }
});

document.head.insertAdjacentHTML('beforeend', `<style>
/* horní displej: velký pokémon v záři */
.ds-stage{ display:none; }
body.ds .ds-stage.open{
  display:flex; position:fixed; z-index:42; align-items:flex-end; justify-content:center;
  left:var(--tx); top:var(--ty); width:var(--tw); height:var(--th);
  background:var(--w-bg) center / cover no-repeat; image-rendering:pixelated; pointer-events:none;
}
.ds-stage img{ height:66%; margin-bottom:9%; image-rendering:pixelated; }
.ds-stage b{
  position:absolute; left:50%; top:calc(10px * var(--dsk)); transform:translateX(-50%);
  font:700 calc(16px * var(--dsk)) var(--font-title); letter-spacing:.06em; color:#fff; text-shadow:var(--outline); white-space:nowrap;
}
/* spodní displej: karta se záložkami */
.ds-sheet{ display:none; }
body.ds .ds-sheet.open{ display:block; position:fixed; z-index:86; left:var(--bx); top:var(--by); width:var(--bw); height:var(--bh); background:var(--w-bg); color:var(--w-fg); font-family:var(--font-body); -webkit-font-smoothing:none; }
.sh-in{ zoom:var(--dsk); width:calc(var(--bw) / var(--dsk)); height:calc(var(--bh) / var(--dsk)); display:flex; flex-direction:column; box-sizing:border-box; }
.sh-head{ display:flex; align-items:center; gap:8px; padding:8px 6px 4px 12px; }
.sh-title{ flex:1; min-width:0; display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
.sh-title b{ font:700 15px var(--font-title); letter-spacing:.04em; display:flex; align-items:center; gap:4px; }
.sh-title span{ font:11px var(--font-title); color:var(--w-muted); }
.sh-types{ display:flex; gap:4px; }
.sh-types .type{ font-size:9px; padding:3px 6px 2px; }
.sh-head .dm-close{ margin-left:0; font-size:14px; padding:6px 8px; }
.sh-tabs{ display:flex; gap:18px; padding:0 12px; box-shadow:inset 0 -2px 0 var(--w-line); }
.sh-tabs .dm-tab{ font-size:10px; padding:5px 0 7px; }
.sh-body{ flex:1 1 auto; min-height:0; overflow-y:auto; padding:10px 14px; scrollbar-width:thin; scrollbar-color:var(--w-faint) transparent; }
.sh-foot{ display:flex; align-items:center; gap:6px; padding:7px 12px 9px; box-shadow:inset 0 2px 0 var(--w-line); }
.sh-foot .btn{ padding:7px 10px 6px; font-size:10px; }
.sh-foot .btn.primary{ margin-left:auto; min-width:110px; }
.sh-copy{ font:700 10px var(--font-title); letter-spacing:.06em; color:var(--w-muted); text-transform:uppercase; min-width:76px; text-align:center; }
.sh-sub{ font-size:11px; color:var(--w-muted); margin-bottom:8px; }
.sh-empty{ color:var(--w-muted); font-size:12px; line-height:1.6; text-align:center; padding-top:30px; }
/* Staty: větší řádky přes celou šířku */
.sh-stats .md{ gap:9px; }
.sh-stats .md-line{ font-size:12px; gap:10px; }
.sh-stats .md-line .k{ font-size:10px; width:72px; flex:none; }
.sh-stats .md-line .v{ font-size:11px; min-width:62px; }
.sh-stats .hpbar, .sh-stats .xpbar, .sh-stats .statbar{ height:8px; }
.sh-stats .md-status{ font-size:11px; margin-top:2px; }
/* Info: tabulka */
.sh-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; box-shadow:inset 0 -1px 0 var(--w-line); font-size:11px; }
.sh-row span{ color:var(--w-muted); }
.sh-row b{ font-weight:400; display:flex; align-items:center; gap:4px; }
.sh-toggle{ display:flex; gap:6px; margin-bottom:6px; }
.sh-toggle .btn{ flex:1; justify-content:center; }
/* Evoluce + předměty */
.sh-evo .evo{ gap:8px; }
.sh-evo .evo-row{ padding:6px 8px; gap:10px; }
.sh-evo .evo-row img{ width:44px; height:44px; margin:-6px 0; }
.sh-evo .evo-row .en{ font-size:11px; }
.sh-evo .evo-row .er, .sh-evo .evo-row .ep{ font-size:10px; }
.sh-items{ display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.sh-items .btn{ justify-content:flex-start; gap:6px; font-size:10px; padding:7px 8px; }
.sh-items .btn img{ width:18px; height:18px; image-rendering:pixelated; }
/* v DS nahrazuje karta starý detail deníku a boční detail Týmu */
body.ds .dex-detail{ visibility:hidden; }
body.ds .side-detail{ display:none !important; }
</style>`);
