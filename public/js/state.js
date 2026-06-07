/* ═══════════════════════════════════════════
   STATE.JS — App State & Persistence v3
   Supabase-backed with localStorage fallback
   ═══════════════════════════════════════════ */

const State = (() => {
  // Legacy localStorage key — kept unchanged to avoid orphaning
  // existing project data. (RECON was previously called "build manager".)
  const STORAGE_KEY = 'buildmanager_v2';
  const SAVE_DEBOUNCE = 800; // ms

  // Map legacy emoji icons → new SVG icon names. Applied on every
  // load so old projects (saved with emoji icons) get normalized
  // to the new monochrome SVG vocabulary.
  const LEGACY_ICON_MAP = {
    '📋': 'listChecks',     // pre-construction / permits
    '🏗': 'building',       // construction group / foundation
    '🪵': 'framing',        // framing
    '⚡': 'zap',            // MEP rough-in / temp power
    '🧱': 'insulation',     // insulation
    '🎨': 'palette',        // finishes
    '🔌': 'plug',           // final MEP
    '✅': 'checkCircle',    // punch list
    '🛋': 'sofa',           // interior
    '🛠': 'tools',          // tools group / custom fixtures
    '👷': 'userCircle',     // subcontractor
    '🤖': 'bot',            // AI
    '📊': 'dashboard',      // dashboard / overview
    '💬': 'chat',           // chat
    '📄': 'file',           // file / export
    '🧰': 'tools',          // toolkit
    '🛰': 'satellite',      // survey
    '⛏': 'pickaxe',        // earthwork
    '🚰': 'pipe',           // utility
    '🏠': 'roof',
    '🪟': 'window',
    '❄️': 'snowflake',
    '🚿': 'droplet',
    '🧤': 'insulation',
    '🍳': 'sofa',
    '💡': 'lightbulb',
    '🪨': 'column',
    '🧹': 'broom',
    '🔧': 'wrench',
    '🔩': 'wrenchScrew',
    '🚪': 'door',
    '🔑': 'key',
    '🏛': 'column',
    '🪜': 'stairs',
    '🖌': 'paintbrush',
    '👔': 'shirt',
    '🪞': 'mirror',
  };
  function normalizeIcon(name) {
    if (!name) return name;
    if (LEGACY_ICON_MAP[name]) return LEGACY_ICON_MAP[name];
    return name;
  }
  function normalizePhaseIcons(phases) {
    if (!Array.isArray(phases)) return phases;
    phases.forEach(p => {
      if (p && p.icon) p.icon = normalizeIcon(p.icon);
    });
    return phases;
  }

  // 9 trade-based construction phases (1-9) + Interior (#10).
  // The 9 trades reflect the standard Indian contractor workflow:
  // civil structure, tiles, paint, electrical, fabrication, plumbing,
  // POP/false ceiling, lift/elevator, and a misc catch-all.
  const defaultPhases = () => [
    { id: 1, name: 'Civil Work',         icon: 'pickaxe',    completion: 0, data: {} },
    { id: 2, name: 'Tiles & Flooring',  icon: 'ruler',      completion: 0, data: {} },
    { id: 3, name: 'Painting',          icon: 'paintbrush', completion: 0, data: {} },
    { id: 4, name: 'Electrical Work',   icon: 'zap',        completion: 0, data: {} },
    { id: 5, name: 'Furniture & Fabrication', icon: 'door',  completion: 0, data: {} },
    { id: 6, name: 'Plumbing Work',     icon: 'droplet',    completion: 0, data: {} },
    { id: 7, name: 'POP & False Ceiling', icon: 'insulation', completion: 0, data: {} },
    { id: 8, name: 'Lift (Elevator)',   icon: 'stairs',     completion: 0, data: {} },
    { id: 9, name: 'Other (Misc.)',     icon: 'listChecks', completion: 0, data: {} },
    { id: 10, name: 'Interior',          icon: 'sofa',       completion: 0, data: {} },
  ];

  const DEFAULT_PHASE_META = [
    { phase_number: 1, name: 'Civil Work',         icon: 'pickaxe' },
    { phase_number: 2, name: 'Tiles & Flooring',  icon: 'ruler' },
    { phase_number: 3, name: 'Painting',          icon: 'paintbrush' },
    { phase_number: 4, name: 'Electrical Work',   icon: 'zap' },
    { phase_number: 5, name: 'Furniture & Fabrication', icon: 'door' },
    { phase_number: 6, name: 'Plumbing Work',     icon: 'droplet' },
    { phase_number: 7, name: 'POP & False Ceiling', icon: 'insulation' },
    { phase_number: 8, name: 'Lift (Elevator)',   icon: 'stairs' },
    { phase_number: 9, name: 'Other (Misc.)',     icon: 'listChecks' },
    { phase_number: 10, name: 'Interior',         icon: 'sofa' },
  ];

  // Section map for data migration
  const INPUT_SECTION_MAP = {
    soil_bearing: 'survey', water_table: 'survey', soil_class: 'survey', site_slope: 'survey',
    geotech_cost: 'survey', soil_test_fee: 'survey', soil_test_count: 'survey', survey_engineer_fee: 'survey',
    power_conn: 'temp_infra', power_monthly: 'temp_infra', power_months: 'temp_infra',
    water_id: 'temp_infra', water_monthly: 'temp_infra', water_months: 'temp_infra',
    porta_weekly: 'temp_infra', porta_weeks: 'temp_infra',
    fence_lf: 'temp_infra', fence_rate: 'temp_infra',
    dumpster_pickups: 'temp_infra', dumpster_rate: 'temp_infra',
    trailer_monthly: 'temp_infra', trailer_months: 'temp_infra',
    cut_vol: 'earthwork', fill_vol: 'earthwork', haul_loads: 'earthwork',
    equip_rate: 'earthwork', equip_days: 'earthwork', op_rate: 'earthwork', op_days: 'earthwork',
    haul_cost_per_load: 'earthwork', disposal_fee: 'earthwork',
    foundation_type: 'concrete', concrete_psi: 'concrete', concrete_volume: 'concrete',
    concrete_price_per_yard: 'concrete', rebar_size: 'concrete', rebar_lf: 'concrete',
    rebar_price_per_lf: 'concrete', vapor_mil: 'concrete', formwork_cost: 'concrete',
    readymix_delivery: 'concrete', pump_rental: 'concrete', cure_time: 'concrete',
    sewer_dia: 'utility', sewer_lf: 'utility', sewer_price: 'utility',
    water_material: 'utility', water_lf: 'utility', water_price: 'utility',
    conduit_sched: 'utility', conduit_lf: 'utility', conduit_price: 'utility',
    trench_rate: 'utility', trench_lf: 'utility', bedding_tons: 'utility',
    bedding_price: 'utility', inspection_fee: 'utility',
  };

  let store = {
    projects: [],
    currentProjectId: null,
    version: 3,
  };

  let _saveTimer = null;
  let _useSupabase = false;
  let _loadInProgress = false;
  let _loadComplete = false;
  let _loadResolvers = [];

  // ── Supabase Helpers ─────────────────────────────
  function sb() {
    return SupabaseClient?.getClient?.() || null;
  }

  function userId() {
    return SupabaseClient?.getUser?.()?.id || null;
  }

  // ── Load ─────────────────────────────────────────
  async function load() {
    if (_loadInProgress) {
      // De-duplicate: return existing promise
      return new Promise(resolve => _loadResolvers.push(resolve));
    }
    _loadInProgress = true;

    // Always load localStorage first (instant)
    loadLocal();

    // Then try Supabase if available
    if (typeof SupabaseClient !== 'undefined') {
      try {
        await new Promise((resolve) => {
          SupabaseClient.onReady(resolve);
        });
        const client = sb();
        if (client && SupabaseClient.isAuthenticated()) {
          _useSupabase = true;
          try {
            await loadFromSupabase();
            console.log('[State] Loaded from Supabase');
          } catch (err) {
            console.warn('[State] Supabase load failed, using localStorage:', err.message);
          }
        }
      } catch (err) {
        console.warn('[State] Supabase init error:', err.message);
      }
    }

    _loadComplete = true;
    _loadInProgress = false;
    _loadResolvers.forEach(r => r());
    _loadResolvers = [];

    // Notify any listeners waiting for load
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('stateloaded'));
    }
    return store;
  }

  function onLoaded(cb) {
    if (_loadComplete) cb();
    else _loadResolvers.push(cb);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        store = JSON.parse(raw);
        // Add any missing phases (e.g. phase 10 added to schema)
        if (Array.isArray(store.projects)) {
          store.projects.forEach(p => {
            for (let i = 1; i <= 10; i++) {
              if (!p.phases.find(ph => ph.id === i)) {
                const meta = DEFAULT_PHASE_META[i - 1];
                p.phases.push({ id: i, name: meta.name, icon: meta.icon, completion: 0, data: {} });
              }
            }
          });
        }
        const normalized = normalizePhaseIcons(store.projects);
        // Persist the normalized icons + new phases back
        saveLocal();
        migrateOrphanedData();
      }
    } catch (e) { console.warn('Local load error', e); }
  }

  async function loadFromSupabase() {
    const client = sb();
    const uid = userId();
    if (!client || !uid) return;

    // Fetch projects
    const { data: projects, error: projErr } = await client
      .from('projects')
      .select('*')
      .eq('user_id', uid)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (projErr) throw projErr;
    if (!projects || projects.length === 0) {
      // Check if localStorage has data to migrate
      if (store.projects.length > 0) {
        console.log('[State] Found localStorage data — migrating to Supabase');
        await migrateToSupabase();
        return;
      }
      store.projects = [];
      saveLocal();
      return;
    }

    // Fetch phases, subs, punch items for each project
    const fullProjects = [];
    for (const proj of projects) {
      const [phasesRes, subsRes, punchRes] = await Promise.all([
        client.from('phases').select('*').eq('project_id', proj.id).order('phase_number'),
        client.from('subcontractors').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('punch_items').select('*').eq('project_id', proj.id).order('created_at'),
      ]);

      // Map Supabase format → app format
      const phases = (phasesRes.data || []).map(p => ({
        id: p.phase_number,
        _dbId: p.id,
        name: p.name,
        icon: p.icon,
        completion: p.completion || 0,
        data: p.data || {},
      }));

      // Fill missing phases (1-10: 9 trades + interior)
      for (let i = 1; i <= 10; i++) {
        if (!phases.find(p => p.id === i)) {
          const meta = DEFAULT_PHASE_META[i - 1];
          phases.push({ id: i, name: meta.name, icon: meta.icon, completion: 0, data: {} });
        }
      }
      phases.sort((a, b) => a.id - b.id);
      normalizePhaseIcons(phases);

      fullProjects.push({
        id: proj.id,
        name: proj.name,
        address: proj.address || '',
        client: proj.client || '',
        type: proj.type || 'residential',
        totalBudget: parseFloat(proj.total_budget) || 0,
        contingency: parseFloat(proj.contingency) || 10,
        currency: proj.currency || 'INR',
        contractor: proj.contractor || '',
        startDate: proj.start_date || '',
        endDate: proj.end_date || '',
        notes: proj.notes || '',
        createdAt: proj.created_at,
        archived: proj.archived,
        phases,
        subcontractors: (subsRes.data || []).map(s => ({
          id: s.id,
          trade: s.trade, company: s.company, contact: s.contact,
          phone: s.phone, email: s.email, phase: s.phase,
          contract: s.contract, paid: s.paid, retention: s.retention,
          notes: s.notes, createdAt: s.created_at,
        })),
        punchItems: (punchRes.data || []).map(p => ({
          id: p.id,
          itemNumber: p.item_number, description: p.description,
          location: p.location, assignedTo: p.assigned_to,
          priority: p.priority, status: p.status,
          createdAt: p.created_at, resolvedAt: p.resolved_at,
        })),
        invoices: [],
      });
    }

    store.projects = fullProjects;
    if (fullProjects.length > 0 && !store.currentProjectId) {
      store.currentProjectId = fullProjects[0].id;
    }
    saveLocal();
  }

  async function migrateToSupabase() {
    const client = sb();
    const uid = userId();
    if (!client || !uid) return;

    console.log('[State] Migrating', store.projects.length, 'projects to Supabase...');

    for (const proj of store.projects) {
      try {
        // Insert project
        const { data: newProj, error: projErr } = await client.from('projects').insert({
          user_id: uid,
          name: proj.name,
          address: proj.address || '',
          client: proj.client || '',
          type: proj.type || 'residential',
          total_budget: proj.totalBudget || 0,
          contingency: proj.contingency || 10,
          currency: proj.currency || 'INR',
          contractor: proj.contractor || '',
          start_date: proj.startDate || null,
          end_date: proj.endDate || null,
          notes: proj.notes || '',
        }).select().single();

        if (projErr) { console.error('Migration proj error:', projErr); continue; }

        // Insert phases
        const phaseInserts = (proj.phases || defaultPhases()).map(p => ({
          project_id: newProj.id,
          phase_number: p.id,
          name: p.name,
          icon: p.icon,
          completion: p.completion || 0,
          data: JSON.stringify(p.data || {}),
        }));
        const { error: migPhaseErr } = await client.from('phases').insert(phaseInserts);
        if (migPhaseErr) console.warn('[State] Migration phase insert warning:', migPhaseErr.message);

        // Insert subcontractors
        if (proj.subcontractors?.length) {
          const subInserts = proj.subcontractors.map(s => ({
            project_id: newProj.id,
            trade: s.trade || '', company: s.company || '',
            contact: s.contact || '', phone: s.phone || '',
            email: s.email || '', phase: s.phase || '',
            contract: s.contract || 0, paid: s.paid || 0,
            retention: s.retention || 0, notes: s.notes || '',
          }));
          await client.from('subcontractors').insert(subInserts);
        }

        // Insert punch items
        if (proj.punchItems?.length) {
          const punchInserts = proj.punchItems.map((p, i) => ({
            project_id: newProj.id,
            item_number: p.itemNumber || `P-${String(i + 1).padStart(3, '0')}`,
            description: p.description || '',
            location: p.location || '',
            assigned_to: p.assignedTo || '',
            priority: p.priority || 'normal',
            status: p.status || 'open',
            created_at: p.createdAt || new Date().toISOString(),
            resolved_at: p.resolvedAt || null,
          }));
          await client.from('punch_items').insert(punchInserts);
        }

        // Update local project ID to match Supabase
        proj.id = newProj.id;

        console.log('[State] Migrated:', proj.name);
      } catch (err) {
        console.error('[State] Migration error for', proj.name, ':', err);
      }
    }

    // Reload from Supabase to get consistent IDs
    await loadFromSupabase();
    console.log('[State] Migration complete!');
  }

  // ── Save ─────────────────────────────────────────
  function save() {
    saveLocal();
    if (_useSupabase) {
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(saveToSupabase, SAVE_DEBOUNCE);
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) { console.warn('Local save error', e); }
  }

  async function saveToSupabase() {
    const client = sb();
    const uid = userId();
    if (!client || !uid) return;

    const proj = getCurrentProject();
    if (!proj) return;

    // Only save if this project lives in Supabase (UUID)
    if (!isUUID(proj.id)) return;

    try {
      // Update project metadata
      await client.from('projects').update({
        name: proj.name,
        address: proj.address || '',
        client: proj.client || '',
        type: proj.type || 'residential',
        total_budget: proj.totalBudget || 0,
        contingency: proj.contingency || 10,
        currency: proj.currency || 'INR',
        contractor: proj.contractor || '',
        start_date: proj.startDate || null,
        end_date: proj.endDate || null,
        notes: proj.notes || '',
        archived: proj.archived || false,
      }).eq('id', proj.id);

      // Update phases
      for (const phase of proj.phases) {
        await client.from('phases').upsert({
          id: phase._dbId || undefined,
          project_id: proj.id,
          phase_number: phase.id,
          name: phase.name,
          icon: phase.icon,
          completion: phase.completion || 0,
          data: JSON.stringify(phase.data || {}),
        }, { onConflict: 'project_id,phase_number' });
      }

    } catch (err) {
      console.warn('[State] Supabase save error:', err.message);
    }
  }

  // ── Utility ──────────────────────────────────────
  function isUUID(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  // ── Data Migration ───────────────────────────────
  function migrateOrphanedData() {
    if (!store.projects) return;
    let migrated = false;

    store.projects.forEach(proj => {
      if (!proj.phases) return;
      proj.phases.forEach(phase => {
        const generalData = phase.data.general;
        if (!generalData || typeof generalData !== 'object') return;

        Object.entries(generalData).forEach(([key, val]) => {
          const correctSection = INPUT_SECTION_MAP[key];
          if (correctSection) {
            if (!phase.data[correctSection]) phase.data[correctSection] = {};
            if (phase.data[correctSection][key] === undefined) {
              phase.data[correctSection][key] = val;
              migrated = true;
            }
          }
        });

        if (migrated) delete phase.data.general;
      });
    });

    if (migrated) {
      console.log('[State] Migrated orphaned data from "general" to correct sections');
      saveLocal();
    }
  }

  // ── CRUD Operations ──────────────────────────────
  async function createProject(info) {
    const client = sb();
    const uid = userId();

    // Build project object
    const project = {
      name: info.name || 'Untitled Project',
      address: info.address || '',
      client: info.client || '',
      type: info.type || 'residential',
      totalBudget: parseFloat(info.totalBudget) || 0,
      contingency: parseFloat(info.contingency) || 10,
      currency: info.currency || 'INR',
      contractor: info.contractor || '',
      startDate: info.startDate || '',
      endDate: info.endDate || '',
      notes: info.notes || '',
      createdAt: new Date().toISOString(),
      phases: defaultPhases(),
      subcontractors: [],
      invoices: [],
      punchItems: [],
      archived: false,
    };

    if (_useSupabase && client && uid) {
      try {
        // Insert to Supabase
        const { data: newProj, error } = await client.from('projects').insert({
          user_id: uid,
          name: project.name,
          address: project.address,
          client: project.client,
          type: project.type,
          total_budget: project.totalBudget,
          contingency: project.contingency,
          currency: project.currency,
          contractor: project.contractor,
          start_date: project.startDate || null,
          end_date: project.endDate || null,
          notes: project.notes,
        }).select().single();

        if (error) throw error;

        project.id = newProj.id;

        // Insert 10 phases — stringify data for Supabase JSONB
        const phaseInserts = defaultPhases().map(p => ({
          project_id: newProj.id,
          phase_number: p.id,
          name: p.name,
          icon: p.icon,
          completion: 0,
          data: JSON.stringify({}),
        }));
        const { error: phaseErr } = await client.from('phases').insert(phaseInserts);
        if (phaseErr) console.warn('[State] Phase insert warning:', phaseErr.message);

        console.log('[State] Project created in Supabase:', project.name);
      } catch (err) {
        console.error('[State] Supabase create error, using local:', err);
        project.id = Date.now().toString();
      }
    } else {
      project.id = Date.now().toString();
    }

    store.projects.push(project);
    store.currentProjectId = project.id;
    saveLocal();
    return project;
  }

  function getCurrentProject() {
    if (!Array.isArray(store.projects)) return null;
    // If currentProjectId is set but no matching project, fall back
    // to the first project so the user always sees *something*.
    const found = store.projects.find(p => p.id === store.currentProjectId);
    if (found) return found;
    if (store.projects.length > 0) {
      const first = store.projects[0];
      console.warn('[State] currentProjectId not found, falling back to first project');
      store.currentProjectId = first.id;
      saveLocal();
      return first;
    }
    console.warn('[State] getCurrentProject: no projects exist');
    return null;
  }

  function getProjects() {
    return store.projects.filter(p => !p.archived);
  }

  function setCurrentProject(id) {
    store.currentProjectId = id;
    saveLocal();
  }

  function updatePhaseData(phaseId, sectionKey, data) {
    const proj = getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;
    if (!phase.data[sectionKey]) phase.data[sectionKey] = {};
    Object.assign(phase.data[sectionKey], data);
    save();
  }

  function getPhaseData(phaseId, sectionKey) {
    const proj = getCurrentProject();
    if (!proj) return {};
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return {};
    return phase.data[sectionKey] || {};
  }

  function setPhaseCompletion(phaseId, pct) {
    const proj = getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (phase) phase.completion = Math.min(100, Math.max(0, pct));
    save();
  }

  async function addSubcontractor(sub) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.subcontractors) proj.subcontractors = [];

    const client = sb();
    if (_useSupabase && client && isUUID(proj.id)) {
      try {
        const { data, error } = await client.from('subcontractors').insert({
          project_id: proj.id,
          trade: sub.trade || '', company: sub.company || '',
          contact: sub.contact || '', phone: sub.phone || '',
          email: sub.email || '', phase: sub.phase || '',
          contract: sub.contract || 0, paid: sub.paid || 0,
          retention: sub.retention || 0, notes: sub.notes || '',
        }).select().single();

        if (error) throw error;
        sub.id = data.id;
      } catch (err) {
        console.warn('[State] Supabase sub insert error:', err);
        sub.id = Date.now().toString();
      }
    } else {
      sub.id = Date.now().toString();
    }

    sub.createdAt = new Date().toISOString();
    proj.subcontractors.push(sub);
    saveLocal();
    return sub;
  }

  async function updateSubcontractor(id, updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    const idx = proj.subcontractors.findIndex(s => s.id === id);
    if (idx >= 0) Object.assign(proj.subcontractors[idx], updates);

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        await client.from('subcontractors').update({
          trade: updates.trade, company: updates.company,
          contact: updates.contact, phone: updates.phone,
          email: updates.email, phase: updates.phase,
          contract: updates.contract, paid: updates.paid,
          retention: updates.retention, notes: updates.notes,
        }).eq('id', id);
      } catch (err) { console.warn('[State] Sub update error:', err); }
    }
    saveLocal();
  }

  async function deleteSubcontractor(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.subcontractors = proj.subcontractors.filter(s => s.id !== id);

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try { await client.from('subcontractors').delete().eq('id', id); }
      catch (err) { console.warn('[State] Sub delete error:', err); }
    }
    saveLocal();
  }

  function addInvoice(invoice) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.invoices) proj.invoices = [];
    invoice.id = Date.now().toString();
    proj.invoices.push(invoice);
    save();
    return invoice;
  }

  async function addPunchItem(item) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.punchItems) proj.punchItems = [];

    const n = proj.punchItems.length + 1;
    item.status = item.status || 'open';
    item.createdAt = new Date().toISOString();

    const client = sb();
    if (_useSupabase && client && isUUID(proj.id)) {
      try {
        const { data, error } = await client.from('punch_items').insert({
          project_id: proj.id,
          item_number: `P-${String(n).padStart(3, '0')}`,
          description: item.description || '',
          location: item.location || '',
          assigned_to: item.assignedTo || '',
          priority: item.priority || 'normal',
          status: item.status,
        }).select().single();

        if (error) throw error;
        item.id = data.id;
        item.itemNumber = data.item_number;
      } catch (err) {
        console.warn('[State] Punch insert error:', err);
        item.id = `P-${String(n).padStart(3, '0')}`;
      }
    } else {
      item.id = `P-${String(n).padStart(3, '0')}`;
    }

    proj.punchItems.push(item);
    saveLocal();
    return item;
  }

  async function updatePunchItem(id, updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    const idx = proj.punchItems.findIndex(p => p.id === id);
    if (idx >= 0) Object.assign(proj.punchItems[idx], updates);

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        await client.from('punch_items').update({
          description: updates.description,
          location: updates.location,
          assigned_to: updates.assignedTo,
          priority: updates.priority,
          status: updates.status,
          resolved_at: updates.status === 'resolved' ? new Date().toISOString() : null,
        }).eq('id', id);
      } catch (err) { console.warn('[State] Punch update error:', err); }
    }
    saveLocal();
  }

  async function deletePunchItem(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.punchItems = proj.punchItems.filter(p => p.id !== id);

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try { await client.from('punch_items').delete().eq('id', id); }
      catch (err) { console.warn('[State] Punch delete error:', err); }
    }
    saveLocal();
  }

  function updateProjectInfo(updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    Object.assign(proj, updates);
    save();
  }

  async function deleteProject(id) {
    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try { await client.from('projects').delete().eq('id', id); }
      catch (err) { console.warn('[State] Project delete error:', err); }
    }
    store.projects = store.projects.filter(p => p.id !== id);
    if (store.currentProjectId === id) store.currentProjectId = null;
    saveLocal();
  }

  async function archiveProject(id) {
    const proj = store.projects.find(p => p.id === id);
    if (proj) proj.archived = true;
    if (store.currentProjectId === id) store.currentProjectId = null;

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try { await client.from('projects').update({ archived: true }).eq('id', id); }
      catch (err) { console.warn('[State] Archive error:', err); }
    }
    saveLocal();
  }

  // Initial load (sync)
  loadLocal();

  return {
    load, save, onLoaded,
    createProject, getCurrentProject, getProjects,
    setCurrentProject, updatePhaseData, getPhaseData, setPhaseCompletion,
    addSubcontractor, updateSubcontractor, deleteSubcontractor,
    addInvoice,
    addPunchItem, updatePunchItem, deletePunchItem,
    updateProjectInfo, deleteProject, archiveProject,
    get store() { return store; },
    get isCloud() { return _useSupabase; },
  };
})();
