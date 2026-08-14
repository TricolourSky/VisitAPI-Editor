/* ══════════════════════════════════════════════════════════════════
   商人货架编辑器（SEC.05）—— 左「货架预览」／右「参数」
   跑在 index.html 的内联脚本之后，直接用它的全局：
   T / TF / api / $ / esc / place / hide / ask / say / confirm2 / secNo / render / page / lang / TOK。

   两种写法都认（Tech Leader 2026-08-10 拍板"两个都可以"）：
     <db>\assort.json                     一个模组一个商人
     <db>\CustomAssortSchemes\*.json      WTT 通用约定，一份文件多个商人

   ── 左边那面墙是"玩家在商人那儿看到的样子"，版式 1:1 照搬塔科夫原生 ──
     ① 页签条（交易/任务/服务）② 商人条 ③ 工具条（商品展览/刷新商店/密度）④ 货架墙
     瓦片**按物品真实占格铺**（服务端算好的 w/h，含武器的 ExtraSize*），
     左上角价格 · 右下角数量（无限＝「大量」）· 左下角忠诚等级色块，**不显示名字**——原生就没有。
   ⚠️ **配色一律走 AIC 中性黑**。中间试过一版原生的棕橄榄，Tech Leader 看过后要求改回来，
      别当成漏改又改回去。（Memory 第 5 节：照搬原生的版式，配色改中性黑。）

   这一页最要紧的一件事：**容器类商品必须连里面的东西一起写**。
   只写弹药盒不写弹，玩家买到手就是 0/20 的空盒，而服务端从头到尾一个错都不报。
   ══════════════════════════════════════════════════════════════════ */

let AD = null;          /* /api/assort 的整包 */
let acur = null;        /* 当前货架的键："文件名" 或 "文件名#商人" */
let asel = null;        /* 墙上选中的那件商品（右边参数栏调的就是它） */
let aBase = "";         /* 整包快照，判"脏"跟它比 */
let aWas = {};          /* **每份文件各自的快照**：保存时只送真改过的那几份 */
let aLoading = false;
let ATPL = {};          /* tpl → 容器信息（/api/assort/tpl），按需拉 */
let aOnly = "";         /* 只看某个忠诚等级；空 = 全部 */
let aAvBad = {};        /* 商人 id → true 表示"这个商人没有头像图"，别每次重画都再去要一次 404 */

/* 墙的尺寸：**一排 10 格 × 12 排，两个都是定死的**，不跟窗口走。
   10 格是 Tech Leader 一开始就定的；12 排是他数出来的（非全屏时我们只有 11 排，游戏内是 12）。
   ⚠️ 中间试过一版"列数按宽度铺满"，在他那块屏上铺成了一排 23 格，当场被打回来 ——
      **别再改成自适应**。格宽是这两个数算出来的结果，不是输入。
   两个都定死 → 「一排几个」的密度开关（Ⅰ/Ⅱ/Ⅲ）自然就没有存在意义了。 */
const ACOLS = 10;
const AROWS = 12;
const ARULE = 18;       /* 行列标尺那两条的厚度，和 assort.css 里的 .aswrap2 网格轨道对齐 */

const RUB = "5449016a4bdc2d6f028b456f",
      USD = "5696686a4bdc2da3298b456a",
      EUR = "569668774bdc2da2298b4568";
/* ⚠️ 文案键写死，别拿 tpl 的前几位去拼 —— 美元 5696686a… 和欧元 569668774… **前四位一模一样**，
   `"a_cur_"+tpl.slice(0,4)` 两个货币会撞成同一个键，界面上两颗按钮显示同一个名字。 */
const CURS = [[RUB, "₽", "a_cur_rub"], [USD, "$", "a_cur_usd"], [EUR, "€", "a_cur_eur"]];

const asnap = () => JSON.stringify(AD?.files ?? null);
const adirty = () => AD != null && asnap() !== aBase;
const akey = s => s.file + (s.kind === "wtt" ? "#" + s.trader : "");
/* 记一次"现在这份是干净的"：整包快照 + 每份文件各自的快照 */
function aMark() {
  aBase = asnap(); aWas = {};
  for (const [k, v] of Object.entries(AD?.files || {})) aWas[k] = JSON.stringify(v);
}
const aChanged = () => Object.fromEntries(
  Object.entries(AD?.files || {}).filter(([k, v]) => JSON.stringify(v) !== aWas[k]));

