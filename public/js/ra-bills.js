/* ═══════════════════════════════════════════
   RA-BILLS.JS — Running Account Bills
   Generate professional progress-based invoices
   ═══════════════════════════════════════════ */

const RaBills = (() => {

  // ── Hub View ──────────────────────────────────────────────
  function renderRaBillsHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '';

    const bills = (proj.raBills || []).sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
    const totalBilled = bills.reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0);
    const totalPaid = bills.filter(b => b.status === 'paid').reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0);
    const totalPending = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0);

    const statusColor = { draft: '#7B96A3', sent: '#9E7758', paid: '#A8B89C' };
    const statusLabel = { draft: '📝 Draft', sent: '📤 Sent', paid: '✓ Paid' };

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <h2 class="hub-title">RA Bills (Running Account)</h2>
          <p class="hub-subtitle">Generate progress-based invoices for your client.</p>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right: 12px">
            <span class="phase-pct">Billed: ${Financial.fmt(totalBilled)}</span>
          </div>
          <div class="phase-chip" style="margin-right:12px; background:#A8B89C18; color:#A8B89C">
            <span class="phase-pct">Received: ${Financial.fmt(totalPaid)}</span>
          </div>
          ${totalPending > 0 ? `<div class="phase-chip" style="margin-right:12px; background:#C7796618; color:#C77966"><span class="phase-pct">Pending: ${Financial.fmt(totalPending)}</span></div>` : ''}
          <button class="btn btn-primary" onclick="RaBills.showNewRaBillModal()" style="margin-left:8px">+ New RA Bill</button>
        </div>
      </div>
    `;

    if (bills.length === 0) {
      html += `
        <div style="padding:60px 32px; text-align:center; border:1px dashed var(--charcoal-border); border-radius:12px; background:var(--charcoal-mid); margin-top:8px">
          <div style="font-size:40px; margin-bottom:12px">🧾</div>
          <h3 style="color:var(--text-secondary); font-size:16px; font-weight:700; margin-bottom:8px">No RA Bills Yet</h3>
          <p style="color:var(--text-muted); font-size:13px; margin-bottom:20px">Create your first Running Account Bill to invoice the client for work completed so far.</p>
          <button class="btn btn-primary" onclick="RaBills.showNewRaBillModal()">+ Create First RA Bill</button>
        </div>
      `;
    } else {
      html += `<div style="margin-top:16px; display:flex; flex-direction:column; gap:12px">`;
      bills.forEach(b => {
        const color = statusColor[b.status] || '#7B96A3';
        const label = statusLabel[b.status] || b.status;
        html += `
          <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px 24px; display:flex; align-items:center; gap:24px; cursor:pointer; transition:background 0.15s, transform 0.15s" onclick="RaBills.showRaBillDetail('${b.id}')" onmouseover="this.style.background='var(--charcoal-surface)';this.style.transform='translateX(4px)'" onmouseout="this.style.background='var(--charcoal-mid)';this.style.transform=''">
            <div style="flex-shrink:0; text-align:center; min-width:72px">
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em">${b.billNumber}</div>
              <div style="font-size:10px; color:var(--text-muted); margin-top:2px">${b.issueDate ? new Date(b.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</div>
            </div>
            <div style="flex:1; min-width:0">
              <div style="font-weight:700; font-size:14px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${b.workDescription || 'RA Bill'}</div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:3px">${b.percentageComplete}% complete · ${b.dueDate ? 'Due ' + new Date(b.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No due date'}</div>
            </div>
            <div style="text-align:right; flex-shrink:0">
              <div style="font-family:var(--font-mono); font-size:18px; font-weight:800; color:var(--steel-light)">${Financial.fmt(b.amountDue)}</div>
              <div style="display:inline-block; margin-top:4px; padding:2px 10px; border-radius:10px; font-size:10px; font-weight:700; background:${color}20; color:${color}">${label}</div>
            </div>
            <div style="flex-shrink:0">
              <button onclick="event.stopPropagation(); RaBills.generateRaBillPDF('${b.id}')" style="padding:8px 14px; border:1px solid var(--charcoal-border); background:none; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:var(--text-secondary); font-family:inherit; transition:all 0.15s" onmouseover="this.style.background='var(--charcoal-hover)';this.style.color='var(--text-primary)'" onmouseout="this.style.background='none';this.style.color='var(--text-secondary)'">📄 PDF</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    return html;
  }

  // ── New RA Bill Modal ─────────────────────────────────────
  function showNewRaBillModal(editId = null) {
    const proj = State.getCurrentProject();
    if (!proj) return;

    const today = new Date().toISOString().split('T')[0];
    const contractValue = proj.totalBudget || 0;
    const existingBills = proj.raBills || [];
    const prevPaid = existingBills.filter(b => b.status === 'paid').reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0);
    const nextNum = `RA-${String(existingBills.length + 1).padStart(3, '0')}`;

    const edit = editId ? existingBills.find(b => b.id === editId) : null;

    App.showModal(`
      <h3 style="font-size:17px; font-weight:800; color:#1A1A2E; margin-bottom:20px">🧾 ${edit ? 'Edit' : 'New'} Running Account Bill</h3>
      ${edit ? `<input type="hidden" id="ra-edit-id" value="${edit.id}">` : ''}
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Bill Number</label>
          <input type="text" id="ra-billnum" value="${edit ? edit.billNumber : nextNum}" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Issue Date</label>
          <input type="date" id="ra-issue-date" value="${edit ? edit.issueDate : today}" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Work Description *</label>
        <input type="text" id="ra-work-desc" value="${edit ? edit.workDescription : ''}" placeholder="e.g. 2nd Floor Slab Casting Complete — Column & Beam Work" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Contract Value (₹)</label>
          <input type="number" id="ra-contract-val" value="${edit ? edit.contractValue : contractValue}" oninput="RaBills.calcRaAmount()" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">% Complete *</label>
          <input type="number" id="ra-pct" value="${edit ? edit.percentageComplete : ''}" placeholder="0-100" min="0" max="100" oninput="RaBills.calcRaAmount()" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Deductions (₹)</label>
          <input type="number" id="ra-deductions" value="${edit ? edit.deductions : 0}" placeholder="0" oninput="RaBills.calcRaAmount()" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Previous Amount Paid (₹)</label>
        <input type="number" id="ra-prev-paid" value="${edit ? edit.previousPaid : prevPaid}" oninput="RaBills.calcRaAmount()" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
      </div>

      <div id="ra-calc-preview" style="background:#F5EBDD; border:1.5px solid #9E775830; border-radius:10px; padding:16px; margin-bottom:20px">
        <div style="font-size:10px; color:#9E7758; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; margin-bottom:8px">Calculated Amount Due</div>
        <div id="ra-amount-display" style="font-family:'JetBrains Mono',monospace; font-size:28px; font-weight:800; color:#705748">₹0</div>
        <div id="ra-calc-breakdown" style="font-size:11px; color:#9E7758; margin-top:4px"></div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px">
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Due Date</label>
          <input type="date" id="ra-due-date" value="${edit ? edit.dueDate : ''}" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
        <div>
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Status</label>
          <select id="ra-status" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; appearance:none; cursor:pointer">
            <option value="draft" ${edit && edit.status === 'draft' ? 'selected' : ''}>📝 Draft</option>
            <option value="sent" ${edit && edit.status === 'sent' ? 'selected' : ''}>📤 Sent to Client</option>
            <option value="paid" ${edit && edit.status === 'paid' ? 'selected' : ''}>✓ Paid</option>
          </select>
        </div>
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" style="flex:1; padding:11px; border:1.5px solid #E5E7EB; background:none; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; color:#6B7280; font-family:inherit">Cancel</button>
        <button onclick="RaBills.saveRaBill()" style="flex:1; padding:11px; border:none; background:linear-gradient(135deg,#705748,#9E7758); color:#F5E4CC; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">${edit ? 'Update Bill' : 'Create RA Bill'}</button>
      </div>
    `);

    // Auto-calculate on open
    setTimeout(() => calcRaAmount(), 50);
  }

  function calcRaAmount() {
    const contractVal = parseFloat(document.getElementById('ra-contract-val')?.value) || 0;
    const pct = parseFloat(document.getElementById('ra-pct')?.value) || 0;
    const prevPaid = parseFloat(document.getElementById('ra-prev-paid')?.value) || 0;
    const deductions = parseFloat(document.getElementById('ra-deductions')?.value) || 0;

    const grossAmount = (contractVal * pct) / 100;
    const amountDue = Math.max(0, grossAmount - prevPaid - deductions);

    const disp = document.getElementById('ra-amount-display');
    const breakdown = document.getElementById('ra-calc-breakdown');
    if (disp) disp.textContent = Financial.fmt(amountDue);
    if (breakdown) {
      breakdown.textContent = `(${Financial.fmt(contractVal)} × ${pct}%) − Prev Paid ${Financial.fmt(prevPaid)} − Deductions ${Financial.fmt(deductions)}`;
    }
    return { amountDue, contractVal, pct, prevPaid, deductions };
  }

  async function saveRaBill() {
    const workDescription = document.getElementById('ra-work-desc').value.trim();
    if (!workDescription) { App.toast('Work description is required', 'error'); return; }

    const { amountDue, contractVal, pct, prevPaid, deductions } = calcRaAmount();
    const issueDate = document.getElementById('ra-issue-date').value;
    const dueDate = document.getElementById('ra-due-date').value;
    const status = document.getElementById('ra-status').value;
    const billNumber = document.getElementById('ra-billnum').value.trim();

    const editIdEl = document.getElementById('ra-edit-id');
    if (editIdEl) {
      await State.updateRaBill(editIdEl.value, { workDescription, contractValue: contractVal, percentageComplete: pct, previousPaid: prevPaid, deductions, amountDue, issueDate, dueDate, status, billNumber });
      App.closeModal();
      App.toast('RA Bill updated', 'success');
    } else {
      await State.addRaBill({ workDescription, contractValue: contractVal, percentageComplete: pct, previousPaid: prevPaid, deductions, amountDue, issueDate, dueDate, status, billNumber });
      App.closeModal();
      App.toast('RA Bill created', 'success');
    }
    App.showRaBillsHub();
  }

  // ── RA Bill Detail View ──────────────────────────────────
  function showRaBillDetail(id) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const b = (proj.raBills || []).find(x => x.id === id);
    if (!b) return;

    const statusColor = { draft: '#7B96A3', sent: '#9E7758', paid: '#A8B89C' };
    const statusLabel = { draft: '📝 Draft', sent: '📤 Sent to Client', paid: '✓ Paid' };
    const color = statusColor[b.status] || '#7B96A3';

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <button onclick="App.showRaBillsHub()" style="padding:6px 12px; margin-right:12px; border:1px solid var(--charcoal-border); background:var(--charcoal-mid); color:var(--text-secondary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600">← Back</button>
          <div>
            <h2 class="hub-title">${b.billNumber}</h2>
            <p class="hub-subtitle">${b.workDescription}</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="background:${color}18; color:${color}; margin-right:12px">
            <span class="phase-pct">${statusLabel[b.status] || b.status}</span>
          </div>
          <button class="btn btn-secondary" onclick="RaBills.showNewRaBillModal('${b.id}')" style="margin-right:8px">✏ Edit</button>
          <button class="btn btn-primary" onclick="RaBills.generateRaBillPDF('${b.id}')">📄 Download PDF</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin:20px 0">
        <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Contract Value</div>
          <div style="font-family:var(--font-mono); font-size:20px; font-weight:800; color:var(--text-primary)">${Financial.fmt(b.contractValue)}</div>
        </div>
        <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">% Complete</div>
          <div style="font-family:var(--font-mono); font-size:20px; font-weight:800; color:var(--amber-light)">${b.percentageComplete}%</div>
        </div>
        <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Previously Paid</div>
          <div style="font-family:var(--font-mono); font-size:20px; font-weight:800; color:#A8B89C">${Financial.fmt(b.previousPaid)}</div>
        </div>
        <div style="background:linear-gradient(135deg, var(--amber)22, var(--amber-light)22); border:1px solid var(--amber-glow); border-radius:12px; padding:20px">
          <div style="font-size:10px; color:var(--amber-light); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Amount Due</div>
          <div style="font-family:var(--font-mono); font-size:20px; font-weight:800; color:var(--steel-light)">${Financial.fmt(b.amountDue)}</div>
        </div>
      </div>

      <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px; margin-bottom:20px">
        <table style="width:100%; border-collapse:collapse">
          <tr style="border-bottom:1px solid var(--charcoal-border)">
            <td style="padding:10px 0; color:var(--text-muted); font-size:12px">Issue Date</td>
            <td style="padding:10px 0; text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--text-secondary)">${b.issueDate ? new Date(b.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid var(--charcoal-border)">
            <td style="padding:10px 0; color:var(--text-muted); font-size:12px">Due Date</td>
            <td style="padding:10px 0; text-align:right; font-family:var(--font-mono); font-size:12px; color:var(--text-secondary)">${b.dueDate ? new Date(b.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; color:var(--text-muted); font-size:12px">Deductions</td>
            <td style="padding:10px 0; text-align:right; font-family:var(--font-mono); font-size:12px; color:#C77966">${Financial.fmt(b.deductions || 0)}</td>
          </tr>
        </table>
      </div>

      <div style="display:flex; gap:12px; margin-top:24px">
        ${b.status !== 'paid' ? `<button onclick="RaBills.updateBillStatus('${b.id}','paid')" style="padding:10px 18px; border:none; background:#A8B89C; color:#fff; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">✓ Mark as Paid</button>` : ''}
        ${b.status === 'draft' ? `<button onclick="RaBills.updateBillStatus('${b.id}','sent')" style="padding:10px 18px; border:none; background:#9E7758; color:#fff; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">📤 Mark as Sent</button>` : ''}
        <div style="flex:1"></div>
        <button onclick="RaBills.deleteRaBill('${b.id}')" style="padding:10px 18px; border:1.5px solid #DC262620; background:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; color:#DC2626; font-family:inherit">🗑 Delete Bill</button>
      </div>
    `;

    document.getElementById('content-area').innerHTML = html;
  }

  // ── PDF Generation ───────────────────────────────────────
  function generateRaBillPDF(id) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const b = (proj.raBills || []).find(x => x.id === id);
    if (!b) return;

    if (typeof html2pdf === 'undefined') {
      App.toast('PDF library loading, please try again', 'warning');
      return;
    }

    App.toast('Generating RA Bill PDF...', 'info');

    const container = document.createElement('div');
    container.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Barlow', sans-serif; }
        .ra-wrap { font-family: 'Barlow', sans-serif; padding: 32px; color: #1B1B1E; background: white; font-size: 12px; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #705748; margin-bottom: 28px; }
        .brand h1 { font-size: 28px; font-weight: 900; letter-spacing: 0.06em; color: #1B1B1E; }
        .brand p { font-size: 11px; color: #6B7280; margin-top: 2px; }
        .bill-info { text-align: right; }
        .bill-info .bill-num { font-size: 18px; font-weight: 800; color: #705748; font-family: 'JetBrains Mono', monospace; }
        .bill-info .bill-date { font-size: 11px; color: #6B7280; margin-top: 4px; }
        .amount-box { background: linear-gradient(135deg, #705748, #9E7758); color: #ECD1B4; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
        .amount-box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
        .amount-box .value { font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 800; margin-top: 4px; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .detail-section h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B7280; font-weight: 700; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #EDE8DF; }
        .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F3F4F6; }
        .detail-row .key { font-size: 12px; color: #4B5563; }
        .detail-row .val { font-size: 12px; font-weight: 600; color: #1B1B1E; font-family: 'JetBrains Mono', monospace; }
        .calc-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .calc-table th { padding: 10px 14px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #4A4240; border-bottom: 2px solid #705748; background: #F5EBDD; }
        .calc-table td { padding: 10px 14px; border-bottom: 1px solid #EDE8DF; font-size: 12px; }
        .calc-table tr.total { background: #705748; }
        .calc-table tr.total td { color: #ECD1B4; font-weight: 800; font-size: 14px; border-bottom: none; font-family: 'JetBrains Mono', monospace; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #EDE8DF; display: flex; justify-content: space-between; font-size: 9px; color: #9CA3AF; }
        .project-info { background: #F9FAFB; border: 1px solid #EDE8DF; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
        .project-info h2 { font-size: 15px; font-weight: 800; color: #1B1B1E; }
        .project-info p { font-size: 11px; color: #6B7280; margin-top: 2px; }
      </style>
      <div class="ra-wrap">
        <div class="header">
          <div class="brand">
            <h1>RECON</h1>
            <p>Running Account (RA) Bill — Construction Invoice</p>
          </div>
          <div class="bill-info">
            <div class="bill-num">${b.billNumber}</div>
            <div class="bill-date">Issue Date: ${b.issueDate ? new Date(b.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</div>
            ${b.dueDate ? `<div class="bill-date">Due: ${new Date(b.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}
          </div>
        </div>

        <div class="project-info">
          <h2>${proj.name}</h2>
          <p>${proj.address || ''} ${proj.client ? '· Client: ' + proj.client : ''} ${proj.contractor ? '· Contractor: ' + proj.contractor : ''}</p>
        </div>

        <div class="amount-box">
          <div>
            <div class="label">Net Amount Due (RA Bill ${b.billNumber})</div>
            <div class="value">${Financial.fmtFull(b.amountDue)}</div>
          </div>
          <div style="text-align:right">
            <span class="status-badge" style="background:rgba(255,255,255,0.15); color:#ECD1B4">${b.status === 'paid' ? '✓ PAID' : b.status === 'sent' ? '📤 SENT' : '📝 DRAFT'}</span>
          </div>
        </div>

        <div class="details-grid">
          <div class="detail-section">
            <h3>Work Details</h3>
            <div class="detail-row"><span class="key">Work Description</span><span class="val" style="max-width:200px; text-align:right">${b.workDescription}</span></div>
            <div class="detail-row"><span class="key">% Complete (Cumulative)</span><span class="val">${b.percentageComplete}%</span></div>
          </div>
          <div class="detail-section">
            <h3>Billing Details</h3>
            <div class="detail-row"><span class="key">Project Contract Value</span><span class="val">${Financial.fmtFull(b.contractValue)}</span></div>
            <div class="detail-row"><span class="key">Previous Amount Paid</span><span class="val">${Financial.fmtFull(b.previousPaid)}</span></div>
            <div class="detail-row"><span class="key">Deductions / Retention</span><span class="val">${Financial.fmtFull(b.deductions || 0)}</span></div>
          </div>
        </div>

        <table class="calc-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gross Amount (${b.contractValue ? Financial.fmtFull(b.contractValue) : '—'} × ${b.percentageComplete}%)</td>
              <td style="text-align:right; font-family:monospace">${Financial.fmtFull((b.contractValue * b.percentageComplete) / 100)}</td>
            </tr>
            <tr>
              <td>Less: Amount Previously Paid</td>
              <td style="text-align:right; font-family:monospace; color:#C77966">− ${Financial.fmtFull(b.previousPaid || 0)}</td>
            </tr>
            ${b.deductions > 0 ? `<tr><td>Less: Deductions / Retention</td><td style="text-align:right; font-family:monospace; color:#C77966">− ${Financial.fmtFull(b.deductions)}</td></tr>` : ''}
            <tr class="total">
              <td>Net Amount Due — ${b.billNumber}</td>
              <td style="text-align:right">${Financial.fmtFull(b.amountDue)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div>Generated by RECON — Construction Ledger · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div>${proj.contractor || ''} · ${proj.name}</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    html2pdf().set({
      margin: 0,
      filename: `${b.billNumber}-${(proj.name || 'project').replace(/\s+/g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save().then(() => {
      document.body.removeChild(container);
      App.toast('PDF downloaded!', 'success');
    }).catch(err => {
      document.body.removeChild(container);
      App.toast('PDF generation failed', 'error');
      console.error('[RaBills] PDF error:', err);
    });
  }

  async function updateBillStatus(id, status) {
    await State.updateRaBill(id, { status });
    App.toast(`Bill marked as ${status}`, 'success');
    showRaBillDetail(id);
  }

  async function deleteRaBill(id) {
    App.showConfirmModal({
      icon: '🧾',
      title: 'Delete RA Bill?',
      body: 'This will permanently delete this bill. This cannot be undone.',
      confirmLabel: 'Delete Bill',
      onConfirm: async () => {
        await State.deleteRaBill(id);
        App.toast('RA Bill deleted', 'info');
        App.showRaBillsHub();
      }
    });
  }

  return {
    renderRaBillsHub,
    showNewRaBillModal, calcRaAmount, saveRaBill,
    showRaBillDetail, generateRaBillPDF,
    updateBillStatus, deleteRaBill
  };
})();
