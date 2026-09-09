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
        var hasXyz = xyz != null && xyz.Length == 3;
        if (hasXyz) { tr.X = (float)DialogParser.Num(xyz[0]); tr.Y = (float)DialogParser.Num(xyz[1]); tr.Z = (float)DialogParser.Num(xyz[2]); }
        if (vec.Success) v = Vec.Replace(v, "", 1);
        var tok = v.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);   // Tab 也算分隔：JS 那边 \s+ 认，这边不认的话整条触发点被插件忽略
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
                case "accept": tr.AcceptId = DialogParser.A(t, N(tok, ++i)); break;
                // 走到/进图就把某条任务判完成或判失败（剧情用：计划被打断时让原目标当场作废）。三者可同时写
                case "finish": tr.FinishId = DialogParser.A(t, N(tok, ++i)); break;
                case "fail": tr.FailId = DialogParser.A(t, N(tok, ++i)); break;
                case "auto": tr.Auto = true; break;
                case "once": tr.Once = true; break;
                case "enter": tr.Enter = (float)DialogParser.Num(N(tok, ++i)); break;
                case "free": case "door": tr.Free = true; break;
                default: t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 未知触发器参数 '{tok[i]}'", $"Line {ln}: unknown trigger parameter '{tok[i]}'")); break;
            }
        // 坐标只有 enter（进图计时起爆）能省，别的触发点没坐标就无从判距离
        if (!hasXyz && tr.Enter < 0f) { t.Warnings.Add(DlgLoc.Pick($"第 {ln} 行: 触发器缺少 (x, y, z) 坐标", $"Line {ln}: trigger is missing (x, y, z)")); return; }
        t.Triggers.Add(tr);
    }

    static string N(string[] tok, int i) => i < tok.Length ? tok[i] : "";
}
