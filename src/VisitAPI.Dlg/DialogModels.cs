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

    /// <summary>
    /// 台词排在第几条旁白之后。**旁白可以写在台词后面**，而模型把这一屏拆成了
    /// Narration[] 和 NpcText 两个字段 —— 不记这个下标，行序在解析那一刻就丢了，
    /// 存一次盘台词后面的旁白就被永久挪到前面去（作者看不见任何提示）。
    /// -1 = 没记过，按老规矩当"台词在所有旁白之后"。
    /// </summary>
    public int NpcAt = -1;

    /// <summary>钳好的 <see cref="NpcAt"/>：写手和插件都按它切，两边才不会各算各的。</summary>
    public int NpcSlot => NpcAt < 0 || NpcAt > Narration.Count ? Narration.Count : NpcAt;
}

public class NarrationLine
{
    public string Text, Bg, Anim, Audio;
    public List<string> Lead = new();
}

public class DialogOption
{
    public string Text, Target, HandoverId, HandoverLabel, SetStatusId, IfQuestId, IfNotQuestId, StandingTraderId;
    // accept: / complete: 可以一次写多个任务（空格隔开）。AcceptId/CompleteId 是"第一个"的快捷口，老代码照用
    public List<string> AcceptIds = new(), CompleteIds = new();
    public string AcceptId { get => AcceptIds.Count > 0 ? AcceptIds[0] : null; set { AcceptIds.Clear(); if (value != null) AcceptIds.Add(value); } }
    public string CompleteId { get => CompleteIds.Count > 0 ? CompleteIds[0] : null; set { CompleteIds.Clear(); if (value != null) CompleteIds.Add(value); } }
    public int SetStatusValue = 3;
    // 分支记号：set: 名字=整数 记一笔到玩家档案；ifvar: 名字=整数 只在记号等于该值时显示
    public string SetVarName, IfVarName;
    public int SetVarValue, IfVarValue;
    public double StandingDelta;
    public bool Once, Always;
    /// <summary>`ifitems` / `ifitems: 任务`：**背包里有东西可交**时这个选项才显示（宽松：有一件就算）。
    /// <para><see cref="IfItemsId"/> 为 null 时用同一选项 <see cref="HandoverId"/> 的那条任务。
    /// 它是**追加**的一条门控，不替换 <c>handover:</c> 自动补的「任务处于进行中」。</para></summary>
    public bool IfItems;
    public string IfItemsId;
    public List<int> IfStatuses = new(), IfNotStatuses = new();
    public List<string> Lead = new();
}

public class WhenCond { public string Field; public bool LessEq; public double Value; }

public class WhenRule { public string Node; public List<WhenCond> Conds = new(); }

public class DialogTrigger
{
    public string Kind, Place, Node, Prompt, IfQuestId, AcceptId, FinishId, FailId;
    public List<int> IfStatuses = new();
    public float X, Y, Z, Dist = 3f, Radius = 1.2f;
    public float Enter = -1f;   // 进图 N 秒后自动起爆；-1 = 普通坐标触发点
    public bool Free, Auto;
    public bool Once;   // 触发过就永久不再弹（客户端记进 <traderId>.seen.json，按档案区分）；1.3 新增可选参数

    /// <summary>
    /// 解析时这一行的原文。回写优先用它，坐标就不会被浮点格式化改样子
    /// （作者手填的 <c>0.09</c> 会被重新生成成 <c>0.090000003576</c>，`1.50` 会变成 `1.5`——
    /// 数值没变但文件被无谓地改花了）。
    /// **改动任何触发器字段后必须把这里置 null**，否则回写会吐出旧内容。
    /// **编辑器现在能编辑触发器了**（trigEdit），所以这条铁律是活的：改字段必置 null。
    /// </summary>
    public string Raw;
}
