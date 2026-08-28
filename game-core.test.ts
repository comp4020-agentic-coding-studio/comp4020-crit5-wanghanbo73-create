import { describe, expect, it } from "vitest";
import {
  createInitialGameState,
  createInitialPlayerState,
  DEATH_Y,
  GROUND_Y,
  LEVEL,
  NO_INPUT,
  PHYSICS,
  WORLD_WIDTH,
  clampDeltaTime,
  maxCameraX,
  updateCamera,
  updateGame,
  updatePlayer,
  type GameState,
  type InputState,
  type Level,
  type Platform,
  type PlayerState,
} from "./game-core.ts";

const FRAME = 1 / 60;

function run(
  state: PlayerState,
  input: InputState,
  frames: number,
  dt: number = FRAME,
  level: Level = LEVEL,
): PlayerState {
  let next = state;
  for (let i = 0; i < frames; i++) next = updatePlayer(next, input, dt, level);
  return next;
}

// A tiny, hand-built level for tests that want a single simple platform
// rather than the real level's full layout.
function levelWith(platforms: Platform[], worldWidth = 2000): Level {
  return { worldWidth, platforms, pits: [], spawn: { x: 100, y: GROUND_Y } };
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

  it("never moves left of the world's left edge", () => {
    const start = { ...createInitialPlayerState(), x: 5 };
    const state = run(start, { ...NO_INPUT, left: true }, 60);
    expect(state.x).toBe(0);
  });

  it("never moves past the world's right edge", () => {
    const state = run(createInitialPlayerState(), { ...NO_INPUT, right: true }, 2000);
    expect(state.x).toBeLessThanOrEqual(WORLD_WIDTH - PHYSICS.PLAYER_WIDTH);
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
      if (elapsed > 5000) break;
    }
    return GROUND_Y - minY;
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
    const state = updatePlayer(createInitialPlayerState(), { ...NO_INPUT, jumpPressed: true }, FRAME);
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

  it("a single huge-dt frame still lands within the level, not through the floor", () => {
    const state = updatePlayer(createInitialPlayerState(), NO_INPUT, 10);
    expect(state.y).toBe(GROUND_Y);
    expect(state.grounded).toBe(true);
  });
});

const EPS_MARGIN = 0.5;

describe("floating platform collision", () => {
  // A single platform floating above a distant ground, isolated so tests
  // can approach it from above, below, and the side without interference.
  const platform: Platform = { x: 200, y: GROUND_Y - 100, width: 120, height: 20 };
  const level = levelWith([platform]);

  it("lands on top when falling onto it from above", () => {
    const falling = { ...createInitialPlayerState(level), x: 220, y: platform.y - 5, vy: 400, grounded: false };
    const state = updatePlayer(falling, NO_INPUT, FRAME, level);
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(platform.y);
    expect(state.vy).toBe(0);
  });

  it("stops rising when its head hits the platform's underside", () => {
    // Head starts 5px below the underside, rising fast enough to cross it in one frame.
    const startY = platform.y + platform.height + 5 + PHYSICS.PLAYER_HEIGHT;
    const rising = { ...createInitialPlayerState(level), x: 220, y: startY, vy: -400, grounded: false };
    const state = updatePlayer(rising, NO_INPUT, FRAME, level);
    expect(state.vy).toBe(0);
    expect(state.y - PHYSICS.PLAYER_HEIGHT).toBe(platform.y + platform.height);
  });

  it("stops horizontal movement when walking into the platform's left side", () => {
    // Standing on the distant ground segment, level with the platform's
    // vertical span, moving right into its left edge.
    const approaching = {
      ...createInitialPlayerState(level),
      x: platform.x - PHYSICS.PLAYER_WIDTH - 2,
      y: platform.y + platform.height, // feet at the platform's own height band
      vy: 0,
      grounded: false,
    };
    const state = updatePlayer(approaching, { ...NO_INPUT, right: true }, FRAME, level);
    expect(state.x).toBeLessThanOrEqual(platform.x - PHYSICS.PLAYER_WIDTH + EPS_MARGIN);
    expect(state.vx).toBe(0);
  });

  it("does not block a player already standing on top of it", () => {
    const standing = { ...createInitialPlayerState(level), x: platform.x + 10, y: platform.y, grounded: true };
    const state = updatePlayer(standing, { ...NO_INPUT, right: true }, FRAME, level);
    expect(state.grounded).toBe(true);
    expect(state.x).toBeGreaterThan(standing.x);
  });

  it("stops being grounded after walking off the platform's edge", () => {
    let state: PlayerState = {
      ...createInitialPlayerState(level),
      x: platform.x + platform.width - 5,
      y: platform.y,
      grounded: true,
    };
    state = run(state, { ...NO_INPUT, right: true }, 20, FRAME, level);
    expect(state.grounded).toBe(false);
  });
});

