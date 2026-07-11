(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const finalScoreEl = document.getElementById('final-score');
  const highScoreMsgEl = document.getElementById('high-score-msg');

  const startScreen = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('game-over-screen');
  const pauseScreen = document.getElementById('pause-screen');

  const HIGH_SCORE_KEY = 'star-shooter-high-score';

  const STATE = { START: 'start', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };
  let state = STATE.START;

  const keys = {};
  let touchLeft = false;
  let touchRight = false;
  let touchFire = false;

  const player = {
    w: 36,
    h: 40,
    x: W / 2 - 18,
    y: H - 80,
    speed: 320,
    cooldown: 0,
    fireRate: 0.22,
    invulnerable: 0,
  };

  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let particles = [];
  let stars = [];

  let score = 0;
  let level = 1;
  let lives = 3;
  let spawnTimer = 0;
  let spawnInterval = 1.3;
  let lastTime = 0;
  let shakeTime = 0;

  function initStars() {
    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        speed: Math.random() * 80 + 30,
      });
    }
  }

  function resetGame() {
    bullets = [];
    enemyBullets = [];
    enemies = [];
    particles = [];
    score = 0;
    level = 1;
    lives = 3;
    spawnTimer = 0;
    spawnInterval = 1.3;
    player.x = W / 2 - player.w / 2;
    player.y = H - 80;
    player.cooldown = 0;
    player.invulnerable = 2;
    updateHud();
    initStars();
  }

  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    livesEl.textContent = lives;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnEnemy() {
    const type = Math.random() < 0.75 ? 'grunt' : 'shooter';
    const w = type === 'shooter' ? 34 : 30;
    const h = type === 'shooter' ? 30 : 26;
    const speedBase = 60 + level * 8;
    enemies.push({
      type,
      x: Math.random() * (W - w),
      y: -h,
      w,
      h,
      vx: (Math.random() - 0.5) * 60,
      vy: speedBase + Math.random() * 40,
      hp: type === 'shooter' ? 2 : 1,
      fireTimer: Math.random() * 2 + 1,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 120 + 40;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.random() * 0.4 + 0.3,
        maxLife: 0.7,
        color,
      });
    }
  }

  function firePlayerBullet() {
    bullets.push({ x: player.x + player.w / 2 - 3, y: player.y - 4, w: 6, h: 14, vy: -520 });
    if (level >= 3) {
      bullets.push({ x: player.x + 2, y: player.y + 8, w: 5, h: 12, vy: -480, vx: -60 });
      bullets.push({ x: player.x + player.w - 7, y: player.y + 8, w: 5, h: 12, vy: -480, vx: 60 });
    }
  }

  function enemyFire(enemy) {
    const dx = (player.x + player.w / 2) - (enemy.x + enemy.w / 2);
    const dy = (player.y + player.h / 2) - (enemy.y + enemy.h / 2);
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 200 + level * 6;
    enemyBullets.push({
      x: enemy.x + enemy.w / 2 - 3,
      y: enemy.y + enemy.h,
      w: 6,
      h: 12,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
    });
  }

  function update(dt) {
    // starfield always moves
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > H) {
        s.y = 0;
        s.x = Math.random() * W;
      }
    }

    if (state !== STATE.PLAYING) return;

    if (shakeTime > 0) shakeTime -= dt;

    // player movement
    const moveLeft = keys['ArrowLeft'] || keys['a'] || keys['A'] || touchLeft;
    const moveRight = keys['ArrowRight'] || keys['d'] || keys['D'] || touchRight;
    if (moveLeft) player.x -= player.speed * dt;
    if (moveRight) player.x += player.speed * dt;
    player.x = Math.max(4, Math.min(W - player.w - 4, player.x));

    if (player.invulnerable > 0) player.invulnerable -= dt;

    // firing
    player.cooldown -= dt;
    const wantsFire = keys[' '] || keys['Spacebar'] || touchFire;
    if (wantsFire && player.cooldown <= 0) {
      firePlayerBullet();
      player.cooldown = player.fireRate;
    }

    // spawn enemies
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnTimer = Math.max(0.35, spawnInterval - level * 0.05);
    }

    // level up by score
    const newLevel = 1 + Math.floor(score / 500);
    if (newLevel !== level) {
      level = newLevel;
      updateHud();
    }

    // update bullets
    bullets.forEach((b) => {
      b.y += b.vy * dt;
      if (b.vx) b.x += b.vx * dt;
    });
    bullets = bullets.filter((b) => b.y + b.h > 0);

    enemyBullets.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    });
    enemyBullets = enemyBullets.filter((b) => b.y < H && b.y > -20 && b.x > -20 && b.x < W + 20);

    // update enemies
    enemies.forEach((e) => {
      e.wobble += dt * 2;
      e.y += e.vy * dt;
      e.x += (e.vx + Math.sin(e.wobble) * 30) * dt;
      e.x = Math.max(0, Math.min(W - e.w, e.x));
      if (e.type === 'shooter') {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.y > 0 && e.y < H - 100) {
          enemyFire(e);
          e.fireTimer = 1.6 + Math.random();
        }
      }
    });

    // enemies reaching bottom
    const survivors = [];
    for (const e of enemies) {
      if (e.y > H) {
        loseLife();
      } else {
        survivors.push(e);
      }
    }
    enemies = survivors;

    // bullet-enemy collisions
    for (const b of bullets) {
      for (const e of enemies) {
        if (b.hit || e.hp <= 0) continue;
        if (rectsOverlap(b, e)) {
          b.hit = true;
          e.hp -= 1;
          spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#66e0ff', 4);
          if (e.hp <= 0) {
            score += e.type === 'shooter' ? 150 : 100;
            spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#ffaa33', 16);
            updateHud();
          }
        }
      }
    }
    bullets = bullets.filter((b) => !b.hit);
    enemies = enemies.filter((e) => e.hp > 0);

    // player-enemy collisions
    if (player.invulnerable <= 0) {
      for (const e of enemies) {
        if (rectsOverlap(player, e)) {
          e.hp = 0;
          spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#ff5555', 16);
          loseLife();
          break;
        }
      }
    }
    enemies = enemies.filter((e) => e.hp > 0);

    // enemy bullets vs player
    if (player.invulnerable <= 0) {
      for (const b of enemyBullets) {
        if (rectsOverlap(b, player)) {
          b.hit = true;
          loseLife();
        }
      }
      enemyBullets = enemyBullets.filter((b) => !b.hit);
    }

    // particles
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
  }

  function loseLife() {
    if (player.invulnerable > 0) return;
    lives -= 1;
    player.invulnerable = 2;
    shakeTime = 0.3;
    spawnParticles(player.x + player.w / 2, player.y + player.h / 2, '#ff3355', 20);
    updateHud();
    if (lives <= 0) {
      gameOver();
    }
  }

  function gameOver() {
    state = STATE.OVER;
    finalScoreEl.textContent = score;
    const best = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
    if (score > best) {
      localStorage.setItem(HIGH_SCORE_KEY, String(score));
      highScoreMsgEl.textContent = 'ハイスコア更新!';
    } else {
      highScoreMsgEl.textContent = `ハイスコア: ${best}`;
    }
    gameOverScreen.classList.remove('hidden');
  }

  function drawShip(x, y, w, h, blink) {
    if (blink) return;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.fillStyle = '#4de8ff';
    ctx.strokeStyle = '#dff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(0, h / 3);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.fillStyle = e.type === 'shooter' ? '#ff6688' : '#ffcc44';
    ctx.beginPath();
    ctx.moveTo(0, e.h / 2);
    ctx.lineTo(e.w / 2, -e.h / 2);
    ctx.lineTo(0, -e.h / 4);
    ctx.lineTo(-e.w / 2, -e.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    ctx.clearRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = '#04041a';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // stars
    ctx.fillStyle = '#ffffff';
    for (const s of stars) {
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state === STATE.PLAYING || state === STATE.PAUSED) {
      // player
      const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0;
      drawShip(player.x, player.y, player.w, player.h, blink);

      // bullets
      ctx.fillStyle = '#aef9ff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 8;
      for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ff6b6b';
      ctx.shadowColor = '#ff3333';
      ctx.shadowBlur = 8;
      for (const b of enemyBullets) ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.shadowBlur = 0;

      // enemies
      for (const e of enemies) drawEnemy(e);

      // particles
      for (const p of particles) {
        ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

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
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ') e.preventDefault();
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  function bindHold(el, onDown, onUp) {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); }, { passive: false });
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
  }

  bindHold(document.getElementById('btn-left'), () => touchLeft = true, () => touchLeft = false);
  bindHold(document.getElementById('btn-right'), () => touchRight = true, () => touchRight = false);
  bindHold(document.getElementById('btn-fire'), () => touchFire = true, () => touchFire = false);

  // swipe control on canvas
  let touchStartX = null;
  canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchFire = true;
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (touchStartX === null) return;
    const dx = e.touches[0].clientX - touchStartX;
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    player.x += dx * scale;
    player.x = Math.max(4, Math.min(W - player.w - 4, player.x));
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  canvas.addEventListener('touchend', () => {
    touchStartX = null;
    touchFire = false;
  });

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

  initStars();
  requestAnimationFrame(loop);
})();
