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
(function patchPhases(retries = 0) {
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 200; // ms

  if (typeof Phases === 'undefined' || typeof Financial === 'undefined' || typeof State === 'undefined' || typeof BillScanner === 'undefined' || typeof App === 'undefined') {
    if (retries < MAX_RETRIES) {
      console.log('[PhasesCore] Dependencies not ready (try ' + (retries + 1) + '/' + MAX_RETRIES + ') — retrying in ' + RETRY_DELAY + 'ms.');
      return setTimeout(() => patchPhases(retries + 1), RETRY_DELAY);
    }
    console.error('[PhasesCore] Missing dependency after ' + MAX_RETRIES + ' retries — check script load order. Phases:', typeof Phases, 'Financial:', typeof Financial, 'State:', typeof State, 'BillScanner:', typeof BillScanner, 'App:', typeof App);
    return;
  }

    const F = Financial;

  // ── Entry storage helpers ──────────────────────────────────
  // Each entry is stored in phase.data.entries[cardId] = [ {...}, ... ]
  // Each entry has: { id, date, fields, total, notes, billPhotoUrl, createdAt }

  function getEntries(phaseId, cardId) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return [];
    const ph = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!ph) return [];
    if (!ph.data) ph.data = {};
    if (!ph.data.entries) ph.data.entries = {};
    if (!ph.data.entries[cardId]) ph.data.entries[cardId] = [];
    return ph.data.entries[cardId];
  }

  function saveEntry(phaseId, cardId, entry) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!ph) return;
    if (!ph.data) ph.data = {};
    if (!ph.data.entries) ph.data.entries = {};
    if (!ph.data.entries[cardId]) ph.data.entries[cardId] = [];
    // Upsert by id
    const idx = ph.data.entries[cardId].findIndex(e => e.id === entry.id);
    if (idx >= 0) ph.data.entries[cardId][idx] = entry;
    else ph.data.entries[cardId].push(entry);
    State.save();
  }

  function deleteEntry(phaseId, cardId, entryId) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!ph || !ph.data || !ph.data.entries || !ph.data.entries[cardId]) return;
    ph.data.entries[cardId] = ph.data.entries[cardId].filter(e => e.id !== entryId);
    if (typeof State !== 'undefined' && State.deleteLocalImage) {
      State.deleteLocalImage(entryId + '_bill');
      State.deleteLocalImage(entryId + '_proof');
    }
    State.save();
    Financial.scheduleUpdate();
  }

  // Sum all saved entries for a cardId
  function sumEntries(phaseId, cardId) {
    phaseId = Number(phaseId);
    return getEntries(phaseId, cardId).reduce((s, e) => s + (parseFloat(e.total) || 0), 0);
  }

  // Sum all entries for a whole phase across all cards
  function sumAllEntries(phaseId) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return 0;
    const ph = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!ph || !ph.data || !ph.data.entries) return 0;
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
    const billTotal     = (State.getBills(phase.id)||[]).reduce((s,b) => s + (parseFloat(b.totalAmount)||0), 0);
    const phaseTotal    = materialTotal + laborTotal + billTotal;
    const matCount      = materialCards.reduce((s,c)=>s+getEntries(phase.id,c.id).length,0);
    const labCount      = laborCards.reduce((s,c)=>s+getEntries(phase.id,c.id).length,0);
    const billCount     = (State.getBills(phase.id)||[]).length;

    return `
    <div class="breadcrumb" style="margin-bottom:12px">
      <a onclick="App.showOverview()" style="cursor:pointer">Overview</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${phase.name}</span>
    </div>
    <div class="category-hub-header" style="margin-bottom:20px">
      <div class="category-hub-title">${Phases.iconFor(phase.icon, 20)} <span style="margin-left:8px">${phase.name}</span></div>
    </div>
    <div class="category-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">

      <!-- Card 1: Material Costs -->
      <button class="category-card" onclick="App.showMaterialCards(${phase.id})">
        <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
        <span class="category-card-icon">${Phases.iconFor('blocks',32)}</span>
        <div class="category-card-name">Material Costs</div>
        <div class="category-card-desc">Log every material purchase — cement, steel, tiles, paint, pipes and more. Each entry saved with date and bill photo.</div>
        <div class="category-card-meta">
          <div class="category-card-progress">
            <div class="category-card-progress-label" id="hub-material-count-${phase.id}">${matCount} entries</div>
          </div>
          <div class="category-card-cost" id="hub-material-cost-${phase.id}" style="color:var(--amber)">${F.fmt(materialTotal)}</div>
        </div>
      </button>

      <!-- Card 2: Labor Costing -->
      <button class="category-card" onclick="App.showLaborCards(${phase.id})">
        <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
        <span class="category-card-icon">${Phases.iconFor('userCircle',32)}</span>
        <div class="category-card-name">Labor Costing</div>
        <div class="category-card-desc">Record all payments to contractors, daily wage workers and labor milestones.</div>
        <div class="category-card-meta">
          <div class="category-card-progress">
            <div class="category-card-progress-label" id="hub-labor-count-${phase.id}">${labCount} entries</div>
          </div>
          <div class="category-card-cost" id="hub-labor-cost-${phase.id}" style="color:var(--amber)">${F.fmt(laborTotal)}</div>
        </div>
      </button>

    </div>
    
    <!-- Running Total Box (moved to bottom) -->
    <div style="margin-top:24px;margin-bottom:20px;background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:var(--radius-lg);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700">Running Total</div>
      <div id="hub-running-total-${phase.id}" style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--amber-light)">${F.fmtFull(phaseTotal)}</div>
    </div>
    <div style="display:none"><div id="phase-total-${phase.id}"></div><div id="budget-bar-${phase.id}"></div></div>`;
  }

  // ── Entry form renderer ────────────────────────────────────
  // Renders the detail form for a single card type (one material type or labor)
  // with: date, photo, fields, quick total, save button, previous entries table

  function renderEntryForm(phase, card, groupLabel) {
    const entries = getEntries(phase.id, card.id);
    const cardTotal = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);

    // Filter out 'date' field from card fields — the entry form already has ef-entry-date
    const cardFields = card.fields.filter(f => f.key !== 'date');
    const fieldRows = cardFields.map(f => {
      let ctrl = '';
      const bStyle = 'background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;font-family:var(--font-body);font-size:13px;width:100%;box-sizing:border-box';
      if (f.type === 'select') {
        if (f.key === 'mode') {
          ctrl = `
            <select id="ef-mode" style="${bStyle}" onchange="Phases._handlePaymentModeChange(this)">
              <option value="">— Select —</option>
              ${f.options.map(o => `<option>${o}</option>`).join('')}
            </select>
            
            <!-- Cheque Number (Conditional) -->
            <div id="ef-cheque-wrap" style="display:none; margin-top:10px">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin-bottom:4px; display:block">Cheque Number</label>
              <input type="text" id="ef-cheque-no" placeholder="Enter cheque number" style="${bStyle}">
            </div>

            <!-- UPI ID (Conditional) -->
            <div id="ef-upi-wrap" style="display:none; margin-top:10px">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin-bottom:4px; display:block">UPI ID</label>
              <input type="text" id="ef-upi-id" placeholder="e.g. UPI ID / Phone" style="${bStyle}">
            </div>

            <!-- Payment Proof (Visible for all selected payments) -->
            <div id="ef-proof-wrap" style="display:none; margin-top:10px">
              <label style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--text-muted); margin-bottom:4px; display:block">Payment Proof Photo (Optional)</label>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <input type="file" id="ef-payment-proof" accept="image/*" style="display:none" onchange="Phases._handlePaymentProofUpload(this)">
                <input type="file" id="ef-payment-proof-cam" accept="image/*" capture="environment" style="display:none" onchange="Phases._handlePaymentProofUpload(this)">
                ${/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? `
                  <button type="button" onclick="document.getElementById('ef-payment-proof-cam').click()" style="background:var(--charcoal); border:1px solid var(--charcoal-border); color:var(--text-secondary); padding:8px 14px; border-radius:6px; font-size:12px; cursor:pointer; white-space:nowrap">${Icons.render('camera', 14)} Take Photo</button>
                  <button type="button" onclick="document.getElementById('ef-payment-proof').click()" style="background:var(--charcoal); border:1px solid var(--charcoal-border); color:var(--text-secondary); padding:8px 14px; border-radius:6px; font-size:12px; cursor:pointer; white-space:nowrap">${Icons.render('plus', 14)} Upload Proof</button>
                ` : `
                  <button type="button" onclick="document.getElementById('ef-payment-proof').click()" style="background:var(--charcoal); border:1px solid var(--charcoal-border); color:var(--text-secondary); padding:8px 14px; border-radius:6px; font-size:12px; cursor:pointer; white-space:nowrap">${Icons.render('camera', 14)} Upload Proof</button>
                `}
                <span id="ef-proof-status" style="font-size:11px; color:var(--text-muted)">No proof</span>
              </div>
            </div>
          `;
        } else {
          ctrl = `<select id="ef-${f.key}" style="${bStyle}"><option value="">— Select —</option>${f.options.map(o=>`<option>${o}</option>`).join('')}</select>`;
        }
      } else if (f.type === 'date') {
        ctrl = `<input type="date" id="ef-${f.key}" style="${bStyle}" oninput="Phases._entryAutoCalc('${phase.id}','${card.id}')">`;
      } else if (f.type === 'number') {
        const isQty = f.key.toLowerCase().includes('qty') || f.key.toLowerCase().includes('quantity') || f.label.toLowerCase().includes('qty') || f.label.toLowerCase().includes('quantity') || f.key.toLowerCase().includes('area') || f.key.toLowerCase().includes('length');
        if (isQty) {
          const defaultUnit = (k => {
            const lk = k.toLowerCase();
            if (lk.includes('kg')) return 'kg';
            if (lk.includes('brass')) return 'brass';
            if (lk.includes('bag')) return 'bags';
            if (lk.includes('ltr') || lk.includes('litre')) return 'L';
            if (lk.includes('mtr') || lk.includes('meter')) return 'm';
            if (lk.includes('sqft')) return 'sqft';
            if (lk.includes('rft')) return 'rft';
            return 'pcs';
          })(f.key);
          const units = ['pcs', 'kg', 'bags', 'brass', 'L', 'm', 'sqft', 'rft', 'ton', 'cft', 'nos'];
          ctrl = `
            <div style="display:flex; gap:8px; align-items:center; width:100%">
              <input type="number" id="ef-${f.key}" placeholder="${f.placeholder||'0'}" step="any" min="0" style="${bStyle}; flex:1; font-family:var(--font-mono)" oninput="Phases._entryAutoCalc('${phase.id}','${card.id}')">
              <select id="ef-${f.key}-unit" style="width:80px; height:36px; background:var(--charcoal-mid); border:1px solid var(--charcoal-border); color:var(--amber); font-size:12px; font-weight:700; outline:none; cursor:pointer; padding:0 10px; border-radius:6px; font-family:var(--font-body); box-sizing:border-box">
                ${units.map(u => `<option value="${u}" ${u === defaultUnit ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
          `;
        } else {
          ctrl = `<input type="number" id="ef-${f.key}" placeholder="${f.placeholder||'0'}" step="any" min="0" style="${bStyle};font-family:var(--font-mono)" oninput="Phases._entryAutoCalc('${phase.id}','${card.id}')">`;
        }
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

    const hasOnlyOneLabor = groupLabel === 'Labor Costing' && typeof getLaborCardsForPhase === 'function' && getLaborCardsForPhase(phase.id).length === 1;
    let breadcrumbHtml = '';
    if (hasOnlyOneLabor) {
      breadcrumbHtml = `
        <div class="breadcrumb" style="margin-bottom:12px">
          <a onclick="App.showPhaseHub(${phase.id})" style="cursor:pointer">${phase.name}</a>
          <span class="breadcrumb-sep">›</span>
          <span class="breadcrumb-current">${groupLabel}</span>
        </div>`;
    } else {
      breadcrumbHtml = `
        <div class="breadcrumb" style="margin-bottom:12px">
          <a onclick="${groupLabel === 'Labor Costing' ? `App.showLaborCards(${phase.id})` : `App.showMaterialCards(${phase.id})`};void 0" style="cursor:pointer">${groupLabel}</a>
          <span class="breadcrumb-sep">›</span>
          <span class="breadcrumb-current">${card.name}</span>
        </div>`;
    }

    return `
    ${breadcrumbHtml}

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
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="file" id="ef-bill-photo" accept="image/*" style="display:none" onchange="Phases._handleEntryPhoto('${phase.id}','${card.id}',this)">
              <input type="file" id="ef-bill-photo-cam" accept="image/*" capture="environment" style="display:none" onchange="Phases._handleEntryPhoto('${phase.id}','${card.id}',this)">
              ${/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? `
                <button type="button" onclick="document.getElementById('ef-bill-photo-cam').click()" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-secondary);padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap">${Icons.render('camera', 12)} Camera</button>
                <button type="button" onclick="document.getElementById('ef-bill-photo').click()" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-secondary);padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap">${Icons.render('plus', 12)} Gallery</button>
              ` : `
                <button type="button" onclick="document.getElementById('ef-bill-photo').click()" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-secondary);padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap">${Icons.render('camera', 14)} Click / Upload</button>
              `}
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

  // Extract representative vendor or label from entry fields
  function getEntrySummary(e, card) {
    if (!e || !e.fields) return '—';
    const fields = e.fields;
    
    const vendor = fields.vendor || fields.payee || fields.supplier || fields.dealer || fields.contractor || fields.worker;
    if (vendor) return vendor;

    const brand = fields.brand || fields.item || fields.type || fields.product || fields.work || fields.use || fields.material;
    if (brand) return brand;

    for (const val of Object.values(fields)) {
      if (val && typeof val === 'string' && val.length > 0 && val !== '__other__') {
        return val;
      }
    }
    return card.name;
  }

  // Render the previous entries as a clean, single-line mobile layout
  function renderPreviousEntries(phaseId, cardId) {
    const entries = getEntries(phaseId, cardId);
    if (!entries.length) {
      return `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No entries yet. Fill the form above and click Save Entry.</div>`;
    }
    const allCards = getAllCardsForPhase(parseInt(phaseId));
    const card = allCards.find(c => c.id === cardId) || { name: 'Entry' };

    const rows = entries.map((e, i) => {
      const summary = getEntrySummary(e, card);
      return `
      <div class="m-list-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--charcoal-border); gap:12px">
        <div style="display:flex; flex-direction:column; min-width:0; flex:1">
          <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-bottom:2px">${escapeHtml(e.date || '—')}</div>
          <div style="font-size:13px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis">
            ${escapeHtml(summary)}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px">
          <div style="font-family:var(--font-mono); font-weight:700; color:var(--amber); font-size:14px; white-space:nowrap">${F.fmtFull(e.total)}</div>
          <button onclick="Phases._viewEntryDetails(${phaseId}, '${escapeAttr(cardId)}', '${escapeAttr(e.id)}')" 
            style="background:var(--charcoal); border:1px solid var(--charcoal-border); color:var(--text-secondary); padding:6px 12px; border-radius:6px; font-size:11px; font-family:inherit; cursor:pointer; font-weight:600">
            View Details
          </button>
        </div>
      </div>`;
    }).join('');

    const total = entries.reduce((s, e) => s + (parseFloat(e.total) || 0), 0);
    return `
      <div style="display:flex; flex-direction:column; background:var(--charcoal-surface); border-radius:var(--radius-md); overflow:hidden">
        ${rows}
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:var(--charcoal-mid); border-top:1px solid var(--charcoal-border)">
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-secondary)">TOTAL</span>
          <span style="font-family:var(--font-mono); font-weight:700; font-size:16px; color:var(--amber)">${F.fmtFull(total)}</span>
        </div>
      </div>`;
  }

  // Expose entry helpers on Phases for use in HTML onclick
  Phases._entryTotalOverride = false;

  Phases._handlePaymentModeChange = function(selectEl) {
    const val = selectEl.value;
    const chequeWrap = document.getElementById('ef-cheque-wrap');
    const upiWrap = document.getElementById('ef-upi-wrap');
    const proofWrap = document.getElementById('ef-proof-wrap');
    
    if (chequeWrap) chequeWrap.style.display = (val === 'Cheque') ? 'block' : 'none';
    if (upiWrap) upiWrap.style.display = (val === 'UPI') ? 'block' : 'none';
    if (proofWrap) proofWrap.style.display = (val && val !== '__other__') ? 'block' : 'none';
  };

  Phases._handlePaymentProofUpload = async function(input) {
    const file = input.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('ef-proof-status');
    if (statusEl) statusEl.textContent = 'Processing…';

    try {
      const compressed = await BillScanner.compressImagePublic(file);
      if (statusEl) {
        statusEl.textContent = '📷 Proof ready';
        statusEl.dataset.url = compressed;
      }
      App.toast('Payment proof uploaded successfully', 'success');
    } catch(err) {
      if (statusEl) statusEl.textContent = 'Upload failed';
      App.toast('Error reading proof photo', 'error');
    }
  };

  Phases._viewEntryDetails = function(phaseId, cardId, entryId) {
    const entries = getEntries(parseInt(phaseId), cardId);
    const e = entries.find(x => x.id === entryId);
    if (!e) return;
    const allCards = getAllCardsForPhase(parseInt(phaseId));
    const card = allCards.find(c => c.id === cardId) || { name: 'Entry', fields: [] };

    // Formatted fields
    const fieldsHtml = Object.entries(e.fields || {})
      .map(([k, v]) => {
        if (!v || k === 'notes' || k.endsWith('_unit')) return '';
        const fieldSpec = card.fields.find(f => f.key === k);
        let label = fieldSpec ? fieldSpec.label : k.replace(/_/g, ' ');
        if (k === 'cheque_no') label = 'Cheque Number';
        if (k === 'upi_id') label = 'UPI ID';

        let displayVal = escapeHtml(v);
        const unitVal = e.fields[k + '_unit'];
        if (unitVal) {
          displayVal = `${escapeHtml(v)} <span style="color:var(--amber); font-weight:700; font-size:11px; margin-left:4px">${escapeHtml(unitVal)}</span>`;
        }

        return `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(0,0,0,0.05)">
          <span style="font-size:12px; color:var(--text-muted)">${escapeHtml(label)}</span>
          <span style="font-size:13px; font-weight:600; color:var(--text-primary); text-align:right">${displayVal}</span>
        </div>`;
      }).join('');

    const modalHtml = `
      <h3 class="modal-title" style="margin-bottom:14px; display:flex; align-items:center; gap:8px">
        ${Phases.iconFor(card.icon || 'listChecks', 18)} ${escapeHtml(card.name)} Details
      </h3>
      <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:8px; padding:12px; margin-bottom:14px">
        <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid rgba(0,0,0,0.05); margin-bottom:8px">
          <span style="font-size:12px; color:var(--text-muted)">Date</span>
          <span style="font-family:var(--font-mono); font-size:13px; color:var(--text-primary)">${escapeHtml(e.date || '—')}</span>
        </div>
        ${fieldsHtml || `<div style="font-size:12px; color:var(--text-muted); padding:4px 0">No specific field details.</div>`}
      </div>

      ${e.notes ? `
        <div style="margin-bottom:14px">
          <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted)">Notes</label>
          <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:6px; padding:8px 10px; font-size:13px; color:var(--text-secondary); margin-top:4px; white-space:pre-wrap">${escapeHtml(e.notes)}</div>
        </div>` : ''}

      ${e.billPhotoUrl ? `
        <div style="margin-bottom:14px">
          <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted)">Bill Photo</label>
          <div style="margin-top:6px">
            <img src="${escapeAttr(State.getLocalImage(e.billPhotoUrl))}" style="width:100%; max-height:200px; object-fit:contain; border-radius:6px; border:1px solid var(--charcoal-border); cursor:zoom-in" onclick="Phases._viewPhoto(State.getLocalImage('${escapeAttr(e.billPhotoUrl)}'))">
            <div style="font-size:10px; color:var(--text-muted); text-align:center; margin-top:4px">Tap image to zoom</div>
          </div>
        </div>` : ''}

      ${e.paymentProofUrl ? `
        <div style="margin-bottom:14px">
          <label style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-muted)">Payment Proof</label>
          <div style="margin-top:6px">
            <img src="${escapeAttr(State.getLocalImage(e.paymentProofUrl))}" style="width:100%; max-height:200px; object-fit:contain; border-radius:6px; border:1px solid var(--charcoal-border); cursor:zoom-in" onclick="Phases._viewPhoto(State.getLocalImage('${escapeAttr(e.paymentProofUrl)}'))">
            <div style="font-size:10px; color:var(--text-muted); text-align:center; margin-top:4px">Tap image to zoom</div>
          </div>
        </div>` : ''}

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:12px; background:rgba(180,122,60,0.08); border:1px solid rgba(180,122,60,0.2); border-radius:8px">
        <span style="font-size:12px; color:var(--text-secondary); font-weight:600">Total Amount</span>
        <span style="font-family:var(--font-mono); font-weight:700; font-size:18px; color:var(--amber)">${F.fmtFull(e.total)}</span>
      </div>

      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Close</button>
        <button onclick="App.closeModal(); Phases._deleteEntryModal(${phaseId}, '${escapeAttr(cardId)}', '${escapeAttr(e.id)}')" 
          class="modal-btn-danger" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit; background:none; border:1.5px solid #C45D5220; color:#C45D52">
          Delete Entry
        </button>
      </div>
    `;

    App.showModal(modalHtml);
  };

  Phases._deleteEntryModal = function(phaseId, cardId, entryId) {
    App.showConfirmModal({
      icon: Icons.render('trash', 24),
      title: 'Delete Entry?',
      body: 'This entry will be permanently removed from the phase history.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        Phases._deleteEntry(phaseId, cardId, entryId);
      }
    });
  };

  Phases._entryAutoCalc = function(phaseId, cardId) {
    // Reset the override flag so that changing other fields always
    // re-enables auto-calculation (only the total field itself sets it)
    Phases._entryTotalOverride = false;
    const ph = State.getCurrentProject()?.phases?.find(p => p.id == phaseId);
    if (!ph) return;
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
    if (el && cost >= 0) { el.value = cost || ''; }
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
      if (el && el.value) {
        fieldVals[f.key] = el.value;
        const unitEl = document.getElementById('ef-' + f.key + '-unit');
        if (unitEl && unitEl.value) {
          fieldVals[f.key + '_unit'] = unitEl.value;
        }
      }
    });

    const mode = fieldVals.mode || '';
    if (mode === 'Cheque') {
      const chequeNoEl = document.getElementById('ef-cheque-no');
      if (chequeNoEl && chequeNoEl.value.trim()) {
        fieldVals.cheque_no = chequeNoEl.value.trim();
      }
    } else if (mode === 'UPI') {
      const upiIdEl = document.getElementById('ef-upi-id');
      if (upiIdEl && upiIdEl.value.trim()) {
        fieldVals.upi_id = upiIdEl.value.trim();
      }
    }

    // Require at least one field OR a total
    const hasAny = total > 0 || Object.values(fieldVals).some(v => v);
    if (!hasAny) {
      App.toast('Enter at least one field or a total amount', 'warning');
      return;
    }

    const entryId = uid();
    const photoStatus = document.getElementById('ef-photo-status');
    let rawBillPhoto = photoStatus?.dataset?.url || '';
    let billPhotoUrl = '';
    if (rawBillPhoto) {
      if (rawBillPhoto.startsWith('data:image')) {
        const key = entryId + '_bill';
        if (typeof State !== 'undefined' && State.saveLocalImage) {
          State.saveLocalImage(key, rawBillPhoto);
        }
        billPhotoUrl = 'local-image://' + key;
      } else {
        billPhotoUrl = rawBillPhoto;
      }
    }

    const proofStatus = document.getElementById('ef-proof-status');
    let rawProofPhoto = proofStatus?.dataset?.url || '';
    let paymentProofUrl = '';
    if (rawProofPhoto) {
      if (rawProofPhoto.startsWith('data:image')) {
        const key = entryId + '_proof';
        if (typeof State !== 'undefined' && State.saveLocalImage) {
          State.saveLocalImage(key, rawProofPhoto);
        }
        paymentProofUrl = 'local-image://' + key;
      } else {
        paymentProofUrl = rawProofPhoto;
      }
    }

    const entry = {
      id: entryId,
      date,
      fields: fieldVals,
      total,
      notes,
      billPhotoUrl,
      paymentProofUrl,
      createdAt: new Date().toISOString(),
    };

    saveEntry(parseInt(phaseId), cardId, entry);

    // Reset form
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    if (totalEl) { totalEl.value = ''; }
    if (notesEl) { notesEl.value = ''; }
    if (photoStatus) { photoStatus.textContent = 'No photo'; delete photoStatus.dataset.url; }
    
    // Reset payment inputs
    const chequeNoEl = document.getElementById('ef-cheque-no');
    if (chequeNoEl) chequeNoEl.value = '';
    const upiIdEl = document.getElementById('ef-upi-id');
    if (upiIdEl) upiIdEl.value = '';
    const chequeWrap = document.getElementById('ef-cheque-wrap');
    if (chequeWrap) chequeWrap.style.display = 'none';
    const upiWrap = document.getElementById('ef-upi-wrap');
    if (upiWrap) upiWrap.style.display = 'none';
    const proofWrap = document.getElementById('ef-proof-wrap');
    if (proofWrap) proofWrap.style.display = 'none';
    if (proofStatus) { proofStatus.textContent = 'No proof'; delete proofStatus.dataset.url; }

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
      if (statusEl) statusEl.innerHTML = Icons.render('bot', 11) + ' Scanning…';
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
          }          const detectedTotal = parseFloat(result.total_amount) || parseFloat(result.totalAmount) || 0;
          if (detectedTotal > 0) {
            const totalEl = document.getElementById('ef-total');
            if (totalEl && !Phases._entryTotalOverride) totalEl.value = detectedTotal;
          }
          if (statusEl) statusEl.innerHTML = Icons.render('check', 11) + ' AI filled fields';
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
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!phase) return;
    const matCards = getMaterialCardsForPhase(phaseId);
    const content = document.getElementById('content-area');
    if (!content) return;

    const backFn = `App.showPhaseHub(${phaseId})`;
    const rows = matCards.map(c => {
      const entries = getEntries(phaseId, c.id);
      const total = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);
      return `
        <button class="category-card" onclick="App.showEntryForm(${phaseId},'${c.id}')" style="text-align:left">
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
        </div>
        <div class="category-grid">${rows}</div>
      </div>`;
    content.scrollTop = 0;
  };

  // ── Labor Hub ──────────────────────────────────────────────
  Phases.showLaborHub = function(phaseId) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!phase) return;
    const labCards = getLaborCardsForPhase(phaseId);
    const content = document.getElementById('content-area');
    if (!content) return;

    const backFn = `App.showPhaseHub(${phaseId})`;
    const rows = labCards.map(c => {
      const entries = getEntries(phaseId, c.id);
      const total = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);
      return `
        <button class="category-card" onclick="App.showEntryForm(${phaseId},'${c.id}')" style="text-align:left">
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
    'fab_labor','plumber_labor','pop_labor','lift_install','floor-prep','paint-prep']; // misc_expenses removed — it's a general expense, not labor

  function getAllCardsForPhase(phaseId) {
    const M = {
      1: CIVIL_CARDS_REF,   2: TILES_CARDS_REF,   3: PAINT_CARDS_REF,
      4: ELEC_CARDS_REF,    5: FAB_CARDS_REF,
      6: [...PLUMB_EXT_REF, ...PLUMB_INT_REF],
      7: POP_CARDS_REF,     8: LIFT_CARDS_REF,    9: MISC_CARDS_REF,
      10: INTERIOR_CARDS_REF,
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
    { id:'thekedar', name:'Civil Labor Costing', icon:'userCircle', desc:'Daily wages and payouts to labor contractors and masons.',
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

  const INTERIOR_CARDS_REF = [
    { id: 'floor-prep', name: 'Subfloor Preparation', icon: 'wrench', desc: 'Moisture readings, self-leveling, plywood overlay, vapor barrier.',
      fields: [
        { key: 'location', label: 'Item / Location', type: 'text', placeholder: 'e.g. Master Bedroom' },
        { key: 'type', label: 'Prep Type', type: 'select', options: ['Self-Leveling Concrete', 'Plywood Overlay', 'Cement Board', 'Vapor Barrier', 'Moisture Sealer'] },
        { key: 'labor_hours', label: 'Labor Hours', type: 'number', placeholder: '0' },
        { key: 'labor_rate', label: 'Labor Rate (₹/hr)', type: 'number', placeholder: '0' },
        { key: 'material_cost', label: 'Material Cost (₹)', type: 'number', placeholder: '0' }
      ],
      costFn: d => (P(d.labor_hours)||0)*(P(d.labor_rate)||0) + (P(d.material_cost)||0) },

    { id: 'floor-finish', name: 'Finish Flooring', icon: 'ruler', desc: 'Per-zone flooring material, plank width, wear, transitions, grout color.',
      fields: [
        { key: 'zone', label: 'Flooring Zone / Room', type: 'text', placeholder: 'e.g. Living Room' },
        { key: 'material', label: 'Material Type', type: 'select', options: ['LVP', 'Engineered Hardwood', 'Solid Hardwood', 'Carpet', 'Sheet Vinyl', 'Porcelain Tile', 'Laminate'] },
        { key: 'coverage_sqft', label: 'Coverage Area (sqft)', type: 'number', placeholder: '0' },
        { key: 'waste_pct', label: 'Waste %', type: 'number', placeholder: '10' },
        { key: 'price_sqft', label: 'Material Price (₹/sqft)', type: 'number', placeholder: '0' },
        { key: 'labor_rate_sqft', label: 'Labor Rate (₹/sqft)', type: 'number', placeholder: '0' },
        { key: 'underlay_price_sqft', label: 'Underlay Price (₹/sqft)', type: 'number', placeholder: '0' },
        { key: 'trans_strips_count', label: 'Transition Strips (count)', type: 'number', placeholder: '0' },
        { key: 'trans_strip_price', label: 'Transition Price/each', type: 'number', placeholder: '0' },
        { key: 'grout_color_code', label: 'Grout Color Code', type: 'text', placeholder: 'e.g. Mapei #38' }
      ],
      costFn: d => {
        const cov = P(d.coverage_sqft)||0;
        const waste = P(d.waste_pct)||0;
        const price = P(d.price_sqft)||0;
        const labor = P(d.labor_rate_sqft)||0;
        const under = P(d.underlay_price_sqft)||0;
        const strips = P(d.trans_strips_count)||0;
        const sPrice = P(d.trans_strip_price)||0;
        return (cov * (1 + waste/100) * price) + (cov * labor) + (cov * under) + (strips * sPrice);
      } },

    { id: 'cab-box', name: 'Cabinetry — Boxes & Doors', icon: 'sofa', desc: 'Class, core, door profile, LF by tier, install, millwork.',
      fields: [
        { key: 'cab_class', label: 'Cabinet Class', type: 'select', options: ['Stock / RTA', 'Semi-Custom', 'Full Custom'] },
        { key: 'cab_core', label: 'Box Core Material', type: 'select', options: ['1/2" Plywood', '3/4" Plywood', 'Furniture Board / MDF'] },
        { key: 'door_profile', label: 'Door Profile', type: 'select', options: ['Shaker', 'Flat Panel / Slab', 'Raised Panel', 'Glass-Front'] },
        { key: 'cab_finish', label: 'Door Finish', type: 'select', options: ['Painted', 'Stained Wood', 'Thermofoil', 'Natural Veneer', 'Laminate'] },
        { key: 'cab_base_lf', label: 'Base Cabinet LF', type: 'number', placeholder: '0' },
        { key: 'cab_base_rate', label: 'Base $/LF', type: 'number', placeholder: '0' },
        { key: 'cab_upper_lf', label: 'Upper Cabinet LF', type: 'number', placeholder: '0' },
        { key: 'cab_upper_rate', label: 'Upper $/LF', type: 'number', placeholder: '0' },
        { key: 'cab_pantry_lf', label: 'Pantry / Tall LF', type: 'number', placeholder: '0' },
        { key: 'cab_pantry_rate', label: 'Pantry $/LF', type: 'number', placeholder: '0' },
        { key: 'cab_install_rate', label: 'Cabinet Install Rate/LF', type: 'number', placeholder: '0' },
        { key: 'millwork_lump', label: 'Millwork Lump (crown, fillers, etc)', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const base = P(d.cab_base_lf)||0;
        const upper = P(d.cab_upper_lf)||0;
        const pantry = P(d.cab_pantry_lf)||0;
        const baseRate = P(d.cab_base_rate)||0;
        const upperRate = P(d.cab_upper_rate)||0;
        const pantryRate = P(d.cab_pantry_rate)||0;
        const install = P(d.cab_install_rate)||0;
        const lump = P(d.millwork_lump)||0;
        return (base * baseRate) + (upper * upperRate) + (pantry * pantryRate) + ((base + upper + pantry) * install) + lump;
      } },

    { id: 'cab-hw', name: 'Cabinetry — Hardware', icon: 'wrenchScrew', desc: 'Glides, hinges, pulls, drawer boxes, soft-close adapters.',
      fields: [
        { key: 'glide_spec', label: 'Drawer Glide Spec', type: 'select', options: ['Under-mount Soft-Close', 'Side-mount Standard', 'Push-to-Open'] },
        { key: 'hinge_spec', label: 'Hinge Spec', type: 'select', options: ['6-way Adjustable Concealed', 'Exposed Barrel', 'Soft-Close Concealed'] },
        { key: 'pulls_knobs_count', label: 'Pulls & Knobs (count)', type: 'number', placeholder: '0' },
        { key: 'pull_unit_price', label: 'Pull/Knob Unit Price', type: 'number', placeholder: '0' },
        { key: 'drawer_box_count', label: 'Drawer Count (boxes)', type: 'number', placeholder: '0' },
        { key: 'drawer_box_price', label: 'Drawer Box Unit Price', type: 'number', placeholder: '0' },
        { key: 'softclose_price', label: 'Soft-Close Adapter $/unit', type: 'number', placeholder: '0' },
        { key: 'hinge_qty', label: 'Hinge Qty', type: 'number', placeholder: '0' },
        { key: 'hinge_unit_price', label: 'Hinge Unit Price', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const pulls = P(d.pulls_knobs_count)||0;
        const pullPrice = P(d.pull_unit_price)||0;
        const drawers = P(d.drawer_box_count)||0;
        const drawerPrice = P(d.drawer_box_price)||0;
        const hinges = P(d.hinge_qty)||0;
        const hingePrice = P(d.hinge_unit_price)||0;
        const softClose = P(d.softclose_price)||0;
        return (pulls * pullPrice) + (drawers * drawerPrice) + (hinges * hingePrice) + (drawers * softClose);
      } },

    { id: 'door-slab', name: 'Doors — Slabs & Jambs', icon: 'door', desc: 'Style, core, jamb width, qty, slab/jamb/install pricing.',
      fields: [
        { key: 'location', label: 'Location / Description', type: 'text', placeholder: 'e.g. Master Bedroom' },
        { key: 'style', label: 'Door Style', type: 'select', options: ['1-Panel', '2-Panel Shaker', '6-Panel Solid', 'Flush Solid Core', 'Bifold Closet', 'Barn Door', 'French Doors'] },
        { key: 'core_type', label: 'Core Type', type: 'select', options: ['Solid Wood', 'Solid Core MDF', 'Hollow Core'] },
        { key: 'jamb_width', label: 'Jamb Width', type: 'select', options: ['4-9/16"', '6-9/16"', 'Custom'] },
        { key: 'qty', label: 'Quantity', type: 'number', placeholder: '1' },
        { key: 'slab_price', label: 'Slab Unit Price', type: 'number', placeholder: '0' },
        { key: 'jamb_set_price', label: 'Jamb Set Price', type: 'number', placeholder: '0' },
        { key: 'install_price', label: 'Install Labor Price', type: 'number', placeholder: '0' }
      ],
      costFn: d => (P(d.qty)||0) * ((P(d.slab_price)||0) + (P(d.jamb_set_price)||0) + (P(d.install_price)||0)) },

    { id: 'door-hw', name: 'Doors — Hardware', icon: 'key', desc: 'Hinge finish, passage/privacy/dummy sets, door stops.',
      fields: [
        { key: 'hinge_finish', label: 'Hinge Finish', type: 'select', options: ['Matte Black', 'Brushed Nickel', 'Satin Brass', 'Oil-Rubbed Bronze', 'Chrome', 'Polished Brass'] },
        { key: 'hinge_finish_price', label: 'Hinge Price (per hinge)', type: 'number', placeholder: '0' },
        { key: 'passage_count', label: 'Passage Sets (count)', type: 'number', placeholder: '0' },
        { key: 'passage_price', label: 'Passage $/set', type: 'number', placeholder: '0' },
        { key: 'privacy_count', label: 'Privacy Sets (count)', type: 'number', placeholder: '0' },
        { key: 'privacy_price', label: 'Privacy $/set', type: 'number', placeholder: '0' },
        { key: 'dummy_count', label: 'Dummy Sets (count)', type: 'number', placeholder: '0' },
        { key: 'dummy_price', label: 'Dummy $/set', type: 'number', placeholder: '0' },
        { key: 'door_stops_count', label: 'Door Stops (count)', type: 'number', placeholder: '0' },
        { key: 'stop_type', label: 'Stop Type', type: 'select', options: ['Baseboard-mount', 'Hinge-pin', 'Floor-mount', 'Wall-mount'] },
        { key: 'door_stop_price', label: 'Stop Unit Price', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const pass = P(d.passage_count)||0;
        const passPrice = P(d.passage_price)||0;
        const priv = P(d.privacy_count)||0;
        const privPrice = P(d.privacy_price)||0;
        const dummy = P(d.dummy_count)||0;
        const dummyPrice = P(d.dummy_price)||0;
        const stops = P(d.door_stops_count)||0;
        const stopPrice = P(d.door_stop_price)||0;
        const hingePrice = P(d.hinge_finish_price)||0;
        return (pass * passPrice) + (priv * privPrice) + (dummy * dummyPrice) + (stops * stopPrice) + ((pass + priv + dummy + stops) * 3 * hingePrice);
      } },

    { id: 'trim-base', name: 'Trim & Millwork', icon: 'column', desc: 'Baseboard profiles, crown, wainscoting, casing by the foot.',
      fields: [
        { key: 'profile', label: 'Trim Profile', type: 'select', options: ['Speed Base 3-1/4"', 'Colonial 4-1/4"', 'Craftsman 1x4', 'MDF Flat 5-1/4"', 'Solid Pine'] },
        { key: 'lf', label: 'Linear Feet (LF)', type: 'number', placeholder: '0' },
        { key: 'price_lf', label: 'Material Price/LF', type: 'number', placeholder: '0' },
        { key: 'labor_lf', label: 'Labor Cost/LF', type: 'number', placeholder: '0' },
        { key: 'corners', label: 'Mitered Corners (count)', type: 'number', placeholder: '0' },
        { key: 'corner_price', label: 'Corner Price/each', type: 'number', placeholder: '0' },
        { key: 'casing_width', label: 'Door Casing Width (in)', type: 'number', placeholder: '3.5' },
        { key: 'window_casing_style', label: 'Window Casing Style', type: 'select', options: ['Picture Frame', 'Stool & Apron', 'Craftsman', 'Modern Flat'] },
        { key: 'crown_lf', label: 'Crown Molding (LF)', type: 'number', placeholder: '0' },
        { key: 'crown_price_lf', label: 'Crown Material/LF', type: 'number', placeholder: '0' },
        { key: 'crown_labor_lf', label: 'Crown Labor/LF', type: 'number', placeholder: '0' },
        { key: 'wainscot_sqft', label: 'Wainscoting (sqft)', type: 'number', placeholder: '0' },
        { key: 'wainscot_price', label: 'Wainscot Material/sqft', type: 'number', placeholder: '0' },
        { key: 'wainscot_labor', label: 'Wainscot Labor/sqft', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const lf = P(d.lf)||0;
        const priceLf = P(d.price_lf)||0;
        const laborLf = P(d.labor_lf)||0;
        const corners = P(d.corners)||0;
        const cornerPrice = P(d.corner_price)||0;
        const crown = P(d.crown_lf)||0;
        const crownPrice = P(d.crown_price_lf)||0;
        const crownLabor = P(d.crown_labor_lf)||0;
        const wain = P(d.wainscot_sqft)||0;
        const wainPrice = P(d.wainscot_price)||0;
        const wainLabor = P(d.wainscot_labor)||0;
        return (lf * (priceLf + laborLf)) + (corners * cornerPrice) + (crown * (crownPrice + crownLabor)) + (wain * (wainPrice + wainLabor));
      } },

    { id: 'trim-stair', name: 'Stair Components', icon: 'stairs', desc: 'Treads, risers, balusters, newel posts, stair labor.',
      fields: [
        { key: 'stair_tread', label: 'Stair Tread Material', type: 'select', options: ['Oak', 'Pine', 'Maple', 'MDF', 'Ipe'] },
        { key: 'tread_count', label: 'Tread Count', type: 'number', placeholder: '0' },
        { key: 'tread_price', label: 'Tread Unit Price', type: 'number', placeholder: '0' },
        { key: 'riser_count', label: 'Riser Count', type: 'number', placeholder: '0' },
        { key: 'riser_price', label: 'Riser Unit Price', type: 'number', placeholder: '0' },
        { key: 'stair_labor_lump', label: 'Stair Labor Lump Sum', type: 'number', placeholder: '0' },
        { key: 'baluster_style', label: 'Baluster Style', type: 'select', options: ['Iron Spindles', 'Wood Turned', 'Glass Panels', 'Box Newel + Plain', 'Stainless Cable'] },
        { key: 'baluster_count', label: 'Baluster Count', type: 'number', placeholder: '0' },
        { key: 'baluster_price', label: 'Baluster Unit Price', type: 'number', placeholder: '0' },
        { key: 'newel_count', label: 'Newel Post Count', type: 'number', placeholder: '0' },
        { key: 'newel_price', label: 'Newel Post Unit Price', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const treads = P(d.tread_count)||0;
        const treadPrice = P(d.tread_price)||0;
        const risers = P(d.riser_count)||0;
        const riserPrice = P(d.riser_price)||0;
        const lump = P(d.stair_labor_lump)||0;
        const balusters = P(d.baluster_count)||0;
        const balusterPrice = P(d.baluster_price)||0;
        const newels = P(d.newel_count)||0;
        const newelPrice = P(d.newel_price)||0;
        return (treads * treadPrice) + (risers * riserPrice) + lump + (balusters * balusterPrice) + (newels * newelPrice);
      } },

    { id: 'paint-prep', name: 'Paint — Preparation', icon: 'paintbrush', desc: 'Caulk, wood filler, sandpaper, tape/plastic, primer gallons.',
      fields: [
        { key: 'surface', label: 'Surface Area / Location', type: 'text', placeholder: 'e.g. Trim & Walls' },
        { key: 'caulk_tubes', label: 'Caulk Tubes (count)', type: 'number', placeholder: '0' },
        { key: 'filler_tubs', label: 'Wood Filler Tubs (count)', type: 'number', placeholder: '0' },
        { key: 'sandpaper_cost', label: 'Sandpaper Cost (₹)', type: 'number', placeholder: '0' },
        { key: 'tape_plastic_cost', label: 'Tape & Plastic Cost (₹)', type: 'number', placeholder: '0' },
        { key: 'primer_type', label: 'Primer Type', type: 'select', options: ['PVA Drywall Primer', 'Stain-Blocking Oil', 'High-Build', 'Bonding'] },
        { key: 'primer_gallons', label: 'Primer Gallons Spec', type: 'number', placeholder: '0' },
        { key: 'primer_price_gal', label: 'Primer Price/Gallon', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const caulk = P(d.caulk_tubes)||0;
        const filler = P(d.filler_tubs)||0;
        const sand = P(d.sandpaper_cost)||0;
        const tape = P(d.tape_plastic_cost)||0;
        const primG = P(d.primer_gallons)||0;
        const primP = P(d.primer_price_gal)||0;
        return (caulk * 8) + (filler * 25) + sand + tape + (primG * primP);
      } },

    { id: 'paint-coat', name: 'Paint — Coatings', icon: 'palette', desc: 'Surface sqft, coats, color code, coverage, $/gallon, labor.',
      fields: [
        { key: 'surface', label: 'Surface Area / Location', type: 'text', placeholder: 'e.g. Master Bedroom' },
        { key: 'sqft', label: 'Area (sqft)', type: 'number', placeholder: '0' },
        { key: 'coats', label: 'Coats Required', type: 'select', options: ['1', '2', '3'] },
        { key: 'color_code', label: 'Color Code / Brand', type: 'text', placeholder: 'e.g. Sherwin Williams #7005' },
        { key: 'coverage', label: 'Coverage (sqft/gal)', type: 'number', placeholder: '350' },
        { key: 'price_per_gal', label: 'Paint Price per Gallon (₹)', type: 'number', placeholder: '0' },
        { key: 'labor_sqft', label: 'Labor Rate (₹/sqft)', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const sqft = P(d.sqft)||0;
        const coats = P(d.coats)||1;
        const cov = P(d.coverage)||350;
        const paintPrice = P(d.price_per_gal)||0;
        const labor = P(d.labor_sqft)||0;
        const gallons = cov > 0 ? Math.ceil((sqft * coats) / cov) : 0;
        return (gallons * paintPrice) + (sqft * labor);
      } },

    { id: 'closet', name: 'Closet Systems', icon: 'shirt', desc: 'Wire/melamine/custom, LF, drawer units, accessories.',
      fields: [
        { key: 'closet_type', label: 'Closet System Type', type: 'select', options: ['Wire Shelving', 'Melamine Built-ins', 'Custom Wood', 'Modular (ClosetMaid / Elfa)'] },
        { key: 'closet_lf', label: 'Linear Shelving Feet', type: 'number', placeholder: '0' },
        { key: 'closet_rate_lf', label: 'Price per Linear Foot', type: 'number', placeholder: '0' },
        { key: 'closet_install_lf', label: 'Install Rate per LF', type: 'number', placeholder: '0' },
        { key: 'closet_drawer_count', label: 'Drawer Units (count)', type: 'number', placeholder: '0' },
        { key: 'closet_drawer_price', label: 'Drawer Unit Price', type: 'number', placeholder: '0' },
        { key: 'closet_accessories_lump', label: 'Accessories Lump Sum (₹)', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const lf = P(d.closet_lf)||0;
        const rate = P(d.closet_rate_lf)||0;
        const inst = P(d.closet_install_lf)||0;
        const draw = P(d.closet_drawer_count)||0;
        const drawPrice = P(d.closet_drawer_price)||0;
        const acc = P(d.closet_accessories_lump)||0;
        return (lf * (rate + inst)) + (draw * drawPrice) + acc;
      } },

    { id: 'glass', name: 'Glass & Mirrors', icon: 'mirror', desc: 'Shower enclosures, vanity mirrors, glass partitions.',
      fields: [
        { key: 'location', label: 'Item / Location', type: 'text', placeholder: 'e.g. Master Shower' },
        { key: 'type', label: 'Type', type: 'select', options: ['Shower Enclosure', 'Vanity Mirror', 'Wall Mirror', 'Glass Partition', 'Backsplash Glass'] },
        { key: 'width', label: 'Width (in)', type: 'number', placeholder: '0' },
        { key: 'height', label: 'Height (in)', type: 'number', placeholder: '0' },
        { key: 'qty', label: 'Quantity', type: 'number', placeholder: '1' },
        { key: 'glass_material', label: 'Glass Type', type: 'select', options: ['Clear Tempered', 'Frosted', 'Low-Iron', 'Bronze Tint', 'Rain'] },
        { key: 'unit_price', label: 'Unit Price', type: 'number', placeholder: '0' },
        { key: 'install_price', label: 'Install Price', type: 'number', placeholder: '0' },
        { key: 'shower_type', label: 'Shower Enclosure Type', type: 'select', options: ['Frameless Heavy Glass', 'Semi-Frameless', 'Framed', 'Sliding By-Pass'] },
        { key: 'shower_lump', label: 'Shower Enclosure (lump)', type: 'number', placeholder: '0' },
        { key: 'vanity_mirror_sqft', label: 'Vanity Mirror Sq Ft', type: 'number', placeholder: '0' },
        { key: 'mirror_price_sqft', label: 'Mirror Price per Sq Ft', type: 'number', placeholder: '0' }
      ],
      costFn: d => {
        const qty = P(d.qty)||0;
        const up = P(d.unit_price)||0;
        const inst = P(d.install_price)||0;
        const lump = P(d.shower_lump)||0;
        const sqft = P(d.vanity_mirror_sqft)||0;
        const mp = P(d.mirror_price_sqft)||0;
        return (qty * (up + inst)) + lump + (sqft * mp);
      } },

    { id: 'fixture', name: 'Custom Fixtures', icon: 'hammer', desc: 'Fireplace surrounds, built-ins, miscellaneous vendor items.',
      fields: [
        { key: 'item', label: 'Item / Description', type: 'text', placeholder: 'e.g. Fireplace Surround' },
        { key: 'vendor', label: 'Vendor / Source', type: 'text', placeholder: 'e.g. Marble Supplier' },
        { key: 'qty', label: 'Quantity', type: 'number', placeholder: '1' },
        { key: 'unit_price', label: 'Unit Price', type: 'number', placeholder: '0' },
        { key: 'labor', label: 'Labor / Installation', type: 'number', placeholder: '0' },
        { key: 'confidence', label: 'Cost Confidence', type: 'select', options: ['Estimated', 'Quoted', 'Locked-PO', 'Invoiced'] }
      ],
      costFn: d => (P(d.qty)||0)*(P(d.unit_price)||0) + (P(d.labor)||0) }
  ];

// ── Patch financial.js to use entries for phase totals ────
  // Override computePhaseTotal to use entry-based sums for phases 1-10
  const _origComputePhaseTotal = Financial.computePhaseTotal;
  Financial.computePhaseTotal = function(phase) {
    const pid = Number(phase?.id);
    if (pid >= 1 && pid <= 10) {
      return sumAllEntries(pid) + ((State.getBills && State.getBills(pid))||[]).reduce((s,b)=>s+(parseFloat(b.totalAmount)||0),0);
    }
    return _origComputePhaseTotal(phase);
  };

  // ── Override renderTradePhases 1-10 with new 3-card hub ────
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
    10: [INTERIOR_CARDS_REF.filter(c=>!LABOR_IDS.includes(c.id)), INTERIOR_CARDS_REF.filter(c=>LABOR_IDS.includes(c.id))],
  };

  function makeTradeRenderer(phaseId) {
    return function(phase) {
      const [mat, lab] = PHASE_CARD_MAP[phaseId];
      return renderTradeHubNew(phase, mat, lab);
    };
  }

  // Override renderPhaseHub for phases 1-10 to use new 3-card hub
  const _origRenderPhaseHub = Phases.renderPhaseHub ? Phases.renderPhaseHub.bind(Phases) : null;
  Phases.renderPhaseHub = function(phase) {
    if (phase.id >= 1 && phase.id <= 10) {
      const [mat, lab] = PHASE_CARD_MAP[phase.id];
      return renderTradeHubNew(phase, mat, lab);
    }
    // For other phases, use original
    return _origRenderPhaseHub ? _origRenderPhaseHub(phase) : '';
  };

  Phases.renderTradePhase1 = makeTradeRenderer(1);
  Phases.renderTradePhase2 = makeTradeRenderer(2);
  Phases.renderTradePhase3 = makeTradeRenderer(3);
  Phases.renderTradePhase4 = makeTradeRenderer(4);
  Phases.renderTradePhase5 = makeTradeRenderer(5);
  Phases.renderTradePhase6 = makeTradeRenderer(6);
  Phases.renderTradePhase7 = makeTradeRenderer(7);
  Phases.renderTradePhase8 = makeTradeRenderer(8);
  Phases.renderTradePhase9 = makeTradeRenderer(9);
  Phases.renderTradePhase10 = makeTradeRenderer(10);

  // Override showInputCard for phases 1-10 to use new entry form
  const _origShowInputCard = (typeof App !== 'undefined' && App.showInputCard) ? App.showInputCard.bind(App) : null;
  if (typeof App !== 'undefined') {
    App.showInputCard = function(phaseId, cardId) {
      if (phaseId >= 1 && phaseId <= 10) {
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
  }

  // ── Live hub update function ────────────────────────────
  // Called by Financial.updateAllTotals() to refresh hub card
  // costs without a full re-render.
  function updateHubTotals(phaseId) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!phase) return;
    const [mat, lab] = PHASE_CARD_MAP[phaseId] || [[], []];
    const materialTotal = mat.reduce((s, c) => s + sumEntries(phaseId, c.id), 0);
    const laborTotal    = lab.reduce((s, c) => s + sumEntries(phaseId, c.id), 0);
    const bills         = (State.getBills(phaseId) || []);
    const billTotal     = bills.reduce((s, b) => s + (parseFloat(b.totalAmount) || 0), 0);
    const phaseTotal    = materialTotal + laborTotal + billTotal;
    const matCount      = mat.reduce((s, c) => s + getEntries(phaseId, c.id).length, 0);
    const labCount      = lab.reduce((s, c) => s + getEntries(phaseId, c.id).length, 0);

    const updateEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    updateEl(`hub-running-total-${phaseId}`, F.fmtFull(phaseTotal));
    updateEl(`hub-material-cost-${phaseId}`, F.fmt(materialTotal));
    updateEl(`hub-labor-cost-${phaseId}`,    F.fmt(laborTotal));
    updateEl(`hub-material-count-${phaseId}`, matCount + ' entries');
    updateEl(`hub-labor-count-${phaseId}`,    labCount + ' entries');
    updateEl(`hub-bill-count-${phaseId}`,     bills.length + ' bill' + (bills.length !== 1 ? 's' : '') + ' scanned');
    updateEl(`hub-bill-total-${phaseId}`,     F.fmt(billTotal));
  }

  Phases.updateHubTotals = updateHubTotals;
  Phases.getLaborCardsForPhase = getLaborCardsForPhase;
  Phases.getAllCardsForPhase = getAllCardsForPhase;

  // BUG 6 FIX: Force immediate totals refresh now that the override is applied
  // This fixes the "₹0 in sidebar" issue when phases-new-core.js loads after
  // app.js has already rendered the sidebar with old calc results
  if (typeof Financial !== 'undefined' && Financial.scheduleUpdate) {
    Financial.scheduleUpdate();
  }

  // ── BUG FIX: ALL_CARDS_REF must be declared BEFORE renderCardListView uses it ──
  // Previously it was declared AFTER, causing a TDZ ReferenceError when
  // Material Costs / Labor Costing cards were clicked.
  const ALL_CARDS_REF = PHASE_CARD_MAP
    ? Object.fromEntries(Object.entries(PHASE_CARD_MAP).map(([k, [mat, lab]]) => [k, [...mat, ...lab].reduce((o,c)=>(o[c.id]=c,o),{})]))
    : {};

  // Also expose renderCardListView and renderEntryForm on Phases so
  // App.showMaterialCards / App.showLaborCards / App.showEntryForm can call them
  Phases.renderCardListView = function(phaseId, isLabor) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject();
    if (!proj) return '<div style="padding:24px">No project loaded</div>';
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!phase) return '';
    const cards = (Object.values(ALL_CARDS_REF[phaseId] || {})).filter(c =>
      isLabor ? LABOR_IDS.includes(c.id) : !LABOR_IDS.includes(c.id));
    const label = isLabor ? 'Labor Costing' : 'Material Costs';
    const total = cards.reduce((s,c) => s + sumEntries(phaseId, c.id), 0);
    const cardHtml = cards.map(c => {
      const entries = getEntries(phaseId, c.id);
      const ct = entries.reduce((s,e) => s + (parseFloat(e.total)||0), 0);
      return `<button class="category-card" onclick="App.showEntryForm(${phaseId},'${c.id}')" style="text-align:left">
        <span class="category-card-arrow">${Phases.iconFor('arrowRight',14)}</span>
        <span class="category-card-icon">${Phases.iconFor(c.icon||'listChecks',28)}</span>
        <div class="category-card-name">${c.name}</div>
        <div class="category-card-desc">${c.desc}</div>
        <div class="category-card-meta">
          <div class="category-card-progress-label">${entries.length} entr${entries.length!==1?'ies':'y'}</div>
          <div class="category-card-cost">${F.fmt(ct)}</div>
        </div>
      </button>`;
    }).join('');
    return `<div class="category-hub">
      <div class="breadcrumb" style="margin-bottom:12px">
        <a onclick="App.showOverview()" style="cursor:pointer">Overview</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${phase.name}</span>
      </div>
      <div class="category-hub-header" style="margin-bottom:20px">
        <div class="category-hub-title">${Phases.iconFor(phase.icon, 20)} <span style="margin-left:8px">${phase.name}</span></div>
      </div>
      <div class="category-grid">${cardHtml}</div>
      
      <!-- Section details & total box at the bottom -->
      <div style="margin-top:24px;margin-bottom:20px;background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:var(--radius-lg);padding:14px 18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${label}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Tap any category above to add entries</div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700">${label} Total</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid rgba(255,255,255,0.05);padding-top:12px">
          <div style="font-size:12px;color:var(--text-muted)">Running Total for this section</div>
          <div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--amber-light)">${F.fmtFull(total)}</div>
        </div>
      </div>
    </div>`;
  };

  Phases.renderEntryForm = function(phaseId, cardId) {
    phaseId = Number(phaseId);
    // Delegate to showCardEntryForm which writes to content-area directly
    // Here we just trigger it and return the content-area html
    const proj = State.getCurrentProject();
    if (!proj) return '<div style="padding:24px">No project</div>';
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId));
    if (!phase) return '';
    const allCards = getAllCardsForPhase(phaseId);
    const card = allCards.find(c => c.id === cardId);
    if (!card) return '<div style="padding:24px">Card not found</div>';
    const isLabor = LABOR_IDS.includes(cardId);
    // Render the entry form and return the HTML (App.showEntryForm sets innerHTML)
    Phases._entryTotalOverride = false;
    // Use existing renderEntryForm from phases-new-core
    return renderEntryForm(phase, card, isLabor ? 'Labor Costing' : 'Material Costs');
  };

  console.log('[PhasesCore] Entry model patched — 3-card hub active for phases 1-9');

  // Dispatch an event so app.js (and other modules) can re-render if they
  // fell back to the "module loading…" message during the init window.
  if (typeof window !== 'undefined') {
    window.__phasesCoreReady = true;
    window.dispatchEvent(new CustomEvent('phasescoreready'));
  }
})();
