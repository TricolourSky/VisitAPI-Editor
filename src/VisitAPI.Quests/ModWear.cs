using System.Text.Json;

namespace VisitAPI.Quests;

/// <summary>
/// 作者自己做的一件「可穿的东西」。
///
/// <see cref="Parts"/> 是它会填 bot appearance 的哪几个槽：
///   上装 → <c>{body, hands}</c>（**同一条记录里的两个 id**）｜下装 → <c>{feet}</c>｜头 → <c>{head}</c>
/// </summary>
public sealed record WearRow(string Key, string Kind, string Zh, string En,
                             Dictionary<string, string> Parts);

/// <summary>
/// 扫这个模组自己注册的可穿戴内容，**保留 WTT 的分组**。
///
/// 形状是对着 BinaryDimensionStore 的真数据（clothing.json 34 条）确认的，不是照文档抄的：
///   <c>CustomClothing\*.json</c> 是**数组**，每条带 <c>type</c>：
///     <c>type=top</c>    17 条 → <c>topId</c> ＋ <c>handsId</c>（17/17 都有 handsId，一条不缺）
///     <c>type=bottom</c> 17 条 → <c>bottomId</c>
///   <c>CustomHeads\*.json</c> 和 <c>CustomVoices\*.json</c> 是**字典**：id → <c>{ locales: {en,ch}, … }</c>
///   （语音的槽和别的部位同形，也是 <c>id → 权重</c>，所以替换/恢复那套机制原样能用）
///
/// **"上装和手出自同一条记录"这件事必须留住** —— <see cref="ModLooks"/> 把它们拍平成一件一件，
/// 那样界面就没法告诉作者「换了上装不换手，游戏里那台 NPC 会露出中空的手臂」。
/// </summary>
public static class ModWear
{
    public static List<WearRow> Scan(string modDbDir)
    {
        var list = new List<WearRow>();
        if (modDbDir.Length == 0) return list;
        Clothing(Path.Combine(modDbDir, "CustomClothing"), list);
        // 头和语音的配置文件形状一模一样（都是 id → {locales:{en,ch}, …} 的字典），
        // 差别只在放哪个槽，所以共用一个读法
        Simple(Path.Combine(modDbDir, "CustomHeads"), "head", list);
        Simple(Path.Combine(modDbDir, "CustomVoices"), "voice", list);
        return list;
    }

    /// <summary>这个模组注册过的全部外观 id。界面拿它判断「这个部位现在是不是自制的」。</summary>
    public static HashSet<string> AllIds(IEnumerable<WearRow> rows)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows) foreach (var id in r.Parts.Values) set.Add(id);
        return set;
    }

    static void Clothing(string dir, List<WearRow> list)
    {
        foreach (var root in Roots(dir))
        {
            if (root.ValueKind != JsonValueKind.Array) continue;
            foreach (var e in root.EnumerateArray())
            {
                if (e.ValueKind != JsonValueKind.Object) continue;
                var parts = new Dictionary<string, string>(StringComparer.Ordinal);
                Put(parts, "body", Str(e, "topId"));
                Put(parts, "hands", Str(e, "handsId"));
                Put(parts, "feet", Str(e, "bottomId"));
                if (parts.Count == 0) continue;              // 一个 id 都没有的条目，跳过
                var (zh, en) = Loc(e, obj: true);
                // key 用 suiteId：同一条记录的 top/hands 共用一个 key，界面才认得出"这俩是一套"。
                // 万一没有 suiteId（别的模组不一定填），退回第一个部位 id，总归是唯一的。
                var key = Str(e, "suiteId");
                if (key.Length == 0) key = parts.Values.First();
                list.Add(new WearRow(key, Str(e, "type") == "bottom" ? "bottom" : "top", zh, en, parts));
            }
        }
    }

    /// <summary>头 / 语音：文件是**字典** <c>id → {locales:{en,ch}, …}</c>，一条只填一个槽。</summary>
    static void Simple(string dir, string slot, List<WearRow> list)
    {
        foreach (var root in Roots(dir))
        {
            if (root.ValueKind != JsonValueKind.Object) continue;
            foreach (var p in root.EnumerateObject())
            {
                if (p.Value.ValueKind != JsonValueKind.Object) continue;
                var (zh, en) = Loc(p.Value, obj: false);
                var fb = Str(p.Value, "name");               // 没写 locales 时拿 name 兜底
                list.Add(new WearRow(p.Name, slot,
                    zh.Length > 0 ? zh : fb.Length > 0 ? fb : p.Name,
                    en.Length > 0 ? en : fb.Length > 0 ? fb : p.Name,
                    new Dictionary<string, string>(StringComparer.Ordinal) { [slot] = p.Name }));
            }
        }
    }

    static void Put(Dictionary<string, string> d, string slot, string id)
    { if (id.Length > 0) d[slot] = id; }

    /// <param name="obj">true = 服装那种 <c>{"ch":{"name":…}}</c>；false = 头那种 <c>{"ch":"…"}</c></param>
    static (string Zh, string En) Loc(JsonElement e, bool obj)
    {
        if (!e.TryGetProperty("locales", out var l) || l.ValueKind != JsonValueKind.Object) return ("", "");
        return (Pick(l, "ch", obj), Pick(l, "en", obj));
    }

    static string Pick(JsonElement locales, string lang, bool obj)
    {
        if (!locales.TryGetProperty(lang, out var v)) return "";
        if (!obj) return v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        return v.ValueKind == JsonValueKind.Object ? Str(v, "name") : "";
    }

    /// <summary>目录里每个 json 的根元素。坏文件跳过 —— 一个读不动不该让整个模块打不开。</summary>
    static IEnumerable<JsonElement> Roots(string dir)
    {
        if (!Directory.Exists(dir)) yield break;
        foreach (var f in Directory.GetFiles(dir, "*.json").OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            JsonDocument? doc = null;
            try { doc = JsonDocument.Parse(JsonBytes.Read(f)); } catch { }
            if (doc == null) continue;
            using (doc) yield return doc.RootElement.Clone();
        }
    }

    static string Str(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
