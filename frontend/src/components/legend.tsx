'use client';

import { Card } from '@/components/ui/card';

import { useLanguage } from '@/lib/i18n';

interface LegendProps {
    criterion: 'yallop' | 'odeh';
}

export default function Legend({ criterion }: LegendProps) {
    const { t, isRTL } = useLanguage();

    const LEGEND_ITEMS = [
        { color: '#22c55e', label: t('legend.zone.a') },
        { color: '#eab308', label: t('legend.zone.b') },
        { color: '#f97316', label: t('legend.zone.c') },
        { color: '#ef4444', label: t('legend.zone.d') },
    ];

    return (
        <Card className="fixed bottom-4 right-8 z-[1000] bg-card/90 backdrop-blur border-border p-3 shadow-lg">
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wider font-bold">{t('legend.title')}</span>
                    <span className="text-[10px] opacity-70">{criterion === 'yallop' ? t('legend.criterion.yallop') : t('legend.criterion.odeh')}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {LEGEND_ITEMS.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                            />
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
}
