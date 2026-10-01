/* ══ 章节「＋ 加一步」（10-01 SORA 过审原型 .work\proto-flow-1001.html 第 3 节）══
   作者想的是「等一小时后来电」「去找她聊完才算完」，落到数据上却是胶水任务 + 自动接 + 只走对话 + 对话门，散在任务和剧本两处，
   漏一样就卡死（实机踩过三回）。这里按意图问两三个空，配套的那些由编辑器替作者配——每种步骤只用现成的帮手
   （createQuest / addSub / setWhen / counter），不另起一套写法；加完和手工配出来的数据一模一样，之后照常在任务页、对话页改。 */
Object.assign(I18N.zh,{
  st_btn:"＋ 加一步",st_title:"加哪种步骤",st_go:"加进章节",st_will:"编辑器会替你做",
  st_k_visit:"去某地踩点",st_k_visit_d:"走到就打勾",st_k_wait:"等一段时间后来电",st_k_wait_d:"过一会儿才联系",
  st_k_talk:"去找商人对话",st_k_talk_d:"聊完才算完",st_k_transit:"转移到另一张图",st_k_transit_d:"从某图转移出去",st_k_raw:"自己搭",st_k_raw_d:"一条空任务",
  st_after:"接在哪一步之后",st_into:"加到哪条任务里",st_min:"等多少分钟",st_name:"任务名",st_text:"目标上写什么",st_map:"从哪张图转移出去",
  st_node:"从哪段对话开始",st_node_new:"（新建一段，台词之后再写）",st_end:"聊到哪一句算完",
  st_size:"范围多大",st_size_pt:"贴着一个点（约 2 米）",st_size_room:"一个房间（约 10 米）",st_size_area:"一大片（约 30 米）",
  st_will_visit:"在这个位置放一个贴地的到达区域（立即写进任务库的 zones 文件），再给任务加一条和它对上号的目标。",
  st_will_wait:"新建「等待」和「联络」两条任务：上一步完成后「等待」自动出现；时间一到，商人开场多出一条选项，点了接下「联络」、「等待」自动收掉；聊到你选的那句，「联络」完成。",
  st_will_talk:"新建一条任务：上一步完成后自动接下，商人亮金色电话；商人开场多出一条只在这时出现的选项；聊到你选的那句，任务完成。上一步若是终章，终章挪到这一步。",
  st_will_transit:"给任务加一条「从这张图转移出去」的目标。游戏只认从哪张图走、不认去哪——转去别的图也会打勾，靠目标文字引导。",
  st_done:"已加进章节——按「保存」一并存任务和剧本",st_need_dlg:"这种步骤要改这位商人的剧本，先把它打开。",
  st_need_prev:"这一章还没有可以接在后面的步骤——先用「自己搭」建第一条任务。",
  st_visit_bad:"没认出坐标和地图：把游戏里按 F11 打印的那一行整行粘进来（要带 location=）。",st_zone_fail:"区域没写进去：",
  st_visit_text:"抵达指定地点",st_transit_text:"从 {0} 转移离开",
  st_talk_name:"访问 {0}",st_talk_desc:"回去找 {0} 谈谈。",st_talk_obj:"回到主菜单访问 {0}",st_talk_opt:"和 {0} 谈谈。",
  st_wait_wname:"等待",st_wait_wdesc:"等 {0} 联络你。",st_wait_wobj:"等待 {0} 联络你",
  st_wait_rname:"联络",st_wait_rdesc:"{0} 会联系你。",st_wait_robj:"回应 {0} 的联络",st_wait_opt:"回应 {0} 的联络。",
  st_ph_npc:"（这段对话还没写）",st_ph_end:"（结束）"
});
Object.assign(I18N.en,{
  st_btn:"+ Add a step",st_title:"What kind of step",st_go:"Add to chapter",st_will:"The editor will",
  st_k_visit:"Reach a place",st_k_visit_d:"ticks on arrival",st_k_wait:"Get a call after a while",st_k_wait_d:"contact comes later",
  st_k_talk:"Go talk to the trader",st_k_talk_d:"done when the talk ends",st_k_transit:"Transit to another map",st_k_transit_d:"leave a map by transit",st_k_raw:"Build it myself",st_k_raw_d:"an empty quest",
  st_after:"After which step",st_into:"Add to which quest",st_min:"Minutes to wait",st_name:"Quest name",st_text:"Objective text",st_map:"Transit out of which map",
  st_node:"Which dialogue starts it",st_node_new:"(a new one — write the lines later)",st_end:"Which line ends it",
  st_size:"How big",st_size_pt:"Right at a point (about 2 m)",st_size_room:"A room (about 10 m)",st_size_area:"A wide area (about 30 m)",
  st_will_visit:"Put a ground-level arrival box at this spot (written to the library's zones file right away) and add a matching objective to the quest.",
  st_will_wait:"Create two quests, \"Waiting\" and \"Contact\": Waiting appears when the previous step is done; once the time is up the trader's opening gets one more option that accepts Contact and closes Waiting; Contact completes at the line you picked.",
  st_will_talk:"Create one quest: accepted automatically when the previous step is done, with the gold phone on the trader; the trader's opening gets an option that only shows then; the quest completes at the line you picked. If the previous step was the finisher, the finisher moves here.",
  st_will_transit:"Add a \"transit out of this map\" objective. The game only checks which map you leave, not where you go — any transit ticks it, so let the objective text guide the player.",
  st_done:"Added to the chapter — press Save to store the quests and the dialogue together",st_need_dlg:"This kind of step edits the trader's dialogue file. Open it first.",
  st_need_prev:"This chapter has no step to follow yet — create the first quest with \"Build it myself\".",
  st_visit_bad:"No coordinates and map found: paste the whole line the game prints on F11 (it must include location=).",st_zone_fail:"The zone was not written:",
  st_visit_text:"Reach the marked location",st_transit_text:"Transit out of {0}",
  st_talk_name:"Visit {0}",st_talk_desc:"Go back and talk to {0}.",st_talk_obj:"Return to the main menu and visit {0}",st_talk_opt:"Talk to {0}.",
  st_wait_wname:"Waiting",st_wait_wdesc:"Wait for {0} to contact you.",st_wait_wobj:"Wait for {0} to contact you",
  st_wait_rname:"Contact",st_wait_rdesc:"{0} will contact you.",st_wait_robj:"Answer {0}'s call",st_wait_opt:"Answer {0}'s call.",
  st_ph_npc:"(this dialogue is not written yet)",st_ph_end:"(end)"
});

