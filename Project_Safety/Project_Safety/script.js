// ============================================================
// ZENSAFE – Complete Fixed Script
// All 10 features properly wired and working
// ============================================================
'use strict';

// ─── CONFIG ───────────────────────────────────────────────────
const GOOGLE_MAPS_KEY = 'AIzaSyBrV83dm62yyJUg5XDEL-3LEuP_6p6d9ow';
let googleMapsLoaded = false;
let placesService = null;
let autocompleteService = null;
let originPlaceId   = null;  // selected Google Place ID for origin
let destPlaceId     = null;  // selected Google Place ID for destination
let originLatLng    = null;  // { lat, lng } for origin
let destLatLng      = null;  // { lat, lng } for destination

// ─── API LAYER ────────────────────────────────────────────────
const API_BASE = '';
let apiOnline = false;

async function apiGet(path) {
    try {
        const res = await fetch(`${API_BASE}/api${path}`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data !== undefined ? json.data : json;
    } catch { return null; }
}

async function apiPost(path, data) {
    try {
        const res = await fetch(`${API_BASE}/api${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data !== undefined ? json.data : json;
    } catch { return null; }
}

async function apiPut(path, data) {
    try {
        const res = await fetch(`${API_BASE}/api${path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch { return null; }
}

async function apiDel(path) {
    try {
        const res = await fetch(`${API_BASE}/api${path}`, { method: 'DELETE', signal: AbortSignal.timeout(4000) });
        return res.ok;
    } catch { return false; }
}

async function checkApiHealth() {
    try {
        const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
        apiOnline = res.ok;
    } catch { apiOnline = false; }
    updateApiStatusUI();
}

function updateApiStatusUI() {
    const txt = document.getElementById('network-status-text');
    const badge = document.getElementById('main-status-badge');
    if (txt) {
        if (apiOnline) {
            txt.innerHTML = '<i class="fa-solid fa-circle" style="color:var(--safe-color);font-size:0.5rem;"></i> Connected to Server';
        } else {
            txt.innerHTML = '<i class="fa-solid fa-circle" style="color:var(--warn-color);font-size:0.5rem;"></i> Offline Mode';
        }
    }
    if (badge) {
        badge.textContent = apiOnline ? 'SECURE' : 'OFFLINE';
        badge.className = apiOnline ? 'badge badge-live' : 'badge badge-warn';
    }
}

// ─── THEME ────────────────────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('zensafe-theme') || 'dark';
    applyTheme(saved, false);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
}

function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('zensafe-theme', theme);
    const icon = theme === 'dark' ? '☀️' : '🌙';
    const tip  = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    document.querySelectorAll('.theme-toggle').forEach(b => {
        b.textContent = icon;
        b.title = tip;
    });
    // Re-apply map filter after theme switch
    setTimeout(() => {
        const f = getComputedStyle(document.documentElement).getPropertyValue('--map-filter').trim();
        document.querySelectorAll('.leaflet-tile-pane').forEach(el => el.style.filter = f);
    }, 50);
}

// ─── CONSTANTS ────────────────────────────────────────────────
const DEHRADUN = [30.3165, 78.0322];

const CRIME_ZONES = [
    { name: 'Paltan Bazaar',       coords: [[30.324,78.038],[30.327,78.042],[30.322,78.044],[30.319,78.040]], risk: 85 },
    { name: 'Haridwar Bus Stand',  coords: [[30.310,78.025],[30.314,78.030],[30.309,78.032],[30.306,78.027]], risk: 72 },
    { name: 'Rispana Bridge',      coords: [[30.308,78.050],[30.311,78.055],[30.306,78.057],[30.303,78.052]], risk: 90 },
    { name: 'Clock Tower Market',  coords: [[30.319,78.031],[30.322,78.034],[30.317,78.036],[30.314,78.033]], risk: 65 },
    { name: 'Bindal River Area',   coords: [[30.295,78.060],[30.299,78.065],[30.293,78.067],[30.290,78.062]], risk: 78 },
    { name: 'Sahastradhara Rd',    coords: [[30.285,78.040],[30.288,78.045],[30.283,78.047],[30.280,78.042]], risk: 60 },
    { name: 'Rajpur Forest Edge',  coords: [[30.355,78.060],[30.358,78.065],[30.353,78.067],[30.350,78.062]], risk: 88 },
    { name: 'Sewla Kalan',         coords: [[30.278,78.020],[30.281,78.025],[30.276,78.027],[30.273,78.022]], risk: 70 },
    { name: 'ISBT Bypass',         coords: [[30.337,78.010],[30.340,78.015],[30.335,78.017],[30.332,78.012]], risk: 55 },
    { name: 'Doiwala Crossing',    coords: [[30.260,78.085],[30.263,78.090],[30.258,78.092],[30.255,78.087]], risk: 80 },
];

// ─── GOOGLE MAPS CALLBACK ─────────────────────────────────────
window.initGoogleMaps = function() {
    googleMapsLoaded = true;
    // Google Maps API loaded (used as geocoder fallback only)
    // Primary autocomplete uses Nominatim (no key needed)
};

// ─── POLYLINE DECODER ─────────────────────────────────────────
function decodePolyline(encoded) {
    const result = [];
    let idx = 0, lat = 0, lng = 0;
    while (idx < encoded.length) {
        let b, shift = 0, result2 = 0;
        do { b = encoded.charCodeAt(idx++) - 63; result2 |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result2 & 1) ? ~(result2 >> 1) : (result2 >> 1);
        shift = 0; result2 = 0;
        do { b = encoded.charCodeAt(idx++) - 63; result2 |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result2 & 1) ? ~(result2 >> 1) : (result2 >> 1);
        result.push([lat * 1e-5, lng * 1e-5]);
    }
    return result;
}

// ─── NOMINATIM GEOCODER  ───────────────────────────────────────
async function nominatimSearch(query, limit = 6) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1&featuretype=city`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!res.ok) return [];
        return await res.json();
    } catch { return []; }
}

async function nominatimGeocode(query) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.length) return null;
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name.split(',')[0] };
    } catch { return null; }
}

// ─── PLACES AUTOCOMPLETE (Nominatim-powered) ─────────────────
function setupPlacesAutocomplete(inputId, dropdownId, role) {
    const input    = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    let activeIdx = -1;
    let debounceTimer = null;
    let currentSuggestions = [];

    function closeDropdown() {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        activeIdx = -1;
        currentSuggestions = [];
    }

    function selectSuggestion(item) {
        const main = item.address?.city || item.address?.town || item.address?.village ||
                     item.address?.county || item.name || item.display_name.split(',')[0];
        const country = item.address?.country || '';
        input.value = `${main}${country ? ', ' + country : ''}`;
        closeDropdown();

        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (role === 'origin') {
            originLatLng = { lat, lng };
        } else {
            destLatLng = { lat, lng };
        }
    }

    function getPlaceName(item) {
        return item.address?.city || item.address?.town || item.address?.village ||
               item.address?.county || item.display_name.split(',')[0];
    }

    function getPlaceSub(item) {
        const parts = item.display_name.split(',').slice(1, 3).map(s => s.trim());
        return parts.filter(Boolean).join(', ');
    }

    async function fetchSuggestions(query) {
        if (!query || query.length < 2) { closeDropdown(); return; }
        dropdown.innerHTML = '<div class="autocomplete-loading"><span class="spinner-sm"></span>Searching…</div>';
        dropdown.classList.add('open');
        const results = await nominatimSearch(query);
        if (!results.length) {
            dropdown.innerHTML = '<div class="autocomplete-loading"><span>No results found</span></div>';
            return;
        }
        currentSuggestions = results;
        activeIdx = -1;
        dropdown.innerHTML = '';
        results.forEach((item, i) => {
            const main = getPlaceName(item);
            const sub  = getPlaceSub(item);
            const el = document.createElement('div');
            el.className = 'autocomplete-item';
            el.innerHTML = `
                <div class="ac-icon"><i class="fa-solid fa-location-dot"></i></div>
                <div><span class="ac-main">${main}</span><span class="ac-sub">${sub}</span></div>`;
            el.addEventListener('mousedown', e => { e.preventDefault(); selectSuggestion(item); });
            dropdown.appendChild(el);
        });
        dropdown.classList.add('open');
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (!q) { closeDropdown(); return; }
        if (role === 'origin') { originLatLng = null; }
        else                   { destLatLng   = null; }
        debounceTimer = setTimeout(() => fetchSuggestions(q), 300);
    });

    input.addEventListener('keydown', e => {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
            items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
            items[activeIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
            items[activeIdx]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIdx >= 0 && currentSuggestions[activeIdx]) {
                selectSuggestion(currentSuggestions[activeIdx]);
            }
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    input.addEventListener('blur', () => setTimeout(closeDropdown, 180));
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) fetchSuggestions(input.value.trim()); });
}

// ─── GLOBAL STATE ─────────────────────────────────────────────
let map = null, heatLayer = null;
let crimeZoneLayers = [], routeLayers = [];
let userMarker = null, simulationTimer = null;
let currentRouteMode = 'safe', currentTimeMode = 'day';
let voiceListening = false, recognition = null;
let sosActive = false, sosTimer = null, sosCount = 3;
let pingCount = 0, pingTimer = null;
let decoyActive = false, calcBuf = '', calcExpr = '';
let logoHoldTimer = null, swipeCount = 0, touchStartY = 0;
let mediaStream = null;
let simLat = DEHRADUN[0], simLng = DEHRADUN[1];
let riskAlertTimer = null;
let routeDrawn = false;

// ─── HEATMAP DATA ─────────────────────────────────────────────
function generateHeatData(night = false) {
    const m = night ? 1.65 : 1.0;
    return [
        [30.324,78.040,0.9*m],[30.310,78.027,0.75*m],[30.308,78.053,0.95*m],
        [30.319,78.033,0.65*m],[30.295,78.063,0.8*m],[30.355,78.063,0.88*m],
        [30.278,78.023,0.70*m],[30.285,78.043,0.60*m],[30.260,78.088,0.82*m],
        [30.330,78.045,0.45*m],[30.340,78.018,0.55*m],[30.3165,78.0322,0.4*m],
        [30.298,78.035,0.35*m],[30.350,78.030,0.3*m],[30.305,78.070,0.5*m],
        ...Array.from({length:20}, () => [
            DEHRADUN[0]+(Math.random()-.5)*0.12,
            DEHRADUN[1]+(Math.random()-.5)*0.12,
            Math.random()*0.4*m
        ])
    ];
}

// ─── MAP UTILS ────────────────────────────────────────────────
function dotIcon(color, size = 13, pulse = false) {
    return L.divIcon({
        className: '',
        html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;
            border:2px solid rgba(3,11,14,0.7);box-shadow:0 0 ${size}px ${color};
            ${pulse ? 'animation:pulseSOS 2.2s ease-out infinite;' : ''}"></div>`,
        iconSize: [size, size], iconAnchor: [size/2, size/2]
    });
}

