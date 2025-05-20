import {
	PerspectiveCamera,
	Scene,
	WebGLRenderer,
	DirectionalLight,
	AmbientLight,
	CubeTextureLoader,
	BoxGeometry,
	MeshStandardMaterial,
	LoadingManager,
	Mesh,
	PlaneGeometry,
	SphereGeometry,
	Vector3,
	Color,
	PCFSoftShadowMap,
	DoubleSide,
	Clock
} from "three";

import {
	EffectComposer,
	EffectPass,
	RenderPass,
	VolumetricShadowEffect,
	BlendFunction
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 加载纹理
function loadTextures() {

	return new Promise((resolve) => {

		const loadingManager = new LoadingManager();
		const cubeTextureLoader = new CubeTextureLoader(loadingManager);
		const assets = new Map();

		// 加载天空盒纹理
		const path = document.baseURI + "img/textures/skies/sunset/";
		const format = ".png";
		const urls = [
			path + "px" + format, path + "nx" + format,
			path + "py" + format, path + "ny" + format,
			path + "pz" + format, path + "nz" + format
		];

		// 设置加载完成回调
		loadingManager.onLoad = () => resolve(assets);

		// 加载天空盒
		cubeTextureLoader.load(urls, (t) => {

			assets.set("sky", t);

		});

	});

}

// 创建场景
function createScene() {

	const scene = new Scene();

	// 添加平行光源（主光源，产生阴影）
	const directionalLight = new DirectionalLight(0xffffff, 1.5);
	directionalLight.position.set(5, 10, 5);
	directionalLight.castShadow = true;
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	directionalLight.shadow.camera.near = 0.1;
	directionalLight.shadow.camera.far = 50;
	directionalLight.shadow.camera.left = -15;
	directionalLight.shadow.camera.right = 15;
	directionalLight.shadow.camera.top = 15;
	directionalLight.shadow.camera.bottom = -15;
	scene.add(directionalLight);

	// 添加环境光
	const ambientLight = new AmbientLight(0x404040, 0.5);
	scene.add(ambientLight);

	// 创建地面
	const groundGeometry = new PlaneGeometry(100, 100);
	const groundMaterial = new MeshStandardMaterial({
		color: 0x888888,
		roughness: 0.8,
		metalness: 0.2,
		side: DoubleSide
	});
	const ground = new Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	scene.add(ground);

	// 添加一些物体作为场景元素
	// 创建多个立方体
	const boxGeometry = new BoxGeometry(1, 1, 1);
	const boxMaterial = new MeshStandardMaterial({
		color: 0x4488ff,
		roughness: 0.6,
		metalness: 0.3
	});

	for(let i = 0; i < 5; i++) {

		const box = new Mesh(boxGeometry, boxMaterial.clone());
		box.position.set(-5 + i * 2.5, 0.5, -3);
		box.castShadow = true;
		box.receiveShadow = true;
		scene.add(box);

	}

	// 添加一个球体作为中心物体
	const sphereGeometry = new SphereGeometry(2, 32, 32);
	const sphereMaterial = new MeshStandardMaterial({
		color: 0xff8844,
		roughness: 0.5,
		metalness: 0.4
	});
	const sphere = new Mesh(sphereGeometry, sphereMaterial);
	sphere.position.set(0, 2.5, 3);
	sphere.castShadow = true;
	sphere.receiveShadow = true;
	scene.add(sphere);

	// 添加柱子
	const pillarGeometry = new BoxGeometry(1, 8, 1);
	const pillarMaterial = new MeshStandardMaterial({
		color: 0xaaaaaa,
		roughness: 0.7,
		metalness: 0.1
	});

	for(let i = -2; i <= 2; i++) {

		const pillar = new Mesh(pillarGeometry, pillarMaterial.clone());
		pillar.position.set(i * 4, 4, 8);
		pillar.castShadow = true;
		pillar.receiveShadow = true;
		scene.add(pillar);

	}

	return {
		scene,
		directionalLight
	};

}

// 主函数
window.addEventListener("load", () => {

	// 加载纹理
	loadTextures().then((assets) => {

		// 基础设置
		const renderer = new WebGLRenderer({
			powerPreference: "high-performance",
			antialias: true
		});
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = PCFSoftShadowMap;
		renderer.setPixelRatio(window.devicePixelRatio);

		const container = document.querySelector(".viewport");
		container.prepend(renderer.domElement);

		// 相机和控制器
		const camera = new PerspectiveCamera();
		const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
		const settings = controls.settings;
		settings.general.mode = ControlMode.THIRD_PERSON;
		settings.translation.enabled = true;
		controls.position.set(10, 8, 12); // 设置相机初始位置
		controls.lookAt(0, 2, 0);

		// 创建场景
		const { scene, directionalLight } = createScene();
		scene.background = assets.get("sky");

		// 创建时钟用于动画
		const clock = new Clock();

		// 配置后处理
		const composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));

		// 创建体积阴影效果
		const volumetricShadowEffect = new VolumetricShadowEffect({
			blendFunction: BlendFunction.NORMAL,
			rayMarchingStep: 64,
			maxRayLength: 50.0,
			volumetricLightIntensity: 0.05,
			lightScatteringFactor: 0.5,
			volumetricShadowIntensity: 0.05,
			shadowAttenuation: 0.08,
			downSample: 1 // 初始设置为低一些，以获得更好的性能
		});

		// 设置体积阴影效果所需的相机和场景引用
		volumetricShadowEffect.setCamera(camera);
		volumetricShadowEffect.setScene(scene);

		// 添加效果通道
		const effectPass = new EffectPass(camera, volumetricShadowEffect);
		composer.addPass(effectPass);

		// 设置FPS计量器和GUI控制面板
		const fpsMeter = new FPSMeter();
		const pane = new Pane({ container: container.querySelector(".tp") });
		pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

		const folder = pane.addFolder({ title: "体积阴影参数" });

		// 添加效果参数控制
		folder.addBinding(volumetricShadowEffect, "rayMarchingStep", {
			label: "射线采样步数",
			min: 16,
			max: 128,
			step: 8
		});

		folder.addBinding(volumetricShadowEffect, "maxRayLength", {
			label: "最大光线长度",
			min: 5,
			max: 100,
			step: 5
		});

		folder.addBinding(volumetricShadowEffect, "volumetricLightIntensity", {
			label: "体积光强度",
			min: 0,
			max: 0.2,
			step: 0.01
		});

		folder.addBinding(volumetricShadowEffect, "volumetricShadowIntensity", {
			label: "体积阴影强度",
			min: 0,
			max: 0.2,
			step: 0.01
		});

		folder.addBinding(volumetricShadowEffect, "lightScatteringFactor", {
			label: "光散射因子",
			min: 0,
			max: 2,
			step: 0.05
		});

		folder.addBinding(volumetricShadowEffect, "shadowAttenuation", {
			label: "阴影衰减",
			min: 0.01,
			max: 0.5,
			step: 0.01
		});

		folder.addBinding(volumetricShadowEffect, "minShadow", {
			label: "最小阴影值",
			min: 0.1,
			max: 1.0,
			step: 0.05
		});

		// 光源控制
		const lightFolder = pane.addFolder({ title: "光源设置" });
		const lightParams = {
			intensity: directionalLight.intensity,
			color: { r: 1, g: 1, b: 1 }
		};

		lightFolder.addBinding(lightParams, "intensity", {
			label: "光源强度",
			min: 0,
			max: 5,
			step: 0.1
		}).on("change", (event) => {

			directionalLight.intensity = event.value;

		});

		lightFolder.addBinding(lightParams, "color", {
			label: "光源颜色",
			color: { type: "float" }
		}).on("change", (event) => {

			directionalLight.color.setRGB(event.value.r, event.value.g, event.value.b);

		});

		// 性能控制
		const performanceFolder = pane.addFolder({ title: "性能设置" });
		const performanceParams = {
			downSample: volumetricShadowEffect.downSample
		};

		performanceFolder.addBinding(performanceParams, "downSample", {
			label: "降采样级别",
			options: {
				"0 (最高质量)": 0,
				"1 (高质量)": 1,
				"2 (平衡)": 2,
				"3 (高性能)": 3
			}
		}).on("change", (event) => {

			volumetricShadowEffect.downSample = event.value;
			// 重新初始化渲染目标
			volumetricShadowEffect.initialize(renderer, composer.inputBuffer.width, composer.inputBuffer.height);

		});

		// 窗口大小调整处理
		function onResize() {

			const width = container.clientWidth, height = container.clientHeight;
			camera.aspect = width / height;
			camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
			camera.updateProjectionMatrix();
			renderer.setSize(width, height);
			composer.setSize(width, height);

			// 重新初始化体积阴影效果的渲染目标
			if(volumetricShadowEffect) {

				volumetricShadowEffect.initialize(renderer, width, height);

			}

		}

		// 渲染循环
		function render() {

			const deltaTime = clock.getDelta();
			fpsMeter.update();
			controls.update(deltaTime);

			// 简单动画：移动光源
			const time = clock.getElapsedTime();
			directionalLight.position.x = Math.sin(time * 0.1) * 10;
			directionalLight.position.z = Math.cos(time * 0.1) * 10 + 5;

			// 更新阴影相机的目标
			directionalLight.target.position.set(0, 0, 0);
			directionalLight.target.updateMatrixWorld();

			// 渲染
			composer.render(deltaTime);
			requestAnimationFrame(render);

		}

		window.addEventListener("resize", onResize);
		onResize();
		requestAnimationFrame(render);

	});

});
