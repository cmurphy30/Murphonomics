/**
 * fred-data.js — Netlify serverless function
 *
 * Fetches economic time series from the Federal Reserve Economic Data (FRED) API.
 * This runs on Netlify's servers, not in the visitor's browser — so your API key
 * stays private and never appears in front-end code.
 *
 * Series fetched (all monthly, last 5 years unless noted):
 *   FEDFUNDS       — Federal Funds Rate
 *   DGS2           — 2-Year Treasury Yield (daily)
 *   DGS10          — 10-Year Treasury Yield (daily)
 *   PCEPI          — PCE Price Index (monthly; YoY % change derived below)
 *   BAMLC0A0CM     — Investment Grade Credit Spread / OAS (daily)
 *   BAMLH0A0HYM2   — High Yield Credit Spread / OAS (daily)
 *   DTWEXBGS       — U.S. Dollar Index / DXY (daily)
 *   DFII10         — 10-Year Real Yield / TIPS (daily)
 *   T10YIE         — 10-Year Breakeven Inflation Rate (daily)
 *   TDSP           — Household Debt Service Ratio (quarterly)
 *   USREC          — Recession Indicator: 0 = expansion, 1 = recession (monthly)
 *   CAPE           — Shiller CAPE Ratio (monthly)
 *
 * Derived series:
 *   pcepiyoy       — PCEPI year-over-year % change
 *   yieldCurveSpread — 10-Year minus 2-Year Treasury yield
 *
 * Called from the browser as: fetch('/.netlify/functions/fred-data')
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

// Returns a date string "YYYY-MM-DD" for exactly 5 years ago
function getObservationStart() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().split('T')[0];
}

// Fetch one FRED series and return clean [{ date, value }] objects
// FRED uses "." to mark missing values — those are filtered out
async function fetchSeries(seriesId, apiKey, observationStart) {
    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.searchParams.set('series_id',        seriesId);
    url.searchParams.set('api_key',          apiKey);
    url.searchParams.set('file_type',        'json');
    url.searchParams.set('observation_start', observationStart);
    url.searchParams.set('sort_order',       'asc');

    const res = await fetch(url.toString());
    if (!res.ok) {
        throw new Error(`FRED request failed for ${seriesId}: HTTP ${res.status}`);
    }

    const json = await res.json();

    return json.observations
        .filter(obs => obs.value !== '.')          // remove missing values
        .map(obs => ({
            date:  obs.date,
            value: parseFloat(obs.value)
        }));
}

// Calculate year-over-year % change for a monthly price index series
// For each data point, looks up the value from the same month last year
function calculateYoY(observations) {
    // Build a fast date -> value lookup
    const byDate = {};
    observations.forEach(obs => { byDate[obs.date] = obs.value; });

    return observations
        .map(obs => {
            const d = new Date(obs.date + 'T00:00:00Z'); // parse as UTC to avoid TZ shifts
            d.setUTCFullYear(d.getUTCFullYear() - 1);
            const yearAgoDate = d.toISOString().split('T')[0];

            if (byDate[yearAgoDate] === undefined) return null;

            const pct = ((obs.value - byDate[yearAgoDate]) / byDate[yearAgoDate]) * 100;
            return { date: obs.date, value: parseFloat(pct.toFixed(2)) };
        })
        .filter(Boolean); // drop entries where the prior year isn't available
}

// Calculate the spread (difference) between two time series, matched by date
// Used for: yield curve spread = DGS10 minus DGS2 on each shared date
function calculateSpread(seriesA, seriesB) {
    const bByDate = {};
    seriesB.forEach(obs => { bByDate[obs.date] = obs.value; });

    return seriesA
        .filter(obs => bByDate[obs.date] !== undefined)
        .map(obs => ({
            date:  obs.date,
            value: parseFloat((obs.value - bByDate[obs.date]).toFixed(3))
        }));
}

// ─── Handler ────────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
    const apiKey = process.env.FRED_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'FRED_API_KEY environment variable is not set.' })
        };
    }

    const observationStart = getObservationStart();

    // Maps FRED series ID -> the key name used in the returned JSON object
    const seriesMap = {
        FEDFUNDS:      'fedfunds',          // Federal Funds Rate
        DGS2:          'dgs2',              // 2-Year Treasury Yield
        DGS10:         'dgs10',             // 10-Year Treasury Yield
        PCEPI:         'pcepi',             // PCE Price Index (level; YoY derived below)
        BAMLC0A0CM:    'igSpread',          // Investment Grade Credit Spread
        BAMLH0A0HYM2:  'hySpread',          // High Yield Credit Spread
        DTWEXBGS:      'dollarIndex',       // U.S. Dollar Index (DXY)
        DFII10:        'realYield10y',      // 10-Year Real Yield (TIPS)
        T10YIE:        'breakevenInflation',// 10-Year Breakeven Inflation Rate
        TDSP:          'debtServiceRatio',  // Household Debt Service Ratio
        USREC:         'recession',         // Recession Indicator (0 or 1)
        CAPE:          'cape'               // Shiller CAPE Ratio
    };

    try {
        // Fetch all 12 series in parallel — much faster than fetching one at a time
        const fetchPromises = Object.entries(seriesMap).map(async ([fredId, key]) => {
            const data = await fetchSeries(fredId, apiKey, observationStart);
            return [key, data];
        });

        const results = await Promise.all(fetchPromises);

        // Turn the array of [key, data] pairs into a plain object
        const raw = Object.fromEntries(results);

        // ── Derived series ──────────────────────────────────────────────────

        // PCEPI YoY: how much has the PCE price index risen vs. one year ago?
        raw.pcepiyoy = calculateYoY(raw.pcepi);

        // Yield curve spread: 10-Year Treasury minus 2-Year Treasury
        // A negative value (inverted curve) is often a recession warning sign
        raw.yieldCurveSpread = calculateSpread(raw.dgs10, raw.dgs2);

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'   // allow browser requests from any domain
            },
            body: JSON.stringify(raw)
        };

    } catch (err) {
        console.error('fred-data error:', err.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
