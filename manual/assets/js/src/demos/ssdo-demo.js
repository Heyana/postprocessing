/**
 * SSDO Demo
 * 演示屏幕空间方向性遮蔽效果
 */
import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	NormalPass,
	RenderPass, SSDOEffect
} from "postprocessing";
import * as THREE from "three";
import {
	AmbientLight,
	Color,
	DirectionalLight,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	Scene,
	SphereGeometry,
	Vector2,
	WebGLRenderTarget
} from "three";

// 导入工具函数
import { ControlMode, SpatialControls } from "spatial-controls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 全局参数设置
const params = {
	sampleCount: 16,
	rings: 7,
	radius: 0.18,
	intensity: 0.7,
	bias: 0.025,
	fadeDistance: 0.5,
	fadeTransition: 0.1,
	indirectLightIntensity: 2.0,
	indirectLightDistance: 1.5,
	colorBleeding: true,
	useColor: false,
	color: { r: 0, g: 0, b: 0 },
	autoRotate: false,
	showNormals: false,
	blendMode: "NORMAL",
	ambientLightIntensity: 0.8,
	directionalLightIntensity: 1.5,
	effectOpacity: 1.0
};

// 全局变量声明
let composer, renderer, camera, scene, controls;
let spheres = [], activeSphere = null;
let normalPass, ssdoEffect, ssdoPass;
let colorTarget;
let ambientLight, directionalLight;

// 加载资源
async function load() {

	const assets = new Map();
	try {

		// 加载模型
		const gltfLoader = new GLTFLoader();
		const helmet = await new Promise((resolve) => {

			gltfLoader.load(
				"https://threejs.org/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf",
				(gltf) => resolve(gltf)
			);

		});
		assets.set("helmet", helmet);

	} catch(error) {

		console.warn("模型加载失败，将使用基础场景", error);

	}
	return assets;

}

// 点击事件处理
function onMouseClick(event, renderer, camera, testObjects, raycaster, mouse) {

	// 计算鼠标在归一化设备坐标中的位置
	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

	// 设置射线投射器
	raycaster.setFromCamera(mouse, camera);

	// 检测与球体的交点
	const intersects = raycaster.intersectObjects(spheres, false);

	if(intersects.length > 0) {

		const sphere = intersects[0].object;

		if(activeSphere === sphere) {

			// 如果点击已选中的球体，取消选择
			sphere.material.emissive.setHex(0);
			activeSphere = null;

		} else {

			// 重置所有球体
			spheres.forEach(s => s.material.emissive.setHex(0));

			// 高亮选中的球体
			sphere.material.emissive.setHex(0x444444);
			activeSphere = sphere;

		}

	}

}

// 窗口大小调整处理
function onResize(container, camera, composer, renderer) {

	const width = container.clientWidth, height = container.clientHeight;
	camera.aspect = width / height;
	camera.fov = calculateVerticalFoV(35, Math.max(camera.aspect, 16 / 9));
	camera.updateProjectionMatrix();
	composer.setSize(width, height);
	renderer.setSize(width, height);

	// 更新颜色缓冲目标大小
	if(colorTarget) {

		colorTarget.setSize(width, height);

	}

}

// 创建彩色球体示例场景
function createColoredSpheres(scene) {

	const colors = [
		0xff0000, // 红色
		0x00ff00, // 绿色
		0x0000ff, // 蓝色
		0xffff00, // 黄色
		0xff00ff, // 品红
		0x00ffff // 青色
	];

	const geometry = new SphereGeometry(0.3, 32, 32);
	const resultSpheres = [];

	for(let i = 0; i < colors.length; i++) {

		const material = new MeshStandardMaterial({
			color: colors[i],
			roughness: 0.3,
			metalness: 0.8
		});

		const sphere = new Mesh(geometry, material);
		sphere.position.set(
			(i % 3) * 1.0 - 1.0,
			0.3,
			Math.floor(i / 3) * 1.0 - 0.5
		);
		sphere.castShadow = true;
		sphere.receiveShadow = true;

		scene.add(sphere);
		resultSpheres.push(sphere);

	}

	return resultSpheres;

}

