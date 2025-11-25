
export enum PointType {
  GPS = 'GPS',
  MANUAL = 'MANUAL',
  STAKING = 'STAKING',
  INTERMEDIATE = 'INTERMEDIATE',
  CORNER = 'CORNER'
}

export type PointLabelMode = 'none' | 'id' | 'type' | 'name';

export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  type: PointType;
  timestamp: number;
  name?: string;
  label?: string;
  // Staking specific
  bearing?: number; // Bearing from previous point
  distance?: number; // Distance from previous point
  turnAngle?: number;
  turnDirection?: 'Left' | 'Right';
  collinearityError?: number;
  isSnapped?: boolean;
}

export interface Survey {
  id: string;
  name: string;
  points: GeoPoint[];
  area?: number; // in square meters
  perimeter?: number; // in meters
  created: number;
  updated: number;
  isStaking?: boolean;
}

export interface StakingState {
  isActive: boolean;
  currentBearing: number | null;
  targetBearing: number | null;
  strictCollinearity: boolean;
  collinearityTolerance: number;
  lastPosition: { lat: number; lng: number } | null;
  // Intermediate Staking
  baselineStartId: string | null;
  baselineEndId: string | null;
  baselineBearing: number | null;
  baselineDistance: number | null;
}

export interface LicenseState {
  status: 'free' | 'trial' | 'pro' | 'expired';
  trialDaysLeft: number;
  key?: string;
}

export interface AppState {
  surveys: Survey[];
  currentSurvey: Survey;
  gpsAccuracy: number | null;
  gpsPosition: { lat: number; lng: number; alt: number } | null;
  isMenuOpen: boolean;
  viewMode: 'map' | 'list';
}