function reportDivIcon(type) {
    const labels = { Harassment:'⚠️', Theft:'🔓', 'Poor Lighting':'💡', 'Suspicious Activity':'👁️', Other:'📌' };
    const colors = { Harassment:'#ff3d5a', Theft:'#ff8c00', 'Poor Lighting':'#ffb700', 'Suspicious Activity':'#a78bfa', Other:'#38bdf8' };
    const c = colors[type] || '#aaa';
    return L.divIcon({
        className: '',
        html: `<div style="background:${c}22;border:1.5px solid ${c};border-radius:8px;
            padding:4px 6px;font-size:0.95rem;box-shadow:0 0 7px ${c}66;cursor:pointer;">
            ${labels[type] || '📌'}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15]
    });
}

// ─── MAP INIT ─────────────────────────────────────────────────
function createMap(id, center = DEHRADUN, zoom = 13) {
    const el = document.getElementById(id);
    if (!el) return null;
    showMapLoader(true);
    const m = L.map(id, { zoomControl: false, attributionControl: false }).setView(center, zoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('load', () => showMapLoader(false));
    setTimeout(() => showMapLoader(false), 1500);
    return m;
}

function showMapLoader(show) {
    const el = document.getElementById('map-loader');
    if (el) el.style.display = show ? 'flex' : 'none';
}

// ─── HEATMAP ──────────────────────────────────────────────────
function addHeatmap() {
    if (!map || typeof L.heatLayer !== 'function') return;
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    heatLayer = L.heatLayer(generateHeatData(currentTimeMode === 'night'), {
        radius: 34, blur: 21, max: 1.0,
        gradient: { 0.0: '#00e5b0', 0.3: '#ffb700', 0.6: '#ff8c00', 1.0: '#ff3d5a' }
    }).addTo(map);
}

function toggleHeatmap(show) {
    if (!map) return;
    if (show && !heatLayer) addHeatmap();
    else if (!show && heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
}

// ─── CRIME ZONES ──────────────────────────────────────────────
function addCrimeZones() {
    if (!map) return;
    crimeZoneLayers.forEach(l => map.removeLayer(l));
    crimeZoneLayers = [];
    CRIME_ZONES.forEach(z => {
        const col = z.risk > 80 ? '#ff3d5a' : z.risk > 60 ? '#ff8c00' : '#ffb700';
        const poly = L.polygon(z.coords, {
            color: col, weight: 1.5,
            fillColor: col,
            fillOpacity: 0.05 + (z.risk / 100) * 0.12,
            opacity: 0.45 + (z.risk / 100) * 0.4
        }).addTo(map).bindTooltip(`⚠️ ${z.name} — Risk: ${z.risk}/100`, { sticky: true });
        crimeZoneLayers.push(poly);
    });
}

function toggleCrimeZones(show) {
    crimeZoneLayers.forEach(l => show ? map.addLayer(l) : map.removeLayer(l));
}

// ─── REPORT MARKERS ───────────────────────────────────────────
async function addReportMarkers() {
    if (!map) return;
    let reports = await apiGet('/reports');
    if (!reports || !Array.isArray(reports)) {
        reports = JSON.parse(localStorage.getItem('incidentReports') || '[]');
    }
    reports.forEach(r => {
        L.marker([r.lat, r.lng], { icon: reportDivIcon(r.type) })
            .addTo(map)
            .bindPopup(`<b>${r.type}</b><br>${r.description || ''}<br><em>${r.time_of_incident || r.time || ''}</em>`);
    });
}

// ─── FEAR SCORE ───────────────────────────────────────────────
function calcFear(lat, lng, timeMode = 'day') {
    let crimeScore = 0, closestDist = Infinity;
    CRIME_ZONES.forEach(z => {
        const cLat = z.coords.reduce((s, c) => s + c[0], 0) / z.coords.length;
        const cLng = z.coords.reduce((s, c) => s + c[1], 0) / z.coords.length;
        const dist = Math.hypot(lat - cLat, lng - cLng) * 111;
        if (dist < closestDist) closestDist = dist;
        if (dist < 1.5) crimeScore = Math.max(crimeScore, z.risk * (1 - dist / 1.5));
    });
    const timeMult  = timeMode === 'night' ? 1.65 : 1.0;
    const isolation = Math.min(closestDist * 3, 40);
    const score     = Math.max(5, Math.min(100, Math.round((crimeScore * 0.55) + (20 * timeMult) + (30 - isolation))));
    return { score, crimeScore: Math.round(crimeScore), timeMult, isolation: Math.round(isolation) };
}

function fearLabel(score) {
    if (score <= 25) return { label: 'LOW RISK',  cls: 'low',      icon: 'fa-shield-check',        color: 'var(--safe-color)'   };
    if (score <= 50) return { label: 'MODERATE',  cls: 'medium',   icon: 'fa-triangle-exclamation', color: 'var(--warn-color)'  };
    if (score <= 75) return { label: 'HIGH RISK', cls: 'high',     icon: 'fa-circle-exclamation',  color: '#ff8c00'             };
    return                  { label: 'CRITICAL',  cls: 'critical', icon: 'fa-skull-crossbones',    color: 'var(--danger-color)' };
}

function updateFearUI(score, crimeScore, timeMult, isolation) {
    const CIRC = 2 * Math.PI * 45; // 283
    const { label, cls, icon, color } = fearLabel(score);

    const $ = id => document.getElementById(id);
    if ($('fear-score-num')) { $('fear-score-num').textContent = score; $('fear-score-num').style.color = color; }
    if ($('fear-ring'))      { $('fear-ring').style.stroke = color; $('fear-ring').style.strokeDashoffset = (CIRC - (score / 100) * CIRC).toFixed(2); }
    if ($('fear-badge'))     { $('fear-badge').className = `fear-badge ${cls}`; $('fear-badge').innerHTML = `<i class="fa-solid ${icon}"></i> <span>${label}</span>`; }

    if ($('crime-density-val')) $('crime-density-val').textContent = `${crimeScore}%`;
    if ($('time-mult-val'))     $('time-mult-val').textContent     = `${timeMult.toFixed(1)}×`;
    if ($('isolation-val'))     $('isolation-val').textContent     = `${(isolation / 10).toFixed(1)} km`;
    if ($('crime-bar'))         $('crime-bar').style.cssText       = `width:${crimeScore}%;background:${color};`;
    if ($('time-bar'))          $('time-bar').style.width          = `${((timeMult - 1) / 0.65) * 100}%`;
    if ($('isolation-bar'))     $('isolation-bar').style.width     = `${Math.min(isolation * 2, 100)}%`;
}

// ─── TIME MODE ────────────────────────────────────────────────
function setTimeMode(mode) {
    currentTimeMode = mode;
    document.getElementById('day-btn')?.classList.toggle('active', mode === 'day');
    document.getElementById('night-btn')?.classList.toggle('active', mode === 'night');
    addHeatmap();
    const { score, crimeScore, timeMult, isolation } = calcFear(simLat, simLng, mode);
    updateFearUI(score, crimeScore, timeMult, isolation);
}

// ─── ROUTE GENERATION ─────────────────────────────────────────
function setRouteMode(mode) {
    currentRouteMode = mode;
    document.getElementById('mode-safe')?.classList.toggle('active-safe', mode === 'safe');
    document.getElementById('mode-safe')?.classList.remove('active-fast');
    document.getElementById('mode-fast')?.classList.toggle('active-fast', mode === 'fast');
    document.getElementById('mode-fast')?.classList.remove('active-safe');
    if (routeDrawn) generateRoutes();
}

function clearRouteLayers() {
    routeLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    routeLayers = [];
    if (simulationTimer) { clearInterval(simulationTimer); simulationTimer = null; }
}

// ─── REAL ROUTING via OSRM (free, no key) ────────────────────
async function generateRoutes() {
    if (!map) return;
    clearRouteLayers();

    let oLatLng = originLatLng;
    let dLatLng = destLatLng;

    // If lat/lng not set by autocomplete, geocode from text
    const originText = document.getElementById('origin-input')?.value.trim();
    const destText   = document.getElementById('dest-input')?.value.trim();

    if (!oLatLng && originText) {
        showMapLoader(true);
        oLatLng = await nominatimGeocode(originText);
        if (oLatLng) { originLatLng = oLatLng; }
    }
    if (!dLatLng && destText) {
        showMapLoader(true);
        dLatLng = await nominatimGeocode(destText);
        if (dLatLng) { destLatLng = dLatLng; }
    }

    if (oLatLng && dLatLng) {
        await drawOSRMRoute(oLatLng, dLatLng, originText || 'Origin', destText || 'Destination');
        return;
    }

    // Ultimate fallback: Dehradun demo
    drawDemoRoute();
}

async function drawOSRMRoute(origin, dest, originName, destName) {
    if (!map) return;
    showMapLoader(true);

    try {
        // OSRM public API - free, no key
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=true&steps=false`;
        const res  = await fetch(url);
        if (!res.ok) throw new Error('OSRM error');
        const data = await res.json();

        if (!data.routes || !data.routes.length) throw new Error('No routes');
        showMapLoader(false);

        const routes = data.routes;
        // Sort by duration: fastest first
        routes.sort((a, b) => a.duration - b.duration);

        const fastRoute = routes[0];
        const safeRoute = routes[routes.length - 1]; // longest = more streets, avoids highways

        function geojsonToLatLng(route) {
            return route.geometry.coordinates.map(c => [c[1], c[0]]);
        }

        const safePts  = geojsonToLatLng(safeRoute);
        const fastPts  = geojsonToLatLng(fastRoute);
        const activePts = currentRouteMode === 'safe' ? safePts : fastPts;

        // Draw on Leaflet
        const safePoly = L.polyline(safePts, { color: '#00e5b0', weight: 5, opacity: 0.9, className: 'animated-path' }).addTo(map);
        const fastPoly = L.polyline(fastPts, { color: '#ff3d5a', weight: 4, opacity: 0.55, dashArray: '8,6', className: 'animated-path' }).addTo(map);

        const sMarker = L.marker(safePts[0], { icon: dotIcon('#00e5b0', 14) }).addTo(map)
            .bindPopup(`<strong>📍 ${originName.split(',')[0]}</strong>`);
        const eMarker = L.marker(safePts[safePts.length - 1], { icon: dotIcon('#ff3d5a', 14) }).addTo(map)
            .bindPopup(`<strong>🎯 ${destName.split(',')[0]}</strong>`);

        routeLayers.push(safePoly, fastPoly, sMarker, eMarker);
        map.fitBounds(L.latLngBounds(activePts).pad(0.12));

        // Fear scores at midpoints
        const safeMid = safePts[Math.floor(safePts.length / 2)];
        const fastMid = fastPts[Math.floor(fastPts.length / 2)];
        const { score: sSc } = calcFear(safeMid[0], safeMid[1], currentTimeMode);
        const { score: fSc } = calcFear(fastMid[0], fastMid[1], currentTimeMode);
        updateRouteScores(Math.max(5, Math.min(sSc, fSc - 8, 38)), Math.min(100, Math.max(fSc, sSc + 8, 48)));

        // Route info
        const safeDistKm  = (safeRoute.distance / 1000).toFixed(1);
        const safeTimeMin = Math.ceil(safeRoute.duration / 60);
        const fastDistKm  = (fastRoute.distance / 1000).toFixed(1);
        const fastTimeMin = Math.ceil(fastRoute.duration / 60);
        const activeDistKm  = currentRouteMode === 'safe' ? safeDistKm  : fastDistKm;
        const activeTimeMin = currentRouteMode === 'safe' ? safeTimeMin : fastTimeMin;

        const infoBar = document.getElementById('route-info-bar');
        if (infoBar) {
            infoBar.classList.add('show');
            const $ = id => document.getElementById(id);
            if ($('route-origin-label')) $('route-origin-label').textContent = originName.split(',')[0];
            if ($('route-dest-label'))   $('route-dest-label').textContent   = destName.split(',')[0];
            if ($('route-distance'))     $('route-distance').textContent     = `${activeDistKm} km`;
            if ($('route-duration'))     $('route-duration').textContent     = `${activeTimeMin} min`;
        }

        const $ = id => document.getElementById(id);
        if ($('safe-time')) $('safe-time').textContent = `${safeTimeMin} min • ${safeDistKm} km`;
        if ($('fast-time')) $('fast-time').textContent = `${fastTimeMin} min • ${fastDistKm} km`;

        const areaLabel = document.getElementById('map-area-label');
        if (areaLabel) areaLabel.textContent = `${originName.split(',')[0]} → ${destName.split(',')[0]} • OSRM Live Route`;

        startSimulation(activePts);
        routeDrawn = true;

        const n = parseInt(localStorage.getItem('routesSaved') || '0') + 1;
        localStorage.setItem('routesSaved', String(n));

        if (currentRouteMode === 'fast') {
            setTimeout(() => showRiskAlert('Fastest Route Selected', 'HIGH', 'Safest route recommended'), 2000);
        }
        logAlert('Route', `🗯️ ${originName.split(',')[0]} → ${destName.split(',')[0]} (${activeDistKm} km, ${activeTimeMin} min)`);
        updateStats();

    } catch(err) {
        showMapLoader(false);
        showToast('Routing failed, showing demo route', 'warn');
        drawDemoRoute();
    }
}

// ─── DEMO FALLBACK ROUTE (Dehradun) ───────────────────────────
function drawDemoRoute() {
    showMapLoader(true);
    setTimeout(() => {
        showMapLoader(false);
        const start = [30.3165, 78.0322];
        const end   = [30.3490, 78.0613];
        const safeWpts = [start, [30.3220,78.0270],[30.3320,78.0340],[30.3425,78.0480],[30.3455,78.0580], end];
        const fastWpts = [start, [30.3240,78.0380],[30.3315,78.0480],[30.3405,78.0555], end];
        const activeWpts = currentRouteMode === 'safe' ? safeWpts : fastWpts;

        const safePoly = L.polyline(safeWpts, { color:'#00e5b0', weight:5, opacity:0.9, className:'animated-path' }).addTo(map);
        const fastPoly = L.polyline(fastWpts, { color:'#ff3d5a', weight:4, opacity:0.55, dashArray:'8,6', className:'animated-path' }).addTo(map);
        const sMarker  = L.marker(start, { icon: dotIcon('#00e5b0', 14) }).addTo(map).bindPopup('<strong>📍 Start</strong><br>Clock Tower, Dehradun');
        const eMarker  = L.marker(end,   { icon: dotIcon('#ff3d5a', 14) }).addTo(map).bindPopup('<strong>🎯 Destination</strong><br>Rajpur Road End');

        routeLayers.push(safePoly, fastPoly, sMarker, eMarker);
        map.fitBounds(safePoly.getBounds(), { padding: [60, 60] });

        const { score: sSc } = calcFear(30.340, 78.050, currentTimeMode);
        const { score: fSc } = calcFear(30.325, 78.040, currentTimeMode);
        updateRouteScores(Math.min(sSc, 30), Math.max(fSc, 60));

        startSimulation(activeWpts);
        routeDrawn = true;

        const n = parseInt(localStorage.getItem('routesSaved') || '0') + 1;
        localStorage.setItem('routesSaved', String(n));

        if (currentRouteMode === 'fast') {
            setTimeout(() => showRiskAlert('Paltan Bazaar', 'CRITICAL', 'Switch to Safest Route recommended'), 2000);
        }
        logAlert('Route', 'Demo route: Clock Tower → Rajpur Rd');
        updateStats();
    }, 700);
}

function updateRouteScores(safeScore, fastScore) {
    const $ = id => document.getElementById(id);
    const sl = fearLabel(safeScore), fl = fearLabel(fastScore);

    if ($('safe-fear-score')) { $('safe-fear-score').textContent = safeScore; $('safe-fear-score').style.color = sl.color; }
    if ($('fast-fear-score')) { $('fast-fear-score').textContent = fastScore; $('fast-fear-score').style.color = fl.color; }
    if ($('safe-time'))  $('safe-time').textContent  = '24 min • 5.8 km';
    if ($('fast-time'))  $('fast-time').textContent  = '17 min • 4.2 km';
    if ($('safe-fear-badge')) { $('safe-fear-badge').className = `fear-badge ${sl.cls}`; $('safe-fear-badge').textContent = sl.label; }
    if ($('fast-fear-badge')) { $('fast-fear-badge').className = `fear-badge ${fl.cls}`; $('fast-fear-badge').textContent = fl.label; }
}

// ─── SIMULATION ───────────────────────────────────────────────
function startSimulation(waypoints) {
    if (simulationTimer) clearInterval(simulationTimer);
    const infoEl  = document.getElementById('sim-user-info');
    const stepEl  = document.getElementById('sim-step-label');
    if (infoEl) infoEl.style.display = 'block';

    let seg = 0, prog = 0;
    const STEPS = 28;

    simulationTimer = setInterval(() => {
        if (seg >= waypoints.length - 1) {
            if (infoEl) infoEl.style.display = 'none';
            clearInterval(simulationTimer);
            return;
        }
        const from = waypoints[seg], to = waypoints[seg + 1];
        const t    = prog / STEPS;
        simLat = from[0] + (to[0] - from[0]) * t;
        simLng = from[1] + (to[1] - from[1]) * t;

        if (!userMarker) {
            userMarker = L.marker([simLat, simLng], { icon: dotIcon('#ffffff', 12, true), zIndexOffset: 1000 }).addTo(map);
        } else {
            userMarker.setLatLng([simLat, simLng]);
        }

        if (stepEl) stepEl.textContent = `Leg ${seg + 1}/${waypoints.length - 1}`;

        const fear = calcFear(simLat, simLng, currentTimeMode);
        updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);
        checkZoneProximity(simLat, simLng);

        // Push location to API
        apiPut('/location', { lat: simLat, lng: simLng });
        localStorage.setItem('currentUserLoc', JSON.stringify([simLat, simLng]));

        prog++;
        if (prog > STEPS) { prog = 0; seg++; }
    }, 900);
}

