<#
    一键构建：产出 dist\VisitAPI.Editor.exe

    单文件、framework-dependent（不打包运行时）——装了 SPT 的人本来就有
    .NET 10 + ASP.NET Core，不需要额外装任何东西。
#>
[CmdletBinding()]
param(
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$proj = Join-Path $root 'src\VisitAPI.Server\VisitAPI.Server.csproj'
$dist = Join-Path $root 'dist'

Write-Host "构建 $Configuration ..." -ForegroundColor Cyan
dotnet publish $proj -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) { throw "构建失败" }

$out = Join-Path $root "src\VisitAPI.Server\bin\$Configuration\net10.0\win-x64\publish\VisitAPI.Editor.exe"
if (-not (Test-Path $out)) { throw "没找到产物: $out" }

if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
Copy-Item $out (Join-Path $dist 'VisitAPI.Editor.exe') -Force

$exe = Get-Item (Join-Path $dist 'VisitAPI.Editor.exe')
Write-Host ("完成: {0}  ({1:N0} KB)" -f $exe.FullName, ($exe.Length / 1KB)) -ForegroundColor Green
Write-Host "把它放进 EFT 根目录，双击即可。" -ForegroundColor DarkGray
