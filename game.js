const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const SCOREBOARD_H = 72;
const MATCH_DURATION = 90;
const JOY_DEADZONE = 12;
const PLAYER_SPEED = 3.5;
const ENEMY_SPEED = 2.0;
const SPRINT_MULT = 1.7;
const WORLD_SCALE_Y = 1.8;
const BALL_HOLD_SLOW = 0.8;
const COUNTDOWN_TIME = 3;

const STAMINA_MAX = 100;
const STAMINA_DRAIN_WALK = 1.2;
const STAMINA_DRAIN_SPRINT = 7;
const STAMINA_REGEN = 20;
const STAMINA_LOW = 15;
const STAMINA_SLOW = 30;

const TACKLE_DURATION = 0.18;
const TACKLE_COOLDOWN_HIT = 0.5;
const TACKLE_COOLDOWN_MISS = 1.5;
const TACKLE_SPEED = 7;
const TACKLE_STAMINA_COST = 10;

const AI_DRIBBLE_STICK = 0.18;
const AI_STICK_PENALTY_LOW = 0.5;
const AI_STICK_PENALTY_CRIT = 0.2;
const AI_STUN_TIME = 0.3;
const BALL_BOUNCE_FORCE = 9;

let W = 0, H = 0;
let WORLD_W = 0, WORLD_H = 0;
let homeScore = 0, awayScore = 0;
let goalMsg = null, goalCooldown = 0;
let sprinting = false;
let gameState = {
  screen: 'menu',
  timeLeft: MATCH_DURATION,
  countdown: COUNTDOWN_TIME,
  isFullTime: false
};

const camera = { y: 0 };
const player = {
  x:0, y:0, r:20, color:'#2196f3',
  stamina: STAMINA_MAX,
  tackling: false,
  tackleTimer: 0,
  tackleCooldown: 0,
  tackleDirX: 0, tackleDirY: -1
};
const enemy = {
  x:0, y:0, r:20, color:'#f44336',
  stamina: STAMINA_MAX,
  stunTimer: 0
};
const ball = { x:0, y:0, r:9, vx:0, vy:0 };

const joy       = { active:false, id:null, baseX:0, baseY:0, x:0, y:0, R:80 };
const btnShoot  = { x:0, y:0, r:42, pressed:false, id:null };
const btnPass   = { x:0, y:0, r:30, pressed:false, id:null };
const btnSprint = { x:0, y:0, r:30, pressed:false, id:null };
const btnTackle = { x:0, y:0, r:30, pressed:false, id:null };
const btnPause  = { x:32, y:SCOREBOARD_H/2, r:18, pressed:false, id:null };

let goalWidth = 0, goalLeft = 0, goalRight = 0;
let fieldTop = 0, fieldBot = 0;
let penaltyH = 0;

let audioCtx = null;
function ensureAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
}

function playKick() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
  o1.connect(g1); g1.connect(audioCtx.destination);
  o1.type = 'sine';
  o1.frequency.setValueAtTime(220, t);
  o1.frequency.exponentialRampToValueAtTime(90, t + 0.1);
  g1.gain.setValueAtTime(0.3, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o1.start(t); o1.stop(t + 0.18);
}

function playPass() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(280, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.start(t); o.stop(t + 0.12);
}

function playTackle() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const n = audioCtx.sampleRate * 0.18;
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const g = audioCtx.createGain(); g.gain.value = 0.22;
  src.connect(g); g.connect(audioCtx.destination);
  src.start(t);
  const o = audioCtx.createOscillator(), go = audioCtx.createGain();
  o.connect(go); go.connect(audioCtx.destination);
  o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
  go.gain.setValueAtTime(0.12, t);
  go.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.start(t); o.stop(t + 0.25);
}

function playGoal() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const notes = [523,659,784,1047];
  for (let i=0;i<notes.length;i++){
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'triangle'; o.frequency.value = notes[i];
    const s = t + i * 0.1;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.22, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
    o.start(s); o.stop(s + 0.35);
  }
}

function playWhistle() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(2000, t);
  o.frequency.setValueAtTime(2200, t + 0.1);
  o.frequency.setValueAtTime(2000, t + 0.3);
  g.gain.setValueAtTime(0.07, t);
  g.gain.setValueAtTime(0.09, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.start(t); o.stop(t + 0.55);
}

function playBeep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = 'sine'; o.frequency.value = 660;
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.start(t); o.stop(t + 0.18);
}

