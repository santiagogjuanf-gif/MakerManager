// 3D printing background animation
(function () {
  function initBgAnim(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, voxels, strands, nozzle;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      if (voxels) init();
    }

    function getAccent(alpha) {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6c63ff';
      const r = parseInt(v.slice(1,3),16), g = parseInt(v.slice(3,5),16), b = parseInt(v.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function getBg() {
      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f0f1a';
    }

    function mkVoxel() {
      return {
        x: Math.random() * W,
        y: H + 60,
        size: 18 + Math.random() * 28,   // larger: 18–46px
        speed: 0.15 + Math.random() * 0.4,
        opacity: 0.22 + Math.random() * 0.28,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.008,
        drift: (Math.random() - 0.5) * 0.25,
      };
    }

    // Filament strand: a long wavy line like extruded filament
    function mkStrand() {
      return {
        y: Math.random() * H,
        x: -300,
        len: 120 + Math.random() * 250,
        speed: 0.4 + Math.random() * 0.9,
        opacity: 0.18 + Math.random() * 0.18,
        thick: 3 + Math.random() * 4,    // thick rounded strand
        wave: (Math.random() - 0.5) * 18, // vertical wave amplitude
        freq: 0.012 + Math.random() * 0.018,
        phase: Math.random() * Math.PI * 2,
      };
    }

    function init() {
      voxels = Array.from({length: 18}, mkVoxel);
      voxels.forEach(p => { p.y = Math.random() * H; });
      strands = Array.from({length: 12}, () => { const s=mkStrand(); s.x=Math.random()*(W+300)-300; return s; });
      nozzle = { x: W * 0.5, vx: 0.9 + Math.random() * 0.5, y: H * 0.12, t: 0 };
    }

    // Draw isometric voxel with 3 filled faces
    function drawVoxel(x, y, s, rot, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;

      const ax = getAccent(alpha);
      const ax2 = getAccent(alpha * 0.6);
      const ax3 = getAccent(alpha * 0.35);

      // Top face (brightest)
      ctx.beginPath();
      ctx.moveTo(0, -s*0.55);
      ctx.lineTo(s*0.48, -s*0.1);
      ctx.lineTo(0, s*0.35);
      ctx.lineTo(-s*0.48, -s*0.1);
      ctx.closePath();
      ctx.fillStyle = ax;
      ctx.fill();

      // Left face (mid)
      ctx.beginPath();
      ctx.moveTo(-s*0.48, -s*0.1);
      ctx.lineTo(0, s*0.35);
      ctx.lineTo(0, s*0.9);
      ctx.lineTo(-s*0.48, s*0.55);
      ctx.closePath();
      ctx.fillStyle = ax2;
      ctx.fill();

      // Right face (dark)
      ctx.beginPath();
      ctx.moveTo(s*0.48, -s*0.1);
      ctx.lineTo(0, s*0.35);
      ctx.lineTo(0, s*0.9);
      ctx.lineTo(s*0.48, s*0.55);
      ctx.closePath();
      ctx.fillStyle = ax3;
      ctx.fill();

      // Outline edges
      ctx.strokeStyle = getAccent(alpha * 2.5);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -s*0.55); ctx.lineTo(s*0.48, -s*0.1); ctx.lineTo(0, s*0.35); ctx.lineTo(-s*0.48, -s*0.1); ctx.closePath();
      ctx.moveTo(0, s*0.35); ctx.lineTo(0, s*0.9);
      ctx.moveTo(-s*0.48, -s*0.1); ctx.lineTo(-s*0.48, s*0.55); ctx.lineTo(0, s*0.9); ctx.lineTo(s*0.48, s*0.55); ctx.lineTo(s*0.48, -s*0.1);
      ctx.stroke();

      ctx.restore();
    }

    // Draw filament strand as a thick wavy bezier line
    function drawStrand(s, t) {
      ctx.save();
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = getAccent(s.opacity * 3.5);
      ctx.lineWidth = s.thick;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const seg = 40;
      ctx.beginPath();
      for (let i = 0; i <= seg; i++) {
        const px = s.x + (s.len * i / seg);
        const py = s.y + Math.sin(s.phase + i * s.freq * s.len) * s.wave;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    function tick() {
      ctx.globalAlpha = 1;
      ctx.fillStyle = getBg();
      ctx.fillRect(0, 0, W, H);

      // Filament strands
      for (const s of strands) {
        s.x += s.speed;
        if (s.x > W + 310) { Object.assign(s, mkStrand()); }
        drawStrand(s, nozzle.t);
      }

      // Floating voxels
      for (const p of voxels) {
        p.y -= p.speed;
        p.x += p.drift;
        p.rot += p.rotSpeed;
        if (p.y < -80) { Object.assign(p, mkVoxel()); }
        drawVoxel(p.x, p.y, p.size, p.rot, p.opacity);
      }

      // Moving nozzle (printhead crosshair)
      nozzle.t++;
      nozzle.x += nozzle.vx;
      if (nozzle.x > W - 20 || nozzle.x < 20) nozzle.vx *= -1;

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = getAccent(0.8);
      ctx.lineWidth = 1.5;
      const nx = nozzle.x, ny = nozzle.y;
      // crosshair arms
      ctx.beginPath();
      ctx.moveTo(nx-12, ny); ctx.lineTo(nx+12, ny);
      ctx.moveTo(nx, ny-12); ctx.lineTo(nx, ny+12);
      ctx.stroke();
      // circle
      ctx.beginPath();
      ctx.arc(nx, ny, 5, 0, Math.PI*2);
      ctx.stroke();
      // nozzle tip drip
      const phase = nozzle.t % 90;
      if (phase < 16) {
        ctx.globalAlpha = 0.3 - phase * 0.018;
        ctx.fillStyle = getAccent(0.7);
        ctx.beginPath();
        ctx.arc(nx, ny + 14 + phase * 2, 4 - phase * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      requestAnimationFrame(tick);
    }

    resize();
    init();
    tick();
    window.addEventListener('resize', resize);
  }

  window.initBgAnim = initBgAnim;
})();
