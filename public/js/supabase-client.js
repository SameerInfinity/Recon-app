/* ═══════════════════════════════════════════
   SUPABASE-CLIENT.JS — Supabase Init & Auth
   Fetches config from server, initializes
   Supabase client for auth + database
   ═══════════════════════════════════════════ */

const SupabaseClient = (() => {
  let _supabase = null;
  let _user = null;
  let _ready = false;
  let _readyCallbacks = [];
  let _config = null; // keeps googleWebClientId etc. around for native sign-in

  async function init() {
    try {
      let config = null;
      const isNative = !!((window.CapacitorBridge && window.CapacitorBridge.isNative) || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

      console.log('[Supabase] ── init() start ──');
      console.log('[Supabase] isNative:', isNative);
      console.log('[Supabase] window.Capacitor:', !!window.Capacitor);
      console.log('[Supabase] window.supabase SDK loaded:', !!window.supabase);
      console.log('[Supabase] location:', window.location.href);

      // ── NATIVE (Capacitor): read the bundled app-config.json FIRST ──
      if (isNative) {
        // Strategy 1: fetch with absolute path (most reliable in Capacitor)
        try {
          console.log('[Supabase] Native: trying fetch("/app-config.json")');
          const res = await fetch('/app-config.json');
          console.log('[Supabase] Native: fetch("/app-config.json") status:', res.status, res.ok);
          if (res.ok) {
            config = await res.json();
            console.log('[Supabase] Native: config loaded via /app-config.json ✓', config.supabaseUrl ? 'URL present' : 'URL MISSING');
          }
        } catch (err1) {
          console.warn('[Supabase] Native: fetch("/app-config.json") failed:', err1.message);
        }

        // Strategy 2: fetch with relative path (fallback)
        if (!config) {
          try {
            console.log('[Supabase] Native: trying fetch("app-config.json")');
            const res = await fetch('app-config.json');
            console.log('[Supabase] Native: fetch("app-config.json") status:', res.status, res.ok);
            if (res.ok) {
              config = await res.json();
              console.log('[Supabase] Native: config loaded via app-config.json ✓');
            }
          } catch (err2) {
            console.warn('[Supabase] Native: fetch("app-config.json") failed:', err2.message);
          }
        }

        // Strategy 3: XMLHttpRequest synchronous (last resort for WebView quirks)
        if (!config) {
          try {
            console.log('[Supabase] Native: trying XMLHttpRequest for /app-config.json');
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/app-config.json', false); // synchronous
            xhr.send(null);
            if (xhr.status === 200 && xhr.responseText) {
              config = JSON.parse(xhr.responseText);
              console.log('[Supabase] Native: config loaded via XHR ✓');
            } else {
              console.warn('[Supabase] Native: XHR status:', xhr.status);
            }
          } catch (err3) {
            console.warn('[Supabase] Native: XHR failed:', err3.message);
          }
        }

        if (config) {
          try { sessionStorage.setItem('recon_supabase_config', JSON.stringify(config)); } catch(e) {}
        } else {
          console.error('[Supabase] Native: ALL config load strategies failed!');
        }
      }

      // ── WEB, or NATIVE without a bundled config: fetch /api/config ──
      if (!config) {
        try {
          const configUrl = (window.CapacitorBridge ? window.CapacitorBridge.API_BASE : '') + '/api/config';
          console.log('[Supabase] Fetching config from:', configUrl, '| isNative:', isNative);
          const res = await fetch(configUrl);
          console.log('[Supabase] Config response status:', res.status, res.ok);
          if (res.ok) {
            config = await res.json();
            sessionStorage.setItem('recon_supabase_config', JSON.stringify(config));
          } else {
            throw new Error('API config route returned ' + res.status);
          }
        } catch (fetchErr) {
          console.warn('[Supabase] Config fetch FAILED:', fetchErr.message || fetchErr);
          const cached = sessionStorage.getItem('recon_supabase_config');
          if (cached) {
            config = JSON.parse(cached);
            console.log('[Supabase] Using cached config from sessionStorage');
          } else {
            console.warn('[Supabase] Offline and no cached config — will surface "no credentials" state to UI.');
          }
        }
      }

      if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn('[Supabase] No credentials configured — running in offline mode');
        console.warn('[Supabase] config object:', JSON.stringify(config));
        _ready = true;
        _readyCallbacks.forEach(cb => cb(null));
        return;
      }

      console.log('[Supabase] Config OK — URL:', config.supabaseUrl);
      _config = config;

      // ── Load SDK ──
      // The local SDK bundle (public/js/supabase.min.js) is loaded via a
      // <script> tag in index.html / auth.html BEFORE this file — so
      // window.supabase should already exist.
      if (!window.supabase) {
        console.warn('[Supabase] SDK not preloaded — fetching from CDN (web fallback)');
        try {
          await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
        } catch (cdnErr) {
          console.error('[Supabase] CDN SDK load failed:', cdnErr);
          throw new Error('Supabase SDK could not be loaded. Check your internet connection.');
        }
      }

      if (!window.supabase || !window.supabase.createClient) {
        console.error('[Supabase] SDK object:', typeof window.supabase, window.supabase);
        throw new Error('Supabase SDK is not available — cannot initialize.');
      }

      console.log('[Supabase] Creating client with URL:', config.supabaseUrl);
      _supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      console.log('[Supabase] Client created successfully ✓');

      // Listen for auth state changes
      _supabase.auth.onAuthStateChange((event, session) => {
        _user = session?.user || null;

        if (event === 'SIGNED_IN') {
          console.log('[Auth] Signed in:', _user.email);
          // If on auth page, redirect to app
          if (window.location.pathname.includes('auth.html')) {
            window.location.href = (window.CapacitorBridge && window.CapacitorBridge.isNative) ? '/index.html' : '/';
          }
        }

        if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out');
          _user = null;
          window.location.href = (window.CapacitorBridge && window.CapacitorBridge.isNative) ? '/auth.html' : '/auth.html';
        }
      });

      // Check existing session
      const { data: { session } } = await _supabase.auth.getSession();
      _user = session?.user || null;

      // Global fetch interceptor to catch 401/403 auth expiry
      // IMPORTANT: This must NOT intercept:
      //   - Supabase auth endpoints (/auth/v1/*) — they legitimately return 401
      //     during token refresh and Supabase handles that internally
      //   - Local file requests (/, /index.html, /app-config.json, etc.)
      //   - Edge Function calls (they may return 401 for their own reasons)
      let _isHandlingAuthError = false;
      let _consecutive401Count = 0;
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

        // Skip interception for auth endpoints — Supabase manages its own token lifecycle
        const isAuthEndpoint = reqUrl.includes('/auth/v1/') || reqUrl.includes('/auth/v1?');
        // Skip local file requests (native WebView serves local assets via / paths)
        const isLocalFile = reqUrl.match(/^\/?[\w.-]+\.(html|json|js|css|png|svg|ico)/) || reqUrl === '/';
        // Only intercept Supabase REST/Realtime data calls, not auth
        const isSupabaseData = reqUrl.includes('supabase.co') && !isAuthEndpoint;

        if (
          !_isHandlingAuthError &&
          !isLocalFile &&
          !isAuthEndpoint &&
          isSupabaseData &&
          (response.status === 401 || response.status === 403) &&
          !window.location.pathname.includes('auth.html')
        ) {
          _consecutive401Count++;
          console.warn(`[Auth] Supabase data request returned ${response.status} (count: ${_consecutive401Count}):`, reqUrl);

          // Only force logout after multiple consecutive 401s — a single 401 could
          // be a race condition during token refresh. Supabase's auth state change
          // listener handles real sign-outs already.
          if (_consecutive401Count >= 3) {
            _isHandlingAuthError = true;
            console.warn('[Auth] Multiple consecutive 401s — session is dead, redirecting to login...');
            if (_supabase) {
              try { await _supabase.auth.signOut(); } catch(e){}
            }
            const authPath = (window.CapacitorBridge && window.CapacitorBridge.isNative) ? '/auth.html' : '/auth.html';
            window.location.href = authPath + '?expired=1';
          }
        } else if (response.ok || (response.status >= 200 && response.status < 400)) {
          // Reset counter on any successful request
          _consecutive401Count = 0;
        }
        return response;
      };

      _ready = true;
      _readyCallbacks.forEach(cb => cb(_supabase));
      console.log('[Supabase] ── init() complete ✓ ──', _user ? `(user: ${_user.email})` : '(no session)');

    } catch (err) {
      console.error('[Supabase] ── init() FAILED ──', err);
      console.error('[Supabase] Error details:', err.message, err.stack);
      _ready = true;
      _readyCallbacks.forEach(cb => cb(null));
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function onReady(cb) {
    if (_ready) cb(_supabase);
    else _readyCallbacks.push(cb);
  }

  function getClient() { return _supabase; }
  function getUser() { return _user; }
  function isAuthenticated() { return !!_user; }

  async function signUp(email, password, fullName) {
    if (!_supabase) throw new Error('Supabase not initialized');
    const { data, error } = await _supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    if (!_supabase) throw new Error('Supabase not initialized');
    const { data, error } = await _supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!_supabase) return;
    const { error } = await _supabase.auth.signOut();
    // Also clear the native Google session, otherwise the next "Continue
    // with Google" tap silently re-selects the same cached account instead
    // of showing the picker again.
    const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin) {
      try { await window.Capacitor.Plugins.SocialLogin.logout({ provider: 'google' }); } catch (e) {}
    }
    if (error) throw error;
  }

  async function resetPassword(email) {
    if (!_supabase) throw new Error('Supabase not initialized');
    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth.html?mode=reset',
    });
    if (error) throw error;
  }

  // ── Native Google Sign-In helpers (Capacitor only) ──
  // Generates a cryptographically random, URL-safe nonce and its SHA-256
  // digest. The digest is sent to Google (so it ends up inside the ID
  // token's `nonce` claim); the raw value is sent to Supabase, which
  // hashes it itself and compares against the token's claim. This stops
  // a stolen/replayed ID token from a *different* sign-in attempt being
  // accepted by Supabase.
  function _getUrlSafeNonce() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function _sha256Hash(message) {
    const data = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function _getNonce() {
    const rawNonce = _getUrlSafeNonce();
    const nonceDigest = await _sha256Hash(rawNonce);
    return { rawNonce, nonceDigest };
  }

  function _decodeJWT(token) {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  }

  // Validates the ID token's audience + nonce BEFORE sending it to Supabase.
  // Catches the known Android/iOS issue where the native SDK returns a
  // *cached* token from a previous sign-in (wrong/missing nonce) instead
  // of generating a fresh one — caller retries once after a clean logout.
  function _validateGoogleIdToken(idToken, expectedNonceDigest, webClientId) {
    let decoded;
    try {
      decoded = _decodeJWT(idToken);
    } catch (e) {
      return { valid: false, error: 'Could not decode ID token' };
    }
    if (webClientId && decoded.aud !== webClientId) {
      return { valid: false, error: 'Invalid audience' };
    }
    if (decoded.nonce && decoded.nonce !== expectedNonceDigest) {
      return { valid: false, error: 'Nonce mismatch' };
    }
    return { valid: true };
  }

  let _googleAuthInitialized = false;
  async function _ensureGoogleAuthInitialized() {
    if (_googleAuthInitialized) return;
    const webClientId = _config && _config.googleWebClientId;
    if (!webClientId) {
      throw new Error('Google sign-in is not configured (missing GOOGLE_WEB_CLIENT_ID on the server).');
    }
    const SocialLogin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
    if (!SocialLogin) {
      throw new Error('SocialLogin native plugin not available. Run "npx cap sync android" after installing @capgo/capacitor-social-login.');
    }
    await SocialLogin.initialize({
      google: {
        webClientId,
        mode: 'online', // required to receive an idToken
      },
    });
    _googleAuthInitialized = true;
  }

  // One real sign-in attempt against the native Google picker, with JWT
  // validation. Returns the raw nonce + idToken on success, throws on failure.
  async function _attemptNativeGoogleSignIn() {
    const SocialLogin = window.Capacitor.Plugins.SocialLogin;
    const webClientId = _config && _config.googleWebClientId;
    const { rawNonce, nonceDigest } = await _getNonce();

    const response = await SocialLogin.login({
      provider: 'google',
      options: {
        scopes: ['email', 'profile'],
        nonce: nonceDigest,
      },
    });

    const idToken = response && response.result && response.result.idToken;
    if (!idToken) throw new Error('Google sign-in did not return an ID token');

    const validation = _validateGoogleIdToken(idToken, nonceDigest, webClientId);
    if (!validation.valid) {
      const err = new Error(validation.error || 'ID token validation failed');
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    return { rawNonce, idToken };
  }

  async function signInWithGoogle() {
    if (!_supabase) throw new Error('Supabase not initialized');

    const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    if (isCapacitor) {
      // Native flow: opens Google's account picker bottom sheet right inside
      // the app (no browser tab, no redirect) and exchanges the resulting
      // ID token for a Supabase session.
      await _ensureGoogleAuthInitialized();

      let signInResult;
      try {
        signInResult = await _attemptNativeGoogleSignIn();
      } catch (err) {
        if (err && err.code === 'INVALID_TOKEN') {
          // Likely a cached token from a previous session with a stale
          // nonce. Log out of the native Google session and retry once
          // with a fresh nonce — this mirrors Supabase's own guidance.
          console.warn('[Auth] Google ID token failed validation, retrying once:', err.message);
          try { await window.Capacitor.Plugins.SocialLogin.logout({ provider: 'google' }); } catch (e) {}
          signInResult = await _attemptNativeGoogleSignIn();
        } else {
          throw err;
        }
      }

      const { data, error } = await _supabase.auth.signInWithIdToken({
        provider: 'google',
        token: signInResult.idToken,
        nonce: signInResult.rawNonce,
      });
      if (error) throw error;
      return data;
    }

    // Web flow: unchanged — full-page OAuth redirect through Supabase.
    const { data, error } = await _supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth.html',
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (error) throw error;
    return data;
  }




  async function deleteUser() {
    if (!_supabase) throw new Error('Supabase not initialized');
    // Get the current user's access token to send to the server
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No active session');

    const res = await fetch(getDeleteUserUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete account');
    return data;
  }

  // ── Endpoint resolvers: native → Supabase Edge Function, web → Render ──
  // This is the single switch-point that makes the Android app standalone.
  // Native uses the bundled Supabase URL (read from app-config.json);
  // web keeps using the existing Render endpoints (unchanged behavior).
  // To migrate the web app off Render later, just drop the isNative branch.
  function _isNativeEnv() {
    return !!((window.CapacitorBridge && window.CapacitorBridge.isNative) || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
  }

  function getAiChatUrl() {
    if (_config && _config.supabaseUrl && _isNativeEnv()) {
      return _config.supabaseUrl + '/functions/v1/ai-chat';
    }
    return (window.CapacitorBridge ? window.CapacitorBridge.API_BASE : '') + '/api/ai/chat';
  }

  function getDeleteUserUrl() {
    if (_config && _config.supabaseUrl && _isNativeEnv()) {
      return _config.supabaseUrl + '/functions/v1/delete-user';
    }
    return (window.CapacitorBridge ? window.CapacitorBridge.API_BASE : '') + '/api/user/delete';
  }

  // Guard: redirect to auth if not logged in
  function requireAuth() {
    if (!_ready) {
      onReady(() => requireAuth());
      return;
    }
    if (!_user && !window.location.pathname.includes('auth.html')) {
      window.location.href = '/auth.html';
    }
  }

  // Auto-init
  init();

  return {
    init,
    onReady,
    getClient,
    getUser,
    isAuthenticated,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    deleteUser,
    requireAuth,
    getAiChatUrl,
    getDeleteUserUrl,
  };
})();
