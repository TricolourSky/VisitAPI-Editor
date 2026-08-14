/* ══════════════════════════════════════════════════════════════════
   还原备份（SEC.06）—— 四张卡对应 服装修改 / 对话编辑 / 任务编辑 / 商人售卖。
   跑在 index.html 的内联脚本之后，直接用它的全局：
   T / TF / api / $ / esc / say / confirm2 / secNo / render / page / lang。

   编辑器每次覆盖 / 删除前都会留同名 .bak（只留最近一代），这一页是它的出口。
   **还原＝对调**：.bak 和现役文件互换，点错了再点一次就换回去 ——
   「不默默覆盖」的老口径在这一页的形态。现役已删的那种，还原＝复活，备份随之用掉。
   ══════════════════════════════════════════════════════════════════ */

let BK = null, bkLoading = false;

/* 四张卡对应侧栏四个模块；任务卡把任务文件和中英文案并在一起（都住任务库），
   货架卡把单商人 assort.json 和 WTT 的 CustomAssortSchemes 并在一起（都住内容库）。
   root 指向 /api/backup 的 roots 里那个开关，界面靠它区分「没备份」和「目录压根没设置」。 */
const BKSECS = [
  { k: "nav_cloth",  areas: ["bot"],              root: "mod"   },
  { k: "nav_dlg",    areas: ["dlg"],              root: "root"  },
  { k: "nav_quest",  areas: ["quest", "locale"],  root: "quest" },
  { k: "nav_assort", areas: ["assort", "scheme"], root: "mod"   },
];

function bkLoad() {
  if (bkLoading) return;
  bkLoading = true;
  api("/api/backup").then(d => { BK = d; }).catch(e => { BK = { error: e.message }; })
    .then(() => { bkLoading = false; if (page === "back") render(); });
}

const bkTime = t => new Date(t).toLocaleString(lang === "zh" ? "zh-CN" : "en-GB",
  { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function bkCard(sec) {
  const rows = sec.areas.flatMap(a => ((BK.areas || {})[a] || []).map(e => ({ ...e, area: a })));
  const noDir = !(BK.roots || {})[sec.root];
  const body = noDir ? `<div class="bkempty">${T("bk_nodir")}</div>`
    : rows.length === 0 ? `<div class="bkempty">${T("bk_none")}</div>`
    : rows.map(e => `<div class="bkrow${e.live ? "" : " gone"}">
        <b title="${esc(e.name)}">${esc(e.name.slice(0, -4))}</b>
        <i>${bkTime(e.time)}</i>
        <em>${T(e.live ? "bk_s_swap" : "bk_s_gone")}</em>
        <button data-bk="${e.area}|${esc(e.name)}" data-live="${e.live ? 1 : 0}">${T("bk_do")}</button>
      </div>`).join("");
  return `<div class="card"><div class="chead">${T(sec.k)}<span>${rows.length || ""}</span></div>
    <div class="bklist">${body}</div></div>`;
}

function backPage() {
  if (!BK) { bkLoad(); return `<div class="bkwrap"><div class="bkempty">…</div></div>`; }
  /* ⚠️ 容器别用 .setwrap——那是设置页的窄栏，四张卡挤进去会缩成屏幕左边一根柱子、
     右边大片空着（Tech Leader 一眼打回）。这页自己的 .bkwrap 铺满全宽，四栏并排。 */
  return `<div class="bkwrap">
    <div class="secline"><div class="slab"></div>
      <div><h1>${T("nav_back")}</h1><div class="lede">// SEC.${secNo("back")} · ${T("bk_lede")}</div></div>
      <div class="rule"></div></div>
    <div class="card note"><div class="row"><div class="lbl"><span>${T("bk_intro")}</span></div></div></div>
    <div class="bkgrid">${BKSECS.map(bkCard).join("")}</div></div>`;
}

function wireBack() {
  document.querySelectorAll("[data-bk]").forEach(b => b.onclick = async () => {
    const cut = b.dataset.bk.indexOf("|");
    const area = b.dataset.bk.slice(0, cut), name = b.dataset.bk.slice(cut + 1);
    const disp = name.slice(0, -4);
    if (!await confirm2(TF(+b.dataset.live ? "bk_ask" : "bk_ask_gone", disp))) return;
    api("/api/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area, name }) })
      .then(() => { say(TF("bk_done", disp)); BK = null; render(); })
      .catch(e => say(TF("bk_fail", e.message)));
  });
}
