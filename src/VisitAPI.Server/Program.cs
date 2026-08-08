using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;

namespace VisitAPI.Server;

public static class Program
{
    // 下面两个时刻由请求线程写、定时器线程读，所以都存成 long（UTC ticks）：
    // 64 位下 long 的读写是原子的，而 DateTime? 是 16 字节，撕裂读能读出"有值但时间是垃圾"的组合。

    /// <summary>浏览器最后一次报到的时间。标签页被关掉后就不再报到，服务端据此自杀。</summary>
    static long _lastPing = DateTime.UtcNow.Ticks;

    /// <summary>
    /// 页面说"我要走了"的时刻（关标签页 / 关窗口 / 刷新都会发），0 表示没有待处理的告别。
    /// 不能收到就退——**F5 刷新也会发这一发**，那样一刷新服务端就没了。
    /// 所以只记时刻，等 <see cref="ByeGrace"/> 这段宽限期；期间只要有新的 ping 进来（＝页面又活了，
    /// 说明刚才是刷新不是关闭），就把它撤销。
    /// </summary>
    static long _byeAt;
    static readonly TimeSpan ByeGrace = TimeSpan.FromSeconds(10);

    /// <summary>
    /// 多久没报到就认为页面没了。
    ///
    /// **这个值不能按"心跳间隔的几倍"来拍。** 浏览器会掐后台标签页的定时器：
    /// Chromium 系在标签页隐藏满 5 分钟后进入 intensive throttling，把 setInterval 压到
    /// **每分钟最多一次**。原来这里是 40 秒，于是用户切去看个视频十几分钟，服务端就自己退了，
    /// 页面还开着——线上遇到的就是这个。留 3 分钟，够扛三次被掐掉的心跳。
    /// </summary>
    static readonly TimeSpan Idle = TimeSpan.FromMinutes(3);

    public static void Main(string[] args)
    {
        var port = FreePort();
        var url = $"http://127.0.0.1:{port}";

        var ws = new Workspace();
        // **先读记忆再应用命令行**：反过来的话，SetRoot 会先落一次盘，
        // 把文件里还没读到的行（比如 trader=）冲掉 —— 踩过一次。
        ws.LoadRemembered();
        // 工作区（.dlg）来源优先级：命令行 > 记住的 > 自动探测（exe 往上找 BepInEx）
        var argRoot = args.FirstOrDefault(a => a.StartsWith("--root="))?.Substring(7);
        if (argRoot != null) ws.SetRoot(argRoot);
        else if (!ws.HasRoot) ws.AutoDetect(AppContext.BaseDirectory);
        else ws.AutoDetect(ws.Root);          // 只为把 EftRoot 认出来
        // 任务库是**独立**的一条线：没装 VisitAPI 的人照样要能编任务。
        // 命令行 > 记住的 > 自动挑一个（优先已经有 quests 的那个 mod）
        var argQ = args.FirstOrDefault(a => a.StartsWith("--quests="))?.Substring(9);
        if (argQ != null) ws.SetQuestDb(argQ);
        else if (!ws.HasQuestDb)
        {
            var pick = ws.ScanQuestRoots().FirstOrDefault(x => x.HasQuests);
            if (pick.Path != null) ws.SetQuestDb(pick.Path);
        }

        var b = WebApplication.CreateBuilder(args);
        b.Logging.ClearProviders();                 // ASP.NET 默认日志太吵，控制台留给我们自己说话
        // 只绑回环地址。绝不能绑 0.0.0.0——那等于把「随便读写你硬盘」开放给整个局域网。
        b.WebHost.UseUrls(url);
        var app = b.Build();

        FileApi.Map(app, ws);
        QuestApi.Map(app, ws);
        app.MapGet("/", () => Ui("index.html", ws.Token));
        // 界面拆成了多份（index.html + quest.css/js），这条把 wwwroot 里其余的静态资源放出来。
        // 资源名是编译期固定的字符串，取不到就是 404，`..` 穿越不出去。
        app.MapGet("/ui/{name}", (string name) => Ui(name, ws.Token));
        // 报到。顺手撤销待退出标记：能报到就说明刚才那声"我要走了"是刷新，不是关页面。
        app.MapGet("/api/ping", () =>
        {
            Volatile.Write(ref _lastPing, DateTime.UtcNow.Ticks);
            Volatile.Write(ref _byeAt, 0);
            return Results.Ok();
        });
        // 页面卸载时发这一发（关标签页/关窗口/刷新都会发）。真关还是刷新，交给宽限期去分辨。
        app.MapPost("/api/bye", () => { Volatile.Write(ref _byeAt, DateTime.UtcNow.Ticks); return Results.Ok(); });
        app.MapPost("/api/quit", (IHostApplicationLifetime life) => { life.StopApplication(); return Results.Ok(); });

        WatchBrowser(app.Lifetime);
        // --no-browser: 不自动开浏览器。自动化测试要用（否则弹出的标签页会一直替它报到，
        // 心跳超时永远测不出来），远程/无头跑也用得上。
        if (!args.Contains("--no-browser")) OpenBrowser(url);

        // 这个控制台最终用户会看到，所以中英双语。界面的语言开关在浏览器里，
        // 这里还没连上页面，拿不到那个偏好，只能两种都印。
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine($"VisitAPI Editor  [{BuildStamp()}]  →  {url}");
        Console.WriteLine(ws.HasRoot
            ? $"工作区 / Workspace : {ws.Root}"
            : "工作区未设置，界面里会让你指一次 / Workspace not set — the page will ask once.");
        Console.WriteLine(ws.HasQuestDb
            ? $"任务库 / Quests    : {ws.QuestDb}"
            : "没找到任务库（缺 SPT_Runtime\\user\\mods\\VisitAPI-Server\\db）/ Quest DB not found.");
        Console.WriteLine("关掉浏览器标签页会自动退出。/ Closing the browser tab shuts this down.");
        app.Run();
    }

