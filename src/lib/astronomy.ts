/**
 * Crescent Watch - Astronomy Calculations
 * 
 * Pure TypeScript implementation using the Astronomy Engine library.
 * Provides moon visibility calculations using Yallop and Odeh criteria.
 */

import * as Astronomy from 'astronomy-engine';

// Constants
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6378.137;

// Types
export interface VisibilityPoint {
    lat: number;
    lon: number;
    color: 'green' | 'yellow' | 'orange' | 'red';
    moonAlt?: number;
    sunAlt?: number;
    elongation?: number;
    odehZone?: 'A' | 'B' | 'C' | 'D';
    yallopClass?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
}

export interface MoonSunData {
    sunAlt: number;
    sunAz: number;
    moonAlt: number;
    moonAz: number;
    elongation: number;
    moonDistKm: number;
    illumination: number;
}

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

export interface OdehResult {
    v: number;
    zone: 'A' | 'B' | 'C' | 'D';
    visibility: 'naked_eye' | 'optical_aid' | 'not_visible';
}

export interface YallopResult {
    q: number;
    cls: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
    visibility: string;
}

/**
 * Find sunset time for a given location and date
 * Uses LOCAL date based on longitude to avoid dateline cutoff
 */
export function findSunset(
    lat: number,
    lon: number,
    year: number,
    month: number,
    day: number
): Astronomy.AstroTime | null {
    const observer = new Astronomy.Observer(lat, lon, 0);

    // Calculate timezone offset from longitude (approximate: 15° = 1 hour)
    const tzOffsetHours = Math.round(lon / 15);

    // Create local noon for this location
    // Start at 12:00 UTC, then adjust by timezone offset
    const localNoonUTC = new Date(Date.UTC(year, month - 1, day, 12 - tzOffsetHours, 0, 0));
    const startTime = Astronomy.MakeTime(localNoonUTC);

    // Search for next sunset (-1 = setting)
    const sunset = Astronomy.SearchRiseSet(
        Astronomy.Body.Sun,
        observer,
        -1,
        startTime,
        1
    );

    return sunset;
}

/**
 * Find moonset time for a given location and date
 */
export function findMoonset(
    lat: number,
    lon: number,
    startTime: Astronomy.AstroTime
): Astronomy.AstroTime | null {
    const observer = new Astronomy.Observer(lat, lon, 0);

    const moonset = Astronomy.SearchRiseSet(
        Astronomy.Body.Moon,
        observer,
        -1,
        startTime,
        1
    );

    return moonset;
}

/**
 * Get Moon and Sun positions at a specific time
 */
export function getMoonSunData(
    lat: number,
    lon: number,
    time: Astronomy.AstroTime
): MoonSunData {
    const observer = new Astronomy.Observer(lat, lon, 0);

    // Sun position
    const sunEquator = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
    const sunHorizon = Astronomy.Horizon(time, observer, sunEquator.ra, sunEquator.dec, 'normal');

    // Moon position
    const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true);
    const moonHorizon = Astronomy.Horizon(time, observer, moonEquator.ra, moonEquator.dec, 'normal');

    // Elongation (angular separation between Sun and Moon)
    const elongation = Astronomy.AngleBetween(
        Astronomy.GeoVector(Astronomy.Body.Sun, time, true),
        Astronomy.GeoVector(Astronomy.Body.Moon, time, true)
    );

    // Moon distance in km
    const moonGeo = Astronomy.GeoVector(Astronomy.Body.Moon, time, true);
    const moonDistAU = Math.sqrt(moonGeo.x * moonGeo.x + moonGeo.y * moonGeo.y + moonGeo.z * moonGeo.z);
    const moonDistKm = moonDistAU * 149597870.7;

    // Illumination
    const illum = Astronomy.Illumination(Astronomy.Body.Moon, time);

    return {
        sunAlt: sunHorizon.altitude,
        sunAz: sunHorizon.azimuth,
        moonAlt: moonHorizon.altitude,
        moonAz: moonHorizon.azimuth,
        elongation,
        moonDistKm,
        illumination: illum.phase_fraction
    };
}

