/* VisitAPI 1.3.3–1.3.4: extension values change only after explicit author actions. */
Object.assign(I18N.zh,{
  qe_bot_unknown_type:"离线目录中未找到 BOT 类型 {0}。若它由其他模组代码注册，请确认该模组已安装并成功加载。",
  q_c_placement:"在「{1}」放置 {0} 件物品",q_c_beacon:"在「{0}」放置信标",q_zone_input:"选择或填写区域 ID",
  qe_zone_wrong_type:"区域 {0} 的类型不适用于这个目标，需要 {1}。",qe_zone_unknown:"未在本库区域或游戏任务表中找到区域 {0}；场景或其他模组仍可能提供它，请核对。",
  qe_zone_file_broken:"区域文件 {0} 无法读取：{1}",
  q_native_links:"原生对话入口（只读）",q_native_links_d:"列出插件会保留的接取/完成动作；实际可达性仍取决于对话条件。原生对话文件不在此编辑。",
  qe_native_dialogue_broken:"原生对话 {0} 无法读取，相关任务入口暂时无法确认：{1}",
  link_stale:"剧本已被修改，挂接列表已刷新，请重新选择。",unsafe_source:"未保存：原剧本含有无法无损回写的语句。请先按解析警告修正原文，再重新打开。",
  invalid_number:"请输入有效数值；记号只接受 32 位整数。",invalid_trigger:"触发点输入无效：请检查坐标、非负距离，以及提示文字里的双引号。",
  q_sw_notDisplayedQuest:"隐藏任务",q_sw_notDisplayedQuest_d:"机制任务不进入任务列表。已有自动接取、完成规则保持原样。",
  q_compat:"1.3.4 剧情设置",q_unlock_target:"完成后解锁的商人",q_unlock_target_d:"VisitAPI 在任务成功后解锁；新档可能先锁住这位商人。",
  q_call:"联系商人",q_call_d:"启用后，金色电话角标挂在这位商人身上（没指定就用发信商人）；1.1 数据里写了发信商人的，还会发聊天邀请（见下一行）。其他来电参数仍会保留。",
  q_invite:"聊天邀请",q_invite_d:"1.1 的对话邀请（插件 1.3.4）：任务一变成可接，发信商人就在聊天窗「特殊通讯」里寄一封信，信上有「访问」或「回复」按钮。开关就是上面「联系商人」那一个：开了既亮金色电话、又寄信。",
  q_inv_auto:"这条任务开了自动接：插件不会寄这封信。",q_inv_off:"邀请还没打开（上面「联系商人」的开关）。",
  q_inv_from:"发信商人",q_inv_from_d:"信以这位商人的名义出现在聊天里。包里的 1.1 商人（Kerman、电台…）也能选。",q_m_invfrom:"谁来发这封信",
  q_inv_entry:"信上的按钮",q_inv_entry_d:"「访问」＝进这位商人的房间（要装了他的房间包）；「回复」＝直接打开下面选的那段对话，没房间的商人用它。文件里原来的 InRaid / ViaNotebook 不点就原样留着。",
  q_inv_visit:"访问",q_inv_reply:"回复",
  q_inv_dlg:"回复时打开",q_inv_dlg_d:"从内容包里这位发信商人的原生对话里挑；不指定就打开商人的主对话。",q_m_invdlg:"点「回复」打开哪段对话",q_inv_dlg_none:"（不指定）",
  q_inv_text:"信的正文",q_inv_text_d:"在下面消息区的「邀请」页写，中英各一份；没有正文服务端就不寄。",q_inv_text_go:"去写正文 ↓",
  q_msg_invite:"邀请",q_tipm_invite:"聊天邀请信：任务一变成可接，发信商人寄到聊天里（插件 1.3.4）",q_inv_notext:"（还没写正文：这封信不会寄）",
  q_inv_prev:"游戏里聊天窗的邀请标题栏大致这个样子",q_inv_prev_off:"这封信现在发不出去（邀请没开、没选发信商人，或任务开了自动接），所以压暗",q_inv_btn_visit:"访问",q_inv_btn_reply:"回复",
  q_setvars:"进入状态时设变量",q_setvars_d:"任务到了这个状态，插件就给存档变量赋这个值（1.1 的变量奖励，插件 1.3.4；迷宫的科学家笔记就靠它）。这里只读，原样保留。",
  qe_invite_no_text:"这条任务开了聊天邀请，但中文和英文都没有邀请信正文（文案键「任务id whileAvailableMessageText」）：别的语言也没有时服务端不寄信、只亮金色电话；别的语言有时照寄，中英玩家看到的是一串文案键。",
  qe_invite_bad_entry:"邀请信的入口类型「{0}」插件不认识（只认 InLobby / InRaid / ViaRadio / ViaNotebook）：按钮会显示「访问」，点了却是直接打开对话。",
  qe_invite_no_dialogue:"这封邀请是「回复」式（电台 / 笔记本），却没指定打开哪段对话（dialogueId）：玩家点「回复」只会打开这位商人的主对话。",
  qe_setvar_bad:"「进入状态时设变量」里 {0} 写得不对：状态只认 Started / Success / Fail，变量 id 要 24 位十六进制，值要整数——插件会悄悄跳过这一项。",
  q_maps_unlock:"完成后解锁地图",q_maps_unlock_d:"这些地图在新档里先锁定，完成此任务后开放。",
  q_preserved:"查看保留的扩展配置",q_mail_policy:"开了「剧情任务（1.1 字段）」的任务，VisitAPI 只在对应奖励含物品时寄邮件；没开的照游戏原样寄。电话角标由联系商人设置控制。",
  q_zone:"区域",q_zone_inherit:"沿用 zoneIds：{0}",q_r_TraderUnlock:"解锁商人",q_name_conflict:"文件名无效或已存在：{0}",
  qe_bad_quest_identity:"任务 _id 无效：{0}",qe_quest_key_mismatch:"文件键 {0} 与任务 _id {1} 不一致。",
  qe_duplicate_quest_identity:"多个任务使用相同 _id：{0}",qe_vanilla_quest_identity:"任务 _id 与游戏数据重复：{0}。确认是否有意覆盖。",
  qe_field_type:"字段 {0} 的类型应为 {1}。",qe_bad_location_unlock:"解锁地图须填写地图 ID：{0}",
  qe_bad_call:"来电商人 ID 无效：{0}",qe_timed_no_badge:"此 1.1 剧情任务有等待时间，但未指定联系商人，电话角标不会显示。",
  qe_bad_reward_type:"{0} 奖励类型 {1} 不受 SPT 4.1 支持，可能使整份文件无法加载。旧地图／对话解锁请使用 VisitAPI 扩展。",
  qe_reward_edition:"{0} 奖励的游戏版本限制可能无效：{1}；版本名与 PvE/PvP 模式不同。",
  qe_assort_unlock_incomplete:"{0} 的商品解锁奖励缺少商人或商品数据。",qe_mail_dropped:"这是剧情任务（1.1 字段），{0} 奖励又不含物品，VisitAPI 不会发送这封邮件；写好的文案玩家看不到。",
  qe_dangling_parent:"目标 {0} 指向不存在的父目标 {1}。",qe_finditem_nested:"找到物品目标 {0} 被放进计数器；SPT 4.1 需要顶层 FindItem。",
  qe_condition_legacy:"旧条件 {0} 需要适配 SPT 4.1；原数据已保留，未自动转换。",qe_zone_missing:"放置目标 {0} 没有有效区域。",
  qe_quest_cycle:"原生前置与接续关系形成循环。",qe_hidden_notify:"隐藏任务启用了原生通知，玩家可能看到本应隐藏的提示。",
  qe_story_outside_chapter:"这条任务开了「剧情任务（1.1 字段）」却不在任何章节里：插件按剧情任务处理——不进商人列表、原生横幅被拦、又没有章节横幅，接 / 交 / 完成全程没有任何提示。不是移植 1.1 数据就把开关关掉。",
  qe_sub_two_chapters:"这条子任务挂进了两个章节。插件只按其中一章算它的门控和剧情页归属，另一章里它永远打不上勾——只留一章。",
  qe_unlock_dlg_trader:"「完成后开放访问」指向的商人 {0} 有自己的 .dlg：他的「访问」按钮只看那份文件头的 tab:，这一项对他只是压住金色电话。要门控他的按钮，去对话编辑页改 tab:。",
  qe_placeholder_text:"{0} 还是新建时的占位字（「新任务」「（还没写…）」这类），游戏里会原样显示——填上真正的文案。",
  qe_chapter_no_entry:"这一章没有任何开头：章节自己没开「自动接」、没接在别的任务后面，对话里也没有接它或它任一条子任务的选项——整章永远不会开始（子任务自己的自动接 / 接在…之后要章节先开了才算数）。",
  qe_bad_locale_file:"db\\locales 里的 {0} 不是这台 SPT 认识的语言（看 SPT_Data\\database\\locales\\global 有哪些）：只要它在，插件加载每条任务都会报错，章节子任务也借不到章节名。中文是 ch.json 不是 zh.json——删掉或改名。",
  qe_dup_id_pack:"这条任务的 id 在同一模组的另一个包「{0}」里也有。插件加载时先来的赢、后来的整条跳过——两边只能留一份。"
});
Object.assign(I18N.en,{
  qe_bot_unknown_type:"BOT type {0} was not found in the offline catalog. If another mod registers it in code, confirm that mod is installed and loads successfully.",
  q_c_placement:"Place {0} item(s) at \"{1}\"",q_c_beacon:"Place a beacon at \"{0}\"",q_zone_input:"Choose or enter a zone ID",
  qe_zone_wrong_type:"Zone {0} has the wrong type for this objective; expected {1}.",qe_zone_unknown:"Zone {0} was not found in this library or stock quest data. A scene or another mod may still provide it; check the ID.",
  qe_zone_file_broken:"Cannot read zone file {0}: {1}",
  q_native_links:"Native dialogue links (read only)",q_native_links_d:"Accept/finish actions retained by the plugin. Reachability still depends on dialogue conditions. Native files are not edited here.",
  qe_native_dialogue_broken:"Cannot read native dialogue {0}; its quest links cannot be confirmed: {1}",
  link_stale:"Dialogue changed. Links have been refreshed; select the option again.",unsafe_source:"Not saved: the original contains statements that cannot be rewritten without loss. Fix the parser warnings in the source and reopen it.",
  invalid_number:"Enter a valid number; flags require a 32-bit integer.",invalid_trigger:"Invalid trigger input: check coordinates, nonnegative distances, and double quotes in the prompt.",
  q_sw_notDisplayedQuest:"Hidden quest",q_sw_notDisplayedQuest_d:"Mechanism quests stay out of lists. Existing start and completion rules are preserved.",
  q_compat:"1.3.4 story settings",q_unlock_target:"Trader unlocked on success",q_unlock_target_d:"VisitAPI unlocks this trader on success; new profiles may start with this trader locked.",
  q_call:"Calling trader",q_call_d:"When enabled, the gold phone badge goes on this trader (or the sender if none is set); 1.1 data that also names a sender sends a chat invite too (next row). Other call settings are preserved.",
  q_invite:"Chat invite",q_invite_d:"The 1.1 dialogue invite (plugin 1.3.4): once the quest becomes available, the sender posts a letter in the chat's special channel with a Visit or Reply button. Its switch is the Calling trader switch above: on means both the gold phone and the letter.",
  q_inv_auto:"This quest auto-accepts, so the plugin never sends the letter.",q_inv_off:"The invite is off (Calling trader switch above).",
  q_inv_from:"Sender",q_inv_from_d:"The letter appears in the chat under this trader's name. The pack's 1.1 traders (Kerman, the radio…) can be picked too.",q_m_invfrom:"Who sends the letter",
  q_inv_entry:"Letter button",q_inv_entry_d:"Visit = go to this trader's room (needs their room pack); Reply = open the dialogue picked below directly — use it for traders without a room. An existing InRaid / ViaNotebook stays as it is unless you click.",
  q_inv_visit:"Visit",q_inv_reply:"Reply",
  q_inv_dlg:"Reply opens",q_inv_dlg_d:"Pick from the sender's native dialogues in the content pack; none = the trader's main dialogue.",q_m_invdlg:"Which dialogue Reply opens",q_inv_dlg_none:"(none)",
  q_inv_text:"Letter text",q_inv_text_d:"Written on the Invite tab of the message area below, one per language; without text the server sends nothing.",q_inv_text_go:"Write the text ↓",
  q_msg_invite:"Invite",q_tipm_invite:"Chat invite letter: sent to the chat by the sender once the quest becomes available (plugin 1.3.4)",q_inv_notext:"(no text yet: this letter is not sent)",
  q_inv_prev:"Roughly how the invite bar looks in the game's chat",q_inv_prev_off:"This letter cannot go out right now (invite off, no sender, or the quest auto-accepts), so it is dimmed",q_inv_btn_visit:"VISIT",q_inv_btn_reply:"REPLY",
  q_setvars:"Variables set on status",q_setvars_d:"When the quest reaches this status the plugin sets these profile variables (1.1's variable rewards, plugin 1.3.4; the Labyrinth scientist notes rely on it). Read only here; preserved as they are.",
  qe_invite_no_text:"This quest has a chat invite but no invite text in Chinese or English (locale key “questId whileAvailableMessageText”): if no other language has it either, the server sends nothing and only the gold phone lights; if another language has it, the letter goes out and Chinese/English players see a raw locale key.",
  qe_invite_bad_entry:"The invite entry type “{0}” is unknown to the plugin (only InLobby / InRaid / ViaRadio / ViaNotebook): the button says Visit but opens the dialogue directly.",
  qe_invite_no_dialogue:"This is a Reply-style invite (radio / notebook) but names no dialogue to open (dialogueId): Reply only opens the trader's main dialogue.",
  qe_setvar_bad:"“Variables set on status” has a bad entry {0}: the status must be Started / Success / Fail, the variable id 24 hex characters and the value an integer — the plugin silently skips it.",
  q_maps_unlock:"Maps unlocked on success",q_maps_unlock_d:"These maps start locked on new profiles and open when this quest succeeds.",
  q_preserved:"View preserved extension settings",q_mail_policy:"With the story-quest (1.1 field) switch on, VisitAPI sends mail only when that reward stage grants items; with it off, mail goes out as in the stock game. Phone badges use calling trader settings.",
  q_zone:"Zone",q_zone_inherit:"Inherited zoneIds: {0}",q_r_TraderUnlock:"Unlock trader",q_name_conflict:"Invalid or existing filename: {0}",
  qe_bad_quest_identity:"Invalid quest _id: {0}",qe_quest_key_mismatch:"File key {0} differs from quest _id {1}.",
  qe_duplicate_quest_identity:"Multiple quests use _id {0}.",qe_vanilla_quest_identity:"Quest _id overlaps game data: {0}. Check whether this override is intentional.",
  qe_field_type:"Field {0} must be {1}.",qe_bad_location_unlock:"Map unlock requires a map ID: {0}",
  qe_bad_call:"Invalid calling trader ID: {0}",qe_timed_no_badge:"This 1.1 story quest has a delay but no calling trader, so its phone badge will not appear.",
  qe_bad_reward_type:"{0} reward type {1} is unsupported by SPT 4.1 and may prevent the entire file from loading. Use VisitAPI extensions for legacy map/dialogue unlocks.",
  qe_reward_edition:"Possibly invalid {0} reward edition: {1}. Editions differ from PvE/PvP modes.",
  qe_assort_unlock_incomplete:"{0} assortment unlock reward is missing its trader or items.",qe_mail_dropped:"This is a story quest (1.1 field) and its {0} reward grants no items, so VisitAPI suppresses the mail; the text you wrote is never seen.",
  qe_dangling_parent:"Objective {0} refers to missing parent {1}.",qe_finditem_nested:"Find-item objective {0} is nested in a counter; SPT 4.1 requires top-level FindItem.",
  qe_condition_legacy:"Legacy condition {0} needs SPT 4.1 adaptation. Original data is preserved without conversion.",qe_zone_missing:"Placement objective {0} has no valid zone.",
  qe_quest_cycle:"Native prerequisites and start-after links form a cycle.",qe_hidden_notify:"A hidden quest enables native notifications, which may expose its events.",
  qe_story_outside_chapter:"This quest has the 1.1 story flag on but belongs to no chapter. The plugin treats it as a story quest anyway: kept out of trader lists, native banners blocked, and no chapter banner either — accepting, handing in and completing all happen in silence. Turn the switch off unless this is ported 1.1 data.",
  qe_sub_two_chapters:"This sub-quest is attached to two chapters. The plugin gates it and files it under one chapter only; in the other it can never be ticked — keep one.",
  qe_unlock_dlg_trader:"\"Unlocks visits when done\" names trader {0}, who has a .dlg of his own: his Visit button follows the tab: line in that file, and this entry only holds back his gold phone. To gate his button, edit tab: on the Dialogue page.",
  qe_placeholder_text:"{0} still holds the text written when the quest was created (\"New quest\", \"(no … yet)\") and the game shows it as is — write the real text.",
  qe_chapter_no_entry:"Nothing starts this chapter: the chapter itself has no auto-accept, does not start after another quest, and no dialogue option accepts it or any of its sub-quests — it never begins (a sub-quest's own auto-accept / start-after only works once the chapter is open).",
  qe_bad_locale_file:"{0} in db\\locales is not a language this SPT knows (see SPT_Data\\database\\locales\\global). While it exists, every quest logs a load error and chapter sub-quests cannot borrow the chapter's name. Chinese is ch.json, not zh.json — delete or rename it.",
  qe_dup_id_pack:"This quest id also exists in pack \"{0}\" of the same mod. The plugin keeps whichever loads first and skips the other — keep only one copy."
});

