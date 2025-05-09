# 效果材质开发规则

1. 一个标准的新的效果材质应该具备四个部分
   1. material本身（JavaScript文件）
   2. shader代码（glsl文件，通常包括顶点着色器和片段着色器）
   3. 在后处理效果中的应用
   4. demo演示和文档说明

## material

1. 创建新的effect material的js文件应当位于`src/materials/`下

2. material的使用方法为在`src/materials/index.js`中导出，在effect中直接从postprocessing导入使用
   ```javascript
   // 在src/materials/index.js中导出
   export * from "./BlurMaterial.js";
   
   // 在effect中使用
   import { BlurMaterial } from "postprocessing";
   ```

3. 基本材质模板应遵循Three.js的ShaderMaterial扩展方式，专为后处理效果优化

4. 效果材质结构示例

   ```javascript
   import { NoBlending, ShaderMaterial, Uniform, Vector2 } from "three";
   import vertexShader from "./glsl/blur.vert";
   import fragmentShader from "./glsl/blur.frag";
   
   /**
    * 模糊材质 - 用于后处理模糊效果
    */
   export class BlurMaterial extends ShaderMaterial {
   
   	/**
   	 * 构造函数
   	 * @param {Object} [options] - 可选配置项
   	 * @param {Number} [options.kernelSize=5] - 核心大小 (必须是奇数)
   	 * @param {Number} [options.strength=1.0] - 模糊强度
   	 */
   	constructor(options = {}) {
   		const kernelSize = options.kernelSize !== undefined ? options.kernelSize : 5;
   		const strength = options.strength !== undefined ? options.strength : 1.0;
   
   		super({
   			name: "BlurMaterial",
   			uniforms: {
   				inputBuffer: new Uniform(null),
   				texelSize: new Uniform(new Vector2()),
   				direction: new Uniform(new Vector2(1.0, 0.0)),
   				kernelSize: new Uniform(kernelSize),
   				strength: new Uniform(strength)
   			},
   			blending: NoBlending,
   			depthWrite: false,
   			depthTest: false,
   			toneMapped: false,
   			vertexShader,
   			fragmentShader
   		});
   	}
   
   	/**
   	 * 设置输入缓冲区
   	 * @param {Texture} value - 输入纹理
   	 */
   	set inputBuffer(value) {
   		this.uniforms.inputBuffer.value = value;
   	}
   
   	/**
   	 * 设置模糊方向 - 横向(1,0)或纵向(0,1)
   	 * @param {Vector2} value - 方向向量
   	 */
   	set direction(value) {
   		this.uniforms.direction.value.copy(value);
   	}
   
   	/**
   	 * 调整对象尺寸
   	 * @param {Number} width - 宽度
   	 * @param {Number} height - 高度
   	 */
   	setSize(width, height) {
   		this.uniforms.texelSize.value.set(1.0 / width, 1.0 / height);
   	}
   }
   ```

## shader文件

1. 创建新的glsl文件应当位于`src/materials/glsl/`下，通常需要创建一对顶点着色器(.vert)和片段着色器(.frag)文件

2. 命名约定：应使用描述性名称，例如`blur.vert`和`blur.frag`，或者使用功能分类如`convolution.gaussian.vert`

3. 后处理效果的着色器基础结构

   **顶点着色器基础结构**：
   ```glsl
   // 必要的uniforms声明
   uniform vec2 texelSize;
   uniform vec2 direction;
   
   // 预定义的变量 (Three.js会提供以下变量，不需要重新声明)
   // attribute vec3 position;  
   // attribute vec2 uv;
   
   // 需要传递给片段着色器的变量
   varying vec2 vUv;
   varying vec2 vUv0;
   varying vec2 vUv1;
   // 可以根据需要添加更多采样坐标
   
   void main() {
       // 1. 计算并传递UV坐标到片段着色器
       vUv = uv;
       // 对于全屏四边形，也可以使用:
       // vUv = position.xy * 0.5 + 0.5;
       
       // 2. 计算额外的采样坐标（用于卷积等操作）
       vec2 d = texelSize * direction;
       vUv0 = vUv - d;
       vUv1 = vUv + d;
       
       // 3. 设置顶点位置（对于全屏通道）
       gl_Position = vec4(position, 1.0);
   }
   ```

   **片段着色器基础结构**：
   ```glsl
   // 必要的uniforms声明
   uniform sampler2D inputBuffer;
   uniform int kernelSize;
   uniform float strength;
   uniform vec2 texelSize;
   
   // 从顶点着色器接收的变量
   varying vec2 vUv;
   varying vec2 vUv0;
   varying vec2 vUv1;
   
   void main() {
       // 1. 获取中心像素颜色
       vec4 centerColor = texture2D(inputBuffer, vUv);
       
       // 2. 执行后处理效果（例如模糊）
       vec4 sum = texture2D(inputBuffer, vUv0) * 0.25;
       sum += centerColor * 0.5;
       sum += texture2D(inputBuffer, vUv1) * 0.25;
       
       // 3. 混合原始颜色和效果颜色
       vec4 result = mix(centerColor, sum, strength);
       
       // 4. 输出最终颜色
       gl_FragColor = result;
   }
   ```

