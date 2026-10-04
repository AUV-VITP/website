# Team AUV | VIT Pune

Static site, no build step. Plain HTML, CSS and ES modules. three.js is loaded from a CDN only when the 3D section nears the viewport.

## Run locally

Serve over HTTP (not `file://`):

```bash
npx serve .
```

## Deploy

Import the repo on Vercel with the **Other** framework preset and leave build command and output directory empty. `vercel.json` sets caching headers.

## Layout

```
index.html
css/style.css
js/main.js      page interactions
js/viewer.js    three.js viewer (lazy loaded)
assets/         logos, favicon, isonavi-web.glb, brief PDF
scripts/        export_glb.py (CAD to coloured GLB), make_favicon.py
```

## Regenerate the 3D model

Needs the isonavi CAD repo and a Python env with `cadquery` and `trimesh` (WSL):

```bash
cd ~/dev/isonavi/cad && python /path/to/website/scripts/export_glb.py
```

Colours come from the CAD assembly. Do not run gltfpack with `-cc` on the output unless MeshoptDecoder is added to `js/viewer.js`.
