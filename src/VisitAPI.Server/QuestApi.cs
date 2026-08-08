using System.Text.Json.Nodes;
using VisitAPI.Quests;

namespace VisitAPI.Server;

/// <summary>
/// 任务相关的接口。
///
/// 任务和 .dlg 不住在一起（见 Workspace 的注释），所以这里用的是 QuestDb 那个根。
/// 令牌闸门和路径牢笼沿用 FileApi 那一套，不另开口子。
/// </summary>
public static class QuestApi
{
    /// <summary>
    /// SPT_Data 只读且不小（两份全局文案各 2.8MB + 物品表 527KB），
    /// 每个请求 new 一个等于每次重解析一遍。按路径缓存住，换工作区才重建。
    /// </summary>
    /// 路径和实例放同一个字段里整体换掉，免得两个请求同时进来把两者配错对。
    static (string Path, SptData Data)? _spt;
    static SptData Spt(Workspace ws)
    {
        var cur = _spt;
        if (cur is { } c && c.Path == ws.SptData) return c.Data;
        var made = (ws.SptData, new SptData(ws.SptData));
        _spt = made;
        return made.Item2;
    }

    static HashSet<string> TraderIds(SptData spt) =>
        (spt.Ok ? spt.Traders().Select(t => t.Id) : []).ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// SPT 自带 + 自定义（mod 的 db\traders / .dlg 的 trader 行 / 现有任务里用过的）。
    /// 只列自带的话，用了自定义商人的作者在界面上只能看到"未知商人"，连改都改不了。
    /// source 一并带出去，界面要靠它提醒"这个不一定是真商人"。
    /// </summary>
    static (object[] List, HashSet<string> Known) AllTraders(Workspace ws, SptData spt, QuestStore quests)
    {
        var sptList = spt.Ok ? spt.Traders() : [];
        var sptIds = sptList.Select(t => t.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var used = quests.All().Select(x => Str(x.Quest, "traderId")).Where(s => s.Length > 0);
        var custom = CustomTraders.Scan(ws.EftRoot, ws.Root, used, sptIds);

        var list = sptList.Select(object (t) => new { id = t.Id, zh = t.Zh, en = t.En, source = "spt", from = "" })
            .Concat(custom.Select(object (c) => new
            {
                id = c.Id,
                zh = c.Zh.Length > 0 ? c.Zh : c.Id[..Math.Min(8, c.Id.Length)],
                en = c.En.Length > 0 ? c.En : c.Id[..Math.Min(8, c.Id.Length)],
                source = c.Source, from = c.From,
            })).ToArray();

        // "确实找得到"的 = SPT 自带 + mod 注册的 + **作者手动确认过的**。
        // 最后那一类不能少：给还没装 / 还没适配当前 SPT 版本的商人 mod 写任务是正常作法，
        // 光凭"这台机器上扫不到"就一直报警，只会把作者训练成无视所有警告。
        var known = sptIds;
        foreach (var c in custom.Where(x => x.Source == "mod")) known.Add(c.Id);
        foreach (var t in ws.KnownTraders) known.Add(t);
        return (list, known);
    }

    static string Str(System.Text.Json.Nodes.JsonObject q, string k) =>
        q[k] is System.Text.Json.Nodes.JsonValue v && v.TryGetValue<string>(out var s) ? s : "";

    public static void Map(WebApplication app, Workspace ws)
    {
        // 任务库放哪由作者定：列出这台机器上能放的地方，界面拿去让他挑
        app.MapGet("/api/quests/roots", () => Results.Json(new
        {
            eft = ws.EftRoot,
            current = ws.QuestDb,
            found = ws.ScanQuestRoots().Select(x => new { path = x.Path, mod = x.Mod, hasQuests = x.HasQuests }),
        }));

        // "这个商人我认识"：给还没装 / 还没适配的商人 mod 留的出口，标记后不再报 unknown_trader
        app.MapPost("/api/quests/trader-ok", (AckReq r) =>
        {
            if (!QuestValidator.IsMongoId(r.Id)) return Results.BadRequest(new { error = "bad_id", id = r.Id });
            ws.AckTrader(r.Id, r.On);
            return Results.Json(new { ok = true, known = ws.KnownTraders });
        });

        app.MapPost("/api/quests/root", (RootReq r) =>
            ws.SetQuestDb(r.Path)
                ? Results.Json(new { ok = true, dir = ws.QuestDb })
                : Results.BadRequest(new { error = "bad_dir", path = r.Path }));

        app.MapGet("/api/quests", () =>
        {
            if (!ws.HasQuestDb) return Results.Json(new { ok = false, dir = ws.QuestDb });
            var (quests, loc) = Load(ws);
            var spt = Spt(ws);
            var (traders, known) = AllTraders(ws, spt, quests);
            return Results.Json(new
            {
                ok = true,
                dir = ws.QuestDb,
                stamp = Stamp(ws),
                files = quests.Files.Keys.OrderBy(x => x, StringComparer.OrdinalIgnoreCase),
                owner = quests.Owner,
                // 不能用 ToDictionary：同一个 id 出现在两个文件里它会直接抛，
                // 而那正是 dup_id 那条校验要提示的场景 —— 用户会拿到 500 而不是一句人话。
                // 后来者覆盖，和 Owner 的口径保持一致。
                quests = Flatten(quests),
                locales = loc.Langs,
                traders,
                knownTraders = ws.KnownTraders,     /* 界面要靠它显示"已标记为认识" */
                maps = spt.Ok ? spt.Maps() : [],
                issues = QuestValidator.Run(quests, loc, known),
                sptData = spt.Ok ? ws.SptData : null,
            });
        });

        // 物品表单独一条：4000 多件，几百 KB，不该跟着每次列任务一起来回搬
        app.MapGet("/api/quests/items", () =>
        {
            var spt = Spt(ws);
            if (!spt.Ok) return Results.Json(new { ok = false, cats = Array.Empty<object>(), items = Array.Empty<object>() });
            var (cats, items) = spt.Handbook();
            return Results.Json(new { ok = true, cats, items });
        });

        app.MapPost("/api/quests", (SaveReq r) => Save(ws, r));

        // ── 任务 ↔ 对话 ──
        // .dlg 住在工作区（ws.Root），任务住在 QuestDb，是两个根，别搞混
        app.MapGet("/api/quests/links", () =>
        {
            if (!ws.HasRoot) return Results.Json(new { ok = false });
            var (links, trigs, broken) = DlgLinks.Scan(ws.Root);
            return Results.Json(new
            {
                ok = true,
                files = DlgLinks.Files(ws.Root).Select(Path.GetFileName),
                links, triggers = trigs, broken,
                nodes = Nodes(ws.Root),
            });
        });

        app.MapPost("/api/quests/link", (LinkReq r) =>
        {
            if (!ws.HasRoot) return Results.BadRequest(new { error = "no_workspace" });
            // 文件名不许带目录：.dlg 只在工作区根下，不该出现路径
            if (r.File.Contains('/') || r.File.Contains('\\') ||
                !r.File.EndsWith(".dlg", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "bad_name", name = r.File });
            var err = DlgLinks.Apply(ws.Root, r.File, r.Node, r.Opt, r.Action, r.QuestId, r.Add);
            if (err != null) return Results.BadRequest(new { error = err });
            var (links, trigs, _) = DlgLinks.Scan(ws.Root);
            return Results.Json(new { ok = true, links, triggers = trigs });
        });
    }

    /// <summary>每个 .dlg 的节点和选项，给"挂到哪个选项"那个两步选择器用。</summary>
    static object Nodes(string dlgDir) =>
        DlgLinks.Files(dlgDir).Select(p =>
        {
            var t = VisitAPI.Dialog.DialogParser.Parse(File.ReadAllText(p), null);
            return new
            {
                file = Path.GetFileName(p),
                trader = t.DisplayName,
                nodes = t.Nodes.Values.Where(n => n.Options.Count > 0).Select(n => new
                {
                    name = n.Name,
                    npc = n.NpcText,
                    opts = n.Options.Select(o => new { text = o.Text, acts = ActNames(o) }),
                }),
            };
        }).ToArray();

    static string[] ActNames(VisitAPI.Dialog.DialogOption o) =>
        new[] { o.AcceptId != null ? "accept" : null, o.CompleteId != null ? "complete" : null,
                o.HandoverId != null ? "handover" : null, o.SetStatusId != null ? "setstatus" : null }
        .Where(x => x != null).ToArray()!;

    public sealed record LinkReq(string File, string Node, int Opt, string Action, string QuestId, bool Add);
    public sealed record RootReq(string Path);
    public sealed record AckReq(string Id, bool On);

    static Dictionary<string, JsonNode?> Flatten(QuestStore q)
    {
        var d = new Dictionary<string, JsonNode?>(StringComparer.Ordinal);
        foreach (var file in q.Files.Values)
            foreach (var kv in file) d[kv.Key] = kv.Value;
        return d;
    }

    static (QuestStore, LocaleStore) Load(Workspace ws)
    {
        var q = new QuestStore(ws.QuestDb); q.Load();
        var l = new LocaleStore(ws.QuestDb); l.Load();
        return (q, l);
    }

    /// <summary>
    /// 盘上这批文件的"指纹"：文件名 + 修改时间。
    /// 编辑器开着的时候有人在外面改了同一批文件（手改、装 mod、另一个编辑器窗口），
    /// 保存就会把人家的改动整个盖掉 —— 拿它做一次乐观锁，对不上就先问一句。
    /// </summary>
    static string Stamp(Workspace ws)
    {
        var dirs = new[] { Path.Combine(ws.QuestDb, "quests"), Path.Combine(ws.QuestDb, "locales") };
        var parts = dirs.Where(Directory.Exists)
            .SelectMany(d => Directory.GetFiles(d, "*.json"))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .Select(f => $"{Path.GetFileName(f)}:{new FileInfo(f).LastWriteTimeUtc.Ticks}");
        return string.Join("|", parts);
    }

    static IResult Save(Workspace ws, SaveReq r)
    {
        if (!ws.HasQuestDb) return Results.BadRequest(new { error = "no_quest_db", dir = ws.QuestDb });
        if (!r.Force && r.Stamp != null && r.Stamp != Stamp(ws))
            return Results.Json(new { error = "stale" }, statusCode: 409);

        var (quests, loc) = Load(ws);
        // 文案文件读不动的时候不许写：拿空对象覆盖等于把作者整份文案清空
        if (loc.Broken.Count > 0)
            return Results.BadRequest(new { error = "broken_locale", langs = loc.Broken.Keys });

        foreach (var (name, content) in r.Files ?? [])
        {
            // 文件名不许带目录，也不许 .. 出去
            if (name.Contains('/') || name.Contains('\\') || !name.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "bad_name", name });
            if (ws.ResolveQuest(Path.Combine("quests", name)) == null)
                return Results.BadRequest(new { error = "bad_name", name });
            quests.Files[name] = content;
        }
        foreach (var (lang, content) in r.Locales ?? [])
            if (LocaleStore.Known.Contains(lang)) loc.Langs[lang] = content;

        // 只写这次送来的文件。盘上有、但请求里没有的文件不动 ——
        // 删任务得走明确的删除操作，不能靠"没发过来"来推断。
        foreach (var name in (r.Files ?? []).Keys) quests.SaveFile(name);
        if (r.Locales is { Count: > 0 }) loc.SaveAll(r.Locales.Keys);   // 只写送来的语言，别给没动的也刷一份 .bak

        var (fresh, freshLoc) = Load(ws);
        var (_, known) = AllTraders(ws, Spt(ws), fresh);
        return Results.Json(new { ok = true, stamp = Stamp(ws), issues = QuestValidator.Run(fresh, freshLoc, known) });
    }

    public sealed record SaveReq(
        string? Stamp,
        bool Force,
        Dictionary<string, JsonObject>? Files,
        Dictionary<string, JsonObject>? Locales);
}
