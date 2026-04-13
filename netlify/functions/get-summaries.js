/**
 * get-summaries.js — Netlify serverless function
 *
 * Reads all archived economic summaries from Netlify Blobs and returns them
 * as a JSON array sorted newest to oldest.
 *
 * Each summary was stored by economic-summary.js under the key "summary-YYYY-MM"
 * (e.g. "summary-2025-04") with the shape:
 *   { summary: "...", generatedAt: "ISO timestamp", month: "April 2025" }
 *
 * Called from: market-updates.html
 * Response: JSON array of summary objects, newest first
 */

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event, context) {
    // Only GET requests are accepted
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed. Use GET.' })
        };
    }

    try {
        const store = getStore('summaries');

        // List all blob keys in the store (these are the "summary-YYYY-MM" keys)
        const { blobs } = await store.list();

        if (!blobs || blobs.length === 0) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type':                'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify([])
            };
        }

        // Fetch each summary object in parallel
        const results = await Promise.all(
            blobs.map(blob => store.get(blob.key, { type: 'json' }))
        );

        // Filter out any null results (safety net), then sort newest first.
        // "summary-YYYY-MM" keys sort lexicographically in the same order as dates,
        // so reversing the alphabetical order gives us newest first.
        const summaries = results
            .filter(Boolean)
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(summaries)
        };

    } catch (err) {
        console.error('get-summaries error:', err.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
