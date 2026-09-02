"use strict";

/* =========================================================
   グリフォン（GRID FORMATION）
   盤面の読み取りは core/ にある。ここは 状態を変える処理と
   CPU・描画・操作の 結線。
   ========================================================= */
import {
  CARDS, CARD_MAP, MAX_SLOTS, START_HP, MAX_MP, HAND_MAX, CLEANUP_DELAY,
} from "./core/cards.js";
import {
  G, setG, makeGame, nextUid, snapshot, restore,
  sideName, sideOf, opponentOf, isLeader,
} from "./core/state.js";
import {
  allUnits, hasFreeSlot, laneOccupied, leaderBlocked, isCovered,
  laneUnits, unitLocation, candidateLanes, candidateRows,
  legalAttackTargets, canAttack, canPlay, effectCandidates,
} from "./core/board.js";

/** 新しい対戦を はじめる（状態づくりは core、演出は ここ） */
function newGame() {
  setG(makeGame());
  document.getElementById("fx").innerHTML = "";
  for (let i = 0; i < 3; i++) draw(G.player);
  for (let i = 0; i < 4; i++) draw(G.enemy);
  log("たたかいが はじまった！");
  startTurn("player");
}

/* スマホで 実寸表示させる（<head> を 用意できない場所でも きくように） */
(function ensureViewport() {
  if (document.querySelector('meta[name="viewport"]')) return;
  const m = document.createElement("meta");
  m.name = "viewport";
  m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  (document.head || document.documentElement).appendChild(m);
})();



/* =========================================================
   セットアップ
   ========================================================= */



/* =========================================================
   基本
   ========================================================= */
function draw(side) {
  if (side.deck.length === 0) {
    side.fatigue++;
    side.hp -= side.fatigue;
    log(`${sideName(side)}は やまふだが つきて ${side.fatigue}ダメージ！`);
    checkGameOver();
    return;
  }
  const id = side.deck.pop();
  if (side.hand.length >= HAND_MAX) {
    log(`てふだが あふれて「${CARD_MAP[id].name}」は きえた…`);
    return;
  }
  side.hand.push(id);
}


function log(msg) {
  G.logs.unshift(msg);
  if (G.logs.length > 40) G.logs.pop();
  renderLog();
}


/* =========================================================
   ターン進行
   ========================================================= */
function startTurn(who) {
  G.turn = who;
  G.turnCount++;
  const side = who === "player" ? G.player : G.enemy;

  side.maxMp = Math.min(MAX_MP, side.maxMp + 1);
  side.mp = side.maxMp;
  allUnits(side).forEach(u => {
    u.sick = false;
    u.attacked = false;
    if (u.frozen) {                       // こおりは 自分のターンが 来るたびに 1へる
      u.frozen--;
      if (u.frozen <= 0) { delete u.frozen; log(`${u.name}の こおりが とけた`); }
    }
  });
  draw(side);
  if (G.over) return;

  log(`━ ${sideName(side)}の ターン ━`);
  clearPick();

  if (who === "enemy") {
    G.busy = true;
    render();
    setTimeout(aiStep, 800);
  } else {
    G.busy = false;
    render();
  }
}

function endTurn() {
  if (G.over || G.busy) return;
  clearPick();
  startTurn(G.turn === "player" ? "enemy" : "player");
}

/* =========================================================
   カードをプレイできるか
   ========================================================= */





function summon(side, cardId, row, idx) {
  const c = CARD_MAP[cardId];
  const unit = {
    uid: nextUid(),
    id: c.id, name: c.name, emoji: c.emoji,
    atk: c.atk, hp: c.hp, maxHp: c.hp,
    sick: !c.rush,                    // rush なら 召喚した ターンから 攻撃できる
    attacked: false, side: side.isPlayer ? "player" : "enemy",
    lifesteal: !!c.lifesteal,
  };
  side[row][idx] = unit;
  log(`${sideName(side)}は「${c.name}」を ${row === "front" ? "ぜんれつ" : "こうれつ"}に よびだした！`);
  return unit;
}

/* =========================================================
   効果とダメージ
   ========================================================= */
function applyEffect(effect, targets, caster) {
  const side = caster || G.player;
  if (effect.fx) playFx(effect, side, targets[0], null);

  // 対象をとらない効果
  if (effect.kind === "mp") {
    const before = side.mp;
    side.mp += effect.value;          // そのターンだけ 上限を こえられる
    log(`MPが ${side.mp - before} かいふくした`);
    floatNum(side, `MP+${side.mp - before}`, "buff");
    render();
    return;
  }
  if (effect.kind === "draw") {
    for (let i = 0; i < effect.value; i++) draw(side);
    log(`カードを ${effect.value}枚 ひいた`);
    scheduleCleanup();
    return;
  }
  if (effect.kind === "search") {
    searchDeck(side, effect);
    scheduleCleanup();
    return;
  }

  targets.forEach(t => {
    if (effect.kind === "damage")    dealDamage(t, effect.value);
    else if (effect.kind === "freeze") {
      if (effect.value > 0) dealDamage(t, effect.value);
      if (t.hp > 0) {
        t.frozen = 2;                 // 自分の次のターンが 終わるまで 攻撃できない
        floatNum(t, "こおった！", "freeze");
        log(`${t.name}は こおりついた！`);
      }
    }
    else if (effect.kind === "heal") healTarget(t, effect.value);
    else if (effect.kind === "buff") {
      t.atk += effect.value;
      t.hp += effect.value;
      t.maxHp += effect.value;
      floatNum(t, `+${effect.value}/+${effect.value}`, "buff");
    }
    else if (effect.kind === "buffAtk") {
      t.atk += effect.value;
      floatNum(t, `攻+${effect.value}`, "buff");
    }
  });
  scheduleCleanup();
}







/* =========================================================
   効果の解決とダメージ（ここは まだ画面に触っている。
   つぎの段で core に引き剥がす）
   ========================================================= */
