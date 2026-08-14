using System.Text.Json;

namespace VisitAPI.Quests;

/// <summary>一个"内容库"候选：某个模组的 db 目录里有多少 BOT / 货架 / 外观内容。</summary>
public sealed record ModRoot(string Path, string Mod, int Bots, int Assorts, bool Looks);

/// <summary>
/// 扫这个模组自己注册的外观（WTT-CommonLib 的三个配置目录）。
///
/// SPT 那 728 条是游戏自带的，而模组加的那些**没有统一注册表**——它们只以配置文件的形式
/// 躺在模组的 db 里，等 WTT 在启动时灌进游戏。所以想让作者在编辑器里选到自己做的衣服，
/// 只能按 WTT 的约定去读这三个目录。
///
/// ⚠️ 三处的 <c>locales</c> 形状**不一样**，别想当然：
///   服装 → <c>{"en": {"name": "...", "description": "..."}}</c>（对象）
///   头/语音 → <c>{"en": "..."}</c>（直接是字符串）
/// </summary>
public static class ModLooks
{
    /// <summary>
    /// 扫出所有"放着 BOT 外观或商人货架"的模组 db 目录。
    ///
    /// **按标志目录认，不按模组名认。** 写死 "BinaryDimension" 之类的名字只对一个人有用，
    /// 而这些约定（<c>CustomBotLoadouts</c> / <c>assort.json</c> / <c>CustomClothing</c>…）
    /// 是 WTT-CommonLib 定的，任何照它写的模组都会被认出来 —— 包括作者自己新建的。
    ///
    /// WTT-ServerCommonLib 自己那份 db 只有 <c>CustomLocales</c>，不带任何一个标志，
    /// 所以不会被列成候选（列出来也没东西可编）。
    /// </summary>
    public static List<ModRoot> ScanRoots(string eftRoot)
    {
        var found = new List<ModRoot>();
        if (eftRoot.Length == 0) return found;
        var mods = System.IO.Path.Combine(eftRoot, "SPT_Runtime", "user", "mods");
        if (!Directory.Exists(mods)) return found;
        foreach (var m in Directory.GetDirectories(mods).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var db = System.IO.Path.Combine(m, "db");
            if (!Directory.Exists(db)) continue;
            var bots = Count(System.IO.Path.Combine(db, "CustomBotLoadouts"));
            var assorts = (File.Exists(System.IO.Path.Combine(db, "assort.json")) ? 1 : 0)
                        + Count(System.IO.Path.Combine(db, AssortDir));
            var looks = new[] { "CustomClothing", "CustomHeads", "CustomVoices" }
                .Any(d => Directory.Exists(System.IO.Path.Combine(db, d)));
            if (bots == 0 && assorts == 0 && !looks) continue;
            found.Add(new ModRoot(db, System.IO.Path.GetFileName(m), bots, assorts, looks));
        }
        // 内容多的排前面：作者八成想编的就是那个
        return found.OrderByDescending(x => x.Bots + x.Assorts).ToList();
    }

    const string AssortDir = "CustomAssortSchemes";
    static int Count(string dir) => Directory.Exists(dir) ? Directory.GetFiles(dir, "*.json").Length : 0;

    public static List<LookRow> Scan(string modDbDir)
    {
        var list = new List<LookRow>();
        if (modDbDir.Length == 0) return list;
        Clothing(Path.Combine(modDbDir, "CustomClothing"), list);
        Simple(Path.Combine(modDbDir, "CustomHeads"), "head", list);
        Simple(Path.Combine(modDbDir, "CustomVoices"), "voice", list);
        return list;
    }

    /// <summary>服装文件是**数组**，一条里可能同时带上装(top)、手(hands)、下装(bottom)。</summary>
    static void Clothing(string dir, List<LookRow> list)
    {
        foreach (var e in Roots(dir))
        {
            if (e.ValueKind != JsonValueKind.Array) continue;
            foreach (var c in e.EnumerateArray())
            {
                if (c.ValueKind != JsonValueKind.Object) continue;
                var (zh, en) = Loc(c, obj: true);
                Add(list, Str(c, "topId"), "body", zh, en);
                Add(list, Str(c, "handsId"), "hands", zh, en);
                Add(list, Str(c, "bottomId"), "feet", zh, en);
            }
        }
    }

    /// <summary>头和语音的文件是**字典**：<c>{"&lt;id&gt;": {…}}</c>。</summary>
    static void Simple(string dir, string slot, List<LookRow> list)
    {
        foreach (var e in Roots(dir))
        {
            if (e.ValueKind != JsonValueKind.Object) continue;
            foreach (var p in e.EnumerateObject())
            {
                if (p.Value.ValueKind != JsonValueKind.Object) continue;
                var (zh, en) = Loc(p.Value, obj: false);
                // 语音配置有个 name 字段，没写 locales 时拿它兜底
                var fb = Str(p.Value, "name");
                Add(list, p.Name, slot, zh.Length > 0 ? zh : fb, en.Length > 0 ? en : fb);
            }
        }
    }

    static void Add(List<LookRow> list, string id, string slot, string zh, string en)
    {
        if (id.Length == 0) return;
        list.Add(new LookRow(id, slot, zh.Length > 0 ? zh : id, en.Length > 0 ? en : id, "mod"));
    }

    /// <param name="obj">true = 服装那种 <c>{"en":{"name":…}}</c>；false = 头/语音那种 <c>{"en":"…"}</c></param>
    static (string Zh, string En) Loc(JsonElement e, bool obj)
    {
        if (!e.TryGetProperty("locales", out var l) || l.ValueKind != JsonValueKind.Object) return ("", "");
        return (Pick(l, "ch", obj), Pick(l, "en", obj));
    }

    static string Pick(JsonElement locales, string lang, bool obj)
    {
        if (!locales.TryGetProperty(lang, out var v)) return "";
        if (!obj) return v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        return v.ValueKind == JsonValueKind.Object ? Str(v, "name") : "";
    }

    /// <summary>目录里每个 json 的根元素。坏文件跳过——外观目录读不动不该让整个模块打不开。</summary>
    static IEnumerable<JsonElement> Roots(string dir)
    {
        if (!Directory.Exists(dir)) yield break;
        foreach (var f in Directory.GetFiles(dir, "*.json").OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            JsonDocument? doc = null;
            try { doc = JsonDocument.Parse(JsonBytes.Read(f)); } catch { }
            if (doc == null) continue;
            using (doc) yield return doc.RootElement.Clone();
        }
    }

    static string Str(JsonElement e, string k) =>
        e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
