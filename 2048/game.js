(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const SIZE = canvas.width;
  const GRID = 4;
  const GAP = 12;
  const CELL = (SIZE - GAP * (GRID + 1)) / GRID;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const finalScoreEl = document.getElementById('final-score');

  const startScreen = document.getElementById('start-screen');
  const winScreen = document.getElementById('win-screen');
  const gameOverScreen = document.getElementById('game-over-screen');

  const BEST_KEY = '2048-best-score';

  const STATE = { START: 'start', PLAYING: 'playing', OVER: 'over' };
  let state = STATE.START;

  const TILE_COLORS = {
    2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'],
    8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'],
    32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'],
    128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'],
    512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'],
    2048: ['#edc22e', '#fff'],
  };
  function tileColor(v) {
    return TILE_COLORS[v] || ['#3c3a32', '#f5f0e6'];
  }

  const VECTORS = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
  };

  let grid, score, best, tileIdCounter, hasWon, animMap, animStart, animDuration;

  function emptyGrid() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }

  function withinBounds(p) {
    return p.x >= 0 && p.x < GRID && p.y >= 0 && p.y < GRID;
  }

  function cellAt(p) {
    return grid[p.y][p.x];
  }

  function emptyCells() {
    const cells = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!grid[y][x]) cells.push({ x, y });
      }
    }
    return cells;
  }

  function addRandomTile(anim) {
    const cells = emptyCells();
    if (cells.length === 0) return;
    const pick = cells[Math.floor(Math.random() * cells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile = { id: tileIdCounter++, value, x: pick.x, y: pick.y };
    grid[pick.y][pick.x] = tile;
    if (anim) anim.push({ id: tile.id, value, fromX: pick.x, fromY: pick.y, toX: pick.x, toY: pick.y, popIn: true, fadeOut: false });
  }

  function resetGame() {
    grid = emptyGrid();
    score = 0;
    tileIdCounter = 0;
    hasWon = false;
    best = Number(localStorage.getItem(BEST_KEY) || 0);
    animMap = [];
    addRandomTile(animMap);
    addRandomTile(animMap);
    animStart = performance.now();
    animDuration = 150;
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  function findFarthest(pos, vector) {
    let previous = pos;
    let next = { x: pos.x + vector.x, y: pos.y + vector.y };
    while (withinBounds(next) && !cellAt(next)) {
      previous = next;
      next = { x: previous.x + vector.x, y: previous.y + vector.y };
    }
    return { farthest: previous, next };
  }

  function buildTraversal(vector) {
    const xs = [0, 1, 2, 3];
    const ys = [0, 1, 2, 3];
    if (vector.x === 1) xs.reverse();
    if (vector.y === 1) ys.reverse();
    return { xs, ys };
  }

  function move(direction) {
    if (state !== STATE.PLAYING) return;
    const vector = VECTORS[direction];
    const { xs, ys } = buildTraversal(vector);

    const anim = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const t = grid[y][x];
        if (t) anim.push({ id: t.id, value: t.value, fromX: x, fromY: y, toX: x, toY: y, popIn: false, fadeOut: false, __ref: t });
      }
    }
    const animById = {};
    anim.forEach((a) => { animById[a.id] = a; });

    let moved = false;
    const mergedThisMove = new Set();

    ys.forEach((y) => {
      xs.forEach((x) => {
        const pos = { x, y };
        const tile = cellAt(pos);
        if (!tile) return;

        const { farthest, next } = findFarthest(pos, vector);
        const nextTile = withinBounds(next) ? cellAt(next) : null;

        if (nextTile && nextTile.value === tile.value && !mergedThisMove.has(nextTile.id) && !mergedThisMove.has(tile.id)) {
          const mergedValue = tile.value * 2;
          const merged = { id: tileIdCounter++, value: mergedValue, x: next.x, y: next.y };
          grid[next.y][next.x] = merged;
          grid[pos.y][pos.x] = null;
          mergedThisMove.add(tile.id);
          mergedThisMove.add(nextTile.id);

          if (animById[tile.id]) { animById[tile.id].toX = next.x; animById[tile.id].toY = next.y; animById[tile.id].fadeOut = true; }
          if (animById[nextTile.id]) { animById[nextTile.id].toX = next.x; animById[nextTile.id].toY = next.y; animById[nextTile.id].fadeOut = true; }
          anim.push({ id: merged.id, value: mergedValue, fromX: next.x, fromY: next.y, toX: next.x, toY: next.y, popIn: true, fadeOut: false });

          score += mergedValue;
          moved = true;
          if (mergedValue === 2048 && !hasWon) {
            hasWon = true;
            winScreen.classList.remove('hidden');
          }
        } else if (farthest.x !== pos.x || farthest.y !== pos.y) {
          grid[farthest.y][farthest.x] = tile;
          grid[pos.y][pos.x] = null;
          tile.x = farthest.x;
          tile.y = farthest.y;
          if (animById[tile.id]) { animById[tile.id].toX = farthest.x; animById[tile.id].toY = farthest.y; }
          moved = true;
        }
      });
    });

    if (moved) {
      if (score > best) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
      addRandomTile(anim);
      animMap = anim;
      animStart = performance.now();
      animDuration = 130;
      updateHud();
      if (!movesAvailable()) {
        setTimeout(() => { if (!movesAvailable()) endGame(); }, animDuration + 20);
      }
    }
  }

  function movesAvailable() {
    if (emptyCells().length > 0) return true;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const v = grid[y][x].value;
        if (x < GRID - 1 && grid[y][x + 1].value === v) return true;
        if (y < GRID - 1 && grid[y + 1][x].value === v) return true;
      }
    }
    return false;
  }

  function endGame() {
    state = STATE.OVER;
    finalScoreEl.textContent = score;
    gameOverScreen.classList.remove('hidden');
  }

  function cellPixel(gx, gy) {
    return {
      px: GAP + gx * (CELL + GAP),
      py: GAP + gy * (CELL + GAP),
    };
  }

  function render() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#2c2c3a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const { px, py } = cellPixel(x, y);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(px, py, CELL, CELL, 6);
        ctx.fill();
      }
    }

    if (state === STATE.START) return;

    const now = performance.now();
    const t = animDuration > 0 ? Math.min((now - animStart) / animDuration, 1) : 1;

    const fading = animMap.filter((a) => a.fadeOut);
    const normal = animMap.filter((a) => !a.fadeOut && !a.popIn);
    const popping = animMap.filter((a) => a.popIn);

    [...fading, ...normal, ...popping].forEach((a) => {
      const gx = a.fromX + (a.toX - a.fromX) * t;
      const gy = a.fromY + (a.toY - a.fromY) * t;
      const { px, py } = cellPixel(gx, gy);

      let scale = 1;
      let alpha = 1;
      if (a.fadeOut) {
        alpha = 1 - t;
      } else if (a.popIn) {
        scale = t >= 1 ? 1 : 0.2 + 0.8 * t;
      }

      drawTile(px, py, a.value, scale, alpha);
    });
  }

  function drawTile(px, py, value, scale, alpha) {
    const [bg, fg] = tileColor(value);
    const size = CELL * scale;
    const offset = (CELL - size) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = bg;
    roundRect(px + offset, py + offset, size, size, 6);
    ctx.fill();

    ctx.fillStyle = fg;
    const fontSize = value >= 1024 ? CELL * 0.32 : value >= 128 ? CELL * 0.38 : CELL * 0.45;
    ctx.font = `900 ${fontSize}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), px + CELL / 2, py + CELL / 2 + 2);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  // keyboard input
  const KEY_MAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
  };
  window.addEventListener('keydown', (e) => {
    const dir = KEY_MAP[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  // touch swipe
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  });

  function startGame() {
    resetGame();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.getElementById('continue-btn').addEventListener('click', () => {
    winScreen.classList.add('hidden');
  });

  best = Number(localStorage.getItem(BEST_KEY) || 0);
  updateHud();
  requestAnimationFrame(loop);
})();
