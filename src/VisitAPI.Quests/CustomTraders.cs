using System.Text.Json;
using System.Text.RegularExpressions;

namespace VisitAPI.Quests;

/// <summary>
/// 一个可选的商人。<paramref name="Source"/> 说明它是从哪儿来的 —— 这不是装饰，
/// 它直接回答"这个商人到底存不存在"：
///   spt  = SPT 自带，一定存在
///   mod  = 某个 mod 的 db\traders\&lt;id&gt;\base.json，装了那个 mod 就存在
///   dlg  = 只在 .dlg 的 `trader:` 行里出现过。**这不代表它是个 SPT 商人**
///   used = 只在现有任务的 traderId 里出现过，来历不明
/// </summary>
public sealed record TraderOpt(string Id, string Zh, string En, string Source, string From);

/// <summary>
/// SPT 自带商人之外的来源。
///
/// **为什么需要这个**：自定义商人是别的 mod 加的，不在 SPT_Data 里。
/// 只列自带的话，用了自定义商人的作者在界面上只能看到"未知商人 xxxxxxxx"，改都改不了。
///
/// **一个必须说清的坑**：`.dlg` 头部那行 `trader: &lt;id&gt; "名字"` 里的 id
/// **不一定是一个真的 SPT 商人**。VisitAPI 自己就不注册商人，它只是把对话挂到已有商人上。
/// 所以这里把来源标出来，让界面能提醒作者，而不是让他把任务挂到一个不存在的商人下面。
/// </summary>
public static class CustomTraders
{
    public static List<TraderOpt> Scan(string eftRoot, string dlgDir, IEnumerable<string> usedIds,
                                       IReadOnlySet<string> sptIds)
    {
        var found = new Dictionary<string, TraderOpt>(StringComparer.OrdinalIgnoreCase);
        void Add(TraderOpt t)
        {
            if (t.Id.Length == 0 || sptIds.Contains(t.Id)) return;
            if (!found.ContainsKey(t.Id)) found[t.Id] = t;      // 先到先得：mod > dlg > used
        }

        foreach (var t in FromMods(eftRoot)) Add(t);
        foreach (var t in FromDlg(dlgDir)) Add(t);
        foreach (var id in usedIds) Add(new TraderOpt(id, "", "", "used", ""));
        return found.Values.OrderBy(x => x.Source == "mod" ? 0 : x.Source == "dlg" ? 1 : 2)
                           .ThenBy(x => x.En.Length > 0 ? x.En : x.Id, StringComparer.OrdinalIgnoreCase)
                           .ToList();
    }

    /// <summary>mod 自带的商人：`user\mods\&lt;mod&gt;\db\traders\&lt;id&gt;\base.json`（和 SPT_Data 同一套约定）。</summary>
    static IEnumerable<TraderOpt> FromMods(string eftRoot)
    {
        if (eftRoot.Length == 0) yield break;
        var mods = Path.Combine(eftRoot, "SPT_Runtime", "user", "mods");
        if (!Directory.Exists(mods)) yield break;
        foreach (var mod in Directory.GetDirectories(mods))
        {
            var dir = Path.Combine(mod, "db", "traders");
            if (!Directory.Exists(dir)) continue;
            foreach (var t in Directory.GetDirectories(dir))
            {
                var p = Path.Combine(t, "base.json");
                if (!File.Exists(p)) continue;
                string id = Path.GetFileName(t), nick = "";
                try
                {
                    using var doc = JsonDocument.Parse(JsonBytes.Read(p));
                    if (doc.RootElement.TryGetProperty("_id", out var i)) id = i.GetString() ?? id;
                    if (doc.RootElement.TryGetProperty("nickname", out var n)) nick = n.GetString() ?? "";
                }
                catch { /* 坏文件跳过，不能因为一个 mod 把整张列表拖垮 */ }
                var name = nick.Length > 0 ? nick : Path.GetFileName(t);
                yield return new TraderOpt(id, name, name, "mod", Path.GetFileName(mod));
            }
        }
    }

    /// <summary>.dlg 头部的 `trader: &lt;id&gt; "名字"`。**只是对话里的说话人，未必是注册过的商人。**</summary>
    static IEnumerable<TraderOpt> FromDlg(string dlgDir)
    {
        if (dlgDir.Length == 0 || !Directory.Exists(dlgDir)) yield break;
        foreach (var f in Directory.GetFiles(dlgDir, "*.dlg"))
        {
            string? line = null;
            try { line = File.ReadLines(f).FirstOrDefault(l => l.TrimStart().StartsWith("trader:")); }
            catch { }
            if (line == null) continue;
            var m = Regex.Match(line, @"trader:\s*(\S+)\s*(?:""(.*)"")?");
            if (!m.Success) continue;
            // 4.0.13 允许 `trader: "名字"`（不写 id）。那种行里 (\S+) 抓到的是带引号的名字，
            // 当成商人 id 列出来就是一条谁也认不出的垃圾（`"SORA"`）。共享库的
            // DialogHeaderParser 早就有这道防呆，这里补齐，两边口径一致。
            var id = m.Groups[1].Value;
            if (id.StartsWith("\"")) continue;
            var name = m.Groups[2].Value;
            yield return new TraderOpt(id, name, name, "dlg", Path.GetFileName(f));
        }
    }
}