4. 特殊效果示例

   **边缘检测着色器**：
   ```glsl
   // 边缘检测片段着色器示例
   uniform sampler2D inputBuffer;
   uniform vec2 texelSize;
   uniform float threshold;
   
   varying vec2 vUv;
   
   void main() {
       // 采样周围9个点
       vec4 center = texture2D(inputBuffer, vUv);
       vec4 top = texture2D(inputBuffer, vUv + vec2(0.0, texelSize.y));
       vec4 bottom = texture2D(inputBuffer, vUv - vec2(0.0, texelSize.y));
       vec4 left = texture2D(inputBuffer, vUv - vec2(texelSize.x, 0.0));
       vec4 right = texture2D(inputBuffer, vUv + vec2(texelSize.x, 0.0));
       
       // 计算Sobel算子
       vec4 dx = (right - left) * 0.5;
       vec4 dy = (top - bottom) * 0.5;
       
       // 计算梯度幅值
       float edgeFactor = length(dx.rgb) + length(dy.rgb);
       
       // 应用阈值
       edgeFactor = smoothstep(threshold * 0.5, threshold, edgeFactor);
       
       // 输出结果
       gl_FragColor = vec4(vec3(edgeFactor), 1.0);
   }
   ```

5. 深度缓冲处理示例

   ```glsl
   // 深度处理片段着色器示例
   uniform sampler2D inputBuffer;
   uniform sampler2D depthBuffer;
   uniform float cameraNear;
   uniform float cameraFar;
   
   varying vec2 vUv;
   
   // 将深度值转换为线性深度
   float linearizeDepth(float depth) {
       float z = depth * 2.0 - 1.0; // 转换到NDC空间
       return (2.0 * cameraNear * cameraFar) / 
              (cameraFar + cameraNear - z * (cameraFar - cameraNear));
   }
   
   void main() {
       // 采样原始颜色
       vec4 color = texture2D(inputBuffer, vUv);
       
       // 获取深度值
       float depth = texture2D(depthBuffer, vUv).r;
       
       // 转换为线性深度，归一化到 0-1 范围
       float linearDepth = linearizeDepth(depth) / cameraFar;
       
       // 基于深度修改颜色 (示例：远处淡化)
       color.rgb *= 1.0 - linearDepth;
       
       gl_FragColor = color;
   }
   ```

