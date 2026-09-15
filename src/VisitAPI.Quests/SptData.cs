using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

public sealed record NamedId(string Id, string Zh, string En);
/// <summary>藏身处设备：<c>Type</c> 就是任务条件 HideoutArea 的 areaType 号，<c>Max</c> 是它的最高等级（0 = 不知道，不查）。</summary>
public sealed record AreaRow(int Type, string Zh, string En, int Max);
/// <summary>一张图的撤离点：<c>Map</c> 是短 Id（任务条件 Location.target 填的，如 bigmap / Interchange），<c>Id</c> 是 _Id（和 Maps() 对得上），
/// <c>Exits</c> 的 Name 就是 ExitName.exitName 填的值，中英名走全局文案（键就是撤离点名，没有就照抄）。</summary>
public sealed record ExitRow(string Name, string Zh, string En);
public sealed record MapExits(string Map, string Id, List<ExitRow> Exits);
public sealed record ItemRow(string Id, string Cat, string Zh, string En, int Price);
/// <param name="Icon">
/// 分类图标，形如 <c>/files/handbook/icon_ammo_boxes.png</c>，对应
/// <c>SPT_Data\images\handbook\</c> 下的真文件（87 个分类全覆盖）。
/// **货架预览里画的就是它** —— SPT 没有单件物品的图标，只有分类这一级有。
/// </param>
public sealed record CatRow(string Id, string Parent, string Zh, string En, string Icon);

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
    List<AreaRow>? _areas;
    List<MapExits>? _exits;
    List<ItemRow>? _items;
    List<CatRow>? _cats;
    List<string>? _botTypes;
    Dictionary<string, string>? _zh, _en;
    HashSet<string>? _questIds;

    /// <summary>原版任务的 id（<c>templates\quests.json</c> 的顶层键，只读键不物化整棵树）。
    /// 校验「前置指向的任务不存在」要拿它兜底：作者的任务接在原版任务后面是最常见的写法，原来一律报 err（2026-09-08 审查）。</summary>
    public IReadOnlySet<string> QuestIds() => _questIds ??= LoadQuestIds();
    HashSet<string> LoadQuestIds()
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var p = Path.Combine(_db, "templates", "quests.json");
        if (!File.Exists(p)) return set;
        try
        {
            using var doc = JsonDocument.Parse(JsonBytes.Read(p));
            foreach (var e in doc.RootElement.EnumerateObject()) set.Add(e.Name);
        }
        catch { }
        return set;
    }

    /// <summary>
    /// SPT 认识的 bot 类型 ＝ <c>bots\types</c> 下的文件名，**全小写**。
    /// WTT 拿配置的文件名直接查这张表，名字对不上只会 log 一句然后跳过，
    /// 所以编辑器必须能照着它拦下拼错的名字。
    /// </summary>
    public List<string> BotTypes() => _botTypes ??= LoadBotTypes();
    List<string> LoadBotTypes()
    {
        var dir = Path.Combine(_db, "bots", "types");
        if (!Directory.Exists(dir)) return [];
        return Directory.GetFiles(dir, "*.json")
            .Select(f => Path.GetFileNameWithoutExtension(f).ToLowerInvariant())
            .OrderBy(x => x, StringComparer.Ordinal).ToList();
    }

    Dictionary<string, JsonNode?>? _appear;

    /// <summary>
    /// 某个 bot 类型的**原版** appearance（默认服装池）。
    ///
    /// 「恢复默认」就是把这份原样写回去 —— <b>编辑器不用自己另存一份原池</b>，
    /// SPT 的 <c>bots\types\&lt;类型&gt;.json</c> 本来就是正本。
    /// 实测：<c>assault.json</c> 0.27MB，里面 <c>appearance</c> 是 body 13 / feet 11 / hands 10 /
    /// head 5 / voice 6，和模组 <c>CustomBotLoadouts</c> 里那份**逐项一致**。
    ///
    /// 57 个类型全读一遍要十几 MB，所以**用到哪个读哪个**并缓存；
    /// 吐出去的是副本，免得调用方改坏缓存里那份。
    /// </summary>
    public JsonNode? BotAppearance(string type)
    {
        _appear ??= new Dictionary<string, JsonNode?>(StringComparer.OrdinalIgnoreCase);
        if (!_appear.TryGetValue(type, out var node)) _appear[type] = node = ReadAppearance(type);
        return node?.DeepClone();
    }

    JsonNode? ReadAppearance(string type)
    {
        // 类型名是拿来拼文件名的，走 SafeName 牢笼（含 C:x 这种盘符相对路径）
        if (!SafeName.Ok(type)) return null;
        var p = Path.Combine(_db, "bots", "types", type + ".json");
        if (!File.Exists(p)) return null;
        // 先转字符串再 Parse：JsonBytes.Read 已经去过 BOM，和 BotLookStore 走同一条路子
        try { return JsonNode.Parse(System.Text.Encoding.UTF8.GetString(JsonBytes.Read(p)))?["appearance"]; }
        catch { return null; }
    }

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
            // 坏文件当空表：一份写坏的 global\ch.json 不该让 /api/quests 整个 500（2026-09-08 审查）
            try
            {
                using var doc = JsonDocument.Parse(JsonBytes.Read(p));
                foreach (var e in doc.RootElement.EnumerateObject())
                    if (e.Value.ValueKind == JsonValueKind.String) d.TryAdd(e.Name, e.Value.GetString()!);
            }
            catch { }
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
            JsonDocument doc;
            try { doc = JsonDocument.Parse(JsonBytes.Read(p)); } catch { continue; }   // 一个商人的 base.json 坏了，跳过它别拖垮全表
            using var _ = doc;
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

    /// <summary>藏身处设备表。名字以全局文案 <c>hideout_area_&lt;n&gt;_name</c> 为准（圣诞树这种季节设备 areas.json 里没有、文案里有），
    /// 最高等级取 <c>hideout\areas.json</c> 的 stages 键。任务条件 HideoutArea 的 areaType 填的就是这个号（原版 Cheer Up：21；1.1 用了 7 次）。</summary>
    public List<AreaRow> Areas() => _areas ??= LoadAreas();
    List<AreaRow> LoadAreas()
    {
        var max = new Dictionary<int, int>();
        var p = Path.Combine(_db, "hideout", "areas.json");
        if (File.Exists(p))
            try
            {
                using var doc = JsonDocument.Parse(JsonBytes.Read(p));
                foreach (var a in doc.RootElement.EnumerateArray())
                    if (a.TryGetProperty("type", out var t) && t.TryGetInt32(out var type) && a.TryGetProperty("stages", out var st) && st.ValueKind == JsonValueKind.Object)
                        max[type] = st.EnumerateObject().Select(s => int.TryParse(s.Name, out var n) ? n : 0).DefaultIfEmpty(0).Max();
            }
            catch { }   // 坏文件只丢等级上限，名字表照给
        var list = new List<AreaRow>();
        foreach (var (k, en) in Loc("en"))
            if (k.StartsWith("hideout_area_", StringComparison.Ordinal) && k.EndsWith("_name", StringComparison.Ordinal) && int.TryParse(k[13..^5], out var type))
                list.Add(new AreaRow(type, Loc("ch").GetValueOrDefault(k, en), en, max.GetValueOrDefault(type)));
        return list.OrderBy(x => x.Type).ToList();
    }

    /// <summary>各图撤离点（「幸存撤离」目标限定地图 / 指定撤离点用）。只列 Maps() 摆出来的那些图；base.json 整份解析一次缓存住。</summary>
    public List<MapExits> Exits() => _exits ??= LoadExits();
    List<MapExits> LoadExits()
    {
        var list = new List<MapExits>();
        var dir = Path.Combine(_db, "locations");
        if (!Directory.Exists(dir)) return list;
        var shown = Maps().Select(m => m.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var d in Directory.GetDirectories(dir).OrderBy(x => x))
        {
            var p = Path.Combine(d, "base.json");
            if (!File.Exists(p) || new FileInfo(p).Length > MaxPeek) continue;
            try
            {
                using var doc = JsonDocument.Parse(JsonBytes.Read(p));
                var r = doc.RootElement;
                var id = r.TryGetProperty("_Id", out var mi) ? mi.GetString() ?? "" : "";
                if (!shown.Contains(id) || !r.TryGetProperty("Id", out var si) || !r.TryGetProperty("exits", out var ex) || ex.ValueKind != JsonValueKind.Array) continue;
                var rows = ex.EnumerateArray().Select(e => e.TryGetProperty("Name", out var n) ? n.GetString() ?? "" : "").Where(n => n.Length > 0).Distinct()
                    .Select(n => new ExitRow(n, Loc("ch").GetValueOrDefault(n, n), Loc("en").GetValueOrDefault(n, n))).ToList();
                list.Add(new MapExits(si.GetString() ?? "", id, rows));
            }
            catch { }   // 一张图的 base.json 坏了就少这一张，别拖垮整表
        }
        return list;
    }

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

    Dictionary<string, ItemRow>? _byTpl;
    Dictionary<string, string>? _iconOf;

    /// <summary>tpl → handbook 里那一条（中英名 + 分类 + 参考价）。</summary>
    public ItemRow? ItemOf(string tpl)
    {
        if (_byTpl == null)
        {
            _byTpl = new Dictionary<string, ItemRow>(StringComparer.OrdinalIgnoreCase);
            // ⚠️ 手写循环不用 ToDictionary：handbook 里出现过重复 id，ToDictionary 会直接抛，
            //    500 一冒就把本该给用户的人话顶掉了（任务那边踩过同一个坑）
            foreach (var i in Handbook().Items) _byTpl[i.Id] = i;
        }
        return _byTpl.GetValueOrDefault(tpl);
    }

    /// <summary>
    /// tpl → **它所属分类**的图标文件名（如 <c>icon_ammo_boxes.png</c>）。
    /// SPT 没有单件物品的图标，只有分类这一级有，所以货架预览只能画到分类粒度。
    /// </summary>
    public string IconOf(string tpl)
    {
        if (_iconOf == null)
        {
            var (cats, items) = Handbook();
            var byCat = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var c in cats) if (c.Icon.Length > 0) byCat[c.Id] = c.Icon;
            _iconOf = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var i in items)
                if (byCat.TryGetValue(i.Cat, out var ic)) _iconOf[i.Id] = ic;
        }
        return _iconOf.GetValueOrDefault(tpl, "");
    }

    /// <summary>
    /// 分类图标的真实路径。**只收裸文件名**，路径服务端自己拼 ——
    /// 外面传进来的东西一律当文件名用，带目录分隔符或 <c>..</c> 直接拒。
    /// </summary>
    public string? IconPath(string name)
    {
        if (!SafeName.Ok(name) || !name.EndsWith(".png", StringComparison.OrdinalIgnoreCase)) return null;
        var p = Path.Combine(_db, "..", "images", "handbook", name);
        return File.Exists(p) ? p : null;
    }

    /// <summary>
    /// SPT 自带商人头像的真实路径（<c>images\trader\avatar\&lt;商人id&gt;.png</c>，一共 12 张）。
    /// id 是拿来拼文件名的，所以**只认十六进制/字母数字**，别的一律拒。
    /// 自定义商人不在这 12 张里，返回 null，界面自己退回剪影。
    /// </summary>
    public string? TraderAvatar(string id)
    {
        if (id.Length == 0 || id.Length > 32 || !id.All(char.IsAsciiLetterOrDigit)) return null;
        var dir = Path.Combine(_db, "..", "images", "trader", "avatar");
        foreach (var ext in new[] { ".png", ".jpg" })
        {
            var p = Path.Combine(dir, id + ext);
            if (File.Exists(p)) return p;
        }
        return null;
    }

    public (List<CatRow> Cats, List<ItemRow> Items) Handbook()
    {
        if (_cats != null && _items != null) return (_cats, _items);
        var cats = new List<CatRow>(); var items = new List<ItemRow>();
        var p = Path.Combine(_db, "templates", "handbook.json");
        JsonDocument? hb = null;
        if (File.Exists(p)) { try { hb = JsonDocument.Parse(JsonBytes.Read(p)); } catch { hb = null; } }   // 坏了就当没有 handbook：物品表空、页面不崩
        if (hb != null)
        {
            using var doc = hb;
            var r = doc.RootElement;
            if (r.TryGetProperty("Categories", out var cs))
                foreach (var c in cs.EnumerateArray())
                {
                    var id = Prop(c, "Id");
                    // 分类名的键就是分类 id 本身，不带 " Name" 后缀
                    // Icon 存的是 /files/handbook/xxx.png，只留文件名 —— 路径由服务端自己拼，
                    // 免得这串东西被当成可以随便读盘的入口
                    cats.Add(new CatRow(id, Prop(c, "ParentId"),
                        Loc("ch").GetValueOrDefault(id, ""), Loc("en").GetValueOrDefault(id, ""),
                        Path.GetFileName(Prop(c, "Icon"))));
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
