/* =========================================================
   ゲームの状態
   G ひとつに ぜんぶ入っている。JSONにできる形を たもつこと
   （相手に そのまま送れることが 対人戦の 前提になる）
   ========================================================= */
import { DECKS, START_HP } from "./cards.js";

/** 対戦の状態。ESMの live binding なので、import 先でも最新が見える */
export let G = null;
export function setG(g) { G = g; }

let uidCounter = 0;
export function nextUid() { return ++uidCounter; }
export function resetUid() { uidCounter = 0; }

/* =========================================================
   デッキえらび
   じぶんの ぶんと あいての ぶんを べつべつに 覚えておく。
   あいては「おまかせ」も えらべる（対戦を はじめるたびに ランダム）。
   ========================================================= */
const DECK_KEY_ME  = "griffon.deck.me";
const DECK_KEY_FOE = "griffon.deck.foe";

/** あいてを おまかせに するときの しるし */
export const RANDOM_DECK = "random";

export function getDeck(id) {
  return DECKS.find(d => d.id === id) || DECKS[0];
}

/** 中身が 入っていて えらべるデッキ だけ返す */
export function playableDecks() {
  return DECKS.filter(d => d.cards.length > 0);
}

function isPlayable(id) {
  return playableDecks().some(d => d.id === id);
}

/** どれも えらべないときの さいごの よりどころ */
function fallbackDeckId() {
  const list = playableDecks();
  if (list.length) return list[0].id;
  return DECKS[0] ? DECKS[0].id : "alice";
}

/**
 * 「おまかせ」を そのばの デッキに ときほぐす。
 * 覚えていた デッキが 空っぽに なっていたら えらべるものに もどす。
 */
export function resolveDeckId(id) {
  if (id === RANDOM_DECK) {
    const list = playableDecks();
    if (!list.length) return fallbackDeckId();
    return list[Math.floor(Math.random() * list.length)].id;
  }
  return isPlayable(id) ? id : fallbackDeckId();
}

let myDeckId = null;
let foeDeckId = null;

function loadDeckId(key, allowRandom) {
  let saved = null;
  try { saved = localStorage.getItem(key); } catch { /* 使えない環境 */ }
  if (allowRandom && saved === RANDOM_DECK) return RANDOM_DECK;
  if (saved && isPlayable(saved)) return saved;
  return fallbackDeckId();
}

function saveDeckId(key, id) {
  try { localStorage.setItem(key, id); } catch { /* 保存できなくても 遊べる */ }
}

export function getMyDeckId() {
  if (myDeckId === null) myDeckId = loadDeckId(DECK_KEY_ME, false);
  return myDeckId;
}
export function getFoeDeckId() {
  if (foeDeckId === null) foeDeckId = loadDeckId(DECK_KEY_FOE, true);
  return foeDeckId;
}

/** じぶんの デッキを 決める。中身の 空いた デッキは えらべない */
export function setMyDeckId(id) {
  if (isPlayable(id)) { myDeckId = id; saveDeckId(DECK_KEY_ME, id); }
  return getMyDeckId();
}

/** あいての デッキを 決める。こちらは「おまかせ」も 通る */
export function setFoeDeckId(id) {
  if (id === RANDOM_DECK || isPlayable(id)) { foeDeckId = id; saveDeckId(DECK_KEY_FOE, id); }
  return getFoeDeckId();
}

