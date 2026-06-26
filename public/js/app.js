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

  // Start observing on DOMContentLoaded. Scope to the dynamic content
  // container instead of document.body so the observer doesn't fire on
  // every header/footer/nav repaint (PERF-03 / GAP-06).
  document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('content-area') || document.querySelector('main') || document.body;
    observer.observe(target, { childList: true, subtree: true });
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
        const hasUnsynced = !isLocal && State.hasUnsyncedChanges();
        const syncBtnHtml = isLocal ? `<button class="existing-project-sync-btn" title="Sync to Cloud" onclick="App.syncProjectToCloud('${escapeAttr(p.id)}', event)">${Icons.render('cloudUpload', 14)}</button>` : '';
        const unsyncedDot = hasUnsynced ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--warning);margin-left:4px" title="Unsynced changes"></span>` : '';
        return `<div class="existing-project-row">
          <button class="existing-project-btn" onclick="App.openProject('${escapeAttr(p.id)}')">
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;font-size:15px;color:var(--text)">${escName}${unsyncedDot}</div>
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
            <option value="combined" ${wizardData.type==='combined'?'selected':''}>Commercial / Residential (Combined)</option>
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
        nameEl.innerHTML = `${escapeHtml(proj.name)}`;
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
          active = (viewName !== 'ra-bills' && viewName !== 'subcontractors' && viewName !== 'flat-sales' && viewName !== 'flat-sales-buyer' && viewName !== 'quick-leads' && viewName !== 'lead-detail' && viewName !== 'site-photos' && viewName !== 'site-photo-detail');
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
      } else if (tab === 'quickleads' && (viewName === 'quick-leads' || viewName === 'lead-detail')) {
        active = true;
      } else if (tab === 'sitephotos' && (viewName === 'site-photos' || viewName === 'site-photo-detail')) {
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

  // ── CONSTRUCTION HUB ──────────────────────────────────
  // Shows standard construction phases (1-9 + 11 = Electrical Supply) plus
  // any user-added custom construction phases (id ≥ 30, isCustom && !isInterior).
  // Phase 10 (legacy Interior) and the new interior section phases (20-27) are excluded.
  function renderConstructionHub(content) {
    const proj = State.getCurrentProject();
    if (!proj) { content.innerHTML = emptyState('No project open', 'Open or create a project from Dashboard.'); return; }
    const phases = Array.isArray(proj.phases) ? proj.phases : [];
    const construction = phases.filter(p => {
      const pid = Number(p.id);
      if (p.hidden) return false;
      if (p.isInterior) return false;
      // Standard construction phases: 1-9 (Civil..Other), 11 (Electrical Supply)
      if (pid >= 1 && pid <= 11) return pid !== 10; // exclude legacy Interior
      // Custom construction phases: id ≥ 30, not flagged isInterior
      if (pid >= 30 && p.isCustom) return true;
      return false;
    }).sort((a,b) => Number(a.id) - Number(b.id));
    const totalProject = Financial.computeProjectTotal(proj);

    const phaseCard = (ph) => {
      const cost = Financial.computePhaseTotal(ph);
      const comp = ph.completion || 0;
      const delBtn = ph.isCustom
        ? `<span onclick="event.stopPropagation();App._deleteCustomPhase(${ph.id})" title="Delete this phase" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.4);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px">×</span>`
        : '';
      return `<button class="m-phase-card" onclick="App.showPhaseHub(${ph.id})" style="position:relative">
        ${delBtn}
        <span class="m-phase-card-icon">${Icons.render(ph.icon, 22)}</span>
        <div class="m-phase-card-body">
          <div class="m-phase-card-name">${escapeHtml(ph.name)}${ph.isCustom ? ' <span style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.05em">Custom</span>' : ''}</div>
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
          <button class="m-phase-card" onclick="App.showAddPhaseModal('construction')" style="border:1.5px dashed var(--amber-border); background:var(--amber-light-bg)">
            <span class="m-phase-card-icon" style="color:var(--amber)">${Icons.render('plus', 22)}</span>
            <div class="m-phase-card-body">
              <div class="m-phase-card-name" style="color:var(--amber)">Add New Phase</div>
              <div class="m-phase-card-meta"><span>Create a custom construction phase</span></div>
            </div>
            <span class="m-phase-card-chev" style="color:var(--amber)">›</span>
          </button>
        </div>
      </div>`;
    AI.setWatching?.('Construction Trades');
  }

  // ── INTERIOR TAB ──────────────────────────────────────
  // Now behaves like Construction: a list of interior section phase cards
  // (phases 20-27) + any user-added custom interior phases. Clicking a card
  // opens that section's hub with Material + Labour cards (just like construction).
  function renderInteriorTab(content) {
    const proj = State.getCurrentProject();
    if (!proj) { content.innerHTML = emptyState('No project open', 'Open or create a project from Dashboard.'); return; }
    const phases = Array.isArray(proj.phases) ? proj.phases : [];
    const interior = phases.filter(p => {
      if (p.hidden) return false;
      if (p.isInterior) return true;
      return false;
    }).sort((a,b) => Number(a.id) - Number(b.id));
    const totalInterior = interior.reduce((s, p) => s + Financial.computePhaseTotal(p), 0);

    const phaseCard = (ph) => {
      const cost = Financial.computePhaseTotal(ph);
      const comp = ph.completion || 0;
      const delBtn = ph.isCustom
        ? `<span onclick="event.stopPropagation();App._deleteCustomPhase(${ph.id})" title="Delete this phase" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.4);color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px">×</span>`
        : '';
      return `<button class="m-phase-card" onclick="App.showPhaseHub(${ph.id})" style="position:relative">
        ${delBtn}
        <span class="m-phase-card-icon">${Icons.render(ph.icon, 22)}</span>
        <div class="m-phase-card-body">
          <div class="m-phase-card-name">${escapeHtml(ph.name)}${ph.isCustom ? ' <span style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.05em">Custom</span>' : ''}</div>
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

    if (interior.length === 0) {
      content.innerHTML = `<div class="phase-workspace active"><div class="m-empty">
        <div class="m-empty-icon">${Icons.render('sofa', 40)}</div>
        <div class="m-empty-title">No Interior Sections</div>
        <div class="m-empty-desc">Interior section phases (Flooring, Painting, Doors, Cabinetry, etc.) will appear here.</div>
        <button class="btn btn-primary" onclick="App.showAddPhaseModal('interior')" style="margin-top:12px">+ Add Interior Phase</button>
      </div></div>`;
      currentView = 'interior-hub';
      AI.setWatching?.('Interior Sections · Hub');
      return;
    }

    content.innerHTML = `
      <div class="phase-workspace active">
        <div class="m-hero-card">
          <div class="m-hero-eyebrow">Interior Sections</div>
          <div class="m-hero-amount">${Financial.fmtFull(totalInterior)}</div>
          <div class="m-hero-sub">${interior.length} sections · each with material & labour</div>
        </div>
        <div class="m-section-title">Interior Sections <span class="count">${interior.length}</span></div>
        <div class="m-phase-grid">
          ${interior.map(phaseCard).join('')}
          <button class="m-phase-card" onclick="App.showAddPhaseModal('interior')" style="border:1.5px dashed var(--amber-border); background:var(--amber-light-bg)">
            <span class="m-phase-card-icon" style="color:var(--amber)">${Icons.render('plus', 22)}</span>
            <div class="m-phase-card-body">
              <div class="m-phase-card-name" style="color:var(--amber)">Add New Interior Phase</div>
              <div class="m-phase-card-meta"><span>Create a custom interior section</span></div>
            </div>
            <span class="m-phase-card-chev" style="color:var(--amber)">›</span>
          </button>
        </div>
      </div>`;
    content.scrollTop = 0;
    currentView = 'interior-hub';
    Financial.updateAllTotals?.();
    AI.setWatching?.('Interior Sections · Hub');
  }

  // Drill into a phase — delegate to existing Phases module
  function showPhaseHub(phaseId) {
    phaseId = Number(phaseId);
    const proj = State.getCurrentProject(); if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId)); if (!phase) return;
    const isInterior = !!phase.isInterior;
    if (!_isNavigatingBack) {
      _pushNav({ type: 'hub', name: currentHub, ledgerTab: currentLedgerTab });
    }
    currentHub = isInterior ? 'interior' : 'construction';
    currentPhase = phaseId;
    currentCategory = null;
    currentView = isInterior ? 'interior-hub' : 'phase-hub';
    document.querySelectorAll('.m-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === currentHub));
    const content = document.getElementById('content-area'); if (!content) return;
    document.getElementById('fab-container').innerHTML = '';
    const backHub = isInterior ? 'interior' : 'construction';
    const backLabel = isInterior ? 'Interior Sections' : 'All Trades';
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
    // The new entry-model phases (1-11, 20-27, custom) do not use CATEGORY_REGISTRY.
    // If the phase has no registry entry, delegate to the phase hub (which then
    // routes through Material / Labour / Extra cards).
    if (!Phases?.CATEGORY_REGISTRY?.[phaseId]) {
      return showPhaseHub(phaseId);
    }
    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = _phaseHubName(phaseId); currentPhase = phaseId; currentCategory = categoryId;
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

    const backHub = _phaseHubName(phaseId);
    const backLabel = backHub === 'interior' ? 'Interior Sections' : phase.name;
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
    currentHub = _phaseHubName(phaseId); currentPhase = phaseId; currentCategory = cardId;
    currentView = _phaseHubName(phaseId) === 'interior' ? 'interior-category' : 'phase-category';
    const proj = State.getCurrentProject(); if (!proj) return;
    const phase = proj.phases.find(p => Number(p.id) === Number(phaseId)); if (!phase) return;
    const card = Phases.getInputCard ? Phases.getInputCard(phaseId, cardId) : null;
    if (!card) return showPhaseHub(phaseId);
    const content = document.getElementById('content-area'); if (!content) return;
    const backHub = _phaseHubName(phaseId);
    const backLabel = backHub === 'interior' ? 'Interior Sections' : phase.name;
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

  function _phaseHubName(phaseId) {
    const proj = State.getCurrentProject();
    const ph = proj?.phases?.find(p => Number(p.id) === Number(phaseId));
    return ph?.isInterior ? 'interior' : 'construction';
  }
  function showMaterialCards(phaseId) {
    phaseId = Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = _phaseHubName(phaseId); currentPhase = phaseId; currentCategory = 'material';
    currentView = 'material-cards';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (Phases?.renderCardListView) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${Phases.renderCardListView(phaseId, false, 'material')}</div>`;
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
    currentHub = _phaseHubName(phaseId); currentPhase = phaseId; currentCategory = 'labor';
    currentView = 'labor-cards';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (Phases?.renderCardListView) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${Phases.renderCardListView(phaseId, true, 'labor')}</div>`;
    } else {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        <div class="m-empty"><div class="m-empty-title">Module not loaded</div><div class="m-empty-desc">Try refreshing the page.</div></div></div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }
  function showExtraCards(phaseId) {
    phaseId = Number(phaseId);
    if (!_isNavigatingBack) {
      _pushNav({ type: 'phase-hub', phaseId: currentPhase });
    }
    currentHub = _phaseHubName(phaseId); currentPhase = phaseId; currentCategory = 'extra';
    currentView = 'extra-cards';
    const content = document.getElementById('content-area'); if (!content) return;
    const back = `App.showPhaseHub(${phaseId})`;
    if (Phases?.renderCardListView) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="${back}">← Back</button>
        ${Phases.renderCardListView(phaseId, false, 'extra')}</div>`;
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
    currentHub = _phaseHubName(phaseId); currentPhase = phaseId; currentCategory = cardId;
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
            <div class="body"><div class="label">Flat / Shop Purchaser</div><div class="desc">Buyers and payments received</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.showQuickLeads()">
            <span class="icon">${Icons.render('contact', 18)}</span>
            <div class="body"><div class="label">Quick Leads</div><div class="desc">Save potential customer contact details</div></div>
            <span class="chev">›</span>
          </button>
          <button class="m-list-row" onclick="App.showSitePhotos()">
            <span class="icon">${Icons.render('camera', 18)}</span>
            <div class="body"><div class="label">Site Photos</div><div class="desc">Document your construction site visually</div></div>
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

  function showQuickLeads() {
    if (!_isNavigatingBack) _pushNav({ type: 'more-back' });
    currentHub = 'more'; currentView = 'quick-leads';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof QuickLeads !== 'undefined' && QuickLeads.renderHub) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showHub('more')">← More</button>
        ${QuickLeads.renderHub()}</div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showLeadDetail(leadId) {
    if (!_isNavigatingBack) _pushNav({ type: 'quick-leads' });
    currentHub = 'more'; currentView = 'lead-detail';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof QuickLeads !== 'undefined' && QuickLeads.renderLeadDetail) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showQuickLeads()">← Leads</button>
        ${QuickLeads.renderLeadDetail(leadId)}</div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showSitePhotos() {
    if (!_isNavigatingBack) _pushNav({ type: 'more-back' });
    currentHub = 'more'; currentView = 'site-photos';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof SitePhotos !== 'undefined' && SitePhotos.renderHub) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showHub('more')">← More</button>
        ${SitePhotos.renderHub()}</div>`;
    }
    content.scrollTop = 0;
    syncSidebarActiveState(currentHub, currentView, currentLedgerTab);
  }

  function showSitePhotoDetail(photoId) {
    if (!_isNavigatingBack) _pushNav({ type: 'site-photos' });
    currentHub = 'more'; currentView = 'site-photo-detail';
    const content = document.getElementById('content-area'); if (!content) return;
    if (typeof SitePhotos !== 'undefined' && SitePhotos.renderPhotoDetail) {
      content.innerHTML = `<div class="phase-workspace active">
        <button class="back-to-hub" onclick="App.showSitePhotos()">← Photos</button>
        ${SitePhotos.renderPhotoDetail(photoId)}</div>`;
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
    // Render persisted history messages if container is still at intro state
    const container = document.getElementById('ai-messages');
    const history = AI.loadPersistedHistory?.() || [];
    if (container && history.length && container.querySelector('.ai-intro')) {
      // Append persisted messages after the intro bubble
      history.forEach(msg => {
        const isUser = msg.role === 'user';
        const text = msg.parts?.[0]?.text || '';
        if (!text) return;
        const div = document.createElement('div');
        div.className = isUser ? 'ai-message ai-user' : 'ai-message ai-bot';
        div.innerHTML = `<div class="ai-msg-body" style="font-size:12px">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
        container.appendChild(div);
      });
      if (history.length) {
        const note = document.createElement('div');
        note.style.cssText = 'padding:6px 14px;font-size:10px;color:var(--text-muted);text-align:center;border-top:1px solid var(--charcoal-border)';
        note.textContent = `↑ ${history.length} messages from previous session`;
        container.insertBefore(note, container.firstChild.nextSibling);
        container.scrollTop = container.scrollHeight;
      }
    }
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

  // ── Global Search ────────────────────────────────────────────
  function openSearch() {
    const overlay = document.getElementById('global-search-overlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    setTimeout(() => document.getElementById('global-search-input')?.focus(), 80);
  }

  function closeSearch(e) {
    if (e && e.target !== document.getElementById('global-search-overlay')) return;
    const overlay = document.getElementById('global-search-overlay');
    if (overlay) overlay.style.display = 'none';
    const inp = document.getElementById('global-search-input');
    if (inp) inp.value = '';
  }

  function escH(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function highlight(text, q) {
    if (!q) return escH(text);
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return escH(text);
    return escH(text.slice(0,idx)) + `<mark style="background:rgba(180,122,60,0.35);color:var(--amber);border-radius:2px">${escH(text.slice(idx,idx+q.length))}</mark>` + escH(text.slice(idx+q.length));
  }

  function runSearch(q) {
    const resultsEl = document.getElementById('global-search-results');
    if (!resultsEl) return;
    q = (q || '').trim();
    if (q.length < 2) {
      resultsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Start typing to search across all project data</div>';
      return;
    }
    const proj = State.getCurrentProject();
    if (!proj) { resultsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">No project loaded</div>'; return; }
    const ql = q.toLowerCase();
    const results = [];

    function matches(...vals) {
      return vals.some(v => v && String(v).toLowerCase().includes(ql));
    }

    // 1. Phase entries (material/labour costs stored in phase.data.entries)
    (proj.phases || []).forEach(ph => {
      const entries = (ph.data && ph.data.entries) ? ph.data.entries : {};
      Object.entries(entries).forEach(([cardId, arr]) => {
        (arr || []).forEach(e => {
          const flds = Object.values(e.fields || {});
          if (matches(e.notes, e.date, ...flds)) {
            const vendor = e.fields?.vendor || e.fields?.payee || e.fields?.supplier || e.fields?.dealer || e.fields?.contractor || '';
            const label = vendor || cardId.replace(/_/g, ' ');
            results.push({
              type: 'entry', icon: '📋',
              title: label,
              sub: `${ph.name} · ${e.date || '—'}${e.notes ? ' · ' + e.notes : ''}`,
              amount: e.total,
              onclick: `App.showEntryForm(${ph.id},'${cardId}')`
            });
          }
        });
      });
    });

    // 2. Vendors (proj.vendors[] — name/phone/shopName)
    (proj.vendors || []).forEach(v => {
      if (matches(v.name, v.shopName, v.phone, v.notes)) {
        results.push({
          type: 'vendor', icon: '🏪',
          title: v.name || v.shopName || '—',
          sub: `Vendor${v.shopName ? ' · ' + v.shopName : ''}${v.phone ? ' · ' + v.phone : ''}`,
          amount: v.balance,
          onclick: `App.showHub('ledgers');App.setLedgerTab('vendor')`
        });
      }
    });

    // 3. Vendor transactions (proj.vendorTransactions[] — flat array with vendorId)
    (proj.vendorTransactions || []).forEach(tx => {
      if (matches(tx.description, tx.notes, tx.txnDate)) {
        const vendor = (proj.vendors || []).find(v => String(v.id) === String(tx.vendorId));
        results.push({
          type: 'vendor-tx', icon: '💳',
          title: vendor ? vendor.name : 'Vendor Transaction',
          sub: `${tx.txnDate || '—'} · ${tx.description || ''} · ${tx.type === 'debit' ? 'Bill' : 'Payment'}`,
          amount: tx.amount,
          onclick: `App.showHub('ledgers');App.setLedgerTab('vendor')`
        });
      }
    });

    // 4. Labour workers (proj.labour[] — name/role/phone)
    (proj.labour || []).forEach(w => {
      if (matches(w.name, w.role, w.phone)) {
        results.push({
          type: 'worker', icon: '👷',
          title: w.name || '—',
          sub: `Worker · ${w.role || ''}${w.phone ? ' · ' + w.phone : ''}`,
          amount: null,
          onclick: `App.showHub('ledgers');App.setLedgerTab('labour')`
        });
      }
    });

    // 5. Labour logs (proj.labourLogs[] — notes, kharchi)
    (proj.labourLogs || []).forEach(log => {
      if (matches(log.notes, log.logDate)) {
        const worker = (proj.labour || []).find(w => String(w.id) === String(log.labourId));
        results.push({
          type: 'labour-log', icon: '📅',
          title: worker ? worker.name : 'Labour Log',
          sub: `${log.logDate || '—'} · ${log.status || ''} · ${log.notes || ''}`,
          amount: log.kharchi || null,
          onclick: `App.showHub('ledgers');App.setLedgerTab('labour')`
        });
      }
    });

    // 6. Phase bills (phase.bills[] — scanned bills)
    (proj.phases || []).forEach(ph => {
      (ph.bills || []).forEach(b => {
        if (matches(b.vendor, b.description, b.notes, b.billNumber, b.amount)) {
          results.push({
            type: 'bill', icon: '🧾',
            title: b.vendor || b.description || 'Bill',
            sub: `${ph.name} · ${b.date || b.scannedAt?.slice(0,10) || '—'}${b.description ? ' · ' + b.description : ''}`,
            amount: b.totalAmount || b.amount,
            onclick: `App.showPhaseBills(${ph.id})`
          });
        }
      });
    });

    // 7. RA Bills (proj.raBills[])
    (proj.raBills || []).forEach(b => {
      if (matches(b.billNumber, b.workDescription)) {
        results.push({
          type: 'rabill', icon: '📄',
          title: b.billNumber || 'RA Bill',
          sub: `RA Bill · ${b.workDescription || ''} · ${b.issueDate || ''}`,
          amount: b.amountDue,
          onclick: `App.showRaBillsHub()`
        });
      }
    });

    // 8. Flat sales buyers (proj.buyers[])
    (proj.buyers || []).forEach(b => {
      if (matches(b.name, b.phone, b.flatNo, b.notes)) {
        results.push({
          type: 'buyer', icon: '🏠',
          title: b.name || 'Buyer',
          sub: `Flat ${b.flatNo || '—'}${b.phone ? ' · ' + b.phone : ''}`,
          amount: null,
          onclick: `App.showFlatSalesBuyer('${b.id}')`
        });
      }
    });

    // 9. Buyer payments
    (proj.buyers || []).forEach(b => {
      (b.payments || []).forEach(p => {
        if (matches(p.notes, p.mode, p.date)) {
          results.push({
            type: 'payment', icon: '💰',
            title: (b.name || 'Buyer') + ' — Payment',
            sub: `${p.date || '—'} · ${p.mode || ''} · ${p.notes || ''}`,
            amount: p.amount,
            onclick: `App.showFlatSalesBuyer('${b.id}')`
          });
        }
      });
    });

    // 10. Site inventory materials (proj.materials[])
    (proj.materials || []).forEach(m => {
      if (matches(m.name, m.unit, m.notes)) {
        results.push({
          type: 'material', icon: '📦',
          title: m.name || '—',
          sub: `Inventory · Stock: ${m.currentStock || 0} ${m.unit || ''}`,
          amount: null,
          onclick: `App.showInventoryHub()`
        });
      }
    });

    // 11. Quick Leads (proj.leads[])
    (proj.leads || []).forEach(l => {
      if (matches(l.name, l.phone, l.address, l.source, l.status, l.notes)) {
        results.push({
          type: 'lead', icon: '👤',
          title: l.name || 'Lead',
          sub: `Lead · ${l.phone || '—'}${l.status ? ' · ' + l.status : ''}`,
          amount: null,
          onclick: `App.showLeadDetail('${l.id}')`
        });
      }
    });

    // 12. Site Photos (proj.sitePhotos[])
    (proj.sitePhotos || []).forEach(p => {
      if (matches(p.name, p.description, p.category)) {
        results.push({
          type: 'site-photo', icon: '📸',
          title: p.name || 'Untitled Photo',
          sub: `Photo${p.category ? ' · ' + p.category : ''}`,
          amount: null,
          onclick: `App.showSitePhotoDetail('${p.id}')`
        });
      }
    });

    if (!results.length) {
      resultsEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">No results found for "<strong>${escH(q)}</strong>"<br><span style="font-size:11px;margin-top:8px;display:block">Try searching vendor name, worker name, bill description, or material name</span></div>`;
      return;
    }

    const F = Financial;
    const typeOrder = { 'entry':0,'vendor':1,'vendor-tx':2,'bill':3,'rabill':4,'worker':5,'labour-log':6,'buyer':7,'payment':8,'material':9,'lead':10,'site-photo':11 };
    results.sort((a,b) => (typeOrder[a.type]||9) - (typeOrder[b.type]||9));

    const rows = results.slice(0, 60).map(r => `
      <button onclick="${escH(r.onclick)};App.closeSearch()" style="width:100%;text-align:left;background:none;border:none;padding:11px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--charcoal-border);font-family:var(--font-body)" onmouseenter="this.style.background='var(--charcoal-mid)'" onmouseleave="this.style.background='none'">
        <span style="font-size:18px;flex-shrink:0;width:24px;text-align:center">${r.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${highlight(r.title, q)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${highlight(r.sub, q)}</div>
        </div>
        ${r.amount != null ? `<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--amber);flex-shrink:0;white-space:nowrap">${F.fmt(r.amount)}</span>` : ''}
      </button>`).join('');

    resultsEl.innerHTML = `
      <div style="padding:8px 16px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted)">${results.length} result${results.length !== 1 ? 's' : ''} for "${escH(q)}"</div>
      ${rows}
      ${results.length > 60 ? `<div style="padding:10px 18px;font-size:11px;color:var(--text-muted)">Showing first 60 of ${results.length}. Refine your search.</div>` : ''}
    `;
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
            <option value="combined" ${proj.type==='combined'?'selected':''}>Commercial / Residential (Combined)</option>
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
      } else if (prev.type === 'quick-leads') {
        showQuickLeads();
      } else if (prev.type === 'site-photos') {
        showSitePhotos();
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

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K → open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
      // Escape → close search overlay if open
      if (e.key === 'Escape') {
        const overlay = document.getElementById('global-search-overlay');
        if (overlay && overlay.style.display !== 'none') { overlay.style.display = 'none'; }
      }
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
  let _syncToastShown = false; // Track if we already showed a toast for this sync cycle

  // Cloud SVG icon used in the badge — small cloud (14px)
  function _cloudIconSVG(size = 14, extra = '') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}><path d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5-.42-1.89-1.99-3.5-4-3.5A4.5 4.5 0 0 0 7.5 12c0 .28.02.55.06.82-1.58.33-2.56 1.76-2.56 3.43A3.75 3.75 0 0 0 8.75 20H17"/></svg>`;
  }

  // Spinning sync icon (two curved arrows)
  function _syncSpinnerSVG(size = 12) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="sync-spin-icon"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;
  }

  function updateSyncStatus() {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;

    const proj = State.getCurrentProject();
    if (!proj) {
      badge.style.display = 'none';
      return;
    }

    const isLocalProject = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proj.id);
    badge.style.display = 'inline-flex';
    badge.style.border = '';
    badge.style.color = '';

    if (isLocalProject) {
      badge.className = 'sync-badge offline-local';
      badge.innerHTML = _cloudIconSVG(13) + '<span>Local</span>';
      badge.onclick = () => syncProjectToCloud(proj.id);
      badge.title = 'Tap to sync this project to cloud';
      return;
    }

    const isOnline = navigator.onLine;

    if (!isOnline) {
      badge.className = 'sync-badge offline-local';
      badge.innerHTML = _cloudIconSVG(13) + '<span>Offline</span>';
      badge.onclick = null;
      badge.title = 'No internet connection';
    } else if (_isSyncing) {
      badge.className = 'sync-badge syncing';
      badge.innerHTML = _syncSpinnerSVG(13) + '<span>Syncing</span>';
      badge.onclick = null;
      badge.title = 'Syncing changes to cloud…';
    } else {
      const unsynced = State.hasUnsyncedChanges();
      if (unsynced) {
        badge.className = 'sync-badge unsynced';
        badge.style.border = '1px dashed var(--warning)';
        badge.style.color = 'var(--warning)';
        badge.innerHTML = _cloudIconSVG(13) + '<span>Unsynced</span>';
        badge.onclick = () => forceSyncNow();
        badge.title = 'Some changes not synced — tap to retry';
      } else {
        badge.className = 'sync-badge online-synced';
        badge.innerHTML = _cloudIconSVG(13) + '<span>Synced</span>';
        badge.onclick = () => forceSyncNow();
        badge.title = 'All changes saved to cloud — tap to force sync';
      }
    }
  }

  // Force sync: manually trigger a full cloud sync
  async function forceSyncNow() {
    if (!navigator.onLine) {
      toast('Cannot sync: You are currently offline.', 'warning');
      return;
    }
    const proj = State.getCurrentProject();
    if (!proj) return;

    // If project is local (not yet synced to cloud), use the migration path
    const isLocalProject = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proj.id);
    if (isLocalProject) {
      return syncProjectToCloud(proj.id);
    }

    toast('Syncing with cloud...', 'info');
    // Mark that we want a toast for this sync cycle — the syncend handler
    // will consume this flag and show the appropriate completion toast.
    _syncToastShown = true;
    try {
      await State.forceSync();
      // NOTE: Do NOT show a second toast here — the syncend event handler
      // will show "Cloud sync complete!" or "Sync paused..." based on the result.
      // (Previously this showed a duplicate "Sync complete!" toast.)
    } catch (err) {
      _syncToastShown = false; // Consume flag so syncend doesn't also toast
      console.error('[App] Force sync failed:', err);
      toast('Sync failed: ' + (err.message || 'Unknown error'), 'error');
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
      _syncToastShown = true;
      State.forceSync().then(() => {
        // Refresh dashboard after auto-sync to update the sync banner
        if (currentView === 'overview') {
          refreshDashboard();
        }
      });
    });
    window.addEventListener('offline', () => {
      updateSyncStatus();
      toast('Connection lost. Operating offline.', 'warning');
    });
    // dirtychanged: dispatched when dirty state changes (user made/unsaved changes)
    // This is the PRIMARY event for badge updates — replaces the old
    // syncstart/syncend-driven badge updates that caused flickering.
    window.addEventListener('dirtychanged', updateSyncStatus);
    window.addEventListener('syncqueuechanged', updateSyncStatus);
    // syncstart/syncend: ONLY dispatched by forceSync() (user-triggered resync).
    // Auto-save no longer dispatches these events, preventing the sync loop.
    window.addEventListener('syncstart', () => {
      _isSyncing = true;
      updateSyncStatus();
    });
    window.addEventListener('syncend', (e) => {
      _isSyncing = false;
      updateSyncStatus();
      // Refresh dashboard to update/remove the "Re-sync" banner
      if (currentView === 'overview') {
        refreshDashboard();
      }
      // Show toast for user-triggered syncs
      if (_syncToastShown) {
        _syncToastShown = false;
        if (e.detail && e.detail.success) {
          toast('Cloud sync complete!', 'success');
        } else if (e.detail && !e.detail.success) {
          toast('Sync paused: some changes are pending.', 'warning');
        }
      }
    });

    window.addEventListener('statesynced', () => {
      updateSyncStatus();
      const proj = State.getCurrentProject();
      if (proj) {
        const nameEl = document.getElementById('current-project-name');
        if (nameEl) {
          nameEl.textContent = proj.name;
        }
        showHub(currentHub);
        // IMPORTANT: Financial.updateAllTotals() may call State.save() internally,
        // which would trigger saveToSupabase(). Since we just loaded from cloud,
        // there are no user changes to sync. The dirty flags were cleared by
        // _notifySynced(), so saveToSupabase() will skip (nothing dirty).
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
    if (navigator.onLine && State.hasUnsyncedChanges()) {
      _syncToastShown = true;
      State.forceSync().then(() => {
        if (currentView === 'overview') refreshDashboard();
      });
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

  // ── Global Event Bus for Cross-Module Reactivity ────────
  // Allows any module to emit events and others to listen,
  // so changes propagate instantly without page reload.
  const _listeners = {};

  function emit(event, detail) {
    const handlers = _listeners[event];
    if (!handlers) return;
    handlers.forEach(fn => {
      try { fn(detail); } catch(e) { console.warn('[App.emit] Error in listener for', event, e); }
    });
  }

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    // Return unsubscribe function
    return () => {
      _listeners[event] = _listeners[event].filter(f => f !== fn);
    };
  }

  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  }

  // ── Lightweight dashboard refresh (no full re-render) ────
  function refreshDashboard() {
    // Only re-render if dashboard is the current view
    if (currentView !== 'overview') return;
    const content = document.getElementById('content-area');
    if (!content) return;
    content.innerHTML = Dashboard.render();
  }

  // ── Core Reactivity Listeners ───────────────────────────
  // When data changes, refresh visible UI sections instantly

  // data:changed — fired by Financial.scheduleUpdate after totals recalc
  on('data:changed', () => {
    // Refresh dashboard stats if visible (lightweight DOM updates)
    if (currentView === 'overview') {
      refreshDashboard();
    }
    // If a phase hub is open, update its running total
    if (currentPhase > 0) {
      if (typeof Phases !== 'undefined' && typeof Phases.updateHubTotals === 'function') {
        try { Phases.updateHubTotals(currentPhase); } catch(e) {}
      }
    }
  });

  // completions:updated — fired after recalcAllCompletions
  on('completions:updated', () => {
    // Refresh dashboard to show new completion percentages
    if (currentView === 'overview') {
      refreshDashboard();
    }
  });

  // ── Add Custom Phase modal (Task 2) ────────────────────────
  // Adds a new phase to either the Construction or Interior tab.
  // Also auto-creates a matching estimation trade so the new phase appears
  // in the pre-construction estimator (and vice-versa via Estimation._addCustomTrade).
  function showAddPhaseModal(defaultTab) {
    const tab = defaultTab === 'interior' ? 'interior' : 'construction';
    const iconOptions = ['listChecks','pickaxe','ruler','paintbrush','zap','door','droplet','insulation','stairs','sofa','blocks','bricks','wrench','wrenchScrew','pipe','foundation','hammer','column','lightbulb','mirror','paintRoller','palette'];
    App.showModal(`
      <h3 class="modal-title">${Icons.render('plus', 16)} Add New Phase</h3>
      <div style="margin-bottom:12px">
        <label class="modal-label">Phase Name *</label>
        <input id="cp-name" class="modal-input" placeholder="e.g. Landscaping">
      </div>
      <div style="margin-bottom:12px">
        <label class="modal-label">Icon</label>
        <select id="cp-icon" class="modal-input" style="appearance:auto">
          ${iconOptions.map(ic => `<option value="${ic}">${ic}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:12px">
        <label class="modal-label">Show On Tab</label>
        <select id="cp-tab" class="modal-input" style="appearance:auto">
          <option value="construction" ${tab==='construction'?'selected':''}>Construction</option>
          <option value="interior" ${tab==='interior'?'selected':''}>Interior</option>
        </select>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:10px;border:1px solid var(--charcoal-border);background:none;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>
        <button onclick="App._saveCustomPhase()" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:10px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">Add Phase</button>
      </div>
    `);
  }

  async function _saveCustomPhase() {
    const name = document.getElementById('cp-name')?.value.trim();
    if (!name) { App.toast('Phase name is required', 'error'); return; }
    const icon = document.getElementById('cp-icon')?.value || 'listChecks';
    const tab  = document.getElementById('cp-tab')?.value || 'construction';
    const isInterior = tab === 'interior';
    const phase = State.addCustomPhase({ name, icon, isInterior });
    App.closeModal();
    App.toast('Phase added' + (phase ? ` (id: ${phase.id})` : ''), 'success');
    // Refresh the hub the new phase belongs to
    showHub(isInterior ? 'interior' : 'construction');
  }

  function _deleteCustomPhase(phaseId) {
    App.showConfirmModal({
      icon: Icons.render('trash', 24),
      title: 'Delete this custom phase?',
      body: 'All entries saved under this phase will be removed and the linked estimation trade will be deleted.',
      confirmLabel: 'Delete Phase',
      onConfirm: () => {
        State.deleteCustomPhase(phaseId);
        App.toast('Phase deleted', 'info');
        // Refresh whichever hub we're currently on (best-effort)
        showHub(currentHub === 'interior' ? 'interior' : 'construction');
      }
    });
  }

  return {
    init, startNewProject, openProject, showProjectPicker, syncProjectToCloud, forceSyncNow,
    wizardNext, wizardBack, wizardSkip,
    showHub, setLedgerTab,
    // phase routes
    showPhase, showPhaseHub, showInteriorHub, showPhaseCategory, showInputCard,
    showMaterialCards, showLaborCards, showExtraCards, showEntryForm, showPhaseBills, showConstructionBills,
    // more routes
    showRaBillsHub, showSubLedger, showFlatSales, showFlatSalesBuyer, showQuickLeads, showLeadDetail, showSitePhotos, showSitePhotoDetail, showTools,
    // custom phase helpers (Task 2)
    showAddPhaseModal, _saveCustomPhase, _deleteCustomPhase,
    // legacy aliases
    showLabourHub, showVendorHub, showInventoryHub, showOverview, showDashboard,
    refreshDashboard,
    emit, on, off,
    // AI / FAB
    toggleAI, openAI, closeAI, minimizeAI, sendAIMessage, _toggleFab, _fabAction,
    openSearch, closeSearch, runSearch,
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
