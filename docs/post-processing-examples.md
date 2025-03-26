# 后处理效果使用示例

本文档提供了几个常用后处理效果的实际使用示例，以便开发者可以快速集成到自己的项目中。

## 基础设置

所有后处理效果都需要通过EffectComposer来组织和应用。以下是一个基本设置：

```javascript
import { EffectComposer, RenderPass } from "postprocessing";
import { WebGLRenderer, Scene, PerspectiveCamera } from "three";

// 创建渲染器、场景和相机
const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// 创建效果合成器
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 渲染循环
function animate() {
    requestAnimationFrame(animate);
    composer.render();
}
animate();
```

## 示例1: 屏幕空间反射 (SSR)

屏幕空间反射可以为场景中的物体添加真实感的反射效果，特别适合水面、金属表面等反光材质。

```javascript
import { EffectComposer, RenderPass, EffectPass, SSREffect } from "postprocessing";

// 创建基本设置 (见基础设置部分)
// ...

// 创建SSR效果
const ssrEffect = new SSREffect(scene, camera, {
    thickness: 0.05,            // 反射表面厚度
    maxDistance: 0.5,           // 最大反射距离
    opacity: 1.0,               // 不透明度
    fresnel: true,              // 启用菲涅尔效应
    distanceAttenuation: true,  // 启用距离衰减
    bouncing: true,             // 启用多次反射
    blur: true                  // 启用模糊
});

// 将需要反射的对象添加到选择集
const reflectiveObjects = [/* 你的可反射对象列表 */];
reflectiveObjects.forEach(object => {
    ssrEffect.selection.add(object);
});

// 添加效果通道
const ssrPass = new EffectPass(camera, ssrEffect);
composer.addPass(ssrPass);

// 如果想添加地面反射器
const geometry = new PlaneGeometry(10, 10);
const groundReflector = new ReflectorForSSRPass(geometry, {
    clipBias: 0.0003,
    textureWidth: window.innerWidth,
    textureHeight: window.innerHeight,
    color: 0xaaaaaa,
    useDepthTexture: true,
});
groundReflector.rotation.x = -Math.PI / 2;
scene.add(groundReflector);
ssrEffect.groundReflector = groundReflector;
```

## 示例2: 景深效果 (Depth of Field)

景深效果可以模拟真实相机的对焦效果，让场景更加真实。

```javascript
import { EffectComposer, RenderPass, EffectPass, DepthOfFieldEffect } from "postprocessing";

// 创建基本设置 (见基础设置部分)
// ...

// 创建景深效果
const dofEffect = new DepthOfFieldEffect(camera, {
    focusDistance: 0.3,        // 对焦距离
    focalLength: 0.1,          // 焦距
    bokehScale: 2.0,           // 散景大小
    height: 480                // 内部渲染高度
});

// 添加效果通道
const dofPass = new EffectPass(camera, dofEffect);
composer.addPass(dofPass);

// 动态更新对焦点 (例如跟随鼠标点击的物体)
function updateFocus(targetObject) {
    const distance = camera.position.distanceTo(targetObject.position);
    dofEffect.focusDistance = distance / 1000; // 转换为适合参数的单位
}

// 在场景中点击物体时更新对焦点
window.addEventListener('click', (event) => {
    // 使用射线检测点击的物体
    // ...
    if (intersectedObject) {
        updateFocus(intersectedObject);
    }
});
```

## 示例3: 泛光效果 (Bloom)

泛光效果可以让明亮的区域向周围发光，增强场景的视觉冲击力。

