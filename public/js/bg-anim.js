// 3D printing background animation — floating filament layers
(function () {
  function initBgAnim(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles, layers, nozzle;

    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }

    // Floating tiny cubes / voxels representing printed layers
    function mkParticle() {
      return {
        x: Math.random() * W,
        y: H + 20,
        size: 4 + Math.random() * 8,
        speed: 0.3 + Math.random() * 0.7,
        opacity: 0.12 + Math.random() * 0.18,
        rot: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        drift: (Math.random() - 0.5) * 0.4,
        hue: Math.random() > 0.5 ? 0 : 1, // accent or secondary
      };
    }

    // Horizontal print lines that sweep across
    function mkLayer() {
      return {
        y: Math.random() * H,
        width: 40 + Math.random() * 120,
        x: -150,
        speed: 0.6 + Math.random() * 1.2,
        opacity: 0.05 + Math.random() * 0.08,
        thick: 2 + Math.random() * 3,
      };
    }

    function init() {
      particles = Array.from({ length: 28 }, mkParticle);
      layers = Array.from({ length: 12 }, () => {
        const l = mkLayer();
        l.x = Math.random() * W; // start spread out
        return l;
      });
      // Nozzle that moves back and forth
      nozzle = { x: W * 0.5, vx: 0.8 + Math.random() * 0.6, y: H * 0.18, vy: 0, dropTimer: 0 };
    }

    function getAccentColor(alpha) {
      // Read CSS var at runtime so it respects theme
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6c63ff';
      // Parse hex to rgba
      const r = parseInt(accent.slice(1, 3), 16);
      const g = parseInt(accent.slice(3, 5), 16);
      const b = parseInt(accent.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function drawVoxel(ctx, x, y, size, rot, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      const s = size;
      // Simple isometric cube
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6);
      ctx.lineTo(s * 0.5, -s * 0.1);
      ctx.lineTo(s * 0.5, s * 0.5);
      ctx.lineTo(0, s * 0.95);
      ctx.lineTo(-s * 0.5, s * 0.5);
      ctx.lineTo(-s * 0.5, -s * 0.1);
      ctx.closePath();
      ctx.strokeStyle = getAccentColor(alpha * 1.4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);

      // Draw horizontal print layers
      for (const l of layers) {
        l.x += l.speed;
        if (l.x > W + 160) { Object.assign(l, mkLayer()); l.x = -160; }
        ctx.globalAlpha = l.opacity;
        ctx.strokeStyle = getAccentColor(l.opacity * 2);
        ctx.lineWidth = l.thick;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.width, l.y);
        ctx.stroke();
      }

      // Draw floating voxels
      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift;
        p.rot += p.rotSpeed;
        if (p.y < -30) Object.assign(p, mkParticle());
        drawVoxel(ctx, p.x, p.y, p.size, p.rot, p.opacity);
      }

      // Nozzle crosshair (subtle)
      nozzle.x += nozzle.vx;
      if (nozzle.x > W - 20 || nozzle.x < 20) nozzle.vx *= -1;
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = getAccentColor(0.4);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nozzle.x - 8, nozzle.y);
      ctx.lineTo(nozzle.x + 8, nozzle.y);
      ctx.moveTo(nozzle.x, nozzle.y - 8);
      ctx.lineTo(nozzle.x, nozzle.y + 8);
      ctx.stroke();
      // Nozzle tip drop
      nozzle.dropTimer++;
      if (nozzle.dropTimer % 90 < 8) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = getAccentColor(0.5);
        ctx.beginPath();
        ctx.arc(nozzle.x, nozzle.y + 10 + (nozzle.dropTimer % 90) * 1.2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }

    resize();
    init();
    tick();
    window.addEventListener('resize', () => { resize(); init(); });
  }

  window.initBgAnim = initBgAnim;
})();