const STEP_KINDS=["visit","wait","talk","transit","raw"];
const STEP_SIZE={pt:[2,1.8,2],room:[10,3,10],area:[30,6,30]};
let STEP=null;   /* 表单里填到一半的值；重画弹窗不丢 */
/* 新建任务会整页重画，手上的按钮就成了游离节点——定位弹窗前现取一个还在页面上的 */
const stepAt=btn=>btn&&btn.isConnected?btn:document.querySelector("[data-cstep]");

function stepMenu(btn,ch){
  const p=placeAt(stepAt(btn),`<h4>${T("st_title")}</h4>${STEP_KINDS.map(k=>
    `<button class="trrow" data-sk="${k}"><b>${T("st_k_"+k)}</b><span>${T("st_k_"+k+"_d")}</span></button>`).join("")}`);
  p.querySelectorAll("[data-sk]").forEach(b=>b.onclick=()=>{const k=b.dataset.sk,last=subConds(ch).at(-1)?.target||"";
    if(k==="raw"){hide();return newSub(ch);}
    STEP={k,after:last,into:last,node:"",end:-1,min:"60",name:"",f11:"",text:"",size:"room",map:(QD.exits||[])[0]?.map||""};
    stepForm(btn,ch);});
}
/* 从一屏出发能走到的「收尾选项」（点了对话就结束的那些）：聊到哪一句算完，从这里挑 */
function stepEnds(name){const out=[],seen=new Set(),todo=[name];
  while(todo.length){const n=todo.shift();if(seen.has(n)||!doc.nodes[n])continue;seen.add(n);
    doc.nodes[n].opts.forEach(o=>{if(doc.nodes[o.to])todo.push(o.to);else if(!o.to||o.to==="@close")out.push({n,o});});}
  return out;}

