/**
 * economy.js — Homepage wire-up for the 3D economy point cloud (index.html only).
 *
 * Tests WebGL once on load. If it works, the cloud (js/economy-gl.js) is
 * created lazily when #economyStage comes within one viewport of the screen.
 * If WebGL is unavailable or creation fails, #economy gets the class "no-3d"
 * and no canvas is created.
 *
 * The 11 .arm elements (static HTML, chart panels rendered by snapshot.js) are
 * either floated around the cloud — positioned every frame from
 * cloud.project(i) — or, in list mode (≤768px or no-3d), shown as an accordion.
 *
 * Shape: each arm has a weight (lobe size) and a motion value (extra breathing
 * from how unusual its latest data move was). Both are keyed by arm key:
 *   Economy.setWeights({ fed_funds: 0.9 })   Economy.setMotion({ gdp: 0.4 })
 * Debug sliders: add ?debug=weights to the URL.
 */

const TAU = Math.PI * 2;

// Clockwise around the rim so related variables sit together; evenly spaced.
// Order must match the .arm elements in index.html.
const ARMS = [
    { key: 'inflation',      title: 'Inflation Comparison' },
    { key: 'wages',          title: 'Real vs. Nominal Wage Growth' },
    { key: 'participation',  title: 'Labor Force Participation Rate' },
    { key: 'gdp',            title: 'Real GDP Growth' },
    { key: 'debt_service',   title: 'Household Debt Service Ratio' },
    { key: 'credit_spreads', title: 'Credit Spreads (OAS)' },
    { key: 'cape',           title: 'Shiller CAPE Ratio' },
    { key: 'dxy',            title: 'U.S. Dollar Index (DXY)' },
    { key: 'real_yield',     title: 'Real Yield & Breakeven Inflation' },
    { key: 'yield_curve',    title: '10Y–2Y Yield Curve Spread' },
    { key: 'fed_funds',      title: 'Fed Funds Rate' }
].map((arm, i, all) => ({ ...arm, angle: (i / all.length) * TAU }));

// Lobe sizes used until real weights arrive (0..1)
const DEFAULT_WEIGHTS = {
    fed_funds: 0.9, inflation: 0.8, yield_curve: 0.6, real_yield: 0.5, gdp: 0.4, dxy: 0.4,
    credit_spreads: 0.35, wages: 0.35, participation: 0.3, cape: 0.3, debt_service: 0.25
};

// Series each panel charts (first series where a panel shows two); daily
// series are collapsed to month-end like the panels do
const MOTION_SERIES = {
    inflation:      d => d.bls && d.bls.headlineCPIYoY,
    wages:          d => d.bls && d.bls.realWageGrowth,
    participation:  d => d.bls && d.bls.lfpr,
    gdp:            d => d.bea && d.bea.realGDP,
    debt_service:   d => d.fred && d.fred.debtServiceRatio,
    credit_spreads: d => monthlyLast(d.fred && d.fred.hySpread),
    cape:           d => d.fred && d.fred.cape,
    dxy:            d => monthlyLast(d.fred && d.fred.dollarIndex),
    real_yield:     d => monthlyLast(d.fred && d.fred.realYield10y),
    yield_curve:    d => monthlyLast(d.fred && d.fred.yieldCurveSpread),
    fed_funds:      d => d.fred && d.fred.fedfunds
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Shared shape state (keyed by arm key); pushed to the cloud once it exists
const shape = {
    weights: { ...DEFAULT_WEIGHTS },
    motion:  Object.fromEntries(ARMS.map(a => [a.key, 0])),
    cloud:   null,
    onChange: null // debug panel hook
};

function toArray(obj) { return ARMS.map(a => obj[a.key] || 0); }

// Start rotated so the two heaviest lobes sit front-right, where their
// silhouette reads best (a lobe at angle θ faces screen-right when yaw = θ)
function initialYaw() {
    const top = ARMS.slice().sort((a, b) => shape.weights[b.key] - shape.weights[a.key]).slice(0, 2);
    const mid = Math.atan2(top.reduce((s, a) => s + Math.sin(a.angle), 0), top.reduce((s, a) => s + Math.cos(a.angle), 0));
    return mid - Math.PI / 6;
}

// Copy valid keys from obj into target, clamped to 0..1; unknown keys are ignored
function mergeValues(target, obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(target, key)) return;
        const n = Number(obj[key]);
        if (Number.isFinite(n)) target[key] = Math.min(Math.max(n, 0), 1);
    });
}

