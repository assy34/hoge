(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');

  const COLS = 10;
  const ROWS = 20;
  const CELL = 28;

  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');
  const finalScoreEl = document.getElementById('final-score');

  const startScreen = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('game-over-screen');
  const pauseScreen = document.getElementById('pause-screen');

  const STATE = { START: 'start', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };
  let state = STATE.START;

  const SHAPES = {
    I: { color: '#4dd9ff', rotations: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    ]},
    O: { color: '#ffe14d', rotations: [
      [[1,1],[1,1]], [[1,1],[1,1]], [[1,1],[1,1]], [[1,1],[1,1]],
    ]},
    T: { color: '#c060ff', rotations: [
      [[0,1,0],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,1],[0,1,0]],
      [[0,0,0],[1,1,1],[0,1,0]],
      [[0,1,0],[1,1,0],[0,1,0]],
    ]},
    S: { color: '#5cff6b', rotations: [
      [[0,1,1],[1,1,0],[0,0,0]],
      [[0,1,0],[0,1,1],[0,0,1]],
      [[0,1,1],[1,1,0],[0,0,0]],
      [[0,1,0],[0,1,1],[0,0,1]],
    ]},
    Z: { color: '#ff5c5c', rotations: [
      [[1,1,0],[0,1,1],[0,0,0]],
      [[0,0,1],[0,1,1],[0,1,0]],
      [[1,1,0],[0,1,1],[0,0,0]],
      [[0,0,1],[0,1,1],[0,1,0]],
    ]},
    J: { color: '#5c7bff', rotations: [
      [[1,0,0],[1,1,1],[0,0,0]],
      [[0,1,1],[0,1,0],[0,1,0]],
      [[0,0,0],[1,1,1],[0,0,1]],
      [[0,1,0],[0,1,0],[1,1,0]],
    ]},
    L: { color: '#ff9e3d', rotations: [
      [[0,0,1],[1,1,1],[0,0,0]],
      [[0,1,0],[0,1,0],[0,1,1]],
      [[0,0,0],[1,1,1],[1,0,0]],
      [[1,1,0],[0,1,0],[0,1,0]],
    ]},
  };
  const SHAPE_KEYS = Object.keys(SHAPES);

  let board, bag, nextQueue, current, score, level, lines, dropTimer, dropInterval, lockTimer, isGrounded, gameOverFlag;
  let softDropHeld = false;
  let flashRows = [];
  let flashTimer = 0;

  function newBag() {
    const arr = [...SHAPE_KEYS];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextFromQueue() {
    if (nextQueue.length === 0) nextQueue = newBag();
    return nextQueue.shift();
  }

  function spawnPiece(key) {
    const shape = SHAPES[key];
    const matrix = shape.rotations[0];
    const w = matrix[0].length;
    current = {
      key,
      rotation: 0,
      color: shape.color,
      x: Math.floor((COLS - w) / 2),
      y: -2,
    };
    lockTimer = 0;
    isGrounded = false;
    if (collides(current, 0, 0, current.rotation)) {
      endGame();
    }
  }

  function getMatrix(piece, rotation) {
    return SHAPES[piece.key].rotations[((rotation % 4) + 4) % 4];
  }

  function collides(piece, dx, dy, rotation) {
    const matrix = getMatrix(piece, rotation);
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const x = piece.x + c + dx;
        const y = piece.y + r + dy;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board[y][x]) return true;
      }
    }
    return false;
  }

  function resetGame() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bag = [];
    nextQueue = newBag();
    score = 0;
    level = 1;
    lines = 0;
    dropInterval = 1000;
    dropTimer = 0;
    lockTimer = 0;
    isGrounded = false;
    gameOverFlag = false;
    flashRows = [];
    flashTimer = 0;
    spawnPiece(nextFromQueue());
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
  }

  function tryMove(dx, dy) {
    if (!collides(current, dx, dy, current.rotation)) {
      current.x += dx;
      current.y += dy;
      if (dy === 0) lockTimer = 0;
      return true;
    }
    return false;
  }

  function tryRotate(dir) {
    const newRotation = current.rotation + dir;
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collides(current, k, 0, newRotation)) {
        current.x += k;
        current.rotation = ((newRotation % 4) + 4) % 4;
        lockTimer = 0;
        return true;
      }
    }
    return false;
  }

  function hardDrop() {
    let dist = 0;
    while (!collides(current, 0, 1, current.rotation)) {
      current.y += 1;
      dist += 1;
    }
    score += dist * 2;
    lockPiece();
  }

  function lockPiece() {
    const matrix = getMatrix(current, current.rotation);
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const x = current.x + c;
        const y = current.y + r;
        if (y < 0) { endGame(); return; }
        board[y][x] = current.color;
      }
    }
    clearLines();
    spawnPiece(nextFromQueue());
  }

  function clearLines() {
    const full = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every((cell) => cell)) full.push(r);
    }
    if (full.length === 0) return;

    flashRows = full;
    flashTimer = 0.18;

    const remaining = board.filter((_, r) => !full.includes(r));
    const newRows = Array.from({ length: full.length }, () => Array(COLS).fill(null));
    board = [...newRows, ...remaining];

    lines += full.length;
    const points = [0, 100, 300, 500, 800][full.length] * level;
    score += points;

    const newLevel = 1 + Math.floor(lines / 10);
    if (newLevel !== level) {
      level = newLevel;
      dropInterval = Math.max(120, 1000 - (level - 1) * 80);
    }
    updateHud();
  }

  function endGame() {
    state = STATE.OVER;
    gameOverFlag = true;
    finalScoreEl.textContent = score;
    gameOverScreen.classList.remove('hidden');
  }

  function update(dt) {
    if (state !== STATE.PLAYING) return;

    if (flashTimer > 0) {
      flashTimer -= dt;
      return;
    }

    const effectiveInterval = softDropHeld ? Math.min(dropInterval, 50) : dropInterval;
    dropTimer += dt * 1000;
    if (dropTimer >= effectiveInterval) {
      dropTimer = 0;
      if (!tryMove(0, 1)) {
        isGrounded = true;
        lockTimer += effectiveInterval;
      } else {
        isGrounded = false;
        if (softDropHeld) score += 1;
      }
    }

    if (isGrounded) {
      lockTimer += dt * 1000;
      if (collides(current, 0, 1, current.rotation)) {
        if (lockTimer > 400) lockPiece();
      } else {
        isGrounded = false;
        lockTimer = 0;
      }
    }
  }

  function drawCell(context, x, y, size, color) {
    context.fillStyle = color;
    context.fillRect(x, y, size, size);
    context.strokeStyle = 'rgba(0,0,0,0.35)';
    context.lineWidth = 1.5;
    context.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(x + 2, y + 2, size - 4, 3);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(COLS * CELL, r * CELL);
      ctx.stroke();
    }

    if (state === STATE.START) return;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          if (flashRows.includes(r) && flashTimer > 0 && Math.floor(flashTimer * 30) % 2 === 0) {
            drawCell(ctx, c * CELL, r * CELL, CELL, '#ffffff');
          } else {
            drawCell(ctx, c * CELL, r * CELL, CELL, board[r][c]);
          }
        }
      }
    }

    if ((state === STATE.PLAYING || state === STATE.PAUSED) && current && flashTimer <= 0) {
      // ghost piece
      let ghostY = current.y;
      while (!collides(current, 0, ghostY - current.y + 1, current.rotation)) ghostY += 1;
      const matrix = getMatrix(current, current.rotation);
      ctx.globalAlpha = 0.25;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const x = current.x + c;
          const y = ghostY + r;
          if (y >= 0) drawCell(ctx, x * CELL, y * CELL, CELL, current.color);
        }
      }
      ctx.globalAlpha = 1;

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const x = current.x + c;
          const y = current.y + r;
          if (y >= 0) drawCell(ctx, x * CELL, y * CELL, CELL, current.color);
        }
      }
    }

    renderNext();
  }

  function renderNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.fillStyle = '#05050f';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (nextQueue.length === 0) return;
    const key = nextQueue[0];
    const shape = SHAPES[key];
    const matrix = shape.rotations[0];
    const size = 20;
    const w = matrix[0].length * size;
    const h = matrix.length * size;
    const offX = (nextCanvas.width - w) / 2;
    const offY = (nextCanvas.height - h) / 2;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        drawCell(nextCtx, offX + c * size, offY + r * size, size, shape.color);
      }
    }
  }

  let lastTime = 0;
  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    dt = Math.min(dt, 0.05);
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  // input
  const keyState = {};
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { togglePause(); return; }
    if (state !== STATE.PLAYING) return;
    if (keyState[e.key]) return;
    keyState[e.key] = true;

    if (e.key === 'ArrowLeft') tryMove(-1, 0);
    else if (e.key === 'ArrowRight') tryMove(1, 0);
    else if (e.key === 'ArrowDown') softDropHeld = true;
    else if (e.key === 'ArrowUp') tryRotate(1);
    else if (e.key === 'z' || e.key === 'Z') tryRotate(-1);
    else if (e.key === ' ') hardDrop();
  });
  window.addEventListener('keyup', (e) => {
    keyState[e.key] = false;
    if (e.key === 'ArrowDown') softDropHeld = false;
  });

  let moveHoldTimer = null;
  function bindRepeat(id, fn) {
    const el = document.getElementById(id);
    const start = (e) => {
      e.preventDefault();
      if (state !== STATE.PLAYING) return;
      fn();
      clearInterval(moveHoldTimer);
      moveHoldTimer = setInterval(fn, 120);
    };
    const stop = (e) => { e.preventDefault(); clearInterval(moveHoldTimer); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', stop, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
  }
  bindRepeat('btn-left', () => tryMove(-1, 0));
  bindRepeat('btn-right', () => tryMove(1, 0));
  bindRepeat('btn-down', () => tryMove(0, 1));
  document.getElementById('btn-rotate').addEventListener('click', () => { if (state === STATE.PLAYING) tryRotate(1); });
  document.getElementById('btn-drop').addEventListener('click', () => { if (state === STATE.PLAYING) hardDrop(); });

  function togglePause() {
    if (state === STATE.PLAYING) {
      state = STATE.PAUSED;
      pauseScreen.classList.remove('hidden');
    } else if (state === STATE.PAUSED) {
      state = STATE.PLAYING;
      pauseScreen.classList.add('hidden');
    }
  }

  function startGame() {
    resetGame();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', togglePause);

  requestAnimationFrame(loop);
})();
