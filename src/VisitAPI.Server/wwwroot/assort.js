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
  /* 键 = 文件名 [+ "#" + 商人 id]（见 akey）。文件名里也可能有 #，所以只认末尾那段 24 位 id 前面的 #，别 split */
  const m = /^(.*)#([0-9a-f]{24})$/i.exec(acur), file = m ? m[1] : acur, trader = m ? m[2] : "";
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

/* 墙上那几块瓦片、和商人条上的合计。
   **aDraw（整页重画）和 aTouch（只刷预览）共用这一份**，抄成两份迟早对不上。 */
const aTiles = sc => aRoots(sc)
  .filter(i => !aOnly || aLl(sc, i._id) === Number(aOnly))
  .sort((a, b) => aLl(sc, a._id) - aLl(sc, b._id))
  .map(i => aTile(sc, i)).join("")
  || `<div class="asnone">${T(aOnly ? "a_nolevel" : "a_nogoods")}</div>`;
/* ⚠️ **只有货币能进合计。** 以物换物那条的 `_tpl` 是一件物品，按 tpl 分桶的话每种物品
   都会变成一个桶，而 aSym 认不出来的 tpl 一律退回卢布符号 —— 原版耶格尔那面墙会渲染出
   69 个 "₽n" 碎片糊在商人条上。它们改成单独报个数。 */
function aTotal(sc) {
  const sum = {}; let barter = 0;
  for (const i of aRoots(sc)) {
    const p = aPriceOf(sc, i._id), t = p._tpl || RUB;
    if (CURS.some(([c]) => c === t)) sum[t] = (sum[t] || 0) + Number(p.count || 0);
    else barter++;
  }
  return [Object.entries(sum).map(([c, n]) => aSym(c) + aNum(n)).join("  "),
          barter ? TF("a_nbarter", barter) : ""].filter(Boolean).join("  ");
}

/* ── 实时预览：只刷左边看得见的那三样，**绝不碰右边的 #aParams** ──
   "改数字 → 左边立刻变"是这一页的核心，所以数字格是边打字边生效的。
   但**不能顺手 render()**：那会把右边整块参数栏重建，用户正在打字的那个 `<input>`
   连人带光标一起被换掉，第二个字符就没人接了 —— 表现成"价格改不了，只能一下一下点箭头"。
   任务页的 qtouch() 是同一条路子，那儿的注释写着同一条理由。 */
function aTouch(id) {
  const sc = aScheme(); const wall = $("aShelf"); if (!sc || !wall) return;
  /* 能只换一块就只换一块。整面墙重画在原版那种四百件的货架上是每敲一个字符
     重建四百个 DOM 节点（每块还要全表扫一遍找子件），而且**正在被按下的那块瓦片
     一旦被换掉，鼠标抬起时 click 就不成立了** —— 表现成"打完字点别的商品第一下没反应"。 */
  const one = id && wall.querySelector(`.ascard[data-pick="${id}"]`), it = id && aItemOf(id);
  if (one && it) one.outerHTML = aTile(sc, it);
  else wall.innerHTML = aTiles(sc);
  aWireWall();                                   /* 瓦片是刚重画出来的，监听器要跟着重接 */
  const tot = $("aTrader")?.querySelector(".astsum");
  if (tot) tot.innerHTML = `<b>${TF("a_ngoods", aRoots(sc).length)}</b>${
    TF("a_total", aTotal(sc) || "—")}`;
  const sv = $("aSave")?.querySelector("span");  /* 存盘星号：改了就得亮，不然人以为没记上 */
  if (sv) sv.textContent = T("a_save") + (adirty() ? " *" : "");
}
function aWireWall() {
  const wall = $("aShelf"); if (!wall) return;
  wall.querySelectorAll("[data-pick]").forEach(el =>
    el.onclick = () => { asel = el.dataset.pick; render(); });
  wall.querySelectorAll("[data-fill]").forEach(el =>
    el.onclick = e => { e.stopPropagation(); aFill(el.dataset.fill); });
}

