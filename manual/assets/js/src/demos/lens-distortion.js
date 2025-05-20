import {
	AnimationMixer,
	CubeTextureLoader,
	GLTFLoader,
	Group,
	LoadingManager,
	Mesh,
	PerspectiveCamera,
	Scene,
	SphereGeometry,
	MeshStandardMaterial,
	SRGBColorSpace,
	TextureLoader,
	Vector2,
	Vector3,
	VSMShadowMap,
	WebGLRenderer,
	BoxGeometry,
	Clock,
	PlaneGeometry
} from "three";

import {
	EffectComposer,
	EffectPass,
	RenderPass,
	LensDistortionEffect
} from "postprocessing";


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

// 创建一组物体以展示镜头畸变效果
function createSceneObjects() {

	const group = new Group();

	// 设置一些不同形状的物体
	const boxGeometry = new BoxGeometry(1, 1, 1);
	const sphereGeometry = new SphereGeometry(0.6, 32, 32);

	// 创建网格布局
	const gridSize = 3;
	const spacing = 2;
	const offset = (gridSize - 1) * spacing / 2;

	for(let x = 0; x < gridSize; x++) {

		for(let z = 0; z < gridSize; z++) {

			const material = new MeshStandardMaterial({
				color: Math.random() * 0xffffff,
				roughness: Math.random() * 0.7 + 0.3,
				metalness: Math.random() * 0.8
			});

			// 交替使用球体和立方体
			const isEven = (x + z) % 2 === 0;
			const mesh = new Mesh(
				isEven ? boxGeometry : sphereGeometry,
				material
			);

			// 放置在网格中
			mesh.position.set(
				x * spacing - offset,
				0,
				z * spacing - offset
			);

			mesh.castShadow = true;
			mesh.receiveShadow = true;

			group.add(mesh);

		}

	}

	return group;

}

// 创建地板函数
function createFloor() {

	const geometry = new PlaneGeometry(20, 20);
	const material = new MeshStandardMaterial({
		color: 0x888888,
		roughness: 0.7,
		metalness: 0.1
	});
	const floor = new Mesh(geometry, material);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = -0.5;
	floor.receiveShadow = true;
	return floor;

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
	renderer.shadowMap.autoUpdate = true;
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
	controls.position.set(0, 2, 8);

	// 场景、灯光和对象
	const scene = new Scene();
	scene.background = assets.get("sky");

	// 添加灯光
	const lights = Shapes.createLights();
	scene.add(lights);

	// 添加场景对象
	const floor = createFloor();
	scene.add(floor);

	// 添加网格对象
	const sceneObjects = createSceneObjects();
	scene.add(sceneObjects);

	// 添加角色模型
	const riggedSimple = assets.get("rigged-simple");
	riggedSimple.scene.scale.multiplyScalar(0.2);
	riggedSimple.scene.position.set(0, 0, 0);
	scene.add(riggedSimple.scene);

	// 设置动画
	const animationMixer = new AnimationMixer(riggedSimple.scene);
	const action = animationMixer.clipAction(riggedSimple.animations[0]);
	action.play();

	// 创建时钟用于动画
	const clock = new Clock();

	// 后处理
	const multisampling = Math.min(4, renderer.capabilities.maxSamples);
	const composer = new EffectComposer(renderer, { multisampling });

	// 添加基本渲染通道
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 创建LensDistortionEffect效果
	const lensDistortionEffect = new LensDistortionEffect({
		alphax: -0.05, // 水平畸变
		alphay: -0.05, // 垂直畸变
		aberration: 0.01 // 色差
	});

	// 添加效果通道
	composer.addPass(new EffectPass(camera, lensDistortionEffect));

	// UI控制面板
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 镜头畸变设置
	const folder = pane.addFolder({ title: "镜头畸变设置" });

	// 创建代理对象用于UI控制
	const distortionSettings = {
		alphax: -0.05,
		alphay: -0.05,
		aberration: 0.01
	};

	folder.addBinding(distortionSettings, "alphax", {
		min: -0.2,
		max: 0.2,
		step: 0.01,
		label: "水平畸变"
	}).on("change", (e) => {

		lensDistortionEffect.uniforms.get("alphax").value = e.value;

	});

	folder.addBinding(distortionSettings, "alphay", {
		min: -0.2,
		max: 0.2,
		step: 0.01,
		label: "垂直畸变"
	}).on("change", (e) => {

		lensDistortionEffect.uniforms.get("alphay").value = e.value;

	});

	folder.addBinding(distortionSettings, "aberration", {
		min: 0,
		max: 0.05,
		step: 0.001,
		label: "色差"
	}).on("change", (e) => {

		lensDistortionEffect.uniforms.get("aberration").value = e.value;

	});

	// 相机控制
	const cameraSettings = {
		enableRotation: true
	};

	const cameraFolder = pane.addFolder({ title: "相机控制" });

	cameraFolder.addBinding(cameraSettings, "enableRotation", {
		label: "自动旋转相机"
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
	let lastTime = 0;

	requestAnimationFrame(function render(timestamp) {

		const deltaTime = timestamp - lastTime;
		lastTime = timestamp;
		const timeElapsed = clock.getElapsedTime();

		fpsMeter.update(timestamp);

		if(!cameraSettings.enableRotation) {

			controls.update(timestamp);

		} else {

			// 相机旋转
			controls.position.x = Math.sin(timeElapsed * 0.2) * 8;
			controls.position.z = Math.cos(timeElapsed * 0.2) * 8;
			controls.update(deltaTime);

		}

		animationMixer.update(deltaTime * 0.001);

		// 让物体旋转
		sceneObjects.children.forEach((object, index) => {

			object.rotation.y = timeElapsed * 0.2 + index * 0.1;

		});

		composer.render();
		requestAnimationFrame(render);

	});

}));
