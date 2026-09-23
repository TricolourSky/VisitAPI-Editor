using System.Security.Cryptography;
using System.Text;

namespace VisitAPI.Server;

/// <summary>Bind a snapshot to its absolute root and to the bytes actually read.</summary>
static class FileStamp
{
    public static string Root(string root) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(root)).ToUpperInvariant())));

    public static string Of(string path, byte[] bytes) => Root(path) + ":" + Convert.ToHexString(SHA256.HashData(bytes));

    public static string Files(string root, IEnumerable<string> files)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach (var file in files.OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
        {
            hash.AppendData(Encoding.UTF8.GetBytes(Path.GetRelativePath(root, file) + "\0"));
            hash.AppendData(SHA256.HashData(File.ReadAllBytes(file)));
        }
        return Root(root) + ":" + Convert.ToHexString(hash.GetHashAndReset());
    }

    public static bool SameRoot(string? stamp, string root) => stamp != null && stamp.StartsWith(Root(root) + ":", StringComparison.Ordinal);
}
