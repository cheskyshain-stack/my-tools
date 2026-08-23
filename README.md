# CJ Portal

The small web tools at **https://tools.cjaffa.com**: shopping list, QR codes, Braille,
stopwatch, chess, sudoku, tic-tac-toe, music, and a few private ones. Plain HTML, CSS and
JavaScript, one folder per tool, no backend and no build step.

## How it is published

GitHub Pages serves this repo from the `main` branch, root folder, and `CNAME` claims the
custom domain. Push to `main` and the site updates in about a minute. Nothing needs
uploading by hand.

At Cloudflare the `tools` record is a CNAME to `cheskyshain-stack.github.io` with the
proxy **off**, the grey cloud, so requests reach GitHub directly. Nothing should sit in
front of the domain: a Worker or Pages project attached to `tools.cjaffa.com` answers
before GitHub does and freezes the site on whatever copy it holds.

## Layout

- `index.html` is a shell that loads `/home/` in an iframe and keeps the address bar in
  step, so each tool runs in its own document.
- `home/index.html` is the portal page: the logo, the Music, Tools and Games tabs, and
  the grid of cards.
- Each tool has its own folder with `index.html`, `icon.png` and `manifest.json`.
- `assets/cj.css` is the shared look, linked after each page's own styles.

Some cards are hidden until the logo on the home page is clicked three times.

Working on it with Claude Code? Read `CLAUDE.md` first.
