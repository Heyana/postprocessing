# 双边滤波降噪效果实现指南

## 1. 效果概述与原理

双边滤波降噪是一种高效的图像降噪技术，相比普通的高斯模糊，它能够在平滑噪点的同时保留图像的边缘和细节。双边滤波在计算机图形学中被广泛应用于以下场景：

1. **降低渲染噪点** - 减少光线追踪、环境光遮蔽等技术产生的随机噪点
2. **平滑过渡区域** - 保持边缘锐利的同时平滑渐变区域
3. **增强低采样渲染** - 改善低采样率渲染的视觉质量
4. **后处理效果增强** - 提高泛光、景深等效果的视觉质量

### 1.1 基本原理

双边滤波的核心思想是结合空间距离和颜色相似度来计算像素的加权平均值。与普通高斯模糊只考虑空间距离不同，双边滤波同时考虑：

1. **空间权重** - 基于像素的空间距离（与高斯模糊相同）
2. **范围权重** - 基于像素值的相似度（保留边缘的关键）

这种双重加权机制使得在平滑相似区域的同时，边缘和细节可以得到保留。

### 1.2 滤波算法公式

双边滤波的数学表达式为：

![双边滤波公式](https://render.githubusercontent.com/render/math?math=I_{filtered}(p)=\frac{1}{W_p}\sum_{q\in{S}}G_{\sigma_s}(||p-q||)G_{\sigma_r}(|I(p)-I(q)|)I(q))

其中：
- $I_{filtered}(p)$ 是滤波后像素 p 的值
- $S$ 是以像素 p 为中心的窗口区域
- $G_{\sigma_s}$ 是基于空间距离的高斯函数
- $G_{\sigma_r}$ 是基于像素值差异的高斯函数
- $W_p$ 是归一化因子，确保权重和为1

## 2. 效果实现

### 2.1 核心实现思路

双边滤波降噪效果的实现主要包括以下步骤：

1. 创建 `DenoiseEffect` 类，继承自基本的 `Effect` 类
2. 设计双边滤波着色器，实现降噪算法
3. 提供参数控制接口，用于调整降噪强度、半径和边缘保留程度
4. 优化实现以确保良好的性能

### 2.2 JavaScript 类结构

```javascript
import { Uniform, Vector2 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

import fragmentShader from "./glsl/bilateral-denoise.frag";

/**
 * 双边滤波降噪效果 - 在平滑噪点的同时保留边缘细节
 */
export class DenoiseEffect extends Effect {
    /**
     * 构造一个新的双边滤波降噪效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.radius=4.0] - 滤波半径，值越大影响范围越广
     * @param {Number} [options.strength=0.5] - 降噪强度，值越大效果越明显
     * @param {Number} [options.luminanceOnly=false] - 是否仅对亮度通道应用降噪
     * @param {Number} [options.edgePreservation=0.5] - 边缘保留强度，值越大边缘越锐利
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        radius = 4.0,
        strength = 0.5,
        luminanceOnly = false,
        edgePreservation = 0.5
    } = {}) {
        super("DenoiseEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["texelSize", new Uniform(new Vector2())],
                ["radius", new Uniform(radius)],
                ["strength", new Uniform(strength)],
                ["luminanceOnly", new Uniform(luminanceOnly)],
                ["edgePreservation", new Uniform(edgePreservation)]
            ])
        });
    }

    /**
     * 降噪半径
     */
    get radius() {
        return this.uniforms.get("radius").value;
    }

    set radius(value) {
        this.uniforms.get("radius").value = value;
    }

    /**
     * 降噪强度
     */
    get strength() {
        return this.uniforms.get("strength").value;
    }

    set strength(value) {
        this.uniforms.get("strength").value = value;
    }

    /**
     * 是否仅对亮度通道应用降噪
     */
    get luminanceOnly() {
        return this.uniforms.get("luminanceOnly").value;
    }

    set luminanceOnly(value) {
        this.uniforms.get("luminanceOnly").value = value;
    }

    /**
     * 边缘保留强度
     */
    get edgePreservation() {
        return this.uniforms.get("edgePreservation").value;
    }

    set edgePreservation(value) {
        this.uniforms.get("edgePreservation").value = value;
    }

    /**
     * 当渲染尺寸改变时更新纹素大小
     */
    setSize(width, height) {
        this.uniforms.get("texelSize").value.set(1.0 / width, 1.0 / height);
    }
}
```

### 2.3 GLSL 着色器实现

双边滤波降噪的核心逻辑位于片段着色器中：

```glsl
uniform vec2 texelSize;
uniform float radius;
uniform float strength;
uniform bool luminanceOnly;
uniform float edgePreservation;

// 获取亮度函数
float getLuminance(const in vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// RGB转YCbCr（如果仅处理亮度通道）
vec3 rgbToYCbCr(const in vec3 rgb) {
    float y = getLuminance(rgb);
    float cb = 0.5 + (rgb.b - y) * 0.564;
    float cr = 0.5 + (rgb.r - y) * 0.713;
    return vec3(y, cb, cr);
}

// YCbCr转RGB
vec3 yCbCrToRgb(const in vec3 yCbCr) {
    float y = yCbCr.x;
    float cb = yCbCr.y - 0.5;
    float cr = yCbCr.z - 0.5;
    
    float r = y + 1.403 * cr;
    float g = y - 0.344 * cb - 0.714 * cr;
    float b = y + 1.770 * cb;
    
    return vec3(r, g, b);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 中心像素
    vec4 centerColor = texture2D(inputBuffer, uv);
    
    // 如果仅处理亮度通道，则转换为YCbCr
    vec3 centerYCbCr = luminanceOnly ? rgbToYCbCr(centerColor.rgb) : centerColor.rgb;
    
    // 双边滤波设置
    float sigmaSpace = radius;
    float sigmaColor = 0.1 + (1.0 - edgePreservation) * 0.2;
    
    // 定义滤波内核大小
    const int kernelSize = 9; // 实际半径: (kernelSize - 1) / 2
    const int kernelRadius = 4;
    
    // 累积变量
    vec3 filteredColor = vec3(0.0);
    float totalWeight = 0.0;
    
    // 双边滤波循环
    for(int offsetX = -kernelRadius; offsetX <= kernelRadius; offsetX++) {
        for(int offsetY = -kernelRadius; offsetY <= kernelRadius; offsetY++) {
            // 样本位置
            vec2 sampleUv = uv + vec2(float(offsetX), float(offsetY)) * texelSize * radius / float(kernelRadius);
            
            // 样本颜色
            vec4 sampleColor = texture2D(inputBuffer, sampleUv);
            vec3 sampleYCbCr = luminanceOnly ? rgbToYCbCr(sampleColor.rgb) : sampleColor.rgb;
            
            // 计算空间权重（基于距离）
            float distSquared = float(offsetX * offsetX + offsetY * offsetY);
            float spatialWeight = exp(-distSquared / (2.0 * sigmaSpace * sigmaSpace));
            
            // 计算范围权重（基于颜色差异）
            vec3 colorDiff = centerYCbCr - sampleYCbCr;
            float colorDistSquared = dot(colorDiff, colorDiff);
            float rangeWeight = exp(-colorDistSquared / (2.0 * sigmaColor * sigmaColor));
            
            // 计算总权重
            float weight = spatialWeight * rangeWeight;
            
            // 累积加权颜色
            filteredColor += (luminanceOnly ? sampleYCbCr : sampleColor.rgb) * weight;
            totalWeight += weight;
        }
    }
    
    // 归一化结果
    filteredColor /= totalWeight;
    
    // 如果仅处理亮度通道，则转换回RGB
    vec3 resultColor = luminanceOnly ? yCbCrToRgb(filteredColor) : filteredColor;
    
    // 混合原始颜色和滤波后的颜色
    vec3 finalColor = mix(centerColor.rgb, resultColor, strength);
    
    // 输出结果
    outputColor = vec4(finalColor, centerColor.a);
}
```

## 3. 优化与性能考量

双边滤波是一种计算密集型操作，有多种优化策略可以提高性能：

### 3.1 分离式双边滤波

分离式双边滤波将2D滤波分解为两次1D滤波，虽然不是完全等效，但能显著提高性能：

```glsl
// 水平pass
vec4 horizontalPass(sampler2D tex, vec2 uv) {
    // 实现水平方向的1D双边滤波
}

// 垂直pass
vec4 verticalPass(sampler2D tex, vec2 uv) {
    // 实现垂直方向的1D双边滤波
}

// 主函数中调用两次pass
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 horizontal = horizontalPass(inputBuffer, uv);
    outputColor = verticalPass(horizontalBuffer, uv); // 需要额外的缓冲区
}
```

### 3.2 可变采样策略

根据设备性能动态调整采样数量：

```javascript
// 在DenoiseEffect类中添加质量设置
constructor({
    // ...其他参数
    quality = "medium" // "low", "medium", "high"
} = {}) {
    // 根据质量设置不同的采样参数
    let samplesPerAxis;
    switch(quality) {
        case "low": samplesPerAxis = 5; break;
        case "medium": samplesPerAxis = 9; break;
        case "high": samplesPerAxis = 13; break;
        default: samplesPerAxis = 9;
    }
    
    super("DenoiseEffect", fragmentShader, {
        // ...其他设置
        defines: new Map([
            ["SAMPLES_PER_AXIS", samplesPerAxis.toFixed(0)]
        ])
    });
}
```

### 3.3 下采样预处理

对输入图像进行下采样，在低分辨率上执行滤波，然后上采样回原始分辨率：

```javascript
// 在DenoiseEffect类中添加分辨率缩放
constructor({
    // ...其他参数
    resolutionScale = 1.0
} = {}) {
    super("DenoiseEffect", fragmentShader, {
        // ...其他设置
    });
    
    // 设置分辨率缩放
    if(resolutionScale !== 1.0) {
        this.resolution = new Resolution(this, resolutionScale, resolutionScale);
    }
}
```

## 4. 实现步骤指南

### 4.1 创建基础文件结构

1. 在 `src/effects/` 目录下创建 `DenoiseEffect.js`
2. 在 `src/effects/glsl/` 目录下创建 `bilateral-denoise.frag`
3. 在 `src/index.js` 中导出新的效果类

### 4.2 实现 GLSL 着色器

实现双边滤波的片段着色器，如上述代码所示。

### 4.3 实现 JavaScript 类

实现 `DenoiseEffect` 类，提供参数控制接口和必要的方法。

### 4.4 添加到导出

在 `src/index.js` 中添加导出：

```javascript
export { DenoiseEffect } from "./effects/DenoiseEffect.js";
```

### 4.5 创建示例和文档

创建使用示例和详细文档，展示如何集成和使用该效果。

## 5. 参数调整指南

### 5.1 主要参数说明

- **radius** (半径)：控制滤波窗口的大小，值越大平滑范围越广，但计算量也越大。
  - 推荐范围：2.0 - 10.0，默认值：4.0
  - 低值：保留更多细节，但降噪效果有限
  - 高值：更强的平滑效果，但可能丢失细节

- **strength** (强度)：控制降噪效果的整体强度，即原始图像和滤波后图像的混合比例。
  - 推荐范围：0.0 - 1.0，默认值：0.5
  - 低值：轻微降噪，保留更多原始图像细节
  - 高值：强烈降噪，更平滑的结果

- **edgePreservation** (边缘保留)：控制边缘和细节的保留程度。
  - 推荐范围：0.0 - 1.0，默认值：0.5
  - 低值：更平滑的结果，边缘可能被模糊
  - 高值：更好地保留边缘，但噪点也可能被保留

- **luminanceOnly** (仅亮度)：决定是否仅对亮度通道应用降噪，保留色彩信息。
  - 布尔值：true/false，默认值：false
  - true：仅处理亮度，保留颜色，通常性能更好
  - false：处理所有通道，效果更均匀

### 5.2 不同场景的参数推荐

| 场景类型 | radius | strength | edgePreservation | luminanceOnly |
|---------|--------|----------|------------------|---------------|
| 光线追踪渲染 | 6.0    | 0.7      | 0.6              | false         |
| 环境光遮蔽 | 4.0    | 0.5      | 0.7              | true          |
| 泛光后处理 | 3.0    | 0.4      | 0.5              | false         |
| 体积雾效果 | 5.0    | 0.6      | 0.4              | false         |
| 低采样渲染 | 7.0    | 0.8      | 0.5              | false         |

## 6. 与其他效果的组合

### 6.1 降噪和锐化组合

降噪和锐化是互补的效果，通常先应用降噪去除噪点，然后应用锐化恢复细节：

```javascript
// 创建降噪效果
const denoiseEffect = new DenoiseEffect({
    radius: 4.0,
    strength: 0.5,
    edgePreservation: 0.6
});

// 创建锐化效果
const sharpenEffect = new SharpenEffect({
    intensity: 0.3,
    kernelSize: 1.0
});

// 先应用降噪，再应用锐化
composer.addPass(new EffectPass(camera, denoiseEffect));
composer.addPass(new EffectPass(camera, sharpenEffect));
```

### 6.2 降噪和其他后处理效果

降噪通常应该在以下效果之前应用：
- 色调映射
- 颜色分级
- 锐化

降噪通常应该在以下效果之后应用：
- 环境光遮蔽 (SSAO)
- 屏幕空间反射 (SSR)
- 体积光 (Volumetric Lighting)

## 7. 代码示例

### 7.1 基本使用示例

```javascript
import { EffectComposer, EffectPass, RenderPass, DenoiseEffect } from "postprocessing";
import { WebGLRenderer, Scene, PerspectiveCamera } from "three";

// 创建基本渲染设置
const renderer = new WebGLRenderer();
const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// 创建效果合成器
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// 创建降噪效果
const denoiseEffect = new DenoiseEffect({
    radius: 4.0,
    strength: 0.5,
    edgePreservation: 0.6,
    luminanceOnly: false
});

// 添加降噪通道
composer.addPass(new EffectPass(camera, denoiseEffect));

// 渲染循环
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
```

### 7.2 带GUI控制的示例

```javascript
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';

// 创建GUI
const gui = new GUI();
const denoiseFolder = gui.addFolder('降噪效果');

// 添加控制参数
denoiseFolder.add(denoiseEffect, 'radius', 1.0, 10.0, 0.1).name('滤波半径');
denoiseFolder.add(denoiseEffect, 'strength', 0.0, 1.0, 0.01).name('降噪强度');
denoiseFolder.add(denoiseEffect, 'edgePreservation', 0.0, 1.0, 0.01).name('边缘保留');
denoiseFolder.add(denoiseEffect, 'luminanceOnly').name('仅亮度通道');
```

### 7.3 自适应降噪示例

类似于自适应锐化，我们可以创建自适应降噪效果，根据图像内容动态调整参数：

```javascript
// 自适应降噪着色器片段
float adaptiveStrength = strength;

// 计算局部对比度
float centerLuma = getLuminance(centerColor.rgb);
float avgLuma = 0.0;
// ... 计算周围像素的平均亮度

// 计算对比度
float contrast = abs(centerLuma - avgLuma);

// 根据对比度调整强度 - 高对比度区域少降噪，低对比度区域多降噪
adaptiveStrength *= smoothstep(threshold, 0.0, contrast);

// 使用自适应强度
vec3 finalColor = mix(centerColor.rgb, resultColor, adaptiveStrength);
```

## 8. 常见问题与解决方案

### 8.1 过度平滑导致细节丢失

如果降噪效果导致图像过度平滑，丢失重要细节：
1. 减小 `radius` 值，使滤波范围更小
2. 增加 `edgePreservation` 值，更好地保留边缘和细节
3. 减小 `strength` 值，降低整体降噪强度
4. 考虑启用 `luminanceOnly`，仅对亮度通道应用降噪

### 8.2 边缘处理不佳

如果降噪在边缘处出现伪影或不自然过渡：
1. 调整 `edgePreservation` 值
2. 考虑使用深度信息辅助降噪，在边缘处减弱效果
3. 实现更复杂的自适应降噪算法，考虑局部图像特征

### 8.3 性能问题

如果降噪效果导致严重的性能下降：
1. 减小 `radius` 值，减少采样点数量
2. 使用分离式双边滤波实现
3. 应用分辨率缩放，在较低分辨率上执行滤波
4. 考虑降低质量设置，减少采样数量

## 9. 未来扩展方向

双边滤波降噪效果可以进一步扩展和改进：

1. **引导式滤波** - 使用额外的引导图像（如深度、法线）提高边缘保留质量
2. **非局部均值滤波** - 实现更高级的降噪算法，搜索整个图像的相似区域
3. **时域累积** - 结合多帧信息进行时域降噪，显著提高效果质量
4. **自适应参数** - 根据场景内容和渲染设置自动调整最佳参数
5. **AI增强降噪** - 结合机器学习技术，实现更智能的降噪算法

## 10. 总结

双边滤波降噪是一种强大而高效的降噪技术，能够在保留图像细节和边缘的同时有效减少噪点。通过合理设置参数和优化实现，可以在实时渲染中获得高质量的降噪效果，提升整体视觉质量。

结合本文档提供的实现思路和代码示例，您可以轻松将双边滤波降噪效果集成到现有的后处理系统中，并根据需要进行自定义和扩展。 