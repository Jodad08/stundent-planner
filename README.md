# GatorGraph website (GitHub Pages)

This branch (`gh-pages`) holds only the static marketing site and a copy of the planner. The app's source lives on
`claude/optimistic-babbage-loeauu`.

```
index.html          the landing page
assets/theme.css    ALL colors and fonts (edit this to re-skin the site)
assets/site.css     layout and components (no colors in here)
assets/site.js      nav menu, feature tabs, scroll reveal
assets/img/         product screenshots (made-up sample student, no real data)
assets/favicon.svg  tab icon (its colors are hard-coded; edit them by hand if you re-brand)
app/index.html      the planner itself, a single self-contained file (engine only, no server)
.nojekyll           tells GitHub Pages to serve the files as they are
```

## Publish it

1. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Choose branch **`gh-pages`**, folder **`/ (root)`**, then **Save**.
3. After a minute the site is at `https://jodad08.github.io/stundent-planner/`. The planner is at `/app/`.

GitHub Pages on a free account needs a public repository.

## Change the colors

Open `assets/theme.css`:

- **Re-skin:** change `--brand` (buttons, links, the purple band) and `--accent` (badges, the highlight under the
  headline). Set `--brand-contrast` and `--accent-contrast` to colors that are readable on top of them.
- **Neutrals:** `--bg`, `--surface`, `--ink`, `--text`, `--muted`, `--line`.
- **Presets:** add `data-theme="midnight"` or `data-theme="ocean"` to the `<html>` tag in `index.html`. Add your
  own preset at the bottom of `theme.css` the same way.

Check that no color crept into the other files:

```
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' assets/site.css index.html | grep -v 'href="#'
```

That should print nothing.

## Update the planner copy

From the app branch, rebuild the single-file planner and copy it here:

```
git checkout claude/optimistic-babbage-loeauu
python3 web/make_data.py && python3 web/bundle.py
git checkout gh-pages
git show claude/optimistic-babbage-loeauu:web/dist/gatorgraph.html > app/index.html
git add app/index.html && git commit -m "Update planner" && git push
```

(Commit the rebuilt `web/dist/gatorgraph.html` on the app branch first, so `git show` picks up the new version.)

## Preview locally

```
python3 -m http.server 8000      # then open http://localhost:8000
```
