using System.Text.Json;

namespace VisitAPI.Quests;

/// <summary>一件模组加的物品：<c>Mod</c> 是来源目录名，<c>CloneOf</c> 是它克隆的原版 tpl（货架校验拿那件的槽位当自己的）。</summary>
public sealed record ModItem(string Id, string Cat, string Zh, string En, int Price, string Mod, string CloneOf);

/// <summary>
/// 离线扫模组注册的物品（SORA 2026-09-13 定走这条路，不连运行中的 SPT 服务端）。
///
/// 只认 WTT-ServerCommonLib 那套约定：<c>user\mods\&lt;mod&gt;\db\CustomItems\**\*.json</c>（<c>CustomQuestItems</c> 同形），
/// 每个文件是 <c>{ "&lt;新 tpl&gt;": { itemTplToClone, handbookParentId, handbookPriceRoubles, locales.en.name, … } }</c>；
/// 中英名优先取该模组 <c>db\CustomLocales\{ch,en}.json</c> 的「&lt;id&gt; Name」，没有再退回配置里的 <c>locales</c>。
/// 本机实测：WTT-Armory + ContentBackport 共 1525 条，配置里只有 en 一种文案，中文全靠 CustomLocales。
///
/// 用代码注册物品的模组这里扫不到 —— <b>扫不到 ≠ 不存在</b>，界面措辞要停在「没找到」。
/// 坏文件跳过（ContentBackport 有一份就解析不了），别让一个模组拖垮整表；键不是 24 位 hex 的条目也跳过。
/// </summary>
public static class ModItems
{
    static readonly JsonDocumentOptions Lenient = new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };

    public static List<ModItem> Scan(string eftRoot)
    {
        var list = new List<ModItem>();
        if (eftRoot.Length == 0) return list;
        var mods = Path.Combine(eftRoot, "SPT_Runtime", "user", "mods");
        if (!Directory.Exists(mods)) return list;
        foreach (var mod in Directory.GetDirectories(mods))
        {
            var dirs = new[] { "CustomItems", "CustomQuestItems" }.Select(d => Path.Combine(mod, "db", d)).Where(Directory.Exists).ToList();
            if (dirs.Count == 0) continue;
            var zh = Loc(mod, "ch"); var en = Loc(mod, "en"); var name = Path.GetFileName(mod);
            foreach (var f in dirs.SelectMany(d => Directory.GetFiles(d, "*.json", SearchOption.AllDirectories)))
            {
                JsonDocument doc;
                try { doc = JsonDocument.Parse(JsonBytes.Read(f), Lenient); } catch { continue; }
                using var _ = doc;
                if (doc.RootElement.ValueKind != JsonValueKind.Object) continue;
                foreach (var e in doc.RootElement.EnumerateObject())
                {
                    if (!QuestValidator.IsMongoId(e.Name) || e.Value.ValueKind != JsonValueKind.Object) continue;
                    var v = e.Value;
                    list.Add(new ModItem(e.Name, Str(v, "handbookParentId"),
                        zh.GetValueOrDefault(e.Name + " Name") is { Length: > 0 } z ? z : LocName(v, "ch"),
                        en.GetValueOrDefault(e.Name + " Name") is { Length: > 0 } n ? n : LocName(v, "en"),
                        // 09-15 审查：价格不是数字（null / "15000"）时 TryGetInt32 直接抛，整张物品表和货架页跟着 500 —— 先认类型，不是数字按 0
                        v.TryGetProperty("handbookPriceRoubles", out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var pr) ? pr : 0,
                        name, Str(v, "itemTplToClone")));
                }
            }
        }
        return list;
    }

    /// <summary>配置里的 <c>locales.&lt;lang&gt;.name</c>；要的语言没有就退回 en（本机的配置只有 en）。</summary>
    static string LocName(JsonElement v, string lang)
    {
        if (!v.TryGetProperty("locales", out var l) || l.ValueKind != JsonValueKind.Object) return "";
        foreach (var k in new[] { lang, "en" })
            if (l.TryGetProperty(k, out var x) && x.ValueKind == JsonValueKind.Object && Str(x, "name").Length > 0) return Str(x, "name");
        return "";
    }

    static Dictionary<string, string> Loc(string mod, string lang)
    {
        var d = new Dictionary<string, string>(StringComparer.Ordinal);
        var p = Path.Combine(mod, "db", "CustomLocales", lang + ".json");
        if (!File.Exists(p)) return d;
        try
        {
            using var doc = JsonDocument.Parse(JsonBytes.Read(p), Lenient);
            foreach (var e in doc.RootElement.EnumerateObject())
                if (e.Value.ValueKind == JsonValueKind.String) d.TryAdd(e.Name, e.Value.GetString()!);   // 重复键取先出现的，和 SptData.Loc 同口径
        }
        catch { }
        return d;
    }

    static string Str(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
