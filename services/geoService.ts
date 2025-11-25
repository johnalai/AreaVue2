
import { GeoPoint } from '../types';

// Declare global proj4
declare const proj4: any;

const R = 6371e3; // Earth radius in meters

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
            Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
};

export const normalizeAngle = (angle: number): number => {
  return (angle % 360 + 360) % 360;
};

export const formatBearing = (bearing: number): string => {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(bearing / 22.5) % 16;
  const d = Math.floor(bearing);
  const m = Math.floor((bearing - d) * 60);
  return `${directions[index]} ${d}°${m}'`;
};

// Calculate area using Shoelace formula on spherical projection 
export const calculateArea = (points: GeoPoint[]): number => {
  if (points.length < 3) return 0;
  
  // Use UTM conversion for more accurate area calculation if available, otherwise simple spherical approximation
  if (typeof proj4 !== 'undefined') {
    try {
      const utmPoints = points.map(p => latLngToUtm(p.lat, p.lng));
      let area = 0;
      const n = utmPoints.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += utmPoints[i].easting * utmPoints[j].northing;
        area -= utmPoints[j].easting * utmPoints[i].northing;
      }
      return Math.abs(area) / 2;
    } catch (e) {
      console.warn("UTM calculation failed, falling back to spherical", e);
    }
  }

  // Fallback
  let area = 0;
  const n = points.length;
  const origin = points[0];
  const x = points.map(p => calculateDistance(origin.lat, origin.lng, origin.lat, p.lng) * (p.lng > origin.lng ? 1 : -1));
  const y = points.map(p => calculateDistance(origin.lat, origin.lng, p.lat, origin.lng) * (p.lat > origin.lat ? 1 : -1));

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += x[i] * y[j];
    area -= x[j] * y[i];
  }
  return Math.abs(area) / 2;
};

export const calculatePerimeter = (points: GeoPoint[]): number => {
  if (points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length - 1; i++) {
    perimeter += calculateDistance(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng);
  }
  // Close loop for polygon if > 2 points
  if (points.length > 2) {
    perimeter += calculateDistance(points[points.length-1].lat, points[points.length-1].lng, points[0].lat, points[0].lng);
  }
  return perimeter;
};

export const formatArea = (sqMeters: number): string => {
  if (sqMeters > 10000) {
    return `${(sqMeters / 10000).toFixed(3)} ha`;
  }
  return `${sqMeters.toFixed(1)} m²`;
};

export const formatAcres = (sqMeters: number): string => {
  return `${(sqMeters * 0.000247105).toFixed(3)} ac`;
};

// UTM Helper
export const latLngToUtm = (lat: number, lng: number) => {
  if (typeof proj4 === 'undefined') {
    // Simple mock if proj4 missing
    return { easting: lng * 111320, northing: lat * 110574, zone: 0, hemi: lat >= 0 ? 'N' : 'S' };
  }

  const zoneNum = Math.floor((lng + 180) / 6) + 1;
  const hemi = lat >= 0 ? 'N' : 'S';
  const nad83UtmCode = `EPSG:269${zoneNum.toString().padStart(2, '0')}`;
  
  // Define if not exists (Generic WGS84 UTM)
  // Note: In a real app we would be more careful with defs. 
  // Proj4 usually needs defs. Assuming WGS84 UTM for simplicity.
  const wgs84Code = `+proj=utm +zone=${zoneNum} +datum=WGS84 +units=m +no_defs`;
  
  try {
    const [easting, northing] = proj4('EPSG:4326', wgs84Code, [lng, lat]);
    return { easting, northing, zone: zoneNum, hemi };
  } catch (e) {
      return { easting: 0, northing: 0, zone: 0, hemi };
  }
};

// Staking Logic
export const calculateCollinearity = (
  startLat: number, startLng: number,
  targetBearing: number,
  currentLat: number, currentLng: number
): { error: number; direction: 'Left' | 'Right' } => {
  const actualBearing = calculateBearing(startLat, startLng, currentLat, currentLng);
  let diff = actualBearing - targetBearing;
  
  // Normalize to -180 to 180
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  
  return {
    error: Math.abs(diff),
    direction: diff > 0 ? 'Right' : 'Left' // If actual is to the right of target
  };
};

export const snapToBaseline = (
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  pLat: number, pLng: number
): { lat: number; lng: number } => {
  // Vector Math projection
  const dLat = endLat - startLat;
  const dLng = endLng - startLng;
  const t = ((pLat - startLat) * dLat + (pLng - startLng) * dLng) / (dLat * dLat + dLng * dLng);
  
  const clampedT = Math.max(0, Math.min(1, t));
  
  return {
    lat: startLat + clampedT * dLat,
    lng: startLng + clampedT * dLng
  };
};
