/* ============================================================
   CJ PORTAL — Share widget
   Drop `<div id="cj-share"></div>` wherever the section should sit,
   then `<script src="/assets/share-widget.js" defer></script>`.
   Renders a QR code (reusing /assets/qrcode.min.js) + Copy Link +
   Text + native Share buttons, all pointing at the canonical portal
   URL. Self-styled with cj.css token fallbacks so it looks right
   whether or not the host page links cj.css.
   ============================================================ */
(function () {
  var SHARE_URL = 'https://tools.cjaffa.com/';
  var SHARE_TITLE = 'CJ Portal';
  var SHARE_TEXT = 'Check out CJ Portal — tools, music, and games in one place.';

  var ICONS = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H15"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 3.9M15.4 6.5L8.6 10.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  var CSS = ''
    + '.cj-share{width:min(100%,480px);margin:34px auto 26px;padding:0 14px;box-sizing:border-box}'
    + '.cj-share *{box-sizing:border-box}'
    + '.cj-share-card{background:var(--cj-card,#121D38);border:1px solid var(--cj-line,rgba(255,255,255,.08));border-radius:var(--cj-r-lg,22px);box-shadow:var(--cj-shadow,0 18px 44px rgba(0,0,0,.55));padding:22px 20px;text-align:center}'
    + '.cj-share-title{margin:0 0 4px;font-family:var(--cj-display,"Fraunces",Georgia,serif);font-weight:600;font-size:19px;letter-spacing:-.2px;color:var(--cj-text,#EDF2FF)}'
    + '.cj-share-sub{margin:0 0 18px;font-family:var(--cj-body,inherit);font-size:12.5px;color:var(--cj-muted,#93A3C7)}'
    + '.cj-share-body{display:flex;flex-direction:column;align-items:center;gap:16px}'
    + '.cj-share-qr{background:#fff;border-radius:14px;padding:9px;display:inline-flex;flex:none;box-shadow:0 8px 20px rgba(0,0,0,.25);line-height:0}'
    + '.cj-share-qr img,.cj-share-qr canvas,.cj-share-qr table{display:block;width:110px;height:110px}'
    + '.cj-share-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;width:100%}'
    + '.cj-share-btn{display:inline-flex;align-items:center;gap:7px;padding:0 16px;height:42px;border-radius:999px;border:1px solid var(--cj-line,rgba(255,255,255,.08));background:rgba(255,255,255,.06);color:var(--cj-text,#EDF2FF);font-family:var(--cj-body,inherit);font-size:13px;font-weight:700;cursor:pointer;transition:transform .16s var(--cj-ease,ease),filter .16s,background .16s;-webkit-tap-highlight-color:transparent}'
    + '.cj-share-btn svg{width:16px;height:16px;flex:none;color:var(--cj-cyan,#00C8FF)}'
    + '.cj-share-btn:hover{background:rgba(255,255,255,.10)}'
    + '.cj-share-btn:active{transform:scale(.965)}'
    + '.cj-share-btn.primary{background:linear-gradient(140deg,var(--cj-accent,#2583F7),var(--cj-accent-deep,#1763CF));border-color:transparent;color:#fff;box-shadow:0 8px 18px rgba(37,131,247,.28)}'
    + '.cj-share-btn.primary:hover{filter:brightness(1.06)}'
    + '.cj-share-btn.primary svg{color:#fff}'
    + '.cj-share-btn.copied{background:var(--cj-success,#10b981);border-color:transparent;color:#fff}'
    + '.cj-share-btn.copied svg{color:#fff}'
    + '@media(min-width:480px){.cj-share-body{flex-direction:row;justify-content:center;align-items:center;gap:20px}.cj-share-actions{width:auto;justify-content:flex-start}}'
    + '@media(max-width:360px){.cj-share-btn{font-size:12px;padding:0 12px}}';

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
      '<div class="cj-share-card">' +
        '<h2 class="cj-share-title">Share CJ Portal</h2>' +
        '<p class="cj-share-sub">Scan the code or send the link</p>' +
        '<div class="cj-share-body">' +
          '<div class="cj-share-qr" id="cjShareQR"></div>' +
          '<div class="cj-share-actions">' +
            '<button type="button" class="cj-share-btn primary" data-action="copy">' + ICONS.copy + '<span>Copy Link</span></button>' +
            '<button type="button" class="cj-share-btn" data-action="text">' + ICONS.text + '<span>Text</span></button>' +
            '<button type="button" class="cj-share-btn" data-action="share" hidden>' + ICONS.share + '<span>Share</span></button>' +
          '</div>' +
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
      width: 110,
      height: 110,
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

  function wireButtons(mount) {
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

  function init() {
    var mount = document.getElementById('cj-share');
    if (!mount) return;
    injectStyle();
    buildMarkup(mount);
    wireButtons(mount);
    loadQRLib(function () { renderQR(document.getElementById('cjShareQR')); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
