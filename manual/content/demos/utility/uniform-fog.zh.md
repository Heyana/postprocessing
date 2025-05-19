---
layout: single
collection: sections
title: 均匀雾效果
draft: false
menu:
  demos:
    parent: utility
    weight: 39
script: uniform-fog
---

# 均匀雾效果

均匀雾效果提供了一种距离无关的雾效果，雾的浓度在视距范围内保持相对均匀，不会随着距离增加而明显变浓。这种效果特别适合模拟雨天、雾天等场景，可以创造出更加真实的氛围感。

## 特点

- **均匀分布**：雾的浓度在视距范围内保持相对均匀，不会随着距离增加而明显变浓
- **分段控制**：支持将视距分成多个区间，每个区间可以有不同的雾浓度
- **可定制颜色**：支持自定义雾的颜色，可以模拟不同天气条件下的雾效果
- **天空控制**：可以控制雾对天空的遮挡程度
- **质量调节**：支持调整渲染质量，在性能和效果之间取得平衡
- **深度整合**：与场景深度融合，实现更好的场景过渡效果

## 使用示例

```javascript
import { UniformFogEffect, Color } from "postprocessing";

// 创建效果，传入相机对象
const effect = new UniformFogEffect({
    fogDensity: 0.5,           // 雾密度
    fogColor: new Color(0xaaaacc), // 雾颜色
    fogMinDist: 0.1,           // 最小雾距离
    quality: 0.5,              // 渲染质量
    occludeSky: 0.0,           // 雾气遮挡天空的程度
    segments: 3,               // 雾的分段数
    camera: camera             // 相机对象
});

// 添加到效果通道
const effectPass = new EffectPass(camera, effect);
composer.addPass(effectPass);
```

## 参数

- **fogDensity**：雾气密度，控制雾气的浓度
- **fogColor**：雾气颜色，可以是Color对象、十六进制值或颜色名称
- **fogMinDist**：雾气最小距离，设置从什么距离开始应用雾效果
- **quality**：质量设置，控制渲染质量（0-低质量，1-高质量）
- **occludeSky**：雾气遮挡天空的程度 (0-1)
- **segments**：雾的分段数，控制视距区间的划分，值越大雾的过渡越细腻
- **camera**：相机对象，用于获取视图矩阵和位置信息 