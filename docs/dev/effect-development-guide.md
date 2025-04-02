# 后处理效果开发指南

## 目录

1. [简介](#简介)
2. [效果开发流程](#效果开发流程)
3. [效果基本结构](#效果基本结构)
   - [Effect类架构](#effect类架构)
   - [生命周期](#生命周期)
   - [参数配置](#参数配置)
4. [效果目录与分类](#效果目录与分类)
   - [图像增强效果](#图像增强效果)
   - [深度和模糊效果](#深度和模糊效果)
   - [空间效果](#空间效果)
   - [轮廓和边缘效果](#轮廓和边缘效果)
   - [其他效果类型](#其他效果类型)
5. [核心效果详解](#核心效果详解)
   - [OutlineEffect](#outlineeffect)
   - [BloomEffect](#bloomeffect)
   - [DepthOfFieldEffect](#depthoffield-effect)
   - [SSREffect](#ssreffect)
   - [SSAOEffect](#ssaoeffect)
6. [效果组合技巧](#效果组合技巧)
   - [性能与质量平衡](#性能与质量平衡)
   - [特殊组合技巧](#特殊组合技巧)
7. [常见问题与解决方案](#常见问题与解决方案)
8. [参考资源](#参考资源)

## 简介

本文档详细介绍了后处理效果库中各类效果的开发方法、实现原理和使用技巧。后处理效果是在3D场景渲染完成后应用的图像处理技术，用于增强视觉表现，添加艺术风格，或模拟真实相机/眼睛的光学效果。

通过本指南，开发者可以了解如何创建新效果，扩展现有效果，以及如何将多个效果组合使用以实现复杂的视觉表现。

## 效果开发流程

开发一个新的后处理效果通常包括以下步骤：

1. **概念设计**：定义效果的视觉目标和参数
2. **算法研究**：研究实现效果的技术和算法
3. **着色器编写**：实现核心的GLSL着色器代码
4. **JS封装**：创建效果类，封装着色器和控制逻辑
5. **优化与测试**：优化性能，测试在不同场景下的效果
6. **文档编写**：编写使用文档和API参考

### 开发新效果的基本步骤

```javascript
// 1. 创建GLSL着色器 (src/effects/glsl/my-effect.frag)
uniform float intensity;
uniform sampler2D inputTexture;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 效果实现逻辑
    vec4 color = texture2D(inputTexture, uv);
    outputColor = mix(inputColor, color, intensity);
}

// 2. 创建效果类 (src/effects/MyEffect.js)
import { Effect } from "./Effect.js";
import fragmentShader from "./glsl/my-effect.frag";

export class MyEffect extends Effect {
    constructor({ intensity = 1.0, texture = null } = {}) {
        super("MyEffect", fragmentShader, {
            uniforms: new Map([
                ["intensity", new Uniform(intensity)],
                ["inputTexture", new Uniform(texture)]
            ])
        });
    }
    
    update(renderer, inputBuffer, deltaTime) {
        // 每帧更新逻辑
    }
}

// 3. 导出效果 (src/index.js)
export { MyEffect } from "./effects/MyEffect.js";
```

## 效果基本结构

### Effect类架构

所有后处理效果都继承自`Effect`基类，该类提供了以下基本功能：

1. **着色器管理**：加载和编译着色器程序
2. **Uniform管理**：设置和更新着色器参数
3. **生命周期钩子**：初始化、更新、销毁等
4. **混合模式**：控制效果如何与原始图像混合

```javascript
export class Effect {
    constructor(name, fragmentShader, {
        attributes = EffectAttribute.NONE,
        blendFunction = BlendFunction.NORMAL,
        defines = new Map(),
        uniforms = new Map(),
        extensions = null,
        vertexShader = null
    } = {}) {
        // 初始化代码...
    }
    
    // 生命周期方法
    initialize(renderer, alpha, frameBufferType) { /* ... */ }
    update(renderer, inputBuffer, deltaTime) { /* ... */ }
    setSize(width, height) { /* ... */ }
    dispose() { /* ... */ }
    
    // 混合相关方法
    getFragmentShader() { /* ... */ }
    setVertexShader(vertexShader) { /* ... */ }
    defineProperties(object) { /* ... */ }
}
```

### 生命周期

效果的生命周期包括以下阶段：

1. **构造**: 创建效果实例，设置初始参数
2. **初始化**: 初始化资源，如渲染目标、材质等
3. **更新**: 每帧调用，更新效果状态
4. **调整大小**: 当视口大小变化时调整内部资源
5. **销毁**: 释放资源，清理内存

### 参数配置

效果参数的配置通常采用以下模式：

```javascript
// 参数配置最佳实践
constructor({
    // 必要参数
    scene,
    camera,
    
    // 可选参数 - 使用默认值
    intensity = 1.0,
    resolution = 0.5,
    blendFunction = BlendFunction.NORMAL,
    
    // 高级参数
    samples = 16,
    rings = 5,
    distanceThreshold = 1.0,
    
    // 特征开关
    useDepthTexture = true,
    
    // 渲染目标设置
    width = Resolution.AUTO_SIZE,
    height = Resolution.AUTO_SIZE
} = {}) {
    // 初始化代码...
}
```

## 效果目录与分类

### 图像增强效果

| 效果名称 | 文件路径 | 着色器路径 | 主要功能 |
|----------|----------|------------|----------|
| BloomEffect | `src/effects/BloomEffect.js` | `src/effects/glsl/bloom.frag` | 为明亮区域添加辉光效果 |
| BrightnessContrastEffect | `src/effects/BrightnessContrastEffect.js` | `src/effects/glsl/brightness-contrast.frag` | 调整图像亮度和对比度 |
| SharpenEffect | `src/effects/SharpenEffect.js` | `src/effects/glsl/sharpen.frag` | 基础锐化效果 |
| AdaptiveSharpenEffect | `src/effects/AdaptiveSharpenEffect.js` | `src/effects/glsl/enhanced-sharpen.frag` | 自适应锐化效果 |
| ToneMappingEffect | `src/effects/ToneMappingEffect.js` | `src/effects/glsl/tone-mapping.frag` | HDR到LDR的色调映射 |

### 深度和模糊效果

| 效果名称 | 文件路径 | 着色器路径 | 主要功能 |
|----------|----------|------------|----------|
| DepthOfFieldEffect | `src/effects/DepthOfFieldEffect.js` | `src/effects/glsl/depth-of-field.frag` | 根据深度信息模糊非焦点区域 |
| BlurEffect | `src/effects/BlurEffect.js` | - | 基础模糊效果 |
| BokehEffect | `src/effects/BokehEffect.js` | `src/effects/glsl/bokeh.frag` | 散景模糊效果 |
| MotionBlurEffect | `src/effects/MotionBlurEffect.js` | - | 运动模糊效果 |

### 空间效果

| 效果名称 | 文件路径 | 着色器路径 | 主要功能 |
|----------|----------|------------|----------|
| SSAOEffect | `src/effects/SSAOEffect.js` | `src/effects/glsl/ssao.frag` | 屏幕空间环境光遮蔽 |
| SSREffect | `src/effects/SSREffect.js` | `src/effects/glsl/ssr.frag` | 屏幕空间反射 |
| SSGIEffect | `src/effects/CustomSSGIEffect.js` | - | 屏幕空间全局光照 |
| FogEffect | `src/effects/VolumetricFogEffect.js` | `src/effects/glsl/volumetric-fog.frag` | 体积雾效果 |

### 轮廓和边缘效果

| 效果名称 | 文件路径 | 着色器路径 | 主要功能 |
|----------|----------|------------|----------|
| OutlineEffect | `src/effects/OutlineEffect.js` | `src/effects/glsl/outline.frag` | 对象轮廓描边效果 |
| OutlineMultiEffect | `src/effects/OutlineMultiEffect.js` | `src/effects/glsl/outline-multi.frag` | 多颜色轮廓效果 |
| SharedOutlineEffect | `src/effects/SharedOutlineEffect.js` | - | 共享资源的轮廓效果 |

### 其他效果类型

更多效果类型包括：
- **抗锯齿效果**：SMAAEffect、FXAAEffect等
- **风格化效果**：PixelationEffect、DotScreenEffect等
- **镜头效果**：LensDistortionEffect、ChromaticAberrationEffect等
- **颜色处理效果**：ColorDepthEffect、SepiaEffect等
- **工具效果**：各种Pass类和工具效果

## 核心效果详解

### OutlineEffect

**路径**: `src/effects/OutlineEffect.js`, `src/effects/glsl/outline.frag`

**核心特点**:
- 支持选择集高亮
- 通过深度比较实现遮挡检测
- 支持可见部分和被遮挡部分使用不同颜色
- 支持轮廓脉动效果和模糊边缘

**实现原理**:
1. 首先渲染场景深度图
2. 单独渲染选中对象
3. 比较选中对象与场景的深度差异
4. 根据深度差异生成轮廓遮罩
5. 应用轮廓颜色和效果

**关键代码片段**:
```javascript
// 深度比较技术核心代码片段
this.depthPass = new DepthPass(scene, camera);
this.maskPass = new RenderPass(scene, camera, new DepthComparisonMaterial(this.depthPass.texture, camera));

// 在update方法中
// 1. 渲染场景深度
this.depthPass.render(renderer);
// 2. 设置相机只渲染选中对象
camera.layers.set(selection.layer);
// 3. 渲染选中对象并与深度比较
this.maskPass.render(renderer, this.renderTargetMask);
```

### BloomEffect

**路径**: `src/effects/BloomEffect.js`, `src/effects/glsl/bloom.frag`

**核心特点**:
- 支持亮度阈值和平滑过渡
- 支持多遍降采样和升采样的Mipmap模糊
- 高质量和高性能模式切换

**实现原理**:
1. 提取图像中超过亮度阈值的区域
2. 对提取的亮部进行多次模糊
3. 将模糊后的亮部与原始图像混合

**关键代码片段**:
```javascript
// 亮度阈值提取核心逻辑
vec3 threshold(vec3 color) {
    return max(color - vec3(luminanceThreshold), vec3(0.0));
}

// 在片段着色器中提取高亮区域
vec4 texel = texture2D(inputBuffer, uv);
vec3 brightColor = threshold(texel.rgb);
```

### DepthOfField Effect

**路径**: `src/effects/DepthOfFieldEffect.js`, `src/effects/glsl/depth-of-field.frag`

**核心特点**:
- 支持基于相机焦距的自动散景
- 支持手动焦点设置
- 提供前景和背景模糊控制

**实现原理**:
1. 使用深度信息区分前景、焦点和背景
2. 计算每个像素的"散景圆"大小
3. 对前景和背景应用不同半径的模糊

**关键代码片段**:
```javascript
// 从深度值计算散景圆
float computeCircleOfConfusion() {
    float depth = linearDepth(texture2D(depthBuffer, vUv).r);
    float focusNear = linearDepth(focusDepth - focusRange * 0.5);
    float focusFar = linearDepth(focusDepth + focusRange * 0.5);
    float coc = abs(depth - focusDepth) / focusRange;
    return clamp(coc, 0.0, 1.0) * maxBlur;
}
```

### SSREffect

**路径**: `src/effects/SSREffect.js`, `src/effects/glsl/ssr.frag`

**核心特点**:
- 实现精确的屏幕空间反射
- 支持多次反射弹跳
- 支持基于视角的菲涅尔效应
- 支持距离衰减
- 包含边缘模糊处理

**实现原理**:
1. 利用深度和法线信息计算反射方向
2. 在屏幕空间中沿反射方向进行光线步进
3. 检测光线与场景的交点
4. 从交点采样场景颜色作为反射

**关键代码片段**:
```javascript
// 反射追踪的核心原理
vec3 traceReflection(vec3 position, vec3 direction, float thickness) {
    // 初始化追踪点
    vec3 marchingPos = position;
    
    // 逐步在反射方向上前进
    for(int i = 0; i < MAX_STEPS; i++) {
        // 向反射方向迈进一步
        marchingPos += direction * stepSize;
        
        // 将3D位置投影到屏幕空间
        vec4 projectedPos = projection * vec4(marchingPos, 1.0);
        vec2 uv = projectedPos.xy / projectedPos.w * 0.5 + 0.5;
        
        // 获取当前位置的场景深度
        float sceneDepth = linearDepth(texture2D(depthTexture, uv).r);
        
        // 比较当前追踪深度与场景深度
        if(marchingPos.z > sceneDepth + thickness) {
            // 找到交点，返回采样位置
            return vec3(uv, sceneDepth);
        }
    }
    
    // 未找到交点
    return vec3(0.0);
}
```

### SSAOEffect

**路径**: `src/effects/SSAOEffect.js`, `src/effects/glsl/ssao.frag`

**核心特点**:
- 基于法线和深度信息计算环境光遮蔽
- 支持样本数量和半径调整
- 支持偏差值和强度调整
- 包含智能噪声抖动

**实现原理**:
1. 从半球内随机采样多个方向
2. 投影这些采样点到屏幕空间
3. 比较采样点与场景深度
4. 计算遮蔽因子

**关键代码片段**:
```javascript
// 环境光遮蔽采样核心逻辑示例
float aoSample(vec3 position, vec3 normal, vec2 uv, float radius) {
    // 从半球内随机获取采样点方向
    vec3 sampleDirection = normalize(sampleKernel[i]);
    sampleDirection = sampleDirection * radius;
    
    // 从深度图获取采样点的实际深度
    vec2 offset = sampleDirection.xy;
    float sampleDepth = linearDepth(texture2D(depthTexture, uv + offset).r);
    
    // 计算遮蔽因子
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(position.z - sampleDepth));
    occlusion += (sampleDepth < position.z ? 1.0 : 0.0) * rangeCheck;
}
```

## 效果组合技巧

### 性能与质量平衡

当使用多个效果时，需要平衡性能和质量：

1. **分辨率缩放策略**
   - 重要的后期处理效果（如SSAO、SSR）使用全分辨率
   - 模糊类效果可以使用较低分辨率（0.5-0.75x）
   - 像素化等风格化效果可以使用极低分辨率（0.25-0.5x）

2. **共享资源**
   - 多个效果可以共享深度和法线缓冲区
   - 使用SharedOutlineEffect而非多个OutlineEffect

3. **分层渲染**
   - 使用EffectPass组合兼容的效果减少渲染通道
   - 必要时分成多个通道处理有依赖关系的效果

### 特殊组合技巧

1. **深度感知增强**
   - 结合SSAO和景深效果增强场景深度感
   - 示例：`new EffectPass(camera, ssaoEffect, depthOfFieldEffect)`

2. **电影级氛围**
   - 结合色调映射、色彩分级、暗角和胶片颗粒
   - 示例：`new EffectPass(camera, toneMappingEffect, lutEffect, vignetteEffect, noiseEffect)`

3. **互动式高亮**
   - 结合SelectiveBloomEffect和OutlineEffect实现多种高亮
   - 示例：为重要物体添加泛光+轮廓线

**示例代码：高质量游戏渲染组合**

```javascript
// 创建效果组合器
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// 环境光遮蔽增强阴影
const ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
    intensity: 1.2,
    radius: 10,
    samples: 24
});

// 屏幕空间反射增强水面和金属材质
const ssrEffect = new SSREffect(scene, camera, {
    intensity: 0.8,
    maxRoughness: 0.5,
    resolutionScale: 0.5
});

// 高质量抗锯齿
const smaaEffect = new SMAAEffect({
    preset: SMAAPreset.HIGH,
    edgeDetectionMode: EdgeDetectionMode.COLOR
});

// 色调映射处理HDR
const toneMapping = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC
});

// 创建组合传递
composer.addPass(new EffectPass(camera, ssaoEffect, ssrEffect, toneMapping, smaaEffect));
```

## 常见问题与解决方案

1. **性能问题**
   - **症状**: 帧率下降，尤其在移动设备上
   - **解决方案**: 降低分辨率，减少采样数量，使用轻量级替代效果

2. **视觉伪影**
   - **症状**: 出现闪烁、条带、噪点等伪影
   - **解决方案**: 增加采样数量，使用抖动采样，应用时间性抗锯齿

3. **空间效果边缘问题**
   - **症状**: 屏幕边缘出现黑边或失真
   - **解决方案**: 实现边缘淡出，使用环境贴图填补

4. **多效果冲突**
   - **症状**: 效果叠加后出现意外结果
   - **解决方案**: 调整效果顺序，合理组织EffectPass

5. **WebGL兼容性问题**
   - **症状**: 在某些设备或浏览器上效果不工作
   - **解决方案**: 实现功能检测，提供降级方案

## 参考资源

- [Three.js文档](https://threejs.org/docs/) - Three.js官方文档
- [WebGL规范](https://www.khronos.org/registry/webgl/specs/latest/) - WebGL官方规范
- [GLSL规范](https://www.khronos.org/registry/OpenGL/specs/gl/GLSLangSpec.4.60.pdf) - GLSL着色器语言规范
- [GPU Gems系列](https://developer.nvidia.com/gpugems/gpugems) - NVIDIA的GPU编程指南
- [Real-Time Rendering](http://www.realtimerendering.com/) - 实时渲染技术书籍 