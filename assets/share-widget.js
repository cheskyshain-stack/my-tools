/* ============================================================
   CJ PORTAL — Share widget
   Drop `<div id="cj-share"></div>` wherever the section should sit,
   then `<script src="/assets/share-widget.js" defer></script>`.
   Renders a single subtle "Share" button; clicking it pops open a
   small panel with a QR code (reusing /assets/qrcode.min.js, lazy-
   loaded on first open) + Copy Link + Text + native Share buttons,
   all pointing at the current page's own URL. Self-styled with
   cj.css token fallbacks so it looks right whether or not the host
   page links cj.css.
   ============================================================ */
(function () {
  var SHARE_URL = window.location.origin + window.location.pathname;
  var SHARE_TITLE = document.title || 'CJ Portal';
  var SHARE_TEXT = SHARE_TITLE + ' — on CJ Portal';
  var qrLoaded = false;

  var ICONS = {
    shareGlyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 3.9M15.4 6.5L8.6 10.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  var CSS = ''
    + '.cj-share{position:relative;display:flex;justify-content:center;width:100%;margin:26px auto;padding:0 14px;box-sizing:border-box}'
    + '.cj-share *{box-sizing:border-box}'
    + '.cj-share-trigger{display:inline-flex;align-items:center;gap:7px;padding:0 15px;height:38px;border-radius:999px;border:1px solid var(--cj-line,rgba(255,255,255,.10));background:rgba(255,255,255,.04);color:var(--cj-muted,#93A3C7);font-family:var(--cj-body,inherit);font-size:12.5px;font-weight:700;letter-spacing:.01em;cursor:pointer;transition:background .16s,color .16s,transform .16s;-webkit-tap-highlight-color:transparent}'
    + '.cj-share-trigger svg{width:14px;height:14px;flex:none;color:var(--cj-cyan,#00C8FF)}'
    + '.cj-share-trigger:hover{background:rgba(255,255,255,.08);color:var(--cj-text,#EDF2FF)}'
    + '.cj-share-trigger:active{transform:scale(.965)}'
    + '.cj-share.open .cj-share-trigger{background:rgba(255,255,255,.08);color:var(--cj-text,#EDF2FF)}'
    + '.cj-share-panel{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translate(-50%,6px);width:252px;max-width:calc(100vw - 28px);background:var(--cj-card,#121D38);border:1px solid var(--cj-line,rgba(255,255,255,.08));border-radius:var(--cj-r-lg,18px);box-shadow:var(--cj-shadow,0 18px 44px rgba(0,0,0,.55));padding:16px;z-index:120;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .16s ease,transform .16s ease}'
    + '.cj-share.open .cj-share-panel{opacity:1;visibility:visible;pointer-events:auto;transform:translate(-50%,0)}'
    + '.cj-share-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}'
    + '.cj-share-panel-title{font-family:var(--cj-display,"Fraunces",Georgia,serif);font-weight:600;font-size:15px;color:var(--cj-text,#EDF2FF)}'
    + '.cj-share-close{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.06);color:var(--cj-muted,#93A3C7);cursor:pointer;flex:none;border:0}'
    + '.cj-share-close svg{width:13px;height:13px}'
    + '.cj-share-close:hover{background:rgba(255,255,255,.12);color:var(--cj-text,#EDF2FF)}'
    + '.cj-share-qr{background:#fff;border-radius:12px;padding:8px;display:flex;justify-content:center;margin:0 auto 12px;box-shadow:0 8px 20px rgba(0,0,0,.25);line-height:0;width:96px;height:96px}'
    + '.cj-share-qr img,.cj-share-qr canvas,.cj-share-qr table{display:block;width:80px;height:80px}'
    + '.cj-share-actions{display:flex;flex-direction:column;gap:7px}'
    + '.cj-share-btn{display:flex;align-items:center;gap:9px;padding:0 12px;height:38px;border-radius:10px;border:1px solid var(--cj-line,rgba(255,255,255,.08));background:rgba(255,255,255,.05);color:var(--cj-text,#EDF2FF);font-family:var(--cj-body,inherit);font-size:13px;font-weight:700;cursor:pointer;transition:transform .16s var(--cj-ease,ease),filter .16s,background .16s;-webkit-tap-highlight-color:transparent;width:100%}'
    + '.cj-share-btn svg{width:15px;height:15px;flex:none;color:var(--cj-cyan,#00C8FF)}'
    + '.cj-share-btn:hover{background:rgba(255,255,255,.10)}'
    + '.cj-share-btn:active{transform:scale(.975)}'
    + '.cj-share-btn.primary{background:linear-gradient(140deg,var(--cj-accent,#2583F7),var(--cj-accent-deep,#1763CF));border-color:transparent;color:#fff}'
    + '.cj-share-btn.primary:hover{filter:brightness(1.06)}'
    + '.cj-share-btn.primary svg{color:#fff}'
    + '.cj-share-btn.copied{background:var(--cj-success,#10b981);border-color:transparent;color:#fff}'
    + '.cj-share-btn.copied svg{color:#fff}'
    + '.cj-share-scrim{position:fixed;inset:0;z-index:110;background:transparent}';

  function injectStyle() {
    if (document.getElementById('cj-share-style')) return;
    var style = document.createElement('style');
    style.id = 'cj-share-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildMarkup(mount) {
    mount.classList.add('cj-share');
    mount.innerHTML =
      '<button type="button" class="cj-share-trigger" id="cjShareTrigger" aria-expanded="false">' + ICONS.shareGlyph + '<span>Share</span></button>' +
      '<div class="cj-share-panel" id="cjSharePanel" role="dialog" aria-label="Share this page">' +
        '<div class="cj-share-panel-head">' +
          '<span class="cj-share-panel-title">Share this page</span>' +
          '<button type="button" class="cj-share-close" id="cjShareClose" aria-label="Close">' + ICONS.close + '</button>' +
        '</div>' +
        '<div class="cj-share-qr" id="cjShareQR"></div>' +
        '<div class="cj-share-actions">' +
          '<button type="button" class="cj-share-btn primary" data-action="copy">' + ICONS.copy + '<span>Copy Link</span></button>' +
          '<button type="button" class="cj-share-btn" data-action="text">' + ICONS.text + '<span>Text</span></button>' +
          '<button type="button" class="cj-share-btn" data-action="share" hidden>' + ICONS.shareGlyph + '<span>Share</span></button>' +
        '</div>' +
      '</div>';
  }

  function loadQRLib(cb) {
    if (window.QRCode) { cb(); return; }
    var s = document.createElement('script');
    s.src = '/assets/qrcode.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function renderQR(container) {
    if (!container) return;
    container.innerHTML = '';
    new QRCode(container, {
      text: SHARE_URL,
      width: 80,
      height: 80,
      colorDark: '#0B1326',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  function fallbackCopy(done) {
    var input = document.createElement('input');
    input.value = SHARE_URL;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, SHARE_URL.length);
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(input);
  }

  function flashCopied(btn) {
    var span = btn.querySelector('span');
    var svg = btn.querySelector('svg');
    var originalText = span.textContent;
    var originalSvg = svg.outerHTML;
    svg.outerHTML = ICONS.check;
    span.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function () {
      span.textContent = originalText;
      var currentSvg = btn.querySelector('svg');
      if (currentSvg) currentSvg.outerHTML = originalSvg;
      btn.classList.remove('copied');
    }, 1600);
  }

  function copyLink(btn) {
    var done = function () { flashCopied(btn); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SHARE_URL).then(done).catch(function () { fallbackCopy(done); });
    } else {
      fallbackCopy(done);
    }
  }

  function smsHref(body) {
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var sep = isIOS ? '&' : '?';
    return 'sms:' + sep + 'body=' + encodeURIComponent(body);
  }

  function wireActionButtons(mount) {
    var copyBtn = mount.querySelector('[data-action="copy"]');
    var textBtn = mount.querySelector('[data-action="text"]');
    var shareBtn = mount.querySelector('[data-action="share"]');

    copyBtn.addEventListener('click', function () { copyLink(copyBtn); });
    textBtn.addEventListener('click', function () {
      window.location.href = smsHref(SHARE_TEXT + ' ' + SHARE_URL);
    });
    if (navigator.share) {
      shareBtn.hidden = false;
      shareBtn.addEventListener('click', function () {
        navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL }).catch(function () { /* user cancelled */ });
      });
    }
  }

  function wireToggle(mount) {
    var trigger = mount.querySelector('#cjShareTrigger');
    var closeBtn = mount.querySelector('#cjShareClose');
    var scrim = null;

    function open() {
      mount.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      if (!qrLoaded) {
        qrLoaded = true;
        loadQRLib(function () { renderQR(document.getElementById('cjShareQR')); });
      }
      if (!scrim) {
        scrim = document.createElement('div');
        scrim.className = 'cj-share-scrim';
        scrim.addEventListener('click', close);
        document.body.appendChild(scrim);
      }
      document.addEventListener('keydown', onKeydown);
    }
    function close() {
      mount.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      if (scrim) { scrim.remove(); scrim = null; }
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(e) { if (e.key === 'Escape') close(); }

    trigger.addEventListener('click', function () {
      if (mount.classList.contains('open')) close(); else open();
    });
    closeBtn.addEventListener('click', close);
  }

  function init() {
    var mount = document.getElementById('cj-share');
    if (!mount) return;
    injectStyle();
    buildMarkup(mount);
    wireActionButtons(mount);
    wireToggle(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