function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = innerWidth;
  H = innerHeight;
  WORLD_W = W;
  WORLD_H = H * WORLD_SCALE_Y;
  goalWidth = WORLD_W * 0.34;
  goalLeft = WORLD_W/2 - goalWidth/2;
  goalRight = WORLD_W/2 + goalWidth/2;
  fieldTop = SCOREBOARD_H;
  fieldBot = WORLD_H - 10;
  penaltyH = WORLD_H * 0.10;
  layoutButtons();
}

function layoutButtons() {
  btnSprint.x = W - 70;  btnSprint.y = H - 90;
  btnShoot.x  = W - 70;  btnShoot.y  = H - 180;
  btnPass.x   = W - 155; btnPass.y   = H - 90;
  btnTackle.x = W - 155; btnTackle.y = H - 180;
}
window.addEventListener('resize', resize);

function hitsBtn(x, y, b) { return Math.hypot(x - b.x, y - b.y) < b.r + 14; }
function getRestartBtn() { return { x: W/2 - 100, y: H*0.68, w: 200, h: 60 }; }
function getPlayBtn()    { return { x: W/2 - 100, y: H*0.62, w: 200, h: 60 }; }
function getResumeBtn()  { return { x: W/2 - 100, y: H*0.42, w: 200, h: 55 }; }
function getExitBtn()    { return { x: W/2 - 100, y: H*0.52, w: 200, h: 55 }; }

function onTouchStart(ev) {
  ensureAudio();
  for (const t of ev.changedTouches) {
    const x = t.clientX, y = t.clientY;

    if (gameState.screen === 'menu') {
      const pb = getPlayBtn();
      if (x > pb.x && x < pb.x + pb.w && y > pb.y && y < pb.y + pb.h) startCountdown();
      continue;
    }
    if (gameState.screen === 'countdown') continue;

    if (gameState.screen === 'paused') {
      const rb = getResumeBtn();
      const eb = getExitBtn();
      if (x > rb.x && x < rb.x + rb.w && y > rb.y && y < rb.y + rb.h) {
        gameState.screen = 'playing';
      } else if (x > eb.x && x < eb.x + eb.w && y > eb.y && y < eb.y + eb.h) {
        goToMenu();
      }
      continue;
    }

    if (gameState.screen === 'fulltime') {
      const rb = getRestartBtn();
      if (x > rb.x && x < rb.x + rb.w && y > rb.y && y < rb.y + rb.h) startCountdown();
      continue;
    }

    if (y < SCOREBOARD_H) {
      if (hitsBtn(x, y, btnPause)) {
        btnPause.pressed = true; btnPause.id = t.identifier;
        gameState.screen = 'paused';
      }
      continue;
    }

    if (hitsBtn(x, y, btnShoot)) {
      btnShoot.pressed = true; btnShoot.id = t.identifier; shoot();
    } else if (hitsBtn(x, y, btnPass)) {
      btnPass.pressed = true; btnPass.id = t.identifier; doPass();
    } else if (hitsBtn(x, y, btnTackle)) {
      btnTackle.pressed = true; btnTackle.id = t.identifier; doTackle();
    } else if (hitsBtn(x, y, btnSprint)) {
      btnSprint.pressed = true; btnSprint.id = t.identifier;
    } else if (x < W/2) {
      joy.active = true; joy.id = t.identifier;
      joy.baseX = x; joy.baseY = y; joy.x = x; joy.y = y;
    }
  }
  ev.preventDefault();
}

function onTouchMove(ev) {
  for (const t of ev.changedTouches) {
    if (t.identifier === joy.id) {
      let dx = t.clientX - joy.baseX;
      let dy = t.clientY - joy.baseY;
      const d = Math.hypot(dx, dy);
      if (d > joy.R) { dx = dx/d*joy.R; dy = dy/d*joy.R; }
      joy.x = joy.baseX + dx;
      joy.y = joy.baseY + dy;
    }
  }
  ev.preventDefault();
}

function onTouchEnd(ev) {
  for (const t of ev.changedTouches) {
    if (t.identifier === joy.id)       { joy.active = false; joy.id = null; }
    if (t.identifier === btnShoot.id)  { btnShoot.pressed = false; btnShoot.id = null; }
    if (t.identifier === btnPass.id)   { btnPass.pressed = false; btnPass.id = null; }
    if (t.identifier === btnSprint.id) { btnSprint.pressed = false; btnSprint.id = null; }
    if (t.identifier === btnTackle.id) { btnTackle.pressed = false; btnTackle.id = null; }
    if (t.identifier === btnPause.id)  { btnPause.pressed = false; btnPause.id = null; }
  }
  ev.preventDefault();
}

