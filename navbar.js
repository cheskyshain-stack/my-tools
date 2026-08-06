(() => {
  const style = document.createElement("style");

  style.textContent = `
    .ct-nav-wrap{
      position:fixed;
      left:max(10px, env(safe-area-inset-left));
      bottom:max(10px, env(safe-area-inset-bottom));
      z-index:99999;
      display:flex;
      gap:8px;
      font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    }

    .ct-nav-btn{
      height:40px;
      border:1px solid rgba(148,163,184,.35);
      border-radius:12px;
      background:rgba(255,255,255,.94);
      color:#111827;
      box-shadow:0 10px 24px rgba(15,23,42,.14);
      backdrop-filter:blur(14px);
      -webkit-backdrop-filter:blur(14px);
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:7px;
      padding:0 13px;
      text-decoration:none;
      font-size:13px;
      font-weight:800;
      cursor:pointer;
    }

    .ct-nav-btn:active{
      transform:scale(.97);
    }

    @media(max-width:500px){
      .ct-nav-label{
        display:none;
      }

      .ct-nav-btn{
        width:42px;
        padding:0;
      }
    }
  `;

  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "ct-nav-wrap";

  const home = document.createElement("a");
  home.className = "ct-nav-btn";
  home.href = "/";
  home.innerHTML = `<span>⌂</span><span class="ct-nav-label">Home</span>`;

  const back = document.createElement("button");
  back.className = "ct-nav-btn";
  back.type = "button";
  back.innerHTML = `<span>←</span><span class="ct-nav-label">Back</span>`;
  back.addEventListener("click", () => {
    if (history.length > 1) {
      history.back();
    } else {
      location.href = "/";
    }
  });

  wrap.append(home, back);
  document.body.appendChild(wrap);
})();
