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

// ---- SKINS ----
const SKINS = {
  retro: {
    colors: COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    colors: [
      null,
      '#00e5ff', '#fff176', '#e040fb', '#69f0ae',
      '#ff5252', '#448aff', '#ffab40', '#e0e0e0',
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.shadowBlur = 14;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      context.restore();
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
    },
  },
  pastel: {
    colors: [
      null,
      '#a8dadc', '#ffe8a3', '#d6c2e8', '#c3e8c3',
      '#f4b8b8', '#b8d4f4', '#f7d0a8', '#dcdce0',
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      const px = x * size + 2, py = y * size + 2, s = size - 4;
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      if (typeof context.roundRect === 'function') {
        context.beginPath();
        context.roundRect(px, py, s, s, 6);
        context.fill();
      } else {
        context.fillRect(px, py, s, s);
      }
      context.globalAlpha = 1;
    },
  },
  pixel: {
    colors: COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // textura de píxeles determinista según x,y,colorIndex (grilla 3x3 para mantener el coste bajo)
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      const cell = Math.max(4, Math.ceil(s / 3));
      for (let gy = 0; gy < s; gy += cell) {
        for (let gx = 0; gx < s; gx += cell) {
          const seed = ((x * 31 + gx) * 17 + (y * 31 + gy) * 13 + colorIndex * 7) % 5;
          if (seed < 3) {
            context.fillStyle = seed < 2 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
            context.fillRect(px + gx, py + gy, Math.min(cell, s - gx), Math.min(cell, s - gy));
          }
        }
      }
      context.globalAlpha = 1;
    },
  },
};

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
const comboEl = document.getElementById('hs-combo');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxCombo;

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
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    score += 50 * combo * level;
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
  if (!clearLines()) combo = 0;
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
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  getActiveSkin().drawBlock(context, x, y, colorIndex, size, alpha);
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
  handleGameOverHighscore();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
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

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!current) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

// ---- SKINS ----
const SKIN_KEY = 'tetris-skin';
const skinSelect = document.getElementById('skin-select');
let currentSkin = 'retro';

function getActiveSkin() {
  return SKINS[currentSkin] || SKINS.retro;
}

function applySkin(skin) {
  currentSkin = SKINS[skin] ? skin : 'retro';
  Object.keys(SKINS).forEach(name => document.body.classList.remove(`skin-${name}`));
  document.body.classList.add(`skin-${currentSkin}`);
  skinSelect.value = currentSkin;
  localStorage.setItem(SKIN_KEY, currentSkin);
  if (board) {
    draw();
    drawNext();
  }
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
});

// ---- RECORDS ----

const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;

const startOverlay = document.getElementById('start-overlay');
const startPlayBtn = document.getElementById('start-play-btn');
const hsResetBtn = document.getElementById('hs-reset-btn');
const hsStartTable = document.getElementById('hs-start-table');
const hsOverlayTable = document.getElementById('hs-overlay-table');
const hsBestCombo = document.getElementById('hs-best-combo');
const hsBestLines = document.getElementById('hs-best-lines');
const hsSaveRow = document.getElementById('hs-save-row');
const hsNameInput = document.getElementById('hs-name-input');
const hsSaveBtn = document.getElementById('hs-save-btn');

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e =>
      e && typeof e === 'object' &&
      typeof e.name === 'string' &&
      typeof e.score === 'number' &&
      typeof e.lines === 'number' &&
      typeof e.maxCombo === 'number' &&
      typeof e.date === 'string'
    ).slice(0, MAX_HIGHSCORES);
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list.slice(0, MAX_HIGHSCORES)));
  } catch {
    // ignore write errors (e.g. storage disabled)
  }
}

function qualifiesForHighscore(candidateScore) {
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  return candidateScore > list[list.length - 1].score;
}

function addHighscore(name, entryScore, entryLines, entryMaxCombo) {
  const list = loadHighscores();
  const entry = { name, score: entryScore, lines: entryLines, maxCombo: entryMaxCombo, date: new Date().toISOString() };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighscores(trimmed);
  return trimmed;
}

function sanitizeName(raw) {
  const trimmed = (raw || '').trim().slice(0, 12);
  return trimmed || 'ANON';
}

function renderHighscoreTable(container, list, highlightEntry) {
  container.textContent = '';
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'hs-empty';
    empty.textContent = 'Sin records todavía';
    container.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'hs-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Líneas</th><th>Combo</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  list.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (highlightEntry && entry === highlightEntry) tr.classList.add('hs-highlight');
    const cells = [String(i + 1), entry.name, entry.score.toLocaleString(), String(entry.lines), String(entry.maxCombo)];
    cells.forEach(text => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderStartScreen() {
  const list = loadHighscores();
  renderHighscoreTable(hsStartTable, list, null);
  const bestCombo = list.reduce((m, e) => Math.max(m, e.maxCombo), 0);
  const bestLines = list.reduce((m, e) => Math.max(m, e.lines), 0);
  hsBestCombo.textContent = bestCombo;
  hsBestLines.textContent = bestLines;
}

function handleGameOverHighscore() {
  const finalScore = score;
  const finalLines = lines;
  const finalMaxCombo = maxCombo;
  if (qualifiesForHighscore(finalScore)) {
    hsSaveRow.classList.remove('hidden');
    renderHighscoreTable(hsOverlayTable, loadHighscores(), null);
    hsNameInput.value = '';
    hsSaveBtn.onclick = () => {
      const name = sanitizeName(hsNameInput.value);
      const updated = addHighscore(name, finalScore, finalLines, finalMaxCombo);
      const savedEntry = updated.find(e => e.name === name && e.score === finalScore && e.lines === finalLines && e.maxCombo === finalMaxCombo);
      renderHighscoreTable(hsOverlayTable, updated, savedEntry);
      hsSaveRow.classList.add('hidden');
      hsSaveBtn.onclick = null;
    };
  } else {
    hsSaveRow.classList.add('hidden');
    renderHighscoreTable(hsOverlayTable, loadHighscores(), null);
  }
}

startPlayBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
});

hsResetBtn.addEventListener('click', () => {
  if (confirm('¿Seguro que deseas borrar todos los records?')) {
    saveHighscores([]);
    renderStartScreen();
  }
});

initTheme();
initSkin();
renderStartScreen();
