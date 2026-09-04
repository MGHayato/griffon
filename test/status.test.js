/**
 * 状態異常と 新しい仕組みの テスト。
 *
 * こおり・どく・まもり・とくぎ封じ・ねびきは
 * 「出せるか」「いくらか」の 判定に からむので、
 * ここが 壊れると 遊べなくなる。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setG, makeGame, G, setFoeDeckId,
  grantShield, tickShield, shieldSum, shieldSoonest, equipTo,
} from "../src/core/state.js";
import { CARD_MAP, CARDS } from "../src/core/cards.js";
import { canPlay, costOf, frozenUnits, effectCandidates, shieldOf, summonEffect, matchesFilter, healWatchers, equipOf, armorCut } from "../src/core/board.js";

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

describe("回復に 反応する（ヒールデーモン）", () => {
  it("ヒールデーモンは damageOnHeal を もつ", () => {
    const c = CARD_MAP["healdemon"];
    expect(c.damageOnHeal).toBe(2);
    expect(c.effect, "召喚時こうかは 持たない").toBeUndefined();
  });

  it("盤面に いれば 見つかる", () => {
    expect(healWatchers(G.player)).toEqual([]);
    const d = put(G.player, "front", 0, "healdemon", { damageOnHeal: 2 });
    expect(healWatchers(G.player)).toEqual([d]);
  });

  it("ふつうの子は 反応しない", () => {
    put(G.player, "front", 0, "slime");
    put(G.player, "front", 1, "priestelf", { healOnAttack: 2 });
    expect(healWatchers(G.player)).toEqual([]);
  });

  it("2体 いれば 2体とも 反応する", () => {
    const a = put(G.player, "front", 0, "healdemon", { damageOnHeal: 2 });
    const b = put(G.player, "back", 0, "healdemon", { damageOnHeal: 2 });
    expect(healWatchers(G.player)).toEqual([a, b]);
  });

  it("やられた子は かぞえない", () => {
    put(G.player, "front", 0, "healdemon", { damageOnHeal: 2, hp: 0 });
    expect(healWatchers(G.player)).toEqual([]);
  });

  it("あいての ヒールデーモンは まきこまない", () => {
    put(G.enemy, "front", 0, "healdemon", { damageOnHeal: 2 });
    expect(healWatchers(G.player)).toEqual([]);
    expect(healWatchers(G.enemy).length).toBe(1);
  });
});

describe("デッキから さがす（サーチ）", () => {
  const only = f => ({ kind: "search", value: 1, target: "self", filter: f });

  it("どうぐを さがすと どうぐしか 出てこない", () => {
    const e = only("item");
    for (const c of CARDS) {
      expect(matchesFilter(c, e), c.name).toBe(c.type === "item");
    }
  });

  it("ユニットを さがすと ユニットだけ", () => {
    const e = only("unit");
    for (const c of CARDS) {
      expect(matchesFilter(c, e), c.name).toBe(c.type === "unit");
    }
  });

  it("とくぎを さがすと とくぎだけ（どうぐは 入らない）", () => {
    const e = only("spell");
    expect(matchesFilter(CARD_MAP["flare"], e)).toBe(true);    // とくぎ
    expect(matchesFilter(CARD_MAP["water"], e)).toBe(false);   // どうぐ
    expect(matchesFilter(CARD_MAP["slime"], e)).toBe(false);   // ユニット
  });

  it("コストの 上限も みる", () => {
    const e = { kind: "search", value: 2, target: "self", filter: "unit", maxCost: 1 };
    expect(matchesFilter(CARD_MAP["slime"], e)).toBe(true);     // 0
    expect(matchesFilter(CARD_MAP["rabbit"], e)).toBe(true);    // 1
    expect(matchesFilter(CARD_MAP["wolf"], e)).toBe(false);     // 2
  });

  it("filter が 無ければ 何でも 通る", () => {
    const e = { kind: "search", value: 1, target: "self" };
    expect(matchesFilter(CARD_MAP["slime"], e)).toBe(true);
    expect(matchesFilter(CARD_MAP["water"], e)).toBe(true);
    expect(matchesFilter(CARD_MAP["flare"], e)).toBe(true);
  });

  it("ぬすっとゴブリンは どうぐを さがす", () => {
    const e = CARD_MAP["thiefgoblin"].effect;
    expect(e.filter).toBe("item");
    expect(matchesFilter(CARD_MAP["water"], e)).toBe(true);
    expect(matchesFilter(CARD_MAP["slime"], e)).toBe(false);
  });

  it("パンくずは コスト1以下の ユニットを さがす", () => {
    const e = CARD_MAP["crumb"].effect;
    expect(matchesFilter(CARD_MAP["rabbit"], e)).toBe(true);    // ユニット1
    expect(matchesFilter(CARD_MAP["wolf"], e)).toBe(false);     // ユニット2
    expect(matchesFilter(CARD_MAP["water"], e)).toBe(false);    // どうぐ0
  });
});

describe("召喚時と 死亡時の 見わけ", () => {
  it("死亡時こうかは 召喚時に 出てこない", () => {
    const ghost = CARD_MAP["ghost"];
    expect(ghost.effect.when).toBe("death");     // 効果は 持っているが
    expect(summonEffect(ghost)).toBeNull();      // 召喚では 発動しない
  });

  it("召喚時こうかは ちゃんと 返る", () => {
    expect(summonEffect(CARD_MAP["archer"])).toEqual(CARD_MAP["archer"].effect);
    expect(summonEffect(CARD_MAP["healslime"])).toEqual(CARD_MAP["healslime"].effect);
  });

  it("効果を もたない子は null", () => {
    expect(summonEffect(CARD_MAP["slime"])).toBeNull();
    expect(summonEffect(CARD_MAP["golem"])).toBeNull();
    expect(summonEffect(undefined)).toBeNull();
  });

  it("死亡時こうかを 持つカードは ぜんぶ 召喚では 出ない", () => {
    const deaths = CARDS.filter(c => c.effect && c.effect.when === "death");
    expect(deaths.length).toBeGreaterThan(0);
    for (const c of deaths) expect(summonEffect(c), c.name).toBeNull();
  });
});

describe("そうび", () => {
  it("短剣は 武器、木の盾は 盾", () => {
    expect(CARD_MAP["dagger"].effect).toEqual({ kind: "equip", value: 2, target: "allyUnit", slot: "weapon" });
    expect(CARD_MAP["woodshield"].effect).toEqual({ kind: "equip", value: 1, target: "allyUnit", slot: "armor" });
  });

  it("そうびに のこりターンは 無い（ずっと つく）", () => {
    for (const c of CARDS.filter(c => c.effect && c.effect.kind === "equip")) {
      expect(c.effect.turns, `${c.name}`).toBeUndefined();
    }
  });

  it("盾を つけた ぶん ダメージが へる", () => {
    const u = put(G.player, "front", 0, "golem");
    expect(shieldOf(u)).toBe(0);
    u.armor = "woodshield";
    expect(armorCut(u)).toBe(1);
    expect(shieldOf(u)).toBe(1);
  });

  it("盾と 味方全体の まもりは 合わさる", () => {
    const u = put(G.player, "front", 0, "golem", { armor: "woodshield" });
    grantShield(G.player, { value: 2, turns: 3 });        // ルミナスヴェール
    expect(shieldOf(u)).toBe(3);                          // 1 + 2
  });

  it("そうびを 読みだせる", () => {
    const u = put(G.player, "front", 0, "golem", { weapon: "dagger", armor: "woodshield" });
    expect(equipOf(u, "weapon").name).toBe("短剣");
    expect(equipOf(u, "armor").name).toBe("木の盾");
    expect(equipOf(u, "weapon").effect.value).toBe(2);
  });

  it("何も つけていなければ null", () => {
    const u = put(G.player, "front", 0, "slime");
    expect(equipOf(u, "weapon")).toBeNull();
    expect(equipOf(u, "armor")).toBeNull();
    expect(armorCut(u)).toBe(0);
  });

  it("リーダーは そうびの ぶんを 数えない", () => {
    expect(armorCut(G.player)).toBe(0);
    expect(shieldOf(G.player)).toBe(0);
  });

  describe("つけかえ（上書き）", () => {
    it("武器を つけると 攻撃力が 上がる", () => {
      const u = put(G.player, "front", 0, "wolf");        // 攻3
      expect(u.atk).toBe(3);
      expect(equipTo(u, CARD_MAP["dagger"])).toBeNull();  // 前のは 無い
      expect(u.atk).toBe(5);                              // 3 + 2
      expect(u.weapon).toBe("dagger");
    });

    it("おなじ武器を つけなおしても 二重には ならない", () => {
      const u = put(G.player, "front", 0, "wolf");
      equipTo(u, CARD_MAP["dagger"]);
      expect(u.atk).toBe(5);
      const old = equipTo(u, CARD_MAP["dagger"]);         // 2枚目
      expect(old.name).toBe("短剣");                       // 前のが 外れた
      expect(u.atk).toBe(5);                              // 5のまま（+2 が 1回ぶん）
    });

    it("べつの武器に つけかえると 前のぶんが 外れる", () => {
      const u = put(G.player, "front", 0, "wolf");
      equipTo(u, CARD_MAP["dagger"]);                     // +2 → 攻5
      // +5 の 武器が あったとして つけかえる
      const bigSword = { id: "test-sword", name: "ためし剣",
                         effect: { kind: "equip", slot: "weapon", value: 5, target: "allyUnit" } };
      CARD_MAP["test-sword"] = bigSword;
      const old = equipTo(u, bigSword);
      expect(old.id).toBe("dagger");
      expect(u.atk).toBe(8);                              // 3 + 5（短剣の +2 は 外れた）
      delete CARD_MAP["test-sword"];
    });

    it("盾を つけかえても 攻撃力は 動かない", () => {
      const u = put(G.player, "front", 0, "wolf");
      equipTo(u, CARD_MAP["woodshield"]);
      expect(u.atk).toBe(3);
      expect(armorCut(u)).toBe(1);
      const old = equipTo(u, CARD_MAP["woodshield"]);
      expect(old.name).toBe("木の盾");
      expect(u.atk).toBe(3);
      expect(armorCut(u)).toBe(1);                        // かさならない
    });

    it("武器と 盾は べつの場所（両方 つけられる）", () => {
      const u = put(G.player, "front", 0, "wolf");
      equipTo(u, CARD_MAP["dagger"]);
      equipTo(u, CARD_MAP["woodshield"]);
      expect(u.weapon).toBe("dagger");
      expect(u.armor).toBe("woodshield");
      expect(u.atk).toBe(5);
      expect(shieldOf(u)).toBe(1);
    });

    it("ゆうきの歌で 上がった ぶんは そのまま のこる", () => {
      const u = put(G.player, "front", 0, "wolf");
      u.atk += 1;                                          // +1/+1 の ぶん
      equipTo(u, CARD_MAP["dagger"]);
      expect(u.atk).toBe(6);                               // 3 + 1 + 2
      equipTo(u, CARD_MAP["dagger"]);                      // つけかえ
      expect(u.atk).toBe(6);                               // 歌の ぶんは 減らない
    });
  });
});

describe("まもり", () => {
  const veil = { value: 1, turns: 3 };
  const lumi = { value: 2, turns: 3 };

  it("ヴェール中は ヴェール系を 手札から えらべない", () => {
    expect(canPlay(G.player, "veil")).toBe(true);
    expect(canPlay(G.player, "lumiveil")).toBe(true);

    grantShield(G.player, veil);                          // ヴェールを かけた
    expect(canPlay(G.player, "veil")).toBe(false);
    expect(canPlay(G.player, "lumiveil")).toBe(false);    // 強いほうも 出せない
  });

  it("ルミナスヴェール中も おなじ", () => {
    grantShield(G.player, lumi);
    expect(canPlay(G.player, "veil")).toBe(false);
    expect(canPlay(G.player, "lumiveil")).toBe(false);
  });

  it("きれたら また 出せる", () => {
    grantShield(G.player, { value: 1, turns: 1 });
    expect(canPlay(G.player, "veil")).toBe(false);
    tickShield(G.player);                                  // 1ターン すぎて きれた
    expect(canPlay(G.player, "veil")).toBe(true);
  });

  it("木の盾は ヴェール中でも 出せる（1体だけの まもりは べつ）", () => {
    put(G.player, "front", 0, "slime");
    grantShield(G.player, veil);
    expect(canPlay(G.player, "woodshield")).toBe(true);
  });

  it("ユニットは 自分のぶん ＋ 味方全体のぶん", () => {
    const u = put(G.player, "front", 0, "slime");
    grantShield(G.player, veil);                          // 全体 -1
    grantShield(u, { value: 1, turns: 3 });               // 木の盾 -1
    expect(shieldOf(u)).toBe(2);
  });

  it("リーダーは 全体のぶん ＋ 自分にかけたぶん", () => {
    grantShield(G.player, lumi);                          // 全体 -2
    grantShield(G.player, veil, "ownShield");             // 自分に -1
    expect(shieldOf(G.player)).toBe(3);
  });

  it("のこりターンは べつべつに へる", () => {
    grantShield(G.player, { value: 1, turns: 1 });         // すぐ きれる
    grantShield(G.player, { value: 2, turns: 3 });         // まだ のこる
    expect(shieldSum(G.player.shield)).toBe(3);
    expect(shieldSoonest(G.player.shield)).toBe(1);

    expect(tickShield(G.player)).toBe(1);                  // 1つ きれた
    expect(shieldSum(G.player.shield)).toBe(2);            // 強いほうが のこる
    expect(tickShield(G.player)).toBe(0);
    expect(tickShield(G.player)).toBe(1);                  // のこりも きれた
    expect(shieldSum(G.player.shield)).toBe(0);
  });

  it("まもりが 無いときは 0", () => {
    expect(shieldSum(G.player.shield)).toBe(0);
    expect(shieldOf(G.player)).toBe(0);
    expect(tickShield(G.player)).toBe(0);
  });
});

describe("効果の あて先", () => {
  it("enemyFrozen は こおった敵だけ", () => {
    const a = put(G.enemy, "front", 0, "slime", { frozen: 2 });
    put(G.enemy, "front", 1, "slime");
    const list = effectCandidates({ target: "enemyFrozen" }, G.player);
    expect(list).toEqual([a]);
  });

  it("「味方」は リーダーも えらべる", () => {
    const u = put(G.player, "front", 0, "slime");
    expect(effectCandidates({ target: "allyAny" }, G.player)).toEqual([u, G.player]);
    expect(effectCandidates({ target: "allyAll" }, G.player)).toEqual([u, G.player]);
  });

  it("「味方ユニット」は 盤面の子だけ", () => {
    const u = put(G.player, "front", 0, "slime");
    expect(effectCandidates({ target: "allyUnit" }, G.player)).toEqual([u]);
    expect(effectCandidates({ target: "allyUnitAll" }, G.player)).toEqual([u]);
  });
});

describe("「味方」と「味方ユニット」の 書きわけ", () => {
  const targetOf = name => CARDS.find(c => c.name === name).effect.target;

  it("「味方1体を回復」は リーダーも えらべる", () => {
    for (const nm of ["ヒール", "ハイヒール", "メガヒール", "薬草", "リンゴ", "ヒールスライム"]) {
      expect(targetOf(nm), nm).toBe("allyAny");
    }
  });

  it("「味方ユニット全体」は 盤面だけ", () => {
    for (const nm of ["ゆうきの歌", "アイドルソング"]) {
      expect(targetOf(nm), nm).toBe("allyUnitAll");
    }
  });

  it("そうびは 盤面の子 だけ（リーダーには つけられない）", () => {
    expect(targetOf("木の盾")).toBe("allyUnit");
    expect(targetOf("短剣")).toBe("allyUnit");
  });

  it("ヴェールは 味方全体の まもり", () => {
    expect(targetOf("ヴェール")).toBe("allySelf");
    expect(targetOf("ルミナスヴェール")).toBe("allySelf");
  });

  it("攻撃力を 上げるのは ユニットだけ", () => {
    expect(targetOf("短剣")).toBe("allyUnit");
  });

  it("回復カードの あて先は ぜんぶ 決めた4つの どれか", () => {
    const ok = ["allyUnit", "allyAny", "allyUnitAll", "allyAll", "allySelf"];
    for (const c of CARDS.filter(c => c.effect && ["heal", "buff", "buffAtk", "shield"].includes(c.effect.kind))) {
      expect(ok, `${c.name} の ${c.effect.target}`).toContain(c.effect.target);
    }
  });
});
