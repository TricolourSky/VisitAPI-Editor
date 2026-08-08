using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace VisitAPI.Dialog;

public static class DialogParser
{
    internal static readonly string[] StatusNames = { "Locked", "AvailableForStart", "Started", "AvailableForFinish", "Success", "Fail" };
    static readonly string[] ReservedTargets = { "@close", "@leave", "@trade", "@services", "@tasks", "@visit", "@start" };

    public static DialogTree Parse(string text, string traderId)
    {
        var t = new DialogTree { TraderId = traderId };
        DialogNode n = null;
        var ln = 0;
        // 攒着的注释：碰到下一个元素就挂到它头上。空行不算注释，直接扔（回写自己会排版）。
        var pending = new List<string>();
        foreach (var raw in text.Replace("\r\n", "\n").Split('\n'))
        {
            ln++;
            var line = raw.Trim();
            // 文件头里的空行要留住 —— 作者拿它分段（触发器一段、when 一段），
            // 丢掉的话"打开→保存"就会把他排好的版面压扁。
            // 节点体里的空行不用记：回写时每个节点前面本来就会空一行。
            if (line.Length == 0)
            {
                if (n == null) t.HeadRaw.Add(new HeadLine { Kind = "raw", Raw = "" });
                continue;
            }
            if (line[0] == '#' || line.StartsWith("//"))
            {
                if (n == null) t.HeadRaw.Add(new HeadLine { Kind = "raw", Raw = line });
                else pending.Add(line);
                continue;
            }
            var head = Regex.Match(line, @"^<([\w.\-]+)>\s*(.*)$");
            if (head.Success)
            {
                if (n != null) { n.Tail.AddRange(pending); pending.Clear(); }   // 上一个节点尾巴上的注释
                n = t.Nodes[head.Groups[1].Value] = new DialogNode { Name = head.Groups[1].Value };
                n.Lead.AddRange(pending); pending.Clear();
                var d = KV(head.Groups[2].Value.Split(new[] { " | " }, StringSplitOptions.None));
                n.Bg = G(d, "bg"); n.Anim = G(d, "anim"); n.Bgm = G(d, "bgm");
            }
            else if (n == null) DialogHeaderParser.Header(t, line, ln);
            else Body(t, n, line, ln, pending);
        }
        if (n != null) n.Tail.AddRange(pending);
        t.TabQuestId = A(t, t.TabQuestId);
        foreach (var tr in t.Triggers) tr.IfQuestId = A(t, tr.IfQuestId);
        foreach (var node in t.Nodes.Values)
            foreach (var tgt in node.Options.Select(o => o.Target).Append(node.JumpTo))
                if (tgt != null && !t.Nodes.ContainsKey(tgt) && Array.IndexOf(ReservedTargets, tgt) < 0)
                    t.Warnings.Add(DlgLoc.Pick($"节点 <{node.Name}>: 跳转目标 '{tgt}' 不存在", $"Node <{node.Name}>: jump target '{tgt}' does not exist"));
        return t;
    }

    static void Body(DialogTree t, DialogNode n, string line, int ln, List<string> pending)
    {
        var seg = line.Split(new[] { " | " }, StringSplitOptions.None);
        if (line.StartsWith("->")) { n.JumpTo = line.Substring(2).Trim(); n.JumpLead.AddRange(pending); }
        else if (line.StartsWith(">")) { var d = KV(seg.Skip(1)); var nl = new NarrationLine { Text = seg[0].Substring(1).Trim(), Bg = G(d, "bg"), Anim = G(d, "anim"), Audio = G(d, "audio") }; nl.Lead.AddRange(pending); n.Narration.Add(nl); }
        else if (line.StartsWith("- ")) Option(t, n, seg, ln, pending);
        else { n.NpcText = seg[0].Trim(); n.NpcAudio = G(KV(seg.Skip(1)), "audio") ?? n.NpcAudio; n.NpcLead.AddRange(pending); }
        pending.Clear();
    }

