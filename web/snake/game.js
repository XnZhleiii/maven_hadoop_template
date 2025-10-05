(() => {
  "use strict";

  const dom = {
    canvas: document.getElementById("gameCanvas"),
    score: document.getElementById("score"),
    highScore: document.getElementById("highScore"),
    overlay: document.getElementById("overlay"),
    pauseBtn: document.getElementById("pauseBtn"),
    restartBtn: document.getElementById("restartBtn"),
    btnUp: document.getElementById("btnUp"),
    btnDown: document.getElementById("btnDown"),
    btnLeft: document.getElementById("btnLeft"),
    btnRight: document.getElementById("btnRight"),
    btnPause: document.getElementById("btnPause"),
    btnRestart: document.getElementById("btnRestart"),
  };

  /** @type {CanvasRenderingContext2D} */
  const ctx = dom.canvas.getContext("2d", { alpha: false });

  const gameConfig = {
    gridColumns: 24,
    gridRows: 24,
    stepIntervalMs: 120,
    initialSnakeLength: 4,
    localStorageKey: "snake.highScore",
    backgroundColor: "#06101e",
    gridLineColor: "#0b2742",
    snakeColor: "#34d399",
    snakeHeadColor: "#10b981",
    appleColor: "#f43f5e",
  };

  let devicePixelRatioValue = 1;
  let cellSizePixels = 1; // dynamically computed

  const state = {
    isPaused: false,
    isGameOver: false,
    score: 0,
    highScore: 0,
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    snakeCells: [], // array of {x, y}
    pendingGrowth: 0,
    apple: { x: 5, y: 5 },
    lastTimestamp: 0,
    accumulatorMs: 0,
  };

  function readHighScore() {
    try {
      const raw = localStorage.getItem(gameConfig.localStorageKey);
      const parsed = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (_err) {
      return 0;
    }
  }

  function writeHighScore(newHighScore) {
    try {
      localStorage.setItem(gameConfig.localStorageKey, String(newHighScore));
    } catch (_err) {
      // ignore storage errors
    }
  }

  function init() {
    state.highScore = readHighScore();
    dom.highScore.textContent = String(state.highScore);

    setupCanvasSizing();
    bindEvents();
    resetGame();

    requestAnimationFrame(gameLoop);
  }

  function setupCanvasSizing() {
    function resize() {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      devicePixelRatioValue = dpr;
      // keep the canvas square using its CSS size
      const displayWidth = dom.canvas.clientWidth;
      const displayHeight = dom.canvas.clientHeight;
      const width = Math.floor(displayWidth * dpr);
      const height = Math.floor(displayHeight * dpr);

      if (dom.canvas.width !== width || dom.canvas.height !== height) {
        dom.canvas.width = width;
        dom.canvas.height = height;
      }

      const cellWidth = Math.floor(dom.canvas.width / gameConfig.gridColumns);
      const cellHeight = Math.floor(dom.canvas.height / gameConfig.gridRows);
      cellSizePixels = Math.max(1, Math.min(cellWidth, cellHeight));
    }

    resize();
    window.addEventListener("resize", resize);
  }

  function bindEvents() {
    // Keyboard
    window.addEventListener("keydown", (event) => {
      const key = event.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar"].includes(key)) {
        event.preventDefault(); // avoid page scroll
      }

      if (key === "p" || key === "P" || key === " ") {
        togglePause();
        return;
      }
      if (key === "r" || key === "R") {
        restartGame();
        return;
      }
      if (key === "ArrowUp" || key === "w" || key === "W") return queueDirectionChange(0, -1);
      if (key === "ArrowDown" || key === "s" || key === "S") return queueDirectionChange(0, 1);
      if (key === "ArrowLeft" || key === "a" || key === "A") return queueDirectionChange(-1, 0);
      if (key === "ArrowRight" || key === "d" || key === "D") return queueDirectionChange(1, 0);
    });

    // Buttons
    dom.pauseBtn.addEventListener("click", togglePause);
    dom.restartBtn.addEventListener("click", restartGame);
    dom.btnPause.addEventListener("click", togglePause);
    dom.btnRestart.addEventListener("click", restartGame);

    const onDir = (dx, dy) => () => queueDirectionChange(dx, dy);
    dom.btnUp.addEventListener("pointerdown", onDir(0, -1));
    dom.btnDown.addEventListener("pointerdown", onDir(0, 1));
    dom.btnLeft.addEventListener("pointerdown", onDir(-1, 0));
    dom.btnRight.addEventListener("pointerdown", onDir(1, 0));

    // Auto-pause when tab hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !state.isPaused && !state.isGameOver) {
        setPaused(true);
      }
    });
  }

  function resetGame() {
    state.score = 0;
    dom.score.textContent = String(state.score);

    const startX = Math.floor(gameConfig.gridColumns / 2);
    const startY = Math.floor(gameConfig.gridRows / 2);

    state.snakeCells = [];
    for (let i = gameConfig.initialSnakeLength - 1; i >= 0; i -= 1) {
      state.snakeCells.push({ x: startX - i, y: startY });
    }

    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    state.pendingGrowth = 0;
    state.isGameOver = false;
    setPaused(false);
    hideOverlay();

    state.apple = randomFreeCell();
  }

  function queueDirectionChange(dx, dy) {
    const newDirection = { x: dx, y: dy };
    // Ignore reverse direction in the same axis
    if (newDirection.x === -state.direction.x && newDirection.y === -state.direction.y) {
      return;
    }
    // Only accept axis-aligned unit vectors
    if (Math.abs(newDirection.x) + Math.abs(newDirection.y) !== 1) {
      return;
    }
    state.nextDirection = newDirection;
    // Unpause on first intent
    if (state.isPaused && !state.isGameOver) {
      setPaused(false);
    }
  }

  function togglePause() {
    if (state.isGameOver) return; // cannot pause when over
    setPaused(!state.isPaused);
  }

  function setPaused(pause) {
    state.isPaused = pause;
    dom.pauseBtn.setAttribute("aria-pressed", pause ? "true" : "false");
    if (pause) {
      showOverlay("暂停", "按 P/空格 继续，或方向键继续移动");
    } else {
      hideOverlay();
    }
  }

  function restartGame() {
    resetGame();
  }

  function randomFreeCell() {
    const occupied = new Set(state.snakeCells.map((c) => `${c.x},${c.y}`));
    const total = gameConfig.gridColumns * gameConfig.gridRows;
    // In worst case fall back to random loops, but try at most total times
    for (let i = 0; i < total; i += 1) {
      const x = Math.floor(Math.random() * gameConfig.gridColumns);
      const y = Math.floor(Math.random() * gameConfig.gridRows);
      const key = `${x},${y}`;
      if (!occupied.has(key)) return { x, y };
    }
    // If snake occupies almost all cells, linearly search
    for (let y = 0; y < gameConfig.gridRows; y += 1) {
      for (let x = 0; x < gameConfig.gridColumns; x += 1) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) return { x, y };
      }
    }
    // Fallback (should not happen)
    return { x: 0, y: 0 };
  }

  function update() {
    // Apply the next direction at most once per tick
    state.direction = state.nextDirection;

    const head = state.snakeCells[0];
    const newHead = { x: head.x + state.direction.x, y: head.y + state.direction.y };

    // Wall collision
    if (
      newHead.x < 0 ||
      newHead.y < 0 ||
      newHead.x >= gameConfig.gridColumns ||
      newHead.y >= gameConfig.gridRows
    ) {
      return setGameOver();
    }

    // Self collision
    for (let i = 0; i < state.snakeCells.length; i += 1) {
      const cell = state.snakeCells[i];
      if (cell.x === newHead.x && cell.y === newHead.y) {
        return setGameOver();
      }
    }

    // Move
    state.snakeCells.unshift(newHead);

    // Apple
    if (newHead.x === state.apple.x && newHead.y === state.apple.y) {
      state.score += 1;
      dom.score.textContent = String(state.score);
      if (state.score > state.highScore) {
        state.highScore = state.score;
        dom.highScore.textContent = String(state.highScore);
        writeHighScore(state.highScore);
      }
      state.pendingGrowth += 1;
      state.apple = randomFreeCell();
    }

    if (state.pendingGrowth > 0) {
      state.pendingGrowth -= 1;
    } else {
      state.snakeCells.pop();
    }
  }

  function setGameOver() {
    state.isGameOver = true;
    showOverlay("游戏结束", "按 R 重开，或点击 重开");
  }

  function draw() {
    const width = dom.canvas.width;
    const height = dom.canvas.height;

    // Background
    ctx.fillStyle = gameConfig.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Optional subtle grid
    ctx.strokeStyle = gameConfig.gridLineColor;
    ctx.lineWidth = Math.max(1, Math.floor(1 * devicePixelRatioValue));
    const step = cellSizePixels;
    ctx.beginPath();
    for (let x = 0; x <= gameConfig.gridColumns; x += 1) {
      const px = x * step + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = 0; y <= gameConfig.gridRows; y += 1) {
      const py = y * step + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();

    // Apple
    drawApple(state.apple.x, state.apple.y);

    // Snake
    drawSnake();
  }

  function drawApple(gridX, gridY) {
    const padding = Math.max(1, Math.floor(cellSizePixels * 0.15));
    const x = gridX * cellSizePixels + padding;
    const y = gridY * cellSizePixels + padding;
    const size = cellSizePixels - padding * 2;

    ctx.fillStyle = gameConfig.appleColor;
    ctx.beginPath();
    const radius = size / 2;
    ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake() {
    for (let i = 0; i < state.snakeCells.length; i += 1) {
      const cell = state.snakeCells[i];
      const padding = Math.max(1, Math.floor(cellSizePixels * 0.12));
      const x = cell.x * cellSizePixels + padding;
      const y = cell.y * cellSizePixels + padding;
      const size = cellSizePixels - padding * 2;

      ctx.fillStyle = i === 0 ? gameConfig.snakeHeadColor : gameConfig.snakeColor;
      ctx.fillRect(x, y, size, size);
    }
  }

  function showOverlay(title, subtitle) {
    dom.overlay.classList.remove("hidden");
    dom.overlay.innerHTML = `${title}<span class="sub">${subtitle || ""}</span>`;
  }

  function hideOverlay() {
    dom.overlay.classList.add("hidden");
    dom.overlay.textContent = "";
  }

  function gameLoop(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    let delta = timestamp - state.lastTimestamp;
    if (delta > 1000) delta = gameConfig.stepIntervalMs; // clamp when tab was inactive
    state.lastTimestamp = timestamp;

    if (!state.isPaused && !state.isGameOver) {
      state.accumulatorMs += delta;
      while (state.accumulatorMs >= gameConfig.stepIntervalMs) {
        update();
        state.accumulatorMs -= gameConfig.stepIntervalMs;
      }
    }

    draw();
    requestAnimationFrame(gameLoop);
  }

  // Kickoff
  init();
})();
