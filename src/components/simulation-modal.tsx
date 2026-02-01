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
import { formatDMS, formatMoonAge, formatCoordinate, formatRA, formatDec, getMoonRaDec } from '@/lib/astronomy';

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

// Building type for skyline
interface SkylineBuilding {
    x: number;      // azimuth position in degrees
    w: number;      // width in degrees
    h: number;      // height (0-1 normalized)
    style: number;  // 0-3 for different tops
}

// Seeded random number generator
function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}

// Generate procedural city skyline across entire 360° horizon
function generateCitySkyline(seed: number = 42): SkylineBuilding[] {
    const buildings: SkylineBuilding[] = [];
    const rand = seededRandom(seed);

    // Cover full 360 degrees with buildings
    let az = 0;
    while (az < 360) {
        // Random building width (0.3 to 1.5 degrees)
        const w = 0.3 + rand() * 1.2;

        // Random height with clustering (some areas taller)
        const clusterFactor = Math.sin(az * Math.PI / 60) * 0.3 + 0.7; // Creates height variation zones
        const baseHeight = 0.1 + rand() * 0.5 * clusterFactor;

        // Occasional tall towers
        const isTall = rand() > 0.85;
        const h = isTall ? baseHeight + 0.3 + rand() * 0.3 : baseHeight;

        // Random style (0-3)
        const style = Math.floor(rand() * 4);

        buildings.push({ x: az, w, h: Math.min(h, 1), style });

        // Small gap between buildings (0 to 0.3 degrees)
        az += w + rand() * 0.3;
    }

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

        // Load and draw hand measurement image at bottom with blending
        const handImg = new Image();
        handImg.src = '/measuring-sky-with-hand.png';
        handImg.onload = () => {
            // Calculate size - not too big, centered at bottom
            const imgMaxWidth = 600;
            const aspectRatio = handImg.width / handImg.height;
            const imgWidth = Math.min(imgMaxWidth, handImg.width);
            const imgHeight = imgWidth / aspectRatio;
            const imgX = (width - imgWidth) / 2; // Center horizontally
            const imgY = height - imgHeight - 100; // Position above footer

            // Apply soft-light blend mode for blending with background
            ctx.globalCompositeOperation = 'soft-light';
            ctx.globalAlpha = 0.4; // Make it subtle
            ctx.drawImage(handImg, imgX, imgY, imgWidth, imgHeight);

            // Reset blend mode
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;

            // Continue with download after image is drawn
            finishReport();
        };
        handImg.onerror = () => {
            // If image fails to load, just finish without it
            finishReport();
        };

        const finishReport = () => {
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
            if (!sourceCanvas) return;

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
        };
    }, [data, locale, t, use24Hour]);





    const skyline = useMemo(() => {
        // Generate procedural city skyline covering full 360° horizon
        return generateCitySkyline(12345);
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

            const r = moonRadius;
            const k = frame.illumination; // 0 = new moon, 0.5 = half, 1 = full

            // Outer glow (atmospheric effect)
            const glowGrad = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.5);
            glowGrad.addColorStop(0, 'rgba(255, 252, 240, 0.15)');
            glowGrad.addColorStop(1, 'rgba(255, 252, 240, 0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Dark side of moon (earthshine)
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(40, 45, 55, 0.9)';
            ctx.fill();

            // Illuminated crescent using proper spherical geometry
            // k = illumination fraction: 0 = new moon, 0.5 = quarter, 1 = full
            // The terminator (day/night line) is an ellipse with width = r * |2k - 1|
            ctx.fillStyle = '#fffef5';

            // Calculate terminator width from illumination
            // At k=0 (new): terminator width = r (same as limb, no crescent)
            // At k=0.5 (quarter): terminator width = 0 (straight line)
            // At k=1 (full): terminator width = r (same as limb, full circle)
            const terminatorWidth = r * Math.abs(2 * k - 1);

            if (k <= 0.5) {
                // Waxing crescent to first quarter
                // Lit portion is on the right, crescent curves inward

                if (k < 0.003) {
                    // Nearly new moon - just a tiny sliver
                    ctx.beginPath();
                    ctx.arc(0, 0, r, -0.1, 0.1, false);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    // Outer limb: right semicircle from top (-π/2) to bottom (π/2)
                    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
                    // Inner terminator: ellipse from bottom back to top (counterclockwise)
                    // This creates the crescent between limb and terminator
                    ctx.ellipse(0, 0, terminatorWidth, r, 0, Math.PI / 2, -Math.PI / 2, true);
                    ctx.closePath();
                    ctx.fill();
                }
            } else {
                // First quarter to full moon
                // More than half is lit

                // Draw right semicircle (always fully lit when k > 0.5)
                ctx.beginPath();
                ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
                ctx.closePath();
                ctx.fill();

                // Add gibbous portion on left side
                // terminatorWidth goes from 0 (at quarter) to r (at full)
                if (terminatorWidth > 0.01) {
                    ctx.beginPath();
                    ctx.ellipse(0, 0, terminatorWidth, r, 0, Math.PI / 2, -Math.PI / 2, false);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            ctx.restore();

            // Moon altitude line (perpendicular to horizon)
            if (frame.moonAlt > 0) {
                const horizonPoint = toScreen(frame.moonAz, 0);
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(moonPos.x, moonPos.y + moonRadius + 5);
                ctx.lineTo(horizonPoint.x, horizonPoint.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Altitude label
                const midY = (moonPos.y + horizonPoint.y) / 2;
                ctx.font = '11px monospace';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.textAlign = 'left';
                ctx.fillText(`${frame.moonAlt.toFixed(1)}°`, moonPos.x + 8, midY);
                ctx.restore();
            }

            // Moon age label (next to moon)
            if (frame.moonAge !== undefined) {
                ctx.save();
                ctx.font = '10px monospace';
                ctx.fillStyle = 'rgba(255, 220, 150, 0.8)';
                ctx.textAlign = 'left';
                const ageText = frame.moonAge < 48
                    ? `${frame.moonAge.toFixed(1)}h`
                    : `${(frame.moonAge / 24).toFixed(1)}d`;
                ctx.fillText(ageText, moonPos.x + moonRadius + 8, moonPos.y - 5);
                ctx.restore();
            }
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

        // Procedural City Skyline (full 360° horizon)
        if (showBuildings) {
            const maxHeightDeg = 6; // Max building height in degrees

            skyline.forEach(b => {
                // Buildings are already in azimuth degrees
                const bAz = b.x;
                const bWidthDeg = b.w;
                const bHeightDeg = b.h * maxHeightDeg;

                // Project to screen
                const centerPos = toScreen(bAz, 0);
                const bw = bWidthDeg * pxPerDeg;
                const bh = bHeightDeg * pxPerDeg;
                const bx = centerPos.x - bw / 2;
                const by = horizonY - bh;

                // Clip check
                if (bx + bw > -50 && bx < W + 50) {
                    ctx.fillStyle = '#0a0a0a';

                    // Draw based on style (0-3)
                    if (b.style === 0) {
                        // Flat top
                        ctx.fillRect(bx, by, bw, bh);
                    } else if (b.style === 1) {
                        // Pointed/triangular top
                        ctx.beginPath();
                        ctx.moveTo(bx, horizonY);
                        ctx.lineTo(bx, by + bh * 0.15);
                        ctx.lineTo(bx + bw / 2, by);
                        ctx.lineTo(bx + bw, by + bh * 0.15);
                        ctx.lineTo(bx + bw, horizonY);
                        ctx.fill();
                    } else if (b.style === 2) {
                        // Slanted top
                        ctx.beginPath();
                        ctx.moveTo(bx, horizonY);
                        ctx.lineTo(bx, by);
                        ctx.lineTo(bx + bw, by + bh * 0.2);
                        ctx.lineTo(bx + bw, horizonY);
                        ctx.fill();
                    } else {
                        // Stepped top
                        ctx.fillRect(bx, by + bh * 0.1, bw, bh * 0.9);
                        ctx.fillRect(bx + bw * 0.2, by, bw * 0.6, bh * 0.15);
                    }

                    // Windows (fixed grid based on building geometry, not pixels)
                    if (bh > 8 && bw > 2) {
                        ctx.fillStyle = 'rgba(255, 240, 180, 0.4)';
                        // Fixed number of window rows/cols per building (based on building's inherent properties)
                        const winRows = 8;
                        const winCols = 3;
                        const winW = bw * 0.08;
                        const winH = bh * 0.03;
                        const rowSpacing = bh / (winRows + 1);
                        const colSpacing = bw / (winCols + 1);

                        for (let r = 1; r <= winRows; r++) {
                            for (let c = 1; c <= winCols; c++) {
                                // Deterministic random based on building azimuth position + grid
                                const hash = Math.sin(b.x * 12.9898 + r * 78.233 + c * 37.719) * 43758.5453;
                                if ((hash - Math.floor(hash)) > 0.65) {
                                    const wx = bx + c * colSpacing - winW / 2;
                                    const wy = by + r * rowSpacing - winH / 2;
                                    ctx.fillRect(wx, wy, Math.max(1, winW), Math.max(1, winH));
                                }
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

            // Get Moon RA/Dec for current time
            const currentDate = new Date(new Date(data.sunsetIso).getTime() + timeOffset * 60000);
            const moonRaDec = getMoonRaDec(currentDate);

            // Time offset in hours for moon age calculation
            const timeOffsetHours = timeOffset / 60;

            const observationItems = [
                { label: t.sunsetTime, value: data.sunsetIso ? new Date(data.sunsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--:--' },
                { label: t.moonsetTime, value: data.moonsetIso ? new Date(data.moonsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--:--' },
                { label: 'Lag Time', value: lagTimeStr },
                { label: t.moonAge, value: data.moonAgeHoursTopo !== undefined && data.moonAgeHoursTopo !== null ? formatNum((data.moonAgeHoursTopo + timeOffsetHours).toFixed(2)) + ' h' : '--' },
                { label: t.illumination, value: formatNum((frame.illumination * 100).toFixed(1)) + '%' },
                { label: t.sunAltitude, value: formatNum((frame.sunAlt).toFixed(2)) + '°' },
                { label: t.moonAzimuth, value: formatDMS(frame.moonAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٩'.indexOf(d)]) },
                { label: t.sunAzimuth, value: formatDMS(frame.sunAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٩'.indexOf(d)]) },
                { label: t.azimuthDiff, value: formatNum((Math.abs(frame.moonAz - frame.sunAz)).toFixed(2)) + '°' },
                { label: t.elongation, value: formatDMS(frame.elongation).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٩'.indexOf(d)]) },
                { label: 'Moon Orientation', value: formatNum(frame.tilt.toFixed(2)) + '°' },
                { label: 'Moon RA', value: formatRA(moonRaDec.ra) },
                { label: 'Moon Dec', value: formatDec(moonRaDec.dec) },
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
                { label: t.moonAge, value: data.moonAgeHoursTopo !== undefined && data.moonAgeHoursTopo !== null ? formatNum((data.moonAgeHoursTopo + timeOffsetHours).toFixed(2)) + ' h' : '--' },
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
                { label: t.moonAge, value: data.moonAgeHoursGeo !== undefined ? formatNum((data.moonAgeHoursGeo + timeOffsetHours).toFixed(2)) + ' h' : '--' },
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
    }, [frame, stars, skyline, showBuildings, showAdvancedDetails, data, locale, t, viewAz, viewAlt, fov, canvasSize, showOverlay, timeOffset]);


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