/** デッキから 条件に合うカードを 手札に加える */
function searchDeck(side, effect) {
  let found = 0;
  for (let i = 0; i < effect.value; i++) {
    const at = side.deck.findIndex(id => {
      const c = CARD_MAP[id];
      if (effect.filter === "unit"  && c.type !== "unit")  return false;
      if (effect.filter === "spell" && c.type !== "spell") return false;
      if (effect.maxCost !== undefined && c.cost > effect.maxCost) return false;
      return true;
    });
    if (at < 0) break;
    const [id] = side.deck.splice(at, 1);
    if (side.hand.length < HAND_MAX) { side.hand.push(id); found++; }
    else log(`手札が いっぱいで「${CARD_MAP[id].name}」は もえてしまった…`);
  }
  if (found > 0) log(`デッキから ${found}枚 手札に くわえた！`);
  else log("デッキに 条件に合う カードが なかった…");
}

/** よこ一列（ぜんれつ or こうれつ）に はたらく効果 */
function applyRowEffect(effect, foe, row) {
  playFx(effect, opponentOf(foe), null, null);
  const inner = Object.assign({}, effect);
  delete inner.fx;
  const targets = foe[row].filter(u => u && u.hp > 0);
  log(`${row === "front" ? "ぜんれつ" : "こうれつ"}を なぎはらった！`);
  applyEffect(inner, targets, opponentOf(foe));
}

/** たて一列に はたらく効果 */
function applyLaneEffect(effect, foe, lane) {
  playFx(effect, opponentOf(foe), null, lane);

  if (effect.kind === "swap") {
    const f = foe.front[lane], b = foe.back[lane];
    foe.front[lane] = b;
    foe.back[lane]  = f;
    log(`${lane + 1}れつ目の 前後が 入れかわった！`);
    render();
    scheduleCleanup();
    return;
  }
  const inner = Object.assign({}, effect);
  delete inner.fx;                                 // エフェクトは もう再生ずみ
  applyEffect(inner, laneUnits(foe, lane), opponentOf(foe));
}

function dealDamage(target, amount) {
  if (isLeader(target)) {
    target.hp -= amount;
    floatNum(target, `${amount}`, "dmg");
    shakeEl(leaderEl(target));
  } else {
    target.hp -= amount;
    floatNum(target, `${amount}`, "dmg");
    shakeEl(unitEl(target));
  }
}

function healTarget(target, amount) {
  const cap = isLeader(target) ? START_HP : target.maxHp;
  const before = target.hp;
  target.hp = Math.min(cap, target.hp + amount);
  fxHeal(target);                                  // 回復は いつでも 緑のキラキラ
  floatNum(target, `+${target.hp - before}`, "heal");
}

/** やられたユニットを少し遅れて盤面から消す（演出のため） */
function scheduleCleanup() {
  render();
  const dying = [];
  [G.player, G.enemy].forEach(side => {
    ["front", "back"].forEach(row => {
      side[row].forEach(u => { if (u && u.hp <= 0) dying.push(u); });
    });
  });
  dying.forEach(u => {
    if (u.logged) return;
    u.logged = true;
    log(`「${u.name}」は たおれた…`);

    // 死亡時：〜 の効果を ここで 発動する
    const card = CARD_MAP[u.id];
    const de = card && card.effect;
    if (de && de.when === "death") {
      log(`「${u.name}」の 死亡時こうかが はつどうした！`);
      const owner = sideOf(u);
      if (de.kind === "search" || de.kind === "draw" || de.kind === "mp") {
        applyEffect(Object.assign({}, de), [], owner);
      } else if (de.target === "enemyAll") {
        applyEffect(Object.assign({}, de), allUnits(opponentOf(owner)), owner);
      } else if (de.target === "allyAll") {
        applyEffect(Object.assign({}, de), allUnits(owner), owner);
      }
      // 対象を選ぶタイプの死亡時効果は、いまは 未対応（必要になったら 実装する）
    }
  });
  checkGameOver();   // ← 死亡処理待ちでも 勝敗判定は必ず通す

  if (dying.length === 0 || G.cleanupTimer) return;
  G.cleanupTimer = setTimeout(() => {
    G.cleanupTimer = null;
    [G.player, G.enemy].forEach(side => {
      ["front", "back"].forEach(row => {
        side[row].forEach((u, i) => { if (u && u.hp <= 0) side[row][i] = null; });
      });
    });
    render();
  }, CLEANUP_DELAY);
}

function checkGameOver() {
  if (G.over) return;
  if (G.player.hp <= 0 && G.enemy.hp <= 0) finish("draw");
  else if (G.enemy.hp <= 0)  finish("win");
  else if (G.player.hp <= 0) finish("lose");
}

function finish(result) {
  G.over = true;
  G.busy = true;
  setTimeout(() => {
    const t = document.getElementById("modal-title");
    const s = document.getElementById("modal-sub");
    const r = document.getElementById("modal-rules");
    const n = document.getElementById("modal-note");
    if (result === "win")  { t.textContent = "しょうり！"; s.textContent = "まおうを たおした"; }
    if (result === "lose") { t.textContent = "ぜんめつ…";  s.textContent = "ゆうしゃは たおれた"; }
    if (result === "draw") { t.textContent = "ひきわけ";    s.textContent = "おたがい たおれた"; }
    r.innerHTML = "";
    n.textContent = result === "lose"
      ? "ヒント：3レーンすべてを 埋めると リーダーを ねらわれなくなるよ。"
      : `${G.turnCount}ターンの たたかいだった。`;
    document.getElementById("modal-btn").textContent = "もういちど";
    document.getElementById("overlay").classList.add("show");
  }, 900);
}

function doAttack(attacker, target) {
  attacker.attacked = true;
  const dealt = Math.min(attacker.atk, Math.max(0, target.hp));   // 実際に あたえたダメージ

  if (isLeader(target)) {
    log(`「${attacker.name}」の こうげき！ ${sideName(target)}に ${attacker.atk}ダメージ`);
    dealDamage(target, attacker.atk);
  } else {
    log(`「${attacker.name}」が 「${target.name}」に こうげき！`);
    dealDamage(target, attacker.atk);
    if (target.atk > 0) dealDamage(attacker, target.atk);   // はんげき
  }

  // 吸血：はんげきのあと、生きていれば あたえたダメージ分 回復
  if (attacker.lifesteal && dealt > 0 && attacker.hp > 0) {
    const before = attacker.hp;
    healTarget(attacker, dealt);
    if (attacker.hp > before) log(`「${attacker.name}」は ${attacker.hp - before} かいふくした！`);
  }
  scheduleCleanup();
}

