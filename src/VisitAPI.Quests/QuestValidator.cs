using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>一条校验结果。<b>只给码和参数，不给人话</b> —— 人话在界面的中英表里，这样才翻得动。</summary>
public sealed record Issue(string Level, string QuestId, string Code, string[] Args);

/// <summary>
/// 校验规则住在服务端，**不在前端重写一遍**。
/// 上一版原型是 JS 里写的，真代码再抄一份就又是"两个 writer"那种同步债 ——
/// .dlg 的回写已经因为这个丢过一次数据，不再犯。
/// </summary>
public static partial class QuestValidator
{
    /// <summary>SPT 的 QuestTypeEnum（反编译 SPTarkov.Server.Core.dll 得到），去掉 Arena 那三个。</summary>
    public static readonly string[] Types =
        ["PickUp","Elimination","Discover","Completion","Exploration","Levelling",
         "Experience","Standing","Loyalty","Merchant","Skill","Multi","WeaponAssembly"];

    /// <param name="dlgAccept">.dlg 里被 accept: 挂过的任务 id；null = 没扫到工作区，跟它有关的规则跳过（宁可漏报不误报）</param>
    /// <param name="dlgComplete">同上，complete:</param>
    /// <param name="dlgBadIds">.dlg 里引用不到任何任务的 id（文件, id）</param>
    /// <param name="vanillaQuests">原版任务 id；null = 没有 SPT 数据，「前置不存在」只能降成提示（扫不到 ≠ 不存在）</param>
    public static List<Issue> Run(QuestStore quests, LocaleStore loc, IReadOnlySet<string> knownTraders,
                                  IReadOnlySet<string>? dlgAccept = null, IReadOnlySet<string>? dlgComplete = null,
                                  IEnumerable<(string File, string Id)>? dlgBadIds = null, IReadOnlySet<string>? vanillaQuests = null,
                                  IReadOnlyList<AreaRow>? areas = null, IReadOnlyCollection<string>? transitMaps = null,
                                  bool visitApiDb = false, IReadOnlyList<QuestZone>? zones = null, IReadOnlySet<string>? stockZones = null,
                                  IReadOnlySet<string>? dlgTraders = null, IReadOnlyDictionary<string, string>? siblingQuests = null,
                                  IReadOnlyList<DlgLinks.DlgGate>? dlgGates = null)
    {
        var all = quests.All().ToList();
        var ids = all.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var out_ = new List<Issue>();
        var chapters = all.Where(x => Bool(x.Quest["visitapi"] as JsonObject, "chapter")).ToList();
        var subIds = chapters.SelectMany(x => QuestRefs(Conds(x.Quest, "AvailableForFinish"))).ToHashSet(StringComparer.OrdinalIgnoreCase);
        // 这条子任务归哪一章（可能被多章引用，都算）
        IEnumerable<string> chapterOf(string subId) => chapters
            .Where(c => QuestRefs(Conds(c.Quest, "AvailableForFinish")).Any(t => t.Equals(subId, StringComparison.OrdinalIgnoreCase)))
            .Select(c => c.Id);
        // id → 任务。用 GroupBy 建：all 允许重复 id（那是 dup_id 那条规则的活），直接 ToDictionary 会抛。
        var byId = all.GroupBy(x => x.Id, StringComparer.OrdinalIgnoreCase)
                      .ToDictionary(g => g.Key, g => g.First().Quest, StringComparer.OrdinalIgnoreCase);
        // 顺着 startAfter 往前走一步（1.3.4 起可以是一组，见 Afters）。成环检测唯一的读点。
        List<string> aftersOf(string qid) => byId.TryGetValue(qid, out var x) ? Afters(x["visitapi"] as JsonObject) : [];
        // 同一章里的兄弟子任务（被多章引用就都算）
        IEnumerable<string> siblingsOf(string subId) => chapters
            .Where(c => QuestRefs(Conds(c.Quest, "AvailableForFinish")).Contains(subId, StringComparer.OrdinalIgnoreCase))
            .SelectMany(c => QuestRefs(Conds(c.Quest, "AvailableForFinish")))
            .Where(t => !t.Equals(subId, StringComparison.OrdinalIgnoreCase));
        // 章节开了 mailRewardsOnly（10-01，插件同日）：章节和它的子任务只在信里有物品附件时才寄——没附件的完成信寄不出去，上面的占位字没人看得到
        var quietMail = chapters.Where(c => Bool(c.Quest["visitapi"] as JsonObject, "mailRewardsOnly"))
            .SelectMany(c => QuestRefs(Conds(c.Quest, "AvailableForFinish")).Append(c.Id)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        static bool ItemReward(JsonObject q) => ((q["rewards"] as JsonObject)?["Success"] as JsonArray)?.OfType<JsonObject>().Any(r => Str(r, "type") == "Item") == true;

        foreach (var (id, file, q) in all)
        {
            void Err(string code, params string[] a) => out_.Add(new Issue("err", id, code, a));
            void Warn(string code, params string[] a) => out_.Add(new Issue("warn", id, code, a));

            if (!IsMongoId(id)) Err("bad_id", id);
            // 同一模组的另一个内容包里也有这条 id（09-23）：插件加载时先来的赢、后来的整条跳过，两边只能留一份
            if (siblingQuests != null && siblingQuests.TryGetValue(id, out var otherPack)) Warn("dup_id_pack", otherPack);
            // isStoryQuest 是 1.1 的字段（插件 1.3 认）：1.1 的剧情任务 successMessageText 本来就是空串（服务端只对剧情任务压「没物品」的信，
            // 别的任务只压「没正文且没物品」的），名字为空时服务端拿章节名顶上。所以这两条对剧情任务降级：文案空只提示、没名字不报
            var story = Bool(q, "isStoryQuest") || Bool(q, "notDisplayedQuest");
            if (!visitApiDb && !story && Text(loc, q, "successMessageText").Length == 0) Err("no_success_msg");
            Compatibility(id, q, loc, visitApiDb, Err, Warn);
            CheckZones(q, zones, stockZones, dlgComplete?.Contains(id) == true, Err, Warn);
            if (Conds(q, "AvailableForFinish").Count == 0) Err("no_objectives");
            var vx = q["visitapi"] as JsonObject;   // 一律 as JsonObject：`"visitapi": true` 这种脏数据不能让整页 500
            // anyOf：true = 全部目标任一达成即可交；数组 = 「二选一组」的目标 id（09-10，插件同日改：组内任一达成算组达成、组外照旧全要）。
            // 组里的 id 必须是本任务的目标（插件一条都对不上会退回原生「全部达成」）；不到两条没意义；别的写法插件当没开
            if (vx?["anyOf"] is JsonArray anyGrp)
            {
                var finIds = Conds(q, "AvailableForFinish").Select(c => Str(c, "id")).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var g in anyGrp) { var gid = g is JsonValue gv && gv.TryGetValue<string>(out var gs) ? gs : g?.ToJsonString() ?? ""; if (!finIds.Contains(gid)) Err("anyof_bad_id", Cut(gid)); }
                if (anyGrp.Count < 2) Warn("anyof_one");
            }
            else if (vx?["anyOf"] is JsonNode an && !(an is JsonValue av && av.TryGetValue<bool>(out _))) Err("anyof_bad_id", an.ToJsonString());
            else if (Bool(vx, "anyOf") && Conds(q, "AvailableForFinish").Count < 2) Warn("anyof_one");
            // 1.1 的条件表多一个 AutoStart 桶（EQuestStatus 新值），0.16 客户端把它当字典键反序列化直接抛 → 登录无限转圈（插件 #129）
            if ((q["conditions"] as JsonObject)?.ContainsKey("AutoStart") == true) Err("cond_autostart_bucket");

            // 章节系统（Rework DEV_NOTES #70/#71）：章节的子任务就是它目标里的「完成任务」；日记 id 必须是 24 位 hex 且要有正文
            if (Bool(vx, "chapter")) Chapter(id, q, vx!, all, dlgAccept, Err, Warn);
            // 剧情任务不进支线/商人列表（插件 StoryList），子任务的接/交只剩自动开关和 .dlg 两条路——两条都没有就是死任务
            if (Bool(q, "notDisplayedQuest") && Bool(q, "canShowNotificationsInGame")) Warn("hidden_notify");
            // 1.1 剧情标记打在章外的单独任务上：插件把它当剧情家族——不进商人列表、原生横幅被拦、又没有章节横幅，接/交/完成全程无声（1.3.3 核过）
            if (Bool(q, "isStoryQuest") && !Bool(vx, "chapter") && !subIds.Contains(id) && !Bool(q, "notDisplayedQuest")) Warn("story_outside_chapter");
            // 新建任务落的占位文案（q_new_* / ch_new_name，中英各一份）：是「还没写」，不是写好了——按空白处理并点名（1.3.3）
            foreach (var field in new[] { "name", "description", "successMessageText" })
                if (field == "successMessageText" && quietMail.Contains(id) && !ItemReward(q)) continue;   // 这封信不寄，占位字没人看得到
                else if (Str(q, field) is { Length: > 0 } pk && LocaleStore.Known.Any(l => Placeholders.Contains(loc.Get(l, pk) ?? ""))) Warn("placeholder_text", field);
            // 死锁：子任务把"自己所在的章节"当成前置。章节要等所有子任务成功才算成功，
            // 子任务又要等章节成功才接得到 —— 两边互相等，永远开不了（实机踩过）。
            // 原生前置在战局内根本不重算（没满足的任务服务端压根不下发，任务书里查不到），
            // 所以"A 完成 → B 解锁"要走 visitapi.startAfter。下面一条阶梯扫完 AvailableForStart，
            // 同一条脏数据只出一个码，优先级：死锁 > 写了 startAfter 却没清原生前置 > 兄弟子任务当前置。
            var afters = Afters(vx);
            var owners = chapterOf(id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var sibs = siblingsOf(id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            // 同一条任务挂进两个章节：插件只按其中一章算门控和剧情页归属（QuestFlags 一条任务一个章节），另一章里它永远打不上勾
            if (owners.Count > 1) Warn("sub_two_chapters");
            // 定时联系（插件 Dev_Note #132，迷宫章「等待 Jaeger 找来钥匙卡」）：兄弟子任务当原生前置**且带 availableAfter** 是唯一能定时的写法
            // （SPT 起定时器靠的就是原生前置），不算「一局之内解不开」的那种错；没带定时的兄弟原生前置照旧红
            var timed = Conds(q, "AvailableForStart")
                .Where(c => Str(c, "conditionType") == "Quest" && c["availableAfter"] is JsonValue av && av.TryGetValue<double>(out var sec) && sec > 0)
                .Select(c => Str(c, "target")).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var deadlockSaid = false;   // 原生前置和 startAfter 都指着所在章节时只报一次，别一条脏数据两行同码
            foreach (var t in QuestRefs(Conds(q, "AvailableForStart").Where(c =>
                c["status"] is not JsonArray st || !st.Any(s => s is JsonValue v && v.TryGetValue<int>(out var n) && n is 2 or 3)).ToList()).Distinct(StringComparer.OrdinalIgnoreCase))
                if (owners.Contains(t)) { if (!deadlockSaid) Err("sub_prereq_is_chapter"); deadlockSaid = true; }
                else if (afters.Count > 0) Err("startafter_with_prereq", Cut(t));
                else if (sibs.Contains(t) && !timed.Contains(t)) Err("sub_prereq_is_sub", Cut(t));
            if (afters.Count > 0)
            {
                // startAfter 1.3.4 起可以是一组（任一成功就开），成环要按图搜：顺着每一项往前走，能走回自己就是环；走过的不再走，脏数据也不会死循环
                bool Loops(string from)
                {
                    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    var todo = new Stack<string>([from]);
                    while (todo.TryPop(out var cur))
                    {
                        if (cur.Equals(id, StringComparison.OrdinalIgnoreCase)) return true;
                        if (seen.Add(cur)) foreach (var next in aftersOf(cur)) todo.Push(next);
                    }
                    return false;
                }
                foreach (var a in afters.Distinct(StringComparer.OrdinalIgnoreCase))
                    if (!IsMongoId(a) || a.Equals(id, StringComparison.OrdinalIgnoreCase) || (!ids.Contains(a) && vanillaQuests != null && !vanillaQuests.Contains(a))) Err("startafter_bad", Cut(a));
                    else if (owners.Contains(a)) { if (!deadlockSaid) Err("sub_prereq_is_chapter"); deadlockSaid = true; }
                    else if (Loops(a)) Err("startafter_cycle", Cut(a));
                // 10-01：原来这里报 startafter_dialogonly（「自动接 + 只走对话」二选一）。那条是按「去找 X」按钮写的，按钮退役后
                // dialogOnly 管的是金色电话指引和藏掉任务页的交付按钮，和 startAfter 一起用正是胶水任务的标准写法——规则已删
            }
            if (subIds.Contains(id) && !Bool(vx, "chapter"))
            {
                if (dlgAccept != null && !Bool(vx, "autoStart") && afters.Count == 0 && !dlgAccept.Contains(id)) Warn("sub_no_entry");
                if (dlgComplete != null && !Bool(vx, "autoFinish") && !dlgComplete.Contains(id)) Warn("sub_no_exit");
            }
            var noteIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var n in (q["notes"] as JsonObject) ?? new JsonObject())
            {
                if (n.Value == null) continue;
                var nid = n.Value is JsonValue nv && nv.TryGetValue<string>(out var ns) ? ns : "";
                if (!IsMongoId(nid)) Err("bad_note_id", n.Key);
                else if (!LocaleStore.Known.Any(l => !string.IsNullOrWhiteSpace(loc.Get(l, nid)))) Warn("note_no_text", n.Key);
                noteIds.Add(nid);
            }
            // 目标级日记（1.1 `questNoteId`，目标打勾那一刻解锁；插件 1.3 服务端从条件里捞）：同一套 id / 正文规则，名字标成 cond:<条件id 前 8 位>
            foreach (var c in Conds(q, "AvailableForFinish"))
            {
                var cn = Str(c, "questNoteId"); if (cn.Length == 0) continue;
                if (!IsMongoId(cn)) Err("bad_note_id", "cond:" + Cut(Str(c, "id")));
                else if (!LocaleStore.Known.Any(l => !string.IsNullOrWhiteSpace(loc.Get(l, cn)))) Warn("note_no_text", "cond:" + Cut(Str(c, "id")));
                noteIds.Add(cn);
            }
            // 藏身处设备等级（HideoutArea：原版 Cheer Up、1.1 用了 7 次）：设备号要是这台 SPT 认识的，等级不能超过它的最高级（图书馆只有 1 级）。
            // 目标和接取条件两个桶都查；没有设备表（areas == null）就不查——扫不到 ≠ 不存在
            if (areas != null)
                foreach (var c in Conds(q, "AvailableForStart").Concat(Conds(q, "AvailableForFinish")).Where(x => Str(x, "conditionType") == "HideoutArea"))
                {
                    var a = c["areaType"] is JsonValue tv && tv.TryGetValue<int>(out var t) ? areas.FirstOrDefault(x => x.Type == t) : null;
                    if (a == null) Err("bad_area", Cut(Str(c, "id")), c["areaType"]?.ToJsonString() ?? "");
                    else if (a.Max > 0 && c["value"] is JsonValue vv && vv.TryGetValue<double>(out var lv) && lv > a.Max) Err("area_level_high", a.Zh, a.En, ((int)lv).ToString(), a.Max.ToString());
                }
            // 地图转移（计数器里 TransitionLocation，客户端 0.16 起有、原版任务没用过）：目的地要是这台机器上有的地图短 id 或 any；
            // 没有地图表（transitMaps == null）就不查——扫不到 ≠ 不存在，地图模组加的图这里也扫不到，所以只 warn
            if (transitMaps != null)
                foreach (var c in Conds(q, "AvailableForFinish").SelectMany(Inner).Where(x => Str(x, "conditionType") == "TransitionLocation"))
                    foreach (var t in (c["target"] as JsonArray)?.Select(v => v is JsonValue jv && jv.TryGetValue<string>(out var s) ? s : "") ?? [Str(c, "target")])
                        if (!t.Equals("any", StringComparison.OrdinalIgnoreCase) && !transitMaps.Contains(t, StringComparer.OrdinalIgnoreCase))
                            Warn("bad_transit_map", Cut(Str(c, "id")), t);
            // 日记挂的物品 visitapi.noteLinks{日记id:[{type:item|offer|craft, tpl}]}：键必须是本任务的某条日记，物品必须是 24 位 hex
            foreach (var (nid, arr) in (vx?["noteLinks"] as JsonObject) ?? new JsonObject())
            {
                if (!noteIds.Contains(nid)) Warn("notelink_orphan", Cut(nid));
                if (arr is not JsonArray links) { Err("bad_note_link", Cut(nid), "?"); continue; }
                foreach (var l in links.OfType<JsonObject>())
                {
                    var t = Str(l, "type");
                    if (!IsMongoId(Str(l, "tpl")) || (t.Length > 0 && t is not ("item" or "offer" or "craft"))) Err("bad_note_link", Cut(nid), Str(l, "tpl").Length > 0 ? Cut(Str(l, "tpl")) : t);
                }
            }
            // 完成后开放访问 visitapi.unlockDialogue[商人id]（插件 1.3：1.1 TraderDialogueUnlock 奖励的替身）
            foreach (var u in (vx?["unlockDialogue"] as JsonArray) ?? new JsonArray())
            {
                var tid = u is JsonValue uv && uv.TryGetValue<string>(out var us) ? us : "";
                if (!IsMongoId(tid)) Err("bad_unlock_trader", tid);
                else if (knownTraders.Count > 0 && !knownTraders.Contains(tid)) Warn("unlock_unknown_trader", Cut(tid));
                // 有 .dlg 的商人，「访问」按钮只看它文件头的 tab:（TalkButton.TabPasses）；unlockDialogue 对他只压住金色电话，按钮照旧
                else if (dlgTraders?.Contains(tid) == true) Warn("unlock_dlg_trader", Cut(tid));
            }
            // 章节显示顺序 visitapi.order：有就得是数字（插件按 double 读，别的类型整条当没标）
            if (vx?["order"] is JsonNode on && !(on is JsonValue ov && ov.TryGetValue<double>(out _))) Err("bad_order");
            foreach (var it in (vx?["items"] as JsonArray) ?? new JsonArray())
            {
                // 插件 1.3 认 `craft:<id>` / `offer:<id>` 前缀标类型（G5 配方/商品角标），校验只看冒号后面那段
                var raw = it is JsonValue iv && iv.TryGetValue<string>(out var s) ? s : "";
                var tpl = raw.StartsWith("craft:") || raw.StartsWith("offer:") ? raw[6..] : raw;
                if (!IsMongoId(tpl)) Err("bad_item", it?.ToString() ?? "");
            }
            if (!story && Text(loc, q, "description").Length == 0) Warn("no_desc");
            if (!story && !(visitApiDb && subIds.Contains(id)) && Text(loc, q, "name").Length == 0) Warn("no_name");

            var type = Str(q, "type");
            if (type.Length > 0 && !Types.Contains(type)) Err("bad_type", type);

            var trader = Str(q, "traderId");
            if (!IsMongoId(trader)) Err("bad_trader", trader);
            else if (knownTraders.Count > 0 && !knownTraders.Contains(trader)) Warn("unknown_trader", trader);

            if (!visitApiDb && !story && Conds(q, "Fail").Count > 0 && Text(loc, q, "failMessageText").Length == 0)
                Warn("fail_no_msg");

            // 前置指向的任务：本库里没有 → 原版里有就算数（作者接在原版任务后面是最常见的写法）；
            // 原版也没有才 err；拿不到原版表（没 SPT 数据）只能 warn —— 扫不到 ≠ 不存在
            foreach (var grp in new[] { "AvailableForStart", "AvailableForFinish", "Fail" })
                foreach (var target in QuestRefs(Conds(q, grp)))
                    if (!ids.Contains(target) && vanillaQuests?.Contains(target) != true)
                    { if (vanillaQuests == null) Warn("missing_prereq", target, grp); else Err("missing_prereq", target, grp); }
        }

        // .dlg 里写错的任务 id：游戏里查不到任何任务，而自动门控会顺手把那个选项藏起来 ——
        // 现象是"这个选项莫名其妙不出现"，不看文件根本查不出来。
        foreach (var (file, id) in (dlgBadIds ?? []).Distinct())
            out_.Add(new Issue("err", "", "dlg_bad_qid", [file, id]));

        // 对话里「仅当某任务处于某状态」的选项 / 触发点（10-01）：推演这扇门是不是永远过不了。只认两种确凿的情况——
        // 任务是自动接下的（不会停在「可接取」）；任务一接下目标就已达成（目标全是「前置任务已完成」，直接跳「可提交」，不会停在「进行中」）。
        // 实机踩过：收尾选项只写「进行中」，章节永远收不了口，校验一声不吭
        foreach (var g in dlgGates ?? [])
        {
            if (!byId.TryGetValue(g.QuestId, out var gq)) continue;
            var gvx = gq["visitapi"] as JsonObject; var sa = Afters(gvx);
            var auto = sa.Count > 0 || Bool(gvx, "autoStart");
            var pre = sa.Concat(QuestRefs(Conds(gq, "AvailableForStart"))).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var fin = Conds(gq, "AvailableForFinish");
            var inst = fin.Count > 0 && fin.All(c => Str(c, "conditionType") == "Quest" && pre.Contains(Str(c, "target"))
                && c["status"] is JsonArray st && st.Any(s => s is JsonValue v && v.TryGetValue<int>(out var n) && n == 4));
            if (g.Statuses.Length == 0 || !g.Statuses.All(s => s == 1 && auto || s == 2 && inst)) continue;
            // 两个码各写一句字面量：test-i18n 靠扫 `new Issue(…, "码"` 认活文案，拼出来的码它看不见
            if (g.Statuses.Contains(2) && inst) out_.Add(new Issue("err", g.QuestId, "gate_never_inst", [g.File, g.Node, g.Text]));
            else out_.Add(new Issue("err", g.QuestId, "gate_never_auto", [g.File, g.Node, g.Text]));
        }

        // 读不动的文件：这条必须显出来，否则用户只会看到"我的任务不见了"
        foreach (var (file, why) in quests.Broken) out_.Add(new Issue("err", "", "broken_file", [file, why]));
        // 文件读得动但某条不是对象（`"abc": 5`）：All()/Flatten 都会把它过滤掉，不报的话它就静默消失，
        // 而 SPT 那边反序列化会整份拒收
        foreach (var (file, obj) in quests.Files)
            foreach (var kv in obj)
                if (kv.Value is not JsonObject) out_.Add(new Issue("err", "", "bad_entry", [file, kv.Key]));
        foreach (var (lang, why) in loc.Broken) out_.Add(new Issue("err", "", "broken_locale", [lang, why]));

        // 同一个 id 出现在两个文件里：后加载的会把先加载的挤掉，游戏里只剩一个，非常难查
        foreach (var g in all.GroupBy(x => x.Id, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
            out_.Add(new Issue("err", g.Key, "dup_id", [string.Join(", ", g.Select(x => x.File))]));

        IdentityAndCycles(all, vanillaQuests, out_);
        return out_;
    }

    /// <summary>新建任务 / 章节时落下的占位文案（index.html 的 q_new_name / q_new_desc / q_new_mail / ch_new_name，中英各一份，改那边要同步这里）。</summary>
    static readonly HashSet<string> Placeholders = new(StringComparer.Ordinal)
        { "新任务", "（还没写描述）", "（还没写完成邮件）", "新章节", "New quest", "(no description yet)", "(no completion mail yet)", "New chapter" };

    /// <summary>章节本身的规则（Rework DEV_NOTES #70/#71 的数据模型）：有子任务、有终章（可多个：任一终章成功整章结束，1.3.3）、有图标/横幅、不套章节、开得了头。</summary>
    static void Chapter(string id, JsonObject q, JsonObject vx, List<(string Id, string File, JsonObject Quest)> all, IReadOnlySet<string>? dlgAccept,
                        Action<string, string[]> err, Action<string, string[]> warn)
    {
        var conds = Conds(q, "AvailableForFinish");
        var subs = QuestRefs(conds).ToList();
        if (subs.Count == 0) err("chapter_no_subs", []);
        if (!conds.Any(c => Str(c, "conditionType") == "Quest" && Bool(c, "isFinisher"))) warn("chapter_no_finisher", []);
        // 整章怎么开始：章节自己自动接 / 接在别的任务后面 / 对话（.dlg 或原生对话）接章节或它任一条子任务。一样都没有 = 永远不开始。
        // 子任务自己的 autoStart / startAfter 不算——两样都要章节先开了才起作用（插件 ChapterChain；写进章节 startAfter 的「起点」例外，那算章节自己的开头）
        if (dlgAccept != null && !Bool(vx, "autoStart") && Afters(vx).Count == 0 && !dlgAccept.Contains(id) && !subs.Any(dlgAccept.Contains))
            warn("chapter_no_entry", []);
        if (Str(vx, "icon").Length == 0) warn("chapter_no_icon", []);
        if (Str(q, "image").Length == 0) warn("chapter_no_banner", []);
        foreach (var s in subs)
            if (all.Any(x => x.Id.Equals(s, StringComparison.OrdinalIgnoreCase) && Bool(x.Quest["visitapi"] as JsonObject, "chapter")))
                err("chapter_sub_is_chapter", [Cut(s)]);
    }

    public static bool IsMongoId(string s) =>
        s.Length == 24 && s.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));

    /// <summary>放进文案参数的 id 一律截前 8 位：24 位 hex 会把一行撑爆，8 位已经够认人。</summary>
    static string Cut(string s) => s[..Math.Min(8, s.Length)];

    /// <summary>取布尔开关：缺失、不是 bool 一律当 false。</summary>
    static bool Bool(JsonObject? o, string k) => o?[k] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    /// <summary>visitapi.startAfter：一个任务 id，或一组（插件 1.3.4：任一成功就开，陨落星辰「枪匠对话或踩到坠机」就这么写）。
    /// 不是字符串的项、不是字符串也不是数组的值原样转成文本留着，交给 startafter_bad 点名（插件读不出来，等于没写）。</summary>
    internal static List<string> Afters(JsonObject? vx) => vx?["startAfter"] switch
    {
        null => [],
        JsonArray a => a.Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : n?.ToJsonString() ?? "null").Where(s => s.Length > 0).ToList(),
        JsonValue v when v.TryGetValue<string>(out var s) => s.Length > 0 ? [s] : [],
        var other => [other.ToJsonString()],
    };

