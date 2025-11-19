# Post Processing

[![CI](https://github.com/pmndrs/postprocessing/actions/workflows/ci.yml/badge.svg)](https://github.com/pmndrs/postprocessing/actions/workflows/ci.yml)
[![Version](https://badgen.net/npm/v/postprocessing?color=green)](https://www.npmjs.com/package/postprocessing)

一个用于 [three.js](https://threejs.org/) 的后处理库。

*[演示](https://pmndrs.github.io/postprocessing/public/demo)&ensp;&middot;&ensp;[沙盒](https://stackblitz.com/edit/postprocessing-v6)&ensp;&middot;&ensp;[文档](https://pmndrs.github.io/postprocessing/public/docs)&ensp;&middot;&ensp;[维基](https://github.com/pmndrs/postprocessing/wiki)*

## 安装

该库需要对等依赖 [three](https://github.com/mrdoob/three.js/)。

```sh
npm install three postprocessing
```

## 使用

后处理引入了 Pass（通道）和 Effect（效果）的概念，通过全屏图像处理工具扩展了通用的渲染工作流。为了获得最佳的后处理工作流，应使用以下 WebGL 属性：

```js
import { WebGLRenderer } from "three";

const renderer = new WebGLRenderer({
	powerPreference: "high-performance",
	antialias: false,
	stencil: false,
	depth: false
});
```

[EffectComposer](https://pmndrs.github.io/postprocessing/public/docs/class/src/core/EffectComposer.js~EffectComposer.html) 管理并运行通道。通常的做法是将 [RenderPass](https://pmndrs.github.io/postprocessing/public/docs/class/src/passes/RenderPass.js~RenderPass.html) 作为第一个通道，以自动清除缓冲区并渲染场景以供后续处理。全屏图像效果通过 [EffectPass](https://pmndrs.github.io/postprocessing/public/docs/class/src/passes/EffectPass.js~EffectPass.html) 渲染。请参考 three.js 的 [使用示例](https://github.com/mrdoob/three.js/blob/master/README.md) 了解如何设置渲染器、场景和相机。

```js
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera, new BloomEffect()));

requestAnimationFrame(function render() {

	requestAnimationFrame(render);
	composer.render();

});
```

## 输出色彩空间

新应用程序应遵循 [线性工作流](https://docs.unity3d.com/Manual/LinearRendering-LinearOrGammaWorkflow.html) 进行色彩管理，postprocessing 会自动支持这一点。只需将 `WebGLRenderer.outputColorSpace` 设置为 `SRGBColorSpace`，postprocessing 就会随之调整。

Postprocessing 使用 `UnsignedByteType` sRGB 帧缓冲区来存储中间结果。这是在硬件支持、效率和质量之间的权衡，因为线性结果通常每个颜色通道至少需要 12 位才能防止 [颜色退化和条带化](https://blog.demofox.org/2018/03/10/dont-convert-srgb-u8-to-linear-u8/)。使用低精度 sRGB 缓冲区，颜色将被限制在 `[0.0, 1.0]` 范围内，信息丢失将转移到较暗的频谱，这会导致在黑暗场景中出现明显的条带。线性高精度 `HalfFloatType` 缓冲区没有这些问题，是桌面设备上 HDR 类工作流的首选。您可以按如下方式启用高精度帧缓冲区：

```ts
import { HalfFloatType } from "three";

const composer = new EffectComposer(renderer, {
	frameBufferType: HalfFloatType
});
```

## 色调映射 (Tone Mapping)

色调映射是将 HDR 颜色转换为 LDR 输出颜色的过程。使用 postprocessing 时，渲染器上的 `toneMapping` 设置应设置为 `NoToneMapping`（默认值），并且应启用高精度帧缓冲区。否则，颜色将在管道开始时映射到 `[0.0, 1.0]`。要启用色调映射，请在管道末尾使用 `ToneMappingEffect`。

请注意，仅使用渲染器时，色调映射不会应用于清除颜色（clear color），因为清除不涉及着色器。Postprocessing 应用于完整的输入图像，这意味着色调映射也将均匀应用。因此，有无 postprocessing 的清除颜色背景的色调映射结果将是不同的，而 postprocessing 的方法是正确的。

## 性能

该库提供了一个 [EffectPass](https://pmndrs.github.io/postprocessing/public/docs/class/src/passes/EffectPass.js~EffectPass.html)，它可以自动组织和合并任何给定的效果组合。这最大限度地减少了渲染操作的数量，并且可以组合许多效果而不会产生传统通道链的性能损失。此外，每个效果都可以选择自己的 [混合函数](https://pmndrs.github.io/postprocessing/public/docs/variable/index.html#static-variable-BlendFunction)。

所有全屏渲染操作也都使用填充屏幕的 [单个三角形](https://michaldrobot.com/2014/04/01/gcn-execution-patterns-in-full-screen-passes/)。与使用四边形相比，这种方法与现代 GPU 光栅化模式相协调，并消除了沿屏幕对角线的不必要的片元计算。这对于使用复杂片元着色器的 GPGPU 通道和效果特别有益。

[性能测试](https://pmndrs.github.io/postprocessing/public/demo/#performance)

## 包含的效果

_演示总下载大小约为 `60 MB`。_

 - [Antialiasing (抗锯齿)](https://pmndrs.github.io/postprocessing/public/demo/#antialiasing)
 - [Bloom (泛光)](https://pmndrs.github.io/postprocessing/public/demo/#bloom)
 - [Blur (模糊)](https://pmndrs.github.io/postprocessing/public/demo/#blur)
 - [Color Depth (色深)](https://pmndrs.github.io/postprocessing/public/demo/#color-depth)
 - [Color Grading (调色)](https://pmndrs.github.io/postprocessing/public/demo/#color-grading)
   - Color Average (平均色)
   - Sepia (棕褐色)
   - Brightness & Contrast (亮度与对比度)
   - Hue & Saturation (色相与饱和度)
   - LUT (查找表)
 - [Depth of Field (景深)](https://pmndrs.github.io/postprocessing/public/demo/#depth-of-field)
   - Vignette (暗角)
 - [Glitch (故障效果)](https://pmndrs.github.io/postprocessing/public/demo/#glitch)
   - Chromatic Aberration (色差)
   - Noise (噪点)
 - [God Rays (神光/体积光)](https://pmndrs.github.io/postprocessing/public/demo/#god-rays)
 - [Pattern (图案)](https://pmndrs.github.io/postprocessing/public/demo/#pattern)
   - Dot-Screen (点阵屏)
   - Grid (网格)
   - Scanline (扫描线)
 - [Pixelation (像素化)](https://pmndrs.github.io/postprocessing/public/demo/#pixelation)
 - [Outline (轮廓线)](https://pmndrs.github.io/postprocessing/public/demo/#outline)
 - [Shock Wave (冲击波)](https://pmndrs.github.io/postprocessing/public/demo/#shock-wave)
   - Depth Picking (深度拾取)
 - [SSAO (屏幕空间环境光遮蔽)](https://pmndrs.github.io/postprocessing/public/demo/#ssao)
 - [Texture (纹理)](https://pmndrs.github.io/postprocessing/public/demo/#texture)
 - [Tone Mapping (色调映射)](https://pmndrs.github.io/postprocessing/public/demo/#tone-mapping)

## 自定义效果

如果您想学习如何创建自定义效果或通道，请查看 [Wiki](https://github.com/pmndrs/postprocessing/wiki)。

## 贡献

详情请参阅 [贡献指南](https://github.com/pmndrs/postprocessing/blob/main/.github/CONTRIBUTING.md)。

## 许可证

本库采用 [Zlib 许可证](https://github.com/pmndrs/postprocessing/blob/main/LICENSE.md) 授权。

本库基于的原始代码由 [mrdoob](https://mrdoob.com) 和 [three.js 贡献者](https://github.com/mrdoob/three.js/graphs/contributors) 编写，并采用 [MIT 许可证](https://github.com/mrdoob/three.js/blob/master/LICENSE) 授权。

---

## 新增功能：8通道MRT渲染

现在我们的 MRTRenderPass 支持最多 8 个渲染通道（WebGL2 的最大限制），包括：

1. **颜色通道** - 对象的基本颜色信息
2. **法线通道** - 表面法线矢量
3. **深度通道** - 非线性映射的深度信息
4. **世界位置通道** - 存储片元在世界空间中的位置
5. **PBR属性通道** - 存储物理渲染属性（粗糙度、金属度、环境光遮蔽）
6. **运动向量通道** - 存储运动方向和速度，用于运动模糊
7. **自发光通道** - 存储自发光材质信息，用于辉光效果
8. **对象ID通道** - 使用唯一颜色标识不同对象，用于选择

### 键盘快捷键

可使用数字键 1-9 快速切换显示不同通道：
- `1` - 颜色通道
- `2` - 法线通道
- `3` - 深度通道
- `4` - 世界位置通道
- `5` - PBR属性通道
- `6` - 运动向量通道
- `7` - 自发光通道
- `8` - 对象ID通道
- `9` - 多通道组合视图（2x4网格）
