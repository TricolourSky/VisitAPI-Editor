using System.Text.Json.Nodes;
using VisitAPI.Quests;

namespace VisitAPI.Server;

/// <summary>
/// BOT 外观的接口。
///
/// 用的是**内容库** <see cref="Workspace.ModDb"/>，和任务库各走各的 ——
/// 作者可能给 A 模组写任务、同时编 B 模组的 BOT 外观，共用一个的话切哪边都会拖走另一边。
/// 令牌闸门和路径牢笼沿用 FileApi 那一套，不另开口子。
/// </summary>
public static class BotApi
{
    /// <summary>
    /// 外观目录要解析 728 条 customization ＋ 两份 2.8MB 全局文案，
    /// 每个请求重建一次会明显卡。按（SPT 路径 + 模组路径）缓存，换目录才重建。
    /// 路径和实例整体换掉，免得并发请求把两者配错对。
    /// </summary>
    static (string Key, Customization Cat)? _cat;
    static Customization Cat(Workspace ws)
    {
        var key = ws.SptData + "|" + ws.ModDb;
        if (_cat is { } c && c.Key == key) return c.Cat;
        var made = (key, new Customization(ws.SptData, ws.ModDb));
        _cat = made;
        return made.Item2;
    }

    /// <summary>
    /// <see cref="SptData"/> 也要缓存住。它内部按 bot 类型缓存原版 appearance，
    /// 每个请求 new 一个的话那层缓存等于不存在，「恢复默认」每点一次都要重读 0.27MB。
    /// </summary>
    static (string Key, SptData Spt)? _spt;
    static SptData Spt(Workspace ws)
    {
        if (_spt is { } s && s.Key == ws.SptData) return s.Spt;
        var made = (ws.SptData, new SptData(ws.SptData));
        _spt = made;
        return made.Item2;
    }

    public static void Map(WebApplication app, Workspace ws)
    {
        app.MapGet("/api/bots", () =>
        {
            if (!ws.HasModDb) return Results.Json(ModsApi.NeedPick(ws));
            var looks = Load(ws);
            var spt = Spt(ws);
            var types = spt.Ok ? spt.BotTypes() : [];
            return Results.Json(new
            {
                ok = true,
                dir = looks.Dir,
                stamp = Stamp(ws),
                files = looks.Files.OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
                                   .ToDictionary(x => x.Key, x => (JsonNode?)x.Value),
                botTypes = types,                       // 新建时从这里挑，防止拼错名字
                // 衣柜里能挑的东西 = **只有作者自己做的**。
                // SPT 自带那 456 条不往前端送：界面不列它们，送过去只是白白撑大响应。
                wear = ModWear.Scan(ws.ModDb),
                slots = Customization.Slots,
                // 已经放了预览图的 id（外观 id 和 bot 类型名混在一起，两者不可能撞名）。
                // 界面拿它决定"画图还是画色块"，省得每张缩略图都去撞一次 404
                previews = Previews.Have(ws.ModDb),
                previewDir = Path.Combine(ws.ModDb, Previews.Dir),
                issues = BotLookValidator.Run(looks, Cat(ws), types),
            });
        });

        app.MapPost("/api/bots", (SaveReq r) => Save(ws, r));

        // 「恢复默认」要用的**原版**服装池。
        // 用到才拉：57 个类型全塞进 /api/bots 要读十几 MB，而一次只可能恢复一个 bot。
        app.MapGet("/api/bots/default", (string? type) =>
        {
            var t = (type ?? "").Trim().ToLowerInvariant();
            var spt = Spt(ws);
            // **「游戏数据没找到」和「游戏里没这个 bot」是两件事，不能报同一句。**
            // 混成一句的话，作者会以为是自己 bot 名字写错了，跑去改一个本来没错的东西。
            if (!spt.Ok) return Results.Json(new { ok = false, error = "no_spt_data", type = t });
            var ap = spt.BotAppearance(t);
            return ap == null
                ? Results.Json(new { ok = false, error = "no_spt_bot", type = t })
                : Results.Json(new { ok = true, type = t, appearance = ap });
        });

        // 预览图的字节。**不能挂在 /api 下面**：那道闸门要 X-Token 头，而 <img src> 发不了自定义头，
        // 所以和 /media、/qimg 一样把令牌走查询串。只收裸 id，路径在服务端拼（见 Previews.Resolve）。
        app.MapGet("/look", (string? id, string? t) =>
        {
            if (t != ws.Token) return Results.StatusCode(403);
            var full = Previews.Resolve(ws.ModDb, id ?? "");
            return full == null ? Results.NotFound() : Results.File(full, Previews.Mime(full));
        });
    }

    static BotLookStore Load(Workspace ws)
    {
        var s = new BotLookStore(ws.ModDb); s.Load(); return s;
    }

    /// <summary>盘上这批文件的指纹（文件名 + 修改时间），拿来做乐观锁。和任务那边同一套。</summary>
    static string Stamp(Workspace ws)
    {
        var dir = Path.Combine(ws.ModDb, "CustomBotLoadouts");
        if (!Directory.Exists(dir)) return "";
        return string.Join("|", Directory.GetFiles(dir, "*.json")
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .Select(f => $"{Path.GetFileName(f)}:{new FileInfo(f).LastWriteTimeUtc.Ticks}"));
    }

    static IResult Save(Workspace ws, SaveReq r)
    {
        if (!ws.HasModDb) return Results.BadRequest(new { error = "no_mod_db", dir = ws.ModDb });
        if (!r.Force && r.Stamp != null && r.Stamp != Stamp(ws))
            return Results.Json(new { error = "stale" }, statusCode: 409);

        var looks = Load(ws);
        foreach (var (name, content) in r.Files ?? [])
        {
            if (Bad(ws, name)) return Results.BadRequest(new { error = "bad_name", name });
            looks.Files[name] = content;
        }
        // 只写这次送来的文件；盘上有、请求里没有的不动。
        // 删一个 bot 配置靠**明确送一份空的 appearance**（见 BotLookStore.SaveFile），不靠"没发过来"推断。
        foreach (var name in (r.Files ?? []).Keys) looks.SaveFile(name);

        var fresh = Load(ws);
        var spt = Spt(ws);
        return Results.Json(new
        {
            ok = true,
            stamp = Stamp(ws),
            files = fresh.Files.Keys.OrderBy(x => x, StringComparer.OrdinalIgnoreCase),
            issues = BotLookValidator.Run(fresh, Cat(ws), spt.Ok ? spt.BotTypes() : []),
        });
    }

    /// <summary>文件名不许带目录、不许 <c>..</c> 出去、必须是 .json。</summary>
    static bool Bad(Workspace ws, string name) =>
        name.Contains('/') || name.Contains('\\') ||
        !name.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ||
        ws.ResolveMod(Path.Combine("CustomBotLoadouts", name)) == null;

    public sealed record SaveReq(string? Stamp, bool Force, Dictionary<string, JsonObject>? Files);
}