/**
 * Calculate crescent semi-width in arcminutes
 * Matches the original Python implementation exactly
 */
export function calcCrescentWidth(
    arclDeg: number,
    moonAltDeg: number,
    distKm: number
): number {
    const sinPi = Math.min(EARTH_RADIUS_KM / distKm, 1.0);
    const piRad = Math.asin(sinPi);
    const hRad = moonAltDeg * DEG2RAD;
    const sdRad = 0.27245 * piRad;
    const sdPrimeRad = sdRad * (1.0 + Math.sin(hRad) * Math.sin(piRad));
    const arclRad = arclDeg * DEG2RAD;
    const wPrimeRad = sdPrimeRad * (1.0 - Math.cos(arclRad));
    return wPrimeRad * RAD2DEG * 60.0;
}

/**
 * Yallop criterion - returns q value and classification
 */
export function yallopCriterion(
    arcl: number,
    arcv: number,
    wPrime: number
): YallopResult {
    const f = 11.8371 - 6.3226 * wPrime + 0.7319 * Math.pow(wPrime, 2) - 0.1018 * Math.pow(wPrime, 3);
    const q = (arcv - f) / 10.0;

    if (q > 0.216) {
        return { q, cls: 'A', visibility: 'naked_eye_easy' };
    } else if (q > -0.014) {
        return { q, cls: 'B', visibility: 'naked_eye_perfect' };
    } else if (q > -0.160) {
        return { q, cls: 'C', visibility: 'mixed_optical_helpful' };
    } else if (q > -0.232) {
        return { q, cls: 'D', visibility: 'optical_required' };
    } else if (q > -0.293) {
        return { q, cls: 'E', visibility: 'not_visible_telescope' };
    } else {
        return { q, cls: 'F', visibility: 'not_visible' };
    }
}

/**
 * Odeh criterion - returns V value and zone
 * Reference: Mohammad Odeh's criterion from Accurate Times
 */
export function odehCriterion(arcv: number, wArcmin: number): OdehResult {
    const curve = -0.1018 * Math.pow(wArcmin, 3) +
        0.7319 * Math.pow(wArcmin, 2) -
        6.3226 * wArcmin + 7.1651;
    const v = arcv - curve;

    if (v >= 5.65) {
        return { v, zone: 'A', visibility: 'naked_eye' };
    } else if (v >= 2.0) {
        return { v, zone: 'B', visibility: 'naked_eye' };
    } else if (v >= -0.96) {
        return { v, zone: 'C', visibility: 'optical_aid' };
    } else {
        return { v, zone: 'D', visibility: 'not_visible' };
    }
}

/**
 * Map Odeh zone to display color
 */
export function zoneToColor(zone: 'A' | 'B' | 'C' | 'D'): 'green' | 'yellow' | 'orange' | 'red' {
    switch (zone) {
        case 'A': return 'green';
        case 'B': return 'yellow';
        case 'C': return 'orange';
        case 'D': return 'red';
    }
}

/**
 * Map Yallop class to display color
 */
export function yallopClassToColor(cls: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'): 'green' | 'yellow' | 'orange' | 'red' {
    switch (cls) {
        case 'A': return 'green';
        case 'B': return 'green';
        case 'C': return 'yellow';
        case 'D': return 'orange';
        case 'E': return 'red';
        case 'F': return 'red';
    }
}

export type Criterion = 'odeh' | 'yallop' | 'saao' | 'shaukat';

/**
 * SAAO criterion - South African Astronomical Observatory
 * Based on moon age and altitude
 */
export function saaoCriterion(moonAlt: number, moonAge: number): { zone: 'A' | 'B' | 'C' | 'D', color: 'green' | 'yellow' | 'orange' | 'red' } {
    // SAAO uses moon age (hours since new moon) and altitude
    // Simplified version using altitude thresholds
    if (moonAlt >= 10 && moonAge >= 24) {
        return { zone: 'A', color: 'green' };
    } else if (moonAlt >= 6 && moonAge >= 18) {
        return { zone: 'B', color: 'yellow' };
    } else if (moonAlt >= 3 && moonAge >= 15) {
        return { zone: 'C', color: 'orange' };
    } else {
        return { zone: 'D', color: 'red' };
    }
}

