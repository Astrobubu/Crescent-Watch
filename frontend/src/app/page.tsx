'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { fetchVisibility, fetchSimulation, VisibilityPoint, SimulationResponse, toHijri, HIJRI_MONTHS, HIJRI_MONTHS_AR } from '@/lib/api';
import { ControlsPanel } from '@/components/controls-panel';
import Legend from '@/components/legend';
import CoordinatesDisplay from '@/components/coordinates-display';
import SimulationModal from '@/components/simulation-modal';
import { Header } from '@/components/header';

// Dynamically import MapCanvas to avoid SSR issues with canvas
const MapCanvas = dynamic(() => import('@/components/map-canvas'), { ssr: false });
import { useLanguage } from '@/lib/i18n';
import { Info } from 'lucide-react';
import { format } from 'date-fns';

// Natural Earth 110m land GeoJSON URL
const WORLD_DATA_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';

const COLORS: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  ocean: '#0a1628',
  land: '#162436',
  grid: 'rgba(255,255,255,0.1)',
  text: 'rgba(255,255,255,0.5)',
  border: '#3a506b'
};

interface GeoJSONFeature {
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface WorldData {
  features: GeoJSONFeature[];
}

export default function Home() {
  const { t, isRTL, language } = useLanguage();
  // State
  const [controlsOpen, setControlsOpen] = useState(true);
  const [date, setDate] = useState(() => new Date());
  const [opacity, setOpacity] = useState(0.5);
  const [resolution, setResolution] = useState(2);
  const [projection, setProjection] = useState<'equirect' | 'gallpeters' | 'mercator'>('gallpeters');
  const [includePolar, setIncludePolar] = useState(false);
  const [criterion, setCriterion] = useState<'yallop' | 'odeh'>('odeh');
  const [evalTime, setEvalTime] = useState<'sunset' | 'best'>('sunset');

  const [points, setPoints] = useState<VisibilityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready');

  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Simulation state
  const [simOpen, setSimOpen] = useState(false);
  const [simData, setSimData] = useState<SimulationResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);

  // World data for export
  const worldDataRef = useRef<WorldData | null>(null);

  // Load world data for export functionality
  useEffect(() => {
    fetch(WORLD_DATA_URL)
      .then(res => res.json())
      .then(data => {
        worldDataRef.current = data;
      })
      .catch(err => console.error('Failed to load world map for export:', err));
  }, []);

