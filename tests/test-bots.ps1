# BOT 外观接口的端到端测试：起真服务、打真接口、量真文件。
# 全程在 FakeEFT 里跑，不碰 $SptHome。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"
# ⚠️ **实验目录必须放在 user\mods 之外。**
# 一开始放在 `user\mods\ModLab\db`，结果 `SetQuestDb` 会自动建出 quests\ 和 locales\ 子目录，
# 于是它在 `ScanQuestRoots()` 眼里就成了"一个有任务的模组"，按字母序还排在 VisitAPI-Server 前面
# —— 没显式指定任务库的 test-ack 自动挑中了这个空库，4 条 unknown_trader 变成 0 条。
# 放到 mods 之外就根本扫不到，从源头上不可能污染别的测试。
$db  = "$T\labs\ModLab\db"
$bl  = "$db\CustomBotLoadouts"

$pass = 0; $fail = 0
function Ok($name, $cond, $detail) {
  if ($cond) { $script:pass++; "PASS $name" + $(if($detail){" [$detail]"}) }
  else       { $script:fail++; "FAIL $name" + $(if($detail){" [$detail]"}) }
}
function Json($resp) { [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($url, $tok, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 40 -Compress))
  # PS 5.1 的 -Body <string> 会把中文编成 ?，必须自己给字节
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" `
    -Body $bytes -UseBasicParsing
}

# ── 重置假树 ────────────────────────────────────────
Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $db | Out-Null
Copy-Item "$sp\modsnap\*" $db -Recurse -Force

