# PlanEd website (GitHub Pages)

This branch (`gh-pages`) holds only the static marketing site for PlanEd. The app lives on `gatorgraph-build`; its
screenshots and colors come from there. The app needs its Node server, so the site's "Get PlanEd" buttons link to
the run instructions in that branch's README.

```
index.html          the landing page
assets/theme.css    ALL colors and fonts (edit this to re-skin the site)
assets/site.css     layout and components (no colors in here)
assets/site.js      nav menu, feature tabs, scroll reveal
assets/img/         PlanEd screenshots (made-up student "Alex", no real data)
assets/favicon.svg  tab icon (its colors are hard-coded; edit them by hand if you re-brand)
.nojekyll           tells GitHub Pages to serve the files as they are
```

## Publish it

1. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Choose branch **`gh-pages`**, folder **`/ (root)`**, then **Save**.
3. After a minute the site is at `https://jodad08.github.io/stundent-planner/`.

GitHub Pages on a free account needs a public repository.

## Change the colors

Open `assets/theme.css`:

- **Re-skin:** change `--brand` (gold buttons, selected tab, "Ed" in the logo), `--link` (links and small colored
  text; keep it dark enough to read on white), `--accent` (lime numbers on the black band) and `--brand-deep` (the
  black band). The current values match the PlanEd app.
- **Feature colors:** `--c1` … `--c6` color the eyebrows, icons and steps; `--fill-*` are the app's card colors.
- **Neutrals:** `--bg`, `--surface`, `--ink`, `--text`, `--muted`, `--line`.
- **Presets:** add `data-theme="midnight"` or `data-theme="ocean"` to the `<html>` tag in `index.html`. Add your
  own preset at the bottom of `theme.css` the same way.

Check that no color crept into the other files:

```
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' assets/site.css index.html | grep -v 'href="#'
```

That should print nothing.

## Update the screenshots

Run PlanEd from `gatorgraph-build` (`npm install && npm run build && npm start`, then http://localhost:3000), use a
made-up student, and replace the files in `assets/img/` with screenshots at the same names. Keep the `width` and
`height` attributes in `index.html` equal to the new image sizes.

## Preview locally

```
python3 -m http.server 8000      # then open http://localhost:8000
```