// 主程序入口
window.addEventListener("load", async() => {

	// 加载资源
	const assets = await load();

	// 渲染器设置
	renderer = new THREE.WebGLRenderer({
		powerPreference: "high-performance",
		antialias: false,
		stencil: false,
		depth: false
	});

	renderer.debug.checkShaderErrors = true;
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.physicallyCorrectLights = true;

	const container = document.querySelector(".viewport");
	container.prepend(renderer.domElement);

	// 创建场景
	scene = new Scene();
	scene.background = new Color(0x242b38);

	// 摄像机设置
	camera = new PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 50);
	camera.position.set(0, 2, 3);

	// 控制器设置
	controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
	const settings = controls.settings;
	settings.general.mode = ControlMode.THIRD_PERSON;
	settings.rotation.sensitivity = 2.2;
	settings.rotation.damping = 0.05;
	settings.zoom.damping = 0.1;
	settings.translation.enabled = false;
	controls.position.set(0, 2, 3);
	controls.target.set(0, 0.5, 0);
	controls.update();

	// 添加灯光
	ambientLight = new AmbientLight(0xffffff, params.ambientLightIntensity);
	scene.add(ambientLight);

	directionalLight = new DirectionalLight(0xffffff, params.directionalLightIntensity);
	directionalLight.position.set(5, 5, 5);
	directionalLight.castShadow = true;
	directionalLight.shadow.mapSize.width = 1024;
	directionalLight.shadow.mapSize.height = 1024;
	scene.add(directionalLight);

	// 添加地面
	const groundMaterial = new MeshStandardMaterial({
		color: 0x808080,
		roughness: 0.7,
		metalness: 0.1
	});

	const ground = new Mesh(
		new PlaneGeometry(10, 10),
		groundMaterial
	);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	scene.add(ground);

	// 添加彩色球体
	spheres = createColoredSpheres(scene);

	// 添加模型
	if(assets.get("helmet")) {

		const helmet = assets.get("helmet").scene;
		helmet.scale.set(0.5, 0.5, 0.5);
		helmet.position.set(0, 1.0, 0);
		helmet.traverse((child) => {

			if(child.isMesh) {

				child.castShadow = true;
				child.receiveShadow = true;

			}

		});
		scene.add(helmet);

	}

	// 交互所需的变量
	const raycaster = new Raycaster();
	const mouse = new Vector2();

	// 后期处理设置
	composer = new EffectComposer(renderer, {
		multisampling: Math.min(4, renderer.capabilities.maxSamples)
	});

	// 创建颜色缓冲目标
	colorTarget = new WebGLRenderTarget(
		window.innerWidth * window.devicePixelRatio,
		window.innerHeight * window.devicePixelRatio
	);

	// 创建正常渲染通道
	const renderPass = new RenderPass(scene, camera);
	composer.addPass(renderPass);

	// 创建法线通道
	normalPass = new NormalPass(scene, camera);
	composer.addPass(normalPass);

	// 创建SSDO效果
	console.log("Creating SSDO Effect with new implementation...");
	ssdoEffect = new SSDOEffect(composer, camera, scene, {
		spp: params.sampleCount,
		rings: params.rings,
		radius: params.radius,
		power: params.intensity,
		bias: params.bias,
		aoDistance: 2.0, // AO搜索距离
		distancePower: 1.0, // 距离衰减指数
		useNormalPass: false, // 使用自定义法线通道
		normalTexture: normalPass.texture,
		colorTexture: colorTarget.texture,
		indirectLightIntensity: 5.0, // 增大间接光强度
		indirectLightDistance: params.indirectLightDistance * 2, // 增大间接光距离
		colorBleeding: true
	});

	// 设置初始混合模式为ADD，使效果更加明显
	params.blendMode = "ADD";

	// 立即应用混合模式
	if(ssdoEffect && ssdoEffect.blendMode) {

		const blendFunction = BlendFunction.ADD;
		if(typeof ssdoEffect.blendMode.setBlendFunction === "function") {

			ssdoEffect.blendMode.setBlendFunction(blendFunction);

		} else {

			ssdoEffect.blendMode.blendFunction = blendFunction;

		}

	}

	console.log("SSDO Effect created:", ssdoEffect);

	// 创建SSDO通道
	ssdoPass = new EffectPass(camera, ssdoEffect);
	composer.addPass(ssdoPass);

	// GUI控制面板设置
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 设置GUI控制面板
	setupGUI(pane);

	// 添加点击事件监听
	renderer.domElement.addEventListener("click", (event) =>
		onMouseClick(event, renderer, camera, spheres, raycaster, mouse)
	);

	// 窗口大小调整事件监听
	window.addEventListener("resize", () =>
		onResize(container, camera, composer, renderer)
	);

	// 初始化尺寸
	onResize(container, camera, composer, renderer);

	// 渲染循环
	let t0 = 0;
	requestAnimationFrame(function render(timestamp) {

		const deltaTime = timestamp - t0;
		t0 = timestamp;

		fpsMeter.update(timestamp);

		// 处理自动旋转
		if(params.autoRotate) {

			const timer = timestamp * 0.0003;
			camera.position.x = Math.sin(timer) * 3;
			camera.position.y = 2;
			camera.position.z = Math.cos(timer) * 3;
			camera.lookAt(0, 0.5, 0);

		} else {

			controls.update(timestamp);

		}

		// 更新色彩缓冲
		updateColorBuffer();

		// 渲染场景
		composer.render();

		requestAnimationFrame(render);

	});

});

