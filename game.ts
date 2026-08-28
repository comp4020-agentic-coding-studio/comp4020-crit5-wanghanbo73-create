// Rendering, input, and the animation loop. All physics/world/camera rules
// live in game-core.ts --- this file only draws frames and translates key
// events / clicks into calls against that pure model. Nothing here reads
// back into game state: end-of-run animation timing uses real wall-clock
// time captured locally (rAF's `time`), since game-core.ts freezes its own
// elapsedMs the instant the run stops being PLAYING.
import {
  GROUND_Y,
  LEVEL,
  PHYSICS,
  WORLD_WIDTH,
  createInitialGameState,
  hiddenPlatformProgress,
  isHiddenPlatformSolid,
  poseFor,
  updateGame,
  type BrickState,
  type EnemyState,
  type GameState,
  type GameStatus,
  type HiddenPlatformState,
  type InputState,
  type MysteryBlockState,
  type Particle,
  type Platform,
  type PlayerState,
  type Pose,
} from "./game-core.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("missing #game-canvas");
const loseOverlay = document.querySelector<HTMLDivElement>("#lose-overlay");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const winOverlay = document.querySelector<HTMLDivElement>("#win-overlay");
const winRestartButton = document.querySelector<HTMLButtonElement>("#win-restart-button");
if (!loseOverlay || !restartButton) throw new Error("missing lose-overlay markup");
if (!winOverlay || !winRestartButton) throw new Error("missing win-overlay markup");

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

// --- rendering-only end-of-run animation timers ----------------------------
//
// game-core.ts freezes GameState.elapsedMs the instant status leaves
// PLAYING, so a "brief win/hurt animation" can't be timed off it. These are
// purely cosmetic, derived by watching for a PLAYING -> WIN/LOSE transition
// and a not-grounded -> grounded transition; they never feed back into
// game-core.ts and never affect input, physics, or collision.
let loseAnimStart: number | null = null;
let winAnimStart: number | null = null;
let landingAnimStart: number | null = null;
let landingAnimX = 0;
let landingAnimY = 0;

function restart(): void {
  game = createInitialGameState();
  keys.left = false;
  keys.right = false;
  keys.jumpHeld = false;
  jumpPressedEdge = false;
  lastTime = null;
  loseAnimStart = null;
  winAnimStart = null;
  landingAnimStart = null;
}

restartButton.addEventListener("click", restart);
winRestartButton.addEventListener("click", restart);

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

  const prevStatus = game.status;
  const prevGrounded = game.player.grounded;

  game = updateGame(game, input, dt);

  if (prevStatus === "PLAYING" && game.status === "LOSE") loseAnimStart = time;
  if (prevStatus === "PLAYING" && game.status === "WIN") winAnimStart = time;
  if (!prevGrounded && game.player.grounded) {
    landingAnimStart = time;
    landingAnimX = game.player.x;
    landingAnimY = game.player.y;
  }

  loseOverlay!.hidden = game.status !== "LOSE";
  winOverlay!.hidden = game.status !== "WIN";
  render(game, time);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

// --- palette ----------------------------------------------------------
//
// "Dusk ruins" --- an original theme, not a reskin of any commercial game's
// specific characters or blocks: warm dusk sky, low-saturation blue-grey
// mountains and stone-brown ruin silhouettes, green/brown ground, a teal-
// jacket/orange-scarf explorer, a purple ruins guardian, and a cyan/gold
// portal.

const SKY_TOP = "#7ec8e3";
const SKY_BOTTOM = "#f2a463";
const SUN = "#ffe3a0";
const FAR_MOUNTAIN = "#8a97ad";
const MID_RUIN = "#4b5468";
const MID_RUIN_DARK = "#3a4254";
const NEAR_TUFT = "#3f7a2e";
const NEAR_ROCK = "#5a5548";

const GROUND_TOP = "#5b8c3a";
const GROUND_TOP_HI = "#79b654";
const GROUND_BOTTOM = "#7a5230";
const GROUND_BOTTOM_DARK = "#5e3e22";

const STONE_LIGHT = "#8a8578";
const STONE_MID = "#6e6a5e";
const STONE_DARK = "#4f4c44";

const JACKET = "#2f8f7a";
const JACKET_HI = "#57c2a8";
const JACKET_SHADOW = "#1c5f50";
const SCARF = "#e8772a";
const SCARF_HI = "#ffab5c";
const SCARF_SHADOW = "#b2521a";
const SKIN = "#e8b98a";
const SKIN_SHADOW = "#c99a6c";
const GOGGLE = "#26313a";
const GOGGLE_GLASS = "#8fe8ff";
const HAIR = "#2a1f18";
const PANTS = "#2b2b40";
const PANTS_HI = "#41415e";
const SHOE = "#171720";
const OUTLINE = "#12121a";

const ENEMY_BODY = "#6a3fa0";
const ENEMY_BODY_HI = "#9463c9";
const ENEMY_BODY_SHADOW = "#432268";
const ENEMY_CORE = "#ff5fb0";

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

