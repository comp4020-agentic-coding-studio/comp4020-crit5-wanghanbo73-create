// Pure player/world/camera rules --- no Canvas, no DOM, so it can be unit
// tested directly. game.ts is the only thing that touches rendering/input.

export const PHYSICS = {
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 540,
  GROUND_HEIGHT: 80,
  PLAYER_WIDTH: 36,
  PLAYER_HEIGHT: 56,
  MOVE_SPEED: 220, // px/s
  GRAVITY: 1800, // px/s^2
  MAX_FALL_SPEED: 900, // px/s
  JUMP_INITIAL_VELOCITY: -560, // px/s, upward
  JUMP_HOLD_FORCE: 1700, // extra upward px/s^2 while the jump key is held
  JUMP_HOLD_WINDOW_MS: 200, // how long holding keeps adding force
  MAX_DELTA_TIME: 1 / 30, // clamp so a stalled tab can't teleport the player
} as const;

// A little slack so equality checks at exact boundaries don't misfire on
// floating point noise (e.g. a player resting exactly on a platform's top).
const EPS = 0.01;

// --- world & level ------------------------------------------------------

export const WORLD_WIDTH = 3600;

// Feet position when standing on ground-height terrain.
export const GROUND_Y = PHYSICS.CANVAS_HEIGHT - PHYSICS.GROUND_HEIGHT;

// Comfortably below the canvas --- once the player's feet cross this world Y,
// they've fallen out of the level entirely. Kept as a backstop even though
// the lava trench now kills the player well before this height is reached.
export const DEATH_Y = PHYSICS.CANVAS_HEIGHT + 200;

// The lava's hazard surface sits a little below true ground level, so the
// visual "you touched it" moment lines up with the danger zone.
export const LAVA_SURFACE_OFFSET = 8;

// How long the hidden platform takes to fade from invisible to fully solid
// once the mystery block triggers it.
export const HIDDEN_PLATFORM_APPEAR_MS = 500;

export interface Platform {
  x: number; // world x, left edge
  y: number; // world y, top surface
  width: number;
  height: number; // visual + collision depth
}

export interface PitRegion {
  x: number;
  width: number;
  // World y of the lava's hazard surface --- independent of platform
  // collision, checked separately so lava can never be stood/bounced on.
  surfaceY: number;
}

export interface MysteryBlockState extends Platform {
  used: boolean;
  // ms since the trigger frame; drives the brief bounce animation and then
  // just keeps counting up (rendering clamps the visible bounce window).
  bounceElapsed: number;
}

export interface BrickState extends Platform {
  id: number;
  destroyed: boolean;
  // Absolute GameState.elapsedMs at the moment of destruction, or null while
  // intact --- rendering uses this to animate the shatter once, then stops
  // drawing the brick at all.
  destroyedAt: number | null;
}

export interface HiddenPlatformState extends Platform {
  // Absolute GameState.elapsedMs when the mystery block triggered it, or
  // null if it has never been triggered (fully invisible, non-collidable).
  triggeredAt: number | null;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnedAt: number; // absolute GameState.elapsedMs
  life: number; // ms
  kind: "spark" | "fragment";
}

export interface Level {
  worldWidth: number;
  platforms: Platform[];
  pits: PitRegion[];
  spawn: { x: number; y: number };
  mysteryBlock: Platform;
  bricks: Platform[];
  hiddenPlatform: Platform;
}

// Layout, left to right: safe start, an original mystery block (hittable
// from below with a normal jump), three independently-destructible bricks,
// a lava trench sized so a full-hold jump clears it fairly, a safe landing
// stretch, then space reserved for a later stage's enemies/high platforms
// and eventual goal. The mystery block, bricks and hidden platform all float
// above the continuous ground, so the lower route (just run and long-jump
// the lava) always exists no matter what happens to them.
function buildLevel(): Level {
  const mysteryBlock: Platform = { x: 460, y: GROUND_Y - 160, width: 40, height: 30 };

  const brickWidth = 40;
  const brickGap = 10;
  const brickY = GROUND_Y - 60; // same height as the old "low, small-hop" platform
  const brickHeight = 20;
  const brickStartX = 650;
  const bricks: Platform[] = [0, 1, 2].map((i) => ({
    x: brickStartX + i * (brickWidth + brickGap),
    y: brickY,
    width: brickWidth,
    height: brickHeight,
  }));
  const bricksEndX = bricks[bricks.length - 1].x + brickWidth;

  const pitStart = 920;
  const pitWidth = 190; // clears a full-hold jump (~216px) with margin; a
  // short hop (~136px) falls well short, so it can't be cheesed.
  const pitEnd = pitStart + pitWidth;

  // Bridges from just past the last brick, all the way across the lava, to a
  // safe margin on the far side --- the "upper route" once it's triggered.
  const hiddenPlatformStartX = bricksEndX + 10;
  const hiddenPlatform: Platform = {
    x: hiddenPlatformStartX,
    y: brickY,
    width: pitEnd + 40 - hiddenPlatformStartX,
    height: brickHeight,
  };

  const platforms: Platform[] = [
    { x: 0, y: GROUND_Y, width: pitStart, height: PHYSICS.GROUND_HEIGHT },
    { x: pitEnd, y: GROUND_Y, width: WORLD_WIDTH - pitEnd, height: PHYSICS.GROUND_HEIGHT },
  ];

  return {
    worldWidth: WORLD_WIDTH,
    platforms,
    pits: [{ x: pitStart, width: pitWidth, surfaceY: GROUND_Y + LAVA_SURFACE_OFFSET }],
    spawn: { x: 100, y: GROUND_Y },
    mysteryBlock,
    bricks,
    hiddenPlatform,
  };
}

