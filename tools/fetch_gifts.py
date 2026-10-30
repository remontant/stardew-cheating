"""한국어 위키에서 주민별 선물 취향(사랑함·좋아함·괜찮음·싫어함·혐오함)을 받아 data/gifts.js 를 만든다.
아이템 그림이 assets/items/ 에 없으면 영어 위키에서 받는다.

    python tools/fetch_gifts.py

- 「모든 선물 목록」 표가 기준이다. 주민마다 따로 적힌 아이템과 「모든 야채 (홉 … 제외)」 같은 묶음이 있고,
  맨 위 「보편적인 것」 줄이 거의 모두가 사랑·좋아하는 선물이다 → window.SDV_GIFTS_UNI
- 보편적으로 싫어함·혐오함은 「우정」 문서의 두 절에서 받는다.
- 주민 문서의 「선물」 절에만 있는 아이템(레오의 카오 니야우 마무앙, 윌리의 생선 요리 …)은 덧붙인다.
- 화면에서는 주민이 다른 단계에 따로 올린 보편 선물, 같은 종류를 따로 적은 묶음은 뺀다 (assets/app.js uniFor).
"""
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT, fetch, image_urls, slug  # noqa: E402
from fetch_items import ko_api, norm  # noqa: E402
from fetch_portraits import PEOPLE  # noqa: E402

LEVELS = ["love", "like", "neutral", "dislike", "hate"]
# 주민 문서 절 이름 -> 단계
PAGE_LEVELS = {"사랑함": "love", "좋아함": "like", "싫어함": "dislike", "혐오함": "hate"}
# 「모든 선물 목록」 머리말의 「모든 버섯」. 주민 문서에서 하나씩 적힌 버섯은 묶음 칩과 겹치니 뺀다.
MUSHROOMS = {"흔한버섯", "살구버섯", "곰보버섯", "붉은버섯", "보라색버섯", "마그마버섯"}


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def file_of(li):
    m = re.search(r'<img[^>]+src="([^"]+)"', li)
    if not m:
        return None
    src = urllib.parse.unquote(m.group(1))
    f = re.search(r"/([^/]+\.png)/\d+px-", src) or re.search(r"/([^/]+\.png)$", src)
    return f.group(1).replace("_", " ") if f else None


def li_list(ul):
    """<ul> 안의 <li> 를 아이템(그림 달린 이름)과 묶음 글로 나눈다."""
    items, notes = [], []
    for li in re.findall(r"<li>(.*?)</li>", ul, re.S):
        if 'class="nametemplate"' in li:
            nt = re.search(r'<span class="nametemplate">(.*?</a>)\s*</span>', li, re.S)
            a = re.search(r"<a [^>]*>(.*?)</a>", li, re.S)
            name = text(a.group(1)) if a else text(li)
            memo = text(li[nt.end():]) if nt else ""
            items.append({"name": name, "file": file_of(li), **({"memo": memo} if memo else {})})
        else:
            notes.append(text(li))
    return {"items": items, "notes": notes}


