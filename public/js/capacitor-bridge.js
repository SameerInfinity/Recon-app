/* ═══════════════════════════════════════════════════════════
   CAPACITOR-BRIDGE.JS — Native App Environment Bridge
   Detects Capacitor native runtime, sets API base URL,
   manages online/offline state, and provides graceful
   offline handling for the Android app.
   ═══════════════════════════════════════════════════════════ */

const CapacitorBridge = (() => {
  // ── Environment Detection ─────────────────────
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const isAndroid = isNative && /android/i.test(navigator.userAgent);
  const isIOS = isNative && /iphone|ipad|ipod/i.test(navigator.userAgent);

  // ── Production Server URL ─────────────────────
  // This is the Render-deployed backend. Used by the native app
  // to reach /api/config, /api/ai/chat, /api/user/delete etc.
  // UPDATE THIS when you deploy to a new URL or add a custom domain.
  const PRODUCTION_SERVER_URL = 'https://colancio.onrender.com/';

  // API base: in browser (localhost) use relative paths,
  // in Capacitor (local assets) use the full production URL
  const API_BASE = isNative ? PRODUCTION_SERVER_URL : '';

  // ── Network Status ────────────────────────────
  let _isOnline = navigator.onLine !== false; // default true
  let _listeners = [];

  function isOnline() { return _isOnline; }
  function isOffline() { return !_isOnline; }

  function onNetworkChange(callback) {
    _listeners.push(callback);
    return () => {
      _listeners = _listeners.filter(l => l !== callback);
    };
  }

  function _notifyListeners(status) {
    _listeners.forEach(cb => {
      try { cb(status); } catch (e) { console.warn('[CapBridge] Listener error:', e); }
    });
  }

  // ── Network event listeners ───────────────────
  function _setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('[CapBridge] Network: ONLINE');
      _isOnline = true;
      _notifyListeners('online');
    });

    window.addEventListener('offline', () => {
      console.log('[CapBridge] Network: OFFLINE');
      _isOnline = false;
      _notifyListeners('offline');
    });

    // Also use Capacitor Network plugin if available (more reliable on Android)
    if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Network) {
      const NetworkPlugin = window.Capacitor.Plugins.Network;
      NetworkPlugin.addListener('networkStatusChange', (status) => {
        const online = status.connected && status.connectionType !== 'none';
        if (online !== _isOnline) {
          _isOnline = online;
          console.log('[CapBridge] Capacitor Network:', online ? 'ONLINE' : 'OFFLINE', `(${status.connectionType})`);
          _notifyListeners(online ? 'online' : 'offline');
        }
      });
    }
  }

  // ── API Fetch Helper ──────────────────────────
  // Wraps fetch() to always use the correct base URL
  // and handles offline gracefully
  async function apiFetch(path, options = {}) {
    if (_isOffline() && !path.includes('/api/config')) {
      // Allow config fetch even when offline (uses cache)
      throw new Error('OFFLINE: No internet connection');
    }

    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500) {
        // Server error — might be temporary
        console.warn(`[CapBridge] Server error ${response.status} for ${path}`);
      }
      return response;
    } catch (err) {
      if (err.message === 'OFFLINE: No internet connection') throw err;
      // Network failure — mark offline
      if (_isOnline) {
        _isOnline = false;
        _notifyListeners('offline');
      }
      throw new Error('OFFLINE: Could not reach server');
    }
  }

  // ── Offline UI Helpers ────────────────────────
  function showOfflineBanner() {
    // Don't add duplicate banners
    if (document.getElementById('recon-offline-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'recon-offline-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: #B47A3C; color: #fff; text-align: center;
      padding: 10px 16px; font-size: 13px; font-weight: 600;
      font-family: -apple-system, system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: transform 0.3s ease;
    `;
    banner.textContent = 'You are offline — changes will sync when connected';
    document.body.prepend(banner);
    document.body.style.paddingTop = '40px';
  }

  function hideOfflineBanner() {
    const banner = document.getElementById('recon-offline-banner');
    if (banner) {
      banner.remove();
      document.body.style.paddingTop = '';
    }
  }

  // ── Initialize ────────────────────────────────
  function init() {
    _setupNetworkListeners();

    // Show offline banner if starting offline
    if (!_isOnline) {
      // Wait for DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showOfflineBanner);
      } else {
        showOfflineBanner();
      }
    }

    // Toggle banner on network change
    onNetworkChange((status) => {
      if (status === 'offline') {
        showOfflineBanner();
      } else {
        hideOfflineBanner();
      }
    });

    console.log(`[CapBridge] Initialized — ${isNative ? 'NATIVE' : 'WEB'} | API_BASE: ${API_BASE || '(relative)'} | Online: ${_isOnline}`);
  }

  // Auto-init
  init();

  return {
    isNative,
    isAndroid,
    isIOS,
    API_BASE,
    PRODUCTION_SERVER_URL,
    isOnline,
    isOffline,
    onNetworkChange,
    apiFetch,
    showOfflineBanner,
    hideOfflineBanner,
  };
})();
