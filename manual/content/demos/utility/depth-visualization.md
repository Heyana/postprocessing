---
layout: single
collection: sections
title: 深度图可视化
draft: false
menu:
  demos:
    parent: utility
    weight: 38
script: depth-visualization
---

# 深度图可视化与深度对比

本演示展示了 SelectiveAOEffect 中使用的两个深度图及其比较过程，通过可视化这些中间纹理，帮助你理解选择性环境光遮蔽效果的工作原理。

## 什么是深度图？

深度图是存储每个像素到相机距离的灰度图像，白色表示远处，黑色表示近处。在后处理效果中，深度图通常用于：

- 检测物体边缘和轮廓
- 计算空间关系和遮挡
- 应用深度相关的视觉效果
- 在特定区域选择性应用效果

## SelectiveAOEffect 中的两个深度图

在 SelectiveAOEffect 中，使用了两个关键的深度图：

1. **全局深度图 (depthBuffer0)**：
   - 包含整个场景的所有可见对象
   - 由 EffectComposer 的标准深度通道生成
   - 提供完整的场景深度信息

2. **选定层深度图 (depthBuffer1)**：
   - 仅包含特定层上的对象
   - 通过设置相机的 `layers` 属性并单独渲染生成
   - 允许我们标识特定对象的位置

## 深度对比机制

SelectiveAOEffect 通过比较这两个深度图来创建遮罩：

1. 当两个深度图在某像素处深度相等时，表明该像素属于选定层的对象
2. 深度不相等的区域表示该像素不属于选定层的对象
3. 根据 `depthMode` 设置（默认 `EqualDepth`），确定哪些区域应用 AO 效果

这一巧妙的机制允许环境光遮蔽效果只应用于特定对象，而不影响其他对象。

## 演示内容

本演示提供了多种不同的可视化模式：

- **全局深度图**：显示整个场景的深度
- **选定层深度图**：仅显示选定层对象的深度
- **遮罩可视化**：显示由深度比较产生的二值遮罩
- **深度差异**：显示两个深度图之间的差异
- **彩色深度图**：使用彩色渐变增强深度可视化效果
- **分屏对比**：并排比较两个深度图
- **三合一可视化**：同时显示两个深度图和遮罩纹理

## 操作指南

在控制面板中，你可以：

1. **选择可视化模式**：切换不同的显示方式，观察深度图和遮罩
2. **选择对象层**：指定要单独渲染的对象层，观察深度图的变化
3. **旋转场景**：从不同角度观察深度变化
4. **查看说明**：获取有关深度图工作原理的额外信息

## 技术原理

### 深度图的获取

1. **全局深度图**：
   ```javascript
   const composerDepthTexture = composer.depthTexture;
   ```

2. **选定层深度图**：
   ```javascript
   // 设置相机只渲染特定层
   this.camera.layers.set(selection.layer);
   
   // 渲染深度
   this.depthPass.render(renderer, inputBuffer);
   ```

### 深度比较

在 `depth-mask.frag` 着色器中：

```glsl
// 从两个深度图获取深度值
float depth0 = texture2D(depthBuffer0, vUv).r;
float depth1 = texture2D(depthBuffer1, vUv).r;

// 线性化深度以便比较
float linearDepth0 = linearizeDepth(depth0);
float linearDepth1 = linearizeDepth(depth1);

// 进行深度测试（例如，相等测试）
bool keep = (abs(linearDepth0 - linearDepth1) <= DEPTH_EPSILON);

// 根据测试结果生成遮罩
gl_FragColor = keep ? texture2D(inputBuffer, vUv) : vec4(0.0);
```

## 观察要点

当你使用此演示时，请注意：

1. 当你切换选定层时，深度图1会发生显著变化，只显示该层上的对象
2. 遮罩纹理中，白色区域表示深度测试通过的区域，黑色区域表示测试失败的区域
3. 深度差异模式可以清晰显示两个深度图的不同之处
4. 最终的环境光遮蔽效果只应用于遮罩指示的特定区域

通过这个演示，你可以直观地理解 SelectiveAOEffect 如何通过深度比较实现选择性效果应用，这一技术可以应用于许多其他后处理效果中。 