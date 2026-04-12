/**
 * economic-summary.js — Netlify serverless function
 *
 * The "smart" function. It:
 *   1. Calls the other three data functions (FRED, BLS, BEA) in parallel
 *   2. Extracts the single most-recent value for each economic indicator
 *   3. Sends that snapshot to the Claude AI API
 *   4. Returns a 500–700 word plain-English economic summary as JSON
 *
 * Because this function calls three external APIs AND the Claude API, it's
 * the most expensive one to run. The front-end caches its result for 24 hours
 * (see js/cache.js) so it only runs once per day per visitor, not on every load.
 *
 * Returns:
 *   {
 *     summary:     "Full text of the economic summary...",
 *     generatedAt: "2024-04-12T15:30:00.000Z",
 *     snapshot:    { fedFundsRate: "5.33", headlineCPIYoY: "3.2", ... }
 *   }
 *
 * Called from the browser as: fetch('/.netlify/functions/economic-summary')
 */

// Import the other three function handlers directly.
// This lets us call them in-process without making extra HTTP requests.
const fredHandler = require('./fred-data');
const blsHandler  = require('./bls-data');
const beaHandler  = require('./bea-data');

// ─── Data gathering ──────────────────────────────────────────────────────────

// Call all three data functions at the same time and return their results.
// If one fails, we still return the others — the summary will note missing data.
async function gatherAllData() {
    const [fredResult, blsResult, beaResult] = await Promise.allSettled([
        fredHandler.handler({}, {}),
        blsHandler.handler({}, {}),
        beaHandler.handler({}, {})
    ]);

    // Parse each result if it succeeded, or return an error placeholder
    const parse = result => {
        if (result.status !== 'fulfilled') {
            return { error: result.reason?.message || 'Unknown error' };
        }
        try {
            return JSON.parse(result.value.body);
        } catch {
            return { error: 'Could not parse response' };
        }
    };

    return {
        fred: parse(fredResult),
        bls:  parse(blsResult),
        bea:  parse(beaResult)
    };
}

// ─── Snapshot building ───────────────────────────────────────────────────────

// Get the last element of a time series array (the most recent data point)
function latest(series) {
    if (!Array.isArray(series) || series.length === 0) return null;
    return series[series.length - 1].value;
}

// Format a number to a fixed number of decimal places.
// Returns 'unavailable' if the value is missing so the prompt stays readable.
function fmt(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return 'unavailable';
    return Number(value).toFixed(decimals);
}

// Pull the most recent value from each series into a flat object.
// This is what gets sent to Claude — one number per indicator, not full histories.
function buildSnapshot(fred, bls, bea) {
    return {
        // GDP
        realGDPGrowth:       fmt(latest(bea.realGDP)),

        // Inflation
        headlineCPIYoY:      fmt(latest(bls.headlineCPIYoY)),
        coreCPIYoY:          fmt(latest(bls.coreCPIYoY)),
        pceInflationYoY:     fmt(latest(fred.pcepiyoy)),
        breakevenInflation:  fmt(latest(fred.breakevenInflation)),

        // Labor market
        lfpr:                fmt(latest(bls.lfpr), 1),
        avgHourlyEarnings:   fmt(latest(bls.avgHourlyEarnings)),
        realWageGrowth:      fmt(latest(bls.realWageGrowth)),

        // Monetary policy & rates
        fedFundsRate:        fmt(latest(fred.fedfunds)),
        treasury2y:          fmt(latest(fred.dgs2)),
        treasury10y:         fmt(latest(fred.dgs10)),
        yieldCurveSpread:    fmt(latest(fred.yieldCurveSpread)),   // 10Y minus 2Y
        realYield10y:        fmt(latest(fred.realYield10y)),

        // Credit markets
        igCreditSpread:      fmt(latest(fred.igSpread)),
        hyCreditSpread:      fmt(latest(fred.hySpread)),

        // Markets & asset prices
        cape:                fmt(latest(fred.cape), 1),
        dollarIndex:         fmt(latest(fred.dollarIndex)),

        // Consumer finance
        debtServiceRatio:    fmt(latest(fred.debtServiceRatio))
    };
}

