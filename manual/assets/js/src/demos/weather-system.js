/**
 * 智能天气系统管理器演示
 *
 * 展示WeatherManager如何统一管理多种天气效果，
 * 包括天空、降雨、降雪等，以及它们之间的平滑过渡
 */

import * as THREE from "three";
import {
	AmbientLight,
	Clock,
	DirectionalLight,
	Group,
	HalfFloatType,
	LoadingManager,
	Mesh,
	MeshStandardMaterial,
	PCFSoftShadowMap,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
	BoxGeometry,
	Color,
	CylinderGeometry
} from "three";

import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	WeatherManager
} from "postprocessing";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

function load() {

	const assets = new Map();
	const loadingManager = new LoadingManager();
	// 目前天气管理器不需要额外资源，但保持结构一致性

	return new Promise((resolve, reject) => {

		loadingManager.onLoad = () => resolve(assets);
		loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

		// 如果需要加载噪声纹理，可以在这里添加
		// 但WeatherManager会自动处理这些
		resolve(assets);

	});

}

// 创建场景物体
function createScene() {

	const group = new Group();

	// 创建地面
	const ground = new Mesh(
		new PlaneGeometry(100, 100, 1, 1),
		new MeshStandardMaterial({
			color: 0x556633,
			roughness: 0.8,
			metalness: 0.1
		})
	);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -3;
	ground.receiveShadow = true;
	group.add(ground);

	// 创建一个小镇场景
	const buildings = new Group();

	// 主要建筑群
	const buildingConfigs = [
		{ size: [4, 12, 4], pos: [-8, 3, -10], color: 0x8899aa },
		{ size: [3, 8, 3], pos: [8, 1, -8], color: 0xaa9988 },
		{ size: [5, 6, 3], pos: [-5, 0, 5], color: 0x99aacc },
		{ size: [2.5, 15, 2.5], pos: [0, 4.5, -15], color: 0xccaa99 },
		{ size: [6, 4, 4], pos: [10, -1, 8], color: 0x88ccaa },
		{ size: [3, 10, 2], pos: [-12, 2, 3], color: 0xcc99aa }
	];

	buildingConfigs.forEach(config => {
		const building = new Mesh(
			new BoxGeometry(...config.size),
			new MeshStandardMaterial({
				color: config.color,
				roughness: 0.6,
				metalness: 0.3
			})
		);
		building.position.set(...config.pos);
		building.castShadow = building.receiveShadow = true;
		buildings.add(building);
	});

	group.add(buildings);

	// 添加树木
	const trees = new Group();
	const treePositions = [
		[-15, -2, -5], [15, -2, -3], [-10, -2, 10],
		[12, -2, 15], [0, -2, 20], [-20, -2, 0],
		[18, -2, -10], [-8, -2, 18], [6, -2, -18]
	];

	treePositions.forEach(pos => {
		// 树干
		const trunk = new Mesh(
			new CylinderGeometry(0.3, 0.4, 3, 8),
			new MeshStandardMaterial({
				color: 0x4a4a2a,
				roughness: 0.9
			})
		);
		trunk.position.set(pos[0], pos[1] + 1.5, pos[2]);
		trunk.castShadow = trunk.receiveShadow = true;
		trees.add(trunk);

		// 树冠
		const foliage = new Mesh(
			new BoxGeometry(2 + Math.random(), 3 + Math.random(), 2 + Math.random()),
			new MeshStandardMaterial({
				color: 0x2d4a2d,
				roughness: 0.8
			})
		);
		foliage.position.set(pos[0], pos[1] + 4, pos[2]);
		foliage.castShadow = foliage.receiveShadow = true;
		trees.add(foliage);
	});

	group.add(trees);

	// 添加路灯
	const streetLights = new Group();
	const lightPositions = [
		[-6, -2, 0], [6, -2, 0], [0, -2, 12],
		[-10, -2, -12], [10, -2, -12]
	];

	lightPositions.forEach(pos => {
		// 灯杆
		const pole = new Mesh(
			new CylinderGeometry(0.1, 0.15, 6, 8),
			new MeshStandardMaterial({
				color: 0x333333,
				roughness: 0.7,
				metalness: 0.3
			})
		);
		pole.position.set(pos[0], pos[1] + 3, pos[2]);
		pole.castShadow = pole.receiveShadow = true;
		streetLights.add(pole);

		// 灯头
		const light = new Mesh(
			new BoxGeometry(1, 0.4, 1),
			new MeshStandardMaterial({
				color: 0xffffcc,
				roughness: 0.2,
				metalness: 0.1,
				emissive: new Color(0x222211)
			})
		);
		light.position.set(pos[0], pos[1] + 6.2, pos[2]);
		streetLights.add(light);
	});

	group.add(streetLights);

	return group;

}

