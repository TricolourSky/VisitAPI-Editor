# 「工程」接口的端到端测试：存 .vaproj / 打开切三根 / 原子性（缺一条整个不动）/ 最近列表。
# 全程在 FakeEFT 的 labs 里跑；exe 旁的 visitapi-editor.txt 先留底、跑完原样放回。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"; $dlg = "$T\BepInEx\config\VisitAPI"
$lab = "$T\labs\ProjLab"
$u8  = [Text.UTF8Encoding]::new($false)
$cfg  = Join-Path (Split-Path $Exe -Parent) "visitapi-editor.txt"
$cfg0 = if (Test-Path $cfg) { [IO.File]::ReadAllBytes($cfg) } else { $null }

$pass = 0; $fail = 0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($url,$tok,$obj){
  $b=[Text.Encoding]::UTF8.GetBytes(($obj|ConvertTo-Json -Depth 5 -Compress))
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} `
    -ContentType "application/json; charset=utf-8" -Body $b -UseBasicParsing
}
function PostCode($url,$tok,$obj){ try{ (Post $url $tok $obj).StatusCode }catch{ $_.Exception.Response.StatusCode.value__ } }

# ── 铺第二套三根（工程要切过去的目标）────────────
Remove-Item $lab -Recurse -Force -ErrorAction SilentlyContinue
foreach ($d in "dlg2","q2\quests","q2\locales","m2\CustomBotLoadouts") {
  New-Item -ItemType Directory -Force "$lab\$d" | Out-Null
}

Remove-Item "$sp\proj.log" -ErrorAction SilentlyContinue
$srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$dlg`"","--quests=`"$T\SPT_Runtime\user\mods\VisitAPI-Server\db`"","--mods=`"$lab\m2`"" `
        -RedirectStandardOutput "$sp\proj.log" -PassThru -WindowStyle Hidden
try {
  $url=$null
  foreach($i in 1..40){ Start-Sleep -Milliseconds 250
    $log = if(Test-Path "$sp\proj.log"){Get-Content "$sp\proj.log" -Raw}else{$null}
    if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
  if(-not $url){throw "服务没起来"}
  $html=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok=[regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $H=@{"X-Token"=$tok}

  # ── 1 存 ──────────────────────────────────────
  $p1 = "$lab\demo.vaproj"
  $s = Json (Post "$url/api/project/save" $tok @{ path=$p1; name="演示工程" })
  Ok "存成工程" ($s.ok -and (Test-Path $p1)) $s.path
  $txt = [IO.File]::ReadAllText($p1,$u8)
  Ok "四行键值齐了" (($txt -match '(?m)^name=演示工程\r?$') -and ($txt -match '(?m)^root=') -and
                     ($txt -match '(?m)^quests=') -and ($txt -match '(?m)^mods='))
  $null = Post "$url/api/project/save" $tok @{ path=$p1; name="演示工程" }
  Ok "覆盖前留了 .bak" (Test-Path "$p1.bak")
  Ok "坏后缀被拒" ((PostCode "$url/api/project/save" $tok @{ path="$lab\x.txt" }) -eq 400)

  $g = Json (Invoke-WebRequest "$url/api/project" -Headers $H -UseBasicParsing)
  Ok "最近列表第一条是它" ($g.recent[0].path -eq $p1 -and $g.recent[0].name -eq "演示工程" -and $g.recent[0].ok)
  $raw = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/api/project" -Headers $H -UseBasicParsing).RawContentStream.ToArray())
  Ok "字段名是小写的" ($raw -match '"current"' -and $raw -match '"recent"' -and $raw -match '"quests"')

  # ── 2 打开：切到第二套三根 ─────────────────────
  $p2 = "$lab\second.vaproj"
  [IO.File]::WriteAllLines($p2, @("name=二号","root=$lab\dlg2","quests=$lab\q2","mods=$lab\m2"), $u8)
  $o = Json (Post "$url/api/project/open" $tok @{ path=$p2 })
  Ok "打开成功且报了名字" ($o.ok -and $o.name -eq "二号")
  $g2 = Json (Invoke-WebRequest "$url/api/project" -Headers $H -UseBasicParsing)
  Ok "三根真的切过去了" ($g2.current.root -like "*dlg2" -and $g2.current.quests -like "*q2" -and $g2.current.mods -like "*m2") `
     "$($g2.current.root) | $($g2.current.quests)"
  Ok "最近列表置顶换成它" ($g2.recent[0].path -eq $p2)
  $w = Json (Invoke-WebRequest "$url/api/workspace" -Headers $H -UseBasicParsing)
  Ok "工作区接口看到的也是新根" ($w.root -like "*dlg2")

  # ── 3 原子性：缺一条整个不动 ────────────────────
  $p3 = "$lab\broken.vaproj"
  [IO.File]::WriteAllLines($p3, @("name=烂档","root=$lab\dlg2","quests=$lab\不存在的目录","mods=$lab\m2"), $u8)
  Ok "缺目录 400" ((PostCode "$url/api/project/open" $tok @{ path=$p3 }) -eq 400)
  $g3 = Json (Invoke-WebRequest "$url/api/project" -Headers $H -UseBasicParsing)
  Ok "三根一根都没被动" ($g3.current.root -eq $g2.current.root -and $g3.current.quests -eq $g2.current.quests -and
                         $g3.current.mods -eq $g2.current.mods)
  Ok "不存在的工程 404" ((PostCode "$url/api/project/open" $tok @{ path="$lab\ghost.vaproj" }) -eq 404)
  Ok "打开也拒坏后缀" ((PostCode "$url/api/project/open" $tok @{ path="$lab\x.txt" }) -eq 400)

  # ── 4 去重置顶 ──────────────────────────────────
  $null = Post "$url/api/project/open" $tok @{ path=$p2 }
  $g4 = Json (Invoke-WebRequest "$url/api/project" -Headers $H -UseBasicParsing)
  Ok "重复打开不重复记账" (@($g4.recent | Where-Object path -eq $p2).Count -eq 1 -and $g4.recent[0].path -eq $p2) `
     (($g4.recent.path) -join " ; ")

  ""
  "合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
  if ($fail -gt 0) { exit 1 }
}
finally {
  if($srv -and -not $srv.HasExited){ $srv|Stop-Process -Force }
  Start-Sleep -Milliseconds 400
  Remove-Item $lab -Recurse -Force -ErrorAction SilentlyContinue
  if ($cfg0) { [IO.File]::WriteAllBytes($cfg, $cfg0) } else { Remove-Item $cfg -Force -ErrorAction SilentlyContinue }
}
