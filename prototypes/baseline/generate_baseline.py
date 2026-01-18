"""
Baseline Reference Generator
Generates ground-truth visibility data using the original Skyfield implementation.
Run this first to create baseline.json that prototypes will compare against.
"""

import sys
import os
import json

# Add parent directory to path to import from app.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from skyfield.api import load, wgs84
from skyfield import almanac
from datetime import datetime, timezone, timedelta
import numpy as np

# Load ephemeris (same as app.py)
eph = load("de421.bsp")
ts = load.timescale()
SUN = eph["sun"]
MOON = eph["moon"]
EARTH = eph["earth"]

RAD2DEG = 180.0 / np.pi
DEG2RAD = np.pi / 180.0

def find_sunset(lat, lon, year, month, day):
    """Find sunset time for a location."""
    observer = EARTH + wgs84.latlon(lat, lon)
    base_dt = datetime(year, month, day, 12, 0, 0, tzinfo=timezone.utc)
    t_start = ts.from_datetime(base_dt - timedelta(hours=12))
    t_end = ts.from_datetime(base_dt + timedelta(hours=36))
    
    t_sunsets, _ = almanac.find_settings(observer, SUN, t_start, t_end)
    if len(t_sunsets) == 0:
        return None
    return t_sunsets[0]

def get_moon_sun_data(lat, lon, t):
    """Get topocentric moon/sun data at time t."""
    observer = EARTH + wgs84.latlon(lat, lon)
    
    sun_app = observer.at(t).observe(SUN).apparent()
    moon_app = observer.at(t).observe(MOON).apparent()
    
    sun_alt, sun_az, _ = sun_app.altaz()
    moon_alt, moon_az, _ = moon_app.altaz()
    
    # Elongation
    elong = sun_app.separation_from(moon_app)
    
    # Moon distance for width calculation
    moon_dist = observer.at(t).observe(MOON).distance().km
    
    # Illumination
    illum = almanac.fraction_illuminated(eph, 'moon', t)
    
    return {
        "sun_alt": sun_alt.degrees,
        "sun_az": sun_az.degrees,
        "moon_alt": moon_alt.degrees,
        "moon_az": moon_az.degrees,
        "elongation": elong.degrees,
        "moon_dist": moon_dist,
        "illumination": illum
    }

def calc_crescent_width(arcl_deg, moon_alt_deg, dist_km):
    """Calculate crescent semi-width in arcminutes."""
    earth_radius = 6378.137
    sin_pi = min(earth_radius / dist_km, 1.0)
    pi_rad = np.arcsin(sin_pi)
    h_rad = np.radians(moon_alt_deg)
    sd_rad = 0.27245 * pi_rad
    sd_prime_rad = sd_rad * (1.0 + np.sin(h_rad) * np.sin(pi_rad))
    arcl_rad = np.radians(arcl_deg)
    w_prime_rad = sd_prime_rad * (1.0 - np.cos(arcl_rad))
    return np.degrees(w_prime_rad) * 60.0

def yallop_criterion(arcl, arcv, w_prime):
    """Yallop q-value and classification."""
    f = 11.8371 - 6.3226 * w_prime + 0.7319 * (w_prime**2) - 0.1018 * (w_prime**3)
    q = (arcv - f) / 10.0
    
    if q > 0.216:
        return q, 'A', 'naked_eye_easy'
    elif q > -0.014:
        return q, 'B', 'naked_eye_perfect'
    elif q > -0.160:
        return q, 'C', 'mixed_optical_helpful'
    elif q > -0.232:
        return q, 'D', 'optical_required'
    elif q > -0.293:
        return q, 'E', 'not_visible_telescope'
    else:
        return q, 'F', 'not_visible'

def odeh_criterion(arcv, w_arcmin):
    """Odeh V-value and classification."""
    curve = (-0.1018 * (w_arcmin**3) + 0.7319 * (w_arcmin**2) - 6.3226 * w_arcmin + 7.1651)
    v = arcv - curve
    
    if v >= 5.65:
        return v, 'A', 'naked_eye'
    elif v >= 2.0:
        return v, 'B', 'naked_eye'
    elif v >= -0.96:
        return v, 'C', 'optical_aid'
    else:
        return v, 'D', 'not_visible'

def generate_baseline():
    """Generate baseline data for a longitudinal line."""
    
    # Test parameters
    test_date = (2026, 2, 18)  # Day after new moon for better visibility
    test_lon = 30.0  # 30°E longitude (Egypt/Eastern Europe)
    latitudes = list(range(-60, 65, 5))  # -60 to 60 in 5° steps
    
    results = []
    
    print(f"Generating baseline for {len(latitudes)} points...")
    print(f"Date: {test_date[0]}-{test_date[1]:02d}-{test_date[2]:02d}")
    print(f"Longitude: {test_lon}°E")
    print("-" * 60)
    
    for lat in latitudes:
        print(f"  Calculating lat={lat:+3d}°...", end=" ")
        
        # Find sunset
        t_sunset = find_sunset(lat, test_lon, *test_date)
        if t_sunset is None:
            print("No sunset (polar)")
            results.append({
                "lat": lat,
                "lon": test_lon,
                "error": "no_sunset"
            })
            continue
        
        # Get moon/sun data at sunset
        data = get_moon_sun_data(lat, test_lon, t_sunset)
        
        # Calculate derived values
        arcl = data["elongation"]
        arcv = data["moon_alt"] - data["sun_alt"]
        w_prime = calc_crescent_width(arcl, data["moon_alt"], data["moon_dist"])
        
        # Apply criteria
        q, y_class, y_vis = yallop_criterion(arcl, arcv, w_prime)
        v, o_zone, o_vis = odeh_criterion(arcv, w_prime)
        
        result = {
            "lat": lat,
            "lon": test_lon,
            "sunset_jd": t_sunset.tt,
            "sunset_iso": t_sunset.utc_iso(),
            "sun_alt": round(data["sun_alt"], 4),
            "sun_az": round(data["sun_az"], 4),
            "moon_alt": round(data["moon_alt"], 4),
            "moon_az": round(data["moon_az"], 4),
            "elongation": round(arcl, 4),
            "arcv": round(arcv, 4),
            "moon_dist_km": round(data["moon_dist"], 2),
            "w_prime": round(w_prime, 4),
            "illumination": round(data["illumination"], 6),
            "yallop_q": round(q, 4),
            "yallop_class": y_class,
            "odeh_v": round(v, 4),
            "odeh_zone": o_zone
        }
        results.append(result)
        print(f"Moon alt={data['moon_alt']:.2f}°, Odeh={o_zone}")
    
    # Save to JSON
    output = {
        "meta": {
            "date": f"{test_date[0]}-{test_date[1]:02d}-{test_date[2]:02d}",
            "longitude": test_lon,
            "lat_range": [-60, 60],
            "lat_step": 5,
            "generated_with": "Skyfield + DE421",
            "description": "Baseline reference data for prototype comparison"
        },
        "points": results
    }
    
    output_path = os.path.join(os.path.dirname(__file__), "baseline.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    
    print("-" * 60)
    print(f"Saved to: {output_path}")
    print(f"Total points: {len(results)}")

if __name__ == "__main__":
    generate_baseline()
