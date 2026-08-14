namespace VisitAPI.Server;

/// <summary>
/// 「还原备份」的接口（SEC.06 那一页的后端）。
///
/// 编辑器每次覆盖 / 删除文件前都会留一份同名 <c>.bak</c>（原名 + ".bak"，只留最近一代），
/// 写点散在六处：.dlg 保存、.dlg 挂任务、任务、文案、BOT 服装、货架。这里只做两件事：
/// 把它们扫出来列给界面；把某一份**和现役文件对调**。
///
/// 对调而不是覆盖 —— 还原完 .bak 里存的是刚被换下来的那份，点错了再点一次就回去了
/// （「不默默覆盖」的老口径在这页的形态）。现役文件已经不在的（删除前留的那份），
/// 还原＝把文件搬回来＝复活，备份随之用掉。
/// </summary>
public static class BackupApi
{
    /// <summary>每个区的目录和后缀。目录拿不到（工作区 / 任务库 / 内容库没设置）就是 null，界面据此解释"为什么空"。</summary>
    static (string? Dir, string Suffix)? Area(Workspace ws, string a) => a switch
    {
        "dlg"    => (ws.HasRoot    ? ws.Root : null, ".dlg.bak"),
        "quest"  => (ws.HasQuestDb ? Path.Combine(ws.QuestDb, "quests") : null, ".json.bak"),
        "locale" => (ws.HasQuestDb ? Path.Combine(ws.QuestDb, "locales") : null, ".json.bak"),
        "bot"    => (ws.HasModDb   ? Path.Combine(ws.ModDb, "CustomBotLoadouts") : null, ".json.bak"),
        // assort.json 就住在内容库根上；只认它自己，别把根下别的 .bak 一起捞进来
        "assort" => (ws.HasModDb   ? ws.ModDb : null, "assort.json.bak"),
        "scheme" => (ws.HasModDb   ? Path.Combine(ws.ModDb, "CustomAssortSchemes") : null, ".json.bak"),
        _ => null,
    };

    static readonly string[] Areas = { "dlg", "quest", "locale", "bot", "assort", "scheme" };

    public static void Map(WebApplication app, Workspace ws)
    {
        app.MapGet("/api/backup", () => Results.Json(new
        {
            ok = true,
            roots = new { root = ws.HasRoot, quest = ws.HasQuestDb, mod = ws.HasModDb },
            areas = Areas.ToDictionary(a => a, a => List(Area(ws, a)!.Value)),
        }));

        app.MapPost("/api/backup/restore", (RestoreReq r) =>
        {
            if (Area(ws, r.Area ?? "") is not { } ar) return Results.BadRequest(new { error = "bad_area", area = r.Area });
            if (ar.Dir == null) return Results.BadRequest(new { error = "no_dir", area = r.Area });
            var name = r.Name ?? "";
            // 文件名不许带目录、必须以本区的后缀收尾 —— 和兄弟接口同一套牢笼，不开新口子
            if (name.Contains('/') || name.Contains('\\') ||
                !name.EndsWith(ar.Suffix, StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "bad_name", name });
            var full = Path.Combine(ar.Dir, name);
            if (!File.Exists(full)) return Results.NotFound(new { error = "gone", name });

            var live = full[..^4];                       // 去掉 ".bak"
            if (!File.Exists(live))                      // 现役已删：搬回来＝复活，备份随之用掉
            {
                File.Move(full, live);
                return Results.Json(new { ok = true, revived = true });
            }
            var tmp = live + ".swap";                    // 三步对调；上次中途崩掉留下的残件先清掉
            if (File.Exists(tmp)) File.Delete(tmp);
            File.Move(live, tmp);
            File.Move(full, live);
            File.Move(tmp, full);
            return Results.Json(new { ok = true, revived = false });
        });
    }

    static object[] List((string? Dir, string Suffix) a) =>
        a.Dir == null || !Directory.Exists(a.Dir) ? Array.Empty<object>() :
        Directory.GetFiles(a.Dir, "*" + a.Suffix)
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .Select(object (f) => new
            {
                name = Path.GetFileName(f),
                time = File.GetLastWriteTimeUtc(f),
                live = File.Exists(f[..^4]),
            }).ToArray();

    public sealed record RestoreReq(string? Area, string? Name);
}