/* =========================================================
   プレイヤー操作
   ========================================================= */
function clearPick() {
  G.mode = "idle";
  G.pickedCard = null;
  G.pickedUnit = null;
  G.pending = null;
  render();
}

function myTurn() { return G && !G.busy && !G.over && G.turn === "player"; }


function onCardClick(idx) {
  if (!myTurn()) return;
  const cardId = G.player.hand[idx];
  if (!canPlay(G.player, cardId)) return;
  if (G.pickedCard === idx) { clearPick(); return; }

  const c = CARD_MAP[cardId];
  G.pickedUnit = null;
  G.pickedCard = idx;

  if (c.type === "unit") {
    G.mode = "place";
  } else {
    const e = c.effect;
    if (needsNoTarget(e)) { castSpell(idx, null); return; }
    G.mode = "target";
    G.pending = {
      effect: e, fromHand: true,
      lane: e.target === "enemyLane",
      row:  e.target === "enemyRow",
    };
  }
  render();
}

/** 対象を えらばなくていい効果か */
function needsNoTarget(e) {
  return e.target === "enemyAll" || e.target === "allyAll" || e.target === "self";
}

function onSlotClick(row, idx) {
  if (!myTurn() || G.mode !== "place") return;
  if (G.player[row][idx]) return;

  const handIdx = G.pickedCard;
  const cardId = G.player.hand[handIdx];
  const c = CARD_MAP[cardId];

  G.player.mp -= c.cost;
  G.player.hand.splice(handIdx, 1);
  const unit = summon(G.player, cardId, row, idx);

  G.pickedCard = null;
  G.mode = "idle";

  if (c.effect) {
    const e = c.effect;
    if (e.target === "enemyAll")     { applyEffect(e, allUnits(G.enemy), G.player); render(); return; }
    if (e.target === "allyAll")      { applyEffect(e, allUnits(G.player), G.player); render(); return; }
    if (e.target === "self")         { applyEffect(e, [], G.player); render(); return; }
    if (e.target === "enemyLane") {
      if (candidateLanes(G.player).length > 0) {
        G.mode = "target";
        G.pending = { effect: e, fromHand: false, source: unit, lane: true };
      }
    } else if (e.target === "enemyRow") {
      if (candidateRows(G.player).length > 0) {
        G.mode = "target";
        G.pending = { effect: e, fromHand: false, source: unit, row: true };
      }
    } else if (effectCandidates(e, G.player).length > 0) {
      G.mode = "target";
      G.pending = { effect: e, fromHand: false, source: unit };
    }
  }
  render();
}

function castSpell(handIdx, target) {
  const cardId = G.player.hand[handIdx];
  const c = CARD_MAP[cardId];
  G.player.mp -= c.cost;
  G.player.hand.splice(handIdx, 1);
  log(`ゆうしゃは「${c.name}」を となえた！`);

  const e = c.effect;
  if (e.target === "enemyLane")     applyLaneEffect(e, G.enemy, target);
  else if (e.target === "enemyRow") applyRowEffect(e, G.enemy, target);
  else if (e.target === "enemyAll") applyEffect(e, allUnits(G.enemy), G.player);
  else if (e.target === "allyAll")  applyEffect(e, allUnits(G.player), G.player);
  else if (e.target === "self")     applyEffect(e, [], G.player);
  else                              applyEffect(e, [target], G.player);
  clearPick();
}

/** たて一列を えらんだとき */
function onLaneClick(lane) {
  if (!myTurn() || G.mode !== "target" || !G.pending || !G.pending.lane) return;
  if (!candidateLanes(G.player).includes(lane)) return;

  if (G.pending.fromHand) castSpell(G.pickedCard, lane);
  else { applyLaneEffect(G.pending.effect, G.enemy, lane); clearPick(); }
}

/** よこ一列を えらんだとき */
function onRowClick(row) {
  if (!myTurn() || G.mode !== "target" || !G.pending || !G.pending.row) return;
  if (!candidateRows(G.player).includes(row)) return;

  if (G.pending.fromHand) castSpell(G.pickedCard, row);
  else { applyRowEffect(G.pending.effect, G.enemy, row); clearPick(); }
}

function onTargetClick(target) {
  if (!myTurn()) return;

  if (G.mode === "attack" && G.pickedUnit) {
    if (!legalAttackTargets(G.player).includes(target)) return;
    doAttack(G.pickedUnit, target);
    clearPick();
    return;
  }
  if (G.mode === "target" && G.pending) {
    if (G.pending.lane) return;   // レーン選択は onLaneClick で処理
    if (!effectCandidates(G.pending.effect, G.player).includes(target)) return;
    if (G.pending.fromHand) castSpell(G.pickedCard, target);
    else { applyEffect(G.pending.effect, [target], G.player); clearPick(); }
  }
}

function onLeaderClick(side) {
  if (!myTurn()) return;
  onTargetClick(side);
}

function onUnitClick(unit) {
  if (!myTurn() || unit.hp <= 0) return;
  const mine = sideOf(unit) === G.player;

  // レーンを選ぶ効果のときは、敵ユニットのクリックも レーン選択として扱う
  if (G.mode === "target" && G.pending && G.pending.lane) {
    if (mine) return;
    const loc = unitLocation(unit);
    if (loc) onLaneClick(loc.idx);
    return;
  }

  // よこ一列を選ぶ効果のときは、クリックした敵ユニットの 列を えらぶ
  if (G.mode === "target" && G.pending && G.pending.row) {
    if (mine) return;
    const loc = unitLocation(unit);
    if (loc) onRowClick(loc.row);
    return;
  }

  if (mine && G.mode !== "target") {
    if (G.pickedUnit === unit) { clearPick(); return; }
    if (!canAttack(unit)) return;
    if (legalAttackTargets(G.player).length === 0) return;
    G.pickedUnit = unit;
    G.pickedCard = null;
    G.mode = "attack";
    render();
    return;
  }
  onTargetClick(unit);
}

