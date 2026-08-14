<script>
/* 还原备份页（SEC.06）+ 任务目标数组参数的冒烟：
   1. 还原页撑得开（量真实宽度——"塌了但测试全绿"专区的规矩）、四张卡都在
   2. 点「还原」走程序内确认，盘上真的对调（回读 /api/dlg 核对文本）
   3. 高级参数面板：命中部位勾选组真能改出数组、清空时把键删干净；
      savageRole 选项从接口拉回来且保住大小写（bossKilla 不是 bosskilla）；
      武器列表走 #ipick 逐件累积——这条顺带钉住"首开选择器异步拉表"那个 currentTarget 老坑 */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).slice(0,90)+"]":""));
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
addEventListener("unhandledrejection",e=>L.push("REJECT "+(e.reason&&e.reason.message||e.reason)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{Object.keys(TOUR).forEach(k=>localStorage.setItem(TOUR_KEY+k,"1"));}catch(_){}
const TOKEN=document.querySelector("meta[name=tok]").content;
const post=(u,b)=>fetch(u,{method:"POST",headers:{"X-Token":TOKEN,"Content-Type":"application/json"},
  body:JSON.stringify(b)}).then(r=>r.json());
const get=u=>fetch(u,{headers:{"X-Token":TOKEN}}).then(r=>r.json());
(async()=>{
try{
  /* ── 1 还原备份页 ── */
  page="back"; render();
  for(let i=0;i<50&&!document.querySelector(".bkgrid");i++)await wait(100);
  ok("四张卡都在", document.querySelectorAll(".bkgrid .card").length===4,
     document.querySelectorAll(".bkgrid .card").length);
  const gw=(document.querySelector(".bkgrid")||{getBoundingClientRect:()=>({width:0})}).getBoundingClientRect().width;
  /* 1680 的窗口，铺满全宽后扣掉侧脊和 padding 少说也有 1200——挤回窄栏（600 上下）就该当场响 */
  ok("四栏铺满全宽（量真实宽度）", gw>1200, Math.round(gw)+"px");
  ok("网格真是四条轨道", getComputedStyle(document.querySelector(".bkgrid")).gridTemplateColumns.split(" ").length===4,
     getComputedStyle(document.querySelector(".bkgrid")).gridTemplateColumns);
  const row=[...document.querySelectorAll(".bkrow b")].find(b=>b.textContent==="_bkui.dlg");
  ok("对话卡列出了 _bkui.dlg", !!row);
  ok("状态标的是「对调」不是「复活」", row&&!row.closest(".bkrow").classList.contains("gone"));

  /* 点还原 → 程序内确认（不许是浏览器 confirm）→ 盘上对调 */
  row.closest(".bkrow").querySelector("[data-bk]").click(); await wait(250);
  ok("弹的是程序内确认", !!document.querySelector(".mdwrap"));
  document.getElementById("mdOk").click(); await wait(400);
  let t=await get("/api/dlg?path=_bkui.dlg");
  ok("还原后现役是旧内容", /OLDLINE/.test(t.text), t.text.split("\n").pop());
  for(let i=0;i<40&&!document.getElementById("mdOk");i++)await wait(100);   /* 「已还原」提示 */
  const md2=document.getElementById("mdOk"); if(md2)md2.click(); await wait(500);
  /* 再还原一次＝换回去（列表是重新拉的，得等它回来） */
  for(let i=0;i<50&&!document.querySelector(".bkrow [data-bk]");i++)await wait(100);
  const row2=[...document.querySelectorAll(".bkrow b")].find(b=>b.textContent==="_bkui.dlg");
  ok("还原完那一行还在（对调不是消耗）", !!row2);
  row2.closest(".bkrow").querySelector("[data-bk]").click(); await wait(250);
  document.getElementById("mdOk").click(); await wait(400);
  t=await get("/api/dlg?path=_bkui.dlg");
  ok("再还原一次＝换回去", /NEWLINE/.test(t.text), t.text.split("\n").pop());
  const md3=document.getElementById("mdOk"); if(md3)md3.click(); await wait(300);

  /* ── 2 高级参数的数组控件（不依赖任务库：直接在假条件上开面板）── */
  const inner={conditionType:"Kills",target:"Savage",value:1};
  const btn=document.createElement("button"); document.body.appendChild(btn);
  advMenu(btn,[[inner,ADV.Kills]]); await wait(100);
  ok("命中部位正好 7 个勾选", document.querySelectorAll('#pop [data-t="bodyPart"]').length===7,
     document.querySelectorAll('#pop [data-t="bodyPart"]').length);
  document.querySelector('#pop [data-t="bodyPart"][data-o="Head"]').click(); await wait(100);
  ok("勾上 Head 写成数组", JSON.stringify(inner.bodyPart)==='["Head"]', JSON.stringify(inner.bodyPart));
  document.querySelector('#pop [data-t="bodyPart"][data-o="Head"]').click(); await wait(100);
  ok("取消勾选把键删干净（不撒空数组）", !("bodyPart" in inner), JSON.stringify(inner.bodyPart));

  /* savageRole：选项表异步拉回来后面板原地重画 */
  for(let i=0;i<80&&!document.querySelector('#pop [data-t="savageRole"]');i++)await wait(100);
  const roles=[...document.querySelectorAll('#pop [data-t="savageRole"]')];
  ok("角色选项拉回来了（原版约 48 种）", roles.length>=30, roles.length);
  ok("保住了任务文件里的大小写", roles.some(b=>b.dataset.o==="bossKilla"),
     roles.filter(b=>/^boss/.test(b.dataset.o)).slice(0,3).map(b=>b.dataset.o).join(","));
  const rk=roles.find(b=>b.dataset.o==="bossKilla"); rk.click(); await wait(100);
  ok("勾上角色写进数组", (inner.savageRole||[]).includes("bossKilla"), JSON.stringify(inner.savageRole));

  /* 武器：＋ → #ipick（首开走异步拉表那条路）→ 选一件 → 面板原地重开 */
  document.querySelector('#pop [data-add="weapon"]').click(); await wait(200);
  ok("物品选择器开了", document.getElementById("ipick").classList.contains("on"));
  for(let i=0;i<100&&!document.querySelector("#iplist [data-i]");i++)await wait(150);
  const it=document.querySelector("#iplist [data-i]");
  ok("物品表拉回来了", !!it);
  const picked=it&&it.dataset.i; it.click(); await wait(300);
  ok("选完面板原地重开、武器进了列表",
     (inner.weapon||[]).length===1&&inner.weapon[0]===picked&&!!document.querySelector('#pop [data-x="weapon"]'),
     JSON.stringify(inner.weapon));
  document.querySelector('#pop [data-x="weapon"]').click(); await wait(100);
  ok("✕ 删掉最后一件把键删干净", !("weapon" in inner), JSON.stringify(inner.weapon));
}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
post("/api/dlg?path=_probe.dlg",{nodes:[{name:"PROBE",tail:L}]});
})();
</script>