6. 注意事项

   1. 效果材质通常是全屏应用，需要优化采样和计算以保持良好性能
   2. Three.js预定义的属性和uniforms（如position、uv等）不需要重新声明
   3. 避免深度贴图采样中的不必要的线性化操作，可能导致性能下降
   4. 使用条件编译(#ifdef)隔离不同的处理路径，以最大化性能
   5. 对于多pass效果，考虑分割材质以便更好地组织代码

## 在效果中使用

1. 在Effect类中引入并使用Material

   ```javascript
   import { Uniform } from "three";
   import { Effect, EffectAttribute } from "postprocessing";
   import { BlurMaterial } from "postprocessing";  // 直接从包导入
   
   export class BlurEffect extends Effect {
   
       constructor(options = {}) {
           super("BlurEffect", null, {
               blendFunction: options.blendFunction,
               uniforms: new Map([
                   ["strength", new Uniform(options.strength !== undefined ? options.strength : 1.0)]
               ])
           });
           
           // 创建两个材质用于两次通过（横向和纵向模糊）
           this.horizontalBlurMaterial = new BlurMaterial({
               kernelSize: options.kernelSize,
               strength: options.strength
           });
           
           this.verticalBlurMaterial = new BlurMaterial({
               kernelSize: options.kernelSize,
               strength: options.strength
           });
           
           // 设置方向
           this.horizontalBlurMaterial.direction.set(1.0, 0.0);
           this.verticalBlurMaterial.direction.set(0.0, 1.0);
           
           // 创建额外的渲染目标
           this.renderTargetA = null;
           this.renderTargetB = null;
           
           // 保存设置
           this.kernelSize = options.kernelSize || 5;
       }
       
       update(renderer, inputBuffer, deltaTime) {
           // 第一次通过：横向模糊
           this.horizontalBlurMaterial.inputBuffer = inputBuffer.texture;
           renderer.setRenderTarget(this.renderTargetA);
           renderer.render(this.scene, this.camera);
           
           // 第二次通过：纵向模糊
           this.verticalBlurMaterial.inputBuffer = this.renderTargetA.texture;
           renderer.setRenderTarget(this.renderTargetB);
           renderer.render(this.scene, this.camera);
       }
       
       setSize(width, height) {
           // 更新材质
           this.horizontalBlurMaterial.setSize(width, height);
           this.verticalBlurMaterial.setSize(width, height);
           
           // 更新渲染目标
           if(this.renderTargetA) this.renderTargetA.setSize(width, height);
           if(this.renderTargetB) this.renderTargetB.setSize(width, height);
       }
   }
   ```

2. 在EffectPass中使用多种材质

   ```javascript
   import { EffectPass, RenderPass } from "postprocessing";
   import { BlurEffect } from "./BlurEffect.js";
   import { EdgeDetectionEffect } from "./EdgeDetectionEffect.js";
   
   // 在composer中添加多个效果
   const composer = new EffectComposer(renderer);
   composer.addPass(new RenderPass(scene, camera));
   
   // 创建效果
   const blurEffect = new BlurEffect({
       kernelSize: 5,
       strength: 0.8
   });
   
   const edgeEffect = new EdgeDetectionEffect({
       strength: 1.0,
       threshold: 0.1
   });
   
   // 添加效果通道
   composer.addPass(new EffectPass(camera, blurEffect, edgeEffect));
   ```

3. 效果处理管线优化

   ```javascript
   // 为了优化性能，可以分多个通道处理效果
   const composer = new EffectComposer(renderer);
   composer.addPass(new RenderPass(scene, camera));
   
   // 第一个效果通道
   composer.addPass(new EffectPass(camera, blurEffect));
   
   // 第二个效果通道
   composer.addPass(new EffectPass(camera, edgeEffect));
   
   // 在动画循环中更新
   function animate() {
       composer.render();
       requestAnimationFrame(animate);
   }
   ```

## demo演示

1. 创建新的demo js文件，文件位于 `manual/assets/js/src/demos/effects/effect-materials/当前.js`

2. 效果材质demo应有自己的分类目录，以展示材质在后处理效果中的特性

3. 效果材质demo内容结构示例：

   ```javascript
   import {
       PerspectiveCamera,
       Scene,
       WebGLRenderer,
       Mesh,
       BoxGeometry,
       MeshStandardMaterial,
       DirectionalLight,
       AmbientLight,
       Clock
   } from "three";
   
   import {
       EffectComposer,
       EffectPass,
       RenderPass,
       BlurEffect  // 直接从postprocessing导入
   } from "postprocessing";
   
   import { Pane } from "tweakpane";
   import { SpatialControls } from "spatial-controls";
   import { calculateVerticalFoV, FPSMeter } from "../utils";
   
   // 创建演示场景
   function createScene() {
       const scene = new Scene();
       
       // 添加灯光
       const directionalLight = new DirectionalLight(0xffffff, 1.0);
       directionalLight.position.set(1, 2, 3);
       scene.add(directionalLight);
       
       const ambientLight = new AmbientLight(0x404040);
       scene.add(ambientLight);
       
       // 添加一个立方体作为测试对象
       const geometry = new BoxGeometry(1, 1, 1);
       const material = new MeshStandardMaterial({ color: 0x3388ff });
       const cube = new Mesh(geometry, material);
       scene.add(cube);
       
       // 添加更多对象以展示效果
       // ...
       
       return { scene, cube };
   }
   
   window.addEventListener("load", () => {
       // 基本设置
       const renderer = new WebGLRenderer({
           powerPreference: "high-performance",
           antialias: true
       });
       renderer.setPixelRatio(window.devicePixelRatio);
       
       const container = document.querySelector(".viewport");
       container.prepend(renderer.domElement);
       
       // 相机和控制器
       const camera = new PerspectiveCamera();
       const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
       const settings = controls.settings;
       settings.rotation.sensitivity = 2.2;
       settings.rotation.damping = 0.05;
       settings.translation.damping = 0.1;
       controls.position.set(0, 0, 3);
       controls.lookAt(0, 0, 0);
       
       // 创建场景
       const { scene, cube } = createScene();
       
       // 设置后处理
       const composer = new EffectComposer(renderer);
       composer.addPass(new RenderPass(scene, camera));
       
       // 创建效果
       const blurEffect = new BlurEffect({
           kernelSize: 5,
           strength: 0.5
       });
       
       // 添加效果通道
       const effectPass = new EffectPass(camera, blurEffect);
       composer.addPass(effectPass);
       
       // 设置时钟
       const clock = new Clock();
       
       // 配置GUI控制面板
       const fpsMeter = new FPSMeter();
       const pane = new Pane({ container: container.querySelector(".tp") });
       pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });
       
       const folder = pane.addFolder({ title: "模糊效果参数" });
       folder.addBinding(blurEffect, "kernelSize", { 
           label: "内核大小", 
           min: 3, 
           max: 15, 
           step: 2 
       });
       folder.addBinding(blurEffect.uniforms.get("strength"), "value", { 
           label: "强度", 
           min: 0, 
           max: 1.0, 
           step: 0.01 
       });
       // 添加更多效果参数控制...
       
       // 窗口大小调整处理
       function onResize() {
           const width = container.clientWidth, height = container.clientHeight;
           camera.aspect = width / height;
           camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
           camera.updateProjectionMatrix();
           
           renderer.setSize(width, height);
           composer.setSize(width, height);
       }
       
       // 渲染循环
       function render() {
           const deltaTime = clock.getDelta();
           fpsMeter.update();
           controls.update();
           
           // 旋转立方体以展示效果
           cube.rotation.x += deltaTime * 0.5;
           cube.rotation.y += deltaTime * 0.2;
           
           composer.render();
           requestAnimationFrame(render);
       }
       
       window.addEventListener("resize", onResize);
       onResize();
       requestAnimationFrame(render);
   });
   ```

## md文档

1. 创建新的md文件，文件位于 `manual/content/docs/effects/effect-materials/当前.zh.md`（注意：效果材质文档应放在专门的目录中）

2. md文档结构示例：

   ```markdown
   ---
   layout: single
   collection: sections
   title: 模糊效果材质
   draft: false
   menu:
     docs:
       parent: effect-materials
       weight: 10
   script: effects/effect-materials/blur-material
   ---
   
   # 模糊效果材质
   
   模糊效果材质提供了高效的图像模糊处理能力，可用于创建景深、动态模糊或UI元素的柔化效果。这个材质支持可配置的模糊半径和强度，适合在后处理效果链中使用。
   
   ## 特点
   
   - 高性能模糊算法，支持大型内核
   - 分离的横向和纵向模糊通道以获得最佳性能
   - 可自定义模糊强度和内核大小
   - 针对移动设备优化
   
   ## 使用方法
   
   ```javascript
   import { BlurMaterial } from "postprocessing";
   
   // 创建材质实例
   const blurMaterial = new BlurMaterial({
     kernelSize: 5,
     strength: 0.7
   });
   
   // 设置输入缓冲区
   blurMaterial.inputBuffer = someRenderTarget.texture;
   
   // 设置尺寸
   blurMaterial.setSize(width, height);
   
   // 在ShaderPass中使用
   const blurPass = new ShaderPass(blurMaterial);
   composer.addPass(blurPass);
   ```
   
   ## 参数
   
   | 参数名 | 类型 | 默认值 | 描述 |
   |--------|------|--------|------|
   | kernelSize | Number | 5 | 模糊内核大小，必须是奇数 |
   | strength | Number | 1.0 | 模糊强度 |
   | direction | Vector2 | (1,0) | 模糊方向 |
   
   ## 性能注意事项
   
   - 大型内核尺寸会显著影响性能，对于移动设备建议使用较小的内核
   - 分离横向和纵向模糊通道可获得更好的性能
   - 对于次像素精度的效果，可以在较低分辨率的渲染目标上执行模糊
   
   ## 示例
   
   查看[模糊效果材质演示](/demos/effects/effect-materials/blur-material)以了解完整的实现示例。
   ```

## 性能优化建议

1. 渲染目标优化
   - 对于大范围模糊，考虑在较低分辨率的渲染目标上执行，然后上采样
   - 在可能的情况下重用渲染目标以避免创建新的纹理
   - 使用适当的精度（如RGBA8而非浮点格式）以提高性能

2. 着色器优化
   - 使用条件编译隔离不同的处理路径
   - 对于复杂的效果，使用着色器宏配置不同的质量级别
   - 尽可能在顶点着色器中预计算值，如采样坐标

3. 离屏渲染策略
   - 对于多Pass效果，考虑合并类似的通道以减少上下文切换
   - 仅在必要时创建额外的渲染目标
   - 对不需要更新的效果考虑缓存渲染结果

4. 采样技术
   - 使用双线性采样优化模糊操作，减少所需的纹理读取
   - 对于高斯模糊，使用分离的横向和纵向通道可显著提高性能
   - 对于大内核模糊，考虑使用逐步下采样-上采样技术 