window.Economy = {
    setWeights(obj) {
        mergeValues(shape.weights, obj);
        if (shape.cloud) shape.cloud.setWeights(toArray(shape.weights));
        if (shape.onChange) shape.onChange();
    },
    setMotion(obj) {
        if (REDUCED_MOTION) return; // no motion layer under reduced motion
        mergeValues(shape.motion, obj);
        if (shape.cloud) shape.cloud.setMotion(toArray(shape.motion));
    }
};

// ── Live-data motion: |z-score| of the latest change vs the trailing 24 ───

function monthlyLast(series) {
    if (!Array.isArray(series)) return [];
    const byMonth = new Map();
    series.forEach(o => { if (o && typeof o.date === 'string') byMonth.set(o.date.slice(0, 7), o); });
    return Array.from(byMonth.values());
}

function motionScore(series) {
    if (!Array.isArray(series)) return 0;
    const v = series.map(o => (o ? Number(o.value) : NaN)).filter(Number.isFinite);
    const changes = [];
    for (let i = 1; i < v.length; i++) changes.push(v[i] - v[i - 1]);
    if (changes.length < 9) return 0; // too short to judge (quarterly series use what exists)
    const latest = changes[changes.length - 1];
    const trail = changes.slice(-25, -1);
    const mean = trail.reduce((s, x) => s + x, 0) / trail.length;
    const sd = Math.sqrt(trail.reduce((s, x) => s + (x - mean) * (x - mean), 0) / trail.length);
    if (!(sd > 1e-9)) return 0;
    return Math.min(Math.abs((latest - mean) / sd) / 3, 1);
}

window.addEventListener('murphonomics:data', e => {
    const data = e.detail || {};
    const motion = {};
    Object.keys(MOTION_SERIES).forEach(key => {
        try { motion[key] = motionScore(MOTION_SERIES[key](data)); }
        catch (_) { motion[key] = 0; }
    });
    window.Economy.setMotion(motion);
    loadMonthlyWeights();
});

// ── Monthly weights + caption (scored from the write-up by economy-weights) ──
// Runs once, after the live data has loaded so it never competes with charts.
// Any failure keeps DEFAULT_WEIGHTS and hides the caption.

let weightsRequested = false;

async function loadMonthlyWeights() {
    if (weightsRequested || typeof fetchEconomyWeights !== 'function') return;
    weightsRequested = true;
    const captionEl = document.getElementById('economyCaption');
    try {
        const result = await fetchEconomyWeights();
        if (!result || !result.weights) throw new Error('no weights');
        window.Economy.setWeights(result.weights);
        if (!captionEl) return;
        captionEl.textContent = typeof result.caption === 'string' ? result.caption : '';
        const titles = (Array.isArray(result.drivers) ? result.drivers : [])
            .map(key => (ARMS.find(a => a.key === key) || {}).title)
            .filter(Boolean);
        if (titles.length) {
            const drivers = document.createElement('span');
            drivers.className = 'economy-drivers';
            drivers.textContent = 'Driving this month: ' + titles.join(' and ');
            captionEl.appendChild(drivers);
        }
    } catch (_) {
        if (captionEl) captionEl.textContent = ''; // :empty hides it
    }
}

const OPEN_DELAY  = 120; // hover intent
const CLOSE_GRACE = 250;
const GAP         = 10;  // px between header and dropdown
const MARGIN      = 8;   // px kept clear of the viewport edge
const SVG_NS      = 'http://www.w3.org/2000/svg';

