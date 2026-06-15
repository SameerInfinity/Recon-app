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

  function parseJsonIfNeeded(val) {
    if (typeof val === 'string') {
      try {
        let parsed = val;
        while (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        return parsed || {};
      } catch (e) {
        return {};
      }
    }
    return val || {};
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

  // ── IndexedDB Local Image Storage ────────────────
  const LocalImages = (() => {
    const DB_NAME = 'recon_local_images';
    const DB_VERSION = 1;
    const STORE_NAME = 'images';
    let _db = null;

    function init() {
      return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = (e) => {
          _db = e.target.result;
          resolve(_db);
        };
        request.onerror = () => {
          resolve(null);
        };
      });
    }

    function get(key) {
      return new Promise((resolve) => {
        if (!_db) {
          resolve(null);
          return;
        }
        try {
          const tx = _db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    function set(key, val) {
      return new Promise((resolve) => {
        if (!_db) {
          resolve(false);
          return;
        }
        try {
          const tx = _db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(val, key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }

    function remove(key) {
      return new Promise((resolve) => {
        if (!_db) {
          resolve(false);
          return;
        }
        try {
          const tx = _db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }

    return { init, get, set, remove };
  })();

  const InMemoryImages = {};

  function getLocalImage(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('local-image://')) {
      const key = url.replace('local-image://', '');
      return InMemoryImages[key] || '';
    }
    return url;
  }

  async function saveLocalImage(key, base64) {
    if (!key || !base64) return false;
    InMemoryImages[key] = base64;
    await LocalImages.init();
    return await LocalImages.set(key, base64);
  }

  async function deleteLocalImage(key) {
    if (!key) return false;
    delete InMemoryImages[key];
    await LocalImages.init();
    return await LocalImages.remove(key);
  }

  // Pre-load all local image references for the current project
  async function preLoadProjectImages() {
    const proj = getCurrentProject();
    if (!proj) return;
    await LocalImages.init();

    const keysToLoad = new Set();

    // 1. Scan phase entries for billPhotoUrl and paymentProofUrl
    if (Array.isArray(proj.phases)) {
      proj.phases.forEach(ph => {
        if (ph.data && ph.data.entries) {
          Object.values(ph.data.entries).forEach(arr => {
            if (Array.isArray(arr)) {
              arr.forEach(entry => {
                if (entry.billPhotoUrl && entry.billPhotoUrl.startsWith('local-image://')) {
                  keysToLoad.add(entry.billPhotoUrl.replace('local-image://', ''));
                }
                if (entry.paymentProofUrl && entry.paymentProofUrl.startsWith('local-image://')) {
                  keysToLoad.add(entry.paymentProofUrl.replace('local-image://', ''));
                }
              });
            }
          });
        }
        // Scan phase bills (for Scanned Bills Hub)
        if (Array.isArray(ph.bills)) {
          ph.bills.forEach(b => {
            if (b.image && b.image.startsWith('local-image://')) {
              keysToLoad.add(b.image.replace('local-image://', ''));
            }
            if (b._billPhotoUrl && b._billPhotoUrl.startsWith('local-image://')) {
              keysToLoad.add(b._billPhotoUrl.replace('local-image://', ''));
            }
          });
        }
      });
    }

    // 2. Scan buyer payments in flat sales
    if (Array.isArray(proj.buyers)) {
      proj.buyers.forEach(b => {
        if (Array.isArray(b.payments)) {
          b.payments.forEach(p => {
            if (p.proofUrl && p.proofUrl.startsWith('local-image://')) {
              keysToLoad.add(p.proofUrl.replace('local-image://', ''));
            }
          });
        }
      });
    }

    // Load from IndexedDB into memory
    for (const key of keysToLoad) {
      if (!InMemoryImages[key]) {
        try {
          const data = await LocalImages.get(key);
          if (data) InMemoryImages[key] = data;
        } catch (err) {
          console.warn('[State] Error preloading image:', key, err);
        }
      }
    }
  }

  // ── Sync Queue ───────────────────────────────────
  const SYNC_QUEUE_KEY = 'recon_sync_queue';

  function getSyncQueue() {
    try {
      const raw = localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  }

  function saveSyncQueue(queue) {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch(e) {
      console.error('[Sync] Queue save error:', e);
    }
  }

  function enqueueMutation(action, table, id, payload) {
    const queue = getSyncQueue();
    if (action === 'update') {
      const existing = queue.find(q => q.action === 'update' && q.table === table && q.id === id);
      if (existing) {
        Object.assign(existing.payload, payload);
        saveSyncQueue(queue);
        return;
      }
    }
    if (action === 'delete') {
      const filtered = queue.filter(q => !(q.table === table && q.id === id));
      filtered.push({ action, table, id, payload, timestamp: Date.now() });
      saveSyncQueue(filtered);
      return;
    }
    queue.push({ action, table, id, payload, timestamp: Date.now() });
    saveSyncQueue(queue);
    window.dispatchEvent(new CustomEvent('syncqueuechanged'));
  }

  let _isReplaying = false;

  async function replaySyncQueue() {
    const client = sb();
    const uid = userId();
    if (!client || !uid) return;
    if (_isReplaying) return;

    const queue = getSyncQueue();
    if (queue.length === 0) return;

    _isReplaying = true;
    console.log('[Sync] Replaying', queue.length, 'queued mutations...');
    window.dispatchEvent(new CustomEvent('syncstart'));

    let failed = false;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      let success = false;
      try {
        if (item.action === 'insert') {
          const { error } = await client.from(item.table).insert(item.payload);
          if (!error) success = true;
          else console.warn(`[Sync] Queue insert error for table ${item.table}:`, error.message);
        } else if (item.action === 'update') {
          const { error } = await client.from(item.table).update(item.payload).eq('id', item.id);
          if (!error) success = true;
          else console.warn(`[Sync] Queue update error for table ${item.table}:`, error.message);
        } else if (item.action === 'delete') {
          const { error } = await client.from(item.table).delete().eq('id', item.id);
          if (!error) success = true;
          else console.warn(`[Sync] Queue delete error for table ${item.table}:`, error.message);
        }
      } catch (err) {
        console.warn(`[Sync] Queue network exception for table ${item.table}:`, err.message);
      }

      if (success) {
        const currentQueue = getSyncQueue();
        const updated = currentQueue.filter(q => !(q.id === item.id && q.timestamp === item.timestamp));
        saveSyncQueue(updated);
        window.dispatchEvent(new CustomEvent('syncqueuechanged'));
      } else {
        failed = true;
        break;
      }
    }

    _isReplaying = false;
    window.dispatchEvent(new CustomEvent('syncend', { detail: { success: !failed } }));
    console.log('[Sync] Replay completed.', failed ? 'Some items failed.' : 'All items synced.');

    if (!failed) {
      try {
        await loadFromSupabase();
        _notifySynced();
      } catch(e) {}
    }
  }

  function hasUnsyncedChanges() {
    return getSyncQueue().length > 0;
  }

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
          const uid = userId();
          if (uid && Array.isArray(store.projects)) {
            store.projects.forEach(p => {
              if (!p.userId && !isUUID(p.id)) {
                p.userId = uid;
              }
            });
            saveLocal();
          }
          try {
            await loadFromSupabase();
            console.log('[State] Loaded from Supabase');
            _notifySynced(); // Tell app.js to re-render with fresh data
          } catch (err) {
            console.warn('[State] Supabase load failed, using localStorage:', err.message);
          }
        }
      } catch (err) {
        console.warn('[State] Supabase init error:', err.message);
      }
    }

    await preLoadProjectImages();
    _loadComplete = true;
    _loadInProgress = false;
    _loadResolvers.forEach(r => r());
    _loadResolvers = [];

    // Notify listeners waiting for initial load
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('stateloaded'));
    }
    return store;
  }

  // Called after Supabase sync completes — triggers a UI re-render
  // so fresh cloud data is shown even if localStorage rendered first
  function _notifySynced() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('statesynced'));
    }
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
            if (Array.isArray(p.phases)) {
              p.phases.forEach(ph => {
                ph.data = parseJsonIfNeeded(ph.data);
              });
            }
            for (let i = 1; i <= 10; i++) {
              if (!p.phases.find(ph => ph.id === i)) {
                const meta = DEFAULT_PHASE_META[i - 1];
                p.phases.push({ id: i, name: meta.name, icon: meta.icon, completion: 0, data: {} });
              }
            }
            // Migrate new feature arrays (added in later versions)
            if (!p.labour) p.labour = [];
            if (!p.labourLogs) p.labourLogs = [];
            if (!p.vendors) p.vendors = [];
            if (!p.vendorTransactions) p.vendorTransactions = [];
            if (!p.materials) p.materials = [];
            if (!p.materialLogs) p.materialLogs = [];
            if (!p.raBills) p.raBills = [];
            if (!p.buyers) p.buyers = [];
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

    // Retain existing local-only projects for the current user
    const localOnly = store.projects.filter(p => !isUUID(p.id) && String(p.userId) === String(uid));

    // Fetch projects
    const { data: projects, error: projErr } = await client
      .from('projects')
      .select('*')
      .eq('user_id', uid)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (projErr) throw projErr;
    if (!projects || projects.length === 0) {
      store.projects = localOnly;
      saveLocal();
      return;
    }

    // Fetch phases, subs, punch items for each project
    const fullProjects = [];
    for (const proj of projects) {
      const [phasesRes, subsRes, punchRes, labourRes, labourLogsRes, vendorsRes, vendorTxnsRes, materialsRes, materialLogsRes, raBillsRes] = await Promise.all([
        client.from('phases').select('*').eq('project_id', proj.id).order('phase_number'),
        client.from('subcontractors').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('punch_items').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('labour').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('labour_logs').select('*').eq('project_id', proj.id).order('log_date', { ascending: false }),
        client.from('vendors').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('vendor_transactions').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('materials').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('material_logs').select('*').eq('project_id', proj.id).order('created_at'),
        client.from('ra_bills').select('*').eq('project_id', proj.id).order('created_at'),
      ]);

      // Map Supabase format → app format
      const phases = (phasesRes.data || []).map(p => ({
        id: p.phase_number,
        _dbId: p.id,
        name: p.name,
        icon: p.icon,
        completion: p.completion || 0,
        data: parseJsonIfNeeded(p.data),
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

      // Load flat sales buyers from Phase 10 JSON data
      const phase10 = phases.find(ph => ph.id === 10);
      const buyers = phase10?.data?.buyers || [];

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
        userId: proj.user_id, // Match the owner user ID
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
        labour: (labourRes.data || []).map(l => ({
          id: l.id,
          name: l.name, role: l.role, dailyRate: l.daily_rate,
          phone: l.phone, balance: l.balance, active: l.active,
          createdAt: l.created_at
        })),
        labourLogs: (labourLogsRes.data || []).map(log => ({
          id: log.id,
          labourId: log.labour_id, logDate: log.log_date,
          status: log.status, kharchi: log.kharchi,
          notes: log.notes, createdAt: log.created_at
        })),
        vendors: (vendorsRes.data || []).map(v => ({
          id: v.id, name: v.name, shopName: v.shop_name, phone: v.phone,
          balance: parseFloat(v.balance) || 0, notes: v.notes, createdAt: v.created_at
        })),
        vendorTransactions: (vendorTxnsRes.data || []).map(t => ({
          id: t.id, vendorId: t.vendor_id, txnDate: t.txn_date, type: t.type,
          amount: parseFloat(t.amount) || 0, description: t.description, createdAt: t.created_at
        })),
        materials: (materialsRes.data || []).map(m => ({
          id: m.id, name: m.name, unit: m.unit, currentStock: parseFloat(m.current_stock) || 0,
          totalInward: parseFloat(m.total_inward) || 0, totalOutward: parseFloat(m.total_outward) || 0,
          notes: m.notes, createdAt: m.created_at
        })),
        materialLogs: (materialLogsRes.data || []).map(log => ({
          id: log.id, materialId: log.material_id, logDate: log.log_date, type: log.type,
          qty: parseFloat(log.qty) || 0, notes: log.notes, createdAt: log.created_at
        })),
        raBills: (raBillsRes.data || []).map(b => ({
          id: b.id, billNumber: b.bill_number, issueDate: b.issue_date, dueDate: b.due_date,
          workDescription: b.work_description, contractValue: parseFloat(b.contract_value) || 0,
          percentageComplete: parseFloat(b.percentage_complete) || 0, previousPaid: parseFloat(b.previous_paid) || 0,
          deductions: parseFloat(b.deductions) || 0, amountDue: parseFloat(b.amount_due) || 0,
          status: b.status, notes: b.notes, createdAt: b.created_at
        })),
        buyers,
        invoices: [],
      });
    }

    store.projects = [...localOnly, ...fullProjects];
    if (store.projects.length > 0 && !store.currentProjectId) {
      store.currentProjectId = store.projects[0].id;
    }
    saveLocal();
    await preLoadProjectImages();
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
          data: p.data || {},
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

        // Insert labour
        if (proj.labour?.length) {
          const labourInserts = proj.labour.map(l => ({
            id: isUUID(l.id) ? l.id : undefined,
            project_id: newProj.id,
            name: l.name || '',
            role: l.role || 'mazdoor',
            daily_rate: l.dailyRate || 0,
            phone: l.phone || '',
            balance: l.balance || 0,
            active: l.active !== false,
            created_at: l.createdAt || new Date().toISOString(),
          }));
          const { data: insertedLabour } = await client.from('labour').insert(labourInserts).select('id, name');
          
          // Note: migrating logs correctly requires mapping old temp IDs to new Supabase UUIDs
          // For now, if we generate UUIDs locally, we can just use them.
        }

        // Insert labour logs
        if (proj.labourLogs?.length) {
           const logInserts = proj.labourLogs.map(log => ({
             project_id: newProj.id,
             labour_id: log.labourId,
             log_date: log.logDate,
             status: log.status || 'full',
             kharchi: log.kharchi || 0,
             notes: log.notes || '',
             created_at: log.createdAt || new Date().toISOString()
           }));
           // Filter out logs with invalid labour_ids just in case
           const validLogs = logInserts.filter(l => isUUID(l.labour_id));
           if (validLogs.length) {
             await client.from('labour_logs').insert(validLogs);
           }
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
      // Serialize buyers into Phase 10's JSON data
      if (Array.isArray(proj.phases)) {
        const phase10 = proj.phases.find(ph => ph.id === 10);
        if (phase10) {
          phase10.data = phase10.data || {};
          phase10.data.buyers = proj.buyers || [];
        }
      }

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

      // Update phases — .select() captures the returned UUID into _dbId
      // so subsequent saves UPSERT the same row instead of inserting duplicates
      for (const phase of proj.phases) {
        const { data: upserted } = await client.from('phases').upsert({
          id: phase._dbId || undefined,
          project_id: proj.id,
          phase_number: phase.id,
          name: phase.name,
          icon: phase.icon,
          completion: phase.completion || 0,
          data: phase.data || {},
        }, { onConflict: 'project_id,phase_number' }).select('id').single();
        // Write UUID back so next save hits the same row
        if (upserted?.id && !phase._dbId) phase._dbId = upserted.id;
      }
      // Persist _dbIds back to localStorage so they survive a page reload
      saveLocal();

    } catch (err) {
      console.warn('[State] Supabase save error:', err.message);
    }
  }

  // ── Utility ──────────────────────────────────────
  function isUUID(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  function generateId() {
    return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
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
    const uid = userId();
    const localId = 'local_' + generateUUID();

    // Build project object
    const project = {
      id: localId,
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
      labour: [],
      labourLogs: [],
      vendors: [],
      vendorTransactions: [],
      materials: [],
      materialLogs: [],
      raBills: [],
      buyers: [],
      archived: false,
      userId: uid,
    };

    store.projects.push(project);
    store.currentProjectId = project.id;
    saveLocal();
    return project;
  }

  async function syncProjectToCloud(projectId) {
    const client = sb();
    const uid = userId();
    if (!client || !uid) {
      throw new Error('You must be signed in to sync projects to the cloud.');
    }

    const proj = store.projects.find(p => String(p.id) === String(projectId));
    if (!proj) throw new Error('Project not found.');

    // If already synced, do nothing
    if (isUUID(proj.id)) return proj.id;

    console.log('[State] Syncing project to cloud:', proj.name);

    // 1. Generate new UUIDs for all child items that need them, and map old local IDs to new UUIDs
    const idMap = {};

    // Map subcontractors
    if (Array.isArray(proj.subcontractors)) {
      proj.subcontractors.forEach(s => {
        if (!isUUID(s.id)) {
          const newId = generateUUID();
          idMap[s.id] = newId;
          s.id = newId;
        }
      });
    }

    // Map punch items
    if (Array.isArray(proj.punchItems)) {
      proj.punchItems.forEach(p => {
        if (!isUUID(p.id)) {
          const newId = generateUUID();
          idMap[p.id] = newId;
          p.id = newId;
        }
      });
    }

    // Map labour
    if (Array.isArray(proj.labour)) {
      proj.labour.forEach(l => {
        if (!isUUID(l.id)) {
          const newId = generateUUID();
          idMap[l.id] = newId;
          l.id = newId;
        }
      });
    }

    // Map labour logs (remap labourId)
    if (Array.isArray(proj.labourLogs)) {
      proj.labourLogs.forEach(log => {
        if (!isUUID(log.id)) {
          log.id = generateUUID();
        }
        if (idMap[log.labourId]) {
          log.labourId = idMap[log.labourId];
        }
      });
    }

    // Map vendors
    if (Array.isArray(proj.vendors)) {
      proj.vendors.forEach(v => {
        if (!isUUID(v.id)) {
          const newId = generateUUID();
          idMap[v.id] = newId;
          v.id = newId;
        }
      });
    }

    // Map vendor transactions (remap vendorId)
    if (Array.isArray(proj.vendorTransactions)) {
      proj.vendorTransactions.forEach(t => {
        if (!isUUID(t.id)) {
          t.id = generateUUID();
        }
        if (idMap[t.vendorId]) {
          t.vendorId = idMap[t.vendorId];
        }
      });
    }

    // Map materials
    if (Array.isArray(proj.materials)) {
      proj.materials.forEach(m => {
        if (!isUUID(m.id)) {
          const newId = generateUUID();
          idMap[m.id] = newId;
          m.id = newId;
        }
      });
    }

    // Map material logs (remap materialId)
    if (Array.isArray(proj.materialLogs)) {
      proj.materialLogs.forEach(log => {
        if (!isUUID(log.id)) {
          log.id = generateUUID();
        }
        if (idMap[log.materialId]) {
          log.materialId = idMap[log.materialId];
        }
      });
    }

    // Map RA bills
    if (Array.isArray(proj.raBills)) {
      proj.raBills.forEach(b => {
        if (!isUUID(b.id)) {
          b.id = generateUUID();
        }
      });
    }

    // 2. Insert project to projects table
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

    if (projErr) throw projErr;

    const newProjectId = newProj.id;

    // Serialize buyers into Phase 10's JSON data
    if (Array.isArray(proj.phases)) {
      const phase10 = proj.phases.find(ph => ph.id === 10);
      if (phase10) {
        phase10.data = phase10.data || {};
        phase10.data.buyers = proj.buyers || [];
      }
    }

    // 3. Insert phases
    const phaseInserts = (proj.phases || defaultPhases()).map(p => ({
      project_id: newProjectId,
      phase_number: p.id,
      name: p.name,
      icon: p.icon,
      completion: p.completion || 0,
      data: p.data || {},
    }));
    const { error: phaseErr } = await client.from('phases').insert(phaseInserts);
    if (phaseErr) throw phaseErr;

    // 4. Insert Subcontractors
    if (proj.subcontractors?.length) {
      const subInserts = proj.subcontractors.map(s => ({
        id: s.id,
        project_id: newProjectId,
        trade: s.trade || '',
        company: s.company || '',
        contact: s.contact || '',
        phone: s.phone || '',
        email: s.email || '',
        phase: s.phase || '',
        contract: s.contract || 0,
        paid: s.paid || 0,
        retention: s.retention || 0,
        notes: s.notes || '',
      }));
      const { error: subErr } = await client.from('subcontractors').insert(subInserts);
      if (subErr) throw subErr;
    }

    // 5. Insert Punch Items
    if (proj.punchItems?.length) {
      const punchInserts = proj.punchItems.map(p => ({
        id: p.id,
        project_id: newProjectId,
        item_number: p.itemNumber,
        description: p.description || '',
        location: p.location || '',
        assigned_to: p.assignedTo || '',
        priority: p.priority || 'normal',
        status: p.status || 'open',
        created_at: p.createdAt,
        resolved_at: p.resolvedAt || null,
      }));
      const { error: punchErr } = await client.from('punch_items').insert(punchInserts);
      if (punchErr) throw punchErr;
    }

    // 6. Insert Labour
    if (proj.labour?.length) {
      const labourInserts = proj.labour.map(l => ({
        id: l.id,
        project_id: newProjectId,
        name: l.name,
        role: l.role || 'mazdoor',
        daily_rate: l.dailyRate || 0,
        phone: l.phone || '',
        balance: l.balance || 0,
        active: l.active !== false,
        created_at: l.createdAt,
      }));
      const { error: labourErr } = await client.from('labour').insert(labourInserts);
      if (labourErr) throw labourErr;
    }

    // 7. Insert Labour Logs
    if (proj.labourLogs?.length) {
      const logInserts = proj.labourLogs.map(log => ({
        id: log.id,
        project_id: newProjectId,
        labour_id: log.labourId,
        log_date: log.logDate,
        status: log.status || 'full',
        kharchi: log.kharchi || 0,
        notes: log.notes || '',
        created_at: log.createdAt,
      }));
      const { error: logErr } = await client.from('labour_logs').insert(logInserts);
      if (logErr) throw logErr;
    }

    // 8. Insert Vendors
    if (proj.vendors?.length) {
      const vendorInserts = proj.vendors.map(v => ({
        id: v.id,
        project_id: newProjectId,
        name: v.name,
        shop_name: v.shopName || '',
        phone: v.phone || '',
        balance: v.balance || 0,
        notes: v.notes || '',
        created_at: v.createdAt,
      }));
      const { error: vendorErr } = await client.from('vendors').insert(vendorInserts);
      if (vendorErr) throw vendorErr;
    }

    // 9. Insert Vendor Transactions
    if (proj.vendorTransactions?.length) {
      const txnInserts = proj.vendorTransactions.map(t => ({
        id: t.id,
        project_id: newProjectId,
        vendor_id: t.vendorId,
        txn_date: t.txnDate,
        type: t.type,
        amount: t.amount || 0,
        description: t.description || '',
        created_at: t.createdAt,
      }));
      const { error: txnErr } = await client.from('vendor_transactions').insert(txnInserts);
      if (txnErr) throw txnErr;
    }

    // 10. Insert Materials
    if (proj.materials?.length) {
      const matInserts = proj.materials.map(m => ({
        id: m.id,
        project_id: newProjectId,
        name: m.name,
        unit: m.unit || 'bags',
        current_stock: m.currentStock || 0,
        total_inward: m.totalInward || 0,
        total_outward: m.totalOutward || 0,
        notes: m.notes || '',
        created_at: m.createdAt,
      }));
      const { error: matErr } = await client.from('materials').insert(matInserts);
      if (matErr) throw matErr;
    }

    // 11. Insert Material Logs
    if (proj.materialLogs?.length) {
      const logInserts = proj.materialLogs.map(log => ({
        id: log.id,
        project_id: newProjectId,
        material_id: log.materialId,
        log_date: log.logDate,
        type: log.type,
        qty: log.qty || 0,
        notes: log.notes || '',
        created_at: log.createdAt,
      }));
      const { error: logErr } = await client.from('material_logs').insert(logInserts);
      if (logErr) throw logErr;
    }

    // 12. Insert RA Bills
    if (proj.raBills?.length) {
      const billInserts = proj.raBills.map(b => ({
        id: b.id,
        project_id: newProjectId,
        bill_number: b.billNumber,
        issue_date: b.issueDate || null,
        due_date: b.dueDate || null,
        work_description: b.workDescription || '',
        contract_value: b.contractValue || 0,
        percentage_complete: b.percentageComplete || 0,
        previous_paid: b.previousPaid || 0,
        deductions: b.deductions || 0,
        amount_due: b.amountDue || 0,
        status: b.status,
        notes: b.notes || '',
        created_at: b.createdAt,
      }));
      const { error: billErr } = await client.from('ra_bills').insert(billInserts);
      if (billErr) throw billErr;
    }

    // 13. Update store references
    const oldId = proj.id;
    proj.id = newProjectId;
    proj.userId = uid;

    if (String(store.currentProjectId) === String(oldId)) {
      store.currentProjectId = newProjectId;
    }

    const oldIndex = store.projects.findIndex(p => String(p.id) === String(oldId));
    if (oldIndex >= 0) {
      store.projects[oldIndex] = proj;
    }

    // Save locally
    saveLocal();

    // Trigger state synced notification to redraw
    _notifySynced();

    console.log('[State] Project successfully synced to cloud:', newProjectId);
    return newProjectId;
  }

  function getCurrentProject() {
    if (!Array.isArray(store.projects)) return null;
    // If currentProjectId is set but no matching project, fall back
    // to the first project so the user always sees *something*.
    const found = store.projects.find(p => String(p.id) === String(store.currentProjectId));
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
    const uid = userId();
    return store.projects.filter(p => !p.archived && (!p.userId || String(p.userId) === String(uid)));
  }

  function setCurrentProject(id) {
    store.currentProjectId = id;
    saveLocal();
    preLoadProjectImages();
  }

  function updatePhaseData(phaseId, sectionKey, data) {
    const proj = getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => String(p.id) === String(phaseId));
    if (!phase) return;
    if (!phase.data[sectionKey]) phase.data[sectionKey] = {};
    Object.assign(phase.data[sectionKey], data);
    save();
  }

  function getPhaseData(phaseId, sectionKey) {
    const proj = getCurrentProject();
    if (!proj) return {};
    const phase = proj.phases.find(p => String(p.id) === String(phaseId));
    if (!phase) return {};
    return phase.data[sectionKey] || {};
  }

  function setPhaseCompletion(phaseId, pct) {
    const proj = getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => String(p.id) === String(phaseId));
    if (phase) phase.completion = Math.min(100, Math.max(0, pct));
    save();
  }

  async function addSubcontractor(sub) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.subcontractors) proj.subcontractors = [];

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id);
    sub.id = isProjectSynced ? generateUUID() : generateId();
    sub.createdAt = new Date().toISOString();
    proj.subcontractors.push(sub);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: sub.id,
        project_id: proj.id,
        trade: sub.trade || '',
        company: sub.company || '',
        contact: sub.contact || '',
        phone: sub.phone || '',
        email: sub.email || '',
        phase: sub.phase || '',
        contract: parseFloat(sub.contract) || 0,
        paid: parseFloat(sub.paid) || 0,
        retention: parseFloat(sub.retention) || 0,
        notes: sub.notes || '',
      };
      try {
        const { error } = await client.from('subcontractors').insert(payload);
        if (error) {
          console.warn('[State] Supabase sub insert failed, queuing mutation:', error.message);
          enqueueMutation('insert', 'subcontractors', sub.id, payload);
        }
      } catch (err) {
        console.warn('[State] Supabase sub insert network failed, queuing mutation:', err.message);
        enqueueMutation('insert', 'subcontractors', sub.id, payload);
      }
    }
    return sub;
  }

  async function updateSubcontractor(id, updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    const idx = proj.subcontractors.findIndex(s => String(s.id) === String(id));
    if (idx >= 0) Object.assign(proj.subcontractors[idx], updates);

    const client = sb();
    const payload = {};
    if (updates.trade !== undefined) payload.trade = updates.trade;
    if (updates.company !== undefined) payload.company = updates.company;
    if (updates.contact !== undefined) payload.contact = updates.contact;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.phase !== undefined) payload.phase = updates.phase;
    if (updates.contract !== undefined) payload.contract = parseFloat(updates.contract) || 0;
    if (updates.paid !== undefined) payload.paid = parseFloat(updates.paid) || 0;
    if (updates.retention !== undefined) payload.retention = parseFloat(updates.retention) || 0;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('subcontractors').update(payload).eq('id', id);
        if (error) enqueueMutation('update', 'subcontractors', id, payload);
      } catch (err) {
        enqueueMutation('update', 'subcontractors', id, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'subcontractors', id, payload);
    }
    saveLocal();
  }

  async function deleteSubcontractor(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.subcontractors = proj.subcontractors.filter(s => String(s.id) !== String(id));

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('subcontractors').delete().eq('id', id);
        if (error) enqueueMutation('delete', 'subcontractors', id, null);
      } catch (err) {
        enqueueMutation('delete', 'subcontractors', id, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'subcontractors', id, null);
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

    const maxNum = proj.punchItems.reduce((m, p) => {
      const match = (p.itemNumber || '').match(/P-(\d+)/);
      return Math.max(m, match ? parseInt(match[1]) : 0);
    }, 0);
    item.status = item.status || 'open';
    item.createdAt = new Date().toISOString();
    item.itemNumber = item.itemNumber || `P-${String(maxNum + 1).padStart(3, '0')}`;

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id);
    item.id = isProjectSynced ? generateUUID() : generateId();
    proj.punchItems.push(item);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: item.id,
        project_id: proj.id,
        item_number: item.itemNumber,
        description: item.description || '',
        location: item.location || '',
        assigned_to: item.assignedTo || '',
        priority: item.priority || 'normal',
        status: item.status,
        created_at: item.createdAt,
      };
      try {
        const { error } = await client.from('punch_items').insert(payload);
        if (error) enqueueMutation('insert', 'punch_items', item.id, payload);
      } catch (err) {
        enqueueMutation('insert', 'punch_items', item.id, payload);
      }
    }
    return item;
  }

  async function updatePunchItem(id, updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    const idx = proj.punchItems.findIndex(p => String(p.id) === String(id));
    if (idx >= 0) Object.assign(proj.punchItems[idx], updates);

    const client = sb();
    const payload = {};
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.status !== undefined) {
      payload.status = updates.status;
      payload.resolved_at = updates.status === 'resolved' ? new Date().toISOString() : null;
    }

    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('punch_items').update(payload).eq('id', id);
        if (error) enqueueMutation('update', 'punch_items', id, payload);
      } catch (err) {
        enqueueMutation('update', 'punch_items', id, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'punch_items', id, payload);
    }
    saveLocal();
  }

  async function deletePunchItem(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.punchItems = proj.punchItems.filter(p => String(p.id) !== String(id));

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('punch_items').delete().eq('id', id);
        if (error) enqueueMutation('delete', 'punch_items', id, null);
      } catch (err) {
        enqueueMutation('delete', 'punch_items', id, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'punch_items', id, null);
    }
    saveLocal();
  }

  // ── Labour & Attendance ──────────────────────────
  async function addLabour(labour) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.labour) proj.labour = [];

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id);
    labour.id = isProjectSynced ? generateUUID() : generateId();
    labour.createdAt = new Date().toISOString();
    proj.labour.push(labour);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: labour.id,
        project_id: proj.id,
        name: labour.name,
        role: labour.role || 'mazdoor',
        daily_rate: parseFloat(labour.dailyRate) || 0,
        phone: labour.phone || '',
        balance: parseFloat(labour.balance) || 0,
        active: labour.active !== false,
        created_at: labour.createdAt,
      };
      try {
        const { error } = await client.from('labour').insert(payload);
        if (error) enqueueMutation('insert', 'labour', labour.id, payload);
      } catch (err) {
        enqueueMutation('insert', 'labour', labour.id, payload);
      }
    }
  }

  async function updateLabour(id, updates) {
    const proj = getCurrentProject();
    if (!proj || !proj.labour) return;
    const idx = proj.labour.findIndex(l => String(l.id) === String(id));
    if (idx >= 0) Object.assign(proj.labour[idx], updates);

    const client = sb();
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.dailyRate !== undefined) payload.daily_rate = parseFloat(updates.dailyRate) || 0;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.balance !== undefined) payload.balance = parseFloat(updates.balance) || 0;
    if (updates.active !== undefined) payload.active = updates.active;

    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('labour').update(payload).eq('id', id);
        if (error) enqueueMutation('update', 'labour', id, payload);
      } catch (err) {
        enqueueMutation('update', 'labour', id, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'labour', id, payload);
    }
    saveLocal();
  }

  async function deleteLabour(id) {
    const proj = getCurrentProject();
    if (!proj || !proj.labour) return;
    proj.labour = proj.labour.filter(l => String(l.id) !== String(id));

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('labour').delete().eq('id', id);
        if (error) enqueueMutation('delete', 'labour', id, null);
      } catch (err) {
        enqueueMutation('delete', 'labour', id, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'labour', id, null);
    }
    saveLocal();
  }

  // ── Vendor Khata (Udhaar) ───────────────────
  async function addVendor(vendor) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.vendors) proj.vendors = [];
    
    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id);
    vendor.id = isProjectSynced ? generateUUID() : generateId();
    vendor.createdAt = new Date().toISOString();
    vendor.balance = parseFloat(vendor.balance) || 0;
    proj.vendors.push(vendor);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: vendor.id,
        project_id: proj.id,
        name: vendor.name,
        shop_name: vendor.shopName || '',
        phone: vendor.phone || '',
        balance: vendor.balance,
        notes: vendor.notes || '',
        created_at: vendor.createdAt,
      };
      try {
        const { error } = await client.from('vendors').insert(payload);
        if (error) enqueueMutation('insert', 'vendors', vendor.id, payload);
      } catch (err) {
        enqueueMutation('insert', 'vendors', vendor.id, payload);
      }
    }
  }

  async function updateVendor(id, updates) {
    const proj = getCurrentProject();
    if (!proj || !proj.vendors) return;
    const idx = proj.vendors.findIndex(v => String(v.id) === String(id));
    if (idx >= 0) Object.assign(proj.vendors[idx], updates);
    
    const client = sb();
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.shopName !== undefined) payload.shop_name = updates.shopName;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.balance !== undefined) payload.balance = parseFloat(updates.balance) || 0;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('vendors').update(payload).eq('id', id);
        if (error) enqueueMutation('update', 'vendors', id, payload);
      } catch (err) {
        enqueueMutation('update', 'vendors', id, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'vendors', id, payload);
    }
    saveLocal();
  }

  async function deleteVendor(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.vendors = (proj.vendors || []).filter(v => String(v.id) !== String(id));
    proj.vendorTransactions = (proj.vendorTransactions || []).filter(t => String(t.vendorId) !== String(id));
    
    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('vendors').delete().eq('id', id);
        if (error) enqueueMutation('delete', 'vendors', id, null);
      } catch (err) {
        enqueueMutation('delete', 'vendors', id, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'vendors', id, null);
    }
    saveLocal();
  }

  async function addVendorTransaction(txn) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.vendorTransactions) proj.vendorTransactions = [];
    
    const vendor = (proj.vendors || []).find(v => String(v.id) === String(txn.vendorId));
    if (vendor) {
      const delta = txn.type === 'debit' ? parseFloat(txn.amount) : -parseFloat(txn.amount);
      const newBalance = (parseFloat(vendor.balance) || 0) + delta;
      await updateVendor(vendor.id, { balance: newBalance });
    }

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id) && isUUID(txn.vendorId);
    txn.id = isProjectSynced ? generateUUID() : generateId();
    txn.createdAt = new Date().toISOString();
    proj.vendorTransactions.push(txn);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: txn.id,
        project_id: proj.id,
        vendor_id: txn.vendorId,
        txn_date: txn.txnDate,
        type: txn.type,
        amount: parseFloat(txn.amount) || 0,
        description: txn.description || '',
        created_at: txn.createdAt,
      };
      try {
        const { error } = await client.from('vendor_transactions').insert(payload);
        if (error) enqueueMutation('insert', 'vendor_transactions', txn.id, payload);
      } catch (err) {
        enqueueMutation('insert', 'vendor_transactions', txn.id, payload);
      }
    }
  }

  // ── Site Material Inventory ───────────────────
  async function addMaterial(material) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.materials) proj.materials = [];
    material.currentStock = parseFloat(material.openingStock) || 0;
    material.totalInward = parseFloat(material.openingStock) || 0;
    material.totalOutward = 0;

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id);
    material.id = isProjectSynced ? generateUUID() : generateId();
    material.createdAt = new Date().toISOString();
    proj.materials.push(material);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: material.id,
        project_id: proj.id,
        name: material.name,
        unit: material.unit || 'bags',
        current_stock: material.currentStock,
        total_inward: material.totalInward,
        total_outward: material.totalOutward,
        notes: material.notes || '',
        created_at: material.createdAt,
      };
      try {
        const { error } = await client.from('materials').insert(payload);
        if (error) {
          console.warn('[State] Supabase material insert failed, queuing:', error.message);
          enqueueMutation('insert', 'materials', material.id, payload);
        }
      } catch (err) {
        console.warn('[State] Supabase material insert err, queuing:', err.message);
        enqueueMutation('insert', 'materials', material.id, payload);
      }
    }
  }

  async function updateMaterial(id, updates) {
    const proj = getCurrentProject();
    if (!proj || !proj.materials) return;
    const idx = proj.materials.findIndex(m => String(m.id) === String(id));
    if (idx >= 0) Object.assign(proj.materials[idx], updates);

    const client = sb();
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.unit !== undefined) payload.unit = updates.unit;
    if (updates.currentStock !== undefined) payload.current_stock = parseFloat(updates.currentStock) || 0;
    if (updates.totalInward !== undefined) payload.total_inward = parseFloat(updates.totalInward) || 0;
    if (updates.totalOutward !== undefined) payload.total_outward = parseFloat(updates.totalOutward) || 0;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('materials').update(payload).eq('id', id);
        if (error) {
          console.warn('[State] Supabase material update failed, queuing:', error.message);
          enqueueMutation('update', 'materials', id, payload);
        }
      } catch (err) {
        console.warn('[State] Supabase material update err, queuing:', err.message);
        enqueueMutation('update', 'materials', id, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'materials', id, payload);
    }
    saveLocal();
  }

  async function deleteMaterial(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.materials = (proj.materials || []).filter(m => String(m.id) !== String(id));
    proj.materialLogs = (proj.materialLogs || []).filter(l => String(l.materialId) !== String(id));

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('materials').delete().eq('id', id);
        if (error) {
          console.warn('[State] Supabase material delete failed, queuing:', error.message);
          enqueueMutation('delete', 'materials', id, null);
        }
      } catch (err) {
        console.warn('[State] Supabase material delete err, queuing:', err.message);
        enqueueMutation('delete', 'materials', id, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'materials', id, null);
    }
    saveLocal();
  }

  async function addMaterialLog(log) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.materialLogs) proj.materialLogs = [];
    
    // Update material stock
    const mat = (proj.materials || []).find(m => String(m.id) === String(log.materialId));
    if (mat) {
      const qty = parseFloat(log.qty) || 0;
      if (log.type === 'inward') {
        mat.currentStock = (parseFloat(mat.currentStock) || 0) + qty;
        mat.totalInward = (parseFloat(mat.totalInward) || 0) + qty;
      } else {
        mat.currentStock = Math.max(0, (parseFloat(mat.currentStock) || 0) - qty);
        mat.totalOutward = (parseFloat(mat.totalOutward) || 0) + qty;
      }
      await updateMaterial(mat.id, {
        currentStock: mat.currentStock,
        totalInward: mat.totalInward,
        totalOutward: mat.totalOutward
      });
    }

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id) && isUUID(log.materialId);
    log.id = isProjectSynced ? generateUUID() : generateId();
    log.createdAt = new Date().toISOString();
    proj.materialLogs.push(log);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: log.id,
        project_id: proj.id,
        material_id: log.materialId,
        log_date: log.logDate,
        type: log.type,
        qty: parseFloat(log.qty) || 0,
        notes: log.notes || '',
        created_at: log.createdAt,
      };
      try {
        const { error } = await client.from('material_logs').insert(payload);
        if (error) {
          console.warn('[State] Supabase material_log insert failed, queuing:', error.message);
          enqueueMutation('insert', 'material_logs', log.id, payload);
        }
      } catch (err) {
        console.warn('[State] Supabase material_log insert err, queuing:', err.message);
        enqueueMutation('insert', 'material_logs', log.id, payload);
      }
    }
  }

  // ── RA Bills (Running Account) ────────────────
  async function addRaBill(bill) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.raBills) proj.raBills = [];
    bill.status = bill.status || 'draft';
    // Auto-assign bill number — use max existing number to avoid collision after deletions
    if (!bill.billNumber) {
      const maxNum = proj.raBills.reduce((max, b) => {
        const match = (b.billNumber || '').match(/RA-(\d+)/);
        return match ? Math.max(max, parseInt(match[1], 10)) : max;
      }, 0);
      bill.billNumber = `RA-${String(maxNum + 1).padStart(3, '0')}`;
    }

    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id);
    bill.id = isProjectSynced ? generateUUID() : generateId();
    bill.createdAt = new Date().toISOString();
    proj.raBills.push(bill);
    saveLocal();

    if (isProjectSynced) {
      const payload = {
        id: bill.id,
        project_id: proj.id,
        bill_number: bill.billNumber,
        issue_date: bill.issueDate || null,
        due_date: bill.dueDate || null,
        work_description: bill.workDescription || '',
        contract_value: parseFloat(bill.contractValue) || 0,
        percentage_complete: parseFloat(bill.percentageComplete) || 0,
        previous_paid: parseFloat(bill.previousPaid) || 0,
        deductions: parseFloat(bill.deductions) || 0,
        amount_due: parseFloat(bill.amountDue) || 0,
        status: bill.status,
        notes: bill.notes || '',
        created_at: bill.createdAt,
      };
      try {
        const { error } = await client.from('ra_bills').insert(payload);
        if (error) {
          console.warn('[State] Supabase ra_bill insert failed, queuing:', error.message);
          enqueueMutation('insert', 'ra_bills', bill.id, payload);
        }
      } catch (err) {
        console.warn('[State] Supabase ra_bill insert err, queuing:', err.message);
        enqueueMutation('insert', 'ra_bills', bill.id, payload);
      }
    }
  }

  async function updateRaBill(id, updates) {
    const proj = getCurrentProject();
    if (!proj || !proj.raBills) return;
    const idx = proj.raBills.findIndex(b => String(b.id) === String(id));
    if (idx >= 0) Object.assign(proj.raBills[idx], updates);

    const client = sb();
    const payload = {};
    if (updates.billNumber !== undefined) payload.bill_number = updates.billNumber;
    if (updates.issueDate !== undefined) payload.issue_date = updates.issueDate || null;
    if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
    if (updates.workDescription !== undefined) payload.work_description = updates.workDescription;
    if (updates.contractValue !== undefined) payload.contract_value = parseFloat(updates.contractValue) || 0;
    if (updates.percentageComplete !== undefined) payload.percentage_complete = parseFloat(updates.percentageComplete) || 0;
    if (updates.previousPaid !== undefined) payload.previous_paid = parseFloat(updates.previousPaid) || 0;
    if (updates.deductions !== undefined) payload.deductions = parseFloat(updates.deductions) || 0;
    if (updates.amountDue !== undefined) payload.amount_due = parseFloat(updates.amountDue) || 0;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('ra_bills').update(payload).eq('id', id);
        if (error) {
          console.warn('[State] Supabase ra_bill update failed, queuing:', error.message);
          enqueueMutation('update', 'ra_bills', id, payload);
        }
      } catch (err) {
        console.warn('[State] Supabase ra_bill update err, queuing:', err.message);
        enqueueMutation('update', 'ra_bills', id, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'ra_bills', id, payload);
    }
    saveLocal();
  }

  async function deleteRaBill(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.raBills = (proj.raBills || []).filter(b => String(b.id) !== String(id));

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try {
        const { error } = await client.from('ra_bills').delete().eq('id', id);
        if (error) {
          console.warn('[State] Supabase ra_bill delete failed, queuing:', error.message);
          enqueueMutation('delete', 'ra_bills', id, null);
        }
      } catch (err) {
        console.warn('[State] Supabase ra_bill delete err, queuing:', err.message);
        enqueueMutation('delete', 'ra_bills', id, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'ra_bills', id, null);
    }
    saveLocal();
  }

  async function addLabourLog(log) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.labourLogs) proj.labourLogs = [];
    const client = sb();
    const isProjectSynced = _useSupabase && client && isUUID(proj.id) && isUUID(log.labourId);
    log.id = isProjectSynced ? generateUUID() : generateId();
    log.createdAt = new Date().toISOString();
    proj.labourLogs.push(log);
    
    // Update balance
    const labour = proj.labour.find(l => l.id === log.labourId);
    if (labour) {
       let addedValue = 0;
       if (log.status === 'full') addedValue = Number(labour.dailyRate);
       else if (log.status === 'half') addedValue = Number(labour.dailyRate) / 2;
       
       const newBalance = (Number(labour.balance || 0) + addedValue) - Number(log.kharchi || 0);
       await updateLabour(labour.id, { balance: newBalance });
    } else {
       saveLocal();
    }

    if (isProjectSynced) {
      const payload = {
        id: log.id,
        project_id: proj.id,
        labour_id: log.labourId,
        log_date: log.logDate,
        status: log.status || 'full',
        kharchi: parseFloat(log.kharchi) || 0,
        notes: log.notes || '',
        created_at: log.createdAt,
      };
      try {
        const { error } = await client.from('labour_logs').insert(payload);
        if (error) enqueueMutation('insert', 'labour_logs', log.id, payload);
      } catch (err) {
        enqueueMutation('insert', 'labour_logs', log.id, payload);
      }
    }
  }

  async function deleteLabourLog(logId) {
    const proj = getCurrentProject();
    if (!proj || !proj.labourLogs) return;
    const logIndex = proj.labourLogs.findIndex(l => String(l.id) === String(logId));
    if (logIndex === -1) return;
    const log = proj.labourLogs[logIndex];
    
    // Adjust labour balance
    const labour = proj.labour.find(l => String(l.id) === String(log.labourId));
    if (labour) {
      let addedValue = 0;
      if (log.status === 'full') addedValue = Number(labour.dailyRate);
      else if (log.status === 'half') addedValue = Number(labour.dailyRate) / 2;
      
      const contribution = addedValue - Number(log.kharchi || 0);
      const newBalance = Number(labour.balance || 0) - contribution;
      await updateLabour(labour.id, { balance: newBalance });
    }
    
    // Remove the log
    proj.labourLogs.splice(logIndex, 1);
    saveLocal();
    
    const client = sb();
    if (_useSupabase && client && isUUID(logId)) {
      try {
        const { error } = await client.from('labour_logs').delete().eq('id', logId);
        if (error) enqueueMutation('delete', 'labour_logs', logId, null);
      } catch (err) {
        enqueueMutation('delete', 'labour_logs', logId, null);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('delete', 'labour_logs', logId, null);
    }
  }

  async function updateLabourLog(logId, updates) {
    const proj = getCurrentProject();
    if (!proj || !proj.labourLogs) return;
    const logIndex = proj.labourLogs.findIndex(l => String(l.id) === String(logId));
    if (logIndex === -1) return;
    const oldLog = proj.labourLogs[logIndex];
    
    // Make a copy of old log for balance calculation
    const oldStatus = oldLog.status;
    const oldKharchi = Number(oldLog.kharchi || 0);
    const labourId = oldLog.labourId;
    
    // Apply updates locally
    Object.assign(oldLog, updates);
    const newLog = oldLog;
    
    // Adjust labour balance
    const labour = proj.labour.find(l => String(l.id) === String(labourId));
    if (labour) {
      let oldAddedWages = 0;
      if (oldStatus === 'full') oldAddedWages = Number(labour.dailyRate);
      else if (oldStatus === 'half') oldAddedWages = Number(labour.dailyRate) / 2;
      const oldContribution = oldAddedWages - oldKharchi;
      
      let newAddedWages = 0;
      if (newLog.status === 'full') newAddedWages = Number(labour.dailyRate);
      else if (newLog.status === 'half') newAddedWages = Number(labour.dailyRate) / 2;
      const newContribution = newAddedWages - Number(newLog.kharchi || 0);
      
      const newBalance = Number(labour.balance || 0) - oldContribution + newContribution;
      await updateLabour(labour.id, { balance: newBalance });
    }
    
    const client = sb();
    const payload = {};
    if (updates.logDate !== undefined) payload.log_date = updates.logDate;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.kharchi !== undefined) payload.kharchi = parseFloat(updates.kharchi) || 0;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    if (_useSupabase && client && isUUID(logId)) {
      try {
        const { error } = await client.from('labour_logs').update(payload).eq('id', logId);
        if (error) enqueueMutation('update', 'labour_logs', logId, payload);
      } catch (err) {
        enqueueMutation('update', 'labour_logs', logId, payload);
      }
    } else if (_useSupabase && client) {
      enqueueMutation('update', 'labour_logs', logId, payload);
    }
    saveLocal();
  }

  // ── Scanned Bills ──────────────────────────────────────────
  function getBills(phaseId) {
    const proj = getCurrentProject();
    if (!proj) return [];
    const phase = proj.phases.find(p => String(p.id) === String(phaseId));
    if (!phase) return [];
    if (!phase.bills) phase.bills = [];
    return phase.bills;
  }

  async function addBill(phaseId, billObj) {
    const proj = getCurrentProject();
    if (!proj) return null;
    const phase = proj.phases.find(p => String(p.id) === String(phaseId));
    if (!phase) return null;
    if (!phase.bills) phase.bills = [];
    
    billObj.id = billObj.id || generateUUID();
    billObj.timestamp = Date.now();
    phase.bills.push(billObj);
    
    saveLocal();
    return billObj;
  }

  async function deleteBill(phaseId, billId) {
    const proj = getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => String(p.id) === String(phaseId));
    if (!phase || !phase.bills) return;
    
    phase.bills = phase.bills.filter(b => String(b.id) !== String(billId));
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
    store.projects = store.projects.filter(p => String(p.id) !== String(id));
    if (String(store.currentProjectId) === String(id)) store.currentProjectId = null;
    saveLocal();
  }

  async function archiveProject(id) {
    const proj = store.projects.find(p => String(p.id) === String(id));
    if (proj) proj.archived = true;
    if (String(store.currentProjectId) === String(id)) store.currentProjectId = null;

    const client = sb();
    if (_useSupabase && client && isUUID(id)) {
      try { await client.from('projects').update({ archived: true }).eq('id', id); }
      catch (err) { console.warn('[State] Archive error:', err); }
    }
    saveLocal();
  }

  // ── Flat Sales (Buyer Ledger) ─────────────────────────────
  function addBuyer(buyer) {
    const proj = getCurrentProject();
    if (!proj) return null;
    if (!proj.buyers) proj.buyers = [];
    buyer.id = buyer.id || generateId();
    buyer.createdAt = new Date().toISOString();
    buyer.payments = buyer.payments || [];
    proj.buyers.push(buyer);
    save();
    return buyer;
  }

  function updateBuyer(id, updates) {
    const proj = getCurrentProject();
    if (!proj || !proj.buyers) return;
    const idx = proj.buyers.findIndex(b => String(b.id) === String(id));
    if (idx >= 0) Object.assign(proj.buyers[idx], updates);
    save();
  }

  function deleteBuyer(id) {
    const proj = getCurrentProject();
    if (!proj || !proj.buyers) return;
    proj.buyers = proj.buyers.filter(b => String(b.id) !== String(id));
    save();
  }

  function addBuyerPayment(buyerId, payment) {
    const proj = getCurrentProject();
    if (!proj || !proj.buyers) return null;
    const buyer = proj.buyers.find(b => String(b.id) === String(buyerId));
    if (!buyer) return null;
    if (!buyer.payments) buyer.payments = [];
    payment.id = payment.id || generateId();
    payment.createdAt = new Date().toISOString();
    buyer.payments.push(payment);
    save();
    return payment;
  }

  function deleteBuyerPayment(buyerId, paymentId) {
    const proj = getCurrentProject();
    if (!proj || !proj.buyers) return;
    const buyer = proj.buyers.find(b => String(b.id) === String(buyerId));
    if (!buyer || !buyer.payments) return;
    buyer.payments = buyer.payments.filter(p => String(p.id) !== String(paymentId));
    save();
  }

  function getBuyers() {
    const proj = getCurrentProject();
    if (!proj) return [];
    if (!proj.buyers) proj.buyers = [];
    return proj.buyers;
  }

  return {
    load, save, onLoaded,
    createProject, syncProjectToCloud, getCurrentProject, getProjects,
    setCurrentProject, updatePhaseData, getPhaseData, setPhaseCompletion,
    addSubcontractor, updateSubcontractor, deleteSubcontractor,
    addInvoice,
    addPunchItem, updatePunchItem, deletePunchItem,
    addLabour, updateLabour, deleteLabour, addLabourLog, deleteLabourLog, updateLabourLog,
    addVendor, updateVendor, deleteVendor, addVendorTransaction,
    addMaterial, updateMaterial, deleteMaterial, addMaterialLog,
    addRaBill, updateRaBill, deleteRaBill,
    getBills, addBill, deleteBill,
    getBuyers, addBuyer, updateBuyer, deleteBuyer, addBuyerPayment, deleteBuyerPayment,
    updateProjectInfo, deleteProject, archivedProject: archiveProject,
    getLocalImage, saveLocalImage, deleteLocalImage, preLoadProjectImages,
    replaySyncQueue, hasUnsyncedChanges,
    get store() { return store; },
    get isCloud() { return _useSupabase; },
  };
})();
