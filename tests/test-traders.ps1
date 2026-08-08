# 自定义商人：三个来源要能扫出来，而且"是不是真商人"必须分得清。
#   mod  = 某个 mod 的 db\traders\<id>\base.json  → 真商人
#   dlg  = .dlg 头部的 trader 行                  → **只是对话说话人，未必是商人**
#   used = 只在现有任务的 traderId 里出现过        → 来历不明
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"
$dlg = "$T\BepInEx\config\VisitAPI"
$db  = "$T\SPT_Runtime\user\mods\VisitAPI-Server\db"
$exe = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$u8  = [Text.UTF8Encoding]::new($false)
$pass=0; $fail=0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }

# 重置
Remove-Item -LiteralPath $db -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dbsnap" $db -Recurse -Force
Get-ChildItem $dlg -Filter "*.dlg" | Remove-Item -Force -ErrorAction SilentlyContinue
Copy-Item "$SptHome\BepInEx\config\VisitAPI\90726f6a656374536f726132.dlg" "$dlg\" -Force

# 造一个"别的 mod 注册的真商人"
$CUST = "abcdef0123456789abcdef01"
$td = "$T\SPT_Runtime\user\mods\CoolTraderMod\db\traders\$CUST"
New-Item -ItemType Directory -Force $td | Out-Null
'{"_id":"' + $CUST + '","nickname":"Sasha","surname":"K"}' | Set-Content "$td\base.json" -Encoding UTF8

# 把一个任务挂到"只在 .dlg 里出现过"的那个 id 上（SORA），复现 Tech Leader 的场景
$SORA = "90726f6a656374536f726132"
$qf = "$db\quests\sora_supplies_handover.json"
$j = Get-Content $qf -Raw -Encoding UTF8 | ConvertFrom-Json
$qid = ($j.PSObject.Properties | Select-Object -First 1).Name
$j.$qid.traderId = $SORA
$j | ConvertTo-Json -Depth 40 | Set-Content $qf -Encoding UTF8

$srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$dlg`"" `
        -RedirectStandardOutput "$sp\tr.log" -PassThru -WindowStyle Hidden
try {
  $url=$null
  foreach($i in 1..40){ Start-Sleep -Milliseconds 250
    $log = if(Test-Path "$sp\tr.log"){Get-Content "$sp\tr.log" -Raw}else{$null}
    if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
  if(-not $url){throw "服务没起来"}
  $html=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok=[regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $g = Json (Invoke-WebRequest "$url/api/quests" -Headers @{"X-Token"=$tok} -UseBasicParsing)

  $byId = @{}; $g.traders | ForEach-Object { $byId[$_.id] = $_ }
  Ok "SPT 自带的还在" (@($g.traders | Where-Object { $_.source -eq "spt" }).Count -ge 10) `
     "$(@($g.traders | Where-Object { $_.source -eq 'spt' }).Count) 个"
  Ok "扫到了别的 mod 注册的商人" ($byId[$CUST] -ne $null) `
     $(if($byId[$CUST]){ "$($byId[$CUST].zh) source=$($byId[$CUST].source) from=$($byId[$CUST].from)" })
  Ok "mod 商人显示的是 nickname 不是 id" ($byId[$CUST].zh -eq "Sasha") $byId[$CUST].zh
  Ok "标出了它来自哪个 mod" ($byId[$CUST].from -eq "CoolTraderMod") $byId[$CUST].from

  Ok "扫到了 .dlg 里的说话人" ($byId[$SORA] -ne $null) `
     $(if($byId[$SORA]){ "$($byId[$SORA].zh) source=$($byId[$SORA].source) from=$($byId[$SORA].from)" })
  Ok "而且标成 dlg 而不是真商人" ($byId[$SORA].source -eq "dlg") $byId[$SORA].source
  Ok "名字取自 .dlg 的 trader 行" ($byId[$SORA].zh -eq "SORA") $byId[$SORA].zh

  # 校验：mod 商人不该报警，.dlg 说话人必须报警
  $warns = @($g.issues | Where-Object { $_.code -eq "unknown_trader" })
  Ok "挂到 .dlg 说话人上会被警告" (@($warns | Where-Object { $_.args -contains $SORA }).Count -eq 1) `
     (($warns | ForEach-Object { $_.args -join "" }) -join ",")

  # 换成 mod 商人后应当不再警告
  $j2 = Get-Content $qf -Raw -Encoding UTF8 | ConvertFrom-Json
  $j2.$qid.traderId = $CUST
  $j2 | ConvertTo-Json -Depth 40 | Set-Content $qf -Encoding UTF8
  $g2 = Json (Invoke-WebRequest "$url/api/quests" -Headers @{"X-Token"=$tok} -UseBasicParsing)
  Ok "挂到 mod 注册的真商人上不报警" (@($g2.issues | Where-Object { $_.code -eq "unknown_trader" }).Count -eq 0) `
     (($g2.issues | ForEach-Object { $_.code }) -join ",")
  Ok "任务卡上显示的是商人名字不是「未知商人」" ($byId[$CUST].zh -eq "Sasha")
}
finally {
  if($srv -and -not $srv.HasExited){ $srv|Stop-Process -Force }
  Remove-Item -LiteralPath "$T\SPT_Runtime\user\mods\CoolTraderMod" -Recurse -Force -ErrorAction SilentlyContinue
}
""
"合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