canvas.addEventListener('touchstart', onTouchStart, {passive:false});
canvas.addEventListener('touchmove', onTouchMove, {passive:false});
canvas.addEventListener('touchend', onTouchEnd, {passive:false});
canvas.addEventListener('touchcancel', onTouchEnd, {passive:false});

function getAimDir(defaultToGoal) {
  if (joy.active) {
    const dx = joy.x - joy.baseX;
    const dy = joy.y - joy.baseY;
    const len = Math.hypot(dx, dy);
    if (len > JOY_DEADZONE) return { x: dx/len, y: dy/len };
  }
  if (defaultToGoal) {
    const tx = WORLD_W/2, ty = fieldTop;
    const len = Math.hypot(tx - ball.x, ty - ball.y) || 1;
    return { x: (tx - ball.x)/len, y: (ty - ball.y)/len };
  }
  return { x: 0, y: -1 };
}

function shoot() {
  const d = Math.hypot(ball.x - player.x, ball.y - player.y);
  if (d < player.r + ball.r + 28) {
    const dir = getAimDir(true);
    ball.vx = dir.x * 17;
    ball.vy = dir.y * 17;
    playKick();
    vibrate([30]);
  }
}

function doPass() {
  const d = Math.hypot(ball.x - player.x, ball.y - player.y);
  if (d < player.r + ball.r + 28) {
    const dir = getAimDir(false);
    ball.vx = dir.x * 10;
    ball.vy = dir.y * 10;
    playPass();
    vibrate([15]);
  }
}

function doTackle() {
  if (player.tackleCooldown > 0) return;
  if (player.tackling) return;
  if (player.stamina < TACKLE_STAMINA_COST) {
    playBeep();
    return;
  }
  player.tackling = true;
  player.tackleTimer = TACKLE_DURATION;
  player.stamina -= TACKLE_STAMINA_COST;

  let dirX = 0, dirY = -1;
  if (joy.active) {
    const dx = joy.x - joy.baseX;
    const dy = joy.y - joy.baseY;
    const len = Math.hypot(dx, dy);
    if (len > JOY_DEADZONE) { dirX = dx/len; dirY = dy/len; }
  } else {
    const bdx = ball.x - player.x;
    const bdy = ball.y - player.y;
    const bl = Math.hypot(bdx, bdy) || 1;
    dirX = bdx/bl; dirY = bdy/bl;
  }
  player.tackleDirX = dirX;
  player.tackleDirY = dirY;

  playTackle();
  vibrate([40]);
}
function startCountdown() {
  homeScore = 0; awayScore = 0;
  gameState.timeLeft = MATCH_DURATION;
  gameState.countdown = COUNTDOWN_TIME;
  gameState.isFullTime = false;
  gameState.screen = 'countdown';
  goalMsg = null; goalCooldown = 0;
  player.stamina = STAMINA_MAX;
  player.tackling = false;
  player.tackleCooldown = 0;
  enemy.stamina = STAMINA_MAX;
  enemy.stunTimer = 0;
  resetPositions();
}

function goToMenu() {
  gameState.screen = 'menu';
  homeScore = 0; awayScore = 0;
  goalMsg = null; goalCooldown = 0;
  resetPositions();
}

function init() { resize(); resetPositions(); gameState.screen = 'menu'; }

function resetPositions() {
  player.x = WORLD_W/2;  player.y = WORLD_H * 0.60;
  enemy.x  = WORLD_W/2;  enemy.y  = WORLD_H * 0.35;
  ball.x   = WORLD_W/2;  ball.y   = WORLD_H * 0.50;
  ball.vx = 0; ball.vy = 0;
  camera.y = Math.max(0, Math.min(WORLD_H - H, ball.y - H/2));
}

function triggerGoal(msg, isHome) {
  goalMsg = { text: msg, timer: 110, isHome: isHome };
  goalCooldown = 150;
  ball.vx = 0; ball.vy = 0;
  playGoal();
  vibrate([80, 40, 80, 40, 200]);
}

function updateCamera() {
  const targetY = Math.max(0, Math.min(WORLD_H - H, ball.y - H/2));
  camera.y += (targetY - camera.y) * 0.12;
}

function speedMultFromStamina(st) {
  if (st < STAMINA_LOW) return 0.65;
  if (st < STAMINA_SLOW) return 0.85;
  return 1;
}

