# 后处理效果实现指南

本文档提供了几个优先级较高的后处理效果的详细实现思路，包括基本原理、代码结构和与现有项目的集成方式。

## 1. 运动模糊效果 (MotionBlurEffect)

运动模糊是模拟相机快门速度或物体高速运动时产生的模糊效果，能够显著增强动画场景的流畅感和真实感。

### 基本原理

运动模糊有几种实现方法：

1. **基于速度缓冲的运动模糊**：捕获场景中物体的运动速度，然后沿着速度方向进行模糊
2. **相机变换历史的运动模糊**：通过当前帧和前一帧的相机变换矩阵差异计算全局运动模糊
3. **时间累积的运动模糊**：将多个帧混合在一起产生模糊效果

我们将采用基于速度缓冲的方法，这是最常用且效果最好的方法。

### 实现结构

```javascript
import { Uniform, Vector2, WebGLRenderTarget } from "three";
import { Effect } from "./Effect.js";
import { VelocityPass } from "../passes/VelocityPass.js";

// 导入着色器
import fragmentShader from "./glsl/motion-blur.frag";

/**
 * 运动模糊效果
 */
export class MotionBlurEffect extends Effect {
    /**
     * 构造函数
     * @param {Object} [options] - 选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合函数
     * @param {Number} [options.intensity=1.0] - 模糊强度
     * @param {Number} [options.samples=32] - 采样数
     * @param {Number} [options.velocityScaling=1.0] - 速度缩放因子
     * @param {Vector2} [options.jitter=null] - 抖动参数，用于减少闪烁
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        intensity = 1.0,
        samples = 32,
        velocityScaling = 1.0,
        jitter = null
    } = {}) {
        super("MotionBlurEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["velocityTexture", new Uniform(null)],
                ["intensity", new Uniform(intensity)],
                ["samples", new Uniform(samples)],
                ["velocityScaling", new Uniform(velocityScaling)],
                ["jitter", new Uniform(jitter !== null ? jitter : new Vector2(0, 0))]
            ])
        });

        /**
         * 速度通道
         * @type {VelocityPass}
         */
        this.velocityPass = new VelocityPass();

        /**
         * 模糊强度
         * @type {Number}
         */
        this.intensity = intensity;

        /**
         * 采样数量
         * @type {Number}
         */
        this.samples = samples;
    }

    /**
     * 更新效果
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} deltaTime - 帧间时间差(秒)
     */
    update(renderer, inputBuffer, deltaTime) {
        this.velocityPass.render(renderer, inputBuffer);
        this.uniforms.get("velocityTexture").value = this.velocityPass.texture;
    }

    /**
     * 设置大小
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        this.velocityPass.setSize(width, height);
    }

    /**
     * 初始化
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Boolean} alpha - 是否有alpha通道
     * @param {Number} frameBufferType - 帧缓冲类型
     */
    initialize(renderer, alpha, frameBufferType) {
        this.velocityPass.initialize(renderer, alpha, frameBufferType);
    }

    /**
     * 释放资源
     */
    dispose() {
        super.dispose();
        this.velocityPass.dispose();
    }
}
```

### 着色器代码 (motion-blur.frag)

```glsl
uniform sampler2D velocityTexture;
uniform float intensity;
uniform int samples;
uniform float velocityScaling;
uniform vec2 jitter;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 获取速度
    vec2 velocity = texture2D(velocityTexture, uv).rg;
    
    // 应用缩放
    velocity *= velocityScaling * intensity;
    
    // 如果速度太小，直接返回原始颜色
    float velocityLength = length(velocity);
    if(velocityLength < 0.01) {
        outputColor = inputColor;
        return;
    }

    // 沿着速度方向采样
    vec4 result = inputColor;
    float invSamples = 1.0 / float(samples);
    
    for(int i = 1; i < samples; i++) {
        float t = float(i) * invSamples;
        vec2 offset = velocity * t + jitter * t;
        result += texture2D(inputBuffer, uv + offset);
    }
    
    // 平均所有采样
    result *= invSamples;
    
    outputColor = result;
}
```

