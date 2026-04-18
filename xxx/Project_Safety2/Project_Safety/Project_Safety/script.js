// ============================================================
// ZENSAFE – Main Script
// Map: Leaflet + OpenStreetMap (free)
// Autocomplete: Nominatim (free)
// Routing / Distance: OSRM (free)
// ============================================================
'use strict';

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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data), signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.data !== undefined ? json.data : json;
    } catch { return null; }
}
async function apiPut(path, data) {
    try {
        const res = await fetch(`${API_BASE}/api${path}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data), signal: AbortSignal.timeout(4000)
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
    const txt   = document.getElementById('network-status-text');
    const badge = document.getElementById('main-status-badge');
    if (txt) txt.innerHTML = apiOnline
        ? '<i class="fa-solid fa-circle" style="color:var(--safe-color);font-size:0.5rem;"></i> Connected to Server'
        : '<i class="fa-solid fa-circle" style="color:var(--warn-color);font-size:0.5rem;"></i> Offline Mode';
    if (badge) { badge.textContent = apiOnline ? 'SECURE' : 'OFFLINE'; badge.className = apiOnline ? 'badge badge-live' : 'badge badge-warn'; }
}

// ─── THEME ────────────────────────────────────────────────────
function initTheme() { applyTheme(localStorage.getItem('zensafe-theme') || 'dark', false); }
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true); }
function applyTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('zensafe-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(b => b.textContent = theme === 'dark' ? '☀️' : '🌙');
    // Swap map tiles
    if (map) {
        tileLayer?.remove();
        tileLayer = theme === 'dark'
            ? L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
            : L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    }
}

// ─── CONSTANTS ────────────────────────────────────────────────
const DEHRADUN = [30.3165, 78.0322];
const CRIME_ZONES = [
    { name: 'Paltan Bazaar',      coords: [[30.324,78.038],[30.327,78.042],[30.322,78.044],[30.319,78.040]], risk: 85 },
    { name: 'Haridwar Bus Stand', coords: [[30.310,78.025],[30.314,78.030],[30.309,78.032],[30.306,78.027]], risk: 72 },
    { name: 'Rispana Bridge',     coords: [[30.308,78.050],[30.311,78.055],[30.306,78.057],[30.303,78.052]], risk: 90 },
    { name: 'Clock Tower Market', coords: [[30.319,78.031],[30.322,78.034],[30.317,78.036],[30.314,78.033]], risk: 65 },
    { name: 'Bindal River Area',  coords: [[30.295,78.060],[30.299,78.065],[30.293,78.067],[30.290,78.062]], risk: 78 },
    { name: 'Sahastradhara Rd',   coords: [[30.285,78.040],[30.288,78.045],[30.283,78.047],[30.280,78.042]], risk: 60 },
    { name: 'Rajpur Forest Edge', coords: [[30.355,78.060],[30.358,78.065],[30.353,78.067],[30.350,78.062]], risk: 88 },
    { name: 'Sewla Kalan',        coords: [[30.278,78.020],[30.281,78.025],[30.276,78.027],[30.273,78.022]], risk: 70 },
    { name: 'ISBT Bypass',        coords: [[30.337,78.010],[30.340,78.015],[30.335,78.017],[30.332,78.012]], risk: 55 },
    { name: 'Doiwala Crossing',   coords: [[30.260,78.085],[30.263,78.090],[30.258,78.092],[30.255,78.087]], risk: 80 },
];

// ─── GLOBAL STATE ─────────────────────────────────────────────
let map = null, tileLayer = null;
let userMarker = null, heatLayer = null;
let crimeZoneLayers = [], crimeZonesVisible = true, heatmapVisible = true;
let currentRouteLayers = [];
let currentRouteMode = 'safe', currentTimeMode = 'day';
let simLat = DEHRADUN[0], simLng = DEHRADUN[1];
let originCoords = null, destCoords = null;
let routeDrawn = false;
let riskAlertTimer = null;
let pingCount = 0, pingTimer = null;
let decoyActive = false, calcBuf = '', calcExpr = '';
let logoHoldTimer = null, swipeCount = 0, touchStartY = 0;
let voiceListening = false, recognition = null;
let sosActive = false, sosTimer = null, sosCount = 3;
let mediaStream = null;
let acTimers = {};

// ─── NOMINATIM AUTOCOMPLETE ───────────────────────────────────
// Uses OpenStreetMap Nominatim — completely free, no API key
function setupAutocomplete(inputId, listId, onSelect) {
    const input = document.getElementById(inputId);
    const list  = document.getElementById(listId);
    if (!input || !list) return;

    let debounceT = null;

    input.addEventListener('input', () => {
        clearTimeout(debounceT);
        const q = input.value.trim();
        if (q.length < 2) { closeList(list); return; }
        debounceT = setTimeout(() => fetchSuggestions(q, list, input, onSelect), 280);
    });

    input.addEventListener('keydown', e => {
        const items = list.querySelectorAll('.zs-ac-item');
        let active = list.querySelector('.zs-ac-item.active');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!active && items.length) items[0].classList.add('active');
            else if (active) { active.classList.remove('active'); (active.nextElementSibling || items[0]).classList.add('active'); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (active) { active.classList.remove('active'); (active.previousElementSibling || items[items.length - 1]).classList.add('active'); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active) active.click();
        } else if (e.key === 'Escape') {
            closeList(list);
        }
    });

    // Close on outside click
    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !list.contains(e.target)) closeList(list);
    });
}

async function fetchSuggestions(query, list, input, onSelect) {
    list.innerHTML = '<div class="zs-ac-loading"><i class="fa-solid fa-spinner fa-spin"></i> Searching…</div>';
    list.classList.add('open');
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&accept-language=en`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const data = await res.json();
        if (!data.length) { list.innerHTML = '<div class="zs-ac-loading">No results found</div>'; return; }
        list.innerHTML = '';
        data.forEach(item => {
            const displayName = formatPlaceName(item);
            const div = document.createElement('div');
            div.className = 'zs-ac-item';
            div.innerHTML = `<i class="fa-solid ${getPlaceIcon(item.type, item.class)}"></i><span>${displayName}</span>`;
            div.addEventListener('mousedown', e => e.preventDefault()); // prevent blur before click
            div.addEventListener('click', () => {
                input.value = displayName;
                closeList(list);
                onSelect({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: displayName });
            });
            list.appendChild(div);
        });
    } catch {
        list.innerHTML = '<div class="zs-ac-loading">Search unavailable offline</div>';
    }
}

function formatPlaceName(item) {
    const a = item.address || {};
    const parts = [];
    if (a.city || a.town || a.village || a.suburb) parts.push(a.city || a.town || a.village || a.suburb);
    if (a.state) parts.push(a.state);
    if (a.country) parts.push(a.country);
    return parts.length ? parts.join(', ') : item.display_name.split(',').slice(0, 3).join(',').trim();
}

function getPlaceIcon(type, cls) {
    if (cls === 'highway' || type === 'motorway') return 'fa-road';
    if (cls === 'railway' || type === 'station')  return 'fa-train';
    if (cls === 'aeroway') return 'fa-plane';
    if (type === 'city' || type === 'town')       return 'fa-city';
    if (type === 'village' || type === 'suburb')  return 'fa-house';
    return 'fa-location-dot';
}

function closeList(list) { list.innerHTML = ''; list.classList.remove('open'); }

// ─── OSRM ROUTING (free, no key) ─────────────────────────────
// Uses Project OSRM public server — completely free
async function generateRoutes() {
    if (!originCoords || !destCoords) {
        const oName = document.getElementById('origin-input')?.value.trim();
        const dName = document.getElementById('dest-input')?.value.trim();
        if (!oName || !dName) { showToast('Enter both origin and destination', 'warn'); return; }
        // Try geocoding immediately from typed text
        showToast('Geocoding locations…', 'success');
        try {
            const [oRes, dRes] = await Promise.all([
                fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(oName)}&format=json&limit=1`).then(r => r.json()),
                fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dName)}&format=json&limit=1`).then(r => r.json())
            ]);
            if (!oRes.length) { showToast('Could not find origin location', 'error'); return; }
            if (!dRes.length) { showToast('Could not find destination location', 'error'); return; }
            originCoords = { lat: parseFloat(oRes[0].lat), lng: parseFloat(oRes[0].lon) };
            destCoords   = { lat: parseFloat(dRes[0].lat), lng: parseFloat(dRes[0].lon) };
        } catch { showToast('Geocoding failed — check connection', 'error'); return; }
    }

    showMapLoader(true);
    // Clear old routes
    currentRouteLayers.forEach(l => map.removeLayer(l));
    currentRouteLayers = [];

    // Call OSRM for primary route
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/` +
        `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}` +
        `?overview=full&geometries=geojson&alternatives=true&steps=false`;

    try {
        const res  = await fetch(osrmUrl, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        showMapLoader(false);
        if (data.code !== 'Ok' || !data.routes?.length) { showToast('Route not found — try different locations', 'error'); return; }

        const primary = data.routes[0];
        const alt     = data.routes[1] || null;

        // Draw routes
        const safeColor  = '#00e5b0';
        const fastColor  = '#ff3d5a';

        // Primary route (green = safe mode, shown on top)
        const primaryLayer = L.geoJSON(primary.geometry, {
            style: { color: safeColor, weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
        }).addTo(map);
        currentRouteLayers.push(primaryLayer);

        // Alt route (red dashed)
        if (alt) {
            const altLayer = L.geoJSON(alt.geometry, {
                style: { color: fastColor, weight: 4, opacity: 0.55, dashArray: '10,8', lineCap: 'round' }
            }).addTo(map);
            currentRouteLayers.push(altLayer);
        }

        // Drop pin markers for origin & destination
        const originMarker = L.marker([originCoords.lat, originCoords.lng], {
            icon: L.divIcon({ html: '<div style="width:14px;height:14px;background:#00e5b0;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,229,176,0.5);"></div>', className: '', iconAnchor: [7, 7] })
        }).addTo(map).bindPopup(`<b style="color:#00e5b0;">📍 Origin</b><br>${document.getElementById('origin-input').value}`);
        const destMarker = L.marker([destCoords.lat, destCoords.lng], {
            icon: L.divIcon({ html: '<div style="width:14px;height:14px;background:#ff3d5a;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(255,61,90,0.5);"></div>', className: '', iconAnchor: [7, 7] })
        }).addTo(map).bindPopup(`<b style="color:#ff3d5a;">🎯 Destination</b><br>${document.getElementById('dest-input').value}`);
        currentRouteLayers.push(originMarker, destMarker);

        // Fit map to route — invalidate size first for blank-map fix
        map.invalidateSize();
        setTimeout(() => {
            const bounds = primaryLayer.getBounds().pad(0.15);
            map.fitBounds(bounds, { animate: true, duration: 0.8 });
        }, 100);

        // Stats
        const distKm  = (primary.distance / 1000).toFixed(1);
        const durMins = Math.round(primary.duration / 60);
        const altDistKm  = alt ? (alt.distance / 1000).toFixed(1) : '--';
        const altDurMins = alt ? Math.round(alt.duration / 60) : '--';

        // Fear score at midpoint
        const midLat = (originCoords.lat + destCoords.lat) / 2;
        const midLng = (originCoords.lng + destCoords.lng) / 2;
        const fear = calcFear(midLat, midLng, currentTimeMode);
        const hazards = countHazardsNearRoute(primary.geometry.coordinates);

        // Update route info bar
        const bar = document.getElementById('route-info-bar');
        if (bar) bar.style.display = 'flex';
        setText('info-distance', `${distKm} km`);
        setText('info-duration', formatDuration(primary.duration));
        setText('info-hazards',  `${hazards} hazard zone${hazards !== 1 ? 's' : ''}`);
        setText('info-fear',     `Fear Score: ${fear.score}/100`);
        const chip = document.getElementById('info-fear-chip');
        if (chip) chip.className = `route-info-chip ${fear.score > 60 ? 'danger' : fear.score > 35 ? 'warn' : ''}`;

        // Update comparison cards
        setText('safe-time', `${formatDuration(primary.duration)} • ${distKm} km`);
        if (alt) setText('fast-time', `${formatDuration(alt.duration)} • ${altDistKm} km`);
        updateRouteScores(Math.max(5, fear.score - 15), Math.min(95, fear.score + 20));
        updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);

        simLat = midLat; simLng = midLng;
        routeDrawn = true;

        // Save and log
        const n = parseInt(localStorage.getItem('routesSaved') || '0') + 1;
        localStorage.setItem('routesSaved', String(n));
        logAlert('Route', `${document.getElementById('origin-input').value} → ${document.getElementById('dest-input').value} (${distKm} km)`);
        updateStats();

        if (currentRouteMode === 'fast' && hazards > 0) {
            setTimeout(() => showRiskAlert('Route Hazard', 'HIGH', `${hazards} risk zone(s) on route. Switch to Safest?`), 1500);
        }

    } catch(err) {
        showMapLoader(false);
        showToast('Routing service unavailable — check internet', 'error');
        console.error('OSRM error:', err);
    }
}

function formatDuration(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function countHazardsNearRoute(coords) {
    let count = 0;
    const step = Math.max(1, Math.floor(coords.length / 30));
    for (let i = 0; i < coords.length; i += step) {
        const [lng, lat] = coords[i];
        for (const z of CRIME_ZONES) {
            if (z.risk < 65) continue;
            const cLat = z.coords.reduce((s, c) => s + c[0], 0) / z.coords.length;
            const cLng = z.coords.reduce((s, c) => s + c[1], 0) / z.coords.length;
            if (Math.hypot(lat - cLat, lng - cLng) * 111 < 0.6) { count++; break; }
        }
    }
    return count;
}

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

// ─── MAP SETUP ────────────────────────────────────────────────
function createMap(elId, center, zoom) {
    if (!document.getElementById(elId)) return null;
    const m = L.map(elId, { zoomControl: false, attributionControl: false }).setView(center, zoom);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.control.attribution({ position: 'bottomright', prefix: '© OpenStreetMap' }).addTo(m);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileLayer = L.tileLayer(tileUrl, { maxZoom: 19, subdomains: 'abcd' }).addTo(m);
    // Ensure tiles render after container is fully sized
    setTimeout(() => m.invalidateSize(), 200);
    return m;
}

function dotIcon(color, size = 12, pulse = false) {
    return L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${color};border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 0 3px ${color}44;${pulse ? 'animation:pulseRing 1.5s ease-out infinite;' : ''}"></div>`,
        className: '', iconAnchor: [size/2, size/2]
    });
}

