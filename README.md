# dsh-companion（角色世界）

DSH 插件：近因 / 长期记忆、短约束、宿主设置页「角色世界」。

## 怎么安装（Desktop）

日常只开 Desktop 时，在终端执行：

```powershell
dsh plugin --profile desktop add github:lubai0614/dsh-companion
```

然后：

1. **完全退出并重启 Desktop**
2. 打开 **设置 → 角色世界**

卸掉重装：

```powershell
dsh plugin --profile desktop remove dsh-companion
dsh plugin --profile desktop add github:lubai0614/dsh-companion
```

仓库：https://github.com/lubai0614/dsh-companion  

（仓根即插件包，可被上述命令直接安装。）

## 数据落在哪

- 数据根：`$DSH_HOME/dsh-companion/`
- 库文件：`dsh-companion.sqlite`
- 最近一次召回：`last-assemble-trace.json`
- 句向量小模随包：`models/Xenova/bge-small-zh-v1.5/`（可落到数据根同旁 `models/`）
