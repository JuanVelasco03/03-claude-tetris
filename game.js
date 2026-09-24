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
const comboEl = document.getElementById('combo');
const startOverlay = document.getElementById('start-overlay');
const startRecordsEl = document.getElementById('start-records');
const overlayRecordsEl = document.getElementById('overlay-records');
const playBtn = document.getElementById('play-btn');
const recordMsg = document.getElementById('record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const pauseOverlay = document.getElementById('pause-overlay');
const menuMain = document.getElementById('menu-main');
const menuControls = document.getElementById('menu-controls');
const resumeBtn = document.getElementById('resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, combo, maxCombo, paused, gameOver, started,
    lastTime, dropAccum, dropInterval, animId;

// Nivel con el que arranca la proxima partida (persistido entre recargas).
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;
let startLevel = 1;
let menuIndex = 0;

const THEME_KEY = 'tetris-theme';

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

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const NAME_KEY = 'tetris-last-name';
const MAX_RECORDS = 5;

// { scores: [{ id, name, score, lines, level, combo }], bestCombo, bestLines }
let records = { scores: [], bestCombo: 0, bestLines: 0 };
let pendingScore = null; // puntuacion sin guardar, resaltada en la tabla

function loadRecords() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
  } catch (e) {
    raw = null;
  }
  const scores = (raw && Array.isArray(raw.scores) ? raw.scores : [])
    .filter(e => e && Number.isFinite(Number(e.score)))
    .map(e => ({
      id: String(e.id ?? Math.random()),
      name: String(e.name ?? '').slice(0, 12) || 'ANON',
      score: Number(e.score),
      lines: Number(e.lines) || 0,
      level: Number(e.level) || 1,
      combo: Number(e.combo) || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  records = {
    scores,
    bestCombo: Number(raw && raw.bestCombo) || 0,
    bestLines: Number(raw && raw.bestLines) || 0,
  };
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

function isTopScore(value) {
  if (value <= 0) return false;
  if (records.scores.length < MAX_RECORDS) return true;
  return value > records.scores[records.scores.length - 1].score;
}

function addRecord(name, entry) {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  records.scores.push({ id, name, ...entry });
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords();
  return id;
}

function updateBests() {
  if (maxCombo > records.bestCombo) records.bestCombo = maxCombo;
  if (lines > records.bestLines) records.bestLines = lines;
  saveRecords();
}

function resetRecords() {
  if (!window.confirm('¿Borrar todos los records?')) return;
  records = { scores: [], bestCombo: 0, bestLines: 0 };
  saveRecords();
  renderRecords();
}

function recordRow(rank, name, value, highlight) {
  const li = document.createElement('li');
  li.className = highlight ? 'record-row is-new' : 'record-row';

  const rankEl = document.createElement('span');
  rankEl.className = 'rank';
  rankEl.textContent = `${rank}.`;

  const nameEl = document.createElement('span');
  nameEl.className = 'rname';
  nameEl.textContent = name;

  const scoreEl2 = document.createElement('span');
  scoreEl2.className = 'rscore';
  scoreEl2.textContent = value.toLocaleString();

  li.append(rankEl, nameEl, scoreEl2);
  return li;
}

function bestBox(label, value) {
  const box = document.createElement('div');
  box.className = 'record-best';
  const l = document.createElement('span');
  l.className = 'label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'best-value';
  v.textContent = value;
  box.append(l, v);
  return box;
}

// Pinta la tabla en un contenedor. `highlightId` resalta una entrada guardada;
// `preview` inserta la puntuacion actual todavia sin nombre.
function renderRecordsInto(container, options = {}) {
  const { highlightId = null, preview = null } = options;
  container.textContent = '';

  const title = document.createElement('span');
  title.className = 'label';
  title.textContent = `TOP ${MAX_RECORDS}`;
  container.append(title);

  const rows = records.scores.map(e => ({ ...e, highlight: e.id === highlightId }));
  if (preview !== null) {
    rows.push({ id: null, name: 'TÚ', score: preview, highlight: true });
    rows.sort((a, b) => b.score - a.score);
  }
  rows.length = Math.min(rows.length, MAX_RECORDS);

  if (rows.length) {
    const list = document.createElement('ol');
    list.className = 'record-list';
    rows.forEach((e, i) => list.append(recordRow(i + 1, e.name, e.score, e.highlight)));
    container.append(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Sin records todavía';
    container.append(empty);
  }

  const bests = document.createElement('div');
  bests.className = 'record-bests';
  bests.append(
    bestBox('MEJOR COMBO', records.bestCombo ? `x${records.bestCombo}` : '—'),
    bestBox('MÁX. LÍNEAS', records.bestLines || '—')
  );
  container.append(bests);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset-btn';
  reset.textContent = 'Resetear records';
  reset.addEventListener('click', resetRecords);
  container.append(reset);
}

// Repinta la tabla de inicio y, si esta visible, la del game over.
function renderRecords(highlightId = null) {
  renderRecordsInto(startRecordsEl);
  if (!overlayRecordsEl.classList.contains('hidden')) {
    renderRecordsInto(overlayRecordsEl, { highlightId, preview: pendingScore });
  }
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
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = levelInterval(level);
  } else {
    combo = 0;
  }
  updateHUD();
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
  comboEl.textContent = combo > 0 ? `x${combo}` : '0';
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

function levelInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function initStartLevel() {
  for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
    const opt = document.createElement('option');
    opt.value = String(lvl);
    opt.textContent = `Nivel ${lvl}`;
    startLevelSelect.appendChild(opt);
  }
  const saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  setStartLevel(Number.isInteger(saved) ? saved : 1);
}

function setStartLevel(value) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, value));
  startLevelSelect.value = String(startLevel);
  localStorage.setItem(START_LEVEL_KEY, String(startLevel));
}

function menuOpen() {
  return !pauseOverlay.classList.contains('hidden');
}

function controlsVisible() {
  return !menuControls.classList.contains('hidden');
}

// Elementos navegables de la vista activa, en orden.
function menuItems() {
  return controlsVisible()
    ? [controlsBackBtn]
    : [resumeBtn, menuRestartBtn, showControlsBtn, startLevelSelect];
}

function focusMenuItem(index) {
  const items = menuItems();
  menuIndex = (index + items.length) % items.length;
  items[menuIndex].focus();
}

function activateMenuItem() {
  const el = menuItems()[menuIndex];
  // El selector de nivel se cambia con las flechas, no se "activa".
  if (el && el.tagName === 'BUTTON') el.click();
}

function showMenuView(view) {
  menuMain.classList.toggle('hidden', view !== 'main');
  menuControls.classList.toggle('hidden', view !== 'controls');
  focusMenuItem(0);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateBests();

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent =
    `Puntuación: ${score.toLocaleString()}  ·  Líneas: ${lines}  ·  Combo: x${maxCombo}`;

  const qualifies = isTopScore(score);
  pendingScore = qualifies ? score : null;
  recordMsg.classList.toggle('hidden', !qualifies);
  nameForm.classList.toggle('hidden', !qualifies);
  overlayRecordsEl.classList.remove('hidden');
  renderRecords();

  overlay.classList.remove('hidden');
  if (qualifies) {
    nameInput.value = localStorage.getItem(NAME_KEY) || '';
    nameInput.focus();
    nameInput.select();
  }
}

function saveCurrentScore() {
  if (pendingScore === null) return;
  const name = (nameInput.value.trim() || 'ANON').slice(0, 12);
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    /* almacenamiento no disponible */
  }
  const id = addRecord(name, { score, lines, level, combo: maxCombo });
  pendingScore = null;
  nameForm.classList.add('hidden');
  recordMsg.classList.add('hidden');
  renderRecords(id);
}

