// =============================================
// ROCKET RUMBLE — 2D Rocket League-style game
// =============================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ─── CONSTANTS ───────────────────────────────
const ARENA_W = 900;
const ARENA_H = 580;
const WALL_T = 14;

const GOAL_W = 110;
const GOAL_H = 14;

const CAR_W = 28;
const CAR_H = 20;
const CAR_SPEED = 220;
const CAR_ACCEL = 800;
const CAR_FRICTION = 0.92;
const CAR_ANGULAR = 3.2;
const BOOST_FORCE = 420;
const BOOST_MAX = 100;
const BOOST_DRAIN = 55;
const BOOST_REGEN = 15;
const JUMP_FORCE = 200;

const BALL_R = 14;
const BALL_FRICTION = 0.988;
const BALL_BOUNCE = 0.72;

const BOOST_PAD_R = 13;
const BOOST_PAD_AMOUNT = 30;
const BOOST_PAD_COOLDOWN = 5000;
const BOOST_PAD_FULL_AMOUNT = 100;
const BOOST_PAD_FULL_COOLDOWN = 10000;

const GAME_DURATION = 300; // 5 min in seconds

// ─── GAME STATE ──────────────────────────────
let gameMode = '1v1';
let difficulty = 'medium';
let gameState = 'menu'; // menu | playing | paused | goal | ended
let blueScore = 0;
let orangeScore = 0;
let timeLeft = GAME_DURATION;
let timerInterval = null;
let goalTimeout = null;
let cars = [];
let ball = {};
let boostPads = [];
let particles = [];
let lastTime = 0;
let goalScored = false;

// ─── INPUT ───────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyZ') e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── SCREEN HELPERS ──────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  el.classList.remove('hidden');
}

function flashGoal(team) {
  const gs = document.getElementById('goal-screen');
  document.getElementById('goal-text').textContent = 'GOAL!';
  document.getElementById('goal-team').textContent = team + ' SCORES!';
  document.getElementById('goal-team').style.color = team === 'BLUE' ? 'var(--blue)' : 'var(--orange)';
  gs.classList.remove('hidden');
  gs.classList.add('active');
  setTimeout(() => {
    gs.classList.add('hidden');
    gs.classList.remove('active');
  }, 2000);
}