function addHeatmap() {
    if (!map) return;
    const pts = CRIME_ZONES.map(z => {
        const cLat = z.coords.reduce((s, c) => s + c[0], 0) / z.coords.length;
        const cLng = z.coords.reduce((s, c) => s + c[1], 0) / z.coords.length;
        return [cLat, cLng, z.risk / 100];
    });
    if (typeof L.heatLayer === 'function') {
        heatLayer = L.heatLayer(pts, { radius: 35, blur: 25, maxZoom: 16, gradient: { 0.4: '#00e5b0', 0.55: '#ffb700', 0.75: '#ff8c00', 1.0: '#ff3d5a' } }).addTo(map);
    }
}

function addCrimeZones() {
    if (!map) return;
    crimeZoneLayers.forEach(l => map.removeLayer(l));
    crimeZoneLayers = [];
    CRIME_ZONES.forEach(z => {
        const col = z.risk > 80 ? '#ff3d5a' : z.risk > 60 ? '#ff8c00' : '#ffb700';
        const poly = L.polygon(z.coords, { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.09 + (z.risk / 100) * 0.15 })
            .addTo(map)
            .bindTooltip(`<b style="color:${col};">⚠️ ${z.name}</b><br><span style="font-size:0.8rem;">Risk Score: ${z.risk}/100</span>`, { sticky: true });
        crimeZoneLayers.push(poly);
    });
}

