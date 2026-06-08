/* ═══════════════════════════════════════════
   LABOUR & VENDORS — Indian Contractor Essentials
   ═══════════════════════════════════════════ */

const LabourVendors = (() => {

  // ── 1. Labour & Attendance (Hajiri & Kharchi) ──
  function renderLabourHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '';

    const labourList = proj.labour || [];
    // Ensure we handle defaults gracefully
    const totalKharchi = (proj.labourLogs || []).reduce((sum, log) => sum + Number(log.kharchi || 0), 0);
    const totalOutstanding = labourList.reduce((sum, l) => sum + Number(l.balance || 0), 0);

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <h2 class="hub-title">Labour (Hajiri)</h2>
          <p class="hub-subtitle">Manage daily attendance and Kharchi (advances) for your workforce.</p>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right: 12px">
            <span class="phase-pct">Total Kharchi: ${Financial.fmt(totalKharchi)}</span>
          </div>
          <div class="phase-chip">
            <span class="phase-pct">Outstanding: ${Financial.fmt(totalOutstanding)}</span>
          </div>
          <button class="btn btn-primary" onclick="LabourVendors.showAddLabourModal()" style="margin-left:12px">+ Add Worker</button>
        </div>
      </div>
      <div class="cards-grid">
    `;

    if (labourList.length === 0) {
      html += `
        <div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; border: 1px dashed var(--border); border-radius: 12px;">
          <div style="font-size:32px; margin-bottom:12px; color: var(--text-muted)">👷</div>
          <p style="color:var(--text-secondary)">No workers added yet.</p>
          <button class="btn btn-secondary" style="margin-top:12px" onclick="LabourVendors.showAddLabourModal()">Add First Worker</button>
        </div>
      `;
    } else {
      labourList.forEach(l => {
        html += `
          <div class="category-card" onclick="LabourVendors.showLabourDetails('${l.id}')">
            <div class="cat-card-header">
              <div class="cat-card-icon">${Icons.render('userCircle', 18)}</div>
              <div class="cat-card-title">${l.name}</div>
            </div>
            <div class="cat-card-meta">
              <span style="text-transform:capitalize; color:var(--text-muted)">${l.role} · ${Financial.fmt(l.dailyRate)}/day</span>
            </div>
            <div class="cat-card-footer" style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border); display:flex; justify-content:space-between">
              <span style="font-size:12px; color:var(--text-muted)">Balance Due</span>
              <span style="font-family:var(--font-mono); font-weight:700; color:${l.balance > 0 ? '#C77966' : 'var(--text-primary)'}">${Financial.fmt(l.balance)}</span>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    return html;
  }

  function showAddLabourModal() {
    App.showModal(`
      <h3 style="font-size:17px; font-weight:800; color:#1A1A2E; margin-bottom:20px">👷 Add New Worker</h3>
      <div style="margin-bottom:14px">
        <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Worker Name *</label>
        <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none" id="new-labour-name" placeholder="e.g. Ramesh Kumar">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Role</label>
          <select style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; appearance:none; cursor:pointer" id="new-labour-role">
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
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Daily Wage (₹)</label>
          <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace" type="number" id="new-labour-rate" placeholder="e.g. 600">
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px">
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Phone Number</label>
          <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace" id="new-labour-phone" placeholder="10-digit mobile">
        </div>
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Opening Balance (₹)</label>
          <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace" type="number" id="new-labour-balance" placeholder="0">
        </div>
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" style="flex:1; padding:11px; border:1.5px solid #E5E7EB; background:none; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; color:#6B7280; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.saveNewLabour()" style="flex:1; padding:11px; border:none; background:linear-gradient(135deg,#705748,#9E7758); color:#F5E4CC; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Add Worker</button>
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
    const l = proj.labour.find(x => x.id === id);
    if (!l) return;

    const logs = (proj.labourLogs || []).filter(log => log.labourId === id).sort((a,b) => new Date(b.logDate) - new Date(a.logDate));

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <button class="btn btn-secondary" onclick="App.showLabourHub()" style="padding:6px 10px; margin-right:12px; border:none; background:var(--bg-card)">← Back</button>
          <div>
            <h2 class="hub-title">${l.name}</h2>
            <p class="hub-subtitle" style="text-transform:capitalize">${l.role} · ${l.phone || 'No Phone'}</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:12px; background: ${l.balance > 0 ? '#C7796620' : 'var(--bg-card)'}; color: ${l.balance > 0 ? '#C77966' : 'inherit'}">
            <span class="phase-pct">Balance Due: ${Financial.fmt(l.balance)}</span>
          </div>
          <button class="btn btn-primary" onclick="LabourVendors.showLogAttendanceModal('${l.id}')">Log Attendance / Kharchi</button>
        </div>
      </div>

      <div class="section-title" style="margin-top:24px">Attendance & Kharchi History</div>
      <table class="data-table" style="width:100%; border-collapse:collapse; margin-top:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--border); text-align:left">
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase">Date</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase">Status</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Kharchi (Advance)</th>
            <th style="padding:12px; color:var(--text-muted); font-size:11px; text-transform:uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (logs.length === 0) {
      html += `<tr><td colspan="4" style="padding:24px; text-align:center; color:var(--text-muted)">No logs recorded yet.</td></tr>`;
    } else {
      logs.forEach(log => {
        let statusBadge = '';
        if (log.status === 'full') statusBadge = '<span style="background:#DDE5D2; color:#5A6B3F; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600">Full Day</span>';
        else if (log.status === 'half') statusBadge = '<span style="background:#F5EBDD; color:#9E7758; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600">Half Day</span>';
        else statusBadge = '<span style="background:#E8C7BC; color:#8B4A3D; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600">Absent</span>';

        html += `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:12px; font-family:var(--font-mono); font-size:13px">${new Date(log.logDate).toLocaleDateString('en-IN')}</td>
            <td style="padding:12px">${statusBadge}</td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:600; color:#C77966">${log.kharchi > 0 ? '-' + Financial.fmt(log.kharchi) : '—'}</td>
            <td style="padding:12px; font-size:12px; color:var(--text-secondary)">${log.notes || '—'}</td>
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

  function showLogAttendanceModal(labourId) {
    const today = new Date().toISOString().split('T')[0];
    App.showModal(`
      <h3 style="font-size:17px; font-weight:800; color:#1A1A2E; margin-bottom:20px">📋 Log Attendance / Kharchi</h3>
      <input type="hidden" id="log-labour-id" value="${labourId}">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Date</label>
          <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace" type="date" id="log-date" value="${today}">
        </div>
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Attendance Status</label>
          <select style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; appearance:none; cursor:pointer" id="log-status">
            <option value="full">✓ Full Day</option>
            <option value="half">½ Half Day</option>
            <option value="absent">✗ Absent</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Kharchi Given (₹)</label>
        <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace" type="number" id="log-kharchi" placeholder="0">
      </div>
      <div style="margin-bottom:20px">
        <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Notes (Optional)</label>
        <input style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none" id="log-notes" placeholder="e.g. Kharchi for transport, lunch">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" style="flex:1; padding:11px; border:1.5px solid #E5E7EB; background:none; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; color:#6B7280; font-family:inherit">Cancel</button>
        <button onclick="LabourVendors.saveAttendanceLog()" style="flex:1; padding:11px; border:none; background:linear-gradient(135deg,#705748,#9E7758); color:#F5E4CC; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Save Log</button>
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

  async function deleteWorker(id) {
    App.showConfirmModal({
      icon: '👷',
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
    showLabourDetails, showLogAttendanceModal, saveAttendanceLog, deleteWorker
  };
})();
