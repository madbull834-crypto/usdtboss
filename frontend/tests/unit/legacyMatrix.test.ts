import { describe, expect, it } from "vitest";
import { ZeroAddress } from "ethers";
import {
  displayUserIdForQueueIndex,
  deriveLegacyReferralPlacements,
  matrixPlacementsForWallet,
  type SolTrustUserAccount,
} from "../../src/evm/client";

describe("public display user IDs", () => {
  it("starts at 1000 and advances by two in registration order", () => {
    expect(displayUserIdForQueueIndex(0)).toBe(1000n);
    expect(displayUserIdForQueueIndex(1)).toBe(1002n);
    expect(displayUserIdForQueueIndex(111)).toBe(1222n);
  });
});

const [root, first, second, third, spillover] = [
  "0x676c28c70b27e64c7b72203821f0db66bf022d65",
  "0x8dd7bb8c99372b6ce274a2cd1c9b9eabb4c79d18",
  "0xe2054ed8e010618501838d6116bfdcdc4955cfda",
  "0x8f43a3b2cf8ee64cb1a2f81e37dec53c231cbe9d",
  "0x3476ba0f301301c6e430c7d51742dc326ecf9310",
];

function member(wallet: string, referrer: string, currentSlot = 1): SolTrustUserAccount {
  return {
    wallet, referrer, firstUpline: referrer, secondUpline: ZeroAddress,
    thirdUpline: ZeroAddress, firstDownline: null, secondDownline: null,
    userId: 1n, directReferralCount: 0, currentSlot,
    activeSlotBitmap: (1 << currentSlot) - 1, exited: false,
    recycleCounts: Array(12).fill(0), registeredAt: 0n, pocketFillCount: 0,
    placementPocketOwner: null, placementPocketPosition: 0, incomeTreeCount: 0,
    incomeTreeCycle: 0, incomeTreeSlot: currentSlot, incomeUpgradeReserveSol: 0,
    incomeRecycleReady: false, referralIncomeTreeOwner: null,
    referralIncomeTreePosition: 0, referralIncomeTreeCycle: 0,
  };
}

describe("legacy referral-derived matrix", () => {
  it("fills three sponsor positions then spills breadth-first", () => {
    const users = [
      member(root, ZeroAddress), member(first, root), member(second, root),
      member(third, root), member(spillover, root),
    ];
    const placements = deriveLegacyReferralPlacements(users);

    expect(placements.filter(p => p.slot === 1)).toEqual([
      expect.objectContaining({ member: first, parent: root, position: 1, source: "legacy-derived" }),
      expect.objectContaining({ member: second, parent: root, position: 2, source: "legacy-derived" }),
      expect.objectContaining({ member: third, parent: root, position: 3, source: "legacy-derived" }),
      expect.objectContaining({ member: spillover, parent: first, position: 1, source: "legacy-derived" }),
    ]);
  });

  it("uses only members active at the selected level", () => {
    const placements = deriveLegacyReferralPlacements([
      member(root, ZeroAddress, 2), member(first, root, 1), member(second, first, 2),
    ]);
    const levelTwo = placements.filter(p => p.slot === 2);

    expect(levelTwo).toHaveLength(1);
    expect(levelTwo[0]).toEqual(expect.objectContaining({ member: second, parent: root, position: 1 }));
  });

  it("keeps legacy-derived and live topologies separate", () => {
    const mixed = [
      ...deriveLegacyReferralPlacements([member(root, ZeroAddress), member(first, root)]),
      { member: spillover, parent: root, slot: 1, position: 1, source: "live" as const },
    ];

    expect(matrixPlacementsForWallet(mixed, root).every(p => p.source === "legacy-derived")).toBe(true);
    expect(matrixPlacementsForWallet(mixed, "0x0000000000000000000000000000000000000001")).toEqual([
      expect.objectContaining({ source: "live" }),
    ]);
  });
});
