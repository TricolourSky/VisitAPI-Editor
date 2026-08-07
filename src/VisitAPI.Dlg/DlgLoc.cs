using System;

namespace VisitAPI.Dialog;

/// <summary>
/// 库里唯一的语言挂钩。
///
/// 解析器会产生警告文案（"第 12 行: 未知指令 'xxx'"），这是库里唯一需要知道"当前是中文还是英文"的地方。
/// 但库不该去猜宿主怎么判断语言：插件问的是游戏的 LocalizationManager，编辑器问的是自己的设置项。
/// 所以库只留一个可替换的挂钩，两边各自注入。
///
/// 没人注入时默认吐中文——库能独立跑，不会因为忘了接线就崩。
/// </summary>
public static class DlgLoc
{
    /// <summary>宿主注入：给两段文案，返回该显示的那一段。</summary>
    public static Func<string, string, string> Picker;

    public static string Pick(string zh, string en) => Picker != null ? Picker(zh, en) : zh;
}
