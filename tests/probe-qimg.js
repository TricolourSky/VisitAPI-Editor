<script>
/* 任务配图选择器的端到端自测：真页面上点开、点选、看值有没有落到任务上 */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).slice(0,90)+"]":""));
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
addEventListener("unhandledrejection",e=>L.push("REJECT "+(e.reason&&e.reason.message||e.reason)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
try{
  page="quest"; render();
  for(let i=0;i<40&&!QD;i++)await wait(100);
  for(let i=0;i<40&&QD&&!document.querySelector(".qnode");i++)await wait(100);
  await wait(150);

  const plate=document.getElementById("qimg");
  ok("任务卡上有配图位", !!plate);

  plate.click();
  for(let i=0;i<40&&!QIMG;i++)await wait(100);
  await wait(150);
  ok("选择器打开了", document.getElementById("gpick").classList.contains("on"));
  ok("不再走浏览器原生 prompt", !/prompt\(/.test(String(wireQuest)));

  /* ── 四个来源 ── */
  const cats=[...document.querySelectorAll("#gpcats [data-c]")].map(b=>b.dataset.c);
  ok("四个来源", cats.join(",")==="spt,mod,custom,none", cats.join(","));

  /* ── SPT 自带 ── */
  document.querySelector('#gpcats [data-c="spt"]').click(); await wait(120);
  const sptCells=[...document.querySelectorAll("#gplist .imcell")];
  ok("SPT 自带列出来了", sptCells.length===2, sptCells.length);
  const img=sptCells[0].querySelector("img");
  ok("缩略图走 /qimg 带令牌", /^\/qimg\?src=spt&name=.+&t=/.test(img.getAttribute("src")), img.getAttribute("src"));
  await new Promise(r=>{if(img.complete)return r();img.onload=r;img.onerror=r;});
  ok("缩略图真加载出来了", img.naturalWidth>0, img.naturalWidth+"x"+img.naturalHeight);

  /* ── 模组目录：带点号的那张要标出来 ── */
  document.querySelector('#gpcats [data-c="mod"]').click(); await wait(120);
  const modCells=[...document.querySelectorAll("#gplist .imcell")];
  ok("模组目录列出来了", modCells.length===2, modCells.map(c=>c.dataset.pick).join(","));
  const bad=modCells.find(c=>c.dataset.pick==="bad.name.png");
  ok("名字带点号的被标记", bad&&bad.classList.contains("bad"), bad&&bad.className);
  const good=modCells.find(c=>c.dataset.pick==="sora.png");
  ok("正常名字不被误标", good&&!good.classList.contains("bad"));
  /* VisitAPI-Server 会自己注册图片，所以不该弹"不会生效"的警告 */
  ok("VisitAPI-Server 下不报未注册警告", !document.querySelector("#gplist .imwarn"));

  /* ── 搜索 ── */
  const q=document.getElementById("gpq");
  q.value="sora"; q.dispatchEvent(new Event("input")); await wait(120);
  ok("搜索能筛", document.querySelectorAll("#gplist .imcell").length===1,
     [...document.querySelectorAll("#gplist .imcell")].map(c=>c.dataset.pick).join(","));
  q.value=""; q.dispatchEvent(new Event("input")); await wait(120);

  /* ── 选中：值要写成 SPT 认的那个形状 ── */
  document.querySelector('#gplist [data-pick="sora.png"]').click(); await wait(200);
  ok("选完就关窗", !document.getElementById("gpick").classList.contains("on"));
  ok("写进去的是 /files/quest/icon/ 那个形状", qq().image==="/files/quest/icon/sora.png", qq().image);
  ok("任务被标记为已改动", qdirty());
  const plate2=document.getElementById("qimg");
  ok("配图位显示出来了", /\/qimg\?name=/.test(plate2.getAttribute("style")||""), plate2.getAttribute("style"));

  /* ── 自己填路径 ── */
  plate2.click(); await wait(150);
  document.querySelector('#gpcats [data-c="custom"]').click(); await wait(120);
  ok("自填页有警告", !!document.querySelector("#gplist .imwarn"));
  const ci=document.getElementById("gpCustom");
  ok("自填页带出当前值", ci.value==="/files/quest/icon/sora.png", ci.value);
  ci.value="/files/quest/icon/mine.png";
  document.querySelector("#gplist [data-use]").click(); await wait(150);
  ok("自填的值写进去了", qq().image==="/files/quest/icon/mine.png", qq().image);

  /* ── 清除 ── */
  document.getElementById("qimg").click(); await wait(150);
  document.querySelector('#gpcats [data-c="none"]').click(); await wait(150);
  ok("能清掉配图", qq().image==="", JSON.stringify(qq().image));
  ok("清完窗也关了", !document.getElementById("gpick").classList.contains("on"));

  /* ── ESC 关窗 ── */
  document.getElementById("qimg").click(); await wait(150);
  dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}));
  await wait(120);
  ok("ESC 能关窗", !document.getElementById("gpick").classList.contains("on"));

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
fetch("/api/dlg?path=_probe.dlg",{method:"POST",
  headers:{"X-Token":document.querySelector("meta[name=tok]").content,
           "Content-Type":"application/json"},
  body:JSON.stringify({nodes:[{name:"PROBE",tail:L}]})});
})();
</script>
