# 模型材质开发规则

1. 一个标准的新的模型材质应该具备四个部分
   1. material本身（JavaScript文件）
   2. shader代码（glsl文件，通常包括顶点着色器和片段着色器）
   3. 直接在3D模型上的应用
   4. demo演示和文档说明

## material

1. 创建新的material的js文件应当位于`src/materials/`下

2. material的使用方法为在`src/materials/index.js`中导出，在demo中直接从postprocessing导入使用
   ```javascript
   // 在src/materials/index.js中导出
   export * from "./RiverMaterial.js";
   
   // 在demo中使用
   import { RiverMaterial } from "postprocessing";
   ```

3. 基本材质模板应遵循Three.js的ShaderMaterial或RawShaderMaterial的扩展方式

4. 材质结构示例

   ```javascript
   import { ShaderMaterial, Uniform, Color, Vector2 } from "three";
   import vertexShader from "./glsl/river.vert";
   import fragmentShader from "./glsl/river.frag";
   
   /**
    * 河流材质 - 用于创建流动的水面效果
    */
   export class RiverMaterial extends ShaderMaterial {
   
   	/**
   	 * 构造函数
   	 * @param {Object} [options] - 可选配置项
   	 * @param {Number} [options.flowSpeed=0.5] - 流动速度
   	 * @param {Number|Color} [options.color=0x0055ff] - 水的颜色
   	 * @param {Number} [options.transparency=0.8] - 透明度
   	 */
   	constructor(options = {}) {
   		const flowSpeed = options.flowSpeed !== undefined ? options.flowSpeed : 0.5;
   		const color = options.color !== undefined ? options.color : 0x0055ff;
   		const transparency = options.transparency !== undefined ? options.transparency : 0.8;
   
   		super({
   			name: "RiverMaterial",
   			uniforms: {
   				time: new Uniform(0),
   				flowMap: new Uniform(null),
   				normalMap: new Uniform(null),
   				flowSpeed: new Uniform(flowSpeed),
   				waterColor: new Uniform(new Color(color)),
   				transparency: new Uniform(transparency),
   				textureSize: new Uniform(new Vector2(1, 1))
   			},
   			vertexShader,
   			fragmentShader,
   			transparent: true
   		});
   	}
   
   	/**
   	 * 设置流动贴图
   	 * @param {Texture} value - 流动方向贴图
   	 */
   	set flowMap(value) {
   		this.uniforms.flowMap.value = value;
   	}
   
   	/**
   	 * 设置法线贴图
   	 * @param {Texture} value - 水面法线贴图
   	 */
   	set normalMap(value) {
   		this.uniforms.normalMap.value = value;
   	}
   
   	/**
   	 * 更新材质
   	 * @param {Number} deltaTime - 时间差
   	 */
   	update(deltaTime) {
   		this.uniforms.time.value += deltaTime * this.uniforms.flowSpeed.value;
   	}
   }
   ```

## shader文件

1. 创建新的glsl文件应当位于`src/materials/glsl/`下，通常需要创建一对顶点着色器(.vert)和片段着色器(.frag)文件

2. vert文件说明
   以下变量无需重新定义 会报错

   ```
   
   ERROR: 0:74: 'modelViewMatrix' : redefinition
   ERROR: 0:75: 'projectionMatrix' : redefinition
   ERROR: 0:76: 'modelMatrix' : redefinition
   ERROR: 0:77: 'normalMatrix' : redefinition
   ERROR: 0:78: 'cameraPosition' : redefinition
   ERROR: 0:84: 'position' : redefinition
   ERROR: 0:85: 'normal' : redefinition
   ERROR: 0:86: 'uv' : redefinition
   ```

   

3. 命名约定：应使用描述性名称，例如`river.vert`和`river.frag`，或者使用功能分类如`terrain.mountain.vert`

