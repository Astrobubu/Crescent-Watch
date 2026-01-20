'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { X, Loader2, RefreshCw, ChevronDown, ChevronUp, Download, Play, Pause } from 'lucide-react';
import { getTranslations, Locale, isRTL } from '@/lib/i18n';
import { formatDMS, formatMoonAge, formatCoordinate } from '@/lib/astronomy';

// Type definitions matching astronomy.ts output
export interface SimulationPoint {
    timeOffsetMin: number;
    sunAlt: number;
    sunAz: number;
    moonAlt: number;
    moonAz: number;
    illumination: number;
    elongation: number;
    tilt: number;
    moonAge?: number;
}

export interface SimulationData {
    sunsetIso: string;
    moonsetIso?: string | null;
    conjunctionIso?: string;
    conjunctionLocal?: string; // Legacy/Default
    moonAgeHours?: number;     // Legacy/Default

    conjunctionIsoGeo?: string;
    conjunctionLocalGeo?: string;
    moonAgeHoursGeo?: number;

    conjunctionIsoTopo?: string | null;
    conjunctionLocalTopo?: string | null;
    moonAgeHoursTopo?: number | null;

    trajectory: SimulationPoint[];
    meta: {
        lat: number;
        lon: number;
        locationName?: string;
    }
}

interface SimulationModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: SimulationData | null;
    isLoading: boolean;
    error: string | null;
    locale: Locale;
    onUpdateLocation: (lat: number, lon: number) => void;
}

// Legacy random stars
function generateStars(count: number, seed: number): Array<{ x: number, y: number, size: number, brightness: number }> {
    const stars = [];
    let random = seed;
    const nextRandom = () => {
        random = (random * 16807) % 2147483647;
        return (random - 1) / 2147483646;
    };

    for (let i = 0; i < count; i++) {
        stars.push({
            x: nextRandom(),
            y: nextRandom() * 0.6, // Only in upper portion
            size: 0.5 + nextRandom() * 2,
            brightness: 0.3 + nextRandom() * 0.7
        });
    }
    return stars;
}

// Generate "Rough Dubai Skyline" - Edges Only
function generateDubaiSkyline(width: number, seed: number) {
    const buildings = [];

    // Left Cluster (Burj Khalifa & Downtown)
    // Center of cluster around 15% width
    const leftCenter = width * 0.15;

    // Burj Khalifa (The centerpiece of left)
    buildings.push({ type: 'khalifa', x: leftCenter, w: 60, h: 400 });

    // Flanking towers left
    buildings.push({ type: 'tower', x: leftCenter - 50, w: 40, h: 180 });
    buildings.push({ type: 'tower', x: leftCenter - 90, w: 35, h: 140 });
    // buildings.push({ type: 'tower', x: leftCenter + 50, w: 30, h: 160 });
    buildings.push({ type: 'emirates', x: leftCenter + 90, w: 40, h: 220 }); // Emirates towers-ish

    // Right Cluster (Burj Al Arab & Marina)
    // Center of cluster around 85% width
    const rightCenter = width * 0.85;

    // Burj Al Arab
    // buildings.push({ type: 'arab', x: rightCenter, w: 80, h: 200 });

    // Marina / Jumeirah Gate style
    buildings.push({ type: 'frame', x: rightCenter - 80, w: 60, h: 150 }); // Frame-ish? Or Gate
    buildings.push({ type: 'tower', x: rightCenter - 10, w: 35, h: 190 }); // Straight tower instead of twist
    buildings.push({ type: 'tower', x: rightCenter + 40, w: 40, h: 130 });

    return buildings;
}

// Convert UTC ISO string to location's local time based on longitude
function utcToLocationLocal(isoString: string, lon: number): Date {
    const utcDate = new Date(isoString);
    const offsetHours = Math.round(lon / 15);
    return new Date(utcDate.getTime() + offsetHours * 60 * 60 * 1000);
}

