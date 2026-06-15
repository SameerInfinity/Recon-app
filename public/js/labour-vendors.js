/* ═══════════════════════════════════════════
   LABOUR & VENDORS — Indian Contractor Essentials
   ═══════════════════════════════════════════ */

const LabourVendors = (() => {

  // ── 1. Labour & Attendance (Worker Attendance & Extra Pay) ──
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
          <button class="btn btn-primary" onclick="LabourVendors.showAddLabourModal()" style="margin-left:12px">+ Add Worker</button>
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
    showEditAttendanceModal, saveEditAttendanceLog, deleteAttendanceLog
  };
})();
