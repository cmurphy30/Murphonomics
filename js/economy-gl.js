/**
 * economy-gl.js — Raw WebGL point cloud ("the economy, visualized").
 *
 * Dependency-free. Knows nothing about labels, charts, or the page — it only
 * draws into a canvas it creates inside the element it is given.
 *
 *   const cloud = EconomyGL.create(parentEl, { count, ariaLabel, angles });
 *   (angles: 11 arm anchor angles in radians around the rim; default evenly spaced)
 *   cloud.setWeights([...11 numbers])   // per-arm push (0 = none)
 *   cloud.setEmphasis(index, value)     // per-arm glow (0 = none)
 *   cloud.project(index)                // -> { x, y, depth, visible } in CSS px
 *   cloud.setPaused(bool)
 *   cloud.resize()
 *   cloud.destroy()
 *
 * Throws if WebGL is unavailable, so callers can fall back.
 */

(function () {
    'use strict';

    const ARMS      = 11;
    const STRIDE    = 8;                  // floats per point: pos(3) theta(1) seed(1) color(3)
    const TAU       = Math.PI * 2;
    const R_VOID    = 0.32;               // empty dark void in the middle
    const FOV       = 40 * Math.PI / 180;
    const BASE_DIST = 3.2;                // camera distance at wide aspect ratios
    const PITCH0    = 0.5;                // default view looks down into the bowl (~29°)
    const PITCH_MAX = 25 * Math.PI / 180; // drag range around the default view
    const AUTO_SPIN = 0.15;               // rad/s
    const RESUME_MS = 3000;               // autorotate resumes this long after release

    // ── Shaders (GLSL ES 1.00 — works on every WebGL1 browser) ────────────────

    const VERT = `
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
uniform float uE[11];
uniform vec3 uA[11];
varying vec3 vColor;
varying float vAlpha;
void main() {
    vec3 dir = vec3(cos(aTheta), 0.0, sin(aTheta));
    float ph = aSeed * 6.2831853;
    vec3 p = aPos;
    // Idle breathing: small radial + vertical sine displacement
    p += dir * (uBreath * 0.02 * sin(uTime * 0.9 + ph + aTheta * 3.0));
    p.y += uBreath * 0.015 * sin(uTime * 0.6 + ph * 1.7 + aTheta * 2.0);
    // Arm slots (all zero for now): weights push points outward, emphasis glows
    float push = 0.0;
    float glow = 0.0;
    for (int i = 0; i < 11; i++) {
        float k = smoothstep(0.9, 1.0, dot(dir, uA[i]));
        push += uW[i] * k;
        glow += uE[i] * k;
    }
    p += dir * push * 0.25;
    gl_Position = uMVP * vec4(p, 1.0);
    float w = gl_Position.w;
    float s = uSize * (0.6 + 0.8 * fract(aSeed * 7.13)) * (3.2 / w) * (1.0 + glow * 0.6);
    gl_PointSize = clamp(s, 1.0, 24.0) * uDpr;
    vColor = mix(aColor, uHi, clamp(glow, 0.0, 1.0) * 0.5);
    vAlpha = (0.45 + 0.4 * fract(aSeed * 3.7)) * mix(1.0, 0.5, smoothstep(2.6, 4.2, w)) * (1.0 + glow);
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
            const r     = R_VOID + (edge - R_VOID) * rn + (rand() - 0.5) * 0.04;
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
        return { data, white, rimY: 0.5 };
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
        const weights  = new Float32Array(ARMS);
        const emphasis = new Float32Array(ARMS);
        const anchors  = new Float32Array(ARMS * 3);
        for (let i = 0; i < ARMS; i++) {
            const a = options.angles ? options.angles[i] : (i / ARMS) * TAU;
            anchors[i * 3] = Math.cos(a); anchors[i * 3 + 2] = Math.sin(a);
        }

        let prog = null, buf = null, loc = {}, lost = false;
        let cssW = 1, cssH = 1, dpr = 1, dist = BASE_DIST, proj = perspective(FOV, 1, 0.1, 20), mvp = null, mv = null;
        let yaw = 0.6, pitchOff = 0, vYaw = 0, vPitch = 0;
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
            ['uMVP', 'uTime', 'uBreath', 'uSize', 'uDpr', 'uHi', 'uW', 'uE', 'uA'].forEach(n => {
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
            gl.uniform1fv(loc.uW, weights);
            gl.uniform1fv(loc.uE, emphasis);
            gl.drawArrays(gl.POINTS, 0, count);
        }

        // ── Loop: runs only while visible, unpaused, and something is moving ──

        function running() { return !paused && onScreen && !document.hidden && !lost && !destroyed; }
        function moving()  { return dragging || Math.abs(vYaw) > 1e-5 || Math.abs(vPitch) > 1e-5; }
        function animating() { return running() && (!reduced || moving()); }

        function step(dt, now) {
            if (!dragging) {
                const decay = Math.pow(0.92, dt * 60);
                yaw += vYaw * dt * 60; vYaw *= decay;
                pitchOff += vPitch * dt * 60; vPitch *= decay;
                if (!reduced && now - releasedAt > RESUME_MS) yaw += AUTO_SPIN * dt;
            }
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
                for (let i = 0; i < ARMS; i++) weights[i] = +arr[i] || 0;
                requestDraw();
            },
            setEmphasis(index, value) {
                if (index >= 0 && index < ARMS) emphasis[index] = +value || 0;
                requestDraw();
            },
            project(index) {
                if (!(index >= 0 && index < ARMS)) return { x: 0, y: 0, depth: 1, visible: false };
                updateMatrices();
                const ax = anchors[index * 3], az = anchors[index * 3 + 2];
                const c  = transform(mvp, ax, cloud.rimY, az);
                const nx = c[0] / c[3], ny = c[1] / c[3], nz = c[2] / c[3];
                // Front-facing if the anchor is nearer the camera than the bowl's center
                const facing = transform(mv, ax, cloud.rimY, az)[2] >= transform(mv, 0, cloud.rimY, 0)[2] - 0.3;
                return {
                    x: (nx * 0.5 + 0.5) * cssW,
                    y: (0.5 - ny * 0.5) * cssH,
                    depth: nz * 0.5 + 0.5,
                    visible: c[3] > 0 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && facing
                };
            },
            setPaused(value) {
                paused = !!value;
                if (paused) { stop(); render(); } // final frame shows the latest emphasis
                else requestDraw();
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

    window.EconomyGL = { create };
}());
