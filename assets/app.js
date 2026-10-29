(() => {
  "use strict";
  const D = window.SDV;
  const SEASONS = ["봄", "여름", "가을", "겨울"];
  const DOW = ["월", "화", "수", "목", "금", "토", "일"];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = (s) => esc(s).replace(/\n/g, "<br>");
  // 시트 안에서 같은 것도 띄어쓰기가 제각각이라(매운고추/매운 고추) 비교는 공백을 빼고 한다
  const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
  const sClass = (s) => "s-" + String(s).replace(/\s/g, "");
  const tag = (s) => `<span class="season-tag ${sClass(s)}">${esc(s)}</span>`;
  const gold = (n) => (typeof n === "number" ? n.toLocaleString("ko-KR") + "g" : esc(n ?? "-"));

  // ---------------------------------------------------------------- 저장 (이 폰에만)
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sdv." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sdv." + k, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 */ } },
  };
  let date = store.get("date", { y: 1, s: 0, d: 1 });
  let weather = store.get("weather", "맑음");
  const done = new Set(store.get("bundles", []));
  const ui = {}; // 화면별 필터 상태

  const season = () => SEASONS[date.s];
  const dow = (d) => DOW[(d - 1) % 7];
  const ordOf = (s, d) => s * 28 + (d - 1);
  const dateText = (dt = date) => `${dt.y}년차 ${SEASONS[dt.s]} ${dt.d}일 (${dow(dt.d)})`;

  function shiftDate(n) {
    let o = ordOf(date.s, date.d) + n, y = date.y;
    while (o < 0) { o += 112; y = Math.max(1, y - 1); }
    while (o >= 112) { o -= 112; y += 1; }
    date = { y, s: Math.floor(o / 28), d: (o % 28) + 1 };
    store.set("date", date);
  }

  // ---------------------------------------------------------------- 색인
  const villagers = D.villagers.list;
  const vByName = new Map(villagers.map((v) => [v.name, v]));
  const lovedBy = new Map(); // 선물 이름 -> [{v, rec}]
  for (const v of villagers) for (const g of v.gifts) {
    const k = norm(g.name);
    if (!lovedBy.has(k)) lovedBy.set(k, []);
    lovedBy.get(k).push({ v, rec: g.rec });
  }

  const bundleItems = [];
  for (const room of D.bundles.rooms) for (const b of room.bundles) for (const it of b.items) {
    const base = it.label.replace(/\s*(금별\s*)?\d+개$/, "");
    bundleItems.push({ id: b.name + "|" + it.label, room: room.room, bundle: b, base, ...it });
  }
  const needIndex = new Map();
  for (const it of bundleItems) {
    const k = norm(it.base);
    if (!needIndex.has(k)) needIndex.set(k, []);
    needIndex.get(k).push(it);
  }
  // 사계절 내내 나는 것(큰입우럭 등)은 "이번 계절에만" 목록에서 뺀다
  const onlyNow = (it) => it.seasons.includes(season()) && it.seasons.length < 4;
  const stillNeeded = (name) => (needIndex.get(norm(name)) || []).filter((it) => !done.has(it.id));
  const needMark = (name) => (stillNeeded(name).length ? " 📦" : "");

  const fishWeatherOk = (f, w) => {
    if (!w || w === "전체") return true;
    if (f.weather.startsWith("비")) return w === "비";
    if (f.weather.startsWith("맑음")) return w === "맑음";
    return true;
  };

  // ---------------------------------------------------------------- 공통 조각
  const notesBlock = (notes, video) => {
    const list = (notes || []).filter(Boolean);
    let h = "";
    if (list.length) h += `<ul class="notes">${list.map((n) => `<li>${br(n.replace(/^[*\-]\s*/, ""))}</li>`).join("")}</ul>`;
    if (video) h += `<a class="video" href="${esc(video)}" target="_blank" rel="noopener">▶ 원작자 관련 영상</a>`;
    return h;
  };
  const filterRow = (key, options, cur) =>
    `<div class="filters">${options.map(([v, label]) =>
      `<button class="f${String(cur) === String(v) ? " on" : ""}" data-f="${esc(key)}" data-v="${esc(v)}">${esc(label ?? v)}</button>`).join("")}</div>`;
  const giftChips = (v) => `<div class="chips">${v.gifts.map((g) =>
    `<span class="chip${g.rec ? " rec" : ""}">${esc(g.name)}${g.memo ? ` <span class="muted small">${esc(g.memo)}</span>` : ""}</span>`).join("")}</div>`;
  const link = (page, focus, label, cls = "chip") => `<a class="${cls}" href="#/${page}?focus=${encodeURIComponent(focus)}">${label}</a>`;
  const daysUntil = (b) => (ordOf(SEASONS.indexOf(b.season), b.day) - ordOf(date.s, date.d) + 112) % 112;

  function villagerCard(v, open) {
    const b = v.birthday;
    const left = b ? daysUntil(b) : null;
    const when = left === 0 ? `<span class="badge warn">오늘 생일!</span>` : left != null && left <= 7 ? `<span class="badge">${left}일 후</span>` : "";
    return `<div class="card" id="x-${esc(norm(v.name))}">
      <div class="daybar" style="gap:8px;flex-wrap:wrap">
        <span class="title">${esc(v.name)}</span>
        ${b ? `${tag(b.season)} <span class="sub">${b.day}일 생일</span>` : ""}
        ${v.marry ? `<span class="sub">💍 결혼 가능</span>` : ""}
        <span class="right">${when}</span>
      </div>
      ${open !== false ? `<div style="margin-top:6px">${giftChips(v)}</div>` : ""}
    </div>`;
  }

  // ---------------------------------------------------------------- 홈
  function cropReady(c) {
    // 오늘 심어서 계절이 끝나기 전에 첫 수확이 되는가. 다계절 작물은 이어지는 계절까지 센다.
    if (!c.seasons.includes(season())) return null;
    let left = 28 - date.d;
    for (let i = date.s + 1; i < 4 && c.seasons.includes(SEASONS[i]); i++) left += 28;
    const g = typeof c.grow[0] === "number" ? c.grow[0] : null;
    return g == null ? null : { ok: g <= left, days: g, left };
  }

  function pageHome() {
    const s = season();
    const today = (D.calendar.days[s] || {})[date.d] || { birthdays: [], events: [] };
    let h = `<div class="card today">
      <div class="motto">🌾 MAREAPU 농장 번성하라!</div>
      <div class="daybar"><div class="big">${esc(dateText())}</div></div>
      <div class="daybar">
        <button class="btn" data-act="prev">◀ 어제</button>
        <button class="btn" data-act="pick">날짜 고르기</button>
        <button class="btn primary right" data-act="next">다음 날 ▶</button>
      </div>
    </div>`;

    h += `<h2>오늘</h2>`;
    if (!today.birthdays.length && !today.events.length) h += `<div class="card muted">오늘은 생일도 축제도 없어요.</div>`;
    for (const name of today.birthdays) {
      const v = vByName.get(name);
      h += `<div class="card"><div class="event"><span class="ico">🎂</span><div><b>${esc(name)}</b> 생일이에요 — 선물 호감도 5배!
        ${v ? `<div style="margin-top:6px">${giftChips(v)}</div>` : ""}</div></div></div>`;
    }
    for (const e of today.events) h += `<div class="card"><div class="event"><span class="ico">🎉</span><div><b>${esc(e)}</b></div></div></div>`;

    const up = [];
    for (let i = 1; i <= 7; i++) {
      const o = ordOf(date.s, date.d) + i;
      const ss = Math.floor((o % 112) / 28), dd = (o % 28) + 1;
      const day = (D.calendar.days[SEASONS[ss]] || {})[dd];
      if (!day) continue;
      const bits = [...day.birthdays.map((n) => `🎂 ${link("gifts", n, esc(n), "")}`), ...day.events.map((e) => `🎉 ${esc(e)}`)];
      if (bits.length) up.push(`<li><b>${SEASONS[ss]} ${dd}일 (${dow(dd)})</b> <span class="muted">${i === 1 ? "내일" : i + "일 후"}</span> · ${bits.join(" · ")}</li>`);
    }
    if (up.length) h += `<h3>다가오는 7일</h3><div class="card"><ul class="plain upcoming">${up.join("")}</ul></div>`;

    // 이번 계절 번들
    const need = bundleItems.filter((it) => onlyNow(it) && !done.has(it.id));
    const seen = new Set();
    const needChips = need.filter((it) => !seen.has(it.label) && seen.add(it.label))
      .map((it) => link("bundles", it.bundle.name, `${esc(it.label)}`, "chip need")).join("");
    h += `<h2>📦 이번 계절에만 구할 수 있는 번들 재료</h2>`;
    h += need.length ? `<div class="card"><div class="chips">${needChips}</div><p class="small muted" style="margin:8px 0 0">번들 화면에서 체크하면 여기서 빠져요.</p></div>`
      : `<div class="card muted">이번 계절 번들 재료는 다 모았어요 👏</div>`;

    // 작물
    const crops = D.crops.list.map((c) => ({ c, r: cropReady(c) })).filter((x) => x.r);
    h += `<h2>🌱 지금 심으면? <span class="sub">(계절 끝까지 ${28 - date.d}일)</span></h2><div class="card">`;
    if (!crops.length) h += `<span class="muted">${esc(s)}에 심는 작물이 없어요.</span>`;
    else {
      crops.sort((a, b) => (b.r.ok - a.r.ok) || a.r.days - b.r.days);
      h += `<table class="t"><thead><tr><th>작물</th><th>자라는 날</th><th>판매가</th></tr></thead><tbody>${crops.map(({ c, r }) =>
        `<tr style="${r.ok ? "" : "opacity:.45"}"><td>${link("crops", c.name, esc(c.name), "")}${needMark(c.name)}</td><td>${r.days}일${r.ok ? "" : " (늦음)"}</td><td>${gold(c.sell[0])}</td></tr>`).join("")}</tbody></table>
        <p class="small muted" style="margin:0">비료·직업 없는 기준. 흐린 줄은 이번 계절 안에 못 거둬요. 📦 = 번들에 아직 필요.</p>`;
    }
    h += `</div>`;

    // 물고기
    const fish = D.fish.list.filter((f) => ["바다", "강", "산 호수"].includes(f.area) && f.seasons.includes(s) && fishWeatherOk(f, weather) && !f.sub.includes("야시장"));
    h += `<h2>🎣 오늘 잡히는 물고기</h2>${filterRow("weather", [["맑음", "☀️ 맑음"], ["비", "🌧️ 비"]], weather)}<div class="card">`;
    for (const area of ["바다", "강", "산 호수"]) {
      const list = fish.filter((f) => f.area === area);
      if (!list.length) continue;
      h += `<h3 style="margin-top:4px">${area}</h3><div class="chips">${list.map((f) =>
        link("fish", f.area + f.name, `${esc(f.name)}${needMark(f.name)}`, "chip" + (stillNeeded(f.name).length ? " need" : ""))).join("")}</div>`;
    }
    h += `</div>`;

    // 채집
    const fo = D.forage.list.filter((f) => f.group === s);
    if (fo.length) h += `<h2>🍄 ${s} 채집물</h2><div class="card"><div class="chips">${fo.map((f) =>
      link("forage", f.name, `${esc(f.name)}${needMark(f.name)}`, "chip" + (stillNeeded(f.name).length ? " need" : ""))).join("")}</div></div>`;
    return h;
  }

  // ---------------------------------------------------------------- 달력
  function pageCalendar() {
    const cs = ui.calSeason ?? season();
    const sel = ui.calDay ?? (cs === season() ? date.d : 1);
    const days = D.calendar.days[cs] || {};
    let h = `<h1>📅 달력</h1>${notesBlock(D.calendar.notes, D.calendar.video)}`;
    h += filterRow("calSeason", SEASONS.map((x) => [x, x]), cs);
    h += `<div class="card ${sClass(cs)}"><div class="cal">${DOW.map((d) => `<div class="dow">${d}</div>`).join("")}`;
    for (let d = 1; d <= 28; d++) {
      const day = days[d] || { birthdays: [], events: [] };
      const cls = [cs === season() && d === date.d ? "today" : "", d === sel ? "sel" : ""].join(" ");
      h += `<button class="${cls}" data-day="${d}"><span class="n">${d}</span>${day.birthdays.map((b) => `<span class="b">🎂${esc(b)}</span>`).join("")}${day.events.map((e) => `<span class="e">${esc(e)}</span>`).join("")}</button>`;
    }
    h += `</div></div>`;
    const day = days[sel] || { birthdays: [], events: [] };
    h += `<h2>${cs} ${sel}일 (${dow(sel)})</h2>`;
    if (!day.birthdays.length && !day.events.length) h += `<div class="card muted">일정 없음</div>`;
    for (const e of day.events) h += `<div class="card">🎉 <b>${esc(e)}</b></div>`;
    for (const n of day.birthdays) { const v = vByName.get(n); if (v) h += villagerCard(v); }
    return h;
  }

  // ---------------------------------------------------------------- 선물
  function pageGifts() {
    const f = ui.giftFilter ?? "all";
    const sort = ui.giftSort ?? "soon";
    let list = villagers.filter((v) => f === "all" || (f === "marry") === v.marry);
    if (sort === "soon") list = [...list].sort((a, b) => daysUntil(a.birthday) - daysUntil(b.birthday));
    else if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return `<h1>🎁 사랑하는 선물</h1>${notesBlock(D.villagers.notes.map((n) => n.replace("빨간색으로 표시", "빨간 칩으로 표시")), D.villagers.video)}
      ${filterRow("giftFilter", [["all", "전체"], ["marry", "💍 결혼 가능"], ["no", "그 외 주민"]], f)}
      ${filterRow("giftSort", [["soon", "생일 가까운 순"], ["name", "이름순"], ["sheet", "시트 순서"]], sort)}
      ${list.map((v) => villagerCard(v)).join("")}`;
  }

  // ---------------------------------------------------------------- 번들
  function bundleNeed(b) { return b.pick || b.items.length; }
  function bundleDone(b) { return b.items.filter((it) => done.has(b.name + "|" + it.label)).length; }

  function pageBundles() {
    const view = ui.bundleView ?? "all";
    const s = season();
    let total = 0, got = 0;
    for (const r of D.bundles.rooms) for (const b of r.bundles) { total += bundleNeed(b); got += Math.min(bundleDone(b), bundleNeed(b)); }
    let h = `<h1>📦 마을회관 번들</h1>${notesBlock(D.bundles.notes, D.bundles.video)}
      <div class="card"><b>전체 진행</b> <span class="sub">${got} / ${total}</span>
      <div class="progress"><i style="width:${(got / total * 100).toFixed(1)}%"></i></div>
      <span class="small muted">체크는 이 폰에만 저장돼요. 둘이 각자 폰에서 체크하면 따로 저장돼요.</span></div>
      ${filterRow("bundleView", [["all", "전체"], ["season", `${s}에만 구할 수 있는 것`], ["left", "안 모은 것만"]], view)}`;
    for (const room of D.bundles.rooms) {
      let rh = "";
      for (const b of room.bundles) {
        const need = bundleNeed(b), have = bundleDone(b), complete = have >= need;
        let items = b.items;
        if (view === "season") items = items.filter(onlyNow);
        if (view === "left") items = complete ? [] : items.filter((it) => !done.has(b.name + "|" + it.label));
        if (view !== "all" && !items.length) continue;
        const open = view !== "all";
        rh += `<details class="card" id="x-${esc(norm(b.name))}"${open ? " open" : ""}>
          <summary><span class="title">${esc(b.name)}</span>
            ${b.pick ? `<span class="sub">${b.items.length}개 중 ${b.pick}개</span>` : ""}
            <span class="right">${complete ? `<span class="badge">완료</span>` : `<span class="sub">${have}/${need}</span>`}</span></summary>
          <div class="body">${items.map((it) => {
            const id = b.name + "|" + it.label;
            const where = [...it.seasons.map(tag), it.cat && `<span class="sub">${esc(it.cat.replace("(?)", ""))}</span>`, it.where.length && `<span class="sub">· ${esc(it.where.join(" / "))}</span>`].filter(Boolean).join(" ");
            return `<label class="check${done.has(id) ? " done" : ""}"><input type="checkbox" data-check="${esc(id)}"${done.has(id) ? " checked" : ""}>
              <div><div class="nm">${esc(it.label)}${it.times > 1 ? ` ×${it.times}` : ""}</div><div>${where}</div></div></label>`;
          }).join("")}</div></details>`;
      }
      if (rh) h += `<h2>${esc(room.room)}</h2>${room.note ? `<p class="small muted">${esc(room.note)}</p>` : ""}${rh}`;
    }
    return h;
  }

  // ---------------------------------------------------------------- 작물
  function cropBody(c) {
    const g = c.grow, sl = c.sell;
    const row = (label, arr) => `<tr><td>${label}</td>${arr.map((x) => `<td>${x ?? "-"}</td>`).join("")}</tr>`;
    let h = `<dl class="kv"><dt>씨앗</dt><dd>${br(c.source)}</dd><dt>씨앗값</dt><dd>${typeof c.seedPrice === "number" ? gold(c.seedPrice) : br(c.seedPrice)}</dd>
      ${c.memo ? `<dt>참고</dt><dd>${esc(c.memo)}</dd>` : ""}</dl>`;
    if (c.notes.length) h += `<ul class="plain">${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    const lb = lovedBy.get(norm(c.name));
    if (lb) h += `<p class="small">💝 좋아하는 주민: ${lb.map((x) => link("gifts", x.v.name, esc(x.v.name), "")).join(", ")}</p>`;
    if (g.some((x) => typeof x === "number")) h += `<h3>자라는 날</h3><table class="t"><thead><tr><th></th><th>비료X</th><th>성장촉진</th><th>디럭스</th><th>하이퍼</th></tr></thead>
      <tbody>${row("기본", g.slice(0, 4))}${row("농업전문가", g.slice(4, 8))}</tbody></table>`;
    if (sl.some((x) => typeof x === "number")) h += `<h3>판매가</h3><table class="t"><thead><tr><th></th><th>일반</th><th>은별</th><th>금별</th><th>이리듐</th></tr></thead>
      <tbody>${row("기본", [sl[0], sl[2], sl[4], sl[6]])}${row("경작인", [sl[1], sl[3], sl[5], sl[7]])}</tbody></table>`;
    const pr = c.proc.filter((p) => p.base != null);
    if (pr.length) h += `<h3>가공하면</h3><table class="t"><thead><tr><th></th><th>기본</th><th>장인</th></tr></thead><tbody>${pr.map((p) =>
      `<tr><td>${esc((p.label || "").replace(/\n/g, " "))}</td><td>${p.base ?? "-"}</td><td>${p.artisan ?? "-"}</td></tr>`).join("")}</tbody></table>`;
    for (const p of c.proc.filter((p) => p.note)) h += `<p class="small">${br(p.note)}</p>`;
    return h;
  }

  function pageCrops(params) {
    const fs = ui.cropSeason ?? (params.focus ? "전체" : season());
    const fc = ui.cropCat ?? "전체";
    const list = D.crops.list.filter((c) => (fs === "전체" || c.seasons.includes(fs)) && (fc === "전체" || c.cat === fc));
    let h = `<h1>🌱 작물</h1>${notesBlock(D.crops.notes, D.crops.video)}
      ${filterRow("cropSeason", ["전체", ...SEASONS.slice(0, 3), "그 외"].map((x) => [x, x]), fs)}
      ${filterRow("cropCat", ["전체", "과일", "야채", "꽃", "기타"].map((x) => [x, x]), fc)}`;
    if (!list.length) h += `<div class="empty">겨울엔 밖에 심는 작물이 없어요. (겨울 씨앗모음·파우더멜론은 「그 외」/「채집」 참고)</div>`;
    for (const c of list) {
      const r = cropReady(c);
      h += `<details class="card" id="x-${esc(norm(c.name))}"${params.focus && norm(params.focus) === norm(c.name) ? " open" : ""}>
        <summary><span class="title">${esc(c.name)}${needMark(c.name)}</span> ${c.seasons.map(tag).join(" ")}
          <span class="right sub">${typeof c.grow[0] === "number" ? c.grow[0] + "일 · " : ""}${gold(c.sell[0])}</span>
          ${r ? `<span class="badge${r.ok ? "" : " warn"}">${r.ok ? "지금 심어도 OK" : "이번 계절엔 늦음"}</span>` : ""}</summary>
        <div class="body">${cropBody(c)}</div></details>`;
    }
    return h;
  }

  // ---------------------------------------------------------------- 채집
  function pageForage(params) {
    const groups = [...new Set(D.forage.list.map((f) => f.group))];
    const g = ui.forageGroup ?? (params.focus ? "전체" : season());
    const list = D.forage.list.filter((f) => g === "전체" || f.group === g);
    let h = `<h1>🍄 채집</h1>
      <details class="card" id="map"><summary><span class="title">🗺️ 펠리컨 마을 지도</span></summary><div class="body"><img class="shot" src="assets/map.webp" alt="스타듀밸리 지도: 비밀의 숲, 잉거불 수액 숲, 버스정류장, 펠리컨 마을, 산, 해변 위치" loading="lazy"></div></details>
      ${filterRow("forageGroup", ["전체", ...groups].map((x) => [x, x]), g)}`;
    for (const f of list) {
      h += `<div class="card" id="x-${esc(norm(f.name))}"><div class="daybar" style="flex-wrap:wrap"><span class="title">${esc(f.name)}${needMark(f.name)}</span>${tag(f.group)}</div>
        <div class="sub">📍 ${br(f.where)}</div>
        ${f.notes.length ? `<ul class="plain small">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`;
    }
    return h;
  }

  // ---------------------------------------------------------------- 낚시
  function pageFish(params) {
    const areas = [...new Set(D.fish.list.map((f) => f.area))];
    const fs = ui.fishSeason ?? (params.focus ? "전체" : season());
    const fw = ui.fishWeather ?? "전체";
    const fa = ui.fishArea ?? "전체";
    const list = D.fish.list.filter((f) => (fs === "전체" || f.seasons.includes(fs)) && fishWeatherOk(f, fw) && (fa === "전체" || f.area === fa));
    let h = `<h1>🎣 낚시</h1>${notesBlock(D.fish.notes, D.fish.video)}
      ${filterRow("fishSeason", ["전체", ...SEASONS].map((x) => [x, x]), fs)}
      ${filterRow("fishWeather", [["전체", "날씨 전체"], ["맑음", "☀️ 맑음"], ["비", "🌧️ 비"]], fw)}
      ${filterRow("fishArea", ["전체", ...areas].map((x) => [x, x === "전체" ? "장소 전체" : x]), fa)}
      <p class="small muted">📦 = 번들에 아직 필요. 진저섬·광산·통발·그 외 장소는 계절 상관없이 보여요.</p>`;
    if (!list.length) h += `<div class="empty">조건에 맞는 물고기가 없어요.</div>`;
    for (const f of list) {
      const all = f.seasons.length === 4;
      h += `<div class="card" id="x-${esc(norm(f.area + f.name))}">
        <div class="daybar" style="flex-wrap:wrap"><span class="title">${esc(f.name)}${needMark(f.name)}</span>
          <span class="sub">${esc(f.area)}${f.sub ? " · " + esc(f.sub) : ""}</span>
          <span class="right">${all ? `<span class="sub">모든 계절</span>` : f.seasons.map(tag).join(" ")}</span></div>
        <dl class="kv">
          ${f.time ? `<dt>시간</dt><dd>${br(f.time)}</dd>` : ""}
          ${f.weather ? `<dt>날씨</dt><dd>${br(f.weather)}</dd>` : ""}
          ${f.floor ? `<dt>층</dt><dd>${esc(f.floor)}</dd>` : ""}
        </dl>
        ${f.notes.length ? `<ul class="plain small">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`;
    }
    return h;
  }

  // ---------------------------------------------------------------- 요리
  function pageCooking(params) {
    const q = norm(ui.cookQ ?? "");
    const list = D.cooking.list.filter((r) => !q || norm(r.name).includes(q) || r.ings.some((i) => norm(i.name).includes(q)));
    let h = `<h1>🍳 요리</h1>${notesBlock(D.cooking.notes.filter((n) => !n.includes("이미지 순서")))}
      <details class="card" id="ings"><summary><span class="title">🧺 계절별로 모아둘 재료</span><span class="sub">전 요리 1번씩 만들 때</span></summary><div class="body">
      ${D.cooking.ingredients.map((g) => `<h3>${esc(g.cat)}</h3>
        ${g.all.length ? `<div class="chips">${g.all.map((x) => x.startsWith("[") ? `<b class="small" style="width:100%">${esc(x)}</b>` : `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}
        ${SEASONS.filter((s) => g.seasons[s].length).map((s) => `<div style="margin:6px 0">${tag(s)} <span class="chips" style="display:inline-flex">${g.seasons[s].map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</span></div>`).join("")}`).join("")}
      </div></details>
      <div class="search"><input type="search" data-input="cookQ" placeholder="요리 이름이나 재료로 찾기" value="${esc(ui.cookQ ?? "")}"></div>`;
    h += `<div data-list>${cookList(list, params)}</div>`;
    return h;
  }
  function cookList(list) {
    if (!list.length) return `<div class="empty">없어요.</div>`;
    return list.map((r) => `<div class="card" id="x-${esc(norm(r.name))}">
      <div class="title">${esc(r.name)}</div>
      <div class="chips" style="margin:6px 0">${r.ings.map((i) => `<span class="chip">${esc(i.name)}${i.n ? ` ×${i.n}` : ""}</span>`).join("")}</div>
      <dl class="kv"><dt>레시피</dt><dd>${r.how.map(esc).join(" ")}</dd>
      ${r.note.length ? `<dt>참고</dt><dd>${r.note.map(esc).join(" ")}</dd>` : ""}</dl></div>`).join("");
  }

  // ---------------------------------------------------------------- 제작
  function pageCrafting(params) {
    const q = norm(ui.craftQ ?? "");
    let h = `<h1>🔨 제작품</h1>${notesBlock([], D.crafting.video)}
      <details class="card" id="shots"><summary><span class="title">🖼️ 게임 제작 메뉴 화면</span></summary><div class="body">
        ${[1, 2, 3, 4, 5, 6].map((i) => `<img class="shot" src="assets/craft-${i}.webp" alt="제작 메뉴 ${i}" loading="lazy">`).join("")}</div></details>
      <div class="search"><input type="search" data-input="craftQ" placeholder="제작품 이름이나 재료로 찾기" value="${esc(ui.craftQ ?? "")}"></div>
      <div data-list>${craftList(q, params)}</div>`;
    return h;
  }
  function craftList(q, params = {}) {
    let h = "";
    for (const sec of D.crafting.sections) {
      const items = sec.items.filter((i) => !q || norm(i.name).includes(q) || norm(i.mats).includes(q) || norm(i.cond).includes(q));
      if (q && !items.length) continue;
      const hit = params.focus && items.some((i) => norm(i.name) === norm(params.focus));
      let body = "", last = null;
      for (const i of items) {
        if (i.cond && i.cond !== last) { body += `<h3>${esc(i.cond)}</h3>`; last = i.cond; }
        body += `<div class="check" style="cursor:default" id="x-${esc(norm(i.name))}"><div><div class="nm">${esc(i.name)}</div><div class="sub">${esc(i.mats)}</div></div></div>`;
      }
      if (sec.notes.length) body += `<p class="small muted">${sec.notes.map(esc).join("<br>")}</p>`;
      h += `<details class="card" id="sec-${D.crafting.sections.indexOf(sec)}"${q || hit ? " open" : ""}><summary><span class="title">${esc(sec.title.replace(/으로 배울 수 있는 제작법$/, ""))}</span><span class="right sub">${items.length}</span></summary><div class="body">${body}</div></details>`;
    }
    return h || `<div class="empty">없어요.</div>`;
  }

  // ---------------------------------------------------------------- 건물
  function pageBuildings() {
    const card = (b) => `<div class="card" id="x-${esc(norm(b.name))}"><div class="daybar"><span class="title">${esc(b.name)}${b.tier ? ` <span class="sub">${esc(b.tier)}</span>` : ""}</span><span class="right sub">⏱ ${esc(b.days)}</span></div>
      <div class="chips" style="margin:6px 0">${b.cost.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
      ${b.note.length ? `<div class="small muted">${b.note.map(esc).join(" ")}</div>` : ""}</div>`;
    return `<h1>🏡 건물 비용 · 재료</h1>${notesBlock(D.buildings.notes.filter((n) => !n.startsWith("-")), D.buildings.video)}
      <h2>로빈 (목공소)</h2>${D.buildings.robin.map(card).join("")}
      <h2>마법사의 탑 (즉시 건설)</h2>${D.buildings.wizard.map(card).join("")}`;
  }

  // ---------------------------------------------------------------- 배치·범위
  function gridHTML(rows, maxPx = 26) {
    const cols = rows[0].length;
    const avail = Math.min(window.innerWidth, 760) - 60;
    const cell = Math.max(5, Math.min(maxPx, Math.floor(avail / cols) - 1));
    return `<div class="scroll-x"><div class="grid" style="--cell:${cell}px;grid-template-columns:repeat(${cols}, var(--cell))">${rows.map((r) =>
      [...r].map((ch) => `<i class="${ch === "." ? "" : ch}"></i>`).join("")).join("")}</div></div>`;
  }
  const legend = (pairs) => `<div class="legend">${pairs.map(([cls, label]) => `<span><i class="${cls}"></i>${label}</span>`).join("")}</div>`;

  function pageRanges() {
    const R = D.ranges;
    let h = `<h1>📐 배치 · 범위</h1>`;
    h += `<h2>💧 스프링클러 · 주니모 오두막</h2>${notesBlock(R.sprinkler.notes, R.sprinkler.video)}`;
    for (const it of R.sprinkler.items) h += `<div class="card"><div class="title">${esc(it.title)}</div>${legend(it.title.includes("주니모") ? [["H", "주니모 오두막"], ["S", "이리듐 스프링클러"], ["r", "범위"]] : [["S", "스프링클러"], ["r", "물 주는 칸"]])}${gridHTML(it.grid)}</div>`;
    h += `<h2>🧑‍🌾 허수아비</h2>${notesBlock(R.scarecrow.notes)}`;
    for (const it of R.scarecrow.items) h += `<div class="card"><div class="title">${esc(it.title)}</div>${it.memo ? `<p class="small muted" style="margin:4px 0">${esc(it.memo)}</p>` : ""}${legend([["C", "허수아비"], ["r", "지켜주는 칸"]])}${gridHTML(it.grid)}</div>`;
    h += `<h2>🐝 양봉장 배치 예시</h2>${notesBlock(R.bee.notes, R.bee.video)}
      <div class="card">${legend([["B", "양봉장"], ["F", "꽃"], ["S", "스프링클러"], ["C", "허수아비"]])}${gridHTML(R.bee.grid, 22)}
      <ul class="plain small">${R.bee.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
    return h;
  }

  // ---------------------------------------------------------------- 기초
  const PC_ONLY = /PC버전|모드나 리텍/;
  function pageBasics() {
    return `<h1>📖 뉴비 기초</h1>
      <div class="card"><ul class="plain">${D.basics.tips.filter((t) => !t.includes("뉴비 집중") && !PC_ONLY.test(t)).map((t) => `<li style="margin:6px 0">${esc(t)}</li>`).join("")}</ul></div>
      <p class="small muted">PC·모드 관련 팁은 스위치에선 해당이 없어서 뺐어요. 원작자: <a href="${esc(D.author.url)}" target="_blank" rel="noopener">유튜브 에글이</a> · <a href="${esc(D.source)}" target="_blank" rel="noopener">원본 구글 시트</a></p>
      <h2>이 폰에 저장된 것</h2>
      <div class="card small">게임 날짜·번들 체크는 이 브라우저에만 저장돼요.<br><button class="btn" data-act="reset" style="margin-top:8px">번들 체크 전부 지우기</button></div>`;
  }

  // ---------------------------------------------------------------- 통합 검색
  let searchIndex = null;
  function buildIndex() {
    const idx = [];
    const add = (kind, name, sub, href, extra = "") => idx.push({ kind, name, sub, href, n: norm(name), x: norm(extra) });
    for (const c of D.crops.list) add("작물", c.name, c.seasons.join("·") + " · " + c.source.replace(/\n/g, " "), `#/crops?focus=${encodeURIComponent(c.name)}`, c.notes.join(" "));
    for (const f of D.fish.list) add("물고기", f.name, [f.area, f.sub, f.seasons.length === 4 ? "모든 계절" : f.seasons.join("·"), f.time.replace(/\n/g, " ")].filter(Boolean).join(" · "), `#/fish?focus=${encodeURIComponent(f.area + f.name)}`, f.notes.join(" "));
    for (const f of D.forage.list) add("채집", f.name, f.group + " · " + f.where, `#/forage?focus=${encodeURIComponent(f.name)}`, f.notes.join(" "));
    for (const r of D.cooking.list) add("요리", r.name, r.ings.map((i) => i.name).join(", "), `#/cooking?focus=${encodeURIComponent(r.name)}`, r.ings.map((i) => i.name).join(" "));
    for (const s of D.crafting.sections) for (const i of s.items) add("제작", i.name, i.mats, `#/crafting?focus=${encodeURIComponent(i.name)}`, i.mats);
    for (const v of villagers) add("주민", v.name, v.birthday ? `${v.birthday.season} ${v.birthday.day}일 생일` : "", `#/gifts?focus=${encodeURIComponent(v.name)}`);
    for (const [k, arr] of lovedBy) add("선물", arr[0].v.gifts.find((g) => norm(g.name) === k).name, "좋아하는 주민: " + arr.map((x) => x.v.name).join(", "), `#/gifts?focus=${encodeURIComponent(arr[0].v.name)}`);
    for (const it of bundleItems) add("번들", it.label, it.bundle.name + (done.has(it.id) ? " · ✅ 모음" : ""), `#/bundles?focus=${encodeURIComponent(it.bundle.name)}`);
    for (const b of [...D.buildings.robin, ...D.buildings.wizard]) add("건물", b.name + (b.tier ? " " + b.tier : ""), b.cost.join(", "), `#/buildings?focus=${encodeURIComponent(b.name)}`);
    return idx;
  }
  function renderSearch(q) {
    searchIndex = searchIndex || buildIndex();
    const nq = norm(q);
    const hits = searchIndex.map((e) => ({ e, score: e.n === nq ? 3 : e.n.includes(nq) ? 2 : e.x.includes(nq) ? 1 : 0 }))
      .filter((h) => h.score).sort((a, b) => b.score - a.score);
    setActiveTab(null);
    if (!hits.length) return void (app.innerHTML = `<div class="empty">「${esc(q)}」 검색 결과가 없어요. 띄어쓰기 없이도 찾아져요.</div>`);
    const kinds = [...new Set(hits.map((h) => h.e.kind))];
    app.innerHTML = `<h1>「${esc(q)}」</h1>` + kinds.map((k) => {
      const list = hits.filter((h) => h.e.kind === k).slice(0, 30);
      return `<h2>${esc(k)} <span class="sub">${list.length}</span></h2>` + list.map(({ e, score }) =>
        `<a class="card hit" href="${e.href}"><span class="kind">${esc(e.kind)}${score === 1 ? " · 재료/메모에 포함" : ""}</span><div class="title">${esc(e.name)}</div><div class="sub">${esc(e.sub)}</div></a>`).join("");
    }).join("");
  }

  // ---------------------------------------------------------------- 라우터
  const PAGES = [
    ["", "🏠 홈", pageHome], ["calendar", "📅 달력", pageCalendar], ["gifts", "🎁 선물", pageGifts],
    ["bundles", "📦 번들", pageBundles], ["crops", "🌱 작물", pageCrops], ["fish", "🎣 낚시", pageFish],
    ["forage", "🍄 채집", pageForage], ["cooking", "🍳 요리", pageCooking], ["crafting", "🔨 제작", pageCrafting],
    ["buildings", "🏡 건물", pageBuildings], ["ranges", "📐 배치", pageRanges], ["basics", "📖 기초", pageBasics],
  ];
  const app = $("#app");
  const tabs = $("#tabs");
  tabs.innerHTML = PAGES.map(([id, label]) => `<a href="#/${id}" data-tab="${id}">${label}</a>`).join("");

  function route() {
    const m = location.hash.replace(/^#\/?/, "").split("?");
    const params = Object.fromEntries(new URLSearchParams(m[1] || ""));
    return { id: m[0] || "", params };
  }
  function setActiveTab(id) {
    for (const a of $$("a", tabs)) a.classList.toggle("on", a.dataset.tab === id);
    const on = $("a.on", tabs);
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  let lastId = null;
  function render(keepScroll) {
    const { id, params } = route();
    const page = PAGES.find((p) => p[0] === id) || PAGES[0];
    if (page[0] !== lastId) for (const k of Object.keys(ui)) delete ui[k];
    const y = window.scrollY;
    // 필터를 누르거나 체크할 때 다시 그려도, 펼쳐 둔 카드는 그대로 펼쳐 둔다
    const openIds = keepScroll ? $$("details[open]", app).map((d) => d.id).filter(Boolean) : [];
    app.innerHTML = page[2](params);
    for (const oid of openIds) { const d = document.getElementById(oid); if (d) d.open = true; }
    setActiveTab(page[0]);
    $("#datePill").textContent = `${SEASONS[date.s]} ${date.d}일 ▾`;
    if (params.focus && page[0] !== lastId) {
      const el = document.getElementById("x-" + norm(params.focus));
      if (el) {
        if (el.tagName === "DETAILS") el.open = true;
        el.classList.add("focus");
        requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
      }
    } else if (keepScroll) window.scrollTo(0, y);
    else if (page[0] !== lastId) window.scrollTo(0, 0);
    lastId = page[0];
  }

  // ---------------------------------------------------------------- 이벤트
  window.addEventListener("hashchange", () => { $("#q").value = ""; lastId = null; render(); });
  tabs.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a || !$("#q").value) return;
    $("#q").value = "";
    // 검색 결과를 보다가 지금 화면의 탭을 누르면 hashchange 가 안 생기므로 직접 다시 그린다
    if (a.getAttribute("href") === (location.hash || "#/")) { e.preventDefault(); lastId = null; render(); }
  });

  app.addEventListener("click", (e) => {
    const f = e.target.closest("[data-f]");
    if (f) {
      const key = f.dataset.f, v = f.dataset.v;
      if (key === "weather") { weather = v; store.set("weather", v); }
      else ui[key] = v;
      if (key === "calSeason") delete ui.calDay;
      render(true);
      return;
    }
    const day = e.target.closest("[data-day]");
    if (day) { ui.calDay = +day.dataset.day; render(true); return; }
    const act = e.target.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "next") shiftDate(1);
      if (a === "prev") shiftDate(-1);
      if (a === "pick") return openDate();
      if (a === "reset" && confirm("번들 체크를 전부 지울까요?")) { done.clear(); store.set("bundles", []); searchIndex = null; }
      render(true);
    }
  });
  app.addEventListener("change", (e) => {
    const c = e.target.closest("[data-check]");
    if (!c) return;
    const id = c.dataset.check;
    if (c.checked) done.add(id); else done.delete(id);
    store.set("bundles", [...done]);
    searchIndex = null;
    render(true);
  });
  app.addEventListener("input", (e) => {
    const inp = e.target.closest("[data-input]");
    if (!inp) return;
    ui[inp.dataset.input] = inp.value;
    const box = $("[data-list]", app);
    const { params } = route();
    if (inp.dataset.input === "cookQ") {
      const q = norm(inp.value);
      box.innerHTML = cookList(D.cooking.list.filter((r) => !q || norm(r.name).includes(q) || r.ings.some((i) => norm(i.name).includes(q))), params);
    } else if (inp.dataset.input === "craftQ") box.innerHTML = craftList(norm(inp.value));
  });

  let tmr;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(tmr);
    const v = e.target.value.trim();
    tmr = setTimeout(() => (v ? (renderSearch(v), window.scrollTo(0, 0)) : render()), 150);
  });
  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); $("#q").blur(); });

  // ---------------------------------------------------------------- 날짜 고르기
  const dlg = $("#dateDlg");
  let draft;
  function drawDate() {
    dlg.innerHTML = `<div class="title">게임 날짜</div>
      <div class="year"><button class="btn" data-y="-1">−</button><b>${draft.y}년차</b><button class="btn" data-y="1">+</button></div>
      <div class="seg">${SEASONS.map((s, i) => `<button class="${i === draft.s ? "on" : ""}" data-s="${i}">${s}</button>`).join("")}</div>
      <div class="days">${DOW.map((d) => `<div class="dow small muted" style="text-align:center">${d}</div>`).join("")}${Array.from({ length: 28 }, (_, i) => `<button class="${i + 1 === draft.d ? "on" : ""}" data-d="${i + 1}">${i + 1}</button>`).join("")}</div>
      <div class="dlg-foot"><button class="btn" data-x="cancel">취소</button><button class="btn primary" data-x="ok">이 날짜로</button></div>`;
  }
  function openDate() {
    draft = { ...date };
    drawDate();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  dlg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
      return;
    }
    if (!b) return;
    if (b.dataset.y) draft.y = Math.max(1, draft.y + +b.dataset.y);
    if (b.dataset.s) draft.s = +b.dataset.s;
    if (b.dataset.d) draft.d = +b.dataset.d;
    if (b.dataset.x === "cancel") return dlg.close();
    if (b.dataset.x === "ok") { date = draft; store.set("date", date); dlg.close(); lastId = null; render(); return; }
    drawDate();
  });
  $("#datePill").addEventListener("click", openDate);

  $("#srcLink").href = D.source;
  $("#authorLink").href = D.author.url;
  render();
})();
