using System.Text.Json;

namespace VisitAPI.Quests;

static class ReadOnlyJson
{
    public static JsonDocument? Read(string path)
    {
        try { return JsonDocument.Parse(JsonBytes.Read(path)); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException) { return null; }
    }

    public static string Revision(IEnumerable<string> paths) => string.Join("\n", paths.Order(StringComparer.OrdinalIgnoreCase).Select(path =>
    {
        var file = new FileInfo(path);
        return Path.GetFullPath(path) + "|" + (file.Exists ? file.Length + "|" + file.LastWriteTimeUtc.Ticks : "missing");
    }));
}
