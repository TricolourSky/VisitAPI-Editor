# writer 那一刀的验收：.dlg 现在只有 C# 一个写手。
# 用一份"专门带坑"的剧本（节点体注释 / 旁白 anim / setstatus 状态值 /
# standing 商人 id / 同一选项两条门控 / 手填坐标），走真界面存一遍，逐行比。
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
Get-ChildItem $dlg -Filter "*.bak" | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item "$dlg\_probe.dlg" -Force -ErrorAction SilentlyContinue
$orig = [IO.File]::ReadAllText("$dlg\torture.dlg", $u8)

$test = "$www\_test.html"
try {
  [IO.File]::WriteAllText($test,
    [IO.File]::ReadAllText("$www\index.html",$u8) + [IO.File]::ReadAllText("$sp\probe-writer.js",$u8), $u8)
  dotnet build $proj -v q --nologo | Out-Null

  $srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$dlg`"" `
          -RedirectStandardOutput "$sp\wr.log" -PassThru -WindowStyle Hidden
  try {
    $url=$null
    foreach($i in 1..40){ Start-Sleep -Milliseconds 250
      $log = if(Test-Path "$sp\wr.log"){Get-Content "$sp\wr.log" -Raw}else{$null}
      if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
    if(-not $url){throw "服务没起来"}
    $br = Start-Process $edge -ArgumentList '--headless=new','--disable-gpu','--window-size=1680,1000',
            "$url/ui/_test.html" -PassThru -WindowStyle Hidden
    try { foreach($i in 1..120){ Start-Sleep -Milliseconds 250; if(Test-Path "$dlg\_probe.dlg"){break} } }
    finally { if($br -and -not $br.HasExited){$br|Stop-Process -Force} }
  } finally { if($srv -and -not $srv.HasExited){$srv|Stop-Process -Force} }

  if(-not (Test-Path "$dlg\_probe.dlg")){ "探针没回写结果"; exit 1 }
  $rows = @(([IO.File]::ReadAllText("$dlg\_probe.dlg",$u8) -split "`n") |
            Where-Object { $_ -match '^(PASS|FAIL|EXCEPTION|WINDOW-ERROR)' })
  $rows
  # 文件系统这一侧再查两条，浏览器里查不了
  $bak = Test-Path "$dlg\torture.dlg.bak"
  $rows += $(if($bak){"PASS 覆盖前留了 .bak"}else{"FAIL 覆盖前留了 .bak"})
  $rows[-1]
  # 盘上文件 vs 原文：只比有内容的行（DialogWriter 会重排空行）
  $after = [IO.File]::ReadAllText("$dlg\torture.dlg",$u8)
  $a=@(($orig  -split "`n")|ForEach-Object{$_.TrimEnd()}|Where-Object{$_ -ne ""})
  $b=@(($after -split "`n")|ForEach-Object{$_.TrimEnd()}|Where-Object{$_ -ne ""})
  $same = (($a -join "`n") -eq ($b -join "`n"))
  $rows += $(if($same){"PASS 盘上文件与原文每一行都一致"}else{"FAIL 盘上文件与原文每一行都一致"})
  $rows[-1]
  if(-not $same){
    for($i=0;$i -lt [Math]::Max($a.Count,$b.Count);$i++){
      if($a[$i] -ne $b[$i]){ "   行 $($i+1): 原[$($a[$i])]  新[$($b[$i])]" } }
  }
  $bad = @($rows | Where-Object { $_ -match 'FAIL|EXCEPTION|WINDOW-ERROR' })
  ""
  "合计 $($rows.Count) 项，通过 $($rows.Count-$bad.Count)，失败 $($bad.Count)"
}
finally {
  # 收拾干净，别把 fixture 留给下一个测试（DlgLinks 是"扫全部 .dlg"，留下就会串进别人的结果）
  @("torture.dlg","torture.dlg.bak","_probe.dlg") |
    ForEach-Object { Remove-Item (Join-Path $dlg $_) -Force -ErrorAction SilentlyContinue }
  Remove-Item $test -Force -ErrorAction SilentlyContinue
  dotnet build $proj -v q --nologo | Out-Null
}