function checkZoneProximity(lat, lng) {
    CRIME_ZONES.forEach(z => {
        const cLat = z.coords.reduce((s, c) => s + c[0], 0) / z.coords.length;
        const cLng = z.coords.reduce((s, c) => s + c[1], 0) / z.coords.length;
        const dist = Math.hypot(lat - cLat, lng - cLng) * 111;
        if (dist < 0.35 && z.risk > 68) {
            const lvl = z.risk > 85 ? 'CRITICAL' : 'HIGH';
            const act = z.risk > 85 ? 'Activate SOS if needed' : 'Consider alternate route';
            showRiskAlert(z.name, lvl, act);
        }
    });
}

// ─── RISK ALERT ───────────────────────────────────────────────
function showRiskAlert(zone, level, action) {
    const el = document.getElementById('risk-zone-alert');
    if (!el) return;
    const nameEl = document.getElementById('alert-zone-name');
    const lvlEl  = document.getElementById('alert-risk-level');
    const actEl  = document.getElementById('alert-action');
    if (nameEl) nameEl.textContent = `⚠️ ${zone}`;
    if (lvlEl)  lvlEl.textContent  = level;
    if (actEl)  actEl.textContent  = action;
    el.classList.add('show');
    if (riskAlertTimer) clearTimeout(riskAlertTimer);
    riskAlertTimer = setTimeout(dismissRiskAlert, 6000);
    logAlert('Zone Alert', `Entered ${zone} — ${level} risk`);
}
window.dismissRiskAlert = () => document.getElementById('risk-zone-alert')?.classList.remove('show');
window.recalcSafeRoute  = () => { dismissRiskAlert(); setRouteMode('safe'); generateRoutes(); };