### 速度通道 (VelocityPass.js)

```javascript
import { 
    Matrix4, ShaderMaterial, UniformsUtils, WebGLRenderTarget 
} from "three";
import { Pass } from "./Pass.js";

// 速度通道着色器
const VelocityShader = {
    uniforms: {
        "tDepth": { value: null },
        "tDiffuse": { value: null },
        "cameraVelocity": { value: new Matrix4() },
        "previousCameraMatrixWorld": { value: new Matrix4() },
        "cameraMatrixWorld": { value: new Matrix4() },
        "projectionMatrix": { value: new Matrix4() },
        "projectionMatrixInverse": { value: new Matrix4() }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDepth;
        uniform sampler2D tDiffuse;
        uniform mat4 cameraVelocity;
        uniform mat4 previousCameraMatrixWorld;
        uniform mat4 cameraMatrixWorld;
        uniform mat4 projectionMatrix;
        uniform mat4 projectionMatrixInverse;
        
        varying vec2 vUv;
        
        void main() {
            // 从深度纹理获取深度
            float depth = texture2D(tDepth, vUv).r;
            
            // 计算世界空间位置
            vec4 clipPosition = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 viewPosition = projectionMatrixInverse * clipPosition;
            viewPosition /= viewPosition.w;
            vec4 worldPosition = cameraMatrixWorld * viewPosition;
            
            // 使用前一帧的相机矩阵计算前一帧的屏幕空间位置
            vec4 previousWorldPosition = worldPosition;
            vec4 previousViewPosition = previousCameraMatrixWorld * previousWorldPosition;
            vec4 previousClipPosition = projectionMatrix * previousViewPosition;
            previousClipPosition /= previousClipPosition.w;
            
            // 计算速度
            vec2 velocity = (clipPosition.xy - previousClipPosition.xy) * 0.5;
            
            // 输出到纹理
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `
};

/**
 * 速度通道
 */
export class VelocityPass extends Pass {
    constructor() {
        super();
        
        this.renderTarget = new WebGLRenderTarget(1, 1);
        
        this.material = new ShaderMaterial({
            uniforms: UniformsUtils.clone(VelocityShader.uniforms),
            vertexShader: VelocityShader.vertexShader,
            fragmentShader: VelocityShader.fragmentShader
        });
        
        this.fullscreenMaterial = this.material;
        
        // 保存前一帧的相机矩阵
        this.previousCameraMatrixWorld = new Matrix4();
    }
    
    get texture() {
        return this.renderTarget.texture;
    }
    
    render(renderer, inputBuffer) {
        const uniforms = this.material.uniforms;
        uniforms["tDepth"].value = this.fullscreenMaterial.uniforms.tDepth.value;
        uniforms["tDiffuse"].value = inputBuffer.texture;
        
        // 更新相机矩阵
        const camera = this.mainCamera;
        
        // 保存当前相机矩阵
        uniforms["previousCameraMatrixWorld"].value.copy(this.previousCameraMatrixWorld);
        uniforms["cameraMatrixWorld"].value.copy(camera.matrixWorld);
        uniforms["projectionMatrix"].value.copy(camera.projectionMatrix);
        uniforms["projectionMatrixInverse"].value.copy(camera.projectionMatrixInverse);
        
        // 渲染到速度缓冲区
        this.renderToScreen = false;
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(this.scene, this.camera);
        
        // 更新前一帧的相机矩阵
        this.previousCameraMatrixWorld.copy(camera.matrixWorld);
    }
}
```

### 与EffectComposer集成

```javascript
// 在应用程序中集成
import { EffectComposer, RenderPass, EffectPass, MotionBlurEffect } from "postprocessing";

