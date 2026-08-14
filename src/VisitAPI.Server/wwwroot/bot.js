/* ══════════════════════════════════════════════════════════════════
   BOT 服装编辑器（SEC.02）—— 左「装配台」／右「衣柜」
   跑在 index.html 的内联脚本之后，直接用它的全局：
   T / TF / api / $ / esc / hide / ask / say / confirm2 / secNo / render / page / lang / TOK。

   ── 模型（Tech Leader 定的，别凭印象改回去）──────────────────────
   ① **每个部位只有一个图标**。bot json 里那一堆 id 是 SPT 原版给这个 bot 配的随机服装池
      （实测 assault 的 body 有 13 套，按权重抽），它们是**一个整体**，界面归成一项「默认数据」，
      不拆成一件一件摆出来。所以这一版没有权重编辑。
   ② **衣柜里只有作者自己做的**（`/api/bots` 的 `wear`）。SPT 自带那 456 条根本不送到前端。
   ③ **四个部位各自独立**，允许混搭；但**有依赖关系的部位对不上就标红**（见 BDEPS）。

   ── 替换与恢复（对着真数据核过）────────────────────────────────
   替换：把该部位的字典**整个清空**，只写 `{"<我的id>": 1000000}`。权重压倒性大 = 100% 出这套。
   恢复：去 `/api/bots/default?type=<类型>` 拿 **SPT 原版**那份 appearance 写回去。
        **编辑器不用自己另存原池** —— `SPT_Data\database\bots\types\<类型>.json` 本来就是正本，
        实测它和模组 `CustomBotLoadouts` 里那份逐项一致（body 13 / feet 11 / hands 10 / head 5 / voice 6）。
   判断"这个部位现在是不是自制的"：拿它的 id 去 `wear` 里查。**不记状态、不存标记**，读文件就能算。

   ── 数据形状（对着 BinaryDimensionStore 的 34 条真数据确认，不是照文档抄的）──
   `wear` 一条 = 作者做的一件东西，`parts` 是它填哪几个槽：
     kind=top    → {body, hands}  ← **上装和手出自同一条记录**，所以它俩才有依赖
     kind=bottom → {feet}
     kind=head   → {head}
   ══════════════════════════════════════════════════════════════════ */

let BD = null;          /* /api/bots 的整包 */
let bcur = null;        /* 当前文件名，如 assault.json */
let bBase = "";         /* 上次载入/保存时的整包快照。判"脏"跟它比，不靠"渲染过就算改过" */
/* **每份文件各自的快照**。保存时拿它挑出"真改过的那几份"——
   一股脑把 40 份全送上去，服务端就会 40 份全重写、留下 40 个 .bak，
   作者的模组目录瞬间多出一堆噪音，还看不出到底动了哪个。 */
let bWas = {};
let bLoading = false;
let bTab = "body";      /* 右边看哪一页 == 左边哪一组点亮，同一个变量 */
let bq = "";            /* 搜索词 */
const bDef = {};        /* bot 类型 → 原版 appearance。拉回来就缓存，别每次恢复都问一遍服务端 */

/* 语音严格说不是"部位"，但作者只关心"我做的语音怎么装上去"，
   而它在 bot json 里的槽和别的部位同形（id → 权重）。所以一视同仁，不另开一套交互。 */
const BPARTS = ["head", "body", "hands", "feet", "voice"];
/* **有依赖关系的部位**：只换一边，游戏里会露出中空。以后发现新的成对关系只加这一行 */
const BDEPS = [["body", "hands"]];
/* 替换时写的权重。池子里只剩这一条，权重其实多少都行；写成压倒性大是双保险 */
const BW = 1000000;
/* 这一页的东西该放进 WTT 的哪个目录 —— 空态要告诉作者"做好之后放哪" */
const BDIR = { head: "CustomHeads", voice: "CustomVoices",
               body: "CustomClothing", hands: "CustomClothing", feet: "CustomClothing" };
const BMINE = { head: "b_mine_head", voice: "b_mine_voice" };

