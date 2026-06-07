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
      case 9: total = computePhase9(d); break;  // Trade 9: Other (Misc)
      case 10: total = computePhase10(d); break; // Interior
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

  // ════════════════════════════════════════════════════════════
  // TRADE PHASE COMPUTATIONS (Phases 1-9)
  // Each trade phase has multiple input cards. Each card stores
  // its data at phase.data[cardId] as a single object (not an
  // array). The cost is computed by the card's costFn, which we
  // re-declare here (mirroring the per-card math from phases.js).
  // ════════════════════════════════════════════════════════════

  // qty × rate helper (material-style). Safe to call with undefined
  // `d` (an empty card). Returns 0 if the card has no data.
  const qr = (d, qtyKey, rateKey) => {
    try {
      if (!d || typeof d !== 'object') return 0;
      const qty = parseNum(d?.[qtyKey]);
      const rate = parseNum(d?.[rateKey]);
      return (qty || 0) * (rate || 0);
    } catch {
      return 0;
    }
  };
  // Direct-amount helper (for cards that store an `amount` field).
  const amt = (d, key) => (d && typeof d === 'object') ? (parseNum(d[key]) || 0) : 0;

  // 1. Civil Work
  function computePhase1(d) {
    return add(
      qr(d.iron, 'qty_kg', 'rate_per_kg'),
      qr(d.sand, 'qty_brass', 'rate_per_brass'),
      qr(d.cement, 'qty_bags', 'rate_per_bag'),
      qr(d.stone, 'qty_brass', 'rate_per_brass'),
      qr(d.binding_wire, 'qty_kg', 'rate_per_kg'),
      qr(d.adhesive, 'qty_ltr', 'rate_per_ltr'),
      parseNum(d.other_material?.amount),
      parseNum(d.thekedar?.amount),
    );
  }

  // 2. Tiles & Flooring
  function computePhase2(d) {
    return add(
      qr(d.floor_tiles, 'area_sqft', 'rate_per_sqft'),
      qr(d.kitchen_dado, 'area_sqft', 'rate_per_sqft'),
      qr(d.staircase_tiles, 'step_count', 'rate_per_step'),
      (parseNum(d.tile_chemical?.qty) || 0) * (parseNum(d.tile_chemical?.rate) || 0),
      (parseNum(d.tile_sand_cement?.sand_qty_brass) || 0) * (parseNum(d.tile_sand_cement?.sand_rate) || 0)
        + (parseNum(d.tile_sand_cement?.cement_bags) || 0) * (parseNum(d.tile_sand_cement?.cement_rate) || 0),
      (parseNum(d.tile_labor?.rate_per_sqft) || 0) * (parseNum(d.tile_labor?.area_sqft) || 0),
    );
  }

  // 3. Painting
  function computePhase3(d) {
    return add(
      qr(d.putty, 'qty_kg', 'rate_per_kg'),
      qr(d.primer_ext, 'qty_ltr', 'rate_per_ltr'),
      qr(d.primer_int, 'qty_ltr', 'rate_per_ltr'),
      qr(d.paint_ext, 'qty_ltr', 'rate_per_ltr'),
      qr(d.paint_int, 'qty_ltr', 'rate_per_ltr'),
      qr(d.oil_paint, 'qty_ltr', 'rate_per_ltr'),
      parseNum(d.painter_labor?.amount),
    );
  }

  // 4. Electrical
  function computePhase4(d) {
    return add(
      qr(d.switches, 'qty', 'rate'),
      qr(d.wires, 'qty_mtr', 'rate_per_mtr'),
      qr(d.conduits, 'qty_mtr', 'rate_per_mtr'),
      qr(d.lights, 'qty', 'rate'),
      qr(d.metering, 'qty', 'rate'),
      (parseNum(d.electrician_labor?.qty) || 0) * (parseNum(d.electrician_labor?.rate) || 0),
    );
  }

  // 5. Furniture & Fabrication
  function computePhase5(d) {
    return add(
      qr(d.door_frames, 'qty', 'rate'),
      qr(d.flush_doors, 'qty', 'rate'),
      qr(d.windows, 'qty', 'rate'),
      qr(d.glass_railing, 'length_rft', 'rate_per_rft'),
      qr(d.hardware, 'qty', 'rate'),
      parseNum(d.fab_labor?.amount),
    );
  }

  // 6. Plumbing
  function computePhase6(d) {
    return add(
      qr(d.ext_pipes, 'qty_mtr', 'rate_per_mtr'),
      qr(d.ext_fittings, 'qty', 'rate'),
      (parseNum(d.drainage_lines?.length_mtr) || 0) * (parseNum(d.drainage_lines?.rate_per_mtr) || 0)
        + (parseNum(d.drainage_lines?.manholes) || 0) * (parseNum(d.drainage_lines?.manhole_rate) || 0),
      qr(d.int_pipes, 'qty_mtr', 'rate_per_mtr'),
      qr(d.int_fittings, 'qty', 'rate'),
      qr(d.taps, 'qty', 'rate'),
      qr(d.bath_fittings, 'qty', 'rate'),
      (parseNum(d.plumber_labor?.qty) || 0) * (parseNum(d.plumber_labor?.rate) || 0),
    );
  }

  // 7. POP
  function computePhase7(d) {
    return add(
      qr(d.pop_bags, 'qty_bags', 'rate_per_bag'),
      qr(d.framing, 'area_sqft', 'rate_per_sqft'),
      parseNum(d.pop_other?.amount),
      (parseNum(d.pop_labor?.area_sqft) || 0) * (parseNum(d.pop_labor?.rate_per_sqft) || 0),
    );
  }

  // 8. Lift
  function computePhase8(d) {
    return add(
      parseNum(d.lift_unit?.amount),
      parseNum(d.shaft?.amount),
      (parseNum(d.doors_panels?.floors) || 0) * (parseNum(d.doors_panels?.rate_per_floor) || 0),
      parseNum(d.lift_install?.amount),
    );
  }

  // 9. Other (Misc)
  function computePhase9(d) {
    return parseNum(d.misc_expenses?.amount);
  }

  // Phase 10: Interior (renamed from Phase 9)
  function computePhase10(d) {
    let t = 0;

    // 9A — Subfloor prep
    const floorPrepTotal = sumRows(d.floor_prep_rows || [], r =>
      add(mul(r.labor_hours, r.labor_rate), r.material_cost)
    );
    t += floorPrepTotal;

    // 9A — Finish flooring (coverage × (1 + waste%) × unit price + labor + underlayment)
    const floorFinishTotal = sumRows(d.flooring_int_rows || [], r => {
      const coverage = parseNum(r.coverage_sqft);
      const wastePct = parseNum(r.waste_pct) / 100;
      const adjCoverage = coverage * (1 + wastePct);
      return add(
        mul(adjCoverage, r.price),
        mul(coverage, r.labor_rate),
        mul(coverage, r.underlay_price)
      );
    });
    t += floorFinishTotal;

    // Transition strips + grout (grout color is a free-text label, no cost)
    const transStripsTotal = mul(d.trans_strips_count, d.trans_strip_price);
    t += transStripsTotal;

    // 9B — Cabinet box / doors
    const cabBox = add(
      mul(d.cab_base_lf, d.cab_base_rate),
      mul(d.cab_upper_lf, d.cab_upper_rate),
      mul(d.cab_pantry_lf, d.cab_pantry_rate),
      mul(add(d.cab_base_lf, d.cab_upper_lf, d.cab_pantry_lf), d.cab_install_rate),
      parseNum(d.millwork_lump)
    );
    t += cabBox;

    // 9B — Cabinet hardware
    const cabHw = add(
      mul(d.pulls_knobs_count, d.pull_unit_price),
      mul(d.drawer_box_count, d.drawer_box_price),
      mul(d.hinge_qty, d.hinge_unit_price),
      mul(d.drawer_box_count, d.softclose_price)
    );
    t += cabHw;

    // 9C — Door slabs & jambs (sum from table)
    const doorSlabTotal = sumRows(d.door_slab_rows || [], r => {
      const qty = parseNum(r.qty);
      return add(
        mul(qty, r.slab_price),
        mul(qty, r.jamb_set_price),
        mul(qty, r.install_price)
      );
    });
    t += doorSlabTotal;

    // 9C — Door hardware
    const doorHw = add(
      mul(d.passage_count, d.passage_price),
      mul(d.privacy_count, d.privacy_price),
      mul(d.dummy_count, d.dummy_price),
      mul(d.door_stops_count, d.door_stop_price),
      mul(add(d.passage_count, d.privacy_count, d.dummy_count, d.door_stops_count) * 3, d.hinge_finish_price) // 3 hinges per door approx
    );
    t += doorHw;

    // 9D — Trim base + casing rows
    const trimBaseTotal = sumRows(d.trim_base_rows || [], r => {
      const lf = parseNum(r.lf);
      return add(
        mul(lf, r.price_lf),
        mul(lf, r.labor_lf),
        mul(parseNum(r.corners), r.corner_price)
      );
    });
    t += trimBaseTotal;

    // 9D — Crown + wainscoting
    const crownAndWainscot = add(
      mul(d.crown_lf, d.crown_price_lf),
      mul(d.crown_lf, d.crown_labor_lf),
      mul(d.wainscot_sqft, d.wainscot_price),
      mul(d.wainscot_sqft, d.wainscot_labor)
    );
    t += crownAndWainscot;

    // 9D — Stair components
    const stairTotal = add(
      mul(d.tread_count, d.tread_price),
      mul(d.riser_count, d.riser_price),
      parseNum(d.stair_labor_lump),
      mul(d.baluster_count, d.baluster_price),
      mul(d.newel_count, d.newel_price)
    );
    t += stairTotal;

    // 9E — Paint prep
    const paintPrepTotal = sumRows(d.paint_prep_rows || [], r =>
      add(
        mul(r.caulk_tubes, 8),
        mul(r.filler_tubs, 25),
        parseNum(r.sandpaper_cost),
        parseNum(r.tape_plastic_cost)
      )
    );
    t += paintPrepTotal;

    // 9E — Primer (gallons × price/gal)
    const paintCoatRows = d.paint_coat_rows || [];
    const totalSqft = paintCoatRows.reduce((s, r) => s + parseNum(r.sqft), 0);
    const primerCoverage = parseNum(d.primer_coverage) || 300;
    const primerGallons = primerCoverage > 0 ? Math.ceil(totalSqft / primerCoverage) : 0;
    const primerTotal = mul(primerGallons, d.primer_price_gal);
    t += primerTotal;

    // 9E — Coatings
    const paintCoatTotal = sumRows(paintCoatRows, r => {
      const sqft = parseNum(r.sqft);
      const coats = parseNum(r.coats);
      const coverage = parseNum(r.coverage);
      const gallons = coverage > 0 ? (sqft * coats) / coverage : 0;
      return add(
        mul(gallons, r.price_per_gal),
        mul(sqft, r.labor_sqft)
      );
    });
    t += paintCoatTotal;

    // 9F — Closet systems
    const closetTotal = add(
      mul(d.closet_lf, d.closet_rate_lf),
      mul(d.closet_lf, d.closet_install_lf),
      mul(d.closet_drawer_count, d.closet_drawer_price),
      parseNum(d.closet_accessories_lump)
    );
    t += closetTotal;

    // 9F — Glass & mirrors
    const glassTotal = sumRows(d.glass_rows || [], r => {
      const qty = parseNum(r.qty);
      return add(mul(qty, r.unit_price), mul(qty, r.install));
    });
    t += glassTotal;

    // 9F — Shower + vanity mirror lump sums
    const showerAndMirror = add(
      parseNum(d.shower_lump),
      mul(d.vanity_mirror_sqft, d.mirror_price_sqft)
    );
    t += showerAndMirror;

    // 9F — Misc custom fixtures
    const fixtureTotal = sumRows(d.fixture_int_rows || [], r => {
      const qty = parseNum(r.qty);
      return add(mul(qty, r.unit_price), parseNum(r.labor));
    });
    t += fixtureTotal;

    // Push all section totals to the DOM
    updateEl('p10-floor-prep-total', fmt(floorPrepTotal));
    updateEl('p10-flooring-total', fmt(add(floorFinishTotal, transStripsTotal)));
    updateEl('p10-cab-box-total', fmt(cabBox));
    updateEl('p10-cab-hw-total', fmt(cabHw));
    updateEl('p10-door-slab-total', fmt(doorSlabTotal));
    updateEl('p10-door-hw-total', fmt(doorHw));
    updateEl('p10-trim-base-total', fmt(add(trimBaseTotal, crownAndWainscot)));
    updateEl('p10-trim-stair-total', fmt(stairTotal));
    updateEl('p10-paint-prep-total', fmt(paintPrepTotal));
    updateEl('p10-paint-coat-total', fmt(add(primerTotal, paintCoatTotal)));
    updateEl('p10-closet-total', fmt(closetTotal));
    updateEl('p10-glass-total', fmt(add(glassTotal, showerAndMirror)));
    updateEl('p10-fixture-total', fmt(fixtureTotal));

    return t;
  }

  // ── Master Total Update ────────────────────────────────
  function computeProjectTotal(project) {
    try {
      if (!project || !Array.isArray(project.phases)) return 0;
      return project.phases.reduce((s, ph) => s + computePhaseTotal(ph), 0);
    } catch {
      return 0;
    }
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
        const phaseBudget = proj.totalBudget / proj.phases.length;
        const pct = Math.min(150, (phTotal / phaseBudget) * 100);
        const barEl = document.getElementById(`budget-bar-${phase.id}`);
        if (barEl) {
          barEl.style.width = Math.min(100, pct) + '%';
          if (pct > 120) barEl.style.background = 'linear-gradient(90deg, var(--warning), #B85F4E)';
          else if (pct > 90) barEl.style.background = 'linear-gradient(90deg, var(--warning), #9E7758)';
          else barEl.style.background = 'linear-gradient(90deg, var(--success), var(--off-white-dim))';
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
        else if (healthPct > 85) bar.style.background = '#D9B68E';
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