// 更新场景颜色缓冲
function updateColorBuffer() {

	// 保存渲染器的当前状态
	const currentRenderTarget = renderer.getRenderTarget();
	const currentAutoClear = renderer.autoClear;

	// 渲染场景颜色到缓冲
	renderer.setRenderTarget(colorTarget);
	renderer.autoClear = true;
	renderer.render(scene, camera);

	// 更新SSDO的颜色纹理
	if(ssdoEffect && ssdoEffect.aoPass && ssdoEffect.aoPass.fullscreenMaterial) {

		ssdoEffect.aoPass.fullscreenMaterial.uniforms.colorTexture.value = colorTarget.texture;

		// 确保USE_COLOR_TEXTURE宏已定义
		if(!ssdoEffect.aoPass.fullscreenMaterial.defines.USE_COLOR_TEXTURE) {

			ssdoEffect.aoPass.fullscreenMaterial.defines.USE_COLOR_TEXTURE = "";
			ssdoEffect.aoPass.fullscreenMaterial.needsUpdate = true;
			console.log("Added USE_COLOR_TEXTURE define to SSDO material");

		}

		// 确保间接光计算正确
		ssdoEffect.aoPass.fullscreenMaterial.uniforms.colorBleeding.value = true;
		ssdoEffect.aoPass.fullscreenMaterial.uniforms.indirectLightIntensity.value = Math.max(
			params.indirectLightIntensity,
			2.0 // 确保最小强度
		);

	}

	// 恢复渲染器状态
	renderer.setRenderTarget(currentRenderTarget);
	renderer.autoClear = currentAutoClear;

}

