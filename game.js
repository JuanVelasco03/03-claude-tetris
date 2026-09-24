'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paletas por skin. Índices: 1=I 2=O 3=T 4=S 5=Z 6=J 7=L 8=Nut
const SKIN_COLORS = {
  retro: [
    null,
    '#4dd0e1', // I - cyan
    '#ffd54f', // O - yellow
    '#ba68c8', // T - purple
    '#81c784', // S - green
    '#e57373', // Z - red
    '#90caf9', // J - pale blue
    '#ffb74d', // L - orange
    '#b0bec5', // Nut - metallic gray
  ],
  neon: [
    null,
    '#00f0ff',
    '#ffe600',
    '#c44bff',
    '#00ff85',
    '#ff2d6f',
    '#3d7bff',
    '#ff9100',
    '#d7e9ff',
  ],
  pastel: [
    null,
    '#a8e6f0',
    '#ffe9a8',
    '#dcb8f2',
    '#b5e8c0',
    '#f7b8b8',
    '#b8cdf7',
    '#ffd2a8',
    '#dae0e6',
  ],
  pixel: [
    null,
    '#3cbcfc',
    '#f8d800',
    '#a81cd8',
    '#58d854',
    '#e40058',
    '#0058f8',
    '#f87800',
    '#a8a8a8',
  ],
};

const SKIN_ORDER = ['retro', 'neon', 'pastel', 'pixel'];

// Paleta activa; la reemplaza applySkin()
let COLORS = SKIN_COLORS.retro;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut - hueco central
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleInput = document.getElementById('theme-toggle-input');
const pauseOverlay = document.getElementById('pause-overlay');
const pauseMainView = document.getElementById('pause-main');
const pauseControlsView = document.getElementById('pause-controls');
const startLevelValue = document.getElementById('start-level-value');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

const THEME_KEY = 'tetris-theme';
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;

let startLevel = 1;      // nivel con el que arranca la próxima partida
let menuView = 'main';   // 'main' | 'controls'
let menuIndex = 0;       // opción resaltada dentro de la vista actual

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggleInput.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
  if (board) {
    draw();
    drawNext();
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleInput.addEventListener('change', () => {
  applyTheme(themeToggleInput.checked ? 'light' : 'dark');
});

function speedForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

/* ---- Skins ---- */

const SKIN_KEY = 'tetris-skin';

let skin = 'retro';

function applySkin(name) {
  skin = SKIN_ORDER.includes(name) ? name : 'retro';
  COLORS = SKIN_COLORS[skin];
  for (const s of SKIN_ORDER) document.body.classList.toggle('skin-' + s, s === skin);
  skinSelect.value = skin;
  localStorage.setItem(SKIN_KEY, skin);
  if (board) {
    draw();
    drawNext();
  }
}

function initSkin() {
  applySkin(localStorage.getItem(SKIN_KEY));
}

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedForLevel(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

/* ---- Dibujo de bloques por skin ---- */

// Aclara (pct > 0) u oscurece (pct < 0) un color hex.
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v =>
    Math.max(0, Math.min(255, Math.round(pct < 0 ? v * (1 + pct) : v + (255 - v) * pct)))
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function roundRectPath(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Bloques cuadrados planos con brillo superior.
function drawRetro(context, px, py, color, size) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

// Relleno oscuro, contorno brillante y glow con shadowBlur.
function drawNeon(context, px, py, color, size) {
  const inset = 2;
  context.save();
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = shade(color, -0.72);
  context.fillRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.strokeRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
  context.shadowBlur = size * 0.2;
  context.strokeRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
  context.restore();
}

// Colores suaves con esquinas redondeadas y degradado tenue.
function drawPastel(context, px, py, color, size) {
  const inset = 2;
  const w = size - inset * 2;
  const grad = context.createLinearGradient(px, py, px, py + size);
  grad.addColorStop(0, shade(color, 0.22));
  grad.addColorStop(1, shade(color, -0.12));
  roundRectPath(context, px + inset, py + inset, w, w, size * 0.28);
  context.fillStyle = grad;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = shade(color, -0.22);
  context.stroke();
  roundRectPath(context, px + inset + 3, py + inset + 3, w - 6, w * 0.32, size * 0.16);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
}

// Bisel de 8 bits + dithering: motas claras/oscuras en posiciones fijas.
const PIXEL_LIGHT_DOTS = [[2, 2], [5, 3], [3, 6], [7, 6]];
const PIXEL_DARK_DOTS = [[6, 2], [2, 5], [7, 4], [5, 7]];

function drawPixel(context, px, py, color, size) {
  const u = size / 10;
  const bevel = Math.max(2, Math.round(size / 10));
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // bisel claro arriba/izquierda
  context.fillStyle = shade(color, 0.42);
  context.fillRect(px, py, size, bevel);
  context.fillRect(px, py, bevel, size);
  // bisel oscuro abajo/derecha
  context.fillStyle = shade(color, -0.45);
  context.fillRect(px, py + size - bevel, size, bevel);
  context.fillRect(px + size - bevel, py, bevel, size);
  // textura
  context.fillStyle = shade(color, 0.3);
  for (const [dx, dy] of PIXEL_LIGHT_DOTS) context.fillRect(px + dx * u, py + dy * u, u, u);
  context.fillStyle = shade(color, -0.3);
  for (const [dx, dy] of PIXEL_DARK_DOTS) context.fillRect(px + dx * u, py + dy * u, u, u);
}

const SKIN_DRAW = { retro: drawRetro, neon: drawNeon, pastel: drawPastel, pixel: drawPixel };

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  SKIN_DRAW[skin](context, x * size, y * size, COLORS[colorIndex], size);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

/* ---------- Menú de pausa ---------- */

function loadStartLevel() {
  const saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  setStartLevel(Number.isFinite(saved) ? saved : 1);
}

function setStartLevel(value) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, value));
  localStorage.setItem(START_LEVEL_KEY, String(startLevel));
  startLevelValue.textContent = startLevel;
  pauseMainView.querySelectorAll('.step').forEach(btn => {
    const step = Number(btn.dataset.step);
    btn.disabled = startLevel + step < 1 || startLevel + step > MAX_START_LEVEL;
  });
}

