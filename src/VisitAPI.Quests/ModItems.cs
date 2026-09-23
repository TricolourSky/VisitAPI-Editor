using System.Text.Json;
using VisitAPI.Packs;

namespace VisitAPI.Quests;

/// <summary>一件模组加的物品：<c>Mod</c> 是来源目录名，<c>CloneOf</c> 是它克隆的原版 tpl（货架校验拿那件的槽位当自己的）。</summary>
public sealed record ModItem(string Id, string Cat, string Zh, string En, int Price, string Mod, string CloneOf,
    JsonElement? Properties = null, string Parent = "", JsonElement? Template = null);

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
    static (string Key, List<ModItem> Items)? _cache;
    static readonly EnumerationOptions Recursive = new() { RecurseSubdirectories = true, AttributesToSkip = FileAttributes.ReparsePoint };

    public static string Revision(string eftRoot)
    {
        var mods = Path.Combine(eftRoot, "SPT_Runtime", "user", "mods");
        if (eftRoot.Length == 0 || !Directory.Exists(mods)) return eftRoot;
        var paths = Directory.GetDirectories(mods).SelectMany(mod =>
            new[] { "CustomItems", "CustomQuestItems", "CustomLocales", "items" }.Select(d => Path.Combine(mod, "db", d))
                .Concat(PackItemDirs(mod))
                .Where(Directory.Exists).SelectMany(d => Directory.GetFiles(d, "*.json", Recursive))
                .Append(Path.Combine(mod, "VisitAPI-Server.dll")));
        return ReadOnlyJson.Revision(paths.Append(mods));
    }

    /// <summary>内容包（09-23）：<c>&lt;模组&gt;\packs\*\items</c> 也算进变更指纹。</summary>
    static IEnumerable<string> PackItemDirs(string mod)
    {
        var packs = Path.Combine(mod, PackLayout.PacksDir);
        return Directory.Exists(packs) ? Directory.GetDirectories(packs).Select(p => Path.Combine(p, "items")) : [];
    }

    public static List<ModItem> Scan(string eftRoot)
    {
        var list = new List<ModItem>();
        var revision = Revision(eftRoot);
        if (_cache is { } cached && cached.Key == revision) return cached.Items;
        if (eftRoot.Length == 0) return list;
        var mods = Path.Combine(eftRoot, "SPT_Runtime", "user", "mods");
        if (!Directory.Exists(mods)) return list;
        foreach (var mod in Directory.GetDirectories(mods))
        {
            var dirs = new[] { "CustomItems", "CustomQuestItems" }.Select(d => Path.Combine(mod, "db", d)).Where(Directory.Exists).ToList();
            if (QuestImages.RegistersMod(mod)) list.AddRange(VisitApiItems(mod));
            if (dirs.Count == 0) continue;
            var zh = Loc(mod, "ch"); var en = Loc(mod, "en"); var name = Path.GetFileName(mod);
            foreach (var f in dirs.SelectMany(d => Directory.GetFiles(d, "*.json", Recursive)))
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
                        name, Str(v, "itemTplToClone"),
                        v.TryGetProperty("overrideProperties", out var props) && props.ValueKind == JsonValueKind.Object ? props.Clone() : null,
                        Str(v, "parentId")));
                }
            }
        }
        _cache = (revision, list);
        return list;
    }

    /// <summary>VisitAPI 自己的物品：每个内容包的 <c>items\*.json</c>（老布局是 <c>db\items</c>），列表上标「模组/包」。</summary>
    static IEnumerable<ModItem> VisitApiItems(string mod)
    {
        foreach (var pack in PackLayout.Discover(mod))
        {
            var label = pack.IsLegacy ? Path.GetFileName(mod) : Path.GetFileName(mod) + "/" + pack.Name;
            foreach (var file in PackLayout.DataFiles(pack, "items"))
            {
                JsonDocument doc;
                try { doc = JsonDocument.Parse(JsonBytes.Read(file), Lenient); } catch { continue; }
                using (doc)
                {
                    if (doc.RootElement.ValueKind != JsonValueKind.Object) continue;
                    foreach (var entry in doc.RootElement.EnumerateObject())
                    {
                        var value = entry.Value;
                        if (!QuestValidator.IsMongoId(entry.Name) || value.ValueKind != JsonValueKind.Object ||
                            !value.TryGetProperty("template", out var tpl) || tpl.ValueKind != JsonValueKind.Object) continue;
                        var hb = value.TryGetProperty("handbook", out var h) && h.ValueKind == JsonValueKind.Object ? h : default;
                        var price = hb.ValueKind == JsonValueKind.Object && hb.TryGetProperty("price", out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetDouble(out var amount)
                            ? (int)Math.Clamp(amount, 0, int.MaxValue) : 0;
                        string Name(string lang) => value.TryGetProperty("locales", out var ls) && ls.ValueKind == JsonValueKind.Object
                            && ls.TryGetProperty(lang, out var l) && l.ValueKind == JsonValueKind.Object ? Str(l, "Name") : "";
                        yield return new(entry.Name, Str(hb, "parentId"), Name("ch"), Name("en"), price, label, "",
                            tpl.TryGetProperty("_props", out var props) && props.ValueKind == JsonValueKind.Object ? props.Clone() : null,
                            Str(tpl, "_parent"), tpl.Clone());
                    }
                }
            }
        }
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
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
