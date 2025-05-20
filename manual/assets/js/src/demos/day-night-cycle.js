import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
	SRGBColorSpace,
	TextureLoader,
	Vector2,
	Vector3,
	WebGLRenderer,
	BoxGeometry,
	CubeTextureLoader,
	MathUtils
} from "three";

import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	DayNightCycleEffect
} from "postprocessing";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

function load() {

	const assets = new Map();
	const loadingManager = new LoadingManager();
	const textureLoader = new TextureLoader(loadingManager);

	return new Promise((resolve, reject) => {

		loadingManager.onLoad = () => resolve(assets);
		loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

		// 加载噪声纹理
		textureLoader.load(`${document.baseURI}img/textures/noise/DayAndNightSkyCycle.png`, (t) => {

			assets.set("noiseTexture", t);

		});

	});

}

// 创建场景物体
function createScene() {

	const group = new Group();

	// 添加地面
	const ground = new Mesh(
		new PlaneGeometry(50, 50, 1, 1),
		new MeshStandardMaterial({
			color: 0x333333,
			roughness: 0.8,
			metalness: 0.1
		})
	);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -2;
	ground.receiveShadow = true;
	group.add(ground);

	// 添加一些立方体建筑
	const buildings = new Group();

	// 大楼1
	const building1 = new Mesh(
		new BoxGeometry(2, 6, 2),
		new MeshStandardMaterial({
			color: 0x8899aa,
			roughness: 0.7,
			metalness: 0.2
		})
	);
	building1.position.set(-5, 1, -5);
	building1.castShadow = building1.receiveShadow = true;
	buildings.add(building1);

	// 大楼2
	const building2 = new Mesh(
		new BoxGeometry(3, 4, 3),
		new MeshStandardMaterial({
			color: 0xaa9988,
			roughness: 0.8,
			metalness: 0.1
		})
	);
	building2.position.set(5, 0, -3);
	building2.castShadow = building2.receiveShadow = true;
	buildings.add(building2);

	// 大楼3
	const building3 = new Mesh(
		new BoxGeometry(2, 8, 2),
		new MeshStandardMaterial({
			color: 0x99aacc,
			roughness: 0.6,
			metalness: 0.3
		})
	);
	building3.position.set(0, 2, -7);
	building3.castShadow = building3.receiveShadow = true;
	buildings.add(building3);

	group.add(buildings);

	return group;

}

