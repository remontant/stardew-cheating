"""한국어 위키 물고기 문서에서 난이도·움직임·크기·기본 판매가를 받아 data/fishinfo.js 를 만든다.

    python tools/fetch_fish.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT  # noqa: E402
from fetch_items import ALIAS, all_titles, ko_api, norm  # noqa: E402

MOVE = {"Mixed": "혼합", "Dart": "다트", "Smooth": "부드러움", "Sinker": "가라앉음", "Floater": "떠오름"}


def field(text, key):
    m = re.search(r"^\|\s*" + key + r"\s*=\s*(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def main():
    s = (ROOT / "data" / "data.js").read_text(encoding="utf-8")
    d = json.loads(s[s.index("{"):s.rstrip().rindex(";")])
    names = sorted({f["name"] for f in d["fish"]["list"]})
    titles = all_titles()
    want = {}
    for n in names:
        t = titles.get(norm(ALIAS.get(n, n)))
        if t:
            want[t] = n
        else:
            print("  ! 문서 없음:", n, file=sys.stderr)
    data = {}
    keys = list(want)
    for i in range(0, len(keys), 40):
        r = ko_api(action="query", titles="|".join(keys[i:i + 40]), prop="revisions", rvprop="content", rvslots="main", redirects=1)
        back = {x["to"]: x["from"] for x in r["query"].get("redirects", [])}
        for p in r["query"]["pages"].values():
            if "revisions" not in p:
                continue
            t = p["revisions"][0]["slots"]["main"]["*"]
            src = want.get(back.get(p["title"], p["title"]))
            if not src:
                continue
            diff = field(t, "difficulty")
            price = re.sub(r"[^\d]", "", field(t, "price"))
            data[norm(src)] = {
                "difficulty": int(diff) if diff.isdigit() else None,
                "move": MOVE.get(field(t, "behavior"), field(t, "behavior") or None),
                "size": field(t, "size") or None,
                "price": int(price) if price else None,
            }
    js = "// tools/fetch_fish.py 가 만든 파일 — 물고기 난이도·움직임 (한국어 위키)\nwindow.SDV_FISH = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "fishinfo.js").write_text(js, encoding="utf-8")
    print("wrote data/fishinfo.js", len(data), "/", len(names), "· 난이도 있는 것", sum(1 for v in data.values() if v["difficulty"] is not None))


if __name__ == "__main__":
    main()
