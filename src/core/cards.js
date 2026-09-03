/* =========================================================
   カード定義と デッキ
   このファイルは cards/*.md から apply-cards.py が 作る。
   直に なおさず、md のほうを なおして `npm run cards` を 走らせる。
   ========================================================= */

export const CARDS = [
  // --- とくぎ（19種）---
  { id:"flare", name:"フレア", cost:1, type:"spell", emoji:"🔥", text:"敵1体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAny", fx:"flare" } },
  { id:"freeze", name:"フリーズ", cost:1, type:"spell", emoji:"❄️", text:"敵1体に1ダメージ、対象を凍結させる",
    effect:{ kind:"freeze", value:1, target:"enemyUnit" } },
  { id:"slash", name:"スラッシュ", cost:2, type:"spell", emoji:"⚔️", text:"横1列に1ダメージ",
    effect:{ kind:"damage", value:1, target:"enemyRow" } },
  { id:"heal", name:"ヒール", cost:2, type:"spell", emoji:"✨", text:"味方1体を3回復",
    effect:{ kind:"heal", value:3, target:"allyAny" } },
  { id:"salvage", name:"サルベージ", cost:2, type:"spell", emoji:"♻️", text:"使った道具をランダムに1枚手札に加える",
    effect:{ kind:"salvage", value:1, target:"self" } },
  { id:"song", name:"ゆうきの歌", cost:2, type:"spell", emoji:"🎵", text:"味方ユニット全体を +1/+1",
    effect:{ kind:"buff", value:1, target:"allyUnitAll", fx:"fieldGlow" } },
  { id:"idolsong", name:"アイドルソング", cost:2, type:"spell", emoji:"🎤", text:"味方ユニット全体のHPを2回復",
    effect:{ kind:"heal", value:2, target:"allyUnitAll" } },
  { id:"shutup", name:"シャラプー", cost:2, type:"spell", emoji:"🤫", text:"次のターン、敵は特技を使えない",
    effect:{ kind:"silence", target:"self" } },
  { id:"hail", name:"ヘイル", cost:3, type:"spell", emoji:"🌨️", text:"横1列に1ダメージ、対象を凍結させる",
    effect:{ kind:"freeze", value:1, target:"enemyRow" } },
  { id:"thunder", name:"サンダー", cost:3, type:"spell", emoji:"⚡", text:"縦1列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane", fx:"bolt" } },
  { id:"frostbite", name:"フロストバイト", cost:3, type:"spell", emoji:"🧊", text:"凍結状態の敵全員に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyFrozen" } },
  { id:"highheal", name:"ハイヒール", cost:3, type:"spell", emoji:"💚", text:"味方1体を4回復",
    effect:{ kind:"heal", value:4, target:"allyAny" } },
  { id:"veil", name:"ヴェール", cost:3, type:"spell", emoji:"🛡️", text:"3ターンの間、味方全体が受けるダメージ-1",
    effect:{ kind:"shield", value:1, target:"allySelf", turns:3 } },
  { id:"storm", name:"ストーム", cost:4, type:"spell", emoji:"🌪️", text:"敵ユニット全体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAll", fx:"storm" } },
  { id:"megafreeze", name:"メガフリーズ", cost:4, type:"spell", emoji:"🌬️", text:"敵1体に3ダメージ、対象を凍結させる",
    effect:{ kind:"freeze", value:3, target:"enemyUnit" } },
  { id:"blizzard", name:"ブリザード", cost:5, type:"spell", emoji:"🌨️", text:"敵ユニット全体に2ダメージ、対象を凍結させる",
    effect:{ kind:"freeze", value:2, target:"enemyAll" } },
  { id:"megafrost", name:"メガフロスト", cost:5, type:"spell", emoji:"💠", text:"凍結状態の敵全員に3ダメージ",
    effect:{ kind:"damage", value:3, target:"enemyFrozen" } },
  { id:"megaheal", name:"メガヒール", cost:5, type:"spell", emoji:"💖", text:"味方1体を6回復",
    effect:{ kind:"heal", value:6, target:"allyAny" } },
  { id:"lumiveil", name:"ルミナスヴェール", cost:6, type:"spell", emoji:"🌟", text:"3ターンの間、味方全体が受けるダメージ-2",
    effect:{ kind:"shield", value:2, target:"allySelf", turns:3 } },

  // --- どうぐ（13種）---
  { id:"water", name:"聖水", cost:0, type:"item", emoji:"💧", text:"MPを1回復",
    effect:{ kind:"mp", value:1, target:"self", fx:"blueGlow" } },
  { id:"glove", name:"革手袋", cost:0, type:"item", emoji:"🧤", text:"このターン中、どうぐのコスト-1",
    effect:{ kind:"discount", value:1, target:"self" } },
  { id:"map", name:"地図", cost:1, type:"item", emoji:"🗺️", text:"デッキの上から2枚引く",
    effect:{ kind:"draw", value:2, target:"self" } },
  { id:"crumb", name:"パンくず", cost:1, type:"item", emoji:"🍞", text:"デッキからコスト1以下のユニットを2枚手札に加える",
    effect:{ kind:"search", value:2, target:"self", filter:"unit", maxCost:1 } },
  { id:"pebble", name:"石つぶて", cost:1, type:"item", emoji:"🪨", text:"敵1体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAny" } },
  { id:"herb", name:"薬草", cost:1, type:"item", emoji:"🌿", text:"味方1体を2回復",
    effect:{ kind:"heal", value:2, target:"allyAny" } },
  { id:"horn", name:"角笛", cost:2, type:"item", emoji:"📯", text:"デッキからコスト2以下のユニットを2枚手札に加える",
    effect:{ kind:"search", value:2, target:"self", filter:"unit", maxCost:2 } },
  { id:"apple", name:"リンゴ", cost:2, type:"item", emoji:"🍎", text:"味方1体を3回復",
    effect:{ kind:"heal", value:3, target:"allyAny" } },
  { id:"poisonapple", name:"毒リンゴ", cost:2, type:"item", emoji:"🍏", text:"敵1体を毒状態にする",
    effect:{ kind:"poison", target:"enemyUnit" } },
  { id:"dagger", name:"短剣", cost:2, type:"item", emoji:"🔪", text:"味方ユニット1体の攻撃力+2",
    effect:{ kind:"buffAtk", value:2, target:"allyUnit" } },
  { id:"woodshield", name:"木の盾", cost:2, type:"item", emoji:"🪵", text:"3ターンの間、味方1体が受けるダメージ-1",
    effect:{ kind:"shield", value:1, target:"allyAny", turns:3 } },
  { id:"sling", name:"投石器", cost:3, type:"item", emoji:"🎯", text:"敵1体に4ダメージ",
    effect:{ kind:"damage", value:4, target:"enemyAny" } },
  { id:"candybomb", name:"キャンディボム", cost:4, type:"item", emoji:"🍬", text:"敵ユニット全体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAll" } },

  // --- ユニット（19種）---
  { id:"slime", name:"スライム", cost:0, type:"unit", atk:1, hp:1, emoji:"🟦", text:"" },
  { id:"rabbit", name:"ダッシュうさぎ", cost:1, type:"unit", atk:1, hp:1, emoji:"🐇", text:"召喚したターンから攻撃できる",
    rush:true },
  { id:"goblin", name:"ゴブリン", cost:1, type:"unit", atk:1, hp:1, emoji:"👺", text:"召喚時：デッキからユニットを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"unit" } },
  { id:"wingoblin", name:"真冬のゴブリン", cost:1, type:"unit", atk:1, hp:1, emoji:"🧊", text:"召喚時：敵1体を凍結させる",
    effect:{ kind:"freeze", value:0, target:"enemyUnit", times:1 } },
  { id:"thiefgoblin", name:"ぬすっとゴブリン", cost:1, type:"unit", atk:1, hp:1, emoji:"🎒", text:"召喚時：デッキからどうぐを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"item" } },
  { id:"wolf", name:"あばれウルフ", cost:2, type:"unit", atk:3, hp:1, emoji:"🐺", text:"" },
  { id:"ghost", name:"ゴースト", cost:2, type:"unit", atk:1, hp:2, emoji:"👻", text:"死亡時：デッキからユニットを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"unit", when:"death" } },
  { id:"vampbat", name:"吸血コウモリ", cost:2, type:"unit", atk:1, hp:3, emoji:"🦇", text:"攻撃で与えたダメージ分、自分のHPを回復",
    lifesteal:true },
  { id:"snowslime", name:"スノウスライム", cost:2, type:"unit", atk:2, hp:2, emoji:"⬜", text:"凍結している敵の数だけコスト-1",
    frostCost:1 },
  { id:"archer", name:"アーチャーエルフ", cost:3, type:"unit", atk:3, hp:1, emoji:"🏹", text:"召喚時：縦1列に1ダメージ",
    effect:{ kind:"damage", value:1, target:"enemyLane" } },
  { id:"healslime", name:"ヒールスライム", cost:3, type:"unit", atk:1, hp:4, emoji:"🟩", text:"召喚時：味方1体を2回復",
    effect:{ kind:"heal", value:2, target:"allyAny" } },
  { id:"yeti", name:"ゆきおとこ", cost:3, type:"unit", atk:2, hp:3, emoji:"🦍", text:"召喚時：敵1体を凍結させる",
    effect:{ kind:"freeze", value:0, target:"enemyUnit", times:1 } },
  { id:"rocketrabbit", name:"ロケットうさぎ", cost:3, type:"unit", atk:3, hp:1, emoji:"🚀", text:"召喚したターンから攻撃できる",
    rush:true },
  { id:"yukionna", name:"ゆきおんな", cost:4, type:"unit", atk:3, hp:3, emoji:"👘", text:"召喚時：敵2体を凍結させる",
    effect:{ kind:"freeze", value:0, target:"enemyUnit", times:2 } },
  { id:"golem", name:"ゴーレム", cost:5, type:"unit", atk:3, hp:7, emoji:"🗿", text:"" },
  { id:"priestelf", name:"プリーストエルフ", cost:5, type:"unit", atk:2, hp:6, emoji:"🙏", text:"攻撃するたびランダムな味方1体を2回復",
    healOnAttack:2 },
  { id:"dragon", name:"ドラゴン", cost:6, type:"unit", atk:4, hp:6, emoji:"🐉", text:"召喚時：縦一列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane" } },
  { id:"healdemon", name:"ヒールデーモン", cost:6, type:"unit", atk:3, hp:5, emoji:"😈", text:"味方が回復するたびランダムな敵1体に2ダメージ",
    damageOnHeal:2 },
  { id:"windragon", name:"ウィンタードラゴン", cost:7, type:"unit", atk:4, hp:6, emoji:"🐲", text:"凍結している敵の数だけコスト-1、召喚時：縦一列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane" },
    frostCost:1 },
];