4. 用于3D模型的着色器基础结构

   **顶点着色器基础结构**：
   ```glsl
   // 必要的uniforms声明
   uniform float time;
   uniform mat4 modelMatrix;
   uniform mat4 viewMatrix;
   uniform mat4 projectionMatrix;
   
   // 预定义的变量 (Three.js会提供以下变量，不需要重新声明)
   // attribute vec3 position;  
   // attribute vec2 uv;
   // attribute vec3 normal;
   
   // 需要传递给片段着色器的变量
   varying vec2 vUv;
   varying vec3 vPosition;
   varying vec3 vNormal;
   varying vec3 vWorldPosition;
   
   void main() {
       // 1. 计算变换后的位置（可以包含动画或变形）
       vec3 pos = position;
       
       // 例如，河流波动效果
       pos.y += sin(pos.x * 10.0 + time) * 0.05;
       
       // 2. 传递必要数据到片段着色器
       vUv = uv;
       vPosition = pos;
       vNormal = normalize(normalMatrix * normal);
       vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
       
       // 3. 设置最终顶点位置
       gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
   }
   ```

   **片段着色器基础结构**：
   ```glsl
   // 必要的uniforms声明
   uniform float time;
   uniform sampler2D normalMap;
   uniform sampler2D flowMap;
   uniform vec3 waterColor;
   uniform float transparency;
   
   // 从顶点着色器接收的变量
   varying vec2 vUv;
   varying vec3 vPosition;
   varying vec3 vNormal;
   varying vec3 vWorldPosition;
   
   // 光照相关变量（如果使用标准光照）
   uniform vec3 directionalLightDirection[NUM_DIR_LIGHTS];
   uniform vec3 directionalLightColor[NUM_DIR_LIGHTS];
   
   void main() {
       // 1. 计算流动的UV坐标
       vec2 flowUV = vUv + time * 0.05;
       
       // 2. 采样法线贴图获取表面法线
       vec3 normalFromMap = texture2D(normalMap, flowUV).rgb * 2.0 - 1.0;
       vec3 mixedNormal = normalize(vNormal + normalFromMap);
       
       // 3. 光照计算
       vec3 lightDir = normalize(directionalLightDirection[0]);
       float diffuse = max(dot(mixedNormal, lightDir), 0.0);
       
       // 4. 计算反射和折射效果（可选）
       // ...
       
       // 5. 最终颜色计算
       vec3 finalColor = waterColor * (0.5 + diffuse * 0.5);
       
       // 6. 输出带透明度的颜色
       gl_FragColor = vec4(finalColor, transparency);
   }
   ```

5. 对不同类型3D模型材质的特别考虑

   **地形材质**：
   ```glsl
   // 地形顶点着色器示例
   varying vec3 vPosition;
   
   void main() {
       // 传递原始位置用于高度着色
       vPosition = position;
       
       // 可以在这里进行地形细节增强
       // ...
       
       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }
   ```

   ```glsl
   // 地形片段着色器示例
   uniform sampler2D grassTexture;
   uniform sampler2D rockTexture;
   uniform sampler2D snowTexture;
   
   varying vec3 vPosition;
   varying vec3 vNormal;
   
   void main() {
       // 基于高度和坡度的纹理混合
       float height = vPosition.y;
       float slope = 1.0 - vNormal.y; // 坡度
       
       // 根据高度和坡度混合不同纹理
       vec3 grassColor = texture2D(grassTexture, vUv).rgb;
       vec3 rockColor = texture2D(rockTexture, vUv).rgb;
       vec3 snowColor = texture2D(snowTexture, vUv).rgb;
       
       vec3 finalColor = grassColor;
       // 在陡峭区域使用岩石纹理
       finalColor = mix(finalColor, rockColor, smoothstep(0.3, 0.7, slope));
       // 在高处使用雪纹理
       finalColor = mix(finalColor, snowColor, smoothstep(0.6, 0.9, height));
       
       gl_FragColor = vec4(finalColor, 1.0);
   }
   ```

6. 注意事项

   1. 在为模型开发材质时，需要考虑不同的渲染条件（如光照、阴影、环境等）
   2. 避免在着色器代码中硬编码常量，尽量使用uniform传递可配置参数
   3. 对于计算密集的部分，考虑使用宏定义或辅助函数提高可读性
   4. 对于复杂的表面效果，可以使用多层纹理混合或程序化生成的方法

## 在场景中使用

1. 直接在3D模型上使用Material

   ```javascript
   import { Mesh, PlaneGeometry } from "three";
   import { RiverMaterial } from "postprocessing";  // 直接从包导入
   
   // 创建一个河流网格
   function createRiver() {
       // 创建河流几何体
       const geometry = new PlaneGeometry(10, 5, 20, 10);
       
       // 创建河流材质
       const material = new RiverMaterial({
           flowSpeed: 0.5,
           color: 0x0055ff,
           transparency: 0.8
       });
       
       // 创建网格并返回
       const river = new Mesh(geometry, material);
       river.rotation.x = -Math.PI / 2; // 使平面水平
       
       return river;
   }
   
   // 在场景中使用
   const riverMesh = createRiver();
   scene.add(riverMesh);
   
   // 在动画循环中更新
   function animate(time) {
       riverMesh.material.uniforms.time.value = time * 0.001;
       // 或者使用update方法（如果提供）
       riverMesh.material.update(deltaTime);
       renderer.render(scene, camera);
   }
   ```

