import {
	AnimationMixer,
	BoxGeometry,
	Color,
	CubeTextureLoader,
	CylinderGeometry,
	GLTFLoader,
	Group,
	LoadingManager,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	Raycaster,
	Scene,
	SphereGeometry,
	SRGBColorSpace,
	TextureLoader,
	TorusKnotGeometry,
	Vector2,
	VSMShadowMap,
	WebGLRenderer
} from "three";

import {
	EffectComposer,
	EffectPass,
	RealismNew,
	RenderPass,
	RealismSSAOEffect,
	SelectiveSSAOEffect,
	RSSAOEffect,
	Selection
} from "postprocessing";
import * as THREE from "three";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import * as Shapes from "../objects/Shapes";
import { calculateVerticalFoV, FPSMeter } from "../utils";

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
	if (!Array.isArray(paths)) {
		paths = [paths];
	}

	// 尝试每个可能的路径
	for (const path of paths) {
		try {
			// 分解属性路径
			const parts = path.split('.');
			let current = obj;
			let lastPart = null;
			let lastObj = null;

			// 遍历路径
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (i === parts.length - 1) {
					// 最后一部分
					lastPart = part;
					lastObj = current;
				}

				if (current[part] === undefined) {
					// 该路径不存在，尝试下一个
					current = null;
					break;
				}

				current = current[part];
			}

			// 如果找到了有效路径
			if (current !== null && lastObj !== null) {
				if (set) {
					// 设置属性
					lastObj[lastPart] = value;
					console.log(`成功设置属性 ${path} = ${value}`);
					return true;
				} else {
					// 获取属性
					return current;
				}
			}
		} catch (err) {
			console.warn(`访问属性路径 ${path} 时出错:`, err);
		}
	}

	// 所有路径都失败了
	if (set) {
		console.warn(`无法设置属性，所有路径都失败了:`, paths);
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

// 创建更适合展示AO效果的场景对象
function createAOTestObjects() {
	const group = new Group();

	// 1. 创建一个"凹槽地台"展示AO
	const platformSize = 6;
	const platformHeight = 0.2;
	const grooveWidth = 0.5;
	const grooveDepth = 0.3;

	// 主平台
	const platform = new Mesh(
		new BoxGeometry(platformSize, platformHeight, platformSize),
		new MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8, metalness: 0.0 })
	);
	platform.name = 'ignore'
	platform.position.y = -1.5;
	platform.receiveShadow = true;
	group.add(platform);

	// 添加凹槽
	for (let i = 0; i < 3; i++) {
		const groove = new Mesh(
			new BoxGeometry(platformSize - 0.4, grooveDepth, grooveWidth),
			new MeshStandardMaterial({ color: 0x999999, roughness: 0.7, metalness: 0.0 })
		);
		groove.position.set(0, -1.5 + platformHeight / 2 + grooveDepth / 2, -1.5 + i * 1.5);
		groove.receiveShadow = true;
		groove.castShadow = true;
		group.add(groove);
	}

	// 2. 添加悬浮立方体阵列（产生投影和接触阴影）
	const cubeSize = 0.5;
	for (let i = 0; i < 5; i++) {
		const height = 0.3 + i * 0.4;
		const cube = new Mesh(
			new BoxGeometry(cubeSize, cubeSize, cubeSize),
			new MeshStandardMaterial({
				color: 0xffffff,
				roughness: 0.5,
				metalness: 0.1
			})
		);
		cube.position.set(-2 + i, -1.5 + platformHeight / 2 + height, -2);
		cube.castShadow = true;
		cube.receiveShadow = true;
		group.add(cube);
	}

	// 3. 创建几何交叉结构（AO效果明显）
	const cylinder = new Mesh(
		new CylinderGeometry(0.3, 0.3, 4, 20),
		new MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6, metalness: 0.0 })
	);
	cylinder.rotation.x = Math.PI / 2;
	cylinder.position.set(0, 0, 0);
	cylinder.castShadow = cylinder.receiveShadow = true;
	cylinder.name = '123'
	group.add(cylinder);

	const cylinder2 = new Mesh(
		new CylinderGeometry(0.3, 0.3, 4, 20),
		new MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6, metalness: 0.0 })
	);
	cylinder2.position.set(0, 0, 0);
	cylinder2.castShadow = cylinder2.receiveShadow = true;
	group.add(cylinder2);

	// 4. 添加一个复杂纠结体（内部有很多角落和缝隙）
	const torusKnot = new Mesh(
		new TorusKnotGeometry(0.8, 0.2, 64, 16),
		new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2 })
	);
	torusKnot.position.set(2, 0.7, 2);
	torusKnot.castShadow = torusKnot.receiveShadow = true;
	group.add(torusKnot);

	return group;
}

