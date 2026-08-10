const CONFETTI_VAR_NAMES = [
  '--color-accent',
  '--color-break-ring',
  '--color-success',
  '--color-heading-primary',
  '--color-timer-hover-text',
];

function readThemeColors(doc = document) {
  const root = doc.defaultView?.getComputedStyle(doc.documentElement);
  if (!root) return ['#6c8cff', '#5eead4', '#4ade80', '#d3b8ff', '#f3e8ff'];

  return CONFETTI_VAR_NAMES
    .map((name) => root.getPropertyValue(name).trim())
    .filter(Boolean);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export function launchConfetti(canvas, options = {}) {
  const ctx = canvas?.getContext('2d');
  const win = canvas?.ownerDocument?.defaultView;

  if (!canvas || !ctx || !win) return () => {};

  const {
    particleCount = 140,
    durationMs = 4200,
    originX = win.innerWidth / 2,
    originY = win.innerHeight * 0.35,
  } = options;

  const colors = readThemeColors(canvas.ownerDocument);
  const dpr = win.devicePixelRatio || 1;
  let animationFrameId = null;
  let stopped = false;
  const startedAt = win.performance.now();

  canvas.width = win.innerWidth * dpr;
  canvas.height = win.innerHeight * dpr;
  canvas.style.width = `${win.innerWidth}px`;
  canvas.style.height = `${win.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = Array.from({ length: particleCount }, () => {
    const angle = randomBetween(-Math.PI * 0.95, -Math.PI * 0.05);
    const speed = randomBetween(7, 16);

    return {
      x: originX + randomBetween(-40, 40),
      y: originY + randomBetween(-20, 20),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width: randomBetween(5, 10),
      height: randomBetween(8, 16),
      rotation: randomBetween(0, Math.PI * 2),
      spin: randomBetween(-0.18, 0.18),
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
    };
  });

  function draw() {
    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
    const elapsed = win.performance.now() - startedAt;
    const fadeStart = durationMs * 0.65;

    particles.forEach((particle) => {
      particle.vy += 0.22;
      particle.vx *= 0.99;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.rotation += particle.spin;

      if (elapsed > fadeStart) {
        particle.opacity = Math.max(0, 1 - ((elapsed - fadeStart) / (durationMs - fadeStart)));
      }

      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = particle.opacity;
      ctx.fillStyle = particle.color;
      ctx.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
      ctx.restore();
    });

    if (!stopped && elapsed < durationMs) {
      animationFrameId = win.requestAnimationFrame(draw);
      return;
    }

    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
  }

  draw();

  return () => {
    stopped = true;
    win.cancelAnimationFrame(animationFrameId);
    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
  };
}