/** デッキ。cards[] は [カードのid, 枚数] の ならび */
export const DECKS = [
  { id:"alice", label:"アリス", emoji:"🗡️", desc:"どんな盤面でも活躍できるバランス型", total:30,
    cards:[["flare",2], ["heal",2], ["slash",2], ["thunder",2], ["storm",2], ["song",2], ["horn",2], ["slime",2], ["rabbit",2], ["goblin",2], ["wolf",2], ["ghost",2], ["archer",2], ["golem",2], ["dragon",2]] },
  { id:"hansel", label:"ヘンゼル", emoji:"🍞", desc:"多彩な道具で味方を強化して戦う", total:30,
    cards:[["salvage",2], ["glove",2], ["map",2], ["crumb",2], ["pebble",2], ["dagger",2], ["woodshield",2], ["sling",2], ["candybomb",2], ["slime",2], ["rabbit",2], ["goblin",2], ["thiefgoblin",2], ["rocketrabbit",2], ["dragon",2]] },
  { id:"gretel", label:"グレーテル", emoji:"🍬", desc:"回復手段が多い持久型", total:30,
    cards:[["heal",2], ["idolsong",1], ["highheal",1], ["veil",2], ["megaheal",1], ["lumiveil",2], ["map",1], ["crumb",2], ["herb",2], ["candybomb",2], ["slime",2], ["rabbit",2], ["thiefgoblin",2], ["healslime",2], ["rocketrabbit",2], ["priestelf",2], ["healdemon",2]] },
  { id:"snow", label:"スノウ", emoji:"🍎", desc:"氷系の呪文で敵を凍らせて戦う", total:30,
    cards:[["freeze",2], ["hail",1], ["frostbite",2], ["megafreeze",2], ["blizzard",1], ["megafrost",2], ["map",2], ["apple",2], ["poisonapple",2], ["slime",2], ["wingoblin",2], ["ghost",2], ["snowslime",2], ["yeti",2], ["yukionna",2], ["windragon",2]] },
];

export const CARD_MAP = {};
CARDS.forEach(c => CARD_MAP[c.id] = c);

export const MAX_SLOTS = 3;
export const START_HP  = 20;
export const MAX_MP    = 10;
export const HAND_MAX  = 8;
export const CLEANUP_DELAY = 420;   // やられた演出を見せる時間
