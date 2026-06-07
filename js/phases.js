/* ═══════════════════════════════════════════
   PHASES.JS — All 8 Construction Phase UIs
   ═══════════════════════════════════════════ */

const Phases = (() => {
  const F = Financial;

  function phaseSectionCard(id, title, content, startOpen = true) {
    return `
    <div class="section-card ${startOpen ? '' : 'collapsed'}" id="sc-${id}">
      <div class="section-card-header" onclick="Phases.toggleSection('sc-${id}')">
        <span class="section-card-title">${title}</span>
        <div class="section-card-meta">
          <span class="section-card-total" id="sct-${id}">—</span>
          <span class="section-toggle-icon">▼</span>
        </div>
      </div>
      <div class="section-card-body">${content}</div>
    </div>`;
  }

  function fieldRow(cols, ...fields) {
    return `<div class="field-row cols-${cols}">${fields.join('')}</div>`;
  }

  function field(label, inputHtml) {
    return `<div class="field-group"><label class="field-label">${label}</label>${inputHtml}</div>`;
  }

  function inp(id, type = 'text', placeholder = '', extra = '') {
    return `<input class="field-input" type="${type}" id="${id}" placeholder="${placeholder}" ${extra}>`;
  }

  function monoInp(id, placeholder = '0', extra = '') {
    return `<input class="field-input mono" type="number" id="${id}" placeholder="${placeholder}" min="0" step="any" ${extra}>`;
  }

  function currInp(id, placeholder = '0') {
    return `<div class="currency-input-wrap"><span class="currency-symbol">₹</span><input class="field-input mono" type="number" id="${id}" placeholder="${placeholder}" min="0" step="any" style="min-width:0"></div>`;
  }

  function costTag(type) {
    const map = { material:'cost-tag-material', labor:'cost-tag-labor', equipment:'cost-tag-equipment', permit:'cost-tag-permit', contingency:'cost-tag-contingency' };
    return `<span class="cost-tag ${map[type] || 'cost-tag-material'}">${type}</span>`;
  }

  function sel(id, options, extra = '') {
    const opts = options.map(o => Array.isArray(o) ? `<option value="${o[0]}">${o[1]}</option>` : `<option value="${o}">${o}</option>`).join('');
    return `<select class="field-select" id="${id}" ${extra}><option value="">— Select —</option>${opts}</select>`;
  }

  function liveTotal(id, label = 'Section Total') {
    return `<div class="live-total"><span class="live-total-label">${label}</span><span class="live-total-value" id="${id}">₹0</span></div>`;
  }

  function completionBar(phaseId) {
    return `
    <div class="completion-bar-section">
      <span class="completion-label">Phase Completion</span>
      <div class="completion-bar-outer"><div class="completion-bar-inner" id="comp-bar-${phaseId}" style="width:0%"></div></div>
      <input class="completion-pct-input" type="number" min="0" max="100" id="comp-pct-${phaseId}" placeholder="0" title="Completion %"
        onchange="Phases.setCompletion(${phaseId}, this.value)">
      <span style="font-size:12px;color:var(--text-muted)">%</span>
    </div>`;
  }

  function addRowBtn(label, fn) {
    return `<button class="add-row-btn" onclick="${fn}">+ Add ${label}</button>`;
  }

  function phaseHeader(phase) {
    const proj = State.getCurrentProject();
    const budget = proj ? proj.totalBudget / 8 : 0;
    return `
    <div class="phase-header">
      <div class="phase-title-block">
        <div class="phase-title">${phase.icon} ${phase.name}</div>
        <div class="phase-subtitle">Phase ${phase.id} of 8 · Construction Financial Ledger</div>
      </div>
      <div class="phase-summary-box">
        ${budget > 0 ? `
        <div class="budget-bar-container">
          <div class="budget-bar-label"><span>Phase Budget</span><span>${F.fmt(budget)}</span></div>
          <div class="budget-bar-outer"><div class="budget-bar-fill" id="budget-bar-${phase.id}" style="width:0%"></div></div>
        </div>` : ''}
        <div class="phase-total-display">
          <div class="phase-total-label">Phase Total</div>
          <div class="phase-total-amount" id="phase-total-${phase.id}">₹0</div>
        </div>
      </div>
    </div>
    ${completionBar(phase.id)}`;
  }

  function toggleSection(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('collapsed');
  }

  function setCompletion(phaseId, val) {
    const pct = Math.min(100, Math.max(0, parseInt(val) || 0));
    State.setPhaseCompletion(phaseId, pct);
    const bar = document.getElementById(`comp-bar-${phaseId}`);
    if (bar) bar.style.width = pct + '%';
    const sideBar = document.getElementById(`phase-prog-${phaseId}`);
    if (sideBar) sideBar.style.width = pct + '%';
    const sidePct = document.getElementById(`phase-pct-${phaseId}`);
    if (sidePct) sidePct.textContent = pct + '%';
  }

  // ─── PHASE 1: Pre-Construction ────────────────────────────
  function renderPhase1(phase) {
    const d = phase.data;
    const s = d.survey || {};
    const perms = d.permits || [{}];
    const ti = d.temp_infra || {};

    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p1-survey', '1A — Digital Site Survey & Geotech Log', `
      ${fieldRow(2,
        field('Soil Bearing Capacity', `<div style="display:flex;gap:8px">${monoInp('soil_bearing','0')} <div class="unit-toggle"><button class="active" id="sbc-kn">kN/m²</button><button id="sbc-lb">lbs/ft²</button></div></div>`),
        field('Water Table Depth', `<div style="display:flex;gap:8px">${monoInp('water_table','0')}<div class="unit-toggle"><button class="active" id="wtd-m">m</button><button id="wtd-ft">ft</button></div></div>`)
      )}
      ${fieldRow(2,
        field('Soil Classification', sel('soil_class', ['Rock','Sand','Gravel','Silt','Clay','Peat'])),
        field('Site Slope Gradient (%)', monoInp('site_slope','0'))
      )}
      <hr style="border-color:var(--charcoal-border);margin:16px 0">
      <div style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Financial Entries</div>
      ${fieldRow(3,
        field('Geotech Survey Cost', currInp('geotech_cost')),
        field('Soil Test Fee (per test)', currInp('soil_test_fee')),
        field('# of Soil Tests', monoInp('soil_test_count','1'))
      )}
      ${field('Site Survey Engineer Fee', currInp('survey_engineer_fee'))}
      ${liveTotal('p1-survey-total', 'Survey & Geotech Total')}
    `)}

    ${phaseSectionCard('p1-permits', '1B — Permit & Fee Tracker', `
      <table class="line-table">
        <thead><tr>
          <th>Permit Type</th><th>Permit #</th><th>Status</th>
          <th>Fee Amount</th><th>Issue Date</th><th>Expiry</th><th></th>
        </tr></thead>
        <tbody id="permit-rows">${permRows(perms)}</tbody>
      </table>
      ${addRowBtn('Permit', 'Phases.addPermitRow()')}
    `)}

    ${phaseSectionCard('p1-infra', '1C — Temporary Site Infrastructure', `
      ${renderToggleCard('power', 'Temporary Power', `
        ${fieldRow(3, field('Connection Fee', currInp('power_conn')), field('Monthly Rate', currInp('power_monthly')), field('Months', monoInp('power_months','1')))}
      `)}
      ${renderToggleCard('water', 'Temporary Water Meter', `
        ${fieldRow(2, field('ID / Account', inp('water_id')), field('Monthly Rate', currInp('water_monthly')))}
        ${field('Months', monoInp('water_months','1'))}
      `)}
      ${renderToggleCard('porta', 'Porta-Potty', `
        ${fieldRow(2, field('Weekly Rate', currInp('porta_weekly')), field('Estimated Weeks', monoInp('porta_weeks','4')))}
      `)}
      ${renderToggleCard('fence', 'Site Fencing', `
        ${fieldRow(2, field('Linear Feet', monoInp('fence_lf')), field('Rate per Foot', currInp('fence_rate')))}
      `)}
      ${renderToggleCard('dumpster', 'Dumpster', `
        ${fieldRow(3, field('Capacity', sel('dump_capacity',['10 yd','20 yd','30 yd','40 yd'])), field('Pickup Count', monoInp('dumpster_pickups','1')), field('Rate per Pickup', currInp('dumpster_rate')))}
      `)}
      ${renderToggleCard('trailer', 'Site Office/Trailer', `
        ${fieldRow(2, field('Monthly Rate', currInp('trailer_monthly')), field('Months', monoInp('trailer_months','1')))}
      `)}
      ${liveTotal('p1-infra-total', 'Temp Infrastructure Total')}
    `)}`;
  }

  function permRows(perms) {
    return perms.map((p, i) => `
      <tr id="permit-row-${i}">
        <td class="input-td">${permitTypeSel(i, p.permit_type)}</td>
        <td class="input-td"><input type="text" value="${p.permit_number||''}" placeholder="Permit #" oninput="Phases.updatePermit(${i},'permit_number',this.value)" style="width:100px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td">${permitStatusSel(i, p.permit_status)}</td>
        <td class="input-td"><input type="number" value="${p.fee_amount||''}" placeholder="0" oninput="Phases.updatePermit(${i},'fee_amount',this.value);Financial.scheduleUpdate()" style="width:100px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="date" value="${p.issuance_date||''}" oninput="Phases.updatePermit(${i},'issuance_date',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="date" value="${p.expiration_date||''}" oninput="Phases.updatePermit(${i},'expiration_date',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td><button class="delete-row-btn" onclick="Phases.deletePermitRow(${i})">🗑</button></td>
      </tr>`).join('');
  }

  function permitTypeSel(i, val) {
    const opts = ['Zoning','Master Building','MEP','Environmental','Curb-Cut','Occupancy'];
    return `<select onchange="Phases.updatePermit(${i},'permit_type',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px">
      <option value="">Type…</option>${opts.map(o=>`<option ${val===o?'selected':''}>${o}</option>`).join('')}</select>`;
  }

  function permitStatusSel(i, val) {
    const statuses = ['Not Started','Under Review','Approved','Rejected','Expired'];
    const cls = {'Approved':'status-approved','Rejected':'status-rejected','Expired':'status-expired','Under Review':'status-under-review','Not Started':'status-not-started'};
    return `<select onchange="Phases.updatePermit(${i},'permit_status',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px">
      ${statuses.map(s=>`<option class="${cls[s]||''}" ${val===s?'selected':''}>${s}</option>`).join('')}</select>`;
  }

  function addPermitRow() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === 1);
    if (!phase.data.permits) phase.data.permits = [{}];
    phase.data.permits.push({});
    State.save();
    const tbody = document.getElementById('permit-rows');
    if (tbody) tbody.innerHTML = permRows(phase.data.permits);
  }

  function deletePermitRow(i) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === 1);
    if (phase.data.permits) phase.data.permits.splice(i, 1);
    State.save();
    const tbody = document.getElementById('permit-rows');
    if (tbody) tbody.innerHTML = permRows(phase.data.permits);
    Financial.scheduleUpdate();
  }

  function updatePermit(i, key, val) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === 1);
    if (!phase.data.permits) phase.data.permits = [{}];
    if (!phase.data.permits[i]) phase.data.permits[i] = {};
    phase.data.permits[i][key] = val;
    State.save();
  }

  function renderToggleCard(id, title, body) {
    return `
    <div class="toggle-card" id="tc-${id}">
      <div class="toggle-card-header" onclick="Phases.toggleCard('${id}')">
        <span class="toggle-card-title">${title}</span>
        <div class="toggle-switch" id="ts-${id}"></div>
      </div>
      <div class="toggle-card-body">${body}</div>
    </div>`;
  }

  function toggleCard(id) {
    const card = document.getElementById(`tc-${id}`);
    const sw = document.getElementById(`ts-${id}`);
    if (card && sw) {
      card.classList.toggle('active');
      sw.classList.toggle('on');
      Financial.scheduleUpdate();
    }
  }

  function renderPermitRow(i, p) { return permRows([p]); }

  // ─── PHASE 2: Site & Foundation ─────────────────────────
  function renderPhase2(phase) {
    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p2-earth', '2A — Earthwork & Excavation Calculator', `
      ${fieldRow(3, field('Cut Volume (cu yd)', monoInp('cut_vol')), field('Fill Volume (cu yd)', monoInp('fill_vol')), field('Haul-Off Truck Loads', monoInp('haul_loads')))}
      ${fieldRow(2, field('Equipment Daily Rate', currInp('equip_rate')), field('Equipment Days', monoInp('equip_days','1')))}
      ${fieldRow(2, field('Operator Labor Rate/Day', currInp('op_rate')), field('Operator Days', monoInp('op_days','1')))}
      ${fieldRow(2, field('Hauling Cost per Load', currInp('haul_cost_per_load')), field('Disposal/Tipping Fee', currInp('disposal_fee')))}
      ${liveTotal('p2-earth-total', 'Net Earthwork Cost')}
    `)}
    ${phaseSectionCard('p2-concrete', '2B — Concrete & Rebar (Foundation)', `
      ${fieldRow(2, field('Foundation Type', sel('foundation_type',['Slab-on-Grade','Crawlspace','Full Basement','Pier & Beam'])), field('Concrete PSI Strength', sel('concrete_psi',['2500','3000','4000','5000'])))}
      ${fieldRow(2, field('Concrete Volume (cu yd)', monoInp('concrete_volume')), field('Price per Cubic Yard', currInp('concrete_price_per_yard')))}
      ${fieldRow(2, field('Rebar Size', sel('rebar_size',['#3','#4','#5','#6','#7','#8'])), field('Total Rebar (LF)', monoInp('rebar_lf')))}
      ${fieldRow(2, field('Rebar Price per LF', currInp('rebar_price_per_lf')), field('Vapor Barrier Thickness (mil)', sel('vapor_mil',['6','10','15'])))}
      ${fieldRow(3, field('Formwork Cost', currInp('formwork_cost')), field('Ready-Mix Delivery', currInp('readymix_delivery')), field('Pump Truck Rental', currInp('pump_rental')))}
      ${field('Cure Time (days, tracking)', monoInp('cure_time','28'))}
      ${liveTotal('p2-concrete-total', 'Concrete & Foundation Total')}
    `)}
    ${phaseSectionCard('p2-utility', '2C — Underground Utility Trenching', `
      ${fieldRow(2, field('Sewer Main Pipe Diameter', sel('sewer_dia',['4"','6"','8"'])), field('Sewer Pipe (LF)', monoInp('sewer_lf')))}
      ${fieldRow(2, field('Sewer Price/LF', currInp('sewer_price')), field('Water Line Material', sel('water_material',['Copper','PEX','PVC'])))}
      ${fieldRow(2, field('Water Line (LF)', monoInp('water_lf')), field('Water Price/LF', currInp('water_price')))}
      ${fieldRow(2, field('Conduit Schedule', sel('conduit_sched',['Sch 40 PVC','Sch 80 PVC','Rigid Metal'])), field('Conduit (LF)', monoInp('conduit_lf')))}
      ${fieldRow(3, field('Conduit Price/LF', currInp('conduit_price')), field('Trenching Rate/LF', currInp('trench_rate')), field('Total Trench LF', monoInp('trench_lf')))}
      ${fieldRow(3, field('Gravel/Sand (tons)', monoInp('bedding_tons')), field('Bedding Price/ton', currInp('bedding_price')), field('Inspection Fee', currInp('inspection_fee')))}
      ${liveTotal('p2-utility-total', 'Utility Trenching Total')}
    `)}`;
  }

  // ─── PHASE 3: Framing ────────────────────────────────────
  function renderPhase3(phase) {
    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p3-skel', '3A — Structural Skeleton', `
      ${fieldRow(2, field('Framing Material', sel('framing_type',['Dimensional Lumber','Engineered Wood/I-Joists','Light-Gauge Steel','Heavy Structural Steel','ICF'])), field('Lumber Grade', sel('lumber_grade',['No.1','No.2','Stud','Construction'])))}
      ${fieldRow(2, field('Stud Spacing', sel('stud_spacing',['16 O.C.','24 O.C.'])), field('Floor Joist Span (ft)', monoInp('floor_joist_span')))}
      ${fieldRow(2, field('Total Board Feet', monoInp('board_feet')), field('Price per BF', currInp('price_per_bf')))}
      ${fieldRow(2, field('Hardware (lump sum)', currInp('hardware_lump')), field('Crane Rental', currInp('crane_rental')))}
      ${liveTotal('p3-skel-total', 'Structural Skeleton Total')}
    `)}
    ${phaseSectionCard('p3-roof', '3B — Roofing & Weatherproofing', `
      ${fieldRow(2, field('Roof System Type', sel('roof_type',['Asphalt Shingles','Metal Standing Seam','Modified Bitumen','TPO Membrane','Clay/Concrete Tile'])), field('Roof Squares (100 sq ft)', monoInp('roof_squares')))}
      ${fieldRow(2, field('Shingle/Material Price/sq', currInp('shingle_price')), field('Underlayment (sq ft)', monoInp('underlayment_sqft')))}
      ${fieldRow(2, field('Underlayment Price/sqft', currInp('underlayment_price')), field('Decking/Sheathing Cost', currInp('decking_cost')))}
      ${fieldRow(2, field('Flashing & Ridge Cost', currInp('flashing_cost')), field('Roofing Labor', currInp('roof_labor')))}
      ${liveTotal('p3-roof-total', 'Roofing Total')}
    `)}
    ${phaseSectionCard('p3-windows', '3C — Windows & Exterior Doors', `
      <div style="margin-bottom:12px;font-size:12px;color:var(--text-muted)">Windows — add each window/door unit</div>
      <table class="line-table">
        <thead><tr><th>Type / Label</th><th>Width</th><th>Height</th><th>Qty</th><th class="right">Unit Price</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="window-rows">${renderWindowRows()}</tbody>
      </table>
      ${addRowBtn('Window/Door', 'Phases.addWindowRow()')}
      ${fieldRow(2, field('Installation Labor', currInp('win_install_labor')), field('Hardware / Locks', currInp('win_hardware')))}
      ${liveTotal('p3-win-total', 'Windows & Doors Total')}
    `)}`;
  }

  function renderWindowRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p=>p.id===3);
    const rows = (ph && ph.data.window_rows) || [{}];
    return rows.map((r,i)=>`
      <tr id="wrow-${i}">
        <td class="input-td"><input type="text" value="${r.label||''}" placeholder="e.g. Living Room Window" oninput="Phases.updateWindowRow(${i},'label',this.value)" style="width:140px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="text" value="${r.width||''}" placeholder='e.g. 36"' oninput="Phases.updateWindowRow(${i},'width',this.value)" style="width:70px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="text" value="${r.height||''}" placeholder='e.g. 48"' oninput="Phases.updateWindowRow(${i},'height',this.value)" style="width:70px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.qty||1}" min="1" oninput="Phases.updateWindowRow(${i},'qty',this.value);Financial.scheduleUpdate()" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:13px;font-family:var(--font-mono)"></td>
        <td class="input-td"><input type="number" value="${r.unit_price||''}" min="0" placeholder="0" oninput="Phases.updateWindowRow(${i},'unit_price',this.value);Financial.scheduleUpdate()" style="width:100px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:13px;font-family:var(--font-mono)"></td>
        <td class="computed">${F.fmt(F.mul(r.qty||1, r.unit_price||0))}</td>
        <td><button class="delete-row-btn" onclick="Phases.deleteWindowRow(${i})">🗑</button></td>
      </tr>`).join('');
  }

  function addWindowRow() { addGenRow(3, 'window_rows', 'window-rows', renderWindowRows); }
  function deleteWindowRow(i) { delGenRow(3, 'window_rows', i, 'window-rows', renderWindowRows); }
  function updateWindowRow(i, k, v) { updateGenRow(3, 'window_rows', i, k, v); }

  // Generic row helpers
  function addGenRow(phaseId, key, tbodyId, renderFn) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p=>p.id===phaseId);
    if (!ph.data[key]) ph.data[key] = [{}];
    ph.data[key].push({});
    State.save();
    const tb = document.getElementById(tbodyId);
    if (tb) tb.innerHTML = renderFn();
    Financial.scheduleUpdate();
  }

  function delGenRow(phaseId, key, i, tbodyId, renderFn) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p=>p.id===phaseId);
    if (ph.data[key]) ph.data[key].splice(i, 1);
    State.save();
    const tb = document.getElementById(tbodyId);
    if (tb) tb.innerHTML = renderFn();
    Financial.scheduleUpdate();
  }

  function updateGenRow(phaseId, key, i, k, v) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p=>p.id===phaseId);
    if (!ph.data[key]) ph.data[key] = [{}];
    if (!ph.data[key][i]) ph.data[key][i] = {};
    ph.data[key][i][k] = v;
    State.save();
  }

  // ─── PHASE 4: MEP Rough-In ────────────────────────────────
  function renderPhase4(phase) {
    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p4-hvac', '4A — HVAC Distribution', `
      ${fieldRow(2, field('HVAC System Type', sel('hvac_type',['Central Forced Air','Heat Pump','Mini-Split','Hydronic Radiant'])), field('System Capacity (tons)', monoInp('system_tons')))}
      ${fieldRow(2, field('SEER2 Efficiency Rating', monoInp('seer2')), field('Equipment Unit Cost', currInp('equip_cost')))}
      ${fieldRow(2, field('Ductwork Material', sel('duct_material',['Sheet Metal','Flex Duct','Duct Board'])), field('Duct Linear Feet', monoInp('duct_lf')))}
      ${fieldRow(2, field('Duct Price/LF', currInp('duct_price')), field('Supply Registers Count', monoInp('registers')))}
      ${fieldRow(3, field('Register Unit Price', currInp('register_price')), field('Return Air Grilles', monoInp('grilles')), field('Grille Unit Price', currInp('grille_price')))}
      ${fieldRow(3, field('Refrigerant Line (LF)', monoInp('refrig_lf')), field('Refrig. Price/LF', currInp('refrig_price')), field('Condensate Drain', currInp('condensate')))}
      ${field('HVAC Labor', currInp('hvac_labor'))}
      ${liveTotal('p4-hvac-total', 'HVAC Total')}
    `)}
    ${phaseSectionCard('p4-plumb', '4B — Plumbing Infrastructure', `
      ${fieldRow(2, field('Supply Line Material', sel('supply_material',['PEX-A','PEX-B','Copper','CPVC'])), field('Supply Line (LF)', monoInp('supply_lf')))}
      ${fieldRow(2, field('Supply Price/LF', currInp('supply_price')), field('Drain/Waste/Vent Material', sel('drain_material',['PVC','ABS','Cast Iron'])))}
      ${fieldRow(2, field('DWV Line (LF)', monoInp('drain_lf')), field('DWV Price/LF', currInp('drain_price')))}
      ${field('Main Shutoff Valve Location (text)', inp('shutoff_loc','e.g. Utility Room East Wall'))}
      ${fieldRow(3, field('Rough-In Labor', currInp('rough_labor')), field('Fittings/Valves', currInp('fittings')), field('Pressure Test Fee', currInp('pressure_fee')))}
      <div style="margin-top:12px;display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="shower_pan_passed"> 
        <label for="shower_pan_passed" style="font-size:13px;color:var(--text-secondary)">Shower Pan Test Passed ✓</label>
      </div>
      ${liveTotal('p4-plumb-total', 'Plumbing Total')}
    `)}
    ${phaseSectionCard('p4-elec', '4C — Electrical Grid & Low-Voltage', `
      ${fieldRow(2, field('Service Panel Amperage', sel('panel_amps',['100A','200A','400A','800A'])), field('Panel Unit Cost', currInp('panel_cost')))}
      ${field('Panel Installation Labor', currInp('panel_labor'))}
      <div style="margin-top:16px;margin-bottom:8px;font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em">Wire Variants</div>
      <table class="line-table">
        <thead><tr><th>Wire Gauge (AWG)</th><th>Cable Type</th><th>Rolls/Feet</th><th>Price/Unit</th><th>Qty</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="wire-rows">${renderWireRows()}</tbody>
      </table>
      ${addRowBtn('Wire Variant', 'Phases.addWireRow()')}
      ${fieldRow(3, field('Conduit Total (LF)', monoInp('conduit_total_lf')), field('Conduit Price/LF', currInp('conduit_price')), field('CAT6 Drops Count', monoInp('cat6_drops')))}
      ${fieldRow(2, field('CAT6 Price per Drop', currInp('cat6_price')), field('Rough-In Labor', currInp('rough_labor_elec')))}
      ${field('Inspection/Permit Fee', currInp('inspection_fee_elec'))}
      ${liveTotal('p4-elec-total', 'Electrical Total')}
    `)}
    ${phaseSectionCard('p4-block', '4D — In-Wall Structural Blocking', `
      <table class="line-table">
        <thead><tr><th>Room / Location</th><th>Purpose</th><th>Lumber Size</th><th>Qty</th><th>Unit Cost</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="blocking-rows">${renderBlockingRows()}</tbody>
      </table>
      ${addRowBtn('Blocking Location', 'Phases.addBlockingRow()')}
    `)}`;
  }

  function renderWireRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p=>p.id===4);
    const rows = (ph && ph.data.wire_variants) || [{}];
    return rows.map((r,i)=>`
      <tr>
        <td class="input-td"><input type="text" value="${r.gauge||''}" placeholder="e.g. 12 AWG" oninput="Phases.updateGenRowData(4,'wire_variants',${i},'gauge',this.value)" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="text" value="${r.cable_type||''}" placeholder="e.g. NM-B" oninput="Phases.updateGenRowData(4,'wire_variants',${i},'cable_type',this.value)" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.qty||''}" placeholder="0" oninput="Phases.updateGenRowData(4,'wire_variants',${i},'qty',this.value);Financial.scheduleUpdate()" style="width:70px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.price_per_unit||''}" placeholder="0" oninput="Phases.updateGenRowData(4,'wire_variants',${i},'price_per_unit',this.value);Financial.scheduleUpdate()" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.count||''}" placeholder="1" oninput="Phases.updateGenRowData(4,'wire_variants',${i},'count',this.value);Financial.scheduleUpdate()" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="computed">${F.fmt(F.mul(r.qty||0, r.price_per_unit||0))}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(4,'wire_variants',${i},'wire-rows',Phases.renderWireRows)">🗑</button></td>
      </tr>`).join('');
  }

  function renderBlockingRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p=>p.id===4);
    const rows = (ph && ph.data.blocking_rows) || [];
    if (!rows.length) return '<tr><td colspan="7" style="color:var(--text-muted);font-size:12px;padding:12px">No blocking locations added yet.</td></tr>';
    return rows.map((r,i)=>`
      <tr>
        <td class="input-td"><input type="text" value="${r.location||''}" placeholder="Room name" oninput="Phases.updateGenRowData(4,'blocking_rows',${i},'location',this.value)" style="width:120px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(4,'blocking_rows',${i},'purpose',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"><option>Kitchen Cabinets</option><option>Floating Vanities</option><option>TV Mount</option><option>Grab Bars</option><option>Heavy Mirrors</option></select></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(4,'blocking_rows',${i},'lumber_size',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"><option>2×4</option><option>2×6</option><option>2×10</option></select></td>
        <td class="input-td"><input type="number" value="${r.qty||''}" placeholder="0" oninput="Phases.updateGenRowData(4,'blocking_rows',${i},'qty',this.value);Financial.scheduleUpdate()" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.unit_cost||''}" placeholder="0" oninput="Phases.updateGenRowData(4,'blocking_rows',${i},'unit_cost',this.value);Financial.scheduleUpdate()" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="computed">${F.fmt(F.mul(r.qty,r.unit_cost))}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(4,'blocking_rows',${i},'blocking-rows',Phases.renderBlockingRows)">🗑</button></td>
      </tr>`).join('');
  }

  function addWireRow() { addGenRow(4, 'wire_variants', 'wire-rows', renderWireRows); }
  function addBlockingRow() { addGenRow(4, 'blocking_rows', 'blocking-rows', renderBlockingRows); }
  function updateGenRowData(phaseId, key, i, k, v) { updateGenRow(phaseId, key, i, k, v); }

  // ─── PHASE 5: Insulation & Drywall ────────────────────────
  function renderPhase5(phase) {
    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p5-ins', '5A — Thermal Boundary & Insulation', `
      ${field('Insulation Type', sel('ins_type',['Fiberglass Batt','Blown-In Cellulose','Open-Cell Spray Foam','Closed-Cell Spray Foam','Mineral Wool']))}
      ${fieldRow(3, field('Wall R-Value (spec)', monoInp('wall_r')), field('Ceiling R-Value (spec)', monoInp('ceiling_r')), field('Floor R-Value (spec)', monoInp('floor_r')))}
      <hr style="border-color:var(--charcoal-border);margin:14px 0">
      ${fieldRow(2, field('Wall Insulation (sq ft)', monoInp('wall_sqft')), field('Wall Price/sqft', currInp('wall_price')))}
      ${fieldRow(2, field('Ceiling/Attic (sq ft)', monoInp('ceiling_sqft')), field('Ceiling Price/sqft', currInp('ceiling_price')))}
      ${fieldRow(2, field('Floor Insulation (sq ft)', monoInp('floor_sqft')), field('Floor Price/sqft', currInp('floor_price')))}
      ${fieldRow(2, field('Spray Foam (board-feet)', monoInp('foam_bf')), field('Spray Foam Price/BF', currInp('foam_price')))}
      ${fieldRow(2, field('Installation Labor', currInp('install_labor')), field('Blower Door Test Fee', currInp('blower_test')))}
      ${liveTotal('p5-ins-total', 'Insulation Total')}
    `)}
    ${phaseSectionCard('p5-drywall', '5B — Gypsum Board & Drywall Finish', `
      ${fieldRow(2, field('Drywall Thickness (in)', sel('drywall_thickness',['1/4','3/8','1/2','5/8 Type-X'])), field('Total Square Footage', monoInp('drywall_sqft')))}
      <div class="live-total" style="margin-bottom:12px"><span class="live-total-label">Sheets Needed (auto +10% waste)</span><span class="live-total-value" id="sheets-calc">0 sheets</span></div>
      ${fieldRow(2, field('Sheet Price', currInp('sheet_price')), field('Finish Level Target', sel('finish_level',['Level 0','Level 1','Level 2','Level 3','Level 4','Level 5'])))}
      ${fieldRow(3, field('Joint Compound Buckets', monoInp('jc_buckets')), field('JC Price/bucket', currInp('jc_price')), field('Primer Volume (gallons)', monoInp('primer_gallons')))}
      ${fieldRow(2, field('Primer Price/gallon', currInp('primer_price')), field('Hanging Labor Rate/sqft', currInp('hang_rate')))}
      ${fieldRow(2, field('Taping/Finishing Rate/sqft', currInp('tape_rate')), field('Corner Bead & Tape (lump)', currInp('corner_bead')))}
      ${liveTotal('p5-dw-total', 'Drywall Total')}
    `)}`;
  }

  // ─── PHASE 6: Finishes ──────────────────────────────────
  function renderPhase6(phase) {
    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p6-clad', '6A — Exterior Cladding', `
      ${fieldRow(2, field('Cladding Material', sel('cladding_type',['Brick Veneer','Stucco','Fiber-Cement Siding','Engineered Wood','Natural Stone','ACM Panels'])), field('Area (sq ft)', monoInp('clad_area')))}
      ${fieldRow(2, field('Price per sq ft', currInp('clad_price_sqft')), field('Mortar Type', sel('mortar_type',['Type N','Type S','Type M'])))}
      ${fieldRow(3, field('Mortar Bags', monoInp('mortar_bags')), field('Mortar Price/bag', currInp('mortar_price')), field('Weep Hole Spacing (in)', monoInp('weep_spacing')))}
      ${fieldRow(2, field('Installation Labor', currInp('clad_install_labor')), field('Scaffold Rental (days × rate)', `<div style="display:flex;gap:8px">${monoInp('scaffold_days')} ${currInp('scaffold_rate')}</div>`))}
      ${liveTotal('p6-clad-total', 'Cladding Total')}
    `)}
    ${phaseSectionCard('p6-floor', '6B — Finish Flooring', `
      <table class="line-table">
        <thead><tr><th>Room/Zone</th><th>Flooring Type</th><th>Area (sqft)</th><th>Waste%</th><th>Price/sqft</th><th>Labor/sqft</th><th>Underlayment</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="flooring-rows">${renderFlooringRows()}</tbody>
      </table>
      ${addRowBtn('Flooring Zone', 'Phases.addFlooringRow()')}
      ${liveTotal('p6-floor-total', 'Flooring Total')}
    `)}
    ${phaseSectionCard('p6-cab', '6C — Cabinetry & Millwork', `
      ${fieldRow(2, field('Cabinet Box Material', sel('cab_material',['Plywood Core','MDF','Particle Board'])), field('Door Style', sel('door_style',['Shaker','Slab','Raised Panel'])))}
      ${fieldRow(2, field('Hinge Type', sel('hinge_type',['Concealed Soft-Close','Exposed Standard'])), field('Total Linear Footage', monoInp('cab_lf')))}
      ${fieldRow(2, field('Cabinet Price/LF (or lump)', currInp('cabinet_price')), field('Knobs/Pulls Count', monoInp('knobs_count')))}
      ${fieldRow(2, field('Hardware Unit Price', currInp('knobs_price')), field('Installation Rate/LF', currInp('cab_install_rate')))}
      ${field('Custom Millwork (lump sum)', currInp('millwork_lump'))}
      ${liveTotal('p6-cab-total', 'Cabinetry Total')}
    `)}
    ${phaseSectionCard('p6-trim', '6D — Trim Carpentry & Paint', `
      ${fieldRow(2, field('Baseboard Height (in)', monoInp('base_height')), field('Baseboard Linear Footage', monoInp('base_lf')))}
      ${fieldRow(2, field('Baseboard Price/LF', currInp('base_price')), field('Crown Molding (LF)', monoInp('crown_lf')))}
      ${fieldRow(2, field('Crown Price/LF', currInp('crown_price')), field('Trim Labor Rate/LF', currInp('trim_rate')))}
      ${field('Total Trim LF', monoInp('trim_lf'))}
      ${fieldRow(2, field('Interior Paint Sheen', sel('paint_sheen',['Flat','Matte','Eggshell','Satin','Semi-Gloss','High-Gloss'])), field('Paint Brand & Color Code', inp('paint_brand','Brand + Color')))}
      ${fieldRow(3, field('Painting Area (sqft)', monoInp('paint_sqft')), field('Painting Rate/sqft', currInp('paint_rate')), field('Primer Gallons', monoInp('primer_gal_trim')))}
      ${fieldRow(2, field('Primer Price/gallon', currInp('primer_price_trim')), field('Supplies (lump sum)', currInp('supplies_lump')))}
      ${liveTotal('p6-trim-total', 'Trim & Paint Total')}
    `)}`;
  }

  function renderFlooringRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p=>p.id===6);
    const rows = (ph && ph.data.flooring_rows) || [{}];
    return rows.map((r,i)=>`
      <tr>
        <td class="input-td"><input type="text" value="${r.room||''}" placeholder="Room name" oninput="Phases.updateGenRowData(6,'flooring_rows',${i},'room',this.value)" style="width:100px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(6,'flooring_rows',${i},'type',this.value);Financial.scheduleUpdate()" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px"><option>Engineered Hardwood</option><option>Solid Hardwood</option><option>LVP</option><option>Porcelain Tile</option><option>Polished Concrete</option><option>Carpet</option></select></td>
        <td class="input-td"><input type="number" value="${r.area||''}" placeholder="0" oninput="Phases.updateGenRowData(6,'flooring_rows',${i},'area',this.value);Financial.scheduleUpdate()" style="width:70px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.waste_pct||10}" min="0" max="50" oninput="Phases.updateGenRowData(6,'flooring_rows',${i},'waste_pct',this.value);Financial.scheduleUpdate()" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.price||''}" placeholder="0" oninput="Phases.updateGenRowData(6,'flooring_rows',${i},'price',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.labor_rate||''}" placeholder="0" oninput="Phases.updateGenRowData(6,'flooring_rows',${i},'labor_rate',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.underlayment_price||''}" placeholder="0" oninput="Phases.updateGenRowData(6,'flooring_rows',${i},'underlayment_price',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="computed">${F.fmt((F.parseNum(r.area)*(1+F.parseNum(r.waste_pct||10)/100))*F.parseNum(r.price) + F.parseNum(r.area)*F.parseNum(r.labor_rate) + F.parseNum(r.area)*F.parseNum(r.underlayment_price))}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(6,'flooring_rows',${i},'flooring-rows',Phases.renderFlooringRows)">🗑</button></td>
      </tr>`).join('');
  }

  function addFlooringRow() { addGenRow(6, 'flooring_rows', 'flooring-rows', renderFlooringRows); }

  // ─── PHASE 7: Final MEP ───────────────────────────────────
  function renderPhase7(phase) {
    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p7-elec', '7A — Electrical Trim', `
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Receptacles</div>
      <table class="line-table">
        <thead><tr><th>Receptacle Type</th><th>Count</th><th>Unit Price</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="recep-rows">${renderSimpleRows(7,'receptacle_rows','recep-rows',['Standard 15A','Tamper-Resistant','GFCI','AFCI','USB-Integrated'],'Receptacle Type')}</tbody>
      </table>
      ${addRowBtn('Receptacle Type', "Phases.addSimpleRow(7,'receptacle_rows','recep-rows',Phases.renderReceptacleRows)")}
      <div style="font-size:12px;color:var(--text-muted);margin:14px 0 8px">Switches</div>
      <table class="line-table">
        <thead><tr><th>Switch Type</th><th>Count</th><th>Unit Price</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="switch-rows">${renderSimpleRows(7,'switch_rows','switch-rows',['Single-Pole','3-Way','Dimmer','Smart Switch'],'Switch Type')}</tbody>
      </table>
      ${addRowBtn('Switch Type', "Phases.addSimpleRow(7,'switch_rows','switch-rows',Phases.renderSwitchRows)")}
      <div style="font-size:12px;color:var(--text-muted);margin:14px 0 8px">Light Fixtures</div>
      <table class="line-table">
        <thead><tr><th>Fixture Type</th><th>Count</th><th>Unit Price</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="fixture-rows">${renderSimpleRows(7,'fixture_rows','fixture-rows',['Recessed LED','Pendant','Chandelier','Under-Cabinet','Exterior'],'Fixture Type')}</tbody>
      </table>
      ${addRowBtn('Fixture Type', "Phases.addSimpleRow(7,'fixture_rows','fixture-rows',Phases.renderFixtureRows)")}
      ${fieldRow(2, field('Breakers Allocated (spec)', monoInp('breaker_count')), field('Electrician Trim Labor', currInp('trim_labor_elec')))}
      ${liveTotal('p7-elec-total', 'Electrical Trim Total')}
    `)}
    ${phaseSectionCard('p7-plumb', '7B — Plumbing Fixtures', `
      ${fieldRow(2, field('Faucet Flow Rate (GPM)', monoInp('faucet_gpm')), field('Toilet Flush Rate (GPF)', monoInp('toilet_gpf')))}
      <div style="font-size:12px;color:var(--text-muted);margin:14px 0 8px">Faucets</div>
      <table class="line-table">
        <thead><tr><th>Type</th><th>Count</th><th>Unit Price</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="faucet-rows">${renderSimpleRows(7,'faucet_rows','faucet-rows',['Kitchen Faucet','Bathroom Faucet','Bar Faucet','Shower Valve'],'Faucet Type')}</tbody>
      </table>
      ${addRowBtn('Faucet', "Phases.addSimpleRow(7,'faucet_rows','faucet-rows',Phases.renderFaucetRows)")}
      ${fieldRow(3, field('Toilet Count', monoInp('toilet_count')), field('Toilet Unit Price', currInp('toilet_price')), field('Shower Fixtures Count', monoInp('shower_count')))}
      ${fieldRow(2, field('Shower Unit Price', currInp('shower_price')), field('Water Heater Type', sel('wh_type',['Tankless Gas','Standard Electric Tank','Heat Pump Hybrid'])))}
      ${fieldRow(2, field('Water Heater Cost', currInp('water_heater')), field('WH Installation Labor', currInp('wh_install')))}
      <div style="margin:12px 0;display:flex;align-items:center;gap:10px"><input type="checkbox" id="appliance_circuit"> <label for="appliance_circuit" style="font-size:13px;color:var(--text-secondary)">Appliance Circuit Verified ✓</label></div>
      ${fieldRow(2, field('Plumber Trim Labor', currInp('plumb_trim_labor')), field('Drain Covers & Escutcheons', currInp('drain_covers')))}
      ${liveTotal('p7-plumb-total', 'Plumbing Fixtures Total')}
    `)}
    ${phaseSectionCard('p7-counter', '7C — Countertops', `
      <table class="line-table">
        <thead><tr><th>Zone/Room</th><th>Material</th><th>Thickness</th><th>Edge Profile</th><th>Area (sqft)</th><th>Price/sqft</th><th>Cutouts</th><th>Labor</th><th class="right">Total</th><th></th></tr></thead>
        <tbody id="counter-rows">${renderCounterRows()}</tbody>
      </table>
      ${addRowBtn('Countertop Zone', 'Phases.addCounterRow()')}
      ${liveTotal('p7-counter-total', 'Countertops Total')}
    `)}`;
  }

  function renderSimpleRows(phaseId, key, tbodyId, typeOptions, typeLabel) {
    const proj = State.getCurrentProject();
    if (!proj) return '<tr><td colspan="5" style="color:var(--text-muted);font-size:12px;padding:10px">None added yet.</td></tr>';
    const ph = proj.phases.find(p=>p.id===phaseId);
    const rows = (ph && ph.data[key]) || [];
    if (!rows.length) return '<tr><td colspan="5" style="color:var(--text-muted);font-size:12px;padding:10px">None added yet.</td></tr>';
    const opts = typeOptions.map(o=>`<option>${o}</option>`).join('');
    return rows.map((r,i)=>`
      <tr>
        <td class="input-td"><select onchange="Phases.updateGenRowData(${phaseId},'${key}',${i},'type',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px;min-width:130px">${opts}</select></td>
        <td class="input-td"><input type="number" value="${r.count||''}" placeholder="0" oninput="Phases.updateGenRowData(${phaseId},'${key}',${i},'count',this.value);Financial.scheduleUpdate()" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="input-td"><input type="number" value="${r.unit_price||''}" placeholder="0" oninput="Phases.updateGenRowData(${phaseId},'${key}',${i},'unit_price',this.value);Financial.scheduleUpdate()" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:13px"></td>
        <td class="computed">${F.fmt(F.mul(r.count,r.unit_price))}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(${phaseId},'${key}',${i},'${tbodyId}',()=>Phases.renderSimpleRows(${phaseId},'${key}','${tbodyId}',[${typeOptions.map(o=>`'${o}'`).join(',')}],'${typeLabel}'))">🗑</button></td>
      </tr>`).join('');
  }

  function addSimpleRow(phaseId, key, tbodyId, renderFn) {
    addGenRow(phaseId, key, tbodyId, () => renderFn ? renderFn() : '');
  }

  function renderReceptacleRows() { return renderSimpleRows(7,'receptacle_rows','recep-rows',['Standard 15A','Tamper-Resistant','GFCI','AFCI','USB-Integrated'],'Type'); }
  function renderSwitchRows() { return renderSimpleRows(7,'switch_rows','switch-rows',['Single-Pole','3-Way','Dimmer','Smart Switch'],'Type'); }
  function renderFixtureRows() { return renderSimpleRows(7,'fixture_rows','fixture-rows',['Recessed LED','Pendant','Chandelier','Under-Cabinet','Exterior'],'Type'); }
  function renderFaucetRows() { return renderSimpleRows(7,'faucet_rows','faucet-rows',['Kitchen Faucet','Bathroom Faucet','Bar Faucet','Shower Valve'],'Type'); }

  function renderCounterRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p=>p.id===7);
    const rows = (ph && ph.data.countertop_rows) || [];
    if (!rows.length) return '<tr><td colspan="10" style="color:var(--text-muted);font-size:12px;padding:10px">No countertop zones added.</td></tr>';
    return rows.map((r,i)=>`
      <tr>
        <td class="input-td"><input type="text" value="${r.zone||''}" placeholder="Kitchen" oninput="Phases.updateGenRowData(7,'countertop_rows',${i},'zone',this.value)" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(7,'countertop_rows',${i},'material',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px"><option>Quartz</option><option>Granite</option><option>Marble</option><option>Quartzite</option><option>Solid Surface</option><option>Butcher Block</option></select></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(7,'countertop_rows',${i},'thickness',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px"><option>20mm</option><option>30mm</option></select></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(7,'countertop_rows',${i},'edge',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px"><option>Eased</option><option>Bullnose</option><option>Ogee</option><option>Mitered Apron</option></select></td>
        <td class="input-td"><input type="number" value="${r.area||''}" placeholder="0" oninput="Phases.updateGenRowData(7,'countertop_rows',${i},'area',this.value);Financial.scheduleUpdate()" style="width:65px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.price||''}" placeholder="0" oninput="Phases.updateGenRowData(7,'countertop_rows',${i},'price',this.value);Financial.scheduleUpdate()" style="width:65px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.cutouts||0}" min="0" oninput="Phases.updateGenRowData(7,'countertop_rows',${i},'cutouts',this.value);Financial.scheduleUpdate()" style="width:50px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor||''}" placeholder="0" oninput="Phases.updateGenRowData(7,'countertop_rows',${i},'labor',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(F.mul(r.area,r.price) + F.mul(r.cutouts,500) + F.parseNum(r.labor))}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(7,'countertop_rows',${i},'counter-rows',Phases.renderCounterRows)">🗑</button></td>
      </tr>`).join('');
  }

  function addCounterRow() { addGenRow(7, 'countertop_rows', 'counter-rows', renderCounterRows); }

  // ─── PHASE 8: Punch List ──────────────────────────────────
  function renderPhase8(phase) {
    const proj = State.getCurrentProject();
    const punchItems = proj ? (proj.punchItems || []) : [];
    const open = punchItems.filter(p=>p.status==='open');
    const inprog = punchItems.filter(p=>p.status==='in-progress');
    const done = punchItems.filter(p=>p.status==='resolved');

    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard('p8-punch', '8A — Geo-Located Punch Item Matrix', `
      <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:12px">
          <span style="font-size:12px;color:var(--text-muted)">🟡 Cosmetic &nbsp; 🟠 Functional &nbsp; 🔴 Structural</span>
        </div>
        <button class="btn-primary btn-sm" onclick="Phases.showAddPunchModal()">+ Add Item</button>
      </div>
      <div class="kanban-board">
        <div class="kanban-col">
          <div class="kanban-col-title">Open <span class="kanban-col-count">${open.length}</span></div>
          ${open.map(p=>punchCard(p)).join('') || '<div style="color:var(--text-muted);font-size:12px">No open items 🎉</div>'}
        </div>
        <div class="kanban-col">
          <div class="kanban-col-title">In Progress <span class="kanban-col-count">${inprog.length}</span></div>
          ${inprog.map(p=>punchCard(p)).join('') || '<div style="color:var(--text-muted);font-size:12px">None in progress</div>'}
        </div>
        <div class="kanban-col">
          <div class="kanban-col-title">Resolved <span class="kanban-col-count">${done.length}</span></div>
          ${done.map(p=>punchCard(p)).join('') || '<div style="color:var(--text-muted);font-size:12px">None resolved yet</div>'}
        </div>
      </div>
    `)}
    ${phaseSectionCard('p8-hand', '8B — Handover & Closeout Costs', `
      ${fieldRow(2, field('Final Cleaning', currInp('cleaning')), field('Certificate of Occupancy Fees', currInp('co_fees')))}
      ${fieldRow(2, field('Landscaping / Grading', currInp('landscaping')), field('Touch-up & Punch Repairs', currInp('touchup')))}
      ${liveTotal('p8-hand-total', 'Handover Costs Total')}
    `)}
    ${phaseSectionCard('p8-docs', '8C — Document Vault', `
      <div class="doc-vault" id="doc-vault">
        ${renderDocSlots()}
      </div>
    `)}`;
  }

  function punchCard(p) {
    const sevClass = { 'Cosmetic':'severity-cosmetic','Functional':'severity-functional','Structural Failure':'severity-structural' };
    return `
    <div class="kanban-card ${sevClass[p.severity]||''}" onclick="Phases.cyclePunchStatus('${p.id}')">
      <div class="defect-id">${p.id}</div>
      <div class="defect-desc">${p.description || 'No description'}</div>
      <div class="defect-room">${p.room || '—'} · ${p.severity || 'Cosmetic'}</div>
      ${p.repair_cost ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--steel);margin-top:4px">${F.fmt(p.repair_cost)}</div>` : ''}
    </div>`;
  }

  function showAddPunchModal() {
    const modal = document.createElement('div');
    modal.className = 'project-wizard';
    modal.id = 'punch-modal';
    modal.innerHTML = `
    <div class="wizard-container" style="width:400px">
      <div class="wizard-header"><h2>Add Punch Item</h2></div>
      <div style="padding:24px">
        <div class="field-group"><label class="field-label">Description</label><input class="field-input" id="pm-desc" placeholder="Describe the defect..."></div>
        <div class="field-row cols-2">
          <div class="field-group"><label class="field-label">Room / Location</label><input class="field-input" id="pm-room" placeholder="e.g. Master Bath"></div>
          <div class="field-group"><label class="field-label">Severity</label><select class="field-select" id="pm-sev"><option>Cosmetic</option><option>Functional</option><option>Structural Failure</option></select></div>
        </div>
        <div class="field-group"><label class="field-label">Repair Cost Estimate</label><div class="currency-input-wrap"><span class="currency-symbol">₹</span><input class="field-input mono" type="number" id="pm-cost" placeholder="0"></div></div>
      </div>
      <div class="wizard-nav">
        <button class="btn-ghost" onclick="document.getElementById('punch-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="Phases.savePunchItem()">Save Item</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  function savePunchItem() {
    const desc = document.getElementById('pm-desc')?.value;
    const room = document.getElementById('pm-room')?.value;
    const sev = document.getElementById('pm-sev')?.value;
    const cost = document.getElementById('pm-cost')?.value;
    State.addPunchItem({ description: desc, room, severity: sev, repair_cost: cost });
    document.getElementById('punch-modal')?.remove();
    App.showPhase(8);
    Financial.scheduleUpdate();
  }

  function cyclePunchStatus(id) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const item = proj.punchItems.find(p=>p.id===id);
    if (!item) return;
    const cycle = ['open','in-progress','resolved'];
    const idx = cycle.indexOf(item.status);
    item.status = cycle[(idx+1) % cycle.length];
    State.save();
    App.showPhase(8);
  }

  function renderDocSlots() {
    const docTypes = ['Plans & Blueprints','Structural Engineer Report','Soil Report','Permit Set','Inspection Reports','Subcontractor Contracts','Warranty Documents','Certificate of Occupancy'];
    return docTypes.map(d=>`
      <div class="doc-slot" title="${d}">
        <div class="doc-slot-icon">📄</div>
        <div class="doc-slot-label">${d}</div>
      </div>`).join('');
  }

  // ─── SUBCONTRACTOR LEDGER ─────────────────────────────────
  function renderSubcontractorLedger() {
    const proj = State.getCurrentProject();
    const subs = proj ? (proj.subcontractors || []) : [];
    
    const totalContract = subs.reduce((s, sub) => s + F.parseNum(sub.contract), 0);
    const totalPaid = subs.reduce((s, sub) => s + F.parseNum(sub.paid), 0);
    const totalOwed = totalContract - totalPaid;
    
    return `
    <!-- Summary Stats -->
    ${subs.length > 0 ? `
    <div class="dashboard-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-card-label">Total Contracted</div>
        <div class="stat-card-value">${F.fmtFull(totalContract)}</div>
        <div class="stat-card-sub">${subs.length} active trade${subs.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Total Paid</div>
        <div class="stat-card-value" style="color:var(--success)">${F.fmtFull(totalPaid)}</div>
        <div class="stat-card-sub">${totalContract > 0 ? Math.round((totalPaid/totalContract)*100) : 0}% of contracts paid</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Outstanding Balance</div>
        <div class="stat-card-value" style="color:${totalOwed > 0 ? '#D97706' : 'var(--success)'}">${F.fmtFull(totalOwed)}</div>
        <div class="stat-card-sub">${totalOwed > 0 ? 'Payments pending' : 'All settled ✓'}</div>
      </div>
    </div>` : ''}

    <div class="section-card">
      <div class="section-card-header" style="cursor:default">
        <span class="section-card-title">Subcontractor / Trade Ledger</span>
        <div class="section-card-meta">
          <span class="section-card-total" id="sub-total">${subs.length > 0 ? F.fmtFull(totalContract) : '—'}</span>
          <button class="btn-primary btn-sm" onclick="Phases.showAddSubModal()" style="margin-left:12px">+ Add Trade</button>
        </div>
      </div>
      <div class="section-card-body" style="padding:0">
        ${subs.length === 0 ? `
          <div style="padding:40px;text-align:center">
            <div style="font-size:36px;margin-bottom:12px;opacity:0.5">👷</div>
            <div style="font-size:14px;color:var(--text-muted);margin-bottom:6px">No subcontractors added yet</div>
            <div style="font-size:12px;color:var(--text-muted)">Add trades to track contracts, payments, and balances</div>
          </div>
        ` : `
        <table class="ledger-table">
          <thead><tr>
            <th>Trade / Company</th><th>Phase</th><th>Contract</th>
            <th>Paid</th><th>Balance</th><th>Retention</th><th>Status</th><th></th>
          </tr></thead>
          <tbody id="sub-ledger-rows">
            ${subs.map(s => {
              const contract = F.parseNum(s.contract);
              const paid = F.parseNum(s.paid);
              const retention = F.parseNum(s.retention_pct || 0);
              const retentionAmt = contract * (retention / 100);
              const remaining = contract - paid;
              const paidPct = contract > 0 ? Math.round((paid / contract) * 100) : 0;
              
              return `
            <tr>
              <td>
                <div style="font-weight:600;font-size:13px">${s.name || '—'}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${s.trade || ''}</div>
                ${s.phone || s.email ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${s.phone ? '📞 ' + s.phone : ''} ${s.email ? '✉ ' + s.email : ''}</div>` : ''}
              </td>
              <td style="font-size:12px">${s.phase || '—'}</td>
              <td class="mono" style="font-weight:600">${F.fmt(contract)}</td>
              <td>
                <div class="mono" style="color:var(--success);font-weight:600">${F.fmt(paid)}</div>
                <div style="height:3px;background:var(--charcoal-border);border-radius:2px;margin-top:4px;width:60px">
                  <div style="height:100%;background:var(--success);border-radius:2px;width:${paidPct}%;transition:width 0.4s"></div>
                </div>
              </td>
              <td class="mono" style="color:${remaining > 0 ? '#D97706' : 'var(--success)'}; font-weight:600">${F.fmt(remaining)}</td>
              <td style="font-size:11px">${retention > 0 ? `<span style="color:var(--text-muted)">${retention}%</span><br><span class="mono" style="font-size:10px;color:var(--steel-light)">${F.fmt(retentionAmt)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
              <td><span class="pay-status-badge ${paid >= contract && contract > 0 ? 'pay-paid' : paid > 0 ? 'pay-partial' : 'pay-pending'}">${paid >= contract && contract > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'}</span></td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn-icon-sm" onclick="Phases.showEditSubModal('${s.id}')" title="Edit">✏️</button>
                  <button class="delete-row-btn" onclick="Phases.deleteSub('${s.id}')" title="Delete">🗑</button>
                </div>
              </td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>

    ${subs.length > 0 && subs.some(s => s.notes) ? `
    <div class="section-card" style="margin-top:16px">
      <div class="section-card-header" onclick="Phases.toggleSection('sc-sub-notes')">
        <span class="section-card-title">Trade Notes</span>
        <span class="section-toggle-icon">▼</span>
      </div>
      <div class="section-card-body" id="sc-sub-notes">
        ${subs.filter(s => s.notes).map(s => `
          <div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--charcoal-border)">
            <strong style="min-width:120px;font-size:12px;color:var(--amber)">${s.name}</strong>
            <span style="font-size:12px;color:var(--text-secondary)">${s.notes}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}`;
  }

  function showAddSubModal(editId) {
    const proj = State.getCurrentProject();
    const existing = editId && proj ? proj.subcontractors.find(s => s.id === editId) : null;
    const isEdit = !!existing;
    
    const modal = document.createElement('div');
    modal.className = 'project-wizard';
    modal.id = 'sub-modal';
    modal.innerHTML = `
    <div class="wizard-container" style="width:520px">
      <div class="wizard-header"><h2>${isEdit ? 'Edit' : 'Add'} Subcontractor / Trade</h2></div>
      <div style="padding:24px">
        <div class="field-row cols-2">
          <div class="field-group"><label class="field-label">Company / Name *</label><input class="field-input" id="sm-name" placeholder="ABC Electrical LLC" value="${existing?.name || ''}"></div>
          <div class="field-group"><label class="field-label">Trade</label><input class="field-input" id="sm-trade" placeholder="Electrical" value="${existing?.trade || ''}"></div>
        </div>
        <div class="field-row cols-2">
          <div class="field-group"><label class="field-label">Phone</label><input class="field-input" id="sm-phone" placeholder="+91 9876543210" value="${existing?.phone || ''}"></div>
          <div class="field-group"><label class="field-label">Email</label><input class="field-input" id="sm-email" placeholder="abc@email.com" value="${existing?.email || ''}"></div>
        </div>
        <div class="field-row cols-2">
          <div class="field-group"><label class="field-label">Phase</label><select class="field-select" id="sm-phase">
            ${['Phase 1 - Pre-Construction','Phase 2 - Site & Foundation','Phase 3 - Framing','Phase 4 - MEP Rough-In','Phase 5 - Insulation & Drywall','Phase 6 - Finishes','Phase 7 - Final MEP','Phase 8 - Punch List'].map(p => `<option ${existing?.phase === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select></div>
          <div class="field-group"><label class="field-label">Contract Amount</label><div class="currency-input-wrap"><span class="currency-symbol">₹</span><input class="field-input mono" type="number" id="sm-contract" placeholder="0" value="${existing?.contract || ''}"></div></div>
        </div>
        <div class="field-row cols-2">
          <div class="field-group"><label class="field-label">Amount Paid To Date</label><div class="currency-input-wrap"><span class="currency-symbol">₹</span><input class="field-input mono" type="number" id="sm-paid" placeholder="0" value="${existing?.paid || ''}"></div></div>
          <div class="field-group"><label class="field-label">Retention %</label><input class="field-input mono" type="number" id="sm-retention" placeholder="0" min="0" max="100" value="${existing?.retention_pct || ''}"><div style="font-size:9px;color:var(--text-muted);margin-top:4px">Held back until completion</div></div>
        </div>
        <div class="field-group"><label class="field-label">Notes</label><input class="field-input" id="sm-notes" placeholder="Payment terms, contact details, scope notes…" value="${existing?.notes || ''}"></div>
      </div>
      <div class="wizard-nav">
        <button class="btn-ghost" onclick="document.getElementById('sub-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="Phases.saveSub('${editId || ''}')">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  function showEditSubModal(id) {
    showAddSubModal(id);
  }

  function saveSub(editId) {
    const sub = {
      name: document.getElementById('sm-name')?.value,
      trade: document.getElementById('sm-trade')?.value,
      phone: document.getElementById('sm-phone')?.value,
      email: document.getElementById('sm-email')?.value,
      phase: document.getElementById('sm-phase')?.value,
      contract: document.getElementById('sm-contract')?.value,
      paid: document.getElementById('sm-paid')?.value,
      retention_pct: document.getElementById('sm-retention')?.value,
      notes: document.getElementById('sm-notes')?.value,
    };
    
    if (!sub.name?.trim()) {
      App.toast('Please enter a company name', 'warning');
      return;
    }
    
    if (editId) {
      State.updateSubcontractor(editId, sub);
    } else {
      State.addSubcontractor(sub);
    }
    document.getElementById('sub-modal')?.remove();
    App.showSubLedger();
  }

  function deleteSub(id) {
    State.deleteSubcontractor(id);
    App.showSubLedger();
  }

  return {
    toggleSection, setCompletion,
    addPermitRow, deletePermitRow, updatePermit,
    renderPhase1, renderPhase2, renderPhase3, renderPhase4,
    renderPhase5, renderPhase6, renderPhase7, renderPhase8,
    renderSubcontractorLedger,
    toggleCard,
    addWindowRow, deleteWindowRow, updateWindowRow,
    renderWindowRows,
    addWireRow, addBlockingRow,
    renderWireRows, renderBlockingRows,
    updateGenRowData, delGenRow, addGenRow,
    addFlooringRow, renderFlooringRows,
    addSimpleRow, renderSimpleRows,
    renderReceptacleRows, renderSwitchRows, renderFixtureRows, renderFaucetRows,
    addCounterRow, renderCounterRows,
    showAddPunchModal, savePunchItem, cyclePunchStatus,
    showAddSubModal, showEditSubModal, saveSub, deleteSub,
  };
})();
