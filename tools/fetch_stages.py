"""스타듀밸리 공식 위키에서 작물 성장 단계 그림·날수를 받아 assets/crops/ 와 data/stages.js 를 만든다.

    python tools/fetch_stages.py

그림은 게임 원작자(ConcernedApe)의 도트이고, 위키(stardewvalleywiki.com) 글은 CC BY-NC-SA 다.
페이지 아래쪽에 출처를 적어 둔다.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://stardewvalleywiki.com/mediawiki/api.php"

# 시트(한국어) 작물 이름 -> 위키 영어 문서 이름
PAGES = {
    "대황": "Rhubarb", "딸기": "Strawberry", "가공되지 않은 쌀": "Unmilled Rice", "감자": "Potato",
    "당근": "Carrot", "마늘": "Garlic", "완두콩": "Green Bean", "케일": "Kale", "콜리플라워": "Cauliflower",
    "파스닙": "Parsnip", "커피콩": "Coffee Bean", "푸른 재즈": "Blue Jazz", "튤립": "Tulip",
    "매운 고추": "Hot Pepper", "멜론": "Melon", "블루베리": "Blueberry", "스타프루트": "Starfruit",
    "무": "Radish", "밀": "Wheat", "붉은 양배추": "Red Cabbage", "여름호박": "Summer Squash",
    "옥수수": "Corn", "토마토": "Tomato", "홉": "Hops", "양귀비": "Poppy", "여름별꽃": "Summer Spangle",
    "해바라기": "Sunflower", "크랜베리": "Cranberries", "포도": "Grape", "가지": "Eggplant",
    "브로콜리": "Broccoli", "사탕무": "Beet", "아마란스": "Amaranth", "아티초크": "Artichoke",
    "참마": "Yam", "청경채": "Bok Choy", "호박": "Pumpkin", "달콤보석베리": "Sweet Gem Berry",
    "요정장미": "Fairy Rose", "고대과일": "Ancient Fruit", "선인장 열매": "Cactus Fruit",
    "파우더멜론": "Powdermelon", "파인애플": "Pineapple", "찻잎": "Tea Sapling", "토란": "Taro Root",
}
# 수확물 아이콘이 문서 이름과 다른 것
ITEM_ICON = {"Tea Sapling": "Tea Leaves", "Cranberries": "Cranberries"}


def fetch(url):
    """curl 로 받는다. 위키 서버에 부담 안 주게 요청 사이에 쉬어 간다."""
    for i in range(4):
        r = subprocess.run(["curl", "-sS", "-f", "--max-time", "30", url], capture_output=True)
        time.sleep(0.3)
        if r.returncode == 0:
            return r.stdout
        if i == 3:
            raise RuntimeError(f"{url}: {r.stderr.decode(errors='replace')}")
        time.sleep(2 ** i)


def api(**params):
    params["format"] = "json"
    return json.loads(fetch(API + "?" + urllib.parse.urlencode(params)))


def stages_of(page):
    t = api(action="parse", page=page, prop="wikitext", redirects=1)["parse"]["wikitext"]["*"]
    m = re.search(r'<section begin="cropstages" />(.*?)<section end="cropstages" />', t, re.S)
    if not m:
        m = re.search(r"==\s*Stages\s*==(.*?)\n\|\}", t, re.S)
    if not m:
        return None
    body = m.group(1)
    # 표의 첫 줄(헤더) · 그림 줄 · 날수 줄만 쓴다. 꽃처럼 색이 여럿이면 그림 줄이 더 있는데 첫 줄만 쓴다.
    rows = [r for r in re.split(r"\n\|-", body)]
    heads = re.findall(r"^!\s*(.+?)\s*$", rows[0], re.M)
    files, days = [], []
    for r in rows[1:]:
        f = re.findall(r"\[\[File:([^|\]]+)", r)
        if f and not files:
            files = [x.strip() for x in f]
            continue
        if files and not days:
            cells = [c.strip() for c in re.findall(r"^\|\s*(.+?)\s*$", r, re.M)]
            if cells and any(re.search(r"\d", c) for c in cells):
                # 쌀·토란은 「물가 아님」 같은 줄 이름 칸이 맨 앞에 붙어 있다
                if len(cells) > len(files) and not re.search(r"\d", cells[0]):
                    cells = cells[1:]
                days = cells
    return {"heads": heads, "files": files, "days": days}


def image_urls(titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        r = api(action="query", titles="|".join("File:" + t for t in chunk), prop="imageinfo", iiprop="url")
        norm = {n["to"]: n["from"] for n in r["query"].get("normalized", [])}
        for p in r["query"]["pages"].values():
            if "imageinfo" in p:
                key = p["title"][5:]
                out[norm.get(p["title"], p["title"])[5:]] = p["imageinfo"][0]["url"]
                out[key] = p["imageinfo"][0]["url"]
    return out


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def days_num(s):
    m = re.search(r"(\d+)", s or "")
    return int(m.group(1)) if m else None


def main():
    outdir = ROOT / "assets" / "crops"
    outdir.mkdir(parents=True, exist_ok=True)
    found = {}
    for ko, page in PAGES.items():
        st = stages_of(page)
        if not st or not st["files"]:
            print("  ! 단계 표 없음:", ko, page, file=sys.stderr)
            continue
        found[ko] = (page, st)
        print(ko, page, len(st["files"]), st["days"])
    want = {f for _, st in found.values() for f in st["files"]}
    want |= {ITEM_ICON.get(p, p) + ".png" for p, _ in found.values()}
    urls = image_urls(want)

    def get(fname):
        u = urls.get(fname) or urls.get(fname.replace("_", " "))
        if not u:
            print("  ! 그림 주소 없음:", fname, file=sys.stderr)
            return None
        local = outdir / (slug(Path(fname).stem) + ".png")
        if not local.exists():
            local.write_bytes(fetch(u))
        return "assets/crops/" + local.name

    data = {}
    for ko, (page, st) in found.items():
        stages = []
        for i, f in enumerate(st["files"]):
            head = st["heads"][i] if i < len(st["heads"]) else ""
            day = st["days"][i] if i < len(st["days"]) else ""
            kind = "harvest" if head.lower().startswith("harvest") else "regrow" if "after" in head.lower() else "stage"
            stages.append({"img": get(f), "kind": kind, "days": days_num(day) if kind == "stage" else None, "label": day})
        data[ko] = {"page": page, "icon": get(ITEM_ICON.get(page, page) + ".png"), "stages": stages}
    js = "// tools/fetch_stages.py 가 만든 파일 — 스타듀밸리 위키의 작물 성장 단계\nwindow.SDV_STAGES = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "stages.js").write_text(js, encoding="utf-8")
    print("wrote data/stages.js", len(data), "작물")


if __name__ == "__main__":
    main()
