# 后处理着色器开发指南

## 目录

1. [简介](#简介)
2. [着色器基本结构](#着色器基本结构)
   - [顶点着色器](#顶点着色器)
   - [片段着色器](#片段着色器)
   - [通用工具函数](#通用工具函数)
3. [项目着色器架构](#项目着色器架构)
   - [组织结构](#组织结构)
   - [代码复用机制](#代码复用机制)
   - [着色器宏](#着色器宏)
4. [着色器开发流程](#着色器开发流程)
   - [设计规划](#设计规划)
   - [编写代码](#编写代码)
   - [测试与调试](#测试与调试)
   - [性能优化](#性能优化)
5. [项目着色器分析](#项目着色器分析)
   - [图像处理着色器](#图像处理着色器)
   - [空间效果着色器](#空间效果着色器)
   - [多Pass效果着色器](#多pass效果着色器)
6. [常见问题与解决方案](#常见问题与解决方案)
   - [采样伪影](#采样伪影)
   - [兼容性问题](#兼容性问题)
   - [性能瓶颈](#性能瓶颈)
7. [最佳实践](#最佳实践)
   - [命名规范](#命名规范)
   - [注释标准](#注释标准)
   - [优化指南](#优化指南)
8. [参考资源](#参考资源)

## 简介

本文档专注于后处理库中的着色器开发，从基础概念到具体实现技术，提供完整的参考信息。着色器是后处理效果的核心，直接决定了视觉效果的质量和性能。通过本指南，开发者可以了解如何高效、规范地开发高质量的后处理着色器。

文档整合了项目中的着色器案例分析、常见问题解决方案以及最佳实践，为开发者提供全面的着色器开发参考。

## 着色器基本结构

### 顶点着色器

后处理顶点着色器通常比较简单，主要任务是将顶点转换到屏幕空间，并传递UV坐标。

```glsl
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

大多数后处理效果中，顶点着色器是统一的，不需要特别修改。但在一些特殊效果中（如畸变效果），可能需要在顶点着色器中进行额外计算。

### 片段着色器

片段着色器是后处理效果的核心，负责处理每个像素的颜色计算。典型的片段着色器结构如下：

```glsl
uniform sampler2D inputBuffer;  // 输入纹理（上一步渲染结果）
uniform sampler2D depthBuffer;  // 深度纹理（可选）
uniform vec2 resolution;        // 渲染分辨率
uniform float intensity;        // 效果强度参数

varying vec2 vUv;               // 从顶点着色器传入的UV坐标

// 通用工具函数
#include <packing>              // 深度解包等实用函数

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 效果的主要实现逻辑
    vec4 color = texture2D(inputBuffer, uv);
    
    // 处理色彩、应用效果等
    color = applyEffect(color);
    
    // 输出最终颜色
    outputColor = color;
}

void main() {
    vec4 color = vec4(0.0);
    mainImage(texture2D(inputBuffer, vUv), vUv, color);
    gl_FragColor = color;
}
```

### 通用工具函数

在项目中，有许多通用的工具函数可以在不同的着色器中复用：

#### 深度处理函数

```glsl
// 将深度缓冲区的值转换为线性深度
float linearDepth(float depth) {
    float near = cameraNear;
    float far = cameraFar;
    return (2.0 * near) / (far + near - depth * (far - near));
}

// 读取深度纹理获取世界空间位置
vec3 getWorldPosition(vec2 uv, float depth) {
    float z = depth * 2.0 - 1.0;
    vec4 clipSpacePosition = vec4(uv * 2.0 - 1.0, z, 1.0);
    vec4 viewSpacePosition = projectionMatrixInverse * clipSpacePosition;
    viewSpacePosition /= viewSpacePosition.w;
    vec4 worldSpacePosition = viewMatrixInverse * viewSpacePosition;
    return worldSpacePosition.xyz;
}
```

#### 采样和噪声函数

```glsl
// 生成随机数
float random(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

// 获取带有抖动的采样坐标
vec2 jitteredUV(vec2 uv, float amount) {
    vec2 noise = vec2(
        random(uv + vec2(0.0, time)),
        random(uv + vec2(time, 0.0))
    );
    return uv + (noise * 2.0 - 1.0) * amount;
}
```

## 项目着色器架构

### 组织结构

项目中的着色器文件组织如下：

```
src/
  effects/
    glsl/
      common/              - 通用工具代码
        packing.glsl       - 深度解包等功能
        sampling.glsl      - 采样工具
        noise.glsl         - 噪声生成
      bloom/               - 泛光效果着色器组
        luminance.frag     - 亮度提取
        blur.frag          - 模糊处理
        combine.frag       - 最终合成
      ssao.frag            - 环境光遮蔽
      ssr.frag             - 屏幕空间反射
      outline.frag         - 边缘检测和描边
      ...
```

着色器文件按功能分组，复杂的效果使用单独的文件夹包含多个着色器。

### 代码复用机制

项目利用GLSL的`#include`语法（通过JS实现）实现代码复用：

```glsl
// 在着色器中引入通用代码
#include <common/packing>
#include <common/noise>

// 在JS中实现包含机制
function processShaderCode(shaderSource) {
    return shaderSource.replace(
        /#include\s+<([\w\/]+)>/g,
        (match, includePath) => getShaderChunk(includePath)
    );
}
```

这种方式使得通用代码可以在不同着色器间共享，提高维护性。

### 着色器宏

使用预处理宏使着色器具有更好的灵活性：

```glsl
// 宏定义示例
#define SAMPLES 16
#define USE_DEPTH_TEXTURE

// 条件编译
#ifdef USE_DEPTH_TEXTURE
uniform sampler2D depthTexture;
#endif

// 在着色器中使用
void mainImage(...) {
    #ifdef USE_DEPTH_TEXTURE
    float depth = texture2D(depthTexture, uv).r;
    #else
    float depth = 1.0; // 降级处理
    #endif
    
    // 调整采样数量
    #if SAMPLES > 32
    // 高质量采样路径
    #else
    // 标准采样路径
    #endif
}
```

JS代码中动态生成宏定义：

```javascript
const defines = new Map([
    ["SAMPLES", options.samples.toString()],
    ["USE_DEPTH_TEXTURE", options.useDepthTexture ? "1" : "0"]
]);
```

## 着色器开发流程

### 设计规划

1. **明确效果目标**
   - 分析视觉效果的基本原理
   - 定义所需的输入参数
   - 确定性能目标和限制

2. **算法选择**
   - 基于现有研究选择适当算法
   - 评估算法的性能特征
   - 考虑潜在的优化机会

3. **参数设计**
   - 定义必要的uniform参数
   - 设计参数范围和默认值
   - 规划用户可调参数和内部参数

### 编写代码

1. **着色器结构设计**
   - 决定是单Pass还是多Pass实现
   - 规划缓冲区需求和分辨率
   - 设计数据流和依赖关系

2. **GLSL代码编写**
   - 遵循项目代码风格
   - 复用现有通用函数
   - 清晰注释算法的关键步骤

3. **JS封装实现**
   - 创建Effect类封装着色器
   - 设置参数和默认值
   - 实现必要的生命周期方法

### 测试与调试

1. **基本功能测试**
   - 验证效果的基本视觉表现
   - 测试参数影响和边界条件
   - 检查不同场景下的表现

2. **调试技巧**
   - 使用不同颜色可视化中间结果
   - 实现调试模式以查看关键缓冲区
   - 对比期望结果与实际输出

3. **兼容性测试**
   - 测试不同GPU和平台
   - 验证WebGL1和WebGL2兼容性
   - 检查移动设备上的表现

### 性能优化

1. **分析性能瓶颈**
   - 使用GPU分析工具识别瓶颈
   - 测量不同分辨率下的性能
   - 评估内存使用和带宽需求

2. **优化策略**
   - 减少纹理采样次数
   - 使用早期返回跳过不必要的计算
   - 考虑降采样处理大范围效果
   - 复用中间结果减少计算冗余

## 项目着色器分析

### 图像处理着色器

#### 锐化效果着色器

**文件路径**: `src/effects/glsl/sharpness.frag`

```glsl
// 核心片段
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 获取原始像素
    vec4 original = texture2D(inputBuffer, uv);
    
    // 应用模糊获取平滑版本
    vec4 blurred = vec4(0.0);
    for(int i = 0; i < KERNEL_SIZE; i++) {
        for(int j = 0; j < KERNEL_SIZE; j++) {
            vec2 offset = (vec2(float(i), float(j)) - center) * texelSize * strength;
            blurred += texture2D(inputBuffer, uv + offset) * kernel[i][j];
        }
    }
    
    // 通过原始图像和模糊图像的差异增强细节
    vec4 sharpened = original + (original - blurred) * intensity;
    
    // 输出最终颜色
    outputColor = sharpened;
}
```

**实现说明**:
- 锐化效果通过原始图像与模糊版本的差异来增强细节
- `intensity`参数控制锐化强度
- 通过采样邻域像素实现空间域滤波
- 可通过修改kernel参数调整锐化特性

#### 色相饱和度效果着色器

**文件路径**: `src/effects/glsl/hue-saturation.frag`

```glsl
// 核心片段
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 转换为HSL色彩空间
    vec3 hsl = rgb2hsl(inputColor.rgb);
    
    // 应用色相和饱和度调整
    hsl.x = mod(hsl.x + hue, 1.0);
    hsl.y = clamp(hsl.y * saturation, 0.0, 1.0);
    
    // 转回RGB
    vec3 rgb = hsl2rgb(hsl);
    
    // 输出结果
    outputColor = vec4(rgb, inputColor.a);
}
```

**实现说明**:
- 色相调整通过在HSL色彩空间操作实现
- 使用`mod`函数确保色相值在[0,1]范围内
- 饱和度通过简单的乘法调整，并限制在有效范围内
- 保持原始alpha值不变

### 空间效果着色器

#### SSAO效果着色器

**文件路径**: `src/effects/glsl/ssao/ssao.frag`

```glsl
// 核心片段
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 早期返回：天空区域不需要AO
    float depth = readDepth(depthTexture, uv);
    if(depth >= 1.0) {
        outputColor = vec4(1.0);
        return;
    }
    
    // 获取世界位置和法线
    vec3 worldPos = getWorldPosition(uv, depth);
    vec3 normal = texture2D(normalTexture, uv).xyz * 2.0 - 1.0;
    
    // 生成随机采样方向
    vec3 randomVec = texture2D(noiseTexture, uv * noiseScale).xyz * 2.0 - 1.0;
    vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 tbn = mat3(tangent, bitangent, normal);
    
    // 累积环境遮蔽
    float occlusion = 0.0;
    for(int i = 0; i < SAMPLES; i++) {
        // 转换半球采样向量到世界空间
        vec3 sampleVec = tbn * sampleKernel[i];
        
        // 确保采样在法线半球
        sampleVec = normalize(sampleVec) * radius;
        
        // 计算采样点
        vec3 samplePos = worldPos + sampleVec;
        
        // 投影采样点到屏幕空间
        vec4 offset = projectionMatrix * vec4(samplePos, 1.0);
        offset.xy /= offset.w;
        offset.xy = offset.xy * 0.5 + 0.5;
        
        // 读取采样点深度
        float sampleDepth = readDepth(depthTexture, offset.xy);
        vec3 sampleWorldPos = getWorldPosition(offset.xy, sampleDepth);
        
        // 计算遮蔽贡献
        float rangeCheck = smoothstep(0.0, 1.0, radius / abs(worldPos.z - sampleWorldPos.z));
        occlusion += (sampleWorldPos.z <= samplePos.z ? 1.0 : 0.0) * rangeCheck;
    }
    
    // 归一化遮蔽值
    occlusion = 1.0 - (occlusion / float(SAMPLES));
    
    // 应用强度并输出
    occlusion = pow(occlusion, intensity);
    outputColor = vec4(occlusion);
}
```

**实现说明**:
- SSAO通过在法线半球周围采样深度来估计环境遮蔽
- 使用随机旋转矩阵(TBN)减少采样伪影
- 通过范围检查避免远处物体错误遮蔽近处物体
- 指数调整提供更自然的暗角控制

#### SSR效果着色器

**文件路径**: `src/effects/glsl/ssr/ssr.frag`

```glsl
// 核心片段
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 读取基础数据
    float depth = readDepth(depthTexture, uv);
    vec3 viewPos = getViewPosition(uv, depth);
    vec3 viewNormal = texture2D(normalTexture, uv).xyz * 2.0 - 1.0;
    float roughness = texture2D(materialTexture, uv).r;
    
    // 早期返回：天空或过于粗糙的表面不需要反射
    if(depth >= 1.0 || roughness > maxRoughness) {
        outputColor = inputColor;
        return;
    }
    
    // 计算反射方向
    vec3 viewDir = normalize(viewPos);
    vec3 reflectDir = reflect(viewDir, viewNormal);
    
    // 光线追踪参数
    vec2 hitPixel = vec2(0.0);
    float hitDepth = 0.0;
    
    // 屏幕空间光线追踪
    bool hit = traceScreenSpaceRay(
        viewPos, reflectDir, 
        uv, texelSize,
        minSteps, maxSteps,
        stride, jitter,
        hitPixel, hitDepth
    );
    
    // 处理光线命中结果
    if(hit) {
        // 基于粗糙度的反射模糊
        vec4 reflectColor = vec4(0.0);
        float totalWeight = 0.0;
        
        for(int i = 0; i < BLUR_SAMPLES; i++) {
            vec2 offset = poissonDisk[i] * texelSize * roughness * blurScale;
            float weight = 1.0 / float(BLUR_SAMPLES);
            
            reflectColor += texture2D(inputBuffer, hitPixel + offset) * weight;
            totalWeight += weight;
        }
        
        reflectColor /= totalWeight;
        
        // 反射强度基于Fresnel效应和粗糙度
        float fresnel = computeFresnel(-viewDir, viewNormal, fresnelPower);
        float reflectIntensity = fresnel * (1.0 - roughness * roughnessInfluence);
        
        // 边缘淡出
        float screenEdgeFactor = screenEdgeFade(hitPixel);
        reflectIntensity *= screenEdgeFactor;
        
        // 混合原始颜色和反射颜色
        outputColor = mix(inputColor, reflectColor, reflectIntensity * intensity);
    } else {
        // 未命中时使用原始颜色
        outputColor = inputColor;
    }
}
```

**实现说明**:
- SSR通过在屏幕空间追踪反射光线找到反射点
- 使用`traceScreenSpaceRay`函数实现分层光线追踪
- 基于粗糙度值实现模糊反射，模拟微表面散射
- 结合Fresnel效应计算更真实的反射强度
- 对屏幕边缘反射进行淡出处理，避免突然截断

### 多Pass效果着色器

#### Bloom效果着色器

**文件路径**: `src/effects/glsl/bloom/`

**亮度提取着色器** (`luminance.frag`):
```glsl
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 计算亮度
    float luminance = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    
    // 应用阈值和平滑过渡
    float threshold = max(0.0, luminance - luminanceThreshold);
    threshold = threshold / max(luminanceSmoothing, 0.0001);
    
    // 输出高亮区域
    outputColor = vec4(inputColor.rgb * threshold, 1.0);
}
```

**高斯模糊着色器** (`gaussian-blur.frag`):
```glsl
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 sum = vec4(0.0);
    vec2 texelSize = 1.0 / resolution;
    
    // 一维高斯模糊
    sum += texture2D(inputBuffer, uv - texelSize * direction * 4.0) * 0.051;
    sum += texture2D(inputBuffer, uv - texelSize * direction * 3.0) * 0.0918;
    sum += texture2D(inputBuffer, uv - texelSize * direction * 2.0) * 0.12245;
    sum += texture2D(inputBuffer, uv - texelSize * direction * 1.0) * 0.1531;
    sum += texture2D(inputBuffer, uv) * 0.1633;
    sum += texture2D(inputBuffer, uv + texelSize * direction * 1.0) * 0.1531;
    sum += texture2D(inputBuffer, uv + texelSize * direction * 2.0) * 0.12245;
    sum += texture2D(inputBuffer, uv + texelSize * direction * 3.0) * 0.0918;
    sum += texture2D(inputBuffer, uv + texelSize * direction * 4.0) * 0.051;
    
    outputColor = sum;
}
```

**混合着色器** (`bloom-blend.frag`):
```glsl
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 bloomColor = texture2D(bloomTexture, uv);
    
    // 应用强度参数
    bloomColor *= intensity;
    
    // 执行混合模式
    #if BLEND_MODE == 0
        // 加法混合
        outputColor = vec4(inputColor.rgb + bloomColor.rgb, inputColor.a);
    #elif BLEND_MODE == 1
        // 屏幕模式
        outputColor = vec4(1.0 - (1.0 - inputColor.rgb) * (1.0 - bloomColor.rgb), inputColor.a);
    #elif BLEND_MODE == 2
        // 柔光模式
        vec3 result = bloomColor.rgb < 0.5 
            ? (2.0 * inputColor.rgb * bloomColor.rgb + inputColor.rgb * inputColor.rgb * (1.0 - 2.0 * bloomColor.rgb))
            : (2.0 * inputColor.rgb * (1.0 - bloomColor.rgb) + sqrt(inputColor.rgb) * (2.0 * bloomColor.rgb - 1.0));
        outputColor = vec4(result, inputColor.a);
    #endif
    
    // 防止过亮
    outputColor = clamp(outputColor, 0.0, 1.0);
}
```

**实现说明**:
- Bloom效果分为三个主要Pass：亮度提取、模糊处理和最终混合
- 亮度提取Pass使用阈值和平滑参数分离高亮区域
- 高斯模糊Pass使用两次一维模糊(水平+垂直)代替二维模糊，提高性能
- 混合Pass支持多种混合模式，适应不同场景需求
- 在JS实现中，通常会使用多级降采样进一步提高性能

## 常见问题与解决方案

### 采样伪影

#### 问题描述
后处理效果中，不合适的采样策略容易导致伪影，如：
- 摩尔纹
- 锯齿
- 闪烁
- 条纹

#### 解决方案

1. **使用抖动采样**

```glsl
// 抖动采样
vec2 jitter = hash22(gl_FragCoord.xy + float(frame) * 0.1) * texelSize;
vec2 jitteredUV = uv + jitter * jitterAmount;
```

2. **旋转采样方向**

```glsl
// 旋转采样向量减少规则图案
float angle = (hash11(gl_FragCoord.x + gl_FragCoord.y * 2.0) * 2.0 - 1.0) * 3.14159;
float s = sin(angle), c = cos(angle);
mat2 rotation = mat2(c, -s, s, c);
```

3. **采用分层采样**

```glsl
// 分层采样
for(int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + hash11(uv.x + uv.y + frame * 0.01)) / float(SAMPLES);
    // 使用t作为样本参数
}
```

### 兼容性问题

#### 问题描述
WebGL在不同平台和设备上的实现差异可能导致兼容性问题：
- 浮点纹理支持受限
- 纹理精度差异
- 扩展可用性不同
- 着色器编译错误

#### 解决方案

1. **精度声明适配**

```glsl
// 根据平台调整精度
#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
#else
    precision mediump float;
#endif
```

2. **检测扩展并回退**

```javascript
// JS中检测扩展并提供回退
const hasFloatTextures = 
    renderer.capabilities.isWebGL2 || 
    renderer.extensions.get("OES_texture_float");

const rtFormat = hasFloatTextures ? THREE.FloatType : THREE.HalfFloatType;
```

3. **平台特定着色器变体**

```javascript
// 根据平台生成不同着色器变体
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const defines = new Map();

if (isMobile) {
    defines.set("MOBILE", "1");
    defines.set("SAMPLES", "8"); // 降低移动设备采样数
} else {
    defines.set("SAMPLES", "16");
}
```

### 性能瓶颈

#### 问题描述
后处理效果容易成为性能瓶颈，特别是：
- 过多纹理采样
- 复杂数学运算
- 高分辨率处理
- 多效果叠加

#### 解决方案

1. **早期返回**

```glsl
// 尽早跳过不需要处理的像素
if (depth > 0.9999) {
    outputColor = inputColor;
    return;
}
```

2. **降采样处理**

```javascript
// 对于大范围效果，先降采样再处理
const resolution = new Vector2(
    Math.round(renderer.width / downsampling),
    Math.round(renderer.height / downsampling)
);
```

3. **简化数学运算**

```glsl
// 使用近似函数
// 原始: pow(x, 5.0)
// 优化: x * x * x * x * x

// 原始: exp(-x)
// 优化: 1.0 / (1.0 + x + 0.48*x*x + 0.235*x*x*x)
```

## 最佳实践

### 命名规范

为保持代码可读性和一致性，请遵循以下命名规范：

1. **文件命名**
   - 效果着色器: `effect-name.frag`
   - 多Pass着色器: `effect-name/pass-name.frag`
   - 顶点着色器: `effect-name.vert`

2. **变量命名**
   - uniforms: 使用camelCase，如`inputBuffer`, `texelSize`
   - 常量: 使用大写下划线，如`MAX_SAMPLES`
   - 局部变量: 使用camelCase，如`worldPos`, `totalWeight`

3. **函数命名**
   - 使用camelCase，如`linearDepth`, `getWorldPosition`
   - 主函数保持为`mainImage`以兼容框架

### 注释标准

良好的注释对于着色器理解至关重要：

```glsl
// 着色器开头的总体说明
/**
 * 实现基于XYZ算法的ABC效果。
 * 参考文献: "Paper Title" by Author (Year)
 */

// 参数说明
uniform float intensity; // 效果强度 [0.0, 2.0]
uniform int samples; // 采样数量，影响质量和性能

// 算法步骤注释
// 步骤1: 计算世界空间位置和法线
vec3 worldPos = getWorldPosition(uv, depth);
vec3 normal = decodeNormal(normalTexture, uv);

// 复杂算法解释
// 使用Hammersley序列生成半球采样点
// 这提供了比随机采样更均匀的分布
for(int i = 0; i < SAMPLES; i++) {
    vec2 xi = hammersley2d(i, SAMPLES);
    vec3 sampleVec = hemispherePoint(xi, normal);
    // ...
}
```

### 优化指南

开发高效着色器的一些关键原则：

1. **减少分支**
   - 条件分支在GPU上开销很大
   - 尽可能使用数学表达式代替if语句
   - 例如: `result = condition ? valueA : valueB`

2. **最小化纹理读取**
   - 纹理读取是常见瓶颈
   - 缓存已读取的纹理值而不是重复读取
   - 使用二维查找替代多次一维查找

3. **利用硬件加速函数**
   - 使用内置函数如`mix`, `clamp`, `smoothstep`
   - 这些通常有硬件实现，比自定义实现更快

4. **平衡精度与性能**
   - 不总是需要highp精度
   - 对于颜色计算，mediump通常足够
   - 对于位置计算，可能需要highp以避免精度问题

## 参考资源

### 学习资源

- [The Book of Shaders](https://thebookofshaders.com/) - GLSL着色器基础
- [LearnOpenGL](https://learnopengl.com/) - 包含后处理相关章节
- [Shadertoy](https://www.shadertoy.com/) - 着色器效果示例和实验

### 工具推荐

- [Shader Minifier](https://github.com/laurentlb/Shader_Minifier) - 优化着色器大小
- [glslify](https://github.com/glslify/glslify) - 着色器模块化工具
- [RenderDoc](https://renderdoc.org/) - GPU调试工具

### 参考文献

- ["Real-time Rendering"](http://www.realtimerendering.com/) - 后处理效果理论
- ["GPU Gems"](https://developer.nvidia.com/gpugems/gpugems) - NVIDIA系列文章
- ["ShaderX" series](https://www.taylorfrancis.com/books/mono/10.1201/b10642/shaderx2-wolfgang-engel) - 着色器技术系列书籍 