// Deterministic pseudo-random in [0, 1), fixed function of an integer index
// --- used for tile texture speckle so it never reshuffles between frames or
// changes as the camera scrolls.
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const FAR_SPACING = 260;
const MID_SPACING = 170;
const NEAR_SPACING = 60;
const FAR_LAYER = generateLayer(FAR_SPACING, Math.ceil(WORLD_WIDTH / FAR_SPACING) + 2, GROUND_Y - 20, 90, 60);
const MID_LAYER = generateLayer(MID_SPACING, Math.ceil(WORLD_WIDTH / MID_SPACING) + 2, GROUND_Y + 4, 46, 60);
const NEAR_LAYER = generateLayer(NEAR_SPACING, Math.ceil(WORLD_WIDTH / NEAR_SPACING) + 2, GROUND_Y + PHYSICS.GROUND_HEIGHT, 9, 14);

const FAR_FACTOR = 0.2;
const MID_FACTOR = 0.5;
const NEAR_FACTOR = 0.85;

function render(state: GameState, time: number): void {
  const cameraX = state.cameraX;
  const loseAge = loseAnimStart !== null ? time - loseAnimStart : null;
  const winAge = winAnimStart !== null ? time - winAnimStart : null;
  const landingAge = landingAnimStart !== null ? time - landingAnimStart : null;

  drawBackground(cameraX, state.elapsedMs);
  drawGroundTile(cameraX);
  drawStonePlatform(cameraX);
  drawGoal(LEVEL.goal, cameraX, state.elapsedMs, state.status === "WIN", winAge);
  drawLava(cameraX, state.elapsedMs);
  drawBricks(state.bricks, cameraX);
  drawHiddenPlatform(state.hiddenPlatform, cameraX, state.elapsedMs);
  drawMysteryBlock(state.mysteryBlock, cameraX, state.elapsedMs);
  drawEnemy(state.enemy, cameraX, state.elapsedMs);
  drawParallaxLayer(NEAR_LAYER, NEAR_FACTOR, cameraX, (i) => (i % 3 === 0 ? NEAR_ROCK : NEAR_TUFT));
  if (landingAge !== null && landingAge < 260) drawDustBurst(cameraX, landingAnimX, landingAnimY, landingAge, 260, 6);
  drawPlayer(state, cameraX, loseAge, winAge);
  drawParticles(state.particles, cameraX, state.elapsedMs);
  drawHud(state, cameraX);
}

// --- background: sky, sun, distant mountains, ruin silhouettes ------------

function drawBackground(cameraX: number, elapsedMs: number): void {
  const c = ctx!;
  const gradient = c.createLinearGradient(0, 0, 0, GROUND_Y);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(1, SKY_BOTTOM);
  c.fillStyle = gradient;
  c.fillRect(0, 0, PHYSICS.CANVAS_WIDTH, PHYSICS.CANVAS_HEIGHT);

  // Sun: fixed screen position but a slow deterministic glow pulse, tying
  // the ambient light to the same dusk-ruins mood as the lava/portal glows.
  const sunPulse = 1 + Math.sin(elapsedMs / 1400) * 0.04;
  const sunX = PHYSICS.CANVAS_WIDTH * 0.78;
  const sunY = GROUND_Y * 0.32;
  const sunGlow = c.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70 * sunPulse);
  sunGlow.addColorStop(0, "rgba(255, 227, 160, 0.9)");
  sunGlow.addColorStop(1, "rgba(255, 227, 160, 0)");
  c.fillStyle = sunGlow;
  c.beginPath();
  c.arc(sunX, sunY, 70 * sunPulse, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = SUN;
  c.beginPath();
  c.arc(sunX, sunY, 26, 0, Math.PI * 2);
  c.fill();

  drawParallaxLayer(FAR_LAYER, FAR_FACTOR, cameraX, () => FAR_MOUNTAIN, true);
  drawParallaxLayer(MID_LAYER, MID_FACTOR, cameraX, (i) => (i % 4 === 0 ? MID_RUIN_DARK : MID_RUIN));
}

// Renders a deterministic parallax layer. `colorOf(index)` picks per-shape
// color so different silhouettes can be mixed into one layer; `triangle`
// draws jagged mountain peaks instead of flat-topped blocks.
function drawParallaxLayer(
  shapes: ParallaxShape[],
  factor: number,
  cameraX: number,
  colorOf: (index: number) => string,
  triangle = false,
): void {
  const c = ctx!;
  const offset = cameraX * factor;
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const screenX = shape.x - offset;
    if (screenX + shape.w < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;
    c.fillStyle = colorOf(i);
    if (triangle) {
      c.beginPath();
      c.moveTo(screenX, shape.y);
      c.lineTo(screenX + shape.w / 2, shape.y - shape.h);
      c.lineTo(screenX + shape.w, shape.y);
      c.closePath();
      c.fill();
    } else {
      // Ruin-tower silhouette: a body plus a couple of crenellation notches
      // on top, deterministic per index so it never reshuffles.
      c.fillRect(screenX, shape.y - shape.h, shape.w, shape.h);
      const notch = shape.w / 5;
      c.fillRect(screenX + notch * 0.5, shape.y - shape.h - 8, notch, 8);
      c.fillRect(screenX + notch * 2.5, shape.y - shape.h - 12, notch, 12);
    }
  }
}

// --- ground & stone platforms ----------------------------------------------
//
// Grass-over-dirt with deterministic stone-fleck speckle for ground level;
// a separate lighter/darker fragment-block texture with crack marks for the
// raised stone platform (the long-press-jump step). Texture is a pure
// function of world x/tile index --- generated once per visible strip per
// frame, never stored, never reshuffled.

