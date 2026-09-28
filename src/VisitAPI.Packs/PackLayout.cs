#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace VisitAPI.Packs;

/// <summary>
/// 内容包（2026-09-23 SORA 定「一个包 = 一个文件夹」）：`SPT_Runtime\user\mods\VisitAPI-Server\packs\&lt;包名&gt;\`，
/// 包里直接放 quests\ locales\ dialogues\ zones\ items\ loot\ variables\ images\ bundles\ + bundles.json + pack.json（+ LICENSE）；
/// 1.3.4 起还有 traders\&lt;商人id&gt;\（base.json + avatar.png，见 TraderDirs）和 voice\&lt;商人id&gt;\（无房间商人的台词语音，插件服务端 VoiceLoader 读）。
/// 老布局（DLL 旁边的 db\ + images\ + bundles\）当成一个叫「(db)」的包照读，IsLegacy = true。
/// 这份源码被插件服务端链源码编进去（VisitAPI-Server.csproj）也被编辑器用（VisitAPI.Quests.csproj）：什么算一个包只有这一处定义。
/// </summary>
public sealed class PackInfo
{
    public string Name = "";                 // 文件夹名（唯一标识）；pack.json 里的 name 只做显示
    public string Folder = "";               // 包文件夹；老布局 = 模组根目录
    public bool IsLegacy;
    public string Version = "";              // pack.json: version（语义版本，发 Forge 时和 zip 名一致）
    public string Requires = "";             // pack.json: requires（要哪个 VisitAPI：~1.3.3 / ^1.3.3 / >=1.3.3 / 1.3.3 / 空）
    public string Author = "";
    public Dictionary<string, string> Description = new();   // 语言 → 说明（pack.json 的 description 可以是字符串或 {ch:…, en:…}）
    public List<string> Needs = new();       // 建议一起装的包（只用来提示，不拦）
    public string? Error;                    // pack.json 读不动 / 没有时的原因
    public string Label => IsLegacy ? "(db)" : Version.Length > 0 ? Name + " " + Version : Name;
}

public static class PackLayout
{
    public const string PacksDir = "packs", LegacyDb = "db", PackJson = "pack.json";
    public static readonly string[] DataKinds = { "quests", "locales", "dialogues", "zones", "items", "loot", "variables" };

    /// <summary>包内图片格 → 1.1 的路由段（客户端和任务文件里的地址不变）：`images\banners` = 横幅（任务 image 字段，`/files/quest/icon/…`），
    /// `images\icons` = 章节图标（visitapi.icon，`/files/quest/chapters_icon/…`）。别的子目录按名字当路由段；`images\quest\&lt;子目录&gt;` 老名字照认。</summary>
    static readonly Dictionary<string, string> ImageRoutes = new(StringComparer.OrdinalIgnoreCase) { ["banners"] = "icon", ["icons"] = "chapters_icon" };
    public static string RouteOf(string folderName) => ImageRoutes.TryGetValue(folderName, out var r) ? r : folderName;
    /// <summary>反过来：路由段 → 推荐的包内文件夹名（编辑器新建 / 搬家用）。</summary>
    public static string FolderOf(string route) => ImageRoutes.FirstOrDefault(kv => kv.Value.Equals(route, StringComparison.OrdinalIgnoreCase)).Key ?? route;

    /// <summary>找包：packs\* 按名字排序各一个，然后老的 db\（在的话）。空列表 = 没有内容。</summary>
    public static IReadOnlyList<PackInfo> Discover(string modDir)
    {
        var list = new List<PackInfo>();
        var packs = Path.Combine(modDir, PacksDir);
        if (Directory.Exists(packs))
            foreach (var dir in Directory.GetDirectories(packs).OrderBy(d => Path.GetFileName(d), StringComparer.OrdinalIgnoreCase))
                list.Add(Read(dir));
        if (Directory.Exists(Path.Combine(modDir, LegacyDb)))
            list.Add(new PackInfo { Name = "(db)", Folder = modDir, IsLegacy = true });
        return list;
    }

