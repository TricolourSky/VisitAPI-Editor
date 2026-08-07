using System.Security.Cryptography;

namespace VisitAPI.Server;

/// <summary>
/// 工作区 = 允许这个服务读写的根目录。
///
/// 这是一个能改你硬盘的本地服务，只靠"端口是随机的"根本不算防护，所以两道闸：
///   1. **令牌**：每次启动生成一个随机串，塞进页面里；所有 /api 都必须带上。
///      恶意网页因为跨域读不到我们的 HTML，就拿不到令牌 —— 挡住"你随便逛个站，
///      那站偷偷 POST 到 localhost 改你文件"。
///   2. **路径牢笼**：任何路径都必须落在 Root 之内，`..` 穿越一律拒绝。
/// </summary>
public sealed class Workspace
{
    public string Root { get; private set; } = "";
    public string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
    public bool HasRoot => Root.Length > 0;

    /// <summary>
    /// 找 .dlg 的家：`<EFT>\BepInEx\config\VisitAPI`。
    /// 从 exe 所在目录一路往上找 BepInEx —— 这样把 exe 丢进 EFT 根目录（或它的任意子目录）就能自动认出来。
    /// 认不到就返回 false，交给界面让用户填一次。
    /// </summary>
    public bool AutoDetect(string startDir)
    {
        for (var d = new DirectoryInfo(startDir); d != null; d = d.Parent)
        {
            var p = Path.Combine(d.FullName, "BepInEx", "config", "VisitAPI");
            if (Directory.Exists(p)) { Root = p; return true; }
        }
        return false;
    }

    /// <summary>记住上次用的目录，存在 exe 旁边。放服务端而不是浏览器 localStorage——清一次浏览器数据就没了。</summary>
    static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "visitapi-editor.txt");

    public bool SetRoot(string path)
    {
        if (!Directory.Exists(path)) return false;
        Root = Path.GetFullPath(path);
        try { File.WriteAllText(ConfigPath, Root); } catch { /* 记不住不算致命，下次再填一遍 */ }
        return true;
    }

    /// <summary>上次填过就直接用。自动探测失败时的第二道选择。</summary>
    public bool LoadRemembered()
    {
        try { return File.Exists(ConfigPath) && SetRoot(File.ReadAllText(ConfigPath).Trim()); }
        catch { return false; }
    }

    /// <summary>把外面传进来的路径钉死在 Root 里；越界或不存在的根一律返回 null。</summary>
    public string? Resolve(string relative)
    {
        if (!HasRoot) return null;
        var full = Path.GetFullPath(Path.Combine(Root, relative ?? ""));
        var root = Root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return full == Root.TrimEnd(Path.DirectorySeparatorChar) || full.StartsWith(root, StringComparison.OrdinalIgnoreCase)
            ? full : null;
    }
}