function asLoad() {
  if (aLoading) return;
  aLoading = true;
  /* 两个回调分开写，别 .then(…).catch(…) —— 那样渲染里抛的错会被当成"读取失败" */
  api("/api/assort").then(
    d => {
      AD = d;
      if (d.ok) {
        const keys = (d.schemes || []).map(akey);
        if (!acur || !keys.includes(acur)) acur = keys[0] || null;
        aMark();
      }
    },
    e => { AD = { ok: false, error: String(e.message || e) }; }
  ).then(() => {
    aLoading = false; aFetchTpls();
    if (page === "assort") render();
    if (modNeedPick(AD)) modPick(AD);
  });
}

/* 当前货架对象（直接指向 AD.files 里那一份，改它就是改模型） */
function aScheme() {
  if (!acur || !AD?.files) return null;
  const [file, trader] = acur.split("#");
  const root = AD.files[file];
  if (!root) return null;
  return trader ? root[trader] : root;
}
const aRefOf = () => (AD?.schemes || []).find(s => akey(s) === acur) || {};

/* ── 物品展示信息 ──
   服务端把货架上用到的那几十个 tpl 的名字/占格/分类图标一起送来了（AD.tpls）。
   新加的商品还不在里面，就退回 4288 件那张表（QITEMS，物品选择器打开时拉的那份，
   和任务页共用一份，别再各存一份）拿名字、占格按 1×1 画。 */
const aTpl = tpl => (AD?.tpls || []).find(x => x.id === tpl);
function aName(tpl) {
  const t = aTpl(tpl);
  if (t) return (lang === "zh" ? t.zh : t.en) || t.en || tpl;
  const it = (QITEMS?.items || []).find(x => x.id === tpl);
  return it ? (lang === "zh" ? it.zh : it.en) || it.en || tpl : tpl;
}
const aSize = tpl => { const t = aTpl(tpl); return [t?.w || 1, t?.h || 1]; };
/* 是不是"买了必须带货"的容器。服务端那份先用，没有再看按需拉回来的 /api/assort/tpl */
const aIsBox = tpl => aTpl(tpl)?.box ?? (ATPL[tpl]?.stack?.length > 0);
const aIcon = n => "/hbimg?name=" + encodeURIComponent(n) + "&t=" + encodeURIComponent(TOK);
const aAvatar = id => "/avimg?id=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(TOK);

const aRoots = sc => (sc.items || []).filter(i => i.slotId === "hideout");
const aKids = (sc, id) => (sc.items || []).filter(i => i.parentId === id);
const aPriceOf = (sc, id) => sc.barter_scheme?.[id]?.[0]?.[0] || {};
const aLl = (sc, id) => sc.loyal_level_items?.[id] || 1;
const aSym = tpl => (CURS.find(c => c[0] === tpl) || CURS[0])[1];
const aNum = n => Number(n || 0).toLocaleString("en-US").replace(/,/g, " ");

/* ── 页面 ── */
function asPage() {
  if (!AD) { asLoad(); return ashell(`<div class="asempty">${T("a_loading")}</div>`); }
  if (!AD.ok) return ashell(`<div class="asempty">${T("a_nodb")}
    <button class="asx" id="aPickDb">${T("mr_pick")}</button></div>`);
  const sc = aScheme();
  if (!sc) return ashell(`<div class="asempty">${T("a_noshelf")}</div>`);

  return ashell(`<div class="aswork">
    <section class="asshelf">
      <div class="asbh"><b>${T("a_shelf")}</b> SHELF · ${T("a_shelf_d")}
        <span class="sp"></span><span class="asfilter" id="aFilter"></span>
        <em>${TF("a_onsale", aRoots(sc).length)}</em></div>
      <div class="astabs"><b>▣ ${T("a_tab_trade")}</b>
        <button id="aToQuest" title="${esc(T("a_tab_quest_d"))}">◆ ${T("a_tab_quest")}</button>
        <b>✦ ${T("a_tab_serv")}</b></div>
      <div class="astrader" id="aTrader"></div>
      <div class="astool"><b>${T("a_tool_show")}</b><s>↻ ${T("a_tool_refresh")}</s>
        <span class="sp"></span><em>${TF("a_wallsz", ACOLS, AROWS)}</em></div>
      <!-- 墙外面套一层 .aswrap2：左边一条行号尺、上面一条列号尺，右下才是格子墙本体。
           扫描线和四角刻度都挂在 .aswrap2 上（挂在 .aswall 上会被网格当成一个格子塞进去）。 -->
      <div class="asgrid" id="aWrap">
        <div class="aswrap2">
          <span class="ascorner"></span>
          <span class="asrx" id="aRx"></span>
          <span class="asry" id="aRy"></span>
          <div class="aswall" id="aShelf" title="${esc(T("a_wall_tip"))}"></div>
          <span class="asghost" id="aGhost"></span>
        </div>
      </div>
    </section>
    <div class="assplit"></div>
    <!-- 图例那段说明**放在右边参数栏的末尾**，不放在墙底下：
         墙底下那条横着占满整个预览区，等于从下面切掉一条格子（Tech Leader："挡住格子了"）。
         放在这儿是跟着参数一起滚的，参数长了它自然沉到底，永远不占预览区。 -->
    <section class="aspar"><div class="asbh"><b>${T("a_par")}</b> PARAMS
        <span class="sp"></span><em>${esc(asel ? aName(aItemOf(asel)?._tpl) : T("a_none"))}</em></div>
      <div class="aspbody" id="aParams"></div>
      <div class="asfoot">${T("a_foot")}</div></section>
  </div>`);
}