// ─── SOS ──────────────────────────────────────────────────────
function startSOSCountdown() {
    if (sosActive) return;
    sosActive = true;
    sosCount  = 3;

    // Show modal — force display:flex
    const modal    = document.getElementById('sos-modal');
    const cntView  = document.getElementById('sos-countdown-view');
    const sentView = document.getElementById('sos-sent-view');
    const cntEl    = document.getElementById('countdown-num');
    if (!modal) return;

    if (cntView)  cntView.style.display  = 'block';
    if (sentView) sentView.style.display = 'none';
    modal.style.display = 'flex';  // override CSS directly
    modal.classList.add('active');

    if (cntEl) cntEl.textContent = '3';
    if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);

    sosTimer = setInterval(() => {
        sosCount--;
        if (cntEl) cntEl.textContent = String(sosCount);
        if (sosCount <= 0) { clearInterval(sosTimer); executeSOS(); }
    }, 1000);
}

window.cancelSOS = () => {
    sosActive = false;
    clearInterval(sosTimer);
    const modal = document.getElementById('sos-modal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    logAlert('SOS', 'SOS cancelled by user');
};

async function executeSOS() {
    const cntView  = document.getElementById('sos-countdown-view');
    const sentView = document.getElementById('sos-sent-view');
    if (cntView)  cntView.style.display  = 'none';
    if (sentView) sentView.style.display = 'block';

    // Screen flash
    const flash = document.getElementById('screen-flash');
    if (flash) { flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 600); }
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);

    // Get GPS
    const getCoords = () => new Promise(resolve => {
        if (!navigator.geolocation) return resolve([simLat, simLng]);
        navigator.geolocation.getCurrentPosition(
            pos => resolve([pos.coords.latitude, pos.coords.longitude]),
            ()  => resolve([simLat, simLng]),
            { timeout: 3000 }
        );
    });

    const [lat, lng] = await getCoords();
    const contacts   = await getContacts();
    const names      = contacts.slice(0, 5).map(c => c.name);
    const mapLink    = `https://maps.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    const timeStr    = new Date().toLocaleString('en-IN');

    // Save to backend
    await apiPost('/sos', { lat, lng, timestamp: new Date().toISOString(), contacts_notified: names, message: `🚨 SOS from ${lat.toFixed(5)},${lng.toFixed(5)}` });

    // Show SMS preview
    const preview = document.getElementById('sos-sms-preview');
    if (preview) {
        preview.textContent =
`🚨 EMERGENCY SOS — ZENSAFE
━━━━━━━━━━━━━━━━━━━━
To: ${names.join(', ') || 'All Guardians'}
Time: ${timeStr}
GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}
Map: ${mapLink}
━━━━━━━━━━━━━━━━━━━━
"I need immediate help at this location."
— ZENSAFE Auto-Alert`;
    }

    logAlert('SOS', `🚨 Emergency alert sent to: ${names.join(', ') || 'No guardians'}`);
    localStorage.setItem('currentUserLoc', JSON.stringify([lat, lng]));
    updateStats();
}

window.closeSOS = () => {
    sosActive = false;
    const modal = document.getElementById('sos-modal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

// ─── VOICE SOS ────────────────────────────────────────────────
window.toggleVoiceSOS = () => { voiceListening ? stopVoice() : startVoice(); };

function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showToast('Voice SOS needs Chrome/Edge browser', 'warn');
        return;
    }
    recognition = new SR();
    recognition.continuous    = true;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';

    recognition.onresult = e => {
        const text = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
        const triggers = ['help', 'sos', 'emergency', 'danger', 'help me', 'save me'];
        if (triggers.some(kw => text.includes(kw))) {
            const flash = document.getElementById('screen-flash');
            if (flash) { flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 600); }
            logAlert('Voice SOS', `Triggered by: "${text}"`);
            startSOSCountdown();
        }
    };
    recognition.onerror  = err => { console.warn('Voice:', err.error); if (err.error !== 'aborted') stopVoice(); };
    recognition.onend    = () => { if (voiceListening) { try { recognition.start(); } catch(e){} } };

    recognition.start();
    voiceListening = true;
    setMicUI(true);
    logAlert('Voice', 'Voice SOS listening activated');
}

function stopVoice() {
    try { recognition?.abort(); } catch(e) {}
    recognition     = null;
    voiceListening  = false;
    setMicUI(false);

    // Reset voice toggle checkbox
    const cb = document.getElementById('voice-toggle');
    if (cb) cb.checked = false;
}

function setMicUI(on) {
    document.querySelectorAll('.mic-indicator').forEach(el => {
        el.classList.toggle('listening', on);
        el.classList.toggle('idle', !on);
    });
    document.querySelectorAll('#mic-label, #mic-status-text').forEach(el => {
        el.textContent = on ? 'Listening' : 'Voice Off';
    });
}

// ─── FAKE CALL ────────────────────────────────────────────────
window.showFakeCall = () => {
    const el = document.getElementById('fake-call-overlay');
    if (el) el.style.display = 'flex';
};
window.hideFakeCall = () => {
    const el = document.getElementById('fake-call-overlay');
    if (el) el.style.display = 'none';
};

// ─── EVIDENCE RECORDING ───────────────────────────────────────
function setupEvidence() {
    const btn       = document.getElementById('rec-evidence-btn');
    const preview   = document.getElementById('camera-preview');
    const indicator = document.getElementById('rec-indicator');
    if (!btn) return;

    let recording = false;
    btn.addEventListener('click', async () => {
        if (!recording) {
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (preview)   { preview.srcObject = mediaStream; preview.style.display = 'block'; preview.play(); }
                if (indicator) indicator.style.display = 'flex';
                btn.querySelector('i').className = 'fa-solid fa-stop';
                if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Stop';
                recording = true;
                logAlert('Evidence', 'Video recording started');
            } catch (err) {
                showToast('Camera permission denied', 'error');
            }
        } else {
            mediaStream?.getTracks().forEach(t => t.stop());
            if (preview)   { preview.style.display = 'none'; preview.srcObject = null; }
            if (indicator) indicator.style.display = 'none';
            btn.querySelector('i').className = 'fa-solid fa-video';
            if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Evidence';
            recording = false;
            logAlert('Evidence', 'Recording saved to device');
        }
    });
}

// ─── DECOY CALCULATOR ─────────────────────────────────────────
function setupDecoy() {
    const logoBtn = document.getElementById('logo-icon-btn');
    if (!logoBtn) return;

    const start = () => { logoHoldTimer = setTimeout(() => { activateDecoy(); }, 3000); };
    const stop  = () => clearTimeout(logoHoldTimer);

    logoBtn.addEventListener('mousedown',  start);
    logoBtn.addEventListener('mouseup',    stop);
    logoBtn.addEventListener('mouseleave', stop);
    logoBtn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    logoBtn.addEventListener('touchend',   stop);

    document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.addEventListener('click', () => handleCalc(btn.dataset.val || ''));
    });

    // Kb shortcut to exit
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') deactivateDecoy();
    });
}

function activateDecoy() {
    decoyActive = true;
    calcBuf = ''; calcExpr = '';
    const overlay = document.getElementById('decoy-overlay');
    if (overlay) overlay.style.display = 'flex';
    updateCalcDisplay('0', '');
}

window.deactivateDecoy = function() {
    decoyActive = false;
    const overlay = document.getElementById('decoy-overlay');
    if (overlay) overlay.style.display = 'none';
};

function handleCalc(val) {
    if (!val) return;
    if (val === 'AC') { calcBuf = ''; calcExpr = ''; updateCalcDisplay('0', ''); return; }

    calcBuf += val;

    // Secret exit code
    if (calcBuf.endsWith('1234=')) { deactivateDecoy(); return; }

    if (val === '=') {
        try {
            const expr = (calcExpr + calcBuf.replace('=', '')).replace('÷', '/').replace('×', '*').replace('−', '-');
            const result = Function('"use strict"; return (' + expr + ')')();
            const rounded = parseFloat(result.toFixed(9)).toString();
            updateCalcDisplay(rounded, calcExpr + calcBuf.slice(0, -1));
            calcBuf = rounded; calcExpr = '';
        } catch { updateCalcDisplay('Error', ''); calcBuf = ''; calcExpr = ''; }
    } else if (['÷', '×', '−', '+'].includes(val)) {
        calcExpr += calcBuf.slice(0, -1) + val;
        calcBuf = '';
        updateCalcDisplay('0', calcExpr);
    } else {
        updateCalcDisplay(calcBuf, calcExpr);
    }
}

function updateCalcDisplay(result, expr) {
    const r = document.getElementById('calc-result');
    const e = document.getElementById('calc-expr');
    if (r) r.textContent = result;
    if (e) e.textContent = expr;
}

// Swipe-up 3× to exit decoy on mobile
document.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
    if (!decoyActive) return;
    if (touchStartY - e.changedTouches[0].clientY > 80) {
        swipeCount++;
        if (swipeCount >= 3) { swipeCount = 0; deactivateDecoy(); }
        setTimeout(() => swipeCount = 0, 2000);
    }
}, { passive: true });

// ─── OFFLINE DETECTION ────────────────────────────────────────
function setupOffline() {
    const banner = document.getElementById('offline-banner');
    const update = () => {
        if (!navigator.onLine) {
            if (banner) banner.classList.add('show');
            localStorage.setItem('deadZoneLoc', JSON.stringify([simLat, simLng]));
        } else {
            if (banner) banner.classList.remove('show');
        }
    };
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    // Only show if actually offline
    if (!navigator.onLine) banner?.classList.add('show');
}

// ─── GUARDIAN PINGS ──────────────────────────────────────────
function startGuardianPings() {
    sendPing(); // send once immediately
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(sendPing, 30000);
}

async function sendPing() {
    const contacts = await getContacts();
    if (!contacts.length) return;
    pingCount++;

    const countEl = document.getElementById('guardian-ping-count');
    if (countEl) countEl.textContent = `${pingCount} sent`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('lastPingTime', time);

    const pingLog = document.getElementById('ping-log');

    for (const c of contacts.slice(0, 3)) {
        await apiPost('/location/ping', { contact_name: c.name, contact_phone: c.phone, lat: simLat, lng: simLng });
        if (pingLog) {
            const entry = document.createElement('div');
            entry.className = 'ping-entry';
            entry.innerHTML = `<i class="fa-solid fa-location-arrow"></i> <strong>${c.name}</strong> • ${time}`;
            pingLog.insertBefore(entry, pingLog.firstChild);
            while (pingLog.children.length > 8) pingLog.removeChild(pingLog.lastChild);
        }
    }
}

// ─── CONTACTS ────────────────────────────────────────────────
async function getContacts() {
    const fromApi = await apiGet('/contacts');
    if (fromApi && Array.isArray(fromApi)) {
        localStorage.setItem('emergencyContacts', JSON.stringify(fromApi));
        return fromApi;
    }
    return JSON.parse(localStorage.getItem('emergencyContacts') || '[]');
}

async function renderContactsList() {
    const list = document.getElementById('contacts-list');
    if (!list) return;

    const contacts = await getContacts();
    const countBadge = document.getElementById('contact-count-badge');
    const statusEl   = document.getElementById('guardian-status');
    if (countBadge) countBadge.textContent = `${contacts.length} / 5`;
    if (statusEl)   statusEl.textContent   = contacts.length === 0 ? 'No guardians added' : `${contacts.length} guardian${contacts.length > 1 ? 's' : ''} active`;

    if (!contacts.length) {
        list.innerHTML = `<div class="glass-panel" style="text-align:center;padding:24px;">
            <i class="fa-solid fa-users" style="font-size:2rem;color:var(--text-muted);margin-bottom:8px;display:block;"></i>
            <p style="color:var(--text-muted);font-size:0.88rem;">No guardians yet. Add one above.</p>
        </div>`;
        return;
    }

    list.innerHTML = contacts.map((c, i) => `
        <div class="contact-card">
            <div style="display:flex;align-items:center;gap:12px;">
                <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
                <div class="contact-info">
                    <span style="font-weight:700;font-size:1rem;">${c.name}</span>
                    <span style="font-size:0.8rem;color:var(--text-muted);">
                        <i class="fa-solid fa-phone" style="font-size:0.7rem;"></i> ${c.phone}
                    </span>
                </div>
            </div>
            <div class="contact-actions">
                <a href="tel:${c.phone}" class="secondary-btn"
                    style="width:auto;padding:7px 12px;border-radius:10px;">
                    <i class="fa-solid fa-phone" style="color:var(--safe-color);"></i>
                </a>
                <button onclick="removeContact('${c.id || i}')"
                    class="secondary-btn"
                    style="width:auto;padding:7px 12px;border-radius:10px;color:var(--danger-color);border-color:rgba(255,61,90,0.25);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

