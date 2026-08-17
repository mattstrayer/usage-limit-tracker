# Publishing

## npm (this is what feeds the pi gallery)

```sh
npm login
npm publish            # package.json has publishConfig.access=public
```

Within a few minutes the package shows at https://pi.dev/packages (keyword `pi-package`).
Install: `pi install npm:pi-usage-limit-tracker` · `omp install npm:pi-usage-limit-tracker`

Bump `version` in package.json and re-run `npm publish` for updates. Tag the git commit (`git tag v0.1.0 && git push --tags`) so `pi install git:…@v0.1.0` pins work too.

## Gallery preview

`package.json#pi.image` points at `docs/screenshot.png` on GitHub `main`. Regenerate it after a
visual change: `npm run svg`, open `docs/demo.svg` in a browser at ~1.4x on a `#0d1117` background,
screenshot, crop. The README embeds `docs/demo.svg` directly (GitHub renders repo SVGs).

## GitHub

```sh
gh repo create mattstrayer/usage-limit-tracker --public --source=. --push
```
