# Team AUV | VIT Pune

Static site, no build step. Plain HTML, CSS and ES modules. three.js is loaded from a CDN only when the 3D section nears the viewport.

## Run locally

Serve over HTTP (not `file://`):

```bash
npx serve public
```

## Deploy

Cloudflare Workers static assets. `wrangler.jsonc` serves `public/` and `public/_headers` sets caching. Every push to `main` redeploys. Build command stays empty, deploy command is `npx wrangler deploy`.

## Layout

```
public/              the deployed site
  index.html
  css/style.css
  js/main.js         page interactions
  js/viewer.js       three.js viewer (lazy loaded)
  assets/            logos, favicon, isonavi-web.glb, brief PDF
scripts/             export_glb.py (CAD to coloured GLB), make_favicon.py
wrangler.jsonc
```

## Regenerate the 3D model

Needs the isonavi CAD repo and a Python env with `cadquery` and `trimesh` (WSL):

```bash
cd ~/dev/isonavi/cad && python /path/to/website/scripts/export_glb.py
```

Colours come from the CAD assembly. Do not run gltfpack with `-cc` on the output unless MeshoptDecoder is added to `js/viewer.js`.
