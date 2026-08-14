/* ══════════════════════════════════════════════════════════════════
   任务编辑器
   跑在 index.html 的内联脚本之后，直接用它的全局：T / TF / api / $ / esc /
   hide / place / lang / page / render / ico。

   两种"语言"要分清：
     lang  = 界面语言（设置页那个开关，整站共用）
     qlang = 你正在写哪种语言的文案（页签条右边那个开关）
   SPT 的中文文案文件叫 ch.json 不是 zh.json，所以两者之间有一层映射。
   ══════════════════════════════════════════════════════════════════ */

let QD=null;                 /* /api/quests 的整包：quests / locales / traders / maps / issues / stamp */
let QITEMS=null;             /* 物品表，第一次要选物品时才拉 */
let qcur=null;               /* 当前任务 id */
let qpane="card";            /* card | fail | prop */
let qmsg="successMessageText";
let qlang="ch";
let qBase="";                /* 上次载入/保存时的快照，判"脏"靠跟它比，不靠"渲染过就算改过" */
let qLoading=false;

const LOCF={zh:"ch",en:"en"};                       /* 界面语言 → 文案文件名 */
const qsnap=()=>JSON.stringify([QD?.quests,QD?.locales]);
const qdirty=()=>QD!=null&&qsnap()!==qBase;

/* ── 取数 ── */
function questLoad(){
  if(qLoading)return;
  qLoading=true;
  /* 两个回调分开写，不要 .then(…).catch(…)：
     那样渲染里抛的错会被 catch 接住、然后被当成"读取失败"报出来，
     真正的错就永远看不见了（第一次接这一页就被这个坑了半小时）。 */
  api("/api/quests").then(
    d=>{
      QD=d;
      if(d.ok){
        const ids=Object.keys(d.quests);
        if(!qcur||!d.quests[qcur])qcur=ids[0]||null;
        qBase=qsnap(); qfitted=false;
      }
    },
    e=>{ QD={ok:false,error:String(e.message)}; }
  ).then(()=>{
    qLoading=false; render();
    /* 挂接顺带一起拉：画布上那个 DLG 标记一进来就得是对的，
       不能等用户点开"对话"页才补上 */
    if(!QL)linksLoad();
  });
}

/* ── 文案：任务 json 里存的是 key，界面上只该看见文字 ── */
const qtext=(q,f)=>(QD.locales[qlang]||{})[q?.[f]]??"";
function qsetText(q,f,v){
  if(!q[f])q[f]=`${q._id} ${f}`;                    /* 原版任务用的同一套 key 惯例 */
  (QD.locales[qlang] ??= {})[q[f]]=v;
}
const qloc=k=>(QD.locales[qlang]||{})[k]??"";
const qsetLoc=(k,v)=>{(QD.locales[qlang] ??= {})[k]=v;};

const qq=()=>QD.quests[qcur];
const qname=q=>qtext(q,"name")||q.QuestName||q._id;
const qtrader=id=>(QD.traders||[]).find(t=>t.id===id)?.[lang==="zh"?"zh":"en"]
  ||TF("q_unknown_trader",String(id||"").slice(0,8));
const qmap=id=>(QD.maps||[]).find(m=>m.id===(id||"any"))?.[lang==="zh"?"zh":"en"]
  ||TF("q_unknown_map",String(id||"").slice(0,8));
const ROMAN=["—","Ⅰ","Ⅱ","Ⅲ","Ⅳ"];
const NEWID=()=>Array.from({length:24},()=>"0123456789abcdef"[Math.random()*16|0]).join("");
const num=n=>Number(n||0).toLocaleString(lang==="zh"?"zh-CN":"en-US");

/* ══ 条件 → 人话 ══
   SPT 的条件是嵌套的（CounterCreator 里再包一层 counter.conditions），
   作者不该被迫理解这个结构。这里翻成一句话 + 一个类型角标。 */
function objText(c){
  const inner=c.conditionType==="CounterCreator"?(c.counter?.conditions||[]):[c];
  const at=inner.find(x=>x.conditionType==="Location");
  const val=x=>c.value??x.value??1;
  const one=x=>({
    VisitPlace:()=>TF("q_c_VisitPlace",x.target),
    Kills:()=>TF("q_c_Kills",val(x),x.target==="Savage"?T("q_c_savage"):(x.target||T("q_c_target")))
             +(at?TF("q_c_at",(at.target||[]).join(" / ")):""),
    HandoverItem:()=>TF("q_c_HandoverItem",val(x),(x.target||[]).length),
    FindItem:()=>TF("q_c_FindItem",val(x),(x.target||[]).length),
    Skill:()=>TF("q_c_Skill",x.target,val(x)),
    Quest:()=>TF("q_c_Quest",QD.quests[x.target]?qname(QD.quests[x.target]):x.target),
    Level:()=>TF("q_c_Level",x.compareMethod||"≥",val(x)),
    TraderStanding:()=>TF("q_c_TraderStanding",qtrader(x.target),x.compareMethod||"≥",val(x)),
    TraderLoyalty:()=>TF("q_c_TraderLoyalty",qtrader(x.target),val(x)),
    Location:()=>null,
  }[x.conditionType]||(()=>TF("q_c_unknown",x.conditionType)))();
  const parts=inner.map(one).filter(Boolean);
  return {kind:inner.map(x=>x.conditionType).filter(k=>k!=="Location")[0]||c.conditionType,
          text:parts.join(" · ")||c.conditionType, value:c.value??1};
}

/* 奖励里最常见的就是钱。文件里只有一个 tpl id，作者不该被迫背这些 —
   编辑器认出来直接写"卢布"，跟把条件翻成人话是同一件事。 */
const CURRENCY={"5449016a4bdc2d6f028b456f":"q_r_rub","5696686a4bdc2da3298b456a":"q_r_usd",
                "569668774bdc2da2298b4568":"q_r_eur"};
function rewText(r){
  if(r.type==="Experience")return{tag:"EXP",label:T("q_r_Experience"),v:(+r.value>=0?"+":"")+num(r.value)};
  if(r.type==="Item"){
    const it=(r.items||[])[0], cur=it&&CURRENCY[it._tpl];
    if(cur)return{tag:"₽",label:T(cur),v:"("+num(r.value)+")"};
    const nm=it&&QITEMS?.byId?.[it._tpl];
    return{tag:"※",label:nm?(qlang==="ch"?nm.zh:nm.en):T("q_r_Item"),v:"×"+(r.value||1)};
  }
  if(r.type==="TraderStanding")return{tag:"↗",label:qtrader(r.target),v:(+r.value>0?"+":"")+r.value};
  return{tag:"?",label:r.type||T("q_r_unknown"),v:r.value??""};
}

/* ── 孤儿文案 ──
   任务自己的文案是 `<任务id> name` 这种，删任务时按前缀就能扫掉；
   **但目标行的文案是拿条件自己的 id 当 key 存的**（见 qsetLoc(c.id, …)），没有任务 id 前缀。
   不显式清的话，删掉的目标会永远留在 locales 里，越攒越多。 */
const condKeys=conds=>conds.flatMap(c=>[c.id,...(c.counter?.conditions||[]).map(x=>x.id)]).filter(Boolean);
const allConds=q=>["AvailableForStart","AvailableForFinish","Fail"].flatMap(g=>q.conditions?.[g]||[]);
const dropLoc=keys=>{for(const L of Object.values(QD.locales))for(const k of keys)delete L[k];};

/* ── 信赖等级：文件里不是一个字段，而是 AvailableForStart 里的一条 TraderLoyalty ── */
const gates=q=>(q.conditions?.AvailableForStart||[]).filter(c=>c.conditionType!=="TraderLoyalty");
const loyaltyOf=q=>{
  const c=(q.conditions?.AvailableForStart||[]).find(x=>x.conditionType==="TraderLoyalty");
  return c?+c.value||1:0;
};
function setLoyalty(q,n){
  (q.conditions ??= {AvailableForStart:[],AvailableForFinish:[],Fail:[]});
  const L=(q.conditions.AvailableForStart ??= []);
  const i=L.findIndex(x=>x.conditionType==="TraderLoyalty");
  if(!n){if(i>=0)L.splice(i,1);return;}
  const c={conditionType:"TraderLoyalty",id:i>=0?L[i].id:NEWID(),target:q.traderId,
           value:n,compareMethod:">=",dynamicLocale:false,visibilityConditions:[]};
  if(i>=0)L[i]=c; else L.unshift(c);
}

/* ══════════════ 渲染 ══════════════ */
function questPage(){
  if(!QD){questLoad();return shell(`<div class="tempty" style="margin:2rem">${T("q_load")}</div>`);}
  /* 没指定任务库不是死胡同：直接把"选一个位置"的界面摆出来 */
  if(!QD.ok)return shell(rootPane());
  /* 任务库是空的（刚建的模组、或者刚指到一个空目录）。
     **这里以前是个死胡同**：只摆一句话（还摆错了——`q_e_obj` 是任务卡里"这条任务没写目标"的提示），
     整个工具栏都不渲染，于是「＋新建」按钮根本不存在，用户在这一页什么也做不了。
     空库是新模组的正常起点，得给出口。 */
  if(!qcur)return shell(emptyPane());

  const q=qq(), errs=QD.issues||[], ids=Object.keys(QD.quests);
  const paneFn={link:linkPane,fail:failPane,prop:propPane}[qpane]||cardPane;
  return `<div class="dlgwrap">
    <header class="hdr">
      <div class="slab"></div>
      <div class="tt"><i>// SEC.${secNo("quest")}</i><h2>${T("nav_quest")}</h2>
        <div class="glyph">${qcur.split("").join(" ")}</div></div>
      <div class="cart">
        <div><k>${T("q_hdr_file")}</k><v>${esc(QD.owner[qcur]||"—")}</v></div>
        <div><k>${T("q_hdr_trader")}</k><v>${esc(qtrader(q.traderId))}</v></div>
        <div><k>${T("q_hdr_count")}</k><v>${ids.length}</v></div>
      </div>
      <div id="qbars"></div>
      <span class="sp"></span>
      <span class="saved" id="qsaved">${qdirty()?T("q_dirty"):""}</span>
      <span class="stat ${errs.length?"":"clean"}">${
        errs.length?TF("q_issues",errs.length):"✓ "+T("q_clean")}</span>
      <div class="acts">
        <button class="btn ghost" id="qReload"><span>${T("q_reload")}</span></button>
        <button class="btn pri" id="qSave"><span>${T("q_save")}</span></button>
      </div>
    </header>
    <div class="tape ${errs.length?"hot":""}"></div>
    <div class="work qwork">
      <section class="viewport" id="viewport">
        <div class="qstates">
          ${PANES.map(p=>`<button data-pane="${p.k}" aria-current="${qpane===p.k}"
            title="${esc(T(p.tip))}">${T(p.n)}${paneDot(p.k,q)}</button>`).join("")}
          <span class="sp"></span>
          <div class="langsw" id="qlangsw" title="${esc(T("q_contentlang"))}">
            <button data-l="ch" aria-pressed="${qlang==="ch"}">中文</button>
            <button data-l="en" aria-pressed="${qlang==="en"}">EN</button></div>
        </div>
        <div class="stagepane">${paneFn(q)}</div>
        <div class="hsplit" id="qhsplit" title="${esc(T("tip_split"))}"></div>
        <div class="mailpane">
          <div class="qstates">
            ${MSGS.map(m=>`<button data-msg="${m.f}" aria-current="${qmsg===m.f}"
              title="${esc(T(m.tip))}">${T(m.n)}${qtext(q,m.f).trim()?'<i class="on"></i>':""}</button>`).join("")}
            <button data-msg="lines" aria-current="${qmsg==="lines"}" title="${esc(T("q_tipm_lines"))}"
              >${T("q_msg_lines")}${LINES.some(l=>qtext(q,l.f).trim())?'<i class="on"></i>':""}</button>
            <span class="sp"></span><span class="mtag">MAIL / MESSAGE</span>
          </div>
          ${msgPane(q)}
        </div>
      </section>
      <div class="vsplit" id="qsplit" title="${esc(T("tip_split"))}"></div>
      <div class="graph qgraph" id="qgraph" title="${esc(T("q_g_drag"))}">
        <div class="gtools">
          <button class="pri" id="qNew" title="${esc(T("q_g_add"))}"><span>＋</span></button>
          <button id="qDel" title="${esc(T("q_g_del"))}"><span>✕</span></button>
          <div class="sep"></div>
          <button id="qChain" title="${esc(T("q_g_chain"))}" aria-pressed="${qChainOnly}"><span>⛓</span></button>
          <button id="qfit" title="${esc(T("q_g_fit"))}"><span>⤢</span></button>
        </div>
        <div class="gframe"><i></i><i></i><i></i><i></i></div>
        <div class="gviewport" id="qgvp"><svg class="gedge" id="qedges"></svg><div id="qnodes"></div></div>
        <div class="vpanel" id="qvpanel">
          <h4>${TF("q_v_title",errs.length)}</h4>
          ${errs.map(e=>`<div class="vrow" data-e="${esc(e.questId||"")}">
            <i class="${e.level==="warn"?"warn":""}">${e.level==="warn"?T("q_v_warn"):T("q_v_err")}</i>
            <div><b>${esc(e.questId&&QD.quests[e.questId]?qname(QD.quests[e.questId]):e.questId||"—")}</b>
              <small>${issueText(e)}</small></div></div>`).join("")
            ||`<div class="vrow"><div><b>${T("q_v_none")}</b></div></div>`}
        </div>
      </div>
    </div>
    <footer class="telem">
      <span><b>${T("q_chain")}</b></span>
      <span>${T("q_t_quests")} <em>${ids.length}</em></span>
      <span>${T("q_t_obj")} <em>${ids.reduce((a,i)=>a+(QD.quests[i].conditions?.AvailableForFinish||[]).length,0)}</em></span>
      <span>${T("q_t_rew")} <em>${ids.reduce((a,i)=>a+(QD.quests[i].rewards?.Success||[]).length,0)}</em></span>
      <span class="sp"></span>
      <span class="${errs.length?"bad":""}" id="qvtoggle">${T("q_t_warn")} <em>${errs.length}</em></span>
      <span class="hint">${T("q_g_hint")}</span>
    </footer>
  </div>`;
}
/* 数据还没到 / 没有任务库时的空壳，让页头不至于整个塌掉 */
const shell=inner=>`<div class="dlgwrap"><header class="hdr"><div class="slab"></div>
  <div class="tt"><i>// SEC.${secNo("quest")}</i><h2>${T("nav_quest")}</h2></div>
  <span class="sp"></span></header><div class="tape"></div>
  <div class="work"><section class="viewport" style="flex:1 1 auto">${inner}</section></div></div>`;