export const LEVEL: Level = buildLevel();

// --- player ---------------------------------------------------------------

export interface PlayerState {
  x: number; // world x, left edge of the player's bounding box
  y: number; // world y, feet position (ground/platform contact point)
  vx: number;
  vy: number;
  grounded: boolean;
  jumping: boolean; // still within the variable-height window
  jumpHoldTime: number; // ms the jump key has been held since takeoff
  facingRight: boolean;
  runCycle: number; // radians, drives the limb-swing animation
}

export interface InputState {
  left: boolean;
  right: boolean;
  /** True only on the frame the jump key transitions from up to down. */
  jumpPressed: boolean;
  /** True for every frame the jump key is held down. */
  jumpHeld: boolean;
}

export const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpPressed: false,
  jumpHeld: false,
};

export function createInitialPlayerState(level: Level = LEVEL): PlayerState {
  return {
    x: level.spawn.x,
    y: level.spawn.y,
    vx: 0,
    vy: 0,
    grounded: true,
    jumping: false,
    jumpHoldTime: 0,
    facingRight: true,
    runCycle: 0,
  };
}

export function createInitialMysteryBlockState(level: Level = LEVEL): MysteryBlockState {
  return { ...level.mysteryBlock, used: false, bounceElapsed: 0 };
}

export function createInitialBrickStates(level: Level = LEVEL): BrickState[] {
  return level.bricks.map((brick, id) => ({ ...brick, id, destroyed: false, destroyedAt: null }));
}

export function createInitialHiddenPlatformState(level: Level = LEVEL): HiddenPlatformState {
  return { ...level.hiddenPlatform, triggeredAt: null };
}

export function hiddenPlatformProgress(state: HiddenPlatformState, elapsedMs: number): number {
  if (state.triggeredAt === null) return 0;
  return Math.min(1, (elapsedMs - state.triggeredAt) / HIDDEN_PLATFORM_APPEAR_MS);
}

export function isHiddenPlatformSolid(state: HiddenPlatformState, elapsedMs: number): boolean {
  return state.triggeredAt !== null && elapsedMs - state.triggeredAt >= HIDDEN_PLATFORM_APPEAR_MS;
}

