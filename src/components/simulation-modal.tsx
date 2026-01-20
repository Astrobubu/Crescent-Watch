'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { X, Loader2, RefreshCw, ChevronDown, ChevronUp, Download } from 'lucide-react';
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

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [timeOffset, setTimeOffset] = useState(0);
    const [showBuildings, setShowBuildings] = useState(true);
    const [use24Hour, setUse24Hour] = useState(false);

    // Interactive View State
    const [fov, setFov] = useState(50);
    const [viewAz, setViewAz] = useState<number | null>(null); // Null = Auto-track Moon
    const [viewAlt, setViewAlt] = useState<number | null>(null); // Null = Auto
    const dragRef = useRef({ active: false, startX: 0, startY: 0, startAz: 0, startAlt: 0 });
    const [isDragging, setIsDragging] = useState(false);

    // Stars with Az/Alt coordinates (Spherical distribution)
    const [stars] = useState(() => Array.from({ length: 400 }, () => ({
        az: Math.random() * 360,
        alt: Math.random() * 90,
        size: Math.random() * 1.5 + 0.2,
        brightness: Math.random()
    })));

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

        const width = 800;
        const height = 1300; // Increased to fit image
        canvas.width = width;
        canvas.height = height;

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t.visibilityReport, width / 2, 50);

        // Date and Location - FORCE ENGLISH NUMERALS
        ctx.font = '16px Inter, sans-serif';
        ctx.fillStyle = '#a0a0a0';
        const dateStr = data.sunsetIso ? new Date(data.sunsetIso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '--';

        ctx.fillText(dateStr, width / 2, 85);
        ctx.fillText(`${t.latitude}: ${formatNum(data.meta.lat.toFixed(4))}°  |  ${t.longitude}: ${formatNum(data.meta.lon.toFixed(4))}°`, width / 2, 110);

        // Separator
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(50, 130);
        ctx.lineTo(width - 50, 130);
        ctx.stroke();

        // SIMULATION IMAGE
        const simY = 150;
        const simW = 700;
        const simH = 350;
        const sourceCanvas = canvasRef.current;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillText(t.simulation, 50, simY - 10);

        // Draw Image
        ctx.drawImage(sourceCanvas, 50, simY, simW, simH);
        ctx.strokeStyle = '#555';
        ctx.strokeRect(50, simY, simW, simH);

        // Data section
        let y = simY + simH + 50;

        ctx.textAlign = 'left';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.advancedDetails, 50, y);
        y += 30;

        // Helper to draw row
        const drawRow = (label: string, value: string, x: number, lineY: number) => {
            ctx.fillStyle = '#888888';
            ctx.font = '14px Inter, sans-serif';
            ctx.fillText(label + ':', x, lineY);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Inter, monospace';
            ctx.fillText(value, x + 160, lineY);
        };

        const col1X = 50;
        const col2X = 420;

        // Headers for Columns
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(t.geocentric.toUpperCase(), col1X, y);
        ctx.fillText(t.topocentric.toUpperCase(), col2X, y);
        y += 20;

        // Conjunction Time with Western Numerals
        const formatTimeStr = (iso: string | null | undefined) => {
            if (!iso) return '--';
            // Force en-GB to get 0-9 numerals
            return new Date(iso).toLocaleString('en-GB');
        };

        const geoConj = formatTimeStr(data.conjunctionLocalGeo);
        const topoConj = formatTimeStr(data.conjunctionLocalTopo);

        drawRow(t.conjunctionTime, geoConj, col1X, y);
        drawRow(t.conjunctionTime, topoConj, col2X, y);
        y += 30;

        // Moon Age
        // Note: formatMoonAge might return Arabic, need to wrap or modify it. 
        // Assuming formatMoonAge respects locale but we want Western here.
        // We will do a rough replacement or assume updated formatMoonAge.
        const geoAge = data.moonAgeHoursGeo ? formatMoonAge(data.moonAgeHoursGeo).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '--';
        const topoAge = data.moonAgeHoursTopo ? formatMoonAge(data.moonAgeHoursTopo).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '--';

        drawRow(t.moonAge, geoAge, col1X, y);
        drawRow(t.moonAge, topoAge, col2X, y);
        y += 40;

        // Physical Data Header
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('PHYSICAL POSITION (TOPOCENTRIC)', col1X, y);
        y += 20;

        const commonItems = [
            { label: t.moonAltitude, value: `${formatDeg(currentFrame.moonAlt)} (${formatDMS(currentFrame.moonAlt).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])})` },
            { label: t.sunAltitude, value: `${formatDeg(currentFrame.sunAlt)}` },
            { label: t.elongation, value: `${formatDeg(currentFrame.elongation)} (${formatDMS(currentFrame.elongation).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])})` },
            { label: t.moonAzimuth, value: formatDMS(currentFrame.moonAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) },
            { label: t.illumination, value: `${formatNum((currentFrame.illumination * 100).toFixed(1))}%` },
            { label: t.sunsetTime, value: data.sunsetIso ? new Date(data.sunsetIso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '--' },
        ];

        commonItems.forEach((item, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = col === 0 ? col1X : col2X;
            drawRow(item.label, item.value, x, y + row * 30);
        });

        y += Math.ceil(commonItems.length / 2) * 30 + 40;

        // Visibility Analysis Section
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(50, y - 20);
        ctx.lineTo(width - 50, y - 20);
        ctx.stroke();

        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.visibilityAnalysis, 50, y);

        // Simple visibility assessment
        const arcv = currentFrame.moonAlt - currentFrame.sunAlt;
        let visibilityZone = 'D';
        let zoneColor = '#ef4444';
        let zoneText = t.crescentNotVisible;

        if (arcv >= 5.65) {
            visibilityZone = 'A';
            zoneColor = '#22c55e';
            zoneText = t.crescentVisible;
        } else if (arcv >= 2.0) {
            visibilityZone = 'B';
            zoneColor = '#eab308';
            zoneText = t.crescentVisible;
        } else if (arcv >= -0.96) {
            visibilityZone = 'C';
            zoneColor = '#f97316';
            zoneText = t.crescentNotVisible;
        }

        ctx.font = '16px Inter, sans-serif';
        ctx.fillStyle = zoneColor;
        ctx.fillText(`Zone ${visibilityZone}: ${zoneText}`, 50, y + 35);

        // Transcript
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '14px Inter, sans-serif';
        // Note: Using Geocentric age/conjunction for transcript as default or neutral?
        // User wants report to be comprehensive.
        // "Conjunction (Geo): ..., (Topo): ..."
        // I'll keep the transcript simple or update it content-wise.
        const transcript = locale === 'ar'
            ? `عند الغروب، كان ارتفاع القمر ${formatDMS(currentFrame.moonAlt)} وعمره (مركزي): ${formatMoonAge(data.moonAgeHoursGeo || 0)}.`
            : `At sunset, the moon had an altitude of ${formatDMS(currentFrame.moonAlt)}. Moon age (Geocentric): ${formatMoonAge(data.moonAgeHoursGeo || 0)}.`;

        const words = transcript.split(' ');
        let line = '';
        let lineY = y + 70;
        const maxWidth = width - 100;

        words.forEach(word => {
            const testLine = line + word + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth) {
                ctx.fillText(line, 50, lineY);
                line = word + ' ';
                lineY += 22;
            } else {
                line = testLine;
            }
        });
        ctx.fillText(line, 50, lineY);

        // Footer
        ctx.fillStyle = '#444444';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by Crescent Watch | ' + new Date().toISOString().split('T')[0], width / 2, height - 30);

        // Download
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
        return data.trajectory.reduce((prev, curr) =>
            Math.abs(curr.timeOffsetMin - offset) < Math.abs(prev.timeOffsetMin - offset) ? curr : prev
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
    const handleWheel = useCallback((e: React.WheelEvent) => {
        const zoomSpeed = fov / 20; // Scale speed with FOV
        const delta = Math.sign(e.deltaY) * zoomSpeed;
        const newFov = Math.max(10, Math.min(120, fov + delta));
        setFov(newFov);
    }, [fov]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
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

        // Measurements (Line only, NO TEXT)
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;

        if (frame.moonAlt > 0 && moonPos.y < horizonY) {
            // Angle from ground (Altitude)
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.7)';
            ctx.beginPath();
            ctx.moveTo(moonPos.x, moonPos.y + moonRadius + 10);
            ctx.lineTo(moonPos.x, horizonY);
            ctx.stroke();
        }

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

        // Horizon Labels (Compass) & Azimuth Markers
        {
            ctx.font = 'bold 12px Inter, sans-serif';
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
                    ctx.fillText(labels[normalizedAz] || `${normalizedAz}°`, pos.x, pos.y + 8);
                }
            }

            // Specific Azimuth Markers for Sun/Moon (Clipped to Horizon)
            const drawAzMarker = (az: number, label: string, color: string) => {
                const pos = toScreen(az, 0);
                // Check if on screen horizontally
                if (pos.x > 20 && pos.x < W - 20) {
                    ctx.fillStyle = color;
                    // Marker on horizon
                    ctx.fillRect(pos.x - 1, pos.y - 12, 2, 12);

                    // Label above horizon
                    ctx.font = 'bold 11px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = color;
                    // Ensure text doesn't overlap excessively?
                    ctx.fillText(label, pos.x, pos.y - 24);
                }
            };

            drawAzMarker(frame.moonAz, 'Moon Az', '#ffffff');
            drawAzMarker(frame.sunAz, 'Sun Az', '#ffcc00');
        }

        // Advanced Details Overlay
        if (showAdvancedDetails && data) {
            // Helper for Local Time (Approximation using Longitude)
            const formatLocalTime = (isoDateStr: string | null | undefined) => {
                if (!isoDateStr) return '--';
                const d = new Date(isoDateStr);
                const offsetHours = data.meta.lon / 15; // 15 degrees per hour
                const localDate = new Date(d.getTime() + offsetHours * 3600000);

                const h = localDate.getUTCHours();
                const m = localDate.getUTCMinutes();
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;

                return use24Hour
                    ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
                    : `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
            };

            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;

            // 1. Header Info (Top Left)
            const padding = 20;
            let lineY = padding;
            const lineHeight = 16;

            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.fillText(t.visibilityAnalysis, padding, lineY);
            lineY += lineHeight * 1.5;

            ctx.font = '12px Inter, sans-serif';
            // Type of Moon (Waxing Crescent etc) - inferred
            const moonPhaseName = frame.illumination < 0.01 ? t.newMoon : t.waxingCrescent;
            ctx.fillText(moonPhaseName, padding, lineY);
            lineY += lineHeight;

            // Date
            const dateStr = new Date(data.sunsetIso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
            });
            ctx.fillText(dateStr, padding, lineY);
            lineY += lineHeight;

            // Location Name (if available) or generic
            if (data.meta.locationName) {
                ctx.fillText(data.meta.locationName, padding, lineY);
                lineY += lineHeight;
            }

            // Lat/Lon
            ctx.fillText(`${t.longitude}: ${formatCoordinate(data.meta.lon)}`, padding, lineY);
            lineY += lineHeight;
            ctx.fillText(`${t.latitude}: ${formatCoordinate(data.meta.lat)}`, padding, lineY);
            lineY += lineHeight * 1.5;

            // Conjunction Time
            ctx.fillText(`${t.conjunctionTime}:`, padding, lineY);
            lineY += lineHeight;
            const conjTime = data.conjunctionLocal ? new Date(data.conjunctionLocal).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: !use24Hour, timeZone: 'UTC'
            }) : '--';
            ctx.fillText(`${conjTime} LT`, padding, lineY);

            // 2. Moon Labels
            if (moonPos.y > 0 && moonPos.y < H) {
                // Arrow pointing to Moon
                const arrowLen = 30;
                const moonTopY = moonPos.y - moonRadius - 10;

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(moonPos.x, moonTopY - arrowLen);
                ctx.lineTo(moonPos.x, moonTopY);
                ctx.stroke();

                // Arrowhead
                ctx.beginPath();
                ctx.moveTo(moonPos.x - 4, moonTopY - 8);
                ctx.lineTo(moonPos.x, moonTopY);
                ctx.lineTo(moonPos.x + 4, moonTopY - 8);
                ctx.stroke();

                // Labels
                // Moon Altitude
                const moonAltText = `${t.moonAltitude}: ${formatDMS(frame.moonAlt)}`;
                const moonAgeText = `${t.moonAge}: ${data.moonAgeHours ? formatMoonAge(data.moonAgeHours) : (frame.moonAge ? formatMoonAge(frame.moonAge) : '--')}`;

                ctx.fillStyle = '#ffffff';
                ctx.fillText(moonAltText, moonPos.x + 10, moonTopY - arrowLen);
                ctx.fillText(moonAgeText, moonPos.x + 10, moonTopY - arrowLen + 14);
            }

            // 3. Sky Body Lines (Elongation)
            const sunScreenPos = toScreen(frame.sunAz, frame.sunAlt);

            // Ensure Sun is somewhat reasonable to draw line to
            if (sunScreenPos.y > -1000 && sunScreenPos.y < H + 1000) {
                ctx.strokeStyle = '#aaaaaa';
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.moveTo(sunScreenPos.x, sunScreenPos.y);
                ctx.lineTo(moonPos.x, moonPos.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Label on line midpoint
                const midX = (sunScreenPos.x + moonPos.x) / 2;
                const midY = (sunScreenPos.y + moonPos.y) / 2;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`${t.elongation}`, midX, midY - 15);
                ctx.fillText(`${formatDMS(frame.elongation)}`, midX, midY);
                ctx.textAlign = 'left';
            }

            // 4. Horizon Labels (Azimuths & Set Times)
            const azLabelY = H - 30;

            const moonAzX = moonPos.x;
            const sunAzX = sunScreenPos.x;

            // Detect collision between Moon and Sun labels
            // Threshold of ~140px ensures they don't touch
            const overlap = Math.abs(moonAzX - sunAzX) < 140;

            // Stagger labels if overlapping
            // Moon goes UP, Sun stays or goes DOWN
            const moonLabelY = overlap ? azLabelY - 25 : azLabelY;
            const sunLabelY = overlap ? azLabelY + 25 : azLabelY;

            // Moon Azimuth
            ctx.beginPath();
            ctx.moveTo(moonAzX, H);
            ctx.lineTo(moonAzX, H - 5);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            // Draw Moon Azimuth Text
            ctx.fillText(`${t.moonAzimuth}`, moonAzX, moonLabelY - 15);
            ctx.fillText(`${formatDMS(frame.moonAz)}`, moonAzX, moonLabelY);

            // Sun Azimuth (only if on screen)
            if (sunAzX > -50 && sunAzX < W + 50) {
                ctx.beginPath();
                ctx.moveTo(sunAzX, H);
                ctx.lineTo(sunAzX, H - 5);
                ctx.stroke();

                ctx.fillText(`${t.sunAzimuth}`, sunAzX, sunLabelY - 15);
                ctx.fillText(`${formatDMS(frame.sunAz)}`, sunAzX, sunLabelY);
            }

            // Sunset/Moonset Times - Place near horizon
            const timeLabelY = horizonY + 20; // Just below water line

            // Use formatLocalTime for times
            // Sunset (at Sun X)
            if (sunAzX > -50 && sunAzX < W + 50) {
                ctx.fillStyle = '#ffcc00';
                ctx.textAlign = 'center';
                const timeStr = formatLocalTime(data.sunsetIso);
                ctx.fillText(t.sunsetTime, sunAzX, timeLabelY);
                ctx.fillText(timeStr, sunAzX, timeLabelY + 15);
            }

            // Moonset (at Moon X)
            if (moonAzX > -50 && moonAzX < W + 50) {
                ctx.fillStyle = '#dddddd';
                ctx.textAlign = 'center';
                // Stack moonset text if azimuths are close OR if set times labels might collide
                const overlap = Math.abs(moonAzX - sunAzX) < 100; // Recalculate or reuse overlap

                const timeStr = formatLocalTime(data.moonsetIso);
                // If overlap, push WAY down to avoid the Sunset label we just drew
                const yBase = overlap ? timeLabelY + 40 : timeLabelY;

                ctx.fillText(t.moonsetTime, moonAzX, yBase);
                ctx.fillText(timeStr, moonAzX, yBase + 15);
            }

        }

    }, [frame, stars, skyline, showBuildings, showAdvancedDetails, data, locale, t, viewAz, viewAlt, fov, canvasSize]);

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
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-6">
            <div className="relative w-full max-w-6xl bg-card border rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] md:max-h-[800px]">

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
                    <div className="flex items-center gap-2 text-sm bg-background p-1.5 rounded-xl border shadow-sm w-full md:w-auto self-start">
                        <span className="text-muted-foreground pl-2 text-xs uppercase tracking-wider whitespace-nowrap">{t.latitude}:</span>
                        <Input
                            className="flex-1 min-w-0 h-8 text-xs font-mono border-0 focus-visible:ring-0 px-1 bg-transparent"
                            value={editLat}
                            onChange={e => setEditLat(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateLocation()}
                            onBlur={handleUpdateLocation}
                        />
                        <div className="w-px h-4 bg-muted shrink-0" />
                        <span className="text-muted-foreground pl-2 text-xs uppercase tracking-wider whitespace-nowrap">{t.longitude}:</span>
                        <Input
                            className="flex-1 min-w-0 h-8 text-xs font-mono border-0 focus-visible:ring-0 px-1 bg-transparent"
                            value={editLon}
                            onChange={e => setEditLon(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateLocation()}
                            onBlur={handleUpdateLocation}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7 ml-1 shrink-0" onClick={handleUpdateLocation}>
                            <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                    </div>

                    {/* Advanced Details Toggle */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-xs gap-1"
                            onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                        >
                            {showAdvancedDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {showAdvancedDetails ? t.hideDetails : t.showDetails}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-xs gap-1"
                            onClick={() => handleDownloadReport(frame)}
                        >
                            <Download className="w-3 h-3" />
                            {t.downloadReport}
                        </Button>
                    </div>

                    {/* Advanced Details Panel */}
                    {showAdvancedDetails && data && frame && (
                        <div className="bg-background/50 rounded-xl border p-4 grid grid-cols-2 md:grid-cols-3 gap-6 text-xs max-h-[300px] overflow-y-auto no-scrollbar">
                            {/* Geocentric Data */}
                            <div className="space-y-3">
                                <div className="font-semibold text-muted-foreground border-b pb-1">{t.geocentric}</div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px]">{t.conjunctionTime}</div>
                                    <div className="font-mono">
                                        {formatTimeStr(data.conjunctionLocalGeo)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px]">{t.moonAge}</div>
                                    <div className="font-mono">
                                        {data.moonAgeHoursGeo !== undefined ? formatNum(data.moonAgeHoursGeo.toFixed(2)) + ' h' : '--'}
                                    </div>
                                </div>
                            </div>

                            {/* Topocentric Data */}
                            <div className="space-y-3">
                                <div className="font-semibold text-muted-foreground border-b pb-1">{t.topocentric}</div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px]">{t.conjunctionTime}</div>
                                    <div className="font-mono">
                                        {formatTimeStr(data.conjunctionLocalTopo)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground uppercase text-[10px]">{t.moonAge}</div>
                                    <div className="font-mono">
                                        {data.moonAgeHoursTopo !== undefined && data.moonAgeHoursTopo !== null ? formatNum(data.moonAgeHoursTopo.toFixed(2)) + ' h' : '--'}
                                    </div>
                                </div>
                            </div>

                            {/* Physical / Observation Data */}
                            <div className="space-y-3">
                                <div className="font-semibold text-muted-foreground border-b pb-1">{t.observation}</div>
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.moonAzimuth}</span>
                                        <span className="font-mono" dir="ltr">{formatDMS(frame.moonAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.sunAzimuth}</span>
                                        <span className="font-mono" dir="ltr">{formatDMS(frame.sunAz).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.moonAltitude}</span>
                                        <span className="font-mono" dir="ltr">{formatDMS(frame.moonAlt).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.elongation}</span>
                                        <span className="font-mono" dir="ltr">{formatDMS(frame.elongation).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">{t.illumination}</span>
                                        <span className="font-mono" dir="ltr">{formatNum((frame.illumination * 100).toFixed(1))}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
                    <div
                        className="relative w-full flex-1 min-h-[400px] touch-none cursor-move group"
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
                            Drag to Pan • Scroll to Zoom
                        </div>
                    </div>

                    {/* Controls Footer - Distinct section, no overlap */}
                    <div className="relative w-full bg-card text-foreground z-20 border-t p-3 md:p-4 shrink-0">
                        <div className="flex flex-col gap-4 md:gap-4 max-w-5xl mx-auto">
                            {/* Top row: Time + Slider + Checkbox */}
                            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                                <div className="flex items-center justify-between">
                                    <div className="font-mono text-xl w-24 text-center md:text-left">{currentTime ? formatTime(currentTime) : '--:--'}</div>
                                    <div className="flex items-center gap-2 md:hidden">
                                        <Checkbox id="build-mobile" checked={showBuildings} onCheckedChange={c => setShowBuildings(!!c)} />
                                        <Label htmlFor="build-mobile" className="text-xs">{t.showBuildings}</Label>
                                    </div>
                                </div>

                                <Slider
                                    value={[timeOffset]}
                                    onValueChange={([v]) => setTimeOffset(v)}
                                    max={75}
                                    step={1}
                                    className="flex-1 py-1"
                                />

                                <div className="hidden md:flex items-center gap-2">
                                    <Checkbox id="build" checked={showBuildings} onCheckedChange={c => setShowBuildings(!!c)} className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-black" />
                                    <Label htmlFor="build" className="text-xs text-white/70">{t.showBuildings}</Label>
                                </div>
                            </div>

                            {/* Bottom row: Data Grid - Condensed on mobile */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-y-2 gap-x-4 text-sm">
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.moonAltitude}</div>
                                    <div className="font-mono" dir="ltr">{formatNum((frame?.moonAlt ?? 0).toFixed(2))}°</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.sunAltitude}</div>
                                    <div className="font-mono" dir="ltr">{formatNum((frame?.sunAlt ?? 0).toFixed(2))}°</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.elongation}</div>
                                    <div className="font-mono" dir="ltr">{formatNum((frame?.elongation ?? 0).toFixed(2))}°</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.illumination}</div>
                                    <div className="font-mono" dir="ltr">{formatNum((frame ? frame.illumination * 100 : 0).toFixed(1))}%</div>
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.azimuthDiff}</div>
                                    <div className="font-mono" dir="ltr">{formatNum((frame ? Math.abs(frame.moonAz - frame.sunAz) : 0).toFixed(2))}°</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