/* =========================================================
   CPU
   ========================================================= */
function aiStep() {
  if (G.over) { G.busy = false; return; }
  const E = G.enemy;

  // 1. カードを出す（MPを使い切る方向で）
  const playable = E.hand
    .map((id, i) => ({ id, i, c: CARD_MAP[id] }))
    .filter(x => canPlay(E, x.id) && aiIsWorthPlaying(E, x.c))
    .sort((a, b) => b.c.cost - a.c.cost);

  if (playable.length > 0) {
    aiPlayCard(aiChooseCard(playable));
    render();
    setTimeout(aiStep, 780);
    return;
  }

  // 2. 攻撃する
  const attacker = allUnits(E).find(u => canAttack(u));
  if (attacker) {
    const target = aiChooseAttackTarget(attacker);
    if (target) {
      doAttack(attacker, target);
      setTimeout(aiStep, 780);
    } else {
      attacker.attacked = true;
      setTimeout(aiStep, 60);
    }
    return;
  }

  // 3. ターンを渡す
  setTimeout(() => { if (!G.over) startTurn("player"); else G.busy = false; }, 550);
}

/** ムダ打ちを避ける（満タンなのに回復、など） */
function aiIsWorthPlaying(E, c) {
  if (c.type !== "spell") return true;
  const e = c.effect;
  if (e.kind === "heal") {
    const hurtAlly = allUnits(E).some(u => u.hp < u.maxHp);
    const hurtLeader = E.hp <= START_HP - e.value;
    return hurtAlly || (e.target === "allyAny" && hurtLeader);
  }
  if (e.kind === "buff")    return allUnits(E).length >= 2;        // 1体だけなら温存
  if (e.kind === "buffAtk") return allUnits(E).some(u => !u.sick); // すぐ殴れる子がいるとき
  if (e.kind === "draw")    return E.hand.length + e.value - 1 <= HAND_MAX;
  if (e.kind === "swap")    return aiChooseLane(e) !== null;
  if (e.kind === "search") {
    if (E.hand.length + e.value - 1 > HAND_MAX) return false;
    return E.deck.some(id => {                        // 撃つ前に タマがあるか 確かめる
      const t = CARD_MAP[id];
      if (e.filter === "unit"  && t.type !== "unit")  return false;
      if (e.filter === "spell" && t.type !== "spell") return false;
      if (e.maxCost !== undefined && t.cost > e.maxCost) return false;
      return true;
    });
  }
  // こおらせるのは これから殴ってきそうな相手がいるときだけ
  if (e.kind === "freeze")  return allUnits(G.player).some(u => u.atk > 0 && !u.frozen);
  return true;
}

/** たて一列の効果で どのレーンを ねらうか */
function aiChooseLane(effect) {
  const P = G.player;
  const lanes = candidateLanes(G.enemy);
  if (!lanes.length) return null;

  if (effect.kind === "swap") {
    // 前列に壁、後列に本命がいるレーンを 入れ替えて 本命を引きずり出す
    const good = lanes.filter(i => P.front[i] && P.front[i].hp > 0 && P.back[i] && P.back[i].hp > 0);
    if (!good.length) return null;
    return good.sort((a, b) => P.back[a].hp - P.back[b].hp)[0];
  }
  // ダメージ：一番おいしいレーン
  const score = (i) => laneUnits(P, i).reduce((s, u) =>
    s + Math.min(u.hp, effect.value) + (u.hp <= effect.value ? 3 + u.atk : 0), 0);
  return lanes.slice().sort((a, b) => score(b) - score(a))[0];
}

/** よこ一列の効果で ぜんれつ／こうれつ どちらを ねらうか */
function aiChooseRow(effect) {
  const P = G.player;
  const rows = candidateRows(G.enemy);
  if (!rows.length) return null;
  const score = (row) => P[row].filter(u => u && u.hp > 0).reduce((s, u) =>
    s + Math.min(u.hp, effect.value) + (u.hp <= effect.value ? 3 + u.atk : 0), 0);
  return rows.slice().sort((a, b) => score(b) - score(a))[0];
}

function aiChooseCard(playable) {
  const foes = allUnits(G.player);

  // まとめて倒せるなら全体攻撃
  const storm = playable.find(x => x.c.effect && x.c.effect.target === "enemyAll");
  if (storm && foes.filter(u => u.hp <= storm.c.effect.value).length >= 2) return storm;

  // たて一列で2体まとめて倒せるなら それ
  for (const x of playable) {
    const e = x.c.effect;
    if (e && e.kind === "damage" && e.target === "enemyLane") {
      const lane = aiChooseLane(e);
      if (lane !== null && laneUnits(G.player, lane).filter(u => u.hp <= e.value).length >= 2) return x;
    }
  }

  // 確実に除去できる呪文があれば使う
  for (const x of playable) {
    const e = x.c.effect;
    if (x.c.type === "spell" && e && e.kind === "damage" && e.target === "enemyUnit") {
      if (foes.some(u => u.hp <= e.value && u.atk >= 3)) return x;
    }
  }
  return playable[0];   // 一番コストが高いもの
}

function aiPlayCard(pick) {
  const E = G.enemy;
  const c = pick.c;
  E.mp -= c.cost;
  E.hand.splice(pick.i, 1);

  const resolve = (e) => {
    if (e.target === "enemyLane") {
      const lane = aiChooseLane(e);
      if (lane !== null) applyLaneEffect(e, G.player, lane);
    }
    else if (e.target === "enemyRow") {
      const row = aiChooseRow(e);
      if (row !== null) applyRowEffect(e, G.player, row);
    }
    else if (e.target === "enemyAll") applyEffect(e, allUnits(G.player), E);
    else if (e.target === "allyAll")  applyEffect(e, allUnits(E), E);
    else if (e.target === "self")     applyEffect(e, [], E);
    else {
      const t = aiChooseEffectTarget(e);
      if (t) applyEffect(e, [t], E);
    }
  };

  if (c.type === "unit") {
    const spot = aiPlaceUnit(E, c);
    summon(E, c.id, spot.row, spot.idx);
    if (c.effect) resolve(c.effect);
  } else {
    log(`まおうは「${c.name}」を となえた！`);
    resolve(c.effect);
  }
}