// GUI设置函数
function setupGUI(pane) {

	// 光照设置
	const lightFolder = pane.addFolder({ title: "光照设置" });

	lightFolder.addBinding(params, "ambientLightIntensity", {
		min: 0.0, max: 3.0, step: 0.1,
		label: "环境光强度"
	}).on("change", (ev) => {

		if(ambientLight) { ambientLight.intensity = ev.value; }

	});

	lightFolder.addBinding(params, "directionalLightIntensity", {
		min: 0.0, max: 3.0, step: 0.1,
		label: "平行光强度"
	}).on("change", (ev) => {

		if(directionalLight) { directionalLight.intensity = ev.value; }

	});

	// 基本设置
	const generalFolder = pane.addFolder({ title: "SSDO参数设置" });

	generalFolder.addBinding(params, "blendMode", {
		options: {
			正常: "NORMAL",
			相加: "ADD",
			减去: "SUBTRACT",
			相乘: "MULTIPLY",
			除法: "DIVIDE",
			屏幕: "SCREEN",
			叠加: "OVERLAY",
			差值: "DIFFERENCE"
		},
		label: "混合模式"
	}).on("change", (ev) => {

		if(ssdoEffect) {

			try {

				// 设置新的混合模式 - 支持不同版本的Effect API
				const blendFunction = BlendFunction[ev.value];
				if(ssdoEffect.blendMode && typeof ssdoEffect.blendMode.setBlendFunction === "function") {

					ssdoEffect.blendMode.setBlendFunction(blendFunction);

				} else if(ssdoEffect.blendMode) {

					ssdoEffect.blendMode.blendFunction = blendFunction;

				}

				// 更新效果，不需要重建通道
				composer.setSize(
					composer.renderer.domElement.width,
					composer.renderer.domElement.height
				);

			} catch(e) {

				console.warn("设置混合模式失败:", e);

			}

		}

	});

	generalFolder.addBinding(params, "sampleCount", {
		min: 4, max: 64, step: 1,
		label: "采样数量"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.spp = ev.value; }

	});

	generalFolder.addBinding(params, "rings", {
		min: 1, max: 16, step: 1,
		label: "环数"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.rings = ev.value; }

	});

	generalFolder.addBinding(params, "radius", {
		min: 0.01, max: 1.0, step: 0.01,
		label: "半径"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.radius = ev.value; }

	});

	generalFolder.addBinding(params, "intensity", {
		min: 0.0, max: 5.0, step: 0.1,
		label: "强度"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.power = ev.value; }

	});

	generalFolder.addBinding(params, "bias", {
		min: 0.0, max: 0.1, step: 0.001,
		label: "偏差"
	}).on("change", (ev) => {

		if(ssdoEffect && ssdoEffect.aoPass) {

			ssdoEffect.aoPass.fullscreenMaterial.uniforms.bias.value = ev.value;

		}

	});

	generalFolder.addBinding(params, "autoRotate", {
		label: "自动旋转相机"
	}).on("change", (ev) => {

		controls.enabled = !ev.value;

	});

	// SSDO特定设置
	const ssdoFolder = pane.addFolder({ title: "间接光设置" });

	ssdoFolder.addBinding(params, "indirectLightIntensity", {
		min: 0.0, max: 5.0, step: 0.1,
		label: "间接光强度"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.indirectLightIntensity = ev.value; }

	});

	ssdoFolder.addBinding(params, "indirectLightDistance", {
		min: 0.1, max: 5.0, step: 0.1,
		label: "间接光距离"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.indirectLightDistance = ev.value; }

	});

	ssdoFolder.addBinding(params, "colorBleeding", {
		label: "启用色彩渗透"
	}).on("change", (ev) => {

		updateEffect();

	});

	// 颜色设置
	const colorFolder = pane.addFolder({ title: "颜色设置" });

	colorFolder.addBinding(params, "useColor", {
		label: "启用着色"
	}).on("change", (ev) => {

		updateEffect();

	});

	colorFolder.addBinding(params, "color", {
		picker: "inline",
		expanded: true,
		label: "AO颜色"
	}).on("change", (ev) => {

		updateEffect();

	});

	// 调试设置
	const debugFolder = pane.addFolder({ title: "调试" });

	debugFolder.addBinding(params, "showNormals", {
		label: "显示法线"
	}).on("change", (ev) => {

		normalPass.renderToScreen = ev.value;

	});

	generalFolder.addBinding(params, "effectOpacity", {
		min: 0.0, max: 1.0, step: 0.05,
		label: "效果不透明度"
	}).on("change", (ev) => {

		if(ssdoEffect) { ssdoEffect.blendMode.opacity.value = ev.value; }

	});

}

// 更新效果函数
function updateEffect() {

	// 更新颜色设置
	if(params.useColor) {

		const color = new Color(
			params.color.r / 255,
			params.color.g / 255,
			params.color.b / 255
		);
		ssdoEffect.color = color;

	} else {

		ssdoEffect.color = new Color(0, 0, 0);

	}

	// 更新颜色渗透设置
	if(!params.colorBleeding) {

		// 如果不启用色彩渗透，将间接光强度降低但不设为0
		ssdoEffect.indirectLightIntensity = 0.5; // 保留少量间接光

		// 确保SSDO材质中的设置也更新
		if(ssdoEffect.aoPass && ssdoEffect.aoPass.fullscreenMaterial) {

			ssdoEffect.aoPass.fullscreenMaterial.uniforms.colorBleeding.value = false;
			ssdoEffect.aoPass.fullscreenMaterial.uniforms.indirectLightIntensity.value = 0.5;

		}

	} else {

		ssdoEffect.indirectLightIntensity = params.indirectLightIntensity;

		// 确保SSDO材质中的设置也更新
		if(ssdoEffect.aoPass && ssdoEffect.aoPass.fullscreenMaterial) {

			ssdoEffect.aoPass.fullscreenMaterial.uniforms.colorBleeding.value = true;
			ssdoEffect.aoPass.fullscreenMaterial.uniforms.indirectLightIntensity.value = params.indirectLightIntensity;

		}

	}

	// 更新不透明度
	try {

		const opacity = params.effectOpacity;
		if(ssdoEffect.blendMode && ssdoEffect.blendMode.opacity) {

			ssdoEffect.blendMode.opacity.value = opacity;

		} else if(ssdoEffect.uniforms && ssdoEffect.uniforms.has("opacity")) {

			ssdoEffect.uniforms.get("opacity").value = opacity;

		}

	} catch(e) {

		console.warn("设置不透明度失败:", e);

	}

	// 更新颜色缓冲
	updateColorBuffer();

}
