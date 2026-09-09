namespace VisitAPI.Quests;

/// <summary>
/// 单段文件名牢笼，所有「外面传进来的名字 + 服务端自己拼目录」的接口共用这一处。
/// 只查分隔符和 <c>..</c> 是不够的（2026-09-08 审查）：Windows 上 <c>C:x.json</c> 不含分隔符、
/// <c>Path.IsPathRooted</c> 却为真，<c>Path.Combine(dir, "C:x.json")</c> 会**原样返回第二个参数**，
/// 落到进程当前目录去读写；<c>a.json:stream</c> 是 NTFS 交换数据流；末尾的点和空格会被 Win32 悄悄剥掉，
/// 于是 <c>x.json.</c> 和 <c>x.json</c> 是同一个文件而牢笼看到的是两个名字。
/// </summary>
public static class SafeName
{
    public static bool Ok(string? n) =>
        !string.IsNullOrEmpty(n)
        && n == Path.GetFileName(n)          // 不带目录（GetFileName 也把 ':' 当分隔符，C:x.json 到不了这一步）
        && !Path.IsPathRooted(n)
        && !n.Contains(':') && !n.Contains("..")
        && n.Trim() == n && !n.EndsWith('.')
        && !n.Any(char.IsControl);
}
