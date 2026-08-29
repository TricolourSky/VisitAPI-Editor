/* ══════════════════════════════════════════════════════════════════
   章节编辑器（SEC.04）—— 左「章节卡」／右「章节册」
   跑在 index.html 和 quest.js 之后，直接用它们的全局：
   T / TF / $ / esc / hide / render / page / lang / TOK / confirm2 / secNo / issueText
   QD / qcur / qlang / questLoad / questSave / qdirty / qtouch / qtext / qsetText / qloc / qsetLoc / dropLoc
   qname / qtrader / dig / put / NEWID / NOTE_KEYS / objText / itemLabel / QITEMS / qiWait
   isChap / subConds / chaptersOf / chapItems / addSub / normFin / chainSubs / subMenu / makeChapter
   qAdd / qRowMenu / imgOpen / newQuest / delQuest / rootPane / wireRoot

   ── 定位（Tech Leader 定的）────────────────────────────────────────
   和任务编辑同一套骨架（页头 / 左工作台 / 右画布 / 底部状态条），但**卡片照 1.1 剧情页的版式**：
   左边一列章节图标、顶上横幅 + 章节名 + 状态、主要目标 / 可选目标 / 日记 / 相关物品。
   卡片就地可编：目标能加能删能改字、日记直接写、物品直接挑。AIC 皮。

   ── 数据 ──────────────────────────────────────────────────────────
   章节就是一条任务 JSON（visitapi.chapter），子任务 = 它目标里的「完成任务」（末条 isFinisher）。
   所以**数据、存盘、脏检查全和任务页共用一份 QD** —— 这边改了那边刷新就看得到，反之亦然。
   quest.js 里的增删菜单（qAdd / qRowMenu / imgOpen …）都按 qcur 找"当前任务"，
   这一页上 qcur 就是"正在动的那条"：动章节本身时 = ccur，给某条子任务加目标时 = 那条子任务。
   ══════════════════════════════════════════════════════════════════ */

let ccur=null;        /* 当前章节 id */
let cSt=1;            /* 卡片上模拟的章节状态：0 未开放 / 1 进行中 / 2 已完成 —— 只影响外观，不写数据 */
const chapters=()=>QD&&QD.ok?Object.keys(QD.quests).filter(x=>isChap(QD.quests[x])):[];
const cq=()=>QD.quests[ccur];
const cimg=v=>v?`style="background-image:url('/qimg?name=${encodeURIComponent(v)}&t=${encodeURIComponent(TOK)}')"`:"";
/* 只看跟章节有关的校验：章节本身 + 它们的子任务 */
const cIssues=()=>{const ids=new Set(chapters().flatMap(c=>[c,...subConds(QD.quests[c]).map(s=>s.target)]));
  return (QD.issues||[]).filter(e=>ids.has(e.questId));};

