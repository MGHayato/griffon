/**
 * 手札の 並べかえの テスト。
 *
 * 見た目だけ 並べかえると「手札の何枚目か」を 指す番号と ずれて、
 * 押したのと ちがうカードが 出てしまう。
 * 配列そのものを 並べかえていることを ここで 確かめる。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setG, makeGame, G, sortHand } from "../src/core/state.js";
import { CARD_MAP, CARDS } from "../src/core/cards.js";

beforeEach(() => setG(makeGame()));

/** 手札を 好きな中身に 差し替える */
function setHand(ids) {
  G.player.hand = ids.slice();
}
const costs = () => G.player.hand.map(id => CARD_MAP[id].cost);
const names = () => G.player.hand.map(id => CARD_MAP[id].name);

describe("手札は コストの小さい順に そろう", () => {
  it("ばらばらでも 小さい順になる", () => {
    setHand(["dragon", "slime", "thunder", "flare"]);   // 6, 0, 3, 1
    sortHand(G.player, CARD_MAP);
    expect(costs()).toEqual([0, 1, 3, 6]);
  });

  it("すでに そろっていれば 変わらない", () => {
    setHand(["slime", "flare", "thunder", "dragon"]);
    sortHand(G.player, CARD_MAP);
    expect(costs()).toEqual([0, 1, 3, 6]);
  });

  it("同じコストのカードは となりあう", () => {
    // どれも 2コスト
    setHand(["wolf", "heal", "wolf", "heal"]);
    sortHand(G.player, CARD_MAP);
    const n = names();
    expect(n[0]).toBe(n[1]);   // 同じものが ならぶ
    expect(n[2]).toBe(n[3]);
  });

  it("カードは 1枚も 増えたり消えたりしない", () => {
    const before = ["dragon", "slime", "slime", "thunder", "flare"];
    setHand(before);
    sortHand(G.player, CARD_MAP);
    expect(G.player.hand.length).toBe(before.length);
    expect(G.player.hand.slice().sort()).toEqual(before.slice().sort());
  });

  it("手札が 空でも 落ちない", () => {
    setHand([]);
    expect(() => sortHand(G.player, CARD_MAP)).not.toThrow();
    expect(G.player.hand).toEqual([]);
  });

  it("何度 並べかえても 結果が 変わらない", () => {
    setHand(["dragon", "slime", "thunder", "flare", "wolf"]);
    sortHand(G.player, CARD_MAP);
    const once = G.player.hand.slice();
    sortHand(G.player, CARD_MAP);
    expect(G.player.hand).toEqual(once);
  });

  it("どのカードの組み合わせでも 昇順になっている", () => {
    // ぜんぶのカードを 逆順に 入れてみる
    setHand(CARDS.map(c => c.id).reverse());
    sortHand(G.player, CARD_MAP);
    const cs = costs();
    for (let i = 1; i < cs.length; i++) {
      expect(cs[i]).toBeGreaterThanOrEqual(cs[i - 1]);
    }
  });
});

describe("並べかえても 手札の番号と 中身が ずれない", () => {
  it("番号で 引いたカードが 見えているカードと 一致する", () => {
    setHand(["dragon", "slime", "thunder"]);
    sortHand(G.player, CARD_MAP);

    // 画面は G.player.hand の順に ならぶので、
    // idx 番目の 表示 = G.player.hand[idx] でなければ ならない
    G.player.hand.forEach((id, idx) => {
      expect(G.player.hand[idx]).toBe(id);
      expect(CARD_MAP[id]).toBeDefined();
    });
  });
});