    /// <summary>取字符串字段。对象本身为 null、字段缺失、是数字、是对象——一律当空串，校验不该被脏数据搞崩。</summary>
    static string Str(JsonObject? q, string k) =>
        q?[k] is JsonValue v && v.TryGetValue<string>(out var s) ? s : "";

    /// <summary>任务里存的是文案 key，这里解成真文本；哪个语言有就算有（作者可能只先写中文）。</summary>
    static string Text(LocaleStore loc, JsonObject q, string field)
    {
        var key = Str(q, field);
        if (key.Length == 0) return "";
        foreach (var lang in LocaleStore.Known)
        {
            var t = loc.Get(lang, key);
            if (!string.IsNullOrWhiteSpace(t)) return t;
        }
        return "";
    }

    /// <summary>`conditions` 不是对象、桶不是数组（手写坏的 json）一律当空，别让整个校验 500。</summary>
    static List<JsonObject> Conds(JsonObject q, string group) =>
        ((q["conditions"] as JsonObject)?[group] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];

    /// <summary>条件里指向别的任务的那些 target。CounterCreator 会再套一层，得钻进去。</summary>
    static IEnumerable<string> QuestRefs(List<JsonObject> conds)
    {
        foreach (var c in conds)
            foreach (var x in Inner(c))
                if (Str(x, "conditionType") == "Quest" && Str(x, "target").Length > 0)
                    yield return Str(x, "target");
    }

    static IEnumerable<JsonObject> Inner(JsonObject c) =>
        Str(c, "conditionType") == "CounterCreator"
            ? ((c["counter"] as JsonObject)?["conditions"] as JsonArray)?.OfType<JsonObject>() ?? []
            : [c];
}
