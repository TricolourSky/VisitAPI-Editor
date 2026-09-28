using System.Text.Json.Nodes;

namespace VisitAPI.Quests;

public static partial class QuestValidator
{
    // SPT 4.1.5 RewardType, also documented by VisitAPI/tools/QuestPort/Program.cs.
    static readonly HashSet<string> RewardTypes = new([
        "Experience", "Skill", "Item", "TraderStanding", "TraderUnlock", "Location", "Counter",
        "AssortmentUnlock", "ProductionScheme", "TraderStandingReset", "TraderStandingRestore", "StashRows",
        "Achievement", "Pockets", "Quest", "CustomizationOffer", "ExtraDailyQuest", "CustomizationDirect", "Stub",
        "WebPromoCode", "NotificationPopup", "Customization", "BattlePassExperience", "BattlePassCurrency", "ArenaArmoryItem"]);
    static readonly HashSet<string> Editions = new(["standard", "left_behind", "prepare_for_escape", "edge_of_darkness",
        "unheard_edition", "tournament", "tournament_live", "press_edition", "develop", "exhibition"]);

    static void Compatibility(string id, JsonObject q, LocaleStore loc, bool ours,
        Action<string, string[]> err, Action<string, string[]> warn)
    {
        if (!IsMongoId(Str(q, "_id"))) err("bad_quest_identity", [Str(q, "_id")]);
        else if (Str(q, "_id") != id) err("quest_key_mismatch", [id, Str(q, "_id")]);
        CheckFlags(q, "", ["isStoryQuest", "notDisplayedQuest", "canShowNotificationsInGame", "instantComplete", "restartable", "secretQuest", "isKey"], err);
        var vx = q["visitapi"] as JsonObject;
        if (q["visitapi"] != null && vx == null) err("field_type", ["visitapi", "object"]);
        if (vx != null) CheckFlags(vx, "visitapi.", ["chapter", "autoStart", "autoFinish", "dialogOnly", "unlockTraderOnReady"], err);
        foreach (var field in new[] { "unlockTrader" })
            if (vx?[field] != null && !IsMongoId(Str(vx, field))) err("bad_unlock_trader", [Str(vx, field)]);
        foreach (var n in (vx?["unlockLocations"] as JsonArray) ?? [])
            if (n is not JsonValue v || !v.TryGetValue<string>(out var value) || !IsMongoId(value)) err("bad_location_unlock", [n?.ToJsonString() ?? "null"]);
        var call = q["mailSettings"] as JsonObject;
        if (call != null) CheckFlags(call, "mailSettings.", ["isEnabled"], err);
        var trader = Str(call, "dialogueTraderId");
        if (call?["dialogueTraderId"] is not JsonValue tv || !tv.TryGetValue<string>(out _)) trader = Str(call, "fromTraderId");
        if (Bool(call, "isEnabled") && !IsMongoId(trader)) warn("bad_call", [trader]);
        if (Bool(q, "isStoryQuest") && !Bool(vx, "autoStart") && Afters(vx).Count == 0
            && Conds(q, "AvailableForStart").Any(c => Number(c, "availableAfter") > 0)
            && !(Bool(call, "isEnabled") && IsMongoId(trader))) warn("timed_no_badge", []);
        // 1.1 聊天邀请（插件 1.3.4 InviteRouter / ChatInvites）：开了、写了发信商人、不是自动接的任务，一变成可接，发信商人就在聊天里寄一封信，
        // 正文是文案「<任务id> whileAvailableMessageText」。中英都没有：服务端要么不寄（哪种语言都没有），要么照寄、中英玩家看到一串文案键
        if (Bool(call, "isEnabled") && IsMongoId(Str(call, "fromTraderId")) && !Bool(vx, "autoStart")
            && !LocaleStore.Known.Any(l => !string.IsNullOrWhiteSpace(loc.Get(l, id + " whileAvailableMessageText")))) warn("invite_no_text", []);
        var entry = Str(call, "entryPoint");
        if (Bool(call, "isEnabled") && entry.Length > 0 && entry is not ("InLobby" or "InRaid" or "ViaRadio" or "ViaNotebook")) warn("invite_bad_entry", [entry]);
        else if (Bool(call, "isEnabled") && (entry is "ViaRadio" or "ViaNotebook") && Str(call, "dialogueId").Length == 0) warn("invite_no_dialogue", []);
        // 任务进入某状态时给档案变量赋值（插件 1.3.4 visitapi.setVariables {Started|Success|Fail: {变量id: 整数}}，1.1 GlobalVariable 奖励的替身）：
        // 状态名只认这三个、变量 id 要 24 位十六进制、值要整数，别的写法插件悄悄跳过
        if (vx?["setVariables"] is JsonNode svn)
        {
            if (svn is not JsonObject sv) err("field_type", ["visitapi.setVariables", "object"]);
            else foreach (var (st, m) in sv)
            {
                if (st is not ("Started" or "Success" or "Fail") || m is not JsonObject vars) { warn("setvar_bad", [st]); continue; }
                foreach (var (vid, val) in vars)
                    if (!IsMongoId(vid) || val is not JsonValue v || !v.TryGetValue<int>(out _)) warn("setvar_bad", [st + " " + Cut(vid)]);
            }
        }
        CheckRewards(q, loc, ours, err, warn);
        CheckConditions(q, ours, err, warn);
    }

