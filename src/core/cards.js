/* =========================================================
   カード定義と デッキ
   このファイルは cards/*.md から apply-cards.py が 作る。
   直に なおさず、md のほうを なおして `npm run cards` を 走らせる。
   ========================================================= */

export const CARDS = [
  // --- とくぎ（7種）---
  { id:"flare", name:"フレア", cost:1, type:"spell", emoji:"🔥", text:"敵1体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAny", fx:"flare" } },
  { id:"heal", name:"ヒール", cost:2, type:"spell", emoji:"✨", text:"味方1体を3回復",
    effect:{ kind:"heal", value:3, target:"allyAny" } },
  { id:"song", name:"ゆうきの歌", cost:2, type:"spell", emoji:"🎵", text:"味方全体を +1/+1",
    effect:{ kind:"buff", value:1, target:"allyAll", fx:"fieldGlow" } },
  { id:"freeze", name:"フリーズ", cost:2, type:"spell", emoji:"❄️", text:"敵1体に1ダメージ、対象は次のターン攻撃できない",
    effect:{ kind:"freeze", value:1, target:"enemyUnit" } },
  { id:"slash", name:"スラッシュ", cost:2, type:"spell", emoji:"⚔️", text:"横1列に1ダメージ",
    effect:{ kind:"damage", value:1, target:"enemyRow" } },
  { id:"thunder", name:"サンダー", cost:3, type:"spell", emoji:"⚡", text:"縦1列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane", fx:"bolt" } },
  { id:"storm", name:"ストーム", cost:4, type:"spell", emoji:"🌪️", text:"敵全体に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyAll", fx:"storm" } },

  // --- どうぐ（3種）---
  { id:"water", name:"聖水", cost:0, type:"item", emoji:"💧", text:"MPを1回復",
    effect:{ kind:"mp", value:1, target:"self", fx:"blueGlow" } },
  { id:"search", name:"探索", cost:1, type:"item", emoji:"🔍", text:"デッキの上から2枚引く",
    effect:{ kind:"draw", value:2, target:"self" } },
  { id:"horn", name:"角笛", cost:2, type:"item", emoji:"📯", text:"デッキからコスト2以下のユニットを2枚手札に加える",
    effect:{ kind:"search", value:2, target:"self", filter:"unit", maxCost:2 } },

  // --- ユニット（10種）---
  { id:"slime", name:"スライム", cost:0, type:"unit", atk:1, hp:1, emoji:"🟦", text:"" },
  { id:"rabbit", name:"ダッシュうさぎ", cost:1, type:"unit", atk:1, hp:1, emoji:"🐇", text:"召喚したターンから攻撃できる",
    rush:true },
  { id:"goblin", name:"ゴブリン", cost:1, type:"unit", atk:1, hp:1, emoji:"👺", text:"召喚時：デッキからユニットを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"unit" } },
  { id:"wolf", name:"あばれウルフ", cost:2, type:"unit", atk:3, hp:1, emoji:"🐺", text:"" },
  { id:"ghost", name:"ゴースト", cost:2, type:"unit", atk:1, hp:2, emoji:"👻", text:"死亡時：デッキからユニットを1枚手札に加える",
    effect:{ kind:"search", value:1, target:"self", filter:"unit", when:"death" } },
  { id:"vampbat", name:"吸血コウモリ", cost:2, type:"unit", atk:1, hp:3, emoji:"🦇", text:"攻撃で与えたダメージ分、自分のHPを回復",
    lifesteal:true },
  { id:"archer", name:"アーチャーエルフ", cost:3, type:"unit", atk:3, hp:1, emoji:"🏹", text:"召喚時：縦1列に1ダメージ",
    effect:{ kind:"damage", value:1, target:"enemyLane" } },
  { id:"healslime", name:"ヒールスライム", cost:3, type:"unit", atk:1, hp:4, emoji:"🟩", text:"召喚時：味方1体を2回復",
    effect:{ kind:"heal", value:2, target:"allyUnit" } },
  { id:"golem", name:"ゴーレム", cost:5, type:"unit", atk:3, hp:7, emoji:"🗿", text:"" },
  { id:"dragon", name:"ドラゴン", cost:6, type:"unit", atk:4, hp:6, emoji:"🐉", text:"召喚時：縦一列に2ダメージ",
    effect:{ kind:"damage", value:2, target:"enemyLane" } },
];

/** デッキ。cards[] は [カードのid, 枚数] の ならび */
export const DECKS = [
  { id:"alice", label:"アリス", emoji:"🗡️", desc:"バランス型。どんな盤面にも 手が出せる", total:40,
    cards:[["water",2], ["flare",2], ["search",2], ["heal",2], ["song",2], ["horn",2], ["freeze",2], ["slash",2], ["thunder",2], ["storm",2], ["slime",2], ["rabbit",2], ["goblin",2], ["wolf",2], ["ghost",2], ["vampbat",2], ["archer",2], ["healslime",2], ["golem",2], ["dragon",2]] },
  { id:"hansel", label:"ヘンゼル", emoji:"🍞", desc:"", total:0,
    cards:[] },
  { id:"gretel", label:"グレーテル", emoji:"🍬", desc:"", total:0,
    cards:[] },
  { id:"snow", label:"スノウ", emoji:"🍎", desc:"", total:0,
    cards:[] },
];

export const CARD_MAP = {};
CARDS.forEach(c => CARD_MAP[c.id] = c);

export const MAX_SLOTS = 3;
export const START_HP  = 20;
export const MAX_MP    = 10;
export const HAND_MAX  = 8;
export const CLEANUP_DELAY = 420;   // やられた演出を見せる時間
