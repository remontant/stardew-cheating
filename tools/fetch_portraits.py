"""스타듀밸리 위키에서 주민 초상화를 받아 assets/people/ 와 data/portraits.js 를 만든다.

    python tools/fetch_portraits.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT, api, fetch, image_urls, slug  # noqa: E402

PEOPLE = {
    "헤일리": "Haley", "켄트": "Kent", "셰인": "Shane", "루이스": "Lewis", "에밀리": "Emily", "빈센트": "Vincent",
    "마루": "Maru", "팸": "Pam", "알렉스": "Alex", "피에르": "Pierre", "샘": "Sam", "재스": "Jas", "페니": "Penny",
    "거스": "Gus", "엘리엇": "Elliott", "드미트리우스": "Demetrius", "애비게일": "Abigail", "드워프": "Dwarf",
    "세바스찬": "Sebastian", "윌리": "Willy", "하비": "Harvey", "레오": "Leo", "레아": "Leah", "조디": "Jodi",
    "샌디": "Sandy", "마니": "Marnie", "로빈": "Robin", "조지": "George", "크로버스": "Krobus", "라이너스": "Linus",
    "캐롤라인": "Caroline", "마법사": "Wizard", "에블린": "Evelyn", "클린트": "Clint",
}


def main():
    files = {}
    for ko, page in PEOPLE.items():
        t = api(action="parse", page=page, prop="wikitext", redirects=1)["parse"]["wikitext"]["*"]
        m = re.search(r"\|\s*portrait\s*=\s*([^\n|]+)", t)
        files[ko] = (m.group(1).strip() if m else page + ".png")
        print(ko, page, files[ko])
    urls = image_urls(set(files.values()))
    outdir = ROOT / "assets" / "people"
    outdir.mkdir(parents=True, exist_ok=True)
    data = {}
    for ko, f in files.items():
        u = urls.get(f)
        if not u:
            print("  ! 그림 없음:", ko, f, file=sys.stderr)
            continue
        local = outdir / (slug(Path(f).stem) + ".png")
        if not local.exists():
            local.write_bytes(fetch(u))
        data[ko] = "assets/people/" + local.name
    js = "// tools/fetch_portraits.py 가 만든 파일 — 스타듀밸리 위키의 주민 초상화\nwindow.SDV_PORTRAITS = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "portraits.js").write_text(js, encoding="utf-8")
    print("wrote data/portraits.js", len(data), "명")


if __name__ == "__main__":
    main()