/* ── 小工具 ── */
const bsnap = () => JSON.stringify(BD?.files ?? null);
const bdirty = () => BD != null && bsnap() !== bBase;
/* 记一次"现在这份就是干净的"：整包快照 + 每份文件各自的快照 */
function bMark() {
  bBase = bsnap();
  bWas = {};
  for (const [k, v] of Object.entries(BD?.files || {})) bWas[k] = JSON.stringify(v);
}
/* 真改过的那几份。没动过的一份都不送 —— 服务端只写收到的文件 */
const bChanged = () => Object.fromEntries(
  Object.entries(BD?.files || {}).filter(([k, v]) => JSON.stringify(v) !== bWas[k]));
const bfile = () => (bcur && BD?.files?.[bcur]) || null;
const btype = f => (f || "").replace(/\.json$/i, "");
const bslot = k => bfile()?.appearance?.[k] || {};
const bwear = () => BD?.wear || [];
/* ⚠️ 服务端那份是大小写不敏感的集合，这里是 JS 的 includes（**大小写敏感**）。
   所以再兜一层：文件名大小写和 id 对不上也照样认得出来。 */
const bhas = id => !!id && (BD?.previews || []).some(p => p.toLowerCase() === String(id).toLowerCase());
const bimg = id => "/look?id=" + encodeURIComponent(id) + "&t=" + encodeURIComponent(TOK);
/* 这一格该拿哪张图，按优先级找三轮：
     ① 这个部位自己的外观 id
     ② 这条记录的 suiteId —— 一件上装的「身体」和「手」出自同一条记录，一张图管两格
     ③ **显示名** —— 文件名直接写角色名就行。一个角色在数据里是三条不相干的记录
        （上衣 / 下装 / 头），没有"角色 id"这种东西把它们串起来，唯一的线索就是名字。
        作者的第一反应本来就是拿角色名当文件名（真实发生过），工具该迎上去。

   ③ 的匹配规则：**大小写不敏感 ＋ 忽略空格**地做前缀比较，
   **多个文件都对得上时，取名字最长的那一个**（更具体的赢）。

   两条都是被真实数据逼出来的，别"简化"掉：
   · 忽略空格 —— 作者的文件名是 `MG4Damage.png`，而显示名是「MG4 Damaged JK Upper」
     ／「MG4战损校服 上衣」。要求空格对齐的话这张图一个都配不上。
   · 取最长 —— `MG4.png` 和 `MG4Damage.png` 同时存在时，「MG4 Damaged…」两个都对得上；
     不比长短的话**战损那套会套上普通那套的图**（真的发生过，Tech Leader 一眼看出来的）。

   代价（已认）：一个角色没有自己的图时，可能借用"名字是它前缀"的另一个角色的图 ——
   比如只有 `HK416.png` 时，`HK416YT`（可露凯云图）会跟着显示它。补上那个角色自己的图就好了，
   所以图片上挂了 title 提示"这张图是哪个文件"，鼠标一停就能核。 */
function bpic(id, w) {
  if (bhas(id)) return id;
  if (w && bhas(w.key)) return w.key;
  if (!w) return "";
  const flat = s => String(s).toLowerCase().replace(/\s+/g, "");
  const names = [w.zh, w.en].filter(Boolean).map(flat);
  let best = "";
  for (const p of BD?.previews || []) {
    const n = flat(p);
    if (n && n.length > flat(best).length && names.some(x => x.startsWith(n))) best = p;
  }
  return best;
}
const bwname = w => (lang === "zh" ? w.zh : w.en) || w.en || w.key;
/* 模组名。dir 是 …\mods\<模组>\db\CustomBotLoadouts，所以模组名在**倒数第三段** */
const bmod = () => (BD?.dir || "").split(/[\\/]/).filter(Boolean).slice(-3, -2)[0] || "—";

/* 这个部位现在装的是不是作者自己做的 —— 拿 id 去 wear 里查，查得到就是 */
function bcus(k) {
  for (const id of Object.keys(bslot(k))) {
    const w = bwear().find(x => x.parts[k] === id);
    if (w) return { id, w };
  }
  return null;
}
/* 这个部位的"来路"。判依赖一致就是比这个值：同一条记录 → 相等；一个自制一个默认 → 不等 */
const bref = k => bcus(k)?.w.key || "";
const bmix = () => BDEPS.filter(([a, b]) => bref(a) !== bref(b));
const bbad = k => bmix().some(p => p.includes(k));
const bwhat = k => { const c = bcus(k); return c ? bwname(c.w) : T("b_def"); };

