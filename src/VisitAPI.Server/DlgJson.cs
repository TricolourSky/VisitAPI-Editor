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
    public sealed record Narr(string? Text, string? Bg, string? Anim, string? Audio, List<string>? Lead);
    public sealed record Opt(string? T, string? To, Act? Act, Gate? Gate, Gate? Gate2,
        bool Once, bool Always, Standing? Standing, SetSt? Setst, List<string>? Lead);
    public sealed record Node(string Name, string? Bg, string? Anim, string? Bgm, string? Npc, string? Audio,
        string? Jump, List<Narr>? Narr, List<Opt>? Opts,
        List<string>? Lead, List<string>? NpcLead, List<string>? JumpLead, List<string>? Tail);
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
            NpcText = n.Npc, NpcAudio = Nz(n.Audio), JumpTo = Nz(n.Jump),
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
            if (p.Act.Kind == "accept") o.AcceptId = p.Act.Q;
            else if (p.Act.Kind == "complete") o.CompleteId = p.Act.Q;
            else if (p.Act.Kind == "handover") { o.HandoverId = p.Act.Q; o.HandoverLabel = Nz(p.Act.Label); }
        }
        if (p.Setst != null) { o.SetStatusId = p.Setst.Q; o.SetStatusValue = p.Setst.V; }
        foreach (var g in new[] { p.Gate, p.Gate2 })
        {
            if (g == null) continue;
            if (g.Kind == "if") { o.IfQuestId = g.Q; o.IfStatuses.AddRange(g.S ?? []); }
            else { o.IfNotQuestId = g.Q; o.IfNotStatuses.AddRange(g.S ?? []); }
        }
        if (p.Standing != null) { o.StandingTraderId = Nz(p.Standing.Who); o.StandingDelta = p.Standing.D; }
        o.Lead.AddRange(p.Lead ?? []);
        return o;
    }

    /// <summary>空串当没有：模型里 bg 之类的默认是 ""，写回去不能变成 `bg: `。</summary>
    static string? Nz(string? s) => string.IsNullOrEmpty(s) ? null : s;
}
