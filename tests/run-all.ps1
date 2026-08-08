# 一次跑完全部回归。每个脚本自己会打印一行「合计 N 项，通过 P，失败 F」，这里把它们汇总。
#
# 用法：  .\tests\run-all.ps1            跑全部
#         .\tests\run-all.ps1 -Only i18n,qimg   只跑名字里含这些词的
#         .\tests\run-all.ps1 -Verbose  连每一条 PASS/FAIL 一起打出来
[CmdletBinding()]
param([string[]]$Only)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"

# 界面类的用无头 Edge 跑真页面；带浏览器的那几个慢，放后面
$all = Get-ChildItem $PSScriptRoot -Filter "test-*.ps1" | Sort-Object Name
if ($Only) { $all = $all | Where-Object { $n = $_.BaseName; $Only | Where-Object { $n -like "*$_*" } } }

dotnet build $Proj -v q --nologo | Out-Null
if ($LASTEXITCODE -ne 0) { throw "编译没过，测试不用跑了" }

$sum = 0; $bad = 0; $rows = @()
foreach ($t in $all) {
    Write-Host "── $($t.BaseName) " -NoNewline -ForegroundColor DarkGray
    $out = & $t.FullName 2>&1 | ForEach-Object { "$_" }
    if ($VerbosePreference -ne 'SilentlyContinue') { $out | ForEach-Object { Write-Verbose $_ } }
    $m = $out | Select-String '合计 (\d+) 项，通过 (\d+)，失败 (\d+)' | Select-Object -Last 1
    if (-not $m) {
        $rows += [pscustomobject]@{ 测试 = $t.BaseName; 项 = 0; 失败 = "?" }
        $bad++; Write-Host "没报出合计（脚本自己挂了？）" -ForegroundColor Red
        $out | Select-Object -Last 6 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
        continue
    }
    $n = [int]$m.Matches[0].Groups[1].Value; $f = [int]$m.Matches[0].Groups[3].Value
    $sum += $n; $bad += $f
    $rows += [pscustomobject]@{ 测试 = $t.BaseName; 项 = $n; 失败 = $f }
    if ($f) { Write-Host "$n 项，失败 $f" -ForegroundColor Red
              $out | Select-String '^FAIL' | ForEach-Object { Write-Host "    $_" -ForegroundColor Red } }
    else    { Write-Host "$n 项 全过" -ForegroundColor Green }
}

""
$rows | Format-Table -AutoSize
if ($bad) { Write-Host "合计 $sum 项，失败 $bad" -ForegroundColor Red; exit 1 }
Write-Host "合计 $sum 项，全绿" -ForegroundColor Green
