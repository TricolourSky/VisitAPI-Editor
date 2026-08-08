
  /* ── 任务链图：从"只能看"到"能改" ── */
  qpane="card"; render(); await wait(60);
  const mev=(t,el,o)=>{const r=el.getBoundingClientRect();
    return new MouseEvent(t,Object.assign({clientX:r.left+r.width/2,clientY:r.top+r.height/2,
      bubbles:true,cancelable:true,buttons:1},o));};
  const node=id=>document.querySelector(`.qnode[data-q="${id}"]`);
  const A="72616d736f72617175657301";                 /* 失踪的补给（LV.0，没有前置） */
  const B="5043a1ce90726f6a536f7261";                 /* SORA 的新据点（也是 LV.0） */

  ok("工具栏有新建/删除/只看链/归位", ["qNew","qDel","qChain","qfit"].every(i=>document.getElementById(i)));

  /* 拖连线：从 A 的出口方块拖到 B 上 → B 需要先完成 A */
  const before=qprereq(B).length;
  const sock=node(A).querySelector(".qsock");
  sock.dispatchEvent(mev("mousedown",sock));
  window.dispatchEvent(mev("mousemove",node(B)));
  ok("拖的时候画了橡皮筋", document.querySelectorAll("#qedges path[stroke-dasharray]").length===1);
  node(B).dispatchEvent(mev("mouseup",node(B)));
  await wait(60);
  ok("拖连线加出了前置", qprereq(B).includes(A), qprereq(B).join(","));
  ok("加的是 Quest 条件不是别的",
     (QD.quests[B].conditions.AvailableForStart||[]).some(c=>c.conditionType==="Quest"&&c.target===A));
  ok("橡皮筋松手后清掉了", document.querySelectorAll("#qedges path[stroke-dasharray]").length===0);
  ok("层级跟着重算（B 从 LV.0 挪到 LV.1）", qlayout().pos[B].x>qlayout().pos[A].x,
     "A.x="+qlayout().pos[A].x+" B.x="+qlayout().pos[B].x);

  /* 环要拦住：现在 B 需要 A，再想让 A 需要 B 就是环 */
  const s2=node(B).querySelector(".qsock");
  s2.dispatchEvent(mev("mousedown",s2));
  window.dispatchEvent(mev("mousemove",node(A)));
  node(A).dispatchEvent(mev("mouseup",node(A)));
  await wait(60);
  ok("成环被拦住", !qprereq(A).includes(B), qprereq(A).join(",")||"（空）");
  ok("拦住时给了提示", /环|loop/.test(document.getElementById("qsaved").textContent),
     document.getElementById("qsaved").textContent);

  /* 自己连自己也要拦 */
  const s3=node(A).querySelector(".qsock");
  s3.dispatchEvent(mev("mousedown",s3));
  node(A).dispatchEvent(mev("mouseup",node(A)));
  await wait(60);
  ok("自己不能当自己的前置", !qprereq(A).includes(A));

  /* 撤掉刚加的那条：走任务卡的接取条件行 */
  qcur=B; qpane="card"; render(); await wait(60);
  const gateDots=[...document.querySelectorAll('[data-menu="gate"]')];
  gateDots[gateDots.length-1].click(); await wait(20); pick("删除"); await wait(60);
  ok("从接取条件里撤掉前置", !qprereq(B).includes(A), qprereq(B).join(",")||"（空）");

  /* 只看这条链 */
  qcur=A; render(); await wait(40);
  document.getElementById("qChain").click(); await wait(60);
  ok("只看这条链会把无关的压暗", document.querySelectorAll(".qnode.dim").length>0,
     document.querySelectorAll(".qnode.dim").length+" 张被压暗");
  ok("链上的自己不被压暗", !node(A).classList.contains("dim"));
  document.getElementById("qChain").click(); await wait(60);
  ok("再点一下恢复", document.querySelectorAll(".qnode.dim").length===0);

  /* 新建任务 */
  const n1=Object.keys(QD.quests).length;
  document.getElementById("qNew").click(); await wait(30);
  pick("ragman_courier.json"); await wait(30);
  pick("Prapor"); await wait(60);
  ok("新建了一个任务", Object.keys(QD.quests).length===n1+1);
  ok("新任务的 id 合法", /^[0-9a-f]{24}$/.test(qcur), qcur);
  ok("新任务两种语言都有占位文案",
     (QD.locales.ch[qcur+" name"]||"").length>0 && (QD.locales.en[qcur+" name"]||"").length>0);
  ok("新任务显示在图上", !!node(qcur));
  ok("新任务归到选的文件", QD.owner[qcur]==="ragman_courier.json", QD.owner[qcur]);

  /* 删除任务（新建的那个），顺便验证引用清理 */
  const victim=qcur;
  QD.quests[A].conditions.AvailableForStart.push({conditionType:"Quest",id:NEWID(),
    target:victim,status:[4],dynamicLocale:false,visibilityConditions:[]});
  window.confirm=()=>true;                            /* 无头环境没人点确认 */
  document.getElementById("qDel").click(); await wait(60);
  ok("删掉了", !QD.quests[victim]);
  ok("别的任务里指向它的前置被清掉", !qprereq(A).includes(victim), qprereq(A).join(",")||"（空）");
  ok("它的文案也清掉了", !QD.locales.ch[victim+" name"]&&!QD.locales.en[victim+" name"]);
  ok("删完提示说清了清理数量", /1/.test(document.getElementById("qsaved").textContent),
     document.getElementById("qsaved").textContent);

  /* 跨文件跳转：点挂接行 → 落到对话编辑器的那个节点 */
  qcur="5043a1ce90726f6a536f7286"; qpane="link"; render(); await wait(80);
  const go=document.querySelector('[data-goto]');
  ok("挂接行可以点着跳", !!go, go&&go.dataset.goto);
  const want=go.dataset.goto.split("|")[1];
  go.click();
  for(let i=0;i<40&&(page!=="dlg"||cur!==want);i++)await wait(100);
  ok("跳到了对话编辑器", page==="dlg", page);
  ok("而且直接停在那个节点上", cur===want, "cur="+cur+" 期望="+want);
  ok("打开的是对的文件", (filePath||"").includes(".dlg"), filePath);
  page="quest"; render(); await wait(60);
