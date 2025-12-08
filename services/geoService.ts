
import { GeoPoint } from '../types';

// Declare global proj4
declare const proj4: any;

const R = 6371e3; // Earth radius in meters

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  let a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  // Clamp 'a' to [0, 1] range to prevent floating point errors (like 1.0000000002) causing Math.sqrt to return NaN
  a = Math.max(0, Math.min(1, a));

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c;
  return isNaN(d) ? 0 : d;
};

export const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;

  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
            Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const θ = Math.atan2(y, x);
  const bearing = (θ * 180 / Math.PI + 360) % 360;
  return isNaN(bearing) ? 0 : bearing;
};

export const normalizeAngle = (angle: number): number => {
  if (isNaN(angle)) return 0;
  return (angle % 360 + 360) % 360;
};

export const formatBearing = (bearing: number): string => {
  if (isNaN(bearing)) return "-";
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(bearing / 22.5) % 16;
  const d = Math.floor(bearing);
  const m = Math.floor((bearing - d) * 60);
  return `${directions[index]} ${d}°${m}'`;
};

// Calculate area using Shoelace formula on spherical projection 
export const calculateArea = (points: GeoPoint[]): number => {
  if (!points || points.length < 3) return 0;
  
  const validPoints = points.filter(p => !isNaN(p.lat) && !isNaN(p.lng));
  if (validPoints.length < 3) return 0;

  // Use UTM conversion for more accurate area calculation if available, otherwise simple spherical approximation
  if (typeof proj4 !== 'undefined') {
    try {
      const utmPoints = validPoints.map(p => latLngToUtm(p.lat, p.lng));
      let area = 0;
      const n = utmPoints.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += utmPoints[i].easting * utmPoints[j].northing;
        area -= utmPoints[j].easting * utmPoints[i].northing;
      }
      const result = Math.abs(area) / 2;
      return isNaN(result) ? 0 : result;
    } catch (e) {
      console.warn("UTM calculation failed, falling back to spherical", e);
    }
  }

  // Fallback
  let area = 0;
  const n = validPoints.length;
  const origin = validPoints[0];
  const x = validPoints.map(p => calculateDistance(origin.lat, origin.lng, origin.lat, p.lng) * (p.lng > origin.lng ? 1 : -1));
  const y = validPoints.map(p => calculateDistance(origin.lat, origin.lng, p.lat, origin.lng) * (p.lat > origin.lat ? 1 : -1));

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += x[i] * y[j];
    area -= x[j] * y[i];
  }
  const result = Math.abs(area) / 2;
  return isNaN(result) ? 0 : result;
};

export const calculatePerimeter = (points: GeoPoint[]): number => {
  const validPoints = points.filter(p => !isNaN(p.lat) && !isNaN(p.lng));
  if (validPoints.length < 2) return 0;
  
  let perimeter = 0;
  for (let i = 0; i < validPoints.length - 1; i++) {
    perimeter += calculateDistance(validPoints[i].lat, validPoints[i].lng, validPoints[i+1].lat, validPoints[i+1].lng);
  }
  // Close loop for polygon if > 2 points
  if (validPoints.length > 2) {
    perimeter += calculateDistance(validPoints[validPoints.length-1].lat, validPoints[validPoints.length-1].lng, validPoints[0].lat, validPoints[0].lng);
  }
  return isNaN(perimeter) ? 0 : perimeter;
};

export const formatArea = (sqMeters: number): string => {
  if (isNaN(sqMeters)) return "0 m²";
  if (sqMeters > 10000) {
    return `${(sqMeters / 10000).toFixed(3)} ha`;
  }
  return `${sqMeters.toFixed(1)} m²`;
};

export const formatAcres = (sqMeters: number): string => {
  if (isNaN(sqMeters)) return "0 ac";
  return `${(sqMeters * 0.000247105).toFixed(3)} ac`;
};

// UTM Helper
export const latLngToUtm = (lat: number, lng: number) => {
  if (isNaN(lat) || isNaN(lng)) return { easting: 0, northing: 0, zone: 0, hemi: 'N' };

  if (typeof proj4 === 'undefined') {
    // Simple mock if proj4 missing
    return { easting: lng * 111320, northing: lat * 110574, zone: 0, hemi: lat >= 0 ? 'N' : 'S' };
  }

  const zoneNum = Math.floor((lng + 180) / 6) + 1;
  const hemi = lat >= 0 ? 'N' : 'S';
  const nad83UtmCode = `EPSG:269${zoneNum.toString().padStart(2, '0')}`;
  
  const wgs84Code = `+proj=utm +zone=${zoneNum} +datum=WGS84 +units=m +no_defs`;
  
  try {
    const [easting, northing] = proj4('EPSG:4326', wgs84Code, [lng, lat]);
    if (isNaN(easting) || isNaN(northing)) return { easting: 0, northing: 0, zone: zoneNum, hemi };
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
  if (isNaN(startLat) || isNaN(startLng) || isNaN(currentLat) || isNaN(currentLng) || isNaN(targetBearing)) {
      return { error: 0, direction: 'Right' };
  }

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

export const calculateCrossTrackError = (
  startLat: number, startLng: number,
  targetBearing: number,
  currentLat: number, currentLng: number
): { distance: number; direction: 'Left' | 'Right' } => {
  if (isNaN(startLat) || isNaN(startLng) || isNaN(currentLat) || isNaN(currentLng) || isNaN(targetBearing)) {
      return { distance: 0, direction: 'Right' };
  }

  const dist = calculateDistance(startLat, startLng, currentLat, currentLng);
  const bearingToPoint = calculateBearing(startLat, startLng, currentLat, currentLng);
  
  let diff = bearingToPoint - targetBearing;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  
  const diffRad = diff * (Math.PI / 180);
  const xte = dist * Math.sin(diffRad);
  
  return {
    distance: Math.abs(xte),
    direction: xte > 0 ? 'Right' : 'Left'
  };
};

export const snapToBaseline = (
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  pLat: number, pLng: number
): { lat: number; lng: number } => {
  if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng) || isNaN(pLat) || isNaN(pLng)) {
      return { lat: startLat, lng: startLng };
  }
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

// Search Location
export const searchLocation = async (query: string): Promise<{ lat: number; lng: number; displayName?: string } | null> => {
    // 1. Try Lat/Lng parse
    const latLngMatch = query.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (latLngMatch) {
        const lat = parseFloat(latLngMatch[1]);
        const lng = parseFloat(latLngMatch[3]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return { lat, lng, displayName: `${lat}, ${lng}` };
        }
    }

    // 2. Nominatim Search
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
            headers: {
                'User-Agent': 'AreaVuePro/1.0'
            }
        });
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                displayName: data[0].display_name
            };
        }
    } catch (e) {
        console.error("Search failed", e);
    }
    return null;
};
