using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>
/// 货架校验。这几条**全是实战踩出来的**，共同点是"服务端一个错都不报、进游戏才发现"：
///
/// <list type="number">
/// <item><b>容器只写了壳</b> —— 弹药盒不写里面的弹，玩家买到手是 <c>0/20</c> 的空盒</item>
/// <item><b>三张表对不齐</b> —— 商品在 items 里、价格或忠诚等级没跟上，结果是"看得见买不了"</item>
/// <item><b>子件塞错槽</b> —— slotId 不是模板的槽位名、或 tpl 不在该槽的白名单里，静默失效</item>
/// </list>
///
/// 和别处一样：<b>只回码和参数，人话在界面的中英表里</b>。
/// </summary>
public static class AssortValidator
{
    public static List<Issue> Run(AssortStore store, ItemIndex items)
    {
        var res = new List<Issue>();
        // 拿不到物品表就别装懂：那样每个 tpl 都会被判成"不存在"，全是假警报（bot 那边已经栽过一次）
        if (!items.Ok) res.Add(new Issue("warn", "", "as_no_itemdb", []));

        foreach (var a in store.All())
        {
            var where = a.File + (a.Kind == "wtt" ? "#" + a.TraderKey : "");
            void Err(string code, params string[] x) => res.Add(new Issue("err", where, code, x));
            void Warn(string code, params string[] x) => res.Add(new Issue("warn", where, code, x));

            var barter = a.Scheme["barter_scheme"] as JsonObject ?? [];
            var loyal = a.Scheme["loyal_level_items"] as JsonObject ?? [];
            var roots = AssortStore.Roots(a.Scheme);

            if (a.Kind == "single" && a.TraderKey.Length == 0) Warn("as_no_trader");
            if (roots.Count == 0) { Warn("as_empty"); continue; }

            foreach (var r in roots)
            {
                var id = AssortStore.Str(r, "_id");
                var tpl = AssortStore.Str(r, "_tpl");
                if (barter[id] == null) Err("as_no_price", id, tpl);
                if (loyal[id] == null) Err("as_no_loyalty", id, tpl);
                if (items.Ok) CheckItem(a, r, id, tpl, items, Err, Warn);
            }

            // 价格表 / 等级表里指向了一个货架上没有的 id —— 多半是删商品时漏删。
            // **只报 warn 不报 err**：这种残留 SPT 会直接忽略，不影响功能，
            // 而且**原版自己就带着**（实测 6 个原版商人 2331 件商品里有 15 条这种孤儿）。
            // 一导入原版数据就看见一片红，只会让作者学会无视所有提示。
            var rootIds = roots.Select(x => AssortStore.Str(x, "_id")).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var k in barter.Select(x => x.Key).Concat(loyal.Select(x => x.Key)).Distinct())
                if (!rootIds.Contains(k)) Warn("as_orphan", k);
        }

        foreach (var (file, why) in store.Broken) res.Add(new Issue("err", file, "broken_file", [file, why]));
        return res;
    }

    /// <summary>单件商品：tpl 认不认识、是不是空容器、子件塞得对不对。</summary>
    static void CheckItem(AssortRef a, JsonObject root, string id, string tpl, ItemIndex items,
        Action<string, string[]> err, Action<string, string[]> warn)
    {
        var def = items.Get(tpl);
        if (def == null) { err("as_bad_tpl", [id, tpl]); return; }

        var kids = AssortStore.ChildrenOf(a.Scheme, id);
        // ① 堆叠容器（弹药盒）：不写内容就是空盒
        foreach (var s in def.Stack)
        {
            var inSlot = kids.Where(k => AssortStore.Str(k, "slotId") == s.Name).ToList();
            if (inSlot.Count == 0) { warn("as_empty_container", [id, tpl, s.Name, s.Max.ToString()]); continue; }
            foreach (var k in inSlot)
            {
                var ktpl = AssortStore.Str(k, "_tpl");
                if (s.Filter.Count > 0 && !s.Filter.Contains(ktpl)) err("as_bad_child_tpl", [id, ktpl, s.Name]);
                var n = Count(k);
                if (s.Max > 0 && n > s.Max) err("as_over_capacity", [id, n.ToString(), s.Max.ToString()]);
            }
        }
        // ② 子件的槽位名必须是模板里真有的槽
        var names = def.Stack.Select(x => x.Name).Concat(def.Mods.Select(x => x.Name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var k in kids)
        {
            var slot = AssortStore.Str(k, "slotId");
            if (slot.Length > 0 && !names.Contains(slot)) err("as_bad_child_slot", [id, slot, tpl]);
        }
    }

    static int Count(JsonObject item) =>
        item["upd"]?["StackObjectsCount"] is JsonValue v && v.TryGetValue<int>(out var n) ? n : 1;
}
