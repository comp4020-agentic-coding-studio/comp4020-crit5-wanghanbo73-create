import { describe, expect, it } from "vitest";
import {
  createInitialPlayerState,
  GROUND_Y,
  NO_INPUT,
  PHYSICS,
  clampDeltaTime,
  updatePlayer,
  type InputState,
  type PlayerState,
} from "./game-core.ts";

const FRAME = 1 / 60;

function run(
  state: PlayerState,
  input: InputState,
  frames: number,
  dt: number = FRAME,
): PlayerState {
  let next = state;
  for (let i = 0; i < frames; i++) next = updatePlayer(next, input, dt);
  return next;
}

describe("horizontal movement", () => {
  it("moves right while the right key is held", () => {
    const state = run(createInitialPlayerState(), { ...NO_INPUT, right: true }, 10);
    expect(state.x).toBeGreaterThan(100);
    expect(state.vx).toBeGreaterThan(0);
  });

  it("moves left while the left key is held", () => {
    const state = run(createInitialPlayerState(), { ...NO_INPUT, left: true }, 10);
    expect(state.x).toBeLessThan(100);
    expect(state.vx).toBeLessThan(0);
  });

  it("is stationary with no input", () => {
    const state = updatePlayer(createInitialPlayerState(), NO_INPUT, FRAME);
    expect(state.vx).toBe(0);
    expect(state.x).toBe(100);
  });

  it("never moves left of the canvas's left edge", () => {
    const start = { ...createInitialPlayerState(), x: 5 };
    const state = run(start, { ...NO_INPUT, left: true }, 60);
    expect(state.x).toBeGreaterThanOrEqual(0);
    expect(state.x).toBe(0);
  });

  it("never moves past the canvas's right edge", () => {
    const state = run(createInitialPlayerState(), { ...NO_INPUT, right: true }, 600);
    expect(state.x).toBeLessThanOrEqual(PHYSICS.CANVAS_WIDTH - PHYSICS.PLAYER_WIDTH);
  });
});

describe("gravity and ground collision", () => {
  it("pulls an airborne player downward", () => {
    const airborne = { ...createInitialPlayerState(), y: GROUND_Y - 200, grounded: false };
    const state = updatePlayer(airborne, NO_INPUT, FRAME);
    expect(state.vy).toBeGreaterThan(0);
    expect(state.y).toBeGreaterThan(airborne.y);
  });

  it("caps fall speed at MAX_FALL_SPEED", () => {
    const highUp = { ...createInitialPlayerState(), y: GROUND_Y - 5000, grounded: false, vy: 0 };
    const state = run(highUp, NO_INPUT, 300);
    expect(state.vy).toBeLessThanOrEqual(PHYSICS.MAX_FALL_SPEED);
  });

  it("lands on the ground and reports grounded", () => {
    const falling = { ...createInitialPlayerState(), y: GROUND_Y - 10, vy: 700, grounded: false };
    const state = updatePlayer(falling, NO_INPUT, FRAME);
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(GROUND_Y);
    expect(state.vy).toBe(0);
  });
});

describe("jumping", () => {
  it("launches upward on a grounded jump press", () => {
    const state = updatePlayer(createInitialPlayerState(), { ...NO_INPUT, jumpPressed: true }, FRAME);
    expect(state.vy).toBeLessThan(0);
    expect(state.grounded).toBe(false);
  });

  it("does nothing when jump is pressed while already airborne (no double jump)", () => {
    const airborne = { ...createInitialPlayerState(), grounded: false, vy: -100 };
    const state = updatePlayer(airborne, { ...NO_INPUT, jumpPressed: true }, FRAME);
    // velocity only changes by gravity for this frame, not another launch impulse
    expect(state.vy).toBeCloseTo(-100 + PHYSICS.GRAVITY * FRAME, 5);
  });

  function peakHeight(holdMs: number): number {
    let state = createInitialPlayerState();
    state = updatePlayer(state, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, FRAME);
    let elapsed = FRAME * 1000;
    let minY = state.y;
    while (!state.grounded || elapsed < 50) {
      const held = elapsed < holdMs;
      state = updatePlayer(state, { ...NO_INPUT, jumpHeld: held }, FRAME);
      elapsed += FRAME * 1000;
      minY = Math.min(minY, state.y);
      if (elapsed > 5000) break; // safety valve
    }
    return GROUND_Y - minY; // how high above the ground the player got
  }

  it("produces a bigger jump the longer the key is held (within the window)", () => {
    const shortHop = peakHeight(20);
    const fullHold = peakHeight(PHYSICS.JUMP_HOLD_WINDOW_MS);
    expect(fullHold).toBeGreaterThan(shortHop);
  });

  it("stops adding force once the hold window has elapsed, so height plateaus", () => {
    const atWindow = peakHeight(PHYSICS.JUMP_HOLD_WINDOW_MS);
    const beyondWindow = peakHeight(PHYSICS.JUMP_HOLD_WINDOW_MS + 500);
    expect(beyondWindow).toBeCloseTo(atWindow, 0);
  });

  it("cannot gain extra height by mashing jump mid-air", () => {
    let state = updatePlayer(createInitialPlayerState(), { ...NO_INPUT, jumpPressed: true }, FRAME);
    const vyAfterMash = updatePlayer(
      state,
      { ...NO_INPUT, jumpPressed: true, jumpHeld: false },
      FRAME,
    ).vy;
    const vyWithoutMash = updatePlayer(state, { ...NO_INPUT, jumpHeld: false }, FRAME).vy;
    expect(vyAfterMash).toBeCloseTo(vyWithoutMash, 5);
  });
});

describe("delta time handling", () => {
  it("clamps a huge delta time so physics can't blow up", () => {
    expect(clampDeltaTime(5)).toBe(PHYSICS.MAX_DELTA_TIME);
    expect(clampDeltaTime(-1)).toBe(0);
    expect(clampDeltaTime(0.01)).toBe(0.01);
  });

  it("a single huge-dt frame still lands within the canvas, not through the floor", () => {
    const state = updatePlayer(createInitialPlayerState(), NO_INPUT, 10);
    expect(state.y).toBe(GROUND_Y);
    expect(state.grounded).toBe(true);
  });
});
