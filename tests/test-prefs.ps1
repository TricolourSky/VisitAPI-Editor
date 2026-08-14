# 偏好存取的端到端测试：起真服务、打真接口、量真文件。
# 要证明的核心一条：**偏好活得过重启和换端口**——这正是 localStorage 做不到、
# 逼我们搬进 visitapi-editor.txt 的那个根因（引导每次都弹 / 语言主题悄悄回默认）。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
$sp   = $PSScriptRoot
$T    = "$sp\FakeEFT"; $dlg = "$T\BepInEx\config\VisitAPI"
$u8   = [Text.UTF8Encoding]::new($false)
# 偏好正本 = exe 旁边那个 txt。先留底，跑完原样放回去，别把开发机的记忆搅了
$cfg  = Join-Path (Split-Path $Exe -Parent) "visitapi-editor.txt"
$cfg0 = if (Test-Path $cfg) { [IO.File]::ReadAllBytes($cfg) } else { $null }

$pass = 0; $fail = 0
function Ok($name, $cond, $detail) {
  if ($cond) { $script:pass++; "PASS $name" + $(if($detail){" [$detail]"}) }
  else       { $script:fail++; "FAIL $name" + $(if($detail){" [$detail]"}) }
}
function Post($url, $tok, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 5 -Compress))
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" `
    -Body $bytes -UseBasicParsing
}
function PostCode($url, $tok, $obj) {
  try { (Post $url $tok $obj).StatusCode }
  catch { $_.Exception.Response.StatusCode.value__ }
}
function StartSrv($logName) {
  Remove-Item "$sp\$logName" -ErrorAction SilentlyContinue
  $srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$dlg`"" `
          -RedirectStandardOutput "$sp\$logName" -PassThru -WindowStyle Hidden
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $log = if (Test-Path "$sp\$logName") { (Get-Content "$sp\$logName" -Raw) } else { $null }
    if ($log) { $m = [regex]::Match($log, 'http://127\.0\.0\.1:\d+'); if ($m.Success) { $url = $m.Value; break } }
  }
  if (-not $url) { throw "服务没起来" }
  $html = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok  = [regex]::Match($html, 'name="tok" content="([^"]+)"').Groups[1].Value
  return @{ Srv = $srv; Url = $url; Tok = $tok; Html = $html }
}

$a = $null; $b = $null
try {
  # ── 1 注入与写入 ────────────────────────────────
  $a = StartSrv "prefs.log"
  Ok "页面里注入了 window.PREFS" ($a.Html -match 'window\.PREFS=')
  Ok "存一个语言偏好" ((Post "$($a.Url)/api/pref" $a.Tok @{ key="lang"; value="en" }).StatusCode -eq 200)
  Ok "存一段 JSON 值（源码窗位置那种）" ((Post "$($a.Url)/api/pref" $a.Tok `
      @{ key="srcwin"; value='{"x":1,"y":2,"w":3,"h":4}' }).StatusCode -eq 200)
  $txt = [IO.File]::ReadAllText($cfg, $u8)
  # WriteAllLines 写的是 CRLF，.NET 正则的 $ 只认 \n 前面——\r 要显式吃掉
  Ok "txt 里落了 pref.lang=en" ($txt -match '(?m)^pref\.lang=en\r?$')
  Ok "txt 里落了 pref.srcwin=JSON" ($txt -match '(?m)^pref\.srcwin=\{"x":1')
  # 键收得紧：带空格 / 大写 / 空的一律 400；值不许换行
  Ok "坏键被拒（空格）"  ((PostCode "$($a.Url)/api/pref" $a.Tok @{ key="Bad Key"; value="1" }) -eq 400)
  Ok "坏键被拒（大写）"  ((PostCode "$($a.Url)/api/pref" $a.Tok @{ key="LANG"; value="1" }) -eq 400)
  Ok "坏键被拒（空）"    ((PostCode "$($a.Url)/api/pref" $a.Tok @{ key=""; value="1" }) -eq 400)
  Ok "换行的值被拒"      ((PostCode "$($a.Url)/api/pref" $a.Tok @{ key="lang"; value="a`nb" }) -eq 400)
  $h2 = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$($a.Url)/" -UseBasicParsing).RawContentStream.ToArray())
  Ok "再取页面 PREFS 里带上了新值" ($h2 -match '"lang":"en"')

  # ── 2 活得过重启（换端口）──────────────────────
  $a.Srv | Stop-Process -Force; Start-Sleep -Milliseconds 600; $a = $null
  $b = StartSrv "prefs2.log"
  Ok "重启后端口换了照样带着偏好" ($b.Html -match '"lang":"en"') $b.Url
  Ok "JSON 值也原样回来" ($b.Html -match '"srcwin":')

  # ── 3 清除 ──────────────────────────────────────
  Ok "空值=删除" ((Post "$($b.Url)/api/pref" $b.Tok @{ key="lang"; value="" }).StatusCode -eq 200)
  $txt2 = [IO.File]::ReadAllText($cfg, $u8)
  Ok "txt 里那行没了" (-not ($txt2 -match '(?m)^pref\.lang='))
  $h3 = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$($b.Url)/" -UseBasicParsing).RawContentStream.ToArray())
  # 只在注入的那一小段 window.PREFS={...} 里找——整页 HTML 的源码里本来就有 "lang" 字样
  $blob = [regex]::Match($h3, 'window\.PREFS=(\{[^<]*\})').Groups[1].Value
  Ok "页面 PREFS 里也没了" ($blob.Length -gt 0 -and -not ($blob -match '"lang"')) $blob

  ""
  "合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
  if ($fail -gt 0) { exit 1 }
}
finally {
  foreach ($s in @($a, $b)) { if ($s -and $s.Srv -and -not $s.Srv.HasExited) { $s.Srv | Stop-Process -Force } }
  Start-Sleep -Milliseconds 400
  # 把开发机的记忆文件原样放回去（没有就删干净），别让测试值渗出去
  if ($cfg0) { [IO.File]::WriteAllBytes($cfg, $cfg0) } else { Remove-Item $cfg -Force -ErrorAction SilentlyContinue }
}
