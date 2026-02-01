'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { getTranslations, Locale, isRTL } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// Report section configuration
interface ReportSection {
    id: string;
    name: string;
    nameAr: string;
    enabled: boolean;
}

// Report configuration
interface ReportConfig {
    aspectRatio: '9:16' | '3:4' | '1:1' | '4:3' | 'a4';
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    showHeader: boolean;
    headerTitle: string;
    showDate: boolean;
    showLocation: boolean;
    showSimulation: boolean;
    simulationBorder: boolean;
    sections: ReportSection[];
    showFooter: boolean;
    showHandImage: boolean;
}

const DEFAULT_CONFIG: ReportConfig = {
    aspectRatio: '9:16',
    backgroundColor: '#1a1a2e',
    textColor: '#ffffff',
    accentColor: '#4a90d9',
    showHeader: true,
    headerTitle: '', // Will use translation fallback
    showDate: true,
    showLocation: true,
    showSimulation: true,
    simulationBorder: true,
    sections: [
        { id: 'conjunction', name: 'Conjunction', nameAr: 'الاقتران', enabled: true },
        { id: 'moonAge', name: 'Moon Age', nameAr: 'عمر القمر', enabled: true },
        { id: 'altitude', name: 'Altitude', nameAr: 'الارتفاع', enabled: true },
        { id: 'elongation', name: 'Elongation', nameAr: 'الاستطالة', enabled: true },
        { id: 'illumination', name: 'Illumination', nameAr: 'الإضاءة', enabled: true },
        { id: 'times', name: 'Set Times', nameAr: 'أوقات الغروب', enabled: true },
        { id: 'lagTime', name: 'Lag Time', nameAr: 'وقت التأخير', enabled: true },
        { id: 'azimuth', name: 'Azimuths', nameAr: 'السمت', enabled: true },
        { id: 'tilt', name: 'Tilt', nameAr: 'الميل', enabled: true },
    ],
    showFooter: true,
    showHandImage: true,
};

