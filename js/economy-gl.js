/**
 * economy-gl.js — Raw WebGL point cloud ("the economy, visualized").
 *
 * Dependency-free. Knows nothing about labels, charts, or the page — it only
 * draws into a canvas it creates inside the element it is given.
 *
 *   const cloud = EconomyGL.create(parentEl, { count, ariaLabel, angles, weights, yaw });
 *   (angles: 11 arm directions in radians around the rim; weights: 11 numbers 0..1;
 *    yaw: starting rotation in radians)
 *   cloud.setWeights([...11])        // lobe size per arm; morphs smoothly (~1.2s)
 *   cloud.setEmphasis(index, 0..1)   // adds up to SHAPE.EMPHASIS to that arm's weight (~0.3s)
 *   cloud.setMotion([...11])         // extra breathing near each arm, 0..1
 *   cloud.project(index)             // -> { x, y, depth, visible } at the arm's lobe tip, CSS px
 *   cloud.setPaused(bool)            // freezes rotation (autorotate off, drag inertia damps out)
 *   cloud.resize()
 *   cloud.destroy()
 *
 * The cloud is deformed entirely on the GPU. The same SHAPE constants feed the
 * shader (as #defines) and the JS anchor math in project(), so connectors end
 * on the bulge. Throws if WebGL is unavailable, so callers can fall back.
 */