function toggleHeatmap(show) {
    if (!heatLayer) return;
    if (show) { if (!map.hasLayer(heatLayer)) heatLayer.addTo(map); }
    else       { if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer); }
    heatmapVisible = show;
}

function toggleCrimeZones(show) {
    crimeZoneLayers.forEach(l => show ? l.addTo(map) : map.removeLayer(l));
    crimeZonesVisible = show;
}

async function addReportMarkers() {
    if (!map) return;
    let reports = await apiGet('/reports');
    if (!reports || !Array.isArray(reports)) reports = JSON.parse(localStorage.getItem('incidentReports') || '[]');
    const colors = { Harassment:'#ff3d5a', Theft:'#ff8c00', 'Poor Lighting':'#ffb700', 'Suspicious Activity':'#a78bfa', Other:'#38bdf8' };
    const labels = { Harassment:'⚠️', Theft:'🔓', 'Poor Lighting':'💡', 'Suspicious Activity':'👁️', Other:'📌' };
    reports.forEach(r => {
        const col = colors[r.type] || '#aaa';
        L.circleMarker([parseFloat(r.lat), parseFloat(r.lng)], { radius: 7, color: col, fillColor: col, fillOpacity: 0.65, weight: 2 })
            .addTo(map)
            .bindPopup(`<b style="color:${col};">${labels[r.type] || '📌'} ${r.type}</b><br><span style="font-size:0.8rem;color:#a0b8c0;">${r.description || ''}</span>`);
    });
}

