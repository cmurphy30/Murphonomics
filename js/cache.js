/**
 * cache.js — Client-side cache using localStorage.
 *
 * Stores API responses so the dashboard doesn't re-fetch data on every page
 * load. Each entry is stamped with a timestamp and expires after 24 hours.
 * Once expired, getFromCache returns null and the caller should fetch fresh data.
 *
 * Usage:
 *   saveToCache('gdp', data);          // store data under the key 'gdp'
 *   const data = getFromCache('gdp');  // returns data, or null if missing/expired
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function saveToCache(key, data) {
    const entry = {
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem('murphonomics_' + key, JSON.stringify(entry));
}

function getFromCache(key) {
    const raw = localStorage.getItem('murphonomics_' + key);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        localStorage.removeItem('murphonomics_' + key);
        return null;
    }

    return entry.data;
}
