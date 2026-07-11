(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const startScreen = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('game-over-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const resultTitle = document.getElementById('result-title');

  const p1PercentEl = document.getElementById('p1-percent');
  const p2PercentEl = document.getElementById('p2-percent');
  const p1StocksEl = document.getElementById('p1-stocks');
  const p2StocksEl = document.getElementById('p2-stocks');

  const STATE = { START: 'start', PLAYING: 'playing', PAUSED: 'paused', OVER: 'over' };
  let state = STATE.START;

  const STAGE = { left: 130, right: 670, top: 380 };
  const BLAST = { left: -120, right: W + 120, top: -260, bottom: H + 160 };
  const GRAVITY = 1700;
  const MAX_FALL = 950;
  const STOCKS_START = 3;

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  const touch = { left: false, right: false, jump: false, attack: false, smash: false };
  function bindHold(id, prop) {
    const el = document.getElementById(id);
    const down = (e) => { e.preventDefault(); touch[prop] = true; };
    const up = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }
  bindHold('btn-left', 'left');
  bindHold('btn-right', 'right');
  bindHold('btn-jump', 'jump');
  bindHold('btn-attack', 'attack');
  bindHold('btn-smash', 'smash');

  function makeFighter(opts) {
    return {
      name: opts.name,
      isCPU: opts.isCPU,
      color: opts.color,
      darkColor: opts.darkColor,
      x: opts.x,
      y: STAGE.top - 60,
      vx: 0,
      vy: 0,
      w: 40,
      h: 60,
      facing: opts.facing,
      grounded: false,
      jumpsLeft: 2,
      damage: 0,
      stocks: STOCKS_START,
      hitstun: 0,
      attackState: null, // {type, timer, phase, hitApplied}
      attackCooldown: 0,
      invulnerable: 1.2,
      alive: true,
      aiTimer: 0,
      aiInput: { left: false, right: false, up: false, down: false, jump: false, attack: false, smash: false },
      jumpQueued: false,
      prevJumpHeld: false,
      prevAtkHeld: false,
      prevSmashHeld: false,
      animTimer: 0,
      landTimer: 0,
      jumpStretch: 0,
      prevGrounded: false,
      flashTimer: 0,
    };
  }

  let player, cpu;
  let particles = [];
  let hitstop = 0;
  let shakeTime = 0;

  function resetMatch() {
    player = makeFighter({ name: 'PLAYER', isCPU: false, color: '#58c4ff', darkColor: '#2a6fb0', x: 300, facing: 1 });
    cpu = makeFighter({ name: 'CPU', isCPU: true, color: '#ff6262', darkColor: '#a03030', x: 500, facing: -1 });
    particles = [];
    hitstop = 0;
    shakeTime = 0;
    updateHud();
  }

  function updateHud() {
    p1PercentEl.textContent = Math.round(player.damage) + '%';
    p2PercentEl.textContent = Math.round(cpu.damage) + '%';
    p1PercentEl.style.color = damageColor(player.damage);
    p2PercentEl.style.color = damageColor(cpu.damage);
    p1StocksEl.innerHTML = '<span class="stock-dot"></span>'.repeat(Math.max(player.stocks - 1, 0));
    p2StocksEl.innerHTML = '<span class="stock-dot"></span>'.repeat(Math.max(cpu.stocks - 1, 0));
  }

  function damageColor(d) {
    if (d < 50) return '';
    if (d < 100) return '#ffb703';
    return '#ff3b3b';
  }

  const ATTACKS = {
    jab: { damage: 5, baseKB: 90, growth: 3.2, startup: 0.08, active: 0.08, recover: 0.18, range: 58, hitstunMul: 0.55 },
    smash: { damage: 14, baseKB: 190, growth: 6.2, startup: 0.22, active: 0.1, recover: 0.38, range: 66, hitstunMul: 0.62 },
  };

  function startAttack(f, kind, dirMod) {
    if (f.attackState || f.attackCooldown > 0 || f.hitstun > 0) return;
    const def = ATTACKS[kind];
    f.attackState = {
      type: kind,
      dir: dirMod, // 'side' | 'up' | 'down'
      timer: 0,
      phase: 'startup',
      hitApplied: false,
      def,
    };
  }

  function applyHit(attacker, victim, def, dirMod) {
    let dirX = attacker.facing * 0.82;
    let dirY = -0.5;
    if (dirMod === 'up') { dirX = attacker.facing * 0.25; dirY = -1; }
    else if (dirMod === 'down') { dirX = attacker.facing * 0.35; dirY = 0.95; }

    const mag = Math.hypot(dirX, dirY) || 1;
    dirX /= mag; dirY /= mag;

    victim.damage += def.damage;
    const kb = def.baseKB + def.damage * (victim.damage / 100) * def.growth * 5;
    const kbClamped = Math.min(kb, 2200);

    victim.vx = dirX * kbClamped * 0.9;
    victim.vy = dirY * kbClamped * 0.9;
    victim.hitstun = Math.min(Math.max(kbClamped * def.hitstunMul * 0.9, 90), 1100) / 1000;
    victim.grounded = false;
    victim.flashTimer = 0.12;

    hitstop = Math.min(0.05 + kbClamped / 6000, 0.16);
    shakeTime = Math.min(0.08 + kbClamped / 8000, 0.22);

    spawnHitParticles(victim.x + victim.w / 2, victim.y + victim.h / 2, kbClamped);
    updateHud();
  }

  function spawnHitParticles(x, y, power) {
    const count = Math.min(6 + Math.floor(power / 100), 24);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 260 + 80;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.random() * 0.35 + 0.15,
        maxLife: 0.5,
        color: Math.random() < 0.5 ? '#fff7cf' : '#ffcf4d',
      });
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function getAttackHitbox(f) {
    const as = f.attackState;
    if (!as || as.phase !== 'active') return null;
    const range = as.def.range;
    if (as.dir === 'up') {
      return { x: f.x + f.w / 2 - 26, y: f.y - range * 0.7, w: 52, h: range * 0.7 };
    } else if (as.dir === 'down') {
      return { x: f.x + f.w / 2 - 26, y: f.y + f.h, w: 52, h: range * 0.7 };
    }
    const hx = f.facing > 0 ? f.x + f.w : f.x - range;
    return { x: hx, y: f.y + 6, w: range, h: f.h - 12 };
  }

  function updateAttackState(f, dt) {
    const as = f.attackState;
    if (!as) {
      f.attackCooldown = Math.max(0, f.attackCooldown - dt);
      return;
    }
    as.timer += dt;
    if (as.phase === 'startup' && as.timer >= as.def.startup) {
      as.phase = 'active';
      as.timer = 0;
    } else if (as.phase === 'active' && as.timer >= as.def.active) {
      as.phase = 'recover';
      as.timer = 0;
    } else if (as.phase === 'recover' && as.timer >= as.def.recover) {
      f.attackCooldown = 0.12;
      f.attackState = null;
    }
  }

  function resolveInput(f) {
    if (f.isCPU) return f.aiInput;
    return {
      left: keys['ArrowLeft'] || keys['a'] || keys['A'] || touch.left,
      right: keys['ArrowRight'] || keys['d'] || keys['D'] || touch.right,
      up: keys['ArrowUp'] || keys['w'] || keys['W'],
      down: keys['ArrowDown'] || keys['s'] || keys['S'],
      jump: keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '] || touch.jump,
      attack: keys['z'] || keys['Z'] || touch.attack,
      smash: keys['x'] || keys['X'] || touch.smash,
    };
  }

  function updateFighter(f, input, dt, opponent) {
    if (!f.alive) return;

    if (f.invulnerable > 0) f.invulnerable -= dt;
    if (f.flashTimer > 0) f.flashTimer -= dt;
    if (f.landTimer > 0) f.landTimer -= dt;
    if (f.jumpStretch > 0) f.jumpStretch -= dt;
    f.animTimer += dt;

    const inHitstun = f.hitstun > 0;
    if (inHitstun) f.hitstun = Math.max(0, f.hitstun - dt);

    const canAct = !inHitstun && !f.attackState;

    // horizontal movement
    const speed = f.grounded ? 340 : 260;
    if (canAct) {
      if (input.left && !input.right) { f.vx = -speed; f.facing = -1; }
      else if (input.right && !input.left) { f.vx = speed; f.facing = 1; }
      else {
        const decel = f.grounded ? 2600 : 900;
        if (f.vx > 0) f.vx = Math.max(0, f.vx - decel * dt);
        else if (f.vx < 0) f.vx = Math.min(0, f.vx + decel * dt);
      }
    } else if (!inHitstun) {
      // attacking: slow down but keep some control
      const decel = f.grounded ? 3200 : 1200;
      if (f.vx > 0) f.vx = Math.max(0, f.vx - decel * dt);
      else if (f.vx < 0) f.vx = Math.min(0, f.vx + decel * dt);
    }

    // jump
    const jumpEdge = input.jump && !f.prevJumpHeld;
    if (jumpEdge && canAct && f.jumpsLeft > 0) {
      f.vy = f.jumpsLeft === 2 ? -640 : -560;
      f.jumpsLeft -= 1;
      f.grounded = false;
      f.jumpStretch = 0.18;
    }
    f.prevJumpHeld = input.jump;

    // attacks
    const atkEdge = input.attack && !f.prevAtkHeld;
    const smashEdge = input.smash && !f.prevSmashHeld;
    f.prevAtkHeld = input.attack;
    f.prevSmashHeld = input.smash;
    if (canAct) {
      let dirMod = 'side';
      if (input.up) dirMod = 'up';
      else if (input.down && !f.grounded) dirMod = 'down';
      if (atkEdge) startAttack(f, 'jab', dirMod);
      else if (smashEdge) startAttack(f, 'smash', dirMod);
    }

    updateAttackState(f, dt);

    // gravity
    f.vy = Math.min(f.vy + GRAVITY * dt, MAX_FALL);

    // integrate
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    // ground collision
    const feetY = f.y + f.h;
    if (feetY >= STAGE.top && f.x + f.w > STAGE.left + 6 && f.x < STAGE.right - 6 && f.vy >= 0) {
      f.y = STAGE.top - f.h;
      f.vy = 0;
      f.grounded = true;
      f.jumpsLeft = 2;
    } else {
      f.grounded = false;
    }

    if (f.grounded && !f.prevGrounded) f.landTimer = 0.16;
    f.prevGrounded = f.grounded;

    // blast zone check
    if (f.x < BLAST.left || f.x > BLAST.right || f.y < BLAST.top || f.y > BLAST.bottom) {
      loseStock(f);
    }
  }

  function loseStock(f) {
    if (!f.alive) return;
    f.stocks -= 1;
    updateHud();
    if (f.stocks <= 0) {
      f.alive = false;
      f.x = -1000;
      endMatch(f === player ? cpu : player);
      return;
    }
    f.x = 400 - f.w / 2 + (f === player ? -60 : 60);
    f.y = STAGE.top - 200;
    f.vx = 0;
    f.vy = 0;
    f.damage = 0;
    f.hitstun = 0;
    f.attackState = null;
    f.invulnerable = 1.8;
    f.jumpsLeft = 2;
    updateHud();
  }

  function endMatch(winner) {
    state = STATE.OVER;
    resultTitle.textContent = winner === player ? 'YOU WIN!' : 'YOU LOSE...';
    resultTitle.style.color = winner === player ? '#7CFC00' : '#ff5555';
    resultTitle.style.textShadow = winner === player
      ? '0 0 14px #7CFC00, 0 0 30px #3aa300'
      : '0 0 14px #ff5555, 0 0 30px #b00000';
    gameOverScreen.classList.remove('hidden');
  }

  // --- CPU AI ---
  function updateCPU(dt) {
    cpu.aiTimer -= dt;
    if (cpu.aiTimer <= 0) {
      cpu.aiTimer = 0.12 + Math.random() * 0.1;
      decideCPU();
    }
  }

  function decideCPU() {
    const input = { left: false, right: false, up: false, down: false, jump: false, attack: false, smash: false };
    if (!cpu.alive || !player.alive) { cpu.aiInput = input; return; }

    const dx = player.x - cpu.x;
    const dy = player.y - cpu.y;
    const absDx = Math.abs(dx);
    const attackRange = 62;

    // recovery: off stage
    if (cpu.x < STAGE.left - 30) {
      input.right = true;
      if (!cpu.grounded && cpu.jumpsLeft > 0) input.jump = true;
    } else if (cpu.x > STAGE.right + 30) {
      input.left = true;
      if (!cpu.grounded && cpu.jumpsLeft > 0) input.jump = true;
    } else if (cpu.y > BLAST.bottom - 220 && !cpu.grounded && cpu.jumpsLeft > 0) {
      input.jump = true;
      if (cpu.x < 400) input.right = true; else input.left = true;
    } else if (absDx > attackRange) {
      if (dx > 0) input.right = true; else input.left = true;
      const nearLeftEdge = cpu.x < STAGE.left + 30;
      const nearRightEdge = cpu.x > STAGE.right - 30;
      const playerAlsoOffThatSide =
        (nearRightEdge && player.x > STAGE.right - 60) ||
        (nearLeftEdge && player.x < STAGE.left + 60);
      if ((nearLeftEdge && input.left && !playerAlsoOffThatSide) ||
          (nearRightEdge && input.right && !playerAlsoOffThatSide)) {
        input.left = false;
        input.right = false;
      }
      if (dy < -70 && cpu.grounded && Math.random() < 0.35) input.jump = true;
    } else {
      if (dy < -30) input.up = true;
      else if (dy > 40 && !cpu.grounded) input.down = true;
      if (cpu.attackCooldown <= 0 && !cpu.attackState) {
        if (Math.random() < 0.28) input.smash = true;
        else input.attack = true;
      }
      if (Math.random() < 0.03 && cpu.grounded) input.jump = true;
    }

    if (dx !== 0) cpu.faceHint = dx > 0 ? 1 : -1;
    cpu.aiInput = input;
  }

  // --- hit detection between fighters ---
  function checkHits() {
    for (const [attacker, victim] of [[player, cpu], [cpu, player]]) {
      if (!attacker.attackState || attacker.attackState.hitApplied) continue;
      if (!victim.alive || victim.invulnerable > 0) continue;
      const box = getAttackHitbox(attacker);
      if (!box) continue;
      if (rectsOverlap(box, victim)) {
        attacker.attackState.hitApplied = true;
        applyHit(attacker, victim, attacker.attackState.def, attacker.attackState.dir);
      }
    }
  }

  function update(dt) {
    if (state !== STATE.PLAYING) return;

    if (hitstop > 0) {
      hitstop -= dt;
      return;
    }
    if (shakeTime > 0) shakeTime -= dt;

    if (!player.isCPU) {
      // facing update for player when idle-ish based on input handled in updateFighter movement already
    }
    updateCPU(dt);

    // face opponent when not moving (for CPU / natural feel), only if not attacking/hitstun
    if (!player.attackState && player.hitstun <= 0) {
      // player facing controlled by movement input already
    }
    if (!cpu.attackState && cpu.hitstun <= 0 && Math.abs(player.x - cpu.x) > 4) {
      cpu.facing = player.x > cpu.x ? 1 : -1;
    }
    if (!player.attackState && player.hitstun <= 0 && Math.abs(cpu.x - player.x) > 4) {
      // keep player facing driven by movement; only flip toward opponent if idle
      const pi = resolveInput(player);
      if (!pi.left && !pi.right) player.facing = cpu.x > player.x ? 1 : -1;
    }

    const pInput = resolveInput(player);
    const cInput = resolveInput(cpu);

    updateFighter(player, pInput, dt, cpu);
    updateFighter(cpu, cInput, dt, player);

    checkHits();

    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
  }

  // --- rendering ---
  function drawStage() {
    ctx.fillStyle = '#3aa03a';
    ctx.fillRect(STAGE.left, STAGE.top, STAGE.right - STAGE.left, 18);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(STAGE.left, STAGE.top + 18, STAGE.right - STAGE.left, H - STAGE.top - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(STAGE.left, STAGE.top, STAGE.right - STAGE.left, 4);
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

  function drawCapsule(x1, y1, x2, y2, radius, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function getLegPose(f) {
    const runFast = f.grounded && Math.abs(f.vx) > 20;
    if (!f.grounded) {
      return { backFootX: -4, backFootY: -9, frontFootX: 6, frontFootY: -7 };
    }
    if (f.landTimer > 0) {
      const spread = (f.landTimer / 0.16) * 5;
      return { backFootX: -6 - spread, backFootY: -1, frontFootX: 6 + spread, frontFootY: -1 };
    }
    if (runFast) {
      const phase = f.animTimer * 13;
      return {
        backFootX: -5 + Math.sin(phase + Math.PI) * 9,
        backFootY: -1 - Math.max(0, Math.cos(phase + Math.PI)) * 5,
        frontFootX: 5 + Math.sin(phase) * 9,
        frontFootY: -1 - Math.max(0, Math.cos(phase)) * 5,
      };
    }
    return { backFootX: -6, backFootY: -1, frontFootX: 6, frontFootY: -1 };
  }

  function getArmPose(f, shoulderY) {
    const front = { x: 7, y: shoulderY + 5 };
    const back = { x: -6, y: shoulderY + 5 };

    if (f.attackState) {
      const as = f.attackState;
      let extend;
      if (as.phase === 'startup') extend = -0.5 * (as.timer / as.def.startup);
      else if (as.phase === 'active') extend = 1;
      else extend = Math.max(1 - (as.timer / as.def.recover) * 1.3, -0.15);

      let dx = 1, dy = -0.15;
      if (as.dir === 'up') { dx = 0.25; dy = -1; }
      else if (as.dir === 'down') { dx = 0.3; dy = 0.9; }

      const reach = as.type === 'smash' ? 16 : 11;
      return {
        frontHandX: front.x + dx * reach * extend,
        frontHandY: front.y + dy * reach * extend,
        backHandX: back.x - 3,
        backHandY: back.y + 5,
        attackActive: as.phase === 'active',
        attackDir: as.dir,
        attackType: as.type,
        reach,
      };
    }

    if (f.hitstun > 0) {
      const wob = Math.sin(f.animTimer * 42) * 6;
      return { frontHandX: front.x + wob, frontHandY: front.y + 9, backHandX: back.x - wob, backHandY: back.y + 9 };
    }

    const runFast = f.grounded && Math.abs(f.vx) > 20;
    if (runFast) {
      const phase = f.animTimer * 13;
      return {
        frontHandX: front.x + Math.sin(phase + Math.PI) * 6,
        frontHandY: front.y + 7 - Math.max(0, Math.cos(phase + Math.PI)) * 3,
        backHandX: back.x + Math.sin(phase) * 6,
        backHandY: back.y + 7 - Math.max(0, Math.cos(phase)) * 3,
      };
    }
    const sway = Math.sin(f.animTimer * 2.2) * 1.5;
    return { frontHandX: front.x + sway * 0.4, frontHandY: front.y + 8, backHandX: back.x - sway * 0.4, backHandY: back.y + 8 };
  }

  function drawFighter(f) {
    if (!f.alive) return;
    const blink = f.invulnerable > 0 && Math.floor(f.invulnerable * 12) % 2 === 0;
    if (blink) return;

    const legLen = 16;
    const bodyH = 24;
    const headR = 13;
    const hipY = -legLen;
    const shoulderY = hipY - bodyH;
    const headCY = shoulderY - headR + 3;

    let stretch = 0;
    if (f.jumpStretch > 0) stretch = (f.jumpStretch / 0.18) * 0.22;
    else if (f.landTimer > 0) stretch = -(f.landTimer / 0.16) * 0.3;

    ctx.save();
    ctx.translate(f.x + f.w / 2, f.y + f.h);
    ctx.scale(f.facing * (1 - stretch * 0.6), 1 + stretch);

    const bodyColor = f.flashTimer > 0 ? '#ffffff' : f.color;
    const legs = getLegPose(f);
    const arms = getArmPose(f, shoulderY);

    // shadow
    ctx.restore();
    ctx.save();
    ctx.translate(f.x + f.w / 2, STAGE.top + 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x + f.w / 2, f.y + f.h);
    ctx.scale(f.facing * (1 - stretch * 0.6), 1 + stretch);

    // legs
    drawCapsule(-4, hipY, legs.backFootX, legs.backFootY, 5, f.darkColor);
    drawCapsule(4, hipY, legs.frontFootX, legs.frontFootY, 5, f.darkColor);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(legs.backFootX, legs.backFootY, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(legs.frontFootX, legs.frontFootY, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // back arm (behind torso)
    drawCapsule(-6, shoulderY + 4, arms.backHandX, arms.backHandY, 4.5, bodyColor);

    // torso
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = f.darkColor;
    ctx.lineWidth = 3;
    roundRect(-12, shoulderY, 24, hipY - shoulderY + 4, 9);
    ctx.fill();
    ctx.stroke();

    // front arm (in front of torso)
    drawCapsule(6, shoulderY + 4, arms.frontHandX, arms.frontHandY, 4.5, bodyColor);
    ctx.strokeStyle = f.darkColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(arms.frontHandX, arms.frontHandY, 4.5, 0, Math.PI * 2);
    ctx.stroke();

    // attack slash effect
    if (arms.attackActive) {
      const cx = 7 + (arms.reach || 12) * (arms.attackDir === 'up' ? 0.25 : arms.attackDir === 'down' ? 0.3 : 1);
      const cy = shoulderY + 5 + (arms.reach || 12) * (arms.attackDir === 'up' ? -1 : arms.attackDir === 'down' ? 0.9 : -0.15);
      ctx.strokeStyle = arms.attackType === 'smash' ? 'rgba(255,220,120,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = arms.attackType === 'smash' ? 4 : 2.5;
      const slashR = arms.attackType === 'smash' ? 18 : 12;
      ctx.beginPath();
      ctx.arc(cx, cy, slashR, -0.9, 0.9);
      ctx.stroke();
    }

    // head
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = f.darkColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const dizzy = f.hitstun > 0.28;
    const angry = arms.attackActive;

    if (dizzy) {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      [-5, 5].forEach((ex) => {
        ctx.beginPath();
        ctx.moveTo(ex - 2.5, headCY - 1.5);
        ctx.lineTo(ex + 2.5, headCY + 1.5);
        ctx.moveTo(ex + 2.5, headCY - 1.5);
        ctx.lineTo(ex - 2.5, headCY + 1.5);
        ctx.stroke();
      });
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(3, headCY - 1, 2.6, 0, Math.PI * 2);
      ctx.arc(9, headCY - 1, 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (angry) {
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, headCY - 6);
        ctx.lineTo(5, headCY - 4);
        ctx.moveTo(7, headCY - 4);
        ctx.lineTo(12, headCY - 6);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (angry) ctx.arc(6, headCY + 6, 3, 0, Math.PI);
    else ctx.arc(6, headCY + 5, 2.5, 0.15, Math.PI - 0.15);
    ctx.stroke();

    // accessory: headband for player, horns for cpu
    if (f === player) {
      ctx.fillStyle = '#1c4faa';
      roundRect(-headR + 1, headCY - 5, headR * 2 - 2, 5, 2);
      ctx.fill();
      const flutter = Math.sin(f.animTimer * 8) * 4;
      ctx.beginPath();
      ctx.moveTo(-headR + 2, headCY - 3);
      ctx.lineTo(-headR - 8, headCY - 6 + flutter);
      ctx.lineTo(-headR - 6, headCY + 1 + flutter);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#7a1414';
      ctx.beginPath();
      ctx.moveTo(-headR + 3, headCY - 9);
      ctx.lineTo(-headR - 2, headCY - 19);
      ctx.lineTo(-headR + 8, headCY - 10);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headR - 8, headCY - 10);
      ctx.lineTo(headR + 2, headCY - 20);
      ctx.lineTo(headR - 3, headCY - 9);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function render() {
    ctx.save();
    if (shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }

    ctx.clearRect(-12, -12, W + 24, H + 24);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#6fb7ff');
    grad.addColorStop(0.6, '#bfe6ff');
    grad.addColorStop(1, '#e8f7ff');
    ctx.fillStyle = grad;
    ctx.fillRect(-12, -12, W + 24, H + 24);

    if (state === STATE.PLAYING || state === STATE.PAUSED) {
      drawStage();
      drawFighter(player);
      drawFighter(cpu);

      for (const p of particles) {
        ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  let lastTime = 0;
  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    dt = Math.min(dt, 0.033);
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

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
    resetMatch();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', togglePause);

  resetMatch();
  requestAnimationFrame(loop);
})();
