using VisitAPI.Dialog;

namespace VisitAPI.Server;

/// <summary>文件相关的接口。全部要求带令牌，全部走 Workspace 的路径牢笼。</summary>
public static class FileApi
{
    public static void Map(WebApplication app, Workspace ws)
    {
        // 令牌闸门：/api/* 一律先验令牌（/api/ping 除外——它不碰文件，只用来判断页面还开着）
        app.Use(async (ctx, next) =>
        {
            var p = ctx.Request.Path.Value ?? "";
            if (p.StartsWith("/api/") && p != "/api/ping" &&
                ctx.Request.Headers["X-Token"] != ws.Token)
            {
                ctx.Response.StatusCode = 403;
                await ctx.Response.WriteAsync("bad token");
                return;
            }
            await next();
        });

        app.MapGet("/api/workspace", () => Results.Json(new
        {
            root = ws.Root,
            ok = ws.HasRoot,
            build = Program.BuildStamp(),
            // 界面用这两个解释"为什么没素材"：是工作区没指对，还是目录真的空
            hasBg = ws.HasRoot && Directory.Exists(ws.Resolve("backgrounds")!),
            hasAudio = ws.HasRoot && Directory.Exists(ws.Resolve("audio")!),
        }));

        app.MapPost("/api/workspace", (RootReq r) =>
            ws.SetRoot(r.Path) ? Results.Json(new { root = ws.Root, ok = true })
                               : Results.BadRequest(new { error = "目录不存在: " + r.Path }));

        // 界面偏好（语言/主题/指针/引导/源码窗位置）。为什么不落 localStorage 见 Workspace.Prefs。
        app.MapPost("/api/pref", (PrefReq r) =>
            ws.SetPref(r.Key ?? "", r.Value ?? "") ? Results.Json(new { ok = true })
                : Results.BadRequest(new { error = "bad_pref", key = r.Key }));

        // 列目录：只回子目录和剧本文件，别的不关我们的事也没必要暴露。
        // `.dlg.demo` 也列出来——插件带的示例就是这个后缀，不列的话用户会以为目录是空的。
        app.MapGet("/api/list", (string? dir) =>
        {
            var full = ws.Resolve(dir ?? "");
            if (full == null || !Directory.Exists(full)) return Results.BadRequest(new { error = "路径无效" });
            var rel = Path.GetRelativePath(ws.Root, full);
            return Results.Json(new
            {
                dir = rel == "." ? "" : rel.Replace('\\', '/'),
                dirs = Directory.GetDirectories(full).Select(Path.GetFileName).OrderBy(x => x),
                files = Directory.GetFiles(full)
                        .Where(f => f.EndsWith(".dlg", StringComparison.OrdinalIgnoreCase)
                                 || f.EndsWith(".dlg.demo", StringComparison.OrdinalIgnoreCase))
                        .Select(f => new FileInfo(f)).OrderBy(f => f.Name)
                        .Select(f => new
                        {
                            name = f.Name,
                            size = f.Length,
                            mtime = f.LastWriteTimeUtc,
                            demo = f.Name.EndsWith(".demo", StringComparison.OrdinalIgnoreCase),
                        }),
            });
        });

        // 素材清单：背景在 <工作区>\backgrounds、音频在 <工作区>\audio —— 和插件读的是同两个目录，
        // 所以编辑器里能选的，游戏里就一定找得到。
        app.MapGet("/api/assets", () => Results.Json(new
        {
            bg = Scan("backgrounds", f => Media.IsMedia(f) && !Media.IsAudio(f)),
            audio = Scan("audio", Media.IsAudio),
        }));

        object[] Scan(string sub, Func<string, bool> keep)
        {
            var dir = ws.Resolve(sub);
            if (dir == null || !Directory.Exists(dir)) return Array.Empty<object>();
            return Directory.GetFiles(dir).Where(keep).Select(f => new FileInfo(f)).OrderBy(f => f.Name)
                .Select(object (f) => new { name = f.Name, size = f.Length, video = Media.IsVideo(f.Name) })
                .ToArray();
        }

        // 素材本体。<img>/<video> 的 src 没法带自定义头，所以令牌走查询串。
        // enableRangeProcessing 必须开——不支持 Range 请求，浏览器就不给你播 mp4。
        app.MapGet("/media", (string path, string t) =>
        {
            if (t != ws.Token) return Results.StatusCode(403);
            var full = ws.Resolve(path);
            if (full == null || !File.Exists(full) || !Media.IsMedia(full)) return Results.NotFound();
            return Results.File(full, Media.Mime(full), enableRangeProcessing: true);
        });

        app.MapGet("/api/dlg", (string path) =>
        {
            var full = ws.Resolve(path);
            if (full == null || !File.Exists(full)) return Results.NotFound(new { error = "文件不存在" });
            return Results.Json(new { path, text = File.ReadAllText(full) });
        });

        // 存盘：**收模型，不收文本**。文本一律由 DialogWriter 生成 ——
        // .dlg 只有一个写手，前端那份 toDlg() 已经退役（它会丢注释和好几个字段）。
        app.MapPost("/api/dlg", (string path, DlgJson.Doc doc) =>
        {
            var full = ws.Resolve(path);
            if (full == null) return Results.BadRequest(new { error = "bad_path" });
            // 路径牢笼只管"别写出工作区"，管不了"别写坏工作区里别的文件"。
            // 这条闸门顺带也挡住了 `.dlg.demo`（插件带的示例，游戏根本不读它）——
            // 前端那句 confirm 只是提醒，真正的门必须在服务端，兄弟接口都是这么做的。
            if (!path.EndsWith(".dlg", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "bad_name", name = path });
            var text = DialogWriter.Write(DlgJson.ToTree(doc));
            // 覆盖前先留一份 .bak：这是别人几十小时写的剧本，存错一次就毁了
            if (File.Exists(full)) File.Copy(full, full + ".bak", true);
            File.WriteAllText(full, text);
            return Results.Json(new { ok = true, bytes = text.Length, text });
        });

        // 只渲染不落盘：界面上"查看 .dlg"要看的就是这份将要写进文件的文本
        app.MapPost("/api/dlg/render", (DlgJson.Doc doc) =>
            Results.Json(new { text = DialogWriter.Write(DlgJson.ToTree(doc)) }));
    }

    public record RootReq(string Path);
    public record PrefReq(string? Key, string? Value);
}
