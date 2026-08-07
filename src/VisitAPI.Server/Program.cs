using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;

namespace VisitAPI.Server;

public static class Program
{
    /// <summary>浏览器最后一次报到的时间。标签页被关掉后就不再报到，服务端据此自杀。</summary>
    static DateTime _lastPing = DateTime.UtcNow;

    public static void Main(string[] args)
    {
        var port = FreePort();
        var url = $"http://127.0.0.1:{port}";

        var ws = new Workspace();
        // 工作区来源优先级：命令行 > 自动探测（exe 往上找 BepInEx）> 上次填过的
        var argRoot = args.FirstOrDefault(a => a.StartsWith("--root="))?.Substring(7);
        if (argRoot != null) ws.SetRoot(argRoot);
        else if (!ws.AutoDetect(AppContext.BaseDirectory)) ws.LoadRemembered();

        var b = WebApplication.CreateBuilder(args);
        b.Logging.ClearProviders();                 // ASP.NET 默认日志太吵，控制台留给我们自己说话
        // 只绑回环地址。绝不能绑 0.0.0.0——那等于把「随便读写你硬盘」开放给整个局域网。
        b.WebHost.UseUrls(url);
        var app = b.Build();

        FileApi.Map(app, ws);
        app.MapGet("/", () => Ui("index.html", ws.Token));
        app.MapGet("/api/ping", () => { _lastPing = DateTime.UtcNow; return Results.Ok(); });
        app.MapPost("/api/quit", (IHostApplicationLifetime life) => { life.StopApplication(); return Results.Ok(); });

        WatchBrowser(app.Lifetime);
        // --no-browser: 不自动开浏览器。自动化测试要用（否则弹出的标签页会一直替它报到，
        // 心跳超时永远测不出来），远程/无头跑也用得上。
        if (!args.Contains("--no-browser")) OpenBrowser(url);

        Console.WriteLine($"VisitAPI Editor  [{BuildStamp()}]  →  {url}");
        Console.WriteLine(ws.HasRoot ? $"工作区: {ws.Root}" : "工作区: 未设置（界面里会让你指一次）");
        Console.WriteLine("关掉浏览器标签页会自动退出；也可以直接关掉这个窗口。");
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
    /// 没人看着就别占着进程：界面每 10 秒报到一次，超过 40 秒没动静就认为标签页关了，自己退出。
    ///
    /// 只用超时判断，不让页面在关闭时主动发退出信号——因为浏览器的 pagehide 事件
    /// 按 F5 刷新时也会触发，那样用户一刷新服务端就死了，页面再也加载不出来（已实测踩到）。
    /// 40 秒也是给休眠、切后台节流留的余量，杀早了用户会莫名其妙。
    /// </summary>
    static void WatchBrowser(IHostApplicationLifetime life)
    {
        var t = new System.Threading.Timer(_ =>
        {
            if (DateTime.UtcNow - _lastPing > TimeSpan.FromSeconds(40))
            {
                Console.WriteLine("浏览器已关闭，退出。");
                life.StopApplication();
            }
        }, null, TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(5));
        life.ApplicationStopping.Register(() => t.Dispose());
    }

    /// <summary>UseShellExecute 才会交给系统去开默认浏览器；开不起来不算致命，打印地址让用户自己贴。</summary>
    static void OpenBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception e) { Console.WriteLine($"没能自动打开浏览器（{e.Message}），请手动访问上面的地址。"); }
    }
}
