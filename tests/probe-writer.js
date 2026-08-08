<script>
/* writer 那一刀的验收：打开一份"专门带坑"的剧本，走真界面存一遍，逐行比。
   这些坑正是旧的前端 toDlg() 会丢掉的东西。 */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).slice(0,90)+"]":""));
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const TOKEN=document.querySelector("meta[name=tok]").content;
const post=(u,b)=>fetch(u,{method:"POST",headers:{"X-Token":TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify(b)}).then(r=>r.json());
(async()=>{
try{
  page="dlg"; render(); await wait(60);
  /* 直接走界面的载入路径 */
  loadDoc("torture.dlg");
  for(let i=0;i<40&&filePath!=="torture.dlg";i++)await wait(100);
  ok("载入了", filePath==="torture.dlg", filePath);
  ok("解析零警告", doc.warn.length===0, doc.warn.join(" / "));
  ok("节点数", Object.keys(doc.nodes).length===2, Object.keys(doc.nodes).length);

  /* 模型里到底有没有把这些接住 —— 这几条以前全是丢的 */
  const op=doc.nodes.opening;
  /* 第一个节点之前的注释，两边（JS / C#）都归到文件头 headRaw，不是节点的 lead。
     回写时它会落在头部区，和原文相比可能跨过那一行空行 —— 内容不丢，只是空行位置变了。 */
  ok("第一个节点前的注释归到文件头",
     (doc.headRaw||[]).some(e=>e.k==="raw"&&/节点前的注释/.test(e.v||"")),
     JSON.stringify((doc.headRaw||[]).filter(e=>e.k==="raw").map(e=>e.v)));
  ok("节点体注释：旁白", (op.narr[0].lead||[]).length===1, JSON.stringify(op.narr[0].lead));
  ok("节点体注释：NPC 台词", (op.npcLead||[]).length===1, JSON.stringify(op.npcLead));
  ok("节点体注释：选项", (op.opts[0].lead||[]).length===1, JSON.stringify(op.opts[0].lead));
  ok("节点体注释：节点尾（含下一节点前的）", (op.tail||[]).length>=1, JSON.stringify(op.tail));
  ok("自动跳转前的注释", (doc.nodes.root.jumpLead||[]).length===1, JSON.stringify(doc.nodes.root.jumpLead));
  ok("旁白上的 anim 收住了", op.narr[0].anim==="nod"&&op.narr[1].anim==="shrug",
     op.narr[0].anim+" / "+op.narr[1].anim);
  const o2=op.opts[1];
  ok("setstatus 的状态值收住了（Success=4）", o2.setst&&o2.setst.v===4, JSON.stringify(o2.setst));
  ok("同一选项上的两条门控都收住了", !!o2.gate&&!!o2.gate2,
     JSON.stringify(o2.gate)+" + "+JSON.stringify(o2.gate2));
  ok("standing 的商人 id 收住了", o2.standing&&o2.standing.who==="5ac3b934156ae10c4430e83c",
     JSON.stringify(o2.standing));
  ok("handover 的标签收住了", op.opts[2].act&&op.opts[2].act.label==="建筑材料",
     JSON.stringify(op.opts[2].act));

  /* 渲染出来的文本 = 将要写进文件的文本 */
  const r=await post("/api/dlg/render",docJson());
  ok("服务端渲染回来了", typeof r.text==="string"&&r.text.length>100, (r.text||"").length+" 字符");
  const orig=await fetch("/api/dlg?path=torture.dlg",{headers:{"X-Token":TOKEN}}).then(x=>x.json());
  /* 比的是"有内容的行"：DialogWriter 会重排空行（它在每个节点前统一补一个），
     所以空行位置本来就不保证一致 —— 但有内容的行必须一模一样、顺序也一样。 */
  const norm=s=>s.replace(/\r\n/g,"\n").split("\n").map(x=>x.trimEnd()).filter(x=>x!=="");
  const a=norm(orig.text), b=norm(r.text);
  const diff=[];
  for(let i=0;i<Math.max(a.length,b.length);i++)
    if(a[i]!==b[i])diff.push((i+1)+": 原[“"+(a[i]??"<无>")+"”] 新[“"+(b[i]??"<无>")+"”]");
  ok("有内容的行数一致", a.length===b.length, a.length+" → "+b.length);
  ok("每一行内容和顺序都一致", diff.length===0, diff.slice(0,3).join(" ;; "));
  ok("空行数量没变",
     (orig.text.split("\n").filter(x=>!x.trim()).length)===(r.text.split("\n").filter(x=>!x.trim()).length),
     orig.text.split("\n").filter(x=>!x.trim()).length+" → "+r.text.split("\n").filter(x=>!x.trim()).length);
  const cnt=s=>s.split("\n").filter(x=>x.trim().startsWith("#")).length;
  ok("注释一条不少", cnt(orig.text)===cnt(r.text), cnt(orig.text)+" → "+cnt(r.text));

  /* 真存一次，再读回来比 */
  document.getElementById("saveBtn").click();
  await wait(700);
  const back=await fetch("/api/dlg?path=torture.dlg",{headers:{"X-Token":TOKEN}}).then(x=>x.json());
  ok("存盘后内容与渲染一致", norm(back.text).join("|")===norm(r.text).join("|"));
  ok("存完不再标未保存", dirty===false, "dirty="+dirty);

  /* ── 「打开 .dlg」面板要挂在「打开」按钮底下 ──
     以前是硬算屏幕中上方，面板飘在左上角，离触发它的按钮十万八千里。 */
  document.getElementById("openBtn").click();
  for(let i=0;i<30&&!document.getElementById("pop").classList.contains("on");i++)await wait(100);
  const pr=document.getElementById("pop").getBoundingClientRect();
  const br=document.getElementById("openBtn").getBoundingClientRect();
  ok("打开面板在按钮下方", pr.top>=br.bottom&&pr.top-br.bottom<20, "按钮底 "+Math.round(br.bottom)+" → 面板顶 "+Math.round(pr.top));
  ok("打开面板跟按钮右对齐", Math.abs(pr.right-br.right)<2, Math.round(pr.right)+" vs "+Math.round(br.right));
  ok("打开面板没出屏幕", pr.left>=0&&pr.right<=innerWidth, Math.round(pr.left)+"~"+Math.round(pr.right)+" / "+innerWidth);
  hide(); await wait(60);

  /* ── 文件头的 scene: / actor: ──
     模型和 DialogWriter 一直支持这两行，界面直到现在才有入口。
     torture.dlg 里本来没有这两行，所以顺带验"文件里没有时也能加出来"。 */
  const cart=[...document.querySelectorAll(".cart [data-head]")];
  ok("顶栏有 scene/actor 两格", cart.length===2, cart.length);
  ok("没值时显示破折号", cart.map(d=>d.querySelector("v").textContent).join(",")==="—,—",
     cart.map(d=>d.querySelector("v").textContent).join(","));
  cart[0].click(); await wait(120);
  ok("点开就是两个输入框", !!document.getElementById("hScene")&&!!document.getElementById("hActor"));
  document.getElementById("hScene").value="hideout_room";
  document.getElementById("hActor").value="SORA";
  document.getElementById("hActor").dispatchEvent(new Event("blur"));
  await wait(150);
  ok("值进了模型", doc.scene==="hideout_room"&&doc.actor==="SORA", doc.scene+" / "+doc.actor);
  ok("顶栏跟着变了",
     [...document.querySelectorAll(".cart [data-head] v")].map(v=>v.textContent).join(",")==="hideout_room,SORA");
  const r2=await post("/api/dlg/render",docJson());
  const hl=r2.text.split("\n");
  ok("写出了 scene: 那一行", hl.some(x=>x.trim()==="scene: hideout_room"), hl.slice(0,10).join(" / "));
  ok("写出了 actor: 那一行", hl.some(x=>x.trim()==="actor: SORA"));
  /* 文件里本来没这两行，就插在 start: 后面（两条都插在那儿，所以先后顺序不重要） */
  const at=k=>hl.findIndex(x=>x.startsWith(k)), s=at("start:");
  ok("两条都紧跟在 start: 后面", [at("scene:"),at("actor:")].sort().join()===[s+1,s+2].join(),
     "start="+s+" scene="+at("scene:")+" actor="+at("actor:"));
  ok("除了这两行别的没动", hl.filter(x=>x.trim()).length===norm(r.text).length+2,
     hl.filter(x=>x.trim()).length+" vs "+norm(r.text).length);
  /* 清空 = 那一行不写了，不能写成一个光秃秃的 `scene:` */
  cart[0].click(); await wait(120);
  document.getElementById("hScene").value="";
  document.getElementById("hScene").dispatchEvent(new Event("blur"));
  await wait(150);
  const r3=await post("/api/dlg/render",docJson());
  ok("清空后那一行整条消失", !/^\s*scene:/m.test(r3.text)&&/^actor: SORA$/m.test(r3.text),
     r3.text.split("\n").slice(0,8).join(" / "));
}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
/* 结果回写：/api/dlg 现在收的是模型，那就拿模型当载体 ——
   把每条结果塞进一个节点的 tail，writer 会一行一条吐出来。 */
post("/api/dlg?path=_probe.dlg",{nodes:[{name:"PROBE",tail:L}]});
})();
</script>
