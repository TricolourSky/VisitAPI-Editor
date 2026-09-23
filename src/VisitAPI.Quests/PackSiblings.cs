using System.Text.Json;
using VisitAPI.Packs;

namespace VisitAPI.Quests;

/// <summary>
/// 兄弟包（09-23 内容包）：同一模组 <c>packs\</c> 下别的包（和老的 <c>db\</c>）里的任务 id → 包名。
/// 校验用：前置指过去不算「找不到」（插件把所有包合起来加载），同一个 id 两边都有另报 <c>dup_id_pack</c>。
/// 只读每份文件顶层的键，不解析整条任务；按文件清单和时间戳缓存一份。
/// </summary>
public static class PackSiblings
{
    static readonly JsonDocumentOptions Lenient = new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };
    static (string Key, Dictionary<string, string> Ids)? _cache;

    public static IReadOnlyDictionary<string, string> QuestIds(string questDb)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var mod = QuestImages.ModRoot(questDb);
        if (mod.Length == 0 || !Directory.Exists(mod)) return result;
        var me = Path.GetFullPath(Path.TrimEndingDirectorySeparator(questDb));
        var isPack = QuestImages.IsPack(questDb);
        var others = PackLayout.Discover(mod)
            .Where(p => p.IsLegacy ? isPack : !string.Equals(Path.GetFullPath(Path.TrimEndingDirectorySeparator(p.Folder)), me, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var files = others.SelectMany(p => PackLayout.DataFiles(p, "quests").Select(f => (p, f))).ToList();
        var key = me + "|" + ReadOnlyJson.Revision(files.Select(x => x.f).Append(mod));
        if (_cache is { } cached && cached.Key == key) return cached.Ids;
        foreach (var (p, f) in files)
            try
            {
                using var doc = JsonDocument.Parse(JsonBytes.Read(f), Lenient);
                if (doc.RootElement.ValueKind != JsonValueKind.Object) continue;
                foreach (var e in doc.RootElement.EnumerateObject())
                    if (QuestValidator.IsMongoId(e.Name)) result.TryAdd(e.Name, p.IsLegacy ? PackLayout.LegacyDb : p.Name);
            }
            catch { }
        _cache = (key, result);
        return result;
    }
}
