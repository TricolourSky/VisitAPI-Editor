namespace VisitAPI.Quests;

/// <summary>
/// 任务卡上那张图。两个来源：SPT 自带的 332 张，和作者自己模组里的那份。
///
/// **SPT 只会自动伺服 <c>SPT_Data\images</c> 一处**（服务端 <c>ImageRouteImporter</c> 里写死的），
/// 模组目录下的图必须由那个模组自己调 <c>imageRouter.AddRoute</c> 注册，否则进游戏就是一片空白。
/// VisitAPI-Server 会注册自己 <c>images\quest\icon</c> 下的图；别的模组得自己做。
///
/// 还有一条：SPT 的路由键**不带扩展名**（收到请求也会先切掉扩展名再查表），
/// 所以任务 json 里写 <c>.jpg</c> 而磁盘上是 <c>.png</c> 照样能对上——原版就是这么写的。
/// </summary>
public static class QuestImages
{
    static readonly string[] Ext = [".png", ".jpg", ".jpeg", ".bmp"];

    /// <summary>SPT 自带的任务图标目录。</summary>
    public static string SptDir(string eftRoot) => eftRoot.Length == 0 ? ""
        : Path.Combine(eftRoot, "SPT_Runtime", "SPT_Data", "images", "quest", "icon");

    /// <summary>任务库是 <c>&lt;模组&gt;\db</c>，图按 SPT 的惯例放在 <c>&lt;模组&gt;\images\quest\icon</c>。</summary>
    public static string ModDir(string questDb) => questDb.Length == 0 ? ""
        : Path.Combine(Directory.GetParent(questDb)?.FullName ?? "", "images", "quest", "icon");

    /// <summary>模组目录名，界面拿它判断是不是 VisitAPI-Server（只有它会替你注册图片）。</summary>
    public static string ModName(string questDb) => questDb.Length == 0 ? ""
        : Directory.GetParent(questDb)?.Name ?? "";

    public static List<string> List(string dir)
    {
        if (dir.Length == 0 || !Directory.Exists(dir)) return [];
        return Directory.GetFiles(dir)
            .Where(f => Ext.Contains(Path.GetExtension(f).ToLowerInvariant()))
            .Select(Path.GetFileName)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToList()!;
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
        if (dir.Length == 0 || nameOrRef.Length == 0 || !Directory.Exists(dir)) return null;
        var last = nameOrRef.Replace('\\', '/').Split('/')[^1];
        if (last != Path.GetFileName(last) || last.Length == 0) return null;
        var stem = last.Split('.')[0];
        if (stem.Length == 0) return null;
        foreach (var e in Ext)
        {
            var full = Path.Combine(dir, stem + e);
            if (File.Exists(full)) return full;
        }
        return null;
    }

    /// <summary>先找作者自己模组里的，再找 SPT 自带的——同名时作者的那张覆盖原版，和游戏里一致。</summary>
    public static string? ResolveAny(string eftRoot, string questDb, string nameOrRef) =>
        Resolve(ModDir(questDb), nameOrRef) ?? Resolve(SptDir(eftRoot), nameOrRef);

    public static string Mime(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".bmp" => "image/bmp",
        _ => "image/jpeg",
    };

    /// <summary>
    /// 写进任务 json 的那个值。SPT 两边都会切掉扩展名，所以带不带都能对上——
    /// 这里跟原版保持一致，带上真实扩展名。
    /// </summary>
    public static string Ref(string fileName) => "/files/quest/icon/" + fileName;

    /// <summary>
    /// 文件名里有点号就废了：SPT 切扩展名用的是"截到第一个点"，<c>a.b.png</c> 会被切成 <c>a</c>，
    /// 两张这样的图还会互相覆盖。界面据此提前拦下来。
    /// </summary>
    public static bool NameOk(string fileName) =>
        Path.GetFileNameWithoutExtension(fileName).IndexOf('.') < 0;
}
