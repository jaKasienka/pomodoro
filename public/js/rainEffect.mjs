const DEFAULT_RAIN_OPTIONS = {
  lengthMin: 25,
  lengthRange: 35,
  speedMin: 18,
  speedRange: 14,
  opacityMin: 0.6,
  opacityRange: 0.4,
  widthMin: 0.8,
  widthRange: 0.8,
  dropDensityDivisor: 8,
};

export const COMPACT_RAIN_OPTIONS = {
  lengthMin: 8,
  lengthRange: 10,
  speedMin: 10,
  speedRange: 8,
  opacityMin: 0.55,
  opacityRange: 0.35,
  widthMin: 0.7,
  widthRange: 0.5,
  dropDensityDivisor: 10,
};

export function createRainAnimator(canvas, options = {}) {
  const config = { ...DEFAULT_RAIN_OPTIONS, ...options };
  const ctx = canvas?.getContext('2d');
  const win = canvas?.ownerDocument?.defaultView;

  if (!canvas || !ctx || !win) {
    return {
      start() {},
      stop() {},
      resize() {},
      isActive() { return false; },
    };
  }

  let drops = [];
  let animationFrameId = null;
  let isActive = false;
  const rainDropRgb = readRainDropRgb(canvas.ownerDocument);

  function readRainDropRgb(doc) {
    const root = doc.defaultView?.getComputedStyle(doc.documentElement);
    const value = root?.getPropertyValue('--color-rain-drop-rgb').trim();
    return value || '125, 211, 252';
  }

  function resizeCanvas() {
    const dpr = win.devicePixelRatio || 1;
    canvas.width = win.innerWidth * dpr;
    canvas.height = win.innerHeight * dpr;
    canvas.style.width = `${win.innerWidth}px`;
    canvas.style.height = `${win.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createDrops() {
    drops = [];
    const count = Math.floor(win.innerWidth / config.dropDensityDivisor);

    for (let i = 0; i < count; i += 1) {
      drops.push({
        x: Math.random() * (win.innerWidth + 200) - 100,
        y: Math.random() * win.innerHeight,
        length: Math.random() * config.lengthRange + config.lengthMin,
        speed: Math.random() * config.speedRange + config.speedMin,
        opacity: Math.random() * config.opacityRange + config.opacityMin,
        width: Math.random() * config.widthRange + config.widthMin,
      });
    }
  }

  function animate() {
    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);

    drops.forEach((drop) => {
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.length * 0.15, drop.y + drop.length);
      ctx.strokeStyle = `rgba(${rainDropRgb}, ${drop.opacity})`;
      ctx.lineWidth = drop.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      drop.y += drop.speed;
      drop.x -= drop.speed * 0.15;

      if (drop.y > win.innerHeight) {
        drop.y = -drop.length;
        drop.x = Math.random() * (win.innerWidth + 200) - 50;
      }
    });

    if (isActive) {
      animationFrameId = win.requestAnimationFrame(animate);
    }
  }

  function start() {
    if (isActive) return;
    isActive = true;
    resizeCanvas();
    createDrops();
    animate();
  }

  function stop() {
    isActive = false;
    win.cancelAnimationFrame(animationFrameId);
    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
  }

  function resize() {
    if (!isActive) return;
    resizeCanvas();
    createDrops();
  }

  return {
    start,
    stop,
    resize,
    isActive: () => isActive,
  };
}

export function isRainModeActive() {
  return document.documentElement.classList.contains('rain-mode');
}
