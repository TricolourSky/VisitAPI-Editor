# 中英表的守门人：C# 能吐出来的每一个码，两张表里都必须有一份人话。
# 这种东西最容易腐烂 —— 加个校验规则忘了加翻译，界面上就直接显示 "qe_xxx"。
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"
$src  = "$Root\src"
$pass = 0; $fail = 0
function Ok($n, $c, $d) { if ($c) { $script:pass++; "PASS $n" + $(if($d){" [$d]"}) }
                          else    { $script:fail++; "FAIL $n" + $(if($d){" [$d]"}) } }

$cs = [IO.File]::ReadAllText("$src\VisitAPI.Quests\QuestValidator.cs")
# 三种写法都要认：Err("x") / Warn("x") / new Issue(级别, 任务id, "x", ...)
$codes = @()
$codes += [regex]::Matches($cs, '(?:Err|Warn)\("([a-z_]+)"')            | ForEach-Object { $_.Groups[1].Value }
$codes += [regex]::Matches($cs, 'new Issue\([^,]+,\s*[^,]+,\s*"([a-z_]+)"') | ForEach-Object { $_.Groups[1].Value }
$codes = $codes | Sort-Object -Unique

$html = [IO.File]::ReadAllText("$src\VisitAPI.Server\wwwroot\index.html")
$zhAt = $html.IndexOf("const I18N={zh:{")
$enAt = $html.IndexOf("`nen:{", $zhAt)
$end  = $html.IndexOf("const T=k=>", $enAt)
$zh   = $html.Substring($zhAt, $enAt - $zhAt)
$en   = $html.Substring($enAt, $end - $enAt)

Ok "找得到中/英两张表" ($zhAt -ge 0 -and $enAt -gt $zhAt -and $end -gt $enAt)
Ok "抓到了校验码" ($codes.Count -ge 13) "$($codes.Count) 个: $($codes -join ', ')"

