/* =========================================================
   カード定義と 基本の数値
   ここは card-names.md から apply-cards.py が 書きかえる
   ========================================================= */

/* =========================================================
   カード定義
   ========================================================= */
export const CARDS = [
  // --- ユニット（10種 / 20枚）---
  { id:"slime", name:"スライム", cost:0, type:"unit", atk:1, hp:1, count:2, emoji:"🟦", text:"" },
  { id:"rabbit", name:"ダッシュうさぎ", cost:1, type:"unit", atk:1, hp:1, count:2, emoji:"🐇", text:"召喚したターンから攻撃できる",
    rush:true },
  { id:"goblin", name:"ゴブリン", cost:1, type:"unit", atk:1, hp:1, count:2, emoji:"👺", text:"召喚時：デッキからユニットを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"unit" } },
  { id:"wolf", name:"あばれウルフ", cost:2, type:"unit", atk:3, hp:1, count:2, emoji:"🐺", text:"" },
  { id:"ghost", name:"ゴースト", cost:2, type:"unit", atk:1, hp:2, count:2, emoji:"👻", text:"死亡時：デッキからユニットを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"unit", when:"death" } },
  { id:"vampbat", name:"吸血コウモリ", cost:2, type:"unit", atk:1, hp:3, count:2, emoji:"🦇", text:"攻撃で与えたダメージ分、自分のHPを回復",
    lifesteal:true },
  { id:"archer", name:"アーチャーエルフ", cost:3, type:"unit", atk:3, hp:1, count:2, emoji:"🏹", text:"召喚時：縦1列に1ダメージ",
    effect:{ kind:"damage", value:1, target:"enemyLane" } },
  { id:"healslime", name:"ヒールスライム", cost:3, type:"unit", atk:1, hp:4, count:2, emoji:"🟩", text:"召喚時：味方1体を2回復",
    effect:{ kind:"heal", value:2, target:"allyUnit" } },
  { id:"golem", name:"ゴーレム", cost:5, type:"unit", atk:3, hp:7, count:2, emoji:"🗿", text:"" },
  { id:"dragon", name:"ドラゴン", cost:6, type:"unit", atk:4, hp:6, count:2, emoji:"🐉", text:"召喚時：縦一列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane" } },

  // --- 特技（10種 / 20枚）---
  { id:"water", name:"聖水", cost:0, type:"spell", count:2, emoji:"💧", text:"MPを1回復",
    effect:{ kind:"mp", value:1, target:"self", fx:"blueGlow" } },
  { id:"flare", name:"フレア", cost:1, type:"spell", count:2, emoji:"🔥", text:"敵1体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAny", fx:"flare" } },
  { id:"search", name:"探索", cost:1, type:"spell", count:2, emoji:"🔍", text:"デッキの上から2枚引く",
    effect:{ kind:"draw", value:2, target:"self" } },
  { id:"heal", name:"ヒール", cost:2, type:"spell", count:2, emoji:"✨", text:"味方1体を3回復",
    effect:{ kind:"heal", value:3, target:"allyAny" } },
  { id:"song", name:"ゆうきの歌", cost:2, type:"spell", count:2, emoji:"🎵", text:"味方全体を +1/+1",
    effect:{ kind:"buff", value:1, target:"allyAll", fx:"fieldGlow" } },
  { id:"horn", name:"角笛", cost:2, type:"spell", count:2, emoji:"📯", text:"デッキからコスト2以下のユニットを2枚手札に加える",
    effect:{ kind:"search", value:2, target:"self", filter:"unit", maxCost:2 } },
  { id:"hail", name:"ヘイル", cost:2, type:"spell", count:2, emoji:"❄️", text:"敵1体に1ダメージ、対象は次のターン攻撃できない",
    effect:{ kind:"freeze", value:1, target:"enemyUnit" } },
  { id:"slash", name:"スラッシュ", cost:2, type:"spell", count:2, emoji:"⚔️", text:"横1列に1ダメージ",
    effect:{ kind:"damage", value:1, target:"enemyRow" } },
  { id:"thunder", name:"サンダー", cost:3, type:"spell", count:2, emoji:"⚡", text:"縦1列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane", fx:"bolt" } },
  { id:"storm", name:"ストーム", cost:4, type:"spell", count:2, emoji:"🌪️", text:"敵全体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAll", fx:"storm" } },
];

export const CARD_MAP = {};
CARDS.forEach(c => CARD_MAP[c.id] = c);

export const MAX_SLOTS = 3;
export const START_HP  = 20;
export const MAX_MP    = 10;
export const HAND_MAX  = 8;
export const CLEANUP_DELAY = 420;   // やられた演出を見せる時間
