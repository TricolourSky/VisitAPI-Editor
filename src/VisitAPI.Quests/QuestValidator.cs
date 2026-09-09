using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>一条校验结果。<b>只给码和参数，不给人话</b> —— 人话在界面的中英表里，这样才翻得动。</summary>
public sealed record Issue(string Level, string QuestId, string Code, string[] Args);

/// <summary>
/// 校验规则住在服务端，**不在前端重写一遍**。
/// 上一版原型是 JS 里写的，真代码再抄一份就又是"两个 writer"那种同步债 ——
/// .dlg 的回写已经因为这个丢过一次数据，不再犯。
/// </summary>
public static class QuestValidator
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
                                  IEnumerable<(string File, string Id)>? dlgBadIds = null, IReadOnlySet<string>? vanillaQuests = null)
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
        // 顺着 startAfter 往前走一步。成环检测唯一的读点。
        string afterOf(string qid) => byId.TryGetValue(qid, out var x) ? Str(x["visitapi"] as JsonObject, "startAfter") : "";
        // 同一章里的兄弟子任务（被多章引用就都算）
        IEnumerable<string> siblingsOf(string subId) => chapters
            .Where(c => QuestRefs(Conds(c.Quest, "AvailableForFinish")).Contains(subId, StringComparer.OrdinalIgnoreCase))
            .SelectMany(c => QuestRefs(Conds(c.Quest, "AvailableForFinish")))
            .Where(t => !t.Equals(subId, StringComparison.OrdinalIgnoreCase));

        foreach (var (id, file, q) in all)
        {
            void Err(string code, params string[] a) => out_.Add(new Issue("err", id, code, a));
            void Warn(string code, params string[] a) => out_.Add(new Issue("warn", id, code, a));

            if (!IsMongoId(id)) Err("bad_id", id);
            // isStoryQuest 是 1.1 的字段（插件 1.3 认）：1.1 的剧情任务 successMessageText 本来就是空串（服务端对「没正文且没物品」的邮件不寄），
            // 名字为空时服务端拿章节名顶上。所以这两条对剧情任务降级：文案空只提示、没名字不报
            var story = Bool(q, "isStoryQuest");
            if (Text(loc, q, "successMessageText").Length == 0) { if (story) Warn("no_success_msg"); else Err("no_success_msg"); }
            if (Conds(q, "AvailableForFinish").Count == 0) Err("no_objectives");
            var vx = q["visitapi"] as JsonObject;   // 一律 as JsonObject：`"visitapi": true` 这种脏数据不能让整页 500
            if (Bool(vx, "anyOf") && Conds(q, "AvailableForFinish").Count < 2) Warn("anyof_one");
            // 1.1 的条件表多一个 AutoStart 桶（EQuestStatus 新值），0.16 客户端把它当字典键反序列化直接抛 → 登录无限转圈（插件 #129）
            if ((q["conditions"] as JsonObject)?.ContainsKey("AutoStart") == true) Err("cond_autostart_bucket");

            // 章节系统（Rework DEV_NOTES #70/#71）：章节的子任务就是它目标里的「完成任务」；日记 id 必须是 24 位 hex 且要有正文
            if (Bool(vx, "chapter")) Chapter(q, vx!, all, Err, Warn);
            // 剧情任务不进支线/商人列表（插件 StoryList），子任务的接/交只剩自动开关和 .dlg 两条路——两条都没有就是死任务
            // 剧情任务的横幅由 VisitAPI 出，原生那条必须闭嘴，否则接/交时双响（Rework DEV_NOTES #64/#71）
            if ((Bool(vx, "chapter") || subIds.Contains(id) || story) && Bool(q, "canShowNotificationsInGame"))
                Warn("story_native_notify");
            // 死锁：子任务把"自己所在的章节"当成前置。章节要等所有子任务成功才算成功，
            // 子任务又要等章节成功才接得到 —— 两边互相等，永远开不了（实机踩过）。
            // 原生前置在战局内根本不重算（没满足的任务服务端压根不下发，任务书里查不到），
            // 所以"A 完成 → B 解锁"要走 visitapi.startAfter。下面一条阶梯扫完 AvailableForStart，
            // 同一条脏数据只出一个码，优先级：死锁 > 写了 startAfter 却没清原生前置 > 兄弟子任务当前置。
            var startAfter = Str(vx, "startAfter");
            var owners = chapterOf(id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var sibs = siblingsOf(id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var deadlockSaid = false;   // 原生前置和 startAfter 都指着所在章节时只报一次，别一条脏数据两行同码
            foreach (var t in QuestRefs(Conds(q, "AvailableForStart")).Distinct(StringComparer.OrdinalIgnoreCase))
                if (owners.Contains(t)) { if (!deadlockSaid) Err("sub_prereq_is_chapter"); deadlockSaid = true; }
                else if (startAfter.Length > 0) Err("startafter_with_prereq", Cut(t));
                else if (sibs.Contains(t)) Err("sub_prereq_is_sub", Cut(t));
            if (startAfter.Length > 0)
            {
                // startAfter 是"每条任务最多一个后继"的函数图，顺着单链走就能判环；
                // 步数上限拿任务总数兜住，脏数据也不会在这里死循环。
                bool Loops(string from)
                {
                    var cur = from;
                    for (var i = 0; cur.Length > 0 && i <= byId.Count; i++)
                    {
                        if (cur.Equals(id, StringComparison.OrdinalIgnoreCase)) return true;
                        cur = afterOf(cur);
                    }
                    return false;
                }
                if (!ids.Contains(startAfter) || startAfter.Equals(id, StringComparison.OrdinalIgnoreCase)) Err("startafter_bad", Cut(startAfter));
                else if (owners.Contains(startAfter)) { if (!deadlockSaid) Err("sub_prereq_is_chapter"); deadlockSaid = true; }
                else if (Loops(startAfter)) Err("startafter_cycle", Cut(startAfter));
                else if (!sibs.Contains(startAfter)) Warn("startafter_outside", Cut(startAfter));
                if (Bool(vx, "dialogOnly")) Warn("startafter_dialogonly");
            }
            if (subIds.Contains(id) && !Bool(vx, "chapter"))
            {
                if (dlgAccept != null && !Bool(vx, "autoStart") && startAfter.Length == 0 && !dlgAccept.Contains(id)) Warn("sub_no_entry");
                if (dlgComplete != null && !Bool(vx, "autoFinish") && !dlgComplete.Contains(id)) Warn("sub_no_exit");
            }
            var noteIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var n in (q["notes"] as JsonObject) ?? new JsonObject())
            {
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
            if (Text(loc, q, "description").Length == 0) Warn("no_desc");
            if (!story && Text(loc, q, "name").Length == 0) Warn("no_name");

            var type = Str(q, "type");
            if (type.Length > 0 && !Types.Contains(type)) Warn("bad_type", type);

            var trader = Str(q, "traderId");
            if (!IsMongoId(trader)) Err("bad_trader", trader);
            else if (knownTraders.Count > 0 && !knownTraders.Contains(trader)) Warn("unknown_trader", trader);

            if (Conds(q, "Fail").Count > 0 && Text(loc, q, "failMessageText").Length == 0)
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

        return out_;
    }

    /// <summary>章节本身的规则（Rework DEV_NOTES #70/#71 的数据模型）：有子任务、隐秘、末条 isFinisher、有图标/横幅、不套章节。</summary>
    static void Chapter(JsonObject q, JsonObject vx, List<(string Id, string File, JsonObject Quest)> all,
                        Action<string, string[]> err, Action<string, string[]> warn)
    {
        var conds = Conds(q, "AvailableForFinish");
        var subs = QuestRefs(conds).ToList();
        if (subs.Count == 0) err("chapter_no_subs", []);
        if (!Bool(q, "secretQuest")) warn("chapter_not_secret", []);
        var last = conds.LastOrDefault(c => Str(c, "conditionType") == "Quest");
        if (last != null && !Bool(last, "isFinisher")) warn("chapter_no_finisher", []);
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
