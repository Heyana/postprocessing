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
	TextureLoader,
	Vector2,
	Vector3,
	WebGLRenderer,
	BoxGeometry,
	MathUtils,
	FogExp2
} from "three";

import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	VolumetricAtmosphereEffect
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
		new PlaneGeometry(100, 100, 1, 1),
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

	// 生成20个随机建筑
	for(let i = 0; i < 20; i++) {

		const size = Math.random() * 3 + 1;
		const height = Math.random() * 10 + 2;
		const posX = Math.random() * 80 - 40;
		const posZ = Math.random() * 80 - 40;

		const building = new Mesh(
			new BoxGeometry(size, height, size),
			new MeshStandardMaterial({
				color: new THREE.Color(0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5),
				roughness: 0.7,
				metalness: 0.2
			})
		);
		building.position.set(posX, height / 2, posZ);
		building.castShadow = building.receiveShadow = true;
		buildings.add(building);

	}

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
	controls.position.set(0, 10, 20);

	// 场景、灯光和物体
	const scene = new Scene();
	scene.background = new THREE.Color(0x000000); // 黑色背景

	// 添加基本雾效（用于对比体积雾效果）
	scene.fog = new FogExp2(0x666688, 0.005);

	// 添加定向光源
	const lightPosition = new Vector3(5, 10, 5).normalize().multiplyScalar(10);
	const directionalLight = new DirectionalLight(0xffffff, 1.0);
	directionalLight.position.copy(lightPosition);
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

	// 创建体积大气散射效果
	const atmosphereEffect = new VolumetricAtmosphereEffect({
		blendFunction: BlendFunction.NORMAL,
		sunPosition: lightPosition.clone().normalize(),
		animateClouds: true,
		fogDensity: 0.6,
		height: 500.0,
		hazeDensity: 0.1,
		scatteringStrength: 1.0,
		fogColor: 0.3,
		fogDepthMask: 0.99
	});

	// 设置噪声纹理
	atmosphereEffect.setNoiseTexture(assets.get("noiseTexture"));

	// 添加相机设置
	atmosphereEffect.setCamera(camera);

	// 添加效果通道
	const effectPass = new EffectPass(camera, atmosphereEffect);
	composer.addPass(effectPass);

	// GUI
	const pane = new Pane({ container: container.querySelector(".tp") });
	const fpsMeter = new FPSMeter();
	const clock = new Clock();

	const folder = pane.addFolder({ title: "设置" });
	folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

	// 基本场景设置
	const sceneFolder = folder.addFolder({ title: "场景设置" });

	// 场景雾控制
	const fogParams = {
		enableSceneFog: true
	};

	sceneFolder.addBinding(fogParams, "enableSceneFog", {
		label: "启用场景内置雾"
	}).on("change", (e) => {

		if(e.value) {

			scene.fog = new FogExp2(0x666688, 0.005);

		} else {

			scene.fog = null;

		}

	});

	// 体积大气效果控制
	const atmosphereFolder = folder.addFolder({ title: "体积大气效果" });

	// 添加效果启用控制
	const params = {
		enableEffect: true
	};

	folder.addBinding(params, "enableEffect", {
		label: "启用体积大气效果"
	}).on("change", (e) => {

		atmosphereEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;

	});

	// 混合模式控制
	const blendModeOptions = {
		"NORMAL": BlendFunction.NORMAL,
		"SCREEN": BlendFunction.SCREEN,
		"ADD": BlendFunction.ADD,
		"ALPHA": BlendFunction.ALPHA
	};

	atmosphereFolder.addBinding({ blendMode: BlendFunction.NORMAL }, "blendMode", {
		label: "混合模式",
		options: blendModeOptions
	}).on("change", (e) => {

		atmosphereEffect.blendMode.setBlendFunction(e.value);

	});

	// 雾密度控制
	atmosphereFolder.addBinding(atmosphereEffect, "fogDensity", {
		label: "雾密度",
		min: 0.0,
		max: 1.0,
		step: 0.05
	});

	// 雾霾密度控制
	atmosphereFolder.addBinding(atmosphereEffect, "hazeDensity", {
		label: "雾霾密度",
		min: 0.0,
		max: 0.5,
		step: 0.01
	});

	// 散射强度控制
	atmosphereFolder.addBinding(atmosphereEffect, "scatteringStrength", {
		label: "散射强度",
		min: 0.1,
		max: 3.0,
		step: 0.1
	});

	// 雾颜色控制
	atmosphereFolder.addBinding(atmosphereEffect, "fogColor", {
		label: "雾颜色色调",
		min: 0.0,
		max: 1.0,
		step: 0.01
	});

	// 雾动画控制
	atmosphereFolder.addBinding(atmosphereEffect, "animateClouds", {
		label: "雾动画"
	});

	// 深度阈值控制
	atmosphereFolder.addBinding(atmosphereEffect, "fogDepthMask", {
		label: "雾深度阈值",
		min: 0.95,
		max: 0.9999,
		step: 0.001
	}).on("change", (e) => {

		// 实时更新深度阈值
		atmosphereEffect.fogDepthMask = e.value;

	});

	// 光源位置控制
	const lightFolder = folder.addFolder({ title: "光源位置" });

	// 光源位置参数
	const lightParams = {
		elevation: 45,
		azimuth: 180
	};

	// 更新光源位置的函数
	function updateLightPosition() {

		const phi = MathUtils.degToRad(90 - lightParams.elevation);
		const theta = MathUtils.degToRad(lightParams.azimuth);

		const x = Math.sin(phi) * Math.cos(theta);
		const y = Math.cos(phi);
		const z = Math.sin(phi) * Math.sin(theta);

		const newLightPos = new Vector3(x, y, z).normalize().multiplyScalar(10);

		// 更新效果中的光源位置
		atmosphereEffect.sunPosition.set(x, y, z).normalize();

		// 更新场景中的光源位置
		directionalLight.position.copy(newLightPos);

	}

	lightFolder.addBinding(lightParams, "elevation", {
		label: "光源高度角",
		min: -20,
		max: 90,
		step: 1
	}).on("change", updateLightPosition);

	lightFolder.addBinding(lightParams, "azimuth", {
		label: "光源方位角",
		min: 0,
		max: 360,
		step: 1
	}).on("change", updateLightPosition);

	// 视图设置
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
		atmosphereEffect.fov = e.value; // 更新效果中的FOV

	});

	// 添加快速预设按钮
	const presetFolder = folder.addFolder({ title: "效果预设" });

	const presets = {
		light: function() {

			lightParams.elevation = 45;
			lightParams.azimuth = 180;
			updateLightPosition();
			atmosphereEffect.fogDensity = 0.3;
			atmosphereEffect.hazeDensity = 0.05;
			atmosphereEffect.scatteringStrength = 1.0;
			atmosphereEffect.fogColor = 0.3;

		},
		dense: function() {

			lightParams.elevation = 30;
			lightParams.azimuth = 160;
			updateLightPosition();
			atmosphereEffect.fogDensity = 0.8;
			atmosphereEffect.hazeDensity = 0.15;
			atmosphereEffect.scatteringStrength = 1.5;
			atmosphereEffect.fogColor = 0.4;

		},
		sunset: function() {

			lightParams.elevation = 5;
			lightParams.azimuth = 260;
			updateLightPosition();
			atmosphereEffect.fogDensity = 0.6;
			atmosphereEffect.hazeDensity = 0.1;
			atmosphereEffect.scatteringStrength = 2.0;
			atmosphereEffect.fogColor = 0.8;

		},
		blueHaze: function() {

			lightParams.elevation = 40;
			lightParams.azimuth = 180;
			updateLightPosition();
			atmosphereEffect.fogDensity = 0.7;
			atmosphereEffect.hazeDensity = 0.2;
			atmosphereEffect.scatteringStrength = 1.2;
			atmosphereEffect.fogColor = 0.0;

		}
	};

	presetFolder.addButton({ title: "轻薄雾气" }).on("click", presets.light);
	presetFolder.addButton({ title: "浓雾" }).on("click", presets.dense);
	presetFolder.addButton({ title: "日落雾气" }).on("click", presets.sunset);
	presetFolder.addButton({ title: "蓝色雾霾" }).on("click", presets.blueHaze);

	// 初始化光源位置
	updateLightPosition();

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