// Format the snapshot as readable labeled text for the Claude prompt
function formatSnapshotForPrompt(s) {
    return `
CURRENT ECONOMIC DATA SNAPSHOT:

GDP & Growth:
  Real GDP Growth (annualized quarterly % change): ${s.realGDPGrowth}%

Inflation:
  Headline CPI (YoY):                     ${s.headlineCPIYoY}%
  Core CPI, ex food & energy (YoY):       ${s.coreCPIYoY}%
  PCE Inflation (YoY):                    ${s.pceInflationYoY}%
  10-Year Breakeven Inflation Rate:       ${s.breakevenInflation}%

Labor Market:
  Labor Force Participation Rate:         ${s.lfpr}%
  Average Hourly Earnings (nominal):      $${s.avgHourlyEarnings}
  Real Wage Growth (wages minus CPI):     ${s.realWageGrowth}%

Monetary Policy & Rates:
  Federal Funds Rate:                     ${s.fedFundsRate}%
  2-Year Treasury Yield:                  ${s.treasury2y}%
  10-Year Treasury Yield:                 ${s.treasury10y}%
  Yield Curve Spread (10Y minus 2Y):      ${s.yieldCurveSpread}%
  10-Year Real Yield (TIPS):              ${s.realYield10y}%

Credit Markets:
  Investment Grade Credit Spread (OAS):   ${s.igCreditSpread} bps
  High Yield Credit Spread (OAS):         ${s.hyCreditSpread} bps

Markets & Asset Prices:
  Shiller CAPE Ratio:                     ${s.cape}
  U.S. Dollar Index (DXY):               ${s.dollarIndex}

Consumer Finance:
  Household Debt Service Ratio:           ${s.debtServiceRatio}%
`.trim();
}

// ─── Handler ────────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'ANTHROPIC_API_KEY environment variable is not set.' })
        };
    }

    try {
        // Step 1: Fetch all economic data in parallel
        const { fred, bls, bea } = await gatherAllData();

        // Step 2: Distill each series down to its most recent value
        const snapshot = buildSnapshot(fred, bls, bea);

        // Step 3: Format the snapshot as labeled text for the prompt
        const dataText = formatSnapshotForPrompt(snapshot);

        // Step 4: Ask Claude to write the summary
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method:  'POST',
            headers: {
                'x-api-key':         anthropicKey,
                'anthropic-version': '2023-06-01',
                'content-type':      'application/json'
            },
            body: JSON.stringify({
                model:      'claude-opus-4-6',
                max_tokens: 1024,

                // Persona: analytical but accessible economics writer
                system: `You are an economics writer for Murphonomics, a personal economics blog. Write in a voice that is analytical but accessible — serious and data-driven, but never jargon-heavy. Your reader is intelligent but not an economist.`,

                messages: [
                    {
                        role:    'user',
                        content: `Using the following current economic data, write a 500–700 word economic summary structured in four paragraphs:

1. Headline macro picture (GDP + inflation + labor market)
2. Monetary policy and credit market context (Fed rate, yield curve, real yields, credit spreads)
3. Markets and asset prices (CAPE, DXY, breakeven inflation)
4. What this means for workers and wages (real purchasing power, debt service ratio)

${dataText}

Include specific numbers. Do not use bullet points — write in full paragraphs.`
                    }
                ]
            })
        });

        if (!claudeRes.ok) {
            // Try to include Claude's error message in our error
            const errText = await claudeRes.text().catch(() => '');
            throw new Error(`Claude API error: HTTP ${claudeRes.status}${errText ? ' — ' + errText : ''}`);
        }

        const claudeJson = await claudeRes.json();

        // Claude returns an array of content blocks; we want the first text block
        const summaryText = claudeJson.content[0].text;

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                summary:     summaryText,
                generatedAt: new Date().toISOString(),
                snapshot                          // include the raw numbers for potential front-end use
            })
        };

    } catch (err) {
        console.error('economic-summary error:', err.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
