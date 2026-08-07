using System;
using System.Text.RegularExpressions;

namespace VisitAPI.Dialog;

internal static class TriggerParser
{
    static readonly Regex Vec = new(@"\(([^)]+)\)");
    static readonly Regex Quote = new("\"([^\"]*)\"");

    internal static void Parse(DialogTree t, string v, int ln)
    {
        var tr = new DialogTrigger { Raw = v };   // 原文留底，回写时优先照抄（见 DialogTrigger.Raw 注释）
        var q = Quote.Match(v);
        if (q.Success) { tr.Prompt = q.Groups[1].Value; v = Quote.Replace(v, "", 1); }
        var vec = Vec.Match(v);
        var xyz = vec.Success ? vec.Groups[1].Value.Split(',') : null;
        if (xyz == null || xyz.Length != 3) { t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 触发器缺少 (x, y, z) 坐标", $"Line {ln}: trigger is missing (x, y, z)")); return; }
        tr.X = (float)DialogParser.Num(xyz[0]); tr.Y = (float)DialogParser.Num(xyz[1]); tr.Z = (float)DialogParser.Num(xyz[2]);
        v = Vec.Replace(v, "", 1);
        var tok = v.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        tr.Kind = tok.Length > 0 ? tok[0].ToLowerInvariant() : "";
        if (tr.Kind != "raid" && tr.Kind != "hideout") { t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 触发器类型须为 raid 或 hideout", $"Line {ln}: trigger type must be raid or hideout")); return; }
        tr.Place = tok.Length > 1 ? tok[1] : "*";
        for (var i = 2; i < tok.Length; i++)
            switch (tok[i].ToLowerInvariant())
            {
                case "dist": tr.Dist = (float)DialogParser.Num(N(tok, ++i)); break;
                case "radius": tr.Radius = (float)DialogParser.Num(N(tok, ++i)); break;
                case "hit": tr.Radius = (float)DialogParser.Num(N(tok, ++i)); tr.Free = true; break;
                case "node": tr.Node = N(tok, ++i); break;
                case "if": tr.IfQuestId = DialogParser.Gate(N(tok, ++i), tr.IfStatuses, t, ln); break;
                case "free": case "door": tr.Free = true; break;
                default: t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 未知触发器参数 '{tok[i]}'", $"Line {ln}: unknown trigger parameter '{tok[i]}'")); break;
            }
        t.Triggers.Add(tr);
    }

    static string N(string[] tok, int i) => i < tok.Length ? tok[i] : "";
}
