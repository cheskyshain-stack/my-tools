/* Pull down at the top of a page to reload it.

   The browser's own pull to refresh is off across this site: every page sets
   overscroll-behavior on html and body, which was asked for, and it is what
   keeps a scroll from rubber-banding the whole page around. Inside the portal
   the tool sits in an iframe, so even without that the gesture would have had
   to chain out to the shell to reach the browser. Rather than depend on either,
   the gesture is drawn here.

   It reloads the frame it runs in. In the portal that is the tool being looked
   at, not the shell around it, so the address stays where it was.

   Touch only: a mouse has a reload button. */
(function () {
  "use strict";

  if (!("ontouchstart" in window)) { return; }
  if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) { return; }
  if (document.documentElement.hasAttribute("data-no-refresh")) { return; }

  var TRIGGER = 68;    // px of pull, after resistance, that arms a reload
  var CAP = 116;       // the indicator stops travelling here
  var SLOP = 8;        // px before a drag counts as a pull at all
  var RESIST = 0.55;   // the finger moves further than the indicator does

  var tracking = false, pulling = false, armed = false, done = false;
  var startX = 0, startY = 0, dist = 0, host = null, dot = null;

  /* The scroller under the finger, which is not always the page: the shopping
     list and a day sheet are their own scrollers. A pull only starts when that
     one is already at its top. */
  function scrollerFor(node) {
    for (var el = node; el && el.nodeType === 1; el = el.parentElement) {
      if (el === document.body || el === document.documentElement) { break; }
      var oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) { return el; }
    }
    return document.scrollingElement || document.documentElement;
  }

  function offLimits(node) {
    for (var el = node; el && el.nodeType === 1; el = el.parentElement) {
      var tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) { return true; }
      if (el.getAttribute("role") === "dialog") { return true; }
    }
    return false;
  }

  function ensureUI() {
    if (host) { return; }
    var css = document.createElement("style");
    css.textContent =
      ".cj-refresh{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;" +
        "justify-content:center;pointer-events:none;opacity:0}" +
      ".cj-refresh-dot{width:38px;height:38px;margin-top:6px;border-radius:50%;" +
        "display:grid;place-items:center;color:#EDF2FF;" +
        "background:#1B2A4E;border:1px solid rgba(255,255,255,.14);" +
        "box-shadow:0 8px 22px rgba(0,0,0,.45)}" +
      ".cj-refresh-dot svg{width:19px;height:19px;display:block;transition:transform .16s ease}" +
      ".cj-refresh.is-armed .cj-refresh-dot svg{transform:rotate(180deg)}" +
      ".cj-refresh.is-going .cj-refresh-dot{animation:cj-refresh-spin .7s linear infinite}" +
      ".cj-refresh.is-going .cj-refresh-dot svg{opacity:.35}" +
      ".cj-refresh.is-easing{transition:transform .2s ease,opacity .2s ease}" +
      "@keyframes cj-refresh-spin{to{transform:rotate(360deg)}}" +
      "@media(prefers-reduced-motion:reduce){.cj-refresh.is-going .cj-refresh-dot{animation:none}}" +
      "@media print{.cj-refresh{display:none!important}}";
    document.head.appendChild(css);

    host = document.createElement("div");
    host.className = "cj-refresh";
    host.setAttribute("aria-hidden", "true");
    host.innerHTML =
      '<div class="cj-refresh-dot"><svg viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 4v13"/><path d="M6 12l6 6 6-6"/></svg></div>';
    document.body.appendChild(host);
    dot = host.firstChild;
  }

  function paint(d) {
    ensureUI();
    host.classList.remove("is-easing");
    host.style.transform = "translateY(" + (d - 44) + "px)";
    host.style.opacity = String(Math.min(1, d / 34));
    host.classList.toggle("is-armed", d >= TRIGGER);
  }

  function retract() {
    if (!host) { return; }
    host.classList.add("is-easing");
    host.style.transform = "translateY(-44px)";
    host.style.opacity = "0";
    host.classList.remove("is-armed");
  }

  function reset() { tracking = pulling = armed = false; dist = 0; }

  document.addEventListener("touchstart", function (e) {
    if (done || e.touches.length !== 1) { reset(); return; }
    var t = e.touches[0];
    if (offLimits(e.target)) { return; }
    if (scrollerFor(e.target).scrollTop > 0) { return; }
    tracking = true; pulling = false; armed = false; dist = 0;
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!tracking || done) { return; }
    if (e.touches.length !== 1) { reset(); retract(); return; }
    var t = e.touches[0];
    var dy = t.clientY - startY, dx = t.clientX - startX;

    /* Up is an ordinary scroll and sideways belongs to whatever the page does
       with a sideways flick, the calendar's month swipe among them. Either one
       ends the pull rather than competing with it. */
    if (!pulling) {
      if (dy < SLOP) { if (dy < -2 || Math.abs(dx) > SLOP) { tracking = false; } return; }
      if (Math.abs(dx) > dy) { tracking = false; return; }
      pulling = true;
    }
    if (dy <= 0) { pulling = false; tracking = false; retract(); return; }

    dist = Math.min(CAP, (dy - SLOP) * RESIST);
    armed = dist >= TRIGGER;
    paint(dist);
    if (e.cancelable) { e.preventDefault(); }   // no rubber-band underneath the pull
  }, { passive: false });

  function letGo() {
    if (!tracking) { return; }
    var go = pulling && armed;
    reset();
    if (!go) { retract(); return; }
    done = true;
    ensureUI();
    host.classList.add("is-easing");
    host.style.transform = "translateY(14px)";
    host.style.opacity = "1";
    host.classList.remove("is-armed");
    host.classList.add("is-going");
    setTimeout(function () { location.reload(); }, 120);
  }

  document.addEventListener("touchend", letGo, { passive: true });
  document.addEventListener("touchcancel", function () { reset(); retract(); }, { passive: true });
}());
