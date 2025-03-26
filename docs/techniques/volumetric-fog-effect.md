# 体积雾效果 (VolumetricFogEffect) 技术文档

## 1. 概述

体积雾效果是一种模拟大气散射现象的后处理效果，能够为3D场景增加深度感、氛围感和真实感。不同于传统的基于深度的雾效果，体积雾可以模拟光线在雾气介质中的传播、散射和衰减，使光源能够照亮雾气，形成如光束、光晕等逼真的视觉效果。

### 1.1 主要特性

- **真实的大气散射** - 模拟光线在雾气介质中的散射现象
- **光源交互** - 雾气会被场景中的光源照亮
- **可变密度** - 支持基于高度或噪声的非均匀密度
- **与场景几何体交互** - 考虑场景深度信息，避免雾气穿透物体
- **时间变化** - 支持雾气动态变化，如漂浮和流动

### 1.2 视觉效果对比

| 无雾效果 | 简单深度雾 | 体积雾效果 |
|---------|-----------|-----------|
| 场景清晰可见，缺乏大气感 | 远处物体变淡，但无光照交互 | 光线可见，体积感强，大气层次丰富 |

## 2. 理论背景

### 2.1 体积散射基础

体积雾的物理基础是光线在参与介质中的传播理论。当光线穿过有雾的环境时，会发生三种主要现象：

1. **散射 (Scattering)** - 光线被微小粒子改变方向
2. **吸收 (Absorption)** - 光线能量被介质吸收转化为热能
3. **发射 (Emission)** - 介质本身发光（如火焰）

体积渲染方程描述了这一过程：

```
L(x, ω) = T(x, x_s) * L_s(x_s, ω) + ∫[x, x_s] T(x, x_t) * σ(x_t) * L_i(x_t, ω) dt
```

其中：
- L(x, ω) 是从位置x沿方向ω观察到的辐射度
- T(x, y) 是从x到y的透射率（衰减函数）
- σ(x) 是位置x处的散射系数
- L_i 是入射辐射度

### 2.2 光线步进（Ray Marching）

实时渲染中通常使用光线步进技术来近似体积散射积分。这一过程包括：

1. 沿视线方向采样多个点
2. 计算每个采样点处的散射贡献
3. 将所有贡献累加得到最终颜色

## 3. 实现方法

### 3.1 基本实现流程

1. **渲染深度和场景颜色** - 标准渲染通道
2. **光线步进计算** - 后处理着色器中实现
3. **光照交互** - 计算光源对雾气的贡献
4. **与原场景混合** - 结合原始场景颜色得到最终效果

### 3.2 核心着色器代码

#### 3.2.1 体积雾顶点着色器

```glsl
varying vec2 vUv;
varying vec3 vRayOrigin;
varying vec3 vRayDir;

uniform mat4 cameraMatrixWorld;
uniform mat4 projectionMatrixInv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    
    // 计算世界空间中的光线原点和方向
    vec4 ndcRay = vec4(
        (uv.x - 0.5) * 2.0,
        (uv.y - 0.5) * 2.0,
        1.0,
        1.0
    );
    
    vec4 rayOrigin = cameraMatrixWorld * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 rayDir = projectionMatrixInv * ndcRay;
    rayDir = cameraMatrixWorld * vec4(normalize(rayDir.xyz), 0.0);
    
    vRayOrigin = rayOrigin.xyz;
    vRayDir = rayDir.xyz;
}
```

#### 3.2.2 体积雾片段着色器

