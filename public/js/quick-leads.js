/* ═══════════════════════════════════════════════════════════════
   QUICK-LEADS.JS — Potential customer contact management
   - Add from recent phone calls (Android/Capacitor only)
   - Add manually with full details
   - Track interest status and follow-up notes
   ═══════════════════════════════════════════════════════════════ */

const QuickLeads = (() => {
  const INTEREST_STATUS = [
    { value: 'hot',    label: 'Hot Lead',       color: '#C77966', bg: 'rgba(199,121,102,0.12)' },
    { value: 'warm',   label: 'Warm Lead',      color: '#D4A574', bg: 'rgba(212,165,116,0.12)' },
    { value: 'cold',   label: 'Cold Lead',      color: '#6E94B0', bg: 'rgba(110,148,176,0.12)' },
    { value: 'new',    label: 'New',            color: '#9E7758', bg: 'rgba(158,119,88,0.12)' },
    { value: 'closed', label: 'Converted',      color: '#A8B89C', bg: 'rgba(168,184,156,0.12)' },
    { value: 'lost',   label: 'Lost',           color: 'var(--text-muted)', bg: 'var(--bg-elev-2)' },
  ];

  const fmt = (n) => typeof Financial !== 'undefined' ? Financial.fmt(n) : '₹' + (Number(n)||0).toLocaleString('en-IN');
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

  function _statusBadge(status) {
    const s = INTEREST_STATUS.find(x => x.value === status) || INTEREST_STATUS[3];
    return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:${s.bg};color:${s.color}">${s.label}</span>`;
  }

  // ── Detect Capacitor / Android ──
  function _isNative() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function')
        return window.Capacitor.isNativePlatform();
    } catch (_) {}
    const p = (location.protocol || '').toLowerCase();
    return p.startsWith('capacitor') || p.startsWith('ionic') || p.startsWith('file');
  }

  function _isAndroid() {
    return _isNative() && /Android/i.test(navigator.userAgent);
  }

  // ═══════════════════════════════════════════════════════════════
  // CALL LOG PLUGIN ACCESS (Android only)
  //
  // Uses the custom CallLogPlugin registered in MainActivity.java.
  // The plugin exposes three methods:
  //   1. checkPermission()  → checks if READ_CALL_LOG is granted
  //   2. requestPermission() → shows the NATIVE Android permission popup
  //   3. getRecentCalls({ limit }) → reads the last N calls
  //
  // IMPORTANT: requestPermission() triggers Android's system permission
  // dialog — the same popup you see in WhatsApp, Truecaller, etc.
  // This is NOT an in-app message; it's the real OS-level permission
  // request that appears over the app.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the CallLog plugin instance from Capacitor.
   * Uses Capacitor.registerPlugin() for Capacitor 3+ style access.
   * Falls back to Capacitor.Plugins.CallLog for older patterns.
   */
  function _getCallLogPlugin() {
    if (!window.Capacitor) return null;
    try {
      // Capacitor 3+ pattern: registerPlugin creates a typed proxy
      if (typeof window.Capacitor.registerPlugin === 'function') {
        return window.Capacitor.registerPlugin('CallLog');
      }
      // Fallback: direct plugin access
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.CallLog) {
        return window.Capacitor.Plugins.CallLog;
      }
    } catch (e) {
      console.warn('[QuickLeads] CallLog plugin access error:', e);
    }
    return null;
  }

  /**
   * Check if the CallLog plugin is available (only on Android with Capacitor).
   */
  function _isCallLogAvailable() {
    return _isAndroid() && _getCallLogPlugin() !== null;
  }

  /**
   * Request READ_CALL_LOG permission via the NATIVE Android dialog.
   *
   * This is the key function the user was asking for — instead of showing
   * a "go to settings" message, this calls the custom Capacitor plugin's
   * requestPermission() method, which internally calls
   * ActivityCompat.requestPermissions() in Java. That triggers the
   * actual Android system permission dialog that slides up from the
   * bottom of the screen with "Allow" / "Deny" buttons.
   *
   * Returns true if permission was granted, false if denied.
   */
  async function _requestCallLogPermission() {
    if (!_isAndroid()) return false;
    const CallLog = _getCallLogPlugin();
    if (!CallLog) return false;

    try {
      // Step 1: Check if already granted
      const checkResult = await CallLog.checkPermission();
      if (checkResult && checkResult.granted) return true;

      // Step 2: Request via native dialog
      // This is what shows the system popup — "Allow RECON to access your call log?"
      const reqResult = await CallLog.requestPermission();
      return !!(reqResult && reqResult.granted);
    } catch (e) {
      console.warn('[QuickLeads] Call log permission request error:', e);
    }
    return false;
  }

  /**
   * Fetch recent calls from the Android call log.
   * Permission must already be granted before calling this.
   */
  async function _fetchRecentCalls(limit = 5) {
    if (!_isAndroid()) return [];
    const CallLog = _getCallLogPlugin();
    if (!CallLog) return [];

    try {
      const result = await CallLog.getRecentCalls({ limit });
      if (result && Array.isArray(result.calls)) return result.calls.slice(0, limit);
      if (Array.isArray(result)) return result.slice(0, limit);
    } catch (e) {
      console.warn('[QuickLeads] Fetch recent calls error:', e);
    }
    return [];
  }

  // ── Hub Rendering ──
  function renderHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '<div class="m-empty"><div class="m-empty-title">No project open</div></div>';

    const leads = State.getLeads ? State.getLeads() : [];
    const totalLeads = leads.length;
    const hotCount = leads.filter(l => l.status === 'hot').length;
    const warmCount = leads.filter(l => l.status === 'warm').length;
    const convertedCount = leads.filter(l => l.status === 'closed').length;
    const isAndroid = _isAndroid();

    let html = `
      <div class="hub-header" style="margin-bottom:20px">
        <div class="hub-header-left">
          <div>
            <h2 class="hub-title" style="font-size:22px">${Icons.render('contact', 22)} Quick Leads</h2>
            <p class="hub-subtitle">Save potential customer contact details</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:8px">
            <span class="phase-pct">${totalLeads} Lead${totalLeads !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons Row -->
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        ${isAndroid ? `
        <button class="btn btn-primary" onclick="QuickLeads.showAddFromCallModal()" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px">
          ${Icons.render('phoneIncoming', 15)} Add Last Call
        </button>` : ''}
        <button class="btn btn-primary" onclick="QuickLeads.showAddLeadModal()" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;${isAndroid ? '' : 'width:100%'}">
          ${Icons.render('contact', 15)} Add Lead
        </button>
      </div>

      <!-- Summary Cards -->
      ${totalLeads > 0 ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">
        ${_summaryCard('Total Leads', totalLeads, 'var(--amber)')}
        ${_summaryCard('Hot', hotCount, '#C77966')}
        ${_summaryCard('Warm', warmCount, '#D4A574')}
        ${_summaryCard('Converted', convertedCount, '#A8B89C')}
      </div>` : ''}

      <!-- Leads List -->
    `;

    if (totalLeads === 0) {
      html += `
        <div style="padding:60px 32px;text-align:center;border:1px dashed var(--charcoal-border);border-radius:12px;background:var(--charcoal-mid)">
          <div style="margin-bottom:12px;color:var(--text-muted)">${Icons.render('contact', 48)}</div>
          <h3 style="color:var(--text-secondary);font-size:16px;font-weight:700;margin-bottom:8px">No Leads Saved Yet</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;max-width:300px;margin-left:auto;margin-right:auto">
            ${isAndroid ? 'Save contacts from recent calls or add leads manually.' : 'Add potential customer details to track your leads pipeline.'}
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            ${isAndroid ? `<button class="btn btn-primary" onclick="QuickLeads.showAddFromCallModal()">${Icons.render('phoneIncoming', 14)} Add Last Call</button>` : ''}
            <button class="btn btn-primary" onclick="QuickLeads.showAddLeadModal()">${Icons.render('contact', 14)} Add Lead</button>
          </div>
        </div>`;
    } else {
      // Group by status
      const statusOrder = ['hot', 'warm', 'new', 'cold', 'closed', 'lost'];
      const grouped = {};
      statusOrder.forEach(s => { grouped[s] = leads.filter(l => l.status === s); });
      // Also catch any leads with unknown status
      const knownStatuses = new Set(statusOrder);
      leads.filter(l => !knownStatuses.has(l.status)).forEach(l => {
        if (!grouped.other) grouped.other = [];
        grouped.other.push(l);
      });

      for (const status of [...statusOrder, 'other']) {
        const group = grouped[status];
        if (!group || group.length === 0) continue;
        const s = INTEREST_STATUS.find(x => x.value === status) || { label: 'Other', color: 'var(--text-muted)', bg: 'var(--bg-elev-2)' };

        html += `
          <div class="m-section-title" style="display:flex;align-items:center;gap:8px;margin-top:${status === 'hot' ? '0' : '20px'}">
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>
            ${s.label} <span class="count">${group.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">`;

        group.forEach(lead => {
          html += _renderLeadCard(lead);
        });

        html += `</div>`;
      }
    }

    html += `<div style="height:80px"></div>`;
    return html;
  }

  function _renderLeadCard(lead) {
    return `
      <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:16px;cursor:pointer;transition:all .15s"
           onclick="QuickLeads.showLeadDetail('${escapeAttr(lead.id)}')"
           onmouseover="this.style.borderColor='var(--amber-muted)';this.style.boxShadow='0 4px 20px rgba(0,0,0,.3)'"
           onmouseout="this.style.borderColor='var(--charcoal-border)';this.style.boxShadow=''">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:15px;color:var(--text)">${escapeHtml(lead.name || '—')}</span>
              ${_statusBadge(lead.status)}
            </div>
            ${lead.phone ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:4px">
              ${Icons.render('phone', 11)} ${escapeHtml(lead.phone)}
            </div>` : ''}
            ${lead.address ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escapeHtml(lead.address)}</div>` : ''}
            ${lead.source ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-style:italic">via ${escapeHtml(lead.source)}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            ${lead.phone ? `<button onclick="event.stopPropagation();QuickLeads.callLead('${escapeAttr(lead.phone)}')" title="Call" style="background:var(--bg-elev-2);border:1px solid var(--charcoal-border);border-radius:8px;padding:6px;cursor:pointer;color:var(--amber);display:inline-flex">${Icons.render('phone', 14)}</button>` : ''}
            <button onclick="event.stopPropagation();QuickLeads.showEditLeadModal('${escapeAttr(lead.id)}')" title="Edit" style="background:var(--bg-elev-2);border:1px solid var(--charcoal-border);border-radius:8px;padding:6px;cursor:pointer;color:var(--text-muted);display:inline-flex">${Icons.render('pencil', 13)}</button>
            <button onclick="event.stopPropagation();QuickLeads.confirmDeleteLead('${escapeAttr(lead.id)}','${escapeAttr(lead.name)}')" title="Delete" style="background:var(--bg-elev-2);border:1px solid var(--charcoal-border);border-radius:8px;padding:6px;cursor:pointer;color:var(--danger);display:inline-flex">${Icons.render('trash', 13)}</button>
          </div>
        </div>
        ${lead.notes ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--charcoal-border);font-size:12px;color:var(--text-secondary)">${escapeHtml(lead.notes)}</div>` : ''}
      </div>`;
  }

  function _summaryCard(label, value, color) {
    return `
      <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:6px">${label}</div>
        <div style="font-family:var(--font-mono);font-weight:700;font-size:20px;color:${color}">${value}</div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  // "ADD LAST CALL" FLOW
  //
  // When the user taps "Add Last Call" on Android:
  //   1. We call CallLog.requestPermission() — this shows the NATIVE
  //      Android permission dialog ("Allow RECON to access your call log?")
  //   2. If the user taps "Allow" → we read the last 5 calls
  //   3. If the user taps "Deny" → we show a friendly explanation
  //      with an option to try again or add manually
  //   4. If the user previously denied with "Don't ask again" → we
  //      detect this and offer to open Android settings
  // ═══════════════════════════════════════════════════════════════

  async function showAddFromCallModal() {
    if (!_isAndroid()) {
      App.toast('Call log access is only available on the Android app.', 'warning');
      return;
    }

    const CallLog = _getCallLogPlugin();
    if (!CallLog) {
      App.toast('Call log plugin not available. Please update the app.', 'warning');
      return;
    }

    // ── Step 1: Check current permission state ──
    let currentlyGranted = false;
    try {
      const checkResult = await CallLog.checkPermission();
      currentlyGranted = !!(checkResult && checkResult.granted);
    } catch (e) {
      console.warn('[QuickLeads] checkPermission error:', e);
    }

    // ── Step 2: If not granted, request via native dialog ──
    if (!currentlyGranted) {
      let granted = false;
      try {
        // THIS is what triggers the native Android permission popup:
        // "Allow RECON to access your call log?"  [Deny] [Allow]
        const reqResult = await CallLog.requestPermission();
        granted = !!(reqResult && reqResult.granted);
      } catch (e) {
        console.warn('[QuickLeads] requestPermission error:', e);
      }

      if (!granted) {
        // User denied the permission. Check if they checked "Don't ask again"
        // by trying to detect if we can still request.
        // Show a friendly in-app explanation with options.
        _showPermissionDeniedModal();
        return;
      }
    }

    // ── Step 3: Permission granted — fetch recent calls ──
    App.toast('Loading recent calls...', 'info');
    const calls = await _fetchRecentCalls(5);

    if (calls.length === 0) {
      App.showModal(`
        <h3 class="modal-title">${Icons.render('phoneIncoming', 16)} No Recent Calls Found</h3>
        <p style="color:var(--text-muted);font-size:13px;margin:12px 0">Could not find any recent calls. You can add the lead manually instead.</p>
        <div style="display:flex;gap:12px;margin-top:16px">
          <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:none;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>
          <button onclick="App.closeModal();QuickLeads.showAddLeadModal()" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:8px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">Add Manually</button>
        </div>
      `);
      return;
    }

    // ── Step 4: Show call list picker ──
    let callsHtml = calls.map((call, i) => {
      const number = call.number || call.phone || call.phoneNumber || '—';
      const name = call.name || call.cachedName || call.callerName || '';
      const date = call.date || call.callDate || '';
      const duration = call.duration || call.callDuration || '';
      const type = call.type || call.callType || '';
      const typeLabel = type === 1 || type === '1' || type === 'INCOMING' ? 'Incoming'
                       : type === 2 || type === '2' || type === 'OUTGOING' ? 'Outgoing'
                       : type === 3 || type === '3' || type === 'MISSED' ? 'Missed'
                       : type === 5 || type === '5' || type === 'REJECTED' ? 'Rejected'
                       : 'Call';
      const dateStr = date ? fmtDate(typeof date === 'number' ? new Date(date).toISOString() : date) : '';
      const durationSec = parseInt(duration) || 0;
      const durationStr = durationSec > 0 ? `${Math.floor(durationSec/60)}m ${durationSec%60}s` : '';

      return `
        <button onclick="QuickLeads._selectCall(${i})" style="width:100%;text-align:left;background:var(--bg-elev-2);border:1px solid var(--charcoal-border);border-radius:10px;padding:12px;cursor:pointer;transition:all .15s;margin-bottom:8px"
                onmouseover="this.style.borderColor='var(--amber-muted)'" onmouseout="this.style.borderColor='var(--charcoal-border)'"
                data-call-idx="${i}" data-call-number="${escapeAttr(number)}" data-call-name="${escapeAttr(name)}">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;font-size:14px;color:var(--text)">${name ? escapeHtml(name) : 'Unknown'}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-family:var(--font-mono)">${escapeHtml(number)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:11px;color:var(--text-muted)">${typeLabel}</div>
              ${dateStr ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${dateStr}</div>` : ''}
              ${durationStr ? `<div style="font-size:10px;color:var(--text-faint);margin-top:1px">${durationStr}</div>` : ''}
            </div>
          </div>
        </button>`;
    }).join('');

    // Store calls data for selection
    window._quickLeadsCalls = calls;

    App.showModal(`
      <h3 class="modal-title">${Icons.render('phoneIncoming', 16)} Select a Recent Call</h3>
      <p style="color:var(--text-muted);font-size:12px;margin:8px 0 16px">Choose a number to save as a lead</p>
      ${callsHtml}
      <div style="display:flex;gap:12px;margin-top:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:none;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>
      </div>
    `);
  }

  /**
   * Show a friendly modal when the user denied the call log permission.
   * Offers two options:
   *   1. Try Again — re-requests the native permission dialog
   *   2. Add Manually — skip call log and add lead with manual input
   *   3. Open Settings — for users who previously chose "Don't ask again"
   */
  function _showPermissionDeniedModal() {
    App.showModal(`
      <h3 class="modal-title">${Icons.render('phoneIncoming', 16)} Call Log Access Needed</h3>
      <p style="color:var(--text-muted);font-size:13px;margin:12px 0;line-height:1.5">
        To show your recent calls, RECON needs permission to read your call log.
        This data stays on your device and is never shared.
      </p>
      <div style="background:var(--bg-elev-2);border:1px solid var(--charcoal-border);border-radius:10px;padding:12px;margin:12px 0">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:600">If you denied permission:</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
          ${Icons.render('chevronRight', 10)} Tap <b>"Try Again"</b> to re-request access<br>
          ${Icons.render('chevronRight', 10)} If you checked "Don't ask again", tap <b>"Open Settings"</b>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
        <button onclick="App.closeModal();QuickLeads._retryPermission()" class="modal-btn-primary" style="width:100%;padding:12px;border-radius:8px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">${Icons.render('phoneIncoming', 14)} Try Again</button>
        <button onclick="App.closeModal();QuickLeads._openAppSettings()" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px">Open Settings</button>
        <button onclick="App.closeModal();QuickLeads.showAddLeadModal()" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:none;color:var(--text-muted);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px">${Icons.render('contact', 13)} Add Lead Manually</button>
      </div>
    `);
  }

  /**
   * Retry the permission request — shows the native dialog again.
   */
  async function _retryPermission() {
    const CallLog = _getCallLogPlugin();
    if (!CallLog) return;

    try {
      const result = await CallLog.requestPermission();
      if (result && result.granted) {
        App.toast('Permission granted!', 'success');
        // Now proceed with the call log flow
        showAddFromCallModal();
        return;
      }
    } catch (e) {
      console.warn('[QuickLeads] retry permission error:', e);
    }
    // Still denied — show the denied modal again
    _showPermissionDeniedModal();
  }

  /**
   * Open the Android app settings page for RECON, where the user
   * can manually grant the Call Log permission. This is needed
   * when the user previously chose "Don't ask again".
   *
   * Uses the native openAppSettings() method from our CallLogPlugin,
   * which directly opens Settings > Apps > RECON > Permissions.
   */
  async function _openAppSettings() {
    const CallLog = _getCallLogPlugin();
    if (CallLog) {
      try {
        await CallLog.openAppSettings();
        return;
      } catch (e) {
        console.warn('[QuickLeads] Open settings via plugin error:', e);
      }
    }
    // Fallback: just inform the user
    App.toast('Please go to Settings > Apps > RECON > Permissions', 'info');
  }

  function _selectCall(idx) {
    const calls = window._quickLeadsCalls || [];
    const call = calls[idx];
    if (!call) return;

    const number = call.number || call.phone || call.phoneNumber || '';
    const name = call.name || call.cachedName || call.callerName || '';

    App.closeModal();
    // Small delay so modal closes smoothly before opening new one
    setTimeout(() => {
      showAddLeadModal(null, { phone: number, name: name, source: 'Call Log' });
    }, 200);
  }

  // ── Add/Edit Lead Modal ──
  function showAddLeadModal(editId, prefill = {}) {
    const isEdit = !!editId;
    let lead = prefill || {};
    if (isEdit) {
      const leads = State.getLeads ? State.getLeads() : [];
      lead = leads.find(l => String(l.id) === String(editId)) || {};
    }

    const statusOptions = INTEREST_STATUS.map(s =>
      `<option value="${s.value}" ${lead.status === s.value ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    App.showModal(`
      <h3 class="modal-title">${Icons.render('contact', 16)} ${isEdit ? 'Edit Lead' : 'Add New Lead'}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="fs-label">Name *</label>
          <input id="ql-name" class="fs-inp" placeholder="e.g. Rakesh Patel" value="${escapeAttr(lead.name || '')}">
        </div>
        <div>
          <label class="fs-label">Phone *</label>
          <input id="ql-phone" class="fs-inp" type="tel" placeholder="e.g. 98765 43210" value="${escapeAttr(lead.phone || '')}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="fs-label">Address / Location</label>
          <input id="ql-address" class="fs-inp" placeholder="e.g. Sector 21, Gurgaon" value="${escapeAttr(lead.address || '')}">
        </div>
        <div>
          <label class="fs-label">Interest Status</label>
          <select id="ql-status" class="fs-inp" style="appearance:auto">
            ${statusOptions}
          </select>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label class="fs-label">Source</label>
        <input id="ql-source" class="fs-inp" placeholder="e.g. Call Log, Referral, Website" value="${escapeAttr(lead.source || '')}">
      </div>
      <div style="margin-bottom:12px">
        <label class="fs-label">Notes</label>
        <textarea id="ql-notes" class="fs-inp" rows="3" placeholder="Follow-up details, requirements, budget range..." style="resize:vertical">${escapeHtml(lead.notes || '')}</textarea>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:none;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>
        <button onclick="QuickLeads.saveLead(${isEdit ? `'${escapeAttr(editId)}'` : 'null'})" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:8px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">${isEdit ? 'Update Lead' : 'Save Lead'}</button>
      </div>
    `);
  }

  function showEditLeadModal(id) {
    showAddLeadModal(id);
  }

  // ── Save Lead ──
  async function saveLead(editId) {
    const name = document.getElementById('ql-name')?.value?.trim();
    if (!name) { App.toast('Name is required', 'warning'); return; }
    const phone = document.getElementById('ql-phone')?.value?.trim();
    if (!phone) { App.toast('Phone number is required', 'warning'); return; }

    const data = {
      name,
      phone,
      address: document.getElementById('ql-address')?.value?.trim() || '',
      status: document.getElementById('ql-status')?.value || 'new',
      source: document.getElementById('ql-source')?.value?.trim() || '',
      notes: document.getElementById('ql-notes')?.value?.trim() || '',
    };

    if (editId) {
      await State.updateLead(editId, data);
      App.closeModal();
      App.toast('Lead updated', 'success');
      App.showQuickLeads();
    } else {
      const lead = await State.addLead(data);
      App.closeModal();
      App.toast('Lead added', 'success');
      App.showQuickLeads();
    }
  }

  // ── Lead Detail View ──
  function renderLeadDetail(leadId) {
    const leads = State.getLeads ? State.getLeads() : [];
    const lead = leads.find(l => String(l.id) === String(leadId));
    if (!lead) return '<div class="m-empty">Lead not found</div>';

    const s = INTEREST_STATUS.find(x => x.value === lead.status) || INTEREST_STATUS[3];

    return `
      <div style="max-width:560px;margin:0 auto">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
          <div style="width:56px;height:56px;border-radius:50%;background:${s.bg};border:2px solid ${s.color};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:${s.color};font-family:var(--font-display)">${(lead.name || '?')[0].toUpperCase()}</div>
          <div style="min-width:0;flex:1">
            <h2 style="font-size:20px;font-weight:800;color:var(--text);margin:0">${escapeHtml(lead.name)}</h2>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              ${_statusBadge(lead.status)}
              ${lead.source ? `<span style="font-size:11px;color:var(--text-muted)">via ${escapeHtml(lead.source)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Contact Info Card -->
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px">Contact Details</div>
          ${lead.phone ? `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            ${Icons.render('phone', 16)}
            <div style="flex:1">
              <div style="font-family:var(--font-mono);font-size:15px;font-weight:600;color:var(--text)">${escapeHtml(lead.phone)}</div>
            </div>
            <button onclick="QuickLeads.callLead('${escapeAttr(lead.phone)}')" style="background:var(--amber-glow);border:1px solid var(--amber-border);color:var(--amber);border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700;font-size:12px;font-family:inherit">Call</button>
          </div>` : ''}
          ${lead.address ? `
          <div style="display:flex;align-items:flex-start;gap:12px">
            ${Icons.render('building', 16)}
            <div style="font-size:14px;color:var(--text-secondary)">${escapeHtml(lead.address)}</div>
          </div>` : ''}
        </div>

        <!-- Notes -->
        ${lead.notes ? `
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">Notes</div>
          <div style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap">${escapeHtml(lead.notes)}</div>
        </div>` : ''}

        <!-- Timeline -->
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">Timeline</div>
          <div style="font-size:13px;color:var(--text-muted)">Added ${fmtDate(lead.createdAt)}</div>
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:10px;margin-top:20px">
          <button onclick="QuickLeads.showEditLeadModal('${escapeAttr(lead.id)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('pencil', 14)} Edit</button>
          <button onclick="QuickLeads.confirmDeleteLead('${escapeAttr(lead.id)}','${escapeAttr(lead.name)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(199,121,102,0.3);background:rgba(199,121,102,0.08);color:var(--danger);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('trash', 14)} Delete</button>
        </div>
      </div>
      <div style="height:80px"></div>`;
  }

  // ── Delete ──
  function confirmDeleteLead(id, name) {
    App.showConfirmModal({
      icon: Icons.render('contact', 24),
      title: `Delete "${escapeHtml(name)}"?`,
      body: 'This lead will be permanently removed.',
      confirmLabel: 'Delete Lead',
      onConfirm: () => {
        State.deleteLead(id);
        App.toast('Lead deleted', 'info');
        App.showQuickLeads();
      }
    });
  }

  // ── Call a lead ──
  function callLead(phone) {
    if (!phone) return;
    window.open('tel:' + phone.replace(/\s/g, ''), '_self');
  }

  return {
    renderHub,
    renderLeadDetail,
    showAddLeadModal,
    showEditLeadModal,
    showAddFromCallModal,
    saveLead,
    confirmDeleteLead,
    callLead,
    _selectCall,
    _retryPermission,
    _openAppSettings,
  };
})();
