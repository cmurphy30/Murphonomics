/**
 * home-about.js — Homepage About section + view toggle (index.html only).
 *
 * 1. Fetches about.html, pulls out its .about-card and injects it into
 *    #homeAbout, so about.html stays the single source of truth for the text.
 * 2. Reveals the About section the first time it is ~15% in view.
 */

document.addEventListener('DOMContentLoaded', () => {
    loadHomeAbout();
    initAboutReveal();
});

// ─── About card ──────────────────────────────────────────────────────────────

async function loadHomeAbout() {
    const target = document.getElementById('homeAbout');
    if (!target) return;

    try {
        const response = await fetch('about.html');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const doc  = new DOMParser().parseFromString(await response.text(), 'text/html');
        const card = doc.querySelector('.about-card');
        if (!card) throw new Error('.about-card not found in about.html');

        target.appendChild(document.importNode(card, true));
    } catch (err) {
        console.warn('[home-about] could not load about.html:', err.message);
        target.innerHTML =
            '<div class="about-card"><p>Murphonomics is a personal project that turns economic data into ' +
            'clear, digestible summaries. <a href="about.html">Read the full story on the About page →</a></p></div>';
    }
}

// ─── Pop-up reveal ───────────────────────────────────────────────────────────

function initAboutReveal() {
    const section = document.querySelector('.about-section');
    if (!section) return;

    // Reduced motion (or no observer support): just show it
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
        section.classList.add('is-visible');
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
            section.classList.add('is-visible');
            observer.disconnect(); // reveal only once
        }
    }, { threshold: 0.15 });

    observer.observe(section);
}