/**
 * Shaukat criterion - Khalid Shaukat's visibility criterion
 * Based on elongation and altitude
 */
export function shaukatCriterion(elongation: number, moonAlt: number): { zone: 'A' | 'B' | 'C' | 'D', color: 'green' | 'yellow' | 'orange' | 'red' } {
    // Shaukat uses elongation > 10° as minimum
    if (elongation < 10) {
        return { zone: 'D', color: 'red' };
    }

    if (moonAlt >= 8 && elongation >= 12) {
        return { zone: 'A', color: 'green' };
    } else if (moonAlt >= 5 && elongation >= 10) {
        return { zone: 'B', color: 'yellow' };
    } else if (moonAlt >= 2 && elongation >= 8) {
        return { zone: 'C', color: 'orange' };
    } else {
        return { zone: 'D', color: 'red' };
    }
}

/**
 * Calculate visibility for a single point
 */
export function calculateVisibilityPoint(
    lat: number,
    lon: number,
    year: number,
    month: number,
    day: number,
    criterion: Criterion = 'odeh'
): VisibilityPoint | null {
    try {
        // Find sunset
        const sunset = findSunset(lat, lon, year, month, day);
        if (!sunset) {
            return { lat, lon, color: 'red' }; // No sunset (polar region)
        }

        // Get moon/sun data at sunset
        const data = getMoonSunData(lat, lon, sunset);

        // Calculate derived values
        const arcl = data.elongation;
        const arcv = data.moonAlt - data.sunAlt;
        const wPrime = calcCrescentWidth(arcl, data.moonAlt, data.moonDistKm);

        // Apply all criteria
        const odeh = odehCriterion(arcv, wPrime);
        const yallop = yallopCriterion(arcl, arcv, wPrime);
        // For SAAO and Shaukat, we use simplified versions
        const saao = saaoCriterion(data.moonAlt, 20); // Approximate moon age
        const shaukat = shaukatCriterion(arcl, data.moonAlt);

        // Moon below horizon at sunset = not visible
        if (data.moonAlt < 0) {
            return {
                lat,
                lon,
                color: 'red',
                moonAlt: data.moonAlt,
                sunAlt: data.sunAlt,
                elongation: arcl,
                odehZone: 'D',
                yallopClass: 'F'
            };
        }

        // Choose color based on selected criterion
        let color: 'green' | 'yellow' | 'orange' | 'red';
        switch (criterion) {
            case 'odeh':
                color = zoneToColor(odeh.zone);
                break;
            case 'yallop':
                color = yallopClassToColor(yallop.cls);
                break;
            case 'saao':
                color = saao.color;
                break;
            case 'shaukat':
                color = shaukat.color;
                break;
            default:
                color = zoneToColor(odeh.zone);
        }

        return {
            lat,
            lon,
            color,
            moonAlt: data.moonAlt,
            sunAlt: data.sunAlt,
            elongation: arcl,
            odehZone: odeh.zone,
            yallopClass: yallop.cls
        };
    } catch (error) {
        console.error(`Error calculating visibility for (${lat}, ${lon}):`, error);
        return { lat, lon, color: 'red' };
    }
}

/**
 * Generate visibility grid for the entire world
 */