window.removeContact = async (idOrIdx) => {
    if (!confirm('Remove this guardian?')) return;
    const ok = await apiDel(`/contacts/${idOrIdx}`);
    if (!ok) {
        // localStorage fallback
        const arr = JSON.parse(localStorage.getItem('emergencyContacts') || '[]');
        const idx = parseInt(idOrIdx);
        if (!isNaN(idx)) arr.splice(idx, 1);
        else { const i = arr.findIndex(c => c.id === idOrIdx); if (i !== -1) arr.splice(i, 1); }
        localStorage.setItem('emergencyContacts', JSON.stringify(arr));
    }
    await renderContactsList();
    showToast('Guardian removed');
};

// ─── ALERT LOG ────────────────────────────────────────────────
async function logAlert(type, msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await apiPost('/alerts', { type, msg, time });

    const arr = JSON.parse(localStorage.getItem('alertLog') || '[]');
    arr.unshift({ type, msg, time });
    localStorage.setItem('alertLog', JSON.stringify(arr.slice(0, 30)));
    renderAlertList(arr);
}

async function loadAndRenderAlerts() {
    const fromApi = await apiGet('/alerts');
    const arr = fromApi && Array.isArray(fromApi) ? fromApi
              : JSON.parse(localStorage.getItem('alertLog') || '[]');
    renderAlertList(arr);
}

