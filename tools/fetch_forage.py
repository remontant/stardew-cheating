"""한국어 위키 채집물 문서에서 판매가·식용값을 받아 data/forageinfo.js 를 만든다.

    python tools/fetch_forage.py
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT  # noqa: E402
from fetch_items import ALIAS, all_titles, ko_api, norm  # noqa: E402
from fetch_fish import field  # noqa: E402

# 시트 오타 -> 위키 이름
ALIAS2 = {**ALIAS, "앵무조개 껌데기": "앵무조개 껍데기"}


def main():
    s = (ROOT / "data" / "data.js").read_text(encoding="utf-8")
    d = json.loads(s[s.index("{"):s.rstrip().rindex(";")])
    names = sorted({f["name"] for f in d["forage"]["list"]})
    titles = all_titles()
    want = {}
    for n in names:
        t = titles.get(norm(ALIAS2.get(n, n)))
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
            price = re.sub(r"[^\d]", "", field(t, "sellprice"))
            ed = field(t, "edibility")
            energy = None
            if re.fullmatch(r"-?\d+", ed) and int(ed) > 0:
                energy = math.ceil(int(ed) * 2.5)
            data[norm(src)] = {"price": int(price) if price else None, "energy": energy}
    js = "// tools/fetch_forage.py 가 만든 파일 — 채집물 판매가·기력 (한국어 위키)\nwindow.SDV_FORAGE = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "forageinfo.js").write_text(js, encoding="utf-8")
    print("wrote data/forageinfo.js", len(data), "/", len(names))


if __name__ == "__main__":
    main()