    /// <summary>
    /// 版本 + 构建时间，形如 <c>0.1.0+b260808-0030</c>（UTC）。
    ///
    /// 加它是因为踩过一次：exe 拷到别处之后不会自动更新，跑着旧版本却以为是新功能坏了，白查一轮。
    /// **值来自编译期写进程序集的 InformationalVersion，不是文件修改时间** ——
    /// 后者在用户从 Release 下载后会变成下载时间，显示出来是假的。
    /// </summary>
    public static string BuildStamp() =>
        Assembly.GetExecutingAssembly()
            .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "?";

    /// <summary>问系统要一个当前空闲的端口：绑 :0 让系统分配，记下号再放掉。</summary>
    static int FreePort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    /// <summary>
    /// 界面整包嵌在 exe 里（见 csproj），按逻辑名取出来直接返回。
    /// 页面里塞一个 <c>&lt;meta name="tok"&gt;</c> 把本次运行的令牌带过去——这是前端唯一的令牌来源。
    /// </summary>
    static IResult Ui(string name, string token)
    {
        var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("ui/" + name);
        if (s == null) return Results.NotFound($"界面资源缺失: {name}");
        if (!name.EndsWith(".html")) return Results.Stream(s, Mime(name));
        using var r = new StreamReader(s);
        var html = r.ReadToEnd().Replace("<!--TOKEN-->", $"<meta name=\"tok\" content=\"{token}\">");
        return Results.Content(html, Mime(name));
    }

    static string Mime(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".mp4" => "video/mp4",
        _ => "application/octet-stream",
    };

    /// <summary>
    /// 没人看着就别占着进程。两条路子一起用：
    ///
    /// 1. **页面主动告别**（快）：关标签页时发 <c>/api/bye</c>，等 10 秒宽限期没人再报到就退出。
    ///    宽限期是为了区分"关闭"和"F5 刷新"——两者都会触发 pagehide，直接退会让刷新变成杀进程。
    /// 2. **静默超时**（兜底）：浏览器崩了、进程被杀、告别那一发没发出去时，靠 <see cref="Idle"/> 收场。
    ///
    /// 超时值定得很宽是有原因的，见 <see cref="Idle"/> 上的注释：后台标签页的定时器会被浏览器掐。
    /// </summary>
    static void WatchBrowser(IHostApplicationLifetime life)
    {
        var t = new System.Threading.Timer(_ =>
        {
            // 各读一次存进局部变量：读两遍的话，中间来一发 ping 就能读出自相矛盾的组合
            var now = DateTime.UtcNow.Ticks;
            var byeAt = Volatile.Read(ref _byeAt);
            var bye = byeAt != 0 && now - byeAt > ByeGrace.Ticks;
            if (!bye && now - Volatile.Read(ref _lastPing) <= Idle.Ticks) return;
            Console.WriteLine(bye ? "页面已关闭，退出。/ Page closed, shutting down."
                                  : "页面长时间没有响应，退出。/ Page went silent, shutting down.");
            life.StopApplication();
        }, null, TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(3));
        life.ApplicationStopping.Register(() => t.Dispose());
    }

    /// <summary>UseShellExecute 才会交给系统去开默认浏览器；开不起来不算致命，打印地址让用户自己贴。</summary>
    static void OpenBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception e) { Console.WriteLine($"没能自动打开浏览器（{e.Message}），请手动访问上面的地址。"); }
    }
}
