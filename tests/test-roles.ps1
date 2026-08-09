# 三样东西的验收：节点身份（start / first / when）、tab: 门控、旧版 4.0.13 剧本的兑存检查。
# 前两样以前"图上看得见、界面里改不了"，第三样是"能打开、不报错、进游戏才发现不对"。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$edge = $Edge
$T    = "$sp\FakeEFT"; $dlg = "$T\BepInEx\config\VisitAPI"
$u8   = [Text.UTF8Encoding]::new($false)

Copy-Item "$sp\torture.dlg" "$dlg\torture.dlg" -Force
Copy-Item "$sp\old4013.dlg" "$dlg\old4013.dlg" -Force
Get-ChildItem $dlg -Filter "*.bak" | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item "$dlg\_probe.dlg" -Force -ErrorAction SilentlyContinue
$orig = [IO.File]::ReadAllText("$dlg\torture.dlg", $u8)

$test = "$www\_roles.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-roles.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  $srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$dlg`"" `
          -RedirectStandardOutput "$sp\roles.log" -PassThru -WindowStyle Hidden
  try {
    $url=$null
    foreach($i in 1..40){ Start-Sleep -Milliseconds 250
      $log = if(Test-Path "$sp\roles.log"){Get-Content "$sp\roles.log" -Raw}else{$null}
      if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
    if(-not $url){throw "服务没起来"}
    $br = Start-Process $edge -ArgumentList '--headless=new','--disable-gpu','--window-size=1680,1000',
            "$url/ui/_roles.html" -PassThru -WindowStyle Hidden
    try { foreach($i in 1..120){ Start-Sleep -Milliseconds 250; if(Test-Path "$dlg\_probe.dlg"){break} } }
    finally { if($br -and -not $br.HasExited){$br|Stop-Process -Force} }
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  if(-not (Test-Path "$dlg\_probe.dlg")){ "探针没回写结果"; exit 1 }
  $rows = @(([IO.File]::ReadAllText("$dlg\_probe.dlg",$u8) -split "`n") |
            Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR)' })
  $rows
  $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|WINDOW-ERROR' })
  ""
  "合计 $($rows.Count) 项，通过 $($rows.Count-$bad.Count)，失败 $($bad.Count)"
}
finally {
  # 收拾干净，别把 fixture 留给下一个测试（DlgLinks 是"扫全部 .dlg"，留下就会串进别人的结果）
  @("torture.dlg","torture.dlg.bak","old4013.dlg","old4013.dlg.bak","_probe.dlg") |
    ForEach-Object { Remove-Item (Join-Path $dlg $_) -Force -ErrorAction SilentlyContinue }
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null
}