/* ── 取数 ──
   两个回调分开写，不要 .then(…).catch(…)：那样渲染里抛的错会被当成"读取失败"，
   真正的错就永远看不见了（任务页那边被这个坑过半小时）。 */
function botLoad() {
  if (bLoading) return;
  bLoading = true;
  api("/api/bots").then(
    d => {
      BD = d;
      if (d.ok) {
        const names = Object.keys(d.files || {});
        if (!bcur || !d.files[bcur]) bcur = names[0] || null;
        bMark();
      }
    },
    e => { BD = { ok: false, error: String(e.message || e) }; }
  ).then(() => {
    bLoading = false;
    if (page === "cloth") render();
    /* 还没定内容库：探测到多个就弹窗让人挑，一个都没有就让人填路径（modroot.js） */
    if (modNeedPick(BD)) modPick(BD);
  });
}

/* ── 页面 ── */
function botPage() {
  if (!BD) { botLoad(); return bshell(`<div class="btempty">${T("b_loading")}</div>`); }
  if (!BD.ok) return bshell(`<div class="btempty">${T("b_nodb")}
    <button class="btx" id="bPickDb">${T("mr_pick")}</button></div>`);
  if (!bcur) return bshell(`<div class="btempty">${T("b_nobots")}</div>`);

  return bshell(`<div class="btwork">
    <section class="btbay">
      <div class="btbh"><b>${T("b_bay")}</b> BAY<span class="sp"></span>
        <em class="${bmix().length ? "btbad" : ""}">${TF("b_cnt_changed", bCusN(), BPARTS.length)}</em></div>
      ${bPort()}
      <div class="btslots">${bmix().map(bBand).join("")}${BPARTS.map(bGroup).join("")}</div>
    </section>
    <div class="btsplit"></div>
    <section class="btrobe">
      <div class="btbh"><b>${T("b_robe")}</b> WARDROBE · ${T("b_robe_note")}<span class="sp"></span>
        <em>${TF("b_cnt_avail", bRows().length)}</em></div>
      <div class="bttabs">${BPARTS.map(bTabBtn).join("")}</div>
      <div class="bttabline"></div>
      <div class="bttool"><input class="btq" id="bQ" placeholder="${T("b_search")}" value="${esc(bq)}">
        <span class="btchip" title="${esc(BD.dir || "")}">MOD · ${esc(bmod())}</span></div>
      <div class="btcards" id="bCards">${bCards()}</div>
      <div class="btwm">${bTab.toUpperCase()}</div>
    </section>
  </div>`);
}

const bCusN = () => BPARTS.filter(k => bcus(k)).length;

function bshell(inner) {
  const bad = (BD?.issues || []).filter(x => x.level === "err").length;
  const warn = (BD?.issues || []).length - bad;
  return `<div class="dlgwrap"><header class="hdr"><div class="slab"></div>
    <div class="tt"><i>// SEC.${secNo("cloth")}</i><h2>${T("nav_cloth")}</h2></div>
    <div class="cart">
      <div><k>BOT</k><v>${esc(bcur ? btype(bcur) : "—")}</v></div>
      <div><k>${T("b_changed")}</k><v class="${bmix().length ? "err" : bCusN() ? "tech" : ""}">${bCusN()} / ${BPARTS.length}</v></div>
      <div><k>MOD DB</k><v title="${esc(BD?.dir || "")}">${esc(bmod())}</v></div>
    </div>
    <div id="bars">${BPARTS.map(k =>
      /* e/t 是 index.html 内联样式里已有的两档（黄/青），红那档在 bot.css 里补 */
      `<i class="${bbad(k) ? "b" : bcus(k) ? "t" : ""}"></i>`).join("")}</div>
    <div class="btbar">
      <span class="btcount ${bad ? "btbad" : ""}">${TF("b_issues", bad, warn)}</span>
      <button class="btn ghost" id="bWho"><span>${T("b_choose")}</span></button>
      <button class="btn pri" id="bSave"><span>${T("b_save")}${bdirty() ? " *" : ""}</span></button>
    </div></header>
    <div class="tape ${bmix().length ? "bad" : ""}"></div>${inner}</div>`;
}