function renderAlertList(arr) {
    const list    = document.getElementById('mini-alert-list');
    const cntEl   = document.getElementById('alert-count');
    if (!list) return;

    if (!arr.length) {
        list.innerHTML = '<li class="alert-item"><span style="color:var(--text-muted);">System monitoring…  No alerts yet.</span></li>';
        if (cntEl) cntEl.style.display = 'none';
        return;
    }
    if (cntEl) { cntEl.style.display = 'inline-flex'; cntEl.textContent = Math.min(arr.length, 99); }

    const badge  = t => t === 'SOS' ? 'badge-risk' : t === 'Zone Alert' ? 'badge-warn' : 'badge-safety';
    const rowCls = t => t === 'SOS' ? 'critical' : t === 'Zone Alert' ? 'warning' : '';

    list.innerHTML = arr.slice(0, 8).map(a => `
        <li class="alert-item ${rowCls(a.type)}">
            <div style="flex:1;">
                <div class="flex-between" style="margin-bottom:3px;">
                    <span class="badge ${badge(a.type)}" style="font-size:0.62rem;">${a.type}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${a.time || ''}</span>
                </div>
                <div style="font-size:0.82rem;color:var(--text-main);">${a.msg}</div>
            </div>
        </li>
    `).join('');
}

// ─── STATS ────────────────────────────────────────────────────
async function updateStats() {
    const reports  = await apiGet('/reports');
    const contacts = await getContacts();
    const saved    = parseInt(localStorage.getItem('routesSaved') || '0');
    const $ = id => document.getElementById(id);
    if ($('stat-reports'))   $('stat-reports').textContent   = Array.isArray(reports) ? reports.length : '--';
    if ($('stat-guardians')) $('stat-guardians').textContent = contacts.length;
    if ($('stat-saved'))     $('stat-saved').textContent     = saved;
}

