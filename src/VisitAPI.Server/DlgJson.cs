using VisitAPI.Dialog;

namespace VisitAPI.Server;

/// <summary>
/// 前端的对话模型 → <see cref="DialogTree"/>。
///
/// **存在的理由：让 .dlg 只有一个写手。**
/// 以前前端自己有一份 `toDlg()`，和 C# 的 `DialogWriter` 并存，两套实现迟早不一致——
/// 而且已经不一致了：那份 JS 写手会丢掉节点体里的注释、旁白上的 `anim`、
/// `setstatus` 的状态值、`standing` 的商人 id、以及同一选项上的第二条门控。
/// 现在前端只发模型，文本一律由 DialogWriter 生成。
///
/// 字段名沿用前端那份模型的简写（t/to/q/s…），不为了好看去改前端 —— 改名的收益抵不上
/// 把整个编辑器的读写点全动一遍的风险。
/// </summary>
public static class DlgJson
{
    public sealed record Head(string K, int I, string V);
    public sealed record Cond(string F, bool Le, double V);
    public sealed record When(string Node, List<Cond>? Conds);
    public sealed record Act(string Kind, string Q, string? Label);
    public sealed record Gate(string Kind, string Q, List<int>? S);
    public sealed record Standing(string? Who, double D);
    public sealed record SetSt(string Q, int V);
    public sealed record VarRef(string N, int V);   // 分支记号：名字 + 整数
    public sealed record Narr(string? Text, string? Bg, string? Anim, string? Audio, List<string>? Lead);
    /// <summary>`ifitems`：Q 为空 = 用本选项 handover: 的那条任务</summary>
    public sealed record Items(string? Q);
    public sealed record Opt(string? T, string? To, Act? Act, Gate? Gate, Gate? Gate2,
        bool Once, bool Always, Standing? Standing, SetSt? Setst, Items? Ifitems, List<string>? Lead,
        VarRef? Setvar = null, VarRef? Ifvar = null);
    // NpcAt：台词排在第几条旁白之后（前端不送就是 null → 模型的 -1 → 老规矩"台词在最后"）
    public sealed record Node(string Name, string? Bg, string? Anim, string? Bgm, string? Npc, string? Audio,
        string? Jump, List<Narr>? Narr, List<Opt>? Opts,
        List<string>? Lead, List<string>? NpcLead, List<string>? JumpLead, List<string>? Tail,
        int? NpcAt = null);
    public sealed record Doc(string? Trader, string? Name, string? Start, string? First,
        string? Actor, string? Scene,
        string? Tab, List<int>? TabS, List<Head>? HeadRaw, List<When>? When, List<string>? Triggers,
        Dictionary<string, string>? Alias, List<string>? AliasOrder, List<Node>? Nodes);

    public static DialogTree ToTree(Doc d)
    {
        var t = new DialogTree
        {
            TraderId = d.Trader, DisplayName = d.Name ?? "",
            Start = d.Start ?? "root", First = d.First, TabQuestId = d.Tab,
            // 空串要当成"没有"：写手看的是 null，不然会吐出一行光秃秃的 `scene: `
            Actor = Nz(d.Actor), Scene = Nz(d.Scene),
        };
        if (d.TabS != null) t.TabStatuses.AddRange(d.TabS);
        if (d.Alias != null) foreach (var kv in d.Alias) t.QuestAliases[kv.Key] = kv.Value;
        if (d.AliasOrder != null) t.QuestAliasOrder.AddRange(d.AliasOrder);
        foreach (var w in d.When ?? [])
            t.WhenRules.Add(new WhenRule { Node = w.Node,
                Conds = (w.Conds ?? []).Select(c => new WhenCond { Field = c.F, LessEq = c.Le, Value = c.V }).ToList() });
        // 触发器整行原样带回去。DialogWriter 见到 Raw 就照抄，作者手填的坐标不会被浮点格式化改样子
        foreach (var g in d.Triggers ?? []) t.Triggers.Add(new DialogTrigger { Raw = g });
        foreach (var h in d.HeadRaw ?? [])
            t.HeadRaw.Add(new HeadLine { Kind = h.K, Index = h.I, Raw = h.V });
        foreach (var n in d.Nodes ?? []) t.Nodes[n.Name] = ToNode(n);
        return t;
    }

