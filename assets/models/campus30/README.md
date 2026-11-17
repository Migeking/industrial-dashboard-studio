# 场景 30 园区离线资产

`campus30-scene.js` 是本项目的程序化建筑、景观及机电空间源代码。`campus30-assets.js` 是页面实际加载的资源包，包含该源代码、Three.js r128 后处理依赖、内嵌 PBR 图像及 HDR 环境，运行时不请求外网。

建筑、道路、车辆、植物和家具由项目代码生成。模型单位用于概念布局，未经现场测绘。

## 外部资源与许可

- Poly Haven CC0：[`asphalt_02`](https://polyhaven.com/a/asphalt_02)、[`concrete_floor_painted`](https://polyhaven.com/a/concrete_floor_painted)、[`aerial_grass_rock`](https://polyhaven.com/a/aerial_grass_rock)、[`kloppenheim_06_puresky`](https://polyhaven.com/a/kloppenheim_06_puresky)。[许可](https://polyhaven.com/license)。
- Three.js r128：RGBELoader、SimplexNoise、CopyShader、SSAOShader、FXAAShader、Pass、SSAOPass，MIT，见 `THREE-LICENSE.txt`。FXAA 源码的 NVIDIA 许可说明保留在资源包中。
- 混凝土颜色贴图在运行时降低对比并叠加铺装缝；其他图像依用途调整颜色、重复比例及法线强度。

## 重建

在仓库根目录运行：

```powershell
python -X utf8 scripts/build-campus30-assets.py
node skills/industrial-dashboard/scripts/validate-dashboard.js scenarios
python -X utf8 tests/interaction_check.py
python -X utf8 tests/capture_30.py
```

首次重建需要网络；原始文件缓存在 `works/scene30/sources/`。后续重建复用缓存。资源包使用 LF 换行；`manifest.json` 记录来源内容、源代码与最终资源包的 SHA-256。修改源代码后必须重新生成资源包，一并交付 HTML 和该目录。
