'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { X, Loader2, RefreshCw } from 'lucide-react';
import { getTranslations, Locale, isRTL } from '@/lib/i18n';

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
    trajectory: SimulationPoint[];
    meta: {
        lat: number;
        lon: number;
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
    buildings.push({ type: 'tower', x: leftCenter + 50, w: 30, h: 160 });
    buildings.push({ type: 'emirates', x: leftCenter + 90, w: 40, h: 220 }); // Emirates towers-ish

    // Right Cluster (Burj Al Arab & Marina)
    // Center of cluster around 85% width
    const rightCenter = width * 0.85;

    // Burj Al Arab
    buildings.push({ type: 'arab', x: rightCenter, w: 80, h: 200 });

    // Marina / Jumeirah Gate style
    buildings.push({ type: 'frame', x: rightCenter - 80, w: 60, h: 150 }); // Frame-ish? Or Gate
    buildings.push({ type: 'tower', x: rightCenter + 60, w: 35, h: 190 }); // Straight tower instead of twist
    buildings.push({ type: 'tower', x: rightCenter + 100, w: 40, h: 130 });

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
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 400 });

    const [editLat, setEditLat] = useState('');
    const [editLon, setEditLon] = useState('');

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

    // Stars & Skyline
    const stars = useMemo(() => {
        if (!data) return [];
        return generateStars(100, Math.floor(data.meta.lat * 1000 + data.meta.lon * 100));
    }, [data]);

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

    // Draw simulation
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !frame) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        const horizonY = H * 0.75;

        // Sky gradient
        const sunAlt = frame.sunAlt;
        const grad = ctx.createLinearGradient(0, 0, 0, H);

        if (sunAlt > 0) {
            grad.addColorStop(0, '#4a90d9');
            grad.addColorStop(0.5, '#87CEEB');
            grad.addColorStop(1, '#f0e68c');
        } else if (sunAlt > -6) {
            grad.addColorStop(0, '#1a2a4a');
            grad.addColorStop(0.3, '#2d4a6a');
            grad.addColorStop(0.6, '#8b6a4a');
            grad.addColorStop(0.85, '#ff8866');
            grad.addColorStop(1, '#ffaa77');
        } else if (sunAlt > -12) {
            grad.addColorStop(0, '#0a1628');
            grad.addColorStop(0.5, '#1a3050');
            grad.addColorStop(1, '#3a5070');
        } else if (sunAlt > -18) {
            grad.addColorStop(0, '#050a15');
            grad.addColorStop(1, '#0f1a2a');
        } else {
            grad.addColorStop(0, '#020510');
            grad.addColorStop(1, '#0a0f1a');
        }

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars
        if (sunAlt < -6) {
            const starAlpha = Math.min(1, (-sunAlt - 6) / 12);
            stars.forEach(star => {
                ctx.beginPath();
                ctx.arc(star.x * W, star.y * H, star.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness * starAlpha})`;
                ctx.fill();
            });
        }

        const FOV = 50;
        const pxPerDeg = W / FOV;
        const centerAz = frame.sunAz;

        const toScreen = (az: number, alt: number) => {
            let dAz = az - centerAz;
            while (dAz > 180) dAz -= 360;
            while (dAz < -180) dAz += 360;

            const x = W / 2 + dAz * pxPerDeg;
            const y = horizonY - alt * pxPerDeg;
            return { x, y };
        };

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

        // Measurements
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;

        if (frame.moonAlt > 0 && moonPos.y < horizonY) {
            // Angle from ground (Altitude)
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.7)';
            ctx.beginPath();
            ctx.moveTo(moonPos.x, moonPos.y + moonRadius + 10);
            ctx.lineTo(moonPos.x, horizonY);
            ctx.stroke();

            // Explicit Label
            ctx.fillStyle = '#64c8ff';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'left';
            const textY = (moonPos.y + horizonY) / 2;

            // Adjust label position to avoid overlap
            // If very low, put it above or to side?
            // "Angle from ground"
            ctx.fillText(`${frame.moonAlt.toFixed(1)}°`, moonPos.x + 8, textY);
        }

        // Ground
        ctx.setLineDash([]);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, horizonY, W, H - horizonY);

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

            skyline.forEach(b => {
                let bx = b.x * s;
                const bw = b.w * s;
                const bh = b.h * s;
                const by = horizonY - bh;

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

                // Add some random lights/windows if needed? "Rough silhouette" usually implies solid.
            });
        }

    }, [frame, stars, skyline, showBuildings]);

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
                </div>

                {/* Canvas Area with Responsive Layout - Scrollable content area on mobile */}
                {/* Desktop: Force min-h to prevent collapse (empty view fix) */}
                <div className="relative w-full bg-black flex flex-col md:flex-1 md:block md:min-h-[500px] overflow-y-auto md:overflow-hidden" ref={containerRef}>
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center text-white gap-2 z-10 pointer-events-none">
                            <Loader2 className="animate-spin" /> {t.calculating}
                        </div>
                    )}

                    {/* Fixed Height Canvas on Mobile (250px), Full/Absolute on Desktop */}
                    <div className="relative w-full h-[250px] shrink-0 md:h-full md:absolute md:inset-0">
                        <canvas ref={canvasRef} className="block w-full h-full" />
                    </div>

                    {/* Controls Overlay - Stacked Below on Mobile, Overlay on Desktop */}
                    <div className="relative w-full bg-card text-foreground z-20 md:absolute md:bottom-0 md:left-0 md:right-0 md:bg-black/60 md:backdrop-blur-sm md:text-white md:border-t md:border-white/10 p-4 shrink-0">
                        <div className="flex flex-col gap-4 max-w-5xl mx-auto">
                            {/* Top row: Time + Slider + Checkbox */}
                            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
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
                                    className="flex-1 py-2"
                                />

                                <div className="hidden md:flex items-center gap-2">
                                    <Checkbox id="build" checked={showBuildings} onCheckedChange={c => setShowBuildings(!!c)} className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-black" />
                                    <Label htmlFor="build" className="text-xs text-white/70">{t.showBuildings}</Label>
                                </div>
                            </div>

                            {/* Bottom row: Data Grid - Responsive Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-y-3 gap-x-4 text-sm">
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.moonAltitude}</div>
                                    <div className="font-mono">{frame?.moonAlt.toFixed(2)}°</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.sunAltitude}</div>
                                    <div className="font-mono">{frame?.sunAlt.toFixed(2)}°</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.elongation}</div>
                                    <div className="font-mono">{frame?.elongation.toFixed(2)}°</div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.illumination}</div>
                                    <div className="font-mono">{(frame ? frame.illumination * 100 : 0).toFixed(1)}%</div>
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <div className="text-[10px] text-muted-foreground md:text-white/50 uppercase">{t.azimuthDiff}</div>
                                    <div className="font-mono">{frame ? Math.abs(frame.moonAz - frame.sunAz).toFixed(2) : 0}°</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
