using System.Text.Json.Nodes;
using VisitAPI.Quests;

namespace VisitAPI.Server;

/// <summary>
/// 商人货架的接口。和 bot 外观一样住在 <c>&lt;某个mod&gt;\db</c> 这个根下面。
/// </summary>
public static class AssortApi
{
    /// <summary>
    /// items.json 有 18.7MB，每个请求重解一次会明显卡。按路径缓存住，换游戏目录才重建。
    /// 路径和实例整体换掉，免得并发请求把两者配错对。
    /// </summary>
    static (string Path, ItemIndex Index)? _idx;
    static ItemIndex Idx(Workspace ws)
    {
        var cur = _idx;
        if (cur is { } c && c.Path == ws.SptData) return c.Index;
        var made = (ws.SptData, new ItemIndex(ws.SptData));
        _idx = made;
        return made.Item2;
    }

    /// <summary>
    /// <see cref="SptData"/> 也缓存住：它内部按 tpl 建了名字表和图标表，
    /// 每个请求 new 一个的话那两张表每次都要重建（handbook.json + 两份 2.8MB 全局文案）。
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
        app.MapGet("/api/assort", () =>
        {
            if (!ws.HasModDb) return Results.Json(ModsApi.NeedPick(ws));
            var store = Load(ws);
            return Results.Json(new
            {
                ok = true,
                dir = ws.ModDb,
                stamp = Stamp(ws),
                files = store.Files.OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
                                   .ToDictionary(x => x.Key, x => (JsonNode?)x.Value),
                // 货架上用到的那些 tpl 的展示信息：名字 / 占格 / 分类图标。
                // **只送用到的那几十条**，不是整张 4288 件的表 —— 那张表另有 /api/quests/items 给选择器用。
                tpls = TplRows(ws, store),
                // 摊平后的视图：一条 = 一个商人的一份货架，界面直接照着列
                schemes = store.All().Select(a => new
                {
                    file = a.File, kind = a.Kind, trader = a.TraderKey,
                    count = AssortStore.Roots(a.Scheme).Count,
                }),
                baseTrader = store.BaseTraderId(),
                issues = AssortValidator.Run(store, Idx(ws)),
            });
        });

        // 某个 tpl 的容器信息：界面选中商品后要知道"这是不是容器、能装什么、装几个"
        app.MapGet("/api/assort/tpl", (string? id) =>
        {
            var def = id == null ? null : Idx(ws).Get(id);
            if (def == null) return Results.Json(new { ok = false });
            return Results.Json(new
            {
                ok = true,
                id = def.Id, name = def.Name, parent = def.Parent,
                stack = def.Stack.Select(s => new { s.Name, s.Max, filter = s.Filter }),
                mods = def.Mods.Select(s => new { s.Name, s.Required }),
            });
        });

        app.MapPost("/api/assort", (SaveReq r) => Save(ws, r));

        // 分类图标的字节。**不能挂在 /api 下面**：那道闸门要 X-Token 头，而 <img src> 发不了自定义头，
        // 所以和 /media、/look 一样把令牌走查询串。只收裸文件名，路径在服务端拼（见 SptData.IconPath）。
        app.MapGet("/hbimg", (string? name, string? t) =>
        {
            if (t != ws.Token) return Results.StatusCode(403);
            var full = Spt(ws).IconPath(name ?? "");
            return full == null ? Results.NotFound() : Results.File(full, "image/png");
        });