/* ── 立绘 ── */
/* 这一格**只画装配示意图，不找 BOT 图片**（Tech Leader 2026-08-11 决定）。
   理由：官方没多少 BOT 立绘可放，逼作者去凑图不如让这块一直显示真正有用的东西 ——
   四个部位各是什么状态、依赖对不对得上。图片能力只留给服装和头（那些是作者自己做的，本来就有图）。
   窗口本身保留：四角刻度、扫描线、类型名都还在。 */
function bPort() {
  return `<div class="btport">${bDummy()}
    <i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i>
    <span class="btpname">${esc(btype(bcur))}</span>
    <span class="btpfile">${T("b_dummy")}</span></div>`;
}

/* 装配示意图：没有立绘时顶上来的那张。是张规格图，不是占位画。
   人形本身报状态（红=依赖对不上 · 青=已换成你做的 · 灰虚线=还是默认），
   "当前在看哪个部位"只让引线和标签变黄 —— 让形体也跟着黄的话整张图会成一团黄。
   人形可以直接点：点哪块切到哪一页。 */
function bDummy() {
  const S = k => bbad(k) ? "#FF4242" : bcus(k) ? "#3FD0C9" : "#2A2F36";
  const F = k => bbad(k) ? "#2A1113" : bcus(k) ? "#12292B" : "#1A1D21";
  const D = k => bcus(k) || bbad(k) ? "" : ' stroke-dasharray="4 4"';
  const tag = k => bbad(k) ? T("b_mismatch") : bcus(k) ? T("b_iscus_s") : T("b_def_s");
  const lead = (k, x1, y, label) => {
    const c = k === bTab ? "#F2E205" : S(k);
    return `<path d="M${x1} ${y}H160" stroke="${c}" stroke-width="1" opacity=".85"/>
      <path d="M160 ${y - 4}v8" stroke="${c}" stroke-width="1"/>
      <text x="167" y="${y + 3.5}" fill="${c}" font-family="monospace" font-size="10"
        letter-spacing="1.4">${label} ${esc(tag(k))}</text>`;
  };
  const g = (k, shape) => `<g data-tab="${k}" style="cursor:var(--cur-p)">${shape}</g>`;
  return `<svg viewBox="0 0 240 356"><path d="M160 40V292" stroke="#23272E" stroke-width="1"/>
    ${g("head", `<circle cx="90" cy="48" r="28" fill="${F("head")}" stroke="${S("head")}"${D("head")}/>
      ${lead("head", 118, 48, "HEAD")}`)}
    ${/* 语音画在头和肩之间那块空地上（喇叭 + 一道声弧），不占别的部位的地盘 */""}
    ${g("voice", `<path d="M112 70h6l8-6v24l-8-6h-6z" fill="${F("voice")}" stroke="${S("voice")}"${D("voice")}/>
      <path d="M130 68a9 9 0 0 1 0 20" fill="none" stroke="${S("voice")}"${D("voice")}/>
      ${lead("voice", 141, 76, "VOICE")}`)}
    ${g("body", `<rect x="82" y="74" width="16" height="12" fill="${F("body")}" stroke="${S("body")}"${D("body")}/>
      <path d="M58 86h64l16 22-16 9v86H58v-86l-16-9z" fill="${F("body")}" stroke="${S("body")}"${D("body")}/>
      ${lead("body", 122, 140, "BODY")}`)}
    ${g("hands", `<rect x="34" y="102" width="20" height="84" fill="${F("hands")}" stroke="${S("hands")}"${D("hands")}/>
      <rect x="126" y="102" width="20" height="84" fill="${F("hands")}" stroke="${S("hands")}"${D("hands")}/>
      ${lead("hands", 146, 176, "HANDS")}`)}
    ${g("feet", `<path d="M60 206h60l-7 116H94l-4-72-4 72H67z" fill="${F("feet")}" stroke="${S("feet")}"${D("feet")}/>
      ${lead("feet", 116, 280, "BOTTOM")}`)}
  </svg>`;
}

