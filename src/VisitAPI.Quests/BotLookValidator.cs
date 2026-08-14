using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>
/// bot 外观的校验。和任务那边一样，<b>只回码和参数，人话在界面的中英表里</b>。
///
/// 这几条不是凭空想的，全是"服务端不会报错、进游戏才发现没生效"的那一类 ——
/// 也正是编辑器存在的意义：把踩过的坑变成保存前的拦截。
/// </summary>
public static class BotLookValidator
{
    public static List<Issue> Run(BotLookStore looks, Customization cat, IReadOnlyList<string> botTypes)
    {
        var known = botTypes.ToHashSet(StringComparer.Ordinal);        // 全小写，故意区分大小写
        var slotOf = cat.SlotById();
        var res = new List<Issue>();

        // ⚠️ **没有 SPT 数据时绝不能照常校验。**
        // bot 类型表和原生外观表都来自 SPT_Data，找不到游戏目录时两张表都是空的 ——
        // 照常跑的话每个文件都会被判成"不认识的 bot 类型"、每个原生 id 都被判成"不存在"。
        // 实测过一次：40 个文件报出 **691 条全是假警报**。
        // 消不掉的警告只会把作者训练成无视所有警告，所以这里只说一句"没法校验"就收手。
        var canCheckTypes = known.Count > 0;
        var canCheckIds = cat.HasSpt;
        if (!canCheckTypes || !canCheckIds) res.Add(new Issue("warn", "", "bot_no_sptdata", []));

        foreach (var (file, obj) in looks.Files.OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase))
        {
            var type = BotLookStore.TypeOf(file);
            if (canCheckTypes) CheckName(res, file, type, known);

            var total = 0;
            foreach (var slot in Customization.Slots)
                foreach (var (id, weight) in BotLookStore.Slot(obj, slot))
                {
                    total++;
                    if (canCheckIds)
                    {
                        if (!slotOf.TryGetValue(id, out var real)) res.Add(Err(file, "bot_unknown_id", id, slot));
                        else if (real != slot) res.Add(Err(file, "bot_wrong_slot", id, slot, real));
                    }
                    // 权重不依赖任何外部数据，什么时候都能查
                    if (weight <= 0) res.Add(Err(file, "bot_bad_weight", id, weight.ToString()));
                }
            // 一个条目都没有的文件不会让游戏出错，但它百分之百不是作者想要的结果
            if (total == 0) res.Add(new Issue("warn", file, "bot_empty", [type]));
        }

        foreach (var (file, why) in looks.Broken) res.Add(Err(file, "broken_file", file, why));
        return res;
    }

    /// <summary>
    /// 文件名必须**逐字符**等于某个真实 bot 类型。
    /// 大小写不对单独报一条：那是最容易犯、也最容易改的（<c>bossKilla.json</c> → <c>bosskilla.json</c>）。
    /// </summary>
    static void CheckName(List<Issue> res, string file, string type, HashSet<string> known)
    {
        if (known.Contains(type)) return;
        if (known.Contains(type.ToLowerInvariant())) res.Add(Err(file, "bot_case", type, type.ToLowerInvariant()));
        else res.Add(Err(file, "bot_unknown_type", type));
    }

    static Issue Err(string file, string code, params string[] args) => new("err", file, code, args);
}
