<script>
/* 空任务库的验收。
   起因：任务库里一个 .json 都没有时，整页只剩一句话（还是拿错的那句"还没有任何目标"），
   工具栏根本不渲染 —— 于是**没有任何办法新建第一条任务**，用户被卡死在这一页。
   空库是新模组的正常起点，所以这里既要验"给得出出口"，也要验"真能一路建出来"。 */
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
const pop=()=>document.getElementById("pop");
const pick=t=>{const b=[...pop().querySelectorAll("[data-a]")].find(x=>x.textContent.includes(t));
  if(!b)throw new Error("菜单里没有 "+t+"：["+[...pop().querySelectorAll("[data-a]")].map(x=>x.textContent.trim()).join(" / ")+"]");
  b.click();};
(async()=>{
try{
  page="quest"; render();
  for(let i=0;i<40&&!QD;i++)await wait(100);
  await wait(200);

  ok("任务库读到了（只是空的）", QD&&QD.ok===true, QD&&QD.dir);
  ok("确实一条任务都没有", Object.keys(QD.quests||{}).length===0, Object.keys(QD.quests||{}).length);
  ok("一个任务文件都没有", (QD.files||[]).length===0, (QD.files||[]).join(","));

  /* ── 这一页必须给得出出口 ── */
  const txt=document.getElementById("main").innerText;
  ok("说清楚了是空库不是出错", /空的|empty/i.test(txt), txt.trim().slice(0,40));
  ok("没有拿错文案（那句是任务卡里「没写目标」的提示）", !/还没有任何目标|no objectives yet/i.test(txt));
  ok("把任务库路径摆出来了", txt.includes(QD.dir)||/db/.test(txt));
  const btn=document.getElementById("qNewEmpty");
  ok("有「新建任务」的按钮", !!btn, btn&&btn.textContent.trim());
  ok("还给了换位置和重读的出口",
     !!document.getElementById("qRootAgain")&&!!document.getElementById("qReloadEmpty"));

  /* ── 真的能一路建出来 ── */
  btn.click(); await wait(120);
  ok("点了先问放哪个文件", pop().classList.contains("on"));
  const items=[...pop().querySelectorAll("[data-a]")].map(b=>b.textContent.trim());
  ok("空库时只给「新建文件」这一项", items.length===1, items.join(" / "));
  /* prompt 在无头环境没人填，替它答一个 */
  pick(T("q_m_newfile"));
  await mdFill("first_quests");   /* 文件名在程序内弹窗里填 */
  ok("接着问挂哪个商人", pop().classList.contains("on")&&pop().querySelectorAll("[data-a]").length>5,
     pop().querySelectorAll("[data-a]").length);
  pick("Prapor"); await wait(300);

  ok("任务建出来了", Object.keys(QD.quests).length===1, Object.keys(QD.quests).length);
  const id=Object.keys(QD.quests)[0];
  ok("落到了我们起的那个文件名", QD.owner[id]==="first_quests.json", QD.owner[id]);
  ok("id 是 24 位十六进制", /^[0-9a-f]{24}$/.test(id), id);
  ok("两种语言都先落了一句文案",
     !!QD.locales.ch?.[id+" name"]&&!!QD.locales.en?.[id+" name"]);
  ok("界面已经切成正常的编辑页", !!document.getElementById("qSave")&&!!document.getElementById("qNew"));
  ok("顶栏文件名显示的是新文件", document.querySelector(".cart v").textContent.includes("first_quests"),
     document.querySelector(".cart v").textContent);

  /* ── 存下去，盘上真要有这个文件 ── */
  questSave(); await wait(1200);
  ok("保存后文件表里有它", (QD.files||[]).includes("first_quests.json"), (QD.files||[]).join(","));
  QD=null; questLoad(); for(let i=0;i<50&&!QD;i++)await wait(100);
  await wait(200);
  ok("重新载入还在", Object.keys(QD.quests).length===1, Object.keys(QD.quests).length);
  ok("重新载入后不再是空库页", !document.getElementById("qNewEmpty"));

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
fetch("/api/dlg?path=_probe.dlg",{method:"POST",
  headers:{"X-Token":document.querySelector("meta[name=tok]").content,
           "Content-Type":"application/json"},
  body:JSON.stringify({nodes:[{name:"PROBE",tail:L}]})});
})();
</script>
