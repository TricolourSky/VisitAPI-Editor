
  /* ── 对话挂接页 ── */
  for(let i=0;i<40&&!QL;i++)await wait(100);
  ok("挂接数据拉到了", QL&&QL.ok===true, QL&&(QL.links||[]).length+" 条");
  ok("画布上标出有对话入口的任务", document.querySelectorAll(".qnode .dlgtag").length===5,
     document.querySelectorAll(".qnode .dlgtag").length+" / 5");

  /* 换到「SORA 的补给」，它挂了 5 条 + 1 个触发点 */
  qcur="5043a1ce90726f6a536f7286"; qpane="link"; render(); await wait(60);
  ok("四个页签", document.querySelectorAll("[data-pane]").length===4,
     [...document.querySelectorAll("[data-pane]")].map(b=>b.textContent.trim()).join("/"));
  ok("挂接页列出 5 条", document.querySelectorAll(".trow.link").length===5);
  ok("挂接页列出 1 个触发点", document.querySelectorAll(".trow.trig").length===1,
     document.querySelector(".trow.trig .tt").textContent.replace(/\s+/g," ").trim());
  ok("触发点不给 ⋮（它在 .dlg 头部不在选项上）", document.querySelector(".trow.trig .dots")===null);
  ok("按接取/交付/改状态分了组", document.querySelectorAll(".tsec h5").length===4,
     [...document.querySelectorAll(".tsec h5")].map(h=>h.textContent).join("/"));

  /* 挂一条新的：接取组的 ＋ → 选 C5 → 选它的第一个选项，两步就完事 */
  const n0=QL.links.filter(l=>l.questId===qcur).length;
  document.querySelector('[data-add="link:accept"]').click(); await wait(30);
  ok("第 1 步列出节点", /选节点|pick a node/.test(document.getElementById("pop").textContent));
  pick("<C5>"); await wait(30);
  ok("第 2 步列出该节点的选项", /C5/.test(document.getElementById("pop").textContent));
  pick("行，我现在出发"); await wait(600);
  ok("挂上了（且落了盘）", QL.links.filter(l=>l.questId===qcur).length===n0+1,
     QL.links.filter(l=>l.questId===qcur).map(l=>l.action+"@"+l.node).join(","));
  ok("界面跟着多一行", document.querySelectorAll(".trow.link").length===6);

  /* 摘掉 */
  const row=[...document.querySelectorAll("[data-unlink]")].find(b=>b.dataset.unlink.includes("|C5|"));
  ok("找得到那条的 ⋮", !!row);
  row.click(); await wait(30); pick("解除"); await wait(600);
  ok("摘掉了", QL.links.filter(l=>l.questId===qcur).length===n0);

  /* 挂接页的中英化 */
  lang="en"; applyStatic(); render(); await wait(60);
  ok("挂接页切英文没有裸键", !/\bq_[a-z_]+/.test(document.querySelector(".main").textContent),
     (document.querySelector(".main").textContent.match(/q_[a-z_]+/)||[])[0]||"");
  ok("挂接页英文标题对", /Dialogue/.test([...document.querySelectorAll("[data-pane]")][1].textContent));
  lang="zh"; applyStatic(); render(); await wait(60);