document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('economy');
    const stage   = document.getElementById('economyStage');
    const holder  = document.getElementById('economyCanvas');
    const svg     = document.getElementById('armConnectors');
    if (!section || !stage || !holder) return;

    const smallScreen = window.matchMedia('(max-width: 768px)');
    let cloud = null, openIndex = -1, listMode = false, modeSet = false;
    let raf = 0, onScreen = false, suppressFocusOpen = false;
    let stageW = 1, stageH = 1;

    // ── Arms: cache elements and build one connector line + diamond each ──

    const arms = ARMS.map((cfg, i) => {
        const el = stage.querySelector(`.arm[data-arm="${cfg.key}"]`);
        const line = document.createElementNS(SVG_NS, 'line');
        const mark = document.createElementNS(SVG_NS, 'polygon');
        svg.appendChild(line);
        svg.appendChild(mark);
        return {
            ...cfg, i, el, line, mark,
            header:   el.querySelector('.arm-header'),
            dropdown: el.querySelector('.arm-dropdown'),
            w: 0, h: 0, hover: false, opened: false, openT: 0, closeT: 0, held: null,
            lastT: '', lastO: '', lastZ: '', lastLine: '', lastMark: ''
        };
    });

    function measure() {
        stageW = holder.clientWidth || 1;
        stageH = holder.clientHeight || 1;
        arms.forEach(a => { a.w = a.header.offsetWidth; a.h = a.header.offsetHeight; });
    }

    // ── Floating positions, every frame from cloud.project(i) ─────────────

    function positionArms() {
        const cx = stageW / 2, cy = stageH / 2;
        for (const a of arms) {
            const p = cloud.project(a.i);
            let hx, hy;
            if ((a.hover || a.i === openIndex) && a.held) {
                // Hold the header still under the cursor while its lobe lifts;
                // the connector still follows the anchor
                [hx, hy] = a.held;
            } else {
                const dx = p.x - cx, dy = p.y - cy, len = Math.hypot(dx, dy) || 1;
                // Header sits just outside the anchor, nudged upward
                hx = p.x + (dx / len) * 34;
                hy = p.y + (dy / len) * 22 - 16;
                hx = Math.min(Math.max(hx, a.w / 2 + 6), stageW - a.w / 2 - 6);
                hy = Math.min(Math.max(hy, a.h / 2 + 6), stageH - a.h / 2 - 6);
                a.held = [hx, hy];
            }

            // Back-facing arms dim but stay hoverable; hovered/open arms are always full strength
            const active = a.hover || a.i === openIndex;
            const alpha  = p.visible || active ? 1 : 0.35;

            // Writes only (no layout reads), and only when a value changed
            const t = `translate3d(${(hx - a.w / 2).toFixed(1)}px, ${(hy - a.h / 2).toFixed(1)}px, 0)`;
            const o = String(alpha);
            const z = String(a.i === openIndex ? 1000000 : Math.round((1 - p.depth) * 100000)); // open arm on top
            if (t !== a.lastT) { a.el.style.transform = a.lastT = t; }
            if (o !== a.lastO) { a.el.style.opacity = a.lastO = o; a.line.setAttribute('opacity', o); a.mark.setAttribute('opacity', o); }
            if (z !== a.lastZ) { a.el.style.zIndex = a.lastZ = z; }

            const x = p.x.toFixed(1), y = p.y.toFixed(1);
            const lineKey = `${x},${y},${hx.toFixed(1)},${hy.toFixed(1)}`;
            if (lineKey !== a.lastLine) {
                a.lastLine = lineKey;
                a.line.setAttribute('x1', x); a.line.setAttribute('y1', y);
                a.line.setAttribute('x2', hx.toFixed(1)); a.line.setAttribute('y2', hy.toFixed(1));
                const px = p.x, py = p.y;
                a.mark.setAttribute('points', `${px},${py - 4} ${px + 4},${py} ${px},${py + 4} ${px - 4},${py}`);
            }
        }
    }

    function loop() {
        raf = 0;
        if (!running()) return;
        try {
            positionArms();
        } catch (err) {
            failTo2D(err);
            return;
        }
        raf = requestAnimationFrame(loop);
    }

    function running() { return cloud && !listMode && onScreen && !document.hidden; }
    function startLoop() { if (!raf && running()) raf = requestAnimationFrame(loop); }
    function stopLoop()  { if (raf) cancelAnimationFrame(raf); raf = 0; }

    // ── Open / close ──────────────────────────────────────────────────────

    function resizeCharts(a) {
        if (!window.Chart) return;
        a.dropdown.querySelectorAll('canvas').forEach(c => {
            const chart = Chart.getChart(c);
            if (chart) chart.resize();
        });
    }

    // Clamp horizontally inside the viewport; flip above if there is no room below
    function placeDropdown(a) {
        const dd = a.dropdown;
        dd.style.maxHeight = '';
        if (listMode) { dd.style.left = ''; dd.style.top = ''; return; }
        const hr  = a.header.getBoundingClientRect();
        const ddW = dd.offsetWidth, ddH = dd.offsetHeight;
        const sr = section.getBoundingClientRect(); // section clips sideways overflow
        const minLeft = Math.max(MARGIN, sr.left + MARGIN);
        const maxLeft = Math.min(window.innerWidth, sr.right) - ddW - MARGIN;
        let left = hr.left + hr.width / 2 - ddW / 2;
        left = Math.min(Math.max(left, minLeft), maxLeft);

        const below = window.innerHeight - hr.bottom - GAP - MARGIN;
        const above = hr.top - GAP - MARGIN;
        const flip  = ddH > below && above > below;
        // Taller than the room on either side: cap it and let it scroll inside
        const room  = Math.floor(flip ? above : below);
        const h     = Math.min(ddH, room);
        if (ddH > room) dd.style.maxHeight = room + 'px';
        dd.style.left = (left - hr.left).toFixed(1) + 'px';
        dd.style.top  = (flip ? -(h + GAP) : hr.height + GAP) + 'px';
        a.el.classList.toggle('flip', flip);
    }

    // Emphasis follows hover/open; rotation pauses while any arm is hovered or
    // open, so headers hold still under the cursor during the hover-intent delay
    function setEmphasis(a) {
        if (!cloud) return;
        cloud.setEmphasis(a.i, a.hover || a.i === openIndex ? 1 : 0);
        cloud.setPaused(openIndex >= 0 || arms.some(x => x.hover));
    }

    function open(i) {
        if (openIndex === i) return;
        if (openIndex >= 0) close(openIndex);
        const a = arms[i];
        openIndex = i;
        placeDropdown(a);
        a.el.classList.add('is-open');
        a.header.setAttribute('aria-expanded', 'true');
        setEmphasis(a);
        if (!a.opened || listMode) {
            a.opened = true;
            requestAnimationFrame(() => resizeCharts(a));
        }
        if (!listMode) positionArms();
    }

    function close(i) {
        if (openIndex !== i) return;
        const a = arms[i];
        clearTimeout(a.openT);
        openIndex = -1;
        a.el.classList.remove('is-open');
        a.header.setAttribute('aria-expanded', 'false');
        setEmphasis(a);
    }

    // ── Events ────────────────────────────────────────────────────────────

    arms.forEach(a => {
        let lastPointer = '';

        // Hover intent (mouse/pen only; touch uses tap)
        a.el.addEventListener('pointerenter', e => {
            if (e.pointerType === 'touch' || listMode) return;
            clearTimeout(a.closeT);
            a.hover = true; setEmphasis(a);
            if (openIndex !== a.i) a.openT = setTimeout(() => open(a.i), OPEN_DELAY);
        });
        a.el.addEventListener('pointerleave', e => {
            if (e.pointerType === 'touch' || listMode) return;
            clearTimeout(a.openT);
            a.hover = false; setEmphasis(a);
            a.closeT = setTimeout(() => close(a.i), CLOSE_GRACE);
        });

        a.header.addEventListener('pointerdown', e => { lastPointer = e.pointerType; });
        a.header.addEventListener('click', () => {
            // A mouse hover already opened it; a click shouldn't snap it shut
            const keepOpen = lastPointer === 'mouse' && !listMode;
            lastPointer = '';
            if (openIndex === a.i) { if (!keepOpen) close(a.i); }
            else { clearTimeout(a.openT); open(a.i); }
        });

        // Keyboard: focus opens (floating mode), Tab continues into the panel
        a.header.addEventListener('focus', () => {
            if (suppressFocusOpen || listMode) return;
            let keyboard = true;
            try { keyboard = a.header.matches(':focus-visible'); } catch (_) {}
            if (keyboard) open(a.i);
        });
        a.el.addEventListener('focusout', e => {
            // Only when focus moves to something else (clicking a chart blurs to nothing)
            if (!listMode && e.relatedTarget && !a.el.contains(e.relatedTarget)) close(a.i);
        });

        // Resize charts once the unfurl finishes
        a.dropdown.addEventListener('transitionend', e => {
            if (e.target === a.dropdown && e.propertyName === 'clip-path' && a.i === openIndex) resizeCharts(a);
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || openIndex < 0) return;
        const a = arms[openIndex];
        close(openIndex);
        suppressFocusOpen = true;
        a.header.focus();
        suppressFocusOpen = false;
    });

    // Tap/click outside closes (floating mode)
    document.addEventListener('pointerdown', e => {
        if (openIndex >= 0 && !listMode && !arms[openIndex].el.contains(e.target)) close(openIndex);
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) stopLoop(); else startLoop(); });

    // ── Layout mode: floating around the cloud, or list (≤768px / no-3d) ──

    function updateMode() {
        const list = smallScreen.matches || section.classList.contains('no-3d');
        if (list === listMode && modeSet) return;
        modeSet = true;
        listMode = list;
        if (openIndex >= 0) close(openIndex);
        section.classList.toggle('list-mode', list);
        if (list) {
            stopLoop();
            arms.forEach(a => {
                a.el.style.transform = a.el.style.opacity = a.el.style.zIndex = '';
                a.lastT = a.lastO = a.lastZ = a.lastLine = '';
                a.dropdown.style.left = a.dropdown.style.top = a.dropdown.style.maxHeight = '';
            });
        } else {
            measure();
            startLoop();
        }
    }

    if (smallScreen.addEventListener) smallScreen.addEventListener('change', updateMode);
    else smallScreen.addListener(updateMode);

    new ResizeObserver(() => { if (!listMode) measure(); }).observe(holder);
    if (document.fonts) document.fonts.ready.then(() => { if (!listMode) measure(); });

    new IntersectionObserver(entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) startLoop(); else stopLoop();
    }).observe(stage);

    // ── 3D cloud: create lazily, or fall back to the list ─────────────────

    function fallback() {
        section.classList.add('no-3d');
        updateMode();
    }

    // Any error from the 3D layer after creation: tear it down and show the list
    let failedOver = false;
    function failTo2D(err) {
        if (failedOver) return;
        failedOver = true;
        console.warn('[economy] 3D view stopped, showing the list instead:', err && err.message);
        stopLoop();
        const c = cloud;
        cloud = shape.cloud = null;
        if (c) { try { c.destroy(); } catch (_) {} }
        section.classList.remove('is-3d');
        fallback();
    }

    if (!window.EconomyGL || !webglAvailable()) { fallback(); return; }
    updateMode();

    const lazy = new IntersectionObserver((entries) => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        lazy.disconnect();
        try {
            cloud = shape.cloud = EconomyGL.create(holder, {
                angles:  ARMS.map(a => a.angle),
                weights: toArray(shape.weights),
                yaw:     initialYaw(),
                onError: failTo2D,
                ariaLabel: 'The economy as a 3D point cloud. Drag or use the arrow keys to rotate.'
            });
            if (!REDUCED_MOTION) cloud.setMotion(toArray(shape.motion));
            section.classList.add('is-3d');
            measure();
            startLoop();
        } catch (err) {
            console.warn('[economy] 3D unavailable:', err.message);
            cloud = null;
            fallback();
        }
    }, { rootMargin: '100% 0px' }); // "within one viewport" of the screen

    lazy.observe(stage);
});

