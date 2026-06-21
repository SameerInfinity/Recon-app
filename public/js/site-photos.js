/* ═══════════════════════════════════════════════════════════════
   SITE-PHOTOS.JS — Construction site photo log
   - Capture photos from camera (mobile/Android)
   - Upload from gallery (all platforms)
   - Name, describe, categorize each photo
   - Grid view with full-screen preview
   - Synced to cloud via State module
   ═══════════════════════════════════════════════════════════════ */

const SitePhotos = (() => {
  const CATEGORIES = [
    { value: '',          label: 'No Category' },
    { value: 'progress',  label: 'Work Progress' },
    { value: 'issue',     label: 'Issue / Defect' },
    { value: 'material',  label: 'Material Delivery' },
    { value: 'safety',    label: 'Safety' },
    { value: 'inspection',label: 'Inspection' },
    { value: 'reference', label: 'Reference / Plan' },
    { value: 'other',     label: 'Other' },
  ];

  const CATEGORY_COLORS = {
    progress:  { color: '#7B4626', bg: 'rgba(123,70,38,0.10)' },
    issue:     { color: '#A8453D', bg: 'rgba(168,69,61,0.10)' },
    material:  { color: '#6E94B0', bg: 'rgba(110,148,176,0.10)' },
    safety:    { color: '#D4A574', bg: 'rgba(212,165,116,0.10)' },
    inspection:{ color: '#9E7758', bg: 'rgba(158,119,88,0.10)' },
    reference: { color: '#5C8A58', bg: 'rgba(92,138,88,0.10)' },
    other:     { color: 'var(--text-muted)', bg: 'var(--bg-elev-2)' },
  };

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const fmtTime = (s) => s ? new Date(s).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '';
  const fmtDateTime = (s) => s ? `${fmtDate(s)} ${fmtTime(s)}` : '—';

  function _categoryBadge(category) {
    if (!category) return '';
    const c = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
    const label = (CATEGORIES.find(x => x.value === category) || {}).label || category;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:${c.bg};color:${c.color}">${label}</span>`;
  }

  function _isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // ── Image processing helpers ──

  /**
   * Read a File object as a base64 data URL.
   */
  function _readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Compress a base64 data URL image to a smaller thumbnail.
   * Returns a base64 data URL of the compressed image.
   */
  function _compressToThumbnail(dataUrl, maxDim = 200, quality = 0.6) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else       { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);  // Fallback to original
      img.src = dataUrl;
    });
  }

  /**
   * Compress a full-size image to a reasonable size for storage.
   * Max dimension ~1200px, JPEG quality 0.8
   */
  function _compressFullImage(dataUrl, maxDim = 1200, quality = 0.8) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else       { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // ── Hub Rendering ──
  function renderHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '<div class="m-empty"><div class="m-empty-title">No project open</div></div>';

    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const totalPhotos = photos.length;
    const isMobile = _isMobile();

    // Count by category
    const catCounts = {};
    photos.forEach(p => {
      const cat = p.category || 'uncategorized';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    let html = `
      <div class="hub-header" style="margin-bottom:20px">
        <div class="hub-header-left">
          <div>
            <h2 class="hub-title" style="font-size:22px">${Icons.render('camera', 22)} Site Photos</h2>
            <p class="hub-subtitle">Document your construction site visually</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:8px">
            <span class="phase-pct">${totalPhotos} Photo${totalPhotos !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons Row -->
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        ${isMobile ? `
        <label class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer">
          ${Icons.render('camera', 15)} Take Photo
          <input type="file" accept="image/*" capture="environment" style="display:none" onchange="SitePhotos.handlePhotoCapture(event)">
        </label>` : ''}
        <label class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer;${isMobile ? '' : 'width:100%'}">
          ${Icons.render('image', 15)} Upload Photo
          <input type="file" accept="image/*" style="display:none" onchange="SitePhotos.handlePhotoCapture(event)">
        </label>
      </div>`;

    if (totalPhotos === 0) {
      html += `
        <div style="padding:60px 32px;text-align:center;border:1px dashed var(--charcoal-border);border-radius:12px;background:var(--charcoal-mid)">
          <div style="margin-bottom:12px;color:var(--text-muted)">${Icons.render('camera', 48)}</div>
          <h3 style="color:var(--text-secondary);font-size:16px;font-weight:700;margin-bottom:8px">No Site Photos Yet</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;max-width:300px;margin-left:auto;margin-right:auto">
            Capture progress, issues, and deliveries on your construction site.
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            ${isMobile ? `
            <label class="btn btn-primary" style="cursor:pointer">
              ${Icons.render('camera', 14)} Take Photo
              <input type="file" accept="image/*" capture="environment" style="display:none" onchange="SitePhotos.handlePhotoCapture(event)">
            </label>` : ''}
            <label class="btn btn-primary" style="cursor:pointer">
              ${Icons.render('image', 14)} Upload Photo
              <input type="file" accept="image/*" style="display:none" onchange="SitePhotos.handlePhotoCapture(event)">
            </label>
          </div>
        </div>`;
    } else {
      // Category filter chips
      const uniqueCats = [...new Set(photos.map(p => p.category || 'uncategorized'))].filter(Boolean);
      if (uniqueCats.length > 1) {
        html += `<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
          <button onclick="SitePhotos._filterCategory('')" style="padding:4px 12px;border-radius:16px;font-size:11px;font-weight:700;border:1px solid var(--charcoal-border);background:var(--amber);color:#fff;cursor:pointer;font-family:inherit" data-filter-cat="">All</button>`;
        uniqueCats.forEach(cat => {
          const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
          const label = (CATEGORIES.find(x => x.value === cat) || {}).label || cat;
          html += `<button onclick="SitePhotos._filterCategory('${cat}')" style="padding:4px 12px;border-radius:16px;font-size:11px;font-weight:700;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit" data-filter-cat="${cat}">${label} (${catCounts[cat] || 0})</button>`;
        });
        html += `</div>`;
      }

      // Photo grid
      html += `<div id="site-photos-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">`;
      photos.forEach(photo => {
        html += _renderPhotoCard(photo);
      });
      html += `</div>`;
    }

    html += `<div style="height:80px"></div>`;
    return html;
  }

  function _renderPhotoCard(photo) {
    const thumbSrc = _resolveImageUrl(photo.thumbnail || photo.imageUrl);
    const catBadge = _categoryBadge(photo.category);
    const name = photo.name || 'Untitled';

    return `
      <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;overflow:hidden;cursor:pointer;transition:all .15s"
           onclick="App.showSitePhotoDetail('${escapeAttr(photo.id)}')"
           onmouseover="this.style.borderColor='var(--amber-muted)';this.style.boxShadow='0 4px 20px rgba(0,0,0,.3)'"
           onmouseout="this.style.borderColor='var(--charcoal-border)';this.style.boxShadow=''">
        <div style="position:relative;padding-top:75%;background:var(--bg-elev-2);overflow:hidden">
          ${thumbSrc
            ? `<img src="${thumbSrc}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
               <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:var(--text-muted)">${Icons.render('image', 32)}</div>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">${Icons.render('image', 32)}</div>`}
          <button onclick="event.stopPropagation();SitePhotos.confirmDeletePhoto('${escapeAttr(photo.id)}','${escapeAttr(name)}')" title="Delete" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;opacity:0;transition:opacity .15s"
                  onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"
                  class="photo-delete-btn">${Icons.render('trash', 12)}</button>
        </div>
        <div style="padding:8px 10px">
          <div style="font-weight:600;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(name)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
            ${catBadge || '<span></span>'}
            <span style="font-size:10px;color:var(--text-faint)">${fmtDate(photo.takenAt || photo.createdAt)}</span>
          </div>
        </div>
      </div>`;
  }

  /**
   * Resolve a photo URL — handles local-image:// references
   * by loading from IndexedDB via State.getLocalImage().
   */
  function _resolveImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('local-image://')) {
      return State.getLocalImage(url);
    }
    return url;
  }

  // ── Photo capture / upload handler ──
  async function handlePhotoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected
    event.target.value = '';

    // Show a loading toast
    App.toast('Processing photo...', 'info');

    try {
      // Read the file
      const dataUrl = await _readFileAsDataURL(file);

      // Compress: full image + thumbnail
      const [fullImage, thumbnail] = await Promise.all([
        _compressFullImage(dataUrl),
        _compressToThumbnail(dataUrl),
      ]);

      // Store images in IndexedDB via State
      const photoKey = 'sitephoto_' + Date.now();
      const thumbKey = 'sitephoto_thumb_' + Date.now();

      await Promise.all([
        State.saveLocalImage(photoKey, fullImage),
        State.saveLocalImage(thumbKey, thumbnail),
      ]);

      const imageUrl = 'local-image://' + photoKey;
      const thumbnailUrl = 'local-image://' + thumbKey;

      // Pre-populate InMemoryImages so they resolve immediately
      // (saveLocalImage already does this, but let's be safe)

      // Show the Add Photo modal with pre-filled data
      showAddPhotoModal(imageUrl, thumbnailUrl);

    } catch (e) {
      console.error('[SitePhotos] Photo capture error:', e);
      App.toast('Failed to process photo. Please try again.', 'error');
    }
  }

  // ── Add Photo Modal ──
  function showAddPhotoModal(imageUrl, thumbnailUrl, editId) {
    const isEdit = !!editId;
    let photo = { imageUrl, thumbnailUrl };
    if (isEdit) {
      const photos = State.getSitePhotos ? State.getSitePhotos() : [];
      photo = photos.find(p => String(p.id) === String(editId)) || {};
    }

    const previewSrc = _resolveImageUrl(photo.thumbnail || photo.imageUrl);
    const categoryOptions = CATEGORIES.map(c =>
      `<option value="${c.value}" ${photo.category === c.value ? 'selected' : ''}>${c.label}</option>`
    ).join('');

    App.showModal(`
      <h3 class="modal-title">${Icons.render('camera', 16)} ${isEdit ? 'Edit Photo Details' : 'Save Site Photo'}</h3>
      ${previewSrc ? `
      <div style="margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid var(--charcoal-border);max-height:200px;display:flex;align-items:center;justify-content:center;background:var(--bg-elev-2)">
        <img src="${previewSrc}" style="max-width:100%;max-height:200px;object-fit:contain" alt="Preview">
      </div>` : ''}
      <div style="margin-bottom:12px">
        <label class="fs-label">Photo Name *</label>
        <input id="sp-name" class="fs-inp" placeholder="e.g. Foundation work - Day 5" value="${escapeAttr(photo.name || '')}">
      </div>
      <div style="margin-bottom:12px">
        <label class="fs-label">Description</label>
        <textarea id="sp-description" class="fs-inp" rows="2" placeholder="What's happening in this photo? (optional)" style="resize:vertical">${escapeHtml(photo.description || '')}</textarea>
      </div>
      <div style="margin-bottom:12px">
        <label class="fs-label">Category</label>
        <select id="sp-category" class="fs-inp" style="appearance:auto">
          ${categoryOptions}
        </select>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:none;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>
        <button onclick="SitePhotos.savePhoto(${isEdit ? `'${escapeAttr(editId)}'` : 'null'},'${escapeAttr(photo.imageUrl || '')}','${escapeAttr(photo.thumbnailUrl || '')}')" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:8px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">${isEdit ? 'Update' : 'Save Photo'}</button>
      </div>
    `);
  }

  // ── Save Photo ──
  async function savePhoto(editId, imageUrl, thumbnailUrl) {
    const name = document.getElementById('sp-name')?.value?.trim();
    if (!name) { App.toast('Photo name is required', 'warning'); return; }

    const data = {
      name,
      description: document.getElementById('sp-description')?.value?.trim() || '',
      category: document.getElementById('sp-category')?.value || '',
      imageUrl: imageUrl || '',
      thumbnailUrl: thumbnailUrl || '',
    };

    if (editId) {
      await State.updateSitePhoto(editId, data);
      App.closeModal();
      App.toast('Photo updated', 'success');
      App.showSitePhotos();
    } else {
      await State.addSitePhoto(data);
      App.closeModal();
      App.toast('Photo saved', 'success');
      App.showSitePhotos();
    }
  }

  // ── Photo Detail / Full-screen preview ──
  function renderPhotoDetail(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) return '<div class="m-empty">Photo not found</div>';

    const fullSrc = _resolveImageUrl(photo.imageUrl || photo.thumbnail);
    const catBadge = _categoryBadge(photo.category);

    return `
      <div style="max-width:640px;margin:0 auto">
        <!-- Full-size Image -->
        ${fullSrc ? `
        <div style="border-radius:12px;overflow:hidden;border:1px solid var(--charcoal-border);margin-bottom:16px;background:var(--bg-elev-2)">
          <img src="${fullSrc}" style="width:100%;display:block;cursor:zoom-in" onclick="SitePhotos._showFullscreen('${escapeAttr(photoId)}')" alt="${escapeAttr(photo.name)}">
        </div>` : ''}

        <!-- Info Card -->
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="min-width:0;flex:1">
              <h3 style="font-size:18px;font-weight:800;color:var(--text);margin:0 0 6px">${escapeHtml(photo.name || 'Untitled')}</h3>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                ${catBadge}
                <span style="font-size:11px;color:var(--text-muted)">${fmtDateTime(photo.takenAt || photo.createdAt)}</span>
              </div>
            </div>
          </div>
          ${photo.description ? `
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--charcoal-border)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:6px">Description</div>
            <div style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.5">${escapeHtml(photo.description)}</div>
          </div>` : ''}
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:10px;margin-top:16px">
          <button onclick="SitePhotos.showEditPhotoModal('${escapeAttr(photo.id)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('pencil', 14)} Edit</button>
          <button onclick="SitePhotos.confirmDeletePhoto('${escapeAttr(photo.id)}','${escapeAttr(photo.name)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(199,121,102,0.3);background:rgba(199,121,102,0.08);color:var(--danger);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('trash', 14)} Delete</button>
        </div>
      </div>
      <div style="height:80px"></div>`;
  }

  // ── Fullscreen overlay ──
  function _showFullscreen(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) return;

    const fullSrc = _resolveImageUrl(photo.imageUrl || photo.thumbnail);
    if (!fullSrc) return;

    const overlay = document.createElement('div');
    overlay.id = 'photo-fullscreen-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:fadeIn .15s ease';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${fullSrc}" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px">`;
    document.body.appendChild(overlay);
  }

  // ── Edit ──
  function showEditPhotoModal(id) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(id));
    if (!photo) return;
    showAddPhotoModal(photo.imageUrl, photo.thumbnail, id);
  }

  // ── Delete ──
  function confirmDeletePhoto(id, name) {
    App.showConfirmModal({
      icon: Icons.render('camera', 24),
      title: `Delete "${escapeHtml(name || 'Untitled')}"?`,
      body: 'This photo will be permanently removed.',
      confirmLabel: 'Delete Photo',
      onConfirm: async () => {
        await State.deleteSitePhoto(id);
        App.toast('Photo deleted', 'info');
        // If we're on the detail view, go back to hub
        const overlay = document.getElementById('photo-fullscreen-overlay');
        if (overlay) overlay.remove();
        App.showSitePhotos();
      }
    });
  }

  // ── Category filter ──
  function _filterCategory(category) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const grid = document.getElementById('site-photos-grid');
    if (!grid) return;

    // Update chip styling
    document.querySelectorAll('[data-filter-cat]').forEach(btn => {
      const isActive = btn.dataset.filterCat === category;
      btn.style.background = isActive ? 'var(--amber)' : 'var(--bg-elev-2)';
      btn.style.color = isActive ? '#fff' : 'var(--text-secondary)';
    });

    // Filter cards
    const filtered = category ? photos.filter(p => p.category === category) : photos;
    grid.innerHTML = filtered.map(photo => _renderPhotoCard(photo)).join('');
  }

  return {
    renderHub,
    renderPhotoDetail,
    handlePhotoCapture,
    showAddPhotoModal,
    showEditPhotoModal,
    savePhoto,
    confirmDeletePhoto,
    _showFullscreen,
    _filterCategory,
  };
})();
