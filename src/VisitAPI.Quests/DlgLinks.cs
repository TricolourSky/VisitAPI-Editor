using VisitAPI.Dialog;

namespace VisitAPI.Quests;

/// <summary>一条挂接：某个 .dlg 的某个节点的某个选项，按下去会对某个任务做某件事。</summary>
public sealed record DlgLink(string File, string Node, int Opt, string Text, string Action, string QuestId);

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
/// 只有 DialogWriter 会原样吐回。所以这里的做法是：解析 → 改模型 → 整份重写。
/// </summary>
public static class DlgLinks
{
    public static readonly string[] Actions = ["accept", "complete", "handover", "setstatus"];

    /// <summary>扫工作区里所有 .dlg（`.dlg.demo` 是插件带的示例，不算数）。</summary>
    public static IEnumerable<string> Files(string dlgDir) =>
        Directory.Exists(dlgDir)
            ? Directory.GetFiles(dlgDir, "*.dlg").OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
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
                var q = w.LastIndexOf('\''); var p = w.LastIndexOf('\'', q - 1);
                if (q > 0 && p >= 0 && (w.Contains("24 位十六进制") || w.Contains("24 hex")))
                    badIds.Add(new DlgBadId(name, w.Substring(p + 1, q - p - 1)));
            }

            foreach (var n in t.Nodes.Values)
                for (var i = 0; i < n.Options.Count; i++)
                    foreach (var (act, id) in Acts(n.Options[i]))
                        links.Add(new DlgLink(name, n.Name, i, n.Options[i].Text ?? "", act, id));

            // 有出现条件、或者会对任务做点什么的，都要列出来（原来只列前者）
            foreach (var g in t.Triggers)
                if (!string.IsNullOrEmpty(g.IfQuestId) || g.AcceptId != null || g.FinishId != null || g.FailId != null)
                    trigs.Add(new DlgTrigger(name, g.Kind, g.Place, g.Node, g.IfQuestId ?? "",
                        string.Join("/", g.IfStatuses.Select(StatusName)), g.Prompt,
                        g.AcceptId, g.FinishId, g.FailId));
        }
        return (links, trigs, broken, badIds);
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
        var path = Path.Combine(dlgDir, file);
        if (!File.Exists(path)) return "no_file";

        var t = DialogParser.Parse(File.ReadAllText(path), null);
        if (!t.Nodes.TryGetValue(node, out var n)) return "no_node";
        if (opt < 0 || opt >= n.Options.Count) return "no_option";
        var o = n.Options[opt];

        // accept/complete 一个选项能挂多个任务（加进列表 / 只摘自己那条）；handover/setstatus 仍是单字段
        switch (action)
        {
            case "accept":    if (add) { if (!o.AcceptIds.Contains(questId)) o.AcceptIds.Add(questId); } else o.AcceptIds.Remove(questId); break;
            case "complete":  if (add) { if (!o.CompleteIds.Contains(questId)) o.CompleteIds.Add(questId); } else o.CompleteIds.Remove(questId); break;
            case "handover":  o.HandoverId  = add ? questId : Clear(o.HandoverId, questId);
                              if (!add && o.HandoverId == null) o.HandoverLabel = null; break;
            case "setstatus": o.SetStatusId = add ? questId : Clear(o.SetStatusId, questId); break;
        }

        File.Copy(path, path + ".bak", true);        // 别人几十小时写的剧本，存错一次就毁了
        File.WriteAllText(path, DialogWriter.Write(t));
        return null;
    }

    /// <summary>只摘自己那条：字段上挂的是别的任务就别乱动。</summary>
    static string? Clear(string? cur, string questId) => cur == questId ? null : cur;
}