    public static PackInfo Read(string dir)
    {
        var p = new PackInfo { Name = Path.GetFileName(dir), Folder = dir };
        var file = Path.Combine(dir, PackJson);
        if (!File.Exists(file)) { p.Error = "没有 pack.json"; return p; }
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllBytes(file), new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
            var o = doc.RootElement;
            p.Version = Str(o, "version"); p.Requires = Str(o, "requires"); p.Author = Str(o, "author");
            if (o.TryGetProperty("description", out var d))
            {
                if (d.ValueKind == JsonValueKind.String) p.Description["en"] = d.GetString() ?? "";
                else if (d.ValueKind == JsonValueKind.Object)
                    foreach (var kv in d.EnumerateObject()) if (kv.Value.ValueKind == JsonValueKind.String) p.Description[kv.Name] = kv.Value.GetString() ?? "";
            }
            if (o.TryGetProperty("needs", out var n) && n.ValueKind == JsonValueKind.Array)
                foreach (var x in n.EnumerateArray()) if (x.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(x.GetString())) p.Needs.Add(x.GetString()!);
        }
        catch (Exception e) { p.Error = "pack.json 读不动：" + e.Message; }
        return p;
    }

    static string Str(JsonElement o, string key) => o.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? (v.GetString() ?? "").Trim() : "";

    /// <summary>数据子目录（DataKinds 之一）：包内直接一层；老布局在 db\ 下。</summary>
    public static string DataDir(PackInfo p, string kind) => p.IsLegacy ? Path.Combine(p.Folder, LegacyDb, kind) : Path.Combine(p.Folder, kind);

    /// <summary>该子目录下的文件，按名字排序（Directory.GetFiles 的顺序不保证，而「先来的赢」得是确定的）。</summary>
    public static string[] DataFiles(PackInfo p, string kind, string pattern = "*.json")
    {
        var dir = DataDir(p, kind);
        return Directory.Exists(dir) ? Directory.GetFiles(dir, pattern).OrderBy(f => f, StringComparer.OrdinalIgnoreCase).ToArray() : Array.Empty<string>();
    }

    public static string BundlesDir(PackInfo p) => Path.Combine(p.Folder, "bundles");

    /// <summary>商人（09-23，1.1 的无房间商人）：`traders\&lt;商人id&gt;\base.json` + `avatar.png`，一个文件夹一位；老布局在 db\traders\。按名字排序。</summary>
    public static string[] TraderDirs(PackInfo p)
    {
        var dir = p.IsLegacy ? Path.Combine(p.Folder, LegacyDb, "traders") : Path.Combine(p.Folder, "traders");
        return Directory.Exists(dir) ? Directory.GetDirectories(dir).OrderBy(d => d, StringComparer.OrdinalIgnoreCase).ToArray() : Array.Empty<string>();
    }
    public static string BundlesManifest(PackInfo p) => p.IsLegacy ? Path.Combine(p.Folder, LegacyDb, "bundles.json") : Path.Combine(p.Folder, "bundles.json");

    /// <summary>图片格：(路由段, 目录)。看 `images\*` 和 `images\quest\*` 两层，后者是老名字 / 原样搬进来的包。</summary>
    public static IEnumerable<(string route, string dir)> ImageFolders(PackInfo p)
    {
        var images = Path.Combine(p.Folder, "images");
        foreach (var root in new[] { images, Path.Combine(images, "quest") })
        {
            if (!Directory.Exists(root)) continue;
            foreach (var dir in Directory.GetDirectories(root).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                var name = Path.GetFileName(dir);
                if (root == images && name.Equals("quest", StringComparison.OrdinalIgnoreCase)) continue;
                yield return (RouteOf(name), dir);
            }
        }
    }

    /// <summary>版本要求：`~1.3.3`（≥ 且同一小版本）、`^1.3.3`（≥ 且同一大版本）、`>=1.3.3`、`1.3.3`（精确）、空 / * = 不限。写得不像版本号就不拦。</summary>
    public static bool Satisfies(string requires, string version)
    {
        requires = (requires ?? "").Trim();
        if (requires.Length == 0 || requires == "*") return true;
        var op = requires.StartsWith(">=") ? ">=" : requires.StartsWith("~") ? "~" : requires.StartsWith("^") ? "^" : "=";
        var want = Parts(requires.TrimStart('>', '=', '~', '^', ' '));
        var have = Parts(version ?? "");
        if (want == null || have == null) return true;
        var cmp = Compare(have, want);
        return op switch
        {
            "=" => cmp == 0,
            ">=" => cmp >= 0,
            "~" => cmp >= 0 && have[0] == want[0] && have[1] == want[1],
            _ => cmp >= 0 && have[0] == want[0],
        };
    }

    static int[]? Parts(string s)
    {
        var p = s.Split('+')[0].Split('-')[0].Split('.');
        if (p.Length < 1 || p.Length > 3) return null;
        var r = new int[3];
        for (var i = 0; i < 3; i++) { if (i >= p.Length) continue; if (!int.TryParse(p[i], out r[i])) return null; }
        return r;
    }

    static int Compare(int[] a, int[] b) { for (var i = 0; i < 3; i++) if (a[i] != b[i]) return a[i].CompareTo(b[i]); return 0; }
}