function chapterPage(){
  if(!QD){questLoad();return cshell(`<div class="tempty" style="margin:2rem">${T("q_load")}</div>`);}
  if(!QD.ok)return cshell(rootPane());
  const chs=chapters(); if(!chs.includes(ccur))ccur=chs[0]||null;
  const errs=cIssues(), ch=ccur?cq():null;
  return `<div class="dlgwrap">
    <header class="hdr">
      <div class="slab"></div>
      <div class="tt"><i>// SEC.${secNo("chapter")}</i><h2>${T("nav_chapter")}</h2>
        <div class="glyph">${(ccur||"chapter").split("").join(" ")}</div></div>
      <div class="cart">
        <div><k>${T("q_hdr_file")}</k><v>${esc(ccur?QD.owner[ccur]||"—":"—")}</v></div>
        <div><k>${T("q_hdr_trader")}</k><v>${esc(ch?qtrader(ch.traderId):"—")}</v></div>
        <div><k>${T("ch_hdr_count")}</k><v>${chs.length}</v></div>
      </div>
      <span class="sp"></span>
      <span class="saved" id="qsaved">${qdirty()?T("q_dirty"):""}</span>
      <span class="stat ${errs.length?"":"clean"}">${errs.length?TF("q_issues",errs.length):"✓ "+T("q_clean")}</span>
      <div class="acts">
        <button class="btn ghost" id="cReload"><span>${T("q_reload")}</span></button>
        <button class="btn pri" id="cSave"><span>${T("q_save")}</span></button>
      </div>
    </header>
    <div class="tape ${errs.length?"hot":""}"></div>
    <div class="work qwork cwork">
      <section class="viewport" id="viewport">
        <div class="qstates">
          ${[0,1,2].map(i=>`<button data-cst="${i}" aria-current="${cSt===i}" title="${esc(T("ch_sim_tip"))}">${T("q_prev_st"+i)}</button>`).join("")}
          <span class="sp"></span>
          <div class="langsw" id="qlangsw" title="${esc(T("q_contentlang"))}">
            <button data-l="ch" aria-pressed="${qlang==="ch"}">中文</button>
            <button data-l="en" aria-pressed="${qlang==="en"}">EN</button></div>
        </div>
        <div class="stagepane">${ch?chCard(ch):chEmpty()}</div>
      </section>
      <div class="cbook" id="cbook">${chFlow(ch,errs)}</div>
    </div>
    <footer class="telem">
      <span><b>${T("ch_telem")}</b></span>
      <span>${T("ch_t_chapters")} <em>${chs.length}</em></span>
      <span>${T("ch_t_subs")} <em>${chs.reduce((a,c)=>a+subConds(QD.quests[c]).length,0)}</em></span>
      <span class="sp"></span>
      <span class="${errs.length?"bad":""}" id="cvtoggle">${T("q_t_warn")} <em>${errs.length}</em></span>
    </footer>
  </div>`;
}
const cshell=inner=>`<div class="dlgwrap"><header class="hdr"><div class="slab"></div>
  <div class="tt"><i>// SEC.${secNo("chapter")}</i><h2>${T("nav_chapter")}</h2></div>
  <span class="sp"></span></header><div class="tape"></div>
  <div class="work"><section class="viewport" style="flex:1 1 auto">${inner}</section></div></div>`;
const chEmpty=()=>`<div class="tool"><div class="tnote">${T("ch_empty_note")}</div>
  <div class="tempty" style="margin-top:.5rem">${T("ch_empty")}</div>
  <div class="tsec"><button class="add" id="cNewIn">${T("ch_new")}</button></div></div>`;

/* ── 章节卡 ── 版式照 1.1 剧情页：图标列 / 横幅 / 主要目标 / 可选目标 / 日记 / 相关物品，最后是子任务顺序 */
function chCard(ch){
  const subs=subConds(ch).map(c=>QD.quests[c.target]).filter(Boolean);
  const objs=subs.flatMap(s=>(s.conditions?.AvailableForFinish||[]).map((c,i)=>({s,c,i})));
  const main=objs.filter(x=>x.c.isNecessary!==false), opt=objs.filter(x=>x.c.isNecessary===false);
  const icon=dig(ch,"visitapi.icon")||"";
  return `<div class="chcard" data-st="${["unavail","active","done"][cSt]}">
    <div class="chicons">${chapters().map(chTile).join("")}
      <button class="chtile new" id="cNew" title="${esc(T("ch_new"))}">＋</button></div>
    <div class="chbody">
      <div class="chban" ${cimg(ch.image)}>
        <div class="chplate${icon?"":" empty"}" data-chimg="visitapi.icon" ${cimg(icon)} title="${esc(T("q_chap_icon"))}"></div>
        <div class="chtitle"><i>${T("ch_label")}</i>
          <h3 contenteditable="plaintext-only" data-cf="name" data-ph="${esc(T("q_name_ph"))}">${esc(qtext(ch,"name"))}</h3></div>
        <em class="chstate">${T("q_prev_st"+cSt)}</em>
        <button class="chpick" data-chimg="image" title="${esc(T("q_look_hint"))}">${T(ch.image?"ch_banner_change":"ch_banner_pick")}</button>
      </div>
      <div class="chdesc" contenteditable="plaintext-only" data-cf="description" data-ph="${esc(T("q_desc_ph"))}">${esc(qtext(ch,"description"))}</div>
      ${csec("q_prev_main",main.length)}
      ${subs.length?subs.map(s=>chObjGroup(s,main)).join(""):`<div class="tempty bad">${T("ch_no_subs")}</div>`}
      ${csec("q_prev_opt",opt.length)}
      ${opt.length?opt.map(chObjRow).join(""):`<div class="chhint">${T("ch_opt_hint")}</div>`}
      ${csec("q_prev_notes",null)}${chNotes(ch,subs)}
      ${csec("q_prev_items",null)}${chItems(ch,subs)}
      ${csec("q_sec_subs",subConds(ch).length,{k:"sub",t:"q_add_sub"})}${chSubs(ch)}
    </div></div>`;
}
const csec=(k,n,add)=>`<div class="chsec"><h5>${T(k)}</h5>${n==null?"":`<u class="${n?"":"n0"}">${n}</u>`}${
  add?`<button class="add" data-cadd="${add.k}">${T(add.t)}</button>`:""}</div>`;
