---
layout: single
collection: sections
title: 切线空间室内映射材质
draft: false
menu:
  demos:
    parent: materials
    weight: 25
script: tangent-space-interior-material
---

# 切线空间室内映射材质

切线空间室内映射材质是一种专为曲面上的室内效果优化的材质，能在球体、环面、立方体等各类模型上实现逼真的室内映射效果。这种材质使用切线空间进行光线追踪计算，并优化了深度处理机制，提供更好的视觉立体感。

## 特点

- 在曲面上表现良好，尤其适合球体、环面等非平面物体
- 对于立方体等棱角分明的模型也有很好的效果
- 基于切线空间的光线追踪实现
- 优化的深度处理算法
- 支持多房间布局和随机变化
- 与场景光照完全兼容
- 可调整的玻璃反射效果

## 使用方法

```javascript
import { TangentSpaceInteriorMaterial } from "postprocessing";
import { Mesh, SphereGeometry, BoxGeometry, TextureLoader, CubeTextureLoader } from "three";

// 创建几何体 - 选择一种
const sphereGeometry = new SphereGeometry(5, 32, 32);
// 或者创建立方体
const cubeGeometry = new BoxGeometry(5, 5, 5, 10, 10, 10);

// 重要：计算切线，确保切线空间正常工作
sphereGeometry.computeTangents(); // 或 cubeGeometry.computeTangents();

// 加载纹理
const textureLoader = new TextureLoader();
const cubeTextureLoader = new CubeTextureLoader();

// 单张图片纹理 (可选)
const roomMap = textureLoader.load("path/to/room_map.png");

// 立方体贴图 (可选)
const roomCube = cubeTextureLoader.load([
    "px.png", "nx.png", 
    "py.png", "ny.png", 
    "pz.png", "nz.png"
]);

// 创建材质
const material = new TangentSpaceInteriorMaterial({
    roomScale: 1.0,
    roomDepth: 0.5,  // 0.5是标准深度，<0.5更深，>0.5更浅
    roomVariety: 0.8,
    roomsX: 2,
    roomsY: 3,
    gapSize: 0.05,
    gapColor: 0x222222,
    glassStrength: 0.3,
    glassColor: 0xAADDFF
});

// 设置纹理 - 选择其中一种
material.roomMap = roomMap;  // 或
material.roomCube = roomCube;

// 创建网格
const mesh = new Mesh(sphereGeometry, material); // 或使用cubeGeometry
scene.add(mesh);

// 更新函数 - 在渲染循环中调用
function animate(deltaTime) {
    material.update(deltaTime);
}
```

## 参数

| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| roomScale | Number | 1.0 | 房间尺寸缩放因子 |
| roomDepth | Number | 0.5 | 房间深度 (0.5是标准深度，<0.5更深，>0.5更浅) |
| roomVariety | Number | 0.5 | 房间随机变化程度 (0-1) |
| roomsX | Number | 1 | 横向房间数量 |
| roomsY | Number | 1 | 纵向房间数量 |
| gapSize | Number | 0.05 | 房间间隔大小 |
| gapColor | Color/Hex | 0x000000 | 房间间隔颜色 |
| glassStrength | Number | 0.25 | 前景玻璃反射强度 (0-1) |
| glassColor | Color/Hex | 0x88CCFF | 前景玻璃颜色 |
| flipTextureY | Boolean | true | 是否在着色器中翻转贴图Y轴 |

## 深度控制

切线空间室内映射材质使用了一种特殊的深度映射算法，用户可以通过`roomDepth`参数精确控制深度感：

- **roomDepth = 0.5**: 标准深度，推荐的起始值
- **roomDepth < 0.5**: 深度增加，房间看起来更深
- **roomDepth > 0.5**: 深度减少，房间看起来更浅
- **roomDepth接近1.0**: 会导致房间空间消失，应避免
- **roomDepth接近0.0**: 会导致无限深度，性能可能受影响

## 纹理支持

材质支持两种纹理模式：

1. **立方体贴图(roomCube)**: 使用标准的立方体贴图，六个面分别用不同图像
2. **单张图片贴图(roomMap)**: 使用包含所有六个面的单一图像，布局为:
   ```
   +-----+-----+-----+-----+
   |     |  +Y |     |     |
   |     |     |     |     |
   +-----+-----+-----+-----+
   | -X  |  +Z |  +X | -Z  |
   |     |     |     |     |
   +-----+-----+-----+-----+
   |     |  -Y |     |     |
   |     |     |     |     |
   +-----+-----+-----+-----+
   ```

## 重要注意事项

- 所有使用此材质的几何体必须计算切线属性，使用`geometry.computeTangents()`
- 材质的更新方法应在每帧中调用，以支持可能的动画效果
- 如果同时提供了roomCube和roomMap，材质会优先使用roomCube

## 示例与演示

当前页面展示的演示包含了四种几何体：平面、球体、环面和立方体，展示了切线空间室内映射材质在不同形状模型上的表现。通过演示控制面板，您可以调整各种参数，直观感受它们对效果的影响。

请注意观察在球体和环面等曲面上，以及在立方体的各个面上，室内映射效果如何自然地跟随模型形状变化，这是切线空间计算的关键优势。