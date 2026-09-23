using System.Text;

namespace VisitAPI.Quests;

public static class TextFile
{
    public static bool Write(string path, string text)
    {
        var old = File.Exists(path) ? File.ReadAllBytes(path) : null;
        var bom = old is { Length: >= 3 } && old[0] == 239 && old[1] == 187 && old[2] == 191;
        if (old != null)
        {
            var previous = Encoding.UTF8.GetString(old);
            var newline = previous.Contains("\r\n") ? "\r\n" : "\n";
            text = text.Replace("\r\n", "\n").Replace("\n", newline);
        }
        var bytes = Encoding.UTF8.GetBytes(text);
        if (bom) bytes = new byte[] { 239, 187, 191 }.Concat(bytes).ToArray();
        if (old != null && old.AsSpan().SequenceEqual(bytes)) return false;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(temp, bytes);
            if (old != null) File.Replace(temp, path, path + ".bak", true);
            else File.Move(temp, path);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
        return true;
    }
}
