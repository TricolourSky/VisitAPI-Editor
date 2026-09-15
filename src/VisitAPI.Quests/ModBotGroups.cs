namespace VisitAPI.Quests;

/// <summary>一个击杀目标组：<c>Roles</c> 整组写进 Kills 条件的 savageRole；<c>Boss</c> 只管界面上的小标。</summary>
public sealed record BotGroup(string Name, bool Boss, string[] Roles);

/// <summary>
/// 模组 BOT 的击杀目标组（SORA 2026-09-15 定：不逐个列角色，直接给「BlackDivision」「Wedge」两个选项）。
///
/// 这些角色是 BlackDivision 借 MoreBotsAPI 在代码里注册的，数据文件里只看得到一半，所以名字照本机
/// BepInEx 启动日志「Successfully added &lt;角色&gt; : &lt;编号&gt;」那 6 行写死：
/// Lead / Assault / Breacher / Support / Ib 是一组（像 Raider 那样），bossWedge 是 BOSS。
/// 只有这台机器装了 BlackDivision 才下发（认它自带的 <c>db\bots\sharedTypes\blackDiv.json</c>）——
/// 没装的机器写进任务，客户端认不出这个角色。离线扫，不连服务端（同 <see cref="ModItems"/>）。
/// </summary>
public static class ModBotGroups
{
    static readonly BotGroup[] BlackDivision =
    [
        new("BlackDivision", false, ["blackDivLead", "blackDivAssault", "blackDivBreacher", "blackDivSupport", "blackDivIb"]),
        new("Wedge", true, ["bossWedge"]),
    ];

    public static BotGroup[] Scan(string eftRoot)
    {
        if (eftRoot.Length == 0) return [];
        var mods = Path.Combine(eftRoot, "SPT_Runtime", "user", "mods");
        if (!Directory.Exists(mods)) return [];
        return Directory.GetDirectories(mods).Any(m => File.Exists(Path.Combine(m, "db", "bots", "sharedTypes", "blackDiv.json")))
            ? BlackDivision : [];
    }
}
