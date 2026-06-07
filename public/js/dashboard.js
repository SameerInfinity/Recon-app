/* ═══════════════════════════════════════════
   DASHBOARD.JS — Master Financial Dashboard
   SVG Charts, Phase Breakdown, Variance Alerts
   ═══════════════════════════════════════════ */

const Dashboard = (() => {
  const F = Financial;

  function render() {
    const proj = State.getCurrentProject();
    if (!proj) return '<div style="padding:40px;color:var(--text-muted)">No project loaded</div>';

    const total = F.computeProjectTotal(proj);
    const budget = proj.totalBudget || 0;
    const spent = total;
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

    // Phase data
    const phaseData = proj.phases.map(ph => ({
      ...ph,
      total: F.computePhaseTotal(ph),
    }));

    const maxPhase = Math.max(...phaseData.map(p => p.total), 1);

    // Variance alerts
    const phaseCount = Math.max(1, proj.phases.length);
    const fairShare = budget / phaseCount;
    const variances = phaseData
      .filter(ph => budget > 0 && ph.total > fairShare)
      .map(ph => ({ ...ph, over: ph.total - fairShare }));

    return `
    <div class="phase-workspace active">
      <div class="phase-header">
        <div class="phase-title-block">
          <div class="phase-title">${Phases.iconFor('dashboard', 24)} <span style="margin-left:8px">Project Dashboard</span></div>
          <div class="phase-subtitle">${proj.name} — Financial Overview</div>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="dashboard-grid">
        <div class="stat-card">
          <div class="stat-card-label">Total Budget</div>
          <div class="stat-card-value">${F.fmtFull(budget)}</div>
          <div class="stat-card-sub">Set at project creation</div>
        </div>
        <div class="stat-card" style="border-color:${spent > budget && budget > 0 ? 'rgba(239,68,68,0.3)' : 'var(--charcoal-border)'}">
          <div class="stat-card-label">Total Spent</div>
          <div class="stat-card-value" style="color:${spent > budget && budget > 0 ? 'var(--warning)' : 'var(--steel-light)'}">${F.fmtFull(spent)}</div>
          <div class="stat-card-sub">${budget > 0 ? Math.round(pct) + '% of budget used' : 'No budget set'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">${remaining >= 0 ? 'Remaining' : 'Over Budget'}</div>
          <div class="stat-card-value" style="color:${remaining >= 0 ? 'var(--success)' : 'var(--warning)'}">${F.fmtFull(Math.abs(remaining))}</div>
          <div class="stat-card-sub">${budget > 0 ? (remaining >= 0 ? 'Available to spend' : `${Phases.iconFor('alert', 11)} Budget exceeded`) : 'Set a budget to track'}</div>
        </div>
      </div>

      <!-- Budget Donut + Phase Breakdown -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="dashboard-chart-card">
          <div class="dashboard-chart-title">Budget Utilization</div>
          <div class="donut-container">
            ${renderDonut(pct, spent, budget)}
            <div class="donut-legend">
              <div class="donut-legend-item">
                <div class="donut-legend-dot" style="background:var(--amber)"></div>
                <span>Spent: ${F.fmtFull(spent)}</span>
              </div>
              <div class="donut-legend-item">
                <div class="donut-legend-dot" style="background:var(--charcoal-border)"></div>
                <span>Remaining: ${F.fmtFull(Math.max(0, remaining))}</span>
              </div>
              <div class="donut-legend-item" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--charcoal-border)">
                <div class="donut-legend-dot" style="background:var(--steel)"></div>
                <span>Avg completion: ${Math.round(proj.phases.reduce((s,p) => s + p.completion, 0) / Math.max(1, proj.phases.length))}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="dashboard-chart-card">
          <div class="dashboard-chart-title">Cost Type Breakdown</div>
          ${renderCostTypeBar(spent)}
        </div>
      </div>

      <!-- Phase Breakdown -->
      <div class="dashboard-chart-card">
        <div class="dashboard-chart-title">Phase-by-Phase Cost Breakdown</div>
        ${phaseData.map(ph => `
          <div class="phase-bar-row" onclick="App.showPhase(${ph.id})">
            <span class="phase-bar-label">${ph.icon} ${ph.name}</span>
            <div class="phase-bar-outer">
              <div class="phase-bar-fill" style="width:${maxPhase > 0 ? (ph.total / maxPhase * 100) : 0}%"></div>
            </div>
            <span class="phase-bar-value">${F.fmtFull(ph.total)}</span>
          </div>
        `).join('')}
      </div>

      ${variances.length > 0 ? `
      <!-- Variance Alerts -->
      <div class="dashboard-chart-card" style="border-color:rgba(239,68,68,0.15)">
        <div class="dashboard-chart-title" style="color:var(--warning);display:inline-flex;gap:6px;align-items:center">${Phases.iconFor('alert', 14)} Variance Alerts</div>
        ${variances.map(v => `
          <div class="variance-card" onclick="App.showPhase(${v.id})">
            <div>
              <span class="variance-label">${v.icon} ${v.name}</span>
              <span style="font-size:11px;color:var(--text-muted);margin-left:8px">Phase ${v.id}</span>
            </div>
            <span class="variance-amount">+${F.fmtFull(v.over)} over</span>
          </div>
        `).join('')}
      </div>` : ''}

      <!-- Subcontractor Summary -->
      ${renderSubSummary(proj)}

      <!-- Project Info -->
      <div class="dashboard-chart-card" style="margin-bottom:40px">
        <div class="dashboard-chart-title">Project Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="font-size:12px;color:var(--text-muted)">Client: <span style="color:var(--text-secondary);font-weight:500">${proj.client || '—'}</span></div>
          <div style="font-size:12px;color:var(--text-muted)">Address: <span style="color:var(--text-secondary);font-weight:500">${proj.address || '—'}</span></div>
          <div style="font-size:12px;color:var(--text-muted)">Start Date: <span style="color:var(--text-secondary);font-weight:500">${proj.startDate || '—'}</span></div>
          <div style="font-size:12px;color:var(--text-muted)">Target End: <span style="color:var(--text-secondary);font-weight:500">${proj.endDate || '—'}</span></div>
          <div style="font-size:12px;color:var(--text-muted)">Type: <span style="color:var(--text-secondary);font-weight:500">${proj.type || 'residential'}</span></div>
          <div style="font-size:12px;color:var(--text-muted)">Contingency: <span style="color:var(--text-secondary);font-weight:500">${proj.contingency || 10}%</span></div>
        </div>
      </div>
    </div>`;
  }

  function renderDonut(pct, spent, budget) {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const filled = (pct / 100) * circumference;
    const empty = circumference - filled;
    const color = pct > 100 ? 'var(--warning)' : pct > 85 ? '#D9B68E' : 'var(--amber)';

    return `
    <svg class="donut-svg" viewBox="0 0 160 160">
      <!-- Background ring -->
      <circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--charcoal-border)" stroke-width="14" />
      <!-- Filled ring -->
      <circle cx="80" cy="80" r="${radius}" fill="none" stroke="${color}" stroke-width="14"
        stroke-dasharray="${filled} ${empty}"
        stroke-dashoffset="${circumference * 0.25}"
        stroke-linecap="round"
        style="transition: stroke-dasharray 1s var(--ease-out);" />
      <!-- Center text -->
      <text x="80" y="74" text-anchor="middle" class="donut-center-text" style="font-size:24px;font-weight:700">${Math.round(pct)}%</text>
      <text x="80" y="94" text-anchor="middle" style="font-size:10px;fill:var(--text-muted);font-family:var(--font-body)">of budget</text>
    </svg>`;
  }

  function renderCostTypeBar(total) {
    const types = [
      { label: 'Materials', pct: 55, color: 'var(--amber)' },
      { label: 'Labor', pct: 35, color: 'var(--steel-light)' },
      { label: 'Equipment', pct: 7, color: 'var(--purple)' },
      { label: 'Permits & Fees', pct: 3, color: 'var(--success)' },
    ];

    return `
    <div style="margin:16px 0">
      <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin-bottom:16px">
        ${types.map(t => `<div style="width:${t.pct}%;background:${t.color};transition:width 0.6s var(--ease-out)" title="${t.label}: ${t.pct}%"></div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${types.map(t => `
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)">
            <div style="width:10px;height:10px;border-radius:3px;background:${t.color};flex-shrink:0"></div>
            <span>${t.label}</span>
            <span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${t.pct}%</span>
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--steel-light)">${F.fmt(total * t.pct / 100)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  function renderSubSummary(proj) {
    const subs = proj.subcontractors || [];
    if (!subs.length) return '';

    const totalContract = subs.reduce((s, sub) => s + F.parseNum(sub.contract), 0);
    const totalPaid = subs.reduce((s, sub) => s + F.parseNum(sub.paid), 0);
    const totalOwed = totalContract - totalPaid;

    return `
    <div class="dashboard-chart-card">
      <div class="dashboard-chart-title">Subcontractor Payment Summary</div>
      <div class="dashboard-grid" style="margin-bottom:0">
        <div class="stat-card" style="padding:12px 14px">
          <div class="stat-card-label">Total Contracted</div>
          <div class="stat-card-value" style="font-size:18px">${F.fmtFull(totalContract)}</div>
        </div>
        <div class="stat-card" style="padding:12px 14px">
          <div class="stat-card-label">Total Paid</div>
          <div class="stat-card-value" style="font-size:18px;color:var(--success)">${F.fmtFull(totalPaid)}</div>
        </div>
        <div class="stat-card" style="padding:12px 14px">
          <div class="stat-card-label">Outstanding</div>
          <div class="stat-card-value" style="font-size:18px;color:${totalOwed > 0 ? '#D9B68E' : 'var(--success)'}">${F.fmtFull(totalOwed)}</div>
        </div>
      </div>
    </div>`;
  }

  return { render };
})();
