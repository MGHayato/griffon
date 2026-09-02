/**
 * 状態異常と 新しい仕組みの テスト。
 *
 * こおり・どく・まもり・とくぎ封じ・ねびきは
 * 「出せるか」「いくらか」の 判定に からむので、
 * ここが 壊れると 遊べなくなる。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setG, makeGame, G, setFoeDeckId } from "../src/core/state.js";
import { CARD_MAP, CARDS } from "../src/core/cards.js";
import { canPlay, costOf, frozenUnits, effectCandidates } from "../src/core/board.js";

beforeEach(() => {
  setFoeDeckId("alice");
  setG(makeGame());
  G.player.mp = 10;
  G.player.maxMp = 10;
});

/** 盤面に ユニットを 1体 置く */
function put(side, row, i, id, extra = {}) {
  const c = CARD_MAP[id];
  const u = {
    uid: Math.random(), id: c.id, name: c.name, emoji: c.emoji,
    atk: c.atk, hp: c.hp, maxHp: c.hp,
    sick: false, attacked: false,
    side: side.isPlayer ? "player" : "enemy",
    ...extra,
  };
  side[row][i] = u;
  return u;
}

describe("カードの データ", () => {
  it("こおらせるカードは ぜんぶ 敵ユニットが 対象", () => {
    for (const c of CARDS.filter(c => c.effect && c.effect.kind === "freeze")) {
      expect(["enemyUnit", "enemyRow", "enemyLane", "enemyAll"]).toContain(c.effect.target);
    }
  });

  it("まもりには のこりターンが ついている", () => {
    for (const c of CARDS.filter(c => c.effect && c.effect.kind === "shield")) {
      expect(c.effect.turns, `${c.name}`).toBeGreaterThan(0);
      expect(c.effect.value, `${c.name}`).toBeGreaterThan(0);
    }
  });

  it("「敵2体を凍結」は times が 2", () => {
    const c = CARDS.find(x => x.name === "ゆきおんな");
    expect(c.effect.times).toBe(2);
  });

  it("プリーストエルフは 攻撃するたび 2回復", () => {
    expect(CARDS.find(c => c.name === "プリーストエルフ").healOnAttack).toBe(2);
  });

  it("ウィンタードラゴンは ねびきと 召喚時こうかを 両方もつ", () => {
    const c = CARDS.find(x => x.name === "ウィンタードラゴン");
    expect(c.frostCost).toBe(1);
    expect(c.effect).toEqual({ kind: "damage", value: 2, target: "enemyLane" });
  });
});

describe("コスト", () => {
  it("ふだんは 書いてあるとおり", () => {
    expect(costOf(G.player, "windragon")).toBe(CARD_MAP["windragon"].cost);
  });

  it("こおっている敵の数だけ 安くなる", () => {
    put(G.enemy, "front", 0, "slime", { frozen: 2 });
    put(G.enemy, "front", 1, "slime", { frozen: 2 });
    expect(frozenUnits(G.player).length).toBe(2);
    expect(costOf(G.player, "windragon")).toBe(CARD_MAP["windragon"].cost - 2);
    expect(costOf(G.player, "snowslime")).toBe(CARD_MAP["snowslime"].cost - 2);
  });

  it("こおっていない敵は 数えない", () => {
    put(G.enemy, "front", 0, "slime");
    expect(costOf(G.player, "snowslime")).toBe(CARD_MAP["snowslime"].cost);
  });

  it("革手袋の ねびきは どうぐにだけ きく", () => {
    G.player.itemDiscount = 1;
    expect(costOf(G.player, "horn")).toBe(CARD_MAP["horn"].cost - 1);      // どうぐ
    expect(costOf(G.player, "thunder")).toBe(CARD_MAP["thunder"].cost);    // とくぎ
    expect(costOf(G.player, "golem")).toBe(CARD_MAP["golem"].cost);        // ユニット
  });

  it("0より 下には ならない", () => {
    G.player.itemDiscount = 99;
    expect(costOf(G.player, "horn")).toBe(0);
  });
});

describe("出せるか の 判定", () => {
  it("とくぎ封じ中は とくぎだけ 出せない", () => {
    put(G.enemy, "front", 0, "slime");
    G.player.noSpell = true;
    expect(canPlay(G.player, "flare")).toBe(false);      // とくぎ
    expect(canPlay(G.player, "water")).toBe(true);       // どうぐ
    expect(canPlay(G.player, "slime")).toBe(true);       // ユニット
  });

  it("こおった敵が いないと フロストバイトは 出せない", () => {
    put(G.enemy, "front", 0, "slime");
    expect(canPlay(G.player, "frostbite")).toBe(false);
    G.enemy.front[0].frozen = 2;
    expect(canPlay(G.player, "frostbite")).toBe(true);
  });

  it("使った どうぐが 無いと サルベージは 出せない", () => {
    expect(canPlay(G.player, "salvage")).toBe(false);
    G.player.usedItems.push("water");
    expect(canPlay(G.player, "salvage")).toBe(true);
  });

  it("安くなれば MPが 足りなくても 出せる", () => {
    G.player.mp = 5;
    expect(canPlay(G.player, "windragon")).toBe(false);   // コスト7
    put(G.enemy, "front", 0, "slime", { frozen: 2 });
    put(G.enemy, "front", 1, "slime", { frozen: 2 });
    expect(canPlay(G.player, "windragon")).toBe(true);    // 7-2=5
  });
});

describe("効果の あて先", () => {
  it("enemyFrozen は こおった敵だけ", () => {
    const a = put(G.enemy, "front", 0, "slime", { frozen: 2 });
    put(G.enemy, "front", 1, "slime");
    const list = effectCandidates({ target: "enemyFrozen" }, G.player);
    expect(list).toEqual([a]);
  });
});