function drawGroundTile(cameraX: number): void {
  const c = ctx!;
  for (const platform of LEVEL.platforms) {
    if (platform.height < PHYSICS.GROUND_HEIGHT) continue; // handled by drawStonePlatform
    const screenX = platform.x - cameraX;
    if (screenX + platform.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;

    const gradient = c.createLinearGradient(0, platform.y + 8, 0, platform.y + platform.height);
    gradient.addColorStop(0, GROUND_BOTTOM);
    gradient.addColorStop(1, GROUND_BOTTOM_DARK);
    c.fillStyle = gradient;
    c.fillRect(screenX, platform.y + 8, platform.width, platform.height - 8);

    c.fillStyle = GROUND_TOP;
    c.fillRect(screenX, platform.y, platform.width, 8);
    c.fillStyle = GROUND_TOP_HI;
    c.fillRect(screenX, platform.y, platform.width, 2);

    // Speckle: small stone/dirt flecks, deterministic per 12px tile.
    const visLeft = Math.max(platform.x, cameraX - 20);
    const visRight = Math.min(platform.x + platform.width, cameraX + PHYSICS.CANVAS_WIDTH + 20);
    for (let worldX = Math.floor(visLeft / 12) * 12; worldX < visRight; worldX += 12) {
      const tile = Math.floor(worldX / 12);
      const r = hash01(tile);
      const sx = worldX - cameraX;
      if (r > 0.55) {
        c.fillStyle = r > 0.8 ? "rgba(40, 25, 10, 0.35)" : "rgba(120, 90, 60, 0.3)";
        const fy = platform.y + 12 + hash01(tile + 500) * (platform.height - 20);
        c.fillRect(sx + hash01(tile + 1000) * 8, fy, 3, 3);
      }
      if (r < 0.12) {
        c.fillStyle = "rgba(255, 255, 255, 0.15)";
        c.fillRect(sx, platform.y + 3, 3, 2);
      }
    }
  }
}

function drawStonePlatform(cameraX: number): void {
  const c = ctx!;
  for (const platform of LEVEL.platforms) {
    if (platform.height >= PHYSICS.GROUND_HEIGHT) continue; // ground handled above
    const screenX = platform.x - cameraX;
    if (screenX + platform.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;

    const tileSize = 20;
    for (let ty = 0; ty * tileSize < platform.height; ty++) {
      for (let tx = 0; tx * tileSize < platform.width; tx++) {
        const worldTileX = Math.floor(platform.x / tileSize) + tx;
        const r = hash01(worldTileX * 31 + ty * 17 + platform.x);
        const shade = r > 0.66 ? STONE_LIGHT : r > 0.33 ? STONE_MID : STONE_DARK;
        const px = screenX + tx * tileSize;
        const py = platform.y + ty * tileSize;
        const w = Math.min(tileSize, platform.width - tx * tileSize);
        const h = Math.min(tileSize, platform.height - ty * tileSize);
        c.fillStyle = shade;
        c.fillRect(px, py, w, h);
        c.fillStyle = ty === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
        c.fillRect(px, py, w, 2);
        // Deterministic crack mark on roughly one tile in six.
        if (hash01(worldTileX * 7 + ty * 13) > 0.85) {
          c.strokeStyle = "rgba(0,0,0,0.25)";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(px + w * 0.3, py + h * 0.2);
          c.lineTo(px + w * 0.6, py + h * 0.7);
          c.stroke();
        }
      }
    }
    c.strokeStyle = "rgba(0,0,0,0.3)";
    c.lineWidth = 2;
    c.strokeRect(screenX + 1, platform.y + 1, platform.width - 2, platform.height - 2);
  }
}

// --- lava ---------------------------------------------------------------
//
// Every visual (ripple, bubbles, splashes) is a deterministic function of
// elapsedMs --- the same instant always looks the same, so nothing flickers
// or reshuffles frame to frame, and camera movement never desyncs the
// hazard's screen position from its collision rectangle (both derive from
// the same world x).

const LAVA_DEEP = "#7a1a0a";
const LAVA_MID = "#c94b1a";
const LAVA_HOT = "#f2a221";
const LAVA_GLOW = "rgba(255, 140, 40, 0.35)";
const LAVA_EDGE_LIT = "rgba(255, 150, 60, 0.25)";

function drawLava(cameraX: number, elapsedMs: number): void {
  const c = ctx!;
  const t = elapsedMs / 1000;

  for (const pit of LEVEL.pits) {
    const screenX = pit.x - cameraX;
    if (screenX + pit.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;

    const surfaceTop = GROUND_Y + 6;
    const bottom = PHYSICS.CANVAS_HEIGHT;

    // Warm glow spilling onto the lip of the surrounding ground/dirt.
    c.fillStyle = LAVA_EDGE_LIT;
    c.fillRect(screenX - 18, GROUND_Y - 10, pit.width + 36, 18);

    // Depth gradient --- hot near the surface, darkening toward the bottom.
    const gradient = c.createLinearGradient(0, surfaceTop, 0, bottom);
    gradient.addColorStop(0, LAVA_HOT);
    gradient.addColorStop(0.35, LAVA_MID);
    gradient.addColorStop(1, LAVA_DEEP);
    c.fillStyle = gradient;
    c.fillRect(screenX, surfaceTop, pit.width, bottom - surfaceTop);

    // Slow surface ripple: a few overlapping sine bands, each a fixed
    // function of world x and elapsed time (never per-frame randomized).
    for (let band = 0; band < 3; band++) {
      const bandOffset = band * 7;
      c.fillStyle = band === 0 ? LAVA_HOT : "rgba(255, 200, 80, 0.35)";
      for (let x = 0; x < pit.width; x += 6) {
        const worldX = pit.x + x;
        const ripple = Math.sin(worldX * 0.05 + t * (1.4 + band * 0.3) + band) * 3;
        c.fillRect(screenX + x, surfaceTop + bandOffset + ripple, 6, 3);
      }
    }

    // Occasional rising-and-popping bubbles: deterministic per bubble index,
    // cycling through a fixed lifetime so each one rises then "pops".
    const bubbleCount = Math.max(3, Math.floor(pit.width / 40));
    for (let i = 0; i < bubbleCount; i++) {
      const cycle = 2.4 + (i % 3) * 0.5;
      const phase = (t + i * 0.83) % cycle;
      if (phase > cycle * 0.7) continue; // popped; brief gap before it re-forms
      const progress = phase / (cycle * 0.7);
      const bx = pit.x + ((i * 53) % pit.width);
      const by = surfaceTop + 20 - progress * 18;
      const radius = 2 + progress * 3;
      c.fillStyle = progress > 0.85 ? "rgba(255, 235, 180, 0.9)" : "rgba(255, 170, 60, 0.85)";
      c.beginPath();
      c.arc(bx - cameraX, by, radius, 0, Math.PI * 2);
      c.fill();
    }

    // Occasional small splashes near the edges.
    for (let i = 0; i < 2; i++) {
      const cycle = 3.1 + i * 0.6;
      const phase = (t + i * 1.7) % cycle;
      if (phase > 0.35) continue;
      const splashX = pit.x + (i === 0 ? 12 : pit.width - 12);
      const rise = Math.sin((phase / 0.35) * Math.PI) * 10;
      c.fillStyle = "rgba(255, 190, 90, 0.8)";
      c.fillRect(splashX - cameraX - 2, surfaceTop - rise, 4, 4);
    }

    // Soft ambient glow above the surface.
    c.fillStyle = LAVA_GLOW;
    c.fillRect(screenX, surfaceTop - 14, pit.width, 14);
  }
}

// --- mystery block --------------------------------------------------------
//
// An original glowing energy-core motif --- deliberately not a Mario-style
// question-mark block. Pulses/floats while unused, dims (but stays visible)
// once triggered.

function drawMysteryBlock(state: MysteryBlockState, cameraX: number, elapsedMs: number): void {
  const screenX = state.x - cameraX;
  if (screenX + state.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) return;
  const c = ctx!;
  const t = elapsedMs / 1000;

  // Brief upward bounce right after triggering, then settles.
  const bounce = state.used && state.bounceElapsed < 220 ? -Math.sin((state.bounceElapsed / 220) * Math.PI) * 6 : 0;
  const floatOffset = state.used ? 0 : Math.sin(t * 2.2) * 2;
  const y = state.y + bounce + floatOffset;

  const alpha = state.used ? 0.55 : 1;
  c.globalAlpha = alpha;

  c.fillStyle = "#2a1740";
  c.fillRect(screenX, y, state.width, state.height);

  const pulse = state.used ? 0.4 : 0.6 + Math.sin(t * 4) * 0.4;
  c.fillStyle = `rgba(160, 90, 230, ${0.25 + pulse * 0.25})`;
  c.fillRect(screenX - 3, y - 3, state.width + 6, state.height + 6);

  // Diamond/energy-core motif in cyan/gold/purple.
  const cx = screenX + state.width / 2;
  const cy = y + state.height / 2;
  const r = state.width * 0.32;
  c.fillStyle = "#f4d35e"; // gold outer diamond
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r, cy);
  c.lineTo(cx, cy + r);
  c.lineTo(cx - r, cy);
  c.closePath();
  c.fill();

  c.fillStyle = "#39e6e6"; // cyan core
  const innerR = r * 0.5;
  c.beginPath();
  c.moveTo(cx, cy - innerR);
  c.lineTo(cx + innerR, cy);
  c.lineTo(cx, cy + innerR);
  c.lineTo(cx - innerR, cy);
  c.closePath();
  c.fill();

  c.globalAlpha = 1;
}

// --- destructible bricks ---------------------------------------------------
//
// An energy-brick aesthetic (grid seams, edge highlight, bottom shadow) ---
// deliberately not a copy of Mario's brick texture. Each brick's state is
// fully independent; a destroyed brick is simply not drawn (its fragments
// are rendered as particles).

function drawBricks(bricks: BrickState[], cameraX: number): void {
  const c = ctx!;
  for (const brick of bricks) {
    if (brick.destroyed) continue;
    const screenX = brick.x - cameraX;
    if (screenX + brick.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) continue;

    // Brief upward nudge right after being head-bumped, mirroring the
    // mystery block's bounce so a hit brick reads the same way even though
    // it then breaks instead of settling.
    c.fillStyle = "#5a5266";
    c.fillRect(screenX, brick.y, brick.width, brick.height);
    c.fillStyle = "#8a7fa0"; // top edge highlight
    c.fillRect(screenX, brick.y, brick.width, 3);
    c.fillStyle = "#332d40"; // bottom shadow
    c.fillRect(screenX, brick.y + brick.height - 3, brick.width, 3);

    c.fillStyle = "rgba(0, 0, 0, 0.25)";
    c.fillRect(screenX + brick.width / 2 - 1, brick.y + 3, 2, brick.height - 6);
    c.fillRect(screenX + 3, brick.y + brick.height / 2 - 1, brick.width - 6, 2);
  }
}

// --- hidden platform -------------------------------------------------------
//
// Invisible and non-collidable until the mystery block triggers it, then
// fades from translucent to opaque over HIDDEN_PLATFORM_APPEAR_MS, with a
// handful of pixel motes converging toward it from just above (purely a
// function of appear-progress and particle index --- no state, no
// allocation kept across frames). Its world position never changes --- only
// its opacity --- so the visual and the (separately computed) collision
// rectangle always agree.

function drawHiddenPlatform(state: HiddenPlatformState, cameraX: number, elapsedMs: number): void {
  const progress = hiddenPlatformProgress(state, elapsedMs);
  if (progress <= 0) return;
  const screenX = state.x - cameraX;
  if (screenX + state.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) return;

  const c = ctx!;
  const rise = (1 - progress) * 10; // settles into place from slightly below
  const y = state.y + rise;
  const solid = isHiddenPlatformSolid(state, elapsedMs);

  if (progress < 1) {
    const cx = screenX + state.width / 2;
    const cy = y + state.height / 2;
    const moteCount = 5;
    for (let i = 0; i < moteCount; i++) {
      const targetX = cx + ((i - moteCount / 2) * state.width) / moteCount;
      const startY = cy - 60 - i * 6;
      const my = startY + (cy - startY) * Math.min(1, progress * 1.3);
      const mx = targetX + Math.sin(progress * 8 + i) * (1 - progress) * 10;
      c.globalAlpha = 0.7 * (1 - progress * 0.4);
      c.fillStyle = "#7fd8ff";
      c.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
  }

  c.globalAlpha = 0.25 + progress * 0.75;
  c.fillStyle = solid ? PLATFORM_TOP : "#7fd8ff";
  c.fillRect(screenX, y, state.width, 4);
  c.fillStyle = solid ? PLATFORM_BODY : "#3d8fae";
  c.fillRect(screenX, y + 4, state.width, state.height - 4);
  c.globalAlpha = 1;
}

const PLATFORM_TOP = STONE_LIGHT;
const PLATFORM_BODY = STONE_MID;

// --- enemy ---------------------------------------------------------------
//
// An original ruins-guardian slime --- a squat purple block with a single
// glowing core, deliberately not a Goomba/Creeper likeness. Squashes and
// stretches on a slow idle loop, leans slightly into its direction of
// travel, and its core sits toward whichever way it's facing. Squashes flat
// on a stomp then flickers into pixel fragments. Purely cosmetic (the
// outline/glow never affects the collision box computed in game-core.ts).

function drawEnemy(enemy: EnemyState, cameraX: number, elapsedMs: number): void {
  const c = ctx!;
  const screenX = enemy.x - cameraX;
  if (screenX + enemy.width < -20 || screenX > PHYSICS.CANVAS_WIDTH + 20) return;

  if (!enemy.alive) {
    const age = enemy.stompedAt === null ? 0 : elapsedMs - enemy.stompedAt;
    const squashDuration = 160;
    const fadeDuration = 300;
    if (age > squashDuration + fadeDuration) return; // fully gone, nothing left to draw

    if (age <= squashDuration) {
      const progress = age / squashDuration;
      const h = enemy.height * (1 - progress * 0.75);
      const w = enemy.width * (1 + progress * 0.4);
      const y = enemy.y + enemy.height - h;
      const x = screenX - (w - enemy.width) / 2;
      c.fillStyle = ENEMY_BODY_SHADOW;
      c.fillRect(x, y, w, h);
    } else {
      const progress = (age - squashDuration) / fadeDuration;
      c.globalAlpha = Math.max(0, 1 - progress);
      if (Math.sin(age * 0.09) > 0) {
        c.fillStyle = ENEMY_BODY;
        c.fillRect(screenX, enemy.y + enemy.height * 0.4, enemy.width, enemy.height * 0.6);
      }
      c.globalAlpha = 1;
    }
    return;
  }

  const t = elapsedMs / 1000;
  // Idle squash/stretch cycle: taller-and-thinner <-> shorter-and-wider.
  const cycle = Math.sin(t * 3.2);
  const stretch = 1 + cycle * 0.08;
  const squash = 1 - cycle * 0.08;
  // A slight lean in the direction of travel while patrolling.
  const lean = enemy.direction * 0.06 * Math.min(1, Math.abs(enemy.vx) / 10);

  const cx = screenX + enemy.width / 2;
  const cy = enemy.y + enemy.height;
  c.save();
  c.translate(cx, cy);
  c.transform(1, 0, lean, 1, 0, 0);
  c.scale(stretch, squash);
  c.translate(-enemy.width / 2, -enemy.height);

  c.fillStyle = OUTLINE;
  c.fillRect(-1, -1, enemy.width + 2, enemy.height + 2);

  c.fillStyle = ENEMY_BODY;
  c.fillRect(0, 0, enemy.width, enemy.height);
  c.fillStyle = ENEMY_BODY_HI; // top highlight
  c.fillRect(0, 0, enemy.width, 4);
  c.fillStyle = ENEMY_BODY_SHADOW; // bottom shadow
  c.fillRect(0, enemy.height - 4, enemy.width, 4);

  // A few deterministic darker pixel-texture flecks on the body.
  for (let i = 0; i < 4; i++) {
    const fx = ((i * 11) % (enemy.width - 6)) + 3;
    const fy = ((i * 17) % (enemy.height - 10)) + 6;
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(fx, fy, 3, 3);
  }

  const eyeSize = 9;
  const eyeY = enemy.height * 0.32;
  const eyeX = enemy.direction > 0 ? enemy.width - eyeSize - 4 : 4;
  const pulse = 0.6 + Math.sin(t * 6) * 0.4;
  c.fillStyle = ENEMY_CORE;
  c.globalAlpha = 0.75 + pulse * 0.25;
  c.fillRect(eyeX, eyeY, eyeSize, eyeSize);
  c.globalAlpha = 1;
  c.fillStyle = "#fff2f8";
  c.fillRect(eyeX + eyeSize * 0.3, eyeY + eyeSize * 0.3, eyeSize * 0.3, eyeSize * 0.3);

  c.restore();
}

// --- goal portal -----------------------------------------------------------
//
// An original glowing ruins-exit set in a stone/metal frame, with an
// energy-ring core and an orbiting-particle halo, deliberately not a
// flagpole/castle likeness. The glow/orbit extends well past the actual
// collision body; only touching the solid frame itself triggers WIN
// (checked purely in game-core.ts, independent of this glow). `winAge` is a
// real-wall-clock age (see the module-level winAnimStart), since
// game-core.ts's own elapsedMs freezes the instant WIN is reached.

function drawGoal(goal: Platform, cameraX: number, elapsedMs: number, won: boolean, winAge: number | null): void {
  const c = ctx!;
  const screenX = goal.x - cameraX;
  if (screenX + goal.width < -120 || screenX > PHYSICS.CANVAS_WIDTH + 120) return;

  const t = elapsedMs / 1000;
  const cx = screenX + goal.width / 2;
  const cy = goal.y + goal.height / 2;
  const boost = won ? 1.4 : 1;

  const glowR = (goal.width * 1.4 + Math.sin(t * 3) * 6) * boost;
  const glow = c.createRadialGradient(cx, cy, 4, cx, cy, glowR);
  glow.addColorStop(0, `rgba(140, 230, 255, ${0.55 * boost})`);
  glow.addColorStop(1, "rgba(140, 230, 255, 0)");
  c.fillStyle = glow;
  c.beginPath();
  c.arc(cx, cy, glowR, 0, Math.PI * 2);
  c.fill();

  // Warm ground-level light spill near the base of the frame.
  c.fillStyle = "rgba(120, 220, 255, 0.18)";
  c.fillRect(screenX - 20, goal.y + goal.height - 6, goal.width + 40, 10);

  // Stone/metal frame, matching the collision body.
  c.fillStyle = "#2a2436";
  c.fillRect(screenX, goal.y, goal.width, goal.height);
  c.fillStyle = "#463a5a";
  c.fillRect(screenX, goal.y, 5, goal.height);
  c.fillRect(screenX + goal.width - 5, goal.y, 5, goal.height);
  c.fillStyle = "#1a1626";
  c.fillRect(screenX, goal.y, goal.width, 4);

  // Orbiting particles: converge inward toward the player briefly after WIN.
  for (let i = 0; i < 6; i++) {
    const angle = t * 1.6 + (i / 6) * Math.PI * 2;
    const convergence = won && winAge !== null ? Math.max(0, 1 - winAge / 500) : 1;
    const orbitR = goal.width * 0.9 * convergence;
    const px = cx + Math.cos(angle) * orbitR;
    const py = cy + Math.sin(angle) * orbitR * 0.5;
    c.fillStyle = "rgba(255, 235, 160, 0.85)";
    c.fillRect(px - 2, py - 2, 4, 4);
  }

  const coreAlpha = won ? 1 : 0.85;
  const spinSpeed = won ? 5 : 2;
  const spin = t * spinSpeed;
  for (let ring = 0; ring < 3; ring++) {
    const inset = ring * 6;
    const hue = 190 + ring * 20;
    c.strokeStyle = `hsla(${hue}, 90%, 65%, ${coreAlpha - ring * 0.2})`;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(cx, cy, Math.max(2, goal.width / 2 - inset), Math.max(2, goal.height / 2 - inset), spin + ring, 0, Math.PI * 2);
    c.stroke();
  }

  if (won && winAge !== null) {
    const flash = Math.max(0, 1 - winAge / 600);
    c.fillStyle = `rgba(255, 255, 255, ${flash * 0.8})`;
    c.fillRect(screenX, goal.y, goal.width, goal.height);
  }
}

// --- particles --------------------------------------------------------

function drawParticles(particles: Particle[], cameraX: number, elapsedMs: number): void {
  const c = ctx!;
  for (const particle of particles) {
    const age = (elapsedMs - particle.spawnedAt) / 1000;
    if (age < 0) continue;
    const fade = 1 - (elapsedMs - particle.spawnedAt) / particle.life;
    if (fade <= 0) continue;

    const worldX = particle.x + particle.vx * age;
    const worldY = particle.y + particle.vy * age + 0.5 * 900 * age * age;
    const screenX = worldX - cameraX;

    c.globalAlpha = Math.max(0, fade);
    c.fillStyle = particle.color;
    const size = particle.kind === "spark" ? 3 : 4;
    c.fillRect(screenX - size / 2, worldY - size / 2, size, size);
  }
  c.globalAlpha = 1;
}

// A small deterministic dust puff, used both for footstep taps (age keyed
// off the player's own runCycle, no persisted state) and for the one-off
// landing burst (age keyed off the local landingAnimStart timer). Never
// added to GameState.particles --- purely decorative, self-expiring.
function drawDustBurst(cameraX: number, worldX: number, worldY: number, age: number, life: number, count: number): void {
  const c = ctx!;
  const progress = Math.min(1, age / life);
  const fade = 1 - progress;
  if (fade <= 0) return;
  const screenX = worldX - cameraX;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI - Math.PI / 2 + (i % 2) * 0.3;
    const dist = progress * (8 + (i % 3) * 4);
    const px = screenX + Math.cos(angle) * dist;
    const py = worldY - Math.abs(Math.sin(angle)) * dist * 0.5;
    c.globalAlpha = fade * 0.6;
    c.fillStyle = "#c9b892";
    c.fillRect(px - 1.5, py - 1.5, 3, 3);
  }
  c.globalAlpha = 1;
}

// --- player -----------------------------------------------------------
//
// An original blocky explorer: goggled head, teal jacket, orange scarf,
// separate left/right arms and legs, dark shoes and outline. Visual body is
// sized to PHYSICS.PLAYER_WIDTH/HEIGHT (the actual collision box); only the
// scarf and limbs are allowed to swing a little past that box, never the
// torso/head. Poses are picked from PlayerState for stand/run/jump/fall,
// and from GameState.status (LOSE -> hurt, WIN -> win) for the two
// end-of-run poses --- so once the run stops being PLAYING the character
// never keeps showing a normal running animation.

type RenderPose = Pose | "hurt" | "win";

function renderPoseFor(player: PlayerState, status: GameStatus): RenderPose {
  if (status === "LOSE") return "hurt";
  if (status === "WIN") return "win";
  return poseFor(player);
}

function drawPlayer(state: GameState, cameraX: number, loseAge: number | null, winAge: number | null): void {
  const c = ctx!;
  const player = state.player;
  const pose = renderPoseFor(player, state.status);
  const w = PHYSICS.PLAYER_WIDTH;
  const h = PHYSICS.PLAYER_HEIGHT;
  const screenX = player.x - cameraX;
  const top = player.y - h;

  // Footstep dust: a couple of quick puffs per stride, purely a function of
  // the current runCycle phase (no spawn timestamps needed/stored).
  if (pose === "run" && player.grounded) {
    const phase = player.runCycle % Math.PI;
    if (phase < 0.2) {
      const footAge = (phase / 0.2) * 90;
      drawDustBurst(cameraX, player.x + (player.facingRight ? w * 0.2 : w * 0.8), player.y, footAge, 90, 3);
    }
  }

  c.save();
  c.translate(screenX, top);
  if (!player.facingRight) {
    c.translate(w, 0);
    c.scale(-1, 1);
  }

  if (pose === "hurt") {
    const age = loseAge ?? 0;
    const lean = Math.min(1, age / 250) * -0.28;
    c.translate(w / 2, h);
    c.rotate(lean);
    c.translate(-w / 2, -h);
    if (age < 400 && Math.floor(age / 60) % 2 === 0) {
      c.globalAlpha = 0.7;
    }
  } else if (pose === "win") {
    const age = winAge ?? 0;
    const hop = -Math.abs(Math.sin(Math.min(age / 260, Math.PI))) * 10;
    c.translate(0, hop);
  }

  const swing = pose === "run" ? Math.sin(player.runCycle) : 0;
  const legSwingPx = swing * 7;
  const armSwingPx = -swing * 7; // opposite the same-side leg, like a real stride

  const legTopY = 34;
  const tucked = pose === "jump";
  const legHeight = tucked ? 14 : 20;
  const legY = tucked ? legTopY + 6 : legTopY;

  // Scarf, drawn behind the body, trailing back during motion.
  const scarfTrail =
    pose === "jump" || pose === "fall" ? 10 : pose === "run" ? 6 + Math.sin(player.runCycle) * 3 : pose === "hurt" ? 8 : 3;
  drawRectPart(c, 6 - scarfTrail * 0.6, 12, 10, 6, SCARF_SHADOW, SCARF, SCARF_HI);
  drawRectPart(c, 6 - scarfTrail, 18, 9, 5, SCARF_SHADOW, SCARF, SCARF_HI);

  // Back arm/leg (drawn first so the front ones overlap them, giving a
  // sense of depth without any extra geometry).
  drawLimbs(c, w, legTopY, legY, legHeight, legSwingPx, armSwingPx, pose, true);

  // Torso/jacket.
  drawRectPart(c, 8, 14, 20, 22, JACKET_SHADOW, JACKET, JACKET_HI);

  // Front arm/leg.
  drawLimbs(c, w, legTopY, legY, legHeight, legSwingPx, armSwingPx, pose, false);

  if (pose === "win") {
    // One arm raised straight up in celebration, replacing the normal arm.
    drawRectPart(c, w - 9, -6, 7, 20, JACKET_SHADOW, JACKET, JACKET_HI);
    drawRectPart(c, w - 8, -10, 5, 6, SKIN_SHADOW, SKIN, SKIN);
  }

  // Head.
  drawRectPart(c, 9, -1, 18, 15, HAIR, SKIN, SKIN);
  c.fillStyle = HAIR;
  c.fillRect(9, -1, 18, 4);
  c.fillStyle = SKIN_SHADOW;
  c.fillRect(9 + 12, 4, 5, 9); // simple face-side shadow

  // Goggle band across the eyes, with two glass panes.
  c.fillStyle = GOGGLE;
  c.fillRect(9, 4, 18, 6);
  c.fillStyle = GOGGLE_GLASS;
  c.fillRect(11, 5, 5, 4);
  c.fillRect(20, 5, 5, 4);
  c.fillStyle = "#123";
  c.fillRect(12, 6, 2, 2);
  c.fillRect(21, 6, 2, 2);

  c.restore();
}

// Draws one rectangular body part with a top highlight strip, bottom
// shadow strip, and a dark outline drawn just behind it --- the "main +
// highlight + shadow + dark edge" treatment applied consistently across
// the major parts (head, torso, legs, arms).
function drawRectPart(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  outline: string,
  main: string,
  highlight: string,
): void {
  c.fillStyle = OUTLINE;
  c.fillRect(x - 1, y - 1, width + 2, height + 2);
  c.fillStyle = main;
  c.fillRect(x, y, width, height);
  c.fillStyle = highlight;
  c.fillRect(x, y, width, Math.max(1, height * 0.18));
  c.fillStyle = outline;
  c.fillRect(x, y + height - Math.max(1, height * 0.15), width, Math.max(1, height * 0.15));
}

function drawLimbs(
  c: CanvasRenderingContext2D,
  w: number,
  legTopY: number,
  legY: number,
  legHeight: number,
  legSwingPx: number,
  armSwingPx: number,
  pose: RenderPose,
  back: boolean,
): void {
  const side = back ? -1 : 1; // stagger the "back" limb slightly for depth
  if (pose === "fall") {
    drawRectPart(c, 2 + side, legTopY, 9, 20, PANTS, PANTS, PANTS_HI);
    drawRectPart(c, w - 11 - side, legTopY, 9, 20, PANTS, PANTS, PANTS_HI);
  } else if (pose === "hurt") {
    drawRectPart(c, 4 + side, legTopY + 2, 9, 18, PANTS, PANTS, PANTS_HI);
    drawRectPart(c, w - 13 - side, legTopY + 2, 9, 18, PANTS, PANTS, PANTS_HI);
  } else {
    drawRectPart(c, 6 + legSwingPx + side, legY, 8, legHeight, PANTS, PANTS, PANTS_HI);
    drawRectPart(c, w - 14 - legSwingPx - side, legY, 8, legHeight, PANTS, PANTS, PANTS_HI);
  }
  // Shoes.
  c.fillStyle = SHOE;
  if (pose !== "fall" && pose !== "hurt") {
    c.fillRect(5 + legSwingPx + side, legY + legHeight - 5, 9, 5);
    c.fillRect(w - 15 - legSwingPx - side, legY + legHeight - 5, 9, 5);
  }

  if (pose === "jump") {
    drawRectPart(c, 1 + side, 6, 7, 18, JACKET_SHADOW, JACKET, JACKET_HI);
    drawRectPart(c, w - 8 - side, 6, 7, 18, JACKET_SHADOW, JACKET, JACKET_HI);
  } else if (pose === "fall") {
    drawRectPart(c, -2 + side, 16, 9, 16, JACKET_SHADOW, JACKET, JACKET_HI);
    drawRectPart(c, w - 7 - side, 16, 9, 16, JACKET_SHADOW, JACKET, JACKET_HI);
  } else if (pose === "hurt") {
    drawRectPart(c, -3 + side, 10, 8, 16, JACKET_SHADOW, JACKET, JACKET_HI);
    drawRectPart(c, w - 5 - side, 10, 8, 16, JACKET_SHADOW, JACKET, JACKET_HI);
  } else if (pose !== "win") {
    drawRectPart(c, 1 + armSwingPx + side, 16, 7, 18, JACKET_SHADOW, JACKET, JACKET_HI);
    drawRectPart(c, w - 8 - armSwingPx - side, 16, 7, 18, JACKET_SHADOW, JACKET, JACKET_HI);
  } else {
    // win pose: only the non-raised arm drawn here; the raised arm is drawn
    // separately in drawPlayer after the head so it reads clearly on top.
    drawRectPart(c, 1 + side, 18, 7, 16, JACKET_SHADOW, JACKET, JACKET_HI);
  }
}

// --- HUD ----------------------------------------------------------------
//
// No tutorial/instruction text anywhere --- just an original title, a
// concise level-progress readout derived from the player's own world x
// against fixed landmarks already in LEVEL, and the current status. All
// drawn directly on canvas so it scales with the game frame.

const HUD_LANDMARKS = [
  LEVEL.pits[0].x + LEVEL.pits[0].width, // past the lava
  LEVEL.enemy.patrolMaxX, // past the guardian
  LEVEL.goal.x, // at the portal
];

function drawHud(state: GameState, _cameraX: number): void {
  const c = ctx!;
  c.save();
  c.font = "bold 14px monospace";
  c.textBaseline = "top";
  c.fillStyle = "rgba(0, 0, 0, 0.35)";
  c.fillRect(10, 10, 150, 20);
  c.fillStyle = "#fdf6e3";
  c.fillText("PIXEL RUINS", 16, 14);

  const dotsX = 10;
  const dotsY = 34;
  for (let i = 0; i < HUD_LANDMARKS.length; i++) {
    const reached = state.player.x >= HUD_LANDMARKS[i] || state.status === "WIN";
    c.fillStyle = reached ? "#8fe8ff" : "rgba(255,255,255,0.35)";
    c.beginPath();
    c.arc(dotsX + i * 14 + 5, dotsY + 5, 4, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