const PANES=[{k:"card",n:"q_pane_card",tip:"q_tip_card"},
             {k:"link",n:"q_pane_link",tip:"q_tip_link"},
             {k:"fail",n:"q_pane_fail",tip:"q_tip_fail"},
             {k:"prop",n:"q_pane_prop",tip:"q_tip_prop"}];
const MSGS=[{f:"successMessageText",n:"q_msg_success",tip:"q_tipm_success",req:true},
            {f:"failMessageText",n:"q_msg_fail",tip:"q_tipm_fail"},
            {f:"startedMessageText",n:"q_msg_started",tip:"q_tipm_started"},
            {f:"changeQuestMessageText",n:"q_msg_change",tip:"q_tipm_change"}];
const LINES=[{f:"acceptPlayerMessage",n:"q_line_accept"},
             {f:"declinePlayerMessage",n:"q_line_decline"},
             {f:"completePlayerMessage",n:"q_line_complete"}];
/* 页签角上的小点＝这一面里有东西，省得为了确认空不空一个个点开 */
const paneDot=(k,q)=>{
  const n=k==="fail"?(q.conditions?.Fail||[]).length+(q.rewards?.Fail||[]).length
        :k==="link"?linksFor(qcur).length+trigsFor(qcur).length
        :k==="card"?(q.conditions?.AvailableForFinish||[]).length:0;
  return n?'<i class="on"></i>':"";
};

const thead=(t,sub,spec)=>`<div class="thead"><span class="slab"></span>
  <h3 contenteditable="plaintext-only" data-f="__name" data-ph="${esc(T("q_name_ph"))}">${esc(t)}</h3>
  <em>${esc(sub)}</em><span class="sp"></span>
  <span class="spec"><s>${esc(spec)}</s></span></div>`;
const tsec=(label,n,add)=>`<div class="tsec"><h5>${T(label)}</h5>
  <u class="${n?"":"n0"}">${n}</u>${add?`<button class="add" data-add="${add.k}">${T(add.t)}</button>`:""}</div>`;
const tempty=(k,bad)=>`<div class="tempty${bad?" bad":""}">${T(k)}</div>`;

/* ── 任务卡 ── 顶上四个按钮是任务的"身份"，下面按玩家经历的顺序排 */
function cardPane(q){
  const objs=q.conditions?.AvailableForFinish||[], rews=q.rewards?.Success||[];
  const equip=q.rewards?.Started||[], g=gates(q), ll=loyaltyOf(q), n=g.length+(ll?1:0);
  return `<div class="tool">
    ${thead(qname(q),T("q_pane_card"),"card")}
    <div class="tmeta">
      <button data-map title="${esc(T("q_tip_map"))}"><k>${T("q_meta_loc")}</k>${esc(qmap(q.location))}</button>
      <button data-ll title="${esc(T("q_tip_ll"))}"><k>${T("q_meta_ll")}</k>${ROMAN[ll]}</button>
      <span title="${esc(T("q_tip_start"))}"><k>${T("q_meta_start")}</k>${
        n?TF("q_start_n",n):T("q_start_none")}</span>
      <span title="${esc(T("q_tip_qtrader"))}"><k>${T("q_meta_trader")}</k>${esc(qtrader(q.traderId))}</span>
    </div>
    <div class="tbrief">
      <!-- 预览走 /qimg：任务 json 里存的是 /files/quest/icon/xxx，不是工作区里的相对路径，
           以前拿它去 /media 拼 backgrounds/ 自然什么都读不到（原版任务的图也一样白着） -->
      <div class="plate${q.image?"":" empty"}" id="qimg"
        ${q.image?`style="background-image:url('/qimg?name=${encodeURIComponent(q.image)}&t=${encodeURIComponent(TOK)}')"`:""}
        title="${esc(q.image||T("q_img"))}"
        >${q.image?"":T("q_img")}</div>
      <div class="txt" contenteditable="plaintext-only" data-f="description"
        data-ph="${esc(T("q_desc_ph"))}">${esc(qtext(q,"description"))}</div>
    </div>

    ${tsec("q_sec_gate",g.length,{k:"gate",t:"q_add_cond"})}
    ${g.length?g.map((c,i)=>`<div class="trow gate">
        <span class="tag"><s>${esc(objText(c).kind)}</s></span>
        <span class="tt">${esc(objText(c).text)}</span>
        <button class="dots" data-menu="gate" data-i="${i}">⋮</button></div>`).join("")
      :tempty("q_e_gate")}

    ${tsec("q_sec_equip",equip.length,{k:"equip",t:"q_add"})}
    ${equip.length?`<div class="tcards">${equip.map((r,i)=>rewCard(r,i,"Started",true)).join("")}</div>`
      :tempty("q_e_equip")}

    ${tsec("q_sec_obj",objs.length,{k:"obj",t:"q_add_obj"})}
    ${objs.length?objs.map((c,i)=>goalRow(c,i)).join(""):tempty("q_e_obj",true)}

    ${tsec("q_sec_rew",rews.length,{k:"rew",t:"q_add_rew"})}
    ${rews.length?`<div class="tcards">${rews.map((r,i)=>rewCard(r,i,"Success")).join("")}</div>`
      :tempty("q_e_rew")}
    <div style="height:.9rem"></div>
  </div>`;
}
/* 目标行比门槛行高一档，右边挂进度槽 —— 只有目标有"完成多少"这件事 */
function goalRow(c,i){
  const o=objText(c), txt=(c.id&&qloc(c.id))||o.text;
  return `<div class="trow goal">
    <span class="tag"><s>${esc(o.kind)}</s></span>
    <span class="tt" contenteditable="plaintext-only" ${c.id?`data-lockey="${esc(c.id)}"`:""}>${esc(txt)}</span>
    <span class="bar"></span><span class="num">0 / ${esc(o.value)}</span>
    <button class="dots" data-menu="obj" data-i="${i}">⋮</button></div>`;
}
/* 给东西的一律做成方块卡：和"条件行"在形状上就分得开。pre=接任务时预付的 */
function rewCard(r,i,grp,pre){
  const x=rewText(r);
  return `<div class="tcard${pre?" pre":""}"><span class="ic">${esc(x.tag)}</span>
    <span><span class="rl">${esc(x.label)}</span><span class="rv">${esc(x.v)}</span></span>
    <button class="dots" data-menu="rew" data-i="${i}" data-grp="${grp}">⋮</button></div>`;
}

/* ── 失败面 ── 原版 558 个里只有 46 个用，默认空是正常的 */
function failPane(q){
  const fc=q.conditions?.Fail||[], fr=q.rewards?.Fail||[];
  return `<div class="tool">
    ${thead(qname(q),T("q_pane_fail"),`fail · ${fc.length}`)}
    <div class="tnote">${T("q_fail_note")}</div>
    ${tsec("q_sec_failc",fc.length,{k:"failc",t:"q_add"})}
    ${fc.length?fc.map((c,i)=>`<div class="trow fail">
        <span class="tag"><s>${esc(objText(c).kind)}</s></span>
        <span class="tt">${esc(objText(c).text)}</span>
        <button class="dots" data-menu="failc" data-i="${i}">⋮</button></div>`).join("")
      :tempty("q_e_failc")}
    ${tsec("q_sec_failr",fr.length,{k:"failr",t:"q_add"})}
    ${fr.length?`<div class="tcards">${fr.map((r,i)=>rewCard(r,i,"Fail")).join("")}</div>`
      :tempty("q_e_failr")}
    <div style="height:.9rem"></div>
  </div>`;
}

/* ── 属性面 ── 游戏里看不见、但决定任务怎么运作的那些字段 */
const SWITCHES=["restartable","instantComplete","secretQuest","isKey","canShowNotificationsInGame"];
function propPane(q){
  const row=(k,d,ctrl)=>`<div class="prow2"><k>${T(k)}</k>${ctrl}<s>${T(d)}</s></div>`;
  return `<div class="tool">
    ${thead(qname(q),T("q_pane_prop"),"meta")}
    <div class="tnote">${T("q_prop_note")}</div>
    <div class="tsec"><h5>${T("q_sec_own")}</h5></div>
    ${row("q_p_type","q_p_type_d",`<button class="pv" data-type>${esc(q.type||"Completion")}</button>`)}
    ${row("q_p_side","q_p_side_d",`<button class="pv" data-side>${esc(q.side||"Pmc")}</button>`)}
    ${row("q_p_trader",traderFound(q.traderId)?"q_p_trader_d":"q_trader_ack_d",
      `<button class="pv" data-trader>${esc(qtrader(q.traderId))}</button>`
      +(traderFound(q.traderId)?"":
        `<button class="ack" data-ack="${esc(q.traderId)}">${
          (QD.knownTraders||[]).includes(q.traderId)?"✓ "+T("q_trader_acked"):T("q_trader_ack")}</button>`))}
    <div class="tsec"><h5>${T("q_sec_sw")}</h5></div>
    ${SWITCHES.map(f=>row("q_sw_"+f,"q_sw_"+f+"_d",
      `<button class="sw" data-sw="${f}" aria-pressed="${!!q[f]}">${q[f]?T("q_on"):T("q_off")}</button>`)).join("")}
    <div class="tsec"><h5>${T("q_sec_note")}</h5></div>
    ${row("q_p_note","q_p_note_d",`<span class="pv edit" contenteditable="plaintext-only" data-f="note"
        data-ph="${esc(T("q_p_note_ph"))}">${esc(qtext(q,"note"))}</span>`)}
    <div class="tro"><h6>${T("q_sec_ro")}</h6>
      <div class="er">▫ ${T("q_ro_id")}<code>${esc(q._id||qcur)}</code></div>
      <div class="er">▫ ${T("q_ro_file")}<code>${esc(QD.owner[qcur]||"—")}</code></div>
      <div class="er">▫ ${T("q_ro_status")}<code>${q.status??0}</code></div>
      <div class="er">▫ ${T("q_ro_dlgid")}<code>${esc(q.dialogueId||T("q_ro_empty"))}</code>${T("q_ro_dlgid_d")}</div>
    </div>
  </div>`;
}

