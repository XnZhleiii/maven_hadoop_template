(function () {
  "use strict";

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");
  const speedSelect = document.getElementById("speedSelect");
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");

  const CELL_SIZE = 24; // px per cell
  const INITIAL_LENGTH = 4;
  const STORAGE_KEY = "snakeHighScore";

  // Layout the canvas size to be a square that fits container width at a multiple of CELL_SIZE
  function sizeCanvasToDevice() {
    const displayWidth = canvas.clientWidth;
    const rounded = Math.max(CELL_SIZE * 12, Math.floor(displayWidth / CELL_SIZE) * CELL_SIZE);
    canvas.width = rounded;
    canvas.height = rounded;
  }
  sizeCanvasToDevice();

  // Game state
  let cols = Math.floor(canvas.width / CELL_SIZE);
  let rows = Math.floor(canvas.height / CELL_SIZE);

  let snake = [];
  let direction = { dx: 1, dy: 0 }; // moving right initially
  let queuedDirection = null; // next direction from input
  let food = null; // {x, y}
  let score = 0;
  let highScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
  let tickMs = Number(speedSelect.value);
  let timerId = null;
  let gameState = "ready"; // ready | running | paused | over

  highScoreEl.textContent = String(highScore);

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function positionsEqual(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function initGame() {
    cols = Math.floor(canvas.width / CELL_SIZE);
    rows = Math.floor(canvas.height / CELL_SIZE);

    snake = [];
    const startX = Math.floor(cols / 3);
    const startY = Math.floor(rows / 2);
    for (let i = INITIAL_LENGTH - 1; i >= 0; i -= 1) {
      snake.push({ x: startX - i, y: startY });
    }
    direction = { dx: 1, dy: 0 };
    queuedDirection = null;
    score = 0;
    updateScore();
    spawnFood();
    gameState = "ready";
    draw();
  }

  function updateScore() {
    scoreEl.textContent = String(score);
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(STORAGE_KEY, String(highScore));
      highScoreEl.textContent = String(highScore);
    }
  }

  function spawnFood() {
    // Choose a random empty cell not occupied by the snake
    const total = cols * rows;
    const occupied = new Set(snake.map(p => p.y * cols + p.x));
    const freeCount = total - occupied.size;
    if (freeCount <= 0) {
      // Board full, player wins
      gameOver(true);
      return;
    }
    const targetIndex = getRandomInt(0, freeCount - 1);
    let seen = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const id = y * cols + x;
        if (!occupied.has(id)) {
          if (seen === targetIndex) {
            food = { x, y };
            return;
          }
          seen += 1;
        }
      }
    }
  }

  function start() {
    if (gameState === "running") return;
    if (gameState === "over") initGame();
    gameState = "running";
    scheduleTick();
    updatePauseButton();
  }

  function pause() {
    if (gameState !== "running") return;
    clearInterval(timerId);
    timerId = null;
    gameState = "paused";
    updatePauseButton();
    draw();
  }

  function togglePause() {
    if (gameState === "running") {
      pause();
    } else {
      start();
    }
  }

  function restart() {
    clearInterval(timerId);
    timerId = null;
    initGame();
    start();
  }

  function updatePauseButton() {
    if (gameState === "running") {
      pauseBtn.textContent = "暂停";
    } else if (gameState === "paused" || gameState === "ready") {
      pauseBtn.textContent = "继续";
    } else {
      pauseBtn.textContent = "重新开始";
    }
  }

  function scheduleTick() {
    clearInterval(timerId);
    timerId = setInterval(tick, tickMs);
  }

  function applyQueuedDirection() {
    if (!queuedDirection) return;
    const { dx: ndx, dy: ndy } = queuedDirection;
    // Disallow reversing into itself
    if (snake.length >= 2) {
      const head = snake[0];
      const neck = snake[1];
      const currentDx = head.x - neck.x;
      const currentDy = head.y - neck.y;
      if (currentDx === -ndx && currentDy === -ndy) {
        queuedDirection = null;
        return;
      }
    }
    direction = queuedDirection;
    queuedDirection = null;
  }

  function tick() {
    if (gameState !== "running") return;

    applyQueuedDirection();

    const head = snake[0];
    const newHead = { x: head.x + direction.dx, y: head.y + direction.dy };

    // Wall collision
    if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows) {
      return gameOver(false);
    }

    // Self collision
    for (let i = 0; i < snake.length; i += 1) {
      if (positionsEqual(newHead, snake[i])) {
        return gameOver(false);
      }
    }

    snake.unshift(newHead);

    // Food
    if (food && positionsEqual(newHead, food)) {
      score += 10;
      updateScore();
      spawnFood();
      // Optional: slight speed-up every few foods
      // if (score % 50 === 0) {
      //   tickMs = Math.max(60, tickMs - 10);
      //   if (gameState === "running") scheduleTick();
      // }
    } else {
      snake.pop();
    }

    draw();
  }

  function gameOver(full) {
    clearInterval(timerId);
    timerId = null;
    gameState = "over";
    updatePauseButton();
    draw(full ? "WIN" : "GAME OVER");
  }

  function draw(message) {
    ctx.fillStyle = "#030712"; // bg
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional subtle grid
    ctx.strokeStyle = "#0b1222";
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * CELL_SIZE + 0.5, 0);
      ctx.lineTo(x * CELL_SIZE + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL_SIZE + 0.5);
      ctx.lineTo(canvas.width, y * CELL_SIZE + 0.5);
      ctx.stroke();
    }

    // Food
    if (food) {
      drawCell(food.x, food.y, "#f43f5e");
    }

    // Snake
    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const p = snake[i];
      if (i === 0) {
        drawCell(p.x, p.y, "#fbbf24");
      } else {
        drawCell(p.x, p.y, "#38bdf8");
      }
    }

    if (message) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = `${Math.floor(canvas.width / 12)}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(message, canvas.width / 2, canvas.height / 2);
      ctx.font = `${Math.floor(canvas.width / 28)}px system-ui, -apple-system, Segoe UI, Roboto`;
      const sub = gameState === "over" ? "按 空格 或 点击 重新开始" : "按 空格 或 点击 开始";
      ctx.fillText(sub, canvas.width / 2, canvas.height * 0.65);
    } else if (gameState === "ready") {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = `${Math.floor(canvas.width / 14)}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("准备开始", canvas.width / 2, canvas.height / 2);
      ctx.font = `${Math.floor(canvas.width / 28)}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.fillText("按 空格 或 点击 画布 开始", canvas.width / 2, canvas.height * 0.65);
    } else if (gameState === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = `${Math.floor(canvas.width / 14)}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("暂停", canvas.width / 2, canvas.height / 2);
    }
  }

  function drawCell(x, y, color) {
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  }

  // Input handling
  function setDirectionByKey(key) {
    const map = {
      ArrowUp: { dx: 0, dy: -1 },
      ArrowDown: { dx: 0, dy: 1 },
      ArrowLeft: { dx: -1, dy: 0 },
      ArrowRight: { dx: 1, dy: 0 },
      w: { dx: 0, dy: -1 },
      s: { dx: 0, dy: 1 },
      a: { dx: -1, dy: 0 },
      d: { dx: 1, dy: 0 },
      W: { dx: 0, dy: -1 },
      S: { dx: 0, dy: 1 },
      A: { dx: -1, dy: 0 },
      D: { dx: 1, dy: 0 },
    };
    const next = map[key];
    if (!next) return;
    queuedDirection = next;
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      if (gameState === "ready" || gameState === "paused") {
        start();
      } else if (gameState === "running") {
        pause();
      } else if (gameState === "over") {
        restart();
      }
      e.preventDefault();
      return;
    }
    setDirectionByKey(e.key);
  });

  // D-Pad buttons
  for (const btn of document.querySelectorAll(".dpad-btn")) {
    btn.addEventListener("click", () => {
      const dir = btn.getAttribute("data-dir");
      const map = {
        up: { dx: 0, dy: -1 },
        down: { dx: 0, dy: 1 },
        left: { dx: -1, dy: 0 },
        right: { dx: 1, dy: 0 },
      };
      queuedDirection = map[dir];
      if (gameState !== "running") start();
    });
  }

  // Touch swipe on canvas
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 20;
    if (absX > absY && absX > threshold) {
      queuedDirection = { dx: dx > 0 ? 1 : -1, dy: 0 };
    } else if (absY > threshold) {
      queuedDirection = { dx: 0, dy: dy > 0 ? 1 : -1 };
    } else {
      // Tap
      if (gameState === "ready" || gameState === "paused") start();
      else if (gameState === "running") pause();
    }
    touchStart = null;
  }, { passive: true });

  // Canvas click to start/pause
  canvas.addEventListener("click", () => {
    if (gameState === "ready" || gameState === "paused") start();
    else if (gameState === "running") pause();
    else if (gameState === "over") restart();
  });

  // Controls
  pauseBtn.addEventListener("click", togglePause);
  restartBtn.addEventListener("click", restart);
  speedSelect.addEventListener("change", () => {
    tickMs = Number(speedSelect.value);
    if (gameState === "running") scheduleTick();
  });

  // Resize: re-compute canvas and restart the game to fit new grid
  window.addEventListener("resize", () => {
    const wasRunning = gameState === "running";
    clearInterval(timerId);
    timerId = null;
    sizeCanvasToDevice();
    initGame();
    if (wasRunning) start(); else draw();
  });

  // Boot
  initGame();
  updatePauseButton();
})();
