# 心跳/自动退出的回归测试。
# 起因：用户切去别的标签页十几分钟回来，程序自己关了、网页还在。
# 真凶是浏览器掐后台标签页的定时器（隐藏满 5 分钟后 setInterval 被压到每分钟一次），
# 而服务端 40 秒收不到就退出。所以这里要证明的是「静默一分钟也不许退」。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$T    = "$sp\FakeEFT"
$pass = 0; $fail = 0
function Ok($n, $c, $d) { if ($c) { $script:pass++; "PASS $n" + $(if($d){" [$d]"}) }
                          else    { $script:fail++; "FAIL $n" + $(if($d){" [$d]"}) } }

dotnet build $proj -v q --nologo | Out-Null

# 每个场景起一台干净的服务端，跑完收摊
function Boot($tag) {
  $log = "$sp\srvhb-$tag.log"
  Remove-Item $log -Force -ErrorAction SilentlyContinue
  $p = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"" `
        -RedirectStandardOutput $log -PassThru -WindowStyle Hidden
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $t = if (Test-Path $log) { Get-Content $log -Raw } else { $null }
    if ($t) { $m=[regex]::Match($t,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
  }
  if (-not $url) { throw "服务没起来 ($tag)" }
  # 令牌在页面的 <meta> 里，测试脚本自己从首页抠出来
  $html = (Invoke-WebRequest "$url/" -UseBasicParsing).Content
  $tok = [regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  return @{ Proc = $p; Url = $url; Tok = $tok; Log = $log }
}
function Halt($s) { if ($s -and $s.Proc -and -not $s.Proc.HasExited) { $s.Proc | Stop-Process -Force } }
function Alive($s) { Start-Sleep -Milliseconds 200; return -not $s.Proc.HasExited }
function Bye($s) {
  Invoke-WebRequest "$($s.Url)/api/bye" -Method POST -Headers @{ "X-Token" = $s.Tok } -UseBasicParsing | Out-Null }
function Beat($s) { Invoke-WebRequest "$($s.Url)/api/ping" -UseBasicParsing | Out-Null }

# ── 场景 1：真凶复现。整整 70 秒不报到，服务端必须还活着 ──
# 旧版本 40 秒就退了，这一条就是那个 BUG 的守门人。
$s = Boot "idle"
try {
  Ok "服务起得来" (Alive $s) $s.Url
  Ok "首页里有令牌" ($s.Tok.Length -ge 8)
  Start-Sleep -Seconds 70
  Ok "静默 70 秒不退出（后台标签页被节流也扛得住）" (Alive $s) `
     $(if($s.Proc.HasExited){"进程已退出 —— 超时又太短了"}else{"还活着"})
  Beat $s
  Ok "补一发报到还能通" (Alive $s)
} finally { Halt $s }

# ── 场景 2：关标签页要能让它及时退，不用干等超时 ──
$s = Boot "bye"
try {
  Bye $s
  Start-Sleep -Seconds 6
  Ok "告别后宽限期内不急着退" (Alive $s) "6 秒"
  Start-Sleep -Seconds 12
  Ok "宽限期过了就退出" (-not (Alive $s)) `
     $(if($s.Proc.HasExited){"已退出"}else{"还赖着 —— 关了页面进程不走"})
} finally { Halt $s }

# ── 场景 3：F5 刷新不能被当成关闭 ──
# 刷新同样会触发 pagehide，早先就是因为直接退，一按 F5 服务端就没了。
$s = Boot "f5"
try {
  Bye $s
  Start-Sleep -Seconds 2
  Beat $s                       # 新页面加载完，报到 —— 等于告诉服务端"刚才是刷新"
  Start-Sleep -Seconds 15
  Ok "刷新（告别后又报到）不会被误杀" (Alive $s) `
     $(if($s.Proc.HasExited){"进程没了 —— F5 会杀服务端"}else{"还活着"})
} finally { Halt $s }

# ── 场景 4：/api/bye 也要验令牌，不能让别的网页随手关掉它 ──
$s = Boot "tok"
try {
  $code = try { (Invoke-WebRequest "$($s.Url)/api/bye" -Method POST -UseBasicParsing).StatusCode }
          catch { $_.Exception.Response.StatusCode.value__ }
  Ok "不带令牌的告别被拒" ($code -eq 403) "HTTP $code"
  Start-Sleep -Seconds 13
  Ok "被拒的告别没有让它退出" (Alive $s)
} finally { Halt $s }