/* ── 消息面 ── 四封信 + 三句玩家台词 */
function msgPane(q){
  if(qmsg==="lines")
    return `<div class="tool">
      <div class="tfrom"><span class="tico"></span>${T("q_lines_note")}<em>LINES</em></div>
      ${LINES.map(l=>`<div class="lrow"><k>${T(l.n)}</k>
        <span class="lv" contenteditable="plaintext-only" data-f="${l.f}"
          data-ph="${esc(T("q_line_ph"))}">${esc(qtext(q,l.f))}</span></div>`).join("")}
      <div style="height:.6rem"></div></div>`;
  const m=MSGS.find(x=>x.f===qmsg)||MSGS[0];
  return `<div class="tool">
    <div class="tfrom" title="${esc(T(m.tip))}"><span class="tico"></span>
      <b>${esc(qtrader(q.traderId))}</b> ${T("q_to_player")}<i>${esc(T(m.tip))}</i><em>${T(m.n)}</em></div>
    <div class="tbody${m.req?" req":""}" contenteditable="plaintext-only" data-f="${m.f}"
      data-ph="${esc(m.req?T("q_ph_req"):T("q_ph_opt"))}">${esc(qtext(q,m.f))}</div></div>`;
}

/* ══════════════ 任务链图 ══════════════
   前置关系画成图。LV.n 不是装饰 —— 它就是前置深度，等于玩家第几步才接得到。 */
const QNW=216;
function qprereq(id){
  const out=[];
  for(const c of (QD.quests[id].conditions?.AvailableForStart||[])){
    const inner=c.conditionType==="CounterCreator"?(c.counter?.conditions||[]):[c];
    for(const x of inner)if(x.conditionType==="Quest"&&x.target)out.push(x.target);
  }
  return out;
}
function qlayout(){
  const depth={},pos={},ids=Object.keys(QD.quests);
  const d=id=>{
    if(depth[id]!==undefined)return depth[id];
    depth[id]=0;                                        /* 先占位防环：任务互相前置也不能把浏览器转死 */
    const p=qprereq(id).filter(x=>QD.quests[x]);
    return depth[id]=p.length?Math.max(...p.map(d))+1:0;
  };
  ids.forEach(d);
  const cols={}; ids.forEach(id=>(cols[depth[id]] ??= []).push(id));
  Object.entries(cols).forEach(([c,list])=>list.forEach((id,i)=>{pos[id]={x:34+(+c)*268,y:40+i*112};}));
  return {pos,cols};
}
function qgraph(){
  if(!$("qnodes"))return;
  const {pos,cols}=qlayout(), errs=QD.issues||[];
  const rail=Object.keys(cols).map(c=>`<div class="gcol" data-cur="${cols[c].includes(qcur)?1:0}"
    style="left:${34+(+c)*268-14}px"><b><s>LV.${c} · ${cols[c].length}</s></b></div>`).join("");
  const chain=qChainOnly&&qcur?chainOf(qcur):null;   /* 只看这条链：无关的压暗，不隐藏 */
  $("qnodes").innerHTML=rail+Object.keys(QD.quests).map(id=>{
    const q=QD.quests[id],p=pos[id];
    const bad=errs.some(e=>e.questId===id&&e.level==="err");
    return `<div class="qnode${bad?" bad":""}${chain&&!chain.has(id)?" dim":""}"
      data-q="${id}" data-cur="${id===qcur?1:0}"
      data-root="${qprereq(id).length?0:1}" style="left:${p.x}px;top:${p.y}px">
      <div class="qslab"></div>
      <div class="qh"><em><s>${esc(q.type||"")}</s></em><i>${id.slice(0,8)}</i></div>
      <div class="qb">${esc(qname(q))}</div>
      <div class="qs"><span>${T("q_g_obj")} <b>${(q.conditions?.AvailableForFinish||[]).length}</b></span>
        <span>${T("q_g_rew")} <b>${(q.rewards?.Success||[]).length}</b></span>
        <span>${esc(qtrader(q.traderId))}</span>
        ${hasDlg(id)?`<span class="dlgtag" title="${esc(T("q_dlgtag"))}">DLG</span>`:""}</div>
      <div class="qsockin"></div><div class="qsock"></div></div>`;}).join("");
  qedges(pos);
  $("qnodes").querySelectorAll(".qnode").forEach(el=>el.onclick=()=>{qcur=el.dataset.q;render();});
  wireSockets();
  if(qfitted)qapply(); else {qfit(pos);qfitted=true;}
}
let qChainOnly=false;
/* 连线走直角折线不走贝塞尔 —— 那套"连接走线"是电路板质感，弧线太软 */
function qedges(pos){
  let d="",m="";
  Object.keys(QD.quests).forEach(id=>{
    const to=pos[id];
    qprereq(id).filter(x=>pos[x]).forEach((from,k)=>{
      const f=pos[from],sx=f.x+QNW,sy=f.y+18,tx=to.x,ty=to.y+18;
      const mid=sx+Math.max(20,(tx-sx)/2)+k*8;         /* 同一目标的多条线错开，免得叠在一起 */
      const on=(id===qcur||from===qcur), col=on?"#F2E205":"#5A616B", op=on?".95":".5";
      d+=`<path d="M${sx},${sy} H${mid} V${ty} H${tx}" fill="none" stroke="${col}"
        stroke-opacity="${op}" stroke-width="${on?1.8:1.2}" stroke-linejoin="miter"/>`;
      m+=`<rect x="${mid-2.5}" y="${ty-2.5}" width="5" height="5" fill="${col}" opacity="${op}"/>`
        +`<path d="M${tx-6},${ty-3.4} L${tx},${ty} L${tx-6},${ty+3.4}Z" fill="${col}" opacity="${op}"/>`;
    });});
  $("qedges").innerHTML=d+m;
}
/* 平移 + 滚轮缩放 + 一键归位。下限 0.62：任务一多就缩成蚂蚁还不如让人自己拖 */
let qgx=0,qgy=0,qgs=1,qfitted=false;
const qapply=()=>{const v=$("qgvp");if(v)v.style.transform=`translate(${qgx}px,${qgy}px) scale(${qgs})`;};
function qfit(pos){
  const ids=Object.keys(pos);if(!ids.length||!$("qgraph"))return;
  const minx=Math.min(...ids.map(i=>pos[i].x))-16, miny=Math.min(...ids.map(i=>pos[i].y))-40;
  const maxx=Math.max(...ids.map(i=>pos[i].x+QNW)), maxy=Math.max(...ids.map(i=>pos[i].y+92));
  const r=$("qgraph").getBoundingClientRect(),W=r.width-58,H=r.height-40;
  qgs=Math.max(.62,Math.min(1,Math.min(W/(maxx-minx),H/(maxy-miny))));
  qgx=26+Math.max(0,(W-(maxx-minx)*qgs)/2)-minx*qgs;
  qgy=20+Math.max(0,(H-(maxy-miny)*qgs)/2)-miny*qgs;   /* 竖直居中，不吊在顶上 */
  qapply();
}

/* ══════════════ 接线 ══════════════ */
/* 按下→装 move / 抬起→卸掉。down 返回 null 表示"这一下不归我管"。
   拖动期间在 <html> 上打个 data-drag —— mousemove 是挂在 window 上的，鼠标一旦离开那条
   7px 宽的分隔条，指针就会变成底下元素的形状（一路闪）。换成自定义指针后形状差得更远，
   闪起来很像 bug。cursor.css 里有一条 :root[data-drag] 把全屏指针锁成"移动"。 */
function qdrag(down,kind){
  return e=>{
    const mv=down(e); if(!mv)return;
    e.preventDefault();
    document.documentElement.dataset.drag=kind||"move";
    const up=()=>{removeEventListener("mousemove",mv);removeEventListener("mouseup",up);
      delete document.documentElement.dataset.drag;};
    addEventListener("mousemove",mv);addEventListener("mouseup",up);};
}
/* 拖出来的尺寸要跨 render() 存活：render() 是整块 innerHTML 重建，行内样式每次都会被抹掉 */
let qvpW=null,qmailH=null;
function qwirePanes(){
  const v=$("viewport"), m=document.querySelector(".mailpane");
  if(v&&qvpW!=null)v.style.flexBasis=qvpW+"px";
  if(m&&qmailH!=null)m.style.flexBasis=qmailH+"px";
  $("qsplit").onmousedown=qdrag(e=>{
    const w0=v.getBoundingClientRect().width,x0=e.clientX,W=$("main").clientWidth;
    return ev=>{qvpW=Math.max(360,Math.min(W-300,w0+ev.clientX-x0));
      v.style.flexBasis=qvpW+"px";qfit(qlayout().pos);};},"ew");
  $("qhsplit").onmousedown=qdrag(e=>{
    const h0=m.getBoundingClientRect().height,y0=e.clientY;
    const H=document.querySelector(".qwork").clientHeight;
    return ev=>{qmailH=Math.max(74,Math.min(H-150,h0-ev.clientY+y0));m.style.flexBasis=qmailH+"px";};},"ns");
}
function qwireGraph(){
  const g=$("qgraph");
  g.onmousedown=e=>{
    if(e.target.closest(".qnode")||e.target.closest(".gtools"))return;
    g.classList.add("panning");
    const ox=e.clientX-qgx,oy=e.clientY-qgy;
    const mv=ev=>{qgx=ev.clientX-ox;qgy=ev.clientY-oy;qapply();};
    const up=()=>{g.classList.remove("panning");removeEventListener("mousemove",mv);removeEventListener("mouseup",up);};
    addEventListener("mousemove",mv);addEventListener("mouseup",up);};
  g.onwheel=e=>{                                       /* 以鼠标为锚点缩放，不然一滚就跑偏 */
    e.preventDefault();
    const r=g.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    const ns=Math.min(1.8,Math.max(.25,qgs*(e.deltaY<0?1.12:1/1.12)));
    qgx=mx-(mx-qgx)*(ns/qgs);qgy=my-(my-qgy)*(ns/qgs);qgs=ns;qapply();};
  $("qfit").onclick=()=>qfit(qlayout().pos);
  $("qNew").onclick=()=>newQuest($("qNew"));
  $("qDel").onclick=delQuest;
  $("qChain").onclick=()=>{qChainOnly=!qChainOnly;render();};
}

