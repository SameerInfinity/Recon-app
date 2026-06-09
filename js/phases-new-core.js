/* ═══════════════════════════════════════════════════
   PHASES-CORE.JS — New Entry Model
   ─────────────────────────────────────────────────
   Design rules:
   1.  Every trade tab shows exactly 3 hub cards:
       "Material Costs" | "Labor Costing" | "All Bills"
   2.  Each card opens a FORM VIEW that has:
       a) Date picker (optional)
       b) Photo upload slot (AI auto-fill or skip)
       c) The specific fields for that material/labor
       d) Quick Total — editable ₹ field (if you just
          want to type a number and go)
       e) [Save Entry] button → entry appears below in
          a "Previous Entries" ledger table
       f) Entries are deletable / tappable to re-edit
   3.  "All Bills" card → full bills gallery (already
       handled by BillScanner.renderBillsHub)
   4.  Phase total = sum of ALL saved entries + bills
   5.  "thekedar" everywhere → "Labor Costing"
   ═══════════════════════════════════════════════════ */

// This file patches the Phases module with the new entry model.
// It is loaded AFTER phases.js and REPLACES key functions via
// direct property assignment on the exported Phases object.

// Wait for Phases to be defined
(function patchPhases() {
  if (typeof Phases === 'undefined') {
    return setTimeout(patchPhases, 50);
  }

  const F = Financial;

  // ── Entry storage helpers ──────────────────────────────────
  // Each entry is stored in phase.data.entries[cardId] = [ {...}, ... ]
  // Each entry has: { id, date, fields, total, notes, billPhotoUrl, createdAt }

  function getEntries(phaseId, cardId) {
    const proj = State.getCurrentProject();
    if (!proj) return [];
    const ph = proj.phases.find(p => p.id === phaseId);
    if (!ph) return [];
    if (!ph.data.entries) ph.data.entries = {};
    if (!ph.data.entries[cardId]) ph.data.entries[cardId] = [];
    return ph.data.entries[cardId];
  }

  function saveEntry(phaseId, cardId, entry) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p => p.id === phaseId);
    if (!ph) return;
    if (!ph.data.entries) ph.data.entries = {};
    if (!ph.data.entries[cardId]) ph.data.entries[cardId] = [];
    // Upsert by id
    const idx = ph.data.entries[cardId].findIndex(e => e.id === entry.id);
    if (idx >= 0) ph.data.entries[cardId][idx] = entry;
    else ph.data.entries[cardId].push(entry);
    State.save();
  }

  function deleteEntry(phaseId, cardId, entryId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p => p.id === phaseId);
    if (!ph || !ph.data.entries || !ph.data.entries[cardId]) return;
    ph.data.entries[cardId] = ph.data.entries[cardId].filter(e => e.id !== entryId);
    State.save();
    Financial.scheduleUpdate();
  }

  // Sum all saved entries for a cardId
  function sumEntries(phaseId, cardId) {
    return getEntries(phaseId, cardId).reduce((s, e) => s + (parseFloat(e.total) || 0), 0);
  }

  // Sum all entries for a whole phase across all cards
  function sumAllEntries(phaseId) {
    const proj = State.getCurrentProject();
    if (!proj) return 0;
    const ph = proj.phases.find(p => p.id === phaseId);
    if (!ph || !ph.data.entries) return 0;
    return Object.values(ph.data.entries).reduce((s, arr) => {
      return s + (Array.isArray(arr) ? arr.reduce((ss, e) => ss + (parseFloat(e.total) || 0), 0) : 0);
    }, 0);
  }

  // ── uid ────────────────────────────────────────────────────
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // ── 3-Card Hub for every trade phase ──────────────────────
  // replaces renderTradeHub
  function renderTradeHubNew(phase, materialCards, laborCards) {
    const materialTotal = materialCards.reduce((s, c) => s + sumEntries(phase.id, c.id), 0);
    const laborTotal    = laborCards.reduce((s, c)    => s + sumEntries(phase.id, c.id), 0);
    const billTotal     = (State.getBills(phase.id)||[]).reduce((s,b) => s + (parseFloat(b.total)||0), 0);
    const phaseTotal    = materialTotal + laborTotal + billTotal;
    const billCount     = (State.getBills(phase.id)||[]).length;

    return `
    ${Phases.phaseHeader(phase)}
    <div style="margin-bottom:20px;background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:var(--radius-lg);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700">${phase.name} — Running Total</div>
      <div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--amber-light)">${F.fmtFull(phaseTotal)}</div>
    </div>
    <div class="category-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">

      <!-- Card 1: Material Costs -->
      <button class="category-card" onclick="Phases.showMaterialHub(${phase.id})">
        <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
        <span class="category-card-icon">${Phases.iconFor('blocks',32)}</span>
        <div class="category-card-name">Material Costs</div>
        <div class="category-card-desc">Log every material purchase — cement, steel, tiles, paint, pipes and more. Each entry saved with date and bill photo.</div>
        <div class="category-card-meta">
          <div class="category-card-progress">
            <div class="category-card-progress-label">${materialCards.reduce((s,c)=>s+getEntries(phase.id,c.id).length,0)} entries</div>
          </div>
          <div class="category-card-cost" style="color:var(--amber)">${F.fmt(materialTotal)}</div>
        </div>
      </button>

      <!-- Card 2: Labor Costing -->
      <button class="category-card" onclick="Phases.showLaborHub(${phase.id})">
        <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
        <span class="category-card-icon">${Phases.iconFor('userCircle',32)}</span>
        <div class="category-card-name">Labor Costing</div>
        <div class="category-card-desc">Record all payments to contractors, Thekedars, daily wage workers and labor milestones.</div>
        <div class="category-card-meta">
          <div class="category-card-progress">
            <div class="category-card-progress-label">${laborCards.reduce((s,c)=>s+getEntries(phase.id,c.id).length,0)} entries</div>
          </div>
          <div class="category-card-cost" style="color:var(--amber)">${F.fmt(laborTotal)}</div>
        </div>
      </button>

      <!-- Card 3: All Bills -->
      <button class="category-card" onclick="App.showPhaseBills(${phase.id})">
        <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
        <span class="category-card-icon" style="font-size:32px">📸</span>
        <div class="category-card-name">All Bills</div>
        <div class="category-card-desc">View all scanned bills and receipts for this phase. AI extracts vendor, amount, and items from photos.</div>
        <div class="category-card-meta">
          <div class="category-card-progress">
            <div class="category-card-progress-label">${billCount} bill${billCount !== 1 ? 's' : ''} scanned</div>
          </div>
          <div class="category-card-cost" style="color:var(--amber)">${F.fmt(billTotal)}</div>
        </div>
      </button>

    </div>`;
  }

  // ── Entry form renderer ────────────────────────────────────
  // Renders the detail form for a single card type (one material type or labor)
  // with: date, photo, fields, quick total, save button, previous entries table

  function renderEntryForm(phase, card, groupLabel) {
    const entries = getEntries(phase.id, card.id);
    const cardTotal = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);

    const fieldRows = card.fields.map(f => {
      let ctrl = '';
      const bStyle = 'background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;font-family:var(--font-body);font-size:13px;width:100%;box-sizing:border-box';
      if (f.type === 'select') {
        ctrl = `<select id="ef-${f.key}" style="${bStyle}"><option value="">— Select —</option>${f.options.map(o=>`<option>${o}</option>`).join('')}</select>`;
      } else if (f.type === 'date') {
        ctrl = `<input type="date" id="ef-${f.key}" style="${bStyle}" oninput="Phases._entryAutoCalc('${phase.id}','${card.id}')">`;
      } else if (f.type === 'number') {
        ctrl = `<input type="number" id="ef-${f.key}" placeholder="${f.placeholder||'0'}" step="any" min="0" style="${bStyle};font-family:var(--font-mono)" oninput="Phases._entryAutoCalc('${phase.id}','${card.id}')">`;
      } else {
        ctrl = `<input type="text" id="ef-${f.key}" placeholder="${f.placeholder||''}" style="${bStyle}" oninput="Phases._entryAutoCalc('${phase.id}','${card.id}')">`;
      }
      return `<div class="field-group" style="margin-bottom:12px"><label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:5px;display:block">${f.label}</label>${ctrl}</div>`;
    });

    // Pair fields into 2 columns
    const paired = [];
    for (let i = 0; i < fieldRows.length; i += 2) {
      if (i + 1 < fieldRows.length) {
        paired.push(`<div class="field-row cols-2">${fieldRows[i]}${fieldRows[i+1]}</div>`);
      } else {
        paired.push(fieldRows[i]);
      }
    }

    return `
    ${Phases.phaseHeader(phase)}
    <div class="breadcrumb" style="margin-bottom:12px">
      <a onclick="Phases.showMaterialHub(${phase.id});void 0" style="cursor:pointer">${groupLabel}</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${card.name}</span>
    </div>

    <!-- Entry Form Card -->
    <div class="section-card" style="margin-bottom:20px">
      <div class="section-card-header" style="cursor:default">
        <span class="section-card-title">${Phases.iconFor(card.icon,14)} <span style="margin-left:6px">New Entry — ${card.name}</span></span>
        <span style="font-size:11px;color:var(--text-muted)">No required fields — fill what you have</span>
      </div>
      <div class="section-card-body">
        <div style="font-size:11px;color:var(--amber-light);background:rgba(232,124,42,0.08);border-left:3px solid var(--amber);padding:8px 12px;border-radius:4px;margin-bottom:18px">${card.desc}</div>

        <!-- Date + Photo row -->
        <div class="field-row cols-2" style="margin-bottom:12px">
          <div class="field-group">
            <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:5px;display:block">Date</label>
            <input type="date" id="ef-entry-date" value="${new Date().toISOString().split('T')[0]}" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;font-family:var(--font-mono);font-size:13px;width:100%;box-sizing:border-box">
          </div>
          <div class="field-group">
            <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:5px;display:block">Bill Photo (Optional — AI will auto-fill)</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="file" id="ef-bill-photo" accept="image/*" capture="environment" style="display:none" onchange="Phases._handleEntryPhoto('${phase.id}','${card.id}',this)">
              <button onclick="document.getElementById('ef-bill-photo').click()" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-secondary);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap">📷 Click / Upload</button>
              <span id="ef-photo-status" style="font-size:11px;color:var(--text-muted)">No photo</span>
            </div>
          </div>
        </div>

        <!-- Material/Labor fields -->
        ${paired.join('')}

        <!-- Quick Total -->
        <div style="display:flex;align-items:center;gap:12px;margin-top:18px;padding:14px;background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:8px">
          <div style="flex:1">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:4px">Total Amount (₹)</div>
            <div style="font-size:10px;color:var(--text-muted)">Auto-calculated from fields above, OR type directly here</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--text-muted);font-size:16px">₹</span>
            <input type="number" id="ef-total" placeholder="0" min="0" step="any"
              style="background:var(--charcoal);border:2px solid var(--amber);color:var(--amber);padding:10px 14px;border-radius:8px;font-family:var(--font-mono);font-size:22px;font-weight:700;width:160px;box-sizing:border-box"
              oninput="Phases._entryTotalOverride=true">
          </div>
        </div>

        <!-- Notes -->
        <div class="field-group" style="margin-top:12px">
          <label style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);margin-bottom:5px;display:block">Notes (Optional)</label>
          <textarea id="ef-notes" rows="2" placeholder="Any additional notes, vendor, challan number…" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;font-size:13px;width:100%;box-sizing:border-box;resize:vertical"></textarea>
        </div>

        <!-- Save button -->
        <div style="display:flex;justify-content:flex-end;margin-top:16px">
          <button onclick="Phases._saveEntryForm('${phase.id}','${card.id}',${JSON.stringify(card.fields).replace(/"/g,'&quot;')})"
            style="background:var(--amber);color:var(--charcoal-dark);border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px">
            ${Phases.iconFor('check',14)} Save Entry
          </button>
        </div>
      </div>
    </div>

    <!-- Previous Entries -->
    <div class="section-card">
      <div class="section-card-header" onclick="Phases.toggleSection('prev-entries-${card.id}')">
        <span class="section-card-title">Previous Entries — ${card.name}</span>
        <div class="section-card-meta">
          <span class="section-card-total">${F.fmtFull(cardTotal)}</span>
          <span class="section-toggle-icon">▼</span>
        </div>
      </div>
      <div class="section-card-body" id="prev-entries-${card.id}">
        ${renderPreviousEntries(phase.id, card.id)}
      </div>
    </div>`;
  }

  // Render the previous entries table
  function renderPreviousEntries(phaseId, cardId) {
    const entries = getEntries(phaseId, cardId);
    if (!entries.length) {
      return `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No entries yet. Fill the form above and click Save Entry.</div>`;
    }
    const rows = entries.map((e,i) => {
      const fieldSummary = Object.entries(e.fields||{})
        .filter(([k,v]) => v && k !== 'notes')
        .slice(0,4)
        .map(([k,v]) => `<span style="color:var(--text-secondary)">${k.replace(/_/g,' ')}: <strong>${v}</strong></span>`)
        .join(' &nbsp;·&nbsp; ');
      return `
      <tr style="border-bottom:1px solid var(--charcoal-border)">
        <td style="padding:10px 12px;font-family:var(--font-mono);font-size:12px;color:var(--text-muted);white-space:nowrap">${e.date || '—'}</td>
        <td style="padding:10px 12px;font-size:12px;min-width:0;max-width:300px;word-break:break-word">${fieldSummary || e.notes || '—'}</td>
        <td style="padding:10px 12px;font-size:11px;color:var(--text-muted);max-width:180px;word-break:break-word">${e.notes||''}</td>
        ${e.billPhotoUrl ? `<td style="padding:10px 12px"><img src="${e.billPhotoUrl}" style="height:36px;border-radius:4px;cursor:pointer" onclick="Phases._viewPhoto('${e.billPhotoUrl}')"></td>` : '<td style="padding:10px 12px;color:var(--text-muted);font-size:11px">—</td>'}
        <td style="padding:10px 12px;font-family:var(--font-mono);font-weight:700;color:var(--amber);text-align:right;white-space:nowrap">${F.fmtFull(e.total)}</td>
        <td style="padding:10px 12px;text-align:right">
          <button onclick="Phases._deleteEntry(${phaseId},'${cardId}','${e.id}')"
            style="background:none;border:1px solid #C7796640;color:#C77966;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">Delete</button>
        </td>
      </tr>`;
    }).join('');
    const total = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);
    return `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:2px solid var(--charcoal-border)">
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left;letter-spacing:.08em">Date</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left">Details</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left">Notes</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left">Bill</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:right">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:var(--charcoal-mid)">
            <td colspan="4" style="padding:10px 12px;font-size:12px;font-weight:700;color:var(--text-secondary)">TOTAL</td>
            <td style="padding:10px 12px;font-family:var(--font-mono);font-weight:700;font-size:16px;color:var(--amber);text-align:right">${F.fmtFull(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>`;
  }

  // Expose entry helpers on Phases for use in HTML onclick
  Phases._entryTotalOverride = false;

  Phases._entryAutoCalc = function(phaseId, cardId) {
    if (Phases._entryTotalOverride) return;
    const ph = State.getCurrentProject()?.phases?.find(p => p.id == phaseId);
    if (!ph) return;
    // Get the card def
    const allCards = getAllCardsForPhase(parseInt(phaseId));
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    const data = {};
    card.fields.forEach(f => {
      const el = document.getElementById('ef-' + f.key);
      if (el) data[f.key] = el.value;
    });
    const cost = card.costFn(data);
    const el = document.getElementById('ef-total');
    if (el && cost > 0) { el.value = cost; Phases._entryTotalOverride = false; }
  };

  Phases._saveEntryForm = function(phaseId, cardId, fieldsSpec) {
    const dateEl = document.getElementById('ef-entry-date');
    const totalEl = document.getElementById('ef-total');
    const notesEl = document.getElementById('ef-notes');
    const date = dateEl?.value || '';
    const total = parseFloat(totalEl?.value) || 0;
    const notes = notesEl?.value?.trim() || '';

    // Gather all field values
    const fieldVals = {};
    (Array.isArray(fieldsSpec) ? fieldsSpec : []).forEach(f => {
      const el = document.getElementById('ef-' + f.key);
      if (el && el.value) fieldVals[f.key] = el.value;
    });

    // Require at least one field OR a total
    const hasAny = total > 0 || Object.values(fieldVals).some(v => v);
    if (!hasAny) {
      App.toast('Enter at least one field or a total amount', 'warning');
      return;
    }

    const photoStatus = document.getElementById('ef-photo-status');
    const billPhotoUrl = photoStatus?.dataset?.url || '';

    const entry = {
      id: uid(),
      date,
      fields: fieldVals,
      total,
      notes,
      billPhotoUrl,
      createdAt: new Date().toISOString(),
    };

    saveEntry(parseInt(phaseId), cardId, entry);

    // Reset form
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    if (totalEl) { totalEl.value = ''; }
    if (notesEl) { notesEl.value = ''; }
    if (photoStatus) { photoStatus.textContent = 'No photo'; delete photoStatus.dataset.url; }
    (Array.isArray(fieldsSpec) ? fieldsSpec : []).forEach(f => {
      const el = document.getElementById('ef-' + f.key);
      if (el) { el.tagName === 'SELECT' ? (el.selectedIndex = 0) : (el.value = ''); }
    });
    Phases._entryTotalOverride = false;

    // Refresh previous entries
    const prevEl = document.getElementById(`prev-entries-${cardId}`);
    if (prevEl) prevEl.innerHTML = renderPreviousEntries(parseInt(phaseId), cardId);

    Financial.scheduleUpdate();
    App.toast('Entry saved', 'success');
  };

  Phases._deleteEntry = function(phaseId, cardId, entryId) {
    deleteEntry(parseInt(phaseId), cardId, entryId);
    const prevEl = document.getElementById(`prev-entries-${cardId}`);
    if (prevEl) prevEl.innerHTML = renderPreviousEntries(parseInt(phaseId), cardId);
    Financial.scheduleUpdate();
  };

  Phases._handleEntryPhoto = async function(phaseId, cardId, input) {
    const file = input.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('ef-photo-status');
    if (statusEl) statusEl.textContent = 'Processing…';

    try {
      const compressed = await BillScanner.compressImagePublic(file);
      if (statusEl) { statusEl.textContent = '📷 Photo ready'; statusEl.dataset.url = compressed; }

      // Try AI scan
      if (statusEl) statusEl.textContent = '🤖 Scanning…';
      try {
        const result = await BillScanner.scanBillWithAIPublic(compressed);
        if (result) {
          // Auto-fill what we can
          const allCards = getAllCardsForPhase(parseInt(phaseId));
          const card = allCards.find(c => c.id === cardId);
          if (card && result.vendor) {
            const vendorEl = document.getElementById('ef-vendor') || document.getElementById('ef-payee');
            if (vendorEl) vendorEl.value = result.vendor;
          }
          if (result.date) {
            const dateEl = document.getElementById('ef-entry-date');
            if (dateEl) dateEl.value = result.date;
          }
          if (result.total_amount) {
            const totalEl = document.getElementById('ef-total');
            if (totalEl && !Phases._entryTotalOverride) totalEl.value = result.total_amount;
          }
          if (statusEl) statusEl.textContent = '✅ AI filled fields';
          App.toast('AI auto-filled from bill photo', 'success');
        }
      } catch(aiErr) {
        if (statusEl) statusEl.textContent = '📷 Photo ready (AI unavailable)';
      }
    } catch(err) {
      if (statusEl) statusEl.textContent = 'Error reading photo';
    }
  };

  Phases._viewPhoto = function(url) {
    const overlay = document.createElement('div');
    overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px">`;
    document.body.appendChild(overlay);
  };

  // ── Material Hub: list of all material cards for a phase ──
  Phases.showMaterialHub = function(phaseId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;
    const matCards = getMaterialCardsForPhase(phaseId);
    const content = document.getElementById('content-area');
    if (!content) return;

    const backFn = `App.showPhaseHub(${phaseId})`;
    const rows = matCards.map(c => {
      const entries = getEntries(phaseId, c.id);
      const total = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);
      return `
        <button class="category-card" onclick="Phases.showCardEntryForm(${phaseId},'${c.id}','Material Costs')" style="text-align:left">
          <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
          <span class="category-card-icon">${Phases.iconFor(c.icon||'listChecks',26)}</span>
          <div class="category-card-name">${c.name}</div>
          <div class="category-card-desc">${c.desc}</div>
          <div class="category-card-meta">
            <div class="category-card-progress-label">${entries.length} entries</div>
            <div class="category-card-cost">${F.fmt(total)}</div>
          </div>
        </button>`;
    }).join('');

    const total = matCards.reduce((s,c) => s + sumEntries(phaseId, c.id), 0);

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="breadcrumb"><a onclick="${backFn}">← ${phase.name}</a> <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">Material Costs</span></div>
        <div class="phase-header">
          <div class="phase-title-block">
            <div class="phase-title">${Phases.iconFor('blocks',22)} <span style="margin-left:8px">Material Costs — ${phase.name}</span></div>
            <div class="phase-subtitle">Tap any material category to add entries</div>
          </div>
          <div class="phase-summary-box">
            <div class="phase-total-display"><div class="phase-total-label">Material Total</div><div class="phase-total-amount" style="color:var(--amber)">${F.fmtFull(total)}</div></div>
          </div>
        </div>
        <div class="category-grid">${rows}</div>
      </div>`;
    content.scrollTop = 0;
  };

  // ── Labor Hub ──────────────────────────────────────────────
  Phases.showLaborHub = function(phaseId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;
    const labCards = getLaborCardsForPhase(phaseId);
    const content = document.getElementById('content-area');
    if (!content) return;

    const backFn = `App.showPhaseHub(${phaseId})`;
    const rows = labCards.map(c => {
      const entries = getEntries(phaseId, c.id);
      const total = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);
      return `
        <button class="category-card" onclick="Phases.showCardEntryForm(${phaseId},'${c.id}','Labor Costing')" style="text-align:left">
          <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
          <span class="category-card-icon">${Phases.iconFor(c.icon||'userCircle',26)}</span>
          <div class="category-card-name">${c.name}</div>
          <div class="category-card-desc">${c.desc}</div>
          <div class="category-card-meta">
            <div class="category-card-progress-label">${entries.length} entries</div>
            <div class="category-card-cost">${F.fmt(total)}</div>
          </div>
        </button>`;
    }).join('');

    const total = labCards.reduce((s,c) => s + sumEntries(phaseId, c.id), 0);

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="breadcrumb"><a onclick="${backFn}">← ${phase.name}</a> <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">Labor Costing</span></div>
        <div class="phase-header">
          <div class="phase-title-block">
            <div class="phase-title">${Phases.iconFor('userCircle',22)} <span style="margin-left:8px">Labor Costing — ${phase.name}</span></div>
            <div class="phase-subtitle">Tap any labor category to record payments</div>
          </div>
          <div class="phase-summary-box">
            <div class="phase-total-display"><div class="phase-total-label">Labor Total</div><div class="phase-total-amount" style="color:var(--amber)">${F.fmtFull(total)}</div></div>
          </div>
        </div>
        <div class="category-grid">${rows}</div>
      </div>`;
    content.scrollTop = 0;
  };

  // ── Show entry form for a specific card ───────────────────
  Phases.showCardEntryForm = function(phaseId, cardId, groupLabel) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === parseInt(phaseId));
    if (!phase) return;
    const allCards = getAllCardsForPhase(parseInt(phaseId));
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    const content = document.getElementById('content-area');
    if (!content) return;
    Phases._entryTotalOverride = false;
    content.innerHTML = `<div class="phase-workspace active">${renderEntryForm(phase, card, groupLabel)}</div>`;
    content.scrollTop = 0;
    Financial.scheduleUpdate();
  };

  // ── Card classification helpers ───────────────────────────
  const LABOR_IDS = ['thekedar','tile_labor','painter_labor','electrician_labor',
    'fab_labor','plumber_labor','pop_labor','lift_install','misc_expenses'];

  function getAllCardsForPhase(phaseId) {
    const M = {
      1: CIVIL_CARDS_REF,   2: TILES_CARDS_REF,   3: PAINT_CARDS_REF,
      4: ELEC_CARDS_REF,    5: FAB_CARDS_REF,
      6: [...PLUMB_EXT_REF, ...PLUMB_INT_REF],
      7: POP_CARDS_REF,     8: LIFT_CARDS_REF,    9: MISC_CARDS_REF,
    };
    return M[phaseId] || [];
  }

  function getMaterialCardsForPhase(phaseId) {
    return getAllCardsForPhase(phaseId).filter(c => !LABOR_IDS.includes(c.id));
  }
  function getLaborCardsForPhase(phaseId) {
    return getAllCardsForPhase(phaseId).filter(c => LABOR_IDS.includes(c.id));
  }

  // ── References to the card arrays from phases.js ──────────
  // These are in scope because phases.js loaded first (same IIFE scope)
  // We expose them through the module closure via Phases._cards
  // Actually we need access — phases.js cards are private.
  // So we duplicate the card registry here (it's data, not logic).
  // We only need id, name, icon, desc, fields, costFn.

  const P = Financial.parseNum;

  function qrC(d, a, b) { return (P(d[a])||0)*(P(d[b])||0); }
  function amtC(d, k) { return P(d[k])||0; }

  const CIVIL_CARDS_REF = [
    { id:'iron', name:'Iron (TMT Bars)', icon:'bricks', desc:'TMT bars, grade, quantity and rate.',
      fields:[{key:'grade',label:'Grade',type:'select',options:['Fe-415','Fe-500','Fe-500D','Fe-550']},{key:'brand',label:'Brand',type:'text',placeholder:'e.g. Tata Tiscon'},{key:'qty_kg',label:'Qty (kg)',type:'number'},{key:'rate_per_kg',label:'Rate (₹/kg)',type:'number'},{key:'vendor',label:'Vendor',type:'text'}],
      costFn: d => qrC(d,'qty_kg','rate_per_kg') },
    { id:'sand', name:'Sand', icon:'pipe', desc:'M-Sand or River Sand by the brass.',
      fields:[{key:'type',label:'Type',type:'select',options:['M-Sand','River Sand','Plaster Sand','Pit Sand']},{key:'qty_brass',label:'Qty (brass)',type:'number'},{key:'rate_per_brass',label:'Rate (₹/brass)',type:'number'},{key:'vendor',label:'Supplier',type:'text'}],
      costFn: d => qrC(d,'qty_brass','rate_per_brass') },
    { id:'cement', name:'Cement', icon:'blocks', desc:'OPC/PPC bags, brand and grade.',
      fields:[{key:'brand',label:'Brand',type:'select',options:['UltraTech','ACC','Ambuja','Shree','Dalmia','Ramco','Birla A1','Local']},{key:'grade',label:'Grade',type:'select',options:['OPC-43','OPC-53','PPC','PSC']},{key:'qty_bags',label:'Qty (bags)',type:'number'},{key:'rate_per_bag',label:'Rate (₹/bag)',type:'number'},{key:'vendor',label:'Dealer',type:'text'}],
      costFn: d => qrC(d,'qty_bags','rate_per_bag') },
    { id:'stone', name:'Stone / Gravel (Khadhi)', icon:'foundation', desc:'Coarse aggregate for concrete.',
      fields:[{key:'size',label:'Size',type:'select',options:['20mm','40mm','Mixed 20-40mm','Crushed Stone']},{key:'qty_brass',label:'Qty (brass)',type:'number'},{key:'rate_per_brass',label:'Rate (₹/brass)',type:'number'},{key:'vendor',label:'Supplier',type:'text'}],
      costFn: d => qrC(d,'qty_brass','rate_per_brass') },
    { id:'binding_wire', name:'Binding Wire', icon:'wrenchScrew', desc:'Black annealed wire, sold by kg.',
      fields:[{key:'qty_kg',label:'Qty (kg)',type:'number'},{key:'rate_per_kg',label:'Rate (₹/kg)',type:'number'},{key:'vendor',label:'Supplier',type:'text'}],
      costFn: d => qrC(d,'qty_kg','rate_per_kg') },
    { id:'adhesive', name:'Adhesive / Chemical', icon:'insulation', desc:'Bonding agents, waterproofing chemicals, curing compounds.',
      fields:[{key:'brand',label:'Brand',type:'text'},{key:'product',label:'Product',type:'text'},{key:'qty_ltr',label:'Qty (litres)',type:'number'},{key:'rate_per_ltr',label:'Rate (₹/litre)',type:'number'}],
      costFn: d => qrC(d,'qty_ltr','rate_per_ltr') },
    { id:'other_material', name:'Other Civil Materials', icon:'listChecks', desc:'Brick, block, AAC, water-stops, anything else.',
      fields:[{key:'item',label:'Item Description',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'},{key:'vendor',label:'Vendor',type:'text'}],
      costFn: d => amtC(d,'amount') },
    { id:'thekedar', name:'Civil Labor Costing', icon:'userCircle', desc:'Daily wages and payouts to Thekedar and masons.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Payee / Worker',type:'text'},{key:'work',label:'Work Description',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => amtC(d,'amount') },
  ];

  const TILES_CARDS_REF = [
    { id:'floor_tiles', name:'Floor Tiles', icon:'ruler', desc:'Vitrified / Ceramic / Porcelain floor tiles.',
      fields:[{key:'type',label:'Type',type:'select',options:['Vitrified','Ceramic','Porcelain','Marble','Granite','Wooden']},{key:'size',label:'Size (inches)',type:'select',options:['12x12','18x18','24x24','24x48','32x32']},{key:'brand',label:'Brand',type:'text'},{key:'area_sqft',label:'Area (sqft)',type:'number'},{key:'rate_per_sqft',label:'Rate (₹/sqft)',type:'number'}],
      costFn: d => qrC(d,'area_sqft','rate_per_sqft') },
    { id:'kitchen_dado', name:'Kitchen Dado Tiles', icon:'wrench', desc:'Backsplash tiles above kitchen counter.',
      fields:[{key:'size',label:'Size',type:'select',options:['12x12','12x18','8x12']},{key:'brand',label:'Brand',type:'text'},{key:'area_sqft',label:'Area (sqft)',type:'number'},{key:'rate_per_sqft',label:'Rate (₹/sqft)',type:'number'}],
      costFn: d => qrC(d,'area_sqft','rate_per_sqft') },
    { id:'staircase_tiles', name:'Staircase Tiles', icon:'stairs', desc:'Tiles for treads and risers.',
      fields:[{key:'brand',label:'Brand',type:'text'},{key:'step_count',label:'Steps',type:'number'},{key:'rate_per_step',label:'Rate (₹/step)',type:'number'}],
      costFn: d => qrC(d,'step_count','rate_per_step') },
    { id:'tile_chemical', name:'Tile Adhesive / Chemical', icon:'droplet', desc:'Adhesive, grout, spacer, waterproofing.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'qty',label:'Quantity',type:'number'},{key:'unit',label:'Unit',type:'select',options:['kg','bag','ltr','pcs']},{key:'rate',label:'Rate (₹)',type:'number'}],
      costFn: d => (P(d.qty)||0)*(P(d.rate)||0) },
    { id:'tile_sand_cement', name:'Sand & Cement (Bedding)', icon:'blocks', desc:'Bedding sand and cement under tiles.',
      fields:[{key:'sand_qty_brass',label:'Sand (brass)',type:'number'},{key:'sand_rate',label:'Sand Rate',type:'number'},{key:'cement_bags',label:'Cement (bags)',type:'number'},{key:'cement_rate',label:'Cement Rate',type:'number'}],
      costFn: d => (P(d.sand_qty_brass)||0)*(P(d.sand_rate)||0) + (P(d.cement_bags)||0)*(P(d.cement_rate)||0) },
    { id:'tile_labor', name:'Tiling Labor Costing', icon:'userCircle', desc:'Payouts to the tiling contractor (per sqft).',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Tiling Contractor',type:'text'},{key:'rate_per_sqft',label:'Rate (₹/sqft)',type:'number'},{key:'area_sqft',label:'Area (sqft)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => (P(d.rate_per_sqft)||0)*(P(d.area_sqft)||0) },
  ];

  const PAINT_CARDS_REF = [
    { id:'putty', name:'Wall Putty', icon:'paintRoller', desc:'Acrylic/powder putty.',
      fields:[{key:'type',label:'Type',type:'select',options:['Acrylic Putty','White Cement Putty','Ready-mix']},{key:'brand',label:'Brand',type:'text'},{key:'qty_kg',label:'Qty (kg)',type:'number'},{key:'rate_per_kg',label:'Rate (₹/kg)',type:'number'}],
      costFn: d => qrC(d,'qty_kg','rate_per_kg') },
    { id:'primer_ext', name:'Exterior Primer', icon:'palette', desc:'Exterior wall primer.',
      fields:[{key:'brand',label:'Brand',type:'text'},{key:'qty_ltr',label:'Qty (litres)',type:'number'},{key:'rate_per_ltr',label:'Rate (₹/litre)',type:'number'},{key:'area_sqft',label:'Coverage Area (sqft)',type:'number'}],
      costFn: d => qrC(d,'qty_ltr','rate_per_ltr') },
    { id:'primer_int', name:'Interior Primer', icon:'palette', desc:'Interior wall primer.',
      fields:[{key:'brand',label:'Brand',type:'text'},{key:'qty_ltr',label:'Qty (litres)',type:'number'},{key:'rate_per_ltr',label:'Rate (₹/litre)',type:'number'},{key:'area_sqft',label:'Coverage Area (sqft)',type:'number'}],
      costFn: d => qrC(d,'qty_ltr','rate_per_ltr') },
    { id:'paint_ext', name:'Exterior Paint', icon:'palette', desc:'Exterior weather-proof paint.',
      fields:[{key:'finish',label:'Finish',type:'select',options:['Matte','Satin','Texture','Weather-coat','Distemper']},{key:'brand',label:'Brand',type:'text'},{key:'qty_ltr',label:'Qty (litres)',type:'number'},{key:'rate_per_ltr',label:'Rate (₹/litre)',type:'number'}],
      costFn: d => qrC(d,'qty_ltr','rate_per_ltr') },
    { id:'paint_int', name:'Interior Paint', icon:'palette', desc:'Interior emulsion / distemper.',
      fields:[{key:'finish',label:'Finish',type:'select',options:['Matte','Satin','Semi-gloss','Premium Emulsion','Distemper']},{key:'brand',label:'Brand',type:'text'},{key:'qty_ltr',label:'Qty (litres)',type:'number'},{key:'rate_per_ltr',label:'Rate (₹/litre)',type:'number'}],
      costFn: d => qrC(d,'qty_ltr','rate_per_ltr') },
    { id:'oil_paint', name:'Oil Paint / Enamel', icon:'paintbrush', desc:'Enamel for doors, windows, grills.',
      fields:[{key:'use',label:'Use',type:'select',options:['Doors & Windows','Grills & Gates','Metal Railings','Wood Polish']},{key:'brand',label:'Brand',type:'text'},{key:'qty_ltr',label:'Qty (litres)',type:'number'},{key:'rate_per_ltr',label:'Rate (₹/litre)',type:'number'}],
      costFn: d => qrC(d,'qty_ltr','rate_per_ltr') },
    { id:'painter_labor', name:'Painter Labor Costing', icon:'userCircle', desc:'Painter payouts per coat or per room.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Painter / Contractor',type:'text'},{key:'work',label:'Work / Area',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => amtC(d,'amount') },
  ];

  const ELEC_CARDS_REF = [
    { id:'switches', name:'Switches & Boards', icon:'zap', desc:'Modular switches, sockets, plates.',
      fields:[{key:'brand',label:'Brand',type:'select',options:['Anchor Roma','Legrand','Schneider','Havells','GM','Local']},{key:'qty',label:'Qty (pcs)',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'wires', name:'Wires', icon:'zap', desc:'Copper/aluminium wires by gauge.',
      fields:[{key:'gauge',label:'Gauge (sqmm)',type:'select',options:['1.0','1.5','2.5','4','6','10']},{key:'brand',label:'Brand',type:'select',options:['Havells','Polycab','KEI','Finolex','RR Kabel','Local']},{key:'qty_mtr',label:'Qty (metres)',type:'number'},{key:'rate_per_mtr',label:'Rate (₹/m)',type:'number'}],
      costFn: d => qrC(d,'qty_mtr','rate_per_mtr') },
    { id:'conduits', name:'Conduits / Fitting Pipes', icon:'pipe', desc:'PVC/flexible conduits for wiring.',
      fields:[{key:'type',label:'Type',type:'select',options:['PVC Rigid 20mm','PVC Rigid 25mm','PVC Flexible 20mm','HMS Conduit']},{key:'qty_mtr',label:'Qty (metres)',type:'number'},{key:'rate_per_mtr',label:'Rate (₹/m)',type:'number'}],
      costFn: d => qrC(d,'qty_mtr','rate_per_mtr') },
    { id:'lights', name:'Lights & Fixtures', icon:'lightbulb', desc:'LED panels, downlights, holders, chandeliers.',
      fields:[{key:'type',label:'Type',type:'select',options:['LED Bulb','LED Panel','Downlight','Batten','Cove Light','Wall Light']},{key:'brand',label:'Brand',type:'text'},{key:'qty',label:'Quantity',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'metering', name:'Metering Material', icon:'listChecks', desc:'DB, MCBs, RCCB, meter, earthing.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'brand',label:'Brand',type:'text'},{key:'qty',label:'Quantity',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'electrician_labor', name:'Electrician Labor Costing', icon:'userCircle', desc:'Electrician payouts — per-point or per-flat.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Electrician / Contractor',type:'text'},{key:'basis',label:'Basis',type:'select',options:['Per Point','Per Flat','Day Wage','Lump Sum']},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => (P(d.qty)||0)*(P(d.rate)||0) },
  ];

  const FAB_CARDS_REF = [
    { id:'door_frames', name:'Door Frames', icon:'door', desc:'Wooden/metal door frames.',
      fields:[{key:'material',label:'Material',type:'select',options:['Hardwood (Teak)','Hardwood (Sal)','Engineered Wood','Metal/MS','WPC']},{key:'size',label:'Size',type:'select',options:['3x7','3.5x7','4x7','4x8']},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/frame)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'flush_doors', name:'Flush Doors', icon:'door', desc:'Flush door shutters.',
      fields:[{key:'core',label:'Core',type:'select',options:['Plywood','Block Board','Solid Core','Hollow Core']},{key:'size',label:'Size',type:'select',options:['3x7','3.5x7','4x7','4x8']},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/door)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'windows', name:'Windows', icon:'window', desc:'Aluminium / UPVC / wooden windows.',
      fields:[{key:'material',label:'Material',type:'select',options:['Aluminium','UPVC','Wooden','Steel']},{key:'size',label:'Size (ft)',type:'select',options:['3x3','4x3','4x4','5x4','6x4']},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/window)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'glass_railing', name:'Glass Railing', icon:'mirror', desc:'Toughened glass + SS handrail.',
      fields:[{key:'glass',label:'Glass',type:'select',options:['Toughened 10mm','Toughened 12mm','Laminated']},{key:'length_rft',label:'Length (rft)',type:'number'},{key:'rate_per_rft',label:'Rate (₹/rft)',type:'number'}],
      costFn: d => qrC(d,'length_rft','rate_per_rft') },
    { id:'hardware', name:'Hardware / Hinges / Fittings', icon:'wrenchScrew', desc:'Hinges, handles, locks, bolts.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'fab_labor', name:'Carpenter & Fabricator Labor', icon:'userCircle', desc:'Payouts for door fixing and window fitting.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Carpenter / Fabricator',type:'text'},{key:'work',label:'Work Description',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => amtC(d,'amount') },
  ];

  const PLUMB_EXT_REF = [
    { id:'ext_pipes', name:'Exterior Pipes', icon:'pipe', desc:'PVC/CPVC/GI exterior drainage and supply pipes.',
      fields:[{key:'type',label:'Type',type:'select',options:['PVC (Drainage)','CPVC','GI','HDPE','SWR']},{key:'size',label:'Size (mm)',type:'select',options:['40','50','75','110','160','200']},{key:'qty_mtr',label:'Qty (metres)',type:'number'},{key:'rate_per_mtr',label:'Rate (₹/m)',type:'number'}],
      costFn: d => qrC(d,'qty_mtr','rate_per_mtr') },
    { id:'ext_fittings', name:'Exterior Fittings', icon:'wrenchScrew', desc:'Elbows, tees, valves, gully traps.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'drainage_lines', name:'Drainage Lines', icon:'wrench', desc:'Soak pits, manholes, storm water.',
      fields:[{key:'length_mtr',label:'Length (metres)',type:'number'},{key:'rate_per_mtr',label:'Rate (₹/m)',type:'number'},{key:'manholes',label:'Manholes',type:'number'},{key:'manhole_rate',label:'Cost per Manhole',type:'number'}],
      costFn: d => (P(d.length_mtr)||0)*(P(d.rate_per_mtr)||0)+(P(d.manholes)||0)*(P(d.manhole_rate)||0) },
  ];

  const PLUMB_INT_REF = [
    { id:'int_pipes', name:'Internal Pipes', icon:'pipe', desc:'CPVC/PPR internal piping.',
      fields:[{key:'type',label:'Type',type:'select',options:['CPVC','PPR','GI','Multilayer Composite']},{key:'size',label:'Size (mm)',type:'select',options:['15','20','25','32','40','50']},{key:'qty_mtr',label:'Qty (metres)',type:'number'},{key:'rate_per_mtr',label:'Rate (₹/m)',type:'number'}],
      costFn: d => qrC(d,'qty_mtr','rate_per_mtr') },
    { id:'int_fittings', name:'Internal Fittings', icon:'wrenchScrew', desc:'Elbows, tees, valves, connectors.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'taps', name:'Taps & Faucets', icon:'droplet', desc:'Pillar cock, bib cock, mixer, shower.',
      fields:[{key:'type',label:'Type',type:'select',options:['Pillar Cock','Bib Cock','Sink Mixer','Wall Mixer','Shower Mixer','Kitchen Tap']},{key:'brand',label:'Brand',type:'select',options:['Jaquar','Hindware','Cera','Kohler','Parryware','Local']},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'bath_fittings', name:'Bath Fittings & Accessories', icon:'listChecks', desc:'Towel rods, soap holders, shower rods.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'brand',label:'Brand',type:'text'},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹/pc)',type:'number'}],
      costFn: d => qrC(d,'qty','rate') },
    { id:'plumber_labor', name:'Plumber Labor Costing', icon:'userCircle', desc:'Plumber payouts — per-flat or per-point.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Plumber / Contractor',type:'text'},{key:'basis',label:'Basis',type:'select',options:['Per Point','Per Flat','Day Wage','Lump Sum']},{key:'qty',label:'Qty',type:'number'},{key:'rate',label:'Rate (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => (P(d.qty)||0)*(P(d.rate)||0) },
  ];

  const POP_CARDS_REF = [
    { id:'pop_bags', name:'POP Bags', icon:'insulation', desc:'Plaster of Paris bags (25 kg).',
      fields:[{key:'brand',label:'Brand',type:'text'},{key:'qty_bags',label:'Qty (bags)',type:'number'},{key:'rate_per_bag',label:'Rate (₹/bag)',type:'number'}],
      costFn: d => qrC(d,'qty_bags','rate_per_bag') },
    { id:'framing', name:'Framing Channels', icon:'wrenchScrew', desc:'Gypsum/metal channel framing for false ceiling.',
      fields:[{key:'type',label:'Type',type:'select',options:['Gypsum Channel','Metal Channel','Grid Ceiling','Wooden Frame']},{key:'area_sqft',label:'Area (sqft)',type:'number'},{key:'rate_per_sqft',label:'Rate (₹/sqft)',type:'number'}],
      costFn: d => qrC(d,'area_sqft','rate_per_sqft') },
    { id:'pop_other', name:'Other POP Consumables', icon:'listChecks', desc:'Corner beads, mesh, screws, primer.',
      fields:[{key:'item',label:'Item',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'}],
      costFn: d => amtC(d,'amount') },
    { id:'pop_labor', name:'POP Labor Costing', icon:'userCircle', desc:'POP contractor payouts per sqft.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'POP Contractor',type:'text'},{key:'area_sqft',label:'Area (sqft)',type:'number'},{key:'rate_per_sqft',label:'Rate (₹/sqft)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => (P(d.area_sqft)||0)*(P(d.rate_per_sqft)||0) },
  ];

  const LIFT_CARDS_REF = [
    { id:'lift_unit', name:'Lift Unit (Car + Motor)', icon:'stairs', desc:'Passenger/goods lift unit.',
      fields:[{key:'type',label:'Type',type:'select',options:['Passenger (4-6 person)','Passenger (8-10 person)','Goods Lift','Home Lift']},{key:'brand',label:'Brand',type:'text'},{key:'floors',label:'Number of Floors',type:'number'},{key:'amount',label:'Unit Cost (₹)',type:'number'}],
      costFn: d => amtC(d,'amount') },
    { id:'shaft', name:'Shaft & Structural Supports', icon:'foundation', desc:'Shaft construction, steel, supports.',
      fields:[{key:'item',label:'Item / Work',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'}],
      costFn: d => amtC(d,'amount') },
    { id:'doors_panels', name:'Doors & Panels', icon:'door', desc:'Automatic door panels per floor.',
      fields:[{key:'floors',label:'Floors',type:'number'},{key:'rate_per_floor',label:'Rate (₹/floor)',type:'number'}],
      costFn: d => (P(d.floors)||0)*(P(d.rate_per_floor)||0) },
    { id:'lift_install', name:'Lift Installation Labor', icon:'userCircle', desc:'Installation crew, electrical hookup, certification.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'payee',label:'Installation Crew / Vendor',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => amtC(d,'amount') },
  ];

  const MISC_CARDS_REF = [
    { id:'misc_expenses', name:'Site Expenses (Miscellaneous)', icon:'listChecks', desc:'Water tankers, security, curing, municipal fees, transport.',
      fields:[{key:'date',label:'Date',type:'date'},{key:'item',label:'Expense',type:'text'},{key:'payee',label:'Paid To',type:'text'},{key:'amount',label:'Amount (₹)',type:'number'},{key:'mode',label:'Mode',type:'select',options:['Cash','UPI','Cheque','NEFT']}],
      costFn: d => amtC(d,'amount') },
  ];

  // ── Patch financial.js to use entries for phase totals ────
  // Override computePhaseTotal to use entry-based sums for phases 1-9
  const _origComputePhaseTotal = Financial.computePhaseTotal;
  Financial.computePhaseTotal = function(phase) {
    if (phase.id >= 1 && phase.id <= 9) {
      return sumAllEntries(phase.id) + ((State.getBills && State.getBills(phase.id))||[]).reduce((s,b)=>s+(parseFloat(b.total)||0),0);
    }
    return _origComputePhaseTotal(phase);
  };

  // ── Override renderTradePhases 1-9 with new 3-card hub ────
  const PHASE_CARD_MAP = {
    1: [CIVIL_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), CIVIL_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    2: [TILES_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), TILES_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    3: [PAINT_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), PAINT_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    4: [ELEC_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), ELEC_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    5: [FAB_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), FAB_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    6: [[...PLUMB_EXT_REF,...PLUMB_INT_REF].filter(c=>!LABOR_IDS.includes(c.id)), [...PLUMB_EXT_REF,...PLUMB_INT_REF].filter(c=>LABOR_IDS.includes(c.id))],
    7: [POP_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), POP_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    8: [LIFT_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), LIFT_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
    9: [MISC_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), MISC_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
  };

  function makeTradeRenderer(phaseId) {
    return function(phase) {
      const [mat, lab] = PHASE_CARD_MAP[phaseId];
      return renderTradeHubNew(phase, mat, lab);
    };
  }

  Phases.renderTradePhase1 = makeTradeRenderer(1);
  Phases.renderTradePhase2 = makeTradeRenderer(2);
  Phases.renderTradePhase3 = makeTradeRenderer(3);
  Phases.renderTradePhase4 = makeTradeRenderer(4);
  Phases.renderTradePhase5 = makeTradeRenderer(5);
  Phases.renderTradePhase6 = makeTradeRenderer(6);
  Phases.renderTradePhase7 = makeTradeRenderer(7);
  Phases.renderTradePhase8 = makeTradeRenderer(8);
  Phases.renderTradePhase9 = makeTradeRenderer(9);

  // Override showInputCard for phases 1-9 to use new entry form
  const _origShowInputCard = App.showInputCard ? App.showInputCard.bind(App) : null;
  App.showInputCard = function(phaseId, cardId) {
    if (phaseId >= 1 && phaseId <= 9) {
      const allCards = getAllCardsForPhase(phaseId);
      const card = allCards.find(c => c.id === cardId);
      if (card) {
        const isLabor = LABOR_IDS.includes(cardId);
        Phases.showCardEntryForm(phaseId, cardId, isLabor ? 'Labor Costing' : 'Material Costs');
        return;
      }
    }
    if (_origShowInputCard) _origShowInputCard(phaseId, cardId);
  };

  // Expose for public use from bill-scanner.js
  BillScanner.compressImagePublic = BillScanner.compressImagePublic || (typeof BillScanner._compressImage === 'function' ? BillScanner._compressImage : null);
  BillScanner.scanBillWithAIPublic = BillScanner.scanBillWithAIPublic || (typeof BillScanner._scanBillWithAI === 'function' ? BillScanner._scanBillWithAI : null);

  console.log('[PhasesCore] Entry model patched — 3-card hub active for phases 1-9');
})();
