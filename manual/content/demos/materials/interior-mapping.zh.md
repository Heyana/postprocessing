---
layout: single
collection: sections
title: 室内映射材质
draft: false
menu:
  demos:
    parent: materials
    weight: 12
script: interior-mapping-material
---

# 室内映射材质

室内映射材质使您能够在简单的几何体表面上创建逼真的3D室内空间错觉，非常适合用于建筑物窗户、城市场景和游戏环境。这种技术不需要实际建模每个房间内部，从而大大减少了几何复杂度和渲染成本。

## 特点

- 使用立方体贴图模拟房间内部空间
- 支持对象空间和切线空间两种模式
- 通过伪随机函数创建多样化的房间外观
- 高效的光线追踪算法实现真实的透视感
- 可自定义房间尺寸和变化程度
- 支持填满面模式，使每个面只显示一个房间，适合长方形窗户
- **全角度渲染支持**：优化的算法确保从任何角度（包括侧面）观察都能获得正确的室内效果

## 原理

室内映射技术使用简化的光线追踪算法在平面表面上创建3D空间的错觉。当观察者从不同角度查看表面时，算法会计算视线与虚拟房间内部的相交点，然后从立方体贴图中采样相应的颜色。

## 演示效果

在我们的演示中，您可以看到一个单独的平面，通过室内映射材质创建出逼真的内部空间效果。平面默认会自动旋转，以便您能从不同角度（包括正面和侧面）观察内部空间效果。优化的算法确保了即使在平面高度倾斜或从侧面观察时，内部空间效果也能正确显示，不会出现失真或消失的情况。

您可以通过调整控制面板中的参数，特别是房间深度和房间纵横比，来优化不同角度下的观察效果。较大的房间深度值可以在侧面观察时提供更明显的深度感。

## 使用方法

```javascript
import { InteriorMappingMaterial } from "postprocessing";
import { Mesh, PlaneGeometry, CubeTextureLoader } from "three";

// 加载房间立方体贴图
const cubeTextureLoader = new CubeTextureLoader();
const roomCube = cubeTextureLoader.setPath("textures/cubemaps/room/")
  .load(["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"]);

// 创建材质实例
const interiorMaterial = new InteriorMappingMaterial({
  useObjectSpace: false, // 使用切线空间（默认）
  roomScale: 1.0,        // 房间尺寸缩放
  roomVariety: 0.5,      // 房间随机变化程度
  fillFace: true,        // 是否让房间填满整个面
  roomDepth: 1.5,        // 房间深度
  roomAspect: 1.0        // 房间纵横比
});

// 设置立方体贴图
interiorMaterial.roomCube = roomCube;

// 创建平面网格
const planeGeometry = new PlaneGeometry(10, 10);
planeGeometry.computeTangents(); // 重要！需要切线数据
const plane = new Mesh(planeGeometry, interiorMaterial);

// 添加到场景
scene.add(plane);

// 在动画循环中更新
function animate(deltaTime) {
  // 更新模型矩阵
  plane.updateMatrixWorld();
  
  // 更新材质
  interiorMaterial.update(deltaTime);
  
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

## 参数

| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| useObjectSpace | Boolean | false | 是否使用对象空间坐标（false为切线空间） |
| roomScale | Number | 1.0 | 房间尺寸缩放因子 |
| roomVariety | Number | 0.5 | 房间随机变化程度 (0-1) |
| fillFace | Boolean | false | 是否让房间填满整个面，每个面只有一个房间 |
| roomDepth | Number | 1.2 | 房间深度，控制视线深入房间的距离（fillFace模式下更明显） |
| roomAspect | Number | 1.0 | 房间纵横比，控制fillFace模式下房间的宽高比例 |

## 纹理

材质需要一个立方体贴图来表示房间内部：

- **roomCube**: 立方体贴图，表示房间内部的六个面
- **roomMap**: 单张图片立方体贴图，包含六个面的贴图布局

## 渲染模式

材质提供两种主要的渲染模式：

1. **标准模式（fillFace = false）**：将面分割成多个小房间，适合常规的建筑物窗户效果
2. **填满面模式（fillFace = true）**：每个面只有一个大房间，适合长方形窗户或大面积透明墙体

填满面模式特别适用于：
- 大型落地窗
- 现代建筑中的通透玻璃幕墙
- 需要显示完整房间内部的场景

## 技术细节

室内映射技术由Humus（Emil Persson）在2007年首次提出，是一种在游戏和实时渲染中广泛使用的技术。这个材质是该技术在Three.js中的实现，实现了以下核心功能：

1. 在顶点着色器中计算视线方向
2. 在片段着色器中使用光线追踪算法计算与虚拟房间的相交点
3. 使用伪随机函数为每个房间生成不同的外观
4. 支持切线空间和对象空间两种模式以适应不同的建模方式
5. 提供填满面模式，使每个面显示为单个完整的房间

## 性能注意事项

- 对于大型建筑物，使用纹理分辨率较低的立方体贴图可以提高性能
- 这种技术特别适用于远距离观察的建筑物
- 对于需要近距离查看的表面，可以考虑增加roomScale值以获得更好的细节
- 填满面模式的性能略好于标准模式，因为它减少了随机性计算

## 限制

- 该技术只能模拟静态室内空间，不支持动态内容
- 室内深度有限，从极端角度观察可能会发现视觉问题
- 填满面模式在曲面或不规则模型上可能效果不佳

## 应用场景

室内映射材质在以下场景特别有用：

1. **建筑物窗户渲染** - 创建包含无数窗户的城市场景，而无需为每个窗户建模内部
2. **玻璃幕墙效果** - 为现代建筑的大片玻璃幕墙创建内部空间感
3. **单片展示** - 如本演示所示，单个平面也可以实现逼真的3D效果，适用于门户、画框或虚拟窗口等场景
4. **游戏环境** - 在游戏中为背景建筑添加细节而不增加几何复杂度

## 示例

查看[室内映射材质演示](/demos/materials/interior-mapping)以了解完整的实现示例。 