function wireQuest(){
  hide();          /* 对话页起手会自动弹"打开 .dlg"面板，切过来得把它收掉 */
  if(QD&&!QD.ok){wireRoot();return;}
  if(QD?.ok&&!qcur){wireEmpty();return;}      /* 空库那一页也有三个按钮要接线 */
  if(!QD?.ok||!qcur)return;
  const q=qq(), M=$("main");
  qwirePanes();qwireGraph();qgraph();
  M.querySelectorAll("[data-pane]").forEach(b=>b.onclick=()=>{qpane=b.dataset.pane;render();});
  M.querySelectorAll("[data-msg]").forEach(b=>b.onclick=()=>{qmsg=b.dataset.msg;render();});
  $("qlangsw").querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{qlang=b.dataset.l;render();});
  $("qvtoggle").onclick=()=>$("qvpanel").classList.toggle("on");
  M.querySelectorAll(".vrow[data-e]").forEach(r=>r.onclick=()=>{
    if(r.dataset.e&&QD.quests[r.dataset.e]){qcur=r.dataset.e;render();}});
  $("qReload").onclick=async()=>{
    if(qdirty()&&!await confirm2(T("q_confirm_reload")))return;
    QD=null;render();};
  $("qSave").onclick=()=>questSave(false);

  /* 文案字段：任务上的 name/description/note/各种 message */
  M.querySelectorAll("[data-f]").forEach(el=>el.oninput=()=>{
    const f=el.dataset.f, v=el.textContent;
    if(f==="__name"){qsetText(q,"name",v);q.QuestName=v;}
    else qsetText(q,f,v);
    qtouch();});
  /* 目标行的文字：它的 key 是条件自己的 id，不是任务字段 */
  M.querySelectorAll("[data-lockey]").forEach(el=>el.oninput=()=>{
    qsetLoc(el.dataset.lockey,el.textContent);qtouch();});

  M.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>qAdd(b.dataset.add,b));
  M.querySelectorAll("[data-menu]").forEach(b=>b.onclick=()=>qRowMenu(b.dataset.menu,+b.dataset.i,b));
  /* 点挂接行 → 跳到对话编辑器，并且直接停在那个节点上。
     这是①对话和②任务两个模块之间第一条能走的路。 */
  M.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>{
    const [file,node]=b.dataset.goto.split("|");
    page="dlg"; render(); loadDoc(file,node);
  });
  M.querySelectorAll("[data-unlink]").forEach(b=>b.onclick=()=>{
    const [file,node,opt,action]=b.dataset.unlink.split("|");
    qMenu(b,"q_m_row",[{a:"del",n:T("q_a_unlink")}],null,()=>{hide();linkApply(file,node,+opt,action,false);});
  });
  M.querySelectorAll("[data-map]").forEach(b=>b.onclick=()=>qMapMenu(b));
  M.querySelectorAll("[data-ll]").forEach(b=>b.onclick=()=>qLlMenu(b));
  M.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>qPickMenu(b,"q_m_type",
    QTYPES.map(t=>({a:t,n:t})),q.type||"Completion",v=>{q.type=v;}));
  M.querySelectorAll("[data-side]").forEach(b=>b.onclick=()=>qPickMenu(b,"q_m_side",
    [{a:"Pmc",n:"Pmc"},{a:"Scav",n:"Scav"}],q.side||"Pmc",v=>{q.side=v;}));
  M.querySelectorAll("[data-trader]").forEach(b=>b.onclick=()=>traderMenu(b));
  M.querySelectorAll("[data-ack]").forEach(b=>b.onclick=()=>
    ackTrader(b.dataset.ack,!(QD.knownTraders||[]).includes(b.dataset.ack)));
  M.querySelectorAll("[data-sw]").forEach(b=>b.onclick=()=>{q[b.dataset.sw]=!q[b.dataset.sw];qtouch();render();});
  const im=$("qimg"); if(im)im.onclick=()=>imgOpen();
  qbars();
}
/* 改完只刷"脏"标记和统计，不整页重渲染 —— 否则每敲一个字光标就跳走 */
function qtouch(){
  const e=$("qsaved");if(e)e.textContent=qdirty()?T("q_dirty"):"";
  qbars();
}
function qbars(){
  const el=$("qbars");if(!el)return;
  const errs=QD.issues||[];
  el.innerHTML=Object.keys(QD.quests).map(id=>
    `<i class="${errs.some(e=>e.questId===id&&e.level==="err")?"e":id===qcur?"t":""}"></i>`).join("");
}

/* ══════════════ 增删改 ══════════════ */
const QTYPES=["PickUp","Elimination","Discover","Completion","Exploration","Levelling",
  "Experience","Standing","Loyalty","Merchant","Skill","Multi","WeaponAssembly"];

/* 浮层贴着按钮弹。必须先 .on 让它有尺寸再量 —— display:none 的元素量出来全是 0 */
/* title 传键；已经拼好的标题（比如带节点名的"选 <D9> 里的选项"）走 rawTitle */
function qMenu(btn,title,items,cur,pick,rawTitle){
  const p=$("pop"), long=items.some(i=>i.n.length>12);
  p.innerHTML=`<h4>${esc(rawTitle??T(title))}</h4><div class="kindmenu${long?" col":""}">${
    items.map(i=>`<button data-a="${esc(i.a)}" ${i.a===cur?'aria-pressed="true"':""}
      ${i.d?`title="${esc(T(i.d))}"`:""}>${esc(i.n)}</button>`).join("")}</div>`;
  /* ⚠️ 标记名不能叫 data-pane——任务页四个页签用的就是它，#pop 挂上同名属性会把
     "[data-pane]" 的计数顶成 5（探针当场抓过）。popkind 是 #pop 独有的。 */
  p.dataset.popkind="menu";   /* roles/items 拉完要判断"高级面板还开着吗"，别把别的菜单顶掉 */
  p.classList.add("on");
  p.style.left="-9999px";p.style.top="0";
  const r=btn.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight,m=8;
  let x=r.right-w; if(x<m)x=r.left;                    /* ⋮ 在行尾，往左展开才不出界 */
  let y=r.bottom+4; if(y+h>innerHeight-m)y=r.top-h-4;  /* 下面放不下就翻到上面 */
  p.style.left=Math.max(m,Math.min(x,innerWidth-w-m))+"px";
  p.style.top=Math.max(m,y)+"px";
  p.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>pick(b.dataset.a));
}
const qPickMenu=(btn,title,items,cur,set)=>qMenu(btn,title,items,cur,v=>{set(v);hide();qtouch();render();});
const qMapMenu=b=>qPickMenu(b,"q_m_map",(QD.maps||[]).map(m=>({a:m.id,n:lang==="zh"?m.zh:m.en})),
  qq().location||"any",v=>{qq().location=v;});
const qLlMenu=b=>qPickMenu(b,"q_m_ll",[0,1,2,3,4].map(n=>({a:String(n),n:n?TF("q_lv",ROMAN[n]):T("q_ll_no")})),
  String(loyaltyOf(qq())),v=>setLoyalty(qq(),+v));

/* ══ 目标的高级参数 ══
   字段不是照着文档猜的：把原版 1000+ 条条件按类型全扫了一遍，看哪些字段真有人填、
   填的是什么形状（`distance` 是 {compareMethod,value} 这种嵌套，所以路径要支持点号）。
   标量之外，Kills 的三个高频数组也有入口（parts / roles / items 三种控件）：
   命中部位——原版 558 个任务只用过 7 个部位，敢写死勾选组；
   savageRole——选项**从原版任务提取**（任务里是 bossKilla 这种大小写，bots\types 目录名全小写对不上）；
   武器型号——复用 #ipick 逐件累积（原版平均一条 10.6 件，最长 53 件）。
   敌人装备 / 改装件是**双层**列表且原版各只有 2 条用例，仍不做——半吊子的单层入口等于教人写错数据。 */
const ADV={
  CounterCreator:[["oneSessionOnly","bool","q_adv_once"],["completeInSeconds","num","q_adv_secs"]],
  HandoverItem:[["onlyFoundInRaid","bool","q_adv_fir"],["dogtagLevel","num","q_adv_dogtag"],
                ["minDurability","num","q_adv_dmin"],["maxDurability","num","q_adv_dmax"]],
  FindItem:[["onlyFoundInRaid","bool","q_adv_fir"],["countInRaid","bool","q_adv_cir"],
            ["minDurability","num","q_adv_dmin"],["maxDurability","num","q_adv_dmax"]],
  LeaveItemAtLocation:[["zoneId","text","q_adv_zone"],["plantTime","num","q_adv_plant"],
                       ["onlyFoundInRaid","bool","q_adv_fir"]],
  PlaceBeacon:[["zoneId","text","q_adv_zone"],["plantTime","num","q_adv_plant"]],
  Kills:[["distance.compareMethod","cmp","q_adv_distcmp"],["distance.value","num","q_adv_dist"],
         ["daytime.from","num","q_adv_from"],["daytime.to","num","q_adv_to"],
         ["savageRole","roles","q_adv_roles"],["bodyPart","parts","q_adv_parts"],
         ["weapon","items","q_adv_weap"]],
  Quest:[["availableAfter","num","q_adv_after"]],
};
const dig=(o,p)=>p.split(".").reduce((x,k)=>x==null?x:x[k],o);
function put(o,p,v){const k=p.split("."),last=k.pop();for(const x of k)o=(o[x] ??= {});o[last]=v;}
/* 清空数组时把键整个删掉——「只写用户真填了的」，别往任务里撒空数组 */
function del(o,p){const k=p.split("."),last=k.pop();for(const x of k){o=o[x];if(o==null)return;}delete o[last];}

/* 命中部位：558 个原版任务只用过这 7 个值（Head 16 次占大头），敢写死。
   ⚠️ 名字不能叫 BPARTS——bot.js 已经用它放五个服装槽位，各页脚本共享同一个全局空间，
   重复的 const 会把**后加载的整个文件**炸掉（症状是 botPage is not defined，探针抓过）。 */
const KPARTS=["Head","Chest","Stomach","LeftArm","RightArm","LeftLeg","RightLeg"];
let QROLES=null,qrWait=false,qiWait=false;   /* savageRole 选项表 / 物品表都用到才拉 */
const itemLabel=id=>{const it=QITEMS&&QITEMS.byId&&QITEMS.byId[id];
  return it?(ipZh()?it.zh:it.en):id.slice(0,10)+"…";};
/* 拉完只在「高级参数面板还开着」时原地重画——用户早点去别处了就别抢屏幕 */
function rolesFetch(btn,rows){
  if(qrWait)return;qrWait=true;
  api("/api/quests/roles").then(d=>{QROLES=d.roles||[];}).catch(()=>{QROLES=[];})
    .then(()=>{qrWait=false;const p=$("pop");
      if(p.classList.contains("on")&&p.dataset.popkind==="adv")advMenu(btn,rows);});
}
function itemsFetch(btn,rows){
  if(qiWait||QITEMS)return;qiWait=true;
  api("/api/quests/items").then(d=>{QITEMS=d;QITEMS.byId=Object.fromEntries((d.items||[]).map(x=>[x.id,x]));})
    .catch(()=>{}).then(()=>{qiWait=false;const p=$("pop");
      if(p.classList.contains("on")&&p.dataset.popkind==="adv")advMenu(btn,rows);});
}

/* rows：[[要改的对象, 字段表], …]。CounterCreator 那种是"外层管次数、内层管条件"，
   两层的参数得摆在同一个面板里，作者不该被迫理解这个嵌套。 */
