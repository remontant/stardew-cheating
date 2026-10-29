"""한국어 위키 주민 문서의 「선물」 절에서 사랑함·좋아함·싫어함·혐오함 목록을 받아 data/gifts.js 를 만든다.
아이템 그림이 assets/items/ 에 없으면 영어 위키에서 받는다.

    python tools/fetch_gifts.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT, fetch, image_urls, slug  # noqa: E402
from fetch_items import ko_api  # noqa: E402
from fetch_portraits import PEOPLE  # noqa: E402

# 위키 절 이름 -> 우리 단계. 괜찮음(평범)은 너무 많고 쓸모가 적어 뺀다.
LEVELS = {"사랑함": "love", "좋아함": "like", "싫어함": "dislike", "혐오함": "hate"}


def parse(text):
    out = {}
    for m in re.finditer(r"^===\s*(.+?)\s*===\s*$", text, re.M):
        lv = LEVELS.get(m.group(1))
        if not lv:
            continue
        nxt = re.search(r"^==", text[m.end():], re.M)
        body = text[m.end(): m.end() + (nxt.start() if nxt else len(text))]
        items, notes = [], []
        # 표 첫 줄은 「모든 보편적으로 … 선물」 같은 안내
        for n in re.findall(r"'''(모든[^']*?)'''", body):
            notes.append(re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", n))
        for row in re.split(r"\n\|-", body):
            f = re.search(r"\[\[File:([^|\]]+\.png)\|center\]\]", row)
            name = re.search(r"^\|\s*\[\[(?!File:)([^|\]]+)(?:\|([^\]]+))?\]\]", row, re.M)
            if f and name:
                items.append({"name": (name.group(2) or name.group(1)).strip(), "file": f.group(1).strip()})
        out[lv] = {"items": items, "notes": notes}
    return out


def main():
    data, files = {}, set()
    for ko in PEOPLE:
        t = ko_api(action="parse", page=ko, prop="wikitext", redirects=1)["parse"]["wikitext"]["*"]
        g = parse(t)
        data[ko] = g
        for lv in g.values():
            files |= {i["file"] for i in lv["items"]}
        print(ko, {k: len(v["items"]) for k, v in g.items()})
    outdir = ROOT / "assets" / "items"
    need = {f for f in files if not (outdir / (slug(Path(f).stem) + ".png")).exists()}
    urls = image_urls(need) if need else {}
    for f in need:
        u = urls.get(f)
        if u:
            (outdir / (slug(Path(f).stem) + ".png")).write_bytes(fetch(u))
    for g in data.values():
        for lv in g.values():
            for i in lv["items"]:
                p = outdir / (slug(Path(i.pop("file")).stem) + ".png")
                i["img"] = "assets/items/" + p.name if p.exists() else None
    js = "// tools/fetch_gifts.py 가 만든 파일 — 한국어 위키의 주민별 선물 취향\nwindow.SDV_GIFTS = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "gifts.js").write_text(js, encoding="utf-8")
    print("wrote data/gifts.js", len(data), "명 · 새 그림", len(need))


if __name__ == "__main__":
    main()