  // Generate map
  // Generate map with cancellation support
  const handleGenerate = useCallback(async () => {
    // Abort previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setStatus('Calculating...');
    setProgress(0); // Reset progress

    // progress is handled via callback
    setProgress(0);
    setStatus('Initializing...');

    try {
      const data = await fetchVisibility(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        {
          stepDeg: resolution,
          evalTime,
          includePolar,
          criterion
        },
        (p, s) => {
          if (!abortController.signal.aborted) {
            setProgress(p);
            setStatus(s);
          }
        }
      );

      // Check if aborted
      // Check if aborted
      if (abortController.signal.aborted) return;

      setProgress(100);
      setPoints(data.points);
      setStatus(`${data.points.length} points in ${data.meta.calc_time_ms}ms`);
    } catch (err: any) {
      if (err.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError')) {
        setStatus('Calculation cancelled');
      } else {
        console.error(err);
        setStatus('Error generating map');
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [date, resolution, evalTime, includePolar, criterion]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setStatus('Cancelled');
      setProgress(0);
    }
  }, []);

  // Handle location click - open simulation
  const handleLocationClick = useCallback(async (lat: number, lon: number) => {
    setSimOpen(true);
    setSimLoading(true);
    setSimError(null);
    setSimData(null);

    try {
      const data = await fetchSimulation(
        lat,
        lon,
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );
      setSimData(data);
    } catch (err) {
      console.error(err);
      setSimError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSimLoading(false);
    }
  }, [date]);

  // Handle mouse move
  const handleMouseMove = useCallback((lat: number, lon: number) => {
    setCursorCoords({ lat, lon });
  }, []);

  // Handle Save Map - exports the map as an image with branding
  const handleSaveMap = useCallback(() => {
    if (points.length === 0) return;

    // Create offscreen canvas at high resolution
    const W = 1920;
    const H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const projType = projection;
    const viewMaxLat = 90;
    const stepDeg = resolution;

    // Helper: project coordinates
    const project = (lat: number, lon: number) => {
      const x = ((lon + 180) / 360) * W;
      let y_norm = 0;
      if (projType === 'mercator') {
        const latClamped = Math.max(-85, Math.min(85, lat));
        const latRad = latClamped * Math.PI / 180;
        const mercatorY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
        const maxLatRad = 85 * Math.PI / 180;
        const maxMercatorY = Math.log(Math.tan(Math.PI / 4 + maxLatRad / 2));
        y_norm = mercatorY / maxMercatorY / 2;
      } else if (projType === 'gallpeters') {
        const sLat = Math.sin(lat * Math.PI / 180);
        const sMax = Math.sin(viewMaxLat * Math.PI / 180);
        y_norm = sLat / (2 * sMax);
      } else {
        y_norm = lat / (2 * viewMaxLat);
      }
      const y = H / 2 - (y_norm * H);
      return { x, y };
    };

    // Helper: draw polygon
    const drawPolygon = (rings: number[][][]) => {
      for (const ring of rings) {
        let first = true;
        for (const [lon, lat] of ring) {
          if (Math.abs(lat) > viewMaxLat + 5) continue;
          const p = project(lat, lon);
          if (first) { ctx.moveTo(p.x, p.y); first = false; }
          else ctx.lineTo(p.x, p.y);
        }
      }
    };

    // Draw ocean background
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, W, H);

    // Draw landmasses
    if (worldDataRef.current?.features) {
      ctx.fillStyle = COLORS.land;
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (const feature of worldDataRef.current.features) {
        const geometry = feature.geometry;
        if (geometry.type === 'Polygon') {
          drawPolygon(geometry.coordinates as number[][][]);
        } else if (geometry.type === 'MultiPolygon') {
          for (const coords of geometry.coordinates as number[][][][]) {
            drawPolygon(coords);
          }
        }
      }

      ctx.fill();
      ctx.stroke();
    }

    // Draw visibility overlay
    if (points.length > 0) {
      ctx.globalAlpha = opacity;
      const cellW = (stepDeg / 360) * W;
      const pad = 0.6;

      for (const pt of points) {
        if (Math.abs(pt.lat) > viewMaxLat) continue;

        const center = project(pt.lat, pt.lon);
        const north = project(pt.lat + stepDeg / 2, pt.lon);
        const south = project(pt.lat - stepDeg / 2, pt.lon);
        const cellH = Math.abs(south.y - north.y);

        ctx.fillStyle = COLORS[pt.color] || COLORS.red;
        ctx.fillRect(center.x - cellW / 2, center.y - cellH / 2, cellW + pad, cellH + pad);
      }

      ctx.globalAlpha = 1.0;
    }

    // Draw graticule
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px Inter, sans-serif';
    ctx.lineWidth = 1;

    // Longitude lines
    for (let lon = -180; lon <= 180; lon += 30) {
      const p1 = project(-viewMaxLat, lon);
      const p2 = project(viewMaxLat, lon);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Latitude lines
    for (let lat = -90; lat <= 90; lat += 15) {
      const pLeft = project(lat, -180);
      const pRight = project(lat, 180);
      ctx.beginPath();
      ctx.moveTo(0, pLeft.y);
      ctx.lineTo(W, pRight.y);
      ctx.stroke();
    }

    // Add branding footer bar
    const footerHeight = 50;
    ctx.fillStyle = 'rgba(10, 22, 40, 0.95)';
    ctx.fillRect(0, H - footerHeight, W, footerHeight);

    // Draw subtle top border for footer
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - footerHeight);
    ctx.lineTo(W, H - footerHeight);
    ctx.stroke();

    // Crescent Watch branding (bottom left)
    ctx.font = isRTL ? 'bold 18px Cairo, sans-serif' : 'bold 18px Inter, sans-serif';
    ctx.fillStyle = '#a78bfa';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(isRTL ? 'رصد الاهلة' : 'Crescent Watch', 24, H - footerHeight / 2);

    // Date (bottom center) - numeric format
    const hijriDate = toHijri(date);
    const gregorianStr = format(date, 'd-M-yyyy');
    const hijriStr = isRTL
      ? `${hijriDate.day} ${HIJRI_MONTHS_AR[hijriDate.month - 1]} ${hijriDate.year} هـ`
      : `${hijriDate.day} ${HIJRI_MONTHS[hijriDate.month - 1]} ${hijriDate.year} AH`;
    // For Arabic, ensure visual ordering is correct (Gregorian • Hijri)
    const dateStr = `${gregorianStr}  •  ${hijriStr}`;

    ctx.font = '16px Inter, sans-serif';
    ctx.fillStyle = '#e4e4e7';
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, W / 2, H - footerHeight / 2);

    // Draw Legend box (bottom right, above footer)
    const legendX = W - 220;
    const legendY = H - footerHeight - 120;
    const legendW = 280; // Wider legend as requested
    const legendH = 110;

    // Legend background
    ctx.fillStyle = 'rgba(10, 22, 40, 0.9)';
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(legendX, legendY, legendW, legendH, 8);
    ctx.fill();
    ctx.stroke();

    // Legend title
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#a1a1aa';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const titleText = isRTL ? 'مناطق الرؤية' : 'VISIBILITY ZONES';
    ctx.fillText(titleText, legendX + 12, legendY + 10);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#71717a';
    ctx.textAlign = 'right';
    const criterionText = criterion === 'yallop'
      ? (isRTL ? 'يالوب' : 'Yallop')
      : (isRTL ? 'عودة' : 'Odeh');
    ctx.fillText(criterionText, legendX + legendW - 12, legendY + 10);

    // Legend items
    const legendItems = [
      { color: '#22c55e', label: isRTL ? 'منطقة A: مرئي بسهولة' : 'Zone A: Easily Visible' },
      { color: '#eab308', label: isRTL ? 'منطقة B: مرئي (ظروف مثالية)' : 'Zone B: Visible (Perfect Conditions)' },
      { color: '#f97316', label: isRTL ? 'منطقة C: يحتاج تلسكوب' : 'Zone C: Optical Aid Required' },
      { color: '#ef4444', label: isRTL ? 'منطقة D: غير مرئي' : 'Zone D: Not Visible' },
    ];

    ctx.font = isRTL ? '12px Inter, sans-serif' : '11px Inter, sans-serif'; // Slightly larger for Arabic
    ctx.textAlign = 'left';
    legendItems.forEach((item, i) => {
      const itemY = legendY + 32 + i * 18;
      ctx.beginPath();
      ctx.arc(legendX + 18, itemY + 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.fillStyle = '#a1a1aa';
      ctx.fillText(item.label, legendX + 30, itemY);
    });

    // Criterion badge (bottom right in footer)
    ctx.font = '14px Inter, sans-serif';
    if (isRTL) ctx.font = '14px Cairo, sans-serif'; // Use Cairo for Arabic
    ctx.fillStyle = '#71717a';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const badgeText = isRTL
      ? `معيار ${criterionText}`
      : `${criterionText} Criterion`;

    ctx.fillText(badgeText, W - 24, H - footerHeight / 2);

    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crescent-visibility-${format(date, 'yyyy-MM-dd')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [points, date, projection, resolution, opacity, criterion]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Header (Logo & Settings) */}
      <Header />

      {/* Map Canvas */}
      <MapCanvas
        points={points}
        projection={projection}
        opacity={opacity}
        onLocationClick={handleLocationClick}
        onMouseMove={handleMouseMove}
      />

      {/* Controls Panel */}
      <ControlsPanel
        date={date}
        setDate={setDate}
        opacity={opacity}
        onOpacityChange={setOpacity}
        resolution={resolution}
        setResolution={setResolution}
        projection={projection}
        onProjectionChange={setProjection}
        includePolar={includePolar}
        setIncludePolar={setIncludePolar}
        criterion={criterion}
        setCriterion={setCriterion}
        evalTime={evalTime}
        setEvalTime={setEvalTime}
        onGenerate={handleGenerate}
        onCancel={handleCancel}
        onSaveMap={handleSaveMap}
        hasPoints={points.length > 0}
        isLoading={isLoading}
        progress={progress}
        status={status}
        isOpen={controlsOpen}
        setIsOpen={setControlsOpen}
      />

      {/* Instruction Banner */}
      <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[900] pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-1000`}>
        <div className="bg-zinc-900/90 backdrop-blur px-4 py-2 rounded-full border border-zinc-800 shadow-lg flex items-center gap-2">
          <Info className="w-4 h-4 text-violet-400" />
          <span className="text-xs text-zinc-300 font-medium tracking-wide">
            {t('instruction.click_map')}
          </span>
        </div>
      </div>

      {/* Legend */}
      <Legend criterion={criterion} />

      {/* Coordinates Display */}
      <CoordinatesDisplay lat={cursorCoords?.lat ?? null} lon={cursorCoords?.lon ?? null} />

      {/* Simulation Modal */}
      <SimulationModal
        isOpen={simOpen}
        onClose={() => setSimOpen(false)}
        data={simData}
        isLoading={simLoading}
        error={simError}
      />
    </div>
  );
}