function stepForm(btn,ch){
  const S=STEP,qs=subConds(ch).map(c=>QD.quests[c.target]).filter(Boolean).map(s=>[s._id,qname(s)]),tn=qtrader(ch.traderId)||"";
  if((S.k==="wait"||S.k==="talk")&&!chDlgOpen(ch)){
    const p=placeAt(stepAt(btn),`<h4>${T("st_k_"+S.k)}</h4><div class="hint">${T("st_need_dlg")}</div>
      <div class="opts2" style="margin-top:.5rem"><button data-open>${TF("ch_flow_open",esc(chDlgFile(ch)))}</button></div>`);
    p.querySelector("[data-open]").onclick=async()=>{await loadDoc(chDlgFile(ch));if(chDlgOpen(ch))stepForm(null,ch);};return;}
  const sel=(k,items)=>`<select data-s="${k}">${items.map(([v,n])=>`<option value="${esc(v)}"${String(S[k])===String(v)?" selected":""}>${esc(n)}</option>`).join("")}</select>`;
  const inp=(k,ph)=>`<input data-s="${k}" value="${esc(S[k])}" placeholder="${esc(ph||"")}">`;
  const fld=(key,html)=>`<label class="fld"><i>${T(key)}</i>${html}</label>`;
  const talk=()=>{const ends=S.node?stepEnds(S.node).map((e,j)=>[j,`<${e.n}> ${String(e.o.t||"").slice(0,18)}`]):[];
    return fld("st_node",sel("node",[["",T("st_node_new")],...Object.keys(doc.nodes).map(n=>[n,"<"+n+">"])]))+(ends.length?fld("st_end",sel("end",ends)):"");};
  const F={
    visit:()=>fld("st_into",sel("into",qs))+fld("m_tr_paste",inp("f11","(213.88, -37.21, -270.83)  location=Shoreline"))
      +fld("st_text",inp("text",T("st_visit_text")))+fld("st_size",sel("size",Object.keys(STEP_SIZE).map(k=>[k,T("st_size_"+k)]))),
    wait:()=>fld("st_after",sel("after",qs))+fld("st_min",inp("min","60"))+talk(),
    talk:()=>fld("st_after",sel("after",qs))+fld("st_name",inp("name",TF("st_talk_name",tn)))+talk(),
    transit:()=>fld("st_into",sel("into",qs))+fld("st_map",sel("map",(QD.exits||[]).map(e=>[e.map,qmap(e.id)])))+fld("st_text",inp("text",TF("st_transit_text","…")))};
  const p=placeAt(stepAt(btn),`<h4>${T("st_k_"+S.k)}</h4>${F[S.k]()}
    <h4>${T("st_will")}</h4><div class="hint">${T("st_will_"+S.k)}</div>
    <div class="opts2" style="margin-top:.5rem"><button data-go aria-pressed="true">${T("st_go")}</button><button data-back>${T("m_trig_back")}</button></div>`);
  p.querySelectorAll("[data-s]").forEach(el=>el.onchange=()=>{S[el.dataset.s]=el.value;if(el.dataset.s==="node"){S.end=-1;stepForm(btn,ch);}});
  p.querySelector("[data-back]").onclick=()=>stepMenu(btn,ch);
  p.querySelector("[data-go]").onclick=()=>{p.querySelectorAll("[data-s]").forEach(el=>S[el.dataset.s]=el.value);stepApply(ch);};
}

