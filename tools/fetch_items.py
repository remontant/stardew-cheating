"""시트에 나오는 아이템(선물·번들·물고기·채집·요리·제작품) 이름마다 게임 아이콘을 붙인다.

한국어 위키에서 한글 이름 문서를 찾아 영어 이름(|eng=)을 읽고, 영어 위키의 같은 이름 그림을 받는다.
시트는 띄어쓰기가 위키와 다를 때가 많아서(매운고추 / 매운 고추) 못 찾으면 검색 결과 중
공백을 뺀 제목이 같은 것을 쓴다. 그래도 못 찾은 이름은 그림 없이 둔다.

    python tools/fetch_items.py
"""
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT, fetch, image_urls, slug  # noqa: E402

KO_API = "https://ko.stardewvalleywiki.com/mediawiki/api.php"


def ko_api(**params):
    params["format"] = "json"
    return json.loads(fetch(KO_API + "?" + urllib.parse.urlencode(params)))


def norm(s):
    return re.sub(r"\s+", "", s or "")


def clean(name):
    """「미끼 * 5」「나무화로 (250골드)」「파스닙 금별 5개」 같은 꼬리를 떼고 아이템 이름만 남긴다."""
    name = re.sub(r"\s*\(.*?\)$", "", name)
    name = re.sub(r"\s*\*\s*\d+$", "", name)
    name = re.sub(r"\s*(금별\s*)?\d+개$", "", name)
    return name.strip()


# 시트 오타 -> 위키 이름
ALIAS = {"바다가재": "바닷가재", "붉은통돔": "붉은퉁돔", "생선태코": "생선타코", "앵무조개 껌데기": "앵무조개 껍데기"}


def collect():
    s = (ROOT / "data" / "data.js").read_text(encoding="utf-8")
    d = json.loads(s[s.index("{"):s.rstrip().rindex(";")])
    names = set()
    for v in d["villagers"]["list"]:
        names |= {g["name"] for g in v["gifts"]}
    for room in d["bundles"]["rooms"]:
        for b in room["bundles"]:
            names |= {it["label"] for it in b["items"] if it["cat"] != "골드"}
    for r in d["cooking"]["list"]:
        names.add(r["name"])
        names |= {i["name"] for i in r["ings"]}
    names |= {f["name"] for f in d["fish"]["list"]}
    names |= {f["name"] for f in d["forage"]["list"]}
    for sec in d["crafting"]["sections"]:
        names |= {i["name"] for i in sec["items"]}
        # 제작 재료 「나무 (10), 석탄 (1)」
        for i in sec["items"]:
            names |= {re.sub(r"\s*\(\d+\)\s*$", "", m).strip() for m in re.split(r",\s*", i["mats"]) if m.strip()}
    # 건물 재료 「나무 300개」
    for b in d["buildings"]["robin"] + d["buildings"]["wizard"]:
        names |= {c for c in b["cost"] if "골드" not in c}
    out = {}
    for n in names:
        c = clean(n)
        c = ALIAS.get(c, c)
        if c and not c.startswith("아무"):
            out.setdefault(c, set()).add(n)
    return out


def file_of(text):
    """문서의 아이템 그림 파일. 「|eng = Coconut」이면 Coconut.png, 「|image = Diamond.png」이면 그대로."""
    m = re.search(r"\|\s*image\s*=\s*([^\n|]+\.png)", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"\|\s*eng\s*=\s*([^\n|]+)", text)
    return m.group(1).strip() + ".png" if m else None


def lookup(titles):
    """한국어 위키 문서 제목들 -> 영어 이름"""
    found = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        r = ko_api(action="query", titles="|".join(chunk), prop="revisions", rvprop="content", rvslots="main", redirects=1)
        q = r["query"]
        back = {}
        for n in q.get("normalized", []):
            back[n["to"]] = n["from"]
        for n in q.get("redirects", []):
            back[n["to"]] = back.get(n["from"], n["from"])
        for p in q["pages"].values():
            if "missing" in p:
                continue
            text = p["revisions"][0]["slots"]["main"]["*"]
            f = file_of(text)
            if f:
                found[back.get(p["title"], p["title"])] = f
    return found


def all_titles():
    """위키 검색이 결과를 안 돌려줘서, 문서 제목 전체를 받아 공백을 뺀 이름으로 맞춘다."""
    out, cont = {}, {}
    while True:
        r = ko_api(action="query", list="allpages", apnamespace=0, aplimit=500, **cont)
        for p in r["query"]["allpages"]:
            out.setdefault(norm(p["title"]), p["title"])
        if "continue" not in r:
            return out
        cont = {"apcontinue": r["continue"]["apcontinue"]}


def main():
    names = collect()
    print(len(names), "개 이름")
    eng = lookup(names.keys())
    miss = [n for n in names if n not in eng]
    print("바로 찾음", len(eng), "· 못 찾음", len(miss))
    titles = all_titles()
    print("위키 문서 제목", len(titles))
    alt = {}
    for n in miss:
        t = titles.get(norm(n))
        if t and t != n:
            alt[t] = n
    for t, e in lookup(alt.keys()).items():
        eng[alt[t]] = e
    still = sorted(n for n in names if n not in eng)
    print("검색으로 더 찾음 → 남은 것", len(still), still, file=sys.stderr)

    urls = image_urls(set(eng.values()))
    outdir = ROOT / "assets" / "items"
    outdir.mkdir(parents=True, exist_ok=True)
    data = {}
    for ko, e in sorted(eng.items()):
        u = urls.get(e) or urls.get(e.replace("_", " "))
        if not u:
            print("  ! 그림 없음:", ko, e, file=sys.stderr)
            continue
        local = outdir / (slug(Path(e).stem) + ".png")
        if not local.exists():
            local.write_bytes(fetch(u))
        for raw in names[ko] | {ko}:
            data[norm(raw)] = "assets/items/" + local.name
    js = "// tools/fetch_items.py 가 만든 파일 — 아이템 이름(공백 뺀 것) -> 게임 아이콘\nwindow.SDV_ITEMS = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "items.js").write_text(js, encoding="utf-8")
    print("wrote data/items.js", len(data))


if __name__ == "__main__":
    main()
