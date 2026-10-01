using System.Text.Json;

namespace VisitAPI.Quests;

public sealed record QuestZone(string Id, string Type, string[] Locations, string File, JsonElement Definition);
public sealed record QuestZoneCatalog(List<QuestZone> Zones, Dictionary<string, string> Broken);

/// <summary>Zone definitions are read as they are; the only write path is <see cref="Add"/>, which appends one visit box (chapter page "add a step").</summary>
public static class QuestZones
{
    static (string Key, QuestZoneCatalog Data)? _cache;
    static (string Key, IReadOnlySet<string>? Ids)? _stock;
    public static QuestZoneCatalog Scan(string questDb)
    {
        if (!QuestImages.Registers(questDb)) return new([], []);
        var dir = Path.Combine(questDb, "zones");
        var files = Directory.Exists(dir) ? Directory.GetFiles(dir, "*.json") : [];
        var key = ReadOnlyJson.Revision(files.Append(dir));
        if (_cache is { } cache && cache.Key == key) return cache.Data;
        var data = new QuestZoneCatalog([], new(StringComparer.OrdinalIgnoreCase));
        foreach (var file in files)
        {
            try
            {
                using var doc = JsonDocument.Parse(JsonBytes.Read(file), new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
                if (doc.RootElement.ValueKind != JsonValueKind.Array) throw new JsonException("zone file must contain an array");
                foreach (var zone in doc.RootElement.EnumerateArray())
                {
                    var id = Text(zone, "id");
                    var maps = Strings(Field(zone, "locations")).ToArray();
                    if (id.Length == 0 || maps.Length == 0) continue; // Client QuestZones.TryParse skips these.
                    var type = Text(zone, "type").ToLowerInvariant() == "placeitem" ? "placeitem" : "visit";
                    data.Zones.Add(new(id, type, maps, Path.GetFileName(file), zone.Clone()));
                }
            }
            catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException)
            { data.Broken[Path.GetFileName(file)] = e.Message; }
        }
        _cache = (key, data);
        return data;
    }

    /// <summary>10-01 章节「加一步：去某地踩点」：往任务库的 zones 文件追加一个到达区域。<b>只在文末 <c>]</c> 前插一段文字</b>，
    /// 作者写的别的区域、备注、排版一个字节不动；zones 里已有文件就续在第一份后面，没有就新建 <c>zones\&lt;库文件夹名&gt;.json</c>。
    /// 写之前把拼好的全文再解析一遍，数目对不上（文件里有注释之类拼坏了）就不落盘。成了回 null，否则回错误码。</summary>
    public static string? Add(string questDb, string id, string map, double[] pos, double[] size)
    {
        if (!QuestImages.Registers(questDb)) return "not_visitapi_db";
        static bool Word(string s) => s.Length > 0 && s.All(c => char.IsAsciiLetterOrDigit(c) || c == '_');
        if (!Word(id) || !Word(map) || pos.Concat(size).Any(v => !double.IsFinite(v)) || size.Any(v => v <= 0)) return "bad_zone";
        if (Scan(questDb).Zones.Any(z => z.Id.Equals(id, StringComparison.OrdinalIgnoreCase))) return "zone_exists";
        var dir = Path.Combine(questDb, "zones");
        var path = (Directory.Exists(dir) ? Directory.GetFiles(dir, "*.json").OrderBy(f => f, StringComparer.OrdinalIgnoreCase).FirstOrDefault() : null)
                   ?? Path.Combine(dir, Path.GetFileName(questDb.TrimEnd('\\', '/')) + ".json");
        var text = File.Exists(path) ? File.ReadAllText(path) : "[\n]";
        static int Count(string json)
        {
            try { using var d = JsonDocument.Parse(json, new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip }); return d.RootElement.ValueKind == JsonValueKind.Array ? d.RootElement.GetArrayLength() : -1; }
            catch (JsonException) { return -1; }
        }
        var n = Count(text); var at = text.LastIndexOf(']');
        if (n < 0 || at < 0) return "zone_file_broken";
        static string N(double v) => Math.Round(v, 2).ToString(System.Globalization.CultureInfo.InvariantCulture);
        var head = text[..at].TrimEnd();
        var entry = $"  {{\n    \"id\": \"{id}\",\n    \"type\": \"visit\",\n    \"locations\": [\"{map}\"],\n"
            + $"    \"position\": {{ \"x\": {N(pos[0])}, \"y\": {N(pos[1])}, \"z\": {N(pos[2])} }},\n    \"rotation\": {{ \"x\": 0, \"y\": 0, \"z\": 0, \"w\": 1 }},\n"
            + $"    \"size\": {{ \"x\": {N(size[0])}, \"y\": {N(size[1])}, \"z\": {N(size[2])} }}\n  }}";
        var next = head + (n > 0 && !head.EndsWith(',') ? "," : "") + "\n" + entry + "\n]" + text[(at + 1)..];
        if (Count(next) != n + 1) return "zone_file_broken";
        TextFile.Write(path, next);
        _cache = null;
        return null;
    }

    public static IReadOnlySet<string>? StockReferences(string sptData)
    {
        if (sptData.Length == 0) return null;
        var files = new[] { "quests.json", "achievements.json", "customAchievements.json" }.Select(n => Path.Combine(sptData, "templates", n)).ToArray();
        var key = ReadOnlyJson.Revision(files);
        if (_stock is { } cache && cache.Key == key) return cache.Ids;
        var ids = new HashSet<string>(StringComparer.Ordinal); var loaded = false;
        foreach (var file in files)
        {
            using var doc = ReadOnlyJson.Read(file);
            if (doc == null) continue;
            loaded = true; Collect(doc.RootElement, ids);
        }
        _stock = (key, loaded ? ids : null);
        return _stock.Value.Ids;
    }

    static void Collect(JsonElement node, HashSet<string> ids)
    {
        if (node.ValueKind == JsonValueKind.Array) foreach (var child in node.EnumerateArray()) Collect(child, ids);
        if (node.ValueKind != JsonValueKind.Object) return;
        var type = Text(node, "conditionType");
        if (type == "VisitPlace") ids.UnionWith(Strings(Field(node, "target")));
        if (type is "LeaveItemAtLocation" or "PlaceBeacon")
        { ids.UnionWith(Strings(Field(node, "zoneId"))); ids.UnionWith(Strings(Field(node, "zoneIds"))); }
        foreach (var prop in node.EnumerateObject()) Collect(prop.Value, ids);
    }

    static IEnumerable<string> Strings(JsonElement node) => node.ValueKind == JsonValueKind.Array
        ? node.EnumerateArray().SelectMany(Strings) : node.ValueKind == JsonValueKind.String && node.GetString() is { Length: > 0 } text ? [text] : [];
    static JsonElement Field(JsonElement node, string key) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(key, out var value) ? value : default;
    static string Text(JsonElement node, string key) => Field(node, key) is { ValueKind: JsonValueKind.String } value ? value.GetString() ?? "" : "";
}
