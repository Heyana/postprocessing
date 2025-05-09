---
layout: single
collection: sections
title: 河流材质
draft: false
menu:
  demos:
    parent: materials
    weight: 10
script: river-material
---

# 河流材质

河流材质提供了逼真的流动水面效果，适用于创建河流、湖泊、海洋等水体表面。这个材质基于Shadertoy的"Where the River Goes"效果改编，支持动态流向、法线映射、泡沫效果和光照交互，可以轻松集成到任何Three.js场景中。
## 特点

- 逼真的水体流动效果
- 动态水面波纹和扰动
- 基于流速的自动泡沫生成
- 真实的光照反射和折射模拟
- 支持自定义纹理映射
- 性能优化设计，适合大型水面

## 使用方法

```javascript
import { RiverMaterial } from "postprocessing";
import { Mesh, PlaneGeometry, TextureLoader, RepeatWrapping } from "three";

// 加载所需纹理
const textureLoader = new TextureLoader();
const normalMap = textureLoader.load("path/to/normal-map.jpg");
normalMap.wrapS = normalMap.wrapT = RepeatWrapping;

// 创建材质实例
const riverMaterial = new RiverMaterial({
  flowSpeed: 0.5,
  waterColor: 0x0055ff,
  transparency: 0.8,
  foamIntensity: 0.5,
  waterDepth: 0.5,
  wavesHeight: 0.1
});

// 设置纹理
riverMaterial.normalMap = normalMap;

// 创建河流网格
const riverGeometry = new PlaneGeometry(10, 5, 50, 25);
const river = new Mesh(riverGeometry, riverMaterial);
river.rotation.x = -Math.PI / 2; // 水平放置

// 添加到场景
scene.add(river);

// 在动画循环中更新
function animate(deltaTime) {
  riverMaterial.update(deltaTime);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

## 参数

| 参数名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| flowSpeed | Number | 0.5 | 水流速度 |
| waterColor | Color/Hex | 0x0055ff | 水体颜色 |
| transparency | Number | 0.8 | 水体透明度 |
| foamIntensity | Number | 0.5 | 泡沫生成强度 |
| waterDepth | Number | 0.5 | 水深，影响颜色和透明度 |
| wavesHeight | Number | 0.2 | 水面波浪高度 |

## 材质属性

河流材质提供了以下可设置的属性:

### 纹理

- **normalMap**: 水面法线贴图，用于增强水面细节
- **flowMap**: 水流方向贴图，控制水流的复杂流向
- **foamMap**: 泡沫贴图，用于自定义泡沫效果

### 方法

- **update(deltaTime)**: 更新材质动画，应在渲染循环中调用

## 实现原理

该材质结合了多种技术来实现逼真的水流效果：

1. **程序化噪声**: 使用分形布朗运动(FBM)生成自然的水面变化
2. **梯度扰动**: 通过梯度计算实现水流对水面形状的影响
3. **双时间采样**: 使用时间偏移的两个采样点平滑过渡，避免循环跳变
4. **菲涅尔反射**: 根据视角计算水面反射率，实现更真实的水面反射
5. **流体力学模拟**: 模拟水流对地形的响应和障碍物周围的流动模式

## 性能注意事项

- 对于大型水面，建议降低几何体细分度
- 在移动设备上，考虑禁用泡沫效果或减少波浪细节
- 对于远距离视角，可以使用较低分辨率的纹理或降低更新频率

## 示例

查看[河流材质演示](/demos/materials/river-material)以了解完整的实现和效果。

## 未来改进

- 支持水下扭曲和折射效果
- 添加交互式水面涟漪
- 支持动态水位变化
- 更丰富的河床地形交互 