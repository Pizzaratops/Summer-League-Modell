// ══════════════════════════════════════════════════════════════════
// FA OFFER SHEET BUILDER v2 — plugs into the existing Tools tab.
// Models real league offer-sheet conventions (see Chris/Daniel/Billy/Joni
// examples in the forum): starting offer -> fallback ceiling, raise %,
// exception source, fallback-option chains, contingency conditions, and
// grouped sections (e.g. "Own Free Agents" vs "FA Targets"), plus two
// export styles (narrative / arrow) and an optional two-way list.
//
// Reads FAS (name/fpg) from the app's own data/data.json (always fresh
// via the Google Sheets Action) and enriches it with data/fa-value-tiers.json
// (static snapshot: composite of last-season production + StickyScore +
// TTHQ-live-Z + ESPN real-fit signal — regenerate by hand, does not
// auto-refresh like FAS does).
// ══════════════════════════════════════════════════════════════════

let FAB_TIERS = {};
let FAB_STATE = { groups: [], targets: [], tways: [] };
let FAB_ID = 1;
let FAB_READY = false;

const FAB_TIER_CLASS = { "Star/Max": "star", "Non-Tax MLE": "mle", "BAE": "bae", "Vet-Min": "vetmin", "Two-Way": "tway" };
const FAB_TIER_LABEL = {
  "Star/Max": "Star / Max (kein MPE)", "Non-Tax MLE": "Non-Tax MLE ($15.0M)",
  "BAE": "BAE ($5.5M)", "Vet-Min": "Vet-Min", "Two-Way": "Two-Way"
};
const FAB_EXCEPTIONS = ["", "MLE", "EBR", "Full Bird", "Non-Bird", "Room", "TPE", "Cap Space"];
const FAB_DEFAULT_GROUPS = [
  { name: "Own Free Agents", note: "sign beide via Bird Rights" },
  { name: "FA Targets", note: "sign 1 via MLE" },
];

async function fabInit() {
  if (FAB_READY) return;
  try {
    const res = await fetch('data/fa-value-tiers.json', { cache: 'no-store' });
    FAB_TIERS = res.ok ? await res.json() : {};
  } catch (e) { FAB_TIERS = {}; }
  fabLoadState();
  FAB_READY = true;
}

function fabPlayerPool() {
  return (FAS || []).map(f => {
    const t = FAB_TIERS[f.name];
    return {
      name: f.name, fpg: f.fpg, signedTeam: f.signed_team || null,
      tierKey: t ? t.tier : null, tierLabel: t ? FAB_TIER_LABEL[t.tier] : null, composite: t ? t.composite : null,
    };
  });
}
function fabFindPlayer(name) {
  const n = (name || '').trim().toLowerCase();
  return fabPlayerPool().find(p => p.name.toLowerCase() === n);
}

// ── persistence ──
function fabLoadState() {
  try {
    const raw = localStorage.getItem('nbafo_fa_bidding_v2');
    if (raw) {
      FAB_STATE = JSON.parse(raw);
      const ids = [...FAB_STATE.targets, ...FAB_STATE.tways].map(x => x.id || 0);
      FAB_ID = (ids.length ? Math.max(...ids) : 0) + 1;
    }
  } catch (e) {}
  if (!FAB_STATE.groups || !FAB_STATE.groups.length) {
    FAB_STATE.groups = FAB_DEFAULT_GROUPS.map(g => ({ ...g }));
  }
}
function fabSaveState() { try { localStorage.setItem('nbafo_fa_bidding_v2', JSON.stringify(FAB_STATE)); } catch (e) {} }
function fabGetSetting(key, fallback) { const v = localStorage.getItem('nbafo_fab_' + key); return v === null ? fallback : v; }
function fabSetSetting(key, val) { localStorage.setItem('nbafo_fab_' + key, val); }