function advMenu(btn,rows){
  const p=$("pop");
  const one=(o,[f,kind,key])=>{
    const v=dig(o,f);
    /* 数组三兄弟不包 <label>——label 会把整行的点击都转发给第一个按钮 */
    if(kind==="parts"||kind==="roles"){
      if(kind==="roles"&&QROLES==null){rolesFetch(btn,rows);return "";}   /* 拉到再画，别闪一排空的 */
      const opts=kind==="parts"?KPARTS:QROLES;
      if(!opts.length)return "";                    /* 读不到游戏数据就整行不画，别摆一个空控件 */
      const cur=Array.isArray(v)?v:[];
      return `<div class="advrow tall"><i>${T(key)}</i><div class="advchips">${
        opts.map(x=>`<button data-t="${f}" data-o="${esc(x)}" aria-pressed="${cur.includes(x)}">${esc(x)}</button>`).join("")}</div></div>`;
    }
    if(kind==="items"){
      const cur=Array.isArray(v)?v:[];
      if(cur.length&&!QITEMS)itemsFetch(btn,rows);  /* 名字表没到之前先显示 id 头几位 */
      return `<div class="advrow tall"><i>${T(key)}</i><div class="advchips">${
        cur.map((id,ix)=>`<button data-x="${f}" data-ix="${ix}" title="${esc(id)}">${esc(itemLabel(id))} ✕</button>`).join("")
        }<button class="add" data-add="${f}">＋ ${T("q_adv_add")}</button></div></div>`;
    }
    const ctl=kind==="bool"
      ? `<button data-b="${f}" aria-pressed="${!!v}">${v?T("q_adv_yes"):T("q_adv_no")}</button>`
      : kind==="cmp"
      ? `<button data-c="${f}">${esc(v||">=")}</button>`
      : `<input data-v="${f}" data-n="${kind==="num"?1:0}" type="${kind==="num"?"number":"text"}"
           value="${esc(v??"")}">`;
    return `<label class="advrow"><i>${T(key)}</i>${ctl}</label>`;
  };
  p.innerHTML=`<h4>${T("q_m_adv")}</h4>`+rows.map(([o,fs])=>fs.map(f=>one(o,f)).join("")).join("")
    +`<div class="advnote">${T("q_adv_note")}</div>`;
  p.dataset.popkind="adv";
  p.classList.add("on");
  p.style.left="-9999px";p.style.top="0";
  const r=btn.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight,m=8;
  p.style.left=Math.max(m,Math.min(r.right-w<m?r.left:r.right-w,innerWidth-w-m))+"px";
  p.style.top=Math.max(m,r.bottom+4+h>innerHeight-m?r.top-h-4:r.bottom+4)+"px";
  const own=f=>rows.find(([,fs])=>fs.some(x=>x[0]===f))[0];
  p.querySelectorAll("[data-b]").forEach(b=>b.onclick=()=>{
    const f=b.dataset.b; put(own(f),f,!dig(own(f),f)); qtouch(); advMenu(btn,rows);});
  p.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
    const f=b.dataset.c; put(own(f),f,dig(own(f),f)==="<="?">=":"<="); qtouch(); advMenu(btn,rows);});
  p.querySelectorAll("[data-v]").forEach(i=>i.onchange=()=>{
    const f=i.dataset.v;
    put(own(f),f,+i.dataset.n?(+i.value||0):i.value.trim());
    qtouch(); render();});
  p.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{        /* 勾选组：点一下进出 */
    const f=b.dataset.t,o=own(f),cur=Array.isArray(dig(o,f))?dig(o,f).slice():[];
    const i=cur.indexOf(b.dataset.o);
    if(i<0)cur.push(b.dataset.o);else cur.splice(i,1);
    if(cur.length)put(o,f,cur);else del(o,f);
    qtouch(); advMenu(btn,rows);});
  p.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{        /* 累积列表：✕ 删一件 */
    const f=b.dataset.x,o=own(f),cur=(dig(o,f)||[]).slice();
    cur.splice(+b.dataset.ix,1);
    if(cur.length)put(o,f,cur);else del(o,f);
    qtouch(); advMenu(btn,rows);});
  p.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{      /* ＋：复用物品选择器 */
    const f=b.dataset.add,o=own(f);
    hide();                       /* pickItem 不自己收 #pop（老规矩），调用方先收 */
    pickItem(it=>{                /* 选完把面板原地重开——连加十几把枪不用来回点 ⋮ */
      const cur=(dig(o,f)||[]).slice();
      if(!cur.includes(it.id))cur.push(it.id);
      put(o,f,cur); qtouch(); advMenu(btn,rows);});});
}

const OBJ_KINDS=["VisitPlace","HandoverItem","FindItem","Kills","Skill","Quest"];
const REW_KINDS=["Experience","Money","Item","TraderStanding","AssortmentUnlock"];
const GATE_KINDS=["Quest","Level","Skill","TraderStanding"];
const kindItems=ks=>ks.map(k=>({a:k,n:T("q_k_"+k),d:I18N[lang]["q_k_"+k+"_d"]?"q_k_"+k+"_d":null}));

function qAdd(what,btn){
  const q=qq();
  /* 挂接的 ＋ 按在哪一组下面，动作就跟着来：data-add="link:accept" */
  if(what.startsWith("link:"))return addLink(what.slice(5),btn);
  const menus={
    obj:  ["q_m_obj",  kindItems(OBJ_KINDS),  addObjective],
    rew:  ["q_m_rew",  kindItems(REW_KINDS),  k=>addReward(k,"Success")],
    equip:["q_m_equip",kindItems(["Money","Item"]), k=>addReward(k,"Started")],
    gate: ["q_m_gate", kindItems(GATE_KINDS), addGate],
    failc:["q_m_failc",[{a:"Quest",n:T("q_k_QuestDone")},{a:"InRaid",n:T("q_k_InRaid")}], addFailCond],
    failr:["q_m_failr",[{a:"TraderStanding",n:T("q_k_MinusStanding")},{a:"Experience",n:T("q_k_MinusExp")}],
           addFailRew],
  }[what];
  if(!menus)return;
  const [title,items,run]=menus;
  qMenu(btn,title,items,null,k=>{hide();run(k,q);});
}

const condBase=()=>({id:NEWID(),dynamicLocale:false,visibilityConditions:[],index:0});
const counter=inner=>({conditionType:"CounterCreator",...condBase(),value:1,
  counter:{id:NEWID(),conditions:[inner]}});
const otherQuest=()=>Object.keys(QD.quests).find(x=>x!==qcur)||"";
/* 新加的东西先给一句能看懂的默认文案，别让作者面对一行空白 */
const itemLine=(k,it)=>(qlang==="ch"
  ? (k==="HandoverItem"?"上交 ":"在战局中找到 ")+it.zh
  : (k==="HandoverItem"?"Hand over ":"Find in raid: ")+it.en);

function addObjective(k,q){
  (q.conditions ??= {}); const L=(q.conditions.AvailableForFinish ??= []);
  const c=condBase();
  if(k==="HandoverItem"||k==="FindItem"){
    pickItem(it=>{
      L.push(k==="HandoverItem"
        ? {conditionType:"HandoverItem",...c,target:[it.id],value:1,onlyFoundInRaid:false}
        : {...counter({conditionType:"FindItem",id:NEWID(),target:[it.id],value:1}),id:c.id});
      qsetLoc(c.id,itemLine(k,it));
      qtouch();render();});
    return;
  }
  if(k==="Kills")L.push({...counter({conditionType:"Kills",id:NEWID(),target:"Savage",value:1}),id:c.id,value:5});
  else if(k==="VisitPlace")L.push({...counter({conditionType:"VisitPlace",id:NEWID(),target:"visitapi_new_trigger",value:1}),id:c.id});
  else if(k==="Skill")L.push({conditionType:"Skill",...c,target:"Endurance",value:3});
  else if(k==="Quest")L.push({conditionType:"Quest",...c,target:otherQuest(),status:[4],value:1});
  qtouch();render();
}
function addGate(k,q){
  (q.conditions ??= {}); const L=(q.conditions.AvailableForStart ??= []);
  const c=condBase();
  if(k==="Quest")               L.push({conditionType:"Quest",...c,target:otherQuest(),status:[4],availableAfter:0});
  else if(k==="Level")          L.push({conditionType:"Level",...c,compareMethod:">=",value:5});
  else if(k==="Skill")          L.push({conditionType:"Skill",...c,compareMethod:">=",target:"Endurance",value:3});
  else if(k==="TraderStanding") L.push({conditionType:"TraderStanding",...c,compareMethod:">=",target:q.traderId,value:0.2});
  qtouch();render();
}
function addFailCond(k,q){
  (q.conditions ??= {}); const L=(q.conditions.Fail ??= []);
  L.push(k==="Quest"?{conditionType:"Quest",...condBase(),target:otherQuest(),status:[4]}
                    :counter({conditionType:"VisitPlace",id:NEWID(),target:"visitapi_new_trigger",value:1}));
  qtouch();render();
}

/* grp：Success=完成奖励 | Started=接任务时先给的 | Fail=惩罚。形状一样，只是落在不同的桶 */
function addReward(k,grp){
  const q=qq(); (q.rewards ??= {}); const L=(q.rewards[grp] ??= []);
  const id=NEWID(), idx=L.length, iid=NEWID();
  if(k==="Experience")         L.push({id,index:idx,type:"Experience",value:"1000"});
  else if(k==="TraderStanding")L.push({id,index:idx,type:"TraderStanding",target:q.traderId,value:"0.05"});
  else if(k==="Money")         L.push({id,index:idx,type:"Item",target:iid,value:"50000",
    items:[{_id:iid,_tpl:"5449016a4bdc2d6f028b456f",upd:{StackObjectsCount:50000}}]});
  else if(k==="Item"){pickItem(it=>{
    L.push({id,index:idx,type:"Item",target:iid,value:"1",
      items:[{_id:iid,_tpl:it.id,upd:{StackObjectsCount:1}}]});
    qtouch();render();});return;}
  else L.push({id,index:idx,type:k,value:"1"});
  qtouch();render();
}
function addFailRew(k){
  const q=qq(); (q.rewards ??= {}); const L=(q.rewards.Fail ??= []);
  const r={id:NEWID(),index:L.length,type:k,value:k==="TraderStanding"?"-0.05":"-500"};
  if(k==="TraderStanding")r.target=q.traderId;
  L.push(r);
  qtouch();render();
}

/* 这一行有哪些高级参数可调：外层（CounterCreator 管次数）和内层（真正的条件）各算一份 */
const advOf=(row,inner)=>[[row,ADV[row.conditionType]],
                          inner&&inner!==row?[inner,ADV[inner.conditionType]]:null]
  .filter(x=>x&&x[1]);

/* 行菜单：点 ⋮ 弹出来，动作写全，不用猜哪个图标是什么意思 */
function qRowMenu(kind,i,btn){
  const q=qq();
  const L={gate:()=>gates(q),obj:()=>q.conditions.AvailableForFinish,
           failc:()=>q.conditions.Fail,rew:()=>q.rewards[btn.dataset.grp]}[kind]();
  const row=L[i];
  const inner=row.conditionType==="CounterCreator"?(row.counter?.conditions||[])[0]:row;
  const items=[];
  if(kind==="rew"){
    if(row.type==="Item")items.push({a:"item",n:T("q_a_item")});
    items.push({a:"val",n:T("q_a_val")});
  }else{
    if(inner&&(inner.conditionType==="HandoverItem"||inner.conditionType==="FindItem"))
      items.push({a:"item",n:T("q_a_item")});
    if(inner&&inner.conditionType==="Quest")items.push({a:"quest",n:T("q_a_quest")});
    items.push({a:"num",n:T("q_a_num")});
    if(advOf(row,inner).length)items.push({a:"adv",n:T("q_a_adv")});
    if(kind==="obj"&&i>0)items.push({a:"up",n:T("q_a_up")});
  }
  items.push({a:"del",n:T("q_a_del")});
  qMenu(btn,"q_m_row",items,null,async a=>{
    if(a==="item"){hide();pickItem(it=>{
      if(kind==="rew"){const iid=(row.items&&row.items[0]&&row.items[0]._id)||NEWID();
        row.items=[{_id:iid,_tpl:it.id,upd:{StackObjectsCount:+row.value||1}}];row.target=iid;}
      else{inner.target=[it.id];
        if(row.id)qsetLoc(row.id,itemLine(inner.conditionType,it));}
      qtouch();render();});return;}
    if(a==="quest"){hide();qMenu(btn,"q_m_prereq",
      Object.keys(QD.quests).filter(x=>x!==qcur).map(x=>({a:x,n:qname(QD.quests[x])})),
      inner.target,v=>{inner.target=v;hide();qtouch();render();});return;}
    if(a==="adv"){advMenu(btn,advOf(row,inner));return;}
    if(a==="num"){hide();const v=await ask(T("q_ask_num"),String(row.value??1));
      if(v!=null){row.value=+v||1;qtouch();render();}return;}
    if(a==="val"){hide();const v=await ask(T("q_ask_val"),String(row.value??1));
      if(v!=null){row.value=String(v);
        if(row.items&&row.items[0])row.items[0].upd={StackObjectsCount:+v||1};
        qtouch();render();}return;}
    if(a==="up"&&i>0)L.splice(i-1,0,L.splice(i,1)[0]);
    if(a==="del"){
      /* gates() 把信赖等级过滤掉了，所以这里的下标要换算回真实数组 */
      if(kind==="gate")q.conditions.AvailableForStart.splice(q.conditions.AvailableForStart.indexOf(row),1);
      else L.splice(i,1);
      if(kind!=="rew")dropLoc(condKeys([row]));      /* 连它那行文案一起清掉 */
    }
    hide();qtouch();render();});
}

