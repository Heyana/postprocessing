# 基础规则

1. 一个标准的新的effect应该具备四个部分
   1. effect本身
   2. shader代码
   3. demo js文件 展示案例
   4. md文件 用来让hugo索引 创建网页和对应路由 是必备的

## effect

1. 创建新的effect 的 js文件 应当位于 src\effects\下

2. effect的使用方法为 在src\effects\index.js 中导出 在demo中 直接从posetprocessing中导入即可

3. 如想使用深度贴图

   1. 在effect中配置 然后在shader中无需定义 直接使用depthBuffer

      ```
      
       attributes: EffectAttribute.DEPTH,
                  defines: new Map([
                      ["USE_DEPTH", "1"]
                  ]),
      到
       super("FrozenWastelandEffect", fragmentShader, {
                  blendFunction,
                  attributes: EffectAttribute.DEPTH,
                  defines: new Map([
                      ["USE_DEPTH", "1"]
                  ]),
                  uniforms: new Map([
                     
                  ])
              });
      ```

4. 内容参考

   ```
   import { FloatType, HalfFloatType, Uniform } from "three";
   import { BlendFunction } from "../enums/BlendFunction.js";
   import { Effect } from "./Effect.js";
   
   import fragmentShader from "./shader/lut-1d.frag";
   
   /**
    * A 1D LUT effect.
    */
   
   export class LUT1DEffect extends Effect {
   
   	/**
   	 * Constructs a new color grading effect.
   	 *
   	 * @param {Texture} lut - The lookup texture.
   	 * @param {Object} [options] - The options.
   	 * @param {BlendFunction} [options.blendFunction=BlendFunction.SRC] - The blend function of this effect.
   	 */
   
   	constructor(lut, { blendFunction = BlendFunction.SRC } = {}) {
   
   		super("LUT1DEffect", fragmentShader, {
   			blendFunction,
   			uniforms: new Map([["lut", new Uniform(null)]])
   		});
   
   		this.lut = lut;
   
   	}
   
   	/**
   	 * The LUT.
   	 *
   	 * @type {Texture}
   	 */
   
   	get lut() {
   
   		return this.uniforms.get("lut").value;
   
   	}
   
   	set lut(value) {
   
   		this.uniforms.get("lut").value = value;
   
   		if(value !== null && (value.type === FloatType || value.type === HalfFloatType)) {
   
   			this.defines.set("LUT_PRECISION_HIGH", "1");
   
   		}
   
   	}
   	
   	update(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {
         
       }
   
   }
   
   ```

   

   

## fragmentShader

1. 创建新的glsl文件 应当位于 src\effects\shaders\当前.glsl

   

