'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    isRTL: boolean;
}

const translations = {
    en: {
        // App
        'app.title': 'Crescent Watch',
        'app.description': 'Scientific Moon Visibility Visualization',

        // Header
        'header.settings': 'Settings',
        'header.language': 'Language',
        'header.about': 'About Us',
        'header.close': 'Close',

        // About Dialog
        'about.calculations': 'Calculations',
        'about.calculations_desc': 'Visibility predictions are based on the standard Yallop (1997) and Odeh (2006) criteria, utilizing accurate astronomical algorithms for the moon\'s position, topocentric altitude, and elongation.',
        'about.credits': 'Credits',
        'about.credit_skyfield': 'Calculations powered by Skyfield & NumPy',
        'about.credit_d3': 'Map projections via D3-geo',
        'about.development': 'Development',
        'about.developed_by': 'Developed by',

        // Controls
        'controls.title': 'Crescent Visibility',
        'controls.date_label': 'Observation Date',
        'controls.today': 'Today',
        'controls.observation_dates': 'Observation Dates:',
        'controls.prev_month': 'Previous Month',
        'controls.next_month': 'Next Month',
        'controls.generate': 'Generate Map',
        'controls.calculating': 'Calculating...',
        'controls.cancel': 'Cancel',
        'controls.save_map': 'Save Map',
        'controls.status.ready': 'Ready',
        'controls.status.cancelled': 'Cancelled',

        // Islamic Month
        'islamic.month_selector': 'Islamic Month (Approximate)',

        // Advanced
        'advanced.title': 'Advanced Settings',
        'advanced.opacity': 'Overlay Opacity',
        'advanced.resolution': 'Resolution (deg)',
        'advanced.resolution.fast': 'Fast',
        'advanced.resolution.default': 'Default',
        'advanced.resolution.high': 'High',
        'advanced.resolution.very_high': 'Very High',

        'advanced.projection': 'Map Projection',
        'advanced.projection.equirect': 'Equirectangular',
        'advanced.projection.gallpeters': 'Gall-Peters',
        'advanced.projection.mercator': 'Mercator',

        'advanced.polar': 'Include Polar Regions',

        'advanced.criterion': 'Visibility Criterion',

        'advanced.eval_time': 'Evaluation Time',
        'advanced.eval_time.sunset': 'At Sunset',
        'advanced.eval_time.best': 'Best Time',

        // Coordinates
        'coords.lat': 'Lat',
        'coords.lon': 'Lon',

        // Instruction
        'instruction.click_map': 'Click on any location to view simulation',

        // Legend
        'legend.title': 'Visibility Zones',
        'legend.criterion.yallop': 'Yallop',
        'legend.criterion.odeh': 'Odeh',
        'legend.zone.a': 'Zone A: Easily Visible',
        'legend.zone.b': 'Zone B: Visible (Perfect Conditions)',
        'legend.zone.c': 'Zone C: Optical Aid Required',
        'legend.zone.d': 'Zone D: Not Visible',

        // Simulation
        'simulation.title': 'Simulation',
        'simulation.loading': 'Loading simulation...',
        'simulation.error': 'Error loading data',
        'simulation.no_data': 'No data available',
        'simulation.moon_alt': 'Moon Altitude',
        'simulation.illumination': 'Illumination',
        'simulation.elongation': 'Elongation',
        'simulation.sunset': 'Sunset',
        'simulation.show_buildings': 'Show Buildings',
        'simulation.legend.alt': 'Altitude from horizon',
        'simulation.legend.elong': 'Elongation from sun',
    },
    ar: {
        // App
        'app.title': 'رصد الاهلة',
        'app.description': 'محاكاة علمية لرؤية الهلال',

        // Header
        'header.settings': 'الإعدادات',
        'header.language': 'اللغة',
        'header.about': 'من نحن',
        'header.close': 'إغلاق',

        // About Dialog
        'about.calculations': 'الحسابات',
        'about.calculations_desc': 'تعتمد تنبؤات الرؤية على معياري يالوب (1997) و عودة (2006) القياسيين، باستخدام خوارزميات فلكية دقيقة لموضع القمر والارتفاع الطبوغرافي والاستطالة.',
        'about.credits': 'الشكر والتقدير',
        'about.credit_skyfield': 'الحسابات مدعومة من Skyfield و NumPy',
        'about.credit_d3': 'إسقاطات الخريطة عبر D3-geo',
        'about.development': 'التطوير',
        'about.developed_by': 'تم التطوير بواسطة',

        // Controls
        'controls.title': 'إعدادات الرؤية',
        'controls.date_label': 'تاريخ الرصد',
        'controls.today': 'اليوم',
        'controls.observation_dates': 'تواريخ الرصد:',
        'controls.prev_month': 'الشهر السابق',
        'controls.next_month': 'الشهر التالي',
        'controls.generate': 'توليد الخريطة',
        'controls.calculating': 'جاري الحساب...',
        'controls.cancel': 'إلغاء',
        'controls.save_map': 'حفظ الخريطة',
        'controls.status.ready': 'جاهز',
        'controls.status.cancelled': 'تم الإلغاء',

        // Islamic Month
        'islamic.month_selector': 'الشهر الهجري (تقريبي)',

        // Advanced
        'advanced.title': 'إعدادات متقدمة',
        'advanced.opacity': 'شفافية الخريطة',
        'advanced.resolution': 'الدقة (درجة)',
        'advanced.resolution.fast': 'سريع',
        'advanced.resolution.default': 'افتراضي',
        'advanced.resolution.high': 'عالي',
        'advanced.resolution.very_high': 'فائق',

        'advanced.projection': 'إسقاط الخريطة',
        'advanced.projection.equirect': 'مستطيل',
        'advanced.projection.gallpeters': 'غال-بيترز',
        'advanced.projection.mercator': 'ميركاتور',

        'advanced.polar': 'تضمين المناطق القطبية',

        'advanced.criterion': 'معيار الرؤية',

        'advanced.eval_time': 'وقت التقييم',
        'advanced.eval_time.sunset': 'عند الغروب',
        'advanced.eval_time.best': 'أفضل وقت',

        // Coordinates
        'coords.lat': 'خط عرض',
        'coords.lon': 'خط طول',

        // Instruction
        'instruction.click_map': 'انقر على أي موقع لعرض المحاكاة',

        // Legend
        'legend.title': 'مناطق الرؤية',
        'legend.criterion.yallop': 'يالوب',
        'legend.criterion.odeh': 'عودة',
        'legend.zone.a': 'منطقة A: مرئي بسهولة',
        'legend.zone.b': 'منطقة B: مرئي (ظروف مثالية)',
        'legend.zone.c': 'منطقة C: يحتاج تلسكوب',
        'legend.zone.d': 'منطقة D: غير مرئي',

        // Simulation
        'simulation.title': 'المحاكاة',
        'simulation.loading': 'جاري تحميل المحاكاة...',
        'simulation.error': 'خطأ في التحميل',
        'simulation.no_data': 'لا توجد بيانات',
        'simulation.moon_alt': 'ارتفاع القمر',
        'simulation.illumination': 'الإضاءة',
        'simulation.elongation': 'الاستطالة',
        'simulation.sunset': 'الغروب',
        'simulation.show_buildings': 'إظهار المباني',
        'simulation.legend.alt': 'الارتفاع عن الأفق',
        'simulation.legend.elong': 'الاستطالة عن الشمس',
    }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        const saved = localStorage.getItem('language');
        if (saved === 'ar' || saved === 'en') {
            setLanguageState(saved);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    const t = (key: string) => {
        return translations[language][key as keyof typeof translations['en']] || key;
    };

    const isRTL = language === 'ar';

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
