using System.Text.Json;

namespace VisitAPI.Quests;

/// <summary>一个可选外观。<c>Slot</c> 是 bot appearance 里的分区名（head/body/hands/feet/voice）。</summary>
public sealed record LookRow(string Id, string Slot, string Zh, string En, string Source);

/// <summary>
/// 外观目录 = SPT 自带 + 这个模组自己注册的。
///
/// bot 的 <c>appearance</c> 里填的全是 24 位 id，**作者不可能背得住**，所以要给他一张能搜的表。
/// SPT 那份在 <c>templates\customization.json</c>，728 条，按 <c>_parent</c> 正好分成我们要的五类
/// （实测：Body 150 / Feet 111 / Hands 99 / Head 56 / Voice 40）。
/// 模组自己的那份没有统一注册表，只能去扫 WTT 的三个配置目录。
/// </summary>
public sealed class Customization
{
    /// <summary>SPT customization 的 <c>_parent</c> → bot appearance 的分区名。</summary>
    public static readonly Dictionary<string, string> SlotOfParent = new(StringComparer.Ordinal)
    {
        ["5cc0868e14c02e000c6bea68"] = "body",
        ["5cc0869814c02e000a4cad94"] = "feet",
        ["5cc086a314c02e000c6bea69"] = "hands",
        ["5cc085e214c02e000c6bea67"] = "head",
        ["5fc100cf95572123ae738483"] = "voice",
    };

    public static readonly string[] Slots = ["head", "body", "hands", "feet", "voice"];

    readonly string _sptDb, _modDb;
    List<LookRow>? _rows;

    public Customization(string sptDatabaseDir, string modDbDir)
    { _sptDb = sptDatabaseDir; _modDb = modDbDir; }

    public List<LookRow> Rows() => _rows ??= LoadSpt().Concat(ModLooks.Scan(_modDb)).ToList();

    /// <summary>
    /// SPT 那张原生外观表读到了没有。
    /// **校验必须看这个**：读不到的话每个原生 id 都会被判成"不存在"，全是假警报。
    /// </summary>
    public bool HasSpt => Rows().Any(r => r.Source == "spt");

    /// <summary>id → 它属于哪个分区。校验"把头的 id 填进身体区"要用。</summary>
    public Dictionary<string, string> SlotById()
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in Rows()) d[r.Id] = r.Slot;
        return d;
    }

    List<LookRow> LoadSpt()
    {
        var list = new List<LookRow>();
        var p = Path.Combine(_sptDb, "templates", "customization.json");
        if (!File.Exists(p)) return list;
        var zh = Names("ch");
        var en = Names("en");
        using var doc = JsonDocument.Parse(JsonBytes.Read(p));
        foreach (var e in doc.RootElement.EnumerateObject())
        {
            if (e.Value.ValueKind != JsonValueKind.Object) continue;
            var parent = Str(e.Value, "_parent");
            if (!SlotOfParent.TryGetValue(parent, out var slot)) continue;
            // 没有本地化名字的退回内部名（_name，形如 wild_head_3），总比只显示一串十六进制强
            var fallback = Str(e.Value, "_name");
            list.Add(new LookRow(e.Name, slot,
                Named(zh, e.Name, fallback), Named(en, e.Name, fallback), "spt"));
        }
        return list;
    }

    Dictionary<string, string> Names(string lang)
    {
        var d = new Dictionary<string, string>(StringComparer.Ordinal);
        var p = Path.Combine(_sptDb, "locales", "global", lang + ".json");
        if (!File.Exists(p)) return d;
        // 这些文件里有只差大小写的重复键，JsonObject 会抛；JsonDocument + TryAdd 保留先出现的
        using var doc = JsonDocument.Parse(JsonBytes.Read(p));
        foreach (var e in doc.RootElement.EnumerateObject())
            if (e.Value.ValueKind == JsonValueKind.String) d.TryAdd(e.Name, e.Value.GetString()!);
        return d;
    }

    /// <summary>
    /// 查文案名。
    ///
    /// ⚠️ **不能用 <c>GetValueOrDefault(key, fallback)</c>**：原版有大量条目的键是**在**的、值却是空串
    /// （实测 <c>"5d28afe786f774292668618d Name": ""</c>），那样兜底永远轮不上，
    /// 选择器里就会出现一片只有十六进制 id 的行。**空值要当成没有。**
    /// </summary>
    static string Named(Dictionary<string, string> loc, string id, string fallback)
    {
        var s = loc.GetValueOrDefault(id + " Name", "");
        return string.IsNullOrWhiteSpace(s) ? fallback : s;
    }

    static string Str(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
