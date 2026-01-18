'use client';

import { useState } from 'react';
import { Info, Mail, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { useLanguage } from '@/lib/i18n';

export function Header() {
    const [aboutOpen, setAboutOpen] = useState(false);
    const { t, language, setLanguage } = useLanguage();

    return (
        <>
            {/* Unified Header Bar - theme aware */}
            <div className="fixed top-4 right-4 z-[4000] flex items-center gap-2 bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-500">
                {/* App Title */}
                <span className="text-sm font-bold text-foreground pr-2">{t('app.title')}</span>

                {/* Language Dropdown */}
                <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'ar')}>
                    <SelectTrigger className="w-28 h-8 bg-secondary border-border text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ar">العربية</SelectItem>
                    </SelectContent>
                </Select>

                {/* Info Button - Opens About Dialog */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAboutOpen(true)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200 hover:scale-105"
                >
                    <Info className="h-4 w-4" />
                </Button>
            </div>

            {/* About Dialog */}
            <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
                <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
                    <DialogHeader className="text-center sm:text-center">
                        <DialogTitle className="text-xl text-foreground text-center">{t('app.title')}</DialogTitle>
                        <DialogDescription className="text-muted-foreground text-center">
                            {t('app.description')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="text-center">
                            <h4 className="text-sm font-medium text-foreground mb-2">{t('about.calculations')}</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {t('about.calculations_desc')}
                            </p>
                        </div>

                        {/* Credits section removed */}

                        <div>
                            <h4 className="text-sm font-medium text-foreground mb-2 text-center">{t('about.development')}</h4>
                            <div className="flex flex-col items-center text-center gap-2">
                                <p className="text-base font-medium text-foreground">
                                    Ahmad Hasan | احمد حسن
                                </p>
                                <a
                                    href="https://constantlabs.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 rounded-md bg-secondary/50 hover:bg-secondary transition-all flex items-center gap-2 text-primary hover:text-violet-500 font-medium text-sm mt-1"
                                >
                                    <Globe className="h-4 w-4" />
                                    <span>constantlabs.ai</span>
                                </a>
                                <a
                                    href="mailto:akhmad6093@gmail.com"
                                    className="px-4 py-2 rounded-md bg-secondary/50 hover:bg-secondary transition-all flex items-center gap-2 text-primary hover:text-violet-500 font-medium text-sm mt-1"
                                >
                                    <Mail className="h-4 w-4" />
                                    <span>akhmad6093@gmail.com</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setAboutOpen(false)}>
                            {t('header.close')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