/** どこに置くか：空きレーンを埋めてリーダーを守る＞脆い子は かばわれる後列へ */
function aiPlaceUnit(E, c) {
  const tanky = c.hp >= 4 || c.hp > c.atk;
  let best = null, bestScore = -Infinity;

  for (const row of ["front", "back"]) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (E[row][i]) continue;
      const laneEmpty = !laneOccupied(E, i);
      const frontHere = !!(E.front[i] && E.front[i].hp > 0);
      const backHere  = !!(E.back[i]  && E.back[i].hp  > 0);

      let s;
      if (row === "back") {
        s = frontHere ? 8 : 2;          // かばわれる後列は おいしい
        if (!tanky) s += 3;             // 脆い子ほど 後ろへ
      } else {
        s = 5;
        if (backHere) s += 2;           // 後ろのなかまを かばえる
        if (tanky)    s += 3;           // かたい子は 壁向き
      }
      if (laneEmpty) s += 6;            // リーダーブロックを作るのが最優先

      if (s > bestScore) { bestScore = s; best = { row, idx: i }; }
    }
  }
  return best;
}

function aiChooseEffectTarget(effect) {
  if (effect.kind === "damage") {
    const foes = allUnits(G.player);
    const canHitLeader = effect.target === "enemyAny";

    if (canHitLeader && G.player.hp <= effect.value) return G.player;   // とどめ
    if (foes.length === 0) return canHitLeader ? G.player : null;

    const killable = foes.filter(u => u.hp <= effect.value);
    if (killable.length > 0) return killable.slice().sort((a, b) => b.atk - a.atk)[0];
    if (canHitLeader) return G.player;                                  // 倒せないなら 顔を殴る
    return foes.slice().sort((a, b) => b.atk - a.atk)[0];
  }
  if (effect.kind === "heal") {
    const hurt = allUnits(G.enemy).filter(u => u.hp < u.maxHp)
                   .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (effect.target === "allyAny") {
      if (G.enemy.hp <= 12) return G.enemy;
      return hurt[0] || G.enemy;
    }
    return hurt[0] || allUnits(G.enemy)[0] || null;
  }
  if (effect.kind === "buffAtk") {
    // すぐ殴れる子のうち 一番強いやつを さらに強く
    const ready = allUnits(G.enemy).filter(u => !u.sick);
    return (ready.length ? ready : allUnits(G.enemy)).sort((a, b) => b.atk - a.atk)[0] || null;
  }
  return null;
}

function aiChooseAttackTarget(attacker) {
  const legal = legalAttackTargets(G.enemy);
  if (legal.length === 0) return null;
  const units  = legal.filter(t => !isLeader(t));
  const leader = legal.includes(G.player) ? G.player : null;

  if (leader && G.player.hp <= attacker.atk) return leader;                    // とどめ
  const freeKill = units.filter(u => u.hp <= attacker.atk && u.atk < attacker.hp)
                        .sort((a, b) => b.atk - a.atk)[0];
  if (freeKill) return freeKill;                                               // 一方的に倒せる
  const trade = units.filter(u => u.hp <= attacker.atk)
                     .sort((a, b) => b.atk - a.atk)[0];
  if (trade && trade.atk >= attacker.atk) return trade;                        // 相打ち上等
  if (trade) return trade;
  if (leader) return leader;                                                   // 顔を殴る
  return units.slice().sort((a, b) => a.atk - b.atk)[0] || null;
}

/* =========================================================
   描画
   ========================================================= */
const unitEls = new Map();

function unitEl(u) { return unitEls.get(u.uid) || null; }
function leaderEl(side) {
  return document.getElementById(side === G.player ? "player-leader" : "enemy-leader");
}

function render() {
  if (!G) return;
  renderLeaders();
  renderBoard();
  renderHand();
  renderEnemyHand();
  renderButton();
  renderHint();
}

function currentTargets() {
  if (!myTurn()) return [];
  if (G.mode === "attack" && G.pickedUnit) return legalAttackTargets(G.player);
  if (G.mode === "target" && G.pending) {
    if (G.pending.lane) return [];   // レーン選択中は 個別の対象は光らせない
    return effectCandidates(G.pending.effect, G.player);
  }
  return [];
}

/** いま光らせるべき たてレーン */
function currentLanes() {
  if (!myTurn() || G.mode !== "target" || !G.pending || !G.pending.lane) return [];
  return candidateLanes(G.player);
}

/** よこ一列を えらぶ状態のとき、光らせる列 */
function currentRows() {
  if (!myTurn() || G.mode !== "target" || !G.pending || !G.pending.row) return [];
  return candidateRows(G.player);
}

function renderLeaders() {
  document.getElementById("player-hp").textContent = Math.max(0, G.player.hp);
  document.getElementById("enemy-hp").textContent  = Math.max(0, G.enemy.hp);
  document.getElementById("player-mp").textContent = G.player.mp;
  document.getElementById("player-maxmp").textContent = G.player.maxMp;
  document.getElementById("enemy-mp").textContent  = G.enemy.mp;
  document.getElementById("enemy-maxmp").textContent = G.enemy.maxMp;
  document.getElementById("player-deck").textContent = G.player.deck.length;
  document.getElementById("enemy-deck").textContent  = G.enemy.deck.length;

  const pips = document.getElementById("mp-pips");
  pips.innerHTML = "";
  for (let i = 0; i < Math.max(G.player.maxMp, G.player.mp); i++) {
    const d = document.createElement("div");
    d.className = "pip" + (i < G.player.mp ? " full" : "");
    pips.appendChild(d);
  }

  const targets = currentTargets();
  [["player-leader", "player-guard", G.player], ["enemy-leader", "enemy-guard", G.enemy]].forEach(([id, gid, side]) => {
    document.getElementById(id).classList.toggle("targetable", targets.includes(side));
    document.getElementById(gid).hidden = !leaderBlocked(side);
  });
}

