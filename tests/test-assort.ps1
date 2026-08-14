# 商人货架接口的端到端测试：起真服务、打真接口、量真文件。
# 全程在 FakeEFT 里跑，不碰 $SptHome。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
Ensure-SptData
$sp  = $PSScriptRoot
$T   = "$sp\FakeEFT"
# 放在 user\mods 之外：`SetQuestDb` 会自动建 quests\，落在 mods 下面就会被 ScanQuestRoots
# 当成"一个有任务的模组"，把没显式指定任务库的测试带偏（test-bots 的注释里有完整经过）
$db  = "$T\labs\ShopLab\db"

$pass = 0; $fail = 0
function Ok($name, $cond, $detail) {
  if ($cond) { $script:pass++; "PASS $name" + $(if($detail){" [$detail]"}) }
  else       { $script:fail++; "FAIL $name" + $(if($detail){" [$detail]"}) }
}
function Json($resp) { [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) | ConvertFrom-Json }
function Post($url, $tok, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 40 -Compress))
  Invoke-WebRequest $url -Method Post -Headers @{"X-Token"=$tok} -ContentType "application/json; charset=utf-8" `
    -Body $bytes -UseBasicParsing
}
function Codes($issues) { ($issues | ForEach-Object { $_.code }) -join "," }

Remove-Item $db -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $db | Out-Null
Copy-Item "$sp\modsnap\*" $db -Recurse -Force

Remove-Item "$sp\assort.log" -ErrorAction SilentlyContinue
$srv = Start-Process $Exe -ArgumentList '--no-browser',"--root=`"$T\BepInEx\config\VisitAPI`"","--mods=`"$db`"" `
        -RedirectStandardOutput "$sp\assort.log" -PassThru -WindowStyle Hidden
try {
  $url = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 250
    $log = if (Test-Path "$sp\assort.log") { (Get-Content "$sp\assort.log" -Raw) } else { $null }
    if ($log) { $m = [regex]::Match($log, 'http://127\.0\.0\.1:\d+'); if ($m.Success) { $url = $m.Value; break } }
  }
  if (-not $url) { throw "服务没起来" }
  $html = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/" -UseBasicParsing).RawContentStream.ToArray())
  $tok  = [regex]::Match($html, 'name="tok" content="([^"]+)"').Groups[1].Value
  $H    = @{ "X-Token" = $tok }

  # ── 1 读（单商人写法）──────────────────────────
  $g = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  Ok "认出模组目录" ($g.ok -eq $true) $g.dir
  Ok "1 份货架" (@($g.schemes).Count -eq 1) "$(@($g.schemes).Count) 份"
  Ok "认出是单商人写法" ($g.schemes[0].kind -eq "single") $g.schemes[0].kind
  # 单商人写法唯一能问到"这货架是谁的"的地方就是同目录的 base.json
  Ok "商人 id 从 base.json 读出" ($g.schemes[0].trader -eq "aa0000000000000000000001") $g.schemes[0].trader
  Ok "2 件商品（子件不算）" ($g.schemes[0].count -eq 2) "$($g.schemes[0].count) 件"
  Ok "干净夹具零告警" (@($g.issues).Count -eq 0) (Codes $g.issues)

  # ── 2 容器信息 ──────────────────────────────────
  $t1 = Json (Invoke-WebRequest "$url/api/assort/tpl?id=65702558cfc010a0f5006a25" -Headers $H -UseBasicParsing)
  Ok "认出弹药盒是容器" ($t1.ok -and @($t1.stack).Count -eq 1) "stack=$(@($t1.stack).Count)"
  # ⚠️ 这里**故意用小写** name/max：发出去的就是 camelCase。
  # PowerShell 的属性访问大小写不敏感，写成 .Max 一样能过 —— 那就成了假绿，
  # 而前端 JS 是**大小写敏感**的，`slot.Max` 会静默变成 undefined。真栽过一次（见 assort.js 注释）。
  Ok "容量取自模板" ($t1.stack[0].max -eq 20) "$($t1.stack[0].max)"
  Ok "槽位名取自模板" ($t1.stack[0].name -eq "cartridges") $t1.stack[0].name
  $raw1 = [Text.Encoding]::UTF8.GetString((Invoke-WebRequest "$url/api/assort/tpl?id=65702558cfc010a0f5006a25" -Headers $H -UseBasicParsing).RawContentStream.ToArray())
  Ok "字段名确实是 camelCase" (($raw1 -cmatch '"name"') -and ($raw1 -cmatch '"max"') -and -not ($raw1 -cmatch '"Max"')) `
     ($raw1.Substring(0, [Math]::Min(90, $raw1.Length)))
  Ok "白名单取自模板" (@($t1.stack[0].filter) -contains "58dd3ad986f77403051cba8f")
  $t2 = Json (Invoke-WebRequest "$url/api/assort/tpl?id=60098ad7c2240c0fe85c570a" -Headers $H -UseBasicParsing)
  Ok "医疗包不是堆叠容器" (@($t2.stack).Count -eq 0)

  # ── 3 无令牌 ────────────────────────────────────
  $code = 0
  try { Invoke-WebRequest "$url/api/assort" -UseBasicParsing | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "无令牌被挡" ($code -eq 403) "HTTP $code"

  # ── 4 写：改价格 ────────────────────────────────
  $f = $g.files.'assort.json'
  $f.barter_scheme.'bb00000000000000000000a1'[0][0].count = 222222
  $p = Json (Post "$url/api/assort" $tok @{ stamp=$g.stamp; force=$false; files=@{ "assort.json"=$f } })
  Ok "保存成功" ($p.ok -eq $true)
  $after = Get-Content "$db\assort.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  Ok "价格落盘了" ($after.barter_scheme.'bb00000000000000000000a1'[0][0].count -eq 222222)
  Ok "子件没被写掉" (@($after.items | Where-Object slotId -eq 'cartridges').Count -eq 1)
  Ok "覆盖前留了 .bak" (Test-Path "$db\assort.json.bak")

  # ── 5 乐观锁 / 越界 ─────────────────────────────
  $code = 0
  try { Post "$url/api/assort" $tok @{ stamp=$g.stamp; force=$false; files=@{ "assort.json"=$f } } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "旧指纹被拦（乐观锁）" ($code -eq 409) "HTTP $code"
  $g2 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  $code = 0
  try { Post "$url/api/assort" $tok @{ stamp=$g2.stamp; force=$true; files=@{ "..\..\evil.json"=@{} } } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "路径越界被拒" ($code -eq 400) "HTTP $code"
  Ok "没写出越界文件" (-not (Test-Path "$T\SPT_Runtime\user\mods\evil.json"))
  # 只认两种落点：根下的 assort.json，或 CustomAssortSchemes 里的 json
  $code = 0
  try { Post "$url/api/assort" $tok @{ stamp=$g2.stamp; force=$true; files=@{ "notes.txt"=@{} } } | Out-Null }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  Ok "非 json 被拒" ($code -eq 400) "HTTP $code"

  # ── 6 校验：空容器（这一页存在的理由）──────────
  $g3 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  $f3 = $g3.files.'assort.json'
  $f3.items = @($f3.items | Where-Object { $_.slotId -ne 'cartridges' })
  $p3 = Json (Post "$url/api/assort" $tok @{ stamp=$g3.stamp; force=$false; files=@{ "assort.json"=$f3 } })
  $eb = @($p3.issues | Where-Object code -eq 'as_empty_container')
  Ok "只写盒子不写弹 → as_empty_container" ($eb.Count -eq 1) (Codes $p3.issues)
  Ok "提示里点名了槽位和容量" (($eb[0].args -contains "cartridges") -and ($eb[0].args -contains "20")) `
     ($eb[0].args -join "|")

  # ── 7 校验：三张表对不齐 ────────────────────────
  $g4 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  $f4 = $g4.files.'assort.json'
  $f4.barter_scheme.PSObject.Properties.Remove('bb00000000000000000000a3')
  $f4.loyal_level_items.PSObject.Properties.Remove('bb00000000000000000000a1')
  $p4 = Json (Post "$url/api/assort" $tok @{ stamp=$g4.stamp; force=$false; files=@{ "assort.json"=$f4 } })
  Ok "缺价格报 as_no_price" (@($p4.issues | Where-Object code -eq 'as_no_price').Count -eq 1) (Codes $p4.issues)
  Ok "缺等级报 as_no_loyalty" (@($p4.issues | Where-Object code -eq 'as_no_loyalty').Count -eq 1)

  # ── 8 校验：孤儿 / 坏 tpl / 超容量 / 错槽位 ─────
  $g5 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  $f5 = $g5.files.'assort.json'
  $f5.loyal_level_items | Add-Member -NotePropertyName "cc00000000000000000000ff" -NotePropertyValue 1 -Force
  ($f5.items | Where-Object _id -eq 'bb00000000000000000000a3').PSObject.Properties['_tpl'].Value = "ffffffffffffffffffffffff"
  $p5 = Json (Post "$url/api/assort" $tok @{ stamp=$g5.stamp; force=$false; files=@{ "assort.json"=$f5 } })
  Ok "孤儿 id 报 as_orphan" (@($p5.issues | Where-Object code -eq 'as_orphan').Count -eq 1) (Codes $p5.issues)
  # 原版自己就带着这种残留（6 个原版商人 2331 件里有 15 条），所以只能是 warn 不能是 err
  Ok "as_orphan 只是 warn" ((@($p5.issues | Where-Object code -eq 'as_orphan')[0].level) -eq "warn")
  Ok "不存在的 tpl 报 as_bad_tpl" (@($p5.issues | Where-Object code -eq 'as_bad_tpl').Count -eq 1)

  $g6 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  $f6 = $g6.files.'assort.json'
  # 把子件塞回去，但数量超容量 + 槽位名写错
  $f6.items += [pscustomobject]@{ _id="bb00000000000000000000b1"; _tpl="58dd3ad986f77403051cba8f";
      parentId="bb00000000000000000000a1"; slotId="cartridges"; location=0;
      upd=[pscustomobject]@{ StackObjectsCount=99 } }
  $f6.items += [pscustomobject]@{ _id="bb00000000000000000000b2"; _tpl="58dd3ad986f77403051cba8f";
      parentId="bb00000000000000000000a1"; slotId="mod_stock" }
  $p6 = Json (Post "$url/api/assort" $tok @{ stamp=$g6.stamp; force=$false; files=@{ "assort.json"=$f6 } })
  Ok "超容量报 as_over_capacity" (@($p6.issues | Where-Object code -eq 'as_over_capacity').Count -eq 1) (Codes $p6.issues)
  Ok "错槽位报 as_bad_child_slot" (@($p6.issues | Where-Object code -eq 'as_bad_child_slot').Count -eq 1)
  Ok "校验只给码不给人话" (($p6.issues[0].PSObject.Properties.Name -contains "code") -and
                            -not ($p6.issues[0].PSObject.Properties.Name -contains "message"))

  # ── 9 WTT 那种"一份文件多个商人"的写法 ──────────
  New-Item -ItemType Directory -Force "$db\CustomAssortSchemes" | Out-Null
  $wtt = @{ "5ac3b934156ae10c4430e83c" = @{ items=@(); barter_scheme=@{}; loyal_level_items=@{} }
            "54cb50c76803fa8b248b4571" = @{ items=@(); barter_scheme=@{}; loyal_level_items=@{} } }
  [System.IO.File]::WriteAllText("$db\CustomAssortSchemes\two.json",
    ($wtt | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
  $g7 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  Ok "WTT 写法也认" (@($g7.schemes | Where-Object kind -eq 'wtt').Count -eq 2) `
     "$(@($g7.schemes).Count) 份"
  Ok "一份文件里的两个商人各算一条" (@($g7.schemes | Where-Object { $_.file -like "*two.json" }).Count -eq 2)
  Remove-Item "$db\CustomAssortSchemes" -Recurse -Force

  # ── 10 拿原版货架验校验规则本身 ─────────────────
  # 规则写太严的话，导入原版数据会刷一片红。这条是"验校验规则"的守门人。
  $prapor = "$T\SPT_Runtime\SPT_Data\database\traders\54cb50c76803fa8b248b4571\assort.json"
  Copy-Item $prapor "$db\assort.json" -Force
  $g8 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  $errs = @($g8.issues | Where-Object level -eq 'err')
  Ok "原版货架零错误" ($errs.Count -eq 0) "err=$($errs.Count) / 共 $(@($g8.issues).Count) 条：$(Codes $errs)"
  Ok "原版货架商品数正常" ($g8.schemes[0].count -gt 300) "$($g8.schemes[0].count) 件"

  # ── 11 坏文件要报出来 ───────────────────────────
  Set-Content "$db\assort.json" "{ 这不是 JSON " -Encoding UTF8
  $g9 = Json (Invoke-WebRequest "$url/api/assort" -Headers $H -UseBasicParsing)
  Ok "坏文件被报出来" (@($g9.issues | Where-Object code -eq 'broken_file').Count -eq 1)

  # ── 12 商人头像 /avimg ──────────────────────────
  # 两个来源：作者自己那张（base.json 的 avatar 指的图，真图在模组 res\ 里）
  # 和 SPT 自带的（文件名就是商人 id）。两张夹具**大小不同**，才分得清取到的是哪一张。
  function Code($u) { try { Invoke-WebRequest $u -UseBasicParsing | Out-Null; return 200 }
                      catch { return [int]$_.Exception.Response.StatusCode } }
  $mine = "$T\labs\ShopLab\res\LAB.png"
  New-Item -ItemType Directory -Force (Split-Path $mine) | Out-Null
  [IO.File]::WriteAllBytes($mine, [Convert]::FromBase64String(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
  $avdir = "$T\SPT_Runtime\SPT_Data\images\trader\avatar"
  New-Item -ItemType Directory -Force $avdir | Out-Null
  # 随便造一张比上面那张长的，长度不同就能认出取的是哪一张
  [IO.File]::WriteAllBytes("$avdir\54cb50c76803fa8b248b4571.png",
    ([Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==") + [byte[]](0..63)))
  $mineLen = (Get-Item $mine).Length
  $sptLen  = (Get-Item "$avdir\54cb50c76803fa8b248b4571.png").Length

  $r1 = Invoke-WebRequest "$url/avimg?id=aa0000000000000000000001&t=$tok" -UseBasicParsing
  Ok "作者自己的头像取得到" ($r1.StatusCode -eq 200 -and $r1.RawContentStream.Length -eq $mineLen) `
     "HTTP $($r1.StatusCode) $($r1.RawContentStream.Length) 字节"
  Ok "头像是 png" ($r1.Headers["Content-Type"] -eq "image/png") $r1.Headers["Content-Type"]

  $r2 = Invoke-WebRequest "$url/avimg?id=54cb50c76803fa8b248b4571&t=$tok" -UseBasicParsing
  # 关键：**别人的商人 id 不能被顶成模组自己那张图**（WTT 一份文件多个商人时会撞）
  Ok "原版商人取的是 SPT 自带那张" ($r2.RawContentStream.Length -eq $sptLen -and $sptLen -ne $mineLen) `
     "$($r2.RawContentStream.Length) 字节 / 自制 $mineLen"

  Ok "没有头像的商人 404" ((Code "$url/avimg?id=ffffffffffffffffffffffff&t=$tok") -eq 404)
  Ok "无令牌被挡" ((Code "$url/avimg?id=aa0000000000000000000001") -eq 403)
  Ok "错令牌被挡" ((Code "$url/avimg?id=aa0000000000000000000001&t=nope") -eq 403)
  # id 是拿去拼文件名的，目录穿越必须在服务端就死掉
  Ok "目录穿越被拒" ((Code "$url/avimg?id=..%2F..%2Fbase&t=$tok") -eq 404)
  Ok "带斜杠的 id 被拒" ((Code "$url/avimg?id=a%2Fb&t=$tok") -eq 404)
}
finally {
  if ($srv -and -not $srv.HasExited) { $srv | Stop-Process -Force }
  Remove-Item "$T\labs" -Recurse -Force -ErrorAction SilentlyContinue
  # 头像夹具。只删自己建的 images\trader，**别碰 images\quest（仓库里的夹具）
  # 更别碰 database（那是指向真 SPT 的联接）**
  Remove-Item "$T\SPT_Runtime\SPT_Data\images\trader" -Recurse -Force -ErrorAction SilentlyContinue
}
""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