```glsl
uniform sampler2D tDepth;
uniform sampler2D tColor;
uniform vec2 resolution;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float fogHeightFalloff;
uniform float fogBaseHeight;
uniform vec3 lightPosition;
uniform vec3 lightColor;
uniform float lightIntensity;
uniform float scatteringCoefficient;
uniform float extinction;
uniform mat4 projectionMatrix;
uniform float cameraNear;
uniform float cameraFar;

varying vec2 vUv;
varying vec3 vRayOrigin;
varying vec3 vRayDir;

// 深度值转换为线性深度
float getLinearDepth(float depth) {
    float z = depth * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

// 基于高度的雾密度
float getDensity(vec3 position) {
    float height = position.y;
    float heightFactor = exp(-fogHeightFalloff * max(0.0, height - fogBaseHeight));
    return fogDensity * heightFactor;
}

// 静态噪声函数（可用更复杂的噪声如Perlin噪声）
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    
    vec2 uv = (i.xy+vec2(37.0,17.0)*i.z) + f.xy;
    vec2 rg = texture2D(tNoiseTexture, (uv + 0.5)/256.0).yx;
    return mix(rg.x, rg.y, f.z);
}

// 光线步进主函数
vec4 raymarch(vec3 rayOrigin, vec3 rayDir, float tMax) {
    const int MAX_STEPS = 64;
    float stepSize = tMax / float(MAX_STEPS);
    
    vec3 totalScattering = vec3(0.0);
    float transmittance = 1.0;
    
    for (int i = 0; i < MAX_STEPS; i++) {
        float t = float(i) * stepSize;
        vec3 position = rayOrigin + rayDir * t;
        
        // 计算当前点的密度
        float density = getDensity(position);
        
        // 可以添加噪声使雾不均匀
        // density *= (0.8 + 0.4 * noise(position * 0.1));
        
        if (density > 0.0) {
            // 光线从当前点到光源的传播
            vec3 lightDir = normalize(lightPosition - position);
            float lightDist = length(lightPosition - position);
            
            // 计算从当前点到光源的透射率（简化为指数衰减）
            float lightTransmittance = exp(-extinction * density * lightDist);
            
            // 计算当前点的散射贡献
            vec3 scattering = lightColor * lightIntensity * scatteringCoefficient * 
                              density * lightTransmittance;
            
            // 考虑从当前点到相机的透射率
            totalScattering += transmittance * scattering * stepSize;
            
            // 更新透射率
            transmittance *= exp(-extinction * density * stepSize);
            
            // 优化：如果透射率已经很低，提前退出
            if (transmittance < 0.01) {
                break;
            }
        }
    }
    
    return vec4(totalScattering, 1.0 - transmittance);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 获取场景深度
    float depth = texture2D(tDepth, uv).x;
    float linearDepth = getLinearDepth(depth);
    
    // 计算光线长度（从相机到场景表面）
    float tMax = linearDepth;
    
    // 执行光线步进
    vec4 fogResult = raymarch(vRayOrigin, vRayDir, tMax);
    
    // 混合原始场景颜色和雾效果
    outputColor = mix(inputColor, vec4(fogColor, 1.0), fogResult.a);
    outputColor.rgb += fogResult.rgb; // 添加散射光贡献
}
```

### 3.3 JavaScript实现代码