function getAIStickMult() {
  if (enemy.stamina < STAMINA_LOW) return AI_STICK_PENALTY_CRIT;
  if (enemy.stamina < STAMINA_SLOW) return AI_STICK_PENALTY_LOW;
  return 1;
}

function update(dt) {
  if (gameState.screen === 'menu') return;
  if (gameState.screen === 'paused') return;
  if (gameState.screen === 'fulltime') return;

  if (gameState.screen === 'countdown') {
    const before = Math.ceil(gameState.countdown);
    gameState.countdown -= dt;
    const after = Math.ceil(gameState.countdown);
    if (after !== before && after > 0) { playBeep(); vibrate([20]); }
    if (gameState.countdown <= 0) {
      gameState.screen = 'playing';
      playWhistle(); vibrate([100]);
    }
    return;
  }

  if (!goalMsg) {
    gameState.timeLeft -= dt;
    if (gameState.timeLeft <= 0) {
      gameState.timeLeft = 0;
      gameState.isFullTime = true;
      gameState.screen = 'fulltime';
      playWhistle(); vibrate([200]);
      return;
    }
  }
  if (goalMsg) {
    goalMsg.timer--;
    if (goalMsg.timer <= 0) { goalMsg = null; resetPositions(); }
    return;
  }
  if (goalCooldown > 0) goalCooldown--;

  if (player.tackleCooldown > 0) player.tackleCooldown -= dt;
  if (enemy.stunTimer > 0) enemy.stunTimer -= dt;

  const distPB = Math.hypot(ball.x - player.x, ball.y - player.y);
  const playerHasBall = distPB < player.r + ball.r + 8;

  // ===== PLAYER MOVEMENT =====
  if (player.tackling) {
    player.tackleTimer -= dt;
    player.x += player.tackleDirX * TACKLE_SPEED * 60 * dt;
    player.y += player.tackleDirY * TACKLE_SPEED * 60 * dt;

    const dB = Math.hypot(ball.x - player.x, ball.y - player.y);
    if (dB < player.r + ball.r + 14) {
      // HIT! Steal ball
      const wasAIHolding = Math.hypot(ball.x - enemy.x, ball.y - enemy.y) < enemy.r + ball.r + 12;
      const force = wasAIHolding ? BALL_BOUNCE_FORCE * 1.8 : BALL_BOUNCE_FORCE;
      ball.vx = player.tackleDirX * force;
      ball.vy = player.tackleDirY * force;
      player.tackling = false;
      player.tackleTimer = 0;
      player.tackleCooldown = TACKLE_COOLDOWN_HIT;
      if (wasAIHolding) {
        enemy.stunTimer = AI_STUN_TIME;
        vibrate([60]);
      }
    } else if (player.tackleTimer <= 0) {
      // MISS! Long cooldown
      player.tackling = false;
      player.tackleCooldown = TACKLE_COOLDOWN_MISS;
    }
  } else {
    if (joy.active) {
      const dx = joy.x - joy.baseX;
      const dy = joy.y - joy.baseY;
      const d = Math.hypot(dx, dy);
      if (d > JOY_DEADZONE) {
        const intensity = Math.min(1, (d - JOY_DEADZONE) / (joy.R - JOY_DEADZONE));
        const canSprint = btnSprint.pressed && player.stamina > STAMINA_LOW;
        let spd = PLAYER_SPEED * (canSprint ? SPRINT_MULT : 1);
        spd *= speedMultFromStamina(player.stamina);
        if (playerHasBall) spd *= BALL_HOLD_SLOW;
        player.x += (dx/d) * spd * intensity;
        player.y += (dy/d) * spd * intensity;
      }
    }
  }
  sprinting = btnSprint.pressed && joy.active && !playerHasBall
              && player.stamina > STAMINA_LOW && !player.tackling;

  player.x = Math.max(player.r, Math.min(WORLD_W - player.r, player.x));
  player.y = Math.max(fieldTop + player.r, Math.min(WORLD_H - player.r, player.y));

  // ===== PLAYER STAMINA =====
  let drain = 0;
  if (player.tackling) drain = 0;
  else if (joy.active) {
    const d = Math.hypot(joy.x - joy.baseX, joy.y - joy.baseY);
    if (d > JOY_DEADZONE) drain = sprinting ? STAMINA_DRAIN_SPRINT : STAMINA_DRAIN_WALK;
  }
  if (drain > 0) player.stamina -= drain * dt;
  else player.stamina += STAMINA_REGEN * dt;
  player.stamina = Math.max(0, Math.min(STAMINA_MAX, player.stamina));

  // ===== AI =====
  const distToBall = Math.hypot(ball.x - enemy.x, ball.y - enemy.y);
  const aiHasBall = distToBall < enemy.r + ball.r + 10;
  const aiGoalX = WORLD_W / 2;
  const aiGoalY = fieldBot;

  if (enemy.stunTimer > 0) {
    // AI bị khựng → không làm gì
  } else if (aiHasBall) {
    let dirX = aiGoalX - enemy.x;
    let dirY = aiGoalY - enemy.y;
    let len = Math.hypot(dirX, dirY) || 1;
    dirX /= len; dirY /= len;

    const dxp = enemy.x - player.x;
    const dyp = enemy.y - player.y;
    const distP = Math.hypot(dxp, dyp) || 1;
    if (distP < 120) {
      const push = (120 - distP) / 120 * 1.2;
      dirX += (dxp / distP) * push;
      dirY += (dyp / distP) * push;
      len = Math.hypot(dirX, dirY) || 1;
      dirX /= len; dirY /= len;
    }

    const aiSpd = ENEMY_SPEED * BALL_HOLD_SLOW * speedMultFromStamina(enemy.stamina);
    enemy.x += dirX * aiSpd;
    enemy.y += dirY * aiSpd;
    enemy.stamina -= 3 * dt;

    // ===== DRIBBLE (giảm độ dính) =====
    const stick = AI_DRIBBLE_STICK * getAIStickMult();
    const leadDist = enemy.r + ball.r - 2;
    const tbx = enemy.x + dirX * leadDist;
    const tby = enemy.y + dirY * leadDist;
    ball.x += (tbx - ball.x) * stick;
    ball.y += (tby - ball.y) * stick;
    // Bỏ ép vx/vy = 0 → để bóng có quán tính, dễ bị cướp

    const distGoal = Math.hypot(aiGoalX - enemy.x, aiGoalY - enemy.y);
    if (distGoal < penaltyH * 1.2 && goalCooldown <= 0) {
      const sx = aiGoalX - ball.x;
      const sy = aiGoalY - ball.y;
      const sl = Math.hypot(sx, sy) || 1;
      ball.vx = (sx / sl) * 15;
      ball.vy = (sy / sl) * 15;
      playKick();
    }
  } else {
    const ax = ball.x - enemy.x, ay = ball.y - enemy.y;
    const ad = Math.hypot(ax, ay);
    if (ad > 1) {
      let mx = ax / ad, my = ay / ad;
      const margin = 40;
      if (enemy.x < margin) mx += 1.2;
      if (enemy.x > WORLD_W - margin) mx -= 1.2;
      if (enemy.y < fieldTop + margin) my += 1.2;
      if (enemy.y > WORLD_H - margin) my -= 1.2;
      const ml = Math.hypot(mx, my) || 1;
      const spd = ENEMY_SPEED * speedMultFromStamina(enemy.stamina);
      enemy.x += (mx / ml) * spd;
      enemy.y += (my / ml) * spd;
    }
    enemy.stamina -= 2 * dt;
  }
  enemy.stamina = Math.max(0, Math.min(STAMINA_MAX, enemy.stamina));
  if (!aiHasBall && !joy.active && enemy.stunTimer <= 0) enemy.stamina += STAMINA_REGEN * dt;
  enemy.stamina = Math.max(0, Math.min(STAMINA_MAX, enemy.stamina));

  enemy.x = Math.max(enemy.r, Math.min(WORLD_W - enemy.r, enemy.x));
  enemy.y = Math.max(fieldTop + enemy.r, Math.min(WORLD_H - enemy.r, enemy.y));

  // ===== BALL COLLISION (player khi không tackling) =====
  if (!aiHasBall && !player.tackling) {
    const d1 = Math.hypot(ball.x - player.x, ball.y - player.y);
    if (d1 < player.r + ball.r && d1 > 0.01) {
      const ang = Math.atan2(ball.y - player.y, ball.x - player.x);
      ball.vx = Math.cos(ang) * 7;
      ball.vy = Math.sin(ang) * 7;
    }
  }

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= 0.965;
  ball.vy *= 0.965;
  if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.05) ball.vy = 0;

  if (ball.x < ball.r)           { ball.x = ball.r; ball.vx *= -0.8; }
  if (ball.x > WORLD_W - ball.r) { ball.x = WORLD_W - ball.r; ball.vx *= -0.8; }

  if (ball.y - ball.r < fieldTop + 8) {
    if (ball.x > goalLeft && ball.x < goalRight && goalCooldown <= 0) {
      homeScore++; triggerGoal('BAN GHI BAN!', true); return;
    } else {
      ball.y = fieldTop + 8 + ball.r;
      ball.vy *= -0.8;
    }
  }
  if (ball.y + ball.r > fieldBot - 8) {
    if (ball.x > goalLeft && ball.x < goalRight && goalCooldown <= 0) {
      awayScore++; triggerGoal('DOI THU GHI BAN', false); return;
    } else {
      ball.y = fieldBot - 8 - ball.r;
      ball.vy *= -0.8;
    }
  }

  updateCamera();
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