// ── shell ──
function fabRenderShell() {
  const el = document.getElementById('tool-fabidding');
  if (!el || el.dataset.fabBuilt) return;
  el.dataset.fabBuilt = '1';
  el.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-title">💵 FA Offer Sheet Builder</div>
      <p style="font-size:12px;color:var(--dim);margin-bottom:12px">Start-Angebot, Fallback-Ceiling, Exceptions, Bedingungen — als fertiger Forum-Post exportierbar.</p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Intro-Text</label>
          <input class="form-input" type="text" id="fab-intro" oninput="fabOnSettingChange()">
        </div>
        <div class="form-group" style="max-width:160px">
          <label class="form-label">Export-Format</label>
          <select class="form-select" id="fab-format" onchange="fabOnSettingChange()">
            <option value="narrative">Narrativ (Chris-Stil)</option>
            <option value="arrow">Pfeil (Joni-Stil)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Update-Notiz (optional, nur bei Folge-Posts)</label>
          <input class="form-input" type="text" id="fab-updatenote" placeholder="z.B. Adding PlayerX. Upping PlayerI a bit." oninput="fabOnSettingChange()">
        </div>
      </div>
    </div>

    <div class="tool-card">
      <div class="tool-card-title">Gruppen</div>
      <p style="font-size:11px;color:var(--dim);margin-bottom:10px">Jede Gruppe = eigener Abschnitt im Export (z.B. eigene Bird-Rights-FAs vs. externe MLE-Targets).</p>
      <div id="fab-groups-list"></div>
      <button class="action-btn" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);margin-top:6px" onclick="fabAddGroup()">+ Gruppe</button>
    </div>

    <div class="tool-card">
      <div class="tool-card-title">Priority-Liste <span class="fab-pill" id="fab-target-count">0 Spieler</span></div>
      <div id="fab-targets-list"></div>
      <button class="action-btn" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);margin-top:6px" onclick="fabAddTarget()">+ Spieler hinzufügen</button>
    </div>

    <div class="tool-card">
      <div class="tool-card-title">Two-Way-Liste <span class="fab-pill" id="fab-tway-pill">0 / 0</span></div>
      <div class="form-row">
        <div class="form-group" style="max-width:110px">
          <label class="form-label">Max. Two-Ways</label>
          <input class="form-input" type="number" min="0" id="fab-tway-cap" onchange="fabOnSettingChange()">
        </div>
        <div class="form-group">
          <label class="form-label">Konditionen (für alle gleich)</label>
          <input class="form-input" type="text" id="fab-tway-terms" oninput="fabOnSettingChange()">
        </div>
      </div>
      <div id="fab-tways-list"></div>
      <button class="action-btn" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);margin-top:6px" onclick="fabAddTway()">+ Two-Way-Kandidat hinzufügen</button>
    </div>

    <div class="tool-card">
      <div class="tool-card-title">Forum-Post</div>
      <pre class="fab-export" id="fab-export"></pre>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
        <button class="action-btn" onclick="fabCopyExport()">Kopieren</button>
        <button class="action-btn" style="background:var(--red-dim);color:var(--red)" onclick="fabResetAll()">Alles zurücksetzen</button>
        <span class="fab-copied" id="fab-copied" style="display:none">Kopiert ✓</span>
      </div>
    </div>
  `;
  document.getElementById('fab-intro').value = fabGetSetting('intro', 'Please find below the FA list for our team.');
  document.getElementById('fab-format').value = fabGetSetting('format', 'narrative');
  document.getElementById('fab-updatenote').value = fabGetSetting('updatenote', '');
  document.getElementById('fab-tway-cap').value = fabGetSetting('twaycap', 2);
  document.getElementById('fab-tway-terms').value = fabGetSetting('twayterms', '1-year deal. Non-guaranteed 2nd year möglich, keine 2-Jahres-Garantien.');
}

function fabOnSettingChange() {
  fabSetSetting('intro', document.getElementById('fab-intro').value);
  fabSetSetting('format', document.getElementById('fab-format').value);
  fabSetSetting('updatenote', document.getElementById('fab-updatenote').value);
  fabSetSetting('twaycap', document.getElementById('fab-tway-cap').value);
  fabSetSetting('twayterms', document.getElementById('fab-tway-terms').value);
  fabRenderExport();
}

// ── groups ──
function fabAddGroup() {
  FAB_STATE.groups.push({ name: 'Neue Gruppe', note: '' });
  fabSaveState(); fabRenderAll();
}
function fabRemoveGroup(idx) {
  const g = FAB_STATE.groups[idx];
  if (FAB_STATE.targets.some(t => t.group === g.name)) {
    if (!confirm(`Gruppe "${g.name}" hat noch Spieler zugewiesen. Trotzdem löschen? (Spieler bleiben, Gruppen-Feld wird geleert)`)) return;
    FAB_STATE.targets.forEach(t => { if (t.group === g.name) t.group = ''; });
  }
  FAB_STATE.groups.splice(idx, 1);
  fabSaveState(); fabRenderAll();
}
function fabUpdateGroup(idx, field, val) {
  const old = FAB_STATE.groups[idx].name;
  FAB_STATE.groups[idx][field] = val;
  if (field === 'name') FAB_STATE.targets.forEach(t => { if (t.group === old) t.group = val; });
  fabSaveState(); fabRenderAll();
}
function fabRenderGroups() {
  const wrap = document.getElementById('fab-groups-list');
  if (!wrap) return;
  wrap.innerHTML = FAB_STATE.groups.map((g, idx) => `
    <div class="fab-group-row">
      <input class="form-input" type="text" value="${g.name.replace(/"/g, '&quot;')}" onchange="fabUpdateGroup(${idx},'name',this.value)" placeholder="Gruppenname">
      <input class="form-input" type="text" value="${(g.note || '').replace(/"/g, '&quot;')}" onchange="fabUpdateGroup(${idx},'note',this.value)" placeholder="Notiz, z.B. sign 1 using MLE">
      <button class="fab-del" onclick="fabRemoveGroup(${idx})">✕</button>
    </div>`).join('');
}

// ── targets ──
function fabAddTarget() {
  FAB_STATE.targets.push({
    id: FAB_ID++, name: '', group: FAB_STATE.groups[0] ? FAB_STATE.groups[0].name : '',
    exception: '', years: 2, hasTO: true, hasPO: false,
    startAmt: '', ceilAmt: '', raise: 5,
    fallback: '', condition: '', sidenote: ''
  });
  fabSaveState(); fabRenderAll();
}
function fabRemoveTarget(id) { FAB_STATE.targets = FAB_STATE.targets.filter(t => t.id !== id); fabSaveState(); fabRenderAll(); }
function fabMoveTarget(id, dir) {
  const i = FAB_STATE.targets.findIndex(t => t.id === id);
  const j = i + dir;
  if (j < 0 || j >= FAB_STATE.targets.length) return;
  [FAB_STATE.targets[i], FAB_STATE.targets[j]] = [FAB_STATE.targets[j], FAB_STATE.targets[i]];
  fabSaveState(); fabRenderAll();
}
function fabUpdateTarget(id, field, val) {
  const t = FAB_STATE.targets.find(t => t.id === id);
  if (field === 'years' || field === 'raise') val = Math.max(0, parseFloat(val) || 0);
  if (field === 'hasTO' || field === 'hasPO') val = !!val;
  t[field] = val;
  fabSaveState(); fabRenderTargets(); fabRenderExport();
}
function fabOnNameInput(id, val) {
  fabUpdateTarget(id, 'name', val);
  fabRenderAcList(id, val);
}
function fabOnNameFocus(id) { fabRenderAcList(id, FAB_STATE.targets.find(t => t.id === id).name); }
function fabHideAc(id) { const b = document.getElementById('fab-ac-' + id); if (b) b.style.display = 'none'; }
function fabRenderAcList(id, query) {
  const box = document.getElementById('fab-ac-' + id);
  if (!box) return;
  const q = (query || '').trim().toLowerCase();
  const pool = fabPlayerPool();
  let results = q ? pool.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8) : pool.slice(0, 8);
  if (!results.length) { box.style.display = 'none'; return; }
  box.innerHTML = results.map(p => `
    <div class="fab-ac-item" onmousedown="fabPickPlayer(${id},'${p.name.replace(/'/g, "\\'")}')">
      <span class="fab-ac-name">${p.name}</span>
      <span class="fab-ac-meta">${p.fpg != null ? p.fpg.toFixed(1) + ' FP/G' : '—'} · ${p.tierLabel || '?'}</span>
    </div>`).join('');
  box.style.display = 'block';
}
function fabPickPlayer(id, name) { fabUpdateTarget(id, 'name', name); fabHideAc(id); fabRenderAll(); }

// term notation for a target, style-aware
function fabTermNarrative(t) {
  const opt = t.hasTO ? ' w/TO' : (t.hasPO ? ' w/PO' : '');
  return `${t.years}/${t.startAmt || '?'} up to ${t.years}/${t.ceilAmt || '?'} (${t.exception ? 'Full ' + t.exception + ' ' : ''}w/${t.raise}% Raises).${opt ? opt + '.' : ''}`;
}
function fabTermArrow(t) {
  const base = t.years - (t.hasTO || t.hasPO ? 1 : 0);
  const optSuffix = t.hasTO ? `+1 TO` : (t.hasPO ? `+1 PO` : '');
  const term = base > 0 && optSuffix ? `${base}${optSuffix}` : `${t.years}`;
  return `${t.startAmt || '?'}M -> ${term} -> ${t.ceilAmt || '?'}M, ${term}, ${t.raise}% raises`;
}

function fabRenderTargets() {
  const wrap = document.getElementById('fab-targets-list');
  if (!wrap) return;
  if (!FAB_STATE.targets.length) {
    wrap.innerHTML = '<div class="fab-empty">Noch keine Spieler auf der Liste.</div>';
  } else {
    const groupNames = FAB_STATE.groups.map(g => g.name);
    wrap.innerHTML = FAB_STATE.targets.map((t, idx) => {
      const p = fabFindPlayer(t.name);
      const tierCls = p && p.tierKey ? FAB_TIER_CLASS[p.tierKey] : 'unknown';
      const tierLabel = p ? (p.tierLabel || '') : (t.name ? 'nicht in FA-Liste' : '');
      return `
      <div class="fab-target-row">
        <div class="fab-target-top">
          <span class="fab-rank">${idx + 1}.</span>
          <div class="fab-reorder">
            <button onclick="fabMoveTarget(${t.id},-1)" title="hoch">▲</button>
            <button onclick="fabMoveTarget(${t.id},1)" title="runter">▼</button>
          </div>
          <div class="fab-name-wrap">
            <input class="form-input" type="text" placeholder="Spielername…" value="${(t.name || '').replace(/"/g, '&quot;')}"
              oninput="fabOnNameInput(${t.id}, this.value)" onfocus="fabOnNameFocus(${t.id})"
              onblur="setTimeout(()=>fabHideAc(${t.id}),150)">
            <div class="fab-ac-list" id="fab-ac-${t.id}" style="display:none"></div>
          </div>
          ${tierLabel ? `<span class="fab-tier fab-tier-${tierCls}">${tierLabel}</span>` : ''}
          <button class="fab-del" onclick="fabRemoveTarget(${t.id})">✕</button>
        </div>

        <div class="fab-field-grid">
          <div class="fab-mini-field">
            <label>Gruppe</label>
            <select onchange="fabUpdateTarget(${t.id},'group',this.value)">
              <option value="">—</option>
              ${groupNames.map(g => `<option value="${g}" ${t.group === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </div>
          <div class="fab-mini-field">
            <label>Exception</label>
            <select onchange="fabUpdateTarget(${t.id},'exception',this.value)">
              ${FAB_EXCEPTIONS.map(e => `<option value="${e}" ${t.exception === e ? 'selected' : ''}>${e || '—'}</option>`).join('')}
            </select>
          </div>
          <div class="fab-mini-field">
            <label>Jahre (gesamt)</label>
            <input type="number" min="1" value="${t.years}" onchange="fabUpdateTarget(${t.id},'years',this.value)">
          </div>
          <div class="fab-mini-field fab-check">
            <label><input type="checkbox" ${t.hasTO ? 'checked' : ''} onchange="fabUpdateTarget(${t.id},'hasTO', this.checked); if(this.checked) document.getElementById('po-${t.id}').checked=false;"> TO (letztes Jahr)</label>
          </div>
          <div class="fab-mini-field fab-check">
            <label><input id="po-${t.id}" type="checkbox" ${t.hasPO ? 'checked' : ''} onchange="fabUpdateTarget(${t.id},'hasPO', this.checked); if(this.checked) fabUpdateTarget(${t.id},'hasTO', false);"> PO (letztes Jahr)</label>
          </div>
        </div>

        <div class="fab-field-grid">
          <div class="fab-mini-field">
            <label>Start-Angebot ($M gesamt)</label>
            <input type="text" placeholder="z.B. 20" value="${t.startAmt}" onchange="fabUpdateTarget(${t.id},'startAmt',this.value)">
          </div>
          <div class="fab-mini-field">
            <label>Ceiling / "up to" ($M gesamt)</label>
            <input type="text" placeholder="z.B. 45.1" value="${t.ceilAmt}" onchange="fabUpdateTarget(${t.id},'ceilAmt',this.value)">
          </div>
          <div class="fab-mini-field">
            <label>Raises %</label>
            <input type="number" min="0" step="0.5" value="${t.raise}" onchange="fabUpdateTarget(${t.id},'raise',this.value)">
          </div>
        </div>

        <div class="fab-mini-field" style="margin-top:6px">
          <label>Fallback-Optionen (eine pro Zeile, in Reihenfolge)</label>
          <textarea rows="2" placeholder="straight 3&#10;straight 4&#10;PO on 4th year (last resort)" onchange="fabUpdateTarget(${t.id},'fallback',this.value)">${t.fallback}</textarea>
        </div>
        <div class="fab-field-grid">
          <div class="fab-mini-field">
            <label>Bedingung (optional)</label>
            <input type="text" placeholder="z.B. Only if ultimately renounced (kein Offer Sheet)" value="${t.condition.replace(/"/g, '&quot;')}" onchange="fabUpdateTarget(${t.id},'condition',this.value)">
          </div>
          <div class="fab-mini-field">
            <label>Seiten-Notiz (optional)</label>
            <input type="text" placeholder="z.B. renounce Marshall, waive Goodwin" value="${t.sidenote.replace(/"/g, '&quot;')}" onchange="fabUpdateTarget(${t.id},'sidenote',this.value)">
          </div>
        </div>

        <div class="fab-preview">${t.name || '—'}${t.name ? ' – ' : ''}${fabTermNarrative(t)}</div>
      </div>`;
    }).join('');
  }
  document.getElementById('fab-target-count').textContent = FAB_STATE.targets.length + ' Spieler';
}

