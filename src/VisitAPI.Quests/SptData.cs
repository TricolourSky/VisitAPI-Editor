using System.Text.Json;

namespace VisitAPI.Quests;

public sealed record NamedId(string Id, string Zh, string En);
public sealed record ItemRow(string Id, string Cat, string Zh, string En, int Price);
public sealed record CatRow(string Id, string Parent, string Zh, string En);

/// <summary>
/// 只读 SPT_Data。作者不该被迫去背 <c>5449016a4bdc2d6f028b456f</c> 这种 id ——
/// 商人、地图、物品的清单全从游戏自带的数据里读，编辑器里能选的，游戏里就一定认。
///
/// 加载一次缓存住：地图那几个 base.json 单个能上几十 MB，反复读会卡。
/// </summary>
public sealed class SptData
{
    readonly string _db;
    public SptData(string databaseDir) => _db = databaseDir;
    public bool Ok => _db.Length > 0 && Directory.Exists(_db);

    List<NamedId>? _traders, _maps;
    List<ItemRow>? _items;
    List<CatRow>? _cats;
    Dictionary<string, string>? _zh, _en;

    /// <summary>全局文案：物品名、地图名都在里面。键形如 <c>"&lt;id&gt; Name"</c>。</summary>
    Dictionary<string, string> Loc(string lang)
    {
        var cached = lang == "ch" ? _zh : _en;
        if (cached != null) return cached;
        var d = new Dictionary<string, string>(StringComparer.Ordinal);
        var p = Path.Combine(_db, "locales", "global", lang + ".json");
        if (File.Exists(p))
        {
            // 用 JsonDocument 而不是 JsonObject：这些文件里有只差大小写的重复键，
            // 往字典里塞会撞车，JsonObject 会直接抛。TryAdd 保留先出现的那个。
            using var doc = JsonDocument.Parse(JsonBytes.Read(p));
            foreach (var e in doc.RootElement.EnumerateObject())
                if (e.Value.ValueKind == JsonValueKind.String) d.TryAdd(e.Name, e.Value.GetString()!);
        }
        if (lang == "ch") _zh = d; else _en = d;
        return d;
    }

    string Name(string id) => Loc("ch").GetValueOrDefault(id + " Name", "");
    string NameEn(string id) => Loc("en").GetValueOrDefault(id + " Name", "");

    public List<NamedId> Traders() => _traders ??= LoadTraders();
    List<NamedId> LoadTraders()
    {
        var dir = Path.Combine(_db, "traders");
        var list = new List<NamedId>();
        if (!Directory.Exists(dir)) return list;
        foreach (var d in Directory.GetDirectories(dir))
        {
            var p = Path.Combine(d, "base.json");
            if (!File.Exists(p)) continue;
            using var doc = JsonDocument.Parse(JsonBytes.Read(p));
            var r = doc.RootElement;
            var id = r.TryGetProperty("_id", out var i) ? i.GetString() ?? "" : Path.GetFileName(d);
            var nick = r.TryGetProperty("nickname", out var n) ? n.GetString() ?? "" : "";
            var zh = Loc("ch").GetValueOrDefault(id + " Nickname", nick);
            var en = Loc("en").GetValueOrDefault(id + " Nickname", nick);
            list.Add(new NamedId(id, zh.Length > 0 ? zh : nick, en.Length > 0 ? en : nick));
        }
        return list.OrderBy(x => x.En, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public List<NamedId> Maps() => _maps ??= LoadMaps();
    List<NamedId> LoadMaps()
    {
        var dir = Path.Combine(_db, "locations");
        var list = new List<NamedId> { new("any", "任意地点", "Any") };
        if (!Directory.Exists(dir)) return list;
        foreach (var d in Directory.GetDirectories(dir).OrderBy(x => x))
        {
            var (id, enabled) = PeekLocation(Path.Combine(d, "base.json"));
            if (id.Length == 0) continue;
            var zh = Name(id);
            if (zh.Length == 0) continue;                    // 没有本地化名字的多是开发用图，别摆给作者看
            // 白天/夜晚工厂、两张中心区共用同一个名字，把目录名括进去才分得开
            var (zhTag, enTag) = Suffix(Path.GetFileName(d));
            if (!enabled && zhTag.Length == 0) continue;      // 关掉的图也别列，除非是夜工厂这种确实有人用的
            list.Add(new NamedId(id, zh + zhTag, NameEn(id) + enTag));
        }
        return list;
    }

    /// <summary>后缀也得分语言 —— 英文名后面挂个「（白天）」是穿帮的。</summary>
    static (string Zh, string En) Suffix(string dirName) => dirName switch
    {
        "factory4_day" => ("（白天）", " (day)"),
        "factory4_night" => ("（夜间）", " (night)"),
        "sandbox_high" => ("（高级）", " (high)"),
        _ => ("", ""),
    };

    /// <summary>整读的上限，纯粹防将来 SPT 把 base.json 撑大。实测目前最大 322KB。</summary>
    const int MaxPeek = 8 * 1024 * 1024;

    /// <summary>
    /// 从地图的 base.json 里挖 _Id 和 Enabled。
    ///
    /// **别只读文件开头。** 第一版读前 256KB，结果塔科夫街区的 _Id 在第 307853 字节，
    /// 整张图就从地图列表里静默消失了 —— 界面上不报错，只是"少了一张图"，这种最难查。
    /// </summary>
    static (string Id, bool Enabled) PeekLocation(string path)
    {
        if (!File.Exists(path)) return ("", false);
        using var fs = File.OpenRead(path);
        var take = (int)Math.Min(fs.Length, MaxPeek);
        var buf = new byte[take];
        var n = fs.ReadAtLeast(buf, take, throwOnEndOfStream: false);
        var text = System.Text.Encoding.UTF8.GetString(buf, 0, n);
        var id = System.Text.RegularExpressions.Regex.Match(text, "\"_Id\"\\s*:\\s*\"([^\"]+)\"");
        var en = System.Text.RegularExpressions.Regex.Match(text, "\"Enabled\"\\s*:\\s*(true|false)");
        return (id.Success ? id.Groups[1].Value : "", en.Success && en.Groups[1].Value == "true");
    }

    public (List<CatRow> Cats, List<ItemRow> Items) Handbook()
    {
        if (_cats != null && _items != null) return (_cats, _items);
        var cats = new List<CatRow>(); var items = new List<ItemRow>();
        var p = Path.Combine(_db, "templates", "handbook.json");
        if (File.Exists(p))
        {
            using var doc = JsonDocument.Parse(JsonBytes.Read(p));
            var r = doc.RootElement;
            if (r.TryGetProperty("Categories", out var cs))
                foreach (var c in cs.EnumerateArray())
                {
                    var id = Prop(c, "Id");
                    // 分类名的键就是分类 id 本身，不带 " Name" 后缀
                    cats.Add(new CatRow(id, Prop(c, "ParentId"),
                        Loc("ch").GetValueOrDefault(id, ""), Loc("en").GetValueOrDefault(id, "")));
                }
            if (r.TryGetProperty("Items", out var its))
                foreach (var it in its.EnumerateArray())
                {
                    var id = Prop(it, "Id");
                    items.Add(new ItemRow(id, Prop(it, "ParentId"), Name(id), NameEn(id),
                        it.TryGetProperty("Price", out var pr) && pr.TryGetInt32(out var v) ? v : 0));
                }
        }
        _cats = cats; _items = items;
        return (cats, items);
    }

    static string Prop(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
