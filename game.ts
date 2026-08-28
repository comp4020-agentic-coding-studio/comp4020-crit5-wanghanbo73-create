// Rendering, input, and the animation loop. All physics/world/camera rules
// live in game-core.ts --- this file only draws frames and translates key
// events / clicks into calls against that pure model.
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
  type HiddenPlatformState,
  type InputState,
  type MysteryBlockState,
  type Particle,
  type Platform,
  type PlayerState,
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

function restart(): void {
  game = createInitialGameState();
  keys.left = false;
  keys.right = false;
  keys.jumpHeld = false;
  jumpPressedEdge = false;
  lastTime = null;
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

  game = updateGame(game, input, dt);
  loseOverlay!.hidden = game.status !== "LOSE";
  winOverlay!.hidden = game.status !== "WIN";
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
  drawGoal(LEVEL.goal, cameraX, state.elapsedMs, state.status === "WIN", state.winAt);
  drawLava(cameraX, state.elapsedMs);
  drawBricks(state.bricks, cameraX);
  drawHiddenPlatform(state.hiddenPlatform, cameraX, state.elapsedMs);
  drawMysteryBlock(state.mysteryBlock, cameraX, state.elapsedMs);
  drawEnemy(state.enemy, cameraX, state.elapsedMs);
  drawParallaxLayer(NEAR_LAYER, NEAR_FACTOR, cameraX, "#3f7a2e"); // foreground grass tufts
  drawPlayer(state.player, cameraX);
  drawParticles(state.particles, cameraX, state.elapsedMs);
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
// fades from translucent to opaque over HIDDEN_PLATFORM_APPEAR_MS. Its
// world position never changes --- only its opacity --- so the visual and
// the (separately computed) collision rectangle always agree.

function drawHiddenPlatform(state: HiddenPlatformState, cameraX: number, elapsedMs: number): void {
  const progress = hiddenPlatformProgress(state, elapsedMs);
  if (progress <= 0) return;
  const screenX = state.x - cameraX;
  if (screenX + state.width < 0 || screenX > PHYSICS.CANVAS_WIDTH) return;

  const c = ctx!;
  const rise = (1 - progress) * 10; // settles into place from slightly below
  const y = state.y + rise;
  const solid = isHiddenPlatformSolid(state, elapsedMs);

  c.globalAlpha = 0.25 + progress * 0.75;
  c.fillStyle = solid ? PLATFORM_TOP : "#7fd8ff";
  c.fillRect(screenX, y, state.width, 4);
  c.fillStyle = solid ? PLATFORM_BODY : "#3d8fae";
  c.fillRect(screenX, y + 4, state.width, state.height - 4);
  c.globalAlpha = 1;
}

// --- enemy ---------------------------------------------------------------
//
// An original ruins-guardian silhouette --- a squat stone block with a
// single glowing eye, deliberately not a Goomba/Creeper likeness. Bobs
// gently while patrolling, the eye sits toward whichever way it's facing,
// and it squashes flat then flickers away once stomped. Purely cosmetic
// (the outline/glow never affects the collision box computed in
// game-core.ts).

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
      c.fillStyle = "#4a4658";
      c.fillRect(x, y, w, h);
    } else {
      const progress = (age - squashDuration) / fadeDuration;
      c.globalAlpha = Math.max(0, 1 - progress);
      if (Math.sin(age * 0.09) > 0) {
        c.fillStyle = "#4a4658";
        c.fillRect(screenX, enemy.y + enemy.height * 0.4, enemy.width, enemy.height * 0.6);
      }
      c.globalAlpha = 1;
    }
    return;
  }

  const t = elapsedMs / 1000;
  const bob = Math.sin(t * 5) * 2;
  const y = enemy.y + bob;

  c.fillStyle = "#1c1a24"; // dark outline
  c.fillRect(screenX - 1, y - 1, enemy.width + 2, enemy.height + 2);

  c.fillStyle = "#5a5568"; // body
  c.fillRect(screenX, y, enemy.width, enemy.height);
  c.fillStyle = "#726c85"; // top highlight
  c.fillRect(screenX, y, enemy.width, 4);
  c.fillStyle = "#332f3d"; // bottom shadow
  c.fillRect(screenX, y + enemy.height - 4, enemy.width, 4);

  const eyeSize = 8;
  const eyeY = y + enemy.height * 0.35;
  const eyeX = enemy.direction > 0 ? screenX + enemy.width - eyeSize - 4 : screenX + 4;
  const pulse = 0.6 + Math.sin(t * 6) * 0.4;
  c.fillStyle = `rgba(230, 60, 70, ${0.7 + pulse * 0.3})`;
  c.fillRect(eyeX, eyeY, eyeSize, eyeSize);
  c.fillStyle = "#fff2c8";
  c.fillRect(eyeX + eyeSize * 0.3, eyeY + eyeSize * 0.3, eyeSize * 0.3, eyeSize * 0.3);
}

// --- goal portal -----------------------------------------------------------
//
// An original glowing ruins-exit --- an energy ring with an orbiting-particle
// halo, deliberately not a flagpole/castle likeness. The glow/orbit extends
// well past the actual collision body; only touching the solid frame itself
// triggers WIN (checked purely in game-core.ts, independent of this glow).

function drawGoal(goal: Platform, cameraX: number, elapsedMs: number, won: boolean, winAt: number | null): void {
  const c = ctx!;
  const screenX = goal.x - cameraX;
  if (screenX + goal.width < -120 || screenX > PHYSICS.CANVAS_WIDTH + 120) return;

  const t = elapsedMs / 1000;
  const cx = screenX + goal.width / 2;
  const cy = goal.y + goal.height / 2;

  const glowR = goal.width * 1.4 + Math.sin(t * 3) * 6;
  const glow = c.createRadialGradient(cx, cy, 4, cx, cy, glowR);
  glow.addColorStop(0, "rgba(140, 230, 255, 0.55)");
  glow.addColorStop(1, "rgba(140, 230, 255, 0)");
  c.fillStyle = glow;
  c.beginPath();
  c.arc(cx, cy, glowR, 0, Math.PI * 2);
  c.fill();

  for (let i = 0; i < 6; i++) {
    const angle = t * 1.6 + (i / 6) * Math.PI * 2;
    const orbitR = goal.width * 0.9;
    const px = cx + Math.cos(angle) * orbitR;
    const py = cy + Math.sin(angle) * orbitR * 0.5;
    c.fillStyle = "rgba(255, 235, 160, 0.85)";
    c.fillRect(px - 2, py - 2, 4, 4);
  }

  c.fillStyle = "#241733"; // portal frame, roughly matching the collision body
  c.fillRect(screenX, goal.y, goal.width, goal.height);

  const coreAlpha = won ? 1 : 0.85;
  const spin = t * 2;
  for (let ring = 0; ring < 3; ring++) {
    const inset = ring * 6;
    const hue = 190 + ring * 20;
    c.strokeStyle = `hsla(${hue}, 90%, 65%, ${coreAlpha - ring * 0.2})`;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(cx, cy, Math.max(2, goal.width / 2 - inset), Math.max(2, goal.height / 2 - inset), spin + ring, 0, Math.PI * 2);
    c.stroke();
  }

  if (won && winAt !== null) {
    const age = elapsedMs - winAt;
    const flash = Math.max(0, 1 - age / 600);
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
    c.fillStyle = particle.kind === "spark" ? "#7fe8ff" : "#8a7fa0";
    const size = particle.kind === "spark" ? 3 : 4;
    c.fillRect(screenX - size / 2, worldY - size / 2, size, size);
  }
  c.globalAlpha = 1;
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
