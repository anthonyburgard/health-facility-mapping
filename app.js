// ── PMTiles protocol registration ──────────────────────────────────────────
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// ── Basemaps ───────────────────────────────────────────────────────────────
const BASEMAPS = {
  positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark:     "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  osm:      "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  topo:     "https://demotiles.maplibre.org/style.json",
};

// ── Map init ───────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: "map",
  style: BASEMAPS.positron,
  center: [100, 15],
  zoom: 4,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

// ── State ──────────────────────────────────────────────────────────────────
let layers = [];
let layerCounter = 0;
let inspectEnabled = true;
let vectorOpacity = 1;
let selectedCountry = null;

// ── Tabs ───────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  if (tab === "viewer") updateDashboard();
}
document.getElementById("tab-bar").addEventListener("click", e => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

// ── Sidebar toggle ─────────────────────────────────────────────────────────
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebar = document.getElementById("sidebar");
sidebarToggle.addEventListener("click", () => {
  const collapsed = sidebar.classList.toggle("collapsed");
  sidebarToggle.textContent = collapsed ? "‹" : "›";
  sidebarToggle.style.left = collapsed ? "0" : "var(--panel-w)";
  setTimeout(() => map.resize(), 260);
});

// ── Coords bar ─────────────────────────────────────────────────────────────
map.on("mousemove", e => {
  document.getElementById("coords-lng").textContent = `Lng: ${e.lngLat.lng.toFixed(5)}`;
  document.getElementById("coords-lat").textContent = `Lat: ${e.lngLat.lat.toFixed(5)}`;
});
map.on("zoom", () => {
  document.getElementById("coords-zoom").textContent = `Zoom: ${map.getZoom().toFixed(1)}`;
});
map.on("load", () => {
  document.getElementById("coords-zoom").textContent = `Zoom: ${map.getZoom().toFixed(1)}`;
});

// ── Close feature popup on map background click ────────────────────────────
map.on("click", e => {
  const features = map.queryRenderedFeatures(e.point);
  const userFeature = features.some(f => layers.some(l => l.layerIds.includes(f.layer.id)));
  if (!userFeature) document.getElementById("feature-panel").classList.remove("visible");
});

// ── Toast helpers ──────────────────────────────────────────────────────────
let loadingTimer;
function showLoading(msg = "Loading…") {
  const t = document.getElementById("loading-toast");
  t.textContent = msg;
  t.classList.add("show");
}
function hideLoading() {
  document.getElementById("loading-toast").classList.remove("show");
}
function showError(msg, duration = 4000) {
  const t = document.getElementById("error-toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => t.classList.remove("show"), duration);
  hideLoading();
}

// ── Country bounding boxes ─────────────────────────────────────────────────
const COUNTRIES = [
  { name: "Afghanistan",                    bbox: [60.5, 29.4, 75.0, 38.5] },
  { name: "Armenia",                        bbox: [43.4, 38.8, 46.6, 41.3] },
  { name: "Australia",                      bbox: [113.3, -43.6, 153.6, -10.7] },
  { name: "Azerbaijan",                     bbox: [44.8, 38.4, 50.4, 41.9] },
  { name: "Bangladesh",                     bbox: [88.0, 20.7, 92.7, 26.6] },
  { name: "Bhutan",                         bbox: [88.7, 26.7, 92.1, 28.3] },
  { name: "Brunei Darussalam",              bbox: [114.1, 4.0, 115.4, 5.1] },
  { name: "Cambodia",                       bbox: [102.3, 10.4, 107.6, 14.7] },
  { name: "China",                          bbox: [73.5, 18.2, 134.8, 53.6] },
  { name: "Cook Islands",                   bbox: [-166.0, -21.9, -157.3, -8.9] },
  { name: "Federated States of Micronesia", bbox: [137.4, 0.9, 163.1, 10.1] },
  { name: "Fiji",                           bbox: [177.1, -19.2, 180.0, -16.0] },
  { name: "Georgia",                        bbox: [40.0, 41.1, 46.7, 43.6] },
  { name: "Hong Kong",                      bbox: [113.8, 22.1, 114.4, 22.6] },
  { name: "India",                          bbox: [68.1, 8.0, 97.4, 37.1] },
  { name: "Indonesia",                      bbox: [95.0, -10.9, 141.0, 5.9] },
  { name: "Japan",                          bbox: [129.4, 31.0, 145.8, 45.5] },
  { name: "Kazakhstan",                     bbox: [50.3, 40.6, 87.3, 55.4] },
  { name: "Kiribati",                       bbox: [172.9, -4.7, 180.0, 4.7] },
  { name: "Kyrgyz Republic",                bbox: [69.3, 39.2, 80.3, 43.2] },
  { name: "Lao PDR",                        bbox: [100.1, 13.9, 107.6, 22.5] },
  { name: "Malaysia",                       bbox: [99.6, 0.9, 119.3, 7.4] },
  { name: "Maldives",                       bbox: [72.6, -0.7, 73.8, 7.1] },
  { name: "Marshall Islands",               bbox: [160.8, 4.6, 172.0, 14.6] },
  { name: "Mongolia",                       bbox: [87.8, 41.6, 119.9, 52.1] },
  { name: "Myanmar",                        bbox: [92.2, 9.8, 101.2, 28.5] },
  { name: "Nauru",                          bbox: [166.9, -0.55, 167.0, -0.40] },
  { name: "Nepal",                          bbox: [80.1, 26.4, 88.2, 30.4] },
  { name: "New Zealand",                    bbox: [165.9, -47.3, 178.6, -34.4] },
  { name: "Niue",                           bbox: [-170.1, -19.2, -169.8, -18.9] },
  { name: "Pakistan",                       bbox: [60.9, 23.6, 77.8, 37.1] },
  { name: "Palau",                          bbox: [134.1, 2.8, 134.7, 8.1] },
  { name: "Papua New Guinea",               bbox: [141.0, -10.7, 155.6, -1.3] },
  { name: "Philippines",                    bbox: [116.9, 4.6, 126.6, 20.9] },
  { name: "Republic of Korea",              bbox: [126.1, 34.0, 129.6, 38.6] },
  { name: "Samoa",                          bbox: [-172.8, -14.1, -171.4, -13.4] },
  { name: "Singapore",                      bbox: [103.6, 1.2, 104.0, 1.5] },
  { name: "Solomon Islands",                bbox: [155.5, -10.8, 162.7, -6.6] },
  { name: "Sri Lanka",                      bbox: [79.7, 5.9, 81.9, 9.8] },
  { name: "Taipei, China",                  bbox: [120.0, 21.9, 122.0, 25.3] },
  { name: "Tajikistan",                     bbox: [67.4, 36.7, 75.2, 40.8] },
  { name: "Thailand",                       bbox: [97.3, 5.6, 105.7, 20.5] },
  { name: "Timor-Leste",                    bbox: [124.0, -9.5, 127.3, -8.1] },
  { name: "Tonga",                          bbox: [-176.2, -22.3, -173.9, -15.6] },
  { name: "Türkiye",                        bbox: [25.7, 35.8, 44.8, 42.1] },
  { name: "Turkmenistan",                   bbox: [52.4, 35.1, 66.7, 42.8] },
  { name: "Tuvalu",                         bbox: [176.1, -9.4, 179.9, -5.7] },
  { name: "Uzbekistan",                     bbox: [55.9, 37.2, 73.2, 45.6] },
  { name: "Vanuatu",                        bbox: [166.5, -20.2, 170.2, -13.1] },
  { name: "Viet Nam",                       bbox: [102.1, 8.6, 109.5, 23.4] },
];

const sel = document.getElementById("country-select");
COUNTRIES.forEach(c => {
  const opt = document.createElement("option");
  opt.value = c.name;
  opt.textContent = c.name;
  sel.appendChild(opt);
});

sel.addEventListener("change", async () => {
  const c = COUNTRIES.find(x => x.name === sel.value);
  selectedCountry = c || null;
  if (!c) {
    if (map.getSource("country-highlight")) {
      map.getSource("country-highlight").setData({ type: "FeatureCollection", features: [] });
    }
    updateDashboard();
    return;
  }
  map.fitBounds([[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]], { padding: 40, duration: 900, maxZoom: 12 });
  map.once("moveend", updateDashboard);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(c.name)}&polygon_geojson=1&format=json&limit=1&featuretype=country`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const geom = data[0]?.geojson;
    if (geom && map.getSource("country-highlight")) {
      map.getSource("country-highlight").setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: geom, properties: {} }]
      });
    }
  } catch (_) { /* silently skip if offline */ }
});

// ── Dashboard ──────────────────────────────────────────────────────────────
function updateDashboard() {
  const body = document.getElementById("dashboard-body");
  if (layers.length === 0) {
    body.innerHTML = `<div class="dash-empty">Load a layer to see stats</div>`;
    return;
  }

  const bbox = selectedCountry?.bbox ?? null;
  const mapBounds = map.getBounds();

  const inBounds = ([lng, lat]) => bbox
    ? lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
    : mapBounds.contains([lng, lat]);

  const layerData = layers.filter(l => l.visible && l.type !== "raster").map(l => {
    let features = [];
    if (l.type === "geojson") {
      const src = map.getSource(l.sourceId);
      if (src?._data?.features) {
        features = src._data.features.filter(f => f.geometry && flatCoords(f.geometry).some(inBounds));
      }
    } else if (l.type === "vector") {
      const rendered = map.queryRenderedFeatures(undefined, { layers: l.layerIds.filter(id => map.getLayer(id)) });
      const seen = new Set();
      rendered.forEach(f => {
        const key = f.id ?? JSON.stringify(f.properties);
        if (!seen.has(key)) { seen.add(key); features.push(f); }
      });
    }
    // Exclude hidden categories from count
    if (l.style?.categorizeBy && l.hiddenCategories?.size > 0) {
      const prop = l.style.categorizeBy;
      features = features.filter(f => !l.hiddenCategories.has(String((f.properties ?? {})[prop] ?? "—")));
    }
    return { layer: l, features };
  });

  const grandTotal = layerData.reduce((s, { features }) => s + features.length, 0);
  const scope = selectedCountry ? `in ${selectedCountry.name}` : "in view";

  let html = `<div class="dash-total">
    ${grandTotal.toLocaleString()}
    <span class="dash-total-label">${scope}</span>
  </div>`;

  layerData.forEach(({ layer: l, features }) => {
    const count = features.length;
    const shortName = l.name.length > 20 ? l.name.slice(0, 18) + "…" : l.name;
    html += `<div class="dash-row">
      <span class="dash-name" title="${l.name}">${shortName}</span>
      <span class="dash-count">${count.toLocaleString()}</span>
    </div>`;

    if (l.style?.categorizeBy && l.style?.categoryColors) {
      const colorMap = l.style.categoryColors;
      const hidden = l.hiddenCategories ?? new Set();
      const pills = Object.entries(colorMap).map(([val, color]) =>
        `<button class="cat-pill${hidden.has(val) ? " off" : ""}" data-layer="${l.id}" data-val="${CSS.escape ? val : val.replace(/"/g, '&quot;')}" style="--pill-color:${color}">${val}</button>`
      ).join("");
      html += `<div class="cat-pills">${pills}</div>`;
    }
  });

  body.innerHTML = html;
}

