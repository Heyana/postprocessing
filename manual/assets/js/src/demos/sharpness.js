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
	PlaneGeometry,
	Color
} from "three";

import {
	EffectComposer,
	EffectPass,
	RenderPass
} from "postprocessing";

import { SharpnessEffect } from "postprocessing";

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

// 创建包含高细节纹理的场景，以便更好地展示锐度效果
function createDetailedScene() {

	const group = new Group();

	// 创建一系列具有纹理细节的几何体
	const boxGeometry = new BoxGeometry(0.9, 0.9, 0.9);
	const sphereGeometry = new SphereGeometry(0.5, 32, 32);

	// 创建网格布局
	const gridSize = 5;
	const spacing = 1.5;
	const offset = (gridSize - 1) * spacing / 2;

	// 创建颜色调色板
	const colors = [
		0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6,
		0x1abc9c, 0xd35400, 0x34495e, 0x7f8c8d, 0xe67e22
	];

	for(let x = 0; x < gridSize; x++) {

		for(let z = 0; z < gridSize; z++) {

			// 选择一个随机颜色
			const colorIndex = Math.floor(Math.random() * colors.length);

			const material = new MeshStandardMaterial({
				color: colors[colorIndex],
				roughness: 0.6 + Math.random() * 0.3,
				metalness: Math.random() * 0.5
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
				Math.random() * 0.3,
				z * spacing - offset
			);

			// 添加随机旋转
			mesh.rotation.set(
				Math.random() * Math.PI,
				Math.random() * Math.PI,
				Math.random() * Math.PI
			);

			mesh.castShadow = true;
			mesh.receiveShadow = true;

			// 存储用于动画的属性
			mesh.userData.originalY = mesh.position.y;
			mesh.userData.rotationSpeed = 0.2 + Math.random() * 0.3;
			mesh.userData.bobSpeed = 0.5 + Math.random() * 0.5;
			mesh.userData.bobHeight = 0.1 + Math.random() * 0.15;

			group.add(mesh);

		}

	}

	return group;

}

// 创建细节丰富的地板
function createDetailedFloor() {

	const geometry = new PlaneGeometry(20, 20, 64, 64); // 高分辨率网格，以显示更多细节
	const material = new MeshStandardMaterial({
		color: 0x555555,
		roughness: 0.8,
		metalness: 0.2
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
		antialias: true,
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

	// 添加更强的定向光源，以增强阴影和细节
	const lights = Shapes.createLights();
	// 增强主光源
	lights.children[0].intensity = 5;
	scene.add(lights);

	// 添加场景对象
	const floor = createDetailedFloor();
	scene.add(floor);

	// 添加网格对象
	const sceneObjects = createDetailedScene();
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

	// 创建SharpnessEffect锐度效果
	const sharpnessEffect = new SharpnessEffect({
		sharpness: 1.0 // 默认锐度值
	});

	// 添加锐度效果通道
	composer.addPass(new EffectPass(camera, sharpnessEffect));

	// UI控制面板
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 创建演示控制设置
	const demoSettings = {
		enableSharpness: true,
		sharpness: 1.0,
		animationSpeed: 1.0,
		enableSplitScreen: false
	};

	// 锐度效果设置
	const folder = pane.addFolder({ title: "锐度效果设置" });

	folder.addBinding(demoSettings, "enableSharpness", {
		label: "启用锐度效果"
	}).on("change", (e) => {

		sharpnessEffect.enabled = e.value;

	});

	folder.addBinding(demoSettings, "sharpness", {
		min: 0,
		max: 2.0,
		step: 0.05,
		label: "锐度强度"
	}).on("change", (e) => {

		sharpnessEffect.setSharpness(e.value);

	});

	folder.addBinding(demoSettings, "enableSplitScreen", {
		label: "启用对比视图"
	}).on("change", (e) => {

		// 简单实现对比视图 - 一半有效果，一半无效果
		if(e.value) {

			// 创建分屏效果 - 此处简化处理，实际项目可能需要更复杂的实现
			try {

				// 可以试图在这里添加一个分屏效果
				// 这是一个简化的方法，实际上可能需要通过自定义shader来实现
				renderPass.fullscreenMaterial.uniforms.opacity.value = 0.5;

			} catch(error) {

				console.log("无法设置分屏效果", error);

			}

		} else {

			try {

				renderPass.fullscreenMaterial.uniforms.opacity.value = 1.0;

			} catch(error) {

				console.log("无法重置分屏效果", error);

			}

		}

	});

	// 场景与相机控制
	const controlFolder = pane.addFolder({ title: "场景控制" });

	const sceneControl = {
		cameraRotation: true,
		rotationSpeed: 0.15,
		objectAnimation: true
	};

	controlFolder.addBinding(sceneControl, "cameraRotation", {
		label: "相机旋转"
	});

	controlFolder.addBinding(sceneControl, "rotationSpeed", {
		min: 0.05,
		max: 0.5,
		step: 0.01,
		label: "旋转速度"
	});

	controlFolder.addBinding(sceneControl, "objectAnimation", {
		label: "对象动画"
	});

	controlFolder.addBinding(demoSettings, "animationSpeed", {
		min: 0.1,
		max: 2.0,
		step: 0.1,
		label: "动画速度"
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

		if(!sceneControl.cameraRotation) {

			controls.update(timestamp);

		} else {

			// 相机旋转
			controls.position.x = Math.sin(timeElapsed * sceneControl.rotationSpeed) * 8;
			controls.position.z = Math.cos(timeElapsed * sceneControl.rotationSpeed) * 8;
			controls.update(deltaTime);

		}

		animationMixer.update(deltaTime * 0.001 * demoSettings.animationSpeed);

		// 让物体运动，使锐度效果更明显
		if(sceneControl.objectAnimation) {

			sceneObjects.children.forEach((object, index) => {

				// 旋转
				object.rotation.y += object.userData.rotationSpeed * 0.01 * demoSettings.animationSpeed;

				// 上下运动
				const bobHeight = object.userData.bobHeight;
				const bobSpeed = object.userData.bobSpeed;
				object.position.y = object.userData.originalY +
                    Math.sin(timeElapsed * bobSpeed) * bobHeight * demoSettings.animationSpeed;

			});

		}

		composer.render();
		requestAnimationFrame(render);

	});

}));
