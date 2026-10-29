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
  // 멀티 농장이 둘이라 날짜·날씨·번들 체크는 농장마다 따로 저장한다
  // 농장 목록은 홈에서 더하고(최대 5개) 고칠 수 있다. 처음엔 둘로 시작한다.
  const MAX_FARMS = 5;
  const DEFAULT_FARMS = [
    { id: "mareapu", name: "MAREAPU 농장", who: "gihoon · cojee" },
    { id: "mar", name: "마르농장", who: "호스트 cojee" },
  ];
  let FARMS = store.get("farms", DEFAULT_FARMS);
  if (!Array.isArray(FARMS) || !FARMS.length) FARMS = DEFAULT_FARMS;
  let farm = store.get("farm", FARMS[0].id);
  if (!FARMS.some((f) => f.id === farm)) farm = FARMS[0].id;
  const fk = (k) => farm + "." + k;
  const curFarm = () => FARMS.find((f) => f.id === farm);
  // 농장을 나누기 전에 저장한 것은 MAREAPU 농장 것으로 옮긴다
  if (store.get("mareapu.date", null) == null && store.get("date", null) != null) {
    store.set("mareapu.date", store.get("date"));
    store.set("mareapu.weather", store.get("weather", "맑음"));
    store.set("mareapu.bundles", store.get("bundles", []));
  }
  let date, weather;
  const done = new Set();
  function loadFarm() {
    date = store.get(fk("date"), { y: 1, s: 0, d: 1 });
    weather = store.get(fk("weather"), "맑음");
    done.clear();
    for (const id of store.get(fk("bundles"), [])) done.add(id);
  }
  loadFarm();

  // ---------------------------------------------------------------- 둘이 같이 보기 (Firebase)
  // assets/firebase-config.js 에 설정이 있으면 농장마다 stardew/{농장} 문서 하나를 같이 쓴다.
  // 없거나 연결이 안 되면 지금처럼 이 폰에만 저장한다. 로컬 저장은 늘 같이 해 둔다(오프라인 대비).
  let db = null, unsub = null, syncState = window.SDV_FIREBASE ? "connecting" : "local";
  const farmRef = () => db.collection("stardew").doc(farm);
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  function remote(fields) {
    if (!db) return;
    farmRef().set({ ...fields, updatedAt: stamp() }, { merge: true }).catch((e) => { console.warn(e); setSync("error"); });
  }
  function saveDate() { store.set(fk("date"), date); remote({ date }); }
  function saveWeather() { store.set(fk("weather"), weather); remote({ weather }); }
  function saveBundle(id, on) {
    store.set(fk("bundles"), [...done]);
    if (!db) return;
    // 둘이 동시에 다른 칸을 체크해도 덮어쓰지 않게 배열 전체가 아니라 한 칸씩 더하고 뺀다
    const F = firebase.firestore.FieldValue;
    remote({ bundles: on ? F.arrayUnion(id) : F.arrayRemove(id) });
  }
  function setSync(st) {
    syncState = st;
    for (const el of $$(".syncNote")) el.outerHTML = syncNote();
  }
  function syncNote() {
    const t = {
      local: "📱 이 폰에만 저장돼요",
      connecting: "☁️ 연결하는 중…",
      live: "☁️ 둘이 같이 보는 중 · 체크와 날짜가 바로 공유돼요",
      error: "⚠️ 클라우드에 연결이 안 돼서 이 폰에만 저장 중이에요",
    }[syncState];
    return `<div class="syncNote small muted">${t}</div>`;
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement("script");
      el.src = src; el.onload = res; el.onerror = rej;
      document.head.appendChild(el);
    });
  }
  async function startSync() {
    const cfg = window.SDV_FIREBASE;
    if (!cfg) return;
    try {
      const base = "https://www.gstatic.com/firebasejs/10.12.2/";
      await loadScript(base + "firebase-app-compat.js");
      await Promise.all([loadScript(base + "firebase-auth-compat.js"), loadScript(base + "firebase-firestore-compat.js")]);
      const fb = firebase.initializeApp(cfg, "stardew");
      await fb.auth().signInAnonymously();
      db = fb.firestore();
      watchFarms();
      watchFarm();
    } catch (e) { console.warn("firebase", e); setSync("error"); }
  }
  // 농장 목록도 둘이 같이 쓴다 (stardew/_farms 문서)
  function pushFarms() {
    if (!db) return;
    db.collection("stardew").doc("_farms").set({ list: FARMS, updatedAt: stamp() }, { merge: true }).catch((e) => console.warn(e));
  }
  function watchFarms() {
    db.collection("stardew").doc("_farms").onSnapshot((snap) => {
      const d = snap.data();
      if (!d || !Array.isArray(d.list) || !d.list.length) { pushFarms(); return; }
      if (JSON.stringify(d.list) === JSON.stringify(FARMS)) return;
      FARMS = d.list;
      store.set("farms", FARMS);
      if (!FARMS.some((f) => f.id === farm)) switchFarm(FARMS[0].id);
      showFarm();
      if (!$("#q").value && !$("#dateDlg").open && !$("#farmDlg").open) render(true);
    }, (e) => console.warn(e));
  }

  function watchFarm() {
    if (!db) return;
    if (unsub) unsub();
    const id = farm;
    unsub = farmRef().onSnapshot((snap) => {
      if (id !== farm) return;
      const d = snap.data();
      // 처음 여는 농장이면 이 폰에 있던 것을 올린다
      if (!d) { remote({ date, weather, bundles: [...done] }); setSync("live"); return; }
      const before = JSON.stringify([date, weather, [...done].sort()]);
      if (d.date) date = d.date;
      if (d.weather) weather = d.weather;
      done.clear();
      for (const b of d.bundles || []) done.add(b);
      store.set(fk("date"), date); store.set(fk("weather"), weather); store.set(fk("bundles"), [...done]);
      setSync("live");
      if (before === JSON.stringify([date, weather, [...done].sort()])) return;
      searchIndex = null;
      // 검색 중이거나 날짜 창이 열려 있을 땐 화면을 갈아엎지 않는다
      if (!$("#q").value && !$("#dateDlg").open) render(true);
      $("#datePill").textContent = `${SEASONS[date.s]} ${date.d}일 ▾`;
    }, (e) => { console.warn(e); setSync("error"); });
  }
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
    saveDate();
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
  // 아이템 아이콘 (tools/fetch_items.py). 「나무 300개」「미끼 * 5」처럼 꼬리가 붙어 있어도 찾는다.
  const IT = window.SDV_ITEMS || {};
  function itemSrc(name) {
    const n = String(name || "");
    const bare = n.replace(/\s*\(.*?\)$/, "").replace(/\s*[*×]\s*\d+$/, "").replace(/\s*(금별\s*)?[\d,]+개$/, "").replace(/\s*\(\d+\)$/, "");
    return IT[norm(n)] || IT[norm(bare)] || (window.SDV_STAGES && SDV_STAGES[n] && SDV_STAGES[n].icon) || null;
  }
  const ii = (name, h = 20) => { const src = itemSrc(name); return src ? `<img class="px ii" src="${esc(src)}" alt="" style="height:${h}px" loading="lazy">` : ""; };

  const giftChips = (v) => `<div class="chips">${v.gifts.map((g) =>
    `<span class="chip${g.rec ? " rec" : ""}">${ii(g.name)}${esc(g.name)}${g.memo ? ` <span class="muted small">${esc(g.memo)}</span>` : ""}</span>`).join("")}</div>`;
  const link = (page, focus, label, cls = "chip") => `<a class="${cls}" href="#/${page}?focus=${encodeURIComponent(focus)}">${label}</a>`;
  const daysUntil = (b) => (ordOf(SEASONS.indexOf(b.season), b.day) - ordOf(date.s, date.d) + 112) % 112;

  const PT = window.SDV_PORTRAITS || {};
  const face = (name, h) => (PT[name] ? `<img class="face" src="${esc(PT[name])}" alt="${esc(name)}" style="width:${h}px;height:${h}px" loading="lazy">` : "");

  // 선물 취향 단계 (위키). 호감도 점수는 게임 기준이고, 생일엔 8배가 된다.
  const GF = window.SDV_GIFTS || {};
  const LV = [
    ["love", "💖", "사랑함", "+80"],
    ["like", "💛", "좋아함", "+45"],
    ["dislike", "👎", "싫어함", "−20"],
    ["hate", "💢", "혐오함", "−40"],
  ];
  function levelChips(v, lv, mark) {
    const g = (GF[v.name] || {})[lv] || { items: [], notes: [] };
    let items = g.items.map((i) => ({ name: i.name, img: i.img, rec: false }));
    if (lv === "love") {
      // 시트의 사랑 목록(빨간 = 구하기 쉬움)을 앞에 두고, 위키에만 있는 것을 뒤에 붙인다
      const seen = new Set(v.gifts.map((x) => norm(x.name)));
      items = [...v.gifts.map((x) => ({ name: x.name, memo: x.memo, rec: x.rec })), ...items.filter((i) => !seen.has(norm(i.name)))];
    }
    if (!items.length && !g.notes.length) return "";
    return `<div class="lvrow lv-${lv}">${items.map((i) =>
      `<span class="chip${i.rec ? " rec" : ""}"><span class="lvm">${mark}</span>${i.img ? `<img class="px ii" src="${esc(i.img)}" alt="" style="height:20px" loading="lazy">` : ii(i.name)}${esc(i.name)}${i.memo ? ` <span class="muted small">${esc(i.memo)}</span>` : ""}</span>`).join("")}
      ${g.notes.length ? `<span class="small muted lvnote">${mark} ${g.notes.map(esc).join(" · ")}</span>` : ""}</div>`;
  }
  function giftLevels(v) {
    const [love, like, dis, hate] = LV.map(([lv, mark]) => levelChips(v, lv, mark));
    const bad = dis + hate;
    return `${love}${like}${bad ? `<details class="bad"><summary class="small">👎 주면 안 되는 것</summary>${hate}${dis}</details>` : ""}`;
  }

  function villagerCard(v, open) {
    const b = v.birthday;
    const left = b ? daysUntil(b) : null;
    const when = left === 0 ? `<span class="badge warn">오늘 생일!</span>` : left != null && left <= 7 ? `<span class="badge">${left}일 후</span>` : "";
    return `<div class="card person" id="x-${esc(norm(v.name))}">
      ${face(v.name, 64)}
      <div style="min-width:0;flex:1">
        <div class="daybar" style="gap:8px;flex-wrap:wrap">
          <span class="title">${esc(v.name)}</span>
          ${b ? `${tag(b.season)} <span class="sub">${b.day}일 생일</span>` : ""}
          ${v.marry ? `<span class="sub">💍 결혼 가능</span>` : ""}
          <span class="right">${when}</span>
        </div>
        ${open !== false ? `<div style="margin-top:6px">${giftLevels(v)}</div>` : ""}
      </div>
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

  // 오늘 심고 g일 자라면 언제 첫 수확인가. 중간에 이 작물 계절이 아닌 계절로 넘어가면 시든다(ok=false).
  // 「그 외」 작물(고대과일·파인애플 등)은 온실·섬에서 키우는 걸로 보고 계절을 따지지 않는다.
  function harvestOf(c, g) {
    if (typeof g !== "number") return null;
    const day = date.d + g;
    const si = date.s + Math.floor((day - 1) / 28);
    const dd = ((day - 1) % 28) + 1;
    const ok = c.seasons.includes("그 외") || (si < 4 && SEASONS.slice(date.s, si + 1).every((x) => c.seasons.includes(x)));
    return { ok, text: `${SEASONS[si % 4]} ${dd}일`, day };
  }
  function regrowOf(c) {
    for (const n of c.notes) {
      const m = n.match(/(\d+)일마다 수확/);
      if (m) return +m[1];
      if (/^매일 수확/.test(n)) return 1;
    }
    return null;
  }
  // 오늘부터 이 작물 계절이 이어지는 마지막 날 (이번 계절 1일을 1로 센 날수)
  function seasonEndDay(c) {
    let k = 1;
    for (let i = date.s + 1; i < 4 && c.seasons.includes(SEASONS[i]); i++) k++;
    return k * 28;
  }
  function plantNow(c) {
    const today = `${season()} ${date.d}일`;
    if (!c.seasons.includes(season()) && !c.seasons.includes("그 외"))
      return `<div class="plant"><b>📅 오늘(${today}) 심으면?</b><p class="small muted" style="margin:4px 0 0">${esc(c.seasons.join("·"))} 작물이라 지금은 밖에 못 심어요.</p></div>`;
    const labels = ["비료 없이", "성장촉진", "디럭스", "하이퍼"];
    const cell = (g) => {
      const h = harvestOf(c, g);
      if (!h) return "<td>-</td>";
      return h.ok ? `<td><b>${h.text}</b> <span class="muted">(${g}일)</span></td>` : `<td class="muted">✕ 시듦 (${g}일)</td>`;
    };
    let h = `<div class="plant"><b>📅 오늘(${today}) 심으면 첫 수확</b>
      <table class="t"><thead><tr><th></th><th>기본</th><th>농업전문가</th></tr></thead><tbody>
      ${labels.map((l, i) => `<tr><td>${l}</td>${cell(c.grow[i])}${cell(c.grow[i + 4])}</tr>`).join("")}</tbody></table>`;
    const first = harvestOf(c, c.grow[0]);
    const re = regrowOf(c);
    if (re && first && first.ok && !c.seasons.includes("그 외")) {
      const more = Math.floor((seasonEndDay(c) - first.day) / re);
      h += `<p class="small" style="margin:0">🔁 그 뒤로 ${re === 1 ? "매일" : re + "일마다"} 또 열려요 → 비료 없이 심으면 계절 끝까지 <b>${more}번</b> 더 수확</p>`;
    }
    if (c.seasons.includes("그 외")) h += `<p class="small muted" style="margin:0">온실·진저섬·실내 기준이에요.</p>`;
    return h + `</div>`;
  }

  // ---------------------------------------------------------------- 성장 단계 그림 (위키에서 받은 도트)
  const ST = window.SDV_STAGES || {};
  const px = (src, h, alt = "") => src ? `<img class="px" src="${esc(src)}" alt="${esc(alt)}" style="height:${h}px" loading="lazy">` : "";
  const cropIcon = (name, h = 24) => px(ST[name] && ST[name].icon, h);
  // 심고 t 일째에 보이는 단계 그림. 비료 등으로 g 가 짧아지면 단계 길이를 같은 비율로 줄여서 고른다.
  function stageImg(name, t, g) {
    const st = ST[name];
    if (!st) return null;
    const stages = st.stages.filter((x) => x.kind === "stage" && x.days);
    const base = stages.reduce((a, x) => a + x.days, 0);
    if (!base) return null;
    const scaled = (t * base) / g;
    let cum = 0;
    for (const x of stages) { cum += x.days; if (scaled < cum) return x.img; }
    return stages[stages.length - 1].img;
  }
  const regrowImg = (name) => { const st = ST[name]; const r = st && st.stages.find((x) => x.kind === "regrow"); return r ? r.img : null; };
  function stageStrip(c) {
    const st = ST[c.name];
    if (!st) return "";
    return `<div class="plant"><b>🌱 성장 단계</b> <span class="small muted">비료 없이</span><div class="strip">${st.stages.map((x) =>
      `<div>${px(x.img, 48)}<span>${x.kind === "harvest" ? "수확" : x.kind === "regrow" ? "다시 열림" : esc(String(x.days ?? ""))+"일"}</span></div>`).join("")}</div>
      <p class="small muted" style="margin:4px 0 0">${st.stages.filter((x) => x.kind !== "stage").map((x) => esc(x.label.replace("Total:", "총").replace("Regrowth:", "재수확").replace(/Days?/, "일"))).join(" · ")}</p></div>`;
  }

  // 계절 달력 위에 심기·자라는 날·수확일을 칠한다. interactive 면 날짜 칸이 「그날 심기」 버튼이 된다.
  function drawCal(c, { si, span, p, g, re, hv, interactive, seasons = span }) {
    const hset = new Set(hv);
    const nm = esc(c.name);
    let h = "";
    for (let k = 0; k < Math.min(span, seasons); k++) {
      const sn = SEASONS[si + k];
      const days = D.calendar.days[sn] || {};
      h += `${span > 1 || interactive ? `<div class="fcal-title">${tag(sn)}</div>` : ""}<div class="fcal${interactive ? "" : " mini"}">${DOW.map((d) => `<div class="dow">${d}</div>`).join("")}`;
      for (let d = 1; d <= 28; d++) {
        const abs = k * 28 + d;
        let cls = "", ico = "";
        // 그림이 있으면 그날 단계의 도트를, 없으면 이모지를 쓴다
        const sp = (src, fb) => (src ? px(src, interactive ? 26 : 22) : fb);
        if (abs === p) { cls = "pl"; ico = sp(stageImg(c.name, 0, g), "🫘"); }
        else if (hset.has(abs)) { cls = "hv"; ico = sp(ST[c.name] && ST[c.name].icon, "🧺"); }
        else if (hv.length && abs > p && abs < hv[0]) { cls = "gr"; ico = sp(stageImg(c.name, abs - p, g), "🌱"); }
        else if (hv.length && abs > hv[0] && abs < hv[hv.length - 1]) {
          cls = re ? "rg" : "gr";
          ico = re ? sp(regrowImg(c.name) || stageImg(c.name, g - 1, g), "🌿") : sp(stageImg(c.name, (abs - p) % g, g), "🌱");
        }
        const ev = interactive && days[d] && days[d].events[0] || "";
        const today = sn === season() && d === date.d ? " today" : "";
        const inner = `<span class="n">${d}</span><span class="ico">${ico}</span>${ev ? `<span class="ev">${esc(ev)}</span>` : ""}`;
        h += interactive
          ? `<button class="${cls}${today}" data-fc="${nm}" data-k="day" data-s="${sn}" data-v="${d}">${inner}</button>`
          : `<div class="cell ${cls}${today}">${inner}</div>`;
      }
      h += `</div>`;
    }
    return h;
  }
  // 심는 날 p(이번 계절 1일=1) 부터 계절 끝 end 까지의 수확일들
  function harvestDays(c, g, p, end) {
    const re = regrowOf(c);
    // 계속 열리는 작물은 re 일마다, 한 번 열리는 작물은 거둔 날 바로 다시 심는다고 보고 g 일마다
    const step = re || g;
    const out = [];
    for (let d = p + g; d <= end; d += step) out.push(d);
    return out;
  }
  const spanOf = (c, si) => { let n = 1; for (let i = si + 1; i < 4 && c.seasons.includes(SEASONS[i]); i++) n++; return n; };

  // 농사 달력: 심는 날을 고르면 자라는 날·수확일을 계절 달력 위에 칠한다.
  // 날짜를 누르면 그날 심는 걸로 바뀐다. 다계절 작물은 이어지는 계절 달력까지 그린다.
  function farmCal(c) {
    if (c.seasons.includes("그 외")) return "";
    const st = ((ui.fc ||= {})[c.name] ||= {});
    const own = SEASONS.filter((x) => c.seasons.includes(x));
    const ps = st.season ?? (own.includes(season()) ? season() : own[0]);
    const fert = st.fert ?? 0, pro = !!st.pro;
    const g = c.grow[fert + (pro ? 4 : 0)];
    if (typeof g !== "number") return "";
    const si = SEASONS.indexOf(ps);
    const span = spanOf(c, si);
    const end = span * 28;
    const re = regrowOf(c);
    const harvests = (pd) => harvestDays(c, g, pd, end);
    const p = st.plant ?? (ps === season() ? date.d : 1);
    const hv = harvests(p);
    const nm = esc(c.name);

    // 며칠에 심으면 몇 번 거두나 — 같은 횟수끼리 묶어서 "1~4일 3번" 처럼
    const counts = Array.from({ length: 28 }, (_, i) => harvests(i + 1).length);
    const groups = [];
    counts.forEach((n, i) => {
      const last = groups[groups.length - 1];
      if (last && last.n === n) last.to = i + 1; else groups.push({ n, from: i + 1, to: i + 1 });
    });
    const sum = groups.map((x) => `<span class="${x.n ? "" : "muted"}">${ps} ${x.from}${x.to > x.from ? "~" + x.to : ""}일 → ${x.n ? `<b>${x.n}번</b>` : "못 거둠"}</span>`).join("<br>");

    let h = `<div class="plant"><b>📆 농사 달력</b> <span class="small muted">날짜를 누르면 그날 심는 걸로 바뀌어요</span>`;
    if (own.length > 1) h += `<div class="filters" style="margin:6px 0 0;padding:0">${own.map((x) => `<button class="f${x === ps ? " on" : ""}" data-fc="${nm}" data-k="season" data-v="${x}">${x}에 심기</button>`).join("")}</div>`;
    h += `<div class="filters" style="margin:6px 0 0;padding:0;flex-wrap:wrap">${["비료X", "성장촉진", "디럭스", "하이퍼"].map((l, i) => `<button class="f${i === fert ? " on" : ""}" data-fc="${nm}" data-k="fert" data-v="${i}">${l}</button>`).join("")}
      <button class="f${pro ? " on" : ""}" data-fc="${nm}" data-k="pro">농업전문가</button></div>`;
    h += drawCal(c, { si, span, p, g, re, hv, interactive: true });
    h += `<p class="small" style="margin:8px 0 4px">🫘 <b>${ps} ${p}일</b> 심기 → ${hv.length ? `🧺 첫 수확 <b>${SEASONS[si + Math.floor((hv[0] - 1) / 28)]} ${((hv[0] - 1) % 28) + 1}일</b>, 계절 끝까지 <b>${hv.length}번</b> 수확${re ? "" : " <span class=\"muted\">(거둔 날 다시 심는 기준)</span>"}` : `<span class="muted">계절 안에 못 거둬요</span>`}</p>
      <details class="fsum"><summary class="small">며칠에 심으면 몇 번 거둘까?</summary><p class="small" style="margin:4px 0 0">${sum}</p></details>`;
    if (c.seasons.includes("봄") && c.source.includes("축제")) h += `<p class="small muted" style="margin:4px 0 0">씨앗은 축제에서 사요. 축제날은 끝나고 와서 심기!</p>`;
    return h + `</div>`;
  }

  function pageHome() {
    const s = season();
    const today = (D.calendar.days[s] || {})[date.d] || { birthdays: [], events: [] };
    let h = `<div class="card today">
      <div class="filters" style="margin:0 0 2px;padding:0;flex-wrap:wrap">${FARMS.map((f) =>
        `<button class="f${f.id === farm ? " on" : ""}" data-farm="${esc(f.id)}">${esc(f.name)}</button>`).join("")}
        ${FARMS.length < MAX_FARMS ? `<button class="f" data-act="farm-add">＋ 농장</button>` : ""}
        <button class="f" data-act="farm-edit" aria-label="이 농장 이름 바꾸기">✏️</button></div>
      <div class="motto">🌾 ${esc(curFarm().name)} 번성하라!</div>
      ${syncNote()}
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
      h += `<div class="card"><div class="event"><span class="ico">${face(name, 56) || "🎂"}</span><div><b>${esc(name)}</b> 생일이에요 — 선물 효과 8배!
        ${v ? `<div style="margin-top:6px">${giftChips(v)}</div>` : ""}</div></div></div>`;
    }
    for (const e of today.events) h += `<div class="card"><div class="event"><span class="ico">🎉</span><div><b>${esc(e)}</b></div></div></div>`;

    const up = [];
    for (let i = 1; i <= 7; i++) {
      const o = ordOf(date.s, date.d) + i;
      const ss = Math.floor((o % 112) / 28), dd = (o % 28) + 1;
      const day = (D.calendar.days[SEASONS[ss]] || {})[dd];
      if (!day) continue;
      const bits = [...day.birthdays.map((n) => `${face(n, 22) || "🎂"} ${link("gifts", n, esc(n), "")}`), ...day.events.map((e) => `🎉 ${esc(e)}`)];
      if (bits.length) up.push(`<li><b>${SEASONS[ss]} ${dd}일 (${dow(dd)})</b> <span class="muted">${i === 1 ? "내일" : i + "일 후"}</span> · ${bits.join(" · ")}</li>`);
    }
    if (up.length) h += `<h3>다가오는 7일</h3><div class="card"><ul class="plain upcoming">${up.join("")}</ul></div>`;

    // 이번 계절 번들
    const need = bundleItems.filter((it) => onlyNow(it) && !done.has(it.id));
    const seen = new Set();
    const needChips = need.filter((it) => !seen.has(it.label) && seen.add(it.label))
      .map((it) => link("bundles", it.bundle.name, `${ii(it.label)}${esc(it.label)}`, "chip need")).join("");
    h += `<h2>📦 이번 계절에만 구할 수 있는 번들 재료</h2>`;
    h += need.length ? `<div class="card"><div class="chips">${needChips}</div><p class="small muted" style="margin:8px 0 0">번들 화면에서 체크하면 여기서 빠져요.</p></div>`
      : `<div class="card muted">이번 계절 번들 재료는 다 모았어요 👏</div>`;

    // 작물
    const crops = D.crops.list.map((c) => ({ c, r: cropReady(c) })).filter((x) => x.r);
    h += `<h2>🌱 지금 심으면? <span class="sub">(계절 끝까지 ${28 - date.d}일)</span></h2><div class="card">`;
    if (!crops.length) h += `<span class="muted">${esc(s)}에 심는 작물이 없어요.</span>`;
    else {
      crops.sort((a, b) => (b.r.ok - a.r.ok) || a.r.days - b.r.days);
      h += `<table class="t"><thead><tr><th>작물</th><th>자라는 날</th><th>첫 수확</th><th>판매가</th></tr></thead><tbody>${crops.map(({ c, r }) =>
        `<tr style="${r.ok ? "" : "opacity:.45"}"><td>${cropIcon(c.name, 18)} ${link("crops", c.name, esc(c.name), "")}${needMark(c.name)}${regrowOf(c) ? " 🔁" : ""}</td><td>${r.days}일</td><td>${r.ok ? harvestOf(c, r.days).text : "✕ 시듦"}</td><td>${gold(c.sell[0])}</td></tr>`).join("")}</tbody></table>
        <p class="small muted" style="margin:0">비료·직업 없는 기준. 흐린 줄은 계절이 바뀌어 시들어요. 🔁 = 한 번 심으면 계속 열림, 📦 = 번들에 아직 필요. 작물을 누르면 비료별 수확일이 나와요.</p>`;
    }
    h += `</div>`;

    // 물고기
    const fish = D.fish.list.filter((f) => ["바다", "강", "산 호수"].includes(f.area) && f.seasons.includes(s) && fishWeatherOk(f, weather) && !f.sub.includes("야시장"));
    h += `<h2>🎣 오늘 잡히는 물고기</h2>${filterRow("weather", [["맑음", "☀️ 맑음"], ["비", "🌧️ 비"]], weather)}<div class="card">`;
    for (const area of ["바다", "강", "산 호수"]) {
      const list = fish.filter((f) => f.area === area);
      if (!list.length) continue;
      h += `<h3 style="margin-top:4px">${area}</h3><div class="chips">${list.map((f) =>
        link("fish", f.area + f.name, `${ii(f.name)}${esc(f.name)}${needMark(f.name)}`, "chip" + (stillNeeded(f.name).length ? " need" : ""))).join("")}</div>`;
    }
    h += `<p class="small muted" style="margin:8px 0 0">테두리·📦 = 번들에 아직 내야 해요. 잡으면 하나는 남겨두기! (번들 탭에서 체크하면 빠져요)</p></div>`;

    // 채집
    const fo = D.forage.list.filter((f) => f.group === s);
    if (fo.length) h += `<h2>🍄 ${s} 채집물</h2><div class="card"><div class="chips">${fo.map((f) =>
      link("forage", f.name, `${ii(f.name)}${esc(f.name)}${needMark(f.name)}`, "chip" + (stillNeeded(f.name).length ? " need" : ""))).join("")}</div>
      <p class="small muted" style="margin:8px 0 0">테두리·📦 = 번들에 아직 내야 해요.</p></div>`;
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
      h += `<button class="${cls}" data-day="${d}"><span class="n">${d}</span>${day.birthdays.map((b) => `<span class="b">${face(b, 22) || "🎂"}${esc(b)}</span>`).join("")}${day.events.map((e) => `<span class="e">${esc(e)}</span>`).join("")}</button>`;
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
      <div class="card small">${LV.map(([, mark, label, pt]) => `${mark} ${label} <b>${pt}</b>`).join(" · ")}<br><span class="muted">호감도 점수 · 생일엔 8배 · 빨간 칩은 구하기 쉬운 추천 선물</span></div>
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
      <span class="small muted">🌾 ${esc(curFarm().name)} 체크리스트 · 농장은 홈에서 바꿔요.</span>${syncNote()}</div>
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
            <span class="right">${complete ? `<span class="badge">완료</span>` : `<span class="sub">${have}/${need}</span>`}</span>
            <span class="slots">${b.items.map((it) => {
              // 게임의 번들 칸처럼: 낸 것은 진하게, 아직은 흐리게
              const got = done.has(b.name + "|" + it.label);
              const src = itemSrc(it.label);
              return `<span class="slot${got ? " got" : ""}" title="${esc(it.label)}">${src ? `<img class="px" src="${esc(src)}" alt="${esc(it.label)}">` : it.cat === "골드" ? "🪙" : "❔"}</span>`;
            }).join("")}</span></summary>
          <div class="body">${items.map((it) => {
            const id = b.name + "|" + it.label;
            const where = [...it.seasons.map(tag), it.cat && `<span class="sub">${esc(it.cat.replace("(?)", ""))}</span>`, it.where.length && `<span class="sub">· ${esc(it.where.join(" / "))}</span>`].filter(Boolean).join(" ");
            return `<label class="check${done.has(id) ? " done" : ""}"><input type="checkbox" data-check="${esc(id)}"${done.has(id) ? " checked" : ""}>
              <span class="bigslot">${ii(it.label, 44) || (it.cat === "골드" ? "🪙" : "")}</span><div><div class="nm">${esc(it.label)}${it.times > 1 ? ` ×${it.times}` : ""}</div><div>${where}</div></div></label>`;
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
    let h = plantNow(c) + stageStrip(c) + farmCal(c) + `<dl class="kv"><dt>씨앗</dt><dd>${br(c.source)}</dd><dt>씨앗값</dt><dd>${typeof c.seedPrice === "number" ? gold(c.seedPrice) : br(c.seedPrice)}</dd>
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
        <summary>${cropIcon(c.name, 28)}<span class="title">${esc(c.name)}${needMark(c.name)}</span> ${c.seasons.map(tag).join(" ")}
          <span class="right sub">${typeof c.grow[0] === "number" ? c.grow[0] + "일 · " : ""}${gold(c.sell[0])}</span>
          ${r ? `<span class="badge${r.ok ? "" : " warn"}">${r.ok ? "지금 심어도 OK" : "이번 계절엔 늦음"}</span>` : ""}</summary>
        <div class="body">${cropBody(c)}</div></details>`;
    }
    return h;
  }

  // ---------------------------------------------------------------- 성장달력 (계절별로 모든 작물을 한 화면에)
  // 한 번 거둘 때 여러 개 나오는 작물 (위키 기준). 나머지는 1개로 센다.
  const YIELD = { 블루베리: 3, 크랜베리: 2 };
  // 씨앗값. 「600~1000」 처럼 범위면 비싼 쪽으로 잡는다. 「X」(상점에서 안 팜)면 null.
  function seedCost(c) {
    const nums = (String(c.seedPrice ?? "").match(/[\d,]+/g) || []).map((x) => +x.replace(/,/g, "")).filter(Boolean);
    return nums.length ? Math.max(...nums.slice(0, 2)) : null;
  }
  // 밭 한 칸에 p일부터 심어 계절(다계절이면 이어지는 계절) 끝까지 남는 돈. 기본 품질·직업 없음·가공 안 함.
  function profitOf(c, g, p, si) {
    if (c.name === "커피콩") return null; // 씨앗이 곧 수확물이라 이 식으로는 안 맞는다
    const seed = seedCost(c);
    if (seed == null || typeof c.sell[0] !== "number") return null;
    const re = regrowOf(c);
    const hv = harvestDays(c, g, p, spanOf(c, si) * 28);
    if (!hv.length) return { profit: -seed, n: 0 };
    return { profit: hv.length * (YIELD[c.name] || 1) * c.sell[0] - seed * (re ? 1 : hv.length), n: hv.length };
  }

  const money = (n) => `<b class="${n >= 0 ? "gold" : "loss"}">${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("ko-KR")}g</b>`;

  function recoCard(gs, p, fert, si, list) {
    const ranked = list.map((c) => ({ c, r: profitOf(c, c.grow[fert], p, si) })).filter((x) => x.r && x.r.n)
      .sort((a, b) => b.r.profit - a.r.profit);
    const top = ranked.slice(0, 5);
    const need = list.filter((c) => stillNeeded(c.name).length);
    const bdays = villagers.filter((v) => v.birthday && v.birthday.season === gs)
      .map((v) => ({ v, crops: v.gifts.filter((g) => list.some((c) => norm(c.name) === norm(g.name))) }))
      .filter((x) => x.crops.length);
    const memos = list.flatMap((c) => c.notes.filter((n) => /BEST/.test(n)).map((n) => ({ c, n })));
    let h = `<div class="card reco"><div class="title">💡 ${gs} 추천 <span class="sub">1년차 참고용</span></div>`;
    if (top.length) h += `<h3>💰 돈 되는 작물 <span class="sub">밭 한 칸에 ${gs} ${p}일부터 심으면 남는 돈</span></h3>
      <ol class="rank">${top.map(({ c, r }) => `<li>${cropIcon(c.name, 22)} ${link("crops", c.name, esc(c.name), "")} ${money(r.profit)} <span class="sub">${r.n}번 수확${spanOf(c, si) > 1 ? ` · ${c.seasons.filter((x) => SEASONS.indexOf(x) >= si).join("·")}` : ""}</span></li>`).join("")}</ol>`;
    if (need.length) h += `<h3>📦 번들에 아직 필요</h3><div class="chips">${need.map((c) => link("bundles", stillNeeded(c.name)[0].bundle.name, `${cropIcon(c.name, 18)}${esc(c.name)}`, "chip need")).join("")}</div>`;
    if (bdays.length) h += `<h3>🎂 ${gs} 생일 선물로 키우기</h3><ul class="plain small">${bdays.map(({ v, crops }) =>
      `<li>${face(v.name, 20)} <b>${esc(v.name)}</b> <span class="muted">${v.birthday.day}일</span> ← ${crops.map((g) => `${ii(g.name, 16)}${esc(g.name)}`).join(", ")}</li>`).join("")}</ul>`;
    if (memos.length) h += `<h3>📝 원작자 메모</h3><ul class="plain small">${memos.map(({ c, n }) => `<li><b>${esc(c.name)}</b> — ${esc(n)}</li>`).join("")}</ul>`;
    h += `<p class="small muted" style="margin:8px 0 0">기본 품질·직업 없음·가공 안 함·비료값 제외로 계산했어요. 씨앗을 상점에서 안 파는 작물과 커피콩은 순위에서 빠져요.</p></div>`;
    return { html: h, top3: new Set(top.slice(0, 3).map((x) => x.c.name)) };
  }

  function pageGrowCal() {
    const gs = ui.gcSeason ?? (season() === "겨울" ? "봄" : season());
    const from = ui.gcFrom ?? "1";
    const fert = +(ui.gcFert ?? 0);
    const p = from === "today" && gs === season() ? date.d : 1;
    const si = SEASONS.indexOf(gs);
    let h = `<h1>📆 작물 성장 달력</h1>
      <p class="small muted" style="margin:0 0 6px">${gs} ${p}일에 심고, 한 번 열리는 작물은 거둔 날 바로 다시 심는 기준이에요. 작물을 누르면 날짜를 골라 볼 수 있어요.</p>
      ${filterRow("gcSeason", SEASONS.slice(0, 3).map((x) => [x, x]), gs)}
      ${filterRow("gcFrom", [["1", `${gs} 1일에 심기`], ...(gs === season() ? [["today", `오늘(${date.d}일) 심기`]] : [])], gs === season() ? from : "1")}
      ${filterRow("gcFert", ["비료X", "성장촉진", "디럭스", "하이퍼"].map((l, i) => [i, l]), fert)}`;
    const list = D.crops.list.filter((c) => c.seasons.includes(gs) && typeof c.grow[fert] === "number");
    const reco = recoCard(gs, p, fert, si, list);
    h += reco.html;
    for (const c of list) {
      const g = c.grow[fert];
      const span = spanOf(c, si);
      const hv = harvestDays(c, g, p, span * 28);
      const inThis = hv.filter((d) => d <= 28).length;
      const pr = profitOf(c, g, p, si);
      h += `<a class="card gc hit" href="#/crops?focus=${encodeURIComponent(c.name)}">
        <div class="daybar" style="gap:6px;flex-wrap:wrap">${cropIcon(c.name, 26)}<span class="title">${reco.top3.has(c.name) ? "🏆 " : ""}${esc(c.name)}${needMark(c.name)}</span>
          <span class="right sub">${g}일${regrowOf(c) ? ` · 🔁${regrowOf(c)}일` : ""} · <b>${gs}에 ${inThis}번</b>${span > 1 ? ` <span class="muted">(+다음 계절)</span>` : ""}${pr && pr.n ? ` · ${money(pr.profit)}` : ""}</span></div>
        ${drawCal(c, { si, span, p, g, re: regrowOf(c), hv, interactive: false, seasons: 1 })}</a>`;
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
      h += `<div class="card" id="x-${esc(norm(f.name))}"><div class="daybar" style="flex-wrap:wrap">${ii(f.name, 32)}<span class="title">${esc(f.name)}${needMark(f.name)}</span>${tag(f.group)}</div>
        <div class="sub">📍 ${br(f.where)}</div>
        ${f.notes.length ? `<ul class="plain small">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`;
    }
    return h;
  }

  // ---------------------------------------------------------------- 낚시
  // 물고기 난이도 (위키, 0~110). 낚시 미니게임에서 물고기가 얼마나 날뛰는지.
  const FI = window.SDV_FISH || {};
  const fishInfo = (f) => FI[norm(f.name)] || null;
  function diffTier(n) {
    if (n <= 40) return ["쉬움", "easy"];
    if (n <= 70) return ["보통", "mid"];
    if (n <= 89) return ["어려움", "hard"];
    return ["매우 어려움", "vhard"];
  }
  function diffBar(fi) {
    if (!fi || fi.difficulty == null) return "";
    const [label, cls] = diffTier(fi.difficulty);
    return `<div class="diff ${cls}"><span class="dlabel">난이도 <b>${fi.difficulty}</b> · ${label}</span>
      <span class="dbar"><i style="width:${Math.min(100, (fi.difficulty / 110) * 100).toFixed(0)}%"></i></span>
      ${fi.move ? `<span class="sub">움직임: ${esc(fi.move)}</span>` : ""}</div>`;
  }

  function pageFish(params) {
    const areas = [...new Set(D.fish.list.map((f) => f.area))];
    const fs = ui.fishSeason ?? (params.focus ? "전체" : season());
    const fw = ui.fishWeather ?? "전체";
    const fa = ui.fishArea ?? "전체";
    const fo = ui.fishSort ?? "sheet";
    let list = D.fish.list.filter((f) => (fs === "전체" || f.seasons.includes(fs)) && fishWeatherOk(f, fw) && (fa === "전체" || f.area === fa));
    const dv = (f) => (fishInfo(f) && fishInfo(f).difficulty != null ? fishInfo(f).difficulty : 999);
    if (fo === "easy") list = [...list].sort((a, b) => dv(a) - dv(b));
    if (fo === "hard") list = [...list].sort((a, b) => (dv(b) % 999) - (dv(a) % 999));
    let h = `<h1>🎣 낚시</h1>${notesBlock(D.fish.notes, D.fish.video)}
      ${filterRow("fishSeason", ["전체", ...SEASONS].map((x) => [x, x]), fs)}
      ${filterRow("fishWeather", [["전체", "날씨 전체"], ["맑음", "☀️ 맑음"], ["비", "🌧️ 비"]], fw)}
      ${filterRow("fishArea", ["전체", ...areas].map((x) => [x, x === "전체" ? "장소 전체" : x]), fa)}
      ${filterRow("fishSort", [["sheet", "시트 순서"], ["easy", "쉬운 순"], ["hard", "어려운 순"]], fo)}
      <p class="small muted">📦 = 번들에 아직 필요. 진저섬·광산·통발·그 외 장소는 계절 상관없이 보여요.</p>`;
    if (!list.length) h += `<div class="empty">조건에 맞는 물고기가 없어요.</div>`;
    for (const f of list) {
      const all = f.seasons.length === 4;
      h += `<div class="card" id="x-${esc(norm(f.area + f.name))}">
        <div class="fishhead"><span class="bigslot">${ii(f.name, 44)}</span>
          <div style="min-width:0;flex:1"><div class="daybar" style="flex-wrap:wrap"><span class="title">${esc(f.name)}${needMark(f.name)}</span>
          <span class="right">${all ? `<span class="sub">모든 계절</span>` : f.seasons.map(tag).join(" ")}</span></div>
          <div class="sub">${esc(f.area)}${f.sub ? " · " + esc(f.sub) : ""}${fishInfo(f) && fishInfo(f).price ? ` · 💰 ${fishInfo(f).price}g` : ""}</div>
          ${diffBar(fishInfo(f))}</div></div>
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
  // 요리 버프 (위키). 능력별로 골라 보고, 고르면 수치 높은 순으로 줄 세운다.
  const BF = window.SDV_BUFFS || {};
  const STAT_ICON = { 농사: "🌾", 채집: "🍄", 낚시: "🎣", 채광: "⛏️", 공격력: "⚔️", 방어력: "🛡️", 속도: "👟", 행운: "🍀", "최대 기력": "⚡", 자력: "🧲", 면역: "💊" };
  const STAT_ORDER = ["농사", "채집", "낚시", "채광", "공격력", "방어력", "속도", "행운", "최대 기력", "자력"];
  const buffOf = (r) => BF[norm(r.name)];
  function cookFiltered() {
    const q = norm(ui.cookQ ?? "");
    const st = ui.cookBuff ?? "전체";
    let list = D.cooking.list.filter((r) => !q || norm(r.name).includes(q) || r.ings.some((i) => norm(i.name).includes(q)));
    if (st !== "전체") {
      const val = (r) => ((buffOf(r) || { buffs: [] }).buffs.find((b) => b.stat === st) || {}).val || 0;
      list = list.filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a));
    }
    return list;
  }

  function pageCooking(params) {
    const list = cookFiltered();
    let h = `<h1>🍳 요리</h1>${notesBlock(D.cooking.notes.filter((n) => !n.includes("이미지 순서")))}
      <details class="card" id="ings"><summary><span class="title">🧺 계절별로 모아둘 재료</span><span class="sub">전 요리 1번씩 만들 때</span></summary><div class="body">
      ${D.cooking.ingredients.map((g) => `<h3>${esc(g.cat)}</h3>
        ${g.all.length ? `<div class="chips">${g.all.map((x) => x.startsWith("[") ? `<b class="small" style="width:100%">${esc(x)}</b>` : `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}
        ${SEASONS.filter((s) => g.seasons[s].length).map((s) => `<div style="margin:6px 0">${tag(s)} <span class="chips" style="display:inline-flex">${g.seasons[s].map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</span></div>`).join("")}`).join("")}
      </div></details>
      <h3 style="margin-bottom:0">💪 먹으면 오르는 능력으로 찾기</h3>
      ${filterRow("cookBuff", ["전체", ...STAT_ORDER].map((x) => [x, x === "전체" ? "전체" : `${STAT_ICON[x]} ${x}`]), ui.cookBuff ?? "전체")}
      <div class="search"><input type="search" data-input="cookQ" placeholder="요리 이름이나 재료로 찾기" value="${esc(ui.cookQ ?? "")}"></div>`;
    h += `<div data-list>${cookList(list, params)}</div>`;
    return h;
  }
  function cookList(list) {
    if (!list.length) return `<div class="empty">없어요.</div>`;
    return list.map((r) => `<div class="card" id="x-${esc(norm(r.name))}">
      <div class="daybar">${ii(r.name, 32)}<span class="title">${esc(r.name)}</span>
        ${buffOf(r) && buffOf(r).energy != null ? `<span class="right sub">⚡${buffOf(r).energy} ❤️${buffOf(r).health}</span>` : ""}</div>
      ${buffOf(r) && buffOf(r).buffs.length ? `<div class="chips buffs">${buffOf(r).buffs.map((b) => `<span class="chip buff">${STAT_ICON[b.stat] || "✨"} ${esc(b.stat)} <b>${b.val > 0 ? "+" : ""}${b.val}</b></span>`).join("")}${buffOf(r).dur ? `<span class="sub">⏱ ${esc(buffOf(r).dur)}</span>` : ""}</div>` : ""}
      <div class="chips" style="margin:6px 0">${r.ings.map((i) => `<span class="chip">${ii(i.name)}${esc(i.name)}${i.n ? ` ×${i.n}` : ""}</span>`).join("")}</div>
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
        body += `<div class="check" style="cursor:default" id="x-${esc(norm(i.name))}">${ii(i.name, 32) || `<span class="ii-empty"></span>`}<div><div class="nm">${esc(i.name)}</div><div class="sub">${esc(i.mats)}</div></div></div>`;
      }
      if (sec.notes.length) body += `<p class="small muted">${sec.notes.map(esc).join("<br>")}</p>`;
      h += `<details class="card" id="sec-${D.crafting.sections.indexOf(sec)}"${q || hit ? " open" : ""}><summary><span class="title">${esc(sec.title.replace(/으로 배울 수 있는 제작법$/, ""))}</span><span class="right sub">${items.length}</span></summary><div class="body">${body}</div></details>`;
    }
    return h || `<div class="empty">없어요.</div>`;
  }

  // ---------------------------------------------------------------- 건물
  function pageBuildings() {
    const card = (b) => `<div class="card" id="x-${esc(norm(b.name))}"><div class="daybar"><span class="title">${esc(b.name)}${b.tier ? ` <span class="sub">${esc(b.tier)}</span>` : ""}</span><span class="right sub">⏱ ${esc(b.days)}</span></div>
      <div class="chips" style="margin:6px 0">${b.cost.map((c) => `<span class="chip">${ii(c)}${esc(c)}</span>`).join("")}</div>
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
      <div class="card"><ul class="plain">${D.basics.tips.filter((t) => !t.includes("뉴비 집중") && !PC_ONLY.test(t)).map((t) => `<li style="margin:6px 0">${esc(t)}${t.includes("황금호두") ? `<br><a href="${esc(D.author.url)}/search?query=${encodeURIComponent("황금호두")}" target="_blank" rel="noopener">▶ 에글이 채널에서 황금호두 영상 찾기</a>` : ""}</li>`).join("")}</ul></div>
      <p class="small muted">PC·모드 관련 팁은 스위치에선 해당이 없어서 뺐어요. 원작자: <a href="${esc(D.author.url)}" target="_blank" rel="noopener">유튜브 에글이</a> · <a href="${esc(D.source)}" target="_blank" rel="noopener">원본 구글 시트</a></p>
      <h2>이 폰에 저장된 것</h2>
      <div class="card small">게임 날짜·번들 체크는 농장마다 따로 저장돼요.<br><button class="btn" data-act="reset" style="margin-top:8px">${esc(curFarm().name)} 번들 체크 지우기</button></div>`;
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
    // 아이템 하나를 누가 얼마나 좋아하는지 (시트 사랑 목록 + 위키 단계)
    const byItem = new Map();
    const put = (name, v, lv) => {
      const k = norm(name);
      if (!byItem.has(k)) byItem.set(k, { name, who: {} });
      const w = byItem.get(k).who;
      if (!w[v.name]) w[v.name] = lv;
    };
    for (const v of villagers) {
      for (const g of v.gifts) put(g.name, v, "love");
      for (const [lv] of LV) for (const i of ((GF[v.name] || {})[lv] || { items: [] }).items) put(i.name, v, lv);
    }
    for (const { name, who } of byItem.values()) {
      const sub = LV.map(([lv, mark]) => { const ns = Object.keys(who).filter((n) => who[n] === lv); return ns.length ? `${mark} ${ns.join(", ")}` : ""; }).filter(Boolean).join("  ");
      const first = Object.keys(who)[0];
      add("선물", name, sub, `#/gifts?focus=${encodeURIComponent(first)}`);
    }
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
        `<a class="card hit" href="${e.href}"><span class="kind">${esc(e.kind)}${score === 1 ? " · 재료/메모에 포함" : ""}</span><div class="daybar">${ii(e.name, 28) || (e.kind === "주민" ? face(e.name, 28) : "")}<span class="title">${esc(e.name)}</span></div><div class="sub">${esc(e.sub)}</div></a>`).join("");
    }).join("");
  }

  // ---------------------------------------------------------------- 라우터
  const PAGES = [
    ["", "🏠 홈", pageHome], ["calendar", "📅 달력", pageCalendar], ["gifts", "🎁 선물", pageGifts],
    ["bundles", "📦 번들", pageBundles], ["crops", "🌱 작물", pageCrops], ["growcal", "📆 성장달력", pageGrowCal], ["fish", "🎣 낚시", pageFish],
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
    const fb = e.target.closest("[data-farm]");
    if (fb) { switchFarm(fb.dataset.farm); render(true); return; }
    const fcb = e.target.closest("[data-fc]");
    if (fcb) {
      const st = ((ui.fc ||= {})[fcb.dataset.fc] ||= {});
      const k = fcb.dataset.k, v = fcb.dataset.v;
      if (k === "pro") st.pro = !st.pro;
      else if (k === "fert") st.fert = +v;
      else if (k === "season") { st.season = v; delete st.plant; }
      else if (k === "day") {
        // 다계절 작물 달력의 뒤쪽 계절 날짜를 누르면 그 계절에 심는 걸로 본다
        if (v && fcb.dataset.s !== (st.season ?? fcb.dataset.s)) st.season = fcb.dataset.s;
        st.season = fcb.dataset.s; st.plant = +v;
      }
      render(true);
      return;
    }
    const f = e.target.closest("[data-f]");
    if (f) {
      const key = f.dataset.f, v = f.dataset.v;
      if (key === "weather") { weather = v; saveWeather(); }
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
      if (a === "farm-add") return openFarm(null);
      if (a === "farm-edit") return openFarm(curFarm());
      if (a === "reset" && confirm(`${curFarm().name}의 번들 체크를 전부 지울까요?`)) { done.clear(); store.set(fk("bundles"), []); remote({ bundles: [] }); searchIndex = null; }
      render(true);
    }
  });
  app.addEventListener("change", (e) => {
    const c = e.target.closest("[data-check]");
    if (!c) return;
    const id = c.dataset.check;
    if (c.checked) done.add(id); else done.delete(id);
    saveBundle(id, c.checked);
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
      box.innerHTML = cookList(cookFiltered(), params);
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
    if (b.dataset.x === "ok") { date = draft; saveDate(); dlg.close(); lastId = null; render(); return; }
    drawDate();
  });
  $("#datePill").addEventListener("click", openDate);

  function switchFarm(id) {
    farm = id;
    store.set("farm", farm);
    loadFarm();
    watchFarm();
    searchIndex = null;
    showFarm();
  }

  // ---------------------------------------------------------------- 농장 더하기·고치기
  const fdlg = document.createElement("dialog");
  fdlg.id = "farmDlg";
  document.body.appendChild(fdlg);
  let fdraft = null, fdelete = false;
  function openFarm(f) {
    fdraft = f ? { ...f } : { id: "", name: "", who: "" };
    fdelete = false;
    drawFarm();
    if (fdlg.showModal) fdlg.showModal(); else fdlg.setAttribute("open", "");
    setTimeout(() => { const i = $("#farmName"); if (i && !f) i.focus(); }, 50);
  }
  function drawFarm() {
    const editing = !!fdraft.id;
    fdlg.innerHTML = `<form id="farmForm" method="dialog">
      <div class="title">${editing ? "농장 고치기" : "농장 더하기"} <span class="sub">${editing ? "" : `(${FARMS.length}/${MAX_FARMS})`}</span></div>
      <label class="fld">농장 이름<input id="farmName" maxlength="20" required value="${esc(fdraft.name)}" placeholder="예: 별빛농장"></label>
      <label class="fld">같이 하는 사람<input id="farmWho" maxlength="30" value="${esc(fdraft.who)}" placeholder="예: gihoon · cojee"></label>
      ${editing && FARMS.length > 1 ? (fdelete
        ? `<p class="small" style="color:var(--rec);margin:8px 0">이 농장의 날짜·번들 체크도 같이 지워져요. 정말 지울까요?</p>
           <button type="button" class="btn" data-fx="del-yes" style="color:var(--rec)">네, 지울게요</button>`
        : `<button type="button" class="btn" data-fx="del" style="margin-top:8px">🗑 이 농장 지우기</button>`) : ""}
      <div class="dlg-foot"><button type="button" class="btn" data-fx="cancel">취소</button><button class="btn primary" type="submit">저장</button></div>
    </form>`;
  }
  fdlg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fx]");
    if (!b) return;
    const k = b.dataset.fx;
    if (k === "cancel") return fdlg.close();
    if (k === "del") { fdraft.name = $("#farmName").value; fdraft.who = $("#farmWho").value; fdelete = true; return drawFarm(); }
    if (k === "del-yes") {
      FARMS = FARMS.filter((f) => f.id !== fdraft.id);
      for (const key of ["date", "weather", "bundles"]) { try { localStorage.removeItem(`sdv.${fdraft.id}.${key}`); } catch (err) { /* 무시 */ } }
      store.set("farms", FARMS); pushFarms();
      if (farm === fdraft.id) switchFarm(FARMS[0].id); else showFarm();
      fdlg.close(); render(true);
    }
  });
  fdlg.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#farmName").value.trim();
    if (!name) return;
    const who = $("#farmWho").value.trim();
    if (fdraft.id) {
      FARMS = FARMS.map((f) => (f.id === fdraft.id ? { ...f, name, who } : f));
    } else {
      if (FARMS.length >= MAX_FARMS) return fdlg.close();
      fdraft.id = "f" + Date.now().toString(36);
      FARMS = [...FARMS, { id: fdraft.id, name, who }];
    }
    store.set("farms", FARMS); pushFarms();
    switchFarm(fdraft.id);
    fdlg.close(); render(true);
  });

  function showFarm() {
    const f = curFarm();
    $("#brandName").textContent = f.name;
    $("#brandWho").textContent = f.who;
    document.title = f.name + " 번성하라";
  }
  showFarm();
  startSync();
  $("#srcLink").href = D.source;
  $("#authorLink").href = D.author.url;
  render();
})();