export function generateVisibilityGrid(
    year: number,
    month: number,
    day: number,
    options: {
        stepDeg?: number;
        maxLat?: number;
        criterion?: Criterion;
        onProgress?: (progress: number) => void;
    } = {}
): VisibilityPoint[] {
    const { stepDeg = 2, maxLat = 60, criterion = 'odeh', onProgress } = options;

    const points: VisibilityPoint[] = [];
    const lats: number[] = [];
    const lons: number[] = [];

    // Build coordinate arrays
    for (let lat = -maxLat; lat <= maxLat; lat += stepDeg) {
        lats.push(lat);
    }
    for (let lon = -180; lon < 180; lon += stepDeg) {
        lons.push(lon);
    }

    const totalPoints = lats.length * lons.length;
    let processedPoints = 0;

    // Calculate visibility for each point
    for (const lat of lats) {
        for (const lon of lons) {
            const point = calculateVisibilityPoint(lat, lon, year, month, day, criterion);
            if (point) {
                points.push(point);
            }

            processedPoints++;
            if (onProgress && processedPoints % 100 === 0) {
                onProgress(Math.round((processedPoints / totalPoints) * 100));
            }
        }
    }

    if (onProgress) {
        onProgress(100);
    }

    return points;
}

/**
 * Generate simulation trajectory for a location
 * Returns moon/sun positions from sunset to moonset
 */
export function getSimulationTrajectory(
    lat: number,
    lon: number,
    year: number,
    month: number,
    day: number
): { sunsetIso: string; trajectory: SimulationPoint[] } | null {
    try {
        const sunset = findSunset(lat, lon, year, month, day);
        if (!sunset) {
            return null;
        }

        const trajectory: SimulationPoint[] = [];
        const observer = new Astronomy.Observer(lat, lon, 0);

        // Generate 75 minutes of data (every 2 minutes)
        for (let i = 0; i <= 75; i += 2) {
            const offsetMs = i * 60 * 1000; // Convert minutes to milliseconds
            const timeDate = new Date(sunset.date.getTime() + offsetMs);
            const time = Astronomy.MakeTime(timeDate);

            // Get positions
            const sunEquator = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
            const sunHorizon = Astronomy.Horizon(time, observer, sunEquator.ra, sunEquator.dec, 'normal');

            const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true);
            const moonHorizon = Astronomy.Horizon(time, observer, moonEquator.ra, moonEquator.dec, 'normal');

            const elongation = Astronomy.AngleBetween(
                Astronomy.GeoVector(Astronomy.Body.Sun, time, true),
                Astronomy.GeoVector(Astronomy.Body.Moon, time, true)
            );

            const illum = Astronomy.Illumination(Astronomy.Body.Moon, time);

            // Calculate tilt (angle from zenith to sun relative to moon)
            const dy = sunHorizon.altitude - moonHorizon.altitude;
            const dx = (sunHorizon.azimuth - moonHorizon.azimuth) * Math.cos(moonHorizon.altitude * DEG2RAD);
            const tiltFromRight = Math.atan2(dy, dx) * RAD2DEG;

            trajectory.push({
                timeOffsetMin: i,
                sunAlt: sunHorizon.altitude,
                sunAz: sunHorizon.azimuth,
                moonAlt: moonHorizon.altitude,
                moonAz: moonHorizon.azimuth,
                illumination: illum.phase_fraction,
                elongation,
                tilt: 90 - tiltFromRight // Convert to angle from zenith
            });
        }

        return {
            sunsetIso: sunset.date.toISOString(),
            trajectory
        };
    } catch (error) {
        console.error('Error generating simulation trajectory:', error);
        return null;
    }
}

/**
 * Find the most recent new moon (geocentric conjunction) before a given date
 */
export function findRecentConjunction(
    date: Date,
    type: ConjunctionType = 'geocentric',
    lat?: number,
    lon?: number
): Astronomy.AstroTime | null {
    if (type === 'topocentric' && lat !== undefined && lon !== undefined) {
        const result = findTopocentricConjunction(lat, lon, date, -30);
        return result ? Astronomy.MakeTime(result.time) : null;
    }
    const time = Astronomy.MakeTime(date);
    // Search backwards for new moon (phase = 0)
    return Astronomy.SearchMoonPhase(0, time, -30);
}

/**
 * Calculate moon age in hours since last conjunction
 */