foreach ($c in $codes) {
  $k = "qe_$c"
  Ok "$k 有中文" ($zh.Contains("$k`:")) ""
  Ok "$k 有英文" ($en.Contains("$k`:")) ""
}
# 接口层的错误码同理
foreach ($c in @("no_quest_db","stale","bad_name","broken_locale")) {
  $k = "qa_$c"
  Ok "$k 有中文" ($zh.Contains("$k`:")) ""
  Ok "$k 有英文" ($en.Contains("$k`:")) ""
}
# 两张表的 q_* 键必须一一对应。
# T() 在英文缺键时会**静默回落到中文**，所以漏翻不会报错，只会在英文界面里冒出中文——
# 光靠肉眼看是发现不了的，必须机器查。
$keysOf = { param($blk) ([regex]::Matches($blk,'(?m)(?:^|[,{])\s*(q[_a-zA-Z0-9]*)\s*:') |
            ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique }
# 上面那个只抓 q* 开头的（任务界面）。**整张表**也得对齐：
# T() 在英文缺键时会静默回落到中文，漏翻不会报错，只会在英文界面里冒出一句中文。
# 键的写法：行首或逗号后面跟 `名字:`，值可能是 "…" 也可能是 `…`（多行模板串）。
$allKeysOf = { param($blk) ([regex]::Matches($blk,'(?m)(?:^|[,{])\s*([a-z][_a-zA-Z0-9]*)\s*:\s*(?:"|`)') |
               ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique }
$zhAll = & $allKeysOf $zh
$enAll = & $allKeysOf $en
$missEn = @($zhAll | Where-Object { $enAll -notcontains $_ })
$missZh = @($enAll | Where-Object { $zhAll -notcontains $_ })
Ok "两张表的每一个键都对得上" ($missEn.Count -eq 0 -and $missZh.Count -eq 0) `
   "中文 $($zhAll.Count) / 英文 $($enAll.Count)$(if($missEn){'  英文缺: '+($missEn -join ',')})$(if($missZh){'  中文缺: '+($missZh -join ',')})"
$zhK = & $keysOf $zh
$enK = & $keysOf $en
$onlyZh = @($zhK | Where-Object { $enK -notcontains $_ })
$onlyEn = @($enK | Where-Object { $zhK -notcontains $_ })
Ok "任务界面文案中英一一对应" ($onlyZh.Count -eq 0 -and $onlyEn.Count -eq 0) `
   "中文 $($zhK.Count) / 英文 $($enK.Count)$(if($onlyZh){'  只有中文: '+($onlyZh -join ',')})$(if($onlyEn){'  只有英文: '+($onlyEn -join ',')})"

# quest.js 里写死的 T()/TF() 键，表里必须有
$js = [IO.File]::ReadAllText("$src\VisitAPI.Server\wwwroot\quest.js")
$used = ([regex]::Matches($js,'\bTF?\("(q[_a-zA-Z0-9]+)"\s*[,)]') | ForEach-Object { $_.Groups[1].Value }) |
        Sort-Object -Unique
$missing = @($used | Where-Object { $zhK -notcontains $_ })
Ok "quest.js 写死的键表里都有" ($missing.Count -eq 0) `
   "用了 $($used.Count) 个$(if($missing){'  缺: '+($missing -join ',')})"

# 动态拼出来的键（T("q_k_"+k) 这种）静态扫不到，得按"键族"逐个展开查 ——
# 恰恰是这些最容易漏，因为加一个新类型时很容易忘了同步两张表
function Family($rx, $prefix, $suffixes) {
  $names = [regex]::Matches($js, $rx) | ForEach-Object { $_.Groups[1].Value } |
           ForEach-Object { $_ -split '","' } | ForEach-Object { $_.Trim('" ') } | Where-Object { $_ }
  $miss = @()
  foreach ($n in ($names | Sort-Object -Unique)) {
    foreach ($sfx in $suffixes) {
      $k = "$prefix$n$sfx"
      if ($zhK -notcontains $k) { $miss += "$k(中)" }
      if ($enK -notcontains $k) { $miss += "$k(英)" }
    }
  }
  return ,@(($names | Sort-Object -Unique), $miss)
}
$r = Family 'const (?:OBJ_KINDS|REW_KINDS|GATE_KINDS)=\[([^\]]+)\]' "q_k_" @("")
Ok "目标/奖励/门槛的类型名都有中英" ($r[1].Count -eq 0) "$($r[0].Count) 种$(if($r[1]){'  缺: '+($r[1] -join ',')})"
$r = Family 'const SWITCHES=\[([^\]]+)\]' "q_sw_" @("","_d")
Ok "属性开关的名字和说明都有中英" ($r[1].Count -eq 0) "$($r[0].Count) 个$(if($r[1]){'  缺: '+($r[1] -join ',')})"

# ⚠️ 类名撞车：index.html 的内联样式和 quest.css 共用一个全局命名空间，而 quest.css 后加载会赢。
# 踩过一次：说明页用了 .gcol，正好撞上任务链图的层级标尺（position:absolute;width:1px），
# 整页塌成"一列单字"，而当时的界面测试全是绿的（它们只数元素、不量宽度）。
$css = [regex]::Match($html, '(?s)<style>(.*?)</style>').Groups[1].Value
$qcss = [IO.File]::ReadAllText("$src\VisitAPI.Server\wwwroot\quest.css")
$classOf = { param($blk) ([regex]::Matches($blk, '(?m)^\s*\.([a-zA-Z][\w-]*)[\s,{:>\[]') |
             ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique }
$inline = & $classOf $css
$quest  = & $classOf $qcss
# 有意共用的（任务页照抄对话页那套皮，quest.css 里只是往上加，不是另起一套）
$shared = @("card","chead","row","lbl","btn","ghost","pri","seg","note","alt","tape","slab","rule","cart",
            "main","hdr","acts","sp","saved","stat","pop","opts2","kindmenu","secline","setwrap","lede","ic",
            "stagepane","telem")
$clash = @($inline | Where-Object { $quest -contains $_ -and $shared -notcontains $_ })
Ok "内联样式和 quest.css 没有意外撞名" ($clash.Count -eq 0) `
   $(if($clash){"撞了: "+($clash -join ', ')}else{"内联 $($inline.Count) 个 / quest.css $($quest.Count) 个"})

# 使用说明页的卡片：GUIDE 表里只写标题键，正文键是 键+"_b" 拼出来的，静态扫不到
$guide = [regex]::Match($html, '(?s)const GUIDE=\{(.*?)\n\};').Groups[1].Value
$gKeys = ([regex]::Matches($guide, '"(g_[a-z_]+)"') | ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique
# 这里用 Contains 而不是上面那份 $zhK：那个只抓 q* 开头的键（任务界面用的），g_* 抓不到
$missG = @()
foreach ($k in $gKeys) {
  foreach ($sfx in @("","_b")) {
    if (-not $zh.Contains("$k$sfx`:")) { $missG += "$k$sfx(中)" }
    if (-not $en.Contains("$k$sfx`:")) { $missG += "$k$sfx(英)" }
  }
}
Ok "使用说明每张卡都有中英标题和正文" ($gKeys.Count -ge 10 -and $missG.Count -eq 0) `
   "$($gKeys.Count) 张$(if($missG){'  缺: '+($missG -join ',')})"
# 正文是直接当 HTML 塞进页面的，标签必须成对，不然整页会被一个没闭合的标签吃掉
$bad = @()
foreach ($k in $gKeys) {
  foreach ($tbl in @(@{n='中';v=$zh}, @{n='英';v=$en})) {
    $m = [regex]::Match($tbl.v, [regex]::Escape("$k`_b:``") + '(.*?)``,', 'Singleline')
    if (-not $m.Success) { continue }
    $b = $m.Groups[1].Value
    foreach ($tag in @('p','ul','li','table','tbody','tr','td','code','b','pre')) {
      $o = ([regex]::Matches($b, "<$tag[ >]")).Count
      $c = ([regex]::Matches($b, "</$tag>")).Count
      if ($o -ne $c) { $bad += "$k($($tbl.n))<$tag> $o/$c" }
    }
  }
}
Ok "说明正文里的标签都是成对的" ($bad.Count -eq 0) $(if($bad){$bad -join ', '}else{"$($gKeys.Count) 张 × 中英"})

# 新手引导：TOUR 表里只写标题键，说明键是 键+"_d" 拼出来的，静态扫不到
$tour = [regex]::Match($html, '(?s)const TOUR=\{(.*?)\n\};').Groups[1].Value
$tKeys = ([regex]::Matches($tour, '"(tr_[a-z_]+)"') | ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique
$missT = @()
foreach ($k in $tKeys) {
  foreach ($sfx in @("","_d")) {
    if (-not $zh.Contains("$k$sfx`:")) { $missT += "$k$sfx(中)" }
    if (-not $en.Contains("$k$sfx`:")) { $missT += "$k$sfx(英)" }
  }
}
Ok "新手引导每一步都有中英标题和说明" ($tKeys.Count -ge 15 -and $missT.Count -eq 0) `
   "$($tKeys.Count) 步$(if($missT){'  缺: '+($missT -join ',')})"
# 引导指的选择器必须在界面代码里真出现过，否则就是指着空气讲
$src2 = $html + [IO.File]::ReadAllText("$src\VisitAPI.Server\wwwroot\quest.js")
$sels = [regex]::Matches($tour, '\["([^"]+)","tr_') | ForEach-Object { $_.Groups[1].Value }
$ghost = @($sels | Where-Object {
  $id = [regex]::Match($_, '#([\w-]+)').Groups[1].Value
  $cls = [regex]::Match($_, '\.([\w-]+)').Groups[1].Value
  $attr = [regex]::Match($_, '\[([\w-]+)').Groups[1].Value
  -not (($id -and $src2.Contains("`"$id`"")) -or ($cls -and $src2.Contains($cls)) -or ($attr -and $src2.Contains($attr)))
})
Ok "引导指的元素在界面代码里都找得到" ($ghost.Count -eq 0) `
   "$($sels.Count) 个$(if($ghost){'  找不到: '+($ghost -join ', ')})"

# 高级参数的标签键写在 ADV 表里（["字段","类型","键"]），静态扫 T("…") 扫不到，单独查一遍
$adv = [regex]::Match($js, '(?s)const ADV=\{(.*?)\n\};').Groups[1].Value
$advKeys = ([regex]::Matches($adv, '"(q_adv_[a-z]+)"') | ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique
$missAdv = @()
foreach ($k in $advKeys) {
  if ($zhK -notcontains $k) { $missAdv += "$k(中)" }
  if ($enK -notcontains $k) { $missAdv += "$k(英)" }
}
Ok "高级参数每个字段都有中英标签" ($advKeys.Count -ge 12 -and $missAdv.Count -eq 0) `
   "$($advKeys.Count) 个$(if($missAdv){'  缺: '+($missAdv -join ',')})"

