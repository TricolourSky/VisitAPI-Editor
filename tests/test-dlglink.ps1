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

# ── 期望值从快照本身算出来，不写死数字 ──
# 以前"补给挂 5 条"这类数字绑死在快照的形状上，换一版快照就得挨个对表（Memory 第 10 节的小口子）。
# 现在用一套**独立于 C# 解析器**的粗正则从原文数出来：两边数得不一致就说明有一边解析错了，
# 这正是这组断言要抓的东西（拿快照数字自证自话就抓不到了）。
$alias=@{}
foreach($m in [regex]::Matches($orig,'(?m)^quest\s+(\S+)\s*=\s*(\S+)\s*$')){ $alias[$m.Groups[2].Value]=$m.Groups[1].Value }
function CountLinks($id,$actions){
  $names=@($id)+@(if($alias.ContainsKey($id)){$alias[$id]})
  $n=0
  foreach($nm in $names){ foreach($a in $actions){
    $n += ([regex]::Matches($orig,"\b${a}:\s*$([regex]::Escape($nm))\b")).Count } }
  return $n
}

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
  $expSupply = CountLinks $supply @("accept","complete","handover","setstatus")
  Ok "SORA 补给的挂接数和快照对得上" ($sl.Count -eq $expSupply -and $expSupply -ge 1) `
     "$($sl.Count)/$expSupply : $(($sl | ForEach-Object { $_.action+"@"+$_.node }) -join ',')"
  $expRagSet = CountLinks $ragman @("setstatus")
  Ok "Ragman 的 setstatus 数和快照对得上" `
     (@($g.links|Where-Object{$_.questId -eq $ragman -and $_.action -eq "setstatus"}).Count -eq $expRagSet -and $expRagSet -ge 1) "$expRagSet 条"
  $expTrig = ([regex]::Matches($orig,'(?m)^trigger:.*\bif\b')).Count
  Ok "带任务条件的触发点数和快照对得上" (@($g.triggers).Count -eq $expTrig -and $expTrig -ge 1) `
     "$(@($g.triggers).Count)/$expTrig : $(@($g.triggers|ForEach-Object{$_.place+"→"+$_.node}) -join ', ')"
  Ok "触发点带任务和状态" (@($g.triggers|Where-Object{$_.questId -eq $supply -and $_.status -like "*Started*"}).Count -ge 1)
  $nf = @($g.nodes | Where-Object { $_.file -eq $file })[0]
  $expNodes = @(($orig -split '(?m)(?=^<)') | Where-Object { $_ -match '(?m)^<' -and $_ -match '(?m)^- ' }).Count
  Ok "带选项的节点数和快照对得上" (@($nf.nodes).Count -eq $expNodes -and $expNodes -ge 5) "$(@($nf.nodes).Count)/$expNodes"
  Ok "节点表标出已挂的动作" (@($nf.nodes | Where-Object { $_.name -eq "D9" }).opts[0].acts -contains "accept")
  $d9acc = @($g.links|Where-Object{$_.node -eq "D9" -and $_.action -eq "accept"}).Count

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
  $coords = @([regex]::Matches($orig,'\([-\d][^)]*\)') | ForEach-Object { $_.Value } | Sort-Object -Unique)
  Ok "快照里的坐标一组都没被浮点格式化改样子" `
     ($coords.Count -ge 1 -and @($coords | Where-Object { -not $after.Contains($_) }).Count -eq 0) "$($coords.Count) 组"
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
  Ok "raw 若不等必须全由行尾空格解释" (($back -eq $orig) -or ($trail -gt 0)) "快照有 $trail 行末尾带空格"

  # ── 5 只摘自己那条，别人的不动 ────────────────────
  $g2 = Json (Invoke-WebRequest "$url/api/quests/links" -Headers $H -UseBasicParsing)
  Ok "摘完总数回到原样" (@($g2.links).Count -eq @($g.links).Count) "$(@($g2.links).Count) / $(@($g.links).Count)"
  # D9 上挂的是 supply，拿别的任务去摘不该动它
  Post "$url/api/quests/link" $tok @{file=$file;node="D9";opt=0;action="accept";questId=$ragman;add=$false} | Out-Null
  $g3 = Json (Invoke-WebRequest "$url/api/quests/links" -Headers $H -UseBasicParsing)
  Ok "拿别的任务去摘不会误伤" (@($g3.links|Where-Object{$_.node -eq "D9" -and $_.action -eq "accept"}).Count -eq $d9acc) "$d9acc 条"

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
