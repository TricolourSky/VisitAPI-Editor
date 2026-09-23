using VisitAPI.Packs;

namespace VisitAPI.Quests;

/// <summary>
/// 任务卡上那张图。两个来源：SPT 自带的 332 张，和作者自己模组里的那份。
///
/// **SPT 只会自动伺服 <c>SPT_Data\images</c> 一处**（服务端 <c>ImageRouteImporter</c> 里写死的），
/// 模组目录下的图必须由那个模组自己调 <c>imageRouter.AddRoute</c> 注册，否则进游戏就是一片空白。
/// VisitAPI-Server 会注册自己各个包里的图；别的模组得自己做。
///
/// 还有一条：SPT 的路由键**不带扩展名**（收到请求也会先切掉扩展名再查表），
/// 所以任务 json 里写 <c>.jpg</c> 而磁盘上是 <c>.png</c> 照样能对上——原版就是这么写的。
///
/// 09-23 内容包：任务库可以是 <c>&lt;模组&gt;\packs\&lt;包&gt;</c>（图在包内 <c>images\banners</c> = 横幅、<c>images\icons</c> = 章节图标，
/// 路由仍是 1.1 的 <c>/files/quest/icon</c> 和 <c>/files/quest/chapters_icon</c>，映射在 PackLayout），
/// 也可以是老的 <c>&lt;模组&gt;\db</c>（图在 <c>&lt;模组&gt;\images\quest\&lt;路由&gt;</c>）。
/// </summary>
public static class QuestImages
{
    static readonly string[] Ext = [".png", ".jpg", ".jpeg", ".bmp"];

    /// <summary>SPT 自带的任务图标目录。</summary>
    public static string SptDir(string eftRoot) => eftRoot.Length == 0 ? ""
        : Path.Combine(eftRoot, "SPT_Runtime", "SPT_Data", "images", "quest", "icon");

    /// <summary>任务库是不是一个内容包（上一层叫 packs）。</summary>
    public static bool IsPack(string questDb) => questDb.Length > 0
        && string.Equals(Directory.GetParent(Path.TrimEndingDirectorySeparator(questDb))?.Name, PackLayout.PacksDir, StringComparison.OrdinalIgnoreCase);

    /// <summary>任务库所属的模组目录：包 → 上上层；老布局 → 上一层。</summary>
    public static string ModRoot(string questDb)
    {
        var parent = questDb.Length == 0 ? null : Directory.GetParent(Path.TrimEndingDirectorySeparator(questDb));
        if (parent == null) return "";
        return IsPack(questDb) ? parent.Parent?.FullName ?? "" : parent.FullName;
    }

    /// <summary>图片区的根：包 → <c>&lt;包&gt;\images</c>；老布局 → <c>&lt;模组&gt;\images\quest</c>。</summary>
    public static string ImagesRoot(string questDb) => questDb.Length == 0 ? ""
        : IsPack(questDb) ? Path.Combine(questDb, "images") : Path.Combine(ModRoot(questDb), "images", "quest");

    /// <summary>横幅格（路由 icon）：包里叫 <c>banners</c>（老名字也认），老布局是 <c>images\quest\icon</c>。界面显示和存新图都用它。</summary>
    public static string ModDir(string questDb) => questDb.Length == 0 ? ""
        : RouteDir(ImagesRoot(questDb), "icon") ?? Path.Combine(ImagesRoot(questDb), IsPack(questDb) ? PackLayout.FolderOf("icon") : "icon");

    /// <summary>界面上怎么称呼这个库：包 → 「模组/包」，老布局 → 模组名。</summary>
    public static string ModName(string questDb)
    {
        if (questDb.Length == 0) return "";
        var mod = Path.GetFileName(Path.TrimEndingDirectorySeparator(ModRoot(questDb)));
        return IsPack(questDb) ? mod + "/" + Path.GetFileName(Path.TrimEndingDirectorySeparator(questDb)) : mod;
    }

    /// <summary>
    /// 这个库会不会由插件替作者把图注册上去（目前只有 VisitAPI-Server 会）。
    ///
    /// **认 DLL 不认目录名。** 为了排加载顺序把目录改成 <c>z_VisitAPI-Server</c> 这类是常见做法，
    /// 硬比目录名的话，那种情况下会平白冒出一句"你的图不会生效"——一句吓人的假警报。
    /// 名字兜底是给模组还没编译出来、只有 db 的时候用的。
    /// </summary>
    public static bool Registers(string questDb) => RegistersMod(ModRoot(questDb));

