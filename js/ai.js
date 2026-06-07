/* ═══════════════════════════════════════════
   AI.JS — Build Assistant Co-Pilot v2
   Rule-based triggers + Google Gemini API
   ═══════════════════════════════════════════ */

const AI = (() => {
  let lastContextHash = '';
  let aiCheckTimer = null;
  let isThinking = false;
  let apiKey = localStorage.getItem('gemini_api_key') || '';
  let conversationHistory = [];

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
    const ph1 = proj.phases[0].data;
    const survey = ph1.survey || {};
    if (survey.soil_class === 'Clay' && parseFloat(survey.site_slope || 0) > 8) {
      rules.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Foundation Risk Detected',
        body: 'Clay soil + slope >8% detected. This combination increases concrete heaving risk. Recommend requesting structural engineer review before foundation type selection. Est. retaining wall cost premium: +15% on concrete volume.',
        actions: ['Understood', 'Ask AI for More']
      });
    }

    // Phase 4 — Copper + high footage
    const ph4 = proj.phases[3].data;
    const plumb = ph4.plumbing || {};
    if (plumb.supply_material === 'Copper' && parseFloat(plumb.supply_lf || 0) > 500) {
      rules.push({
        type: 'suggestion',
        icon: '💡',
        title: 'Material Upgrade Suggestion',
        body: 'PEX-A at this footage cuts labor hours by ~30% and material cost by ~40% vs Copper. Want a side-by-side comparison?',
        actions: ['Show Comparison', 'Keep Copper']
      });
    }

    // Phase 5 — Level 5 finish + large area
    const ph5 = proj.phases[4].data;
    const dw = ph5.drywall || {};
    if (dw.finish_level === 'Level 5' && parseFloat(dw.drywall_sqft || 0) > 5000) {
      rules.push({
        type: 'suggestion',
        icon: '💡',
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
        type: 'warning',
        icon: '📊',
        title: 'Budget Pulse Alert',
        body: `Project is tracking ${Math.round((total/proj.totalBudget-1)*100)}% over budget (${Financial.fmt(overrun)} over). Review high-cost phases and negotiate subcontractor rates.`,
        actions: ['Dismiss']
      });
    }

    // Phase 2 — Pier & Beam suggestion if Slab on Clay
    const ph2 = proj.phases[1].data;
    const concrete = ph2.concrete || {};
    if (concrete.foundation_type === 'Slab-on-Grade' && (ph1.survey?.soil_class === 'Clay')) {
      rules.push({
        type: 'suggestion',
        icon: '🏗',
        title: 'Foundation Type Review',
        body: 'Slab-on-Grade on Clay soil has elevated heaving risk. Pier & Beam foundation may be more appropriate. Est. cost delta: +₹85,000–₹1.2L but reduces long-term maintenance significantly.',
        actions: ['Noted', 'Learn More']
      });
    }

    // Show first new unshown rule
    const contextStr = JSON.stringify(rules.map(r=>r.title));
    if (contextStr !== lastContextHash && rules.length > 0) {
      lastContextHash = contextStr;
      rules.forEach(rule => addMessage(rule.type, rule.icon, rule.title, rule.body, rule.actions));
      showAIPulse();
    }
  }

  function addMessage(type, icon, title, body, actions = []) {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    const actionsHtml = actions.map(a =>
      `<button class="ai-action-btn" onclick="this.parentElement.parentElement.remove()">${a}</button>`
    ).join('');

    const msg = document.createElement('div');
    msg.className = `ai-message ${type}`;
    msg.innerHTML = `
      <div class="ai-msg-icon">${icon}</div>
      <div class="ai-msg-body">
        <div class="ai-msg-type">${title}</div>
        <p>${body}</p>
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
    if (dot) {
      dot.className = 'ai-status-dot ' + (thinking ? 'thinking' : 'ready');
    }
  }

  // ── API Key Management ──────────────────────────────────────
  function promptForKey() {
    const current = apiKey ? '(key saved ✓)' : '(no key set)';
    const key = prompt(`Enter your Google Gemini API Key ${current}\n\nGet a free key at: https://aistudio.google.com/app/apikey\n\nLeave blank to cancel:`);
    if (key !== null && key.trim()) {
      apiKey = key.trim();
      localStorage.setItem('gemini_api_key', apiKey);
      App.toast('Gemini API key saved ✓', 'success');
      return true;
    }
    return !!apiKey;
  }

  // ── Gemini API Chat ─────────────────────────────────────────
  async function sendUserMessage(text) {
    if (!text.trim()) return;

    // Check for API key
    if (!apiKey) {
      const hasKey = promptForKey();
      if (!hasKey) {
        addMessage('info', '🔑', 'API Key Required', 'Please enter your Google Gemini API key to enable AI chat. Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--amber);text-decoration:underline">aistudio.google.com</a>.', ['Set API Key']);
        return;
      }
    }

    const proj = State.getCurrentProject();
    const projContext = proj ? `
Current project: ${proj.name}
Client: ${proj.client || 'N/A'}
Type: ${proj.type || 'residential'}
Total budget: ${Financial.fmtFull(proj.totalBudget)}
Current spend: ${Financial.fmtFull(Financial.computeProjectTotal(proj))}
Budget used: ${proj.totalBudget > 0 ? Math.round((Financial.computeProjectTotal(proj)/proj.totalBudget)*100) : 0}%
Phase breakdown:
${proj.phases.map(p => `  ${p.name}: ${Financial.fmtFull(Financial.computePhaseTotal(p))} (${p.completion}% complete)`).join('\n')}
Subcontractors: ${(proj.subcontractors||[]).length} trades, ${Financial.fmtFull((proj.subcontractors||[]).reduce((s,sub) => s + Financial.parseNum(sub.contract), 0))} total contracted
` : 'No project loaded.';

    // Add user message to UI
    addMessage('user', '👤', 'You', text, []);
    const container = document.getElementById('ai-messages');
    if (container) {
      const lastMsg = container.lastElementChild;
      if (lastMsg) lastMsg.classList.add('user');
    }

    // Add to conversation history
    conversationHistory.push({ role: 'user', parts: [{ text: text }] });

    // Keep only last 10 messages for context window management
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    setThinking(true);

    // Thinking indicator
    const thinkId = 'think-' + Date.now();
    addMessage('info', '🤖', 'Build Assistant', `<span id="${thinkId}" class="ai-thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>`, []);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `You are Build Assistant, an expert construction cost advisor embedded in BUILD MANAGER — a construction financial ledger app.

You help Indian contractors and site builders with:
- Cost estimation and budget management in INR
- Material selection and alternatives with local pricing
- Construction best practices and ISI/BIS standards
- Risk identification and mitigation
- Phase-specific construction guidance
- Subcontractor negotiation strategies

Current Project Context:
${projContext}

Guidelines:
- Respond concisely (3-5 sentences max). Be specific and practical.
- Use real INR numbers and Indian construction context when helpful.
- Reference the project data when relevant (e.g. "Your Phase 2 concrete costs look high").
- Address the contractor directly as "you".
- If asked about something outside construction, politely redirect.
- Format key numbers in bold using ** markdown.`
              }]
            },
            contents: conversationHistory,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 500,
              topP: 0.9,
            }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `API error: ${response.status}`;
        
        if (response.status === 400 && errorMsg.includes('API key')) {
          throw new Error('INVALID_KEY');
        }
        if (response.status === 429) {
          throw new Error('RATE_LIMITED');
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      
      let replyText = '';
      if (data.candidates && data.candidates[0]?.content?.parts) {
        replyText = data.candidates[0].content.parts.map(p => p.text || '').join('');
      }
      
      if (!replyText) {
        // Check for safety block
        if (data.candidates && data.candidates[0]?.finishReason === 'SAFETY') {
          replyText = 'I can\'t answer that specific question. Could you rephrase or ask something about construction costs, materials, or project management?';
        } else {
          replyText = 'I didn\'t get a response. Please try again.';
        }
      }

      // Add model response to history
      conversationHistory.push({ role: 'model', parts: [{ text: replyText }] });

      // Format markdown bold/italic
      replyText = replyText
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');

      // Replace thinking indicator
      const thinkEl = document.getElementById(thinkId);
      if (thinkEl) thinkEl.closest('.ai-message').remove();
      
      addMessage('info', '🤖', 'Build Assistant', replyText, ['Got it']);

    } catch (err) {
      const thinkEl = document.getElementById(thinkId);
      if (thinkEl) thinkEl.closest('.ai-message').remove();

      if (err.message === 'INVALID_KEY') {
        apiKey = '';
        localStorage.removeItem('gemini_api_key');
        addMessage('warning', '🔑', 'Invalid API Key', 'Your Gemini API key is invalid or expired. Please set a new key. Get one free at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--amber);text-decoration:underline">aistudio.google.com</a>.', ['Set New Key']);
      } else if (err.message === 'RATE_LIMITED') {
        addMessage('warning', '⏳', 'Rate Limited', 'Too many requests. Please wait a moment and try again.', ['OK']);
      } else {
        // Fallback to rule-based
        console.warn('Gemini API error:', err.message);
        const fallbackReply = getRuleBasedReply(text);
        addMessage('info', '🤖', 'Build Assistant (Offline)', fallbackReply + '<br><br><span style="font-size:10px;color:var(--text-muted)">AI is offline. Set your Gemini API key for full AI assistance.</span>', ['Set API Key', 'OK']);
      }

      // Remove failed user message from history
      conversationHistory.pop();
    }

    setThinking(false);
    clearPulse();
  }

  function getRuleBasedReply(text) {
    const t = text.toLowerCase();
    if (t.includes('concrete') || t.includes('foundation')) {
      return 'For concrete foundations, ensure proper curing time (min 28 days for full strength) and use a vibrator to eliminate air pockets. In clay soil, add 10-15% contingency for excavation surprises.';
    }
    if (t.includes('budget') || t.includes('cost')) {
      return 'Track your phase budgets weekly. The biggest budget busters are scope creep in MEP rough-ins and finish upgrades. Lock in subcontractor quotes before Phase 4 starts.';
    }
    if (t.includes('permit') || t.includes('inspection')) {
      return 'Schedule inspections 48-72 hours in advance. Keep all permits on-site and ensure permit cards are visible. Rejected inspections typically add 1-2 weeks to your timeline.';
    }
    if (t.includes('framing') || t.includes('lumber')) {
      return 'Check lumber moisture content before framing — it should be below 19% for walls. Engineered lumber (LVL beams) provides better dimensional stability than traditional lumber for long spans.';
    }
    if (t.includes('hvac') || t.includes('air')) {
      return 'Right-size your HVAC using a Manual J calculation. Oversized systems short-cycle and increase humidity issues. Mini-splits offer 30-40% efficiency gains over central forced air in smaller zones.';
    }
    if (t.includes('plumb') || t.includes('pipe') || t.includes('water')) {
      return 'CPVC is the standard for hot water supply lines in India at ₹45-65/ft. For cold water, consider HDPE — 30% cheaper than CPVC and equally durable for underground runs.';
    }
    if (t.includes('electric') || t.includes('wire') || t.includes('wiring')) {
      return 'Use ISI-marked copper wiring (IS 694). For a 2BHK, plan for minimum 4 circuits: lights, power sockets, AC/geyser, and kitchen appliances. MCBs at ₹150-400 each are mandatory per NBC 2016.';
    }
    return 'Great question! I\'d recommend consulting with your structural engineer or trade contractor for project-specific guidance. Would you like me to help break down the costs involved?';
  }

  // Handle "Set API Key" action button clicks
  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('ai-action-btn') && e.target.textContent === 'Set API Key') {
      promptForKey();
    }
    if (e.target.classList?.contains('ai-action-btn') && e.target.textContent === 'Set New Key') {
      promptForKey();
    }
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
    promptForKey,
  };
})();
