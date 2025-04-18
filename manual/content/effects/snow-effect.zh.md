---
layout: single
collection: sections
title: 积雪效果
draft: false
menu:
  effects:
    parent: utility
    weight: 36
---

# 积雪效果

积雪效果由两个可以独立使用或组合使用以创造完整冬季体验的组件组成：`SnowOverlayEffect`（积雪覆盖效果）和`SnowfallEffect`（雪花飘落效果）。

## 表面积雪 (SnowOverlayEffect)

`SnowOverlayEffect`根据场景中表面的方向和高度为其添加一层逼真的雪覆盖。

```javascript
import { SnowOverlayEffect } from "postprocessing";

// 需要深度和法线数据
const depthPass = new DepthPass(scene, camera);
const normalPass = new NormalPass(scene, camera);

const snowOverlayEffect = new SnowOverlayEffect(camera, normalPass.texture, depthPass.texture, {
    snowAmount: 0.5,        // 积雪量，范围0-1
    snowHeight: 20.0,       // 雪线高度
    snowBrightness: 1.5,    // 雪的亮度倍增器
    additiveBlending: false,// 使用加性混合模式
    snowColor: 0xffffff     // 雪的颜色
});

// 将所有通道添加到合成器
composer.addPass(depthPass);
composer.addPass(normalPass);
composer.addPass(new EffectPass(camera, snowOverlayEffect));
```

### 实现细节

积雪覆盖效果通过采样深度缓冲区和法线缓冲区来确定：

1. 哪些表面朝上（使用法线Y分量）
2. 场景中哪些表面更高（使用深度信息）
3. 基于这些因素应该积累多少雪

然后，它根据这些计算将原始场景与雪的颜色混合，创造出遵循物体轮廓的自然积雪外观。

## 雪花飘落 (SnowfallEffect)

`SnowfallEffect`模拟飘落的雪花，创造动态的冬季氛围。

```javascript
import { SnowfallEffect, BlendFunction } from "postprocessing";

const snowfallEffect = new SnowfallEffect({
    blendFunction: BlendFunction.SCREEN, // 屏幕混合模式适合雪花效果
    density: 0.6,                        // 雪花密度 (0-1)
    snowSpeed: 0.2,                      // 下落速度
    snowSize: 0.2,                       // 雪花大小
    windDirection: new Vector2(0.1, 0.0),// 风向 (x,y)
    snowColor: 0xffffff                  // 雪花颜色
});

composer.addPass(new EffectPass(camera, snowfallEffect));
```

### 实现细节

雪花飘落效果使用多层方法：

1. 在不同深度创建多层程序化雪花粒子
2. 基于时间、速度和风向参数对它们进行动画处理
3. 使用噪声纹理实现分布的自然随机性
4. 处理屏幕边缘的平滑环绕，实现无限雪花飘落

每个雪花的位置基于时间进行动画处理，风向影响水平和垂直漂移。多层创造出深度感和视差效果。

## 组合两种效果

对于完整的冬季场景，可以组合这两种效果：

```javascript
// 设置通道
const depthPass = new DepthPass(scene, camera);
const normalPass = new NormalPass(scene, camera);

// 创建表面积雪效果 
const snowOverlayEffect = new SnowOverlayEffect(camera, normalPass.texture, depthPass.texture);

// 创建雪花飘落效果
const snowfallEffect = new SnowfallEffect();

// 将所有通道添加到合成器
composer.addPass(depthPass);
composer.addPass(normalPass);
composer.addPass(new EffectPass(camera, snowOverlayEffect));
composer.addPass(new EffectPass(camera, snowfallEffect));
```

## 性能考虑

- `SnowOverlayEffect`需要深度和法线通道，这些会带来一些渲染开销
- 考虑在低端设备上使用更小分辨率的深度和法线缓冲区
- `SnowfallEffect`通常较轻量，但可以通过降低密度来提高性能
- 对于移动设备，考虑仅使用参数简化的`SnowOverlayEffect`

## 高级技术

- **脚印/交互**：跟踪角色位置以在雪中创建脚印
- **动态积雪**：随着时间增加积雪量以模拟持续降雪
- **雪融化**：添加参数以模拟某些区域的雪融化（靠近热源）
- **阵风**：对风向参数进行动画处理以在雪花飘落中创造阵风效果 