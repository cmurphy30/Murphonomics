/**
 * bls-data.js — Netlify serverless function
 *
 * Fetches labor and inflation data from the U.S. Bureau of Labor Statistics (BLS).
 * Uses BLS Public Data API v2. All four series are requested in a single batch
 * POST — the free tier allows up to 25 series per request.
 *
 * Series fetched:
 *   CUUR0000SA0     — Headline CPI (All Urban Consumers, All Items)
 *   CUUR0000SA0L1E  — Core CPI (All Items Less Food & Energy)
 *   CES0500000003   — Average Hourly Earnings (All Private Employees, nominal)
 *   LNS11300000     — Labor Force Participation Rate
 *
 * Derived series:
 *   headlineCPIYoY  — Headline CPI, year-over-year % change
 *   coreCPIYoY      — Core CPI, year-over-year % change
 *   realWageGrowth  — Nominal wage growth YoY minus headline CPI YoY
 *                     (how much purchasing power wages have actually gained or lost)
 *
 * Called from the browser as: fetch('/.netlify/functions/bls-data')
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

// BLS represents months as "M01" through "M12"
// This converts a year + period pair into a standard "YYYY-MM-01" date string
function toDate(year, period) {
    const month = period.replace('M', '').padStart(2, '0');
    return `${year}-${month}-01`;
}

// Sort an array of { date, value } objects oldest-first
function sortAsc(arr) {
    return arr.slice().sort((a, b) => a.date.localeCompare(b.date));
}

// Convert a raw BLS series (array of { year, period, value, ... }) into
// a clean array of { date, value } objects, sorted oldest-first
function toTimeSeries(rawData) {
    return sortAsc(
        rawData.map(obs => ({
            date:  toDate(obs.year, obs.period),
            value: parseFloat(obs.value)
        }))
    );
}

// Calculate year-over-year % change for a BLS series
// Matches each data point to the same month in the prior year
function calculateYoY(rawData) {
    // Build a lookup so we can quickly find "same period, prior year"
    // Key format: "YYYY-M##"  e.g. "2023-M03"
    const lookup = {};
    rawData.forEach(obs => {
        lookup[`${obs.year}-${obs.period}`] = parseFloat(obs.value);
    });

    return sortAsc(
        rawData
            .map(obs => {
                const priorYear  = String(parseInt(obs.year, 10) - 1);
                const priorValue = lookup[`${priorYear}-${obs.period}`];
                if (priorValue === undefined) return null;

                const current = parseFloat(obs.value);
                const yoy = ((current - priorValue) / priorValue) * 100;
                return { date: toDate(obs.year, obs.period), value: parseFloat(yoy.toFixed(2)) };
            })
            .filter(Boolean)
    );
}

// Real wage growth = nominal wage growth YoY minus headline CPI YoY
// A positive number means workers are gaining purchasing power;
// a negative number means inflation is outpacing paychecks
function calculateRealWageGrowth(earningsRaw, headlineCPIRaw) {
    const wageYoY = calculateYoY(earningsRaw);
    const cpiYoY  = calculateYoY(headlineCPIRaw);

    // Build a fast lookup for CPI YoY by date
    const cpiByDate = {};
    cpiYoY.forEach(obs => { cpiByDate[obs.date] = obs.value; });

    return wageYoY
        .filter(obs => cpiByDate[obs.date] !== undefined)
        .map(obs => ({
            date:  obs.date,
            value: parseFloat((obs.value - cpiByDate[obs.date]).toFixed(2))
        }));
}

// ─── Handler ────────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
    const apiKey = process.env.BLS_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'BLS_API_KEY environment variable is not set.' })
        };
    }

    const endYear   = new Date().getFullYear();
    const startYear = endYear - 5;

    const requestBody = {
        seriesid: [
            'CUUR0000SA0',     // Headline CPI
            'CUUR0000SA0L1E',  // Core CPI
            'CES0500000003',   // Average Hourly Earnings
            'LNS11300000'      // Labor Force Participation Rate
        ],
        startyear:       String(startYear),
        endyear:         String(endYear),
        registrationkey: apiKey
    };

    try {
        const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(requestBody)
        });

        if (!res.ok) {
            throw new Error(`BLS API request failed: HTTP ${res.status}`);
        }

        const json = await res.json();

        // BLS wraps API-level errors in the message array rather than HTTP codes
        if (json.status !== 'REQUEST_SUCCEEDED') {
            const msg = Array.isArray(json.message) ? json.message.join('; ') : 'Unknown BLS error';
            throw new Error(`BLS API error: ${msg}`);
        }

        // Index each returned series by its series ID for easy lookup
        const byId = {};
        json.Results.series.forEach(s => { byId[s.seriesID] = s.data; });

        const headlineCPIRaw = byId['CUUR0000SA0']     || [];
        const coreCPIRaw     = byId['CUUR0000SA0L1E']  || [];
        const earningsRaw    = byId['CES0500000003']   || [];
        const lfprRaw        = byId['LNS11300000']     || [];

        const result = {
            // Raw level series (useful for charting index levels over time)
            headlineCPI:       toTimeSeries(headlineCPIRaw),
            coreCPI:           toTimeSeries(coreCPIRaw),
            avgHourlyEarnings: toTimeSeries(earningsRaw),
            lfpr:              toTimeSeries(lfprRaw),

            // Derived series
            headlineCPIYoY:    calculateYoY(headlineCPIRaw),  // inflation rate
            coreCPIYoY:        calculateYoY(coreCPIRaw),      // core inflation rate
            realWageGrowth:    calculateRealWageGrowth(earningsRaw, headlineCPIRaw)
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(result)
        };

    } catch (err) {
        console.error('bls-data error:', err.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