document.getElementById("dashboard-body").addEventListener("click", e => {
  const pill = e.target.closest(".cat-pill");
  if (!pill) return;
  const layer = layers.find(l => l.id === pill.dataset.layer);
  if (!layer) return;
  const val = pill.dataset.val;
  if (layer.hiddenCategories.has(val)) layer.hiddenCategories.delete(val);
  else layer.hiddenCategories.add(val);
  applyLayerFilter(layer);
  updateDashboard();
});

function flatCoords(geom) {
  const out = [];
  const walk = c => Array.isArray(c[0]) ? c.forEach(walk) : out.push(c);
  walk(geom.coordinates || []);
  return out;
}

map.on("moveend", updateDashboard);

// ── Categorization helpers ─────────────────────────────────────────────────
const CAT_PALETTE = [
  "#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f",
  "#edc948","#b07aa1","#ff9da7","#9c755f","#bab0ac",
  "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
  "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
];
const MAX_CATS = 20;

function getLayerProperties(layer) {
  const props = {};
  const collect = feature => {
    if (!feature.properties) return;
    Object.entries(feature.properties).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (!props[k]) props[k] = new Map();
      const s = String(v);
      props[k].set(s, (props[k].get(s) || 0) + 1);
    });
  };
  if (layer.type === "geojson" && layer._geojsonData) {
    (layer._geojsonData.features || []).forEach(collect);
  } else if (layer.type === "vector") {
    const ids = layer.layerIds.filter(id => map.getLayer(id));
    map.queryRenderedFeatures(undefined, { layers: ids }).forEach(collect);
  }
  return Object.fromEntries(
    Object.entries(props).filter(([, m]) => m.size >= 2 && m.size <= MAX_CATS)
  );
}

