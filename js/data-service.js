/**
 * data-service.js — Front-end data layer for Murphonomics
 *
 * This is the single place in the front-end that talks to the Netlify
 * serverless functions. No other file should make fetch() calls to the
 * API functions — everything goes through getData() here.
 *
 * What this file does:
 *   - Before making any network request, checks localStorage for cached data
 *     (cache expires after 24 hours — managed by js/cache.js)
 *   - If the cache is empty or expired, calls the appropriate Netlify function
 *   - If a data source fails, the page still loads — the failed source returns
 *     null and its error is collected in data.errors
 *
 * ─── How to use ────────────────────────────────────────────────────────────
 *
 *   const data = await getData();
 *
 *   data.fred.fedfunds           // [{ date, value }, ...]  Federal Funds Rate
 *   data.fred.yieldCurveSpread   // 10Y minus 2Y spread
 *   data.bls.headlineCPIYoY      // CPI year-over-year % change
 *   data.bls.realWageGrowth      // real wage growth series
 *   data.bea.realGDP             // quarterly GDP growth
 *   data.summary.summary         // AI-generated summary text
 *   data.summary.snapshot        // flat object of most-recent values
 *   data.errors                  // array of error strings (empty if all OK)
 *
 * ─── Script tag order ──────────────────────────────────────────────────────
 *
 *   js/cache.js must be loaded BEFORE this file. cache.js defines
 *   saveToCache() and getFromCache(), which this file depends on.
 *
 *   <script src="js/cache.js"></script>
 *   <script src="js/data-service.js"></script>
 */

// ─── Configuration ──────────────────────────────────────────────────────────

// Each entry maps a short name to:
//   endpoint — the Netlify function URL (always starts with /.netlify/functions/)
//   label    — a readable name used in error messages shown to the user
const DATA_SOURCES = [
    {
        key:      'fred',
        endpoint: '/.netlify/functions/fred-data',
        label:    'Federal Reserve (FRED) data'
    },
    {
        key:      'bls',
        endpoint: '/.netlify/functions/bls-data',
        label:    'Bureau of Labor Statistics data'
    },
    {
        key:      'bea',
        endpoint: '/.netlify/functions/bea-data',
        label:    'Bureau of Economic Analysis data'
    },
    {
        key:      'summary',
        endpoint: '/.netlify/functions/economic-summary',
        label:    'AI-generated economic summary'
    }
];

// ─── Core fetch logic ────────────────────────────────────────────────────────

// Fetch a single data source, using the localStorage cache when available.
// If cache is stale or missing, fetches from the Netlify function and saves
// the result back to cache for the next 24 hours.
async function fetchSource(source) {
    // Check the cache first — avoids a network call on repeat visits
    const cached = getFromCache(source.key);
    if (cached) {
        return cached;
    }

    // Cache miss: call the Netlify function
    const response = await fetch(source.endpoint);

    if (!response.ok) {
        throw new Error(`${source.label} returned HTTP ${response.status}`);
    }

    const data = await response.json();

    // If the serverless function itself returned an error in the body, surface it
    if (data && data.error) {
        throw new Error(`${source.label}: ${data.error}`);
    }

    // Save to cache so the next visit (within 24 hours) skips this network call
    saveToCache(source.key, data);

    return data;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * getData() — fetch all economic data and return it as one object.
 *
 * All four sources are fetched at the same time (in parallel).
 * If one source fails, the others still succeed — the failed one is null
 * and its error message appears in data.errors.
 *
 * This function never throws. Errors are always captured and returned
 * in data.errors so the calling code doesn't need a try/catch.
 *
 * @returns {Promise<{
 *   fred:    object|null,
 *   bls:     object|null,
 *   bea:     object|null,
 *   summary: object|null,
 *   errors:  string[]
 * }>}
 */
async function getData() {
    // Promise.allSettled runs all four fetches in parallel and never throws —
    // each result is either { status: 'fulfilled', value } or { status: 'rejected', reason }
    const results = await Promise.allSettled(
        DATA_SOURCES.map(source => fetchSource(source))
    );

    const output = { errors: [] };

    results.forEach((result, i) => {
        const source = DATA_SOURCES[i];

        if (result.status === 'fulfilled') {
            // Success — store the data under its short key (fred, bls, bea, summary)
            output[source.key] = result.value;
        } else {
            // Failure — store null so calling code can check for it
            output[source.key] = null;
            const msg = `Could not load ${source.label}: ${result.reason?.message || 'Unknown error'}`;
            output.errors.push(msg);
            console.warn('[data-service]', msg);
        }
    });

    return output;
}

// ─── Error display helper ────────────────────────────────────────────────────

/**
 * showDataErrors(errors) — display a non-breaking error notice on the page.
 *
 * If any data sources failed, this function shows the error messages in the
 * #errorMessage element (which already exists in the HTML). The page still
 * works — only the failed data source is missing.
 *
 * Usage:
 *   const data = await getData();
 *   showDataErrors(data.errors);
 *
 * @param {string[]} errors — the data.errors array returned by getData()
 */
function showDataErrors(errors) {
    if (!errors || errors.length === 0) return;

    const container = document.getElementById('errorMessage');
    if (!container) return;

    container.style.display = 'block';
    // Build one paragraph per error message
    container.innerHTML = errors
        .map(msg => `<p>${msg}</p>`)
        .join('');
}
