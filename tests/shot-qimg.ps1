# 给介绍页截图：临时副本 + 无头 Edge。看一眼真实排版，别只信测试通过。
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

$test = "$www\_shot.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\shot-qimg.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  $srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--quests=`"$db`"" `
          -RedirectStandardOutput "$sp\srvshot.log" -PassThru -WindowStyle Hidden
  try {
    $url = $null
    foreach ($i in 1..40) {
      Start-Sleep -Milliseconds 250
      $log = if (Test-Path "$sp\srvshot.log") { Get-Content "$sp\srvshot.log" -Raw } else { $null }
      if ($log) { $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
    }
    if (-not $url) { throw "服务没起来" }

    foreach ($v in @(@("spt",""), @("mod","#mod"), @("custom","#custom"))) {
      $png = "$sp\qimg-$($v[0]).png"
      Remove-Item $png -Force -ErrorAction SilentlyContinue
      # 不用 & 直接调：Edge 把"写了多少字节"打到 stderr，PS 5.1 会当成错误抛出来
      Start-Process $edge -Wait -WindowStyle Hidden -ArgumentList '--headless=new','--disable-gpu',
        '--window-size=2560,1500','--hide-scrollbars','--virtual-time-budget=6000',
        "--screenshot=$png","$url/ui/_shot.html$($v[1])"
      if (Test-Path $png) { "OK  $png  $((Get-Item $png).Length) bytes" } else { "MISS $png" }
    }
  } finally { if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force } }
}
finally {
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null
}