function buildMatchExpr(prop, colorMap, fallback) {
  const expr = ["match", ["get", prop]];
  Object.entries(colorMap).forEach(([val, color]) => { expr.push(val, color); });
  expr.push(fallback);
  return expr;
}

function applyCategorization(layer) {
  const s = layer.style;
  if (!s.categorizeBy || !s.categoryColors) {
    applyLayerStyle(layer);
    return;
  }
  const prop = s.categorizeBy;
  const colorMap = s.categoryColors;
  const fallback = "#cccccc";
  const matchExpr = buildMatchExpr(prop, colorMap, fallback);

  layer.layerIds.forEach(lid => {
    if (!map.getLayer(lid)) return;
    const t = map.getLayer(lid).type;
    if (t === "fill") {
      map.setPaintProperty(lid, "fill-color", matchExpr);
      map.setPaintProperty(lid, "fill-opacity", s.fillOpacity);
    } else if (t === "line") {
      map.setPaintProperty(lid, "line-color", matchExpr);
      map.setPaintProperty(lid, "line-width", s.strokeWidth);
      map.setPaintProperty(lid, "line-opacity", s.opacity);
    } else if (t === "circle") {
      map.setPaintProperty(lid, "circle-color", matchExpr);
      map.setPaintProperty(lid, "circle-radius", s.pointRadius);
      map.setPaintProperty(lid, "circle-opacity", s.opacity);
    }
  });
}

