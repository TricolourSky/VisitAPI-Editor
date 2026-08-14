<script>
/* BOT 外观页（SEC.02）和商人货架页（SEC.05）的端到端自测：在真页面上点真按钮。
   **一定要量尺寸**：说明页那次整页塌成 1px，而 27 项测试全绿 —— 因为它们只数元素不量宽度。 */
const L=[];
const ok=(n,c,x)=>L.push((c?"PASS ":"FAIL ")+n+(x?" ["+String(x).slice(0,70)+"]":""));
addEventListener("error",e=>L.push("WINDOW-ERROR "+e.message+" @ "+(e.filename||"").split("/").pop()+":"+e.lineno));
addEventListener("unhandledrejection",e=>L.push("REJECT "+(e.reason&&e.reason.message||e.reason)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const W=s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().width):0;};
try{Object.keys(TOUR).forEach(k=>localStorage.setItem(TOUR_KEY+k,"1"));}catch(_){}
(async()=>{
try{
  /* ══ 侧栏：新加了第 7 格 ══ */
  drawNav();
  const nav=[...document.querySelectorAll("#navItems .nitem")];
  ok("侧栏 7 格", nav.length===7, nav.map(b=>b.title).join("/"));
  ok("商人售卖排在任务后面", nav[4].title===T("nav_assort"), nav[4].title);
  const navEl=document.querySelector(".nav"), bot=document.querySelector("#navBottom");
  ok("侧栏装得下（没顶掉设置按钮）",
     navEl.scrollHeight<=navEl.clientHeight+1 &&
     Math.round(bot.getBoundingClientRect().bottom)<=Math.round(navEl.getBoundingClientRect().bottom)+1,
     "scroll="+navEl.scrollHeight+" client="+navEl.clientHeight);

  /* ══ BOT 服装页（改版：左「装配台」/ 右「衣柜」）══ */
  page="cloth"; render();
  for(let i=0;i<60&&!BD;i++)await wait(100);
  for(let i=0;i<40&&BD&&!document.querySelector(".btgrp");i++)await wait(100);

  ok("bot 库读到了", BD&&BD.ok===true, BD&&BD.dir);
  ok("2 份配置", Object.keys(BD.files).length===2, Object.keys(BD.files).join(","));
  ok("零校验问题", (BD.issues||[]).length===0, (BD.issues||[]).map(e=>e.code).join(","));

  /* 五个部位：头 / 身体 / 手 / 下装 / 语音。
     游戏里没有单独的"脚"（Feet 就是整条下装）；语音严格说不是部位，但它在 bot json 里的槽
     和别的部位同形，作者也只关心"我做的语音怎么装上去"，所以一视同仁 */
  const parts=[...document.querySelectorAll(".btgrp .btgh")].map(e=>e.dataset.tab);
  ok("五个部位各一组", parts.length===5, parts.join(","));
  ok("顺序是 头·身体·手·下装·语音", parts.join(",")==="head,body,hands,feet,voice", parts.join(","));
  ok("语音不再是只读的窄行", !document.querySelector(".btvoice")&&parts.includes("voice"));
  ok("部位标题是人话", [...document.querySelectorAll(".btgh b")].every(e=>e.textContent.trim().length>0),
     [...document.querySelectorAll(".btgh b")].map(e=>e.textContent.trim()).join("/"));

  /* **每个部位只有一个图标**：SPT 那一池随机服装归成一项「默认数据」，不拆成一件一件摆 */
  const gs=[...document.querySelectorAll(".btgrp")];
  ok("每组只有一个图标", gs.every(g=>g.querySelectorAll(".bttile").length===1),
     gs.map(g=>g.querySelectorAll(".bttile").length).join(","));
  ok("默认态照样画部位图标（不是空框）",
     [...document.querySelectorAll(".bttile.def")].every(t=>t.querySelector("svg")&&t.querySelector("b")),
     document.querySelectorAll(".bttile.def").length+" 个默认格");
  ok("默认格写了原版有几套", /\d/.test(document.querySelector(".bttile.def b").textContent),
     document.querySelector(".bttile.def b").textContent.trim());

  /* ── 滚动条：全站改成 AIC 样式 ──
     ⚠️ Chromium 只要在某个元素上见到标准属性 scrollbar-width / scrollbar-color，
        就会把 ::-webkit-scrollbar 那一整套**全部忽略**，那根滚动条打回浏览器默认。
        所以逐个量真实的滚动容器，别只查一下样式表里有没有写过规则。 */
  const gcss=[...document.querySelectorAll("style")].map(s=>s.textContent).join("");
  ok("全局定义了滚动条样式", /::-webkit-scrollbar-thumb/.test(gcss));
  const scr=[".btbay",".btcards",".btslots"].map(s=>document.querySelector(s)).filter(Boolean);
  ok("滚动容器都量到了", scr.length===3, scr.length);
  ok("没有元素用 scrollbar-width 把自定义样式顶掉",
     scr.every(e=>{const v=getComputedStyle(e).scrollbarWidth;return !v||v==="auto";}),
     scr.map(e=>e.className.split(" ")[0]+"="+getComputedStyle(e).scrollbarWidth).join(" "));
  /* 侧脊那根是**故意**藏掉的，别被上面的通配规则改回来 */
  ok("侧脊的滚动条仍然是藏着的",
     getComputedStyle(document.getElementById("navItems")).scrollbarWidth==="none",
     getComputedStyle(document.getElementById("navItems")).scrollbarWidth);

  /* 立绘那一格只画装配示意图，不找 BOT 图片 —— 但窗口本身要留着（四角刻度、类型名都在） */
  ok("立绘窗口还在", !!document.querySelector(".btport"));
  ok("立绘画的是示意图不是图片",
     !!document.querySelector(".btport svg") && !document.querySelector(".btport img"));
  ok("窗口里写着当前 BOT 的类型名", /assault|marksman/.test(document.querySelector(".btpname").textContent),
     document.querySelector(".btpname").textContent);

  /* 量尺寸：塌了的话左栏会挤成一条 */
  ok("左栏铺得开", W(".btbay")>=380, W(".btbay"));
  ok("右栏比左栏宽", W(".btrobe")>W(".btbay"), W(".btrobe")+" vs "+W(".btbay"));
  /* 卡片每列最小 250px（Tech Leader 在 2560 的屏上定的：一行 7 张）。
     原来是 200px，9 列刚好挤得进他的屏幕 —— 卡在临界点上，宽一像素少一像素就跳一列。 */
  ok("卡片不小于 250px", W(".btcw")>=248, W(".btcw"));
  ok("没有横向溢出", document.documentElement.scrollWidth<=document.documentElement.clientWidth+2);

  /* 顶栏数据弹匣里是当前 BOT */
  ok("顶栏显示当前 BOT", /assault|marksman/.test(document.querySelector(".cart v").textContent),
     document.querySelector(".cart v").textContent.trim());

  /* 衣柜：四个页签，只列作者自己做的 */
  ok("五个页签", document.querySelectorAll(".bttab").length===5,
     [...document.querySelectorAll(".bttab")].map(e=>e.dataset.tab).join(","));
  const cards=[...document.querySelectorAll(".btcard")];
  ok("身体页有卡片", cards.length>=1, cards.length+" 张");
  ok("卡片是图不是纯文字", cards.every(c=>c.querySelector(".btbig")));
  /* 预览图退回 suiteId：夹具里只放了 <suiteId>.png，没放 <topId>.png。
     一件上装的身体和手出自同一条记录，作者放一张就该两格都有图，
     不然同一张图得存两遍、还得改成两个不同的 24 位十六进制名（全套 69 张）。 */
  const suitCard=document.querySelector('.btcard[data-pick="aa00000000000000000000f1"]');
  ok("身体那格退回 suiteId 找到了图",
     !!suitCard&&!!suitCard.querySelector('img[src*="/look?id=aa00000000000000000000f1"]'),
     suitCard&&suitCard.querySelector("img")?"有图":"没有 img");
  /* 衣柜里只该有作者自己做的四种东西；SPT 自带那 456 条根本不送到前端 */
  ok("衣柜里没有游戏自带的",
     (BD.wear||[]).every(w=>["top","bottom","head","voice"].includes(w.kind)),
     [...new Set((BD.wear||[]).map(w=>w.kind))].join(","));
  /* 配图说明挪到了衣柜底下（原来挂在「选 BOT」弹窗里，BOT 不配图之后那儿就不是它该待的地方），
     而且**只在还有卡片缺图时**才画 —— 全配齐了它该自己消失，不留一条永远杵着的废话。
     夹具里每张卡都有图，所以要先把 previews 清空才验得到"有缺口"那一半。 */
  ok("全配齐时没有多余的说明", !document.querySelector(".btfoot"));
  const keepPrev = BD.previews.slice();
  BD.previews.length = 0; render(); await wait(150);
  ok("有缺图时才给配图说明", !!document.querySelector(".btfoot"));
  ok("说明里写清了放哪个目录", /previews/.test((document.querySelector(".btfoot")||{}).textContent||""),
     ((document.querySelector(".btfoot")||{}).textContent||"").trim().slice(0,40));
  keepPrev.forEach(x=>BD.previews.push(x)); render(); await wait(150);
  ok("图补回来说明就消失", !document.querySelector(".btfoot"));

  /* ── 替换：点卡片 = 只换这一个部位，权重写 1000000 ── */
  const top=BD.wear.find(w=>w.kind==="top");
  document.querySelector('.btcard[data-pick="'+top.key+'"]').click(); await wait(300);
  ok("换上装只动 body",
     JSON.stringify(BD.files[bcur].appearance.body)===JSON.stringify({[top.parts.body]:1000000}),
     JSON.stringify(BD.files[bcur].appearance.body));
  ok("改完变脏", bdirty()===true);
  /* 只换一边 → 依赖告警当场出现（上装袖口和手是接在一起的） */
  ok("只换上装立刻报混搭", !!document.querySelector(".btband"),
     (document.querySelector(".btband")||{}).textContent);
  ok("出问题的页签挂红点", !!document.querySelector(".bttab s"));
  ok("顶上那条斜纹带也变红", !!document.querySelector(".tape.bad"));

  /* ── 「整套」：这条记录带的部位一起换，告警随之消失 ── */
  document.querySelector('.btall[data-all="'+top.key+'"]').click(); await wait(300);
  ok("整套把手也换了",
     JSON.stringify(BD.files[bcur].appearance.hands)===JSON.stringify({[top.parts.hands]:1000000}),
     JSON.stringify(BD.files[bcur].appearance.hands));
  ok("整套之后告警没了", !document.querySelector(".btband"));

  /* ── 恢复默认：去 SPT 原版那份把整池读回来（编辑器不自己另存原池）── */
  document.querySelector('[data-def="body"]').click(); await wait(900);
  ok("恢复默认拿回原版那一池", Object.keys(BD.files[bcur].appearance.body).length>=5,
     Object.keys(BD.files[bcur].appearance.body).length+" 套");
  ok("只恢复一半照样算混搭", !!document.querySelector(".btband"));
  document.querySelector('[data-def="hands"]').click(); await wait(900);
  ok("两边都恢复了就不报了", !document.querySelector(".btband"));

  /* ── 搜索 ── */
  const gq=document.getElementById("bQ");
  gq.value="zzzzzzzz"; gq.dispatchEvent(new Event("input")); await wait(250);
  ok("能搜（搜无结果会空）", document.querySelectorAll(".btcard").length===0,
     document.querySelectorAll(".btcard").length);
  gq.value=""; gq.dispatchEvent(new Event("input")); await wait(250);
  ok("清空搜索卡片回来", document.querySelectorAll(".btcard").length>=1);

  /* ── 头那一页：夹具里的头有预览图，应当画真图 ── */
  document.querySelector('.bttab[data-tab="head"]').click(); await wait(300);
  const hc=document.querySelector('.btcard[data-pick="aa00000000000000000000e1"]');
  ok("头那一页列出自制的头", !!hc);
  ok("有预览图的真的画了图", !!hc&&!!hc.querySelector('img[src*="/look?id=aa000000"]'),
     hc&&hc.querySelector("img")?hc.querySelector("img").getAttribute("src").slice(0,40):"没有 img");
  ok("只有一个部位的记录不给「整套」", !hc.parentElement.querySelector(".btall"));

  /* ── 语音那一页：作者自制的语音也能装上去（这一版补的）── */
  document.querySelector('.bttab[data-tab="voice"]').click(); await wait(300);
  const vc=[...document.querySelectorAll(".btcard")];
  ok("语音页列出自制语音", vc.length>=1, vc.length+" 条");
  ok("语音卡片画声波不是空框", vc.every(c=>c.querySelector(".btbig svg")||c.querySelector(".btbig img")));
  /* 预览图第③轮：按**角色名**配。夹具里只有 Lab.png，语音叫「Lab Voice」——
     没有任何 id 命名的图能命中它，只能靠"显示名以『Lab 』开头"这条规则。
     一个角色在数据里是三条不相干的记录，名字是唯一能把它们串起来的东西。 */
  ok("按角色名也能配上图（Lab.png → 「Lab Voice」）",
     !!vc[0].querySelector('img[src*="/look?id=Lab"]'),
     vc[0].querySelector("img")?vc[0].querySelector("img").getAttribute("src").slice(0,30):"没有 img");
  /* 直接量 bpic()，把名字匹配的边界钉死。
     叫 fakeWear 不叫 fake —— 底下内容库弹窗那段已经有一个 const fake，
     同名会让**整段探针一行都不跑**（表现是"探针没回写结果"，看着像页面炸了）。 */
  const fakeWear = n => ({ key:"nosuchkey", zh:n, en:n });
  ok("整名相等能配上", bpic("nosuchid", fakeWear("Lab"))==="Lab");
  ok("名字是前缀就能配上", bpic("nosuchid", fakeWear("Lab Voice"))==="Lab");
  ok("完全对不上的就是没有", bpic("nosuchid", fakeWear("Zzz"))==="");
  /* ★ 真实数据里踩到的：作者放了 MG4.png 和 MG4Damage.png，
     而显示名是「MG4 JK Upper」和「MG4 Damaged JK Upper」。
       · 要求空格对齐 → MG4Damage.png 一张都配不上
       · 不比长短      → 战损那套会套上普通那套的图（Tech Leader 一眼看出来的）
     所以规则是"忽略空格的前缀比较 ＋ 取最长的那个"。 */
  BD.previews.push("MG4", "MG4Damage");
  ok("忽略空格才配得上（MG4Damage → 「MG4 Damaged…」）",
     bpic("nosuchid", fakeWear("MG4 Damaged JK Upper"))==="MG4Damage",
     bpic("nosuchid", fakeWear("MG4 Damaged JK Upper")));
  ok("多个都对得上时取最长的（战损不会套普通的图）",
     bpic("nosuchid", fakeWear("MG4 Damaged JK Lower"))!=="MG4");
  ok("普通那套不受影响", bpic("nosuchid", fakeWear("MG4 JK Upper"))==="MG4",
     bpic("nosuchid", fakeWear("MG4 JK Upper")));
  BD.previews.length -= 2;
  /* 配错图是有可能的，所以每张图都得挂着"它是哪个文件"，鼠标一停能核 */
  ok("图片挂了来源提示", /previews/.test((vc[0].querySelector("img")||{}).title||""),
     (vc[0].querySelector("img")||{}).title);
  const vBefore=Object.keys(BD.files[bcur].appearance.voice||{}).length;
  vc[0].click(); await wait(300);
  ok("换语音也是整槽换成权重 1000000",
     Object.values(BD.files[bcur].appearance.voice).join()==="1000000",
     vBefore+" 条 → "+JSON.stringify(BD.files[bcur].appearance.voice));
  document.querySelector('[data-def="voice"]').click(); await wait(900);
  ok("语音也恢复得回原版那一池", Object.keys(BD.files[bcur].appearance.voice).length>=2,
     Object.keys(BD.files[bcur].appearance.voice).length+" 条");

  /* ── 选 BOT 弹窗 ── */
  document.getElementById("bWho").click(); await wait(300);
  ok("选 BOT 弹窗打开", !!document.querySelector(".btbox"));
  const rows=[...document.querySelectorAll(".btrow")];
  ok("列出两个 BOT", rows.length===2, rows.map(e=>e.dataset.bot).join(","));
  /* **BOT 一律不配图**（Tech Leader 2026-08-11 定：官方没多少 BOT 立绘可放）。
     哪怕 previews 里明明有一张 assault.png，这里也只能是示意图标，不许出现 <img>。 */
  ok("BOT 行画的是图标不是图片",
     rows.every(e=>e.querySelector(".bttile svg") && !e.querySelector("img")),
     rows.filter(e=>e.querySelector("img")).map(e=>e.dataset.bot).join(",")||"都没有 img");
  ok("夹具里确实放着一张同名的 BOT 图（证明是主动不用，不是没有）",
     (BD.previews||[]).includes("assault"), (BD.previews||[]).join(","));
  /* 搜索。⚠️ 弹窗里的输入框叫 bQ2，不是页面上那个 bQ —— 同名会互相抢 */
  const bq=document.getElementById("bQ2");
  bq.value="marks"; bq.dispatchEvent(new Event("input")); await wait(250);
  ok("BOT 列表能搜", document.querySelectorAll(".btrow").length===1,
     document.querySelectorAll(".btrow").length);
  bq.value=""; bq.dispatchEvent(new Event("input")); await wait(250);
  /* 点一行切过去 */
  [...document.querySelectorAll(".btrow")].find(e=>e.dataset.bot==="marksman.json").click();
  await wait(300);
  ok("点一行就切过去", bcur==="marksman.json", bcur);
  ok("选完弹窗自己关掉", !document.querySelector(".btbox"));

  /* ── 存 ── */
  document.querySelector('.bttab[data-tab="body"]').click(); await wait(200);
  document.querySelector('.btcard[data-pick="'+top.key+'"]').click(); await wait(300);
  ok("换了 BOT 之后照样改得动", bdirty()===true);
  document.getElementById("bSave").click(); await wait(1200);
  ok("保存后不脏了", bdirty()===false);
  /* 存完必须把每份文件的基准也刷新掉，否则下一次保存又会把它们全送一遍
     —— 那正是"改一个 BOT 却让 40 份全重写、多出 40 个 .bak"的成因。
     （"没送上去的文件不被动"这条硬保证由 test-bots 在接口层量文件时间戳来钉） */
  ok("存完就没有待送的文件了", Object.keys(bChanged()).length===0, Object.keys(bChanged()).join(","));
  /* ══ 商人货架页 ══ */
  page="assort"; render();
  for(let i=0;i<60&&!AD;i++)await wait(100);
  for(let i=0;i<60&&AD&&!document.querySelector(".ascard");i++)await wait(100);

  ok("货架读到了", AD&&AD.ok===true, AD&&AD.dir);
  ok("1 份货架", (AD.schemes||[]).length===1);
  ok("零校验问题", (AD.issues||[]).length===0, (AD.issues||[]).map(e=>e.code).join(","));

  /* 墙上一块瓦片 = 一件商品，**按物品真实占格铺**（服务端从 items.json 算好的 w/h） */
  const tiles=[...document.querySelectorAll(".ascard")];
  ok("2 件商品", tiles.length===2, tiles.length);
  ok("瓦片按占格铺", tiles.every(t=>/grid-column:\s*span \d+/.test(t.getAttribute("style")||"")),
     (tiles[0].getAttribute("style")||"").slice(0,40));
  ok("服务端送来了占格", (AD.tpls||[]).length>0&&(AD.tpls||[]).every(t=>t.w>=1&&t.h>=1),
     (AD.tpls||[]).map(t=>t.w+"x"+t.h).join(","));
  ok("服务端送来了分类图标", (AD.tpls||[]).some(t=>/^icon_.*\.png$/.test(t.icon||"")),
     (AD.tpls||[]).map(t=>t.icon).join(","));
  /* 商品名同样不能是十六进制 —— 名字要么来自 AD.tpls，要么来自开局就拉的物品表 */
  ok("瓦片提示里是名字不是 tpl", !/^[0-9a-f]{24}/.test(tiles[0].title||""),
     (tiles[0].title||"").slice(0,26));

  ok("左边货架墙比右边参数栏宽", W(".asshelf")>W(".aspar"), W(".asshelf")+" vs "+W(".aspar"));
  ok("没有横向溢出", document.documentElement.scrollWidth<=document.documentElement.clientWidth+2);
  /* 格网只能画在墙那块宽度里 —— 刷满整个面板就成了"墙无限宽只摆了几件" */
  ok("格网只画在墙上", W(".aswall")>0&&W(".aswall")<=W(".asgrid"), W(".aswall")+" / "+W(".asgrid"));

  /* 墙固定 12 排高（游戏里就是这么多），列数按宽度算出来 —— 「一排几个」的密度开关去掉了 */
  const wrapEl=document.querySelector(".aswrap2");
  const cellPx=parseFloat(getComputedStyle(wrapEl).getPropertyValue("--cell"));
  const colsN=parseInt(getComputedStyle(wrapEl).getPropertyValue("--cols"),10);
  const wallH=document.querySelector(".aswall").getBoundingClientRect().height;
  ok("格宽是算出来的", cellPx>=40&&cellPx<=110, cellPx+"px");
  ok("墙至少 12 排高", wallH>=12*cellPx-1, Math.round(wallH)+" >= "+(12*cellPx));
  /* ⚠️ 一排**就是 10 格**，写死的。中间试过一版"按宽度铺满"，在 Tech Leader 的屏上
     铺成了一排 23 格，当场被打回来 —— 这条断言就是防它再飘回去的。 */
  ok("一排固定 10 格", colsN===10, colsN+" 列");
  ok("墙宽 = 10 × 格宽", Math.abs(W(".aswall")-10*cellPx)<2, W(".aswall")+" vs "+(10*cellPx));
  ok("墙没有横向撑破容器", W(".aswall")<=W(".asgrid"), W(".aswall")+" / "+W(".asgrid"));
  ok("密度开关已经去掉", document.querySelectorAll("[data-cols]").length===0);
  /* 行列标尺：一面 12×N 的墙没有刻度就没法说"第 3 排第 5 格那件" */
  ok("列号尺 10 格", document.querySelectorAll("#aRx i").length===10,
     document.querySelectorAll("#aRx i").length);
  ok("行号尺至少 12 排", document.querySelectorAll("#aRy i").length>=12,
     document.querySelectorAll("#aRy i").length);
  ok("行号尺第一格是 1", (document.querySelector("#aRy i")||{}).textContent==="1");

  /* 空格子虚框：鼠标停在空地上才亮，压到瓦片上要收起来。
     ⚠️ 这里**直接调处理器**并递一个手搓的事件对象，不用 dispatchEvent ——
        `new MouseEvent(...)` 没派发时 target 是 null，处理器第一行就把虚框收了，
        断言会红得莫名其妙。 */
  const ghost=$("aGhost"), wallEl=document.querySelector(".aswall");
  const wr=wallEl.getBoundingClientRect();
  wallEl.onmousemove({target:wallEl, clientX:wr.left+wr.width-20, clientY:wr.top+wr.height-20});
  ok("空格子上亮虚框", ghost.classList.contains("on"), ghost.style.left+","+ghost.style.top);
  ok("虚框正好一格大", parseFloat(ghost.style.width)===cellPx&&parseFloat(ghost.style.height)===cellPx,
     ghost.style.width+"×"+ghost.style.height);
  ok("虚框对齐到格线", (parseFloat(ghost.style.left)-18)%cellPx<1&&(parseFloat(ghost.style.top)-18)%cellPx<1,
     ghost.style.left+","+ghost.style.top);
  /* 压在瓦片上时 e.target 不是墙 —— 虚框必须收起来，不然会盖在商品上 */
  wallEl.onmousemove({target:document.querySelector(".ascard"), clientX:0, clientY:0});
  ok("压在瓦片上就收起来", !ghost.classList.contains("on"));

  /* 商人头像：剪影永远先画上，真图盖在它上面 —— 取不到时 JS 把 <img> 摘掉露出剪影，
     绝不留空框。这份夹具在模组根的 res\ 里放了 LAB.png，所以真图应该取得到。 */
  for(let i=0;i<30;i++){const a=document.querySelector(".asface img");
    if(a&&a.complete)break; await wait(100);}
  ok("头像剪影一直在", !!document.querySelector(".asface svg"));
  const av=document.querySelector(".asface img");
  ok("商人头像画出了真图", !!av&&av.naturalWidth>0, av&&(av.naturalWidth+"px"));
  ok("头像走 /avimg 且带商人 id",
     !!av&&/^\/avimg\?id=aa0000000000000000000001&t=/.test(av.getAttribute("src")||""),
     av&&(av.getAttribute("src")||"").slice(0,50));

  /* 背景：工程图纸壁纸只透在**左边货架那半边**。
     右边参数栏铺实底 —— 图例说明挪进来之后，一大段小字压在网格上很吵。 */
  const clear=s=>{const c=getComputedStyle(document.querySelector(s)).backgroundColor;
                  return c==="transparent"||c==="rgba(0, 0, 0, 0)";};
  ok("壁纸画布在最底下", !!document.querySelector("#sky"));
  ok("货架面板不挡壁纸", clear(".asshelf"), getComputedStyle(document.querySelector(".asshelf")).backgroundColor);
  ok("格子区不挡壁纸", clear(".asgrid"), getComputedStyle(document.querySelector(".asgrid")).backgroundColor);
  ok("参数栏是实底不透壁纸", !clear(".aspar"), getComputedStyle(document.querySelector(".aspar")).backgroundColor);

  /* 图例说明搬到右边参数栏 —— 钉在墙底下时它横着占满预览区，等于从下面切掉一条格子 */
  const legend=document.querySelector(".asfoot");
  ok("图例在参数栏里", !!legend&&!!legend.closest(".aspar"),
     legend&&(legend.closest(".aspar")?"aspar":legend.parentElement.className));
  ok("货架那半边没有图例了", !document.querySelector(".asshelf .asfoot"));
  /* 而且它得在参数**下面**，不能骑到参数上面去 */
  ok("图例排在参数后面",
     legend.getBoundingClientRect().top>=document.querySelector("#aParams").getBoundingClientRect().top,
     Math.round(legend.getBoundingClientRect().top)+" vs "+
     Math.round(document.querySelector("#aParams").getBoundingClientRect().top));
  /* 墙底下腾出来的高度要真的还给格子区 */
  ok("格子区一直顶到货架面板底边",
     Math.abs(document.querySelector(".asgrid").getBoundingClientRect().bottom-
              document.querySelector(".asshelf").getBoundingClientRect().bottom)<2,
     Math.round(document.querySelector(".asgrid").getBoundingClientRect().bottom)+" vs "+
     Math.round(document.querySelector(".asshelf").getBoundingClientRect().bottom));

  /* 点瓦片选中 → 右边出参数。这就是"左预览右调参" */
  ok("没选中时右边是落脚页", !!document.querySelector(".aspempty"));
  tiles[0].click(); await wait(250);
  ok("点瓦片能选中", !!document.querySelector(".ascard.on"));
  const pi=document.querySelector("[data-price]");
  ok("右边出现参数栏", !!pi);
  pi.value="54321"; pi.dispatchEvent(new Event("input")); await wait(200);
  let sc=aScheme();
  ok("价格改得动", sc.barter_scheme[pi.dataset.price][0][0].count===54321,
     sc.barter_scheme[pi.dataset.price][0][0].count);
  ok("货币默认卢布", sc.barter_scheme[pi.dataset.price][0][0]._tpl==="5449016a4bdc2d6f028b456f");
  /* 换货币：价格保留、只换币种 */
  document.querySelector('[data-cur$="5696686a4bdc2da3298b456a"]').click(); await wait(250);
  sc=aScheme();
  ok("换得了货币且价格没丢",
     sc.barter_scheme[pi.dataset.price][0][0]._tpl==="5696686a4bdc2da3298b456a" &&
     sc.barter_scheme[pi.dataset.price][0][0].count===54321);
  /* 忠诚等级 */
  document.querySelector('[data-lv$="|3"]').click(); await wait(250);
  ok("等级改得动", aScheme().loyal_level_items[pi.dataset.price]===3);

  /* 空容器：这一页存在的理由。把子件删掉，那块瓦片应该立刻标红并给出装满入口 */
  sc=aScheme();
  const boxId=[...sc.items].find(i=>i.slotId==="cartridges").parentId;
  sc.items=sc.items.filter(i=>i.slotId!=="cartridges"); asel=boxId; render(); await wait(300);
  ok("空容器瓦片标红", !!document.querySelector(".ascard.bad"));
  ok("瓦片上有装满入口", !!document.querySelector("[data-fill]"));
  document.querySelector("[data-fill]").click(); await wait(300);
  const kid=aScheme().items.find(i=>i.parentId===boxId);
  ok("一键装满照模板填", !!kid&&kid.slotId==="cartridges", kid&&kid.slotId);
  ok("装的数量＝模板容量", kid&&kid.upd.StackObjectsCount===20, kid&&kid.upd.StackObjectsCount);
  ok("装的弹种在白名单里", kid&&kid._tpl==="58dd3ad986f77403051cba8f", kid&&kid._tpl);
  ok("装满后横幅消失", !document.querySelector(".asfill"));

  /* 删商品要连子件+价格+等级一起删，只删 items 会留孤儿 */
  const before2=aScheme().items.length;
  document.querySelector("[data-rm]").click(); await wait(200);
  const sc2=aScheme();
  ok("删商品连子件一起删", sc2.items.length===before2-2, before2+" → "+sc2.items.length);
  ok("价格表也清了", !sc2.barter_scheme[boxId]);
  ok("等级表也清了", !sc2.loyal_level_items[boxId]);

  /* 点墙上的**空地**＝添加商品。塔科夫那面墙就是一格一格摆的，"在空格子上添加"最顺手。
     瓦片自己吃掉点击（e.target 是瓦片不是墙），所以只有落在墙本体上那一下才算。 */
  const nBefore=aScheme().items.length;
  /* 这还是**这一趟里第一次**开选择器 —— 物品表要现拉，走的是异步那条路。
     以前栽过：place() 拿 e.currentTarget 定位，而它在异步回来时已经变回 null，
     弹窗画出来了但接线整段没跑到，表现成"能开、点不动"。 */
  ok("这是第一次开选择器（走异步拉表那条路）", !QITEMS);
  /* ⚠️ 判"开着没开着"只能看 #ipick 的 .on 类：这个窗口的 DOM **一直在**（写死在 index.html 里，
     不在 #main 内），查 `#ipick` 存不存在会恒真 —— 那就是空集假绿。
     它也**不挂在 #pop 上**，所以 hide() 关不掉它，别拿 pop 的状态来判。 */
  const ipOn=()=>$("ipick").classList.contains("on");
  ok("一开始物品窗是关着的", !ipOn());
  document.querySelector(".aswall").click();
  for(let i=0;i<40&&!(ipOn()&&document.querySelector(".iprow"));i++)await wait(100);
  ok("点空格子弹出物品选择器", ipOn());
  /* 用的就是任务编辑页那个窗口：可拖动的标题栏 + 左边分类树 + 右边带价格的列表 */
  ok("用的是任务页那个物品窗", !!document.querySelector("#ipick #ipHead")&&
     !!document.querySelector("#ipick .ipcats")&&!!document.querySelector("#ipick .iplist"));
  ok("左边分类树有内容", document.querySelectorAll("#ipcats button").length>10,
     document.querySelectorAll("#ipcats button").length);
  ok("每行都带 handbook 价格", [...document.querySelectorAll(".iprow")].every(r=>r.querySelector(".pp")));
  /* 标题按调用方给的走（"添加商品"），不是任务页那句"选择物品" */
  ok("窗口标题是本页给的", $("ipTitle").textContent===T("a_add"), $("ipTitle").textContent);
  /* 货架页没有"内容语言"这回事，列表得跟界面语言 —— qlang 默认是 "ch"，
     跟着它的话英文界面会看到一列中文名 */
  ok("列表跟界面语言不跟 qlang", ipZh()===(lang==="zh"), "ipZh="+ipZh()+" lang="+lang+" qlang="+qlang);

  const ipRow=document.querySelector(".iprow");
  ok("选择器里有物品可挑", !!ipRow, ipRow&&ipRow.dataset.i);
  const pxWant=(QITEMS.byId[ipRow.dataset.i]||{}).price;
  ipRow.click(); await wait(300);
  const sc3=aScheme();
  ok("挑完真加进货架", sc3.items.length===nBefore+1, nBefore+" → "+sc3.items.length);
  /* 新商品必须三张表一次配齐，不然它一出生就是"看得见买不了" */
  ok("新商品三张表一次配齐", !!sc3.barter_scheme[asel]&&!!sc3.loyal_level_items[asel]);
  /* 起手价用 handbook 参考价（选的时候那一列就写着），没价才退回 1000 */
  const pxGot=sc3.barter_scheme[asel][0][0].count;
  ok("起手价取 handbook 参考价", pxGot===(Math.round(pxWant)>0?Math.round(pxWant):1000),
     "handbook="+pxWant+" → "+pxGot);
  ok("挑完就关掉选择器", !ipOn());
  document.querySelector(".ascard").click(); await wait(250);
  ok("点瓦片不会误开选择器", !ipOn());
  /* ESC 能关：这个窗口的关闭走它自己那套（✕ / ESC / 选中），和 #pop 无关 */
  document.querySelector(".aswall").click();
  for(let i=0;i<40&&!ipOn();i++)await wait(100);
  ok("再开一次也开得起来", ipOn());
  dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"})); await wait(200);
  ok("ESC 关得掉物品窗", !ipOn());

  /* 「任务」页签跳到任务编辑页 —— 这一版不在货架里编任务，页签得是真能点的按钮 */
  const tq=document.querySelector("#aToQuest");
  ok("任务页签是能点的按钮", !!tq&&tq.tagName==="BUTTON", tq&&tq.tagName);
  tq.click(); await wait(500);
  ok("点任务页签跳到任务编辑页", page==="quest"&&!document.querySelector(".aswall"), page);
  page="assort"; render(); await wait(400);
  ok("跳回来货架还在", !!document.querySelector(".aswall"));

  /* ══ 内容库选择弹窗（modroot.js）══
     真的走完"选中"会把内容库改掉，后面就没得测了，所以这里只验渲染和取消。
     选中之后的行为（POST /api/mods、记住、重启还在）由 test-modroot 在接口层覆盖。 */
  const fake={ok:false,need:"pick",eft:"X:\\EFT",found:[
    {path:"X:\\EFT\\SPT_Runtime\\user\\mods\\A\\db",mod:"A",bots:3,assorts:0,looks:true},
    {path:"X:\\EFT\\SPT_Runtime\\user\\mods\\B\\db",mod:"B",bots:0,assorts:2,looks:false}]};
  modPick(fake); await wait(300);
  ok("两个候选时弹窗", !!document.querySelector(".mrbox"));
  ok("列出两条候选", document.querySelectorAll(".mrrow").length===2,
     [...document.querySelectorAll(".mrrow b")].map(e=>e.textContent).join(","));
  ok("写清楚每条里有什么", /3/.test(document.querySelector(".mrrow i").textContent),
     document.querySelector(".mrrow i").textContent.trim());
  ok("输入框预填第一条", document.getElementById("mrIn").value===fake.found[0].path,
     document.getElementById("mrIn").value);
  ok("也留了自己填路径的出口", !!document.querySelector(".mrown"));
  document.getElementById("mrCancel").click(); await wait(200);
  ok("取消能关掉", !document.querySelector(".mrbox"));

  /* 一个候选都没有：同一个壳，没有候选行，输入框预填到 user\mods 为止 */
  modPick({ok:false,need:"pick",eft:"X:\\EFT",found:[]}); await wait(300);
  ok("没有候选时也给弹窗", !!document.querySelector(".mrbox"));
  ok("没有候选行", document.querySelectorAll(".mrrow").length===0);
  ok("输入框预填到 mods 目录", /user\\mods\\$/.test(document.getElementById("mrIn").value),
     document.getElementById("mrIn").value);
  document.getElementById("mrCancel").click(); await wait(200);

  /* ══ 自定义鼠标指针（cursor.css）══
     ⚠️ **getComputedStyle 只能证明"CSS 写进去了"，证明不了"这张图真画得出来"** ——
        素材 404 或 SVG 语法坏掉时，computed 值和正常时一模一样（实测过）。
        所以下面每一条 url() 都真去 new Image() 加载一遍，看 naturalWidth。
     ⚠️ cursor 是**继承属性**：随便量一个元素只能证明 html 那条生效了。
        真正要盯的是那 75 处各自声明的地方有没有换过来，所以**逐类取样**。 */
  const curOf=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).cursor:"";};
  const curUrl=v=>(String(v).match(/url\("([^"]+)"\)/)||[])[1]||"";
  const curLoad=u=>new Promise(r=>{const im=new Image();
    im.onload=()=>r(im.naturalWidth>0);im.onerror=()=>r(false);im.src=u;});

  ok("根元素挂上了自定义指针", /^url\("data:image\/svg\+xml/.test(curOf("html")), curOf("html").slice(0,44));
  ok("指针带了关键字兜底", /,\s*default$/.test(curOf("html")), curOf("html").slice(-40));
  ok("指针图真的画得出来（不是坏 URI）", await curLoad(curUrl(curOf("html"))));

  /* 逐类取样：每一类都得是自己那一档，不能是继承下来的箭头 */
  page="assort"; render(); await wait(400);
  const curSamples=[[".nitem","侧脊按钮","pointer"],[".btn","主按钮","pointer"],
    ["#ipHead","物品窗标题栏","move"],[".iprow","物品行","pointer"],["#ipq","搜索框","text"],
    [".ascard","货架瓦片","pointer"],[".aswall","货架空格子","copy"],[".assplit","分隔条",""]];
  for(const [sel,name,kw] of curSamples){
    const v=curOf(sel);
    if(!v){ok("取样 "+name+" 存在", false, sel); continue;}
    ok("取样 "+name+" 换成自定义指针", /^url\("data:/.test(v), sel+" → "+v.slice(0,30));
    if(kw)ok("取样 "+name+" 兜底是 "+kw, v.endsWith(", "+kw), v.slice(-22));
  }
  /* 「添加」那一档得和「可点」不是同一张图 —— 空格子是加商品不是普通点击 */
  ok("空格子和普通可点不是同一张图", curUrl(curOf(".aswall"))!==curUrl(curOf(".ascard")));
  ok("空格子那张图也画得出来", await curLoad(curUrl(curOf(".aswall"))));

  /* bot.js 在 SVG 上写的是**行内** style="cursor:…"，行内样式任何选择器都盖不住，
     所以它必须自己就写成 var(--cur-p)，漏了就是全站唯一一处系统指针 */
  page="cloth"; render(); await wait(500);
  const curSvg=document.querySelector(".btport [data-tab]");
  ok("装配示意图的行内指针也换了", !!curSvg&&/^url\("data:/.test(getComputedStyle(curSvg).cursor),
     curSvg&&getComputedStyle(curSvg).cursor.slice(0,30));

  /* 明暗两套是两张不同的图：浅色主题得反过来（近黑本体 + 骨白描边），
     只做一套的话浅色主题下骨白指针压在 #E7E4DC 面板上只剩一圈线 */
  const curDark=curUrl(curOf("html"));
  setTheme("light"); await wait(150);
  const curLight=curUrl(curOf("html"));
  ok("浅色主题换了另一张图", curLight&&curLight!==curDark);
  ok("浅色那张也画得出来", await curLoad(curLight));
  setTheme("dark"); await wait(150);

  /* 关掉开关要能整套退回系统指针（自定义指针会盖掉系统的指针放大/高对比度设置） */
  setCur(false); await wait(150);
  ok("关掉后退回原生关键字", curOf("html")==="default"&&curOf(".nitem")==="pointer",
     curOf("html")+" / "+curOf(".nitem"));
  setCur(true); await wait(150);
  ok("再打开又回来", /^url\("data:/.test(curOf("html")));

  /* 拖动锁：拖分隔条时鼠标会离开那 7px 的把手，不锁住就一路闪 */
  document.documentElement.dataset.drag="ew";
  ok("拖动时全屏锁成同一个形状",
     curUrl(curOf(".nitem"))===curUrl(curOf("html"))&&curOf(".nitem").endsWith(", ew-resize"),
     curOf(".nitem").slice(-24));
  delete document.documentElement.dataset.drag;
  ok("松手后恢复", curOf(".nitem").endsWith(", pointer"), curOf(".nitem").slice(-20));

}catch(e){ L.push("EXCEPTION "+e.message+" @ "+(e.stack||"").split("\n")[1]); }
/* 结果回写成工作区里的一个 .dlg，跟浏览器生命周期解耦（--dump-dom 会提前收掉浏览器） */
fetch("/api/dlg?path=_probe.dlg",{method:"POST",
  headers:{"X-Token":document.querySelector("meta[name=tok]").content,
           "Content-Type":"application/json"},
  body:JSON.stringify({nodes:[{name:"PROBE",tail:L}]})});
})();
</script>
