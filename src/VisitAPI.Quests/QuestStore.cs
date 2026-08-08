using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>
/// 任务库：<c>db\quests\*.json</c>，每个文件是 <c>{ "&lt;24位id&gt;": { …任务… } }</c>。
///
/// **故意不做强类型模型。** SPT 的 Quest 记录带 [JsonExtensionData]，真实文件里有一堆
/// 我们不认识也不该动的字段（arenaLocations / gameModes / templateId …）。
/// 反序列化成 C# 类再序列化回去，任何没建模的字段都会被静默丢掉 ——
/// 这和 .dlg 那边"注释必须原样吐回"是同一条原则：**我们只改自己认识的东西，别的原样搬运。**
/// 所以全程 JsonNode，改哪个键动哪个键。
/// </summary>
public sealed class QuestStore
{
    /// <summary>文件名（不含目录） → 整份文件的 JSON。</summary>
    public Dictionary<string, JsonObject> Files { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>任务 id → 它住在哪个文件里。界面要显示"这个任务来自哪个文件"。</summary>
    public Dictionary<string, string> Owner { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// 读不动的文件：文件名 → 出错原因。
    /// **一定要报出来。** 第一版是 <c>continue</c> 悄悄跳过，那样用户看到的是"我的任务不见了"，
    /// 而不是"这个文件的 JSON 写错了" —— 后者五秒能修，前者能查一晚上。
    /// </summary>
    public Dictionary<string, string> Broken { get; } = new(StringComparer.OrdinalIgnoreCase);

    public string Dir { get; }

    public QuestStore(string questDbDir) => Dir = Path.Combine(questDbDir, "quests");

    public void Load()
    {
        Files.Clear(); Owner.Clear(); Broken.Clear();
        if (!Directory.Exists(Dir)) return;
        foreach (var f in Directory.GetFiles(Dir, "*.json").OrderBy(x => x))
        {
            var name = Path.GetFileName(f);
            try
            {
                if (JsonNode.Parse(File.ReadAllText(f)) is not JsonObject obj)
                { Broken[name] = "not_object"; continue; }    // 顶层得是 { "<id>": {...} }
                Files[name] = obj;
                foreach (var kv in obj) Owner[kv.Key] = name;
            }
            catch (Exception e) { Broken[name] = e.Message; }
        }
    }

    /// <summary>所有任务，按文件名再按 id 排，顺序稳定 —— 界面上的列表不该每次刷新都乱跳。</summary>
    public IEnumerable<(string Id, string File, JsonObject Quest)> All() =>
        Files.OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
             .SelectMany(kv => kv.Value
                 .Where(q => q.Value is JsonObject)
                 .Select(q => (q.Key, kv.Key, (JsonObject)q.Value!)));

    static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        // 中文不该被转成 \uXXXX：这些文件作者要用记事本打开看的
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>写回一个文件。覆盖前留 .bak —— 和 .dlg 那边同一条规矩。</summary>
    public void SaveFile(string name)
    {
        if (!Files.TryGetValue(name, out var obj)) return;
        Directory.CreateDirectory(Dir);
        var path = Path.Combine(Dir, name);
        if (File.Exists(path)) File.Copy(path, path + ".bak", true);
        File.WriteAllText(path, obj.ToJsonString(Pretty));
    }
}
