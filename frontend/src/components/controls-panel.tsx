'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toHijri, getObservationDates, HIJRI_MONTHS } from '@/lib/api';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, CalendarIcon, Menu, X, Loader2, Download } from 'lucide-react';

export { HIJRI_MONTHS } from '@/lib/api';

import { useLanguage } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';

const HIJRI_MONTHS_AR = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
    'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

interface ControlsPanelProps {
    date: Date;
    setDate: (date: Date) => void;
    opacity: number;
    onOpacityChange: (value: number) => void;
    resolution: number;
    setResolution: (value: number) => void;
    projection: 'equirect' | 'gallpeters' | 'mercator';
    onProjectionChange: (value: 'equirect' | 'gallpeters' | 'mercator') => void;
    includePolar: boolean;
    setIncludePolar: (value: boolean) => void;
    criterion: 'yallop' | 'odeh';
    setCriterion: (value: 'yallop' | 'odeh') => void;
    evalTime: 'sunset' | 'best';
    setEvalTime: (value: 'sunset' | 'best') => void;
    onGenerate: () => void;
    onCancel: () => void;
    onSaveMap?: () => void;
    isLoading: boolean;
    progress: number;
    status: string;
    hasPoints?: boolean;
    isOpen: boolean;
    setIsOpen: (value: boolean) => void;
}