function draw() {
  if (gameState.screen === 'menu') { drawMenu(); return; }
  ctx.fillStyle = '#0b1f0b';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(0, -camera.y);
  drawWorld();
  ctx.restore();
  drawMinimap();
  drawScoreboard();
  drawJoystickUI();
  drawButtonsUI();
  if (goalMsg) drawGoalOverlay();
  if (gameState.screen === 'countdown') drawCountdown();
  if (gameState.screen === 'paused')    drawPauseMenu();
  if (gameState.screen === 'fulltime')  drawFullTime();
}

function drawMenu() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d2a0d'); g.addColorStop(1, '#051a05');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 34px sans-serif';
  ctx.fillText('MINI FC MOBILE', W/2, H * 0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '14px sans-serif';
  ctx.fillText('UPDATE 2.2.1', W/2, H * 0.20);

  const lgR = 46, lgY = H * 0.38;
  const lg1X = W/2 - 90, lg2X = W/2 + 90;

  const gr1 = ctx.createRadialGradient(lg1X-10, lgY-10, 5, lg1X, lgY, lgR);
  gr1.addColorStop(0, '#64b5f6'); gr1.addColorStop(1, '#0d47a1');
  ctx.beginPath(); ctx.arc(lg1X, lgY, lgR, 0, Math.PI*2);
  ctx.fillStyle = gr1; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText('FC', lg1X, lgY + 1);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('DOI BAN', lg1X, lgY + lgR + 20);

  const gr2 = ctx.createRadialGradient(lg2X-10, lgY-10, 5, lg2X, lgY, lgR);
  gr2.addColorStop(0, '#ef5350'); gr2.addColorStop(1, '#b71c1c');
  ctx.beginPath(); ctx.arc(lg2X, lgY, lgR, 0, Math.PI*2);
  ctx.fillStyle = gr2; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText('AI', lg2X, lgY + 1);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('DOI AI', lg2X, lgY + lgR + 20);

  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText('VS', W/2, lgY);

  const pb = getPlayBtn();
  const gp = ctx.createLinearGradient(pb.x, pb.y, pb.x, pb.y + pb.h);
  gp.addColorStop(0, '#43a047'); gp.addColorStop(1, '#1b5e20');
  roundRect(pb.x, pb.y, pb.w, pb.h, 14); ctx.fillStyle = gp; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  roundRect(pb.x, pb.y, pb.w, pb.h, 14); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText('PLAY', pb.x + pb.w/2, pb.y + pb.h/2);

  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '13px sans-serif';
  ctx.fillText('Tran dau 90 giay', W/2, H * 0.78);
  ctx.fillText('XOAC de cuop bong - The luc gioi han toc do', W/2, H * 0.82);
}