const chTile=x=>{const q=QD.quests[x], bad=(QD.issues||[]).some(e=>e.questId===x&&e.level==="err");
  return `<button class="chtile${x===ccur?" cur":""}${bad?" bad":""}" data-cgo="${x}" ${cimg(dig(q,"visitapi.icon"))} title="${esc(qname(q))}"></button>`;};

/* 一条子任务的目标组：抬头是子任务名（点了跳去任务页）+ 三个开关芯片 + ＋目标；下面是它的主要目标 */
function chObjGroup(s,main){
  const rows=main.filter(x=>x.s===s);
  const sw=[["visitapi.autoStart","q_ch_auto"],["visitapi.autoFinish","q_ch_autoFinish"],["visitapi.dialogOnly","q_ch_dlg"]];
  return `<div class="chgrp"><div class="chgh">
      <b class="goto" data-cgoq="${s._id}" title="${esc(T("q_a_goto"))}">${esc(qname(s))}</b>
      <span class="chips">${sw.map(([p,k])=>`<button class="chsw" data-csw="${s._id}|${p}" aria-pressed="${!!dig(s,p)}">${T(k)}</button>`).join("")}</span>
      <button class="add" data-cobj="${s._id}">${T("q_add_obj")}</button></div>
    ${rows.map(chObjRow).join("")||`<div class="chhint">${T("q_e_obj")}</div>`}</div>`;
}
/* 目标行：方勾（模拟状态下打勾）· 文字可改 · 小字是哪条子任务/什么类型 · 主/可选 · ⋮（复用任务页的行菜单） */
const chObjRow=x=>{const o=objText(x.c), txt=(x.c.id&&qloc(x.c.id))||o.text;
  return `<div class="chobj"><i class="tick"></i>
    <span class="tt" contenteditable="plaintext-only" ${x.c.id?`data-lockey="${esc(x.c.id)}"`:""}>${esc(txt)}</span>
    <small>${esc(qname(x.s))} · ${esc(o.kind)}${o.value>1?` × ${esc(o.value)}`:""}</small>
    <button class="nec" data-cnec="${x.s._id}|${x.i}" title="${esc(T("ch_nec_tip"))}">${T(x.c.isNecessary===false?"ch_optional":"ch_main")}</button>
    <button class="dots" data-cmenu="${x.s._id}|${x.i}">⋮</button></div>`;};

