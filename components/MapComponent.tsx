
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, Circle, Tooltip, CircleMarker, ScaleControl } from 'react-leaflet';
import { GeoPoint, PointType, PointLabelMode, StyleConfiguration, PointStyle } from '../types';

// --- LEAFLET CONFIGURATION ---
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

// Custom Icon Generators
const createDivIconHtml = (
  style: PointStyle,
  innerText: string, 
  size: number, 
  isSmall: boolean, 
  labelText: string | null,
  turnDirection?: 'Left' | 'Right',
  pointId?: string
) => {
  // Shape logic
  let borderRadius = '0%';
  if (style.shape === 'circle') borderRadius = '50%';
  else if (style.shape === 'rounded') borderRadius = '20%';
  else borderRadius = '0%'; // Square

  // Dynamic font sizing based on marker size
  const fontSize = Math.max(8, size * 0.4);
  const borderWidth = Math.max(1, size * 0.08); // Approx 2-3px for normal size

  return `
  <div class="relative group">
    <div class="marker-pin transition-transform duration-300" style="
      background-color: ${style.color};
      background-image: linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.2) 100%);
      width: ${size}px;
      height: ${size}px;
      border-radius: ${borderRadius};
      display: flex;
      align-items: center;
      justify-content: center;
      border: ${borderWidth}px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    ">
      ${innerText ? `<span style="
        color: white; 
        font-weight: 800; 
        font-family: sans-serif; 
        font-size: ${fontSize}px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      ">${innerText}</span>` : ''}
    </div>
    
    ${turnDirection && !isSmall ? `
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

    ${labelText && !isSmall ? `
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
};

const getIcon = (
  point: GeoPoint, 
  index: number, 
  isExporting: boolean, 
  labelMode: PointLabelMode,
  styleConfig: StyleConfiguration
) => {
  // Get style for this point type
  const style = styleConfig[point.type] || styleConfig[PointType.GPS];

  // Base size: 32px normally, 16px for export
  const baseSize = isExporting ? 16 : 32;
  
  // Apply the user's size multiplier (default to 1 if undefined)
  const size = baseSize * (style.size || 1);
  
  let innerText = "";
  if (point.label && typeof point.label === 'string') {
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
  if (!isExporting) { 
    if (labelMode === 'id') labelText = (point.label && typeof point.label === 'string') ? point.label : String(point.id).substring(0, 8); 
    else if (labelMode === 'type') labelText = point.type;
    else if (labelMode === 'name') labelText = point.name || (typeof point.label === 'string' ? point.label : null) || point.type;
  }

  const html = createDivIconHtml(style, innerText, size, isExporting, labelText, point.turnDirection, point.id);

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
  fitBounds,
  fitBoundsTrigger,
  recenterTrigger,
  isMenuOpen
}: { 
  center: { lat: number; lng: number; zoom?: number } | null,
  points: GeoPoint[],
  fitBounds: boolean,
  fitBoundsTrigger: number,
  recenterTrigger: number,
  isMenuOpen?: boolean
}) => {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => {
        map.invalidateSize();
    }, 300); 
    return () => clearTimeout(t);
  }, [isMenuOpen, map]);

  useEffect(() => {
    if (recenterTrigger > 0 && center && !isNaN(center.lat) && !isNaN(center.lng)) {
        map.flyTo([center.lat, center.lng], 18, { duration: 1.0 });
    }
  }, [recenterTrigger, center, map]);

  useEffect(() => {
    if (center && !isNaN(center.lat) && !isNaN(center.lng)) {
      const current = map.getCenter();
      const dist = Math.sqrt(Math.pow(current.lat - center.lat, 2) + Math.pow(current.lng - center.lng, 2));
      if (!isNaN(dist) && dist > 0.00001) {
          map.flyTo([center.lat, center.lng], center.zoom || 18, { duration: 1.5 });
      }
    }
  }, [center, map]);

  useEffect(() => {
    if (fitBounds && points.length > 0) {
      const validPoints = points.filter(p => !isNaN(p.lat) && !isNaN(p.lng));
      if (validPoints.length === 0) return;
      const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 21, animate: false });
    }
  }, [fitBounds, points, map]);

  useEffect(() => {
    if (fitBoundsTrigger > 0 && points.length > 0) {
       const validPoints = points.filter(p => !isNaN(p.lat) && !isNaN(p.lng));
       if (validPoints.length === 0) return;
       const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
       map.fitBounds(bounds, { padding: [50, 50], maxZoom: 21, animate: true, duration: 1.0 });
    }
  }, [fitBoundsTrigger, points, map]);

  return null;
};

