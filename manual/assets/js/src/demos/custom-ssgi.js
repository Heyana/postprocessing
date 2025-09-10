import {
	AnimationMixer,
	Color,
	CubeTextureLoader,
	GLTFLoader,
	Group,
	LoadingManager,
	Mesh,
	PerspectiveCamera,
	Raycaster,
	Scene,
	SphereGeometry,
	MeshStandardMaterial,
	SRGBColorSpace,
	TextureLoader,
	Vector2,
	Vector3,
	VSMShadowMap,
	WebGLRenderer
} from "three";

import * as THREE from "three";
import {
	BlendFunction,
	OverrideMaterialManager,
	EffectComposer,
	EffectPass,
	RenderPass
} from "postprocessing";

// 导入VelocityDepthNormalPass
import { VelocityDepthNormalPass } from "postprocessing";

// 导入自定义SSGI效果
import { CustomSSGIEffect } from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Shapes from "../objects/Shapes";


function load() {

	const assets = new Map();
	const loadingManager = new LoadingManager();
	const gltfLoader = new GLTFLoader(loadingManager);
	const textureLoader = new TextureLoader(loadingManager);
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

		gltfLoader.load(`${document.baseURI}models/rigged-simple/RiggedSimple.gltf`, (gltf) => {

			gltf.scene.traverse((object) => {

				if (object.isMesh) {

					object.castShadow = object.receiveShadow = true;

				}

			});

			assets.set("rigged-simple", gltf);

		});

		textureLoader.load(`${document.baseURI}img/textures/pattern.png`, (t) => {

			t.colorSpace = SRGBColorSpace;
			assets.set("pattern", t);

		});

		cubeTextureLoader.load(urls, (t) => {

			t.colorSpace = SRGBColorSpace;
			assets.set("sky", t);

		});

	});

}

// 创建一组具有不同材质特性的球体
function createMaterialSpheres() {

	const group = new Group();

	// 创建具有不同粗糙度和金属度的球体
	const sphereGeometry = new SphereGeometry(0.5, 32, 32);
	const sphereCount = 5;
	const spacing = 1.2;

	// 创建一行具有不同粗糙度的球体（从光滑到粗糙）
	for (let i = 0; i < sphereCount; i++) {

		const roughness = i / (sphereCount - 1);
		const sphere = new Mesh(
			sphereGeometry,
			new MeshStandardMaterial({
				color: 0xffffff,
				roughness: roughness,
				metalness: 0.0
			})
		);
		sphere.position.set(i * spacing - (spacing * (sphereCount - 1)) / 2, 1, 0);
		sphere.castShadow = sphere.receiveShadow = true;
		group.add(sphere);

	}

	// 创建一行具有不同金属度的球体（从非金属到金属）
	for (let i = 0; i < sphereCount; i++) {

		const metalness = i / (sphereCount - 1);
		const sphere = new Mesh(
			sphereGeometry,
			new MeshStandardMaterial({
				color: 0xffffff,
				roughness: 0.1,
				metalness: metalness
			})
		);
		sphere.position.set(i * spacing - (spacing * (sphereCount - 1)) / 2, -1, 0);
		sphere.castShadow = sphere.receiveShadow = true;
		group.add(sphere);

	}

	return group;

}

