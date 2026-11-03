# 随包句向量模型

当前随包：`Xenova/bge-small-zh-v1.5`（量化 onnx）。

目录须含 `config.json`，以及同目录 tokenizer / `onnx/model_quantized.onnx` 等。

运行时**只读本地**（本目录或数据根 `models/` 落出），不远程下载。缺文件 / 损坏会打排查日志；检索时向量路空，关键词路照常。

本机自检（不联网，只读已随包文件）：

```powershell
cd plugins/dsh-companion
node --input-type=module -e "import { prefetchEmbedModel } from './src/embed.js'; console.log(await prefetchEmbedModel())"
```
