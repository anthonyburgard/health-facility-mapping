const CONFIG_DEFAULTS = Object.freeze({
  repo: null,
  branch: null,
  dataRoot: "data",
  autoLoadLimit: 4,
  autoLoadMaxBytes: 25 * 1024 * 1024,
});

const VECTOR_EXTENSIONS = new Set([
  "geojson",
  "json",
  "topojson",
  "kml",
  "gpx",
  "csv",
  "wkt",
  "zip",
]);
const RASTER_EXTENSIONS = new Set(["tif", "tiff"]);

const state = {
  map: null,
  entries: [],
  repoContext: null,
};

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  state.map = createMap();
  bindControls();

  const config = readConfig();
  setStatus("Discovering files...");

  try {
    const discovery = await discoverEntries(config);
    state.repoContext = discovery.repoContext;
    renderRepoMeta(discovery.repoContext, config.dataRoot, discovery.source);

    const entries = discovery.entries;
    state.entries = entries;
    renderFileList(entries);

    if (entries.length === 0) {
      setStatus(`No supported files were found in "${config.dataRoot}/".`, "error");
      return;
    }

    setStatus(`Found ${entries.length} file(s).`, "ok");

    const autoLoadEntries = entries
      .filter((entry) => entry.size <= CONFIG_DEFAULTS.autoLoadMaxBytes)
      .slice(0, CONFIG_DEFAULTS.autoLoadLimit);
    if (autoLoadEntries.length > 0) {
      setStatus(`Auto-loading ${autoLoadEntries.length} file(s)...`);
      await loadEntries(autoLoadEntries, true);
    } else {
      const manualOnlyCount = entries.filter(
        (entry) => entry.size > CONFIG_DEFAULTS.autoLoadMaxBytes
      ).length;
      if (manualOnlyCount > 0) {
        setStatus(
          `Found ${entries.length} file(s). ${manualOnlyCount} large file(s) require manual Load.`,
          "ok"
        );
      }
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to initialize viewer.", "error");
  }
}

async function discoverEntries(config) {
  let repoContext = null;
  let repoError = null;

  try {
    repoContext = await resolveRepoContext(config);
  } catch (error) {
    repoError = error;
  }

  if (repoContext) {
    try {
      const entries = await discoverFilesFromGitHub(repoContext, config.dataRoot);
      return {
        entries,
        repoContext,
        source: "github-api",
      };
    } catch (error) {
      repoError = error;
    }
  }

  const directoryEntries = await discoverFilesFromDirectoryListing(config.dataRoot);
  if (directoryEntries.length > 0) {
    return {
      entries: directoryEntries,
      repoContext: null,
      source: "directory-index",
    };
  }

  if (repoError && repoContext) {
    throw repoError;
  }

  if (window.location.protocol === "file:") {
    throw new Error(
      "index.html is opened with file://. Use a local web server (for example: python3 -m http.server) or open your GitHub Pages URL."
    );
  }

  if (repoError) {
    throw new Error(
      `${repoError.message} Local fallback also found no files in "${config.dataRoot}/".`
    );
  }

  throw new Error(`No supported files were discovered in "${config.dataRoot}/".`);
}

function createMap() {
  const map = L.map("map", { preferCanvas: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.setView([20, 0], 2);
  return map;
}

function bindControls() {
  const loadAllButton = document.getElementById("load-all");
  const zoomButton = document.getElementById("zoom-loaded");
  const clearButton = document.getElementById("clear-map");

  loadAllButton.addEventListener("click", () => {
    const toLoad = state.entries.filter((entry) => entry.status !== "loaded");
    if (toLoad.length === 0) {
      setStatus("All discovered files are already loaded.", "ok");
      return;
    }
    void loadEntries(toLoad, true);
  });

  zoomButton.addEventListener("click", () => {
    if (!zoomToLoadedLayers()) {
      setStatus("Load at least one layer first.");
    }
  });

  clearButton.addEventListener("click", () => {
    clearAllLayers();
    setStatus("Cleared all map layers.");
  });
}

function readConfig() {
  const userConfig =
    typeof window.GEO_VIEWER_CONFIG === "object" && window.GEO_VIEWER_CONFIG !== null
      ? window.GEO_VIEWER_CONFIG
      : {};

  const config = {
    ...CONFIG_DEFAULTS,
    ...userConfig,
  };

  config.dataRoot = normalizeDataRoot(config.dataRoot);
  return config;
}

function normalizeDataRoot(dataRoot) {
  const normalized = String(dataRoot || "data").replace(/^\/+|\/+$/g, "");
  return normalized || "data";
}

async function resolveRepoContext(config) {
  const repoInfo = config.repo ? parseRepoString(config.repo) : inferRepoFromLocation();
  const branch = config.branch || (await fetchDefaultBranch(repoInfo.owner, repoInfo.repo));
  return { ...repoInfo, branch };
}

function parseRepoString(repo) {
  const parts = String(repo).split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('Invalid "repo" config. Use the format "owner/repo".');
  }
  return { owner: parts[0], repo: parts[1] };
}

function inferRepoFromLocation() {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(".github.io")) {
    throw new Error(
      'Cannot infer repository from this domain. Set window.GEO_VIEWER_CONFIG.repo = "owner/repo".'
    );
  }

  const owner = host.replace(/\.github\.io$/, "");
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const repo = pathSegments.length > 0 ? decodeURIComponent(pathSegments[0]) : `${owner}.github.io`;
  return { owner, repo };
}

