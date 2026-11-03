# 随包句向量模型

放置与配置 `ltm_embed_model_id` 一致的本地权重，例如：

`Xenova/bge-small-zh-v1.5/config.json`（及同目录 onnx / tokenizer 等）

运行时**只读本地**（插件本目录或数据根 `models/` 落出），不远程下载。缺文件 / 损坏会打排查日志；检索时向量路空，关键词路照常。
