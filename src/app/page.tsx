'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Moon, Sun, MapPin, Loader2, ChevronDown, Eye, Info, ExternalLink, X, Settings2, Download } from 'lucide-react';
import { enGB, ar } from 'date-fns/locale';

import { format } from 'date-fns';
import Link from 'next/link';

// shadcn components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimulationModal, { SimulationData } from '@/components/simulation-modal';
import SettingsModal from '@/components/settings-modal';

import {
  generateVisibilityGrid,
  calculateVisibilityPoint,
  getEnhancedSimulationTrajectory,
  VisibilityPoint,
  SimulationPoint,
  getConjunctionComparison
} from '@/lib/astronomy';
import { toHijri, formatHijriDate, getObservationDates, HIJRI_MONTHS, HIJRI_MONTHS_AR } from '@/lib/hijri';
import { getTranslations, Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';



interface GeoJSONFeature {
  type: string;
  geometry: { type: string; coordinates: number[][][] | number[][][][]; };
}

interface WorldData {
  features: GeoJSONFeature[];
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>('en');
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(1.1); // Default 1.1rem
  const [settingsOpen, setSettingsOpen] = useState(false);


  // Update HTML dir and lang for correct font/RTL support
  // Update HTML lang for correct font support, but keep dir LTR for layout stability
  // We handle RTL manually for specific elements
  useEffect(() => {
    document.documentElement.dir = 'ltr'; // Force LTR layout globally so sidebar stays on right
    document.documentElement.lang = locale;
    localStorage.setItem('crescent-locale', locale);

    // Injector: Force font family on body directly
    // Also inject font size - Target ROOT element (html) to scale all rem units
    // Default browser font size is 100% (16px). We scale this.
    document.documentElement.style.fontSize = `${fontSize * 100}%`;

    // Aggressively force font for Arabic
    if (locale === 'ar') {
      document.body.classList.add('font-arabic');
      document.body.style.setProperty('font-family', 'var(--font-tajawal), "Tajawal", sans-serif', 'important');
    } else {
      document.body.classList.remove('font-arabic');
      document.body.style.removeProperty('font-family');
    }
  }, [locale, fontSize]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('crescent-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Initial load from storage to prevent state reset
  useEffect(() => {
    const savedLocale = localStorage.getItem('crescent-locale') as Locale;
    if (savedLocale && (savedLocale === 'en' || savedLocale === 'ar')) {
      setLocale(savedLocale);
    }

    const savedTheme = localStorage.getItem('crescent-theme');
    if (savedTheme) {
      setDarkMode(savedTheme === 'dark');
    }

    const savedSize = localStorage.getItem('crescent-fontsize');
    if (savedSize) {
      setFontSize(parseFloat(savedSize));
    }

    if (savedSize) {
      setFontSize(parseFloat(savedSize));
    }
  }, []);

  // Persist font size
  useEffect(() => {
    localStorage.setItem('crescent-fontsize', fontSize.toString());
  }, [fontSize]);



  const [projection, setProjection] = useState<MapProjection>('equirectangular');
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [resolution, setResolution] = useState('2');
  const [maxLat, setMaxLat] = useState('60');
  const [criterion, setCriterion] = useState<Criterion>('odeh');
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visibilityPoints, setVisibilityPoints] = useState<VisibilityPoint[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationData, setLocationData] = useState<VisibilityPoint | null>(null);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [showSimulation, setShowSimulation] = useState(false);
  const [tapMessageDismissed, setTapMessageDismissed] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(true);

  // Edit coords state


  const currentHijri = useMemo(() => toHijri(new Date()), []);
  const [selectedHijriYear, setSelectedHijriYear] = useState(currentHijri.year);
  const [selectedHijriMonth, setSelectedHijriMonth] = useState(currentHijri.month);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Map View State (Zoom & Pan)
  const [viewState, setViewState] = useState({ zoom: 1, offsetX: 0, offsetY: 0, isDragging: false });
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);

  const t = getTranslations(locale);
  const isArabic = locale === 'ar';

  // Define options with translations
  const MAP_PROJECTIONS = useMemo(() => [
    { id: 'equirectangular' as const, name: t.projEquirectangular },
    { id: 'equalarea' as const, name: t.projEqualArea },
  ], [t]);

  const LAT_COVERAGE = useMemo(() => [
    { value: '60', label: t.covStandard },
    { value: '70', label: t.covExtended },
    { value: '80', label: t.covGlobal },
  ], [t]);

  const RESOLUTIONS = useMemo(() => [
    { value: '0.5', label: t.res05 },
    { value: '1', label: t.res1 },
    { value: '2', label: t.res2 },
    { value: '3', label: t.res3 },
    { value: '4', label: t.res4 },
  ], [t]);

  // Map projection types
  type MapProjection = 'equirectangular' | 'equalarea';

  // Visibility colors
  const ZONE_COLORS: Record<string, string> = {
    green: '#22c55e',
    yellow: '#eab308',
    orange: '#f97316',
    red: '#ef4444',
  };

  // Criterion types
  type Criterion = 'odeh' | 'yallop' | 'saao';

  const CRITERIA = useMemo(() => [
    { id: 'odeh' as const, name: t.critOdeh, author: 'M. Odeh', year: 2006, desc: 'ARCV + crescent width', ref: 'https://astronomycenter.net' },
    { id: 'yallop' as const, name: t.critYallop, author: 'B.D. Yallop', year: 1997, desc: 'q-test polynomial', ref: 'https://webspace.science.uu.nl/~gent0113/islam/yallop.htm' },
    { id: 'saao' as const, name: t.critSAAO, author: 'SAAO', year: 1988, desc: 'DALT + DAZ method', ref: 'https://astronomycenter.net' },
  ], [t]);

  const hijriDate = useMemo(() => toHijri(selectedDate), [selectedDate]);

  const observationDates = useMemo(() =>
    getObservationDates(selectedHijriYear, selectedHijriMonth, {
      observer: selectedLocation || undefined
    }),
    [selectedHijriYear, selectedHijriMonth, selectedLocation]
  );

  const upcomingMonths = useMemo(() => {
    const months = [];
    let year = currentHijri.year;
    let month = currentHijri.month;
    for (let i = 0; i < 12; i++) {
      const dates = getObservationDates(year, month);
      months.push({
        year, month,
        name: isArabic ? HIJRI_MONTHS_AR[month - 1] : HIJRI_MONTHS[month - 1],
        dates,
        value: `${year}-${month}`,
        gregDate: format(dates[1], 'dd-MM-yyyy')
      });
      month++;
      if (month > 12) { month = 1; year++; }
    }
    return months;
  }, [currentHijri.year, currentHijri.month, isArabic]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Update edit fields when location changes


  const handleMonthSelect = (val: string) => {
    const [yearStr, monthStr] = val.split('-');
    setSelectedHijriYear(parseInt(yearStr));
    setSelectedHijriMonth(parseInt(monthStr));
    const dates = getObservationDates(parseInt(yearStr), parseInt(monthStr), {
      observer: selectedLocation || undefined
    });
    if (dates[1]) setSelectedDate(dates[1]);
  };

  const handleObservationDateClick = (date: Date) => setSelectedDate(date);

  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate);
    const h = toHijri(newDate);
    setSelectedHijriYear(h.year);
    setSelectedHijriMonth(h.month);
  };

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then(res => res.json())
      .then(data => setWorldData(data))
      .catch(console.error);
  }, []);

  const projectPoint = useCallback((lon: number, lat: number, width: number, height: number): [number, number] => {
    if (projection === 'equalarea') {
      const x = ((lon + 180) / 360) * width;
      const y = height / 2 - (Math.sin(lat * Math.PI / 180) * height / 2);
      return [x, y];
    }
    // Equirectangular
    return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];
  }, [projection]);

  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = mapContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const oceanColor = darkMode ? '#0a1628' : '#e2e8f0'; // slate-200 for light mode ocean
    const landColor = darkMode ? '#1e293b' : '#f1f5f9'; // slate-100 for light mode land
    const borderColor = darkMode ? '#334155' : '#cbd5e1'; // slate-300
    const gridColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';

    // Clear background
    ctx.fillStyle = oceanColor;
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    // Apply Pan & Zoom Transforms
    ctx.translate(width / 2 + viewState.offsetX, height / 2 + viewState.offsetY);
    ctx.scale(viewState.zoom, viewState.zoom);

    // Aspect Ratio Logic: Force 2:1 ratio for world map
    // We calculate "base dimensions" that fit within the canvas at zoom 1
    const aspect = 2; // World width / World height
    let mapWidth, mapHeight;

    if (width / height > aspect) {
      // Canvas is wider than map: fit to height
      mapHeight = height;
      mapWidth = mapHeight * aspect;
    } else {
      // Canvas is taller than map: fit to width
      mapWidth = width;
      mapHeight = mapWidth / aspect;
    }

    // Center map drawing at (0,0) after translation
    const startX = -mapWidth / 2;
    const startY = -mapHeight / 2;

    // Define local projection helper that maps lon/lat to relative coordinates [0..mapWidth, 0..mapHeight]
    // Then we add startX/startY to center it.
    const getPoint = (lon: number, lat: number) => {
      // Normalized [0,1]
      let nx = (lon + 180) / 360;
      let ny = (90 - lat) / 180;

      if (projection === 'equalarea') {
        ny = 0.5 - (Math.sin(lat * Math.PI / 180) / 2);
      }

      return [startX + nx * mapWidth, startY + ny * mapHeight];
    };

    // Draw Map Content
    ctx.fillStyle = landColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5 / viewState.zoom; // Scale line width down

    if (worldData) {
      for (const feature of worldData.features) {
        const { type, coordinates } = feature.geometry;
        const drawPolygon = (rings: number[][][]) => {
          ctx.beginPath();
          for (const ring of rings) {
            let first = true;
            for (const coord of ring) {
              const [x, y] = getPoint(coord[0], coord[1]);
              if (first) { ctx.moveTo(x, y); first = false; }
              else { ctx.lineTo(x, y); }
            }
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        };
        if (type === 'Polygon') drawPolygon(coordinates as number[][][]);
        else if (type === 'MultiPolygon') {
          for (const polygon of (coordinates as number[][][][])) drawPolygon(polygon);
        }
      }
    }

    if (visibilityPoints.length > 0) {
      const step = parseFloat(resolution);
      const stepW = (step / 360) * mapWidth;
      const stepH = (step / 180) * mapHeight; // Approx for rect

      for (const point of visibilityPoints) {
        const [x, y] = getPoint(point.lon, point.lat);
        // Recalculate cell size for equal area if needed or reuse approx
        // For visual consistency rects are fine but let's be cleaner:
        // Use center point x,y and fixed width/height based on resolution? 
        // Or calculate 4 corners? Simple approx for speed:

        ctx.fillStyle = ZONE_COLORS[point.color];
        ctx.globalAlpha = 0.65;
        // Adjust y to be top-left of cell? Visibility points are usually centers.
        ctx.fillRect(x - stepW / 2, y - stepH / 2, stepW + 0.5, stepH + 0.5); // +0.5 to avoid gaps
      }
      ctx.globalAlpha = 1;
    }

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5 / viewState.zoom;

    // Draw Grid Lines (simplified)
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x1, y1] = getPoint(lon, -90);
      const [x2, y2] = getPoint(lon, 90);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const [x1, y1] = getPoint(-180, lat);
      const [x2, y2] = getPoint(180, lat);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Selected Location
    if (selectedLocation) {
      const [x, y] = getPoint(selectedLocation.lon, selectedLocation.lat);
      ctx.beginPath();
      // Scale marker size inversely to zoom so it stays consistent visual size
      const markerSize = 10 / viewState.zoom;
      ctx.arc(x, y, markerSize, 0, Math.PI * 2);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2 / viewState.zoom;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 3 / viewState.zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    }

    // Axis Labels (scale font)
    ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
    ctx.font = `${10 / viewState.zoom}px Inter`;
    ctx.textAlign = 'center';

    // Only draw labels if zoom is low or they are in view? Simplification: draw all.
    for (let lon = -150; lon < 180; lon += 30) {
      const [x, y] = getPoint(lon, -88); // Near bottom
      ctx.fillText(`${lon}°`, x, y);
    }

    ctx.restore(); // Restore context for next frame

  }, [worldData, visibilityPoints, resolution, selectedLocation, darkMode, projectPoint, maxLat, viewState]);

  useEffect(() => {
    drawMap();
    const handleResize = () => requestAnimationFrame(drawMap);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawMap]);

  const updateLocation = (lat: number, lon: number) => {
    const maxLatNum = parseInt(maxLat);
    const clampedLat = Math.max(-maxLatNum, Math.min(maxLatNum, lat));
    const clampedLon = Math.max(-180, Math.min(180, lon));

    const newLoc = { lat: clampedLat, lon: clampedLon };
    setSelectedLocation(newLoc);
    const point = calculateVisibilityPoint(clampedLat, clampedLon, selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate(), criterion);
    setLocationData(point);

    const simData = getEnhancedSimulationTrajectory(clampedLat, clampedLon, selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate());
    if (simData) {
      setSimulationData(simData);
    } else {
      setSimulationData(null);
    }
  };

  // Map Interaction Handlers (Pan & Zoom)
  const handleMapWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = mapContainerRef.current;
    if (!container) return;

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    setViewState(prev => {
      const newZoom = Math.min(Math.max(1, prev.zoom + delta * prev.zoom), 10);
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const handleMapPointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag with left click or touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    setViewState(prev => ({ ...prev, isDragging: true }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleMapPointerMove = useCallback((e: React.PointerEvent) => {
    if (!viewState.isDragging || !lastMousePos.current) return;

    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setViewState(prev => ({
      ...prev,
      offsetX: prev.offsetX + dx,
      offsetY: prev.offsetY + dy
    }));
  }, [viewState.isDragging]);

  const handleMapPointerUp = useCallback((e: React.PointerEvent) => {
    setViewState(prev => ({ ...prev, isDragging: false }));
    lastMousePos.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Update click handler to account for Zoom/Pan
  const handleMapClick = useCallback((e: React.MouseEvent) => {
    // If we were dragging, don't treat as click
    if (viewState.isDragging) return;

    const container = mapContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // Canvas center relative to rect
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Mouse pos relative to center, un-translated, un-scaled
    const xRaw = e.clientX - rect.left - cx - viewState.offsetX;
    const yRaw = e.clientY - rect.top - cy - viewState.offsetY;

    const xUnscaled = xRaw / viewState.zoom;
    const yUnscaled = yRaw / viewState.zoom;

    // Aspect ratio logic (matches drawMap)
    const aspect = 2; // Fixed aspect ratio 2:1
    let mapWidth, mapHeight;

    if (rect.width / rect.height > aspect) {
      mapHeight = rect.height;
      mapWidth = mapHeight * aspect;
    } else {
      mapWidth = rect.width;
      mapHeight = mapWidth / aspect;
    }

    // Checking if click is within map bounds
    if (Math.abs(xUnscaled) > mapWidth / 2 || Math.abs(yUnscaled) > mapHeight / 2) return;

    // Normalize to [0, 1] relative to map top-left
    const normX = (xUnscaled + mapWidth / 2) / mapWidth;
    const normY = (yUnscaled + mapHeight / 2) / mapHeight;

    let lon = normX * 360 - 180;
    let lat = 90 - normY * 180;

    // Equal area inverse approximation
    if (projection === 'equalarea') {
      const sinLat = 1 - 2 * normY;
      lat = Math.asin(Math.max(-1, Math.min(1, sinLat))) * 180 / Math.PI;
    }

    updateLocation(lat, lon);
    setShowSimulation(true);
  }, [selectedDate, criterion, maxLat, projection, viewState]);

  const handleCalculate = useCallback(async () => {
    setIsCalculating(true);
    setProgress(0);
    setTimeout(() => {
      const points = generateVisibilityGrid(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate(), {
        stepDeg: parseFloat(resolution),
        maxLat: parseInt(maxLat),
        criterion,
        onProgress: setProgress
      });
      setVisibilityPoints(points);
      setIsCalculating(false);
    }, 50);
  }, [selectedDate, resolution, criterion, maxLat]);

  const handleDownloadMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a temporary canvas to combine background color + map content 
    // because standard canvas export might have transparent background
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    // Fill background
    tCtx.fillStyle = darkMode ? '#0a1628' : '#e2e8f0';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw original canvas
    tCtx.drawImage(canvas, 0, 0);

    // Draw Legend/Credits overlay if needed? Maybe keept it clean.
    // Let's just download the map view.

    const link = document.createElement('a');
    link.download = `crescent-watch-map-${format(selectedDate, 'yyyy-MM-dd')}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  }, [selectedDate, darkMode]);


  // Mobile Auto-Scroll on Calculate
  // We'll attach this to the button click handler, but simpler to do here
  useEffect(() => {
    if (isCalculating && window.innerWidth < 768 && mapContainerRef.current) {
      mapContainerRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isCalculating]);

  const getZoneBg = (zone?: string) => {
    switch (zone) {
      case 'A': return 'bg-green-500';
      case 'B': return 'bg-yellow-500';
      case 'C': return 'bg-orange-500';
      default: return 'bg-red-500';
    }
  };



  return (
    <div className={cn("min-h-screen flex flex-col md:h-screen md:flex-row md:overflow-hidden", darkMode ? 'dark' : '')}>
      {/* Map - LEFT */}
      <div
        ref={mapContainerRef}
        className="flex-1 relative min-h-[50vh] md:min-h-0 cursor-crosshair bg-background touch-none"
        onClick={handleMapClick}
        onWheel={handleMapWheel}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerUp}
        onPointerLeave={handleMapPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Global Settings Button - TOP LEFT */}
        <div className="absolute top-4 left-4 z-20 pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full shadow-lg bg-card/80 backdrop-blur border border-border/50 h-10 w-10 hover:scale-105 transition-transform"
            onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
          >
            <Settings2 className="w-5 h-5" />
          </Button>
        </div>

        {/* Download Map Button - Top Right */}
        <div className="absolute top-4 right-4 z-20 pointer-events-auto md:hidden">
          {/* Mobile Download Button if needed, currently sidebar blocks right side on desktop but on mobile it's stacked */}
        </div>

        {isCalculating && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">{t.calculating}</p>
          </div>
        )}

        {/* Tap to select */}
        {!selectedLocation && !isCalculating && !tapMessageDismissed && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="bg-card/90 backdrop-blur-sm border rounded-2xl px-3 py-2 text-center flex items-center gap-2 text-sm shadow-lg">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <span>{t.tapToSelect}</span>
              <button onClick={(e) => { e.stopPropagation(); setTapMessageDismissed(true); }} className="ml-1 hover:bg-muted rounded p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Legend - Bottom Left Overlay */}
        {/* Legend - Bottom Left Overlay - Conditional & Responsive */}
        {/* Legend - Bottom Left Overlay - Conditional & Responsive */}
        {visibilityPoints.length > 0 && (
          isLegendVisible ? (
            <div
              className={cn(
                "absolute bottom-4 bg-card/90 backdrop-blur-md rounded-2xl border p-3 shadow-lg pointer-events-auto text-xs transition-transform scale-75 md:scale-100 z-30",
                isArabic ? "right-4 text-right origin-bottom-right" : "left-4 text-left origin-bottom-left"
              )}
              dir={isArabic ? 'rtl' : 'ltr'}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Close Button */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-muted-foreground uppercase opacity-70 text-[10px] tracking-wider">{t.legend}</span>
                <button onClick={(e) => { e.stopPropagation(); setIsLegendVisible(false); }} className="hover:bg-muted rounded-full p-0.5 transition-colors">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span>{t.zoneA}: {t.zoneADesc}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span>{t.zoneB}: {t.zoneBDesc}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span>{t.zoneC}: {t.zoneCDesc}</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span>{t.zoneD}: {t.zoneDDesc}</span></div>
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setIsLegendVisible(true); }}
              className={cn(
                "absolute bottom-4 z-30 p-2 bg-card/90 backdrop-blur-md border rounded-full shadow-lg hover:scale-110 transition-transform",
                isArabic ? "right-4" : "left-4"
              )}
              title={t.showLegend}
            >
              {/* Tiny representation of legend colors */}
              <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
                <div className="bg-green-500 rounded-tl-[1px]"></div>
                <div className="bg-yellow-500 rounded-tr-[1px]"></div>
                <div className="bg-orange-500 rounded-bl-[1px]"></div>
                <div className="bg-red-500 rounded-br-[1px]"></div>
              </div>
            </button>
          )
        )}

      </div>

      {/* Sidebar - RIGHT */}
      <div className="shrink-0 md:w-80 lg:w-[360px] border-t md:border-t-0 md:border-l border-border bg-card">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4" dir={isArabic ? 'rtl' : 'ltr'}>

            {/* Header - No Logo, Bordered Controls */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{t.appName}</span>
              </div>
              <div className="flex items-center gap-2">

                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  <SelectTrigger className="w-32 h-9 rounded-2xl border-input bg-background shadow-sm text-center">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-input">
                    <SelectItem value="en" className="justify-center text-center rounded-xl">English</SelectItem>
                    <SelectItem value="ar" className="justify-center text-center rounded-xl">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium block text-center text-muted-foreground">{t.selectDate}</label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-center rounded-2xl h-11 border-muted-foreground/20 hover:bg-muted/50">
                    <span className="text-base font-semibold">{format(selectedDate, 'dd-MM-yyyy')}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl" align="center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { if (d) { handleDateChange(d); setDatePickerOpen(false); } }}
                    initialFocus
                    captionLayout="dropdown"
                    fromYear={1900}
                    toYear={2100}
                    locale={isArabic ? ar : enGB}
                    dir={isArabic ? 'rtl' : 'ltr'}
                  />
                </PopoverContent>
              </Popover>
              <div className="text-sm text-primary bg-primary/5 rounded-2xl px-3 py-2.5 text-center font-medium">
                {formatHijriDate(hijriDate, locale)}
              </div>
            </div>

            {/* Islamic Month - Matched font/size */}
            <div className="space-y-2 text-center">
              <label className="text-sm font-medium block text-center text-muted-foreground">{t.islamicMonth}</label>
              <Select value={`${selectedHijriYear}-${selectedHijriMonth}`} onValueChange={handleMonthSelect}>
                <SelectTrigger className="w-full h-11 rounded-2xl border-muted-foreground/20 text-center font-medium text-base [&>span]:flex-1 [&>span]:flex [&>span]:justify-center"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {upcomingMonths.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="rounded-xl justify-center text-center text-base">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium">{m.name} {m.year}</span>
                        <span className="text-muted-foreground text-xs ml-3">{m.gregDate}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                {observationDates.map((d, i) => (
                  <button key={i} onClick={() => handleObservationDateClick(d)}
                    className={cn("flex-1 text-xs py-2.5 rounded-2xl border transition font-medium shadow-sm",
                      format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-muted'
                    )}>{format(d, 'dd-MM')}</button>
                ))}
              </div>
            </div>


            {/* Controls Grid - Criterion | Resolution | Projection */}
            <div className="grid grid-cols-1 gap-3 pt-2">
              {/* Criterion */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1 h-6">
                  <label className="text-sm font-medium text-muted-foreground">{t.criterion}</label>
                  <Link href="/criteria" className="flex items-center">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full"><Info className="w-4 h-4 text-muted-foreground" /></Button>
                  </Link>
                </div>
                <Select value={criterion} onValueChange={(v) => setCriterion(v as Criterion)}>
                  <SelectTrigger className="w-full h-11 rounded-2xl border-muted-foreground/20 bg-card text-base text-center [&>span]:flex-1 [&>span]:flex [&>span]:justify-center"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">{CRITERIA.map((c) => <SelectItem key={c.id} value={c.id} className="rounded-xl text-base justify-center text-center">{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Resolution */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground pl-1">{t.resolution}</label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger className="w-full rounded-2xl h-11 text-base text-center [&>span]:flex-1 [&>span]:flex [&>span]:justify-center"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">{RESOLUTIONS.map((r) => <SelectItem key={r.value} value={r.value} className="rounded-xl text-base justify-center text-center">{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Projection */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground pl-1">{t.projection}</label>
                <Select value={projection} onValueChange={(v) => setProjection(v as MapProjection)}>
                  <SelectTrigger className="w-full rounded-2xl h-11 text-base text-center [&>span]:flex-1 [&>span]:flex [&>span]:justify-center"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">{MAP_PROJECTIONS.map((p) => <SelectItem key={p.id} value={p.id} className="rounded-xl text-base justify-center text-center">{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Coverage */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground pl-1">{t.coverage}</label>
                <Select value={maxLat} onValueChange={setMaxLat}>
                  <SelectTrigger className="w-full rounded-2xl h-11 text-base text-center [&>span]:flex-1 [&>span]:flex [&>span]:justify-center"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">{LAT_COVERAGE.map((c) => <SelectItem key={c.value} value={c.value} className="rounded-xl text-base justify-center text-center">{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Calculate & Map Download Actions */}
            <div className="pt-4 flex gap-2">
              <Button className="flex-1 h-12 rounded-2xl text-base font-semibold shadow-md" onClick={handleCalculate} disabled={isCalculating}>
                {isCalculating ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />{progress}%</> : t.calculate}
              </Button>
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl border-input shadow-sm shrink-0" onClick={handleDownloadMap} title="Download Map Image">
                <Download className="w-5 h-5" />
              </Button>
            </div>

          </div>
        </ScrollArea>
      </div>

      {/* Simulation Modal (New Component) */}
      <SimulationModal
        isOpen={showSimulation}
        onClose={() => setShowSimulation(false)}
        data={simulationData}
        isLoading={false}
        error={null}
        locale={locale}
        onUpdateLocation={updateLocation}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        locale={locale}
        fontSize={fontSize}
        setFontSize={setFontSize}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />
    </div>
  );
}
