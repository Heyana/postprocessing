---
layout: single
collection: sections
title: SSR Compatibility
draft: false
menu:
  demos:
    parent: utility
    weight: 35
script: ssr-compat
---

# Screen Space Reflections (Three.js Pass兼容演示)

这个示例展示了如何使用ThreeCompatPass将Three.js的原生Screen Space Reflection Pass集成到postprocessing库中。

屏幕空间反射(SSR)是一种实时图形技术，可以在不增加太多性能成本的情况下产生逼真的反射效果。SSR通过重用已经在屏幕上渲染的信息来计算反射，而不是通过光线追踪。

## 注意事项

如果您看到纹理加载错误（如`404 Not Found`错误）或者画面过暗，请尝试以下操作：

1. 使用控制面板中的"Enable SSR"选项切换SSR效果
2. 调整"Light Intensity"增加场景亮度
3. 尝试不同的"Output Mode"，特别是"Beauty"模式可以查看无SSR效果的场景
4. 降低"Opacity"值，减少反射强度

这些错误通常是由于某些纹理文件不存在导致的，但演示已经包含了错误处理，应该能够正常运行。

## 兼容层示例

此演示使用`ThreeCompatPass`作为兼容适配器，将Three.js的`SSRPass`集成到postprocessing的EffectComposer中：

```javascript
// 创建Three.js的SSRPass
const ssrPass = new SSRPass({
    renderer,
    scene,
    camera,
    width: window.innerWidth,
    height: window.innerHeight,
    encoding: renderer.outputColorSpace
});

// 使用ThreeCompatPass包装SSRPass
const compatSSRPass = new ThreeCompatPass(ssrPass, "SSRCompatPass");

// 添加到效果合成器
composer.addPass(compatSSRPass);
```

## 使用说明

场景中包含了不同金属度和粗糙度的球体，以展示SSR效果的差异：
- 最上面的红色球体组：高金属度，低粗糙度，反射效果最强
- 中间的球体组：不同程度的金属度和粗糙度
- 最下面的紫色球体组：低金属度，高粗糙度，几乎没有反射

通过右侧的控制面板可以调整SSR的各种参数：
- 启用/禁用SSR效果
- 厚度(Thickness)：控制反射的精度
- 最大距离(Max Distance)：反射效果可以传播的最大距离
- 不透明度(Opacity)：反射的强度
- 菲涅尔(Fresnel)：边缘增强效果
- 距离衰减(Distance Attenuation)：反射随距离衰减
- 输出模式(Output Mode)：查看不同的渲染通道(法线、深度等)
- 环境贴图强度(EnvMap Intensity)：调整环境反射的强度
- 灯光强度(Light Intensity)：调整场景整体亮度

## 技术细节

SSR是一种屏幕空间技术，仅使用已经可见的信息来创建反射。这意味着它有一些限制：
1. 只能反射屏幕上可见的内容
2. 在某些视角下可能会出现伪影或反射消失
3. 与传统的环境映射相比，SSR更加动态，但计算成本也更高

## 故障排除

如果您遇到以下问题：

1. **画面一片黑**：尝试禁用SSR效果，或切换到"Beauty"输出模式
2. **纹理404错误**：这些是预期的警告，不会影响演示运行
3. **性能问题**：降低"Max Distance"值和"Thickness"值可以提高性能
4. **反射过强或过弱**：调整"Opacity"和"EnvMap Intensity"值 