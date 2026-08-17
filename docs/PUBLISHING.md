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

`package.json#pi.image` points at `docs/screenshot.png` on GitHub `main`. Add a PNG of the widget
in the terminal at that path (any size; PNG/JPEG/GIF/WebP). Or set `pi.video` to an MP4 URL.

## GitHub

```sh
gh repo create mattstrayer/usage-limit-tracker --public --source=. --push
```
