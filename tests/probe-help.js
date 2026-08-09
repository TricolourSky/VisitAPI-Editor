<script>
/* 使用说明页的端到端自测：在真页面上渲染，点开点收，结果塞进 #PROBE */
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
const cards=()=>[...document.querySelectorAll("#main .hpcard")];
const txt=()=>document.getElementById("main").innerText;
(async()=>{
try{
  page="help"; render(); await wait(200);

  /* ── 骨架 ── */
  ok("有标题", /使用说明|Help/.test(document.querySelector("#main h1").textContent),
     document.querySelector("#main h1").textContent);
  ok("两栏：对话 + 任务", document.querySelectorAll("#main .hpcol").length===2,
     document.querySelectorAll("#main .hpcol").length);
  ok("卡片数对得上", cards().length===GUIDE.dlg.length+GUIDE.q.length, cards().length);
  ok("每张卡都有标题和编号", cards().every(c=>{
    const s=c.querySelector("summary");
    return s && s.querySelector("b").textContent.trim().length>2 && /REF\.G\d\d/.test(s.querySelector("span").textContent);}));

  /* ── 版面真的成型了没 ──
     这几条是踩过才补的：有一版整页塌成了"一列单字"，而"卡片数""能折叠""没横向溢出"全是绿的——
     那些断言压根量不到宽度。所以这里直接量。 */
  const gw=document.querySelector("#main .hpgrid").getBoundingClientRect();
  const c0r=cards()[0].getBoundingClientRect();
  const p0=document.querySelector("#main .hpbody p,#main .hpbody table");
  ok("两栏网格铺满宽度", gw.width>innerWidth*0.8, Math.round(gw.width)+" / "+innerWidth);
  ok("单张卡接近半屏宽", c0r.width>innerWidth*0.35, Math.round(c0r.width)+" / "+innerWidth);
  ok("展开的卡没有高得离谱", c0r.height<innerHeight*1.5,
     Math.round(c0r.height)+" / 视口 "+innerHeight);
  ok("正文一行不止几个字", p0.getBoundingClientRect().width>300, Math.round(p0.getBoundingClientRect().width));

  /* ── 折叠：这是这一页的主要交互 ── */
  ok("每栏第一张默认展开", cards()[0].open===true && cards()[1].open===false,
     cards().map(c=>c.open?1:0).join(""));
  const c0=cards()[0], sum=c0.querySelector("summary");
  const h0=c0.getBoundingClientRect().height;
  sum.click(); await wait(120);
  ok("点标题能收起", c0.open===false);
  ok("收起后卡确实变矮了", c0.getBoundingClientRect().height<h0,
     Math.round(h0)+" → "+Math.round(c0.getBoundingClientRect().height));
  sum.click(); await wait(120);
  ok("再点一下又展开", c0.open===true);
  document.getElementById("gOpen").click(); await wait(80);
  ok("「全部展开」把每张都打开", cards().every(c=>c.open));
  document.getElementById("gShut").click(); await wait(80);
  ok("「全部收起」把每张都关上", cards().every(c=>!c.open));
  document.getElementById("gOpen").click(); await wait(120);

  /* ── 内容：节点讲清楚了没、例子在不在 ── */
  const body=txt();
  /* 面向新人：得先说清楚"这是什么、要装什么"，再给一条从零到能在游戏里看见的路。
     而且**不许拿别人的剧本当教材**——专有名词对新人来说只是噪音。 */
  ok("开头讲了要装什么", /(VisitAPI 插件|VisitAPI plugin)/.test(body));
  ok("讲了任务不需要插件", /(不需要 VisitAPI|does not need VisitAPI)/.test(body));
  ok("有五分钟上手那一段", /(五分钟|Five minutes)/.test(body));
  ok("上手那段给了完整的最小例子",
     [...document.querySelectorAll("#main .hpcode")].some(p=>
       /trader:/.test(p.textContent)&&/start:/.test(p.textContent)&&/^-\s/m.test(p.textContent)));
  ok("说了看不到「对话」按钮先查什么", /(插件没装|the plugin isn't installed)/i.test(body));
  ok("说明里不再出现别人剧本的专有名词",
     !/SORA|5043a1ce|sora1|sora2/.test(body), (body.match(/SORA|5043a1ce|sora[12]/)||[])[0]);
  ok("提醒了节点名只能用 ASCII", /(中文名字|non-Latin)/.test(body));
  ok("讲了节点是什么", /一屏|one screen/i.test(body));
  ok("讲了节点名的作用（地址）", /地址|address/i.test(body));
  ok("四行文件头都点到了", ["start:","first:","when:","tab:"].every(k=>body.includes(k)),
     ["start:","first:","when:","tab:"].filter(k=>!body.includes(k)).join(",")||"齐了");
  ok("七个保留跳转目标都列了", ["@close","@leave","@trade","@services","@tasks","@visit","@start"]
     .every(k=>body.includes(k)),
     ["@close","@leave","@trade","@services","@tasks","@visit","@start"].filter(k=>!body.includes(k)).join(","));
  ok("讲了自动门控这条坑", /always/.test(body) && /(自动|automatic)/i.test(body));
  /* 特殊节点：Tech Leader 明确要求讲清楚，尤其是 root 到底特殊在哪 */
  ok("说明 root 不是关键字", /root/.test(body) && /(不是关键字|not a keyword)/i.test(body));
  ok("点名了几种位置特殊的节点",
     ["start:","first:","when:","trigger:"].every(k=>body.includes(k))
     && /(孤儿|Orphan)/i.test(body));
  ok("讲了 @start 回到哪", /@start/.test(body) && /(入口|entry)/i.test(body));
  /* 触发点：现在编辑器里能改了，说明里就得有 */
  ok("有触发点这一张卡", /(hideout|藏身处)/.test(body) && /trigger:/.test(body));
  /* scene: 也得有教程，而且要说清楚它和 bg: 不是一回事、什么时候才真的加载 */
  ok("有 scene 这一张卡", /scene:/.test(body) && /(3D|3d)/.test(body));
  ok("讲了 scene 和 bg 的区别", /(平面|flat)/i.test(body));
  ok("讲了 scene: auto", /scene: auto/.test(body));
  ok("照实说了 actor 还没用上", /actor:/.test(body) && /(还没用上|not wired up)/i.test(body));

  /* ── 字号必须一致 ──
     这份页面没有 <!doctype>，跑在 quirks mode 里，而 quirks mode 下 <table> **不继承字体**，
     会退回 16px —— 表格里的字比正文明显大一号，整页看着像拼出来的。 */
  const sz=el=>Math.round(parseFloat(getComputedStyle(el).fontSize));
  const pSize=sz(document.querySelector("#main .hpbody p"));
  const tds=[...document.querySelectorAll("#main .hpbody td")].map(sz);
  const lis=[...document.querySelectorAll("#main .hpbody li")].map(sz);
  ok("表格里的字和正文一样大", tds.length>10&&tds.every(s=>s===pSize),
     "正文 "+pSize+" / 表格 "+[...new Set(tds)].join(","));
  ok("列表里的字也一样大", lis.every(s=>s===pSize), "正文 "+pSize+" / 列表 "+[...new Set(lis)].join(","));
  const codes=[...document.querySelectorAll("#main .hpcode")].map(sz);
  ok("例子块字号统一", new Set(codes).size===1, codes.join(","));
  ok("触发点讲了地点和坐标怎么填",
     /IntelligenceCenter/.test(body) && /(坐标|coordinates)/i.test(body));
  ok("有可以照抄的例子", document.querySelectorAll("#main .hpcode").length>=3,
     document.querySelectorAll("#main .hpcode").length);
  ok("例子里有真的节点写法", [...document.querySelectorAll("#main .hpcode")].some(p=>/<root>/.test(p.textContent)));
  ok("说明里的标签是真标签不是转义文字", document.querySelectorAll("#main .hpbody code").length>=15
     && !body.includes("<code>"), document.querySelectorAll("#main .hpbody code").length);

  /* ── 中英 ── */
  ok("中文页没有漏键", !/\bg_[a-z_]+|\bhp_[a-z_]+/.test(body), (body.match(/\b[gh]p?_[a-z_]+/)||[])[0]);
  lang="en"; applyStatic(); render(); await wait(150);
  document.getElementById("gOpen").click(); await wait(120);
  const en=txt();
  ok("英文页没有漏键", !/\bg_[a-z_]+|\bhp_[a-z_]+/.test(en), (en.match(/\b[gh]p?_[a-z_]+/)||[])[0]);
  ok("英文页真的是英文", /one screen/i.test(en) && !/一屏/.test(en));
  ok("切语言后卡片数不变", cards().length===GUIDE.dlg.length+GUIDE.q.length, cards().length);
  lang="zh"; applyStatic(); render(); await wait(120);

  /* ── 版面 ── */
  ok("没有横向溢出", document.documentElement.scrollWidth<=innerWidth+1,
     document.documentElement.scrollWidth+" / "+innerWidth);
  document.getElementById("gOpen").click(); await wait(120);
  ok("例子块自己横向滚，不顶宽整页", document.documentElement.scrollWidth<=innerWidth+1,
     document.documentElement.scrollWidth+" / "+innerWidth);
  ok("没有浮层盖着", !document.getElementById("pop").classList.contains("on"));

  /* ── 侧栏入口 ── */
  ok("介绍页里这一项不再标「未实现」", AB_READY.includes("help"));
  page="about"; render(); await wait(400);
  const row=[...document.querySelectorAll("#main .abrow")].find(r=>/使用说明|Help/.test(r.textContent));
  ok("介绍页的模块表里给了「去看看」按钮", !!row && !!row.querySelector("[data-go='help']"),
     row?row.textContent.replace(/\s+/g," ").trim().slice(0,50):"没找到那一行");

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
fetch("/api/dlg?path=_probe.dlg",{method:"POST",
  headers:{"X-Token":document.querySelector("meta[name=tok]").content,
           "Content-Type":"application/json"},
  body:JSON.stringify({nodes:[{name:"PROBE",tail:L}]})});
})();
</script>
