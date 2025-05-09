---
layout: single
collection: sections
title: 海洋材质
draft: false
menu:
  demos:
    parent: materials
    weight: 20
script: ocean-material
---

# 海洋材质

海洋材质提供了逼真的程序化海洋水面效果，无需任何纹理即可生成动态波浪、反射和大气效果。这个材质基于高度优化的算法，可以实现实时渲染高品质水面，适用于各种水体场景。

## 特点

- 完全程序化生成，无需任何纹理
- 逼真的波浪模拟和水面动态变化
- 自动计算反射和折射效果
- 内置大气和天空渲染
- 高度可定制的参数系统
- 优化的性能，支持各种设备

## 使用方法

```javascript
import { OceanMaterial } from "postprocessing";
import { Mesh, PlaneGeometry } from "three";

// 创建海洋网格
const geometry = new PlaneGeometry(100, 100, 64, 64);
const material = new OceanMaterial({
  waterDepth: 1.0,
  dragMult: 0.38,
  cameraHeight: 1.5,
  waterColor: 0x0055ff
});

// 创建网格并添加到场景
const ocean = new Mesh(geometry, material);
scene.add(ocean);

// 在动画循环中更新
function animate(deltaTime) {
  // 更新材质
  material.update(deltaTime, true); // 第二个参数开启太阳动画
  
  // 渲染场景
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

## 参数

| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| waterDepth | Number | 1.0 | 水的深度 |
| dragMult | Number | 0.38 | 波浪拉动水面的强度 |
| cameraHeight | Number | 1.5 | 相机高度 |
| iterationsRaymarch | Number | 12 | 光线行进时的波浪迭代次数 |
| iterationsNormal | Number | 36 | 计算法线时的波浪迭代次数 |
| waterColor | Color/Hex | 0x0055ff | 水体颜色 |
| sunDirection | Vector3 | - | 太阳方向，默认从右上方照射 |

## 工作原理

海洋材质使用程序化生成的方法来创建逼真的水面效果：

1. **波浪叠加**：通过多个波浪函数的加权叠加创建复杂的水面形状
2. **光线追踪**：使用简化的光线追踪技术来模拟水面的光学特性
3. **菲涅尔反射**：根据视角计算水面的反射强度
4. **次表面散射**：模拟光线穿过水体的散射效果
5. **大气渲染**：集成简化但高效的大气渲染，提供天空和太阳效果

## 性能注意事项

- `iterationsRaymarch` 和 `iterationsNormal` 参数对性能影响最大，可根据目标设备调整
- 对于大面积水面，可使用较低的几何体细分
- 在移动设备上，建议降低迭代次数以保持良好性能
- 优化视角和距离设置，远处水面可以使用简化计算

## 示例应用

- 海洋和湖泊场景
- 开放世界游戏中的水体
- 建筑和景观可视化
- VR和AR应用中的水体效果

## 后续开发计划

- 支持水下视角和折射效果
- 添加泡沫和浪花效果
- 实现与物理系统的交互
- 增加水体透明度控制

## 在线演示

查看[完整演示](/demos/materials/ocean-material)以体验海洋材质的效果和可调参数。 