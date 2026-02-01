/**
 * Crescent Watch - Internationalization
 */

export type Locale = 'en' | 'ar';

export interface Translations {
    appName: string;
    calculate: string;
    calculating: string;
    selectDate: string;
    selectLocation: string;
    tapToSelect: string;
    resolution: string;
    lowRes: string;
    medRes: string;
    highRes: string;
    settings: string;
    language: string;
    criterion: string;
    islamicMonth: string;
    saveMap: string;
    viewSimulation: string;
    simulation: string;
    close: string;

    // Location panel
    selectedLocation: string;
    moonAltitude: string;
    sunAltitude: string;
    elongation: string;
    sunsetTime: string;
    moonsetTime: string;
    illumination: string;
    visibility: string;

    // Simulation Legend
    legendAlt: string;
    legendElong: string;
    showBuildings: string;
    showLegend: string;
    showData: string;

    // Visibility zones
    zoneA: string;
    zoneB: string;
    zoneC: string;
    zoneD: string;
    zoneADesc: string;
    zoneBDesc: string;
    zoneCDesc: string;
    zoneDDesc: string;

    // Legend
    legend: string;
    nakedEye: string;
    mayBeVisible: string;
    opticalAid: string;
    notVisible: string;

    // Map Settings Options
    projEquirectangular: string;
    projEqualArea: string;
    covStandard: string;
    covExtended: string;
    covGlobal: string;
    projection: string;
    coverage: string;
    critOdeh: string;
    critYallop: string;
    critSAAO: string;
    res05: string;
    res1: string;
    res2: string;
    res3: string;
    res4: string;

    // Simulation Extra
    moonAge: string;
    azimuthDiff: string;
    timeFormat: string;
    format12h: string;
    format24h: string;
    latitude: string;
    longitude: string;

    // Errors
    noLocation: string;
    calculationError: string;

    // Settings & About
    adjustFontSize: string;
    aboutApp: string;
    aboutDesc: string;
    developedBy: string;
    projectLead: string;
    version: string;
    contact: string;
    reset: string;

    // Conjunction
    conjunctionType: string;
    geocentric: string;
    topocentric: string;
    conjunctionInfo: string;
    conjunctionTime: string;
    geocentricConjunction: string;
    topocentricConjunction: string;
    conjunctionDifference: string;
    earlier: string;
    later: string;

    // Advanced Details & Reports
    advancedSettings: string;
    advancedDetails: string;
    showDetails: string;
    hideDetails: string;
    moonAzimuth: string;
    sunAzimuth: string;
    downloadReport: string;
    visibilityReport: string;
    visibilityAnalysis: string;
    conjunctionOccurred: string;
    atSunset: string;
    visibilityAssessment: string;
    crescentVisible: string;
    crescentNotVisible: string;
    observation: string;
    newMoon: string;
    waxingCrescent: string;
    moonHeight: string;
    moonAgeLabel: string;
    amount: string;
    setTime: string;
    moonAzLabel: string;
    sunAzLabel: string;
    overlayOpacity: string;

    // Report Editor
    reportEditor: string;
    reportSize: string;
    colors: string;
    background: string;
    text: string;
    accent: string;
    header: string;
    reportTitle: string;
    date: string;
    location: string;
    handImage: string;
    footer: string;
    dataSections: string;
    preview: string;
    hide: string;
    save: string;
    mobile: string;
    standard: string;
    fullReport: string;
    resetConfirm: string;
    saveSettingsHint: string;
    border: string;

    // Report Generation
    handMeasurementRef: string;
    crescentLikelyVisible: string;
    crescentMayBeVisible: string;
    crescentDifficult: string;
    moonAgeAtSunset: string;
    keyParameters: string;
    timesAndPosition: string;
    conjunctionTimes: string;
    generatedBy: string;
    lagTime: string;
    moonOrientation: string;
    moonRA: string;
    moonDec: string;
    customizeReport: string;
    resetView: string;
    dragToPan: string;
    moonTilt: string;
}