# 反过来查：表里有、C# 从来不发的码 = 死文案
$declared = ([regex]::Matches($zh, '\bqe_([a-z_]+)\s*:') | ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique
$dead = @($declared | Where-Object { $codes -notcontains $_ })
Ok "没有死文案（表里有但 C# 不发的码）" ($dead.Count -eq 0) ($dead -join ", ")

# 程序介绍页（ab_*）同样两张表都要有。它自己也拼键（T(k+"_d")），静态扫不到，
# 所以下面第二段按"环境行 / 须知行"逐条展开查。
$abKeys = { param($blk) ([regex]::Matches($blk,'(?m)(?:^|[,{])\s*(ab_[_a-zA-Z0-9]*)\s*:') |
            ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique }
$zhA = & $abKeys $zh
$enA = & $abKeys $en
$onlyZhA = @($zhA | Where-Object { $enA -notcontains $_ })
$onlyEnA = @($enA | Where-Object { $zhA -notcontains $_ })
Ok "程序介绍文案中英一一对应" ($onlyZhA.Count -eq 0 -and $onlyEnA.Count -eq 0) `
   "中文 $($zhA.Count) / 英文 $($enA.Count)$(if($onlyZhA){'  只有中文: '+($onlyZhA -join ',')})$(if($onlyEnA){'  只有英文: '+($onlyEnA -join ',')})"

$usedA = ([regex]::Matches($html,'\bTF?\("(ab_[_a-zA-Z0-9]+)"\s*[,)]') | ForEach-Object { $_.Groups[1].Value }) |
         Sort-Object -Unique
$missA = @($usedA | Where-Object { $zhA -notcontains $_ })
Ok "介绍页写死的键表里都有" ($missA.Count -eq 0) "用了 $($usedA.Count) 个$(if($missA){'  缺: '+($missA -join ',')})"

# 拼出来的键静态扫不到（T(k)/T(k+"_d") 里的 k 是当参数传进去的），按族逐个展开查。
# 这些恰恰最容易漏：加一行就要同步四张位置的文案。
$fam = @(
  @{ n = "环境四行 + 须知四行的说明";
     k = @("ab_e_ws","ab_e_q","ab_e_eft","ab_e_build","ab_n1","ab_n2","ab_n3","ab_n4"); s = @("","_d") },
  @{ n = "快速上手前两步（含已完成时的说明）";
     k = @("ab_qs1","ab_qs2"); s = @("","_d","_ok") }
)
foreach ($f in $fam) {
  $miss = @()
  foreach ($k in $f.k) { foreach ($sfx in $f.s) {
    if ($zhA -notcontains "$k$sfx") { $miss += "$k$sfx(中)" }
    if ($enA -notcontains "$k$sfx") { $miss += "$k$sfx(英)" }
  } }
  Ok "$($f.n)都有中英" ($miss.Count -eq 0) "$($f.k.Count) 项$(if($miss){'  缺: '+($miss -join ',')})"
}

# 模块表按 PAGES 的 id 拼 ab_d_<id>，漏一个就是某个模块没有介绍
$pids = ([regex]::Matches($html,'\{id:"([a-z]+)",k:"nav_') | ForEach-Object { $_.Groups[1].Value })
$missP = @()
foreach ($p in $pids) {
  if ($zhA -notcontains "ab_d_$p") { $missP += "ab_d_$p(中)" }
  if ($enA -notcontains "ab_d_$p") { $missP += "ab_d_$p(英)" }
}
Ok "每个模块都有一句介绍" ($missP.Count -eq 0) "$($pids.Count) 个模块$(if($missP){'  缺: '+($missP -join ',')})"

# 界面脚本别被我改崩了
$scripts = [regex]::Matches($html, '(?s)<script>(.*?)</script>')
Ok "index.html 里有脚本块" ($scripts.Count -ge 1) "$($scripts.Count) 块"

""
"合计 $($pass + $fail) 项，通过 $pass，失败 $fail"
