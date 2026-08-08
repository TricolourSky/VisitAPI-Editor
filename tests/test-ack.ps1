# 「这个商人我认识」：给还没装 / 还没适配当前 SPT 版本的商人 mod 留的出口。
# SORA 就是这种情况 —— WTT 做的真商人，但 mod 还停在 4.0.13，这台机器上扫不到。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"
$dlg = "$T\BepInEx\config\VisitAPI"
$db  = "$T\SPT_Runtime\user\mods\VisitAPI-Server\db"
$app = "$T\editor"
$u8  = [Text.UTF8Encoding]::new($false)
$pass=0; $fail=0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($u,$tok,$o){ $b=[Text.Encoding]::UTF8.GetBytes(($o|ConvertTo-Json -Depth 20 -Compress))
  Invoke-WebRequest $u -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" -Body $b -UseBasicParsing }

# 重置数据 + 一份干净的 exe 目录（记忆文件要能独立观察）
Remove-Item -LiteralPath $db -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dbsnap" $db -Recurse -Force
Get-ChildItem $dlg -Filter "*.dlg" | Remove-Item -Force -ErrorAction SilentlyContinue
Copy-Item "$SptHome\BepInEx\config\VisitAPI\90726f6a656374536f726132.dlg" "$dlg\" -Force
if (Test-Path $app) { Remove-Item -LiteralPath $app -Recurse -Force }
New-Item -ItemType Directory -Force $app | Out-Null
Get-ChildItem "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64" -File |
  Where-Object { $_.Extension -in ".exe",".dll",".json" } | Copy-Item -Destination "$app\" -Force

$SORA = "90726f6a656374536f726132"
# 把四个任务挂到 SORA 上（复现 Tech Leader 的现状）
Get-ChildItem "$db\quests" -Filter "sora_*.json" | ForEach-Object {
  $j = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $j.PSObject.Properties | ForEach-Object { $_.Value.traderId = $SORA }
  $j | ConvertTo-Json -Depth 40 | Set-Content $_.FullName -Encoding UTF8
}

function Start-Srv {
  $log = "$sp\ack$([Guid]::NewGuid().ToString('N').Substring(0,4)).log"
  $p = Start-Process "$app\VisitAPI.Editor.exe" -ArgumentList '--no-browser',"--root=`"$dlg`"" `
        -RedirectStandardOutput $log -PassThru -WindowStyle Hidden
  foreach($i in 1..40){ Start-Sleep -Milliseconds 250
    $l = if(Test-Path $log){Get-Content $log -Raw}else{$null}
    if($l){ $m=[regex]::Match($l,'http://127\.0\.0\.1:\d+'); if($m.Success){ return @($p,$m.Value) } } }
  throw "服务没起来"
}

$srv,$url = Start-Srv
try {
  $html=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok=[regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $H=@{"X-Token"=$tok}

  $g = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "一开始会警告（这台机器上确实扫不到）" (@($g.issues | Where-Object { $_.code -eq "unknown_trader" }).Count -eq 4) `
     "$(@($g.issues | Where-Object { $_.code -eq 'unknown_trader' }).Count) 条"
  Ok "还没标记过" (@($g.knownTraders).Count -eq 0)
  Ok "但商人本身列得出来（名字来自 .dlg）" (@($g.traders | Where-Object { $_.id -eq $SORA }).zh -eq "SORA")

  $a = Json (Post "$url/api/quests/trader-ok" $tok @{ id = $SORA; on = $true })
  Ok "标记成功" ($a.ok -eq $true) ($a.known -join ",")
  $g2 = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "标记后不再警告" (@($g2.issues | Where-Object { $_.code -eq "unknown_trader" }).Count -eq 0) `
     (($g2.issues | ForEach-Object { $_.code }) -join ",")
  Ok "界面能看到已标记" (@($g2.knownTraders) -contains $SORA)
  Ok "别的校验没被顺手关掉" ($g2.ok -eq $true) "issues=$(@($g2.issues).Count)"

  $bad = 0
  try { Post "$url/api/quests/trader-ok" $tok @{ id = "不是ID"; on = $true } | Out-Null }
  catch { $bad = [int]$_.Exception.Response.StatusCode }
  Ok "乱填 ID 被拒" ($bad -eq 400) "HTTP $bad"

  # 重启后还记得
  $srv | Stop-Process -Force; Start-Sleep -Milliseconds 700
  Ok "写进了记忆文件" ((Get-Content "$app\visitapi-editor.txt" -Raw) -like "*trader=$SORA*") `
     (((Get-Content "$app\visitapi-editor.txt") -join " | "))
  $srv,$url2 = Start-Srv
  $h2=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url2/" -UseBasicParsing).RawContentStream.ToArray())
  $t2=[regex]::Match($h2,'name="tok" content="([^"]+)"').Groups[1].Value
  $g3 = Json (Invoke-WebRequest "$url2/api/quests" -Headers @{"X-Token"=$t2} -UseBasicParsing)
  Ok "重启后依然不警告" (@($g3.issues | Where-Object { $_.code -eq "unknown_trader" }).Count -eq 0)

  # 取消标记，警告要回来 —— 别做成有去无回
  Post "$url2/api/quests/trader-ok" $t2 @{ id = $SORA; on = $false } | Out-Null
  $g4 = Json (Invoke-WebRequest "$url2/api/quests" -Headers @{"X-Token"=$t2} -UseBasicParsing)
  Ok "取消标记后警告回来" (@($g4.issues | Where-Object { $_.code -eq "unknown_trader" }).Count -eq 4)
}
finally { if($srv -and -not $srv.HasExited){ $srv|Stop-Process -Force } }
""
"合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