function pauseGame() {
  if (gameOver || paused || !started) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseOverlay.classList.remove('hidden');
  showMenuView('main');
}

function resumeGame() {
  if (gameOver || !paused || !started) return;
  paused = false;
  pauseOverlay.classList.add('hidden');
  // Suelta el foco del menu para que Space/Enter no reactiven un boton.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  dropAccum = 0;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function restartGame() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  init();
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}

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

function resetState() {
  cancelAnimationFrame(animId);
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = levelInterval(level);
  dropAccum = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  draw();
}

function init() {
  started = false;
  pendingScore = null;
  resetState();
  recordMsg.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  startOverlay.classList.add('hidden');
  started = true;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  started = false;
  pendingScore = null;
  resetState();
  pauseOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  renderRecords();
  startOverlay.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  // Con el menu abierto solo P/Esc responden; el resto se descarta para que
  // ninguna tecla mueva la pieza al reanudar.
  if (menuOpen()) {
    // Tab sigue navegando de forma nativa; el resto lo gestiona el menu.
    if (e.code === 'Tab') return;
    e.preventDefault();
    switch (e.code) {
      case 'KeyP':
        resumeGame();
        break;
      case 'Escape':
        if (controlsVisible()) showMenuView('main');
        else resumeGame();
        break;
      case 'ArrowUp':
        focusMenuItem(menuIndex - 1);
        break;
      case 'ArrowDown':
        focusMenuItem(menuIndex + 1);
        break;
      case 'ArrowLeft':
        if (menuItems()[menuIndex] === startLevelSelect) setStartLevel(startLevel - 1);
        break;
      case 'ArrowRight':
        if (menuItems()[menuIndex] === startLevelSelect) setStartLevel(startLevel + 1);
        break;
      case 'Enter':
      case 'NumpadEnter':
        activateMenuItem();
        break;
      // Space y cualquier otra tecla se ignoran a proposito: evita que el
      // hard drop anterior active un boton al pausar.
    }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); pauseGame(); return; }
  if (paused || gameOver || !started) return;
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

restartBtn.addEventListener('click', restartGame);
playBtn.addEventListener('click', restartGame);
resumeBtn.addEventListener('click', resumeGame);
menuRestartBtn.addEventListener('click', restartGame);
showControlsBtn.addEventListener('click', () => showMenuView('controls'));
controlsBackBtn.addEventListener('click', () => showMenuView('main'));

startLevelSelect.addEventListener('change', () => {
  setStartLevel(parseInt(startLevelSelect.value, 10));
});

// Click con el raton: sincroniza el indice del teclado con lo que se toco.
pauseOverlay.addEventListener('mousedown', e => {
  const items = menuItems();
  const i = items.findIndex(el => el.contains(e.target));
  if (i !== -1) menuIndex = i;
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveCurrentScore();
});

initTheme();
initStartLevel();
loadRecords();
showStartScreen();