```javascript
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SelectiveBloomEffect } from "postprocessing";
import { Color } from "three";

// 创建基本设置 (见基础设置部分)
// ...

// 创建普通泛光效果 (对整个场景应用)
const bloomEffect = new BloomEffect({
    intensity: 1.0,       // 强度
    luminanceThreshold: 0.6, // 发光阈值
    luminanceSmoothing: 0.3, // 平滑度
    height: 480           // 内部渲染高度
});

// 创建选择性泛光效果 (只对特定对象应用)
const selectiveBloomEffect = new SelectiveBloomEffect(scene, camera, {
    intensity: 2.0,
    luminanceThreshold: 0.1,
    luminanceSmoothing: 0.3,
    height: 480
});

// 将需要发光的对象添加到选择集
const glowingObjects = [/* 你的需要发光的对象列表 */];
glowingObjects.forEach(object => {
    // 可以给不同物体设置不同的发光强度和颜色
    selectiveBloomEffect.selection.add(object);
    
    // 给物体添加自发光
    if (object.material) {
        object.material.emissive = new Color(0xff0000); // 红色发光
        object.material.emissiveIntensity = 0.5;        // 发光强度
    }
});

// 添加效果通道 (二选一)
// 普通泛光:
const bloomPass = new EffectPass(camera, bloomEffect);
composer.addPass(bloomPass);

// 选择性泛光:
const selectiveBloomPass = new EffectPass(camera, selectiveBloomEffect);
composer.addPass(selectiveBloomPass);
```

## 示例4: 环境光遮蔽 (SSAO)

环境光遮蔽可以增强场景的深度感，让物体之间的接触部分显示自然的阴影。

```javascript
import { EffectComposer, RenderPass, EffectPass, SSAOEffect, NormalPass } from "postprocessing";

// 创建基本设置 (见基础设置部分)
// ...

// 创建法线通道 (SSAO需要法线信息)
const normalPass = new NormalPass(scene, camera);

// 创建SSAO效果
const ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
    blendFunction: BlendFunction.MULTIPLY,  // 混合模式
    samples: 16,                           // 采样数量
    rings: 7,                              // 环采样
    radius: 0.5,                           // 半径
    distanceThreshold: 0.125,              // 距离阈值
    distanceFalloff: 0.01,                 // 距离衰减
    rangeThreshold: 0.0015,                // 范围阈值
    rangeFalloff: 0.01,                    // 范围衰减
    luminanceInfluence: 0.6,               // 亮度影响
    intensity: 1.0                         // 强度
});

// 先添加法线通道
composer.addPass(normalPass);

// 再添加SSAO效果通道
const ssaoPass = new EffectPass(camera, ssaoEffect);
composer.addPass(ssaoPass);
```

## 示例5: 组合多个效果

在实际项目中，通常需要组合多个后处理效果以获得更好的视觉效果。

```javascript
import { 
    EffectComposer, RenderPass, EffectPass,
    BloomEffect, ChromaticAberrationEffect, VignetteEffect,
    ToneMappingEffect, NoiseEffect, GammaCorrectionEffect
} from "postprocessing";

// 创建基本设置 (见基础设置部分)
// ...

// 创建多个效果
const bloomEffect = new BloomEffect({
    intensity: 0.5,
    luminanceThreshold: 0.8
});

const chromaticAberrationEffect = new ChromaticAberrationEffect({
    offset: new Vector2(0.003, 0.003)
});

const vignetteEffect = new VignetteEffect({
    darkness: 0.5,
    offset: 0.1
});

const toneMappingEffect = new ToneMappingEffect({
    mode: ToneMappingMode.REINHARD2
});

const noiseEffect = new NoiseEffect({
    intensity: 0.05
});

const gammaCorrectionEffect = new GammaCorrectionEffect({
    gamma: 1.2
});

// 组合多个效果 (按照特定顺序)
// 1. 首先应用基于场景的效果 (如泛光)
const bloomPass = new EffectPass(camera, bloomEffect);
composer.addPass(bloomPass);

// 2. 然后应用镜头效果 (如色差和晕影)
const lensPass = new EffectPass(camera, chromaticAberrationEffect, vignetteEffect);
composer.addPass(lensPass);

// 3. 最后应用色调映射和伽马校正
const finalPass = new EffectPass(camera, toneMappingEffect, noiseEffect, gammaCorrectionEffect);
composer.addPass(finalPass);
```

## 示例6: 创建自定义效果

如果现有效果不能满足需求，可以创建自定义效果。

