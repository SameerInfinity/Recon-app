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

    if (typeof html2pdf === 'undefined') {
      App.toast('PDF library not loaded yet. Please wait...', 'warning');
      return;
    }

    const total = F.computeProjectTotal(proj);
    const budgetPct = proj.totalBudget > 0 ? Math.round((total / proj.totalBudget) * 100) : 0;
    const budgetStatus = total > proj.totalBudget && proj.totalBudget > 0 ? 'OVER BUDGET' : 'Within Budget';
    const budgetColor = total > proj.totalBudget && proj.totalBudget > 0 ? '#C77966' : '#A8B89C';

    const container = document.createElement('div');
    container.innerHTML = `
      <style>
        .pdf-wrap { font-family: 'Barlow', sans-serif; padding: 20px; color: #1C1F26; background: white; font-size: 12px; line-height: 1.5; }
        .pdf-wrap * { box-sizing: border-box; }
        .pdf-wrap .header { border-bottom: 3px solid #705748; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
        .pdf-wrap .header-left h1 { font-size: 24px; font-weight: 900; color: #1B1B1E; letter-spacing: .04em; margin: 0; }
        .pdf-wrap .header-left h2 { font-size: 16px; font-weight: 700; color: #705748; margin: 4px 0 0 0; }
        .pdf-wrap .header-left p { font-size: 11px; color: #6B7280; margin: 4px 0 0 0; }
        .pdf-wrap .header-right { text-align: right; }
        .pdf-wrap .header-right .total-label { font-size: 9px; color: #6B7280; text-transform: uppercase; letter-spacing: .1em; }
        .pdf-wrap .header-right .total-val { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 700; color: #9E7758; margin-top: 2px; }
        .pdf-wrap .header-right .budget-info { font-size: 10px; color: #6B7280; margin-top: 4px; }
        .pdf-wrap .budget-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; }
        .pdf-wrap table { width: 100%; border-collapse: collapse; margin-bottom: 24px; page-break-inside: auto; }
        .pdf-wrap tr { page-break-inside: avoid; page-break-after: auto; }
        .pdf-wrap th { text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #4A4240; border-bottom: 2px solid #705748; background: #F5EBDD; }
        .pdf-wrap th.right { text-align: right; }
        .pdf-wrap td { padding: 8px 10px; border-bottom: 1px solid #EDE8DF; font-size: 11px; }
        .pdf-wrap td.mono { font-family: 'JetBrains Mono', monospace; }
        .pdf-wrap td.right { text-align: right; }
        .pdf-wrap tr.total-row { background: #705748; color: #ECD1B4; }
        .pdf-wrap tr.total-row td { border-bottom: none; font-weight: 900; font-size: 13px; }
        .pdf-wrap tr.total-row td.mono { color: #705748; font-size: 15px; }
        .pdf-wrap .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #6B7280; margin: 24px 0 10px; padding-top: 16px; border-top: 1px solid #EDE8DF; page-break-after: avoid; }
        .pdf-wrap .section-title:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }
        .pdf-wrap .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #EDE8DF; font-size: 9px; color: #9CA3AF; display: flex; justify-content: space-between; }
        .pdf-wrap .stat-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .pdf-wrap .stat-box { border: 1px solid #EDE8DF; border-radius: 6px; padding: 12px; }
        .pdf-wrap .stat-box .label { font-size: 9px; color: #6B7280; text-transform: uppercase; letter-spacing: .1em; }
        .pdf-wrap .stat-box .value { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: #9E7758; margin-top: 4px; }
        .pdf-wrap .badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 700; }
        .pdf-wrap .badge-paid { background: #DDE5D2; color: #5A6B3F; }
        .pdf-wrap .badge-partial { background: #C8D3D9; color: #4A5C66; }
        .pdf-wrap .badge-pending { background: #E8C7BC; color: #8B4A3D; }
      </style>
      <div class="pdf-wrap">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <h1>ARCONZA</h1>
            <h2>${escapeHtml(proj.name)}</h2>
            <p>${escapeHtml(proj.address || '')} ${proj.client ? '· Client: ' + escapeHtml(proj.client) : ''}</p>
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
            <div class="value" style="color:${total > proj.totalBudget && proj.totalBudget > 0 ? '#C77966' : '#9E7758'}">${F.fmtFull(total)}</div>
          </div>
          <div class="stat-box">
            <div class="label">Avg Completion</div>
            <div class="value">${Math.round(proj.phases.reduce((s,p)=>s+(p.completion||0),0) / (proj.phases.length || 1))}%</div>
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
                <td style="font-weight:600">${escapeHtml(ph.name)}</td>
                <td class="right">${ph.completion}%</td>
                <td class="mono right" style="font-weight:700;color:#9E7758">${F.fmtFull(phTotal)}</td>
                <td class="right" style="color:#6B7280">${pct}%</td>
              </tr>`;
            }).join('')}
            <tr class="total-row">
              <td>TOTAL</td>
              <td class="right">${Math.round(proj.phases.reduce((s,p)=>s+(p.completion||0),0) / (proj.phases.length || 1))}%</td>
              <td class="mono right">${F.fmtFull(total)}</td>
              <td class="right">100%</td>
            </tr>
          </tbody>
        </table>

        ${renderSubPDF(proj)}
        ${renderPunchPDF(proj)}
        ${renderVendorPDF(proj)}
        ${renderWorkerPDF(proj)}
        ${renderInventoryPDF(proj)}

        <div class="footer">
          <span>Generated by ARCONZA · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span>Confidential — ${escapeHtml(proj.name || '')}</span>
        </div>
      </div>
    `;

    App.toast('Generating PDF...', 'info');

    const opt = {
      margin:       10,
      filename:     `ARCONZA_${proj.name.replace(/[^a-z0-9]/gi, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).output('blob').then(function(blob) {
      const file = new File([blob], opt.filename, { type: "application/pdf" });
      
      // Try using the Web Share API (native share dialog on mobile/macOS)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          title: `ARCONZA Report - ${proj.name}`,
          text: `Here is the latest project report for ${proj.name}.`,
          files: [file]
        }).catch(err => {
          console.warn('[Export] Share cancelled or failed:', err);
          // Fallback to download on error if they just canceled? Better to not force download if they aborted.
        });
        App.toast('Share dialog opened', 'success');
      } else {
        // Fallback: Download the file automatically
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = opt.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        App.toast('PDF downloaded successfully', 'success');
      }
    }).catch(err => {
      console.error('[Export] PDF generation error:', err);
      App.toast('Failed to generate PDF', 'error');
    });
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
              <td class="mono right" style="color:#5A6B3F">${F.fmtFull(paid)}</td>
              <td class="mono right" style="color:${bal > 0 ? '#8B4A3D' : '#5A6B3F'}">${F.fmtFull(bal)}</td>
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
      ['ARCONZA — Project Financial Ledger'],
      [''],
      ['Project:', proj.name],
      ['Address:', escapeHtml(proj.address || '')],
      ['Client:', escapeHtml(proj.client || '')],
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

  // ── Vendor Outstanding Balance Sheet ──────────────────────
  function renderVendorPDF(proj) {
    const vendors = proj.vendors || [];
    if (!vendors.length) return '';
    const rows = vendors.map(v => {
      const debit = (v.transactions || []).filter(t => t.type === 'debit').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
      const credit = (v.transactions || []).filter(t => t.type === 'credit').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
      const balance = debit - credit;
      const color = balance > 0 ? '#C77966' : '#5A6B3F';
      return `<tr>
        <td style="font-weight:600">${v.name || '—'}</td>
        <td class="right">${v.phone || '—'}</td>
        <td class="mono right">${F.fmtFull(debit)}</td>
        <td class="mono right">${F.fmtFull(credit)}</td>
        <td class="mono right" style="font-weight:700;color:${color}">${balance >= 0 ? '' : ''}${F.fmtFull(Math.abs(balance))} ${balance > 0 ? '(Due)' : '(Advance)'}</td>
      </tr>`;
    }).join('');
    const totalDue = vendors.reduce((s,v) => {
      const d = (v.transactions||[]).filter(t=>t.type==='debit').reduce((ss,t)=>ss+(parseFloat(t.amount)||0),0);
      const c = (v.transactions||[]).filter(t=>t.type==='credit').reduce((ss,t)=>ss+(parseFloat(t.amount)||0),0);
      return s + Math.max(0, d - c);
    }, 0);
    return `
      <div class="section-title">Vendor Outstanding Balance Sheet</div>
      <table>
        <thead><tr>
          <th>Vendor</th><th class="right">Contact</th>
          <th class="right">Total Billed</th><th class="right">Total Paid</th><th class="right">Balance</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total-row">
          <td colspan="4">Total Outstanding</td>
          <td class="mono right">${F.fmtFull(totalDue)}</td>
        </tr></tfoot>
      </table>`;
  }

  // ── Worker Wage Summary ────────────────────────────────────
  function renderWorkerPDF(proj) {
    const workers = proj.workers || [];
    if (!workers.length) return '';
    const rows = workers.map(w => {
      const totalWages = (w.wageEntries || []).reduce((s, e) => s + (parseFloat(e.amount)||0), 0);
      const totalPaid  = (w.wageEntries || []).filter(e => e.paid).reduce((s, e) => s + (parseFloat(e.amount)||0), 0);
      const outstanding = totalWages - totalPaid;
      const color = outstanding > 0 ? '#C77966' : '#5A6B3F';
      return `<tr>
        <td style="font-weight:600">${w.name || '—'}</td>
        <td>${w.role || '—'}</td>
        <td class="mono right">${F.fmtFull(totalWages)}</td>
        <td class="mono right">${F.fmtFull(totalPaid)}</td>
        <td class="mono right" style="font-weight:700;color:${color}">${F.fmtFull(outstanding)}</td>
      </tr>`;
    }).join('');
    const totalOut = workers.reduce((s, w) => {
      const tw = (w.wageEntries||[]).reduce((ss,e)=>ss+(parseFloat(e.amount)||0),0);
      const tp = (w.wageEntries||[]).filter(e=>e.paid).reduce((ss,e)=>ss+(parseFloat(e.amount)||0),0);
      return s + Math.max(0, tw - tp);
    }, 0);
    return `
      <div class="section-title">Worker Wage Summary</div>
      <table>
        <thead><tr>
          <th>Worker</th><th>Role</th>
          <th class="right">Total Wages</th><th class="right">Paid</th><th class="right">Outstanding</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total-row">
          <td colspan="4">Total Outstanding Wages</td>
          <td class="mono right">${F.fmtFull(totalOut)}</td>
        </tr></tfoot>
      </table>`;
  }

  // ── Site Inventory Stock Value ─────────────────────────────
  function renderInventoryPDF(proj) {
    const materials = proj.materials || [];
    if (!materials.length) return '';
    const rows = materials.map(m => {
      const stock = parseFloat(m.currentStock) || 0;
      const inward = parseFloat(m.totalInward) || 0;
      // Estimate unit cost from last inward log if available
      const logs = (m.logs || []).filter(l => l.type === 'inward' && l.unitRate);
      const unitRate = logs.length ? parseFloat(logs[logs.length-1].unitRate) || 0 : 0;
      const stockValue = unitRate > 0 ? stock * unitRate : 0;
      const lowStock = inward > 0 && (stock / inward) < 0.15;
      return `<tr${lowStock ? ' style="background:#FFF5F0"' : ''}>
        <td style="font-weight:600">${m.name || '—'}${lowStock ? ' ⚠' : ''}</td>
        <td class="right">${m.unit || '—'}</td>
        <td class="mono right">${inward}</td>
        <td class="mono right" style="font-weight:700;color:${lowStock?'#C77966':'#1C1F26'}">${stock}</td>
        <td class="mono right">${unitRate ? F.fmtFull(unitRate) : '—'}</td>
        <td class="mono right" style="font-weight:700;color:#9E7758">${stockValue ? F.fmtFull(stockValue) : '—'}</td>
      </tr>`;
    }).join('');
    return `
      <div class="section-title">Site Inventory Stock Report</div>
      <p style="font-size:10px;color:#6B7280;margin-bottom:10px">⚠ = Low Stock (below 15% of total inward). Stock Value = Current Stock × Last Recorded Unit Rate.</p>
      <table>
        <thead><tr>
          <th>Material</th><th class="right">Unit</th>
          <th class="right">Total Inward</th><th class="right">In Stock</th>
          <th class="right">Last Unit Rate</th><th class="right">Est. Stock Value</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  return { exportPDF, exportExcel };
})();
