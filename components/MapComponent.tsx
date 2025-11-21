
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents, Circle } from 'react-leaflet';
import { GeoPoint, PointType, PointLabelMode } from '../types';

// --- CRITICAL FIX FOR PDF EXPORT ---
// We must disable 3D CSS transforms globally before any map is initialized.
// This forces Leaflet to use top/left positioning, which html2canvas can capture.
(L.Browser as any).any3d = false;

// Fix Leaflet default icon
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icon Generators
const createDivIconHtml = (color1: string, color2: string, innerText: string, size: number, isSmall: boolean, labelText: string | null) => `
  <div class="relative">
    <div class="marker-pin transition-transform duration-300" style="
      background: linear-gradient(135deg, ${color1}, ${color2});
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: ${isSmall ? '2px' : '3px'} solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    ">
      <span style="
        color: white; 
        font-weight: 800; 
        font-family: sans-serif; 
        font-size: ${isSmall ? '10px' : '12px'};
      ">${innerText}</span>
    </div>
    ${labelText ? `
      <div style="
        position: absolute;
        top: ${size + 4}px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(15, 23, 42, 0.9);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        white-space: nowrap;
        border: 1px solid rgba(51, 65, 85, 0.5);
        pointer-events: none;
        z-index: 1000;
        text-shadow: 0 1px 2px black;
      ">
        ${labelText}
      </div>
    ` : ''}
  </div>
`;

const getIcon = (point: GeoPoint, index: number, isExporting: boolean, labelMode: PointLabelMode) => {
  const size = isExporting ? 24 : 32;
  
  // 1. Determine Inner Text (Short Code)
  let innerText = "";
  const idStr = String(point.id);
  
  if (point.type === PointType.GPS) innerText = String.fromCharCode(65 + (index % 26));
  else if (point.type === PointType.MANUAL) innerText = "M" + idStr.substring(0, Math.min(2, idStr.length));
  else if (point.type === PointType.STAKING) innerText = "S" + idStr.substring(0, Math.min(2, idStr.length));
  else if (point.type === PointType.INTERMEDIATE) innerText = "i";
  else innerText = "•";

  // 2. Determine External Label Text based on mode
  let labelText: string | null = null;
  
  if (labelMode === 'id') {
    labelText = idStr.substring(0, 8); // Show first 8 chars of UUID or full short ID
  } else if (labelMode === 'type') {
    labelText = point.type;
  } else if (labelMode === 'name') {
    // Fallback to Name -> Type -> ID
    labelText = point.name || point.type;
  }
  // If mode is 'none', labelText remains null

  let html = "";
  
  switch (point.type) {
    case PointType.GPS:
      html = createDivIconHtml('#3b82f6', '#1d4ed8', innerText, size, isExporting, labelText);
      break;
    case PointType.MANUAL:
      html = createDivIconHtml('#ec4899', '#be185d', innerText, size, isExporting, labelText);
      break;
    case PointType.STAKING:
      html = createDivIconHtml('#f59e0b', '#b45309', innerText, size, isExporting, labelText);
      break;
    case PointType.INTERMEDIATE:
      html = createDivIconHtml('#06b6d4', '#0e7490', innerText, size * 0.8, isExporting, labelText);
      break;
    default:
      html = createDivIconHtml('#64748b', '#334155', innerText, size, isExporting, labelText);
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: html,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
};

// --- Sub-components for Map Logic ---

const MapController = ({ 
  center, 
  points, 
  fitBounds 
}: { 
  center: { lat: number; lng: number; zoom?: number } | null,
  points: GeoPoint[],
  fitBounds: boolean
}) => {
  const map = useMap();

  // Handle Center/Zoom updates
  useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lng], center.zoom || 16, { duration: 1.5 });
    }
  }, [center, map]);

  // Handle Fit Bounds (Export)
  useEffect(() => {
    if (fitBounds && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19, animate: false });
    }
  }, [fitBounds, points, map]);

  return null;
};

const MapEvents = ({ 
  onClick, 
  isManualMode 
}: { 
  onClick: (lat: number, lng: number) => void,
  isManualMode: boolean 
}) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  
  // Change cursor style based on mode
  const map = useMap();
  useEffect(() => {
    if (isManualMode) {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = 'grab';
    }
  }, [isManualMode, map]);

  return null;
};

// --- Main Component ---

interface MapComponentProps {
  points: GeoPoint[];
  activePointId: string | null;
  isStakingMode: boolean;
  isManualMode: boolean;
  gpsPosition: { lat: number; lng: number; accuracy: number } | null;
  centerOnLocation: { lat: number; lng: number; zoom?: number } | null;
  fitBoundsToPoints: boolean;
  hideUserPosition?: boolean;
  hideLines?: boolean;
  onMapClick: (lat: number, lng: number) => void;
  onPointClick: (id: string) => void;
  baseline?: { start: GeoPoint, end: GeoPoint } | null;
  pointLabelMode: PointLabelMode;
}

