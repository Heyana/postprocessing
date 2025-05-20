---
layout: single
collection: sections
title: 流动河流材质
draft: false
menu:
  demos:
    parent: materials
    weight: 20
script: flow-river-material
---

# 流动河流材质

流动河流材质提供了基于分形噪声的动态水面效果，适用于创建河流、溪流等水体表面。这个材质支持动态波浪、光照交互和可调节的流动效果。

## 特点

- 基于分形噪声的动态波浪效果
- 可调节的流动速度和方向
- 可自定义水颜色和透明度
- 动态光照和反射效果
- 性能优化设计

## 使用方法

```javascript
import { FlowRiverMaterial } from "postprocessing";
import { Mesh, PlaneGeometry } from "three";

// 创建河流平面
const geometry = new PlaneGeometry(10, 5, 50, 25);
const material = new FlowRiverMaterial({
    flowSpeed: 0.5,
    waterColor: 0x0055ff,
    transparency: 0.8,
    waveHeight: 0.2,
    waveScale: 1.0,
    waveSpeed: 1.0
});

const river = new Mesh(geometry, material);
river.rotation.x = -Math.PI / 2; // 水平放置
scene.add(river);

// 在动画循环中更新
function animate(deltaTime) {
    river.material.update(deltaTime);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
```

## 参数

| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| flowSpeed | Number | 0.5 | 流动速度 |
| waterColor | Color/Hex | 0x0055ff | 水的颜色 |
| transparency | Number | 0.8 | 透明度 |
| waveHeight | Number | 0.2 | 波浪高度 |
| waveScale | Number | 1.0 | 波浪缩放 |
| waveSpeed | Number | 1.0 | 波浪速度 |

## 技术细节

### 波浪生成

材质使用多层正弦波叠加来生成复杂的波浪效果：

1. 主要波浪：大尺度的基础波动
2. 次要波浪：中等尺度的细节波动
3. 细节波浪：小尺度的表面细节

每一层波浪都包含随机偏移，以创造更自然的效果。

### 光照计算

材质实现了以下光照效果：

1. 漫反射：基于法线和光照方向的点积计算
2. 镜面反射：基于视角和反射方向的点积计算
3. 环境光：提供基础照明

### 性能优化

1. 使用分形布朗运动(FBM)优化噪声计算
2. 可调节的迭代次数
3. 优化的法线计算

## 示例

查看[流动河流材质演示](/demos/materials/flow-river-material)以了解完整的实现示例。

## 性能注意事项

- 对于大型水面，建议减少几何体细分程度
- 可以通过调整waveScale和waveHeight来平衡效果和性能
- 在移动设备上，考虑使用较低的迭代次数 