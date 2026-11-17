# BAS-22 离线写实资产包

`building22-assets.js` 供 22 号场景独立加载，包含 Three.js r128 的 OrbitControls、GLTFLoader、RGBELoader、SSAO 和 FXAA 依赖，以及内嵌的模型、PBR 贴图与 HDR 环境。其他场景继续使用原有 vendor 文件。

模型和纹理采用 data URI，避免直接双击 HTML 时 file:// 的资源跨域问题。页面运行不访问 Poly Haven、GitHub 或其他外部服务。资源包约 16 MB，修改后应连同场景 HTML 一起交付。

## 来源与许可

- [Poly Haven CC0 许可](https://polyhaven.com/license)。资源包含 `modern_arm_chair_01`、`potted_plant_04`、`rosewood_veneer_02`、`dirty_carpet`、`terrazzo_tiles`、`lebombo`。完整下载地址与 SHA-256 见 [manifest.json](manifest.json)。
- Three.js r128 使用 MIT 许可，见 [THREE-LICENSE.txt](THREE-LICENSE.txt)。FXAA 源码中的 NVIDIA 许可说明保留在生成资源包内。
- 地毯和石材的颜色贴图在运行时作灰度和亮度调整；原扫描表面细节保留在法线、粗糙度贴图内。

## 重建与检查

在仓库根目录执行 `python -X utf8 scripts/build-building22-assets.py`。重建过程需要网络，下载缓存位于 `works/scene22/sources/`；场景运行不需要网络。

生成脚本固定 Three.js 为 r128，输出确定的 LF 换行，并在 manifest 中记录资源包实际字节的 SHA-256。修改资产后需重新执行静态校验、交互回归及离线浏览器检查。

这些资产用于概念场景表现，不能替代实际楼宇图纸、设备规格或现场验收。
