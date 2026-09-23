using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace VisitAPI.Dialog;

/// <summary>
/// 译文行（2026-09-23 SORA 定的「写法 A」）：`en: 译文` **紧跟**在它翻译的那一行下面，只放文字、不带任何指令，缩进随意（解析时整行 Trim）。
/// 能翻的行：旁白（`>`）、台词、选项（`- `）、触发点的提示语（`trigger:` 行的下一行）、`trader:` 的名字。
/// 没译文的行游戏显示原文；语言代码只认 SPT 的 17 种（SPT_Data\database\locales\global 的文件名），别的前缀不算译文行。
/// 插件按 Loc.Code（配置 Language：auto = 游戏语言）取字；编辑器的语言页签写的就是这些行。
/// 文件头里译文行和原行之间不能夹空行 / 注释（那两样在文件头是「原样行」，会把归属截断）。
/// </summary>
public static class DialogLangs
{
    public static readonly string[] Codes = { "ch", "cz", "en", "es", "es-mx", "fr", "ge", "hu", "it", "jp", "kr", "pl", "po", "ro", "ru", "sk", "tu" };
    static readonly Regex Line = new(@"^(ch|cz|en|es|es-mx|fr|ge|hu|it|jp|kr|pl|po|ro|ru|sk|tu):\s?(.*)$", RegexOptions.Compiled);

    /// <summary>这一行（已 Trim）是不是译文行；是就给出语言和文字（文字两头去空）。</summary>
    public static bool TryMatch(string line, out string lang, out string text)
    {
        var m = Line.Match(line ?? "");
        lang = m.Success ? m.Groups[1].Value : null;
        text = m.Success ? m.Groups[2].Value.Trim() : null;
        return m.Success;
    }

    /// <summary>按语言取字：有这种语言的译文就用译文，否则用原文。</summary>
    public static string Pick(Dictionary<string, string> tr, string lang, string fallback) =>
        tr != null && lang != null && tr.TryGetValue(lang, out var t) && !string.IsNullOrEmpty(t) ? t : fallback;

    /// <summary>回写顺序固定按 Codes 排；文件里手写的顺序会被归一——归一不是丢数据（同 DialogWriter 的 setstatus 那条）。</summary>
    public static IEnumerable<KeyValuePair<string, string>> Ordered(Dictionary<string, string> tr) =>
        tr == null ? Enumerable.Empty<KeyValuePair<string, string>>()
                   : Codes.Where(c => tr.TryGetValue(c, out var v) && !string.IsNullOrEmpty(v)).Select(c => new KeyValuePair<string, string>(c, tr[c]));

    /// <summary>写手用：把译文吐成紧跟原行的几行（每行两个空格缩进），没有译文就是空串。</summary>
    public static string Lines(Dictionary<string, string> tr)
    {
        var sb = new StringBuilder();
        foreach (var kv in Ordered(tr)) sb.Append("\n  ").Append(kv.Key).Append(": ").Append(kv.Value);
        return sb.ToString();
    }
}
