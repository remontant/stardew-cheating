"""영어 위키 축제 문서의 대표 사진을 받아 폰에 맞게 줄여 assets/festivals/ 와 data/festivals.js 를 만든다.

    python tools/fetch_festivals.py
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT, fetch, image_urls, slug  # noqa: E402

# 시트 달력의 축제 이름 -> 위키 사진
FILES = {
    "달걀축제": "Egg Festival.png", "사막축제": "Desert Festival.png", "봄꽃무도회": "Flower Festival.jpg",
    "루아우": "Luau.png", "송어시합": "Trout Derby.png", "달빛해파리": "Dance Of The Moonlight Jellies.jpg",
    "품평회": "StardewValleyFair.png", "전야제": "Spirits Eve.png", "얼음축제": "Festival of Ice.png",
    "오징어축제": "SquidFest.png", "야시장": "NightMarket.jpg", "겨울별의만찬": "Feast of the Winterstar.png",
}
# 위키 문서 이름 (사진 아래 「위키에서 보기」 링크용)
PAGES = {
    "달걀축제": "Egg Festival", "사막축제": "Desert Festival", "봄꽃무도회": "Flower Dance", "루아우": "Luau",
    "송어시합": "Trout Derby", "달빛해파리": "Dance of the Moonlight Jellies", "품평회": "Stardew Valley Fair",
    "전야제": "Spirit's Eve", "얼음축제": "Festival of Ice", "오징어축제": "SquidFest", "야시장": "Night Market",
    "겨울별의만찬": "Feast of the Winter Star",
}


def main():
    urls = image_urls(set(FILES.values()))
    outdir = ROOT / "assets" / "festivals"
    outdir.mkdir(parents=True, exist_ok=True)
    data = {}
    for ko, f in FILES.items():
        u = urls.get(f)
        if not u:
            print("  ! 그림 없음:", ko, f, file=sys.stderr)
            continue
        local = outdir / (slug(Path(f).stem) + ".webp")
        if not local.exists():
            im = Image.open(io.BytesIO(fetch(u))).convert("RGB")
            im.thumbnail((560, 560))
            im.save(local, "WEBP", quality=80)
        data[ko] = {"img": "assets/festivals/" + local.name, "wiki": "https://stardewvalleywiki.com/" + PAGES[ko].replace(" ", "_")}
    js = "// tools/fetch_festivals.py 가 만든 파일 — 축제 사진 (스타듀밸리 위키)\nwindow.SDV_FESTIVALS = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "festivals.js").write_text(js, encoding="utf-8")
    print("wrote data/festivals.js", len(data))


if __name__ == "__main__":
    main()
