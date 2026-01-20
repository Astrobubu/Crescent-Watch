import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { getTranslations, Locale } from '@/lib/i18n';
import { Settings2, RotateCcw, Monitor, User, Globe, Mail } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    locale: Locale;
    fontSize: number;
    setFontSize: (size: number) => void;
}

export default function SettingsModal({
    isOpen,
    onClose,
    locale,
    fontSize,
    setFontSize,
}: SettingsModalProps) {
    const t = getTranslations(locale);
    const isRTL = locale === 'ar';

    const handleReset = () => {
        setFontSize(1.0); // Reset to standard 1.0rem (100%)
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg rounded-2xl overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogHeader className={isRTL ? 'text-right' : 'text-left'}>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Settings2 className="w-5 h-5 text-primary" />
                        {t.settings}
                    </DialogTitle>
                    <DialogDescription>
                        {t.adjustFontSize} {t.aboutApp}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">


                    {/* Font Size Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Monitor className="w-4 h-4 text-muted-foreground" />
                                {t.adjustFontSize}
                            </h3>
                            <Badge variant="outline" className="font-mono">{Math.round(fontSize * 16)}px</Badge>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-xl space-y-4">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium">A</span>
                                <input
                                    type="range"
                                    min="0.9"
                                    max="1.5"
                                    step="0.05"
                                    className="flex-1 accent-primary h-2 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer"
                                    value={fontSize}
                                    onChange={(e) => setFontSize(parseFloat(e.target.value))}
                                />
                                <span className="text-xl font-bold">A</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Small</span>
                                <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 px-2 text-xs hover:text-primary">
                                    <RotateCcw className="w-3 h-3 mr-1" /> {t.reset}
                                </Button>
                                <span>Large</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic text-center" style={{ fontSize: `${fontSize}rem` }}>
                            {t.appName}
                        </p>
                    </div>

                    <Separator />

                    {/* About Section */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {t.aboutApp}
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">{t.developedBy}</div>
                                <div className="font-semibold flex items-center gap-2">
                                    <Globe className="w-3 h-3 text-primary" />
                                    Constant Labs
                                </div>
                            </div>
                            <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">{t.projectLead}</div>
                                <div className="font-semibold">Ahmad</div>
                            </div>
                            <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">{t.version}</div>
                                <div className="font-semibold font-mono text-xs">v1.2.0 (Beta)</div>
                            </div>
                            <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">{t.contact}</div>
                                <div className="font-semibold flex items-center gap-2 text-xs">
                                    <Mail className="w-3 h-3 text-primary" />
                                    <a href="mailto:akhmad6093@gmail.com" className="hover:underline">akhmad6093@gmail.com</a>
                                </div>
                            </div>
                        </div>


                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