        // 商人头像的字节。同样走查询串带令牌（<img src> 发不了自定义头）。
        app.MapGet("/avimg", (string? id, string? t) =>
        {
            if (t != ws.Token) return Results.StatusCode(403);
            var full = AvatarPath(ws, id ?? "");
            if (full == null) return Results.NotFound();
            var png = full.EndsWith(".png", StringComparison.OrdinalIgnoreCase);
            return Results.File(full, png ? "image/png" : "image/jpeg");
        });
    }

    /// <summary>
    /// 商人头像在硬盘上的位置，先自制后原版：
    ///
    /// <list type="number">
    /// <item><b>作者自己那张</b> —— base.json 的 <c>avatar</c> 写的是一条**网址**
    ///   （SORA 那份是 <c>/files/trader/avatar/SORA.png</c>），真图另放在模组的 <c>res\</c> 底下，
    ///   两边只有**文件名**对得上，所以拿文件名去几个常见目录里挨个找。
    ///   只在问的正是这个模组自己的商人时才认，不然一份 WTT 多商人清单里
    ///   别人的头像也会被顶成这张。</item>
    /// <item><b>SPT 自带的 12 张</b> —— 文件名就是商人 id。</item>
    /// </list>
    ///
    /// 都没有就返回 null（自定义商人多半属于这一档），界面退回剪影，不留空框。
    /// </summary>
    static string? AvatarPath(Workspace ws, string id)
    {
        var mine = ModAvatar(ws, id);
        return mine ?? Spt(ws).TraderAvatar(id);
    }

    static string? ModAvatar(Workspace ws, string id)
    {
        if (id.Length == 0 || !ws.HasModDb) return null;
        var (baseId, avatar) = BaseInfo(ws);
        if (baseId != id || avatar.Length == 0) return null;
        // avatar 是网址不是路径，只取最后一段当文件名，顺手把目录穿越掐掉
        var name = Path.GetFileName(avatar.Replace('\\', '/'));
        if (name.Length == 0 || name.Contains("..")) return null;
        if (!name.EndsWith(".png", StringComparison.OrdinalIgnoreCase) &&
            !name.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)) return null;
        var root = Path.GetDirectoryName(Path.GetFullPath(ws.ModDb));   // <模组>\db 的上一层
        if (root == null) return null;
        foreach (var sub in new[] { "res", "images", "" })
        {
            var p = Path.Combine(root, sub, name);
            if (File.Exists(p)) return p;
        }
        return null;
    }

    /// <summary>模组自己那份 base.json 里的 <c>_id</c> 和 <c>avatar</c>。读不到就两个空串。</summary>
    static (string Id, string Avatar) BaseInfo(Workspace ws)
    {
        var p = Path.Combine(ws.ModDb, "base.json");
        if (!File.Exists(p)) return ("", "");
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(JsonBytes.Read(p));
            var r = doc.RootElement;
            return (Str(r, "_id"), Str(r, "avatar"));
        }
        catch { return ("", ""); }

        static string Str(System.Text.Json.JsonElement o, string k) =>
            o.TryGetProperty(k, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String
                ? v.GetString() ?? "" : "";
    }

    /// <summary>货架里出现过的每个 tpl 一行：中英名、占格、分类图标文件名。</summary>
    static object[] TplRows(Workspace ws, AssortStore store)
    {
        var spt = Spt(ws);
        var idx = Idx(ws);
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var a in store.All())
            foreach (var it in AssortStore.Items(a.Scheme))
            {
                var tpl = it["_tpl"]?.GetValue<string>();
                if (!string.IsNullOrEmpty(tpl)) ids.Add(tpl);
            }
        return ids.Select(id =>
        {
            var row = spt.ItemOf(id);
            var def = idx.Get(id);
            return (object)new
            {
                id,
                // 文案缺了就退回模板内部名（wild_head_3 这种反而好搜），别只显示一串十六进制
                zh = Pick(row?.Zh, def?.Name, id),
                en = Pick(row?.En, def?.Name, id),
                w = def?.W ?? 1, h = def?.H ?? 1,
                icon = spt.IconOf(id),
                box = idx.IsStackBox(id),           // 弹药盒那种"买了必须带货"的容器
            };
        }).ToArray();
    }

    /// <summary>取第一个非空白的。原版大量文案键"在但值是空串"，所以不能用 ?? 。</summary>
    static string Pick(params string?[] xs) =>
        xs.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)) ?? "";

    static AssortStore Load(Workspace ws) { var s = new AssortStore(ws.ModDb); s.Load(); return s; }

    static string Stamp(Workspace ws)
    {
        var files = new List<string>();
        var single = Path.Combine(ws.ModDb, "assort.json");
        if (File.Exists(single)) files.Add(single);
        var dir = Path.Combine(ws.ModDb, AssortStore.WttDir);
        if (Directory.Exists(dir)) files.AddRange(Directory.GetFiles(dir, "*.json"));
        return string.Join("|", files.OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .Select(f => $"{Path.GetFileName(f)}:{new FileInfo(f).LastWriteTimeUtc.Ticks}"));
    }

    static IResult Save(Workspace ws, SaveReq r)
    {
        if (!ws.HasModDb) return Results.BadRequest(new { error = "no_mod_db", dir = ws.ModDb });
        if (!r.Force && r.Stamp != null && r.Stamp != Stamp(ws))
            return Results.Json(new { error = "stale" }, statusCode: 409);

        var store = Load(ws);
        foreach (var (name, content) in r.Files ?? [])
        {
            if (Bad(ws, name)) return Results.BadRequest(new { error = "bad_name", name });
            store.Files[name] = content;
        }
        foreach (var name in (r.Files ?? []).Keys) store.SaveFile(name);

        var fresh = Load(ws);
        return Results.Json(new { ok = true, stamp = Stamp(ws), issues = AssortValidator.Run(fresh, Idx(ws)) });
    }

    /// <summary>只收两种落点：根下的 assort.json，或 CustomAssortSchemes 里的 .json。别的一律拒。</summary>
    static bool Bad(Workspace ws, string name)
    {
        if (!name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) return true;
        if (name.Equals("assort.json", StringComparison.OrdinalIgnoreCase)) return false;
        if (!name.StartsWith(AssortStore.WttDir + "/", StringComparison.OrdinalIgnoreCase)) return true;
        var leaf = name[(AssortStore.WttDir.Length + 1)..];
        return leaf.Contains('/') || leaf.Contains('\\') ||
               ws.ResolveMod(Path.Combine(AssortStore.WttDir, leaf)) == null;
    }

    public sealed record SaveReq(string? Stamp, bool Force, Dictionary<string, JsonObject>? Files);
}
