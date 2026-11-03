# dsh-companion（角色世界）

DSH 插件：近因 / 长期记忆、短约束、宿主设置页「角色世界」。

## 安装（Desktop）

```powershell
dsh plugin --profile desktop add github:lubai0614/dsh-companion
```

装完后**完全退出并重启 Desktop**，打开 **设置 → 角色世界**。

可选钉提交：

```powershell
dsh plugin --profile desktop add github:lubai0614/dsh-companion#<commit>
```

## 数据

- 数据根：`$DSH_HOME/dsh-companion/`
- 库文件：`dsh-companion.sqlite`
- 最近一次召回：`last-assemble-trace.json`
- 句向量小模随包（可落到同旁 `models/`；权重后补）

## 仓库说明

本仓库根目录即插件包（可被 `dsh plugin add github:…` 直接安装）。  
细案与开发工作区另有本地 monorepo；本仓只发布可安装插件。