function drawCountdown() {
  const n = Math.ceil(gameState.countdown);
  const frac = gameState.countdown - Math.floor(gameState.countdown);
  let text, color;
  if (n > 0) { text = String(n); color = '#ffd54f'; }
  else       { text = 'GO!';      color = '#4caf50'; }
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
  const scale = 1 + (1 - frac) * 0.3;
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color; ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawPauseMenu() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', W/2, H * 0.28);

  const rb = getResumeBtn();
  const gr = ctx.createLinearGradient(rb.x, rb.y, rb.x, rb.y + rb.h);
  gr.addColorStop(0, '#43a047'); gr.addColorStop(1, '#1b5e20');
  roundRect(rb.x, rb.y, rb.w, rb.h, 14); ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  roundRect(rb.x, rb.y, rb.w, rb.h, 14); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('TIEP TUC', rb.x + rb.w/2, rb.y + rb.h/2);

  const eb = getExitBtn();
  const ge = ctx.createLinearGradient(eb.x, eb.y, eb.x, eb.y + eb.h);
  ge.addColorStop(0, '#e53935'); ge.addColorStop(1, '#b71c1c');
  roundRect(eb.x, eb.y, eb.w, eb.h, 14); ctx.fillStyle = ge; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  roundRect(eb.x, eb.y, eb.w, eb.h, 14); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('THOAT', eb.x + eb.w/2, eb.y + eb.h/2);
}

