using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

/// <summary>
/// 四个存储器（任务 / 文案 / 货架 / BOT 外观）共用的写盘规矩（2026-09-08 审查）：
/// <list type="bullet">
/// <item><b>照原样式写</b>：读入时记下换行（CRLF/LF）、缩进（几个空格或 Tab）、有没有 BOM，写回时复原。
///       原来一律 CRLF + 2 空格 + 无 BOM，作者 LF + 4 空格的文件第一次保存哪怕一个字没改也整份 diff。</item>
/// <item><b>内容没变就不写</b>：前端每次把全部文件都送回来，服务端原来无条件 Copy(.bak) + Write ——
///       改 B 存一次、再改 A 存一次，B 的 .bak 已经是当前内容，上一代没了。相同就跳过，.bak 只在真覆盖时才换。</item>
/// <item><b>原子写</b>：先写 .tmp 再 Move 顶上，断电/崩溃不留半截文件。</item>
/// </list>
/// </summary>
public static class JsonFile
{
    /// <summary>一份文件的样式。默认 = 原来的写法（CRLF、2 空格、无 BOM），新文件也用它。</summary>
    public sealed record Style(bool Bom, string NewLine, int Indent, char IndentChar)
    {
        public static readonly Style Default = new(false, Environment.NewLine, 2, ' ');
    }

    /// <summary>读一眼文件的样式；读不到就用默认。缩进看第一行以空白开头的行。</summary>
    public static Style Sniff(string path)
    {
        try
        {
            var bytes = File.ReadAllBytes(path);
            var bom = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF;
            var text = Encoding.UTF8.GetString(bytes, bom ? 3 : 0, bytes.Length - (bom ? 3 : 0));
            var nl = text.Contains("\r\n") ? "\r\n" : "\n";
            foreach (var line in text.Split('\n'))
            {
                var n = 0; while (n < line.Length && (line[n] == ' ' || line[n] == '\t')) n++;
                if (n > 0 && n < line.Length) return new Style(bom, nl, n, line[0]);
            }
            return new Style(bom, nl, 2, ' ');
        }
        catch { return Style.Default; }
    }

    static readonly Encoding Utf8NoBom = new UTF8Encoding(false), Utf8Bom = new UTF8Encoding(true);

    /// <summary>按样式序列化。中文不转 \uXXXX（作者要用记事本看）。</summary>
    public static string Render(JsonNode node, Style? style)
    {
        var s = style ?? Style.Default;
        var opt = new JsonSerializerOptions
        {
            WriteIndented = true, IndentSize = Math.Clamp(s.Indent, 1, 8), IndentCharacter = s.IndentChar == '\t' ? '\t' : ' ',
            NewLine = s.NewLine, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };
        return node.ToJsonString(opt);
    }

    /// <summary>写回。返回 false = 内容和盘上一致，什么都没动（也没换 .bak）。</summary>
    public static bool Write(string path, JsonNode node, Style? style)
    {
        var s = style ?? Style.Default;
        // ⚠️ Encoding.GetBytes 从不带 BOM（前导只有 StreamWriter 那条路会写），要自己拼上，否则 BOM 文件永远「不一致」→ 每次都重写、还把 BOM 丢了
        var body = Utf8NoBom.GetBytes(Render(node, s));
        var bytes = s.Bom ? Utf8Bom.GetPreamble().Concat(body).ToArray() : body;
        if (File.Exists(path))
        {
            var old = File.ReadAllBytes(path);
            if (old.AsSpan().SequenceEqual(bytes)) return false;
            File.Copy(path, path + ".bak", true);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, bytes);
        File.Move(tmp, path, true);
        return true;
    }
}
