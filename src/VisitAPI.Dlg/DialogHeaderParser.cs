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
            if (t.QuestAliasOrder.Contains(qa.Groups[1].Value)) DialogParser.Loss(t, ln, "duplicate alias: " + qa.Groups[1].Value);
            t.QuestAliases[qa.Groups[1].Value] = qa.Groups[2].Value;
            t.QuestAliasOrder.Add(qa.Groups[1].Value);
            t.HeadRaw.Add(new HeadLine { Kind = "quest", Index = t.QuestAliasOrder.Count - 1 });
            return;
        }
        // 译文行（DialogLangs）：挂到紧挨着的上一行——trigger: 的提示语或 trader: 的名字。别的位置没东西可翻：原文留住、给警告
        if (DialogLangs.TryMatch(line, out var lang, out var text))
        {
            var h = t.HeadRaw.Count > 0 ? t.HeadRaw[t.HeadRaw.Count - 1] : null;
            var tr = h?.Kind == "trigger" && h.Index < t.Triggers.Count ? t.Triggers[h.Index].Tr : h?.Kind == "trader" ? t.NameTr : null;
            if (tr == null || text.Length == 0 || tr.ContainsKey(lang))
            {
                t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 这条译文挂不上（上一行不是 trigger: / trader:，或同一语言写了两次），按原样留着", $"Line {ln}: translation has nothing to attach to (previous line is not trigger:/trader:, or the language repeats); kept as is"));
                t.HeadRaw.Add(new HeadLine { Kind = "raw", Raw = line });
            }
            else tr[lang] = text;
            return;
        }
        var kv = line.Split(new[] { ':' }, 2);
        var v = kv.Length > 1 ? kv[1].Trim() : "";
        var key = kv[0].Trim().ToLowerInvariant();
        if (Array.IndexOf(new[] { "trader", "start", "first", "actor", "scene", "tab" }, key) >= 0 &&
            t.HeadRaw.Exists(h => h.Kind == key)) DialogParser.Loss(t, ln, "duplicate header: " + key);
        // 先记下这一行占的位置；下标要在列表 Add 之前取（trigger/when 的解析在下面才发生）
        t.HeadRaw.Add(new HeadLine
        {
            Kind = key,
            Index = key == "trigger" ? t.Triggers.Count : key == "when" ? t.WhenRules.Count : 0,
        });
        switch (key)
        {
            // `trader: <id> "名字"` —— 名字进 DisplayName；id 只在调用方没给的时候才用这里的。
            //
            // 插件是拿文件名当 trader id 传进来的，那条路径的行为一个字都不能变（所以调用方优先）。
            // 但**调用方不传 id 时必须认这一行**：不认的话 Parse(text, null) 之后再 Write，
            // 头一行就会写成 `trader:  "SORA"` —— id 被洗掉，文件直接废。
            // 编辑器这边就是这么用的，第一次接对话挂接时正好踩到。
            case "trader":
                var display = Regex.Match(v, "\"(.*)\"");
                t.DisplayName = display.Success ? display.Groups[1].Value : null;
                if (string.IsNullOrEmpty(t.TraderId))
                {
                    var id = Regex.Match(v, @"^\s*(\S+)").Groups[1].Value;
                    if (id.Length > 0 && !id.StartsWith("\"")) t.TraderId = id;
                }
                break;
            case "start": t.Start = v; break;
            case "first": t.First = v; break;
            case "actor": t.Actor = v; break;
            case "scene": t.Scene = v; break;
            // 只认 `tab: if <任务>=<状态>`。别的写法（4.0.13 的 `tab: always` 就是）进不了模型，
            // 那就必须原文留住 —— 不留的话回写时 HeadLine("tab") 拿不到 TabQuestId 会返回 null，
            // 整行**从作者的文件里消失**，而且一声不吭。when 一直是这么处理的，这里照办。
            case "tab":
                if (v.StartsWith("if ")) t.TabQuestId = DialogParser.Gate(v.Substring(3), t.TabStatuses, t, ln);
                else
                {
                    t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: tab 只认 'if <任务>=<状态>'", $"Line {ln}: tab only accepts 'if <quest>=<status>'"));
                    KeepRaw(t, line);
                }
                break;
            case "when":
                var w = Regex.Match(v, @"^(.*?)\s*->\s*(\S+)$");
                var rule = new WhenRule { Node = w.Groups[2].Value };
                const string condPattern = @"(level|standing)\s*(>=|<=)\s*([-+\d.]+)";
                foreach (Match c in Regex.Matches(w.Groups[1].Value, condPattern))
                    rule.Conds.Add(new WhenCond { Field = c.Groups[1].Value, LessEq = c.Groups[2].Value == "<=", Value = DialogParser.Num(c.Groups[3].Value) });
                if (Regex.Replace(w.Groups[1].Value, condPattern, "").Trim().Length > 0 ||
                    System.Linq.Enumerable.Any(System.Linq.Enumerable.Cast<Match>(Regex.Matches(w.Groups[1].Value, condPattern)), c => !DialogParser.TryNum(c.Groups[3].Value, out _)))
                    DialogParser.Loss(t, ln, "invalid when condition");
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
