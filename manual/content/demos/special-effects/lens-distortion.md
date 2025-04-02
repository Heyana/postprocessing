---
layout: single
collection: sections
title: 镜头畸变
draft: false
menu:
  demos:
    parent: special-effects
    weight: 36
script: lens-distortion
---

# 镜头畸变效果 (Lens Distortion)

镜头畸变是一种模拟真实相机镜头光学特性的后处理效果。它能够增加画面的真实感和电影感，通过模拟镜头的桶形/枕形畸变和色差效果，使渲染场景更具摄影质感。

## 主要特性

- **桶形/枕形畸变** - 可独立调节水平和垂直方向的畸变参数
- **色差模拟** - 模拟不同波长的光在镜头中折射角度不同产生的色彩分离
- **参数化控制** - 精确调节畸变程度和色差强度
- **实时渲染** - 针对实时应用进行了优化，保持高性能

## 操作指南

本演示展示了镜头畸变效果在3D场景中的应用。您可以通过控制面板调整各种参数：

### 镜头畸变设置

- **水平畸变** - 控制水平方向上的畸变程度（负值为桶形，正值为枕形）
- **垂直畸变** - 控制垂直方向上的畸变程度（负值为桶形，正值为枕形）
- **色差** - 调整RGB通道分离的程度，模拟光学色差

### 相机控制

- **自动旋转相机** - 切换相机自动环绕场景旋转，以便从不同角度观察效果

## 技术原理

镜头畸变效果的工作原理如下：

1. **非线性映射** - 使用数学模型计算像素从畸变位置到原始位置的映射
2. **双向畸变** - 可独立控制水平和垂直方向的畸变参数
3. **色差模拟** - 对RGB三个通道应用略微不同的畸变参数
4. **纹理采样** - 使用计算出的坐标从原始图像采样

## 性能建议

镜头畸变效果是一种相对轻量级的后处理效果，但仍然有一些性能考虑：

1. **适度使用色差** - 较强的色差效果需要更多的纹理采样
2. **考虑整体画面** - 极端的畸变可能会导致图像边缘出现采样问题
3. **与其他效果结合** - 考虑畸变效果在效果链中的位置和顺序

## 集成与使用

要将镜头畸变效果集成到您的Three.js项目中，需要以下步骤：

```javascript
import { EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { LensDistortionEffect } from "realism-effects";

// 创建基本的渲染设置
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// 创建镜头畸变效果
const lensDistortionEffect = new LensDistortionEffect({
    alphax: -0.05,    // 水平畸变（负值为桶形，正值为枕形）
    alphay: -0.05,    // 垂直畸变（负值为桶形，正值为枕形）
    aberration: 0.01  // 色差强度
});

// 将效果添加到合成器
composer.addPass(new EffectPass(camera, lensDistortionEffect));

// 在渲染循环中使用composer.render()代替renderer.render()
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
```

## 适用场景

镜头畸变效果适用于以下场景：

- **摄影/电影仿真** - 模拟真实摄影机镜头的特性
- **艺术风格渲染** - 创造特定的视觉风格和氛围
- **VR/AR应用** - 补偿头显光学系统的畸变或增强沉浸感
- **复古/怀旧风格** - 模拟老式相机或胶片的特点
- **梦幻/超现实场景** - 创造扭曲变形的视觉效果 