// 获取Selection中的对象数量
function getSelectionCount(selection) {
	if (!selection) return 0;

	// 检查各种可能的访问方式
	if (Array.isArray(selection.items)) {
		return selection.items.length;
	}

	if (Array.isArray(selection.objects)) {
		return selection.objects.length;
	}

	if (typeof selection.getItems === 'function') {
		return selection.getItems().length;
	}

	if (typeof selection.getSelection === 'function') {
		return selection.getSelection().length;
	}

	if (typeof selection.size === 'number') {
		return selection.size;
	}

	// 如果Selection是一个可迭代对象
	if (typeof selection[Symbol.iterator] === 'function') {
		return Array.from(selection).length;
	}

	return 0;
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
	controls.position.set(5, 3, 6);
	controls.lookAt(0, 0, 0);

	// 场景、灯光和对象
	const scene = new Scene();
	scene.background = assets.get("sky");

	// 添加增强的灯光
	const lights = Shapes.createLights();
	// 调整光照使AO效果更明显
	lights.children.forEach(light => {
		if (light.isDirectionalLight) {
			light.intensity = 1.0; // 降低直射光强度以便更好地看到AO
			light.position.set(5, 10, 2); // 调整光源方向，增加阴影
			light.castShadow = true;
			light.shadow.bias = -0.001;
		} else if (light.isAmbientLight) {
			light.intensity = 0.3; // 降低环境光（让AO效果更明显）
		}
	});
	scene.add(lights);

	// 添加场景对象
	const actors = Shapes.createActors();
	// 调整原有场景对象位置，放置于一侧
	actors.position.set(-3, 0, 3);
	actors.scale.set(0.7, 0.7, 0.7);
	scene.add(actors);

	// 添加更适合展示AO的对象
	const aoObjects = createAOTestObjects();
	scene.add(aoObjects);

	// 添加角色模型，放置在合适位置
	const riggedSimple = assets.get("rigged-simple");
	riggedSimple.scene.scale.multiplyScalar(0.3);
	riggedSimple.scene.position.set(2, -1.5, -1);
	riggedSimple.scene.rotation.y = -Math.PI / 4;
	scene.add(riggedSimple.scene);

	// 设置动画
	const animationMixer = new AnimationMixer(riggedSimple.scene);
	const action = animationMixer.clipAction(riggedSimple.animations[0]);
	action.play();

	// 后处理
	const multisampling = Math.min(4, renderer.capabilities.maxSamples);
	const composer = new EffectComposer(renderer, { multisampling, });
	composer.setMainScene(scene)

	console.log('Log-- ', composer, 'composer');
	// 添加基本渲染通道
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 设置渲染器色调映射
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;

	console.log('Log-- ', 'RealismSSAOEffect');
	// 创建SSAO效果
	const ssaoEffect = new SelectiveSSAOEffect(composer, camera, scene, {
		// 基本参数
		resolutionScale: 0.25,
		color: new Color(0xFFFFFF).convertSRGBToLinear(),

		// AO参数
		aoDistance: 1.0,
		distancePower: 0.25,
		power: 2.0,
		bias: 0.001,
		thickness: 0.075,

		// 采样参数
		samples: 1,
		rings: 5.625,
		radius: 1.0,
		spp: 16,

		// 降噪参数
		iterations: 0.02,
		lumaPhi: 10.0,
		normalPhi: 3.25,
		depthPhi: 2.0,

		// 尺寸参数
		width: container.clientWidth,
		height: container.clientHeight,

		// 忽略列表设置
		ignoreSelection: new Selection(),
		highlightValue: 0.8,

		// 渲染控制
	});

	// 打印Selection对象的结构，帮助调试
	console.log('Selection API 结构:', {
		selection: ssaoEffect.ignoreSelection,
		properties: Object.keys(ssaoEffect.ignoreSelection),
		methods: Object.getOwnPropertyNames(Object.getPrototypeOf(ssaoEffect.ignoreSelection)),
		hasItems: !!ssaoEffect.ignoreSelection.items,
		hasObjects: !!ssaoEffect.ignoreSelection.objects,
		hasGetItems: typeof ssaoEffect.ignoreSelection.getItems === 'function'
	});

	// 添加SSAO效果到合成器
	composer.addPass(new EffectPass(camera, ssaoEffect));

	// 输出SSAOEffect的实际API结构
	console.log('SSAO效果已创建，详细API:', {
		directProperties: Object.keys(ssaoEffect),
		hasBlendMode: !!ssaoEffect.blendMode,
		blendModeProperties: ssaoEffect.blendMode ? Object.keys(ssaoEffect.blendMode) : [],
		hasSetOpacity: typeof ssaoEffect.setOpacity === 'function',
		prototype: Object.getPrototypeOf(ssaoEffect) ? Object.keys(Object.getPrototypeOf(ssaoEffect)) : [],
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

	if (ambientLight) {
		lightFolder.addBinding(ambientLight, "intensity", {
			min: 0, max: 2, step: 0.1,
			label: "环境光强度"
		});
	}

	// SSAO设置
	const folder = pane.addFolder({ title: "SSAO设置" });

	// 基本控制
	folder.addBinding({ enabled: true }, "enabled", { label: "启用SSAO" })
		.on("change", (e) => {
			// 通过控制EffectPass的enabled属性来切换效果
			composer.passes.forEach(pass => {
				if (pass.effects && pass.effects.length > 0) {
					if (pass.effects.some(effect => effect.constructor.name === "SSAOEffect")) {
						pass.enabled = e.value;
					}
				}
			});
		});



	// 创建自定义对象来控制混合强度
	const blendSettings = {
		strength: 0.85 // 默认值略微降低
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

		const success = accessProperty(ssaoEffect, paths, e.value, true);

		if (!success) {
			// 尝试调用可能的setter方法
			const methods = [
				"setOpacity",
				"setBlendMode",
				"setBlend",
				"setStrength"
			];

			let methodCalled = false;
			for (const method of methods) {
				if (typeof ssaoEffect[method] === 'function') {
					try {
						ssaoEffect[method](e.value);
						console.log(`成功通过方法 ${method} 设置混合强度为 ${e.value}`);
						methodCalled = true;
						break;
					} catch (err) {
						console.warn(`调用方法 ${method} 失败:`, err);
					}
				}
			}

			if (!methodCalled) {
				console.warn("无法设置SSAO混合强度，所有尝试都失败了");

				// 最后的尝试 - 直接在EffectPass中查找控制方法
				const ssaoPass = composer.passes.find(pass =>
					pass.effects && pass.effects.some(effect => effect.constructor.name === "SSAOEffect"));

				if (ssaoPass) {
					console.log("尝试直接设置EffectPass混合模式");
					try {
						const effect = ssaoPass.effects.find(effect => effect instanceof RealismSSAOEffect);
						if (effect && effect.blendMode) {
							effect.blendMode.opacity = e.value;
							console.log("成功设置EffectPass内效果的混合强度");
						}
					} catch (err) {
						console.error("设置EffectPass混合模式失败:", err);
					}
				}
			}
		}
	});

	// 基本参数控制
	folder.addBinding(ssaoEffect, "resolutionScale", {
		min: 0.25, max: 1, step: 0.05,
		label: "分辨率比例"
	});

	// 采样参数
	const samplingFolder = pane.addFolder({ title: "采样设置" });

	samplingFolder.addBinding(ssaoEffect, "samples", {
		min: 1, max: 32, step: 1,
		label: "样本数"
	});

	samplingFolder.addBinding(ssaoEffect, "rings", {
		min: 1, max: 16, step: 1,
		label: "采样环数"
	});

	samplingFolder.addBinding(ssaoEffect, "radius", {
		min: 0, max: 100, step: 1,
		label: "采样半径"
	});

	samplingFolder.addBinding(ssaoEffect, "spp", {
		min: 0, max: 100, step: 1,
		label: "每像素采样数"
	});

	// AO参数
	const aoFolder = pane.addFolder({ title: "AO参数" });

	aoFolder.addBinding(ssaoEffect, "aoDistance", {
		min: 0, max: 10, step: 0.1,
		label: "AO距离"
	});

	aoFolder.addBinding(ssaoEffect, "distancePower", {
		min: 0, max: 10, step: 0.05,
		label: "距离衰减"
	});

	aoFolder.addBinding(ssaoEffect, "bias", {
		min: 0, max: 1.0, step: 0.001,
		label: "偏移量"
	});

	aoFolder.addBinding(ssaoEffect, "thickness", {
		min: 0, max: 10, step: 0.001,
		label: "厚度"
	});

	aoFolder.addBinding(ssaoEffect, "power", {
		min: 0, max: 100, step: 0.1,
		label: "AO强度"
	});

	// 降噪参数
	const denoiseFolder = pane.addFolder({ title: "降噪参数" });

	denoiseFolder.addBinding(ssaoEffect, "iterations", {
		min: 0, max: 1.0, step: 0.01,
		label: "迭代强度"
	});

	denoiseFolder.addBinding(ssaoEffect, "lumaPhi", {
		min: 0, max: 100, step: 0.1,
		label: "亮度容差"
	});

	denoiseFolder.addBinding(ssaoEffect, "normalPhi", {
		min: 0, max: 100, step: 0.1,
		label: "法线容差"
	});

	denoiseFolder.addBinding(ssaoEffect, "depthPhi", {
		min: 0, max: 10, step: 0.1,
		label: "深度容差"
	});

	// 颜色控制
	const colorFolder = pane.addFolder({ title: "颜色设置" });

	// 使用辅助函数获取十六进制颜色字符串
	function getHexByColor(color) {
		return '#' + color.getHexString();
	}

	// 颜色控制状态对象
	const colorState = {
		color: "#FFFFFF"
	};

	colorFolder.addBinding(colorState, "color", {
		view: "color",
		label: "AO颜色"
	}).on("change", (e) => {
		if (e.value === "#000000") {
			ssaoEffect.color = null;
		} else {
			ssaoEffect.color = new Color().setStyle(e.value).convertSRGBToLinear();
		}
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
		// 应用预设，根据配置对象调整参数
		switch (e.value) {
			case "low":
				// 分辨率和采样
				ssaoEffect.resolutionScale = 0.25;
				ssaoEffect.samples = 1;
				ssaoEffect.rings = 3;
				ssaoEffect.radius = 0.5;
				ssaoEffect.spp = 8;

				// AO参数
				ssaoEffect.aoDistance = 0.5;
				ssaoEffect.power = 1.5;
				ssaoEffect.bias = 0.001;
				ssaoEffect.thickness = 0.075;
				ssaoEffect.distancePower = 0.25;

				// 降噪参数
				ssaoEffect.iterations = 0.01;
				ssaoEffect.depthPhi = 0.5;
				ssaoEffect.normalPhi = 2.0;
				ssaoEffect.lumaPhi = 5.0;
				break;

			case "medium":
				// 分辨率和采样
				ssaoEffect.resolutionScale = 0.5;
				ssaoEffect.samples = 1;
				ssaoEffect.rings = 5.625;
				ssaoEffect.radius = 1.0;
				ssaoEffect.spp = 16;

				// AO参数
				ssaoEffect.aoDistance = 1.0;
				ssaoEffect.power = 2.0;
				ssaoEffect.bias = 0.001;
				ssaoEffect.thickness = 0.075;
				ssaoEffect.distancePower = 0.25;

				// 降噪参数
				ssaoEffect.iterations = 0.02;
				ssaoEffect.depthPhi = 2.0;
				ssaoEffect.normalPhi = 3.25;
				ssaoEffect.lumaPhi = 10.0;
				break;

			case "high":
				// 分辨率和采样
				ssaoEffect.resolutionScale = 0.75;
				ssaoEffect.samples = 16;
				ssaoEffect.rings = 7;
				ssaoEffect.radius = 2.0;
				ssaoEffect.spp = 32;

				// AO参数
				ssaoEffect.aoDistance = 1.5;
				ssaoEffect.power = 2.5;
				ssaoEffect.bias = 0.001;
				ssaoEffect.thickness = 0.075;
				ssaoEffect.distancePower = 0.25;

				// 降噪参数
				ssaoEffect.iterations = 0.03;
				ssaoEffect.depthPhi = 3.0;
				ssaoEffect.normalPhi = 5.0;
				ssaoEffect.lumaPhi = 15.0;
				break;
		}

		// 更新颜色状态
		colorState.color = ssaoEffect.color ? getHexByColor(ssaoEffect.color) : "#FFFFFF";

		// 更新UI显示
		pane.refresh();
	});

	// 比较按钮
	let compareMode = false;
	const compareButton = pane.addButton({
		title: "关闭SSAO（比较）"
	}).on("click", () => {
		compareMode = !compareMode;

		// 获取SSAO效果所在的EffectPass
		let ssaoPass = null;
		composer.passes.forEach(pass => {
			if (pass.effects && pass.effects.length > 0) {
				if (pass.effects.some(effect => effect.constructor.name === "SSAOEffect")) {
					ssaoPass = pass;
				}
			}
		});

		if (ssaoPass) {
			// 切换效果
			ssaoPass.enabled = !compareMode;
		}

		// 更新按钮文本
		compareButton.title = compareMode ? "开启SSAO" : "关闭SSAO（比较）";
	});

	// 添加忽略模型相关功能的UI
	const ignoreFolder = pane.addFolder({
		title: "模型忽略设置",
		expanded: true // 默认展开此面板
	});

	// 添加说明文字
	const instructionElem = document.createElement('div');
	instructionElem.className = 'instruction-text';
	instructionElem.textContent = '点击模型将其添加到AO忽略列表';
	instructionElem.style.cssText = 'background: rgba(0,0,0,0.1); padding: 8px; border-radius: 4px; margin: 8px 0; text-align: center; font-size: 12px;';
	// 获取ignoreFolder的DOM元素并添加说明
	setTimeout(() => {
		const folderElem = ignoreFolder.element;
		if (folderElem) {
			folderElem.prepend(instructionElem);
		}
	}, 100); // 短暂延时确保DOM已更新

	// 显示当前忽略模型数量
	const ignoreState = {
		ignoredCount: 0,
		highlightValue: 0.8,
		brightnessThreshold: 0.7 // 添加亮度阈值控制
	};

	// 显示忽略的模型数量
	ignoreFolder.addBinding(ignoreState, "ignoredCount", {
		label: "已忽略模型数量",
		readonly: true
	});

	// 控制高亮强度
	ignoreFolder.addBinding(ignoreState, "highlightValue", {
		min: 0.5, max: 2.0, step: 0.1,
		label: "高亮强度"
	}).on("change", (e) => {
		try {
			// 更新SSAO效果中的高亮值
			ssaoEffect.highlightValue = e.value;
		} catch (error) {
			console.error('设置高亮值时出错:', error);
		}
	});

	// 添加亮度阈值控制
	ignoreFolder.addBinding(ignoreState, "brightnessThreshold", {
		min: 0.1, max: 1.0, step: 0.05,
		label: "亮度阈值"
	}).on("change", (e) => {
		try {
			// 更新着色器中的亮度阈值
			if (ssaoEffect.brightnessThreshold !== undefined) {
				ssaoEffect.brightnessThreshold = e.value;
			}
		} catch (error) {
			console.error('设置亮度阈值时出错:', error);
		}
	});

	// 添加调试面板
	const debugFolder = pane.addFolder({
		title: "调试选项",
		expanded: false // 默认折叠
	});

	// 调试模式选择器
	const debugModes = {
		debugMode: 0,
		showInfo: true,
		invertMask: false,
		ignoreBackground: false,
		maskThreshold: 0.01
	};

	debugFolder.addBinding(debugModes, "debugMode", {
		options: {
			"正常渲染": 0,
			"亮度可视化": 1,
			"AO强度可视化": 2,
			"AO值可视化": 3,
			"遮罩可视化": 4,
			"深度(灰度)": 5,
			"深度(彩色)": 6,
			"遮罩和深度对比": 7,
			"对象ID可视化": 8
		},
		label: "调试显示模式"
	}).on("change", (e) => {
		try {
			// 更新SSAO效果中的调试模式
			if (ssaoEffect.debugMode !== undefined) {
				ssaoEffect.debugMode = e.value;
				console.log(`切换到调试模式: ${e.value}`);
			} else {
				console.warn('SSAO效果不支持调试模式。请确保使用的是支持debugMode的AOEffect版本。');
			}
		} catch (error) {
			console.error('设置调试模式时出错:', error);
		}
	});

	// 添加反转遮罩选项
	debugFolder.addBinding(debugModes, "invertMask", {
		label: "反转遮罩"
	}).on("change", (e) => {
		try {
			if (ssaoEffect.inverted !== undefined) {
				ssaoEffect.inverted = e.value;
				console.log(`${e.value ? '启用' : '禁用'}遮罩反转`);
			}
		} catch (error) {
			console.error('设置遮罩反转时出错:', error);
		}
	});

	// 添加忽略背景选项
	debugFolder.addBinding(debugModes, "ignoreBackground", {
		label: "忽略背景"
	}).on("change", (e) => {
		try {
			if (ssaoEffect.ignoreBackground !== undefined) {
				ssaoEffect.ignoreBackground = e.value;
				console.log(`${e.value ? '启用' : '禁用'}背景忽略`);
			}
		} catch (error) {
			console.error('设置背景忽略时出错:', error);
		}
	});

	// 添加遮罩阈值控制
	debugFolder.addBinding(debugModes, "maskThreshold", {
		min: 0.001, max: 0.1, step: 0.001,
		label: "遮罩阈值"
	}).on("change", (e) => {
		try {
			if (ssaoEffect.maskThreshold !== undefined) {
				ssaoEffect.maskThreshold = e.value;
				console.log(`设置遮罩阈值为: ${e.value}`);
			}
		} catch (error) {
			console.error('设置遮罩阈值时出错:', error);
		}
	});

	// 添加性能监视选项
	debugFolder.addBinding(debugModes, "showInfo", {
		label: "显示调试信息"
	}).on("change", (e) => {
		// 更新性能显示
		const debugInfo = document.getElementById('debug-info');
		if (debugInfo) {
			debugInfo.style.display = e.value ? 'block' : 'none';
		}
	});

	// 添加调试信息面板
	const debugInfo = document.createElement('div');
	debugInfo.id = 'debug-info';
	debugInfo.style.cssText = 'position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.6); color: white; padding: 10px; font-family: monospace; font-size: 12px; border-radius: 4px; pointer-events: none; z-index: 1000;';
	container.appendChild(debugInfo);

	// 添加清空忽略列表的按钮
	ignoreFolder.addButton({
		title: "清空忽略列表"
	}).on("click", () => {
		try {
			// 清空Selection
			ssaoEffect.ignoreSelection.clear();

			// 更新忽略计数
			ignoreState.ignoredCount = getSelectionCount(ssaoEffect.ignoreSelection);
			pane.refresh();
		} catch (error) {
			console.error('清空Selection时出错:', error);
		}
	});

	// 添加快捷键支持
	window.addEventListener("keydown", (event) => {
		// Alt+D 显示/隐藏开发者测试面板
		if (event.key === "d" && event.altKey) {
			debugFolder.expanded = !debugFolder.expanded;
			pane.refresh();
		}

		// 数字键1-4切换调试模式
		if (event.key >= "1" && event.key <= "4" && event.ctrlKey) {
			const mode = parseInt(event.key) - 1;
			if (mode >= 0 && mode <= 3) {
				debugModes.debugMode = mode;
				if (ssaoEffect.debugMode !== undefined) {
					ssaoEffect.debugMode = mode;
					console.log(`快捷键切换到调试模式: ${mode}`);
					pane.refresh();
				}
			}
		}
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

	// 添加鼠标射线和忽略列表
	const raycaster = new Raycaster();
	const mouse = new Vector2();

	// 添加点击事件处理
	renderer.domElement.addEventListener('click', (event) => {
		// 计算鼠标位置的归一化设备坐标 (-1 到 +1)
		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		// 设置射线从相机发出经过鼠标位置
		raycaster.setFromCamera(mouse, camera);

		// 计算物体和射线的焦点
		const intersects = raycaster.intersectObjects(scene.children, true);

		if (intersects.length > 0) {
			const object = intersects[0].object;
			if (object.isMesh) {
				console.log('点击了模型:', object.name || '未命名模型');

				try {
					// 检查对象是否在Selection中
					if (ssaoEffect.ignoreSelection.has(object)) {
						console.log('从忽略列表中移除模型');
						// 从Selection中移除对象
						ssaoEffect.ignoreSelection.delete(object);
					} else {
						console.log('添加模型到忽略列表');
						// 添加对象到Selection
						ssaoEffect.ignoreSelection.add(object);
					}

					// 更新忽略计数
					ignoreState.ignoredCount = getSelectionCount(ssaoEffect.ignoreSelection);
					pane.refresh();
				} catch (error) {
					console.error('处理Selection时出错:', error);
				}
			}
		}
	});

	// 渲染循环
	let t0 = 0;

	requestAnimationFrame(function render(timestamp) {
		const deltaTime = timestamp - t0;
		t0 = timestamp;

		fpsMeter.update(timestamp);
		controls.update(timestamp);
		animationMixer.update(deltaTime * 1e-3);
		composer.render();

		// 更新调试信息面板
		if (debugModes.showInfo) {
			const debugInfo = document.getElementById('debug-info');
			if (debugInfo) {
				const currentMode = ["正常", "亮度可视化", "AO强度可视化", "AO值可视化"][debugModes.debugMode];

				debugInfo.innerHTML = `
					<div><b>AO调试信息:</b></div>
					<div>当前模式: ${currentMode}</div>
					<div>分辨率比例: ${ssaoEffect.resolutionScale.toFixed(2)}</div>
					<div>亮度阈值: ${ssaoEffect.brightnessThreshold?.toFixed(2) || "未设置"}</div>
					<div>每像素采样: ${ssaoEffect.spp}</div>
					<div>AO强度: ${ssaoEffect.power?.toFixed(2) || "未设置"}</div>
					<div>模型总数: ${scene.children.reduce((count, child) => count + (child.isMesh ? 1 : 0), 0)}</div>
					<div>忽略模型数: ${getSelectionCount(ssaoEffect.ignoreSelection)}</div>
				`;
			}
		}

		requestAnimationFrame(render);
	});
}));
