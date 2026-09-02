// ============================================================================
// Globe Quest — anonymous, cookieless gameplay analytics
// ----------------------------------------------------------------------------
// Exposes window.GQA with: init(), roundStart(mode), answer(mode, iso3, correct),
// roundComplete(mode, score).
//
// Privacy by design:
//   • session id is a random per-tab UUID kept in sessionStorage (cleared when
//     the tab closes) — NOT a cookie, NOT a persistent identifier.
//   • no name, email, IP, or persistent id is ever sent — only game events.
//   • If GQ_CONFIG is not filled in (or on file://), every call is a silent
//     no-op, so the game runs identically with analytics off.
//
// All sends are fire-and-forget and fully error-swallowed: analytics can never
// break or slow the game.
// ============================================================================
(function () {
  'use strict';

  var cfg = window.GQ_CONFIG || {};
  var URL = cfg.SUPABASE_URL || '';
  var KEY = cfg.SUPABASE_PUBLISHABLE_KEY || '';
  // Only run when configured AND served over http(s). Skips local file:// dev.
  var ENABLED = !!(URL && KEY) && /^https?:$/.test(location.protocol);

  var clientPromise = null;
  function client() {
    if (!ENABLED) return Promise.resolve(null);
    if (!clientPromise) {
      // Load supabase-js straight from a CDN as an ES module — no build step.
      clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
        .then(function (m) {
          return m.createClient(URL, KEY, { auth: { persistSession: false } });
        })
        .catch(function () { return null; });
    }
    return clientPromise;
  }

  function sessionId() {
    try {
      var id = sessionStorage.getItem('gq_sid');
      if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('gq_sid', id); }
      return id;
    } catch (_) {
      // sessionStorage blocked (private mode / iframe) → stable for this load only
      if (!sessionId._mem) sessionId._mem = crypto.randomUUID();
      return sessionId._mem;
    }
  }

  function send(eventType, p) {
    if (!ENABLED) return;
    p = p || {};
    client().then(function (c) {
      if (!c) return;
      return c.rpc('log_event', {
        p_session_id: sessionId(),
        p_event_type: eventType,
        p_game_mode: p.mode || null,
        p_country_code: p.iso3 || null,
        p_is_correct: typeof p.correct === 'boolean' ? p.correct : null,
        p_score: typeof p.score === 'number' ? p.score : null,
      });
    }).catch(function () { /* never surface analytics errors */ });
  }

  window.GQA = {
    enabled: ENABLED,
    init: function () { send('session_start'); },
    roundStart: function (mode) { send('round_start', { mode: mode }); },
    // iso3 ALWAYS — keeps the "hardest countries" metric from splitting iso2/iso3.
    answer: function (mode, iso3, correct) { send('answer', { mode: mode, iso3: iso3, correct: correct }); },
    roundComplete: function (mode, score) { send('round_complete', { mode: mode, score: score }); },
  };
})();
