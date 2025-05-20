---
layout: single
collection: sections
title: 假室内材质
draft: false
menu:
  demos:
    parent: materials
    weight: 15
script: fake-interior-material
---

# 假室内材质

假室内材质使用Interior Mapping技术在不需要实际建模的情况下，为3D建筑物创建逼真的内部空间视觉效果。这种技术利用射线与平面相交算法，根据视角动态计算可见的墙壁、地板和天花板，从而创造出建筑物内部有单个房间的错觉。

## 特点

- 不需要实际建模内部结构，节省大量几何体和内存
- 支持自定义房间尺寸
- 可为每个内部面（墙壁、地板、天花板）定制颜色
- 使用单一布局纹理实现六个面的不同纹理
- 实现单个房间的真实感效果
- 与场景光照完全兼容
- 性能开销低，适合大规模城市场景

## 使用方法

```javascript
import { FakeInteriorMaterial } from "postprocessing";
import { Mesh, BoxGeometry, TextureLoader, RepeatWrapping } from "three";

// 加载布局纹理
const textureLoader = new TextureLoader();
const layoutTexture = textureLoader.load("path/to/room_layout.jpg", (texture) => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
});

// 创建材质实例
const interiorMaterial = new FakeInteriorMaterial({
    roomSizeX: 1.2,      // 房间X轴尺寸
    roomSizeY: 0.8,      // 房间Y轴尺寸
    roomSizeZ: 1.5,      // 房间Z轴尺寸
    ceilingColor: 0x6BD8A5,  // 天花板颜色
    floorColor: 0xFFAB8C,    // 地板颜色
    rightWallColor: 0xFFE57D  // 右墙颜色
    // ... 其他墙面颜色
});

// 设置布局纹理
interiorMaterial.wallTexture = layoutTexture;

// 创建建筑物几何体
const buildingGeometry = new BoxGeometry(10, 15, 8);
const building = new Mesh(buildingGeometry, interiorMaterial);

// 添加到场景
scene.add(building);

// 在动画循环中更新材质
function animate(deltaTime) {
    // 更新材质，传入时间差和相机位置
    interiorMaterial.update(deltaTime, camera.position);
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
```

## 参数

| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| roomSizeX | Number | 0.8 | 房间X轴尺寸 |
| roomSizeY | Number | 0.6 | 房间Y轴尺寸 |
| roomSizeZ | Number | 1.0 | 房间Z轴尺寸 |
| ceilingColor | Color/Hex | 0x6BD8A5 | 天花板颜色 |
| floorColor | Color/Hex | 0xFFAB8C | 地板颜色 |
| rightWallColor | Color/Hex | 0xFFE57D | 右墙颜色 |
| leftWallColor | Color/Hex | 0xFFC580 | 左墙颜色 |
| frontWallColor | Color/Hex | 0x80C7FF | 前墙颜色 |
| backWallColor | Color/Hex | 0x968EEB | 后墙颜色 |
| useLayoutTexture | Boolean | true | 是否使用布局纹理 (默认开启) |

## 布局纹理说明

材质使用一个包含所有墙面的单一纹理图片，布局如下：

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

此布局中的面位置对应关系：
- +Y: 天花板
- -Y: 地板
- +X: 右墙
- -X: 左墙
- +Z: 前墙
- -Z: 后墙

只需要准备一张按照上述布局的纹理图片，材质会自动将不同区域映射到相应的房间内壁上。

## 工作原理

假室内材质基于Interior Mapping技术，其核心原理是：

1. 从摄像机到物体表面发射射线
2. 计算射线与房间内虚拟平面（墙壁、地板、天花板）的交点
3. 选择最近的交点确定可见的墙面
4. 根据交点位置计算纹理坐标，并从布局纹理的对应区域采样
5. 使用相应的颜色和纹理渲染该墙面

这种技术通过高效的立方体映射方法创建单个连续的内部空间，在视角改变时能够产生非常逼真的3D效果，让人感觉建筑物确实有内部空间。

## 性能注意事项

- 布局纹理的分辨率会影响视觉质量，建议使用足够高分辨率的纹理
- 对于远处的建筑物，可以降低更新频率或使用更简单的材质
- 通过调整房间尺寸参数可以创造不同类型的建筑内部效果
- 墙面颜色会与纹理颜色相乘，可以通过调整墙面颜色来改变整体色调

## 应用场景

- 城市模拟
- 建筑可视化
- 游戏环境
- 虚拟现实场景

## 示例

查看[假室内材质演示](/demos/materials/fake-interior)以了解完整的实现效果。 