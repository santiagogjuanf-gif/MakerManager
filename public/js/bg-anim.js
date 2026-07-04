// 3D printing background animation
(function () {
  function initBgAnim(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles, layers, nozzle, animId;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      if (particles) init();
    }

    function getAccent(alpha) {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6c63ff';
      const r = parseInt(v.slice(1,3),16), g = parseInt(v.slice(3,5),16), b = parseInt(v.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function mkParticle() {
      return {
        x: Math.random() * W,
        y: H + 20,
        size: 3 + Math.random() * 7,
        speed: 0.25 + Math.random() * 0.6,
        opacity: 0.08 + Math.random() * 0.15,
        rot: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 0.015,
        drift: (Math.random() - 0.5) * 0.3,
      };
    }

    function mkLayer() {
      return {
        y: Math.random() * H,
        w: 30 + Math.random() * 100,
        x: -160,
        speed: 0.5 + Math.random() * 1.0,
        opacity: 0.04 + Math.random() * 0.07,
        thick: 1.5 + Math.random() * 2.5,
      };
    }

    function init() {
      particles = Array.from({length:24}, mkParticle);
      particles.forEach(p => { p.y = Math.random() * H; }); // spread at start
      layers = Array.from({length:10}, () => { const l=mkLayer(); l.x=Math.random()*W; return l; });
      nozzle = { x: W*0.5, vx: 0.7+Math.random()*0.5, y: H*0.15, t: 0 };
    }

    function drawVoxel(x, y, s, rot, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = getAccent(alpha * 1.5);
      ctx.lineWidth = 0.7;
      // top face
      ctx.beginPath();
      ctx.moveTo(0, -s*0.55); ctx.lineTo(s*0.48, -s*0.1);
      ctx.lineTo(0, s*0.35); ctx.lineTo(-s*0.48, -s*0.1);
      ctx.closePath(); ctx.stroke();
      // left edge
      ctx.beginPath(); ctx.moveTo(-s*0.48, -s*0.1); ctx.lineTo(-s*0.48, s*0.55); ctx.stroke();
      // right edge
      ctx.beginPath(); ctx.moveTo(s*0.48, -s*0.1); ctx.lineTo(s*0.48, s*0.55); ctx.stroke();
      // bottom edge
      ctx.beginPath(); ctx.moveTo(-s*0.48, s*0.55); ctx.lineTo(0, s*0.9); ctx.lineTo(s*0.48, s*0.55); ctx.stroke();
      ctx.restore();
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);

      // Sweep lines (print layers)
      for (const l of layers) {
        l.x += l.speed;
        if (l.x > W + 170) { Object.assign(l, mkLayer()); }
        ctx.globalAlpha = l.opacity;
        ctx.strokeStyle = getAccent(l.opacity * 3);
        ctx.lineWidth = l.thick;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.w, l.y);
        ctx.stroke();
      }

      // Floating voxels
      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift;
        p.rot += p.rotSpeed;
        if (p.y < -40) { Object.assign(p, mkParticle()); }
        drawVoxel(p.x, p.y, p.size, p.rot, p.opacity);
      }

      // Moving nozzle
      nozzle.t++;
      nozzle.x += nozzle.vx;
      if (nozzle.x > W-16 || nozzle.x < 16) nozzle.vx *= -1;
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = getAccent(0.5);
      ctx.lineWidth = 1.2;
      // crosshair
      ctx.beginPath();
      ctx.moveTo(nozzle.x-7, nozzle.y); ctx.lineTo(nozzle.x+7, nozzle.y);
      ctx.moveTo(nozzle.x, nozzle.y-7); ctx.lineTo(nozzle.x, nozzle.y+7);
      ctx.stroke();
      // extruded bead
      const phase = nozzle.t % 80;
      if (phase < 12) {
        ctx.globalAlpha = 0.15 - phase*0.012;
        ctx.fillStyle = getAccent(0.4);
        ctx.beginPath();
        ctx.arc(nozzle.x, nozzle.y+8+phase*1.5, 3-phase*0.2, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(tick);
    }

    resize();
    init();
    tick();
    window.addEventListener('resize', resize);
  }

  window.initBgAnim = initBgAnim;
})();