2. 材质参数的实时调整

   ```javascript
   // 在用户交互或游戏逻辑中动态调整材质
   function adjustRiverProperties(speed, turbulence, depth) {
       riverMesh.material.uniforms.flowSpeed.value = speed;
       riverMesh.material.uniforms.turbulence.value = turbulence;
       riverMesh.material.uniforms.depth.value = depth;
   }
   
   // 季节变化示例
   function changeToWinter() {
       riverMesh.material.uniforms.waterColor.value.setHex(0xA5F2F3);
       riverMesh.material.uniforms.iceRatio.value = 0.7;
       riverMesh.material.uniforms.flowSpeed.value *= 0.5;
   }
   ```

3. 多材质组合使用

   ```javascript
   // 创建具有多种材质的复杂对象
   function createTerrainWithRiver() {
       const terrain = new Mesh(terrainGeometry, terrainMaterial);
       const river = new Mesh(riverGeometry, riverMaterial);
       
       // 确保河流略高于地形以避免z-fighting
       river.position.y = 0.01;
       
       // 将两者组合在一个组中
       const terrainGroup = new Group();
       terrainGroup.add(terrain);
       terrainGroup.add(river);
       
       return terrainGroup;
   }
   ```

## demo演示

1. 创建新的demo js文件，文件位于 `manual/assets/js/src/demos/当前.js`

2. 材质demo应有自己的分类目录，以展示材质的独特特性和用途

3. 模型材质demo内容结构示例：

   ```javascript
   import {
       PerspectiveCamera,
       Scene,
       WebGLRenderer,
       Mesh,
       PlaneGeometry,
       DirectionalLight,
       AmbientLight,
       TextureLoader,
       RepeatWrapping,
       Clock
   } from "three";
   
   import {
       RiverMaterial  // 直接从postprocessing导入
   } from "postprocessing";
   
   import { Pane } from "tweakpane";
   import { SpatialControls } from "spatial-controls";
   import { calculateVerticalFoV, FPSMeter } from "../utils";
   
   // 加载所需纹理
   function loadTextures() {
       return new Promise((resolve) => {
           const textureLoader = new TextureLoader();
           const textures = {};
           
           // 加载流向图和法线图
           const flowMap = textureLoader.load("path/to/flowmap.png", () => {
               flowMap.wrapS = RepeatWrapping;
               flowMap.wrapT = RepeatWrapping;
               textures.flowMap = flowMap;
               
               if(Object.keys(textures).length === 2) resolve(textures);
           });
           
           const normalMap = textureLoader.load("path/to/normalmap.png", () => {
               normalMap.wrapS = RepeatWrapping;
               normalMap.wrapT = RepeatWrapping;
               textures.normalMap = normalMap;
               
               if(Object.keys(textures).length === 2) resolve(textures);
           });
       });
   }
   
   // 创建河流演示场景
   function createScene(textures) {
       const scene = new Scene();
       
       // 添加灯光
       const directionalLight = new DirectionalLight(0xffffff, 1.0);
       directionalLight.position.set(1, 2, 3);
       scene.add(directionalLight);
       
       const ambientLight = new AmbientLight(0x404040);
       scene.add(ambientLight);
       
       // 创建河流平面
       const geometry = new PlaneGeometry(10, 5, 50, 25);
       const material = new RiverMaterial({
           flowSpeed: 0.5,
           color: 0x0055ff,
           transparency: 0.8
       });
       
       // 设置纹理
       material.flowMap = textures.flowMap;
       material.normalMap = textures.normalMap;
       
       const river = new Mesh(geometry, material);
       river.rotation.x = -Math.PI / 2; // 水平放置
       scene.add(river);
       
       return { scene, river };
   }
   
   window.addEventListener("load", () => {
       // 加载纹理
       loadTextures().then(textures => {
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
      		settings.general.mode = ControlMode.THIRD_PERSON;
       	settings.translation.enabled = true;
           controls.position.set(0, 5, 10);
           controls.lookAt(0, 0, 0);
           
           // 创建场景
           const { scene, river } = createScene(textures);
           
           // 设置时钟
           const clock = new Clock();
           
           // 配置GUI控制面板
           const fpsMeter = new FPSMeter();
           const pane = new Pane({ container: container.querySelector(".tp") });
           pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });
           
           const folder = pane.addFolder({ title: "河流材质参数" });
           folder.addBinding(river.material.uniforms.flowSpeed, "value", { 
               label: "流速", 
               min: 0, 
               max: 2.0, 
               step: 0.01 
           });
           folder.addBinding(river.material.uniforms.transparency, "value", { 
               label: "透明度", 
               min: 0, 
               max: 1.0, 
               step: 0.01 
           });
           // 添加更多材质参数控制...
           
           // 窗口大小调整处理
           function onResize() {
               const width = container.clientWidth, height = container.clientHeight;
               camera.aspect = width / height;
               camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
               camera.updateProjectionMatrix();
               renderer.setSize(width, height);
           }
           
           // 渲染循环
           function render() {
               const deltaTime = clock.getDelta();
               fpsMeter.update();
               controls.update();
               
               // 更新河流材质
               river.material.update(deltaTime);
               
               renderer.render(scene, camera);
               requestAnimationFrame(render);
           }
           
           window.addEventListener("resize", onResize);
           onResize();
           requestAnimationFrame(render);
       });
   });
   ```

