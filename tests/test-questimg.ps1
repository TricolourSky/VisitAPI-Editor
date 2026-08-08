# 任务配图的接口测试。
# 关键事实（反编译 SPT 4.1.1 核实）：路由键**不带扩展名**，请求也会先切到第一个点再查表。
# 所以原版任务 json 写 .jpg、磁盘上却是 .png 也能对上 —— 我们的预览必须照抄这个规则，
# 否则 558 个原版任务的配图在编辑器里一张都显示不出来。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$T    = "$sp\FakeEFT"
$db   = "$T\SPT_Runtime\user\mods\VisitAPI-Server\db"
$sptI = "$T\SPT_Runtime\SPT_Data\images\quest\icon"
$modI = "$T\SPT_Runtime\user\mods\VisitAPI-Server\images\quest\icon"
$pass = 0; $fail = 0
function Ok($n, $c, $d) { if ($c) { $script:pass++; "PASS $n" + $(if($d){" [$d]"}) }
                          else    { $script:fail++; "FAIL $n" + $(if($d){" [$d]"}) } }

# 造两个来源的图。用真 PNG 字节，不然 Results.File 吐出来的东西没法验。
Add-Type -AssemblyName System.Drawing
function MakePng($path, $w, $h) {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  $b = New-Object System.Drawing.Bitmap $w, $h
  $b.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
}
Remove-Item $sptI, $modI -Recurse -Force -ErrorAction SilentlyContinue
MakePng "$sptI\5967505886f774590730dadc.png" 16 9      # 原版那种：json 里会写成 .jpg
MakePng "$sptI\594d241f86f7740d8246218d.png" 16 9
MakePng "$modI\sora.png"      12 12                     # 作者自己的
MakePng "$modI\bad.name.png"  12 12                     # 名字里多一个点 —— SPT 会截断

Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dbsnap" $db -Recurse -Force

dotnet build $proj -v q --nologo | Out-Null
$log = "$sp\srvimg.log"; Remove-Item $log -Force -ErrorAction SilentlyContinue
$srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--quests=`"$db`"" `
        -RedirectStandardOutput $log -PassThru -WindowStyle Hidden
try {
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $t = if (Test-Path $log) { Get-Content $log -Raw } else { $null }
    if ($t) { $m=[regex]::Match($t,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
  }
  if (-not $url) { throw "服务没起来" }
  $html = (Invoke-WebRequest "$url/" -UseBasicParsing).Content
  $tok  = [regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $H    = @{ "X-Token" = $tok }

  # ── 清单 ──
  $d = Invoke-RestMethod "$url/api/quests/images" -Headers $H
  Ok "列出 SPT 自带的图" (@($d.spt.files).Count -eq 2) ($d.spt.files -join ",")
  Ok "列出模组目录的图" (@($d.mod.files).Count -eq 2) ($d.mod.files -join ",")
  Ok "报出模组名" ($d.mod.name -eq "VisitAPI-Server") $d.mod.name
  Ok "认出 VisitAPI-Server 会自己注册图片" ($d.mod.registers -eq $true) "registers=$($d.mod.registers)"
  Ok "两个目录都报了真路径" ($d.spt.dir -like "*SPT_Data*" -and $d.mod.dir -like "*VisitAPI-Server*")

  function Img($q) {
    try { $r = Invoke-WebRequest "$url/qimg?$q&t=$tok" -UseBasicParsing
          return @{ Code = $r.StatusCode; Len = $r.RawContentLength; Type = $r.Headers["Content-Type"] } }
    catch { return @{ Code = $_.Exception.Response.StatusCode.value__; Len = 0; Type = "" } }
  }

  # ── 取图 ──
  Ok "按裸文件名取模组的图" ((Img "src=mod&name=sora.png").Code -eq 200)
  Ok "按裸文件名取 SPT 的图" ((Img "src=spt&name=5967505886f774590730dadc.png").Code -eq 200)
  Ok "返回的是 image/png" ((Img "src=mod&name=sora.png").Type -like "image/png*")

  # ── 这条是重点：原版任务 json 写 .jpg，磁盘上是 .png，必须也能取到 ──
  Ok "json 写 .jpg 磁盘是 .png 也能对上（照抄 SPT 切扩展名的规则）" `
     ((Img "name=/files/quest/icon/5967505886f774590730dadc.jpg").Code -eq 200) "整条引用值"
  Ok "省略 src 时两个目录都会找" ((Img "name=/files/quest/icon/sora.png").Code -eq 200)
  Ok "不存在的名字给 404" ((Img "name=/files/quest/icon/nope.png").Code -eq 404)

  # ── 路径牢笼 ──
  # 只取最后一段是**有意为之**（要认 /files/quest/icon/x.png 这种整条引用值），
  # 所以这里验的不是"带斜杠就拒"，而是"带斜杠也绝对出不了那个目录"。
  MakePng "$modI\..\outside.png" 8 8          # 就在图片目录的上一级，最诱人的目标
  foreach ($bad in @("..%2F..%2F..%2Fwindows%2Fwin.ini", "..%5C..%5Cnope.png",
                     "..%2Foutside.png", "%2E%2E%2Foutside.png")) {
    Ok "出不了图片目录: $bad" ((Img "src=mod&name=$bad").Code -eq 404)
  }
  Ok "带目录的引用值按最后一段解析（原版 json 就是这个形状）" `
     ((Img "src=mod&name=sub%2Fsora.png").Code -eq 200)
  # 非图片扩展名不给读（stem 匹配只在白名单扩展里找，所以 .json 天然取不到）
  New-Item -ItemType File -Force "$modI\secret.json" | Out-Null
  Ok "非图片文件读不到" ((Img "src=mod&name=secret.json").Code -eq 404)

  # ── 令牌 ──
  $noTok = try { (Invoke-WebRequest "$url/qimg?src=mod&name=sora.png" -UseBasicParsing).StatusCode }
           catch { $_.Exception.Response.StatusCode.value__ }
  Ok "不带令牌取图被拒" ($noTok -eq 403) "HTTP $noTok"
  $badTok = try { (Invoke-WebRequest "$url/qimg?src=mod&name=sora.png&t=wrong" -UseBasicParsing).StatusCode }
            catch { $_.Exception.Response.StatusCode.value__ }
  Ok "令牌不对也被拒" ($badTok -eq 403) "HTTP $badTok"

} finally { if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force } }

""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
exit $(if ($fail) { 1 } else { 0 })
