/**
 * Aquafire dealer-locator bridge -- for pages that embed
 * https://aquafire.app/dealer-locator.html in an <iframe>.
 *
 * Install once on the host page, anywhere after the opening <body> (the same
 * Custom HTML section as the iframe, the theme layout next to assistant.js,
 * or a GTM Custom HTML tag on All Pages):
 *
 *   <script src="https://aquafire.app/dealer-embed.js" async></script>
 *
 * The locator relays every analytics event it fires (dealer_search,
 * dealer_search_bar, dealer_click -- docs/embedding.md) to its parent with
 * postMessage. This script receives them and pushes them into the host
 * page's own dataLayer, so the host's Google Tag Manager sees them as
 * ordinary custom events on the host's visitor session. Without it the
 * events stay inside the frame, where the frame's third-party cookies
 * (blocked in Safari/Firefox, partitioned in Chrome) can't join that session.
 *
 * Handshake: the frame numbers its messages (`seq`) and keeps the last 100.
 * We answer its `hello`, or the first event we see, with `ready`; it then
 * replays anything we missed while this script was still loading. seq
 * de-duplication means a replay never pushes the same event twice.
 *
 * Only messages from ORIGIN are accepted, so no other frame on the host page
 * can push into its dataLayer through this. Override with data-origin on the
 * script tag when testing against a preview deployment.
 *
 * Pure ASCII on purpose: served to Shopify pages whose charset we don't set.
 */
(function () {
  var SOURCE = 'aquafire-dealer-locator';
  var HOST_SOURCE = SOURCE + '-host';
  var script = document.currentScript;
  var ORIGIN = (script && script.getAttribute('data-origin')) || 'https://aquafire.app';
  var frames = []; // [{ win, seen: { "<seq>": true } }], one per locator frame

  function stateFor(win) {
    for (var i = 0; i < frames.length; i++) if (frames[i].win === win) return frames[i];
    var st = { win: win, seen: {} };
    frames.push(st);
    return st;
  }

  function ready(win) {
    try { win.postMessage({ source: HOST_SOURCE, type: 'ready' }, ORIGIN); } catch (e) {}
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN) return;
    var m = e.data;
    if (!m || m.source !== SOURCE) return;
    var st = stateFor(e.source);
    if (m.type === 'hello') { ready(e.source); return; }
    if (m.type !== 'event' || !m.event) return;
    if (m.seq != null) {
      if (st.seen[m.seq]) return;
      st.seen[m.seq] = true;
    }
    var payload = {};
    for (var k in m) if (k !== 'source' && k !== 'type' && k !== 'seq') payload[k] = m[k];
    (window.dataLayer = window.dataLayer || []).push(payload);
  });

  // Frames already on the page may have said hello before we were listening:
  // ask each one to replay. Extra readys are harmless (seq de-dup).
  function greet() {
    var els = document.querySelectorAll('iframe[src]');
    for (var i = 0; i < els.length; i++) {
      var src = els[i].getAttribute('src') || '';
      if (src.indexOf(ORIGIN + '/dealer-locator') === 0 && els[i].contentWindow) ready(els[i].contentWindow);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', greet);
  else greet();
})();
