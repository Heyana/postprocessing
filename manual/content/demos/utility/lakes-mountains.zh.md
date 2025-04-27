---
layout: single
collection: sections
title: 天空和雾气效果
draft: false
menu:
  demos:
    parent: utility
    weight: 38
script: lakes-mountains
---

# 天空和雾气效果

天空和雾气效果提供了一个逼真的程序化天空和雾气系统。这个效果修改自"Lakes and mountains"着色器，移除了山脉和湖泊部分，仅保留天空和云层效果。该效果支持相机旋转，天空会跟随相机视角变化，提供更加沉浸式的体验。效果包含了高度可定制的雾系统，可以调整雾的颜色、密度、衰减速度和最小距离。最新版本还支持体积雾渲染，为场景提供更加逼真的大气效果。

## 特点

- **程序化云层**：使用分形噪声自动生成真实的云层效果
- **相机跟随**：天空会随着相机的旋转而变化，提供沉浸式体验
- **高级雾气效果**：支持自定义雾颜色、密度、衰减速度和最小距离
- **体积雾渲染**：支持基于射线行进的体积雾渲染，可创建更加真实的大气散射效果
- **灵活的质量设置**：可调整质量参数以平衡性能和视觉效果
- **深度整合**：可与场景深度融合，实现更好的场景过渡效果

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
  enableClouds: true,        // 启用云
  enableVolumeFog: false,    // 启用体积雾
  volumeDetail: 0.6,         // 体积雾细节程度
  volumeSteps: 0.5,          // 体积雾采样步数
  camera: camera,            // 相机对象
  noiseTexture: noiseTexture // 噪声纹理
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
- **enableClouds**：是否启用云层效果
- **enableVolumeFog**：是否启用体积雾效果
- **volumeDetail**：体积雾细节程度，控制体积雾的精细度（0-1）
- **volumeSteps**：体积雾采样步数，控制体积雾计算中的射线采样数量（0-1）
- **camera**：相机对象，用于获取视图矩阵和位置信息
- **noiseTexture**：噪声纹理，用于体积雾和云层生成 