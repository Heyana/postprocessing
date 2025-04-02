---
layout: single
collection: sections
title: Motion Blur
draft: false
menu:
  demos:
    parent: special-effects
    weight: 35
script: motion-blur
---

# 运动模糊效果 (Motion Blur)

运动模糊是一种模拟真实相机曝光时间内物体运动产生的模糊效果的后处理技术。它能够增强动画和场景的流畅感，提高运动物体的真实感，使画面更加自然。

## 主要特性

- **基于速度的模糊** - 根据物体移动速度自动调整模糊强度
- **可调节采样数** - 通过增加采样提高模糊质量
- **抖动采样** - 使用随机抖动减少采样瑕疵
- **自定义强度** - 精确控制全局模糊效果强度
- **性能优化** - 针对实时应用进行了优化，保持高帧率

## 操作指南

本演示展示了运动模糊效果在动态3D场景中的应用。您可以通过控制面板调整各种参数：

### 运动模糊设置

- **模糊强度** - 控制整体模糊效果的强度
- **抖动程度** - 调整采样抖动量，提高质量减少瑕疵
- **采样数量** - 选择不同采样级别，平衡质量和性能

### 动画控制

- **动画速度** - 调整场景中物体运动的速度
- **暂停动画** - 暂停所有动画以比较效果

### 相机控制

- **自动旋转相机** - 切换相机自动环绕场景旋转

## 技术原理

运动模糊效果的工作原理如下：

1. **速度缓冲** - 通过VelocityPass生成场景中每个像素的速度信息
2. **历史采样** - 在当前帧和前几帧之间采样运动轨迹
3. **向量模糊** - 沿运动方向在多个点进行采样
4. **蓝噪声抖动** - 使用蓝噪声纹理改善采样分布
5. **合成** - 将所有采样合并成最终的模糊效果

## 性能建议

运动模糊效果可能对性能有一定影响，以下是一些优化建议：

1. **降低采样数** - 在性能要求高的场景使用较少的采样数
2. **选择性应用** - 只在快速运动的场景开启运动模糊
3. **调整强度** - 使用较低的模糊强度减少计算量
4. **降低分辨率** - 考虑在较低分辨率下应用模糊效果

## 集成与使用

要将运动模糊效果集成到您的Three.js项目中，需要以下步骤：

```javascript
import { EffectComposer, EffectPass, RenderPass, MotionBlurEffect, VelocityPass } from "postprocessing";

// 创建基本的渲染设置
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// 添加速度通道（必需）
const velocityPass = new VelocityPass(scene, camera);
composer.addPass(velocityPass);

// 创建运动模糊效果
const motionBlurEffect = new MotionBlurEffect(velocityPass, {
    intensity: 1.0,  // 模糊强度
    jitter: 1.0,     // 抖动程度
    samples: 16      // 采样数
});

// 将效果添加到合成器
composer.addPass(new EffectPass(camera, motionBlurEffect));

// 在渲染循环中使用composer.render()代替renderer.render()
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
```

## 适用场景

运动模糊效果适用于以下场景：

- **快速动作游戏** - 增强速度感和流畅度
- **相机快速移动** - 减少快速转场时的视觉跳跃感
- **旋转和飞行模拟** - 提高高速运动的真实感
- **电影风格渲染** - 模拟真实摄影机的曝光效果 