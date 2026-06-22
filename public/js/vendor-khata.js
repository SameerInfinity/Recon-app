/* ═══════════════════════════════════════════
   VENDOR-KHATA.JS — Vendor Credit Ledger (Udhaar)
   Track balances owed to hardware/material suppliers.
   Each transaction stores totalAmount, paidAmount, remainingAmount (= total − paid).
   For credit (payment) transactions, paidAmount is the payment made and remainingAmount
   is the new outstanding owed (stored as a negative delta from previous balance).
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
          <div>
            <h2 class="hub-title">Vendor Khata (Udhaar)</h2>
            <p class="hub-subtitle">Track credit balances owed to hardware shops and material suppliers.</p>
          </div>
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
          <div class="category-card" onclick="VendorKhata.showVendorLedger('${escapeAttr(v.id)}')" style="cursor:pointer; transition: transform 0.15s, box-shadow 0.15s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div class="cat-card-header">
              <div class="cat-card-icon" style="background:${isOwed ? '#C7796618' : 'var(--charcoal-surface)'}">🏪</div>
              <div>
                <div class="cat-card-title">${escapeHtml(v.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px">${escapeHtml(v.shopName || v.phone || 'Vendor')}</div>
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
      <h3 class="modal-title">🏪 Add New Vendor</h3>
      <div style="margin-bottom:14px">
        <label class="modal-label">Vendor / Contact Name *</label>
        <input class="modal-input" id="new-vendor-name" placeholder="e.g. Ramesh Bhai">
      </div>
      <div style="margin-bottom:14px">
        <label class="modal-label">Shop / Business Name</label>
        <input class="modal-input" id="new-vendor-shop" placeholder="e.g. Ramesh Hardware & Cement Store">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Phone</label>
          <input class="modal-input" id="new-vendor-phone" placeholder="10-digit number" style="font-family:var(--font-mono)">
        </div>
        <div>
          <label class="modal-label">Total Amount (₹)</label>
          <input class="modal-input" type="number" id="new-vendor-total" placeholder="0" style="font-family:var(--font-mono)" oninput="VendorKhata._recalcOpening()">
        </div>
        <div>
          <label class="modal-label">Paid Amount (₹)</label>
          <input class="modal-input" type="number" id="new-vendor-paid" placeholder="0" style="font-family:var(--font-mono)" oninput="VendorKhata._recalcOpening()">
        </div>
      </div>
      <div style="margin-bottom:14px; padding:10px 12px; background:rgba(199,121,102,0.08); border:1px solid rgba(199,121,102,0.25); border-radius:8px; display:flex; justify-content:space-between; align-items:center">
        <span style="font-size:12px; color:var(--text-muted); font-weight:600">Remaining (Udhaar) Amount</span>
        <span id="new-vendor-remaining-display" style="font-family:var(--font-mono); font-weight:800; color:#C77966; font-size:16px">₹0</span>
        <input type="hidden" id="new-vendor-balance" value="0">
      </div>
      <div style="margin-bottom:20px">
        <label class="modal-label">Notes</label>
        <input class="modal-input" id="new-vendor-notes" placeholder="e.g. Credit limit: 50,000. Settlement every Monday.">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="VendorKhata.saveNewVendor()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Save Vendor</button>
      </div>
    `);
  }

  function _recalcOpening() {
    const total = parseFloat(document.getElementById('new-vendor-total')?.value) || 0;
    const paid  = parseFloat(document.getElementById('new-vendor-paid')?.value)  || 0;
    const remaining = Math.max(0, total - paid);
    const balEl = document.getElementById('new-vendor-balance');
    if (balEl) balEl.value = String(remaining);
    const dispEl = document.getElementById('new-vendor-remaining-display');
    if (dispEl) dispEl.textContent = '₹' + remaining.toLocaleString('en-IN');
  }

  async function saveNewVendor() {
    const name = document.getElementById('new-vendor-name').value.trim();
    if (!name) { App.toast('Vendor name is required', 'error'); return; }
    const shopName = document.getElementById('new-vendor-shop').value.trim();
    const phone = document.getElementById('new-vendor-phone').value.trim();
    const totalAmount = parseFloat(document.getElementById('new-vendor-total').value) || 0;
    const paidAmount  = parseFloat(document.getElementById('new-vendor-paid').value)  || 0;
    const balance     = Math.max(0, totalAmount - paidAmount); // remaining udhaar
    const notes = document.getElementById('new-vendor-notes').value.trim();
    await State.addVendor({
      name, shopName, phone,
      totalAmount, paidAmount, balance,
      openingBalance: balance,
      notes
    });
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
    // Compute totals from opening + all transactions so old vendors without totalAmount/paidAmount still work.
    const openTotal = parseFloat(v.totalAmount) || 0;
    const openPaid  = parseFloat(v.paidAmount)  || 0;
    let totalAmt = openTotal;
    let paidAmt  = openPaid;
    (proj.vendorTransactions || []).filter(t => t.vendorId === id).forEach(t => {
      if (t.type === 'debit') {
        totalAmt += parseFloat(t.totalAmount) || (parseFloat(t.amount) || 0);
        paidAmt  += parseFloat(t.paidAmount)  || 0;
      } else {
        // credit = payment made against the outstanding udhaar
        paidAmt  += parseFloat(t.amount) || 0;
      }
    });
    // If we had no opening totals but had an opening balance (legacy), seed total from balance.
    if (openTotal === 0 && openPaid === 0 && (parseFloat(v.openingBalance) || 0) > 0) {
      totalAmt = parseFloat(v.openingBalance);
    }
    const isOwed = bal > 0;

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <button onclick="App.showVendorHub()" style="padding:6px 12px; margin-right:12px; border:1px solid var(--charcoal-border); background:var(--charcoal-mid); color:var(--text-secondary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600">← Back</button>
          <div>
            <h2 class="hub-title">${escapeHtml(v.name)}</h2>
            <p class="hub-subtitle">${escapeHtml(v.shopName || '')} ${v.phone ? '· ' + escapeHtml(v.phone) : ''}</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:12px; background:${isOwed ? '#C7796618' : '#A8B89C18'}; color:${isOwed ? '#C77966' : '#A8B89C'}">
            <span class="phase-pct">Balance: ${isOwed ? Financial.fmt(bal) + ' Owed' : 'Cleared ✓'}</span>
          </div>
          <button class="btn btn-secondary" onclick="VendorKhata.showVendorTransactionModal('${escapeAttr(v.id)}','debit')" style="margin-right:8px">+ Purchase (Udhaar)</button>
          <button class="btn btn-primary" onclick="VendorKhata.showVendorTransactionModal('${escapeAttr(v.id)}','credit')">✓ Record Payment</button>
        </div>
      </div>

      <!-- Total / Paid / Udhaar Summary Strip -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:14px 18px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-weight:700;margin-bottom:4px">Total Amount</div>
          <div style="font-family:var(--font-mono);font-weight:800;font-size:18px;color:#9E7758">${Financial.fmt(totalAmt)}</div>
        </div>
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:14px 18px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-weight:700;margin-bottom:4px">Paid Amount</div>
          <div style="font-family:var(--font-mono);font-weight:800;font-size:18px;color:#A8B89C">${Financial.fmt(paidAmt)}</div>
        </div>
        <div style="background:rgba(199,121,102,0.08);border:1px solid rgba(199,121,102,0.25);border-radius:12px;padding:14px 18px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-weight:700;margin-bottom:4px">Remaining (Udhaar)</div>
          <div style="font-family:var(--font-mono);font-weight:800;font-size:18px;color:#C77966">${Financial.fmt(bal)}</div>
        </div>
      </div>

      ${v.notes ? `<div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:10px; padding:12px 16px; margin:16px 0; font-size:12px; color:var(--text-muted)">📝 ${escapeHtml(v.notes)}</div>` : ''}

      <div class="section-title" style="margin-top:20px; color:var(--text-muted); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Transaction History</div>
      <table style="width:100%; border-collapse:collapse; margin-top:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--charcoal-border)">
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Date</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Description</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Total</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Paid</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Udhaar</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:center">Proof</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Balance</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (txns.length === 0) {
      html += `<tr><td colspan="7" style="padding:32px; text-align:center; color:var(--text-muted); font-size:13px">No transactions yet. Use the buttons above to add purchases or payments.</td></tr>`;
    } else {
      // Sort oldest-first to compute running balance chronologically
      const sortedAsc = [...txns].sort((a, b) => new Date(a.date) - new Date(b.date));
      let runningBal = parseFloat(v.openingBalance) || 0;
      const rowsWithBal = sortedAsc.map(t => {
        const isDebit = t.type === 'debit';
        // For debit (purchase): outstanding increases by remainingAmount (= totalAmount − paidAmount).
        // For credit (payment): outstanding decreases by the paid amount (= amount).
        if (isDebit) {
          const rem = parseFloat(t.remainingAmount);
          const delta = isNaN(rem) ? (parseFloat(t.amount) || 0) : rem;
          runningBal += delta;
        } else {
          runningBal -= (parseFloat(t.amount) || 0);
        }
        return { ...t, runningBal };
      });
      // Show newest first for display
      rowsWithBal.reverse().forEach(t => {
        const isDebit = t.type === 'debit';
        const balColor = t.runningBal > 0 ? '#C77966' : t.runningBal < 0 ? '#A8B89C' : 'var(--text-muted)';
        const balText = t.runningBal > 0 ? Financial.fmt(t.runningBal) + ' owed'
                      : t.runningBal < 0 ? Financial.fmt(Math.abs(t.runningBal)) + ' cr' : '—';
        
        // For debit rows: show totalAmount / paidAmount / remainingAmount columns instead of a single amount
        const tTotal = parseFloat(t.totalAmount) || (isDebit ? (parseFloat(t.amount) || 0) : 0);
        const tPaid  = isDebit ? (parseFloat(t.paidAmount) || 0)  : (parseFloat(t.amount) || 0);
        const tRem   = isDebit ? (parseFloat(t.remainingAmount) || (parseFloat(t.amount) || 0)) : 0;

        // Proof cell
        let proofCell = '<td style="padding:12px; text-align:center; color:var(--text-muted)">—</td>';
        if (!isDebit && t.proofDataUrl) {
          const isImg = t.proofFileType && t.proofFileType.startsWith('image/');
          const attrIdx = escapeAttr(t.id);
          if (isImg) {
            proofCell = `<td style="padding:8px; text-align:center">
              <img src="${escapeAttr(t.proofDataUrl)}" 
                style="height:36px;width:48px;object-fit:cover;border-radius:4px;border:1px solid var(--charcoal-border);cursor:pointer"
                onclick="VendorKhata.viewProof('${attrIdx}')"
                title="View payment proof">
            </td>`;
          } else {
            proofCell = `<td style="padding:12px; text-align:center">
              <button onclick="VendorKhata.viewProof('${attrIdx}')" 
                style="padding:4px 8px;border-radius:6px;border:1px solid var(--amber-border);background:var(--amber-light-bg);color:var(--amber);font-size:10px;font-weight:700;cursor:pointer">
                📄 PDF
              </button>
            </td>`;
          }
        }

        html += `
          <tr style="border-bottom:1px solid var(--charcoal-border)">
            <td style="padding:12px; font-family:var(--font-mono); font-size:12px; color:var(--text-muted)">${new Date(t.date).toLocaleDateString('en-IN')}</td>
            <td style="padding:12px; font-size:13px; color:var(--text-secondary)">${escapeHtml(t.description || '—')}</td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${isDebit ? '#9E7758' : 'var(--text-muted)'}">
              ${isDebit ? Financial.fmt(tTotal) : '—'}
            </td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:#A8B89C">
              ${Financial.fmt(tPaid)}
            </td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${isDebit ? '#C77966' : 'var(--text-muted)'}">
              ${isDebit ? Financial.fmt(tRem) : '—'}
            </td>
            ${proofCell}
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${balColor}">
              ${balText}
            </td>
          </tr>
        `;
      });
    }

    html += `
        </tbody>
      </table>
      <div style="margin-top:32px; text-align:right">
        <button onclick="VendorKhata.deleteVendor('${escapeAttr(v.id)}')" style="padding:8px 16px; border:1.5px solid #DC262620; background:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; color:#DC2626; font-family:inherit">${Icons.render('trash', 12)} Delete Vendor</button>
      </div>
    `;

    document.getElementById('content-area').innerHTML = html;
  }

  // ── Transaction Modal ────────────────────────────────────
  function showVendorTransactionModal(vendorId, type) {
    const today = new Date().toISOString().split('T')[0];
    const isDebit = type === 'debit';
    const title = isDebit ? '+ Record Purchase (Udhaar)' : '✓ Record Payment to Vendor';
    const btnText = isDebit ? 'Add Purchase' : 'Record Payment';

    // Payment proof upload — only for credit (payment) transactions
    const proofUploadHtml = !isDebit ? `
      <div style="margin-bottom:14px">
        <label class="modal-label">UPI / Payment Proof (Photo or PDF)</label>
        <div id="proof-preview-wrap" style="margin-bottom:8px;display:none">
          <img id="proof-preview-img" style="max-height:100px;border-radius:8px;border:1px solid var(--border);display:none">
          <span id="proof-preview-label" style="font-size:11px;color:var(--text-muted)"></span>
          <button onclick="VendorKhata._clearProof()" style="margin-left:8px;padding:2px 6px;background:none;border:1px solid var(--border);border-radius:4px;font-size:11px;cursor:pointer;color:var(--text-muted)">Remove</button>
        </div>
        <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1.5px dashed var(--border);border-radius:8px;cursor:pointer;background:var(--bg-elev-2)">
          <span style="font-size:13px">📎</span>
          <span style="font-size:12px;color:var(--text-muted)">Attach UPI screenshot / receipt</span>
          <input type="file" id="proof-file-input" accept="image/*,application/pdf" style="display:none" onchange="VendorKhata._handleProofUpload(event)">
        </label>
        <input type="hidden" id="proof-data-url" value="">
        <input type="hidden" id="proof-file-type" value="">
      </div>
    ` : '';

    App.showModal(`
      <h3 class="modal-title">${title}</h3>
      <input type="hidden" id="txn-vendor-id" value="${vendorId}">
      <input type="hidden" id="txn-type" value="${type}">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Date *</label>
          <input class="modal-input" type="date" id="txn-date" value="${today}" style="font-family:var(--font-mono)">
        </div>
        ${isDebit ? `
          <div>
            <label class="modal-label">Total Amount (₹) *</label>
            <input class="modal-input" type="number" id="txn-total" placeholder="0" style="font-family:var(--font-mono)" oninput="VendorKhata._recalcTxn()">
          </div>` : `
          <div>
            <label class="modal-label">Amount Paid (₹) *</label>
            <input class="modal-input" type="number" id="txn-amount" placeholder="0" style="font-family:var(--font-mono)">
          </div>`}
      </div>
      ${isDebit ? `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Paid Amount (₹)</label>
          <input class="modal-input" type="number" id="txn-paid" placeholder="0" style="font-family:var(--font-mono)" oninput="VendorKhata._recalcTxn()">
        </div>
        <div style="display:flex;flex-direction:column;justify-content:flex-end">
          <label class="modal-label">Remaining (Udhaar) (₹)</label>
          <div id="txn-remaining-display" style="font-family:var(--font-mono);font-weight:800;font-size:18px;color:#C77966;padding:10px 14px;background:rgba(199,121,102,0.08);border:1px solid rgba(199,121,102,0.25);border-radius:8px">₹0</div>
        </div>
      </div>` : ''}
      <div style="margin-bottom:${isDebit ? '20px' : '14px'}">
        <label class="modal-label">Description</label>
        <input class="modal-input" type="text" id="txn-description"
          placeholder="${isDebit ? 'e.g. 50 bags OPC cement @ 350/bag' : 'e.g. Cash payment settlement, UPI transfer'}">
      </div>
      ${proofUploadHtml}
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="VendorKhata.saveVendorTransaction()"
          class="${isDebit ? 'modal-btn-warning' : 'modal-btn-primary'}"
          style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">${btnText}</button>
      </div>
    `);
  }

  // Handle proof image upload preview
  function _handleProofUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf';
    const wrapEl = document.getElementById('proof-preview-wrap');
    const imgEl = document.getElementById('proof-preview-img');
    const labelEl = document.getElementById('proof-preview-label');

    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('proof-data-url').value = ev.target.result;
      document.getElementById('proof-file-type').value = file.type;
      if (wrapEl) wrapEl.style.display = 'flex';
      if (wrapEl) wrapEl.style.alignItems = 'center';
      if (wrapEl) wrapEl.style.gap = '8px';
      if (isPdf) {
        if (imgEl) imgEl.style.display = 'none';
        if (labelEl) labelEl.textContent = '📄 ' + file.name;
      } else {
        if (imgEl) { imgEl.src = ev.target.result; imgEl.style.display = 'block'; }
        if (labelEl) labelEl.textContent = file.name;
      }
    };
    reader.readAsDataURL(file);
  }

  function _clearProof() {
    document.getElementById('proof-data-url').value = '';
    document.getElementById('proof-file-type').value = '';
    const wrapEl = document.getElementById('proof-preview-wrap');
    if (wrapEl) wrapEl.style.display = 'none';
    const fileInput = document.getElementById('proof-file-input');
    if (fileInput) fileInput.value = '';
  }

  function _recalcTxn() {
    const total = parseFloat(document.getElementById('txn-total')?.value) || 0;
    const paid  = parseFloat(document.getElementById('txn-paid')?.value)  || 0;
    const remaining = Math.max(0, total - paid);
    const dispEl = document.getElementById('txn-remaining-display');
    if (dispEl) dispEl.textContent = '₹' + remaining.toLocaleString('en-IN');
  }

  async function saveVendorTransaction() {
    const vendorId = document.getElementById('txn-vendor-id').value;
    const type = document.getElementById('txn-type').value;
    const date = document.getElementById('txn-date').value;
    const description = document.getElementById('txn-description').value.trim();
    const proofDataUrl = document.getElementById('proof-data-url')?.value || '';
    const proofFileType = document.getElementById('proof-file-type')?.value || '';

    if (!date) { App.toast('Date is required', 'error'); return; }

    const isDebit = type === 'debit';
    let totalAmount = 0, paidAmount = 0, remainingAmount = 0, amount = 0;
    if (isDebit) {
      totalAmount = parseFloat(document.getElementById('txn-total').value) || 0;
      paidAmount  = parseFloat(document.getElementById('txn-paid').value)  || 0;
      remainingAmount = Math.max(0, totalAmount - paidAmount);
      amount = totalAmount; // legacy single-amount field — used by running-balance & backward-compat
      if (!totalAmount || totalAmount <= 0) { App.toast('Enter a valid total amount', 'error'); return; }
    } else {
      amount = parseFloat(document.getElementById('txn-amount').value);
      if (!amount || amount <= 0) { App.toast('Enter a valid amount', 'error'); return; }
      totalAmount = amount;
      paidAmount  = amount;
      remainingAmount = 0;
    }

    const txnData = {
      vendorId, type, date, amount,
      totalAmount, paidAmount, remainingAmount,
      description,
      txnDate: date, // Supabase snake_case column
    };
    if (proofDataUrl) {
      txnData.proofDataUrl = proofDataUrl;
      txnData.proofFileType = proofFileType;
    }

    await State.addVendorTransaction(txnData);
    App.closeModal();
    App.toast(type === 'debit' ? 'Purchase added' : 'Payment recorded' + (proofDataUrl ? ' with proof' : ''), 'success');
    showVendorLedger(vendorId);
  }

  // View payment proof in lightbox
  function viewProof(txnId) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const txn = (proj.vendorTransactions || []).find(t => t.id === txnId);
    if (!txn || !txn.proofDataUrl) return App.toast('Proof not found', 'error');

    const isPdf = txn.proofFileType === 'application/pdf';
    App.showModal(`
      <h3 class="modal-title">📎 Payment Proof</h3>
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${new Date(txn.date).toLocaleDateString('en-IN')} · ${Financial.fmt(txn.amount)}</div>
        ${isPdf
          ? `<a href="${escapeAttr(txn.proofDataUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;background:var(--amber);color:#fff;border-radius:8px;font-weight:700;text-decoration:none">📄 Open PDF</a>`
          : `<img src="${escapeAttr(txn.proofDataUrl)}" style="max-width:100%;max-height:60vh;border-radius:8px;border:1px solid var(--border)">`
        }
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">Close</button>
        <a href="${escapeAttr(txn.proofDataUrl)}" download="payment-proof-${escapeAttr(txnId)}.${isPdf?'pdf':'jpg'}"
          class="modal-btn-primary" style="flex:1;padding:10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;text-align:center;text-decoration:none;display:block">
          Download
        </a>
      </div>
    `);
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
    viewProof,
    _handleProofUpload, _clearProof,
    _recalcOpening, _recalcTxn,
    deleteVendor
  };
})();