```javascript
import { Uniform, Vector2, Vector3, Color, Matrix4 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

import fragmentShader from "./glsl/volumetric-fog.frag";
import vertexShader from "./glsl/volumetric-fog.vert";

/**
 * 体积雾效果 - 模拟光线在大气中的散射
 */
export class VolumetricFogEffect extends Effect {
    /**
     * 构造一个新的体积雾效果
     * 
     * @param {Scene} scene - 要渲染的场景
     * @param {Camera} camera - 相机
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.density=0.05] - 雾气密度
     * @param {Number} [options.heightFalloff=0.1] - 高度衰减系数
     * @param {Number} [options.baseHeight=0] - 基准高度
     * @param {Color} [options.color=new Color(0xffffff)] - 雾气颜色
     * @param {Number} [options.scattering=0.2] - 散射系数
     * @param {Number} [options.extinction=0.1] - 衰减系数
     * @param {Number} [options.samples=64] - 采样次数
     * @param {Number} [options.resolutionScale=0.5] - 分辨率缩放
     */
    constructor(scene, camera, {
        blendFunction = BlendFunction.NORMAL,
        density = 0.05,
        heightFalloff = 0.1,
        baseHeight = 0,
        color = new Color(0xffffff),
        scattering = 0.2,
        extinction = 0.1,
        samples = 64,
        resolutionScale = 0.5
    } = {}) {
        super("VolumetricFogEffect", fragmentShader, {
            blendFunction,
            vertexShader: vertexShader,
            uniforms: new Map([
                ["tDepth", new Uniform(null)],
                ["tColor", new Uniform(null)],
                ["resolution", new Uniform(new Vector2())],
                ["fogColor", new Uniform(new Color(color))],
                ["fogDensity", new Uniform(density)],
                ["fogHeightFalloff", new Uniform(heightFalloff)],
                ["fogBaseHeight", new Uniform(baseHeight)],
                ["lightPosition", new Uniform(new Vector3(0, 10, 0))],
                ["lightColor", new Uniform(new Color(0xffffff))],
                ["lightIntensity", new Uniform(1.0)],
                ["scatteringCoefficient", new Uniform(scattering)],
                ["extinction", new Uniform(extinction)],
                ["cameraMatrixWorld", new Uniform(new Matrix4())],
                ["projectionMatrixInv", new Uniform(new Matrix4())],
                ["cameraNear", new Uniform(0.1)],
                ["cameraFar", new Uniform(100.0)],
                ["stepSize", new Uniform(1.0 / samples)]
            ])
        });

        this.scene = scene;
        this.camera = camera;
        this.samples = samples;
        this.resolutionScale = resolutionScale;
        
        // 更新相机相关参数
        this.uniforms.get("cameraNear").value = camera.near;
        this.uniforms.get("cameraFar").value = camera.far;
    }

    /**
     * 体积雾密度
     * @type {Number}
     */
    get density() {
        return this.uniforms.get("fogDensity").value;
    }

    set density(value) {
        this.uniforms.get("fogDensity").value = value;
    }

    /**
     * 高度衰减系数
     * @type {Number}
     */
    get heightFalloff() {
        return this.uniforms.get("fogHeightFalloff").value;
    }

    set heightFalloff(value) {
        this.uniforms.get("fogHeightFalloff").value = value;
    }

    /**
     * 雾气颜色
     * @type {Color}
     */
    get color() {
        return this.uniforms.get("fogColor").value;
    }

    set color(value) {
        this.uniforms.get("fogColor").value = value;
    }

    /**
     * 散射系数
     * @type {Number}
     */
    get scattering() {
        return this.uniforms.get("scatteringCoefficient").value;
    }

    set scattering(value) {
        this.uniforms.get("scatteringCoefficient").value = value;
    }

    /**
     * 设置主光源位置和颜色（将用于照亮雾气）
     * @param {Vector3} position - 光源位置
     * @param {Color} color - 光源颜色
     * @param {Number} intensity - 光源强度
     */
    setLight(position, color, intensity = 1.0) {
        this.uniforms.get("lightPosition").value.copy(position);
        this.uniforms.get("lightColor").value.copy(color);
        this.uniforms.get("lightIntensity").value = intensity;
    }

    /**
     * 更新效果
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
     * @param {Number} deltaTime - 时间增量
     */
    update(renderer, inputBuffer, deltaTime) {
        // 更新相机矩阵
        this.uniforms.get("cameraMatrixWorld").value.copy(this.camera.matrixWorld);
        this.uniforms.get("projectionMatrixInv").value.copy(this.camera.projectionMatrix).invert();
    }

    /**
     * 设置渲染尺寸
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        this.uniforms.get("resolution").value.set(width, height);
    }
}
```

## 4. 性能优化

体积雾效果计算密集，需要多种优化技术保证性能：

### 4.1 采样优化

- **自适应采样** - 根据深度和视角调整采样频率
- **空间加速结构** - 跳过空区域的采样
- **深度差采样** - 在物体表面附近使用更多采样点

```glsl
// 自适应采样示例
float adaptiveStepSize = stepSize * (0.5 + 0.5 * linearDepth / cameraFar);
```

### 4.2 分辨率控制

- **降低渲染分辨率** - 使用较低分辨率计算体积雾
- **上采样与模糊** - 计算后使用智能上采样减少锯齿

