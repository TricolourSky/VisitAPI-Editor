# 场景：一台**完全没装 VisitAPI** 的机器（没有 BepInEx\config\VisitAPI、没有 VisitAPI-Server）。
# 任务编辑必须照样能用，而且任务能存到作者自己指定的目录。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
$sp  = $PSScriptRoot
$exe = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"
$u8  = [Text.UTF8Encoding]::new($false)
$pass=0; $fail=0
function Ok($n,$c,$d){ if($c){$script:pass++;"PASS $n"+$(if($d){" [$d]"})} else {$script:fail++;"FAIL $n"+$(if($d){" [$d]"})} }
function Json($r){ [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($u,$tok,$o){ $b=[Text.Encoding]::UTF8.GetBytes(($o|ConvertTo-Json -Depth 30 -Compress))
  Invoke-WebRequest $u -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" -Body $b -UseBasicParsing }

# ── 搭一台"裸机"：有 SPT，但没有 VisitAPI 的任何痕迹 ──
$B = "$sp\BareEFT"
if (Test-Path $B) { Remove-Item -LiteralPath $B -Recurse -Force }
New-Item -ItemType Directory -Force "$B\SPT_Runtime\user\mods\SomeOtherMod\db\quests" | Out-Null
New-Item -ItemType Directory -Force "$B\SPT_Runtime\user\mods\NoDbMod" | Out-Null
New-Item -ItemType Directory -Force "$B\SPT_Runtime\SPT_Data" | Out-Null
New-Item -ItemType Junction -Path "$B\SPT_Runtime\SPT_Data\database" -Target "$SptHome\SPT_Runtime\SPT_Data\database" | Out-Null
# exe 放在游戏目录里，但**没有** BepInEx\config\VisitAPI
$app = "$B\editor"
New-Item -ItemType Directory -Force $app | Out-Null
Get-ChildItem (Split-Path $exe) -File | Where-Object { $_.Extension -in ".exe",".dll",".json" } |
  Copy-Item -Destination "$app\" -Force
Remove-Item -LiteralPath "$app\visitapi-editor.txt" -Force -ErrorAction SilentlyContinue

$srv = Start-Process "$app\VisitAPI.Editor.exe" -ArgumentList '--no-browser' `
        -RedirectStandardOutput "$sp\bare.log" -PassThru -WindowStyle Hidden
try {
  $url=$null
  foreach($i in 1..40){ Start-Sleep -Milliseconds 250
    $log = if(Test-Path "$sp\bare.log"){Get-Content "$sp\bare.log" -Raw}else{$null}
    if($log){ $m=[regex]::Match($log,'http://127\.0\.0\.1:\d+'); if($m.Success){$url=$m.Value;break} } }
  if(-not $url){throw "服务没起来"}
  $html=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok=[regex]::Match($html,'name="tok" content="([^"]+)"').Groups[1].Value
  $H=@{"X-Token"=$tok}

  Ok "没装 VisitAPI 也能起来" ($url -ne $null) $url
  $w = Json (Invoke-WebRequest "$url/api/workspace" -Headers $H -UseBasicParsing)
  Ok "没有 .dlg 工作区（本来就没装）" ($w.ok -eq $false)

  $r = Json (Invoke-WebRequest "$url/api/quests/roots" -Headers $H -UseBasicParsing)
  Ok "照样认出了 EFT 根" ($r.eft -eq (Resolve-Path $B).Path) $r.eft
  Ok "扫出了别的 mod 的 db" (@($r.found | Where-Object { $_.mod -eq "SomeOtherMod" }).Count -eq 1) `
     (@($r.found | ForEach-Object { $_.mod }) -join ",")
  Ok "没有 db 的 mod 不列出来" (@($r.found | Where-Object { $_.mod -eq "NoDbMod" }).Count -eq 0)
  Ok "启动时自动挑了有 quests 的那个" ($r.current -like "*SomeOtherMod*") $r.current
  Ok "物品/地图表照样能读（只依赖 SPT_Data）" (Json (Invoke-WebRequest "$url/api/quests/items" -Headers $H -UseBasicParsing)).ok

  # ── 换到一个全新的、还不存在的目录 ──
  $mine = "$B\SPT_Runtime\user\mods\MyQuests\db"
  $p = Json (Post "$url/api/quests/root" $tok @{ path = $mine })
  Ok "能指到一个还不存在的目录" ($p.ok -eq $true) $p.dir
  Ok "quests / locales 自动建出来了" ((Test-Path "$mine\quests") -and (Test-Path "$mine\locales"))

  $g = Json (Invoke-WebRequest "$url/api/quests" -Headers $H -UseBasicParsing)
  Ok "空库也能正常打开（不是报错）" ($g.ok -eq $true) "任务 $(@($g.quests.PSObject.Properties).Count) 个"

  # ── 在裸机上从零建一个任务并存盘 ──
  $qid = "aabbccddeeff001122334455"
  $quest = @{ _id=$qid; QuestName="裸机任务"; traderId="54cb50c76803fa8b248b4571"; location="any";
    type="Completion"; side="Pmc"; image=""; restartable=$false; canShowNotificationsInGame=$true; status=0;
    name="$qid name"; description="$qid description"; successMessageText="$qid successMessageText";
    conditions=@{ AvailableForStart=@(); Fail=@();
      AvailableForFinish=@(@{ conditionType="Level"; id="1122334455aabbccddeeff00"; compareMethod=">="; value=5 }) };
    rewards=@{ Started=@(); Fail=@();
      Success=@(@{ id="99887766554433221100aabb"; index=0; type="Experience"; value="1000" }) } }
  $loc = @{ ch=@{ "$qid name"="裸机任务"; "$qid description"="没装 VisitAPI 也能做"; "$qid successMessageText"="干得漂亮。" };
            en=@{ "$qid name"="Bare quest"; "$qid description"="Made without VisitAPI"; "$qid successMessageText"="Nice work." } }
  $s = Json (Post "$url/api/quests" $tok @{ stamp=$g.stamp; force=$false;
                files=@{ "my_first.json"=@{ $qid = $quest } }; locales=$loc })
  Ok "存盘成功" ($s.ok -eq $true)
  Ok "任务文件真的落到我指定的目录" (Test-Path "$mine\quests\my_first.json")
  Ok "文案文件也落了" ((Test-Path "$mine\locales\ch.json") -and (Test-Path "$mine\locales\en.json"))
  Ok "校验零问题" (@($s.issues).Count -eq 0) (@($s.issues | ForEach-Object { $_.code }) -join ",")
  $back = Get-Content "$mine\quests\my_first.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "读回来还是那个任务" ($back.$qid.QuestName -eq "裸机任务") $back.$qid.QuestName
  $chj = Get-Content "$mine\locales\ch.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "中文文案没被转义" ($chj."$qid successMessageText" -eq "干得漂亮。") $chj."$qid successMessageText"

  # ── 记忆：重启后还认得这个目录 ──
  $srv | Stop-Process -Force; Start-Sleep -Milliseconds 800
  Ok "选择被记住了" ((Get-Content "$app\visitapi-editor.txt" -Raw) -like "*MyQuests*") `
     ((Get-Content "$app\visitapi-editor.txt" -Raw).Trim() -replace "`r?`n"," | ")
  $srv = Start-Process "$app\VisitAPI.Editor.exe" -ArgumentList '--no-browser' `
          -RedirectStandardOutput "$sp\bare2.log" -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 2200
  $url2=[regex]::Match((Get-Content "$sp\bare2.log" -Raw),'http://127\.0\.0\.1:\d+').Value
  $h2=[Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url2/" -UseBasicParsing).RawContentStream.ToArray())
  $t2=[regex]::Match($h2,'name="tok" content="([^"]+)"').Groups[1].Value
  $g2 = Json (Invoke-WebRequest "$url2/api/quests" -Headers @{"X-Token"=$t2} -UseBasicParsing)
  Ok "重启后直接回到那个目录" ($g2.dir -like "*MyQuests*") $g2.dir
  Ok "重启后任务还在" (@($g2.quests.PSObject.Properties).Count -eq 1)
}
finally { if($srv -and -not $srv.HasExited){ $srv|Stop-Process -Force } }
""
"合计 $($pass+$fail) 项，通过 $pass，失败 $fail"
