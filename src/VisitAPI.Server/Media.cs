namespace VisitAPI.Server;

/// <summary>
/// 允许当背景的素材类型。
/// 白名单而不是黑名单：这个接口会把工作区里的文件原样吐给浏览器，
/// 放开成"什么都能读"就等于多开了一个读文件的口子。
/// </summary>
public static class Media
{
    public static bool IsVideo(string name) =>
        name.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase) ||
        name.EndsWith(".webm", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// 游戏认得的音频格式，照 <c>AudioFiles.Fetch</c> 来：.ogg → OGGVORBIS，.mp3 → MPEG，其余按 WAV 处理。
    /// 这里只放这三种，免得作者在编辑器里挑了个游戏读不出来的文件。
    /// </summary>
    public static bool IsAudio(string name) => Path.GetExtension(name).ToLowerInvariant()
        is ".ogg" or ".mp3" or ".wav";

    public static bool IsMedia(string name) => Mime(name) != null;

    public static string? Mime(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        ".mp4" => "video/mp4",
        ".webm" => "video/webm",
        ".ogg" => "audio/ogg",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        _ => null,
    };
}