export default function SimulationModal({
    isOpen,
    onClose,
    data,
    isLoading,
    error,
    locale,
    onUpdateLocation
}: SimulationModalProps) {
    const t = getTranslations(locale);

    // Static stars for simulation
    const stars = useMemo(() => {
        const s = [];
        for (let i = 0; i < 200; i++) {
            s.push({
                az: Math.random() * 360,
                alt: Math.random() * 90,
                size: Math.random() * 1.5 + 0.5,
                brightness: Math.random()
            });
        }
        return s;
    }, []);

    const [isPlaying, setIsPlaying] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Animation Logic
    useEffect(() => {
        if (isPlaying) {
            playIntervalRef.current = setInterval(() => {
                setTimeOffset(prev => {
                    const next = prev + 1;
                    if (next > 150) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return next;
                });
            }, 100);
        } else {
            if (playIntervalRef.current) clearInterval(playIntervalRef.current);
        }
        return () => {
            if (playIntervalRef.current) clearInterval(playIntervalRef.current);
        };
    }, [isPlaying]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [timeOffset, setTimeOffset] = useState(0);
    const [showBuildings, setShowBuildings] = useState(true);
    const [showOverlay, setShowOverlay] = useState(true);
    const [use24Hour, setUse24Hour] = useState(false);

    // Interactive View State
    const [fov, setFov] = useState(50);
    const [viewAz, setViewAz] = useState<number | null>(null); // Null = Auto-track Moon
    const [viewAlt, setViewAlt] = useState<number | null>(null); // Null = Auto
    const dragRef = useRef({ active: false, startX: 0, startY: 0, startAz: 0, startAlt: 0 });
    const [isDragging, setIsDragging] = useState(false);

    // Stars with Az/Alt coordinates (Spherical distribution)


    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });

    const [editLat, setEditLat] = useState('');
    const [editLon, setEditLon] = useState('');
    const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

    useEffect(() => {
        if (data && isOpen) {
            setEditLat(data.meta.lat.toFixed(4));
            setEditLon(data.meta.lon.toFixed(4));
        }
    }, [data, isOpen]);

    const handleUpdateLocation = () => {
        const lat = parseFloat(editLat);
        const lon = parseFloat(editLon);
        if (!isNaN(lat) && !isNaN(lon)) {
            onUpdateLocation(lat, lon);
        }
    };

    // Western Arabic Numeral Enforcer (0-9)
    const formatNum = (n: number | string) => {
        // Ensure standard Western numerals even if locale is Arabic
        const s = n.toString();
        // If the system/browser is forcing Eastern numerals via locale, we manually replace them?
        // Actually, toLocaleString('en-US') usually forces Western numerals.
        // But for mixed text, we want to be safe.
        return typeof n === 'number' ? n.toLocaleString('en-US') : s.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
    };

    // Helper for formatting degrees with Western numerals
    const formatDeg = (n: number) => {
        return `${formatNum(n.toFixed(2))}°`;
    };

    const formatTimeStr = (iso: string | null | undefined) => {
        if (!iso) return '--';
        // Force en-GB to get 0-9 numerals
        return new Date(iso).toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: !use24Hour
        });
    };

    // Generate and download visibility report
    const handleDownloadReport = useCallback((currentFrame: SimulationPoint | null) => {
        if (!data || !currentFrame || !canvasRef.current) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // HD Resolution (2x standard width)
        const width = 1600;
        const height = 2600; // Increased height to accommodate extra details
        canvas.width = width;
        canvas.height = height;

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t.visibilityReport, width / 2, 100);

        // Date and Location - FORCE ENGLISH NUMERALS
        ctx.font = '32px Tajawal, sans-serif';
        ctx.fillStyle = '#cccccc';
        const dateStr = data.sunsetIso ? new Date(data.sunsetIso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '--';

        ctx.fillText(dateStr, width / 2, 160);
        ctx.font = '28px Tajawal, sans-serif';
        ctx.fillText(`${t.latitude}: ${formatNum(data.meta.lat.toFixed(4))}°  |  ${t.longitude}: ${formatNum(data.meta.lon.toFixed(4))}°`, width / 2, 210);

        // SIMULATION IMAGE - High Quality Draw
        const simY = 300;
        const sourceCanvas = canvasRef.current;

        // Calculate Aspect Ratio to avoid squishing
        const imgAspect = sourceCanvas.width / sourceCanvas.height;
        const maxW = 1400;
        const maxH = 800;

        let drawW = maxW;
        let drawH = maxW / imgAspect;

        if (drawH > maxH) {
            drawH = maxH;
            drawW = drawH * imgAspect;
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Tajawal, sans-serif';
        ctx.fillText(t.simulation, 100, simY - 20);

        // Draw Image with high fidelity and correct aspect ratio
        // Center the image horizontally if it's narrower than maxW, or just left align?
        // Let's keep it left aligned at 100 to match text.
        ctx.drawImage(sourceCanvas, 100, simY, drawW, drawH);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.strokeRect(100, simY, drawW, drawH);

        // Data section
        let y = simY + drawH + 80;

        ctx.textAlign = 'left';
        ctx.font = 'bold 36px Tajawal, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.advancedDetails + ' (At Sunset)', 100, y);
        y += 60;

        // Use Sunset Frame (Index 0) for consistent data reporting instead of current view
        const reportFrame = (data.trajectory && data.trajectory.length > 0) ? data.trajectory[0] : currentFrame;

        // Helper to draw row (supports multi-line values)
        const drawRow = (label: string, value: string, x: number, lineY: number) => {
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '28px Tajawal, sans-serif';
            ctx.fillText(label + ':', x, lineY);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px Tajawal, monospace';

            const lines = value.split('\n');
            lines.forEach((line, i) => {
                ctx.fillText(line, x + 350, lineY + (i * 35));
            });
        };

        const col1X = 100;
        const col2X = 850;

        // Headers for Columns
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Tajawal, sans-serif';
        ctx.fillText(t.geocentric.toUpperCase(), col1X, y);
        ctx.fillText(t.topocentric.toUpperCase(), col2X, y);
        y += 40;

        // Conjunction Time
        const formatTimeStr = (iso: string | null | undefined, includeUtc = false) => {
            if (!iso) return '--';
            const local = new Date(iso).toLocaleString('en-GB');
            if (includeUtc) {
                const utc = new Date(iso).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
                return `${local}\n${utc}`;
            }
            return local;
        };

        const geoConj = formatTimeStr(data.conjunctionLocalGeo, true);
        const topoConj = formatTimeStr(data.conjunctionLocalTopo, true);

        drawRow(t.conjunctionTime, geoConj, col1X, y);
        drawRow(t.conjunctionTime, topoConj, col2X, y);
        y += 80; // Extra spacing for double lines

        const geoAge = data.moonAgeHoursGeo ? formatMoonAge(data.moonAgeHoursGeo).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '--';
        const topoAge = data.moonAgeHoursTopo !== undefined && data.moonAgeHoursTopo !== null ? formatMoonAge(data.moonAgeHoursTopo).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '--';

        drawRow(t.moonAge, geoAge, col1X, y);
        drawRow(t.moonAge, topoAge, col2X, y);
        y += 80;

        // Physical Data Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Tajawal, sans-serif';
        ctx.fillText('PHYSICAL POSITION (TOPOCENTRIC)', col1X, y);
        y += 40;

        // Lag Time calculation (Moonset - Sunset)
        let lagTimeStr = '--';
        if (data.moonsetIso && data.sunsetIso) {
            const diffMs = new Date(data.moonsetIso).getTime() - new Date(data.sunsetIso).getTime();
            const diffMins = Math.round(diffMs / 60000);
            lagTimeStr = `${diffMins} min`;
        }

        const commonItems = [
            { label: t.moonAltitude, value: `${formatDeg(reportFrame.moonAlt)}` },
            { label: t.sunAltitude, value: `${formatDeg(reportFrame.sunAlt)}` },
            { label: t.elongation, value: `${formatDeg(reportFrame.elongation)}` },
            { label: t.moonAzimuth, value: formatDMS(reportFrame.moonAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) },
            { label: t.illumination, value: `${formatNum((reportFrame.illumination * 100).toFixed(1))}%` },
            { label: 'Moon Orientation', value: `${formatNum(reportFrame.tilt.toFixed(2))}°` },
            { label: 'Lag Time', value: lagTimeStr },
            { label: t.sunsetTime, value: data.sunsetIso ? new Date(data.sunsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--:--' },
            { label: t.moonsetTime, value: data.moonsetIso ? new Date(data.moonsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--:--' },
        ];

        commonItems.forEach((item, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = col === 0 ? col1X : col2X;
            drawRow(item.label, item.value, x, y + row * 60); // Increased row height for readability
        });

        y += Math.ceil(commonItems.length / 2) * 60 + 80;

        // Footer
        ctx.fillStyle = '#666';
        ctx.font = '24px Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by Crescent Watch | ' + new Date().toISOString().split('T')[0], width / 2, height - 50);

        // Download logic
        const link = document.createElement('a');
        const dateFileName = data.sunsetIso ? new Date(data.sunsetIso).toISOString().split('T')[0] : 'report';
        link.download = `crescent-report-${dateFileName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }, [data, locale, t, use24Hour]);





    const skyline = useMemo(() => {
        // Dubai skyline doesn't really depend on data/loc unless we want global?
        // User asked for "Rough Dubai Skyline". We'll just generate it.
        // Pass width 2000 for standard reference.
        return generateDubaiSkyline(2000, 12345);
    }, []);

    // Get current frame based on time offset
    const getFrame = useCallback((offset: number): SimulationPoint | null => {
        if (!data?.trajectory?.length) return null;
        // Clamp offset to available range for safety if slider goes beyond data
        const maxTime = data.trajectory[data.trajectory.length - 1].timeOffsetMin;
        const safeOffset = Math.min(offset, maxTime);

        return data.trajectory.reduce((prev, curr) =>
            Math.abs(curr.timeOffsetMin - safeOffset) < Math.abs(prev.timeOffsetMin - safeOffset) ? curr : prev
        );
    }, [data]);

    const frame = useMemo(() => getFrame(timeOffset), [getFrame, timeOffset]);

    const currentTime = useMemo(() => {
        if (!data?.sunsetIso) return null;
        const sunsetTime = utcToLocationLocal(data.sunsetIso, data.meta.lon);
        return new Date(sunsetTime.getTime() + timeOffset * 60 * 1000);
    }, [data, timeOffset]);

    const formatTime = (date: Date) => {
        if (!date) return '--:--';
        if (use24Hour) {
            return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

        }
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
    };

    // Viewport Interaction Handlers
    const lastTap = useRef<number>(0);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        const zoomSpeed = fov / 20; // Scale speed with FOV
        const delta = Math.sign(e.deltaY) * zoomSpeed;
        const newFov = Math.max(10, Math.min(120, fov + delta));
        setFov(newFov);
    }, [fov]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        // Double tap detection
        const now = Date.now();
        if (now - lastTap.current < 300) {
            // Double tap! Zoom in towards center or tap? Let's just zoom in step
            setFov(prev => Math.max(10, prev - 20)); // Zoom in by 20 degrees
        }
        lastTap.current = now;

        setIsDragging(true);
        const startAz = viewAz !== null ? viewAz : (frame ? frame.moonAz : 180);
        const startAlt = viewAlt !== null ? viewAlt : (frame ? frame.moonAlt : 15);

        dragRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            startAz: startAz,
            startAlt: startAlt
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        setViewAz(startAz);
        setViewAlt(startAlt);
    }, [viewAz, viewAlt, frame]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current.active) return;

        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;

        const pxPerDeg = canvasSize.width / fov;
        const dAz = -dx / pxPerDeg;
        const dAlt = dy / pxPerDeg;

        let newAz = dragRef.current.startAz + dAz;
        while (newAz < 0) newAz += 360;
        while (newAz >= 360) newAz -= 360;

        let newAlt = dragRef.current.startAlt + dAlt;
        newAlt = Math.max(-90, Math.min(90, newAlt));

        setViewAz(newAz);
        setViewAlt(newAlt);
    }, [canvasSize.width, fov]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setIsDragging(false);
        dragRef.current.active = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }, []);

    const handleResetView = useCallback(() => {
        setViewAz(null);
        setViewAlt(null);
        setFov(50);
    }, []);

    // Draw simulation
    // Draw simulation
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !frame) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;

        // Camera / Viewport Model
        const centerAz = viewAz !== null ? viewAz : frame.moonAz;
        const centerAlt = viewAlt !== null ? viewAlt : Math.max(2, frame.moonAlt); // Default look slightly up/at moon
        const pxPerDeg = W / fov;

        // Coordinate conversion (Defined early for use in sky/horizon)
        const toScreen = (az: number, alt: number) => {
            let dAz = az - centerAz;
            while (dAz > 180) dAz -= 360;
            while (dAz < -180) dAz += 360;

            const x = W / 2 + dAz * pxPerDeg;
            const y = H / 2 - (alt - centerAlt) * pxPerDeg;
            return { x, y };
        };

        // Horizon Y on screen (where Alt = 0)
        const horizonY = toScreen(centerAz, 0).y;

        // Dynamic Sky Gradient (Spherical)
        // Map gradient to Altitude (+90 to 0)
        const zenithY = toScreen(centerAz, 90).y;

        // Ensure gradient covers the visible sky area adequately
        const skyGrad = ctx.createLinearGradient(0, zenithY, 0, horizonY);
        const sunAlt = frame.sunAlt;

        if (sunAlt > 0) {
            skyGrad.addColorStop(0, '#1a5a9a'); // Deep Blue Zenith
            skyGrad.addColorStop(1, '#87CEEB'); // Light Blue Horizon
        } else if (sunAlt > -6) {
            skyGrad.addColorStop(0, '#0a1a3a');
            skyGrad.addColorStop(1, '#ffaa77'); // Sunset Horizon
        } else if (sunAlt > -12) {
            skyGrad.addColorStop(0, '#020510');
            skyGrad.addColorStop(1, '#1a3050'); // Navy Horizon
        } else {
            skyGrad.addColorStop(0, '#000000');
            skyGrad.addColorStop(1, '#0a0f1a'); // Dark Horizon
        }

        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        // Stars (Spherical)
        if (sunAlt < -6) {
            const starAlpha = Math.min(1, (-sunAlt - 6) / 12);
            stars.forEach(star => {
                // Only draw stars above horizon - 5 deg (atmos fade)
                if (star.alt > -5) {
                    const pos = toScreen(star.az, star.alt);
                    // Check bounds for perf
                    if (pos.x > -2 && pos.x < W + 2 && pos.y > -2 && pos.y < H + 2) {
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, star.size * (fov < 40 ? 1.5 : 1), 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness * starAlpha})`;
                        ctx.fill();
                    }
                }
            });
        }

        // Sun Glow
        if (sunAlt > -10) {
            const sunScreenPos = toScreen(frame.sunAz, Math.max(frame.sunAlt, -5));
            const glowX = Math.max(-W, Math.min(2 * W, sunScreenPos.x));
            const glowY = sunScreenPos.y;

            const glowRadius = 250 * (1 - Math.abs(sunAlt) / 10);
            if (glowRadius > 0) {
                const sunGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
                sunGrad.addColorStop(0, `rgba(255, 150, 50, ${0.4 * (1 - Math.abs(sunAlt) / 10)})`);
                sunGrad.addColorStop(0.5, `rgba(255, 100, 50, ${0.2 * (1 - Math.abs(sunAlt) / 10)})`);
                sunGrad.addColorStop(1, 'rgba(255, 100, 50, 0)');
                ctx.fillStyle = sunGrad;
                ctx.fillRect(0, 0, W, H);
            }
        }

        // Moon
        const moonPos = toScreen(frame.moonAz, frame.moonAlt);
        const moonScale = 4; // Legacy scale preserved
        const moonRadius = (0.25 * pxPerDeg) * moonScale;

        // Draw Moon
        if (moonPos.y < H + 100 && moonPos.x > -50 && moonPos.x < W + 50) {
            ctx.save();
            ctx.translate(moonPos.x, moonPos.y);
            ctx.rotate((frame.tilt - 90) * Math.PI / 180);

            // Earthshine
            ctx.beginPath();
            ctx.arc(0, 0, moonRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(30, 35, 45, 0.95)';
            ctx.fill();

            // Moon Texture (Maria/Craters) - subtle darker patches
            ctx.fillStyle = 'rgba(20, 25, 35, 0.6)';
            const craters = [
                { x: -0.3, y: -0.2, r: 0.15 }, { x: 0.2, y: 0.3, r: 0.2 }, { x: 0.4, y: -0.1, r: 0.12 },
                { x: -0.1, y: 0.5, r: 0.1 }, { x: -0.5, y: 0.1, r: 0.1 }, { x: 0.1, y: -0.5, r: 0.15 }
            ];
            craters.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x * moonRadius, c.y * moonRadius, c.r * moonRadius, 0, Math.PI * 2);
                ctx.fill();
            });

            // Crescent
            const k = frame.illumination;
            const r = moonRadius;
            ctx.fillStyle = '#fffef8';

            if (k < 0.5) {
                const xTerm = r * (1 - 2 * k);
                ctx.beginPath();
                ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
                ctx.bezierCurveTo(xTerm, r * 0.55, xTerm, -r * 0.55, 0, -r);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
                ctx.fill();
                const xTerm = r * (2 * k - 1);
                ctx.beginPath();
                ctx.ellipse(0, 0, xTerm, r, 0, -Math.PI / 2, Math.PI / 2);
                ctx.fill();
            }

            // Glow
            ctx.shadowColor = '#fffef8';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(0, 0, moonRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,254,248,0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();
        }

        // Reset Shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;


        // Ground Gradient (Depth)
        ctx.setLineDash([]);
        const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
        groundGrad.addColorStop(0, '#0a0a0a'); // Horizon line
        groundGrad.addColorStop(1, '#1a1a1a'); // Foreground (slightly lighter/textured?)
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, horizonY, W, H - horizonY);

        // Ghost Sun (Under Horizon)
        if (frame.sunAlt < 0) {
            const sunScreenPos = toScreen(frame.sunAz, frame.sunAlt);
            // Draw if roughly on screen/canvas horizontally
            if (sunScreenPos.x > -50 && sunScreenPos.x < W + 50) {
                // Only if actually below ground visual line
                if (sunScreenPos.y > horizonY) {
                    ctx.save();
                    ctx.translate(sunScreenPos.x, sunScreenPos.y);

                    // Dashed outline for ghost effect
                    ctx.strokeStyle = 'rgba(255, 200, 50, 0.5)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.arc(0, 0, 12, 0, Math.PI * 2);
                    ctx.stroke();

                    // Faint Fill
                    ctx.fillStyle = 'rgba(255, 200, 50, 0.1)';
                    ctx.fill();

                    ctx.restore();
                }
            }
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(W, horizonY);
        ctx.stroke();

        // Realistic Dubai Silhouette (Edges Only)
        if (showBuildings) {
            ctx.fillStyle = '#050505'; // Very dark silhouette

            // Scale factor relative to reference width 2000
            const s = W / 2000;

            // Realistic Dubai Silhouette (Spherical / Azimuth Mapped)
            // Map 0..2000 to Azimuth Range [240, 300] (Centered at 270 West) 
            const cityCenterAz = 270;
            const cityWidthDeg = 60;
            const azFactor = cityWidthDeg / 2000;

            skyline.forEach(b => {
                // Convert to spherical coords
                const bAz = cityCenterAz + (b.x - 1000) * azFactor;
                const bWidthDeg = b.w * azFactor;
                const bHeightDeg = (b.h / 400) * 8; // Standardize 400px = 8 degrees height

                // Project to screen
                // We simplify by projecting the center bottom
                const centerPos = toScreen(bAz, 0);
                // Then using degrees scale for W/H
                const bw = bWidthDeg * pxPerDeg;
                const bh = bHeightDeg * pxPerDeg;
                const bx = centerPos.x - bw / 2;
                const by = centerPos.y - bh; // From horizon up

                // Scale 's' for compatibility with old drawing code (relative size)
                const s = bw / b.w;

                // Clip check (simple X check)
                if (bx + bw > -100 && bx < W + 100) {

                    // Reset fill for silhouette
                    ctx.fillStyle = '#050505';

                    // Handle drawing based on type
                    if (b.type === 'khalifa') {
                        // Tiered needle
                        const levels = 5;
                        const stepH = bh / levels;
                        for (let i = 0; i < levels; i++) {
                            const wRatio = 1 - (i / levels);
                            const lw = bw * wRatio;
                            // Draw from bottom up.
                            const ly2 = horizonY - (i + 1) * stepH;
                            // Center aligned
                            ctx.fillRect(bx + (bw - lw) / 2, ly2, lw, stepH);
                        }
                        // Needle tip
                        ctx.beginPath();
                        ctx.moveTo(bx + bw / 2 - 2, horizonY - bh);
                        ctx.lineTo(bx + bw / 2 + 2, horizonY - bh);
                        ctx.lineTo(bx + bw / 2, horizonY - bh - 40 * s);
                        ctx.fill();
                    } else if (b.type === 'arab') {
                        // Sail shape
                        ctx.beginPath();
                        ctx.moveTo(bx, horizonY);
                        ctx.lineTo(bx + bw * 0.8, horizonY - bh); // Front curve top
                        ctx.quadraticCurveTo(bx - bw * 0.5, horizonY - bh * 0.5, bx, horizonY); // Back curve
                        ctx.fill();
                        // Mast
                        ctx.fillRect(bx + bw * 0.5, horizonY - bh - 10 * s, 3 * s, 10 * s);
                    } else if (b.type === 'emirates') {
                        // Two triangles facing each other? Or just one sloped
                        ctx.beginPath();
                        ctx.moveTo(bx, horizonY);
                        ctx.lineTo(bx, horizonY - bh);
                        ctx.lineTo(bx + bw, horizonY - bh * 0.8);
                        ctx.lineTo(bx + bw, horizonY);
                        ctx.fill();
                    } else if (b.type === 'twist') {
                        // Twisted block (Cayan) - approx with slight shear or just simple block for now
                        ctx.fillRect(bx, by, bw, bh);
                    } else {
                        // Generic block
                        ctx.fillRect(bx, by, bw, bh);
                    }

                    // Add random lights/windows
                    // Stronger hash to avoid diagonal patterns
                    const pseudoRandom = (x: number, y: number) => {
                        const dot = x * 12.9898 + y * 78.233;
                        const sin = Math.sin(dot) * 43758.5453;
                        return sin - Math.floor(sin);
                    };

                    // Draw windows on the main body of the building
                    ctx.fillStyle = 'rgba(255, 255, 200, 0.4)'; // Warm faint light
                    const rows = Math.floor(bh / (4 * s));
                    const cols = Math.floor(bw / (3 * s));

                    if (b.type !== 'khalifa' && b.type !== 'arab') {
                        for (let r = 1; r < rows - 1; r++) {
                            for (let c = 1; c < cols - 1; c++) {
                                // Use building pos + grid pos for seed
                                if (pseudoRandom(b.x + c, r) > 0.85) {
                                    const wx = bx + (c * 3 * s);
                                    const wy = by + (r * 4 * s);
                                    ctx.fillRect(wx, wy, s * 1.5, s * 2);
                                }
                            }
                        }
                    } else if (b.type === 'khalifa') {
                        // Vertical strips of light
                        for (let r = 10; r < rows; r += 4) {
                            if (pseudoRandom(b.x, r) > 0.5) {
                                ctx.fillRect(bx + bw / 2 - s, by + r * 4 * s, s * 2, s * 3);
                            }
                        }
                    }
                }
            });
        }

        // Horizon Compass Ticks
        {
            ctx.font = 'bold 12px Tajawal, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';

            // Draw Ticks every 10 degrees, Labels every 45
            const startAz = Math.floor((centerAz - (fov / 2)) / 10) * 10;
            const endAz = Math.ceil((centerAz + (fov / 2)) / 10) * 10;

            for (let az = startAz; az <= endAz; az += 10) {
                let normalizedAz = az;
                while (normalizedAz < 0) normalizedAz += 360;
                while (normalizedAz >= 360) normalizedAz -= 360;

                const pos = toScreen(normalizedAz, 0);

                // Draw Tick
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fillRect(pos.x - 1, pos.y, 2, 6);

                // Label for major
                if (normalizedAz % 45 === 0) {
                    const labels: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.fillText(labels[normalizedAz] || (normalizedAz + '°'), pos.x, pos.y + 8);
                }
            }
        }

        // 4. Horizon Labels (Azimuths & Set Times) - REMOVED AS REQUESTED
        // User requested to remove Moonset/Sunset/Azimuth labels from the "entire map" and put them in the left side panel.

        // Advanced Details Overlay
        if (showOverlay && data) {
            // Helper for Local Time
            const formatLocalTime = (isoDateStr: string | null | undefined) => {
                if (!isoDateStr) return '--';
                const d = new Date(isoDateStr);
                const offsetHours = data.meta.lon / 15;
                const localDate = new Date(d.getTime() + offsetHours * 3600000);
                const h = localDate.getUTCHours();
                const m = localDate.getUTCMinutes();
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;
                return use24Hour
                    ? (h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ' ')
                    : (h12.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ' ' + ampm + ' ');
            };

            // Mobile responsiveness
            const isMobile = W < 600;
            const baseFontSize = isMobile ? 10 : 12;
            const titleFontSize = isMobile ? 13 : 16;
            const padding = isMobile ? 10 : 20;
            const lineHeight = isMobile ? 13 : 16;
            const headerGap = isMobile ? 8 : 12;
            let lineY = padding;

            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;

            // --- Header Title ---
            ctx.font = `bold ${titleFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(t.visibilityAnalysis, padding, lineY);
            lineY += lineHeight * 1.5;

            // --- Date & Time ---
            ctx.font = `${baseFontSize}px Tajawal, sans-serif`;
            const dateStr = new Date(data.sunsetIso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
            });
            ctx.fillText(dateStr, padding, lineY + 2);
            lineY += lineHeight * 1.5;

            // --- OBSERVATIONAL DATA ---
            ctx.font = `bold ${baseFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(t.observation.toUpperCase(), padding, lineY);
            lineY += lineHeight * 1.2;

            ctx.font = `${baseFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';

            let lagTimeStr = '--';
            if (data.moonsetIso && data.sunsetIso) {
                const diffMs = new Date(data.moonsetIso).getTime() - new Date(data.sunsetIso).getTime();
                const diffMins = Math.round(diffMs / 60000);
                lagTimeStr = `${diffMins} min`;
            }

            const observationItems = [
                { label: t.sunsetTime, value: data.sunsetIso ? new Date(data.sunsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--:--' },
                { label: t.moonsetTime, value: data.moonsetIso ? new Date(data.moonsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--:--' },
                { label: 'Lag Time', value: lagTimeStr },
                { label: t.moonAge, value: data.moonAgeHoursTopo !== undefined && data.moonAgeHoursTopo !== null ? formatNum(data.moonAgeHoursTopo.toFixed(2)) + ' h' : '--' },
                { label: t.illumination, value: formatNum((frame.illumination * 100).toFixed(1)) + '%' },
                { label: t.sunAltitude, value: formatNum((frame.sunAlt).toFixed(2)) + '°' },
                { label: t.moonAzimuth, value: formatDMS(frame.moonAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٩'.indexOf(d)]) },
                { label: t.sunAzimuth, value: formatDMS(frame.sunAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٩'.indexOf(d)]) },
                { label: t.azimuthDiff, value: formatNum((Math.abs(frame.moonAz - frame.sunAz)).toFixed(2)) + '°' },
                { label: t.elongation, value: formatDMS(frame.elongation).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٩'.indexOf(d)]) },
                { label: 'Moon Orientation', value: formatNum(frame.tilt.toFixed(2)) + '°' },
            ];

            observationItems.forEach(item => {
                ctx.fillStyle = '#cccccc';
                ctx.fillText(item.label + ':', padding, lineY);
                ctx.fillStyle = '#ffffff';
                const labelWidth = ctx.measureText(item.label + ':').width;
                ctx.fillText(item.value, padding + Math.max(isMobile ? 80 : 100, labelWidth + 10), lineY);
                lineY += lineHeight;
            });

            lineY += headerGap;

            // --- TOPOCENTRIC DATA ---
            ctx.font = `bold ${baseFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(t.topocentric.toUpperCase(), padding, lineY);
            lineY += lineHeight * 1.2;

            ctx.font = `${baseFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';

            const topoItems = [
                { label: t.conjunctionTime, value: data.conjunctionLocalTopo ? formatLocalTime(data.conjunctionLocalTopo) : '--' },
                { label: t.moonAge, value: data.moonAgeHoursTopo !== undefined && data.moonAgeHoursTopo !== null ? formatNum(data.moonAgeHoursTopo.toFixed(2)) + ' h' : '--' },
            ];

            topoItems.forEach(item => {
                ctx.fillStyle = '#cccccc';
                ctx.fillText(item.label + ':', padding, lineY);
                ctx.fillStyle = '#ffffff';
                const labelWidth = ctx.measureText(item.label + ':').width;
                ctx.fillText(item.value, padding + Math.max(isMobile ? 80 : 100, labelWidth + 10), lineY);
                lineY += lineHeight;
            });
            lineY += headerGap;

            // --- GEOCENTRIC DATA ---
            ctx.font = `bold ${baseFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(t.geocentric.toUpperCase(), padding, lineY);
            lineY += lineHeight * 1.2;

            ctx.font = `${baseFontSize}px Tajawal, sans-serif`;
            ctx.fillStyle = '#ffffff';

            const geoItems = [
                { label: t.conjunctionTime, value: data.conjunctionLocalGeo ? formatLocalTime(data.conjunctionLocalGeo) : '--' },
                { label: t.moonAge, value: data.moonAgeHoursGeo !== undefined ? formatNum(data.moonAgeHoursGeo.toFixed(2)) + ' h' : '--' },
            ];

            geoItems.forEach(item => {
                ctx.fillStyle = '#cccccc';
                ctx.fillText(item.label + ':', padding, lineY);
                ctx.fillStyle = '#ffffff';
                const labelWidth = ctx.measureText(item.label + ':').width;
                ctx.fillText(item.value, padding + Math.max(isMobile ? 80 : 100, labelWidth + 10), lineY);
                lineY += lineHeight;
            });

            // 3. Sky Body Lines (Elongation) - Restored
            const sunScreenPos = toScreen(frame.sunAz, frame.sunAlt);
            const moonPos = toScreen(frame.moonAz, frame.moonAlt);

            // Always draw elongation line if both are reasonably close to view
            // Relaxed bounds check
            if (sunScreenPos.y > -2000 && sunScreenPos.y < H + 2000) {
                ctx.strokeStyle = '#aaaaaa';
                ctx.setLineDash([2, 5]); // Dashed line
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sunScreenPos.x, sunScreenPos.y);
                ctx.lineTo(moonPos.x, moonPos.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Middle of Moon Indicator (Center Crosshair)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(moonPos.x - 10, moonPos.y);
                ctx.lineTo(moonPos.x + 10, moonPos.y);
                ctx.moveTo(moonPos.x, moonPos.y - 10);
                ctx.lineTo(moonPos.x, moonPos.y + 10);
                ctx.stroke();

                const midX = (sunScreenPos.x + moonPos.x) / 2;
                const midY = (sunScreenPos.y + moonPos.y) / 2;

                // Draw label only if visible in viewport
                if (midX > 0 && midX < W && midY > 0 && midY < H) {
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 4;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 12px Tajawal, sans-serif';
                    ctx.fillText(`${t.elongation} ${formatDMS(frame.elongation)}`, midX, midY - 5);
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.textAlign = 'left';
                }
            }
        }
    }, [frame, stars, skyline, showBuildings, showAdvancedDetails, data, locale, t, viewAz, viewAlt, fov, canvasSize, showOverlay]);


    // Resizing logic - Fix squishing by using ResizeObserver
    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setCanvasSize({ width, height });
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [isOpen]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        draw();
    }, [canvasSize, draw]);

    useEffect(() => {
        setTimeOffset(0);
    }, [data]);

    if (!isOpen) return null;

    return (
        // Use 100dvh for mobile browser height consistency
        <div className="fixed inset-0 z-[5000] flex flex-col bg-background/95 backdrop-blur-xl animate-in fade-in duration-200 h-[100dvh]">
            {/* Full Screen - No Outer Padding */}
            <div className="relative flex flex-col w-full h-full overflow-hidden">

                {/* Header - Responsive Stacking */}
                <div className="flex flex-col gap-3 px-4 py-3 border-b bg-muted/20 shrink-0">
                    {/* Top Row: Title + Close (Mobile) + Toggles */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">{t.simulation}</h2>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground hidden sm:block">{t.format12h}</Label>
                                <Switch checked={use24Hour} onCheckedChange={setUse24Hour} />
                                <Label className="text-xs text-muted-foreground">{t.format24h}</Label>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Second Row: Inputs (Full width on mobile) */}
                    {/* Second Row: Inputs (Flow layout) */}
                    {/* Inputs Moved to Footer - Top Section Cleared */}

                    {/* Advanced Details Toggle and Panel REMOVED */}
                </div>

                {/* Canvas Area with Responsive Layout - Scrollable content area on mobile */}
                {/* Desktop: Force min-h to prevent collapse (empty view fix) */}
                {/* Canvas & Controls Container */}
                <div className="relative w-full bg-black flex flex-col md:flex-1 overflow-hidden">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center text-white gap-2 z-10 pointer-events-none">
                            <Loader2 className="animate-spin" /> {t.calculating}
                        </div>
                    )}

                    {/* Drawing Container - tracked by ResizeObserver */}
                    {/* Lower min-height for mobile to ensure footer fits on 100dvh screens */}
                    <div
                        className="relative w-full flex-1 min-h-[60vh] md:min-h-[400px] touch-none cursor-move group"
                        ref={containerRef}
                        onWheel={handleWheel}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    >
                        <canvas ref={canvasRef} className="block w-full h-full" />

                        {/* Reset View Button */}
                        {(viewAz !== null || viewAlt !== null || fov !== 50) && (
                            <div className="absolute top-4 right-4 z-10">
                                <Button size="sm" variant="secondary" onClick={handleResetView} className="h-8 text-xs bg-black/50 text-white hover:bg-black/80 backdrop-blur-md border border-white/10">
                                    Reset View
                                </Button>
                            </div>
                        )}

                        {/* Interactive hint */}
                        <div className="absolute bottom-4 left-4 z-10 text-[10px] text-white/30 pointer-events-none select-none">
                            Drag to Pan • Scroll/Double-Tap to Zoom
                        </div>
                    </div>

                    {/* Controls Footer - Distinct section, no overlap, scrollable on small screens if needed */}
                    <div className="relative w-full bg-card text-foreground z-20 border-t p-3 md:p-4 pb-8 md:pb-6 shrink-0 overflow-y-auto max-h-[50vh]">
                        <div className="flex flex-col gap-4 md:gap-4 max-w-7xl mx-auto w-full">
                            {/* Lat/Lon Inputs - Moved Here */}
                            <div className="flex items-center gap-4 border-b pb-4 mb-2">
                                <div className="flex flex-wrap items-center gap-2 text-sm bg-muted/30 p-1.5 rounded-xl border border-white/10 w-full md:w-auto">
                                    <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                        <span className="text-muted-foreground pl-2 text-xs uppercase tracking-wider whitespace-nowrap">{t.latitude}:</span>
                                        <Input
                                            className="flex-1 min-w-[60px] h-8 text-xs font-arabic border-0 focus-visible:ring-0 px-1 bg-transparent"
                                            value={editLat}
                                            onChange={e => setEditLat(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleUpdateLocation()}
                                            onBlur={handleUpdateLocation}
                                        />
                                    </div>
                                    <div className="hidden md:block w-px h-4 bg-muted shrink-0" />
                                    <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                                        <span className="text-muted-foreground pl-2 text-xs uppercase tracking-wider whitespace-nowrap">{t.longitude}:</span>
                                        <Input
                                            className="flex-1 min-w-[60px] h-8 text-xs font-arabic border-0 focus-visible:ring-0 px-1 bg-transparent"
                                            value={editLon}
                                            onChange={e => setEditLon(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleUpdateLocation()}
                                            onBlur={handleUpdateLocation}
                                        />
                                    </div>
                                </div>
                                <div className="flex-1" /> {/* Spacer */}
                            </div>

                            {/* Bottom row: Time + Slider + Checkbox + Play + Download */}
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 shrink-0 rounded-full"
                                        onClick={() => setIsPlaying(!isPlaying)}
                                    >
                                        {isPlaying ? <Pause className="fill-current w-4 h-4" /> : <Play className="fill-current w-4 h-4 ml-0.5" />}
                                    </Button>

                                    <div className="text-xl w-20 text-center text-foreground font-arabic">
                                        {currentTime ? formatTime(currentTime) : '--:--'}
                                    </div>

                                    <Slider
                                        value={[timeOffset]}
                                        onValueChange={([v]) => { setTimeOffset(v); setIsPlaying(false); }}
                                        max={150} // Extended time period
                                        step={1}
                                        className="flex-1 py-1"
                                    />
                                </div>

                                <div className="flex justify-end items-center gap-4 text-xs">
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="build" checked={showBuildings} onCheckedChange={c => setShowBuildings(!!c)} className="border-muted-foreground" />
                                        <Label htmlFor="build" className="text-muted-foreground cursor-pointer">{t.showBuildings}</Label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Checkbox id="overlay" checked={showOverlay} onCheckedChange={c => setShowOverlay(!!c)} className="border-muted-foreground" />
                                        <Label htmlFor="overlay" className="text-muted-foreground cursor-pointer">{t.showData}</Label>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl text-xs gap-1 h-7"
                                        onClick={() => handleDownloadReport(frame)}
                                    >
                                        <Download className="w-3 h-3" />
                                        {t.downloadReport}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
