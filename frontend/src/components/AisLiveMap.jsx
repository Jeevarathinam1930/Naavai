import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Ship, Anchor, AlertTriangle, Compass, Navigation, Eye,
  Activity, ShieldAlert, Layers, MapPin, ZoomIn, Info, CheckCircle2
} from 'lucide-react';

const PORT_LOCATIONS = {
  Paradip: { lat: 20.264, lon: 86.671, draft: 14.5, berths: 2, color: '#f59e0b', desc: 'Mechanized Coal Berth 1 & 2' },
  Visakhapatnam: { lat: 17.690, lon: 83.298, draft: 18.1, berths: 2, color: '#06b6d4', desc: 'Outer Harbor Deepwater Capesize Jetty' },
  Haldia: { lat: 22.023, lon: 88.064, draft: 7.5, berths: 1, color: '#10b981', desc: 'Riverine Dock Complex (Geared Vessels Only)' },
  Dhamra: { lat: 20.832, lon: 86.963, draft: 17.5, berths: 2, color: '#a855f7', desc: 'Deepwater Bulk Cargo Terminal' },
};

const DEFAULT_ANCHORAGES = {
  Paradip: [
    [19.95, 86.55], [19.95, 86.85], [20.20, 86.85], [20.20, 86.55]
  ],
  Visakhapatnam: [
    [17.55, 83.20], [17.55, 83.45], [17.80, 83.45], [17.80, 83.20]
  ],
  Haldia: [
    [21.45, 87.85], [21.45, 88.15], [21.70, 88.15], [21.70, 87.85]
  ],
  Dhamra: [
    [20.75, 86.90], [20.75, 87.20], [21.05, 87.20], [21.05, 86.90]
  ]
};

