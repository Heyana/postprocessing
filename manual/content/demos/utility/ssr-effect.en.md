---
layout: single
collection: sections
title: SSR Effect
draft: false
menu:
  demos:
    parent: utility
    weight: 36
script: ssr-effect
---

# 屏幕空间反射效果 (SSREffect)

这个示例展示了如何使用新的`SSREffect`类来实现屏幕空间反射。与之前的`ThreeCompatPass`包装方式不同，`SSREffect`是一个原生的postprocessing效果，更容易与其他效果组合使用。

屏幕空间反射(SSR)是一种实时图形技术，可以在不增加太多性能成本的情况下产生逼真的反射效果。SSR通过重用已经在屏幕上渲染的信息来计算反射，而不是通过光线追踪。

## 效果使用方法

与其他postprocessing效果一样，`SSREffect`可以通过`EffectPass`添加到效果合成器中：

```javascript
// 创建SSR效果
const ssrEffect = new SSREffect(scene, camera, {
    thickness: 0.018,           // 反射光线厚度
    maxDistance: 0.1,           // 最大反射距离
    opacity: 0.85,              // 反射不透明度
    fresnel: true,              // 启用菲涅尔效应（角度反射）
    distanceAttenuation: true,  // 启用距离衰减
    bouncing: true,             // 启用多次反射
    infiniteThick: false,       // 禁用无限厚度
    blur: true                  // 启用模糊效果
});

// 添加需要反射的物体
scene.traverse(object => {
    if (object.isMesh && object.material.metalness > 0.5) {
        ssrEffect.selection.add(object);
    }
});

// 创建效果通道并添加到合成器
const ssrPass = new EffectPass(camera, ssrEffect);
composer.addPass(ssrPass);
```

## 与地面反射器结合使用

`SSREffect`可以与`ReflectorForSSRPass`结合使用，提供更真实的地面反射效果：

```javascript
// 创建地面反射器
const geometry = new PlaneGeometry(10, 10);
const groundReflector = new ReflectorForSSRPass(geometry, {
    clipBias: 0.0003,
    textureWidth: window.innerWidth,
    textureHeight: window.innerHeight,
    color: 0xaaaaaa
});
groundReflector.rotation.x = -Math.PI / 2;
scene.add(groundReflector);

// 更新SSR效果以使用地面反射器
ssrEffect.groundReflector = groundReflector;
```

## 使用说明

场景中包含了不同金属度和粗糙度的几何体，以展示SSR效果的差异：
- 金属材质对象：高金属度，低粗糙度，反射效果最强
- 半透明球体：透明度较高，会透过反射效果
- 扭曲几何体：展示复杂曲面上的反射效果

通过右侧的控制面板可以调整SSR的各种参数：
- 启用/禁用SSR效果
- 厚度(Thickness)：控制反射的精度
- 最大距离(Max Distance)：反射效果可以传播的最大距离
- 不透明度(Opacity)：反射的强度
- 菲涅尔(Fresnel)：边缘增强效果
- 距离衰减(Distance Attenuation)：反射随距离衰减
- 多次反射(Bouncing)：允许反射光线在多个表面之间反弹
- 模糊效果(Blur)：平滑反射结果
- 反转Y轴反射：如果反射方向不正确，可尝试反转Y轴

## 技术细节

与旧版的`SSRPass`相比，新的`SSREffect`有以下优势：
1. 更好的集成：可以与其他效果无缝组合
2. 更灵活的API：参数可以动态调整，支持链式调用
3. 更精确的反射：改进了射线追踪算法
4. 更好的性能：优化了渲染管线，减少了不必要的计算

## 故障排除

如果您遇到以下问题：

1. **反射不可见**：确保场景中有足够的光照，并且正确添加了反射物体到selection中
2. **反射方向错误**：尝试使用控制面板中的"反转Y轴反射"选项
3. **边缘伪影**：增加"厚度"参数或启用"模糊效果"
4. **性能问题**：降低"最大距离"值或禁用"多次反射"和"模糊效果" 