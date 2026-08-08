# 所有测试脚本共用的环境。每个脚本开头 `. "$PSScriptRoot\_env.ps1"` 一句就够。
#
# 为什么要有这个文件：脚本原来把 `E:\项目\VisitAPI Editor` 和 `D:\EFT` 写死在里面，
# 换台机器就一条都跑不了。现在项目根从脚本自己的位置推，SPT 的位置可以用环境变量指。

$Root = Split-Path $PSScriptRoot -Parent
$Proj = "$Root\src\VisitAPI.Server\VisitAPI.Server.csproj"
$Exe  = "$Root\src\VisitAPI.Server\bin\Debug\net10.0\win-x64\VisitAPI.Editor.exe"

# 真的 SPT 安装位置。测试要用它的 SPT_Data\database（物品表 / 地图表 / 商人表 / 全局文案）——
# 那是几百 MB 的游戏数据，不可能进仓库，所以只做一个目录联接指过去。
$SptHome = if ($env:VISITAPI_SPT_HOME) { $env:VISITAPI_SPT_HOME } else { "D:\EFT" }
$Edge    = if ($env:VISITAPI_EDGE) { $env:VISITAPI_EDGE }
           else { "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" }

# FakeEFT 是仓库里那份小小的假游戏目录，只缺 database 这一块；这里把它联接到真的上面去。
# 用 Junction 不用 SymbolicLink：后者在 Windows 上要开发者模式或管理员权限，前者不用。
function Ensure-SptData {
    $link = "$PSScriptRoot\FakeEFT\SPT_Runtime\SPT_Data\database"
    if (Test-Path $link) { return }
    $real = "$SptHome\SPT_Runtime\SPT_Data\database"
    if (-not (Test-Path $real)) {
        throw "找不到 SPT 数据库: $real（设 VISITAPI_SPT_HOME 指向你的 SPT 安装目录）"
    }
    New-Item -ItemType Directory -Force (Split-Path $link) | Out-Null
    New-Item -ItemType Junction -Path $link -Target $real | Out-Null
}
