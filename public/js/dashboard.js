/* ═══════════════════════════════════════════════════════════════
   DASHBOARD.JS — Mobile-first project overview
   - Hero financial card with health bar
   - Stat cards (Spent / Remaining)
   - Phase micro-cards (top 6 by spend, tap to drill)
   - Variance alerts as mobile feed cards
   ═══════════════════════════════════════════════════════════════ */

const Dashboard = (() => {
  const F = Financial;

  function render() {
    const proj = State.getCurrentProject();
    if (!proj) return `<div class="m-empty"><div class="m-empty-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-8h6v8"/></svg></div><div class="m-empty-title">No project open</div></div>`;

    const total = F.computeProjectTotal(proj);
    const budget = proj.totalBudget || 0;
    const spent = total;
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(150, (spent / budget) * 100) : 0;
    const isOver = spent > budget && budget > 0;

    const phaseData = (proj.phases || []).map(ph => ({ ...ph, total: F.computePhaseTotal(ph) }));
    const sortedPhases = [...phaseData].sort((a, b) => b.total - a.total);
    const topPhases = sortedPhases.slice(0, 6);

    // Low-stock detection
    const materials = proj.materials || [];
    const lowStockItems = materials.filter(m => {
      const inward = parseFloat(m.totalInward) || 0;
      const stock = parseFloat(m.currentStock) || 0;
      return inward > 0 && (stock / inward) < 0.15;
    });

    // Only count phases that have actual cost or have been started for fair-share calculation
    const activePhases = phaseData.filter(ph => ph.total > 0 || (ph.completion || 0) > 0);
    const phaseCount = Math.max(1, phaseData.length);
    const activeDenominator = Math.max(1, activePhases.length);
    // Fair share = budget spread only across phases that are actually being used
    // Fair share is budget spread across ALL phases, not only active ones —
    // otherwise variance alerts get harder to trigger as more spend concentrates (CALC-03).
    const fairShare = budget / Math.max(1, phaseData.length);
    const variances = phaseData
      .filter(ph => budget > 0 && ph.total > 0 && ph.total > fairShare)
      .map(ph => ({ ...ph, over: ph.total - fairShare }));

    const avgComp = Math.round(phaseData.reduce((s, p) => s + (p.completion || 0), 0) / phaseCount);
    const isLocal = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proj.id);
    let syncBanner = '';
    if (isLocal) {
      syncBanner = `
      <div class="m-sync-banner" style="background:var(--amber-glow); border: 1px dashed var(--amber); border-radius:var(--r-lg); padding:12px; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <div style="min-width:0; flex:1">
          <div style="font-weight:700; font-size:13px; color:var(--amber)">Project lives on device only</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px">Sync to Cloud to back up all data.</div>
        </div>
        <button class="m-btn m-btn-primary m-btn-sm" onclick="App.syncProjectToCloud('${escapeAttr(proj.id)}')" style="min-height:30px; font-size:12px; padding:6px 12px; flex-shrink:0">
          Sync Project
        </button>
      </div>`;
    } else if (State.hasUnsyncedChanges()) {
      syncBanner = `
      <div class="m-sync-banner" style="background:rgba(199,121,102,0.08); border: 1px dashed var(--warning); border-radius:var(--r-lg); padding:12px; margin-bottom:16px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <div style="min-width:0; flex:1">
          <div style="font-weight:700; font-size:13px; color:var(--warning)">Some changes not synced</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px">Tap to retry syncing your latest updates to cloud.</div>
        </div>
        <button class="m-btn m-btn-sm" onclick="App.forceSyncNow()" style="min-height:30px; font-size:12px; padding:6px 12px; flex-shrink:0; background:var(--warning); color:#fff; border:none">
          Re-sync
        </button>
      </div>`;
    }

    return `
    <div class="phase-workspace active">
      ${syncBanner}

      <!-- LOW-STOCK ALERT BANNER -->
      ${lowStockItems.length > 0 ? `
        <div style="background:rgba(199,121,102,0.1);border:1.5px solid rgba(199,121,102,0.4);border-radius:var(--r-lg);padding:14px 16px;margin-bottom:16px;cursor:pointer" onclick="App.showInventoryHub()">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#C77966" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px;color:#C77966">Low Stock Alert — ${lowStockItems.length} material${lowStockItems.length > 1 ? 's' : ''}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${lowStockItems.map(m => escapeHtml(m.name)).join(', ')}</div>
            </div>
            <div style="font-size:11px;color:#C77966;font-weight:700;white-space:nowrap">View Inventory →</div>
          </div>
        </div>
      ` : ''}

      <!-- NET POSITION CARD (Flat Sales) -->
      ${renderNetPosition(proj)}

      <!-- ESTIMATION CARD -->
      ${typeof Estimation !== 'undefined' ? Estimation.renderCard() : ''}

      <!-- HERO: total spend + health -->
      <div class="m-hero-card">
        <div class="m-hero-eyebrow">${escapeHtml(proj.name)}</div>
        <div class="m-hero-amount">${F.fmtFull(spent)}</div>
        <div class="m-hero-sub">${budget > 0 ? `of ${F.fmtFull(budget)} budget` : 'No budget set'}</div>
        ${budget > 0 ? `
          <div class="m-health-bar"><div class="m-health-fill ${isOver?'over':''}" style="width:${Math.min(100, pct)}%"></div></div>
          <div class="m-health-meta">
            <span>${Math.round(pct)}% used</span>
            <span style="color:${remaining >= 0 ? 'var(--success)' : 'var(--warning)'}">
              ${remaining >= 0 ? F.fmtFull(remaining) + ' left' : F.fmtFull(Math.abs(remaining)) + ' over'}
            </span>
          </div>` : ''}
      </div>

      <!-- STAT ROW -->
      <div class="m-stat-row">
        <div class="m-stat">
          <div class="m-stat-label">Avg Completion</div>
          <div class="m-stat-value">${avgComp}%</div>
        </div>
        <div class="m-stat">
          <div class="m-stat-label">Active Phases</div>
          <div class="m-stat-value">${phaseData.filter(p => (p.completion || 0) > 0 && (p.completion || 0) < 100).length}<span style="font-size:13px;color:var(--text-muted);font-weight:500"> / ${phaseCount}</span></div>
        </div>
      </div>

      <!-- VARIANCE ALERTS -->
      ${variances.length > 0 ? `
        <div class="m-section-title"><svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:middle;margin-right:6px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Variance Alerts <span class="count">${variances.length}</span></div>
        ${variances.slice(0, 3).map(v => `
          <div class="m-alert-card" onclick="App.showPhaseHub(${v.id})">
            <div class="badge">!</div>
            <div class="body">
              <div class="name">${escapeHtml(v.name)}</div>
              <div class="meta">${v.completion}% complete · Phase ${v.id}</div>
            </div>
            <div class="over">+${F.fmt(v.over)}</div>
          </div>
        `).join('')}
      ` : ''}

      <!-- ACTIVE PHASES -->
      <div class="m-section-title">Top Phases by Spend <span class="count">${topPhases.length}</span></div>
      <div class="m-phase-grid">
        ${topPhases.map(ph => {
          const comp = ph.completion || 0;
          return `<button class="m-phase-card" onclick="App.showPhaseHub(${ph.id})">
            <span class="m-phase-card-icon">${Icons.render(ph.icon, 22)}</span>
            <div class="m-phase-card-body">
              <div class="m-phase-card-name">${escapeHtml(ph.name)}</div>
              <div class="m-phase-card-meta">
                <span>${comp}% complete</span>
                <span>·</span>
                <span class="m-phase-card-cost">${F.fmt(ph.total)}</span>
              </div>
              <div class="m-phase-card-progress"><i style="width:${comp}%"></i></div>
            </div>
            <span class="m-phase-card-chev">›</span>
          </button>`;
        }).join('')}
      </div>

      ${renderSubSummary(proj)}

      <!-- PROJECT META -->
      <div class="m-section-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>Project Details</span>
        <button onclick="App.showEditProjectModal()" style="background:none;border:none;color:var(--amber);cursor:pointer;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;font-family:inherit;padding:4px 8px;border-radius:6px;transition:background 0.15s" onmouseover="this.style.background='var(--amber-glow)'" onmouseout="this.style.background=''">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Edit
        </button>
      </div>
      <div class="m-list-group">
        ${detailRow('Client',       proj.client || '—')}
        ${detailRow('Address',      proj.address || '—')}
        ${detailRow('Start Date',   proj.startDate || '—')}
        ${detailRow('Target End',   proj.endDate || '—')}
        ${detailRow('Type',         proj.type || 'residential')}
        ${detailRow('Contingency',  (proj.contingency || 10) + '%')}
      </div>

      <div style="height:80px"></div>
    </div>`;
  }

  function renderNetPosition(proj) {
    const buyers = proj.buyers || [];
    if (!buyers.length) return '';
    const totalReceived = buyers.reduce((s, b) => {
      return s + (b.payments || []).reduce((ps, p) => ps + (parseFloat(p.amount) || 0), 0) + (parseFloat(b.downPayment) || 0);
    }, 0);
    const totalCost = F.computeProjectTotal(proj);
    const net = totalReceived - totalCost;
    const isPositive = net >= 0;
    return `
      <div style="background:linear-gradient(135deg,${isPositive ? 'rgba(168,184,156,0.12)' : 'rgba(199,121,102,0.12)'},transparent);border:1.5px solid ${isPositive ? 'rgba(168,184,156,0.35)' : 'rgba(199,121,102,0.35)'};border-radius:var(--r-lg);padding:16px 20px;margin-bottom:16px;cursor:pointer" onclick="App.showFlatSales()">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--text-muted);margin-bottom:6px">Net Position (Flat Sales / Purchaser)</div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-family:var(--font-mono);font-size:28px;font-weight:800;color:${isPositive ? '#A8B89C' : '#C77966'}">${isPositive ? '+' : ''}${F.fmtFull(net)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Collections ${F.fmt(totalReceived)} − Project Cost ${F.fmt(totalCost)}</div>
          </div>
          <div style="text-align:right;font-size:11px;color:${isPositive ? '#A8B89C' : '#C77966'};font-weight:700">${isPositive ? '✓ In Surplus' : '⚠ In Deficit'}</div>
        </div>
      </div>`;
  }

  function detailRow(label, value) {
    return `<div class="m-list-row" style="cursor:default">
      <div class="body">
        <div class="label" style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700">${escapeHtml(label)}</div>
        <div class="desc" style="color:var(--text);font-size:14px;font-weight:600;margin-top:2px">${escapeHtml(value)}</div>
      </div>
    </div>`;
  }

  function renderSubSummary(proj) {
    const subs = proj.subcontractors || [];
    if (!subs.length) return '';
    const contracted = subs.reduce((s, x) => s + F.parseNum(x.contract), 0);
    const paid = subs.reduce((s, x) => s + F.parseNum(x.paid), 0);
    const owed = contracted - paid;
    return `
      <div class="m-section-title">Subcontractors <span class="count">${subs.length}</span></div>
      <div class="m-stat-row" style="grid-template-columns:repeat(auto-fit,minmax(100px,1fr))">
        <div class="m-stat"><div class="m-stat-label">Contracted</div><div class="m-stat-value" style="font-size:15px">${F.fmt(contracted)}</div></div>
        <div class="m-stat"><div class="m-stat-label">Paid</div><div class="m-stat-value success" style="font-size:15px">${F.fmt(paid)}</div></div>
        <div class="m-stat"><div class="m-stat-label">Owed</div><div class="m-stat-value ${owed > 0 ? 'danger' : 'success'}" style="font-size:15px">${F.fmt(owed)}</div></div>
      </div>`;
  }

  // ── Live reactivity: refresh dashboard when data changes ──
  // The dashboard re-renders itself when App emits data:changed,
  // but only if it's the currently visible view (App handles this).
  // We also export a lightweight updater for targeted DOM patches.

  function refreshStats() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    // Quick-patch specific elements without full re-render
    const total = F.computeProjectTotal(proj);
    const budget = proj.totalBudget || 0;
    const spent = total;
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(150, (spent / budget) * 100) : 0;

    // These elements may or may not exist depending on current view
    const healthFill = document.querySelector('.m-health-fill');
    if (healthFill) healthFill.style.width = Math.min(100, pct) + '%';
    const healthMeta = document.querySelector('.m-health-meta');
    if (healthMeta) {
      const spans = healthMeta.querySelectorAll('span');
      if (spans[0]) spans[0].textContent = Math.round(pct) + '% used';
      if (spans[1]) spans[1].textContent = remaining >= 0 ? F.fmtFull(remaining) + ' left' : F.fmtFull(Math.abs(remaining)) + ' over';
    }
  }

  return { render, refreshStats };
})();
