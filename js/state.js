/* ═══════════════════════════════════════════
   STATE.JS — App State & Persistence v2
   LocalStorage-backed with data migration
   ═══════════════════════════════════════════ */

const State = (() => {
  const STORAGE_KEY = 'buildmanager_v2';
  const LEGACY_KEY = 'buildmanager_v1';

  const defaultPhases = () => [
    { id: 1, name: 'Pre-Construction', icon: '📋', completion: 0, data: {} },
    { id: 2, name: 'Site & Foundation', icon: '🏗', completion: 0, data: {} },
    { id: 3, name: 'Framing', icon: '🪵', completion: 0, data: {} },
    { id: 4, name: 'MEP Rough-In', icon: '⚡', completion: 0, data: {} },
    { id: 5, name: 'Insulation & Drywall', icon: '🧱', completion: 0, data: {} },
    { id: 6, name: 'Finishes', icon: '🎨', completion: 0, data: {} },
    { id: 7, name: 'Final MEP', icon: '🔌', completion: 0, data: {} },
    { id: 8, name: 'Punch List', icon: '✅', completion: 0, data: {} },
  ];

  // Section map for data migration — maps input IDs to their correct section
  const INPUT_SECTION_MAP = {
    // Phase 1
    soil_bearing: 'survey', water_table: 'survey', soil_class: 'survey', site_slope: 'survey',
    geotech_cost: 'survey', soil_test_fee: 'survey', soil_test_count: 'survey', survey_engineer_fee: 'survey',
    power_conn: 'temp_infra', power_monthly: 'temp_infra', power_months: 'temp_infra',
    water_id: 'temp_infra', water_monthly: 'temp_infra', water_months: 'temp_infra',
    porta_weekly: 'temp_infra', porta_weeks: 'temp_infra',
    fence_lf: 'temp_infra', fence_rate: 'temp_infra',
    dumpster_pickups: 'temp_infra', dumpster_rate: 'temp_infra',
    trailer_monthly: 'temp_infra', trailer_months: 'temp_infra',
    // Phase 2
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
    version: 2,
  };

  function load() {
    try {
      // Try v2 first
      let raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        store = JSON.parse(raw);
        migrateOrphanedData();
        return;
      }
      // Try v1 (legacy)
      raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        store = JSON.parse(raw);
        store.version = 2;
        migrateOrphanedData();
        save();
      }
    } catch(e) { console.warn('State load error', e); }
  }

  /**
   * Migrate data that was saved under phase.data.general
   * (due to the sc- prefix bug) back to the correct sections.
   */
  function migrateOrphanedData() {
    if (!store.projects) return;
    let migrated = false;
    
    store.projects.forEach(proj => {
      if (!proj.phases) return;
      proj.phases.forEach(phase => {
        const generalData = phase.data.general;
        if (!generalData || typeof generalData !== 'object') return;
        
        // Move each key from general to its correct section
        Object.entries(generalData).forEach(([key, val]) => {
          const correctSection = INPUT_SECTION_MAP[key];
          if (correctSection) {
            if (!phase.data[correctSection]) phase.data[correctSection] = {};
            // Only migrate if the target doesn't already have this key
            if (phase.data[correctSection][key] === undefined) {
              phase.data[correctSection][key] = val;
              migrated = true;
            }
          }
        });
        
        // Remove general section if all data was migrated
        if (migrated) {
          delete phase.data.general;
        }
      });
    });

    if (migrated) {
      console.log('[BuildManager] Migrated orphaned data from "general" to correct sections');
      save();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch(e) { console.warn('State save error', e); }
  }

  function createProject(info) {
    const id = Date.now().toString();
    const project = {
      id,
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
    store.projects.push(project);
    store.currentProjectId = id;
    save();
    return project;
  }

  function getCurrentProject() {
    return store.projects.find(p => p.id === store.currentProjectId) || null;
  }

  function getProjects() {
    return store.projects.filter(p => !p.archived);
  }

  function setCurrentProject(id) {
    store.currentProjectId = id;
    save();
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

  function addSubcontractor(sub) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.subcontractors) proj.subcontractors = [];
    sub.id = Date.now().toString();
    sub.createdAt = new Date().toISOString();
    proj.subcontractors.push(sub);
    save();
    return sub;
  }

  function updateSubcontractor(id, updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    const idx = proj.subcontractors.findIndex(s => s.id === id);
    if (idx >= 0) Object.assign(proj.subcontractors[idx], updates);
    save();
  }

  function deleteSubcontractor(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.subcontractors = proj.subcontractors.filter(s => s.id !== id);
    save();
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

  function addPunchItem(item) {
    const proj = getCurrentProject();
    if (!proj) return;
    if (!proj.punchItems) proj.punchItems = [];
    const n = proj.punchItems.length + 1;
    item.id = `P-${String(n).padStart(3,'0')}`;
    item.status = item.status || 'open';
    item.createdAt = new Date().toISOString();
    proj.punchItems.push(item);
    save();
    return item;
  }

  function updatePunchItem(id, updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    const idx = proj.punchItems.findIndex(p => p.id === id);
    if (idx >= 0) Object.assign(proj.punchItems[idx], updates);
    save();
  }

  function deletePunchItem(id) {
    const proj = getCurrentProject();
    if (!proj) return;
    proj.punchItems = proj.punchItems.filter(p => p.id !== id);
    save();
  }

  function updateProjectInfo(updates) {
    const proj = getCurrentProject();
    if (!proj) return;
    Object.assign(proj, updates);
    save();
  }

  function deleteProject(id) {
    store.projects = store.projects.filter(p => p.id !== id);
    if (store.currentProjectId === id) store.currentProjectId = null;
    save();
  }

  function archiveProject(id) {
    const proj = store.projects.find(p => p.id === id);
    if (proj) proj.archived = true;
    if (store.currentProjectId === id) store.currentProjectId = null;
    save();
  }

  load();

  return {
    load, save, createProject, getCurrentProject, getProjects,
    setCurrentProject, updatePhaseData, getPhaseData, setPhaseCompletion,
    addSubcontractor, updateSubcontractor, deleteSubcontractor,
    addInvoice,
    addPunchItem, updatePunchItem, deletePunchItem,
    updateProjectInfo, deleteProject, archiveProject,
    get store() { return store; }
  };
})();
