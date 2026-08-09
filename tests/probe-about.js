<script>
/* 程序介绍页的端到端自测：在真页面上渲染真数据，结果塞进 #PROBE */
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
const txt=()=>document.getElementById("main").innerText;
(async()=>{
try{
  /* 先按兵不动，看看程序自己开在哪一页、有没有浮层盖着 */
  const START_PAGE=page;
  await wait(700);
  const START_POP=document.getElementById("pop").classList.contains("on");

  page="about"; render();
  for(let i=0;i<40&&!ABENV;i++)await wait(100);
  await wait(120);                                  /* 数据回来后还有一次 render */

  /* ── 骨架 ── */
  ok("介绍页渲染出来了", !!document.querySelector(".abwrap"));
  ok("六张卡", document.querySelectorAll("#main .card").length===6,
     document.querySelectorAll("#main .card").length);
  ok("章节号是 01", (document.querySelector(".lede")||{}).textContent.includes("SEC.01"),
     (document.querySelector(".lede")||{}).textContent);

  /* ── 开局就该落在介绍页，而且不弹「打开 .dlg」 ── */
  ok("介绍页是默认落地页", START_PAGE==="about", START_PAGE);
  ok("落地时没有浮层挡着", !START_POP, "开局 pop 是开着的");

  /* ── 宽屏三栏 + 底部四栏，且整屏铺满 ── */
  const grid=document.querySelector(".abgrid");
  ok("宽屏排成两栏", grid&&getComputedStyle(grid).gridTemplateColumns.split(" ").length===2,
     grid&&getComputedStyle(grid).gridTemplateColumns);
  const wrap=document.querySelector(".abwrap"),inn=document.querySelector(".abin");
  const wcs=getComputedStyle(wrap);
  const avail=wrap.clientHeight-parseFloat(wcs.paddingTop)-parseFloat(wcs.paddingBottom);
  ok("内容撑满可视高度", inn.getBoundingClientRect().height>=avail-1,
     Math.round(inn.getBoundingClientRect().height)+" / "+Math.round(avail));
  const cols=[...document.querySelectorAll(".abcol")].map(c=>Math.round(c.getBoundingClientRect().height));
  ok("两列底边齐平", new Set(cols).size===1, cols.join(" / "));
  /* 拉伸只许拉卡片，不许把行距撑开——三栏那一版就是这么难看的 */
  const rowH=[...document.querySelectorAll(".abcol .row")].map(r=>r.getBoundingClientRect().height);
  ok("行没有被拉变形", Math.max(...rowH)<170, "最高行 "+Math.round(Math.max(...rowH)));
  const kw=document.querySelector(".abcell .abkind").getBoundingClientRect().width;
  ok("归属挂牌没被拉成横杠", kw<130, Math.round(kw)+"px");

  /* ── 快速上手：做完的步骤不该还催你去做 ── */
  const steps=[...document.querySelectorAll(".abstep")];
  ok("三步", steps.length===3);
  ok("已完成的步骤打勾且不给按钮",
     steps.filter(s=>s.dataset.done==="1").every(s=>s.querySelector("n").textContent.trim()==="✓"
       &&!s.querySelector(".go button")),
     steps.map(s=>s.dataset.done+":"+s.querySelector("n").textContent.trim()).join(" "));
  ok("第三步永远给两个入口", steps[2].querySelectorAll(".go button").length===2);

  /* 概览条已按要求去掉，不该有残留 */
  ok("没有概览条残留", !document.querySelector(".abstat"));
  ok("须知摊成多栏", document.querySelectorAll(".abcell").length===4);
  ok("每条须知带归属挂牌", document.querySelectorAll(".abcell .abkind").length===4,
     [...document.querySelectorAll(".abkind")].map(e=>e.textContent.trim()).join("/"));
  ok("正文没有横向溢出", document.querySelector(".abwrap").scrollWidth<=document.querySelector(".abwrap").clientWidth+1,
     document.querySelector(".abwrap").scrollWidth+" vs "+document.querySelector(".abwrap").clientWidth);

  /* ── 作者卡 ── */
  const face=document.querySelector(".abface img");
  ok("作者卡有头像", !!face, face&&face.getAttribute("src"));
  await new Promise(r=>{if(face&&face.complete)return r();face.onload=r;face.onerror=r;});
  ok("头像真的加载出来了", face&&face.naturalWidth>0, face&&(face.naturalWidth+"x"+face.naturalHeight));
  const links=[...document.querySelectorAll(".ablink")];
  ok("两条外链", links.length===2, links.map(a=>a.getAttribute("href")).join(" "));
  ok("外链都开新标签且带 noopener",
     links.every(a=>a.target==="_blank"&&(a.rel||"").includes("noopener")));
  ok("许可写清楚了", /MIT/.test((document.querySelector(".ablic")||{}).textContent||""));

  /* ── 规格带 ── */
  ok("规格带四项", document.querySelectorAll(".abspec>div").length===4);
  ok("规格带的版本和下面一致",
     document.querySelector(".abspec v").textContent.trim()===
     [...document.querySelectorAll(".abpath")][3].textContent.trim());

  /* ── 模块表：照实说哪些没做 ── */
  const rows=document.querySelectorAll(".abrow");
  ok("每个模块一行", rows.length===PAGES.length, rows.length+" / "+PAGES.length);
  /* 数字跟着 AB_READY 走，别再写死 —— 每做完一个模块就要来改一次断言，改漏了就是假绿 */
  ok("可进入的模块数＝AB_READY", document.querySelectorAll(".abrow [data-go]").length===AB_READY.length,
     [...document.querySelectorAll(".abrow [data-go]")].map(b=>b.dataset.go).join(","));
  ok("其余的都标未实现", [...document.querySelectorAll(".abrow .abst")].filter(
     e=>e.textContent.trim()===T("ab_todo")).length===PAGES.length-AB_READY.length-1);  /* -1 = 本页 */
  ok("当前页标你在这", document.querySelectorAll(".abrow .abst.on").length===1);
  ok("没做的模块不给按钮", !document.querySelector('.abrow [data-go="cloth"]'));
  ok("只有做完的模块是亮的",
     [...rows].filter(r=>r.dataset.on==="1").length===AB_READY.length+1);   /* 做完的 + 本页 */

  /* ── 环境卡：读的是真路径 ── */
  const paths=[...document.querySelectorAll(".abpath")].map(e=>e.textContent.trim());
  ok("环境卡四行", paths.length===4, paths.join(" | "));
  const wsr=await fetch("/api/workspace",{headers:{"X-Token":document.querySelector("meta[name=tok]").content}}).then(r=>r.json());
  ok("工作区路径和服务端一致", paths[0]===wsr.root, paths[0]+" vs "+wsr.root);
  ok("任务库指到了 db", /db$/.test(paths[1]), paths[1]);
  ok("认出了游戏根目录", paths[2].length>0&&paths[2]!=="—", paths[2]);
  ok("版本号带构建时间", /^\d+\.\d+\.\d+\+b\d{6}-\d{4}$/.test(paths[3]), paths[3]);
  ok("版本行不摆就绪挂牌", document.querySelectorAll("#main .abst.ok").length===3,
     document.querySelectorAll("#main .abst.ok").length);

  /* ── 没着落的时候要照实说，不能空着装没事 ── */
  const bare=abEnv({},{});
  ok("没设工作区时给出口", bare.includes('data-ws="1"'));
  ok("没设任务库时给出口", bare.includes('data-go="quest"'));
  ok("找不到游戏目录时报未找到", bare.split(T("ab_st_none")).length-1===2, "出现次数");
  ok("没着落的行不冒充就绪", !bare.includes("abst ok"));

  /* ── 按钮真能用 ── */
  document.querySelector('.abrow [data-go="quest"]').click();
  await wait(150);
  ok("进入按钮切到了任务页", page==="quest", page);
  page="about"; render(); await wait(150);
  ok("切回来还在", !!document.querySelector(".abwrap"));

  /* ── 中英 ── */
  const zh=txt();
  ok("中文没漏键", !/\bab_[a-z]/.test(zh), (zh.match(/\bab_[a-z_]+/)||[])[0]);
  ok("中文正文是中文", /给不写代码的人/.test(zh));
  lang="en"; applyStatic(); render(); await wait(150);
  const en=txt();
  ok("英文没漏键", !/\bab_[a-z]/.test(en), (en.match(/\bab_[a-z_]+/)||[])[0]);
  ok("英文正文是英文", /don't write code/.test(en), en.slice(0,60));
  /* 路径要排除掉再查：环境卡显示的是这台机器上的真路径，
     而仓库本身就可能放在带中文的目录里（我这台就是 E:\项目\…），那不是漏翻译 */
  const enNoPath=[...document.querySelectorAll("#main *")].filter(e=>!e.children.length
    &&!e.closest(".abpath")&&!e.classList.contains("abpath")).map(e=>e.textContent).join("\n");
  ok("英文里没有残留中文", !/[一-龥]/.test(enNoPath), (enNoPath.match(/[一-龥]+/)||[])[0]);
  ok("切语言后路径没变", [...document.querySelectorAll(".abpath")][0].textContent.trim()===wsr.root);
  lang="zh"; applyStatic(); render(); await wait(120);

  /* ── 说明里的 <code> 是我们自己的标记，应当渲染成标签而不是转义成文字 ── */
  ok("说明里的 code 是真标签", document.querySelectorAll(".abnote code").length>=4,
     document.querySelectorAll(".abnote code").length);
  ok("正文没把标签转义成字符", !txt().includes("<code>"));

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
fetch("/api/dlg?path=_probe.dlg",{method:"POST",
  headers:{"X-Token":document.querySelector("meta[name=tok]").content,
           "Content-Type":"application/json"},
  body:JSON.stringify({nodes:[{name:"PROBE",tail:L}]})});
})();
</script>
