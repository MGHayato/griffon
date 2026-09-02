/**
 * デッキの テスト。
 *
 * カードは cards/card-library.md、デッキの中身は cards/card-アリス.md などの
 * md ファイルから apply-cards.py が つくっている。
 * md を いじったときに 気づかず 壊れないように、ここで 見はっておく。
 */
import { describe, it, expect } from "vitest";
import { CARDS, CARD_MAP, DECKS } from "../src/core/cards.js";
import { makeDeck, getDeck, playableDecks, setDeck, currentDeckId } from "../src/core/state.js";

describe("カードライブラリ", () => {
  it("id が かぶっていない", () => {
    const ids = CARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("種類は とくぎ / どうぐ / ユニット のどれか", () => {
    for (const c of CARDS) {
      expect(["spell", "item", "unit"]).toContain(c.type);
    }
  });

  it("ユニットには 攻撃力とHPが ある", () => {
    for (const c of CARDS.filter(c => c.type === "unit")) {
      expect(typeof c.atk).toBe("number");
      expect(c.hp).toBeGreaterThan(0);
    }
  });

  it("ユニットでないカードには かならず 効果が ある", () => {
    for (const c of CARDS.filter(c => c.type !== "unit")) {
      expect(c.effect, `${c.name} に 効果が ない`).toBeTruthy();
    }
  });
});

describe("デッキ", () => {
  it("4人ぶん ある", () => {
    expect(DECKS.map(d => d.id)).toEqual(["alice", "hansel", "gretel", "snow"]);
  });

  it("書いてあるカードは ぜんぶ ライブラリに ある", () => {
    for (const d of DECKS) {
      for (const [id] of d.cards) {
        expect(CARD_MAP[id], `${d.label} の ${id} が ライブラリに ない`).toBeTruthy();
      }
    }
  });

  it("total は 枚数の合計と 合っている", () => {
    for (const d of DECKS) {
      const sum = d.cards.reduce((a, [, n]) => a + n, 0);
      expect(sum, `${d.label} の total が ずれている`).toBe(d.total);
    }
  });

  it("おなじカードを 2回 書いていない", () => {
    for (const d of DECKS) {
      const ids = d.cards.map(([id]) => id);
      expect(new Set(ids).size, `${d.label} に おなじカードが 2行ある`).toBe(ids.length);
    }
  });

  it("アリスは 40枚 そろっている", () => {
    expect(getDeck("alice").total).toBe(40);
  });

  it("中身の ないデッキは えらべる一覧に 出てこない", () => {
    const ids = playableDecks().map(d => d.id);
    expect(ids).toContain("alice");
    for (const d of DECKS) {
      if (d.cards.length === 0) expect(ids).not.toContain(d.id);
    }
  });
});

describe("山札づくり", () => {
  it("デッキに 書いた枚数ぶん つくられる", () => {
    const deck = makeDeck("alice");
    expect(deck.length).toBe(getDeck("alice").total);
  });

  it("中身は ぜんぶ 本物のカード", () => {
    for (const id of makeDeck("alice")) expect(CARD_MAP[id]).toBeTruthy();
  });

  it("カードごとの 枚数が 合っている", () => {
    const deck = makeDeck("alice");
    for (const [id, n] of getDeck("alice").cards) {
      expect(deck.filter(x => x === id).length, `${CARD_MAP[id].name} の枚数`).toBe(n);
    }
  });

  it("まざっている（2回つくると 順番が ちがう）", () => {
    const a = makeDeck("alice").join(",");
    const b = makeDeck("alice").join(",");
    expect(a).not.toBe(b);
  });

  it("はじめは アリスが えらばれている", () => {
    expect(currentDeckId).toBe("alice");
  });

  it("知らない id を わたしても 変わらない", () => {
    setDeck("そんなデッキない");
    expect(getDeck().id).toBe("alice");
  });
});