/* ══════════════ 物品选择器 ══════════════
   数据来自 SPT_Data：handbook 给分类树和价格，全局文案给中英名字。
   4000 多件，所以单独一条接口、用到才拉。 */
let ipCb=null, ipCat="", ipQ="";
/* 商人货架页（assort.js）也用这个窗口 —— 那边的"添加商品/换物品"就是它。
   所以别把这儿写死成任务页的假设：标题可传，显示语言见 ipZh()。 */
function pickItem(cb,title){
  ipCb=cb; ipCat=""; ipQ="";
  $("ipTitle").textContent=title||T("q_ip_title");
  const p=$("ipick"); p.classList.add("on");
  if(!p.dataset.placed){        /* 头一次打开先把百分比 inset 固化成像素，不然 left/top 写了也不动 */
    const r=p.getBoundingClientRect();
    p.style.inset="auto";p.style.left=r.left+"px";p.style.top=r.top+"px";
    p.style.width=r.width+"px";p.style.height=r.height+"px";p.dataset.placed="1";
  }
  $("ipq").value="";$("ipq").focus();
  if(QITEMS){drawItems();return;}
  $("iplist").innerHTML=`<div style="padding:1rem;color:var(--ink-3);font-size:12px">${T("q_ip_loading")}</div>`;
  api("/api/quests/items").then(d=>{
    QITEMS=d; QITEMS.byId=Object.fromEntries((d.items||[]).map(x=>[x.id,x]));
    drawItems();
  }).catch(e=>{$("iplist").innerHTML=`<div style="padding:1rem;color:var(--err);font-size:12px">${esc(e.message)}</div>`;});
}
const closeItems=()=>{$("ipick").classList.remove("on");ipCb=null;};
/* 列表里先显示哪种语言的名字：
   任务页跟**内容语言** qlang（你正在写中文文案，就该先看中文名）；
   别的页（商人货架）跟**界面语言** lang —— 那边压根没有"内容语言"这回事，
   硬跟着 qlang 的话，英文界面的人打开选择器会看到一列中文名（qlang 默认就是 "ch"）。 */
const ipZh=()=>page==="quest"?qlang==="ch":lang==="zh";
const catName=c=>(ipZh()?c.zh:c.en)||c.id.slice(0,8);
function drawItems(){
  if(!QITEMS)return;
  const tops=QITEMS.cats.filter(c=>!c.parent&&catName(c).trim());
  const kids=p=>QITEMS.cats.filter(c=>c.parent===p&&catName(c).trim());
  $("ipcats").innerHTML=`<button data-c="" aria-pressed="${ipCat===""}">${T("q_ip_all")}</button>`+
    tops.map(t=>`<button data-c="${t.id}" aria-pressed="${ipCat===t.id}">${esc(catName(t))}</button>`+
      kids(t.id).map(k=>`<button class="sub" data-c="${k.id}" aria-pressed="${ipCat===k.id}">${esc(catName(k))}</button>`).join("")
    ).join("");
  const under=new Set([ipCat]);
  for(let n=0;n<3;n++)QITEMS.cats.forEach(c=>{if(under.has(c.parent))under.add(c.id);});
  const s=ipQ.trim().toLowerCase();
  const list=QITEMS.items.filter(it=>
    (!ipCat||under.has(it.cat)) &&
    (!s||String(it.zh).toLowerCase().includes(s)||String(it.en).toLowerCase().includes(s)||it.id.includes(s)))
    .slice(0,400);
  $("iplist").innerHTML=list.map(it=>`<div class="iprow" data-i="${it.id}">
      <span class="pn">${esc(ipZh()?it.zh:it.en)}</span>
      <span class="pe">${esc(ipZh()?it.en:it.zh)}</span>
      <span class="pp">₽ ${num(it.price)}</span></div>`).join("")
    ||`<div style="padding:1rem;color:var(--ink-3);font-size:12px">${T("q_ip_none")}</div>`;
  $("ipfoot").textContent=TF("q_ip_foot",list.length,QITEMS.items.length);
  $("ipcats").querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{ipCat=b.dataset.c;drawItems();});
  $("iplist").querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{
    const it=QITEMS.byId[b.dataset.i], cb=ipCb;
    closeItems(); cb&&cb(it);});
}

/* ══════════════ 保存 ══════════════ */
function questSave(force){
  const s=$("qsaved"); if(s)s.textContent=T("q_saving");
  /* 载入时有哪些文件，就发哪些文件；每个文件带上属于它的全部任务。
     ⚠️ 先把每个文件铺成空对象这一步不能省：删掉某文件的最后一个任务后，
     它的 owner 也没了，光按剩余任务组装的话这份文件根本不出现在请求里，
     而服务端"只写送来的文件" —— 等于白删，重新载入任务又回来了。
     空对象在服务端就是"这份文件空了，删掉它"（见 QuestStore.SaveFile）。 */
  const files={};
  for(const f of (QD.files||[]))files[f]={};
  for(const [id,q] of Object.entries(QD.quests)){
    const f=QD.owner[id]; if(!f)continue;
    (files[f] ??= {})[id]=q;
  }
  api("/api/quests",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({stamp:QD.stamp,force:!!force,files,locales:QD.locales})})
    .then(d=>{
      QD.stamp=d.stamp; QD.issues=d.issues||[];
      if(d.files)QD.files=d.files;          /* 空掉的文件已经被服务端删了，别再往里发 */
      qBase=qsnap();
      render();
      const e=$("qsaved"); if(e)e.textContent=T("q_saved");
    })
    .catch(async e=>{
      const msg=String(e.message||"");
      /* 409：文件在编辑器外面被改过了。别默默盖掉，让人自己选 */
      if(msg.includes("stale")){staleAsk();return;}
      const el=$("qsaved"); if(el)el.textContent=TF("q_savefail",msg.slice(0,80));
    });
}
function staleAsk(){
  const p=$("pop");
  p.innerHTML=`<h4>${T("q_hdr_file")}</h4><div style="font-size:12px;line-height:1.7;color:var(--ink-2);
    max-width:300px;margin-bottom:.6rem">${T("q_stale_ask")}</div>
    <div class="kindmenu"><button data-a="reload">${T("q_reload")}</button>
    <button data-a="force">${T("q_force")}</button></div>`;
  p.classList.add("on");
  p.style.left=Math.max(12,(innerWidth-360)/2)+"px";p.style.top="90px";
  p.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{
    hide();
    if(b.dataset.a==="reload"){QD=null;render();} else questSave(true);});
}

/* 物品选择器的静态接线：只做一次，不跟着 render 走 */
(function(){
  $("ipClose").onclick=closeItems;
  $("ipq").oninput=e=>{ipQ=e.target.value;drawItems();};
  /* 4000 多件的列表压在任务卡上时，得能挪开对着看 */
  $("ipHead").onmousedown=qdrag(e=>{
    if(e.target.closest("input,button"))return null;
    const p=$("ipick"),r=p.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
    return ev=>{                                      /* 夹住边界，别把窗拖出屏幕外找不回来 */
      p.style.left=Math.max(-r.width+140,Math.min(innerWidth-140,ev.clientX-dx))+"px";
      p.style.top =Math.max(0,Math.min(innerHeight-40,ev.clientY-dy))+"px";};
  });
  addEventListener("keydown",e=>{if(e.key==="Escape")closeItems();});
})();

/* ══════════════ 任务图选择器 ══════════════
   两个来源：SPT 自带的 332 张，和作者自己模组 images\quest\icon 里的那份。

   ⚠️ 反编译核实过：SPT 的 ImageRouteImporter **只扫 SPT_Data\images 一处**，
   模组目录下的图必须由那个模组自己调 imageRouter.AddRoute 注册，否则进游戏是空白。
   VisitAPI-Server 会替作者注册（QuestLoader.RegisterImages）；别的模组得自己做，界面上要说清楚。 */
let QIMG=null, gpCat="spt", gpQ="";
function imgOpen(){
  gpQ=""; const p=$("gpick"); p.classList.add("on");
  if(!p.dataset.placed){       /* 同物品选择器：先把百分比 inset 固化成像素，否则拖不动 */
    const r=p.getBoundingClientRect();
    p.style.inset="auto";p.style.left=r.left+"px";p.style.top=r.top+"px";
    p.style.width=r.width+"px";p.style.height=r.height+"px";p.dataset.placed="1";
  }
  $("gpTitle").textContent=T("q_img_title");
  $("gpq").value="";$("gpq").placeholder=T("q_img_search");
  if(QIMG)drawImgs(); else $("gplist").innerHTML=`<div class="imempty">${T("q_ip_loading")}</div>`;
  $("gpq").focus();
  /* 每次打开都重扫一遍。作者的实际动作是"先去文件夹丢图，再回来选"——
     缓存一整个会话的话，刚放进去的图这一整次都看不见。有旧数据就先摆着，扫完再换。 */
  api("/api/quests/images").then(d=>{
    const first=!QIMG; QIMG=d;
    /* 头一次打开：哪边有图就站哪边。模组目录通常是空的，开局摆一片空白很劝退 */
    if(first)gpCat=(d.mod?.files||[]).length&&!(d.spt?.files||[]).length?"mod":"spt";
    if($("gpick").classList.contains("on"))drawImgs();
  },e=>{if(!QIMG)$("gplist").innerHTML=`<div class="imempty" style="color:var(--err)">${esc(e.message)}</div>`;});
}
const closeImgs=()=>$("gpick").classList.remove("on");

function drawImgs(){
  const spt=QIMG.spt||{},mod=QIMG.mod||{};
  const cats=[["spt",T("q_img_spt"),(spt.files||[]).length],
              ["mod",mod.name||T("q_img_mod"),(mod.files||[]).length],
              ["custom",T("q_img_custom"),null],
              ["none",T("q_img_none"),null]];
  $("gpcats").innerHTML=cats.map(([k,n,c])=>
    `<button data-c="${k}" aria-pressed="${gpCat===k}">${esc(n)}${c===null?"":` <span style="opacity:.55">${c}</span>`}</button>`).join("");
  $("gpcats").querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
    if(b.dataset.c==="none"){imgSet("");return;}
    gpCat=b.dataset.c;drawImgs();});
  /* 页脚只在看目录时报路径。自填/清除那两页跟目录无关，摆个路径在那儿是误导 */
  const dir=gpCat==="mod"?mod.dir:gpCat==="spt"?spt.dir:"";
  $("gpfoot").innerHTML=`<span>${esc(dir||"")}</span>`;
  $("gplist").innerHTML=gpCat==="custom"?imgCustomPane():imgGrid(gpCat==="mod"?mod:spt,gpCat);
  wireImgs();
}