export function calculateMoonAge(observationTime: Date, conjunctionTime: Date): number {
    return (observationTime.getTime() - conjunctionTime.getTime()) / (1000 * 60 * 60);
}

/**
 * Format moon age as hours and minutes string (e.g., "+16H 22M")
 */
export function formatMoonAge(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `+${h}H ${m.toString().padStart(2, '0')}M`;
}

/**
 * Format decimal degrees to degrees:minutes:seconds (DMS) format
 * e.g., 248.3825 -> "+248°:22':57"" 
 */
export function formatDMS(degrees: number): string {
    const sign = degrees >= 0 ? '+' : '-';
    const abs = Math.abs(degrees);
    const d = Math.floor(abs);
    const mFloat = (abs - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60);
    return `${sign}${d.toString().padStart(2, '0')}°:${m.toString().padStart(2, '0')}':${s.toString().padStart(2, '0')}"`;
}

/**
 * Format coordinate to DMS string (e.g. "103:22:57.0")
 */
export function formatCoordinate(degrees: number): string {
    const abs = Math.abs(degrees);
    const d = Math.floor(abs);
    const mFloat = (abs - d) * 60;
    const m = Math.floor(mFloat);
    const s = ((mFloat - m) * 60).toFixed(1);
    return `${d.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}`;
}

/**
 * Enhanced simulation data with conjunction, moonset, and moon age
 */
export interface EnhancedSimulationData {
    sunsetIso: string;
    moonsetIso: string | null;
    conjunctionIso: string;
    conjunctionLocal: string;
    moonAgeHours: number;
    conjunctionIsoGeo: string;
    conjunctionLocalGeo: string;
    moonAgeHoursGeo: number;
    conjunctionIsoTopo: string | null;
    conjunctionLocalTopo: string | null;
    moonAgeHoursTopo: number | null;
    trajectory: SimulationPoint[];
    meta: {
        lat: number;
        lon: number;
        locationName?: string;
    };
}

/**
 * Generate enhanced simulation trajectory with all astronomical data
 */
export function getEnhancedSimulationTrajectory(
    lat: number,
    lon: number,
    year: number,
    month: number,
    day: number
): EnhancedSimulationData | null {
    try {
        const sunset = findSunset(lat, lon, year, month, day);
        if (!sunset) {
            return null;
        }

        // Find recent conjunctions (Both Geo and Topo)
        const conjGeo = findRecentConjunction(sunset.date, 'geocentric');
        const conjTopo = findRecentConjunction(sunset.date, 'topocentric', lat, lon);

        if (!conjGeo) {
            return null;
        }

        const moonAgeGeo = calculateMoonAge(sunset.date, conjGeo.date);
        const moonAgeTopo = conjTopo ? calculateMoonAge(sunset.date, conjTopo.date) : null;

        // Find moonset after sunset
        const moonset = findMoonset(lat, lon, sunset);

        // Calculate timezone offset for local time display
        const tzOffsetHours = Math.round(lon / 15);

        const conjLocalGeo = new Date(conjGeo.date.getTime() + tzOffsetHours * 60 * 60 * 1000).toISOString();
        const conjLocalTopo = conjTopo ? new Date(conjTopo.date.getTime() + tzOffsetHours * 60 * 60 * 1000).toISOString() : null;

        const trajectory: SimulationPoint[] = [];
        const observer = new Astronomy.Observer(lat, lon, 0);

        // Generate 75 minutes of data (every 2 minutes)
        for (let i = 0; i <= 75; i += 2) {
            const offsetMs = i * 60 * 1000;
            const timeDate = new Date(sunset.date.getTime() + offsetMs);
            const time = Astronomy.MakeTime(timeDate);

            // Get positions
            const sunEquator = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
            const sunHorizon = Astronomy.Horizon(time, observer, sunEquator.ra, sunEquator.dec, 'normal');

            const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true);
            const moonHorizon = Astronomy.Horizon(time, observer, moonEquator.ra, moonEquator.dec, 'normal');

            const elongation = Astronomy.AngleBetween(
                Astronomy.GeoVector(Astronomy.Body.Sun, time, true),
                Astronomy.GeoVector(Astronomy.Body.Moon, time, true)
            );

            const illum = Astronomy.Illumination(Astronomy.Body.Moon, time);

            // Calculate tilt
            const dy = sunHorizon.altitude - moonHorizon.altitude;
            const dx = (sunHorizon.azimuth - moonHorizon.azimuth) * Math.cos(moonHorizon.altitude * DEG2RAD);
            const tiltFromRight = Math.atan2(dy, dx) * RAD2DEG;

            // Calculate current moon age
            // Calculate current moon age (using Geo for trajectory consistency)
            const currentMoonAge = calculateMoonAge(timeDate, conjGeo.date);

            trajectory.push({
                timeOffsetMin: i,
                sunAlt: sunHorizon.altitude,
                sunAz: sunHorizon.azimuth,
                moonAlt: moonHorizon.altitude,
                moonAz: moonHorizon.azimuth,
                illumination: illum.phase_fraction,
                elongation,
                tilt: 90 - tiltFromRight,
                moonAge: currentMoonAge
            });
        }

        return {
            sunsetIso: sunset.date.toISOString(),
            moonsetIso: moonset ? moonset.date.toISOString() : null,
            conjunctionIso: conjGeo.date.toISOString(),
            conjunctionLocal: conjLocalGeo,
            moonAgeHours: moonAgeGeo,

            conjunctionIsoGeo: conjGeo.date.toISOString(),
            conjunctionLocalGeo: conjLocalGeo,
            moonAgeHoursGeo: moonAgeGeo,

            conjunctionIsoTopo: conjTopo ? conjTopo.date.toISOString() : null,
            conjunctionLocalTopo: conjLocalTopo,
            moonAgeHoursTopo: moonAgeTopo,

            trajectory,
            meta: { lat, lon }
        };
    } catch (error) {
        console.error('Error generating enhanced simulation trajectory:', error);
        return null;
    }
}