// ─── CAR CLASS ───────────────────────────────
class Car {
  constructor(x, y, angle, team, isPlayer, botDiff) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = angle;
    this.team = team; // 'blue' | 'orange'
    this.isPlayer = isPlayer;
    this.boost = 33;
    this.boosting = false;
    this.w = CAR_W; this.h = CAR_H;
    this.onGround = true;
    this.jumping = false;
    this.jumpVy = 0;
    this.jumpY = 0; // visual height offset
    this.jumpPressed = false;
    this.boostCooldown = 0;
    this.stunTimer = 0;
    // Bot AI
    this.botDiff = botDiff || difficulty;
    this.botTimer = 0;
    this.botTarget = null;
    this.botMode = 'chase'; // chase | defend | position
    this.botDecisionTimer = 0;
  }

  get forwardX() { return Math.cos(this.angle); }
  get forwardY() { return Math.sin(this.angle); }

  update(dt, inputLeft, inputRight, inputUp, inputDown, inputBoost, inputJump) {
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      // still apply friction
      this.vx *= Math.pow(CAR_FRICTION, dt * 60);
      this.vy *= Math.pow(CAR_FRICTION, dt * 60);
      this.integrate(dt);
      return;
    }

    // Rotation
    if (inputLeft)  this.angle -= CAR_ANGULAR * dt;
    if (inputRight) this.angle += CAR_ANGULAR * dt;

    // Acceleration
    const speed = Math.hypot(this.vx, this.vy);
    if (inputUp) {
      this.vx += this.forwardX * CAR_ACCEL * dt;
      this.vy += this.forwardY * CAR_ACCEL * dt;
    }
    if (inputDown) {
      this.vx -= this.forwardX * CAR_ACCEL * 0.6 * dt;
      this.vy -= this.forwardY * CAR_ACCEL * 0.6 * dt;
    }

    // Boost
    this.boosting = false;
    if (inputBoost && this.boost > 0) {
      this.vx += this.forwardX * BOOST_FORCE * dt;
      this.vy += this.forwardY * BOOST_FORCE * dt;
      this.boost = Math.max(0, this.boost - BOOST_DRAIN * dt);
      this.boosting = true;
      if (Math.random() < 0.3) spawnParticle(this.x, this.y, this.team === 'blue' ? '#00b4ff' : '#ff6a00', -this.forwardX, -this.forwardY);
    } else {
      this.boost = Math.min(BOOST_MAX, this.boost + BOOST_REGEN * dt);
    }

    // Jump
    if (inputJump && !this.jumpPressed && this.onGround) {
      this.jumpVy = -JUMP_FORCE;
      this.onGround = false;
      this.jumpPressed = true;
    }
    if (!inputJump) this.jumpPressed = false;

    // Jump Y physics (visual only, doesn't affect arena collision)
    if (!this.onGround) {
      this.jumpVy += 600 * dt; // gravity
      this.jumpY += this.jumpVy * dt;
      if (this.jumpY >= 0) { this.jumpY = 0; this.onGround = true; this.jumpVy = 0; }
    }

    // Cap speed
    const maxSpeed = inputBoost && this.boost > 0 ? 580 : 370;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > maxSpeed) {
      this.vx = (this.vx / spd) * maxSpeed;
      this.vy = (this.vy / spd) * maxSpeed;
    }

    // Friction
    this.vx *= Math.pow(CAR_FRICTION, dt * 60);
    this.vy *= Math.pow(CAR_FRICTION, dt * 60);

    this.integrate(dt);
  }

  integrate(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.wallCollide();
  }

  wallCollide() {
    const hw = this.w / 2, hh = this.h / 2;
    const pad = WALL_T + 2;

    if (this.x - hw < pad) { this.x = pad + hw; this.vx = Math.abs(this.vx) * 0.5; }
    if (this.x + hw > ARENA_W - pad) { this.x = ARENA_W - pad - hw; this.vx = -Math.abs(this.vx) * 0.5; }
    if (this.y - hh < pad) { this.y = pad + hh; this.vy = Math.abs(this.vy) * 0.5; }
    if (this.y + hh > ARENA_H - pad) { this.y = ARENA_H - pad - hh; this.vy = -Math.abs(this.vy) * 0.5; }
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y - Math.max(0, -this.jumpY * 0.3));
    ctx.rotate(this.angle);

    // Shadow
    if (this.jumpY < -4) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, 16 + this.jumpY * 0.2, this.w * 0.6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const col = this.team === 'blue' ? '#00b4ff' : '#ff6a00';
    const dark = this.team === 'blue' ? '#005580' : '#803300';

    // Body
    ctx.fillStyle = this.stunTimer > 0 ? '#555' : dark;
    ctx.beginPath();
    ctx.roundRect(-this.w/2, -this.h/2, this.w, this.h, 4);
    ctx.fill();

    // Color stripe
    ctx.fillStyle = this.stunTimer > 0 ? '#777' : col;
    ctx.beginPath();
    ctx.roundRect(-this.w/2 + 2, -this.h/2 + 2, this.w - 4, this.h - 4, 3);
    ctx.fill();

    // Windshield
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(0, -this.h/2 + 3, this.w/2 - 4, this.h/2 - 2, 2);
    ctx.fill();

    // Exhaust boost glow
    if (this.boosting) {
      ctx.save();
      const grad = ctx.createRadialGradient(-this.w/2, 0, 0, -this.w/2, 0, 18);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(-this.w/2, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Player indicator
    if (this.isPlayer) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', 0, -this.h/2 - 6);
    }

    ctx.restore();
  }

  // ─── BOT AI ────────────────────────────────
  botUpdate(dt) {
    const b = ball;
    const myGoalX = this.team === 'blue' ? WALL_T + GOAL_H + 10 : ARENA_W - WALL_T - GOAL_H - 10;
    const enemyGoalX = this.team === 'blue' ? ARENA_W - WALL_T - GOAL_H - 10 : WALL_T + GOAL_H + 10;
    const myGoalY = ARENA_H / 2;

    // Decision making
    this.botDecisionTimer -= dt;
    if (this.botDecisionTimer <= 0) {
      this.botDecisionTimer = 0.2 + Math.random() * 0.15;

      // Distance to ball
      const distToBall = Math.hypot(b.x - this.x, b.y - this.y);
      // Ball heading toward my goal?
      const ballToMyGoal = Math.hypot(myGoalX - b.x, myGoalY - b.y);
      const ballHeadingToMyGoal = b.vx * (myGoalX - b.x) + b.vy * (myGoalY - b.y) > 0;

      if (ballHeadingToMyGoal && ballToMyGoal < 250) {
        this.botMode = 'defend';
      } else if (distToBall < 300 || this.boost > 20) {
        this.botMode = 'chase';
      } else {
        this.botMode = 'position';
      }
    }

    let targetX, targetY;
    const lookAhead = { easy: 0.3, medium: 0.8, hard: 1.5 }[this.botDiff];
    const reactionNoise = { easy: 80, medium: 30, hard: 8 }[this.botDiff];
    const aggressiveness = { easy: 0.55, medium: 0.75, hard: 0.95 }[this.botDiff];

    if (this.botMode === 'chase') {
      // Predict ball position
      targetX = b.x + b.vx * lookAhead + (Math.random() - 0.5) * reactionNoise;
      targetY = b.y + b.vy * lookAhead + (Math.random() - 0.5) * reactionNoise;
    } else if (this.botMode === 'defend') {
      // Go between ball and own goal
      targetX = (b.x + myGoalX) / 2 + (Math.random() - 0.5) * reactionNoise;
      targetY = (b.y + myGoalY) / 2 + (Math.random() - 0.5) * reactionNoise;
    } else {
      // Position behind ball
      const dir = this.team === 'blue' ? -1 : 1;
      targetX = b.x + dir * 80;
      targetY = b.y + (Math.random() - 0.5) * 40;
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distToTarget = Math.hypot(dx, dy);

    // Angle to target
    const angleToTarget = Math.atan2(dy, dx);
    let angleDiff = angleToTarget - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const turnInput = Math.sign(angleDiff);
    const fwd = Math.abs(angleDiff) < Math.PI / 2.5;
    const distToBall = Math.hypot(b.x - this.x, b.y - this.y);
    const useBoost = this.boost > 15 && fwd && distToBall < 350 && Math.random() < aggressiveness;

    this.update(dt, turnInput < 0, turnInput > 0, fwd && distToTarget > 20, !fwd && distToTarget > 20, useBoost, false);
  }
}

