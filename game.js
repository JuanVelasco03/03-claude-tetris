'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - metallic gray
];

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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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
init();