// ─── GEOLOCATION ─────────────────────────────────────────────
function tryRealLocation() {
    if (!navigator.geolocation || !map) return;
    const infoEl = document.getElementById('sim-user-info');
    const stepEl = document.getElementById('sim-step-label');
    navigator.geolocation.watchPosition(pos => {
        simLat = pos.coords.latitude; simLng = pos.coords.longitude;
        if (!userMarker) {
            userMarker = L.marker([simLat, simLng], { icon: dotIcon('#00e5b0', 14, true), zIndexOffset: 1000 }).addTo(map)
                .bindPopup('<b style="color:#00e5b0;">📍 You are here</b>');
            map.setView([simLat, simLng], 14);
            if (infoEl) infoEl.style.display = 'block';
        } else { userMarker.setLatLng([simLat, simLng]); }
        if (stepEl) stepEl.textContent = `GPS Live · ±${Math.round(pos.coords.accuracy)}m`;
        apiPut('/location', { lat: simLat, lng: simLng, accuracy: pos.coords.accuracy });
        localStorage.setItem('currentUserLoc', JSON.stringify([simLat, simLng]));
        const fear = calcFear(simLat, simLng, currentTimeMode);
        updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);
        checkZoneProximity(simLat, simLng);
    }, () => {
        const fear = calcFear(simLat, simLng, currentTimeMode);
        updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
}

window.centerOnUser = function() {
    if (!navigator.geolocation) { showToast('Geolocation not supported', 'warn'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        simLat = pos.coords.latitude; simLng = pos.coords.longitude;
        map?.setView([simLat, simLng], 15);
        const fear = calcFear(simLat, simLng, currentTimeMode);
        updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);
    }, () => showToast('Location access denied', 'warn'), { timeout: 5000 });
};

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
    const CIRC = 2 * Math.PI * 45;
    const { label, cls, icon, color } = fearLabel(score);
    const $ = id => document.getElementById(id);
    if ($('fear-score-num'))    { $('fear-score-num').textContent = score; $('fear-score-num').style.color = color; }
    if ($('fear-ring'))         { $('fear-ring').style.stroke = color; $('fear-ring').style.strokeDashoffset = (CIRC - (score / 100) * CIRC).toFixed(2); }
    if ($('fear-badge'))        { $('fear-badge').className = `fear-badge ${cls}`; $('fear-badge').innerHTML = `<i class="fa-solid ${icon}"></i> <span>${label}</span>`; }
    if ($('crime-density-val')) $('crime-density-val').textContent = `${crimeScore}%`;
    if ($('time-mult-val'))     $('time-mult-val').textContent     = `${timeMult.toFixed(1)}×`;
    if ($('isolation-val'))     $('isolation-val').textContent     = `${(isolation / 10).toFixed(1)} km`;
    if ($('crime-bar'))         $('crime-bar').style.cssText       = `width:${crimeScore}%;background:${color};`;
    if ($('time-bar'))          $('time-bar').style.width          = `${((timeMult - 1) / 0.65) * 100}%`;
    if ($('isolation-bar'))     $('isolation-bar').style.width     = `${Math.min(isolation * 2, 100)}%`;
}

function updateRouteScores(safeScore, fastScore) {
    const $ = id => document.getElementById(id);
    const sl = fearLabel(safeScore), fl = fearLabel(fastScore);
    if ($('safe-fear-score')) { $('safe-fear-score').textContent = safeScore; $('safe-fear-score').style.color = sl.color; }
    if ($('fast-fear-score')) { $('fast-fear-score').textContent = fastScore; $('fast-fear-score').style.color = fl.color; }
    if ($('safe-fear-badge')) { $('safe-fear-badge').className = `fear-badge ${sl.cls}`; $('safe-fear-badge').textContent = sl.label; }
    if ($('fast-fear-badge')) { $('fast-fear-badge').className = `fear-badge ${fl.cls}`; $('fast-fear-badge').textContent = fl.label; }
}

function setTimeMode(mode) {
    currentTimeMode = mode;
    document.getElementById('day-btn')?.classList.toggle('active', mode === 'day');
    document.getElementById('night-btn')?.classList.toggle('active', mode === 'night');
    const { score, crimeScore, timeMult, isolation } = calcFear(simLat, simLng, mode);
    updateFearUI(score, crimeScore, timeMult, isolation);
}

function setRouteMode(mode) {
    currentRouteMode = mode;
    document.getElementById('mode-safe')?.classList.toggle('active-safe', mode === 'safe');
    document.getElementById('mode-safe')?.classList.remove('active-fast');
    document.getElementById('mode-fast')?.classList.toggle('active-fast', mode === 'fast');
    document.getElementById('mode-fast')?.classList.remove('active-safe');
    if (routeDrawn) generateRoutes();
}

function checkZoneProximity(lat, lng) {
    CRIME_ZONES.forEach(z => {
        const cLat = z.coords.reduce((s, c) => s + c[0], 0) / z.coords.length;
        const cLng = z.coords.reduce((s, c) => s + c[1], 0) / z.coords.length;
        if (Math.hypot(lat - cLat, lng - cLng) * 111 < 0.35 && z.risk > 68) {
            const lvl = z.risk > 85 ? 'CRITICAL' : 'HIGH';
            showRiskAlert(z.name, lvl, z.risk > 85 ? 'Activate SOS if needed!' : 'Consider alternate route');
        }
    });
}

