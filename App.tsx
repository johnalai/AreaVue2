
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapComponent } from './components/MapComponent';
import { Card, Button, StatBox, Fab, Modal } from './components/UIComponents';
import { ChatAssistant } from './components/ChatAssistant';
import { GeoPoint, PointType, Survey, StakingState, PointLabelMode } from './types';
import { 
  calculateArea, calculatePerimeter, formatArea, formatAcres, 
  calculateDistance, formatBearing, calculateBearing, calculateCollinearity, snapToBaseline, latLngToUtm, normalizeAngle 
} from './services/geoService';
import { analyzeSurvey } from './services/geminiService';

const App: React.FC = () => {
  // --- State ---
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [currentSurvey, setCurrentSurvey] = useState<Survey>({
    id: uuidv4(), name: 'New Survey', points: [], created: Date.now(), updated: Date.now()
  });
  
  // UI State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pointLabelMode, setPointLabelMode] = useState<PointLabelMode>('none');
  const [isStakingOptionsOpen, setIsStakingOptionsOpen] = useState(true); // Collapsible staking panel state
  
  // Map Control
  const [gpsPosition, setGpsPosition] = useState<{lat: number; lng: number; accuracy: number} | null>(null);
  const [mapCenter, setMapCenter] = useState<{lat: number; lng: number; zoom?: number} | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [fitBoundsForExport, setFitBoundsForExport] = useState(false);
  
  // Navigation State
  const [navigationTargetId, setNavigationTargetId] = useState<string | null>(null);
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  
  // Features State
  const [gpsAveraging, setGpsAveraging] = useState<{ active: boolean; timeLeft: number; samples: any[] }>({ active: false, timeLeft: 0, samples: [] });
  const [gpsThreshold, setGpsThreshold] = useState<number>(5); // Default 5 meters
  
  // Staking State
  const [staking, setStaking] = useState<StakingState>({
    isActive: false,
    currentBearing: null,
    targetBearing: null,
    strictCollinearity: false,
    collinearityTolerance: 10,
    lastPosition: null,
    baselineStartId: null,
    baselineEndId: null,
    baselineBearing: null,
    baselineDistance: null
  });

  const [license, setLicense] = useState<{ status: string; trialDaysLeft: number }>({ status: 'trial', trialDaysLeft: 14 });

  // Refs
  const gpsWatchId = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---

  // 1. Load Data & License
  useEffect(() => {
    const loaded = localStorage.getItem('areavue_surveys');
    if (loaded) {
        try {
            setSurveys(JSON.parse(loaded));
        } catch(e) { console.error("Failed to load surveys", e); }
    }
    
    // Mock License Logic
    const installDate = parseInt(localStorage.getItem('areavue_install_date') || '0');
    if (!installDate) {
        localStorage.setItem('areavue_install_date', Date.now().toString());
    } else {
        const days = Math.floor((Date.now() - installDate) / (1000 * 60 * 60 * 24));
        const isPro = localStorage.getItem('areavue_pro') === 'true';
        setLicense({
            status: isPro ? 'pro' : (days > 14 ? 'expired' : 'trial'),
            trialDaysLeft: Math.max(0, 14 - days)
        });
    }
  }, []);

  // 2. GPS Tracking
  useEffect(() => {
    if (!navigator.geolocation) return;
    gpsWatchId.current = navigator.geolocation.watchPosition(
        (pos) => {
            const { latitude, longitude, accuracy, altitude } = pos.coords;
            setGpsPosition({ lat: latitude, lng: longitude, accuracy });
            
            // Handle Averaging
            if (gpsAveraging.active) {
                setGpsAveraging(prev => ({
                    ...prev,
                    samples: [...prev.samples, { lat: latitude, lng: longitude, accuracy, altitude }]
                }));
            }
        },
        (err) => console.warn("GPS Error", err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    return () => { if(gpsWatchId.current) navigator.geolocation.clearWatch(gpsWatchId.current); };
  }, [gpsAveraging.active]);

  // 3. GPS Averaging Timer
  useEffect(() => {
    if (!gpsAveraging.active) return;
    if (gpsAveraging.timeLeft <= 0) {
        finishGPSCollection();
        return;
    }
    const timer = setTimeout(() => {
        setGpsAveraging(prev => ({ ...prev, timeLeft: prev.timeLeft - 1 }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [gpsAveraging.active, gpsAveraging.timeLeft]);

  // --- Actions ---

  const startGPSCollection = () => {
    if (!gpsPosition) {
        alert("Waiting for GPS signal...");
        return;
    }
    setGpsAveraging({ active: true, timeLeft: 20, samples: [] });
  };

  const finishGPSCollection = () => {
    const { samples } = gpsAveraging;
    setGpsAveraging({ active: false, timeLeft: 0, samples: [] });
    
    if (samples.length === 0) {
        alert("No GPS samples collected.");
        return;
    }

    // Weighted average based on accuracy (1/accuracy^2)
    let latSum = 0, lngSum = 0, altSum = 0, weightSum = 0;
    samples.forEach(s => {
        const w = 1 / (s.accuracy * s.accuracy || 1);
        latSum += s.lat * w;
        lngSum += s.lng * w;
        altSum += (s.altitude || 0) * w;
        weightSum += w;
    });

    const avgAccuracy = samples.reduce((acc, s) => acc + s.accuracy, 0) / samples.length;
    
    // Check Threshold
    if (avgAccuracy > gpsThreshold) {
        const proceed = confirm(`⚠️ Low GPS Accuracy Warning\n\nAchieved Accuracy: ±${avgAccuracy.toFixed(1)}m\nRequired Threshold: ±${gpsThreshold}m\n\nThe signal quality is below your settings. Do you want to keep this point anyway?`);
        if (!proceed) return;
    }

    const newPoint: GeoPoint = {
        id: uuidv4(),
        lat: latSum / weightSum,
        lng: lngSum / weightSum,
        altitude: altSum / weightSum,
        accuracy: avgAccuracy,
        type: staking.isActive ? PointType.STAKING : PointType.GPS,
        timestamp: Date.now(),
        // Assign Label Immediately
        label: String.fromCharCode(65 + (currentSurvey.points.filter(p => p.type === PointType.GPS).length % 26))
    };

    addPointToSurvey(newPoint);
  };

  const addManualPoint = (lat: number, lng: number) => {
    if (!manualMode) return;
    
    // Count manual points for labeling
    const manualCount = currentSurvey.points.filter(p => p.type === PointType.MANUAL).length;
    
    const newPoint: GeoPoint = {
        id: uuidv4(),
        lat,
        lng,
        type: PointType.MANUAL,
        timestamp: Date.now(),
        label: `M${manualCount + 1}`
    };
    addPointToSurvey(newPoint);
  };

  // Use functional updates to ensure latest state is used
  const addPointToSurvey = (point: GeoPoint) => {
    setCurrentSurvey(prev => {
        const updatedPoints = [...prev.points];
        
        // Staking Logic
        if (staking.isActive && updatedPoints.length > 0) {
            const last = updatedPoints[updatedPoints.length - 1];
            point.distance = calculateDistance(last.lat, last.lng, point.lat, point.lng);
            point.bearing = calculateBearing(last.lat, last.lng, point.lat, point.lng);
            
            const stakingCount = updatedPoints.filter(p => p.type === PointType.STAKING).length;
            if (!point.label) point.label = `S${stakingCount + 1}`;

            if (updatedPoints.length === 1) {
                setStaking(st => ({ ...st, currentBearing: point.bearing || null }));
            } 
            else if (staking.currentBearing !== null) {
                const { error } = calculateCollinearity(last.lat, last.lng, staking.currentBearing, point.lat, point.lng);
                point.collinearityError = error;
                if (staking.strictCollinearity && error > staking.collinearityTolerance) {
                    alert(`Strict Collinearity: Point is ${error.toFixed(1)}° off. Adjust position.`);
                    return prev; // No change
                }
            }
        }

        // Intermediate Snapping
        if (staking.baselineStartId && staking.baselineEndId) {
            const start = prev.points.find(p => p.id === staking.baselineStartId);
            const end = prev.points.find(p => p.id === staking.baselineEndId);
            if (start && end) {
                const snapped = snapToBaseline(start.lat, start.lng, end.lat, end.lng, point.lat, point.lng);
                point.lat = snapped.lat;
                point.lng = snapped.lng;
                point.type = PointType.INTERMEDIATE;
                point.isSnapped = true;
                if (!point.label) point.label = `i${updatedPoints.filter(p => p.type === PointType.INTERMEDIATE).length + 1}`;
            }
        }

        updatedPoints.push(point);
        const updatedSurvey = { ...prev, points: updatedPoints, updated: Date.now() };
        saveSurvey(updatedSurvey);
        return updatedSurvey;
    });
  };

  const movePoint = (id: string, newLat: number, newLng: number) => {
    setCurrentSurvey(prev => {
        let updatedPoints = prev.points.map(p => 
            p.id === id ? { ...p, lat: newLat, lng: newLng } : p
        );

        // Recalculate metrics
        updatedPoints = updatedPoints.map((p, i) => {
            if (i === 0) return { ...p, distance: 0, bearing: 0 };
            const prevPt = updatedPoints[i-1];
            return {
                ...p,
                distance: calculateDistance(prevPt.lat, prevPt.lng, p.lat, p.lng),
                bearing: calculateBearing(prevPt.lat, prevPt.lng, p.lat, p.lng)
            };
        });

        const updatedSurvey = { ...prev, points: updatedPoints, updated: Date.now() };
        saveSurvey(updatedSurvey);
        return updatedSurvey;
    });
  };

  const deletePoint = (id: string) => {
    if (!confirm("Delete this point?")) return;

    setCurrentSurvey(prev => {
        // FIX: Force string comparison to handle imported legacy numeric IDs
        let updatedPoints = prev.points.filter(p => String(p.id) !== String(id));
        
        // Recalculate metrics
        updatedPoints = updatedPoints.map((p, i) => {
            if (i === 0) return { ...p, distance: 0, bearing: 0 };
            const prevPt = updatedPoints[i-1];
            return {
                ...p,
                distance: calculateDistance(prevPt.lat, prevPt.lng, p.lat, p.lng),
                bearing: calculateBearing(prevPt.lat, prevPt.lng, p.lat, p.lng)
            };
        });

        const updatedSurvey = { ...prev, points: updatedPoints, updated: Date.now() };
        saveSurvey(updatedSurvey);
        return updatedSurvey;
    });
    
    setActivePointId(null);
    if (navigationTargetId === id) setNavigationTargetId(null);
  };

  const saveSurvey = (survey: Survey) => {
    setSurveys(prevSurveys => {
        const newSurveys = prevSurveys.filter(s => s.id !== survey.id);
        newSurveys.push(survey);
        localStorage.setItem('areavue_surveys', JSON.stringify(newSurveys));
        return newSurveys;
    });
  };

  const handleLoadSurvey = (survey: Survey) => {
    // Fix: Ensure IDs are strings to avoid deletion bugs with legacy numeric IDs
    const patchedPoints = survey.points.map((p, i) => {
        const newPoint = { ...p, id: String(p.id) }; // Enforce string ID
        if (!newPoint.label) {
             if (newPoint.type === PointType.GPS) newPoint.label = String.fromCharCode(65 + (i % 26));
             else if (newPoint.type === PointType.MANUAL) newPoint.label = `M${String(newPoint.id).substring(0,1)}`;
             else if (newPoint.type === PointType.STAKING) newPoint.label = `S${String(newPoint.id).substring(0,1)}`;
             else newPoint.label = String(i+1);
        }
        return newPoint;
    });
    
    const patchedSurvey = { ...survey, points: patchedPoints };
    setCurrentSurvey(patchedSurvey);
    setNavigationTargetId(null);
    if (patchedSurvey.points && patchedSurvey.points.length > 0) {
        const latSum = patchedSurvey.points.reduce((sum, p) => sum + p.lat, 0);
        const lngSum = patchedSurvey.points.reduce((sum, p) => sum + p.lng, 0);
        const centerLat = latSum / patchedSurvey.points.length;
        const centerLng = lngSum / patchedSurvey.points.length;
        setMapCenter({
            lat: centerLat,
            lng: centerLng,
            zoom: patchedSurvey.points.length === 1 ? 18 : 16
        });
    }
    setIsMenuOpen(false);
  };

  const handleClearCurrent = () => {
    if (confirm("Clear all points from the current map? This cannot be undone.")) {
        // Fix: Empty the current survey's points but keep metadata
        // This ensures we don't create a detached new survey if we are editing an existing one.
        setCurrentSurvey(prev => {
            const emptiedSurvey = { 
                ...prev, 
                points: [], 
                updated: Date.now() 
            };
            // Persist the empty state immediately
            saveSurvey(emptiedSurvey);
            return emptiedSurvey;
        });
        
        setNavigationTargetId(null);
        setActivePointId(null);
        setIsMenuOpen(false);
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportSurvey = (format: 'csv' | 'kml' | 'json') => {
    if (format === 'json') {
        const dataStr = JSON.stringify({ exportDate: new Date(), app: 'AreaVue', surveys: [currentSurvey] }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        downloadFile(blob, `areavue_survey_${currentSurvey.name}.json`);
        return;
    }
    if (format === 'csv') {
        const header = "ID,Type,Lat,Lng,Elevation_m,Accuracy_m,UTM_Zone,UTM_Easting,UTM_Northing\n";
        const rows = currentSurvey.points.map((p, i) => {
            const utm = latLngToUtm(p.lat, p.lng);
            return `${p.label || p.id},${p.type},${p.lat.toFixed(8)},${p.lng.toFixed(8)},${p.altitude?.toFixed(2) || ''},${p.accuracy?.toFixed(1)},${utm.zone}${utm.hemi},${utm.easting.toFixed(2)},${utm.northing.toFixed(2)}`;
        }).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        downloadFile(blob, `survey_${currentSurvey.name}.csv`);
    } else {
        // KML logic
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${currentSurvey.name}</name>
    <Placemark>
      <LineString>
        <coordinates>
          ${currentSurvey.points.map(p => `${p.lng},${p.lat},${p.altitude || 0}`).join(' ')}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
        const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        downloadFile(blob, `survey_${currentSurvey.name}.kml`);
    }
  };

  const exportAllSurveys = (format: 'csv' | 'kml' | 'json') => {
    if (surveys.length === 0) {
        alert("No surveys to export.");
        return;
    }
    if (format === 'json') {
        const dataStr = JSON.stringify({ exportDate: new Date(), app: 'AreaVue', surveys: surveys }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        downloadFile(blob, `areavue_full_backup_${new Date().toISOString().split('T')[0]}.json`);
        return;
    }
    if (format === 'csv') {
        let csvContent = "Survey_Name,ID,Type,Lat,Lng,Elevation_m,Accuracy_m,UTM_Zone,UTM_Easting,UTM_Northing\n";
        surveys.forEach(survey => {
            survey.points.forEach((p, i) => {
                const utm = latLngToUtm(p.lat, p.lng);
                const row = `"${survey.name}",${p.label || p.id},${p.type},${p.lat.toFixed(8)},${p.lng.toFixed(8)},${p.altitude?.toFixed(2) || ''},${p.accuracy?.toFixed(1)},${utm.zone}${utm.hemi},${utm.easting.toFixed(2)},${utm.northing.toFixed(2)}\n`;
                csvContent += row;
            });
        });
        const blob = new Blob([csvContent], { type: 'text/csv' });
        downloadFile(blob, `areavue_all_surveys_${new Date().toISOString().split('T')[0]}.csv`);
    }
    if (format === 'kml') {
        let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AreaVue All Surveys</name>`;
        surveys.forEach(survey => {
            kml += `
    <Folder>
        <name>${survey.name}</name>
        <Placemark>
            <name>${survey.name} Boundary</name>
            <LineString>
                <coordinates>
                  ${survey.points.map(p => `${p.lng},${p.lat},${p.altitude || 0}`).join(' ')}
                </coordinates>
            </LineString>
        </Placemark>
    </Folder>`;
        });
        kml += `
  </Document>
</kml>`;
        const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        downloadFile(blob, `areavue_all_surveys_${new Date().toISOString().split('T')[0]}.kml`);
    }
  };

  const exportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setFitBoundsForExport(true); 
    
    await new Promise(resolve => setTimeout(resolve, 3500));

    try {
        const win = window as any;
        if (!win.jspdf || !win.html2canvas) {
            alert("PDF libraries not loaded. Please check internet.");
            setIsExporting(false);
            setFitBoundsForExport(false);
            return;
        }
        
        const { jsPDF } = win.jspdf;
        const doc = new jsPDF();
        
        const mapElement = document.getElementById('map-container');
        let mapImgData = null;
        
        if (mapElement) {
             try {
                 const canvas = await win.html2canvas(mapElement, { 
                     useCORS: true, 
                     allowTaint: false,
                     backgroundColor: '#cbd5e1', 
                     logging: false
                 });
                 mapImgData = canvas.toDataURL('image/png');
             } catch (e) {
                 console.warn("Map capture failed", e);
             }
        }

        doc.setFontSize(22);
        doc.text("AreaVue Survey Report", 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Survey Name: ${currentSurvey.name}`, 20, 35);
        doc.text(`Date: ${new Date(currentSurvey.updated).toLocaleString()}`, 20, 42);
        doc.setFontSize(10);
        doc.text(`Total Area: ${formatArea(area)} / ${formatAcres(area)}`, 20, 52);
        doc.text(`Perimeter: ${perimeter.toFixed(1)} m`, 20, 58);
        doc.text(`Total Points: ${currentSurvey.points.length}`, 20, 64);
        
        let y = 75;

        if (mapImgData) {
            const imgProps = doc.getImageProperties(mapImgData);
            const pdfWidth = doc.internal.pageSize.getWidth() - 40;
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            const finalHeight = Math.min(pdfHeight, 140);
            
            doc.addImage(mapImgData, 'PNG', 20, y, pdfWidth, finalHeight);
            doc.setDrawColor(0, 0, 0);
            doc.rect(20, y, pdfWidth, finalHeight); 
            y += finalHeight + 15;
        } else {
            doc.setTextColor(150, 0, 0);
            doc.text("(Map snapshot unavailable)", 20, y);
            doc.setTextColor(0, 0, 0);
            y += 15;
        }

        doc.setFontSize(14);
        doc.text("Coordinates & Elevation", 20, y);
        y += 8;

        doc.setFontSize(8);
        doc.setFillColor(230, 230, 230);
        doc.rect(20, y-4, 170, 6, 'F');
        doc.font = "helvetica";
        doc.setFont(undefined, 'bold');
        doc.text("ID", 22, y);
        doc.text("Lat", 35, y);
        doc.text("Lng", 60, y);
        doc.text("Bearing", 85, y);
        doc.text("Elev(m)", 110, y);
        doc.text("UTM Z", 130, y);
        doc.text("UTM E", 150, y);
        doc.text("UTM N", 175, y);
        doc.setFont(undefined, 'normal');
        
        y += 6;

        currentSurvey.points.forEach((p, i) => {
            if (y > 280) { 
                doc.addPage(); 
                y = 20; 
                doc.setFont(undefined, 'bold');
                doc.text("ID", 22, y);
                doc.text("Lat", 35, y);
                doc.text("Lng", 60, y);
                doc.text("Bearing", 85, y);
                doc.text("Elev(m)", 110, y);
                doc.text("UTM Z", 130, y);
                doc.text("UTM E", 150, y);
                doc.text("UTM N", 175, y);
                doc.setFont(undefined, 'normal');
                y += 6;
            }
            
            const label = p.label || String(p.id).substring(0,8);
            const utm = latLngToUtm(p.lat, p.lng);

            let bearingStr = "-";
            if (i > 0) {
                const prev = currentSurvey.points[i-1];
                const b = calculateBearing(prev.lat, prev.lng, p.lat, p.lng);
                bearingStr = formatBearing(b);
            }

            doc.text(label, 22, y);
            doc.text(p.lat.toFixed(6), 35, y);
            doc.text(p.lng.toFixed(6), 60, y);
            doc.text(bearingStr, 85, y);
            doc.text(p.altitude ? p.altitude.toFixed(1) : "-", 110, y);
            doc.text(`${utm.zone}${utm.hemi}`, 130, y);
            doc.text(utm.easting.toFixed(1), 150, y);
            doc.text(utm.northing.toFixed(1), 175, y);
            
            doc.setDrawColor(220, 220, 220);
            doc.line(20, y+1, 190, y+1);
            y += 6;
        });
        
        doc.save(`report_${currentSurvey.name}.pdf`);
    } catch (e) {
        console.error(e);
        alert("Failed to generate PDF map snapshot. Check console.");
    } finally {
        setIsExporting(false);
        setFitBoundsForExport(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    let importedCount = 0;
    let lastImported: Survey | null = null;
    const newSurveys = [...surveys];

    for (const file of files) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const processSurvey = (s: Survey) => {
                // Always import, append (1), (2) etc if duplicate ID or assume user wants to merge/overwrite
                // Actually, we should check ID. If ID exists, overwrite it.
                const existingIdx = newSurveys.findIndex(ex => ex.id === s.id);
                if (existingIdx !== -1) {
                    newSurveys[existingIdx] = s; // Overwrite
                } else {
                    newSurveys.push(s);
                }
                lastImported = s;
                importedCount++;
            };
            if (data.surveys && Array.isArray(data.surveys)) {
                data.surveys.forEach(processSurvey);
            } else if (data.id && data.points) {
                processSurvey(data);
            }
        } catch (err) {
            console.error(`Failed to import file ${file.name}`, err);
        }
    }

    if (importedCount > 0) {
        setSurveys(newSurveys);
        localStorage.setItem('areavue_surveys', JSON.stringify(newSurveys));
        if (lastImported) handleLoadSurvey(lastImported);
        alert(`Successfully imported ${importedCount} survey(s).`);
    } else {
        alert("No new surveys imported.");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSearch = async () => {
      if (!searchQuery) return;
      try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          if (data && data.length > 0) {
              const { lat, lon } = data[0];
              setMapCenter({ lat: parseFloat(lat), lng: parseFloat(lon), zoom: 16 });
              setIsMenuOpen(false);
          } else {
              alert("Location not found");
          }
      } catch (e) {
          alert("Search failed");
      }
  };

  // --- Derived Values ---
  const area = calculateArea(currentSurvey.points);
  const perimeter = calculatePerimeter(currentSurvey.points);
  const activePoint = currentSurvey.points.find(p => p.id === activePointId);
  const navigationTarget = currentSurvey.points.find(p => p.id === navigationTargetId);

  let navDistance = 0;
  let navBearing = 0;
  if (navigationTarget && gpsPosition) {
    navDistance = calculateDistance(gpsPosition.lat, gpsPosition.lng, navigationTarget.lat, navigationTarget.lng);
    navBearing = calculateBearing(gpsPosition.lat, gpsPosition.lng, navigationTarget.lat, navigationTarget.lng);
  }

  const toggleStakingMode = () => {
      if (!license.status.includes('pro') && license.status !== 'trial') {
          alert("Upgrade to Pro for Staking Mode");
          return;
      }
      setStaking(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const setBaseline = (pId: string) => {
      if (!staking.baselineStartId) {
          setStaking(prev => ({ ...prev, baselineStartId: pId }));
      } else if (!staking.baselineEndId) {
          const start = currentSurvey.points.find(p => p.id === staking.baselineStartId);
          const end = currentSurvey.points.find(p => p.id === pId);
          if (start && end) {
              setStaking(prev => ({ 
                  ...prev, 
                  baselineEndId: pId,
                  baselineBearing: calculateBearing(start.lat, start.lng, end.lat, end.lng),
                  baselineDistance: calculateDistance(start.lat, start.lng, end.lat, end.lng)
              }));
          }
      } else {
          setStaking(prev => ({ ...prev, baselineStartId: pId, baselineEndId: null, baselineBearing: null, baselineDistance: null }));
      }
  };

  const handleTurn = (direction: 'Left' | 'Right') => {
      if (staking.currentBearing === null) return;
      const turnAmount = document.getElementById('turnAngleInput') as HTMLInputElement;
      const angle = parseFloat(turnAmount?.value || "90");
      let newBearing = 0;
      if (direction === 'Left') newBearing = normalizeAngle(staking.currentBearing - angle);
      else newBearing = normalizeAngle(staking.currentBearing + angle);
      setStaking(prev => ({ ...prev, currentBearing: newBearing }));
  };

  const zoomToLocation = () => {
      if (gpsPosition) setMapCenter({ lat: gpsPosition.lat, lng: gpsPosition.lng, zoom: 18 });
      else alert("Location not acquired yet.");
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 relative overflow-hidden text-slate-100 font-sans">
      {/* Key prop forces map reset when survey changes significantly (cleared/loaded) */}
      <div className="absolute inset-0 z-0" key={currentSurvey.id + currentSurvey.updated + currentSurvey.points.length}>
          <MapComponent 
            points={currentSurvey.points}
            activePointId={activePointId}
            isStakingMode={staking.isActive}
            isManualMode={manualMode}
            gpsPosition={gpsPosition}
            centerOnLocation={mapCenter}
            fitBoundsToPoints={fitBoundsForExport}
            hideUserPosition={isExporting} 
            hideLines={isExporting}        
            pointLabelMode={pointLabelMode} 
            navigationTarget={navigationTarget || null}
            onMapClick={(lat, lng) => { if(manualMode && !staking.isActive) addManualPoint(lat, lng); }}
            onPointClick={(id) => { setActivePointId(id); if (staking.isActive) setBaseline(id); }}
            onPointDelete={deletePoint}
            onPointMove={movePoint}
            baseline={staking.baselineStartId && staking.baselineEndId ? {
                start: currentSurvey.points.find(p => p.id === staking.baselineStartId)!,
                end: currentSurvey.points.find(p => p.id === staking.baselineEndId)!
            } : null}
          />
      </div>
      
      <div className={`absolute top-0 left-0 right-0 z-10 p-3 pointer-events-none flex justify-between items-start ${isExporting ? 'opacity-0' : ''}`}>
        <div className="flex flex-col gap-2 pointer-events-auto">
            <Card className="!p-2 !rounded-xl bg-slate-900/80 backdrop-blur border-slate-700 flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shadow-lg shadow-current ${gpsPosition?.accuracy && gpsPosition.accuracy < 5 ? 'bg-green-500 text-green-500' : (gpsPosition ? 'bg-amber-500 text-amber-500' : 'bg-red-500 text-red-500')}`} />
                <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">GPS Accuracy</div>
                    <div className="text-sm font-mono font-semibold leading-none">{gpsPosition ? `±${gpsPosition.accuracy.toFixed(1)}m` : 'Searching...'}</div>
                </div>
            </Card>
            {navigationTargetId && gpsPosition && (
                <Card className="!p-3 !rounded-xl bg-blue-900/90 backdrop-blur border-blue-500 shadow-xl shadow-blue-900/30 animate-fade-in flex flex-col gap-1 w-48">
                    <div className="flex justify-between items-center border-b border-blue-700/50 pb-1 mb-1">
                        <div className="text-[10px] text-blue-300 uppercase font-bold">Navigating To</div>
                        <button onClick={() => setNavigationTargetId(null)} className="text-blue-300 hover:text-white"><i className="fas fa-times"/></button>
                    </div>
                    <div className="text-sm font-bold text-white truncate mb-1">{activePoint?.name || `Point ${String(navigationTargetId).substring(0,4)}...`}</div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="text-center"><div className="text-[10px] text-blue-400">Dist</div><div className="font-mono font-bold text-lg">{navDistance.toFixed(0)}m</div></div>
                        <div className="text-center"><div className="text-[10px] text-blue-400">Bearing</div><div className="font-mono font-bold text-lg text-amber-400">{formatBearing(navBearing)}</div></div>
                    </div>
                </Card>
            )}
            {(license.status === 'trial' || license.status === 'expired') && (
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${license.status === 'trial' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'}`}>
                    {license.status === 'trial' ? `🕒 Trial: ${license.trialDaysLeft} days left` : '❌ Trial Expired'}
                </div>
            )}
        </div>
        <Button variant="secondary" className="pointer-events-auto !p-3 !rounded-full w-12 h-12 !bg-slate-800 shadow-xl" onClick={() => setIsMenuOpen(true)}><i className="fas fa-bars" /></Button>
      </div>

      <div className={`absolute bottom-32 left-4 z-20 pointer-events-auto ${isExporting ? 'opacity-0' : ''}`}>
        <Fab className="!w-10 !h-10 bg-slate-800 border-slate-600 text-slate-400" onClick={() => setShowHelpModal(true)} label="Help"><i className="fas fa-question" /></Fab>
      </div>

      {manualMode && !isExporting && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-bounce">
              <div className="bg-pink-500 text-white px-4 py-2 rounded-full shadow-xl font-bold border-2 border-white"><i className="fas fa-hand-pointer mr-2"/> Tap Map to Add Point</div>
          </div>
      )}

      {activePointId && !staking.isActive && !isExporting && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-64">
              <Card className="!p-3 border-blue-500/50 shadow-2xl">
                  <div className="flex justify-between items-center mb-2">
                     <span className="font-bold text-sm">Selected Point</span>
                     <button onClick={() => setActivePointId(null)} className="text-slate-400 hover:text-white"><i className="fas fa-times"/></button>
                  </div>
                  <div className="text-xs text-slate-400 mb-3">ID: {String(activePointId).substring(0,8)}...<br/>Type: {activePoint?.type}</div>
                  <div className="flex gap-2">
                      <Button className="flex-1 !py-1 !text-xs" onClick={() => { setNavigationTargetId(activePointId); setActivePointId(null); }}><i className="fas fa-compass mr-1"/> Navigate</Button>
                      <Button variant="danger" className="flex-1 !py-1 !text-xs" onClick={() => deletePoint(activePointId)}><i className="fas fa-trash"/></Button>
                  </div>
              </Card>
          </div>
      )}

      {staking.isActive && !isExporting && (
          <div className="absolute top-20 left-4 z-10 pointer-events-auto animate-fade-in-left">
             <Card className="w-72 !bg-slate-900/90 border-amber-600/50 shadow-2xl shadow-amber-900/20">
                 <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2">
                    <h3 className="text-amber-500 font-bold uppercase text-sm flex items-center gap-2"><i className="fas fa-drafting-compass"/> Staking</h3>
                    <div className="flex gap-2">
                        <button onClick={() => setIsStakingOptionsOpen(!isStakingOptionsOpen)} className="text-slate-400 hover:text-white bg-slate-800 rounded px-2 py-0.5 text-xs border border-slate-700"><i className={`fas fa-chevron-${isStakingOptionsOpen ? 'up' : 'down'}`}/></button>
                        <button onClick={() => setStaking(prev => ({...prev, isActive: false}))} className="text-slate-400 hover:text-white"><i className="fas fa-times"/></button>
                    </div>
                 </div>
                 <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Bearing</div>
                            <div className="font-mono font-bold text-xl text-amber-400">{staking.currentBearing ? formatBearing(staking.currentBearing) : '--'}</div>
                        </div>
                        <div className="bg-slate-800 p-2 rounded text-center border border-slate-700">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wide">Distance</div>
                            <div className="font-mono font-bold text-xl">{currentSurvey.points.length > 1 ? `${currentSurvey.points[currentSurvey.points.length-1].distance?.toFixed(1)}m` : '0.0m'}</div>
                        </div>
                    </div>
                    {isStakingOptionsOpen && (
                        <div className="space-y-3 pt-2 border-t border-slate-700 animate-fade-in">
                             <div className="bg-slate-800/50 p-2 rounded flex flex-col gap-1">
                                <label className="text-[10px] text-slate-400 font-bold uppercase">Tolerance (deg)</label>
                                <div className="flex gap-2 items-center">
                                     <input type="number" value={staking.collinearityTolerance} onChange={(e) => setStaking(prev => ({ ...prev, collinearityTolerance: parseFloat(e.target.value) || 0 }))} className="bg-slate-700 text-white text-sm rounded px-2 py-1 w-full font-mono text-center disabled:opacity-50 border border-slate-600" disabled={staking.strictCollinearity} />
                                     <Button className={`!py-1 !px-2 !text-[10px] whitespace-nowrap ${staking.strictCollinearity ? 'bg-amber-600' : 'bg-slate-600'}`} onClick={() => setStaking(prev => ({ ...prev, strictCollinearity: !prev.strictCollinearity }))}>{staking.strictCollinearity ? "Strict" : "Loose"}</Button>
                                </div>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Turn Corner</label>
                                    <input id="turnAngleInput" type="number" defaultValue="90" className="bg-slate-700 text-white text-xs rounded px-1 py-0.5 w-12 font-mono text-center border border-slate-600" />
                                </div>
                                <div className="flex gap-2">
                                     <Button variant="secondary" className="flex-1 !py-1 !text-xs bg-slate-700 border border-slate-600" onClick={() => handleTurn('Left')}><i className="fas fa-undo mr-1"/> Left</Button>
                                     <Button variant="secondary" className="flex-1 !py-1 !text-xs bg-slate-700 border border-slate-600" onClick={() => handleTurn('Right')}>Right <i className="fas fa-redo ml-1"/></Button>
                                </div>
                            </div>
                            {staking.baselineStartId && (
                                <div className="bg-pink-900/20 p-2 rounded border border-pink-500/30">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="text-[10px] text-pink-400 font-bold uppercase">Intermediate</div>
                                        <button onClick={() => setStaking(prev => ({ ...prev, baselineStartId: null, baselineEndId: null }))} className="text-[10px] text-slate-400 hover:text-white">Clear</button>
                                    </div>
                                    {!staking.baselineEndId ? <div className="text-xs text-slate-300 animate-pulse text-center py-1">Select end point...</div> : (
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs"><span>Bear:</span> <span className="font-mono text-pink-200">{formatBearing(staking.baselineBearing || 0)}</span></div>
                                            <div className="flex justify-between text-xs"><span>Dist:</span> <span className="font-mono text-pink-200">{staking.baselineDistance?.toFixed(1)}m</span></div>
                                            <div className="text-[10px] text-slate-500 mt-1 text-center italic">Snapping active</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                 </div>
             </Card>
          </div>
      )}

      {gpsAveraging.active && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
              <Card className="w-80 text-center !bg-slate-900 border-blue-500">
                  <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
                  <h2 className="text-xl font-bold text-white mb-1">Averaging GPS</h2>
                  <p className="text-slate-400 text-sm mb-4">Stand still for high accuracy...</p>
                  <div className="text-4xl font-mono font-bold text-blue-400 mb-4">{gpsAveraging.timeLeft}s</div>
                  <div className="text-xs text-slate-500">Samples: {gpsAveraging.samples.length} | Acc: ±{gpsPosition?.accuracy.toFixed(1)}m</div>
                  <Button onClick={finishGPSCollection} className="mt-6 w-full" variant="danger">Stop Early</Button>
              </Card>
          </div>
      )}

      <div className={`absolute bottom-8 left-0 right-0 z-10 flex justify-center items-end gap-6 px-6 pointer-events-none ${isExporting ? 'opacity-0' : ''}`}>
         <div className="pointer-events-auto flex flex-col gap-4 mb-2">
             <Fab onClick={toggleStakingMode} isActive={staking.isActive} colorClass={staking.isActive ? 'bg-amber-900/80 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-600 text-slate-400'} label="Staking"><i className="fas fa-ruler-combined text-xl"/></Fab>
             <Fab onClick={zoomToLocation} colorClass="bg-slate-800 border-slate-600" label="My Loc"><i className="fas fa-crosshairs text-xl text-blue-400"/></Fab>
         </div>
         <button onClick={startGPSCollection} className="pointer-events-auto w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full shadow-2xl shadow-blue-500/30 border-4 border-slate-900 hover:scale-105 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1 mb-2 group relative">
            <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg font-bold whitespace-nowrap pointer-events-none">Add GPS Point</div>
            <i className="fas fa-map-marker-alt text-3xl text-white drop-shadow-md"/>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Add Pt</span>
         </button>
         <div className="pointer-events-auto flex flex-col gap-4 mb-2">
             <Fab onClick={() => setManualMode(!manualMode)} isActive={manualMode} colorClass={manualMode ? 'bg-pink-900/80 border-pink-500 text-pink-400' : 'bg-slate-800 border-slate-600 text-pink-400'} label="Manual"><i className="fas fa-hand-pointer text-xl"/></Fab>
         </div>
      </div>

      {isExporting && (
          <div className="absolute bottom-4 right-4 z-50 animate-bounce">
              <Card className="!bg-blue-900/90 border-blue-500 !p-3 flex items-center gap-3 shadow-2xl">
                  <i className="fas fa-circle-notch fa-spin text-white text-xl"/>
                  <div><div className="text-sm font-bold text-white">Generating Report...</div><div className="text-xs text-blue-200">Please wait</div></div>
              </Card>
          </div>
      )}

      <div className={`absolute inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-xl z-40 shadow-2xl transform transition-transform duration-300 border-l border-slate-700 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 h-full flex flex-col overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">AreaVue <span className="text-blue-500 text-sm align-top">PRO</span></h2>
                  <button onClick={() => setIsMenuOpen(false)}><i className="fas fa-times text-xl text-slate-400 hover:text-white"/></button>
              </div>
              <div className="mb-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Navigation</h3>
                  <div className="flex gap-2">
                      <input type="text" placeholder="Search location..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                      <Button className="!p-2 !w-10 !h-10 !rounded-lg" onClick={handleSearch}><i className="fas fa-search"/></Button>
                  </div>
              </div>
              <div className="mb-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">GPS Settings</h3>
                  <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                      <div className="flex justify-between mb-2"><span className="text-sm text-slate-300">Min Accuracy</span><span className="text-sm font-bold text-blue-400">±{gpsThreshold}m</span></div>
                      <input type="range" min="1" max="20" step="1" value={gpsThreshold} onChange={(e) => setGpsThreshold(parseInt(e.target.value))} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      <p className="text-[10px] text-slate-500 mt-2">Points with lower accuracy will require confirmation.</p>
                  </div>
              </div>
              <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Point Labels</h3>
                      <i className="fas fa-tag text-slate-600 text-xs"></i>
                  </div>
                  <div className="relative">
                      <select value={pointLabelMode} onChange={(e) => setPointLabelMode(e.target.value as PointLabelMode)} className="w-full appearance-none bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer">
                          <option value="none">Hidden</option>
                          <option value="id">Show ID (e.g., A, B, M1)</option>
                          <option value="type">Show Type (GPS/Manual)</option>
                          <option value="name">Show Name</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400"><i className="fas fa-chevron-down text-xs"></i></div>
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-8">
                  <StatBox label="Area" value={formatArea(area)} />
                  <StatBox label="Acres" value={formatAcres(area)} />
                  <StatBox label="Points" value={currentSurvey.points.length.toString()} />
                  <StatBox label="Perimeter" value={`${perimeter.toFixed(0)}m`} />
              </div>
              <div className="space-y-3 mb-8">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data Management</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" className="justify-start !text-xs" onClick={() => exportSurvey('csv')}><i className="fas fa-file-csv"/> CSV</Button>
                    <Button variant="secondary" className="justify-start !text-xs" onClick={() => exportSurvey('kml')}><i className="fas fa-globe"/> KML</Button>
                    <Button variant="secondary" className="justify-start !text-xs" onClick={() => exportSurvey('json')}><i className="fas fa-code"/> JSON</Button>
                    <Button variant="secondary" className="justify-start !text-xs" onClick={exportPDF} disabled={isExporting}>{isExporting ? <i className="fas fa-spinner fa-spin"/> : <i className="fas fa-file-pdf"/>} {isExporting ? 'Busy' : 'PDF'}</Button>
                  </div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-2">Backup & Bulk Export</h3>
                  <div className="grid grid-cols-3 gap-2">
                     <Button variant="secondary" className="justify-center !text-xs !px-1" onClick={() => exportAllSurveys('csv')}><i className="fas fa-file-csv mr-1"/> All CSV</Button>
                     <Button variant="secondary" className="justify-center !text-xs !px-1" onClick={() => exportAllSurveys('kml')}><i className="fas fa-globe mr-1"/> All KML</Button>
                     <Button variant="secondary" className="justify-center !text-xs !px-1" onClick={() => exportAllSurveys('json')}><i className="fas fa-database mr-1"/> Backup</Button>
                  </div>
                  <div className="pt-2">
                      <input type="file" accept=".json" multiple className="hidden" ref={fileInputRef} onChange={handleImport} />
                      <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}><i className="fas fa-file-import"/> Import Survey(s)</Button>
                  </div>
                  <Button variant="danger" className="w-full justify-start mt-4" onClick={handleClearCurrent}><i className="fas fa-trash w-5"/> Clear Current Map</Button>
              </div>
              <div className="flex-1">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">History</h3>
                  <div className="space-y-2">
                      {surveys.map(s => (
                          <div key={s.id} onClick={() => handleLoadSurvey(s)} className="p-3 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer border border-slate-700/50 group relative">
                              <div className="font-bold text-sm text-white">{s.name}</div>
                              <div className="text-xs text-slate-400">{new Date(s.updated).toLocaleDateString()} • {s.points.length} pts</div>
                              <button onClick={(e) => { e.stopPropagation(); if(confirm("Delete this survey?")) { const newS = surveys.filter(x => x.id !== s.id); setSurveys(newS); localStorage.setItem('areavue_surveys', JSON.stringify(newS)); }}} className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 opacity-0 group-hover:opacity-100 p-2 hover:bg-slate-900 rounded"><i className="fas fa-trash"/></button>
                          </div>
                      ))}
                      {surveys.length === 0 && <div className="text-xs text-slate-500 italic">No saved surveys</div>}
                  </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-800"><div className="text-xs text-center text-slate-500">Version 2.3.0 • Pro License</div></div>
          </div>
      </div>
      {showAIAssistant && <ChatAssistant survey={currentSurvey} onClose={() => setShowAIAssistant(false)} />}
      {showHelpModal && (
          <Modal title="AreaVue Pro Help" onClose={() => setShowHelpModal(false)}>
              <div className="space-y-4 text-slate-300 text-sm">
                  <div><h3 className="font-bold text-blue-400 text-base mb-1">Getting Started</h3><p>AreaVue allows you to measure land and layout fields using high-accuracy GPS averaging.</p></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800 p-3 rounded border border-slate-700"><h4 className="font-bold text-white mb-1"><i className="fas fa-map-marker-alt text-blue-500 mr-2"/>Adding Points</h4><p>Tap the big blue button to add a GPS point. It will average your position for 20s to ensure accuracy.</p></div>
                      <div className="bg-slate-800 p-3 rounded border border-slate-700"><h4 className="font-bold text-white mb-1"><i className="fas fa-hand-pointer text-pink-500 mr-2"/>Manual Mode</h4><p>Enable Manual Mode (Hand icon) to tap anywhere on the map to place points remotely.</p></div>
                      <div className="bg-slate-800 p-3 rounded border border-slate-700"><h4 className="font-bold text-white mb-1"><i className="fas fa-ruler-combined text-amber-500 mr-2"/>Staking Mode</h4><p>Plan a field layout. The app calculates distance and bearing between points and helps you stay in a straight line.</p></div>
                      <div className="bg-slate-800 p-3 rounded border border-slate-700"><h4 className="font-bold text-white mb-1"><i className="fas fa-compass text-blue-400 mr-2"/>Navigation</h4><p>Tap any point to select it, then click "Navigate" to see real-time distance and bearing to that point.</p></div>
                  </div>
                  <div><h3 className="font-bold text-blue-400 text-base mb-1">Exporting</h3><p>Open the menu (top right) to export your survey data to CSV, KML (Google Earth), JSON, or PDF reports.</p></div>
                  <div className="text-xs text-slate-500 border-t border-slate-700 pt-2"><p>Disclaimer: This tool is for planning purposes only. Not a replacement for legal land surveys.</p></div>
              </div>
          </Modal>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 z-20"/>
    </div>
  );
};

export default App;