export function ControlsPanel({
    date,
    setDate,
    opacity,
    onOpacityChange,
    resolution,
    setResolution,
    projection,
    onProjectionChange,
    includePolar,
    setIncludePolar,
    criterion,
    setCriterion,
    evalTime,
    setEvalTime,
    onGenerate,
    onCancel,
    onSaveMap,
    isLoading,
    hasPoints = false,
    progress,
    status,
    isOpen,
    setIsOpen
}: ControlsPanelProps) {
    const { t, isRTL } = useLanguage();
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Track the selected Hijri year and month INDEPENDENTLY from the date
    // This prevents the circular dependency bug
    const currentHijri = useMemo(() => toHijri(new Date()), []);
    const [selectedHijriYear, setSelectedHijriYear] = useState(currentHijri.year);
    const [selectedHijriMonth, setSelectedHijriMonth] = useState(currentHijri.month);

    // Convert selected date to Hijri for display only
    const hijriDate = useMemo(() => toHijri(date), [date]);

    // Get observation dates based on the SELECTED Hijri month (not derived from date)
    const observationDates = useMemo(() =>
        getObservationDates(selectedHijriYear, selectedHijriMonth),
        [selectedHijriYear, selectedHijriMonth]
    );

    // Handle month selection from dropdown
    const handleMonthSelect = (val: string) => {
        const [yearStr, monthStr] = val.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        setSelectedHijriYear(year);
        setSelectedHijriMonth(month);
        const dates = getObservationDates(year, month);
        if (dates[1]) setDate(dates[1]);
    };

    // Handle date change from calendar - auto-sync Islamic month
    const handleDateChange = (newDate: Date) => {
        setDate(newDate);
        // Sync the selected Hijri month to match the new date
        const newHijri = toHijri(newDate);
        setSelectedHijriYear(newHijri.year);
        setSelectedHijriMonth(newHijri.month);
    };

    // Reset to today
    const handleSetToday = () => {
        const today = new Date();
        handleDateChange(today);
    };

    // Generate the list of upcoming months (current + next 11)
    const upcomingMonths = useMemo(() => {
        const months = [];
        let year = currentHijri.year;
        let month = currentHijri.month;

        for (let i = 0; i < 12; i++) {
            const dates = getObservationDates(year, month);
            months.push({
                year,
                month,
                name: isRTL ? HIJRI_MONTHS_AR[month - 1] : HIJRI_MONTHS[month - 1],
                dates,
                value: `${year}-${month}`
            });

            month++;
            if (month > 12) {
                month = 1;
                year++;
            }
        }
        return months;
    }, [currentHijri.year, currentHijri.month, isRTL]);

    return (
        <>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed top-4 left-4 z-[9999] w-10 h-10 bg-card border border-border rounded-lg flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-lg"
            >
                {isOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {/* Controls Panel */}
            <Card
                className={`fixed top-16 left-4 w-80 max-w-[calc(100vw-32px)] max-h-[calc(100vh-80px)] bg-card/90 backdrop-blur border-border shadow-lg z-[1000] overflow-y-auto transition-all ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'}`}
            >
                <div className="p-5 space-y-5">
                    {/* Header */}
                    <div className="border-b border-border pb-4">
                        <h1 className="text-sm font-medium tracking-wide text-foreground uppercase">
                            {t('controls.title')}
                        </h1>
                    </div>

                    {/* Date Picker */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs uppercase text-muted-foreground tracking-wider">
                                {t('controls.date_label')}
                            </Label>
                            <button
                                onClick={handleSetToday}
                                className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors uppercase font-medium tracking-wider"
                            >
                                {t('controls.today')}
                            </button>
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-center text-center font-normal bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {format(date, 'd-M-yyyy')}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800 z-[9999]">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && handleDateChange(d)}
                                    initialFocus
                                    formatters={{
                                        formatCaption: (date) => format(date, 'yyyy-MM'),
                                        formatWeekdayName: (date) => format(date, 'EEEEE', { locale: undefined }) // Keep default or adjust if needed
                                    }}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Hijri Date Display */}
                        <div
                            className={`text-sm text-violet-400 bg-violet-950/30 rounded-md px-3 py-2 border border-violet-900/50 text-center ${isRTL ? 'font-[family-name:var(--font-cairo)]' : ''}`}
                            dir={isRTL ? 'rtl' : 'ltr'}
                            style={{ unicodeBidi: 'plaintext' }}
                        >
                            {isRTL
                                ? `${hijriDate.day} ${HIJRI_MONTHS_AR[hijriDate.month - 1]} ${hijriDate.year} هـ`
                                : `${hijriDate.day} ${hijriDate.monthName} ${hijriDate.year} AH`
                            }
                        </div>
                    </div>

                    {/* Islamic Month Quick Select */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800/50">
                        <Label className="text-xs uppercase text-zinc-500 tracking-wider">
                            {t('islamic.month_selector')}
                        </Label>
                        <Select
                            value={`${selectedHijriYear}-${selectedHijriMonth}`}
                            onValueChange={handleMonthSelect}
                        >
                            <SelectTrigger className="w-full bg-zinc-800 border-zinc-700" dir="ltr">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                                {upcomingMonths.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                        {m.name} {m.year} — {format(m.dates[1], 'yyyy-MM-dd')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Observation Dates Chips - These are STABLE and don't change when you click them */}
                        <div className="space-y-1">
                            <Label className="text-xs text-zinc-600">Observation Dates:</Label>
                            <div className="flex gap-1.5">
                                {observationDates.map((d, i) => (
                                    <button
                                        key={`obs-${selectedHijriYear}-${selectedHijriMonth}-${i}`}
                                        onClick={() => setDate(d)}
                                        className={`flex-1 text-xs py-1.5 rounded-md transition-all ${format(d, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                            }`}
                                    >
                                        {format(d, 'MMM d')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 pt-4 border-t border-zinc-800">
                        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full flex justify-between items-center text-zinc-400 hover:text-zinc-200 p-0 h-8">
                                    <span className="text-xs uppercase tracking-wider">{t('advanced.title')}</span>
                                    {isAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-4 pt-4">
                                {/* Opacity Slider */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-zinc-400">{t('advanced.opacity')}</Label>
                                        <span className="text-xs text-zinc-500">{Math.round(opacity * 100)}%</span>
                                    </div>
                                    <Slider
                                        value={[opacity]}
                                        onValueChange={([v]) => onOpacityChange(v)}
                                        min={0}
                                        max={1}
                                        step={0.1}
                                        className="py-2"
                                    />
                                </div>

                                {/* Resolution */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-zinc-500 tracking-wider">
                                        {t('advanced.resolution')}
                                    </Label>
                                    <Select
                                        value={resolution.toString()}
                                        onValueChange={(v) => setResolution(parseFloat(v))}
                                    >
                                        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="5">5° ({t('advanced.resolution.fast')})</SelectItem>
                                            <SelectItem value="2">2° ({t('advanced.resolution.default')})</SelectItem>
                                            <SelectItem value="1">1° ({t('advanced.resolution.high')})</SelectItem>
                                            <SelectItem value="0.5">0.5° ({t('advanced.resolution.very_high')})</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Projection */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-zinc-500 tracking-wider">
                                        {t('advanced.projection')}
                                    </Label>
                                    <Select
                                        value={projection}
                                        onValueChange={(v) => onProjectionChange(v as 'equirect' | 'gallpeters' | 'mercator')}
                                    >
                                        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="gallpeters">{t('advanced.projection.gallpeters')}</SelectItem>
                                            <SelectItem value="equirect">{t('advanced.projection.equirect')}</SelectItem>
                                            <SelectItem value="mercator">{t('advanced.projection.mercator')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Criterion */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-zinc-500 tracking-wider">
                                        {t('advanced.criterion')}
                                    </Label>
                                    <Select
                                        value={criterion}
                                        onValueChange={(v) => setCriterion(v as 'yallop' | 'odeh')}
                                    >
                                        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="yallop">{t('legend.criterion.yallop')}</SelectItem>
                                            <SelectItem value="odeh">{t('legend.criterion.odeh')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Eval Time */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-zinc-500 tracking-wider">
                                        {t('advanced.eval_time')}
                                    </Label>
                                    <Select
                                        value={evalTime}
                                        onValueChange={(v) => setEvalTime(v as 'sunset' | 'best')}
                                    >
                                        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-zinc-800">
                                            <SelectItem value="sunset">{t('advanced.eval_time.sunset')}</SelectItem>
                                            <SelectItem value="best">{t('advanced.eval_time.best')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Polar Checkbox */}
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-zinc-400">{t('advanced.polar')}</Label>
                                    <Switch checked={includePolar} onCheckedChange={setIncludePolar} />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                        {!isLoading && (
                            <>
                                <Button
                                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium"
                                    onClick={onGenerate}
                                >
                                    {t('controls.generate')}
                                </Button>
                                {hasPoints && onSaveMap && (
                                    <Button
                                        variant="outline"
                                        className="w-full border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-200 font-medium"
                                        onClick={onSaveMap}
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        {t('controls.save_map')}
                                    </Button>
                                )}
                            </>
                        )}
                        {isLoading && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Button
                                        disabled
                                        variant="secondary"
                                        className="flex-1 bg-zinc-800 text-zinc-400"
                                    >
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t('controls.calculating')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950/30"
                                        onClick={onCancel}
                                    >
                                        {t('controls.cancel')}
                                    </Button>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-violet-600 transition-all duration-300 ease-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <div className="text-xs text-zinc-400 text-center font-mono animate-pulse">
                                    {status || t('controls.calculating')}
                                </div>
                            </div>
                        )}
                        {!isLoading && status && !status.includes('Calculating') && (
                            <div className="text-[10px] text-zinc-500 text-center font-mono">
                                {status === 'Ready'
                                    ? t('controls.status.ready')
                                    : status === 'Cancelled'
                                        ? t('controls.status.cancelled')
                                        : status
                                }
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </>
    );
}
