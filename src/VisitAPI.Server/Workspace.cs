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
    /// 实际布局（已在 D:\EFT 上核对）：
    ///   &lt;EFT&gt;\BepInEx\config\VisitAPI                   ← Root，放 .dlg / backgrounds / audio
    ///   &lt;EFT&gt;\SPT_Runtime\user\mods\&lt;某个mod&gt;\db      ← QuestDb，放 quests\*.json 和 locales\*.json
    ///   &lt;EFT&gt;\SPT_Runtime\SPT_Data\database             ← SptData，物品表 / 地图表 / 商人表
    ///
    /// **EftRoot 不再从 Root 推。** 任务编辑对没装 VisitAPI 的人也该能用，
    /// 而那种情况下 BepInEx\config\VisitAPI 根本不存在。改成从 exe 自己的位置往上找。
    /// </summary>
    public string EftRoot { get; private set; } = "";
    public string SptData => EftRoot.Length == 0 ? ""
        : Path.Combine(EftRoot, "SPT_Runtime", "SPT_Data", "database");

    /// <summary>
    /// 任务库的落脚点，**可以由用户随便指**。
    /// 之所以不写死成 VisitAPI-Server：SPT 本身没有"把 json 丢进某个目录就会加载"的机制，
    /// 是各家 mod 自己的加载器去读 `自己DLL目录\db\quests`（VisitAPI-Server 就是这么干的）。
    /// 所以"存到哪"本来就该由作者决定 —— 他给哪个 mod 写任务，就存到哪个 mod 下面。
    /// </summary>
    public string QuestDb { get; private set; } = "";
    public bool HasQuestDb => QuestDb.Length > 0 && Directory.Exists(QuestDb);

    /// <summary>
    /// **内容库**：BOT 外观和商人货架住的模组 db 目录。
    ///
    /// 为什么不和 <see cref="QuestDb"/> 共用一个：任务和这两样虽然都在 <c>&lt;某个mod&gt;\db</c> 底下，
    /// 但**未必是同一个模组** —— 作者可能给 A 模组写任务、同时编 B 模组的商人。
    /// 共用一个的话，切内容库会把任务库一起拖走。
    ///
    /// 来源优先级：命令行 <c>--mods=</c> &gt; 记住的 &gt; 自动探测（见 <see cref="Quests.ModLooks.ScanRoots"/>）。
    /// 探测到 1 个直接用；0 个或 2 个以上交给界面让作者挑。
    /// </summary>
    public string ModDb { get; private set; } = "";
    public bool HasModDb => ModDb.Length > 0 && Directory.Exists(ModDb);

    public List<Quests.ModRoot> ScanModRoots() => Quests.ModLooks.ScanRoots(EftRoot);

    public bool SetModDb(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        try
        {
            var full = Path.GetFullPath(path);
            Directory.CreateDirectory(full);          // 指到一个还不存在的目录＝从零开一个新模组
            ModDb = full;
            Save();
            return true;
        }
        catch { return false; }
    }

    /// <summary>把路径钉死在内容库里。和 Resolve 同一套牢笼，只是根不同。</summary>
    public string? ResolveMod(string relative)
    {
        if (!HasModDb) return null;
        var root = Path.GetFullPath(ModDb);
        var full = Path.GetFullPath(Path.Combine(root, relative ?? ""));
        var pre = root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return full == root.TrimEnd(Path.DirectorySeparatorChar) ||
               full.StartsWith(pre, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    /// <summary>从某个目录一路往上找 EFT 根（含 SPT_Runtime 或 BepInEx 的那一层）。</summary>
    static string FindEftFrom(string start)
    {
        for (var d = new DirectoryInfo(start); d != null; d = d.Parent)
            if (Directory.Exists(Path.Combine(d.FullName, "SPT_Runtime")) ||
                Directory.Exists(Path.Combine(d.FullName, "BepInEx")))
                return d.FullName;
        return "";
    }

    /// <summary>exe 在游戏目录里就能认出来；认不出再拿工作区兜一次底。</summary>
    void FindEft()
    {
        EftRoot = FindEftFrom(AppContext.BaseDirectory);
        if (EftRoot.Length == 0 && HasRoot) EftRoot = FindEftFrom(Root);
    }

    /// <summary>
    /// 扫出所有"看起来能放任务"的目录：`SPT_Runtime\user\mods\*\db`。
    /// 已经有 quests 子目录的排前面 —— 那些是确实在用这套约定的 mod。
    /// </summary>
    public List<(string Path, bool HasQuests, string Mod)> ScanQuestRoots()
    {
        var found = new List<(string, bool, string)>();
        if (EftRoot.Length == 0) return found;
        var mods = Path.Combine(EftRoot, "SPT_Runtime", "user", "mods");
        if (!Directory.Exists(mods)) return found;
        foreach (var m in Directory.GetDirectories(mods).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var db = Path.Combine(m, "db");
            if (!Directory.Exists(db)) continue;
            found.Add((db, Directory.Exists(Path.Combine(db, "quests")), Path.GetFileName(m)));
        }
        return found.OrderByDescending(x => x.Item2).ToList();
    }

    /// <summary>指定任务库。目录不存在就建出来（连 quests / locales 一起），作者能从零开一个新 mod 的任务。</summary>
    public bool SetQuestDb(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        try
        {
            var full = Path.GetFullPath(path);
            Directory.CreateDirectory(Path.Combine(full, "quests"));
            Directory.CreateDirectory(Path.Combine(full, "locales"));
            QuestDb = full;
            Save();
            return true;
        }
        catch { return false; }
    }

    /// <summary>把路径钉死在任务库里。和 Resolve 同一套牢笼，只是根不同。</summary>
    public string? ResolveQuest(string relative)
    {
        if (!HasQuestDb) return null;
        var root = Path.GetFullPath(QuestDb);
        var full = Path.GetFullPath(Path.Combine(root, relative ?? ""));
        var pre = root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return full == root.TrimEnd(Path.DirectorySeparatorChar) ||
               full.StartsWith(pre, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    /// <summary>
    /// 找 .dlg 的家：`<EFT>\BepInEx\config\VisitAPI`。
    /// 从 exe 所在目录一路往上找 BepInEx —— 这样把 exe 丢进 EFT 根目录（或它的任意子目录）就能自动认出来。
    /// 认不到就返回 false，交给界面让用户填一次。
    /// </summary>
    public bool AutoDetect(string startDir)
    {
        // EftRoot 先无条件认一次：没装 VisitAPI 的人也要能编任务，
        // 而任务库、物品表全挂在 EftRoot 下面，不能等 .dlg 目录找到了才去推
        FindEft();
        for (var d = new DirectoryInfo(startDir); d != null; d = d.Parent)
        {
            var p = Path.Combine(d.FullName, "BepInEx", "config", "VisitAPI");
            if (Directory.Exists(p)) { Root = p; return true; }
        }
        return false;
    }

    /// <summary>记住上次用的目录，存在 exe 旁边。放服务端而不是浏览器 localStorage——清一次浏览器数据就没了。</summary>
    static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "visitapi-editor.txt");

    /// <summary>
    /// 作者手动确认过"我知道有这个商人"的 id。
    ///
    /// 为什么需要：**给一个还没装、或还没适配当前 SPT 版本的商人 mod 写任务，是完全正常的作法**
    /// （SORA 就是这种情况 —— WTT 做的真商人，只是 mod 还停在 4.0.13）。
    /// 没有这个出口的话，那几条 unknown_trader 永远消不掉，久而久之作者就学会无视所有警告了。
    /// </summary>
    public HashSet<string> KnownTraders { get; } = new(StringComparer.OrdinalIgnoreCase);

    public void AckTrader(string id, bool on)
    {
        if (on) KnownTraders.Add(id); else KnownTraders.Remove(id);
        Save();
    }

    /// <summary>
    /// 界面偏好（语言 / 主题 / 指针开关 / 引导看过没 / 源码窗位置）。
    ///
    /// 为什么住在这儿而不是浏览器的 localStorage：**端口每次启动随机挑**，而浏览器按
    /// 「地址+端口」隔离存储 —— 端口一换，上次存的全部作废。症状就是新手引导每次都弹、
    /// 语言主题每次悄悄回默认。正本落在 visitapi-editor.txt 的 pref.* 行，
    /// 页面下发时整包注进 window.PREFS（见 Program.Ui），打开瞬间就有、不闪错主题。
    /// </summary>
    public Dictionary<string, string> Prefs { get; } = new(StringComparer.Ordinal);

    /// <summary>存一个偏好；值给空串＝删掉。键收得很紧、值不许换行——这文件是按行解析的。</summary>
    public bool SetPref(string key, string value)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(key ?? "", @"^[a-z][a-z0-9._-]{0,40}$")) return false;
        value ??= "";
        if (value.Length > 500 || value.Contains('\r') || value.Contains('\n')) return false;
        if (value.Length == 0) Prefs.Remove(key!); else Prefs[key!] = value;
        Save();
        return true;
    }

    void Save()
    {
        try
        {
            var lines = new List<string>();
            if (HasRoot) lines.Add("root=" + Root);
            if (QuestDb.Length > 0) lines.Add("quests=" + QuestDb);
            if (ModDb.Length > 0) lines.Add("mods=" + ModDb);
            foreach (var t in KnownTraders) lines.Add("trader=" + t);
            foreach (var (k, v) in Prefs) lines.Add("pref." + k + "=" + v);
            File.WriteAllLines(ConfigPath, lines);
        }
        catch { /* 记不住不算致命，下次再填一遍 */ }
    }

    /// <summary>只改内存，不落盘。载入配置时用它 —— 边读边写会把还没读到的行冲掉。</summary>
    bool ApplyRoot(string path)
    {
        if (!Directory.Exists(path)) return false;
        Root = Path.GetFullPath(path);
        FindEft();
        return true;
    }

    public bool SetRoot(string path)
    {
        if (!ApplyRoot(path)) return false;
        Save();
        return true;
    }

    /// <summary>
    /// 上次填过就直接用。自动探测失败时的第二道选择。
    /// **兼容老格式**：以前这个文件就是光秃秃一行工作区路径，别让老用户升级一次就丢设置。
    /// </summary>
    public void LoadRemembered()
    {
        try
        {
            if (!File.Exists(ConfigPath)) return;
            foreach (var raw in File.ReadAllLines(ConfigPath))
            {
                var line = raw.Trim();
                if (line.Length == 0) continue;
                var i = line.IndexOf('=');
                var key = i < 0 ? "root" : line.Substring(0, i).Trim().ToLowerInvariant();
                var val = i < 0 ? line : line.Substring(i + 1).Trim();
                if (key == "root") { if (!HasRoot) ApplyRoot(val); }
                else if (key == "quests" && Directory.Exists(val)) QuestDb = Path.GetFullPath(val);
                else if (key == "mods" && Directory.Exists(val)) ModDb = Path.GetFullPath(val);
                else if (key == "trader" && val.Length > 0) KnownTraders.Add(val);
                else if (key.StartsWith("pref.") && key.Length > 5 && val.Length > 0) Prefs[key.Substring(5)] = val;
            }
        }
        catch { /* 读不出来就当没记过 */ }
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