(function () {
    'use strict';

    const ARMS      = 11;
    const STRIDE    = 8;                  // floats per point: pos(3) theta(1) seed(1) color(3)
    const TAU       = Math.PI * 2;
    const FOV       = 40 * Math.PI / 180;
    const BASE_DIST = 3.6;                // camera distance at wide aspect ratios (room for lobes)
    const PITCH0    = 0.5;                // default view looks down into the bowl (~29°)
    const PITCH_MAX = 25 * Math.PI / 180; // drag range around the default view
    const AUTO_SPIN = 0.15;               // rad/s
    const RESUME_MS = 3000;               // autorotate resumes this long after release

    // Smoothing time constants (seconds) for CPU-side uniform damping
    const TAU_WEIGHT   = 1.2;
    const TAU_EMPHASIS = 0.1;             // ~0.3s to settle
    const TAU_REDUCED  = 0.05;            // ~150ms ease under prefers-reduced-motion

    // Shape constants — shared by the shader and project()
    const SHAPE = {
        K:          7.0,   // lobe sharpness: pow(max(dot(dir, armDir), 0), K)
        AMP_OUT:    0.50,  // outward push per unit of summed influence
        AMP_UP:     0.20,  // upward lift per unit of summed influence
        NUDGE:      0.30,  // pull toward the arm's direction (makes lobes pointed)
        R_VOID:     0.32,  // empty dark void in the middle
        RIM_R:      1.0,   // anchor radius on the undeformed rim
        RIM_Y:      0.5,   // anchor height on the undeformed rim
        EMPHASIS:   0.15,  // max weight added by setEmphasis
        MOTION_CAP: 0.2    // motion breathing capped at 20% of the weight effect
    };

    // ── Shaders (GLSL ES 1.00 — works on every WebGL1 browser) ────────────────

    const VERT = `
#define K ${SHAPE.K.toFixed(4)}
#define AMP_OUT ${SHAPE.AMP_OUT.toFixed(4)}
#define AMP_UP ${SHAPE.AMP_UP.toFixed(4)}
#define NUDGE ${SHAPE.NUDGE.toFixed(4)}
#define R_VOID ${SHAPE.R_VOID.toFixed(4)}
#define RIM_R ${SHAPE.RIM_R.toFixed(4)}
#define MOTION_CAP ${SHAPE.MOTION_CAP.toFixed(4)}
attribute vec3 aPos;
attribute float aTheta;
attribute float aSeed;
attribute vec3 aColor;
uniform mat4 uMVP;
uniform float uTime;
uniform float uBreath;
uniform float uSize;
uniform float uDpr;
uniform vec3 uHi;
uniform float uW[11];
uniform float uM[11];
uniform vec3 uA[11];
varying vec3 vColor;
varying float vAlpha;
void main() {
    float r = length(aPos.xz);
    vec3 dir = vec3(aPos.x / r, 0.0, aPos.z / r);
    float ph = aSeed * 6.2831853;
    // Deformation grows from the void edge (0) to the rim (1)
    float t = smoothstep(R_VOID, RIM_R, r);

    float S = 0.0;          // summed weight influence
    float M = 0.0;          // summed motion influence
    vec3 pull = vec3(0.0);  // nudge toward arm directions
    for (int i = 0; i < 11; i++) {
        float f = pow(max(dot(dir, uA[i]), 0.0), K);
        S += uW[i] * f;
        M += uM[i] * f;
        pull += uW[i] * f * (uA[i] - dir);
    }

    vec3 p = aPos;
    p += (dir * (S * AMP_OUT) + pull * NUDGE) * t;
    p.y += S * AMP_UP * t;

    // Idle breathing + live-data motion near each arm (capped vs the weight effect)
    float motion = min(M, MOTION_CAP * S) * AMP_OUT * t;
    p += dir * (uBreath * (0.02 * sin(uTime * 0.9 + ph + aTheta * 3.0) + motion * sin(uTime * 2.2 + ph)));
    p.y += uBreath * 0.015 * sin(uTime * 0.6 + ph * 1.7 + aTheta * 2.0);

    gl_Position = uMVP * vec4(p, 1.0);
    float w = gl_Position.w;
    float lit = clamp(S * t, 0.0, 1.5);
    float s = uSize * (0.6 + 0.8 * fract(aSeed * 7.13)) * (3.6 / w) * (1.0 + lit * 0.25);
    gl_PointSize = clamp(s, 1.0, 24.0) * uDpr;
    vColor = mix(aColor, uHi, clamp(lit * 0.45, 0.0, 0.6));
    vAlpha = (0.45 + 0.4 * fract(aSeed * 3.7)) * mix(1.0, 0.5, smoothstep(3.0, 4.6, w)) * (1.0 + lit * 0.5);
}`;

    const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float a = clamp(vAlpha * (1.0 - smoothstep(0.0, 1.0, d)), 0.0, 1.0);
    gl_FragColor = vec4(vColor * a, a); // premultiplied alpha
}`;

    // ── Small helpers ─────────────────────────────────────────────────────────

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function cssColor(name) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        let hex = v.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
        if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`EconomyGL: ${name} is not a hex color`);
        return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    }

    function lerp3(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    function gradient(stops, t) {
        const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
        const i = Math.min(Math.floor(x), stops.length - 2);
        return lerp3(stops[i], stops[i + 1], x - i);
    }

    // Column-major 4x4 matrices
    function perspective(fovy, aspect, near, far) {
        const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
        return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    }

    function multiply(a, b) {
        const out = new Float32Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
        }
        return out;
    }

    // translate(0,0,-dist) * rotateX(pitch) * rotateY(yaw)
    function modelView(yaw, pitch, dist) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        return new Float32Array([
            cy, sp * sy, -cp * sy, 0,
            0, cp, sp, 0,
            sy, -sp * cy, cp * cy, 0,
            0, 0, -dist, 1
        ]);
    }

    function transform(m, x, y, z) {
        return [
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
            m[3] * x + m[7] * y + m[11] * z + m[15]
        ];
    }

    // ── Shape: a thick bowl / funnel (seeded, identical on every load) ────────

    function buildCloud(count) {
        const stops = [
            cssColor('--color-blue-medium'),
            cssColor('--color-accent'),
            cssColor('--color-primary-lighter'),
            cssColor('--color-primary-lightest')
        ];
        const white = cssColor('--color-background');
        const rand  = mulberry32(0x4d75726);
        const data  = new Float32Array(count * STRIDE);
        const ys    = new Float32Array(count);
        const ts    = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const theta = rand() * TAU;
            // Ragged outer edge varies with angle
            const edge = 1 + 0.07 * Math.sin(theta * 5 + 1.3) + 0.05 * Math.sin(theta * 11 + 0.4) + 0.03 * Math.sin(theta * 23);
            // Average of three uniforms peaks mid-ring; a few stragglers fray the rim
            let rn = (rand() + rand() + rand()) / 3;
            if (rand() < 0.08) rn = 0.9 + rand() * 0.25;
            const r     = SHAPE.R_VOID + (edge - SHAPE.R_VOID) * rn + (rand() - 0.5) * 0.04;
            const thick = 0.05 + 0.07 * rn;
            const y     = -0.5 + 1.0 * Math.pow(Math.min(rn, 1.15), 1.6) + (rand() + rand() - 1) * thick;

            const o = i * STRIDE;
            data[o] = r * Math.cos(theta); data[o + 1] = y; data[o + 2] = r * Math.sin(theta);
            data[o + 3] = theta;
            data[o + 4] = rand();
            ys[i] = y;
            ts[i] = Math.min(rn, 1);
        }

        // Color by height + radius (lighter toward the rim); top 5% white-ish
        const sorted = ys.slice().sort();
        const yMin = sorted[0], yMax = sorted[count - 1], yTop = sorted[Math.floor(count * 0.95)];
        for (let i = 0; i < count; i++) {
            const hn = (ys[i] - yMin) / (yMax - yMin);
            let col = gradient(stops, 0.55 * hn + 0.45 * ts[i]);
            if (ys[i] >= yTop) col = lerp3(col, white, 0.7);
            data.set(col, i * STRIDE + 5);
        }
        return { data, white };
    }

    // ── Public factory ────────────────────────────────────────────────────────

    function create(parent, options) {
        options = options || {};
        const small   = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;
        const count   = options.count || (small ? 14000 : 45000);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const canvas = document.createElement('canvas');
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', options.ariaLabel || '3D point cloud. Drag or use arrow keys to rotate.');
        Object.assign(canvas.style, {
            position: 'absolute', inset: '0', width: '100%', height: '100%',
            display: 'block', touchAction: 'pan-y', cursor: 'grab'
        });

        const ctxOpts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false };
        const gl = canvas.getContext('webgl', ctxOpts) || canvas.getContext('experimental-webgl', ctxOpts);
        if (!gl) throw new Error('EconomyGL: WebGL unavailable');

        const cloud    = buildCloud(count);
        // Targets are set by the public API; current values ease toward them each frame
        const wTarget = new Float32Array(ARMS), wCur = new Float32Array(ARMS);
        const eTarget = new Float32Array(ARMS), eCur = new Float32Array(ARMS);
        const mTarget = new Float32Array(ARMS), mCur = new Float32Array(ARMS);
        const wEff    = new Float32Array(ARMS); // wCur + emphasis boost, sent as uW
        if (options.weights) {
            for (let i = 0; i < ARMS; i++) wTarget[i] = wCur[i] = Math.max(0, +options.weights[i] || 0);
        }
        const anchors  = new Float32Array(ARMS * 3);
        for (let i = 0; i < ARMS; i++) {
            const a = options.angles ? options.angles[i] : (i / ARMS) * TAU;
            anchors[i * 3] = Math.cos(a); anchors[i * 3 + 2] = Math.sin(a);
        }

        let prog = null, buf = null, loc = {}, lost = false;
        let cssW = 1, cssH = 1, dpr = 1, dist = BASE_DIST, proj = perspective(FOV, 1, 0.1, 20), mvp = null, mv = null;
        let yaw = Number.isFinite(options.yaw) ? options.yaw : 0.6, pitchOff = 0, vYaw = 0, vPitch = 0;
        let dragging = false, lastX = 0, lastY = 0, pointerId = null, releasedAt = -Infinity;
        let time = 0, last = 0, raf = 0, paused = false, onScreen = true, destroyed = false;

        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
                throw new Error('EconomyGL shader: ' + gl.getShaderInfoLog(s));
            }
            return s;
        }

        function initGL() {
            const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
            prog = gl.createProgram();
            gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
            gl.deleteShader(vs); gl.deleteShader(fs);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
                throw new Error('EconomyGL link: ' + gl.getProgramInfoLog(prog));
            }
            gl.useProgram(prog);

            buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, cloud.data, gl.STATIC_DRAW);
            const F = 4;
            [['aPos', 3, 0], ['aTheta', 1, 3], ['aSeed', 1, 4], ['aColor', 3, 5]].forEach(([name, size, off]) => {
                const l = gl.getAttribLocation(prog, name);
                gl.enableVertexAttribArray(l);
                gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * F, off * F);
            });
            ['uMVP', 'uTime', 'uBreath', 'uSize', 'uDpr', 'uHi', 'uW', 'uM', 'uA'].forEach(n => {
                loc[n] = gl.getUniformLocation(prog, n);
            });
            gl.uniform3fv(loc.uHi, cloud.white);
            gl.uniform3fv(loc.uA, anchors);
            gl.uniform1f(loc.uSize, small ? 2.6 : 2.0);
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0, 0, 0, 0);
        }

        // Lobe tip for arm i — mirrors the vertex shader's deformation (minus breathing)
        function anchorTip(i) {
            updateEffective();
            const dx = anchors[i * 3], dz = anchors[i * 3 + 2];
            let S = 0, px = 0, pz = 0;
            for (let j = 0; j < ARMS; j++) {
                const ax = anchors[j * 3], az = anchors[j * 3 + 2];
                const f = Math.pow(Math.max(dx * ax + dz * az, 0), SHAPE.K);
                S  += wEff[j] * f;
                px += wEff[j] * f * (ax - dx);
                pz += wEff[j] * f * (az - dz);
            }
            const t = 1; // smoothstep(R_VOID, RIM_R, RIM_R)
            return [
                dx * SHAPE.RIM_R + (dx * S * SHAPE.AMP_OUT + px * SHAPE.NUDGE) * t,
                SHAPE.RIM_Y + S * SHAPE.AMP_UP * t,
                dz * SHAPE.RIM_R + (dz * S * SHAPE.AMP_OUT + pz * SHAPE.NUDGE) * t
            ];
        }

        function updateMatrices() {
            mv  = modelView(yaw, PITCH0 + pitchOff, dist);
            mvp = multiply(proj, mv);
        }

        function render() {
            if (lost) return;
            updateMatrices();
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniformMatrix4fv(loc.uMVP, false, mvp);
            gl.uniform1f(loc.uTime, time);
            gl.uniform1f(loc.uBreath, reduced ? 0 : 1);
            gl.uniform1f(loc.uDpr, dpr);
            updateEffective();
            gl.uniform1fv(loc.uW, wEff);
            gl.uniform1fv(loc.uM, mCur);
            gl.drawArrays(gl.POINTS, 0, count);
        }

        function updateEffective() {
            for (let i = 0; i < ARMS; i++) wEff[i] = wCur[i] + SHAPE.EMPHASIS * eCur[i];
        }

        // Exponential damping of current toward target; returns true while still settling
        function ease(cur, target, k) {
            let settling = false;
            for (let i = 0; i < ARMS; i++) {
                const d = target[i] - cur[i];
                if (Math.abs(d) < 1e-4) { cur[i] = target[i]; continue; }
                cur[i] += d * k;
                settling = true;
            }
            return settling;
        }

        // ── Loop: runs only while visible and something is moving or settling ──

        let settling = true;
        function running() { return onScreen && !document.hidden && !lost && !destroyed; }
        function moving()  { return dragging || Math.abs(vYaw) > 1e-5 || Math.abs(vPitch) > 1e-5; }
        function animating() { return running() && (!reduced || moving() || settling); }

        function step(dt, now) {
            if (!dragging) {
                const decay = Math.pow(0.92, dt * 60);
                yaw += vYaw * dt * 60; vYaw *= decay;
                pitchOff += vPitch * dt * 60; vPitch *= decay;
                // Paused (e.g. a panel is open): no autorotate; drag inertia damps out
                if (!reduced && !paused && now - releasedAt > RESUME_MS) yaw += AUTO_SPIN * dt;
            }
            const kW = 1 - Math.exp(-dt / (reduced ? TAU_REDUCED : TAU_WEIGHT));
            const kE = 1 - Math.exp(-dt / (reduced ? TAU_REDUCED : TAU_EMPHASIS));
            const a = ease(wCur, wTarget, kW), b = ease(eCur, eTarget, kE), c = ease(mCur, mTarget, kW);
            settling = a || b || c;
            if (Math.abs(pitchOff) > PITCH_MAX) { pitchOff = Math.sign(pitchOff) * PITCH_MAX; vPitch = 0; }
            if (!reduced) time += dt;
        }

        function frame(now) {
            raf = 0;
            const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
            last = now;
            step(dt, now);
            render();
            if (animating()) raf = requestAnimationFrame(frame);
            else last = 0;
        }

        function requestDraw() {
            if (!raf && running()) raf = requestAnimationFrame(frame);
        }

        function stop() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0; last = 0;
        }

        // ── Interaction: drag to swivel (wheel is never touched) ──────────────

        function onDown(e) {
            if (e.button !== 0 || dragging) return;
            dragging = true; pointerId = e.pointerId;
            lastX = e.clientX; lastY = e.clientY; vYaw = vPitch = 0;
            canvas.setPointerCapture(e.pointerId);
            canvas.style.cursor = 'grabbing';
            requestDraw();
        }

        function onMove(e) {
            if (!dragging || e.pointerId !== pointerId) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            vYaw = dx * 0.006; vPitch = dy * 0.004;
            yaw += vYaw; pitchOff += vPitch;
            requestDraw();
        }

        function onUp(e) {
            if (!dragging || e.pointerId !== pointerId) return;
            dragging = false; pointerId = null;
            releasedAt = performance.now();
            canvas.style.cursor = 'grab';
            requestDraw();
        }

        function onKey(e) {
            const k = { ArrowLeft: [-0.04, 0], ArrowRight: [0.04, 0], ArrowUp: [0, -0.03], ArrowDown: [0, 0.03] }[e.key];
            if (!k) return;
            e.preventDefault();
            vYaw = k[0]; vPitch = k[1];
            releasedAt = performance.now();
            requestDraw();
        }

        function onVisibility() { if (document.hidden) stop(); else requestDraw(); }

        function onLost(e) { e.preventDefault(); lost = true; stop(); }
        function onRestored() { lost = false; initGL(); requestDraw(); }

        function resize() {
            cssW = Math.max(1, parent.clientWidth);
            cssH = Math.max(1, parent.clientHeight);
            dpr  = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width  = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
            const aspect = cssW / cssH;
            dist = aspect < 1 ? BASE_DIST / Math.pow(aspect, 0.8) : BASE_DIST;
            proj = perspective(FOV, aspect, 0.1, 20);
            if (!raf && !lost) render(); // keep the frame correct even while idle
        }

        // ── Wire up ───────────────────────────────────────────────────────────

        initGL();
        parent.appendChild(canvas);

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('keydown', onKey);
        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);
        document.addEventListener('visibilitychange', onVisibility);

        const ro = new ResizeObserver(resize);
        ro.observe(parent);
        const io = new IntersectionObserver(entries => {
            onScreen = entries[entries.length - 1].isIntersecting;
            if (onScreen) requestDraw(); else stop();
        });
        io.observe(parent);

        resize();
        requestDraw();

        return {
            setWeights(arr) {
                for (let i = 0; i < ARMS; i++) wTarget[i] = Math.max(0, +arr[i] || 0);
                settling = true; requestDraw();
            },
            setEmphasis(index, value) {
                if (index >= 0 && index < ARMS) eTarget[index] = Math.min(Math.max(+value || 0, 0), 1);
                settling = true; requestDraw();
            },
            setMotion(arr) {
                for (let i = 0; i < ARMS; i++) mTarget[i] = Math.min(Math.max(+arr[i] || 0, 0), 1);
                settling = true; requestDraw();
            },
            project(index) {
                if (!(index >= 0 && index < ARMS)) return { x: 0, y: 0, depth: 1, visible: false };
                updateMatrices();
                const tip = anchorTip(index);
                const c  = transform(mvp, tip[0], tip[1], tip[2]);
                const nx = c[0] / c[3], ny = c[1] / c[3], nz = c[2] / c[3];
                // Front-facing if the anchor is nearer the camera than the bowl's center
                const facing = transform(mv, tip[0], tip[1], tip[2])[2] >= transform(mv, 0, SHAPE.RIM_Y, 0)[2] - 0.3;
                return {
                    x: (nx * 0.5 + 0.5) * cssW,
                    y: (0.5 - ny * 0.5) * cssH,
                    depth: nz * 0.5 + 0.5,
                    visible: c[3] > 0 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && facing
                };
            },
            setPaused(value) {
                paused = !!value;
                requestDraw();
            },
            resize,
            destroy() {
                destroyed = true;
                stop();
                ro.disconnect(); io.disconnect();
                canvas.removeEventListener('pointerdown', onDown);
                canvas.removeEventListener('pointermove', onMove);
                canvas.removeEventListener('pointerup', onUp);
                canvas.removeEventListener('pointercancel', onUp);
                canvas.removeEventListener('keydown', onKey);
                canvas.removeEventListener('webglcontextlost', onLost);
                canvas.removeEventListener('webglcontextrestored', onRestored);
                document.removeEventListener('visibilitychange', onVisibility);
                if (!lost) { gl.deleteBuffer(buf); gl.deleteProgram(prog); }
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
                canvas.remove();
            }
        };
    }

    window.EconomyGL = { create, SHAPE };
}());
