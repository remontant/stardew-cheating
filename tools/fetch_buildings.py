"""영어 위키에서 건물 그림을 받아 assets/buildings/ 와 data/buildings.js 를 만든다.

    python tools/fetch_buildings.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_stages import ROOT, fetch, image_urls, slug  # noqa: E402

# 시트의 「건물 이름|단계」 -> 위키 그림 파일
FILES = {
    "닭장|일반": "Coop.png", "닭장|큰": "Big Coop.png", "닭장|디럭스": "Deluxe Coop.png",
    "외양간|일반": "Barn.png", "외양간|큰": "Big Barn.png", "외양간|디럭스": "Deluxe Barn.png",
    "헛간|일반": "Shed.png", "헛간|큰": "Big Shed.png",
    "물고기 연못|": "Fish Pond.png", "풍차|": "Mill.png", "저장고|": "Silo.png", "마구간|": "Horse Stable.png",
    "슬라임장|": "Slime Hutch.png", "우물|": "Well.png", "오두막|": "Plank Cabin Stage 1.png",
    "배송상자|": "Shipping Bin Anim.gif", "반려동물 그릇|": "Pet Bowl Wood.png",
    "집 업그레이드|1단계": "House (tier 2).png", "집 업그레이드|2단계": "House (tier 3).png",
    "집 업그레이드|3단계": "Cellar Inside.png",
    "대지의 오벨리스크|": "Earth Obelisk.png", "물의 오벨리스크|": "Water Obelisk.png",
    "사막의 오벨리스크|": "Desert Obelisk.png", "섬의 오벨리스크|": "Island Obelisk.png",
    "주니모 오두막|": "Junimo Hut.png", "황금 시계|": "Gold Clock.png",
}


def main():
    urls = image_urls(set(FILES.values()))
    outdir = ROOT / "assets" / "buildings"
    outdir.mkdir(parents=True, exist_ok=True)
    data = {}
    for key, f in FILES.items():
        u = urls.get(f)
        if not u:
            print("  ! 그림 없음:", key, f, file=sys.stderr)
            continue
        local = outdir / (slug(Path(f).stem) + Path(f).suffix.lower())
        if not local.exists():
            local.write_bytes(fetch(u))
        # 큰 사진·움짤은 가볍게: 지하실 사진은 줄여서 webp, 배송상자 움짤은 첫 장만
        if local.suffix == ".gif" or local.stat().st_size > 200_000:
            from PIL import Image
            im = Image.open(local)
            im.seek(0)
            small = local.with_suffix(".webp" if local.suffix != ".gif" else ".png")
            if local.suffix == ".gif":
                im.convert("RGBA").save(small)
            else:
                im = im.convert("RGB")
                im.thumbnail((420, 420))
                im.save(small, "WEBP", quality=82)
            local.unlink()
            local = small
        data[key] = "assets/buildings/" + local.name
    js = "// tools/fetch_buildings.py 가 만든 파일 — 건물 그림 (스타듀밸리 위키)\nwindow.SDV_BUILDINGS = " + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data" / "buildings.js").write_text(js, encoding="utf-8")
    print("wrote data/buildings.js", len(data), "/", len(FILES))


if __name__ == "__main__":
    main()
