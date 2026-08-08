namespace VisitAPI.Quests;

/// <summary>
/// 读 json 文件的字节，**顺手把 UTF-8 BOM 去掉**。
///
/// `JsonDocument.Parse(byte[])` 不认 BOM，见到 EF BB BF 直接抛
/// "'0xEF' is an invalid start of a value"。而 Windows 上一堆工具（记事本、
/// PowerShell 的 Set-Content -Encoding UTF8）默认就写 BOM —— 别人 mod 里带 BOM 的
/// json 很常见。不处理的话，那个 mod 的商人会**从列表里静默消失**，
/// 界面上只剩一个"未知商人"，谁也想不到是 BOM 干的。
/// </summary>
public static class JsonBytes
{
    public static byte[] Read(string path)
    {
        var b = File.ReadAllBytes(path);
        return b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF ? b[3..] : b;
    }
}
