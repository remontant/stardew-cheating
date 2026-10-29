# MAREAPU 농장 번성하라 🌱

gihoon · cojee 의 MAREAPU 농장(멀티). 닌텐도 스위치로 거실에서 스타듀밸리 하면서 폰으로 보려고 만든 공략 페이지.

정보는 전부 **유튜브 [에글이](https://www.youtube.com/@%EC%97%90%EA%B8%80%EC%9D%B4) 님의
[스타듀밸리 구글 시트](https://docs.google.com/spreadsheets/d/1y9wapWb8nqG0fVHTpCD82pj-Ak1Ms9VSbwV10oN5K5E/edit)** 에서 가져왔다.
시트가 폰에서 보기 힘들어서 화면만 다시 짰다. 내용이 다르면 원본 시트가 맞다.

## 들어있는 것

| 탭 | 내용 |
|---|---|
| 🏠 홈 | 게임 날짜를 맞춰 두면 오늘 생일(+좋아하는 선물)·축제, 다가오는 7일, 이번 계절에만 구할 수 있는 번들 재료, 지금 심어도 계절 안에 거두는 작물, 오늘 날씨에 잡히는 물고기 |
| 📅 달력 | 계절별 생일·축제. 날짜를 누르면 그날 생일인 주민의 선물 |
| 🎁 선물 | 주민 34명의 사랑하는 선물. 빨간 칩 = 구하기 쉬운 추천 선물 |
| 📦 번들 | 마을회관 꾸러미 체크리스트 (체크는 그 폰에만 저장) |
| 🌱 작물 | 봄·여름·가을·그 외. 성장일(비료·농업전문가), 판매가(별·경작인), 가공가 |
| 🎣 낚시 | 계절·날씨·장소로 거르기 |
| 🍄 채집 · 🍳 요리 · 🔨 제작 · 🏡 건물 · 📐 배치(스프링클러·허수아비·양봉장 범위) · 📖 기초 | |

위쪽 검색창은 전체 검색이다. 「호박」을 치면 작물·요리·좋아하는 주민·번들이 한 번에 나온다.

## 보는 법

빌드 없는 정적 페이지다. `index.html` 을 그냥 열어도 되고, GitHub Pages 로 올려서 주소로 본다.

## 원본 시트가 업데이트되면

1. 구글 시트에서 **파일 → 다운로드 → Microsoft Excel (.xlsx)**
2. `pip install openpyxl`
3. `python tools/extract.py 받은파일.xlsx` → `data/data.js` 가 새로 만들어진다
4. 커밋·푸시

시트는 칸 병합과 배경색으로 의미를 나눈 표라서, 추출 스크립트가 열 위치와 색을 직접 짚는다.
원작자가 표 모양을 크게 바꾸면 `tools/extract.py` 도 같이 고쳐야 한다.

시트에서 바로잡아 옮긴 것 (원본 시트는 그대로):
- 달력 가을 5일 생일 알렉스 → 엘리엇 (생일은 선물 시트 기준으로 채움)
- 「에블린린」→ 에블린, 「하빈」→ 하비, 번들 「야채고추냉이」→ 야생고추냉이
- 제작품의 두 번째 「전투 스킬」 칸(체리폭탄·계단…) → 채광 스킬

## 농장 · 둘이 같이 보기

처음엔 **MAREAPU 농장**(gihoon · cojee) 과 **마르농장**(호스트 cojee) 둘이고, 홈 날짜 카드에서
「＋ 농장」으로 최대 5개까지 더하고 ✏️ 로 이름을 바꾸거나 지운다.
게임 날짜·날씨·번들 체크는 농장마다 따로 저장된다.

`assets/firebase-config.js` 가 `null` 이면 각 폰에만 저장되고, Firebase 설정을 넣으면
Firestore 의 `stardew/{농장id}` 문서(체크·날짜)와 `stardew/_farms` 문서(농장 목록)를 둘이 같이 쓴다.

Firebase 쪽에서 할 일:
1. Authentication → 로그인 방법 → **익명** 사용 설정
2. Firestore → 규칙에 아래 블록을 **기존 규칙 안에 추가** (다른 앱 규칙은 그대로 둔다)

```
match /stardew/{doc} {
  allow read, write: if request.auth != null;
}
```

## 작물 성장 단계 그림

`python tools/fetch_stages.py` · `python tools/fetch_portraits.py` 가 [스타듀밸리 위키](https://stardewvalleywiki.com)에서 작물별 성장 단계 도트와
단계별 날수, 주민 초상화를 받아 `assets/crops/` · `assets/people/` 와 `data/stages.js` · `data/portraits.js` 를 만든다(찻잎은 위키에 단계 표가 없어 빠짐).
게임 그림 © ConcernedApe.

`python tools/fetch_items.py` 는 시트에 나오는 아이템 이름(선물·번들·물고기·채집·요리·제작품)마다
[한국어 위키](https://ko.stardewvalleywiki.com)에서 같은 이름 문서를 찾아 그림 파일을 알아내고, 영어 위키에서 그 그림을 받아
`assets/items/` 와 `data/items.js` 를 만든다. 띄어쓰기가 달라도(매운고추 / 매운 고추) 맞춘다.

`python tools/fetch_gifts.py` 는 한국어 위키 주민 문서의 「선물」 절에서 사랑함·좋아함·싫어함·혐오함 목록을 받아
`data/gifts.js` 를 만든다. 선물 화면은 시트의 사랑 목록(빨간 = 추천)을 앞에 두고 위키 목록을 덧붙인다.
