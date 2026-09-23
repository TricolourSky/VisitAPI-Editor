namespace VisitAPI.Quests;

/// <summary>先准备整批新内容与恢复副本；任一替换失败时恢复已写入的文件和原有 .bak。</summary>
public sealed class FileBatch
{
    sealed record Change(string Path, byte[]? Before, byte[]? After, byte[]? Backup);
    sealed record Staged(Change Change, string Pending, string Original, string Backup);
    readonly List<Change> _changes = [];

    static byte[]? Read(string path) => File.Exists(path) ? File.ReadAllBytes(path) : null;
    static bool Equal(byte[]? a, byte[]? b) => a == null ? b == null : b != null && a.AsSpan().SequenceEqual(b);

    public void Json(string path, System.Text.Json.Nodes.JsonNode node, JsonFile.Style? style)
    {
        var before = Read(path);
        Add(path, before, JsonFile.Bytes(node, style, before));
    }

    public void Delete(string path) => Add(path, Read(path), null);

    void Add(string path, byte[]? before, byte[]? after)
    {
        if (Equal(before, after)) return;
        path = Path.GetFullPath(path);
        if (_changes.Any(c => c.Path.Equals(path, StringComparison.OrdinalIgnoreCase)))
            throw new IOException($"Duplicate save target: {path}");
        if (Directory.Exists(path) || Directory.Exists(path + ".bak"))
            throw new IOException($"Save target is a directory: {path}");
        _changes.Add(new(path, before, after, Read(path + ".bak")));
    }

    static void Prepare(Staged s)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(s.Change.Path)!);
        if (s.Change.After != null) File.WriteAllBytes(s.Pending, s.Change.After);
        if (s.Change.Before != null) File.WriteAllBytes(s.Original, s.Change.Before);
        if (s.Change.Backup != null) File.WriteAllBytes(s.Backup, s.Change.Backup);
    }

    static void Apply(Staged s)
    {
        var c = s.Change;
        if (!Equal(Read(c.Path), c.Before) || !Equal(Read(c.Path + ".bak"), c.Backup))
            throw new IOException($"File changed while preparing save: {c.Path}");
        if (c.After == null) File.Move(c.Path, c.Path + ".bak", true);
        else if (c.Before == null) File.Move(s.Pending, c.Path);
        else File.Replace(s.Pending, c.Path, c.Path + ".bak", true);
    }

    static void Restore(Staged s)
    {
        var c = s.Change;
        if (!Equal(Read(c.Path), c.After)) throw new IOException($"File changed during rollback: {c.Path}");
        if (c.Before == null) File.Delete(c.Path);
        else File.Move(s.Original, c.Path, true);
        if (c.Backup == null) File.Delete(c.Path + ".bak");
        else File.Move(s.Backup, c.Path + ".bak", true);
    }

    public bool Commit()
    {
        if (_changes.Count == 0) return false;
        var key = ".visitapi-" + Guid.NewGuid().ToString("N");
        var staged = _changes.Select(c => new Staged(c, c.Path + key + ".pending", c.Path + key + ".original", c.Path + key + ".previous-backup")).ToArray();
        var applied = new List<Staged>();
        var cleanup = true;
        try
        {
            foreach (var s in staged) Prepare(s);
            foreach (var s in staged) { Apply(s); applied.Add(s); }
            return true;
        }
        catch (Exception failure)
        {
            var errors = new List<Exception> { failure };
            foreach (var s in applied.AsEnumerable().Reverse())
                try { Restore(s); } catch (Exception e) { cleanup = false; errors.Add(e); }
            if (!cleanup) throw new IOException("Save recovery incomplete. Original copies remain beside the affected files: " + key, new AggregateException(errors));
            throw;
        }
        finally
        {
            if (cleanup) foreach (var s in staged)
                foreach (var path in new[] { s.Pending, s.Original, s.Backup })
                    try { File.Delete(path); } catch (IOException) { }
        }
    }
}
