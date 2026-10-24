/**
 * economy-weights.js — Netlify serverless function
 *
 * Scores the current month's saved economic write-up into 11 weights (0..1),
 * one per homepage 3D arm, plus up to 3 "driver" keys and a one-line caption.
 *
 * Flow (GET only):
 *   1. monthKey = "weights-YYYY-MM" (UTC). If the 'economy-weights' store has it, return it.
 *   2. Otherwise read "summary-YYYY-MM" from the 'summaries' store (read-only).
 *      No summary yet → 404 { error: "no summary yet" } (front end keeps defaults).
 *   3. Ask Claude to score the summary text, validate strictly, save, return.
 *      Any invalid response → 502 and nothing is written.
 *
 * Uses its own 'economy-weights' store and never writes to 'summaries'
 * (get-summaries.js lists every blob there for the Market Updates page).
 *
 * Response: { weights: {...11 keys}, drivers: [...], caption, month, generatedAt }
 */

// Arm keys and the dashboard titles Claude is told they correspond to
const VARIABLES = {
    inflation:      'Inflation Comparison (headline CPI, core CPI, PCE vs. the 2% target)',
    wages:          'Real vs. Nominal Wage Growth',
    participation:  'Labor Force Participation Rate',
    gdp:            'Real GDP Growth',
    debt_service:   'Household Debt Service Ratio',
    credit_spreads: 'Credit Spreads (OAS) — high-yield and investment-grade corporate bond spreads',
    cape:           'Shiller CAPE Ratio (stock market valuation)',
    dxy:            'U.S. Dollar Index (DXY)',
    real_yield:     'Real Yield & Breakeven Inflation (10-year TIPS yield and market inflation expectations)',
    yield_curve:    '10Y–2Y Yield Curve Spread',
    fed_funds:      'Fed Funds Rate (Federal Reserve policy rate)'
};
const KEYS = Object.keys(VARIABLES);

const HEADERS = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*'
};

function respond(statusCode, body) {
    return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

// ─── Validation ──────────────────────────────────────────────────────────────

// Returns { weights, drivers, caption } or throws with a reason
function validate(rawText) {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!parsed || typeof parsed.weights !== 'object' || parsed.weights === null) {
        throw new Error('missing "weights" object');
    }

    const weights = {};
    KEYS.forEach(key => {
        const n = Number(parsed.weights[key]);
        if (parsed.weights[key] === null || parsed.weights[key] === '' || !Number.isFinite(n)) {
            throw new Error(`weight "${key}" missing or not a number`);
        }
        weights[key] = Math.min(Math.max(n, 0), 1);
    });

    const drivers = (Array.isArray(parsed.drivers) ? parsed.drivers : [])
        .filter((k, i, arr) => KEYS.includes(k) && arr.indexOf(k) === i)
        .slice(0, 3);

    if (typeof parsed.caption !== 'string') throw new Error('caption is not a string');
    const caption = parsed.caption.trim().slice(0, 140);

    return { weights, drivers, caption };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const summaryToken = process.env.SUMMARY_TOKEN;

    if (!anthropicKey) {
        console.error('[economy-weights] ANTHROPIC_API_KEY is not set');
        return respond(500, { error: 'ANTHROPIC_API_KEY environment variable is not set.' });
    }

    // Same token check as economic-summary.js (not secret; blocks casual outside use)
    if (summaryToken && event.headers['x-site-token'] !== summaryToken) {
        return respond(401, { error: 'Unauthorized.' });
    }

    if (event.httpMethod !== 'GET') {
        return respond(405, { error: 'Method not allowed. Use GET.' });
    }

    const yearMonth = new Date().toISOString().slice(0, 7);
    const monthKey  = `weights-${yearMonth}`;

    let weightStore, summaryStore;
    try {
        const { getStore } = require('@netlify/blobs');
        const opts = { siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_TOKEN };
        weightStore  = getStore({ name: 'economy-weights', ...opts });
        summaryStore = getStore({ name: 'summaries', ...opts });

        // 1. Already scored this month → return as-is
        const existing = await weightStore.get(monthKey, { type: 'json' });
        if (existing && existing.weights) return respond(200, existing);
    } catch (blobErr) {
        console.error('[economy-weights] failed to read Blobs:', blobErr.message);
        return respond(503, { error: 'Weights storage is unavailable.' });
    }

    // 2. This month's write-up (read-only)
    let summary;
    try {
        summary = await summaryStore.get(`summary-${yearMonth}`, { type: 'json' });
    } catch (blobErr) {
        console.error('[economy-weights] failed to read summary:', blobErr.message);
        return respond(503, { error: 'Summary storage is unavailable.' });
    }
    if (!summary || !summary.summary) return respond(404, { error: 'no summary yet' });

    // 3. Score it with Claude
    try {
        const definitions = KEYS.map(k => `- "${k}": ${VARIABLES[k]}`).join('\n');

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method:  'POST',
            headers: {
                'x-api-key':         anthropicKey,
                'anthropic-version': '2023-06-01',
                'content-type':      'application/json'
            },
            body: JSON.stringify({
                model:      'claude-sonnet-4-6', // same model as economic-summary.js
                max_tokens: 400,

                system: `You score how central each economic variable was to the narrative of a monthly economic write-up.

The variables, keyed by id, with their dashboard titles:
${definitions}

Return ONLY a JSON object, no markdown and no code fences, in exactly this shape:
{"weights":{"inflation":0,"wages":0,"participation":0,"gdp":0,"debt_service":0,"credit_spreads":0,"cape":0,"dxy":0,"real_yield":0,"yield_curve":0,"fed_funds":0},"drivers":["key"],"caption":"..."}

Rules:
- weights: numbers from 0 to 1 for all 11 keys. The 2-3 variables the write-up leans on hardest get 0.75-1.0; variables mentioned in passing get 0.3-0.5; variables not mentioned get 0.1-0.2.
- drivers: up to 3 keys, the variables the write-up leans on hardest, most central first.
- caption: one sentence, at most 140 characters, plain English, about what is driving the economy this month.`,

                messages: [
                    { role: 'user', content: summary.summary }
                ]
            })
        });

        if (!claudeRes.ok) {
            const errText = await claudeRes.text().catch(() => '');
            console.error('[economy-weights] Claude error:', claudeRes.status, errText);
            return respond(502, { error: `Claude API error: HTTP ${claudeRes.status}` });
        }

        const claudeJson = await claudeRes.json();
        const rawText = claudeJson && claudeJson.content && claudeJson.content[0] && claudeJson.content[0].text;
        if (!rawText) return respond(502, { error: 'Claude returned no text.' });

        let result;
        try {
            result = validate(rawText);
        } catch (validErr) {
            console.error('[economy-weights] invalid Claude response:', validErr.message, rawText.slice(0, 300));
            return respond(502, { error: 'Invalid weights response: ' + validErr.message });
        }

        const now    = new Date();
        const record = {
            ...result,
            month:       now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
            generatedAt: now.toISOString()
        };

        // 4. Save, then return
        await weightStore.setJSON(monthKey, record);
        console.log('[economy-weights] saved', monthKey);
        return respond(200, record);

    } catch (err) {
        console.error('[economy-weights] handler error:', err.message);
        return respond(502, { error: err.message });
    }
};