function compatibilityRows(q){
  const vx=q.visitapi||{}, call=q.mailSettings||{}, maps=Array.isArray(vx.unlockLocations)?vx.unlockLocations:[];
  /* 属性行是「名称 / 值 / 说明」三格的网格：值那格可能有好几个按钮，一律包进一格（原来两个按钮会把说明挤到下一行） */
  const row=(k,body)=>`<div class="prow2"><k>${T(k)}</k><span class="pvgrp">${body}</span><s>${T(k+"_d")}</s></div>`;
  const trader=call.dialogueTraderId??call.fromTraderId;
  const preserved={mailSettings:q.mailSettings,visitapi:q.visitapi,rewards:q.rewards,notes:q.notes};
  /* 1.3.4：聊天邀请（插件 InviteRouter / ChatInvites）可编辑——发信商人、按钮（访问 / 回复）、回复时打开哪段对话；正文在消息页「邀请」写。
     开关就是上面「联系商人」那一个（1.1 的 mailSettings.isEnabled，SORA 09-27 定共用）。「进入某状态时设变量」（visitapi.setVariables）只读 */
  const reply=["ViaRadio","ViaNotebook"].includes(call.entryPoint);
  const dlgName=id=>{const d=(QL?.native?.elements||[]).find(x=>x.id===id);return d?(lang==="zh"?d.zh||d.en:d.en||d.zh)||id.slice(0,8)+"…":id?id.slice(0,8)+"…":T("q_inv_dlg_none");};
  const state=vx.autoStart===true?T("q_inv_auto"):call.isEnabled!==true?T("q_inv_off"):"";
  const sv=vx.setVariables&&typeof vx.setVariables==="object"&&!Array.isArray(vx.setVariables)?vx.setVariables:{};
  const svs=Object.entries(sv).flatMap(([st,m])=>m&&typeof m==="object"?Object.entries(m).map(([v,n])=>
    `${["Started","Success","Fail"].includes(st)?T("q_note_"+st):st} ${String(v).slice(0,8)}… = ${JSON.stringify(n)}`):[`${st} ?`]);
  return `<div class="tsec"><h5>${T("q_compat")}</h5></div>`+
    row("q_unlock_target",`<button class="pv" data-compat-trader="unlock">${esc(qtrader(vx.unlockTrader||q.traderId))}</button>`)+
    row("q_call",`<button class="sw" data-call-enable aria-pressed="${call.isEnabled===true}">${T(call.isEnabled===true?"q_on":"q_off")}</button>
      <button class="pv" data-compat-trader="call">${esc(trader?qtrader(trader):T("q_ro_empty"))}</button>`)+
    (svs.length?row("q_setvars",svs.map(s=>`<span class="pv">${esc(s)}</span>`).join("")):"")+
    row("q_maps_unlock",maps.map((id,i)=>`<button class="pv" data-unlock-map-del="${i}">${esc(qmap(id))} ×</button>`).join("")+`<button class="add" data-unlock-map-add>＋</button>`)+
    `<div class="tsec" data-sec="q_invite"><h5>${T("q_invite")}</h5></div><div class="tnote">${T("q_invite_d")}${state?` <b class="qinvnote">${state}</b>`:""}</div>`+
    row("q_inv_from",`<button class="pv" data-inv-from>${esc(call.fromTraderId?qtrader(call.fromTraderId):T("q_ro_empty"))}</button>`)+
    row("q_inv_entry",["InLobby","ViaRadio"].map(e=>`<button class="sw" data-inv-entry="${e}" aria-pressed="${(e==="ViaRadio")===reply}">${T(e==="ViaRadio"?"q_inv_reply":"q_inv_visit")}</button>`).join(""))+
    (reply?row("q_inv_dlg",`<button class="pv" data-inv-dlg>${esc(dlgName(call.dialogueId))}</button>`):"")+
    row("q_inv_text",`<button class="pv" data-inv-text>${T("q_inv_text_go")}</button>`)+
    `<details class="tnote"><summary>${T("q_preserved")}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(preserved,null,2))}</pre></details>`;
}
/* 消息页「邀请」上方的预览：照 1.1 聊天窗的邀请标题栏（插件 ChatInvites：左黑右金渐变、商人名 / 信文、访问或回复按钮）。
   信发不出去（没开、没发信商人、开了自动接）就整条压暗 */
