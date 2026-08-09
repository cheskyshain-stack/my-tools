/* ============================================================================
   CJ Apps — shared Settings button
   ----------------------------------------------------------------------------
   Drop-in via a single tag: <script src="/assets/cj-settings.js" defer></script>
   Fully self-contained (injects its own CSS + markup) so it works the same
   on every page regardless of that page's own header layout or whether it
   links /assets/cj.css - no other setup needed.

   Currently ships one working feature: "Install this app", wired to the
   standard beforeinstallprompt flow. Each page already has its own Web App
   Manifest (name/icon/start_url), so this installs exactly the app you're
   currently on, not a generic "CJ Portal" shortcut.

   Deliberately does NOT include a light/dark theme toggle. Every page was
   just unified onto one dark theme - there's no second (light) palette
   built for most pages to toggle to, so a toggle here would either do
   nothing or need a decent amount of separate work per page. Left out
   rather than shipping something that looks broken.
   ============================================================================ */
(function(){
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    refreshInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    refreshInstallButton();
  });

  function refreshInstallButton(){
    const btn = document.getElementById("cjInstallBtn");
    const hint = document.getElementById("cjInstallHint");
    if (!btn) return;
    if (deferredPrompt){
      btn.hidden = false;
      if (hint) hint.hidden = true;
    } else {
      btn.hidden = true;
      if (hint) hint.hidden = false;
    }
  }

  function injectStyle(){
    const css = `
      .cj-settings-gear{
        position:fixed; top:max(8px,env(safe-area-inset-top)); right:max(8px,env(safe-area-inset-right));
        z-index:9999; width:38px; height:38px; border-radius:50%;
        background:rgba(16,22,34,.85); border:1px solid rgba(255,255,255,.12);
        color:#f8fafc; font-size:16px; line-height:1;
        display:grid; place-items:center; cursor:pointer; padding:0;
        box-shadow:0 8px 20px rgba(0,0,0,.35); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      }
      .cj-settings-gear:active{ transform:scale(.92); }
      .cj-settings-overlay{
        position:fixed; inset:0; z-index:10000;
        background:rgba(3,7,16,.6); backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
        opacity:0; pointer-events:none; transition:opacity .25s;
        font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
      }
      .cj-settings-overlay.open{ opacity:1; pointer-events:auto; }
      .cj-settings-sheet{
        position:absolute; left:0; right:0; bottom:0; max-width:480px; margin:0 auto;
        background:linear-gradient(180deg,#141c2a,#0d1420);
        border-top:1px solid rgba(255,255,255,.1); border-radius:22px 22px 0 0;
        padding:10px 22px calc(22px + env(safe-area-inset-bottom));
        transform:translateY(100%); transition:transform .35s cubic-bezier(.22,.9,.28,1);
        box-shadow:0 -20px 50px rgba(0,0,0,.5);
      }
      .cj-settings-overlay.open .cj-settings-sheet{ transform:none; }
      .cj-settings-grip{ width:38px; height:4px; border-radius:99px; background:rgba(255,255,255,.18); margin:8px auto 16px; }
      .cj-settings-sheet h2{ margin:0 0 16px; font-size:18px; font-weight:700; color:#f8fafc; }
      .cj-settings-btn{
        display:block; width:100%; height:48px; border-radius:14px; border:0;
        background:linear-gradient(135deg,#4c7df0,#2b4fb8); color:#fff; font-weight:700; font-size:14.5px;
        margin-bottom:10px; cursor:pointer;
      }
      .cj-settings-btn:active{ transform:scale(.98); }
      .cj-settings-hint{ margin:0 0 16px; color:#94a3b8; font-size:12.5px; line-height:1.55; }
      .cj-settings-close{
        display:block; width:100%; height:44px; border-radius:14px;
        border:1px solid rgba(255,255,255,.12); background:transparent;
        color:#94a3b8; font-weight:600; font-size:13.5px; cursor:pointer;
      }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildUI(){
    const gear = document.createElement("button");
    gear.className = "cj-settings-gear";
    gear.type = "button";
    gear.setAttribute("aria-label", "Settings");
    gear.textContent = "⚙️";
    document.body.appendChild(gear);

    const overlay = document.createElement("div");
    overlay.className = "cj-settings-overlay";
    overlay.innerHTML =
      '<div class="cj-settings-sheet" role="dialog" aria-label="Settings">' +
        '<div class="cj-settings-grip"></div>' +
        '<h2>Settings</h2>' +
        '<button type="button" id="cjInstallBtn" class="cj-settings-btn" hidden>📲 Install this app</button>' +
        '<p id="cjInstallHint" class="cj-settings-hint" hidden>Already installed, or your browser doesn\'t support installing it from here - on iPhone, use Safari\'s Share button → Add to Home Screen instead.</p>' +
        '<button type="button" class="cj-settings-close">Close</button>' +
      '</div>';
    document.body.appendChild(overlay);

    function open(){ overlay.classList.add("open"); refreshInstallButton(); }
    function close(){ overlay.classList.remove("open"); }

    gear.addEventListener("click", open);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".cj-settings-close").addEventListener("click", close);
    document.getElementById("cjInstallBtn").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try{ await deferredPrompt.userChoice; }catch(e){}
      deferredPrompt = null;
      refreshInstallButton();
    });

    // beforeinstallprompt can fire before this script finishes wiring up in
    // rare timing cases - if the hint is still showing "not available" but
    // we're mid-open, one more check now that the button exists.
    refreshInstallButton();
  }

  function init(){ injectStyle(); buildUI(); }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
