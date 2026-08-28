// Rendering, input, and the animation loop. All physics/rules live in
// game-core.ts --- this file only draws frames and translates key events
// into the InputState that game-core understands.
import {
  GROUND_Y,
  PHYSICS,
  createInitialPlayerState,
  poseFor,
  updatePlayer,
  type InputState,
  type PlayerState,
} from "./game-core.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("missing #game-canvas");

// The canvas's internal resolution is the fixed logical playfield; CSS scales
// its on-page size, but every physics number in game-core.ts is expressed in
// these logical pixels, so CSS scaling never touches the physics.
canvas.width = PHYSICS.CANVAS_WIDTH;
canvas.height = PHYSICS.CANVAS_HEIGHT;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");
ctx.imageSmoothingEnabled = false;

const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);

const keys = { left: false, right: false, jumpHeld: false };
let jumpPressedEdge = false;

function isControlKey(code: string): boolean {
  return LEFT_KEYS.has(code) || RIGHT_KEYS.has(code) || JUMP_KEYS.has(code);
}

window.addEventListener("keydown", (event) => {
  if (isControlKey(event.code)) event.preventDefault();
  if (LEFT_KEYS.has(event.code)) keys.left = true;
  if (RIGHT_KEYS.has(event.code)) keys.right = true;
  if (JUMP_KEYS.has(event.code)) {
    if (!keys.jumpHeld) jumpPressedEdge = true;
    keys.jumpHeld = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (isControlKey(event.code)) event.preventDefault();
  if (LEFT_KEYS.has(event.code)) keys.left = false;
  if (RIGHT_KEYS.has(event.code)) keys.right = false;
  if (JUMP_KEYS.has(event.code)) keys.jumpHeld = false;
});

let player: PlayerState = createInitialPlayerState();
let lastTime: number | null = null;

function tick(time: number): void {
  if (lastTime === null) lastTime = time;
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  const input: InputState = {
    left: keys.left,
    right: keys.right,
    jumpPressed: jumpPressedEdge,
    jumpHeld: keys.jumpHeld,
  };
  jumpPressedEdge = false;

  player = updatePlayer(player, input, dt);
  render(player);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

// --- rendering --------------------------------------------------------

const SKY_TOP = "#7ec8e3";
const SKY_BOTTOM = "#bfe9ff";
const HILL = "#4a7a2e";
const GROUND_TOP = "#5b8c3a";
const GROUND_BOTTOM = "#7a5230";
const SKIN = "#e8b98a";
const HAIR = "#3b2a1a";
const SHIRT = "#3f6fd1";
const PANTS = "#2b2b40";

function render(state: PlayerState): void {
  drawBackground();
  drawGround();
  drawPlayer(state);
}

function drawBackground(): void {
  const gradient = ctx!.createLinearGradient(0, 0, 0, GROUND_Y);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(1, SKY_BOTTOM);
  ctx!.fillStyle = gradient;
  ctx!.fillRect(0, 0, PHYSICS.CANVAS_WIDTH, GROUND_Y);

  ctx!.fillStyle = "#ffffff";
  for (const [cx, cy] of [
    [80, 60],
    [260, 100],
    [520, 50],
    [700, 120],
    [860, 70],
  ]) {
    ctx!.fillRect(cx, cy, 40, 20);
    ctx!.fillRect(cx - 10, cy + 10, 60, 20);
  }

  ctx!.fillStyle = HILL;
  const hillY = GROUND_Y - 40;
  for (let hx = -20; hx < PHYSICS.CANVAS_WIDTH; hx += 160) {
    ctx!.fillRect(hx, hillY, 100, 40);
  }
}

function drawGround(): void {
  ctx!.fillStyle = GROUND_TOP;
  ctx!.fillRect(0, GROUND_Y, PHYSICS.CANVAS_WIDTH, 10);
  ctx!.fillStyle = GROUND_BOTTOM;
  ctx!.fillRect(0, GROUND_Y + 10, PHYSICS.CANVAS_WIDTH, PHYSICS.GROUND_HEIGHT - 10);

  ctx!.fillStyle = "rgba(0, 0, 0, 0.08)";
  for (let sx = 0; sx < PHYSICS.CANVAS_WIDTH; sx += 40) {
    ctx!.fillRect(sx, GROUND_Y, 2, PHYSICS.GROUND_HEIGHT);
  }
}

function drawPlayer(state: PlayerState): void {
  const c = ctx!;
  const pose = poseFor(state);
  const w = PHYSICS.PLAYER_WIDTH;
  const h = PHYSICS.PLAYER_HEIGHT;
  const top = state.y - h;

  c.save();
  c.translate(state.x, top);
  if (!state.facingRight) {
    c.translate(w, 0);
    c.scale(-1, 1);
  }

  const swing = pose === "run" ? Math.sin(state.runCycle) : 0;
  const legSwingPx = swing * 7;
  const armSwingPx = -swing * 7; // opposite the same-side leg, like a real stride

  const legTopY = 34;
  const tucked = pose === "jump";
  const legHeight = tucked ? 14 : 20;
  const legY = tucked ? legTopY + 6 : legTopY;

  c.fillStyle = PANTS;
  if (pose === "fall") {
    c.fillRect(2, legTopY, 9, 20);
    c.fillRect(w - 11, legTopY, 9, 20);
  } else {
    c.fillRect(6 + legSwingPx, legY, 8, legHeight);
    c.fillRect(w - 14 - legSwingPx, legY, 8, legHeight);
  }

  c.fillStyle = SHIRT;
  if (pose === "jump") {
    c.fillRect(1, 6, 7, 18);
    c.fillRect(w - 8, 6, 7, 18);
  } else if (pose === "fall") {
    c.fillRect(-2, 16, 9, 16);
    c.fillRect(w - 7, 16, 9, 16);
  } else {
    c.fillRect(1 + armSwingPx, 16, 7, 18);
    c.fillRect(w - 8 - armSwingPx, 16, 7, 18);
  }

  c.fillStyle = SHIRT;
  c.fillRect(8, 14, 20, 22);

  c.fillStyle = SKIN;
  c.fillRect(10, 0, 16, 14);
  c.fillStyle = HAIR;
  c.fillRect(10, 0, 16, 4);

  c.restore();
}
