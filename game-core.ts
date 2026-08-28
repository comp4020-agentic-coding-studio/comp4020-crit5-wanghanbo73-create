// Pure player physics and rules --- no Canvas, no DOM, so it can be unit
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

// Feet position when standing on the ground.
export const GROUND_Y = PHYSICS.CANVAS_HEIGHT - PHYSICS.GROUND_HEIGHT;

export interface PlayerState {
  x: number; // left edge of the player's bounding box
  y: number; // feet position (ground contact point)
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

export function createInitialPlayerState(): PlayerState {
  return {
    x: 100,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    grounded: true,
    jumping: false,
    jumpHoldTime: 0,
    facingRight: true,
    runCycle: 0,
  };
}

export const NO_INPUT: InputState = {
  left: false,
  right: false,
  jumpPressed: false,
  jumpHeld: false,
};

export function clampDeltaTime(dt: number): number {
  return Math.min(Math.max(dt, 0), PHYSICS.MAX_DELTA_TIME);
}

/** Advances the player one frame. Returns a new state; never mutates the input. */
export function updatePlayer(state: PlayerState, input: InputState, rawDt: number): PlayerState {
  const dt = clampDeltaTime(rawDt);
  const next: PlayerState = { ...state };

  let vx = 0;
  if (input.left) vx -= PHYSICS.MOVE_SPEED;
  if (input.right) vx += PHYSICS.MOVE_SPEED;
  next.vx = vx;
  if (vx !== 0) next.facingRight = vx > 0;

  const minX = 0;
  const maxX = PHYSICS.CANVAS_WIDTH - PHYSICS.PLAYER_WIDTH;
  next.x = Math.min(Math.max(next.x + vx * dt, minX), maxX);

  // Jump takeoff: only from the ground, only on the key-down edge, so holding
  // the key or mashing it mid-air can never trigger another launch.
  if (input.jumpPressed && state.grounded) {
    next.vy = PHYSICS.JUMP_INITIAL_VELOCITY;
    next.grounded = false;
    next.jumping = true;
    next.jumpHoldTime = 0;
  }

  // Variable jump height: extra upward force applies only while still inside
  // the short takeoff window AND the key is still held. Releasing early ends
  // it immediately (small jump); the window itself caps how much holding can
  // add, so mashing/holding longer can't produce unbounded height.
  if (next.jumping) {
    if (input.jumpHeld && next.jumpHoldTime < PHYSICS.JUMP_HOLD_WINDOW_MS) {
      next.vy -= PHYSICS.JUMP_HOLD_FORCE * dt;
      next.jumpHoldTime += dt * 1000;
    } else {
      next.jumping = false;
    }
  }

  next.vy = Math.min(next.vy + PHYSICS.GRAVITY * dt, PHYSICS.MAX_FALL_SPEED);
  next.y += next.vy * dt;

  if (next.y >= GROUND_Y) {
    next.y = GROUND_Y;
    next.vy = 0;
    next.grounded = true;
    next.jumping = false;
  } else {
    next.grounded = false;
  }

  if (next.grounded && vx !== 0) {
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
