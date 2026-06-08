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

  async function init() {
    try {
      let config = null;
      try {
        // Fetch config from server (reads from .env)
        const res = await fetch('/api/config');
        if (res.ok) {
          config = await res.json();
          // Cache for offline PWA support
          localStorage.setItem('recon_supabase_config', JSON.stringify(config));
        } else {
          throw new Error('API config route returned ' + res.status);
        }
      } catch (fetchErr) {
        // Network offline or API unreachable, fallback to cached config
        console.warn('[Supabase] Config fetch failed, attempting to use cached config for offline mode');
        const cached = localStorage.getItem('recon_supabase_config');
        if (cached) config = JSON.parse(cached);
      }

      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn('[Supabase] No credentials configured — running in offline mode');
        _ready = true;
        _readyCallbacks.forEach(cb => cb(null));
        return;
      }

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
            window.location.href = '/';
          }
        }

        if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out');
          _user = null;
          window.location.href = '/auth.html';
        }
      });

      // Check existing session
      const { data: { session } } = await _supabase.auth.getSession();
      _user = session?.user || null;

      // Global fetch interceptor to catch 401/403 auth expiry
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        if ((response.status === 401 || response.status === 403) && !window.location.pathname.includes('auth.html')) {
          console.warn('[Auth] Token expired or invalid, redirecting to login...');
          if (_supabase) await _supabase.auth.signOut();
          window.location.href = '/auth.html?expired=1';
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
    if (error) throw error;
  }

  async function resetPassword(email) {
    if (!_supabase) throw new Error('Supabase not initialized');
    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth.html?mode=reset',
    });
    if (error) throw error;
  }

  async function deleteUser() {
    if (!_supabase) throw new Error('Supabase not initialized');
    // Get the current user's access token to send to the server
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No active session');

    const res = await fetch('/api/user/delete', {
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
    signOut,
    resetPassword,
    deleteUser,
    requireAuth,
  };
})();