function imgGrid(sec,src){
  const files=(sec.files||[]).filter(f=>!gpQ||f.toLowerCase().includes(gpQ.toLowerCase()));
  if(!files.length)return `<div class="imempty">${
    (sec.files||[]).length?T("q_img_nohit"):TF("q_img_empty",esc(sec.dir||"—"))}</div>`;
  const cur=(qq()||{}).image||"";
  const warn=src==="mod"&&!sec.registers
    ?`<div class="imwarn" style="margin:10px 10px 0">${TF("q_img_noreg",esc(sec.name||"?"))}</div>`:"";
  return warn+`<div class="imgrid">`+files.map(f=>{
    const ok=f.split(".").length===2;      /* 名字里多一个点，SPT 切扩展名时会把它截断 */
    return `<button class="imcell${ok?"":" bad"}" data-pick="${esc(f)}" data-src="${src}"
      aria-pressed="${cur==="/files/quest/icon/"+f}" title="${esc(ok?f:T("q_img_dot"))}">
      <img loading="lazy" src="/qimg?src=${src}&name=${encodeURIComponent(f)}&t=${encodeURIComponent(TOK)}" alt="">
      <figcaption>${esc(f)}</figcaption></button>`;}).join("")+`</div>`;
}

/* 没用 VisitAPI 的人：图片在他自己的模组里，路径也是他自己的，这里只能让他手填 */
function imgCustomPane(){
  return `<div class="impane">
    <div class="imwarn">${T("q_img_ownwarn")}</div>
    <h4>${T("q_img_custom")}</h4>
    <p>${T("q_img_custom_d")}</p>
    <input id="gpCustom" value="${esc((qq()||{}).image||"")}" placeholder="/files/quest/icon/myquest.png">
    <div class="kindmenu" style="margin-top:.7rem"><button data-use="1">${T("q_img_use")}</button></div>
  </div>`;
}

function imgSet(v){
  const q=qq(); if(!q)return;
  q.image=v; qtouch(); closeImgs(); render();
}

function wireImgs(){
  $("gplist").querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>
    imgSet("/files/quest/icon/"+b.dataset.pick));
  const c=$("gpCustom");
  if(c){
    const go=()=>imgSet(c.value.trim());
    $("gplist").querySelector("[data-use]").onclick=go;
    c.onkeydown=e=>{if(e.key==="Enter")go();};
    c.focus();
  }
}

/* 静态接线，跟物品选择器同一套 */
(function(){
  $("gpClose").onclick=closeImgs;
  $("gpq").oninput=e=>{gpQ=e.target.value;if(QIMG)drawImgs();};
  $("gpHead").onmousedown=qdrag(e=>{
    if(e.target.closest("input,button"))return null;
    const p=$("gpick"),r=p.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
    return ev=>{
      p.style.left=Math.max(-r.width+140,Math.min(innerWidth-140,ev.clientX-dx))+"px";
      p.style.top =Math.max(0,Math.min(innerHeight-40,ev.clientY-dy))+"px";};
  });
  addEventListener("keydown",e=>{if(e.key==="Escape")closeImgs();});
})();

/* ══════════════ 对话挂接 ══════════════
   任务 ↔ .dlg 之间那根线。数据来自 /api/quests/links，**回写由 C# 的 DialogWriter 独占**
   —— .dlg 里有作者写的注释和手填坐标，只有它会原样吐回；前端绝不拼 .dlg 文本。
   另外：这一页的改动是直接落盘的，跟任务 json 那种"攒着等保存"不一样，所以界面上写清楚了。 */
let QL=null;

function linksLoad(){
  api("/api/quests/links").then(d=>{QL=d;render();},e=>{QL={ok:false,error:String(e.message)};render();});
}
const linksFor=id=>(QL?.links||[]).filter(l=>l.questId===id);
const trigsFor=id=>(QL?.triggers||[]).filter(t=>t.questId===id);
const hasDlg=id=>linksFor(id).length>0||trigsFor(id).length>0;

/* 按"玩家会在哪一步碰到它"分组，和别的面一个思路 */
const LINK_GROUPS=[
  {acts:["accept"],             n:"q_sec_accept",   tip:"q_hint_accept"},
  {acts:["complete","handover"],n:"q_sec_complete", tip:"q_hint_complete"},
  {acts:["setstatus"],          n:"q_sec_setstatus",tip:"q_hint_setstatus"},
];
function linkPane(q){
  if(!QL){linksLoad();return `<div class="tool">${thead(qname(q),T("q_pane_link"),"dlg")}
    <div class="tempty">${T("q_load")}</div></div>`;}
  if(!QL.ok)return `<div class="tool">${thead(qname(q),T("q_pane_link"),"dlg")}
    <div class="tnote">${T("q_link_nows")}</div></div>`;
  const L=linksFor(qcur), TG=trigsFor(qcur);
  return `<div class="tool">
    ${thead(qname(q),T("q_pane_link"),`dlg · ${L.length+TG.length}`)}
    <div class="tnote">${T("q_link_note")}</div>
    ${LINK_GROUPS.map(g=>{
      const rows=L.filter(l=>g.acts.includes(l.action));
      return tsec(g.n,rows.length,{k:"link:"+g.acts[0],t:"q_add_link"})
        +`<div class="thint">${T(g.tip)}</div>`
        +(rows.length?rows.map(l=>`<div class="trow link">
            <span class="tag act"><s>${T("q_act_"+l.action)}</s></span>
            <span class="tt goto" data-goto="${esc(l.file)}|${esc(l.node)}" title="${esc(T("q_goto_dlg"))}"
              ><b>&lt;${esc(l.node)}&gt;</b>「${esc(l.text||T("q_notext"))}」</span>
            <button class="dots" data-unlink="${esc(l.file)}|${esc(l.node)}|${l.opt}|${l.action}">⋮</button>
          </div>`).join("")
          :tempty("q_e_link"));
    }).join("")}
    ${tsec("q_sec_trig",TG.length,null)}
    <div class="thint">${T("q_hint_trig")}</div>
    ${TG.length?TG.map(t=>`<div class="trow trig">
        <span class="tag"><s>${esc(t.kind)}</s></span>
        <span class="tt">${esc(t.place)} → <b>&lt;${esc(t.node)}&gt;</b>
          <i>${TF("q_when_status",t.status)}</i></span></div>`).join("")
      :tempty("q_e_trig")}
    <div style="height:.9rem"></div>
  </div>`;
}

/* 两步选：先挑节点，再挑那个节点里的选项。＋ 按在哪一组下面，动作就基本定了，
   只有"交付"还要问一句是不是同时上交物品。 */
function addLink(want,btn){
  const files=QL.nodes||[];
  const all=files.flatMap(f=>f.nodes.map(n=>({f:f.file,n})));
  qMenu(btn,"q_m_node",all.map((x,i)=>({a:String(i),
    n:"<"+x.n.name+"> · "+TF("q_nopts",x.n.opts.length), d:null})),null,i=>{
    const x=all[+i];
    const items=x.n.opts.map((o,j)=>({a:String(j),
      n:(o.text||T("q_notext")).slice(0,44)+(o.acts.length?"  ["+TF("q_opt_taken",o.acts.map(a=>T("q_act_"+a)).join("/"))+"]":"")}));
    hide();
    qMenu(btn,null,items,null,j=>{
      const done=act=>{hide();linkApply(x.f,x.n.name,+j,act,true);};
      if(want!=="complete")return done(want);
      hide();
      qMenu(btn,"q_m_handover",[{a:"complete",n:T("q_act_complete")},{a:"handover",n:T("q_act_handover")}],
        null,done);
    },TF("q_m_opt",x.n.name));
  });
}
function linkApply(file,node,opt,action,add){
  api("/api/quests/link",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({file,node,opt,action,questId:qcur,add})})
    .then(d=>{QL.links=d.links;QL.triggers=d.triggers;render();})
    .catch(e=>{const s=$("qsaved");if(s)s.textContent=TF("q_link_fail",String(e.message).slice(0,60));});
}

/* ══════════════ 任务链图：从"只能看"变成"能改" ══════════════
   前置关系本来只能在任务卡的「接取条件」里一条条加，看不见全局。
   现在从卡片右边的方块拖到另一张卡上就是一条前置 —— 图上画的那条线，
   就是 AvailableForStart 里的一条 Quest 条件，改的是同一份数据。 */

/* 这条任务的整条上下游链（含自己）。用来把无关的卡片压暗，让链路看得清 */
function chainOf(id){
  const up=new Set(), down=new Set();
  const walkUp=x=>qprereq(x).forEach(p=>{if(QD.quests[p]&&!up.has(p)){up.add(p);walkUp(p);}});
  const kids=x=>Object.keys(QD.quests).filter(k=>qprereq(k).includes(x));
  const walkDown=x=>kids(x).forEach(c=>{if(!down.has(c)){down.add(c);walkDown(c);}});
  walkUp(id); walkDown(id);
  return new Set([id,...up,...down]);
}

/* 加一条前置：target 需要先完成 src。三种情况要拦，拦不住就是一张没法完成的任务网 */
function addPrereq(src,target){
  if(src===target)return qtoast(T("q_link_self"));
  const q=QD.quests[target];
  if(qprereq(target).includes(src))return qtoast(T("q_link_dup"));
  if(chainUp(src).has(target))                        /* src 已经（间接）要求 target 先完成 */
    return qtoast(TF("q_link_cycle",qname(QD.quests[src]),qname(q)));
  (q.conditions ??= {}); (q.conditions.AvailableForStart ??= []);
  q.conditions.AvailableForStart.push({conditionType:"Quest",id:NEWID(),
    dynamicLocale:false,visibilityConditions:[],index:0,
    target:src,status:[4],availableAfter:0});
  qtoast(TF("q_link_ok",qname(QD.quests[src]),qname(q)));
  qtouch();render();
}
function chainUp(id){
  const seen=new Set();
  const walk=x=>qprereq(x).forEach(p=>{if(QD.quests[p]&&!seen.has(p)){seen.add(p);walk(p);}});
  walk(id); return seen;
}
/* 图上的操作没有"哪一行变了"这种反馈，所以给一句话提示，用页头那块"未保存"的位置 */
function qtoast(msg){const e=$("qsaved");if(e){e.textContent=msg;
  clearTimeout(qtoast._t);qtoast._t=setTimeout(()=>{const x=$("qsaved");if(x)x.textContent=qdirty()?T("q_dirty"):"";},2600);}}

/* 从出口方块拖出一条线。松手落在哪张卡上，就把那张卡设成"需要先完成本任务" */
function wireSockets(){
  $("qnodes").querySelectorAll(".qsock").forEach(s=>s.onmousedown=e=>{
    e.preventDefault(); e.stopPropagation();
    const from=s.closest(".qnode").dataset.q;
    const r=$("qgraph").getBoundingClientRect();
    const pt=ev=>[(ev.clientX-r.left-qgx)/qgs,(ev.clientY-r.top-qgy)/qgs];
    const pos=qlayout().pos[from];
    const [x0,y0]=[pos.x+QNW,pos.y+18];
    /* 橡皮筋只建一次，move 只改 d —— 每帧插一条再删旧的会把 SVG 撑爆 */
    const rub=document.createElementNS("http://www.w3.org/2000/svg","path");
    rub.setAttribute("fill","none"); rub.setAttribute("stroke","#F2E205");
    rub.setAttribute("stroke-width","1.8"); rub.setAttribute("stroke-dasharray","5 4");
    $("qedges").appendChild(rub);
    const mv=ev=>{const [x,y]=pt(ev);rub.setAttribute("d",`M${x0},${y0} H${x0+20} V${y} H${x}`);};
    const up=ev=>{
      removeEventListener("mousemove",mv);removeEventListener("mouseup",up);
      rub.remove();
      const card=ev.target.closest?.(".qnode");
      if(card)addPrereq(from,card.dataset.q);
    };
    addEventListener("mousemove",mv);addEventListener("mouseup",up);
  });
}

