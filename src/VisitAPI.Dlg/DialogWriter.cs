using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace VisitAPI.Dialog;

/// <summary>
/// 把 DialogTree 写回 .dlg 文本。
///
/// 原则：**能原样吐回的就原样吐回**。文件头按 HeadRaw 的顺序重放——注释和不认识的行照抄，
/// 可编辑的行从模型重新生成；节点体里的注释挂在各元素的 Lead 上，先吐注释再吐元素。
/// 这样"打开→立刻保存"应当与原文逐行一致（只有行尾多余空格会被 trim 掉）。
/// </summary>
public static class DialogWriter
{
    public static string Write(DialogTree t)
    {
        var sb = new StringBuilder();
        Head(t, sb);
        // 第一个节点前面不补空行：文件头自己的空行已经原样吐回来了（见 DialogParser），
        // 再补一个就会比原文多出一行。节点之间那一个照旧由这里统一生成。
        var first = true;
        foreach (var n in t.Nodes.Values) { Node(t, n, sb, first); first = false; }
        return sb.ToString();
    }

    static void Head(DialogTree t, StringBuilder sb)
    {
        var seen = new HashSet<string>();
        foreach (var h in t.HeadRaw)
        {
            var line = HeadLine(t, h);
            if (line == null) continue;
            sb.Append(line).Append('\n');
            seen.Add(h.Kind);
        }
        // 兜底：HeadRaw 缺了这两样也不能少（比如整棵树是代码里新建的，没经过解析）
        if (!seen.Contains("trader")) sb.Insert(0, Trader(t) + "\n");
        if (!seen.Contains("start")) sb.Append("start: ").Append(t.Start).Append('\n');
    }

    static string HeadLine(DialogTree t, HeadLine h)
    {
        switch (h.Kind)
        {
            case "raw": return h.Raw;
            case "trader": return Trader(t);
            case "start": return "start: " + t.Start;
            case "first": return t.First == null ? null : "first: " + t.First;
            case "actor": return t.Actor == null ? null : "actor: " + t.Actor;
            case "scene": return t.Scene == null ? null : "scene: " + t.Scene;
            case "tab": return t.TabQuestId == null ? null : $"tab: if {Alias(t, t.TabQuestId)}={Statuses(t.TabStatuses)}";
            case "quest":
                if (h.Index >= t.QuestAliasOrder.Count) return null;
                var k = t.QuestAliasOrder[h.Index];
                return $"quest {k} = {t.QuestAliases[k]}";
            case "when":
                if (h.Index >= t.WhenRules.Count) return null;
                var w = t.WhenRules[h.Index];
                var conds = string.Join(" ", w.Conds.Select(c => $"{c.Field}{(c.LessEq ? "<=" : ">=")}{Num(c.Value)}"));
                return $"when: {conds} -> {w.Node}";
            case "trigger":
                if (h.Index >= t.Triggers.Count) return null;
                var g = t.Triggers[h.Index];
                return "trigger: " + (g.Raw ?? Trigger(t, g));   // 有原文就照抄，别去动作者手填的坐标
            default: return null;
        }
    }

    static string Trader(DialogTree t) => $"trader: {t.TraderId} \"{t.DisplayName}\"";

    static string Trigger(DialogTree t, DialogTrigger g)
    {
        var sb = new StringBuilder();
        sb.Append(g.Kind).Append(' ').Append(g.Place);
        sb.Append($" ({Num(g.X)}, {Num(g.Y)}, {Num(g.Z)})");
        if (g.Node != null) sb.Append(" node ").Append(g.Node);
        if (g.Dist != 3f) sb.Append(" dist ").Append(Num(g.Dist));
        if (g.Free) sb.Append(" free");
        if (g.IfQuestId != null) sb.Append($" if {Alias(t, g.IfQuestId)}={Statuses(g.IfStatuses)}");
        if (g.Prompt != null) sb.Append($" \"{g.Prompt}\"");
        return sb.ToString();
    }