function menuItems() {
  const view = menuView === 'controls' ? pauseControlsView : pauseMainView;
  return [...view.querySelectorAll('.menu-item')];
}

function selectMenuItem(index) {
  const items = menuItems();
  if (!items.length) return;
  menuIndex = (index + items.length) % items.length;
  pauseOverlay.querySelectorAll('.menu-item.selected').forEach(el => el.classList.remove('selected'));
  items[menuIndex].classList.add('selected');
  items[menuIndex].focus({ preventScroll: true });
}

function showMenuView(view) {
  menuView = view;
  pauseMainView.classList.toggle('hidden', view !== 'main');
  pauseControlsView.classList.toggle('hidden', view !== 'controls');
  selectMenuItem(0);
}

function openPauseMenu() {
  pauseOverlay.classList.remove('hidden');
  showMenuView('main');
}

function closePauseMenu() {
  pauseOverlay.classList.add('hidden');
  const active = document.activeElement;
  if (active && pauseOverlay.contains(active)) active.blur();
}

function pauseGame() {
  if (paused || gameOver) return;
  paused = true;
  cancelAnimationFrame(animId);
  openPauseMenu();
}

function resumeGame() {
  if (!paused || gameOver) return;
  paused = false;
  closePauseMenu();
  lastTime = performance.now();
  dropAccum = 0;
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (gameOver) return;
  if (paused) resumeGame();
  else pauseGame();
}

function runMenuAction(action) {
  switch (action) {
    case 'resume':   resumeGame(); break;
    case 'restart':  closePauseMenu(); init(); break;
    case 'controls': showMenuView('controls'); break;
    case 'back':     showMenuView('main'); break;
  }
}

// Mientras el menú está abierto, ningún input llega al juego: este handler
// consume la tecla y solo navega el menú.
function handleMenuKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // no pisar atajos del navegador
  switch (e.code) {
    case 'KeyP':
    case 'Escape':
      e.preventDefault();
      if (menuView === 'controls') showMenuView('main');
      else resumeGame();
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectMenuItem(menuIndex - 1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      selectMenuItem(menuIndex + 1);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (menuItems()[menuIndex]?.dataset.action === 'level') setStartLevel(startLevel - 1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (menuItems()[menuIndex]?.dataset.action === 'level') setStartLevel(startLevel + 1);
      break;
    case 'Enter':
      e.preventDefault();
      runMenuAction(menuItems()[menuIndex]?.dataset.action);
      break;
    case 'Space':
    case 'KeyX':
      // Teclas de juego: se descartan para que no activen opciones del menú
      // ni muevan la pieza al volver.
      e.preventDefault();
      break;
  }
}

pauseOverlay.addEventListener('click', e => {
  const step = e.target.closest('.step');
  if (step) {
    setStartLevel(startLevel + Number(step.dataset.step));
    return;
  }
  const item = e.target.closest('.menu-item');
  if (!item) return;
  selectMenuItem(menuItems().indexOf(item));
  runMenuAction(item.dataset.action);
});

pauseOverlay.addEventListener('mousemove', e => {
  const item = e.target.closest('.menu-item');
  if (item) selectMenuItem(menuItems().indexOf(item));
});

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (paused && !gameOver) { handleMenuKey(e); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
loadStartLevel();
initSkin();
init();