    static void Option(DialogTree t, DialogNode n, string[] seg, int ln, List<string> pending)
    {
        var o = new DialogOption();
        o.Lead.AddRange(pending);
        var left = seg[0].Substring(2).Trim();
        var arrow = left.IndexOf(" -> ", StringComparison.Ordinal);
        o.Text = (arrow < 0 ? left : left.Substring(0, arrow)).Trim();
        o.Target = arrow < 0 ? null : left.Substring(arrow + 4).Trim();
        foreach (var d in seg.Skip(1).SelectMany(s => s.Split(',')).Select(s => s.Trim()).Where(s => s.Length > 0)) Directive(t, o, d, ln);
        n.Options.Add(o);
    }

    static void Directive(DialogTree t, DialogOption o, string d, int ln)
    {
        if (d == "once") { o.Once = true; return; }
        if (d == "always") { o.Always = true; return; }
        var kv = d.Split(new[] { ':' }, 2);
        if (kv.Length < 2) { t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 未知指令 '{d}'", $"Line {ln}: unknown directive '{d}'")); return; }
        var v = kv[1].Trim();
        var sp = v.IndexOf(' ');
        var eq = v.IndexOf('=');
        switch (kv[0].Trim().ToLowerInvariant())
        {
            case "accept": o.AcceptId = A(t, v); break;
            case "complete": o.CompleteId = A(t, v); break;
            case "handover": o.HandoverId = A(t, sp < 0 ? v : v.Substring(0, sp)); o.HandoverLabel = sp < 0 ? null : v.Substring(sp + 1).Trim(); break;
            case "setstatus": o.SetStatusId = A(t, eq < 0 ? v : v.Substring(0, eq).Trim()); if (eq >= 0) o.SetStatusValue = Status(v.Substring(eq + 1), t, ln); break;
            case "if": o.IfQuestId = A(t, Gate(v, o.IfStatuses, t, ln)); break;
            case "ifnot": o.IfNotQuestId = A(t, Gate(v, o.IfNotStatuses, t, ln)); break;
            case "standing": o.StandingTraderId = eq < 0 ? null : v.Substring(0, eq).Trim(); o.StandingDelta = Num(eq < 0 ? v : v.Substring(eq + 1)); break;
            default: t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 未知指令 '{kv[0].Trim()}'", $"Line {ln}: unknown directive '{kv[0].Trim()}'")); break;
        }
    }

    internal static string A(DialogTree t, string id) => id != null && t.QuestAliases.TryGetValue(id, out var real) ? real : id;

    internal static string Gate(string v, List<int> into, DialogTree t, int ln)
    {
        var eq = v.IndexOf('=');
        if (eq < 0) { t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 门控缺少 '=状态'", $"Line {ln}: gate is missing '=status'")); return v.Trim(); }
        foreach (var s in v.Substring(eq + 1).Split('/')) into.Add(Status(s, t, ln));
        return v.Substring(0, eq).Trim();
    }

    internal static int Status(string s, DialogTree t, int ln)
    {
        s = s.Trim();
        if (int.TryParse(s, out var i) && i >= 0 && i <= 5) return i;
        var idx = Array.FindIndex(StatusNames, x => x.Equals(s, StringComparison.OrdinalIgnoreCase));
        if (idx < 0) t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 未知任务状态 '{s}'", $"Line {ln}: unknown quest status '{s}'"));
        return idx;
    }

    internal static Dictionary<string, string> KV(IEnumerable<string> segs)
    {
        var d = new Dictionary<string, string>();
        foreach (var s in segs) { var kv = s.Split(new[] { ':' }, 2); if (kv.Length == 2) d[kv[0].Trim().ToLowerInvariant()] = kv[1].Trim(); }
        return d;
    }

    internal static string G(Dictionary<string, string> d, string k) => d.TryGetValue(k, out var v) ? v : null;

    internal static double Num(string s) => double.TryParse(s.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var v) ? v : 0;
}
