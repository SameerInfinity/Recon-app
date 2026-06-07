/* ═══════════════════════════════════════════
   FINANCIAL.JS — Calculation Engine v2
   Live totals, cost-type breakdowns, 
   animated updates, budget health tracking
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
    if (n >= 10000000) return sym + (n / 10000000).toFixed(2) + ' Cr';
    if (n >= 100000) return sym + (n / 100000).toFixed(2) + ' L';
    return sym + n.toLocaleString(locale, { maximumFractionDigits: 0 });
  }

  function fmtFull(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) return currency === 'INR' ? '₹0' : '$0';
    const n = parseFloat(amount) || 0;
    const sym = currency === 'INR' ? '₹' : '$';
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    return sym + n.toLocaleString(locale, { maximumFractionDigits: 0 });
  }

  function parseNum(val) {
    if (val === '' || val === null || val === undefined) return 0;
    return parseFloat(String(val).replace(/[,₹$]/g, '')) || 0;
  }

  function mul(a, b) { return parseNum(a) * parseNum(b); }
  function add(...args) { return args.reduce((s, v) => s + parseNum(v), 0); }

  // ── Phase Calculations ─────────────────────────────────
  function computePhaseTotal(phase) {
    let total = 0;
    const d = phase.data;
    switch(phase.id) {
      case 1: total = computePhase1(d); break;
      case 2: total = computePhase2(d); break;
      case 3: total = computePhase3(d); break;
      case 4: total = computePhase4(d); break;
      case 5: total = computePhase5(d); break;
      case 6: total = computePhase6(d); break;
      case 7: total = computePhase7(d); break;
      case 8: total = computePhase8(d); break;
    }
    return total;
  }

  function sumRows(rows, fn) {
    if (!rows || !Array.isArray(rows)) return 0;
    return rows.reduce((s, r) => s + (fn(r) || 0), 0);
  }

  // Phase 1: Pre-Construction
  function computePhase1(d) {
    let t = 0;
    const s = d.survey || {};
    const surveyTotal = parseNum(s.geotech_cost) + mul(s.soil_test_fee, s.soil_test_count) + parseNum(s.survey_engineer_fee);
    t += surveyTotal;

    const permitTotal = sumRows(d.permits, r => parseNum(r.fee_amount));
    t += permitTotal;

    let infraTotal = 0;
    if (d.temp_infra) {
      const ti = d.temp_infra;
      if (ti.power_active) infraTotal += parseNum(ti.power_conn) + mul(ti.power_monthly, ti.power_months);
      if (ti.water_active) infraTotal += mul(ti.water_monthly, ti.water_months);
      if (ti.porta_active) infraTotal += mul(ti.porta_weekly, ti.porta_weeks);
      if (ti.fence_active) infraTotal += mul(ti.fence_lf, ti.fence_rate);
      if (ti.dumpster_active) infraTotal += mul(ti.dumpster_pickups, ti.dumpster_rate);
      if (ti.trailer_active) infraTotal += mul(ti.trailer_monthly, ti.trailer_months);
    }
    t += infraTotal;

    // Update section totals
    updateEl('p1-survey-total', fmt(surveyTotal));
    updateEl('sct-p1-permits', fmt(permitTotal));
    updateEl('p1-infra-total', fmt(infraTotal));
    return t;
  }

  // Phase 2: Site & Foundation
  function computePhase2(d) {
    let t = 0;
    const e = d.earthwork || {};
    const earthTotal = mul(e.haul_loads, e.haul_cost_per_load) + mul(e.equip_rate, e.equip_days)
      + mul(e.op_rate, e.op_days) + parseNum(e.disposal_fee);
    t += earthTotal;

    const c = d.concrete || {};
    const concreteTotal = mul(c.concrete_volume, c.concrete_price_per_yard)
      + mul(c.rebar_lf, c.rebar_price_per_lf) + parseNum(c.formwork_cost)
      + parseNum(c.readymix_delivery) + parseNum(c.pump_rental);
    t += concreteTotal;

    const u = d.utility || {};
    const utilityTotal = mul(u.sewer_lf, u.sewer_price) + mul(u.water_lf, u.water_price)
      + mul(u.conduit_lf, u.conduit_price) + mul(u.trench_lf, u.trench_rate)
      + mul(u.bedding_tons, u.bedding_price) + parseNum(u.inspection_fee);
    t += utilityTotal;

    updateEl('p2-earth-total', fmt(earthTotal));
    updateEl('p2-concrete-total', fmt(concreteTotal));
    updateEl('p2-utility-total', fmt(utilityTotal));
    return t;
  }

  // Phase 3: Framing
  function computePhase3(d) {
    let t = 0;
    const s = d.skeleton || {};
    const skelTotal = mul(s.board_feet, s.price_per_bf) + parseNum(s.hardware_lump) + parseNum(s.crane_rental);
    t += skelTotal;

    const r = d.roofing || {};
    const roofTotal = mul(r.roof_squares, r.shingle_price) + mul(r.underlayment_sqft, r.underlayment_price)
      + parseNum(r.decking_cost) + parseNum(r.flashing_cost) + parseNum(r.labor);
    t += roofTotal;

    const winTotal = sumRows(d.window_rows, r => mul(r.qty || 1, r.unit_price))
      + parseNum((d.windows || {}).installation_labor) + parseNum((d.windows || {}).hardware);
    t += winTotal;

    updateEl('p3-skel-total', fmt(skelTotal));
    updateEl('p3-roof-total', fmt(roofTotal));
    updateEl('p3-win-total', fmt(winTotal));
    return t;
  }

  // Phase 4: MEP Rough-In
  function computePhase4(d) {
    let t = 0;
    const h = d.hvac || {};
    const hvacTotal = parseNum(h.equip_cost) + mul(h.duct_lf, h.duct_price) + mul(h.registers, h.register_price)
      + mul(h.grilles, h.grille_price) + parseNum(h.hvac_labor) + mul(h.refrig_lf, h.refrig_price) + parseNum(h.condensate);
    t += hvacTotal;

    const p = d.plumbing || {};
    const plumbTotal = mul(p.supply_lf, p.supply_price) + mul(p.drain_lf, p.drain_price)
      + parseNum(p.rough_labor) + parseNum(p.fittings) + parseNum(p.pressure_fee);
    t += plumbTotal;

    const el = d.electrical || {};
    const elecTotal = parseNum(el.panel_cost) + parseNum(el.panel_labor) + mul(el.conduit_lf, el.conduit_price)
      + mul(el.cat6_drops, el.cat6_price) + parseNum(el.rough_labor) + parseNum(el.inspection_fee)
      + sumRows(d.wire_variants, r => mul(r.qty, r.price_per_unit));
    t += elecTotal;

    const blockTotal = sumRows(d.blocking_rows, r => mul(r.qty, r.unit_cost));
    t += blockTotal;

    updateEl('p4-hvac-total', fmt(hvacTotal));
    updateEl('p4-plumb-total', fmt(plumbTotal));
    updateEl('p4-elec-total', fmt(elecTotal));
    return t;
  }

  // Phase 5: Insulation & Drywall
  function computePhase5(d) {
    let t = 0;
    const ins = d.insulation || {};
    const insTotal = mul(ins.wall_sqft, ins.wall_price) + mul(ins.ceiling_sqft, ins.ceiling_price)
      + mul(ins.floor_sqft, ins.floor_price) + mul(ins.foam_bf, ins.foam_price)
      + parseNum(ins.install_labor) + parseNum(ins.blower_test);
    t += insTotal;

    const dr = d.drywall || {};
    const sheets = Math.ceil((parseNum(dr.total_sqft || dr.drywall_sqft) / 32) * 1.1);
    const dwTotal = mul(sheets, dr.sheet_price) + mul(dr.jc_buckets, dr.jc_price)
      + mul(dr.primer_gallons, dr.primer_price) + mul(parseNum(dr.total_sqft || dr.drywall_sqft), dr.hang_rate)
      + mul(parseNum(dr.total_sqft || dr.drywall_sqft), dr.tape_rate) + parseNum(dr.corner_bead);
    t += dwTotal;

    updateEl('p5-ins-total', fmt(insTotal));
    updateEl('p5-dw-total', fmt(dwTotal));
    return t;
  }

  // Phase 6: Finishes
  function computePhase6(d) {
    let t = 0;
    const cl = d.cladding || {};
    const cladTotal = mul(cl.area || cl.clad_area, cl.price_per_sqft || cl.clad_price_sqft)
      + mul(cl.mortar_bags, cl.mortar_price) + parseNum(cl.install_labor || cl.clad_install_labor)
      + mul(cl.scaffold_days, cl.scaffold_rate);
    t += cladTotal;

    const floorTotal = sumRows(d.flooring_rows, r => {
      const area = parseNum(r.area) * (1 + parseNum(r.waste_pct || 10) / 100);
      return mul(area, r.price) + mul(r.area, r.labor_rate) + mul(r.area, r.underlayment_price);
    });
    t += floorTotal;

    const cab = d.cabinetry || {};
    const cabTotal = mul(cab.lf || cab.cab_lf, cab.cabinet_price) + mul(cab.knobs_count, cab.knobs_price)
      + mul(cab.lf || cab.cab_lf, cab.install_rate || cab.cab_install_rate) + parseNum(cab.millwork_lump);
    t += cabTotal;

    const tr = d.trim || {};
    const trimTotal = mul(tr.base_lf, tr.base_price) + mul(tr.crown_lf, tr.crown_price)
      + mul(tr.trim_lf, tr.trim_rate) + mul(tr.paint_sqft, tr.paint_rate)
      + mul(tr.primer_gal_trim || tr.primer_gallons, tr.primer_price || tr.primer_price_trim)
      + parseNum(tr.supplies_lump);
    t += trimTotal;

    updateEl('p6-clad-total', fmt(cladTotal));
    updateEl('p6-floor-total', fmt(floorTotal));
    updateEl('p6-cab-total', fmt(cabTotal));
    updateEl('p6-trim-total', fmt(trimTotal));
    return t;
  }

  // Phase 7: Final MEP
  function computePhase7(d) {
    let t = 0;
    const recepTotal = sumRows(d.receptacle_rows, r => mul(r.count, r.unit_price));
    const switchTotal = sumRows(d.switch_rows, r => mul(r.count, r.unit_price));
    const fixtureTotal = sumRows(d.fixture_rows, r => mul(r.count, r.unit_price));
    const trimLabor = parseNum((d.elec_trim || {}).trim_labor);
    const elecTrimTotal = recepTotal + switchTotal + fixtureTotal + trimLabor;
    t += elecTrimTotal;

    const faucetTotal = sumRows(d.faucet_rows, r => mul(r.count, r.unit_price));
    const pl = d.plumb_trim || {};
    const plumbTrimTotal = faucetTotal + mul(pl.toilet_count, pl.toilet_price)
      + mul(pl.shower_count, pl.shower_price) + parseNum(pl.water_heater)
      + parseNum(pl.wh_install) + parseNum(pl.trim_labor || pl.plumb_trim_labor) + parseNum(pl.drain_covers);
    t += plumbTrimTotal;

    const counterTotal = sumRows(d.countertop_rows, r =>
      mul(r.area, r.price) + mul(r.cutouts, r.cutout_price || 500) + parseNum(r.labor)
      + mul(r.sealer_bottles, r.sealer_price));
    t += counterTotal;

    updateEl('p7-elec-total', fmt(elecTrimTotal));
    updateEl('p7-plumb-total', fmt(plumbTrimTotal));
    updateEl('p7-counter-total', fmt(counterTotal));
    return t;
  }

  // Phase 8: Punch List & Handover
  function computePhase8(d) {
    let t = 0;
    const punchTotal = sumRows(d.punchItems || [], r => parseNum(r.repair_cost));
    t += punchTotal;

    const hand = d.handover || {};
    const handTotal = parseNum(hand.cleaning) + parseNum(hand.co_fees)
      + parseNum(hand.landscaping) + parseNum(hand.touchup);
    t += handTotal;

    updateEl('p8-hand-total', fmt(handTotal));
    return t;
  }

  // ── Master Total Update ────────────────────────────────
  function computeProjectTotal(project) {
    if (!project) return 0;
    return project.phases.reduce((s, ph) => s + computePhaseTotal(ph), 0);
  }

  function updateAllTotals() {
    const proj = State.getCurrentProject();
    if (!proj) return;

    let projectTotal = 0;
    let materialTotal = 0, laborTotal = 0, equipTotal = 0;

    proj.phases.forEach(phase => {
      const phTotal = computePhaseTotal(phase);
      projectTotal += phTotal;

      // Estimate cost type split (approximate based on construction industry averages)
      materialTotal += phTotal * 0.55;
      laborTotal += phTotal * 0.35;
      equipTotal += phTotal * 0.10;

      // Update sidebar chip
      updateEl(`phase-cost-${phase.id}`, fmt(phTotal));

      // Update phase workspace total
      const ptEl = document.getElementById(`phase-total-${phase.id}`);
      if (ptEl) {
        const oldVal = ptEl.textContent;
        const newVal = fmtFull(phTotal);
        ptEl.textContent = newVal;
        if (oldVal !== newVal && oldVal !== '₹0' && oldVal !== '$0') {
          ptEl.style.color = 'var(--success)';
          ptEl.style.textShadow = '0 0 12px rgba(0,121,121,0.3)';
          setTimeout(() => {
            ptEl.style.color = '';
            ptEl.style.textShadow = '';
          }, 800);
        }
      }

      // Update budget bar
      if (proj.totalBudget > 0) {
        const phaseBudget = proj.totalBudget / 8;
        const pct = Math.min(150, (phTotal / phaseBudget) * 100);
        const barEl = document.getElementById(`budget-bar-${phase.id}`);
        if (barEl) {
          barEl.style.width = Math.min(100, pct) + '%';
          if (pct > 120) barEl.style.background = 'linear-gradient(90deg, var(--warning), #EF4444)';
          else if (pct > 90) barEl.style.background = 'linear-gradient(90deg, #D97706, #B45309)';
          else barEl.style.background = 'linear-gradient(90deg, var(--success), #34D399)';
        }
      }
    });

    // Master total
    const masterEl = document.getElementById('master-total');
    if (masterEl) masterEl.textContent = fmtFull(projectTotal);

    // Over-budget indicator
    const masterBox = masterEl?.closest('.master-total-box');
    if (masterBox && proj.totalBudget > 0) {
      masterBox.classList.toggle('over-budget', projectTotal > proj.totalBudget);
    }

    // Sidebar totals
    updateEl('sb-materials', fmt(materialTotal));
    updateEl('sb-labor', fmt(laborTotal));
    updateEl('sb-equipment', fmt(equipTotal));
    updateEl('sb-total', fmtFull(projectTotal));

    // Budget health bar
    if (proj.totalBudget > 0) {
      const healthPct = Math.min(100, (projectTotal / proj.totalBudget) * 100);
      const bar = document.getElementById('health-bar-fill');
      const pctEl = document.getElementById('health-pct');
      if (bar) {
        bar.style.width = healthPct + '%';
        if (healthPct > 100) bar.style.background = 'var(--warning)';
        else if (healthPct > 85) bar.style.background = '#D97706';
        else bar.style.background = 'var(--success)';
      }
      if (pctEl) pctEl.textContent = Math.round(healthPct) + '%';
    }

    State.save();
    return projectTotal;
  }

  // ── Helpers ─────────────────────────────────────────────
  function updateEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Debounced update — 300ms as per spec
  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateAllTotals, 300);
  }

  // Attach live-update listeners to an input
  function attachLiveInput(el, callback) {
    el.addEventListener('input', () => {
      el.classList.add('saved');
      setTimeout(() => el.classList.remove('saved'), 800);
      callback && callback(el.value);
      scheduleUpdate();
      AI.checkTriggers();
    });
    el.addEventListener('change', () => {
      callback && callback(el.value);
      scheduleUpdate();
      AI.checkTriggers();
    });
  }

  return {
    fmt, fmtFull, parseNum, mul, add, sumRows,
    computePhaseTotal, computeProjectTotal,
    updateAllTotals, scheduleUpdate, attachLiveInput,
    get currency() { return currency; },
    set currency(v) { currency = v; },
  };
})();
