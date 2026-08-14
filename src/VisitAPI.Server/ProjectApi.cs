namespace VisitAPI.Server;

/// <summary>
/// 「工程」接口：把三个根（.dlg 工作区 / 任务库 / 内容库）打包成一份 <c>.vaproj</c>（键=值），一键切换。
///
/// 为什么要有它：三个根是三条独立的线（任务库和内容库还允许是不同模组），作者给多个模组干活时
/// 每次都要分别指路径，很容易"给 A 写任务、商人改在 B 头上"。工程文件把一套组合钉死成一份小文件。
///
/// 打开走**先全验、后应用**：SetRoot 要求目录已存在，而 SetQuestDb/SetModDb 会自动建目录——
/// 三连调用会出现"切了一半"的状态；而且工程打开多半是换机器/换盘符的场景，路径错了自动建
/// 只会建出一棵空树。所以三条有一条不在就整个不动、报哪条缺。
///
/// 最近列表存 <c>pref.recent.0..4</c>：visitapi-editor.txt 的陌生顶层键会被旧版 Save() 静默抹掉，
/// 只有 pref.* 能跨版本往返。
/// </summary>
public static class ProjectApi
{
    public static void Map(WebApplication app, Workspace ws)
    {
        app.MapGet("/api/project", () => Results.Json(new
        {
            ok = true,
            eft = ws.EftRoot,
            current = new { root = ws.Root, quests = ws.QuestDb, mods = ws.ModDb },
            recent = Recent(ws).Select(object (p) => new { path = p, name = NameOf(p), ok = File.Exists(p) }),
        }));

        app.MapPost("/api/project/save", (SaveReq r) =>
        {
            var path = (r.Path ?? "").Trim();
            if (!path.EndsWith(".vaproj", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "bad_path", path });
            // 三根不齐存出来就是残的，打开时必然报缺——不如存的时候就说清楚
            if (!ws.HasRoot || !ws.HasQuestDb || !ws.HasModDb)
                return Results.BadRequest(new { error = "roots_missing" });
            try
            {
                var full = Path.GetFullPath(path);
                var dir = Path.GetDirectoryName(full);
                if (string.IsNullOrEmpty(dir)) return Results.BadRequest(new { error = "bad_path", path });
                Directory.CreateDirectory(dir);
                if (File.Exists(full)) File.Copy(full, full + ".bak", true);   // 全站口径：覆盖前留一代
                var name = (r.Name ?? "").Trim();
                if (name.Length == 0) name = Path.GetFileNameWithoutExtension(full);
                File.WriteAllLines(full, new[] { "name=" + name, "root=" + ws.Root, "quests=" + ws.QuestDb, "mods=" + ws.ModDb });
                Remember(ws, full);
                return Results.Json(new { ok = true, path = full, name });
            }
            catch (Exception e) { return Results.BadRequest(new { error = "write_fail", detail = e.Message }); }
        });

        app.MapPost("/api/project/open", (OpenReq r) =>
        {
            string full;
            try { full = Path.GetFullPath((r.Path ?? "").Trim()); }
            catch { return Results.BadRequest(new { error = "bad_path", path = r.Path }); }
            if (!full.EndsWith(".vaproj", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "bad_path", path = r.Path });
            if (!File.Exists(full)) return Results.NotFound(new { error = "gone", path = full });

            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in File.ReadAllLines(full))
            {
                var i = raw.IndexOf('=');
                if (i > 0) d[raw.Substring(0, i).Trim()] = raw.Substring(i + 1).Trim();
            }
            var root = d.GetValueOrDefault("root", "");
            var quests = d.GetValueOrDefault("quests", "");
            var mods = d.GetValueOrDefault("mods", "");
            var missing = new List<string>();
            if (!Directory.Exists(root)) missing.Add("root");
            if (!Directory.Exists(quests)) missing.Add("quests");
            if (!Directory.Exists(mods)) missing.Add("mods");
            if (missing.Count > 0) return Results.BadRequest(new { error = "dir_missing", missing });

            ws.SetRoot(root);
            ws.SetQuestDb(quests);
            ws.SetModDb(mods);
            Remember(ws, full);
            return Results.Json(new
            {
                ok = true,
                name = d.GetValueOrDefault("name", Path.GetFileNameWithoutExtension(full)),
                root = ws.Root, quests = ws.QuestDb, mods = ws.ModDb,
            });
        });
    }

    static string[] Recent(Workspace ws) => Enumerable.Range(0, 5)
        .Select(i => ws.Prefs.TryGetValue("recent." + i, out var v) ? v : "")
        .Where(v => v.Length > 0).ToArray();

    /// <summary>去重置顶，最多留 5 条；空值＝把多余的槽位清掉。</summary>
    static void Remember(Workspace ws, string path)
    {
        var list = new[] { path }
            .Concat(Recent(ws).Where(p => !p.Equals(path, StringComparison.OrdinalIgnoreCase)))
            .Take(5).ToArray();
        for (var i = 0; i < 5; i++) ws.SetPref("recent." + i, i < list.Length ? list[i] : "");
    }

    /// <summary>列最近工程时把 name= 那行读出来当显示名；读不动就退回文件名。</summary>
    static string NameOf(string p)
    {
        try
        {
            foreach (var l in File.ReadAllLines(p))
                if (l.StartsWith("name=", StringComparison.OrdinalIgnoreCase)) return l.Substring(5).Trim();
        }
        catch { /* 文件坏了就用文件名，列表不因为一条烂档整个空掉 */ }
        return Path.GetFileNameWithoutExtension(p);
    }

    public sealed record SaveReq(string? Path, string? Name);
    public sealed record OpenReq(string? Path);
}