const aItemOf = id => (aScheme()?.items || []).find(x => x._id === id);

function ashell(inner) {
  const bad = (AD?.issues || []).filter(x => x.level === "err").length;
  const warn = (AD?.issues || []).length - bad;
  const sc = aScheme();
  return `<div class="dlgwrap"><header class="hdr"><div class="slab"></div>
    <div class="tt"><i>// SEC.${secNo("assort")}</i><h2>${T("nav_assort")}</h2></div>
    <div class="cart">
      <div><k>${T("a_k_trader")}</k><v>${esc((aRefOf().trader || T("a_notrader")).slice(0, 12))}</v></div>
      <div><k>${T("a_k_goods")}</k><v>${sc ? aRoots(sc).length : 0}</v></div>
      <div><k>MOD DB</k><v title="${esc(AD?.dir || "")}">${esc(aMod())}</v></div>
    </div>
    <div class="asbar">
      <span class="ascount ${bad ? "asbad" : ""}">${TF("a_issues", bad, warn)}</span>
      <button class="btn ghost" id="aWho"><span>${T("a_switch")}</span></button>
      <button class="btn pri" id="aSave"><span>${T("a_save")}${adirty() ? " *" : ""}</span></button>
    </div></header><div class="tape"></div>${inner}</div>`;
}

/* 模组名。dir 是 …\mods\<模组>\db，模组名在**倒数第二段** */
const aMod = () => (AD?.dir || "").split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] || "—";

