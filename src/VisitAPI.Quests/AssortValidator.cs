using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

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
                else if (!PriceOk(barter[id])) Err("as_price_bad", id, tpl);
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

            // items 里的孤儿：parentId 指着一个已经不在这份清单里的 id。
            // 上面那条 as_orphan 只查两张表的键，**从来不查 items** —— 删商品只删了一层子件时
            // 留下的孙辈就卡在这个盲区里：服务端不报错，游戏里那件东西是残的。
            var allIds = AssortStore.Items(a.Scheme).Select(x => AssortStore.Str(x, "_id"))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var it in AssortStore.Items(a.Scheme))
            {
                var pid = AssortStore.Str(it, "parentId");
                if (pid.Length > 0 && pid != "hideout" && !allIds.Contains(pid))
                    Warn("as_orphan_item", AssortStore.Str(it, "_id"), pid);
            }
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

    /// <summary>
    /// 价格条目本身是否站得住：外层是"几种付法（或）"、内层是"要一起给的东西（且）"，
    /// 叶子上必须写清楚**拿什么付**（<c>_tpl</c>：货币，或者以物换物要的那件东西）。
    /// 缺 <c>_tpl</c> 服务端照样启动（MongoId 变成空串），但玩家在货架上点这件东西时
    /// 客户端当场抛"找不到模板"；空的价格表同理，客户端是硬取 <c>[0][0]</c> 的。
    /// </summary>
    static bool PriceOk(JsonNode? n)
    {
        var offers = (n as JsonArray)?.OfType<JsonArray>().ToList() ?? [];
        if (offers.Count == 0 || offers[0].Count == 0) return false;
        return offers.SelectMany(o => o.OfType<JsonObject>())
                     .All(x => AssortStore.Str(x, "_tpl").Length > 0);
    }

    static readonly Regex Hex24 = new("^[0-9a-fA-F]{24}$", RegexOptions.Compiled);

    /// <summary>
    /// **落盘前的最后一道闸**：找出第一个不能当 MongoId 用的 id，没有就返回 null。
    ///
    /// 这一条和上面那些校验不是一类：别的都是"进游戏才发现不对"，这一条是
    /// **服务端连启动都启动不了**。SPT 把 <c>barter_scheme</c> / <c>loyal_level_items</c>
    /// 的键、<c>items</c> 的 <c>_id</c>/<c>_tpl</c>、价格里的 <c>_tpl</c> 全反序列化成
    /// <c>MongoId</c>，只要有一个不是 24 位十六进制，**读文件那一刻就抛**，业务代码一行都跑不到。
    /// 2026-08-22 真出过：编辑器往 SORA 的货架里写了个 <c>"on"</c> 键，服务端启动即停。
    /// 所以它不走 Issue 那条路（Issue 是提示，文件照存），而是让保存**直接失败**。
    ///
    /// 和 <c>as_orphan</c> 不重叠：那条管的是"格式没错、但没人认领"的键，原版自己就带着 15 条，
    /// 所以永远只是 warn。这条只管**格式本身就不合法**的那一小撮。
    /// </summary>
    /// <param name="only">只查这几份文件（相对名）。留空＝全查。
    /// 存盘时只查这一次真要写的那几份 —— 别让一份没动过的旧文件把作者的保存卡死。</param>
    public static (string File, string Id)? FatalId(AssortStore store, ICollection<string>? only = null)
    {
        var pick = only == null ? null : new HashSet<string>(only, StringComparer.OrdinalIgnoreCase);
        foreach (var (name, root) in store.Files)
        {
            if (pick != null && !pick.Contains(name)) continue;
            // **根对象和它的每个对象子节点都查一遍。** 走 store.All() 的话，认不出来的文件形状
            // （比如把单商人写法的文件丢进 CustomAssortSchemes\）会被摊成一堆"伪商人"，
            // 每个都没有 barter_scheme，于是整份文件一条都没查就放行了 —— 闸门必须失败关闭。
            foreach (var o in new[] { root }.Concat(root.Select(kv => kv.Value).OfType<JsonObject>()))
            {
                var bad = BadIdIn(o);
                if (bad != null) return (name, bad);
            }
        }
        return null;
    }

    /// <summary>一份清单里第一个不能当 MongoId 用的 id；缺字段时回**字段名**（人话在界面的中英表里）。</summary>
    static string? BadIdIn(JsonObject scheme)
    {
        foreach (var t in new[] { "barter_scheme", "loyal_level_items" })
            foreach (var kv in scheme[t] as JsonObject ?? [])
                if (!Hex24.IsMatch(kv.Key)) return kv.Key;
        foreach (var it in AssortStore.Items(scheme))
            foreach (var f in new[] { "_id", "_tpl" })
            {
                var v = AssortStore.Str(it, f);
                if (!Hex24.IsMatch(v)) return v.Length == 0 ? f : v;
            }
        // 价格里的 _tpl（货币或以物换物要的那件东西）同样是 MongoId。
        // **空串放过**：MongoId 认空串，而"缺 _tpl"是另一类问题（进游戏点一下才炸），不该卡住保存
        foreach (var kv in scheme["barter_scheme"] as JsonObject ?? [])
            foreach (var or in kv.Value as JsonArray ?? [])
                foreach (var leaf in or as JsonArray ?? [])
                {
                    var v = AssortStore.Str(leaf as JsonObject ?? [], "_tpl");
                    if (v.Length > 0 && !Hex24.IsMatch(v)) return v;
                }
        return null;
    }
}
