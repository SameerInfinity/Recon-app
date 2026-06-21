/* ═══════════════════════════════════════════════════════════
   FLAT-SALES.JS — Buyer Ledger & Payment Tracker
   Tracks flat buyers, agreed amounts, installments, and
   payment proofs for Indian residential/commercial projects
   ═══════════════════════════════════════════════════════════ */

const FlatSales = (() => {

  const PAYMENT_MODES = ['Cash', 'NEFT / RTGS', 'Cheque', 'UPI', 'Bank Transfer', 'DD / Pay Order'];
  const FLAT_STATUS   = ['Booked', 'Agreement Done', 'Possession Given', 'Cancelled'];

  // ── Formatting helpers ────────────────────────────────────
  const fmt  = (n) => typeof Financial !== 'undefined' ? Financial.fmt(n) : '₹' + (Number(n)||0).toLocaleString('en-IN');
  const fmtF = (n) => typeof Financial !== 'undefined' ? Financial.fmtFull(n) : '₹' + (Number(n)||0).toLocaleString('en-IN');
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ── Hub: list of all buyers ───────────────────────────────
  function renderHub() {
    const buyers = State.getBuyers ? State.getBuyers() : [];
    const totalAgreed  = buyers.reduce((s, b) => s + (parseFloat(b.agreedAmount) || 0), 0);
    const totalReceived = buyers.reduce((s, b) => {
      const paid = (b.payments || []).reduce((ps, p) => ps + (parseFloat(p.amount) || 0), 0);
      return s + paid + (parseFloat(b.downPayment) || 0);
    }, 0);
    const totalPending = Math.max(0, totalAgreed - totalReceived);

    const proj = State.getCurrentProject();

    let html = `
        <!-- Page Header -->
        <div class="hub-header" style="margin-bottom:20px">
          <div class="hub-header-left">
            <div>
              <h2 class="hub-title" style="font-size:22px">${Icons.render('building', 22)} Flat Sales / Purchaser</h2>
              <p class="hub-subtitle">Track buyers, agreed amounts, instalments and payment proofs.</p>
            </div>
          </div>
          <div class="hub-header-right">
            <div class="phase-chip" style="margin-right:8px">
              <span class="phase-pct">${buyers.length} Buyer${buyers.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="phase-chip" style="margin-right:8px; background:rgba(168,184,156,0.15); color:#A8B89C">
              <span class="phase-pct">Received: ${fmt(totalReceived)}</span>
            </div>
            ${totalPending > 0 ? `<div class="phase-chip" style="margin-right:8px; background:rgba(199,121,102,0.15); color:#C77966"><span class="phase-pct">Pending: ${fmt(totalPending)}</span></div>` : ''}
            <button class="btn btn-primary" onclick="FlatSales.showAddBuyerModal()" style="margin-left:8px">+ Add Buyer</button>
          </div>
        </div>

        <!-- Summary Bar -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
          ${_summaryCard('Total Agreed', fmtF(totalAgreed), '#9E7758')}
          ${_summaryCard('Total Received', fmtF(totalReceived), '#A8B89C')}
          ${totalPending > 0 ? _summaryCard('Pending', fmtF(totalPending), '#C77966') : _summaryCard('Fully Paid ✓', 'All Cleared', '#A8B89C')}
          ${_summaryCard('Buyers', buyers.length, 'var(--steel-light)')}
        </div>
    `;

    if (buyers.length === 0) {
      html += `
        <div style="padding:60px 32px;text-align:center;border:1px dashed var(--charcoal-border);border-radius:12px;background:var(--charcoal-mid)">
          <div style="margin-bottom:12px;color:var(--text-muted)">${Icons.render('building', 48)}</div>
          <h3 style="color:var(--text-secondary);font-size:16px;font-weight:700;margin-bottom:8px">No Buyers Added Yet</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">Add your first flat buyer to track their payment schedule and record installments.</p>
          <button class="btn btn-primary" onclick="FlatSales.showAddBuyerModal()">+ Add First Buyer</button>
        </div>`;
    } else {
      html += `<div style="display:flex;flex-direction:column;gap:12px">`;
      buyers.forEach(b => {
        const paid    = (b.payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
                      + (parseFloat(b.downPayment) || 0);
        const agreed  = parseFloat(b.agreedAmount) || 0;
        const pending = Math.max(0, agreed - paid);
        const pct     = agreed > 0 ? Math.min(100, Math.round((paid / agreed) * 100)) : 0;
        const statusColor = { 'Booked':'#9E7758', 'Agreement Done':'#A8B89C', 'Possession Given':'#7B96A3', 'Cancelled':'#C77966' };
        const sc = statusColor[b.status] || '#9E7758';

        html += `
          <div onclick="App.showFlatSalesBuyer('${escapeAttr(b.id)}')"
               style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:20px;cursor:pointer;transition:border-color .15s,box-shadow .15s"
               onmouseover="this.style.borderColor='var(--amber-muted)';this.style.boxShadow='0 4px 20px rgba(0,0,0,.3)'"
               onmouseout="this.style.borderColor='var(--charcoal-border)';this.style.boxShadow=''">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                  <span style="font-size:18px;font-weight:800;color:var(--text-primary)">${escapeHtml(b.name)}</span>
                  <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:${sc}20;color:${sc}">${escapeHtml(b.status || 'Booked')}</span>
                  ${b.flatNo ? `<span style="font-size:11px;color:var(--text-muted)">Flat ${escapeHtml(b.flatNo)}</span>` : ''}
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
                  ${b.phone ? `📞 ${escapeHtml(b.phone)}` : ''} ${b.address ? ` &nbsp;·&nbsp; ${escapeHtml(b.address)}` : ''}
                </div>
                <!-- Progress bar -->
                <div style="background:var(--charcoal);border-radius:4px;height:6px;overflow:hidden;max-width:400px">
                  <div style="background:${pct >= 100 ? '#A8B89C' : 'var(--amber)'};height:100%;width:${pct}%;transition:width .3s;border-radius:4px"></div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${pct}% received · ${(b.payments||[]).length + (parseFloat(b.downPayment)>0?1:0)} payments</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">Agreed</div>
                <div style="font-family:var(--font-mono);font-weight:700;font-size:17px;color:var(--text-primary)">${fmtF(agreed)}</div>
                <div style="font-size:11px;color:#A8B89C;margin-top:6px">Received: ${fmt(paid)}</div>
                ${pending > 0 ? `<div style="font-size:11px;color:#C77966">Pending: ${fmt(pending)}</div>` : `<div style="font-size:11px;color:#A8B89C">✓ Fully Paid</div>`}
              </div>
            </div>
          </div>`;
      });
      html += `</div>`;
    }

    return html;
  }

  // ── Summary card helper ───────────────────────────────────
  function _summaryCard(label, value, color) {
    return `
      <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:6px">${label}</div>
        <div style="font-family:var(--font-mono);font-weight:700;font-size:18px;color:${color}">${value}</div>
      </div>`;
  }

  // ── Add Buyer Modal ───────────────────────────────────────
  function showAddBuyerModal(editId) {
    const isEdit = !!editId;
    let b = {};
    if (isEdit) {
      b = (State.getBuyers() || []).find(x => x.id === editId) || {};
    }
    const today = new Date().toISOString().split('T')[0];

    App.showModal(`
      <h3 class="modal-title">
        ${Icons.render('building', 16)} ${isEdit ? 'Edit Buyer' : 'Add New Buyer'}
      </h3>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="fs-label">Buyer Name *</label>
          <input id="fs-name" class="fs-inp" placeholder="e.g. Ramesh Sharma" value="${escapeAttr(b.name||'')}">
        </div>
        <div>
          <label class="fs-label">Flat / Unit No.</label>
          <input id="fs-flatno" class="fs-inp" placeholder="e.g. A-301" value="${escapeAttr(b.flatNo||'')}">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="fs-label">Phone Number</label>
          <input id="fs-phone" class="fs-inp" placeholder="10-digit mobile" value="${escapeAttr(b.phone||'')}" style="font-family:var(--font-mono)">
        </div>
        <div>
          <label class="fs-label">Status</label>
          <select id="fs-status" class="fs-inp">
            ${FLAT_STATUS.map(s => `<option value="${escapeAttr(s)}" ${(b.status||'Booked')===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="margin-bottom:12px">
        <label class="fs-label">Buyer Address</label>
        <input id="fs-address" class="fs-inp" placeholder="Current residential address" value="${escapeAttr(b.address||'')}">
      </div>

      <div style="background:var(--bg-elev-2);border-radius:var(--r-md);padding:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">💰 Payment Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="fs-label">Agreed Total Amount (₹) *</label>
            <input type="number" id="fs-agreed" class="fs-inp" placeholder="0" value="${escapeAttr(b.agreedAmount||'')}" min="0" style="font-family:var(--font-mono)">
          </div>
          <div>
            <label class="fs-label">Down Payment (₹)</label>
            <input type="number" id="fs-down" class="fs-inp" placeholder="0" value="${escapeAttr(b.downPayment||'')}" min="0" style="font-family:var(--font-mono)">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label class="fs-label">Monthly Installment (₹)</label>
            <input type="number" id="fs-emi" class="fs-inp" placeholder="0" value="${escapeAttr(b.monthlyEMI||'')}" min="0" style="font-family:var(--font-mono)">
          </div>
          <div>
            <label class="fs-label">Mode of Payment</label>
            <select id="fs-mode" class="fs-inp">
              ${PAYMENT_MODES.map(m => `<option value="${escapeAttr(m)}" ${(b.paymentMode||'Cash')===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div style="margin-bottom:20px">
        <label class="fs-label">Date of First Payment / Booking</label>
        <input type="date" id="fs-firstdate" class="fs-inp" value="${escapeAttr(b.firstPaymentDate||today)}">
      </div>

      <div style="margin-bottom:20px">
        <label class="fs-label">Notes</label>
        <textarea id="fs-notes" class="fs-inp" rows="2" placeholder="Any additional terms, remarks…" style="resize:vertical">${escapeHtml(b.notes||'')}</textarea>
      </div>

      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">Cancel</button>
        <button onclick="FlatSales.saveBuyer(${isEdit ? `'${escapeAttr(editId)}'` : 'null'})" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">${isEdit ? 'Update Buyer' : 'Save Buyer'}</button>
      </div>
    `);
  }

  function saveBuyer(editId) {
    const name = document.getElementById('fs-name')?.value?.trim();
    if (!name) { App.toast('Buyer name is required', 'warning'); return; }
    const agreed = parseFloat(document.getElementById('fs-agreed')?.value) || 0;
    if (!agreed) { App.toast('Agreed amount is required', 'warning'); return; }

    const data = {
      name,
      flatNo:          document.getElementById('fs-flatno')?.value?.trim(),
      phone:           document.getElementById('fs-phone')?.value?.trim(),
      address:         document.getElementById('fs-address')?.value?.trim(),
      status:          document.getElementById('fs-status')?.value,
      agreedAmount:    agreed,
      downPayment:     parseFloat(document.getElementById('fs-down')?.value) || 0,
      monthlyEMI:      parseFloat(document.getElementById('fs-emi')?.value) || 0,
      paymentMode:     document.getElementById('fs-mode')?.value,
      firstPaymentDate:document.getElementById('fs-firstdate')?.value,
      notes:           document.getElementById('fs-notes')?.value?.trim(),
    };

    if (editId) {
      State.updateBuyer(editId, data);
      App.closeModal();
      App.toast('Buyer updated', 'success');
      App.showFlatSalesBuyer(editId);
    } else {
      const buyer = State.addBuyer(data);
      App.closeModal();
      App.toast('Buyer added', 'success');
      App.showFlatSalesBuyer(buyer.id);
    }
  }

  // ── Buyer Detail View ─────────────────────────────────────
  function renderBuyerDetail(buyerId) {
    const buyers = State.getBuyers ? State.getBuyers() : [];
    const b = buyers.find(x => x.id === buyerId);
    if (!b) return '<div style="padding:40px;text-align:center;color:var(--text-muted)">Buyer not found.</div>';

    const agreed   = parseFloat(b.agreedAmount) || 0;
    const down     = parseFloat(b.downPayment) || 0;
    const payments = b.payments || [];
    const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) + down;
    const pending   = Math.max(0, agreed - totalPaid);
    const pct       = agreed > 0 ? Math.min(100, Math.round((totalPaid / agreed) * 100)) : 0;
    const statusColor = { 'Booked':'#9E7758', 'Agreement Done':'#A8B89C', 'Possession Given':'#7B96A3', 'Cancelled':'#C77966' };
    const sc = statusColor[b.status] || '#9E7758';

    let paymentRows = '';
    // Down payment row (if any)
    if (down > 0) {
      paymentRows += _paymentRow({
        id: '__down',
        date: b.firstPaymentDate,
        amount: down,
        mode: b.paymentMode,
        notes: 'Down Payment',
        proofUrl: '',
      }, buyerId, true);
    }
    payments.slice().sort((a,z) => new Date(a.date) - new Date(z.date)).forEach(p => {
      paymentRows += _paymentRow(p, buyerId, false);
    });

    return `
        <!-- Buyer Header Card -->
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:14px;padding:22px 24px;margin-bottom:20px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <span style="font-size:22px;font-weight:800;color:var(--text-primary)">${escapeHtml(b.name)}</span>
                <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:${sc}20;color:${sc}">${escapeHtml(b.status||'Booked')}</span>
                ${b.flatNo ? `<span style="font-size:12px;color:var(--text-muted);font-weight:600">Flat ${escapeHtml(b.flatNo)}</span>` : ''}
              </div>
              ${b.phone ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:3px">📞 ${escapeHtml(b.phone)}</div>` : ''}
              ${b.address ? `<div style="font-size:12px;color:var(--text-muted)">📍 ${escapeHtml(b.address)}</div>` : ''}
              ${b.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic">📝 ${escapeHtml(b.notes)}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button onclick="FlatSales.showAddBuyerModal('${escapeAttr(b.id)}')"
                style="padding:8px 16px;border:1px solid var(--charcoal-border);background:var(--charcoal);color:var(--text-secondary);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">
                ${Icons.render('pencil', 12)} Edit
              </button>
              <button onclick="FlatSales.confirmDeleteBuyer('${escapeAttr(b.id)}','${escapeAttr(b.name)}');"
                style="padding:8px 16px;border:1px solid #C7796630;background:none;color:#C77966;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">
                ${Icons.render('trash', 12)} Delete
              </button>
            </div>
          </div>

          <!-- Progress -->
          <div style="margin-top:18px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:11px;color:var(--text-muted)">Payment Progress — ${pct}% received</span>
              <span style="font-size:11px;color:var(--text-muted)">${fmt(totalPaid)} of ${fmtF(agreed)}</span>
            </div>
            <div style="background:var(--charcoal);border-radius:6px;height:8px;overflow:hidden">
              <div style="background:${pct>=100?'#A8B89C':'var(--amber)'};height:100%;width:${pct}%;transition:width .4s;border-radius:6px"></div>
            </div>
          </div>

          <!-- Summary chips -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
            ${_chip('Agreed Total', fmtF(agreed), '#9E7758')}
            ${_chip('Received', fmtF(totalPaid), '#A8B89C')}
            ${_chip(pending>0 ? 'Pending' : 'Fully Paid', pending>0 ? fmtF(pending) : '✓', pending>0?'#C77966':'#A8B89C')}
            ${b.monthlyEMI > 0 ? _chip('Monthly EMI', fmt(b.monthlyEMI), 'var(--steel-light)') : ''}
            ${b.paymentMode ? _chip('Mode', b.paymentMode, 'var(--text-muted)') : ''}
          </div>
        </div>

        <!-- Payment History -->
        <div class="section-card">
          <div class="section-card-header" style="cursor:default">
            <span class="section-card-title">${Icons.render('listChecks', 16)} Payment History</span>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-family:var(--font-mono);font-weight:700;color:var(--amber)">${fmtF(totalPaid)}</span>
              <button onclick="FlatSales.showAddPaymentModal('${escapeAttr(b.id)}')"
                class="btn btn-primary" style="padding:6px 14px;font-size:12px">+ Add Payment</button>
            </div>
          </div>
          <div class="section-card-body" style="padding:0">
            ${payments.length === 0 && down === 0 ? `
              <div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">
                No payments recorded yet. Click <strong>+ Add Payment</strong> to log the first installment.
              </div>` : `
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="border-bottom:2px solid var(--charcoal-border)">
                    <th style="padding:10px 14px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left;letter-spacing:.08em">Date</th>
                    <th style="padding:10px 14px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left">Description</th>
                    <th style="padding:10px 14px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left">Mode</th>
                    <th style="padding:10px 14px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:left">Proof</th>
                    <th style="padding:10px 14px;font-size:10px;text-transform:uppercase;color:var(--text-muted);text-align:right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${paymentRows}</tbody>
                <tfoot>
                  <tr style="background:var(--charcoal-mid)">
                    <td colspan="4" style="padding:12px 14px;font-size:12px;font-weight:700;color:var(--text-secondary)">TOTAL RECEIVED</td>
                    <td style="padding:12px 14px;font-family:var(--font-mono);font-weight:700;font-size:16px;color:#A8B89C;text-align:right">${fmtF(totalPaid)}</td>
                    <td></td>
                  </tr>
                  ${pending > 0 ? `<tr><td colspan="4" style="padding:10px 14px;font-size:12px;font-weight:700;color:#C77966">PENDING</td><td style="padding:10px 14px;font-family:var(--font-mono);font-weight:700;font-size:15px;color:#C77966;text-align:right">${fmtF(pending)}</td><td></td></tr>` : ''}
                </tfoot>
              </table>`}
          </div>
        </div>`;
  }

  function _chip(label, value, color) {
    return `<div style="background:var(--charcoal);border:1px solid var(--charcoal-border);border-radius:8px;padding:8px 12px;min-width:0">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:3px">${escapeHtml(label)}</div>
      <div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:${color}">${escapeHtml(value)}</div>
    </div>`;
  }

  function _paymentRow(p, buyerId, isDown) {
    const resolvedUrl = typeof State !== 'undefined' ? State.getLocalImage(p.proofUrl) : p.proofUrl;
    const proofCell = p.proofUrl
      ? `<td style="padding:10px 14px"><img src="${escapeAttr(resolvedUrl)}" alt="proof" style="height:36px;border-radius:4px;cursor:pointer;object-fit:cover" onclick="FlatSales._viewProof('${escapeAttr(resolvedUrl)}')"></td>`
      : `<td style="padding:10px 14px;color:var(--text-muted);font-size:11px">—</td>`;
    const deleteBtn = isDown ? '' : `<button onclick="FlatSales.deletePayment('${escapeAttr(buyerId)}','${escapeAttr(p.id)}')" style="background:none;border:1px solid #C7796640;color:#C77966;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">Del</button>`;
    const refText = p.refNo ? `<div style="font-size:11px;color:var(--text-muted)">Ref: ${escapeHtml(p.refNo)}</div>` : '';
    return `
      <tr style="border-bottom:1px solid var(--charcoal-border)">
        <td style="padding:10px 14px;font-family:var(--font-mono);font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtDate(p.date)}</td>
        <td style="padding:10px 14px;font-size:13px;color:var(--text-secondary)">
          ${escapeHtml(p.notes || (isDown ? 'Down Payment' : 'Instalment'))}
          ${refText}
        </td>
        <td style="padding:10px 14px;font-size:12px;color:var(--text-muted)">${escapeHtml(p.mode || '—')}</td>
        ${proofCell}
        <td style="padding:10px 14px;font-family:var(--font-mono);font-weight:700;color:#A8B89C;text-align:right;white-space:nowrap">${fmtF(p.amount)}</td>
        <td style="padding:10px 14px;text-align:right">${deleteBtn}</td>
      </tr>`;
  }

  // ── Add Payment Modal ─────────────────────────────────────
  function showAddPaymentModal(buyerId) {
    const today = new Date().toISOString().split('T')[0];
    const b = (State.getBuyers()||[]).find(x => x.id === buyerId);
    const defaultMode = b?.paymentMode || 'Cash';

    App.showModal(`
      <h3 class="modal-title">💳 Record Payment</h3>
      <input type="hidden" id="pay-buyer-id" value="${escapeAttr(buyerId)}">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label class="fs-label">Payment Date *</label>
          <input type="date" id="pay-date" class="fs-inp" value="${today}">
        </div>
        <div>
          <label class="fs-label">Amount (₹) *</label>
          <input type="number" id="pay-amount" class="fs-inp" style="font-family:var(--font-mono)" placeholder="0" min="0">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label class="fs-label">Mode of Payment</label>
          <select id="pay-mode" class="fs-inp">
            ${PAYMENT_MODES.map(m=>`<option value="${escapeAttr(m)}" ${defaultMode===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="fs-label">Reference / Cheque No.</label>
          <input id="pay-ref" class="fs-inp" placeholder="UTR, Cheque No., etc." style="font-family:var(--font-mono)">
        </div>
      </div>

      <div style="margin-bottom:14px">
        <label class="fs-label">Description / Notes</label>
        <input id="pay-notes" class="fs-inp" placeholder="e.g. 2nd Instalment, Slab payment…">
      </div>

      <!-- Proof Upload -->
      <div style="margin-bottom:20px">
        <label class="fs-label">Payment Proof (Photo / Screenshot)</label>
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap">
          <input type="file" id="pay-proof-file" accept="image/*" style="display:none" onchange="FlatSales._handleProofUpload(this)">
          <input type="file" id="pay-proof-file-cam" accept="image/*" capture="environment" style="display:none" onchange="FlatSales._handleProofUpload(this)">
          ${/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? `
            <button onclick="document.getElementById('pay-proof-file-cam').click()"
              class="modal-btn-cancel"
              style="padding:9px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">
              📷 Take Photo
            </button>
            <button onclick="document.getElementById('pay-proof-file').click()"
              class="modal-btn-cancel"
              style="padding:9px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">
              📎 Upload Proof
            </button>
          ` : `
            <button onclick="document.getElementById('pay-proof-file').click()"
              class="modal-btn-cancel"
              style="padding:9px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">
              📎 Upload Proof
            </button>
          `}
          <span id="pay-proof-status" style="font-size:12px;color:var(--text-muted)">No file chosen</span>
        </div>
        <div id="pay-proof-preview" style="margin-top:8px"></div>
      </div>

      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">Cancel</button>
        <button onclick="FlatSales.savePayment()" style="flex:1;padding:11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;background:var(--success);color:#fff;border:none;font-family:inherit">💳 Save Payment</button>
      </div>
    `);
  }

  const exports = {
    renderHub,
    renderBuyerDetail,
    showAddBuyerModal,
    saveBuyer,
    showAddPaymentModal,
    savePayment,
    deletePayment,
    confirmDeleteBuyer,
  };

  // Handle proof image upload — compress and store as base64
  exports._handleProofUpload = function(input) {
    const file = input.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('pay-proof-status');
    const previewEl = document.getElementById('pay-proof-preview');
    if (statusEl) statusEl.textContent = 'Reading…';

    const reader = new FileReader();
    reader.onload = (e) => {
      // Use a canvas to compress to max 800px wide
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 900;
        const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
        canvas.width  = img.width  * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.75);
        // Store URL on the status element for savePayment to read
        if (statusEl) { statusEl.innerHTML = `${Icons.render('check', 11)} ` + file.name; statusEl.dataset.url = compressed; }
        if (previewEl) previewEl.innerHTML = `<img src="${compressed}" style="max-height:120px;max-width:100%;border-radius:8px;margin-top:4px;object-fit:contain">`;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  function savePayment() {
    const buyerId = document.getElementById('pay-buyer-id')?.value;
    const date    = document.getElementById('pay-date')?.value;
    const amount  = parseFloat(document.getElementById('pay-amount')?.value) || 0;
    const mode    = document.getElementById('pay-mode')?.value;
    const refNo   = document.getElementById('pay-ref')?.value?.trim();
    const notes   = document.getElementById('pay-notes')?.value?.trim();
    const statusEl = document.getElementById('pay-proof-status');
    const rawProof = statusEl?.dataset?.url || '';

    if (!date) { App.toast('Date is required', 'warning'); return; }
    if (!amount || amount <= 0) { App.toast('Enter a valid amount', 'warning'); return; }

    const paymentId = generateId();
    let proofUrl = '';
    if (rawProof) {
      if (rawProof.startsWith('data:image')) {
        const key = paymentId + '_proof';
        if (typeof State !== 'undefined' && State.saveLocalImage) {
          State.saveLocalImage(key, rawProof);
        }
        proofUrl = 'local-image://' + key;
      } else {
        proofUrl = rawProof;
      }
    }

    State.addBuyerPayment(buyerId, { id: paymentId, date, amount, mode, refNo, notes, proofUrl });
    App.closeModal();
    App.toast('Payment recorded', 'success');
    App.showFlatSalesBuyer(buyerId);
  }

  function deletePayment(buyerId, paymentId) {
    App.showConfirmModal({
      icon: Icons.render('fileText', 24),
      title: 'Delete Payment?',
      body: 'This payment record will be permanently removed.',
      confirmLabel: 'Delete Payment',
      onConfirm: () => {
        if (typeof State !== 'undefined' && State.deleteLocalImage) {
          State.deleteLocalImage(paymentId + '_proof');
        }
        State.deleteBuyerPayment(buyerId, paymentId);
        App.toast('Payment deleted', 'info');
        App.showFlatSalesBuyer(buyerId);
      }
    });
  }

  function confirmDeleteBuyer(id, name) {
    App.showConfirmModal({
      icon: Icons.render('building', 24),
      title: `Delete "${escapeHtml(name)}"?`,
      body: 'This will permanently delete this buyer and all their payment records.',
      confirmLabel: 'Delete Buyer',
      onConfirm: () => {
        State.deleteBuyer(id);
        App.toast('Buyer deleted', 'info');
        App.showFlatSales();
      }
    });
  }

  exports._viewProof = function(url) {
    const overlay = document.createElement('div');
    overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
    overlay.onclick = () => overlay.remove();
    // Build proof overlay via DOM to avoid innerHTML injection from crafted URLs
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative';
    const img = document.createElement('img');
    img.src = url;   // Safe — DOM property, no HTML parsing
    img.style.cssText = 'max-width:92vw;max-height:88vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6)';
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'position:absolute;top:-10px;right:-10px;background:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => overlay.remove();
    wrapper.appendChild(img);
    wrapper.appendChild(closeBtn);
    overlay.appendChild(wrapper);
    document.body.appendChild(overlay);
  };

  return exports;
})();
