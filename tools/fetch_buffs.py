"""한국어 위키 요리 문서들에서 버프(농사·채집·낚시·채광·공격 …)·지속시간·회복량을 받아 data/buffs.js 를 만든다.

    python tools/fetch_buffs.py
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT  # noqa: E402
from fetch_items import ko_api  # noqa: E402

# 위키 버프 이름 -> 화면에 쓸 한글
STAT = {
    "Farming": "농사", "Fishing": "낚시", "Mining": "채광", "Foraging": "채집", "Luck": "행운",
    "Attack": "공격력", "Defense": "방어력", "Speed": "속도", "Max Energy": "최대 기력",
    "Magnetism": "자력", "Immunity": "면역",
}


def norm(s):
    return re.sub(r"\s+", "", s or "")


def field(text, key):
    m = re.search(r"^\|\s*" + key + r"\s*=\s*(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def main():
    page = ko_api(action="parse", page="요리", prop="wikitext")["parse"]["wikitext"]["*"]
    titles = re.findall(r"\{\{:([^}|]+)", page)
    print(len(titles), "개 요리 문서")
    data = {}
    for i in range(0, len(titles), 40):
        r = ko_api(action="query", titles="|".join(titles[i:i + 40]), prop="revisions", rvprop="content", rvslots="main", redirects=1)
        for p in r["query"]["pages"].values():
            if "revisions" not in p:
                continue
            t = p["revisions"][0]["slots"]["main"]["*"]
            buffs = []
            for name, val in re.findall(r"\{\{Name\|([^|}]+)\|([+\-]?\d+)", field(t, "buff")):
                buffs.append({"stat": STAT.get(name.strip(), name.strip()), "val": int(val)})
            ed = field(t, "edibility")
            energy = health = None
            if re.fullmatch(r"-?\d+", ed):
                e = int(ed)
                # 게임 공식: 기력 = 식용값 × 2.5, 체력 = 기력 × 0.45
                energy = math.ceil(e * 2.5) if e > 0 else int(e * 2.5)
                health = math.floor(energy * 0.45) if e > 0 else 0
            data[norm(p["title"])] = {"name": p["title"], "buffs": buffs, "dur": field(t, "duration"),
                                      "energy": energy, "health": health}
    js = "// tools/fetch_buffs.py 가 만든 파일 — 요리별 버프·지속시간·회복량 (한국어 위키)\nwindow.SDV_BUFFS = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "buffs.js").write_text(js, encoding="utf-8")
    print("wrote data/buffs.js", len(data), "· 버프 있는 요리", sum(1 for v in data.values() if v["buffs"]))


if __name__ == "__main__":
    main()