/* 日记：章节自己一组 + 每条子任务一组；模拟状态下该解锁的亮、没解锁的暗 */
function chNotes(ch,subs){
  return [ch,...subs].map(q=>`<div class="chjr"><b>${q===ch?T("ch_label"):esc(qname(q))}</b>${NOTE_KEYS.map(k=>{
    const on=k==="Started"?cSt>=1:k==="Success"?cSt===2:false;
    return `<div class="chnote${on?" on":""}"><k>${T("q_note_"+k)}</k>
      <span contenteditable="plaintext-only" data-cnote="${q._id}|${k}" data-ph="${esc(T("q_note_ph"))}">${esc(qloc(q.notes?.[k]||""))}</span></div>`;}).join("")}</div>`).join("");
}
/* 相关物品：章节自己填的能摘；子任务目标里带的物品插件会自动并进来，这里灰着只看不删 */
function chItems(ch,subs){
  const own=dig(ch,"visitapi.items")||[], auto=[...new Set(subs.flatMap(chapItems))].filter(t=>!own.includes(t));
  return `<div class="chitems">${own.map((t,i)=>`<span class="chitem"><b>${esc(itemLabel(t))}</b><button data-cdelitem="${i}" title="${esc(T("q_a_del"))}">✕</button></span>`).join("")}
    ${auto.map(t=>`<span class="chitem auto" title="${esc(T("ch_item_auto"))}"><b>${esc(itemLabel(t))}</b></span>`).join("")}
    <button class="chitem add" data-cadd="item">${T("q_add_item")}</button></div>`;
}
function chSubs(ch){
  const subs=subConds(ch);
  return (subs.length?subs.map((c,i)=>subRow(c,i)).join(""):`<div class="tempty bad">${T("q_e_subs")}</div>`)
    +(subs.length>1?`<div class="chsec"><h5>${T("q_chap_chain")}</h5><i class="chhint">${T("q_chap_chain_d")}</i>
      <button class="add" data-chain>${T("q_chap_chain_btn")}</button></div>`:"");
}
/* 子任务行：序号 · 名字（点了跳去任务页）· 开关芯片 · 终章标记 · ⋮ */
function subRow(c,i){
  const s=QD.quests[c.target];
  const chips=s?[["visitapi.autoStart","q_ch_auto"],["visitapi.autoFinish","q_ch_autoFinish"],["visitapi.dialogOnly","q_ch_dlg"]]
    .filter(([p])=>dig(s,p)).map(([,k])=>`<i>${T(k)}</i>`).join(""):"";
  return `<div class="trow goal sub${s?"":" bad"}">
    <span class="tag"><s>${String(i+1).padStart(2,"0")}</s></span>
    <span class="tt${s?" goto":""}" ${s?`data-gotoq="${c.target}" title="${esc(T("q_a_goto"))}"`:""}>${
      s?esc(qname(s)):TF("q_sub_missing",c.target.slice(0,8))}${
      s?`<small>${TF("q_sub_stat",(s.conditions?.AvailableForFinish||[]).length,Object.keys(s.notes||{}).length)}</small>`:""}</span>
    <span class="chips">${chips}${failOk(c)?`<i title="${esc(T("ch_failok_on"))}">${T("ch_failok")}</i>`:""}${c.isFinisher?`<b>${T("q_ch_fin")}</b>`:""}</span>
    <button class="dots" data-menu="sub" data-i="${i}">⋮</button></div>`;
}

/* ── 章节册 ── 右边画布：所有章节一列（照剧情页那列图标的意思），工具条 ＋ / ✕ / ⇢，底下校验面板 */
/* ══════════════ 右栏：两块流程图 ══════════════
   上＝这一章相关的**对话节点**（复用对话页的 drawGraph()，无关节点压暗）；
   下＝这一章的**子任务链**（自己画，按章节内部的前置深度排）。中间一条可拖的横条。
   ⚠️ 对话图用的是对话页那套全局（doc / gx,gy,gs / drawGraph / drawEdges / applyView / fit），
   所以容器 id 必须原样叫 graph / gvp / edges / gnodes —— 页面之间是互斥渲染的，不会撞。
   但**节点上的点击/拖拽要重新接**：原版点一下会走 refresh()，那要用到对话页才有的 DOM（#bglayer 等）。 */
let cfTopH=null;                 /* 上半的高度，拖过就记住（切页后 render 会重放） */
const chDlgFile=ch=>ch?String(ch.traderId||"")+".dlg":null;
const chDlgOpen=ch=>{const w=chDlgFile(ch);
  return !!(w&&filePath&&String(filePath).toLowerCase().endsWith(w.toLowerCase()));};
/* 这一章"碰到"的对话节点：选项挂了本章任务的，或者触发点落在这一屏的 */
function chNodesOf(ch){
  const ids=new Set([ch._id,...subConds(ch).map(c=>c.target)]);
  const f=chDlgFile(ch), same=x=>String(x||"").toLowerCase()===String(f||"").toLowerCase();
  const out=new Set();
  (QL?.links||[]).forEach(l=>{if(ids.has(l.questId)&&same(l.file))out.add(l.node);});
  (QL?.triggers||[]).forEach(t=>{if(same(t.file)&&t.node&&(ids.has(t.questId)||ids.has(t.accept)||ids.has(t.finish)||ids.has(t.fail)))out.add(t.node);});
  return out;
}
const cfpane=(id,title,n,tools,body)=>`<div class="cfpane" id="${id}">
  <div class="cfhead"><h5>${T(title)}</h5>${n==null?"":`<u class="${n?"":"n0"}">${n}</u>`}
    <span class="sp"></span>${tools||""}</div>${body}</div>`;

