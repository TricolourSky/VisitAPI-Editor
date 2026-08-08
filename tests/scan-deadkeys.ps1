# 一次性体检：文案表里声明了但没人用的键（死文案）。
# 动态拼出来的键静态扫不到，所以这里只报"疑似"，人工过一遍。
. "$PSScriptRoot\_env.ps1"
$www = "$Root\src\VisitAPI.Server\wwwroot"
$html = [IO.File]::ReadAllText("$www\index.html")
$js   = [IO.File]::ReadAllText("$www\quest.js")
$all  = $html + $js

$zhAt = $html.IndexOf("const I18N={zh:{")
$enAt = $html.IndexOf("`nen:{", $zhAt)
$end  = $html.IndexOf("const T=k=>", $enAt)
$zh   = $html.Substring($zhAt, $enAt - $zhAt)

$declared = ([regex]::Matches($zh,'(?m)(?:^|[,{])\s*([a-z][_a-zA-Z0-9]*)\s*:') |
             ForEach-Object { $_.Groups[1].Value }) | Sort-Object -Unique
# 用到的：T("x") / TF("x" / "x" 作为参数出现（step("ab_qs1") 这种）
$used = ([regex]::Matches($all,'\bTF?\("([a-z][_a-zA-Z0-9]*)"') | ForEach-Object { $_.Groups[1].Value }) +
        ([regex]::Matches($all,'"([a-z][_a-zA-Z0-9]*)"\s*[,)]')  | ForEach-Object { $_.Groups[1].Value }) |
        Sort-Object -Unique

$dead = @($declared | Where-Object { $used -notcontains $_ })
"声明 $($declared.Count) 个，静态用到 $(($declared | Where-Object { $used -contains $_ }).Count) 个"
if ($dead.Count) { "疑似没人用："; $dead | ForEach-Object { "  $_" } } else { "没有可疑的死文案" }
