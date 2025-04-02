import {
	CubeTextureLoader,
	FogExp2,
	LoadingManager,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
	Vector3,
	SphereGeometry,
	MeshStandardMaterial,
	Mesh,
	Clock,
	BoxGeometry
} from "three";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
	BlendFunction,
	DepthOfFieldEffect,
	EffectComposer,
	EffectPass,
	KernelSize,
	RenderPass,
	TextureEffect
} from "postprocessing";

import { Pane } from "tweakpane";
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

	const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 10, 30000);
	camera.position.set(0, 0, 1000);

	// 使用OrbitControls替代SpatialControls
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.rotateSpeed = 0.5;
	controls.target.set(0, 0, 0);
	controls.update();

	// Scene, Lights, Objects

	const scene = new Scene();
	scene.fog = new FogExp2(0x373134, 0.0006); // 降低雾效强度适应大场景
	scene.background = assets.get("sky");
	scene.add(Domain.createLights());
	scene.add(Domain.createEnvironment(scene.background));
	scene.add(Domain.createActors(scene.background));

	// 创建一些大尺寸的物体适应新的场景尺度
	const bigCubeGeometry = new BoxGeometry(500, 500, 500);
	const bigCubeMaterial = new MeshStandardMaterial({
		color: 0x5588ff,
		roughness: 0.3,
		metalness: 0.7
	});
	const bigCube = new Mesh(bigCubeGeometry, bigCubeMaterial);
	bigCube.position.set(1500, 0, -3000);
	scene.add(bigCube);

	// 创建一个前后移动的对焦目标物体
	const focusTargetGeometry = new SphereGeometry(200, 32, 32);
	const focusTargetMaterial = new MeshStandardMaterial({
		color: 0xff0000,
		emissive: 0xff0000,
		emissiveIntensity: 0.5
	});
	const focusTarget = new Mesh(focusTargetGeometry, focusTargetMaterial);
	focusTarget.position.set(0, 0, -2000); // 初始位置
	scene.add(focusTarget);

	// 创建动画时钟
	const clock = new Clock();

	// Post Processing

	const composer = new EffectComposer(renderer, {
		multisampling: Math.min(4, renderer.capabilities.maxSamples)
	});

	const effect = new DepthOfFieldEffect(camera, {
		kernelSize: KernelSize.MEDIUM,
		worldFocusDistance: 2000,
		worldFocusRange: 1000,
		bokehScale: 5.0,
		resolutionScale: 0.75,
		useWorldSpaceAutoFocus: true, // 默认使用世界空间自动对焦
		invertFocusDistance: false     // 默认不反转焦点距离
	});

	// 初始不启用自动对焦
	effect.target = null;

	const effectPass = new EffectPass(camera, effect);

	// BEGIN DEBUG
	const cocDebugPass = new EffectPass(camera, new TextureEffect({ texture: effect.cocTexture }));
	effectPass.renderToScreen = true;
	cocDebugPass.renderToScreen = true;
	cocDebugPass.enabled = false;
	cocDebugPass.fullscreenMaterial.encodeOutput = false;
	// END DEBUG

	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(effectPass);
	composer.addPass(cocDebugPass);

	// Settings

	const fpsMeter = new FPSMeter();
	const cocMaterial = effect.cocMaterial;
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	const folder = pane.addFolder({ title: "Settings" });
	folder.addBinding(cocDebugPass, "enabled", { label: "debug" });
	folder.addBinding(effect.resolution, "scale", { label: "resolution", min: 0.5, max: 1, step: 0.05 });
	folder.addBinding(effect.blurPass, "kernelSize", { options: KernelSize });
	folder.addBinding(cocMaterial, "worldFocusDistance", { min: 0, max: 10000, step: 100 });
	folder.addBinding(cocMaterial, "worldFocusRange", { min: 0, max: 5000, step: 100 });
	folder.addBinding(effect, "bokehScale", { min: 0, max: 10, step: 0.1 });
	folder.addBinding(effect.blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 });
	folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction });

	// 添加自动对焦设置
	const autoFocusSettings = {
		enabled: false,
		amplitude: 2000,    // 适应大场景的运动幅度
		speed: 0.5,         // 运动速度
		useWorldSpace: true, // 使用世界空间距离
		invertFocus: false   // 反转焦点距离
	};

	const autoFocusFolder = pane.addFolder({ title: "自动对焦" });
	autoFocusFolder.addBinding(autoFocusSettings, "enabled", { label: "启用" })
		.on("change", (e) => {
			effect.target = e.value ? focusTarget.position : null;
		});
	autoFocusFolder.addBinding(autoFocusSettings, "useWorldSpace", { label: "世界空间模式" })
		.on("change", (e) => {
			effect.useWorldSpaceAutoFocus = e.value;
		});
	autoFocusFolder.addBinding(autoFocusSettings, "invertFocus", { label: "反转焦距" })
		.on("change", (e) => {
			effect.invertFocusDistance = e.value;
		});
	autoFocusFolder.addBinding(autoFocusSettings, "amplitude", { label: "幅度", min: 500, max: 5000, step: 100 });
	autoFocusFolder.addBinding(autoFocusSettings, "speed", { label: "速度", min: 0.1, max: 2, step: 0.1 });

	// 添加相机设置控制
	const cameraSettings = {
		fov: camera.fov,
		near: camera.near,
		far: camera.far,
		farNearRatio: camera.far / camera.near
	};

	const cameraFolder = pane.addFolder({ title: "相机设置" });
	cameraFolder.addBinding(cameraSettings, "fov", { label: "FOV", min: 20, max: 120, step: 1 })
		.on("change", (e) => {
			camera.fov = e.value;
			camera.updateProjectionMatrix();
		});
	cameraFolder.addBinding(cameraSettings, "near", { label: "近平面", min: 1, max: 100, step: 1 })
		.on("change", (e) => {
			camera.near = e.value;
			cameraSettings.farNearRatio = camera.far / camera.near;
			camera.updateProjectionMatrix();
		});
	cameraFolder.addBinding(cameraSettings, "far", { label: "远平面", min: 1000, max: 50000, step: 1000 })
		.on("change", (e) => {
			camera.far = e.value;
			cameraSettings.farNearRatio = camera.far / camera.near;
			camera.updateProjectionMatrix();
		});
	cameraFolder.addBinding(cameraSettings, "farNearRatio", { label: "远近比", readonly: true });

	// 添加焦距信息面板
	const infoSettings = {
		currentDistance: 0,
		focusDistance: 0,
		focusRange: 0
	};

	const infoFolder = pane.addFolder({ title: "焦距信息" });
	infoFolder.addBinding(infoSettings, "currentDistance", { label: "当前距离", readonly: true });
	infoFolder.addBinding(infoSettings, "focusDistance", { label: "焦点距离", readonly: true });
	infoFolder.addBinding(infoSettings, "focusRange", { label: "焦点范围", readonly: true });

	// Resize Handler

	function onResize() {
		const width = container.clientWidth, height = container.clientHeight;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
		composer.setSize(width, height);
	}

	window.addEventListener("resize", onResize);
	onResize();

	// Render Loop

	requestAnimationFrame(function render(timestamp) {
		fpsMeter.update(timestamp);
		controls.update(); // OrbitControls需要在每帧更新

		// 更新移动物体的位置
		const elapsedTime = clock.getElapsedTime();
		const z = -2000 - Math.sin(elapsedTime * autoFocusSettings.speed) * autoFocusSettings.amplitude;
		focusTarget.position.setZ(z);

		// 更新焦距信息
		if (autoFocusSettings.enabled) {
			const worldDistance = camera.position.distanceTo(focusTarget.position);
			infoSettings.currentDistance = parseFloat(worldDistance.toFixed(0));
			infoSettings.focusDistance = parseFloat(effect.cocMaterial.worldFocusDistance.toFixed(0));
			infoSettings.focusRange = parseFloat(effect.cocMaterial.worldFocusRange.toFixed(0));
		}

		composer.render();
		requestAnimationFrame(render);
	});
}));