const MapEvents = ({ onClick, isManualMode }: { onClick: (lat: number, lng: number) => void, isManualMode: boolean }) => {
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

const MAP_CONTAINER_STYLE = { height: '100%', width: '100%' };

const computeDestinationPoint = (lat: number, lng: number, bearing: number, distanceMeters: number) => {
    if (isNaN(lat) || isNaN(lng) || isNaN(bearing)) return { lat, lng };
    const R = 6371e3;
    const φ1 = (lat * Math.PI) / 180;
    const λ1 = (lng * Math.PI) / 180;
    const θ = (bearing * Math.PI) / 180;
    const δ = distanceMeters / R;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    const resLat = (φ2 * 180) / Math.PI;
    const resLng = (λ2 * 180) / Math.PI;
    if (isNaN(resLat) || isNaN(resLng)) return { lat, lng };
    return { lat: resLat, lng: resLng };
};

interface MapComponentProps {
  points: GeoPoint[];
  activePointId: string | null;
  isStakingMode: boolean;
  stakingTolerance?: number;
  showStakingLabels?: boolean;
  isManualMode: boolean;
  gpsPosition: { lat: number; lng: number; accuracy: number } | null;
  centerOnLocation: { lat: number; lng: number; zoom?: number } | null;
  fitBoundsToPoints: boolean;
  fitBoundsTrigger?: number;
  recenterTrigger?: number;
  hideUserPosition?: boolean;
  hideLines?: boolean;
  onMapClick: (lat: number, lng: number) => void;
  onPointClick: (id: string) => void;
  onPointMove: (id: string, lat: number, lng: number) => void;
  baseline?: { start: GeoPoint, end: GeoPoint } | null;
  pointLabelMode: PointLabelMode;
  navigationTarget: GeoPoint | null;
  stakingGuide?: { start: GeoPoint, bearing: number } | null;
  isExporting?: boolean; 
  isMenuOpen?: boolean;
  styleConfig: StyleConfiguration;
}

export const MapComponent: React.FC<MapComponentProps> = ({
  points,
  activePointId,
  isStakingMode,
  stakingTolerance = 0.5,
  showStakingLabels = true,
  isManualMode,
  gpsPosition,
  centerOnLocation,
  fitBoundsToPoints,
  fitBoundsTrigger = 0,
  recenterTrigger = 0,
  hideUserPosition = false,
  hideLines = false,
  onMapClick,
  onPointClick,
  onPointMove,
  baseline,
  pointLabelMode,
  navigationTarget,
  stakingGuide,
  isExporting = false,
  isMenuOpen = false,
  styleConfig
}) => {
  const [heading, setHeading] = useState(0);
  const callbacksRef = useRef({ onPointClick, onPointMove });

  useEffect(() => {
    callbacksRef.current = { onPointClick, onPointMove };
  }, [onPointClick, onPointMove]);

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

  const validPoints = points.filter(p => !isNaN(p.lat) && !isNaN(p.lng));

  // Construct staking guide line safely
  let stakingGuideLine = null;
  if (stakingGuide && !isNaN(stakingGuide.start.lat) && !isNaN(stakingGuide.start.lng) && stakingGuide.bearing !== null && !isNaN(stakingGuide.bearing)) {
      const endPt = computeDestinationPoint(stakingGuide.start.lat, stakingGuide.start.lng, stakingGuide.bearing, 500);
      if (!isNaN(endPt.lat) && !isNaN(endPt.lng)) {
          stakingGuideLine = [
              [stakingGuide.start.lat, stakingGuide.start.lng],
              [endPt.lat, endPt.lng]
          ];
      }
  }

  // During export, lock compass to North (0 rotation)
  const compassRotation = isExporting ? 0 : -(heading || 0); // Safe fallback
  
  // Reposition compass higher when exporting (since top header is hidden)
  const compassPositionClass = isExporting ? 'top-4 left-4' : 'top-24 left-4';

  return (
    <div id="map-container" className="h-full w-full relative bg-slate-900">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        maxZoom={22} 
        style={MAP_CONTAINER_STYLE}
        zoomControl={false}
        attributionControl={false}
        preferCanvas={false}
      >
        <TileLayer
          url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          subdomains={['mt0','mt1','mt2','mt3']}
          maxNativeZoom={20} 
          maxZoom={22}       
        />
        
        <MapController 
          center={centerOnLocation} 
          points={validPoints}
          fitBounds={fitBoundsToPoints}
          fitBoundsTrigger={fitBoundsTrigger}
          recenterTrigger={recenterTrigger}
          isMenuOpen={isMenuOpen}
        />

        <MapEvents onClick={onMapClick} isManualMode={isManualMode} />

        {/* Scale Control - Always visible, showing Metric and Imperial */}
        <ScaleControl position="bottomleft" imperial={true} metric={true} />

        {!hideLines && stakingGuideLine && (
            <Polyline
                positions={stakingGuideLine as any}
                pathOptions={{ 
                    color: '#f59e0b', 
                    weight: 2, 
                    dashArray: '10, 5', 
                    opacity: 0.8,
                }}
            />
        )}

        {!hideLines && validPoints.length > 1 && (
          <>
            <Polyline 
              positions={validPoints.map(p => [p.lat, p.lng])}
              pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.8 }}
            />
            {validPoints.length > 2 && (
              <Polyline 
                positions={[
                  [validPoints[validPoints.length-1].lat, validPoints[validPoints.length-1].lng],
                  [validPoints[0].lat, validPoints[0].lng]
                ]}
                // Solid closing line for clear boundary
                pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.8 }} 
              />
            )}
          </>
        )}

        {!hideLines && baseline && !isNaN(baseline.start.lat) && !isNaN(baseline.start.lng) && !isNaN(baseline.end.lat) && !isNaN(baseline.end.lng) && (
           <Polyline 
             positions={[
               [baseline.start.lat, baseline.start.lng],
               [baseline.end.lat, baseline.end.lng]
             ]}
             pathOptions={{ color: '#ec4899', weight: 2, dashArray: '10, 10', opacity: 0.8 }}
           />
        )}
        
        {!hideLines && navigationTarget && gpsPosition && !isNaN(navigationTarget.lat) && !isNaN(navigationTarget.lng) && !isNaN(gpsPosition.lat) && !isNaN(gpsPosition.lng) && (
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

        {validPoints.map((point, idx) => (
          <React.Fragment key={point.id}>
            {activePointId === point.id && !hideLines && (
                 <CircleMarker 
                   center={[point.lat, point.lng]} 
                   radius={22} 
                   pathOptions={{ color: '#ffffff', fillColor: 'transparent', weight: 2, dashArray: '5, 5', opacity: 0.8 }} 
                 />
            )}

            {isStakingMode && !hideLines && point.type === PointType.STAKING && point.collinearityError !== undefined && !isNaN(point.collinearityError) && point.collinearityError > stakingTolerance && (
              <CircleMarker
                center={[point.lat, point.lng]}
                radius={10 + Math.min(point.collinearityError * 2, 20)}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2, dashArray: '3, 3' }}
              />
            )}

            <Marker
              position={[point.lat, point.lng]}
              icon={getIcon(point, idx, isExporting, pointLabelMode, styleConfig)}
              draggable={!fitBoundsToPoints && !isExporting}
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
            />
          </React.Fragment>
        ))}

        {gpsPosition && !hideUserPosition && !isNaN(gpsPosition.lat) && !isNaN(gpsPosition.lng) && (
          <Marker 
            position={[gpsPosition.lat, gpsPosition.lng]}
            icon={L.divIcon({
              className: 'user-location-icon',
              html: `<div style="width: 16px; height: 16px; background-color: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })}
          />
        )}
      </MapContainer>
      
      {/* Compass / North Arrow - Relocated to Top-Left to avoid overlap, moves to top-4 during export */}
      {!fitBoundsToPoints && (
        <div className={`absolute ${compassPositionClass} z-[1000] group`}>
             <div className="relative w-12 h-12 bg-slate-900/90 backdrop-blur-md border-2 border-slate-600 rounded-full shadow-2xl flex items-center justify-center transform transition-transform hover:scale-105">
                <div 
                   className="w-full h-full flex flex-col items-center justify-center transition-transform duration-300 ease-out" 
                   style={{ transform: `rotate(${compassRotation}deg)` }}
                >
                    {/* North Needle */}
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[20px] border-b-red-500 relative -top-1"></div>
                    {/* South Needle */}
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[20px] border-t-slate-200 relative -bottom-1"></div>
                    
                    {/* Center Pin */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900 rounded-full border border-slate-500 z-10"></div>
                    
                    {/* N Label */}
                    <div className="absolute -top-3 text-[10px] font-black text-red-500 select-none drop-shadow-md">N</div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