window.addEventListener("load", () => load().then((assets) => {

	// 渲染器
	const renderer = new WebGLRenderer({
		powerPreference: "high-performance",
		antialias: false,
		stencil: false,
		depth: false
	});

	renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
	renderer.shadowMap.type = VSMShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
	renderer.shadowMap.enabled = true;

	const container = document.querySelector(".viewport");
	container.prepend(renderer.domElement);

	// 相机和控制器
	const camera = new PerspectiveCamera();
	const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
	const settings = controls.settings;
	settings.general.mode = ControlMode.THIRD_PERSON;
	settings.rotation.sensitivity = 2.2;
	settings.rotation.damping = 0.05;
	settings.zoom.damping = 0.1;
	settings.translation.enabled = false;
	controls.position.set(2, 2, 10);

	// 场景、灯光和对象
	const scene = new Scene();
	scene.background = assets.get("sky");

	// 添加增强的灯光
	const lights = Shapes.createLights();
	// 增强直接光照强度
	lights.children.forEach(light => {

		if (light.isDirectionalLight) {

			light.intensity *= 1.5; // 增强直射光强度

		} else if (light.isAmbientLight) {

			light.intensity *= 2.0; // 显著增强环境光

		}

	});
	scene.add(lights);

	// 添加场景对象
	const actors = Shapes.createActors();
	scene.add(actors);

	// 添加材质球体组
	const materialSpheres = createMaterialSpheres();
	scene.add(materialSpheres);

	// 添加角色模型
	const riggedSimple = assets.get("rigged-simple");
	riggedSimple.scene.scale.multiplyScalar(0.2);
	actors.add(riggedSimple.scene);

	// 设置动画
	const animationMixer = new AnimationMixer(riggedSimple.scene);
	const action = animationMixer.clipAction(riggedSimple.animations[0]);
	action.play();

	// 排列场景中的对象
	const step = 2.0 * Math.PI / actors.children.length;
	const radius = 3.0;
	let angle = 3.5;

	for (const mesh of actors.children) {

		// 将对象排列成圆形
		mesh.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
		angle += step;

	}

	// 后处理
	OverrideMaterialManager.workaroundEnabled = true;
	const multisampling = Math.min(4, renderer.capabilities.maxSamples);

	const composer = new EffectComposer(renderer, { multisampling });

	// 添加基本渲染通道
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 添加VelocityDepthNormalPass通道 - 这是SSGI效果所必需的
	const velocityDepthNormalPass = new VelocityDepthNormalPass(scene, camera);
	composer.addPass(velocityDepthNormalPass);

	// 设置渲染器色调映射
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 2.0;

	// 创建CustomSSGI效果 - 使用我们的自定义效果替代原始效果
	const ssgiEffect = new CustomSSGIEffect(composer, scene, camera, {
		// 基本参数
		distance: 10,
		thickness: 10,
		autoThickness: true,

		// 质量控制
		resolutionScale: 1.0,
		steps: 20,
		refineSteps: 5,

		// 模式和混合
		mode: "ssgi",
		diffuseOnly: false,
		missedRays: true,
		blend: 1.0,

		// 亮度补偿 - 由于跳过降噪步骤需要补偿
		brightnessCompensation: 1.5,

		// 采样策略
		importanceSampling: true,

		// 其他
		enableDynamicRayCount: true,
		enableJitter: true,

		// 速度通道
		velocityDepthNormalPass: velocityDepthNormalPass,

		// 尺寸
		width: container.clientWidth,
		height: container.clientHeight
	});

	// 添加效果通道
	composer.addPass(new EffectPass(camera, ssgiEffect));

	// UI控制面板
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 灯光设置
	const lightFolder = pane.addFolder({ title: "灯光设置" });

	// 查找场景中的灯光并添加控制
	let directionalLight = null;
	let ambientLight = null;

	lights.children.forEach(light => {

		if (light.isDirectionalLight) {

			directionalLight = light;

		} else if (light.isAmbientLight) {

			ambientLight = light;

		}

	});

	if (directionalLight) {

		lightFolder.addBinding(directionalLight, "intensity", {
			min: 0, max: 5, step: 0.1,
			label: "主光源强度"
		});

	}

	if (ambientLight) {

		lightFolder.addBinding(ambientLight, "intensity", {
			min: 0, max: 5, step: 0.1,
			label: "环境光强度"
		});

	}

	// SSGI设置
	const folder = pane.addFolder({ title: "自定义SSGI设置" });

	folder.addBinding(ssgiEffect, "distance", { min: 0.1, max: 20, step: 0.1 });
	folder.addBinding(ssgiEffect, "thickness", { min: 0.1, max: 20, step: 0.1 });
	folder.addBinding(ssgiEffect, "resolutionScale", { min: 0.25, max: 1, step: 0.05 });

	// 添加混合强度控制
	folder.addBinding(ssgiEffect, "blend", { min: 0, max: 1, step: 0.01, label: "混合强度" });

	// 亮度补偿控制
	folder.addBinding(ssgiEffect.denoiser.options, "brightnessCompensation", {
		min: 1.0, max: 3.0, step: 0.1,
		label: "亮度补偿"
	}).on("change", (e) => {

		ssgiEffect.denoiser.setBrightnessCompensation(e.value);

	});

	// 使用checkbox控制效果启用状态
	folder.addBinding({ enabled: true }, "enabled", { label: "启用SSGI" })
		.on("change", (e) => {

			composer.passes.forEach(pass => {

				if (pass.effects && pass.effects.length > 0) {

					if (pass.effects.some(effect => effect instanceof CustomSSGIEffect)) {

						pass.enabled = e.value;

					}

				}

			});

		});

	// 混合模式选择
	const blendModes = {
		"正常": BlendFunction.NORMAL,
		"相加": BlendFunction.ADD,
		"屏幕": BlendFunction.SCREEN
	};

	const blendSettings = {
		blendFunction: "正常"
	};

	folder.addBinding(blendSettings, "blendFunction", {
		options: blendModes,
		label: "混合模式"
	}).on("change", (e) => {

		try {

			ssgiEffect.blendMode.blendFunction = blendModes[e.value];

		} catch (err) {

			console.warn("更改混合模式时出错:", err);

		}

	});

	// 采样设置
	const samplingFolder = pane.addFolder({ title: "采样设置" });
	samplingFolder.addBinding(ssgiEffect, "steps", { min: 1, max: 40, step: 1 });
	samplingFolder.addBinding(ssgiEffect, "refineSteps", { min: 0, max: 10, step: 1 });
	samplingFolder.addBinding(ssgiEffect, "importanceSampling");
	samplingFolder.addBinding(ssgiEffect, "missedRays");

	// 降噪设置
	const denoiseFolder = pane.addFolder({ title: "降噪设置" });

	// 只添加适合调整的降噪参数，避免过于复杂
	if (ssgiEffect.denoiser.denoisePass) {

		denoiseFolder.addBinding(ssgiEffect.denoiser.denoisePass.fullscreenMaterial.uniforms.normalPhi, "value", {
			min: 0.1, max: 100, step: 0.1,
			label: "法线敏感度"
		});

		denoiseFolder.addBinding(ssgiEffect.denoiser.denoisePass.fullscreenMaterial.uniforms.depthPhi, "value", {
			min: 0.1, max: 10, step: 0.1,
			label: "深度敏感度"
		});

		denoiseFolder.addBinding(ssgiEffect.denoiser.denoisePass.fullscreenMaterial.uniforms.lumaPhi, "value", {
			min: 0.1, max: 20, step: 0.1,
			label: "亮度敏感度"
		});

	}

	// 添加预设选项
	const presets = {
		preset: "中质量"
	};

	folder.addBinding(presets, "preset", {
		options: {
			低质量: "low",
			中质量: "medium",
			高质量: "high"
		}
	}).on("change", (e) => {

		// 应用预设
		switch (e.value) {

			case "low":
				ssgiEffect.steps = 10;
				ssgiEffect.refineSteps = 2;
				ssgiEffect.resolutionScale = 0.5;
				if (ssgiEffect.denoiser.denoisePass) {

					ssgiEffect.denoiser.denoisePass.iterations = 1;

				}
				break;
			case "medium":
				ssgiEffect.steps = 20;
				ssgiEffect.refineSteps = 4;
				ssgiEffect.resolutionScale = 0.75;
				if (ssgiEffect.denoiser.denoisePass) {

					ssgiEffect.denoiser.denoisePass.iterations = 1;

				}
				break;
			case "high":
				ssgiEffect.steps = 40;
				ssgiEffect.refineSteps = 4;
				ssgiEffect.resolutionScale = 1;
				if (ssgiEffect.denoiser.denoisePass) {

					ssgiEffect.denoiser.denoisePass.iterations = 2;

				}
				break;

		}

		// 更新UI显示
		pane.refresh();

	});

	// 场景对比按钮
	const sceneFolder = pane.addFolder({ title: "场景控制" });
	let compareMode = false;

	const compareButton = sceneFolder.addButton({
		title: "关闭SSGI（比较）"
	}).on("click", () => {

		compareMode = !compareMode;

		// 获取SSGI效果所在的EffectPass
		let ssgiPass = null;
		composer.passes.forEach(pass => {

			if (pass.effects && pass.effects.length > 0) {

				if (pass.effects.some(effect => effect instanceof CustomSSGIEffect)) {

					ssgiPass = pass;

				}

			}

		});

		if (ssgiPass) {

			// 切换效果
			ssgiPass.enabled = !compareMode;

		}

		// 更新按钮文本
		compareButton.title = compareMode ? "开启SSGI" : "关闭SSGI（比较）";

	});

	// 调整大小处理
	function onResize() {

		const width = container.clientWidth, height = container.clientHeight;
		camera.aspect = width / height;
		camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
		camera.updateProjectionMatrix();
		composer.setSize(width, height);

	}

	window.addEventListener("resize", onResize);
	onResize();

	// 添加说明文本
	const infoElement = document.createElement("div");
	infoElement.style.position = "absolute";
	infoElement.style.bottom = "10px";
	infoElement.style.left = "10px";
	infoElement.style.color = "white";
	infoElement.style.background = "rgba(0,0,0,0.5)";
	infoElement.style.padding = "5px";
	infoElement.style.borderRadius = "3px";
	infoElement.style.fontFamily = "Arial, sans-serif";
	infoElement.style.fontSize = "14px";
	infoElement.innerHTML = "自定义SSGI效果：优化降噪以消除黑点";
	container.appendChild(infoElement);

	// 渲染循环
	let t0 = 0;

	requestAnimationFrame(function render(timestamp) {

		const deltaTime = timestamp - t0;
		t0 = timestamp;

		fpsMeter.update(timestamp);
		controls.update(timestamp);
		animationMixer.update(deltaTime * 1e-3);
		composer.render();
		requestAnimationFrame(render);

	});

}));
