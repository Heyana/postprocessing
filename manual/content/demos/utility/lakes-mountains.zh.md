---
layout: single
collection: sections
title: 雾气效果
draft: false
menu:
  demos:
    parent: utility
    weight: 38
script: lakes-mountains
---

# 雾气效果

雾气效果提供了一个逼真的高度可定制的雾系统，可以调整雾的颜色、密度、衰减速度和最小距离。该效果支持两种雾类型：标准雾和高度雾，可以单独使用或同时启用，创建更加复杂的雾效果。

## 特点

- **高级雾气效果**：支持自定义雾颜色、密度、衰减速度和最小距离
- **高度雾**：可基于高度和噪声生成平滑的雾气效果，在低处显示浓雾，高处清晰
- **静态雾气**：高度雾生成后保持静态，不会随时间变化，提供稳定的视觉效果
- **可定制边缘**：支持调整高度雾的上下边缘平滑过渡距离
- **叠加模式**：可同时启用普通雾和高度雾，创造更丰富的体积感
- **基于噪声的变化**：高度雾可以通过噪声生成自然的起伏变化
- **深度整合**：与场景深度融合，实现更好的场景过渡效果

## 使用示例

```javascript
import { LakesMountainsEffect, Color } from "postprocessing";

// 创建效果，传入相机对象
const effect = new LakesMountainsEffect({
  fogDensity: 0.6,           // 雾密度
  fogColor: new Color(0xaaaacc), // 雾颜色
  fogDecay: 1.0,             // 雾衰减速度
  fogMinDist: 0.1,           // 最小雾距离
  quality: 0.5,              // 渲染质量
  occludeSky: 0.0,           // 雾气遮挡天空的程度
  useHeightFog: true,        // 启用基于高度的雾效果
  combineFog: true,          // 同时使用普通雾和高度雾（叠加显示）
  fogMaxHeight: 50.0,        // 雾的最大高度
  fogMinHeight: -10.0,       // 雾的最小高度
  fogNoiseScale: 0.01,       // 雾的噪声缩放
  fogNoiseStrength: 10.0,    // 雾的噪声强度
  heightFogStrength: 1.0,    // 高度雾的强度
  heightFogDecay: 1.0,       // 高度雾的衰减速度
  heightFogTransition: 5.0,  // 高度雾的过渡距离
  heightFogMinDist: 0.0,     // 高度雾最小距离
  heightFogMaxDist: 4000.0,  // 高度雾最大距离
  camera: camera             // 相机对象
});

// 添加到效果通道
const effectPass = new EffectPass(camera, effect);
composer.addPass(effectPass);
```

## 参数

- **fogDensity**：雾气密度，控制雾气的浓度
- **fogColor**：雾气颜色，可以是Color对象、十六进制值或颜色名称
- **fogDecay**：雾气衰减速度，控制雾气的渐变过渡速率
- **fogMinDist**：雾气最小距离，设置从什么距离开始应用雾效果
- **quality**：质量设置，控制渲染质量（0-低质量，1-高质量）
- **occludeSky**：雾气遮挡天空的程度 (0-1)
- **useHeightFog**：是否启用基于高度的雾效果。开启后，会根据物体高度生成雾，可以保持天空清晰而地面有雾
- **combineFog**：是否同时启用普通雾和高度雾。开启后，两种雾效果会叠加显示，创造更丰富的体积感
- **fogMaxHeight**：雾气最大高度，设置雾气最多能达到的高度，超过此高度不会有雾
- **fogMinHeight**：雾气最小高度，设置雾气最低能达到的高度，低于此高度不会有雾
- **fogNoiseScale**：雾气噪声缩放，控制雾气噪声纹理的密度，值越小噪声越大
- **fogNoiseStrength**：雾气噪声强度，控制噪声对雾高度的影响程度，增加雾气的自然变化
- **heightFogStrength**：高度雾强度，独立控制基于高度的雾气强度，与标准雾的fogDensity分开设置
- **heightFogDecay**：高度雾衰减速度，控制高度雾的衰减方式，值越大雾气边缘越锐利
- **heightFogTransition**：高度雾过渡距离，控制高度雾上下边缘的平滑过渡效果
- **heightFogMinDist**：高度雾最小距离，控制从何处开始应用高度雾效果
- **heightFogMaxDist**：高度雾最大距离，超过此距离不会显示高度雾
- **camera**：相机对象，用于获取视图矩阵和位置信息 