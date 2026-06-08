/* ═══════════════════════════════════════════
   APP.JS — Main Application Controller v2
   Routing, Wizard, Phase Navigation, Dashboard
   ═══════════════════════════════════════════ */

const App = (() => {
  // currentView: 'overview' | 'phase-hub' | 'phase-category' | 'interior-hub' | 'interior-category' | 'subcontractors' | 'tools'
  let currentView = 'overview';
  let currentPhase = 0; // 0 = dashboard, 1-9 = phase number
  let currentCategory = null; // category id when in 'phase-category' or 'interior-category'
  let sidebarOpen = true;
  let aiOpen = true;
  let wizardStep = 1;
  const wizardData = {};
  // Sidebar group collapse state (persisted per session)
  const collapsedGroups = new Set(); // 'construction' | 'interior' | 'tools'

  // ── Boot ──────────────────────────────────────────────────
  function init() {
    try {
      const projects = State.getProjects();
      const currentProj = State.getCurrentProject();

      if (currentProj) {
        showMainApp(currentProj);
      } else if (projects.length > 0) {
        showWelcomeWithProjects(projects);
      } else {
        showWelcome();
      }
    } catch (err) {
      console.error('[App] init failed:', err);
      // Fallback: show welcome screen so the user is never stuck
      try { showWelcome(); } catch (e2) { /* swallow */ }
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const phase = parseInt(e.key);
        if (State.getCurrentProject()) showPhase(phase);
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        toast(`Auto-saved ${Icons.render('check', 11)}`, 'success');
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

    // Render safely — wrap each project's stats in try/catch so a
    // single broken project doesn't blank the whole welcome page
    const rows = projects.map(p => {
      try {
        const total = Financial.computeProjectTotal(p) || 0;
        const pct = p.totalBudget > 0 ? Math.round((total / p.totalBudget) * 100) : 0;
        const safeName = p.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `<div class="existing-project-row">
          <button class="existing-project-btn" onclick="App.openProject('${p.id}')">
            <div style="min-width:0">
              <div style="font-weight:700;font-size:14px">${p.name}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${p.address || 'No address'} ${p.client ? '· ' + p.client : ''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-family:var(--font-mono);color:var(--steel-light);font-weight:600">${Financial.fmtFull(total)}</div>
              ${p.totalBudget > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${pct}% of budget</div>` : ''}
            </div>
          </button>
          <button class="existing-project-delete-btn" title="Delete project" onclick="App.confirmDeleteProjectById('${p.id}', '${safeName}', event)">
            🗑
          </button>
        </div>`;
      } catch (e) {
        console.warn('[App] Skipping project in welcome list (render error):', e);
        return '';
      }
    }).filter(Boolean).join('');
    listEl.innerHTML = `<div class="existing-projects-divider">or open existing project</div>${rows}`;
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

  let _wizardCreating = false; // guard against double-tap
  async function wizardNext() {
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

      if (_wizardCreating) return;
      _wizardCreating = true;
      const nextBtn = document.getElementById('wizard-next');
      if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Creating…'; }
      try {
        const proj = await State.createProject(wizardData);
        if (!proj) { toast('Could not create project — try again', 'error'); return; }
        const phases = Array.isArray(proj.phases) ? proj.phases : [];
        console.log('[App] Created project:', proj.name, 'id:', proj.id, 'phases:', phases.length);
        document.getElementById('project-wizard').classList.add('hidden');
        showMainApp(proj);
      } catch (createErr) {
        console.error('[App] Project creation error:', createErr);
        toast('Could not create project — try again', 'error');
      } finally {
        _wizardCreating = false;
        if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Create Project →'; }
      }
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
    if (!proj) {
      console.warn('[App] showMainApp called with no project — falling back to welcome');
      return showWelcome();
    }
    // Ensure the project is set as the current one in state.
    // setCurrentProject just updates the pointer; createProject
    // already pushed the project into store.projects. This is a
    // safety net in case the local proj reference is stale.
    State.setCurrentProject(proj.id);

    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('project-wizard').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    document.getElementById('current-project-name').textContent = proj.name;

    if (proj.currency) Financial.currency = proj.currency;

    // Use the project from State (which has the canonical id and
    // full data after a possible cloud sync) rather than the local
    // proj reference, so getCurrentProject() in Dashboard.render()
    // can find the same object.
    const canonical = State.getCurrentProject() || proj;
    renderSidebar(canonical);
    showOverview(); // Start with dashboard
    Financial.updateAllTotals();

    setTimeout(() => {
      AI.addMessage('info', Phases.iconFor('checkCircle', 14), 'Welcome', `Project "${canonical.name}" loaded. ${Financial.fmtFull(Financial.computeProjectTotal(canonical))} tracked so far. Fill in each phase and I'll flag risks as you go.`, ['Got it']);
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
    currentView = 'overview';
    currentPhase = 0;
    currentCategory = null;
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

    // Safety: ensure phases is an array (could be missing on a
    // partially-loaded project during the boot sequence)
    const phases = Array.isArray(proj?.phases) ? proj.phases : [];
    if (!phases.length) {
      // Show a friendly message. The most common cause is the
      // user being on the dashboard — they need to open a project
      // for the sidebar to populate.
      const onDashboard = currentView === 'overview';
      nav.innerHTML = `<div style="padding:24px 16px;color:var(--text-muted);font-size:12px;text-align:center;line-height:1.6">
        <div style="margin-bottom:8px;color:var(--text-muted);opacity:0.7">${Phases.iconFor('dashboard', 28)}</div>
        ${onDashboard
          ? 'No project open. Click an existing project above, or create a new one.'
          : 'Loading phases…'}
      </div>`;
      return;
    }
    const constructionCollapsed = collapsedGroups.has('construction');
    const interiorCollapsed = collapsedGroups.has('interior');
    const toolsCollapsed = collapsedGroups.has('tools');

    // Helper: a collapsible group header. `key` is the state key,
    // `icon` and `label` for display, `extra` for inline mini-info
    function groupHeader(key, icon, label, collapsed) {
      return `
        <div class="sidebar-group-header ${collapsed ? 'is-collapsed' : ''}" onclick="App.toggleSidebarGroup('${key}')" id="group-header-${key}">
          <span class="sidebar-group-toggle">${Phases.iconFor('chevronDown', 10)}</span>
          <span class="sidebar-group-icon">${Phases.iconFor(icon, 13)}</span>
          <span>${label}</span>
          <span class="sidebar-group-divider"></span>
        </div>`;
    }

    // ── Dashboard: single block, no group header ──
    let html = `
      <button class="phase-btn ${currentView === 'overview' ? 'active' : ''}" onclick="App.showOverview()" id="phase-btn-overview">
        <span class="phase-btn-icon">${Phases.iconFor('dashboard', 15)}</span>
        <div class="phase-btn-content">
          <span class="phase-btn-label">Dashboard</span>
          <div class="phase-chip"><span class="phase-pct">Overview</span></div>
        </div>
      </button>`;

    // ── Group 2: Construction (Phases 1-9 — 9 trades) — collapsible ──
    html += groupHeader('construction', 'building', 'Construction', constructionCollapsed);
    if (!constructionCollapsed) {
      // Construction is phases 1-9 (the 9 trade phases). Interior is #10.
      const constructionPhases = phases.filter(p => p.id >= 1 && p.id <= 9);
      html += constructionPhases.map(ph => {
        const phTotal = Financial.computePhaseTotal(ph);
        const isActive = currentPhase === ph.id && (currentView === 'phase-hub' || currentView === 'phase-category');
        return `
          <button class="phase-btn ${isActive ? 'active' : ''}" onclick="App.showPhaseHub(${ph.id})" id="phase-btn-${ph.id}">
            <span class="phase-btn-icon">${Phases.iconFor(ph.icon, 15)}</span>
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
    }

    // ── Group 3: Interior — collapsible ──
    const interiorPhase = phases.find(p => p.id === 10);
    if (interiorPhase) {
      html += groupHeader('interior', 'sofa', 'Interior', interiorCollapsed);
      if (!interiorCollapsed) {
      const intTotal = Financial.computePhaseTotal(interiorPhase);
      const intActive = currentView === 'interior-hub' || currentView === 'interior-category' || currentView === 'colour-lab';
      html += `
        <button class="phase-btn ${intActive ? 'active' : ''}" onclick="App.showInteriorHub()" id="phase-btn-interior">
            <span class="phase-btn-icon">${Phases.iconFor('sofa', 15)}</span>
            <div class="phase-btn-content">
              <span class="phase-btn-label">Interior Finish</span>
              <div class="phase-chip">
                <span class="phase-pct" id="phase-pct-10">${interiorPhase.completion}%</span>
                <span class="phase-cost" id="phase-cost-10">${Financial.fmt(intTotal)}</span>
              </div>
              <div class="phase-progress-mini">
                <div class="phase-progress-mini-fill" id="phase-prog-10" style="width:${interiorPhase.completion}%"></div>
              </div>
            </div>
          </button>`;
      }
    }

    // ── Group 4: Tools — collapsible ──
    html += groupHeader('tools', 'tools', 'Tools', toolsCollapsed);
    if (!toolsCollapsed) {
      html += `
        <button class="phase-btn ${currentView === 'subcontractors' ? 'active' : ''}" onclick="App.showSubLedger()" id="phase-btn-sub">
          <span class="phase-btn-icon">${Phases.iconFor('userCircle', 15)}</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">Subcontractors</span>
            <div class="phase-chip"><span class="phase-pct">Ledger</span></div>
          </div>
        </button>
        <button class="phase-btn ${currentView === 'labour-hub' ? 'active' : ''}" onclick="App.showLabourHub()" id="phase-btn-labour">
          <span class="phase-btn-icon">👷</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">Labour (Hajiri)</span>
            <div class="phase-chip"><span class="phase-pct">Attendance</span></div>
          </div>
        </button>
        <button class="phase-btn ${currentView === 'vendor-hub' ? 'active' : ''}" onclick="App.showVendorHub()" id="phase-btn-vendor">
          <span class="phase-btn-icon">🏪</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">Vendor Khata</span>
            <div class="phase-chip"><span class="phase-pct">Udhaar</span></div>
          </div>
        </button>
        <button class="phase-btn ${currentView === 'inventory-hub' ? 'active' : ''}" onclick="App.showInventoryHub()" id="phase-btn-inventory">
          <span class="phase-btn-icon">📦</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">Site Stock</span>
            <div class="phase-chip"><span class="phase-pct">Inventory</span></div>
          </div>
        </button>
        <button class="phase-btn ${currentView === 'ra-bills' ? 'active' : ''}" onclick="App.showRaBillsHub()" id="phase-btn-ra">
          <span class="phase-btn-icon">🧾</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">RA Bills</span>
            <div class="phase-chip"><span class="phase-pct">Invoices</span></div>
          </div>
        </button>
        <button class="phase-btn ${currentView === 'tools' ? 'active' : ''}" onclick="App.showTools()" id="phase-btn-tools">
          <span class="phase-btn-icon">${Phases.iconFor('wrench', 15)}</span>
          <div class="phase-btn-content">
            <span class="phase-btn-label">Project Tools</span>
            <div class="phase-chip"><span class="phase-pct">Export · AI</span></div>
          </div>
        </button>`;
    }

    nav.innerHTML = html;
  }

  // Toggle a sidebar group's collapsed state and re-render
  function toggleSidebarGroup(key) {
    if (collapsedGroups.has(key)) collapsedGroups.delete(key);
    else collapsedGroups.add(key);
    const proj = State.getCurrentProject();
    if (proj) renderSidebar(proj);
  }

  // ── Phase Rendering ───────────────────────────────────────
  // New flow: clicking a phase button shows the CATEGORY HUB
  // (a grid of cards). Clicking a card shows the detail form
  // for that category, with a back-to-hub button + breadcrumb.
  function showPhase(phaseId) {
    // Keyboard shortcuts (Ctrl+1..9) land here — route to hub
    showPhaseHub(phaseId);
  }

  function showPhaseHub(phaseId) {
    currentView = phaseId === 10 ? 'interior-hub' : 'phase-hub';
    currentPhase = phaseId;
    currentCategory = null;
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;

    // Update sidebar active state without full re-render
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`phase-btn-${phaseId}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('content-area');
    if (!content) return;

    content.innerHTML = Phases.renderPhaseHub(phase);
    content.scrollTop = 0;

    AI.setWatching(`Phase ${phaseId} · ${phase.name} · Hub`);
  }

  // Interior gets its own dedicated entry point (no "Phase 9" numbering)
  function showInteriorHub() {
    showPhaseHub(10);
  }

  // Show the AI Bill Scanner ledger for a given phase
  function showPhaseBills(phaseId) {
    currentView = 'phase-bills';
    currentPhase = phaseId;
    currentCategory = 'bills';
    
    // Update sidebar active state
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`phase-btn-${phaseId}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('content-area');
    if (!content) return;

    // Use the new BillScanner module to render the UI
    content.innerHTML = BillScanner.renderBillsHub(phaseId);
    content.scrollTop = 0;

    AI.setWatching(`Phase ${phaseId} · Bills Scanner`);
  }

  // Open a single category's detail form
  function showPhaseCategory(phaseId, categoryId) {
    currentView = phaseId === 10 ? 'interior-category' : 'phase-category';
    currentPhase = phaseId;
    currentCategory = categoryId;
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;

    const category = (Phases.CATEGORY_REGISTRY[phaseId] || []).find(c => c.id === categoryId);
    if (!category) return showPhaseHub(phaseId);

    // Update sidebar active state
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`phase-btn-${phaseId}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('content-area');
    if (!content) return;

    // Render ONLY this category's section cards. We call the full
    // renderTradePhaseN() (or renderPhase9 for Interior) to get
    // the standard HTML, then strip out every section card except
    // the ones this category owns.
    let fullPhaseHtml = '';
    switch (phaseId) {
      case 1: fullPhaseHtml = Phases.renderTradePhase1(phase); break;
      case 2: fullPhaseHtml = Phases.renderTradePhase2(phase); break;
      case 3: fullPhaseHtml = Phases.renderTradePhase3(phase); break;
      case 4: fullPhaseHtml = Phases.renderTradePhase4(phase); break;
      case 5: fullPhaseHtml = Phases.renderTradePhase5(phase); break;
      case 6: fullPhaseHtml = Phases.renderTradePhase6(phase); break;
      case 7: fullPhaseHtml = Phases.renderTradePhase7(phase); break;
      case 8: fullPhaseHtml = Phases.renderTradePhase8(phase); break;
      case 9: fullPhaseHtml = Phases.renderTradePhase9(phase); break;
      case 10: fullPhaseHtml = Phases.renderPhase9(phase); break; // Interior
    }

    // Use the proper phaseHeader helper (now exported) so the
    // header + budget bar + completion bar render correctly
    const headerHtml = Phases.phaseHeader(phase);
    const filteredSectionsHtml = Phases.filterPhaseHtmlBySections(fullPhaseHtml, category.sectionIds || []);

    // For "synthetic" categories (no actual section card) show a meta card
    const bodyHtml = (category.sectionIds && category.sectionIds.length > 0)
      ? filteredSectionsHtml
      : Phases.renderCategoryMetaCard(category);

    // Breadcrumb + back button
    const backTarget = phaseId === 10 ? 'App.showInteriorHub()' : `App.showPhaseHub(${phaseId})`;
    const crumbHtml = `
      <div class="breadcrumb">
        <a onclick="App.showOverview()">Overview</a>
        <span class="breadcrumb-sep">›</span>
        <a onclick="${backTarget}">${Phases.iconFor(phase.icon, 11)} <span style="margin-left:6px">${phase.name}</span></a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${Phases.iconFor(category.icon, 11)} <span style="margin-left:6px">${category.name}</span></span>
      </div>
      <button class="back-to-hub" onclick="${backTarget}">${Phases.iconFor('arrowLeft', 12)} Back to ${phase.name} categories</button>
    `;

    content.innerHTML = `<div class="phase-workspace active" id="pw-${phaseId}">${crumbHtml}${headerHtml}${bodyHtml}</div>`;

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
    AI.setWatching(`Phase ${phaseId} · ${category.name}`);
    AI.checkTriggers();

    // Smooth scroll the focus category into view if possible
    content.scrollTop = 0;
  }

  // Open a single input card's detail form (the new per-input design)
  // Used by the 9 trade phases. Each card has a specific set of
  // fields with their own costFn. The card is rendered with
  // breadcrumb + back-to-hub navigation.
  function showInputCard(phaseId, cardId) {
    currentView = phaseId === 10 ? 'interior-category' : 'phase-category';
    currentPhase = phaseId;
    currentCategory = cardId;
    const proj = State.getCurrentProject();
    if (!proj) return;
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return;

    // Look up the card spec from phases.js
    const card = Phases.getInputCard ? Phases.getInputCard(phaseId, cardId) : null;
    if (!card) {
      // Fallback: go to the phase hub
      return showPhaseHub(phaseId);
    }

    // Update sidebar active state
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`phase-btn-${phaseId}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('content-area');
    if (!content) return;

    // Breadcrumb + back button
    const backTarget = phaseId === 10 ? 'App.showInteriorHub()' : `App.showPhaseHub(${phaseId})`;
    const crumbHtml = `
      <div class="breadcrumb">
        <a onclick="App.showOverview()">Overview</a>
        <span class="breadcrumb-sep">›</span>
        <a onclick="${backTarget}">${Phases.iconFor(phase.icon, 11)} <span style="margin-left:6px">${phase.name}</span></a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${Phases.iconFor(card.icon, 11)} <span style="margin-left:6px">${card.name}</span></span>
      </div>
      <button class="back-to-hub" onclick="${backTarget}">${Phases.iconFor('arrowLeft', 12)} Back to ${phase.name} categories</button>
    `;

    const cardDetailHtml = Phases.renderSingleInputCard(phase, card);
    content.innerHTML = `<div class="phase-workspace active" id="pw-${phaseId}">${crumbHtml}${cardDetailHtml}</div>`;
    content.scrollTop = 0;

    AI.setWatching(`Phase ${phaseId} · ${card.name}`);
    Financial.updateAllTotals();
  }

  function showLabourHub() {
    currentView = 'labour-hub';
    currentPhase = null;
    currentCategory = null;
    const proj = State.getCurrentProject();
    if (!proj) return;
    renderSidebar(proj);

    const content = document.getElementById('content-area');
    if (!content) return;

    if (typeof LabourVendors !== 'undefined' && LabourVendors.renderLabourHub) {
      content.innerHTML = LabourVendors.renderLabourHub();
    } else {
      content.innerHTML = '<div style="padding:24px">Labour module loading...</div>';
    }
  }

  function showVendorHub() {
    currentView = 'vendor-hub';
    currentPhase = null;
    currentCategory = null;
    const proj = State.getCurrentProject();
    if (!proj) return;
    renderSidebar(proj);

    const content = document.getElementById('content-area');
    if (!content) return;

    if (typeof VendorKhata !== 'undefined' && VendorKhata.renderVendorHub) {
      content.innerHTML = VendorKhata.renderVendorHub();
    } else {
      content.innerHTML = '<div style="padding:24px">Vendor Khata module loading...</div>';
    }
    content.scrollTop = 0;
    AI.setWatching('Vendor Khata');
  }

  function showInventoryHub() {
    currentView = 'inventory-hub';
    currentPhase = null;
    currentCategory = null;
    const proj = State.getCurrentProject();
    if (!proj) return;
    renderSidebar(proj);

    const content = document.getElementById('content-area');
    if (!content) return;

    if (typeof SiteInventory !== 'undefined' && SiteInventory.renderInventoryHub) {
      content.innerHTML = SiteInventory.renderInventoryHub();
    } else {
      content.innerHTML = '<div style="padding:24px">Site Inventory module loading...</div>';
    }
    content.scrollTop = 0;
    AI.setWatching('Site Stock');
  }

  function showRaBillsHub() {
    currentView = 'ra-bills';
    currentPhase = null;
    currentCategory = null;
    const proj = State.getCurrentProject();
    if (!proj) return;
    renderSidebar(proj);

    const content = document.getElementById('content-area');
    if (!content) return;

    if (typeof RaBills !== 'undefined' && RaBills.renderRaBillsHub) {
      content.innerHTML = RaBills.renderRaBillsHub();
    } else {
      content.innerHTML = '<div style="padding:24px">RA Bills module loading...</div>';
    }
    content.scrollTop = 0;
    AI.setWatching('RA Bills');
  }



  function showSubLedger() {
    currentView = 'subcontractors';
    currentPhase = 0;
    currentCategory = null;
    const content = document.getElementById('content-area');
    if (!content) return;

    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const subBtn = document.getElementById('phase-btn-sub');
    if (subBtn) subBtn.classList.add('active');

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="breadcrumb">
          <a onclick="App.showOverview()">Overview</a>
          <span class="breadcrumb-sep">›</span>
          <span class="breadcrumb-current">${Phases.iconFor('userCircle', 11)} <span style="margin-left:6px">Subcontractors</span></span>
        </div>
        <div class="phase-header">
          <div class="phase-title-block">
            <div class="phase-title">${Phases.iconFor('userCircle', 22)} <span style="margin-left:8px">Subcontractor & Trade Ledger</span></div>
            <div class="phase-subtitle">Track all trades, contracts, and payments</div>
          </div>
        </div>
        ${Phases.renderSubcontractorLedger()}
      </div>`;

    AI.setWatching('Subcontractor Ledger');
  }

  // ── Colour Lab (Interior Colour Visualiser) ───────────────
  function showColourLab() {
    currentView = 'colour-lab';
    currentPhase = 10;
    currentCategory = null;
    const content = document.getElementById('content-area');
    if (!content) return;

    // Clear any previous canvas
    if (typeof ColourLab !== 'undefined' && ColourLab.destroy) ColourLab.destroy();

    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const interiorBtn = document.getElementById('phase-btn-interior');
    if (interiorBtn) interiorBtn.classList.add('active');

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="breadcrumb">
          <a onclick="App.showOverview()">Overview</a>
          <span class="breadcrumb-sep">›</span>
          <a onclick="App.showInteriorHub()">Interior Finish</a>
          <span class="breadcrumb-sep">›</span>
          <span class="breadcrumb-current">🎨 Colour Lab</span>
        </div>
        <button class="back-to-hub" onclick="App.showInteriorHub()">
          ← Back to Interior categories
        </button>
        ${typeof ColourLab !== 'undefined' ? ColourLab.renderView() : '<p>Colour Lab not loaded.</p>'}
      </div>`;

    // Init canvas after DOM is painted
    setTimeout(() => {
      if (typeof ColourLab !== 'undefined') ColourLab.init();
    }, 60);

    content.scrollTop = 0;
    AI.setWatching('Colour Lab');
  }

  function showTools() {
    currentView = 'tools';
    currentPhase = 0;
    currentCategory = null;
    const content = document.getElementById('content-area');
    if (!content) return;

    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
    const toolsBtn = document.getElementById('phase-btn-tools');
    if (toolsBtn) toolsBtn.classList.add('active');

    const proj = State.getCurrentProject();
    const total = proj ? Financial.computeProjectTotal(proj) : 0;
    const budget = proj ? proj.totalBudget : 0;
    const pct = budget > 0 ? Math.round((total / budget) * 100) : 0;

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="breadcrumb">
          <a onclick="App.showOverview()">Overview</a>
          <span class="breadcrumb-sep">›</span>
          <span class="breadcrumb-current">${Phases.iconFor('wrench', 11)} <span style="margin-left:6px">Project Tools</span></span>
        </div>
        <div class="category-hub">
          <div class="category-hub-header">
            <div>
              <div class="category-hub-title">${Phases.iconFor('wrench', 26)} <span style="margin-left:10px">Project Tools</span></div>
              <div class="category-hub-subtitle">Export your data, generate AI insights, and manage project artifacts</div>
            </div>
          </div>
          <div class="category-grid">
            <button class="category-card" onclick="App.exportPDF()">
              <span class="category-card-arrow">→</span>
              <span class="category-card-icon">${Phases.iconFor('fileText', 28)}</span>
              <div class="category-card-name">Export PDF Report</div>
              <div class="category-card-desc">Generate a printable project summary with all phases, line items, and totals.</div>
              <div class="category-card-meta">
                <div class="category-card-progress">
                  <div class="category-card-progress-label">Printable · single page summary</div>
                </div>
              </div>
            </button>
            <button class="category-card" onclick="App.exportExcel()">
              <span class="category-card-arrow">→</span>
              <span class="category-card-icon">${Phases.iconFor('dashboard', 28)}</span>
              <div class="category-card-name">Export CSV / Excel</div>
              <div class="category-card-desc">Download all phase data as CSV for analysis in Excel, Sheets, or Power BI.</div>
              <div class="category-card-meta">
                <div class="category-card-progress">
                  <div class="category-card-progress-label">All line items · machine-readable</div>
                </div>
              </div>
            </button>
            <button class="category-card" onclick="AI.sendUserMessage('Give me a full project health analysis with risks and recommendations.')">
              <span class="category-card-arrow">→</span>
              <span class="category-card-icon">${Phases.iconFor('bot', 28)}</span>
              <div class="category-card-name">AI Project Health</div>
              <div class="category-card-desc">Run a deep AI analysis: budget risk, over-spend alerts, cost optimization, scope risks.</div>
              <div class="category-card-meta">
                <div class="category-card-progress">
                  <div class="category-card-progress-label">Powered by Gemini · uses live project data</div>
                </div>
              </div>
            </button>
            <button class="category-card" onclick="AI.sendUserMessage('List every line item across all phases with quantities and unit prices.')">
              <span class="category-card-arrow">→</span>
              <span class="category-card-icon">${Phases.iconFor('listChecks', 28)}</span>
              <div class="category-card-name">AI Line-Item Dump</div>
              <div class="category-card-desc">Have the AI enumerate every entered field, quantity, and price — useful for audits.</div>
              <div class="category-card-meta">
                <div class="category-card-progress">
                  <div class="category-card-progress-label">Comprehensive data export via AI</div>
                </div>
              </div>
            </button>
            <button class="category-card" onclick="App.toggleAI()">
              <span class="category-card-arrow">→</span>
              <span class="category-card-icon">${Phases.iconFor('chat', 28)}</span>
              <div class="category-card-name">Open AI Assistant</div>
              <div class="category-card-desc">Open the Build Assistant drawer to ask anything about costs, materials, or schedules.</div>
              <div class="category-card-meta">
                <div class="category-card-progress">
                  <div class="category-card-progress-label">Always-on co-pilot</div>
                </div>
              </div>
            </button>
            <button class="category-card" onclick="App.showDashboard()">
              <span class="category-card-arrow">→</span>
              <span class="category-card-icon">${Phases.iconFor('dashboard', 28)}</span>
              <div class="category-card-name">Back to Dashboard</div>
              <div class="category-card-desc">Return to the project overview and switch projects.</div>
              <div class="category-card-meta">
                <div class="category-card-progress">
                  <div class="category-card-progress-label">Project home</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>`;

    AI.setWatching('Project Tools');
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

    // Clear Phase 10 manual total override if a sub-field is changed
    if (phase.id === 10 && !el.id.includes('-total')) {
      delete phase.data[`_manual_${sectionId}-total`];
    }

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
    t.innerHTML = `${type === 'success' ? Icons.render('check', 12) : type === 'warning' ? Icons.render('alert', 12) : Icons.render('info', 12)} <span style="margin-left:6px">${message}</span>`;
    container.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(100%)';
      t.style.transition = 'all 0.3s var(--ease-out)';
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  // ── Generic Modal ──────────────────────────────────────────
  function showModal(contentHtml) {
    let modal = document.getElementById('generic-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generic-modal';
      document.body.appendChild(modal);
    }
    modal.className = 'confirm-modal-overlay';
    modal.innerHTML = `
      <div class="confirm-modal-box" style="max-width: 500px; text-align: left;">
        <div id="generic-modal-body">${contentHtml}</div>
      </div>
    `;
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // ensures visibility
  }

  function closeModal() {
    const modal = document.getElementById('generic-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  // ── Confirm Delete Modal ───────────────────────────────────
  let _confirmAction = null;
  let _confirmRequired = null; // string that must be typed, or null

  function showConfirmModal({ icon = '🗑', title, body, confirmLabel = 'Delete', confirmRequired = null, onConfirm }) {
    _confirmAction = onConfirm;
    _confirmRequired = confirmRequired;

    document.getElementById('confirm-modal-icon').textContent = icon;
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-body').textContent = body;
    document.getElementById('confirm-modal-btn').textContent = confirmLabel;

    const inputWrap = document.getElementById('confirm-modal-input-wrap');
    const input = document.getElementById('confirm-modal-input');
    if (confirmRequired) {
      inputWrap.style.display = 'block';
      document.getElementById('confirm-modal-input-label').textContent = `Type "${confirmRequired}" to confirm:`;
      input.placeholder = confirmRequired;
      input.value = '';
      document.getElementById('confirm-modal-btn').disabled = true;
    } else {
      inputWrap.style.display = 'none';
      document.getElementById('confirm-modal-btn').disabled = false;
    }

    document.getElementById('confirm-modal').classList.remove('hidden');
    if (confirmRequired) setTimeout(() => input.focus(), 100);
  }

  function closeConfirmModal(e) {
    if (e && e.target !== document.getElementById('confirm-modal')) return;
    document.getElementById('confirm-modal').classList.add('hidden');
    _confirmAction = null;
    _confirmRequired = null;
  }

  function onConfirmInput() {
    if (!_confirmRequired) return;
    const val = document.getElementById('confirm-modal-input').value;
    document.getElementById('confirm-modal-btn').disabled = (val !== _confirmRequired);
  }

  async function executeConfirmAction() {
    if (!_confirmAction) return;
    const btn = document.getElementById('confirm-modal-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
      await _confirmAction();
    } catch (err) {
      toast('Delete failed: ' + (err.message || err), 'warning');
    }
    document.getElementById('confirm-modal').classList.add('hidden');
    _confirmAction = null;
    _confirmRequired = null;
  }

  // ── Delete Project ─────────────────────────────────────────
  function confirmDeleteProject() {
    const proj = State.getCurrentProject();
    // Close user dropdown
    document.getElementById('user-dropdown')?.classList.add('hidden');
    if (!proj) {
      toast('No project open to delete', 'warning');
      return;
    }
    showConfirmModal({
      icon: '🗑',
      title: `Delete "${proj.name}"?`,
      body: `All phases, subcontractors, invoices and punch items in this project will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete Project',
      onConfirm: async () => {
        await State.deleteProject(proj.id);
        showDashboardHome();
        toast('Project deleted', 'success');
      }
    });
  }

  // Called from the welcome screen project list
  function confirmDeleteProjectById(id, name, e) {
    e?.stopPropagation();
    showConfirmModal({
      icon: '🗑',
      title: `Delete "${name}"?`,
      body: `All data for this project will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete Project',
      onConfirm: async () => {
        await State.deleteProject(id);
        const remaining = State.getProjects();
        if (remaining.length > 0) showWelcomeWithProjects(remaining);
        else showWelcome();
        toast('Project deleted', 'success');
      }
    });
  }

  // ── Delete Account ─────────────────────────────────────────
  function confirmDeleteAccount() {
    document.getElementById('user-dropdown')?.classList.add('hidden');
    const user = SupabaseClient.getUser?.();
    const email = user?.email || 'your account';
    showConfirmModal({
      icon: '⚠️',
      title: 'Delete Your Account?',
      body: `This will permanently delete ${email} and ALL your projects, phases, subcontractors, and data. This cannot be undone.`,
      confirmLabel: 'Delete Everything',
      confirmRequired: 'DELETE',
      onConfirm: async () => {
        await SupabaseClient.deleteUser();
        try { localStorage.clear(); } catch {}
        toast('Account deleted. Redirecting…', 'success');
        setTimeout(() => { window.location.href = '/auth.html'; }, 1200);
      }
    });
  }

  // ── User Menu ──────────────────────────────────────────────
  function _closeMenuOnOutsideClick(e) {
    if (!e.target.closest('#user-menu')) {
      const dd = document.getElementById('user-dropdown');
      if (dd) dd.classList.add('hidden');
      document.removeEventListener('click', _closeMenuOnOutsideClick);
    }
  }

  function toggleUserMenu() {
    const dd = document.getElementById('user-dropdown');
    if (!dd) return;
    // Show/hide delete-project button based on whether a project is open
    const delProjBtn = document.getElementById('btn-delete-project');
    if (delProjBtn) delProjBtn.style.display = State.getCurrentProject() ? 'block' : 'none';
    dd.classList.toggle('hidden');
    // Close on outside click — single persistent listener
    if (!dd.classList.contains('hidden')) {
      document.removeEventListener('click', _closeMenuOnOutsideClick);
      setTimeout(() => document.addEventListener('click', _closeMenuOnOutsideClick), 0);
    }
  }

  async function signOut() {
    try {
      if (typeof SupabaseClient !== 'undefined') {
        await SupabaseClient.signOut();
      }
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    // Clear local app state (but keep Supabase auth session cleared via signOut)
    // Legacy localStorage key from prior brand naming
    try { localStorage.removeItem('buildmanager_v2'); } catch {}
    window.location.href = '/auth.html';
  }

  // ── Init ──────────────────────────────────────────────────
  async function boot() {
    // Wait for state to finish loading from Supabase (or localStorage fallback)
    try {
      await State.load();
    } catch (err) {
      console.warn('[App] State load error:', err);
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    init, startNewProject, openProject,
    wizardNext, wizardBack,
    showPhase, showPhaseHub, showPhaseCategory, showInputCard, showInteriorHub, showPhaseBills,
    showSubLedger, showLabourHub, showVendorHub, showInventoryHub, showRaBillsHub,
    showTools, showColourLab,
    showDashboard: showDashboardHome,
    showOverview,
    toggleSidebar, toggleSidebarGroup, toggleAI, minimizeAI, closeAI,
    sendAIMessage, exportPDF, exportExcel,
    toggleUserMenu, signOut, toast, showModal, closeModal,
    // Delete system
    showConfirmModal, closeConfirmModal, onConfirmInput, executeConfirmAction,
    confirmDeleteProject, confirmDeleteProjectById, confirmDeleteAccount,
    toast,
  };
})();
