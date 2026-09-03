#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cards/ の md を読んで src/core/cards.js を 書きかえるスクリプト。

  cards/card-library.md   ぜんぶのカードの 定義（とくぎ / どうぐ / ユニット）
  cards/card-Alice.md     どのカードを 何枚使うか
  cards/card-Hansel.md
  cards/card-Gretel.md
  cards/card-Snow.md

つかいかた:
    npm run cards        （または python apply-cards.py）

md の「効果」欄の 日本語を読んで、ゲームの効果に 変換する。
知らない書きかたが 出てきたら 止めて 教えるので、
そのときは スラりんに 言えば 実装する。
"""

import re
import sys
import unicodedata
from pathlib import Path

# Windows のコンソールは 絵文字を出せないことがある。
# 出せない字は「?」にして、処理そのものは 止めない
try:
    sys.stdout.reconfigure(errors="replace")
    sys.stderr.reconfigure(errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent
CARDS_DIR = HERE / "cards"
LIBRARY = CARDS_DIR / "card-library.md"
GAME = HERE / "src" / "core" / "cards.js"

# デッキファイルの ならび順（画面に出る順）
DECK_ORDER = ["Alice", "Hansel", "Gretel", "Snow"]

# ---------------------------------------------------------------
# カード名 → 絵文字
#   ここに無い名前は 効果や名前から それっぽいものを えらぶ
# ---------------------------------------------------------------
EMOJI = {
    # ユニット
    "スライム": "🟦", "ゴブリン": "👺", "あばれウルフ": "🐺", "ゴースト": "👻",
    "吸血コウモリ": "🦇", "アーチャーエルフ": "🏹", "オーク": "🐗",
    "ヒールスライム": "🟩", "ダッシュうさぎ": "🐇", "ミノタウロス": "🐂",
    "ゴーレム": "🗿", "ドラゴン": "🐉",
    "真冬のゴブリン": "🧊", "ぬすっとゴブリン": "🎒", "スノウスライム": "⬜",
    "ゆきおとこ": "🦍", "ゆきおんな": "👘", "ロケットうさぎ": "🚀",
    "プリーストエルフ": "🙏", "ウィンタードラゴン": "🐲",
    # とくぎ
    "フレア": "🔥", "ヒール": "✨", "ゆうきの歌": "🎵", "つむじ風": "💨",
    "サンダー": "⚡", "ストーム": "🌪️", "フリーズ": "❄️", "スラッシュ": "⚔️",
    "ヘイル": "🌨️", "サルベージ": "♻️", "アイドルソング": "🎤", "シャラプー": "🤫",
    "フロストバイト": "🧊", "ハイヒール": "💚", "ヴェール": "🛡️",
    "メガフリーズ": "🌬️", "ブリザード": "🌨️", "メガフロスト": "💠",
    "メガヒール": "💖", "ルミナスヴェール": "🌟",
    # どうぐ
    "聖水": "💧", "角笛": "📯", "探索": "🔍", "鉄の剣": "🗡️",
    "革手袋": "🧤", "地図": "🗺️", "パンくず": "🍞", "石つぶて": "🪨",
    "薬草": "🌿", "リンゴ": "🍎", "毒リンゴ": "🍏", "短剣": "🔪",
    "木の盾": "🪵", "投石器": "🎯", "キャンディボム": "🍬",
}

# 名前に この語が入っていたら この絵文字（EMOJI に無いときの 予備）
EMOJI_HINTS = [
    ("ドラゴン", "🐉"), ("竜", "🐉"), ("スライム", "🟦"), ("コウモリ", "🦇"),
    ("うさぎ", "🐇"), ("ウサギ", "🐇"), ("ウルフ", "🐺"), ("オオカミ", "🐺"),
    ("ゴースト", "👻"), ("ゴブリン", "👺"), ("オーク", "🐗"), ("ゴーレム", "🗿"),
    ("エルフ", "🏹"), ("弓", "🏹"), ("騎士", "🛡️"), ("剣", "🗡️"),
    ("僧", "🙏"), ("魔", "🧙"), ("骨", "💀"),
    ("炎", "🔥"), ("フレア", "🔥"), ("火", "🔥"), ("雷", "⚡"), ("サンダー", "⚡"),
    ("フリーズ", "❄️"), ("こおり", "❄️"), ("氷", "❄️"),
    ("嵐", "🌪️"), ("ストーム", "🌪️"), ("風", "💨"), ("水", "💧"),
    ("歌", "🎵"), ("笛", "📯"), ("回復", "✨"), ("ヒール", "✨"), ("光", "🌟"),
    ("薬", "🧪"), ("本", "📖"), ("鍵", "🗝️"), ("袋", "🎒"),
]

# 効果の演出（html 側の playFx が つかう）
FX_BY_NAME = {
    "フレア": "flare", "鉄の剣": "sword", "聖水": "blueGlow",
    "ゆうきの歌": "fieldGlow", "つむじ風": "whirl", "サンダー": "bolt",
    "ストーム": "storm",
}

# 名前が 変わっても id を 保てるように、いまの名前 → id を 覚えておく
ID_BY_NAME = {
    # ユニット
    "スライム": "slime", "ゴブリン": "goblin", "あばれウルフ": "wolf",
    "ゴースト": "ghost", "吸血コウモリ": "vampbat", "アーチャーエルフ": "archer",
    "オーク": "orc", "ヒールスライム": "healslime", "ダッシュうさぎ": "rabbit",
    "ミノタウロス": "minotaur", "ゴーレム": "golem", "ドラゴン": "dragon",
    "真冬のゴブリン": "wingoblin", "ぬすっとゴブリン": "thiefgoblin",
    "スノウスライム": "snowslime", "ゆきおとこ": "yeti", "ゆきおんな": "yukionna",
    "ロケットうさぎ": "rocketrabbit", "プリーストエルフ": "priestelf",
    "ウィンタードラゴン": "windragon",
    # とくぎ
    "フレア": "flare", "ヒール": "heal", "ゆうきの歌": "song", "つむじ風": "whirl",
    "サンダー": "thunder", "ストーム": "storm", "フリーズ": "freeze",
    "スラッシュ": "slash", "ヘイル": "hail", "サルベージ": "salvage",
    "アイドルソング": "idolsong", "シャラプー": "shutup",
    "フロストバイト": "frostbite", "ハイヒール": "highheal", "ヴェール": "veil",
    "メガフリーズ": "megafreeze", "ブリザード": "blizzard",
    "メガフロスト": "megafrost", "メガヒール": "megaheal",
    "ルミナスヴェール": "lumiveil",
    # どうぐ
    "聖水": "water", "角笛": "horn", "探索": "search", "鉄の剣": "sword",
    "革手袋": "glove", "地図": "map", "パンくず": "crumb", "石つぶて": "pebble",
    "薬草": "herb", "リンゴ": "apple", "毒リンゴ": "poisonapple",
    "短剣": "dagger", "木の盾": "woodshield", "投石器": "sling",
    "キャンディボム": "candybomb",
}

# デッキの id（ファイル名 → ゲームのなかの id）
DECK_ID = {"Alice": "alice", "Hansel": "hansel", "Gretel": "gretel", "Snow": "snow"}

# ---------------------------------------------------------------
# 効果テキストの よみとり
# ---------------------------------------------------------------
NUM = r"([0-9０-９]+)"


def n(s):
    """全角数字も 受けつける"""
    return int(unicodedata.normalize("NFKC", s))


def parse_effect(text, is_unit):
    """
    効果の日本語 → (effect dict または None, もちもの dict)
    読めなかったら ValueError を投げる
    """
    t = text.strip()
    traits = {}
    if t in ("", "—", "-", "ー", "なし"):
        return None, traits

    # 持続する能力（召喚時ではないもの）
    if "与えたダメージ" in t and "回復" in t:
        traits["lifesteal"] = True
        return None, traits

    if re.search(r"(?:召喚|よびだ)し?た?ターン(?:から|でも)攻?撃?", t.replace(" ", "")):
        traits["rush"] = True
        return None, traits

    m = re.search(r"攻撃するたび(?:ランダムな)?味方(?:ユニット)?1体を" + NUM + r"回復",
                  t.replace(" ", ""))
    if m:
        traits["healOnAttack"] = n(m.group(1))
        return None, traits

    # こおっている敵の数だけ 安くなる。
    # このあとに 召喚時こうかが つづくことが あるので、文から 取りのぞいて さきへ すすむ
    m = re.search(r"凍結している敵の数だけ\s*コスト\s*-\s*" + NUM, t)
    if m:
        traits["frostCost"] = n(m.group(1))
        t = re.sub(r"凍結している敵の数だけ\s*コスト\s*-\s*[0-9０-９]+\s*[、,]?\s*", "", t)
        if t.strip() in ("", "—", "-", "ー", "なし"):
            return None, traits

    # 「死亡時：〜」は やられたときに 発動する
    death = False
    if re.match(r"^(?:死亡時|やられた時|やられたとき)\s*[:：]", t):
        death = True
        t = re.sub(r"^(?:死亡時|やられた時|やられたとき)\s*[:：]\s*", "", t)

    # 「召喚時：〜」は 前置きを外して 中身を読む
    t = re.sub(r"^召喚時\s*[:：]\s*", "", t)
    flat = t.replace("、", "").replace(" ", "").replace("　", "")

    def done(eff):
        if death:
            eff["when"] = "death"
        return eff, traits

    # --- こおり ---
    # 「対象を凍結させる」は ダメージと セットのことが 多いので さきに 見る
    m = re.search(r"敵(?:ユニット)?全体に" + NUM + r"ダメージ対象を凍結させる", flat)
    if m:
        return done({"kind": "freeze", "value": n(m.group(1)), "target": "enemyAll"})

    m = re.search(r"(?:たて|縦)(?:一|1|１)列に" + NUM + r"ダメージ対象を凍結させる", flat)
    if m:
        return done({"kind": "freeze", "value": n(m.group(1)), "target": "enemyLane"})

    m = re.search(r"(?:よこ|横)(?:一|1|１)列に" + NUM + r"ダメージ対象を凍結させる", flat)
    if m:
        return done({"kind": "freeze", "value": n(m.group(1)), "target": "enemyRow"})

    m = re.search(r"敵(?:ユニット)?1体に" + NUM + r"ダメージ(?:対象を)?凍結させる", flat)
    if m:
        return done({"kind": "freeze", "value": n(m.group(1)), "target": "enemyUnit"})

    # ダメージ なしで こおらせるだけ。「敵2体を」なら 2回 えらぶ
    m = re.search(r"敵(?:ユニット)?" + NUM + r"体を凍結させる", flat)
    if m:
        return done({"kind": "freeze", "value": 0, "target": "enemyUnit", "times": n(m.group(1))})

    # こおっている敵だけを まとめて 撃つ
    m = re.search(r"凍結(?:状態)?の?敵(?:全員|全体)に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyFrozen"})

    # --- 毒 ---
    if re.search(r"敵(?:ユニット)?1体を毒(?:状態に)?する", flat):
        return done({"kind": "poison", "target": "enemyUnit"})

    # --- うけるダメージを へらす まもり ---
    m = re.search(NUM + r"ターンの間味方全体が受けるダメージ-" + NUM, flat)
    if m:
        return done({"kind": "shield", "value": n(m.group(2)),
                     "turns": n(m.group(1)), "target": "allySelf"})

    m = re.search(NUM + r"ターンの間味方(ユニット)?1体が受けるダメージ-" + NUM, flat)
    if m:
        return done({"kind": "shield", "value": n(m.group(3)),
                     "turns": n(m.group(1)),
                     "target": "allyUnit" if m.group(2) else "allyAny"})

    # --- とくぎ封じ ---
    if re.search(r"次のターン敵は(?:とくぎ|特技)を使えない", flat):
        return done({"kind": "silence", "target": "self"})

    # --- どうぐの ねびき ---
    m = re.search(r"このターン中(?:どうぐ|道具)のコスト-" + NUM, flat)
    if m:
        return done({"kind": "discount", "value": n(m.group(1)), "target": "self"})

    # --- 使った どうぐを ひろいなおす ---
    m = re.search(r"使った(?:どうぐ|道具)をランダムに" + NUM + r"枚手札に加える", flat)
    if m:
        return done({"kind": "salvage", "value": n(m.group(1)), "target": "self"})

    # --- ダメージ ---
    m = re.search(r"敵(?:ユニット)?全体に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyAll"})

    m = re.search(r"(?:たて|縦)(?:一|1|１)列に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyLane"})

    m = re.search(r"(?:よこ|横)(?:一|1|１)列に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyRow"})

    # 凍結
    m = re.search(r"敵(?:ユニット)?1体に" + NUM + r"ダメージ(?:対象は)?次のターン攻撃できない", flat)
    if m:
        return done({"kind": "freeze", "value": n(m.group(1)), "target": "enemyUnit"})

    if re.search(r"敵(?:ユニット)?1体は?次のターン攻撃できない", flat):
        return done({"kind": "freeze", "value": 0, "target": "enemyUnit"})

    # 「敵ユニット1体に」＝ユニットだけ / 「敵1体に」＝リーダーも ねらえる
    m = re.search(r"敵ユニット1体に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyUnit"})

    m = re.search(r"敵1体に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyAny"})

    # --- 回復 ---
    # 「味方」なら リーダーも ふくむ。「味方ユニット」なら 盤面の子だけ
    m = re.search(r"味方(ユニット)?全体の?HPを" + NUM + r"回復", flat)
    if m:
        return done({"kind": "heal", "value": n(m.group(2)),
                     "target": "allyUnitAll" if m.group(1) else "allyAll"})

    m = re.search(r"味方(ユニット)?1体を" + NUM + r"回復", flat)
    if m:
        return done({"kind": "heal", "value": n(m.group(2)),
                     "target": "allyUnit" if m.group(1) else "allyAny"})

    # --- 強化 ---
    # 攻撃力とHPの 上げ下げは 盤面の子にしか かけられない（リーダーは 攻撃しないので）
    m = re.search(r"味方(?:ユニット)?全体を\+?" + NUM + r"/\+?" + NUM, flat)
    if m:
        return done({"kind": "buff", "value": n(m.group(1)), "target": "allyUnitAll"})

    m = re.search(r"味方(?:ユニット)?1体の攻撃力を?\+?" + NUM + r"(?:上げる)?", flat)
    if m:
        return done({"kind": "buffAtk", "value": n(m.group(1)), "target": "allyUnit"})

    # --- そのほか ---
    m = re.search(r"MPを" + NUM + r"回復", flat)
    if m:
        return done({"kind": "mp", "value": n(m.group(1)), "target": "self"})

    m = re.search(r"(?:デッキ|やまふだ|山札)からコスト" + NUM + r"以下のユニットを" + NUM + r"枚手札に加える", flat)
    if m:
        return done({"kind": "search", "value": n(m.group(2)),
                     "target": "self", "filter": "unit", "maxCost": n(m.group(1))})

    m = re.search(r"(?:デッキ|やまふだ|山札)からユニットを" + NUM + r"枚手札に加える", flat)
    if m:
        return done({"kind": "search", "value": n(m.group(1)),
                     "target": "self", "filter": "unit"})

    m = re.search(r"(?:デッキ|やまふだ|山札)から(?:とくぎ|特技)を" + NUM + r"枚手札に加える", flat)
    if m:
        return done({"kind": "search", "value": n(m.group(1)),
                     "target": "self", "filter": "spell"})

    m = re.search(r"(?:デッキ|やまふだ|山札)から(?:どうぐ|道具)を" + NUM + r"枚手札に加える", flat)
    if m:
        return done({"kind": "search", "value": n(m.group(1)),
                     "target": "self", "filter": "item"})

    m = re.search(r"(?:デッキ|やまふだ|山札)(?:の上)?から" + NUM + r"枚引く", flat)
    if m:
        return done({"kind": "draw", "value": n(m.group(1)), "target": "self"})

    if re.search(r"(?:たて|縦)(?:一|1|１)列の前後を入れ?替える", flat):
        return done({"kind": "swap", "target": "enemyLane"})

    raise ValueError(text)


def pick_emoji(name, text):
    if name in EMOJI:
        return EMOJI[name]
    for key, e in EMOJI_HINTS:
        if key in name:
            return e
    for key, e in EMOJI_HINTS:
        if key in text:
            return e
    return "✨"


def make_id(name, used):
    """英数字の id を つくる（重複しないように）"""
    base = "".join(ch for ch in unicodedata.normalize("NFKC", name)
                   if ch.isascii() and ch.isalnum()).lower()
    if not base:
        base = "card"
    i, cand = 2, base
    while cand in used:
        cand = f"{base}{i}"
        i += 1
    used.add(cand)
    return cand


# ---------------------------------------------------------------
# md の 読み取り
# ---------------------------------------------------------------
def read_rows(md, heading_kw):
    """見出しに heading_kw を ふくむ 章の 表の行を返す"""
    rows, inside, in_table = [], False, False
    for line in md.splitlines():
        if line.startswith("#"):
            inside = heading_kw in line
            in_table = False
            continue
        if not inside:
            continue
        s = line.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in cells):     # 罫線
            in_table = True
            continue
        if not in_table:                                  # 見出し行
            continue
        rows.append(cells)
    return rows


def read_library():
    """card-library.md から カードの定義を 読む"""
    md = LIBRARY.read_text(encoding="utf-8")
    used_ids, unknown, cards = set(), [], []

    def add(rows, kind):
        """kind: unit / spell / item"""
        for cells in rows:
            if len(cells) < 3:
                continue
            name, cost = cells[0], cells[1]
            if not re.match(r"^\s*[0-9０-９]+\s*$", cost):
                continue
            if kind == "unit":
                if len(cells) < 4:
                    continue
                m = re.match(r"\s*([0-9０-９]+)\s*/\s*([0-9０-９]+)\s*", cells[2])
                if not m:
                    continue
                atk, hp, text = n(m.group(1)), n(m.group(2)), cells[3]
            else:
                atk = hp = None
                text = cells[2]

            try:
                eff, traits = parse_effect(text, kind == "unit")
            except ValueError as e:
                unknown.append((name, str(e)))
                continue

            if kind != "unit" and eff is None:
                unknown.append((name, text + "（効果が 読み取れない）"))
                continue
            if kind != "unit" and name in FX_BY_NAME:
                eff["fx"] = FX_BY_NAME[name]

            cards.append({
                "id": ID_BY_NAME.get(name) or make_id(name, used_ids),
                "name": name, "cost": n(cost), "type": kind,
                "atk": atk, "hp": hp,
                "emoji": pick_emoji(name, text),
                "text": "" if text.strip() in ("—", "-", "ー", "") else text.strip(),
                "effect": eff, "traits": traits,
            })

    add(read_rows(md, "とくぎ"), "spell")
    add(read_rows(md, "どうぐ"), "item")
    add(read_rows(md, "ユニット"), "unit")
    return cards, unknown


def read_deck(path, by_name):
    """デッキファイルから 表示名・絵文字・中身を 読む"""
    md = path.read_text(encoding="utf-8")
    info = {"label": path.stem.replace("card-", ""), "emoji": "🎴", "desc": ""}

    for cells in read_rows(md, "#"):          # 先頭の 見出し表（項目｜内容）
        if len(cells) < 2:
            continue
        key, val = cells[0], cells[1]
        if "表示名" in key: info["label"] = val
        elif "絵文字" in key: info["emoji"] = val or "🎴"
        elif "説明" in key:  info["desc"] = val

    entries, missing = [], []
    for cells in read_rows(md, "デッキ"):
        if len(cells) < 2:
            continue
        name, count = cells[0], cells[1]
        if not re.match(r"^\s*[0-9０-９]+\s*$", count):
            continue
        card = by_name.get(name)
        if not card:
            missing.append(name)
            continue
        entries.append((card["id"], n(count)))
    return info, entries, missing


# ---------------------------------------------------------------
def main():
    if not LIBRARY.exists():
        print(f"{LIBRARY} が 見つからないよ。")
        return 1

    cards, unknown = read_library()
    if unknown:
        print("読めなかった効果が あるよ：")
        for name, t in unknown:
            print(f"  ・{name} … 「{t}」")
        print("\nこの書きかたは まだゲームに 入ってないんだ。")
        print("スラりんに 言ってくれれば 実装するよ！ 今回は 中止したよ。")
        return 1
    if not cards:
        print("card-library.md から カードを 読み取れなかったよ。書式を 確認してね。")
        return 1

    by_name = {c["name"]: c for c in cards}

    decks, problems = [], []
    for stem in DECK_ORDER:
        path = CARDS_DIR / f"card-{stem}.md"
        if not path.exists():
            continue
        info, entries, missing = read_deck(path, by_name)
        if missing:
            problems.append((path.name, missing))
        decks.append({
            "id": DECK_ID.get(stem, stem.lower()),
            "label": info["label"], "emoji": info["emoji"], "desc": info["desc"],
            "cards": entries,
        })

    if problems:
        print("デッキに ライブラリに無い カード名が あるよ：")
        for fname, names in problems:
            print(f"  {fname}: {' / '.join(names)}")
        print("\n名前の 書きまちがいか、card-library.md への 追加わすれかも。")
        print("今回は 中止したよ。")
        return 1

    # --- JS を 組み立てる ---
    def eff_js(e):
        parts = [f'kind:"{e["kind"]}"']
        if "value" in e:   parts.append(f'value:{e["value"]}')
        parts.append(f'target:"{e["target"]}"')
        for k in ("filter", "maxCost", "turns", "times", "when", "fx"):
            if k in e:
                v = e[k]
                parts.append(f'{k}:{v}' if isinstance(v, int) else f'{k}:"{v}"')
        return "{ " + ", ".join(parts) + " }"

    L = ["/* =========================================================",
         "   カード定義と デッキ",
         "   このファイルは cards/*.md から apply-cards.py が 作る。",
         "   直に なおさず、md のほうを なおして `npm run cards` を 走らせる。",
         "   ========================================================= */",
         "", "export const CARDS = ["]

    for kind, title in (("spell", "とくぎ"), ("item", "どうぐ"), ("unit", "ユニット")):
        group = [c for c in cards if c["type"] == kind]
        if not group:
            continue
        L.append(f"  // --- {title}（{len(group)}種）---")
        for c in group:
            head = (f'  {{ id:"{c["id"]}", name:"{c["name"]}", cost:{c["cost"]}, '
                    f'type:"{c["type"]}", ')
            if kind == "unit":
                head += f'atk:{c["atk"]}, hp:{c["hp"]}, '
            head += f'emoji:"{c["emoji"]}", text:"{c["text"]}"'
            tail = []
            if c["effect"]:
                tail.append(f'\n    effect:{eff_js(c["effect"])}')
            for key in ("lifesteal", "rush"):
                if c["traits"].get(key):
                    tail.append(f"\n    {key}:true")
            # 数を もつ もちもの（回復量・ねびきの はば）
            for key in ("healOnAttack", "frostCost"):
                if c["traits"].get(key):
                    tail.append(f'\n    {key}:{c["traits"][key]}')
            L.append(head + ("," + ",".join(tail) if tail else "") + " },")
        L.append("")

    if L[-1] == "":
        L.pop()
    L.append("];")
    L.append("")
    L.append("/** デッキ。cards[] は [カードのid, 枚数] の ならび */")
    L.append("export const DECKS = [")
    for d in decks:
        total = sum(cnt for _, cnt in d["cards"])
        pairs = ", ".join(f'["{cid}",{cnt}]' for cid, cnt in d["cards"])
        L.append(f'  {{ id:"{d["id"]}", label:"{d["label"]}", emoji:"{d["emoji"]}", '
                 f'desc:"{d["desc"]}", total:{total},')
        L.append(f'    cards:[{pairs}] }},')
    L.append("];")
    L.append("")
    L.append("export const CARD_MAP = {};")
    L.append("CARDS.forEach(c => CARD_MAP[c.id] = c);")
    L.append("")
    L.append("export const MAX_SLOTS = 3;")
    L.append("export const START_HP  = 20;")
    L.append("export const MAX_MP    = 10;")
    L.append("export const HAND_MAX  = 8;")
    L.append("export const CLEANUP_DELAY = 420;   // やられた演出を見せる時間")

    GAME.parent.mkdir(parents=True, exist_ok=True)
    GAME.write_text("\n".join(L) + "\n", encoding="utf-8")

    kinds = {k: len([c for c in cards if c["type"] == k]) for k in ("spell", "item", "unit")}
    print(f'はんえい かんりょう！ とくぎ{kinds["spell"]}種 / どうぐ{kinds["item"]}種 / ユニット{kinds["unit"]}種')
    for d in decks:
        total = sum(cnt for _, cnt in d["cards"])
        state = f"{total}枚" if total else "からっぽ（まだ えらべない）"
        print(f'  {d["emoji"]} {d["label"]}: {state}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
