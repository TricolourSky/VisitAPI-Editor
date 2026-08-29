using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>
/// 文案库：<c>db\locales\{ch,en}.json</c>，扁平的 key → 文本。
///
/// 任务 json 里的 name / description / successMessageText 存的都是 <b>key</b>，真正的文字在这里。
/// 作者不该被迫理解这层间接 —— 界面上只让他看见文字，key 由编辑器按
/// <c>"&lt;任务id&gt; &lt;字段名&gt;"</c> 的惯例自动生成（这是原版任务用的同一套惯例）。
/// </summary>
public sealed class LocaleStore
{
    public Dictionary<string, JsonObject> Langs { get; } = new(StringComparer.OrdinalIgnoreCase);
    public string Dir { get; }

    /// <summary>SPT 的中文文件叫 ch.json 不是 zh.json，这里统一按文件名走，别自作聪明改。</summary>
    public static readonly string[] Known = ["ch", "en"];

    public LocaleStore(string questDbDir) => Dir = Path.Combine(questDbDir, "locales");

    /// <summary>读不动的语言文件：语言 → 原因。有内容时一律不许保存，见 <see cref="SaveAll"/>。</summary>
    public Dictionary<string, string> Broken { get; } = new(StringComparer.OrdinalIgnoreCase);

    public void Load()
    {
        Langs.Clear(); Broken.Clear();
        foreach (var lang in Known)
        {
            var p = Path.Combine(Dir, lang + ".json");
            if (!File.Exists(p)) { Langs[lang] = new JsonObject(); continue; }
            try
            {
                Langs[lang] = JsonNode.Parse(File.ReadAllText(p)) as JsonObject
                              ?? throw new InvalidDataException("not_object");
            }
            catch (Exception e)
            {
                // 绝不能"解析失败就当空对象" —— 那样一保存就把作者整份文案清空了。
                // 记下来、放个空的占位，SaveAll 会因为 Broken 非空而拒绝写盘。
                Broken[lang] = e.Message;
                Langs[lang] = new JsonObject();
            }
        }
    }

    /// <summary>取一条文案。键不存在、或值不是字符串（脏数据），一律给 null，不许抛。</summary>
    public string? Get(string lang, string? key) =>
        key != null && Langs.TryGetValue(lang, out var o)
        && o[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// 只写指定的语言（不传就全写）。
    /// 有任何一个语言文件读不动就整个拒写 —— 宁可让用户看见"文案文件坏了"，
    /// 也不能拿一份空对象去覆盖人家几百条文案。
    /// </summary>
    public bool SaveAll(IEnumerable<string>? langs = null)
    {
        if (Broken.Count > 0) return false;
        Directory.CreateDirectory(Dir);
        foreach (var lang in langs ?? Langs.Keys.ToList())
        {
            if (!Langs.TryGetValue(lang, out var obj)) continue;
            var p = Path.Combine(Dir, lang + ".json");
            if (File.Exists(p)) File.Copy(p, p + ".bak", true);
            File.WriteAllText(p, obj.ToJsonString(Pretty));
        }
        return true;
    }
}
