
import React, { useState, useEffect, useRef } from 'react';
import { MapComponent } from './components/MapComponent';
import { Button, Fab, Card, Modal, StatBox, Toast } from './components/UIComponents';
import { StakingControls } from './components/StakingControls';
import { StyleEditor } from './components/StyleEditor';
import { ChatAssistant } from './components/ChatAssistant';
import { Survey, GeoPoint, PointType, StakingState, StyleConfiguration } from './types';
import { calculateArea, calculatePerimeter, formatArea, formatAcres, calculateDistance, calculateBearing, calculateCrossTrackError, latLngToUtm, formatBearing } from './services/geoService';

// --- UTILS ---
const generateUUID = () => {
  // Pure math fallback to ensure 100% compatibility (crypto.randomUUID fails in non-secure contexts)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const DEFAULT_STYLES: StyleConfiguration = {
  [PointType.GPS]: { color: '#3b82f6', shape: 'circle', size: 1 },
  [PointType.MANUAL]: { color: '#ec4899', shape: 'square', size: 1 },
  [PointType.STAKING]: { color: '#f59e0b', shape: 'rounded', size: 1 },
  [PointType.INTERMEDIATE]: { color: '#06b6d4', shape: 'circle', size: 0.8 },
  [PointType.CORNER]: { color: '#ef4444', shape: 'square', size: 1.2 }
};