# ══════════════════════════════════════════════════════════════════
# 下面这几条是**真浏览器**跑的。
# 上面那四条全是 PowerShell 直接发 /api/bye 模拟的 —— 服务端那边确实对，
# 但"浏览器到底发不发得出这一发"从来没验过，结果线上就是发不出来（关整个窗口时尤其）：
# 标签页关了，程序还赖着。现在改成靠 /live 长连接判断，这里就得用真浏览器守住。
# ══════════════════════════════════════════════════════════════════
$www  = "$Root\src\VisitAPI.Server\wwwroot"
$u8   = [Text.UTF8Encoding]::new($false)
$live = "$www\_live.html"
[IO.File]::WriteAllText($live,
  [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-live.js",$u8), $u8)
dotnet build $proj -v q --nologo | Out-Null
$T2 = "$Root\tests\FakeEFT\BepInEx\config\VisitAPI"
# 浏览器配置目录放系统临时目录，**并且要把引号包进参数里**：
# 仓库路径带空格（"VisitAPI Editor"），不包引号的话 --user-data-dir 会被空格劈成两半，
# 浏览器起不来又不报错，表现就是"标题永远读不到"。
function Browse($tag,$url,$port) {
  $prof = Join-Path $env:TEMP "visitapi-hb-$tag"
  Start-Process $Edge -ArgumentList '--headless=new','--disable-gpu','--no-first-run',"--user-data-dir=`"$prof`"",
    "--remote-debugging-port=$port",'--window-size=1200,800',"$url/ui/_live.html" -PassThru -WindowStyle Hidden
}
# ⚠️ 必须按 url 挑，不能拿第一个：Edge 自己会多开一张"同步你的浏览数据"的宣传页，
# 而且它排在前面，取第一个读到的是那张的标题（这一条卡了半天）
function Title($port) {
  try { (Invoke-RestMethod "http://127.0.0.1:$port/json/list" |
         Where-Object { $_.type -eq 'page' -and $_.url -like '*_live.html*' } |
         Select-Object -First 1).title } catch { "?" }
}
function WaitTitle($port,$want,$sec) {
  $w=[Diagnostics.Stopwatch]::StartNew()
  while ($w.Elapsed.TotalSeconds -lt $sec) { Start-Sleep -Milliseconds 300
    if ((Title $port) -eq $want) { return [math]::Round($w.Elapsed.TotalSeconds,1) } }
  return -1
}
function WaitExit($s,$sec) {
  $w=[Diagnostics.Stopwatch]::StartNew()
  while ($w.Elapsed.TotalSeconds -lt $sec) { Start-Sleep -Milliseconds 400
    if ($s.Proc.HasExited) { return [math]::Round($w.Elapsed.TotalSeconds,1) } }
  return -1
}
try {
  # ── 场景 5：关掉浏览器（连 pagehide 都发不出的最糟情况）→ 服务端必须自己退 ──
  $s = Boot "live"
  $br = Browse "a" $s.Url 9401
  try {
    $t = WaitTitle 9401 "LIVE" 20
    Ok "真浏览器打开后页面是活的" ($t -ge 0) "$t 秒"
    Ok "页面开着时服务端不退" (Alive $s)
    $br | Stop-Process -Force; $br = $null      # 整个浏览器没了 = 那一发告别根本发不出去
    $t = WaitExit $s 40
    Ok "关掉浏览器后服务端自己退了" ($t -ge 0) $(if($t -lt 0){"40 秒还赖着 —— 长连接没起作用"}else{"$t 秒"})
    # 比英文那半句：日志是重定向出来的，中文在这里会变成乱码，匹配不上
    Ok "退出理由是「页面已关闭」不是超时" ((Get-Content $s.Log -Raw) -match 'Page closed')
  } finally { if ($br -and -not $br.HasExited) { $br | Stop-Process -Force }; Halt $s }

  # ── 场景 6：开着两个页面，关掉一个不许退；最后一个走了才退 ──
  $s = Boot "two"
  $b1 = Browse "b1" $s.Url 9402
  $b2 = Browse "b2" $s.Url 9403
  try {
    (WaitTitle 9402 "LIVE" 20) | Out-Null; (WaitTitle 9403 "LIVE" 20) | Out-Null
    $b1 | Stop-Process -Force; $b1 = $null
    Start-Sleep -Seconds 18
    Ok "还有一个页面连着，不许退" (Alive $s) $(if($s.Proc.HasExited){"被误杀了"}else{"18 秒还活着"})
    $b2 | Stop-Process -Force; $b2 = $null
    $t = WaitExit $s 40
    Ok "最后一个页面也走了才退" ($t -ge 0) $(if($t -lt 0){"没退"}else{"$t 秒"})
  } finally { foreach ($b in @($b1,$b2)) { if ($b -and -not $b.HasExited) { $b | Stop-Process -Force } }; Halt $s }

  # ── 场景 7：反过来——后台被杀，页面得当场说清楚，不能装作没事 ──
  $s = Boot "rev"
  $br = Browse "c" $s.Url 9404
  try {
    (WaitTitle 9404 "LIVE" 20) | Out-Null
    Halt $s                                    # 硬杀，连 /api/quit 都没走
    $t = WaitTitle 9404 "DEAD" 30
    Ok "后台没了，页面当场盖出提示" ($t -ge 0 -and $t -lt 12) $(if($t -lt 0){"30 秒还装活着"}else{"$t 秒"})
  } finally { if ($br -and -not $br.HasExited) { $br | Stop-Process -Force }; Halt $s }
} finally {
  Remove-Item $live -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null   # 把测试副本从 exe 里清掉
}

""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
# 上面那些 try/catch 会把 $? 弄脏，显式收口，别让调用方以为整轮失败了
exit $(if ($fail) { 1 } else { 0 })