// ── Debug panel: ?debug=weights → 11 sliders + "log JSON" ─────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (new URLSearchParams(location.search).get('debug') !== 'weights') return;

    const panel = document.createElement('div');
    panel.className = 'weights-debug';
    panel.innerHTML = '<p class="weights-debug-title">Weights</p>';
    ARMS.forEach(arm => {
        const row = document.createElement('label');
        row.className = 'weights-debug-row';
        row.innerHTML = `<span>${arm.title}</span><input type="range" min="0" max="1" step="0.01"><output></output>`;
        const input = row.querySelector('input'), out = row.querySelector('output');
        input.value = shape.weights[arm.key];
        out.textContent = (+input.value).toFixed(2);
        input.addEventListener('input', () => {
            out.textContent = (+input.value).toFixed(2);
            window.Economy.setWeights({ [arm.key]: +input.value });
        });
        panel.appendChild(row);
    });
    // Keep sliders in sync when weights change elsewhere (e.g. monthly weights arrive)
    shape.onChange = () => {
        panel.querySelectorAll('.weights-debug-row').forEach((row, i) => {
            const input = row.querySelector('input');
            input.value = shape.weights[ARMS[i].key];
            row.querySelector('output').textContent = (+input.value).toFixed(2);
        });
    };

    const log = document.createElement('button');
    log.type = 'button';
    log.textContent = 'log JSON';
    log.addEventListener('click', () => console.log(JSON.stringify(shape.weights, null, 2)));
    panel.appendChild(log);
    document.body.appendChild(panel);
});

// Create a throwaway context to check WebGL support, then release it.
function webglAvailable() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return false;
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        return true;
    } catch (err) {
        return false;
    }
}
