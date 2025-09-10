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

import * as THREE from "three";
import {
	MotionBlurEffect,
	EffectComposer,
	EffectPass,
	RenderPass,
	VelocityPass
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

// 创建一组旋转的物体以展示运动模糊效果
function createMovingObjects() {

	const group = new Group();

	// 设置一些不同形状的物体
	const boxGeometry = new BoxGeometry(1, 1, 1);
	const sphereGeometry = new SphereGeometry(0.6, 32, 32);

	// 创建一些不同材质的物体
	for (let i = 0; i < 8; i++) {

		const material = new MeshStandardMaterial({
			color: Math.random() * 0xffffff,
			roughness: Math.random() * 0.7 + 0.3,
			metalness: Math.random() * 0.8
		});

		// 交替使用球体和立方体
		const mesh = new Mesh(
			i % 2 === 0 ? boxGeometry : sphereGeometry,
			material
		);

		// 沿圆形轨道放置物体
		const angle = (i / 8) * Math.PI * 2;
		const radius = 3;
		mesh.position.set(
			Math.cos(angle) * radius,
			0,
			Math.sin(angle) * radius
		);

		// 设置不同的旋转速度，用于动画
		mesh.userData.rotationSpeed = {
			x: Math.random() * 0.02 - 0.01,
			y: Math.random() * 0.02 - 0.01,
			z: Math.random() * 0.02 - 0.01
		};

		// 设置不同的轨道速度
		mesh.userData.orbitSpeed = 0.5 + Math.random() * 0.5;
		mesh.userData.orbitRadius = radius;
		mesh.userData.orbitAngle = angle;

		mesh.castShadow = true;
		mesh.receiveShadow = true;

		group.add(mesh);

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

	// 添加场景对象 - 使用自定义的地板函数而非 Shapes.createFloor()
	const floor = createFloor();
	scene.add(floor);

	// 添加运动物体
	const movingObjects = createMovingObjects();
	scene.add(movingObjects);

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

	// 添加VelocityPass通道 - 这是MotionBlurEffect效果所必需的
	const velocityPass = new VelocityPass(scene, camera);
	composer.addPass(velocityPass);

	// 创建MotionBlurEffect效果
	const motionBlurEffect = new MotionBlurEffect(velocityPass, {
		intensity: 1.0, // 运动模糊强度
		jitter: 1.0, // 抖动程度，用于改善采样质量
		samples: 16 // 采样数，影响质量和性能
	});

	// 添加效果通道
	composer.addPass(new EffectPass(camera, motionBlurEffect));

	// UI控制面板
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 运动模糊设置
	const folder = pane.addFolder({ title: "运动模糊设置" });

	folder.addBinding(motionBlurEffect, "intensity", {
		min: 0,
		max: 3,
		step: 0.1,
		label: "模糊强度"
	});

	folder.addBinding(motionBlurEffect, "jitter", {
		min: 0,
		max: 2,
		step: 0.1,
		label: "抖动程度"
	});

	// 使用自定义对象来控制samples，因为它需要重新创建效果
	const samplesOptions = {
		samples: 16
	};

	folder.addBinding(samplesOptions, "samples", {
		options: {
			"低 (8)": 8,
			"中 (16)": 16,
			"高 (32)": 32
		},
		label: "采样数量"
	}).on("change", (e) => {

		// 记录当前设置
		const intensity = motionBlurEffect.intensity;
		const jitter = motionBlurEffect.jitter;

		// 删除旧的效果通道
		composer.removePass(composer.passes[composer.passes.length - 1]);

		// 创建新的效果
		const newMotionBlurEffect = new MotionBlurEffect(velocityPass, {
			intensity: intensity,
			jitter: jitter,
			samples: e.value
		});

		// 添加新的通道
		composer.addPass(new EffectPass(camera, newMotionBlurEffect));

		// 更新引用 - 使用普通赋值而不是Object.defineProperty
		samplesOptions.effect = newMotionBlurEffect;

	});

	// 动画控制
	const animationSettings = {
		speed: 1.0,
		pause: false
	};

	const animationFolder = pane.addFolder({ title: "动画控制" });

	animationFolder.addBinding(animationSettings, "speed", {
		min: 0.1,
		max: 3.0,
		step: 0.1,
		label: "动画速度"
	});

	animationFolder.addBinding(animationSettings, "pause", {
		label: "暂停动画"
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

	// 动画更新函数
	function updateObjects(deltaTime, timeElapsed) {

		if (animationSettings.pause) { return; }

		const speed = animationSettings.speed;

		// 更新移动物体
		movingObjects.children.forEach((object, index) => {

			// 自转
			object.rotation.x += object.userData.rotationSpeed.x * speed;
			object.rotation.y += object.userData.rotationSpeed.y * speed;
			object.rotation.z += object.userData.rotationSpeed.z * speed;

			// 公转
			object.userData.orbitAngle += 0.005 * object.userData.orbitSpeed * speed;
			object.position.x = Math.cos(object.userData.orbitAngle) * object.userData.orbitRadius;
			object.position.z = Math.sin(object.userData.orbitAngle) * object.userData.orbitRadius;

			// 上下运动
			object.position.y = Math.sin(timeElapsed * 0.5 + index) * 0.5;

		});

		// 相机旋转
		if (cameraSettings.enableRotation) {

			controls.position.x = Math.sin(timeElapsed * 0.2) * 8;
			controls.position.z = Math.cos(timeElapsed * 0.2) * 8;
			controls.update(deltaTime);

		}

	}

	// 渲染循环
	let lastTime = 0;

	requestAnimationFrame(function render(timestamp) {

		const deltaTime = timestamp - lastTime;
		lastTime = timestamp;
		const timeElapsed = clock.getElapsedTime();

		fpsMeter.update(timestamp);

		if (!cameraSettings.enableRotation) {

			controls.update(timestamp);

		}

		animationMixer.update(deltaTime * 0.001 * animationSettings.speed);

		// 更新物体动画
		updateObjects(deltaTime * 0.001, timeElapsed);

		composer.render();
		requestAnimationFrame(render);

	});

}));
