namespace VisitAPI.Server;

/// <summary>
/// 内容库（BOT 外观 / 商人货架住的那个模组 db 目录）的选择接口。
///
/// 自动探测的规矩（Tech Leader 2026-08-10 定）：
/// <list type="bullet">
/// <item>**恰好 1 个** → 直接用，不打扰人（在 <c>Program</c> 启动时就选好了）</item>
/// <item>**2 个以上** → 界面弹窗让作者挑</item>
/// <item>**一个都没有** → 界面让作者自己填路径</item>
/// </list>
/// 探测按**标志目录**认，不按模组名认 —— 写死名字只对一个人有用，
/// 而 <c>CustomBotLoadouts</c> / <c>assort.json</c> / <c>CustomClothing</c> 这些约定是 WTT 定的，
/// 任何照它写的模组（包括作者自己新建的）都会被认出来。见 <see cref="Quests.ModLooks.ScanRoots"/>。
/// </summary>
public static class ModsApi
{
    /// <summary>没定内容库时给界面的回包：带上候选，界面照着弹窗或让人填路径。</summary>
    public static object NeedPick(Workspace ws)
    {
        var found = ws.ScanModRoots();
        return new
        {
            ok = false,
            need = "pick",
            dir = ws.ModDb,
            eft = ws.EftRoot,
            found = found.Select(x => new { path = x.Path, mod = x.Mod, bots = x.Bots, assorts = x.Assorts, looks = x.Looks }),
        };
    }

    public static void Map(WebApplication app, Workspace ws)
    {
        app.MapGet("/api/mods", () => Results.Json(new
        {
            ok = ws.HasModDb,
            dir = ws.ModDb,
            eft = ws.EftRoot,
            found = ws.ScanModRoots().Select(x => new
            {
                path = x.Path, mod = x.Mod, bots = x.Bots, assorts = x.Assorts, looks = x.Looks,
            }),
        }));

        app.MapPost("/api/mods", (RootReq r) =>
            ws.SetModDb(r.Path)
                ? Results.Json(new { ok = true, dir = ws.ModDb })
                : Results.BadRequest(new { error = "bad_dir", path = r.Path }));
    }

    public sealed record RootReq(string Path);
}