/** デッキの中身から 山札を つくって まぜる */
export function makeDeck(deckId) {
  const d = getDeck(resolveDeckId(deckId ?? getMyDeckId()));
  const deck = [];
  if (d) d.cards.forEach(([id, count]) => {
    for (let i = 0; i < count; i++) deck.push(id);
  });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function makeSide(isPlayer, deckId) {
  // 「おまかせ」は ここで ひとつに 決める。決まった id を そのまま 持たせるので、
  // リーダーの 顔や 名前も この id から 引ける。
  const id = resolveDeckId(deckId ?? (isPlayer ? getMyDeckId() : getFoeDeckId()));
  return {
    isPlayer, deckId: id,
    hp: START_HP, mp: 0, maxMp: 0,
    deck: makeDeck(id), hand: [],
    front: [null, null, null],
    back:  [null, null, null],
    fatigue: 0,
    usedItems: [],        // これまで 使った どうぐ（サルベージが 拾いなおす）
    itemDiscount: 0,      // このターン だけの どうぐの ねびき
    shield: null,         // { value, turns } うけるダメージを へらす
    noSpell: false,       // シャラプー中は とくぎを 出せない
  };
}

/** まっさらな対戦状態を つくる（描画や演出には さわらない） */
export function makeGame() {
  resetUid();
  return {
    player: makeSide(true),
    enemy:  makeSide(false),
    turn: "player", turnCount: 0, over: false,
    mode: "idle",            // idle / place / target / attack
    pickedCard: null,        // 手札 index
    pickedUnit: null,        // 攻撃元
    pending: null,           // 効果の対象待ち
    logs: [], busy: false,
    cleanupTimer: null,
  };
}

/** 共有すべき部分だけ 取り出す（mode や pickedUnit は 各自のローカル状態） */
export function snapshot() {
  if (!G) return null;
  const { player, enemy, turn, turnCount, over, logs } = G;
  return JSON.parse(JSON.stringify({ player, enemy, turn, turnCount, over, logs }));
}

/** snapshot() で取ったものを 書き戻す */
export function restore(snap) {
  if (!G || !snap) return;
  Object.assign(G, JSON.parse(JSON.stringify(snap)));
}

/**
 * 手札を コストの小さい順に そろえる。
 *
 * 見た目だけ 並べかえると、手札の何枚目かを 指す番号と ずれて
 * 別のカードが 出てしまう。だから 配列そのものを 並べかえる。
 * 引いた札が いつも同じ場所に 入るので、押しまちがいも 減る。
 *
 * 同じコストなら カードの種類でまとめる（同じカードが となりあう）。
 */
export function sortHand(side, cardMap) {
  side.hand.sort((a, b) => {
    const A = cardMap[a], B = cardMap[b];
    return (A.cost - B.cost) || (A.id < B.id ? -1 : A.id > B.id ? 1 : 0);
  });
}

/* =========================================================
   プレイヤーネーム
   端末のなかに 覚えておく（localStorage）。
   サーバーは まだ無いので、PCとスマホでは 別の名前になる。
   ========================================================= */
export const NAME_MAX = 5;
const NAME_KEY = "griffon.playerName";

/** はじめて遊ぶときに ここから ランダムで えらぶ */
export const DEFAULT_NAMES = [
  "アベル", "ライアン", "セシル", "ロイド", "エルド",
  "ガイア", "ノエル", "リオン", "テオ", "ヴァン",
  "クレア", "ミレイ", "セラ", "リナ", "アイラ",
  "ユーリ", "カイト", "ルーク", "シオン", "フィン",
];

/** 名前として つかえる形に そろえる（タグや 改行を 入れさせない） */
export function cleanName(raw) {
  return String(raw ?? "")
    .replace(/[<>&"'`\\]/g, "")        // タグに化ける字は 落とす
    .replace(/[\x00-\x1f\x7f]/g, "")   // 制御文字は のぞく
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

function randomName() {
  return DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
}

let playerName = null;

/** いまの名前。まだ決まっていなければ ランダムに決めて 覚える */
export function getPlayerName() {
  if (playerName) return playerName;
  let saved = null;
  try { saved = localStorage.getItem(NAME_KEY); } catch { /* 使えない環境 */ }
  playerName = cleanName(saved) || randomName();
  if (!saved) savePlayerName(playerName);
  return playerName;
}

/** 名前を 決める。空なら ランダムに決め直す */
export function setPlayerName(raw) {
  const name = cleanName(raw) || randomName();
  playerName = name;
  savePlayerName(name);
  return name;
}

function savePlayerName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* 保存できなくても 遊べる */ }
}

/** その がわの デッキ（顔や 名前を 引くのに つかう） */
export function sideDeck(side) { return getDeck(side && side.deckId); }

/** 名前。じぶんは よびな、あいては デッキの 名前 */
export function sideName(side) {
  if (side.isPlayer) return getPlayerName();
  const d = sideDeck(side);
  return d ? d.label : "まおう";
}
export function sideOf(unit)   { return unit.side === "player" ? G.player : G.enemy; }
export function opponentOf(side) { return side.isPlayer ? G.enemy : G.player; }
export function isLeader(t)    { return t === G.player || t === G.enemy; }
