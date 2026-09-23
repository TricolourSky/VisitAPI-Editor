using System.Text.Json;

namespace VisitAPI.Quests;

public sealed record NativeQuestLink(string File, string Element, string Line, string Action, string QuestId);
public sealed record NativeDialogueReport(List<NativeQuestLink> Links, Dictionary<string, string> Broken, int DroppedLines);

/// <summary>Read-only index of the lines retained by VisitAPI's DialogueLoader/DialogueSanitizer.</summary>
public static class NativeDialogues
{
    // The last two conditions are converted to constants by DialogueSanitizer before filtering.
    static readonly HashSet<string> Conditions = new(["VariableValue", "QuestStatus", "TraderReputation",
        "QuestConditionStatus", "HasNewQuests", "MainLogicalGroup", "LogicalSubGroup", "HasItemForHandover",
        "ServiceAvailable", "CurrentTrader", "CompletableItem", "HasFreeSpecialSlot"]);
    static readonly HashSet<string> Actions = new(["SetVariable", "DiaryNote", "SwitchDialog", "QuitAction",
        "TradingScreenAction", "QuestsScreenAction", "SwitchQuestDialog", "SelectQuest", "AcceptQuest",
        "HandoverItem", "FinishQuest", "PlayerReward", "SelectSubService", "PurchaseService"]);
    static (string Key, NativeDialogueReport Report)? _cache;

    public static NativeDialogueReport Scan(string questDb, string sptData = "")
    {
        if (!QuestImages.Registers(questDb)) return new([], [], 0);
        var dir = Path.Combine(questDb, "dialogues");
        var files = Directory.Exists(dir) ? Directory.GetFiles(dir, "*.json") : [];
        var stock = Path.Combine(sptData, "templates", "dialogue.json");
        var key = ReadOnlyJson.Revision(files.Append(stock).Append(dir));
        if (_cache is { } cache && cache.Key == key) return cache.Report;
        var ids = StockIds(stock);
        var report = new NativeDialogueReport([], new(StringComparer.OrdinalIgnoreCase), 0);
        var dropped = 0;
        foreach (var file in files)
        {
            try
            {
                using var doc = JsonDocument.Parse(JsonBytes.Read(file));
                var elements = Field(doc.RootElement, "elements");
                if (elements.ValueKind != JsonValueKind.Array) throw new JsonException("elements must be an array");
                foreach (var element in elements.EnumerateArray())
                {
                    var id = Text(element, "Id");
                    if (!QuestValidator.IsMongoId(id) || !ids.Add(id)) continue;
                    dropped += Collect(element, Path.GetFileName(file), report.Links);
                }
            }
            catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException)
            { report.Broken[Path.GetFileName(file)] = e.Message; }
        }
        report = report with { DroppedLines = dropped };
        _cache = (key, report);
        return report;
    }

    static int Collect(JsonElement element, string file, List<NativeQuestLink> links)
    {
        var lines = Field(element, "Lines");
        if (lines.ValueKind != JsonValueKind.Array) return 0;
        var dropped = 0;
        foreach (var line in lines.EnumerateArray())
        {
            var actions = Field(line, "Actions");
            if (Unsupported(Field(line, "Trigger"), Conditions) || Unsupported(actions, Actions)) { dropped++; continue; }
            if (actions.ValueKind != JsonValueKind.Array) continue;
            foreach (var action in actions.EnumerateArray())
                if (Text(action, "type") is "AcceptQuest" or "FinishQuest" && QuestValidator.IsMongoId(Text(action, "questId")))
                    links.Add(new(file, Text(element, "Id"), Text(line, "Id"), Text(action, "type"), Text(action, "questId")));
        }
        return dropped;
    }

    static bool Unsupported(JsonElement node, HashSet<string> allowed)
    {
        if (node.ValueKind == JsonValueKind.Array) return node.EnumerateArray().Any(n => Unsupported(n, allowed));
        if (node.ValueKind != JsonValueKind.Object) return false;
        return Text(node, "type") is { Length: > 0 } type && !allowed.Contains(type)
            || Unsupported(Field(node, "Conditions"), allowed);
    }

    static HashSet<string> StockIds(string path)
    {
        using var doc = ReadOnlyJson.Read(path);
        var elements = doc == null ? default : Field(doc.RootElement, "elements");
        return elements.ValueKind == JsonValueKind.Array
            ? elements.EnumerateArray().Select(e => Text(e, "Id")).ToHashSet(StringComparer.Ordinal) : new(StringComparer.Ordinal);
    }

    static JsonElement Field(JsonElement node, string key) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(key, out var value) ? value : default;
    static string Text(JsonElement node, string key) => Field(node, key) is { ValueKind: JsonValueKind.String } value ? value.GetString() ?? "" : "";
}