function chFlow(ch,errs){
  const open=chDlgOpen(ch), want=chDlgFile(ch);
  const top=!ch?`<div class="cfempty">${T("ch_flow_nochap")}</div>`
    :open?`<div class="graph cfgraph" id="graph">
        <div class="gviewport" id="gvp"><svg class="gedge" id="edges"></svg><div id="gnodes"></div></div></div>`
    :`<div class="cfempty">${T("ch_flow_nodlg")}
        <button class="add" id="cfOpen">${TF("ch_flow_open",esc(want))}</button></div>`;
  return `<div class="gtools">
      <button class="pri" id="cNewB" title="${esc(T("ch_new"))}"><span>＋</span></button>
      <button id="cDel" title="${esc(T("ch_del"))}"><span>✕</span></button>
      <div class="sep"></div>
      <button id="cToQuest" title="${esc(T("ch_toquest"))}"><span>⇢</span></button>
    </div>
    <div class="cflow">
      ${cfpane("cfTop","ch_flow_dlg",null,
        open?`<button class="add" id="cfFit">${T("ch_flow_fit")}</button>
              <button class="add" id="cfGoDlg">${T("ch_flow_godlg")}</button>`:"",top)}
      <div class="hsplit" id="cfSplit" title="${esc(T("tip_split"))}"></div>
      ${cfpane("cfBot","ch_flow_quest",ch?subConds(ch).length:null,
        `<button class="add" id="cfQFit">${T("ch_flow_fit")}</button>`,
        `<div class="graph cfgraph" id="cqgraph">
          <div class="gviewport" id="cqvp"><svg class="gedge" id="cqedges"></svg><div id="cqnodes"></div></div></div>`)}
    </div>
    <div class="vpanel" id="cvpanel">
      <h4>${TF("q_v_title",errs.length)}</h4>
      ${errs.map(e=>`<div class="vrow" data-e="${esc(e.questId||"")}">
        <i class="${e.level==="warn"?"warn":""}">${e.level==="warn"?T("q_v_warn"):T("q_v_err")}</i>
        <div><b>${esc(QD.quests[e.questId]?qname(QD.quests[e.questId]):e.questId)}</b><small>${issueText(e)}</small></div></div>`).join("")
        ||`<div class="vrow"><div><b>${T("q_v_none")}</b></div></div>`}
    </div>`;
}

/* ── 下半：本章子任务链 ──
   层级 = 章节内部的前置深度（只看"前置也在这一章里"的那些，章节外的前置不参与排版）。
   卡片和连线都借任务页的皮（.qnode / .gedge），所以看起来和任务编辑页是一家。 */
