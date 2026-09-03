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
  sideName, sideOf, opponentOf, isLeader, sortHand, sideDeck,
  getPlayerName, setPlayerName, DEFAULT_NAMES, NAME_MAX,
  playableDecks, getDeck, getMyDeckId, getFoeDeckId,
  setMyDeckId, setFoeDeckId, RANDOM_DECK, deckChoices,
  grantShield, tickShield, shieldSum, shieldSoonest,
} from "./core/state.js";
import {
  allUnits, hasFreeSlot, laneOccupied, leaderBlocked, isCovered,
  laneUnits, unitLocation, candidateLanes, candidateRows,
  legalAttackTargets, canAttack, canPlay, effectCandidates,
  costOf, frozenUnits, shieldOf, summonEffect,
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
    log(`${sideName(side)}は 山札が つきて ${side.fatigue}ダメージ！`);
    checkGameOver();
    return;
  }
  const id = side.deck.pop();
  if (side.hand.length >= HAND_MAX) {
    log(`てふだが あふれて「${CARD_MAP[id].name}」は きえた…`);
    return;
  }
  side.hand.push(id);
  if (side.isPlayer) sortHand(side, CARD_MAP);   // コストの小さい順に そろえる
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
  side.itemDiscount = 0;                  // どうぐの ねびきは そのターン かぎり
  // とくぎ封じは 相手の 1ターンぶん。そのターンが 終わったので ここで とく
  const other = opponentOf(side);
  if (other.noSpell) { other.noSpell = false; log(`${sideName(other)}の とくぎ封じが とけた`); }

  // まもり（ヴェール・木の盾）は 自分のターンが 来るたびに 1へる
  ageShield(side);                   // 味方全体ぶん
  ageShield(side, "ownShield");      // リーダー自身に かけたぶん
  allUnits(side).forEach(u => {
    u.sick = false;
    u.attacked = false;
    if (u.frozen) {                       // こおりは 自分のターンが 来るたびに 1へる
      u.frozen--;
      if (u.frozen <= 0) { delete u.frozen; log(`${u.name}の こおりが とけた`); }
    }
    ageShield(u);
  });

  // 毒は 自分のターンの はじめに 1ダメージ。とけることは ない
  allUnits(side).filter(u => u.poison).forEach(u => {
    log(`「${u.name}」は 毒で 1ダメージ`);
    dealDamage(u, 1, { ignoreShield: true });
  });
  scheduleCleanup();

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
    healOnAttack: c.healOnAttack || 0,
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
  if (effect.kind === "silence") {
    const foe = opponentOf(side);
    foe.noSpell = true;
    log(`${sideName(foe)}は つぎのターン とくぎを つかえない！`);
    floatNum(foe, "とくぎ ふうじ！", "freeze");
    render();
    return;
  }
  if (effect.kind === "discount") {
    side.itemDiscount = (side.itemDiscount || 0) + effect.value;
    log(`このターン どうぐが ${side.itemDiscount}やすくなった！`);
    floatNum(side, `どうぐ -${side.itemDiscount}`, "buff");
    render();
    return;
  }
  if (effect.kind === "salvage") {
    salvageItem(side, effect.value);
    scheduleCleanup();
    return;
  }
  if (effect.kind === "shield" && effect.target === "allySelf") {
    grantShield(side, effect);
    const now = shieldSum(side.shield);
    log(`${sideName(side)}の 味方全体が ${effect.turns}ターン ダメージ-${effect.value}！`
      + (now > effect.value ? `（かさねて -${now}）` : ""));
    render();
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
    else if (effect.kind === "poison") {
      if (t.hp > 0 && !t.poison) {
        t.poison = true;
        floatNum(t, "どく！", "freeze");
        log(`「${t.name}」は 毒に おかされた！`);
      }
    }
    else if (effect.kind === "shield") {
      grantShield(t, effect, shieldKey(t));
      const now = shieldOf(t);
      floatNum(t, `まもり -${effect.value}`, "buff");
      log(`${t.name || sideName(t)}は ${effect.turns}ターン ダメージ-${effect.value}！`
        + (now > effect.value ? `（あわせて -${now}）` : ""));
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
      if (effect.filter === "spell" && c.type === "unit") return false;
      if (effect.maxCost !== undefined && c.cost > effect.maxCost) return false;
      return true;
    });
    if (at < 0) break;
    const [id] = side.deck.splice(at, 1);
    if (side.hand.length < HAND_MAX) { side.hand.push(id); found++; }
    else log(`手札が いっぱいで「${CARD_MAP[id].name}」は もえてしまった…`);
  }
  if (found > 0) {
    if (side.isPlayer) sortHand(side, CARD_MAP);
    log(`デッキから ${found}枚 手札に くわえた！`);
  } else log("デッキに 条件に合う カードが なかった…");
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