def parse_all_gifts():
    page = ko_api(action="parse", page="모든 선물 목록", prop="text", redirects=1)["parse"]["text"]["*"]
    out = {}
    for row in re.split(r"<tr[ >]", page)[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 7:
            continue
        g = {}
        for lv, cell in zip(LEVELS, cells[2:7]):
            ul = re.search(r"<ul>(.*)</ul>", cell, re.S)
            g[lv] = li_list(ul.group(1)) if ul else {"items": [], "notes": [text(cell)] if text(cell) else []}
        out[text(cells[0])] = g
    return out


def parse_friendship():
    page = ko_api(action="parse", page="우정", prop="text", redirects=1)["parse"]["text"]["*"]
    out = {}
    for lv, title in (("dislike", "보편적으로 싫어하는 선물"), ("hate", "보편적으로 혐오하는 선물")):
        m = re.search(r"<h3[^>]*>(?:<span[^>]*></span>)?\s*" + title + r"\s*</h3>(.*?)(?=<div class=\"mw-heading|<h[234])", page, re.S)
        acc = {"items": [], "notes": []}
        for ul in re.findall(r"<ul>(.*?)</ul>", m.group(1) if m else "", re.S):
            r = li_list(ul)
            acc["items"] += r["items"]
            acc["notes"] += r["notes"]
        out[lv] = acc
    return out


def parse_villager_page(text_):
    """주민 문서 「선물」 절의 표. 「모든 선물 목록」에 빠진 아이템을 덧붙이는 데만 쓴다."""
    out = {}
    for m in re.finditer(r"^===\s*(.+?)\s*===\s*$", text_, re.M):
        lv = PAGE_LEVELS.get(m.group(1))
        if not lv:
            continue
        nxt = re.search(r"^==", text_[m.end():], re.M)
        body = text_[m.end(): m.end() + (nxt.start() if nxt else len(text_))]
        items = []
        for row in re.split(r"\n\|-", body):
            f = re.search(r"\[\[File:([^|\]]+\.png)\|center\]\]", row)
            name = re.search(r"^\|\s*\[\[(?!File:)([^|\]]+)(?:\|([^\]]+))?\]\]", row, re.M)
            if f and name:
                items.append({"name": (name.group(2) or name.group(1)).strip(), "file": f.group(1).strip()})
        out[lv] = items
    return out


def main():
    ag = parse_all_gifts()
    fu = parse_friendship()
    outdir = ROOT / "assets" / "items"
    files = set()

    def conv(it):
        if it.get("file"):
            files.add(it["file"])
        return {"name": it["name"], "file": it.get("file"), **({"memo": it["memo"]} if it.get("memo") else {})}

    data = {}
    for ko in PEOPLE:
        a = ag.get(ko)
        if not a:
            raise SystemExit("모든 선물 목록에 없음: " + ko)
        page = parse_villager_page(ko_api(action="parse", page=ko, prop="wikitext", redirects=1)["parse"]["wikitext"]["*"])
        seen = {norm(i["name"]) for lv in LEVELS for i in a[lv]["items"]}
        used = {i["file"] for lv in LEVELS for i in a[lv]["items"] if i.get("file")}
        data[ko] = {}
        for lv in LEVELS:
            items = [conv(i) for i in a[lv]["items"]]
            mush = any(n.startswith("모든 버섯") for n in a[lv]["notes"])
            for i in page.get(lv, []):
                # 이름이 어긋난 줄(그림이 이미 다른 이름으로 쓰인 것)은 버린다 — 하비 「착유기」 등
                if norm(i["name"]) in seen or i["file"] in used or (mush and norm(i["name"]) in MUSHROOMS):
                    continue
                items.append(conv(i))
                seen.add(norm(i["name"]))
            data[ko][lv] = {"items": items, "notes": a[lv]["notes"]}
        print(ko, {lv: len(v["items"]) for lv, v in data[ko].items()})
    u = ag["보편적인 것"]
    uni = {
        "love": {"items": [conv(i) for i in u["love"]["items"]], "notes": []},
        "like": {"items": [conv(i) for i in u["like"]["items"]], "notes": u["like"]["notes"]},
        "dislike": {"items": [conv(i) for i in fu["dislike"]["items"]], "notes": fu["dislike"]["notes"]},
        "hate": {"items": [conv(i) for i in fu["hate"]["items"]], "notes": fu["hate"]["notes"]},
    }

    need = {f for f in files if not (outdir / (slug(Path(f).stem) + ".png")).exists()}
    urls = image_urls(need) if need else {}
    for f in need:
        url = urls.get(f)
        if url:
            (outdir / (slug(Path(f).stem) + ".png")).write_bytes(fetch(url))
    for g in [*data.values(), uni]:
        for lv in g.values():
            for i in lv["items"]:
                f = i.pop("file")
                p = outdir / (slug(Path(f).stem) + ".png") if f else None
                i["img"] = "assets/items/" + p.name if p and p.exists() else None

    js = "// tools/fetch_gifts.py 가 만든 파일 — 한국어 위키 「모든 선물 목록」·「우정」의 선물 취향\n" + \
        "window.SDV_GIFTS = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n" + \
        "// 보편적인 선물: 주민마다 다른 단계에 올라 있거나 같은 종류(모든 야채 …)를 따로 적은 주민은 빼고 보여준다\n" + \
        "window.SDV_GIFTS_UNI = " + json.dumps(uni, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "gifts.js").write_text(js, encoding="utf-8")
    print("wrote data/gifts.js", len(data), "명 · 새 그림", len(need))


if __name__ == "__main__":
    main()