// ─── RISK ALERT ───────────────────────────────────────────────
function showRiskAlert(zone, level, action) {
    const el = document.getElementById('risk-zone-alert');
    if (!el) return;
    const zoneEl  = document.getElementById('alert-zone-name');
    const levelEl = document.getElementById('alert-risk-level');
    const actEl   = document.getElementById('alert-action');
    if (zoneEl)  zoneEl.textContent  = `⚠️ ${zone}`;
    if (levelEl) levelEl.textContent = level;
    if (actEl)   actEl.textContent   = action;
    el.classList.add('show');
    if (riskAlertTimer) clearTimeout(riskAlertTimer);
    riskAlertTimer = setTimeout(dismissRiskAlert, 7000);
    logAlert('Zone Alert', `Entered ${zone} — ${level} risk`);
}
window.dismissRiskAlert = () => document.getElementById('risk-zone-alert')?.classList.remove('show');
window.recalcSafeRoute  = () => { dismissRiskAlert(); setRouteMode('safe'); generateRoutes(); };

// ─── MAP LOADER ───────────────────────────────────────────────
function showMapLoader(show) {
    const el = document.getElementById('map-loader');
    if (el) el.style.display = show ? 'flex' : 'none';
}

// ─── SOS ──────────────────────────────────────────────────────
function startSOSCountdown() {
    if (sosActive) return;
    sosActive = true; sosCount = 3;
    const modal   = document.getElementById('sos-modal');
    const cntView = document.getElementById('sos-countdown-view');
    const cntEl   = document.getElementById('countdown-num');
    const sentView = document.getElementById('sos-sent-view');
    if (!modal) return;
    if (cntView) cntView.style.display = 'block';
    if (sentView) sentView.style.display = 'none';
    if (cntEl) cntEl.textContent = '3';
    modal.style.display = 'flex'; modal.classList.add('active');
    if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);
    sosTimer = setInterval(() => {
        sosCount--;
        if (cntEl) cntEl.textContent = String(sosCount);
        if (sosCount <= 0) { clearInterval(sosTimer); executeSOS(); }
    }, 1000);
}
window.cancelSOS = () => {
    sosActive = false; clearInterval(sosTimer);
    const modal = document.getElementById('sos-modal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    logAlert('SOS', 'SOS cancelled');
};
async function executeSOS() {
    const cntView  = document.getElementById('sos-countdown-view');
    const sentView = document.getElementById('sos-sent-view');
    if (cntView)  cntView.style.display  = 'none';
    if (sentView) sentView.style.display = 'block';
    const flash = document.getElementById('screen-flash');
    if (flash) { flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 600); }
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);
    const [lat, lng] = await new Promise(resolve => {
        if (!navigator.geolocation) return resolve([simLat, simLng]);
        navigator.geolocation.getCurrentPosition(p => resolve([p.coords.latitude, p.coords.longitude]), () => resolve([simLat, simLng]), { timeout: 3000 });
    });
    const contacts = await getContacts();
    const names    = contacts.slice(0, 5).map(c => c.name);
    const mapLink  = `https://maps.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    await apiPost('/sos', { lat, lng, timestamp: new Date().toISOString(), contacts_notified: names, message: `🚨 SOS at ${lat.toFixed(5)},${lng.toFixed(5)}` });
    const preview = document.getElementById('sos-sms-preview');
    if (preview) preview.textContent =
`🚨 EMERGENCY SOS — ZENSAFE
━━━━━━━━━━━━━━━━━━━━
To: ${names.join(', ') || 'All Guardians'}
Time: ${new Date().toLocaleString('en-IN')}
GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}
Map: ${mapLink}
━━━━━━━━━━━━━━━━━━━━
"I need immediate help at this location."
— ZENSAFE Auto-Alert`;
    logAlert('SOS', `🚨 Alert sent to: ${names.join(', ') || 'No guardians set'}`);
    localStorage.setItem('currentUserLoc', JSON.stringify([lat, lng]));
    updateStats();
}
window.closeSOS = () => {
    sosActive = false;
    const modal = document.getElementById('sos-modal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
};

// ─── VOICE SOS ────────────────────────────────────────────────
window.toggleVoiceSOS = () => voiceListening ? stopVoice() : startVoice();
function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Voice SOS needs Chrome/Edge', 'warn'); return; }
    recognition = new SR(); recognition.continuous = true; recognition.lang = 'en-US';
    recognition.onresult = e => {
        const text = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
        if (['help','sos','emergency','danger','help me','save me'].some(kw => text.includes(kw))) {
            const flash = document.getElementById('screen-flash');
            if (flash) { flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 600); }
            logAlert('Voice SOS', `Triggered: "${text}"`);
            startSOSCountdown();
        }
    };
    recognition.onerror = err => { if (err.error !== 'aborted') stopVoice(); };
    recognition.onend   = () => { if (voiceListening) try { recognition.start(); } catch(e){} };
    recognition.start(); voiceListening = true; setMicUI(true);
}
function stopVoice() {
    try { recognition?.abort(); } catch(e) {}
    recognition = null; voiceListening = false; setMicUI(false);
}
function setMicUI(on) {
    document.querySelectorAll('.mic-indicator').forEach(el => { el.classList.toggle('listening', on); el.classList.toggle('idle', !on); });
    document.querySelectorAll('#mic-label, #mic-status-text').forEach(el => el.textContent = on ? 'Listening' : 'Voice Off');
}

// ─── FAKE CALL ────────────────────────────────────────────────
window.showFakeCall = () => { const el = document.getElementById('fake-call-overlay'); if (el) el.style.display = 'flex'; };
window.hideFakeCall = () => { const el = document.getElementById('fake-call-overlay'); if (el) el.style.display = 'none'; };

// ─── EVIDENCE ────────────────────────────────────────────────
function setupEvidence() {
    const btn  = document.getElementById('rec-evidence-btn');
    if (!btn) return;
    let recording = false;
    btn.addEventListener('click', async () => {
        const preview   = document.getElementById('camera-preview');
        const indicator = document.getElementById('rec-indicator');
        if (!recording) {
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (preview) { preview.srcObject = mediaStream; preview.style.display = 'block'; preview.play(); }
                if (indicator) indicator.style.display = 'flex';
                btn.querySelector('i').className = 'fa-solid fa-stop';
                if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Stop';
                recording = true; logAlert('Evidence', 'Video recording started');
            } catch { showToast('Camera permission denied', 'error'); }
        } else {
            mediaStream?.getTracks().forEach(t => t.stop());
            if (preview) { preview.style.display = 'none'; preview.srcObject = null; }
            if (indicator) indicator.style.display = 'none';
            btn.querySelector('i').className = 'fa-solid fa-video';
            if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Evidence';
            recording = false; logAlert('Evidence', 'Recording saved to device');
        }
    });
}

// ─── DECOY CALCULATOR ─────────────────────────────────────────
function setupDecoy() {
    const logoBtn = document.getElementById('logo-icon-btn');
    if (!logoBtn) return;
    const start = () => { logoHoldTimer = setTimeout(activateDecoy, 3000); };
    const stop  = () => clearTimeout(logoHoldTimer);
    logoBtn.addEventListener('mousedown', start); logoBtn.addEventListener('mouseup', stop); logoBtn.addEventListener('mouseleave', stop);
    logoBtn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    logoBtn.addEventListener('touchend', stop);
    document.querySelectorAll('.calc-btn').forEach(btn => btn.addEventListener('click', () => handleCalc(btn.dataset.val || '')));
}
function activateDecoy() {
    decoyActive = true; calcBuf = ''; calcExpr = '';
    const el = document.getElementById('decoy-overlay');
    if (el) el.style.display = 'flex';
    updateCalcDisplay('0', '');
}
window.deactivateDecoy = () => {
    decoyActive = false;
    const el = document.getElementById('decoy-overlay');
    if (el) el.style.display = 'none';
};
function handleCalc(val) {
    if (!val) return;
    if (val === 'AC') { calcBuf = ''; calcExpr = ''; updateCalcDisplay('0', ''); return; }
    calcBuf += val;
    if (calcBuf.endsWith('1234=')) { window.deactivateDecoy(); return; }
    if (val === '=') {
        try {
            const expr = (calcExpr + calcBuf.replace('=', '')).replace('÷', '/').replace('×', '*').replace('−', '-');
            const result = Function('"use strict"; return (' + expr + ')')();
            updateCalcDisplay(parseFloat(result.toFixed(9)).toString(), calcExpr + calcBuf.slice(0, -1));
            calcBuf = String(result); calcExpr = '';
        } catch { updateCalcDisplay('Error', ''); calcBuf = ''; calcExpr = ''; }
    } else if (['÷','×','−','+'].includes(val)) {
        calcExpr += calcBuf.slice(0, -1) + val; calcBuf = ''; updateCalcDisplay('0', calcExpr);
    } else { updateCalcDisplay(calcBuf, calcExpr); }
}
function updateCalcDisplay(result, expr) {
    const r = document.getElementById('calc-result'); const e = document.getElementById('calc-expr');
    if (r) r.textContent = result; if (e) e.textContent = expr;
}

// ─── OFFLINE ─────────────────────────────────────────────────
function setupOffline() {
    const banner = document.getElementById('offline-banner');
    const update = () => {
        if (!navigator.onLine) { banner?.classList.add('show'); localStorage.setItem('deadZoneLoc', JSON.stringify([simLat, simLng])); }
        else { banner?.classList.remove('show'); }
    };
    window.addEventListener('online', update); window.addEventListener('offline', update);
    if (!navigator.onLine) banner?.classList.add('show');
}

// ─── GUARDIAN PINGS ──────────────────────────────────────────
function startGuardianPings() {
    sendPing(); if (pingTimer) clearInterval(pingTimer);
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
    if (fromApi && Array.isArray(fromApi)) { localStorage.setItem('emergencyContacts', JSON.stringify(fromApi)); return fromApi; }
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
        list.innerHTML = `<div class="glass-panel" style="text-align:center;padding:24px;"><i class="fa-solid fa-users" style="font-size:2rem;color:var(--text-muted);margin-bottom:8px;display:block;"></i><p style="color:var(--text-muted);font-size:0.88rem;">No guardians yet.</p></div>`;
        return;
    }
    list.innerHTML = contacts.map((c, i) => `
        <div class="contact-card">
            <div style="display:flex;align-items:center;gap:12px;">
                <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
                <div class="contact-info">
                    <span style="font-weight:700;font-size:1rem;">${c.name}</span>
                    <span style="font-size:0.8rem;color:var(--text-muted);"><i class="fa-solid fa-phone" style="font-size:0.7rem;"></i> ${c.phone}</span>
                </div>
            </div>
            <div class="contact-actions">
                <a href="tel:${c.phone}" class="secondary-btn" style="width:auto;padding:7px 12px;border-radius:10px;"><i class="fa-solid fa-phone" style="color:var(--safe-color);"></i></a>
                <button onclick="removeContact('${c.id || i}')" class="secondary-btn" style="width:auto;padding:7px 12px;border-radius:10px;color:var(--danger-color);border-color:rgba(255,61,90,0.25);"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}