Remove-Item "$sp\bots.log" -ErrorAction SilentlyContinue
$srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--mods=`"$db`"" `
        -RedirectStandardOutput "$sp\bots.log" -PassThru -WindowStyle Hidden
try {
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $log = if (Test-Path "$sp\bots.log") { (Get-Content "$sp\bots.log" -Raw) } else { $null }
    if ($log) { $m = [regex]::Match($log, 'http://127\.0\.0\.1:\d+'); if ($m.Success) { $url = $m.Value; break } }
  }
  if (-not $url) { throw "服务没起来" }
  $html = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok  = [regex]::Match($html, 'name="tok" content="([^"]+)"').Groups[1].Value
  $H    = @{ "X-Token" = $tok }

  # ── 1 读 ────────────────────────────────────────
  $g = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  Ok "认出 bot 目录" ($g.ok -and $g.dir -like "*CustomBotLoadouts") $g.dir
  Ok "2 份配置" (@($g.files.PSObject.Properties).Count -eq 2) (($g.files.PSObject.Properties.Name) -join ",")
  Ok "bot 类型表来自 SPT_Data" (@($g.botTypes).Count -ge 50) "$(@($g.botTypes).Count) 种"
  Ok "五个分区" ((@($g.slots) -join ",") -eq "head,body,hands,feet,voice") (@($g.slots) -join ",")

  # 衣柜里**只有作者自己做的**。SPT 自带那 456 条不再送到前端 ——
  # 界面根本不列它们，送过去只是白白撑大响应（这是 Tech Leader 的第 ② 条要求）。
  $wear = @($g.wear)
  Ok "衣柜只列自己做的" ($wear.Count -eq 3) "$($wear.Count) 条（1 件上装 + 1 个头 + 1 条语音）"
  # 语音在 bot json 里的槽和别的部位同形（id → 权重），所以一视同仁地当一个部位处理
  Ok "自制语音也读进来了" (@($wear | Where-Object { $_.parts.voice }).Count -eq 1) `
     (($wear | Where-Object { $_.parts.voice }).zh)
  # ⚠️ PS 的属性访问不分大小写，`$_.Kind` 照样读得到 `kind`，光靠它验不出前端能不能用。
  # 所以额外断言**原始 JSON 里确实是小写**——JS 是大小写敏感的。
  $raw = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing).RawContentStream.ToArray())
  Ok "字段名是小写的（JS 大小写敏感）" ($raw -match '"wear"' -and $raw -match '"kind"' -and $raw -match '"parts"')
  $top = @($wear | Where-Object kind -eq 'top')[0]
  # 上装和手出自**同一条记录**：这正是界面能提示"只换一边会露出中空手臂"的依据
  Ok "上装和手是同一条记录" ($top -and
      ((@($top.parts.PSObject.Properties.Name) | Sort-Object) -join ",") -eq "body,hands") `
     (($top.parts.PSObject.Properties.Name) -join ",")
  Ok "夹具没做下装，下装页就该是空的" (@($wear | Where-Object { $_.parts.feet }).Count -eq 0)
  Ok "模组的中英名解出来了" ((@($wear | Where-Object { $_.zh -eq "测试上衣" }).Count -eq 1) -and
                             (@($wear | Where-Object { $_.en -eq "Lab Head" }).Count -eq 1))
  Ok "干净夹具零告警" (@($g.issues).Count -eq 0) (($g.issues | ForEach-Object { $_.code }) -join ",")

  # ── 1c 原版服装池：「恢复默认」的正本 ───────────────
  # 编辑器**不自己另存原池**，恢复默认就是去 SPT 的 bots\types 里把 appearance 读回来。
  $d0 = Json (Invoke-WebRequest "$url/api/bots/default?type=assault" -Headers $H -UseBasicParsing)
  Ok "读得到 SPT 原版 appearance" ($d0.ok) $d0.error
  Ok "五个槽都在" (((@($d0.appearance.PSObject.Properties.Name) | Sort-Object) -join ",") -eq "body,feet,hands,head,voice") `
     (($d0.appearance.PSObject.Properties.Name) -join ",")
  Ok "原版池子不是空的" (@($d0.appearance.body.PSObject.Properties).Count -ge 5) `
     "body $(@($d0.appearance.body.PSObject.Properties).Count) 套"
  Ok "不存在的类型只是 no_spt_bot，不是 500" `
     ((Json (Invoke-WebRequest "$url/api/bots/default?type=nosuchbot" -Headers $H -UseBasicParsing)).error -eq "no_spt_bot")
  # 类型名是拿来拼文件名的，穿越必须掐掉
  Ok "路径穿越拿不到别的文件" `
     ((Json (Invoke-WebRequest "$url/api/bots/default?type=..%5C..%5Cfoo" -Headers $H -UseBasicParsing)).error -eq "no_spt_bot")

  # ── 1b 预览图 ───────────────────────────────────
  # 约定：<模组db>\previews\<id>.png，id 可以是外观 id 也可以是 bot 类型名
  # （前者 24 位十六进制、后者小写单词，撞不上，所以一个目录一条路由两边都管）
  # 四张：外观 id（头）／服装的 suiteId（管一整条记录）／BOT 类型名（当立绘）／角色名（Lab）
  Ok "报出哪些 id 有预览图" (@($g.previews).Count -eq 4) (@($g.previews) -join ",")
  Ok "按 suiteId 命名的也报出来" (@($g.previews) -contains "aa00000000000000000000f1")
  # 服务端只管把目录里有什么原样报出来，"这张图归谁"是界面按 id/suiteId/名字三轮去配的
  Ok "按角色名命名的也报出来" (@($g.previews) -contains "Lab")
  Ok "外观的图认出来了" (@($g.previews) -contains "aa00000000000000000000e1")
  Ok "BOT 的图也认出来了" (@($g.previews) -contains "assault")
  $img = Invoke-WebRequest "$url/look?id=assault&t=$tok" -UseBasicParsing
  Ok "取得到图片本体" ($img.StatusCode -eq 200 -and $img.Headers['Content-Type'] -eq 'image/png') `
     "$($img.StatusCode) $($img.Headers['Content-Type']) $($img.RawContentLength) 字节"
  $code = 0
  try { Invoke-WebRequest "$url/look?id=assault&t=WRONG" -UseBasicParsing | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "错令牌拿不到图" ($code -eq 403) "HTTP $code"
  # 这个口子会把文件原样吐给浏览器，路径必须在服务端拼；外面只能给裸 id
  $code = 0
  try { Invoke-WebRequest "$url/look?id=..%5C..%5Cbase.json&t=$tok" -UseBasicParsing | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "路径穿越拿不到东西" ($code -eq 404) "HTTP $code"
  $code = 0
  try { Invoke-WebRequest "$url/look?id=nosuchthing&t=$tok" -UseBasicParsing | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "没有图就是 404（界面自己画色块）" ($code -eq 404) "HTTP $code"

  # ── 2 无令牌 ────────────────────────────────────
  $code = 0
  try { Invoke-WebRequest "$url/api/bots" -UseBasicParsing | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "无令牌被挡" ($code -eq 403) "HTTP $code"

  # ── 3 写：改一个权重 ────────────────────────────
  # 另一份没送上去的文件，保存前后必须**一个字节都不动** ——
  # 前端只送改过的那几份，作者改一个 BOT 不该让整个目录 40 份全重写、多出 40 个 .bak
  $otherBefore = (Get-Item "$bl\assault.json").LastWriteTimeUtc.Ticks
  $otherHash   = (Get-FileHash "$bl\assault.json" -Algorithm MD5).Hash
  $mk = $g.files.'marksman.json'
  $mk.appearance.head.'670d17f9d2d5ce4514027e83' = 999
  $p = Json (Post "$url/api/bots" $tok @{ stamp=$g.stamp; force=$false; files=@{ "marksman.json"=$mk } })
  Ok "保存成功" ($p.ok -eq $true)
  Ok "没送上去的文件没被动" ((Get-Item "$bl\assault.json").LastWriteTimeUtc.Ticks -eq $otherBefore -and
                             (Get-FileHash "$bl\assault.json" -Algorithm MD5).Hash -eq $otherHash)
  Ok "也没给它平白留 .bak" (-not (Test-Path "$bl\assault.json.bak"))
  $after = Get-Content "$bl\marksman.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "权重落盘了" ($after.appearance.head.'670d17f9d2d5ce4514027e83' -eq 999)
  # 这是这一组最关键的一条：我们只编辑 appearance，别的段必须原样搬运
  Ok "chances 段原样保住" ($after.chances.equipment.Headwear -eq 42.5) $after.chances.equipment.Headwear
  Ok "inventory 段原样保住" ($after.inventory.Ammo.Caliber556x45NATO.'59e6906286f7746c9f75e847' -eq 7)
  Ok "覆盖前留了 .bak" (Test-Path "$bl\marksman.json.bak")

  # ── 4 乐观锁 ────────────────────────────────────
  $code = 0
  try { Post "$url/api/bots" $tok @{ stamp=$g.stamp; force=$false; files=@{ "marksman.json"=$mk } } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "旧指纹被拦（乐观锁）" ($code -eq 409) "HTTP $code"

  # ── 5 路径越界 ──────────────────────────────────
  $g2 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  $code = 0
  try { Post "$url/api/bots" $tok @{ stamp=$g2.stamp; force=$true; files=@{ "..\..\evil.json"=@{appearance=@{}} } } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "路径越界被拒" ($code -eq 400) "HTTP $code"
  Ok "没写出越界文件" (-not (Test-Path "$T\SPT_Runtime\user\mods\evil.json"))

  # ── 6 校验规则真的会响 ──────────────────────────
  # ⑴ 文件名大小写：WTT 拿文件名直接查表，表的 key 全小写，写错它只 log 一句就跳过
  Copy-Item "$bl\assault.json" "$bl\bossKilla.json"
  $g3 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  Ok "大小写错报 bot_case" (@($g3.issues | Where-Object code -eq 'bot_case').Count -eq 1) `
     ((@($g3.issues | Where-Object code -eq 'bot_case')[0].args) -join "→")
  Remove-Item "$bl\bossKilla.json"

  # ⑵ 根本不存在的 bot 类型
  Copy-Item "$bl\assault.json" "$bl\notabot.json"
  $g4 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  Ok "假类型报 bot_unknown_type" (@($g4.issues | Where-Object code -eq 'bot_unknown_type').Count -eq 1)
  Remove-Item "$bl\notabot.json"

  # ⑶ 把"头"的 id 配进身体区
  $g5 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  $a = $g5.files.'assault.json'
  $a.appearance.body | Add-Member -NotePropertyName "670d17f9d2d5ce4514027e83" -NotePropertyValue 10 -Force
  $p5 = Json (Post "$url/api/bots" $tok @{ stamp=$g5.stamp; force=$false; files=@{ "assault.json"=$a } })
  Ok "槽位放错报 bot_wrong_slot" (@($p5.issues | Where-Object code -eq 'bot_wrong_slot').Count -eq 1) `
     ((@($p5.issues | Where-Object code -eq 'bot_wrong_slot')[0].args) -join " ")

  # ⑷ 认不出来的 id / 非法权重
  $g6 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  $a6 = $g6.files.'assault.json'
  $a6.appearance.body = [pscustomobject]@{ "ffffffffffffffffffffffff" = 5 }
  $a6.appearance.head.'670d17f9d2d5ce4514027e83' = 0
  $p6 = Json (Post "$url/api/bots" $tok @{ stamp=$g6.stamp; force=$false; files=@{ "assault.json"=$a6 } })
  Ok "陌生 id 报 bot_unknown_id" (@($p6.issues | Where-Object code -eq 'bot_unknown_id').Count -eq 1)
  Ok "权重 0 报 bot_bad_weight" (@($p6.issues | Where-Object code -eq 'bot_bad_weight').Count -eq 1)
  Ok "校验只给码不给人话" (($p6.issues[0].PSObject.Properties.Name -contains "code") -and
                            -not ($p6.issues[0].PSObject.Properties.Name -contains "message"))

  # ── 7 空 appearance = 删文件 ────────────────────
  $g7 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  $before = (Get-ChildItem $bl -Filter *.json).Count
  $empty = @{ appearance = @{ head=@{}; body=@{}; hands=@{}; feet=@{}; voice=@{} } }
  Post "$url/api/bots" $tok @{ stamp=$g7.stamp; force=$false; files=@{ "assault.json"=$empty } } | Out-Null
  Ok "空配置被删掉" ((Get-ChildItem $bl -Filter *.json).Count -eq $before - 1) `
     "$before → $((Get-ChildItem $bl -Filter *.json).Count)"
  Ok "删之前也留了 .bak" (Test-Path "$bl\assault.json.bak")

  # ── 8 坏文件要报出来，不能装看不见 ──────────────
  Set-Content "$bl\broken.json" "{ 这不是 JSON " -Encoding UTF8
  $g8 = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
  Ok "坏文件被报出来" (@($g8.issues | Where-Object code -eq 'broken_file').Count -eq 1)
  Remove-Item "$bl\broken.json"
}
finally {
  if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force }
  # 收尾也清一次：脚本中途抛异常时，留下的目录会被下一轮当成"已有内容"
  Remove-Item "$T\labs" -Recurse -Force -ErrorAction SilentlyContinue
}
""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