const CQW=210, CQH=104, CQGX=250, CQGY=118;
let cqx=24, cqy=24, cqs=1;
const cqapply=()=>{const v=$("cqvp"); if(v)v.style.transform=`translate(${cqx}px,${cqy}px) scale(${cqs})`;};
function chQLayout(ch){
  const subs=subConds(ch).map(c=>c.target).filter(x=>QD.quests[x]);
  const inside=new Set(subs);
  const pre=id=>qprereq(id).filter(p=>inside.has(p));
  const depth={}, d=id=>depth[id]??=(seen=>{const p=pre(id);return p.length?1+Math.max(...p.map(x=>seen.has(x)?0:(seen.add(x),d(x)))):0;})(new Set([id]));
  subs.forEach(d);
  const cols={}; subs.forEach(id=>(cols[depth[id]] ??= []).push(id));
  const pos={}; Object.keys(cols).forEach(c=>cols[c].forEach((id,i)=>pos[id]={x:+c*CQGX,y:i*CQGY}));
  return {subs,pos,pre};
}
function chQGraph(ch){
  if(!$("cqnodes"))return;
  if(!ch||!subConds(ch).length){$("cqnodes").innerHTML=`<div class="cfempty">${T("ch_flow_nosub")}</div>`;$("cqedges").innerHTML="";return;}
  const {subs,pos,pre}=chQLayout(ch), errs=QD.issues||[];
  $("cqnodes").innerHTML=subs.map((id,n)=>{
    const q=QD.quests[id], p=pos[id];
    const bad=errs.some(e=>e.questId===id&&e.level==="err");
    const sw=[["visitapi.autoStart","q_ch_auto"],["visitapi.autoFinish","q_ch_autoFinish"],["visitapi.dialogOnly","q_ch_dlg"]]
      .filter(([k])=>dig(q,k)).map(([,k])=>`<i>${T(k)}</i>`).join("");
    const fin=subConds(ch).find(c=>c.target===id)?.isFinisher;
    return `<div class="qnode${bad?" bad":""}" data-cq="${id}" style="left:${p.x}px;top:${p.y}px;width:${CQW}px">
      <div class="qslab"></div>
      <div class="qh"><em><s>${String(n+1).padStart(2,"0")}</s></em><i>${id.slice(0,8)}</i></div>
      <div class="qb">${esc(qname(q))}</div>
      <div class="qs"><span>${T("q_g_obj")} <b>${(q.conditions?.AvailableForFinish||[]).length}</b></span>
        <span class="chips">${sw}${fin?`<b>${T("q_ch_fin")}</b>`:""}</span></div>
      <div class="qsockin"></div><div class="qsock"></div></div>`;}).join("");
  /* 直角折线，和任务页同一套画法：出右边 → 折中间 → 进左边 */
  let d="";
  subs.forEach(id=>pre(id).forEach(p=>{
    const a=pos[p], b=pos[id];
    const sx=a.x+CQW, sy=a.y+18, tx=b.x, ty=b.y+18, mx=(sx+tx)/2;
    d+=`<path d="M${sx},${sy} H${mx} V${ty} H${tx}" fill="none" stroke="#6A727E" stroke-opacity=".6" stroke-width="1.4"/>`;
  }));
  $("cqedges").innerHTML=d;
  cqapply();
}
function chQFit(){
  const ch=ccur?cq():null, g=$("cqgraph"); if(!ch||!g)return;
  const {subs,pos}=chQLayout(ch); if(!subs.length)return;
  const maxx=Math.max(...subs.map(i=>pos[i].x+CQW)), maxy=Math.max(...subs.map(i=>pos[i].y+CQH));
  const r=g.getBoundingClientRect();
  cqs=Math.max(.3,Math.min(1,Math.min((r.width-70)/maxx,(r.height-30)/maxy)));
  cqx=24; cqy=16; cqapply();
}
/* 平移 + 滚轮缩放：两块各一套，别互相影响 */
function cqWire(){
  const g=$("cqgraph"); if(!g)return;
  g.onmousedown=e=>{if(e.target.closest(".qnode"))return;
    const ox=e.clientX-cqx,oy=e.clientY-cqy;
    const mv=ev=>{cqx=ev.clientX-ox;cqy=ev.clientY-oy;cqapply();};
    const up=()=>{removeEventListener("mousemove",mv);removeEventListener("mouseup",up);};
    addEventListener("mousemove",mv);addEventListener("mouseup",up);};
  g.onwheel=e=>{e.preventDefault();const r=g.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top,k=e.deltaY<0?1.12:1/1.12;
    const ns=Math.min(1.6,Math.max(.25,cqs*k));cqx=mx-(mx-cqx)*(ns/cqs);cqy=my-(my-cqy)*(ns/cqs);cqs=ns;cqapply();};
  $("cqnodes").querySelectorAll("[data-cq]").forEach(el=>el.onclick=()=>{
    qcur=el.dataset.cq;qpane="card";page="quest";render();});
}
/* 上半：借对话页的 drawGraph()，画完把点击/拖拽换成"跳去对话编辑"
   （原版的 onclick 会走 refresh()，那要 #bglayer 之类只有对话页才有的 DOM） */