export function clampDeltaTime(dt: number): number {
  return Math.min(Math.max(dt, 0), PHYSICS.MAX_DELTA_TIME);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function overlaps(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMax > bMin + EPS && aMin < bMax - EPS;
}

/** Advances the player one frame against a level's platforms. Returns a new
 * state; never mutates the input. Horizontal and vertical motion are moved
 * and collision-resolved as separate steps (X against the player's
 * pre-frame Y, then Y against the already-resolved X) so a corner can't
 * snag the player on the wrong axis. */
export function updatePlayer(
  state: PlayerState,
  input: InputState,
  rawDt: number,
  level: Level = LEVEL,
): PlayerState {
  const dt = clampDeltaTime(rawDt);
  const next: PlayerState = { ...state };

  let vx = 0;
  if (input.left) vx -= PHYSICS.MOVE_SPEED;
  if (input.right) vx += PHYSICS.MOVE_SPEED;
  next.vx = vx;
  if (vx !== 0) next.facingRight = vx > 0;

  // --- horizontal move + resolve, using the player's *previous* Y so a
  // platform they're already standing on never registers as a wall.
  const prevTop = state.y - PHYSICS.PLAYER_HEIGHT;
  const prevBottom = state.y;
  next.x = clamp(state.x + vx * dt, 0, level.worldWidth - PHYSICS.PLAYER_WIDTH);

  if (vx !== 0) {
    for (const platform of level.platforms) {
      if (!overlaps(prevTop, prevBottom, platform.y, platform.y + platform.height)) continue;
      const left = next.x;
      const right = next.x + PHYSICS.PLAYER_WIDTH;
      if (!overlaps(left, right, platform.x, platform.x + platform.width)) continue;
      if (vx > 0) next.x = platform.x - PHYSICS.PLAYER_WIDTH;
      else next.x = platform.x + platform.width;
      next.vx = 0;
    }
  }

  // --- jump takeoff & variable-height hold (unchanged from stage 1) -----
  if (input.jumpPressed && state.grounded) {
    next.vy = PHYSICS.JUMP_INITIAL_VELOCITY;
    next.grounded = false;
    next.jumping = true;
    next.jumpHoldTime = 0;
  }

  if (next.jumping) {
    if (input.jumpHeld && next.jumpHoldTime < PHYSICS.JUMP_HOLD_WINDOW_MS) {
      next.vy -= PHYSICS.JUMP_HOLD_FORCE * dt;
      next.jumpHoldTime += dt * 1000;
    } else {
      next.jumping = false;
    }
  }

  next.vy = Math.min(next.vy + PHYSICS.GRAVITY * dt, PHYSICS.MAX_FALL_SPEED);

  // --- vertical move + resolve, against the already-resolved X ----------
  next.y = state.y + next.vy * dt;
  next.grounded = false;

  const left = next.x;
  const right = next.x + PHYSICS.PLAYER_WIDTH;
  for (const platform of level.platforms) {
    if (!overlaps(left, right, platform.x, platform.x + platform.width)) continue;
    const platformTop = platform.y;
    const platformBottom = platform.y + platform.height;

    if (next.vy >= 0 && prevBottom <= platformTop + EPS && next.y >= platformTop) {
      next.y = platformTop;
      next.vy = 0;
      next.grounded = true;
      next.jumping = false;
    } else if (next.vy < 0 && prevTop >= platformBottom - EPS && next.y - PHYSICS.PLAYER_HEIGHT <= platformBottom) {
      next.y = platformBottom + PHYSICS.PLAYER_HEIGHT;
      next.vy = 0;
      next.jumping = false;
    }
  }

  if (next.grounded && next.vx !== 0) {
    next.runCycle = (next.runCycle + dt * 10) % (Math.PI * 2);
  } else if (next.grounded) {
    next.runCycle = 0;
  }

  return next;
}

export type Pose = "stand" | "run" | "jump" | "fall";

export function poseFor(state: PlayerState): Pose {
  if (!state.grounded) return state.vy < 0 ? "jump" : "fall";
  return state.vx !== 0 ? "run" : "stand";
}

// --- camera -----------------------------------------------------------

// Once the player crosses this fraction of the screen, the camera starts
// following so they stay roughly here (comfortably inside the 35-45% band).
const CAMERA_FOLLOW_SCREEN_X = 0.4;
const CAMERA_SMOOTH_RATE = 6; // higher = camera catches up faster

export function maxCameraX(level: Level = LEVEL): number {
  return Math.max(0, level.worldWidth - PHYSICS.CANVAS_WIDTH);
}

/** Smoothly eases cameraX toward keeping the player at ~40% of the screen,
 * clamped to the level bounds. Pure function of world state --- it never
 * feeds back into player physics or collision. */
export function updateCamera(
  cameraX: number,
  playerX: number,
  rawDt: number,
  level: Level = LEVEL,
): number {
  const dt = clampDeltaTime(rawDt);
  const limit = maxCameraX(level);
  const desired = clamp(playerX - PHYSICS.CANVAS_WIDTH * CAMERA_FOLLOW_SCREEN_X, 0, limit);
  const smoothing = 1 - Math.exp(-CAMERA_SMOOTH_RATE * dt);
  return clamp(cameraX + (desired - cameraX) * smoothing, 0, limit);
}

// --- interactive blocks: trigger detection ------------------------------

/** True exactly when, moving from `prev` to `next`, the player's head bumped
 * this frame against the underside of `rect` --- i.e. the player was below
 * it last frame, is moving upward, and this frame's vertical collision
 * resolve snapped their head to the rect's underside. Pure position
 * comparison (no reliance on a not-yet-zeroed velocity), so it works
 * whether `rect` came from a generic platform pass or a dedicated one. */
function headHitUnderside(prev: PlayerState, next: PlayerState, rect: Platform): boolean {
  const rectBottom = rect.y + rect.height;
  const prevHeadY = prev.y - PHYSICS.PLAYER_HEIGHT;
  const nextHeadY = next.y - PHYSICS.PLAYER_HEIGHT;

  const movingUp = nextHeadY < prevHeadY - EPS;
  const wasBelow = prevHeadY >= rectBottom - EPS;
  const snappedToUnderside = Math.abs(nextHeadY - rectBottom) < 1;

  const left = next.x;
  const right = next.x + PHYSICS.PLAYER_WIDTH;
  const horizontallyAligned = overlaps(left, right, rect.x, rect.x + rect.width);

  return movingUp && wasBelow && snappedToUnderside && horizontallyAligned;
}

function spawnBurst(
  rect: Platform,
  elapsedMs: number,
  count: number,
  kind: Particle["kind"],
  speed: number,
  phase: number,
): Particle[] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + phase;
    out.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - speed * 0.5,
      spawnedAt: elapsedMs,
      life: kind === "spark" ? 500 : 400,
      kind,
    });
  }
  return out;
}