```javascript
import { Effect, EffectPass, EffectComposer, RenderPass } from "postprocessing";
import { Uniform } from "three";

// 自定义效果片段着色器
const fragmentShader = `
    uniform float intensity;
    uniform vec3 color;
    
    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        // 实现你的着色器逻辑
        vec3 result = mix(inputColor.rgb, color, intensity * (1.0 - uv.y));
        outputColor = vec4(result, inputColor.a);
    }
`;

// 创建自定义效果类
class CustomGradientEffect extends Effect {
    constructor({
        intensity = 0.5,
        color = [1.0, 0.5, 0.0]
    } = {}) {
        super("CustomGradientEffect", fragmentShader, {
            uniforms: new Map([
                ["intensity", new Uniform(intensity)],
                ["color", new Uniform(color)]
            ])
        });
    }
    
    // 添加属性访问器
    get intensity() {
        return this.uniforms.get("intensity").value;
    }
    
    set intensity(value) {
        this.uniforms.get("intensity").value = value;
    }
    
    get color() {
        return this.uniforms.get("color").value;
    }
    
    set color(value) {
        this.uniforms.get("color").value = value;
    }
}

// 使用自定义效果
const customEffect = new CustomGradientEffect({
    intensity: 0.3,
    color: [0.5, 0.8, 1.0]
});

const customPass = new EffectPass(camera, customEffect);
composer.addPass(customPass);

// 在动画循环中动态更新效果
function animate() {
    requestAnimationFrame(animate);
    
    // 例如，让效果随时间变化
    customEffect.intensity = Math.sin(Date.now() * 0.001) * 0.5 + 0.5;
    
    composer.render();
}
```

## 性能优化提示

1. **分辨率缩放**：对于计算密集型效果，使用较低的分辨率
   ```javascript
   const bloomEffect = new BloomEffect({
       intensity: 1.0,
       resolutionScale: 0.5  // 使用一半分辨率
   });
   ```

2. **选择性应用**：只对需要的物体应用特定效果
   ```javascript
   const selectiveBloomEffect = new SelectiveBloomEffect(scene, camera);
   importantObjects.forEach(obj => selectiveBloomEffect.selection.add(obj));
   ```

3. **共享资源**：复用深度和法线纹理
   ```javascript
   // 创建一个共享的深度通道
   const depthPass = new DepthPass(scene, camera);
   composer.addPass(depthPass);
   
   // 多个效果使用同一个深度纹理
   const ssrEffect = new SSREffect(scene, camera);
   const dofEffect = new DepthOfFieldEffect(camera);
   
   // 在渲染时传递深度通道
   function render() {
       composer.render();
       ssrEffect.setDepthTexture(depthPass.texture);
       dofEffect.setDepthTexture(depthPass.texture);
   }
   ```

4. **动态质量调整**：根据FPS动态调整效果质量
   ```javascript
   let fps = 60;
   let fpsAlpha = 0.9; // 平滑因子
   let lastTime = 0;
   
   function updateQuality(timestamp) {
       // 计算FPS
       if (lastTime) {
           const delta = (timestamp - lastTime) / 1000;
           const currentFps = 1 / delta;
           fps = fps * fpsAlpha + currentFps * (1 - fpsAlpha);
       }
       lastTime = timestamp;
       
       // 根据FPS调整效果质量
       if (fps < 30) {
           bloomEffect.resolutionScale = 0.25;
           ssaoEffect.samples = 8;
       } else if (fps < 45) {
           bloomEffect.resolutionScale = 0.5;
           ssaoEffect.samples = 16;
       } else {
           bloomEffect.resolutionScale = 0.75;
           ssaoEffect.samples = 32;
       }
       
       requestAnimationFrame(updateQuality);
   }
   
   requestAnimationFrame(updateQuality);
   ```

## 结论

本文档提供了几个常见后处理效果的使用示例。在实际应用中，后处理效果的组合可以极大地提升场景的视觉质量。但同时也需要注意性能平衡，特别是在移动设备或低性能设备上。

合理设置参数、选择性应用效果、共享资源和动态调整质量是实现高质量视觉效果同时保持良好性能的关键。 