## md文档

1. 创建新的md文件，文件位于 `manual\content\demos\materials当前.zh.md`（注意：材质文档应放在materials专用目录中）

2. md文档结构示例：

   ```markdown
   ---
   layout: single
   collection: sections
   title: 河流材质
   draft: false
   menu:
     demos:
       parent: materials
       weight: 10
   script: river-material
   ---
   
   # 河流材质
   
   河流材质提供了逼真的流动水面效果，适用于创建河流、湖泊、海洋等水体表面。这个材质支持动态流向、法线映射和光照交互，可以轻松集成到任何Three.js场景中。
   
   ## 特点
   
   - 逼真的水体流动效果
   - 支持流向图自定义流动方向
   - 可调节的透明度和颜色
   - 与场景光照完全兼容
   - 性能优化设计，适合大型水面
   
   ## 使用方法
   
   ```javascript
   import { RiverMaterial } from "postprocessing";
   import { Mesh, PlaneGeometry, TextureLoader } from "three";
   
   // 加载所需纹理
   const textureLoader = new TextureLoader();
   const flowMap = textureLoader.load("path/to/flowmap.png");
   const normalMap = textureLoader.load("path/to/normalmap.png");
   
   // 创建材质实例
   const riverMaterial = new RiverMaterial({
     flowSpeed: 0.5,
     color: 0x0055ff,
     transparency: 0.8
   });
   
   // 设置纹理
   riverMaterial.flowMap = flowMap;
   riverMaterial.normalMap = normalMap;
   
   // 创建河流网格
   const riverGeometry = new PlaneGeometry(10, 5, 20, 10);
   const river = new Mesh(riverGeometry, riverMaterial);
   river.rotation.x = -Math.PI / 2; // 水平放置
   
   // 添加到场景
   scene.add(river);
   
   // 在动画循环中更新
   function animate(deltaTime) {
     riverMaterial.update(deltaTime);
     renderer.render(scene, camera);
     requestAnimationFrame(animate);
   }
   ```
   
   ## 参数
   
   | 参数名 | 类型 | 默认值 | 描述 |
   |--------|------|--------|------|
   | flowSpeed | Number | 0.5 | 水流速度 |
   | color | Color/Hex | 0x0055ff | 水体颜色 |
   | transparency | Number | 0.8 | 水体透明度 |
   
   ## 纹理
   
   材质支持两种主要纹理:
   
   - **流向图(flowMap)**: 用RGB通道表示水流方向的纹理
   - **法线图(normalMap)**: 用于表现水面波纹和细节的法线贴图
   
   ## 性能注意事项
   
   - 对于大型水面，建议减少几何体细分程度
   - 在移动设备上，考虑使用较低分辨率的纹理
   - 水面更新可以在需要时降低更新频率（如每2-3帧更新一次）
   
   ## 示例
   
   查看[河流材质演示](/demos/materials/river-material)以了解完整的实现示例。
   ```

## 性能优化建议

1. 几何体优化
   - 对于大面积水面或地形，使用LOD(Level of Detail)技术根据距离调整几何细节
   - 仅在必要区域增加几何体分辨率，如河流的弯曲部分

2. 着色器优化
   - 对不必要的计算使用条件编译(#ifdef)或宏定义
   - 尽量在顶点着色器中完成计算，减少片段着色器负担
   - 使用appropriate精度限定符(lowp, mediump, highp)

3. 纹理优化
   - 使用适当分辨率的纹理，避免过度细节
   - 考虑使用纹理压缩格式(DXT, ETC, ASTC等)
   - 对于重复纹理，确保启用mipmap和适当的纹理环绕模式

4. 更新策略
   - 对于远距离或不太显眼的材质，可以降低更新频率
   - 考虑使用GPU实例化渲染相似的对象
   - 当相机不看向特定材质时，可以暂停其动画更新 