```javascript
// 在合成器中设置不同分辨率的渲染目标
const resolution = new Resolution(this, width, height, resolutionScale);
```

### 4.3 帧间优化

- **时间重用** - 复用上一帧的计算结果
- **时间抖动** - 在多帧间分布采样点
- **渐进式渲染** - 对静态场景进行渐进式细化

```glsl
// 时间抖动示例（片段着色器中）
float offset = hash(vUv + time * 0.01);
rayOrigin += rayDir * offset * stepSize;
```

### 4.4 硬件优化

- **利用计算着色器** - 在支持的平台上使用计算着色器
- **利用GPU纹理插值** - 减少手动采样次数
- **体积纹理缓存** - 预计算并缓存体积数据

## 5. 集成指南

### 5.1 与EffectComposer集成

```javascript
// 创建体积雾效果
const volumetricFog = new VolumetricFogEffect(scene, camera, {
    density: 0.05,
    heightFalloff: 0.1,
    color: new Color(0xaabbff),
    resolutionScale: 0.5
});

// 添加到效果管线
const fogPass = new EffectPass(camera, volumetricFog);
composer.addPass(fogPass);
```

### 5.2 与其他效果组合

体积雾效果通常应该在这些效果之后应用：
- 在SSAO之后（可以利用环境光遮蔽信息）
- 在景深效果之前（雾气本身也可以有景深效果）
- 在泛光效果之前（让雾气也能参与泛光）

```javascript
// 效果顺序示例
composer.addPass(renderPass);       // 基本渲染
composer.addPass(ssaoPass);         // 环境光遮蔽
composer.addPass(volumetricFogPass); // 体积雾
composer.addPass(bloomPass);        // 泛光
composer.addPass(dofPass);          // 景深
```

### 5.3 多光源处理

对于多光源场景，可以采用以下策略：

1. **只考虑主光源** - 最简单但效果有限
2. **累加多个光源** - 为每个重要光源计算散射
3. **使用光照贴图** - 预计算光照信息到3D纹理

```javascript
// 多光源处理示例
function updateLights() {
    // 找到最强光源
    let mainLight = {position: new Vector3(), color: new Color(), intensity: 0};
    
    scene.traverse(obj => {
        if (obj.isLight && obj.intensity > mainLight.intensity) {
            mainLight.position.copy(obj.position);
            mainLight.color.copy(obj.color);
            mainLight.intensity = obj.intensity;
        }
    });
    
    // 更新雾效果中的光源信息
    volumetricFog.setLight(mainLight.position, mainLight.color, mainLight.intensity);
}
```

## 6. 参数调整

### 6.1 核心参数

| 参数名 | 描述 | 典型值范围 | 视觉影响 |
|--------|------|------------|----------|
| density | 雾气密度 | 0.01-0.1 | 整体雾气浓度 |
| heightFalloff | 高度衰减系数 | 0.05-0.5 | 雾气随高度减少的速率 |
| baseHeight | 基准高度 | -10 至 10 | 雾气开始减少的高度 |
| color | 雾气颜色 | RGB颜色 | 雾气的基本颜色 |
| scattering | 散射系数 | 0.1-1.0 | 光线被雾气散射的强度 |
| extinction | 衰减系数 | 0.1-1.0 | 光线穿过雾气的衰减速率 |

### 6.2 常见效果预设

| 效果名称 | 参数设置 | 应用场景 |
|----------|----------|----------|
| 晨雾 | 低密度, 白色/蓝色, 高散射 | 清晨场景, 户外环境 |
| 浓雾 | 高密度, 灰色, 中散射 | 恐怖场景, 迷雾环境 |
| 烟雾 | 变化密度, 暗灰色, 低散射 | 工业场景, 火灾后 |
| 霾/污染 | 中密度, 黄褐色, 低散射 | 城市污染, 沙尘暴 |
| 海雾 | 低密度, 青白色, 高散射 | 海洋场景, 沿海环境 |

