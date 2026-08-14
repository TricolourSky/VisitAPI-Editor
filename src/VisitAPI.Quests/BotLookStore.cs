using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>
/// bot 外观库：<c>&lt;模组db&gt;\CustomBotLoadouts\&lt;bot类型&gt;.json</c>。
///
/// **文件名就是 bot 类型**——WTT 拿它直接去 bot 表里查，而那张表的 key 全是小写。
/// 名字写错（或者大小写不对）它只 <c>logger.Error</c> 一句就跳过，**服务端一个错都不报**，
/// 作者只会觉得"我配了但游戏里没生效"。所以这是本模块头号要拦的东西。
///
/// **整份文件装在 JsonObject 里，只动 appearance。**
/// 同一份文件还可能有 <c>chances</c> / <c>inventory</c> 段（WTT 支持，只是我们不编辑），
/// 反序列化成强类型再写回去会把它们静默丢掉 —— 和任务那边是同一条原则。
/// </summary>
public sealed class BotLookStore
{
    /// <summary>文件名（含 .json） → 整份文件。</summary>
    public Dictionary<string, JsonObject> Files { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>读不动的文件：文件名 → 原因。必须报出来，否则作者看到的是"我的配置不见了"。</summary>
    public Dictionary<string, string> Broken { get; } = new(StringComparer.OrdinalIgnoreCase);

    public string Dir { get; }

    public BotLookStore(string modDbDir) => Dir = Path.Combine(modDbDir, "CustomBotLoadouts");

    public void Load()
    {
        Files.Clear(); Broken.Clear();
        if (!Directory.Exists(Dir)) return;
        foreach (var f in Directory.GetFiles(Dir, "*.json").OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var name = Path.GetFileName(f);
            try
            {
                if (JsonNode.Parse(System.Text.Encoding.UTF8.GetString(JsonBytes.Read(f))) is not JsonObject o)
                { Broken[name] = "not_object"; continue; }
                Files[name] = o;
            }
            catch (Exception e) { Broken[name] = e.Message; }
        }
    }

    /// <summary>bot 类型名（＝去掉 .json 的文件名）。</summary>
    public static string TypeOf(string fileName) => Path.GetFileNameWithoutExtension(fileName);

    /// <summary>某个 bot 某个分区的 <c>id → 权重</c>。没有就返回空表。</summary>
    public static Dictionary<string, double> Slot(JsonObject file, string slot)
    {
        var d = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        if (file["appearance"]?[slot] is not JsonObject o) return d;
        foreach (var kv in o)
            if (kv.Value is JsonValue v && v.TryGetValue<double>(out var w)) d[kv.Key] = w;
        return d;
    }

    static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        // 中文不该被转成 \uXXXX：这些文件作者要用记事本打开看的
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// 写回一个文件，覆盖前留 .bak（和任务库、.dlg 同一条规矩）。
    /// <b>空的 appearance ＝ 把这份文件删掉</b>：留着一个什么都不改的文件只会让 WTT 白读一遍。
    /// </summary>
    public void SaveFile(string name)
    {
        if (!Files.TryGetValue(name, out var obj)) return;
        Directory.CreateDirectory(Dir);
        var path = Path.Combine(Dir, name);
        if (File.Exists(path)) File.Copy(path, path + ".bak", true);
        if (IsEmpty(obj))
        {
            if (File.Exists(path)) File.Delete(path);
            Files.Remove(name);
            return;
        }
        File.WriteAllText(path, obj.ToJsonString(Pretty));
    }

    /// <summary>整份文件除了空的 appearance 之外什么都没有。</summary>
    static bool IsEmpty(JsonObject o)
    {
        foreach (var kv in o)
        {
            if (kv.Key != "appearance") return false;           // 还有 chances / inventory，不能删
            if (kv.Value is JsonObject ap && ap.Any(s => s.Value is JsonObject j && j.Count > 0)) return false;
        }
        return true;
    }
}
