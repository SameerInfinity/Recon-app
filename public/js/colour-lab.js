/* ═══════════════════════════════════════════
   COLOUR LAB — Interior Paint Visualiser
   Isometric room · Multiply-blend lighting
   ═══════════════════════════════════════════ */

const ColourLab = (() => {

  // ── State ────────────────────────────────
  let _canvas = null;
  let _ctx = null;
  let _raf = null;
  let _rendered = false;

  const state = {
    wallLeft: '#B0C4DE',   // steel-blue default
    wallRight: '#C5D8C0',   // sage-green default
    ceiling: '#F0EDE0',   // warm cream
    floor: '#C8A97A',   // warm timber
    lightMode: 'daylight',  // daylight | warmLED | coolLED | night | overcast
    sunAngle: 50,          // 0 = dawn (left), 100 = dusk (right), 50 = noon
    roomWidth: 600,
    roomHeight: 480,
  };

  // ── Geometry constants ──────────────────
  // We draw an isometric-ish room with 3 faces:
  //   LEFT WALL  — back-left quadrilateral
  //   RIGHT WALL — back-right quadrilateral
  //   FLOOR      — bottom quadrilateral
  //   CEILING    — top quadrilateral
  // All coordinates are relative to a 600×480 canvas.
  // The "room" vanishes at a central point.

  function geom(W, H) {
    // Vanishing point
    const vx = W * 0.5, vy = H * 0.40;
    // Outer canvas corners
    const TL = [0, 0], TR = [W, 0], BL = [0, H], BR = [W, H];
    // Inner wall corners (where surfaces meet)
    const innerTop = [W * 0.28, H * 0.05];   // ceiling ridge left
    const innerTopR = [W * 0.72, H * 0.05];  // ceiling ridge right
    const innerMidL = [W * 0.28, H * 0.62];  // floor/wall junction left
    const innerMidR = [W * 0.72, H * 0.62];  // floor/wall junction right
    const innerBot = [W * 0.50, H * 0.80];  // floor centre-bottom vanish

    return {
      // LEFT WALL polygon (4 pts: top-left → top-join → bot-join → bot-left)
      leftWall: [TL, innerTop, innerMidL, BL],
      // RIGHT WALL polygon
      rightWall: [innerTop, TR, BR, innerMidR],    // Note: wrong order fixed below
      // CEILING (top 4-gon)
      ceiling: [TL, TR, innerTopR, innerTop],
      // FLOOR (bottom 4-gon)
      floor: [innerMidL, innerMidR, BR, BL],
      // Window on left wall (for daylight mode)
      window: [
        [W * 0.06, H * 0.12],
        [W * 0.19, H * 0.12],
        [W * 0.19, H * 0.38],
        [W * 0.06, H * 0.38],
      ],
      vx, vy,
      innerTop, innerTopR, innerMidL, innerMidR,
    };
  }

  // ── Colour math ─────────────────────────
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  // Multiply blend: result = (base * light) / 255
  function multiplyBlend(baseHex, lightR, lightG, lightB, strength) {
    const [br, bg, bb] = hexToRgb(baseHex);
    const r = br + (br * lightR / 255 - br) * strength;
    const g = bg + (bg * lightG / 255 - bg) * strength;
    const b = bb + (bb * lightB / 255 - bb) * strength;
    return rgbToHex(r, g, b);
  }

  // Screen blend: result = 1 - (1-base)*(1-light)
  function screenBlend(baseHex, lightR, lightG, lightB, strength) {
    const [br, bg, bb] = hexToRgb(baseHex);
    const r = 255 - (255 - br) * (255 - lightR * strength) / 255;
    const g = 255 - (255 - bg) * (255 - lightG * strength) / 255;
    const b = 255 - (255 - bb) * (255 - lightB * strength) / 255;
    return rgbToHex(r, g, b);
  }

  // Compute apparent colour under a lighting mode
  // Returns { lw, rw, ceil, floor, ambientRgb, sunPatch } per-surface colours
  function computeLitColours() {
    const { lightMode, sunAngle } = state;
    // sunAngle: 0=dawn(orange), 50=noon(white), 100=dusk(deep gold)
    const ang = sunAngle / 100; // 0→1

    // Sun colour temperature: dawn=warm-orange, noon=white-blue, dusk=deep-gold
    const sunR = ang < 0.5
      ? lerp(255, 255, ang * 2)   // dawn→noon: constant R
      : lerp(255, 255, (ang - 0.5) * 2);
    const sunG = ang < 0.5
      ? lerp(120, 248, ang * 2)   // dawn:orange→noon:white
      : lerp(248, 160, (ang - 0.5) * 2);  // noon→dusk: warm gold
    const sunB = ang < 0.5
      ? lerp(40, 220, ang * 2)    // dawn→noon: blueish
      : lerp(220, 50, (ang - 0.5) * 2);   // noon→dusk: warm

    const modes = {
      daylight: {
        ambient: [sunR, sunG, sunB],
        ambStr: 0.18,
        leftMod: 1.12,   // left wall gets direct sun
        rightMod: 0.82,   // right wall in shade
        ceilMod: 1.08,
        floorMod: 0.88,
        hasSun: true,
      },
      overcast: {
        ambient: [200, 210, 220],
        ambStr: 0.10,
        leftMod: 0.97,
        rightMod: 0.93,
        ceilMod: 1.00,
        floorMod: 0.90,
        hasSun: false,
      },
      warmLED: {
        ambient: [255, 195, 100],
        ambStr: 0.22,
        leftMod: 1.0,
        rightMod: 0.98,
        ceilMod: 1.05,
        floorMod: 0.96,
        hasSun: false,
      },
      coolLED: {
        ambient: [190, 215, 255],
        ambStr: 0.18,
        leftMod: 1.0,
        rightMod: 0.97,
        ceilMod: 1.02,
        floorMod: 0.95,
        hasSun: false,
      },
      night: {
        ambient: [40, 20, 8],
        ambStr: 0.70,
        leftMod: 0.30,
        rightMod: 0.25,
        ceilMod: 0.20,
        floorMod: 0.40,
        hasSun: false,
        lampR: 255, lampG: 140, lampB: 60,
      },
    };

    const m = modes[lightMode] || modes.daylight;
    const [aR, aG, aB] = m.ambient;

    function applyMod(hexColor, mod, str) {
      // Multiply with ambient light then adjust brightness by mod
      const [r, g, b] = hexToRgb(hexColor);
      const mr = clamp((r * (aR / 255) * str + r * (1 - str)) * mod);
      const mg = clamp((g * (aG / 255) * str + g * (1 - str)) * mod);
      const mb = clamp((b * (aB / 255) * str + b * (1 - str)) * mod);
      return rgbToHex(mr, mg, mb);
    }

    return {
      lw: applyMod(state.wallLeft, m.leftMod, m.ambStr),
      rw: applyMod(state.wallRight, m.rightMod, m.ambStr),
      ceil: applyMod(state.ceiling, m.ceilMod, m.ambStr),
      fl: applyMod(state.floor, m.floorMod, m.ambStr),
      mode: m,
      sunR, sunG, sunB,
      ang,
    };
  }

  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  // ── Canvas drawing ───────────────────────
  function drawPoly(ctx, pts, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawGradientPoly(ctx, pts, grad) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function render() {
    if (!_canvas || !_ctx) return;
    const ctx = _ctx;
    const W = _canvas.width, H = _canvas.height;
    const g = geom(W, H);
    const lit = computeLitColours();

    // Clear
    ctx.clearRect(0, 0, W, H);

    // ── 1. Fill base surfaces ──
    drawPoly(ctx, g.leftWall, lit.lw);
    drawPoly(ctx, g.rightWall, lit.rw);
    drawPoly(ctx, g.ceiling, lit.ceil);
    drawPoly(ctx, g.floor, lit.fl);

    // ── 2. Subtle edge shading — makes surfaces feel distinct ──
    // Left wall: slightly darker near left edge (depth illusion)
    const lwGrad = ctx.createLinearGradient(0, 0, W * 0.28, 0);
    lwGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
    lwGrad.addColorStop(0.4, 'rgba(0,0,0,0.04)');
    lwGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    drawGradientPoly(ctx, g.leftWall, lwGrad);
    ctx.restore();

    // Right wall: darker top-right
    const rwGrad = ctx.createLinearGradient(W * 0.72, 0, W, 0);
    rwGrad.addColorStop(0, 'rgba(0,0,0,0)');
    rwGrad.addColorStop(0.6, 'rgba(0,0,0,0.06)');
    rwGrad.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    drawGradientPoly(ctx, g.rightWall, rwGrad);
    ctx.restore();

    // Floor: perspective fade (darker near walls, lighter in centre)
    const flGrad = ctx.createRadialGradient(W * 0.5, H * 0.75, 10, W * 0.5, H * 0.75, W * 0.55);
    flGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
    flGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
    flGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    drawGradientPoly(ctx, g.floor, flGrad);
    ctx.restore();

    // ── 3. Lighting effects ──
    if (lit.mode.hasSun) {
      drawSunEffect(ctx, g, W, H, lit);
    }
    if (state.lightMode === 'night') {
      drawNightLamp(ctx, g, W, H);
    }
    if (state.lightMode === 'warmLED' || state.lightMode === 'coolLED') {
      drawCeilingLight(ctx, g, W, H, lit);
    }

    // ── 4. Window frame ──
    drawWindow(ctx, g, W, H, lit);

    // ── 5. Room structure lines ──
    drawRoomLines(ctx, g, W, H);

    // ── 6. Floor detail (subtle planks / tiles) ──
    drawFloorPattern(ctx, g, W, H, lit.fl);

    _rendered = true;
  }

  function drawSunEffect(ctx, g, W, H, lit) {
    // Sun patch coming through window onto floor + right wall
    const { ang, sunR, sunG, sunB } = lit;
    const winPts = g.window;
    const winCX = (winPts[0][0] + winPts[1][0]) / 2;
    const winCY = (winPts[0][1] + winPts[3][1]) / 2;

    // Soft ambient glow on left wall around window
    const winGlow = ctx.createRadialGradient(winCX, winCY, 5, winCX, winCY, W * 0.35);
    winGlow.addColorStop(0, `rgba(${sunR},${sunG},${sunB},0.28)`);
    winGlow.addColorStop(0.4, `rgba(${sunR},${sunG},${sunB},0.10)`);
    winGlow.addColorStop(1, `rgba(${sunR},${sunG},${sunB},0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGradientPoly(ctx, g.leftWall, winGlow);
    ctx.restore();

    // Sun patch on floor — trapezoid projected from window
    // The sun angle determines how far across the floor the patch goes
    const patchOffX = lerp(W * 0.05, W * 0.50, ang);
    const patchW = lerp(W * 0.22, W * 0.12, ang);
    const patch = [
      [winPts[2][0], winPts[2][1]],          // bottom of window
      [winPts[3][0], winPts[3][1]],           // top-bottom of window
      [winPts[0][0] + patchOffX, H * 0.62],  // floor projection far
      [winPts[2][0] + patchOffX + patchW, H * 0.75], // floor projection near
    ];
    const sunPatch = ctx.createLinearGradient(patch[0][0], patch[0][1], patch[3][0], patch[3][1]);
    sunPatch.addColorStop(0, `rgba(${sunR},${sunG},${sunB},0.35)`);
    sunPatch.addColorStop(0.5, `rgba(${sunR},${sunG},${sunB},0.18)`);
    sunPatch.addColorStop(1, `rgba(${sunR},${sunG},${sunB},0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.moveTo(patch[0][0], patch[0][1]);
    for (let i = 1; i < patch.length; i++) ctx.lineTo(patch[i][0], patch[i][1]);
    ctx.closePath();
    ctx.fillStyle = sunPatch;
    ctx.fill();
    ctx.restore();
  }

  function drawNightLamp(ctx, g, W, H) {
    // Warm point lamp from ceiling centre
    const lampX = W * 0.50, lampY = H * 0.15;

    // Big soft cone downward
    const cone = ctx.createRadialGradient(lampX, lampY, 2, lampX, lampY + H * 0.3, W * 0.42);
    cone.addColorStop(0, 'rgba(255,160,60,0.55)');
    cone.addColorStop(0.3, 'rgba(255,130,40,0.22)');
    cone.addColorStop(0.7, 'rgba(255,100,20,0.06)');
    cone.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = cone;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Lamp dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(lampX, lampY, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,230,150,0.95)';
    ctx.fill();
    ctx.shadowColor = 'rgba(255,180,80,0.9)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();
  }

  function drawCeilingLight(ctx, g, W, H, lit) {
    const [aR, aG, aB] = lit.mode.ambient;
    const lampX = W * 0.5, lampY = H * 0.12;

    const glow = ctx.createRadialGradient(lampX, lampY, 5, lampX, lampY + H * 0.2, W * 0.5);
    glow.addColorStop(0, `rgba(${aR},${aG},${aB},0.35)`);
    glow.addColorStop(0.4, `rgba(${aR},${aG},${aB},0.12)`);
    glow.addColorStop(1, `rgba(${aR},${aG},${aB},0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Ceiling fixture dot
    ctx.save();
    ctx.beginPath();
    ctx.arc(lampX, lampY, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${aR},${aG},${aB},0.9)`;
    ctx.shadowColor = `rgba(${aR},${aG},${aB},0.7)`;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  function drawWindow(ctx, g, W, H, lit) {
    const pts = g.window;
    const wx1 = pts[0][0], wy1 = pts[0][1];
    const wx2 = pts[1][0], wy2 = pts[2][1];

    // Window glow (exterior sky)
    let skyTop, skyBot;
    if (state.lightMode === 'night') {
      skyTop = '#0d1b2a'; skyBot = '#1a2744';
    } else if (state.lightMode === 'overcast') {
      skyTop = '#c5d0db'; skyBot = '#dde4ec';
    } else {
      const ang = state.sunAngle / 100;
      const r = Math.round(lerp(255, 100, ang < 0.5 ? ang * 2 * 0.3 : (1 - (ang - 0.5) * 2) * 0.3));
      const g2 = Math.round(lerp(160, 180, ang));
      const b = Math.round(lerp(80, 240, ang < 0.5 ? ang * 2 : 1));
      skyTop = `rgb(${r},${g2},${b})`;
      skyBot = `rgb(${Math.round(r * 1.1)},${Math.round(g2 * 1.05)},255)`;
    }

    const skyGrad = ctx.createLinearGradient(wx1, wy1, wx1, wy2);
    skyGrad.addColorStop(0, skyTop);
    skyGrad.addColorStop(1, skyBot);

    ctx.save();
    ctx.fillStyle = skyGrad;
    ctx.fillRect(wx1, wy1, wx2 - wx1, wy2 - wy1);

    // Window frame
    const frameW = 3;
    ctx.strokeStyle = 'rgba(60,40,20,0.7)';
    ctx.lineWidth = frameW;
    ctx.strokeRect(wx1, wy1, wx2 - wx1, wy2 - wy1);
    // Cross bar
    const midX = (wx1 + wx2) / 2, midY = (wy1 + wy2) / 2;
    ctx.beginPath();
    ctx.moveTo(midX, wy1); ctx.lineTo(midX, wy2);
    ctx.moveTo(wx1, midY); ctx.lineTo(wx2, midY);
    ctx.stroke();

    // Glare reflection
    const glare = ctx.createLinearGradient(wx1, wy1, wx2, wy2);
    glare.addColorStop(0, 'rgba(255,255,255,0.28)');
    glare.addColorStop(0.4, 'rgba(255,255,255,0)');
    glare.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = glare;
    ctx.fillRect(wx1, wy1, wx2 - wx1, wy2 - wy1);
    ctx.restore();
  }

  function drawRoomLines(ctx, g, W, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(30,20,10,0.25)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Outline all faces
    const faces = [g.leftWall, g.rightWall, g.ceiling, g.floor];
    faces.forEach(pts => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawFloorPattern(ctx, g, W, H, floorHex) {
    // Draw subtle diagonal plank lines on floor
    const [fr, fg, fb] = hexToRgb(floorHex);
    // Darken by 18 for plank lines
    const lineColor = `rgba(${clamp(fr - 25)},${clamp(fg - 25)},${clamp(fb - 25)},0.35)`;

    const pts = g.floor;
    // Clip to floor polygon
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.8;
    // Draw horizontal-ish lines within floor area
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const y = lerp(pts[0][1], pts[2][1], t);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Public: render the full view HTML ───
  function renderView() {
    return `
    <div class="colour-lab-root" id="colour-lab-root">
      <!-- Header -->
      <div class="colour-lab-header">
        <div class="colour-lab-title">
          <span style="font-size:22px">🎨</span>
          <span>Interior Colour Lab</span>
        </div>
        <div class="colour-lab-subtitle">Preview how your wall &amp; ceiling colours respond to natural &amp; artificial light</div>
      </div>

      <!-- Main layout: canvas + controls -->
      <div class="colour-lab-layout">

        <!-- CANVAS -->
        <div class="colour-lab-canvas-wrap" id="colour-lab-canvas-wrap">
          <canvas id="colour-lab-canvas" width="600" height="380"></canvas>
          <!-- Mode badge -->
          <div class="colour-lab-badge" id="colour-lab-badge">☀️ Daylight</div>
        </div>

        <!-- CONTROLS -->
        <div class="colour-lab-controls">

          <!-- Surface colours -->
          <div class="clb-section">
            <div class="clb-section-label">Surface Colours</div>

            <div class="clb-colour-row">
              <label class="clb-colour-label">Left Wall</label>
              <div class="clb-colour-pick">
                <input type="color" id="clb-wall-left" value="${state.wallLeft}"
                  oninput="ColourLab.setColour('wallLeft', this.value)">
                <span class="clb-hex" id="clb-wall-left-hex">${state.wallLeft.toUpperCase()}</span>
              </div>
              <div class="clb-swatch" id="clb-swatch-wl" style="background:${state.wallLeft}"></div>
            </div>

            <div class="clb-colour-row">
              <label class="clb-colour-label">Right Wall</label>
              <div class="clb-colour-pick">
                <input type="color" id="clb-wall-right" value="${state.wallRight}"
                  oninput="ColourLab.setColour('wallRight', this.value)">
                <span class="clb-hex" id="clb-wall-right-hex">${state.wallRight.toUpperCase()}</span>
              </div>
              <div class="clb-swatch" id="clb-swatch-wr" style="background:${state.wallRight}"></div>
            </div>

            <div class="clb-colour-row">
              <label class="clb-colour-label">Ceiling</label>
              <div class="clb-colour-pick">
                <input type="color" id="clb-ceiling" value="${state.ceiling}"
                  oninput="ColourLab.setColour('ceiling', this.value)">
                <span class="clb-hex" id="clb-ceiling-hex">${state.ceiling.toUpperCase()}</span>
              </div>
              <div class="clb-swatch" id="clb-swatch-cl" style="background:${state.ceiling}"></div>
            </div>

            <div class="clb-colour-row">
              <label class="clb-colour-label">Floor</label>
              <div class="clb-colour-pick">
                <input type="color" id="clb-floor" value="${state.floor}"
                  oninput="ColourLab.setColour('floor', this.value)">
                <span class="clb-hex" id="clb-floor-hex">${state.floor.toUpperCase()}</span>
              </div>
              <div class="clb-swatch" id="clb-swatch-fl" style="background:${state.floor}"></div>
            </div>
          </div>

          <!-- Presets -->
          <div class="clb-section">
            <div class="clb-section-label">Colour Presets</div>
            <div class="clb-presets">
              ${PRESETS.map((p, i) => `
                <button class="clb-preset-btn" title="${p.name}"
                  onclick="ColourLab.applyPreset(${i})"
                  style="--pw:${p.wallLeft};--pr:${p.wallRight};--pc:${p.ceiling}">
                  <span class="clb-preset-swatch" style="background:${p.wallLeft}"></span>
                  <span class="clb-preset-name">${p.name}</span>
                </button>`).join('')}
            </div>
          </div>

          <!-- Lighting mode -->
          <div class="clb-section">
            <div class="clb-section-label">Lighting Mode</div>
            <div class="clb-mode-grid">
              ${[
        { id: 'daylight', icon: '☀️', label: 'Daylight' },
        { id: 'overcast', icon: '⛅', label: 'Overcast' },
        { id: 'warmLED', icon: '💡', label: 'Warm LED' },
        { id: 'coolLED', icon: '🔵', label: 'Cool LED' },
        { id: 'night', icon: '🌙', label: 'Night' },
      ].map(m => `
                <button class="clb-mode-btn ${state.lightMode === m.id ? 'active' : ''}"
                  id="clb-mode-${m.id}"
                  onclick="ColourLab.setMode('${m.id}')">
                  <span class="clb-mode-icon">${m.icon}</span>
                  <span>${m.label}</span>
                </button>`).join('')}
            </div>
          </div>

          <!-- Sun angle (only for daylight mode) -->
          <div class="clb-section" id="clb-sun-section" style="${state.lightMode !== 'daylight' ? 'opacity:0.35;pointer-events:none' : ''}">
            <div class="clb-section-label">Sun Position</div>
            <div class="clb-sun-row">
              <span class="clb-sun-icon">🌅</span>
              <input type="range" min="0" max="100" value="${state.sunAngle}"
                id="clb-sun-slider" class="clb-slider"
                oninput="ColourLab.setSunAngle(this.value)">
              <span class="clb-sun-icon">🌇</span>
            </div>
            <div class="clb-sun-label" id="clb-sun-label">${sunLabel(state.sunAngle)}</div>
          </div>

          <!-- Colour info panel -->
          <div class="clb-section">
            <div class="clb-section-label">Apparent Colour Under Light</div>
            <div class="clb-apparent-grid" id="clb-apparent-grid">
              <!-- Updated by JS after render -->
            </div>
          </div>

        </div><!-- /controls -->
      </div><!-- /layout -->
    </div>`;
  }

  // ── Presets ─────────────────────────────
  const PRESETS = [
    { name: 'Nordic Calm', wallLeft: '#D4DBE1', wallRight: '#BCC7C9', ceiling: '#F4F2ED', floor: '#C8B89A' },
    { name: 'Terracotta Joy', wallLeft: '#E8917A', wallRight: '#D4795F', ceiling: '#F5E8D0', floor: '#9A7B5A' },
    { name: 'Sage & Stone', wallLeft: '#9BAF97', wallRight: '#8FA08B', ceiling: '#EDE9E0', floor: '#B0A090' },
    { name: 'Indigo Dusk', wallLeft: '#7B8DB8', wallRight: '#6A7BA8', ceiling: '#E8E6F0', floor: '#AFA8B8' },
    { name: 'Blush Linen', wallLeft: '#EDCFCE', wallRight: '#E0BCBB', ceiling: '#FDF6F0', floor: '#C4A880' },
    { name: 'Forest Night', wallLeft: '#3D5A4F', wallRight: '#344E45', ceiling: '#2A3830', floor: '#5A4A38' },
    { name: 'Golden Haveli', wallLeft: '#D4A84B', wallRight: '#C09338', ceiling: '#F0E0B0', floor: '#8B6A38' },
    { name: 'Powder Blue', wallLeft: '#B8CDE8', wallRight: '#A8B8D8', ceiling: '#EFF4FA', floor: '#C8B898' },
  ];

  function sunLabel(v) {
    if (v < 15) return '🌅 Early Dawn — deep orange';
    if (v < 30) return '🌄 Morning — warm gold';
    if (v < 45) return '🌤 Late Morning — yellow-white';
    if (v < 60) return '☀️ Noon — bright neutral white';
    if (v < 75) return '🌞 Afternoon — warm white';
    if (v < 90) return '🌆 Evening — amber gold';
    return '🌇 Dusk — deep warm red-gold';
  }

  function modeBadge(mode) {
    const m = { daylight: '☀️ Daylight', overcast: '⛅ Overcast', warmLED: '💡 Warm LED', coolLED: '🔵 Cool LED', night: '🌙 Night' };
    return m[mode] || mode;
  }

  // ── Public API ───────────────────────────
  function init() {
    _canvas = document.getElementById('colour-lab-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    // Responsive resize
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    renderLoop();
    updateApparentColours();
  }

  function resizeCanvas() {
    const wrap = document.getElementById('colour-lab-canvas-wrap');
    if (!wrap || !_canvas) return;
    const W = Math.min(wrap.clientWidth, 700);
    const H = Math.round(W * 0.63);
    _canvas.width = W;
    _canvas.height = H;
    state.roomWidth = W;
    state.roomHeight = H;
    render();
  }

  function renderLoop() {
    if (_raf) cancelAnimationFrame(_raf);
    render();
    updateApparentColours();
  }

  function setColour(surface, hex) {
    state[surface] = hex;
    const idMap = { wallLeft: 'wl', wallRight: 'wr', ceiling: 'cl', floor: 'fl' };
    const hexId = { wallLeft: 'clb-wall-left-hex', wallRight: 'clb-wall-right-hex', ceiling: 'clb-ceiling-hex', floor: 'clb-floor-hex' };
    const sid = idMap[surface];
    const sw = document.getElementById(`clb-swatch-${sid}`);
    if (sw) sw.style.background = hex;
    const hx = document.getElementById(hexId[surface]);
    if (hx) hx.textContent = hex.toUpperCase();
    renderLoop();
  }

  function setMode(mode) {
    state.lightMode = mode;
    // Update buttons
    document.querySelectorAll('.clb-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`clb-mode-${mode}`);
    if (btn) btn.classList.add('active');
    // Toggle sun slider visibility
    const sunSec = document.getElementById('clb-sun-section');
    if (sunSec) {
      sunSec.style.opacity = mode === 'daylight' ? '1' : '0.35';
      sunSec.style.pointerEvents = mode === 'daylight' ? '' : 'none';
    }
    // Update badge
    const badge = document.getElementById('colour-lab-badge');
    if (badge) badge.textContent = modeBadge(mode);
    renderLoop();
  }

  function setSunAngle(v) {
    state.sunAngle = parseInt(v);
    const lbl = document.getElementById('clb-sun-label');
    if (lbl) lbl.textContent = sunLabel(state.sunAngle);
    renderLoop();
  }

  function applyPreset(i) {
    const p = PRESETS[i];
    if (!p) return;
    Object.assign(state, { wallLeft: p.wallLeft, wallRight: p.wallRight, ceiling: p.ceiling, floor: p.floor });
    // Sync colour inputs
    ['wallLeft', 'wallRight', 'ceiling', 'floor'].forEach(k => {
      const inpId = { wallLeft: 'clb-wall-left', wallRight: 'clb-wall-right', ceiling: 'clb-ceiling', floor: 'clb-floor' }[k];
      const inp = document.getElementById(inpId);
      if (inp) inp.value = state[k];
      setColour(k, state[k]);
    });
  }

  function updateApparentColours() {
    const grid = document.getElementById('clb-apparent-grid');
    if (!grid) return;
    const lit = computeLitColours();
    const items = [
      { label: 'Left Wall', hex: lit.lw, base: state.wallLeft },
      { label: 'Right Wall', hex: lit.rw, base: state.wallRight },
      { label: 'Ceiling', hex: lit.ceil, base: state.ceiling },
      { label: 'Floor', hex: lit.fl, base: state.floor },
    ];
    grid.innerHTML = items.map(it => `
      <div class="clb-apparent-item">
        <div class="clb-apparent-swatches">
          <div class="clb-apparent-sw" style="background:${it.base}" title="True colour"></div>
          <span class="clb-apparent-arrow">→</span>
          <div class="clb-apparent-sw" style="background:${it.hex}" title="Under light"></div>
        </div>
        <div class="clb-apparent-label">${it.label}</div>
        <div class="clb-apparent-hex">${it.hex.toUpperCase()}</div>
      </div>`).join('');
  }

  // ── Cleanup (called when leaving the view) ──
  function destroy() {
    if (_raf) cancelAnimationFrame(_raf);
    window.removeEventListener('resize', resizeCanvas);
    _canvas = null; _ctx = null; _rendered = false;
  }

  return {
    renderView,
    init,
    destroy,
    setColour,
    setMode,
    setSunAngle,
    applyPreset,
  };
})();
