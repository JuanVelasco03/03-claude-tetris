# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris implementation using HTML5 Canvas. No build process, no package manager, no dependencies — three files: `index.html`, `style.css`, `game.js`.

## Running

Open `index.html` directly in a browser, or serve statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no build, lint, or test step/tooling in this repo.

## Architecture

Everything lives in `game.js` as module-level globals (`board`, `current`, `next`, `score`, `lines`, `level`, etc.) mutated in place — there is no framework or state container.

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece type locked there.
- **Pieces**: `PIECES` holds each tetromino as a square matrix of color indices. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): checks board bounds and existing locked cells; called before every move/rotate/drop.
- **Wall kicks** (`tryRotate`): on rotation collision, retries the rotated shape at x-offsets `[0, -1, 1, -2, 2]` before giving up.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates `dt` and drops the piece one row when `dropAccum >= dropInterval`; also redraws every frame.
- **Locking** (`lockPiece` → `merge` + `clearLines` + `spawn`): merges the current piece into `board`, clears full rows (shifting from the bottom up), then spawns the next piece.
- **Scoring/leveling**: line clears use `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop adds 2 pts/row, soft drop 1 pt/row. Level is `startLevel + floor(lines/10)`; `dropInterval = speedForLevel(level) = max(100, 1000 - (level-1)*90)`.
- **Rendering**: `draw()` clears and redraws the whole board each frame (grid, locked blocks, ghost piece at `ghostY()` with `globalAlpha=0.2`, current piece). `drawNext()` renders the preview piece to a separate canvas (`#next-canvas`).
- **Input**: a single `keydown` listener switches on `e.code` for movement/rotation/soft-drop/hard-drop; `P`/`Escape` toggle pause. While `paused`, the listener hands *every* key to `handleMenuKey` and returns, so no game input can leak through the menu.
- **Pause menu** (`#pause-overlay`, separate from the game-over `#overlay`): two views (`#pause-main`, `#pause-controls`) toggled by `showMenuView`. Options are `.menu-item` elements carrying `data-action` (`resume`/`restart`/`controls`/`back`/`level`); `selectMenuItem` drives the highlight+focus and `runMenuAction` dispatches, shared by keyboard (↑/↓/Enter) and mouse (click/hover delegation on the overlay). Only `Enter` activates — `Space` is swallowed so the hard-drop key can't dismiss the menu.
- **Start level**: `startLevel` (1–`MAX_START_LEVEL`) is persisted under `tetris-start-level`, edited with ←/→ or the `.step` buttons, and applied by `init()` to `level`/`dropInterval` on the next game.

Tunable constants sit at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