/**
 * Generate visibility interpretation text based on calculations
 */
export function generateVisibilityTranscript(
    data: EnhancedSimulationData,
    frame: SimulationPoint,
    criterion: 'odeh' | 'yallop' | 'saao' | 'shaukat',
    locale: 'en' | 'ar' = 'en'
): string {
    // Get visibility result
    const arcv = frame.moonAlt - frame.sunAlt;
    const wPrime = calcCrescentWidth(frame.elongation, frame.moonAlt, 384400); // Approximate moon distance

    const odeh = odehCriterion(arcv, wPrime);
    const yallop = yallopCriterion(frame.elongation, arcv, wPrime);

    const moonAgeFormatted = formatMoonAge(data.moonAgeHours);
    const moonAltDMS = formatDMS(frame.moonAlt);
    const elongationDMS = formatDMS(frame.elongation);

    // Format conjunction time for display
    const conjDate = new Date(data.conjunctionLocal);
    const conjFormatted = `${conjDate.getDate().toString().padStart(2, '0')}/${(conjDate.getMonth() + 1).toString().padStart(2, '0')}/${conjDate.getFullYear()}, ${conjDate.getHours().toString().padStart(2, '0')}:${conjDate.getMinutes().toString().padStart(2, '0')} LT`;

    if (locale === 'ar') {
        const zoneDescAr: Record<string, string> = {
            'A': 'يمكن رؤيته بسهولة بالعين المجردة',
            'B': 'قد يُرى بالعين المجردة في ظروف جيدة',
            'C': 'يتطلب أجهزة بصرية للرؤية',
            'D': 'لا يمكن رؤيته'
        };

        return `تحليل الرؤية

حدث الاقتران (القمر الجديد) في: ${conjFormatted}
عند غروب الشمس، كان عمر القمر ${moonAgeFormatted}
ارتفاع القمر: ${moonAltDMS}
الاستطالة: ${elongationDMS}

تقييم الرؤية (معيار ${criterion === 'odeh' ? 'عودة' : criterion === 'yallop' ? 'يالوب' : 'جنوب أفريقيا'}):
المنطقة ${odeh.zone}: ${zoneDescAr[odeh.zone]}

${odeh.zone === 'A' || odeh.zone === 'B' ? 'الهلال من المرجح أن يكون مرئياً.' : 'الهلال غير مرئي أو يتطلب أجهزة بصرية.'}`;
    }

    const zoneDescEn: Record<string, string> = {
        'A': 'Easily visible to naked eye',
        'B': 'May be visible to naked eye under good conditions',
        'C': 'Requires optical aid for visibility',
        'D': 'Not visible'
    };

    return `Visibility Analysis

The geocentric conjunction (new moon) occurred on: ${conjFormatted}
At sunset, the moon was ${moonAgeFormatted} old.
Moon altitude: ${moonAltDMS}
Elongation: ${elongationDMS}

Visibility Assessment (${criterion.charAt(0).toUpperCase() + criterion.slice(1)} Criterion):
Zone ${odeh.zone}: ${zoneDescEn[odeh.zone]}

${odeh.zone === 'A' || odeh.zone === 'B' ? 'The crescent is likely to be visible.' : 'The crescent is not visible or requires optical aid.'}`;
}

