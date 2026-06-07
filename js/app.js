/* ═══════════════════════════════════════════
   APP.JS — Main Application Controller v2
   Routing, Wizard, Phase Navigation, Dashboard
   ═══════════════════════════════════════════ */

const App = (() => {
  let currentPhase = 0; // 0 = dashboard
  let sidebarOpen = true;
  let aiOpen = true;
  let wizardStep = 1;
  const wizardData = {};

  // ── Boot ──────────────────────────────────────────────────
  function init() {
    const projects = State.getProjects();
    const currentProj = State.getCurrentProject();

    if (currentProj) {
      showMainApp(currentProj);
    } else if (projects.length > 0) {
      showWelcomeWithProjects(projects);
    } else {
      showWelcome();
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const phase = parseInt(e.key);
        if (State.getCurrentProject()) showPhase(phase);
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        toast('Auto-saved ✓', 'success');
      }
    });
  }

  function showWelcome() {
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('project-wizard').classList.add('hidden');
  }

  function showWelcomeWithProjects(projects) {
    showWelcome();
    const listEl = document.getElementById('existing-projects-list');
    if (!listEl) return;

    listEl.innerHTML = `
      <div class="existing-projects-divider">or open existing project</div>
      ${projects.map(p => {
        const total = Financial.computeProjectTotal(p);
        const pct = p.totalBudget > 0 ? Math.round((total / p.totalBudget) * 100) : 0;
        return `<button class="existing-project-btn" onclick="App.openProject('${p.id}')">
          <div style="min-width:0">
            <div style="font-weight:700;font-size:14px">${p.name}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${p.address || 'No address'} ${p.client ? '· ' + p.client : ''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:var(--font-mono);color:var(--steel-light);font-weight:600">${Financial.fmtFull(total)}</div>
            ${p.totalBudget > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${pct}% of budget</div>` : ''}
          </div>
        </button>`;
      }).join('')}`;
  }

  function openProject(id) {
    State.setCurrentProject(id);
    const proj = State.getCurrentProject();
    if (proj) showMainApp(proj);
  }

  // ── Project Wizard ────────────────────────────────────────
  function startNewProject() {
    wizardStep = 1;
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('project-wizard').classList.remove('hidden');
    renderWizardStep();
  }

  function renderWizardStep() {
    const body = document.getElementById('wizard-body');
    const backBtn = document.getElementById('wizard-back');
    const nextBtn = document.getElementById('wizard-next');
    const steps = document.querySelectorAll('.wizard-step');

    steps.forEach((s, i) => s.classList.toggle('active', i + 1 === wizardStep));
    backBtn.style.display = wizardStep > 1 ? 'block' : 'none';
    nextBtn.textContent = wizardStep === 3 ? 'Create Project →' : 'Next →';

    if (wizardStep === 1) {
      body.innerHTML = `
        <h3 style="font-size:15px;font-weight:700;margin-bottom:20px;color:var(--text-secondary)">Project Information</h3>
        <div class="field-group">
          <label class="field-label">Project Name *</label>
          <input class="field-input" id="w-name" placeholder="e.g. Sharma Residence — Ground Floor" value="${wizardData.name||''}">
        </div>
        <div class="field-row cols-2">
          <div class="field-group">
            <label class="field-label">Client Name</label>
            <input class="field-input" id="w-client" placeholder="Mr. Sharma" value="${wizardData.client||''}">
          </div>
          <div class="field-group">
            <label class="field-label">Project Address</label>
            <input class="field-input" id="w-address" placeholder="Plot 14, Baner, Pune" value="${wizardData.address||''}">
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Project Type</label>
          <select class="field-select" id="w-type">
            <option value="residential" ${wizardData.type==='residential'?'selected':''}>Residential — New Construction</option>
            <option value="commercial" ${wizardData.type==='commercial'?'selected':''}>Commercial Build</option>
            <option value="renovation" ${wizardData.type==='renovation'?'selected':''}>Renovation / Remodel</option>
            <option value="addition" ${wizardData.type==='addition'?'selected':''}>Addition</option>
          </select>
        </div>`;
    } else if (wizardStep === 2) {
      body.innerHTML = `
        <h3 style="font-size:15px;font-weight:700;margin-bottom:20px;color:var(--text-secondary)">Budget Setup</h3>
        <div class="field-group">
          <label class="field-label">Total Project Budget</label>
          <div class="currency-input-wrap">
            <span class="currency-symbol">₹</span>
            <input class="field-input mono" type="number" id="w-budget" placeholder="0" value="${wizardData.totalBudget||''}" min="0">
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Used for budget health tracking. You can update it later.</div>
        </div>
        <div class="field-row cols-2">
          <div class="field-group">
            <label class="field-label">Currency</label>
            <select class="field-select" id="w-currency">
              <option value="INR" ${wizardData.currency==='INR'?'selected':''}>₹ Indian Rupee (INR)</option>
              <option value="USD" ${wizardData.currency==='USD'?'selected':''}>$ US Dollar (USD)</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Contingency %</label>
            <input class="field-input mono" type="number" id="w-contingency" placeholder="10" value="${wizardData.contingency||10}" min="0" max="30">
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Primary Contractor / Builder</label>
          <input class="field-input" id="w-contractor" placeholder="Your company name" value="${wizardData.contractor||''}">
        </div>`;
    } else if (wizardStep === 3) {
      body.innerHTML = `
        <h3 style="font-size:15px;font-weight:700;margin-bottom:20px;color:var(--text-secondary)">Timeline & Notes</h3>
        <div class="field-row cols-2">
          <div class="field-group">
            <label class="field-label">Project Start Date</label>
            <input class="field-input" type="date" id="w-start" value="${wizardData.startDate||''}">
          </div>
          <div class="field-group">
            <label class="field-label">Target Completion</label>
            <input class="field-input" type="date" id="w-end" value="${wizardData.endDate||''}">
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Project Notes / Scope Summary</label>
          <textarea class="field-textarea" id="w-notes" rows="3" placeholder="Brief description of scope…" style="resize:vertical">${wizardData.notes||''}</textarea>
        </div>
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:var(--radius-lg);padding:16px;margin-top:12px">
          <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:700">Project Summary</div>
          <div style="font-weight:700;font-size:15px">${wizardData.name || '—'}</div>
          <div style="color:var(--text-secondary);font-size:12px;margin-top:4px">${wizardData.address || ''} ${wizardData.client ? '· ' + wizardData.client : ''}</div>
          <div style="font-family:var(--font-mono);color:var(--steel-light);font-size:18px;margin-top:10px;font-weight:700">Budget: ${Financial.fmtFull(wizardData.totalBudget || 0)}</div>
        </div>`;
    }
  }

  function wizardNext() {
    if (wizardStep === 1) {
      const name = document.getElementById('w-name')?.value?.trim();
      if (!name) { toast('Please enter a project name', 'warning'); return; }
      wizardData.name = name;
      wizardData.client = document.getElementById('w-client')?.value;
      wizardData.address = document.getElementById('w-address')?.value;
      wizardData.type = document.getElementById('w-type')?.value;
    } else if (wizardStep === 2) {
      wizardData.totalBudget = document.getElementById('w-budget')?.value;
      wizardData.currency = document.getElementById('w-currency')?.value;
      wizardData.contingency = document.getElementById('w-contingency')?.value;
      wizardData.contractor = document.getElementById('w-contractor')?.value;
    } else if (wizardStep === 3) {
      wizardData.startDate = document.getElementById('w-start')?.value;
      wizardData.endDate = document.getElementById('w-end')?.value;
      wizardData.notes = document.getElementById('w-notes')?.value;

      const proj = State.createProject(wizardData);
      document.getElementById('project-wizard').classList.add('hidden');
      showMainApp(proj);
      return;
    }

    wizardStep++;
    renderWizardStep();
  }

  function wizardBack() {
    if (wizardStep > 1) {
      wizardStep--;
      renderWizardStep();
    } else {
      document.getElementById('project-wizard').classList.add('hidden');
      showWelcome();
    }
  }

  // ── Main App ──────────────────────────────────────────────
  function showMainApp(proj) {
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('project-wizard').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    document.getElementById('current-project-name').textContent = proj.name;
    
    if (proj.currency) Financial.currency = proj.currency;

    renderSidebar(proj);
    showOverview(); // Start with dashboard
    Financial.updateAllTotals();

    setTimeout(() => {
      AI.addMessage('info', '👷', 'Welcome', `Project "${proj.name}" loaded. ${Financial.fmtFull(Financial.computeProjectTotal(proj))} tracked so far. Fill in each phase and I'll flag risks as you go.`, ['Got it']);
    }, 600);
  }

  function showDashboardHome() {
    State.setCurrentProject(null);
    const projects = State.getProjects();
    showWelcomeWithProjects(projects);
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('welcome-screen').classList.remove('hidden');
  }

  // ── Overview / Dashboard ──────────────────────────────────
  function showOverview() {
    currentPhase = 0;
    const content = document.getElementById('content-area');
    if (!content) return;

    // Update sidebar active state
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const overBtn = document.getElementById('phase-btn-overview');
    if (overBtn) overBtn.classList.add('active');

    content.innerHTML = Dashboard.render();
    AI.setWatching('Project Dashboard');
    content.scrollTop = 0;
  }

  // ── Sidebar ────────────────────────────────────────────────
  function renderSidebar(proj) {
    const nav = document.getElementById('phase-nav');
    if (!nav) return;

    const phases = proj.phases;
    
    // Overview button
    let html = `
      <button class="phase-btn active" onclick="App.showOverview()" id="phase-btn-overview">
        <span class="phase-btn-icon">📊</span>
        <div class="phase-btn-content">
          <span class="phase-btn-label">Overview</span>
          <div class="phase-chip"><span class="phase-pct">Dashboard</span></div>
        </div>
      </button>
      <div style="height:1px;background:var(--charcoal-border);margin:4px 14px"></div>`;

    // Phase buttons
    html += phases.map(ph => {
      const phTotal = Financial.computePhaseTotal(ph);
      return `
        <button class="phase-btn" onclick="App.showPhase(${ph.id})" id="phase-btn-${ph.id}">
          <span class="phase-btn-icon">${ph.icon}</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">${ph.name}</span>
            <div class="phase-chip">
              <span class="phase-pct" id="phase-pct-${ph.id}">${ph.completion}%</span>
              <span class="phase-cost" id="phase-cost-${ph.id}">${Financial.fmt(phTotal)}</span>
            </div>
            <div class="phase-progress-mini">
              <div class="phase-progress-mini-fill" id="phase-prog-${ph.id}" style="width:${ph.completion}%"></div>
            </div>
          </div>
        </button>`;
    }).join('');

    // Subcontractor button
    html += `
      <div style="height:1px;background:var(--charcoal-border);margin:4px 14px"></div>
      <button class="phase-btn" onclick="App.showSubLedger()" id="phase-btn-sub">
        <span class="phase-btn-icon">👷</span>
        <div class="phase-btn-content">
          <span class="phase-btn-label">Subcontractors</span>
          <div class="phase-chip"><span class="phase-pct">Ledger</span></div>
        </div>
      </button>`;

    nav.innerHTML = html;
  }

  // ── Phase Rendering ───────────────────────────────────────
  function showPhase(phaseId) {
    currentPhase = phaseId;
    const proj = State.getCurrentProject();
    if (!proj) return;

    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;

    // Update sidebar active
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`phase-btn-${phaseId}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Render workspace
    const content = document.getElementById('content-area');
    if (!content) return;

    let html = '';
    switch (phaseId) {
      case 1: html = Phases.renderPhase1(phase); break;
      case 2: html = Phases.renderPhase2(phase); break;
      case 3: html = Phases.renderPhase3(phase); break;
      case 4: html = Phases.renderPhase4(phase); break;
      case 5: html = Phases.renderPhase5(phase); break;
      case 6: html = Phases.renderPhase6(phase); break;
      case 7: html = Phases.renderPhase7(phase); break;
      case 8: html = Phases.renderPhase8(phase); break;
    }

    content.innerHTML = `<div class="phase-workspace active" id="pw-${phaseId}">${html}</div>`;

    // Restore data into inputs
    restorePhaseInputs(phase);

    // Attach live listeners
    attachAllListeners(phase);

    // Update completion input
    const compInp = document.getElementById(`comp-pct-${phaseId}`);
    if (compInp) compInp.value = phase.completion || 0;
    const compBar = document.getElementById(`comp-bar-${phaseId}`);
    if (compBar) compBar.style.width = (phase.completion || 0) + '%';

    Financial.updateAllTotals();
    AI.setWatching(`Phase ${phaseId} · ${phase.name}`);
    AI.checkTriggers();

    content.scrollTop = 0;
  }

  function showSubLedger() {
    const content = document.getElementById('content-area');
    if (!content) return;

    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const subBtn = document.getElementById('phase-btn-sub');
    if (subBtn) subBtn.classList.add('active');

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="phase-header">
          <div class="phase-title-block">
            <div class="phase-title">👷 Subcontractor & Trade Ledger</div>
            <div class="phase-subtitle">Track all trades, contracts, and payments</div>
          </div>
        </div>
        ${Phases.renderSubcontractorLedger()}
      </div>`;

    AI.setWatching('Subcontractor Ledger');
  }

  // ── Data Restoration ──────────────────────────────────────
  function restorePhaseInputs(phase) {
    const d = phase.data;

    function restoreSection(sectionData) {
      if (!sectionData || typeof sectionData !== 'object') return;
      Object.entries(sectionData).forEach(([key, val]) => {
        if (Array.isArray(val)) return;
        const el = document.getElementById(key);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!val;
        else el.value = val || '';
      });
    }

    Object.values(d).forEach(section => {
      if (section && typeof section === 'object' && !Array.isArray(section)) {
        restoreSection(section);
      }
    });

    // Special: restore sheets calc for phase 5
    if (phase.id === 5) {
      const dw = d.drywall || {};
      const sqft = dw.drywall_sqft || dw.total_sqft;
      const sheetsEl = document.getElementById('sheets-calc');
      if (sheetsEl && sqft) {
        const sheets = Math.ceil((parseFloat(sqft) / 32) * 1.1);
        sheetsEl.textContent = sheets + ' sheets';
      }
    }

    // Restore toggle card states
    if (d.temp_infra) {
      Object.entries(d.temp_infra).forEach(([key, val]) => {
        if (key.endsWith('_active') && val) {
          const id = key.replace('_active', '');
          const card = document.getElementById(`tc-${id}`);
          const sw = document.getElementById(`ts-${id}`);
          if (card) card.classList.add('active');
          if (sw) sw.classList.add('on');
        }
      });
    }
  }

  // ── Input Listeners ───────────────────────────────────────
  function attachAllListeners(phase) {
    const workspace = document.getElementById(`pw-${phase.id}`);
    if (!workspace) return;

    // All inputs and selects in the workspace
    workspace.querySelectorAll('input:not([type=checkbox]):not([type=date]):not([readonly]), select').forEach(el => {
      el.addEventListener('input', () => {
        saveInputToState(phase.id, el);
        Financial.scheduleUpdate();

        // Special auto-calcs
        if (el.id === 'drywall_sqft' || el.id === 'total_sqft') {
          const sheets = Math.ceil((parseFloat(el.value || 0) / 32) * 1.1);
          const sheetsEl = document.getElementById('sheets-calc');
          if (sheetsEl) sheetsEl.textContent = sheets + ' sheets';
        }
        if (el.id === 'cut_vol') {
          const loadEl = document.getElementById('haul_loads');
          if (loadEl && !loadEl.value) loadEl.value = Math.ceil(parseFloat(el.value || 0) / 10);
        }
      });
      el.addEventListener('change', () => {
        saveInputToState(phase.id, el);
        Financial.scheduleUpdate();
        AI.checkTriggers();

        // Flash green on change
        el.classList.add('saved');
        setTimeout(() => el.classList.remove('saved'), 800);
      });
    });

    // Checkboxes
    workspace.querySelectorAll('input[type=checkbox]').forEach(el => {
      el.addEventListener('change', () => {
        saveInputToState(phase.id, el);
      });
    });

    // Date inputs
    workspace.querySelectorAll('input[type=date]').forEach(el => {
      el.addEventListener('change', () => {
        saveInputToState(phase.id, el);
      });
    });
  }

  function saveInputToState(phaseId, el) {
    if (!el.id) return;
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;

    // Find which section this belongs to by checking section card parents
    const sectionCard = el.closest('.section-card');
    const sectionId = (sectionCard?.id || 'general').replace('sc-', '');

    // Map input to phase data
    const sectionMap = {
      'p1-survey': 'survey', 'p1-infra': 'temp_infra',
      'p2-earth': 'earthwork', 'p2-concrete': 'concrete', 'p2-utility': 'utility',
      'p3-skel': 'skeleton', 'p3-roof': 'roofing', 'p3-windows': 'windows',
      'p4-hvac': 'hvac', 'p4-plumb': 'plumbing', 'p4-elec': 'electrical', 'p4-block': 'blocking',
      'p5-ins': 'insulation', 'p5-drywall': 'drywall',
      'p6-clad': 'cladding', 'p6-cab': 'cabinetry', 'p6-trim': 'trim',
      'p7-elec': 'elec_trim', 'p7-plumb': 'plumb_trim', 'p7-counter': 'countertops',
      'p8-hand': 'handover',
    };

    const sectionKey = sectionMap[sectionId] || 'general';
    if (!phase.data[sectionKey]) phase.data[sectionKey] = {};

    const val = el.type === 'checkbox' ? el.checked : el.value;
    phase.data[sectionKey][el.id] = val;
    State.save();
  }

  // ── UI Controls ───────────────────────────────────────────
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.toggle('collapsed', !sidebarOpen);
  }

  function toggleAI() {
    aiOpen = !aiOpen;
    const drawer = document.getElementById('ai-drawer');
    if (drawer) drawer.classList.toggle('hidden-drawer', !aiOpen);
    AI.clearPulse();
  }

  function minimizeAI() { toggleAI(); }

  function closeAI() {
    aiOpen = false;
    const drawer = document.getElementById('ai-drawer');
    if (drawer) drawer.classList.add('hidden-drawer');
  }

  function sendAIMessage() {
    const inp = document.getElementById('ai-input');
    if (!inp || !inp.value.trim()) return;
    const msg = inp.value.trim();
    inp.value = '';
    AI.sendUserMessage(msg);
  }

  function exportPDF() { Export.exportPDF(); }
  function exportExcel() { Export.exportExcel(); }

  // ── Toast Notifications ────────────────────────────────────
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `${type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'ℹ'} ${message}`;
    container.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(100%)';
      t.style.transition = 'all 0.3s var(--ease-out)';
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  // ── Init ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  return {
    init, startNewProject, openProject,
    wizardNext, wizardBack,
    showPhase, showSubLedger,
    showDashboard: showDashboardHome,
    showOverview,
    toggleSidebar, toggleAI, minimizeAI, closeAI,
    sendAIMessage, exportPDF, exportExcel,
    toast,
  };
})();
