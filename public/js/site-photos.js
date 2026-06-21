/* ═══════════════════════════════════════════════════════════════
   SITE-PHOTOS.JS — Construction site photo & video log
   Change #7: Video input + share option
   - Capture photos/videos from camera (mobile/Android)
   - Upload from gallery (all platforms)
   - Name, describe, categorize each media
   - Grid view with full-screen preview
   - Video support with play icon overlay
   - Share via Web Share API with download fallback
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

  // ── Share helper (Change #7) ────────────────────────────
  async function _shareMedia(photo) {
    const isVideo = photo.mediaType === 'video';
    const url = _resolveImageUrl(photo.imageUrl);
    if (!url) { App.toast('No media to share', 'error'); return; }

    // Try Web Share API first
    if (navigator.share) {
      try {
        // Try to share with file if possible
        if (navigator.canShare && url.startsWith('data:')) {
          const blob = _dataURLtoBlob(url);
          const ext = isVideo ? 'mp4' : 'jpg';
          const mime = isVideo ? 'video/mp4' : 'image/jpeg';
          const file = new File([blob], `${photo.name || 'site-media'}.${ext}`, { type: mime });
          const shareData = { files: [file], title: photo.name || 'Site Media' };
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return;
          }
        }
        // Fallback to URL share
        await navigator.share({
          title: photo.name || 'Site Media',
          text: photo.description || '',
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled
        // Fall through to download fallback
      }
    }

    // Fallback: download the file
    _downloadMedia(photo);
  }

  function _downloadMedia(photo) {
    const url = _resolveImageUrl(photo.imageUrl);
    if (!url) return;
    const isVideo = photo.mediaType === 'video';
    const ext = isVideo ? 'mp4' : 'jpg';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${photo.name || 'site-media'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    App.toast('Download started', 'success');
  }

  function _dataURLtoBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const b64 = atob(parts[1]);
    const arr = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ── Hub Rendering ──
  function renderHub() {
    const proj = State.getCurrentProject();
    if (!proj) return '<div class="m-empty"><div class="m-empty-title">No project open</div></div>';

    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const totalPhotos = photos.length;
    const videoCount = photos.filter(p => p.mediaType === 'video').length;
    const photoCount = totalPhotos - videoCount;
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
            <h2 class="hub-title" style="font-size:22px">${Icons.render('camera', 22)} Site Photos & Videos</h2>
            <p class="hub-subtitle">Document your construction site visually</p>
          </div>
        </div>
        <div class="hub-header-right">
          <div class="phase-chip" style="margin-right:8px">
            <span class="phase-pct">${totalPhotos} Item${totalPhotos !== 1 ? 's' : ''}</span>
          </div>
          ${photoCount > 0 ? `<div class="phase-chip" style="margin-right:8px"><span class="phase-pct">📷 ${photoCount}</span></div>` : ''}
          ${videoCount > 0 ? `<div class="phase-chip" style="margin-right:8px"><span class="phase-pct">🎬 ${videoCount}</span></div>` : ''}
        </div>
      </div>

      <!-- Action Buttons Row (Change #7: video support) -->
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
        ${isMobile ? `
        <label class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer">
          🎬 Record Video
          <input type="file" accept="video/*" capture="environment" style="display:none" onchange="SitePhotos.handleVideoCapture(event)">
        </label>` : ''}
        <label class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;cursor:pointer">
          🎬 Upload Video
          <input type="file" accept="video/*" style="display:none" onchange="SitePhotos.handleVideoCapture(event)">
        </label>
      </div>`;

    if (totalPhotos === 0) {
      html += `
        <div style="padding:60px 32px;text-align:center;border:1px dashed var(--charcoal-border);border-radius:12px;background:var(--charcoal-mid)">
          <div style="margin-bottom:12px;color:var(--text-muted)">${Icons.render('camera', 48)}</div>
          <h3 style="color:var(--text-secondary);font-size:16px;font-weight:700;margin-bottom:8px">No Site Photos or Videos Yet</h3>
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
            ${isMobile ? `
            <label class="btn btn-secondary" style="cursor:pointer">
              🎬 Record Video
              <input type="file" accept="video/*" capture="environment" style="display:none" onchange="SitePhotos.handleVideoCapture(event)">
            </label>` : ''}
            <label class="btn btn-secondary" style="cursor:pointer">
              🎬 Upload Video
              <input type="file" accept="video/*" style="display:none" onchange="SitePhotos.handleVideoCapture(event)">
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

      // Photo/video grid
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
    const isVideo = photo.mediaType === 'video';
    const thumbSrc = isVideo ? _resolveImageUrl(photo.thumbnail || '') : _resolveImageUrl(photo.thumbnail || photo.imageUrl);
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
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">${isVideo ? '🎬' : Icons.render('image', 32)}</div>`}
          ${isVideo ? `
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
            <div style="width:40px;height:40px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white" stroke="none"><polygon points="8 5 20 12 8 19"/></svg>
            </div>
          </div>` : ''}
          <button onclick="event.stopPropagation();SitePhotos.confirmDeletePhoto('${escapeAttr(photo.id)}','${escapeAttr(name)}')" title="Delete" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;opacity:0;transition:opacity .15s"
                  onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"
                  class="photo-delete-btn">${Icons.render('trash', 12)}</button>
        </div>
        <div style="padding:8px 10px">
          <div style="font-weight:600;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isVideo ? '🎬 ' : ''}${escapeHtml(name)}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
            ${catBadge || '<span></span>'}
            <span style="font-size:10px;color:var(--text-faint)">${fmtDate(photo.takenAt || photo.createdAt)}</span>
          </div>
        </div>
      </div>`;
  }

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
    event.target.value = '';

    App.toast('Processing photo...', 'info');

    try {
      const dataUrl = await _readFileAsDataURL(file);
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

      showAddPhotoModal(imageUrl, thumbnailUrl, null, 'photo');

    } catch (e) {
      console.error('[SitePhotos] Photo capture error:', e);
      App.toast('Failed to process photo. Please try again.', 'error');
    }
  }

  // ── Video capture / upload handler (Change #7) ──────────
  async function handleVideoCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    App.toast('Processing video...', 'info');

    try {
      const dataUrl = await _readFileAsDataURL(file);

      const videoKey = 'sitevideo_' + Date.now();
      const thumbKey = 'sitevideo_thumb_' + Date.now();

      // Store the video data URL directly in IndexedDB
      await State.saveLocalImage(videoKey, dataUrl);

      // Generate a video thumbnail by capturing a frame
      let thumbnailUrl = '';
      try {
        const thumbDataUrl = await _captureVideoThumbnail(dataUrl);
        await State.saveLocalImage(thumbKey, thumbDataUrl);
        thumbnailUrl = 'local-image://' + thumbKey;
      } catch (thumbErr) {
        console.warn('[SitePhotos] Could not generate video thumbnail:', thumbErr);
      }

      const imageUrl = 'local-image://' + videoKey;
      showAddPhotoModal(imageUrl, thumbnailUrl, null, 'video');

    } catch (e) {
      console.error('[SitePhotos] Video capture error:', e);
      App.toast('Failed to process video. Please try again.', 'error');
    }
  }

  // Capture a thumbnail from a video data URL
  function _captureVideoThumbnail(videoDataUrl, timeSec = 1) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        video.currentTime = Math.min(timeSec, video.duration || 1);
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.6);
          resolve(thumb);
        } catch (err) {
          reject(err);
        }
      };
      video.onerror = () => reject(new Error('Failed to load video for thumbnail'));
      video.src = videoDataUrl;
    });
  }

  // ── Add Photo Modal (Change #7: mediaType) ──
  function showAddPhotoModal(imageUrl, thumbnailUrl, editId, mediaType) {
    const isEdit = !!editId;
    let photo = { imageUrl, thumbnailUrl, mediaType: mediaType || 'photo' };
    if (isEdit) {
      const photos = State.getSitePhotos ? State.getSitePhotos() : [];
      photo = photos.find(p => String(p.id) === String(editId)) || {};
    }

    const isVideo = (photo.mediaType || mediaType) === 'video';
    const previewSrc = _resolveImageUrl(photo.thumbnail || photo.imageUrl);
    const categoryOptions = CATEGORIES.map(c =>
      `<option value="${c.value}" ${photo.category === c.value ? 'selected' : ''}>${c.label}</option>`
    ).join('');

    App.showModal(`
      <h3 class="modal-title">${isVideo ? '🎬' : Icons.render('camera', 16)} ${isEdit ? 'Edit' : 'Save'} ${isVideo ? 'Video' : 'Photo'} Details</h3>
      ${previewSrc ? `
      <div style="margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid var(--charcoal-border);max-height:200px;display:flex;align-items:center;justify-content:center;background:var(--bg-elev-2)">
        ${isVideo
          ? `<video src="${previewSrc}" style="max-width:100%;max-height:200px" controls></video>`
          : `<img src="${previewSrc}" style="max-width:100%;max-height:200px;object-fit:contain" alt="Preview">`}
      </div>` : ''}
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
        <button onclick="SitePhotos.savePhoto(${isEdit ? `'${escapeAttr(editId)}'` : 'null'},'${escapeAttr(photo.imageUrl || '')}','${escapeAttr(photo.thumbnailUrl || '')}','${escapeAttr(photo.mediaType || mediaType || 'photo')}')" class="modal-btn-primary" style="flex:1;padding:11px;border-radius:8px;border:none;background:var(--amber);color:#fff;cursor:pointer;font-family:inherit;font-weight:600">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    `);
  }

  // ── Save Photo (Change #7: mediaType) ──
  async function savePhoto(editId, imageUrl, thumbnailUrl, mediaType) {
    const name = document.getElementById('sp-name')?.value?.trim();
    if (!name) { App.toast(`${mediaType === 'video' ? 'Video' : 'Photo'} name is required`, 'warning'); return; }

    const data = {
      name,
      description: document.getElementById('sp-description')?.value?.trim() || '',
      category: document.getElementById('sp-category')?.value || '',
      imageUrl: imageUrl || '',
      thumbnailUrl: thumbnailUrl || '',
      mediaType: mediaType || 'photo',
    };

    if (editId) {
      await State.updateSitePhoto(editId, data);
      App.closeModal();
      App.toast(`${mediaType === 'video' ? 'Video' : 'Photo'} updated`, 'success');
      App.showSitePhotos();
    } else {
      await State.addSitePhoto(data);
      App.closeModal();
      App.toast(`${mediaType === 'video' ? 'Video' : 'Photo'} saved`, 'success');
      App.showSitePhotos();
    }
  }

  // ── Photo Detail / Full-screen preview (Change #7: video + share) ──
  function renderPhotoDetail(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) return '<div class="m-empty">Photo not found</div>';

    const isVideo = photo.mediaType === 'video';
    const fullSrc = _resolveImageUrl(photo.imageUrl || photo.thumbnail);
    const catBadge = _categoryBadge(photo.category);

    return `
      <div style="max-width:640px;margin:0 auto">
        <!-- Full-size Media -->
        ${fullSrc ? `
        <div style="border-radius:12px;overflow:hidden;border:1px solid var(--charcoal-border);margin-bottom:16px;background:var(--bg-elev-2)">
          ${isVideo
            ? `<video src="${fullSrc}" style="width:100%;display:block" controls autoplay></video>`
            : `<img src="${fullSrc}" style="width:100%;display:block;cursor:zoom-in" onclick="SitePhotos._showFullscreen('${escapeAttr(photoId)}')" alt="${escapeAttr(photo.name)}">`}
        </div>` : ''}

        <!-- Info Card -->
        <div style="background:var(--charcoal-mid);border:1px solid var(--charcoal-border);border-radius:12px;padding:20px;margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="min-width:0;flex:1">
              <h3 style="font-size:18px;font-weight:800;color:var(--text);margin:0 0 6px">${isVideo ? '🎬 ' : ''}${escapeHtml(photo.name || 'Untitled')}</h3>
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

        <!-- Actions (Change #7: Share button) -->
        <div style="display:flex;gap:10px;margin-top:16px">
          <button onclick="SitePhotos.showEditPhotoModal('${escapeAttr(photo.id)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('pencil', 14)} Edit</button>
          <button onclick="SitePhotos._shareMedia('${escapeAttr(photo.id)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--charcoal-border);background:var(--bg-elev-2);color:var(--text-secondary);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button onclick="SitePhotos.confirmDeletePhoto('${escapeAttr(photo.id)}','${escapeAttr(photo.name)}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(199,121,102,0.3);background:rgba(199,121,102,0.08);color:var(--danger);cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px">${Icons.render('trash', 14)} Delete</button>
        </div>
      </div>
      <div style="height:80px"></div>`;
  }

  // ── Fullscreen overlay (Change #7: video support) ──
  function _showFullscreen(photoId) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(photoId));
    if (!photo) return;

    const isVideo = photo.mediaType === 'video';
    const fullSrc = _resolveImageUrl(photo.imageUrl || photo.thumbnail);
    if (!fullSrc) return;

    const overlay = document.createElement('div');
    overlay.id = 'photo-fullscreen-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:fadeIn .15s ease';
    overlay.onclick = () => overlay.remove();
    if (isVideo) {
      overlay.innerHTML = `<video src="${fullSrc}" style="max-width:95vw;max-height:90vh;border-radius:4px" controls autoplay></video>`;
    } else {
      overlay.innerHTML = `<img src="${fullSrc}" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:4px">`;
    }
    document.body.appendChild(overlay);
  }

  // ── Edit ──
  function showEditPhotoModal(id) {
    const photos = State.getSitePhotos ? State.getSitePhotos() : [];
    const photo = photos.find(p => String(p.id) === String(id));
    if (!photo) return;
    showAddPhotoModal(photo.imageUrl, photo.thumbnail, id, photo.mediaType || 'photo');
  }

  // ── Delete ──
  function confirmDeletePhoto(id, name) {
    App.showConfirmModal({
      icon: Icons.render('camera', 24),
      title: `Delete "${escapeHtml(name || 'Untitled')}"?`,
      body: 'This media will be permanently removed.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
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
    handlePhotoCapture,
    handleVideoCapture,
    showAddPhotoModal,
    showEditPhotoModal,
    savePhoto,
    confirmDeletePhoto,
    _showFullscreen,
    _filterCategory,
    _shareMedia,
  };
})();
