#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
card-names.md を読んで src/core/cards.js の カード定義を 書きかえるスクリプト。

つかいかた:
    python apply-cards.py

md の「効果」欄の 日本語を読んで、ゲームの効果に 変換するよ。
知らない書きかたが出てきたら 止めて 教えるから、そのときは スラりんに言ってね。
"""

import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
MD   = HERE / "card-names.md"
GAME = HERE / "src" / "core" / "cards.js"

# ---------------------------------------------------------------
# カード名 → 絵文字
#   ここに無い名前は 効果や名前から それっぽいものを えらぶ
# ---------------------------------------------------------------
EMOJI = {
    "スライム": "🟦", "ゴブリン": "👺", "あばれウルフ": "🐺", "ゴースト": "👻",
    "吸血コウモリ": "🦇", "アーチャーエルフ": "🏹", "オーク": "🐗",
    "ヒールスライム": "🟩", "ダッシュうさぎ": "🐇", "ミノタウロス": "🐂", "ゴーレム": "🗿", "ドラゴン": "🐉",
    "フレア": "🔥", "鉄の剣": "🗡️", "聖水": "💧", "ヒール": "✨",
    "角笛": "📯", "ゆうきの歌": "🎵", "つむじ風": "💨", "サンダー": "⚡", "ストーム": "🌪️",
    "フリーズ": "❄️", "ヘイル": "❄️", "スラッシュ": "⚔️", "探索": "🔍",
}

# 名前に この語が入っていたら この絵文字（EMOJI に無いときの 予備）
EMOJI_HINTS = [
    ("ドラゴン", "🐉"), ("竜", "🐉"), ("スライム", "🟦"), ("コウモリ", "🦇"),
    ("うさぎ", "🐇"), ("ウサギ", "🐇"), ("ウルフ", "🐺"), ("オオカミ", "🐺"), ("ゴースト", "👻"), ("ゴブリン", "👺"),
    ("オーク", "🐗"), ("ゴーレム", "🗿"), ("エルフ", "🏹"), ("弓", "🏹"),
    ("騎士", "🛡️"), ("剣", "🗡️"), ("僧", "🙏"), ("魔", "🧙"), ("骨", "💀"),
    ("炎", "🔥"), ("フレア", "🔥"), ("火", "🔥"), ("雷", "⚡"), ("サンダー", "⚡"),
    ("フリーズ", "❄️"), ("こおり", "❄️"), ("嵐", "🌪️"), ("ストーム", "🌪️"), ("風", "💨"), ("水", "💧"), ("氷", "❄️"),
    ("歌", "🎵"), ("笛", "📯"), ("回復", "✨"), ("ヒール", "✨"), ("光", "🌟"),
]

# 効果の種類 → エフェクト演出の名前（html 側の playFx が使う）
FX_BY_NAME = {
    "フレア": "flare", "鉄の剣": "sword", "聖水": "blueGlow",
    "ゆうきの歌": "fieldGlow", "つむじ風": "whirl", "サンダー": "bolt", "ストーム": "storm",
}

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
    もちもの = {"lifesteal": bool, "rush": bool} のような 持続能力
    読めなかったら ValueError を投げる
    """
    t = text.strip()
    traits = {}
    if t in ("", "—", "-", "ー", "なし"):
        return None, traits

    # 持続能力（召喚時ではないもの）
    if "与えたダメージ" in t and "回復" in t:
        traits["lifesteal"] = True
        return None, traits

    if re.search(r"(?:召喚|よびだ)し?た?ターン(?:から|でも)攻?撃?", t.replace(" ", "")):
        traits["rush"] = True
        return None, traits

    # 「死亡時：〜」は やられたときに 発動する
    death = False
    if re.match(r"^(?:死亡時|やられた時|やられたとき)\s*[:：]", t):
        death = True
        t = re.sub(r"^(?:死亡時|やられた時|やられたとき)\s*[:：]\s*", "", t)

    # 「召喚時：〜」は 前置きを外して 中身を読む
    t = re.sub(r"^召喚時\s*[:：]\s*", "", t)
    # 読点・空白は 無視して 比べる
    flat = t.replace("、", "").replace(" ", "").replace("　", "")

    def done(eff):
        """死亡時フラグを つけて返す"""
        if death:
            eff["when"] = "death"
        return eff, traits

    # --- ダメージ ---
    m = re.search(r"敵(?:ユニット)?全体に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyAll"})

    # 縦一列＝えらんだレーンの 前後2体（「縦1列」「たて一列」も 受ける）
    m = re.search(r"(?:たて|縦)(?:一|1|１)列に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyLane"})

    # 横一列＝前列3体 または 後列3体（えらぶ）
    m = re.search(r"(?:よこ|横)(?:一|1|１)列に" + NUM + r"ダメージ", flat)
    if m:
        return done({"kind": "damage", "value": n(m.group(1)), "target": "enemyRow"})

    # 凍結（ダメージ＋次のターン攻撃できない）
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
    m = re.search(r"味方1体を" + NUM + r"回復", flat)
    if m:
        # ユニットの召喚時回復は ユニットのみ、とくぎは リーダーも対象
        return done({"kind": "heal", "value": n(m.group(1)),
                     "target": "allyUnit" if is_unit else "allyAny"})

    # --- 強化 ---
    m = re.search(r"味方全体を\+?" + NUM + r"/\+?" + NUM, flat)
    if m:
        return done({"kind": "buff", "value": n(m.group(1)), "target": "allyAll"})

    m = re.search(r"味方1体の攻撃力を" + NUM + r"上げる", flat)
    if m:
        return done({"kind": "buffAtk", "value": n(m.group(1)), "target": "allyUnit"})

    # --- そのほか ---
    m = re.search(r"MPを" + NUM + r"回復", flat)
    if m:
        return done({"kind": "mp", "value": n(m.group(1)), "target": "self"})

    # サーチ（条件つきで デッキから 手札に加える）
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

    # ドロー（「デッキの上から◯枚引く」も 受ける）
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
    base = "".join(ch for ch in unicodedata.normalize("NFKC", name) if ch.isascii() and ch.isalnum())
    if not base:
        base = "card"
    base = base.lower()
    i, cand = 2, base
    while cand in used:
        cand = f"{base}{i}"
        i += 1
    used.add(cand)
    return cand