    static void CheckFlags(JsonObject q, string prefix, string[] keys, Action<string, string[]> err)
    {
        foreach (var key in keys)
            if (q[key] is JsonNode n && !(n is JsonValue v && v.TryGetValue<bool>(out _)))
                err("field_type", [prefix + key, "boolean"]);
    }

    static double Number(JsonObject q, string key) => q[key] is JsonValue v && v.TryGetValue<double>(out var n) ? n : 0;

    static void CheckRewards(JsonObject q, LocaleStore loc, bool ours, Action<string, string[]> err, Action<string, string[]> warn)
    {
        foreach (var (bucket, list) in (q["rewards"] as JsonObject) ?? [])
        {
            if (list is not JsonArray rewards) { err("field_type", ["rewards." + bucket, "array"]); continue; }
            foreach (var reward in rewards)
            {
                if (reward is not JsonObject r) { err("field_type", ["rewards." + bucket, "object[]"]); continue; }
                var type = Str(r, "type");
                if (!RewardTypes.Contains(type)) err("bad_reward_type", [bucket, type]);
                foreach (var key in new[] { "availableInGameEditions", "notAvailableInGameEditions" })
                    foreach (var edition in (r[key] as JsonArray) ?? [])
                        if (edition is not JsonValue ev || !ev.TryGetValue<string>(out var e) || !Editions.Contains(e))
                            warn("reward_edition", [bucket, edition?.ToJsonString() ?? "null"]);
                if (type == "AssortmentUnlock" && (!IsMongoId(Str(r, "traderId")) || r["items"] is not JsonArray a || a.Count == 0))
                    err("assort_unlock_incomplete", [bucket]);
            }
            var field = bucket switch { "Started" => "startedMessageText", "Success" => "successMessageText", "Fail" => "failMessageText", _ => "" };
            // 插件 StoryQuestMail（09-23 SORA 定）：只有标了 isStoryQuest 的任务「没物品就不寄」；别的任务照 SPT 原样，有正文就寄
            if (ours && Bool(q, "isStoryQuest") && field.Length > 0 && Text(loc, q, field).Length > 0 && !rewards.OfType<JsonObject>().Any(r => Str(r, "type") == "Item"))
                warn("mail_dropped", [bucket]);
        }
    }

