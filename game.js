const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const SCOREBOARD_H = 72;
const MATCH_DURATION = 90;
const JOY_DEADZONE = 12;
const PLAYER_SPEED = 3.5;
const ENEMY_SPEED = 1.9;
const SPRINT_MULT = 1.7;
const WORLD_SCALE_Y = 1.8;

let W = 0, H = 0;
let WORLD_W = 0, WORLD_H = 0;
let homeScore = 0, awayScore = 0;
let goalMsg = null, goalCooldown = 0;
let sprinting = false;
let gameState = { timeLeft: MATCH_DURATION, isFullTime: false };

const camera = { y: 0 };
const player = { x:0, y:0, r:20, color:'#2196f3' };
const enemy  = { x:0, y:0, r:20, color:'#f44336' };
const ball   = { x:0, y:0, r:9, vx:0, vy:0 };

const joy       = { active:false, id:null, baseX:0, baseY:0, x:0, y:0, R:80 };
const btnShoot  = { x:0, y:0, r:42, pressed:false, id:null };
const btnPass   = { x:0, y:0, r:30, pressed:false, id:null };
const btnSprint = { x:0, y:0, r:30, pressed:false, id:null };

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
  const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
  o2.connect(g2); g2.connect(audioCtx.destination);
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(900, t);
  o2.frequency.exponentialRampToValueAtTime(400, t + 0.05);
  g2.gain.setValueAtTime(0.22, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o2.start(t); o2.stop(t + 0.1);
  const n = audioCtx.sampleRate * 0.05;
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,4);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const g3 = audioCtx.createGain(); g3.gain.value = 0.15;
  src.connect(g3); g3.connect(audioCtx.destination);
  src.start(t);
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

function playGoal() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const n = audioCtx.sampleRate * 0.25;
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const gN = audioCtx.createGain(); gN.gain.value = 0.3;
  src.connect(gN); gN.connect(audioCtx.destination);
  src.start(t);
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
  btnShoot.x  = W - 70;  btnShoot.y  = H - 90;
  btnPass.x   = W - 155; btnPass.y   = H - 70;
  btnSprint.x = W - 70;  btnSprint.y = H - 180;
}
window.addEventListener('resize', resize);

function hitsBtn(x, y, b) { return Math.hypot(x - b.x, y - b.y) < b.r + 14; }
function getRestartBtn() { return { x: W/2 - 100, y: H*0.68, w: 200, h: 60 }; }

