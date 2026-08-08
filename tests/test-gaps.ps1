# 2026-08-08 那一轮"补小口子"的守门测试。每一条都对应一个真出过问题的地方：
#   1. 删掉某文件的最后一个任务 → 以前根本不会写盘，重新载入任务又回来了
#   2. POST /api/dlg 什么后缀都收 → 能写出 notes.txt，也能覆盖插件带的 .dlg.demo
#   3. 文件头里的空行被回写吃掉 → 作者排的版每存一次就扁一点
#   4. --root 指了个不存在的目录会**悄悄**回退到"上次记住的那个"
#   5. "这个模组会替你注册图片"以前是硬比目录名，改名就误报
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp   = $PSScriptRoot
$T    = "$sp\FakeEFT"
$dlg  = "$T\BepInEx\config\VisitAPI"
$db   = "$T\SPT_Runtime\user\mods\VisitAPI-Server\db"
$u8   = [Text.UTF8Encoding]::new($false)
$pass = 0; $fail = 0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($url,$tok,$obj){
  $b=[Text.Encoding]::UTF8.GetBytes(($obj|ConvertTo-Json -Depth 30 -Compress))
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} `
    -ContentType "application/json; charset=utf-8" -Body $b -UseBasicParsing
}
# 400/403 这些在 PowerShell 里是异常，测"该被拒绝"时要接住状态码
function Code($block){ try { (& $block).StatusCode } catch { [int]$_.Exception.Response.StatusCode } }

Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dbsnap" $db -Recurse -Force
# 工作区也从快照重置。**跑完要把它恢复原样**：DlgLinks 是"扫工作区全部 .dlg"，
# 留下半份或者少一份，后面跑的测试就会莫名其妙地少几条挂接。
Get-ChildItem $dlg -Filter "*.dlg" | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $dlg -Filter "*.bak" | Remove-Item -Force -ErrorAction SilentlyContinue
Copy-Item "$sp\dlgsnap\*.dlg" "$dlg\" -Force

# 头里带空行的剧本：空行是作者的分段，回写必须原样留着
$blanks = @"
trader: 90726f6a656374536f726132 "SORA"
start: root

# 分段用的空行在上面一行
first: root

<root> bg: A.png
你好。
- 走了。 -> @close
"@
# 末尾补一个换行：DialogWriter 每行都以 \n 收尾，原文少一个的话比行数会平白差一行
[IO.File]::WriteAllText("$dlg\blanks.dlg", ($blanks -replace "`r`n","`n") + "`n", $u8)

$log = "$sp\gaps.log"
Remove-Item $log -Force -ErrorAction SilentlyContinue
$srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$dlg`"","--quests=`"$db`"" `
        -RedirectStandardOutput $log -PassThru -WindowStyle Hidden
