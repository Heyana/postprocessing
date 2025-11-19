---
layout: single
collection: sections
title: 基于图层的泛光效果
draft: false
menu:
  demos:
    parent: utility
    weight: 39
script: layer-based-glow
---

# 基于图层的泛光效果

该示例展示基于 Selection 系统的选择性泛光效果，类似于 GlowMTU 的实现方式。通过 Selection 来管理需要发光的物体，然后只对选中的物体应用泛光效果，实现高效的选择性发光。支持点击物体来切换选择状态。

## 工作原理

1. **Selection 选择**：使用 Selection 系统来管理要发光的物体
2. **单独渲染**：只渲染选中物体到独立的渲染目标（通过图层系统）
3. **泛光处理**：对选中的物体应用 UnrealBloomPass 算法（高通滤波 + 可分离高斯模糊）
4. **混合叠加**：将泛光结果与原始场景混合

## 使用方法

```javascript
import { LayerBasedGlowEffect, EffectComposer, RenderPass, EffectPass } from "postprocessing";

// 创建效果
const glowEffect = new LayerBasedGlowEffect(scene, camera, {
  strength: 1.5,        // 泛光强度
  radius: 0.4,          // 泛光半径
  threshold: 0.85,      // 亮度阈值
  useHighPass: true     // 是否使用高通滤波
});

// 将物体添加到选择中
glowEffect.selection.add(glowObject);

// 或者点击切换选择
glowEffect.selection.toggle(glowObject);

// 添加到后处理管线
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera, glowEffect));
```

## 可调参数

- **strength**：泛光强度，控制泛光的整体亮度
- **radius**：泛光半径，影响模糊范围和权重插值
- **threshold**：亮度阈值，只有超过此亮度的区域才会产生泛光
- **smoothWidth**：阈值平滑宽度，控制阈值过渡的平滑程度
- **useHighPass**：是否使用高通滤波，关闭后会对选中区域直接应用模糊
- **bloomColor**：泛光颜色，可以调整泛光的色调
- **intensity**：强度微调，用于最终输出的精细调整

## 与深度比较方案的对比

| 特性 | Selection 方案（LayerBasedGlowEffect） | 深度比较方案（SelectiveUnrealBloomEffect） |
|------|--------------------------------|------------------------------------------|
| 选择方式 | Selection 系统（基于图层） | 深度纹理比较 |
| 精度 | 对象级别 | 像素级别 |
| 性能 | 较高（只渲染指定图层） | 较低（需要两次深度渲染） |
| 适用场景 | 简单场景，对象级选择 | 复杂场景，精确像素级选择 |
| 实现复杂度 | 简单 | 复杂 |
| 交互性 | 支持点击切换选择 | 需要手动管理选择 |

## 交互功能

- **点击切换**：点击场景中的物体可以切换其泛光状态（添加/移除选择）
- 使用 `effect.selection.add(object)` 添加物体到选择
- 使用 `effect.selection.toggle(object)` 切换物体的选择状态
- 使用 `effect.selection.delete(object)` 从选择中移除物体

## 注意事项

- Selection 系统会自动管理图层，无需手动设置 `object.layers`
- 建议使用黑色或深色背景以获得更好的泛光效果
- 对于移动设备，可以降低 nMips 数量以提高性能
- 点击物体时，使用 Raycaster 进行射线检测，确保物体可以被点击

