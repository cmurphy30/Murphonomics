# Murphonomics — Project CLAUDE.md

## What This Project Is
A personal economics blog and website at murphonomics.com. Built with vanilla HTML, CSS, and JavaScript — no front-end frameworks, no build tools, no front-end package manager.

## File Structure
- `index.html` — homepage (hero animation, About section, 3D economy stage, monthly AI summary + Substack)
- `dashboard.html` — dashboard page (bento grid of live economic charts)
- `market-updates.html` — archive of monthly AI summaries
- `books.html` — books and podcasts page
- `about.html` — about page (text is written directly in the HTML; the homepage About section loads its `.about-card` at runtime)
- `economic-blog/substack.html` — Substack page
- `css/styles.css` — all site styles (design tokens are CSS variables in `:root`)
- `js/script.js` — main JavaScript (includes the hero animation: `initHeroAnimation` / `startHeroCanvas`)
- `js/cache.js` — localStorage cache helpers
- `js/data-service.js` — fetches FRED/BLS/BEA data and the monthly summary
- `js/snapshot.js` — builds the charts and renders the summary (skips anything not on the current page)
- `js/home-about.js` — injects the About card on the homepage and reveals it on scroll
- `js/substack-page.js` — Substack page script
- `netlify/functions/` — serverless functions: `fred-data.js`, `bls-data.js`, `bea-data.js`, `economic-summary.js`, `get-summaries.js`
- `images/` — book and podcast cover images
- `economic-blog/STYLE_GUIDE.md` — design system (colors, fonts, spacing)

## Tech Rules
- No front-end frameworks, libraries, or npm packages. The only external front-end library is Chart.js, loaded from a CDN (jsDelivr) on `index.html` and `dashboard.html`.
- No build steps. Files are served directly as-is.
- Front-end changes are plain HTML, CSS, or vanilla JavaScript only.
- JS and CSS files are cache-busted with `?v=` query strings on their `<script>`/`<link>` tags.

## Design System
Before making any visual change (colors, fonts, spacing, layout), read `economic-blog/STYLE_GUIDE.md` first. It is the source of truth. Do not invent new colors or fonts — use only what is defined there.

## Deployment
The site is hosted on Netlify (see `netlify.toml`) and deploys when changes are pushed to `main` on GitHub (`cmurphy30/Murphonomics`). Netlify serves the repo root as-is, so every file in this folder is publicly reachable.
- Serverless functions live in `netlify/functions/` and need API keys set as Netlify environment variables (see `.env.example`).
- Monthly AI summaries are stored in Netlify Blobs (store `summaries`, key `summary-YYYY-MM`). The first request of each month generates one summary; everyone sees that same summary until the next month.

## Common Task Types
- Adding or editing content (posts, text, images)
- Styling changes (always reference STYLE_GUIDE.md)
- New pages or features (new `.html` files following existing patterns)
- Bug fixes (HTML/CSS/JS only)

## Before Starting Any Task
1. Read the relevant file(s) before suggesting changes.
2. For visual work, read `economic-blog/STYLE_GUIDE.md`.
3. If adding a new page, look at an existing page first to match structure and patterns.

## Efficiency Rules (Token Conservation)
- **No pre-task summaries.** For simple, clearly-scoped tasks, skip the plan and make the change directly.
- **No post-task summaries.** Do not explain what was changed after completing it — the user can see the diff.
- **Read only what's needed.** Use targeted reads (specific line ranges) rather than reading entire files. Do not speculatively read files that may not be relevant.
- **Do not re-read files already read in the session** unless the file may have changed.
- **Prefer Edit over rewrite.** Use targeted edits rather than rewriting entire files.
- **Keep responses short.** One sentence of context is enough. Lead with the action.
- **No confirmations for reversible changes.** Simple edits (text, colors, spacing) do not need approval before proceeding — just make the change and show the result.

## 3D redesign rules (branch feature/3d-economy)
- Never commit to main. One commit per completed prompt.
- No new libraries (no Three.js, no npm packages in the front end). The 3D is raw WebGL in vanilla JS.
- Colors/fonts: use only the CSS variables in :root. No new colors. Other pages (market-updates, books, about) must look identical.
- Do not edit economic-summary.js, get-summaries.js, or the hero animation (initHeroAnimation / startHeroCanvas) unless a prompt says so.
- Charts keep working exactly as today. Chart panel markup lives statically in the arm dropdowns on index.html and in the bento grid on dashboard.html (same ids, one page each). Never re-create chart instances.
- Whenever you edit a CSS/JS file, bump its ?v= query string in every HTML file that loads it.
- Respect prefers-reduced-motion. All interactive elements keyboard reachable.
- If a prompt conflicts with what you find in the code, STOP and ask.
- Finish each prompt with a verification note of 8 lines or fewer.