// ─── BALL ─────────────────────────────────────
function makeBall() {
  return { x: ARENA_W / 2, y: ARENA_H / 2, vx: 0, vy: 0, r: BALL_R, spin: 0 };
}

function updateBall(dt) {
  const b = ball;
  b.spin = b.vx * 0.02;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.vx *= Math.pow(BALL_FRICTION, dt * 60);
  b.vy *= Math.pow(BALL_FRICTION, dt * 60);

  const pad = WALL_T + b.r;

  // Top/bottom wall
  if (b.y - b.r < WALL_T) { b.y = WALL_T + b.r; b.vy = Math.abs(b.vy) * BALL_BOUNCE; }
  if (b.y + b.r > ARENA_H - WALL_T) { b.y = ARENA_H - WALL_T - b.r; b.vy = -Math.abs(b.vy) * BALL_BOUNCE; }

  // Side walls (with goal gap)
  const goalTop = ARENA_H / 2 - GOAL_W / 2;
  const goalBot = ARENA_H / 2 + GOAL_W / 2;

  // Left wall
  if (b.x - b.r < WALL_T + GOAL_H) {
    if (b.y > goalTop && b.y < goalBot) {
      // GOAL for orange!
      if (!goalScored) triggerGoal('orange');
    } else {
      if (b.x - b.r < WALL_T) { b.x = WALL_T + b.r; b.vx = Math.abs(b.vx) * BALL_BOUNCE; }
    }
  }

  // Right wall
  if (b.x + b.r > ARENA_W - WALL_T - GOAL_H) {
    if (b.y > goalTop && b.y < goalBot) {
      // GOAL for blue!
      if (!goalScored) triggerGoal('blue');
    } else {
      if (b.x + b.r > ARENA_W - WALL_T) { b.x = ARENA_W - WALL_T - b.r; b.vx = -Math.abs(b.vx) * BALL_BOUNCE; }
    }
  }

  // Clamp to goal depth
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * BALL_BOUNCE; }
  if (b.x + b.r > ARENA_W) { b.x = ARENA_W - b.r; b.vx = -Math.abs(b.vx) * BALL_BOUNCE; }
}