    static void CheckConditions(JsonObject q, bool ours, Action<string, string[]> err, Action<string, string[]> warn)
    {
        foreach (var group in new[] { "AvailableForStart", "AvailableForFinish", "Fail" })
        {
            var conds = Conds(q, group);
            var ids = conds.Select(c => Str(c, "id")).ToHashSet(StringComparer.Ordinal);
            foreach (var c in conds)
            {
                CheckFlags(c, "", ["isFinisher", "isNecessary", "showCounter", "dynamicLocale"], err);
                if (Str(c, "parentId") is { Length: > 0 } p && !ids.Contains(p)) warn("dangling_parent", [Str(c, "id"), p]);
                var type = Str(c, "conditionType");
                if (type == "CounterCreator" && Inner(c).Any(x => Str(x, "conditionType") == "FindItem")) err("finditem_nested", [Str(c, "id")]);
                foreach (var inner in Inner(c))
                    if (Str(inner, "conditionType") is "LocationTrigger" or "CompletableItem") warn("condition_legacy", [Str(inner, "conditionType")]);
                if (type is "LeaveItemAtLocation" or "PlaceBeacon" && Str(c, "zoneId").Length == 0
                    && !(ours && (c["zoneIds"] as JsonArray)?.Any(n => n is JsonValue v && v.TryGetValue<string>(out var s) && s.Length > 0) == true))
                    err("zone_missing", [Str(c, "id")]);
                foreach (var key in new[] { "index", "availableAfter", "areaType" })
                    if (c[key] is JsonNode n && !(n is JsonValue v && v.TryGetValue<int>(out _))) err("field_type", [key, "integer"]);
            }
        }
    }

    static void CheckZones(JsonObject q, IReadOnlyList<QuestZone>? zones, IReadOnlySet<string>? stock,
        bool externalFinish, Action<string, string[]> err, Action<string, string[]> warn)
    {
        if (zones == null) return;
        foreach (var c in Conds(q, "AvailableForFinish").Concat(Conds(q, "Fail")).SelectMany(Inner))
        {
            var type = Str(c, "conditionType");
            if (type is not ("VisitPlace" or "LeaveItemAtLocation" or "PlaceBeacon")) continue;
            var target = type == "VisitPlace" ? Str(c, "target") : Str(c, "zoneId");
            if (type != "VisitPlace" && target.Length == 0)
                target = (c["zoneIds"] as JsonArray)?.Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : "").FirstOrDefault(s => s.Length > 0) ?? "";
            if (target.Length == 0) { if (type == "VisitPlace") err("zone_missing", [Str(c, "id")]); continue; }
            var matches = zones.Where(z => z.Id == target).ToList();
            var expected = type == "VisitPlace" ? "visit" : "placeitem";
            if (matches.Count > 0 && matches.All(z => z.Type != expected)) err("zone_wrong_type", [target, expected]);
            else if (matches.Count == 0 && stock != null && !stock.Contains(target) && !externalFinish) warn("zone_unknown", [target]);
        }
    }

    static void IdentityAndCycles(List<(string Id, string File, JsonObject Quest)> all, IReadOnlySet<string>? vanilla, List<Issue> issues)
    {
        foreach (var group in all.GroupBy(q => Str(q.Quest, "_id"), StringComparer.Ordinal).Where(g => g.Key.Length > 0 && g.Count() > 1))
            issues.Add(new("err", group.First().Id, "duplicate_quest_identity", [group.Key]));
        var map = all.GroupBy(x => x.Id, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.First().Quest, StringComparer.Ordinal);
        IEnumerable<string> Edges(string id) => map.TryGetValue(id, out var q)
            ? QuestRefs(Conds(q, "AvailableForStart")).Concat(Afters(q["visitapi"] as JsonObject)).Where(s => s.Length > 0) : [];
        foreach (var (id, _, q) in all)
        {
            if (vanilla?.Contains(Str(q, "_id")) == true) issues.Add(new("warn", id, "vanilla_quest_identity", [Str(q, "_id")]));
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var pending = new Stack<string>(Edges(id));
            while (pending.TryPop(out var next))
            {
                if (next == id) { issues.Add(new("err", id, "quest_cycle", [])); break; }
                if (seen.Add(next)) foreach (var edge in Edges(next)) pending.Push(edge);
            }
        }
    }
}
