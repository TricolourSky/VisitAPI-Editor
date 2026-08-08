# 任务接口的端到端测试：起真服务、打真接口、量真文件。
# 全程在 FakeEFT 里跑，不碰 $SptHome。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"
$db  = "$T\SPT_Runtime\user\mods\VisitAPI-Server\db"
$exe = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"

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
# 上一轮会把文件改脏（改地点、抽目标、写文案），不重置第二轮就测的是脏数据
Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dbsnap" $db -Recurse -Force

# ── 起服务 ──────────────────────────────────────────
Remove-Item "$sp\srv.log" -ErrorAction SilentlyContinue
$srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"" `
        -RedirectStandardOutput "$sp\srv.log" -PassThru -WindowStyle Hidden
try {
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    # 刚创建时文件是空的，-Raw 会给回 $null，Regex.Match 会炸
    $log = if (Test-Path "$sp\srv.log") { (Get-Content "$sp\srv.log" -Raw) } else { $null }
    if ($log) {
      $m = [regex]::Match($log, 'http://127\.0\.0\.1:\d+')
      if ($m.Success) { $url = $m.Value; break }
    }
  }
  if (-not $url) { throw "服务没起来" }
  $html = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok  = [regex]::Match($html, 'name="tok" content="([^"]+)"').Groups[1].Value
  $H    = @{ "X-Token" = $tok }

  # ── 1 读 ────────────────────────────────────────
  $g = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "认出任务库" ($g.ok -and $g.dir -like "*VisitAPI-Server\db") $g.dir
  Ok "5 个任务文件" ($g.files.Count -eq 5) ($g.files -join ",")
  Ok "5 个任务" (@($g.quests.PSObject.Properties).Count -eq 5)
  Ok "商人表来自 SPT_Data" ($g.traders.Count -ge 10) "$($g.traders.Count) 个"
  Ok "地图表来自 SPT_Data" ($g.maps.Count -ge 12) "$($g.maps.Count) 张"
  Ok "地图后缀分语言" (@($g.maps | Where-Object { $_.en.Contains("(day)") }).Count -eq 1) `
     (($g.maps | Where-Object { $_.zh -like "*白天*" }).en)
  Ok "真实数据零告警" ($g.issues.Count -eq 0) "$($g.issues.Count) 条"
  Ok "文案库读到了" (@($g.locales.ch.PSObject.Properties).Count -ge 10) `
     "$(@($g.locales.ch.PSObject.Properties).Count) 条"

  # ── 2 拒绝无令牌 ────────────────────────────────
  $code = 0
  try { Invoke-WebRequest "$url/api/quests" -UseBasicParsing | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "无令牌被挡" ($code -eq 403) "HTTP $code"

  # ── 3 写：改一句文案 + 改任务里一个字段 ──────────
  $qid  = "5043a1ce90726f6a536f7286"
  $file = "sora_supplies_handover.json"
  $raw0 = Get-Content "$db\quests\$file" -Raw -Encoding UTF8
  $before = $raw0 | ConvertFrom-Json
  $unknownBefore = $before.$qid.arenaLocations   # 我们从不碰的字段，用它验圆整

  $q = $g.quests.$qid
  $q.location = "5704e3c2d2720bac5b8b4567"       # 改成森林
  $files = @{ $file = @{ $qid = $q } }
  $loc   = $g.locales
  $loc.ch."$qid successMessageText" = "测试写入：材料收到了。"

  $p = Json (Post "$url/api/quests" $tok @{ stamp=$g.stamp; force=$false; files=$files; locales=$loc })
  Ok "保存成功" ($p.ok -eq $true)

  $after = Get-Content "$db\quests\$file" -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "location 落盘了" ($after.$qid.location -eq "5704e3c2d2720bac5b8b4567") $after.$qid.location
  Ok "没建模的字段原样保住" (($after.$qid.PSObject.Properties.Name -contains "arenaLocations")) `
     "arenaLocations 还在"
  $keysBefore = ($before.$qid.PSObject.Properties.Name | Sort-Object) -join ","
  $keysAfter  = ($after.$qid.PSObject.Properties.Name  | Sort-Object) -join ","
  Ok "字段一个不少一个不多" ($keysBefore -eq $keysAfter) `
     "$(@($before.$qid.PSObject.Properties).Count) → $(@($after.$qid.PSObject.Properties).Count)"
  Ok "覆盖前留了 .bak" (Test-Path "$db\quests\$file.bak")

  $chAfter = Get-Content "$db\locales\ch.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "中文文案落盘且没被转义" ($chAfter."$qid successMessageText" -eq "测试写入：材料收到了。") `
     $chAfter."$qid successMessageText"
  Ok "文案文件也留了 .bak" (Test-Path "$db\locales\ch.json.bak")

  # ── 4 乐观锁：拿旧 stamp 再存一次应该被拦 ────────
  $code = 0
  try { Post "$url/api/quests" $tok @{ stamp=$g.stamp; force=$false; files=$files; locales=$loc } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "旧指纹被拦（乐观锁）" ($code -eq 409) "HTTP $code"

  $g2 = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  $p2 = Json (Post "$url/api/quests" $tok @{ stamp=$g2.stamp; force=$false; files=$files; locales=$g2.locales })
  Ok "拿新指纹能存" ($p2.ok -eq $true)

  # ── 5 路径越界 ──────────────────────────────────
  $code = 0
  try { Post "$url/api/quests" $tok @{ stamp=$p2.stamp; force=$true; files=@{ "..\..\evil.json" = @{} } } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "路径越界被拒" ($code -eq 400) "HTTP $code"
  Ok "没写出越界文件" (-not (Test-Path "$T\SPT_Runtime\user\mods\evil.json"))

  # ── 6 校验规则真的会响 ──────────────────────────
  $bad = $g2.quests.$qid
  $bad.conditions.AvailableForFinish = @()          # 抽掉全部目标
  $p3 = Json (Post "$url/api/quests" $tok @{ stamp=$p2.stamp; force=$false;
                files=@{ $file = @{ $qid = $bad } }; locales=$g2.locales })
  Ok "抽掉目标后报 no_objectives" (@($p3.issues | Where-Object { $_.code -eq "no_objectives" }).Count -eq 1) `
     (($p3.issues | ForEach-Object { $_.code }) -join ",")
  Ok "校验只给码不给人话" (($p3.issues[0].PSObject.Properties.Name -contains "code") -and
                            -not ($p3.issues[0].PSObject.Properties.Name -contains "message"))

  # ── 7 物品表 ────────────────────────────────────
  $it = Json (Invoke-WebRequest "$url/api/quests/items" -Headers $H -UseBasicParsing)
  Ok "物品表读得到" ($it.ok -and $it.items.Count -gt 4000) "$($it.items.Count) 件 / $($it.cats.Count) 类"
  $rub = $it.items | Where-Object { $_.id -eq "5449016a4bdc2d6f028b456f" }
  Ok "物品带中英名和价格" ($rub -and $rub.zh -and $rub.en) "$($rub.zh) / $($rub.en) ₽$($rub.price)"

  # ── 8 地图不许漏 ────────────────────────────────
  # 塔科夫街区的 _Id 在 base.json 第 307853 字节。第一版只读前 256KB，这张图就静默消失了。
  Ok "塔科夫街区没被漏掉" (@($g.maps | Where-Object { $_.id -eq "5714dc692459777137212e12" }).Count -eq 1) `
     (($g.maps | Where-Object { $_.id -eq "5714dc692459777137212e12" }).zh)
  Ok "13 张图一张不少" (@($g.maps).Count -ge 14) "$(@($g.maps).Count) 张（含"任意地点"）"

  # ── 9 坏文件要报出来，不能装看不见 ──────────────
  Set-Content "$db\quests\broken.json" "{ 这不是 JSON " -Encoding UTF8
  $g4 = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "坏任务文件被报出来" (@($g4.issues | Where-Object { $_.code -eq "broken_file" }).Count -eq 1) `
     (@($g4.issues | Where-Object { $_.code -eq "broken_file" })[0].args -join " ")
  Ok "坏文件不影响别的任务" (@($g4.quests.PSObject.Properties).Count -eq 5)
  Remove-Item "$db\quests\broken.json"

  # ── 10 同一个 id 在两个文件里：要报 dup_id，不能 500 ──
  # 第一版这里用 ToDictionary，重复键直接抛，用户拿到的是 500 而不是那句提示
  Copy-Item "$db\quests\ragman_courier.json" "$db\quests\ragman_copy.json"
  $g6 = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "重复 id 不炸接口" ($g6.ok -eq $true)
  Ok "重复 id 报 dup_id" (@($g6.issues | Where-Object { $_.code -eq "dup_id" }).Count -eq 1) `
     (@($g6.issues | Where-Object { $_.code -eq "dup_id" })[0].args -join " ")
  Remove-Item "$db\quests\ragman_copy.json"

  # ── 11 文案文件坏了必须拒写，不能拿空对象覆盖 ────
  $chGood = Get-Content "$db\locales\ch.json" -Raw -Encoding UTF8
  Set-Content "$db\locales\ch.json" "{ 坏了 " -Encoding UTF8
  $g5 = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "坏文案文件被报出来" (@($g5.issues | Where-Object { $_.code -eq "broken_locale" }).Count -eq 1)
  $code = 0
  try { Post "$url/api/quests" $tok @{ stamp=$g5.stamp; force=$true; files=@{}; locales=$g5.locales } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "文案坏了就拒绝保存" ($code -eq 400) "HTTP $code"
  Ok "拒写之后原文件没被清空" ((Get-Content "$db\locales\ch.json" -Raw -Encoding UTF8).Trim() -eq "{ 坏了") `
     (Get-Content "$db\locales\ch.json" -Raw -Encoding UTF8).Trim()
  Set-Content "$db\locales\ch.json" $chGood -Encoding UTF8 -NoNewline
}
finally {
  if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force }
}
""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
