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
      const isNative = !!(window.CapacitorBridge && CapacitorBridge.isNative);

      // ── NATIVE (Capacitor): read the bundled app-config.json FIRST ──
      // The standalone Android APK must never depend on the Render server
      // to bootstrap. app-config.json is generated at build time from .env
      // (see scripts/build-native-config.js) and bundled into the APK. It
      // contains only the already-public anon key + project URL, so there
      // is no secret leak — see CONTEXT.md §2 (standalone architecture).
      if (isNative) {
        try {
          console.log('[Supabase] Native build — loading bundled app-config.json');
          const res = await fetch('app-config.json', { cache: 'no-store' });
          if (res.ok) {
            config = await res.json();
            sessionStorage.setItem('recon_supabase_config', JSON.stringify(config));
          } else {
            console.warn('[Supabase] app-config.json returned', res.status, '— falling back to server config');
          }
        } catch (bundleErr) {
          console.warn('[Supabase] Bundled app-config.json missing:', bundleErr.message, '— falling back to server config');
        }
      }

      // ── WEB, or NATIVE without a bundled config: fetch /api/config ──
      // In Capacitor (local assets), CapacitorBridge.API_BASE is the
      // production Render URL. In a browser it's '' (same-origin).
      if (!config) {
        try {
          const configUrl = (window.CapacitorBridge ? CapacitorBridge.API_BASE : '') + '/api/config';
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
          // Network offline or API unreachable — try the cached config.
          console.warn('[Supabase] Config fetch FAILED:', fetchErr.message || fetchErr);
          const cached = sessionStorage.getItem('recon_supabase_config');
          if (cached) {
            config = JSON.parse(cached);
          } else {
            // No cached config and the server is unreachable.
            // Do NOT fall back to hardcoded production credentials —
            // they would leak the project ref into version control.
            console.warn('[Supabase] Offline and no cached config — will surface "no credentials" state to UI.');
          }
        }
      }

      if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn('[Supabase] No credentials configured — running in offline mode');
        _ready = true;
        _readyCallbacks.forEach(cb => cb(null));
        return;
      }

      _config = config;

      // Dynamically load Supabase SDK if not already loaded
      if (!window.supabase) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      }

      _supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

      // Listen for auth state changes
      _supabase.auth.onAuthStateChange((event, session) => {
        _user = session?.user || null;

        if (event === 'SIGNED_IN') {
          console.log('[Auth] Signed in:', _user.email);
          // If on auth page, redirect to app
          if (window.location.pathname.includes('auth.html')) {
            window.location.href = window.CapacitorBridge && CapacitorBridge.isNative ? '/index.html' : '/';
          }
        }

        if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out');
          _user = null;
          window.location.href = window.CapacitorBridge && CapacitorBridge.isNative ? '/auth.html' : '/auth.html';
        }
      });

      // Check existing session
      const { data: { session } } = await _supabase.auth.getSession();
      _user = session?.user || null;

      // Global fetch interceptor to catch 401/403 auth expiry
      // Intercepts same-origin AND direct Supabase external calls.
      // The _isHandlingAuthError guard prevents re-entry when signOut()
      // itself triggers another 401 (which would otherwise loop forever).
      let _isHandlingAuthError = false;
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        const reqUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const isSameOrigin = reqUrl.startsWith('/') || reqUrl.startsWith(window.location.origin);
        const isSupabase = reqUrl.includes('supabase.co') || isSameOrigin;
        if (
          !_isHandlingAuthError &&
          isSupabase &&
          (response.status === 401 || response.status === 403) &&
          !window.location.pathname.includes('auth.html')
        ) {
          _isHandlingAuthError = true;
          console.warn('[Auth] Token expired or invalid, redirecting to login...');
          if (_supabase) {
            try { await _supabase.auth.signOut(); } catch(e){}
          }
          const authPath = window.CapacitorBridge && CapacitorBridge.isNative ? '/auth.html' : '/auth.html';
          window.location.href = authPath + '?expired=1';
        }
        return response;
      };

      _ready = true;
      _readyCallbacks.forEach(cb => cb(_supabase));
      console.log('[Supabase] Initialized', _user ? `(user: ${_user.email})` : '(no session)');

    } catch (err) {
      console.error('[Supabase] Init error:', err);
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
    return !!(window.CapacitorBridge && CapacitorBridge.isNative);
  }

  function getAiChatUrl() {
    if (_config && _config.supabaseUrl && _isNativeEnv()) {
      return _config.supabaseUrl + '/functions/v1/ai-chat';
    }
    return (window.CapacitorBridge ? CapacitorBridge.API_BASE : '') + '/api/ai/chat';
  }

  function getDeleteUserUrl() {
    if (_config && _config.supabaseUrl && _isNativeEnv()) {
      return _config.supabaseUrl + '/functions/v1/delete-user';
    }
    return (window.CapacitorBridge ? CapacitorBridge.API_BASE : '') + '/api/user/delete';
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
