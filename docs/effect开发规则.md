# 基础规则

1. 一个标准的新的effect应该具备四个部分
   1. effect本身
   2. shader代码
   3. demo js文件 展示案例
   4. md文件 用来让hugo索引 创建网页和对应路由 是必备的

## effect

1. 创建新的effect 的 js文件 应当位于 src\effects\下

2. effect的使用方法为 在src\effects\index.js 中导出 在demo中 直接从posetprocessing中导入即可

3. 内容参考

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

2. 内容参考

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

   