    public static bool RegistersMod(string modDir) => modDir.Length > 0
        && (File.Exists(Path.Combine(modDir, "VisitAPI-Server.dll"))
            || Path.GetFileName(Path.TrimEndingDirectorySeparator(modDir)).IndexOf("VisitAPI-Server", StringComparison.OrdinalIgnoreCase) >= 0);

    public static List<string> List(string dir)
    {
        if (dir.Length == 0 || !Directory.Exists(dir)) return [];
        return Directory.GetFiles(dir)
            .Where(f => Ext.Contains(Path.GetExtension(f).ToLowerInvariant()))
            .Select(Path.GetFileName)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToList()!;
    }

    /// <summary>路由段 → 目录：先原名（icon / chapters_icon，SPT 和老布局），再包内的人话名（banners / icons），再 quest\原名（原样搬进包的）。</summary>
    static string? RouteDir(string root, string route)
    {
        if (root.Length == 0) return null;
        foreach (var cand in new[] { Path.Combine(root, route), Path.Combine(root, PackLayout.FolderOf(route)), Path.Combine(root, "quest", route) })
            if (Directory.Exists(cand) && !File.GetAttributes(cand).HasFlag(FileAttributes.ReparsePoint)) return cand;
        return null;
    }

    /// <summary>列出 <c>&lt;路由&gt;/&lt;文件&gt;</c>：图片根下每个子目录（包里还看 quest\ 下一层）按 PackLayout 映射成路由段。</summary>
    public static List<string> Routes(string iconDir)
    {
        var root = iconDir.Length == 0 ? "" : Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(iconDir))!;
        if (!Directory.Exists(root)) return [];
        static IEnumerable<string> Dirs(string r) => Directory.GetDirectories(r).Where(d => !File.GetAttributes(d).HasFlag(FileAttributes.ReparsePoint));
        var dirs = Dirs(root).Where(d => !Path.GetFileName(d).Equals("quest", StringComparison.OrdinalIgnoreCase)).ToList();
        var quest = Path.Combine(root, "quest");
        if (Directory.Exists(quest) && !Path.GetFileName(root).Equals("quest", StringComparison.OrdinalIgnoreCase)) dirs.AddRange(Dirs(quest));
        return dirs.SelectMany(d => List(d).Select(f => PackLayout.RouteOf(Path.GetFileName(d)) + "/" + f))
            .Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>
    /// 把界面传来的东西还原成磁盘上的图。传进来的可能是裸文件名，也可能是任务 json 里那个
    /// <c>/files/quest/icon/xxx.png</c>，两种都认。
    ///
    /// 匹配规则**照抄 SPT**：截到第一个点为止再比。原版任务 json 写的是 <c>.jpg</c>、
    /// 磁盘上却是 <c>.png</c>，只按全名找的话原版任务的图一张都预览不出来。
    ///
    /// 安全上只认单层文件名：取最后一段，带 <c>..</c> 或目录分隔符的到不了这一步。
    /// 这个接口直接把字节吐出去，松一点就是一个任意读文件的洞。
    /// </summary>
    public static string? Resolve(string dir, string nameOrRef)
    {
        if (dir.Length == 0 || nameOrRef.Length == 0) return null;
        const string prefix = "/files/quest/";
        var name = nameOrRef.Replace('\\', '/');
        if (name.StartsWith(prefix, StringComparison.Ordinal)) name = name[prefix.Length..];
        var parts = name.Split('/');
        if (parts.Length > 2 || parts.Any(p => !SafeName.Ok(p))) return null;
        if (parts.Length == 2) dir = RouteDir(Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(dir))!, parts[0]) ?? "";
        if (dir.Length == 0 || !Directory.Exists(dir) || File.GetAttributes(dir).HasFlag(FileAttributes.ReparsePoint)) return null;
        var last = parts[^1];
        if (!SafeName.Ok(last)) return null;
        var stem = last.Split('.')[0];
        if (stem.Length == 0) return null;
        foreach (var e in Ext)
        {
            var full = Path.Combine(dir, stem + e);
            if (File.Exists(full)) return full;
        }
        return null;
    }

    /// <summary>先找作者自己库里的，再找 SPT 自带的——同名时作者的那张覆盖原版，和游戏里一致。</summary>
    public static string? ResolveAny(string eftRoot, string questDb, string nameOrRef) =>
        Resolve(ModDir(questDb), nameOrRef) ?? Resolve(SptDir(eftRoot), nameOrRef);

    public static string Mime(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".bmp" => "image/bmp",
        _ => "image/jpeg",
    };
}
