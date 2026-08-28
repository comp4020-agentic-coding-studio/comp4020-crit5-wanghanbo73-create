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
// they've fallen out of the level entirely (a pit, not a stumble).
export const DEATH_Y = PHYSICS.CANVAS_HEIGHT + 200;

export interface Platform {
  x: number; // world x, left edge
  y: number; // world y, top surface
  width: number;
  height: number; // visual + collision depth
}

export interface PitRegion {
  x: number;
  width: number;
}

export interface Level {
  worldWidth: number;
  platforms: Platform[];
  pits: PitRegion[];
  spawn: { x: number; y: number };
}

// Layout, left to right: start/practice run, a reserved stretch for next
// stage's mystery blocks, three test platforms (low/medium/a tall one that
// only a full-hold jump can reach), a reserved enemy-patrol stretch, the
// pit, a safe landing stretch reserved for future tall platforms, and a
// reserved goal stretch. Only the ground, the pit, and the three platforms
// are built this stage --- the rest is just space held open.
function buildLevel(): Level {
  const pitStart = 2200;
  const pitWidth = 190; // clears a full-hold jump (~216px) with margin; a
  // short hop (~136px) falls well short, so it can't be cheesed.
  const pitEnd = pitStart + pitWidth;

  const platforms: Platform[] = [
    { x: 0, y: GROUND_Y, width: pitStart, height: PHYSICS.GROUND_HEIGHT },
    { x: pitEnd, y: GROUND_Y, width: WORLD_WIDTH - pitEnd, height: PHYSICS.GROUND_HEIGHT },
    { x: 1000, y: GROUND_Y - 60, width: 150, height: 20 }, // low
    { x: 1300, y: GROUND_Y - 130, width: 150, height: 20 }, // medium
    { x: 1650, y: GROUND_Y - 170, width: 150, height: 20 }, // tall --- needs a full-hold jump
  ];

  return {
    worldWidth: WORLD_WIDTH,
    platforms,
    pits: [{ x: pitStart, width: pitWidth }],
    spawn: { x: 100, y: GROUND_Y },
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

// --- overall game state -------------------------------------------------

export type GameStatus = "PLAYING" | "LOSE";

export interface GameState {
  player: PlayerState;
  cameraX: number;
  status: GameStatus;
}

export function createInitialGameState(level: Level = LEVEL): GameState {
  return {
    player: createInitialPlayerState(level),
    cameraX: 0,
    status: "PLAYING",
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
  const player = updatePlayer(state.player, input, dt, level);
  const cameraX = updateCamera(state.cameraX, player.x, dt, level);
  const status: GameStatus = player.y > DEATH_Y ? "LOSE" : "PLAYING";

  return { player, cameraX, status };
}
