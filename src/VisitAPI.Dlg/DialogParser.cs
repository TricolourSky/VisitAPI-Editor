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

    /// <summary>节点名只收 ASCII（与 JS 那份解析器一致）。原来是 \w：C# 的 \w 认中文、JS 的不认，
    /// 中文节点名这边解得出、编辑器里整块并进上一节点，存一次盘就永久合并。</summary>
    static readonly Regex NodeHead = new(@"^<([A-Za-z0-9_.\-]+)>\s*(.*)$", RegexOptions.Compiled);

    public static DialogTree Parse(string text, string traderId)
    {
        var t = new DialogTree { TraderId = traderId };
        DialogNode n = null;
        var ln = 0;
        // 记事本存的 BOM（net 的 Trim() 不去 ﻿，首行会变成「未知的文件头」）、老 Mac 的裸 \r（整份被吃成一行）——先归一
        text = (text ?? "").TrimStart('\uFEFF').Replace("\r\n", "\n").Replace('\r', '\n');
        // 攒着的注释：碰到下一个元素就挂到它头上。空行不算注释，直接扔（回写自己会排版）。
        var pending = new List<string>();
        // 别名预扫：`quest a = <id>` 写在 `trigger:` 行**下面**也要认。原来解析到哪行就查到哪行，
        // 写在后面的别名在触发器的 accept/finish/fail 里存成字符串 —— 插件 GetConditional("a") 拿 null、
        // 校验器比不中、sub_no_entry 误报，还冒一条「不是 24 位十六进制」的假警告，而回写字节完全正常所以查不出来。
        // 只扫文件头（第一个节点之前）；正式登记（顺序、HeadRaw）仍由 DialogHeaderParser 做。
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.StartsWith("<")) break;
            var qa = Regex.Match(line, @"^quest\s+(\S+)\s*=\s*(\S+)$", RegexOptions.IgnoreCase);
            if (qa.Success) t.QuestAliases[qa.Groups[1].Value] = qa.Groups[2].Value;
        }
        foreach (var raw in text.Split('\n'))
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
            var head = NodeHead.Match(line);
            if (head.Success)
            {
                if (n != null) { n.Tail.AddRange(pending); pending.Clear(); }   // 上一个节点尾巴上的注释
                var name = head.Groups[1].Value;
                // 重名：第二份会把第一份整个盖掉，作者看不到任何提示（2026-09-08 审查）
                if (t.Nodes.ContainsKey(name)) Loss(t, ln, "duplicate node: " + name);
                n = t.Nodes[name] = new DialogNode { Name = name };
                n.Lead.AddRange(pending); pending.Clear();
                // `<root> | bg: x` 也认：文档里就是这么写的，原来第一段成了「| bg」这个键，bg 静默丢
                var d = KV(head.Groups[2].Value.TrimStart(' ', '|').Split(new[] { " | " }, StringSplitOptions.None), t, ln);
                n.Bg = G(d, "bg"); n.Anim = G(d, "anim"); n.Bgm = G(d, "bgm");
                Unknown(t, d, ln, "bg", "anim", "bgm");
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
        // 文件头里指节点的四样也要查：跳不存在的名字 = 直接关闭，作者只会看到「访问按钮点了没反应」
        if (t.Nodes.Count > 0)
        {
            Ref(t, "start", t.Start); Ref(t, "first", t.First);
            foreach (var w in t.WhenRules) Ref(t, "when", w.Node);
            foreach (var tr in t.Triggers) Ref(t, "trigger", tr.Node);
        }
        return t;
    }

    static void Ref(DialogTree t, string where, string node)
    {
        if (!string.IsNullOrEmpty(node) && !t.Nodes.ContainsKey(node))
            t.Warnings.Add(DlgLoc.Pick($"{where}: 指向的节点 '{node}' 不存在", $"{where}: points at node '{node}' which does not exist"));
    }

    /// <summary>白名单以外的键（台词行写 `bg:`、旁白行写 `bgm:`）原来静默丢，回写就没了</summary>
    static void Unknown(DialogTree t, Dictionary<string, string> d, int ln, params string[] known)
    {
        foreach (var k in d.Keys)
            if (Array.IndexOf(known, k) < 0)
            {
                t.UnsafeToRewrite = true;
                t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 这一行不认 '{k}:'，回写会丢掉", $"Line {ln}: '{k}:' is not valid on this line and will be dropped on save"));
            }
    }

    static void Body(DialogTree t, DialogNode n, string line, int ln, List<string> pending)
    {
        // 译文行（DialogLangs）：挂到上一条能翻的行上。节点头刚开 / `->` 之后没东西可翻，就是写错了位置——拒绝无损回写，让作者自己挪。
        // 译文行不是元素：攒着的注释不清，照旧等下一个元素（原文里夹在原行和译文之间的注释回写会落到译文后面，不丢）。
        if (DialogLangs.TryMatch(line, out var lang, out var text))
        {
            if (n.LastTr == null) Loss(t, ln, "translation line has no line above it to translate");
            else if (text.Length == 0) t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 译文是空的，回写会丢掉这一行", $"Line {ln}: empty translation; this line is dropped on save"));
            else if (n.LastTr.ContainsKey(lang)) Loss(t, ln, "duplicate translation: " + lang);
            else n.LastTr[lang] = text;
            return;
        }
        var seg = (line.StartsWith("| ") ? " " + line : line).Split(new[] { " | " }, StringSplitOptions.None);
        if (line.StartsWith("->")) { n.JumpTo = line.Substring(2).Trim(); n.JumpLead.AddRange(pending); n.LastTr = null; }
        else if (line.StartsWith(">")) { var d = KV(seg.Skip(1), t, ln); Unknown(t, d, ln, "bg", "anim", "audio"); var nl = new NarrationLine { Text = seg[0].Substring(1).Trim(), Bg = G(d, "bg"), Anim = G(d, "anim"), Audio = G(d, "audio") }; nl.Lead.AddRange(pending); n.Narration.Add(nl); n.LastTr = nl.Tr; }
        else if (line.StartsWith("- ") || line == "-") Option(t, n, seg, ln, pending);
        // NpcAt 记的是"台词出现时，前面已经有几条旁白" —— 后面再来的 `>` 行就排在台词之后
        else { if (n.NpcText != null) Loss(t, ln, "multiple NPC lines"); var d = KV(seg.Skip(1), t, ln); Unknown(t, d, ln, "audio"); n.NpcText = seg[0].Trim(); n.NpcAt = n.Narration.Count; n.NpcAudio = G(d, "audio") ?? n.NpcAudio; n.NpcLead.AddRange(pending); n.LastTr = n.NpcTr; }
        pending.Clear();
    }

    static void Option(DialogTree t, DialogNode n, string[] seg, int ln, List<string> pending)
    {
        var o = new DialogOption();
        o.Lead.AddRange(pending);
        var left = seg[0].Substring(1).Trim();
        if (left.StartsWith("-> ")) left = " " + left;
        var arrow = left.IndexOf(" -> ", StringComparison.Ordinal);
        o.Text = (arrow < 0 ? left : left.Substring(0, arrow)).Trim();
        o.Target = arrow < 0 ? null : left.Substring(arrow + 4).Trim();
        var seen = new HashSet<string>();
        foreach (var d in seg.Skip(1).SelectMany(s => s.Split(',')).Select(s => s.Trim()).Where(s => s.Length > 0))
        {
            var key = d.Split(':')[0].Trim().ToLowerInvariant();
            if (key != "accept" && key != "complete" && !seen.Add(key)) Loss(t, ln, "duplicate directive: " + key);
            Directive(t, o, d, ln);
        }
        n.Options.Add(o);
        n.LastTr = o.Tr;
    }

    static void Directive(DialogTree t, DialogOption o, string d, int ln)
    {
        if (d == "once") { o.Once = true; return; }
        if (d == "always") { o.Always = true; return; }
        if (d == "ifitems") { o.IfItems = true; return; }   // 不带任务 = 用本选项 handover: 的那条
        var kv = d.Split(new[] { ':' }, 2);
        if (kv.Length < 2) { Loss(t, ln, "unknown directive: " + d); return; }
        var v = kv[1].Trim();
        var sp = v.IndexOf(' ');
        var eq = v.IndexOf('=');
        switch (kv[0].Trim().ToLowerInvariant())
        {
            case "accept": o.AcceptIds.AddRange(Ids(t, v)); break;
            case "complete": o.CompleteIds.AddRange(Ids(t, v)); break;
            case "handover": o.HandoverId = A(t, sp < 0 ? v : v.Substring(0, sp)); o.HandoverLabel = sp < 0 ? null : v.Substring(sp + 1).Trim(); break;
            case "setstatus": o.SetStatusId = A(t, eq < 0 ? v : v.Substring(0, eq).Trim()); if (eq >= 0) o.SetStatusValue = Status(v.Substring(eq + 1), t, ln); break;
            // 同一选项两条 if:（或两条 ifnot:）模型放不下：任务被后一条盖掉、状态并到一起。原来一声不吭
            case "if": if (o.IfQuestId != null) Twice(t, ln, "if"); o.IfQuestId = A(t, Gate(v, o.IfStatuses, t, ln)); break;
            case "ifnot": if (o.IfNotQuestId != null) Twice(t, ln, "ifnot"); o.IfNotQuestId = A(t, Gate(v, o.IfNotStatuses, t, ln)); break;
            case "set": o.SetVarName = Var(v, out o.SetVarValue, t, ln); break;
            case "ifvar": o.IfVarName = Var(v, out o.IfVarValue, t, ln); break;
            case "ifitems": o.IfItems = true; o.IfItemsId = A(t, v); break;
            case "standing":
                o.StandingTraderId = eq < 0 ? null : v.Substring(0, eq).Trim();
                if (!TryNum(eq < 0 ? v : v.Substring(eq + 1), out o.StandingDelta)) Loss(t, ln, "invalid standing number");
                break;
            default: Loss(t, ln, "unknown directive: " + kv[0].Trim()); break;
        }
    }

    static void Twice(DialogTree t, int ln, string key) =>
        t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 同一选项写了两条 {key}:，只能留一条（任务取后者、状态合并）", $"Line {ln}: two {key}: on one option; only one fits (quest = the latter, statuses merged)"));

    /// <summary>别名 → 真 id。**全文件所有任务引用的唯一收口**：accept/complete/handover/setstatus、
    /// if/ifnot、tab、触发点的 accept/finish/fail 全都从这儿过，所以 id 格式检查放这一处就够。</summary>
    internal static string A(DialogTree t, string id)
    {
        var real = id != null && t.QuestAliases.TryGetValue(id, out var r) ? r : id;
        // 任务 id 必须是 24 位十六进制。写错的（占位符、拼错的别名、手抖）在游戏里查不到任何任务，
        // 而自动门控会顺手把那个选项藏起来 —— 现象是"选项莫名其妙不出现"，最难查的一类。
        if (real != null && !IsQuestId(real))
            t.Warnings.Add(DlgLoc.Pick($"任务 id 不是 24 位十六进制: '{real}'", $"quest id is not 24 hex chars: '{real}'"));
        return real;
    }

    internal static bool IsQuestId(string s) =>
        s != null && s.Length == 24 && s.All(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));

    /// <summary>`accept: a b c`：空格隔开的多个任务，每个都过一遍别名表。</summary>
    internal static IEnumerable<string> Ids(DialogTree t, string v) =>
        v.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries).Select(x => A(t, x));

    /// <summary>`名字=整数`。名字随作者起（set: 和 ifvar: 两边写一样即可），值只能是整数——引擎的变量本子只存 int。</summary>
    static string Var(string v, out int value, DialogTree t, int ln)
    {
        value = 0;
        var eq = v.IndexOf('=');
        if (eq < 0 || !int.TryParse(v.Substring(eq + 1).Trim(), out value))
            Loss(t, ln, "flag must be name=integer");
        var name = (eq < 0 ? v : v.Substring(0, eq)).Trim();
        if (name.Length == 0) Loss(t, ln, "empty flag name");
        return name.Length > 0 ? name : null;
    }

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
        if (idx < 0) Loss(t, ln, "unknown quest status: " + s);
        return idx;
    }

    internal static Dictionary<string, string> KV(IEnumerable<string> segs, DialogTree t = null, int ln = 0)
    {
        var d = new Dictionary<string, string>();
        foreach (var s in segs)
        {
            var kv = s.Split(new[] { ':' }, 2);
            if (kv.Length == 2)
            {
                var key = kv[0].Trim().ToLowerInvariant();
                if (t != null && d.ContainsKey(key)) Loss(t, ln, "duplicate field: " + key);
                d[key] = kv[1].Trim();
            }
            else if (t != null && s.Trim().Length > 0) Loss(t, ln, "unrecognized segment: " + s);
        }
        return d;
    }

    internal static string G(Dictionary<string, string> d, string k) => d.TryGetValue(k, out var v) ? v : null;

    internal static bool TryNum(string s, out double v) => double.TryParse(s.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out v) && !double.IsNaN(v) && !double.IsInfinity(v);
    internal static double Num(string s) => TryNum(s, out var v) ? v : 0;
    internal static void Loss(DialogTree t, int ln, string detail)
    {
        t.UnsafeToRewrite = true;
        t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行：无法无损回写，请先修正原文：{detail}", $"Line {ln}: cannot rewrite losslessly; fix source first: {detail}"));
    }
}