// ============================================
// CONJUNCTION CALCULATIONS (Geocentric vs Topocentric)
// ============================================

export type ConjunctionType = 'geocentric' | 'topocentric';

export interface ConjunctionResult {
    time: Date;
    type: ConjunctionType;
    moonPhase: number; // Moon phase angle at conjunction (should be ~0)
}

export interface ConjunctionComparison {
    geocentric: ConjunctionResult;
    topocentric: ConjunctionResult;
    differenceMinutes: number;
    differenceHours: number;
    topocentricIsEarlier: boolean;
}

/**
 * Find the geocentric new moon (conjunction) closest to the given date
 * Geocentric = as seen from Earth's center
 */
export function findGeocentricConjunction(
    startDate: Date,
    limitDays: number = 35
): ConjunctionResult | null {
    try {
        const startTime = Astronomy.MakeTime(startDate);

        // SearchMoonPhase finds when moon reaches specific phase
        // Phase 0 = new moon (geocentric conjunction)
        const conjunction = Astronomy.SearchMoonPhase(0, startTime, limitDays);

        if (!conjunction) {
            return null;
        }

        // Verify the phase at this time
        const moonPhase = Astronomy.MoonPhase(conjunction);

        return {
            time: conjunction.date,
            type: 'geocentric',
            moonPhase
        };
    } catch (error) {
        console.error('Error finding geocentric conjunction:', error);
        return null;
    }
}

/**
 * Calculate the topocentric ecliptic longitude difference between Sun and Moon
 * Returns the difference in degrees (0 at conjunction)
 */
function getTopocentricLongitudeDifference(
    lat: number,
    lon: number,
    time: Astronomy.AstroTime
): number {
    const observer = new Astronomy.Observer(lat, lon, 0);

    // Get topocentric equatorial coordinates for both bodies
    const sunEquator = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
    const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, time, observer, true, true);

    // Convert to ecliptic coordinates
    // We use the ecliptic-from-equator rotation
    const sunEcliptic = Astronomy.EclipticGeoMoon(time); // For comparison
    const moonEcliptic = Astronomy.EclipticGeoMoon(time);

    // For a proper topocentric calculation, we need to compute ecliptic longitude
    // from the topocentric equatorial coordinates
    // Using obliquity to convert RA/Dec to ecliptic lon/lat
    const obliquity = 23.439291111 * DEG2RAD; // Mean obliquity (approximate)

    // Sun ecliptic longitude (topocentric approximation - Sun parallax is negligible)
    // We use SunPosition to get the geocentric ecliptic longitude
    const sunPos = Astronomy.SunPosition(time);
    const sunLon = sunPos.elon;

    // Moon ecliptic longitude with topocentric correction
    // Convert Moon's topocentric RA/Dec to ecliptic longitude
    const moonRaRad = moonEquator.ra * 15 * DEG2RAD; // RA in hours to radians
    const moonDecRad = moonEquator.dec * DEG2RAD;

    // Ecliptic longitude from equatorial: tan(λ) = (sin(α)cos(ε) + tan(δ)sin(ε)) / cos(α)
    const sinRa = Math.sin(moonRaRad);
    const cosRa = Math.cos(moonRaRad);
    const tanDec = Math.tan(moonDecRad);
    const sinObl = Math.sin(obliquity);
    const cosObl = Math.cos(obliquity);

    let moonLon = Math.atan2(sinRa * cosObl + tanDec * sinObl, cosRa) * RAD2DEG;
    if (moonLon < 0) moonLon += 360;

    // Calculate difference (normalized to -180 to 180)
    let diff = moonLon - sunLon;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    return diff;
}