function renderBoard() {
  const layout = [
    { id:"enemy-back",   side:G.enemy,  row:"back"  },
    { id:"enemy-front",  side:G.enemy,  row:"front" },
    { id:"player-front", side:G.player, row:"front" },
    { id:"player-back",  side:G.player, row:"back"  },
  ];
  const targets = currentTargets();
  const lanes = currentLanes();
  const rows  = currentRows();
  unitEls.clear();

  layout.forEach(({ id, side, row }) => {
    const rowEl = document.getElementById(id);
    const tag = rowEl.querySelector(".row-tag");
    rowEl.innerHTML = "";
    if (tag) rowEl.appendChild(tag);

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      const unit = side[row][i];

      // たて一列の効果：敵側のレーン全体を光らせる
      if (side === G.enemy && lanes.includes(i)) {
        slot.classList.add("lane-target");
        slot.onclick = (ev) => { ev.stopPropagation(); onLaneClick(i); };
      }
      // よこ一列の効果：敵側の その列ぜんぶを光らせる
      if (side === G.enemy && rows.includes(row)) {
        slot.classList.add("lane-target");
        slot.onclick = (ev) => { ev.stopPropagation(); onRowClick(row); };
      }

      if (unit) {
        slot.appendChild(buildUnit(unit, side, row, i, targets));
      } else if (side === G.player && G.mode === "place" && myTurn()) {
        slot.classList.add("droppable");
        slot.onclick = (ev) => { ev.stopPropagation(); onSlotClick(row, i); };
      }
      rowEl.appendChild(slot);
    }
  });
}

function buildUnit(unit, side, row, i, targets) {
  const el = document.createElement("div");
  el.className = "unit" + (side === G.enemy ? " foe" : "");
  unitEls.set(unit.uid, el);

  if (unit.hp <= 0) el.classList.add("dying");
  else {
    if (isCovered(side, row, i)) el.classList.add("covered");
    if (unit.frozen) el.classList.add("frozen");
    if (side === G.player) {
      if (unit.sick && !unit.frozen) el.classList.add("sick");
      if (myTurn()) {
        if (canAttack(unit)) {
          if (G.mode !== "target") el.classList.add("ready");
        } else if (unit.sick || unit.attacked) {
          el.classList.add("spent");       // まだ動けない / もう動いた
        }
      }
      if (G.pickedUnit === unit) el.classList.add("picked");
    }
    if (targets.includes(unit)) el.classList.add("targetable");
  }

  const nameCls = unit.name.length > 7 ? " xlong" : unit.name.length > 5 ? " long" : "";

  el.innerHTML =
    `<div class="unit-emoji">${unit.emoji}</div>` +
    `<div class="unit-name${nameCls}">${unit.name}</div>` +
    `<div class="unit-stats">` +
      `<div class="orb atk">${unit.atk}</div>` +
      `<div class="orb hp${unit.hp < unit.maxHp ? " hurt" : ""}">${Math.max(0, unit.hp)}</div>` +
    `</div>`;

  el.onclick = (ev) => { ev.stopPropagation(); onUnitClick(unit); };
  return el;
}

function renderHand() {
  const handEl = document.getElementById("player-hand");
  handEl.innerHTML = "";

  G.player.hand.forEach((cardId, idx) => {
    const c = CARD_MAP[cardId];
    const ok = myTurn() && canPlay(G.player, cardId);

    const el = document.createElement("div");
    el.className = "card" + (c.type === "spell" ? " spell" : "")
                 + (ok ? " playable" : " locked")
                 + (G.pickedCard === idx ? " picked" : "");

    const foot = c.type === "unit"
      ? `<div class="card-foot"><div class="orb atk">${c.atk}</div><div class="orb hp">${c.hp}</div></div>`
      : `<div class="card-foot"><div class="spell-tag">とくぎ</div></div>`;

    const txt = c.text || "";
    const size = txt.length > 20 ? " xlong" : txt.length > 14 ? " long" : "";

    el.innerHTML =
      `<div class="card-cost">${c.cost}</div>` +
      `<div class="card-art">${c.emoji}</div>` +
      `<div class="card-name">${c.name}</div>` +
      `<div class="card-text${size}">${txt}</div>` + foot;

    el.onclick = () => onCardClick(idx);
    handEl.appendChild(el);
  });
}

function renderEnemyHand() {
  const el = document.getElementById("enemy-hand");
  el.innerHTML = "";
  for (let i = 0; i < G.enemy.hand.length; i++) {
    const b = document.createElement("div");
    b.className = "card-back";
    b.textContent = "✦";
    el.appendChild(b);
  }
}

function renderLog() {
  const el = document.getElementById("log");
  el.innerHTML = "";
  G.logs.slice(0, 3).forEach(m => {
    const d = document.createElement("div");
    d.textContent = m;
    el.appendChild(d);
  });
}

function renderButton() {
  const btn = document.getElementById("turn-btn");
  if (G.over) {
    btn.disabled = true; btn.textContent = "しょうぶあり";
    btn.classList.remove("cancel");
    return;
  }
  if (G.mode === "place" || G.mode === "target" || G.mode === "attack") {
    btn.disabled = false;
    btn.textContent = "やめる";
    btn.classList.add("cancel");
    btn.onclick = clearPick;
    return;
  }
  btn.classList.remove("cancel");
  btn.textContent = "ターンおわり";
  btn.disabled = !myTurn();
  btn.onclick = endTurn;
}

function renderHint() {
  const h = document.getElementById("hint");
  if (G.over) { h.textContent = ""; return; }
  if (!myTurn()) { h.textContent = "まおうが かんがえている…"; return; }
  switch (G.mode) {
    case "place":  h.textContent = "▼ 光るマスに よびだそう（ぜんれつは 後ろのなかまを かばう / 3レーン埋めると リーダーが まもられる）"; break;
    case "target": h.textContent = G.pending && G.pending.lane
      ? "▼ ねらう たて一列を えらんでね"
      : G.pending && G.pending.row
      ? "▼ ねらう よこ一列（ぜんれつ か こうれつ）を えらんでね"
      : "▼ 赤く光る たいしょうを えらんでね"; break;
    case "attack": h.textContent = "▼ こうげきする あいてを えらんでね"; break;
    default:       h.textContent = "カードを えらんで よびだす ／ ユニットを えらんで こうげき";
  }
}

