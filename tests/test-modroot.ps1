# 内容库（BOT 外观 / 商人货架住的模组 db）的自动探测与选择。
# 规矩：恰好 1 个直接用；2 个以上让界面弹窗挑；一个都没有让人自己填路径。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$T    = "$sp\FakeEFT"
$mods = "$T\SPT_Runtime\user\mods"
$app  = "$T\editor2"          # 单独一份 exe：记忆文件要能独立观察
$u8   = [Text.UTF8Encoding]::new($false)

$pass=0; $fail=0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($u,$tok,$o){ $b=[Text.Encoding]::UTF8.GetBytes(($o|ConvertTo-Json -Depth 20 -Compress))
  Invoke-WebRequest $u -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" -Body $b -UseBasicParsing }

function Start-Srv {
  $log = "$sp\modroot.log"
  Remove-Item $log -Force -ErrorAction SilentlyContinue
  $p = Start-Process "$app\VisitAPI.Editor.exe" -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"" `
        -RedirectStandardOutput $log -PassThru -WindowStyle Hidden
  foreach($i in 1..40){ Start-Sleep -Milliseconds 250
    $l = if(Test-Path $log){Get-Content $log -Raw}else{$null}
    if($l){ $m=[regex]::Match($l,'http://127\.0\.0\.1:\d+'); if($m.Success){ return @($p,$m.Value) } } }
  throw "服务没起来"
}
function Tok($url){
  $html=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  [regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
}

# 一份干净的 exe 目录（没有记忆文件 = 模拟第一次用）
if (Test-Path $app) { Remove-Item -LiteralPath $app -Recurse -Force }
New-Item -ItemType Directory -Force $app | Out-Null
Get-ChildItem "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64" -File |
  Where-Object { $_.Extension -in ".exe",".dll",".json" } | Copy-Item -Destination "$app\" -Force

try {
  # ── ① 一个候选都没有 ──────────────────────────
  # FakeEFT 里原本只有 VisitAPI-Server（只有 quests/locales，没有任何内容标志）
  $srv,$url = Start-Srv
  try {
    $tok = Tok $url; $H=@{"X-Token"=$tok}
    $m = Json (Invoke-WebRequest "$url/api/mods" -Headers $H -UseBasicParsing)
    Ok "没内容的模组不算候选" (@($m.found).Count -eq 0) "$(@($m.found).Count) 个"
    Ok "一个都没有时不自作主张" ($m.ok -eq $false)
    $b = Json (Invoke-WebRequest "$url/api/bots" -Headers $H -UseBasicParsing)
    Ok "BOT 页收到「让人挑」" ($b.ok -eq $false -and $b.need -eq "pick") $b.need
    Ok "回包带上 EFT 根，好让界面拼默认路径" ($b.eft -and (Test-Path $b.eft)) $b.eft
    $a = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
    Ok "货架页也收到「让人挑」" ($a.ok -eq $false -and $a.need -eq "pick")
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  # ── ② 造两个内容模组 → 应该让人挑，不许自己选 ──
  New-Item -ItemType Directory -Force "$mods\LabBots\db\CustomBotLoadouts" | Out-Null
  Copy-Item "$sp\modsnap\CustomBotLoadouts\assault.json" "$mods\LabBots\db\CustomBotLoadouts\" -Force
  New-Item -ItemType Directory -Force "$mods\LabShop\db" | Out-Null
  Copy-Item "$sp\modsnap\assort.json" "$mods\LabShop\db\" -Force

  $srv,$url = Start-Srv
  try {
    $tok = Tok $url; $H=@{"X-Token"=$tok}
    $m = Json (Invoke-WebRequest "$url/api/mods" -Headers $H -UseBasicParsing)
    Ok "两个候选都扫到了" (@($m.found).Count -eq 2) (@($m.found | ForEach-Object { $_.mod }) -join ",")
    Ok "两个的时候不自作主张" ($m.ok -eq $false) $m.dir
    $lb = @($m.found | Where-Object mod -eq 'LabBots')
    $ls = @($m.found | Where-Object mod -eq 'LabShop')
    Ok "认出哪个有 BOT" ($lb.bots -eq 1 -and $lb.assorts -eq 0) "bots=$($lb.bots) assorts=$($lb.assorts)"
    Ok "认出哪个有货架" ($ls.assorts -eq 1 -and $ls.bots -eq 0) "bots=$($ls.bots) assorts=$($ls.assorts)"
    # 内容多的排前面：界面拿第一条当输入框的起手值
    Ok "内容多的排前面" ($m.found[0].mod -eq "LabBots") $m.found[0].mod

    # 选一个
    $r = Json (Post "$url/api/mods" $tok @{ path = "$mods\LabShop\db" })
    Ok "选定成功" ($r.ok -eq $true) $r.dir
    $a = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
    Ok "选完货架页就能读了" ($a.ok -eq $true -and @($a.schemes).Count -eq 1) "$(@($a.schemes).Count) 份"
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  # ── ③ 记住了吗 ────────────────────────────────
  $cfg = Get-Content "$app\visitapi-editor.txt" -Raw -Encoding UTF8
  Ok "选择写进了记忆文件" ($cfg -match 'mods=') ($cfg -split "`n" | Where-Object { $_ -match 'mods=' })
  Ok "任务库那一行没被冲掉" ($cfg -match 'root=')
  $srv,$url = Start-Srv
  try {
    $tok = Tok $url
    $m = Json (Invoke-WebRequest "$url/api/mods" -Headers @{"X-Token"=$tok} -UseBasicParsing)
    Ok "重启后回到那个目录" ($m.ok -eq $true -and $m.dir -like "*LabShop\db") $m.dir
    Ok "记住了就不再打扰人" ($m.ok -eq $true)
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  # ── ④ 恰好一个 → 直接用，不打扰 ───────────────
  Remove-Item "$app\visitapi-editor.txt" -Force -ErrorAction SilentlyContinue
  Remove-Item "$mods\LabShop" -Recurse -Force
  $srv,$url = Start-Srv
  try {
    $tok = Tok $url
    $m = Json (Invoke-WebRequest "$url/api/mods" -Headers @{"X-Token"=$tok} -UseBasicParsing)
    Ok "只有一个时自动选中" ($m.ok -eq $true -and $m.dir -like "*LabBots\db") $m.dir
    $b = Json (Invoke-WebRequest "$url/api/bots" -Headers @{"X-Token"=$tok} -UseBasicParsing)
    Ok "BOT 页直接就能用" ($b.ok -eq $true -and @($b.files.PSObject.Properties).Count -eq 1)
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  # ── ⑤ 指到一个还不存在的目录 = 从零开新模组 ───
  $srv,$url = Start-Srv
  try {
    $tok = Tok $url
    $fresh = "$mods\BrandNew\db"
    $r = Json (Post "$url/api/mods" $tok @{ path = $fresh })
    Ok "能指到还不存在的目录" ($r.ok -eq $true) $r.dir
    Ok "目录被建出来了" (Test-Path $fresh)
    $b = Json (Invoke-WebRequest "$url/api/bots" -Headers @{"X-Token"=$tok} -UseBasicParsing)
    Ok "空库能正常打开" ($b.ok -eq $true -and @($b.files.PSObject.Properties).Count -eq 0)
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }
}
finally {
  Get-Process -Name "VisitAPI.Editor" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  foreach ($d in @("LabBots","LabShop","BrandNew")) {
    Remove-Item "$mods\$d" -Recurse -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $app -Recurse -Force -ErrorAction SilentlyContinue
}
""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
