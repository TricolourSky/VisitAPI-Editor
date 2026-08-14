# 还原备份接口的端到端测试：起真服务、打真接口、量真文件。
# 还原语义 = **对调**（.bak 和现役互换，再还原一次就换回去）；现役已删的 = 复活。
# 全程在 FakeEFT 里跑；.dlg 夹具用 _bk 前缀、finally 里连 .bak 一起清（DlgLinks 扫全工作区，留下会串进别人的结果）。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"
$dlg = "$T\BepInEx\config\VisitAPI"
# 实验目录必须放 user\mods 之外（放进去会被 ScanQuestRoots 当成"有任务的模组"污染别的测试）
$db  = "$T\labs\BakLab\db"
$u8  = [Text.UTF8Encoding]::new($false)

$pass = 0; $fail = 0
function Ok($name, $cond, $detail) {
  if ($cond) { $script:pass++; "PASS $name" + $(if($detail){" [$detail]"}) }
  else       { $script:fail++; "FAIL $name" + $(if($detail){" [$detail]"}) }
}
function Json($resp) { [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($url, $tok, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10 -Compress))
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" `
    -Body $bytes -UseBasicParsing
}
# 4xx 会让 Invoke-WebRequest 直接抛；这里只关心状态码
function PostCode($url, $tok, $obj) {
  try { (Post $url $tok $obj).StatusCode }
  catch { $_.Exception.Response.StatusCode.value__ }
}
function Hash($p) { (Get-FileHash $p -Algorithm SHA256).Hash }

