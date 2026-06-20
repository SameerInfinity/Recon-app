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

    // Native → Supabase Edge Function, web → Render proxy. The API key
    // never reaches the client. See supabase-client.js getAiChatUrl().
    const chatApiUrl = SupabaseClient.getAiChatUrl();
    const res = await fetch(chatApiUrl, {
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

    const isConstruction = (phaseId === 'construction');
    if (!isConstruction) phaseId = Number(phaseId);
    let phaseName = '';
    let phaseIcon = '';
    let bills = [];

    if (isConstruction) {
      phaseName = "Construction Trades";
      phaseIcon = "blocks";
      for (let pid = 1; pid <= 9; pid++) {
        const pBills = State.getBills(pid) || [];
        pBills.forEach(b => {
          b._sourcePhase = pid;
        });
        bills = bills.concat(pBills);
      }
    } else {
      const phase = proj.phases.find(p => Number(p.id) === Number(phaseId));
      if (!phase) return '';
      phaseName = phase.name;
      phaseIcon = phase.icon;
      bills = State.getBills(phaseId) || [];
    }

    // Gather entries with bill photos from the relevant phases
    const entryBills = [];
    (proj.phases || []).forEach(ph => {
      if (isConstruction) {
        if (ph.id < 1 || ph.id > 9) return;
      } else if (phaseId === 10) {
        if (ph.id !== 10) return;
      } else {
        if (ph.id !== phaseId) return;
      }

      if (!ph.data || !ph.data.entries) return;
      Object.entries(ph.data.entries).forEach(([cId, arr]) => {
        if (!Array.isArray(arr)) return;

        let card = { name: 'Entry' };
        if (typeof Phases !== 'undefined' && typeof Phases.getAllCardsForPhase === 'function') {
          const allCards = Phases.getAllCardsForPhase(ph.id) || [];
          const found = allCards.find(c => c.id === cId);
          if (found) card = found;
        }

        arr.forEach(entry => {
          if (entry.total > 0) {
            const fields = entry.fields || {};
            // Resolve vendor/payee/contractor/worker
            const vendorName = fields.vendor || fields.payee || fields.supplier || fields.dealer || fields.contractor || fields.worker || card.name;
            
            // Build items list from the entry fields
            const items = [];
            Object.entries(fields).forEach(([k, v]) => {
              if (v && k !== 'notes' && !k.endsWith('_unit') && k !== 'vendor' && k !== 'payee' && k !== 'supplier' && k !== 'dealer' && k !== 'contractor' && k !== 'worker') {
                const unitVal = fields[k + '_unit'] || '';
                items.push({
                  desc: k.replace(/_/g, ' '),
                  qty: '',
                  rate: '',
                  amount: `${v}${unitVal ? ' ' + unitVal : ''}`
                });
              }
            });

            // Fallback item if no fields are present
            if (items.length === 0) {
              items.push({
                desc: 'Type',
                qty: '',
                rate: '',
                amount: card.name
              });
            }

            entryBills.push({
              id: entry.id,
              vendor: vendorName || 'Entry Bill',
              date: entry.date || '',
              totalAmount: entry.total || 0,
              items: items,
              _fromEntry: true,
              _sourcePhase: ph.id,
              _entryData: entry.fields,
              _billPhotoUrl: entry.billPhotoUrl || '',
            });
          }
        });
      });
    });

    // Merge: scanned bills + entry bills (deduplicate by id)
    const allBills = [...bills];
    entryBills.forEach(eb => {
      if (!allBills.find(b => b.id === eb.id)) allBills.push(eb);
    });
    const totalBillsAmount = allBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

    let billsHtml = '';
    if (allBills.length === 0) {
      billsHtml = `
        <div style="padding:40px 20px;text-align:center;color:var(--text-muted);background:var(--charcoal-mid);border-radius:12px;border:1px dashed var(--charcoal-border)">
          <div style="margin-bottom:12px;color:var(--text-muted);opacity:0.6">${Icons.render('camera', 32)}</div>
          <h3 style="font-size:15px;color:var(--text-secondary);margin-bottom:6px">No Bills Yet</h3>
          <p style="font-size:12px;line-height:1.5;max-width:300px;margin:0 auto">Scan a receipt or add a bill photo when logging a material/labor entry. All bills and entry photos will appear here.</p>
        </div>`;
    } else {
      billsHtml = allBills.map(b => {
        const itemHtml = (b.items || []).map(i => {
          const isNum = !isNaN(parseFloat(i.amount)) && isFinite(i.amount);
          const amtStr = isNum ? Financial.fmt(parseFloat(i.amount)) : i.amount;
          return `
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-top:4px">
              <span>${i.qty ? i.qty + 'x ' : ''}${escapeHtml(i.desc)}</span>
              <span class="mono">${escapeHtml(amtStr)}</span>
            </div>
          `;
        }).join('');

        const sourcePhaseName = proj.phases.find(p => Number(p.id) === Number(b._sourcePhase))?.name || `Phase ${b._sourcePhase}`;

        return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;border-bottom:1px solid var(--charcoal-border);padding-bottom:12px">
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${escapeHtml(b.vendor || 'Unknown Shop')}${b._fromEntry ? ' <span style="font-size:10px;color:var(--amber);background:rgba(232,124,42,0.15);padding:2px 6px;border-radius:4px;margin-left:6px">from Entry</span>' : ''}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(b.date || 'No Date')}${b._sourcePhase ? ' · ' + escapeHtml(sourcePhaseName) : ''}</div>
            </div>
            <div style="text-align:right">
              <div class="mono" style="font-size:16px;font-weight:700;color:var(--text-primary)">${Financial.fmtFull(b.totalAmount)}</div>
              ${b._fromEntry ? '' : `<button class="btn-ghost-sm" style="color:var(--red-light);margin-top:6px;padding:4px 8px;font-size:10px" onclick="BillScanner.deleteBillUI('${escapeAttr(b._sourcePhase || phaseId)}', '${escapeAttr(b.id)}', '${escapeAttr(phaseId)}')">Delete</button>`}
            </div>
          </div>
          <div style="background:var(--charcoal-dark);border-radius:6px;padding:8px">
            <div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:6px;font-weight:700">Extracted Items</div>
            ${itemHtml || '<div style="font-size:11px;color:var(--text-muted)">No items extracted</div>'}
          </div>
        </div>`;
      }).join('');
    }

    const breadcrumbHtml = `
      <div class="breadcrumb">
        <a onclick="App.showOverview()">Overview</a>
        <span class="breadcrumb-sep">›</span>
        ${isConstruction 
          ? `<a onclick="App.showHub('construction')">Construction</a>`
          : `<a onclick="${phaseId === 10 ? 'App.showInteriorHub()' : `App.showPhaseHub(${escapeAttr(phaseId)})`}">${Phases.iconFor(phaseIcon, 11)} <span style="margin-left:6px">${escapeHtml(phaseName)}</span></a>`
        }
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${Icons.render('fileText', 14)} Bills & Receipts</span>
      </div>`;

    const html = `
      ${breadcrumbHtml}

      <div class="category-hub-header" style="flex-wrap:wrap;gap:16px">
        <div>
          <div class="category-hub-title">${Icons.render('fileText', 20)} <span style="margin-left:10px">Bills & Receipts</span></div>
          <div class="category-hub-subtitle">AI Scanner Ledger for ${escapeHtml(phaseName)}</div>
        </div>
        <div class="category-hub-stats">
          <div class="category-hub-stat">
            <span class="category-hub-stat-label">Total Bills</span>
            <span class="category-hub-stat-value">${allBills.length}</span>
          </div>
          <div class="category-hub-stat">
            <span class="category-hub-stat-label">Total Amount</span>
            <span class="category-hub-stat-value mono">${Financial.fmtFull(totalBillsAmount)}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
        ${/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? `
          <label class="btn-primary" style="cursor:pointer;flex:1;text-align:center;justify-content:center">
            ${Icons.render('camera', 14)} <span style="margin-left:6px">Camera Scan</span>
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="BillScanner.handleUpload(event, '${escapeAttr(phaseId)}')">
          </label>
          <label class="btn-primary" style="cursor:pointer;flex:1;text-align:center;justify-content:center">
            ${Icons.render('plus', 14)} <span style="margin-left:6px">Upload Gallery</span>
            <input type="file" accept="image/*" style="display:none" onchange="BillScanner.handleUpload(event, '${escapeAttr(phaseId)}')">
          </label>
        ` : `
          <label class="btn-primary" style="cursor:pointer;flex:1;text-align:center;justify-content:center">
            ${Icons.render('camera', 14)} <span style="margin-left:6px">Scan New Bill</span>
            <input type="file" accept="image/*" style="display:none" onchange="BillScanner.handleUpload(event, '${escapeAttr(phaseId)}')">
          </label>
        `}
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
    if (statusEl) {
      statusEl.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-top-color:var(--amber);border-width:2px;margin-right:8px;display:inline-block"></span> Analyzing bill with AI…`;
      statusEl.style.display = 'block';
    }
    if (reviewEl) reviewEl.style.display = 'none';

    try {
      const base64Image = await compressImage(file);
      
      let aiResult = null;
      let aiError = null;
      try {
        aiResult = await scanBillWithAI(base64Image);
      } catch (err) {
        aiError = err;
        console.warn('[BillScanner] AI scan failed:', err.message);
      }

      if (aiResult && (aiResult.totalAmount > 0 || (aiResult.items && aiResult.items.length > 0) || aiResult.vendor)) {
        showReviewForm(phaseId, aiResult, base64Image);
      } else {
        showManualFallbackForm(phaseId, base64Image, aiError);
      }
      
    } catch (err) {
      console.error('[BillScanner] Unexpected error:', err);
      showManualFallbackForm(phaseId, null, err);
    } finally {
      if (statusEl) statusEl.style.display = 'none';
      e.target.value = '';
    }
  }

  // ── Fallback manual entry when AI fails ───────────────────────
  function showManualFallbackForm(phaseId, base64Image, error) {
    const reviewEl = document.getElementById('review-container');
    if (!reviewEl) return;

    const proj = State.getCurrentProject();
    const isConstruction = (phaseId === 'construction');
    const phaseSelectHtml = isConstruction ? `
      <div class="field-group" style="margin-top:12px">
        <label class="field-label" style="font-weight:700">Assign to Trade Phase *</label>
        <select id="review-phase-id" class="field-input" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;width:100%;box-sizing:border-box">
          ${(proj?.phases || []).filter(p => p.id >= 1 && p.id <= 9).map(p => `
            <option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>
          `).join('')}
        </select>
      </div>
    ` : `<input type="hidden" id="review-phase-id" value="${escapeAttr(phaseId)}">`;

    const today = new Date().toISOString().split('T')[0];

    reviewEl.innerHTML = `
      <div class="card" style="border:1.5px solid var(--amber-border);box-shadow:0 4px 16px rgba(0,0,0,0.12)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--charcoal-border)">
          <div style="background:var(--amber-light-bg);border-radius:8px;padding:8px;flex-shrink:0">
            ${Icons.render('camera', 18)}
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--amber)">AI Unavailable — Enter Manually</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${error ? 'Error: ' + escapeHtml(error.message || 'Network or API issue') : 'Could not extract details from image'}</div>
          </div>
          <button class="btn-ghost-sm" style="margin-left:auto;padding:4px 10px;font-size:11px" onclick="document.getElementById('review-container').style.display='none'">✕</button>
        </div>
        ${base64Image ? `<div style="margin-bottom:14px"><img src="${escapeAttr(base64Image)}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;border:1px solid var(--charcoal-border)"></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="field-group">
            <label class="field-label">Vendor / Shop Name</label>
            <input class="field-input" id="review-vendor" placeholder="e.g. Ramesh Hardware">
          </div>
          <div class="field-group">
            <label class="field-label">Date</label>
            <input class="field-input" id="review-date" type="date" value="${today}" style="font-family:var(--font-mono)">
          </div>
        </div>
        <div class="field-group" style="margin-bottom:12px">
          <label class="field-label" style="font-weight:700">Total Amount (₹) *</label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--amber);font-weight:700;font-size:15px">₹</span>
            <input class="field-input mono" type="number" id="review-total" placeholder="0" style="flex:1">
          </div>
        </div>
        <div class="field-group" style="margin-bottom:4px">
          <label class="field-label">Description (Optional)</label>
          <input class="field-input" id="manual-desc" placeholder="e.g. Cement 50 bags, Sand 5 trolley">
        </div>
        ${phaseSelectHtml}
        <div style="display:flex;gap:10px;margin-top:16px">
          <label class="btn-primary" style="cursor:pointer;flex:1;text-align:center;padding:9px;border-radius:8px;font-size:12px;font-weight:700">
            ${Icons.render('camera', 13)} Re-scan
            <input type="file" accept="image/*" ${/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'capture="environment"' : ''} style="display:none" onchange="BillScanner.handleUpload(event, '${escapeAttr(phaseId)}')">
          </label>
          <button id="save-bill-btn" class="btn-primary" style="flex:2;padding:9px;border-radius:8px;font-size:12px;font-weight:700" onclick="BillScanner.saveManualBill('${escapeAttr(phaseId)}')">
            ${Icons.render('plus', 13)} Save Bill Manually
          </button>
        </div>
      </div>
    `;
    reviewEl.style.display = 'block';
    reviewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveManualBill(phaseId) {
    const btn = document.getElementById('save-bill-btn');
    const vendor = (document.getElementById('review-vendor')?.value || '').trim();
    const date = (document.getElementById('review-date')?.value || '').trim();
    const totalAmount = Number(document.getElementById('review-total')?.value) || 0;
    const desc = (document.getElementById('manual-desc')?.value || '').trim();
    const targetPhaseId = parseInt(document.getElementById('review-phase-id')?.value) || parseInt(phaseId);

    if (!totalAmount || totalAmount <= 0) return App.toast('Enter a valid amount', 'error');

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    const items = desc ? [{ desc, qty: 1, rate: totalAmount, amount: totalAmount }] : [];
    const billObj = { vendor: vendor || 'Manual Entry', date, totalAmount, items };
    await State.addBill(targetPhaseId, billObj);

    App.toast('Bill saved!', 'success');
    if (phaseId === 'construction') {
      App.showConstructionBills();
    } else {
      App.showPhaseBills(phaseId);
    }
  }

  // Show the extracted data for user correction before saving
  function showReviewForm(phaseId, aiResult, base64Image) {
    const reviewEl = document.getElementById('review-container');
    if (!reviewEl) return;

    const proj = State.getCurrentProject();

    // If AI failed to extract total but got items, auto-sum it initially
    let initialTotal = Number(aiResult.totalAmount) || 0;
    if (initialTotal === 0 && aiResult.items && aiResult.items.length > 0) {
      initialTotal = aiResult.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }

    // Build items HTML for review
    const itemsHtml = (aiResult.items || []).map((item, idx) => `
      <div class="field-row cols-4" style="margin-bottom:8px">
        <div class="field-group" style="flex:2"><input class="field-input item-desc" data-idx="${idx}" value="${escapeAttr(item.desc || '')}" placeholder="Item"></div>
        <div class="field-group"><input class="field-input mono item-qty" type="number" data-idx="${idx}" value="${escapeAttr(item.qty || 0)}" placeholder="Qty" oninput="BillScanner.recalcRow(${idx})"></div>
        <div class="field-group"><input class="field-input mono item-rate" type="number" data-idx="${idx}" value="${escapeAttr(item.rate || 0)}" placeholder="Rate" oninput="BillScanner.recalcRow(${idx})"></div>
        <div class="field-group"><input class="field-input mono item-amt" type="number" data-idx="${idx}" value="${escapeAttr(item.amount || 0)}" placeholder="Amt" oninput="BillScanner.recalcTotal()"></div>
      </div>
    `).join('');

    const isConstruction = (phaseId === 'construction');
    const phaseSelectHtml = isConstruction ? `
      <div class="field-group" style="margin-top:12px">
        <label class="field-label" style="font-weight:700">Assign to Trade Phase *</label>
        <select id="review-phase-id" class="field-input" style="background:var(--charcoal);border:1px solid var(--charcoal-border);color:var(--text-primary);padding:8px 10px;border-radius:6px;width:100%;box-sizing:border-box">
          ${(proj?.phases || []).filter(p => p.id >= 1 && p.id <= 9).map(p => `
            <option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>
          `).join('')}
        </select>
      </div>
    ` : `
      <input type="hidden" id="review-phase-id" value="${escapeAttr(phaseId)}">
    `;

    reviewEl.innerHTML = `
      <div class="card" style="border:1px solid var(--amber-border);box-shadow:0 4px 12px rgba(0,0,0,0.2)">
        <div style="font-weight:700;font-size:14px;color:var(--amber);margin-bottom:16px;display:flex;justify-content:space-between">
          <span>Review Extracted Bill</span>
          <button class="btn-ghost-sm" onclick="document.getElementById('review-container').style.display='none'">Cancel</button>
        </div>
        
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div style="flex:1">
            <img src="${escapeAttr(base64Image)}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;border:1px solid var(--charcoal-border)">
          </div>
          <div style="flex:2">
            <div class="field-group">
              <label class="field-label">Vendor / Shop Name</label>
              <input class="field-input" id="review-vendor" value="${escapeAttr(aiResult.vendor || '')}">
            </div>
            <div class="field-row cols-2">
              <div class="field-group">
                <label class="field-label">Date</label>
                <input class="field-input" id="review-date" value="${escapeAttr(aiResult.date || '')}" placeholder="YYYY-MM-DD">
              </div>
              <div class="field-group">
                <label class="field-label">Total Amount</label>
                <div class="currency-input-wrap">
                  <span class="currency-symbol">₹</span>
                  <input class="field-input mono" type="number" id="review-total" value="${escapeAttr(initialTotal)}">
                </div>
              </div>
            </div>
            ${phaseSelectHtml}
          </div>
        </div>

        <div style="background:var(--charcoal-dark);border-radius:8px;padding:12px;margin-bottom:16px">
          <label class="field-label" style="margin-bottom:8px">Extracted Items</label>
          ${itemsHtml || '<div style="font-size:12px;color:var(--text-muted)">No items extracted.</div>'}
        </div>

        <button id="save-bill-btn" class="btn-primary" style="width:100%" onclick="BillScanner.saveReviewedBill('${escapeAttr(phaseId)}')">Save Bill to Ledger</button>
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

    const targetPhaseId = parseInt(document.getElementById('review-phase-id').value) || parseInt(phaseId);
    const billObj = { vendor, date, totalAmount, items };
    await State.addBill(targetPhaseId, billObj);
    
    App.toast('Bill saved successfully!', 'success');
    
    // Re-render the view
    if (phaseId === 'construction') {
      App.showConstructionBills();
    } else {
      App.showPhaseBills(phaseId);
    }
  }

  // Delete a bill
  async function deleteBillUI(phaseId, billId, viewPhaseId) {
    App.showConfirmModal({
      icon: Icons.render('fileText', 24),
      title: 'Delete Scanned Bill?',
      body: 'This will permanently remove this scanned bill and its extracted items.',
      confirmLabel: 'Delete Bill',
      onConfirm: async () => {
        const parsedPhaseId = parseInt(phaseId);
        await State.deleteBill(parsedPhaseId, billId);
        App.toast('Bill deleted', 'info');
        if (viewPhaseId === 'construction') {
          App.showConstructionBills();
        } else {
          App.showPhaseBills(viewPhaseId);
        }
      }
    });
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
    saveManualBill,
    deleteBillUI,
    recalcRow,
    recalcTotal,
    // Exposed for phases-new-core.js entry photo scanning
    compressImagePublic: compressImage,
    scanBillWithAIPublic: scanBillWithAI,
  };
})();