function cfWireDlg(ch){
  if(!$("gnodes")||!ch)return;
  drawGraph(); applyView();
  const mine=chNodesOf(ch);
  $("gnodes").querySelectorAll(".gnode").forEach(el=>{
    const n=el.dataset.n;
    el.classList.toggle("dim",mine.size>0&&!mine.has(n));
    el.onmousedown=null; el.ondblclick=null;
    el.onclick=()=>{page="dlg";render();loadDoc(filePath,n);};
    const head=el.querySelector(".ghead"); if(head){head.ondblclick=null;head.onmousedown=e=>e.stopPropagation();}
    const r=el.querySelector(".grole"); if(r){r.onclick=e=>e.stopPropagation();}});
  const g=$("graph"); if(!g)return;
  g.onmousedown=e=>{if(e.target.closest(".gnode"))return;
    const ox=e.clientX-gx,oy=e.clientY-gy;
    const mv=ev=>{gx=ev.clientX-ox;gy=ev.clientY-oy;applyView();};
    const up=()=>{removeEventListener("mousemove",mv);removeEventListener("mouseup",up);};
    addEventListener("mousemove",mv);addEventListener("mouseup",up);};
  g.onwheel=e=>{e.preventDefault();const r=g.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top,k=e.deltaY<0?1.12:1/1.12;
    const ns=Math.min(2,Math.max(.2,gs*k));gx=mx-(mx-gx)*(ns/gs);gy=my-(my-gy)*(ns/gs);gs=ns;applyView();};
}

/* ── 接线 ── */
function wireChapter(){
  hide();
  if(QD&&!QD.ok){wireRoot();return;}
  if(!QD?.ok)return;
  const M=$("main"), ch=ccur?cq():null;
  $("cReload").onclick=async()=>{if(qdirty()&&!await confirm2(T("q_confirm_reload")))return;QD=null;render();};
  $("cSave").onclick=()=>questSave(false);
  $("qlangsw").querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{qlang=b.dataset.l;render();});
  M.querySelectorAll("[data-cst]").forEach(b=>b.onclick=()=>{cSt=+b.dataset.cst;render();});
  M.querySelectorAll("[data-cgo]").forEach(b=>b.onclick=()=>{ccur=b.dataset.cgo;render();});
  M.querySelectorAll("[data-cgoq],[data-gotoq]").forEach(b=>b.onclick=()=>{
    qcur=b.dataset.cgoq||b.dataset.gotoq;qpane="card";page="quest";render();});
  ["cNew","cNewB","cNewIn"].forEach(id=>{const b=$(id);if(b)b.onclick=()=>newChapter(b);});
  const d=$("cDel"); if(d)d.onclick=()=>{if(!ch)return;qcur=ccur;delQuest();};
  const tq=$("cToQuest"); if(tq)tq.onclick=()=>{if(ch){qcur=ccur;qpane="prop";}page="quest";render();};
  $("cvtoggle").onclick=()=>$("cvpanel").classList.toggle("on");
  chFlowWire(ch);
  M.querySelectorAll(".vrow[data-e]").forEach(r=>r.onclick=()=>{const id=r.dataset.e;if(!QD.quests[id])return;
    ccur=isChap(QD.quests[id])?id:(chaptersOf(id)[0]||ccur);render();});
  if(ch)wireCard(ch,M);
}
/* 右栏两块流程图的接线（含那条横分隔） */
function chFlowWire(ch){
  const top=$("cfTop");
  if(top&&cfTopH!=null)top.style.flexBasis=cfTopH+"px";
  const sp=$("cfSplit"), flow=document.querySelector(".cflow");
  if(sp&&top&&flow)sp.onmousedown=e=>{e.preventDefault();
    const h0=top.getBoundingClientRect().height,y0=e.clientY,H=flow.clientHeight;
    const mv=ev=>{cfTopH=Math.max(120,Math.min(H-120,h0+ev.clientY-y0));top.style.flexBasis=cfTopH+"px";};
    const up=()=>{removeEventListener("mousemove",mv);removeEventListener("mouseup",up);};
    addEventListener("mousemove",mv);addEventListener("mouseup",up);};
  const op=$("cfOpen"); if(op)op.onclick=()=>loadDoc(chDlgFile(ch));
  const ft=$("cfFit"); if(ft)ft.onclick=fit;
  const go=$("cfGoDlg"); if(go)go.onclick=()=>{page="dlg";render();};
  const qf=$("cfQFit"); if(qf)qf.onclick=chQFit;
  cfWireDlg(ch); chQGraph(ch); cqWire();
}