# 名前が変わっても id を保てるように、今の名前 → id の 対応を 覚えておく
ID_BY_NAME = {
    "スライム": "slime", "ゴブリン": "goblin", "あばれウルフ": "wolf", "ゴースト": "ghost",
    "吸血コウモリ": "vampbat", "アーチャーエルフ": "archer", "オーク": "orc",
    "ヒールスライム": "healslime", "ダッシュうさぎ": "rabbit", "ミノタウロス": "minotaur", "ゴーレム": "golem",
    "ドラゴン": "dragon", "フレア": "flare", "鉄の剣": "sword", "聖水": "water",
    "ヒール": "heal", "角笛": "horn", "ゆうきの歌": "song", "つむじ風": "whirl",
    "サンダー": "thunder", "ストーム": "storm",
    "フリーズ": "freeze", "ヘイル": "freeze", "スラッシュ": "slash", "探索": "search",
}


# ---------------------------------------------------------------
# md を よみとる
# ---------------------------------------------------------------
def read_rows(md, heading_kw):
    """見出しに heading_kw を ふくむ セクションの 表の行を返す"""
    lines = md.splitlines()
    rows, inside, in_table = [], False, False
    for line in lines:
        if line.startswith("##"):
            inside = heading_kw in line
            in_table = False
            continue
        if not inside:
            continue
        s = line.strip()
        if not s.startswith("|"):
            if in_table and s == "":
                continue
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in cells):   # 罫線
            in_table = True
            continue
        if not in_table:                                # 見出し行
            continue
        rows.append(cells)
    return rows


