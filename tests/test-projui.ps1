# 设置页「工程」卡的界面冒烟（探针跑在无头 Edge 里，结果回写 _probe.dlg）。
# 套路照 test-backui.ps1；exe 旁的 visitapi-editor.txt 留底还原（探针会写 recent 偏好）。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$T    = "$sp\FakeEFT"; $dlg = "$T\BepInEx\config\VisitAPI"
$u8   = [Text.UTF8Encoding]::new($false)
$cfg  = Join-Path (Split-Path $Exe -Parent) "visitapi-editor.txt"
$cfg0 = if (Test-Path $cfg) { [IO.File]::ReadAllBytes($cfg) } else { $null }

Remove-Item "$dlg\_probe.dlg" -Force -ErrorAction SilentlyContinue
# 三根必须给全：内容库不定，存工程会被服务端按"三根不齐"拒掉，探针后半段全是虚过
$lab = "$T\labs\ProjUi\db"
New-Item -ItemType Directory -Force "$lab\CustomBotLoadouts" | Out-Null
$test = "$www\_projui.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-proj.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  Remove-Item "$sp\projui.log" -ErrorAction SilentlyContinue
  $srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$dlg`"","--quests=`"$T\SPT_Runtime\user\mods\VisitAPI-Server\db`"","--mods=`"$lab`"" `
          -RedirectStandardOutput "$sp\projui.log" -PassThru -WindowStyle Hidden
  try {
    $url=$null
    foreach($i in 1..40){ Start-Sleep -Milliseconds 250
      $log = if(Test-Path "$sp\projui.log"){Get-Content "$sp\projui.log" -Raw}else{$null}
      if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
    if(-not $url){throw "服务没起来"}
    $br = Start-Process $Edge -ArgumentList '--headless=new','--disable-gpu','--window-size=1680,1000',
            "$url/ui/_projui.html" -PassThru -WindowStyle Hidden
    try { foreach($i in 1..160){ Start-Sleep -Milliseconds 250; if(Test-Path "$dlg\_probe.dlg"){break} } }
    finally { if($br -and -not $br.HasExited){$br|Stop-Process -Force} }
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  if(-not (Test-Path "$dlg\_probe.dlg")){ "探针没回写结果"; exit 1 }
  $rows = @(([IO.File]::ReadAllText("$dlg\_probe.dlg",$u8) -split "`n") |
            Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR|REJECT)' })
  $rows
  $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|WINDOW-ERROR|REJECT' })
  if($rows.Count -lt 10){ ""; "只有 $($rows.Count) 项（下界 10）——探针多半中途炸了"; exit 1 }
  ""
  "合计 $($rows.Count) 项，通过 $($rows.Count-$bad.Count)，失败 $($bad.Count)"
  if($bad.Count -gt 0){ exit 1 }
}
finally {
  @("_ui.vaproj","_ui.vaproj.bak","_probe.dlg","_probe.dlg.bak") |
    ForEach-Object { Remove-Item (Join-Path $dlg $_) -Force -ErrorAction SilentlyContinue }
  Remove-Item "$T\labs\ProjUi" -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null
  Start-Sleep -Milliseconds 300
  if ($cfg0) { [IO.File]::WriteAllBytes($cfg, $cfg0) } else { Remove-Item $cfg -Force -ErrorAction SilentlyContinue }
}