/* ── 画左边那面墙 ── */
function aDraw() {
  const sc = aScheme(); if (!sc) return;
  const rs = aRoots(sc);

  /* ② 商人条：**只显示当前在编的那个**。换商人走数据头上那颗按钮 */
  const sum = {};
  for (const i of rs) { const p = aPriceOf(sc, i._id); const c = p._tpl || RUB;
    sum[c] = (sum[c] || 0) + Number(p.count || 0); }
  const total = Object.entries(sum).map(([c, n]) => aSym(c) + aNum(n)).join("  ");
  const maxLL = rs.length ? Math.max(...rs.map(i => aLl(sc, i._id))) : 0;
  const RN = ["—", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ"];
  const who = aRefOf().trader || "";
  $("aTrader").innerHTML = `<span class="asface">${aFace(who)}
      <span class="asrank">${RN[maxLL] || "—"}</span>${who ? `<span class="asok">✓</span>` : ""}</span>
    <span class="astname"><b>${esc(who ? who.slice(0, 24) : T("a_notrader"))}</b>
      <i>${esc(aRefOf().file || "")}</i>
      <span class="asll">${[1, 2, 3, 4].map(n => `<i class="${n <= maxLL ? "on" : ""}"></i>`).join("")}</span></span>
    <span class="astsum"><b>${TF("a_ngoods", rs.length)}</b>${TF("a_total", total || "—")}</span>`;

  /* ④ 墙：**10 格 × 12 排**，两个都定死（见 ACOLS / AROWS 那儿的说明）。
     格宽取"宽度够铺 10 格"和"高度够铺 12 排"里**小的那个** ——
     只按高度算的话窄窗口会横向溢出，只按宽度算的话矮窗口会竖着溢出。
     ⚠️ 量的是**滚动容器**，不是墙自己：墙的宽高正是这儿要算的东西，拿它自己去量会一轮比一轮小。 */
  const wall = $("aShelf"), wrap = $("aWrap");
  const px = Math.max(40, Math.min(110, Math.min(
    Math.floor(((wrap.clientWidth || 800) - ARULE - 2) / ACOLS),
    Math.floor(((wrap.clientHeight || 700) - ARULE - 2) / AROWS))));
  const box = wall.parentElement;
  box.style.setProperty("--cols", ACOLS);
  box.style.setProperty("--cell", px + "px");
  box.style.setProperty("--rows", AROWS);
  const show = rs.filter(i => !aOnly || aLl(sc, i._id) === Number(aOnly))
                 .sort((a, b) => aLl(sc, a._id) - aLl(sc, b._id));
  wall.innerHTML = show.map(i => aTile(sc, i)).join("")
    || `<div class="asnone">${T(aOnly ? "a_nolevel" : "a_nogoods")}</div>`;

  /* 行列标尺。**先画墙再量**：实际几排要等 CSS 网格把带跨度的瓦片摆完才知道
     （一件 2×3 的枪会自己挤出新排），所以行号只能在这一步之后填。
     这是坐标不是装饰 —— 一面 12×N 的格子墙，没有刻度就没法说"第 3 排第 5 格那件"。 */
  const rows = Math.max(AROWS, Math.round(wall.scrollHeight / px));
  $("aRx").innerHTML = Array.from({ length: ACOLS }, (_, i) => `<i>${i + 1}</i>`).join("");
  $("aRy").innerHTML = Array.from({ length: rows }, (_, i) =>
    `<i class="${i + 1 > AROWS ? "over" : ""}">${i + 1}</i>`).join("");
  $("aRy").style.setProperty("--rows", rows);

  $("aFilter").innerHTML = [["", T("a_all")], [1, "LL1"], [2, "LL2"], [3, "LL3"], [4, "LL4"]]
    .map(([v, t]) => `<button class="${String(aOnly) === String(v) ? "on" : ""}" data-lv2="${v}">${t}</button>`).join("");
  $("aParams").innerHTML = asel && aItemOf(asel) ? aPanel(sc, asel) : `<div class="aspempty">
    <b>${T("a_pickone")}</b>${T("a_pickone_d")}
    <div style="margin-top:1rem"><button class="btn pri" id="aAdd2"><span>＋ ${T("a_add")}</span></button></div></div>`;
}

/* 商人头像。
   剪影**永远先画上**，真图盖在它上面 —— 这样图没取到时下面就是剪影，不会闪一下空框。
   图的来源见服务端 /avimg：先找作者自己那张（base.json 的 avatar 指的图，一般在模组 res\ 里），
   再退回 SPT 自带的 12 张（文件名就是商人 id）。两处都没有就 404，onerror 里记下来别再要。 */
function aFace(id) {
  const sil = `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#101216"/>
    <path d="M0 100L100 0M-20 100L100 -20" stroke="rgba(255,255,255,.03)" stroke-width="8"/>
    <circle cx="50" cy="38" r="18" fill="#3A414A"/><path d="M20 100a30 30 0 0 1 60 0z" fill="#3A414A"/></svg>`;
  return sil + (id && !aAvBad[id] ? `<img class="asav" src="${aAvatar(id)}" alt="" data-av="${esc(id)}">` : "");
}

/* 一块瓦片。原生瓦片上只有三样：左上价格 / 右下数量 / 左下等级，名字靠鼠标停和右边参数栏 */
function aTile(sc, it) {
  const id = it._id, p = aPriceOf(sc, id), [w, h] = aSize(it._tpl);
  const t = aTpl(it._tpl), ks = aKids(sc, id);
  const inf = it.upd?.UnlimitedCount, n = it.upd?.StackObjectsCount ?? 0;
  const empty = aIsBox(it._tpl) && !ks.length;
  const qty = inf ? `<span class="asqty inf">${T("a_lots")}</span>`
    : `<span class="asqty ${n <= 3 ? "few" : ""}">${n}</span>`;
  const tip = `${aName(it._tpl)}　${w}×${h}　${aSym(p._tpl)}${aNum(p.count)}` +
    (ks.length ? `　${TF("a_holds", aName(ks[0]._tpl), ks[0].upd?.StackObjectsCount ?? 1)}` : "") +
    (empty ? "　⚠ " + T("a_emptybox2") : "");
  return `<div class="ascard ${id === asel ? "on" : ""} ${empty ? "bad" : ""}" data-pick="${esc(id)}"
      style="grid-column:span ${w};grid-row:span ${h}" title="${esc(tip)}">
    ${t?.icon ? `<img src="${aIcon(t.icon)}" alt="" loading="lazy">` : `<span class="asnoi">?</span>`}
    <span class="aspx">${aSym(p._tpl)}${aNum(p.count)}</span>
    ${qty}<span class="asll2 l${aLl(sc, id)}">${aLl(sc, id)}</span>
    ${empty ? `<span class="asbang" data-fill="${esc(id)}" title="${esc(T("a_fill"))}">!</span>`
            : it.upd?.BuyRestrictionMax ? `<span class="aslim"
                title="${esc(TF("a_limn", it.upd.BuyRestrictionMax))}"></span>` : ""}
  </div>`;
}

/* ── 右边：选中那件的参数。改这里 → 左边立刻变，这就是"实时预览" ── */
function aPanel(sc, id) {
  const it = aItemOf(id), p = aPriceOf(sc, id), inf = it.upd?.UnlimitedCount;
  const ks = aKids(sc, id), box = aIsBox(it._tpl), [w, h] = aSize(it._tpl);
  return `<div class="asblk">
    <div class="asblkh"><b>${esc(aName(it._tpl))}</b><span class="sp"></span>${esc(it._tpl.slice(0, 8))}</div>
    <div class="asblkb">
      <div class="asfld"><label>${T("a_f_item")}<i>${TF("a_f_item_d", w, h)}</i></label>
        <button class="btn ghost sm" id="aSwap"><span>${T("a_swap")}</span></button></div>
      <div class="asfld"><label>${T("a_f_price")}</label>
        <input class="asin" type="number" min="0" value="${p.count ?? 0}" data-price="${esc(id)}"></div>
      <div class="asfld"><label>${T("a_f_cur")}</label>
        <div class="asseg">${CURS.map(([c, s, k]) =>
          `<button class="${(p._tpl || RUB) === c ? "on" : ""}" data-cur="${esc(id)}|${c}">${s} ${T(k)}</button>`).join("")}</div></div>
    </div></div>

  <div class="asblk"><div class="asblkh"><b>${T("a_g_cond")}</b></div><div class="asblkb">
    <div class="asfld"><label>${T("a_f_ll")}<i>${T("a_f_ll_d")}</i></label></div>
    <div class="asllpick">${[1, 2, 3, 4].map(n =>
      `<button class="${aLl(sc, id) === n ? "on" : ""}" data-lv="${esc(id)}|${n}">LL ${n}</button>`).join("")}</div>
    <div class="asfld" style="margin-top:.5rem"><label>${T("a_f_stock")}</label>
      <div class="asseg"><button class="${inf ? "on" : ""}" data-inf="${esc(id)}|1">${T("a_inf")}</button>
        <button class="${inf ? "" : "on"}" data-inf="${esc(id)}|0">${T("a_fin")}</button></div></div>
    ${inf ? "" : `<div class="asfld"><label>${T("a_f_left")}</label>
      <input class="asin w" type="number" min="0" value="${it.upd?.StackObjectsCount ?? 0}" data-stock="${esc(id)}"></div>`}
    <div class="asfld"><label>${T("a_f_lim")}<i>${T("a_f_lim_d")}</i></label>
      <input class="asin w" type="number" min="0" value="${it.upd?.BuyRestrictionMax ?? 0}" data-lim="${esc(id)}"></div>
  </div></div>

  ${box ? `<div class="asblk"><div class="asblkh"><b>${T("a_g_inside")}</b>
    <span class="sp"></span>${ks.length}</div><div class="asblkb">
    ${ks.length ? ks.map(k => `<div class="asfld"><label>${esc(aName(k._tpl))}</label>
        <input class="asin w" type="number" min="1" value="${k.upd?.StackObjectsCount ?? 1}"
          data-kid="${esc(k._id)}"></div>`).join("")
      : `<div class="ashint"><em>${T("a_emptybox2")}</em> ${T("a_emptybox_d")}</div>
         <div style="margin-top:.5rem"><button class="btn ghost sm" data-fill="${esc(id)}">
           <span>${T("a_fill")}</span></button></div>`}
  </div></div>` : ""}

  <div class="asacts"><button class="btn ghost sm" id="aAdd"><span>＋ ${T("a_add")}</span></button>
    <span class="sp"></span>
    <button class="btn warn sm" data-rm="${esc(id)}"><span>${T("a_del")}</span></button></div>`;
}

/* ── 接线 ──
   每次重画都要重接：innerHTML 一换，上一批监听器就跟着元素一起没了。 */
function wireAs() {
  hide();
  if (AD?.ok && aScheme()) aDraw();
  document.querySelectorAll("[data-pick]").forEach(el =>
    el.onclick = () => { asel = el.dataset.pick; render(); });
  document.querySelectorAll("[data-lv2]").forEach(el =>
    el.onclick = () => { aOnly = el.dataset.lv2; render(); });
  document.querySelectorAll("[data-price]").forEach(el =>
    el.oninput = () => { aPrice(el.dataset.price, Number(el.value)); });
  document.querySelectorAll("[data-cur]").forEach(el =>
    el.onclick = () => { const [id, c] = el.dataset.cur.split("|"); aCur(id, c); });
  document.querySelectorAll("[data-lv]").forEach(el =>
    el.onclick = () => { const [id, n] = el.dataset.lv.split("|"); aLoyal(id, Number(n)); });
  document.querySelectorAll("[data-inf]").forEach(el =>
    el.onclick = () => { const [id, v] = el.dataset.inf.split("|"); aStockMode(id, v === "1"); });
  document.querySelectorAll("[data-stock]").forEach(el =>
    el.oninput = () => aStock(el.dataset.stock, Number(el.value)));
  document.querySelectorAll("[data-lim]").forEach(el =>
    el.oninput = () => aLimit(el.dataset.lim, el.value === "" ? null : Number(el.value)));
  document.querySelectorAll("[data-kid]").forEach(el =>
    el.oninput = () => aKid(el.dataset.kid, Number(el.value)));
  document.querySelectorAll("[data-rm]").forEach(el =>
    el.onclick = () => aRemove(el.dataset.rm));
  /* 「一键装满」那颗长在瓦片里面，瓦片本身也吃点击 —— 不掐掉会连带触发"选中" */
  document.querySelectorAll("[data-fill]").forEach(el =>
    el.onclick = e => { e.stopPropagation(); aFill(el.dataset.fill); });
  for (const k of ["aAdd", "aAdd2"]) { const b = $(k); if (b) b.onclick = aAddPick; }
  /* 点墙上的**空地**直接开物品选择器 —— 塔科夫里那面墙就是一格一格摆的，
     "在空格子上添加"是最顺手的动作。瓦片自己吃掉了点击（e.target 是瓦片不是墙），
     所以只认落在墙本身、或落在"这里还没有商品"那行字上的那一下。 */
  const wall = $("aShelf");
  if (wall) wall.onclick = e => {
    if (e.target === wall || e.target.classList.contains("asnone")) aAddPick();
  };
  /* 空格子跟着鼠标亮一个虚框 + 加号：「点空格子能加商品」这件事，得看得见才算数。
     落在瓦片上时 e.target 不是墙，直接收起来。虚框自己 pointer-events:none，
     不然鼠标一压上去 e.target 就变成虚框，会闪。 */
  const gh = $("aGhost");
  if (wall && gh) {
    const cell = () => parseFloat(getComputedStyle(wall.parentElement).getPropertyValue("--cell")) || 60;
    wall.onmousemove = e => {
      if (e.target !== wall) { gh.classList.remove("on"); return; }
      const r = wall.getBoundingClientRect(), px = cell();
      gh.style.left = (ARULE + Math.floor((e.clientX - r.left) / px) * px) + "px";
      gh.style.top = (ARULE + Math.floor((e.clientY - r.top) / px) * px) + "px";
      gh.style.width = gh.style.height = px + "px";
      gh.classList.add("on");
    };
    wall.onmouseleave = () => gh.classList.remove("on");
  }
  /* 头像取不到就把 <img> 摘掉，露出底下的剪影；记一笔，之后重画不再去要 */
  const av = document.querySelector("[data-av]");
  if (av) av.onerror = () => { aAvBad[av.dataset.av] = true; av.remove(); };
  /* 「任务」页签：这一版不在货架里编任务，点它跳到任务编辑那页 */
  const tq = $("aToQuest"); if (tq) tq.onclick = () => { page = "quest"; render(); };
  /* 换物品：只换 _tpl，价格和等级留着，所以**不用**选择器给的参考价 */
  const sw = $("aSwap");
  if (sw) sw.onclick = () => { hide(); pickItem(it => aSwapItem(asel, it.id), T("a_swap")); };
  const wh = $("aWho"); if (wh) wh.onclick = aWhoPick;
  const sv = $("aSave"); if (sv) sv.onclick = () => aPost(false);
  const pk = $("aPickDb"); if (pk) pk.onclick = () => modPick(AD);
}

/* ── 改数据 ──
   三张表要一起动：改价格就是改 barter_scheme，缺了它这件商品"看得见买不了" */
function aPrice(id, n) {
  const sc = aScheme(); if (!sc) return;
  sc.barter_scheme = sc.barter_scheme || {};
  sc.barter_scheme[id] = [[{ count: n, _tpl: aPriceOf(sc, id)._tpl || RUB }]];
  render();
}
function aCur(id, tpl) {
  const sc = aScheme(); if (!sc) return;
  sc.barter_scheme = sc.barter_scheme || {};
  sc.barter_scheme[id] = [[{ count: aPriceOf(sc, id).count || 0, _tpl: tpl }]];
  render();
}
function aLoyal(id, n) {
  const sc = aScheme(); if (!sc) return;
  sc.loyal_level_items = sc.loyal_level_items || {};
  sc.loyal_level_items[id] = Math.min(4, Math.max(1, n || 1));
  render();
}
/* 无限供应＝ UnlimitedCount + 一个大到用不完的数；改成有限时别把那个 9999999 留着 */
function aStockMode(id, inf) {
  const it = aItemOf(id); if (!it) return;
  it.upd = it.upd || {};
  it.upd.UnlimitedCount = inf;
  if (inf) it.upd.StackObjectsCount = 9999999;
  else if ((it.upd.StackObjectsCount ?? 0) > 9999) it.upd.StackObjectsCount = 5;
  render();
}
function aStock(id, n) {
  const it = aItemOf(id); if (!it) return;
  it.upd = it.upd || {}; it.upd.StackObjectsCount = Math.max(0, n || 0);
  render();
}
function aLimit(id, n) {
  const it = aItemOf(id); if (!it) return;
  it.upd = it.upd || {};
  if (n == null || n <= 0) { delete it.upd.BuyRestrictionMax; delete it.upd.BuyRestrictionCurrent; }
  else { it.upd.BuyRestrictionMax = n; it.upd.BuyRestrictionCurrent = 0; }
  render();
}
function aKid(id, n) {
  const it = aItemOf(id); if (!it) return;
  it.upd = it.upd || {}; it.upd.StackObjectsCount = Math.max(1, n || 1);
  render();
}

/* 删商品要连它的子件、价格、等级一起删 —— 只删 items 会留下一堆孤儿 */
function aRemove(id) {
  const sc = aScheme(); if (!sc) return;
  sc.items = (sc.items || []).filter(x => x._id !== id && x.parentId !== id);
  delete sc.barter_scheme?.[id];
  delete sc.loyal_level_items?.[id];
  if (asel === id) asel = null;
  render();
}

/* 一键装满：容器类商品最常见的错就是忘了装东西，这里直接照模板的白名单和容量填上 */
function aFill(id) {
  const sc = aScheme(); if (!sc) return;
  const it = aItemOf(id); if (!it) return;
  const slot = ATPL[it._tpl]?.stack?.[0];
  if (!slot) { aFetchTpls(); return say(T("a_fill_wait")); }
  const tpl = (slot.filter || [])[0]; if (!tpl) return;
  /* ⚠️ 字段名是 **camelCase**（name / max）——服务端 Results.Json 走 Web 默认策略，
     C# 里的 Name/Max 发出来就是小写开头。写成 slot.Name 会静默变成 undefined：
     槽位名成了 undefined、数量退回 1，装出来的还是个"几乎空"的盒子。
     PowerShell 的接口测试**抓不到这个**——它的属性访问大小写不敏感，`$x.Max` 照样读到 `max`。 */
  sc.items.push({ _id: aNewId(), _tpl: tpl, parentId: id, slotId: slot.name,
    location: 0, upd: { StackObjectsCount: slot.max || 1 } });
  render();
}

const aNewId = () => Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

/* 当前货架用到的 tpl 的容器信息。只拉没拉过的，拉完重画一次。
   **开局就要跑一次**：不跑的话"这是空容器"那个标记要等人点一下才出现，
   而那正是这一页最该第一眼看到的东西。 */
function aFetchTpls() {
  const sc = aScheme(); if (!sc) return;
  const need = [...new Set(aRoots(sc).map(i => i._tpl))].filter(t => t && !(t in ATPL));
  if (!need.length) return;
  Promise.all(need.map(t => api("/api/assort/tpl?id=" + encodeURIComponent(t))
    .then(d => { ATPL[t] = d.ok ? d : null; }).catch(() => { ATPL[t] = null; })))
    .then(() => { if (page === "assort") render(); });
}

/* ── 换商人（切货架）── */
function aWhoPick() {
  const list = AD?.schemes || [];
  bModalLike(T("a_switch"), () => `<div class="btlist">${list.map(s => {
    const k = akey(s);
    return `<button class="btrow ${k === acur ? "on" : ""}" data-shelf="${esc(k)}">
      <b>${esc(s.trader || T("a_notrader"))}</b><i>${esc(s.file)} · ${TF("a_ngoods", s.count)}</i></button>`;
  }).join("") || `<div class="asempty">${T("a_noshelf")}</div>`}</div>`,
    close => document.querySelectorAll("[data-shelf]").forEach(el =>
      el.onclick = () => { acur = el.dataset.shelf; asel = null; close(); aFetchTpls(); render(); }));
}

/* 弹窗壳：和服装页那套皮一致（.mdwrap/.mdbox） */
function bModalLike(title, body, wire) {
  const w = document.createElement("div");
  w.className = "mdwrap";
  w.innerHTML = `<div class="mdbox btbox"><div class="mdhead"><span class="slab"></span>${esc(title)}</div>
    <div class="mdbody">${body()}</div>
    <div class="mdacts"><button class="btn ghost" id="aMdX"><span>${T("md_cancel")}</span></button></div></div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener("keydown", key, true); };
  const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", key, true);
  $("aMdX").onclick = close;
  w.onmousedown = e => { if (e.target === w) close(); };
  wire(close);
}

/* ── 物品选择器 ──
   **直接用任务编辑页那个窗口**（#ipick，见 quest.js 的 pickItem）：可拖动、左边一棵分类树、
   右边一行一件带中英名和 handbook 参考价。Tech Leader 2026-08-11 拍板"弄成任务编辑里面那个"。
   货架页原来那个挂在 #pop 里的小列表（.aspick 那一套）已整段删掉 —— 同一件事没必要养两套皮，
   何况那个既没有分类树也不显示价格。

   能这么用的前提：**quest.js 在 assort.js 之前无条件加载**（index.html 末尾四行 script 的顺序），
   而它那段接线是解析时就跑的 IIFE。所以哪怕开局直接进货架页、从没去过任务页，
   pickItem / closeItems / #ipick 也全是现成的。
   ⚠️ pickItem 自己**不收 #pop**（任务页那三个调用点都是自己先 hide() 的），这儿照办，
      不然点「＋添加商品」时上一个小菜单会留在屏幕上和物品窗叠着。 */
const aAddPick = () => { hide(); pickItem(it => aAddItem(it.id, it.price), T("a_add")); };

/* 换物品：只改 _tpl，价格和等级原样留着 —— 作者要的是"换个东西卖同样的价" */
function aSwapItem(id, tpl) {
  const it = aItemOf(id); if (!it) return;
  it._tpl = tpl;
  delete ATPL[tpl]; aFetchTpls();
  render();
}

/* 新商品：三张表一次配齐，别让它一出生就是"看得见买不了"。
   起手价直接用 handbook 的参考价 —— 选择器里那一列显示的就是它，挑的时候已经看见了。
   原来一律写死 1000₽，加一把步枪也是 1000，作者每次都得手改。
   handbook 没给价（不少任务道具是 0）才退回 1000。 */
function aAddItem(tpl, price) {
  const sc = aScheme(); if (!sc) return;
  const id = aNewId();
  sc.items = sc.items || [];
  sc.items.push({ _id: id, _tpl: tpl, parentId: "hideout", slotId: "hideout",
    upd: { UnlimitedCount: true, StackObjectsCount: 9999999 } });
  sc.barter_scheme = sc.barter_scheme || {};
  sc.barter_scheme[id] = [[{ count: Math.round(price) > 0 ? Math.round(price) : 1000, _tpl: RUB }]];
  sc.loyal_level_items = sc.loyal_level_items || {};
  sc.loyal_level_items[id] = 1;
  asel = id;
  delete ATPL[tpl]; aFetchTpls();
  render();
}

/* ── 保存 ── */
function aPost(force) {
  if (!AD?.ok) return;
  api("/api/assort", {
    method: "POST", headers: { "Content-Type": "application/json" },
    /* **只送改过的那几份。** 服务端只写它收到的文件，没动过的连时间戳都不会变 */
    body: JSON.stringify({ stamp: AD.stamp, force, files: aChanged() }),
  }).then(d => { AD.stamp = d.stamp; AD.issues = d.issues; aMark(); render(); })
    .catch(async e => {
      /* 409：文件在编辑器外面被改过了。别默默盖掉，让人自己选 */
      if (String(e.message || "").includes("stale")) {
        const go = await confirm2(T("a_stale"), T("nav_assort"));
        if (go) aPost(true); else asLoad();
        return;
      }
      say(TF("a_savefail", String(e.message || e).slice(0, 80)));
    });
}