function applyLayerFilter(layer) {
  if (!layer.style?.categorizeBy) return;
  const prop = layer.style.categorizeBy;
  const hidden = [...(layer.hiddenCategories ?? [])];
  layer.layerIds.forEach(lid => {
    if (!map.getLayer(lid)) return;
    const base = layer._baseFilters?.[lid] ?? null;
    const hideFilter = hidden.length > 0 ? ["!", ["in", ["get", prop], ["literal", hidden]]] : null;
    const combined = base && hideFilter ? ["all", base, hideFilter] : hideFilter ?? base ?? null;
    map.setFilter(lid, combined);
  });
}

function setCategorizeBy(layer, prop) {
  if (!prop) {
    layer.style.categorizeBy = null;
    layer.style.categoryColors = null;
    layer.hiddenCategories = new Set();
    applyLayerFilter(layer);
    applyLayerStyle(layer);
    renderLayers();
    return;
  }
  const allProps = getLayerProperties(layer);
  const valMap = allProps[prop];
  if (!valMap) return;
  const colorMap = {};
  let i = 0;
  valMap.forEach((count, val) => { colorMap[val] = CAT_PALETTE[i++ % CAT_PALETTE.length]; });
  layer.style.categorizeBy = prop;
  layer.style.categoryColors = colorMap;
  layer.style.catValueCounts = Object.fromEntries(valMap);
  layer.hiddenCategories = new Set();
  applyCategorization(layer);
  applyLayerFilter(layer);
  renderLayers();
}

// ── Layer style state ──────────────────────────────────────────────────────
let activeStyleId = null;

