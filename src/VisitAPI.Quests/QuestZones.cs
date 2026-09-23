using System.Text.Json;

namespace VisitAPI.Quests;

public sealed record QuestZone(string Id, string Type, string[] Locations, string File, JsonElement Definition);
public sealed record QuestZoneCatalog(List<QuestZone> Zones, Dictionary<string, string> Broken);

/// <summary>Zone definitions are read-only. Authors edit references, not scene coordinates, in this editor.</summary>
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
