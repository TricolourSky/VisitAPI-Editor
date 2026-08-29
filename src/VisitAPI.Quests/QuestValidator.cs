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
    public static List<Issue> Run(QuestStore quests, LocaleStore loc, IReadOnlySet<string> knownTraders,
                                  IReadOnlySet<string>? dlgAccept = null, IReadOnlySet<string>? dlgComplete = null,
                                  IEnumerable<(string File, string Id)>? dlgBadIds = null)
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

        foreach (var (id, file, q) in all)
        {
            void Err(string code, params string[] a) => out_.Add(new Issue("err", id, code, a));
            void Warn(string code, params string[] a) => out_.Add(new Issue("warn", id, code, a));

            if (!IsMongoId(id)) Err("bad_id", id);
            if (Text(loc, q, "successMessageText").Length == 0) Err("no_success_msg");
            if (Conds(q, "AvailableForFinish").Count == 0) Err("no_objectives");
            if (q["visitapi"]?["anyOf"]?.GetValue<bool>() == true && Conds(q, "AvailableForFinish").Count < 2) Warn("anyof_one");

            // 章节系统（Rework DEV_NOTES #70/#71）：章节的子任务就是它目标里的「完成任务」；日记 id 必须是 24 位 hex 且要有正文
            var vx = q["visitapi"] as JsonObject;
            if (Bool(vx, "chapter")) Chapter(q, vx!, all, Err, Warn);
            // 剧情任务不进支线/商人列表（插件 StoryList），子任务的接/交只剩自动开关和 .dlg 两条路——两条都没有就是死任务
            // 剧情任务的横幅由 VisitAPI 出，原生那条必须闭嘴，否则接/交时双响（Rework DEV_NOTES #64/#71）
            if ((Bool(vx, "chapter") || subIds.Contains(id)) && Bool(q, "canShowNotificationsInGame"))
                Warn("story_native_notify");
            // 死锁：子任务把"自己所在的章节"当成前置。章节要等所有子任务成功才算成功，
            // 子任务又要等章节成功才接得到 —— 两边互相等，永远开不了（实机踩过）。
            foreach (var owner in chapterOf(id))
                if (QuestRefs(Conds(q, "AvailableForStart")).Any(t => t.Equals(owner, StringComparison.OrdinalIgnoreCase)))
                    Err("sub_prereq_is_chapter");
            if (subIds.Contains(id) && !Bool(vx, "chapter"))
            {
                if (dlgAccept != null && !Bool(vx, "autoStart") && !dlgAccept.Contains(id)) Warn("sub_no_entry");
                if (dlgComplete != null && !Bool(vx, "autoFinish") && !dlgComplete.Contains(id)) Warn("sub_no_exit");
            }
            foreach (var n in (q["notes"] as JsonObject) ?? new JsonObject())
            {
                var nid = n.Value is JsonValue nv && nv.TryGetValue<string>(out var ns) ? ns : "";
                if (!IsMongoId(nid)) Err("bad_note_id", n.Key);
                else if (!LocaleStore.Known.Any(l => !string.IsNullOrWhiteSpace(loc.Get(l, nid)))) Warn("note_no_text", n.Key);
            }
            foreach (var it in (vx?["items"] as JsonArray) ?? new JsonArray())
                if (!IsMongoId(it is JsonValue iv && iv.TryGetValue<string>(out var s) ? s : "")) Err("bad_item", it?.ToString() ?? "");
            if (Text(loc, q, "description").Length == 0) Warn("no_desc");
            if (Text(loc, q, "name").Length == 0) Warn("no_name");

            var type = Str(q, "type");
            if (type.Length > 0 && !Types.Contains(type)) Warn("bad_type", type);

            var trader = Str(q, "traderId");
            if (!IsMongoId(trader)) Err("bad_trader", trader);
            else if (knownTraders.Count > 0 && !knownTraders.Contains(trader)) Warn("unknown_trader", trader);

            if (Conds(q, "Fail").Count > 0 && Text(loc, q, "failMessageText").Length == 0)
                Warn("fail_no_msg");

            foreach (var grp in new[] { "AvailableForStart", "AvailableForFinish", "Fail" })
                foreach (var target in QuestRefs(Conds(q, grp)))
                    if (!ids.Contains(target)) Err("missing_prereq", target, grp);
        }

        // .dlg 里写错的任务 id：游戏里查不到任何任务，而自动门控会顺手把那个选项藏起来 ——
        // 现象是"这个选项莫名其妙不出现"，不看文件根本查不出来。
        foreach (var (file, id) in (dlgBadIds ?? []).Distinct())
            out_.Add(new Issue("err", "", "dlg_bad_qid", [file, id]));

        // 读不动的文件：这条必须显出来，否则用户只会看到"我的任务不见了"
        foreach (var (file, why) in quests.Broken) out_.Add(new Issue("err", "", "broken_file", [file, why]));
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
                err("chapter_sub_is_chapter", [s[..Math.Min(8, s.Length)]]);
    }

    public static bool IsMongoId(string s) =>
        s.Length == 24 && s.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));

    /// <summary>取布尔开关：缺失、不是 bool 一律当 false。</summary>
    static bool Bool(JsonObject? o, string k) => o?[k] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    /// <summary>取字符串字段。字段缺失、是数字、是对象——一律当空串，校验不该被脏数据搞崩。</summary>
    static string Str(JsonObject q, string k) =>
        q[k] is JsonValue v && v.TryGetValue<string>(out var s) ? s : "";

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

    static List<JsonObject> Conds(JsonObject q, string group) =>
        (q["conditions"]?[group] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];

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
            ? (c["counter"]?["conditions"] as JsonArray)?.OfType<JsonObject>() ?? []
            : [c];
}