function defaultStyle(hue) {
  return { color: hslToHex(hue, 65, 50), opacity: 0.85, strokeWidth: 1.5, pointRadius: 5, fillOpacity: 0.35 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function applyLayerStyle(layer) {
  const s = layer.style;
  layer.layerIds.forEach(lid => {
    if (!map.getLayer(lid)) return;
    const t = map.getLayer(lid).type;
    if (t === 'fill') {
      map.setPaintProperty(lid, 'fill-color', s.color);
      map.setPaintProperty(lid, 'fill-opacity', s.fillOpacity);
    } else if (t === 'line') {
      map.setPaintProperty(lid, 'line-color', s.color);
      map.setPaintProperty(lid, 'line-opacity', s.opacity);
      map.setPaintProperty(lid, 'line-width', s.strokeWidth);
    } else if (t === 'circle') {
      map.setPaintProperty(lid, 'circle-color', s.color);
      map.setPaintProperty(lid, 'circle-opacity', s.opacity);
      map.setPaintProperty(lid, 'circle-radius', s.pointRadius);
      map.setPaintProperty(lid, 'circle-stroke-color', 'white');
      map.setPaintProperty(lid, 'circle-stroke-width', 1.5);
    } else if (t === 'raster') {
      map.setPaintProperty(lid, 'raster-opacity', s.opacity);
    }
  });
}

// ── Render sidebar layers ──────────────────────────────────────────────────
function renderLayers() {
  const sec = document.getElementById("layers-section");
  if (layers.length === 0) {
    sec.innerHTML = `<div id="empty-state">No layers loaded.<br>Drop a file or enter a URL above.</div>`;
    return;
  }
  sec.innerHTML = `<div class="section-label">Layers</div>` + layers.slice().reverse().map(l => {
    const s = l.style || {};
    const isOpen = activeStyleId === l.id;
    const metaText = l.type === 'geojson'
      ? (l.sublayerCount + " feature" + (l.sublayerCount !== 1 ? "s" : ""))
      : (l.sublayerCount ? l.sublayerCount + " sublayer" + (l.sublayerCount>1?"s":"") : "loading…");

    let editorRows = '';
    if (l.type !== 'raster') {
      const allProps = activeStyleId === l.id ? getLayerProperties(l) : {};
      const propNames = Object.keys(allProps);
      const curCat = l.style?.categorizeBy || '';
      const catOptions = [`<option value="">— solid color —</option>`,
        ...propNames.map(p => `<option value="${p}" ${p===curCat?'selected':''}>${p}</option>`)
      ].join('');

      if (!curCat) {
        editorRows = `
          <div class="se-row">
            <span class="se-label">Color</span>
            <input type="color" class="se-color" data-prop="color" data-id="${l.id}" value="${s.color||'#3b82f6'}">
            <span class="se-swatch" style="background:${s.color||'#3b82f6'}"></span>
          </div>
          <div class="se-row" style="margin-top:4px">
            <span class="se-label">Categorize</span>
            <select class="se-select" data-action="categorize" data-id="${l.id}" style="grid-column:2/4">${catOptions}</select>
          </div>`;
      } else {
        const colorMap = l.style.categoryColors || {};
        const counts = l.style.catValueCounts || {};
        const catRows = Object.entries(colorMap).map(([val, color]) =>
          `<div class="cat-edit-row">
            <input type="color" class="se-color cat-color-inp" data-catid="${l.id}" data-catval="${val}" value="${color}" style="width:28px;height:22px;padding:1px 2px;flex-shrink:0">
            <span class="cat-label" title="${val}">${val}</span>
            <span class="cat-count">${counts[val]||''}</span>
          </div>`
        ).join('');
        editorRows = `
          <div class="se-row">
            <span class="se-label">Categorize</span>
            <select class="se-select" data-action="categorize" data-id="${l.id}" style="grid-column:2/4">${catOptions}</select>
          </div>
          <div class="cat-edit-list">${catRows}</div>`;
      }
    } else {
      editorRows = `
        <div class="se-row">
          <span class="se-label">Opacity</span>
          <input type="range" class="se-range" data-prop="opacity" data-id="${l.id}" min="0" max="1" step="0.05" value="${s.opacity??0.85}">
          <span class="se-value">${Math.round((s.opacity??0.85)*100)}%</span>
        </div>`;
    }

    return `
    <div class="layer-item" data-id="${l.id}">
      <div class="layer-vis ${l.visible ? 'on' : ''}" data-action="toggle" data-id="${l.id}">
        <svg viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="1.5" fill="none"/></svg>
      </div>
      <div class="layer-info">
        <div class="layer-name" data-action="rename" data-id="${l.id}" title="Double-click to rename">${l.name}</div>
        <div class="layer-meta">${metaText}</div>
      </div>
      <button class="layer-style-btn ${isOpen ? 'active' : ''}" data-action="style" data-id="${l.id}" title="Style">⊙</button>
      <button class="layer-remove" data-action="remove" data-id="${l.id}" title="Remove">×</button>
    </div>
    <div class="style-editor ${isOpen ? 'open' : ''}" data-editor="${l.id}">
      ${editorRows}
    </div>`;
  }).join("");
}

// ── Layer list interactions ────────────────────────────────────────────────
document.getElementById("layers-section").addEventListener("dblclick", e => {
  const el = e.target.closest("[data-action='rename']");
  if (!el) return;
  const layer = layers.find(l => l.id === el.dataset.id);
  if (!layer) return;
  el.contentEditable = "true";
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = () => {
    el.contentEditable = "false";
    const newName = el.textContent.trim();
    if (newName) { layer.name = newName; el.textContent = newName; }
    else { el.textContent = layer.name; }
  };
  el.addEventListener("keydown", evt => {
    if (evt.key === "Enter") { evt.preventDefault(); el.blur(); }
    if (evt.key === "Escape") { el.textContent = layer.name; el.blur(); }
  }, { once: false });
  el.addEventListener("blur", finish, { once: true });
});

document.getElementById("layers-section").addEventListener("click", e => {
  if (e.target.closest("[data-action='rename']")) return;
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const id = el.dataset.id;
  const layer = layers.find(l => l.id === id);
  if (!layer) return;
  if (el.dataset.action === "toggle") toggleLayer(layer);
  if (el.dataset.action === "remove") removeLayer(layer);
  if (el.dataset.action === "style") {
    activeStyleId = activeStyleId === layer.id ? null : layer.id;
    renderLayers();
  }
});

document.getElementById("layers-section").addEventListener("change", e => {
  const catSel = e.target.closest("[data-action='categorize']");
  if (!catSel) return;
  const layer = layers.find(l => l.id === catSel.dataset.id);
  if (!layer) return;
  setCategorizeBy(layer, catSel.value);
});

document.getElementById("layers-section").addEventListener("input", e => {
  const catInp = e.target.closest(".cat-color-inp");
  if (catInp) {
    const layer = layers.find(l => l.id === catInp.dataset.catid);
    if (!layer || !layer.style.categoryColors) return;
    layer.style.categoryColors[catInp.dataset.catval] = catInp.value;
    applyCategorization(layer);
    return;
  }

  const inp = e.target;
  if (!inp.dataset.prop) return;
  const layer = layers.find(l => l.id === inp.dataset.id);
  if (!layer) return;
  const prop = inp.dataset.prop;
  const val = inp.type === "range" ? parseFloat(inp.value) : inp.value;
  layer.style[prop] = val;
  if (layer.style.categorizeBy) applyCategorization(layer);
  else applyLayerStyle(layer);
  const row = inp.closest(".se-row");
  const valEl = row && row.querySelector(".se-value");
  const swatchEl = row && row.querySelector(".se-swatch");
  if (valEl) {
    if (prop === "opacity" || prop === "fillOpacity") valEl.textContent = Math.round(val * 100) + "%";
    else if (prop === "strokeWidth" || prop === "pointRadius") valEl.textContent = val + "px";
  }
  if (swatchEl && prop === "color") swatchEl.style.background = val;
});

function toggleLayer(layer) {
  layer.visible = !layer.visible;
  layer.layerIds.forEach(lid => {
    if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", layer.visible ? "visible" : "none");
  });
  renderLayers();
}

function removeLayer(layer) {
  layer.layerIds.forEach(lid => { if (map.getLayer(lid)) map.removeLayer(lid); });
  if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId);
  layers = layers.filter(l => l.id !== layer.id);
  renderLayers();
  updateDashboard();
}

// ── Load PMTiles ───────────────────────────────────────────────────────────
async function loadPMTiles(url, name, opts = {}) {
  const { skipFit = false, skipTabSwitch = false } = opts;
  showLoading(`Loading ${name}…`);

  let pmUrl = url;
  if (!pmUrl.startsWith("pmtiles://")) pmUrl = "pmtiles://" + url;

  try {
    const p = new pmtiles.PMTiles(url.replace(/^pmtiles:\/\//, ""));
    const header = await p.getHeader();

    const type = header.tileType === 1 ? "vector" : "raster";
    const id = `layer_${++layerCounter}`;
    const sourceId = `src_${id}`;

    let sublayerCount = 0;
    let sublayerNames = [];
    if (type === "vector") {
      try {
        const meta = await p.getMetadata();
        if (meta && meta.vector_layers) {
          sublayerCount = meta.vector_layers.length;
          sublayerNames = meta.vector_layers.map(vl => vl.id);
        }
      } catch (_) {}
    }

    if (type === "vector") {
      map.addSource(sourceId, { type: "vector", url: pmUrl });
    } else {
      map.addSource(sourceId, { type: "raster", url: pmUrl, tileSize: 256 });
    }

    const layerIds = [];
    const hue = (layerCounter * 67 + 40) % 360;
    const style = defaultStyle(hue);

    if (type === "raster") {
      const lid = `${id}_raster`;
      map.addLayer({
        id: lid,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": vectorOpacity },
      });
      layerIds.push(lid);
      sublayerCount = 1;
    } else {
      if (sublayerNames.length === 0) sublayerNames = ["_all"];
      sublayerNames.forEach((slName, i) => {
        const color = hslToHex((i * 47 + 210) % 360, 60, 50);
        const fillId = `${id}_fill_${i}`;
        const lineId = `${id}_line_${i}`;
        const circleId = `${id}_circle_${i}`;

        const sourceLayer = slName === "_all" ? undefined : slName;
        const sl = sourceLayer ? { "source-layer": sourceLayer } : {};

        map.addLayer({ id: fillId, type: "fill", source: sourceId, ...sl, paint: { "fill-color": color, "fill-opacity": vectorOpacity * 0.4 }, layout: { visibility: "visible" } });
        map.addLayer({ id: lineId, type: "line", source: sourceId, ...sl, paint: { "line-color": color, "line-width": 1.5, "line-opacity": vectorOpacity }, layout: { visibility: "visible" } });
        map.addLayer({ id: circleId, type: "circle", source: sourceId, ...sl, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": color, "circle-radius": 4, "circle-opacity": vectorOpacity, "circle-stroke-width": 1, "circle-stroke-color": "white" }, layout: { visibility: "visible" } });

        layerIds.push(fillId, lineId, circleId);
      });
    }

    const bounds = [
      [header.minLon, header.minLat],
      [header.maxLon, header.maxLat],
    ];
    if (!skipFit && (header.minLon !== 0 || header.maxLon !== 0)) {
      map.fitBounds(bounds, { padding: 40, duration: 800 });
    }

    const _baseFilters = {};
    layerIds.forEach(lid => { if (map.getLayer(lid)?.filter) _baseFilters[lid] = map.getLayer(lid).filter; });
    const layer = { id, name, url: pmUrl, type, visible: true, sourceId, layerIds, sublayerCount, sublayerNames, style, hiddenCategories: new Set(), _baseFilters };
    layers.push(layer);
    renderLayers();
    hideLoading();
    updateDashboard();
    if (!skipTabSwitch) switchTab("layers");

    if (type === "vector") {
      layerIds.filter(lid => lid.includes("_fill_") || lid.includes("_circle_")).forEach(lid => {
        map.on("click", lid, e => handleFeatureClick(e, name, lid));
        map.on("mouseenter", lid, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", lid, () => { map.getCanvas().style.cursor = ""; });
      });
    }
  } catch (err) {
    console.error(err);
    showError(`Failed to load "${name}": ${err.message}`);
  }
}

// ── Feature click ──────────────────────────────────────────────────────────
function handleFeatureClick(e, layerName, layerId) {
  if (!inspectEnabled) return;
  const f = e.features && e.features[0];
  if (!f) return;
  const props = f.properties || {};
  const keys = Object.keys(props);
  if (keys.length === 0) return;

  document.getElementById("feature-layer-name").textContent = layerName;
  document.getElementById("feature-props").innerHTML = keys.slice(0, 20).map(k =>
    `<div class="prop-row"><span class="prop-key">${k}</span><span class="prop-val" title="${props[k]}">${props[k]}</span></div>`
  ).join("");
  document.getElementById("feature-panel").classList.add("visible");
}

document.getElementById("feature-close").addEventListener("click", () => {
  document.getElementById("feature-panel").classList.remove("visible");
});

// ── Add layer toggle ───────────────────────────────────────────────────────
function openAddLayer() {
  document.getElementById("add-layer-body").classList.add("open");
  const btn = document.getElementById("add-layer-btn");
  btn.classList.add("open");
  btn.querySelector(".add-layer-icon").textContent = "−";
}
document.getElementById("add-layer-btn").addEventListener("click", () => {
  const body = document.getElementById("add-layer-body");
  const btn = document.getElementById("add-layer-btn");
  const isOpen = body.classList.toggle("open");
  btn.classList.toggle("open", isOpen);
  btn.querySelector(".add-layer-icon").textContent = isOpen ? "−" : "⊕";
});

// ── Drag & drop ────────────────────────────────────────────────────────────
const dz = document.getElementById("drop-zone");
dz.addEventListener("click", () => document.getElementById("file-input").click());

document.getElementById("file-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
  e.target.value = "";
});

["dragover","dragenter"].forEach(ev => {
  dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag-over"); });
  document.getElementById("map-wrap").addEventListener(ev, e => { e.preventDefault(); });
});
["dragleave","drop"].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove("drag-over")));

dz.addEventListener("drop", e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

document.getElementById("map-wrap").addEventListener("drop", e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) { switchTab("layers"); openAddLayer(); handleFile(file); }
});

function handleFile(file) {
  const name = file.name.replace(/\.(pmtiles|geojson|json)$/, "");
  if (file.name.endsWith(".pmtiles")) {
    loadPMTiles(URL.createObjectURL(file), name);
  } else if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const geojson = JSON.parse(e.target.result);
        loadGeoJSON(geojson, name);
      } catch (err) { showError(`Invalid JSON in "${file.name}"`); }
    };
    reader.readAsText(file);
  } else {
    showError("Unsupported file type. Use .pmtiles, .geojson, or .json");
  }
}