/* ===== エフェクト ===== */
function floatNum(target, text, cls) {
  const el = isLeader(target) ? leaderEl(target) : unitEl(target);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const n = document.createElement("div");
  n.className = "fx-num " + cls;
  n.textContent = text;
  n.style.left = (r.left + r.width / 2) + "px";
  n.style.top  = (r.top + r.height / 2) + "px";
  document.getElementById("fx").appendChild(n);
  setTimeout(() => n.remove(), 1000);
}

/* =========================================================
   とくぎの エフェクト
   ========================================================= */
const FX_LAYER = () => document.getElementById("fx");

/** 対象（ユニット / リーダー）の 画面上の場所 */
function rectOf(target) {
  const el = isLeader(target) ? leaderEl(target) : unitEl(target);
  return el ? el.getBoundingClientRect() : null;
}

/** そのレーンの 前列＋後列を ふくむ たて長の場所 */
function laneRect(side, lane) {
  const f = document.getElementById(side === G.player ? "player-front" : "enemy-front");
  const b = document.getElementById(side === G.player ? "player-back"  : "enemy-back");
  const a = f.querySelectorAll(".slot")[lane], c = b.querySelectorAll(".slot")[lane];
  if (!a || !c) return null;
  const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
  return {
    left: Math.min(ra.left, rc.left), right: Math.max(ra.right, rc.right),
    top: Math.min(ra.top, rc.top), bottom: Math.max(ra.bottom, rc.bottom),
    get width()  { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  };
}

/** その陣営の 盤面ぜんたいの場所 */
function fieldRect(side) {
  const f = document.getElementById(side === G.player ? "player-front" : "enemy-front");
  const b = document.getElementById(side === G.player ? "player-back"  : "enemy-back");
  const ra = f.getBoundingClientRect(), rb = b.getBoundingClientRect();
  return {
    left: Math.min(ra.left, rb.left), right: Math.max(ra.right, rb.right),
    top: Math.min(ra.top, rb.top), bottom: Math.max(ra.bottom, rb.bottom),
    get width()  { return this.right - this.left; },
    get height() { return this.bottom - this.top; },
  };
}

/** 矩形にぴったり重ねる エフェクト */
function fxBox(rect, cls, pad, life) {
  if (!rect) return null;
  const p = pad || 0;
  const el = document.createElement("div");
  el.className = "fx " + cls;
  el.style.left   = (rect.left - p) + "px";
  el.style.top    = (rect.top - p) + "px";
  el.style.width  = (rect.width + p * 2) + "px";
  el.style.height = (rect.height + p * 2) + "px";
  FX_LAYER().appendChild(el);
  setTimeout(() => el.remove(), life || 1300);
  return el;
}

/** 中心に置く エフェクト */
function fxAt(rect, cls, html, life) {
  if (!rect) return null;
  const el = document.createElement("div");
  el.className = "fx " + cls;
  el.style.left = (rect.left + rect.width / 2) + "px";
  el.style.top  = (rect.top + rect.height / 2) + "px";
  el.style.transform = "translate(-50%,-50%)";
  if (html) el.innerHTML = html;
  FX_LAYER().appendChild(el);
  setTimeout(() => el.remove(), life || 1300);
  return el;
}

function fxFlare(target)  { fxAt(rectOf(target), "fx-flare", "", 700); }
function fxSword(target)  { fxAt(rectOf(target), "fx-sword", "🗡️", 950); }
function fxBlueGlow(side) { fxBox(leaderEl(side).getBoundingClientRect(), "fx-blue-glow", 6, 1050); }
function fxFieldGlow(side){ fxBox(fieldRect(side), "fx-field-glow", 4, 1250); }
function fxStorm(side)    { fxBox(fieldRect(side), "fx-storm", 2, 1350); }
function fxLaneFlash(side, lane) { fxBox(laneRect(side, lane), "fx-lane-flash", 3, 750); }

/** 回復：緑のグロー＋キラキラ */
function fxHeal(target) {
  const r = rectOf(target);
  if (!r) return;
  fxBox(r, "fx-heal-glow", 5, 1100);
  for (let i = 0; i < 7; i++) {
    const s = document.createElement("div");
    s.className = "fx fx-spark";
    s.style.left = (r.left + Math.random() * r.width) + "px";
    s.style.top  = (r.top + r.height * (.55 + Math.random() * .4)) + "px";
    s.style.setProperty("--dx", (Math.random() * 34 - 17).toFixed(1) + "px");
    s.style.setProperty("--dy", (-26 - Math.random() * 26).toFixed(1) + "px");
    s.style.animationDelay = (Math.random() * .22).toFixed(2) + "s";
    FX_LAYER().appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}

/** つむじ風：レーンの上で ぐるぐる */
function fxWhirl(side, lane) {
  const r = laneRect(side, lane);
  if (!r) return;
  fxBox(r, "fx-whirl", 8, 1150);
}

/** サンダー：たて一列を かけぬける 稲光 */
function fxBolt(side, lane) {
  const r = laneRect(side, lane);
  if (!r) return;
  const el = fxBox(r, "fx-bolt", 6, 800);
  if (!el) return;
  const zig = (w, h) => {
    const x = w / 2;
    return `${x},0 ${x - w * .22},${h * .28} ${x + w * .16},${h * .40} ` +
           `${x - w * .18},${h * .70} ${x + w * .14},${h * .80} ${x - w * .04},${h}`;
  };
  const w = 100, h = 200;
  el.innerHTML =
    `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
       <polyline points="${zig(w, h)}" fill="none" stroke="#fffde0" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
       <polyline points="${zig(w, h)}" fill="none" stroke="#ffe14a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
     </svg>`;
}

/** カードの効果に ひもづいた エフェクトを 再生する */
function playFx(effect, caster, target, lane) {
  if (!effect) return;
  const foe = opponentOf(caster);
  switch (effect.fx) {
    case "flare":     fxFlare(target); return;
    case "sword":     fxSword(target); return;
    case "blueGlow":  fxBlueGlow(caster); return;
    case "fieldGlow": fxFieldGlow(caster); return;
    case "whirl":     fxWhirl(foe, lane); return;
    case "bolt":      fxBolt(foe, lane); return;
    case "storm":     fxStorm(foe); return;
  }
  // 指定がない たて一列の効果は 控えめに光らせる
  if (effect.target === "enemyLane" && lane !== null && lane !== undefined) fxLaneFlash(foe, lane);
}

function shakeEl(el) {
  if (!el) return;
  el.classList.remove("hit");
  void el.offsetWidth;
  el.classList.add("hit");
}

/* =========================================================
   ルール画面 / 起動
   ========================================================= */
/* マニュアルの 中身。章ごとに 分けてある。
   起動画面には このうち QUICK_RULES で 選んだものだけ 出す。 */
const MANUAL = [
  {
    title: "基本ルール",
    rules: [
      ["しょうり", "相手リーダーの <b>HP20</b> を けずりきったら 勝ち。"],
      ["MP",       "毎ターン MPが 1ずつ ふえる（最大10）。MPを はらって カードを出す。"],
      ["ばんめん", "たてに <b>3レーン</b>、それぞれ <b>ぜんれつ</b>と <b>こうれつ</b>の マスがある。"],
      ["ガード",   "こうれつのユニットは、<b>おなじレーンの ぜんれつに なかまがいる間</b> こうげきされない。"],
      ["ブロック", "<b>3レーンすべてに ユニットがいる</b>と リーダーを こうげきできなくなる（前でも後ろでもOK）。"],
      ["こうげき", "自分のユニット → あいて の順に タップ。ユニット同士なら はんげきを うける。"],
      ["とくぎ",   "とくぎカードは ガードと ブロックを <b>無視</b>して、好きな相手を ねらえる。"],
    ],
  },
  {
    title: "状態異常",
    rules: [
      ["こおり", "❄️が ついた ユニットは <b>つぎの じぶんのターンまで こうげきできない</b>。"],
    ],
  },
];

/** 起動画面に出す分（章をまたいで 名前で選ぶ） */
const QUICK_RULES = ["しょうり", "MP", "ガード", "ブロック", "こうげき"];

/** いまモーダルに 何を出しているか（とじたときの ふるまいが変わる） */
let modalMode = "title";      // "title" | "manual"

/** 章の見出しつきで 並べる。章が1つだけなら 見出しは出さない */
function fillRules(chapters) {
  document.getElementById("modal-rules").innerHTML = chapters.map(ch => {
    const head = chapters.length > 1
      ? `<div class="chapter">${ch.title}</div>` : "";
    const body = ch.rules.map(([k, v]) =>
      `<div class="rule-line"><span class="rule-key">${k}</span><span>${v}</span></div>`).join("");
    return head + body;
  }).join("");
}

/** 起動画面。かんたんな説明だけ */
function showTitle() {
  modalMode = "title";
  const picked = MANUAL
    .flatMap(ch => ch.rules)
    .filter(([k]) => QUICK_RULES.includes(k));
  fillRules([{ title: "", rules: picked }]);
  document.getElementById("modal-title").textContent = "グリフォン";
  document.getElementById("modal-sub").textContent = "GRID FORMATION";
  document.getElementById("modal-note").textContent =
    "対戦相手は CPU。くわしい ルールは 下の「マニュアル」から 見られるよ。";
  document.getElementById("modal-btn").textContent = G ? "とじる" : "たたかう";
  document.getElementById("overlay").classList.add("show");
}

/** マニュアル。ルールを ぜんぶ出す。ゲーム中でも いつでも開ける */
function showManual() {
  modalMode = "manual";
  fillRules(MANUAL);
  document.getElementById("modal-title").textContent = "マニュアル";
  document.getElementById("modal-sub").textContent = "グリフォンの ルール";
  document.getElementById("modal-note").textContent =
    "デッキは 20種×2枚の 40枚。やまふだが つきると すこしずつ ダメージを うける。";
  document.getElementById("modal-btn").textContent = "とじる";
  document.getElementById("overlay").classList.add("show");
}

document.getElementById("modal-btn").onclick = () => {
  document.getElementById("overlay").classList.remove("show");
  // マニュアルを とじただけのときは 何も起こさない
  if (modalMode === "manual") return;
  if (!G || G.over) newGame();
};
document.getElementById("player-leader").onclick = () => onLeaderClick(G.player);
document.getElementById("enemy-leader").onclick  = () => onLeaderClick(G.enemy);
document.getElementById("manual-btn").onclick = showManual;
document.getElementById("tip-close").onclick = (ev) => {
  ev.stopPropagation();
  document.getElementById("rotate-tip").classList.add("closed");
};
document.getElementById("restart-btn").onclick = () => {
  if (G && G.cleanupTimer) clearTimeout(G.cleanupTimer);
  newGame();
};

// こうさん：まちがって押さないよう 2段階
let surrenderArmed = null;
const surrenderBtn = document.getElementById("surrender-btn");
surrenderBtn.onclick = () => {
  if (!G || G.over) return;
  if (!surrenderArmed) {
    surrenderBtn.textContent = "ほんとうに こうさんする？";
    surrenderBtn.classList.add("armed");
    surrenderArmed = setTimeout(resetSurrender, 4000);
    return;
  }
  resetSurrender();
  log("ゆうしゃは こうさんした…");
  G.player.hp = 0;
  render();
  checkGameOver();
};
function resetSurrender() {
  clearTimeout(surrenderArmed);
  surrenderArmed = null;
  surrenderBtn.textContent = "こうさん";
  surrenderBtn.classList.remove("armed");
}

document.getElementById("screen").addEventListener("click", (e) => {
  if (e.target.id === "screen" || e.target.classList.contains("board") || e.target.classList.contains("slot")) {
    if (myTurn()) clearPick();
  }
});

showTitle();