try {
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $t = if (Test-Path $log) { Get-Content $log -Raw } else { $null }
    if ($t) { $m=[regex]::Match($t,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} }
  }
  if (-not $url) { throw "服务没起来" }
  $html = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok  = [regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $H    = @{ "X-Token" = $tok }

  # ── 1 删掉某文件的最后一个任务 ──────────────────────────
  $g = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "任务库读到了" ($g.ok -eq $true) ("$(@($g.files).Count) 个文件")
  $victim = "ragman_courier.json"
  $ids    = @($g.quests.PSObject.Properties.Name | Where-Object { $g.owner.$_ -eq $victim })
  Ok "选中的文件里只有一个任务" ($ids.Count -eq 1) ($ids -join ",")

  # 界面删光那个文件的任务后，会给它送一个空对象过来
  $files = @{}
  foreach ($f in $g.files) { $files[$f] = @{} }
  foreach ($p in $g.quests.PSObject.Properties) {
    $own = $g.owner.($p.Name)
    if ($own -and $own -ne $victim) { $files[$own][$p.Name] = $p.Value }
  }
  $r = Json (Post "$url/api/quests" $tok @{ stamp=$g.stamp; force=$false; files=$files; locales=@{} })
  Ok "保存成功" ($r.ok -eq $true)
  Ok "空掉的文件真被删了" (-not (Test-Path "$db\quests\$victim"))
  Ok "删之前留了 .bak" (Test-Path "$db\quests\$victim.bak")
  Ok "返回的文件表里没有它了" (@($r.files) -notcontains $victim) (@($r.files) -join ",")
  $g2 = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "重新载入也不会诈尸" (@($g2.quests.PSObject.Properties.Name) -notcontains $ids[0])
  Ok "别的文件一个没少" (@($g2.files).Count -eq (@($g.files).Count - 1)) (@($g2.files) -join ",")
  $left = @($g2.quests.PSObject.Properties.Name).Count
  Ok "剩下的任务还在" ($left -eq (@($g.quests.PSObject.Properties.Name).Count - 1)) "$left 个"

  # ── 2 /api/dlg 只许写 .dlg ─────────────────────────────
  $doc = @{ nodes=@(@{ name="X"; npc="hi" }) }
  Ok "写 .txt 被拒" ((Code { Post "$url/api/dlg?path=notes.txt" $tok $doc }) -eq 400)
  Ok "写 .dlg.demo 被拒" ((Code { Post "$url/api/dlg?path=sample.dlg.demo" $tok $doc }) -eq 400)
  Ok "拒了就没落盘" (-not (Test-Path "$dlg\notes.txt"))
  Ok "写 .dlg 照样可以" ((Code { Post "$url/api/dlg?path=ok.dlg" $tok $doc }) -eq 200)
  Ok "写进去了" (Test-Path "$dlg\ok.dlg")

  # ── 3 文件头里的空行 ───────────────────────────────────
  $before = [IO.File]::ReadAllText("$dlg\blanks.dlg",$u8)
  $p = Json (Post "$url/api/quests/link" $tok `
        @{ file="blanks.dlg"; node="root"; opt=0; action="accept"; questId="5043a1ce90726f6a536f7261"; add=$true })
  Ok "挂接成功" ($p.ok -eq $true)
  $after = [IO.File]::ReadAllText("$dlg\blanks.dlg",$u8)
  $nb = { param($s) @($s -split "`n" | Where-Object { -not $_.Trim() }).Count }
  Ok "空行一行不多一行不少" ((& $nb $before) -eq (& $nb $after)) "$(& $nb $before) → $(& $nb $after)"
  Ok "行数没变" (($before -split "`n").Count -eq ($after -split "`n").Count) `
     "$(($before -split "`n").Count) → $(($after -split "`n").Count)"
  Ok "分段那行注释还在原位" ((($after -split "`n")[3]).Trim() -eq "# 分段用的空行在上面一行")

  # ── 4 配图注册的判断 ───────────────────────────────────
  $im = Json (Invoke-WebRequest "$url/api/quests/images" -Headers $H -UseBasicParsing)
  Ok "VisitAPI-Server 认得出会自己注册" ($im.mod.registers -eq $true) "registers=$($im.mod.registers)"
} finally {
  if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force }
}

# ── 5 --root 指到不存在的目录：必须吭声，不许闷声换一个 ──────
$log2 = "$sp\gaps-badroot.log"
Remove-Item $log2 -Force -ErrorAction SilentlyContinue
$srv2 = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$sp\NoSuchFolder`"" `
         -RedirectStandardOutput $log2 -PassThru -WindowStyle Hidden
try {
  foreach ($i in 1..40) { Start-Sleep -Milliseconds 250
    if ((Test-Path $log2) -and (Get-Content $log2 -Raw) -match 'http://127') { break } }
  $out = Get-Content $log2 -Raw
  Ok "说了这个目录不存在" ($out -match '--root 目录不存在')
  Ok "把被忽略的路径也打出来了" ($out -match 'NoSuchFolder')
} finally { if ($srv2 -and -not $srv2.HasExited) { $srv2 | Stop-Process -Force } }

Get-ChildItem $dlg -Filter "*.bak" | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item "$dlg\blanks.dlg","$dlg\ok.dlg" -Force -ErrorAction SilentlyContinue
""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
exit $(if ($fail) { 1 } else { 0 })
