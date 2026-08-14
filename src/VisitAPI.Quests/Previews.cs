namespace VisitAPI.Quests;

/// <summary>
/// 外观预览图：<c>&lt;模组db&gt;\previews\&lt;外观id&gt;.png</c>（jpg / jpeg / webp 也认）。
///
/// 为什么要有：BOT 外观选择器里全是 24 位十六进制加一个名字，作者自己做的衣服长什么样
/// **只有他自己知道**。游戏里没有现成的缩略图，也做不了实时预览，所以约定一个目录让他自己放图。
///
/// **BOT 的图也放这里**，文件名用 bot 类型：<c>previews\assault.png</c>。
/// bot 类型是小写单词、外观 id 是 24 位十六进制，**不可能撞名**，所以一个目录一条路由两边都管。
///
/// **没有图不是错误** —— 界面会画一个带首字的色块顶上，随时补图随时生效。
/// </summary>
public static class Previews
{
    public const string Dir = "previews";

    static readonly string[] Ext = [".png", ".jpg", ".jpeg", ".webp"];

    /// <summary>这个模组已经放了图的外观 id。界面拿它决定"画图还是画色块"，省得每张都去撞一次 404。</summary>
    public static HashSet<string> Have(string modDb)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var dir = Path.Combine(modDb, Dir);
        if (modDb.Length == 0 || !Directory.Exists(dir)) return set;
        foreach (var f in Directory.GetFiles(dir))
            if (Ext.Contains(Path.GetExtension(f).ToLowerInvariant()))
                set.Add(Path.GetFileNameWithoutExtension(f));
        return set;
    }

    /// <summary>
    /// 把 id 解成真实文件路径。
    /// **只收裸 id，路径是服务端自己拼的** —— 外面传进来的东西一律当文件名用，
    /// 带上目录分隔符或 <c>..</c> 直接拒，免得这个口子变成"随便读你硬盘"。
    /// </summary>
    public static string? Resolve(string modDb, string id)
    {
        if (modDb.Length == 0 || string.IsNullOrWhiteSpace(id)) return null;
        if (id.Contains('/') || id.Contains('\\') || id.Contains("..")) return null;
        foreach (var e in Ext)
        {
            var p = Path.Combine(modDb, Dir, id + e);
            if (File.Exists(p)) return p;
        }
        return null;
    }

    public static string Mime(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => "image/jpeg",
    };
}