window.removeContact = async (idOrIdx) => {
    if (!confirm('Remove this guardian?')) return;
    const ok = await apiDel(`/contacts/${idOrIdx}`);
    if (!ok) {
        const arr = JSON.parse(localStorage.getItem('emergencyContacts') || '[]');
        const idx = parseInt(idOrIdx);
        if (!isNaN(idx)) arr.splice(idx, 1);
        else { const i = arr.findIndex(c => c.id === idOrIdx); if (i !== -1) arr.splice(i, 1); }
        localStorage.setItem('emergencyContacts', JSON.stringify(arr));
    }
    await renderContactsList(); showToast('Guardian removed');
};

// ─── ALERTS ──────────────────────────────────────────────────
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
    const arr = fromApi && Array.isArray(fromApi) ? fromApi : JSON.parse(localStorage.getItem('alertLog') || '[]');
    renderAlertList(arr);
}
function renderAlertList(arr) {
    const list  = document.getElementById('mini-alert-list');
    const cntEl = document.getElementById('alert-count');
    if (!list) return;
    if (!arr.length) { list.innerHTML = '<li class="alert-item"><span style="color:var(--text-muted);">System monitoring… No alerts yet.</span></li>'; if (cntEl) cntEl.style.display = 'none'; return; }
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

// ─── CONFIRM REPORT ───────────────────────────────────────────
window.confirmReport = async (lat, lng, type, desc) => {
    const fear = calcFear(parseFloat(lat), parseFloat(lng), currentTimeMode);
    const result = await apiPost('/reports', { lat: parseFloat(lat), lng: parseFloat(lng), type, description: desc, time_of_incident: new Date().toLocaleTimeString(), fear_score: fear.score });
    if (!result) {
        const arr = JSON.parse(localStorage.getItem('incidentReports') || '[]');
        arr.push({ lat, lng, type, description: desc, time: new Date().toLocaleTimeString() });
        localStorage.setItem('incidentReports', JSON.stringify(arr));
    }
    if (map) map.closePopup();
    showToast('✅ Report submitted!');
    logAlert('Report', `New ${type} report submitted`);
    updateStats();
};

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
    const fg = type === 'success' || type === 'warn' ? '#030b0e' : '#fff';
    el.style.cssText += `background:${bg};color:${fg};`;
    el.textContent = msg; el.style.display = 'block'; el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); }, 3200);
}

