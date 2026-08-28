// Rendering, input, and the animation loop. All physics/world/camera rules
// live in game-core.ts --- this file only draws frames and translates key
// events / clicks into calls against that pure model.
import {
  GROUND_Y,
  LEVEL,
  PHYSICS,
  WORLD_WIDTH,
  createInitialGameState,
  poseFor,
  updateGame,
  type GameState,
  type InputState,
  type PlayerState,
} from "./game-core.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("missing #game-canvas");
const loseOverlay = document.querySelector<HTMLDivElement>("#lose-overlay");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
if (!loseOverlay || !restartButton) throw new Error("missing lose-overlay markup");

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

let game: GameState = createInitialGameState();
let lastTime: number | null = null;

function restart(): void {
  game = createInitialGameState();
  keys.left = false;
  keys.right = false;
  keys.jumpHeld = false;
  jumpPressedEdge = false;
  lastTime = null;
}

restartButton.addEventListener("click", restart);

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

  game = updateGame(game, input, dt);
  loseOverlay!.hidden = game.status !== "LOSE";
  render(game);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

// --- rendering --------------------------------------------------------

const SKY_TOP = "#7ec8e3";
const SKY_BOTTOM = "#bfe9ff";
const GROUND_TOP = "#5b8c3a";
const GROUND_BOTTOM = "#7a5230";
const PLATFORM_TOP = "#8a6a3a";
const PLATFORM_BODY = "#6b4e2a";
const PIT_WALL = "#241f2e";
const PIT_FLOOR = "#0d0b12";
const SKIN = "#e8b98a";
const HAIR = "#3b2a1a";
const SHIRT = "#3f6fd1";
const PANTS = "#2b2b40";

interface ParallaxShape {
  x: number;
  y: number; // baseline (bottom) of the shape
  w: number;
  h: number;
}

// Deterministic generators --- fixed math from the index, never Math.random
// --- so the background never flickers or reshuffles between frames.
function generateLayer(spacing: number, count: number, baseY: number, sizeBase: number, sizeVar: number): ParallaxShape[] {
  const shapes: ParallaxShape[] = [];
  for (let i = 0; i < count; i++) {
    const w = sizeBase + (((i * 37) % 100) / 100) * sizeVar;
    const h = sizeBase * 0.7 + (((i * 53) % 100) / 100) * (sizeVar * 0.6);
    shapes.push({ x: i * spacing, y: baseY, w, h });
  }
  return shapes;
}

const FAR_SPACING = 260;
const MID_SPACING = 150;
const NEAR_SPACING = 70;
const FAR_LAYER = generateLayer(FAR_SPACING, Math.ceil(WORLD_WIDTH / FAR_SPACING) + 2, GROUND_Y - 30, 90, 70);
const MID_LAYER = generateLayer(MID_SPACING, Math.ceil(WORLD_WIDTH / MID_SPACING) + 2, GROUND_Y, 40, 50);
const NEAR_LAYER = generateLayer(NEAR_SPACING, Math.ceil(WORLD_WIDTH / NEAR_SPACING) + 2, GROUND_Y + PHYSICS.GROUND_HEIGHT, 10, 16);

const FAR_FACTOR = 0.2;
const MID_FACTOR = 0.5;
const NEAR_FACTOR = 0.8;

function drawParallaxLayer(shapes: ParallaxShape[], factor: number, cameraX: number, color: string): void {
  const offset = cameraX * factor;
  ctx!.fillStyle = color;
  for (const shape of shapes) {
    const screenX = shape.x - offset;
    if (screenX + shape.w < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;
    ctx!.fillRect(screenX, shape.y - shape.h, shape.w, shape.h);
  }
}

function render(state: GameState): void {
  const cameraX = state.cameraX;

  drawSky();
  drawParallaxLayer(FAR_LAYER, FAR_FACTOR, cameraX, "#5c6f9e"); // distant mountains
  drawParallaxLayer(MID_LAYER, MID_FACTOR, cameraX, "#3d4f66"); // ruined-tower silhouettes
  drawLevel(cameraX);
  drawParallaxLayer(NEAR_LAYER, NEAR_FACTOR, cameraX, "#3f7a2e"); // foreground grass tufts
  drawPlayer(state.player, cameraX);
}

function drawSky(): void {
  const gradient = ctx!.createLinearGradient(0, 0, 0, GROUND_Y);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(1, SKY_BOTTOM);
  ctx!.fillStyle = gradient;
  ctx!.fillRect(0, 0, PHYSICS.CANVAS_WIDTH, PHYSICS.CANVAS_HEIGHT);
}

function drawLevel(cameraX: number): void {
  for (const platform of LEVEL.platforms) {
    const screenX = platform.x - cameraX;
    if (screenX + platform.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;

    const isGround = platform.height >= PHYSICS.GROUND_HEIGHT;
    ctx!.fillStyle = isGround ? GROUND_TOP : PLATFORM_TOP;
    ctx!.fillRect(screenX, platform.y, platform.width, 10);
    ctx!.fillStyle = isGround ? GROUND_BOTTOM : PLATFORM_BODY;
    ctx!.fillRect(screenX, platform.y + 10, platform.width, platform.height - 10);

    ctx!.fillStyle = "rgba(0, 0, 0, 0.08)";
    for (let seam = 0; seam < platform.width; seam += 40) {
      ctx!.fillRect(screenX + seam, platform.y, 2, platform.height);
    }
  }

  for (const pit of LEVEL.pits) {
    const screenX = pit.x - cameraX;
    if (screenX + pit.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;

    ctx!.fillStyle = PIT_FLOOR;
    ctx!.fillRect(screenX, GROUND_Y, pit.width, PHYSICS.CANVAS_HEIGHT - GROUND_Y);
    ctx!.fillStyle = PIT_WALL;
    for (let wx = 0; wx < pit.width; wx += 24) {
      ctx!.fillRect(screenX + wx, GROUND_Y, 16, PHYSICS.CANVAS_HEIGHT - GROUND_Y);
    }
  }
}

function drawPlayer(state: PlayerState, cameraX: number): void {
  const c = ctx!;
  const pose = poseFor(state);
  const w = PHYSICS.PLAYER_WIDTH;
  const h = PHYSICS.PLAYER_HEIGHT;
  const screenX = state.x - cameraX;
  const top = state.y - h;

  c.save();
  c.translate(screenX, top);
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