2. 如何使用shadertoy的案例 参考这个 这个融合了 threejs 的相机 我们的后处理的深度 和线性深度的融合

   ```
   // Foggy Mountains 2
   // 基于Shadertoy效果: https://www.shadertoy.com/view/MdsGzS
   // 修改版：移除山脉，仅保留天空和雾气，添加相机矩阵支持
   
   // 统一变量声明
   uniform float time;       // 替代 iTime
   uniform vec2 resolution;  // 替代 iResolution
   uniform vec2 mouse;       // 替代 iMouse
   
   // 相机参数 - 从Three.js传入
   uniform vec3 cameraPosition;
   uniform mat4 viewMatrix;  // 添加视图矩阵支持
   uniform float cameraFov;
   uniform float cameraNear;
   uniform float cameraFar;
   
   // 效果参数
   uniform float fogDensity; // 雾气浓度控制
   
   // 噪声纹理
   uniform sampler2D noiseTexture; // 替代 iChannel0
   
   // 辅助函数
   vec3 rotate(vec3 r, float v){ 
       return vec3(r.x*cos(v)+r.z*sin(v), r.y, r.z*cos(v)-r.x*sin(v));
   }
   
   float noise(in vec3 x) {
       float z = x.z*64.0;
       vec2 offz = vec2(0.317,0.123);
       vec2 uv1 = x.xy + offz*floor(z); 
       vec2 uv2 = uv1 + offz;
       
       // 使用纹理采样
       float n1 = texture2D(noiseTexture, uv1).x;
       float n2 = texture2D(noiseTexture, uv2).x;
       
       return mix(n1, n2, fract(z)) - 0.5;
   }
   
   float noises(in vec3 p) {
       float a = 0.0;
       for(float i=1.0; i<6.0; i++) {
           a += noise(p)/i;
           p = p*2.0 + vec3(0.0, a*0.001/i, a*0.0001/i);
       }
       return a;
   }
   
   float clouds(in vec3 p) {
       float height = 500.0;
       p.y += height;
       return noises(vec3(p.x*0.3+((time+mouse.y)*30.0), p.y, p.z)*0.00002) - max(p.y, 0.0)*0.00009;
   }
   
   // 简化版本的mainImage函数，移除山脉部分，只保留天空和雾
   void mainImage(out vec4 fragColor, in vec2 fragCoord) {
       float localTime = time*5.0 + floor(time*0.1)*150.0;
       
       // 计算观察方向向量，使用视图矩阵
       float fovFactor = tan(radians(cameraFov * 0.5));
       vec2 screenPos = (fragCoord / resolution) * 2.0 - 1.0;
       vec3 viewDir = normalize(vec3(screenPos.x * resolution.x / resolution.y * fovFactor, 
                                screenPos.y * fovFactor, -1.0));
       
       // 将视图方向转换到世界空间
       vec4 worldDir = viewMatrix * vec4(viewDir, 0.0);
       vec3 ray = normalize(worldDir.xyz);
       
       // 设置相机位置和太阳位置
       vec3 campos = cameraPosition + vec3(0.0, 0.0, localTime*8.0);
       vec3 sun = normalize(vec3(0.0, 0.6, -0.4));
       
       // 雾气和颜色计算
       float fog = 0.0;
       vec3 pos = campos;
       
       // 简化的雾气计算，不再进行地形碰撞检测
       for(float i=1.0; i<50.0; i++) {
           float step = i*i*0.5;
           vec3 p = pos + ray * step;
           fog += clouds(p) * 0.5;
       }
       
       float l = sin(dot(ray, sun));
       vec3 light = vec3(l, 0.0, -l) + ray.y*0.2;
       
       // 简化的颜色计算
       vec3 cloudColor = vec3(0.70, 0.72, 0.70) + light*0.05 + sin(fog*0.0002)*0.2;
       vec3 skyColor = cloudColor + ray.y*0.1 - 0.02;
       
       // 应用雾气浓度
       float f = smoothstep(0.0, 800.0, fog * fogDensity);
       
       // 最终颜色混合
       vec3 finalColor = mix(skyColor, cloudColor, f);
       
       // 添加边缘暗角效果
       vec2 uv = fragCoord / resolution;
       finalColor = sqrt(smoothstep(0.2, 1.0, finalColor - dot(uv*2.0-1.0, uv*2.0-1.0)*0.1));
       
       fragColor = vec4(finalColor, 1.0);
   }
   
   // 将mainImage函数转换为适应postprocessing框架的mainImage函数
   void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
       vec2 fragCoord = uv * resolution.xy;
       vec4 foggyMountainsColor;
       mainImage(foggyMountainsColor, fragCoord);
   
       // 读取深度值
       float depth = texture2D(depthBuffer, uv).r;
       
       // 将深度值转换为线性深度 (0-1)
       float linearDepth = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
       linearDepth = linearDepth / cameraFar; // 归一化到0-1
       
       // 基于深度的混合策略:
       // 1. 远处(深度接近1)：使用完整的天空和雾气效果
       // 2. 近处：根据距离逐渐应用雾气效果
       float skyMask = step(0.9999, depth); // 纯天空部分（最远处）
       
       // 基于线性深度的雾气混合因子
       float fogFactor = clamp(linearDepth * fogDensity * 2.0, 0.0, 1.0);
       
       // 两步混合:
       // 1. 先将输入颜色与雾气颜色基于深度混合，得到带雾的前景
       vec4 foggedColor = mix(inputColor, vec4(foggyMountainsColor.rgb, 1.0), fogFactor);
       
       // 2. 在天空区域（最远处）使用完整的天空+雾气效果
       outputColor = mix(foggedColor, foggyMountainsColor, skyMask);
   } 
   ```

   

   

3. 内容参考

   ```
   uniform float offset;
   uniform float darkness;
   uniform vec3 color;
   
   void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
   
   	const vec2 center = vec2(0.5);
   	vec3 rgb = inputColor.rgb;
   
   	#if VIGNETTE_TECHNIQUE == 0
   
   		float d = distance(uv, center);
   		float factor = smoothstep(0.8, offset * 0.799, d * (darkness + offset));
   		rgb = mix(color, rgb, factor);
   
   	#else
   
   		vec2 coord = (uv - center) * vec2(offset);
   		float factor = dot(coord, coord);
   		rgb = mix(rgb, color, darkness * factor);
   
   	#endif
   
   	outputColor = vec4(rgb, inputColor.a);
   
   }
   
   ```

   注意

   1. inputBuffer、depthBuffer、vUv、PI、USE_DEPTH不用在定义直接使用不然会报错

      ```
      ERROR: 0:330: 'inputBuffer' : redefinition
      ERROR: 0:331: 'depthBuffer' : redefinition
      ERROR: 0:347: 'vUv' : redefinition
      ERROR: 0:340: 'e0USE_DEPTH' : macro redefined
      
      ```

## demo

1. 创建新的js文件 文件位于 manual\assets\js\src\demos\当前.js