/**
 * Find the topocentric new moon (conjunction) for a specific observer location
 * Topocentric = as seen from observer's location on Earth's surface
 */
export function findTopocentricConjunction(
    lat: number,
    lon: number,
    startDate: Date,
    limitDays: number = 35
): ConjunctionResult | null {
    try {
        // First find the geocentric conjunction as a starting point
        const geocentric = findGeocentricConjunction(startDate, limitDays);
        if (!geocentric) {
            return null;
        }

        // Search around the geocentric time for the topocentric conjunction
        // The difference is typically within a few hours
        const searchStart = new Date(geocentric.time.getTime() - 12 * 60 * 60 * 1000); // 12 hours before
        const t1 = Astronomy.MakeTime(searchStart);
        const t2 = t1.AddDays(1); // Search window of 1 day

        // Use Astronomy.Search to find when longitude difference crosses zero
        const conjunction = Astronomy.Search(
            (t: Astronomy.AstroTime) => getTopocentricLongitudeDifference(lat, lon, t),
            t1,
            t2
        );

        if (!conjunction) {
            // Fallback to geocentric if search fails
            return {
                time: geocentric.time,
                type: 'topocentric',
                moonPhase: geocentric.moonPhase
            };
        }

        const moonPhase = Astronomy.MoonPhase(conjunction);

        return {
            time: conjunction.date,
            type: 'topocentric',
            moonPhase
        };
    } catch (error) {
        console.error('Error finding topocentric conjunction:', error);
        return null;
    }
}

/**
 * Get comparison between geocentric and topocentric conjunction times
 * This is useful for showing users the difference based on their location
 */
export function getConjunctionComparison(
    lat: number,
    lon: number,
    referenceDate: Date
): ConjunctionComparison | null {
    try {
        // Find geocentric conjunction
        const geocentric = findGeocentricConjunction(referenceDate, 35);
        if (!geocentric) {
            return null;
        }

        // Find topocentric conjunction for the observer
        const topocentric = findTopocentricConjunction(lat, lon, referenceDate, 35);
        if (!topocentric) {
            return null;
        }

        // Calculate difference in minutes
        const diffMs = topocentric.time.getTime() - geocentric.time.getTime();
        const differenceMinutes = diffMs / (1000 * 60);
        const differenceHours = differenceMinutes / 60;

        return {
            geocentric,
            topocentric,
            differenceMinutes: Math.abs(differenceMinutes),
            differenceHours: Math.abs(differenceHours),
            topocentricIsEarlier: diffMs < 0
        };
    } catch (error) {
        console.error('Error calculating conjunction comparison:', error);
        return null;
    }
}

/**
 * Get the next new moon date based on conjunction type
 */
export function getNextNewMoon(
    referenceDate: Date,
    conjunctionType: ConjunctionType,
    observer?: { lat: number; lon: number }
): Date | null {
    if (conjunctionType === 'topocentric' && observer) {
        const result = findTopocentricConjunction(observer.lat, observer.lon, referenceDate);
        return result?.time || null;
    }

    const result = findGeocentricConjunction(referenceDate);
    return result?.time || null;
}