async function fetchDefaultBranch(owner, repo) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const data = await fetchGitHubJson(url);
  if (!data.default_branch) {
    throw new Error("GitHub API response did not include a default branch.");
  }
  return data.default_branch;
}

async function discoverFilesFromGitHub(repoContext, dataRoot) {
  const { owner, repo, branch } = repoContext;
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}` +
    `/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const data = await fetchGitHubJson(url);
  if (!Array.isArray(data.tree)) {
    throw new Error("GitHub API did not return a repository tree.");
  }

  const prefix = `${dataRoot}/`;

  return data.tree
    .filter((node) => node.type === "blob")
    .filter((node) => node.path.startsWith(prefix))
    .map((node) => toEntry(node.path, dataRoot, node.size))
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function discoverFilesFromDirectoryListing(dataRoot) {
  try {
    const response = await fetch(toDataRootUrl(dataRoot), { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(html, "text/html");
    const links = Array.from(documentNode.querySelectorAll("a[href]"));

    const entries = [];
    const seen = new Set();
    for (const link of links) {
      const href = (link.getAttribute("href") || "").trim();
      const fileName = hrefToFileName(href);
      if (!fileName) {
        continue;
      }

      const entry = toEntry(`${dataRoot}/${fileName}`, dataRoot, 0);
      if (!entry || seen.has(entry.path)) {
        continue;
      }

      seen.add(entry.path);
      entries.push(entry);
    }

    return entries.sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return [];
  }
}

function toDataRootUrl(dataRoot) {
  const encoded = dataRoot
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `./${encoded}/`;
}

function hrefToFileName(href) {
  if (!href || href.startsWith("#") || href.startsWith("?") || href.startsWith("..")) {
    return null;
  }
  if (href.startsWith("/") || href.startsWith("//")) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
    return null;
  }

  const cleanHref = href.split("#")[0].split("?")[0];
  let decoded;
  try {
    decoded = decodeURIComponent(cleanHref);
  } catch {
    return null;
  }
  if (!decoded || decoded.endsWith("/")) {
    return null;
  }

  const name = decoded.split("/").filter(Boolean).pop();
  if (!name || name === ".gitkeep") {
    return null;
  }

  return name;
}

function toEntry(path, dataRoot, size) {
  const normalizedPath = normalizeDataPath(path, dataRoot);
  if (!normalizedPath) {
    return null;
  }

  const kind = detectKind(normalizedPath);
  if (!kind) {
    return null;
  }

  const displayPrefix = `${dataRoot}/`;

  return {
    path: normalizedPath,
    displayPath: normalizedPath.startsWith(displayPrefix)
      ? normalizedPath.slice(displayPrefix.length)
      : normalizedPath,
    kind,
    ext: getExtension(normalizedPath),
    size: Number.isFinite(size) ? size : 0,
    status: "idle",
    message: "",
    layer: null,
    row: null,
    button: null,
    meta: null,
  };
}

function normalizeDataPath(path, dataRoot) {
  const raw = String(path || "")
    .trim()
    .replace(/\\/g, "/");
  if (!raw || raw.includes("..")) {
    return null;
  }

  const withoutLeadingSlash = raw.replace(/^\/+/, "");
  const withRoot = withoutLeadingSlash.startsWith(`${dataRoot}/`)
    ? withoutLeadingSlash
    : `${dataRoot}/${withoutLeadingSlash}`;

  const compactPath = withRoot.split("/").filter(Boolean).join("/");
  return compactPath.startsWith(`${dataRoot}/`) ? compactPath : null;
}

function detectKind(path) {
  const ext = getExtension(path);
  if (VECTOR_EXTENSIONS.has(ext)) {
    return "vector";
  }
  if (RASTER_EXTENSIONS.has(ext)) {
    return "raster";
  }
  return null;
}

function getExtension(path) {
  const lastDot = path.lastIndexOf(".");
  return lastDot === -1 ? "" : path.slice(lastDot + 1).toLowerCase();
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    const limitRemaining = response.headers.get("x-ratelimit-remaining");
    const resetAt = response.headers.get("x-ratelimit-reset");
    if (response.status === 403 && limitRemaining === "0" && resetAt) {
      const resetDate = new Date(Number(resetAt) * 1000);
      throw new Error(`GitHub API rate limit reached. Try again after ${resetDate.toLocaleString()}.`);
    }

    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}).`);
  }

  return response.json();
}

function renderRepoMeta(repoContext, dataRoot, source) {
  const container = document.getElementById("repo-meta");
  const lines = [];

  if (repoContext) {
    lines.push(`Repo: ${repoContext.owner}/${repoContext.repo}`);
    lines.push(`Branch: ${repoContext.branch}`);
  } else {
    lines.push("Repo: local preview / unknown");
  }

  lines.push(`Data folder: ${dataRoot}/`);
  lines.push(`Discovery: ${formatDiscoverySource(source)}`);

  container.textContent = lines.join("\n");
}

function formatDiscoverySource(source) {
  if (source === "github-api") {
    return "GitHub API";
  }
  if (source === "directory-index") {
    return "Directory index";
  }
  return "Unknown";
}

function renderFileList(entries) {
  const list = document.getElementById("file-list");
  list.innerHTML = "";

  for (const entry of entries) {
    const row = document.createElement("li");
    row.className = "file-row";

    const main = document.createElement("div");
    main.className = "file-main";

    const name = document.createElement("p");
    name.className = "file-name";
    name.textContent = entry.displayPath;

    const badge = document.createElement("span");
    badge.className = `badge ${entry.kind}`;
    badge.textContent = entry.kind;
    name.appendChild(document.createTextNode(" "));
    name.appendChild(badge);

    const meta = document.createElement("p");
    meta.className = "file-meta";
    meta.textContent = `${entry.ext.toUpperCase()} | ${formatBytes(entry.size)} | not loaded`;

    main.append(name, meta);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Load";
    button.addEventListener("click", () => {
      void toggleEntry(entry);
    });

    row.append(main, button);
    list.appendChild(row);

    entry.row = row;
    entry.button = button;
    entry.meta = meta;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

async function toggleEntry(entry) {
  if (entry.status === "loading") {
    return;
  }
  if (entry.status === "loaded") {
    unloadEntry(entry);
    return;
  }
  await loadEntry(entry, true);
}

async function loadEntries(entries, zoomAtEnd) {
  let loadedCount = 0;
  for (const entry of entries) {
    if (entry.status === "loaded") {
      continue;
    }

    try {
      await loadEntry(entry, false);
      loadedCount += 1;
    } catch (error) {
      console.error(error);
    }
  }

  if (loadedCount > 0 && zoomAtEnd) {
    zoomToLoadedLayers();
    setStatus(`Loaded ${loadedCount} layer(s).`, "ok");
  } else if (loadedCount === 0) {
    setStatus("No additional layers were loaded.");
  }
}

async function loadEntry(entry, zoomToLayer) {
  setEntryState(entry, "loading", "loading...");

  try {
    const layer = await buildLayer(entry);
    layer.addTo(state.map);
    entry.layer = layer;
    setEntryState(entry, "loaded", "loaded");

    if (zoomToLayer) {
      zoomToLayerBounds(layer);
    }
  } catch (error) {
    const message = error?.message || "unable to parse this file";
    setEntryState(entry, "error", message);
    setStatus(`Failed to load ${entry.displayPath}: ${message}`, "error");
    throw error;
  }
}

function unloadEntry(entry) {
  if (entry.layer) {
    state.map.removeLayer(entry.layer);
    entry.layer = null;
  }
  setEntryState(entry, "idle", "not loaded");
}

function clearAllLayers() {
  for (const entry of state.entries) {
    if (entry.layer) {
      state.map.removeLayer(entry.layer);
      entry.layer = null;
    }
    setEntryState(entry, "idle", "not loaded");
  }
}

function zoomToLoadedLayers() {
  const bounds = L.latLngBounds([]);
  let hasBounds = false;

  for (const entry of state.entries) {
    if (!entry.layer) {
      continue;
    }
    const layerBounds = getLayerBounds(entry.layer);
    if (!layerBounds || !layerBounds.isValid()) {
      continue;
    }
    if (!hasBounds) {
      bounds.extend(layerBounds);
      hasBounds = true;
    } else {
      bounds.extend(layerBounds);
    }
  }

  if (!hasBounds || !bounds.isValid()) {
    return false;
  }

  state.map.fitBounds(bounds.pad(0.12));
  return true;
}

function zoomToLayerBounds(layer) {
  const bounds = getLayerBounds(layer);
  if (!bounds || !bounds.isValid()) {
    return;
  }
  state.map.fitBounds(bounds.pad(0.12));
}

function getLayerBounds(layer) {
  if (!layer || typeof layer.getBounds !== "function") {
    return null;
  }
  const bounds = layer.getBounds();
  return bounds && typeof bounds.isValid === "function" ? bounds : null;
}

async function buildLayer(entry) {
  if (entry.kind === "raster") {
    return loadRaster(entry);
  }
  return loadVector(entry);
}

async function loadVector(entry) {
  const ext = entry.ext;
  if (isGeoJsonPath(entry.path)) {
    const geojson = await fetchFileJson(entry.path);
    return createVectorLayer(geojson, entry.path);
  }

  if (ext === "json") {
    const json = await fetchFileJson(entry.path);
    if (json?.type === "Topology") {
      return createVectorLayer(topojsonToGeoJson(json), entry.path);
    }
    return createVectorLayer(json, entry.path);
  }

  if (ext === "topojson") {
    const topology = await fetchFileJson(entry.path);
    return createVectorLayer(topojsonToGeoJson(topology), entry.path);
  }

  if (ext === "zip") {
    if (typeof window.shp !== "function") {
      throw new Error("Shapefile parser is unavailable.");
    }
    const data = await fetchFileArrayBuffer(entry.path);
    const shpResult = await window.shp(data);
    return createVectorLayer(normalizeShapefileResult(shpResult), entry.path);
  }

  if (["kml", "gpx", "csv", "wkt"].includes(ext)) {
    return loadOmnivoreLayer(ext, toFileUrl(entry.path), entry.path);
  }

  throw new Error(`Unsupported vector format: .${ext}`);
}

function isGeoJsonPath(path) {
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith(".geojson") || lowerPath.endsWith(".geo.json");
}

function createVectorLayer(geojson, colorSeed) {
  const color = colorForText(colorSeed);
  return L.geoJSON(geojson, {
    style: () => ({
      color,
      weight: 2,
      opacity: 0.95,
      fillColor: color,
      fillOpacity: 0.26,
    }),
    pointToLayer: (_feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 5,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.8,
      }),
    onEachFeature: (feature, layer) => {
      const popupHtml = buildFeaturePopup(feature.properties);
      if (popupHtml) {
        layer.bindPopup(popupHtml, { maxHeight: 260 });
      }
    },
  });
}

function topojsonToGeoJson(topology) {
  if (!window.topojson || typeof window.topojson.feature !== "function") {
    throw new Error("TopoJSON client is unavailable.");
  }
  if (!topology || topology.type !== "Topology" || typeof topology.objects !== "object") {
    throw new Error("Invalid TopoJSON file.");
  }

  const features = [];
  for (const [objectName, objectValue] of Object.entries(topology.objects)) {
    const featureLike = window.topojson.feature(topology, objectValue);
    if (featureLike.type === "FeatureCollection") {
      for (const feature of featureLike.features) {
        features.push(withLayerProperty(feature, objectName));
      }
    } else if (featureLike.type === "Feature") {
      features.push(withLayerProperty(featureLike, objectName));
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function withLayerProperty(feature, objectName) {
  return {
    ...feature,
    properties: {
      _layer: objectName,
      ...(feature.properties || {}),
    },
  };
}

function normalizeShapefileResult(input) {
  const features = [];

  const pushFeatureLike = (value, layerName) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        pushFeatureLike(item, layerName);
      }
      return;
    }

    if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
      for (const feature of value.features) {
        pushFeatureLike(feature, layerName);
      }
      return;
    }

    if (value.type === "Feature" && value.geometry) {
      features.push({
        ...value,
        properties: {
          ...(layerName ? { _layer: layerName } : {}),
          ...(value.properties || {}),
        },
      });
      return;
    }

    if (value.type && value.coordinates) {
      features.push({
        type: "Feature",
        geometry: value,
        properties: layerName ? { _layer: layerName } : {},
      });
      return;
    }

    if (typeof value === "object") {
      for (const [nestedName, nestedValue] of Object.entries(value)) {
        pushFeatureLike(nestedValue, nestedName);
      }
    }
  };

  pushFeatureLike(input, "");

  return {
    type: "FeatureCollection",
    features,
  };
}

function loadOmnivoreLayer(loaderName, url, colorSeed) {
  if (!window.omnivore || typeof window.omnivore[loaderName] !== "function") {
    throw new Error("Vector parser is unavailable for this format.");
  }

  return new Promise((resolve, reject) => {
    const layer = createVectorLayer(null, colorSeed);
    const parser = window.omnivore[loaderName](url, null, layer);
    parser.on("ready", () => resolve(parser));
    parser.on("error", (event) => {
      const msg =
        event?.error?.message ||
        event?.error?.toString?.() ||
        `Unable to parse ${loaderName.toUpperCase()} data.`;
      reject(new Error(msg));
    });
  });
}

async function loadRaster(entry) {
  const parseGeoRaster = window.parseGeoraster || window.GeoRaster;
  if (typeof parseGeoRaster !== "function" || typeof window.GeoRasterLayer !== "function") {
    throw new Error("GeoTIFF parser libraries are unavailable.");
  }

  const data = await fetchFileArrayBuffer(entry.path);
  const georaster = await parseGeoRaster(data);

  const layerOptions = {
    georaster,
    opacity: 0.8,
    resolution: 256,
  };
  const colorFn = buildSingleBandColorFn(georaster);
  if (colorFn) {
    layerOptions.pixelValuesToColorFn = colorFn;
  }

  return new window.GeoRasterLayer(layerOptions);
}

function buildSingleBandColorFn(georaster) {
  if (!georaster || Number(georaster.numberOfRasters) !== 1) {
    return null;
  }

  const min = georaster.mins?.[0];
  const max = georaster.maxs?.[0];
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return null;
  }

  const noDataValue = georaster.noDataValue;

  return (values) => {
    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }
    const value = values[0];
    if (!Number.isFinite(value) || value === noDataValue) {
      return null;
    }

    const normalized = clamp((value - min) / (max - min), 0, 1);
    const r = Math.round(25 + 230 * normalized);
    const g = Math.round(95 + 120 * normalized);
    const b = Math.round(190 - 170 * normalized);
    return `rgba(${r}, ${g}, ${b}, 0.82)`;
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function fetchFileJson(path) {
  const response = await fetch(toFileUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${path}`);
  }
  return response.json();
}