// ─── PAGE: DASHBOARD ──────────────────────────────────────────
async function setupDashboard() {
    if (!document.getElementById('map')) return;

    map = createMap('map', DEHRADUN, 13);
    if (!map) return;

    addHeatmap();
    addCrimeZones();
    await addReportMarkers();
    tryRealLocation();

    // Fear at center
    const fear = calcFear(DEHRADUN[0], DEHRADUN[1], currentTimeMode);
    updateFearUI(fear.score, fear.crimeScore, fear.timeMult, fear.isolation);

    // Route button
    document.getElementById('find-route-btn')?.addEventListener('click', generateRoutes);

    // Map click → fear popup
    map.on('click', e => {
        const { lat, lng } = e.latlng;
        const f = calcFear(lat, lng, currentTimeMode);
        const { label, color } = fearLabel(f.score);
        L.popup().setLatLng(e.latlng).setContent(`
            <div style="font-family:'Inter',sans-serif;line-height:1.7;min-width:180px;">
                <strong style="color:#00e5b0;">📍 Fear Score</strong><br>
                <span style="color:${color};font-size:1.3rem;font-weight:800;">${f.score}</span>
                <span style="color:#888;">/100</span>
                <strong style="color:${color};"> ${label}</strong><br>
                <small style="color:#888;">${lat.toFixed(5)}, ${lng.toFixed(5)}</small><br>
                <a href="report.html" style="color:#00e5b0;font-size:0.85rem;">Report Incident →</a>
            </div>
        `).openOn(map);
    });

    // Setup autocomplete for origin + destination
    setupAutocomplete('origin-input', 'origin-ac-list', place => {
        originCoords = place;
    });
    setupAutocomplete('dest-input', 'dest-ac-list', place => {
        destCoords = place;
        // Auto-pan map to destination
        if (map) map.setView([place.lat, place.lng], 12);
    });

    // Toggles
    document.getElementById('heatmap-toggle')?.addEventListener('change', e => toggleHeatmap(e.target.checked));
    document.getElementById('zones-toggle')?.addEventListener('change',   e => toggleCrimeZones(e.target.checked));

    setupDecoy();
    setupEvidence();
    setupOffline();
    startGuardianPings();
    await loadAndRenderAlerts();
    await updateStats();
}

