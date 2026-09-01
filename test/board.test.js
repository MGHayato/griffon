/**
 * 盤面ルールの テスト。
 *
 * ガード（前列が後列をかばう）と ブロック（3レーン埋めるとリーダーを守る）は
 * このゲームの心臓。対人戦では「2人の画面で同じ結果になる」ことが前提になるので、
 * ここが崩れていないことを 機械で確かめ続ける。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setG, makeGame, G } from "../src/core/state.js";
import {
  allUnits, laneOccupied, leaderBlocked, isCovered,
  legalAttackTargets, canAttack, laneUnits, candidateLanes, candidateRows,
} from "../src/core/board.js";

let uid = 0;

/** テスト用に ユニットを 直接置く */
function put(side, row, i, opts = {}) {
  const { atk = 1, hp = 1, name = "テスト" } = opts;
  const u = {
    uid: ++uid, id: "test", name, emoji: "⬜",
    atk, hp, maxHp: hp, sick: false, attacked: false,
    side: side.isPlayer ? "player" : "enemy",
  };
  side[row][i] = u;
  return u;
}

/** 攻撃できる相手を 名前で並べる（LEADER は リーダー） */
function targetNames(side) {
  return legalAttackTargets(side).map(t =>
    (t === G.player || t === G.enemy) ? "LEADER" : t.name);
}

beforeEach(() => {
  uid = 0;
  setG(makeGame());
});

describe("ガード：前列は 後列を かばう", () => {
  it("同じレーンの前列に なかまがいると 後列は 狙えない", () => {
    put(G.enemy, "front", 0, { name: "壁" });
    put(G.enemy, "back", 0, { name: "うしろ" });

    expect(targetNames(G.player)).toContain("壁");
    expect(targetNames(G.player)).not.toContain("うしろ");
    expect(isCovered(G.enemy, "back", 0)).toBe(true);
  });

  it("前列が空いているレーンなら 後列を 狙える", () => {
    put(G.enemy, "back", 1, { name: "むぼうび" });

    expect(targetNames(G.player)).toContain("むぼうび");
    expect(isCovered(G.enemy, "back", 1)).toBe(false);
  });

  it("前列が たおれると 後列が むき出しになる", () => {
    const wall = put(G.enemy, "front", 2, { name: "壁" });
    put(G.enemy, "back", 2, { name: "うしろ" });
    expect(targetNames(G.player)).not.toContain("うしろ");

    wall.hp = 0;                       // やられた
    expect(targetNames(G.player)).toContain("うしろ");
  });

  it("かばうのは 同じレーンだけ（となりのレーンは 守らない）", () => {
    put(G.enemy, "front", 0, { name: "壁" });
    put(G.enemy, "back", 1, { name: "となり" });

    expect(targetNames(G.player)).toContain("となり");
  });
});

describe("ブロック：3レーン埋めると リーダーを 守れる", () => {
  it("レーンが1つでも空いていれば リーダーを 狙える", () => {
    put(G.enemy, "front", 0);
    put(G.enemy, "front", 1);
    // レーン2 が 空
    expect(leaderBlocked(G.enemy)).toBe(false);
    expect(targetNames(G.player)).toContain("LEADER");
  });

  it("3レーンすべてに いれば リーダーを 狙えない", () => {
    put(G.enemy, "front", 0);
    put(G.enemy, "front", 1);
    put(G.enemy, "front", 2);

    expect(leaderBlocked(G.enemy)).toBe(true);
    expect(targetNames(G.player)).not.toContain("LEADER");
  });

  it("前列でも後列でも レーンを 埋めたことになる", () => {
    put(G.enemy, "back", 0);
    put(G.enemy, "front", 1);
    put(G.enemy, "back", 2);

    expect(leaderBlocked(G.enemy)).toBe(true);
  });

  it("1体たおれて レーンが空くと リーダーが 狙えるようになる", () => {
    put(G.enemy, "front", 0);
    const b = put(G.enemy, "front", 1);
    put(G.enemy, "front", 2);
    expect(targetNames(G.player)).not.toContain("LEADER");

    b.hp = 0;
    expect(targetNames(G.player)).toContain("LEADER");
  });

  it("ユニットが 1体もいなければ リーダーは まる裸", () => {
    expect(leaderBlocked(G.enemy)).toBe(false);
    expect(targetNames(G.player)).toEqual(["LEADER"]);
  });
});

describe("攻撃できるか", () => {
  it("召喚酔い中は 攻撃できない", () => {
    const u = put(G.player, "front", 0);
    u.sick = true;
    expect(canAttack(u)).toBe(false);
  });

  it("こおっていると 攻撃できない", () => {
    const u = put(G.player, "front", 0);
    u.frozen = 2;
    expect(canAttack(u)).toBe(false);
  });

  it("もう攻撃した ユニットは 攻撃できない", () => {
    const u = put(G.player, "front", 0);
    u.attacked = true;
    expect(canAttack(u)).toBe(false);
  });

  it("攻撃力0の ユニットは 攻撃できない", () => {
    const u = put(G.player, "front", 0, { atk: 0 });
    expect(canAttack(u)).toBe(false);
  });

  it("ふつうの ユニットは 攻撃できる", () => {
    const u = put(G.player, "front", 0);
    expect(canAttack(u)).toBe(true);
  });
});

describe("たて一列・よこ一列の 対象", () => {
  it("たて一列は そのレーンの 前後2体を まとめて取る", () => {
    put(G.enemy, "front", 1, { name: "まえ" });
    put(G.enemy, "back", 1, { name: "うしろ" });

    expect(laneUnits(G.enemy, 1).map(u => u.name)).toEqual(["まえ", "うしろ"]);
  });

  it("敵がいないレーンは ねらえない", () => {
    put(G.enemy, "front", 0);
    expect(candidateLanes(G.player)).toEqual([0]);
  });

  it("よこ一列は 敵がいる列だけ ねらえる", () => {
    put(G.enemy, "back", 0);
    expect(candidateRows(G.player)).toEqual(["back"]);

    put(G.enemy, "front", 2);
    expect(candidateRows(G.player).sort()).toEqual(["back", "front"]);
  });
});

describe("やられたユニットは 数に入らない", () => {
  it("HPが0以下なら 生きているユニットに 含まれない", () => {
    const u = put(G.player, "front", 0);
    expect(allUnits(G.player)).toHaveLength(1);

    u.hp = 0;
    expect(allUnits(G.player)).toHaveLength(0);
    expect(laneOccupied(G.player, 0)).toBe(false);
  });
});