window.addEventListener("load", () => load().then((assets) => {

	// 渲染器
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
	controls.position.set(0, 3, 10);

	// 场景、灯光和物体
	const scene = new Scene();
	scene.background = new THREE.Color(0x000000); // 黑色背景，让大气散射效果更明显

	// 添加定向光源 - 模拟太阳光
	const sunPosition = new Vector3(5, 10, 5).normalize().multiplyScalar(10);
	const directionalLight = new DirectionalLight(0xffffff, 1.0);
	directionalLight.position.copy(sunPosition);
	directionalLight.castShadow = true;
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	directionalLight.shadow.camera.near = 0.1;
	directionalLight.shadow.camera.far = 50;
	scene.add(directionalLight);

	// 添加环境光
	const ambientLight = new AmbientLight(0x404040, 0.2);
	scene.add(ambientLight);

	// 添加场景物体
	const sceneObjects = createScene();
	scene.add(sceneObjects);

	// 后期处理
	const composer = new EffectComposer(renderer, {
		frameBufferType: HalfFloatType
	});
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 创建日夜循环天空效果
	const dayNightCycleEffect = new DayNightCycleEffect({
		blendFunction: BlendFunction.NORMAL,
		sunPosition: sunPosition.clone().normalize(),
		moonPosition: new Vector3(-0.5, 0.2, -1).normalize(),
		animateClouds: true,
		cloudy: 0.6,
		height: 500.0,
		haze: 0.1,
		cloudyhigh: 0.05,
		enableStars: true,
		starThreshold: 0.99
	});

	// 设置噪声纹理
	dayNightCycleEffect.setNoiseTexture(assets.get("noiseTexture"));

	// 添加相机设置
	dayNightCycleEffect.setCamera(camera);

	// 添加效果通道
	const effectPass = new EffectPass(camera, dayNightCycleEffect);
	composer.addPass(effectPass);

	// GUI
	const pane = new Pane({ container: container.querySelector(".tp") });
	const fpsMeter = new FPSMeter();
	const clock = new Clock();

	const folder = pane.addFolder({ title: "设置" });
	folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

	// 天空和云层控制
	const skyFolder = folder.addFolder({ title: "天空和云层" });

	// 添加效果启用控制
	const params = {
		enableEffect: true
	};

	folder.addBinding(params, "enableEffect", {
		label: "启用天空效果"
	}).on("change", (e) => {

		dayNightCycleEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;

	});

	// 混合模式控制
	const blendModeOptions = {
		"NORMAL": BlendFunction.NORMAL,
		"SCREEN": BlendFunction.SCREEN,
		"ADD": BlendFunction.ADD,
		"ALPHA": BlendFunction.ALPHA
	};

	skyFolder.addBinding({ blendMode: BlendFunction.NORMAL }, "blendMode", {
		label: "混合模式",
		options: blendModeOptions
	}).on("change", (e) => {

		dayNightCycleEffect.blendMode.setBlendFunction(e.value);

	});

	skyFolder.addBinding(dayNightCycleEffect, "cloudy", {
		label: "云层密度",
		min: 0.0,
		max: 1.0,
		step: 0.05
	});

	skyFolder.addBinding(dayNightCycleEffect, "haze", {
		label: "雾霾程度",
		min: 0.0,
		max: 0.5,
		step: 0.01
	});

	skyFolder.addBinding(dayNightCycleEffect, "cloudyhigh", {
		label: "高层云密度",
		min: 0.0,
		max: 0.3,
		step: 0.01
	});

	skyFolder.addBinding(dayNightCycleEffect, "animateClouds", {
		label: "云层动画"
	});

	// 星空控制
	const starFolder = folder.addFolder({ title: "星空设置" });

	starFolder.addBinding(dayNightCycleEffect, "enableStars", {
		label: "启用星空"
	});

	starFolder.addBinding(dayNightCycleEffect, "starThreshold", {
		label: "星星密度",
		min: 0.9,
		max: 0.999,
		step: 0.001
	});

	// 太阳和月亮位置控制
	const celestialFolder = folder.addFolder({ title: "天体位置" });

	// 太阳位置参数
	const sunParams = {
		elevation: 45,
		azimuth: 180
	};

	// 月亮位置参数
	const moonParams = {
		elevation: 20,
		azimuth: 35
	};

	// 月亮锁定选项
	const moonLockParams = {
		lockToSun: true // 默认锁定
	};

	// 更新太阳位置的函数
	function updateSunPosition() {

		const phi = MathUtils.degToRad(90 - sunParams.elevation);
		const theta = MathUtils.degToRad(sunParams.azimuth);

		const x = Math.sin(phi) * Math.cos(theta);
		const y = Math.cos(phi);
		const z = Math.sin(phi) * Math.sin(theta);

		const newSunPosition = new Vector3(x, y, z).normalize();

		// 更新效果中的太阳位置
		dayNightCycleEffect.sunPosition.copy(newSunPosition);

		// 更新场景中的光源位置
		directionalLight.position.copy(newSunPosition.clone().multiplyScalar(10));

		// 根据太阳位置调整环境光强度（夜晚减弱，白天增强）
		let ambientIntensity = 0.2;
		if(y < 0) {

			// 夜晚
			ambientIntensity = 0.05;

		} else if(y < 0.3) {

			// 黄昏/黎明
			ambientIntensity = 0.1;

		} else {

			// 白天
			ambientIntensity = 0.2;

		}
		ambientLight.intensity = ambientIntensity;

		// 如果月亮锁定到太阳，则更新月亮位置
		if(moonLockParams.lockToSun) {

			updateMoonPositionOpposite();

		}

	}

	// 计算月亮位置为太阳的反方向
	function updateMoonPositionOpposite() {

		// 计算月亮的高度角和方位角（与太阳相反）
		const moonElevation = sunParams.elevation > 0 ? -sunParams.elevation : Math.abs(sunParams.elevation) + 5;
		const moonAzimuth = (sunParams.azimuth + 180) % 360;

		// 更新UI控件值
		if(moonParams.elevation !== moonElevation) {

			moonParams.elevation = moonElevation;

		}

		if(moonParams.azimuth !== moonAzimuth) {

			moonParams.azimuth = moonAzimuth;

		}

		// 更新月亮位置
		updateMoonPosition();

	}

	// 更新月亮位置
	function updateMoonPosition() {

		const phi = MathUtils.degToRad(90 - moonParams.elevation);
		const theta = MathUtils.degToRad(moonParams.azimuth);

		const x = Math.sin(phi) * Math.cos(theta);
		const y = Math.cos(phi);
		const z = Math.sin(phi) * Math.sin(theta);

		dayNightCycleEffect.moonPosition.set(x, y, z).normalize();

	}

	// 太阳位置控制
	celestialFolder.addBinding(sunParams, "elevation", {
		label: "太阳高度角",
		min: -20,
		max: 90,
		step: 1
	}).on("change", updateSunPosition);

	celestialFolder.addBinding(sunParams, "azimuth", {
		label: "太阳方位角",
		min: 0,
		max: 360,
		step: 1
	}).on("change", updateSunPosition);

	// 月亮锁定控制
	celestialFolder.addBinding(moonLockParams, "lockToSun", {
		label: "月亮锁定与太阳相反"
	}).on("change", (e) => {

		if(e.value) {

			updateMoonPositionOpposite();

		}

	});

	// 月亮位置控制（仅当不锁定时可用）
	const moonPosFolder = celestialFolder.addFolder({
		title: "月亮位置控制",
		expanded: false
	});

	moonPosFolder.addBinding(moonParams, "elevation", {
		label: "月亮高度角",
		min: -20,
		max: 90,
		step: 1
	}).on("change", (e) => {

		if(!moonLockParams.lockToSun) {

			updateMoonPosition();

		}

	});

	moonPosFolder.addBinding(moonParams, "azimuth", {
		label: "月亮方位角",
		min: 0,
		max: 360,
		step: 1
	}).on("change", (e) => {

		if(!moonLockParams.lockToSun) {

			updateMoonPosition();

		}

	});

	// 添加FOV控制
	const viewFolder = folder.addFolder({ title: "视图设置" });

	const viewParams = {
		fov: 60
	};

	viewFolder.addBinding(viewParams, "fov", {
		label: "视场角(FOV)",
		min: 30,
		max: 120,
		step: 1
	}).on("change", (e) => {

		camera.fov = e.value;
		camera.updateProjectionMatrix();
		dayNightCycleEffect.fov = e.value; // 更新效果中的FOV

	});

	// 添加深度阈值控制
	viewFolder.addBinding(dayNightCycleEffect, "skyMaskThreshold", {
		label: "天空深度阈值",
		min: 0.9,
		max: 0.9999,
		step: 0.0001
	}).on("change", (e) => {

		// 实时更新深度阈值
		dayNightCycleEffect.skyMaskThreshold = e.value;

	});

	// 添加快速预设按钮
	const presetFolder = folder.addFolder({ title: "场景预设" });

	const presets = {
		daytime: function() {

			sunParams.elevation = 45;
			sunParams.azimuth = 180;
			updateSunPosition();
			dayNightCycleEffect.cloudy = 0.6;
			dayNightCycleEffect.haze = 0.1;
			dayNightCycleEffect.height = 500.0;

		},
		sunset: function() {

			sunParams.elevation = 5;
			sunParams.azimuth = 260;
			updateSunPosition();
			dayNightCycleEffect.cloudy = 0.7;
			dayNightCycleEffect.haze = 0.15;
			dayNightCycleEffect.height = 500.0;

		},
		night: function() {

			sunParams.elevation = -10;
			sunParams.azimuth = 180;
			updateSunPosition();
			dayNightCycleEffect.cloudy = 0.4;
			dayNightCycleEffect.haze = 0.05;
			dayNightCycleEffect.enableStars = true;
			dayNightCycleEffect.starThreshold = 0.99;
			dayNightCycleEffect.height = 500.0;

		},
		overcast: function() {

			sunParams.elevation = 30;
			sunParams.azimuth = 180;
			updateSunPosition();
			dayNightCycleEffect.cloudy = 1.0;
			dayNightCycleEffect.haze = 0.2;
			dayNightCycleEffect.cloudyhigh = 0.2;
			dayNightCycleEffect.height = 500.0;

		}
	};

	presetFolder.addButton({ title: "白天" }).on("click", presets.daytime);
	presetFolder.addButton({ title: "日落" }).on("click", presets.sunset);
	presetFolder.addButton({ title: "夜晚" }).on("click", presets.night);
	presetFolder.addButton({ title: "阴天" }).on("click", presets.overcast);

	// 初始化太阳和月亮位置
	updateSunPosition();

	// 调整窗口大小
	function onResize() {

		const width = container.clientWidth;
		const height = container.clientHeight;
		const aspect = width / height;

		// 更新相机
		camera.fov = calculateVerticalFoV(90, aspect);
		camera.aspect = aspect;
		camera.updateProjectionMatrix();

		// 更新渲染器和效果合成器
		renderer.setSize(width, height);
		renderer.setPixelRatio(window.devicePixelRatio.toFixed(1));
		composer.setSize(width, height);

	}

	window.addEventListener("resize", onResize);
	onResize();

	// 渲染循环
	requestAnimationFrame(function render(timestamp) {

		fpsMeter.update(timestamp);
		const delta = clock.getDelta();

		// 更新控制器
		controls.update(timestamp, delta);

		// 渲染场景
		composer.render(delta);
		requestAnimationFrame(render);

	});

}));