function onTouchStart(ev) {
  ensureAudio();
  for (const t of ev.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (gameState.isFullTime) {
      const rb = getRestartBtn();
      if (x > rb.x && x < rb.x + rb.w && y > rb.y && y < rb.y + rb.h) restartGame();
      continue;
    }
    if (y < SCOREBOARD_H) continue;
    if (hitsBtn(x, y, btnShoot)) {
      btnShoot.pressed = true; btnShoot.id = t.identifier; shoot();
    } else if (hitsBtn(x, y, btnPass)) {
      btnPass.pressed = true; btnPass.id = t.identifier; doPass();
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

function init() { resize(); restartGame(); }

function resetPositions() {
  player.x = WORLD_W/2;  player.y = WORLD_H * 0.60;
  enemy.x  = WORLD_W/2;  enemy.y  = WORLD_H * 0.35;
  ball.x   = WORLD_W/2;  ball.y   = WORLD_H * 0.50;
  ball.vx = 0; ball.vy = 0;
  camera.y = Math.max(0, Math.min(WORLD_H - H, ball.y - H/2));
}

function restartGame() {
  homeScore = 0; awayScore = 0;
  gameState.timeLeft = MATCH_DURATION;
  gameState.isFullTime = false;
  goalMsg = null; goalCooldown = 0;
  resetPositions();
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

function update(dt) {
  if (!gameState.isFullTime && !goalMsg) {
    gameState.timeLeft -= dt;
    if (gameState.timeLeft <= 0) {
      gameState.timeLeft = 0;
      gameState.isFullTime = true;
      playWhistle();
      vibrate([200]);
    }
  }
  if (gameState.isFullTime) return;
  if (goalMsg) {
    goalMsg.timer--;
    if (goalMsg.timer <= 0) { goalMsg = null; resetPositions(); }
    return;
  }
  if (goalCooldown > 0) goalCooldown--;

  if (joy.active) {
    const dx = joy.x - joy.baseX;
    const dy = joy.y - joy.baseY;
    const d = Math.hypot(dx, dy);
    if (d > JOY_DEADZONE) {
      const intensity = Math.min(1, (d - JOY_DEADZONE) / (joy.R - JOY_DEADZONE));
      const spd = PLAYER_SPEED * (btnSprint.pressed ? SPRINT_MULT : 1);
      player.x += (dx/d) * spd * intensity;
      player.y += (dy/d) * spd * intensity;
    }
  }
  sprinting = btnSprint.pressed && joy.active;
  player.x = Math.max(player.r, Math.min(WORLD_W - player.r, player.x));
  player.y = Math.max(fieldTop + player.r, Math.min(WORLD_H - player.r, player.y));

  const ax = ball.x - enemy.x, ay = ball.y - enemy.y;
  const ad = Math.hypot(ax, ay);
  if (ad > 1) {
    let mx = ax/ad, my = ay/ad;
    const margin = 40;
    if (enemy.x < margin) mx += 1.2;
    if (enemy.x > WORLD_W - margin) mx -= 1.2;
    if (enemy.y < fieldTop + margin) my += 1.2;
    if (enemy.y > WORLD_H - margin) my -= 1.2;
    const ml = Math.hypot(mx, my) || 1;
    enemy.x += (mx/ml) * ENEMY_SPEED;
    enemy.y += (my/ml) * ENEMY_SPEED;
  }
  enemy.x = Math.max(enemy.r, Math.min(WORLD_W - enemy.r, enemy.x));
  enemy.y = Math.max(fieldTop + enemy.r, Math.min(WORLD_H - enemy.r, enemy.y));

  const d1 = Math.hypot(ball.x - player.x, ball.y - player.y);
  if (d1 < player.r + ball.r && d1 > 0.01) {
    const ang = Math.atan2(ball.y - player.y, ball.x - player.x);
    ball.vx = Math.cos(ang) * 7;
    ball.vy = Math.sin(ang) * 7;
  }
  const d2 = Math.hypot(ball.x - enemy.x, ball.y - enemy.y);
  if (d2 < enemy.r + ball.r && d2 > 0.01) {
    const ang = Math.atan2(ball.y - enemy.y, ball.x - enemy.x);
    ball.vx = Math.cos(ang) * 5;
    ball.vy = Math.sin(ang) * 5;
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
  if (gameState.isFullTime) drawFullTime();
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
  ctx.beginPath(); ctx.moveTo(goalLeft, fieldTop + 16); ctx.lineTo(goalRight, fieldTop + 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(goalLeft, fieldBot - 16); ctx.lineTo(goalRight, fieldBot - 16); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(goalLeft, fieldTop, goalWidth, 5);
  ctx.fillRect(goalLeft, fieldBot - 5, goalWidth, 5);

  if (sprinting) {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 7, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,235,59,0.75)';
    ctx.lineWidth = 3; ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(player.x, player.y + 4, player.r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = player.color;
  ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('10', player.x, player.y + 1);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(enemy.x, enemy.y + 4, enemy.r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = enemy.color;
  ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('9', enemy.x, enemy.y + 1);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(ball.x, ball.y + 3, ball.r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 0.35, 0, Math.PI*2); ctx.fill();
}

function drawMinimap() {
  const mmW = 58;
  const mmH = 96;
  const mmX = W - mmW - 10;
  const mmY = SCOREBOARD_H + 10;
  const scaleX = mmW / WORLD_W;
  const scaleY = mmH / WORLD_H;

  ctx.fillStyle = 'rgba(10,20,10,0.75)';
  roundRect(mmX, mmY, mmW, mmH, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  roundRect(mmX, mmY, mmW, mmH, 4); ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(mmX, mmY + mmH/2);
  ctx.lineTo(mmX + mmW, mmY + mmH/2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(76,175,80,0.65)';
  ctx.fillRect(mmX + goalLeft*scaleX, mmY, goalWidth*scaleX, 2.5);
  ctx.fillStyle = 'rgba(244,67,54,0.65)';
  ctx.fillRect(mmX + goalLeft*scaleX, mmY + mmH - 2.5, goalWidth*scaleX, 2.5);

  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mmX + ball.x*scaleX, mmY + ball.y*scaleY, 2.2, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = '#2196f3';
  ctx.beginPath(); ctx.arc(mmX + player.x*scaleX, mmY + player.y*scaleY, 3, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = '#f44336';
  ctx.beginPath(); ctx.arc(mmX + enemy.x*scaleX, mmY + enemy.y*scaleY, 3, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX, mmY + camera.y * scaleY, mmW, H * scaleY);
}

function drawRoundBtn(b, label, c1, c2, fs) {
  ctx.beginPath(); ctx.arc(b.x, b.y + 3, b.r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  const g = ctx.createRadialGradient(b.x, b.y - b.r*0.3, 3, b.x, b.y, b.r);
  if (b.pressed) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, c1); g.addColorStop(1, c2); }
  else           { g.addColorStop(0, c1); g.addColorStop(1, c2); }
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff';
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
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(90, H - 100, 60, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DI CHUYEN', 90, H - 100);
  }
}

function drawButtonsUI() {
  drawRoundBtn(btnShoot,  'SUT',    '#e53935', '#b71c1c', 20);
  drawRoundBtn(btnPass,   'CHUYEN', '#1e88e5', '#0d47a1', 11);
  drawRoundBtn(btnSprint, 'CHAY',   '#43a047', '#1b5e20', 11);
}

function drawScoreboard() {
  ctx.fillStyle = 'rgba(10,10,20,0.92)';
  ctx.fillRect(0, 0, W, SCOREBOARD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, SCOREBOARD_H - 1, W, 1);

  const cy = SCOREBOARD_H / 2;
  const lr = 19;

  const hx = 60;
  ctx.beginPath(); ctx.arc(hx, cy, lr + 2, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
  const g1 = ctx.createRadialGradient(hx-5, cy-5, 3, hx, cy, lr);
  g1.addColorStop(0, '#64b5f6'); g1.addColorStop(1, '#0d47a1');
  ctx.beginPath(); ctx.arc(hx, cy, lr, 0, Math.PI*2);
  ctx.fillStyle = g1; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FC', hx, cy + 1);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('DOI BAN', hx + 26, cy - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px sans-serif';
  ctx.fillText('HOME', hx + 26, cy + 8);

  const aw = W - 60;
  ctx.beginPath(); ctx.arc(aw, cy, lr + 2, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
    const g2 = ctx.createRadialGradient(aw-5, cy-5, 3, aw, cy, lr);
  g2.addColorStop(0, '#ef5350'); g2.addColorStop(1, '#b71c1c');
  ctx.beginPath(); ctx.arc(aw, cy, lr, 0, Math.PI*2);
  ctx.fillStyle = g2; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('AI', aw, cy + 1);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('DOI AI', aw - 26, cy - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px sans-serif';
  ctx.fillText('AWAY', aw - 26, cy + 8);

  const sw = 116, sh = 56;
  const sx = W/2 - sw/2, sy = cy - sh/2;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(sx, sy, sw, sh, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
  roundRect(sx, sy, sw, sh, 10); ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4caf50'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(String(homeScore), W/2 - 20, cy - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('-', W/2, cy - 6);
  ctx.fillStyle = '#f44336'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(String(awayScore), W/2 + 20, cy - 6);

  const tc = gameState.timeLeft < 10 ? '#ff5252' : '#ffd54f';
  ctx.fillStyle = tc; ctx.font = 'bold 12px sans-serif';
  ctx.fillText(formatTime(gameState.timeLeft), W/2, cy + 16);
}

function drawGoalOverlay() {
  const total = 110, t = goalMsg.timer;
  let a = 1;
  if (t > total - 12) a = (total - t) / 12;
  else if (t < 22) a = t / 22;

  ctx.fillStyle = 'rgba(0,0,0,' + (0.78*a) + ')';
  ctx.fillRect(0, H/2 - 100, W, 200);
  ctx.strokeStyle = 'rgba(255,215,0,' + a + ')'; ctx.lineWidth = 4;
  ctx.strokeRect(0, H/2 - 100, W, 200);
  ctx.fillStyle = 'rgba(255,215,0,' + a + ')';
  ctx.font = 'bold 52px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('GOAL!', W/2, H/2 - 35);
  ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(goalMsg.text, W/2, H/2 + 30);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'rgba(76,175,80,' + a + ')';
  ctx.fillText(String(homeScore), W/2 - 40, H/2 + 75);
  ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('-', W/2, H/2 + 75);
  ctx.fillStyle = 'rgba(244,67,54,' + a + ')'; ctx.font = 'bold 28px sans-serif';
  ctx.fillText(String(awayScore), W/2 + 40, H/2 + 75);
}

function drawFullTime() {
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FULL TIME', W/2, H * 0.22);
  ctx.font = 'bold 66px sans-serif';
  ctx.fillStyle = '#4caf50'; ctx.fillText(String(homeScore), W/2 - 65, H * 0.42);
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