function inviteBar(q){
  const c=q.mailSettings||{}, reply=["ViaRadio","ViaNotebook"].includes(c.entryPoint);
  const live=c.isEnabled===true&&/^[0-9a-f]{24}$/i.test(c.fromTraderId||"")&&dig(q,"visitapi.autoStart")!==true;
  return `<div class="qinv${live?"":" off"}" title="${esc(T(live?"q_inv_prev":"q_inv_prev_off"))}"><b>↰ ${esc(qtrader(c.fromTraderId||q.traderId))}</b>
    <span class="qinvt">${esc(qtext(q,"__invite")||T("q_inv_notext"))}</span><i><s>${T(reply?"q_inv_btn_reply":"q_inv_btn_visit")}</s></i></div>`;
}
function wireCompatibility(q,M){
  M.querySelectorAll("[data-compat-trader]").forEach(b=>b.onclick=()=>qMenu(b,"q_p_trader",(QD.traders||[]).map(t=>({a:t.id,n:qtrader(t.id)})),null,id=>{
    if(b.dataset.compatTrader==="call"){q.mailSettings??={};q.mailSettings.dialogueTraderId=id;q.mailSettings.isEnabled=true;}
    else put(q,"visitapi.unlockTrader",id);
    hide();qtouch();render();
  }));
  /* 聊天邀请：发信商人 / 按钮 / 回复时打开哪段对话（列表 = 包里这位商人的原生对话）/ 去消息页写正文 */
  const from=M.querySelector("[data-inv-from]");if(from)from.onclick=()=>qMenu(from,"q_m_invfrom",(QD.traders||[]).map(t=>({a:t.id,n:qtrader(t.id)})),q.mailSettings?.fromTraderId,id=>{
    const c=(q.mailSettings??={});c.fromTraderId=id;if(c.dialogueId&&!(QL?.native?.elements||[]).some(d=>d.id===c.dialogueId&&d.trader===id))delete c.dialogueId;
    hide();qtouch();render();});
  M.querySelectorAll("[data-inv-entry]").forEach(b=>b.onclick=()=>{(q.mailSettings??={}).entryPoint=b.dataset.invEntry;qtouch();render();});
  const dl=M.querySelector("[data-inv-dlg]");if(dl)dl.onclick=()=>{const c=q.mailSettings||{};
    const L=(QL?.native?.elements||[]).filter(d=>d.trader===c.fromTraderId).map(d=>({a:d.id,n:(lang==="zh"?d.zh||d.en:d.en||d.zh)||d.id.slice(0,8)}));
    qMenu(dl,"q_m_invdlg",[{a:"",n:T("q_inv_dlg_none")},...L],c.dialogueId||"",id=>{if(id)c.dialogueId=id;else delete c.dialogueId;hide();qtouch();render();});};
  const gt=M.querySelector("[data-inv-text]");if(gt)gt.onclick=()=>{qmsg="__invite";render();document.querySelector('[data-f="__invite"]')?.focus();};
  const enable=M.querySelector("[data-call-enable]");if(enable)enable.onclick=()=>{q.mailSettings??={};q.mailSettings.isEnabled=q.mailSettings.isEnabled!==true;qtouch();render();};
  M.querySelectorAll("[data-unlock-map-del]").forEach(b=>b.onclick=()=>{q.visitapi.unlockLocations.splice(+b.dataset.unlockMapDel,1);qtouch();render();});
  const add=M.querySelector("[data-unlock-map-add]");if(add)add.onclick=()=>qMenu(add,"q_maps_unlock",(QD.maps||[]).filter(m=>/^[0-9a-f]{24}$/i.test(m.id)&&!(q.visitapi?.unlockLocations||[]).includes(m.id)).map(m=>({a:m.id,n:qmap(m.id)})),null,id=>{
    ((q.visitapi??={}).unlockLocations??=[]).push(id);hide();qtouch();render();
  });
}
