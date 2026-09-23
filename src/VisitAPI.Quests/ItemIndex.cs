using System.Text.Json;

namespace VisitAPI.Quests;

/// <summary>一个槽位。<c>Max</c> 只有弹药盒那种堆叠槽才有意义（其余是 0）。</summary>
public sealed record SlotDef(string Name, bool Required, int Max, HashSet<string> Filter);

/// <summary>
/// 物品模板里我们用得上的那一小撮字段。
/// <c>Stack</c> = StackSlots（弹药盒，**买了必须带货**）；
/// <c>Mods</c> = Slots + Chambers + Cartridges（能挂子件的其余槽位，空着是正常的——原版就卖空弹匣）。
/// <c>W</c>/<c>H</c> = 物品在背包里占几格，货架预览照这个铺。
/// </summary>
public sealed record ItemDef(string Id, string Name, string Parent,
                             List<SlotDef> Stack, List<SlotDef> Mods, int W, int H);

/// <summary>
/// <c>templates\items.json</c> 的瘦身索引。
///
/// 那个文件 **18.7 MB**，整解一次就得几秒，所以只抽我们真用得上的字段并缓存住。
/// 为什么非要它不可：货架校验有一条**只有它答得出来**——
/// <b>弹药盒是容器，assort 里只写盒子、不写里面的弹，玩家买到手就是个空盒</b>，
/// 而服务端从头到尾一个错都不报。要判这条就得知道"这个 tpl 有没有堆叠槽、能装什么、装几发"。
/// </summary>
public sealed class ItemIndex
{
    readonly string _db, _eft;
    Dictionary<string, ItemDef>? _map;
    string? _revision;
    /// <param name="eftRoot">给了就把模组离线注册的物品也认进来（见 <see cref="ModItems"/>）；空串 = 只有原版</param>
    public ItemIndex(string databaseDir, string eftRoot = "") { _db = databaseDir; _eft = eftRoot; }

    public bool Ok => Map().Count > 0;

    public Dictionary<string, ItemDef> Map() => _map ??= Load();

    public void Refresh()
    {
        var revision = ReadOnlyJson.Revision([Path.Combine(_db, "templates", "items.json")]) + ModItems.Revision(_eft);
        if (_revision != revision) { _map = null; _revision = revision; }
    }

    public ItemDef? Get(string tpl) => Map().GetValueOrDefault(tpl);

    /// <summary>是不是弹药盒那种"买了必须带货"的容器。</summary>
    public bool IsStackBox(string tpl) => Get(tpl)?.Stack.Count > 0;

    Dictionary<string, ItemDef> Load()
    {
        var d = new Dictionary<string, ItemDef>(StringComparer.OrdinalIgnoreCase);
        var properties = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        var p = Path.Combine(_db, "templates", "items.json");
        using var doc = ReadOnlyJson.Read(p);
        foreach (var e in doc?.RootElement.ValueKind == JsonValueKind.Object ? doc.RootElement.EnumerateObject().ToArray() : [])
        {
            if (e.Value.ValueKind != JsonValueKind.Object) continue;
            var props = e.Value.TryGetProperty("_props", out var pr) ? pr : default;
            properties[e.Name] = props;
            // ⚠️ 槽位一共**四个数组**，别只读前两个：
            //   Slots      改装件（枪口/握把…）
            //   StackSlots 堆叠容器（弹药盒）—— 只有它属于"买了必须带货"
            //   Chambers   膛内那一发（slotId = patron_in_weapon）
            //   Cartridges 弹匣容量
            // 实测漏掉 Chambers 会把原版普拉波货架里一件上了膛的枪误判成"子件塞错槽"。
            // 占格：Width/Height 是**裸物品**的尺寸，武器还要加上 ExtraSize* ——
            // 那几个是"装了配件之后往外撑出去几格"。只取 Width/Height 的话，
            // 一把带枪管和枪托的步枪会画成 1 格，和游戏里差得远。
            d[e.Name] = Definition(e.Name, Str(e.Value, "_name"), Str(e.Value, "_parent"), props);
        }
        var pending = ModItems.Scan(_eft).Where(m => !d.ContainsKey(m.Id)).ToList();
        while (pending.Count > 0)
        {
            var resolved = pending.Where(m => m.Template != null || d.ContainsKey(m.CloneOf)).ToList();
            if (resolved.Count == 0) break;
            foreach (var m in resolved)
            {
                pending.Remove(m);
                if (d.ContainsKey(m.Id)) continue;
                var props = MergeProps(properties.GetValueOrDefault(m.CloneOf), m.Properties);
                properties[m.Id] = props;
                var parent = m.Parent.Length > 0 ? m.Parent : d.GetValueOrDefault(m.CloneOf)?.Parent ?? "";
                d[m.Id] = Definition(m.Id, m.En.Length > 0 ? m.En : m.Id, parent, props);
            }
        }
        return d;
    }

    static JsonElement MergeProps(JsonElement original, JsonElement? edited)
    {
        var values = original.ValueKind == JsonValueKind.Object ? original.EnumerateObject().ToDictionary(p => p.Name, p => p.Value) : new Dictionary<string, JsonElement>();
        if (edited is { ValueKind: JsonValueKind.Object } props)
            foreach (var prop in props.EnumerateObject()) values[prop.Name] = prop.Value;
        return JsonSerializer.SerializeToElement(values);
    }

    static ItemDef Definition(string id, string name, string parent, JsonElement props) => new(id, name, parent,
        Slots(props, "StackSlots"), [.. Slots(props, "Slots"), .. Slots(props, "Chambers"), .. Slots(props, "Cartridges")],
        Math.Max(1, Int(props, "Width") + Int(props, "ExtraSizeLeft") + Int(props, "ExtraSizeRight")),
        Math.Max(1, Int(props, "Height") + Int(props, "ExtraSizeUp") + Int(props, "ExtraSizeDown")));

    static List<SlotDef> Slots(JsonElement props, string key)
    {
        var list = new List<SlotDef>();
        if (props.ValueKind != JsonValueKind.Object) return list;
        if (!props.TryGetProperty(key, out var arr) || arr.ValueKind != JsonValueKind.Array) return list;
        foreach (var s in arr.EnumerateArray())
        {
            if (s.ValueKind != JsonValueKind.Object) continue;
            list.Add(new SlotDef(Str(s, "_name"), Bool(s, "_required"), Int(s, "_max_count"), Filter(s)));
        }
        return list;
    }

    /// <summary>槽位允许装的 tpl。结构是 <c>_props.filters[0].Filter[]</c>。</summary>
    static HashSet<string> Filter(JsonElement slot)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!slot.TryGetProperty("_props", out var p) || p.ValueKind != JsonValueKind.Object) return set;
        if (!p.TryGetProperty("filters", out var fs) || fs.ValueKind != JsonValueKind.Array) return set;
        foreach (var f in fs.EnumerateArray())
            if (f.ValueKind == JsonValueKind.Object && f.TryGetProperty("Filter", out var arr) &&
                arr.ValueKind == JsonValueKind.Array)
                foreach (var x in arr.EnumerateArray())
                    if (x.ValueKind == JsonValueKind.String) set.Add(x.GetString()!);
        return set;
    }

    static string Str(JsonElement e, string k) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    static bool Bool(JsonElement e, string k) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;
    static int Int(JsonElement e, string k) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : 0;
}