/* ----- まもり（うけるダメージを へらす） ----- */

/* まもりは 2種類の 入れものに ためる。
   side.shield    ヴェールなど 味方全体に かかるもの
   side.ownShield 木の盾を リーダー自身に かけたもの
   ユニットは u.shield（＋ 味方全体のぶん）。
   計算そのものは core/ に あるので、ここは 入れる場所と ログだけ。 */

/** リーダーに かけるときは 全体のまもりと ぶつからない ほうへ */
function shieldKey(t) { return isLeader(t) ? "ownShield" : "shield"; }

/** まもりを 1へらして、きれたら ログを 出す */
function ageShield(holder, key = "shield") {
  const ended = tickShield(holder, key);
  if (ended > 0) {
    const left = shieldSum(holder[key]);
    log(`${holder.name || sideName(holder)}の まもりが きれた`
      + (left > 0 ? `（のこり -${left}）` : ""));
  }
}

/** 使った どうぐを ランダムに ひろいなおす */
function salvageItem(side, count) {
  let got = 0;
  for (let i = 0; i < count; i++) {
    if (!side.usedItems.length) break;
    if (side.hand.length >= HAND_MAX) { log("手札が いっぱいだった…"); break; }
    const at = Math.floor(Math.random() * side.usedItems.length);
    const [id] = side.usedItems.splice(at, 1);
    side.hand.push(id);
    got++;
    log(`「${CARD_MAP[id].name}」を ひろいなおした！`);
  }
  if (!got) log("ひろえる どうぐが なかった…");
  else if (side.isPlayer) sortHand(side, CARD_MAP);
}

function dealDamage(target, amount, opt) {
  // まもりで へらす（毒は まもりを すりぬける）
  const cut = (opt && opt.ignoreShield) ? 0 : shieldOf(target);
  const dmg = Math.max(0, amount - cut);
  if (cut > 0 && dmg < amount) floatNum(target, `まもり -${amount - dmg}`, "heal");
  if (dmg === 0) return;

  target.hp -= dmg;
  floatNum(target, `${dmg}`, "dmg");
  shakeEl(isLeader(target) ? leaderEl(target) : unitEl(target));
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
      } else {
        const all = wholeTargets(de, owner);
        if (all) applyEffect(Object.assign({}, de), all, owner);
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
    modalMode = "title";      // 「もういちど」で 新しい対戦が はじまるように
    if (result === "win")  { t.textContent = "しょうり！"; s.textContent = `${sideName(G.enemy)}を たおした`; }
    if (result === "lose") { t.textContent = "ぜんめつ…";  s.textContent = `${sideName(G.player)}は たおれた`; }
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

  // プリーストエルフ：攻撃するたび 傷ついた なかまを ランダムに 1体 回復する
  // （リーダーも えらばれる。満タンの子は はずすので から撃ちに ならない）
  if (attacker.healOnAttack && attacker.hp > 0) {
    const mine = sideOf(attacker);
    const pool = allUnits(mine).filter(u => u.hp < u.maxHp);
    if (mine.hp < START_HP) pool.push(mine);
    const who = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (who) {
      const before = who.hp;
      healTarget(who, attacker.healOnAttack);
      if (who.hp > before) {
        log(`「${attacker.name}」が ${who.name || sideName(mine)}を ${who.hp - before} かいふくした！`);
      }
    }
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

  // すでに えらんでいる カードを もう一度おした
  if (G.pickedCard === idx) {
    // 対象を えらばない とくぎは ここで はじめて 発動する
    // （1回さわっただけで 出てしまわないように）
    if (G.mode === "confirm") { castSpell(idx, null); return; }
    clearPick();
    return;
  }

  const c = CARD_MAP[cardId];
  G.pickedUnit = null;
  G.pickedCard = idx;

  if (c.type === "unit") {
    G.mode = "place";
  } else {
    const e = c.effect;
    if (needsNoTarget(e)) {
      // えらんだだけ。もう一度おすと 発動する
      G.mode = "confirm";
      G.pending = { effect: e, fromHand: true, confirm: true };
    } else {
      G.mode = "target";
      G.pending = {
        effect: e, fromHand: true,
        lane: e.target === "enemyLane",
        row:  e.target === "enemyRow",
      };
    }
  }
  render();
}

/* -----------------------------------------------------------
   まとめて かかる効果の あて先。
   「味方ユニット」は 盤面の子だけ、「味方」は リーダーも ふくむ。
   ここ 1か所で 決めておくと 手札・召喚時・CPU で ずれない。
   ----------------------------------------------------------- */
const WHOLE_TARGETS = ["enemyAll", "enemyFrozen", "allyUnitAll", "allyAll"];

/** まとめて かかるなら その相手を、対象を えらぶ効果なら null を返す */
function wholeTargets(e, side) {
  switch (e.target) {
    case "enemyAll":    return allUnits(opponentOf(side));
    case "enemyFrozen": return frozenUnits(side);
    case "allyUnitAll": return allUnits(side);
    case "allyAll":     return [...allUnits(side), side];
    default: return null;
  }
}

/** 対象を えらばなくていい効果か */
function needsNoTarget(e) {
  return WHOLE_TARGETS.includes(e.target)
      || e.target === "self" || e.target === "allySelf";
}

function onSlotClick(row, idx) {
  if (!myTurn() || G.mode !== "place") return;
  if (G.player[row][idx]) return;

  const handIdx = G.pickedCard;
  const cardId = G.player.hand[handIdx];
  const c = CARD_MAP[cardId];

  G.player.mp -= costOf(G.player, cardId);
  G.player.hand.splice(handIdx, 1);
  const unit = summon(G.player, cardId, row, idx);

  G.pickedCard = null;
  G.mode = "idle";

  // 「死亡時：〜」は ここでは 発動しない（やられたとき に まわす）
  const summonE = summonEffect(c);
  if (summonE) {
    const e = summonE;
    const all = wholeTargets(e, G.player);
    if (all) { applyEffect(e, all, G.player); render(); return; }
    if (e.target === "self" || e.target === "allySelf") { applyEffect(e, [], G.player); render(); return; }
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
      G.pending = { effect: e, fromHand: false, source: unit, left: e.times || 1 };
    }
  }
  render();
}