/* 空任务库的落脚页：说清楚这里是空的、指的是哪个目录，然后给三个出口
   （建第一条 / 换个位置 / 重读）。照 rootPane 那套排版走。 */
function emptyPane(){
  return `<div class="tool" style="padding-bottom:1rem">
    <div class="thead"><span class="slab"></span><h3 contenteditable="false">${T("q_e_new_title")}</h3>
      <span class="sp"></span><span class="spec"><s>empty</s></span></div>
    <div class="tnote">${T("q_e_new_note")}</div>
    <div class="thint">${TF("q_root_cur",esc(QD.dir||"—"))}</div>
    <div class="tsec"><h5>${T("q_e_new_do")}</h5></div>
    <div class="trow goal">
      <span class="tag"><s>01</s></span>
      <span class="tt">${T("q_e_new_step")}</span>
      <button class="add" id="qNewEmpty">${T("q_g_add")}</button>
    </div>
    <div class="trow">
      <span class="tag"><s>02</s></span>
      <span class="tt">${T("q_e_new_move")}</span>
      <button class="add" id="qRootAgain">${T("q_root_use")}</button>
    </div>
    <div class="trow">
      <span class="tag"><s>03</s></span>
      <span class="tt">${T("q_e_new_reload")}</span>
      <button class="add" id="qReloadEmpty">${T("q_reload")}</button>
    </div>
  </div>`;
}
function wireEmpty(){
  /* 新建走的是和图上「＋」完全同一条路：先问文件（空库时只有"新建文件"一项）、再问商人 */
  $("qNewEmpty").onclick=e=>newQuest(e.currentTarget);
  $("qRootAgain").onclick=()=>{QROOTS=null;QD={ok:false,dir:QD.dir};render();};
  $("qReloadEmpty").onclick=()=>{QD=null;render();};
}

/* ── 新建任务 ── 先问放哪个文件，再问挂哪个商人；id 自动生成，文案先给一句占位 */
function newQuest(btn){
  const files=[...new Set(Object.values(QD.owner))].sort();
  qMenu(btn,"q_m_file",[...files.map(f=>({a:f,n:f})),{a:"__new",n:T("q_m_newfile")}],null,async f=>{
    hide();
    if(f==="__new"){
      let v=await ask(T("q_ask_file"),"my_quests.json");
      if(!v)return;
      if(!v.endsWith(".json"))v+=".json";
      f=v;
    }
    qMenu(btn,"q_m_newtrader",(QD.traders||[]).map(t=>({a:t.id,n:lang==="zh"?t.zh:t.en})),
      qq()?.traderId,tid=>{hide();createQuest(f,tid);});
  });
}
function createQuest(file,traderId){
  const id=NEWID();
  QD.quests[id]={_id:id,QuestName:T("q_new_name"),traderId,location:"any",type:"Completion",
    side:"Pmc",image:"",restartable:false,instantComplete:false,secretQuest:false,isKey:false,
    canShowNotificationsInGame:true,status:0,
    name:`${id} name`,description:`${id} description`,note:"",
    startedMessageText:"",successMessageText:`${id} successMessageText`,
    failMessageText:"",changeQuestMessageText:"",
    acceptPlayerMessage:"",declinePlayerMessage:"",completePlayerMessage:"",
    conditions:{AvailableForStart:[],AvailableForFinish:[],Fail:[]},
    rewards:{Started:[],Success:[],Fail:[]}};
  QD.owner[id]=file;
  /* 两个语言都先落一句，免得另一种语言下打开是空的 */
  for(const L of ["ch","en"]){
    (QD.locales[L] ??= {})[`${id} name`]=T("q_new_name");
    QD.locales[L][`${id} description`]=T("q_new_desc");
    QD.locales[L][`${id} successMessageText`]=T("q_new_mail");
  }
  qcur=id; qpane="card"; qfitted=false;
  qtouch();render();
}

/* ── 删除任务 ── 连带清掉它的文案，和别的任务里指向它的前置条件 */
async function delQuest(){
  if(!qcur)return;
  const q=qq(), nm=qname(q);
  if(!await confirm2(TF("q_del_ask",nm)))return;
  let cleaned=0;
  for(const [oid,other] of Object.entries(QD.quests)){
    if(oid===qcur)continue;
    for(const grp of ["AvailableForStart","AvailableForFinish","Fail"]){
      const L=other.conditions?.[grp]; if(!L)continue;
      for(let i=L.length-1;i>=0;i--)
        if(L[i].conditionType==="Quest"&&L[i].target===qcur){L.splice(i,1);cleaned++;}
    }
  }
  for(const L of Object.values(QD.locales))
    for(const k of Object.keys(L))if(k.startsWith(qcur+" ")||k===qcur)delete L[k];
  dropLoc(condKeys(allConds(q)));          /* 目标行的文案不带任务 id 前缀，得按条件 id 单独清 */
  delete QD.quests[qcur]; delete QD.owner[qcur];
  qcur=Object.keys(QD.quests)[0]||null; qfitted=false;
  qtouch();render();
  qtoast(TF("q_del_done",nm,cleaned));
}

/* ══════════════ 任务库放哪 ══════════════
   任务编辑不依赖 VisitAPI —— 写出来的就是标准 SPT 任务文件。
   但 SPT 不会自动加载任意目录下的任务，得有 mod 去读，所以"存到哪"必须由作者决定。 */
let QROOTS=null;

function rootsLoad(){
  api("/api/quests/roots").then(d=>{QROOTS=d;render();},()=>{QROOTS={found:[]};render();});
}
function rootPane(){
  if(!QROOTS){rootsLoad();return `<div class="tempty" style="margin:2rem">${T("q_load")}</div>`;}
  const f=QROOTS.found||[];
  return `<div class="tool" style="padding-bottom:1rem">
    <div class="thead"><span class="slab"></span><h3 contenteditable="false">${T("q_root_title")}</h3>
      <span class="sp"></span><span class="spec"><s>setup</s></span></div>
    <div class="tnote">${T("q_root_note")}</div>
    ${QROOTS.current?`<div class="thint">${TF("q_root_cur",esc(QROOTS.current))}</div>`:""}
    <div class="tsec"><h5>${T("q_root_found")}</h5><u class="${f.length?"":"n0"}">${f.length}</u></div>
    ${f.length?f.map(x=>`<div class="trow${x.hasQuests?" goal":" gate"}">
        <span class="tag"><s>${esc(x.mod)}</s></span>
        <span class="tt">${esc(x.path)}</span>
        <span class="num">${x.hasQuests?T("q_root_has"):T("q_root_empty")}</span>
        <button class="add" data-pick="${esc(x.path)}">${T("q_root_use")}</button>
      </div>`).join(""):`<div class="tempty">${T("q_root_none")}</div>`}
    <div class="tsec"><h5>${T("q_root_manual")}</h5></div>
    <div class="trow">
      <input id="qRootIn" class="tt" value="${esc(QROOTS.eft?QROOTS.eft+"\\SPT_Runtime\\user\\mods\\我的任务\\db":"")}">
      <button class="add" id="qRootGo">${T("q_root_use")}</button>
    </div>
  </div>`;
}
function wireRoot(){
  $("main").querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>setRoot(b.dataset.pick));
  const go=$("qRootGo"); if(go)go.onclick=()=>setRoot($("qRootIn").value.trim());
}
function setRoot(path){
  if(!path)return;
  api("/api/quests/root",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({path})})
    .then(()=>{QROOTS=null;QD=null;QL=null;render();})   /* 换库整个重载；QL 是挂接缓存，跟着旧库已过期 */
    .catch(e=>{const s=$("qsaved");if(s)s.textContent=TF("q_root_bad",String(e.message).slice(0,60));
      say(TF("q_root_bad",String(e.message).slice(0,120)));});
}

/* ══════════════ 选商人 ══════════════
   自定义商人不在 SPT_Data 里，只列自带的话，用了自定义商人的作者
   在界面上只能看到"未知商人 xxxxxxxx"，连改都改不了。
   来源必须标出来 —— 它直接回答"这个商人到底存不存在"：
     spt/mod = 真的注册过；dlg/used = 只是个 id，挂上去任务不会出现。 */
const TSRC=t=>t.source==="mod"?TF("q_src_mod",t.from)
           :t.source==="dlg"?T("q_src_dlg")
           :t.source==="used"?T("q_src_used"):T("q_src_spt");
const isRealTrader=t=>t.source==="spt"||t.source==="mod";
/* "这台机器上找得到吗" —— 找不到不等于不存在：还没装、或还没适配当前 SPT 版本的
   商人 mod 都长这样。作者手动确认过的也算数。 */
const traderFound=id=>{
  const t=(QD.traders||[]).find(x=>x.id===id);
  return (t&&isRealTrader(t))||(QD.knownTraders||[]).includes(id);
};
function ackTrader(id,on){
  api("/api/quests/trader-ok",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id,on})})
    .then(d=>{QD.knownTraders=d.known||[];
      /* 校验结果是服务端算的，标完得重新取一次才会少那几条警告 */
      api("/api/quests").then(g=>{if(g.ok)QD.issues=g.issues||[];render();});})
    .catch(()=>{});
}

function traderMenu(btn){
  const q=qq(), all=QD.traders||[];
  const real=all.filter(isRealTrader), fake=all.filter(t=>!isRealTrader(t));
  const item=t=>({a:t.id,n:(lang==="zh"?t.zh:t.en)+(t.source==="mod"?" · "+t.from:""),d:null});
  const p=$("pop");
  p.innerHTML=`<h4>${T("q_m_trader")}</h4><div class="kindmenu">${
      real.map(t=>`<button data-a="${esc(t.id)}" ${t.id===q.traderId?'aria-pressed="true"':""}
        title="${esc(TSRC(t))}">${esc(item(t).n)}</button>`).join("")}</div>
    ${fake.length?`<h4 style="color:var(--o)">${T("q_src_warn")}</h4><div class="kindmenu">${
      fake.map(t=>`<button data-a="${esc(t.id)}" ${t.id===q.traderId?'aria-pressed="true"':""}
        class="risky" title="${esc(TSRC(t))}">${esc(item(t).n)}</button>`).join("")}</div>`:""}
    <h4>${T("q_m_trader_id")}</h4><div class="kindmenu">
      <button data-a="__id">${T("q_m_trader_id")}…</button></div>`;
  p.classList.add("on");
  p.style.left="-9999px";p.style.top="0";
  const r=btn.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight,m=8;
  let x=r.right-w; if(x<m)x=r.left;
  let y=r.bottom+4; if(y+h>innerHeight-m)y=Math.max(m,r.top-h-4);
  p.style.left=Math.max(m,Math.min(x,innerWidth-w-m))+"px";
  p.style.top=y+"px";
  p.querySelectorAll("[data-a]").forEach(b=>b.onclick=async()=>{
    let v=b.dataset.a;
    if(v==="__id"){
      v=((await ask(T("q_ask_trader"),q.traderId||""))||"").trim();
      if(!v)return;
      if(!/^[0-9a-fA-F]{24}$/.test(v)){await say(TF("q_bad_id",v));return;}
    }
    setTrader(q,v); hide(); qtouch(); render();
  });
}
function setTrader(q,v){
  q.traderId=v;
  /* 信赖/好感条件是绑商人的，换商人得把 target 一起改，否则条件指向旧商人永远不成立 */
  (q.conditions?.AvailableForStart||[]).forEach(c=>{
    if(c.conditionType==="TraderLoyalty"||c.conditionType==="TraderStanding")c.target=v;});
}