function drawBall() {
  const b = ball;
  ctx.save();
  ctx.translate(b.x, b.y);

  // Glow
  const grd = ctx.createRadialGradient(0, 0, b.r * 0.3, 0, 0, b.r * 1.8);
  grd.addColorStop(0, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  const ballGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, b.r);
  ballGrad.addColorStop(0, '#fff');
  ballGrad.addColorStop(0.5, '#c8d8f0');
  ballGrad.addColorStop(1, '#6688aa');
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, Math.PI * 2);
  ctx.fill();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-3, -4, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── CAR–BALL COLLISION ───────────────────────
function carBallCollision(car) {
  const dx = ball.x - car.x;
  const dy = ball.y - car.y;
  const dist = Math.hypot(dx, dy);
  const minDist = BALL_R + Math.max(car.w, car.h) / 2 * 0.9;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const relVx = ball.vx - car.vx;
    const relVy = ball.vy - car.vy;
    const dot = relVx * nx + relVy * ny;

    const carSpeed = Math.hypot(car.vx, car.vy);
    const impulse = Math.max(-dot * 1.5, carSpeed * 0.8 + 80);

    ball.vx += nx * impulse;
    ball.vy += ny * impulse;

    // Push apart
    const overlap = minDist - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    spawnParticle(ball.x, ball.y, '#fff', nx, ny);
  }
}

// ─── CAR–CAR COLLISION ───────────────────────
function carCarCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = (CAR_W + CAR_H) / 2;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const relVx = a.vx - b.vx;
    const relVy = a.vy - b.vy;
    const dot = relVx * nx + relVy * ny;

    if (dot > 0) {
      const impulse = dot * 0.6;
      a.vx -= nx * impulse; a.vy -= ny * impulse;
      b.vx += nx * impulse; b.vy += ny * impulse;

      const speedA = Math.hypot(a.vx, a.vy);
      const speedB = Math.hypot(b.vx, b.vy);
      if (speedA > 150) b.stunTimer = 0.3;
      if (speedB > 150) a.stunTimer = 0.3;

      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;

      spawnParticle((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffff00', 0, 0);
    }
  }
}

// ─── BOOST PADS ──────────────────────────────
function makeBoostPads() {
  const pads = [];
  const positions = [
    // Full pads (corners)
    { x: 140, y: 100, full: true },
    { x: ARENA_W - 140, y: 100, full: true },
    { x: 140, y: ARENA_H - 100, full: true },
    { x: ARENA_W - 140, y: ARENA_H - 100, full: true },
    // Small pads
    { x: ARENA_W / 2, y: 80, full: false },
    { x: ARENA_W / 2, y: ARENA_H - 80, full: false },
    { x: ARENA_W / 2, y: ARENA_H / 2, full: false },
    { x: 260, y: ARENA_H / 2, full: false },
    { x: ARENA_W - 260, y: ARENA_H / 2, full: false },
  ];

  positions.forEach(p => {
    pads.push({ x: p.x, y: p.y, full: p.full, active: true, cooldownTimer: 0 });
  });
  return pads;
}

function updateBoostPads(dt) {
  boostPads.forEach(pad => {
    if (!pad.active) {
      pad.cooldownTimer -= dt * 1000;
      if (pad.cooldownTimer <= 0) pad.active = true;
    }
    if (pad.active) {
      cars.forEach(car => {
        const dist = Math.hypot(car.x - pad.x, car.y - pad.y);
        if (dist < BOOST_PAD_R + 8) {
          const amount = pad.full ? BOOST_PAD_FULL_AMOUNT : BOOST_PAD_AMOUNT;
          if (car.boost < BOOST_MAX) {
            car.boost = Math.min(BOOST_MAX, car.boost + amount);
            pad.active = false;
            pad.cooldownTimer = pad.full ? BOOST_PAD_FULL_COOLDOWN : BOOST_PAD_COOLDOWN;
            spawnParticle(pad.x, pad.y, '#ffe000', 0, -1);
          }
        }
      });
    }
  });
}

