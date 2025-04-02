# Realism Effects 后处理效果库

Realism Effects 是一个基于 Three.js 和 postprocessing 库的高级后处理效果集合，旨在提升 3D 渲染的真实感和视觉质量。它提供了多种现代图形技术来模拟真实世界的光照、反射和相机效果。

## 目录

1. [主要效果](#主要效果)
   - [SSGI (屏幕空间全局光照)](#ssgi-屏幕空间全局光照)
   - [SSR (屏幕空间反射)](#ssr-屏幕空间反射)
   - [TRAA (时间重构抗锯齿)](#traa-时间重构抗锯齿)
   - [TAA (时间抗锯齿)](#taa-时间抗锯齿)
   - [MotionBlur (动态模糊)](#motionblur-动态模糊)
   - [HBAO (基于地平线的环境光遮蔽)](#hbao-基于地平线的环境光遮蔽)
   - [Sharpness (锐化)](#sharpness-锐化)
   - [LensDistortion (镜头畸变)](#lensdistortion-镜头畸变)
   - [GradualBackground (渐变背景)](#gradualbackground-渐变背景)
   - [Sparkle (闪光效果)](#sparkle-闪光效果)
2. [核心组件](#核心组件)
   - [Denoiser (降噪器)](#denoiser-降噪器)
   - [TemporalReproject (时间重投影)](#temporalreproject-时间重投影)
   - [GBuffer (几何缓冲区)](#gbuffer-几何缓冲区)
3. [辅助组件](#辅助组件)
   - [VelocityPass (速度通道)](#velocitypass-速度通道)
   - [VelocityDepthNormalPass (速度深度法线通道)](#velocitydepthnormalpass-速度深度法线通道)
   - [PoissonDenoisePass (泊松降噪通道)](#poissondenoisepass-泊松降噪通道)
4. [常见问题与优化](#常见问题与优化)
5. [使用示例](#使用示例)

## 主要效果

### SSGI (屏幕空间全局光照)

**文件**: `src/libs/realism-effects/src/ssgi/SSGIEffect.js`

**描述**: 屏幕空间全局光照是一种模拟光线在场景中多次反弹的技术，可以显著提高渲染的真实感。它通过在屏幕空间中追踪光线，计算间接光照和反射，为场景增添更真实的照明效果。

**主要参数**:
- `distance`: 光线可以传播的最大距离
- `thickness`: 用于二分法查找确切反射点的深度差阈值
- `maxRoughness`: 表面最大粗糙度，超过此值将不计算反射
- `blend`: 与原始场景混合的强度
- `denoiseIterations`: 降噪迭代次数
- `temporalResolve`: 是否使用时间重投影来平滑结果
- `steps`: 光线追踪的最大步数
- `refineSteps`: 二分查找的步数
- `resolutionScale`: 效果的分辨率比例

**示例使用**:
```javascript
const ssgiEffect = new SSGIEffect(composer, scene, camera, {
  distance: 10,
  thickness: 10,
  denoiseIterations: 2,
  temporalResolve: true,
  resolutionScale: 0.5
});

effectPass.addEffect(ssgiEffect);
```

### SSR (屏幕空间反射)

**文件**: `src/libs/realism-effects/src/ssgi/SSREffect.js`

**描述**: 屏幕空间反射是SSGI的简化版本，专注于反射效果而不包括间接光照，计算开销更小。

**主要参数**:
- `resolutionScale`: 反射计算的分辨率比例
- `maxDistance`: 反射光线的最大距离
- `thickness`: 深度差阈值
- `opacity`: 反射的透明度
- `fresnel`: 是否启用菲涅尔效应
- `blur`: 反射模糊程度

**示例使用**:
```javascript
const ssrEffect = new SSREffect(scene, camera, {
  resolutionScale: 0.75,
  maxDistance: 10,
  opacity: 0.8,
  blur: 0.5
});

effectPass.addEffect(ssrEffect);
```

### TRAA (时间重构抗锯齿)

**文件**: `src/libs/realism-effects/src/traa/TRAAEffect.js`

**描述**: 先进的时间抗锯齿技术，通过多帧信息重构提供比TAA更高质量的抗锯齿效果。它能够有效减少锯齿、闪烁和噪点，同时保持画面细节和清晰度。

**主要参数**:
- `blend`: 前后帧混合比例
- `accumulate`: 累积帧的数量
- `differenceThreshold`: 前后帧差异阈值

**示例使用**:
```javascript
const traaEffect = new TRAAEffect(scene, camera, velocityPass);
effectPass.addEffect(traaEffect);
```

### TAA (时间抗锯齿)

**文件**: `src/libs/realism-effects/src/taa/TAAPass.js`

**描述**: 传统的时间抗锯齿技术，通过帧间混合减少锯齿和闪烁。与TRAA相比实现更简单，兼容性更好。

**主要参数**:
- `sampleLevel`: 采样级别，影响抖动模式
- `accumulate`: 是否累积帧
- `blend`: 混合比例

**示例使用**:
```javascript
const taaPass = new TAAPass(scene, camera);
composer.addPass(taaPass);
```

### MotionBlur (动态模糊)

**文件**: `src/libs/realism-effects/src/motion-blur/MotionBlurEffect.js`

**描述**: 模拟高速移动物体的模糊效果，增强动态场景的真实感。基于场景中物体的速度信息来产生方向性的模糊。

**主要参数**:
- `intensity`: 模糊强度
- `jitter`: 随机抖动程度
- `samples`: 采样数量

**示例使用**:
```javascript
const motionBlurEffect = new MotionBlurEffect(velocityPass, {
  intensity: 1.0,
  samples: 32
});
effectPass.addEffect(motionBlurEffect);
```

### HBAO (基于地平线的环境光遮蔽)

**文件**: `src/libs/realism-effects/src/hbao/HBAOEffect.js`

**描述**: 高质量的环境光遮蔽技术，根据表面几何结构计算阴影和环境光的遮挡，模拟间接光照的阴影效果。

**主要参数**:
- `aoDistance`: 遮蔽搜索距离
- `distancePower`: 距离衰减指数
- `power`: 遮蔽强度指数
- `bias`: 深度比较偏差
- `thickness`: 遮蔽判断厚度
- `color`: 遮蔽颜色

**示例使用**:
```javascript
const hbaoEffect = new HBAOEffect(composer, camera, scene, {
  aoDistance: 2.0,
  power: 2.0,
  bias: 0.05,
  color: new Color(0x000000)
});
effectPass.addEffect(hbaoEffect);
```

### Sharpness (锐化)

**文件**: `src/libs/realism-effects/src/sharpness/SharpnessEffect.js`

**描述**: 增强图像细节和边缘锐度的后处理效果，提高图像的清晰度和细节表现。

**主要参数**:
- `intensity`: 锐化强度
- `sampleRadius`: 采样半径

**示例使用**:
```javascript
const sharpnessEffect = new SharpnessEffect({
  intensity: 0.5
});
effectPass.addEffect(sharpnessEffect);
```

### LensDistortion (镜头畸变)

**文件**: `src/libs/realism-effects/src/lens-distortion/LensDistortionEffect.js`

**描述**: 模拟相机镜头的畸变效果，增加摄影真实感。包括桶形畸变和枕形畸变，以及色差效果。

**主要参数**:
- `alphax`: X轴畸变系数（负值为桶形，正值为枕形）
- `alphay`: Y轴畸变系数
- `aberration`: 色差强度

**示例使用**:
```javascript
const lensDistortionEffect = new LensDistortionEffect({
  alphax: -0.05,
  alphay: -0.05,
  aberration: 1.0
});
effectPass.addEffect(lensDistortionEffect);
```

### GradualBackground (渐变背景)

**文件**: `src/libs/realism-effects/src/gradual-background/GradualBackgroundEffect.js`

**描述**: 为场景提供平滑渐变背景效果，可以创建自然的天空或环境效果。

**主要参数**:
- `topColor`: 顶部颜色
- `bottomColor`: 底部颜色
- `offset`: 渐变偏移
- `exponent`: 渐变指数

**示例使用**:
```javascript
const gradualBackgroundEffect = new GradualBackgroundEffect({
  topColor: new Color(0x0077ff),
  bottomColor: new Color(0xffffff)
});
effectPass.addEffect(gradualBackgroundEffect);
```

### Sparkle (闪光效果)

**文件**: `src/libs/realism-effects/src/sparkle/SparkleEffect.js`

**描述**: 为高亮区域添加闪光效果，模拟金属或水面反光，增加场景的视觉活力。

**主要参数**:
- `intensity`: 闪光强度
- `threshold`: 亮度阈值
- `flickerSpeed`: 闪烁速度

**示例使用**:
```javascript
const sparkleEffect = new SparkleEffect({
  intensity: 1.0,
  threshold: 0.8
});
effectPass.addEffect(sparkleEffect);
```

## 核心组件

### Denoiser (降噪器)

**文件**: `src/libs/realism-effects/src/denoise/Denoiser.js`

**描述**: 用于处理渲染中的噪点问题，特别是与路径追踪和全局光照相关的噪点。支持时间与空间降噪，是提高图像质量的关键组件。

**主要功能**:
- 时间累积降噪
- 空间滤波降噪
- 适应性处理不同材质特性

### TemporalReproject (时间重投影)

**文件**: `src/libs/realism-effects/src/temporal-reproject/TemporalReprojectPass.js`

**描述**: 帧间信息重投影技术，是多种效果的基础组件。通过重用前一帧的信息来提高稳定性和质量。

**主要功能**:
- 帧历史累积
- 运动补偿
- 抖动采样支持

### GBuffer (几何缓冲区)

**文件**: `src/libs/realism-effects/src/gbuffer/GBufferPass.js`

**描述**: 存储场景的几何信息，包括深度、法线、粗糙度等，为其他效果提供数据支持。

**主要功能**:
- 高效的场景信息提取
- 支持多种材质属性

## 辅助组件

### VelocityPass (速度通道)

**文件**: `src/libs/realism-effects/src/temporal-reproject/pass/VelocityPass.js`

**描述**: 计算场景中物体的运动速度，为动态模糊和时间抗锯齿效果提供支持。

### VelocityDepthNormalPass (速度深度法线通道)

**文件**: `src/libs/realism-effects/src/temporal-reproject/pass/VelocityDepthNormalPass.js`

**描述**: 同时计算速度、深度和法线信息，优化多效果情况下的性能。这是一个优化组件，减少多个效果对相同信息的重复计算。

### PoissonDenoisePass (泊松降噪通道)

**文件**: `src/libs/realism-effects/src/denoise/pass/PoissonDenoisePass.js`

**描述**: 基于泊松分布的降噪算法，高效去除渲染噪点，特别适用于路径追踪和全局光照效果。

## 常见问题与优化

### 性能考量

- 大多数效果都提供`resolutionScale`参数，可以通过降低此值来提高性能
- 降低采样数量(`spp`, `samples`等参数)可以显著提升性能，但会降低质量
- 对于移动设备，建议关闭或降低SSGI和SSR的质量设置

### 黑点问题

SSGI和SSR效果可能在某些场景下产生黑点，可以通过以下方式解决：
- 调整`normalPhi`和`roughnessPhi`参数
- 使用自定义降噪器如`CustomDenoiser`
- 适当增加亮度补偿(`brightnessCompensation`)

### 兼容性问题

- 这些效果最好在WebGL2上运行，以获得最佳性能和视觉效果
- 对于WebGL1环境，建议使用简化效果如基本TAA和简单HBAO

## 使用示例

基本设置示例：

```javascript
import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { SSGIEffect, TRAAEffect, HBAOEffect } from 'realism-effects';

// 创建后处理合成器
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 添加HBAO效果
const hbaoEffect = new HBAOEffect(composer, camera, scene, {
  resolutionScale: 1.0,
  spp: 16,
  distance: 2,
  power: 2
});

// 添加SSGI效果
const ssgiEffect = new SSGIEffect(composer, scene, camera, {
  distance: 10,
  thickness: 10,
  denoiseIterations: 1,
  resolutionScale: 0.5
});

// 添加抗锯齿效果
const traaEffect = new TRAAEffect(scene, camera);

// 将效果添加到效果通道
const effectPass = new EffectPass(camera, hbaoEffect, ssgiEffect, traaEffect);
composer.addPass(effectPass);

// 渲染循环
function animate() {
  requestAnimationFrame(animate);
  composer.render();
}
animate();
```

针对性能优化的设置示例：

```javascript
// 低性能设备的优化配置
const ssgiEffect = new SSGIEffect(composer, scene, camera, {
  distance: 5,          // 减小光线传播距离
  steps: 10,            // 减少光线步数
  resolutionScale: 0.25, // 大幅降低分辨率
  denoiseIterations: 1,  // 减少降噪迭代
  temporalResolve: true  // 保持时间重投影以保持稳定性
});

// 使用CustomSSGIEffect避免黑点问题
const customSSGIEffect = new CustomSSGIEffect(composer, scene, camera, {
  normalPhi: 30,               // 降低法线敏感度
  roughnessPhi: 30,            // 降低粗糙度敏感度
  brightnessCompensation: 1.5  // 增加亮度补偿
});
```

## 结论

Realism Effects库提供了丰富的后处理效果，可以显著提升Three.js项目的视觉质量和真实感。通过合理配置各种效果参数，可以在性能和视觉质量之间找到平衡点，满足不同项目的需求。

为获得最佳效果，建议将多种后处理效果组合使用，例如SSGI/SSR + HBAO + MotionBlur + TRAA，可以实现接近离线渲染的视觉效果。 