const App: React.FC = () => {
  // --- STATE ---
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [currentSurveyId, setCurrentSurveyId] = useState<string | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number; accuracy: number; alt: number } | null>(null);
  
  // UI Flags
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [showStakingControls, setShowStakingControls] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [surveyToDelete, setSurveyToDelete] = useState<string | null>(null);
  
  // Configuration
  const [styleConfig, setStyleConfig] = useState<StyleConfiguration>(DEFAULT_STYLES);

  // Import Conflict State
  const [importConflict, setImportConflict] = useState<{ newSurveys: Survey[], existingSurveys: Survey[] } | null>(null);
  
  // Staking State
  const [stakingState, setStakingState] = useState<StakingState>({
    isActive: false,
    currentBearing: null,
    targetBearing: null,
    strictCollinearity: false,
    collinearityTolerance: 1.0,
    showLabels: true,
    lastPosition: null,
    baselineStartId: null,
    baselineEndId: null,
    baselineBearing: null,
    baselineDistance: null
  });

  // Undo System
  const [deletionHistory, setDeletionHistory] = useState<{ point: GeoPoint, index: number, surveyId: string } | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  // Map Control
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // --- REFS ---
  const surveyRef = useRef<Survey | null>(null);
  const allSurveysRef = useRef<Survey[]>([]); // Track all surveys for async access
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const saved = localStorage.getItem('surveys');
    const savedStyles = localStorage.getItem('styleConfig');
    
    if (savedStyles) {
      try {
        const parsed = JSON.parse(savedStyles);
        // Sanitize styles to prevent [object Object] errors from corrupted local storage
        const sanitized = { ...DEFAULT_STYLES };
        Object.keys(DEFAULT_STYLES).forEach(key => {
            const k = key as PointType;
            if (parsed[k]) {
                sanitized[k] = {
                    color: typeof parsed[k].color === 'string' ? parsed[k].color : DEFAULT_STYLES[k].color,
                    shape: parsed[k].shape || DEFAULT_STYLES[k].shape,
                    size: typeof parsed[k].size === 'number' ? parsed[k].size : 1.0
                };
            }
        });
        setStyleConfig(sanitized);
      } catch (e) {
        console.error("Failed to load styles", e);
        setStyleConfig(DEFAULT_STYLES);
      }
    }

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSurveys(parsed);
        if (parsed.length > 0) {
          setCurrentSurveyId(parsed[0].id);
        } else {
          createNewSurvey();
        }
      } catch (e) {
        createNewSurvey();
      }
    } else {
      createNewSurvey();
    }
  }, []);

  // Sync Refs
  useEffect(() => {
    allSurveysRef.current = surveys;
    const current = surveys.find(s => s.id === currentSurveyId);
    if (current) {
      surveyRef.current = current;
    }
    if (surveys.length > 0) {
      localStorage.setItem('surveys', JSON.stringify(surveys));
    }
  }, [surveys, currentSurveyId]);

  // Sync Styles
  useEffect(() => {
    localStorage.setItem('styleConfig', JSON.stringify(styleConfig));
  }, [styleConfig]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          alt: pos.coords.altitude || 0
        });
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- LOGIC ---

  const currentSurvey = surveys.find(s => s.id === currentSurveyId) || surveys[0];
  const activePoint = currentSurvey?.points.find(p => p.id === activePointId);

  // Helper to get last calculated bearing for Staking Controls
  const getLastSegmentBearing = () => {
     if (!currentSurvey || currentSurvey.points.length < 2) return null;
     const last = currentSurvey.points[currentSurvey.points.length - 1];
     const prev = currentSurvey.points[currentSurvey.points.length - 2];
     if (last.bearing !== undefined && !isNaN(last.bearing) && last.bearing !== 0) return last.bearing;
     if (!isNaN(prev.lat) && !isNaN(prev.lng) && !isNaN(last.lat) && !isNaN(last.lng)) {
        return calculateBearing(prev.lat, prev.lng, last.lat, last.lng);
     }
     return null;
  };

  const recalculateGeometry = (points: GeoPoint[]) => {
    return points.map((p, i) => {
      if (i === 0) return { ...p, distance: 0, bearing: 0 };
      const prev = points[i - 1];
      const dist = calculateDistance(prev.lat, prev.lng, p.lat, p.lng);
      const bear = calculateBearing(prev.lat, prev.lng, p.lat, p.lng);
      return {
        ...p,
        distance: isNaN(dist) ? 0 : dist,
        bearing: isNaN(bear) ? 0 : bear
      };
    });
  };

  const updateCurrentSurveyPoints = (newPoints: GeoPoint[]) => {
    if (!currentSurveyId) return;
    const recalculated = recalculateGeometry(newPoints);
    setSurveys(prev => prev.map(s => s.id === currentSurveyId ? { ...s, points: recalculated, updated: Date.now() } : s));
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!isManualMode || !currentSurveyId || isNaN(lat) || isNaN(lng)) return;
    const newPoint: GeoPoint = {
      id: generateUUID(),
      lat, lng, 
      type: PointType.MANUAL,
      timestamp: Date.now()
    };
    if (surveyRef.current) {
      updateCurrentSurveyPoints([...surveyRef.current.points, newPoint]);
    }
  };

  const addGpsPoint = () => {
    if (!gpsPosition || !currentSurveyId) return;
    
    // Safety check for NaN
    if (isNaN(gpsPosition.lat) || isNaN(gpsPosition.lng)) return;

    const newPoint: GeoPoint = {
      id: generateUUID(),
      lat: gpsPosition.lat,
      lng: gpsPosition.lng,
      accuracy: gpsPosition.accuracy,
      altitude: gpsPosition.alt,
      type: stakingState.isActive ? PointType.STAKING : PointType.GPS,
      timestamp: Date.now()
    };

    if (stakingState.isActive && surveyRef.current && surveyRef.current.points.length > 0) {
        const lastPt = surveyRef.current.points[surveyRef.current.points.length - 1];
        if (!isNaN(lastPt.lat) && !isNaN(lastPt.lng)) {
          const bearing = calculateBearing(lastPt.lat, lastPt.lng, newPoint.lat, newPoint.lng);
          const distance = calculateDistance(lastPt.lat, lastPt.lng, newPoint.lat, newPoint.lng);
          
          newPoint.bearing = isNaN(bearing) ? 0 : bearing;
          newPoint.distance = isNaN(distance) ? 0 : distance;
          
          if (stakingState.targetBearing !== null) {
              let diff = bearing - stakingState.targetBearing;
              while (diff > 180) diff -= 360;
              while (diff < -180) diff += 360;
              newPoint.collinearityError = Math.abs(diff);
              newPoint.turnDirection = diff > 0 ? 'Right' : 'Left';
          }
        }
    }

    if (surveyRef.current) {
      updateCurrentSurveyPoints([...surveyRef.current.points, newPoint]);
    }
  };

  const handlePointClick = (id: string) => {
    setActivePointId(id);
  };

  const handleDeletePoint = () => {
    if (!activePointId || !currentSurveyId || !surveyRef.current) return;
    
    const currentPoints = surveyRef.current.points;
    const index = currentPoints.findIndex(p => p.id === activePointId);
    if (index === -1) return;

    const pointToDelete = currentPoints[index];

    setDeletionHistory({
      point: pointToDelete,
      index: index,
      surveyId: currentSurveyId
    });
    setShowUndoToast(true);
    setTimeout(() => setShowUndoToast(false), 5000);

    const newPoints = currentPoints.filter(p => p.id !== activePointId);
    updateCurrentSurveyPoints(newPoints);
    setActivePointId(null);
  };

  const handleUndoDelete = () => {
    if (!deletionHistory || !currentSurveyId) return;
    if (deletionHistory.surveyId !== currentSurveyId) {
       alert("Cannot undo: Active survey has changed.");
       return;
    }
    const currentPoints = [...surveyRef.current!.points];
    currentPoints.splice(deletionHistory.index, 0, deletionHistory.point);
    updateCurrentSurveyPoints(currentPoints);
    setShowUndoToast(false);
    setDeletionHistory(null);
  };

  const handleClearAllPoints = () => {
    setIsMenuOpen(false);
    setShowClearConfirmation(true);
  };

  const confirmClearAll = () => {
    updateCurrentSurveyPoints([]);
    setActivePointId(null);
    setShowClearConfirmation(false);
  };

  const createNewSurvey = () => {
    const newSurvey: Survey = {
      id: generateUUID(),
      name: 'My Survey',
      points: [],
      created: Date.now(),
      updated: Date.now()
    };
    setSurveys(prev => [...prev, newSurvey]);
    setCurrentSurveyId(newSurvey.id);
  };

  const requestDeleteSurvey = (id: string) => {
    setSurveyToDelete(id);
  };

  const confirmDeleteSurvey = () => {
    if (!surveyToDelete) return;
    
    let updatedSurveys = surveys.filter(s => s.id !== surveyToDelete);
    
    // If we deleted the only survey, create a new one immediately
    if (updatedSurveys.length === 0) {
        const newSurvey: Survey = {
            id: generateUUID(),
            name: 'My Survey',
            points: [],
            created: Date.now(),
            updated: Date.now()
        };
        updatedSurveys = [newSurvey];
        setCurrentSurveyId(newSurvey.id);
    } 
    // If we deleted the active survey, switch to the first available
    else if (currentSurveyId === surveyToDelete) {
        setCurrentSurveyId(updatedSurveys[0].id);
        // Force map re-center slightly later to allow render
        setTimeout(() => setFitBoundsTrigger(Date.now()), 100);
    }
    
    setSurveys(updatedSurveys);
    setSurveyToDelete(null);
  };

  const handleRecenter = () => {
      if (gpsPosition) {
          setRecenterTrigger(Date.now());
      } else {
          alert("Waiting for GPS signal...");
      }
  };

  const handleSurveySelect = (id: string) => {
    setCurrentSurveyId(id);
    setActivePointId(null);
    setFitBoundsTrigger(Date.now());
  };

  const handleRenameSurvey = () => {
     if (!currentSurveyId) return;
     setSurveys(prev => prev.map(s => s.id === currentSurveyId ? { ...s, name: renameValue } : s));
     setShowRenameModal(false);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSurvey = (format: 'csv' | 'kml' | 'json') => {
    if (!surveyRef.current) return;
    const s = surveyRef.current;
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${s.name.replace(/\s+/g, '_')}_${timestamp}.${format}`;

    if (format === 'json') {
        downloadFile(JSON.stringify(s, null, 2), filename, 'application/json');
    } else if (format === 'csv') {
        const headers = "ID,Latitude,Longitude,Type,Timestamp,Bearing,Distance,Error\n";
        const rows = s.points.map(p => {
             return `${p.id},${p.lat},${p.lng},${p.type},${new Date(p.timestamp).toISOString()},${p.bearing?.toFixed(1) || ''},${p.distance?.toFixed(2) || ''},${p.collinearityError?.toFixed(1) || ''}`;
        }).join("\n");
        downloadFile(headers + rows, filename, 'text/csv');
    } else if (format === 'kml') {
        const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${s.name}</name>${s.points.map(p => `<Placemark><Point><coordinates>${p.lng},${p.lat}</coordinates></Point></Placemark>`).join('')}</Document></kml>`;
        downloadFile(kml, filename, 'application/vnd.google-earth.kml+xml');
    }
  };

  const handleExportPDF = async () => {
    if (!surveyRef.current) return;
    const s = surveyRef.current;
    setIsExporting(true);
    
    // 1. Force Map to Fit Bounds
    setFitBoundsTrigger(Date.now());
    
    // 2. Wait for map to settle
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 3. FORCE RECALCULATE GEOMETRY FOR REPORT
    const pointsForReport = recalculateGeometry(s.points);

    try {
        // @ts-ignore
        const html2canvas = window.html2canvas;
        // @ts-ignore
        const { jsPDF } = window.jspdf;

        if (!html2canvas || !jsPDF) {
            alert("PDF libraries not loaded.");
            setIsExporting(false);
            return;
        }

        // Hide UI elements to capture cleaner map
        // IMPORTANT: We do NOT hide scale or compass here if they don't have the attribute
        const uiElements = document.querySelectorAll('[data-hide-on-export="true"]');
        uiElements.forEach((el: any) => el.style.display = 'none');

        const mapElement = document.getElementById('map-container');
        if (!mapElement) {
            setIsExporting(false);
            return;
        }

        // Capture Map
        const canvas = await html2canvas(mapElement, {
            useCORS: true,
            allowTaint: true,
            logging: false,
            scale: 2 // High res
        });

        // Restore UI
        uiElements.forEach((el: any) => el.style.display = '');

        const imgData = canvas.toDataURL('image/png');
        
        // Portrait
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 14;
        const availableWidth = pdfWidth - (margin * 2);

        // --- PAGE 1: TITLE & SUMMARY ---
        pdf.setFontSize(22);
        pdf.text("AreaVue Pro Survey Report", margin, 20);
        
        pdf.setFontSize(12);
        pdf.text(`Survey: ${s.name}`, margin, 30);
        pdf.text(`Date: ${new Date(s.updated).toLocaleDateString()}`, margin, 36);
        
        // Stats
        const areaSqM = calculateArea(pointsForReport);
        const perim = calculatePerimeter(pointsForReport);
        pdf.text(`Area: ${formatArea(areaSqM)} (${formatAcres(areaSqM)})`, margin, 46);
        pdf.text(`Perimeter: ${perim.toFixed(1)} m`, margin, 52);

        // --- MAP IMAGE ---
        const imgProps = pdf.getImageProperties(imgData);
        
        const availableHeight = pdfHeight - 65; 
        
        const widthScale = availableWidth / imgProps.width;
        const heightScale = availableHeight / imgProps.height;
        const scale = Math.min(widthScale, heightScale);

        const printWidth = imgProps.width * scale;
        const printHeight = imgProps.height * scale;

        pdf.text("Site Map", margin, 60);
        pdf.addImage(imgData, 'PNG', margin, 65, printWidth, printHeight);

        // --- PAGE 2+: POINTS TABLE ---
        pdf.addPage();
        pdf.setFontSize(16);
        pdf.text("Coordinate Table", margin, 20);
        
        let tableY = 30;
        pdf.setFontSize(8); 
        pdf.setTextColor(100);
        
        const cols = {
           label: margin,
           zone: margin + 20,
           n: margin + 40,
           e: margin + 65,
           elev: margin + 90,
           bearing: margin + 110,
           dist: margin + 135,
           type: margin + 160
        };

        pdf.text("Label", cols.label, tableY);
        pdf.text("Zone", cols.zone, tableY);
        pdf.text("Northing", cols.n, tableY);
        pdf.text("Easting", cols.e, tableY);
        pdf.text("Elev (m)", cols.elev, tableY);
        pdf.text("Bearing", cols.bearing, tableY);
        pdf.text("Dist (m)", cols.dist, tableY);
        pdf.text("Type", cols.type, tableY);
        pdf.line(margin, tableY + 2, pdfWidth - margin, tableY + 2);
        
        tableY += 8;
        pdf.setTextColor(0);

        // Use pointsForReport (recalculated) instead of raw state
        pointsForReport.forEach((p) => {
            if (tableY > pdfHeight - 20) { 
                pdf.addPage();
                tableY = 20;
            }
            const utm = latLngToUtm(p.lat, p.lng);
            
            const labelStr = (p.label && typeof p.label === 'string') ? p.label : 
                             (p.name && typeof p.name === 'string') ? p.name : 
                             String(p.id).slice(0, 6);
            
            const zoneStr = `${utm.zone}${utm.hemi}`;

            pdf.text(labelStr, cols.label, tableY);
            pdf.text(zoneStr, cols.zone, tableY);
            
            pdf.text(utm.northing !== undefined ? utm.northing.toFixed(3) : "-", cols.n, tableY);
            pdf.text(utm.easting !== undefined ? utm.easting.toFixed(3) : "-", cols.e, tableY);
            pdf.text(p.altitude !== undefined && !isNaN(p.altitude) ? `${p.altitude.toFixed(2)}` : "-", cols.elev, tableY);
            
            // Bearing/Distance - Check undefined only, allow 0
            pdf.text(p.bearing !== undefined && !isNaN(p.bearing) ? formatBearing(p.bearing) : "-", cols.bearing, tableY);
            pdf.text(p.distance !== undefined && !isNaN(p.distance) ? p.distance.toFixed(2) : "-", cols.dist, tableY);
            
            pdf.text(p.type, cols.type, tableY);
            tableY += 6;
        });

        // Add Closing Leg if more than 2 points
        if (pointsForReport.length > 2) {
            if (tableY > pdfHeight - 20) { 
                pdf.addPage();
                tableY = 20;
            }
            const start = pointsForReport[0];
            const end = pointsForReport[pointsForReport.length - 1];
            
            const closingDist = calculateDistance(end.lat, end.lng, start.lat, start.lng);
            const closingBearing = calculateBearing(end.lat, end.lng, start.lat, start.lng);
            const utm = latLngToUtm(start.lat, start.lng);

            pdf.setTextColor(50, 50, 150); // Slight blue for closing leg
            
            pdf.text("Closing", cols.label, tableY);
            pdf.text(`${utm.zone}${utm.hemi}`, cols.zone, tableY);
            pdf.text(utm.northing.toFixed(3), cols.n, tableY);
            pdf.text(utm.easting.toFixed(3), cols.e, tableY);
            pdf.text("-", cols.elev, tableY);
            
            pdf.text(formatBearing(closingBearing), cols.bearing, tableY);
            pdf.text(closingDist.toFixed(2), cols.dist, tableY);
            
            pdf.text("calc", cols.type, tableY);
        }

        pdf.save(`${s.name.replace(/\s+/g, '_')}_report.pdf`);

    } catch (err) {
        console.error(err);
        alert("Failed to generate PDF. Map tiles might be protected.");
        const uiElements = document.querySelectorAll('[data-hide-on-export="true"]');
        uiElements.forEach((el: any) => el.style.display = '');
    } finally {
        setIsExporting(false);
    }
  };

  const handleBackup = () => {
    const filename = `AreaVue_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(JSON.stringify(surveys, null, 2), filename, 'application/json');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input immediately to allow re-selection of same file
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        if (!content) {
            alert("Error: File is empty.");
            return;
        }
        let parsed: any;
        try {
            parsed = JSON.parse(content);
        } catch (jsonErr) {
            alert("Error: File contains invalid JSON.");
            return;
        }

        const validSurveys: Survey[] = [];
        let dataToProcess: any = parsed;

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.surveys)) {
            dataToProcess = parsed.surveys;
        }
        
        const normalizeType = (t: any): string => {
            if (!t) return PointType.GPS;
            const str = String(t).toUpperCase();
            if (Object.values(PointType).includes(str as PointType)) {
                return str;
            }
            return PointType.GPS;
        };

        if (Array.isArray(dataToProcess) && dataToProcess.length > 0 && 
            (dataToProcess[0].lat !== undefined || dataToProcess[0].latitude !== undefined) && 
            !dataToProcess[0].points) {
             
             const newSurvey: Survey = {
                id: generateUUID(),
                name: `Imported Points ${new Date().toLocaleDateString()}`,
                points: dataToProcess.map((p: any) => ({
                    ...p,
                    id: String(p.id || generateUUID()),
                    lat: Number(p.lat ?? p.latitude ?? 0),
                    lng: Number(p.lng ?? p.longitude ?? p.long ?? 0),
                    type: normalizeType(p.type),
                    name: p.name ? String(p.name) : undefined,
                    label: p.label ? String(p.label) : undefined,
                    timestamp: Number(p.timestamp || Date.now())
                })).filter((p: any) => !isNaN(p.lat) && !isNaN(p.lng)),
                created: Date.now(),
                updated: Date.now()
             };
             if (newSurvey.points.length > 0) validSurveys.push(newSurvey);
        } 
        else {
             const list = Array.isArray(dataToProcess) ? dataToProcess : [dataToProcess];
             list.forEach((item: any) => {
                 if (!item || typeof item !== 'object') return;
                 if ((item.lat !== undefined || item.latitude !== undefined) && !item.points) {
                      const lat = Number(item.lat ?? item.latitude ?? 0);
                      const lng = Number(item.lng ?? item.longitude ?? item.long ?? 0);
                      if (isNaN(lat) || isNaN(lng)) return;

                      const newSurvey: Survey = {
                        id: generateUUID(),
                        name: `Imported Point ${new Date().toLocaleDateString()}`,
                        points: [{
                            ...item,
                            id: String(item.id || generateUUID()),
                            lat, lng,
                            type: normalizeType(item.type),
                            name: item.name ? String(item.name) : undefined,
                            label: item.label ? String(item.label) : undefined,
                            timestamp: Number(item.timestamp || Date.now())
                        }],
                        created: Date.now(),
                        updated: Date.now()
                     };
                     validSurveys.push(newSurvey);
                     return;
                 }
                 const rawPoints = Array.isArray(item.points) ? item.points : [];
                 const sanitizedPoints = rawPoints.map((p: any) => ({
                    ...p,
                    id: String(p.id || generateUUID()),
                    lat: Number(p.lat ?? p.latitude ?? 0),
                    lng: Number(p.lng ?? p.longitude ?? p.long ?? 0),
                    type: normalizeType(p.type),
                    name: p.name ? String(p.name) : undefined,
                    label: p.label ? String(p.label) : undefined,
                    timestamp: Number(p.timestamp || Date.now())
                 })).filter((p: any) => !isNaN(p.lat) && !isNaN(p.lng));

                 validSurveys.push({
                     id: String(item.id || generateUUID()),
                     name: String(item.name || "Untitled Import"),
                     points: sanitizedPoints,
                     created: Number(item.created || Date.now()),
                     updated: Number(item.updated || Date.now()),
                     isStaking: !!item.isStaking
                 });
             });
        }

        if (validSurveys.length === 0) {
            alert("No valid survey data found in file.");
            return;
        }

        const currentIds = new Set(allSurveysRef.current.map(s => s.id));
        const newSurveys = validSurveys.filter(s => !currentIds.has(s.id));
        const existingSurveys = validSurveys.filter(s => currentIds.has(s.id));

        if (existingSurveys.length > 0) {
            setImportConflict({ newSurveys, existingSurveys });
        } else {
            setSurveys(prev => [...prev, ...newSurveys]);
            if (newSurveys.length > 0) {
                const latest = newSurveys.sort((a,b) => (b.updated || 0) - (a.updated || 0))[0];
                setCurrentSurveyId(latest.id);
                setTimeout(() => setFitBoundsTrigger(Date.now()), 200);
            }
            alert(`Successfully imported ${newSurveys.length} surveys.`);
        }
      } catch (err: any) {
        console.error("Import Error:", err);
        let msg = "Unknown error";
        if (err instanceof Error) msg = err.message;
        else if (typeof err === 'string') msg = err;
        else if (typeof err === 'object' && err !== null) msg = JSON.stringify(err);
        alert(`Import failed: ${msg}`);
      }
    };
    reader.onerror = () => alert("Error reading file.");
    reader.readAsText(file);
  };

  const resolveImportConflict = (overwrite: boolean) => {
      if (!importConflict) return;
      const { newSurveys, existingSurveys } = importConflict;
      setSurveys(prev => {
          let final = [...prev, ...newSurveys];
          if (overwrite) {
              const overwriteMap = new Map(existingSurveys.map(s => [s.id, s]));
              final = final.map(s => overwriteMap.has(s.id) ? overwriteMap.get(s.id)! : s);
          }
          return final;
      });
      const allImported = [...newSurveys, ...(overwrite ? existingSurveys : [])];
      if (allImported.length > 0) {
          const latest = allImported.sort((a,b) => (b.updated || 0) - (a.updated || 0))[0];
          setCurrentSurveyId(latest.id);
          setTimeout(() => setFitBoundsTrigger(Date.now()), 200);
      }
      setImportConflict(null);
  };

  const area = currentSurvey ? calculateArea(currentSurvey.points) : 0;
  const perimeter = currentSurvey ? calculatePerimeter(currentSurvey.points) : 0;

  const lastPoint = currentSurvey?.points[currentSurvey.points.length - 1];
  const stakingGuide = (stakingState.isActive && stakingState.targetBearing !== null && lastPoint && !isNaN(lastPoint.lat) && !isNaN(lastPoint.lng)) 
      ? { start: lastPoint, bearing: stakingState.targetBearing } 
      : null;

  const safeGpsPosition = gpsPosition && !isNaN(gpsPosition.lat) && !isNaN(gpsPosition.lng) 
      ? { lat: gpsPosition.lat, lng: gpsPosition.lng, accuracy: gpsPosition.accuracy } 
      : null;
      
  let liveStakingStats = null;
  if (stakingState.isActive && stakingState.targetBearing !== null && lastPoint && safeGpsPosition) {
     const crossTrack = calculateCrossTrackError(
        lastPoint.lat, lastPoint.lng,
        stakingState.targetBearing,
        safeGpsPosition.lat, safeGpsPosition.lng
     );
     const distToLast = calculateDistance(lastPoint.lat, lastPoint.lng, safeGpsPosition.lat, safeGpsPosition.lng);
     
     // Only set stats if calculations returned valid numbers (geoService now guarantees non-NaN return)
     liveStakingStats = {
         crossTrackError: crossTrack.distance,
         direction: crossTrack.direction,
         distanceToLast: distToLast
     };
  }

  // Animation classes for dynamic map resizing
  const mapTransitionClass = "transition-all duration-300 ease-in-out";
  const mapPositionClass = isMenuOpen ? 'right-72' : 'right-0';
  const overlayPositionClass = isMenuOpen ? 'right-[19rem]' : 'right-2';
  const fabPositionClass = isMenuOpen ? 'right-[19rem]' : 'right-3';
  const bottomBarPositionClass = isMenuOpen ? 'right-72' : 'right-0';

  return (
    <div className="h-screen w-full bg-slate-900 text-slate-100 flex flex-col relative overflow-hidden">
      
      {/* EXPORT LOADING OVERLAY */}
      {isExporting && (
         <div className="absolute inset-0 z-[3000] bg-black/80 flex flex-col items-center justify-center">
             <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             <div className="text-white font-bold text-lg">Generating PDF Report...</div>
             <div className="text-slate-400 text-sm">Capturing map view</div>
         </div>
      )}

      {/* MAP LAYER - Dynamically resized based on menu state */}
      <div className={`absolute top-0 bottom-0 left-0 z-0 ${mapTransitionClass} ${mapPositionClass}`}>
        <MapComponent 
          points={currentSurvey?.points || []}
          activePointId={activePointId}
          isStakingMode={stakingState.isActive}
          stakingTolerance={stakingState.collinearityTolerance}
          showStakingLabels={stakingState.showLabels}
          isManualMode={isManualMode}
          gpsPosition={safeGpsPosition}
          centerOnLocation={safeGpsPosition}
          fitBoundsToPoints={false}
          fitBoundsTrigger={fitBoundsTrigger}
          recenterTrigger={recenterTrigger}
          onMapClick={handleMapClick}
          onPointClick={handlePointClick}
          onPointMove={() => {}}
          pointLabelMode="id"
          navigationTarget={null}
          stakingGuide={stakingGuide}
          isExporting={isExporting} 
          hideLines={isExporting}
          isMenuOpen={isMenuOpen}
          styleConfig={styleConfig}
        />
      </div>

      {/* TOP HEADER */}
      <div 
        data-hide-on-export="true"
        className={`absolute top-2 left-2 z-10 pointer-events-none ${mapTransitionClass} ${overlayPositionClass}`}
      >
        <Card className="pointer-events-auto !p-2 bg-slate-900/90 backdrop-blur shadow-2xl flex justify-between items-center min-h-[48px]">
          <div className="flex items-center gap-2">
             <div className="bg-blue-600 p-1.5 rounded-lg"><i className="fas fa-map-marked-alt text-white text-sm"></i></div>
             <div>
               <h1 className="font-bold text-xs text-slate-300">{currentSurvey?.name}</h1>
               <div className="text-[9px] text-slate-300 font-mono">
                   {currentSurvey?.points.length || 0} Pts • {formatArea(area)} • {formatAcres(area)}
               </div>
             </div>
          </div>
          <button onClick={() => setIsMenuOpen(true)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded-full transition-colors text-white">
             <i className="fas fa-bars text-sm"></i>
          </button>
        </Card>
      </div>

      {/* BOTTOM CONTROL CARD (SELECTED POINT) */}
      {activePoint && (
        <div 
          data-hide-on-export="true"
          className={`absolute bottom-16 left-2 z-20 animate-fade-in-up ${mapTransitionClass} ${overlayPositionClass}`}
        >
           <Card className="bg-slate-900/95 border-blue-500/30 !p-3">
              <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="bg-blue-600 text-[10px] px-1.5 py-0.5 rounded">PT {String(activePoint.id).slice(0,4)}</span>
                      {activePoint.type}
                    </h3>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {activePoint.lat.toFixed(7)}, {activePoint.lng.toFixed(7)}
                    </div>
                  </div>
                  <button onClick={() => setActivePointId(null)} className="text-slate-400 hover:text-white"><i className="fas fa-times"></i></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <Button variant="danger" className="text-sm py-2" onClick={handleDeletePoint}>
                    <i className="fas fa-trash mr-1"></i> Delete
                  </Button>
                  <Button variant="secondary" className="text-sm py-2" onClick={() => setActivePointId(null)}>
                    Deselect
                  </Button>
              </div>
           </Card>
        </div>
      )}

      {/* STATS BAR */}
      <div 
        data-hide-on-export="true"
        className={`absolute bottom-0 left-0 z-10 bg-slate-900/95 border-t border-slate-700/50 p-1 flex justify-around items-center shadow-2xl backdrop-blur-sm h-10 ${mapTransitionClass} ${bottomBarPositionClass}`}
      >
         <StatBox label="Area" value={`${formatArea(area)}\n${formatAcres(area)}`} icon="fa-ruler-combined" />
         <div className="h-6 w-px bg-slate-700/50"></div>
         <StatBox label="Perimeter" value={`${perimeter.toFixed(0)} m`} icon="fa-route" />
         <div className="h-6 w-px bg-slate-700/50"></div>
         <StatBox label="GPS" value={gpsPosition ? `±${gpsPosition.accuracy.toFixed(0)}m` : 'N/A'} icon="fa-satellite" color={gpsPosition && gpsPosition.accuracy < 5 ? 'text-green-400' : 'text-yellow-400'} />
      </div>

      {/* FABs */}
      <div 
        data-hide-on-export="true"
        className={`absolute bottom-24 flex flex-col gap-3 z-20 pointer-events-auto ${mapTransitionClass} ${fabPositionClass}`}
      >
        <Fab onClick={handleRecenter} colorClass="bg-slate-700 border-slate-500" label="My Location">
           <i className="fas fa-crosshairs text-lg" />
        </Fab>
        <Fab onClick={() => setIsManualMode(!isManualMode)} isActive={isManualMode} label={isManualMode ? "Manual Point ON" : "Manual Point"}>
           <i className={`fas ${isManualMode ? 'fa-hand-pointer' : 'fa-hand-paper'} text-lg`} />
        </Fab>
        <Fab onClick={addGpsPoint} colorClass="bg-blue-600 border-blue-400" label="Add GPS Point">
           <i className="fas fa-map-pin text-lg" />
        </Fab>
        <Fab onClick={() => setShowStakingControls(true)} colorClass="bg-amber-600 border-amber-400" label="Staking Menu" isActive={stakingState.isActive}>
           <i className="fas fa-compass text-lg" />
        </Fab>
        <Fab onClick={() => setShowChat(true)} colorClass="bg-purple-600 border-purple-400" label="AI Assistant">
           <i className="fas fa-robot text-lg" />
        </Fab>
      </div>

      {/* STAKING CONTROLS */}
      {showStakingControls && (
        <div data-hide-on-export="true">
          <StakingControls 
            state={stakingState} 
            onUpdate={setStakingState} 
            onClose={() => setShowStakingControls(false)} 
            currentBearing={getLastSegmentBearing()}
            liveStats={liveStakingStats}
          />
        </div>
      )}

      {/* STYLE EDITOR */}
      {showStyleEditor && (
        <div data-hide-on-export="true">
          <StyleEditor 
            config={styleConfig}
            onUpdate={setStyleConfig}
            onClose={() => setShowStyleEditor(false)}
          />
        </div>
      )}

      {/* AI ASSISTANT */}
      {showChat && currentSurvey && (
        <div data-hide-on-export="true">
          <ChatAssistant survey={currentSurvey} onClose={() => setShowChat(false)} />
        </div>
      )}

      {/* SIDE MENU */}
      <div 
        data-hide-on-export="true"
        className={`absolute top-0 right-0 bottom-0 w-72 bg-slate-900 border-l border-slate-800 z-50 shadow-2xl p-4 overflow-y-auto transform transition-transform duration-300 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
         <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white">Menu</h2>
            <button onClick={() => setIsMenuOpen(false)}><i className="fas fa-times text-slate-400 text-lg"></i></button>
         </div>

         {/* SURVEY LIST */}
         <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
               <h3 className="text-[10px] font-bold text-slate-500 uppercase">My Surveys</h3>
               <button onClick={createNewSurvey} className="text-blue-400 text-xs font-bold"><i className="fas fa-plus"></i> NEW</button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
               {surveys.map(s => (
                  <div key={s.id} 
                       className={`flex items-center justify-between p-2 rounded-lg border transition-colors group ${currentSurveyId === s.id ? 'bg-blue-900/30 border-blue-500' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}>
                     <div onClick={() => handleSurveySelect(s.id)} className="flex-1 min-w-0 cursor-pointer">
                        <div className="font-bold text-xs text-white truncate">{s.name}</div>
                        <div className="text-[10px] text-slate-400">{s.points.length} points • {new Date(s.updated).toLocaleDateString()}</div>
                     </div>
                     <button 
                        onClick={(e) => { e.stopPropagation(); requestDeleteSurvey(s.id); }}
                        className="ml-2 p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete Survey"
                     >
                        <i className="fas fa-trash-alt text-xs"></i>
                     </button>
                  </div>
               ))}
            </div>
         </div>

         {/* CURRENT ACTIONS */}
         <div className="space-y-2">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase">Current Survey Actions</h3>
             
             <Button variant="secondary" className="w-full justify-start text-xs py-2" onClick={() => { setRenameValue(currentSurvey?.name || ""); setShowRenameModal(true); }}>
                <i className="fas fa-edit w-4"></i> Rename Survey
             </Button>
             
             <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="justify-start text-[10px] py-2 px-2" onClick={() => exportSurvey('csv')} title="Export as CSV">
                   <i className="fas fa-file-csv w-3"></i> CSV
                </Button>
                <Button variant="secondary" className="justify-start text-[10px] py-2 px-2" onClick={() => exportSurvey('kml')} title="Export as KML">
                   <i className="fas fa-globe w-3"></i> KML
                </Button>
                <Button variant="secondary" className="justify-start text-[10px] py-2 px-2" onClick={() => exportSurvey('json')} title="Export as JSON">
                   <i className="fas fa-code w-3"></i> JSON
                </Button>
                <Button variant="secondary" className="justify-start text-[10px] py-2 px-2" onClick={handleExportPDF} title="Download Survey Report">
                   <i className="fas fa-file-pdf w-3"></i> Report (PDF)
                </Button>
             </div>

             <Button variant="secondary" className="w-full justify-start text-xs py-2" onClick={() => { setIsMenuOpen(false); setShowStyleEditor(true); }}>
                <i className="fas fa-palette w-4"></i> Point Styles
             </Button>
             <Button variant="secondary" className="w-full justify-start text-xs py-2" onClick={() => { setIsMenuOpen(false); setShowChat(true); }}>
                <i className="fas fa-magic w-4"></i> AI Assistant
             </Button>

             <Button variant="danger" className="w-full justify-start text-xs py-2" onClick={handleClearAllPoints} title="Permanently delete all points">
                <i className="fas fa-trash-alt w-4"></i> Clear All Points
             </Button>
         </div>

         {/* GLOBAL ACTIONS */}
         <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase">Data Management</h3>
             <Button variant="secondary" className="w-full justify-start text-xs py-2" onClick={handleBackup} title="Backup all data">
                <i className="fas fa-database w-4"></i> Backup All Data
             </Button>
             <div className="relative">
                <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
                <Button variant="secondary" className="w-full justify-start text-xs py-2" onClick={() => fileInputRef.current?.click()} title="Import backup">
                   <i className="fas fa-file-import w-4"></i> Import Backup
                </Button>
             </div>
         </div>
      </div>

      {/* RENAME MODAL */}
      {showRenameModal && (
         <Modal title="Rename Survey" onClose={() => setShowRenameModal(false)}>
            <div className="space-y-4">
               <input 
                 className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white focus:border-blue-500 outline-none" 
                 value={renameValue} 
                 onChange={(e) => setRenameValue(e.target.value)} 
                 placeholder="Enter survey name"
               />
               <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setRenameValue(`Survey ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`)}>
                     Use Timestamp
                  </Button>
                  <div className="flex-1"></div>
                  <Button variant="primary" onClick={handleRenameSurvey}>Save Name</Button>
               </div>
            </div>
         </Modal>
      )}

      {/* CLEAR CONFIRMATION MODAL */}
      {showClearConfirmation && (
        <Modal title="Clear All Points" onClose={() => setShowClearConfirmation(false)}>
           <div className="space-y-4">
              <p className="text-slate-300 text-sm">
                Are you sure you want to permanently delete all points in this survey? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                 <Button variant="secondary" onClick={() => setShowClearConfirmation(false)}>Cancel</Button>
                 <Button variant="danger" onClick={confirmClearAll}>Yes, Delete All</Button>
              </div>
           </div>
        </Modal>
      )}

      {/* DELETE SURVEY MODAL */}
      {surveyToDelete && (
        <Modal title="Delete Survey" onClose={() => setSurveyToDelete(null)}>
           <div className="space-y-4">
              <p className="text-slate-300 text-sm">
                Are you sure you want to delete this survey? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                 <Button variant="secondary" onClick={() => setSurveyToDelete(null)}>Cancel</Button>
                 <Button variant="danger" onClick={confirmDeleteSurvey}>Delete</Button>
              </div>
           </div>
        </Modal>
      )}

      {/* IMPORT CONFLICT MODAL */}
      {importConflict && (
        <Modal title="Import Conflict" onClose={() => setImportConflict(null)}>
           <div className="space-y-4">
              <p className="text-slate-300 text-sm">
                The import file contains <b>{importConflict.existingSurveys.length} surveys</b> that already exist on this device (based on ID).
              </p>
              <p className="text-slate-300 text-sm">
                There are also <b>{importConflict.newSurveys.length} new surveys</b>.
              </p>
              <div className="flex justify-end gap-2 flex-wrap">
                 <Button variant="secondary" onClick={() => setImportConflict(null)}>Cancel</Button>
                 <Button variant="warning" onClick={() => resolveImportConflict(false)}>Keep Existing</Button>
                 <Button variant="danger" onClick={() => resolveImportConflict(true)}>Overwrite Existing</Button>
              </div>
           </div>
        </Modal>
      )}

      {/* UNDO TOAST */}
      {showUndoToast && (
        <Toast message="Point deleted" onUndo={handleUndoDelete} onClose={() => setShowUndoToast(false)} />
      )}

    </div>
  );
};

export default App;