function castSpell(handIdx, target) {
  const cardId = G.player.hand[handIdx];
  const c = CARD_MAP[cardId];
  G.player.mp -= costOf(G.player, cardId);
  G.player.hand.splice(handIdx, 1);
  if (c.type === "item") G.player.usedItems.push(cardId);   // サルベージで 拾えるように
  log(`${sideName(G.player)}は「${c.name}」を ${c.type === "item" ? "つかった" : "となえた"}！`);

  const e = c.effect;
  const all = wholeTargets(e, G.player);
  if (e.target === "enemyLane")        applyLaneEffect(e, G.enemy, target);
  else if (e.target === "enemyRow")    applyRowEffect(e, G.enemy, target);
  else if (all)                        applyEffect(e, all, G.player);
  else if (e.target === "self" || e.target === "allySelf") applyEffect(e, [], G.player);
  else                                 applyEffect(e, [target], G.player);
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
    if (!pendingTargets().includes(target)) return;
    if (G.pending.fromHand) castSpell(G.pickedCard, target);
    else {
      applyEffect(G.pending.effect, [target], G.player);
      // ゆきおんなの「敵2体を」のように 何回か えらぶ 効果は のこりを かぞえる
      const left = (G.pending.left || 1) - 1;
      if (left > 0 && pendingTargets().length > 0) {
        G.pending.left = left;
        render();
      } else clearPick();
    }
  }
}

/**
 * いま えらべる 対象。
 * 何回か えらぶ 凍結は、もう こおった子を のぞく（同じ子を 2回 えらべない）
 */
function pendingTargets() {
  if (!G.pending) return [];
  const e = G.pending.effect;
  const list = effectCandidates(e, G.player);
  if (e.kind === "freeze" && (e.times || 1) > 1) return list.filter(u => !u.frozen);
  return list;
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
  if (c.type === "unit") return true;      // ユニットは いつでも 出す
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
      if (e.filter === "spell" && t.type === "unit") return false;
      if (e.filter === "item"  && t.type !== "item") return false;
      if (e.maxCost !== undefined && t.cost > e.maxCost) return false;
      return true;
    });
  }
  // こおらせるのは これから殴ってきそうな相手がいるときだけ
  if (e.kind === "freeze")  return allUnits(G.player).some(u => u.atk > 0 && !u.frozen);
  // 毒は 長生きしそうな 相手に かけたい
  if (e.kind === "poison")  return allUnits(G.player).some(u => !u.poison && u.hp >= 2);
  // まもりは 守るものが あるときだけ（リーダーも えらべるなら いつでも 意味がある）
  if (e.kind === "shield") {
    if (e.target === "allySelf" || e.target === "allyAny") return true;
    return allUnits(E).length > 0;
  }
  // とくぎ封じは 相手が まだ 手札を 持っているとき
  if (e.kind === "silence") return G.player.hand.length > 0;
  // ねびきは そのターンに 出せる どうぐが あってこそ
  if (e.kind === "discount") {
    return E.hand.some(id => {
      const t = CARD_MAP[id];
      return t.type === "item" && t.cost > 0;
    });
  }
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
  const storm = playable.find(x => {
    const e = summonEffect(x.c);
    return e && e.target === "enemyAll";
  });
  if (storm && foes.filter(u => u.hp <= summonEffect(storm.c).value).length >= 2) return storm;

  // たて一列で2体まとめて倒せるなら それ
  for (const x of playable) {
    const e = summonEffect(x.c);
    if (e && e.kind === "damage" && e.target === "enemyLane") {
      const lane = aiChooseLane(e);
      if (lane !== null && laneUnits(G.player, lane).filter(u => u.hp <= e.value).length >= 2) return x;
    }
  }

  // 確実に除去できる呪文があれば使う
  for (const x of playable) {
    const e = summonEffect(x.c);
    if (x.c.type !== "unit" && e && e.kind === "damage" && e.target === "enemyUnit") {
      if (foes.some(u => u.hp <= e.value && u.atk >= 3)) return x;
    }
  }
  return playable[0];   // 一番コストが高いもの
}

