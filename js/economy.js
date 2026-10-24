/**
 * economy.js — Homepage wire-up for the 3D economy point cloud (index.html only).
 *
 * Tests WebGL once on load. If it works, the cloud (js/economy-gl.js) is
 * created lazily when #economyStage comes within one viewport of the screen.
 * If WebGL is unavailable or creation fails, #economy gets the class "no-3d"
 * and no canvas is created.
 */

document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('economy');
    const stage   = document.getElementById('economyStage');
    if (!section || !stage) return;

    if (!window.EconomyGL || !webglAvailable()) {
        section.classList.add('no-3d');
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        try {
            EconomyGL.create(stage, {
                ariaLabel: 'The economy as a 3D point cloud. Drag or use the arrow keys to rotate.'
            });
        } catch (err) {
            console.warn('[economy] 3D unavailable:', err.message);
            section.classList.add('no-3d');
        }
    }, { rootMargin: '100% 0px' }); // "within one viewport" of the screen

    observer.observe(stage);
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
