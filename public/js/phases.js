/* ═══════════════════════════════════════════
   PHASES.JS — All 8 Construction Phase UIs
   ═══════════════════════════════════════════ */

const Phases = (() => {
  const F = Financial;

  // Helper: render an icon-name (from CATEGORY_REGISTRY) to an inline SVG.
  // Falls back to a small square if the name is unknown.
  function iconFor(name, size = 18) {
    if (!name) return '';
    if (typeof Icons !== 'undefined' && Icons.ICONS[name]) {
      return Icons.render(name, size);
    }
    // Legacy support: if a raw emoji sneaks through, render it as a span
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(name)) {
      return `<span style="font-size:${size}px;line-height:1">${name}</span>`;
    }
    return '';
  }

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
    return `<div class="live-total"><span class="live-total-label">${label}</span>
      <div class="currency-input-wrap" style="width:140px;margin-left:auto">
        <span class="currency-symbol">₹</span>
        <input class="field-input mono" type="number" id="${id}" placeholder="0" style="font-size:18px;font-weight:700;color:var(--amber)" oninput="Phases.updatePhase10ManualTotal('${id}', this.value);Financial.scheduleUpdate()">
      </div>
    </div>`;
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
    const budget = proj && proj.phases.length ? proj.totalBudget / proj.phases.length : 0;
    return `
    <div class="phase-header">
      <div class="phase-title-block">
        <div class="phase-title">${iconFor(phase.icon, 26)} <span style="margin-left:10px">${phase.name}</span></div>
        <div class="phase-subtitle">Phase ${phase.id} of ${phase.totalPhases || (State.getCurrentProject()?.phases.length || 9)} · Construction Financial Ledger</div>
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

  // ════════════════════════════════════════════════════════════
  // CATEGORY REGISTRY — Per-phase category breakdown
  // Each phase is split into 4-6 named categories the user
  // opens one at a time. Categories group related sections
  // from the underlying phase data. The `sections` array
  // tells the UI which data keys to count for progress + cost.
  // ════════════════════════════════════════════════════════════
  // CATEGORY REGISTRY — Per-phase categories.
  // For trade phases 1-9, each input card is a category. The
  // sectionId is the input card's `id`. For Interior (#10) we
  // keep the original 13 categories.
  const CATEGORY_REGISTRY = {
    1: [
      { id: 'iron',            sectionIds: ['p1-iron'],            meta: { name: 'Iron (TMT Bars)',          icon: 'bricks',      desc: 'TMT bars for columns, beams, slabs.' } },
      { id: 'sand',            sectionIds: ['p1-sand'],            meta: { name: 'Sand',                   icon: 'pipe',        desc: 'Fine aggregate for plaster and concrete.' } },
      { id: 'cement',          sectionIds: ['p1-cement'],          meta: { name: 'Cement',                 icon: 'blocks',      desc: 'OPC / PPC bags for concrete and plaster.' } },
      { id: 'stone',           sectionIds: ['p1-stone'],           meta: { name: 'Stone / Gravel (Khadhi)', icon: 'foundation', desc: 'Coarse aggregate for concrete.' } },
      { id: 'binding_wire',    sectionIds: ['p1-binding_wire'],    meta: { name: 'Binding Wire',           icon: 'wrenchScrew',desc: 'Black annealed wire for tying rebar.' } },
      { id: 'adhesive',        sectionIds: ['p1-adhesive'],        meta: { name: 'Adhesive Chemical',      icon: 'insulation',  desc: 'Bonding agents, water-proofing, curing.' } },
      { id: 'other_material',  sectionIds: ['p1-other_material'],  meta: { name: 'Other Civil Materials',  icon: 'listChecks',  desc: 'Brick, block, AAC, water-stops, etc.' } },
      { id: 'thekedar',        sectionIds: ['p1-thekedar'],        meta: { name: 'Civil Labor Costing', icon: 'userCircle',  desc: 'Daily wages and milestone payouts to labor contractors.' } },
    ],
    2: [
      { id: 'floor_tiles',      sectionIds: ['p2-floor_tiles'],      meta: { name: 'Floor Tiles',                  icon: 'ruler',       desc: 'Floor tiles for all rooms.' } },
      { id: 'kitchen_dado',     sectionIds: ['p2-kitchen_dado'],     meta: { name: 'Kitchen Dado Tiles',           icon: 'wrench',      desc: 'Backsplash tiles above kitchen counter.' } },
      { id: 'staircase_tiles',  sectionIds: ['p2-staircase_tiles'],  meta: { name: 'Staircase Tiles',              icon: 'stairs',      desc: 'Tiles for treads + risers.' } },
      { id: 'tile_chemical',    sectionIds: ['p2-tile_chemical'],    meta: { name: 'Tile Chemical / Adhesive',    icon: 'droplet',     desc: 'Adhesive, grout, spacers, waterproofing.' } },
      { id: 'tile_sand_cement', sectionIds: ['p2-tile_sand_cement'], meta: { name: 'Sand & Cement for Bedding',    icon: 'blocks',      desc: 'Bedding sand + cement under tiles.' } },
      { id: 'tile_labor',       sectionIds: ['p2-tile_labor'],       meta: { name: 'Tiling Labor Payouts',        icon: 'userCircle',  desc: 'Payouts to the tiling contractor (per sqft).' } },
    ],
    3: [
      { id: 'putty',         sectionIds: ['p3-putty'],         meta: { name: 'Wall Putty',            icon: 'paintRoller', desc: 'Acrylic / powder wall putty.' } },
      { id: 'primer_ext',    sectionIds: ['p3-primer_ext'],    meta: { name: 'Exterior Primer',       icon: 'palette',     desc: 'Exterior wall primer.' } },
      { id: 'primer_int',    sectionIds: ['p3-primer_int'],    meta: { name: 'Interior Primer',       icon: 'palette',     desc: 'Interior wall primer.' } },
      { id: 'paint_ext',     sectionIds: ['p3-paint_ext'],     meta: { name: 'Exterior Paint',        icon: 'palette',     desc: 'Exterior weather-proof paint.' } },
      { id: 'paint_int',     sectionIds: ['p3-paint_int'],     meta: { name: 'Interior Paint',        icon: 'palette',     desc: 'Interior emulsion / distemper.' } },
      { id: 'oil_paint',     sectionIds: ['p3-oil_paint'],     meta: { name: 'Oil Paint / Enamel',    icon: 'paintbrush',  desc: 'Oil-based enamel for doors, windows, grills.' } },
      { id: 'painter_labor', sectionIds: ['p3-painter_labor'], meta: { name: 'Painter Payouts',       icon: 'userCircle',  desc: 'Painter payouts (per coat or per room).' } },
    ],
    4: [
      { id: 'switches',          sectionIds: ['p4-switches'],          meta: { name: 'Switches & Boards',      icon: 'zap',         desc: 'Modular switches, sockets, plates.' } },
      { id: 'wires',             sectionIds: ['p4-wires'],             meta: { name: 'Wires',                  icon: 'zap',         desc: 'Copper / aluminium wires by gauge.' } },
      { id: 'conduits',          sectionIds: ['p4-conduits'],          meta: { name: 'Fitting Pipes (Conduits)', icon: 'pipe',      desc: 'PVC / flexible conduits.' } },
      { id: 'lights',            sectionIds: ['p4-lights'],            meta: { name: 'Lights & Fixtures',     icon: 'lightbulb',  desc: 'Bulbs, LED panels, downlights.' } },
      { id: 'metering',          sectionIds: ['p4-metering'],          meta: { name: 'Metering Material',     icon: 'listChecks',  desc: 'Meter, DB, MCBs, RCCB, isolators.' } },
      { id: 'electrician_labor', sectionIds: ['p4-electrician_labor'], meta: { name: 'Electrician Payouts',    icon: 'userCircle',  desc: 'Per-point or per-flat contract.' } },
    ],
    5: [
      { id: 'door_frames', sectionIds: ['p5-door_frames'], meta: { name: 'Door Frames',         icon: 'door',         desc: 'Wooden / metal door frames.' } },
      { id: 'flush_doors', sectionIds: ['p5-flush_doors'], meta: { name: 'Flush Doors',         icon: 'door',         desc: 'Flush door shutters (ply / block board).' } },
      { id: 'windows',      sectionIds: ['p5-windows'],      meta: { name: 'Windows',            icon: 'window',      desc: 'Aluminium / UPVC / wooden windows.' } },
      { id: 'glass_railing',sectionIds: ['p5-glass_railing'],meta: { name: 'Glass Railing',      icon: 'mirror',      desc: 'Toughened glass + SS / aluminium handrail.' } },
      { id: 'hardware',     sectionIds: ['p5-hardware'],     meta: { name: 'Fitting Materials (Hardware)', icon: 'wrenchScrew', desc: 'Hinges, handles, locks, tower bolts.' } },
      { id: 'fab_labor',   sectionIds: ['p5-fab_labor'],    meta: { name: 'Carpenter & Fabricator Labor', icon: 'userCircle', desc: 'Payouts for fixing and fitting.' } },
    ],
    6: [
      { id: 'ext_pipes',     sectionIds: ['p6-ext_pipes'],     meta: { name: 'Exterior Pipes',         icon: 'pipe',         desc: 'PVC / CPVC / GI pipes for drainage + supply.' } },
      { id: 'ext_fittings', sectionIds: ['p6-ext_fittings'], meta: { name: 'Exterior Fitting Material', icon: 'wrenchScrew', desc: 'Elbows, tees, valves, gully traps.' } },
      { id: 'drainage_lines',sectionIds: ['p6-drainage_lines'],meta: { name: 'Drainage Lines',         icon: 'wrench',       desc: 'Soak pits, manholes, storm water drainage.' } },
      { id: 'int_pipes',     sectionIds: ['p6-int_pipes'],     meta: { name: 'Internal Pipes',         icon: 'pipe',         desc: 'CPVC / PPR / GI internal piping.' } },
      { id: 'int_fittings', sectionIds: ['p6-int_fittings'], meta: { name: 'Internal Fitting Material', icon: 'wrenchScrew', desc: 'Elbows, tees, valves, connectors.' } },
      { id: 'taps',         sectionIds: ['p6-taps'],         meta: { name: 'Taps & Faucets',        icon: 'droplet',      desc: 'Pillar cock, bib cock, sink tap, shower.' } },
      { id: 'bath_fittings',sectionIds: ['p6-bath_fittings'],meta: { name: 'Bath Fittings & Accessories', icon: 'listChecks', desc: 'Towel rods, soap holders, hooks.' } },
      { id: 'plumber_labor',sectionIds: ['p6-plumber_labor'],meta: { name: 'Plumber Payouts',        icon: 'userCircle',  desc: 'Per-point or per-flat payouts.' } },
    ],
    7: [
      { id: 'pop_bags',   sectionIds: ['p7-pop_bags'],   meta: { name: 'POP Bags',                icon: 'insulation',  desc: 'Plaster of Paris bags (typically 25 kg).' } },
      { id: 'framing',    sectionIds: ['p7-framing'],    meta: { name: 'Framing Channels',        icon: 'wrenchScrew', desc: 'Gypsum / metal channel framing for ceiling.' } },
      { id: 'pop_other',  sectionIds: ['p7-pop_other'],  meta: { name: 'Other POP Consumables',   icon: 'listChecks',  desc: 'Corner beads, mesh, screws, primer.' } },
      { id: 'pop_labor',  sectionIds: ['p7-pop_labor'],  meta: { name: 'POP Contractor Payouts',  icon: 'userCircle',  desc: 'Per-sqft of ceiling or per-room.' } },
    ],
    8: [
      { id: 'lift_unit',     sectionIds: ['p8-lift_unit'],     meta: { name: 'Lift Unit (Car + Motor)', icon: 'stairs',      desc: 'Passenger / goods lift unit.' } },
      { id: 'shaft',         sectionIds: ['p8-shaft'],         meta: { name: 'Shaft & Structural Supports', icon: 'foundation', desc: 'Shaft construction, steel, supports.' } },
      { id: 'doors_panels',  sectionIds: ['p8-doors_panels'],  meta: { name: 'Doors & Panels',         icon: 'door',         desc: 'Automatic / manual door panels per floor.' } },
      { id: 'lift_install',  sectionIds: ['p8-lift_install'],  meta: { name: 'Installation Crew',      icon: 'wrench',      desc: 'Installation, electrical hookup, certification.' } },
    ],
    9: [
      { id: 'misc_expenses', sectionIds: ['p9-misc_expenses'], meta: { name: 'Site Expenses (Miscellaneous)', icon: 'listChecks', desc: 'Water tankers, security, curing, municipal fees.' } },
    ],
    10: [
      { id: 'floor-prep',   sectionIds: ['p10-flooring-prep'],   sections: ['floor_prep_rows'],   meta: { name: 'Subfloor Preparation',     icon: 'wrench',      desc: 'Moisture readings, self-leveling, plywood overlay, vapor barrier.' } },
      { id: 'floor-finish', sectionIds: ['p10-flooring-finish'], sections: ['flooring_int_rows'], meta: { name: 'Finish Flooring',          icon: 'ruler',       desc: 'Per-zone material, plank width, wear, transitions, grout color.' } },
      { id: 'cab-box',      sectionIds: ['p10-cab-box'],         sections: ['_int_cab_box'],      meta: { name: 'Cabinetry — Boxes & Doors', icon: 'sofa',       desc: 'Class, core, door profile, LF by tier, install, millwork.' } },
      { id: 'cab-hw',       sectionIds: ['p10-cab-hw'],          sections: ['_int_cab_hw'],       meta: { name: 'Cabinetry — Hardware',     icon: 'wrenchScrew', desc: 'Glides, hinges, pulls, drawer boxes, soft-close adapters.' } },
      { id: 'door-slab',    sectionIds: ['p10-doors-slab'],      sections: ['door_slab_rows'],    meta: { name: 'Doors — Slabs & Jambs',   icon: 'door',        desc: 'Style, core, jamb width, qty, slab/jamb/install pricing.' } },
      { id: 'door-hw',      sectionIds: ['p10-doors-hw'],        sections: ['_int_door_hw'],      meta: { name: 'Doors — Hardware',        icon: 'key',         desc: 'Hinge finish, passage/privacy/dummy sets, door stops.' } },
      { id: 'trim-base',    sectionIds: ['p10-trim-base'],      sections: ['trim_base_rows'],    meta: { name: 'Trim & Millwork',         icon: 'column',      desc: 'Baseboard profiles, crown, wainscoting, casing by the foot.' } },
      { id: 'trim-stair',   sectionIds: ['p10-trim-stair'],     sections: ['_int_stair'],       meta: { name: 'Stair Components',        icon: 'stairs',      desc: 'Treads, risers, balusters, newel posts, stair labor.' } },
      { id: 'paint-prep',   sectionIds: ['p10-paint-prep'],     sections: ['paint_prep_rows'],   meta: { name: 'Paint — Preparation',     icon: 'paintbrush',  desc: 'Caulk, wood filler, sandpaper, tape/plastic, primer gallons.' } },
      { id: 'paint-coat',   sectionIds: ['p10-paint-coat'],     sections: ['paint_coat_rows'],   meta: { name: 'Paint — Coatings',        icon: 'palette',     desc: 'Surface sqft, coats, color code, coverage, $/gallon, labor.' } },
      { id: 'closet',       sectionIds: ['p10-closet'],         sections: ['_int_closet'],       meta: { name: 'Closet Systems',          icon: 'shirt',       desc: 'Wire/melamine/custom, LF, drawer units, accessories.' } },
      { id: 'glass',        sectionIds: ['p10-glass'],          sections: ['glass_rows'],        meta: { name: 'Glass & Mirrors',         icon: 'mirror',      desc: 'Shower enclosures, vanity mirrors, glass partitions.' } },
      { id: 'fixture',      sectionIds: ['p10-fixtures'],       sections: ['fixture_int_rows'],  meta: { name: 'Custom Fixtures',         icon: 'hammer',      desc: 'Fireplace surrounds, built-ins, miscellaneous vendor items.' } },
    ],
  };

  // Synthetic section IDs that don't exist as keys in phase.data
  // (they're actually aggregate fields on the phase root). Maps the
  // synthetic key → an array of `data` keys the category covers.
  const SYNTHETIC_SECTIONS = {
    _meta: ['name', 'address', 'client', 'type', 'totalBudget', 'contingency', 'currency', 'contractor', 'startDate', 'endDate', 'notes'],
    _int_cab_box: ['cab_class','cab_core','door_profile','cab_finish','cab_base_lf','cab_upper_lf','cab_pantry_lf','cab_base_rate','cab_upper_rate','cab_pantry_rate','cab_install_rate','millwork_lump'],
    _int_cab_hw: ['glide_spec','hinge_spec','pulls_knobs_count','pull_unit_price','drawer_box_count','drawer_box_price','softclose_price','hinge_qty','hinge_unit_price'],
    _int_door_hw: ['hinge_finish','hinge_finish_price','passage_count','privacy_count','dummy_count','passage_price','privacy_price','dummy_price','door_stops_count','stop_type','door_stop_price'],
    _int_stair: ['stair_tread','tread_count','tread_price','riser_count','riser_price','stair_labor_lump','baluster_style','baluster_count','baluster_price','newel_count','newel_price'],
    _int_closet: ['closet_type','closet_lf','closet_rate_lf','closet_install_lf','closet_drawer_count','closet_drawer_price','closet_accessories_lump','vanity_mirror_sqft','mirror_price_sqft','shower_lump','shower_type'],
  };

  // Count filled fields in a section. An "object" section is filled
  // if it has any non-empty value. A "row array" is filled if any row
  // has any non-empty value. A "scalar" (top-level) field is filled
  // if the value is not null/empty.
  function countFilledFields(phase, sectionKey) {
    const data = phase.data || {};
    // Synthetic / aggregate
    if (SYNTHETIC_SECTIONS[sectionKey]) {
      const keys = SYNTHETIC_SECTIONS[sectionKey];
      return keys.reduce((s, k) => s + (isFilled(data, k) ? 1 : 0), 0);
    }
    return isFilled(data, sectionKey) ? 1 : 0;
  }
  function totalFieldsForSection(sectionKey) {
    if (SYNTHETIC_SECTIONS[sectionKey]) return SYNTHETIC_SECTIONS[sectionKey].length;
    return 1;
  }
  function isFilled(data, key) {
    const v = data[key];
    if (v == null || v === '') return false;
    if (Array.isArray(v)) {
      return v.some(row => row && typeof row === 'object' && Object.values(row).some(x => x != null && x !== ''));
    }
    if (typeof v === 'object') {
      return Object.values(v).some(x => x != null && x !== '');
    }
    return true;
  }

  // Compute category progress (% of fields filled) and section cost
  // Look up an input card spec from its phase + cardId
  function getInputCard(phaseId, cardId) {
    const map = {
      1: CIVIL_CARDS,   2: TILES_CARDS,  3: PAINT_CARDS,
      4: ELEC_CARDS,    5: FAB_CARDS,    6: [...PLUMB_EXT_CARDS, ...PLUMB_INT_CARDS],
      7: POP_CARDS,     8: LIFT_CARDS,   9: MISC_CARDS,
    };
    const cards = map[phaseId] || [];
    return cards.find(c => c.id === cardId) || null;
  }

  function categoryStats(phase, category) {
    // For trade phases 1-9: card has `fields` array + `costFn`
    // For Interior (10): keep the old sections-based logic
    if (phase.id <= 9) {
      const card = getInputCard(phase.id, category.id);
      if (!card) return { filled: 0, total: 0, pct: 0, cost: 0 };
      const data = phase.data[card.id] || {};
      const total = card.fields.length;
      const filled = card.fields.filter(f => {
        const v = data[f.key];
        return v != null && v !== '';
      }).length;
      const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
      const cost = card.costFn(data);
      return { filled, total, pct, cost };
    }
    // Interior — fall back to old sections-based logic
    let total = 0, filled = 0;
    (category.sections || []).forEach(s => {
      total += totalFieldsForSection(s);
      filled += countFilledFields(phase, s);
    });
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    const cost = categoryCost(phase, category);
    return { filled, total, pct, cost };
  }
  function categoryCost(phase, category) {
    if (phase.id <= 9) {
      const card = getInputCard(phase.id, category.id);
      if (!card) return 0;
      return card.costFn(phase.data[card.id] || {});
    }
    const d = phase.data || {};
    let cost = 0;
    (category.sections || []).forEach(s => {
      cost += subTotalForSection(phase.id, d, s);
    });
    return cost;
  }
  function subTotalForSection(phaseId, d, sectionKey) {
    // Synthetic — sum scalar numeric values
    if (sectionKey.startsWith('_')) {
      return SYNTHETIC_SECTIONS[sectionKey].reduce((sum, k) => {
        const v = d[k];
        const n = F.parseNum(v);
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
    }
    const v = d[sectionKey];
    if (Array.isArray(v)) {
      // Trade-phase line items: rows with qty×rate (material) or
      // direct amount (labor/misc). Detect which by inspecting the
      // first row's keys.
      return v.reduce((s, r) => {
        if (!r || typeof r !== 'object') return s;
        // Material: qty × rate
        if ('qty' in r || 'rate' in r) {
          return s + (F.parseNum(r.qty) * F.parseNum(r.rate));
        }
        // Labor / expense: amount field
        if ('amount' in r) return s + F.parseNum(r.amount);
        return s;
      }, 0);
    }
    if (v && typeof v === 'object') {
      return Object.values(v).reduce((s, x) => s + F.parseNum(x), 0);
    }
    return F.parseNum(v);
  }

  // Render the category hub (the grid of cards)
  // Filter a phase's full HTML to only the sections in `allowedSectionIds`.
  // Section cards are identified by `id="sc-{id}"` and we keep the
  // phaseHeader + completionBar (so user can still set overall completion).
  // If `allowedSectionIds` is empty, render an info card instead (for
  // categories like "Project Setup" that live in the wizard / phase meta).
  function filterPhaseHtmlBySections(phaseHtml, allowedSectionIds) {
    if (!allowedSectionIds || allowedSectionIds.length === 0) {
      return ''; // No specific section card — caller will add a meta message
    }
    // Split by the section-card pattern. Each card starts at
    // <div class="section-card ... and ends at the matching </div>.
    // We use a simple heuristic: every <div class="section-card starts
    // a new card, and the matching </div> is the last one before the next.
    const allowedSet = new Set(allowedSectionIds);
    const result = [];
    // Find all section cards
    const cardRegex = /<div class="section-card[^"]*" id="sc-([a-z0-9-]+)">[\s\S]*?(?=<div class="section-card|<\/div>\s*<\/div>\s*$|<\/div>\s*`)/g;
    // Better approach: walk through the HTML, tracking div depth from
    // each section card's opening tag.
    let i = 0;
    while (i < phaseHtml.length) {
      const openMatch = phaseHtml.slice(i).match(/<div class="section-card[^"]*" id="sc-([a-z0-9-]+)">/);
      if (!openMatch) {
        // No more section cards; keep remainder
        result.push(phaseHtml.slice(i));
        break;
      }
      // Keep everything before this card
      result.push(phaseHtml.slice(i, i + openMatch.index));
      // Skip the card's opening
      const cardStart = i + openMatch.index;
      const cardId = openMatch[1];
      // Find the matching close of this card by counting <div and </div>
      let depth = 1;
      let pos = cardStart + openMatch[0].length;
      while (depth > 0 && pos < phaseHtml.length) {
        const nextOpen = phaseHtml.indexOf('<div', pos);
        const nextClose = phaseHtml.indexOf('</div>', pos);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + 4;
        } else {
          depth--;
          pos = nextClose + 6;
        }
      }
      if (allowedSet.has(cardId)) {
        // Include the card in the output
        result.push(phaseHtml.slice(cardStart, pos));
      }
      i = pos;
    }
    return result.join('');
  }

  // For "Project Setup" (synthetic _meta), show a friendly message
  // pointing the user to the wizard / overview instead
  function renderCategoryMetaCard(category) {
    return `
      <div class="section-card">
        <div class="section-card-header" style="cursor:default">
          <span class="section-card-title">${iconFor(category.icon, 14)} <span style="margin-left:6px">${category.name}</span></span>
        </div>
        <div class="section-card-body">
          <div style="padding:20px;text-align:center;color:var(--text-secondary)">
            <div style="margin-bottom:12px;color:var(--amber-light);display:inline-flex;width:48px;height:48px;align-items:center;justify-content:center">${iconFor(category.icon, 40)}</div>
            <p style="margin-bottom:14px">${category.desc}</p>
            <p style="font-size:11px;color:var(--text-muted);margin-bottom:18px">Project-level settings like name, client, budget and dates are managed on the main project setup screen. To change them, go back to the dashboard and edit the project from the project list.</p>
            <button class="btn-primary" onclick="App.showOverview()">Open Project Overview</button>
          </div>
        </div>
      </div>`;
  }

  function renderPhaseHub(phase) {
    const categories = CATEGORY_REGISTRY[phase.id] || [];
    const phaseTotal = F.computePhaseTotal(phase);
    const categoriesWithData = categories.length;

    return `
    <div class="category-hub">
      <div class="breadcrumb">
        <a onclick="App.showOverview()">Overview</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${iconFor(phase.icon, 12)} <span style="margin-left:6px">${phase.name}</span></span>
      </div>

      <div class="category-hub-header">
        <div>
          <div class="category-hub-title">${iconFor(phase.icon, 26)} <span style="margin-left:10px">${phase.name}</span></div>
          <div class="category-hub-subtitle">Phase ${phase.id} of ${(State.getCurrentProject()?.phases.length) || 9} · ${categoriesWithData} categories · ${phase.completion || 0}% complete</div>
        </div>
        <div class="category-hub-stats">
          <div class="category-hub-stat">
            <span class="category-hub-stat-label">Phase Cost</span>
            <span class="category-hub-stat-value">${F.fmtFull(phaseTotal)}</span>
          </div>
          <div class="category-hub-stat">
            <span class="category-hub-stat-label">Completion</span>
            <span class="category-hub-stat-value">${phase.completion || 0}%</span>
          </div>
        </div>
      </div>

      <div class="category-grid">
        ${categories.map(cat => {
          const stats = categoryStats(phase, cat);
          // For trade phases 1-9, each category is a single input card
          // (no inner sub-sections). For Interior (10), categories
          // still route through showPhaseCategory.
          const onclick = phase.id <= 9
            ? `App.showInputCard(${phase.id}, '${cat.id}')`
            : `App.showPhaseCategory(${phase.id}, '${cat.id}')`;
          // Pick the icon — for trade phases use cat.meta.icon;
          // for Interior, fall back to cat.icon (legacy field).
          const iconName = cat.meta?.icon || cat.icon || 'listChecks';
          const name = cat.meta?.name || cat.name;
          const desc = cat.meta?.desc || cat.desc;
          return `
          <button class="category-card ${stats.pct === 100 ? 'is-complete' : ''}" onclick="${onclick}">
            <span class="category-card-arrow">${iconFor('arrowRight', 14)}</span>
            <span class="category-card-icon">${iconFor(iconName, 28)}</span>
            <div class="category-card-name">${name}</div>
            <div class="category-card-desc">${desc}</div>
            <div class="category-card-meta">
              <div class="category-card-progress">
                <div class="category-card-progress-label">${stats.filled}/${stats.total} fields · ${stats.pct}%</div>
                <div class="category-card-progress-bar">
                  <div class="category-card-progress-fill" style="width:${stats.pct}%"></div>
                </div>
              </div>
              <div class="category-card-cost">${F.fmt(stats.cost)}</div>
            </div>
          </button>`;
        }).join('')}
        ${phase.id === 10 ? `
        <button class="category-card colour-lab-card" onclick="App.showColourLab()" style="border-color:rgba(158,119,88,0.4);background:linear-gradient(135deg,var(--charcoal-mid),var(--charcoal-surface))">
          <span class="category-card-arrow">${iconFor('arrowRight', 14)}</span>
          <span class="category-card-icon" style="font-size:34px">🎨</span>
          <div class="category-card-name" style="background:linear-gradient(135deg,var(--amber),var(--amber-light));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Colour Lab</div>
          <div class="category-card-desc">Preview wall &amp; ceiling colours under daylight, warm LED, cool LED and night lighting — live on a 3D room view.</div>
          <div class="category-card-meta">
            <div class="category-card-progress">
              <div class="category-card-progress-label">Interactive · No data required</div>
            </div>
            <div class="category-card-cost" style="font-size:16px">🌅</div>
          </div>
        </button>` : ''}
        
        <button class="category-card" onclick="App.showPhaseBills(${phase.id})" style="border-color:var(--charcoal-border)">
          <span class="category-card-arrow">${iconFor('arrowRight', 14)}</span>
          <span class="category-card-icon" style="font-size:28px">📸</span>
          <div class="category-card-name">Bills & Receipts</div>
          <div class="category-card-desc">AI Photo Scanner for Kachha bills. Extract items automatically.</div>
          <div class="category-card-meta">
            <div class="category-card-progress">
              <div class="category-card-progress-label">${(State.getBills && State.getBills(phase.id).length) || 0} Bills Scanned</div>
            </div>
          </div>
        </button>
      </div>
    </div>`;
  }

  // Render the interior hub (which has more categories than typical phases)
  function renderInteriorHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const phase = proj.phases.find(p => p.id === 10);
    if (!phase) return '';
    return renderPhaseHub(phase);
  }

  // ════════════════════════════════════════════════════════════
  // TRADE PHASE RENDERERS
  // The 9 construction phases (Civil, Tiles, Paint, Electrical,
  // Furniture, Plumbing, POP, Lift, Other) all follow the same
  // pattern: a "Material" line-item table + a "Labor" line-item
  // table (or in some cases two related tables). The "Other"
  // phase uses a single generic expense table.
  // ════════════════════════════════════════════════════════════


  // ════════════════════════════════════════════════════════════
  // INPUT CARD REGISTRY — Per-input category cards
  // Each trade phase is broken into one card per concrete input
  // type (Iron, Sand, Cement, etc). Each card has a tailored
  // form with the right fields. Cost auto-computes from the
  // fields the user fills in. No more blank "Material Ledger"
  // tables — every input is pre-defined and specific.
  // ════════════════════════════════════════════════════════════

  // Field types
  //  - text:     single-line text input
  //  - number:   numeric input
  //  - select:   dropdown with options
  //  - date:     date picker
  // Field keys are stored under phase.data[<id>], with the live
  // cost computed by the card's costFn.

  function inputCard(phase, card) {
    const data = phase.data[card.id] || {};
    const cost = card.costFn(data);
    const filled = card.fields.filter(f => {
      const v = data[f.key];
      return v != null && v !== '' && v !== 0;
    }).length;
    const total = card.fields.length;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    const complete = filled === total;
    return `
    <button class="category-card ${complete ? 'is-complete' : ''}" onclick="App.showInputCard(${phase.id}, '${card.id}')">
      <span class="category-card-arrow">${iconFor('arrowRight', 14)}</span>
      <span class="category-card-icon">${iconFor(card.icon, 26)}</span>
      <div class="category-card-name">${card.name}</div>
      <div class="category-card-desc">${card.desc}</div>
      <div class="category-card-meta">
        <div class="category-card-progress">
          <div class="category-card-progress-label">${filled}/${total} fields · ${pct}%</div>
          <div class="category-card-progress-bar">
            <div class="category-card-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="category-card-cost">${F.fmt(cost)}</div>
      </div>
    </button>`;
  }

  // Render a single input field as a form row
  function inputFieldHtml(phase, card, field) {
    const data = phase.data[card.id] || {};
    const value = data[field.key];
    const baseStyle = 'background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;font-family:var(--font-body);font-size:13px;width:100%;box-sizing:border-box';
    const labelStyle = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:5px;display:block';
    const onChange = `Phases.updateInputField(${phase.id},'${card.id}','${field.key}',this.value);Financial.scheduleUpdate()`;

    let control = '';
    if (field.type === 'select') {
      const opts = field.options.map(o => `<option ${value === o ? 'selected' : ''}>${o}</option>`).join('');
      control = `<select onchange="${onChange}" style="${baseStyle}"><option value=""></option>${opts}</select>`;
    } else if (field.type === 'date') {
      control = `<input type="date" value="${value || ''}" oninput="${onChange}" style="${baseStyle}">`;
    } else if (field.type === 'number') {
      control = `<input type="number" value="${value ?? ''}" placeholder="${field.placeholder || '0'}" step="any" min="0" oninput="${onChange}" style="${baseStyle};font-family:var(--font-mono)">`;
    } else {
      control = `<input type="text" value="${value ?? ''}" placeholder="${field.placeholder || ''}" oninput="${onChange}" style="${baseStyle}">`;
    }

    return `
      <div class="field-group" style="margin-bottom:12px">
        <label class="field-label" style="${labelStyle}">${field.label}</label>
        ${control}
      </div>`;
  }

  // Render the full detail form for one input card
  function renderInputCardDetail(phase, card) {
    const data = phase.data[card.id] || {};
    const cost = card.costFn(data);

    // Group fields in 1, 2, or 3 columns depending on count
    const cols = card.fields.length <= 3 ? 1 : card.fields.length <= 6 ? 2 : 3;
    const groups = card.fields.map(f => inputFieldHtml(phase, card, f)).join('');
    const layoutHtml = cols === 1
      ? groups
      : `<div class="field-row cols-${cols}">${groups}</div>`;

    return `
    ${phaseHeader(phase)}
    ${phaseSectionCard(`p${phase.id}-${card.id}`, card.name, `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;padding:10px 12px;background:var(--charcoal-light);border-left:3px solid var(--amber-light);border-radius:4px">
        ${card.desc}
      </div>
      ${layoutHtml}
      <div class="live-total" style="margin-top:18px;font-size:14px">
        <span class="live-total-label" style="font-size:12px;color:var(--text-secondary)">${card.name} Total</span>
        <div class="currency-input-wrap" style="width:140px">
          <span class="currency-symbol">₹</span>
          <input class="field-input mono" type="number" id="card-total-${phase.id}-${card.id}" value="${F.fmtFull(cost).replace(/[^0-9.]/g,'')}" style="font-size:18px;font-weight:700;color:var(--amber)" oninput="Phases.updateInputField(${phase.id},'${card.id}','_manual_total',this.value);Financial.scheduleUpdate()">
        </div>
      </div>
    `)}`;
  }

  // Save a field value into phase.data
  function updateInputField(phaseId, cardId, fieldKey, value) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p => p.id === phaseId);
    if (!ph) return;
    if (!ph.data[cardId]) ph.data[cardId] = {};
    ph.data[cardId][fieldKey] = value;
    if (fieldKey !== '_manual_total') {
      delete ph.data[cardId]._manual_total;
    }
    State.save();
  }

  function updatePhase10ManualTotal(id, value) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const ph = proj.phases.find(p => p.id === 10);
    if (!ph) return;
    if (!ph.data) ph.data = {};
    ph.data[`_manual_${id}`] = value;
    State.save();
  }

  // ─────────────────────────────────────────────────────────
  // Per-trade INPUT CARDS
  // Each card has a name, icon, description, fields, and a cost
  // function. The cost function receives the data object and
  // returns the total cost in ₹.
  // ─────────────────────────────────────────────────────────

  // Common field presets
  const F_NUMBER = (key, label, placeholder) => ({ key, label, type: 'number', placeholder: placeholder || '0' });
  const F_TEXT   = (key, label, placeholder) => ({ key, label, type: 'text', placeholder: placeholder || '' });
  const F_SELECT = (key, label, options) => ({ key, label, type: 'select', options });
  const F_DATE   = (key, label) => ({ key, label, type: 'date' });

  // Cost = qty × rate (with safe defaults)
  function costQtyRate(data, qtyKey, rateKey) {
    return (F.parseNum(data[qtyKey]) || 0) * (F.parseNum(data[rateKey]) || 0);
  }
  function costAmount(data, key) {
    return F.parseNum(data[key]) || 0;
  }
  function costSum(...vals) { return vals.reduce((s, v) => s + (F.parseNum(v) || 0), 0); }

  // 1. CIVIL WORK
  const CIVIL_CARDS = [
    {
      id: 'iron', name: 'Iron (TMT Bars)', icon: 'bricks',
      desc: 'TMT bars for columns, beams, slabs. Pick grade, enter quantity in kg and rate per kg.',
      fields: [
        F_SELECT('grade', 'Grade', ['Fe-415','Fe-500','Fe-500D','Fe-550','Fe-550D']),
        F_SELECT('brand', 'Brand', ['Tata Tiscon','JSW NeoSteel','SAIL','Jindal Panther','Local / Unbranded']),
        F_NUMBER('qty_kg', 'Quantity (kg)', '0'),
        F_NUMBER('rate_per_kg', 'Rate (₹/kg)', '0'),
        F_TEXT('vendor', 'Vendor'),
        F_SELECT('confidence', 'Confidence', ['Estimated','Quoted','Locked-PO','Invoiced']),
      ],
      costFn: d => costQtyRate(d, 'qty_kg', 'rate_per_kg'),
    },
    {
      id: 'sand', name: 'Sand', icon: 'pipe',
      desc: 'Fine aggregate for plaster and concrete. Type, quantity in cu-ft or brass, rate per unit.',
      fields: [
        F_SELECT('type', 'Type', ['M-Sand (Manufactured)','River Sand','Plaster Sand','Pit Sand']),
        F_SELECT('source', 'Source / Grade', ['Grade-1','Grade-2','Grade-3','Unspecified']),
        F_NUMBER('qty_brass', 'Quantity (brass)', '0'),
        F_NUMBER('rate_per_brass', 'Rate (₹/brass)', '0'),
        F_TEXT('vendor', 'Supplier'),
      ],
      costFn: d => costQtyRate(d, 'qty_brass', 'rate_per_brass'),
    },
    {
      id: 'cement', name: 'Cement', icon: 'blocks',
      desc: 'OPC / PPC bags for concrete and plaster. Pick brand and grade, enter bags and rate.',
      fields: [
        F_SELECT('brand', 'Brand', ['UltraTech','ACC','Ambuja','Shree','Dalmia','Ramco','Birla A1','JSW','Local / Unbranded']),
        F_SELECT('grade', 'Grade', ['OPC-43','OPC-53','PPC','PSC','SRC']),
        F_NUMBER('qty_bags', 'Quantity (bags)', '0'),
        F_NUMBER('rate_per_bag', 'Rate (₹/bag)', '0'),
        F_TEXT('vendor', 'Dealer'),
      ],
      costFn: d => costQtyRate(d, 'qty_bags', 'rate_per_bag'),
    },
    {
      id: 'stone', name: 'Stone / Gravel (Khadhi)', icon: 'foundation',
      desc: 'Coarse aggregate for concrete. Type (20mm/40mm), quantity in cu-ft or brass, rate per unit.',
      fields: [
        F_SELECT('size', 'Aggregate Size', ['20mm','40mm','Mixed 20-40mm','Gravel (khadhi)','Crushed Stone','VSI Sand']),
        F_NUMBER('qty_brass', 'Quantity (brass)', '0'),
        F_NUMBER('rate_per_brass', 'Rate (₹/brass)', '0'),
        F_TEXT('vendor', 'Supplier'),
      ],
      costFn: d => costQtyRate(d, 'qty_brass', 'rate_per_brass'),
    },
    {
      id: 'binding_wire', name: 'Binding Wire', icon: 'wrenchScrew',
      desc: 'Black annealed wire for tying rebar. Typically sold by kg.',
      fields: [
        F_NUMBER('qty_kg', 'Quantity (kg)', '0'),
        F_NUMBER('rate_per_kg', 'Rate (₹/kg)', '0'),
        F_TEXT('vendor', 'Supplier'),
      ],
      costFn: d => costQtyRate(d, 'qty_kg', 'rate_per_kg'),
    },
    {
      id: 'adhesive', name: 'Adhesive Chemical', icon: 'insulation',
      desc: 'Bonding agents, water-proofing chemicals, curing compounds, plasticizers.',
      fields: [
        F_TEXT('brand', 'Brand'),
        F_TEXT('product', 'Product Name'),
        F_NUMBER('qty_ltr', 'Quantity (litres)', '0'),
        F_NUMBER('rate_per_ltr', 'Rate (₹/litre)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_ltr', 'rate_per_ltr'),
    },
    {
      id: 'other_material', name: 'Other Civil Materials', icon: 'listChecks',
      desc: 'Anything else not covered — brick, block, AAC blocks, water-stops, etc.',
      fields: [
        F_TEXT('item', 'Item Description'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
        F_TEXT('vendor', 'Vendor'),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
    {
      id: 'thekedar', name: 'Civil Labor Costing', icon: 'userCircle',
      desc: 'Daily wage and milestone payouts to the primary Civil Labor contractor and masons. One entry per payout.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Payee / Worker'),
        F_TEXT('work', 'Work Description'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
  ];

  // 2. TILES & FLOORING
  const TILES_CARDS = [
    {
      id: 'floor_tiles', name: 'Floor Tiles', icon: 'ruler',
      desc: 'Floor tiles for all rooms. Type, size, brand, area in sqft, rate per sqft.',
      fields: [
        F_SELECT('type', 'Type', ['Vitrified','Ceramic','Porcelain','Marble','Granite','Wooden','Vitrified Slab']),
        F_SELECT('size', 'Size (inches)', ['12x12','12x18','16x16','18x18','24x24','24x48','32x32','48x48','Custom']),
        F_TEXT('brand', 'Brand'),
        F_NUMBER('area_sqft', 'Area (sqft)', '0'),
        F_NUMBER('rate_per_sqft', 'Rate (₹/sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'area_sqft', 'rate_per_sqft'),
    },
    {
      id: 'kitchen_dado', name: 'Kitchen Dado Tiles', icon: 'wrench',
      desc: 'Backsplash tiles above kitchen counter. Area in sqft, rate per sqft.',
      fields: [
        F_SELECT('size', 'Size (inches)', ['12x12','12x18','8x12','Custom']),
        F_TEXT('brand', 'Brand'),
        F_NUMBER('area_sqft', 'Area (sqft)', '0'),
        F_NUMBER('rate_per_sqft', 'Rate (₹/sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'area_sqft', 'rate_per_sqft'),
    },
    {
      id: 'staircase_tiles', name: 'Staircase Tiles', icon: 'stairs',
      desc: 'Tiles for treads + risers. Count number of steps.',
      fields: [
        F_TEXT('brand', 'Brand'),
        F_NUMBER('step_count', 'Number of Steps', '0'),
        F_NUMBER('rate_per_step', 'Rate (₹/step)', '0'),
      ],
      costFn: d => costQtyRate(d, 'step_count', 'rate_per_step'),
    },
    {
      id: 'tile_chemical', name: 'Tile Chemical / Adhesive', icon: 'droplet',
      desc: 'Tile adhesive, grout, spacer, EPDM, waterproofing compound.',
      fields: [
        F_TEXT('item', 'Item'),
        F_NUMBER('qty', 'Quantity', '0'),
        F_SELECT('unit', 'Unit', ['kg','bag','ltr','pcs']),
        F_NUMBER('rate', 'Rate (₹)', '0'),
      ],
      costFn: d => (F.parseNum(d.qty) || 0) * (F.parseNum(d.rate) || 0),
    },
    {
      id: 'tile_sand_cement', name: 'Sand & Cement for Bedding', icon: 'blocks',
      desc: 'Bedding sand + cement used under tile installation.',
      fields: [
        F_NUMBER('sand_qty_brass', 'Sand (brass)', '0'),
        F_NUMBER('sand_rate', 'Sand Rate (₹/brass)', '0'),
        F_NUMBER('cement_bags', 'Cement (bags)', '0'),
        F_NUMBER('cement_rate', 'Cement Rate (₹/bag)', '0'),
      ],
      costFn: d => (F.parseNum(d.sand_qty_brass)||0)*(F.parseNum(d.sand_rate)||0) + (F.parseNum(d.cement_bags)||0)*(F.parseNum(d.cement_rate)||0),
    },
    {
      id: 'tile_labor', name: 'Tiling Labor Payouts', icon: 'userCircle',
      desc: 'Payouts to the tiling contractor (usually per sqft installed).',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Tiling Contractor / Worker'),
        F_TEXT('work', 'Work / Area'),
        F_NUMBER('rate_per_sqft', 'Rate (₹/sqft installed)', '0'),
        F_NUMBER('area_sqft', 'Area Installed (sqft)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => (F.parseNum(d.rate_per_sqft)||0) * (F.parseNum(d.area_sqft)||0),
    },
  ];

  // 3. PAINTING
  const PAINT_CARDS = [
    {
      id: 'putty', name: 'Wall Putty', icon: 'paintRoller',
      desc: 'Wall putty (acrylic / powder) for smooth base. Bags in kg, rate per kg.',
      fields: [
        F_SELECT('type', 'Type', ['Acrylic Putty','White Cement Putty (Powder)','Ready-mix Putty']),
        F_TEXT('brand', 'Brand', 'e.g. Birla, JK, Asian Paints'),
        F_NUMBER('qty_kg', 'Quantity (kg)', '0'),
        F_NUMBER('rate_per_kg', 'Rate (₹/kg)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_kg', 'rate_per_kg'),
    },
    {
      id: 'primer_ext', name: 'Exterior Primer', icon: 'palette',
      desc: 'Exterior wall primer. Litres, rate per litre.',
      fields: [
        F_TEXT('brand', 'Brand'),
        F_NUMBER('qty_ltr', 'Quantity (litres)', '0'),
        F_NUMBER('rate_per_ltr', 'Rate (₹/litre)', '0'),
        F_NUMBER('area_sqft', 'Coverage Area (sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_ltr', 'rate_per_ltr'),
    },
    {
      id: 'primer_int', name: 'Interior Primer', icon: 'palette',
      desc: 'Interior wall primer (separate from exterior — different chemistry).',
      fields: [
        F_TEXT('brand', 'Brand'),
        F_NUMBER('qty_ltr', 'Quantity (litres)', '0'),
        F_NUMBER('rate_per_ltr', 'Rate (₹/litre)', '0'),
        F_NUMBER('area_sqft', 'Coverage Area (sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_ltr', 'rate_per_ltr'),
    },
    {
      id: 'paint_ext', name: 'Exterior Paint', icon: 'palette',
      desc: 'Exterior weather-proof paint. Litres, rate per litre.',
      fields: [
        F_SELECT('finish', 'Finish', ['Matte','Satin','Semi-gloss','Gloss','Texture','Distemper','Weather-coat']),
        F_TEXT('brand', 'Brand', 'e.g. Apex, Ultima, Ace'),
        F_NUMBER('qty_ltr', 'Quantity (litres)', '0'),
        F_NUMBER('rate_per_ltr', 'Rate (₹/litre)', '0'),
        F_NUMBER('area_sqft', 'Coverage Area (sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_ltr', 'rate_per_ltr'),
    },
    {
      id: 'paint_int', name: 'Interior Paint', icon: 'palette',
      desc: 'Interior emulsion / distemper. Litres, rate per litre.',
      fields: [
        F_SELECT('finish', 'Finish', ['Matte','Satin','Semi-gloss','Gloss','Royal Emulsion','Distemper','Premium Emulsion']),
        F_TEXT('brand', 'Brand'),
        F_NUMBER('qty_ltr', 'Quantity (litres)', '0'),
        F_NUMBER('rate_per_ltr', 'Rate (₹/litre)', '0'),
        F_NUMBER('area_sqft', 'Coverage Area (sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_ltr', 'rate_per_ltr'),
    },
    {
      id: 'oil_paint', name: 'Oil Paint / Enamel', icon: 'paintbrush',
      desc: 'Oil-based enamel for doors, windows, grills. Litres, rate per litre.',
      fields: [
        F_SELECT('use', 'Use', ['Doors & Windows','Grills & Gates','Metal Railings','Wood Polish','Others']),
        F_TEXT('brand', 'Brand'),
        F_NUMBER('qty_ltr', 'Quantity (litres)', '0'),
        F_NUMBER('rate_per_ltr', 'Rate (₹/litre)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_ltr', 'rate_per_ltr'),
    },
    {
      id: 'painter_labor', name: 'Painter Payouts', icon: 'userCircle',
      desc: 'Painter payouts — per coat or per room milestone.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Painter / Contractor'),
        F_TEXT('work', 'Work / Area / Coat'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
  ];

  // 4. ELECTRICAL
  const ELEC_CARDS = [
    {
      id: 'switches', name: 'Switches & Boards', icon: 'zap',
      desc: 'Modular switches, sockets, plates and boxes (Anchor / Roma / Legrand).',
      fields: [
        F_SELECT('brand', 'Brand', ['Anchor Roma','Legrand','Schneider','Havells','GM','Local']),
        F_NUMBER('qty', 'Quantity (pcs)', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'wires', name: 'Wires', icon: 'zap',
      desc: 'Copper / aluminium wires by gauge (1.5 sqmm / 2.5 / 4 / 6). Sold by meter or coil.',
      fields: [
        F_SELECT('gauge', 'Gauge (sqmm)', ['1.0','1.5','2.5','4','6','10','16']),
        F_SELECT('metal', 'Metal', ['Copper','Aluminium']),
        F_SELECT('brand', 'Brand', ['Havells','Polycab','KEI','Finolex','RR Kabel','Local']),
        F_NUMBER('qty_mtr', 'Quantity (metres)', '0'),
        F_NUMBER('rate_per_mtr', 'Rate (₹/metre)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_mtr', 'rate_per_mtr'),
    },
    {
      id: 'conduits', name: 'Fitting Pipes (Conduits)', icon: 'pipe',
      desc: 'PVC / flexible conduits for wiring routing.',
      fields: [
        F_SELECT('type', 'Type', ['PVC Rigid 20mm','PVC Rigid 25mm','PVC Flexible 20mm','PVC Flexible 25mm','HMS Conduit']),
        F_NUMBER('qty_mtr', 'Quantity (metres)', '0'),
        F_NUMBER('rate_per_mtr', 'Rate (₹/metre)', '0'),
        F_TEXT('vendor', 'Supplier'),
      ],
      costFn: d => costQtyRate(d, 'qty_mtr', 'rate_per_mtr'),
    },
    {
      id: 'lights', name: 'Lights & Fixtures', icon: 'lightbulb',
      desc: 'Bulbs, LED panels, downlights, batten, holders, fancy lights.',
      fields: [
        F_SELECT('type', 'Type', ['LED Bulb','LED Panel','Downlight','Batten','Cove Light','Chandelier','Wall Light','Holder']),
        F_TEXT('brand', 'Brand', 'e.g. Philips, Havells, Crompton'),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'metering', name: 'Metering Material', icon: 'listChecks',
      desc: 'Energy meter, distribution board (DB), MCBs, RCCB, isolators, earthing.',
      fields: [
        F_TEXT('item', 'Item'),
        F_SELECT('brand', 'Brand', ['Havells','Schneider','ABB','Hager','Siemens','Local']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'electrician_labor', name: 'Electrician Payouts', icon: 'userCircle',
      desc: 'Electrician payouts — often per-point or per-flat contract.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Electrician / Contractor'),
        F_SELECT('basis', 'Payment Basis', ['Per Point','Per Flat / Unit','Day Wage','Milestone','Lump Sum']),
        F_NUMBER('qty', 'Quantity (points/days)', '0'),
        F_NUMBER('rate', 'Rate (₹/point or ₹/day)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => (F.parseNum(d.qty)||0) * (F.parseNum(d.rate)||0),
    },
  ];

  // 5. FURNITURE & FABRICATION
  const FAB_CARDS = [
    {
      id: 'door_frames', name: 'Door Frames', icon: 'door',
      desc: 'Wooden / metal door frames for all internal & external doors.',
      fields: [
        F_SELECT('material', 'Material', ['Hardwood (Teak)','Hardwood (Sal)','Engineered Wood','Metal / MS','WPC']),
        F_SELECT('size', 'Size (inches)', ['3x7 (Standard)','3.5x7','4x7','4x8','Custom']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/frame)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'flush_doors', name: 'Flush Doors', icon: 'door',
      desc: 'Flush door shutters (ply / block board).',
      fields: [
        F_SELECT('core', 'Core', ['Plywood','Block Board','Solid Core','Hollow Core','Particle Board']),
        F_SELECT('size', 'Size (inches)', ['3x7 (Standard)','3.5x7','4x7','4x8','Custom']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/door)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'windows', name: 'Windows', icon: 'window',
      desc: 'Aluminum / UPVC / wooden windows.',
      fields: [
        F_SELECT('material', 'Material', ['Aluminium','UPVC','Wooden','Steel']),
        F_SELECT('glass', 'Glass Type', ['Plain','Toughened','Reflective','Frosted','Double-glazed']),
        F_SELECT('size', 'Size (ft)', ['3x3','4x3','4x4','5x4','6x4','Custom']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/window)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'glass_railing', name: 'Glass Railing', icon: 'mirror',
      desc: 'Toughened glass panels + SS / aluminium handrail for balconies / stairs.',
      fields: [
        F_SELECT('glass', 'Glass Type', ['Toughened 10mm','Toughened 12mm','Laminated']),
        F_NUMBER('length_rft', 'Length (rft)', '0'),
        F_NUMBER('rate_per_rft', 'Rate (₹/rft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'length_rft', 'rate_per_rft'),
    },
    {
      id: 'hardware', name: 'Fitting Materials (Hardware / Hinges)', icon: 'wrenchScrew',
      desc: 'Hinges, handles, locks, tower bolts, door closers, hinges, latches.',
      fields: [
        F_TEXT('item', 'Item'),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'fab_labor', name: 'Carpenter & Fabricator Labor', icon: 'userCircle',
      desc: 'Payouts to carpenters and fabricators (door fixing, window fitting, glass work).',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Carpenter / Fabricator'),
        F_TEXT('work', 'Work Description'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
  ];

  // 6. PLUMBING (Exterior + Internal)
  const PLUMB_EXT_CARDS = [
    {
      id: 'ext_pipes', name: 'Exterior Pipes', icon: 'pipe',
      desc: 'PVC / CPVC / GI / HDPE pipes for drainage, supply, main line.',
      fields: [
        F_SELECT('type', 'Pipe Type', ['PVC (Drainage)','CPVC (Hot/Cold)','GI','HDPE','UPVC','SWR']),
        F_SELECT('size', 'Size (mm)', ['40','50','75','110','160','200']),
        F_NUMBER('qty_mtr', 'Quantity (metres)', '0'),
        F_NUMBER('rate_per_mtr', 'Rate (₹/metre)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_mtr', 'rate_per_mtr'),
    },
    {
      id: 'ext_fittings', name: 'Exterior Fitting Material', icon: 'wrenchScrew',
      desc: 'Elbows, tees, valves, gully traps, manholes, cleanouts, joints.',
      fields: [
        F_TEXT('item', 'Item'),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'drainage_lines', name: 'Drainage Lines', icon: 'wrench',
      desc: 'Soak pits, manholes, storm water drainage.',
      fields: [
        F_NUMBER('length_mtr', 'Length (metres)', '0'),
        F_NUMBER('rate_per_mtr', 'Rate (₹/metre incl. excavation)', '0'),
        F_NUMBER('manholes', 'Manholes (count)', '0'),
        F_NUMBER('manhole_rate', 'Per Manhole Cost (₹)', '0'),
      ],
      costFn: d => (F.parseNum(d.length_mtr)||0)*(F.parseNum(d.rate_per_mtr)||0) + (F.parseNum(d.manholes)||0)*(F.parseNum(d.manhole_rate)||0),
    },
  ];
  const PLUMB_INT_CARDS = [
    {
      id: 'int_pipes', name: 'Internal Pipes', icon: 'pipe',
      desc: 'CPVC / PPR / GI internal piping for kitchen, bath, WC.',
      fields: [
        F_SELECT('type', 'Pipe Type', ['CPVC','PPR','GI','Multilayer Composite']),
        F_SELECT('size', 'Size (mm)', ['15','20','25','32','40','50']),
        F_NUMBER('qty_mtr', 'Quantity (metres)', '0'),
        F_NUMBER('rate_per_mtr', 'Rate (₹/metre)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_mtr', 'rate_per_mtr'),
    },
    {
      id: 'int_fittings', name: 'Internal Fitting Material', icon: 'wrenchScrew',
      desc: 'Internal elbows, tees, valves, connectors, clamps.',
      fields: [
        F_TEXT('item', 'Item'),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'taps', name: 'Taps & Faucets', icon: 'droplet',
      desc: 'Pillar cock, bib cock, sink tap, shower — branded fixtures.',
      fields: [
        F_SELECT('type', 'Type', ['Pillar Cock','Bib Cock','Sink Mixer','Wall Mixer','Shower Mixer','Hand Shower','Kitchen Sink Tap']),
        F_SELECT('brand', 'Brand', ['Jaquar','Hindware','Cera','Kohler','Grohe','Parryware','Local']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'bath_fittings', name: 'Bath Fittings & Accessories', icon: 'listChecks',
      desc: 'Towel rods, soap holders, toilet paper holders, shower rods, hooks.',
      fields: [
        F_TEXT('item', 'Item'),
        F_SELECT('brand', 'Brand', ['Jaquar','Hindware','Cera','Kohler','Local']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/pc)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty', 'rate'),
    },
    {
      id: 'plumber_labor', name: 'Plumber Payouts', icon: 'userCircle',
      desc: 'Plumber payouts — usually per-flat or per-point.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Plumber / Contractor'),
        F_SELECT('basis', 'Payment Basis', ['Per Point','Per Flat / Unit','Day Wage','Milestone','Lump Sum']),
        F_NUMBER('qty', 'Quantity', '0'),
        F_NUMBER('rate', 'Rate (₹/point or ₹/day)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => (F.parseNum(d.qty)||0) * (F.parseNum(d.rate)||0),
    },
  ];

  // 7. POP / FALSE CEILING
  const POP_CARDS = [
    {
      id: 'pop_bags', name: 'POP Bags', icon: 'insulation',
      desc: 'Plaster of Paris bags. Typically 25 kg bags.',
      fields: [
        F_TEXT('brand', 'Brand'),
        F_NUMBER('qty_bags', 'Quantity (bags)', '0'),
        F_NUMBER('rate_per_bag', 'Rate (₹/bag)', '0'),
      ],
      costFn: d => costQtyRate(d, 'qty_bags', 'rate_per_bag'),
    },
    {
      id: 'framing', name: 'Framing Channels', icon: 'wrenchScrew',
      desc: 'Gypsum / metal channel framing for false ceiling.',
      fields: [
        F_SELECT('type', 'Type', ['Gypsum Channel','Metal Channel','Grid Ceiling','Wooden Frame']),
        F_NUMBER('area_sqft', 'Area (sqft)', '0'),
        F_NUMBER('rate_per_sqft', 'Rate (₹/sqft)', '0'),
      ],
      costFn: d => costQtyRate(d, 'area_sqft', 'rate_per_sqft'),
    },
    {
      id: 'pop_other', name: 'Other POP Consumables', icon: 'listChecks',
      desc: 'Corner beads, mesh tape, screws, primer — anything else.',
      fields: [
        F_TEXT('item', 'Item'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
    {
      id: 'pop_labor', name: 'POP Contractor Payouts', icon: 'userCircle',
      desc: 'POP contractor payouts — per-sqft of ceiling or per-room.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'POP Contractor'),
        F_NUMBER('area_sqft', 'Area Done (sqft)', '0'),
        F_NUMBER('rate_per_sqft', 'Rate (₹/sqft)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => (F.parseNum(d.area_sqft)||0) * (F.parseNum(d.rate_per_sqft)||0),
    },
  ];

  // 8. LIFT (ELEVATOR)
  const LIFT_CARDS = [
    {
      id: 'lift_unit', name: 'Lift Unit (Car + Motor)', icon: 'stairs',
      desc: 'Passenger / goods lift unit — car, motor, controller, drive.',
      fields: [
        F_SELECT('type', 'Type', ['Passenger (4-6 person)','Passenger (8-10 person)','Goods Lift','Hospital / Stretcher','Home Lift']),
        F_SELECT('brand', 'Brand', ['Otis','Schindler','Kone','ThyssenKrupp','Mitsubishi','Hyundai','Sigma','Local / Indian']),
        F_NUMBER('floors', 'Number of Floors', '0'),
        F_NUMBER('amount', 'Unit Cost (₹)', '0'),
        F_SELECT('confidence', 'PO Status', ['Estimated','Quoted','Locked-PO','Invoiced']),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
    {
      id: 'shaft', name: 'Shaft & Structural Supports', icon: 'foundation',
      desc: 'Lift shaft construction, structural steel, supports, pit & headroom.',
      fields: [
        F_TEXT('item', 'Item / Work'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
    {
      id: 'doors_panels', name: 'Doors & Panels', icon: 'door',
      desc: 'Automatic / manual door panels for each floor.',
      fields: [
        F_NUMBER('floors', 'Number of Floors', '0'),
        F_NUMBER('rate_per_floor', 'Rate (₹/floor)', '0'),
      ],
      costFn: d => (F.parseNum(d.floors)||0) * (F.parseNum(d.rate_per_floor)||0),
    },
    {
      id: 'lift_install', name: 'Installation Crew', icon: 'wrench',
      desc: 'Installation crew, electrical hookup, certification.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('payee', 'Installation Crew / Vendor'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
  ];

  // 9. OTHER (MISC) — single line-item expense table
  const MISC_CARDS = [
    {
      id: 'misc_expenses', name: 'Site Expenses (Miscellaneous)', icon: 'listChecks',
      desc: 'Water tankers, curing labor, security guards, municipal fees, bribes, transport, miscellaneous.',
      fields: [
        F_DATE('date', 'Date'),
        F_TEXT('item', 'Expense Description'),
        F_TEXT('payee', 'Paid To / Vendor'),
        F_NUMBER('amount', 'Amount (₹)', '0'),
        F_SELECT('mode', 'Mode', ['Cash','UPI','Cheque','Bank','NEFT']),
      ],
      costFn: d => costAmount(d, 'amount'),
    },
  ];

  // ════════════════════════════════════════════════════════════
  // Per-trade phase renderers (new flat-card design)
  // Each trade phase shows ALL its input cards in a single grid.
  // ════════════════════════════════════════════════════════════

  function renderTradeHub(phase, cards) {
    const total = cards.reduce((s, c) => s + c.costFn(phase.data[c.id] || {}), 0);
    return `
    ${phaseHeader(phase)}
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;padding:10px 14px;background:var(--charcoal-light);border-left:3px solid var(--amber-light);border-radius:4px">
      Click any card to enter quantities, rates and vendor details. Cost auto-computes as you type.
    </div>
    <div class="category-grid">
      ${cards.map(c => inputCard(phase, c)).join('')}
    </div>
    <div style="margin-top:24px;padding:14px 18px;background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:10px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;font-weight:700">${phase.name} — Total Cost</div>
      <div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:var(--amber-light)">${F.fmtFull(total)}</div>
    </div>`;
  }

  function renderTradePhase1(phase) { return renderTradeHub(phase, CIVIL_CARDS); }
  function renderTradePhase2(phase) { return renderTradeHub(phase, TILES_CARDS); }
  function renderTradePhase3(phase) { return renderTradeHub(phase, PAINT_CARDS); }
  function renderTradePhase4(phase) { return renderTradeHub(phase, ELEC_CARDS); }
  function renderTradePhase5(phase) { return renderTradeHub(phase, FAB_CARDS); }
  function renderTradePhase6(phase) {
    return renderTradeHub(phase, [...PLUMB_EXT_CARDS, ...PLUMB_INT_CARDS]);
  }
  function renderTradePhase7(phase) { return renderTradeHub(phase, POP_CARDS); }
  function renderTradePhase8(phase) { return renderTradeHub(phase, LIFT_CARDS); }
  function renderTradePhase9(phase) { return renderTradeHub(phase, MISC_CARDS); }

  // Render the detail form for a single input card.
  // (Used by showInputCard in app.js)
  function renderSingleInputCard(phase, card) {
    return renderInputCardDetail(phase, card);
  }

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
        <td><button class="delete-row-btn" onclick="Phases.deletePermitRow(${i})">${Icons.render('trash', 12)}</button></td>
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
        <td><button class="delete-row-btn" onclick="Phases.deleteWindowRow(${i})">${Icons.render('trash', 12)}</button></td>
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

    if (phaseId === 10) {
      const map = {
        'floor_prep_rows': 'p10-floor-prep-total',
        'flooring_int_rows': 'p10-flooring-total',
        'door_slab_rows': 'p10-door-slab-total',
        'trim_base_rows': 'p10-trim-base-total',
        'paint_prep_rows': 'p10-paint-prep-total',
        'paint_coat_rows': 'p10-paint-coat-total',
        'glass_rows': 'p10-glass-total',
        'fixture_int_rows': 'p10-fixture-total'
      };
      if (map[key]) {
        delete ph.data[`_manual_${map[key]}`];
      }
    }
    
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
        <label for="shower_pan_passed" style="font-size:13px;color:var(--text-secondary)">Shower Pan Test Passed ${Icons.render('check', 11)}</label>
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
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(4,'wire_variants',${i},'wire-rows',Phases.renderWireRows)">${Icons.render('trash', 12)}</button></td>
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
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(4,'blocking_rows',${i},'blocking-rows',Phases.renderBlockingRows)">${Icons.render('trash', 12)}</button></td>
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
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(6,'flooring_rows',${i},'flooring-rows',Phases.renderFlooringRows)">${Icons.render('trash', 12)}</button></td>
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
      <div style="margin:12px 0;display:flex;align-items:center;gap:10px"><input type="checkbox" id="appliance_circuit"> <label for="appliance_circuit" style="font-size:13px;color:var(--text-secondary)">Appliance Circuit Verified ${Icons.render('check', 11)}</label></div>
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
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(${phaseId},'${key}',${i},'${tbodyId}',()=>Phases.renderSimpleRows(${phaseId},'${key}','${tbodyId}',[${typeOptions.map(o=>`'${o}'`).join(',')}],'${typeLabel}'))">${Icons.render('trash', 12)}</button></td>
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
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(7,'countertop_rows',${i},'counter-rows',Phases.renderCounterRows)">${Icons.render('trash', 12)}</button></td>
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
          <span style="font-size:12px;color:var(--text-muted);display:inline-flex;gap:14px;align-items:center">
            <span style="display:inline-flex;gap:5px;align-items:center"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D9B68E"></span> Cosmetic</span>
            <span style="display:inline-flex;gap:5px;align-items:center"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C77966"></span> Functional</span>
            <span style="display:inline-flex;gap:5px;align-items:center"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#A85F50"></span> Structural</span>
          </span>
        </div>
        <button class="btn-primary btn-sm" onclick="Phases.showAddPunchModal()">+ Add Item</button>
      </div>
      <div class="kanban-board">
        <div class="kanban-col">
          <div class="kanban-col-title">Open <span class="kanban-col-count">${open.length}</span></div>
          ${open.map(p=>punchCard(p)).join('') || '<div style="color:var(--text-muted);font-size:12px;display:inline-flex;gap:6px;align-items:center">' + Icons.render('checkCircle', 12) + ' No open items</div>'}
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
        <div class="doc-slot-icon">${Icons.render('file', 20)}</div>
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
        <div class="stat-card-value" style="color:${totalOwed > 0 ? '#D9B68E' : 'var(--success)'}">${F.fmtFull(totalOwed)}</div>
        <div class="stat-card-sub">${totalOwed > 0 ? 'Payments pending' : `All settled ${Icons.render('check', 11)}`}</div>
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
            <div style="margin-bottom:12px;opacity:0.5;color:var(--text-muted)">${Icons.render('userCircle', 36)}</div>
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
                ${s.phone || s.email ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${s.phone ? Icons.render('phone', 10) + ' ' + s.phone : ''}${s.email ? Icons.render('mail', 10) + ' ' + s.email : ''}</div>` : ''}
              </td>
              <td style="font-size:12px">${s.phase || '—'}</td>
              <td class="mono" style="font-weight:600">${F.fmt(contract)}</td>
              <td>
                <div class="mono" style="color:var(--success);font-weight:600">${F.fmt(paid)}</div>
                <div style="height:3px;background:var(--charcoal-border);border-radius:2px;margin-top:4px;width:60px">
                  <div style="height:100%;background:var(--success);border-radius:2px;width:${paidPct}%;transition:width 0.4s"></div>
                </div>
              </td>
              <td class="mono" style="color:${remaining > 0 ? '#D9B68E' : 'var(--success)'}; font-weight:600">${F.fmt(remaining)}</td>
              <td style="font-size:11px">${retention > 0 ? `<span style="color:var(--text-muted)">${retention}%</span><br><span class="mono" style="font-size:10px;color:var(--steel-light)">${F.fmt(retentionAmt)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
              <td><span class="pay-status-badge ${paid >= contract && contract > 0 ? 'pay-paid' : paid > 0 ? 'pay-partial' : 'pay-pending'}">${paid >= contract && contract > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'}</span></td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn-icon-sm" onclick="Phases.showEditSubModal('${s.id}')" title="Edit">${Icons.render('pencil', 12)}</button>
                  <button class="delete-row-btn" onclick="Phases.deleteSub('${s.id}')" title="Delete">${Icons.render('trash', 12)}</button>
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
            ${['Phase 1 - Pre-Construction','Phase 2 - Site & Foundation','Phase 3 - Framing','Phase 4 - MEP Rough-In','Phase 5 - Insulation & Drywall','Phase 6 - Finishes','Phase 7 - Final MEP','Phase 8 - Punch List','Phase 9 - Interior'].map(p => `<option ${existing?.phase === p ? 'selected' : ''}>${p}</option>`).join('')}
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

  // ─── PHASE 9: Interior ────────────────────────────────────
  function renderPhase9(phase) {
    return `
    ${phaseHeader(phase)}

    ${phaseSectionCard('p10-flooring-prep', '9A · Flooring — Subfloor Preparation', `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Moisture readings and prep work that gate the finish floor install.</div>
      <table class="line-table">
        <thead><tr>
          <th>Zone / Room</th><th>Prep Type</th><th>Moisture %</th>
          <th>Prep Labor (hrs)</th><th>Labor Rate/hr</th>
          <th>Material Cost</th><th class="right">Line Total</th><th></th>
        </tr></thead>
        <tbody id="floor-prep-rows">${renderFloorPrepRows()}</tbody>
      </table>
      ${addRowBtn('Prep Zone', 'Phases.addFloorPrepRow()')}
      ${liveTotal('p10-floor-prep-total', 'Subfloor Prep Total')}
    `)}

    ${phaseSectionCard('p10-flooring-finish', '9A · Flooring — Finish Material Ledger', `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">One row per finish-flooring product. Waste % is auto-applied to coverage.</div>
      <table class="line-table">
        <thead><tr>
          <th>Zone</th><th>Material</th><th>Plank W (in)</th><th>Wear (mil)</th>
          <th>Coverage (sq ft)</th><th>Waste %</th>
          <th>Unit Price/sf</th><th>Labor/sf</th>
          <th>Underlay/sf</th><th class="right">Total</th><th></th>
        </tr></thead>
        <tbody id="flooring-int-rows">${renderFlooringIntRows()}</tbody>
      </table>
      ${addRowBtn('Flooring Zone', 'Phases.addFlooringIntRow()')}
      ${fieldRow(3,
        field('Transition Strips (count)', monoInp('trans_strips_count','0')),
        field('Transition Price/each', currInp('trans_strip_price')),
        field('Grout Color Code', inp('grout_color_code', 'text', 'e.g. Mapei #38'))
      )}
      ${liveTotal('p10-flooring-total', 'Finish Flooring Total')}
    `)}

    ${phaseSectionCard('p10-cab-box', '9B · Cabinetry — Box, Door & Construction Specs', `
      ${fieldRow(2,
        field('Cabinet Class', sel('cab_class', ['Stock / RTA','Semi-Custom','Full Custom'])),
        field('Box Core Material', sel('cab_core', ['1/2" Plywood','3/4" Plywood','Furniture Board / MDF']))
      )}
      ${fieldRow(2,
        field('Door Profile', sel('door_profile', ['Shaker','Flat Panel / Slab','Raised Panel','Glass-Front'])),
        field('Door Finish', sel('cab_finish', ['Painted','Stained Wood','Thermofoil','Natural Veneer','Laminate']))
      )}
      ${fieldRow(3,
        field('Base Cabinet LF', monoInp('cab_base_lf','0')),
        field('Upper Cabinet LF', monoInp('cab_upper_lf','0')),
        field('Pantry / Tall LF', monoInp('cab_pantry_lf','0'))
      )}
      ${fieldRow(3,
        field('Base $/LF', currInp('cab_base_rate')),
        field('Upper $/LF', currInp('cab_upper_rate')),
        field('Pantry $/LF', currInp('cab_pantry_rate'))
      )}
      ${fieldRow(2,
        field('Cabinet Install Rate/LF', currInp('cab_install_rate')),
        field('Millwork Lump (crown, fillers, panels)', currInp('millwork_lump'))
      )}
      ${liveTotal('p10-cab-box-total', 'Cabinet Box & Doors Total')}
    `)}

    ${phaseSectionCard('p10-cab-hw', '9B · Cabinetry — Hardware & Mechanisms', `
      ${fieldRow(2,
        field('Drawer Glide Spec', sel('glide_spec', ['Under-mount Soft-Close','Side-mount Standard','Push-to-Open'])),
        field('Hinge Spec', sel('hinge_spec', ['6-way Adjustable Concealed','Exposed Barrel','Soft-Close Concealed']))
      )}
      ${fieldRow(2,
        field('Pulls & Knobs (count)', monoInp('pulls_knobs_count','0')),
        field('Pull/Knob Unit Price', currInp('pull_unit_price'))
      )}
      ${fieldRow(2,
        field('Drawer Count (boxes)', monoInp('drawer_box_count','0')),
        field('Drawer Box Unit Price', currInp('drawer_box_price'))
      )}
      ${fieldRow(2,
        field('Soft-Close Adapter $/unit', currInp('softclose_price')),
        field('Hinge Qty (3 per door typical)', monoInp('hinge_qty','0'))
      )}
      ${field('Hinge Unit Price', currInp('hinge_unit_price'))}
      ${liveTotal('p10-cab-hw-total', 'Cabinet Hardware Total')}
    `)}

    ${phaseSectionCard('p10-doors-slab', '9C · Interior Doors — Slabs & Jambs', `
      <table class="line-table">
        <thead><tr>
          <th>Location</th><th>Door Style</th><th>Core Type</th>
          <th>Jamb Width</th><th>Qty</th>
          <th>Slab Price</th><th>Jamb Set</th><th>Install</th>
          <th class="right">Total</th><th></th>
        </tr></thead>
        <tbody id="door-slab-rows">${renderDoorSlabRows()}</tbody>
      </table>
      ${addRowBtn('Door', 'Phases.addDoorSlabRow()')}
      ${fieldRow(2,
        field('Door Swing Schedule Verified', `<select class="field-select" id="swing_verified"><option value="false">Pending</option><option value="true">Verified</option></select>`),
        field('Total Door Count (auto)', `<input class="field-input mono" type="text" id="door_count_total" readonly style="background:var(--charcoal-mid)">`)
      )}
      ${liveTotal('p10-door-slab-total', 'Doors — Slabs & Jambs Total')}
    `)}

    ${phaseSectionCard('p10-doors-hw', '9C · Interior Doors — Hardware', `
      ${fieldRow(2,
        field('Hinge Finish', sel('hinge_finish', ['Matte Black','Brushed Nickel','Satin Brass','Oil-Rubbed Bronze','Chrome','Polished Brass'])),
        field('Hinge Price (per hinge)', currInp('hinge_finish_price'))
      )}
      ${fieldRow(3,
        field('Passage Sets (count)', monoInp('passage_count','0')),
        field('Privacy Sets (count)', monoInp('privacy_count','0')),
        field('Dummy Sets (count)', monoInp('dummy_count','0'))
      )}
      ${fieldRow(3,
        field('Passage $/set', currInp('passage_price')),
        field('Privacy $/set', currInp('privacy_price')),
        field('Dummy $/set', currInp('dummy_price'))
      )}
      ${fieldRow(3,
        field('Door Stops (count)', monoInp('door_stops_count','0')),
        field('Stop Type', sel('stop_type', ['Baseboard-mount','Hinge-pin','Floor-mount','Wall-mount'])),
        field('Stop Unit Price', currInp('door_stop_price'))
      )}
      ${liveTotal('p10-door-hw-total', 'Door Hardware Total')}
    `)}

    ${phaseSectionCard('p10-trim-base', '9D · Trim Carpentry — Base, Casing & Specialty Millwork', `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Baseboard & casing by linear foot, with waste and mitered-corner allowances.</div>
      <table class="line-table">
        <thead><tr>
          <th>Profile / Style</th><th>Height (in)</th><th>Linear Ft</th>
          <th>Price/LF</th><th>Labor/LF</th>
          <th>Corner Count</th><th>$/corner</th>
          <th class="right">Total</th><th></th>
        </tr></thead>
        <tbody id="trim-base-rows">${renderTrimBaseRows()}</tbody>
      </table>
      ${addRowBtn('Baseboard Profile', 'Phases.addTrimBaseRow()')}
      ${fieldRow(2,
        field('Door Casing Width (in)', monoInp('casing_width','3.5')),
        field('Window Casing Style', sel('window_casing_style', ['Picture Frame','Stool & Apron','Craftsman','Modern Flat']))
      )}
      ${fieldRow(3,
        field('Crown Molding LF', monoInp('crown_lf','0')),
        field('Crown $/LF', currInp('crown_price_lf')),
        field('Crown Labor/LF', currInp('crown_labor_lf'))
      )}
      ${fieldRow(3,
        field('Wainscoting (sq ft)', monoInp('wainscot_sqft','0')),
        field('Wainscot $/sqft', currInp('wainscot_price')),
        field('Wainscot Labor/sqft', currInp('wainscot_labor'))
      )}
      ${liveTotal('p10-trim-base-total', 'Trim & Millwork Total')}
    `)}

    ${phaseSectionCard('p10-trim-stair', '9D · Trim Carpentry — Stair Components', `
      ${fieldRow(3,
        field('Stair Tread Material', sel('stair_tread', ['Oak','Pine','Maple','MDF','Ipe'])),
        field('Tread Count', monoInp('tread_count','0')),
        field('Tread Unit Price', currInp('tread_price'))
      )}
      ${fieldRow(3,
        field('Riser Count', monoInp('riser_count','0')),
        field('Riser Unit Price', currInp('riser_price')),
        field('Stair Labor (lump)', currInp('stair_labor_lump'))
      )}
      ${fieldRow(2,
        field('Baluster Style', sel('baluster_style', ['Iron Spindles','Wood Turned','Glass Panels','Box Newel + Plain','Stainless Cable'])),
        field('Baluster Count', monoInp('baluster_count','0'))
      )}
      ${fieldRow(2,
        field('Baluster Unit Price', currInp('baluster_price')),
        field('Newel Post Count', monoInp('newel_count','0'))
      )}
      ${field('Newel Post Unit Price', currInp('newel_price'))}
      ${liveTotal('p10-trim-stair-total', 'Stair Components Total')}
    `)}

    ${phaseSectionCard('p10-paint-prep', '9E · Paint — Surface Preparation', `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Joint compound, caulking, sanding — the prep that determines finish quality.</div>
      <table class="line-table">
        <thead><tr>
          <th>Surface</th><th>Prep Task</th>
          <th>Caulk Tubes</th><th>Wood Filler Tubs</th>
          <th>Sandpaper / Discs</th><th>Tape & Plastic</th>
          <th class="right">Line Cost</th><th></th>
        </tr></thead>
        <tbody id="paint-prep-rows">${renderPaintPrepRows()}</tbody>
      </table>
      ${addRowBtn('Prep Surface', 'Phases.addPaintPrepRow()')}
      ${fieldRow(2,
        field('Primer Type', sel('primer_type', ['PVA Drywall Primer','Stain-Blocking Oil','High-Build','Bonding'])),
        field('Primer Coverage (sq ft/gal)', monoInp('primer_coverage','300'))
      )}
      ${field('Primer Gallons Needed (auto)', `<input class="field-input mono" type="text" id="primer_gallons_auto" readonly style="background:var(--charcoal-mid)">`)}
      ${field('Primer Price/Gallon', currInp('primer_price_gal'))}
      ${liveTotal('p10-paint-prep-total', 'Paint Prep Total')}
    `)}

    ${phaseSectionCard('p10-paint-coat', '9E · Paint — Coatings & Coverage', `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Coverage auto-computed from sq ft input.</div>
      <table class="line-table">
        <thead><tr>
          <th>Surface Type</th><th>Sq Ft</th><th>Coats</th>
          <th>Color Code / Sheen</th><th>Coverage (sqft/gal)</th>
          <th>$/Gallon</th><th>Labor/sqft</th>
          <th class="right">Total</th><th></th>
        </tr></thead>
        <tbody id="paint-coat-rows">${renderPaintCoatRows()}</tbody>
      </table>
      ${addRowBtn('Coating Surface', 'Phases.addPaintCoatRow()')}
      ${field('Coats Required (1/2/3)', sel('coats_required', ['1','2','3']))}
      ${liveTotal('p10-paint-coat-total', 'Paint Coatings Total')}
    `)}

    ${phaseSectionCard('p10-closet', '9F · Custom Additions — Closet Systems', `
      ${fieldRow(2,
        field('Closet System Type', sel('closet_type', ['Wire Shelving','Melamine Built-ins','Custom Wood','Modular (ClosetMaid / Elfa)'])),
        field('Linear Shelving Feet', monoInp('closet_lf','0'))
      )}
      ${fieldRow(2,
        field('Price per Linear Foot', currInp('closet_rate_lf')),
        field('Install Rate per LF', currInp('closet_install_lf'))
      )}
      ${fieldRow(3,
        field('Drawer Units (count)', monoInp('closet_drawer_count','0')),
        field('Drawer Unit Price', currInp('closet_drawer_price')),
        field('Accessories (basket, tie-rack, valet)', currInp('closet_accessories_lump'))
      )}
      ${liveTotal('p10-closet-total', 'Closet Systems Total')}
    `)}

    ${phaseSectionCard('p10-glass', '9F · Custom Additions — Glass, Mirrors & Enclosures', `
      <table class="line-table">
        <thead><tr>
          <th>Item / Location</th><th>Type</th><th>Width (in)</th><th>Height (in)</th>
          <th>Qty</th><th>Glass Type</th><th>Unit Price</th><th>Install</th>
          <th class="right">Total</th><th></th>
        </tr></thead>
        <tbody id="glass-rows">${renderGlassRows()}</tbody>
      </table>
      ${addRowBtn('Glass Item', 'Phases.addGlassRow()')}
      ${fieldRow(2,
        field('Shower Enclosure Type', sel('shower_type', ['Frameless Heavy Glass','Semi-Frameless','Framed','Sliding By-Pass'])),
        field('Shower Enclosure (lump)', currInp('shower_lump'))
      )}
      ${fieldRow(2,
        field('Vanity Mirror Sq Ft', monoInp('vanity_mirror_sqft','0')),
        field('Mirror Price per Sq Ft', currInp('mirror_price_sqft'))
      )}
      ${liveTotal('p10-glass-total', 'Glass & Mirrors Total')}
    `)}

    ${phaseSectionCard('p10-fixtures', '9F · Custom Additions — Misc Fixtures & Built-ins', `
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Anything that doesn't fit elsewhere: fireplace surrounds, window seats, built-in benches, etc.</div>
      <table class="line-table">
        <thead><tr>
          <th>Item / Description</th><th>Vendor / Source</th>
          <th>Qty</th><th>Cost Confidence</th>
          <th>Unit Price</th><th>Labor</th>
          <th class="right">Total</th><th></th>
        </tr></thead>
        <tbody id="fixture-rows">${renderFixtureIntRows()}</tbody>
      </table>
      ${addRowBtn('Fixture / Built-in', 'Phases.addFixtureIntRow()')}
      ${liveTotal('p10-fixture-total', 'Custom Fixtures Total')}
    `)}`;
  }

  // ── Phase 9 row renderers ──────────────────────────────────

  function renderFloorPrepRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.floor_prep_rows) || [{}];
    return rows.map((r, i) => `
      <tr id="fprow-${i}">
        <td class="input-td"><input type="text" value="${r.zone||''}" placeholder="Living Room" oninput="Phases.updateGenRowData(9,'floor_prep_rows',${i},'zone',this.value)" style="width:110px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'floor_prep_rows',${i},'prep_type',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.prep_type==='Self-Leveling Compound'?'selected':''}>Self-Leveling Compound</option>
          <option ${r.prep_type==='Plywood Overlay'?'selected':''}>Plywood Overlay</option>
          <option ${r.prep_type==='Crack Isolation Membrane'?'selected':''}>Crack Isolation Membrane</option>
          <option ${r.prep_type==='Vapor Barrier'?'selected':''}>Vapor Barrier</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.moisture_pct||''}" step="0.1" min="0" max="100" placeholder="0.0" oninput="Phases.updateGenRowData(9,'floor_prep_rows',${i},'moisture_pct',this.value)" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor_hours||''}" min="0" step="0.5" placeholder="0" oninput="Phases.updateGenRowData(9,'floor_prep_rows',${i},'labor_hours',this.value);Financial.scheduleUpdate()" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor_rate||''}" min="0" placeholder="0" oninput="Phases.updateGenRowData(9,'floor_prep_rows',${i},'labor_rate',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.material_cost||''}" min="0" placeholder="0" oninput="Phases.updateGenRowData(9,'floor_prep_rows',${i},'material_cost',this.value);Financial.scheduleUpdate()" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(F.add(F.mul(r.labor_hours, r.labor_rate), r.material_cost))}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'floor_prep_rows',${i},'floor-prep-rows',Phases.renderFloorPrepRows)">${Icons.render('trash', 12)}</button></td>
      </tr>`).join('');
  }
  function addFloorPrepRow() { addGenRow(9, 'floor_prep_rows', 'floor-prep-rows', renderFloorPrepRows); }

  function renderFlooringIntRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.flooring_int_rows) || [{}];
    return rows.map((r, i) => {
      const coverage = F.parseNum(r.coverage_sqft);
      const wastePct = F.parseNum(r.waste_pct) / 100;
      const adjCoverage = coverage * (1 + wastePct);
      const total = F.add(
        F.mul(adjCoverage, r.price),
        F.mul(coverage, r.labor_rate),
        F.mul(coverage, r.underlay_price)
      );
      return `
      <tr id="fintrow-${i}">
        <td class="input-td"><input type="text" value="${r.zone||''}" placeholder="Master BR" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'zone',this.value)" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'flooring_int_rows',${i},'material',this.value);Financial.scheduleUpdate()" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px;min-width:130px">
          <option ${r.material==='Solid Hardwood'?'selected':''}>Solid Hardwood</option>
          <option ${r.material==='Engineered Wood'?'selected':''}>Engineered Wood</option>
          <option ${r.material==='LVP'?'selected':''}>LVP</option>
          <option ${r.material==='LVT'?'selected':''}>LVT</option>
          <option ${r.material==='Porcelain Tile'?'selected':''}>Porcelain Tile</option>
          <option ${r.material==='Ceramic Tile'?'selected':''}>Ceramic Tile</option>
          <option ${r.material==='Broadloom Carpet'?'selected':''}>Broadloom Carpet</option>
          <option ${r.material==='Carpet Tile'?'selected':''}>Carpet Tile</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.plank_width||''}" min="0" step="0.125" placeholder="0" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'plank_width',this.value)" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.wear_layer||''}" min="0" placeholder="0" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'wear_layer',this.value)" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.coverage_sqft||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'coverage_sqft',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.waste_pct||10}" min="0" max="50" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'waste_pct',this.value);Financial.scheduleUpdate()" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'price',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor_rate||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'labor_rate',this.value);Financial.scheduleUpdate()" style="width:75px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.underlay_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'flooring_int_rows',${i},'underlay_price',this.value);Financial.scheduleUpdate()" style="width:75px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(total)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'flooring_int_rows',${i},'flooring-int-rows',Phases.renderFlooringIntRows)">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addFlooringIntRow() { addGenRow(9, 'flooring_int_rows', 'flooring-int-rows', renderFlooringIntRows); }

  function renderDoorSlabRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.door_slab_rows) || [{}];
    return rows.map((r, i) => {
      const qty = F.parseNum(r.qty);
      const lineTotal = F.add(
        F.mul(qty, r.slab_price),
        F.mul(qty, r.jamb_set_price),
        F.mul(qty, r.install_price)
      );
      return `
      <tr id="dsrow-${i}">
        <td class="input-td"><input type="text" value="${r.location||''}" placeholder="Bedroom 2" oninput="Phases.updateGenRowData(9,'door_slab_rows',${i},'location',this.value)" style="width:100px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'door_slab_rows',${i},'style',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.style==='Flush'?'selected':''}>Flush</option>
          <option ${r.style==='1-Panel'?'selected':''}>1-Panel</option>
          <option ${r.style==='2-Panel'?'selected':''}>2-Panel</option>
          <option ${r.style==='5-Panel'?'selected':''}>5-Panel</option>
          <option ${r.style==='French'?'selected':''}>French</option>
          <option ${r.style==='Barn'?'selected':''}>Barn</option>
        </select></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'door_slab_rows',${i},'core',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.core==='Solid Core'?'selected':''}>Solid Core</option>
          <option ${r.core==='Hollow Core'?'selected':''}>Hollow Core</option>
          <option ${r.core==='Solid Wood'?'selected':''}>Solid Wood</option>
          <option ${r.core==='MDF'?'selected':''}>MDF</option>
        </select></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'door_slab_rows',${i},'jamb_width',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.jamb_width==='4-9/16'?'selected':''}>4-9/16</option>
          <option ${r.jamb_width==='6-9/16'?'selected':''}>6-9/16</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.qty||1}" min="1" oninput="Phases.updateGenRowData(9,'door_slab_rows',${i},'qty',this.value);Phases.recomputeDoorCount();Financial.scheduleUpdate()" style="width:50px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.slab_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'door_slab_rows',${i},'slab_price',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.jamb_set_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'door_slab_rows',${i},'jamb_set_price',this.value);Financial.scheduleUpdate()" style="width:75px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.install_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'door_slab_rows',${i},'install_price',this.value);Financial.scheduleUpdate()" style="width:75px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(lineTotal)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'door_slab_rows',${i},'door-slab-rows',Phases.renderDoorSlabRows);Phases.recomputeDoorCount()">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addDoorSlabRow() { addGenRow(9, 'door_slab_rows', 'door-slab-rows', renderDoorSlabRows); }
  function recomputeDoorCount() {
    setTimeout(() => {
      const proj = State.getCurrentProject();
      if (!proj) return;
      const ph = proj.phases.find(p => p.id === 9);
      const rows = (ph && ph.data.door_slab_rows) || [];
      const total = rows.reduce((s, r) => s + F.parseNum(r.qty), 0);
      const el = document.getElementById('door_count_total');
      if (el) el.value = total;
    }, 0);
  }

  function renderTrimBaseRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.trim_base_rows) || [{}];
    return rows.map((r, i) => {
      const lf = F.parseNum(r.lf);
      const total = F.add(
        F.mul(lf, r.price_lf),
        F.mul(lf, r.labor_lf),
        F.mul(F.parseNum(r.corners), r.corner_price)
      );
      return `
      <tr id="tbrow-${i}">
        <td class="input-td"><input type="text" value="${r.profile||''}" placeholder="5\" Colonial" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'profile',this.value)" style="width:110px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.height_in||''}" min="0" step="0.25" placeholder="5" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'height_in',this.value)" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.lf||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'lf',this.value);Financial.scheduleUpdate()" style="width:70px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.price_lf||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'price_lf',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor_lf||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'labor_lf',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.corners||0}" min="0" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'corners',this.value);Financial.scheduleUpdate()" style="width:60px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.corner_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'trim_base_rows',${i},'corner_price',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(total)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'trim_base_rows',${i},'trim-base-rows',Phases.renderTrimBaseRows)">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addTrimBaseRow() { addGenRow(9, 'trim_base_rows', 'trim-base-rows', renderTrimBaseRows); }

  function renderPaintPrepRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.paint_prep_rows) || [{}];
    return rows.map((r, i) => {
      const total = F.add(
        F.mul(r.caulk_tubes, 8),  // avg ₹8 per tube (placeholder)
        F.mul(r.filler_tubs, 25),
        F.parseNum(r.sandpaper_cost),
        F.parseNum(r.tape_plastic_cost)
      );
      return `
      <tr id="pprow-${i}">
        <td class="input-td"><input type="text" value="${r.surface||''}" placeholder="Living Room Walls" oninput="Phases.updateGenRowData(9,'paint_prep_rows',${i},'surface',this.value)" style="width:130px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'paint_prep_rows',${i},'task',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.task==='Caulk Joints'?'selected':''}>Caulk Joints</option>
          <option ${r.task==='Fill Nail Holes'?'selected':''}>Fill Nail Holes</option>
          <option ${r.task==='Skim Coat'?'selected':''}>Skim Coat</option>
          <option ${r.task==='Sand & Smooth'?'selected':''}>Sand & Smooth</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.caulk_tubes||0}" min="0" oninput="Phases.updateGenRowData(9,'paint_prep_rows',${i},'caulk_tubes',this.value);Financial.scheduleUpdate()" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.filler_tubs||0}" min="0" oninput="Phases.updateGenRowData(9,'paint_prep_rows',${i},'filler_tubs',this.value);Financial.scheduleUpdate()" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.sandpaper_cost||''}" min="0" placeholder="0" oninput="Phases.updateGenRowData(9,'paint_prep_rows',${i},'sandpaper_cost',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.tape_plastic_cost||''}" min="0" placeholder="0" oninput="Phases.updateGenRowData(9,'paint_prep_rows',${i},'tape_plastic_cost',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(total)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'paint_prep_rows',${i},'paint-prep-rows',Phases.renderPaintPrepRows)">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addPaintPrepRow() { addGenRow(9, 'paint_prep_rows', 'paint-prep-rows', renderPaintPrepRows); }

  function renderPaintCoatRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.paint_coat_rows) || [{}];
    return rows.map((r, i) => {
      const sqft = F.parseNum(r.sqft);
      const coats = F.parseNum(r.coats);
      const coverage = F.parseNum(r.coverage);
      const gallons = coverage > 0 ? (sqft * coats) / coverage : 0;
      const total = F.add(
        F.mul(gallons, r.price_per_gal),
        F.mul(sqft, r.labor_sqft)
      );
      return `
      <tr id="pcrow-${i}">
        <td class="input-td"><input type="text" value="${r.surface||''}" placeholder="Walls / Ceiling / Trim" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'surface',this.value)" style="width:130px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.sqft||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'sqft',this.value);Phases.recomputePrimerGallons();Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.coats||2}" min="1" max="3" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'coats',this.value);Financial.scheduleUpdate()" style="width:50px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="text" value="${r.color_code||''}" placeholder="SW 7015 / Eggshell" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'color_code',this.value)" style="width:120px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px"></td>
        <td class="input-td"><input type="number" value="${r.coverage||350}" min="0" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'coverage',this.value);Financial.scheduleUpdate()" style="width:75px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.price_per_gal||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'price_per_gal',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor_sqft||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'paint_coat_rows',${i},'labor_sqft',this.value);Financial.scheduleUpdate()" style="width:75px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(total)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'paint_coat_rows',${i},'paint-coat-rows',Phases.renderPaintCoatRows);Phases.recomputePrimerGallons()">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addPaintCoatRow() { addGenRow(9, 'paint_coat_rows', 'paint-coat-rows', renderPaintCoatRows); }
  function recomputePrimerGallons() {
    setTimeout(() => {
      const proj = State.getCurrentProject();
      if (!proj) return;
      const ph = proj.phases.find(p => p.id === 9);
      const totalSqft = ((ph && ph.data.paint_coat_rows) || []).reduce((s, r) => s + F.parseNum(r.sqft), 0);
      const coverage = F.parseNum((ph && ph.data.primer_coverage) || 300);
      const gallons = coverage > 0 ? Math.ceil(totalSqft / coverage) : 0;
      const el = document.getElementById('primer_gallons_auto');
      if (el) el.value = gallons;
    }, 0);
  }

  function renderGlassRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.glass_rows) || [{}];
    return rows.map((r, i) => {
      const qty = F.parseNum(r.qty);
      const total = F.add(
        F.mul(qty, r.unit_price),
        F.mul(qty, r.install)
      );
      return `
      <tr id="grow-${i}">
        <td class="input-td"><input type="text" value="${r.location||''}" placeholder="Master Shower" oninput="Phases.updateGenRowData(9,'glass_rows',${i},'location',this.value)" style="width:120px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'glass_rows',${i},'type',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.type==='Shower Enclosure'?'selected':''}>Shower Enclosure</option>
          <option ${r.type==='Vanity Mirror'?'selected':''}>Vanity Mirror</option>
          <option ${r.type==='Wall Mirror'?'selected':''}>Wall Mirror</option>
          <option ${r.type==='Glass Partition'?'selected':''}>Glass Partition</option>
          <option ${r.type==='Backsplash Glass'?'selected':''}>Backsplash Glass</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.width||''}" min="0" step="0.25" placeholder="0" oninput="Phases.updateGenRowData(9,'glass_rows',${i},'width',this.value)" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.height||''}" min="0" step="0.25" placeholder="0" oninput="Phases.updateGenRowData(9,'glass_rows',${i},'height',this.value)" style="width:55px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.qty||1}" min="1" oninput="Phases.updateGenRowData(9,'glass_rows',${i},'qty',this.value);Financial.scheduleUpdate()" style="width:50px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'glass_rows',${i},'glass_type',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.glass_type==='Clear Tempered'?'selected':''}>Clear Tempered</option>
          <option ${r.glass_type==='Frosted'?'selected':''}>Frosted</option>
          <option ${r.glass_type==='Low-Iron'?'selected':''}>Low-Iron</option>
          <option ${r.glass_type==='Bronze Tint'?'selected':''}>Bronze Tint</option>
          <option ${r.glass_type==='Rain'?'selected':''}>Rain</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.unit_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'glass_rows',${i},'unit_price',this.value);Financial.scheduleUpdate()" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.install||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'glass_rows',${i},'install',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(total)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'glass_rows',${i},'glass-rows',Phases.renderGlassRows)">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addGlassRow() { addGenRow(9, 'glass_rows', 'glass-rows', renderGlassRows); }

  function renderFixtureIntRows() {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const ph = proj.phases.find(p => p.id === 9);
    const rows = (ph && ph.data.fixture_int_rows) || [{}];
    return rows.map((r, i) => {
      const qty = F.parseNum(r.qty);
      const total = F.add(
        F.mul(qty, r.unit_price),
        F.parseNum(r.labor)
      );
      return `
      <tr id="fixrow-${i}">
        <td class="input-td"><input type="text" value="${r.item||''}" placeholder="Fireplace Surround" oninput="Phases.updateGenRowData(9,'fixture_int_rows',${i},'item',this.value)" style="width:140px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="text" value="${r.vendor||''}" placeholder="Vendor / Source" oninput="Phases.updateGenRowData(9,'fixture_int_rows',${i},'vendor',this.value)" style="width:110px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.qty||1}" min="1" oninput="Phases.updateGenRowData(9,'fixture_int_rows',${i},'qty',this.value);Financial.scheduleUpdate()" style="width:50px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><select onchange="Phases.updateGenRowData(9,'fixture_int_rows',${i},'confidence',this.value)" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-size:11px">
          <option ${r.confidence==='Estimated'?'selected':''}>Estimated</option>
          <option ${r.confidence==='Quoted'?'selected':''}>Quoted</option>
          <option ${r.confidence==='Locked-PO'?'selected':''}>Locked-PO</option>
          <option ${r.confidence==='Invoiced'?'selected':''}>Invoiced</option>
        </select></td>
        <td class="input-td"><input type="number" value="${r.unit_price||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'fixture_int_rows',${i},'unit_price',this.value);Financial.scheduleUpdate()" style="width:90px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="input-td"><input type="number" value="${r.labor||''}" min="0" step="any" placeholder="0" oninput="Phases.updateGenRowData(9,'fixture_int_rows',${i},'labor',this.value);Financial.scheduleUpdate()" style="width:80px;background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:6px;border-radius:4px;font-family:var(--font-mono);font-size:12px"></td>
        <td class="computed">${F.fmt(total)}</td>
        <td><button class="delete-row-btn" onclick="Phases.delGenRow(9,'fixture_int_rows',${i},'fixture-rows',Phases.renderFixtureIntRows)">${Icons.render('trash', 12)}</button></td>
      </tr>`;
    }).join('');
  }
  function addFixtureIntRow() { addGenRow(9, 'fixture_int_rows', 'fixture-rows', renderFixtureIntRows); }

  return {
    toggleSection, setCompletion, phaseHeader, iconFor,
    addPermitRow, deletePermitRow, updatePermit,
    // 9 trade-based construction phases
    renderTradePhase1, renderTradePhase2, renderTradePhase3,
    renderTradePhase4, renderTradePhase5, renderTradePhase6,
    renderTradePhase7, renderTradePhase8, renderTradePhase9,
    // Interior (phase 10) — uses the same renderer as before
    renderPhase9,
    renderPhaseHub, renderInteriorHub,
    filterPhaseHtmlBySections, renderCategoryMetaCard,
    CATEGORY_REGISTRY, categoryStats,
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
    addFloorPrepRow, renderFloorPrepRows,
    addFlooringIntRow, renderFlooringIntRows,
    addDoorSlabRow, renderDoorSlabRows, recomputeDoorCount,
    addTrimBaseRow, renderTrimBaseRows,
    addPaintPrepRow, renderPaintPrepRows,
    addPaintCoatRow, renderPaintCoatRows, recomputePrimerGallons,
    addGlassRow, renderGlassRows,
    addFixtureIntRow, renderFixtureIntRows,
    showAddPunchModal, savePunchItem, cyclePunchStatus,
    showAddSubModal, showEditSubModal, saveSub, deleteSub,
    // Per-input card design (trade phases 1-9)
    updateInputField, renderSingleInputCard, getInputCard, updatePhase10ManualTotal
  };
})();
