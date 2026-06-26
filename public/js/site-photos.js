/* ═══════════════════════════════════════════════════════════════
   SITE-PHOTOS.JS — Construction site photo / video log
   - Capture photos & videos from camera (mobile/Android)
   - Upload from gallery (all platforms) — image OR video
   - Name, describe, categorize each media
   - Grid view with full-screen preview (image or video player)
   - Share any media via Web Share API (files) — falls back to download
   - Synced to cloud via State module (bytes live in IndexedDB locally)
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

  // 25 MB hard cap on a single video to avoid blowing IndexedDB quotas
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

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

  function _isVideo(photo) {
    return !!(photo && (photo.videoUrl || (photo.imageUrl && photo.imageUrl.startsWith('local-video://'))));
  }

  // ── Image processing helpers ──

  function _readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

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
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

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

  /**
   * Capture a single video frame as a JPEG thumbnail data URL.
   * Uses an offscreen <video> element + canvas. Falls back to '' on any error.
   */
  function _captureVideoThumbnail(videoDataUrl) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.onloadeddata = () => {
        try {
          // Seek slightly past 0 to avoid black first-frame on some codecs
          v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
        } catch (_) { /* ignore */ }
      };
      v.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 200;
          let w = v.videoWidth || 320, h = v.videoHeight || 240;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else       { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(v, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          resolve('');
        }
      };
      v.onerror = () => resolve('');
      v.src = videoDataUrl;
    });
  }

  // ── Hub Rendering ──
  function renderHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '<div class="m-empty"><div class="m-empty-title">No project open</div></div>';

    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const totalPhotos = photos.length;
    const isMobile = _isMobile();
    const videoCount = photos.filter(_isVideo).length;

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
            <h2 class="hub-title" style="font-size:22px">${Icons.render('camera', 22)} Site Photos & Videos</h2>
            <p class="hub-subtitle">Document your construction site visually</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:8px">
            <span class="phase-pct">${totalPhotos} Item${totalPhotos !== 1 ? 's' : ''}${videoCount ? ` · ${videoCount} video${videoCount !== 1 ? 's' : ''}` : ''}</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons Row -->
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        ${isMobile ? `
        <label class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer">
          ${Icons.render('camera', 15)} Take Photo
          <input type="file" accept="image/*" capture="environment" style="display:none" onchange="SitePhotos.handleMediaCapture(event)">
        </label>
        <label class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer">
          ${Icons.render('video', 15)} Take Video
          <input type="file" accept="video/*" capture="environment" style="display:none" onchange="SitePhotos.handleMediaCapture(event)">
        </label>` : ''}
        <label class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer;${isMobile ? '' : 'width:100%'}">
          ${Icons.render('image', 15)} Upload Photo / Video
          <input type="file" accept="image/*,video/*" style="display:none" onchange="SitePhotos.handleMediaCapture(event)">
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
              <input type="file" accept="image/*" capture="environment" style="display:none" onchange="SitePhotos.handleMediaCapture(event)">
            </label>
            <label class="btn btn-secondary" style="cursor:pointer">
              ${Icons.render('video', 14)} Take Video
              <input type="file" accept="video/*" capture="environment" style="display:none" onchange="SitePhotos.handleMediaCapture(event)">
            </label>` : ''}
            <label class="btn btn-primary" style="cursor:pointer">
              ${Icons.render('image', 14)} Upload Photo / Video
              <input type="file" accept="image/*,video/*" style="display:none" onchange="SitePhotos.handleMediaCapture(event)">
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
    const isVideo = _isVideo(photo);
    const thumbSrc = _resolveImageUrl(photo.thumbnail || (isVideo ? '' : photo.imageUrl));
    const catBadge = _categoryBadge(photo.category);
    const name = photo.name || 'Untitled';

    // The thumbnail area: if there's a thumbnail image, use it; otherwise show a video-icon placeholder.
    const thumbHtml = thumbSrc
      ? `<img src="${thumbSrc}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:var(--text-muted)">${Icons.render(isVideo ? 'video' : 'image', 32)}</div>`
      : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">${Icons.render(isVideo ? 'video' : 'image', 32)}</div>`;

    // Video badge overlay (play button) — sits on top of the thumbnail.
    const videoBadgeHtml = isVideo
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
           <div style="width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;color:#fff">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
           </div>
         </div>`
      : '';

    return `
      <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;overflow:hidden;cursor:pointer;transition:all .15s"
           onclick="App.showSitePhotoDetail('${escapeAttr(photo.id)}')"
           onmouseover="this.style.borderColor='var(--amber-muted)';this.style.boxShadow='0 4px 20px rgba(0,0,0,.3)'"
           onmouseout="this.style.borderColor='var(--charcoal-border)';this.style.boxShadow=''">
        <div style="position:relative;padding-top:75%;background:var(--bg-elev-2);overflow:hidden">
          ${thumbHtml}
          ${videoBadgeHtml}
          <div style="position:absolute;top:6px;right:6px;display:flex;gap:4px">
            <button onclick="event.stopPropagation();SitePhotos.shareMedia('${escapeAttr(photo.id)}')" title="Share" style="background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;opacity:0;transition:opacity .15s"
                    onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"
                    class="photo-share-btn">${Icons.render('share', 12)}</button>
            <button onclick="event.stopPropagation();SitePhotos.confirmDeletePhoto('${escapeAttr(photo.id)}','${escapeAttr(name)}')" title="Delete" style="background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;opacity:0;transition:opacity .15s"
                    onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"
                    class="photo-delete-btn">${Icons.render('trash', 12)}</button>
          </div>
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
   * Resolve a photo URL — handles local-image:// and local-video:// references
   * by loading from IndexedDB via State.getLocalImage().
   */
  function _resolveImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('local-image://') || url.startsWith('local-video://')) {
      return State.getLocalImage(url);
    }
    return url;
  }

  // ── Media capture / upload handler (image OR video) ──
  async function handleMediaCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const isVideo = file.type.startsWith('video/');

    App.toast(isVideo ? 'Processing video…' : 'Processing photo…', 'info');

    try {
      // Enforce size cap on videos to avoid blowing IndexedDB quota
      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        App.toast(`Video is too large (${(file.size/1024/1024).toFixed(1)} MB). Max ${MAX_VIDEO_BYTES/1024/1024} MB.`, 'error');
        return;
      }

      const dataUrl = await _readFileAsDataURL(file);

      if (isVideo) {
        // Store raw video data URL in IndexedDB + generate a thumbnail from the first frame.
        const videoKey = 'sitevideo_' + Date.now();
        const thumbKey = 'sitevideo_thumb_' + Date.now();
        const thumbDataUrl = await _captureVideoThumbnail(dataUrl);

        await State.saveLocalImage(videoKey, dataUrl);
        if (thumbDataUrl) await State.saveLocalImage(thumbKey, thumbDataUrl);

        const videoUrl = 'local-video://' + videoKey;
        const thumbnailUrl = thumbDataUrl ? 'local-image://' + thumbKey : '';

        showAddPhotoModal('', thumbnailUrl, null, videoUrl);
      } else {
        // Existing image pipeline: compress to full + thumbnail.
        const [fullImage, thumbnail] = await Promise.all([
          _compressFullImage(dataUrl),
          _compressToThumbnail(dataUrl),
        ]);

        const photoKey = 'sitephoto_' + Date.now();
        const thumbKey = 'sitephoto_thumb_' + Date.now();

        await Promise.all([
          State.saveLocalImage(photoKey, fullImage),
          State.saveLocalImage(thumbKey, thumbnail),
        ]);

        const imageUrl = 'local-image://' + photoKey;
        const thumbnailUrl = 'local-image://' + thumbKey;

        showAddPhotoModal(imageUrl, thumbnailUrl);
      }
    } catch (e) {
      console.error('[SitePhotos] Media capture error:', e);
      App.toast('Failed to process media. Please try again.', 'error');
    }
  }

  // ── Add Photo Modal (works for image AND video) ──
  function showAddPhotoModal(imageUrl, thumbnailUrl, editId, videoUrl) {
    const isEdit = !!editId;
    let photo = { imageUrl, thumbnailUrl, videoUrl };
    if (isEdit) {
      const photos = State.getSitePhotos ? State.getSitePhotos() : [];
      photo = photos.find(p => String(p.id) === String(editId)) || {};
    }

    const isVideo = _isVideo(photo);
    const previewSrc = _resolveImageUrl(photo.thumbnail || (isVideo ? '' : photo.imageUrl));
    const videoSrc   = isVideo ? _resolveImageUrl(photo.videoUrl) : '';
    const categoryOptions = CATEGORIES.map(c =>
      `<option value="${c.value}" ${photo.category === c.value ? 'selected' : ''}>${c.label}</option>`
    ).join('');

    const previewHtml = isVideo
      ? (videoSrc ? `
        <div style="margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid var(--charcoal-border);background:var(--bg-elev-2)">
          <video src="${videoSrc}" controls style="max-width:100%;max-height:240px;object-fit:contain;display:block;margin:0 auto" preload="metadata"></video>
        </div>` : '')
      : (previewSrc ? `
        <div style="margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid var(--charcoal-border);max-height:200px;display:flex;align-items:center;justify-content:center;background:var(--bg-elev-2)">
          <img src="${previewSrc}" style="max-width:100%;max-height:200px;object-fit:contain" alt="Preview">
        </div>` : '');

    App.showModal(`
      <h3 class="modal-title">${Icons.render(isVideo ? 'video' : 'camera', 16)} ${isEdit ? 'Edit Details' : (isVideo ? 'Save Site Video' : 'Save Site Photo')}</h3>
      ${previewHtml}
      <div style="margin-bottom:12px">
        <label class="fs-label">${isVideo ? 'Video' : 'Photo'} Name *</label>
        <input id="sp-name" class="fs-inp" placeholder="e.g. Foundation work - Day 5" value="${escapeAttr(photo.name || '')}">
      </div>
      <div style="margin-bottom:12px">
        <label class="fs-label">Description</label>
        <textarea id="sp-description" class="fs-inp" rows="2" placeholder="What's happening in this ${isVideo ? 'video' : 'photo'}? (optional)" style="resize:vertical">${escapeHtml(photo.description || '')}</textarea>
      </div>
      <div style="margin-bottom:12px">
        <label class="fs-label">Category</label>
        <select id="sp-category" class="fs-inp" style="appearance:auto">
          ${categoryOptions}
        </select>
      </div>
      <div style="display:flex;gap:12px">
        <button onclick="App.closeModal()" class="modal-btn-cancel" style="flex:1;padding:11px;border-radius:8px;border:1px solid var(--charcoal-border);background:none;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600">Cancel</button>
        <button onclick="SitePhotos.savePhoto(${isEdit ? `'${escapeAttr(editId)}'` : 'null'},'${escapeAttr(photo.imageUrl || '')}','${escapeAttr(photo.thumbnailUrl || '')}','${escapeAttr(photo.videoUrl || '')}')" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:8px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">${isEdit ? 'Update' : (isVideo ? 'Save Video' : 'Save Photo')}</button>
      </div>
    `);
  }

  // ── Save Photo ──
  async function savePhoto(editId, imageUrl, thumbnailUrl, videoUrl) {
    const name = document.getElementById('sp-name')?.value?.trim();
    if (!name) { App.toast('Name is required', 'warning'); return; }

    const data = {
      name,
      description: document.getElementById('sp-description')?.value?.trim() || '',
      category: document.getElementById('sp-category')?.value || '',
      imageUrl: imageUrl || '',
      thumbnailUrl: thumbnailUrl || '',
      videoUrl: videoUrl || '',
    };

    if (editId) {
      await State.updateSitePhoto(editId, data);
      App.closeModal();
      App.toast('Updated', 'success');
      App.showSitePhotos();
    } else {
      await State.addSitePhoto(data);
      App.closeModal();
      App.toast('Saved', 'success');
      App.showSitePhotos();
    }
  }

  // ── Photo Detail / Full-screen preview ──
  function renderPhotoDetail(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) return '<div class="m-empty">Photo not found</div>';

    const isVideo = _isVideo(photo);
    const fullSrc = _resolveImageUrl(isVideo ? photo.videoUrl : (photo.imageUrl || photo.thumbnail));
    const catBadge = _categoryBadge(photo.category);

    const mediaHtml = isVideo
      ? (fullSrc ? `
        <div style="border-radius:12px;overflow:hidden;border:1px solid var(--charcoal-border);margin-bottom:16px;background:#000">
          <video src="${fullSrc}" controls playsinline style="width:100%;display:block;max-height:70vh" preload="metadata"></video>
        </div>` : '')
      : (fullSrc ? `
        <div style="border-radius:12px;overflow:hidden;border:1px solid var(--charcoal-border);margin-bottom:16px;background:var(--bg-elev-2)">
          <img src="${fullSrc}" style="width:100%;display:block;cursor:zoom-in" onclick="SitePhotos._showFullscreen('${escapeAttr(photoId)}')" alt="${escapeAttr(photo.name)}">
        </div>` : '');

    return `
      <div style="max-width:640px;margin:0 auto">
        ${mediaHtml}

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
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button onclick="SitePhotos.shareMedia('${escapeAttr(photo.id)}')" style="flex:1;min-width:120px;padding:12px;border-radius:10px;border:1px solid var(--amber-border);background:var(--amber-light-bg);color:var(--amber);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('share', 14)} Share</button>
          <button onclick="SitePhotos.showEditPhotoModal('${escapeAttr(photo.id)}')" style="flex:1;min-width:120px;padding:12px;border-radius:10px;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('pencil', 14)} Edit</button>
          <button onclick="SitePhotos.confirmDeletePhoto('${escapeAttr(photo.id)}','${escapeAttr(photo.name)}')" style="flex:1;min-width:120px;padding:12px;border-radius:10px;border:1px solid rgba(199,121,102,0.3);background:rgba(199,121,102,0.08);color:var(--danger);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('trash', 14)} Delete</button>
        </div>
      </div>
      <div style="height:80px"></div>`;
  }

  // ── Fullscreen overlay (image OR video) ──
  function _showFullscreen(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) return;

    const isVideo = _isVideo(photo);
    const fullSrc = _resolveImageUrl(isVideo ? photo.videoUrl : (photo.imageUrl || photo.thumbnail));
    if (!fullSrc) return;

    const overlay = document.createElement('div');
    overlay.id = 'photo-fullscreen-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:fadeIn .15s ease';
    if (!isVideo) overlay.onclick = () => overlay.remove();
    overlay.innerHTML = isVideo
      ? `<video src="${fullSrc}" controls playsinline autoplay style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px;cursor:default"></video>`
      : `<img src="${fullSrc}" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px">`;
    document.body.appendChild(overlay);
  }

  // ── Share media (Web Share API with files; fallback to download / copy URL) ──
  async function shareMedia(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) { App.toast('Item not found', 'error'); return; }

    const isVideo = _isVideo(photo);
    const dataUrl = _resolveImageUrl(isVideo ? photo.videoUrl : (photo.imageUrl || photo.thumbnail));
    if (!dataUrl) { App.toast('Media not available locally', 'error'); return; }

    const shareTitle = photo.name || (isVideo ? 'Site video' : 'Site photo');
    const shareText  = photo.description ? `${shareTitle}\n\n${photo.description}` : shareTitle;

    // Convert data URL → Blob → File
    let blob;
    try {
      const resp = await fetch(dataUrl);
      blob = await resp.blob();
    } catch (e) {
      console.error('[SitePhotos] Failed to decode media for share:', e);
      App.toast('Could not prepare media for sharing', 'error');
      return;
    }

    const ext = isVideo ? 'mp4' : 'jpg';
    const mime = isVideo ? (blob.type || 'video/mp4') : (blob.type || 'image/jpeg');
    const file = new File([blob], `${shareTitle.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 40) || 'site-media'}.${ext}`, { type: mime });

    // Preferred path: Web Share API with files (mobile browsers, Capacitor Web Share plugin).
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: shareTitle, text: shareText });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user cancelled
        console.warn('[SitePhotos] navigator.share failed, falling back', e);
      }
    }

    // Fallback 1: download the file directly.
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      App.toast('Saved to device (sharing not supported here)', 'info');
    } catch (e) {
      App.toast('Sharing not supported on this device', 'error');
    }
  }

  // ── Edit ──
  function showEditPhotoModal(id) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(id));
    if (!photo) return;
    showAddPhotoModal(photo.imageUrl, photo.thumbnail, id, photo.videoUrl);
  }

  // ── Delete ──
  function confirmDeletePhoto(id, name) {
    App.showConfirmModal({
      icon: Icons.render('camera', 24),
      title: `Delete "${escapeHtml(name || 'Untitled')}"?`,
      body: 'This item will be permanently removed.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        // Best-effort cleanup of IndexedDB bytes
        try {
          const photos = State.getSitePhotos ? State.getSitePhotos() : [];
          const p = photos.find(x => String(x.id) === String(id));
          if (p) {
            [p.imageUrl, p.thumbnail, p.videoUrl].forEach(u => {
              if (u && (u.startsWith('local-image://') || u.startsWith('local-video://'))) {
                State.deleteLocalImage && State.deleteLocalImage(u);
              }
            });
          }
        } catch (_) { /* ignore */ }
        await State.deleteSitePhoto(id);
        App.toast('Deleted', 'info');
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

    document.querySelectorAll('[data-filter-cat]').forEach(btn => {
      const isActive = btn.dataset.filterCat === category;
      btn.style.background = isActive ? 'var(--amber)' : 'var(--bg-elev-2)';
      btn.style.color = isActive ? '#fff' : 'var(--text-secondary)';
    });

    const filtered = category ? photos.filter(p => p.category === category) : photos;
    grid.innerHTML = filtered.map(photo => _renderPhotoCard(photo)).join('');
  }

  return {
    renderHub,
    renderPhotoDetail,
    handlePhotoCapture: handleMediaCapture,   // keep old name as alias
    handleMediaCapture,
    showAddPhotoModal,
    showEditPhotoModal,
    savePhoto,
    shareMedia,
    confirmDeletePhoto,
    _showFullscreen,
    _filterCategory,
  };
})();