export const MapComponent: React.FC<MapComponentProps> = ({
  points,
  activePointId,
  isStakingMode,
  isManualMode,
  gpsPosition,
  centerOnLocation,
  fitBoundsToPoints,
  hideUserPosition = false,
  hideLines = false,
  onMapClick,
  onPointClick,
  baseline,
  pointLabelMode
}) => {
  // Cache-busting for CORS tiles (crucial for export)
  const [tileUrl] = useState(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?t=${Date.now()}`);

  return (
    <div id="map-container" className="h-full w-full relative bg-slate-900">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
        preferCanvas={false} // Use SVG for export compatibility
      >
        {/* 
           CORS Settings are critical here. 
           crossOrigin="anonymous" allows the canvas to read the image data.
        */}
        <TileLayer
          url={tileUrl}
          crossOrigin="anonymous"
          maxZoom={21}
        />
        
        <MapController 
          center={centerOnLocation} 
          points={points}
          fitBounds={fitBoundsToPoints}
        />

        <MapEvents onClick={onMapClick} isManualMode={isManualMode} />

        {/* Polylines (Boundaries) */}
        {!hideLines && points.length > 1 && (
          <>
            <Polyline 
              positions={points.map(p => [p.lat, p.lng])}
              pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.8 }}
            />
            {points.length > 2 && (
              <Polyline 
                positions={[
                  [points[points.length-1].lat, points[points.length-1].lng],
                  [points[0].lat, points[0].lng]
                ]}
                pathOptions={{ color: '#3b82f6', weight: 3, dashArray: '5, 10', opacity: 0.5 }}
              />
            )}
          </>
        )}

        {/* Staking Baseline */}
        {!hideLines && baseline && (
           <Polyline 
             positions={[
               [baseline.start.lat, baseline.start.lng],
               [baseline.end.lat, baseline.end.lng]
             ]}
             pathOptions={{ color: '#ec4899', weight: 2, dashArray: '10, 10', opacity: 0.8 }}
           />
        )}

        {/* Markers */}
        {points.map((point, idx) => (
          <React.Fragment key={point.id}>
            <Marker
              position={[point.lat, point.lng]}
              icon={getIcon(point, idx, fitBoundsToPoints, pointLabelMode)} // fitBoundsToPoints acts as 'isExporting' flag here
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onPointClick(point.id);
                }
              }}
            >
              {/* Only show popup if not exporting */}
              {!fitBoundsToPoints && (
                <Popup>
                   <div className="text-slate-800">
                      <strong>Point {idx + 1}</strong><br/>
                      Type: {point.type}<br/>
                      Lat: {point.lat.toFixed(6)}<br/>
                      Lng: {point.lng.toFixed(6)}<br/>
                      {point.name && <>Name: {point.name}</>}
                   </div>
                </Popup>
              )}
            </Marker>
            
            {/* Staking Lines (Visualizing path from previous) */}
            {!hideLines && point.distance && point.distance > 0 && idx > 0 && (
                <Polyline 
                  positions={[
                    [points[idx-1].lat, points[idx-1].lng],
                    [point.lat, point.lng]
                  ]}
                  pathOptions={{ 
                    color: '#f59e0b', 
                    weight: 4, 
                    opacity: 0.6 
                  }}
                />
            )}
          </React.Fragment>
        ))}

        {/* User Location (GPS Dot) */}
        {gpsPosition && !hideUserPosition && (
          <>
            <Circle 
              center={[gpsPosition.lat, gpsPosition.lng]}
              radius={gpsPosition.accuracy}
              pathOptions={{ 
                color: '#3b82f6', 
                fillColor: '#3b82f6', 
                fillOpacity: 0.15, 
                weight: 1 
              }}
            />
            <Marker 
              position={[gpsPosition.lat, gpsPosition.lng]}
              icon={L.divIcon({
                className: 'user-location-icon',
                html: `<div style="
                  width: 16px; 
                  height: 16px; 
                  background-color: #3b82f6; 
                  border: 3px solid white; 
                  border-radius: 50%; 
                  box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              })}
            />
          </>
        )}

      </MapContainer>
      
      {/* Compass UI (Overlay) - Hide on export */}
      {!fitBoundsToPoints && (
        <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2 rounded-full w-12 h-12 flex items-center justify-center shadow-xl">
            <div className="relative w-full h-full">
                 <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-red-500 translate-y-[-12px]">N</div>
                 <div className="w-1 h-4 bg-red-500 absolute top-1 left-1/2 -translate-x-1/2 rounded-full compass-needle origin-bottom-center" style={{ transform: 'translateX(-50%) rotate(0deg)' }} />
                 <div className="w-1 h-4 bg-slate-400 absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full compass-needle origin-top-center" style={{ transform: 'translateX(-50%) rotate(0deg)' }} />
            </div>
        </div>
      )}
      
      {/* Scale Bar (Mock) */}
      {!fitBoundsToPoints && (
        <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/80 backdrop-blur px-2 py-1 rounded text-xs font-mono border border-slate-700 shadow-lg">
           100 m
           <div className="w-full h-1 bg-slate-500 mt-0.5 flex justify-between">
              <div className="w-px h-1.5 bg-slate-300 -mt-0.5"></div>
              <div className="w-px h-1.5 bg-slate-300 -mt-0.5"></div>
           </div>
        </div>
      )}

    </div>
  );
};
