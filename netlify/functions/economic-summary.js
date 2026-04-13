/**
 * economic-summary.js — Netlify serverless function
 *
 * Receives a snapshot of current economic data (pre-built by the frontend from
 * already-fetched FRED/BLS/BEA data) and asks Claude to write a plain-English
 * economic summary.
 *
 * Why this approach: the old version fetched three APIs AND called Claude in the
 * same function, which exceeded Netlify's 10-second timeout. Now the frontend
 * fetches data itself (using fred-data, bls-data, bea-data), extracts the latest
 * values into a flat "snapshot" object, and POSTs that here. This function only
 * does one thing: call Claude.
 *
 * After generating a summary, it saves the result to Netlify Blobs under the key
 * "summary-YYYY-MM" (e.g. "summary-2025-04"). This builds the archive that
 * get-summaries.js serves to the Market Updates page.
 *
 * Request:  POST with JSON body { snapshot: { fedFundsRate, headlineCPIYoY, ... } }
 * Response: { summary: "...", generatedAt: "...", month: "April 2025" }
 */

const { getStore } = require('@netlify/blobs');

// ─── Prompt formatting ───────────────────────────────────────────────────────

// Format the snapshot object as labeled text that Claude can read easily
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

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const summaryToken = process.env.SUMMARY_TOKEN;

    if (!anthropicKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'ANTHROPIC_API_KEY environment variable is not set.' })
        };
    }

    // Token check — rejects requests that don't include the right x-site-token header.
    // The token isn't secret (it lives in frontend JS), but it prevents random public
    // abuse of this endpoint from outside the site.
    if (summaryToken) {
        const clientToken = event.headers['x-site-token'];
        if (clientToken !== summaryToken) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Unauthorized.' })
            };
        }
    }

    // This function expects a POST request with a snapshot in the body
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
        };
    }

    let snapshot;
    try {
        const body = JSON.parse(event.body || '{}');
        snapshot = body.snapshot;
    } catch {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid JSON in request body.' })
        };
    }

    if (!snapshot) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Request body must include a "snapshot" object.' })
        };
    }

    try {
        const dataText = formatSnapshotForPrompt(snapshot);

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method:  'POST',
            headers: {
                'x-api-key':         anthropicKey,
                'anthropic-version': '2023-06-01',
                'content-type':      'application/json'
            },
            body: JSON.stringify({
                // Sonnet is faster than Opus for a function that needs to finish quickly
                model:      'claude-sonnet-4-6',
                max_tokens: 1024,

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
            const errText = await claudeRes.text().catch(() => '');
            throw new Error(`Claude API error: HTTP ${claudeRes.status}${errText ? ' — ' + errText : ''}`);
        }

        const claudeJson  = await claudeRes.json();
        const summaryText = claudeJson.content[0].text;
        const now         = new Date();
        const generatedAt = now.toISOString();

        // Human-readable month label included in the response so the frontend
        // can display it without re-parsing the ISO timestamp (e.g. "April 2025")
        const month = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // ── Save to Netlify Blobs ─────────────────────────────────────────────
        // Key format: "summary-YYYY-MM" (e.g. "summary-2025-04").
        // If a summary for this month already exists it gets overwritten — that's
        // fine; only one summary per month is expected.
        // Wrapped in try/catch so a Blobs failure doesn't break the response.
        try {
            const store      = getStore('summaries');
            const monthKey   = `summary-${now.toISOString().slice(0, 7)}`; // "YYYY-MM"
            await store.setJSON(monthKey, { summary: summaryText, generatedAt, month });
        } catch (blobErr) {
            console.warn('economic-summary: failed to save to Blobs:', blobErr.message);
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ summary: summaryText, generatedAt, month })
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
