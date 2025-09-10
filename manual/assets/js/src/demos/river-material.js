import {
	PerspectiveCamera,
	Scene,
	WebGLRenderer,
	Mesh,
	PlaneGeometry,
	DirectionalLight,
	AmbientLight,
	TextureLoader,
	RepeatWrapping,
	Vector3,
	Clock,
	MeshStandardMaterial,
	DoubleSide
} from "three";

import {
	RiverMaterial
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 加载所需纹理
function loadTextures() {

	return new Promise((resolve) => {

		const textureLoader = new TextureLoader();
		const textures = {};

		// 尝试加载法线图
		textureLoader.load(
			"textures/water-normal.jpg",
			(normalMap) => {

				normalMap.wrapS = RepeatWrapping;
				normalMap.wrapT = RepeatWrapping;
				textures.normalMap = normalMap;
				resolve(textures);

			},
			undefined, // 进度回调
			() => {

				console.log("无法加载水面法线贴图，使用程序化法线");
				resolve(textures); // 即使加载失败也继续

			}
		);

	});

}

// 演示状态
const demoState = {
	movingRiver: false
};

// 创建河流演示场景
function createScene(textures) {

	const scene = new Scene();

	// 添加灯光
	const directionalLight = new DirectionalLight(0xffffff, 1.5);
	directionalLight.position.set(-1.0, 0.7, 0.25).normalize();
	scene.add(directionalLight);

	const ambientLight = new AmbientLight(0x404040, 0.5);
	scene.add(ambientLight);

	// 创建河流平面 - 使用更多细分以获得更好的效果
	const geometry = new PlaneGeometry(15, 8, 100, 50);
	const material = new RiverMaterial({
		flowSpeed: 0.3,
		waterColor: 0x0066aa,
		transparency: 0.85,
		foamIntensity: 0.8,
		waterDepth: 0.6,
		wavesHeight: 0.15
	});

	// 设置纹理
	if(textures.normalMap) {

		material.normalMap = textures.normalMap;

	}

	const river = new Mesh(geometry, material);
	river.rotation.x = -Math.PI / 2; // 水平放置
	scene.add(river);

	// 添加简单的河岸
	const groundGeometry = new PlaneGeometry(30, 20);
	const groundMaterial = new MeshStandardMaterial({
		color: 0x553311,
		roughness: 0.9,
		metalness: 0.1,
		side: DoubleSide
	});
	const ground = new Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -0.05;
	scene.add(ground);

	return { scene, river };

}

window.addEventListener("load", () => {

	// 加载纹理
	loadTextures().then(textures => {

		// 基本设置
		const renderer = new WebGLRenderer({
			powerPreference: "high-performance",
			antialias: true
		});
		renderer.setPixelRatio(window.devicePixelRatio);

		const container = document.querySelector(".viewport");
		console.log("Log-- ", container, "container");
		container.prepend(renderer.domElement);

		// 相机和控制器
		const camera = new PerspectiveCamera();
		const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
		const settings = controls.settings;
		settings.general.mode = ControlMode.
			THIRD_PERSON;
		settings.translation.enabled = true;
		controls.position.set(-10, 6, 15);
		0; // 最大缩放距离

		// 创建场景
		const { scene, river } = createScene(textures);

		// 设置太阳方向
		const sunDirection = new Vector3(-1.0, 0.7, 0.25).normalize();
		river.material.uniforms.sunDirection.value = sunDirection;

		// 设置时钟
		const clock = new Clock();

		// 配置GUI控制面板
		const fpsMeter = new FPSMeter();
		const pane = new Pane({ container: container.querySelector(".tp") });
		pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

		// 添加移动河流演示选项
		pane.addBinding(demoState, "movingRiver", {
			label: "移动河流展示"
		});

		const folder = pane.addFolder({ title: "河流材质参数" });
		folder.addBinding(river.material.uniforms.flowSpeed, "value", {
			label: "流速",
			min: 0,
			max: 2.0,
			step: 0.01
		});
		folder.addBinding(river.material.uniforms.transparency, "value", {
			label: "透明度",
			min: 0,
			max: 1.0,
			step: 0.01
		});
		folder.addBinding(river.material.uniforms.foamIntensity, "value", {
			label: "泡沫强度",
			min: 0,
			max: 1.0,
			step: 0.01
		});
		folder.addBinding(river.material.uniforms.waterDepth, "value", {
			label: "水深",
			min: 0,
			max: 1.0,
			step: 0.01
		});
		folder.addBinding(river.material.uniforms.wavesHeight, "value", {
			label: "波浪高度",
			min: 0,
			max: 0.5,
			step: 0.01
		});

		// 添加水颜色控制
		folder.addBinding(river.material.uniforms.waterColor, "value", {
			label: "水颜色",
			color: { type: "float" }
		});

		// 窗口大小调整处理
		function onResize() {

			const width = container.clientWidth, height = container.clientHeight;
			camera.aspect = width / height;
			camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
			camera.updateProjectionMatrix();
			renderer.setSize(width, height);

		}

		// 渲染循环
		function render() {

			const deltaTime = clock.getDelta();
			fpsMeter.update();
			controls.update(deltaTime);

			// 如果需要演示移动的河流，可以添加动态位置变化
			if(demoState.movingRiver) {

				// 河流沿着一个圆形路径移动
				const time = clock.getElapsedTime() * 0.5;
				river.position.x = Math.sin(time) * 2.0;
				river.position.z = Math.cos(time) * 2.0;

				// 可选：让河流随时间旋转
				river.rotation.y = time * 0.2;

				// 让地面固定不动
				ground.position.set(0, -0.05, 0);

			}

			// 更新河流模型的矩阵
			river.updateMatrixWorld();

			// 更新河流材质，传递当前的模型矩阵
			river.material.update(deltaTime, river.matrixWorld);

			renderer.render(scene, camera);
			requestAnimationFrame(render);

		}

		window.addEventListener("resize", onResize);
		onResize();
		requestAnimationFrame(render);

	});

});