2. 内容结构参考 可以服用某些场景的创建函数 位于manual\assets\js\src\utils\SceneUtils.js

   ```
   import {
   	CubeTextureLoader,
   	FogExp2,
   	LoadingManager,
   	PerspectiveCamera,
   	Scene,
   	SRGBColorSpace,
   	WebGLRenderer,
   	Color
   } from "three";
   
   import {
   	BlendFunction,
   	EffectComposer,
   	EffectPass,
   	RenderPass,
   	VignetteEffect,
   	VignetteTechnique
   } from "postprocessing";
   
   import { Pane } from "tweakpane";
   import { SpatialControls } from "spatial-controls";
   import { calculateVerticalFoV, FPSMeter } from "../utils";
   import * as Domain from "../objects/Domain";
   
   function load() {
   
   	const assets = new Map();
   	const loadingManager = new LoadingManager();
   	const cubeTextureLoader = new CubeTextureLoader(loadingManager);
   
   	const path = document.baseURI + "img/textures/skies/sunset/";
   	const format = ".png";
   	const urls = [
   		path + "px" + format, path + "nx" + format,
   		path + "py" + format, path + "ny" + format,
   		path + "pz" + format, path + "nz" + format
   	];
   
   	return new Promise((resolve, reject) => {
   
   		loadingManager.onLoad = () => resolve(assets);
   		loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));
   
   		cubeTextureLoader.load(urls, (t) => {
   
   			t.colorSpace = SRGBColorSpace;
   			assets.set("sky", t);
   
   		});
   
   	});
   
   }
   
   window.addEventListener("load", () => load().then((assets) => {
   
   	// Renderer
   
   	const renderer = new WebGLRenderer({
   		powerPreference: "high-performance",
   		antialias: false,
   		stencil: false,
   		depth: false
   	});
   
   	renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
   	const container = document.querySelector(".viewport");
   	container.prepend(renderer.domElement);
   
   	// Camera & Controls
   
   	const camera = new PerspectiveCamera();
   	const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
   	const settings = controls.settings;
   	settings.rotation.sensitivity = 2.2;
   	settings.rotation.damping = 0.05;
   	settings.translation.damping = 0.1;
   	controls.position.set(0, 0, 1);
   	controls.lookAt(0, 0, 0);
   
   	// Scene, Lights, Objects
   
   	const scene = new Scene();
   	scene.fog = new FogExp2(0x373134, 0.06);
   	scene.background = assets.get("sky");
   	scene.add(Domain.createLights());
   	scene.add(Domain.createEnvironment(scene.background));
   	scene.add(Domain.createActors(scene.background));
   
   	// Post Processing
   
   	const composer = new EffectComposer(renderer, {
   		multisampling: Math.min(4, renderer.capabilities.maxSamples)
   	});
   
   	const effect = new VignetteEffect({
   		technique: VignetteTechnique.DEFAULT,
   		offset: 0.0,
   		darkness: 1.0,
   		color: new Color(0x000000)
   	});
   
   	const effectPass = new EffectPass(camera, effect);
   	effectPass.fullscreenMaterial.dithering = true;
   	composer.addPass(new RenderPass(scene, camera));
   	composer.addPass(effectPass);
   
   	// Settings
   
   	const fpsMeter = new FPSMeter();
   	const pane = new Pane({ container: container.querySelector(".tp") });
   	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });
   
   	const folder = pane.addFolder({ title: "设置" });
   	folder.addBinding(effect, "technique", { options: VignetteTechnique });
   	folder.addBinding(effect, "offset", { min: 0, max: 1, step: 1e-3 });
   	folder.addBinding(effect, "darkness", { min: 0, max: 1, step: 1e-3 });
   
   	// 添加颜色控制
   	const colorParams = { color: { r: 0, g: 0, b: 0 } };
   	folder.addBinding(colorParams, "color", {
   		color: { type: "float" }
   	}).on("change", (e) => {
   		effect.color.setRGB(e.value.r, e.value.g, e.value.b);
   	});
   
   	folder.addBinding(effectPass, "dithering");
   	folder.addBinding(effect.blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 });
   	folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction });
   
   	// Resize Handler
   
   	function onResize() {
   
   		const width = container.clientWidth, height = container.clientHeight;
   		camera.aspect = width / height;
   		camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
   		camera.updateProjectionMatrix();
   		composer.setSize(width, height);
   
   	}
   
   	window.addEventListener("resize", onResize);
   	onResize();
   
   	// Render Loop
   
   	requestAnimationFrame(function render(timestamp) {
   
   		fpsMeter.update(timestamp);
   		controls.update(timestamp);
   		composer.render();
   		requestAnimationFrame(render);
   
   	});
   
   }));
   
   ```

## md

1. 创建新的md文件 文件位于 manual\content\demos\utility\当前.zh.md

2. 该文件仅为hugo索引使用 如果不是开发者要求 不需要后续在自动进行完善 没有意义

3. 内容结构参考

   ```
   ---
   layout: single
   collection: sections
   title: 体积云和大气散射效果
   draft: false
   menu:
     demos:
       parent: utility
       weight: 37
   script: sky-atmosphere
   ---
   
   # 体积云和大气散射效果
   
   体积云和大气散射效果提供了一个逼真的天空和大气模拟系统，包括物理精确的体积光渲染、真实的云层体积渲染以及大气散射。这个效果现在还支持夜空、星空和极光效果，让您可以创建完整的昼夜循环天空系统。本效果使用了先进的PBR（基于物理的渲染）方法，基于robobo1221的体积云技术开发。
   
   ## 特点
   ```

   