# ── 铺夹具 ─────────────────────────────────────────
Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
foreach ($d in "quests","locales","CustomBotLoadouts","CustomAssortSchemes") {
  New-Item -ItemType Directory -Force "$db\$d" | Out-Null
}
[IO.File]::WriteAllText("$db\quests\q.json",     '{"live":1}', $u8)
[IO.File]::WriteAllText("$db\quests\q.json.bak", '{"bak":1}',  $u8)
[IO.File]::WriteAllText("$db\quests\d.json.bak", '{"dead":1}', $u8)   # 现役已删，等着被复活
[IO.File]::WriteAllText("$db\locales\ch.json",     '{"a":"新"}', $u8)
[IO.File]::WriteAllText("$db\locales\ch.json.bak", '{"a":"旧"}', $u8)
[IO.File]::WriteAllText("$db\locales\en.json",     '{"a":"x"}',  $u8)  # 没有 .bak 的旁观者，不许被碰
[IO.File]::WriteAllText("$db\CustomBotLoadouts\assault.json",     '{"appearance":{}}', $u8)
[IO.File]::WriteAllText("$db\CustomBotLoadouts\assault.json.bak", '{"appearance":{"old":1}}', $u8)
[IO.File]::WriteAllText("$db\assort.json",     '{"items":[]}', $u8)
[IO.File]::WriteAllText("$db\assort.json.bak", '{"items":[1]}', $u8)
[IO.File]::WriteAllText("$db\CustomAssortSchemes\s.json.bak", '{"scheme":1}', $u8)
[IO.File]::WriteAllText("$dlg\_bk.dlg",     "trader: 5ac3b934156ae10c4430e83c `"T`"`n<a>`nhi", $u8)
[IO.File]::WriteAllText("$dlg\_bk.dlg.bak", "trader: 5ac3b934156ae10c4430e83c `"T`"`n<a>`nold", $u8)

Remove-Item "$sp\backup.log" -ErrorAction SilentlyContinue
$srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$dlg`"","--quests=`"$db`"","--mods=`"$db`"" `
        -RedirectStandardOutput "$sp\backup.log" -PassThru -WindowStyle Hidden
try {
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $log = if (Test-Path "$sp\backup.log") { (Get-Content "$sp\backup.log" -Raw) } else { $null }
    if ($log) { $m = [regex]::Match($log, 'http://127\.0\.0\.1:\d+'); if ($m.Success) { $url = $m.Value; break } }
  }
  if (-not $url) { throw "服务没起来" }
  $html = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok  = [regex]::Match($html, 'name="tok" content="([^"]+)"').Groups[1].Value
  $H    = @{ "X-Token" = $tok }

  # ── 1 扫描 ──────────────────────────────────────
  $raw = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/api/backup" -Headers $H -UseBasicParsing).RawContentStream.ToArray())
  $g   = $raw | ConvertFrom-Json
  # PS 的属性访问不分大小写，额外断言原始 JSON 里确实是小写（JS 大小写敏感）
  Ok "字段名是小写的" ($raw -match '"areas"' -and $raw -match '"live"' -and $raw -match '"name"' -and $raw -match '"roots"')
  Ok "三个根都认出来了" ($g.roots.root -and $g.roots.quest -and $g.roots.mod)
  Ok "dlg 区列出 _bk.dlg.bak" (@($g.areas.dlg | Where-Object name -eq "_bk.dlg.bak").Count -eq 1)
  Ok "quest 区两条" (@($g.areas.quest).Count -eq 2) (($g.areas.quest.name) -join ",")
  Ok "q.json.bak 现役健在" (($g.areas.quest | Where-Object name -eq "q.json.bak").live -eq $true)
  Ok "d.json.bak 现役已删" (($g.areas.quest | Where-Object name -eq "d.json.bak").live -eq $false)
  Ok "locale 区列出 ch.json.bak" (@($g.areas.locale | Where-Object name -eq "ch.json.bak").Count -eq 1)
  Ok "bot 区列出 assault.json.bak" (@($g.areas.bot | Where-Object name -eq "assault.json.bak").Count -eq 1)
  Ok "assort 区只有 assort.json.bak" ((@($g.areas.assort).Count -eq 1) -and ($g.areas.assort[0].name -eq "assort.json.bak"))
  Ok "scheme 区列出 s.json.bak" (@($g.areas.scheme | Where-Object name -eq "s.json.bak").Count -eq 1)

  # ── 2 对调（可反悔）────────────────────────────
  $liveH = Hash "$db\quests\q.json"; $bakH = Hash "$db\quests\q.json.bak"
  $enH   = Hash "$db\locales\en.json"; $chH = Hash "$db\locales\ch.json"
  $r1 = Json (Post "$url/api/backup/restore" $tok @{ area="quest"; name="q.json.bak" })
  Ok "还原成功且不是复活" ($r1.ok -and -not $r1.revived)
  Ok "内容对调了" ((Hash "$db\quests\q.json") -eq $bakH -and (Hash "$db\quests\q.json.bak") -eq $liveH)
  Ok "没留 .swap 残件" (-not (Test-Path "$db\quests\q.json.swap"))
  $null = Json (Post "$url/api/backup/restore" $tok @{ area="quest"; name="q.json.bak" })
  Ok "再还原一次＝换回去" ((Hash "$db\quests\q.json") -eq $liveH -and (Hash "$db\quests\q.json.bak") -eq $bakH)
  Ok "旁观文件一根汗毛没动" ((Hash "$db\locales\en.json") -eq $enH -and (Hash "$db\locales\ch.json") -eq $chH)

  # ── 3 复活 ──────────────────────────────────────
  $deadH = Hash "$db\quests\d.json.bak"
  $r2 = Json (Post "$url/api/backup/restore" $tok @{ area="quest"; name="d.json.bak" })
  Ok "复活标记 revived=true" ($r2.ok -and $r2.revived -eq $true)
  Ok "文件回来了、备份用掉了" ((Test-Path "$db\quests\d.json") -and -not (Test-Path "$db\quests\d.json.bak") -and
                               (Hash "$db\quests\d.json") -eq $deadH)
  $g2 = Json (Invoke-WebRequest "$url/api/backup" -Headers $H -UseBasicParsing)
  Ok "复活后列表里没有它了" (@($g2.areas.quest | Where-Object name -eq "d.json.bak").Count -eq 0)

  # ── 4 牢笼 ──────────────────────────────────────
  Ok "带目录的名字被拒" ((PostCode "$url/api/backup/restore" $tok @{ area="quest"; name="..\q.json.bak" }) -eq 400)
  Ok "后缀不对被拒" ((PostCode "$url/api/backup/restore" $tok @{ area="quest"; name="q.txt.bak" }) -eq 400)
  Ok "不存在的区被拒" ((PostCode "$url/api/backup/restore" $tok @{ area="nope"; name="q.json.bak" }) -eq 400)
  Ok "不存在的备份 404" ((PostCode "$url/api/backup/restore" $tok @{ area="quest"; name="ghost.json.bak" }) -eq 404)
  Ok "没令牌 403" ((PostCode "$url/api/backup/restore" "wrong" @{ area="quest"; name="q.json.bak" }) -eq 403)

  # ── 5 savageRole 选项表（同一轮顺手验：新接口 /api/quests/roles）──
  $rr = Json (Invoke-WebRequest "$url/api/quests/roles" -Headers $H -UseBasicParsing)
  Ok "roles 接口 ok" ($rr.ok -eq $true)
  Ok "角色数量合理（原版约 49 种）" (@($rr.roles).Count -ge 30) "$(@($rr.roles).Count) 种"
  # 大小写必须是任务文件里的写法（bossKilla），不是 bots\types 目录的全小写
  Ok "保住了任务文件里的大小写" (@($rr.roles) -ccontains "bossKilla") (@($rr.roles | Where-Object { $_ -like "boss*" }) -join "," )

  ""
  "合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
  if ($fail -gt 0) { exit 1 }
}
finally {
  if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force }
  Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
  @("_bk.dlg","_bk.dlg.bak","_bk.dlg.swap") |
    ForEach-Object { Remove-Item (Join-Path $dlg $_) -Force -ErrorAction SilentlyContinue }
}