// Color presets
const COLOR_PRESETS = {
    backgrounds: ['#1a1a2e', '#0d1117', '#1e1e1e', '#0f172a', '#18181b', '#1c1917', '#14532d', '#7c2d12'],
    texts: ['#ffffff', '#f8fafc', '#e2e8f0', '#d1d5db', '#fef3c7', '#bef264', '#93c5fd', '#fda4af'],
    accents: ['#4a90d9', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'],
};

const STORAGE_KEY = 'crescent-report-config';

// Color picker component - Mobile optimized
function ColorPicker({
    value,
    onChange,
    presets,
    label
}: {
    value: string;
    onChange: (v: string) => void;
    presets: string[];
    label: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div ref={ref} className="relative flex-1 min-w-[100px]">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 w-full"
            >
                <div
                    className="w-5 h-5 rounded border border-white/20 flex-shrink-0"
                    style={{ backgroundColor: value }}
                />
                <span className="text-xs text-white/70 truncate">{label}</span>
                <ChevronDown className="w-3 h-3 text-white/50 ml-auto flex-shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-zinc-900 rounded-xl border border-white/10 shadow-2xl z-50">
                    <div className="grid grid-cols-4 gap-2 mb-3">
                        {presets.map((color) => (
                            <button
                                key={color}
                                onClick={() => { onChange(color); setIsOpen(false); }}
                                className={cn(
                                    "w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 mx-auto",
                                    value === color ? "border-white" : "border-transparent"
                                )}
                                style={{ backgroundColor: color }}
                            >
                                {value === color && <Check className="w-3 h-3 text-white mx-auto" />}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                        <input
                            type="color"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 flex-shrink-0"
                        />
                        <Input
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="flex-1 h-8 text-xs bg-white/5 border-white/10"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// Aspect ratio selector - Mobile optimized
function AspectRatioSelector({
    value,
    onChange,
    t
}: {
    value: string;
    onChange: (v: ReportConfig['aspectRatio']) => void;
    t: { mobile: string; standard: string; fullReport: string };
}) {
    const options = [
        { value: '9:16', label: '9:16', desc: t.mobile },
        { value: '1:1', label: '1:1', desc: 'Insta' },
        { value: '4:3', label: '4:3', desc: t.standard },
        { value: 'a4', label: 'A4', desc: t.fullReport },
    ];

    return (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value as ReportConfig['aspectRatio'])}
                    className={cn(
                        "flex flex-col items-center p-2 sm:p-3 rounded-lg sm:rounded-xl border-2 transition-all",
                        value === opt.value
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                >
                    <span className="text-sm sm:text-lg font-bold text-white">{opt.label}</span>
                    <span className="text-[10px] sm:text-xs text-white/50">{opt.desc}</span>
                </button>
            ))}
        </div>
    );
}

// Toggle row component
function ToggleRow({
    label,
    checked,
    onChange
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-3 py-1.5">
            <Switch checked={checked} onCheckedChange={onChange} className="scale-90" />
            <span className="text-sm text-white/80">{label}</span>
        </div>
    );
}

export default function ReportEditorPage() {
    const [locale, setLocale] = useState<Locale>('en');
    const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);
    const [hasChanges, setHasChanges] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const t = getTranslations(locale);
    const isArabic = locale === 'ar';

    // Load saved config and locale
    useEffect(() => {
        const savedLocale = localStorage.getItem('crescent-locale') as Locale;
        if (savedLocale && (savedLocale === 'en' || savedLocale === 'ar')) {
            setLocale(savedLocale);
        }

        const savedConfig = localStorage.getItem(STORAGE_KEY);
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                setConfig({ ...DEFAULT_CONFIG, ...parsed });
            } catch (e) {
                console.error('Failed to parse saved config:', e);
            }
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
        }
    }, []);

    const updateConfig = <K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const toggleSection = (sectionId: string) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s =>
                s.id === sectionId ? { ...s, enabled: !s.enabled } : s
            )
        }));
        setHasChanges(true);
    };

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        setHasChanges(false);
    };

    const handleReset = () => {
        if (confirm(t.resetConfirm)) {
            setConfig(DEFAULT_CONFIG);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
            setHasChanges(false);
        }
    };

    // Preview dimensions based on aspect ratio - LARGER for better visibility
    const getPreviewDimensions = () => {
        const maxWidth = 320;
        switch (config.aspectRatio) {
            case '9:16': return { width: maxWidth, height: maxWidth * (16/9) };
            case '1:1': return { width: maxWidth, height: maxWidth };
            case '4:3': return { width: maxWidth, height: maxWidth * (3/4) };
            case 'a4': return { width: maxWidth, height: maxWidth * 1.414 };
            default: return { width: maxWidth, height: maxWidth * (16/9) };
        }
    };

    const previewDims = getPreviewDimensions();

    return (
        <div className="min-h-screen bg-zinc-950" dir={isArabic ? 'rtl' : 'ltr'}>
            {/* Header - Mobile optimized */}
            <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/95 backdrop-blur safe-area-top">
                <div className="flex h-12 sm:h-14 items-center justify-between px-3 sm:px-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="icon" className="rounded-full text-white/70 hover:text-white hover:bg-white/10 h-8 w-8 sm:h-10 sm:w-10">
                                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                        </Link>
                        <h1 className="text-sm sm:text-lg font-semibold text-white">
                            {t.reportEditor}
                        </h1>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReset}
                            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white h-8 px-2 sm:px-3 text-xs"
                        >
                            <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                            <span className="hidden sm:inline">{t.reset}</span>
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!hasChanges}
                            className={cn(
                                "h-8 px-2 sm:px-3 text-xs transition-all",
                                hasChanges ? "bg-blue-600 hover:bg-blue-700" : "bg-white/10 text-white/50"
                            )}
                        >
                            <Save className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                            <span className="hidden sm:inline">{t.save}</span>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="flex flex-col lg:flex-row max-w-7xl mx-auto pb-20 lg:pb-6">
                {/* Controls Panel - Scrollable on mobile */}
                <div className="flex-1 p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 lg:max-w-xl overflow-y-auto">

                    {/* Aspect Ratio */}
                    <section>
                        <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2 sm:mb-3">
                            {t.reportSize}
                        </h2>
                        <AspectRatioSelector
                            value={config.aspectRatio}
                            onChange={(v) => updateConfig('aspectRatio', v)}
                            t={{ mobile: t.mobile, standard: t.standard, fullReport: t.fullReport }}
                        />
                    </section>

                    {/* Colors - Responsive grid */}
                    <section>
                        <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2 sm:mb-3">
                            {t.colors}
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            <ColorPicker
                                value={config.backgroundColor}
                                onChange={(v) => updateConfig('backgroundColor', v)}
                                presets={COLOR_PRESETS.backgrounds}
                                label={t.background}
                            />
                            <ColorPicker
                                value={config.textColor}
                                onChange={(v) => updateConfig('textColor', v)}
                                presets={COLOR_PRESETS.texts}
                                label={t.text}
                            />
                            <ColorPicker
                                value={config.accentColor}
                                onChange={(v) => updateConfig('accentColor', v)}
                                presets={COLOR_PRESETS.accents}
                                label={t.accent}
                            />
                        </div>
                    </section>

                    {/* Toggles - Compact layout */}
                    <section className="space-y-0.5 border-t border-white/10 pt-3 sm:pt-4">
                        <ToggleRow
                            label={t.header}
                            checked={config.showHeader}
                            onChange={(v) => updateConfig('showHeader', v)}
                        />
                        {config.showHeader && (
                            <div className="pl-8 sm:pl-10 pb-2 space-y-2">
                                <Input
                                    value={config.headerTitle}
                                    onChange={(e) => updateConfig('headerTitle', e.target.value)}
                                    placeholder={t.reportTitle}
                                    className="bg-white/5 border-white/10 text-white h-8 text-sm"
                                />
                                <div className="flex gap-3 sm:gap-4">
                                    <label className="flex items-center gap-1.5 text-xs text-white/60">
                                        <input
                                            type="checkbox"
                                            checked={config.showDate}
                                            onChange={(e) => updateConfig('showDate', e.target.checked)}
                                            className="rounded w-3 h-3"
                                        />
                                        {t.date}
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs text-white/60">
                                        <input
                                            type="checkbox"
                                            checked={config.showLocation}
                                            onChange={(e) => updateConfig('showLocation', e.target.checked)}
                                            className="rounded w-3 h-3"
                                        />
                                        {t.location}
                                    </label>
                                </div>
                            </div>
                        )}

                        <ToggleRow
                            label={t.simulation}
                            checked={config.showSimulation}
                            onChange={(v) => updateConfig('showSimulation', v)}
                        />

                        <ToggleRow
                            label={t.handImage}
                            checked={config.showHandImage}
                            onChange={(v) => updateConfig('showHandImage', v)}
                        />

                        <ToggleRow
                            label={t.footer}
                            checked={config.showFooter}
                            onChange={(v) => updateConfig('showFooter', v)}
                        />
                    </section>

                    {/* Data Sections - Responsive grid */}
                    <section className="border-t border-white/10 pt-3 sm:pt-4">
                        <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-2 sm:mb-3">
                            {t.dataSections}
                        </h2>
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                            {config.sections.map((section) => (
                                <button
                                    key={section.id}
                                    onClick={() => toggleSection(section.id)}
                                    className={cn(
                                        "px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all border truncate",
                                        section.enabled
                                            ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                    )}
                                >
                                    {isArabic ? section.nameAr : section.name}
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Live Preview Panel - Hidden on mobile by default, shown as overlay */}
                <div className="hidden lg:flex flex-1 p-4 lg:p-6 lg:border-l border-white/10 flex-col items-center sticky top-14">
                    <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-4 self-start">
                        {t.preview}
                    </h2>

                    <div
                        className="rounded-2xl overflow-hidden shadow-2xl transition-all duration-300"
                        style={{
                            width: previewDims.width,
                            height: Math.min(previewDims.height, 550),
                            backgroundColor: config.backgroundColor,
                        }}
                    >
                        {/* Preview Content */}
                        <div className="h-full flex flex-col p-4 overflow-hidden" style={{ color: config.textColor }}>
                            {/* Header */}
                            {config.showHeader && (
                                <div className="text-center mb-3 flex-shrink-0">
                                    <h3 className="text-base font-bold truncate">{config.headerTitle || t.visibilityReport}</h3>
                                    {(config.showDate || config.showLocation) && (
                                        <p className="text-xs opacity-60 truncate mt-1">
                                            {config.showDate && '29 Jumada I 1447'}
                                            {config.showDate && config.showLocation && ' • '}
                                            {config.showLocation && 'Dubai, UAE'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Simulation Image */}
                            {config.showSimulation && (
                                <div
                                    className={cn(
                                        "relative flex-shrink-0 mx-auto mb-3 bg-gradient-to-b from-orange-900/40 via-purple-900/40 to-indigo-900/50 flex items-end justify-center overflow-hidden",
                                        config.simulationBorder && "border-2 rounded-lg"
                                    )}
                                    style={{
                                        width: '95%',
                                        height: 120,
                                        borderColor: config.simulationBorder ? config.accentColor + '40' : 'transparent'
                                    }}
                                >
                                    {/* Horizon line */}
                                    <div className="absolute bottom-8 left-0 right-0 h-px bg-white/40" />

                                    {/* Moon */}
                                    <div
                                        className="absolute rounded-full shadow-lg"
                                        style={{
                                            width: 20,
                                            height: 20,
                                            bottom: 40,
                                            left: '55%',
                                            background: `radial-gradient(circle at 70% 40%, #fffde7 0%, #fdd835 100%)`,
                                            boxShadow: '0 0 15px rgba(255,253,231,0.6)'
                                        }}
                                    />

                                    {/* City silhouette */}
                                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-black/90" />
                                </div>
                            )}

                            {/* Hand Measurement Image */}
                            {config.showHandImage && (
                                <div className="flex-shrink-0 mx-auto mb-3 w-[95%] h-16 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/measuring-sky-with-hand.png"
                                        alt="Hand measurement"
                                        className="h-full w-auto object-contain opacity-70"
                                    />
                                </div>
                            )}

                            {/* Data Sections */}
                            <div className="flex-1 overflow-hidden">
                                <div className="grid grid-cols-2 gap-2">
                                    {config.sections.filter(s => s.enabled).slice(0, 6).map((section) => (
                                        <div
                                            key={section.id}
                                            className="rounded-lg px-3 py-2"
                                            style={{ backgroundColor: config.accentColor + '20' }}
                                        >
                                            <div className="text-[10px] opacity-60 truncate">
                                                {isArabic ? section.nameAr : section.name}
                                            </div>
                                            <div className="text-sm font-semibold">--</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            {config.showFooter && (
                                <div className="text-center mt-3 flex-shrink-0">
                                    <p className="text-[10px] opacity-50">{t.generatedBy}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-white/40 mt-4 text-center max-w-xs">
                        {t.saveSettingsHint}
                    </p>
                </div>

                {/* Mobile Preview Toggle Button */}
                <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="lg:hidden fixed bottom-4 right-4 z-40 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium"
                >
                    {showPreview ? t.hide : t.preview}
                </button>

                {/* Mobile Preview Overlay */}
                {showPreview && (
                    <div className="lg:hidden fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
                        <div
                            className="rounded-2xl overflow-hidden shadow-2xl max-w-[90vw] max-h-[85vh] overflow-y-auto"
                            style={{
                                width: previewDims.width,
                                backgroundColor: config.backgroundColor,
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-col p-4" style={{ color: config.textColor }}>
                                {/* Header */}
                                {config.showHeader && (
                                    <div className="text-center mb-3 flex-shrink-0">
                                        <h3 className="text-base font-bold truncate">{config.headerTitle || t.visibilityReport}</h3>
                                        {(config.showDate || config.showLocation) && (
                                            <p className="text-xs opacity-60 truncate mt-1">
                                                {config.showDate && '29 Jumada I 1447'}
                                                {config.showDate && config.showLocation && ' • '}
                                                {config.showLocation && 'Dubai, UAE'}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Simulation */}
                                {config.showSimulation && (
                                    <div
                                        className={cn(
                                            "relative flex-shrink-0 mx-auto mb-3 bg-gradient-to-b from-orange-900/40 via-purple-900/40 to-indigo-900/50 overflow-hidden",
                                            config.simulationBorder && "border-2 rounded-lg"
                                        )}
                                        style={{
                                            width: '95%',
                                            height: 120,
                                            borderColor: config.simulationBorder ? config.accentColor + '40' : 'transparent'
                                        }}
                                    >
                                        <div className="absolute bottom-8 left-0 right-0 h-px bg-white/40" />
                                        <div
                                            className="absolute rounded-full"
                                            style={{
                                                width: 20, height: 20, bottom: 40, left: '55%',
                                                background: `radial-gradient(circle at 70% 40%, #fffde7 0%, #fdd835 100%)`,
                                                boxShadow: '0 0 15px rgba(255,253,231,0.6)'
                                            }}
                                        />
                                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-black/90" />
                                    </div>
                                )}

                                {/* Hand Image */}
                                {config.showHandImage && (
                                    <div className="flex-shrink-0 mx-auto mb-3 w-[95%] h-20 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src="/measuring-sky-with-hand.png"
                                            alt="Hand measurement"
                                            className="h-full w-auto object-contain opacity-70"
                                        />
                                    </div>
                                )}

                                {/* Data */}
                                <div className="grid grid-cols-2 gap-2">
                                    {config.sections.filter(s => s.enabled).slice(0, 6).map((section) => (
                                        <div
                                            key={section.id}
                                            className="rounded-lg px-3 py-2"
                                            style={{ backgroundColor: config.accentColor + '20' }}
                                        >
                                            <div className="text-[10px] opacity-60 truncate">{isArabic ? section.nameAr : section.name}</div>
                                            <div className="text-sm font-semibold">--</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                {config.showFooter && (
                                    <div className="text-center mt-3 flex-shrink-0">
                                        <p className="text-[10px] opacity-50">{t.generatedBy}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