describe("pits", () => {
  const [pit] = LEVEL.pits;

  it("a small hop cannot clear the pit and the player keeps falling", () => {
    let state: PlayerState = { ...createInitialPlayerState(), x: pit.x - 5, grounded: true };
    state = updatePlayer(state, { ...NO_INPUT, right: true, jumpPressed: true }, FRAME);
    for (let i = 0; i < 90; i++) {
      state = updatePlayer(state, { ...NO_INPUT, right: true }, FRAME);
    }
    expect(state.grounded).toBe(false);
    expect(state.y).toBeGreaterThan(GROUND_Y + 50);
  });

  it("a full-hold big jump clears the pit and lands on the far side", () => {
    let state: PlayerState = { ...createInitialPlayerState(), x: pit.x - 5, grounded: true };
    state = updatePlayer(state, { ...NO_INPUT, right: true, jumpPressed: true, jumpHeld: true }, FRAME);
    for (let i = 0; i < 90; i++) {
      const held = i * FRAME * 1000 < PHYSICS.JUMP_HOLD_WINDOW_MS;
      state = updatePlayer(state, { ...NO_INPUT, right: true, jumpHeld: held }, FRAME);
      if (state.grounded) break;
    }
    expect(state.grounded).toBe(true);
    expect(state.x).toBeGreaterThanOrEqual(pit.x + pit.width);
  });
});

describe("camera", () => {
  it("stays at the world's left edge while the player is near the start", () => {
    let cameraX = 0;
    for (let i = 0; i < 30; i++) cameraX = updateCamera(cameraX, 100, FRAME);
    expect(cameraX).toBe(0);
  });

  it("follows once the player passes the follow threshold", () => {
    let cameraX = 0;
    const playerX = 900;
    for (let i = 0; i < 120; i++) cameraX = updateCamera(cameraX, playerX, FRAME);
    expect(cameraX).toBeGreaterThan(0);
    expect(cameraX).toBeCloseTo(playerX - PHYSICS.CANVAS_WIDTH * 0.4, 0);
  });

  it("never goes negative or past worldWidth - canvasWidth", () => {
    let cameraX = 0;
    for (let i = 0; i < 500; i++) cameraX = updateCamera(cameraX, WORLD_WIDTH + 500, FRAME);
    expect(cameraX).toBeCloseTo(maxCameraX(), 6);

    let backAtStart = cameraX;
    for (let i = 0; i < 500; i++) backAtStart = updateCamera(backAtStart, -500, FRAME);
    expect(backAtStart).toBeCloseTo(0, 6);
  });

  it("eases smoothly rather than snapping in one frame", () => {
    const after1 = updateCamera(0, 900, FRAME);
    expect(after1).toBeGreaterThan(0);
    expect(after1).toBeLessThan(900 - PHYSICS.CANVAS_WIDTH * 0.4);
  });
});

describe("falling into a pit ends the game", () => {
  it("switches status to LOSE once the player drops below the death height", () => {
    const state: GameState = {
      player: { ...createInitialPlayerState(), y: DEATH_Y - 1, grounded: false, vy: 500 },
      cameraX: 300,
      status: "PLAYING",
    };
    const next = updateGame(state, NO_INPUT, FRAME);
    expect(next.status).toBe("LOSE");
  });

  it("freezes physics and input once LOSE", () => {
    const lost: GameState = {
      player: { ...createInitialPlayerState(), x: 500, y: DEATH_Y + 50 },
      cameraX: 300,
      status: "LOSE",
    };
    const next = updateGame(lost, { ...NO_INPUT, right: true, jumpPressed: true }, FRAME);
    expect(next).toEqual(lost);
  });
});

describe("restart", () => {
  it("produces a state identical to the very first load", () => {
    const first = createInitialGameState();
    const messedUp = updateGame(
      { player: { ...first.player, x: 900, y: 100, vx: -50, vy: 300, grounded: false, jumping: true, jumpHoldTime: 77 }, cameraX: 400, status: "PLAYING" },
      NO_INPUT,
      FRAME,
    );
    expect(messedUp).not.toEqual(first);

    const restarted = createInitialGameState();
    expect(restarted).toEqual(first);
  });
});
