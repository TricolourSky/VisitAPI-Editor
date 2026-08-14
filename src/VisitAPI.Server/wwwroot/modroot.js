/* ══════════════════════════════════════════════════════════════════
   内容库选择器 —— BOT 外观（SEC.02）和商人货架（SEC.05）共用。
   跑在 index.html 的内联脚本之后，用它的全局：T / TF / api / $ / esc / render / page。

   "内容库" = BOT 外观和商人货架住的那个模组 db 目录，和任务库各走各的
   （作者可能给 A 模组写任务、同时编 B 模组的商人）。

   自动探测的规矩（Tech Leader 2026-08-10 定）：
     恰好 1 个  → 服务端启动时直接选好，不打扰人
     2 个以上   → 这里弹窗让他挑
     一个都没有 → 同一个弹窗，只是没有候选行，只剩"自己填路径"

   ⚠️ 探测按**标志目录**认（CustomBotLoadouts / assort.json / CustomClothing…），不按模组名认。
   写死 "BinaryDimension" 之类的名字只对一个人有用；这些约定是 WTT 定的，
   任何照它写的模组——包括作者自己新建的——都会被认出来。
   ══════════════════════════════════════════════════════════════════ */

/* 服务端说"还没定内容库"时的回包长这样：{ok:false, need:"pick", found:[…]} */
const modNeedPick = d => !!d && d.ok === false && d.need === "pick";

let modPicking = false;      /* 防止两个模块同时弹两层窗 */

/**
 * 弹窗让作者选一个内容库。选定后写回服务端并重新渲染当前页。
 * @param {object} d /api/bots 或 /api/assort 返回的那个 need:"pick" 回包
 */
async function modPick(d) {
  if (modPicking) return;
  modPicking = true;
  try {
    const found = d.found || [];
    const rows = found.map((f, i) => `<button class="mrrow" data-mr="${i}">
        <b>${esc(f.mod)}</b>
        <i>${modWhat(f)}</i>
        <span>${esc(f.path)}</span></button>`).join("");
    const w = document.createElement("div");
    w.className = "mdwrap";
    w.innerHTML = `<div class="mdbox mrbox">
      <div class="mdhead"><span class="slab"></span>${T("mr_title")}</div>
      <div class="mdbody">
        <div class="mrlede">${found.length ? TF("mr_found", found.length) : T("mr_none")}</div>
        ${rows ? `<div class="mrlist">${rows}</div>` : ""}
        <div class="mrown">${T("mr_own")}</div>
      </div>
      <input id="mrIn" class="mdin" value="${esc(modGuess(d))}">
      <div class="mdacts">
        <button class="btn ghost" id="mrCancel"><span>${T("md_cancel")}</span></button>
        <button class="btn pri" id="mrOk"><span>${T("md_ok")}</span></button>
      </div></div>`;
    document.body.appendChild(w);

    const chosen = await new Promise(res => {
      const done = v => { w.remove(); document.removeEventListener("keydown", key, true); res(v); };
      const key = e => {
        if (e.key === "Escape") { e.stopPropagation(); done(null); }
        if (e.key === "Enter") { e.preventDefault(); done($("mrIn").value); }
      };
      document.addEventListener("keydown", key, true);
      /* 点候选行＝当场选中它，不用再按一次确定 —— 探测出来的路径不该还要人复制粘贴 */
      w.querySelectorAll("[data-mr]").forEach(b => b.onclick = () => done(found[+b.dataset.mr].path));
      $("mrOk").onclick = () => done($("mrIn").value);
      $("mrCancel").onclick = () => done(null);
      w.onmousedown = e => { if (e.target === w) done(null); };
      const i = $("mrIn"); if (i) { i.focus(); i.select(); }
    });

    if (!chosen) return;
    const r = await api("/api/mods", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: chosen }),
    }).catch(() => null);
    if (!r || !r.ok) { await say(TF("mr_bad", chosen)); return; }
    /* 换了库，两个模块的缓存都得作废，否则切过去看到的还是上一个库的东西 */
    BD = null; AD = null; ATPL = {};
    render();
  } finally { modPicking = false; }
}

/* 这一条候选里有些什么，直接写出来 —— 光看路径分不出哪个是作者要编的那个 */
function modWhat(f) {
  const p = [];
  if (f.bots) p.push(TF("mr_n_bots", f.bots));
  if (f.assorts) p.push(TF("mr_n_assort", f.assorts));
  if (f.looks) p.push(T("mr_n_looks"));
  return p.join(" · ");
}

/* 输入框的起手值：有候选就填第一条，没有就填到 user\mods 为止，让人接着往下打 */
function modGuess(d) {
  if (d.found && d.found.length) return d.found[0].path;
  return d.eft ? d.eft + "\\SPT_Runtime\\user\\mods\\" : "";
}