// ── URL load ───────────────────────────────────────────────────────────────
document.getElementById("url-load-btn").addEventListener("click", async () => {
  let url = document.getElementById("url-input").value.trim();
  if (!url) return;
  const raw = url.replace(/^pmtiles:\/\//, "");
  const name = raw.split("/").pop().replace(/\.(pmtiles|geojson|json)$/, "") || "Layer";
  if (url.endsWith(".geojson") || url.endsWith(".json")) {
    showLoading(`Loading ${name}…`);
    try {
      const res = await fetch(raw);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = await res.json();
      loadGeoJSON(geojson, name);
    } catch (err) { showError(`Failed to fetch "${name}": ${err.message}`); }
  } else {
    loadPMTiles(url, name);
  }
  document.getElementById("url-input").value = "";
});
document.getElementById("url-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("url-load-btn").click();
});

// ── Load GeoJSON ───────────────────────────────────────────────────────────
function loadGeoJSON(geojson, name) {
  showLoading(`Loading ${name}…`);
  try {
    if (geojson.type === "Feature") geojson = { type: "FeatureCollection", features: [geojson] };
    if (geojson.type !== "FeatureCollection") throw new Error("Not a valid GeoJSON FeatureCollection or Feature");

    const id = `layer_${++layerCounter}`;
    const sourceId = `src_${id}`;
    const hue = (layerCounter * 67 + 40) % 360;
    const style = defaultStyle(hue);
    const color = style.color;
    const featureCount = geojson.features ? geojson.features.length : 0;

    map.addSource(sourceId, { type: "geojson", data: geojson });

    const fillId = `${id}_fill`;
    const lineId = `${id}_line`;
    const circleId = `${id}_circle`;

    map.addLayer({ id: fillId, type: "fill", source: sourceId,
      filter: ["match", ["geometry-type"], ["Polygon","MultiPolygon"], true, false],
      paint: { "fill-color": color, "fill-opacity": style.fillOpacity } });
    map.addLayer({ id: lineId, type: "line", source: sourceId,
      filter: ["match", ["geometry-type"], ["LineString","MultiLineString","Polygon","MultiPolygon"], true, false],
      paint: { "line-color": color, "line-width": style.strokeWidth, "line-opacity": style.opacity } });
    map.addLayer({ id: circleId, type: "circle", source: sourceId,
      filter: ["match", ["geometry-type"], ["Point","MultiPoint"], true, false],
      paint: { "circle-color": color, "circle-radius": style.pointRadius, "circle-opacity": style.opacity,
               "circle-stroke-width": 1.5, "circle-stroke-color": "white" } });

    const layerIds = [fillId, lineId, circleId];

    try {
      const coords = [];
      (geojson.features || []).forEach(f => {
        if (!f.geometry) return;
        const flatten = c => Array.isArray(c[0]) ? c.forEach(flatten) : coords.push(c);
        flatten(f.geometry.coordinates || []);
      });
      if (coords.length) {
        const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1]);
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, duration: 800, maxZoom: 16 }
        );
      }
    } catch (_) {}

    const _baseFilters = {};
    [fillId, lineId, circleId].forEach(lid => { if (map.getLayer(lid)?.filter) _baseFilters[lid] = map.getLayer(lid).filter; });
    const layer = { id, name, type: "geojson", visible: true, sourceId, layerIds, sublayerCount: featureCount, sublayerNames: [], style, hiddenCategories: new Set(), _baseFilters, _geojsonData: geojson };
    layers.push(layer);
    renderLayers();
    hideLoading();
    updateDashboard();
    switchTab("layers");

    [fillId, circleId].forEach(lid => {
      map.on("click", lid, e => handleFeatureClick(e, name, lid));
      map.on("mouseenter", lid, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", lid, () => { map.getCanvas().style.cursor = ""; });
    });
  } catch (err) {
    console.error(err);
    showError(`Failed to load "${name}": ${err.message}`);
  }
}

// ── Default layers (auto-loaded on startup) ────────────────────────────────
const DEFAULT_LAYERS = [
  { name: "HDX",          url: "https://pub-1cfa3599913b47b1874de595f1cf952a.r2.dev/regional_hdx.pmtiles" },
  { name: "Healthsites",  url: "https://pub-1cfa3599913b47b1874de595f1cf952a.r2.dev/regional_healthsites.pmtiles" },
  { name: "Overture",     url: "https://pub-1cfa3599913b47b1874de595f1cf952a.r2.dev/regional_overture.pmtiles" },
];

// ── Country highlight layers ───────────────────────────────────────────────
map.on("load", () => {
  map.addSource("country-highlight", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "country-highlight-fill", type: "fill", source: "country-highlight",
    paint: { "fill-color": "#1a6fba", "fill-opacity": 0.06 } });
  map.addLayer({ id: "country-highlight-line", type: "line", source: "country-highlight",
    paint: { "line-color": "#1a6fba", "line-width": 2, "line-opacity": 0.7,
             "line-dasharray": [3, 2] } });

  DEFAULT_LAYERS.forEach(l => loadPMTiles(l.url, l.name, { skipFit: true, skipTabSwitch: true }));
});
