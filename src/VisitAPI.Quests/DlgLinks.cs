using VisitAPI.Dialog;

namespace VisitAPI.Quests;

/// <summary>一条挂接：某个 .dlg 的某个节点的某个选项，按下去会对某个任务做某件事。</summary>
public sealed record DlgLink(string File, string Node, int Opt, string Text, string Action, string QuestId, int? Status = null);

/// <summary>.dlg 头部的触发点：玩家走到哪、按什么键会打开这段对话。
/// <para><c>QuestId</c>/<c>Status</c> = 出现条件里点名的任务；<c>Accept</c>/<c>Finish</c>/<c>Fail</c> = 走到就发/判完成/判作废的任务。
/// 触发点也是任务的入口——只看对话选项的话，用触发点接任务的剧本会被误判成"玩家接不到"。</para></summary>
public sealed record DlgTrigger(string File, string Kind, string Place, string Node,
                                string QuestId, string Status, string Prompt,
                                string? Accept = null, string? Finish = null, string? Fail = null);

/// <summary>
/// 任务 ↔ 对话之间那根线。
///
/// 任务不是凭空出现的，它是 .dlg 里某个选项被按下才发生的。这层关系原先只存在于
/// .dlg 的文本里，任务编辑器完全看不见 —— 这个类把它读出来，并且**由 C# 独占回写**。
///
/// **回写必须走 DialogWriter，不能让前端拼字符串。** 前端那份 JS 的 toDlg() 已经因为
/// 漏吐字段丢过一次数据（见 Memory 阶段 5）；.dlg 里还有作者写的注释和手填坐标，
/// 挂接只替换目标选项行，其余原文字节由 TextFile 保留；选项语法仍交给 DialogWriter。
/// </summary>
public static class DlgLinks
{
    public static readonly string[] Actions = ["accept", "complete", "handover", "setstatus"];

    /// <summary>扫工作区里所有 .dlg（`.dlg.demo` 是插件带的示例，不算数）。</summary>
    public static IEnumerable<string> Files(string dlgDir) =>
        Directory.Exists(dlgDir)
            ? Directory.GetFiles(dlgDir, "*.dlg").Where(x => Path.GetFileNameWithoutExtension(x).Length == 24)
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            : [];

    /// <summary>一处引用不到任何任务的 id：哪个文件、写的是什么。</summary>
    public sealed record DlgBadId(string File, string Id);

    public static (List<DlgLink> Links, List<DlgTrigger> Triggers, Dictionary<string, string> Broken, List<DlgBadId> BadIds)
        Scan(string dlgDir)
    {
        var links = new List<DlgLink>(); var trigs = new List<DlgTrigger>();
        var broken = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var badIds = new List<DlgBadId>();
        foreach (var path in Files(dlgDir))
        {
            var name = Path.GetFileName(path);
            DialogTree t;
            try { t = DialogParser.Parse(File.ReadAllText(path), null); }
            catch (Exception e) { broken[name] = e.Message; continue; }

            // 解析器在别名收口处已经把非法 id 记成警告了，这里挑出来按文件归位
            foreach (var w in t.Warnings)
            {
                // 不带引号的警告（触发器类型错、缺坐标）q 是 -1，再拿 q-1 去 LastIndexOf 直接抛 →
                // 一份 .dlg 就让 /api/quests/links 500（2026-09-08 审查）。先判再取。
                var q = w.LastIndexOf('\''); if (q <= 0) continue;
                var p = w.LastIndexOf('\'', q - 1);
                if (p >= 0 && (w.Contains("24 位十六进制") || w.Contains("24 hex")))
                    badIds.Add(new DlgBadId(name, w.Substring(p + 1, q - p - 1)));
            }

            foreach (var n in t.Nodes.Values)
                for (var i = 0; i < n.Options.Count; i++)
                    foreach (var (act, id) in Acts(n.Options[i]))
                        links.Add(new DlgLink(name, n.Name, i, n.Options[i].Text ?? "", act, id,
                            act == "setstatus" ? n.Options[i].SetStatusValue : null));

            // 有出现条件、或者会对任务做点什么的，都要列出来（原来只列前者）
            foreach (var g in t.Triggers)
                if (!string.IsNullOrEmpty(g.IfQuestId) || g.AcceptId != null || g.FinishId != null || g.FailId != null)
                    trigs.Add(new DlgTrigger(name, g.Kind, g.Place, g.Node, g.IfQuestId ?? "",
                        string.Join("/", g.IfStatuses.Select(StatusName)), g.Prompt,
                        g.AcceptId, g.FinishId, g.FailId));
        }
        return (links, trigs, broken, badIds);
    }

    /// <summary>一扇门：某个选项（Opt ≥ 0）或触发点（Opt = -1）只在某任务处于某些状态时才出现。</summary>
    public sealed record DlgGate(string File, string Node, int Opt, string Text, string QuestId, int[] Statuses);

