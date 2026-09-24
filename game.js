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
const menuBtn = document.getElementById('menu-btn');
const themeToggleInput = document.getElementById('theme-toggle-input');
const comboEl = document.getElementById('combo');
const startOverlay = document.getElementById('start-overlay');
const startRecordsEl = document.getElementById('start-records');
const overlayRecordsEl = document.getElementById('overlay-records');
const nameForm = document.getElementById('name-form');
const playerNameInput = document.getElementById('player-name');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, started;

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

/* ---------- Tabla de records (localStorage) ---------- */

const RECORDS_KEY = 'tetris-records';
const LAST_NAME_KEY = 'tetris-last-name';
const MAX_RECORDS = 5;

function emptyRecords() {
  return { entries: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!raw || !Array.isArray(raw.entries)) return emptyRecords();
    return {
      entries: raw.entries
        .map(e => ({
          name: String(e.name || '?').slice(0, 10),
          score: Number(e.score) || 0,
          lines: Number(e.lines) || 0,
          level: Number(e.level) || 1,
          combo: Number(e.combo) || 0,
          date: String(e.date || ''),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS),
      bestCombo: Number(raw.bestCombo) || 0,
      maxLines: Number(raw.maxLines) || 0,
    };
  } catch (err) {
    return emptyRecords();
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// Solo entra en el top si supera estrictamente al ultimo: los empates no desplazan.
function qualifies(records, value) {
  return value > 0 &&
    (records.entries.length < MAX_RECORDS ||
     value > records.entries[records.entries.length - 1].score);
}

// Devuelve la lista con la entrada insertada y la posicion que ocupa (-1 si se cae del top).
function insertEntry(entries, entry) {
  const list = [...entries, entry].sort((a, b) => b.score - a.score);
  const index = list.indexOf(entry);
  return { entries: list.slice(0, MAX_RECORDS), index: index < MAX_RECORDS ? index : -1 };
}

function currentEntry(name) {
  return {
    name,
    score,
    lines,
    level,
    combo: maxCombo,
    date: new Date().toISOString().slice(0, 10),
  };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRecords(container, records, highlight) {
  const rows = records.entries.map((e, i) => `
      <tr class="record-row${i === highlight ? ' highlight' : ''}">
        <td class="record-pos">${i + 1}</td>
        <td class="record-name">${escapeHtml(e.name)}</td>
        <td class="record-score">${e.score.toLocaleString()}</td>
        <td class="record-lines">${e.lines} L</td>
      </tr>`).join('');

  container.innerHTML = `
    <span class="label">TOP 5</span>
    ${records.entries.length
      ? `<table class="records-table">${rows}</table>`
      : '<p class="records-empty">Sin records todavia</p>'}
    <div class="records-stats">
      <span>MEJOR COMBO <b>x${records.bestCombo}</b></span>
      <span>MAX. LINEAS <b>${records.maxLines}</b></span>
    </div>`;
  container.classList.remove('hidden');
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
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
  if (clearLines() > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
  updateHUD();
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
  comboEl.textContent = `x${combo}`;
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
  started = false;
  cancelAnimationFrame(animId);

  const records = loadRecords();
  if (maxCombo > records.bestCombo) records.bestCombo = maxCombo;
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords(records);

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent =
    `${score.toLocaleString()} pts · ${lines} líneas · combo máx. x${maxCombo}`;

  if (qualifies(records, score)) {
    // Vista previa: la puntuacion actual se resalta en la posicion que ocupara.
    const pending = currentEntry('– – –');
    const preview = insertEntry(records.entries, pending);
    renderRecords(overlayRecordsEl, { ...records, entries: preview.entries }, preview.index);
    nameForm.classList.remove('hidden');
    playerNameInput.value = localStorage.getItem(LAST_NAME_KEY) || '';
  } else {
    renderRecords(overlayRecordsEl, records, -1);
    nameForm.classList.add('hidden');
  }

  menuBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (!nameForm.classList.contains('hidden')) playerNameInput.focus();
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameForm.classList.add('hidden');
    overlayRecordsEl.classList.add('hidden');
    menuBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
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

function resetGame() {
  cancelAnimationFrame(animId);
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  started = false;
  dropInterval = 1000;
  dropAccum = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  nameForm.classList.add('hidden');
  overlayRecordsEl.classList.add('hidden');
  menuBtn.classList.add('hidden');
  overlay.classList.add('hidden');
  draw();
}

function init() {
  resetGame();
  startOverlay.classList.add('hidden');
  started = true;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  resetGame();
  renderRecords(startRecordsEl, loadRecords(), -1);
  startOverlay.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
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

restartBtn.addEventListener('click', init);
menuBtn.addEventListener('click', showStartScreen);
playBtn.addEventListener('click', init);

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = (playerNameInput.value.trim() || 'ANÓNIMO').slice(0, 10);
  localStorage.setItem(LAST_NAME_KEY, name);

  const records = loadRecords();
  const result = insertEntry(records.entries, currentEntry(name));
  records.entries = result.entries;
  saveRecords(records);

  nameForm.classList.add('hidden');
  renderRecords(overlayRecordsEl, records, result.index);
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords guardados?')) return;
  localStorage.removeItem(RECORDS_KEY);
  renderRecords(startRecordsEl, emptyRecords(), -1);
});

initTheme();
showStartScreen();