async function fetchFileArrayBuffer(path) {
  const response = await fetch(toFileUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${path}`);
  }
  return response.arrayBuffer();
}

function toFileUrl(path) {
  if (path.includes("..")) {
    throw new Error("Invalid path segment.");
  }
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `./${encoded}`;
}

function setEntryState(entry, stateName, message) {
  entry.status = stateName;
  entry.message = message;

  entry.row.classList.remove("loaded", "error");
  entry.button.disabled = false;

  if (stateName === "loading") {
    entry.button.disabled = true;
    entry.button.textContent = "Loading...";
  } else if (stateName === "loaded") {
    entry.row.classList.add("loaded");
    entry.button.textContent = "Unload";
  } else if (stateName === "error") {
    entry.row.classList.add("error");
    entry.button.textContent = "Retry";
  } else {
    entry.button.textContent = "Load";
  }

  entry.meta.textContent = `${entry.ext.toUpperCase()} | ${formatBytes(entry.size)} | ${message}`;
}

function setStatus(message, tone = "neutral") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.classList.remove("error", "ok");
  if (tone === "error") {
    status.classList.add("error");
  }
  if (tone === "ok") {
    status.classList.add("ok");
  }
}

function colorForText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 42%)`;
}

function buildFeaturePopup(properties) {
  if (!properties || typeof properties !== "object") {
    return "";
  }

  const rows = Object.entries(properties).slice(0, 12);
  if (rows.length === 0) {
    return "";
  }

  const body = rows
    .map(([key, value]) => {
      const safeKey = escapeHtml(key);
      const safeValue = escapeHtml(formatPropertyValue(value));
      return `<tr><th>${safeKey}</th><td>${safeValue}</td></tr>`;
    })
    .join("");

  const note =
    Object.keys(properties).length > rows.length
      ? `<p><em>Showing first ${rows.length} properties.</em></p>`
      : "";

  return `<table class="popup-table">${body}</table>${note}`;
}

function formatPropertyValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