export default function AisLiveMap({ vessels = [], anchorages = {}, onSelectVessel }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [filterCriticalOnly, setFilterCriticalOnly] = useState(false);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showPorts, setShowPorts] = useState(true);

  // Aggregated Stats
  const totalDemurrageUsd = vessels.reduce((acc, v) => acc + (v.demurrage_accrued_usd || 0), 0);
  const totalDemurrageInrLakhs = vessels.reduce((acc, v) => acc + (v.demurrage_accrued_inr_lakhs || 0), 0);
  const criticalCount = vessels.filter(v => v.risk_status === 'CRITICAL').length;
  const warningCount = vessels.filter(v => v.risk_status === 'WARNING').length;

  const filteredVessels = filterCriticalOnly
    ? vessels.filter(v => v.risk_status === 'CRITICAL' || v.risk_status === 'WARNING')
    : vessels;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Center on Bay of Bengal covering East Coast Indian Ports
      const map = L.map(mapContainerRef.current, {
        center: [19.2, 85.8],
        zoom: 7,
        zoomControl: false,
        attributionControl: false
      });

      // CartoDB DarkMatter basemap for high-tech satellite navigation UI
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        subdomains: 'abcd',
      }).addTo(map);

      // Attribution in compact format
      L.control.attribution({ position: 'bottomright', prefix: false })
        .addAttribution('&copy; <a href="https://carto.com/">CARTO</a> | AIS Satellite Telemetry · Team F6')
        .addTo(map);

      // Zoom control in bottom-left
      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      // Map cleanup deferred to unmount
    };
  }, []);

  // Update Layers (Anchorages, Ports, Vessels)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous dynamic layers
    if (map._vesselLayerGroup) map.removeLayer(map._vesselLayerGroup);
    if (map._geofenceLayerGroup) map.removeLayer(map._geofenceLayerGroup);
    if (map._portLayerGroup) map.removeLayer(map._portLayerGroup);

    const vesselGroup = L.layerGroup().addTo(map);
    const geofenceGroup = L.layerGroup().addTo(map);
    const portGroup = L.layerGroup().addTo(map);

    map._vesselLayerGroup = vesselGroup;
    map._geofenceLayerGroup = geofenceGroup;
    map._portLayerGroup = portGroup;
    markersRef.current = {};

    // 1. Draw Anchorage Geofences
    if (showGeofences) {
      const activeAnchorages = Object.keys(anchorages).length > 0 ? anchorages : DEFAULT_ANCHORAGES;
      Object.entries(activeAnchorages).map(([name, coords]) => {
        const portColor = PORT_LOCATIONS[name]?.color || '#3b82f6';
        const polygon = L.polygon(coords, {
          color: portColor,
          weight: 2,
          opacity: 0.85,
          fillColor: portColor,
          fillOpacity: 0.12,
          dashArray: '4, 6'
        }).addTo(geofenceGroup);

        polygon.bindTooltip(
          `<div class="font-bold text-xs" style="color: ${portColor}">📡 ${name.toUpperCase()} SATELLITE GEOFENCE</div><div class="text-[10px] text-slate-300">Shapely Polygon Verified Zone</div>`,
          { permanent: false, direction: 'center', className: 'bg-slate-900 border border-slate-700 text-white rounded p-1.5' }
        );
      });
    }

    // 2. Draw Ports
    if (showPorts) {
      Object.entries(PORT_LOCATIONS).forEach(([name, p]) => {
        const portIcon = L.divIcon({
          className: 'custom-port-icon',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-8 h-8 rounded-full border-2 border-dashed animate-spin-slow" style="border-color: ${p.color}88"></div>
              <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-lg border text-white text-[10px] font-bold"
                   style="background: #0f172a; border-color: ${p.color};">
                ⚓
              </div>
              <span class="absolute top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-950/90 text-slate-200 border border-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                ${name} (${p.draft}m)
              </span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([p.lat, p.lon], { icon: portIcon }).addTo(portGroup);
        marker.bindPopup(`
          <div class="p-3 text-slate-100 text-xs min-w-[200px]">
            <div class="font-bold text-sm text-blue-400 mb-1 flex items-center gap-1.5">
              <span>⚓</span> ${name} Port Terminal
            </div>
            <div class="text-slate-400 text-[11px] mb-2">${p.desc}</div>
            <div class="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-900/90 p-2 rounded border border-slate-700">
              <div><span class="text-slate-500">Max Permissible Draft:</span> <strong class="text-emerald-400">${p.draft} m</strong></div>
              <div><span class="text-slate-500">Operational Coal Berths:</span> <strong class="text-blue-300">${p.berths} Berths</strong></div>
            </div>
          </div>
        `);
      });
    }

    // 3. Draw Vessels
    filteredVessels.forEach(v => {
      const isCritical = v.risk_status === 'CRITICAL';
      const isWarning = v.risk_status === 'WARNING';
      const color = isCritical ? '#f43f5e' : isWarning ? '#f59e0b' : '#10b981';
      const glow = isCritical ? 'rgba(244, 63, 94, 0.5)' : isWarning ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.3)';

      const vesselIcon = L.divIcon({
        className: 'custom-vessel-icon',
        html: `
          <div class="relative cursor-pointer group">
            ${(isCritical || isWarning) ? `
              <div class="absolute -inset-2 rounded-full animate-ping opacity-60" style="background: ${glow}"></div>
            ` : ''}
            <div class="relative w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-2xl transition-transform hover:scale-125"
                 style="background: #090d16; border-color: ${color}; box-shadow: 0 0 15px ${glow}; transform: rotate(${v.heading || 0}deg);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 19 21 12 17 5 21 12 2" fill="${color}33"></polygon>
              </svg>
            </div>
            <span class="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/95 text-slate-100 border text-[10px] font-bold px-2 py-0.5 rounded shadow-lg pointer-events-none"
                  style="border-color: ${color}99;">
              ${v.name}
            </span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([v.lat, v.lon], { icon: vesselIcon }).addTo(vesselGroup);
      markersRef.current[v.name] = marker;

      marker.on('click', () => {
        setSelectedVessel(v);
        if (onSelectVessel) onSelectVessel(v);
      });

      // Interactive Popup
      marker.bindPopup(`
        <div class="p-3 text-slate-100 text-xs min-w-[260px] font-sans">
          <div class="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-2">
            <div>
              <div class="font-bold text-sm text-white flex items-center gap-1.5">
                <span style="color: ${color}">🚢</span> ${v.name}
              </div>
              <div class="text-[10px] text-slate-400 font-mono">MMSI: ${v.mmi} · ${v.vessel_class} · ${v.dwt?.toLocaleString()} DWT</div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase border"
                  style="background: ${color}22; color: ${color}; border-color: ${color};">
              ${v.risk_status}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px] mb-2.5">
            <div class="bg-slate-900/90 p-2 rounded border border-slate-800">
              <span class="text-slate-500 block">Cargo Payload:</span>
              <strong class="text-slate-200">${v.cargo}</strong>
            </div>
            <div class="bg-slate-900/90 p-2 rounded border border-slate-800">
              <span class="text-slate-500 block">Origin Port:</span>
              <strong class="text-slate-200">${v.origin || 'Overseas'}</strong>
            </div>
            <div class="bg-slate-900/90 p-2 rounded border border-slate-800">
              <span class="text-slate-500 block">Days at Anchor:</span>
              <strong class="${isCritical ? 'text-rose-400 font-extrabold' : 'text-slate-200'}">
                ${v.days_at_anchor} days (Allowed: ${v.allowed_laytime_days}d)
              </strong>
            </div>
            <div class="bg-slate-900/90 p-2 rounded border border-slate-800">
              <span class="text-slate-500 block">Daily Demurrage:</span>
              <strong class="text-amber-300">$${(v.daily_demurrage_rate_usd || 20000).toLocaleString()} / Day</strong>
            </div>
          </div>

          <div class="bg-rose-950/40 border border-rose-800/60 p-2.5 rounded text-[11px] mb-2">
            <div class="flex justify-between items-center">
              <span class="text-rose-300 font-semibold">Accrued Demurrage Loss:</span>
              <strong class="text-rose-400 font-mono text-xs">
                ${v.demurrage_accrued_usd > 0 ? `$${v.demurrage_accrued_usd.toLocaleString()}` : '$0.00'}
              </strong>
            </div>
            ${v.demurrage_accrued_inr_lakhs > 0 ? `
              <div class="text-right text-[10px] text-rose-300 font-mono">
                ≈ ₹${v.demurrage_accrued_inr_lakhs} Lakhs
              </div>
            ` : ''}
          </div>

          <div class="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800 flex items-center justify-between">
            <span>Anchorage Geofence:</span>
            <span class="text-blue-400 font-bold">✓ ${v.verified_anchorage || v.port} Roads</span>
          </div>
        </div>
      `, { maxWidth: 300 });
    });
  }, [filteredVessels, anchorages, showGeofences, showPorts]);

  // Pan & Zoom Helpers
  const flyToLocation = (lat, lon, zoom = 10) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lon], zoom, { duration: 1.5 });
    }
  };

  const focusVessel = (v) => {
    setSelectedVessel(v);
    flyToLocation(v.lat, v.lon, 11);
    const marker = markersRef.current[v.name];
    if (marker) {
      setTimeout(() => marker.openPopup(), 600);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Telemetry HUD Bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-slate-400 text-xs font-mono uppercase block">Tracked Bulk Carriers</span>
            <div className="text-xl font-black text-blue-400 flex items-center gap-2">
              <Ship className="h-5 w-5" /> {vessels.length} Vessels
            </div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <span className="text-slate-400 text-xs font-mono uppercase block">Active Demurrage Exposure</span>
            <div className="text-xl font-black text-rose-400 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> ${totalDemurrageUsd.toLocaleString()}
              <span className="text-xs font-normal text-slate-400"> (₹{totalDemurrageInrLakhs.toFixed(1)} Lakhs)</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <span className="text-slate-400 text-xs font-mono uppercase block">Queue Risk Status</span>
            <div className="text-xs font-bold mt-1 flex gap-2">
              <span className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700">
                {criticalCount} Critical
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700">
                {warningCount} Warning
              </span>
            </div>
          </div>
        </div>

        {/* Quick Map Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCriticalOnly(!filterCriticalOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
              filterCriticalOnly
                ? 'bg-rose-600 text-white border-rose-500 shadow-lg'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {filterCriticalOnly ? 'Showing At-Risk Only' : 'Filter Demurrage Risk'}
          </button>

          <button
            onClick={() => setShowGeofences(!showGeofences)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
              showGeofences ? 'bg-blue-900/80 text-blue-200 border-blue-600' : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Geofences
          </button>

          <div className="h-6 w-px bg-slate-700"></div>

          {/* Quick Zoom Buttons */}
          <span className="text-xs text-slate-400 font-mono hidden md:inline">Jump:</span>
          <button
            onClick={() => flyToLocation(19.2, 85.8, 7)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs transition"
          >
            Overview
          </button>
          <button
            onClick={() => flyToLocation(20.08, 86.68, 10)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-amber-300 border border-amber-900/60 rounded text-xs transition"
          >
            Paradip
          </button>
          <button
            onClick={() => flyToLocation(17.65, 83.30, 10)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-cyan-300 border border-cyan-900/60 rounded text-xs transition"
          >
            Vizag
          </button>
          <button
            onClick={() => flyToLocation(21.55, 87.98, 10)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-emerald-300 border border-emerald-900/60 rounded text-xs transition"
          >
            Haldia
          </button>
          <button
            onClick={() => flyToLocation(20.88, 87.05, 10)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-700 text-purple-300 border border-purple-900/60 rounded text-xs transition"
          >
            Dhamra
          </button>
        </div>
      </div>

      {/* Main Map + Side Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Interactive Leaflet Map Container */}
        <div className="lg:col-span-3 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-2xl relative">
          <div
            ref={mapContainerRef}
            className="w-full h-[540px] z-10"
            style={{ background: '#090d16' }}
          />

          {/* Map Floating Legend */}
          <div className="absolute top-4 right-4 z-20 bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-2 pointer-events-auto max-w-[200px]">
            <div className="font-bold text-slate-200 border-b border-slate-700/80 pb-1 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-blue-400" /> Maritime Telemetry
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50 animate-pulse"></span>
                <span className="text-slate-300">Demurrage Delay &gt; 3d</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-slate-300">Queue Delay 2–3d</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-300">Normal (&lt; 2d laytime)</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <span className="w-2.5 h-2.5 border-2 border-dashed border-blue-400"></span>
                <span className="text-slate-400">AIS Geofence Boundary</span>
              </div>
            </div>
          </div>
        </div>

        {/* Vessel Sidebar Fleet Card List */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col h-[540px]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" /> Monitored Fleet
            </h3>
            <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
              {filteredVessels.length} active
            </span>
          </div>

          <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
            {filteredVessels.map(v => {
              const isCritical = v.risk_status === 'CRITICAL';
              const isWarning = v.risk_status === 'WARNING';
              const isSelected = selectedVessel?.name === v.name;

              return (
                <div
                  key={v.name}
                  onClick={() => focusVessel(v)}
                  className={`p-3 rounded-lg border cursor-pointer transition text-xs ${
                    isSelected
                      ? 'bg-blue-950/60 border-blue-500 shadow-md ring-1 ring-blue-400'
                      : isCritical
                      ? 'bg-rose-950/20 border-rose-800/60 hover:bg-rose-950/40'
                      : 'bg-slate-900/70 border-slate-700/60 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <strong className="text-white text-xs block font-bold">{v.name}</strong>
                      <span className="text-[10px] text-slate-400 font-mono">{v.vessel_class} · {v.dwt?.toLocaleString()} DWT</span>
                    </div>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                        isCritical
                          ? 'bg-rose-900/60 text-rose-300 border-rose-600'
                          : isWarning
                          ? 'bg-amber-900/50 text-amber-300 border-amber-600'
                          : 'bg-emerald-900/40 text-emerald-300 border-emerald-600'
                      }`}
                    >
                      {v.risk_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[11px] mb-2 text-slate-300">
                    <div><span className="text-slate-500">Port:</span> {v.port}</div>
                    <div><span className="text-slate-500">Wait:</span> <strong className={isCritical ? 'text-rose-400' : 'text-slate-200'}>{v.days_at_anchor}d</strong></div>
                  </div>

                  {v.demurrage_accrued_usd > 0 ? (
                    <div className="bg-slate-950/80 p-1.5 rounded border border-rose-900/50 flex justify-between items-center text-[10px]">
                      <span className="text-rose-300">Penalty Accrued:</span>
                      <strong className="text-rose-400 font-mono">${v.demurrage_accrued_usd.toLocaleString()}</strong>
                    </div>
                  ) : (
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Within Free Laytime
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