function drawBoostPads() {
  const now = performance.now();
  boostPads.forEach(pad => {
    const r = pad.full ? BOOST_PAD_R : BOOST_PAD_R * 0.7;
    const pulse = Math.sin(now * 0.003 + pad.x) * 0.3 + 0.7;

    ctx.save();
    ctx.globalAlpha = pad.active ? pulse : 0.2;

    // Glow
    const grd = ctx.createRadialGradient(pad.x, pad.y, 0, pad.x, pad.y, r * 2);
    grd.addColorStop(0, pad.full ? '#ffe000' : '#88aa00');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, r * 2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = pad.full ? '#ffe000' : '#aacc00';
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

// ─── PARTICLES ───────────────────────────────
function spawnParticle(x, y, color, nx, ny) {
  for (let i = 0; i < 4; i++) {
    const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.5;
    const speed = 80 + Math.random() * 140;
    particles.push({
      x, y, color,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.4 + Math.random() * 0.3,
      size: 2 + Math.random() * 3,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ─── ARENA DRAWING ───────────────────────────
function drawArena() {
  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  bgGrad.addColorStop(0, '#08101e');
  bgGrad.addColorStop(1, '#0a0c14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Field lines
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < ARENA_W; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); ctx.stroke();
  }
  for (let y = 0; y < ARENA_H; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); ctx.stroke();
  }
  ctx.restore();

  // Center circle
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ARENA_W / 2, ARENA_H / 2, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ARENA_W / 2, ARENA_H / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  ctx.restore();

  // Center line
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(ARENA_W / 2, WALL_T);
  ctx.lineTo(ARENA_W / 2, ARENA_H - WALL_T);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const goalTop = ARENA_H / 2 - GOAL_W / 2;
  const goalBot = ARENA_H / 2 + GOAL_W / 2;

  // Walls
  ctx.fillStyle = '#1a2035';
  ctx.fillRect(0, 0, ARENA_W, WALL_T); // top
  ctx.fillRect(0, ARENA_H - WALL_T, ARENA_W, WALL_T); // bottom
  // Left wall (with goal gap)
  ctx.fillRect(0, 0, WALL_T, goalTop);
  ctx.fillRect(0, goalBot, WALL_T, ARENA_H - goalBot);
  // Right wall (with goal gap)
  ctx.fillRect(ARENA_W - WALL_T, 0, WALL_T, goalTop);
  ctx.fillRect(ARENA_W - WALL_T, goalBot, WALL_T, ARENA_H - goalBot);

  // Wall accents
  ctx.strokeStyle = 'rgba(100,140,200,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(WALL_T, WALL_T, ARENA_W - WALL_T * 2, ARENA_H - WALL_T * 2);

  // Goals
  // Blue goal (left)
  ctx.save();
  const blueGoalGrad = ctx.createLinearGradient(0, 0, WALL_T + GOAL_H, 0);
  blueGoalGrad.addColorStop(0, 'rgba(0,100,200,0.7)');
  blueGoalGrad.addColorStop(1, 'rgba(0,100,200,0.1)');
  ctx.fillStyle = blueGoalGrad;
  ctx.fillRect(0, goalTop, WALL_T + GOAL_H, GOAL_W);
  ctx.strokeStyle = '#00b4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WALL_T + GOAL_H, goalTop);
  ctx.lineTo(0, goalTop);
  ctx.lineTo(0, goalBot);
  ctx.lineTo(WALL_T + GOAL_H, goalBot);
  ctx.stroke();
  ctx.restore();

  // Orange goal (right)
  ctx.save();
  const orangeGoalGrad = ctx.createLinearGradient(ARENA_W, 0, ARENA_W - WALL_T - GOAL_H, 0);
  orangeGoalGrad.addColorStop(0, 'rgba(200,80,0,0.7)');
  orangeGoalGrad.addColorStop(1, 'rgba(200,80,0,0.1)');
  ctx.fillStyle = orangeGoalGrad;
  ctx.fillRect(ARENA_W - WALL_T - GOAL_H, goalTop, WALL_T + GOAL_H, GOAL_W);
  ctx.strokeStyle = '#ff6a00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ARENA_W - WALL_T - GOAL_H, goalTop);
  ctx.lineTo(ARENA_W, goalTop);
  ctx.lineTo(ARENA_W, goalBot);
  ctx.lineTo(ARENA_W - WALL_T - GOAL_H, goalBot);
  ctx.stroke();
  ctx.restore();

  // Goal labels
  ctx.font = 'bold 10px Orbitron, sans-serif';
  ctx.fillStyle = 'rgba(0,180,255,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('BLUE', 20, ARENA_H / 2 + 3);
  ctx.fillStyle = 'rgba(255,106,0,0.5)';
  ctx.fillText('ONG', ARENA_W - 20, ARENA_H / 2 + 3);
}

// ─── GOAL & RESET ─────────────────────────────
function triggerGoal(scoringTeam) {
  if (goalScored) return;
  goalScored = true;
  gameState = 'goal';

  if (scoringTeam === 'blue') { blueScore++; }
  else { orangeScore++; }

  updateHUD();
  flashGoal(scoringTeam.toUpperCase());

  clearInterval(timerInterval);

  setTimeout(() => {
    goalScored = false;
    resetPositions();
    gameState = 'playing';
    startTimer();
  }, 2500);
}

function resetPositions() {
  ball.x = ARENA_W / 2;
  ball.y = ARENA_H / 2;
  ball.vx = (Math.random() - 0.5) * 60;
  ball.vy = (Math.random() - 0.5) * 60;

  const blueStarts = [
    { x: ARENA_W * 0.25, y: ARENA_H / 2, a: 0 },
    { x: ARENA_W * 0.2, y: ARENA_H * 0.3, a: 0.3 },
    { x: ARENA_W * 0.2, y: ARENA_H * 0.7, a: -0.3 },
  ];
  const orangeStarts = [
    { x: ARENA_W * 0.75, y: ARENA_H / 2, a: Math.PI },
    { x: ARENA_W * 0.8, y: ARENA_H * 0.3, a: Math.PI - 0.3 },
    { x: ARENA_W * 0.8, y: ARENA_H * 0.7, a: Math.PI + 0.3 },
  ];

  let bi = 0, oi = 0;
  cars.forEach(car => {
    if (car.team === 'blue') {
      const s = blueStarts[bi++];
      car.x = s.x; car.y = s.y; car.angle = s.a;
    } else {
      const s = orangeStarts[oi++];
      car.x = s.x; car.y = s.y; car.angle = s.a;
    }
    car.vx = 0; car.vy = 0;
    car.boost = 33;
    car.stunTimer = 0;
    car.jumpY = 0;
    car.onGround = true;
  });
}

// ─── HUD ─────────────────────────────────────
function updateHUD() {
  document.getElementById('score-blue').textContent = blueScore;
  document.getElementById('score-orange').textContent = orangeScore;

  const player = cars.find(c => c.isPlayer);
  if (player) {
    const pct = (player.boost / BOOST_MAX) * 100;
    document.getElementById('boost-bar').style.width = pct + '%';
    const hue = player.boost > 50 ? 50 : player.boost * 1;
    document.getElementById('boost-bar').style.background =
      `hsl(${hue}, 100%, 55%)`;
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = Math.floor(timeLeft % 60);
  document.getElementById('timer').textContent =
    m + ':' + (s < 10 ? '0' : '') + s;

  // Flash red when < 30s
  document.getElementById('timer').style.color = timeLeft <= 30 ? '#ff4444' : '#fff';
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (gameState !== 'playing') return;
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  clearInterval(timerInterval);
  gameState = 'ended';

  document.getElementById('end-blue').textContent = blueScore;
  document.getElementById('end-orange').textContent = orangeScore;

  let winner = '';
  if (blueScore > orangeScore) winner = '🏆 BLUE WINS!';
  else if (orangeScore > blueScore) winner = '🏆 ORANGE WINS!';
  else winner = '🤝 IT\'S A DRAW!';
  document.getElementById('end-winner').textContent = winner;
  document.getElementById('end-winner').style.color =
    blueScore > orangeScore ? 'var(--blue)' : blueScore < orangeScore ? 'var(--orange)' : 'var(--boost)';

  const endScreen = document.getElementById('end-screen');
  endScreen.classList.remove('hidden');
  endScreen.classList.add('active');
}

// ─── SETUP ───────────────────────────────────
function setupGame(mode) {
  gameMode = mode;
  blueScore = 0;
  orangeScore = 0;
  timeLeft = GAME_DURATION;
  particles = [];
  goalScored = false;

  canvas.width = ARENA_W;
  canvas.height = ARENA_H;

  cars = [];

  if (mode === '1v1') {
    cars.push(new Car(ARENA_W * 0.25, ARENA_H / 2, 0, 'blue', true));
    cars.push(new Car(ARENA_W * 0.75, ARENA_H / 2, Math.PI, 'orange', false));
  } else if (mode === '2v2') {
    cars.push(new Car(ARENA_W * 0.25, ARENA_H / 2, 0, 'blue', true));
    cars.push(new Car(ARENA_W * 0.2, ARENA_H * 0.3, 0.2, 'blue', false));
    cars.push(new Car(ARENA_W * 0.75, ARENA_H / 2, Math.PI, 'orange', false));
    cars.push(new Car(ARENA_W * 0.8, ARENA_H * 0.7, Math.PI - 0.2, 'orange', false));
  } else if (mode === '3v3') {
    cars.push(new Car(ARENA_W * 0.25, ARENA_H / 2, 0, 'blue', true));
    cars.push(new Car(ARENA_W * 0.2, ARENA_H * 0.3, 0.2, 'blue', false));
    cars.push(new Car(ARENA_W * 0.2, ARENA_H * 0.7, -0.2, 'blue', false));
    cars.push(new Car(ARENA_W * 0.75, ARENA_H / 2, Math.PI, 'orange', false));
    cars.push(new Car(ARENA_W * 0.8, ARENA_H * 0.3, Math.PI - 0.2, 'orange', false));
    cars.push(new Car(ARENA_W * 0.8, ARENA_H * 0.7, Math.PI + 0.2, 'orange', false));
  }

  ball = makeBall();
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 60);
  ball.vy = (Math.random() - 0.5) * 80;
  boostPads = makeBoostPads();

  updateHUD();
  updateTimerDisplay();
}

// ─── MAIN LOOP ───────────────────────────────
function gameLoop(ts) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (gameState !== 'playing') {
    if (gameState !== 'menu') {
      drawArena();
      drawBoostPads();
      updateParticles(dt);
      drawParticles();
      cars.forEach(c => c.draw());
      drawBall();
    }
    return;
  }

  // Player input
  const player = cars.find(c => c.isPlayer);
  if (player) {
    const left = keys['ArrowLeft'] || keys['KeyA'];
    const right = keys['ArrowRight'] || keys['KeyD'];
    const up = keys['ArrowUp'] || keys['KeyW'];
    const down = keys['ArrowDown'] || keys['KeyS'];
    const boost = keys['Space'];
    const jump = keys['KeyZ'];
    player.update(dt, left, right, up, down, boost, jump);
  }

  // Bots
  cars.forEach(c => { if (!c.isPlayer) c.botUpdate(dt); });

  // Collisions
  cars.forEach(c => carBallCollision(c));
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      carCarCollision(cars[i], cars[j]);
    }
  }

  updateBall(dt);
  updateBoostPads(dt);
  updateParticles(dt);
  updateHUD();

  // Draw
  drawArena();
  drawBoostPads();
  drawParticles();
  cars.forEach(c => c.draw());
  drawBall();
}

// ─── UI EVENTS ───────────────────────────────
document.getElementById('btn-play-1v1').addEventListener('click', () => {
  setupGame('1v1');
  showScreen('game-screen');
  gameState = 'playing';
  startTimer();
});

document.getElementById('btn-play-2v2').addEventListener('click', () => {
  setupGame('2v2');
  showScreen('game-screen');
  gameState = 'playing';
  startTimer();
});

document.getElementById('btn-play-3v3').addEventListener('click', () => {
  setupGame('3v3');
  showScreen('game-screen');
  gameState = 'playing';
  startTimer();
});

document.getElementById('btn-pause').addEventListener('click', () => {
  if (gameState === 'playing') {
    gameState = 'paused';
    clearInterval(timerInterval);
    document.getElementById('pause-screen').classList.add('active');
    document.getElementById('pause-screen').classList.remove('hidden');
  }
});

document.getElementById('btn-resume').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.remove('active');
  gameState = 'playing';
  startTimer();
});

document.getElementById('btn-menu-from-pause').addEventListener('click', () => {
  clearInterval(timerInterval);
  document.getElementById('pause-screen').classList.remove('active');
  gameState = 'menu';
  showScreen('menu-screen');
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.remove('active');
  setupGame(gameMode);
  showScreen('game-screen');
  gameState = 'playing';
  startTimer();
});

document.getElementById('btn-menu-from-end').addEventListener('click', () => {
  clearInterval(timerInterval);
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.remove('active');
  gameState = 'menu';
  showScreen('menu-screen');
});

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
  });
});

// Keyboard shortcut: Escape to pause
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && gameState === 'playing') {
    gameState = 'paused';
    clearInterval(timerInterval);
    document.getElementById('pause-screen').classList.add('active');
  } else if (e.code === 'Escape' && gameState === 'paused') {
    document.getElementById('pause-screen').classList.remove('active');
    gameState = 'playing';
    startTimer();
  }
});

// ─── BOOT ────────────────────────────────────
showScreen('menu-screen');
requestAnimationFrame(gameLoop);