// --- overall game state -------------------------------------------------

export type GameStatus = "PLAYING" | "LOSE";

export interface GameState {
  player: PlayerState;
  cameraX: number;
  status: GameStatus;
  elapsedMs: number;
  mysteryBlock: MysteryBlockState;
  bricks: BrickState[];
  hiddenPlatform: HiddenPlatformState;
  particles: Particle[];
}

export function createInitialGameState(level: Level = LEVEL): GameState {
  return {
    player: createInitialPlayerState(level),
    cameraX: 0,
    status: "PLAYING",
    elapsedMs: 0,
    mysteryBlock: createInitialMysteryBlockState(level),
    bricks: createInitialBrickStates(level),
    hiddenPlatform: createInitialHiddenPlatformState(level),
    particles: [],
  };
}

/** Advances the whole game one frame. Once status is LOSE, input and physics
 * both freeze --- restart is the only way out (see createInitialGameState). */
export function updateGame(
  state: GameState,
  input: InputState,
  rawDt: number,
  level: Level = LEVEL,
): GameState {
  if (state.status === "LOSE") return state;

  const dt = clampDeltaTime(rawDt);
  const elapsedMs = state.elapsedMs + dt * 1000;

  // Build this frame's collidables from state *as it was going in* --- the
  // mystery block is always solid, bricks still standing collide, the
  // hidden platform only collides once its appear animation has finished.
  const activeBricks = state.bricks.filter((brick) => !brick.destroyed);
  const hiddenSolid = isHiddenPlatformSolid(state.hiddenPlatform, state.elapsedMs);
  const effectiveLevel: Level = {
    ...level,
    platforms: [
      ...level.platforms,
      state.mysteryBlock,
      ...activeBricks,
      ...(hiddenSolid ? [state.hiddenPlatform] : []),
    ],
  };

  const player = updatePlayer(state.player, input, dt, effectiveLevel);

  let mysteryBlock = state.mysteryBlock;
  let hiddenPlatform = state.hiddenPlatform;
  let particles = state.particles;

  if (!mysteryBlock.used && headHitUnderside(state.player, player, mysteryBlock)) {
    mysteryBlock = { ...mysteryBlock, used: true, bounceElapsed: 0 };
    hiddenPlatform = { ...hiddenPlatform, triggeredAt: elapsedMs };
    particles = [...particles, ...spawnBurst(mysteryBlock, elapsedMs, 6, "spark", 90, 0)];
  } else if (mysteryBlock.used) {
    mysteryBlock = { ...mysteryBlock, bounceElapsed: mysteryBlock.bounceElapsed + dt * 1000 };
  }

  let bricks = state.bricks;
  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];
    if (!brick.destroyed && headHitUnderside(state.player, player, brick)) {
      bricks = bricks.map((existing, idx) =>
        idx === i ? { ...existing, destroyed: true, destroyedAt: elapsedMs } : existing,
      );
      particles = [...particles, ...spawnBurst(brick, elapsedMs, 4, "fragment", 70, Math.PI / 4)];
    }
  }

  particles = particles.filter((particle) => elapsedMs - particle.spawnedAt < particle.life);

  const cameraX = updateCamera(state.cameraX, player.x, dt, level);

  const touchingLava = level.pits.some((pit) => {
    const overlapsX = overlaps(player.x, player.x + PHYSICS.PLAYER_WIDTH, pit.x, pit.x + pit.width);
    return overlapsX && player.y >= pit.surfaceY;
  });

  const status: GameStatus = player.y > DEATH_Y || touchingLava ? "LOSE" : "PLAYING";

  return { player, cameraX, status, elapsedMs, mysteryBlock, bricks, hiddenPlatform, particles };
}