// ─── PAGE: GUARDIAN ──────────────────────────────────────────
async function setupGuardianPage() {
    if (!document.getElementById('guardian-map')) return;
    const gMap = createMap('guardian-map', DEHRADUN, 14);
    if (!gMap) return;
    addCrimeZones();

    let gMarker = null;
    async function refresh() {
        const locData = await apiGet('/location');
        const pos = locData ? [locData.lat, locData.lng] : JSON.parse(localStorage.getItem('currentUserLoc') || 'null') || DEHRADUN;
        if (!gMarker) { gMarker = L.marker(pos, { icon: dotIcon('#00e5b0', 14, true) }).addTo(gMap).bindPopup('📍 User Location'); gMap.setView(pos, 15); }
        else gMarker.setLatLng(pos);
        const f = calcFear(pos[0], pos[1], currentTimeMode);
        const { label, cls } = fearLabel(f.score);
        const fearEl = document.getElementById('guardian-fear');
        if (fearEl) { fearEl.className = `fear-badge ${cls}`; fearEl.innerHTML = `<i class="fa-solid fa-shield-check"></i> ${f.score}/100 — ${label}`; }
        const pt = document.getElementById('guardian-last-ping');
        if (pt) pt.textContent = localStorage.getItem('lastPingTime') || '--:--';
        await loadAndRenderAlerts();
    }
    refresh(); setInterval(refresh, 8000);

    const cc = document.getElementById('guardian-contact-list');
    if (cc) {
        const contacts = await getContacts();
        cc.innerHTML = !contacts.length
            ? `<p style="color:var(--text-muted);font-size:0.85rem;">No guardians. <a href="contacts.html" style="color:var(--accent-primary);">Add →</a></p>`
            : contacts.slice(0, 3).map(c => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--glass-border);">
                <div class="contact-avatar" style="width:32px;height:32px;font-size:0.85rem;flex-shrink:0;">${c.name.charAt(0).toUpperCase()}</div>
                <div><div style="font-weight:600;font-size:0.88rem;">${c.name}</div><div style="font-size:0.73rem;color:var(--text-muted);">${c.phone}</div></div>
                <div class="badge badge-live" style="margin-left:auto;font-size:0.6rem;padding:3px 8px;">Active</div>
            </div>`).join('');
    }
    const linkEl = document.getElementById('guardian-share-link');
    if (linkEl) linkEl.textContent = `zensafe.app/track/${Math.random().toString(36).slice(2, 10)}`;
    setupOffline(); startGuardianPings();
}

// ─── PAGE: REPORT ────────────────────────────────────────────
async function setupReportPage() {
    if (!document.getElementById('report-map')) return;
    const rMap = createMap('report-map', DEHRADUN, 13);
    if (!rMap) return;
    CRIME_ZONES.forEach(z => {
        const col = z.risk > 80 ? '#ff3d5a' : z.risk > 60 ? '#ff8c00' : '#ffb700';
        L.polygon(z.coords, { color: col, weight: 1.5, fillColor: col, fillOpacity: 0.09 }).addTo(rMap)
            .bindTooltip(`⚠️ ${z.name} — Risk: ${z.risk}/100`, { sticky: true });
    });
    let selectedType = 'Suspicious Activity';
    document.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.textContent.trim().replace(/^[^\w]+/, '').trim();
        });
    });
    rMap.on('click', e => {
        const { lat, lng } = e.latlng;
        const desc = (document.getElementById('report-desc')?.value || '').trim();
        const fear = calcFear(lat, lng, currentTimeMode);
        const { label, color } = fearLabel(fear.score);
        L.marker([lat, lng]).addTo(rMap).bindPopup(`
            <div style="min-width:200px;line-height:1.7;">
                <strong>${selectedType}</strong><br>
                ${desc ? `<em style="color:#888;">${desc}</em><br>` : ''}
                Fear Score: <strong style="color:${color}">${fear.score}/100</strong> — ${label}<br>
                <button onclick="confirmReport(${lat},${lng},'${selectedType}','${desc.replace(/'/g,"\'")}')"
                    style="margin-top:8px;background:#00e5b0;color:#030b0e;border:none;padding:6px 16px;border-radius:7px;cursor:pointer;font-weight:700;font-size:0.82rem;width:100%;">
                    ✓ Submit Report
                </button>
            </div>
        `).openPopup();
    });
    setupOffline(); await loadRecentReports();
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
            <span>${ic[r.type] || '📌'}</span>
            <div style="flex:1;"><div style="font-size:0.82rem;font-weight:600;">${r.type}</div><div style="font-size:0.72rem;color:var(--text-muted);">${r.time_of_incident || r.time || ''}</div></div>
            <span style="font-size:0.72rem;color:var(--text-muted);">FS: ${r.fear_score || '--'}</span>
        </div>
    `).join('');
}

// ─── PAGE: SOS ───────────────────────────────────────────────
function setupSOSPage() {
    if (!document.getElementById('sos-btn') && !document.getElementById('sos-modal')) return;
    document.getElementById('sos-btn')?.addEventListener('click', startSOSCountdown);
    document.getElementById('fake-call-btn-sos')?.addEventListener('click', showFakeCall);
    setupEvidence(); setupOffline(); loadAndRenderAlerts();
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const el = document.getElementById('coords-display');
            if (el) el.innerHTML = `<span style="color:var(--safe-color);">${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}</span>`;
        }, () => {
            const saved = JSON.parse(localStorage.getItem('currentUserLoc') || 'null');
            const el = document.getElementById('coords-display');
            if (el && saved) el.innerHTML = `<span style="color:var(--warn-color);">${saved[0].toFixed(5)}, ${saved[1].toFixed(5)}</span> <em style="font-size:0.7rem;color:#666;">(cached)</em>`;
        }, { timeout: 4000 });
    }
}

// ─── PAGE: CONTACTS ──────────────────────────────────────────
function setupContactsPage() {
    if (!document.getElementById('contacts-list') && !document.getElementById('contact-form')) return;
    renderContactsList(); setupOffline(); startGuardianPings();
    const form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const nameEl = document.getElementById('c-name'), phoneEl = document.getElementById('c-phone');
        const name = nameEl?.value.trim(), phone = phoneEl?.value.trim();
        if (!name || !phone) { showToast('Enter name and phone', 'warn'); return; }
        const result = await apiPost('/contacts', { name, phone });
        if (!result) {
            const arr = JSON.parse(localStorage.getItem('emergencyContacts') || '[]');
            if (arr.length >= 5) { showToast('Max 5 guardians allowed', 'warn'); return; }
            arr.push({ id: Date.now().toString(), name, phone });
            localStorage.setItem('emergencyContacts', JSON.stringify(arr));
        }
        if (nameEl) nameEl.value = ''; if (phoneEl) phoneEl.value = '';
        await renderContactsList(); showToast(`✅ ${name} added as guardian`);
        logAlert('Guardian', `${name} added as guardian`);
    });
}

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    document.querySelectorAll('.theme-toggle').forEach(btn => btn.addEventListener('click', toggleTheme));
    await checkApiHealth();
    setInterval(checkApiHealth, 30000);

    await setupDashboard();
    await setupGuardianPage();
    await setupReportPage();
    setupSOSPage();
    setupContactsPage();
    setupOffline();
});