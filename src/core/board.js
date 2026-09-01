/* =========================================================
   盤面の 読み取り
   状態を 変えない問い合わせだけを ここに集める。
   ガード・ブロック・攻撃対象の 判定＝ゲームの心臓なので、
   ここには テストを書く（test/board.test.js）
   ========================================================= */
import { CARD_MAP, MAX_SLOTS } from "./cards.js";
import { G, opponentOf, isLeader } from "./state.js";

/** 生きているユニットだけ返す（やられた演出中のものは除外） */
export function allUnits(side) {
  return [...side.front, ...side.back].filter(u => u && u.hp > 0);
}

export function hasFreeSlot(side) {
  return side.front.includes(null) || side.back.includes(null);
}

/** そのレーンに 生きているユニットが いるか */
export function laneOccupied(side, i) {
  const f = side.front[i], b = side.back[i];
  return !!((f && f.hp > 0) || (b && b.hp > 0));   // かならず true/false を返す
}


/** リーダーが まもられているか（3レーンすべてが埋まっている） */
export function leaderBlocked(side) {
  for (let i = 0; i < MAX_SLOTS; i++) if (!laneOccupied(side, i)) return false;
  return true;
}

/** そのユニットが 前列のなかまに かばわれているか */
export function isCovered(side, row, i) {
  if (row !== "back") return false;
  const f = side.front[i];
  return !!(f && f.hp > 0);
}

export function laneUnits(side, i) {
  return [side.front[i], side.back[i]].filter(u => u && u.hp > 0);
}

/** ユニットが 盤面のどこにいるか */
export function unitLocation(unit) {
  for (const side of [G.player, G.enemy]) {
    for (const row of ["front", "back"]) {
      const idx = side[row].indexOf(unit);
      if (idx >= 0) return { side, row, idx };
    }
  }
  return null;
}

/** たて一列の効果が ねらえるレーン（敵がいるレーンだけ） */
export function candidateLanes(side) {
  const foe = opponentOf(side);
  const lanes = [];
  for (let i = 0; i < MAX_SLOTS; i++) if (laneOccupied(foe, i)) lanes.push(i);
  return lanes;
}

/** よこ一列の効果が ねらえる列（敵がいる列だけ） */
export function candidateRows(side) {
  const foe = opponentOf(side);
  const rows = [];
  for (const row of ["front", "back"]) {
    if (foe[row].some(u => u && u.hp > 0)) rows.push(row);
  }
  return rows;
}

/* -----------------------------------------------------------
   攻撃ルール
   ① 前列のユニットは いつでも狙える
   ② 後列のユニットは、同じレーンの前列が空いているときだけ狙える
   ③ 3レーンすべてに ユニットがいると リーダーを狙えない
      （前列でも後列でもよい）。とくぎは このブロックを無視する
   ----------------------------------------------------------- */
export function legalAttackTargets(attackerSide) {
  const foe = opponentOf(attackerSide);
  const targets = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const f = foe.front[i], b = foe.back[i];
    if (f && f.hp > 0) targets.push(f);
    else if (b && b.hp > 0) targets.push(b);   // 前が空いているレーンだけ後列を狙える
  }
  if (!leaderBlocked(foe)) targets.push(foe);
  return targets;
}

export function canAttack(unit) {
  return unit.hp > 0 && !unit.sick && !unit.attacked && !unit.frozen && unit.atk > 0;
}

export function canPlay(side, cardId) {
  const c = CARD_MAP[cardId];
  if (side.mp < c.cost) return false;
  if (c.type === "unit") return hasFreeSlot(side);

  const e = c.effect;
  if ((e.target === "enemyUnit" || e.target === "enemyAll") && allUnits(opponentOf(side)).length === 0) return false;
  if ((e.target === "allyUnit"  || e.target === "allyAll")  && allUnits(side).length === 0) return false;
  if (e.target === "enemyLane" && candidateLanes(side).length === 0) return false;
  if (e.target === "enemyRow"  && candidateRows(side).length === 0) return false;
  return true;
}


export function effectCandidates(effect, side) {
  const foe = opponentOf(side);
  switch (effect.target) {
    case "enemyUnit": return allUnits(foe);
    case "enemyAny":  return [...allUnits(foe), foe];   // リーダーも ねらえる
    case "enemyAll":  return allUnits(foe);
    case "allyUnit":  return allUnits(side);
    case "allyAll":   return allUnits(side);
    case "allyAny":   return [...allUnits(side), side];
    default: return [];
  }
}

