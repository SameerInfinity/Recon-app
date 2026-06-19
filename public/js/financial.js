/* ═══════════════════════════════════════════
   FINANCIAL.JS — Calculation Engine v3
   Trade-based phases (1-10). No duplicate
   function names. Safe null-checks throughout.
   ═══════════════════════════════════════════ */

const Financial = (() => {
  let currency = 'INR';
  let updateTimer = null;

  // ── Formatting ──────────────────────────────────────────
  function fmt(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) return currency === 'INR' ? '₹0' : '$0';
    const n = parseFloat(amount) || 0;
    const sym = currency === 'INR' ? '₹' : '$';
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    // M-03: Handle negative numbers — show "-₹1,23,456" not "₹-1,23,456"
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 10000000) {
      const v = abs / 10000000;
      return sign + sym + (v % 1 === 0 ? v.toFixed(0) : parseFloat(v.toFixed(2))) + ' Cr';
    }
    if (abs >= 100000) {
      const v = abs / 100000;
      return sign + sym + (v % 1 === 0 ? v.toFixed(0) : parseFloat(v.toFixed(2))) + ' L';
    }
    return sign + sym + abs.toLocaleString(locale, { maximumFractionDigits: 0 });
  }

  function fmtFull(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) return currency === 'INR' ? '₹0' : '$0';
    const n = parseFloat(amount) || 0;
    const sym = currency === 'INR' ? '₹' : '$';
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    // M-03: Handle negative numbers — show "-₹1,23,456" not "₹-1,23,456"
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    return sign + sym + abs.toLocaleString(locale, { maximumFractionDigits: 0 });
  }

  function parseNum(val) {
    if (val === '' || val === null || val === undefined) return 0;
    return parseFloat(String(val).replace(/[,₹$]/g, '')) || 0;
  }

  function mul(a, b) { return parseNum(a) * parseNum(b); }
  function add(...args) { return args.reduce((s, v) => s + parseNum(v), 0); }

  function sumRows(rows, fn) {
    if (!rows || !Array.isArray(rows)) return 0;
    return rows.reduce((s, r) => s + (fn(r) || 0), 0);
  }

  // ── Safe qty×rate helper — never crashes on undefined card data ──
  const qr = (d, qtyKey, rateKey) => {
    try {
      if (!d || typeof d !== 'object') return 0;
      if (d._manual_total !== undefined && d._manual_total !== '') return parseNum(d._manual_total);
      return (parseNum(d[qtyKey]) || 0) * (parseNum(d[rateKey]) || 0);
    } catch { return 0; }
  };
  // Direct-amount helper
  const amt = (d, key) => {
    if (!d || typeof d !== 'object') return 0;
    if (d._manual_total !== undefined && d._manual_total !== '') return parseNum(d._manual_total);
    return parseNum(d[key]) || 0;
  };

  // ── Phase Calculations (Trade-Based) ─────────────────────
  // One function per phase. No duplicates. All use qr/amt helpers
  // that safely return 0 if the card data object is undefined.

  // Phase 1: Civil Work
  function calcPhase1(d) {
    return add(
      qr(d.iron,         'qty_kg',   'rate_per_kg'),
      qr(d.sand,         'qty_brass','rate_per_brass'),
      qr(d.cement,       'qty_bags', 'rate_per_bag'),
      qr(d.stone,        'qty_brass','rate_per_brass'),
      qr(d.binding_wire, 'qty_kg',   'rate_per_kg'),
      qr(d.adhesive,     'qty_ltr',  'rate_per_ltr'),
      amt(d.other_material, 'amount'),
      amt(d.thekedar,       'amount'),
    );
  }

  // Phase 2: Tiles & Flooring
  function calcPhase2(d) {
    return add(
      qr(d.floor_tiles,     'area_sqft',  'rate_per_sqft'),
      qr(d.kitchen_dado,    'area_sqft',  'rate_per_sqft'),
      qr(d.staircase_tiles, 'step_count', 'rate_per_step'),
      mul(d.tile_chemical?.qty,  d.tile_chemical?.rate),
      add(
        mul(d.tile_sand_cement?.sand_qty_brass, d.tile_sand_cement?.sand_rate),
        mul(d.tile_sand_cement?.cement_bags,    d.tile_sand_cement?.cement_rate)
      ),
      mul(d.tile_labor?.rate_per_sqft, d.tile_labor?.area_sqft),
    );
  }

  // Phase 3: Painting
  function calcPhase3(d) {
    return add(
      qr(d.putty,      'qty_kg',  'rate_per_kg'),
      qr(d.primer_ext, 'qty_ltr', 'rate_per_ltr'),
      qr(d.primer_int, 'qty_ltr', 'rate_per_ltr'),
      qr(d.paint_ext,  'qty_ltr', 'rate_per_ltr'),
      qr(d.paint_int,  'qty_ltr', 'rate_per_ltr'),
      qr(d.oil_paint,  'qty_ltr', 'rate_per_ltr'),
      amt(d.painter_labor, 'amount'),
    );
  }

  // Phase 4: Electrical Work
  function calcPhase4(d) {
    return add(
      qr(d.switches,  'qty',     'rate'),
      qr(d.wires,     'qty_mtr', 'rate_per_mtr'),
      qr(d.conduits,  'qty_mtr', 'rate_per_mtr'),
      qr(d.lights,    'qty',     'rate'),
      qr(d.metering,  'qty',     'rate'),
      mul(d.electrician_labor?.qty, d.electrician_labor?.rate),
    );
  }

  // Phase 5: Furniture & Fabrication
  function calcPhase5(d) {
    return add(
      qr(d.door_frames,  'qty',        'rate'),
      qr(d.flush_doors,  'qty',        'rate'),
      qr(d.windows,      'qty',        'rate'),
      qr(d.glass_railing,'length_rft', 'rate_per_rft'),
      qr(d.hardware,     'qty',        'rate'),
      amt(d.fab_labor, 'amount'),
    );
  }

  // Phase 6: Plumbing Work
  function calcPhase6(d) {
    return add(
      qr(d.ext_pipes,    'qty_mtr', 'rate_per_mtr'),
      qr(d.ext_fittings, 'qty',     'rate'),
      add(
        mul(d.drainage_lines?.length_mtr, d.drainage_lines?.rate_per_mtr),
        mul(d.drainage_lines?.manholes, d.drainage_lines?.manhole_rate)
      ),
      qr(d.int_pipes,    'qty_mtr', 'rate_per_mtr'),
      qr(d.int_fittings, 'qty',     'rate'),
      qr(d.taps,         'qty',     'rate'),
      qr(d.bath_fittings,'qty',     'rate'),
      mul(d.plumber_labor?.qty, d.plumber_labor?.rate),
    );
  }

  // Phase 7: POP & False Ceiling
  function calcPhase7(d) {
    return add(
      qr(d.pop_bags, 'qty_bags', 'rate_per_bag'),
      qr(d.framing,  'area_sqft','rate_per_sqft'),
      amt(d.pop_other, 'amount'),
      mul(d.pop_labor?.area_sqft, d.pop_labor?.rate_per_sqft),
    );
  }

  // Phase 8: Lift (Elevator)
  function calcPhase8(d) {
    return add(
      amt(d.lift_unit,  'amount'),
      amt(d.shaft,      'amount'),
      mul(d.doors_panels?.floors, d.doors_panels?.rate_per_floor),
      amt(d.lift_install,'amount'),
    );
  }

  // Phase 9: Other (Misc)
  function calcPhase9(d) {
    return amt(d.misc_expenses, 'amount');
  }

  // Phase 10: Interior Finishes
  function calcPhase10(d) {
    let t = 0;
    const p10ovr = (id, calc) => {
      const mk = `_manual_${id}`;
      return (d[mk] !== undefined && d[mk] !== '') ? parseNum(d[mk]) : calc;
    };
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'INPUT') {
        if (document.activeElement !== el) {
          el.value = val > 0 ? val.toFixed(2) : '';
        }
      } else {
        el.textContent = fmt(val);
      }
    };

    // Subfloor prep
    const floorPrepTotal = p10ovr('p10-floor-prep-total', sumRows(d.floor_prep_rows || [], r =>
      add(mul(r.labor_hours, r.labor_rate), r.material_cost)
    ));
    t += floorPrepTotal;

    // Finish flooring
    const floorFinishTotal = sumRows(d.flooring_int_rows || [], r => {
      const coverage = parseNum(r.coverage_sqft);
      const adjCoverage = coverage * (1 + parseNum(r.waste_pct) / 100);
      return add(mul(adjCoverage, r.price), mul(coverage, r.labor_rate), mul(coverage, r.underlay_price));
    });
    const transStripsTotal = mul(d.trans_strips_count, d.trans_strip_price);
    const finishFlooringNet = p10ovr('p10-flooring-total', add(floorFinishTotal, transStripsTotal));
    t += finishFlooringNet;

    // Cabinet box / doors
    const cabBox = p10ovr('p10-cab-box-total', add(
      mul(d.cab_base_lf,   d.cab_base_rate),
      mul(d.cab_upper_lf,  d.cab_upper_rate),
      mul(d.cab_pantry_lf, d.cab_pantry_rate),
      mul(add(d.cab_base_lf, d.cab_upper_lf, d.cab_pantry_lf), d.cab_install_rate),
      parseNum(d.millwork_lump)
    ));
    t += cabBox;

    // Cabinet hardware
    const cabHw = p10ovr('p10-cab-hw-total', add(
      mul(d.pulls_knobs_count, d.pull_unit_price),
      mul(d.drawer_box_count,  d.drawer_box_price),
      mul(d.hinge_qty,         d.hinge_unit_price),
      mul(d.drawer_box_count,  d.softclose_price)
    ));
    t += cabHw;

    // Door slabs & jambs
    const doorSlabTotal = p10ovr('p10-door-slab-total', sumRows(d.door_slab_rows || [], r => {
      const qty = parseNum(r.qty);
      return add(mul(qty, r.slab_price), mul(qty, r.jamb_set_price), mul(qty, r.install_price));
    }));
    t += doorSlabTotal;

    // Door hardware
    const doorHw = p10ovr('p10-door-hw-total', add(
      mul(d.passage_count, d.passage_price),
      mul(d.privacy_count, d.privacy_price),
      mul(d.dummy_count,   d.dummy_price),
      mul(d.door_stops_count, d.door_stop_price),
      mul(add(d.passage_count, d.privacy_count, d.dummy_count, d.door_stops_count) * 3, d.hinge_finish_price)
    ));
    t += doorHw;

    // Trim base + casing
    const trimBaseRaw = sumRows(d.trim_base_rows || [], r => {
      const lf = parseNum(r.lf);
      return add(mul(lf, r.price_lf), mul(lf, r.labor_lf), mul(parseNum(r.corners), r.corner_price));
    });
    const crownAndWainscot = add(
      mul(d.crown_lf,      d.crown_price_lf),
      mul(d.crown_lf,      d.crown_labor_lf),
      mul(d.wainscot_sqft, d.wainscot_price),
      mul(d.wainscot_sqft, d.wainscot_labor)
    );
    const trimBaseTotal = p10ovr('p10-trim-base-total', add(trimBaseRaw, crownAndWainscot));
    t += trimBaseTotal;

    // Stair components
    const stairTotal = p10ovr('p10-trim-stair-total', add(
      mul(d.tread_count,    d.tread_price),
      mul(d.riser_count,    d.riser_price),
      parseNum(d.stair_labor_lump),
      mul(d.baluster_count, d.baluster_price),
      mul(d.newel_count,    d.newel_price)
    ));
    t += stairTotal;

    // Paint prep
    const paintPrepTotal = p10ovr('p10-paint-prep-total', sumRows(d.paint_prep_rows || [], r =>
      add(mul(r.caulk_tubes, 8), mul(r.filler_tubs, 25), parseNum(r.sandpaper_cost), parseNum(r.tape_plastic_cost))
    ));
    t += paintPrepTotal;

    // Primer & Paint coatings
    const paintCoatRows = d.paint_coat_rows || [];
    const totalSqft = paintCoatRows.reduce((s, r) => s + parseNum(r.sqft), 0);
    const primerCoverage = parseNum(d.primer_coverage) || 300;
    const primerGallons = primerCoverage > 0 ? Math.ceil(totalSqft / primerCoverage) : 0;
    const primerTotal = mul(primerGallons, d.primer_price_gal);

    const paintCoatRaw = sumRows(paintCoatRows, r => {
      const sqft = parseNum(r.sqft);
      const coats = parseNum(r.coats);
      const coverage = parseNum(r.coverage);
      const gallons = coverage > 0 ? (sqft * coats) / coverage : 0;
      return add(mul(gallons, r.price_per_gal), mul(sqft, r.labor_sqft));
    });
    const paintCoatTotal = p10ovr('p10-paint-coat-total', add(primerTotal, paintCoatRaw));
    t += paintCoatTotal;

    // Closet systems
    const closetTotal = p10ovr('p10-closet-total', add(
      mul(d.closet_lf,            d.closet_rate_lf),
      mul(d.closet_lf,            d.closet_install_lf),
      mul(d.closet_drawer_count,  d.closet_drawer_price),
      parseNum(d.closet_accessories_lump)
    ));
    t += closetTotal;

    // Glass & mirrors
    const glassRaw = sumRows(d.glass_rows || [], r => {
      const qty = parseNum(r.qty);
      return add(mul(qty, r.unit_price), mul(qty, r.install));
    });
    const showerAndMirror = add(
      parseNum(d.shower_lump),
      mul(d.vanity_mirror_sqft, d.mirror_price_sqft)
    );
    const glassTotal = p10ovr('p10-glass-total', add(glassRaw, showerAndMirror));
    t += glassTotal;

    // Misc custom fixtures
    const fixtureTotal = p10ovr('p10-fixture-total', sumRows(d.fixture_int_rows || [], r => {
      const qty = parseNum(r.qty);
      return add(mul(qty, r.unit_price), parseNum(r.labor));
    }));
    t += fixtureTotal;

    // Push section totals to DOM
    setVal('p10-floor-prep-total',  floorPrepTotal);
    setVal('p10-flooring-total',    finishFlooringNet);
    setVal('p10-cab-box-total',     cabBox);
    setVal('p10-cab-hw-total',      cabHw);
    setVal('p10-door-slab-total',   doorSlabTotal);
    setVal('p10-door-hw-total',     doorHw);
    setVal('p10-trim-base-total',   trimBaseTotal);
    setVal('p10-trim-stair-total',  stairTotal);
    setVal('p10-paint-prep-total',  paintPrepTotal);
    setVal('p10-paint-coat-total',  paintCoatTotal);
    setVal('p10-closet-total',      closetTotal);
    setVal('p10-glass-total',       glassTotal);
    setVal('p10-fixture-total',     fixtureTotal);

    return t;
  }

  // ── Dispatch ───────────────────────────────────────────
  function computePhaseTotal(phase) {
    try {
      if (!phase || typeof phase !== 'object') return 0;
      const d = phase.data || {};
      const pid = Number(phase.id);

      // Phases 1-9: entry-based model
      // Sum all saved entries across all cards + scanned bills
      // phases-new-core.js overrides this after it loads, but we also
      // handle it here as a fallback so the old calc never returns stale ₹0
      if (pid >= 1 && pid <= 9) {
        let entryTotal = 0;
        if (d.entries && typeof d.entries === 'object') {
          Object.values(d.entries).forEach(arr => {
            if (Array.isArray(arr)) {
              arr.forEach(e => { entryTotal += parseFloat(e.total) || 0; });
            }
          });
        }
        const bills = (typeof State !== 'undefined' && State.getBills) ? (State.getBills(pid) || []) : (Array.isArray(phase.bills) ? phase.bills : []);
        const billTotal = bills.reduce((s, b) => s + (parseFloat(b.totalAmount) || 0), 0);
        return entryTotal + billTotal;
      }

      // Phase 10: Interior — uses its own detailed calc
      if (pid === 10) return calcPhase10(d);
      return 0;
    } catch (err) {
      console.warn('[Financial] computePhaseTotal error for phase', phase?.id, err.message);
      return 0;
    }
  }

  // ── Master Total Update ─────────────────────────────────
  function computeProjectTotal(project) {
    try {
      if (!project || !Array.isArray(project.phases)) return 0;
      return project.phases.reduce((s, ph) => s + computePhaseTotal(ph), 0);
    } catch { return 0; }
  }

  let _lastSavedTotal = null;

  function updateAllTotals() {
    const proj = State.getCurrentProject();
    if (!proj) return;

    let projectTotal = 0;
    let materialTotal = 0, laborTotal = 0, equipTotal = 0;

    // Real labor card IDs per phase — these are actual payout/labor cards, rest are materials
    const LABOR_CARD_IDS = new Set([
      'thekedar',          // Civil labor
      'tile_labor',        // Tiling labor
      'painter_labor',     // Painter labor
      'electrician_labor', // Electrician labor
      'fab_labor',         // Carpenter/fabricator labor
      'plumber_labor',     // Plumber labor
      'pop_labor',         // POP contractor labor
      'lift_install',      // Lift installation crew
      'misc_expenses',     // Misc site expenses (treat as other/equipment)
      'floor-prep',        // Phase 10 subfloor prep labor
      'paint-prep',        // Phase 10 paint prep labor
    ]);

    proj.phases.forEach(phase => {
      const pid = Number(phase.id);
      const phTotal = computePhaseTotal(phase);
      projectTotal += phTotal;

      // Build real material vs labor split from card-level data (phases 1–10)
      if (pid >= 1 && pid <= 10) {
        const entriesMap = phase.data?.entries || {};
        const registry = (typeof Phases !== 'undefined' && Phases.CATEGORY_REGISTRY || {})[pid] || [];
        registry.forEach(cat => {
          let cardCost = 0;
          const arr = entriesMap[cat.id];
          if (Array.isArray(arr)) {
            arr.forEach(e => { cardCost += parseFloat(e.total) || 0; });
          }
          if (LABOR_CARD_IDS.has(cat.id)) {
            laborTotal += cardCost;
          } else {
            materialTotal += cardCost;
          }
        });
        // Also add bills to materialTotal
        const bills = (typeof State !== 'undefined' && State.getBills) ? (State.getBills(pid) || []) : [];
        bills.forEach(b => {
          materialTotal += parseFloat(b.totalAmount) || 0;
        });
      } else {
        // Unknown phase — use a reasonable 60/40 split as estimate
        materialTotal += phTotal * 0.60;
        laborTotal    += phTotal * 0.40;
      }

      updateEl(`phase-cost-${phase.id}`, fmt(phTotal));

      // Update auto-suggest completion button if visible
      if (typeof Phases !== 'undefined' && typeof Phases.updateAutoSuggestButton === 'function' && proj.totalBudget > 0) {
        let phaseBudget = phase.budget || 0;
        if (phaseBudget <= 0 && typeof Estimation !== 'undefined' && Estimation.getTradeBudget) {
          const tb = Estimation.getTradeBudget(phase.id);
          if (tb) phaseBudget = tb.total;
        }
        if (phaseBudget <= 0) phaseBudget = (proj.totalBudget || 0) / Math.max(1, proj.phases.length);
        Phases.updateAutoSuggestButton(phase.id, phTotal, phaseBudget);
      }

      const ptEl = document.getElementById(`phase-total-${phase.id}`);
      if (ptEl) {
        const oldVal = ptEl.textContent;
        const newVal = fmtFull(phTotal);
        ptEl.textContent = newVal;
        if (oldVal !== newVal && oldVal !== '₹0' && oldVal !== '$0') {
          ptEl.style.color = 'var(--success)';
          ptEl.style.textShadow = '0 0 12px rgba(0,121,121,0.3)';
          setTimeout(() => { ptEl.style.color = ''; ptEl.style.textShadow = ''; }, 800);
        }
      }

      // Only update visible hub cards (element must exist in DOM)
      if (phase.id >= 1 && phase.id <= 10 && typeof Phases !== 'undefined' && typeof Phases.updateHubTotals === 'function') {
        const hubEl = document.getElementById(`hub-running-total-${phase.id}`);
        if (hubEl) {
          try { Phases.updateHubTotals(phase.id); } catch(e) { /* silent */ }
        }
      }

      // Update inner card totals for phase 10 (interior)
      if (phase.id === 10 && typeof Phases !== 'undefined' && Phases.CATEGORY_REGISTRY && Phases.CATEGORY_REGISTRY[phase.id]) {
        Phases.CATEGORY_REGISTRY[phase.id].forEach(cat => {
          const cardTotalEl = document.getElementById(`card-total-${phase.id}-${cat.id}`);
          if (cardTotalEl && typeof Phases.categoryStats === 'function') {
            try {
              const stats = Phases.categoryStats(phase, cat);
              cardTotalEl.textContent = fmtFull(stats.cost || 0);
            } catch(e) { /* silent */ }
          }
        });
      }

      if (proj.totalBudget > 0) {
        // Use per-phase budget from estimation if available, else equal split
        let phaseBudget = phase.budget || 0;
        if (phaseBudget <= 0 && typeof Estimation !== 'undefined' && Estimation.getTradeBudget) {
          const tb = Estimation.getTradeBudget(phase.id);
          if (tb) phaseBudget = tb.total;
        }
        if (phaseBudget <= 0) phaseBudget = proj.totalBudget / Math.max(1, proj.phases.length);
        const pct = Math.min(150, (phTotal / phaseBudget) * 100);
        const barEl = document.getElementById(`budget-bar-${phase.id}`);
        if (barEl) {
          barEl.style.width = Math.min(100, pct) + '%';
          if (pct > 120)      barEl.style.background = 'linear-gradient(90deg, var(--warning), #B85F4E)';
          else if (pct > 90)  barEl.style.background = 'linear-gradient(90deg, var(--warning), #9E7758)';
          else                barEl.style.background = 'linear-gradient(90deg, var(--success), var(--off-white-dim))';
        }
      }
    });

    const masterEl = document.getElementById('master-total');
    if (masterEl) masterEl.textContent = fmtFull(projectTotal);

    const masterBox = masterEl?.closest('.master-total-box');
    if (masterBox && proj.totalBudget > 0) {
      masterBox.classList.toggle('over-budget', projectTotal > proj.totalBudget);
    }

    updateEl('sb-materials', fmt(materialTotal));
    updateEl('sb-labor',     fmt(laborTotal));
    updateEl('sb-equipment', fmt(equipTotal));
    updateEl('sb-total',     fmtFull(projectTotal));

    if (proj.totalBudget > 0) {
      const healthPct = Math.min(100, (projectTotal / proj.totalBudget) * 100);
      const bar   = document.getElementById('health-bar-fill');
      const pctEl = document.getElementById('health-pct');
      if (bar) {
        bar.style.width = healthPct + '%';
        if (healthPct > 100)      bar.style.background = 'var(--warning)';
        else if (healthPct > 85)  bar.style.background = '#D9B68E';
        else                      bar.style.background = 'var(--success)';
      }
      if (pctEl) pctEl.textContent = Math.round(healthPct) + '%';
    }

    // Only save to localStorage if the total meaningfully changed.
    // Use saveLocalOnly() because this is a system recalculation,
    // not a user action. State.save() would trigger Supabase writes.
    const totalRounded = Math.round(projectTotal);
    if (totalRounded !== _lastSavedTotal) {
      _lastSavedTotal = totalRounded;
      if (State.saveLocalOnly) State.saveLocalOnly();
      else State.save();
    }
    return projectTotal;
  }

  // ── Helpers ─────────────────────────────────────────────
  function updateEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateAllTotals();
      recalcAllCompletions();
      // Emit cross-module reactivity event
      if (typeof App !== 'undefined' && App.emit) App.emit('data:changed');
    }, 300);
  }

  function attachLiveInput(el, callback) {
    el.addEventListener('input', () => {
      el.classList.add('saved');
      setTimeout(() => el.classList.remove('saved'), 800);
      callback && callback(el.value);
      scheduleUpdate();
      if (typeof AI !== 'undefined') AI.checkTriggers();
    });
    el.addEventListener('change', () => {
      callback && callback(el.value);
      scheduleUpdate();
      if (typeof AI !== 'undefined') AI.checkTriggers();
    });
  }



  // ── Phase Completion Algorithm ───────────────────────────
  // Multi-factor completion that considers:
  //   1. Budget utilization (material + labor separately)
  //   2. Number of entries vs a reasonable activity threshold
  //   3. Variety — how many different card categories have entries
  //
  // For phases WITHOUT estimation budget: uses equal-share of
  // totalBudget as fallback, with simpler entry-based logic.
  // ══════════════════════════════════════════════════════════

  function computePhaseCompletion(phase) {
    if (!phase) return 0;
    const pid = Number(phase.id);
    const proj = State.getCurrentProject();
    if (!proj) return 0;

    // Get actual spend for this phase
    const phTotal = computePhaseTotal(phase);

    // Get per-phase budget from estimation (preferred) or fallback
    let budgetMaterial = phase.budgetMaterial || 0;
    let budgetLabor = phase.budgetLabor || 0;
    let budgetTotal = phase.budget || 0;

    // Try estimation if no explicit per-phase budget
    if (budgetTotal <= 0 && typeof Estimation !== 'undefined' && Estimation.getTradeBudget) {
      const tb = Estimation.getTradeBudget(pid);
      if (tb) {
        budgetMaterial = tb.material;
        budgetLabor = tb.labor;
        budgetTotal = tb.total;
        // Cache on the phase object for faster access
        phase.budget = budgetTotal;
        phase.budgetMaterial = budgetMaterial;
        phase.budgetLabor = budgetLabor;
      }
    }

    // Fallback: equal share of total project budget
    if (budgetTotal <= 0 && proj.totalBudget > 0) {
      budgetTotal = proj.totalBudget / Math.max(1, proj.phases.length);
    }

    // ── Factor 1: Budget Utilization ──
    // How much of the estimated budget has been spent
    let budgetPct = 0;
    if (budgetTotal > 0) {
      budgetPct = Math.min(100, (phTotal / budgetTotal) * 100);
    }

    // ── Factor 1b: Material vs Labor Budget Utilization ──
    // Split actuals into material and labor for more accuracy
    let matSpend = 0, labSpend = 0;
    if (pid >= 1 && pid <= 9 && typeof Phases !== 'undefined' && Phases.getMaterialCardsForPhase) {
      const entriesMap = phase.data?.entries || {};
      const matCards = Phases.getMaterialCardsForPhase(pid);
      const labCards = Phases.getLaborCardsForPhase(pid);
      matCards.forEach(c => {
        const arr = entriesMap[c.id];
        if (Array.isArray(arr)) arr.forEach(e => { matSpend += parseFloat(e.total) || 0; });
      });
      labCards.forEach(c => {
        const arr = entriesMap[c.id];
        if (Array.isArray(arr)) arr.forEach(e => { labSpend += parseFloat(e.total) || 0; });
      });
      // Add bills to material spend
      const bills = (typeof State !== 'undefined' && State.getBills) ? (State.getBills(pid) || []) : [];
      bills.forEach(b => { matSpend += parseFloat(b.totalAmount) || 0; });
    } else if (pid === 10) {
      // Phase 10 — use total as material-like (interior materials dominate)
      matSpend = phTotal * 0.70;
      labSpend = phTotal * 0.30;
    }

    let matBudgetPct = 0, labBudgetPct = 0;
    if (budgetMaterial > 0) matBudgetPct = Math.min(100, (matSpend / budgetMaterial) * 100);
    if (budgetLabor > 0)   labBudgetPct = Math.min(100, (labSpend / budgetLabor) * 100);

    // ── Factor 2: Entry Count ──
    // More entries = more work done. We use a sigmoid-like curve
    // that saturates: 1 entry → ~15%, 3 → ~35%, 5 → ~50%, 10+ → ~70%
    let entryCount = 0;
    if (phase.data && phase.data.entries) {
      Object.values(phase.data.entries).forEach(arr => {
        if (Array.isArray(arr)) entryCount += arr.length;
      });
    }
    // Also count bills
    const billCount = (typeof State !== 'undefined' && State.getBills) ? (State.getBills(pid) || []).length : 0;
    entryCount += billCount;
    // Sigmoid curve for entry factor: maxes around 70% because entries alone
    // shouldn't push completion to 100% (budget matters more)
    const entryFactor = entryCount > 0 ? Math.min(70, 70 * (1 - Math.exp(-entryCount / 4))) : 0;

    // ── Factor 3: Variety ──
    // How many different card categories have at least one entry
    // out of the total available categories for this phase
    let categoriesWithData = 0;
    let totalCategories = 0;
    if (pid >= 1 && pid <= 9 && typeof Phases !== 'undefined' && Phases.getAllCardsForPhase) {
      const allCards = Phases.getAllCardsForPhase(pid);
      totalCategories = allCards.length;
      allCards.forEach(c => {
        const arr = phase.data?.entries?.[c.id];
        if (Array.isArray(arr) && arr.length > 0) categoriesWithData++;
      });
    } else if (pid === 10) {
      // For phase 10, count filled sections
      if (typeof Phases !== 'undefined' && Phases.CATEGORY_REGISTRY && Phases.CATEGORY_REGISTRY[10]) {
        totalCategories = Phases.CATEGORY_REGISTRY[10].length;
        Phases.CATEGORY_REGISTRY[10].forEach(cat => {
          const stats = typeof Phases.categoryStats === 'function' ? Phases.categoryStats(phase, cat) : null;
          if (stats && stats.cost > 0) categoriesWithData++;
        });
      }
    }
    const varietyPct = totalCategories > 0 ? (categoriesWithData / totalCategories) * 100 : 0;

    // ── Weighted Blend ──
    // If we have estimation budgets: budget utilization is the strongest signal
    // If no budgets: rely more on entries and variety
    let completion;
    if (budgetTotal > 0 && (budgetMaterial > 0 || budgetLabor > 0)) {
      // Budget-aware mode: use detailed material/labor split
      // Weights: budget utilization 50%, entry count 20%, variety 30%
      // Use the better of overall budget% or weighted material+labor%
      const detailedBudgetPct = budgetMaterial > 0 && budgetLabor > 0
        ? (matBudgetPct * 0.5 + labBudgetPct * 0.5)
        : budgetPct;
      const budgetSignal = Math.max(budgetPct, detailedBudgetPct);
      completion = budgetSignal * 0.50 + entryFactor * 0.20 + varietyPct * 0.30;
    } else if (budgetTotal > 0) {
      // Only total budget known (no material/labor split)
      completion = budgetPct * 0.50 + entryFactor * 0.20 + varietyPct * 0.30;
    } else {
      // No budget at all — rely on entries and variety
      completion = entryFactor * 0.45 + varietyPct * 0.55;
    }

    return Math.min(100, Math.max(0, Math.round(completion)));
  }

  // ── Recalculate all phase completions and update DOM ─────
  function recalcAllCompletions() {
    const proj = State.getCurrentProject();
    if (!proj || !Array.isArray(proj.phases)) return;
    proj.phases.forEach(phase => {
      const newPct = computePhaseCompletion(phase);
      const oldPct = phase.completion || 0;
      phase.completion = newPct;

      // Update DOM elements for this phase's completion
      const bar = document.getElementById('comp-bar-' + phase.id);
      if (bar) bar.style.width = newPct + '%';
      const inp = document.getElementById('comp-pct-' + phase.id);
      if (inp && document.activeElement !== inp) inp.value = newPct;
      const sideBar = document.getElementById('phase-prog-' + phase.id);
      if (sideBar) sideBar.style.width = newPct + '%';
      const sidePct = document.getElementById('phase-pct-' + phase.id);
      if (sidePct) sidePct.textContent = newPct + '%';
    });
    // Save updated completions — use saveLocalOnly() because this is a
    // system recalculation, not a user action. Calling State.save() would
    // mark entities as dirty and trigger unnecessary Supabase writes.
    if (typeof State !== 'undefined' && State.saveLocalOnly) State.saveLocalOnly();
    // Dispatch event so dashboard etc. can refresh
    if (typeof App !== 'undefined' && App.emit) App.emit('completions:updated');
  }

  return {
    fmt, fmtFull, parseNum, mul, add, sumRows,
    computePhaseTotal, computeProjectTotal,
    updateAllTotals, scheduleUpdate, attachLiveInput,
    computePhaseCompletion, recalcAllCompletions,
    get currency() { return currency; },
    set currency(v) { currency = v; },
  };

})();
