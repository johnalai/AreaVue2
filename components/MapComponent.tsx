
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents, Circle, Tooltip, CircleMarker, ScaleControl } from 'react-leaflet';
import { GeoPoint, PointType, PointLabelMode } from '../types';

// Add this interface augmentation
declare global {
  interface Window {
    triggerPointDelete: (id: string, e: any) => void;
  }
}

// --- LEAFLET CONFIGURATION ---
// Ensure 3D transforms are enabled for smooth performance
if (L && L.Browser) {
    (L.Browser as any).any3d = true;
}

// Fix Leaflet default icon
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper to generate consistent short labels
const getPointShortLabel = (point: GeoPoint, index: number) => {
  if (point.label) return point.label;
  const idStr = String(point.id);
  if (point.type === PointType.GPS) return String.fromCharCode(65 + (index % 26));
  if (point.type === PointType.MANUAL) return "M" + idStr.substring(0, Math.min(2, idStr.length));
  if (point.type === PointType.STAKING) return "S" + idStr.substring(0, Math.min(2, idStr.length));
  if (point.type === PointType.INTERMEDIATE) return "i";
  return String(index + 1);
};

// Custom Icon Generators
const createDivIconHtml = (
  color1: string, 
  color2: string, 
  innerText: string, 
  size: number, 
  isSmall: boolean, 
  labelText: string | null,
  turnDirection?: 'Left' | 'Right',
  pointId?: string
) => `
  <div class="relative group">
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
    
    ${!isSmall && pointId ? `
    <div 
      onclick="window.triggerPointDelete('${pointId}', event)"
      style="
        position: absolute; 
        top: -5px; 
        right: -5px; 
        width: 20px; 
        height: 20px; 
        background: white; 
        border-radius: 50%; 
        display: none; 
        align-items: center; 
        justify-content: center; 
        cursor: pointer; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        z-index: 500;
        border: 1px solid #fee2e2;
        pointer-events: auto;
      "
      class="group-hover:flex hover:bg-red-50 hover:scale-110 transition-transform"
      title="Delete Point"
    >
      <i class="fas fa-trash-alt" style="font-size: 10px; color: #ef4444;"></i>
    </div>
    ` : ''}
    
    ${turnDirection ? `
      <div style="
        position: absolute;
        top: -6px;
        ${turnDirection === 'Left' ? 'left: -8px;' : 'right: -8px;'}
        background-color: ${turnDirection === 'Left' ? '#8b5cf6' : '#10b981'};
        color: white;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        font-size: 10px;
        z-index: 50;
      ">
        <i class="fas fa-${turnDirection === 'Left' ? 'arrow-left' : 'arrow-right'}" style="transform: rotate(${turnDirection === 'Left' ? '-45deg' : '45deg'});"></i>
      </div>
    ` : ''}

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
  
  let innerText = "";
  if (point.label) {
     innerText = point.label;
     if (innerText.length > 2) {
         if (point.type === PointType.GPS) innerText = innerText.substring(0, 2);
         else if (point.type === PointType.MANUAL) innerText = "M" + String(point.id).substring(0, 1);
     }
  } else {
      const idStr = String(point.id);
      if (point.type === PointType.GPS) innerText = String.fromCharCode(65 + (index % 26));
      else if (point.type === PointType.MANUAL) innerText = "M" + idStr.substring(0, Math.min(1, idStr.length));
      else if (point.type === PointType.STAKING) innerText = "S" + idStr.substring(0, Math.min(1, idStr.length));
      else if (point.type === PointType.INTERMEDIATE) innerText = "i";
      else innerText = "•";
  }

  let labelText: string | null = null;
  if (labelMode === 'id') labelText = point.label || String(point.id).substring(0, 8); 
  else if (labelMode === 'type') labelText = point.type;
  else if (labelMode === 'name') labelText = point.name || point.label || point.type;

  let html = "";
  switch (point.type) {
    case PointType.GPS:
      html = createDivIconHtml('#3b82f6', '#1d4ed8', innerText, size, isExporting, labelText, undefined, point.id);
      break;
    case PointType.MANUAL:
      html = createDivIconHtml('#ec4899', '#be185d', innerText, size, isExporting, labelText, undefined, point.id);
      break;
    case PointType.STAKING:
      html = createDivIconHtml('#f59e0b', '#b45309', innerText, size, isExporting, labelText, point.turnDirection, point.id);
      break;
    case PointType.INTERMEDIATE:
      html = createDivIconHtml('#06b6d4', '#0e7490', innerText, size * 0.8, isExporting, labelText, undefined, point.id);
      break;
    default:
      html = createDivIconHtml('#64748b', '#334155', innerText, size, isExporting, labelText, undefined, point.id);
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: html,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
};

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

  useEffect(() => {
    if (center) {
      map.flyTo([center.lat, center.lng], center.zoom || 18, { duration: 1.5 });
    }
  }, [center, map]);

  useEffect(() => {
    if (fitBounds && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 21, animate: false });
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
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = isManualMode ? 'crosshair' : 'grab';
  }, [isManualMode, map]);
  return null;
};

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
  onPointDelete: (id: string) => void;
  onPointMove: (id: string, lat: number, lng: number) => void;
  baseline?: { start: GeoPoint, end: GeoPoint } | null;
  pointLabelMode: PointLabelMode;
  navigationTarget: GeoPoint | null;
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
  onPointDelete,
  onPointMove,
  baseline,
  pointLabelMode,
  navigationTarget
}) => {
  const [heading, setHeading] = useState(0);

  const callbacksRef = useRef({ onPointClick, onPointDelete, onPointMove });
  useEffect(() => {
    callbacksRef.current = { onPointClick, onPointDelete, onPointMove };
  }, [onPointClick, onPointDelete, onPointMove]);

  useEffect(() => {
    window.triggerPointDelete = (id, e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (e && e.preventDefault) e.preventDefault();
      callbacksRef.current.onPointDelete(id);
    };
  }, []);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let compass = 0;
      const evt = e as any;
      if (evt.webkitCompassHeading) {
        compass = evt.webkitCompassHeading;
      } else if (e.alpha !== null) {
        compass = Math.abs(e.alpha - 360);
      }
      setHeading(compass);
    };
    if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
    };
  }, []);

  return (
    <div id="map-container" className="h-full w-full relative bg-slate-900">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        maxZoom={22} // Restored high zoom cap
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
        preferCanvas={false}
      >
        <TileLayer
          // Use standard Google Hybrid with subdomains for speed/reliability
          url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          subdomains={['mt0','mt1','mt2','mt3']}
          
          // --- STABLE CONFIGURATION ---
          maxNativeZoom={20} // High resolution imagery
          maxZoom={22}       // Allow slight digital zoom for precision
          // REMOVED crossOrigin="anonymous" to fix disappearing tiles
        />
        
        <MapController 
          center={centerOnLocation} 
          points={points}
          fitBounds={fitBoundsToPoints}
        />

        <MapEvents onClick={onMapClick} isManualMode={isManualMode} />

        {!fitBoundsToPoints && (
          <ScaleControl position="bottomleft" imperial={false} />
        )}

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

        {!hideLines && baseline && (
           <Polyline 
             positions={[
               [baseline.start.lat, baseline.start.lng],
               [baseline.end.lat, baseline.end.lng]
             ]}
             pathOptions={{ color: '#ec4899', weight: 2, dashArray: '10, 10', opacity: 0.8 }}
           />
        )}
        
        {!hideLines && navigationTarget && gpsPosition && (
            <Polyline
                positions={[
                    [gpsPosition.lat, gpsPosition.lng],
                    [navigationTarget.lat, navigationTarget.lng]
                ]}
                pathOptions={{
                    color: '#0ea5e9', weight: 4, dashArray: '10, 10', opacity: 0.8
                }}
            />
        )}

        {points.map((point, idx) => (
          <React.Fragment key={point.id}>
            {navigationTarget && navigationTarget.id === point.id && !hideLines && (
                 <>
                   <div className="leaflet-marker-icon leaflet-zoom-animated leaflet-interactive" style={{ left: 0, top: 0, transform: `translate3d(0px,0px,0px)`, zIndex: 100 }}></div>
                   <CircleMarker center={[point.lat, point.lng]} radius={20} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.2, weight: 2, className: 'animate-pulse' }} />
                 </>
            )}

            {isStakingMode && !hideLines && point.type === PointType.STAKING && point.collinearityError !== undefined && point.collinearityError > 0.5 && (
              <CircleMarker
                center={[point.lat, point.lng]}
                radius={10 + Math.min(point.collinearityError * 2, 20)}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2, dashArray: '3, 3' }}
              >
                 {!fitBoundsToPoints && (
                   <Tooltip permanent direction="bottom" offset={[0, 15]} className="bg-transparent border-none shadow-none text-red-500 font-bold text-[10px] drop-shadow-md">
                      ⚠ {point.collinearityError.toFixed(1)}°
                   </Tooltip>
                 )}
              </CircleMarker>
            )}

            <Marker
              position={[point.lat, point.lng]}
              icon={getIcon(point, idx, fitBoundsToPoints, pointLabelMode)}
              draggable={!fitBoundsToPoints}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  callbacksRef.current.onPointClick(point.id);
                },
                dragend: (e) => {
                  const marker = e.target;
                  const position = marker.getLatLng();
                  callbacksRef.current.onPointMove(point.id, position.lat, position.lng);
                }
              }}
            >
              {!fitBoundsToPoints && (
                <Popup>
                   <div className="text-slate-800 min-w-[150px]">
                      <div className="font-bold border-b pb-1 mb-1 border-slate-200">
                        Point {getPointShortLabel(point, idx)}
                      </div>
                      <div className="text-xs space-y-1 mb-2">
                        <div>Type: <span className="font-semibold">{point.type}</span></div>
                        <div>Lat: {point.lat.toFixed(6)}</div>
                        <div>Lng: {point.lng.toFixed(6)}</div>
                        {point.collinearityError !== undefined && point.collinearityError > 0 && (
                            <div className="text-red-600 font-bold">Error: {point.collinearityError.toFixed(2)}°</div>
                        )}
                      </div>
                      <button 
                         type="button"
                         className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-bold py-1 px-2 rounded text-xs transition-colors border border-red-300 flex items-center justify-center gap-1 pointer-events-auto"
                         onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             callbacksRef.current.onPointDelete(point.id);
                         }}
                         onMouseUp={(e) => {
                             // Fallback event handler for reliability
                             e.preventDefault();
                             e.stopPropagation();
                             callbacksRef.current.onPointDelete(point.id);
                         }}
                      >
                         <i className="fas fa-trash-alt"></i> Delete Point
                      </button>
                   </div>
                </Popup>
              )}
            </Marker>
            
            {!hideLines && point.distance && point.distance > 0 && idx > 0 && 
              (point.type === PointType.STAKING || points[idx-1].type === PointType.STAKING) && (
                <Polyline 
                  positions={[[points[idx-1].lat, points[idx-1].lng], [point.lat, point.lng]]}
                  pathOptions={{ color: '#f59e0b', weight: 5, opacity: 0.9, dashArray: '10, 6', lineCap: 'round' }}
                >
                   {!fitBoundsToPoints && point.bearing !== undefined && (
                     <Tooltip permanent direction="center" className="bg-transparent border-none shadow-none text-amber-500 font-bold text-[10px] drop-shadow-md">
                        {point.bearing.toFixed(0)}°
                     </Tooltip>
                   )}
                </Polyline>
            )}
          </React.Fragment>
        ))}

        {gpsPosition && !hideUserPosition && (
          <>
            <Circle 
              center={[gpsPosition.lat, gpsPosition.lng]}
              radius={gpsPosition.accuracy}
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1 }}
            />
            <Marker 
              position={[gpsPosition.lat, gpsPosition.lng]}
              icon={L.divIcon({
                className: 'user-location-icon',
                html: `<div style="width: 16px; height: 16px; background-color: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              })}
            />
          </>
        )}
      </MapContainer>
      
      {!fitBoundsToPoints && (
        <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2 rounded-full w-12 h-12 flex items-center justify-center shadow-xl">
             <div className="relative w-full h-full flex items-center justify-center">
                <div 
                   className="w-full h-full flex flex-col items-center justify-center transition-transform duration-300 ease-out" 
                   style={{ transform: `rotate(${-heading}deg)` }}
                >
                    <div className="w-1.5 h-3.5 bg-red-500 rounded-t-full relative shadow-sm"><div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500 select-none">N</div></div>
                    <div className="w-1.5 h-3.5 bg-slate-400 rounded-b-full shadow-sm" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-slate-800 rounded-full border-2 border-slate-600" />
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
