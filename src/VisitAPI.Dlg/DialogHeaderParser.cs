using System;
using System.Text.RegularExpressions;

namespace VisitAPI.Dialog;

internal static class DialogHeaderParser
{
    internal static void Header(DialogTree t, string line, int ln)
    {
        var qa = Regex.Match(line, @"^quest\s+(\S+)\s*=\s*(\S+)$", RegexOptions.IgnoreCase);
        if (qa.Success)
        {
            t.QuestAliases[qa.Groups[1].Value] = qa.Groups[2].Value;
            t.QuestAliasOrder.Add(qa.Groups[1].Value);
            t.HeadRaw.Add(new HeadLine { Kind = "quest", Index = t.QuestAliasOrder.Count - 1 });
            return;
        }
        var kv = line.Split(new[] { ':' }, 2);
        var v = kv.Length > 1 ? kv[1].Trim() : "";
        var key = kv[0].Trim().ToLowerInvariant();
        // 先记下这一行占的位置；下标要在列表 Add 之前取（trigger/when 的解析在下面才发生）
        t.HeadRaw.Add(new HeadLine
        {
            Kind = key,
            Index = key == "trigger" ? t.Triggers.Count : key == "when" ? t.WhenRules.Count : 0,
        });
        switch (key)
        {
            case "trader": t.DisplayName = Regex.Match(v, "\"(.*)\"").Groups[1].Value; break;
            case "start": t.Start = v; break;
            case "first": t.First = v; break;
            case "actor": t.Actor = v; break;
            case "scene": t.Scene = v; break;
            case "tab": if (v.StartsWith("if ")) t.TabQuestId = DialogParser.Gate(v.Substring(3), t.TabStatuses, t, ln); break;
            case "when":
                var w = Regex.Match(v, @"^(.*?)\s*->\s*(\S+)$");
                var rule = new WhenRule { Node = w.Groups[2].Value };
                foreach (Match c in Regex.Matches(w.Groups[1].Value, @"(level|standing)\s*(>=|<=)\s*([-+\d.]+)"))
                    rule.Conds.Add(new WhenCond { Field = c.Groups[1].Value, LessEq = c.Groups[2].Value == "<=", Value = DialogParser.Num(c.Groups[3].Value) });
                if (w.Success && rule.Conds.Count > 0) t.WhenRules.Add(rule);
                else { t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: when 无法解析 '{v}'", $"Line {ln}: cannot parse when '{v}'")); KeepRaw(t, line); }
                break;
            case "trigger":
                TriggerParser.Parse(t, v, ln);
                if (t.Triggers.Count == t.HeadRaw[t.HeadRaw.Count - 1].Index) KeepRaw(t, line);  // 没解析成功
                break;
            default:
                t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 未知的文件头 '{kv[0].Trim()}'", $"Line {ln}: unknown header '{kv[0].Trim()}'"));
                KeepRaw(t, line);
                break;
        }
    }

    /// <summary>
    /// 这一行没能变成模型（语法错、或我们不认识的头）——那就别假装能重新生成它，
    /// 把刚才占的位子换成原文照抄。回写时至少不会把用户的内容弄丢。
    /// </summary>
    static void KeepRaw(DialogTree t, string line)
    {
        t.HeadRaw[t.HeadRaw.Count - 1] = new HeadLine { Kind = "raw", Raw = line };
    }
}