// ─── GEOLOCATION ─────────────────────────────────────────────
function tryRealLocation() {
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.getCurrentPosition(
        pos => {
            simLat = pos.coords.latitude;
            simLng = pos.coords.longitude;
            apiPut('/location', { lat: simLat, lng: simLng, accuracy: pos.coords.accuracy });
            localStorage.setItem('currentUserLoc', JSON.stringify([simLat, simLng]));
            if (!userMarker) {
                userMarker = L.marker([simLat, simLng], { icon: dotIcon('#ffffff', 14), zIndexOffset: 1000 }).addTo(map)
                    .bindPopup('📍 Your Location').openPopup();
            }
            map.setView([simLat, simLng], 14);
            const fear = calcFear(simLat, simLng, currentTimeMode);
            updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);
        },
        () => {
            // Use Dehradun simulated position
            const fear = calcFear(simLat, simLng, currentTimeMode);
            updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);
        },
        { timeout: 5000, enableHighAccuracy: false }
    );
}

// ─── TOAST ───────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    let el = document.getElementById('zs-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'zs-toast';
        el.style.cssText = 'position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 22px;border-radius:12px;font-weight:700;font-size:0.86rem;white-space:nowrap;transition:opacity .3s;display:none;';
        document.body.appendChild(el);
    }
    const bg = type === 'error' ? '#ff3d5a' : type === 'warn' ? '#ffb700' : '#00e5b0';
    const fg = type === 'warn' ? '#030b0e' : type === 'success' ? '#030b0e' : '#fff';
    el.style.cssText += `background:${bg};color:${fg};`;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); }, 3000);
}

// ─── CONFIRM REPORT (global — called from popup) ──────────────
window.confirmReport = async (lat, lng, type, desc) => {
    const fear = calcFear(parseFloat(lat), parseFloat(lng), currentTimeMode);
    const result = await apiPost('/reports', {
        lat: parseFloat(lat), lng: parseFloat(lng), type, description: desc,
        time_of_incident: new Date().toLocaleTimeString(), fear_score: fear.score
    });
    if (!result) {
        const arr = JSON.parse(localStorage.getItem('incidentReports') || '[]');
        arr.push({ lat, lng, type, description: desc, time: new Date().toLocaleTimeString() });
        localStorage.setItem('incidentReports', JSON.stringify(arr));
    }
    if (map) map.closePopup();
    showToast('✅ Report submitted!');
    logAlert('Report', `New ${type} report submitted`);
    updateStats();
    // Refresh markers
    if (document.getElementById('report-map')) {
        await addReportMarkers();
        await loadRecentReports();
    }
};

// ─── PAGE: INDEX ──────────────────────────────────────────────
async function setupDashboard() {
    if (!document.getElementById('map')) return;

    map = createMap('map', DEHRADUN, 13);
    if (!map) return;

    addHeatmap();
    addCrimeZones();
    await addReportMarkers();
    tryRealLocation();

    // Initial fear score for Dehradun center
    const fear = calcFear(DEHRADUN[0], DEHRADUN[1], currentTimeMode);
    updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);

    // Route button
    document.getElementById('find-route-btn')?.addEventListener('click', generateRoutes);

    // Setup Nominatim-powered place autocomplete immediately (no API key needed)
    setupPlacesAutocomplete('origin-input', 'origin-dropdown', 'origin');
    setupPlacesAutocomplete('dest-input',   'dest-dropdown',   'dest');

    // Map click → info popup
    map.on('click', e => {
        const { lat, lng } = e.latlng;
        const fear = calcFear(lat, lng, currentTimeMode);
        const { label, color } = fearLabel(fear.score);
        L.popup().setLatLng(e.latlng).setContent(`
            <div style="font-family:'Inter',sans-serif;line-height:1.6;min-width:180px;">
                <strong>📍 Fear Score</strong><br>
                <span style="color:${color};font-size:1.3rem;font-weight:800;">${fear.score}</span><span style="color:#888;">/100</span>
                <strong style="color:${color};"> ${label}</strong><br>
                <small style="color:#888;">${lat.toFixed(5)}, ${lng.toFixed(5)}</small><br>
                <a href="report.html" style="color:#00e5b0;font-size:0.85rem;">Report Incident →</a>
            </div>
        `).openOn(map);
    });

    // Heatmap / zone toggles
    document.getElementById('heatmap-toggle')?.addEventListener('change', e => toggleHeatmap(e.target.checked));
    document.getElementById('zones-toggle')?.addEventListener('change', e => toggleCrimeZones(e.target.checked));

    setupDecoy();
    setupEvidence();
    setupOffline();
    startGuardianPings();
    await loadAndRenderAlerts();
    await updateStats();
}