// ── two-way list ──
function fabAddTway() { FAB_STATE.tways.push({ id: FAB_ID++, name: '' }); fabSaveState(); fabRenderAll(); }
function fabRemoveTway(id) { FAB_STATE.tways = FAB_STATE.tways.filter(t => t.id !== id); fabSaveState(); fabRenderAll(); }
function fabOnTwayInput(id, val) { FAB_STATE.tways.find(t => t.id === id).name = val; fabSaveState(); fabRenderExport(); }
function fabRenderTways() {
  const wrap = document.getElementById('fab-tways-list');
  if (!wrap) return;
  if (!FAB_STATE.tways.length) {
    wrap.innerHTML = '<div class="fab-empty">Keine Two-Way-Kandidaten.</div>';
  } else {
    wrap.innerHTML = FAB_STATE.tways.map((t, idx) => `
      <div class="fab-tway-row">
        <span class="fab-rank" style="color:var(--orange)">${idx + 1}.</span>
        <input class="form-input" type="text" placeholder="Spielername…" value="${(t.name || '').replace(/"/g, '&quot;')}" oninput="fabOnTwayInput(${t.id}, this.value)">
        <button class="fab-del" onclick="fabRemoveTway(${t.id})">✕</button>
      </div>`).join('');
  }
  const cap = parseInt(document.getElementById('fab-tway-cap').value) || 0;
  const used = FAB_STATE.tways.length;
  const pill = document.getElementById('fab-tway-pill');
  pill.textContent = `${used} / ${cap}`;
  pill.className = 'fab-pill' + (used > cap ? ' over' : (used === cap && cap > 0 ? ' ok' : ''));
}

