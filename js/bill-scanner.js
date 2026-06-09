/* ═══════════════════════════════════════════
   BILL-SCANNER.JS — AI Photo OCR Scanner
   Snap photos of receipts, extract via AI,
   and save them to the phase's local ledger.
   ═══════════════════════════════════════════ */

const BillScanner = (() => {
  // Compress image before sending to AI to save bandwidth
  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 1200px
          const MAX_DIM = 1200;
          if (width > height && width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          } else if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Export as JPEG with 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Call the Gemini API via existing proxy
  async function scanBillWithAI(base64Image) {
    // Strip the "data:image/jpeg;base64," prefix for the API
    const base64Data = base64Image.split(',')[1];
    
    const payload = {
      systemInstruction: {
        parts: [{
          text: `You are an OCR and data extraction assistant for Indian construction bills ("Kachha" bills, GST invoices).
Extract the details from the uploaded bill image.
Strictly return a JSON object (no markdown, no backticks, just raw JSON).
Schema:
{
  "vendor": "String (Name of the shop/hardware store, or 'Unknown Shop')",
  "date": "String (YYYY-MM-DD format if found, else empty string)",
  "totalAmount": "Number (The final total amount on the bill)",
  "items": [
    {
      "desc": "String (Item name/description)",
      "qty": "Number",
      "rate": "Number",
      "amount": "Number"
    }
  ]
}`
        }]
      },
      contents: [
        {
          parts: [
            { text: "Extract the details from this bill image." },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        }
      ]
    };

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to scan bill');
    }

    const data = await res.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Attempt to parse JSON. Gemini might wrap in ```json ... ``` despite instructions.
    let jsonStr = textOutput.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json/, '');
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```/, '');
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.replace(/```$/, '');
    jsonStr = jsonStr.trim();
    
    return JSON.parse(jsonStr);
  }

  // Renders the Phase Bills Hub UI
  function renderBillsHub(phaseId) {
    const proj = State.getCurrentProject();
    if (!proj) return '';
    const phase = proj.phases.find(p => p.id === phaseId);
    if (!phase) return '';

    const bills = State.getBills(phaseId);
    const totalBillsAmount = bills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

    let billsHtml = '';
    if (bills.length === 0) {
      billsHtml = `
        <div style="padding:40px 20px;text-align:center;color:var(--text-muted);background:var(--charcoal-mid);border-radius:12px;border:1px dashed var(--charcoal-border)">
          <div style="font-size:32px;margin-bottom:12px;opacity:0.6">📸</div>
          <h3 style="font-size:15px;color:var(--text-secondary);margin-bottom:6px">No Bills Scanned Yet</h3>
          <p style="font-size:12px;line-height:1.5;max-width:300px;margin:0 auto">Snap photos of hardware store receipts (Kachha bills) and AI will extract the items and totals for you.</p>
        </div>`;
    } else {
      billsHtml = bills.map(b => {
        const itemHtml = (b.items || []).map(i => `
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-top:4px">
            <span>${i.qty}x ${i.desc}</span>
            <span class="mono">${Financial.fmt(i.amount)}</span>
          </div>
        `).join('');

        return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;border-bottom:1px solid var(--charcoal-border);padding-bottom:12px">
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${b.vendor || 'Unknown Shop'}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${b.date || 'No Date'}</div>
            </div>
            <div style="text-align:right">
              <div class="mono" style="font-size:16px;font-weight:700;color:var(--text-primary)">${Financial.fmtFull(b.totalAmount)}</div>
              <button class="btn-ghost-sm" style="color:var(--red-light);margin-top:6px;padding:4px 8px;font-size:10px" onclick="BillScanner.deleteBillUI(${phaseId}, '${b.id}')">Delete</button>
            </div>
          </div>
          <div style="background:var(--charcoal-dark);border-radius:6px;padding:8px">
            <div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:6px;font-weight:700">Extracted Items</div>
            ${itemHtml || '<div style="font-size:11px;color:var(--text-muted)">No items extracted</div>'}
          </div>
        </div>`;
      }).join('');
    }

    const html = `
      <div class="breadcrumb">
        <a onclick="App.showOverview()">Overview</a>
        <span class="breadcrumb-sep">›</span>
        <a onclick="${phaseId === 10 ? 'App.showInteriorHub()' : `App.showPhaseHub(${phaseId})`}">${Phases.iconFor(phase.icon, 11)} <span style="margin-left:6px">${phase.name}</span></a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">📸 Bills & Receipts</span>
      </div>

      <div class="category-hub-header" style="flex-wrap:wrap;gap:16px">
        <div>
          <div class="category-hub-title">📸 <span style="margin-left:10px">Bills & Receipts</span></div>
          <div class="category-hub-subtitle">AI Scanner Ledger for ${phase.name}</div>
        </div>
        <div class="category-hub-stats">
          <div class="category-hub-stat">
            <span class="category-hub-stat-label">Total Bills</span>
            <span class="category-hub-stat-value">${bills.length}</span>
          </div>
          <div class="category-hub-stat">
            <span class="category-hub-stat-label">Total Amount</span>
            <span class="category-hub-stat-value mono">${Financial.fmtFull(totalBillsAmount)}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:24px">
        <label class="btn-primary" style="cursor:pointer;flex:1;text-align:center;justify-content:center">
          <span style="margin-right:8px">📸</span> Scan New Bill
          <input type="file" accept="image/*" capture="environment" style="display:none" onchange="BillScanner.handleUpload(event, ${phaseId})">
        </label>
      </div>

      <div id="scanner-status" style="display:none;background:var(--amber-light-bg);border:1px solid var(--amber-border);color:var(--amber);padding:12px;border-radius:8px;font-size:12px;margin-bottom:24px;font-weight:600">
        <span class="spinner" style="width:12px;height:12px;border-top-color:var(--amber);border-width:2px;margin-right:8px"></span> Analyzing bill with AI...
      </div>

      <div id="review-container" style="display:none;margin-bottom:24px"></div>

      <div class="bills-list" id="bills-list">
        ${billsHtml}
      </div>
    `;
    return html;
  }

  // Handle file input
  async function handleUpload(e, phaseId) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('scanner-status');
    const reviewEl = document.getElementById('review-container');
    if (statusEl) statusEl.style.display = 'block';
    if (reviewEl) reviewEl.style.display = 'none';

    try {
      // 1. Compress Image
      const base64Image = await compressImage(file);
      
      // 2. Scan with AI
      const aiResult = await scanBillWithAI(base64Image);
      
      // 3. Show Review Form
      showReviewForm(phaseId, aiResult, base64Image);
      
    } catch (err) {
      console.error('[BillScanner]', err);
      App.toast('Failed to scan bill: ' + err.message, 'error');
    } finally {
      if (statusEl) statusEl.style.display = 'none';
      // Reset input so the same file can be selected again if needed
      e.target.value = '';
    }
  }

  // Show the extracted data for user correction before saving
  function showReviewForm(phaseId, aiResult, base64Image) {
    const reviewEl = document.getElementById('review-container');
    if (!reviewEl) return;

    // If AI failed to extract total but got items, auto-sum it initially
    let initialTotal = Number(aiResult.totalAmount) || 0;
    if (initialTotal === 0 && aiResult.items && aiResult.items.length > 0) {
      initialTotal = aiResult.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }

    // Build items HTML for review
    const itemsHtml = (aiResult.items || []).map((item, idx) => `
      <div class="field-row cols-4" style="margin-bottom:8px">
        <div class="field-group" style="flex:2"><input class="field-input item-desc" data-idx="${idx}" value="${item.desc || ''}" placeholder="Item"></div>
        <div class="field-group"><input class="field-input mono item-qty" type="number" data-idx="${idx}" value="${item.qty || 0}" placeholder="Qty" oninput="BillScanner.recalcRow(${idx})"></div>
        <div class="field-group"><input class="field-input mono item-rate" type="number" data-idx="${idx}" value="${item.rate || 0}" placeholder="Rate" oninput="BillScanner.recalcRow(${idx})"></div>
        <div class="field-group"><input class="field-input mono item-amt" type="number" data-idx="${idx}" value="${item.amount || 0}" placeholder="Amt" oninput="BillScanner.recalcTotal()"></div>
      </div>
    `).join('');

    reviewEl.innerHTML = `
      <div class="card" style="border:1px solid var(--amber-border);box-shadow:0 4px 12px rgba(0,0,0,0.2)">
        <div style="font-weight:700;font-size:14px;color:var(--amber);margin-bottom:16px;display:flex;justify-content:space-between">
          <span>Review Extracted Bill</span>
          <button class="btn-ghost-sm" onclick="document.getElementById('review-container').style.display='none'">Cancel</button>
        </div>
        
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div style="flex:1">
            <img src="${base64Image}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;border:1px solid var(--charcoal-border)">
          </div>
          <div style="flex:2">
            <div class="field-group">
              <label class="field-label">Vendor / Shop Name</label>
              <input class="field-input" id="review-vendor" value="${aiResult.vendor || ''}">
            </div>
            <div class="field-row cols-2">
              <div class="field-group">
                <label class="field-label">Date</label>
                <input class="field-input" id="review-date" value="${aiResult.date || ''}" placeholder="YYYY-MM-DD">
              </div>
              <div class="field-group">
                <label class="field-label">Total Amount</label>
                <div class="currency-input-wrap">
                  <span class="currency-symbol">₹</span>
                  <input class="field-input mono" type="number" id="review-total" value="${initialTotal}">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="background:var(--charcoal-dark);border-radius:8px;padding:12px;margin-bottom:16px">
          <label class="field-label" style="margin-bottom:8px">Extracted Items</label>
          ${itemsHtml || '<div style="font-size:12px;color:var(--text-muted)">No items extracted.</div>'}
        </div>

        <button id="save-bill-btn" class="btn-primary" style="width:100%" onclick="BillScanner.saveReviewedBill(${phaseId})">Save Bill to Ledger</button>
      </div>
    `;
    reviewEl.style.display = 'block';
  }

  // Save the corrected review form
  async function saveReviewedBill(phaseId) {
    const btn = document.getElementById('save-bill-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    const vendor = document.getElementById('review-vendor').value.trim();
    const date = document.getElementById('review-date').value.trim();
    const totalAmount = Number(document.getElementById('review-total').value) || 0;
    
    const items = [];
    document.querySelectorAll('.item-desc').forEach(descEl => {
      const idx = descEl.dataset.idx;
      const qtyEl = document.querySelector(`.item-qty[data-idx="${idx}"]`);
      const rateEl = document.querySelector(`.item-rate[data-idx="${idx}"]`);
      const amtEl = document.querySelector(`.item-amt[data-idx="${idx}"]`);
      
      items.push({
        desc: descEl.value.trim(),
        qty: Number(qtyEl?.value) || 0,
        rate: Number(rateEl?.value) || 0,
        amount: Number(amtEl?.value) || 0
      });
    });

    const billObj = { vendor, date, totalAmount, items };
    await State.addBill(phaseId, billObj);
    
    App.toast('Bill saved successfully!', 'success');
    
    // Re-render the view
    App.showPhaseBills(phaseId);
  }

  // Delete a bill
  async function deleteBillUI(phaseId, billId) {
    if (confirm('Are you sure you want to delete this scanned bill?')) {
      await State.deleteBill(phaseId, billId);
      App.toast('Bill deleted');
      App.showPhaseBills(phaseId);
    }
  }

  // Recalculate a single row's amount (Qty * Rate)
  function recalcRow(idx) {
    const qtyEl = document.querySelector(`.item-qty[data-idx="${idx}"]`);
    const rateEl = document.querySelector(`.item-rate[data-idx="${idx}"]`);
    const amtEl = document.querySelector(`.item-amt[data-idx="${idx}"]`);
    if (qtyEl && rateEl && amtEl) {
      const qty = Number(qtyEl.value) || 0;
      const rate = Number(rateEl.value) || 0;
      if (qty > 0 && rate > 0) {
        amtEl.value = (qty * rate).toFixed(2);
      }
      recalcTotal();
    }
  }

  // Recalculate the grand total from all item amounts
  function recalcTotal() {
    const totalEl = document.getElementById('review-total');
    if (!totalEl) return;
    let sum = 0;
    document.querySelectorAll('.item-amt').forEach(el => {
      sum += Number(el.value) || 0;
    });
    totalEl.value = sum.toFixed(2);
  }

  return {
    renderBillsHub,
    handleUpload,
    saveReviewedBill,
    deleteBillUI,
    recalcRow,
    recalcTotal,
    // Exposed for phases-new-core.js entry photo scanning
    compressImagePublic: compressImage,
    scanBillWithAIPublic: scanBillWithAI,
  };
})();
