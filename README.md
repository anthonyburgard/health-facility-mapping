# GitHub Pages Geo Viewer

This repository is set up as a static Leaflet viewer for vector files and GeoTIFF rasters.

## How It Works

1. Put your geospatial files in `data/`.
2. Commit and push to GitHub.
3. Refresh your GitHub Pages site.
4. The viewer discovers files in `data/` and lets you load/unload each layer.

The app uses the public GitHub API to list repo files, then loads files directly from your GitHub Pages host.

## Supported Formats

- Vector: `.geojson`, `.geo.json`, `.json` (GeoJSON or TopoJSON), `.topojson`, `.kml`, `.gpx`, `.csv`, `.wkt`, `.zip` (shapefile bundle)
- Raster: `.tif`, `.tiff`

## GitHub Pages Setup

1. Push this repository to GitHub.
2. In repo settings, enable GitHub Pages:
   - Source: `Deploy from a branch`
   - Branch: `main` (or your default branch), folder `/ (root)`
3. Wait for deployment, then open the Pages URL.

## Optional Config

Edit `window.GEO_VIEWER_CONFIG` in [`index.html`](/Users/anthonyburgard/Desktop/Raster Viewer/index.html):

- `repo`: set to `"owner/repo"` if the site runs on a custom domain.
- `branch`: set explicitly if you do not want auto-detection.
- `dataRoot`: change from `"data"` if your geospatial folder has a different name.

## Local Preview

Do not open `index.html` directly with `file://` in your browser. In that mode, browsers usually block directory discovery and file loading.

Use a local web server instead:

```bash
cd /path/to/repo
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Notes

- Public GitHub API requests are rate-limited. If you refresh many times in a short period, file discovery can temporarily fail.
- Very large GeoTIFFs can be memory-intensive in a browser. If load is slow, prefer Cloud Optimized GeoTIFFs or smaller tiles.
