/* ═══════════════════════════════════════════
   EXPORT.JS — PDF & Excel Export v2
   Enhanced with line-item details, per-phase
   breakdown, and subcontractor statements
   ═══════════════════════════════════════════ */

const Export = (() => {
  const F = Financial;

  function exportPDF() {
    const proj = State.getCurrentProject();
    if (!proj) { App.toast('No project loaded', 'warning'); return; }

    const total = F.computeProjectTotal(proj);
    const budgetPct = proj.totalBudget > 0 ? Math.round((total / proj.totalBudget) * 100) : 0;
    const budgetStatus = total > proj.totalBudget && proj.totalBudget > 0 ? 'OVER BUDGET' : 'Within Budget';
    const budgetColor = total > proj.totalBudget && proj.totalBudget > 0 ? '#EF4444' : '#34D399';

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Build Manager — ${proj.name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Barlow, sans-serif; padding: 36px 40px; color: #1C1F26; background: white; font-size: 13px; line-height: 1.5; }
          @media print { body { padding: 20px; } @page { margin: 15mm; } }
          .header { border-bottom: 3px solid #007979; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
          .header-left h1 { font-size: 24px; font-weight: 900; color: #1C1F26; letter-spacing: .04em; }
          .header-left h2 { font-size: 16px; font-weight: 700; color: #007979; margin-top: 4px; }
          .header-left p { font-size: 11px; color: #6B7280; margin-top: 4px; }
          .header-right { text-align: right; }
          .header-right .total-label { font-size: 9px; color: #6B7280; text-transform: uppercase; letter-spacing: .1em; }
          .header-right .total-val { font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 700; color: #3A7CBF; }
          .header-right .budget-info { font-size: 11px; color: #6B7280; margin-top: 4px; }
          .budget-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #6B7280; border-bottom: 2px solid #007979; background: #FDF8F3; }
          th.right { text-align: right; }
          td { padding: 8px 10px; border-bottom: 1px solid #EDE8DF; font-size: 12px; }
          td.mono { font-family: 'JetBrains Mono', monospace; }
          td.right { text-align: right; }
          tr.total-row { background: #007979; color: white; }
          tr.total-row td { border-bottom: none; font-weight: 900; font-size: 14px; }
          tr.total-row td.mono { color: #007979; font-size: 16px; }
          .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6B7280; margin: 24px 0 10px; padding-top: 16px; border-top: 1px solid #EDE8DF; }
          .section-title:first-of-type { border-top: none; margin-top: 0; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #EDE8DF; font-size: 9px; color: #9CA3AF; display: flex; justify-content: space-between; }
          .stat-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
          .stat-box { border: 1px solid #EDE8DF; border-radius: 6px; padding: 12px; }
          .stat-box .label { font-size: 9px; color: #6B7280; text-transform: uppercase; letter-spacing: .1em; }
          .stat-box .value { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #3A7CBF; margin-top: 4px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; }
          .badge-paid { background: #D1FAE5; color: #059669; }
          .badge-partial { background: #DBEAFE; color: #2563EB; }
          .badge-pending { background: #FEF3C7; color: #D97706; }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <h1>🏗 BUILD MANAGER</h1>
            <h2>${proj.name}</h2>
            <p>${proj.address || ''} ${proj.client ? '· Client: ' + proj.client : ''}</p>
            ${proj.startDate ? `<p>Timeline: ${proj.startDate} → ${proj.endDate || 'TBD'}</p>` : ''}
          </div>
          <div class="header-right">
            <div class="total-label">Total Project Cost</div>
            <div class="total-val">${F.fmtFull(total)}</div>
            <div class="budget-info">
              Budget: ${F.fmtFull(proj.totalBudget)} · 
              <span class="budget-badge" style="background:${budgetColor}20;color:${budgetColor}">${budgetPct}% · ${budgetStatus}</span>
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="stat-grid">
          <div class="stat-box">
            <div class="label">Total Budget</div>
            <div class="value">${F.fmtFull(proj.totalBudget)}</div>
          </div>
          <div class="stat-box">
            <div class="label">Total Spent</div>
            <div class="value" style="color:${total > proj.totalBudget && proj.totalBudget > 0 ? '#EF4444' : '#3A7CBF'}">${F.fmtFull(total)}</div>
          </div>
          <div class="stat-box">
            <div class="label">Avg Completion</div>
            <div class="value">${Math.round(proj.phases.reduce((s,p)=>s+p.completion,0)/8)}%</div>
          </div>
        </div>

        <!-- Phase Summary -->
        <div class="section-title">Phase Cost Summary</div>
        <table>
          <thead><tr>
            <th>Phase</th><th class="right">Completion</th>
            <th class="right">Phase Total</th><th class="right">% of Project</th>
          </tr></thead>
          <tbody>
            ${proj.phases.map(ph => {
              const phTotal = F.computePhaseTotal(ph);
              const pct = total > 0 ? ((phTotal / total) * 100).toFixed(1) : 0;
              return `
              <tr>
                <td style="font-weight:600">${ph.icon} ${ph.name}</td>
                <td class="right">${ph.completion}%</td>
                <td class="mono right" style="font-weight:700;color:#3A7CBF">${F.fmtFull(phTotal)}</td>
                <td class="right" style="color:#6B7280">${pct}%</td>
              </tr>`;
            }).join('')}
            <tr class="total-row">
              <td>TOTAL</td>
              <td class="right">${Math.round(proj.phases.reduce((s,p)=>s+p.completion,0)/8)}%</td>
              <td class="mono right">${F.fmtFull(total)}</td>
              <td class="right">100%</td>
            </tr>
          </tbody>
        </table>

        ${renderSubPDF(proj)}
        ${renderPunchPDF(proj)}

        <div class="footer">
          <span>Generated by BUILD MANAGER · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span>Confidential — ${proj.name}</span>
        </div>
      </body>
      </html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };

    App.toast('PDF export opened — use Print to save', 'info');
  }

  function renderSubPDF(proj) {
    const subs = proj.subcontractors || [];
    if (!subs.length) return '';
    
    const totalContract = subs.reduce((s, sub) => s + F.parseNum(sub.contract), 0);
    const totalPaid = subs.reduce((s, sub) => s + F.parseNum(sub.paid), 0);

    return `
      <div class="section-title">Subcontractor Ledger</div>
      <table>
        <thead><tr>
          <th>Trade / Company</th><th>Phase</th><th class="right">Contract</th>
          <th class="right">Paid</th><th class="right">Balance</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${subs.map(s => {
            const contract = F.parseNum(s.contract);
            const paid = F.parseNum(s.paid);
            const bal = contract - paid;
            const statusClass = paid >= contract && contract > 0 ? 'badge-paid' : paid > 0 ? 'badge-partial' : 'badge-pending';
            const statusText = paid >= contract && contract > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
            return `
            <tr>
              <td><strong>${s.name || '—'}</strong><br><span style="font-size:10px;color:#6B7280">${s.trade || ''}</span></td>
              <td style="font-size:11px">${s.phase || '—'}</td>
              <td class="mono right">${F.fmtFull(contract)}</td>
              <td class="mono right" style="color:#059669">${F.fmtFull(paid)}</td>
              <td class="mono right" style="color:${bal > 0 ? '#D97706' : '#059669'}">${F.fmtFull(bal)}</td>
              <td><span class="badge ${statusClass}">${statusText}</span></td>
            </tr>`;
          }).join('')}
          <tr class="total-row">
            <td colspan="2">TOTAL</td>
            <td class="mono right">${F.fmtFull(totalContract)}</td>
            <td class="mono right">${F.fmtFull(totalPaid)}</td>
            <td class="mono right">${F.fmtFull(totalContract - totalPaid)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>`;
  }

  function renderPunchPDF(proj) {
    const items = proj.punchItems || [];
    if (!items.length) return '';

    return `
      <div class="section-title">Punch List</div>
      <table>
        <thead><tr>
          <th>ID</th><th>Description</th><th>Location</th>
          <th>Severity</th><th>Status</th><th class="right">Repair Cost</th>
        </tr></thead>
        <tbody>
          ${items.map(p => `
          <tr>
            <td class="mono" style="font-size:11px">${p.id}</td>
            <td>${p.description || '—'}</td>
            <td>${p.room || '—'}</td>
            <td style="font-size:11px">${p.severity || '—'}</td>
            <td style="text-transform:capitalize">${p.status || 'open'}</td>
            <td class="mono right">${p.repair_cost ? F.fmtFull(p.repair_cost) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function exportExcel() {
    const proj = State.getCurrentProject();
    if (!proj) { App.toast('No project loaded', 'warning'); return; }

    const rows = [
      ['BUILD MANAGER — Project Financial Ledger'],
      [''],
      ['Project:', proj.name],
      ['Address:', proj.address || ''],
      ['Client:', proj.client || ''],
      ['Contractor:', proj.contractor || ''],
      ['Total Budget:', proj.totalBudget || 0],
      ['Contingency:', (proj.contingency || 10) + '%'],
      ['Generated:', new Date().toLocaleDateString('en-IN')],
      [''],
      ['═══ PHASE COST SUMMARY ═══'],
      ['Phase', 'Completion %', 'Phase Total (₹)', '% of Project'],
    ];

    const projectTotal = F.computeProjectTotal(proj);

    proj.phases.forEach(ph => {
      const phTotal = F.computePhaseTotal(ph);
      const pct = projectTotal > 0 ? ((phTotal / projectTotal) * 100).toFixed(1) : 0;
      rows.push([ph.name, ph.completion + '%', phTotal, pct + '%']);
    });

    rows.push(['']);
    rows.push(['TOTAL', '', projectTotal, '100%']);
    rows.push(['Budget Utilization', '', projectTotal > 0 && proj.totalBudget > 0 ? Math.round((projectTotal / proj.totalBudget) * 100) + '%' : 'N/A', '']);

    // Phase details
    proj.phases.forEach(ph => {
      const d = ph.data;
      rows.push(['']);
      rows.push([`═══ PHASE ${ph.id}: ${ph.name.toUpperCase()} ═══`]);
      rows.push(['Total:', F.computePhaseTotal(ph), 'Completion:', ph.completion + '%']);
      
      Object.entries(d).forEach(([section, data]) => {
        if (Array.isArray(data)) {
          rows.push(['', `--- ${section} ---`]);
          data.forEach((item, i) => {
            const vals = Object.entries(item).map(([k,v]) => `${k}: ${v}`).join(', ');
            rows.push(['', `  Item ${i+1}: ${vals}`]);
          });
        } else if (typeof data === 'object') {
          rows.push(['', `--- ${section} ---`]);
          Object.entries(data).forEach(([k, v]) => {
            if (typeof v !== 'object') rows.push(['', `  ${k}: ${v}`]);
          });
        }
      });
    });

    if (proj.subcontractors && proj.subcontractors.length > 0) {
      rows.push(['']);
      rows.push(['═══ SUBCONTRACTOR LEDGER ═══']);
      rows.push(['Company', 'Trade', 'Phase', 'Contract Amount', 'Paid', 'Balance', 'Retention %', 'Phone', 'Email', 'Notes']);
      proj.subcontractors.forEach(s => {
        const bal = F.parseNum(s.contract) - F.parseNum(s.paid);
        rows.push([s.name, s.trade, s.phase, s.contract, s.paid, bal, s.retention_pct || 0, s.phone || '', s.email || '', s.notes || '']);
      });
    }

    if (proj.punchItems && proj.punchItems.length > 0) {
      rows.push(['']);
      rows.push(['═══ PUNCH LIST ═══']);
      rows.push(['ID', 'Description', 'Room', 'Severity', 'Status', 'Repair Cost']);
      proj.punchItems.forEach(p => {
        rows.push([p.id, p.description, p.room, p.severity, p.status, p.repair_cost || 0]);
      });
    }

    // Convert to CSV
    const csv = rows.map(r => r.map(cell => {
      const str = String(cell === undefined || cell === null ? '' : cell);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\n');

    // BOM for Excel UTF-8
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.replace(/[^a-z0-9]/gi, '_')}_BuildManager_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    App.toast('Excel/CSV exported with line-item details', 'success');
  }

  return { exportPDF, exportExcel };
})();
