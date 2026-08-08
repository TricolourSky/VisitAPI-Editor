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

    public static List<Issue> Run(QuestStore quests, LocaleStore loc, IReadOnlySet<string> knownTraders)
    {
        var all = quests.All().ToList();
        var ids = all.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var out_ = new List<Issue>();

        foreach (var (id, file, q) in all)
        {
            void Err(string code, params string[] a) => out_.Add(new Issue("err", id, code, a));
            void Warn(string code, params string[] a) => out_.Add(new Issue("warn", id, code, a));

            if (!IsMongoId(id)) Err("bad_id", id);
            if (Text(loc, q, "successMessageText").Length == 0) Err("no_success_msg");
            if (Conds(q, "AvailableForFinish").Count == 0) Err("no_objectives");
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

        // 读不动的文件：这条必须显出来，否则用户只会看到"我的任务不见了"
        foreach (var (file, why) in quests.Broken) out_.Add(new Issue("err", "", "broken_file", [file, why]));
        foreach (var (lang, why) in loc.Broken) out_.Add(new Issue("err", "", "broken_locale", [lang, why]));

        // 同一个 id 出现在两个文件里：后加载的会把先加载的挤掉，游戏里只剩一个，非常难查
        foreach (var g in all.GroupBy(x => x.Id, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
            out_.Add(new Issue("err", g.Key, "dup_id", [string.Join(", ", g.Select(x => x.File))]));

        return out_;
    }

    public static bool IsMongoId(string s) =>
        s.Length == 24 && s.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));

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
