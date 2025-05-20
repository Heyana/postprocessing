import {
	CubeTextureLoader,
	FogExp2,
	LoadingManager,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	WebGLRenderer,
	Color,
	DirectionalLight,
	AmbientLight,
	MeshStandardMaterial,
	SphereGeometry,
	BoxGeometry,
	Mesh,
	Vector3,
	MathUtils,
	Group
} from "three";

import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	SandStormEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
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

// 创建简单的场景物体
function createSceneObjects() {

	const group = new Group();

	// 创建地面
	const ground = new Mesh(
		new BoxGeometry(100, 1, 100),
		new MeshStandardMaterial({
			color: 0xaa8866,
			roughness: 0.9,
			metalness: 0.1
		})
	);
	ground.position.y = -0.5;
	group.add(ground);

	// 创建一些随机柱子
	const columnMaterial = new MeshStandardMaterial({
		color: 0xbbaa99,
		roughness: 0.7,
		metalness: 0.2
	});

	for(let i = 0; i < 30; i++) {

		const height = MathUtils.randFloat(1, 6);
		const column = new Mesh(
			new BoxGeometry(0.6, height, 0.6),
			columnMaterial
		);
		column.position.set(
			MathUtils.randFloatSpread(30),
			height * 0.5 - 0.5,
			MathUtils.randFloatSpread(30)
		);
		group.add(column);

	}

	// 创建一些球体
	for(let i = 0; i < 20; i++) {

		const radius = MathUtils.randFloat(0.3, 1.5);
		const sphere = new Mesh(
			new SphereGeometry(radius, 16, 16),
			new MeshStandardMaterial({
				color: new Color().setHSL(MathUtils.randFloat(0, 0.1), 0.5, 0.5),
				roughness: MathUtils.randFloat(0.3, 0.8),
				metalness: MathUtils.randFloat(0.1, 0.5)
			})
		);
		sphere.position.set(
			MathUtils.randFloatSpread(40),
			radius + MathUtils.randFloat(0, 2),
			MathUtils.randFloatSpread(40)
		);
		group.add(sphere);

	}

	return group;

}

window.addEventListener("load", () => load().then((assets) => {

	// 渲染器
	const renderer = new WebGLRenderer({
		powerPreference: "high-performance",
		antialias: true,
		stencil: false,
		depth: true // 启用深度测试
	});

	renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
	renderer.shadowMap.enabled = true;
	const container = document.querySelector(".viewport");
	container.prepend(renderer.domElement);

	// 相机和控制
	const camera = new PerspectiveCamera(60, 1, 0.1, 100);
	const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
	const settings = controls.settings;
	settings.rotation.sensitivity = 2.2;
	settings.rotation.damping = 0.05;
	settings.translation.damping = 0.1;
	settings.translation.enabled = true;
	controls.position.set(0, 3, 15);
	controls.lookAt(0, 1, 0);
	settings.general.mode = ControlMode.THIRD_PERSON;

	// 场景、光照、物体
	const scene = new Scene();
	scene.background = assets.get("sky");

	// 添加光源
	const mainLight = new DirectionalLight(0xffffbb, 1.5);
	mainLight.position.set(5, 10, 7);
	mainLight.castShadow = true;
	mainLight.shadow.mapSize.width = 1024;
	mainLight.shadow.mapSize.height = 1024;
	mainLight.shadow.camera.near = 1;
	mainLight.shadow.camera.far = 30;
	mainLight.shadow.camera.left = -15;
	mainLight.shadow.camera.right = 15;
	mainLight.shadow.camera.top = 15;
	mainLight.shadow.camera.bottom = -15;
	scene.add(mainLight);

	const ambientLight = new AmbientLight(0x887766, 0.5);
	scene.add(ambientLight);

	// 添加场景物体
	scene.add(createSceneObjects());

	// 后处理
	const composer = new EffectComposer(renderer, {
		multisampling: Math.min(4, renderer.capabilities.maxSamples)
	});

	// 创建沙尘暴效果
	const effect = new SandStormEffect({
		volumeDensity: 0.4,
		volumeAbsorbtion: 0.8,
		lightColor: 0xffcc88, // 暖黄色光源
		shadowQuality: 1.5,
		numSteps: 24,
		enableDithering: true,
		enableVolumetricLighting: true,
		fogDensity: 1.0, // 雾气浓度
		fogDecay: 0.75, // 雾气衰减速度 (降低值使衰减更快)
		fogMinDist: 1.0, // 最小雾气距离
		camera: camera // 传入相机，用于视角变换
	});

	const effectPass = new EffectPass(camera, effect);
	effectPass.fullscreenMaterial.dithering = true;
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(effectPass);

	// 设置界面
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 体积参数文件夹
	const volumeFolder = pane.addFolder({ title: "体积参数" });
	volumeFolder.addBinding(effect, "volumeDensity", { min: 0, max: 2, step: 0.01, label: "体积密度" });
	volumeFolder.addBinding(effect, "volumeAbsorbtion", { min: 0, max: 2, step: 0.01, label: "体积吸收" });

	// 雾气参数文件夹
	const fogFolder = pane.addFolder({ title: "雾气参数" });
	fogFolder.addBinding(effect, "fogDensity", { min: 0, max: 3, step: 0.01, label: "雾气浓度" });
	fogFolder.addBinding(effect, "fogDecay", { min: 0.5, max: 0.99, step: 0.01, label: "衰减速度" });
	fogFolder.addBinding(effect, "fogMinDist", { min: 0, max: 10, step: 0.1, label: "最小距离" });

	// 光照参数文件夹
	const lightFolder = pane.addFolder({ title: "光照参数" });
	const lightColorParams = { color: effect.lightColor };
	lightFolder.addBinding(lightColorParams, "color", {
		color: { type: "float" },
		label: "光源颜色"
	}).on("change", (e) => {

		effect.lightColor = e.value;

	});
	lightFolder.addBinding(effect, "shadowQuality", { min: 0.5, max: 5, step: 0.1, label: "阴影质量" });
	lightFolder.addBinding(effect, "enableVolumetricLighting", { label: "启用体积光" });

	// 质量参数文件夹
	const qualityFolder = pane.addFolder({ title: "质量参数" });
	qualityFolder.addBinding(effect, "numSteps", { min: 8, max: 64, step: 1, label: "采样步数" });
	qualityFolder.addBinding(effect, "enableDithering", { label: "启用抖动" });
	qualityFolder.addBinding(effectPass.fullscreenMaterial, "dithering", { label: "后期抖动" });

	// 混合设置文件夹
	const blendFolder = pane.addFolder({ title: "混合设置" });
	blendFolder.addBinding(effect.blendMode.opacity, "value", { label: "不透明度", min: 0, max: 1, step: 0.01 });
	blendFolder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction, label: "混合模式" });

	// 窗口大小变化处理
	function onResize() {

		const width = container.clientWidth, height = container.clientHeight;
		camera.aspect = width / height;
		camera.fov = calculateVerticalFoV(60, Math.max(camera.aspect, 16 / 9));
		camera.updateProjectionMatrix();
		composer.setSize(width, height);

	}

	window.addEventListener("resize", onResize);
	onResize();

	// 渲染循环
	requestAnimationFrame(function render(timestamp) {

		fpsMeter.update(timestamp);
		controls.update(timestamp);
		composer.render();
		requestAnimationFrame(render);

	});

}));