def main():
    md = MD.read_text(encoding="utf-8")
    html = GAME.read_text(encoding="utf-8")

    used_ids, unknown = set(), []
    units, spells = [], []

    # --- ユニット: 名前 | コスト | 攻/HP | 効果 | 枚数 ---
    for cells in read_rows(md, "ユニット"):
        if len(cells) < 4:
            continue
        name, cost, stats, text = cells[0], cells[1], cells[2], cells[3]
        count = cells[4] if len(cells) > 4 else "2"
        if not re.match(r"^\s*[0-9０-９]+\s*$", cost):
            continue
        m = re.match(r"\s*([0-9０-９]+)\s*/\s*([0-9０-９]+)\s*", stats)
        if not m:
            continue
        try:
            eff, traits = parse_effect(text, True)
        except ValueError as e:
            unknown.append((name, str(e)))
            continue
        units.append({
            "id": ID_BY_NAME.get(name) or make_id(name, used_ids),
            "name": name, "cost": n(cost), "atk": n(m.group(1)), "hp": n(m.group(2)),
            "count": n(count) if re.match(r"^\s*[0-9０-９]+\s*$", count) else 2,
            "emoji": pick_emoji(name, text),
            "text": "" if text.strip() in ("—", "-", "ー", "") else text.strip(),
            "effect": eff, "traits": traits,
        })

    # --- とくぎ: 名前 | コスト | 効果 | 枚数 ---
    for cells in read_rows(md, "特技"):
        if len(cells) < 3:
            continue
        name, cost, text = cells[0], cells[1], cells[2]
        count = cells[3] if len(cells) > 3 else "2"
        if not re.match(r"^\s*[0-9０-９]+\s*$", cost):
            continue
        try:
            eff, traits = parse_effect(text, False)
        except ValueError as e:
            unknown.append((name, str(e)))
            continue
        if eff is None:
            unknown.append((name, text + "（とくぎに 効果がない）"))
            continue
        if name in FX_BY_NAME:
            eff["fx"] = FX_BY_NAME[name]
        spells.append({
            "id": ID_BY_NAME.get(name) or make_id(name, used_ids),
            "name": name, "cost": n(cost),
            "count": n(count) if re.match(r"^\s*[0-9０-９]+\s*$", count) else 2,
            "emoji": pick_emoji(name, text), "text": text.strip(), "effect": eff,
        })

    if unknown:
        print("読めなかった効果が あるよ：")
        for name, t in unknown:
            print(f"  ・{name} … 「{t}」")
        print("\nこの書きかたは まだゲームに 入ってないんだ。")
        print("スラりんに 言ってくれれば 実装するよ！ 今回は 中止したよ。")
        return 1

    if not units or not spells:
        print("card-names.md の 表が よみとれなかったよ。書式を 確認してね。")
        return 1

    # --- JS の カード定義を つくる ---
    def eff_js(e):
        parts = [f'kind:"{e["kind"]}"']
        if "value" in e:
            parts.append(f'value:{e["value"]}')
        parts.append(f'target:"{e["target"]}"')
        if "filter" in e:
            parts.append(f'filter:"{e["filter"]}"')
        if "maxCost" in e:
            parts.append(f'maxCost:{e["maxCost"]}')
        if "when" in e:
            parts.append(f'when:"{e["when"]}"')
        if "fx" in e:
            parts.append(f'fx:"{e["fx"]}"')
        return "{ " + ", ".join(parts) + " }"

    lines = ["export const CARDS = ["]
    lines.append(f"  // --- ユニット（{len(units)}種 / {sum(u['count'] for u in units)}枚）---")
    for u in units:
        head = (f'  {{ id:"{u["id"]}", name:"{u["name"]}", cost:{u["cost"]}, type:"unit", '
                f'atk:{u["atk"]}, hp:{u["hp"]}, count:{u["count"]}, emoji:"{u["emoji"]}", '
                f'text:"{u["text"]}"')
        tail = []
        if u["effect"]:
            tail.append(f'\n    effect:{eff_js(u["effect"])}')
        for key in ("lifesteal", "rush"):
            if u["traits"].get(key):
                tail.append(f"\n    {key}:true")
        lines.append(head + ("," + ",".join(tail) if tail else "") + " },")

    lines.append("")
    lines.append(f"  // --- 特技（{len(spells)}種 / {sum(s['count'] for s in spells)}枚）---")
    for s in spells:
        lines.append(f'  {{ id:"{s["id"]}", name:"{s["name"]}", cost:{s["cost"]}, type:"spell", '
                     f'count:{s["count"]}, emoji:"{s["emoji"]}", text:"{s["text"]}",\n'
                     f'    effect:{eff_js(s["effect"])} }},')
    lines.append("];")
    block = "\n".join(lines)

    # --- html に 差しこむ ---
    pattern = re.compile(r"(?:export\s+)?const CARDS = \[.*?\n\];", re.S)
    if not pattern.search(html):
        print("src/core/cards.js の カード定義が 見つからなかったよ。")
        return 1
    html = pattern.sub(lambda _: block, html, count=1)

    # リーダーの名前も そろえる
    for cells in read_rows(md, "リーダー"):
        if not cells:
            continue
        m = re.match(r"(.+?)\s*[（(](自分|相手)[)）]", cells[0])
        if not m:
            continue
        who, side = m.group(1).strip(), m.group(2)
        old = "ゆうしゃ" if side == "自分" else "まおう"
        if who != old:
            html = html.replace(old, who)
            print(f"リーダー名を 「{old}」→「{who}」に かえたよ")

    GAME.write_text(html, encoding="utf-8")
    total = sum(u["count"] for u in units) + sum(s["count"] for s in spells)
    print(f"はんえい かんりょう！ ユニット{len(units)}種 / とくぎ{len(spells)}種 / デッキ {total}枚")
    return 0


if __name__ == "__main__":
    sys.exit(main())