window.addEventListener("load", () => load().then((assets) => {

	// 渲染器设置
	const renderer = new WebGLRenderer({
		powerPreference: "high-performance",
		antialias: true,
		stencil: false,
		depth: true
	});

	renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
	renderer.shadowMap.type = PCFSoftShadowMap;
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
	settings.translation.enabled = true;
	controls.position.set(0, 5, 20);

	// 场景设置
	const scene = new Scene();
	scene.background = new Color(0x87ceeb); // 初始天空蓝

	// 光照设置
	const directionalLight = new DirectionalLight(0xffffff, 1.0);
	directionalLight.position.set(10, 10, 5);
	directionalLight.castShadow = true;
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	directionalLight.shadow.camera.near = 0.1;
	directionalLight.shadow.camera.far = 100;
	directionalLight.shadow.camera.left = -50;
	directionalLight.shadow.camera.right = 50;
	directionalLight.shadow.camera.top = 50;
	directionalLight.shadow.camera.bottom = -50;
	scene.add(directionalLight);

	const ambientLight = new AmbientLight(0x404040, 0.3);
	scene.add(ambientLight);

	// 添加场景对象
	const sceneObjects = createScene();
	scene.add(sceneObjects);

	// 后期处理
	const composer = new EffectComposer(renderer, {
		frameBufferType: HalfFloatType
	});
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 创建天气管理器
	const weatherManager = new WeatherManager({
		enableTransitions: true,
		transitionSpeed: 1.0,
		effectOptions: {
			sky: {
				sunPosition: new Vector3(0.3, 0.2, -1).normalize(),
				fov: 75,
				enableStars: true,
				enableMoon: true
			},
			rain: {
				rainColor: 0x87ceeb,
				windDirection: new Vector2(0.1, 0)
			},
			snow: {
				windDirection: new Vector2(0.05, 0),
				snowColor: 0xffffff
			}
		}
	});

	// 设置天气管理器的相机
	weatherManager.effects.sky.setCamera(camera);

	// 更新后处理管线
	function updateComposer() {
		// 移除现有的天气效果
		while (composer.passes.length > 1) {
			composer.removePass(composer.passes[1]);
		}

		// 添加当前活跃的效果
		const effects = weatherManager.getEffects();
		if (effects.length > 0) {
			const effectPass = new EffectPass(camera, ...effects);
			composer.addPass(effectPass);
		}
	}

	// 初始化天气
	weatherManager.setWeather('clear', true);
	updateComposer();

	// GUI控制
	const pane = new Pane({ container: container.querySelector(".tp") });
	const fpsMeter = new FPSMeter();
	const clock = new Clock();

	const folder = pane.addFolder({ title: "天气系统管理器" });
	folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

	// 天气选择
	const weatherFolder = folder.addFolder({ title: "天气控制" });

	const weatherParams = {
		current: "clear",
		autoTransition: false
	};

	weatherFolder.addBinding(weatherParams, "current", {
		label: "当前天气",
		options: {
			"晴天": "clear",
			"多云": "cloudy",
			"阴天": "overcast",
			"小雨": "lightRain",
			"中雨": "rain",
			"大雨": "heavyRain",
			"暴风雨": "storm",
			"小雪": "lightSnow",
			"中雪": "snow",
			"大雪": "heavySnow",
			"暴雪": "blizzard",
			"大雾": "fog"
		}
	}).on("change", (e) => {
		weatherManager.setWeather(e.value);
		updateComposer();
	});

	weatherFolder.addBinding(weatherParams, "autoTransition", {
		label: "自动循环天气"
	});

	// 过渡控制
	const transitionFolder = folder.addFolder({ title: "过渡控制" });

	transitionFolder.addBinding(weatherManager, "enableTransitions", {
		label: "启用过渡动画"
	});

	const transitionParams = { speed: 1.0 };
	transitionFolder.addBinding(transitionParams, "speed", {
		label: "过渡速度",
		min: 0.1,
		max: 3.0,
		step: 0.1
	}).on("change", (e) => {
		weatherManager.setTransitionSpeed(e.value);
	});

	// 显示过渡状态
	const statusParams = {
		currentWeather: "晴天",
		isTransitioning: false,
		progress: 1.0
	};

	transitionFolder.addBinding(statusParams, "currentWeather", {
		label: "当前状态",
		readonly: true
	});

	transitionFolder.addBinding(statusParams, "isTransitioning", {
		label: "正在过渡",
		readonly: true
	});

	transitionFolder.addBinding(statusParams, "progress", {
		label: "过渡进度",
		readonly: true,
		format: (v) => (v * 100).toFixed(1) + "%"
	});

	// 快速切换按钮
	const quickAccessFolder = folder.addFolder({ title: "快速切换" });

	const quickButtons = {
		sunny: () => {
			weatherManager.setWeather('clear');
			weatherParams.current = 'clear';
			updateComposer();
		},
		rainy: () => {
			weatherManager.setWeather('rain');
			weatherParams.current = 'rain';
			updateComposer();
		},
		snowy: () => {
			weatherManager.setWeather('snow');
			weatherParams.current = 'snow';
			updateComposer();
		},
		stormy: () => {
			weatherManager.setWeather('storm');
			weatherParams.current = 'storm';
			updateComposer();
		},
		foggy: () => {
			weatherManager.setWeather('fog');
			weatherParams.current = 'fog';
			updateComposer();
		}
	};

	Object.entries({
		sunny: "☀️ 晴天",
		rainy: "🌧️ 雨天",
		snowy: "🌨️ 雪天",
		stormy: "⛈️ 暴风雨",
		foggy: "🌫️ 大雾"
	}).forEach(([key, label]) => {
		quickAccessFolder.addButton({
			title: label
		}).on("click", () => {
			quickButtons[key]();
		});
	});

	// 场景环境控制
	const sceneFolder = folder.addFolder({ title: "场景设置" });

	const sceneParams = {
		lightIntensity: 1.0,
		ambientIntensity: 0.3,
		autoAdjustLighting: true
	};

	sceneFolder.addBinding(sceneParams, "lightIntensity", {
		label: "主光源强度",
		min: 0.1,
		max: 2.0,
		step: 0.1
	}).on("change", (e) => {
		if (!sceneParams.autoAdjustLighting) {
			directionalLight.intensity = e.value;
		}
	});

	sceneFolder.addBinding(sceneParams, "ambientIntensity", {
		label: "环境光强度",
		min: 0.0,
		max: 1.0,
		step: 0.1
	}).on("change", (e) => {
		ambientLight.intensity = e.value;
	});

	sceneFolder.addBinding(sceneParams, "autoAdjustLighting", {
		label: "自动调整光照"
	});

	// 混合模式控制
	const blendModeOptions = {
		"SCREEN": BlendFunction.SCREEN,
		"ADD": BlendFunction.ADD,
		"NORMAL": BlendFunction.NORMAL,
		"ALPHA": BlendFunction.ALPHA,
		"OVERLAY": BlendFunction.OVERLAY
	};

	folder.addBinding({ blendMode: BlendFunction.SCREEN }, "blendMode", {
		label: "混合模式",
		options: blendModeOptions
	}).on("change", (e) => {
		const effects = weatherManager.getEffects();
		effects.forEach(effect => {
			if (effect.blendMode && effect.blendMode.setBlendFunction) {
				effect.blendMode.setBlendFunction(e.value);
			}
		});
	});

	// 效果开关
	const enableParams = { enableWeatherSystem: true };
	folder.addBinding(enableParams, "enableWeatherSystem", {
		label: "启用天气系统"
	}).on("change", (e) => {
		const effects = weatherManager.getEffects();
		effects.forEach(effect => {
			if (effect.blendMode && effect.blendMode.opacity) {
				effect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
			}
		});
	});

	// 自动天气循环
	let autoWeatherTimer = 0;
	const autoWeatherInterval = 15; // 15秒切换一次
	let currentWeatherIndex = 0;
	const weatherTypes = weatherManager.getAvailableWeatherTypes();

	// 窗口大小调整
	function onResize() {
		const width = container.clientWidth;
		const height = container.clientHeight;
		const aspect = width / height;

		camera.fov = calculateVerticalFoV(90, aspect);
		camera.aspect = aspect;
		camera.updateProjectionMatrix();

		renderer.setSize(width, height);
		renderer.setPixelRatio(window.devicePixelRatio.toFixed(1));
		composer.setSize(width, height);

		// 更新天气效果尺寸
		const effects = weatherManager.getEffects();
		effects.forEach(effect => {
			if (effect.setSize) {
				effect.setSize(width, height);
			}
		});
	}

	window.addEventListener("resize", onResize);
	onResize();

	// 渲染循环
	requestAnimationFrame(function render(timestamp) {
		fpsMeter.update(timestamp);
		const delta = clock.getDelta();

		// 更新控制器
		controls.update(timestamp, delta);

		// 更新天气系统
		weatherManager.update(delta);

		// 自动天气循环
		if (weatherParams.autoTransition) {
			autoWeatherTimer += delta;
			if (autoWeatherTimer >= autoWeatherInterval) {
				currentWeatherIndex = (currentWeatherIndex + 1) % weatherTypes.length;
				const newWeather = weatherTypes[currentWeatherIndex];
				weatherManager.setWeather(newWeather);
				updateComposer();
				weatherParams.current = newWeather;
				autoWeatherTimer = 0;
			}
		}

		// 更新状态显示
		const currentWeather = weatherManager.getCurrentWeather();
		const weatherInfo = weatherManager.getWeatherInfo(currentWeather);
		statusParams.currentWeather = weatherInfo ? weatherInfo.name : currentWeather;
		statusParams.isTransitioning = weatherManager.isTransitioning();
		statusParams.progress = weatherManager.getTransitionProgress();

		// 自动调整光照（根据天气）
		if (sceneParams.autoAdjustLighting) {
			const weatherType = currentWeather;
			if (weatherType.includes('storm') || weatherType === 'heavyRain') {
				directionalLight.intensity = 0.4;
				scene.background.setRGB(0.2, 0.2, 0.25);
			} else if (weatherType.includes('rain') || weatherType === 'overcast') {
				directionalLight.intensity = 0.6;
				scene.background.setRGB(0.4, 0.4, 0.45);
			} else if (weatherType.includes('snow') || weatherType === 'fog') {
				directionalLight.intensity = 0.7;
				scene.background.setRGB(0.7, 0.7, 0.8);
			} else if (weatherType === 'clear') {
				directionalLight.intensity = 1.0;
				scene.background.setRGB(0.53, 0.81, 0.92);
			} else {
				directionalLight.intensity = 0.8;
				scene.background.setRGB(0.6, 0.7, 0.8);
			}
		}

		// 渲染场景
		composer.render(delta);
		requestAnimationFrame(render);
	});

}));