/* =========================================================
   ゲームの状態
   G ひとつに ぜんぶ入っている。JSONにできる形を たもつこと
   （相手に そのまま送れることが 対人戦の 前提になる）
   ========================================================= */
import { CARDS, START_HP } from "./cards.js";

/** 対戦の状態。ESMの live binding なので、import 先でも最新が見える */
export let G = null;
export function setG(g) { G = g; }

let uidCounter = 0;
export function nextUid() { return ++uidCounter; }
export function resetUid() { uidCounter = 0; }

export function makeDeck() {
  const deck = [];
  CARDS.forEach(c => { for (let i = 0; i < (c.count || 2); i++) deck.push(c.id); });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function makeSide(isPlayer) {
  return {
    isPlayer, hp: START_HP, mp: 0, maxMp: 0,
    deck: makeDeck(), hand: [],
    front: [null, null, null],
    back:  [null, null, null],
    fatigue: 0,
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

export function sideName(side) { return side.isPlayer ? "ゆうしゃ" : "まおう"; }
export function sideOf(unit)   { return unit.side === "player" ? G.player : G.enemy; }
export function opponentOf(side) { return side.isPlayer ? G.enemy : G.player; }
export function isLeader(t)    { return t === G.player || t === G.enemy; }