function drawStaminaBar(x, y, w, h, ratio, isPlayer) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  let c = '#4caf50';
  if (ratio < 0.25) c = '#f44336';
  else if (ratio < 0.5) c = '#ff9800';
  else if (!isPlayer) c = '#ff7043';
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w * ratio, h);
}

function drawWorld() {
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(0, fieldTop, WORLD_W, WORLD_H - fieldTop);

  const stripeH = 90;
  const stripes = Math.ceil((WORLD_H - fieldTop) / stripeH);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 1) ctx.fillRect(0, fieldTop + i * stripeH, WORLD_W, stripeH);
  }

  const midY = (fieldTop + fieldBot) / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(WORLD_W, midY); ctx.stroke();
  ctx.beginPath(); ctx.arc(WORLD_W/2, midY, WORLD_W * 0.13, 0, Math.PI*2); ctx.stroke();
  ctx.strokeRect(WORLD_W/2 - WORLD_W*0.22, fieldTop, WORLD_W*0.44, penaltyH);
  ctx.strokeRect(WORLD_W/2 - WORLD_W*0.22, fieldBot - penaltyH, WORLD_W*0.44, penaltyH);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 14; i++) {
    const x = goalLeft + (goalWidth * i / 14);
    ctx.beginPath(); ctx.moveTo(x, fieldTop); ctx.lineTo(x, fieldTop + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, fieldBot - 16); ctx.lineTo(x, fieldBot); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(goalLeft, fieldTop, goalWidth, 5);
  ctx.fillRect(goalLeft, fieldBot - 5, goalWidth, 5);

  if (sprinting) {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 7, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,235,59,0.75)';
    ctx.lineWidth = 3; ctx.stroke();
  }

  if (player.tackling) {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 5, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,152,0,0.85)';
    ctx.lineWidth = 4; ctx.stroke();
  }

  if (enemy.stunTimer > 0) {
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.r + 6, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,235,59,0.9)';
    ctx.lineWidth = 3; ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(player.x, player.y + 4, player.r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = player.color;
  ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('10', player.x, player.y + 1);

  drawStaminaBar(player.x - 22, player.y - player.r - 12, 44, 5,
                 player.stamina / STAMINA_MAX, true);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(enemy.x, enemy.y + 4, enemy.r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = enemy.color;
  ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText('9', enemy.x, enemy.y + 1);

  drawStaminaBar(enemy.x - 22, enemy.y - enemy.r - 12, 44, 5,
                 enemy.stamina / STAMINA_MAX, false);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(ball.x, ball.y + 3, ball.r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 0.35, 0, Math.PI*2); ctx.fill();
}

function drawMinimap() {
  const mmW = 58, mmH = 96;
  const mmX = W - mmW - 10, mmY = SCOREBOARD_H + 10;
  const sx = mmW / WORLD_W, sy = mmH / WORLD_H;
  ctx.fillStyle = 'rgba(10,20,10,0.75)';
  roundRect(mmX, mmY, mmW, mmH, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  roundRect(mmX, mmY, mmW, mmH, 4); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(mmX, mmY + mmH/2); ctx.lineTo(mmX + mmW, mmY + mmH/2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mmX + ball.x*sx, mmY + ball.y*sy, 2.2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#2196f3';
  ctx.beginPath(); ctx.arc(mmX + player.x*sx, mmY + player.y*sy, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#f44336';
  ctx.beginPath(); ctx.arc(mmX + enemy.x*sx, mmY + enemy.y*sy, 3, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.strokeRect(mmX, mmY + camera.y * sy, mmW, H * sy);
}

function drawRoundBtn(b, label, c1, c2, fs, disabled) {
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  const g = ctx.createRadialGradient(b.x, b.y - b.r*0.3, 3, b.x, b.y, b.r);
  if (disabled) { g.addColorStop(0, '#555'); g.addColorStop(1, '#333'); }
  else if (b.pressed) { g.addColorStop(0, '#fff'); g.addColorStop(1, c1); }
  else { g.addColorStop(0, c1); g.addColorStop(1, c2); }
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = disabled ? 'rgba(255,255,255,0.3)' : '#fff';
  ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = disabled ? 'rgba(255,255,255,0.4)' : '#fff';
  ctx.font = 'bold ' + fs + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, b.x, b.y);
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m + ':' + (ss < 10 ? '0' + ss : ss);
}

function drawJoystickUI() {
  if (joy.active) {
    ctx.beginPath(); ctx.arc(joy.baseX, joy.baseY, joy.R, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(joy.x, joy.y, 32, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(90, H - 100, 60, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DI CHUYEN', 90, H - 100);
  }
}

function drawButtonsUI() {
  const tackleDisabled = player.stamina < TACKLE_STAMINA_COST || player.tackleCooldown > 0;
  const sprintDisabled = player.stamina <= STAMINA_LOW;
  drawRoundBtn(btnTackle, 'XOAC', '#ff6f00', '#e65100', 11, tackleDisabled);
  drawRoundBtn(btnShoot,  'SUT',  '#e53935', '#b71c1c', 20, false);
  drawRoundBtn(btnPass,   'CHUYEN','#1e88e5', '#0d47a1', 11, false);
  drawRoundBtn(btnSprint, 'CHAY', '#43a047', '#1b5e20', 11, sprintDisabled);
}

function drawScoreboard() {
  ctx.fillStyle = 'rgba(10,10,20,0.92)';
  ctx.fillRect(0, 0, W, SCOREBOARD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, SCOREBOARD_H - 1, W, 1);
  const cy = SCOREBOARD_H / 2;

  ctx.beginPath(); ctx.arc(btnPause.x, btnPause.y, btnPause.r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(btnPause.x - 5, btnPause.y - 7, 4, 14);
  ctx.fillRect(btnPause.x + 1, btnPause.y - 7, 4, 14);

  const lr = 19;
  const hx = 95;
  ctx.beginPath(); ctx.arc(hx, cy, lr, 0, Math.PI*2);
  ctx.fillStyle = '#0d47a1'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FC', hx, cy + 1);

  const aw = W - 60;
  ctx.beginPath(); ctx.arc(aw, cy, lr, 0, Math.PI*2);
  ctx.fillStyle = '#b71c1c'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText('AI', aw, cy + 1);

  const sw = 116, sh = 56;
  const sxx = W/2 - sw/2, syy = cy - sh/2;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(sxx, syy, sw, sh, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
  roundRect(sxx, syy, sw, sh, 10); ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4caf50'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(String(homeScore), W/2 - 20, cy - 6);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('-', W/2, cy - 6);
  ctx.fillStyle = '#f44336'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(String(awayScore), W/2 + 20, cy - 6);

  const tc = gameState.timeLeft < 10 ? '#ff5252' : '#ffd54f';
  ctx.fillStyle = tc; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(formatTime(gameState.timeLeft), W/2, cy + 16);
}

function drawGoalOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, H/2 - 100, W, 200);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('GOAL!', W/2, H/2 - 35);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText(goalMsg.text, W/2, H/2 + 30);
}

function drawFullTime() {
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FULL TIME', W/2, H * 0.22);
  ctx.font = 'bold 66px sans-serif';
  ctx.fillStyle = '#4caf50';
  ctx.fillText(String(homeScore), W/2 - 65, H * 0.42);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif';
  ctx.fillText('-', W/2, H * 0.42);
  ctx.fillStyle = '#f44336'; ctx.font = 'bold 66px sans-serif';
  ctx.fillText(String(awayScore), W/2 + 65, H * 0.42);

  let rt, rc;
  if (homeScore > awayScore)      { rt = 'CHIEN THANG!'; rc = '#4caf50'; }
  else if (homeScore < awayScore) { rt = 'THAT BAI';     rc = '#f44336'; }
  else                            { rt = 'HOA';          rc = '#ffd54f'; }
  ctx.fillStyle = rc; ctx.font = 'bold 28px sans-serif';
  ctx.fillText(rt, W/2, H * 0.55);

  const rb = getRestartBtn();
  const g = ctx.createLinearGradient(rb.x, rb.y, rb.x, rb.y + rb.h);
  g.addColorStop(0, '#43a047'); g.addColorStop(1, '#1b5e20');
  roundRect(rb.x, rb.y, rb.w, rb.h, 14); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  roundRect(rb.x, rb.y, rb.w, rb.h, 14); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CHOI LAI', rb.x + rb.w/2, rb.y + rb.h/2);
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

init();
requestAnimationFrame(loop);
