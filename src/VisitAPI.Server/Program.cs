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
    /// 还开着的 <c>/live</c> 长连接数量。**这才是最可靠的那个信号。**
    ///
    /// 之前只靠两样东西判断"页面还在不在"：定时报到（浏览器会把后台标签页的定时器掐到每分钟一次）
    /// 和 <c>pagehide</c> 时发的那一发告别（页面卸载途中发出去，浏览器不保证一定送到，
    /// 关掉整个窗口时尤其容易丢）。两样都是"请页面帮个忙"，帮不上就只能干等 3 分钟超时——
    /// 线上反馈的"关了标签页程序还赖着"就是这么来的。
    ///
    /// 长连接不一样：**标签页一没，socket 就断，是操作系统告诉我们的，不用页面配合。**
    /// 服务端每 20 秒往里写一个注释帧保活，页面被冻结也不影响连接本身。
    /// </summary>
    static int _clients;
    /// <summary>连接数掉到 0 的时刻。0 表示"现在有人连着"。</summary>
    static long _zeroAt;
    /// <summary>至少成功连上过一次。没有的话（浏览器太老 / EventSource 被拦）就退回旧的超时逻辑。</summary>
    static bool _everLive;

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
        // 指了个不存在的目录时**必须吭声**。不吭声就会悄悄回退到"上次记住的那个"，
        // 人看着命令行以为在改 A，其实在改 B —— 自动化测试里踩过一次，查了半天才发现。
        var rootOk = argRoot != null && ws.SetRoot(argRoot);
        if (argRoot != null && !rootOk)
            Console.WriteLine($"--root 目录不存在，已忽略 / no such folder, ignored: {argRoot}");
        if (!rootOk)
        {
            if (!ws.HasRoot) ws.AutoDetect(AppContext.BaseDirectory);
            else ws.AutoDetect(ws.Root);      // 只为把 EftRoot 认出来
        }
        // 任务库是**独立**的一条线：没装 VisitAPI 的人照样要能编任务。
        // 命令行 > 记住的 > 自动挑一个（优先已经有 quests 的那个 mod）
        var argQ = args.FirstOrDefault(a => a.StartsWith("--quests="))?.Substring(9);
        if (argQ != null)
        {
            if (!ws.SetQuestDb(argQ))
                Console.WriteLine($"--quests 目录用不了，已忽略 / unusable folder, ignored: {argQ}");
        }
        else if (!ws.HasQuestDb)
        {
            var pick = ws.ScanQuestRoots().FirstOrDefault(x => x.HasQuests);
            if (pick.Path != null) ws.SetQuestDb(pick.Path);
        }
        // 内容库（BOT 外观 / 商人货架）也是独立一条线，理由见 Workspace.ModDb。
        // **只在恰好探测到一个时才自作主张**：0 个或 2 个以上都交给界面让作者挑，
        // 替他猜错目录比让他点一下更烦人。
        var argM = args.FirstOrDefault(a => a.StartsWith("--mods="))?.Substring(7);
        if (argM != null)
        {
            if (!ws.SetModDb(argM))
                Console.WriteLine($"--mods 目录用不了，已忽略 / unusable folder, ignored: {argM}");
        }
        else if (!ws.HasModDb)
        {
            var found = ws.ScanModRoots();
            if (found.Count == 1) ws.SetModDb(found[0].Path);
        }

        var b = WebApplication.CreateBuilder(args);
        b.Logging.ClearProviders();                 // ASP.NET 默认日志太吵，控制台留给我们自己说话
        // 只绑回环地址。绝不能绑 0.0.0.0——那等于把「随便读写你硬盘」开放给整个局域网。
        b.WebHost.UseUrls(url);
        var app = b.Build();

        FileApi.Map(app, ws);
        QuestApi.Map(app, ws);
        ModsApi.Map(app, ws);
        BotApi.Map(app, ws);
        AssortApi.Map(app, ws);
        BackupApi.Map(app, ws);
        ProjectApi.Map(app, ws);
        app.MapGet("/", () => Ui("index.html", ws));
        // 界面拆成了多份（index.html + quest.css/js），这条把 wwwroot 里其余的静态资源放出来。
        // 资源名是编译期固定的字符串，取不到就是 404，`..` 穿越不出去。
        app.MapGet("/ui/{name}", (string name) => Ui(name, ws));
        // 报到。顺手撤销待退出标记：能报到就说明刚才那声"我要走了"是刷新，不是关页面。
        app.MapGet("/api/ping", () =>
        {
            Volatile.Write(ref _lastPing, DateTime.UtcNow.Ticks);
            Volatile.Write(ref _byeAt, 0);
            return Results.Ok();
        });

        // 页面在不在，看这条长连接还通不通（见 _clients 上的注释）。
        // **挂在 /api 外面**：EventSource 发不了自定义头，令牌只能走查询串，和 /media、/qimg 同一套。
        app.MapGet("/live", async (HttpContext ctx, string? t) =>
        {
            if (t != ws.Token) { ctx.Response.StatusCode = 403; return; }
            Interlocked.Increment(ref _clients);
            Volatile.Write(ref _zeroAt, 0);
            Volatile.Write(ref _byeAt, 0);          // 连上了就说明刚才那声告别是刷新
            Volatile.Write(ref _lastPing, DateTime.UtcNow.Ticks);
            _everLive = true;
            ctx.Response.Headers["Cache-Control"] = "no-store";
            ctx.Response.Headers["X-Accel-Buffering"] = "no";
            ctx.Response.ContentType = "text/event-stream";
            try
            {
                while (!ctx.RequestAborted.IsCancellationRequested)
                {
                    // 冒号开头是 SSE 的注释帧，客户端不会当成消息，纯粹用来保活
                    await ctx.Response.WriteAsync(": hi\n\n", ctx.RequestAborted);
                    await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
                    await Task.Delay(TimeSpan.FromSeconds(20), ctx.RequestAborted);
                }
            }
            catch (OperationCanceledException) { /* 页面走了，正常路径 */ }
            finally
            {
                if (Interlocked.Decrement(ref _clients) == 0)
                    Volatile.Write(ref _zeroAt, DateTime.UtcNow.Ticks);
            }
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
        // 找不到任务库不是"缺了 VisitAPI"——任务编辑早就和 VisitAPI 解绑了，
        // 界面会把这台机器上能放任务的地方列出来让人挑，所以这里别再报某个具体路径。
        Console.WriteLine(ws.HasQuestDb
            ? $"任务库 / Quests    : {ws.QuestDb}"
            : "没找到任务库，界面里会让你挑一个 / Quest DB not found — the page will let you pick one.");
        Console.WriteLine(ws.HasModDb
            ? $"内容库 / Content   : {ws.ModDb}"
            : "没定内容库（BOT 外观 / 商人货架），界面里会让你挑 / Content folder not set — the page will let you pick.");
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
    /// 偏好也在这儿整包注进 <c>window.PREFS</c>：端口随机挑导致 localStorage 每次启动都是新的，
    /// 只有服务端下发才能让语言/主题在脚本第一行就拿到、不闪一下错误的样子。
    /// （JsonSerializer 默认把小于号转义成 <，注进 script 块不会被内容截断。）
    /// </summary>
    static IResult Ui(string name, Workspace ws)
    {
        var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("ui/" + name);
        if (s == null) return Results.NotFound($"界面资源缺失: {name}");
        if (!name.EndsWith(".html")) return Results.Stream(s, Mime(name));
        using var r = new StreamReader(s);
        var prefs = System.Text.Json.JsonSerializer.Serialize(ws.Prefs);
        var html = r.ReadToEnd().Replace("<!--TOKEN-->",
            $"<meta name=\"tok\" content=\"{ws.Token}\">\n<script>window.PREFS={prefs}</script>");
        return Results.Content(html, Mime(name));
    }

    static string Mime(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".png" => "image/png",
        ".ico" => "image/x-icon",
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
            if (Volatile.Read(ref _clients) > 0) return;      // 有连接＝页面确实还开着，别的信号都不用看

            var zeroAt = Volatile.Read(ref _zeroAt);
            var byeAt = Volatile.Read(ref _byeAt);
            // 长连接断了，或者页面说了声"我要走了"——两条都只是**开始计时**，宽限期是为了分辨 F5
            var closed = (zeroAt != 0 && now - zeroAt > ByeGrace.Ticks)
                      || (byeAt != 0 && now - byeAt > ByeGrace.Ticks);
            // 从来没连上过长连接（浏览器不支持 / 被拦），那就只能退回旧的静默超时
            var silent = !_everLive && now - Volatile.Read(ref _lastPing) > Idle.Ticks;
            if (!closed && !silent) return;
            Console.WriteLine(closed ? "页面已关闭，退出。/ Page closed, shutting down."
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
