/* ═══════════════════════════════════════════════════════════════
   RECON · APP.JS  (mobile-first, bottom-nav controller)
   - Top app bar + AI right drawer
   - 4 hubs: Dashboard, Phases, Ledgers (Labour/Vendor/Inventory), More
   - Reuses every existing module (Dashboard, Phases, LabourVendors,
     VendorKhata, SiteInventory, RaBills, FlatSales, AI, Export, State)
   ═══════════════════════════════════════════════════════════════ */

// ── Global Dropdown Interceptor: Dynamic "Other" option ──
(function() {
  const originalValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const originalSelectedIndexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  function ensureSelectEnhanced(selectEl) {
    if (!selectEl || selectEl.dataset.enhanced) return;
    if (!selectEl.parentNode) return;
    
    // Ignore currency selects and phase select picker
    if (selectEl.id === 'ep-currency' || selectEl.id === 'w-currency' || selectEl.id === 'sm-phase') return;

    selectEl.dataset.enhanced = "true";

    // 1. Add "Other" option if not present
    let hasOther = false;
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === '__other__' || selectEl.options[i].text.toLowerCase() === 'other') {
        hasOther = true;
        selectEl.options[i].value = '__other__';
        break;
      }
    }
    if (!hasOther) {
      const opt = document.createElement('option');
      opt.value = '__other__';
      opt.text = 'Other (Type custom)...';
      selectEl.add(opt);
    }

    // 2. Create the custom input element
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type custom option…';
    input.className = 'custom-select-input';
    
    // Premium styling matching the theme
    const rawVal = originalValueDesc.get.call(selectEl);
    input.style.display = rawVal === '__other__' ? 'block' : 'none';
    input.style.marginTop = '6px';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.padding = '10px 14px';
    input.style.minHeight = '44px';
    input.style.borderRadius = 'var(--r-md, 16px)';
    input.style.border = '1.5px dashed var(--amber, #B47A3C)';
    input.style.background = 'var(--bg-elev, #FFFFFF)';
    input.style.color = 'var(--text, #2E2820)';
    input.style.fontSize = '14px';
    input.style.fontFamily = 'inherit';
    input.style.outline = 'none';

    // Insert input after select
    selectEl.parentNode.insertBefore(input, selectEl.nextSibling);
    selectEl._customInput = input;

    // Handle change event
    selectEl.addEventListener('change', () => {
      const currentRawVal = originalValueDesc.get.call(selectEl);
      if (currentRawVal === '__other__') {
        input.style.display = 'block';
        input.focus();
      } else {
        input.style.display = 'none';
        input.value = '';
      }
    });

    // Handle input event from custom field
    input.addEventListener('input', () => {
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // Define value property override
  Object.defineProperty(HTMLSelectElement.prototype, 'value', {
    get() {
      const val = originalValueDesc.get.call(this);
      if (val === '__other__' && this._customInput) {
        return this._customInput.value;
      }
      return val;
    },
    set(newVal) {
      ensureSelectEnhanced(this);
      if (this.dataset.enhanced) {
        let found = false;
        for (let i = 0; i < this.options.length; i++) {
          if (this.options[i].value === newVal && newVal !== '__other__') {
            originalValueDesc.set.call(this, newVal);
            found = true;
            break;
          }
        }
        if (!found && newVal) {
          originalValueDesc.set.call(this, '__other__');
          if (this._customInput) {
            this._customInput.value = newVal;
            this._customInput.style.display = 'block';
          }
        } else {
          originalValueDesc.set.call(this, newVal);
          if (this._customInput) {
            this._customInput.value = '';
            this._customInput.style.display = 'none';
          }
        }
      } else {
        originalValueDesc.set.call(this, newVal);
      }
    },
    configurable: true,
    enumerable: true
  });

  // Define selectedIndex property override
  Object.defineProperty(HTMLSelectElement.prototype, 'selectedIndex', {
    get() {
      return originalSelectedIndexDesc.get.call(this);
    },
    set(newIdx) {
      ensureSelectEnhanced(this);
      originalSelectedIndexDesc.set.call(this, newIdx);
      if (this.dataset.enhanced && this._customInput) {
        const val = originalValueDesc.get.call(this);
        if (val === '__other__') {
          this._customInput.style.display = 'block';
        } else {
          this._customInput.value = '';
          this._customInput.style.display = 'none';
        }
      }
    },
    configurable: true,
    enumerable: true
  });

  // Observe DOM changes to automatically enhance newly added selects
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'SELECT') {
              ensureSelectEnhanced(node);
            } else {
              node.querySelectorAll('select').forEach(ensureSelectEnhanced);
            }
          }
        });
      }
    }
  });

  // Start observing on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('select').forEach(ensureSelectEnhanced);
  });
})();

/* ════════════════════════════════════════════════════════════════════════
   DESKTOP MODE TOGGLE
   ────────────────────────────────────────────────────────────────────────
   Adds `desktop-mode` to <body> when the app is running in a real browser
   on a wide viewport. NEVER activates inside the Capacitor / native
   Android wrapper — that keeps the mobile app pixel-identical to today.
   Pure presentation toggle: no state, business logic, or Supabase touched.
   ──────────────────────────────────────────────────────────────────────── */
(() => {
  const BREAKPOINT = 900;
  const isNative = () => {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function')
        return window.Capacitor.isNativePlatform();
    } catch (_) {}
    const p = (location.protocol || '').toLowerCase();
    return p.startsWith('capacitor') || p.startsWith('ionic') || p.startsWith('file');
  };
  const apply = () => {
    const desktop = !isNative() && window.innerWidth >= BREAKPOINT;
    document.body.classList.toggle('desktop-mode', desktop);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  });
})();

