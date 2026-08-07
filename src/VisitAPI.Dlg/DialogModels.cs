using System.Collections.Generic;

namespace VisitAPI.Dialog;

/// <summary>
/// 文件头的一行"原样记录"。回写时按这个顺序重放：注释和不认识的行原文吐回，
/// 可编辑的行（start/trigger/when…）从模型重新生成。
/// 不记这个的话，回写会把作者写的注释和行序全洗掉——SORA 剧本里那两条坐标注释就是这么丢的。
/// </summary>
public class HeadLine
{
    public string Kind;   // raw / trader / start / first / actor / scene / tab / when / trigger / quest
    public int Index;     // when / trigger / quest：指向对应列表的下标
    public string Raw;    // Kind == "raw" 时的原文
}

public class DialogTree
{
    public string TraderId, DisplayName, Start = "root", First, Actor, Scene, TabQuestId;
    public List<int> TabStatuses = new();
    public List<WhenRule> WhenRules = new();
    public List<DialogTrigger> Triggers = new();
    public Dictionary<string, string> QuestAliases = new();
    public List<string> QuestAliasOrder = new();     // 别名按出现顺序，回写要照原序吐
    public Dictionary<string, DialogNode> Nodes = new();
    public List<HeadLine> HeadRaw = new();
    public List<string> Warnings = new();
}

public class DialogNode
{
    public string Name, Bg, Anim, Bgm, NpcText, NpcAudio, JumpTo;
    public List<NarrationLine> Narration = new();
    public List<DialogOption> Options = new();
    // 注释挂在"它后面那个元素"上，回写时先吐注释再吐元素 —— 一个字都不会丢
    public List<string> Lead = new(), NpcLead = new(), JumpLead = new(), Tail = new();
}

public class NarrationLine
{
    public string Text, Bg, Anim, Audio;
    public List<string> Lead = new();
}

public class DialogOption
{
    public string Text, Target, AcceptId, CompleteId, HandoverId, HandoverLabel, SetStatusId, IfQuestId, IfNotQuestId, StandingTraderId;
    public int SetStatusValue = 3;
    public double StandingDelta;
    public bool Once, Always;
    public List<int> IfStatuses = new(), IfNotStatuses = new();
    public List<string> Lead = new();
}

public class WhenCond { public string Field; public bool LessEq; public double Value; }

public class WhenRule { public string Node; public List<WhenCond> Conds = new(); }

public class DialogTrigger
{
    public string Kind, Place, Node, Prompt, IfQuestId;
    public List<int> IfStatuses = new();
    public float X, Y, Z, Dist = 3f, Radius = 1.2f;
    public bool Free;

    /// <summary>
    /// 解析时这一行的原文。回写优先用它，坐标就不会被浮点格式化改样子
    /// （作者手填的 <c>0.09</c> 会被重新生成成 <c>0.090000003576</c>，`1.50` 会变成 `1.5`——
    /// 数值没变但文件被无谓地改花了）。
    /// **改动任何触发器字段后必须把这里置 null**，否则回写会吐出旧内容。
    /// 目前编辑器还不支持编辑触发器，所以还没有这个风险。
    /// </summary>
    public string Raw;
}