function aiPlayCard(pick) {
  const E = G.enemy;
  const c = pick.c;
  E.mp -= costOf(E, c.id);
  E.hand.splice(pick.i, 1);
  if (c.type === "item") E.usedItems.push(c.id);

  const resolve = (e) => {
    if (e.target === "enemyLane") {
      const lane = aiChooseLane(e);
      if (lane !== null) applyLaneEffect(e, G.player, lane);
    }
    else if (e.target === "enemyRow") {
      const row = aiChooseRow(e);
      if (row !== null) applyRowEffect(e, G.player, row);
    }
    else if (wholeTargets(e, E))         applyEffect(e, wholeTargets(e, E), E);
    else if (e.target === "self" || e.target === "allySelf") applyEffect(e, [], E);
    else {
      // 「敵2体を凍結」のように 何回か えらぶ 効果は そのぶん くりかえす
      const times = e.times || 1;
      for (let k = 0; k < times; k++) {
        const t = aiChooseEffectTarget(e);
        if (!t) break;
        applyEffect(e, [t], E);
      }
    }
  };

  if (c.type === "unit") {
    const spot = aiPlaceUnit(E, c);
    summon(E, c.id, spot.row, spot.idx);
    const summonE = summonEffect(c);      // 死亡時こうかは ここでは 出さない
    if (summonE) resolve(summonE);
  } else {
    log(`${sideName(G.enemy)}は「${c.name}」を ${c.type === "item" ? "つかった" : "となえた"}！`);
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
  if (effect.kind === "freeze") {
    // まだ こおっていない、いちばん 強い子から 止める
    const foes = allUnits(G.player).filter(u => !u.frozen && u.atk > 0);
    return foes.sort((a, b) => b.atk - a.atk)[0] || allUnits(G.player)[0] || null;
  }
  if (effect.kind === "poison") {
    // かたくて 長生きしそうな 相手ほど 毒が きく
    const foes = allUnits(G.player).filter(u => !u.poison);
    return foes.sort((a, b) => b.hp - a.hp)[0] || null;
  }
  if (effect.kind === "shield") {
    // けずられてきたら 自分を、そうでなければ いちばん 前で 殴られそうな 子を まもる
    const mine = allUnits(G.enemy);
    if (effect.target === "allyAny" && (G.enemy.hp <= 8 || !mine.length)) return G.enemy;
    return mine.slice().sort((a, b) => b.atk - a.atk)[0]
        || (effect.target === "allyAny" ? G.enemy : null);
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
    return pendingTargets();
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

  // 自分の なまえ（タグを 混ぜられても textContent なので そのまま文字になる）
  document.querySelector(".player-side .leader-name").textContent = getPlayerName();
  // あいての 名前は デッキの 名前。顔は どちらも デッキの 絵文字
  document.querySelector(".enemy-side .leader-name").textContent = sideName(G.enemy);
  document.getElementById("player-leader").textContent = sideDeck(G.player).emoji;
  document.getElementById("enemy-leader").textContent  = sideDeck(G.enemy).emoji;

  const targets = currentTargets();
  [["player-leader", "player-guard", G.player], ["enemy-leader", "enemy-guard", G.enemy]].forEach(([id, gid, side]) => {
    document.getElementById(id).classList.toggle("targetable", targets.includes(side));
    document.getElementById(gid).hidden = !leaderBlocked(side);
  });

  // 味方全体に かかっている まもりと とくぎ封じを リーダー欄に 出す
  [["player", G.player], ["enemy", G.enemy]].forEach(([who, side]) => {
    const ward = document.getElementById(`${who}-ward`);
    const mute = document.getElementById(`${who}-mute`);
    if (ward) {
      const cut = shieldSum(side.shield);
      ward.hidden = cut === 0;
      if (cut) ward.textContent = `🛡 みかた -${cut}（あと${shieldSoonest(side.shield)}）`;
    }
    if (mute) mute.hidden = !side.noSpell;
    // リーダー自身の まもりは 顔の ところに 小さく出す
    document.getElementById(`${who}-leader`).classList.toggle("warded", shieldSum(side.ownShield) > 0);
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

  // 傷ついているときだけ「いま/最大」を出す。満タンなら 数字ひとつ
  const hurt = unit.hp < unit.maxHp;
  const now = Math.max(0, unit.hp);
  const hpText = hurt ? `${now}<span class="max">/${unit.maxHp}</span>` : `${now}`;

  // 状態異常の しるし（こおり・毒・まもり）
  const marks =
    (unit.frozen ? `<span class="mark ice" title="こおり">❄️</span>` : "") +
    (unit.poison ? `<span class="mark poison" title="どく">🟣</span>` : "") +
    (shieldSum(unit.shield) ? `<span class="mark ward" title="まもり">🛡️</span>` : "");

  el.innerHTML =
    (marks ? `<div class="unit-marks">${marks}</div>` : "") +
    `<div class="unit-emoji">${unit.emoji}</div>` +
    `<div class="unit-name${nameCls}">${unit.name}</div>` +
    `<div class="unit-stats">` +
      `<div class="orb atk">${unit.atk}</div>` +
      `<div class="orb hp${hurt ? " hurt" : ""}">${hpText}</div>` +
    `</div>`;

  el.onclick = (ev) => {
    ev.stopPropagation();
    if (longPressed) { longPressed = false; return; }     // 長おしの直後は 動かさない
    onUnitClick(unit);
  };
  bindZoom(el, () => ({
    card: CARD_MAP[unit.id],
    opts: { foe: side === G.enemy, atk: unit.atk, hp: unit.hp, maxHp: unit.maxHp },
  }));
  return el;
}

function renderHand() {
  const handEl = document.getElementById("player-hand");
  handEl.innerHTML = "";

  G.player.hand.forEach((cardId, idx) => {
    const c = CARD_MAP[cardId];
    const ok = myTurn() && canPlay(G.player, cardId);

    const el = document.createElement("div");
    el.className = "card" + (c.type === "spell" ? " spell" : c.type === "item" ? " item" : "")
                 + (ok ? " playable" : " locked")
                 + (G.pickedCard === idx ? " picked" : "");

    const foot = c.type === "unit"
      ? `<div class="card-foot"><div class="orb atk">${c.atk}</div><div class="orb hp">${c.hp}</div></div>`
      : `<div class="card-foot"><div class="spell-tag">${c.type === "item" ? "どうぐ" : "とくぎ"}</div></div>`;

    const txt = c.text || "";
    // 2〜4行に なってよいので、ふだんは 縮めない。
    // いちばん長い説明（角笛24文字）が スマホで あふれるので、
    // 23文字を こえたら 少しだけ 小さくする
    const size = txt.length > 34 ? " xlong" : txt.length > 23 ? " long" : "";

    // 革手袋や こおりで 安くなっていたら 数字を 青くして 知らせる
    const now = costOf(G.player, cardId);
    const costCls = "card-cost" + (now < c.cost ? " cut" : "");

    el.innerHTML =
      `<div class="${costCls}">${now}</div>` +
      `<div class="card-art">${c.emoji}</div>` +
      `<div class="card-name">${c.name}</div>` +
      `<div class="card-text${size}">${txt}</div>` + foot;

    el.onclick = () => {
      if (longPressed) { longPressed = false; return; }   // 長おしの直後は 出さない
      onCardClick(idx);
    };
    bindZoom(el, () => ({ card: c, opts: { cost: now } }));
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
  if (G.mode === "place" || G.mode === "target" || G.mode === "attack" || G.mode === "confirm") {
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
    case "confirm": h.textContent = "▼ もう一度 カードを タップすると つかえるよ"; break;
    default:       h.textContent = "カードを えらんで よびだす ／ ユニットを えらんで こうげき";
  }
}

/* =========================================================
   カードを 大きく見る（長おし / 右クリック）
   ========================================================= */
const LONG_PRESS_MS = 420;
let pressTimer = null;
let longPressed = false;      // 長おしで開いた直後の タップを 打ち消すため

/** 手札のカード / 盤上のユニット を 大きく表示する */
function showZoom(card, opts = {}) {
  const { foe = false, atk = card.atk, hp = card.hp, maxHp = card.hp, cost = card.cost } = opts;
  const el = document.getElementById("zoom-card");
  el.className = "zoom-card"
    + (card.type === "spell" ? " spell" : card.type === "item" ? " item" : "")
    + (foe ? " foe" : "");

  const foot = card.type === "unit"
    ? `<div class="zoom-foot">
         <div class="orb atk">${atk}</div>
         <div class="orb hp${hp < maxHp ? " hurt" : ""}">${
           hp < maxHp ? `${Math.max(0, hp)}<span class="max">/${maxHp}</span>` : Math.max(0, hp)
         }</div>
       </div>`
    : `<div class="zoom-foot"><div class="zoom-tag">${card.type === "item" ? "どうぐ" : "とくぎ"}</div></div>`;

  el.innerHTML =
    `<div class="zoom-cost${cost < card.cost ? " cut" : ""}">${cost}</div>` +
    `<div class="zoom-art">${card.emoji}</div>` +
    `<div class="zoom-name">${card.name}</div>` +
    `<div class="zoom-text">${card.text || "　"}</div>` + foot +
    `<div class="zoom-hint">どこかを タップすると とじる</div>`;

  document.getElementById("zoom").classList.add("show");
}

function hideZoom() {
  document.getElementById("zoom").classList.remove("show");
  // とじたら 打ち消しは 解除する。
  // （そうしないと 拡大を見たあと 1回目の タップが きかない）
  longPressed = false;
}

function zoomOpen() {
  return document.getElementById("zoom").classList.contains("show");
}

/**
 * 長おし・右クリックで 拡大できるようにする。
 * ふつうの タップは これまでどおり（出す・こうげきする）。
 */
function bindZoom(el, getCard) {
  el.addEventListener("pointerdown", () => {
    clearTimeout(pressTimer);
    longPressed = false;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      longPressed = true;
      const c = getCard();
      if (c) showZoom(c.card, c.opts);
    }, LONG_PRESS_MS);
  });
  const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    cancel();
    longPressed = true;
    const c = getCard();
    if (c) showZoom(c.card, c.opts);
  });
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
      ["こおり", "❄️が ついた ユニットは <b>つぎの じぶんのターンまで こうげきできない</b>。1回 やすんだら とける。"],
      ["どく",   "🟣が ついた ユニットは <b>じぶんのターンの はじめに 1ダメージ</b>。<b>とけない</b>ので、ほうっておくと じわじわ 死ぬ。まもりでは 防げない。"],
      ["まもり", "🛡️が ついている間は <b>うけるダメージが へる</b>。じぶんのターンが 来るたびに のこりが 1へる。<b>かさねがけすると たし算</b>（ヴェールと ルミナスヴェールで -3）。それぞれ 別に かぞえるので、きれるのも バラバラ。"],
      ["とくぎ ふうじ", "🤫の 間は <b>とくぎカードが 出せない</b>。どうぐと ユニットは ふつうに 出せる。1ターンで とける。"],
    ],
  },
  {
    title: "カードの 種類",
    rules: [
      ["ユニット", "盤面に よびだして たたかう。よびだした ターンは こうげきできない（青いカード）。"],
      ["とくぎ",   "ガードと ブロックを <b>無視</b>して 好きな相手を ねらえる（むらさきのカード）。"],
      ["どうぐ",   "手札・MP・味方に はたらきかける（みどりのカード）。<b>とくぎ ふうじ</b>の 影響を うけない。"],
      ["コスト",   "青くなっている 数字は <b>安くなっている</b>しるし（革手袋や こおりの 数で 変わる）。"],
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
  document.getElementById("modal-btn").textContent = (G && !G.over) ? "とじる" : "たたかう";
  document.getElementById("overlay").classList.add("show");
}

/** 右上の ≡ から 開くメニュー */
function showMenu() {
  modalMode = "menu";
  const box = document.getElementById("modal-rules");
  box.innerHTML =
    `<div class="menu-list">
       <button type="button" class="menu-item" data-go="name"><span class="icon">👤</span>なまえ</button>
       <button type="button" class="menu-item${inBattle() ? " off" : ""}" data-go="deck"><span class="icon">🃏</span>デッキ${
         inBattle() ? `<span class="menu-why">対戦中は かえられない</span>` : ""}</button>
       <button type="button" class="menu-item" data-go="manual"><span class="icon">📖</span>マニュアル</button>
       <button type="button" class="menu-item" data-go="restart"><span class="icon">🔄</span>さいしょから</button>
       <button type="button" class="menu-item danger" data-go="surrender"><span class="icon">🏳️</span>こうさん</button>
     </div>`;

  box.querySelectorAll(".menu-item").forEach((b) => {
    b.onclick = () => onMenuPick(b, b.dataset.go);
  });

  document.getElementById("modal-title").textContent = "メニュー";
  document.getElementById("modal-sub").textContent = getPlayerName();
  document.getElementById("modal-note").textContent = "";
  document.getElementById("modal-btn").textContent = "とじる";
  document.getElementById("overlay").classList.add("show");
}

function closeModal() {
  document.getElementById("overlay").classList.remove("show");
  modalMode = "title";
}

/** たたかいの さいちゅうか（決着が ついていれば ちがう） */
function inBattle() { return !!G && !G.over; }

/** メニューの こうもくを えらんだとき */
function onMenuPick(btn, go) {
  if (go === "name")    { showNameEditor(); return; }
  if (go === "manual")  { showManual(); return; }
  if (go === "deck")    { if (!inBattle()) showDeckPicker(); return; }

  if (go === "restart") {
    if (!btn.classList.contains("armed")) {   // まちがって 押さないよう 2段階
      armMenuItem(btn, "ほんとうに さいしょから？");
      return;
    }
    showDeckPicker(true);       // やり直すときも デッキから えらべる
    return;
  }

  if (go === "surrender") {
    if (!G || G.over) return;
    if (!btn.classList.contains("armed")) {
      armMenuItem(btn, "ほんとうに こうさんする？");
      return;
    }
    closeModal();
    log(`${getPlayerName()}は こうさんした…`);
    G.player.hp = 0;
    render();
    checkGameOver();
  }
}

/** 押しまちがい防止：1回目は 文言を変えて 確認をとる */
let armTimer = null;
function armMenuItem(btn, text) {
  clearTimeout(armTimer);
  const box = btn.closest(".menu-list");
  box.querySelectorAll(".menu-item.armed").forEach((b) => resetMenuItem(b));
  btn.dataset.label = btn.innerHTML;
  btn.classList.add("armed");
  btn.innerHTML = `<span class="icon">⚠️</span>${text}`;
  armTimer = setTimeout(() => resetMenuItem(btn), 4000);
}
function resetMenuItem(btn) {
  if (!btn.classList.contains("armed")) return;
  btn.classList.remove("armed");
  if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
}

/** なまえを 決める画面。ゲーム中でも いつでも開ける */
function showNameEditor() {
  modalMode = "name";
  const now = getPlayerName();
  document.getElementById("modal-rules").innerHTML =
    `<div class="name-edit">
       <label for="name-input">なまえ（${NAME_MAX}文字まで）</label>
       <input id="name-input" type="text" maxlength="${NAME_MAX}"
              autocomplete="off" spellcheck="false" value="">
       <button type="button" id="name-random" class="name-random">🎲 おまかせ</button>
     </div>`;

  const input = document.getElementById("name-input");
  input.value = now;                       // 値は あとから入れる（タグを 混ぜさせない）
  document.getElementById("name-random").onclick = () => {
    input.value = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
    input.focus();
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") document.getElementById("modal-btn").click();
  });

  document.getElementById("modal-title").textContent = "なまえ";
  document.getElementById("modal-sub").textContent = "きみの よびな";
  document.getElementById("modal-note").textContent =
    "この端末に おぼえておくよ。空っぽのまま きめると おまかせになる。";
  document.getElementById("modal-btn").textContent = "きめる";
  document.getElementById("overlay").classList.add("show");
  setTimeout(() => input.select(), 50);
}

/* =========================================================
   デッキえらび
   ◀ ▶ で 送る スロットを 上下に 2つ。
   たたかいを はじめる前に かならず ここを 通る。
   ========================================================= */

/** 「たたかう」を 押すまでの かりの えらび */
let pickMy = null;
let pickFoe = null;
/** この画面から そのまま たたかいが はじまるか */
let deckStartsGame = false;

/** ◀ ▶ で 送る スロット ひとつぶん */
function deckSlot(who, picked, label) {
  const list = deckChoices();
  const at = Math.max(0, list.findIndex(d => d.id === picked));
  const d = list[at] || list[0];
  return `<div class="deck-slot">
      <div class="deck-slot-label">${label}</div>
      <div class="deck-slot-row">
        <button type="button" class="deck-arrow" data-who="${who}" data-dir="-1" aria-label="まえ">◀</button>
        <button type="button" class="deck-slot-face" data-who="${who}" data-dir="1">
          <span class="deck-slot-emoji">${d.emoji}</span>
          <span class="deck-slot-name">${d.label}</span>
        </button>
        <button type="button" class="deck-arrow" data-who="${who}" data-dir="1" aria-label="つぎ">▶</button>
      </div>
      <div class="deck-slot-desc">${d.desc || ""}</div>
      <div class="deck-dots">${list.map((x, i) =>
        `<span class="dot${i === at ? " on" : ""}"></span>`).join("")}</div>
    </div>`;
}

/** ◀ ▶ の 送り。はしまで いったら 反対がわへ まわる */
function spinDeck(who, dir) {
  const list = deckChoices();
  if (!list.length) return;
  const now = who === "me" ? pickMy : pickFoe;
  const at = Math.max(0, list.findIndex(d => d.id === now));
  const next = list[(at + dir + list.length) % list.length].id;
  if (who === "me") pickMy = next; else pickFoe = next;
  renderDeckPicker();
}

function renderDeckPicker() {
  const box = document.getElementById("modal-rules");
  box.innerHTML =
    `<div class="deck-pick">
       ${deckSlot("foe", pickFoe, "あいての デッキ")}
       <div class="deck-vs">VS</div>
       ${deckSlot("me", pickMy, "あなたの デッキ")}
     </div>`;

  box.querySelectorAll("[data-dir]").forEach((b) => {
    b.onclick = () => spinDeck(b.dataset.who, Number(b.dataset.dir));
  });
}

/**
 * デッキを えらぶ画面。
 * start=true なら「たたかう」で そのまま たたかいが はじまる。
 * 対戦の さいちゅうは メニューから 開けない。
 */
function showDeckPicker(start = false) {
  modalMode = "deck";
  deckStartsGame = start;
  pickMy = getMyDeckId();
  pickFoe = getFoeDeckId();
  renderDeckPicker();

  document.getElementById("modal-title").textContent = "デッキえらび";
  document.getElementById("modal-sub").textContent = "だれで たたかう？";
  document.getElementById("modal-note").textContent =
    "◀ ▶ で えらぶ。えらんだものは この端末に おぼえておくよ。";
  document.getElementById("modal-btn").textContent = start ? "たたかう" : "きめる";
  document.getElementById("overlay").classList.add("show");
}

/** マニュアル。ルールを ぜんぶ出す。ゲーム中でも いつでも開ける */
function showManual() {
  modalMode = "manual";
  fillRules(MANUAL);
  document.getElementById("modal-title").textContent = "マニュアル";
  document.getElementById("modal-sub").textContent = "グリフォンの ルール";
  document.getElementById("modal-note").textContent =
    `デッキは ${getDeck().total}枚。山札が つきると すこしずつ ダメージを うける。`;
  document.getElementById("modal-btn").textContent = "とじる";
  document.getElementById("overlay").classList.add("show");
}

document.getElementById("modal-btn").onclick = () => {
  // メニューを とじただけのときは 何も起こさない
  if (modalMode === "menu") { closeModal(); return; }
  // デッキ画面は えらんだものを 保存してから とじる
  if (modalMode === "deck") {
    setMyDeckId(pickMy);
    setFoeDeckId(pickFoe);
    closeModal();
    if (deckStartsGame) {                        // ここから そのまま たたかいへ
      if (G && G.cleanupTimer) clearTimeout(G.cleanupTimer);
      newGame();
    } else if (!G || G.over) {
      showTitle();                               // 見にきただけなら タイトルへ もどす
    }
    return;
  }
  // なまえ画面は 入力を 保存してから とじる
  if (modalMode === "name") {
    const input = document.getElementById("name-input");
    setPlayerName(input ? input.value : "");
    document.getElementById("overlay").classList.remove("show");
    modalMode = "title";
    if (G) render();                       // リーダー欄の 名前を 描きなおす
    return;
  }
  document.getElementById("overlay").classList.remove("show");
  // マニュアルを とじただけのときは 何も起こさない
  if (modalMode === "manual") return;
  // タイトルや 決着のあとは、まず デッキを えらんでから たたかう
  if (!G || G.over) showDeckPicker(true);
};
// マニュアルは まわりの くらいところを タップしても とじられる
// （なまえや デッキは 保存が いるので ボタンから とじてもらう）
document.getElementById("overlay").onclick = (ev) => {
  if (ev.target !== ev.currentTarget) return;    // 中身を おしたときは 何もしない
  if (modalMode === "manual") closeModal();
};
document.getElementById("player-leader").onclick = () => onLeaderClick(G.player);
document.getElementById("enemy-leader").onclick  = () => onLeaderClick(G.enemy);
document.getElementById("menu-btn").onclick = showMenu;
document.getElementById("zoom").onclick = hideZoom;
document.getElementById("tip-close").onclick = (ev) => {
  ev.stopPropagation();
  document.getElementById("rotate-tip").classList.add("closed");
};
document.getElementById("screen").addEventListener("click", (e) => {
  if (e.target.id === "screen" || e.target.classList.contains("board") || e.target.classList.contains("slot")) {
    if (myTurn()) clearPick();
  }
});

showTitle();