const App = (() => {
  let currentHub = 'dashboard';
  let currentLedgerTab = 'labour';  // labour | vendor | inventory
  let currentPhase = 0;
  let currentCategory = null;
  let currentView = 'overview';     // legacy alias used by other modules
  let aiOpen = false;
  let wizardStep = 1;
  const wizardData = {};
  let _navStack = [];
  let _backSetup = false;
  let _isNavigatingBack = false;

  // ── Aura view-transition helpers (presentation only) ──────────
  const PREFERS_REDUCED = typeof window !== 'undefined'
    && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function runWithTransition(container, renderFn) {
    if (!container || PREFERS_REDUCED) { renderFn(); return; }
    container.classList.remove('view-fade-enter');
    container.classList.add('view-fade-exit');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      container.removeEventListener('animationend', finish);
      renderFn();
      container.classList.remove('view-fade-exit');
      void container.offsetWidth;
      container.classList.add('view-fade-enter');
      const clear = () => {
        container.classList.remove('view-fade-enter');
        container.removeEventListener('animationend', clear);
      };
      container.addEventListener('animationend', clear);
    };
    container.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 260);
  }

  // ── Boot ────────────────────────────────────────────────
  function init() {
    try {
      const projects = State.getProjects();
      const proj = State.getCurrentProject();
      if (proj) showMainApp(proj);
      else if (projects.length) showWelcomeWithProjects(projects);
      else showWelcome();
    } catch (err) {
      console.error('[App] init failed:', err);
      try { showWelcome(); } catch {}
    }
  }

  function showWelcome() {
    document.getElementById('welcome-screen')?.classList.remove('hidden');
    document.getElementById('main-app')?.classList.add('hidden');
    document.getElementById('project-wizard')?.classList.add('hidden');
    const list = document.getElementById('existing-projects-list');
    if (list) list.innerHTML = '';

    const signinArea = document.getElementById('signin-area');
    if (signinArea) {
      if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAuthenticated()) {
        const email = SupabaseClient.getUser()?.email || '';
        signinArea.innerHTML = `<span style="color:var(--text-muted)">Signed in as <strong style="color:var(--text)">${escapeHtml(email)}</strong></span>`;
      } else {
        signinArea.innerHTML = `<a href="/auth.html">Sign in to sync across devices →</a>`;
      }
    }
  }

  function showWelcomeWithProjects(projects) {
    showWelcome();
    const list = document.getElementById('existing-projects-list');
    if (!list) return;
    const rows = projects.map(p => {
      try {
        const total = Financial.computeProjectTotal(p) || 0;
        const pct = p.totalBudget > 0 ? Math.round((total / p.totalBudget) * 100) : 0;
        const escName = escapeHtml(p.name || '');
        const escAddress = escapeHtml(p.address || 'No address');
        const escClient = p.client ? ' · ' + escapeHtml(p.client) : '';
        const attrName = escapeAttr(p.name || '');
        const isLocal = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
        const syncBtnHtml = isLocal ? `<button class="existing-project-sync-btn" title="Sync to Cloud" onclick="App.syncProjectToCloud('${escapeAttr(p.id)}', event)">${Icons.render('cloudUpload', 14)}</button>` : '';
        return `<div class="existing-project-row">
          <button class="existing-project-btn" onclick="App.openProject('${escapeAttr(p.id)}')">
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;font-size:15px;color:var(--text)">${escName}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:3px">${escAddress}${escClient}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-family:var(--font-mono);color:var(--amber);font-weight:700;font-size:14px">${Financial.fmtFull(total)}</div>
              ${p.totalBudget > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${pct}% of budget</div>` : ''}
            </div>
          </button>
          ${syncBtnHtml}
          <button class="existing-project-delete-btn" title="Delete" onclick="App.confirmDeleteProjectById('${escapeAttr(p.id)}', '${attrName}', event)">${Icons.render('trash', 14)}</button>
        </div>`;
      } catch { return ''; }
    }).filter(Boolean).join('');
    list.innerHTML = `<div class="existing-projects-divider">or open existing project</div>${rows}`;
  }

  function openProject(id) {
    State.setCurrentProject(id);
    const proj = State.getCurrentProject();
    if (proj) showMainApp(proj);
  }

  function showProjectPicker() {
    State.setCurrentProject(null);
    const projects = State.getProjects();
    document.getElementById('main-app')?.classList.add('hidden');
    if (projects.length) showWelcomeWithProjects(projects);
    else showWelcome();
  }

  // ── Wizard ──────────────────────────────────────────────
  function startNewProject() {
    wizardStep = 1;
    document.getElementById('welcome-screen')?.classList.add('hidden');
    document.getElementById('project-wizard')?.classList.remove('hidden');
    renderWizardStep();
  }

  function renderWizardStep() {
    const body = document.getElementById('wizard-body');
    const back = document.getElementById('wizard-back');
    const next = document.getElementById('wizard-next');
    document.querySelectorAll('.m-wizard-stepdots .dot').forEach((d,i) => d.classList.toggle('active', i + 1 <= wizardStep));
    if (back) back.style.display = wizardStep > 1 ? 'inline-flex' : 'none';
    const skip = document.getElementById('wizard-skip');
    if (skip) skip.style.display = wizardStep === 1 ? 'none' : 'inline-flex';
    if (next) next.textContent = wizardStep === 3 ? 'Create  ✓' : 'Next  →';

    if (wizardStep === 1) {
      body.innerHTML = `<div class="wizard-card">
        <div class="field-group">
          <label class="field-label">Project Name *</label>
          <input class="field-input" id="w-name" placeholder="e.g. Sharma Residence" value="${escapeAttr(wizardData.name||'')}">
        </div>
        <div class="field-group">
          <label class="field-label">Client Name</label>
          <input class="field-input" id="w-client" placeholder="Mr. Sharma" value="${escapeAttr(wizardData.client||'')}">
        </div>
        <div class="field-group">
          <label class="field-label">Project Address</label>
          <input class="field-input" id="w-address" placeholder="Plot 14, Baner, Pune" value="${escapeAttr(wizardData.address||'')}">
        </div>
        <div class="field-group">
          <label class="field-label">Project Type</label>
          <select class="field-select" id="w-type">
            <option value="residential" ${wizardData.type==='residential'?'selected':''}>Residential — New Construction</option>
            <option value="commercial" ${wizardData.type==='commercial'?'selected':''}>Commercial Build</option>
            <option value="renovation" ${wizardData.type==='renovation'?'selected':''}>Renovation / Remodel</option>
            <option value="addition" ${wizardData.type==='addition'?'selected':''}>Addition</option>
          </select>
        </div>
      </div>`;
    } else if (wizardStep === 2) {
      body.innerHTML = `<div class="wizard-card">
        <div class="field-group">
          <label class="field-label">Total Project Budget</label>
          <div class="currency-input-wrap">
            <span class="currency-symbol">₹</span>
            <input class="field-input mono" type="number" id="w-budget" placeholder="0" value="${escapeAttr(wizardData.totalBudget||'')}" min="0" inputmode="numeric">
          </div>
        </div>
        <div class="field-row cols-2">
          <div class="field-group">
            <label class="field-label">Currency</label>
            <select class="field-select" id="w-currency">
              <option value="INR" ${wizardData.currency==='INR'?'selected':''}>₹ INR</option>
              <option value="USD" ${wizardData.currency==='USD'?'selected':''}>$ USD</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Contingency %</label>
            <input class="field-input mono" type="number" id="w-contingency" placeholder="10" value="${escapeAttr(wizardData.contingency||10)}" min="0" max="30" inputmode="numeric">
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Primary Contractor</label>
          <input class="field-input" id="w-contractor" placeholder="Your company" value="${escapeAttr(wizardData.contractor||'')}">
        </div>
      </div>`;
    } else {
      body.innerHTML = `<div class="wizard-card">
        <div class="field-row cols-2">
          <div class="field-group">
            <label class="field-label">Start Date</label>
            <input class="field-input" type="date" id="w-start" value="${escapeAttr(wizardData.startDate||'')}">
          </div>
          <div class="field-group">
            <label class="field-label">Target Completion</label>
            <input class="field-input" type="date" id="w-end" value="${escapeAttr(wizardData.endDate||'')}">
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Scope Summary</label>
          <textarea class="field-textarea" id="w-notes" rows="3" placeholder="Brief description of scope…">${escapeHtml(wizardData.notes||'')}</textarea>
        </div>
      </div>
      <div class="wizard-summary">
        <div class="m-hero-card">
          <div class="m-hero-eyebrow">Summary</div>
          <div style="font-weight:700;font-size:17px;margin-top:6px">${escapeHtml(wizardData.name || '—')}</div>
          <div style="color:var(--text-muted);font-size:13px;margin-top:4px">${escapeHtml(wizardData.address || '')}${wizardData.client ? ' · ' + escapeHtml(wizardData.client) : ''}</div>
          <div class="m-hero-amount" style="font-size:24px;margin-top:14px">${Financial.fmtFull(wizardData.totalBudget || 0)}</div>
          <div class="m-hero-sub">Total Budget</div>
        </div>
      </div>`;
    }
  }

  function saveWizardStepData() {
    if (wizardStep === 1) {
      const name = document.getElementById('w-name')?.value?.trim();
      if (!name) return false;
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
    }
    return true;
  }

  let _wizardCreating = false;
  async function wizardNext() {
    if (wizardStep === 3) {
      saveWizardStepData();
      if (_wizardCreating) return;
      _wizardCreating = true;
      const btn = document.getElementById('wizard-next');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
      try {
        const proj = await State.createProject(wizardData);
        if (!proj) { toast('Could not create — try again', 'error'); return; }
        document.getElementById('project-wizard')?.classList.add('hidden');
        showMainApp(proj);
      } catch (e) { console.error(e); toast('Could not create — try again', 'error'); }
      finally { _wizardCreating = false; if (btn) { btn.disabled = false; btn.textContent = 'Create  ✓'; } }
      return;
    }
    if (wizardStep === 1 && !document.getElementById('w-name')?.value?.trim()) {
      return toast('Enter a project name', 'warning');
    }
    if (!saveWizardStepData()) return;
    wizardStep++;
    renderWizardStep();
  }

  function wizardSkip() {
    if (wizardStep === 2) {
      wizardStep++;
      renderWizardStep();
    } else if (wizardStep === 3) {
      saveWizardStepData();
      if (_wizardCreating) return;
      _wizardCreating = true;
      const btn = document.getElementById('wizard-next');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

      State.createProject(wizardData).then(proj => {
        if (!proj) { toast('Could not create — try again', 'error'); return; }
        document.getElementById('project-wizard')?.classList.add('hidden');
        showMainApp(proj);
      }).catch(e => {
        console.error(e);
        toast('Could not create — try again', 'error');
      }).finally(() => {
        _wizardCreating = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Create  ✓'; }
      });
    }
  }

  function wizardBack() {
    if (wizardStep > 1) {
      saveWizardStepData();
      wizardStep--;
      renderWizardStep();
    }
    else { document.getElementById('project-wizard')?.classList.add('hidden'); showWelcome(); }
  }

  // ── Main app ────────────────────────────────────────────
  function showMainApp(proj) {
    if (!proj) return showWelcome();
    State.setCurrentProject(proj.id);
    document.getElementById('welcome-screen')?.classList.add('hidden');
    document.getElementById('project-wizard')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    const nameEl = document.getElementById('current-project-name');
    if (nameEl) {
      const isLocal = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proj.id);
      if (isLocal) {
        nameEl.innerHTML = `${escapeHtml(proj.name)} <button class="m-appbar-sync-btn" onclick="App.syncProjectToCloud('${escapeAttr(proj.id)}')" title="Sync Project to Cloud" style="background:transparent; border:none; color:var(--amber); cursor:pointer; padding:0 4px; display:inline-flex; align-items:center; vertical-align:middle;">${Icons.render('cloudUpload', 16)}</button>`;
      } else {
        nameEl.textContent = proj.name;
      }
    }
    if (proj.currency) Financial.currency = proj.currency;
    showHub('dashboard');
    Financial.updateAllTotals?.();
    updateSyncStatus();
    setTimeout(() => {
      try {
        const total = Financial.computeProjectTotal(State.getCurrentProject());
        AI.addMessage('info', '', 'Welcome', `Project "${proj.name}" loaded. ${Financial.fmtFull(total)} tracked so far.`, []);
      } catch {}
    }, 600);
  }

  function syncSidebarActiveState(hubName, viewName, ledgerTab) {
    document.querySelectorAll('.m-desktop-sidebar .ds-nav-item').forEach(t => {
      let active = false;
      const tab = t.dataset.tab;
      if (tab === hubName) {
        if (hubName === 'ledgers') {
          active = false;
        } else if (hubName === 'more') {
          active = (viewName !== 'ra-bills' && viewName !== 'subcontractors' && viewName !== 'flat-sales' && viewName !== 'flat-sales-buyer');
        } else {
          active = true;
        }
      } else if (tab === `ledgers-${ledgerTab}` && hubName === 'ledgers') {
        active = true;
      } else if (tab === 'rabills' && viewName === 'ra-bills') {
        active = true;
      } else if (tab === 'subcontractors' && viewName === 'subcontractors') {
        active = true;
      } else if (tab === 'flatsales' && (viewName === 'flat-sales' || viewName === 'flat-sales-buyer')) {
        active = true;
      }
      t.classList.toggle('active', active);
    });
  }

  // ── Hub router ──────────────────────────────────────────
  function showHub(name) {
    if (!_isNavigatingBack && name !== currentHub) {
      _pushNav({ type: 'hub', name: currentHub, ledgerTab: currentLedgerTab });
    }
    currentHub = name;
    // bottom-nav active state
    document.querySelectorAll('.m-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    const fab = document.getElementById('fab-container');
    if (fab) fab.innerHTML = '';
    const content = document.getElementById('content-area');
    if (!content) return;
    content.scrollTop = 0;

    runWithTransition(content, () => {
      if (name === 'dashboard')    return renderDashboardHub(content);
      if (name === 'construction') return renderConstructionHub(content);
      if (name === 'interior')     return renderInteriorTab(content);
      if (name === 'ledgers')      return renderLedgersHub(content);
      if (name === 'more')         return renderMoreHub(content);
    });
    syncSidebarActiveState(name, currentView, currentLedgerTab);
  }

  // ── DASHBOARD HUB ──────────────────────────────────────
  function renderDashboardHub(content) {
    currentView = 'overview';
    currentPhase = 0;
    content.innerHTML = Dashboard.render();
    AI.setWatching?.('Project Dashboard');
    mountFAB([
      { icon: Icons.render('userCircle', 18), label: 'Log Labour Attendance', action: () => { showHub('ledgers'); setLedgerTab('labour'); } },
      { icon: Icons.render('plus', 18), label: 'Add Expense (Vendor)', action: () => { showHub('ledgers'); setLedgerTab('vendor'); } },
      { icon: Icons.render('blocks', 18), label: 'Stock In / Out', action: () => { showHub('ledgers'); setLedgerTab('inventory'); } },
    ]);
  }

  // ── CONSTRUCTION HUB (phases 1-9) ──────────────────────
  function renderConstructionHub(content) {
    const proj = State.getCurrentProject();
    if (!proj) { content.innerHTML = emptyState('No project open', 'Open or create a project from Dashboard.'); return; }
    const phases = Array.isArray(proj.phases) ? proj.phases : [];
    const construction = phases.filter(p => p.id >= 1 && p.id <= 9);
    const totalProject = Financial.computeProjectTotal(proj);

    const phaseCard = (ph) => {
      const cost = Financial.computePhaseTotal(ph);
      const comp = ph.completion || 0;
      return `<button class="m-phase-card" onclick="App.showPhaseHub(${ph.id})">
        <span class="m-phase-card-icon">${Icons.render(ph.icon, 22)}</span>
        <div class="m-phase-card-body">
          <div class="m-phase-card-name">${ph.name}</div>
          <div class="m-phase-card-meta">
            <span>${comp}% complete</span>
            <span>·</span>
            <span class="m-phase-card-cost">${Financial.fmt(cost)}</span>
          </div>
          <div class="m-phase-card-progress"><i style="width:${comp}%"></i></div>
        </div>
        <span class="m-phase-card-chev">›</span>
      </button>`;
    };

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="m-hero-card">
          <div class="m-hero-eyebrow">Construction Trades</div>
          <div class="m-hero-amount">${Financial.fmtFull(totalProject)}</div>
          <div class="m-hero-sub">${construction.length} phases · all trades</div>
        </div>
        <div class="m-section-title">All Trades <span class="count">${construction.length}</span></div>
        <div class="m-phase-grid">
          ${construction.map(phaseCard).join('')}
          <button class="m-phase-card" onclick="App.showConstructionBills()" style="border:1.5px solid var(--amber-glow); background:var(--charcoal-mid)">
            <span class="m-phase-card-icon" style="color:var(--amber)">${Icons.render('fileText', 22)}</span>
            <div class="m-phase-card-body">
              <div class="m-phase-card-name" style="color:var(--amber)">All Bills (Construction)</div>
              <div class="m-phase-card-meta">
                <span>View and scan all construction receipts</span>
              </div>
            </div>
            <span class="m-phase-card-chev" style="color:var(--amber)">›</span>
          </button>
        </div>
      </div>`;
    AI.setWatching?.('Construction Trades');
  }

  // ── INTERIOR TAB (phase 10 directly) ──────────────────
  function renderInteriorTab(content) {
    const proj = State.getCurrentProject();
    if (!proj) { content.innerHTML = emptyState('No project open', 'Open or create a project from Dashboard.'); return; }
    const phase = proj.phases.find(p => p.id === 10);
    if (!phase) {
      content.innerHTML = `<div class="phase-workspace active"><div class="m-empty"><div class="m-empty-icon">${Icons.render('sofa', 40)}</div><div class="m-empty-title">No Interior Phase</div><div class="m-empty-desc">Add an interior finish phase to your project to get started.</div></div></div>`;
      return;
    }
    content.innerHTML = `<div class="phase-workspace active">${Phases.renderPhaseHub(phase)}</div>`;
    content.scrollTop = 0;
    currentView = 'interior-hub';
    currentPhase = 10;
    Financial.updateAllTotals?.();
    AI.setWatching?.('Interior Finish · Hub');
  }

  // Drill into a phase — delegate to existing Phases module
  function showPhaseHub(phaseId) {
    phaseId = Number(phaseId);
    const isInterior = phaseId === 10;
    if (!_isNavigatingBack) {
      _pushNav({ type: 'hub', name: currentHub, ledgerTab: currentLedgerTab });
    }
    currentHub = isInterior ? 'interior' : 'construction';
    currentPhase = phaseId;
    currentCategory = null;
    currentView = isInterior ? 'interior-hub' : 'phase-hub';
    document.querySelectorAll('.m-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === currentHub));
    const proj = State.getCurrentProject(); if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId)); if (!phase) return;
    const content = document.getElementById('content-area'); if (!content) return;
    document.getElementById('fab-container').innerHTML = '';
    const backHub = isInterior ? 'interior' : 'construction';
    const backLabel = isInterior ? 'Interior' : 'All Trades';
    content.innerHTML = `
      <button class="back-to-hub" onclick="App.showHub('${backHub}')">← ${backLabel}</button>
      ${Phases.renderPhaseHub(phase)}`;
    content.scrollTop = 0;
    Financial.updateAllTotals?.();
    AI.setWatching?.(`Phase ${phaseId} · ${phase.name} · Hub`);
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showInteriorHub() { showHub('interior'); }

  function showPhaseCategory(phaseId, categoryId) {
    phaseId = Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = phaseId === 10 ? 'interior' : 'construction'; currentPhase = phaseId; currentCategory = categoryId;
    currentView = phaseId === 10 ? 'interior-category' : 'phase-category';
    const proj = State.getCurrentProject(); if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId)); if (!phase) return;
    const category = (Phases.CATEGORY_REGISTRY[phaseId] || []).find(c => c.id === categoryId);
    if (!category) return showPhaseHub(phaseId);
    const content = document.getElementById('content-area'); if (!content) return;

    let html = '';
    switch (phaseId) {
      case 1: html = Phases.renderTradePhase1(phase); break;
      case 2: html = Phases.renderTradePhase2(phase); break;
      case 3: html = Phases.renderTradePhase3(phase); break;
      case 4: html = Phases.renderTradePhase4(phase); break;
      case 5: html = Phases.renderTradePhase5(phase); break;
      case 6: html = Phases.renderTradePhase6(phase); break;
      case 7: html = Phases.renderTradePhase7(phase); break;
      case 8: html = Phases.renderTradePhase8(phase); break;
      case 9: html = Phases.renderTradePhase9(phase); break;
      case 10: html = Phases.renderTradePhase10(phase); break;
    }
    const header = Phases.phaseHeader(phase);
    const body = (category.sectionIds && category.sectionIds.length)
      ? Phases.filterPhaseHtmlBySections(html, category.sectionIds)
      : Phases.renderCategoryMetaCard(category);

    const backHub = phaseId === 10 ? 'interior' : 'construction';
    const backLabel = phaseId === 10 ? 'Interior' : phase.name;
    content.innerHTML = `
      <div class="phase-workspace active" id="pw-${phaseId}">
        <button class="back-to-hub" onclick="App.showHub('${backHub}')">← Back to ${backLabel}</button>
        ${body}
        ${header}
      </div>`;
    restorePhaseInputs(phase);
    attachAllListeners(phase);
    Financial.updateAllTotals?.();
    AI.setWatching?.(`Phase ${phaseId} · ${category.name}`);
    AI.checkTriggers?.();
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showInputCard(phaseId, cardId) {
    phaseId = Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'category', phaseId: currentPhase, categoryId: currentCategory });
    }
    currentHub = phaseId === 10 ? 'interior' : 'construction'; currentPhase = phaseId; currentCategory = cardId;
    currentView = phaseId === 10 ? 'interior-category' : 'phase-category';
    const proj = State.getCurrentProject(); if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId)); if (!phase) return;
    const card = Phases.getInputCard ? Phases.getInputCard(phaseId, cardId) : null;
    if (!card) return showPhaseHub(phaseId);
    const content = document.getElementById('content-area'); if (!content) return;
    const backHub = phaseId === 10 ? 'interior' : 'construction';
    const backLabel = phaseId === 10 ? 'Interior' : phase.name;
    content.innerHTML = `
      <div class="phase-workspace active" id="pw-${phaseId}">
        <button class="back-to-hub" onclick="App.showHub('${backHub}')">← Back to ${backLabel}</button>
        ${Phases.renderSingleInputCard(phase, card)}
      </div>`;
    content.scrollTop = 0;
    AI.setWatching?.(`Phase ${phaseId} · ${card.name}`);
    Financial.updateAllTotals?.();
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showMaterialCards(phaseId) {
    phaseId = Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = phaseId === 10 ? 'interior' : 'construction'; currentPhase = phaseId; currentCategory = 'material';
    currentView = 'material-cards';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (Phases?.renderCardListView) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${Phases.renderCardListView(phaseId, false)}</div>`;
    } else {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        <div class="m-empty"><div class="m-empty-title">Module not loaded</div><div class="m-empty-desc">Try refreshing the page.</div></div></div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showLaborCards(phaseId) {
    phaseId = Number(phaseId);

    // If there is only one labor category for this phase, skip the list view and go directly to the entry form.
    if (typeof Phases !== 'undefined' && typeof Phases.getLaborCardsForPhase === 'function') {
      const laborCards = Phases.getLaborCardsForPhase(phaseId);
      if (laborCards && laborCards.length === 1) {
        if (!_isNavigatingBack) {
          _pushNav({ type: 'phase-hub', phaseId: currentPhase });
        }
        const savedIsNavBack = _isNavigatingBack;
        _isNavigatingBack = true;
        showEntryForm(phaseId, laborCards[0].id);
        _isNavigatingBack = savedIsNavBack;
        return;
      }
    }

    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = phaseId === 10 ? 'interior' : 'construction'; currentPhase = phaseId; currentCategory = 'labor';
    currentView = 'labor-cards';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (Phases?.renderCardListView) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${Phases.renderCardListView(phaseId, true)}</div>`;
    } else {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        <div class="m-empty"><div class="m-empty-title">Module not loaded</div><div class="m-empty-desc">Try refreshing the page.</div></div></div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showEntryForm(phaseId, cardId) {
    phaseId = Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'category', phaseId: currentPhase, categoryId: currentCategory });
    }
    currentHub = phaseId === 10 ? 'interior' : 'construction'; currentPhase = phaseId; currentCategory = cardId;
    currentView = 'entry-form';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (Phases?.renderEntryForm) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${Phases.renderEntryForm(phaseId, cardId)}</div>`;
    } else {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        <div class="m-empty"><div class="m-empty-title">Module not loaded</div><div class="m-empty-desc">Try refreshing the page.</div></div></div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showPhaseBills(phaseId) {
    phaseId = (phaseId === 'construction') ? phaseId : Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = 'construction'; currentPhase = phaseId; currentCategory = 'bills';
    currentView = 'phase-bills';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (typeof BillScanner !== 'undefined' && BillScanner.renderBillsHub) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${BillScanner.renderBillsHub(phaseId)}</div>`;
    } else {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        <div class="m-empty"><div class="m-empty-title">Bills module not loaded</div><div class="m-empty-desc">Try refreshing the page.</div></div></div>`;
    }
    content.scrollTop = 0;
    AI.setWatching?.(`Phase ${phaseId} · Bills`);
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showConstructionBills() {
    if (!_isNavigatingBack) {
      _pushNav({ type: 'hub', name: 'construction' });
    }
    currentHub = 'construction'; currentPhase = 'construction'; currentCategory = 'bills';
    currentView = 'construction-bills';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showHub('construction')`;
    if (typeof BillScanner !== 'undefined' && BillScanner.renderBillsHub) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${BillScanner.renderBillsHub('construction')}</div>`;
    } else {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        <div class="m-empty"><div class="m-empty-title">Bills module not loaded</div><div class="m-empty-desc">Try refreshing the page.</div></div></div>`;
    }
    content.scrollTop = 0;
    AI.setWatching?.(`Construction · Bills`);
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  // ── LEDGERS HUB ────────────────────────────────────────
  function renderLedgersHub(content) {
    const proj = State.getCurrentProject();
    if (!proj) { content.innerHTML = emptyState('No project open', 'Open a project first.'); return; }
    const tabs = ['labour','vendor','inventory'];
    const labels = { labour: 'Worker Attendance', vendor: 'Vendor · Khata', inventory: 'Site Stock' };
    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="phase-header">
          <div class="phase-title">${Icons.render('listChecks', 22)} Site Ledgers</div>
          <div class="phase-subtitle">Daily attendance, vendor credits, and on-site stock</div>
        </div>
        <div class="m-tabbar" role="tablist">
          ${tabs.map(t => `<button class="${currentLedgerTab===t?'active':''}" onclick="App.setLedgerTab('${t}')">${labels[t]}</button>`).join('')}
        </div>
        <div id="ledger-tab-content"></div>
      </div>`;
    renderLedgerTabContent();
    AI.setWatching?.('Site Ledgers');
  }

  function setLedgerTab(tab) {
    currentLedgerTab = tab;
    document.querySelectorAll('.m-tabbar button').forEach(b => b.classList.remove('active'));
    const btns = document.querySelectorAll('.m-tabbar button');
    const order = ['labour','vendor','inventory'];
    const idx = order.indexOf(tab);
    if (idx >= 0 && btns[idx]) btns[idx].classList.add('active');
    renderLedgerTabContent();
    syncSidebarActiveState(currentHub, currentView, tab);
  }

  function renderLedgerTabContent() {
    const host = document.getElementById('ledger-tab-content');
    if (!host) return;
    try {
      if (currentLedgerTab === 'labour' && typeof LabourVendors !== 'undefined' && LabourVendors.renderLabourHub) {
        host.innerHTML = LabourVendors.renderLabourHub();
        currentView = 'labour-hub';
        AI.setWatching?.('Labour Ledger');
      } else if (currentLedgerTab === 'vendor' && typeof VendorKhata !== 'undefined' && VendorKhata.renderVendorHub) {
        host.innerHTML = VendorKhata.renderVendorHub();
        currentView = 'vendor-hub';
        AI.setWatching?.('Vendor Khata');
      } else if (currentLedgerTab === 'inventory' && typeof SiteInventory !== 'undefined' && SiteInventory.renderInventoryHub) {
        host.innerHTML = SiteInventory.renderInventoryHub();
        currentView = 'inventory-hub';
        AI.setWatching?.('Site Inventory');
      } else {
        host.innerHTML = emptyState('Loading…', 'Module is still loading. Try again.');
      }
    } catch (e) {
      console.warn('[Ledgers] render error:', e);
      host.innerHTML = emptyState('Could not load', e.message || 'Unknown error');
    }
  }

  // Legacy hooks (other modules call these)
  function showLabourHub() { showHub('ledgers'); setLedgerTab('labour'); }
  function showVendorHub() { showHub('ledgers'); setLedgerTab('vendor'); }
  function showInventoryHub() { showHub('ledgers'); setLedgerTab('inventory'); }

  // ── MORE HUB ───────────────────────────────────────────
  function renderMoreHub(content) {
    const proj = State.getCurrentProject();
    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="phase-header">
          <div class="phase-title">${Icons.render('settings', 22)} More</div>
          <div class="phase-subtitle">Operations, exports, and account</div>
        </div>

        <div class="m-section-title">Operations</div>
        <div class="m-list-group">
          <button class="m-list-row" onclick="App.showRaBillsHub()">
            <span class="icon">${Icons.render('fileText', 18)}</span>
            <div class="body"><div class="label">Subcontractor RA Bills</div><div class="desc">Running account invoices</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.showSubLedger()">
            <span class="icon">${Icons.render('users', 18)}</span>
            <div class="body"><div class="label">Subcontractor Ledger</div><div class="desc">Trades · contracts · payments</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.showFlatSales()">
            <span class="icon">${Icons.render('building', 18)}</span>
            <div class="body"><div class="label">Flat Sales</div><div class="desc">Buyers and payments received</div></div>
            <span class="chev">›</span>
          </button>
        </div>

        <div class="m-section-title">Data Export</div>
        <div class="m-list-group">
          <button class="m-list-row" onclick="App.exportPDF()">
            <span class="icon">${Icons.render('file', 18)}</span>
            <div class="body"><div class="label">Export PDF Report</div><div class="desc">Single-page printable summary</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.exportExcel()">
            <span class="icon">${Icons.render('spreadsheet', 18)}</span>
            <div class="body"><div class="label">Export CSV / Excel</div><div class="desc">All line items, machine-readable</div></div>
            <span class="chev">›</span>
          </button>
        </div>

        <div class="m-section-title">AI Tools</div>
        <div class="m-list-group">
          <button class="m-list-row" onclick="App.toggleAI()">
            <span class="icon">${Icons.render('bot', 18)}</span>
            <div class="body"><div class="label">Open Build Assistant</div><div class="desc">AI co-pilot drawer</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="AI.sendUserMessage('Give me a full project health analysis with risks and recommendations.')">
            <span class="icon">${Icons.render('activity', 18)}</span>
            <div class="body"><div class="label">AI Project Health</div><div class="desc">Risk · variance · recommendations</div></div>
            <span class="chev">›</span>
          </button>
        </div>

        <div class="m-section-title">Help</div>
        <div class="m-list-group">
          <button class="m-list-row" onclick="App.showTutorial()">
            <span class="icon">${Icons.render('help', 18)}</span>
            <div class="body"><div class="label">App Tutorial</div><div class="desc">Replay the onboarding walkthrough</div></div>
            <span class="chev">›</span>
          </button>
        </div>

        <div class="m-section-title">Project</div>
        <div class="m-list-group">
          <button class="m-list-row" onclick="App.showEditProjectModal()">
            <span class="icon">${Icons.render('pencil', 18)}</span>
            <div class="body"><div class="label">Edit Project Info</div><div class="desc">Name, budget, dates, contractor…</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.showProjectPicker()">
            <span class="icon">${Icons.render('building', 18)}</span>
            <div class="body"><div class="label">Switch Project</div><div class="desc">${proj ? proj.name : '—'}</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.confirmDeleteProject()">
            <span class="icon" style="color:var(--danger)">${Icons.render('trash', 18)}</span>
            <div class="body"><div class="label" style="color:var(--danger)">Delete this project</div><div class="desc">Permanent — cannot be undone</div></div>
            <span class="chev">›</span>
          </button>
        </div>

        <div class="m-section-title">Account</div>
        <div class="m-list-group">
          <button class="m-list-row" onclick="App.signOut()">
            <span class="icon">${Icons.render('logout', 18)}</span>
            <div class="body"><div class="label">Sign out</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.confirmDeleteAccount()">
            <span class="icon" style="color:var(--danger)">${Icons.render('alert', 18)}</span>
            <div class="body"><div class="label" style="color:var(--danger)">Delete account</div><div class="desc">Removes all data permanently</div></div>
            <span class="chev">›</span>
          </button>
        </div>
      </div>`;
    AI.setWatching?.('More');
  }

  // ── Sub-pages reachable from More ──────────────────────
  function showRaBillsHub() {
    if (!_isNavigatingBack) _pushNav({ type: 'more-back' });
    currentHub = 'more'; currentView = 'ra-bills';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof RaBills !== 'undefined' && RaBills.renderRaBillsHub) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showHub('more')">← More</button>
        ${RaBills.renderRaBillsHub()}</div>`;
    }
    content.scrollTop = 0; AI.setWatching?.('RA Bills');
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showFlatSales() {
    if (!_isNavigatingBack) _pushNav({ type: 'more-back' });
    currentHub = 'more'; currentView = 'flat-sales';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof FlatSales !== 'undefined' && FlatSales.renderHub) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showHub('more')">← More</button>
        ${FlatSales.renderHub()}</div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showFlatSalesBuyer(buyerId) {
    if (!_isNavigatingBack) _pushNav({ type: 'flat-sales' });
    currentHub = 'more'; currentView = 'flat-sales-buyer';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof FlatSales !== 'undefined' && FlatSales.renderBuyerDetail) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showFlatSales()">← Buyers</button>
        ${FlatSales.renderBuyerDetail(buyerId)}</div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showSubLedger() {
    if (!_isNavigatingBack) _pushNav({ type: 'more-back' });
    currentHub = 'more'; currentView = 'subcontractors'; currentPhase = 0;
    const content = document.getElementById('content-area'); if (!content) return;
    content.innerHTML = `<div class="phase-workspace active">
      <button class="back-to-hub" onclick="App.showHub('more')">← More</button>
      <div class="phase-header">
        <div class="phase-title">${Icons.render('users', 22)} Subcontractor Ledger</div>
        <div class="phase-subtitle">Trades · contracts · payments</div>
      </div>
      ${Phases.renderSubcontractorLedger()}
    </div>`;
    content.scrollTop = 0; AI.setWatching?.('Subcontractors');
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showTools() { showHub('more'); }

  // Legacy alias
  function showOverview() { showHub('dashboard'); }
  function showPhase(id) { showPhaseHub(id); }
  function showDashboard() { showProjectPicker(); }

  // ── FAB ────────────────────────────────────────────────
  let _fabOpen = false;
  function mountFAB(actions) {
    const host = document.getElementById('fab-container'); if (!host) return;
    _fabOpen = false;
    host.innerHTML = `
      <div class="m-fab-menu hidden" id="fab-menu">
        ${actions.map((a, i) => `<button class="m-fab-action" onclick="App._fabAction(${i})">${a.icon}<span>${a.label}</span></button>`).join('')}
      </div>
      <button class="m-fab" onclick="App._toggleFab()" aria-label="Quick action">＋</button>`;
    window.__fabActions = actions;
  }
  function _toggleFab() {
    _fabOpen = !_fabOpen;
    const menu = document.getElementById('fab-menu'); if (!menu) return;
    menu.classList.toggle('hidden', !_fabOpen);
    const btn = document.querySelector('.m-fab');
    if (btn) btn.style.transform = _fabOpen ? 'rotate(45deg)' : '';
  }
  function _fabAction(i) {
    const a = (window.__fabActions || [])[i];
    _toggleFab();
    if (a && typeof a.action === 'function') a.action();
  }

  // ── AI Drawer ──────────────────────────────────────────
  function toggleAI() {
    aiOpen ? closeAI() : openAI();
  }
  function openAI() {
    aiOpen = true;
    document.getElementById('ai-drawer')?.classList.add('open');
    document.getElementById('ai-scrim')?.classList.add('open');
    AI.clearPulse?.();
  }
  function closeAI() {
    aiOpen = false;
    document.getElementById('ai-drawer')?.classList.remove('open');
    document.getElementById('ai-scrim')?.classList.remove('open');
  }
  function minimizeAI() { closeAI(); }

  function sendAIMessage() {
    const inp = document.getElementById('ai-input');
    if (!inp || !inp.value.trim()) return;
    const msg = inp.value.trim(); inp.value = '';
    AI.sendUserMessage?.(msg);
  }

  // ── Data restoration / listeners (kept identical to legacy) ──
  function restorePhaseInputs(phase) {
    const d = phase.data || {};
    function restore(section) {
      if (!section || typeof section !== 'object') return;
      Object.entries(section).forEach(([k, v]) => {
        if (Array.isArray(v)) return;
        const el = document.getElementById(k);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v || '';
      });
    }
    Object.values(d).forEach(s => { if (s && typeof s === 'object' && !Array.isArray(s)) restore(s); });
    if (phase.id === 5) {
      const dw = d.drywall || {};
      const sqft = dw.drywall_sqft || dw.total_sqft;
      const sheetsEl = document.getElementById('sheets-calc');
      if (sheetsEl && sqft) sheetsEl.textContent = Math.ceil((parseFloat(sqft) / 32) * 1.1) + ' sheets';
    }
    if (d.temp_infra) Object.entries(d.temp_infra).forEach(([k, v]) => {
      if (k.endsWith('_active') && v) {
        const id = k.replace('_active', '');
        document.getElementById(`tc-${id}`)?.classList.add('active');
        document.getElementById(`ts-${id}`)?.classList.add('on');
      }
    });
  }

  function attachAllListeners(phase) {
    const ws = document.getElementById(`pw-${phase.id}`); if (!ws) return;
    ws.querySelectorAll('input:not([type=checkbox]):not([type=date]):not([readonly]), select').forEach(el => {
      el.addEventListener('input', () => {
        saveInputToState(phase.id, el);
        // Derive sheets from sqft and haul loads from cut_vol — cheap, no full update
        if (el.id === 'drywall_sqft' || el.id === 'total_sqft') {
          const sheets = Math.ceil((parseFloat(el.value || 0) / 32) * 1.1);
          const s = document.getElementById('sheets-calc'); if (s) s.textContent = sheets + ' sheets';
        }
        if (el.id === 'cut_vol') {
          const loadEl = document.getElementById('haul_loads');
          if (loadEl && !loadEl.value) loadEl.value = Math.ceil(parseFloat(el.value || 0) / 10);
        }
      });
      el.addEventListener('change', () => {
        saveInputToState(phase.id, el);
        Financial.scheduleUpdate?.();
        AI.checkTriggers?.();
        el.classList.add('saved');
        setTimeout(() => el.classList.remove('saved'), 800);
      });
    });
    ws.querySelectorAll('input[type=checkbox], input[type=date]').forEach(el => {
      el.addEventListener('change', () => saveInputToState(phase.id, el));
    });
  }

  function saveInputToState(phaseId, el) {
    if (!el.id) return;
    const proj = State.getCurrentProject(); if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId)); if (!phase) return;
    const sectionCard = el.closest('.section-card');
    const sectionId = (sectionCard?.id || 'general').replace('sc-', '');
    const map = {
      'p1-survey':'survey','p1-infra':'temp_infra',
      'p2-earth':'earthwork','p2-concrete':'concrete','p2-utility':'utility',
      'p3-skel':'skeleton','p3-roof':'roofing','p3-windows':'windows',
      'p4-hvac':'hvac','p4-plumb':'plumbing','p4-elec':'electrical','p4-block':'blocking',
      'p5-ins':'insulation','p5-drywall':'drywall',
      'p6-clad':'cladding','p6-cab':'cabinetry','p6-trim':'trim',
      'p7-elec':'elec_trim','p7-plumb':'plumb_trim','p7-counter':'countertops',
      'p8-hand':'handover',
    };
    const k = map[sectionId] || 'general';
    if (!phase.data[k]) phase.data[k] = {};
    phase.data[k][el.id] = el.type === 'checkbox' ? el.checked : el.value;
    if (phase.id === 10 && !el.id.includes('-total')) delete phase.data[`_manual_${sectionId}-total`];
    // Save is handled by Financial.scheduleUpdate on change (blur), not on every keystroke
  }

  function exportPDF() { Export.exportPDF(); }
  function exportExcel() { Export.exportExcel(); }

  // ── Toast ──────────────────────────────────────────────
  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container'); if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const sym = type === 'success' ? '✓' : type === 'warning' ? '⚠' : type === 'error' ? '✕' : 'ℹ';
    t.innerHTML = `<span>${sym}</span><span>${message}</span>`;
    container.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(20px)';
      t.style.transition = 'all 220ms var(--ease-out)';
      setTimeout(() => t.remove(), 240);
    }, 3200);
  }

  // ── Generic modal ──────────────────────────────────────
  function showModal(html) {
    let m = document.getElementById('generic-modal');
    if (!m) { m = document.createElement('div'); m.id = 'generic-modal'; document.body.appendChild(m); }
    m.className = 'm-modal-overlay';
    m.innerHTML = `<div class="m-modal-box" style="text-align:left"><div id="generic-modal-body">${html}</div></div>`;
    m.classList.remove('hidden');
    m.style.display = 'flex';
  }
  function closeModal() {
    const m = document.getElementById('generic-modal');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
  }

  // ── Confirm modal ──────────────────────────────────────
  let _confirmAction = null, _confirmRequired = null;
  function showConfirmModal({ icon, title, body, confirmLabel='Delete', confirmRequired=null, onConfirm }) {
    if (!icon) icon = Icons.render('trash', 24);
    _confirmAction = onConfirm; _confirmRequired = confirmRequired;
    document.getElementById('confirm-modal-icon').innerHTML = icon;
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-body').textContent = body;
    document.getElementById('confirm-modal-btn').textContent = confirmLabel;
    const wrap = document.getElementById('confirm-modal-input-wrap');
    const input = document.getElementById('confirm-modal-input');
    if (confirmRequired) {
      wrap.style.display = 'block';
      document.getElementById('confirm-modal-input-label').textContent = `Type "${confirmRequired}" to confirm:`;
      input.placeholder = confirmRequired; input.value = '';
      document.getElementById('confirm-modal-btn').disabled = true;
    } else {
      wrap.style.display = 'none';
      document.getElementById('confirm-modal-btn').disabled = false;
    }
    document.getElementById('confirm-modal').classList.remove('hidden');
    if (confirmRequired) setTimeout(() => input.focus(), 100);
  }
  function closeConfirmModal(e) {
    // Only close when clicking the backdrop itself, not any child element
    if (e && e.target !== e.currentTarget) return;
    const el = document.getElementById('confirm-modal');
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
    _confirmAction = null; _confirmRequired = null;
  }
  function onConfirmInput() {
    if (!_confirmRequired) return;
    const v = document.getElementById('confirm-modal-input').value;
    document.getElementById('confirm-modal-btn').disabled = (v !== _confirmRequired);
  }
  async function executeConfirmAction() {
    if (!_confirmAction) return;
    const btn = document.getElementById('confirm-modal-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try { await _confirmAction(); } catch (e) { toast('Failed: ' + (e.message || e), 'warning'); }
    document.getElementById('confirm-modal').classList.add('hidden');
    _confirmAction = null; _confirmRequired = null;
  }

  function confirmDeleteProject() {
    const proj = State.getCurrentProject();
    document.getElementById('user-dropdown')?.classList.add('hidden');
    if (!proj) return toast('No project open', 'warning');
    showConfirmModal({
      title: `Delete "${proj.name}"?`,
      body: 'All phases, subcontractors, invoices and punch items will be permanently deleted.',
      confirmLabel: 'Delete Project',
      onConfirm: async () => { await State.deleteProject(proj.id); showProjectPicker(); toast('Project deleted', 'success'); }
    });
  }
  function confirmDeleteProjectById(id, name, e) {
    e?.stopPropagation();
    showConfirmModal({
      title: `Delete "${name}"?`,
      body: 'All data for this project will be permanently removed.',
      confirmLabel: 'Delete Project',
      onConfirm: async () => {
        await State.deleteProject(id);
        const rem = State.getProjects();
        if (rem.length) showWelcomeWithProjects(rem); else showWelcome();
        toast('Project deleted', 'success');
      }
    });
  }
  function confirmDeleteAccount() {
    document.getElementById('user-dropdown')?.classList.add('hidden');
    const u = SupabaseClient.getUser?.();
    const email = u?.email || 'your account';
    showConfirmModal({
      icon: Icons.render('alert', 24),
      title: 'Delete Your Account?',
      body: `Permanently deletes ${email} and ALL projects.`,
      confirmLabel: 'Delete Everything',
      confirmRequired: 'DELETE',
      onConfirm: async () => {
        await SupabaseClient.deleteUser();
        try { localStorage.clear(); } catch {}
        toast('Account deleted', 'success');
        setTimeout(() => { window.location.href = '/auth.html'; }, 1200);
      }
    });
  }

  // ── User menu ──────────────────────────────────────────
  function _closeMenuOnOutsideClick(e) {
    if (!e.target.closest('#user-dropdown') && !e.target.closest('#user-menu-btn')) {
      document.getElementById('user-dropdown')?.classList.add('hidden');
      document.removeEventListener('click', _closeMenuOnOutsideClick);
    }
  }
  function toggleUserMenu() {
    const dd = document.getElementById('user-dropdown'); if (!dd) return;
    const delBtn = document.getElementById('btn-delete-project');
    if (delBtn) delBtn.style.display = State.getCurrentProject() ? 'block' : 'none';
    dd.classList.toggle('hidden');
    if (!dd.classList.contains('hidden')) {
      document.removeEventListener('click', _closeMenuOnOutsideClick);
      setTimeout(() => document.addEventListener('click', _closeMenuOnOutsideClick), 0);
    }
  }

  async function signOut() {
    try { if (typeof SupabaseClient !== 'undefined') await SupabaseClient.signOut(); } catch(e) {}
    try { localStorage.removeItem('buildmanager_v2'); } catch {}
    window.location.href = '/auth.html';
  }

  // ── Helpers ────────────────────────────────────────────

  function showEditProjectModal() {
    const proj = State.getCurrentProject();
    if (!proj) return toast('No project open', 'warning');

    showModal(`
      <h3 class="modal-title">${Icons.render('pencil', 18)} Edit Project Info</h3>
      <div class="field-group" style="margin-bottom:12px">
        <label class="field-label">Project Name *</label>
        <input class="field-input" id="ep-name" value="${(proj.name||'').replace(/"/g,'&quot;')}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="field-group">
          <label class="field-label">Client Name</label>
          <input class="field-input" id="ep-client" value="${(proj.client||'').replace(/"/g,'&quot;')}">
        </div>
        <div class="field-group">
          <label class="field-label">Project Type</label>
          <select class="field-select" id="ep-type">
            <option value="residential" ${proj.type==='residential'?'selected':''}>Residential — New Construction</option>
            <option value="commercial" ${proj.type==='commercial'?'selected':''}>Commercial Build</option>
            <option value="renovation" ${proj.type==='renovation'?'selected':''}>Renovation / Remodel</option>
            <option value="addition" ${proj.type==='addition'?'selected':''}>Addition</option>
          </select>
        </div>
      </div>
      <div class="field-group" style="margin-bottom:12px">
        <label class="field-label">Project Address</label>
        <input class="field-input" id="ep-address" value="${(proj.address||'').replace(/"/g,'&quot;')}">
      </div>
      <div style="background:var(--bg-elev-2);border-radius:var(--r-md);padding:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Budget & Currency</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="field-group">
            <label class="field-label">Total Budget (₹)</label>
            <input class="field-input mono" type="number" id="ep-budget" value="${proj.totalBudget||''}" min="0" style="font-family:var(--font-mono)">
          </div>
          <div class="field-group">
            <label class="field-label">Contingency %</label>
            <input class="field-input mono" type="number" id="ep-contingency" value="${proj.contingency||10}" min="0" max="30" style="font-family:var(--font-mono)">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field-group">
            <label class="field-label">Currency</label>
            <select class="field-select" id="ep-currency">
              <option value="INR" ${(proj.currency||'INR')==='INR'?'selected':''}>₹ INR</option>
              <option value="USD" ${(proj.currency||'')==='USD'?'selected':''}>$ USD</option>
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Primary Contractor</label>
            <input class="field-input" id="ep-contractor" value="${(proj.contractor||'').replace(/"/g,'&quot;')}">
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="field-group">
          <label class="field-label">Start Date</label>
          <input class="field-input" type="date" id="ep-start" value="${proj.startDate||''}">
        </div>
        <div class="field-group">
          <label class="field-label">Target Completion</label>
          <input class="field-input" type="date" id="ep-end" value="${proj.endDate||''}">
        </div>
      </div>
      <div class="field-group" style="margin-bottom:20px">
        <label class="field-label">Scope Notes</label>
        <textarea class="field-textarea" id="ep-notes" rows="3" placeholder="Brief description of scope…">${(proj.notes||'').replace(/"/g,'&quot;')}</textarea>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">Cancel</button>
        <button onclick="App.saveEditProject()" style="flex:1;padding:11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;background:linear-gradient(180deg,var(--amber-soft),var(--amber));color:#fff;border:none">${Icons.render('check', 14)} Save Changes</button>
      </div>
    `);
  }

  function saveEditProject() {
    const proj = State.getCurrentProject();
    if (!proj) return toast('No project open', 'warning');

    const name = document.getElementById('ep-name')?.value?.trim();
    if (!name) return toast('Project name is required', 'warning');

    const updates = {
      name,
      client: document.getElementById('ep-client')?.value?.trim() || '',
      address: document.getElementById('ep-address')?.value?.trim() || '',
      type: document.getElementById('ep-type')?.value || 'residential',
      totalBudget: parseFloat(document.getElementById('ep-budget')?.value) || 0,
      contingency: parseFloat(document.getElementById('ep-contingency')?.value) || 10,
      currency: document.getElementById('ep-currency')?.value || 'INR',
      contractor: document.getElementById('ep-contractor')?.value?.trim() || '',
      startDate: document.getElementById('ep-start')?.value || '',
      endDate: document.getElementById('ep-end')?.value || '',
      notes: document.getElementById('ep-notes')?.value?.trim() || '',
    };

    State.updateProjectInfo(updates);

    // Update the app bar name
    const nameEl = document.getElementById('current-project-name');
    if (nameEl) nameEl.textContent = name;

    // Refresh Financial currency
    Financial.currency = updates.currency;

    closeModal();
    toast('Project info updated', 'success');

    // Re-render current hub to reflect changes
    showHub(currentHub);
    Financial.updateAllTotals?.();
  }

  function emptyState(title, desc) {
    return `<div class="m-empty"><div class="m-empty-icon">${Icons.render('inbox', 40)}</div><div class="m-empty-title">${title}</div><div class="m-empty-desc">${desc || ''}</div></div>`;
  }

  // ── Back Button (Android hardware + browser) ──────────
  function _pushNav(dest) {
    // Avoid duplicates: compare meaningful properties based on type
    const last = _navStack[_navStack.length - 1];
    if (!last) { _navStack.push(dest); return; }
    if (last.type !== dest.type) { _navStack.push(dest); return; }
    // Same type — check deeper to avoid duplicates
    if (dest.type === 'hub' && last.name === dest.name) return;
    if (dest.type === 'phase-hub' && last.phaseId === dest.phaseId) return;
    if (dest.type === 'category' && last.phaseId === dest.phaseId && last.categoryId === dest.categoryId) return;
    _navStack.push(dest);
  }

  function handleBack() {
    // 1. AI drawer open → close it
    if (aiOpen) { closeAI(); return; }

    // 2. Generic modal open → close it
    const gModal = document.getElementById('generic-modal');
    if (gModal && gModal.style.display === 'flex') { closeModal(); return; }

    // 3. Confirm modal open → close it
    const cModal = document.getElementById('confirm-modal');
    if (cModal && !cModal.classList.contains('hidden')) {
      cModal.classList.add('hidden');
      cModal.style.display = 'none';
      _confirmAction = null;
      _confirmRequired = null;
      return;
    }

    // 4. User dropdown open → close it
    const dd = document.getElementById('user-dropdown');
    if (dd && !dd.classList.contains('hidden')) { dd.classList.add('hidden'); return; }

    // 5. Wizard is open → wizardBack
    const wizard = document.getElementById('project-wizard');
    if (wizard && !wizard.classList.contains('hidden')) { wizardBack(); return; }

    // 6. Pop nav history and restore previous view
    if (_navStack.length > 0) {
      const prev = _navStack.pop();
      _isNavigatingBack = true;
      if (prev.type === 'hub') {
        showHub(prev.name);
        if (prev.ledgerTab) setLedgerTab(prev.ledgerTab);
      } else if (prev.type === 'phase-hub') {
        showPhaseHub(prev.phaseId);
      } else if (prev.type === 'category') {
        showPhaseCategory(prev.phaseId, prev.categoryId);
      } else if (prev.type === 'input-card') {
        showInputCard(prev.phaseId, prev.cardId);
      } else if (prev.type === 'more-back') {
        showHub('more');
      } else if (prev.type === 'flat-sales') {
        showFlatSales();
      }
      _isNavigatingBack = false;
      return;
    }

    // 7. At root → minimize app (Capacitor) not close it
    if (typeof Capacitor !== 'undefined') {
      try { Capacitor.Plugins.App.minimizeApp(); } catch (e) {}
    }
  }

  function _setupBackButton() {
    if (_backSetup) return;
    _backSetup = true;

    // ── Helper: register the Capacitor App.backButton listener ──
    function registerCapacitorBackButton() {
      if (typeof Capacitor === 'undefined') return false;
      try {
        if (Capacitor.Plugins && Capacitor.Plugins.App && typeof Capacitor.Plugins.App.addListener === 'function') {
          Capacitor.Plugins.App.addListener('backButton', () => {
            handleBack();
          });
          console.log('[Back] ✓ Capacitor backButton listener registered');
          return true;
        }
        console.warn('[Back] Capacitor.Plugins.App.addListener not available yet');
      } catch (e) {
        console.error('[Back] Failed to register Capacitor listener:', e);
      }
      return false;
    }

    // ── Method 1: Try immediately ───────────────────────────────
    // Capacitor's bridge is usually ready by DOMContentLoaded.  If this
    // succeeds, we're done.
    let registered = registerCapacitorBackButton();

    // ── Method 2: deviceready event (backup) ────────────────────
    // Standard Cordova/Capacitor event fired once the native bridge is
    // fully initialised.  On many devices this fires BEFORE
    // DOMContentLoaded, so it's a safety net for the async-init case.
    if (!registered) {
      document.addEventListener('deviceready', () => {
        console.log('[Back] deviceready fired — retrying');
        registerCapacitorBackButton();
      });
    }

    // ── Method 3: Delayed retry (last resort) ───────────────────
    // If deviceready already fired before DOMContentLoaded, the listener
    // above will never fire.  This catch-all covers that edge case.
    if (!registered) {
      setTimeout(() => {
        if (!registerCapacitorBackButton()) {
          console.warn('[Back] All Capacitor registration attempts failed');
        }
      }, 800);
    }

    // ── Method 4: Cordova-compat backbutton event (fallback) ────
    // Works in some Capacitor/Cordova runtimes even when the App
    // plugin listener isn't available.
    document.addEventListener('backbutton', (e) => {
      e.preventDefault();
      handleBack();
    });

    // ── Browser fallback via popstate ───────────────────────────
    // Used when running outside Capacitor (dev in browser, etc.)
    window.addEventListener('popstate', (e) => {
      // Only intercept if we have navigation to handle
      if (_navStack.length > 0 || aiOpen ||
          !document.getElementById('project-wizard')?.classList.contains('hidden') ||
          document.getElementById('generic-modal')?.style.display === 'flex' ||
          !document.getElementById('confirm-modal')?.classList.contains('hidden')) {
        e.preventDefault();
        handleBack();
      }
    });

    // Push a dummy history entry so popstate fires on back in browser
    if (window.history && window.history.pushState) {
      window.history.pushState({ app: true }, '');
    }
  }

  let _isSyncing = false;

  function updateSyncStatus() {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    const proj = State.getCurrentProject();
    if (!proj) {
      badge.style.display = 'none';
      return;
    }

    const isLocalProject = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proj.id);
    if (isLocalProject) {
      badge.style.display = 'inline-flex';
      badge.className = 'sync-badge offline-local';
      badge.innerHTML = 'Local Only';
      return;
    }

    badge.style.display = 'inline-flex';
    const isOnline = navigator.onLine;

    if (!isOnline) {
      badge.className = 'sync-badge offline-local';
      badge.innerHTML = '⚠ Offline';
    } else if (_isSyncing) {
      badge.className = 'sync-badge syncing';
      badge.innerHTML = 'Syncing…';
    } else {
      const unsynced = State.hasUnsyncedChanges();
      if (unsynced) {
        badge.className = 'sync-badge offline-local';
        badge.style.border = '1px dashed var(--warning)';
        badge.style.color = 'var(--warning)';
        badge.innerHTML = 'Unsynced';
      } else {
        badge.className = 'sync-badge online-synced';
        badge.style.border = '';
        badge.style.color = '';
        badge.innerHTML = '✓ Synced';
      }
    }
  }

  // ── Boot ───────────────────────────────────────────────
  async function boot() {
    try { await State.load(); } catch (e) { console.warn(e); }

    // Auth Guard: redirect to login if not authenticated and not onboarding
    const needsOnboarding = !localStorage.getItem('recon_onboarded_v1');
    if (!needsOnboarding && typeof SupabaseClient !== 'undefined' && !SupabaseClient.isAuthenticated()) {
      SupabaseClient.requireAuth();
      return;
    }

    // Ensure state is saved before tab close
    window.addEventListener('beforeunload', () => State.save());
    _setupBackButton();
    init();

    // Wire up sync queue events
    window.addEventListener('online', () => {
      updateSyncStatus();
      toast('Connection restored. Syncing changes to cloud...', 'info');
      State.replaySyncQueue();
    });
    window.addEventListener('offline', () => {
      updateSyncStatus();
      toast('Connection lost. Operating offline.', 'warning');
    });
    window.addEventListener('syncqueuechanged', updateSyncStatus);
    window.addEventListener('syncstart', () => {
      _isSyncing = true;
      updateSyncStatus();
    });
    window.addEventListener('syncend', (e) => {
      _isSyncing = false;
      updateSyncStatus();
      if (e.detail && e.detail.success) {
        toast('Cloud sync complete!', 'success');
      } else {
        toast('Sync paused: some mutations are pending connection.', 'warning');
      }
    });

    window.addEventListener('statesynced', () => {
      updateSyncStatus();
      const proj = State.getCurrentProject();
      if (proj) {
        const nameEl = document.getElementById('current-project-name');
        if (nameEl) {
          const isLocal = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proj.id);
          if (isLocal) {
            nameEl.innerHTML = `${escapeHtml(proj.name)} <button class="m-appbar-sync-btn" onclick="App.syncProjectToCloud('${escapeAttr(proj.id)}')" title="Sync Project to Cloud" style="background:transparent; border:none; color:var(--amber); cursor:pointer; padding:0 4px; display:inline-flex; align-items:center; vertical-align:middle;">${Icons.render('cloudUpload', 16)}</button>`;
          } else {
            nameEl.textContent = proj.name;
          }
        }
        showHub(currentHub);
        Financial.updateAllTotals?.();
      } else {
        const ps = State.getProjects();
        if (ps.length) showWelcomeWithProjects(ps); else showWelcome();
      }
    });

    window.addEventListener('phasescoreready', () => {
      if (currentView === 'material-cards') showMaterialCards(currentPhase);
      else if (currentView === 'labor-cards') showLaborCards(currentPhase);
      else if (currentView === 'entry-form') showEntryForm(currentPhase, currentCategory);
    });

    // Initial sync status check and auto-replay
    updateSyncStatus();
    if (navigator.onLine) {
      State.replaySyncQueue();
    }
  }

  function showSyncConstraintModal() {
    const sqlScript = `ALTER TABLE public.phases DROP CONSTRAINT IF EXISTS phases_phase_number_check;\nALTER TABLE public.phases ADD CONSTRAINT phases_phase_number_check CHECK (phase_number BETWEEN 1 AND 12);`;
    
    showModal(`
      <div style="display:flex; flex-direction:column; gap:12px; text-align:left">
        <div style="display:flex; align-items:center; gap:8px; color:var(--warning)">
          ${Icons.render('alert', 24)}
          <h3 style="margin:0; font-size:18px; font-weight:700">Database Schema Outdated</h3>
        </div>
        <p style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin:0">
          Your remote Supabase database has a check constraint restricting <code>phase_number</code> to 9 phases. Since the app has been updated to include 10 phases (including Interior), your schema needs to be updated.
        </p>
        <p style="font-size:13px; color:var(--text-secondary); font-weight:600; margin:0">
          Copy and run the following SQL command in your <strong>Supabase SQL Editor</strong> to fix this:
        </p>
        <div style="position:relative; margin-top:4px">
          <textarea readonly style="width:100%; height:80px; font-family:var(--font-mono); font-size:11px; padding:10px; border:1px solid var(--border-strong); border-radius:8px; background:var(--bg-elev-2); color:var(--text); resize:none; outline:none; box-sizing:border-box" id="sync-sql-box">${sqlScript}</textarea>
          <button onclick="navigator.clipboard.writeText(document.getElementById('sync-sql-box').value); App.toast('SQL copied to clipboard!', 'success')" style="position:absolute; bottom:8px; right:8px; background:var(--amber); color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:700">
            Copy
          </button>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="m-btn m-btn-primary m-btn-grow" onclick="App.closeModal()">OK, I will run this</button>
        </div>
      </div>
    `);
  }

  async function syncProjectToCloud(projectId, event) {
    if (event) event.stopPropagation();
    if (!navigator.onLine) {
      toast('Cannot sync project: You are currently offline.', 'warning');
      return;
    }
    toast('Syncing project to cloud...', 'info');
    try {
      await State.syncProjectToCloud(projectId);
      toast('Project synced to cloud successfully!', 'success');
      // Redraw screen
      const projects = State.getProjects();
      const proj = State.getCurrentProject();
      if (proj && String(proj.id) === String(projectId)) {
        showMainApp(proj);
      } else if (projects.length) {
        showWelcomeWithProjects(projects);
      }
    } catch (err) {
      console.error('[App] Sync to cloud failed:', err);
      const msg = err.message || '';
      if (msg.includes('phases_phase_number_check')) {
        showSyncConstraintModal();
      } else {
        toast('Sync failed: ' + msg, 'error');
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    init, startNewProject, openProject, showProjectPicker, syncProjectToCloud,
    wizardNext, wizardBack, wizardSkip,
    showHub, setLedgerTab,
    // phase routes
    showPhase, showPhaseHub, showInteriorHub, showPhaseCategory, showInputCard,
    showMaterialCards, showLaborCards, showEntryForm, showPhaseBills, showConstructionBills,
    // more routes
    showRaBillsHub, showSubLedger, showFlatSales, showFlatSalesBuyer, showTools,
    // legacy aliases
    showLabourHub, showVendorHub, showInventoryHub, showOverview, showDashboard,
    // AI / FAB
    toggleAI, openAI, closeAI, minimizeAI, sendAIMessage, _toggleFab, _fabAction,
    // export
    exportPDF, exportExcel,
    // user / modals
    toggleUserMenu, signOut, toast, showModal, closeModal,
    showConfirmModal, closeConfirmModal, onConfirmInput, executeConfirmAction,
    handleBack,
    showTutorial: window.showTutorial || function(){},
    showEditProjectModal, saveEditProject,
    confirmDeleteProject, confirmDeleteProjectById, confirmDeleteAccount,
    // legacy no-ops
    toggleSidebar() {}, toggleSidebarGroup() {},
  };
})();
