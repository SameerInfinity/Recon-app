/* ═══════════════════════════════════════════
   SITE-INVENTORY.JS — Material Stock Tracker
   Track inward/outward movement of site materials
   ═══════════════════════════════════════════ */

const SiteInventory = (() => {

  const UNITS = ['bags', 'tonnes', 'sqft', 'nos', 'litres', 'rft', 'cubic-ft', 'kg'];
  const UNIT_LABELS = { bags: 'Bags', tonnes: 'Tonnes', sqft: 'Sq.Ft', nos: 'Nos', litres: 'Litres', rft: 'RFT', 'cubic-ft': 'Cu.Ft', kg: 'KG' };

  function renderInventoryHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '';

    const materials = proj.materials || [];
    const totalItems = materials.length;
    const lowStock = materials.filter(m => {
      if (!m.totalInward || m.totalInward === 0) return false;
      return (m.currentStock / m.totalInward) < 0.15;
    }).length;

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <div>
            <h2 class="hub-title">Site Stock (Inventory)</h2>
            <p class="hub-subtitle" style="margin-bottom: 8px">Track material inward/outward movements. Know exactly what's on site.</p>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <div class="phase-chip">
                <span class="phase-pct">${totalItems} Materials</span>
              </div>
              ${lowStock > 0 ? `<div class="phase-chip" style="background:#C7796620; color:#C77966"><span class="phase-pct">${Icons.render('alert', 10)} ${lowStock} Low Stock</span></div>` : ''}
            </div>
          </div>
        </div>
        <div class="hub-header-right">
          <button class="btn btn-primary" onclick="SiteInventory.showAddMaterialModal()">+ Add Material</button>
        </div>
      </div>
    `;

    if (materials.length === 0) {
      html += `
        <div class="cards-grid">
          <div style="grid-column:1/-1; padding:60px 32px; text-align:center; border:1px dashed var(--charcoal-border); border-radius:12px; background:var(--charcoal-mid)">
            <div style="font-size:40px; margin-bottom:12px">${Icons.render('package', 40)}</div>
            <h3 style="color:var(--text-secondary); font-size:16px; font-weight:700; margin-bottom:8px">No Materials Tracked</h3>
            <p style="color:var(--text-muted); font-size:13px; margin-bottom:20px">Add cement, steel, tiles, or any material to track stock on site.</p>
            <button class="btn btn-primary" onclick="SiteInventory.showAddMaterialModal()">+ Add First Material</button>
          </div>
        </div>
      `;
    } else {
      html += `<div class="cards-grid">`;
      materials.forEach(m => {
        const stock = parseFloat(m.currentStock) || 0;
        const inward = parseFloat(m.totalInward) || 0;
        const stockPct = inward > 0 ? Math.min(100, (stock / inward) * 100) : 0;
        const isLow = inward > 0 && stockPct < 15;
        const unitLabel = UNIT_LABELS[m.unit] || m.unit;

        html += `
          <div class="category-card" onclick="SiteInventory.showMaterialDetail('${escapeAttr(m.id)}')" style="cursor:pointer; transition:transform 0.15s, box-shadow 0.15s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div class="cat-card-header">
              <div class="cat-card-icon" style="background:${isLow ? '#C7796618' : 'var(--charcoal-surface)'}">
                ${isLow ? Icons.render('alert', 18) : Icons.render('package', 18)}
              </div>
              <div>
                <div class="cat-card-title">${escapeHtml(m.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px; text-transform:uppercase; letter-spacing:0.04em">${escapeHtml(unitLabel)}</div>
              </div>
            </div>
            <div style="margin-top:16px">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px">
                <span style="font-size:11px; color:var(--text-muted)">In Stock</span>
                <span style="font-family:var(--font-mono); font-weight:700; font-size:15px; color:${isLow ? '#C77966' : 'var(--steel-light)'}">${stock} ${escapeHtml(unitLabel)}</span>
              </div>
              <div style="height:4px; background:var(--charcoal-border); border-radius:2px; overflow:hidden">
                <div style="height:100%; width:${stockPct}%; background:${isLow ? '#C77966' : '#A8B89C'}; border-radius:2px; transition:width 0.3s"></div>
              </div>
              ${isLow ? `<div style="font-size:10px; color:#C77966; margin-top:4px; font-weight:600">${Icons.render('alert', 10)} LOW STOCK</div>` : ''}
            </div>
            <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--charcoal-border); display:grid; grid-template-columns:1fr 1fr; gap:8px">
              <div style="text-align:center">
                <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase">Total In</div>
                <div style="font-family:var(--font-mono); font-size:13px; font-weight:700; color:#A8B89C">${parseFloat(m.totalInward) || 0}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase">Used Out</div>
                <div style="font-family:var(--font-mono); font-size:13px; font-weight:700; color:#C77966">${parseFloat(m.totalOutward) || 0}</div>
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    return html;
  }

  // ── Add Material Modal ───────────────────────────────────
  function showAddMaterialModal() {
    const unitOptions = UNITS.map(u => `<option value="${u}">${UNIT_LABELS[u]}</option>`).join('');
    App.showModal(`
      <h3 class="modal-title">${Icons.render('package', 18)} Add Material to Inventory</h3>
      <div style="margin-bottom:14px">
        <label class="modal-label">Material Name *</label>
        <input class="modal-input" type="text" id="new-mat-name" placeholder="e.g. OPC Cement (53 Grade)">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Unit *</label>
          <select class="modal-input" id="new-mat-unit" style="appearance:none;cursor:pointer">
            ${unitOptions}
          </select>
        </div>
        <div>
          <label class="modal-label">Opening Stock</label>
          <input class="modal-input" type="number" id="new-mat-opening" placeholder="0" style="font-family:var(--font-mono)">
        </div>
      </div>
      <div style="margin-bottom:20px">
        <label class="modal-label">Notes</label>
        <input class="modal-input" type="text" id="new-mat-notes"
          placeholder="e.g. Store in dry location. Check for lumps before use.">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="SiteInventory.saveNewMaterial()" class="modal-btn-primary" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Add Material</button>
      </div>
    `);
  }

  async function saveNewMaterial() {
    const name = document.getElementById('new-mat-name').value.trim();
    if (!name) { App.toast('Material name is required', 'error'); return; }
    const unit = document.getElementById('new-mat-unit').value;
    const openingStock = parseFloat(document.getElementById('new-mat-opening').value) || 0;
    const notes = document.getElementById('new-mat-notes').value.trim();
    await State.addMaterial({ name, unit, openingStock, notes });
    App.closeModal();
    App.toast('Material added to inventory', 'success');
    App.showInventoryHub();
  }

  // ── Material Detail View ─────────────────────────────────
  function showMaterialDetail(id) {
    const proj = State.getCurrentProject();
    if (!proj) return;
    const m = (proj.materials || []).find(x => x.id === id);
    if (!m) return;

    const logs = (proj.materialLogs || [])
      .filter(l => l.materialId === id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const stock = parseFloat(m.currentStock) || 0;
    const inward = parseFloat(m.totalInward) || 0;
    const stockPct = inward > 0 ? Math.min(100, (stock / inward) * 100) : 0;
    const isLow = inward > 0 && stockPct < 15;
    const unitLabel = UNIT_LABELS[m.unit] || m.unit;

    let html = `
      <div class="hub-header">
        <div class="hub-header-left">
          <button onclick="App.showInventoryHub()" style="padding:6px 12px; margin-right:12px; border:1px solid var(--charcoal-border); background:var(--charcoal-mid); color:var(--text-secondary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600">← Back</button>
          <div>
            <h2 class="hub-title">${escapeHtml(m.name)}</h2>
            <p class="hub-subtitle">${escapeHtml(unitLabel)} ${m.notes ? '· ' + escapeHtml(m.notes) : ''}</p>
          </div>
        </div>
        <div class="hub-header-right">
          <button class="btn btn-secondary" onclick="SiteInventory.showMaterialLogModal('${escapeAttr(m.id)}','outward')" style="margin-right:8px">↑ Outward (Used)</button>
          <button class="btn btn-primary" onclick="SiteInventory.showMaterialLogModal('${escapeAttr(m.id)}','inward')">↓ Inward (Received)</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:16px; margin:20px 0">
        <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px; text-align:center">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Current Stock</div>
          <div style="font-family:var(--font-mono); font-size:28px; font-weight:800; color:${isLow ? '#C77966' : 'var(--steel-light)'}">${stock}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px">${unitLabel}</div>
          ${isLow ? `<div style="font-size:10px; color:#C77966; margin-top:6px; font-weight:700; background:#C7796614; padding:3px 8px; border-radius:4px; display:inline-block">${Icons.render('alert', 10)} LOW STOCK</div>` : ''}
        </div>
        <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px; text-align:center">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Total Received</div>
          <div style="font-family:var(--font-mono); font-size:28px; font-weight:800; color:#A8B89C">${parseFloat(m.totalInward) || 0}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px">${unitLabel}</div>
        </div>
        <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:12px; padding:20px; text-align:center">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px">Total Consumed</div>
          <div style="font-family:var(--font-mono); font-size:28px; font-weight:800; color:#C77966">${parseFloat(m.totalOutward) || 0}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px">${unitLabel}</div>
        </div>
      </div>

      <div style="background:var(--charcoal-mid); border:1px solid var(--charcoal-border); border-radius:8px; padding:12px 16px; margin-bottom:20px">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px">
          <span style="font-size:12px; color:var(--text-muted)">Stock Level</span>
          <span style="font-size:12px; color:var(--text-muted)">${Math.round(stockPct)}%</span>
        </div>
        <div style="height:8px; background:var(--charcoal-border); border-radius:4px; overflow:hidden">
          <div style="height:100%; width:${stockPct}%; background:${isLow ? '#C77966' : '#A8B89C'}; border-radius:4px; transition:width 0.5s"></div>
        </div>
      </div>

      <div class="section-title" style="color:var(--text-muted); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em">Movement Log</div>
      <table style="width:100%; border-collapse:collapse; margin-top:12px">
        <thead>
          <tr style="border-bottom:2px solid var(--charcoal-border)">
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Date</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Type</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:right">Quantity</th>
            <th style="padding:10px 12px; color:var(--text-muted); font-size:11px; text-transform:uppercase; text-align:left">Notes</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (logs.length === 0) {
      html += `<tr><td colspan="4" style="padding:32px; text-align:center; color:var(--text-muted)">No movements recorded yet.</td></tr>`;
    } else {
      logs.forEach(l => {
        const isIn = l.type === 'inward';
        html += `
          <tr style="border-bottom:1px solid var(--charcoal-border)">
            <td style="padding:12px; font-family:var(--font-mono); font-size:12px; color:var(--text-muted)">${new Date(l.date).toLocaleDateString('en-IN')}</td>
            <td style="padding:12px">
              <span style="display:inline-block; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:700; background:${isIn ? '#A8B89C20' : '#C7796620'}; color:${isIn ? '#A8B89C' : '#C77966'}">
                ${isIn ? '↓ INWARD' : '↑ OUTWARD'}
              </span>
            </td>
            <td style="padding:12px; text-align:right; font-family:var(--font-mono); font-weight:700; color:${isIn ? '#A8B89C' : '#C77966'}">${isIn ? '+' : '-'}${l.qty} ${escapeHtml(unitLabel)}</td>
            <td style="padding:12px; font-size:12px; color:var(--text-secondary)">${escapeHtml(l.notes || '—')}</td>
          </tr>
        `;
      });
    }

    html += `
        </tbody>
      </table>
      <div style="margin-top:32px; text-align:right">
        <button onclick="SiteInventory.deleteMaterial('${escapeAttr(m.id)}')" style="padding:8px 16px; border:1.5px solid #DC262620; background:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; color:#DC2626; font-family:inherit">${Icons.render('trash', 12)} Remove Material</button>
      </div>
    `;

    document.getElementById('content-area').innerHTML = html;
  }

  // ── Movement Log Modal ───────────────────────────────────
  function showMaterialLogModal(materialId, type) {
    const today = new Date().toISOString().split('T')[0];
    const isIn = type === 'inward';
    App.showModal(`
      <h3 class="modal-title">${isIn ? '↓ Record Inward' : '↑ Record Outward (Used)'}</h3>
      <input type="hidden" id="log-mat-id" value="${materialId}">
      <input type="hidden" id="log-mat-type" value="${type}">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px">
        <div>
          <label class="modal-label">Date *</label>
          <input class="modal-input" type="date" id="log-mat-date" value="${today}" style="font-family:var(--font-mono)">
        </div>
        <div>
          <label class="modal-label">Quantity *</label>
          <input class="modal-input" type="number" id="log-mat-qty" placeholder="0" style="font-family:var(--font-mono)">
        </div>
      </div>
      <div style="margin-bottom:20px">
        <label class="modal-label">Notes</label>
        <input class="modal-input" type="text" id="log-mat-notes"
          placeholder="${isIn ? 'e.g. Received from Ramesh Hardware' : 'e.g. Used for 2nd floor slab work'}">
      </div>
      <div style="display:flex; gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">Cancel</button>
        <button onclick="SiteInventory.saveMaterialLog()"
          class="${isIn ? 'modal-btn-success' : 'modal-btn-warning'}"
          style="flex:1; padding:11px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit">${isIn ? 'Record Inward' : 'Record Outward'}</button>
      </div>
    `);
  }

  async function saveMaterialLog() {
    const materialId = document.getElementById('log-mat-id').value;
    const type = document.getElementById('log-mat-type').value;
    const date = document.getElementById('log-mat-date').value;
    const qty = parseFloat(document.getElementById('log-mat-qty').value);
    const notes = document.getElementById('log-mat-notes').value.trim();

    if (!date) { App.toast('Date is required', 'error'); return; }
    if (!qty || qty <= 0) { App.toast('Enter a valid quantity', 'error'); return; }

    await State.addMaterialLog({ materialId, type, date, qty, notes });
    App.closeModal();
    App.toast(type === 'inward' ? 'Inward recorded' : 'Outward recorded', 'success');
    showMaterialDetail(materialId);
  }

  async function deleteMaterial(id) {
    App.showConfirmModal({
      icon: Icons.render('package', 24),
      title: 'Remove Material?',
      body: 'This will remove the material and all its movement logs permanently.',
      confirmLabel: 'Remove Material',
      onConfirm: async () => {
        await State.deleteMaterial(id);
        App.toast('Material removed', 'info');
        App.showInventoryHub();
      }
    });
  }

  return {
    renderInventoryHub,
    showAddMaterialModal, saveNewMaterial,
    showMaterialDetail,
    showMaterialLogModal, saveMaterialLog,
    deleteMaterial
  };
})();
