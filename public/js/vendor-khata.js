/* ═══════════════════════════════════════════
   VENDOR-KHATA.JS — Vendor Credit Ledger (Udhaar)
   Track balances owed to hardware/material suppliers
   ═══════════════════════════════════════════ */

const VendorKhata = (() => {

  // ── Hub View ──────────────────────────────────────────────
  function renderVendorHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '';

    const vendors = proj.vendors || [];
    const totalOwed = vendors.reduce((sum, v) => sum + Math.max(0, parseFloat(v.balance) || 0), 0);
    const overdue = vendors.filter(v => v.balance > 0).length;

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <h2 class="hub-title">Vendor Khata (Udhaar)</h2>
          <p class="hub-subtitle">Track credit balances owed to hardware shops and material suppliers.</p>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right: 12px; background: ${totalOwed > 0 ? '#C7796620' : 'var(--charcoal-mid)'}; color: ${totalOwed > 0 ? '#C77966' : 'var(--text-secondary)'}">
            <span class="phase-pct">Total Udhaar: ${Financial.fmt(totalOwed)}</span>
          </div>
          <div class="phase-chip" style="margin-right: 12px;">
            <span class="phase-pct">${overdue} Pending</span>
          </div>
          <button class="btn btn-primary" onclick="VendorKhata.showAddVendorModal()" style="margin-left:8px">+ Add Vendor</button>
        </div>
      </div>
    `;

    if (vendors.length === 0) {
      html += `
        <div class="cards-grid">
          <div style="grid-column:1/-1; padding:60px 32px; text-align:center; border:1px dashed var(--charcoal-border); border-radius:12px; background:var(--charcoal-mid)">
            <div style="font-size:40px; margin-bottom:12px">🏪</div>
            <h3 style="color:var(--text-secondary); font-size:16px; font-weight:700; margin-bottom:8px">No Vendors Added</h3>
            <p style="color:var(--text-muted); font-size:13px; margin-bottom:20px">Add hardware shops or material suppliers to track credit (Udhaar).</p>
            <button class="btn btn-primary" onclick="VendorKhata.showAddVendorModal()">+ Add First Vendor</button>
          </div>
        </div>
      `;
    } else {
      html += `<div class="cards-grid">`;
      vendors.forEach(v => {
        const bal = parseFloat(v.balance) || 0;
        const isOwed = bal > 0;
        const txns = (proj.vendorTransactions || []).filter(t => t.vendorId === v.id);
        html += `
          <div class="category-card" onclick="VendorKhata.showVendorLedger('${v.id}')" style="cursor:pointer; transition: transform 0.15s, box-shadow 0.15s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div class="cat-card-header">
              <div class="cat-card-icon" style="background:${isOwed ? '#C7796618' : 'var(--charcoal-surface)'}">🏪</div>
              <div>
                <div class="cat-card-title">${v.name}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px">${v.shopName || v.phone || 'Vendor'}</div>
              </div>
            </div>
            <div class="cat-card-meta" style="margin-top:12px">
              <span style="font-size:11px; color:var(--text-muted)">${txns.length} transactions</span>
            </div>
            <div class="cat-card-footer" style="margin-top:16px; padding-top:12px; border-top:1px solid var(--charcoal-border); display:flex; justify-content:space-between; align-items:center">
              <span style="font-size:12px; color:var(--text-muted)">Outstanding</span>
              <span style="font-family:var(--font-mono); font-weight:700; font-size:16px; color:${isOwed ? '#C77966' : '#A8B89C'}">${isOwed ? Financial.fmt(bal) : 'Cleared ✓'}</span>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
    return html;
  }

  // ── Add Vendor Modal ──────────────────────────────────────
  function showAddVendorModal() {
    App.showModal(`
      <h3 style="font-size:17px; font-weight:800; color:#1A1A2E; margin-bottom:20px">🏪 Add New Vendor</h3>
      <div class="field-group" style="margin-bottom:14px">
        <label class="field-label" style="color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Vendor / Contact Name *</label>
        <input class="field-input" id="new-vendor-name" placeholder="e.g. Ramesh Bhai" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; margin-top:6px">
      </div>
      <div class="field-group" style="margin-bottom:14px">
        <label class="field-label" style="color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Shop / Business Name</label>
        <input class="field-input" id="new-vendor-shop" placeholder="e.g. Ramesh Hardware & Cement Store" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; margin-top:6px">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div class="field-group">
          <label class="field-label" style="color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Phone</label>
          <input class="field-input mono" id="new-vendor-phone" placeholder="10-digit number" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; margin-top:6px; font-family:monospace">
        </div>
        <div class="field-group">
          <label class="field-label" style="color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Opening Balance (Udhaar)</label>
          <input class="field-input mono" type="number" id="new-vendor-balance" placeholder="0" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; margin-top:6px; font-family:monospace">
        </div>
      </div>
      <div class="field-group" style="margin-bottom:20px">
        <label class="field-label" style="color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Notes</label>
        <input class="field-input" id="new-vendor-notes" placeholder="e.g. Credit limit: 50,000. Settlement every Monday." style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; margin-top:6px">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" style="flex:1; padding:11px; border:1.5px solid #E5E7EB; background:none; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; color:#6B7280; font-family:inherit">Cancel</button>
        <button onclick="VendorKhata.saveNewVendor()" style="flex:1; padding:11px; border:none; background:linear-gradient(135deg,#705748,#9E7758); color:#F5E4CC; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Save Vendor</button>
      </div>
    `);
  }

  async function saveNewVendor() {
    const name = document.getElementById('new-vendor-name').value.trim();
    if (!name) { App.toast('Vendor name is required', 'error'); return; }
    const shopName = document.getElementById('new-vendor-shop').value.trim();
    const phone = document.getElementById('new-vendor-phone').value.trim();
    const balance = parseFloat(document.getElementById('new-vendor-balance').value) || 0;
    const notes = document.getElementById('new-vendor-notes').value.trim();
    await State.addVendor({ name, shopName, phone, balance, notes });
    App.closeModal();
    App.toast('Vendor added', 'success');
    App.showVendorHub();
  }

  // ── Vendor Ledger View ───────────────────────────────────
  function showVendorLedger(id) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const v = (proj.vendors || []).find(x => x.id === id);
    if (!v) return;

    const txns = (proj.vendorTransactions || [])
      .filter(t => t.vendorId === id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const bal = parseFloat(v.balance) || 0;
    const isOwed = bal > 0;

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <button onclick="App.showVendorHub()" style="padding:6px 12px; margin-right:12px; border:1px solid var(--charcoal-border); background:var(--charcoal-mid); color:var(--text-secondary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600">← Back</button>
          <div>
            <h2 class="hub-title">${v.name}</h2>
            <p class="hub-subtitle">${v.shopName || ''} ${v.phone ? '· ' + v.phone : ''}</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:12px; background:${isOwed ? '#C7796618' : '#A8B89C18'}; color:${isOwed ? '#C77966' : '#A8B89C'}">
            <span class="phase-pct">Balance: ${isOwed ? Financial.fmt(bal) + ' Owed' : 'Cleared ✓'}</span>
          </div>
          <button class="btn btn-secondary" onclick="VendorKhata.showVendorTransactionModal('${v.id}','debit')" style="margin-right:8px">+ Purchase (Udhaar)</button>
          <button class="btn btn-primary" onclick="VendorKhata.showVendorTransactionModal('${v.id}','credit')">✓ Record Payment</button>
        </div>
      </div>

      ${v.notes ? `<div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:10px; padding:12px 16px; margin:16px 0; font-size:12px; color:var(--text-muted)">📝 ${v.notes}</div>` : ''}

      <div class="section-title" style="margin-top:20px; color:var(--text-muted); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Transaction History</div>
      <table style="width:100%; border-collapse:collapse; margin-top:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--charcoal-border)">
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Date</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Description</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Debit (Udhaar)</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Payment Made</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (txns.length === 0) {
      html += `<tr><td colspan="4" style="padding:32px; text-align:center; color:var(--text-muted); font-size:13px">No transactions yet. Use the buttons above to add purchases or payments.</td></tr>`;
    } else {
      txns.forEach(t => {
        const isDebit = t.type === 'debit';
        html += `
          <tr style="border-bottom:1px solid var(--charcoal-border)">
            <td style="padding:12px; font-family:var(--font-mono); font-size:12px; color:var(--text-muted)">${new Date(t.date).toLocaleDateString('en-IN')}</td>
            <td style="padding:12px; font-size:13px; color:var(--text-secondary)">${t.description || '—'}</td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${isDebit ? '#C77966' : 'var(--text-muted)'}">${isDebit ? Financial.fmt(t.amount) : '—'}</td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${!isDebit ? '#A8B89C' : 'var(--text-muted)'}">
              ${!isDebit ? Financial.fmt(t.amount) : '—'}
            </td>
          </tr>
        `;
      });
    }

    html += `
        </tbody>
      </table>
      <div style="margin-top:32px; text-align:right">
        <button onclick="VendorKhata.deleteVendor('${v.id}')" style="padding:8px 16px; border:1.5px solid #DC262620; background:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; color:#DC2626; font-family:inherit">🗑 Delete Vendor</button>
      </div>
    `;

    document.getElementById('content-area').innerHTML = html;
  }

  // ── Transaction Modal ────────────────────────────────────
  function showVendorTransactionModal(vendorId, type) {
    const today = new Date().toISOString().split('T')[0];
    const isDebit = type === 'debit';
    const title = isDebit ? '+ Record Purchase (Udhaar)' : '✓ Record Payment to Vendor';
    const btnColor = isDebit ? '#C77966' : '#705748';
    const btnText = isDebit ? 'Add Purchase' : 'Record Payment';

    App.showModal(`
      <h3 style="font-size:17px; font-weight:800; color:#1A1A2E; margin-bottom:20px">${title}</h3>
      <input type="hidden" id="txn-vendor-id" value="${vendorId}">
      <input type="hidden" id="txn-type" value="${type}">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div class="field-group">
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Date *</label>
          <input type="date" id="txn-date" value="${today}" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
        <div class="field-group">
          <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Amount (₹) *</label>
          <input type="number" id="txn-amount" placeholder="0" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none; font-family:monospace">
        </div>
      </div>
      <div class="field-group" style="margin-bottom:20px">
        <label style="display:block; color:#6B7280; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px">Description</label>
        <input type="text" id="txn-description" placeholder="${isDebit ? 'e.g. 50 bags OPC cement @ 350/bag' : 'e.g. Cash payment settlement'}" style="width:100%; padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; background:#F9FAFB; color:#1A1A2E; outline:none">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" style="flex:1; padding:11px; border:1.5px solid #E5E7EB; background:none; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; color:#6B7280; font-family:inherit">Cancel</button>
        <button onclick="VendorKhata.saveVendorTransaction()" style="flex:1; padding:11px; border:none; background:${btnColor}; color:#fff; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">${btnText}</button>
      </div>
    `);
  }

  async function saveVendorTransaction() {
    const vendorId = document.getElementById('txn-vendor-id').value;
    const type = document.getElementById('txn-type').value;
    const date = document.getElementById('txn-date').value;
    const amount = parseFloat(document.getElementById('txn-amount').value);
    const description = document.getElementById('txn-description').value.trim();

    if (!date) { App.toast('Date is required', 'error'); return; }
    if (!amount || amount <= 0) { App.toast('Enter a valid amount', 'error'); return; }

    await State.addVendorTransaction({ vendorId, type, date, amount, description });
    App.closeModal();
    App.toast(type === 'debit' ? 'Purchase added' : 'Payment recorded', 'success');
    showVendorLedger(vendorId);
  }

  async function deleteVendor(id) {
    App.showConfirmModal({
      icon: '🗑',
      title: 'Delete Vendor?',
      body: 'This will remove the vendor and all their transaction history permanently.',
      confirmLabel: 'Delete Vendor',
      onConfirm: async () => {
        await State.deleteVendor(id);
        App.toast('Vendor deleted', 'info');
        App.showVendorHub();
      }
    });
  }

  return {
    renderVendorHub,
    showAddVendorModal, saveNewVendor,
    showVendorLedger,
    showVendorTransactionModal, saveVendorTransaction,
    deleteVendor
  };
})();
