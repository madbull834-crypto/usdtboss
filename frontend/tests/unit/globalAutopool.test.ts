import { describe, expect, it } from "vitest";
import { GLOBAL_AUTOPOOL_LEVELS, GLOBAL_AUTOPOOL_PLAN_TOTAL } from "../../src/evm/plan";

describe("Global Autopool plan", () => {
  it("matches the six entry amounts and two-plus-five growth stages", () => {
    expect(GLOBAL_AUTOPOOL_LEVELS.map(level => level.entry)).toEqual([
      20, 120, 720, 4_320, 25_920, 155_520,
    ]);
    expect(GLOBAL_AUTOPOOL_LEVELS.map(level => level.growthTree1Total)).toEqual([
      40, 240, 1_440, 8_640, 51_840, 311_040,
    ]);
    expect(GLOBAL_AUTOPOOL_LEVELS.every(level => level.grossCycle === level.entry * 10)).toBe(true);
  });

  it("shows the artwork total while keeping the contract fee explicit", () => {
    expect(GLOBAL_AUTOPOOL_LEVELS.map(level => level.planIncome)).toEqual([
      80, 480, 2_880, 17_280, 103_680, 1_555_200,
    ]);
    expect(GLOBAL_AUTOPOOL_PLAN_TOTAL).toBe(1_679_600);
    expect(GLOBAL_AUTOPOOL_LEVELS[0].netWalletIncome).toBe(72);
    expect(GLOBAL_AUTOPOOL_LEVELS[5].netWalletIncome).toBe(1_399_680);
  });
});
