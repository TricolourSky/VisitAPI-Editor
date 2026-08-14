<script>
/* 设置页「工程」卡的冒烟：
   卡片和按钮在、存成工程走程序内弹窗、最近列表出现、脏守卫拦得住、一键打开走完整 pjApply 链路 */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).replace(/\s+/g," ").slice(0,90)+"]":""));
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
addEventListener("unhandledrejection",e=>L.push("REJECT "+(e.reason&&e.reason.message||e.reason)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{Object.keys(TOUR).forEach(k=>localStorage.setItem(TOUR_KEY+k,"1"));}catch(_){}
const TOKEN=document.querySelector("meta[name=tok]").content;
const post=(u,b)=>fetch(u,{method:"POST",headers:{"X-Token":TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify(b)}).then(r=>r.json());
const mdWait=async()=>{for(let i=0;i<40&&!document.querySelector(".mdwrap");i++)await wait(50);
  return document.querySelector(".mdwrap");};
(async()=>{
try{
  for(let i=0;i<40&&!(WS&&WS.root);i++)await wait(100);
  page="set"; render();
  for(let i=0;i<80&&!PJ;i++)await wait(100);      /* 卡片是异步灌的，PJ 到位前显示的是"未设置" */
  await wait(200);
  ok("工程卡在", [...document.querySelectorAll("#main .chead")].some(e=>/PROJECT/.test(e.textContent)));
  ok("存/开按钮都在", !!document.getElementById("pjSave")&&!!document.getElementById("pjGo"));
  ok("三根都齐了（这台测试服要给全 --root/--quests/--mods）",
     PJ.current&&PJ.current.root&&PJ.current.quests&&PJ.current.mods,
     JSON.stringify(PJ.current));
  ok("当前组合显示了路径", /VisitAPI/.test(document.getElementById("pjSave").closest(".row").textContent));

  /* 存成工程（程序内 ask 弹窗，不许是浏览器 prompt） */
  const pj=WS.root+"\\_ui.vaproj";
  document.getElementById("pjSave").click(); await mdWait();
  const inp=document.getElementById("mdIn"); ok("弹的是程序内输入框", !!inp);
  inp.value=pj; document.getElementById("mdOk").click(); await wait(700);
  const md2=await mdWait(); ok("报了已存成（不是失败）", md2&&/已存成|saved/i.test(md2.textContent),
     md2&&md2.textContent.slice(0,60));
  document.getElementById("mdOk").click(); await wait(700);
  for(let i=0;i<50&&!document.querySelector("[data-pj]");i++)await wait(100);
  ok("最近列表出现了", !!document.querySelector("[data-pj]"));

  /* 脏守卫：有没保存的改动时要先问一声 */
  dirty=true;
  pjOpen(pj); const md3=await mdWait();
  ok("脏时先拦一道", !!md3&&!!document.getElementById("mdCancel"));
  document.getElementById("mdCancel").click(); await wait(400);
  ok("取消就不切（脏标记原样）", dirty===true);
  dirty=false;

  /* 一键打开：同一份工程=无损重开，但走的是完整 pjApply（拦脏→POST→清缓存→重画）。
     先塞假缓存进去，才能证明是 pjApply 清的、不是它们本来就空（空集断言=假绿，老规矩） */
  QD={ok:true,fake:1}; filePath="fake.dlg";
  pjOpen(pj); const g2=await mdWait();
  ok("塞进去的假任务缓存也算脏、又被拦一道", g2&&/丢掉|discard/i.test(g2.textContent),
     g2&&g2.textContent.slice(0,60));
  document.getElementById("mdOk").click(); await wait(900);   /* 这回选"继续"，真切 */
  const md4=await mdWait(); ok("报了已切换（不是失败）", md4&&/已切换|switched/i.test(md4.textContent),
     md4&&md4.textContent.slice(0,60));
  const okBtn=document.getElementById("mdOk"); if(okBtn)okBtn.click(); await wait(800);
  ok("切完页面还活着（设置页重画）", !!document.querySelector(".setwrap"));
  ok("任务缓存真被清了", QD===null, String(QD));
  ok("对话页退回起手状态", filePath===null, String(filePath));
}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
post("/api/dlg?path=_probe.dlg",{nodes:[{name:"PROBE",tail:L}]});
})();
</script>
