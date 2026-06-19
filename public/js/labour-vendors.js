/* ═══════════════════════════════════════════
   LABOUR & VENDORS — Indian Contractor Essentials
   ═══════════════════════════════════════════ */

const LabourVendors = (() => {

  // ── 1. Labour & Attendance (Worker Attendance & Extra Pay) ──
  function renderLabourHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '';

    const labourList = proj.labour || [];
    const totalKharchi = (proj.labourLogs || []).reduce((sum, log) => sum + Number(log.kharchi || 0), 0);
    const totalOutstanding = labourList.reduce((sum, l) => sum + Number(l.balance || 0), 0);

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <div>
            <h2 class="hub-title">Worker Attendance</h2>
            <p class="hub-subtitle">Manage daily attendance and extra pay (advances) for your workforce.</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right: 12px">
            <span class="phase-pct">Total Extra Pay: ${Financial.fmt(totalKharchi)}</span>
          </div>
          <div class="phase-chip">
            <span class="phase-pct">Outstanding: ${Financial.fmt(totalOutstanding)}</span>
          </div>
          <button class="btn btn-secondary" onclick="LabourVendors.showMusterRollModal()" style="margin-left:12px">${Icons.render('listChecks', 14)} Daily Muster</button>
          <button class="btn btn-primary" onclick="LabourVendors.showWageSummaryModal()" style="margin-left:8px">${Icons.render('fileText', 14)} Wage Slip</button>
          <button class="btn btn-primary" onclick="LabourVendors.showAddLabourModal()" style="margin-left:8px">+ Add Worker</button>
        </div>
      </div>
      <div class="cards-grid">
    `;

    if (labourList.length === 0) {
      html += `
        <div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; border: 1px dashed var(--border); border-radius: 12px;">
          <div style="margin-bottom:12px; color: var(--text-muted)">${Icons.render('userCircle', 36)}</div>
          <p style="color:var(--text-secondary)">No workers added yet.</p>
          <button class="btn btn-secondary" style="margin-top:12px" onclick="LabourVendors.showAddLabourModal()">Add First Worker</button>
        </div>
      `;
    } else {
      labourList.forEach(l => {
        const escName = escapeHtml(l.name);
        const escRole = escapeHtml(l.role);
        const attrId = escapeAttr(l.id);
        html += `
          <div class="category-card" onclick="LabourVendors.showLabourDetails('${attrId}')">
            <div class="cat-card-header">
              <div class="cat-card-icon">${Icons.render('userCircle', 18)}</div>
              <div class="cat-card-title">${escName}</div>
            </div>
            <div class="cat-card-meta">
              <span style="text-transform:capitalize; color:var(--text-muted)">${escRole} · ${Financial.fmt(l.dailyRate)}/day</span>
            </div>
            <div class="cat-card-footer" style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border); display:flex; justify-content:space-between">
              <span style="font-size:12px; color:var(--text-muted)">Balance Due</span>
              <span style="font-family:var(--font-mono); font-weight:700; color:${l.balance > 0 ? '#C77966' : 'var(--text-primary)'};">${Financial.fmt(l.balance)}</span>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    return html;
  }

  // ── FEATURE: Daily Muster Roll ─────────────────────────────────
  function showMusterRollModal() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const labourList = proj.labour || [];
    if (labourList.length === 0) {
      App.toast('Add workers first before marking muster roll', 'warning');
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Build worker rows
    const workerRows = labourList.map(l => {
      const escName = escapeHtml(l.name);
      const escRole = escapeHtml(l.role);
      const attrId = escapeAttr(l.id);
      return `
        <div class="muster-row" id="muster-row-${attrId}" style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border)">
          <div style="flex:1; min-width:0">
            <div style="font-weight:600; font-size:13px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escName}</div>
            <div style="font-size:11px; color:var(--text-muted); text-transform:capitalize">${escRole} · ₹${Financial.fmt(l.dailyRate)}/day</div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0">
            <button class="muster-btn full-btn" data-id="${attrId}" data-status="full"
              onclick="LabourVendors._musterSelect('${attrId}','full')"
              style="padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; border:1.5px solid #5C8A58; background:transparent; color:#5C8A58; transition:all 0.15s">Full</button>
            <button class="muster-btn half-btn" data-id="${attrId}" data-status="half"
              onclick="LabourVendors._musterSelect('${attrId}','half')"
              style="padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; border:1.5px solid #9E7758; background:transparent; color:#9E7758; transition:all 0.15s">Half</button>
            <button class="muster-btn absent-btn" data-id="${attrId}" data-status="absent"
              onclick="LabourVendors._musterSelect('${attrId}','absent')"
              style="padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer; border:1.5px solid #C77966; background:transparent; color:#C77966; transition:all 0.15s">Absent</button>
          </div>
          <input type="number" class="muster-kharchi modal-input" data-id="${attrId}" placeholder="₹ Extra"
            style="width:80px; font-family:var(--font-mono); font-size:12px; padding:6px 8px; flex-shrink:0">
        </div>
      `;
    }).join('');

    App.showModal(`
      <h3 class="modal-title">${Icons.render('listChecks', 18)} Daily Muster Roll</h3>
      <div style="margin-bottom:14px">
        <label class="modal-label">Date</label>
        <input class="modal-input" type="date" id="muster-date" value="${today}" style="font-family:var(--font-mono)">
      </div>
      <div style="max-height:55vh; overflow-y:auto; margin-bottom:16px; padding-right:4px">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:2px solid var(--border); margin-bottom:4px">
          <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Worker</span>
          <div style="display:flex; gap:6px; align-items:center">
            <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Attendance</span>
            <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-left:16px">Extra Pay</span>
          </div>
        </div>
        ${workerRows}
      </div>
      <div style="display:flex; gap:12px; margin-bottom:12px">
        <button onclick="LabourVendors._musterSelectAll('full')" class="modal-btn-cancel" style="flex:1; padding:8px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; font-family:inherit; color:#5C8A58">All Full Day</button>
        <button onclick="LabourVendors._musterSelectAll('absent')" class="modal-btn-cancel" style="flex:1; padding:8px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; font-family:inherit; color:#C77966">All Absent</button>
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.saveMusterRoll()" class="modal-btn-primary" style="flex:2; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Save Muster Roll</button>
      </div>
    `);
  }

  // Internal: highlight selected status button
  function _musterSelect(workerId, status) {
    const row = document.getElementById(`muster-row-${workerId}`);
    if (!row) return;
    // Reset all buttons in this row
    row.querySelectorAll('.muster-btn').forEach(btn => {
      btn.style.background = 'transparent';
      btn.style.color = btn.classList.contains('full-btn') ? '#5C8A58' : btn.classList.contains('half-btn') ? '#9E7758' : '#C77966';
    });
    // Highlight selected
    const sel = row.querySelector(`.${status}-btn`);
    if (sel) {
      sel.style.background = status === 'full' ? '#5C8A58' : status === 'half' ? '#9E7758' : '#C77966';
      sel.style.color = '#fff';
    }
    row.dataset.status = status;
  }

  function _musterSelectAll(status) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    (proj.labour || []).forEach(l => _musterSelect(escapeAttr(l.id), status));
  }

  async function saveMusterRoll() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const musterDate = document.getElementById('muster-date').value;
    if (!musterDate) return App.toast('Date is required', 'error');

    const labourList = proj.labour || [];
    const rows = document.querySelectorAll('.muster-row');
    let savedCount = 0;

    for (const row of rows) {
      const status = row.dataset.status;
      if (!status) continue; // skip unset rows
      const workerId = row.id.replace('muster-row-', '');
      const kharchiEl = row.querySelector('.muster-kharchi');
      const kharchi = parseFloat(kharchiEl?.value) || 0;

      await State.addLabourLog({
        labourId: workerId,
        logDate: musterDate,
        status,
        kharchi,
        notes: 'Muster roll'
      });
      savedCount++;
    }

    App.closeModal();
    if (savedCount > 0) {
      App.toast(`Muster roll saved for ${savedCount} worker${savedCount > 1 ? 's' : ''}`, 'success');
    } else {
      App.toast('No attendance marked — tap Full / Half / Absent for each worker', 'warning');
    }
    App.showLabourHub();
  }

  // ── FEATURE: Monthly Wage Summary ──────────────────────────────
  function showWageSummaryModal() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const labourList = proj.labour || [];
    if (labourList.length === 0) {
      App.toast('No workers added yet', 'warning');
      return;
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    App.showModal(`
      <h3 class="modal-title">${Icons.render('fileText', 18)} Monthly Wage Summary</h3>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px">
        <div>
          <label class="modal-label">Month</label>
          <select class="modal-input" id="wage-month" style="appearance:none;cursor:pointer">
            ${['January','February','March','April','May','June','July','August','September','October','November','December'].map((m,i) =>
              `<option value="${i+1}" ${i+1===currentMonth?'selected':''}>${m}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label class="modal-label">Year</label>
          <input class="modal-input" type="number" id="wage-year" value="${currentYear}" style="font-family:var(--font-mono)">
        </div>
      </div>
      <div id="wage-preview" style="margin-bottom:16px">
        <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px">
          Click Generate to see wage summary
        </div>
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.generateWageSummary()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Generate</button>
        <button id="wage-share-btn" onclick="LabourVendors.shareWageSummary()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit; display:none; background:var(--success)">${Icons.render('share', 14)} Share / Print</button>
      </div>
    `);
  }

  function generateWageSummary() {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const month = parseInt(document.getElementById('wage-month').value);
    const year = parseInt(document.getElementById('wage-year').value);
    const labourList = proj.labour || [];
    const allLogs = proj.labourLogs || [];

    const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][month-1];

    // Filter logs for this month/year
    const monthLogs = allLogs.filter(log => {
      const d = new Date(log.logDate);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    });

    // Group by worker
    const workerData = labourList.map(l => {
      const logs = monthLogs.filter(log => log.labourId === l.id);
      const fullDays = logs.filter(log => log.status === 'full').length;
      const halfDays = logs.filter(log => log.status === 'half').length;
      const absentDays = logs.filter(log => log.status === 'absent').length;
      const totalKharchi = logs.reduce((sum, log) => sum + Number(log.kharchi || 0), 0);
      const grossWage = (fullDays * Number(l.dailyRate)) + (halfDays * Number(l.dailyRate) / 2);
      const netPayable = grossWage - totalKharchi;
      return {
        ...l,
        fullDays, halfDays, absentDays,
        totalKharchi, grossWage, netPayable,
        logsCount: logs.length
      };
    }).filter(w => w.logsCount > 0);

    if (workerData.length === 0) {
      document.getElementById('wage-preview').innerHTML = `
        <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px; border:1px dashed var(--border); border-radius:8px">
          No attendance data found for ${monthName} ${year}
        </div>
      `;
      return;
    }

    const totalGross = workerData.reduce((s,w) => s + w.grossWage, 0);
    const totalKharchi = workerData.reduce((s,w) => s + w.totalKharchi, 0);
    const totalNet = workerData.reduce((s,w) => s + w.netPayable, 0);

    const tableRows = workerData.map(w => `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:10px 8px; font-size:13px; font-weight:600; color:var(--text-primary)">${escapeHtml(w.name)}</td>
        <td style="padding:10px 8px; font-size:12px; color:var(--text-muted); text-transform:capitalize">${escapeHtml(w.role)}</td>
        <td style="padding:10px 8px; text-align:center; font-size:13px; font-family:var(--font-mono); color:#5C8A58">${w.fullDays}</td>
        <td style="padding:10px 8px; text-align:center; font-size:13px; font-family:var(--font-mono); color:#9E7758">${w.halfDays}</td>
        <td style="padding:10px 8px; text-align:right; font-size:13px; font-family:var(--font-mono)">${Financial.fmt(w.grossWage)}</td>
        <td style="padding:10px 8px; text-align:right; font-size:13px; font-family:var(--font-mono); color:#C77966">${w.totalKharchi > 0 ? '-' + Financial.fmt(w.totalKharchi) : '—'}</td>
        <td style="padding:10px 8px; text-align:right; font-size:13px; font-family:var(--font-mono); font-weight:700; color:${w.netPayable >= 0 ? 'var(--text-primary)' : '#C77966'}">${Financial.fmt(w.netPayable)}</td>
      </tr>
    `).join('');

    document.getElementById('wage-preview').innerHTML = `
      <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:12px">
        ${monthName} ${year} — ${proj.name || 'Project'}
      </div>
      <div style="overflow-x:auto; max-height:45vh; overflow-y:auto">
        <table style="width:100%; border-collapse:collapse; font-size:12px">
          <thead style="position:sticky; top:0; background:var(--bg-elev); z-index:1">
            <tr style="border-bottom:2px solid var(--border)">
              <th style="padding:8px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Worker</th>
              <th style="padding:8px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Role</th>
              <th style="padding:8px; text-align:center; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Full</th>
              <th style="padding:8px; text-align:center; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Half</th>
              <th style="padding:8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Gross</th>
              <th style="padding:8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Kharchi</th>
              <th style="padding:8px; text-align:right; font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase">Net Pay</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr style="background:var(--bg-elev-2); border-top:2px solid var(--border)">
              <td colspan="4" style="padding:10px 8px; font-weight:700; font-size:13px">TOTAL</td>
              <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-weight:700">${Financial.fmt(totalGross)}</td>
              <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-weight:700; color:#C77966">${totalKharchi > 0 ? '-' + Financial.fmt(totalKharchi) : '—'}</td>
              <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-weight:700; color:var(--amber)">${Financial.fmt(totalNet)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // Store for sharing
    window._lastWageSummary = { workerData, month, year, monthName, proj, totalGross, totalKharchi, totalNet };

    const shareBtn = document.getElementById('wage-share-btn');
    if (shareBtn) shareBtn.style.display = '';
  }

  function shareWageSummary() {
    const d = window._lastWageSummary;
    if (!d) return;
    const { workerData, monthName, year, proj, totalGross, totalKharchi, totalNet } = d;

    // Build printable HTML
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Wage Summary — ${monthName} ${year}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1C2024; background: #fff; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          h2 { font-size: 14px; color: #6F7680; font-weight: 400; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f4f6f9; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6F7680; border-bottom: 2px solid #e0e3e8; }
          td { padding: 10px 12px; border-bottom: 1px solid #e0e3e8; }
          .mono { font-family: 'Courier New', monospace; }
          .right { text-align: right; }
          .center { text-align: center; }
          .total-row { background: #f4f6f9; font-weight: 700; }
          .project-info { margin-bottom: 24px; padding: 12px 16px; background: #f4f6f9; border-radius: 8px; font-size: 12px; color: #434950; }
          .footer { margin-top: 24px; font-size: 11px; color: #9AA2AC; text-align: center; }
          @media print { body { padding: 12px; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Monthly Wage Summary</h1>
        <h2>${monthName} ${year}</h2>
        <div class="project-info">
          <strong>Project:</strong> ${escapeHtml(proj.name || 'Unnamed Project')}<br>
          <strong>Generated:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <table>
          <thead>
            <tr>
              <th>Worker Name</th>
              <th>Role</th>
              <th class="center">Full Days</th>
              <th class="center">Half Days</th>
              <th class="right">Daily Rate</th>
              <th class="right">Gross Wages</th>
              <th class="right">Kharchi (Advance)</th>
              <th class="right">Net Payable</th>
            </tr>
          </thead>
          <tbody>
            ${workerData.map(w => `
              <tr>
                <td><strong>${escapeHtml(w.name)}</strong></td>
                <td style="text-transform:capitalize; color:#6F7680">${escapeHtml(w.role)}</td>
                <td class="center mono">${w.fullDays}</td>
                <td class="center mono">${w.halfDays}</td>
                <td class="right mono">₹${Number(w.dailyRate).toLocaleString('en-IN')}</td>
                <td class="right mono">₹${w.grossWage.toLocaleString('en-IN', {minimumFractionDigits:0})}</td>
                <td class="right mono" style="color:#A8453D">${w.totalKharchi > 0 ? '₹' + w.totalKharchi.toLocaleString('en-IN') : '—'}</td>
                <td class="right mono"><strong>₹${w.netPayable.toLocaleString('en-IN', {minimumFractionDigits:0})}</strong></td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="5">TOTAL</td>
              <td class="right mono">₹${totalGross.toLocaleString('en-IN', {minimumFractionDigits:0})}</td>
              <td class="right mono" style="color:#A8453D">₹${totalKharchi.toLocaleString('en-IN', {minimumFractionDigits:0})}</td>
              <td class="right mono">₹${totalNet.toLocaleString('en-IN', {minimumFractionDigits:0})}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">Generated by KAKAO Construction · For labour office records</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    const blob = new Blob([printContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');

    // WhatsApp share fallback text
    const waText = `*Wage Summary — ${monthName} ${year}*\n*Project: ${proj.name || 'Project'}*\n\n` +
      workerData.map(w => `👷 *${w.name}* (${w.role})\n  Full: ${w.fullDays}d | Half: ${w.halfDays}d\n  Gross: ₹${w.grossWage.toLocaleString('en-IN')} | Kharchi: ₹${w.totalKharchi.toLocaleString('en-IN')}\n  *Net Pay: ₹${w.netPayable.toLocaleString('en-IN')}*`).join('\n\n') +
      `\n\n*TOTAL NET PAYABLE: ₹${totalNet.toLocaleString('en-IN')}*`;

    if (!win) {
      // Popup blocked — offer WhatsApp share
      const waUrl = `https://wa.me/?text=${encodeURIComponent(waText)}`;
      window.open(waUrl, '_blank');
      App.toast('Popup blocked — opened WhatsApp share instead', 'info');
    }
  }

  // ── Add Worker Modal ─────────────────────────────────────────
  function showAddLabourModal() {
    App.showModal(`
      <h3 class="modal-title">${Icons.render('userCircle', 18)} Add New Worker</h3>
      <div style="margin-bottom:14px">
        <label class="modal-label">Worker Name *</label>
        <input class="modal-input" id="new-labour-name" placeholder="e.g. Ramesh Kumar">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Role</label>
          <select class="modal-input" id="new-labour-role" style="appearance:none;cursor:pointer">
            <option value="mistry">Mistry (Mason/Head)</option>
            <option value="mazdoor" selected>Mazdoor (Helper)</option>
            <option value="painter">Painter</option>
            <option value="plumber">Plumber</option>
            <option value="electrician">Electrician</option>
            <option value="carpenter">Carpenter</option>
            <option value="welder">Welder</option>
          </select>
        </div>
        <div>
          <label class="modal-label">Daily Wage (₹)</label>
          <input class="modal-input" type="number" id="new-labour-rate" placeholder="e.g. 600" style="font-family:var(--font-mono)">
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px">
        <div>
          <label class="modal-label">Phone Number</label>
          <input class="modal-input" id="new-labour-phone" placeholder="10-digit mobile" style="font-family:var(--font-mono)">
        </div>
        <div>
          <label class="modal-label">Advance (₹)</label>
          <input class="modal-input" type="number" id="new-labour-balance" placeholder="0" style="font-family:var(--font-mono)">
        </div>
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.saveNewLabour()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Add Worker</button>
      </div>
    `);
  }

  async function saveNewLabour() {
    const name = document.getElementById('new-labour-name').value.trim();
    if (!name) return App.toast('Name is required', 'error');
    
    const role = document.getElementById('new-labour-role').value;
    const rate = parseFloat(document.getElementById('new-labour-rate').value) || 0;
    const phone = document.getElementById('new-labour-phone').value.trim();
    const balance = parseFloat(document.getElementById('new-labour-balance').value) || 0;

    await State.addLabour({ name, role, dailyRate: rate, phone, balance, active: true });
    App.closeModal();
    App.toast('Worker added successfully', 'success');
    App.showLabourHub();
  }

  function showLabourDetails(id) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const l = (proj.labour || []).find(x => x.id === id);
    if (!l) { App.toast('Worker not found', 'warning'); return; }

    const logs = (proj.labourLogs || []).filter(log => log.labourId === id).sort((a,b) => new Date(b.logDate) - new Date(a.logDate));

    const escName = escapeHtml(l.name);
    const escRole = escapeHtml(l.role);
    const escPhone = escapeHtml(l.phone || 'No Phone');
    const attrId = escapeAttr(l.id);

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <button class="btn btn-secondary" onclick="App.showLabourHub()" style="padding:6px 10px; margin-right:12px; border:none; background:var(--bg-card)">← Back</button>
          <div>
            <h2 class="hub-title">${escName}</h2>
            <p class="hub-subtitle" style="text-transform:capitalize">${escRole} · ${escPhone}</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:12px; background: ${l.balance > 0 ? '#C7796620' : 'var(--bg-card)'}; color: ${l.balance > 0 ? '#C77966' : 'inherit'}">
            <span class="phase-pct">Balance Due: ${Financial.fmt(l.balance)}</span>
          </div>
          <button class="btn btn-secondary" onclick="LabourVendors.showSingleWageSlip('${attrId}')" style="margin-right:8px">${Icons.render('fileText', 14)} Wage Slip</button>
          <button class="btn btn-primary" onclick="LabourVendors.showLogAttendanceModal('${attrId}')">Log Attendance / Extra Pay</button>
        </div>
      </div>

      <div class="section-title" style="margin-top:24px">Attendance & Extra Pay History</div>
      <table class="data-table" style="width:100%; border-collapse:collapse; margin-top:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--border); text-align:left">
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase">Date</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase">Status</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Extra Pay</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase">Notes</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:center; width:80px">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (logs.length === 0) {
      html += `<tr><td colspan="5" style="padding:24px; text-align:center; color:var(--text-muted)">No logs recorded yet.</td></tr>`;
    } else {
      logs.forEach(log => {
        let statusBadge = '';
        if (log.status === 'full') statusBadge = '<span style="background:#DDE5D2; color:#5A6B3F; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600">Full Day</span>';
        else if (log.status === 'half') statusBadge = '<span style="background:#F5EBDD; color:#9E7758; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600">Half Day</span>';
        else statusBadge = '<span style="background:#E8C7BC; color:#8B4A3D; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600">Absent</span>';

        const attrLogId = escapeAttr(log.id);
        const attrWorkerId = escapeAttr(l.id);
        html += `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:12px; font-family:var(--font-mono); font-size:13px">${new Date(log.logDate).toLocaleDateString('en-IN')}</td>
            <td style="padding:12px">${statusBadge}</td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:600; color:#C77966">${log.kharchi > 0 ? '-' + Financial.fmt(log.kharchi) : '—'}</td>
            <td style="padding:12px; font-size:12px; color:var(--text-secondary)">${escapeHtml(log.notes || '—')}</td>
            <td style="padding:12px; text-align:center">
              <button class="btn btn-link" onclick="LabourVendors.showEditAttendanceModal('${attrLogId}', '${attrWorkerId}')" style="padding:2px 6px; color:var(--text-secondary); background:none; border:none; cursor:pointer" title="Edit Log">${Icons.render('pencil', 14)}</button>
              <button class="btn btn-link" onclick="LabourVendors.deleteAttendanceLog('${attrLogId}', '${attrWorkerId}')" style="padding:2px 6px; color:#DC2626; background:none; border:none; cursor:pointer" title="Delete Log">${Icons.render('trash', 14)}</button>
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table>
      <div style="margin-top:40px; text-align:right">
        <button class="btn btn-secondary" onclick="LabourVendors.deleteWorker('${l.id}')" style="color:#DC2626; border-color:#DC262620">Delete Worker</button>
      </div>
    `;

    document.getElementById('content-area').innerHTML = html;
  }

  // Individual wage slip for single worker
  function showSingleWageSlip(workerId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const l = (proj.labour || []).find(x => x.id === workerId);
    if (!l) return;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    App.showModal(`
      <h3 class="modal-title">${Icons.render('fileText', 18)} Wage Slip — ${escapeHtml(l.name)}</h3>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px">
        <div>
          <label class="modal-label">Month</label>
          <select class="modal-input" id="single-wage-month" style="appearance:none;cursor:pointer">
            ${['January','February','March','April','May','June','July','August','September','October','November','December'].map((m,i) =>
              `<option value="${i+1}" ${i+1===currentMonth?'selected':''}>${m}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label class="modal-label">Year</label>
          <input class="modal-input" type="number" id="single-wage-year" value="${currentYear}" style="font-family:var(--font-mono)">
        </div>
      </div>
      <div id="single-wage-preview"></div>
      <div style="display:flex; gap:12px; margin-top:16px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors._generateSingleSlip('${escapeAttr(workerId)}')" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Generate & Print</button>
      </div>
    `);
  }

  function _generateSingleSlip(workerId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const l = (proj.labour || []).find(x => x.id === workerId);
    if (!l) return;

    const month = parseInt(document.getElementById('single-wage-month').value);
    const year = parseInt(document.getElementById('single-wage-year').value);
    const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][month-1];

    const allLogs = (proj.labourLogs || []).filter(log => {
      if (log.labourId !== workerId) return false;
      const d = new Date(log.logDate);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    }).sort((a,b) => new Date(a.logDate) - new Date(b.logDate));

    const fullDays = allLogs.filter(log => log.status === 'full').length;
    const halfDays = allLogs.filter(log => log.status === 'half').length;
    const absentDays = allLogs.filter(log => log.status === 'absent').length;
    const totalKharchi = allLogs.reduce((s, log) => s + Number(log.kharchi || 0), 0);
    const grossWage = (fullDays * Number(l.dailyRate)) + (halfDays * Number(l.dailyRate) / 2);
    const netPayable = grossWage - totalKharchi;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Wage Slip — ${escapeHtml(l.name)} — ${monthName} ${year}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1C2024; background: #fff; max-width: 600px; margin: 0 auto; }
          .header { border-bottom: 2px solid #1C2024; padding-bottom: 16px; margin-bottom: 20px; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .sub { font-size: 13px; color: #6F7680; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
          .info-box { background: #f4f6f9; border-radius: 8px; padding: 12px; }
          .info-label { font-size: 10px; text-transform: uppercase; color: #9AA2AC; font-weight: 700; margin-bottom: 4px; }
          .info-val { font-size: 15px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          th { background: #f4f6f9; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #6F7680; border-bottom: 1.5px solid #e0e3e8; }
          td { padding: 8px 10px; border-bottom: 1px solid #e0e3e8; }
          .right { text-align: right; }
          .total-box { background: #1C2024; color: #fff; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
          .total-label { font-size: 12px; opacity: 0.7; }
          .total-val { font-size: 22px; font-weight: 700; }
          .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #9AA2AC; border-top: 1px solid #e0e3e8; padding-top: 12px; }
          .sig-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .sig-line { border-top: 1.5px solid #1C2024; padding-top: 6px; font-size: 11px; color: #6F7680; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Worker Wage Slip</h1>
          <div class="sub">${monthName} ${year} · ${escapeHtml(proj.name || 'Project')}</div>
        </div>
        <div class="info-grid">
          <div class="info-box">
            <div class="info-label">Worker Name</div>
            <div class="info-val">${escapeHtml(l.name)}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Role</div>
            <div class="info-val" style="text-transform:capitalize">${escapeHtml(l.role)}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Daily Wage Rate</div>
            <div class="info-val">₹${Number(l.dailyRate).toLocaleString('en-IN')}/day</div>
          </div>
          <div class="info-box">
            <div class="info-label">Phone</div>
            <div class="info-val">${escapeHtml(l.phone || '—')}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Attendance</th>
              <th class="right">Day Wages</th>
              <th class="right">Advance/Kharchi</th>
            </tr>
          </thead>
          <tbody>
            ${allLogs.map(log => {
              const dayWage = log.status === 'full' ? Number(l.dailyRate) : log.status === 'half' ? Number(l.dailyRate)/2 : 0;
              return `<tr>
                <td>${new Date(log.logDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</td>
                <td style="text-transform:capitalize">${log.status}</td>
                <td class="right">₹${dayWage.toLocaleString('en-IN')}</td>
                <td class="right" style="color:#A8453D">${log.kharchi > 0 ? '₹' + Number(log.kharchi).toLocaleString('en-IN') : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:#f4f6f9">
              <td>TOTAL</td>
              <td>${fullDays} Full, ${halfDays} Half, ${absentDays} Absent</td>
              <td class="right">₹${grossWage.toLocaleString('en-IN')}</td>
              <td class="right" style="color:#A8453D">₹${totalKharchi.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>
        <div class="total-box">
          <div>
            <div class="total-label">NET PAYABLE</div>
            <div style="font-size:12px; opacity:0.6; margin-top:2px">Gross ₹${grossWage.toLocaleString('en-IN')} − Advance ₹${totalKharchi.toLocaleString('en-IN')}</div>
          </div>
          <div class="total-val">₹${netPayable.toLocaleString('en-IN')}</div>
        </div>
        <div class="sig-area">
          <div><div class="sig-line">Worker Signature / Thumb</div></div>
          <div><div class="sig-line">Contractor / Employer</div></div>
        </div>
        <div class="footer">Generated by KAKAO Construction · For labour office records</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    const blob = new Blob([printContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    App.closeModal();
  }

  function showLogAttendanceModal(labourId) {
    const today = new Date().toISOString().split('T')[0];
    App.showModal(`
      <h3 class="modal-title">${Icons.render('listChecks', 18)} Log Attendance / Extra Pay</h3>
      <input type="hidden" id="log-labour-id" value="${escapeAttr(labourId)}">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Date</label>
          <input class="modal-input" type="date" id="log-date" value="${today}" style="font-family:var(--font-mono)">
        </div>
        <div>
          <label class="modal-label">Attendance Status</label>
          <select class="modal-input" id="log-status" style="appearance:none;cursor:pointer">
            <option value="full">✓ Full Day</option>
            <option value="half">½ Half Day</option>
            <option value="absent">✗ Absent</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label class="modal-label">Extra Pay Given (₹)</label>
        <input class="modal-input" type="number" id="log-kharchi" placeholder="0" style="font-family:var(--font-mono)">
      </div>
      <div style="margin-bottom:20px">
        <label class="modal-label">Notes (Optional)</label>
        <input class="modal-input" id="log-notes" placeholder="e.g. Extra pay for transport, lunch">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.saveAttendanceLog()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Save Log</button>
      </div>
    `);
  }

  async function saveAttendanceLog() {
    const labourId = document.getElementById('log-labour-id').value;
    const logDate = document.getElementById('log-date').value;
    const status = document.getElementById('log-status').value;
    const kharchi = parseFloat(document.getElementById('log-kharchi').value) || 0;
    const notes = document.getElementById('log-notes').value.trim();

    if (!logDate) return App.toast('Date is required', 'error');

    await State.addLabourLog({ labourId, logDate, status, kharchi, notes });
    App.closeModal();
    App.toast('Attendance logged successfully', 'success');
    showLabourDetails(labourId);
  }

  function showEditAttendanceModal(logId, workerId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const log = (proj.labourLogs || []).find(x => x.id === logId);
    if (!log) return;
    
    App.showModal(`
      <h3 class="modal-title">${Icons.render('pencil', 18)} Edit Attendance / Extra Pay</h3>
      <input type="hidden" id="edit-log-id" value="${escapeAttr(logId)}">
      <input type="hidden" id="edit-log-worker-id" value="${escapeAttr(workerId)}">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Date</label>
          <input class="modal-input" type="date" id="edit-log-date" value="${log.logDate}" style="font-family:var(--font-mono)">
        </div>
        <div>
          <label class="modal-label">Attendance Status</label>
          <select class="modal-input" id="edit-log-status" style="appearance:none;cursor:pointer">
            <option value="full" ${log.status === 'full' ? 'selected' : ''}>✓ Full Day</option>
            <option value="half" ${log.status === 'half' ? 'selected' : ''}>½ Half Day</option>
            <option value="absent" ${log.status === 'absent' ? 'selected' : ''}>✗ Absent</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label class="modal-label">Extra Pay Given (₹)</label>
        <input class="modal-input" type="number" id="edit-log-kharchi" value="${escapeAttr(log.kharchi || 0)}" style="font-family:var(--font-mono)">
      </div>
      <div style="margin-bottom:20px">
        <label class="modal-label">Notes (Optional)</label>
        <input class="modal-input" id="edit-log-notes" value="${escapeAttr(log.notes || '')}" placeholder="e.g. Extra pay for transport, lunch">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.saveEditAttendanceLog()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Save Changes</button>
      </div>
    `);
  }

  async function saveEditAttendanceLog() {
    const logId = document.getElementById('edit-log-id').value;
    const workerId = document.getElementById('edit-log-worker-id').value;
    const logDate = document.getElementById('edit-log-date').value;
    const status = document.getElementById('edit-log-status').value;
    const kharchi = parseFloat(document.getElementById('edit-log-kharchi').value) || 0;
    const notes = document.getElementById('edit-log-notes').value.trim();

    if (!logDate) return App.toast('Date is required', 'error');

    await State.updateLabourLog(logId, { logDate, status, kharchi, notes });
    App.closeModal();
    App.toast('Attendance log updated', 'success');
    showLabourDetails(workerId);
  }

  async function deleteAttendanceLog(logId, workerId) {
    App.showConfirmModal({
      icon: Icons.render('trash', 24),
      title: 'Delete Attendance Log?',
      body: 'Are you sure you want to delete this attendance log? The worker\'s balance will be adjusted automatically.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await State.deleteLabourLog(logId);
        App.toast('Log deleted', 'info');
        showLabourDetails(workerId);
      }
    });
  }

  async function deleteWorker(id) {
    App.showConfirmModal({
      icon: Icons.render('userCircle', 24),
      title: 'Delete Worker?',
      body: 'This will permanently delete this worker and all their attendance logs.',
      confirmLabel: 'Delete Worker',
      onConfirm: async () => {
        await State.deleteLabour(id);
        App.toast('Worker deleted', 'info');
        App.showLabourHub();
      }
    });
  }

  return {
    renderLabourHub,
    showAddLabourModal, saveNewLabour,
    showLabourDetails, showLogAttendanceModal, saveAttendanceLog, deleteWorker,
    showEditAttendanceModal, saveEditAttendanceLog, deleteAttendanceLog,
    // New features
    showMusterRollModal, saveMusterRoll,
    _musterSelect, _musterSelectAll,
    showWageSummaryModal, generateWageSummary, shareWageSummary,
    showSingleWageSlip, _generateSingleSlip,
  };
})();
