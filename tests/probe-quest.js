<script>
/* 任务编辑器的端到端自测：在真页面上点真按钮，最后把结果塞进 #PROBE */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).slice(0,70)+"]":""));
/* 页面里任何没接住的错都记下来，否则渲染炸了只会看到一堆莫名其妙的 FAIL */
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
addEventListener("unhandledrejection",e=>L.push("REJECT "+(e.reason&&e.reason.message||e.reason)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const pop=()=>document.getElementById("pop");
const pick=t=>{const b=[...pop().querySelectorAll("[data-a]")].find(x=>x.textContent.includes(t));
  if(!b)throw new Error("菜单里没有 "+t+"：["+[...pop().querySelectorAll("[data-a]")].map(x=>x.textContent.trim()).join(" / ")+"]");
  b.click();};
(async()=>{
try{
  /* 切到任务页，等数据回来 */
  page="quest"; render();
  for(let i=0;i<40&&!QD;i++)await wait(100);
  for(let i=0;i<40&&QD&&!document.querySelector(".qnode");i++)await wait(100);

  ok("任务库读到了", QD&&QD.ok===true, QD&&QD.dir);
  ok("5 个任务", Object.keys(QD.quests).length===5, Object.keys(QD.quests).length);
  ok("零校验问题", (QD.issues||[]).length===0, (QD.issues||[]).map(e=>e.code).join(","));
  ok("商人表", (QD.traders||[]).length>=10, (QD.traders||[]).length);
  ok("地图表含塔科夫街区", (QD.maps||[]).some(m=>m.id==="5714dc692459777137212e12"));

  /* 页面骨架 */
  ok("四个页签", document.querySelectorAll("[data-pane]").length===4,
     [...document.querySelectorAll("[data-pane]")].map(b=>b.textContent.trim()).join("/"));
  ok("五个消息页签", document.querySelectorAll("[data-msg]").length===5);
  ok("任务链图画出来了", document.querySelectorAll(".qnode").length===5);
  ok("层级标尺按前置深度分列", document.querySelectorAll(".gcol").length===4,
     [...document.querySelectorAll(".gcol b")].map(b=>b.textContent.trim()).join(" / "));
  ok("连线是直角折线", [...document.querySelectorAll("#qedges path")].some(p=>/H.*V.*H/.test(p.getAttribute("d"))));

  /* 文案是文字不是 key */
  const nm=document.querySelector(".thead h3").textContent;
  ok("任务名显示的是文案不是 key", !/^[0-9a-f]{24} /.test(nm)&&nm.length>1, nm);
  const desc=document.querySelector(".tbrief .txt").textContent;
  ok("描述显示的是文案", desc.length>10, desc.slice(0,24));

  /* 目标 / 奖励翻成了人话 */
  const goal=document.querySelector(".trow.goal .tt").textContent;
  ok("目标是人话不是 conditionType", goal.length>2&&!/^CounterCreator$/.test(goal), goal);
  const rew=[...document.querySelectorAll(".tcard .rl")].map(e=>e.textContent);
  ok("奖励认出了货币", rew.some(r=>/卢布|Roubles/.test(r)), rew.join(","));

  /* 切页签 */
  document.querySelector('[data-pane="prop"]').click(); await wait(30);
  ok("属性面渲染", document.querySelectorAll("[data-sw]").length===5);
  document.querySelector('[data-pane="fail"]').click(); await wait(30);
  ok("失败面渲染", !!document.querySelector('[data-add="failc"]'));
  document.querySelector('[data-pane="card"]').click(); await wait(30);

  /* 改文案 → 落到 locales，而且不整页重渲染（光标不能跳） */
  const q=QD.quests[qcur], before=qtext(q,"description");
  const el=document.querySelector(".tbrief .txt");
  el.textContent=before+"｜自测";
  el.dispatchEvent(new Event("input",{bubbles:true}));
  ok("改描述写进 locales", qtext(q,"description")===before+"｜自测");
  ok("改字后标出未保存", document.getElementById("qsaved").textContent.length>0,
     document.getElementById("qsaved").textContent);
  ok("改字不整页重渲染（光标不跳）", document.querySelector(".tbrief .txt")===el);

  /* 加一个目标 */
  const n0=(q.conditions.AvailableForFinish||[]).length;
  document.querySelector('[data-add="obj"]').click(); await wait(20);
  pick("击杀"); await wait(30);
  ok("加击杀目标", (q.conditions.AvailableForFinish||[]).length===n0+1,
     q.conditions.AvailableForFinish.at(-1).conditionType);
  /* 删掉它 */
  const dots=[...document.querySelectorAll('[data-menu="obj"]')];
  dots[dots.length-1].click(); await wait(20); pick("删除"); await wait(30);
  ok("删目标", (q.conditions.AvailableForFinish||[]).length===n0);

  /* ── 目标的高级参数 ──
     字段名照原版数据来（onlyFoundInRaid / oneSessionOnly / distance.value …），
     CounterCreator 那种外层管次数、内层管条件，两层的参数要摆在同一个面板里。 */
  const oi=(q.conditions.AvailableForFinish||[]).findIndex(c=>
    c.conditionType==="CounterCreator"||["HandoverItem","FindItem"].includes(c.conditionType));
  ok("找得到一条能调高级参数的目标", oi>=0, oi);
  const orow=q.conditions.AvailableForFinish[oi];
  [...document.querySelectorAll('[data-menu="obj"]')][oi].click(); await wait(20);
  pick("高级"); await wait(40);
  const rows=[...pop().querySelectorAll(".advrow")];
  ok("高级面板列出了字段", rows.length>=2, rows.length+" 行: "+
     rows.map(r=>r.querySelector("i").textContent).join("/"));
  const bt=pop().querySelector(".advrow [data-b]");
  if(bt){
    const f=bt.dataset.b, was=bt.getAttribute("aria-pressed")==="true";
    bt.click(); await wait(40);
    const now=(orow[f]!==undefined?orow:(orow.counter?.conditions||[])[0])[f];
    ok("开关能翻并写进模型", !!now!==was, f+"="+now);
  } else ok("开关能翻并写进模型", false, "面板里没有布尔字段");
  const inp=pop().querySelector('.advrow input[data-n="1"]');
  if(inp){
    inp.value="42"; inp.dispatchEvent(new Event("change",{bubbles:true})); await wait(60);
    const f=inp.dataset.v, tgt=orow[f.split(".")[0]]!==undefined?orow:(orow.counter?.conditions||[])[0];
    const got=f.split(".").reduce((x,k)=>x?.[k],tgt);
    ok("数字字段写进模型", got===42, f+"="+got);
  } else ok("数字字段写进模型", false, "面板里没有数字字段");
  hide(); await wait(20);

  /* 换地图 */
  document.querySelector("[data-map]").click(); await wait(20);
  pick("森林"); await wait(30);
  ok("换地图写进 location", q.location==="5704e3c2d2720bac5b8b4567", q.location);
  ok("顶栏跟着变", /森林|Woods/.test(document.querySelector("[data-map]").textContent));

  /* 信赖等级 → 写成 TraderLoyalty 条件 */
  document.querySelector("[data-ll]").click(); await wait(20);
  pick("Ⅲ"); await wait(30);
  const lc=(q.conditions.AvailableForStart||[]).find(c=>c.conditionType==="TraderLoyalty");
  ok("信赖等级写成 TraderLoyalty 条件", lc&&lc.value===3&&lc.target===q.traderId, JSON.stringify(lc));
  ok("接取条件不重复列信赖等级", ![...document.querySelectorAll(".trow.gate")].some(r=>/信赖|loyalty/i.test(r.textContent)));

  /* 换商人要连带改条件的 target，否则条件指向旧商人永远不成立 */
  document.querySelector('[data-pane="prop"]').click(); await wait(30);
  document.querySelector("[data-trader]").click(); await wait(20);
  pick("Prapor"); await wait(30);
  const lc2=(q.conditions.AvailableForStart||[]).find(c=>c.conditionType==="TraderLoyalty");
  ok("换商人连带改了条件 target", lc2.target===q.traderId&&q.traderId==="54cb50c76803fa8b248b4571",
     q.traderId+" / "+lc2.target);
  /* 开关 */
  const sw=document.querySelector('[data-sw="restartable"]'), b0=!!q.restartable;
  sw.click(); await wait(30);
  ok("开关能翻", !!q.restartable!==b0, "restartable="+q.restartable);

  /* 消息页签 */
  document.querySelector('[data-msg="failMessageText"]').click(); await wait(30);
  ok("失败邮件页", !!document.querySelector('[data-f="failMessageText"]'));
  document.querySelector('[data-msg="lines"]').click(); await wait(30);
  ok("玩家台词三行", document.querySelectorAll(".lrow").length===3);
  const lv=document.querySelector('[data-f="acceptPlayerMessage"]');
  lv.textContent="行，这活我接了。"; lv.dispatchEvent(new Event("input",{bubbles:true}));
  ok("台词写进 locales", qtext(q,"acceptPlayerMessage")==="行，这活我接了。");

  /* 保存 → 落盘 → 指纹更新 */
  const stamp0=QD.stamp;
  document.getElementById("qSave").click();
  for(let i=0;i<40&&QD.stamp===stamp0;i++)await wait(100);
  ok("保存后指纹变了", QD.stamp!==stamp0);
  ok("保存后不再显示未保存", !/未保存|Unsaved/.test(document.getElementById("qsaved").textContent),
     document.getElementById("qsaved").textContent);
  ok("保存后校验结果回来了", Array.isArray(QD.issues));

  /* 物品选择器 */
  document.querySelector('[data-pane="card"]').click(); await wait(30);
  document.querySelector('[data-add="rew"]').click(); await wait(20);
  pick("物品"); await wait(20);
  for(let i=0;i<40&&!QITEMS;i++)await wait(100);
  ok("物品表拉到了", QITEMS&&QITEMS.items.length>4000, QITEMS&&QITEMS.items.length);
  ok("物品窗开着", document.getElementById("ipick").classList.contains("on"));
  ok("分类树有内容", document.querySelectorAll(".ipcats button").length>10);
  document.getElementById("ipq").value="卢布";
  document.getElementById("ipq").dispatchEvent(new Event("input",{bubbles:true}));
  await wait(30);
  ok("能按中文搜到卢布", [...document.querySelectorAll(".iprow .pn")].some(e=>/卢布/.test(e.textContent)));
  const x=document.getElementById("ipClose"), cs=getComputedStyle(x);
  ok("关闭键是红虚线不填色", cs.backgroundColor==="rgba(0, 0, 0, 0)"&&cs.borderStyle==="dashed",
     cs.backgroundColor+" "+cs.borderStyle);
  x.click(); await wait(20);
  ok("关得掉", !document.getElementById("ipick").classList.contains("on"));

  /* 界面语言切换：任务页也得跟着变 */
  lang="en"; applyStatic(); render(); await wait(60);
  ok("切英文后页签是英文", /Quest card/.test(document.querySelector("[data-pane]").textContent),
     document.querySelector("[data-pane]").textContent.trim());
  ok("切英文后没有裸键漏出来", !/\bq_[a-z_]+/.test(document.querySelector(".main").textContent),
     (document.querySelector(".main").textContent.match(/q_[a-z_]+/)||[])[0]||"");
  lang="zh"; applyStatic(); render(); await wait(60);
  ok("切回中文", /任务卡/.test(document.querySelector("[data-pane]").textContent));
  ok("切回中文后没有裸键漏出来", !/\bq_[a-z_]+/.test(document.querySelector(".main").textContent),
     (document.querySelector(".main").textContent.match(/q_[a-z_]+/)||[])[0]||"");

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
  const lk0=QL.links.filter(l=>l.questId===qcur).length;
  document.querySelector('[data-add="link:accept"]').click(); await wait(30);
  ok("第 1 步列出节点", /选节点|pick a node/.test(document.getElementById("pop").textContent));
  pick("<C5>"); await wait(30);
  ok("第 2 步列出该节点的选项", /C5/.test(document.getElementById("pop").textContent));
  pick("行，我现在出发"); await wait(600);
  ok("挂上了（且落了盘）", QL.links.filter(l=>l.questId===qcur).length===lk0+1,
     "挂前 "+lk0+" 挂后 "+QL.links.filter(l=>l.questId===qcur).length+"："
     +QL.links.filter(l=>l.questId===qcur).map(l=>l.action+"@"+l.node).join(","));
  ok("界面跟着多一行", document.querySelectorAll(".trow.link").length===6);

  /* 摘掉 */
  const row=[...document.querySelectorAll("[data-unlink]")].find(b=>b.dataset.unlink.includes("|C5|"));
  ok("找得到那条的 ⋮", !!row);
  row.click(); await wait(30); pick("解除"); await wait(600);
  ok("摘掉了", QL.links.filter(l=>l.questId===qcur).length===lk0);

  /* 挂接页的中英化 */
  lang="en"; applyStatic(); render(); await wait(60);
  ok("挂接页切英文没有裸键", !/\bq_[a-z_]+/.test(document.querySelector(".main").textContent),
     (document.querySelector(".main").textContent.match(/q_[a-z_]+/)||[])[0]||"");
  ok("挂接页英文标题对", /Dialogue/.test([...document.querySelectorAll("[data-pane]")][1].textContent));
  lang="zh"; applyStatic(); render(); await wait(60);


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

  /* ── 删任务：一路删到"这个文件空了"，存盘后必须真的没了 ──
     以前 questSave 只按剩余任务的 owner 组装 files，独苗任务一删，那份文件
     根本不出现在请求里，服务端"只写送来的文件" → 白删，重开任务又回来。 */
  for(let i=0;i<40&&!QD;i++)await wait(100);
  const solo=Object.keys(QD.quests).find(id=>
    Object.values(QD.owner).filter(f=>f===QD.owner[id]).length===1);
  ok("找得到一个独占文件的任务", !!solo, solo+" @ "+QD.owner[solo]);
  const vfile=QD.owner[solo], vq=QD.quests[solo];
  /* 目标行的文案 key 是条件自己的 id，不带任务 id 前缀 —— 删任务时也该一起清掉 */
  const vconds=["AvailableForStart","AvailableForFinish","Fail"]
    .flatMap(g=>(vq.conditions||{})[g]||[])
    .flatMap(c=>[c.id,...((c.counter||{}).conditions||[]).map(x=>x.id)]).filter(Boolean);
  const hadCond=vconds.filter(k=>Object.values(QD.locales).some(L2=>k in L2));
  qcur=solo;
  const realConfirm=window.confirm; window.confirm=()=>true;   /* 删除会问一句，测试里一律点是 */
  delQuest();
  window.confirm=realConfirm;
  ok("模型里删掉了", !QD.quests[solo]);
  ok("任务自己的文案清了",
     !Object.values(QD.locales).some(L2=>Object.keys(L2).some(k=>k.startsWith(solo+" "))));
  ok("目标行的孤儿文案也清了", hadCond.every(k=>!Object.values(QD.locales).some(L2=>k in L2)),
     hadCond.filter(k=>Object.values(QD.locales).some(L2=>k in L2)).join(","));
  questSave(); await wait(900);
  ok("保存后文件表里没有它了", !(QD.files||[]).includes(vfile), (QD.files||[]).join(","));
  QD=null; questLoad(); for(let i=0;i<50&&!QD;i++)await wait(100);
  await wait(200);
  ok("重新载入不会诈尸", !QD.quests[solo], Object.keys(QD.quests).length+" 个任务");
  ok("别的任务都还在", Object.keys(QD.quests).length===4, Object.keys(QD.quests).length);

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
/* 结果回写成工作区里的一个文件：--dump-dom 会在探针跑完之前就把浏览器收掉，
   拿文件当交接点，测试脚本轮询它就行，跟浏览器的生命周期解耦。 */
/* 令牌从 meta 直接取，不用页面里的 TOK ——
   内联脚本一旦有语法错，TOK 就是 undefined，上报本身也会炸，结果什么都看不到。 */
/* /api/dlg 现在收的是**模型**不是文本，所以拿模型当载体：
   把每条结果塞进一个节点的 tail，DialogWriter 会一行一条吐出来。 */
fetch("/api/dlg?path=_probe.dlg",{method:"POST",
  headers:{"X-Token":document.querySelector("meta[name=tok]").content,
           "Content-Type":"application/json"},
  body:JSON.stringify({nodes:[{name:"PROBE",tail:L}]})});
})();
</script>
