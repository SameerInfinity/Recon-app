/* ═══════════════════════════════════════════════════════════════
   ESTIMATION.JS — Project Cost Estimation Module  v3
   ─────────────────────────────────────────────────────────────
   Layout (matches user spec):
     1. Land / Development Estimate
        · Land Cost
        · Developing Fees  (D.N. Charges · Govt. Charges · Other Dev. Fees)
        · Architecture Fees
        · Other
     2. Construction Estimate
        Per trade (Civil, Tiles, Painting, Electrical, Fabrication,
                   Plumbing, POP, Lift, Other):
          → Material Amount  + Labour Amount  → Row Total
   ─────────────────────────────────────────────────────────────
   Features:
   · Live recalc – every keystroke updates all totals instantly
   · "Apply as Project Budget" → pushes grand total → proj.totalBudget
   · Project total budget shown on dashboard hero updates immediately
   · Manual budget override still works (edit in project settings)
   · Debounced auto-save via State.updateProjectInfo
   · Collapsible card header (tap to collapse / expand)
   · Each construction trade is an accordion row
   ═══════════════════════════════════════════════════════════════ */

const Estimation = (() => {
  const F = Financial;

  /* ── Construction trade definitions ─────────────────────── */
  const TRADES = [
    { key: 'civil',       label: 'Civil Work',              icon: 'foundation' },
    { key: 'tiles',       label: 'Tiles & Flooring',        icon: 'bricks'     },
    { key: 'painting',    label: 'Painting',                icon: 'paintbrush' },
    { key: 'electrical',  label: 'Electrical Work',         icon: 'zap'        },
    { key: 'fabrication', label: 'Furniture & Fabrication', icon: 'tools'      },
    { key: 'plumbing',    label: 'Plumbing Work',           icon: 'pipe'       },
    { key: 'pop',         label: 'POP & False Ceiling',     icon: 'roof'       },
    { key: 'lift',        label: 'Lift / Elevator',         icon: 'stairs'     },
    { key: 'other',       label: 'Other / Misc.',           icon: 'blocks'     },
  ];

  /* ── State helpers ──────────────────────────────────────── */
  function getEst() {
    const proj = State.getCurrentProject();
    if (!proj) return null;
    if (!proj.estimation) proj.estimation = {};
    const e = proj.estimation;
    if (!e.land) e.land = {
      landCost: '', devDN: '', devGovt: '', devOther: '',
      archFees: '', landOther: '', customItems: []
    };
    if (!e.constr) e.constr = {};
    TRADES.forEach(t => {
      if (!e.constr[t.key]) e.constr[t.key] = { material: '', labor: '' };
    });
    if (!Array.isArray(e.land.customItems)) e.land.customItems = [];
    return e;
  }

  function pn(v) { return parseFloat(String(v || '').replace(/[,₹$\s]/g, '')) || 0; }

  /* ── Totals ─────────────────────────────────────────────── */
  function calcLandTotal(e) {
    const l = e.land;
    const baseTotal = pn(l.landCost) + pn(l.devDN) + pn(l.devGovt) + pn(l.devOther)
         + pn(l.archFees) + pn(l.landOther);
    const customTotal = (l.customItems || []).reduce((sum, item) => sum + pn(item.amount), 0);
    return baseTotal + customTotal;
  }
  function calcConstrTotal(e) {
    return TRADES.reduce((s, t) => {
      const tr = e.constr[t.key] || {};
      return s + pn(tr.material) + pn(tr.labor);
    }, 0);
  }
  function calcGrandTotal(e) { return calcLandTotal(e) + calcConstrTotal(e); }

  /* ── DOM helpers ─────────────────────────────────────────── */
  function amtInput(id, val) {
    return `<div class="est-amt-wrap">
      <span class="est-rupee">₹</span>
      <input class="est-input mono" type="number" id="${escapeAttr(id)}"
        placeholder="0" value="${escapeAttr(val || '')}"
        min="0" step="any" inputmode="decimal"
        oninput="Estimation._onInput()">
    </div>`;
  }

  function labelRow(label, inputHtml, note) {
    return `<div class="est-row">
      <div class="est-row-left">
        <span class="est-row-label">${escapeHtml(label)}</span>
        ${note ? `<span class="est-row-note">${escapeHtml(note)}</span>` : ''}
      </div>
      <div class="est-row-right">${inputHtml}</div>
    </div>`;
  }

  function iconSvg(name, size = 13) {
    if (typeof Icons !== 'undefined' && Icons.render) return Icons.render(name, size);
    return '';
  }

  /* ── Custom Items Render ──────────────────────────────────── */
  function customItemRow(item, idx) {
    return `
      <div class="est-custom-item" data-idx="${idx}">
        <div class="est-custom-item-main">
          <input type="text" class="est-custom-item-title" value="${escapeAttr(item.title || '')}"
            placeholder="Item title" oninput="Estimation._updateCustomItem(${idx}, 'title', this.value)">
          <div class="est-amt-wrap est-custom-amt-wrap">
            <span class="est-rupee">₹</span>
            <input type="number" class="est-input est-custom-item-amt-input mono" value="${escapeAttr(item.amount || '')}"
              placeholder="0" min="0" step="any" inputmode="decimal"
              oninput="Estimation._updateCustomItem(${idx}, 'amount', this.value)">
          </div>
          <button class="est-custom-item-remove" onclick="Estimation._removeCustomItem(${idx})" type="button" aria-label="Remove">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function renderCustomItems(items) {
    const itemRows = (items || []).map(customItemRow).join('');

    return `
      <div class="est-custom-items" id="est-custom-items">
        <div class="est-custom-items-list">${itemRows}</div>
        <button class="est-btn-add-custom" onclick="Estimation._addCustomItem()" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Add New</span>
        </button>
      </div>`;
  }

  /* ── Main render ─────────────────────────────────────────── */
  function renderCard() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const e = getEst();
    const l = e.land;
    const landTotal   = calcLandTotal(e);
    const constrTotal = calcConstrTotal(e);
    const grandTotal  = calcGrandTotal(e);
    const budget      = proj.totalBudget || 0;
    const diff        = grandTotal - budget;
    const hasBudget   = budget > 0;

    /* ── Trade accordion rows ── */
    const tradeRows = TRADES.map(t => {
      const tr = e.constr[t.key] || {};
      const rowTotal = pn(tr.material) + pn(tr.labor);
      const matAmt = pn(tr.material);
      const labAmt = pn(tr.labor);
      return `
        <div class="est-trade-row" id="etr-${escapeAttr(t.key)}">
          <div class="est-trade-header" onclick="Estimation._toggleTrade('${escapeAttr(t.key)}')">
            <span class="est-trade-icon">${iconSvg(t.icon, 14)}</span>
            <span class="est-trade-name">${escapeHtml(t.label)}</span>
            <span class="est-trade-total mono" id="etr-tot-${escapeAttr(t.key)}">${rowTotal > 0 ? F.fmt(rowTotal) : '—'}</span>
            <svg class="est-trade-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="est-trade-body" id="etb-${escapeAttr(t.key)}">
            <div class="est-trade-fields">
              <div class="est-trade-cols">
                <div class="est-trade-col">
                  <div class="est-trade-field-label">Material Amount</div>
                  ${amtInput('ecm-' + t.key, tr.material)}
                  ${matAmt > 0 ? `<div class="est-trade-col-total">${F.fmt(matAmt)}</div>` : ''}
                </div>
                <div class="est-trade-col">
                  <div class="est-trade-field-label">Labour Amount</div>
                  ${amtInput('ecl-' + t.key, tr.labor)}
                  ${labAmt > 0 ? `<div class="est-trade-col-total">${F.fmt(labAmt)}</div>` : ''}
                </div>
              </div>
              ${rowTotal > 0 ? `
              <div class="est-trade-row-total">
                <span class="est-trade-row-total-label">Row Total</span>
                <span class="est-trade-row-total-val mono" id="etr-row-${escapeAttr(t.key)}">${F.fmtFull(rowTotal)}</span>
              </div>` : `<div id="etr-row-${escapeAttr(t.key)}" style="display:none"></div>`}
            </div>
          </div>
        </div>`;
    }).join('');

    /* ── Budget diff badge ── */
    let diffHtml = '';
    if (hasBudget && grandTotal > 0) {
      const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : '✓';
      const cls  = diff > 0 ? 'over' : diff < 0 ? 'under' : 'match';
      const msg  = diff > 0
        ? `${sign} ${F.fmt(diff)} over current budget`
        : diff < 0
        ? `${sign} ${F.fmt(Math.abs(diff))} under current budget`
        : `${sign} Matches budget exactly`;
      diffHtml = `<div class="est-grand-diff ${cls}" id="est-diff">${msg}</div>`;
    }

    return `
    <div class="est-card est-card--collapsed" id="est-card">

      <!-- ── Header ────────────────────────────────────────── -->
      <div class="est-card-header" onclick="Estimation._toggleCard()">
        <div class="est-card-title-wrap">
          <div class="est-card-icon-wrap">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"/>
              <line x1="9" y1="7" x2="15" y2="7"/>
              <line x1="9" y1="11" x2="15" y2="11"/>
              <line x1="9" y1="15" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <div class="est-card-title">Project Estimation</div>
            <div class="est-card-subtitle">Pre-construction cost breakdown</div>
          </div>
        </div>
        <div class="est-card-header-right">
          ${grandTotal > 0 ? `<span class="est-card-badge mono">${F.fmt(grandTotal)}</span>` : '<span class="est-card-badge-empty">Enter values</span>'}
          <svg class="est-collapse-icon" id="est-collapse-icon" style="transform:rotate(-90deg)" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>

      <!-- ── Body ──────────────────────────────────────────── -->
      <div class="est-body est-body--collapsed" id="est-body">

        <!-- ════ SECTION 1 : LAND / DEVELOPMENT ════ -->
        <div class="est-section">

          <div class="est-section-title">
            <span class="est-section-num">1</span>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7">
              <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
              <path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/>
            </svg>
            Land &amp; Development Estimate
          </div>

          <!-- Land Cost -->
          ${labelRow('Land Cost', amtInput('el-landCost', l.landCost))}

          <!-- Developing Fees group -->
          <div class="est-group">
            <div class="est-group-label">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="opacity:.6"><polyline points="9 18 15 12 9 6"/></svg>
              Developing Fees
            </div>
            <div class="est-group-body">
              ${labelRow('D.N. Charges',     amtInput('el-devDN',    l.devDN),    'Development Notes')}
              ${labelRow('Govt. Charges',    amtInput('el-devGovt',  l.devGovt),  'NOC · Stamp duty · Fees')}
              ${labelRow('Other Dev. Fees',  amtInput('el-devOther', l.devOther))}
            </div>
          </div>

          <!-- Architecture Fees -->
          ${labelRow('Architecture Fees', amtInput('el-archFees', l.archFees))}

          <!-- Custom Items (Add New) -->
          ${renderCustomItems(l.customItems)}

          <div class="est-subtotal-row">
            <span class="est-subtotal-label">Section 1 Total</span>
            <span class="est-subtotal-val mono" id="est-land-total">${F.fmtFull(landTotal)}</span>
          </div>
        </div>

        <!-- ════ SECTION 2 : CONSTRUCTION ════ -->
        <div class="est-section" style="margin-top:10px">

          <div class="est-section-title">
            <span class="est-section-num">2</span>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7">
              <path d="M3 9.5L12 4l9 5.5V20H3z"/>
              <line x1="9" y1="20" x2="9" y2="14"/><line x1="15" y1="20" x2="15" y2="14"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            Construction Estimate
          </div>

          <div class="est-trade-header-row">
            <span style="flex:1;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--text-faint)">Trade</span>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--text-faint);min-width:72px;text-align:right;margin-right:20px">Total</span>
          </div>

          <div class="est-trades-list">
            ${tradeRows}
          </div>

          <div class="est-subtotal-row">
            <span class="est-subtotal-label">Section 2 Total</span>
            <span class="est-subtotal-val mono" id="est-constr-total">${F.fmtFull(constrTotal)}</span>
          </div>
        </div>

        <!-- ════ GRAND TOTAL ════ -->
        <div class="est-grand-row" id="est-grand-row">
          <div class="est-grand-left">
            <div class="est-grand-label">Project Total Estimate</div>
            <div class="est-grand-breakdown">
              <span>Land <span class="mono" id="est-gb-land">${F.fmt(landTotal)}</span></span>
              <span class="est-grand-plus">+</span>
              <span>Construction <span class="mono" id="est-gb-constr">${F.fmt(constrTotal)}</span></span>
            </div>
            <div id="est-diff-wrap">${diffHtml}</div>
          </div>
          <div class="est-grand-val mono" id="est-grand-total">${F.fmtFull(grandTotal)}</div>
        </div>

        <!-- ════ ACTIONS ════ -->
        <div class="est-actions">
          <button class="est-btn-apply" onclick="Estimation.applyToBudget()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Apply as Project Budget
          </button>
          <button class="est-btn-clear" onclick="Estimation.clearAll()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
            Clear
          </button>
        </div>

      </div><!-- /est-body -->
    </div><!-- /est-card -->`;
  }

  /* ── Toggle card collapse ───────────────────────────────── */
  function _toggleCard() {
    const body = document.getElementById('est-body');
    const icon = document.getElementById('est-collapse-icon');
    const card = document.getElementById('est-card');
    if (!body) return;
    const isCollapsed = body.classList.toggle('est-body--collapsed');
    if (icon) icon.style.transform = isCollapsed ? 'rotate(-90deg)' : '';
    if (card) card.classList.toggle('est-card--collapsed', isCollapsed);
  }

  /* ── Toggle individual trade row ───────────────────────── */
  function _toggleTrade(key) {
    const row = document.getElementById('etr-' + key);
    if (!row) return;
    row.classList.toggle('est-trade-row--open');
  }

  /* ── Live recalc on any input change ───────────────────── */
  let _saveTimer = null;

  function _onInput() {
    const e = getEst();
    if (!e) return;
    const l = e.land;

    /* Collect land inputs */
    const ids = ['landCost','devDN','devGovt','devOther','archFees','landOther'];
    ids.forEach(k => { l[k] = _val('el-' + k); });

    /* Collect trade inputs */
    TRADES.forEach(t => {
      if (!e.constr[t.key]) e.constr[t.key] = {};
      e.constr[t.key].material = _val('ecm-' + t.key);
      e.constr[t.key].labor    = _val('ecl-' + t.key);
    });

    /* Recalculate */
    const landTot   = calcLandTotal(e);
    const constrTot = calcConstrTotal(e);
    const grand     = landTot + constrTot;
    const proj      = State.getCurrentProject();
    const budget    = proj ? (proj.totalBudget || 0) : 0;
    const diff      = grand - budget;

    /* Update DOM – no full re-render */
    _set('est-land-total',   F.fmtFull(landTot));
    _set('est-constr-total', F.fmtFull(constrTot));
    _set('est-grand-total',  F.fmtFull(grand));
    _set('est-gb-land',      F.fmt(landTot));
    _set('est-gb-constr',    F.fmt(constrTot));

    /* Header badge */
    const badge = document.querySelector('#est-card .est-card-badge');
    if (badge) badge.textContent = grand > 0 ? F.fmt(grand) : '';
    const emptyBadge = document.querySelector('#est-card .est-card-badge-empty');
    if (emptyBadge) emptyBadge.textContent = grand > 0 ? '' : 'Enter values';

    /* Per-trade row totals + row total line inside accordion */
    TRADES.forEach(t => {
      const tr = e.constr[t.key] || {};
      const rowTot = pn(tr.material) + pn(tr.labor);
      const totEl = document.getElementById('etr-tot-' + t.key);
      if (totEl) totEl.textContent = rowTot > 0 ? F.fmt(rowTot) : '—';
      const rowEl = document.getElementById('etr-row-' + t.key);
      if (rowEl) {
        if (rowTot > 0) {
          rowEl.style.display = '';
          rowEl.innerHTML = `<span class="est-trade-row-total-label">Row Total</span><span class="est-trade-row-total-val mono">${F.fmtFull(rowTot)}</span>`;
          rowEl.className = 'est-trade-row-total';
        } else {
          rowEl.style.display = 'none';
        }
      }
    });

    /* Budget diff */
    const diffWrap = document.getElementById('est-diff-wrap');
    if (diffWrap && budget > 0 && grand > 0) {
      const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : '✓';
      const cls  = diff > 0 ? 'over' : diff < 0 ? 'under' : 'match';
      const msg  = diff > 0
        ? `${sign} ${F.fmt(diff)} over current budget`
        : diff < 0
        ? `${sign} ${F.fmt(Math.abs(diff))} under current budget`
        : `${sign} Matches budget exactly`;
      diffWrap.innerHTML = `<div class="est-grand-diff ${cls}">${msg}</div>`;
    } else if (diffWrap) {
      diffWrap.innerHTML = '';
    }

    /* Debounced save */
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => State.updateProjectInfo({ estimation: e }), 800);
  }

  function _val(id) { return document.getElementById(id)?.value || ''; }
  function _set(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

  /* ── Apply grand total → project budget ─────────────────── */
  function applyToBudget() {
    const e = getEst();
    if (!e) return;
    const grand = calcGrandTotal(e);
    if (grand <= 0) { App.toast('Enter at least one value first', 'warning'); return; }

    // Set total project budget + per-phase budgets from estimation
    const proj = State.getCurrentProject();
    if (proj && Array.isArray(proj.phases)) {
      proj.phases.forEach(ph => {
        const tb = getTradeBudget(ph.id);
        if (tb && tb.total > 0) {
          ph.budget = tb.total;
          ph.budgetMaterial = tb.material;
          ph.budgetLabor = tb.labor;
        }
      });
    }

    State.updateProjectInfo({ totalBudget: grand, estimation: e });
    App.toast('✓ Budget set to ' + F.fmtFull(grand), 'success');

    /* Update diff display immediately */
    const diffWrap = document.getElementById('est-diff-wrap');
    if (diffWrap) {
      diffWrap.innerHTML = `<div class="est-grand-diff match">✓ Matches budget exactly</div>`;
    }

    /* Recalculate all completions now that budgets are set */
    if (typeof Financial !== 'undefined' && Financial.recalcAllCompletions) {
      Financial.recalcAllCompletions();
    }

    /* Refresh dashboard hero card */
    if (typeof App !== 'undefined' && App.refreshDashboard) {
      setTimeout(() => App.refreshDashboard(), 80);
    }
  }

  /* ── Clear all estimation data ──────────────────────────── */
  function clearAll() {
    if (!confirm('Clear all estimation values? This cannot be undone.')) return;
    const proj = State.getCurrentProject();
    if (!proj) return;
    proj.estimation = {};
    State.updateProjectInfo({ estimation: {} });
    const card = document.getElementById('est-card');
    if (card) {
      const fresh = document.createElement('div');
      fresh.innerHTML = renderCard();
      card.replaceWith(fresh.firstElementChild);
    }
    App.toast('Estimation cleared', 'success');
  }

  /* ── Custom Item Handlers ────────────────────────────────── */
  function _addCustomItem() {
    const e = getEst();
    if (!e) return;
    if (!e.land.customItems) e.land.customItems = [];
    e.land.customItems.push({ title: '', amount: '' });
    State.updateProjectInfo({ estimation: e });
    _rerenderCustomItems();
  }

  function _removeCustomItem(idx) {
    const e = getEst();
    if (!e || !e.land.customItems) return;
    e.land.customItems.splice(idx, 1);
    State.updateProjectInfo({ estimation: e });
    _rerenderCustomItems();
  }

  function _updateCustomItem(idx, field, value) {
    const e = getEst();
    if (!e || !e.land.customItems || !e.land.customItems[idx]) return;
    e.land.customItems[idx][field] = value;
    State.updateProjectInfo({ estimation: e });
    _onInput();
  }

  function _rerenderCustomItems() {
    const e = getEst();
    if (!e) return;
    const listContainer = document.querySelector('#est-custom-items .est-custom-items-list');
    if (!listContainer) return;
    if (e.land.customItems && e.land.customItems.length > 0) {
      listContainer.innerHTML = e.land.customItems.map(customItemRow).join('');
    } else {
      listContainer.innerHTML = '';
    }
    _onInput();
  }



  /* ── Map Estimation trades to Phase IDs ─────────────────── */
  const TRADE_PHASE_MAP = {
    civil: 1, tiles: 2, painting: 3, electrical: 4,
    fabrication: 5, plumbing: 6, pop: 7, lift: 8, other: 9
  };

  /**
   * Get the per-trade budget from estimation for a given phase ID.
   * Returns { material: number, labor: number, total: number }
   * or null if no estimation data exists for that trade.
   */
  function getTradeBudget(phaseId) {
    const proj = State.getCurrentProject();
    if (!proj || !proj.estimation || !proj.estimation.constr) return null;
    // Find which trade key maps to this phase ID
    const tradeKey = Object.keys(TRADE_PHASE_MAP).find(k => TRADE_PHASE_MAP[k] === Number(phaseId));
    if (!tradeKey) return null;
    const tr = proj.estimation.constr[tradeKey];
    if (!tr) return null;
    const material = pn(tr.material);
    const labor = pn(tr.labor);
    return { material, labor, total: material + labor };
  }

  return { renderCard, _toggleCard, _toggleTrade, _onInput, applyToBudget, clearAll, _addCustomItem, _removeCustomItem, _updateCustomItem, getTradeBudget, TRADE_PHASE_MAP };

})();
