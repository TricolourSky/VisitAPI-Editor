# 任务库是空的时候，作者还能不能开工。
# 起因：库里一个 .json 都没有时整页只剩一句话，「＋新建」按钮根本不渲染，人被卡死在那一页。
# 所以这里专门搭一个**空的**任务库（不是从 dbsnap 复制的那个），走真界面把第一条任务建出来。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$T    = "$sp\FakeEFT"
$u8   = [Text.UTF8Encoding]::new($false)

# 空库：目录建出来，但里面什么都不放
$db = "$sp\EmptyDb"
if (Test-Path $db) { Remove-Item $db -Recurse -Force }
New-Item -ItemType Directory -Force "$db\quests","$db\locales" | Out-Null

$test = "$www\_empty.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-empty.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  $srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--quests=`"$db`"" `
          -RedirectStandardOutput "$sp\srvempty.log" -PassThru -WindowStyle Hidden
  try {
    $url = $null
    foreach ($i in 1..40) {
      Start-Sleep -Milliseconds 250
      $log = if (Test-Path "$sp\srvempty.log") { Get-Content "$sp\srvempty.log" -Raw } else { $null }
      if ($log) { $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
    }
    if (-not $url) { throw "服务没起来" }

    $out = "$T\BepInEx\config\VisitAPI\_probe.dlg"
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    $br = Start-Process $Edge -ArgumentList '--headless=new','--disable-gpu','--window-size=2560,1400',
            "$url/ui/_empty.html" -PassThru -WindowStyle Hidden
    try {
      foreach ($i in 1..120) { Start-Sleep -Milliseconds 250; if (Test-Path $out) { break } }
    } finally { if ($br -and -not $br.HasExited) { $br | Stop-Process -Force } }

    if (-not (Test-Path $out)) { "探针没回写结果 —— 页面脚本可能整个炸了"; exit 1 }
    $rows = @([IO.File]::ReadAllText($out,$u8) -split "`n" |
              Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR|REJECT)' })
    $rows

    # 盘上真要有这份文件，光看界面不算数
    $made = "$db\quests\first_quests.json"
    $onDisk = Test-Path $made
    if ($onDisk) { $rows += "PASS 文件真的落到盘上了" } else { $rows += "FAIL 文件没落到盘上 [$made]" }
    if ($onDisk) {
      # 必须按 UTF-8 读：Get-Content -Raw 走系统 ANSI，中文任务名会烂掉、ConvertFrom-Json 直接抛
      $j = [IO.File]::ReadAllText($made,$u8) | ConvertFrom-Json
      $n = @($j.PSObject.Properties).Count
      if ($n -eq 1) { $rows += "PASS 文件里正好一条任务" } else { $rows += "FAIL 文件里有 $n 条" }
      $loc = "$db\locales\ch.json"
      if ((Test-Path $loc) -and ([IO.File]::ReadAllText($loc,$u8) -match 'name')) { $rows += "PASS 文案也落盘了" }
      else { $rows += "FAIL 文案没落盘" }
    }
    $rows | Select-Object -Last 3

    $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|ERROR|REJECT' })
    ""
    "合计 $($rows.Count) 项，通过 $($rows.Count - $bad.Count)，失败 $($bad.Count)"
  } finally { if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force } }
}
finally {
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  Remove-Item "$T\BepInEx\config\VisitAPI\_probe.dlg*" -Force -ErrorAction SilentlyContinue
  Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null      # 把测试副本从 exe 里清掉
}