/* ── 占位美术 ──
   有预览图就画图；没有就画这个部位的形状。**一律石墨灰阶**：
   黄留给"当前/主操作"，青留给边框和芯片，往画面里掺色会像衣服上贴了块补丁。 */
const bArt = (id, k, w) => bDraw(bpic(id, w), id, k);

function bDraw(pic, id, k) {
  /* 挂上"这张图是哪个文件"：名字匹配是有可能配错的（见 bpic 的说明），
     鼠标一停就能核，比让人回去数 previews 目录强 */
  if (pic) return `<img src="${bimg(pic)}" alt="" loading="lazy" title="${esc(TF("b_pic_from", pic))}">`;
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const tone = ["#2C323A", "#333A43", "#3B434D"][h % 3];
  /* 明度按 id 散开 —— 全用同一个灰的话一屏卡片长得一模一样，看着就"单调" */
  const hot = ["#6E7783", "#7E8792", "#8C95A0"][(h >> 3) % 3];
  const P = {
    head: `<circle cx="50" cy="46" r="21" fill="${hot}"/><path d="M29 46a21 21 0 0 1 42 0z" fill="#99A2AD"/>
      <rect x="40" y="67" width="20" height="10" fill="${tone}"/>`,
    body: `<path d="M32 26h36l8 12-8 6v34H32V44l-8-6z" fill="${hot}"/><path d="M44 26h12v9H44z" fill="#99A2AD"/>`,
    hands: `<rect x="18" y="34" width="24" height="34" fill="${hot}"/>
      <rect x="58" y="34" width="24" height="34" fill="${tone}"/><rect x="18" y="30" width="24" height="6" fill="#99A2AD"/>`,
    feet: `<path d="M36 22h28l-4 46h-8l-2-27-2 27h-8z" fill="${hot}"/>
      <rect x="30" y="68" width="18" height="9" fill="#99A2AD"/><rect x="52" y="68" width="18" height="9" fill="#99A2AD"/>`,
    /* 语音没有图可放（作者手里也不会有"声音的截图"），画一段声波 —— 高低按 id 散开，条条不一样 */
    voice: [22, 34, 46, 58, 70].map((x, i) => {
      const h = 8 + ((id.charCodeAt(id.length - 1 - i) || 65) % 5) * 7;
      return `<rect x="${x}" y="${50 - h}" width="8" height="${h * 2}" fill="${i % 2 ? tone : hot}"/>`;
    }).join("") + `<rect x="14" y="46" width="72" height="2" fill="#99A2AD" opacity=".5"/>`,
  };
  /* 卡片是 3:4 的竖幅，slice 会把左右各切掉一点 —— id 从 x=16 起画才不会被切掉 */
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <rect width="100" height="100" fill="#1B1E23"/>
    <path d="M0 100L100 0M-20 100L100 -20M0 120L120 0" stroke="rgba(255,255,255,.03)" stroke-width="6"/>
    ${/* 截**尾**不截头：WTT 生成的 id 形如 66cb0100…0012，前 8 位条条一样，截头等于没显示 */""}
    ${P[k]}<text x="16" y="94" fill="#454C55" font-family="monospace" font-size="7">${esc(id.slice(-8))}</text></svg>`;
}

/* ── 依赖对不上时的红条：说清**是哪两个 · 为什么 · 现在各是什么**，不是一句"不匹配" ── */
function bBand([a, b]) {
  /* 类名是 btband 不是 btwarn —— btwarn 在老样式里是"橙色文字"，这里要的是整块红条 */
  return `<div class="btband"><b>／／ ${TF("b_dep_bad", T("b_s_" + a), T("b_s_" + b))}</b>
    ${T("b_dep_why")}<br>
    <u>${TF("b_dep_now", T("b_s_" + a), esc(bwhat(a)), T("b_s_" + b), esc(bwhat(b)))}</u></div>`;
}

/* ── 一个部位一组，组里只有一个图标 ── */
function bGroup(k) {
  const c = bcus(k), bad = bbad(k), n = Object.keys(bslot(k)).length;
  const other = bad ? (BDEPS.flat().find(x => x !== k && bbad(x)) || "") : "";
  return `<section class="btgrp ${k === bTab ? "on " : ""}${bad ? "bad " : ""}${c ? "cus" : ""}">
    <button class="btgh" data-tab="${k}"><b>${T("b_s_" + k)}</b><i>${k.toUpperCase()}</i>
      <span class="sp"></span><u>${bad ? T("b_mismatch") : esc(bwhat(k))}</u></button>
    <div class="btpart">
      ${c ? `<div class="bttile cus">${bArt(c.id, k, c.w)}</div>`
          : `<div class="bttile def">${bArt("default_" + k, k)}<b>${TF("b_def_badge", n)}</b></div>`}
      <div class="btwhat">${c
        ? `<b>${esc(bwname(c.w))}</b><i>${esc(c.id)}</i>`
        : `<b>${T("b_def")}</b><i>${TF("b_def_d", n)}</i>`}</div>
    </div>
    <div class="btacts"><em class="${bad ? "btbad" : ""}">${
      bad ? TF("b_mismatch_with", T("b_s_" + other)) : c ? T("b_iscus") : T("b_keep")}</em>
      <span class="sp"></span>
      ${c ? `<button class="btn ghost sm" data-def="${k}"><span>${T("b_restore")}</span></button>` : ""}
      <button class="btn ghost sm" data-tab="${k}"><span>${c ? T("b_change_one") : T("b_pick_one")}</span></button>
    </div></section>`;
}

/* ── 右边：页签 + 卡片 ── */
function bTabBtn(k) {
  return `<button class="bttab ${k === bTab ? "on" : ""}" data-tab="${k}">${T("b_s_" + k)}
    <i>${k.toUpperCase()} ${bRows(k).length}</i>${bbad(k) ? "<s></s>" : ""}</button>`;
}

/* 这一页能挑的东西。身体和手来自同一批 kind=top 的记录，各取其中一个 id */
function bRows(k) {
  const slot = k || bTab, q = bq.trim().toLowerCase();
  return bwear().filter(w => w.parts[slot])
    .filter(w => !q || (w.zh + w.en + w.parts[slot]).toLowerCase().includes(q));
}

function bCards() {
  const rows = bRows();
  if (!rows.length) return `<div class="btnone"><b>${T("b_empty")}</b>${
    bq ? T("b_nohit") : TF("b_empty_d", T("b_s_" + bTab), BDIR[bTab])}</div>`;
  /* 配图说明挂在**还缺图的时候**：全配齐了它自己就消失，不会变成一条永远杵在那儿的废话。
     （原来这条挂在「选 BOT」弹窗里 —— BOT 不再配图之后，那儿就不是它该待的地方了） */
  const gap = rows.filter(w => !bpic(w.parts[bTab], w)).length;
  return `<div class="btsec">${T(BMINE[bTab] || "b_mine")}<u>${rows.length}</u></div>`
    + rows.map(bCard).join("")
    + (gap ? `<div class="btfoot">${TF("b_prev_hint", gap, esc(BD.previewDir || ""))}</div>` : "");
}

/* 点卡片 = 只换当前这一个部位；点右下角「整套」= 这条记录带的部位一起换 */
function bCard(w) {
  const id = w.parts[bTab], on = bref(bTab) === w.key;
  const ks = Object.keys(w.parts);
  const many = ks.length > 1;                       /* 只有一个部位的记录，「整套」没有意义 */
  const allOn = many && ks.every(k => bref(k) === w.key);
  return `<div class="btcw"><button class="btcard${on ? " on" : ""}${many ? " has-all" : ""}"
      data-pick="${esc(w.key)}">
    <span class="btbig">${bArt(id, bTab, w)}
      <i class="btact">${on ? T("b_hint_on") : TF("b_hint_pick", T("b_s_" + bTab))}</i></span>
    <span class="btsrc">${T("b_s_" + bTab)}</span><span class="btok">${T("b_inuse")}</span>
    <span class="btcap"><b>${esc(bwname(w))}</b><i>${esc(id)}</i>
      ${many ? `<i>${TF("b_this_suit", ks.map(x => T("b_s_" + x)).join(" + "))}</i>` : ""}</span>
  </button>${many ? `<button class="btall${allOn ? " on" : ""}" data-all="${esc(w.key)}">
    ${allOn ? T("b_all_on") : T("b_all")}</button>` : ""}</div>`;
}

/* ── 接线 ──
   每次重画都要重接：innerHTML 一换，上一批监听器就跟着元素一起没了。
   （别攥 e.currentTarget 留着以后用 —— 出了事件派发期它就是 null） */
function wireBot() {
  hide();                                   /* 从对话页切过来时那个「打开」浮层可能还开着 */
  document.querySelectorAll("[data-tab]").forEach(el =>
    el.onclick = () => { bTab = el.dataset.tab; render(); });
  document.querySelectorAll("[data-pick]").forEach(el =>
    el.onclick = () => bPut(bTab, el.dataset.pick));
  document.querySelectorAll("[data-all]").forEach(el =>
    el.onclick = () => bPutAll(el.dataset.all));
  document.querySelectorAll("[data-def]").forEach(el =>
    el.onclick = () => bBack(el.dataset.def));
  const q = $("bQ");
  if (q) q.oninput = () => {
    bq = q.value;
    /* 只重画卡片区：整页重渲染会把输入框连同焦点和光标一起换掉 */
    $("bCards").innerHTML = bCards();
    wireBot();
    $("bQ").focus();
  };
  const who = $("bWho"); if (who) who.onclick = bWhoPick;
  const sv = $("bSave"); if (sv) sv.onclick = () => bPost(false);
  const pk = $("bPickDb"); if (pk) pk.onclick = () => modPick(BD);
}

/* ── 改数据 ──
   替换：该部位**整个换成**只有一件、权重 1000000 的字典。
   留着原来那一池再加一条的话，游戏照样有几率抽到原版的，作者会以为"没生效"。 */
function bSet(k, dict) {
  const f = bfile(); if (!f) return;
  f.appearance = f.appearance || {};
  f.appearance[k] = dict;
  render();
}
const bPut = (k, key) => {
  const w = bwear().find(x => x.key === key);
  if (w?.parts?.[k]) bSet(k, { [w.parts[k]]: BW });
};
/* 「整套」：这条记录带的部位一起换。它没带的部位**不动**，不拿空 id 去覆盖 */
function bPutAll(key) {
  const w = bwear().find(x => x.key === key); if (!w) return;
  const f = bfile(); if (!f) return;
  f.appearance = f.appearance || {};
  for (const [k, id] of Object.entries(w.parts)) f.appearance[k] = { [id]: BW };
  render();
}

/* 恢复默认：去拿 SPT 原版那份 appearance 写回来。编辑器不存原池，正本在游戏数据里 */
async function bBack(k) {
  const t = btype(bcur);
  if (!bDef[t]) {
    const d = await api("/api/bots/default?type=" + encodeURIComponent(t)).catch(e => ({ error: e.message }));
    /* 「游戏数据没找到」和「游戏里没这个 bot」要分开说：前者是编辑器没认出游戏目录，
       后者才是文件名的问题。报成同一句，作者会去改一个本来没错的名字。 */
    if (!d?.ok) return say(d.error === "no_spt_data"
      ? T("b_restore_nospt")
      : TF("b_restore_fail", esc(t), String(d?.error || "")));
    bDef[t] = d.appearance || {};
  }
  bSet(k, bDef[t][k] || {});
}

/* ── 选 BOT ── */
function bWhoPick() {
  bq = "";
  bModal(T("b_choose"), bWhoHtml, close => {
    document.querySelectorAll("[data-bot]").forEach(el =>
      el.onclick = () => { bcur = el.dataset.bot; close(); render(); });
    const nb = $("bNew"); if (nb) nb.onclick = () => { close(); bNew(); };
  });
}

function bWhoHtml() {
  const q = bq.trim().toLowerCase();
  const rows = Object.keys(BD.files || {}).filter(n => !q || btype(n).includes(q)).map(n => {
    const t = btype(n);
    const bad = (BD.issues || []).some(x => x.questId === n && x.level === "err");
    return `<button class="btrow ${n === bcur ? "on" : ""} ${bad ? "warn" : ""}" data-bot="${esc(n)}">
      ${/* BOT 不配图，这里一律画头的示意图标（图片能力只留给作者自己做的服装和头） */""}
      <span class="bttile">${bDraw("", t, "head")}</span>
      <b>${esc(t)}</b><i>${bad ? "!" : ""}</i></button>`;
  }).join("");
  return `<input class="btq" id="bQ2" placeholder="${T("b_search_bot")}" value="${esc(bq)}">
    <div class="btlist">${rows || `<div class="btempty">${T("b_nohit")}</div>`}</div>
    <div class="mdacts" style="padding:0;margin-top:.5rem">
      <button class="btn pri" id="bNew"><span>＋ ${T("b_newbot")}</span></button></div>`;
}

/* 弹窗壳：复用 .mdwrap/.mdbox 那套皮，和别处一致 */
function bModal(title, body, wire) {
  const w = document.createElement("div");
  w.className = "mdwrap";
  w.innerHTML = `<div class="mdbox btbox">
    <div class="mdhead"><span class="slab"></span>${esc(title)}</div>
    <div class="mdbody" id="bMd">${body()}</div>
    <div class="mdacts"><button class="btn ghost" id="bMdX"><span>${T("md_cancel")}</span></button></div>
  </div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener("keydown", key, true); };
  const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", key, true);
  $("bMdX").onclick = close;
  w.onmousedown = e => { if (e.target === w) close(); };
  /* 搜索只换内容区，不重建整个弹窗 —— 重建会把焦点和光标位置弄丢 */
  const paint = () => {
    $("bMd").innerHTML = body();
    const q = $("bQ2");
    if (q) {
      q.oninput = () => { bq = q.value; paint(); const n = $("bQ2"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
      q.focus();
    }
    wire(close);
  };
  paint();
}

/* ── 新建 ──
   必须从 SPT 真实的 bot 类型里挑：WTT 拿文件名直接查表，表的 key 全小写，
   名字写错它只 log 一句就跳过 —— 服务端一个错都不报，作者只会觉得"配了没生效"。 */
async function bNew() {
  const have = new Set(Object.keys(BD.files || {}).map(btype));
  const left = (BD.botTypes || []).filter(t => !have.has(t));
  if (!left.length) return say(T("b_alltypes"));
  const t = await ask(TF("b_newask", left.length), left[0]);
  if (t == null) return;
  const name = String(t).trim().toLowerCase();
  if (!(BD.botTypes || []).includes(name)) return say(TF("b_badtype", esc(name)));
  BD.files[name + ".json"] = { appearance: {} };
  bcur = name + ".json";
  render();
}

/* ── 保存 ── */
function bPost(force) {
  if (!BD?.ok) return;
  api("/api/bots", {
    method: "POST", headers: { "Content-Type": "application/json" },
    /* **只送改过的那几份。** 服务端只写它收到的文件，所以没动过的那些连时间戳都不会变，
       也不会平白多出一堆 .bak */
    body: JSON.stringify({ stamp: BD.stamp, force, files: bChanged() }),
  }).then(d => {
    BD.stamp = d.stamp; BD.issues = d.issues;
    /* 服务端可能刚删掉一份空配置，界面得跟上，否则下次保存又给它送一遍 */
    for (const k of Object.keys(BD.files)) if (!(d.files || []).includes(k)) delete BD.files[k];
    if (bcur && !BD.files[bcur]) bcur = Object.keys(BD.files)[0] || null;
    bMark();
    render();
  }).catch(async e => {
    /* 409：文件在编辑器外面被改过了。别默默盖掉，让人自己选 */
    if (String(e.message || "").includes("stale")) {
      const go = await confirm2(T("b_stale"), T("nav_cloth"));
      if (go) bPost(true); else botLoad();
      return;
    }
    say(TF("b_savefail", String(e.message || e).slice(0, 80)));
  });
}
