/**
 * cache.js — Client-side cache using localStorage.
 *
 * Stores API responses so the dashboard doesn't re-fetch data on every page
 * load. Each entry is stamped with a timestamp and expires after a TTL.
 * Once expired, getFromCache returns null and the caller should fetch fresh data.
 *
 * Usage:
 *   saveToCache('gdp', data);                        // store data under the key 'gdp'
 *   const data = getFromCache('gdp');                // returns data, or null if missing/expired (24h TTL)
 *   const sum  = getFromCache('summary', SUMMARY_CACHE_TTL_MS); // 30-day TTL for the AI summary
 */

// Default TTL: 24 hours — used for FRED, BLS, BEA data
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Extended TTL: 30 days — used for the AI-generated economic summary.
// The summary is regenerated monthly; no need to re-fetch it every day.
const SUMMARY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function saveToCache(key, data) {
    const entry = {
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem('murphonomics_' + key, JSON.stringify(entry));
}

// ttl is optional — defaults to CACHE_TTL_MS (24 hours).
// Pass SUMMARY_CACHE_TTL_MS when reading the 'summary' key.
function getFromCache(key, ttl) {
    const raw = localStorage.getItem('murphonomics_' + key);
    if (!raw) return null;

    const entry  = JSON.parse(raw);
    const maxAge = ttl !== undefined ? ttl : CACHE_TTL_MS;

    if (Date.now() - entry.timestamp > maxAge) {
        localStorage.removeItem('murphonomics_' + key);
        return null;
    }

    return entry.data;
}
