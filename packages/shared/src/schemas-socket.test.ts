import { describe, expect, it } from "vitest";
import {
  createGuessSchema,
  DEFAULT_SETTINGS,
  gameConfigSchema,
  guessSchema,
  opponentProgressSchema,
  SOCKET_EVENTS,
  toOpponentProgress,
  updateSettingsSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "./index";

describe("gameConfigSchema", () => {
  it("fills defaults", () => {
    expect(gameConfigSchema.parse({})).toEqual({
      codeLength: 4,
      numColors: 6,
      maxAttempts: 10,
      allowDuplicates: true,
    });
  });

  it("rejects impossible no-duplicate configs and out-of-range values", () => {
    expect(gameConfigSchema.safeParse({ codeLength: 6, numColors: 4, allowDuplicates: false }).success).toBe(false);
    expect(gameConfigSchema.safeParse({ codeLength: 0 }).success).toBe(false);
    expect(gameConfigSchema.safeParse({ numColors: 11 }).success).toBe(false);
  });
});

describe("guess schemas", () => {
  it("validates structure", () => {
    expect(guessSchema.safeParse([0, 1, 2, 3]).success).toBe(true);
    expect(guessSchema.safeParse([]).success).toBe(false);
    expect(guessSchema.safeParse([0, "a"]).success).toBe(false);
  });

  it("binds to config", () => {
    const s = createGuessSchema({ codeLength: 4, numColors: 6 });
    expect(s.safeParse([0, 1, 2, 5]).success).toBe(true);
    expect(s.safeParse([0, 1, 2, 6]).success).toBe(false);
    expect(s.safeParse([0, 1, 2]).success).toBe(false);
  });
});

describe("settings", () => {
  it("has sane defaults", () => {
    expect(DEFAULT_SETTINGS.language).toBe("en");
    expect(DEFAULT_SETTINGS.colorblindMode).toBe(false);
  });
  it("accepts partial updates and rejects bad values", () => {
    expect(updateSettingsSchema.safeParse({ language: "hu", audio: { muted: true } }).success).toBe(true);
    expect(updateSettingsSchema.safeParse({ language: "de" }).success).toBe(false);
  });
});

describe("opponent telemetry (anti-cheat)", () => {
  it("never carries guess colors or secrets", () => {
    const progress = toOpponentProgress("r1", 2, { exact: 1, partial: 2, isWin: false, isGameOver: false });
    expect(Object.keys(progress).sort()).toEqual(["exact", "isWin", "partial", "roomId", "row"]);
    expect(opponentProgressSchema.safeParse(progress).success).toBe(true);
  });

  it("rejects payloads smuggling colors", () => {
    const base = { roomId: "r1", row: 0, exact: 0, partial: 0, isWin: false };
    expect(opponentProgressSchema.safeParse({ ...base, guess: [1, 2, 3, 4] }).success).toBe(false);
    expect(opponentProgressSchema.safeParse({ ...base, secret: [1, 2, 3, 4] }).success).toBe(false);
  });
});

describe("socket contracts", () => {
  it("event lists cover typed events", () => {
    const client: ClientToServerEvents = {
      "queue:join": () => {},
      "queue:leave": () => {},
      "room:create": () => {},
      "room:join": () => {},
      "room:leave": () => {},
      "game:guess": () => {},
      "tournament:subscribe": () => {},
      "tournament:unsubscribe": () => {},
    };
    const server: ServerToClientEvents = {
      "queue:waiting": () => {},
      "queue:matched": () => {},
      "room:joined": () => {},
      "game:start": () => {},
      "game:feedback": () => {},
      "game:opponentProgress": () => {},
      "game:end": () => {},
      "opponent:disconnected": () => {},
      "opponent:reconnected": () => {},
      "tournament:bracket": () => {},
      "tournament:matchUpdate": () => {},
      error: () => {},
    };
    expect([...SOCKET_EVENTS.client].sort()).toEqual(Object.keys(client).sort());
    expect([...SOCKET_EVENTS.server].sort()).toEqual(Object.keys(server).sort());
  });
});
