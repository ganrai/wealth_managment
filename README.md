# Wealth Dashboard

A responsive, card-based dashboard for CAS statements, family investments, education goals and retirement planning. The five screens follow the supplied blue-and-white design. The welcome page links to desktop previews and every screen.

## Run locally

Use Node 24 (version in `.nvmrc`) and Python 3.12:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm start
```

Open the locally served `index.html`, or go directly to `upload.html`. The server uses port 8000. There is no application backend. Do not open pages as `file://` URLs: local PDF modules and session state require an HTTP origin.

`npm run build` creates local PDF dependencies and regenerates HTML from `build_pages.py`. Edit that generator for page markup, `css/styles.css` for the shared theme, and `js/` for behavior. Commit the generator and resulting HTML together. `node_modules/` and generated `js/vendor/` are ignored; run the build before serving or deploying a fresh checkout. Any static host can serve the built directory; it must include `js/vendor/` and its assets/license files. This repository does not automatically publish a website.

## Using statements

Select one or more CAS PDFs and enter their common password. The existing CAS parser and PDF.js run locally in the browser. The redesigned pages show processed holdings, gains, categories, owner splits and configured education goals. Upload complete, non-overlapping statements to avoid counting the same holdings twice.

Only processed holdings are kept in `sessionStorage` so they survive navigation between pages in the same browser tab. Raw PDFs and passwords are never saved. Close the tab or use **Clear data** to remove holdings. The dashboard does not send statements to a backend. PDF libraries are bundled locally; no external CDN is needed while using the dashboard.

Until a statement is imported, the pages are clearly marked as **sample data**. Sample names and figures come from the supplied design and are illustrative. The live overview includes non-liquid portfolio and education holdings; portfolio excludes education holdings. Configured liquid folios are excluded from these five screens. Education assignments and targets retain the original folio-based configuration in `js/data.js`; unmatched holdings remain in Portfolio.

The retirement planner is an independent scenario model. Its editable assumptions, growth scenarios, inflation-adjusted retirement expenses and projected corpus are estimates, not a guarantee. Importing CAS data does not silently change retirement assumptions.

## Browser checks and previews

```sh
python3 -m pip install -r requirements-dev.txt
# If Chromium is not installed, install the Playwright browser:
python3 -m playwright install chromium
npm test
npm run previews
```

Set `CHROMIUM_PATH` when using a different installed Chromium executable. Browser checks start and stop their own local server. They cover all six pages at desktop/mobile sizes, missing assets, upload validation, local PDF libraries/worker, goal selection, retirement scenarios and synthetic holdings across page navigation. Preview images are saved under `assets/screenshots/` and displayed on the welcome page.

The invalid-PDF check verifies the parser failure path. A representative password-protected CAS has not been supplied, so successful parsing of a real statement still needs to be verified with your own file. No real statements or passwords are included in the repository.
