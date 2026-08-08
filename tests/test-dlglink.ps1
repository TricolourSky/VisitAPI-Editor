# 对话挂接的读写测试。
# 最关键的一条：改一条挂接是"整份重写 .dlg"，所以必须证明**除了那一行，别的一个字都没动**。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$T    = "$sp\FakeEFT"
$dlg  = "$T\BepInEx\config\VisitAPI"
$exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$u8   = [Text.UTF8Encoding]::new($false)
$pass = 0; $fail = 0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($url,$tok,$obj){
  $b=[Text.Encoding]::UTF8.GetBytes(($obj|ConvertTo-Json -Depth 20 -Compress))
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} `
    -ContentType "application/json; charset=utf-8" -Body $b -UseBasicParsing
}

# 从真 .dlg 重置。DlgLinks 是"扫工作区全部 .dlg"，所以别的测试留下的文件必须先清掉，
# 否则它们的节点会串进挂接结果里（踩过一次：torture.dlg 让触发点从 4 条变成 5 条）
Get-ChildItem $dlg -Filter "*.dlg" | Remove-Item -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dlgsnap\*.dlg" "$dlg\" -Force        # 用仓库里的快照，不碰真 SPT
Get-ChildItem $dlg -Filter "*.bak" | Remove-Item -Force -ErrorAction SilentlyContinue
$file = "90726f6a656374536f726132.dlg"
$orig = [IO.File]::ReadAllText("$dlg\$file",$u8)

$srv = Start-Process $exe -ArgumentList '--no-browser',"--root=`"$dlg`"" `
        -RedirectStandardOutput "$sp\lnk.log" -PassThru -WindowStyle Hidden
