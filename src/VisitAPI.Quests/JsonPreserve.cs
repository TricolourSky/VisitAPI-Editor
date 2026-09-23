using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>Validate eagerly and edit values without normalizing unrelated JSON.</summary>
public static class JsonPreserve
{
    public static JsonNode? Parse(string text)
    {
        var reader = new Utf8JsonReader(Encoding.UTF8.GetBytes(text));
        var objects = new Stack<HashSet<string>>();
        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.StartObject) objects.Push(new(StringComparer.Ordinal));
            else if (reader.TokenType == JsonTokenType.EndObject) objects.Pop();
            else if (reader.TokenType == JsonTokenType.PropertyName && !objects.Peek().Add(reader.GetString()!))
                throw new JsonException("duplicate_property: " + reader.GetString());
        }
        return JsonNode.Parse(text);
    }

    // The browser's baseline may contain rounded integers. Only values actually edited
    // by the user may replace the original server values, including extension fields.
    public static JsonNode? Merge(JsonNode? original, JsonNode? baseline, JsonNode? edited)
    {
        if (JsonNode.DeepEquals(baseline, edited)) return original?.DeepClone();
        if (baseline is JsonObject before && edited is JsonObject after && original is JsonObject disk)
        {
            var result = (JsonObject)disk.DeepClone();
            foreach (var key in before.Select(p => p.Key).Except(after.Select(p => p.Key))) result.Remove(key);
            foreach (var (key, value) in after)
                if (!before.TryGetPropertyValue(key, out var prev)) result[key] = value?.DeepClone();
                else result[key] = Merge(disk[key], prev, value);
            return result;
        }
        if (baseline is JsonArray a && edited is JsonArray b && original is JsonArray c && a.Count == c.Count)
            return MergeArray(c, a, b);
        return edited?.DeepClone();
    }

    static JsonArray MergeArray(JsonArray disk, JsonArray before, JsonArray after)
    {
        var used = new HashSet<int>();
        var result = new JsonArray();
        foreach (var value in after)
        {
            var id = Identity(value);
            var candidates = Enumerable.Range(0, before.Count).Where(i => !used.Contains(i));
            var matches = candidates.Where(i => id != null && Identity(before[i]) == id).ToArray();
            var index = matches.Length == 1 ? matches[0] : candidates.FirstOrDefault(i => JsonNode.DeepEquals(before[i], value), -1);
            if (index < 0 && id == null && before.Count == after.Count && !used.Contains(result.Count)) index = result.Count;
            if (index < 0) result.Add(value?.DeepClone());
            else { used.Add(index); result.Add(Merge(disk[index], before[index], value)); }
        }
        return result;
    }

    static string? Identity(JsonNode? value) => value is JsonObject obj
        ? (obj["_id"] ?? obj["id"]) is JsonValue v && v.TryGetValue<string>(out var id) ? id : null : null;

    public static string Rewrite(string source, JsonNode? edited, JsonFile.Style? style)
    {
        var original = Parse(source);
        if (JsonNode.DeepEquals(original, edited)) return source;
        var bytes = Encoding.UTF8.GetBytes(source);
        var reader = new Utf8JsonReader(bytes);
        reader.Read();
        var changes = new List<(int Start, int End, string Text)>();
        Collect(ref reader, bytes, original, edited, style, changes);
        foreach (var change in changes.OrderByDescending(c => c.Start))
        {
            var insert = Encoding.UTF8.GetBytes(change.Text);
            bytes = bytes[..change.Start].Concat(insert).Concat(bytes[change.End..]).ToArray();
        }
        return Encoding.UTF8.GetString(bytes);
    }

    static void Collect(ref Utf8JsonReader r, byte[] bytes, JsonNode? before, JsonNode? after,
        JsonFile.Style? style, List<(int Start, int End, string Text)> changes)
    {
        if (JsonNode.DeepEquals(before, after)) { r.Skip(); return; }
        if (before is JsonObject a && after is JsonObject b && a.Select(p => p.Key).SequenceEqual(b.Select(p => p.Key)))
        {
            while (r.Read() && r.TokenType != JsonTokenType.EndObject)
            {
                var key = r.GetString()!;
                r.Read();
                Collect(ref r, bytes, a[key], b[key], style, changes);
            }
            return;
        }
        if (before is JsonArray x && after is JsonArray y && x.Count == y.Count)
        {
            for (var i = 0; i < x.Count; i++) { r.Read(); Collect(ref r, bytes, x[i], y[i], style, changes); }
            r.Read();
            return;
        }
        var start = (int)r.TokenStartIndex;
        r.Skip();
        changes.Add((start, (int)r.BytesConsumed, after == null ? "null" : JsonFile.Render(after, style)));
    }
}