const translations: Record<Locale, Translations> = {
    en: {
        appName: 'Crescent Watch',
        calculate: 'Calculate',
        calculating: 'Calculating...',
        selectDate: 'Select Date',
        selectLocation: 'Select Location',
        tapToSelect: 'Tap on map to select location',
        resolution: 'Resolution',
        lowRes: 'Fast (4°)',
        medRes: 'Medium (2°)',
        highRes: 'High (1°)',
        settings: 'Settings',
        language: 'Language',
        criterion: 'Criterion',
        islamicMonth: 'Islamic Month',
        saveMap: 'Save Map',
        viewSimulation: 'View Simulation',
        simulation: 'Moon Simulation',
        close: 'Close',

        selectedLocation: 'Selected Location',
        moonAltitude: 'Moon Altitude',
        sunAltitude: 'Sun Altitude',
        elongation: 'Elongation',
        sunsetTime: 'Sunset',
        moonsetTime: 'Moonset',
        illumination: 'Illumination',
        visibility: 'Visibility',
        legendAlt: 'Altitude',
        legendElong: 'Elongation',
        showBuildings: 'Show Buildings',
        showLegend: 'Show Legend',
        showData: 'Show Data',

        zoneA: 'Zone A',
        zoneB: 'Zone B',
        zoneC: 'Zone C',
        zoneD: 'Zone D',
        zoneADesc: 'Easily visible to naked eye',
        zoneBDesc: 'May be visible to naked eye',
        zoneCDesc: 'Optical aid required',
        zoneDDesc: 'Not visible',

        legend: 'Legend',
        nakedEye: 'Naked Eye',
        mayBeVisible: 'May Be Visible',
        opticalAid: 'Optical Aid',
        notVisible: 'Not Visible',

        projEquirectangular: 'Equirectangular',
        projEqualArea: 'Equal Area',
        covStandard: 'Standard (±60°)',
        covExtended: 'Extended (±70°)',
        covGlobal: 'Global (±80°)',
        projection: 'Projection',
        coverage: 'Coverage',
        critOdeh: 'Odeh (2006)',
        critYallop: 'Yallop (1997)',
        critSAAO: 'SAAO (1988)',
        res05: '0.5° (Fine)',
        res1: '1° (High)',
        res2: '2° (Medium)',
        res3: '3° (Low)',
        res4: '4° (Fast)',

        moonAge: 'Moon Age',
        azimuthDiff: 'Azimuth Diff',
        timeFormat: 'Time Format',
        format12h: '12h',
        format24h: '24h',
        latitude: 'Latitude',
        longitude: 'Longitude',

        noLocation: 'No location selected',
        calculationError: 'Calculation failed',

        // Settings & About
        adjustFontSize: 'Adjust Font Size',
        aboutApp: 'About App',
        aboutDesc: 'Crescent Watch is a high-precision tool for predicting Islamic lunar crescent visibility.',
        developedBy: 'Developed by',
        projectLead: 'Project Lead',
        version: 'Version',
        contact: 'Contact',
        reset: 'Reset Defaults',

        // Conjunction
        conjunctionType: 'New Moon Calculation',
        geocentric: 'Geocentric (Earth center)',
        topocentric: 'Topocentric (Observer location)',
        conjunctionInfo: 'Geocentric uses Earth\'s center; topocentric accounts for observer parallax',
        conjunctionTime: 'Conjunction Time',
        geocentricConjunction: 'Geocentric Conjunction',
        topocentricConjunction: 'Topocentric Conjunction',
        conjunctionDifference: 'Difference',
        earlier: 'earlier',
        later: 'later',

        // Advanced Details & Reports
        advancedSettings: 'Advanced Settings',
        advancedDetails: 'Advanced Details',
        showDetails: 'Show Details',
        hideDetails: 'Hide Details',
        moonAzimuth: 'Moon Azimuth',
        sunAzimuth: 'Sun Azimuth',
        downloadReport: 'Download Report',
        visibilityReport: 'Visibility Report',
        visibilityAnalysis: 'Visibility Analysis',
        conjunctionOccurred: 'Conjunction occurred on',
        atSunset: 'At sunset, moon age was',
        visibilityAssessment: 'Visibility Assessment',
        crescentVisible: 'The crescent is likely visible',
        crescentNotVisible: 'The crescent requires optical aid or is not visible',
        observation: 'Observation Data',
        newMoon: 'New Moon',
        waxingCrescent: 'Waxing Crescent',
        moonHeight: 'Moon Height',
        moonAgeLabel: 'Moon Age',
        amount: 'Amount',
        setTime: 'Set Time',
        moonAzLabel: 'Moon Azimuth',
        sunAzLabel: 'Sun Azimuth',
        overlayOpacity: 'Overlay Opacity',

        // Report Editor
        reportEditor: 'Report Editor',
        reportSize: 'Report Size',
        colors: 'Colors',
        background: 'Background',
        text: 'Text',
        accent: 'Accent',
        header: 'Header',
        reportTitle: 'Report Title',
        date: 'Date',
        location: 'Location',
        handImage: 'Hand Image',
        footer: 'Footer',
        dataSections: 'Data Sections',
        preview: 'Preview',
        hide: 'Hide',
        save: 'Save',
        mobile: 'Mobile',
        standard: 'Standard',
        fullReport: 'Full Report',
        resetConfirm: 'Reset to defaults?',
        saveSettingsHint: 'Save settings, then download from simulation',
        border: 'Border',

        // Report Generation
        handMeasurementRef: 'Hand Measurement Reference (arm extended)',
        crescentLikelyVisible: 'Crescent Likely Visible',
        crescentMayBeVisible: 'Crescent May Be Visible',
        crescentDifficult: 'Crescent Difficult to See',
        moonAgeAtSunset: 'Moon Age at Sunset',
        keyParameters: 'Key Parameters',
        timesAndPosition: 'Times & Position',
        conjunctionTimes: 'Conjunction Times',
        generatedBy: 'Generated by Crescent Watch',
        lagTime: 'Lag Time',
        moonOrientation: 'Moon Orientation',
        moonRA: 'Moon RA',
        moonDec: 'Moon Dec',
        customizeReport: 'Customize Report',
        resetView: 'Reset View',
        dragToPan: 'Drag to Pan • Scroll/Double-Tap to Zoom',
        moonTilt: 'Moon Tilt',
    },
    ar: {
        appName: 'رصد الاهلة',
        calculate: 'احسب',
        calculating: 'جاري الحساب...',
        selectDate: 'اختر التاريخ',
        selectLocation: 'اختر الموقع',
        tapToSelect: 'انقر على الخريطة لاختيار الموقع',
        resolution: 'الدقة',
        lowRes: 'سريع (4°)',
        medRes: 'متوسط (2°)',
        highRes: 'عالي (1°)',
        settings: 'الإعدادات',
        language: 'اللغة',
        criterion: 'المعيار',
        islamicMonth: 'الشهر الهجري',
        saveMap: 'حفظ الخريطة',
        viewSimulation: 'عرض المحاكاة',
        simulation: 'محاكاة القمر',
        close: 'إغلاق',

        selectedLocation: 'الموقع المحدد',
        moonAltitude: 'ارتفاع القمر',
        sunAltitude: 'ارتفاع الشمس',
        elongation: 'الاستطالة',
        sunsetTime: 'غروب الشمس',
        moonsetTime: 'غروب القمر',
        illumination: 'الإضاءة',
        visibility: 'الرؤية',
        legendAlt: 'الارتفاع',
        legendElong: 'الاستطالة',
        showBuildings: 'إظهار المباني',
        showLegend: 'إظهار الدليل',
        showData: 'إظهار البيانات',

        zoneA: 'المنطقة أ',
        zoneB: 'المنطقة ب',
        zoneC: 'المنطقة ج',
        zoneD: 'المنطقة د',
        zoneADesc: 'مرئي بسهولة بالعين المجردة',
        zoneBDesc: 'قد يُرى بالعين المجردة',
        zoneCDesc: 'يتطلب أجهزة بصرية',
        zoneDDesc: 'غير مرئي',

        legend: 'دليل الألوان',
        nakedEye: 'العين المجردة',
        mayBeVisible: 'قد يُرى',
        opticalAid: 'أجهزة بصرية',
        notVisible: 'غير مرئي',

        projEquirectangular: 'مستطيل',
        projEqualArea: 'متساوي المساحة',
        covStandard: 'قياسي (±60°)',
        covExtended: 'موسع (±70°)',
        covGlobal: 'عالمي (±80°)',
        projection: 'الإسقاط',
        coverage: 'التغطية',
        critOdeh: 'عودة (2006)',
        critYallop: 'يالوب (1997)',
        critSAAO: 'جنوب أفريقيا (1988)',
        res05: '0.5° (دقة فائقة)',
        res1: '1° (دقة عالية)',
        res2: '2° (دقة متوسطة)',
        res3: '3° (دقة منخفضة)',
        res4: '4° (سريع)',

        moonAge: 'عمر القمر',
        azimuthDiff: 'فرق السمت',
        timeFormat: 'تنسيق الوقت',
        format12h: '12 ساعة',
        format24h: '24 ساعة',
        latitude: 'خط العرض',
        longitude: 'خط الطول',

        noLocation: 'لم يتم تحديد موقع',
        calculationError: 'فشل الحساب',

        // Settings & About
        adjustFontSize: 'حجم الخط',
        aboutApp: 'عن التطبيق',
        aboutDesc: 'رصد الاهلة هي أداة عالية الدقة للتنبؤ بإمكانية رؤية الهلال القمري.',
        developedBy: 'تطوير',
        projectLead: 'إشراف',
        version: 'الإصدار',
        contact: 'تواصل معنا',
        reset: 'المعدلات الافتراضية',

        // Conjunction
        conjunctionType: 'حساب المحاق',
        geocentric: 'مركز الأرض',
        topocentric: 'موقع الراصد',
        conjunctionInfo: 'مركز الأرض يستخدم مركز الأرض؛ موقع الراصد يحسب اختلاف المنظر',
        conjunctionTime: 'وقت الاقتران',
        geocentricConjunction: 'الاقتران الجيوسنتري',
        topocentricConjunction: 'الاقتران الطوبوسنتري',
        conjunctionDifference: 'الفرق',
        earlier: 'قبل',
        later: 'بعد',

        // Advanced Details & Reports
        advancedSettings: 'إعدادات متقدمة',
        advancedDetails: 'التفاصيل المتقدمة',
        showDetails: 'إظهار التفاصيل',
        hideDetails: 'إخفاء التفاصيل',
        moonAzimuth: 'سمت القمر',
        sunAzimuth: 'سمت الشمس',
        downloadReport: 'تحميل التقرير',
        visibilityReport: 'تقرير الرؤية',
        visibilityAnalysis: 'تحليل الرؤية',
        conjunctionOccurred: 'حدث الاقتران في',
        atSunset: 'عند الغروب، كان عمر القمر',
        visibilityAssessment: 'تقييم الرؤية',
        crescentVisible: 'الهلال مرجح أن يكون مرئياً',
        crescentNotVisible: 'الهلال يتطلب أجهزة بصرية أو غير مرئي',
        observation: 'بيانات الرصد',
        newMoon: 'محاق',
        waxingCrescent: 'هلال متزايد',
        moonHeight: 'ارتفاع القمر',
        moonAgeLabel: 'عمر القمر',
        amount: 'المقدار',
        setTime: 'وقت الغروب',
        moonAzLabel: 'سمت القمر',
        sunAzLabel: 'سمت الشمس',
        overlayOpacity: 'شفافية الخريطة',

        // Report Editor
        reportEditor: 'محرر التقرير',
        reportSize: 'حجم التقرير',
        colors: 'الألوان',
        background: 'الخلفية',
        text: 'النص',
        accent: 'التمييز',
        header: 'الرأس',
        reportTitle: 'عنوان التقرير',
        date: 'التاريخ',
        location: 'الموقع',
        handImage: 'صورة اليد',
        footer: 'التذييل',
        dataSections: 'أقسام البيانات',
        preview: 'معاينة',
        hide: 'إخفاء',
        save: 'حفظ',
        mobile: 'موبايل',
        standard: 'قياسي',
        fullReport: 'تقرير كامل',
        resetConfirm: 'هل أنت متأكد من إعادة التعيين؟',
        saveSettingsHint: 'احفظ الإعدادات ثم حمّل التقرير من صفحة المحاكاة',
        border: 'إطار',

        // Report Generation
        handMeasurementRef: 'مرجع قياس اليد (الذراع ممتدة)',
        crescentLikelyVisible: 'الهلال مرجح رؤيته',
        crescentMayBeVisible: 'الهلال قد يُرى',
        crescentDifficult: 'الهلال صعب الرؤية',
        moonAgeAtSunset: 'عمر القمر عند الغروب',
        keyParameters: 'المعايير الرئيسية',
        timesAndPosition: 'الأوقات والموقع',
        conjunctionTimes: 'أوقات الاقتران',
        generatedBy: 'تم إنشاؤه بواسطة رصد الاهلة',
        lagTime: 'وقت التأخير',
        moonOrientation: 'اتجاه القمر',
        moonRA: 'المطلع المستقيم',
        moonDec: 'الميل',
        customizeReport: 'تخصيص التقرير',
        resetView: 'إعادة تعيين العرض',
        dragToPan: 'اسحب للتحريك • مرر للتكبير',
        moonTilt: 'ميل القمر',
    }
};

export function getTranslations(locale: Locale): Translations {
    return translations[locale];
}

export function isRTL(locale: Locale): boolean {
    return locale === 'ar';
}