async function stepApply(ch){
  const S=STEP,tn=qtrader(ch.traderId)||"",L=ch.conditions.AvailableForFinish;
  /* 「等待 / 对话」都是接在某一步后面的；章节还空着就没得接 */
  if((S.k==="talk"||S.k==="wait")&&!QD.quests[S.after])return say(T("st_need_prev"));
  /* 新建一条挂进本章的子任务：名字、描述两种语言都落上，完成信留空（没附件本来就不寄） */
  const quest=(name,desc)=>{const id=createQuest(QD.owner[ch._id],ch.traderId),q=QD.quests[id];q.QuestName=name;
    for(const l of ["ch","en"]){QD.locales[l][q.name]=name;QD.locales[l][q.description]=desc;QD.locales[l][q.successMessageText]="";}
    addSub(id,ch);return q;};
  /* 「某条任务到了某状态」当目标：接下那一刻就满足的那种，所以对话里的门一律配「进行中 + 可提交」 */
  const goal=(q,target,status,text)=>{const c={conditionType:"Quest",...condBase(),target,status,value:1};
    q.conditions.AvailableForFinish.push(c);normFin(q);qsetLocSync(c.id,text);};
  /* 新任务排到「接在哪一步之后」的紧后面；那一步原来是终章的话，终章标记跟着挪到新加的最后一条 */
  const place=(after,ids)=>{const rows=ids.map(id=>L.splice(L.findIndex(c=>c.target===id),1)[0]),at=L.findIndex(c=>c.target===after);
    L.splice(at+1,0,...rows);if(L[at]?.isFinisher){L[at].isFinisher=false;rows.at(-1).isFinisher=true;}normFin(ch);};
  /* 剧本这边：开场那一屏加一条通到 S.node 的选项（排在「交易 / 告辞」前面）；没挑节点就新建一屏占位。回「聊到这句算完」的那个选项 */
  const dlg=(text,extra)=>{let name=S.node,end;
    if(!name){let i=1;while(doc.nodes["step"+i])i++;name="step"+i;
      doc.nodes[name]={x:0,y:0,bg:"",narr:[],npc:T("st_ph_npc"),opts:[]};(doc.order ??= []).push(name);relaid=false;}
    else{const E=stepEnds(name);end=(E[+S.end]||E.at(-1))?.o;}
    if(!end)doc.nodes[name].opts.push(end={t:T("st_ph_end"),to:null});
    const R=doc.nodes[doc.start].opts,at=R.findIndex(o=>o.to==="@trade"||(!o.to&&!o.act));
    R.splice(at<0?R.length:at,0,{t:text,to:name,...extra});return end;};
  const act=(o,kind,q)=>{if(!o.act)o.act={kind,q};else if(o.act.kind===kind)o.act.q=[...qids(o.act.q),q].join(" ");else(o.extraActs ??= []).push({kind,q});};

  if(S.k==="talk"){const q=quest(S.name.trim()||TF("st_talk_name",tn),TF("st_talk_desc",tn));
    setWhen(q,"after",S.after);put(q,"visitapi.dialogOnly",true);goal(q,S.after,[4],TF("st_talk_obj",tn));place(S.after,[q._id]);
    act(dlg(TF("st_talk_opt",tn),{gate:{kind:"if",q:q._id,s:[2,3]}}),"complete",q._id);}
  if(S.k==="wait"){const h=Math.max(1,+S.min||60)/60,w=quest(T("st_wait_wname"),TF("st_wait_wdesc",tn)),r=quest(T("st_wait_rname"),TF("st_wait_rdesc",tn));
    setWhen(w,"after",S.after);put(w,"visitapi.autoFinish",true);goal(w,r._id,[2,4],TF("st_wait_wobj",tn));
    setWhen(r,"timed",S.after,h);put(r,"visitapi.dialogOnly",true);goal(r,S.after,[4],TF("st_wait_robj",tn));place(S.after,[w._id,r._id]);
    act(dlg(TF("st_wait_opt",tn),{act:{kind:"accept",q:r._id}}),"complete",r._id);}
  if(S.k==="visit"){const m=/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)(?:.*?location=(\w+))?/.exec(S.f11),q=QD.quests[S.into];
    if(!m||!m[4]||!q)return say(T("st_visit_bad"));
    const [sx,sy,sz]=STEP_SIZE[S.size]||STEP_SIZE.room,id="zone_"+NEWID().slice(0,10);
    /* F11 打的是相机高度，脚底再低 1.45 米；盒子贴地放（盒心 = 脚底 + 半个盒高）——上下楼挨得近的地方，高盒子会隔层误触（实机踩过） */
    try{QD.zones=(await api("/api/quests/zone",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,map:m[4],x:+m[1],y:+m[2]-1.45+sy/2,z:+m[3],sx,sy,sz})})).zones;}
    catch(e){return say(T("st_zone_fail")+" "+e.message);}
    const c={...counter({conditionType:"VisitPlace",id:NEWID(),target:id,value:1}),index:q.conditions.AvailableForFinish.length};
    q.conditions.AvailableForFinish.push(c);qsetLocSync(c.id,S.text.trim()||T("st_visit_text"));}
  if(S.k==="transit"){const q=QD.quests[S.into],e=(QD.exits||[]).find(x=>x.map===S.map);if(!q||!e)return;
    const c={...counter({conditionType:"ExitStatus",id:NEWID(),status:["Transit"]}),index:q.conditions.AvailableForFinish.length};
    c.counter.conditions.push({conditionType:"Location",id:NEWID(),target:[S.map]});
    q.conditions.AvailableForFinish.push(c);qsetLocSync(c.id,S.text.trim()||TF("st_transit_text",qmap(e.id)));}
  STEP=null;hide();if(chDlgOpen(ch))autosave();qtouch();render();qtoast(T("st_done"));
}