/* ── 画左边那面墙 ── */
function aDraw() {
  const sc = aScheme(); if (!sc) return;
  const rs = aRoots(sc);

  /* ② 商人条：**只显示当前在编的那个**。换商人走数据头上那颗按钮 */
  const total = aTotal(sc);
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
  wall.innerHTML = aTiles(sc);

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

/* 这条价格**编不编得动**：只有"一种付法、只要一样东西"那种（也就是一口价）才编得动。
   原版和 OpenTarkov 都带着大量以物换物（拿 5 发子弹换一件）和多种付法的条目 ——
   编辑器把它压成 `[[{count,_tpl}]]` 就等于把作者的设计一键删掉，而且看不出来。
   编不动的就老老实实**只显示不改**：显示得出来，作者至少知道这儿有东西、别去碰。
   （整条不存在时算"编得动"：那是还没定价的新商品，正等着填。） */
const aFlat = (sc, id) => {
  const b = sc.barter_scheme?.[id];
  if (!b || !b.length) return true;              /* 还没定价（含空数组 []）：当成能编，一敲就补齐 */
  if (b.length !== 1 || (b[0]?.length ?? 0) > 1) return false;
  /* **只看形状是不够的**：`[[{count:1,_tpl:<一件物品>}]]` 和一口价长得一模一样。
     实测原版 2854 条价格里有 400 条就是这种"单件以物换物"（1 × 电线束 之类），
     只数层数的话它们照样会拿到货币按钮，点一下就把"换一捆电线"改成"1 卢布"。 */
  const t = b[0]?.[0]?._tpl;
  return !t || CURS.some(([c]) => c === t);
};
/* 一行一种付法，一种里要几样东西用 ＋ 连起来 */
/* ⚠️ 每一层都得当"可能是脏的"来收：这一段是 aPanel 里跑的，而 aPanel 由 aDraw 调、
   aDraw 在 wireAs 接线**之前**跑 —— 这里抛一次，整页的监听器一个都接不上，
   表现成"墙画出来了、什么都点不动"，而界面上没有任何提示。 */
const aBarter = (sc, id) => {
  const b = sc.barter_scheme?.[id];
  return (Array.isArray(b) ? b : []).map(or => (Array.isArray(or) ? or : []).filter(Boolean)
    .map(x => `${aNum(x.count ?? 1)} × ${esc(aName(x._tpl) || String(x._tpl || "").slice(0, 8))}`)
    .join(" ＋ ")).filter(Boolean).join("<br>") || "—";
};

/* ── 右边：选中那件的参数。改这里 → 左边立刻变，这就是"实时预览" ── */
function aPanel(sc, id) {
  const it = aItemOf(id), p = aPriceOf(sc, id), inf = it.upd?.UnlimitedCount;
  const ks = aKids(sc, id), box = aIsBox(it._tpl), [w, h] = aSize(it._tpl);
  return `<div class="asblk">
    <div class="asblkh"><b>${esc(aName(it._tpl))}</b><span class="sp"></span>${esc(it._tpl.slice(0, 8))}</div>
    <div class="asblkb">
      <div class="asfld"><label>${T("a_f_item")}<i>${TF("a_f_item_d", w, h)}</i></label>
        <button class="btn ghost sm" id="aSwap"><span>${T("a_swap")}</span></button></div>
      ${aFlat(sc, id) ? `<div class="asfld"><label>${T("a_f_price")}</label>
        <input class="asin" type="number" min="0" value="${p.count ?? 0}" data-price="${esc(id)}"></div>
      <div class="asfld"><label>${T("a_f_cur")}</label>
        <div class="asseg">${CURS.map(([c, s, k]) =>
          `<button class="${(p._tpl || RUB) === c ? "on" : ""}" data-acur="${esc(id)}|${c}">${s} ${T(k)}</button>`).join("")}</div></div>`
      : `<div class="asfld"><label>${T("a_f_price")}</label></div>
        <div class="ashint"><em>${T("a_barter")}</em> ${T("a_barter_d")}
          <div style="margin-top:.4rem">${aBarter(sc, id)}</div></div>`}
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
   每次重画都要重接：innerHTML 一换，上一批监听器就跟着元素一起没了。

   ⚠️ **一律从本页根节点往下找，不许再用 `document.querySelectorAll`。**
   `data-cur` 这个名字全站的鼠标指针开关也在用 —— index.html 的 `setCur()` 往 `<html>` 上
   盖了一个 `data-cur="on"`（默认就开着）。document 级的选择器会把 `<html>` 一起选中，
   等于把点击处理器装到了冒泡的终点上：这一页上**任何一次点击**都会顺带跑一遍
   `aCur("on", undefined)`，往 barter_scheme 里塞一条 `"on": [[{"count":0}]]` ——
   键不是 24 位十六进制、还缺 `_tpl`（`JSON.stringify` 把 undefined 的键直接丢掉）。
   SPT 把这两张表的键反序列化成 MongoId，读到 "on" 当场抛，**服务端连启动都启动不了**。
   2026-08-22 实锤：SORA 那份 assort 就是这么被写坏的，启动即停。
   编辑器界面上还**完全看不出来** —— 所有读路径都是拿商品 id 去查价格表，
   没有一处会去遍历这张表的键，所以那条野记录既不显示也不影响件数，存进去才炸。
   属性顺手改名成 `data-acur`，不再和别人撞；两道闸都留着，谁先失效另一道还在。 */
function wireAs() {
  hide();
  if (AD?.ok && aScheme()) aDraw();
  /* 取不到本页根节点时**返回空**，绝不退回 document —— 那样等于把这次修的洞又打开一次 */
  const root = $("main");
  const qAs = s => root ? root.querySelectorAll(s) : [];
  /* 形状不对就当没看见 —— 绝不拿一个半截值当 id 往三张表里写 */
  const two = (el, k, fn) => { const [a, b] = (el.dataset[k] || "").split("|"); if (a && b) fn(a, b); };
  aWireWall();                     /* 墙上那两个钩子（选中 / 一键装满）只在 aWireWall 里写一份 */
  qAs("[data-lv2]").forEach(el =>
    el.onclick = () => { aOnly = el.dataset.lv2; render(); });
  /* 数字格一律 `onchange`，不用 `oninput`。
     oninput 会在**第一个字符**上就 render()，整块面板连人带光标一起重画，
     第二个字符敲下去已经没人接了 —— 表现成"价格改不了、只能一下一下点上下箭头"
     （原来那样从 1000 点到 12000 要点一万一千下）。change 在回车/失焦时才发，
     点上下箭头也照发。任务页 quest.js 早就是这么写的，那儿的注释写着同一条理由。 */
  /* 边打字边生效（实时预览是这一页的核心），改数据的那几个函数只调 `aTouch()` 不调 `render()`。
     `onchange` 也一起接上：点上下箭头、失焦、回车都能收尾（值没变时多跑一趟 aTouch 无害）。 */
  const live = (el, fn) => { el.oninput = el.onchange = fn; };
  qAs("[data-price]").forEach(el =>
    live(el, () => aPrice(el.dataset.price, Number(el.value))));
  qAs("[data-acur]").forEach(el =>
    el.onclick = () => two(el, "acur", (id, c) => aCur(id, c)));
  qAs("[data-lv]").forEach(el =>
    el.onclick = () => two(el, "lv", (id, n) => aLoyal(id, Number(n))));
  qAs("[data-inf]").forEach(el =>
    el.onclick = () => two(el, "inf", (id, v) => aStockMode(id, v === "1")));
  qAs("[data-stock]").forEach(el =>
    live(el, () => aStock(el.dataset.stock, Number(el.value))));
  qAs("[data-lim]").forEach(el =>
    live(el, () => aLimit(el.dataset.lim, el.value === "" ? null : Number(el.value))));
  qAs("[data-kid]").forEach(el =>
    live(el, () => aKid(el.dataset.kid, Number(el.value))));
  qAs("[data-rm]").forEach(el =>
    el.onclick = () => aRemove(el.dataset.rm));
  /* 「一键装满」那颗长在瓦片里面，瓦片本身也吃点击 —— 不掐掉会连带触发"选中" */
  qAs("[data-fill]").forEach(el =>
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
/* ⚠️ 这两个是**唯一会往 barter_scheme 里造新键**的地方，所以先认人再落笔：
   id 必须是货架上真有的一件商品，货币必须是认识的那三种之一。
   这是被 "on" 那条坑逼出来的第二道闸 —— 接线那儿已经收了作用域，
   但万一以后又有哪个选择器把野值喂进来，模型这一层也不能被写脏：
   文件里多一个非法键 = 服务端开不起来（服务端落盘前还有第三道，见 AssortValidator.FatalId）。 */
/* ⚠️ 两个都**就地改那一个字段，绝不重建整条**。
   重建成 `[[{count,_tpl}]]` 会把作者写在同一条上的别的字段一起抹掉 ——
   实测原版 2854 条价格里有 168 条带 `level`/`side`/`onlyFunctional`，
   OpenTarkov 那 1955 条更是**每条都带 `type`**。抹掉不报错、界面上也看不出来，
   进游戏才发现"这条件怎么没了"。整条本来就不存在时才新起一条（新加的商品走这条路）。 */
/* ⚠️ **不许四舍五入。** 价格不是"整数卢布"—— 原版一口价里有 649 条是小数
   （和平使者的美元价、滑雪佬的欧元价，比如 261.59 / 15192.74）。
   四舍五入等于作者点一下上下箭头就把小数抹了，而这正是本轮要修的那类"悄悄改坏数据"。
   只钳掉负数和非数。
   ⚠️ **值没变就直接走人。** 输入框同时接了 oninput 和 onchange：失焦时 change 还会再发一次，
   而失焦发生在**鼠标按下的那一刻**。这时候要是重画瓦片，被按住的那块当场被换掉，
   鼠标抬起时 click 不成立 —— 表现成"打完字去点别的商品，第一下没反应"。 */
function aPrice(id, n) {
  const sc = aScheme(); if (!sc || !aItemOf(id)) return;
  const c = Math.max(0, Number.isFinite(n) ? n : 0);
  const p = sc.barter_scheme?.[id]?.[0]?.[0];
  if (p) { if (p.count === c) return; p.count = c; }
  else {
    sc.barter_scheme = sc.barter_scheme || {};
    sc.barter_scheme[id] = [[{ count: c, _tpl: RUB }]];
  }
  aTouch(id);
}
function aCur(id, tpl) {
  const sc = aScheme(); if (!sc || !aItemOf(id) || !CURS.some(([c]) => c === tpl)) return;
  const p = sc.barter_scheme?.[id]?.[0]?.[0];
  if (p) p._tpl = tpl;
  else {
    sc.barter_scheme = sc.barter_scheme || {};
    sc.barter_scheme[id] = [[{ count: 0, _tpl: tpl }]];
  }
  render();
}
function aLoyal(id, n) {
  /* 等级表的键和价格表一样要过服务端那道 24 位十六进制的闸，所以这儿也得先认人 */
  const sc = aScheme(); if (!sc || !aItemOf(id)) return;
  sc.loyal_level_items = sc.loyal_level_items || {};
  sc.loyal_level_items[id] = Math.min(4, Math.max(1, n || 1));
  render();
}
/* 无限供应＝ UnlimitedCount。
   ⚠️ 两条都是**别动作者填的数**：
   ① 点的是**已经选中**的那一档就直接走人（原来点一下就照样把库存改写一遍）；
   ② 切回有限时**保留原来的数量**。原来是"大于 9999 一律改成 5" ——
      实测原版有 23 件商品库存超过 9999（最高 865000），一按就没了。
      切到无限时也只在这个键**完全没有**的时候才补一个大数（真无限时服务端根本不看它）。 */
function aStockMode(id, inf) {
  const it = aItemOf(id); if (!it) return;
  if (!!it.upd?.UnlimitedCount === inf) return;
  it.upd = it.upd || {};
  it.upd.UnlimitedCount = inf;
  if (it.upd.StackObjectsCount == null) it.upd.StackObjectsCount = inf ? 9999999 : 1;
  /* 切回有限时，**只有那个用不完的哨兵值要换掉**：无限供应时服务端根本不看这个数，
     原版 2822 件无限商品里 2657 件写的就是 9999999。留着它等于"有限，但一千万件" ——
     作者要的不是这个。低于它的一律原样保留（原版最大的真实库存 2885000 就在这一档）。 */
  if (!inf && (it.upd.StackObjectsCount ?? 0) >= 9999999) it.upd.StackObjectsCount = 1;
  render();
}
/* 库存 / 限购 / 盒内数量都是整数：小数 SPT 反序列化会抛，Infinity 会被 JSON.stringify 写成 null（价格那边有 isFinite 守卫，这三处原来没有） */
const aInt = (n, lo) => Number.isFinite(n) ? Math.max(lo, Math.trunc(n)) : lo;
function aStock(id, n) {
  const it = aItemOf(id); if (!it) return;
  const v = aInt(n, 0);
  if (it.upd?.StackObjectsCount === v) return;          /* 值没变就别重画（理由见 aPrice） */
  it.upd = it.upd || {}; it.upd.StackObjectsCount = v;
  aTouch(id);
}
function aLimit(id, n) {
  const it = aItemOf(id); if (!it) return;
  if (n != null) n = aInt(n, 0);
  if (n == null || n <= 0) {
    /* 本来就没有 upd 就别为了删两个键**造**一个出来（原版有 30 件商品本来没有 upd）。
       ⚠️ 反过来也别把空的 upd 整个删掉：根商品的 upd 服务端是不判空就取的。 */
    if (it.upd) { delete it.upd.BuyRestrictionMax; delete it.upd.BuyRestrictionCurrent; }
  } else {
    if (it.upd?.BuyRestrictionMax === n) return;         /* 值没变就别重画（理由见 aPrice） */
    it.upd = it.upd || {};
    it.upd.BuyRestrictionMax = n;
    /* 已经有值就别写 0：那是"这次刷新已经买了几个"的计数，作者可能是故意填的 */
    it.upd.BuyRestrictionCurrent = it.upd.BuyRestrictionCurrent ?? 0;
  }
  aTouch(id);
}
function aKid(id, n) {
  const it = aItemOf(id); if (!it) return;
  const v = aInt(n, 1);
  if (it.upd?.StackObjectsCount === v) return;          /* 值没变就别重画（理由见 aPrice） */
  it.upd = it.upd || {}; it.upd.StackObjectsCount = v;
  aTouch(it.parentId);                                  /* 变的是盒子那块瓦片，不是子件自己 */
}

/* 删商品要连它的**整条子孙链**、价格、等级一起删 —— 只删 items 会留下一堆孤儿。
   ⚠️ 原来只删了一层（`parentId === id`）。枪那种商品的预设子件是有孙辈的
   （实测原版 2854 件里有 234 件商品的子件超过一层，最深三层），
   删完剩下的那些 parentId 指着一个已经不存在的 id：服务端不报错、校验也看不见
   （as_orphan 只查价格表和等级表的键，从来不查 items），进游戏那件东西就是残的。 */
function aRemove(id) {
  const sc = aScheme(); if (!sc) return;
  const dead = new Set([id]);
  for (let n = -1; n !== dead.size;) {          /* 一层层往下收，收到不再变多为止 */
    n = dead.size;
    for (const it of sc.items || []) if (dead.has(it.parentId)) dead.add(it._id);
  }
  sc.items = (sc.items || []).filter(x => !dead.has(x._id));
  /* 两张表按**整条子孙链**清：子件本不该有价格，但真有残留的时候（as_orphan 就是报这个的，
     原版自己都带着 15 条）只清根 id 会把残留留在文件里，下次保存又报一条孤儿 */
  for (const d of dead) { delete sc.barter_scheme?.[d]; delete sc.loyal_level_items?.[d]; }
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
      /* ⚠️ 按**字段**判，别拿整个 JSON 正文做子串匹配：正文里带着文件名，
         一份叫 `stale.json` 的货架撞上 bad_id 会被认成"文件被改过"，
         弹一个覆盖确认 → 确认 → 又 400 → 再弹，作者永远看不到真正的原因。 */
      const m = String(e.message || e);
      let j = null; try { j = JSON.parse(m); } catch (_) { }
      const err = j?.error || "";
      if (err === "stale" || (!j && m.includes("stale"))) {
        const go = await confirm2(T("a_stale"), T("nav_assort"));
        if (go) aPost(true); else asLoad();
        return;
      }
      /* 服务端把非法 id 拦在了落盘之前（AssortValidator.FatalId）。
         这种文件会让 SPT 读都读不进去，所以说清楚是哪一个，别只丢一串 JSON 给作者看 */
      if (err === "bad_id") { say(TF("a_badid", j.id || "")); return; }
      say(TF("a_savefail", m.slice(0, 80)));
    });
}
