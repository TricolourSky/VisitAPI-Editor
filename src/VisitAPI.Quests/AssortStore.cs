using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>货架上的一份清单。<c>Kind</c>：<c>single</c>=独占一份 assort.json；<c>wtt</c>=WTT 的多商人清单。</summary>
public sealed record AssortRef(string File, string Kind, string TraderKey, JsonObject Scheme);

/// <summary>
/// 商人货架。两种写法都认（Tech Leader 拍板"两个都可以"）：
///
/// <list type="bullet">
/// <item><c>&lt;db&gt;\assort.json</c> —— 一个模组就一个商人时的写法，商人 id 在同目录的 base.json 里</item>
/// <item><c>&lt;db&gt;\CustomAssortSchemes\*.json</c> —— WTT 的通用约定，
///       一份文件里可以有多个商人：<c>{ "&lt;商人id或名&gt;": { items, barter_scheme, loyal_level_items } }</c></item>
/// </list>
///
/// 整份文件装在 JsonObject 里，只动我们认识的键 —— 和任务、bot 外观是同一条原则。
/// </summary>
public sealed class AssortStore
{
    public const string WttDir = "CustomAssortSchemes";

    /// <summary>相对 db 的文件名（<c>assort.json</c> 或 <c>CustomAssortSchemes/x.json</c>）→ 整份文件。</summary>
    public Dictionary<string, JsonObject> Files { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> Broken { get; } = new(StringComparer.OrdinalIgnoreCase);

    public string Db { get; }
    public AssortStore(string modDbDir) => Db = modDbDir;

    public void Load()
    {
        Files.Clear(); Broken.Clear();
        One("assort.json", Path.Combine(Db, "assort.json"));
        var dir = Path.Combine(Db, WttDir);
        if (!Directory.Exists(dir)) return;
        foreach (var f in Directory.GetFiles(dir, "*.json").OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            One(WttDir + "/" + Path.GetFileName(f), f);
    }

    void One(string name, string path)
    {
        if (!File.Exists(path)) return;
        try
        {
            if (JsonNode.Parse(System.Text.Encoding.UTF8.GetString(JsonBytes.Read(path))) is not JsonObject o)
            { Broken[name] = "not_object"; return; }
            Files[name] = o;
        }
        catch (Exception e) { Broken[name] = e.Message; }
    }

    /// <summary>
    /// 把两种写法摊平成同一种视图。
    /// 单商人那份的商人 id 从同目录 base.json 读；读不到就留空，界面会提示作者自己指一个。
    /// </summary>
    public IEnumerable<AssortRef> All()
    {
        foreach (var (name, root) in Files.OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase))
        {
            if (name.Equals("assort.json", StringComparison.OrdinalIgnoreCase))
                yield return new AssortRef(name, "single", BaseTraderId(), root);
            else
                foreach (var kv in root)
                    if (kv.Value is JsonObject s) yield return new AssortRef(name, "wtt", kv.Key, s);
        }
    }

    /// <summary>同目录 base.json 里的商人 id —— 单商人写法唯一能问到"这是谁的货架"的地方。</summary>
    public string BaseTraderId()
    {
        var p = Path.Combine(Db, "base.json");
        if (!File.Exists(p)) return "";
        try
        {
            using var doc = JsonDocument.Parse(JsonBytes.Read(p));
            return doc.RootElement.TryGetProperty("_id", out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() ?? "" : "";
        }
        catch { return ""; }
    }

    /// <summary>货架里的根件（一格商品）。<c>slotId == "hideout"</c> 才是根，其余是装在容器里的子件。</summary>
    public static List<JsonObject> Roots(JsonObject scheme) =>
        Items(scheme).Where(i => Str(i, "slotId") == "hideout").ToList();

    public static List<JsonObject> Items(JsonObject scheme) =>
        (scheme["items"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];

    public static List<JsonObject> ChildrenOf(JsonObject scheme, string parentId) =>
        Items(scheme).Where(i => Str(i, "parentId") == parentId).ToList();

    public static string Str(JsonObject o, string k) =>
        o[k] is JsonValue v && v.TryGetValue<string>(out var s) ? s : "";

    static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>写回一份文件，覆盖前留 .bak（全项目同一条规矩）。</summary>
    public void SaveFile(string name)
    {
        if (!Files.TryGetValue(name, out var obj)) return;
        var path = Path.Combine(Db, name.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (File.Exists(path)) File.Copy(path, path + ".bak", true);
        File.WriteAllText(path, obj.ToJsonString(Pretty));
    }
}