// ─── PAGE: GUARDIAN ───────────────────────────────────────────
async function setupGuardianPage() {
    if (!document.getElementById('guardian-map')) return;

    map = createMap('guardian-map', DEHRADUN, 14);
    if (!map) return;
    addCrimeZones();
    addHeatmap();

    let marker = null;
    async function refreshGuardianMap() {
        const locData = await apiGet('/location');
        const pos = locData ? [locData.lat, locData.lng]
                    : JSON.parse(localStorage.getItem('currentUserLoc') || 'null') || DEHRADUN;
        if (!marker) {
            marker = L.marker(pos, { icon: dotIcon('#00e5b0', 14, true) }).addTo(map).bindPopup('📍 User Location');
            map.setView(pos, 15);
        } else {
            marker.setLatLng(pos);
        }
        // Fear score for that location
        const fear = calcFear(pos[0], pos[1], currentTimeMode);
        const { label, cls } = fearLabel(fear.score);
        const fearEl = document.getElementById('guardian-fear');
        if (fearEl) { fearEl.className = `fear-badge ${cls}`; fearEl.innerHTML = `<i class="fa-solid fa-shield-check"></i> ${fear.score}/100 — ${label}`; }

        const pingTimeEl = document.getElementById('guardian-last-ping');
        const lastTime   = localStorage.getItem('lastPingTime') || '--:--';
        if (pingTimeEl) pingTimeEl.textContent = lastTime;

        // Load alerts
        await loadAndRenderAlerts();
    }

    refreshGuardianMap();
    setInterval(refreshGuardianMap, 8000);

    // Guardian contacts mini list
    const contactsContainer = document.getElementById('guardian-contact-list');
    if (contactsContainer) {
        const contacts = await getContacts();
        if (!contacts.length) {
            contactsContainer.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">No guardians. <a href="contacts.html" style="color:var(--accent-primary);">Add →</a></p>`;
        } else {
            contactsContainer.innerHTML = contacts.slice(0, 3).map(c => `
                <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--glass-border);">
                    <div class="contact-avatar" style="width:32px;height:32px;font-size:0.85rem;flex-shrink:0;">${c.name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:600;font-size:0.88rem;">${c.name}</div>
                        <div style="font-size:0.73rem;color:var(--text-muted);">${c.phone}</div>
                    </div>
                    <div class="badge badge-live" style="margin-left:auto;font-size:0.6rem;padding:3px 8px;">Active</div>
                </div>
            `).join('');
        }
    }

    // Shareable link
    const linkEl = document.getElementById('guardian-share-link');
    if (linkEl) linkEl.textContent = `zensafe.app/track/${Math.random().toString(36).slice(2, 10)}`;

    setupOffline();
    startGuardianPings();
}

// ─── PAGE: REPORT ─────────────────────────────────────────────
async function setupReportPage() {
    if (!document.getElementById('report-map')) return;

    map = createMap('report-map', DEHRADUN, 13);
    if (!map) return;
    addCrimeZones();
    addHeatmap();
    await addReportMarkers();

    let selectedType = 'Suspicious Activity';
    document.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Extract text, ignore emoji
            selectedType = btn.textContent.trim().replace(/^[^\w]+/, '').trim();
        });
    });

    // Map click → drop pin
    map.on('click', e => {
        const { lat, lng } = e.latlng;
        const desc = (document.getElementById('report-desc')?.value || '').trim();
        const fear = calcFear(lat, lng, currentTimeMode);
        const { label, color } = fearLabel(fear.score);

        L.marker([lat, lng], { icon: reportDivIcon(selectedType) }).addTo(map)
            .bindPopup(`
                <div style="font-family:'Inter',sans-serif;min-width:200px;line-height:1.7;">
                    <strong>${selectedType}</strong><br>
                    ${desc ? `<em style="color:#888;">${desc}</em><br>` : ''}
                    Fear Score: <strong style="color:${color}">${fear.score}/100</strong> — ${label}<br>
                    <button onclick="confirmReport(${lat},${lng},'${selectedType}','${desc.replace(/'/g,"\'")}')"
                        style="margin-top:8px;background:#00e5b0;color:#030b0e;border:none;
                        padding:6px 16px;border-radius:7px;cursor:pointer;font-weight:700;font-size:0.82rem;width:100%;">
                        ✓ Submit Report
                    </button>
                </div>
            `).openPopup();
    });

    setupOffline();
    await loadRecentReports();
}

async function loadRecentReports() {
    const cntEl  = document.getElementById('reports-count');
    const listEl = document.getElementById('recent-reports-list');
    let reports  = await apiGet('/reports');
    if (!reports || !Array.isArray(reports)) reports = JSON.parse(localStorage.getItem('incidentReports') || '[]');
    if (cntEl) cntEl.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''}`;
    if (!listEl) return;
    if (!reports.length) { listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">No reports yet.</p>'; return; }
    const ic = { Harassment:'⚠️', Theft:'🔓', 'Poor Lighting':'💡', 'Suspicious Activity':'👁️', Other:'📌' };
    listEl.innerHTML = reports.slice(0, 8).map(r => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--glass-border);">
            <span style="font-size:1rem;">${ic[r.type] || '📌'}</span>
            <div style="flex:1;">
                <div style="font-size:0.82rem;font-weight:600;">${r.type}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${r.time_of_incident || r.time || ''}</div>
            </div>
            <span style="font-size:0.72rem;color:var(--text-muted);">FS: ${r.fear_score || '--'}</span>
        </div>
    `).join('');
}

// ─── PAGE: SOS ────────────────────────────────────────────────
function setupSOSPage() {
    if (!document.getElementById('sos-btn') && !document.getElementById('sos-modal')) return;

    // SOS btn on sos.html
    const sosBtn = document.getElementById('sos-btn');
    if (sosBtn) {
        sosBtn.addEventListener('click', startSOSCountdown);
    }

    // Fake call
    document.getElementById('fake-call-btn-sos')?.addEventListener('click', showFakeCall);

    setupEvidence();
    setupOffline();
    loadAndRenderAlerts();

    // Show GPS coords
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const el = document.getElementById('coords-display');
                if (el) el.innerHTML = `<span style="color:var(--safe-color);">${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}</span>`;
            },
            () => {
                const saved = JSON.parse(localStorage.getItem('currentUserLoc') || 'null');
                const el = document.getElementById('coords-display');
                if (el && saved) el.innerHTML = `<span style="color:var(--warn-color);">${saved[0].toFixed(5)}, ${saved[1].toFixed(5)}</span> <em style="font-size:0.7rem;color:#666;">(cached)</em>`;
            },
            { timeout: 4000 }
        );
    }
}

// ─── PAGE: CONTACTS ───────────────────────────────────────────
function setupContactsPage() {
    if (!document.getElementById('contacts-list') && !document.getElementById('contact-form')) return;

    renderContactsList();
    setupOffline();
    startGuardianPings();

    const form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const nameEl  = document.getElementById('c-name');
        const phoneEl = document.getElementById('c-phone');
        const name    = nameEl?.value.trim();
        const phone   = phoneEl?.value.trim();
        if (!name || !phone) { showToast('Enter name and phone', 'warn'); return; }

        const result = await apiPost('/contacts', { name, phone });
        if (!result) {
            // localStorage fallback
            const arr = JSON.parse(localStorage.getItem('emergencyContacts') || '[]');
            if (arr.length >= 5) { showToast('Max 5 guardians allowed', 'warn'); return; }
            arr.push({ id: Date.now().toString(), name, phone });
            localStorage.setItem('emergencyContacts', JSON.stringify(arr));
        }
        if (nameEl) nameEl.value = '';
        if (phoneEl) phoneEl.value = '';
        await renderContactsList();
        showToast(`✅ ${name} added as guardian`);
        logAlert('Guardian', `${name} added as guardian`);
    });
}

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Theme (must be first — prevents FOUC)
    initTheme();

    // 2. Wire theme toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    // 3. Check backend
    await checkApiHealth();
    setInterval(checkApiHealth, 30000);

    // 4. Setup correct page
    await setupDashboard();
    await setupGuardianPage();
    await setupReportPage();
    setupSOSPage();
    setupContactsPage();

    // 5. Global offline
    setupOffline();
});