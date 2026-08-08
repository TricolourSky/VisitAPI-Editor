# 程序介绍页的端到端测试。和 test-questui.ps1 同一套路：
# 探针要跑在服务端发出来的那张页面上（同源才调得到 /api），所以临时往 wwwroot 里放一份副本。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$edge = $Edge
$T    = "$sp\FakeEFT"
$db   = "$T\SPT_Runtime\user\mods\VisitAPI-Server\db"
$u8   = [Text.UTF8Encoding]::new($false)

Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dbsnap" $db -Recurse -Force

# 两个来源各造几张真 PNG（探针要验缩略图真能渲染出来，假字节不行）
Add-Type -AssemblyName System.Drawing
$sptI = "$T\SPT_Runtime\SPT_Data\images\quest\icon"
$modI = "$T\SPT_Runtime\user\mods\VisitAPI-Server\images\quest\icon"
Remove-Item $sptI, $modI -Recurse -Force -ErrorAction SilentlyContinue
foreach ($f in @("$sptI\5967505886f774590730dadc.png","$sptI\594d241f86f7740d8246218d.png",
                 "$modI\sora.png","$modI\bad.name.png")) {
  New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null
  $b = New-Object System.Drawing.Bitmap 16, 9
  $b.Save($f, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
}

$test = "$www\_test.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-qimg.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  $srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--quests=`"$db`"" `
          -RedirectStandardOutput "$sp\srvqi.log" -PassThru -WindowStyle Hidden
  try {
    $url = $null
    foreach ($i in 1..40) {
      Start-Sleep -Milliseconds 250
      $log = if (Test-Path "$sp\srvqi.log") { Get-Content "$sp\srvqi.log" -Raw } else { $null }
      if ($log) { $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
    }
    if (-not $url) { throw "服务没起来" }

    $out = "$T\BepInEx\config\VisitAPI\_probe.dlg"
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    $br = Start-Process $edge -ArgumentList '--headless=new','--disable-gpu','--window-size=2560,1400',
            "$url/ui/_test.html" -PassThru -WindowStyle Hidden
    try {
      foreach ($i in 1..120) { Start-Sleep -Milliseconds 250; if (Test-Path $out) { break } }
    } finally { if ($br -and -not $br.HasExited) { $br | Stop-Process -Force } }

    if (-not (Test-Path $out)) { "探针没回写结果 —— 页面脚本可能整个炸了"; exit 1 }
    $rows = @([IO.File]::ReadAllText($out,$u8) -split "`n" |
              Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR|REJECT)' })
    $rows
    $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|ERROR|REJECT' })
    ""
    "合计 $($rows.Count) 项，通过 $($rows.Count - $bad.Count)，失败 $($bad.Count)"
  } finally { if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force } }
}
finally {
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  Remove-Item "$T\BepInEx\config\VisitAPI\_probe.dlg*" -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null      # 把测试副本从 exe 里清掉
}
