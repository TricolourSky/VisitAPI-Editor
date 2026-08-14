<script>
/* 三样东西的验收：
   1. 节点的身份（入口 / 初见 / 分层入口）—— 以前图上按身份涂了色，却只能回去手写文件头
   2. tab:（商人界面上那个「对话」按钮什么时候出现）—— 以前编辑器里根本看不见
   3. 旧版 4.0.13 剧本的兑存检查 —— 那几处"语法一样、意思变了"的地方 */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).slice(0,90)+"]":""));
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
addEventListener("unhandledrejection",e=>L.push("REJECT "+(e.reason&&e.reason.message||e.reason)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/* 程序内弹窗：填值/确认都点它自己的按钮（以前是把 window.prompt/confirm 换掉） */
const mdWait=async()=>{for(let i=0;i<40&&!document.querySelector(".mdwrap");i++)await wait(50);
  return document.querySelector(".mdwrap");};
const mdFill=async v=>{await mdWait();const i=document.getElementById("mdIn");if(i)i.value=v;
  document.getElementById("mdOk").click();await wait(120);};
const mdOk=async()=>{await mdWait();document.getElementById("mdOk").click();await wait(120);};
/* 新手引导会盖一层遮罩，测试里一律先关掉（记号写进 localStorage 就不会再弹） */
try{Object.keys(TOUR).forEach(k=>localStorage.setItem(TOUR_KEY+k,"1"));}catch(_){}
const TOKEN=document.querySelector("meta[name=tok]").content;
const post=(u,b)=>fetch(u,{method:"POST",headers:{"X-Token":TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify(b)}).then(r=>r.json());
const roleBtn=n=>document.querySelector(`.gnode[data-n="${n}"] .grole`);
(async()=>{
try{
  page="dlg"; render(); await wait(60);
  loadDoc("torture.dlg");
  for(let i=0;i<40&&filePath!=="torture.dlg";i++)await wait(100);
  await wait(200);
  ok("载入了", filePath==="torture.dlg", filePath);
  /* 4.1 的剧本一条都不该报 —— 尤其是藏身处触发器：它和旧版写法长得一模一样，
     要是无条件就提，每份新剧本都被冤枉一次，那种提示第二次就没人看了 */
  ok("新版剧本一条旧版写法都不报", COMPAT.length===0, COMPAT.map(c=>c.k).join(","));
  /* 台词里带竖线不是分隔符，不许当成旧写法报出来（冤枉一次，整份文件就被判成旧版） */
  ok("台词里的竖线不算旧写法",
     compatScan('trader: 0000 "x"\nstart: a\n\n<a>\n要么A|要么B，你自己选。\n- 好 -> @close').length===0,
     JSON.stringify(compatScan('<a>\n要么A|要么B\n')));
  ok("竖线后面真跟着指令才报",
     compatScan('trader: 0000 "x"\n\n<a>\nhi\n- 走了|once').some(c=>c.k==="pipe_space"));
  ok("顶栏也不挂 4.0.13 角标", !document.querySelector(".cart [data-compat]"));

  /* ── 1 节点身份 ── */
  ok("每个节点标题上都有 ⋮", document.querySelectorAll(".gnode .grole").length===Object.keys(doc.nodes).length,
     document.querySelectorAll(".gnode .grole").length);
  const other=Object.keys(doc.nodes).find(n=>n!==doc.start);
  ok("找得到一个非入口节点", !!other, other);
  roleBtn(other).click(); await wait(120);
  ok("点开是身份菜单", !!document.querySelector('#pop [data-r="start"]'));
  ok("菜单标出当前入口不是它", document.querySelector('#pop [data-r="start"]').getAttribute("aria-pressed")==="false");
  document.querySelector('#pop [data-r="start"]').click(); await wait(200);
  ok("设成入口了", doc.start===other, doc.start);
  ok("图上跟着变了黄", document.querySelector(`.gnode[data-n="${other}"]`).dataset.start==="1");
  let r=await post("/api/dlg/render",docJson());
  ok("写出的 start: 是新的那个", new RegExp("^start: "+other+"$","m").test(r.text),
     (r.text.match(/^start:.*$/m)||[])[0]);

  /* 初见是**翻转**：本来就是它就取消，不是它就设上。
     torture.dlg 里 first: 正好指着这个节点，所以断言得按翻转写，不能想当然 */
  const wasFirst=doc.first;
  roleBtn(other).click(); await wait(120);
  document.querySelector('#pop [data-r="first"]').click(); await wait(200);
  ok("初见能翻转", doc.first===(wasFirst===other?null:other),
     "原来 "+wasFirst+" → 现在 "+doc.first);
  if(doc.first!==other){                       /* 统一翻到"是它"，好验回写 */
    roleBtn(other).click(); await wait(120);
    document.querySelector('#pop [data-r="first"]').click(); await wait(200);
  }
  ok("设成初见了", doc.first===other, String(doc.first));
  r=await post("/api/dlg/render",docJson());
  ok("写出了 first: 那一行", new RegExp("^first: "+other+"$","m").test(r.text),
     (r.text.match(/^first:.*$/m)||[])[0]);
  roleBtn(other).click(); await wait(120);
  document.querySelector('#pop [data-r="first"]').click(); await wait(200);
  ok("再点一下取消初见", doc.first===null, String(doc.first));
  r=await post("/api/dlg/render",docJson());
  ok("取消后 first: 那一行整条消失", !/^first:/m.test(r.text));

  /* 分层入口 */
  const n0=doc.when.length;
  roleBtn(other).click(); await wait(120);
  document.querySelector('#pop [data-r="when"]').click();
  await mdFill("level>=7"); await wait(150);
  ok("加了一条 when", doc.when.length===n0+1, doc.when.length);
  ok("条件解析对了", JSON.stringify(doc.when.at(-1).conds)===JSON.stringify([{f:"level",le:false,v:7}]),
     JSON.stringify(doc.when.at(-1)));
  r=await post("/api/dlg/render",docJson());
  ok("写出了那一行 when", new RegExp("^when: level>=7 -> "+other+"$","m").test(r.text),
     (r.text.match(/^when:.*$/gm)||[]).join(" ;; "));
  roleBtn(other).click(); await wait(120);
  ok("菜单里列出了指向它的 when", !!document.querySelector("#pop [data-w]"));
  document.querySelector("#pop [data-w]").click(); await wait(200);
  ok("能删掉", doc.when.length===n0, doc.when.length);
  ok("删完头行下标没串",
     doc.headRaw.filter(h=>h.k==="when").map(h=>h.i).join(",")===[...Array(n0).keys()].join(","),
     doc.headRaw.filter(h=>h.k==="when").map(h=>h.i).join(","));

  /* ── 2 tab: ── */
  const tcell=document.querySelector(".cart [data-tab]");
  ok("顶栏有 tab 那一格", !!tcell, tcell&&tcell.querySelector("v").textContent);
  tcell.click(); await wait(120);
  ok("点开有两个选择", document.querySelectorAll("#pop [data-t]").length===2);
  document.querySelector('#pop [data-t="1"]').click(); await wait(200);
  ok("切成看任务后出现了任务 id 和状态", !!document.getElementById("tabQ")
     && document.querySelectorAll("#pop [data-s]").length===6);
  const q=document.getElementById("tabQ");
  q.value="5043a1ce90726f6a536f7286"; q.dispatchEvent(new Event("change",{bubbles:true})); await wait(150);
  ok("任务 id 写进模型", doc.tab==="5043a1ce90726f6a536f7286", doc.tab);
  tcell.click(); await wait(120);
  document.querySelector('#pop [data-s="2"]').click(); await wait(200);
  ok("状态能勾", doc.tabS.includes(2), JSON.stringify(doc.tabS));
  r=await post("/api/dlg/render",docJson());
  ok("写出了 tab: if …", /^tab: if 5043a1ce90726f6a536f7286=/m.test(r.text),
     (r.text.match(/^tab:.*$/m)||[])[0]);
  tcell.click(); await wait(120);
  document.querySelector('#pop [data-t="0"]').click(); await wait(200);
  ok("切回一直显示", doc.tab===null, String(doc.tab));
  r=await post("/api/dlg/render",docJson());
  ok("tab: 那一行整条消失", !/^tab:/m.test(r.text));
  hide(); await wait(60);

  /* ── 3 旧版剧本 ── */
  markDirty(false);                      /* 上面改了一堆，别让它弹"要丢弃吗" */
  loadDoc("old4013.dlg");
  for(let i=0;i<40&&filePath!=="old4013.dlg";i++)await wait(100);
  await wait(250);
  ok("旧剧本也能打开", filePath==="old4013.dlg", filePath);
  const kinds=COMPAT.map(c=>c.k);
  ok("认出来了", COMPAT.length>=6, COMPAT.length+" 处: "+kinds.join(","));
  ["trader_order","tab_always","hideout_offset","trig_offset","npc_multiline","pipe_space","arrow_space"]
    .forEach(k=>ok("认出「"+T("cp_"+k)+"」", kinds.includes(k)));
  ok("顶栏挂出了 4.0.13 角标", !!document.querySelector(".cart [data-compat]"),
     document.querySelector(".cart [data-compat] v")?.textContent);
  ok("打开就自动摊开了提示", document.getElementById("pop").classList.contains("on"));
  const panel=document.getElementById("pop").innerText;
  ok("每一条都写了行号和原文", document.querySelectorAll("#pop .cprow").length===COMPAT.length,
     document.querySelectorAll("#pop .cprow").length);
  ok("每一条都写了怎么改", [...document.querySelectorAll("#pop .cprow span")]
     .every(s=>s.textContent.trim().length>10));
  ok("提示里没有漏键", !/\bcp_[a-z_]+/.test(panel), (panel.match(/cp_[a-z_]+/)||[])[0]);
  ok("多行台词那条指的是第一行", COMPAT.find(c=>c.k==="npc_multiline")?.ln===10,
     COMPAT.find(c=>c.k==="npc_multiline")?.ln);

  /* ── 4 程序内弹窗 ── 浏览器自带的那三个跟这套界面完全不搭，而且 prompt 能被用户永久关掉 */
  hide(); await wait(60);
  const pending=ask("测试用","预填的值");
  await mdWait();
  ok("弹窗是程序内的（不是浏览器的）", !!document.querySelector(".mdwrap .mdbox"));
  ok("预填了默认值", document.getElementById("mdIn").value==="预填的值");
  ok("有确定和取消两个键", !!document.getElementById("mdOk")&&!!document.getElementById("mdCancel"));
  document.getElementById("mdIn").value="改过的";
  document.getElementById("mdOk").click();
  ok("确定拿得到值", (await pending)==="改过的");
  const p2=ask("测试用","x"); await mdWait();
  document.getElementById("mdCancel").click();
  ok("取消返回 null", (await p2)===null);
  ok("关掉后不留残骸", !document.querySelector(".mdwrap"));

  /* ── 5 新手引导 ── */
  try{Object.keys(TOUR).forEach(k=>localStorage.removeItem(TOUR_KEY+k));}catch(_){}
  tourStart("dlg"); await wait(200);
  ok("引导开起来了", !!document.querySelector(".tourwrap"));
  const hole=document.querySelector(".tourhole").getBoundingClientRect();
  const target=document.querySelector(TOUR.dlg[0][0]).getBoundingClientRect();
  ok("高亮框套在真元素上", Math.abs(hole.left-(target.left-6))<2&&Math.abs(hole.top-(target.top-6))<2,
     Math.round(hole.left)+","+Math.round(hole.top)+" vs "+Math.round(target.left)+","+Math.round(target.top));
  ok("气泡有标题和说明", document.querySelector(".tourtip b").textContent.length>1
     && document.querySelector(".tourtip span").textContent.length>8);
  ok("气泡在屏幕里", (()=>{const r=document.querySelector(".tourtip").getBoundingClientRect();
     return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})(),
     JSON.stringify(document.querySelector(".tourtip").getBoundingClientRect()));
  const step1=document.querySelector(".tourtip b").textContent;
  document.getElementById("tourNext").click(); await wait(150);
  ok("下一步换了目标", document.querySelector(".tourtip b").textContent!==step1,
     step1+" → "+document.querySelector(".tourtip b").textContent);
  ok("遮罩不吃鼠标（被照亮的东西照样能点）",
     getComputedStyle(document.querySelector(".tourwrap")).pointerEvents==="none");
  document.getElementById("tourSkip").click(); await wait(120);
  ok("跳过就收干净", !document.querySelector(".tourwrap"));
  ok("跳过后记住了，不再自动弹", !!localStorage.getItem(TOUR_KEY+"dlg"));
  /* 引导只讲真实存在的元素——指着空气讲比不讲更糟 */
  ok("每一步的目标都真的在页面上",
     TOUR.dlg.concat(TOUR.quest).every(([sel,k])=>typeof T(k)==="string"&&T(k)!==k));

  /* ── 6 起手模板跟着界面语言走 ── */
  filePath=null; markDirty(false);
  lang="en"; doc=parseDlg(srcText()); applyStatic(); render(); await wait(150);
  ok("英文下起手模板是英文", /New trader/.test(doc.name)&&/first line/.test(doc.nodes.root.npc),
     doc.name+" / "+doc.nodes.root.npc);
  lang="zh"; doc=parseDlg(srcText()); applyStatic(); render(); await wait(150);
  ok("中文下起手模板是中文", /新商人/.test(doc.name), doc.name);

  /* ── 7 预览分隔条：拖出的宽度要活过切页 ──
     切页会把 #main 整页重建、行内样式蒸发；宽度不记进变量的话回来就弹回默认（实测抓到过）。 */
  const vp0=$("viewport").getBoundingClientRect().width;
  $("split").dispatchEvent(new MouseEvent("mousedown",{bubbles:true,clientX:800}));
  dispatchEvent(new MouseEvent("mousemove",{clientX:680}));
  dispatchEvent(new MouseEvent("mouseup"));
  await wait(80);
  const vp1=$("viewport").getBoundingClientRect().width;
  ok("拖动改了预览宽度", Math.abs((vp0-120)-vp1)<8, Math.round(vp0)+" → "+Math.round(vp1));
  page="help"; render(); await wait(150);
  page="dlg"; render(); await wait(250);
  const vp2=$("viewport").getBoundingClientRect().width;
  ok("切页回来宽度还在（不弹回默认）", Math.abs(vp2-vp1)<8, Math.round(vp1)+" → "+Math.round(vp2));

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
post("/api/dlg?path=_probe.dlg",{nodes:[{name:"PROBE",tail:L}]});
})();
</script>