    static void Node(DialogTree t, DialogNode n, StringBuilder sb, bool first = false)
    {
        if (!first) sb.Append('\n');
        foreach (var c in n.Lead) sb.Append(c).Append('\n');
        sb.Append('<').Append(n.Name).Append('>');
        var kv = Kv(("bg", n.Bg), ("anim", n.Anim), ("bgm", n.Bgm));
        if (kv != null) sb.Append(' ').Append(kv);
        sb.Append('\n');

        foreach (var l in n.Narration)
        {
            foreach (var c in l.Lead) sb.Append(c).Append('\n');
            sb.Append("> ").Append(l.Text);
            var k = Kv(("bg", l.Bg), ("anim", l.Anim), ("audio", l.Audio));
            if (k != null) sb.Append(" | ").Append(k);
            sb.Append('\n');
        }
        if (!string.IsNullOrEmpty(n.NpcText))
        {
            foreach (var c in n.NpcLead) sb.Append(c).Append('\n');
            sb.Append(n.NpcText);
            if (n.NpcAudio != null) sb.Append(" | audio: ").Append(n.NpcAudio);
            sb.Append('\n');
        }
        foreach (var o in n.Options)
        {
            foreach (var c in o.Lead) sb.Append(c).Append('\n');
            sb.Append("- ").Append(o.Text);
            if (o.Target != null) sb.Append(" -> ").Append(o.Target);
            var d = Directives(t, o);
            if (d.Count > 0) sb.Append(" | ").Append(string.Join(", ", d));
            sb.Append('\n');
        }
        if (n.JumpTo != null)
        {
            foreach (var c in n.JumpLead) sb.Append(c).Append('\n');
            sb.Append("-> ").Append(n.JumpTo).Append('\n');
        }
        foreach (var c in n.Tail) sb.Append(c).Append('\n');
    }

    /// <summary>指令的顺序照原格式：setstatus → 任务动作 → 门控 → 好感 → once/always。</summary>
    static List<string> Directives(DialogTree t, DialogOption o)
    {
        var d = new List<string>();
        if (o.SetStatusId != null) d.Add($"setstatus: {Alias(t, o.SetStatusId)}" + (o.SetStatusValue == 3 ? "" : "=" + DialogParser.StatusNames[o.SetStatusValue]));
        if (o.AcceptId != null) d.Add("accept: " + Alias(t, o.AcceptId));
        if (o.CompleteId != null) d.Add("complete: " + Alias(t, o.CompleteId));
        if (o.HandoverId != null) d.Add($"handover: {Alias(t, o.HandoverId)}" + (o.HandoverLabel == null ? "" : " " + o.HandoverLabel));
        if (o.IfQuestId != null) d.Add($"if: {Alias(t, o.IfQuestId)}={Statuses(o.IfStatuses)}");
        if (o.IfNotQuestId != null) d.Add($"ifnot: {Alias(t, o.IfNotQuestId)}={Statuses(o.IfNotStatuses)}");
        if (o.StandingTraderId != null || o.StandingDelta != 0)
            d.Add("standing: " + (o.StandingTraderId != null ? o.StandingTraderId + "=" : "") + (o.StandingDelta > 0 ? "+" : "") + Num(o.StandingDelta));
        if (o.Once) d.Add("once");
        if (o.Always) d.Add("always");
        return d;
    }

    /// <summary>
    /// 解析时别名已经被换成真 ID 了（A() 干的）。回写时反查回去，
    /// 不然作者写的 `quest sora = 5043…` 还在文件头，下面却全变成裸 ID，读起来莫名其妙。
    /// </summary>
    static string Alias(DialogTree t, string id)
    {
        foreach (var kv in t.QuestAliases) if (kv.Value == id) return kv.Key;
        return id;
    }

    static string Statuses(List<int> s) =>
        s.Count == 0 ? "" : string.Join("/", s.Select(i => i >= 0 && i < DialogParser.StatusNames.Length ? DialogParser.StatusNames[i] : i.ToString()));

    static string Kv(params (string k, string v)[] parts)
    {
        var s = parts.Where(p => !string.IsNullOrEmpty(p.v)).Select(p => $"{p.k}: {p.v}").ToList();
        return s.Count == 0 ? null : string.Join(" | ", s);
    }

    /// <summary>数字用不变文化格式化，去掉多余的 0——不然中文系统下小数点会变成逗号，文件直接废掉。</summary>
    static string Num(double v) => v.ToString("0.############", CultureInfo.InvariantCulture);
}