function wireCard(ch,M){
  qcur=ccur;                        /* quest.js 的增删菜单按 qcur 找任务；动章节本身时它就是 ccur */
  M.querySelectorAll("[data-cf]").forEach(el=>el.oninput=()=>{
    qsetText(ch,el.dataset.cf,el.textContent);if(el.dataset.cf==="name")ch.QuestName=el.textContent;qtouch();});
  M.querySelectorAll("[data-lockey]").forEach(el=>el.oninput=()=>{qsetLoc(el.dataset.lockey,el.textContent);qtouch();});
  M.querySelectorAll("[data-chimg]").forEach(el=>el.onclick=()=>{qcur=ccur;imgOpen(el.dataset.chimg);});
  M.querySelectorAll("[data-cadd]").forEach(b=>b.onclick=()=>{qcur=ccur;qAdd(b.dataset.cadd,b);});
  M.querySelectorAll("[data-cobj]").forEach(b=>b.onclick=()=>{qcur=b.dataset.cobj;qAdd("obj",b);});
  M.querySelectorAll("[data-cmenu]").forEach(b=>b.onclick=()=>{const [id,i]=b.dataset.cmenu.split("|");qcur=id;qRowMenu("obj",+i,b);});
  M.querySelectorAll("[data-menu]").forEach(b=>b.onclick=()=>{qcur=ccur;qRowMenu(b.dataset.menu,+b.dataset.i,b);});
  M.querySelectorAll("[data-cnec]").forEach(b=>b.onclick=()=>{const [id,i]=b.dataset.cnec.split("|");
    const c=QD.quests[id].conditions.AvailableForFinish[+i]; c.isNecessary=c.isNecessary===false; qtouch(); render();});
  M.querySelectorAll("[data-csw]").forEach(b=>b.onclick=()=>{const [id,p]=b.dataset.csw.split("|"), q=QD.quests[id];
    put(q,p,!dig(q,p));qtouch();render();});
  /* 日记：正文存 locale，键是日记自己的 id（第一次输入才生成）；清空 = 连 id 带两种语言的正文一起撤 */
  M.querySelectorAll("[data-cnote]").forEach(el=>el.oninput=()=>{const [id,k]=el.dataset.cnote.split("|"), q=QD.quests[id], v=el.textContent;
    if(!v.trim()){if(q.notes?.[k]){dropLoc([q.notes[k]]);delete q.notes[k];if(!Object.keys(q.notes).length)delete q.notes;}qtouch();return;}
    (q.notes ??= {}); q.notes[k] ??= NEWID(); qsetLoc(q.notes[k],v); qtouch();});
  M.querySelectorAll("[data-cdelitem]").forEach(b=>b.onclick=()=>{ch.visitapi.items.splice(+b.dataset.cdelitem,1);qtouch();render();});
  const cn=M.querySelector("[data-chain]"); if(cn)cn.onclick=()=>chainSubs(ch);
  if(!QITEMS&&!qiWait&&M.querySelector(".chitem b"))cItemsFetch();   /* 物品要显示名字：表没拉就拉一趟，回来还在这一页才重画 */
}
function cItemsFetch(){
  qiWait=true;
  api("/api/quests/items").then(d=>{QITEMS=d;QITEMS.byId=Object.fromEntries((d.items||[]).map(x=>[x.id,x]));}).catch(()=>{})
    .then(()=>{qiWait=false;if(page==="chapter")render();});
}
/* 新章 = 新建一条任务（挑文件、挑商人，和任务页同一套菜单）再打上章节开关；名字两种语言都先落一句 */
function newChapter(btn){
  newQuest(btn,id=>{                       /* 用回调给的 id，别读 qcur —— 那时它已经被重画拉回当前章节了 */
    const q=QD.quests[id]; makeChapter(q); q.QuestName=T("ch_new_name");
    for(const L of ["ch","en"])(QD.locales[L] ??= {})[q.name]=T("ch_new_name");
    ccur=id; render();
  });
}
