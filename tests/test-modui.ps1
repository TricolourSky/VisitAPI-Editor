# BOT 外观页 + 商人货架页的界面端到端测试。
# 探针必须跑在**服务端发出来的那张页面**上（同源才调得到 /api 和 /ui），
# 所以临时往 wwwroot 里放一份 index.html + 探针的副本，跑完删掉再重编。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$T    = "$sp\FakeEFT"
# 实验目录放在 user\mods 之外：SetQuestDb 会自动建 quests\，落在 mods 下面会被
# ScanQuestRoots 当成"一个有任务的模组"，把没显式指定任务库的测试带偏（test-bots 里有完整经过）
$db   = "$T\labs\UiLab\db"
$u8   = [Text.UTF8Encoding]::new($false)

Remove-Item "$T\labs" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $db | Out-Null
Copy-Item "$sp\modsnap\*" $db -Recurse -Force
# 商人头像：base.json 的 avatar 写的是一条网址（/files/trader/avatar/LAB.png），
# 真图按 WTT 的习惯放在模组根的 res\ 底下，两边只有文件名对得上。
# 没有这张图，货架页的头像就只剩剪影，探针那两条会红。
New-Item -ItemType Directory -Force "$T\labs\UiLab\res" | Out-Null
[IO.File]::WriteAllBytes("$T\labs\UiLab\res\LAB.png", [Convert]::FromBase64String(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))

$test = "$www\_test.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-mod.js",$u8), $u8)
  dotnet build $Proj -v q --nologo | Out-Null

  $srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--mods=`"$db`"" `
          -RedirectStandardOutput "$sp\srvmod.log" -PassThru -WindowStyle Hidden
  try {
    $url = $null
    foreach ($i in 1..40) {
      Start-Sleep -Milliseconds 250
      $log = if (Test-Path "$sp\srvmod.log") { Get-Content "$sp\srvmod.log" -Raw } else { $null }
      if ($log) { $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
    }
    if (-not $url) { throw "服务没起来" }

    $out = "$T\BepInEx\config\VisitAPI\_probe.dlg"
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    # 不用 --dump-dom：它会在探针跑完之前就把浏览器收掉。让浏览器活着，轮询探针回写的文件。
    $br = Start-Process $Edge -ArgumentList '--headless=new','--disable-gpu','--window-size=1680,1000',
            "$url/ui/_test.html" -PassThru -WindowStyle Hidden
    try {
      foreach ($i in 1..160) { Start-Sleep -Milliseconds 250; if (Test-Path $out) { break } }
    } finally { if ($br -and -not $br.HasExited) { $br | Stop-Process -Force } }

    if (-not (Test-Path $out)) { "探针没回写结果 —— 页面脚本可能整个炸了"; exit 1 }
    $rows = @([IO.File]::ReadAllText($out,$u8) -split "`n" |
              Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR|REJECT)' })
    $rows
    $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|WINDOW-ERROR|REJECT' })
    # 项数硬下界。探针整段共用一个 try/catch，**第一处 null 解引用就跳到 catch**，
    # 后面几十条断言直接消失，而汇总只多一行 EXCEPTION —— 看着像"只红了一条"。
    # 数字只在真的新增断言时才往上调。
    $FLOOR = 150
    if ($rows.Count -lt $FLOOR) {
      $bad += "FAIL 断言项数塌了：$($rows.Count) < $FLOOR —— 多半是中途抛异常把后半段吃掉了"
      "FAIL 断言项数塌了：$($rows.Count) < $FLOOR"
    }
    ""
    "合计 $($rows.Count) 项，通过 $($rows.Count - $bad.Count)，失败 $($bad.Count)"
  } finally { if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force } }
}
finally {
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  Remove-Item "$T\labs" -Recurse -Force -ErrorAction SilentlyContinue
  # 探针回写的结果文件也要收掉：DlgLinks 扫**全工作区**，留一份上百行的 .dlg 在这儿，
  # 单跑本脚本时会把后面的挂接测试带偏（Memory 第 7 节 F「DlgLinks 扫全工作区」那条）。
  # 跑全量时靠字母序靠后的脚本顺手扫是运气，不是设计。
  Remove-Item "$T\BepInEx\config\VisitAPI\_probe.dlg*" -Force -ErrorAction SilentlyContinue
  dotnet build $Proj -v q --nologo | Out-Null      # 把测试副本从 exe 里清掉
}
