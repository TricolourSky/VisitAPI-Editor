<#
    一键构建：产出 publish\VisitAPI.Editor.exe

    单文件、framework-dependent（不打包运行时）——装了 SPT 的人本来就有
    .NET 10 + ASP.NET Core，不需要额外装任何东西。

    ⚠️ 发布输出**只有 publish\ 一个**。以前还有个 dist\，两个目录并存的结果是
       "跑通了"和"装到位了"分家：测试全绿而发出去的还是上一版的 exe。

    ⚠️ 输出目录**每次先删干净**再 publish。不删的话 publish 失败了旧 exe 还躺在那儿，
       冒烟照样全绿，而你发出去的是个过期的东西（踩过）。
#>
[CmdletBinding()]
param(
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$proj = Join-Path $root 'src\VisitAPI.Server\VisitAPI.Server.csproj'
$dist = Join-Path $root 'publish'

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }

Write-Host "构建 $Configuration ..." -ForegroundColor Cyan
dotnet publish $proj -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) { throw "构建失败" }

$out = Join-Path $root "src\VisitAPI.Server\bin\$Configuration\net10.0\win-x64\publish\VisitAPI.Editor.exe"
if (-not (Test-Path $out)) { throw "没找到产物: $out" }

New-Item -ItemType Directory -Path $dist | Out-Null
Copy-Item $out (Join-Path $dist 'VisitAPI.Editor.exe') -Force

# 发布物就该**只有一个 exe**。visitapi-editor.txt 尤其不能跟着走 ——
# 它记着这台机器的工作区，发出去会把所有人的工作区指到开发机上。
Get-ChildItem $dist -File |
    Where-Object { $_.Name -ne 'VisitAPI.Editor.exe' } |
    ForEach-Object { Remove-Item $_.FullName -Force }

$exe = Get-Item (Join-Path $dist 'VisitAPI.Editor.exe')
Write-Host ("完成: {0}  ({1:N0} KB)" -f $exe.FullName, ($exe.Length / 1KB)) -ForegroundColor Green
Write-Host "把它放进 EFT 根目录，双击即可。" -ForegroundColor DarkGray
