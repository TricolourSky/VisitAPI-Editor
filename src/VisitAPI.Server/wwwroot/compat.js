/* VisitAPI 1.3.3: extension values change only after explicit author actions. */
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
  q_compat:"1.3.3 剧情设置",q_unlock_target:"完成后解锁的商人",q_unlock_target_d:"VisitAPI 在任务成功后解锁；新档可能先锁住这位商人。",
  q_call:"联系商人",q_call_d:"启用后，电话与对话角标使用指定商人；其他来电参数仍会保留。",
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
  q_compat:"1.3.3 story settings",q_unlock_target:"Trader unlocked on success",q_unlock_target_d:"VisitAPI unlocks this trader on success; new profiles may start with this trader locked.",
  q_call:"Calling trader",q_call_d:"When enabled, call and dialogue badges use this trader. Other call settings are preserved.",
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
  const row=(k,body)=>`<div class="prow2"><k>${T(k)}</k>${body}<s>${T(k+"_d")}</s></div>`;
  const trader=call.dialogueTraderId??call.fromTraderId;
  const preserved={mailSettings:q.mailSettings,visitapi:q.visitapi,rewards:q.rewards,notes:q.notes};
  return `<div class="tsec"><h5>${T("q_compat")}</h5></div>`+
    row("q_unlock_target",`<button class="pv" data-compat-trader="unlock">${esc(qtrader(vx.unlockTrader||q.traderId))}</button>`)+
    row("q_call",`<button class="sw" data-call-enable aria-pressed="${call.isEnabled===true}">${T(call.isEnabled===true?"q_on":"q_off")}</button>
      <button class="pv" data-compat-trader="call">${esc(trader?qtrader(trader):T("q_ro_empty"))}</button>`)+
    row("q_maps_unlock",maps.map((id,i)=>`<button class="pv" data-unlock-map-del="${i}">${esc(qmap(id))} ×</button>`).join("")+`<button class="add" data-unlock-map-add>＋</button>`)+
    `<details class="tnote"><summary>${T("q_preserved")}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(preserved,null,2))}</pre></details>`;
}
function wireCompatibility(q,M){
  M.querySelectorAll("[data-compat-trader]").forEach(b=>b.onclick=()=>qMenu(b,"q_p_trader",(QD.traders||[]).map(t=>({a:t.id,n:qtrader(t.id)})),null,id=>{
    if(b.dataset.compatTrader==="call"){q.mailSettings??={};q.mailSettings.dialogueTraderId=id;q.mailSettings.isEnabled=true;}
    else put(q,"visitapi.unlockTrader",id);
    hide();qtouch();render();
  }));
  const enable=M.querySelector("[data-call-enable]");if(enable)enable.onclick=()=>{q.mailSettings??={};q.mailSettings.isEnabled=q.mailSettings.isEnabled!==true;qtouch();render();};
  M.querySelectorAll("[data-unlock-map-del]").forEach(b=>b.onclick=()=>{q.visitapi.unlockLocations.splice(+b.dataset.unlockMapDel,1);qtouch();render();});
  const add=M.querySelector("[data-unlock-map-add]");if(add)add.onclick=()=>qMenu(add,"q_maps_unlock",(QD.maps||[]).filter(m=>/^[0-9a-f]{24}$/i.test(m.id)&&!(q.visitapi?.unlockLocations||[]).includes(m.id)).map(m=>({a:m.id,n:qmap(m.id)})),null,id=>{
    ((q.visitapi??={}).unlockLocations??=[]).push(id);hide();qtouch();render();
  });
}