    static DialogNode ToNode(Node n)
    {
        var o = new DialogNode
        {
            Name = n.Name, Bg = Nz(n.Bg), Anim = Nz(n.Anim), Bgm = Nz(n.Bgm),
            NpcText = n.Npc, NpcAudio = Nz(n.Audio), JumpTo = Nz(n.Jump), NpcAt = n.NpcAt ?? -1,
        };
        o.Lead.AddRange(n.Lead ?? []); o.NpcLead.AddRange(n.NpcLead ?? []);
        o.JumpLead.AddRange(n.JumpLead ?? []); o.Tail.AddRange(n.Tail ?? []);
        foreach (var b in n.Narr ?? [])
        {
            var nl = new NarrationLine { Text = b.Text ?? "", Bg = Nz(b.Bg), Anim = Nz(b.Anim), Audio = Nz(b.Audio) };
            nl.Lead.AddRange(b.Lead ?? []);
            o.Narration.Add(nl);
        }
        foreach (var p in n.Opts ?? []) o.Options.Add(ToOpt(p));
        return o;
    }

    static DialogOption ToOpt(Opt p)
    {
        var o = new DialogOption { Text = p.T ?? "", Target = Nz(p.To), Once = p.Once, Always = p.Always };
        if (p.Act != null)
        {
            // 前端的 q 可以是空格隔开的多个 id（accept/complete 多任务）
            var ids = (p.Act.Q ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (p.Act.Kind == "accept") o.AcceptIds.AddRange(ids);
            else if (p.Act.Kind == "complete") o.CompleteIds.AddRange(ids);
            else if (p.Act.Kind == "handover") { o.HandoverId = p.Act.Q; o.HandoverLabel = Nz(p.Act.Label); }
        }
        if (p.Setst != null) { o.SetStatusId = p.Setst.Q; o.SetStatusValue = p.Setst.V; }
        if (p.Ifitems != null) { o.IfItems = true; o.IfItemsId = Nz(p.Ifitems.Q); }
        foreach (var g in new[] { p.Gate, p.Gate2 })
        {
            if (g == null) continue;
            if (g.Kind == "if") { o.IfQuestId = g.Q; o.IfStatuses.AddRange(g.S ?? []); }
            else { o.IfNotQuestId = g.Q; o.IfNotStatuses.AddRange(g.S ?? []); }
        }
        if (p.Standing != null) { o.StandingTraderId = Nz(p.Standing.Who); o.StandingDelta = p.Standing.D; }
        if (p.Setvar != null && !string.IsNullOrEmpty(p.Setvar.N)) { o.SetVarName = p.Setvar.N; o.SetVarValue = p.Setvar.V; }
        if (p.Ifvar != null && !string.IsNullOrEmpty(p.Ifvar.N)) { o.IfVarName = p.Ifvar.N; o.IfVarValue = p.Ifvar.V; }
        o.Lead.AddRange(p.Lead ?? []);
        return o;
    }

    /// <summary>空串当没有：模型里 bg 之类的默认是 ""，写回去不能变成 `bg: `。</summary>
    static string? Nz(string? s) => string.IsNullOrEmpty(s) ? null : s;

    /// <summary>
    /// 正文守卫。.dlg 没有转义：台词/旁白/选项文字里出现 ` | `、行首的 `- ` `>` `->` `#` `//` `<名字>`，
    /// 选项文字里出现 ` -> `，handover 的说明里出现 `,` —— 写出去合法、再读回来就变身（跳转丢、台词变跳转、说明被截）。
    /// 写手不能改作者的字，只能拒写；JS 那边的 badTexts() 同一套规则，让作者当场看见。
    /// </summary>
    static readonly System.Text.RegularExpressions.Regex Lead = new(@"^(- |>|->|#|//|<[A-Za-z0-9_.\-]+>)");
    public static List<string> BadTexts(DialogTree t)
    {
        var bad = new List<string>();
        static bool Text(string? s) => s != null && (s.Contains(" | ") || Lead.IsMatch(s));
        foreach (var n in t.Nodes.Values)
        {
            if (Text(n.NpcText)) bad.Add($"<{n.Name}> npc");
            for (var i = 0; i < n.Narration.Count; i++) if (Text(n.Narration[i].Text)) bad.Add($"<{n.Name}> narr {i + 1}");
            for (var i = 0; i < n.Options.Count; i++)
            {
                var o = n.Options[i];
                if (Text(o.Text) || (o.Text ?? "").Contains(" -> ")) bad.Add($"<{n.Name}> #{i + 1}");
                if ((o.HandoverLabel ?? "").Contains(',')) bad.Add($"<{n.Name}> #{i + 1} handover");
            }
        }
        return bad;
    }
}
