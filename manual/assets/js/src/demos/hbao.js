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
	HBAOEffect,
	EffectComposer,
	EffectPass,
	RenderPass
} from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Shapes from "../objects/Shapes";

/**
 * 通用属性访问辅助函数 - 用于安全访问和修改可能根据版本变化的属性
 * @param {Object} obj - 目标对象
 * @param {Array|String} paths - 可能的属性路径
 * @param {*} value - 要设置的值（如果提供）
 * @param {Boolean} set - 是否是设置操作
 * @returns {*} - 获取操作时返回找到的值，设置操作时返回是否成功
 */
function accessProperty(obj, paths, value, set = false) {

	// 确保paths是数组
	if(!Array.isArray(paths)) {

		paths = [paths];

	}

	// 尝试每个可能的路径
	for(const path of paths) {

		try {

			// 分解属性路径
			const parts = path.split(".");
			let current = obj;
			let lastPart = null;
			let lastObj = null;

			// 遍历路径
			for(let i = 0; i < parts.length; i++) {

				const part = parts[i];
				if(i === parts.length - 1) {

					// 最后一部分
					lastPart = part;
					lastObj = current;

				}

				if(current[part] === undefined) {

					// 该路径不存在，尝试下一个
					current = null;
					break;

				}

				current = current[part];

			}

			// 如果找到了有效路径
			if(current !== null && lastObj !== null) {

				if(set) {

					// 设置属性
					lastObj[lastPart] = value;
					console.log(`成功设置属性 ${path} = ${value}`);
					return true;

				}
				// 获取属性
				return current;

			}

		} catch(err) {

			console.warn(`访问属性路径 ${path} 时出错:`, err);

		}

	}

	// 所有路径都失败了
	if(set) {

		console.warn("无法设置属性，所有路径都失败了:", paths);
		return false;

	}

	return undefined;

}

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

				if(object.isMesh) {

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

// 创建一组具有不同材质特性的物体
function createMaterialSpheres() {

	const group = new Group();

	// 创建具有不同粗糙度和金属度的球体
	const sphereGeometry = new SphereGeometry(0.5, 32, 32);
	const sphereCount = 5;
	const spacing = 1.2;

	// 创建一行具有不同粗糙度的球体（从光滑到粗糙）
	for(let i = 0; i < sphereCount; i++) {

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
	for(let i = 0; i < sphereCount; i++) {

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

		if(light.isDirectionalLight) {

			light.intensity *= 1.5; // 增强直射光强度

		} else if(light.isAmbientLight) {

			light.intensity *= 0.5; // 降低环境光（让AO效果更明显）

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

	for(const mesh of actors.children) {

		// 将对象排列成圆形
		mesh.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
		angle += step;

	}

	// 后处理
	const multisampling = Math.min(4, renderer.capabilities.maxSamples);
	const composer = new EffectComposer(renderer, { multisampling });

	// 添加基本渲染通道
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 设置渲染器色调映射
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;

	// 创建HBAO效果
	const hbaoEffect = new HBAOEffect(composer, camera, scene, {
		// 基本参数
		resolutionScale: 1.0,
		color: new Color(0x000000),

		// AO参数
		aoDistance: 2.0,
		distancePower: 1.0,
		power: 2.0,
		bias: 0.05,
		thickness: 0.3,

		// 降噪设置
		iterationCount: 2,
		denoiseRadius: 6,
		denoiseBias: 0.2,

		// 采样设置
		spp: 16,

		// 尺寸
		width: container.clientWidth,
		height: container.clientHeight
	});

	// 添加HBAO效果到合成器
	composer.addPass(new EffectPass(camera, hbaoEffect));

	// 输出HBAOEffect的实际API结构
	console.log("HBAO效果已创建，详细API:", {
		directProperties: Object.keys(hbaoEffect),
		hasBlendMode: !!hbaoEffect.blendMode,
		blendModeProperties: hbaoEffect.blendMode ? Object.keys(hbaoEffect.blendMode) : [],
		hasSetOpacity: typeof hbaoEffect.setOpacity === "function",
		prototype: Object.getPrototypeOf(hbaoEffect) ? Object.keys(Object.getPrototypeOf(hbaoEffect)) : [],
		effectPass: composer.passes[composer.passes.length - 1]
	});

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

		if(light.isDirectionalLight) {

			directionalLight = light;

		} else if(light.isAmbientLight) {

			ambientLight = light;

		}

	});

	if(directionalLight) {

		lightFolder.addBinding(directionalLight, "intensity", {
			min: 0, max: 5, step: 0.1,
			label: "主光源强度"
		});
		lightFolder.addBinding(directionalLight.color, "r", {
			min: 0, max: 1, step: 0.01,
			label: "主光源-红"
		});
		lightFolder.addBinding(directionalLight.color, "g", {
			min: 0, max: 1, step: 0.01,
			label: "主光源-绿"
		});
		lightFolder.addBinding(directionalLight.color, "b", {
			min: 0, max: 1, step: 0.01,
			label: "主光源-蓝"
		});

	}

	if(ambientLight) {

		lightFolder.addBinding(ambientLight, "intensity", {
			min: 0, max: 2, step: 0.1,
			label: "环境光强度"
		});

	}

	// HBAO设置
	const folder = pane.addFolder({ title: "HBAO设置" });

	// 基本控制
	folder.addBinding({ enabled: true }, "enabled", { label: "启用HBAO" })
		.on("change", (e) => {

			// 通过控制EffectPass的enabled属性来切换效果
			composer.passes.forEach(pass => {

				if(pass.effects && pass.effects.length > 0) {

					if(pass.effects.some(effect => effect instanceof HBAOEffect)) {

						pass.enabled = e.value;

					}

				}

			});

		});

	// 创建自定义对象来控制混合强度
	const blendSettings = {
		strength: 0.9 // 默认值
	};

	folder.addBinding(blendSettings, "strength", {
		min: 0, max: 1, step: 0.01,
		label: "混合强度"
	}).on("change", (e) => {

		// 使用辅助函数设置混合强度，尝试多种可能的属性路径
		const paths = [
			"blendMode.opacity",
			"blendMode.strength",
			"blend",
			"opacity",
			"strength"
		];

		const success = accessProperty(hbaoEffect, paths, e.value, true);

		if(!success) {

			// 尝试调用可能的setter方法
			const methods = [
				"setOpacity",
				"setBlendMode",
				"setBlend",
				"setStrength"
			];

			let methodCalled = false;
			for(const method of methods) {

				if(typeof hbaoEffect[method] === "function") {

					try {

						hbaoEffect[method](e.value);
						console.log(`成功通过方法 ${method} 设置混合强度为 ${e.value}`);
						methodCalled = true;
						break;

					} catch(err) {

						console.warn(`调用方法 ${method} 失败:`, err);

					}

				}

			}

			if(!methodCalled) {

				console.warn("无法设置HBAO混合强度，所有尝试都失败了");

				// 最后的尝试 - 直接在EffectPass中查找控制方法
				const hbaoPass = composer.passes.find(pass =>
					pass.effects && pass.effects.some(effect => effect instanceof HBAOEffect));

				if(hbaoPass) {

					console.log("尝试直接设置EffectPass混合模式");
					try {

						const effect = hbaoPass.effects.find(effect => effect instanceof HBAOEffect);
						if(effect && effect.blendMode) {

							effect.blendMode.opacity = e.value;
							console.log("成功设置EffectPass内效果的混合强度");

						}

					} catch(err) {

						console.error("设置EffectPass混合模式失败:", err);

					}

				}

			}

		}

	});

	// 基本参数控制
	folder.addBinding(hbaoEffect, "resolutionScale", {
		min: 0.25, max: 1, step: 0.05,
		label: "分辨率比例"
	});

	folder.addBinding(hbaoEffect, "aoDistance", {
		min: 0.1, max: 10, step: 0.1,
		label: "AO距离"
	});

	folder.addBinding(hbaoEffect, "distancePower", {
		min: 0.1, max: 4, step: 0.1,
		label: "距离衰减"
	});

	folder.addBinding(hbaoEffect, "bias", {
		min: 0.01, max: 0.5, step: 0.01,
		label: "偏移量"
	});

	folder.addBinding(hbaoEffect, "thickness", {
		min: 0.01, max: 1, step: 0.01,
		label: "厚度"
	});

	folder.addBinding(hbaoEffect, "power", {
		min: 1, max: 5, step: 0.1,
		label: "AO强度"
	});

	// 采样设置
	const samplingFolder = pane.addFolder({ title: "采样设置" });
	samplingFolder.addBinding(hbaoEffect, "spp", {
		min: 4, max: 32, step: 1,
		label: "每像素采样数"
	});

	// 降噪设置
	const denoiseFolder = pane.addFolder({ title: "降噪设置" });

	// 创建自定义对象来控制降噪设置
	const denoiseSettings = {
		iterations: 2,
		radius: 6,
		depthPhi: 2.0,
		normalPhi: 5.0
	};

	denoiseFolder.addBinding(denoiseSettings, "iterations", {
		min: 0, max: 4, step: 1,
		label: "降噪迭代次数"
	}).on("change", (e) => {

		try {

			if(hbaoEffect.iterations !== undefined) {

				hbaoEffect.iterations = e.value;

			} else if(hbaoEffect.denoiseIterations !== undefined) {

				hbaoEffect.denoiseIterations = e.value;

			} else {

				console.warn("无法设置降噪迭代次数，API可能已更改");

			}

		} catch(err) {

			console.error("设置降噪迭代次数出错:", err);

		}

	});

	denoiseFolder.addBinding(denoiseSettings, "radius", {
		min: 1, max: 12, step: 1,
		label: "降噪半径"
	}).on("change", (e) => {

		try {

			if(hbaoEffect.radius !== undefined) {

				hbaoEffect.radius = e.value;

			} else if(hbaoEffect.denoiseRadius !== undefined) {

				hbaoEffect.denoiseRadius = e.value;

			} else {

				console.warn("无法设置降噪半径，API可能已更改");

			}

		} catch(err) {

			console.error("设置降噪半径出错:", err);

		}

	});

	denoiseFolder.addBinding(denoiseSettings, "depthPhi", {
		min: 0.1, max: 10, step: 0.1,
		label: "深度容差"
	}).on("change", (e) => {

		try {

			if(hbaoEffect.depthPhi !== undefined) {

				hbaoEffect.depthPhi = e.value;

			} else {

				console.warn("无法设置深度容差，API可能已更改");

			}

		} catch(err) {

			console.error("设置深度容差出错:", err);

		}

	});

	denoiseFolder.addBinding(denoiseSettings, "normalPhi", {
		min: 0.1, max: 50, step: 0.1,
		label: "法线容差"
	}).on("change", (e) => {

		try {

			if(hbaoEffect.normalPhi !== undefined) {

				hbaoEffect.normalPhi = e.value;

			} else {

				console.warn("无法设置法线容差，API可能已更改");

			}

		} catch(err) {

			console.error("设置法线容差出错:", err);

		}

	});

	// 颜色控制
	folder.addBinding(hbaoEffect.color, "r", {
		min: 0, max: 1, step: 0.01,
		label: "AO颜色-红"
	});

	folder.addBinding(hbaoEffect.color, "g", {
		min: 0, max: 1, step: 0.01,
		label: "AO颜色-绿"
	});

	folder.addBinding(hbaoEffect.color, "b", {
		min: 0, max: 1, step: 0.01,
		label: "AO颜色-蓝"
	});

	// 预设选项
	const presets = {
		preset: "medium"
	};

	folder.addBinding(presets, "preset", {
		options: {
			低质量: "low",
			中质量: "medium",
			高质量: "high"
		}
	}).on("change", (e) => {

		// 应用预设
		switch(e.value) {

			case "low":
				hbaoEffect.resolutionScale = 0.5;
				hbaoEffect.spp = 8;
				hbaoEffect.iterations = 1;
				break;
			case "medium":
				hbaoEffect.resolutionScale = 0.75;
				hbaoEffect.spp = 16;
				hbaoEffect.iterations = 2;
				break;
			case "high":
				hbaoEffect.resolutionScale = 1.0;
				hbaoEffect.spp = 32;
				hbaoEffect.iterations = 3;
				break;

		}

		// 更新UI显示
		pane.refresh();

	});

	// 比较按钮
	let compareMode = false;
	const compareButton = pane.addButton({
		title: "关闭HBAO（比较）"
	}).on("click", () => {

		compareMode = !compareMode;

		// 获取HBAO效果所在的EffectPass
		let hbaoPass = null;
		composer.passes.forEach(pass => {

			if(pass.effects && pass.effects.length > 0) {

				if(pass.effects.some(effect => effect instanceof HBAOEffect)) {

					hbaoPass = pass;

				}

			}

		});

		if(hbaoPass) {

			// 切换效果
			hbaoPass.enabled = !compareMode;

		}

		// 更新按钮文本
		compareButton.title = compareMode ? "开启HBAO" : "关闭HBAO（比较）";

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
