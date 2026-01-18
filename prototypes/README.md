# Browser Astronomy Prototypes

This folder contains two proof-of-concept implementations for running crescent visibility calculations entirely in the browser.

## Goal
Calculate moon visibility along a longitudinal line (30°E, from -60° to +60° latitude) and compare:
1. Accuracy against the original Python/Skyfield implementation
2. Download size and performance

## Prototypes

### 1. `pyodide-test/`
Runs Python + Skyfield + NumPy directly in the browser using Pyodide (WebAssembly).
- **Pros**: Reuses existing Python code
- **Cons**: ~40MB download

### 2. `js-astronomy/`
Uses the Astronomy Engine library (JavaScript) with ported Yallop/Odeh functions.
- **Pros**: ~200KB download, fast
- **Cons**: Requires code port

## Test Parameters
- **Date**: 2026-02-17 (next new moon)
- **Longitude**: 30°E (Egypt/Eastern Europe line)
- **Latitudes**: -60° to +60° in 5° steps
- **Evaluation Time**: Sunset

## How to Run

Each prototype has its own `index.html` that can be opened directly in a browser.