    /// <summary>扫出所有「仅当某任务处于某状态」的选项和触发点（10-01：推演这扇门是不是永远过不了，见 QuestValidator 的 gate_never_*）。读不动的文件跳过——那是 Scan 的 Broken 去报的事。</summary>
    public static List<DlgGate> Gates(string dlgDir)
    {
        var gates = new List<DlgGate>();
        foreach (var path in Files(dlgDir))
        {
            DialogTree t;
            try { t = DialogParser.Parse(File.ReadAllText(path), null); } catch { continue; }
            var name = Path.GetFileName(path);
            foreach (var n in t.Nodes.Values)
                for (var i = 0; i < n.Options.Count; i++)
                    if (n.Options[i].IfQuestId is { Length: > 0 } q) gates.Add(new DlgGate(name, n.Name, i, n.Options[i].Text ?? "", q, [.. n.Options[i].IfStatuses]));
            foreach (var g in t.Triggers)
                if (!string.IsNullOrEmpty(g.IfQuestId)) gates.Add(new DlgGate(name, g.Node ?? "", -1, g.Prompt ?? "", g.IfQuestId, [.. g.IfStatuses]));
        }
        return gates;
    }

    static IEnumerable<(string Act, string Id)> Acts(DialogOption o)
    {
        foreach (var id in o.AcceptIds) yield return ("accept", id);
        foreach (var id in o.CompleteIds) yield return ("complete", id);
        if (o.HandoverId != null) yield return ("handover", o.HandoverId);
        if (o.SetStatusId != null) yield return ("setstatus", o.SetStatusId);
    }

    static readonly string[] Names =
        ["Locked", "AvailableForStart", "Started", "AvailableForFinish", "Success", "Fail"];
    static string StatusName(int i) => i >= 0 && i < Names.Length ? Names[i] : i.ToString();

    /// <summary>挂上 / 摘掉一条挂接。改的是 .dlg，不是任务 json。</summary>
    public static string? Apply(string dlgDir, string file, string node, int opt,
                                string action, string questId, bool add)
    {
        if (!Actions.Contains(action)) return "bad_action";
        if (!SafeName.Ok(file) || !file.EndsWith(".dlg", StringComparison.OrdinalIgnoreCase)) return "bad_name";
        if (questId.Length != 24 || !questId.All(Uri.IsHexDigit)) return "bad_quest_id";
        var path = Path.Combine(dlgDir, file);
        if (!File.Exists(path)) return "no_file";

        var source = File.ReadAllText(path);
        var t = DialogParser.Parse(source, null);
        if (t.UnsafeToRewrite) return "unsafe_source";
        if (!t.Nodes.TryGetValue(node, out var n)) return "no_node";
        if (opt < 0 || opt >= n.Options.Count) return "no_option";
        var o = n.Options[opt];
        var before = DialogWriter.OptionText(t, o);

        // accept/complete 一个选项能挂多个任务（加进列表 / 只摘自己那条）；handover/setstatus 仍是单字段
        switch (action)
        {
            case "accept":    if (add) { if (!o.AcceptIds.Contains(questId)) o.AcceptIds.Add(questId); } else o.AcceptIds.Remove(questId); break;
            case "complete":  if (add) { if (!o.CompleteIds.Contains(questId)) o.CompleteIds.Add(questId); } else o.CompleteIds.Remove(questId); break;
            case "handover":  o.HandoverId  = add ? questId : Clear(o.HandoverId, questId);
                              if (!add && o.HandoverId == null) o.HandoverLabel = null; break;
            case "setstatus": o.SetStatusId = add ? questId : Clear(o.SetStatusId, questId); break;
        }

        var after = DialogWriter.OptionText(t, o);
        if (before == after) return null;
        var lines = source.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var current = ""; var index = -1;
        for (var i = 0; i < lines.Length; i++)
        {
            var trimmed = lines[i].Trim();
            var head = System.Text.RegularExpressions.Regex.Match(trimmed, @"^<([A-Za-z0-9_.\-]+)>");
            if (head.Success) { current = head.Groups[1].Value; index = -1; }
            if (current != node || !(trimmed.StartsWith("- ") || trimmed == "-")) continue;
            if (++index != opt) continue;
            lines[i] = lines[i][..(lines[i].Length - lines[i].TrimStart().Length)] + after;
            // External writers can change files independently of the editor's request queue.
            if (File.ReadAllText(path) != source) return "stale";
            TextFile.Write(path, string.Join("\n", lines));
            return null;
        }
        return "no_option";
    }

    /// <summary>只摘自己那条：字段上挂的是别的任务就别乱动。</summary>
    static string? Clear(string? cur, string questId) => cur == questId ? null : cur;
}
