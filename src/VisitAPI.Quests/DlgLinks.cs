using VisitAPI.Dialog;

namespace VisitAPI.Quests;

/// <summary>一条挂接：某个 .dlg 的某个节点的某个选项，按下去会对某个任务做某件事。</summary>
public sealed record DlgLink(string File, string Node, int Opt, string Text, string Action, string QuestId);

/// <summary>.dlg 头部的触发点：玩家走到哪、按什么键会打开这段对话；条件里点名了某个任务。</summary>
public sealed record DlgTrigger(string File, string Kind, string Place, string Node,
                                string QuestId, string Status, string Prompt);

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

    public static (List<DlgLink> Links, List<DlgTrigger> Triggers, Dictionary<string, string> Broken)
        Scan(string dlgDir)
    {
        var links = new List<DlgLink>(); var trigs = new List<DlgTrigger>();
        var broken = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Files(dlgDir))
        {
            var name = Path.GetFileName(path);
            DialogTree t;
            try { t = DialogParser.Parse(File.ReadAllText(path), null); }
            catch (Exception e) { broken[name] = e.Message; continue; }

            foreach (var n in t.Nodes.Values)
                for (var i = 0; i < n.Options.Count; i++)
                    foreach (var (act, id) in Acts(n.Options[i]))
                        links.Add(new DlgLink(name, n.Name, i, n.Options[i].Text ?? "", act, id));

            foreach (var g in t.Triggers)
                if (!string.IsNullOrEmpty(g.IfQuestId))
                    trigs.Add(new DlgTrigger(name, g.Kind, g.Place, g.Node, g.IfQuestId,
                        string.Join("/", g.IfStatuses.Select(StatusName)), g.Prompt));
        }
        return (links, trigs, broken);
    }

    static IEnumerable<(string Act, string Id)> Acts(DialogOption o)
    {
        if (o.AcceptId != null) yield return ("accept", o.AcceptId);
        if (o.CompleteId != null) yield return ("complete", o.CompleteId);
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

        // 一个选项上同一种动作只能挂一个任务：模型里就是一个字段，挂第二个等于覆盖
        switch (action)
        {
            case "accept":    o.AcceptId    = add ? questId : Clear(o.AcceptId, questId); break;
            case "complete":  o.CompleteId  = add ? questId : Clear(o.CompleteId, questId); break;
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
