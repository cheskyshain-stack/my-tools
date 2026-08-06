(() => {
  const tools = [
    { name: "Home", href: "/", icon: "⌂" },
    { name: "Shopping List", href: "/groceries/", icon: "🛒" },
    { name: "Budget Planner", href: "/budget/", icon: "$" },
    { name: "QwikPen Calculator", href: "/qwikpen/", icon: "✚" },
    { name: "Suno Music", href: "https://suno.com/@cshain", icon: "♫", external: true }
  ];

  const style = document.createElement("style");
  style.textContent = `
    :root{
      --ct-nav-bg:rgba(255,255,255,.94);
      --ct-nav-text:#111827;
      --ct-nav-muted:#6b7280;
      --ct-nav-line:rgba(148,163,184,.30);
      --ct-nav-accent:#4f46e5;
      --ct-nav-shadow:0 12px 30px rgba(15,23,42,.14);
    }

    .ct-nav-wrap{
      position:fixed;
      top:max(8px,env(safe-area-inset-top));
      left:max(8px,env(safe-area-inset-left));
      z-index:99999;
      display:flex;
      align-items:center;
      gap:7px;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    }

    .ct-nav-btn{
      height:38px;
      min-width:38px;
      border:1px solid var(--ct-nav-line);
      border-radius:12px;
      background:var(--ct-nav-bg);
      color:var(--ct-nav-text);
      box-shadow:var(--ct-nav-shadow);
      backdrop-filter:blur(14px);
      -webkit-backdrop-filter:blur(14px);
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:7px;
      padding:0 11px;
      text-decoration:none;
      font-size:13px;
      font-weight:800;
      cursor:pointer;
      user-select:none;
    }

    .ct-nav-btn:hover{
      border-color:rgba(79,70,229,.38);
      transform:translateY(-1px);
    }

    .ct-nav-menu{
      position:fixed;
      top:56px;
      left:max(8px,env(safe-area-inset-left));
      z-index:99998;
      width:min(310px,calc(100vw - 16px));
      border:1px solid var(--ct-nav-line);
      border-radius:16px;
      background:var(--ct-nav-bg);
      box-shadow:var(--ct-nav-shadow);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
      padding:8px;
      display:none;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    }

    .ct-nav-menu.open{display:block}

    .ct-nav-link{
      display:flex;
      align-items:center;
      gap:11px;
      min-height:46px;
      padding:10px 11px;
      border-radius:11px;
      color:var(--ct-nav-text);
      text-decoration:none;
      font-size:14px;
      font-weight:750;
    }

    .ct-nav-link:hover{background:rgba(99,102,241,.09)}

    .ct-nav-icon{
      width:29px;
      height:29px;
      flex:0 0 29px;
      display:grid;
      place-items:center;
      border-radius:9px;
      background:rgba(99,102,241,.10);
      color:var(--ct-nav-accent);
      font-weight:900;
    }

    .ct-nav-external{
      margin-left:auto;
      color:var(--ct-nav-muted);
      font-size:12px;
    }

    @media(max-width:520px){
      .ct-nav-label{display:none}
      .ct-nav-btn{padding:0 10px}
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
    if (history.length > 1) history.back();
    else location.href = "/";
  });

  const more = document.createElement("button");
  more.className = "ct-nav-btn";
  more.type = "button";
  more.innerHTML = `<span>☰</span><span class="ct-nav-label">More tools</span>`;

  wrap.append(home, back, more);

  const menu = document.createElement("div");
  menu.className = "ct-nav-menu";

  tools.forEach(tool => {
    const a = document.createElement("a");
    a.className = "ct-nav-link";
    a.href = tool.href;
    if (tool.external) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.innerHTML = `
      <span class="ct-nav-icon">${tool.icon}</span>
      <span>${tool.name}</span>
      ${tool.external ? '<span class="ct-nav-external">↗</span>' : ''}
    `;
    menu.appendChild(a);
  });

  more.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !more.contains(e.target)) {
      menu.classList.remove("open");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu.classList.remove("open");
  });

  document.body.append(wrap, menu);
})();