// ── export ──
function fabFallbackSentence(t) {
  if (!t.fallback || !t.fallback.trim()) return '';
  const lines = t.fallback.split('\n').map(s => s.trim()).filter(Boolean);
  return ' ' + lines.map((l, i) => (i === 0 ? `Will do ${l} if needed.` : `Then ${l} if needed.`)).join(' ');
}
function fabRenderExportNarrative() {
  const intro = document.getElementById('fab-intro').value.trim();
  const updateNote = document.getElementById('fab-updatenote').value.trim();
  let out = '';
  if (updateNote) { out += `**Update**\n\n${updateNote}\n\n`; }
  else if (intro) { out += intro + '\n\n'; }

  FAB_STATE.groups.forEach(g => {
    const items = FAB_STATE.targets.filter(t => t.group === g.name && t.name);
    if (!items.length) return;
    out += `${g.name}${g.note ? ' (' + g.note + ')' : ''}:\n`;
    items.forEach((t, i) => {
      let line = `${i + 1}) ${t.name} – ${fabTermNarrative(t)}${fabFallbackSentence(t)}`;
      if (t.condition) line += ` ${t.condition}.`;
      if (t.exception) line += ` Using ${t.exception}.`;
      if (t.sidenote) line += ` ${t.sidenote}.`;
      out += line + '\n';
    });
    out += '\n';
  });
  const ungrouped = FAB_STATE.targets.filter(t => !t.group && t.name);
  if (ungrouped.length) {
    ungrouped.forEach((t, i) => {
      let line = `${i + 1}. ${t.name} – ${fabTermNarrative(t)}${fabFallbackSentence(t)}`;
      if (t.condition) line += ` ${t.condition}.`;
      if (t.exception) line += ` Using ${t.exception}.`;
      if (t.sidenote) line += ` ${t.sidenote}.`;
      out += line + '\n';
    });
    out += '\n';
  }
  return out;
}
function fabRenderExportArrow() {
  const intro = document.getElementById('fab-intro').value.trim();
  const updateNote = document.getElementById('fab-updatenote').value.trim();
  let out = '';
  if (updateNote) { out += `**Update**\n\n${updateNote}\n\n`; }
  else if (intro) { out += intro + '\n\n'; }
  out += 'The offers will be in the following format:\n#) Player -> $$$ -> term (yrs) -> willing to offer, if needed\n\n';

  FAB_STATE.groups.forEach(g => {
    const items = FAB_STATE.targets.filter(t => t.group === g.name && t.name);
    if (!items.length) return;
    out += `${g.name}${g.note ? ' (' + g.note + ')' : ''}:\n`;
    items.forEach((t, i) => {
      let line = `${i + 1}) ${t.name} -> ${fabTermArrow(t)}`;
      if (t.condition) line += ` [${t.condition}]`;
      if (t.sidenote) line += ` [${t.sidenote}]`;
      out += line + '\n';
    });
    out += '\n';
  });
  const ungrouped = FAB_STATE.targets.filter(t => !t.group && t.name);
  if (ungrouped.length) {
    ungrouped.forEach((t, i) => {
      let line = `${i + 1}) ${t.name} -> ${fabTermArrow(t)}`;
      if (t.condition) line += ` [${t.condition}]`;
      if (t.sidenote) line += ` [${t.sidenote}]`;
      out += line + '\n';
    });
    out += '\n';
  }
  return out;
}
function fabRenderExport() {
  const out = document.getElementById('fab-export');
  if (!out) return;
  const format = document.getElementById('fab-format').value;
  let text = format === 'arrow' ? fabRenderExportArrow() : fabRenderExportNarrative();

  const twayCap = parseInt(document.getElementById('fab-tway-cap').value) || 0;
  const twayTerms = document.getElementById('fab-tway-terms').value.trim();
  if (FAB_STATE.tways.length) {
    text += `2-way list. ${twayTerms}\nSign up to ${twayCap} guy${twayCap === 1 ? '' : 's'}.\n\n`;
    FAB_STATE.tways.forEach(t => { if (t.name) text += t.name + '\n'; });
  }
  out.textContent = text.trim();
}
function fabCopyExport() {
  navigator.clipboard.writeText(document.getElementById('fab-export').textContent).then(() => {
    const el = document.getElementById('fab-copied');
    el.style.display = 'inline';
    setTimeout(() => el.style.display = 'none', 1600);
  });
}
function fabResetAll() {
  if (!confirm('Wirklich alles zurücksetzen?')) return;
  FAB_STATE = { groups: FAB_DEFAULT_GROUPS.map(g => ({ ...g })), targets: [], tways: [] };
  fabSaveState(); fabRenderAll();
}

function fabRenderAll() {
  fabRenderGroups();
  fabRenderTargets();
  fabRenderTways();
  fabRenderExport();
}

async function renderFABidding() {
  await fabInit();
  fabRenderShell();
  if (!FAB_STATE.targets.length) fabAddTarget();
  fabRenderAll();
}

// hook into the existing showTool() switcher, same pattern app.js already uses for ownercap
(function () {
  const orig = showTool;
  showTool = function (t) { orig(t); if (t === 'fabidding') renderFABidding(); };
})();