// 创建EffectComposer
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 创建运动模糊效果
const motionBlurEffect = new MotionBlurEffect({
    intensity: 1.0,
    samples: 32
});

// 添加效果通道
const effectPass = new EffectPass(camera, motionBlurEffect);
composer.addPass(effectPass);

// 在渲染循环中使用
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
```

## 2. 锐化效果 (SharpenEffect)

锐化效果可以增强图像细节，特别适合在使用了泛光或模糊效果后应用，以保持场景的清晰度。

### 基本原理

锐化通常是通过将图像与其高通滤波版本混合实现的。基本方法是对中心像素赋予较大权重，而对周围像素赋予负权重，这样可以增强边缘和细节。

### 实现结构

```javascript
import { Uniform, Vector2 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

// 导入着色器
import fragmentShader from "./glsl/sharpen.frag";

/**
 * 锐化效果
 */
export class SharpenEffect extends Effect {
    /**
     * 构造函数
     * @param {Object} [options] - 选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合函数
     * @param {Number} [options.intensity=0.5] - 锐化强度
     * @param {Number} [options.radius=1.0] - 锐化半径
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        intensity = 0.5,
        radius = 1.0
    } = {}) {
        super("SharpenEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["intensity", new Uniform(intensity)],
                ["radius", new Uniform(radius)],
                ["texelSize", new Uniform(new Vector2())]
            ])
        });
    }

    /**
     * 锐化强度
     * @type {Number}
     */
    get intensity() {
        return this.uniforms.get("intensity").value;
    }

    set intensity(value) {
        this.uniforms.get("intensity").value = value;
    }

    /**
     * 锐化半径
     * @type {Number}
     */
    get radius() {
        return this.uniforms.get("radius").value;
    }

    set radius(value) {
        this.uniforms.get("radius").value = value;
    }

    /**
     * 设置大小
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        this.uniforms.get("texelSize").value.set(1.0 / width, 1.0 / height);
    }
}
```

### 着色器代码 (sharpen.frag)

```glsl
uniform float intensity;
uniform float radius;
uniform vec2 texelSize;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 定义卷积核权重
    // 中心像素正权重，周围像素负权重
    vec3 centerColor = texture2D(inputBuffer, uv).rgb;
    
    // 采样周围像素
    vec3 blurColor = vec3(0.0);
    
    // 采样点
    vec2 offsets[4];
    offsets[0] = vec2(texelSize.x, 0.0) * radius;
    offsets[1] = vec2(-texelSize.x, 0.0) * radius;
    offsets[2] = vec2(0.0, texelSize.y) * radius;
    offsets[3] = vec2(0.0, -texelSize.y) * radius;
    
    // 对周围像素采样
    for (int i = 0; i < 4; i++) {
        blurColor += texture2D(inputBuffer, uv + offsets[i]).rgb;
    }
    
    blurColor *= 0.25; // 平均值
    
    // 应用锐化: centerColor + (centerColor - blurColor) * intensity
    vec3 sharpColor = centerColor + (centerColor - blurColor) * intensity;
    
    // 输出结果
    outputColor = vec4(sharpColor, inputColor.a);
}
```

### 与EffectComposer集成

```javascript
// 在应用程序中集成
import { EffectComposer, RenderPass, EffectPass, SharpenEffect } from "postprocessing";

// 创建EffectComposer
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 创建锐化效果
const sharpenEffect = new SharpenEffect({
    intensity: 0.5,
    radius: 1.0
});

// 添加效果通道
const effectPass = new EffectPass(camera, sharpenEffect);
composer.addPass(effectPass);

// 在渲染循环中使用
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
```

## 3. ACES电影色调映射 (ACESFilmicToneMappingEffect)

ACES (Academy Color Encoding System) 是一种广泛用于电影和视觉效果行业的色彩管理和图像处理系统，能够提供更好的高动态范围(HDR)到标准动态范围(SDR)的转换。

### 基本原理

ACES电影色调映射通过一系列数学函数将HDR色彩空间的值映射到显示设备支持的范围内，同时保持良好的对比度和颜色还原。它特别擅长保留高光和阴影中的细节。

### 实现结构

```javascript
import { Uniform } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

// 导入着色器
import fragmentShader from "./glsl/aces-filmic.frag";

/**
 * ACES电影色调映射效果
 */
export class ACESFilmicToneMappingEffect extends Effect {
    /**
     * 构造函数
     * @param {Object} [options] - 选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合函数
     * @param {Number} [options.exposure=1.0] - 曝光值
     * @param {Number} [options.gamma=2.2] - 伽马值
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        exposure = 1.0,
        gamma = 2.2
    } = {}) {
        super("ACESFilmicToneMappingEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["exposure", new Uniform(exposure)],
                ["gamma", new Uniform(gamma)]
            ])
        });
    }

    /**
     * 曝光值
     * @type {Number}
     */
    get exposure() {
        return this.uniforms.get("exposure").value;
    }

    set exposure(value) {
        this.uniforms.get("exposure").value = value;
    }

    /**
     * 伽马值
     * @type {Number}
     */
    get gamma() {
        return this.uniforms.get("gamma").value;
    }

    set gamma(value) {
        this.uniforms.get("gamma").value = value;
    }
}
```

### 着色器代码 (aces-filmic.frag)

```glsl
uniform float exposure;
uniform float gamma;

// ACES tone mapping核心函数
vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

// ACES 色调映射
vec3 ACESFilmicToneMapping(vec3 color) {
    // 应用曝光
    color *= exposure;

    // 应用ACES电影映射
    color = RRTAndODTFit(color);

    // 伽马校正
    color = pow(color, vec3(1.0 / gamma));

    // 确保在有效范围内
    return clamp(color, 0.0, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 提取RGB颜色
    vec3 color = inputColor.rgb;
    
    // 应用ACES色调映射
    vec3 mappedColor = ACESFilmicToneMapping(color);
    
    // 保持原始Alpha值
    outputColor = vec4(mappedColor, inputColor.a);
}
```

### 与EffectComposer集成

```javascript
// 在应用程序中集成
import { EffectComposer, RenderPass, EffectPass, ACESFilmicToneMappingEffect } from "postprocessing";

// 创建EffectComposer
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 创建ACES色调映射效果
const acesEffect = new ACESFilmicToneMappingEffect({
    exposure: 1.0,
    gamma: 2.2
});

// 添加效果通道
const effectPass = new EffectPass(camera, acesEffect);
composer.addPass(effectPass);

// 在渲染循环中使用
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
```

## 4. 体积雾效果 (VolumetricFogEffect)

体积雾效果模拟真实世界中的三维雾气，可以显著增强场景的大气感和深度感。

### 基本原理

体积雾效果通常通过在屏幕空间中进行光线步进(ray marching)实现，沿着从相机到每个像素的光线采样，并累积雾的密度。雾密度可以基于高度、距离和噪声纹理进行调整。

### 实现结构

```javascript
import { 
    Color, Matrix4, Uniform, Vector3, WebGLRenderTarget 
} from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

// 导入着色器
import fragmentShader from "./glsl/volumetric-fog.frag";
import vertexShader from "./glsl/volumetric-fog.vert";

/**
 * 体积雾效果
 */
export class VolumetricFogEffect extends Effect {
    /**
     * 构造函数
     * @param {Scene} scene - 场景
     * @param {Camera} camera - 相机
     * @param {Object} [options] - 选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合函数
     * @param {Number} [options.density=0.05] - 雾密度
     * @param {Number} [options.decay=0.95] - 衰减率
     * @param {Number} [options.weight=0.2] - 权重
     * @param {Number} [options.samples=20] - 采样数
     * @param {Color} [options.color=new Color(0xffffff)] - 雾颜色
     * @param {Boolean} [options.useNoise=true] - 是否使用噪声
     * @param {Number} [options.noiseSpeed=0.01] - 噪声速度
     * @param {Number} [options.noiseScale=1.0] - 噪声缩放
     * @param {Number} [options.heightFalloff=0.1] - 高度衰减
     */
    constructor(scene, camera, {
        blendFunction = BlendFunction.NORMAL,
        density = 0.05,
        decay = 0.95,
        weight = 0.2,
        samples = 20,
        color = new Color(0xffffff),
        useNoise = true,
        noiseSpeed = 0.01,
        noiseScale = 1.0,
        heightFalloff = 0.1
    } = {}) {
        super("VolumetricFogEffect", fragmentShader, {
            blendFunction,
            vertexShader,
            uniforms: new Map([
                ["density", new Uniform(density)],
                ["decay", new Uniform(decay)],
                ["weight", new Uniform(weight)],
                ["samples", new Uniform(samples)],
                ["fogColor", new Uniform(color)],
                ["useNoise", new Uniform(useNoise)],
                ["noiseSpeed", new Uniform(noiseSpeed)],
                ["noiseScale", new Uniform(noiseScale)],
                ["heightFalloff", new Uniform(heightFalloff)],
                ["time", new Uniform(0)],
                ["worldFogHeight", new Uniform(0)],
                ["tDepth", new Uniform(null)],
                ["cameraNear", new Uniform(0.1)],
                ["cameraFar", new Uniform(1000)],
                ["cameraPosition", new Uniform(new Vector3())],
                ["cameraWorldMatrix", new Uniform(new Matrix4())],
                ["projectionMatrixInverse", new Uniform(new Matrix4())]
            ])
        });

        /**
         * 场景引用
         * @type {Scene}
         * @private
         */
        this.scene = scene;

        /**
         * 相机引用
         * @type {Camera}
         * @private
         */
        this.camera = camera;

        /**
         * 累积的时间
         * @type {Number}
         * @private
         */
        this.time = 0;
    }

    /**
     * 更新效果
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} deltaTime - 帧间时间差(秒)
     */
    update(renderer, inputBuffer, deltaTime, depthPass) {
        // 更新时间
        this.time += deltaTime;
        this.uniforms.get("time").value = this.time;

        // 更新相机参数
        this.uniforms.get("cameraNear").value = this.camera.near;
        this.uniforms.get("cameraFar").value = this.camera.far;
        this.uniforms.get("cameraPosition").value.copy(this.camera.position);
        this.uniforms.get("cameraWorldMatrix").value.copy(this.camera.matrixWorld);
        this.uniforms.get("projectionMatrixInverse").value.copy(this.camera.projectionMatrixInverse);

        // 使用共享的深度通道
        if (depthPass !== null && depthPass.texture !== undefined) {
            this.uniforms.get("tDepth").value = depthPass.texture;
        }
    }
}
```

### 顶点着色器 (volumetric-fog.vert)

```glsl
varying vec2 vUv;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

void main() {
    vUv = uv;
    
    // 计算视图空间的位置
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    
    // 计算世界空间的位置
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    
    gl_Position = projectionMatrix * viewPosition;
}
```

### 片段着色器 (volumetric-fog.frag)

```glsl
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 cameraPosition;
uniform mat4 cameraWorldMatrix;
uniform mat4 projectionMatrixInverse;

uniform float density;
uniform float decay;
uniform float weight;
uniform int samples;
uniform vec3 fogColor;
uniform bool useNoise;
uniform float noiseSpeed;
uniform float noiseScale;
uniform float heightFalloff;
uniform float time;
uniform float worldFogHeight;

varying vec2 vUv;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

// 简单噪声函数
float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// 柏林噪声简化版
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float n = i.x + i.y * 157.0 + 113.0 * i.z;
    return mix(
        mix(
            mix(rand(vec2(n, n + 1.0)), rand(vec2(n + 1.0, n + 1.0)), f.x),
            mix(rand(vec2(n, n + 157.0)), rand(vec2(n + 1.0, n + 157.0)), f.x),
            f.y
        ),
        mix(
            mix(rand(vec2(n + 113.0, n + 114.0)), rand(vec2(n + 114.0, n + 114.0)), f.x),
            mix(rand(vec2(n + 113.0, n + 270.0)), rand(vec2(n + 114.0, n + 270.0)), f.x),
            f.y
        ),
        f.z
    );
}

// 从深度重建世界位置
vec3 getWorldPosFromDepth(float depth, vec2 uv) {
    float z = depth * 2.0 - 1.0;
    vec4 clipSpacePosition = vec4(uv * 2.0 - 1.0, z, 1.0);
    vec4 viewSpacePosition = projectionMatrixInverse * clipSpacePosition;
    
    viewSpacePosition /= viewSpacePosition.w;
    vec4 worldSpacePosition = cameraWorldMatrix * viewSpacePosition;
    
    return worldSpacePosition.xyz;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 获取深度
    float depth = texture2D(tDepth, uv).r;
    
    // 重建世界位置
    vec3 worldPos = getWorldPosFromDepth(depth, uv);
    
    // 从相机到片段的方向
    vec3 rayDir = normalize(worldPos - cameraPosition);
    float rayLength = length(worldPos - cameraPosition);
    
    // 计算光线步进的步长
    float stepSize = rayLength / float(samples);
    vec3 step = rayDir * stepSize;
    
    // 开始位置
    vec3 currentPos = cameraPosition;
    
    // 累积雾
    float fogAmount = 0.0;
    float currentWeight = weight;
    
    for(int i = 0; i < samples; i++) {
        // 前进一步
        currentPos += step;
        
        // 计算高度衰减
        float heightFactor = 1.0;
        if(heightFalloff > 0.0) {
            heightFactor = exp(-heightFalloff * max(0.0, currentPos.y - worldFogHeight));
        }
        
        // 添加噪声
        float noiseFactor = 1.0;
        if(useNoise) {
            noiseFactor = noise(currentPos * noiseScale + time * noiseSpeed);
        }
        
        // 累积雾密度
        fogAmount += currentWeight * heightFactor * noiseFactor;
        
        // 衰减权重
        currentWeight *= decay;
    }
    
    // 计算最终雾量
    fogAmount = 1.0 - exp(-fogAmount * density);
    
    // 混合原始颜色和雾颜色
    vec3 finalColor = mix(inputColor.rgb, fogColor, fogAmount);
    
    // 输出结果
    outputColor = vec4(finalColor, inputColor.a);
}
```

### 与EffectComposer集成

```javascript
// 在应用程序中集成
import { EffectComposer, RenderPass, EffectPass, VolumetricFogEffect } from "postprocessing";
import { Color } from "three";

// 创建EffectComposer
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 创建体积雾效果
const fogEffect = new VolumetricFogEffect(scene, camera, {
    density: 0.05,
    color: new Color(0xaaaaaa),
    heightFalloff: 0.1,
    samples: 20,
    useNoise: true
});

// 添加效果通道
const effectPass = new EffectPass(camera, fogEffect);
composer.addPass(effectPass);

// 在渲染循环中使用
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
```

## 总结

以上是几个高优先级后处理效果的实现指南。每个效果都遵循相同的基本模式：

1. 继承自基础`Effect`类
2. 实现着色器代码
3. 定义必要的uniforms和属性
4. 提供适当的getter和setter
5. 实现生命周期方法（update, setSize, initialize, dispose）

这些效果可以单独使用，也可以组合使用以创建更复杂的视觉效果。在实现过程中，应尽量复用深度纹理和其他资源，以优化性能。

在集成到现有项目时，请确保效果的执行顺序合理，例如锐化效果通常应该在模糊效果之后应用，而色调映射通常应该是后处理链中的最后一个效果。 