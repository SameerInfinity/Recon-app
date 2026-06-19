/* ═══════════════════════════════════════════
   AI.JS
   ═══════════════════════════════════════════ */

const AI = (() => {
  let lastContextHash = '';
  let aiCheckTimer = null;
  let isThinking = false;
  let conversationHistory = [];

  // ── AI History Persistence ─────────────────────────────────
  // Stores up to 20 messages (10 exchanges) per project in localStorage
  const MAX_HISTORY = 20;

  function getHistoryKey() {
    const proj = State.getCurrentProject?.();
    return proj ? `recon_ai_history_${proj.id}` : null;
  }

  function loadPersistedHistory() {
    const key = getHistoryKey();
    if (!key) return [];
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
  }

  function persistHistory() {
    const key = getHistoryKey();
    if (!key) return;
    try {
      const toSave = conversationHistory.slice(-MAX_HISTORY);
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch {}
  }

  function clearAIHistory() {
    const key = getHistoryKey();
    if (key) localStorage.removeItem(key);
    conversationHistory = [];
    const container = document.getElementById('ai-messages');
    if (container) {
      container.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">AI history cleared for this project.</div>';
    }
    App.toast('AI conversation history cleared', 'info');
  }

  // Load history when module initialises (after a short delay for State to be ready)
  setTimeout(() => {
    conversationHistory = loadPersistedHistory();
  }, 500);

  // ── Deterministic Rule Engine ─────────────────────────────
  function checkTriggers() {
    clearTimeout(aiCheckTimer);
    aiCheckTimer = setTimeout(_checkTriggers, 3000);
  }

  function _checkTriggers() {
    const proj = State.getCurrentProject();
    if (!proj) return;

    const rules = [];

    // Phase 1 — Clay soil + steep slope
    const ph1 = proj.phases.find(p => p.id === 1)?.data || {};
    const survey = ph1.survey || {};
    if (survey.soil_class === 'Clay' && parseFloat(survey.site_slope || 0) > 8) {
      rules.push({
        type: 'warning', icon: 'alert',
        title: 'Foundation Risk Detected',
        body: 'Clay soil + slope >8% detected. This combination increases concrete heaving risk. Recommend requesting structural engineer review before foundation type selection. Est. retaining wall cost premium: +15% on concrete volume.',
        actions: ['Understood', 'Ask AI for More']
      });
    }

    // Phase 4 — Copper + high footage
    const ph4 = proj.phases.find(p => p.id === 4)?.data || {};
    const plumb = ph4.plumbing || {};
    if (plumb.supply_material === 'Copper' && parseFloat(plumb.supply_lf || 0) > 500) {
      rules.push({
        type: 'suggestion', icon: 'lightbulb',
        title: 'Material Upgrade Suggestion',
        body: 'PEX-A at this footage cuts labor hours by ~30% and material cost by ~40% vs Copper. Want a side-by-side comparison?',
        actions: ['Show Comparison', 'Keep Copper']
      });
    }

    // Phase 5 — Level 5 finish + large area
    const ph5 = proj.phases.find(p => p.id === 5)?.data || {};
    const dw = ph5.drywall || {};
    if (dw.finish_level === 'Level 5' && parseFloat(dw.drywall_sqft || 0) > 5000) {
      rules.push({
        type: 'suggestion', icon: 'lightbulb',
        title: 'Finish Level Optimization',
        body: 'Level 5 finish on >5,000 sq ft with flat paint creates a cost mismatch. Level 4 saves significant labor and is visually equivalent for flat sheens.',
        actions: ['Switch to Level 4', 'Keep Level 5']
      });
    }

    // Budget overrun warning
    const total = Financial.computeProjectTotal(proj);
    if (proj.totalBudget > 0 && total > proj.totalBudget * 1.1) {
      const overrun = total - proj.totalBudget;
      rules.push({
        type: 'warning', icon: 'alert',
        title: 'Budget Pulse Alert',
        body: `Project is tracking ${Math.round((total / proj.totalBudget - 1) * 100)}% over budget (${Financial.fmt(overrun)} over). Review high-cost phases and negotiate subcontractor rates.`,
        actions: ['Dismiss']
      });
    }

    // Phase 2 — Pier & Beam suggestion
    const ph2 = proj.phases.find(p => p.id === 2)?.data || {};
    const concrete = ph2.concrete || {};
    if (concrete.foundation_type === 'Slab-on-Grade' && (ph1.survey?.soil_class === 'Clay')) {
      rules.push({
        type: 'suggestion', icon: 'foundation',
        title: 'Foundation Type Review',
        body: 'Slab-on-Grade on Clay soil has elevated heaving risk. Pier & Beam foundation may be more appropriate.',
        actions: ['Noted', 'Learn More']
      });
    }

    // Show first new unshown rule
    const contextStr = JSON.stringify(rules.map(r => r.title));
    if (contextStr !== lastContextHash && rules.length > 0) {
      lastContextHash = contextStr;
      rules.forEach(rule => addMessage(rule.type, rule.icon, rule.title, rule.body, rule.actions));
      showAIPulse();
    }
  }

  function addMessage(type, icon, title, body, actions = [], isHtml = false) {
    // SECURITY: `body` is escaped by default. Callers that have already
    // produced sanitized HTML (e.g. AI reply with safe <br>/<strong>
    // markdown formatting) must pass isHtml=true explicitly.
    const container = document.getElementById('ai-messages');
    if (!container) return;

    // Auto-render icon names to SVG
    const iconHtml = (typeof icon === 'string' && icon.length < 30 && Icons && Icons.ICONS[icon])
      ? Icons.render(icon, 14)
      : (icon || '');

    const actionsHtml = actions.map(a =>
      `<button class="ai-action-btn" onclick="this.parentElement.parentElement.remove()">${escapeHtml(a)}</button>`
    ).join('');

    const safeBody = isHtml ? String(body || '') : escapeHtml(String(body || '')).replace(/\n/g, '<br>');

    const msg = document.createElement('div');
    msg.className = `ai-message ${type}`;
    msg.innerHTML = `
      <div class="ai-msg-icon">${iconHtml}</div>
      <div class="ai-msg-body">
        <div class="ai-msg-type">${escapeHtml(title)}</div>
        <p>${safeBody}</p>
        ${actionsHtml ? `<div class="ai-action-btns">${actionsHtml}</div>` : ''}
      </div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function showAIPulse() {
    const pulse = document.getElementById('ai-pulse');
    if (pulse) pulse.classList.add('active');
  }

  function clearPulse() {
    const pulse = document.getElementById('ai-pulse');
    if (pulse) pulse.classList.remove('active');
  }

  function setWatching(phaseName) {
    const el = document.getElementById('ai-watching');
    if (el) el.textContent = `Watching: ${phaseName}`;
  }

  function setThinking(thinking) {
    isThinking = thinking;
    const dot = document.getElementById('ai-status-dot');
    if (dot) dot.className = 'ai-status-dot ' + (thinking ? 'thinking' : 'ready');
  }

  // ── Build Full Project Context for AI ─────────────────────
  // Serializes the COMPLETE project state — every line item,
  // quantity, unit price, and cost — so Gemini can do real analysis
  function buildFullProjectContext(proj) {
    const lines = [];
    const total = Financial.computeProjectTotal(proj);
    const budget = proj.totalBudget || 0;
    const pct = budget > 0 ? Math.round((total / budget) * 100) : 0;
    const remaining = budget - total;
    const contingency = (proj.contingency || 0) / 100;
    const contingencyAmt = budget * contingency;

    lines.push(`═══ PROJECT OVERVIEW ═══`);
    lines.push(`Name: ${proj.name}`);
    lines.push(`Client: ${proj.client || 'N/A'}`);
    lines.push(`Address: ${proj.address || 'N/A'}`);
    lines.push(`Type: ${proj.type || 'residential'}`);
    lines.push(`Currency: ${proj.currency || 'INR'}`);
    lines.push(`Contractor: ${proj.contractor || 'N/A'}`);
    lines.push(`Start: ${proj.startDate || 'N/A'}  |  End: ${proj.endDate || 'N/A'}`);
    lines.push(`Notes: ${proj.notes || '—'}`);
    lines.push('');
    lines.push(`═══ FINANCIALS ═══`);
    lines.push(`Total budget: ${Financial.fmtFull(budget)}`);
    lines.push(`Current spend: ${Financial.fmtFull(total)}`);
    lines.push(`Remaining: ${Financial.fmtFull(remaining)}`);
    lines.push(`Contingency (${(contingency * 100).toFixed(0)}%): ${Financial.fmtFull(contingencyAmt)}`);
    lines.push(`Budget used: ${pct}%${pct > 100 ? ' (OVER BUDGET)' : ''}`);
    lines.push('');

    // Per-phase full detail
    lines.push(`═══ DETAILED PHASE BREAKDOWN ═══`);
    proj.phases.forEach(phase => {
      const phTotal = Financial.computePhaseTotal(phase);
      lines.push('');
      lines.push(`▸ Phase ${phase.id}: ${phase.name} (${phase.icon}) — ${phase.completion || 0}% complete, ${Financial.fmtFull(phTotal)}`);

      const sections = phase.data || {};
      const sectionNames = Object.keys(sections).filter(k => {
        const v = sections[k];
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return false;
      });

      if (sectionNames.length === 0) {
        lines.push(`    (no line items yet)`);
        return;
      }

      sectionNames.forEach(sectionName => {
        const section = sections[sectionName];

        // Array → table-style rows (line items)
        if (Array.isArray(section)) {
          lines.push(`  ▸ Section: ${sectionName} (${section.length} rows)`);
          section.forEach((row, i) => {
            if (row && typeof row === 'object') {
              const kvs = Object.entries(row)
                .filter(([k, v]) => v != null && v !== '' && k !== 'id' && k !== 'createdAt')
                .map(([k, v]) => `${k}=${v}`).join(', ');
              lines.push(`    [${i + 1}] ${kvs}`);
            }
          });
          return;
        }

        // Object → key/value entries
        if (section && typeof section === 'object') {
          const entries = Object.entries(section).filter(([k, v]) => v != null && v !== '' && k !== 'id');
          if (entries.length === 0) return;
          lines.push(`  ▸ Section: ${sectionName}`);
          entries.forEach(([k, v]) => {
            lines.push(`    • ${k} = ${v}`);
          });
        }
      });
    });

    // Subcontractors full ledger
    lines.push('');
    lines.push(`═══ SUBCONTRACTOR LEDGER (${(proj.subcontractors || []).length} trades) ═══`);
    if (!proj.subcontractors || proj.subcontractors.length === 0) {
      lines.push(`(no subcontractors)`);
    } else {
      const subTotal = proj.subcontractors.reduce((s, sub) => s + Financial.parseNum(sub.contract), 0);
      const paidTotal = proj.subcontractors.reduce((s, sub) => s + Financial.parseNum(sub.paid), 0);
      lines.push(`Total contracted: ${Financial.fmtFull(subTotal)}`);
      lines.push(`Total paid: ${Financial.fmtFull(paidTotal)}`);
      lines.push(`Outstanding: ${Financial.fmtFull(subTotal - paidTotal)}`);
      lines.push('');
      proj.subcontractors.forEach((sub, i) => {
        lines.push(`  ${i + 1}. ${sub.trade || '—'} — ${sub.company || '—'}`);
        lines.push(`     Contact: ${sub.contact || '—'} | ${sub.phone || '—'} | ${sub.email || '—'}`);
        lines.push(`     Phase: ${sub.phase || '—'}`);
        lines.push(`     Contract: ${Financial.fmtFull(sub.contract)} | Paid: ${Financial.fmtFull(sub.paid)} | Retention: ${Financial.fmtFull(sub.retention)}`);
        if (sub.notes) lines.push(`     Notes: ${sub.notes}`);
      });
    }

    // Punch items
    lines.push('');
    lines.push(`═══ PUNCH LIST (${(proj.punchItems || []).length} items) ═══`);
    if (!proj.punchItems || proj.punchItems.length === 0) {
      lines.push(`(no punch items)`);
    } else {
      proj.punchItems.forEach((p, i) => {
        lines.push(`  ${i + 1}. [${p.itemNumber || p.id}] ${p.description || '—'}`);
        lines.push(`     Location: ${p.location || '—'} | Assigned: ${p.assignedTo || '—'}`);
        lines.push(`     Priority: ${p.priority || '—'} | Status: ${p.status || '—'}`);
        if (p.repairCost) lines.push(`     Repair cost: ${Financial.fmtFull(p.repairCost)}`);
      });
    }

    // Invoices
    lines.push('');
    lines.push(`═══ INVOICES (${(proj.invoices || []).length}) ═══`);
    if (!proj.invoices || proj.invoices.length === 0) {
      lines.push(`(no invoices)`);
    } else {
      proj.invoices.forEach((inv, i) => {
        lines.push(`  ${i + 1}. ${inv.invoice_number || '—'} — ${Financial.fmtFull(inv.amount || 0)} — ${inv.status || '—'}`);
        if (inv.due_date) lines.push(`     Due: ${inv.due_date} | Paid: ${inv.paid_date || 'unpaid'}`);
        if (inv.notes) lines.push(`     Notes: ${inv.notes}`);
      });
    }

    return lines.join('\n');
  }

  // ── Server-Proxied AI Chat ──────────────────────────────
  async function sendUserMessage(text) {
    if (!text.trim()) return;

    const proj = State.getCurrentProject();
    const projContext = proj ? buildFullProjectContext(proj) : 'No project loaded.';

    // Add user message to UI
    addMessage('user', 'user', 'You', escapeHtml(text), []);
    const container = document.getElementById('ai-messages');
    if (container) {
      const lastMsg = container.lastElementChild;
      if (lastMsg) lastMsg.classList.add('user');
    }

    // Build contents: first turn carries full project data + question,
    // then previous conversation (model answers + older user questions).
    // We exclude the most recent user turn from history because we
    // re-inject it inside the first turn so we don't get two `user`
    // turns in a row (Gemini requires alternating roles).
    const historyWithoutLatest = conversationHistory.slice(0, -1);

    // Trim history to last 6 turns (3 exchanges) to stay within token limits
    const trimmedHistory = historyWithoutLatest.slice(-6);

    const contents = [];
    if (proj) {
      contents.push({
        role: 'user',
        parts: [{ text: `Here is my complete project data:\n\n${projContext}\n\n---\nMy question: ${text}` }],
      });
    } else {
      contents.push({ role: 'user', parts: [{ text }] });
    }
    contents.push(...trimmedHistory);

    setThinking(true);

    // Push user turn to history (trimmed for context only — no project data blob)
    conversationHistory.push({ role: 'user', parts: [{ text }] });

    // Thinking indicator
    const thinkId = 'think-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    addMessage('info', 'bot', 'Build Assistant', `<span id="${thinkId}" class="ai-thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>`, []);

    try {
      // Call server proxy (API key is server-side)
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: `You are Build Assistant, an expert construction cost advisor embedded in RECON — a construction financial ledger app for Indian contractors and site builders.

You help with:
- Cost estimation and budget management in INR
- Material selection and alternatives with local pricing
- Construction best practices and ISI/BIS standards
- Risk identification and mitigation
- Phase-specific construction guidance
- Subcontractor negotiation strategies

IMPORTANT: The user's COMPLETE project data is provided in the first user turn. It includes every line item, quantity, unit price, and total — across all 8 phases, all subcontractors, all punch items, and all invoices. USE THIS DATA to answer precisely. Never guess or invent values — if something isn't in the data, say so.

Guidelines:
- Quote exact figures from the data (use the ₹ symbol, lakhs/crores where appropriate).
- If asked to "list everything", reproduce the data section by section in a clean readable format (use bullet lists and headers).
- If asked for analysis, give concrete insights backed by the numbers (e.g. "Phase 4 is 35% over its fair share of budget because...").
- Reference the project data explicitly when answering.
- Address the contractor directly as "you".
- Respond concisely unless the user asked for a list/breakdown, in which case be thorough.
- Format key numbers in bold using ** markdown.`
            }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.9,
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) throw new Error('RATE_LIMITED');
        if (response.status === 503) throw new Error('NOT_CONFIGURED');
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      let replyText = '';
      if (data.candidates && data.candidates[0]?.content?.parts) {
        replyText = data.candidates[0].content.parts.map(p => p.text || '').join('');
      }

      if (!replyText) {
        if (data.candidates && data.candidates[0]?.finishReason === 'SAFETY') {
          replyText = 'I can\'t answer that specific question. Could you rephrase or ask something about construction costs, materials, or project management?';
        } else {
          replyText = 'I didn\'t get a response. Please try again.';
        }
      }

      conversationHistory.push({ role: 'model', parts: [{ text: replyText }] });
      persistHistory();

      // Format markdown (escape HTML first to prevent XSS injection from AI)
      replyText = escapeHtml(replyText)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');

      const thinkEl = document.getElementById(thinkId);
      if (thinkEl) thinkEl.closest('.ai-message').remove();

      addMessage('info', 'bot', 'Build Assistant', replyText, ['Got it'], true);

    } catch (err) {
      const thinkEl = document.getElementById(thinkId);
      if (thinkEl) thinkEl.closest('.ai-message').remove();

      if (err.message === 'RATE_LIMITED') {
        addMessage('warning', 'alert', 'Rate Limited', 'Too many requests. Please wait a moment and try again (limit: 10/min).', ['OK']);
      } else if (err.message === 'NOT_CONFIGURED') {
        addMessage('warning', 'settings', 'AI Not Configured', 'The Gemini API key is not set on the server. Ask your admin to add GEMINI_API_KEY to the .env file.', ['OK']);
      } else {
        console.warn('AI error:', err.message);
        const fallbackReply = getRuleBasedReply(text);
        addMessage('info', 'bot', 'Build Assistant (Offline)', escapeHtml(fallbackReply).replace(/\n/g,'<br>') + '<br><br><span style="font-size:10px;color:var(--text-muted)">AI is offline — using built-in knowledge.</span>', ['OK'], true);
      }

      conversationHistory.pop();
    }

    setThinking(false);
    clearPulse();
  }

  function getRuleBasedReply(text) {
    const t = text.toLowerCase();
    if (t.includes('concrete') || t.includes('foundation'))
      return 'For concrete foundations, ensure proper curing time (min 28 days) and use a vibrator to eliminate air pockets. In clay soil, add 10-15% contingency for excavation surprises.';
    if (t.includes('budget') || t.includes('cost'))
      return 'Track your phase budgets weekly. The biggest budget busters are scope creep in MEP rough-ins and finish upgrades. Lock in subcontractor quotes before Phase 4 starts.';
    if (t.includes('permit') || t.includes('inspection'))
      return 'Schedule inspections 48-72 hours in advance. Keep all permits on-site and ensure permit cards are visible.';
    if (t.includes('framing') || t.includes('lumber'))
      return 'Check lumber moisture content before framing — it should be below 19% for walls. Engineered lumber (LVL beams) provides better stability for long spans.';
    if (t.includes('hvac') || t.includes('air'))
      return 'Right-size your HVAC using a Manual J calculation. Oversized systems short-cycle and increase humidity issues.';
    if (t.includes('plumb') || t.includes('pipe') || t.includes('water'))
      return 'CPVC is the standard for hot water supply lines in India at ₹45-65/ft. For cold water, consider HDPE — 30% cheaper.';
    if (t.includes('electric') || t.includes('wire') || t.includes('wiring'))
      return 'Use ISI-marked copper wiring (IS 694). For a 2BHK, plan minimum 4 circuits: lights, power sockets, AC/geyser, and kitchen appliances.';
    return 'Great question! I\'d recommend consulting with your structural engineer or trade contractor for project-specific guidance.';
  }

  // Handle action button clicks
  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('ai-action-btn') && e.target.textContent === 'Ask AI for More') {
      const input = document.getElementById('ai-input');
      if (input) { input.value = 'Tell me more about this risk and how to mitigate it'; input.focus(); }
    }
  });

  return {
    checkTriggers,
    addMessage,
    sendUserMessage,
    setWatching,
    setThinking,
    clearPulse,
    clearAIHistory,
    loadPersistedHistory,
  };
})();