```javascript
// 预设例子：晨雾
volumetricFog.density = 0.03;
volumetricFog.color.set(0xc4d7f0);
volumetricFog.scattering = 0.7;
volumetricFog.extinction = 0.2;
volumetricFog.heightFalloff = 0.15;
volumetricFog.baseHeight = -2;
```

## 7. 高级功能

### 7.1 基于噪声的非均匀雾

使用3D噪声函数可以创建更自然的非均匀雾效果：

```glsl
// 在体积雾着色器中添加噪声函数
float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    
    // 进行几次噪声叠加
    for(int i = 0; i < 4; i++) {
        sum += amp * noise(p * freq);
        amp *= 0.5;
        freq *= 2.0;
    }
    
    return sum;
}

// 然后在getDensity函数中应用
float getDensity(vec3 position) {
    float height = position.y;
    float heightFactor = exp(-fogHeightFalloff * max(0.0, height - fogBaseHeight));
    
    // 添加噪声
    float noiseFactor = fbm((position + time * 0.05) * 0.1);
    noiseFactor = 0.5 + 0.5 * noiseFactor;
    
    return fogDensity * heightFactor * noiseFactor;
}
```

### 7.2 体积阴影

要实现体积阴影（光线被物体遮挡后雾气中的阴影），需要:

1. 渲染从光源视角的深度图
2. 在体积散射计算中检查点是否在阴影中

```glsl
// 在片段着色器中添加
uniform sampler2D tLightDepth;
uniform mat4 lightVP; // 光源视图投影矩阵

// 在光线散射计算中
vec4 worldPos = vec4(position, 1.0);
vec4 lightSpacePos = lightVP * worldPos;
vec3 lightProjCoords = lightSpacePos.xyz / lightSpacePos.w;
lightProjCoords = lightProjCoords * 0.5 + 0.5;

float closestDepth = texture2D(tLightDepth, lightProjCoords.xy).r;
float currentDepth = lightProjCoords.z;

// 检查是否在阴影中
float shadow = currentDepth > closestDepth + 0.001 ? 0.5 : 1.0;

// 调整散射计算
scattering *= shadow;
```

### 7.3 体积雾动画

添加时间变化使雾气看起来更生动：

```glsl
// 片段着色器中添加时间uniform
uniform float time;

// 在噪声评估中加入时间
float noiseFactor = fbm((position + vec3(0.0, 0.0, time * 0.1)) * 0.1);

// 或者添加风向效果
vec3 windDirection = vec3(1.0, 0.0, 0.0);
float windStrength = 0.2;
vec3 offsetPos = position + windDirection * time * windStrength;
float noiseFactor = fbm(offsetPos * 0.1);
```

## 8. 应用案例

体积雾效果适用于多种场景：

1. **气氛营造**
   - 恐怖游戏中的浓雾
   - 仙境场景中的轻薄晨雾
   - 工业环境中的烟雾

2. **视觉导向**
   - 使用体积光束引导玩家注意力
   - 隐藏远处细节减少视觉噪音

3. **叙事元素**
   - 表现污染、火灾或魔法效果
   - 创造神秘感和未知感

4. **气象效果**
   - 模拟真实天气如雾、霾
   - 创造幻想环境如魔法烟雾

## 9. 结论与未来发展

体积雾效果是增强场景氛围和真实感的强大工具。通过结合现代渲染技术和性能优化，即使在Web环境下也能实现高质量的体积效果。

### 未来发展方向

1. **体积云效果** - 扩展为更复杂的云层模拟
2. **体积光线传输** - 实现多次散射和次表面散射
3. **与物理系统集成** - 响应物理模拟如流体动力学
4. **实时全局照明** - 结合GI系统实现更真实的光照

---

## 参考资料

1. Hillaire, S. (2016). Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite
2. Schneider, A., & Vos, N. (2015). The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn
3. Wenzel, C. (2006). Real-time Atmospheric Effects in Games
4. Pharr, M., Jakob, W., & Humphreys, G. (2016). Physically Based Rendering: From Theory to Implementation 