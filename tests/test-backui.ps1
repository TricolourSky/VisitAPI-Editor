# 还原备份页 + 任务数组参数的界面冒烟（探针跑在无头 Edge 里，结果回写 _probe.dlg）。
# 套路照 test-roles.ps1：拼 _test 页 → dotnet build（wwwroot 是嵌入资源）→ 编辑器自己伺服 → 轮询读结果。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$T    = "$sp\FakeEFT"; $dlg = "$T\BepInEx\config\VisitAPI"
$u8   = [Text.UTF8Encoding]::new($false)

# 夹具：一份现役（NEWLINE）+ 一份备份（OLDLINE），探针靠这两个记号验对调
[IO.File]::WriteAllText("$dlg\_bkui.dlg",     "trader: 5ac3b934156ae10c4430e83c `"T`"`n`n<a>`nNEWLINE", $u8)
[IO.File]::WriteAllText("$dlg\_bkui.dlg.bak", "trader: 5ac3b934156ae10c4430e83c `"T`"`n`n<a>`nOLDLINE", $u8)
Remove-Item "$dlg\_probe.dlg" -Force -ErrorAction SilentlyContinue

$test = "$www\_backui.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-back.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  Remove-Item "$sp\backui.log" -ErrorAction SilentlyContinue
  $srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$dlg`"" `
          -RedirectStandardOutput "$sp\backui.log" -PassThru -WindowStyle Hidden
  try {
    $url=$null
    foreach($i in 1..40){ Start-Sleep -Milliseconds 250
      $log = if(Test-Path "$sp\backui.log"){Get-Content "$sp\backui.log" -Raw}else{$null}
      if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
    if(-not $url){throw "服务没起来"}
    $br = Start-Process $Edge -ArgumentList '--headless=new','--disable-gpu','--window-size=1680,1000',
            "$url/ui/_backui.html" -PassThru -WindowStyle Hidden
    try { foreach($i in 1..160){ Start-Sleep -Milliseconds 250; if(Test-Path "$dlg\_probe.dlg"){break} } }
    finally { if($br -and -not $br.HasExited){$br|Stop-Process -Force} }
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  if(-not (Test-Path "$dlg\_probe.dlg")){ "探针没回写结果"; exit 1 }
  $rows = @(([IO.File]::ReadAllText("$dlg\_probe.dlg",$u8) -split "`n") |
            Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR|REJECT)' })
  $rows
  $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|WINDOW-ERROR|REJECT' })
  # 项数硬下界：探针整段只有一个 try/catch，中途炸了会把后面的断言全吞掉（老坑）
  if($rows.Count -lt 15){ ""; "只有 $($rows.Count) 项（下界 15）——探针多半中途炸了"; exit 1 }
  ""
  "合计 $($rows.Count) 项，通过 $($rows.Count-$bad.Count)，失败 $($bad.Count)"
  if($bad.Count -gt 0){ exit 1 }
}
finally {
  @("_bkui.dlg","_bkui.dlg.bak","_bkui.dlg.swap","_probe.dlg","_probe.dlg.bak") |
    ForEach-Object { Remove-Item (Join-Path $dlg $_) -Force -ErrorAction SilentlyContinue }
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null
}
