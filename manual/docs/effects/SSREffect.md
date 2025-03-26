# SSREffect

屏幕空间反射效果 (Screen Space Reflection Effect) 能够在不使用光线追踪的情况下，为场景中的物体添加写实的反射效果。这个效果使用屏幕空间下的深度和法线信息来模拟反射计算。

## 安装

确保已经安装了 `postprocessing` 库和 `three.js`。

```bash
yarn add postprocessing three
```

## 基本用法

以下是如何在项目中使用 SSREffect 的基本示例：

```javascript
import { EffectComposer, EffectPass, RenderPass, SSREffect } from "postprocessing";
import { PerspectiveCamera, Scene, WebGLRenderer } from "three";

// 创建场景、相机和渲染器
const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 创建效果合成器
const composer = new EffectComposer(renderer);

// 添加基本渲染通道
composer.addPass(new RenderPass(scene, camera));

// 创建SSR效果
const ssrEffect = new SSREffect(scene, camera, {
  thickness: 0.018,           // 反射光线厚度
  maxDistance: 0.1,           // 最大反射距离
  opacity: 0.85,              // 反射不透明度
  fresnel: true,              // 启用菲涅尔效应（角度反射）
  distanceAttenuation: true,  // 启用距离衰减
  bouncing: true,             // 启用多次反射
  infiniteThick: false,       // 禁用无限厚度
  blur: true,                 // 启用模糊效果
  resolutionScale: 0.5        // 渲染分辨率缩放
});

// 添加到物体列表中的物体才会有反射
// 假设scene中有一些金属或镜面物体
scene.traverse(object => {
  if (object.isMesh && object.material.metalness > 0.5) {
    ssrEffect.selection.add(object);
  }
});

// 创建效果通道并添加到合成器
const ssrPass = new EffectPass(camera, ssrEffect);
composer.addPass(ssrPass);

// 渲染循环
function animate() {
  requestAnimationFrame(animate);
  composer.render();
}
animate();
```

## 参数说明

SSREffect 接受以下配置选项：

| 参数名                | 类型      | 默认值  | 描述                                      |
|----------------------|-----------|---------|-------------------------------------------|
| thickness            | Number    | 0.018   | 光线步进厚度，控制反射精度与效率          |
| maxDistance          | Number    | 0.1     | 反射光线最大追踪距离                      |
| opacity              | Number    | 0.85    | 反射的不透明度                            |
| fresnel              | Boolean   | true    | 是否启用菲涅尔效应（观察角度影响反射强度）|
| distanceAttenuation  | Boolean   | true    | 是否启用距离衰减（远处反射变弱）          |
| infiniteThick        | Boolean   | false   | 是否使用无限厚度算法                      |
| bouncing             | Boolean   | true    | 是否模拟多次反射                          |
| blur                 | Boolean   | true    | 是否启用模糊效果                          |
| blurKernelSize       | Number    | 1       | 模糊核大小                                |
| resolutionScale      | Number    | 0.5     | 渲染分辨率缩放因子，影响性能和质量       |
| groundReflector      | Object    | null    | 地面反射器对象（需使用ReflectorForSSRPass）|

## 代码示例

### 调整反射质量

```javascript
// 高质量设置
ssrEffect.thickness = 0.01;
ssrEffect.maxDistance = 0.2;
ssrEffect.blur = true;
ssrEffect.blurKernelSize = 2;
ssrEffect.resolutionScale = 1.0;

// 高性能设置
ssrEffect.thickness = 0.05;
ssrEffect.maxDistance = 0.05;
ssrEffect.blur = false;
ssrEffect.resolutionScale = 0.25;
```

### 控制反射对象

```javascript
// 添加对象到选择集（只有这些对象会有反射）
ssrEffect.selection.add(metalObject);
ssrEffect.selection.add(glassObject);

// 从选择集中移除对象
ssrEffect.selection.delete(metalObject);

// 清空选择集
ssrEffect.selection.clear();
```

### 处理窗口大小变化

```javascript
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // 更新相机
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  // 更新渲染器和合成器
  renderer.setSize(width, height);
  composer.setSize(width, height);
});
```

## 与地面反射器结合使用

SSREffect 可以与地面反射器结合使用，为场景提供更加真实的地面反射效果：

```javascript
import { ReflectorForSSRPass } from "three/examples/jsm/objects/ReflectorForSSRPass.js";

// 创建地面反射器
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

// 更新SSR效果以使用地面反射器
ssrEffect.groundReflector = groundReflector;

// 窗口大小变化时更新反射器
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // 更新地面反射器尺寸
  groundReflector.getRenderTarget().setSize(width, height);
  groundReflector.resolution.set(width, height);
});
```

## 性能考虑

SSREffect 的计算成本相对较高，特别是在高分辨率和低缩放因子时。以下建议可以帮助优化性能：

1. 使用较小的 `resolutionScale` 值（0.5 或更低）
2. 设置适当的 `maxDistance` 值，避免过远的反射计算
3. 仅将需要反射的对象添加到 `selection` 集合中
4. 在移动设备上禁用 `blur` 或使用较小的 `blurKernelSize`
5. 对于非金属物体，减小材质的 `metalness` 值，这样它们就不需要高质量的反射

## 注意事项

1. SSR 效果在屏幕边缘附近可能会出现视觉伪影，这是屏幕空间反射的固有限制
2. 特别复杂的几何体或透明度会影响反射质量
3. 反射只能显示已经在屏幕上渲染的内容，无法显示视野外的反射 