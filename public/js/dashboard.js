/* ═══════════════════════════════════════════════════════════════
   DASHBOARD.JS — ARCONZA Project Overview
   ─────────────────────────────────────────────────────────────────
   Layout (top → bottom):
     1. Sync banner (if local / unsynced)
     2. Low-stock alert (if any)
     3. Net Position card (Flat/Shop Purchaser)
     4. Estimation card (collapsible)
     5. Hero: total spend + budget health bar
     6. Stat row: Avg Completion · Active Phases · Vendor Udhaar · Bills
     7. Variance Alerts (if any phase exceeds fair-share)
     8. ── NEW: Cost Breakdown donut (Material vs Labour vs Extra vs Bills)
     9. ── NEW: Phase Progress grid (mini progress bars, tap to drill)
    10. ── NEW: Vendor Khata snapshot (total udhaar, top vendors)
    11. ── NEW: Labour & Inventory quick stats
    12. Subcontractor summary (if any)
    13. Project Details (editable)
    14. ── NEW: Recents feed (latest entries, bills, photos, vendor txns)
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
    const visiblePhases = phaseData.filter(p => !p.hidden);
    const sortedPhases = [...visiblePhases].sort((a, b) => b.total - a.total);

    // Low-stock detection
    const materials = proj.materials || [];
    const lowStockItems = materials.filter(m => {
      const inward = parseFloat(m.totalInward) || 0;
      const stock = parseFloat(m.currentStock) || 0;
      return inward > 0 && (stock / inward) < 0.15;
    });

    const phaseCount = Math.max(1, visiblePhases.length);
    const fairShare = budget / Math.max(1, phaseData.length);
    const variances = phaseData
      .filter(ph => budget > 0 && ph.total > 0 && ph.total > fairShare)
      .map(ph => ({ ...ph, over: ph.total - fairShare }));

    const avgComp = Math.round(visiblePhases.reduce((s, p) => s + (p.completion || 0), 0) / phaseCount);
    const activePhases = visiblePhases.filter(p => (p.completion || 0) > 0 && (p.completion || 0) < 100).length;

    // ── Cost breakdown (Material / Labour / Extra / Bills) ──
    let costBreakdown = { material: 0, labor: 0, extra: 0, bills: 0 };
    try {
      if (typeof Phases !== 'undefined' && Phases._dynamicLaborIds && Phases._dynamicExtraIds) {
        const LABOR_IDS = new Set(Phases._dynamicLaborIds);
        const EXTRA_IDS = new Set(Phases._dynamicExtraIds);
        visiblePhases.forEach(ph => {
          const entries = ph.data?.entries || {};
          Object.entries(entries).forEach(([cardId, arr]) => {
            if (!Array.isArray(arr)) return;
            const cardTotal = arr.reduce((s, e) => s + (parseFloat(e.total) || 0), 0);
            if (LABOR_IDS.has(cardId)) costBreakdown.labor += cardTotal;
            else if (EXTRA_IDS.has(cardId)) costBreakdown.extra += cardTotal;
            else costBreakdown.material += cardTotal;
          });
          const bills = (State.getBills && State.getBills(ph.id)) || [];
          costBreakdown.bills += bills.reduce((s, b) => s + (parseFloat(b.totalAmount) || 0), 0);
        });
      }
    } catch (_) {}

    // ── Vendor Khata snapshot ──
    const vendors = proj.vendors || [];
    const vendorTxns = proj.vendorTransactions || [];
    const totalUdhaar = vendors.reduce((s, v) => s + (parseFloat(v.balance) || 0), 0);
    const topVendors = [...vendors].sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0)).slice(0, 3);

    // ── Bills count ──
    let totalBills = 0;
    visiblePhases.forEach(ph => { totalBills += (State.getBills && State.getBills(ph.id) || []).length; });

    // ── Labour summary ──
    const labourCount = (proj.labour || []).length;
    const labourLogs = proj.labourLogs || [];
    const todayStr = new Date().toISOString().split('T')[0];
    const todayPresent = labourLogs.filter(l => l.logDate === todayStr && l.status === 'full').length;
    const todayAbsent = labourLogs.filter(l => l.logDate === todayStr && l.status === 'absent').length;

    // ── Site photos count ──
    const photoCount = (proj.sitePhotos || []).length;

    // ── RA Bills ──
    const raBills = proj.raBills || [];
    const raTotal = raBills.reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0);

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

      <!-- STAT ROW — 4 quick stats -->
      <div class="m-stat-row" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        <div class="m-stat" onclick="App.showHub('construction')" style="cursor:pointer">
          <div class="m-stat-label">Avg Completion</div>
          <div class="m-stat-value">${avgComp}%</div>
        </div>
        <div class="m-stat" onclick="App.showHub('construction')" style="cursor:pointer">
          <div class="m-stat-label">Active Phases</div>
          <div class="m-stat-value">${activePhases}<span style="font-size:13px;color:var(--text-muted);font-weight:500"> / ${phaseCount}</span></div>
        </div>
        <div class="m-stat" onclick="App.showHub('ledgers');App.setLedgerTab('vendor')" style="cursor:pointer">
          <div class="m-stat-label">Vendor Udhaar</div>
          <div class="m-stat-value" style="color:${totalUdhaar > 0 ? 'var(--warning)' : 'var(--success)'}">${F.fmt(totalUdhaar)}</div>
        </div>
        <div class="m-stat" onclick="App.showConstructionBills()" style="cursor:pointer">
          <div class="m-stat-label">Bills Scanned</div>
          <div class="m-stat-value">${totalBills}</div>
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

      <!-- ════ COST BREAKDOWN ════ -->
      ${renderCostBreakdown(costBreakdown, spent)}

      <!-- ════ PHASE PROGRESS GRID ════ -->
      ${renderPhaseProgress(visiblePhases, budget, fairShare)}

      <!-- ════ VENDOR KHATA SNAPSHOT ════ -->
      ${renderVendorSnapshot(vendors, totalUdhaar, topVendors)}

      <!-- ════ LABOUR & INVENTORY QUICK STATS ════ -->
      ${renderOperationalStats(proj, labourCount, todayPresent, todayAbsent, photoCount, raBills.length, raTotal)}

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

      <!-- ════ RECENTS FEED ════ -->
      ${renderRecents(proj)}

      <div style="height:80px"></div>
    </div>`;
  }

  // ── Cost Breakdown donut chart ──
  function renderCostBreakdown(cb, totalSpent) {
    const grand = cb.material + cb.labor + cb.extra + cb.bills;
    if (grand === 0) return ''; // nothing to show
    const pct = (v) => grand > 0 ? Math.round((v / grand) * 100) : 0;
    const segments = [
      { label: 'Material',  value: cb.material, pct: pct(cb.material), color: '#E8923A' },
      { label: 'Labour',    value: cb.labor,    pct: pct(cb.labor),    color: '#A8B89C' },
      { label: 'Charges',   value: cb.extra,    pct: pct(cb.extra),    color: '#6E94B0' },
      { label: 'Bills',     value: cb.bills,    pct: pct(cb.bills),    color: '#9E7758' },
    ].filter(s => s.value > 0);

    // Conic-gradient donut
    let cumulative = 0;
    const stops = segments.map(s => {
      const start = cumulative;
      cumulative += s.pct;
      return `${s.color} ${start}% ${cumulative}%`;
    }).join(', ');

    return `
      <div class="m-section-title">Cost Breakdown</div>
      <div class="dash-breakdown-card" onclick="App.showHub('construction')" style="cursor:pointer">
        <div class="dash-donut-wrap">
          <div class="dash-donut" style="background: conic-gradient(${stops})">
            <div class="dash-donut-hole">
              <div class="dash-donut-total">${F.fmtFull(grand)}</div>
              <div class="dash-donut-label">Total Spent</div>
            </div>
          </div>
        </div>
        <div class="dash-legend">
          ${segments.map(s => `
            <div class="dash-legend-item">
              <span class="dash-legend-dot" style="background:${s.color}"></span>
              <span class="dash-legend-label">${s.label}</span>
              <span class="dash-legend-pct">${s.pct}%</span>
              <span class="dash-legend-val">${F.fmt(s.value)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // ── Phase Progress grid (mini progress bars) ──
  function renderPhaseProgress(phases, budget, fairShare) {
    const withProgress = phases.filter(p => (p.completion || 0) > 0 || p.total > 0);
    if (withProgress.length === 0) return '';
    return `
      <div class="m-section-title">Phase Progress <span class="count">${withProgress.length}</span></div>
      <div class="dash-phase-grid">
        ${withProgress.map(ph => {
          const comp = ph.completion || 0;
          const isOver = budget > 0 && ph.total > fairShare;
          return `<button class="dash-phase-mini" onclick="App.showPhaseHub(${ph.id})">
            <div class="dash-phase-mini-top">
              <span class="dash-phase-mini-icon">${Icons.render(ph.icon, 16)}</span>
              <span class="dash-phase-mini-name">${escapeHtml(ph.name)}</span>
              <span class="dash-phase-mini-pct">${comp}%</span>
            </div>
            <div class="dash-phase-mini-bar">
              <i style="width:${comp}%; background:${isOver ? 'var(--warning)' : 'linear-gradient(90deg,var(--amber),var(--amber-soft))'}"></i>
            </div>
            <div class="dash-phase-mini-cost">${F.fmt(ph.total)}</div>
          </button>`;
        }).join('')}
      </div>`;
  }

  // ── Vendor Khata snapshot ──
  function renderVendorSnapshot(vendors, totalUdhaar, topVendors) {
    if (vendors.length === 0) return '';
    return `
      <div class="m-section-title">Vendor Khata <span class="count">${vendors.length}</span></div>
      <div class="dash-vendor-card" onclick="App.showHub('ledgers');App.setLedgerTab('vendor')" style="cursor:pointer">
        <div class="dash-vendor-hero">
          <div class="dash-vendor-hero-label">Total Udhaar</div>
          <div class="dash-vendor-hero-amount" style="color:${totalUdhaar > 0 ? 'var(--warning)' : 'var(--success)'}">${F.fmtFull(totalUdhaar)}</div>
          <div class="dash-vendor-hero-sub">${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}${totalUdhaar > 0 ? ' · pending payments' : ' · all cleared'}</div>
        </div>
        ${topVendors.length > 0 && totalUdhaar > 0 ? `
          <div class="dash-vendor-list">
            ${topVendors.map(v => {
              const bal = parseFloat(v.balance) || 0;
              return `<div class="dash-vendor-row">
                <span class="dash-vendor-name">${escapeHtml(v.name)}</span>
                <span class="dash-vendor-amt" style="color:${bal > 0 ? 'var(--warning)' : 'var(--success)'}">${F.fmt(bal)}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
      </div>`;
  }

  // ── Operational stats (Labour, Photos, RA Bills) ──
  function renderOperationalStats(proj, labourCount, todayPresent, todayAbsent, photoCount, raBillCount, raTotal) {
    const hasAnything = labourCount > 0 || photoCount > 0 || raBillCount > 0;
    if (!hasAnything) return '';
    return `
      <div class="m-section-title">Operations</div>
      <div class="dash-ops-grid">
        ${labourCount > 0 ? `
          <div class="dash-ops-card" onclick="App.showHub('ledgers');App.setLedgerTab('labour')" style="cursor:pointer">
            <div class="dash-ops-icon" style="color:var(--amber)">${Icons.render('userCircle', 20)}</div>
            <div class="dash-ops-body">
              <div class="dash-ops-label">Workers</div>
              <div class="dash-ops-value">${labourCount}</div>
              <div class="dash-ops-sub">${todayPresent} present · ${todayAbsent} absent today</div>
            </div>
          </div>` : ''}
        ${photoCount > 0 ? `
          <div class="dash-ops-card" onclick="App.showSitePhotos()" style="cursor:pointer">
            <div class="dash-ops-icon" style="color:#6E94B0">${Icons.render('camera', 20)}</div>
            <div class="dash-ops-body">
              <div class="dash-ops-label">Site Photos</div>
              <div class="dash-ops-value">${photoCount}</div>
              <div class="dash-ops-sub">documented on site</div>
            </div>
          </div>` : ''}
        ${raBillCount > 0 ? `
          <div class="dash-ops-card" onclick="App.showRaBillsHub()" style="cursor:pointer">
            <div class="dash-ops-icon" style="color:#9E7758">${Icons.render('fileText', 20)}</div>
            <div class="dash-ops-body">
              <div class="dash-ops-label">RA Bills</div>
              <div class="dash-ops-value">${raBillCount}</div>
              <div class="dash-ops-sub">${F.fmt(raTotal)} total due</div>
            </div>
          </div>` : ''}
      </div>`;
  }

  // ── Recents feed ──
  function renderRecents(proj) {
    const recents = [];
    // Gather recent entries from all phases
    (proj.phases || []).forEach(ph => {
      if (!ph.data || !ph.data.entries) return;
      Object.entries(ph.data.entries).forEach(([cardId, arr]) => {
        if (!Array.isArray(arr)) return;
        let cardName = cardId;
        if (typeof Phases !== 'undefined' && Phases.getAllCardsForPhase) {
          const allCards = Phases.getAllCardsForPhase(ph.id) || [];
          const found = allCards.find(c => c.id === cardId);
          if (found) cardName = found.name;
        }
        arr.forEach(e => {
          if (e.createdAt) {
            recents.push({
              type: 'entry',
              ts: new Date(e.createdAt).getTime(),
              date: e.date || e.createdAt,
              title: cardName,
              sub: ph.name,
              amount: parseFloat(e.total) || 0,
              onclick: `App.showPhaseHub(${ph.id})`,
              icon: 'listChecks',
            });
          }
        });
      });
    });
    // Recent vendor transactions
    (proj.vendorTransactions || []).forEach(t => {
      if (t.createdAt) {
        const vendor = (proj.vendors || []).find(v => v.id === t.vendorId);
        recents.push({
          type: 'vendor',
          ts: new Date(t.createdAt).getTime(),
          date: t.date || t.createdAt,
          title: vendor ? vendor.name : 'Vendor',
          sub: t.type === 'debit' ? 'Purchase (Udhaar)' : 'Payment',
          amount: parseFloat(t.amount) || 0,
          onclick: `App.showHub('ledgers');App.setLedgerTab('vendor')`,
          icon: 'package',
        });
      }
    });
    // Recent site photos
    (proj.sitePhotos || []).forEach(p => {
      if (p.createdAt) {
        recents.push({
          type: 'photo',
          ts: new Date(p.createdAt).getTime(),
          date: p.takenAt || p.createdAt,
          title: p.name || 'Site Photo',
          sub: p.category || 'photo',
          amount: 0,
          onclick: `App.showSitePhotos()`,
          icon: 'camera',
        });
      }
    });
    // Recent bills
    (proj.phases || []).forEach(ph => {
      (State.getBills && State.getBills(ph.id) || []).forEach(b => {
        if (b.scannedAt || b.createdAt) {
          recents.push({
            type: 'bill',
            ts: new Date(b.scannedAt || b.createdAt).getTime(),
            date: b.date || b.scannedAt || b.createdAt,
            title: b.vendor || 'Bill',
            sub: ph.name + ' · scanned',
            amount: parseFloat(b.totalAmount) || 0,
            onclick: `App.showPhaseBills(${ph.id})`,
            icon: 'fileText',
          });
        }
      });
    });

    // Sort by timestamp descending, take top 8
    recents.sort((a, b) => b.ts - a.ts);
    const recentItems = recents.slice(0, 8);

    if (recentItems.length === 0) return '';

    return `
      <div class="m-section-title">Recent Activity <span class="count">${recents.length}</span></div>
      <div class="dash-recents-list">
        ${recentItems.map(r => `
          <div class="dash-recent-item" onclick="${r.onclick}" style="cursor:pointer">
            <div class="dash-recent-icon">${Icons.render(r.icon, 16)}</div>
            <div class="dash-recent-body">
              <div class="dash-recent-title">${escapeHtml(r.title)}</div>
              <div class="dash-recent-sub">${escapeHtml(r.sub)} · ${_formatRecentDate(r.date)}</div>
            </div>
            ${r.amount > 0 ? `<div class="dash-recent-amount">${F.fmt(r.amount)}</div>` : '<div class="dash-recent-amount" style="color:var(--text-faint)">—</div>'}
          </div>
        `).join('')}
      </div>`;
  }

  function _formatRecentDate(dateStr) {
    if (!dateStr) return '';
    try {
      // M-07: date-only strings (YYYY-MM-DD) are parsed as UTC midnight by the
      // spec, which then drifts back a day in negative-offset timezones. Anchor
      // to local noon by appending T00:00:00 when no 'T' is present.
      const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return diffMin + 'm ago';
      if (diffHr < 24) return diffHr + 'h ago';
      if (diffDay < 7) return diffDay + 'd ago';
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch (_) { return ''; }
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
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--text-muted);margin-bottom:6px">Net Position (Flat / Shop Purchaser)</div>
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

  // ── Live reactivity ──
  function refreshStats() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const total = F.computeProjectTotal(proj);
    const budget = proj.totalBudget || 0;
    const spent = total;
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(150, (spent / budget) * 100) : 0;

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