try {
  $url=$null
  foreach($i in 1..40){ Start-Sleep -Milliseconds 250
    $log = if(Test-Path "$sp\lnk.log"){Get-Content "$sp\lnk.log" -Raw}else{$null}
    if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
  if(-not $url){throw "服务没起来"}
  $html=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok=[regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $H=@{"X-Token"=$tok}

  # ── 1 读 ──────────────────────────────────────
  $g = Json (Invoke-WebRequest "$url/api/quests/links" -Headers $H -UseBasicParsing)
  Ok "读到挂接" ($g.ok -eq $true)
  Ok "解析没坏文件" (@($g.broken.PSObject.Properties).Count -eq 0)
  $supply="5043a1ce90726f6a536f7286"; $ragman="72616d736f72617175657301"
  $sl = @($g.links | Where-Object { $_.questId -eq $supply })
  Ok "SORA 补给挂 5 条" ($sl.Count -eq 5) (($sl | ForEach-Object { $_.action+"@"+$_.node }) -join ",")
  Ok "Ragman 任务挂 2 条 setstatus" (@($g.links|Where-Object{$_.questId -eq $ragman -and $_.action -eq "setstatus"}).Count -eq 2)
  Ok "触发点读到 4 条（带任务条件的）" (@($g.triggers).Count -eq 4) (@($g.triggers|ForEach-Object{$_.place+"→"+$_.node}) -join ", ")
  Ok "触发点带任务和状态" (@($g.triggers|Where-Object{$_.questId -eq $supply -and $_.status -like "*Started*"}).Count -eq 1)
  Ok "节点表给了选项" (@($g.nodes[0].nodes).Count -ge 20) (@($g.nodes[0].nodes).Count)
  Ok "节点表标出已挂的动作" (@($g.nodes[0].nodes | Where-Object { $_.name -eq "D9" }).opts[0].acts -contains "accept")

  # ── 2 挂一条新的 ───────────────────────────────
  $p = Json (Post "$url/api/quests/link" $tok @{file=$file;node="C5";opt=0;action="accept";questId=$supply;add=$true})
  Ok "挂上了" (@($p.links|Where-Object{$_.questId -eq $supply -and $_.node -eq "C5"}).Count -eq 1)
  $after = [IO.File]::ReadAllText("$dlg\$file",$u8)

  # ── 3 圆整：只有那一行变了 ───────────────────────
  $a=$orig -split "`n"; $b=$after -split "`n"
  Ok "行数没变" ($a.Count -eq $b.Count) "$($a.Count) → $($b.Count)"
  $diff=@(); for($i=0;$i -lt [Math]::Min($a.Count,$b.Count);$i++){ if($a[$i].TrimEnd() -ne $b[$i].TrimEnd()){ $diff += "$($i+1): $($a[$i].Trim())  ==>  $($b[$i].Trim())" } }
  Ok "只有一行变了" ($diff.Count -eq 1) ($diff -join " ;; ")
  Ok "变的正是那条选项" ($diff.Count -eq 1 -and $diff[0] -match "accept: ") ($diff -join "")
  Ok "注释一条不少" ((@($a|Where-Object{$_.TrimStart().StartsWith("#")}).Count) -eq (@($b|Where-Object{$_.TrimStart().StartsWith("#")}).Count)) `
     "$(@($a|Where-Object{$_.TrimStart().StartsWith('#')}).Count) 条"
  Ok "手填坐标没被浮点格式化改样子" ($after.Contains("(143.7, 18.45, -14.26)") -and $after.Contains("(0.09, 1.48, 2.71)"))
  Ok "覆盖前留了 .bak" (Test-Path "$dlg\$file.bak")

  # ── 4 摘掉：应当回到原样 ──────────────────────────
  # 逐行比、且比之前先 TrimEnd：DialogWriter 会把行尾多余空格去掉，这是它写在文档里的已知行为
  # （SORA 这份原文就有 2 行末尾带空格）。除此之外必须一个字都不差。
  function SameLines($x,$y){
    $p=($x -split "`n"|ForEach-Object{$_.TrimEnd()}); $q=($y -split "`n"|ForEach-Object{$_.TrimEnd()})
    return (($p -join "`n").TrimEnd() -eq ($q -join "`n").TrimEnd())
  }
  Post "$url/api/quests/link" $tok @{file=$file;node="C5";opt=0;action="accept";questId=$supply;add=$false} | Out-Null
  $back=[IO.File]::ReadAllText("$dlg\$file",$u8)
  Ok "摘掉后回到原文（忽略行尾空格）" (SameLines $back $orig)
  $trail=@(($orig -split "`n")|Where-Object{$_.Length -ne $_.TrimEnd().Length}).Count
  Ok "只差在行尾空格上，条数与原文吻合" ($trail -eq 2) "原文有 $trail 行末尾带空格"

  # ── 5 只摘自己那条，别人的不动 ────────────────────
  $g2 = Json (Invoke-WebRequest "$url/api/quests/links" -Headers $H -UseBasicParsing)
  Ok "摘完总数回到原样" (@($g2.links).Count -eq @($g.links).Count) "$(@($g2.links).Count) / $(@($g.links).Count)"
  # D9 上挂的是 supply，拿别的任务去摘不该动它
  Post "$url/api/quests/link" $tok @{file=$file;node="D9";opt=0;action="accept";questId=$ragman;add=$false} | Out-Null
  $g3 = Json (Invoke-WebRequest "$url/api/quests/links" -Headers $H -UseBasicParsing)
  Ok "拿别的任务去摘不会误伤" (@($g3.links|Where-Object{$_.node -eq "D9" -and $_.action -eq "accept"}).Count -eq 2)

  # ── 6 越界与坏参数 ─────────────────────────────
  foreach($bad in @(
    @{n="路径越界"; o=@{file="..\evil.dlg";node="C5";opt=0;action="accept";questId=$supply;add=$true}},
    @{n="不存在的节点"; o=@{file=$file;node="不存在";opt=0;action="accept";questId=$supply;add=$true}},
    @{n="越界的选项号"; o=@{file=$file;node="C5";opt=99;action="accept";questId=$supply;add=$true}},
    @{n="不认识的动作"; o=@{file=$file;node="C5";opt=0;action="drop";questId=$supply;add=$true}})){
    $code=0
    try{ Post "$url/api/quests/link" $tok $bad.o | Out-Null }catch{ $code=[int]$_.Exception.Response.StatusCode }
    Ok "$($bad.n) 被拒" ($code -eq 400) "HTTP $code"
  }
  Ok "被拒之后文件没被动" (SameLines ([IO.File]::ReadAllText("$dlg\$file",$u8)) $orig)
}
finally { if($srv -and -not $srv.HasExited){ $srv|Stop-Process -Force } }
""
"合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
