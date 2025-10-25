/**
 * SelectiveSSR Demo
 * 演示选择性屏幕空间反射效果
 */
import {
	BlendFunction,
	BrightnessContrastEffect,
	EffectComposer,
	EffectPass,
	EnhancedThreeCompatPass,
	ReflectorForSSRPass,
	RenderPass,
	SelectiveBloomEffect,
	SelectiveSSRPass
} from "postprocessing";
import {
	IcosahedronGeometry,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	SphereGeometry,
	TorusGeometry,
	TorusKnotGeometry,
	Vector2,
	VSMShadowMap,
	MyWebGLRenderer
} from "run-scene-core";

// 导入工具函数
import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import {
	createBasicScene,
	createTestObjects,
	getObjectsByGeometryType,
	loadEnvironmentMap,
	optimizeCurvedSurfaceReflections,
	optimizeSphereReflections,
	updateEnvMapIntensity
} from "../utils/SceneUtils";

// 全局参数设置
const params = {
	enableSSR: true,
	enableBloom: true,
	enableBrightnessContrast: true,
	autoRotate: false,
	otherMeshes: true,
	groundReflector: true,
	showHelpers: true,
	useMetalnessThreshold: true, // 使用金属度阈值自动选择
	metalnessThreshold: 0.5, // 默认金属度阈值
	usePixelMetalnessThreshold: true, // 使用像素级金属度判断
	renderMode: "pixel", // 渲染模式选项: 'pixel' 或 'object'

	// 分辨率分层优化参数
	enableResolutionScaling: true, // 启用分辨率缩放优化
	normalRenderScale: 0.5,        // 法线渲染分辨率比例 (0.5 = 50%分辨率)
	depthRenderScale: 0.5          // 深度渲染分辨率比例 (0.5 = 50%分辨率)
};

// 全局变量声明
let ssrPass = null;

// 加载资源
async function load() {

	const assets = new Map();
	try {

		// 加载环境贴图
		const envMap = await loadEnvironmentMap(document.baseURI + "img/textures/skies/sunset/");
		assets.set("sky", envMap);

	} catch (error) {

		console.warn("环境贴图加载失败，将使用默认颜色", error);

	}
	return assets;

}

// 点击事件处理
function onMouseClick(event, renderer, camera, testObjects, raycaster, mouse) {

	// 检查ssrPass是否已初始化
	if (!ssrPass) {

		console.warn("SSR Pass尚未初始化，无法处理选择操作");
		return;

	}

	// 如果使用金属度阈值模式，则不处理手动点击选择
	if (ssrPass.useMetalnessThreshold) {

		console.log("当前使用金属度阈值模式，手动选择被禁用");
		return;

	}

	// 计算鼠标在归一化设备坐标中的位置
	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

	// 设置射线投射器
	raycaster.setFromCamera(mouse, camera);

	// 检测与场景中物体的交点
	const intersects = raycaster.intersectObjects(testObjects.children, true);

	if (intersects.length > 0) {

		const object = intersects[0].object;
		// 切换对象的选择状态
		ssrPass.toggleSelection(object);

	}

}

// 窗口大小调整处理
function onResize(container, camera, composer, renderer, compatSSRPass, bloomEffect, groundReflector) {

	const width = container.clientWidth, height = container.clientHeight;
	camera.aspect = width / height;
	camera.fov = calculateVerticalFoV(35, Math.max(camera.aspect, 16 / 9));
	camera.updateProjectionMatrix();
	composer.setSize(width, height);
	renderer.setSize(width, height);

	// 更新SSRPass尺寸
	if (compatSSRPass && compatSSRPass.threePass) {

		compatSSRPass.threePass.width = width;
		compatSSRPass.threePass.height = height;
		compatSSRPass.threePass.setSize(width, height);

	}

	// 更新其他效果尺寸
	if (bloomEffect) {

		bloomEffect.setSize(width, height);

	}

	if (groundReflector) {

		groundReflector.getRenderTarget().setSize(width, height);
		groundReflector.resolution.set(width, height);

	}

}

// 主程序入口
window.addEventListener("load", async () => {

	// 加载资源
	const assets = await load();

	// 渲染器设置
	const renderer = new MyWebGLRenderer({
		powerPreference: "high-performance"
		// antialias: false,
		// stencil: false,
		// depth: true
	});

	// renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
	// renderer.shadowMap.type = VSMShadowMap;
	// renderer.shadowMap.autoUpdate = true;
	// renderer.shadowMap.enabled = true;

	const container = document.querySelector(".viewport");
	container.prepend(renderer.domElement);

	// 创建基础场景
	const { scene, hemiLight, spotLight, plane } = createBasicScene();

	// 加载环境贴图
	if (assets.get("sky")) {

		scene.background = assets.get("sky");
		scene.environment = assets.get("sky");

	}

	// 摄像机设置
	const camera = new PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 15);

	// 控制器设置
	const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
	const settings = controls.settings;
	settings.general.mode = ControlMode.THIRD_PERSON;
	settings.rotation.sensitivity = 2.2;
	settings.rotation.damping = 0.05;
	settings.zoom.damping = 0.1;
	settings.translation.enabled = false;
	controls.position.set(0.13, 0.35, 0.44);
	controls.target.set(0, 0.0635, 0);
	controls.update();

	// 添加测试对象
	const testObjects = createTestObjects();
	scene.add(testObjects);

	// 交互所需的变量
	const raycaster = new Raycaster();
	const mouse = new Vector2();

	// 创建ground reflector (如果ReflectorForSSRPass可用)
	let groundReflector = null;
	// if (ReflectorForSSRPass) {
	//     // 创建地面反射器
	//     groundReflector = new ReflectorForSSRPass(new PlaneGeometry(2, 2), {
	//         clipBias: 0.0003,
	//         textureWidth: window.innerWidth,
	//         textureHeight: window.innerHeight,
	//         color: 0x888888,
	//         useDepthTexture: true,
	//     });
	//     groundReflector.material.depthWrite = false;
	//     groundReflector.rotation.x = -Math.PI / 2;
	//     groundReflector.visible = false;
	//     scene.add(groundReflector);
	// } else {
	//     console.warn("ReflectorForSSRPass not available. Ground reflections disabled.");
	//     params.groundReflector = false;
	// }

	// 后期处理设置
	const composer = new EffectComposer(renderer, {
		multisampling: Math.min(4, renderer.capabilities.maxSamples)
	});

	// 全局变量，用于存储创建的通道和效果
	let compatSSRPass = null;
	let bloomEffect = null;
	let bloomPass = null;
	let brightnessContrastEffect = null;
	let brightnessContrastPass = null;

	// GUI控制面板设置
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	try {

		// 创建SelectiveSSRPass
		ssrPass = new SelectiveSSRPass({
			renderer,
			scene,
			camera,
			width: window.innerWidth,
			height: window.innerHeight,
			groundReflector: params.groundReflector ? groundReflector : null,
			selectionLayer: 21,
			metalnessThreshold: params.metalnessThreshold,
			useMetalnessThreshold: params.useMetalnessThreshold,
			composer
		});

		// 设置场景引用以启用自动选择

		// 设置SSRPass的初始参数
		ssrPass.thickness = 0.035;
		ssrPass.maxDistance = 0.08;
		ssrPass.opacity = 0.75;
		ssrPass.fresnel = true;
		ssrPass.distanceAttenuation = true;
		ssrPass.bouncing = true;
		ssrPass.infiniteThick = false;
		ssrPass.blur = true;

		// SelectiveSSRPass特有参数
		ssrPass.inverted = false;
		ssrPass.ignoreBackground = true;

		// 分辨率分层优化：设置优化参数
		ssrPass.setResolutionScaling(params.enableResolutionScaling);
		ssrPass.setNormalRenderScale(params.normalRenderScale);
		ssrPass.setDepthRenderScale(params.depthRenderScale);

		// // 调整材质参数
		// if (ssrPass.ssrMaterial) {
		//     ssrPass.ssrMaterial.defines.MAX_STEP = Math.sqrt(window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight);
		//     ssrPass.ssrMaterial.uniforms['maxDistance'].value = 0.08;
		//     ssrPass.ssrMaterial.uniforms['thickness'].value = 0.035;
		//     ssrPass.ssrMaterial.needsUpdate = true;

		//     if (ssrPass.copyMaterial) {
		//         ssrPass.copyMaterial.blending = NormalBlending;
		//         ssrPass.copyMaterial.needsUpdate = true;
		//     }
		// }

		// 创建效果通道
		compatSSRPass = new EnhancedThreeCompatPass(ssrPass, "SelectiveSSRPass", "ssr");
		compatSSRPass.enabled = params.enableSSR;

		// 创建并添加基本渲染Pass
		const renderPass = new RenderPass(scene, camera);
		composer.addPass(renderPass);

		// 创建并添加SelectiveBloom效果
		bloomEffect = new SelectiveBloomEffect(scene, camera, {
			blendFunction: BlendFunction.SCREEN,
			luminanceThreshold: 0.3,
			luminanceSmoothing: 0.2,
			intensity: 1.5,
			mipmapBlur: true
		});
		bloomEffect.mipmapBlurPass.dithering = true;
		bloomPass = new EffectPass(camera, bloomEffect);
		bloomPass.enabled = params.enableBloom;
		// composer.addPass(bloomPass, 1);

		// 添加SSRPass
		compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.Default;
		composer.addPass(compatSSRPass);

		// 添加BrightnessContrast效果
		brightnessContrastEffect = new BrightnessContrastEffect({
			blendFunction: BlendFunction.NORMAL,
			brightness: 0.05,
			contrast: 0.1
		});
		brightnessContrastPass = new EffectPass(camera, brightnessContrastEffect);
		brightnessContrastPass.enabled = params.enableBrightnessContrast;
		// composer.addPass(brightnessContrastPass);

		// 创建GUI控制面板
		setupGUI(pane, {
			ssrPass,
			compatSSRPass,
			bloomPass,
			bloomEffect,
			brightnessContrastEffect,
			brightnessContrastPass,
			groundReflector,
			testObjects,
			scene,
			hemiLight,
			spotLight,
			controls
		});

		// 添加点击事件监听
		renderer.domElement.addEventListener("click", (event) =>
			onMouseClick(event, renderer, camera, testObjects, raycaster, mouse)
		);

	} catch (error) {

		console.error("Error setting up SelectiveSSRPass:", error);
		// 创建错误信息面板
		const errorFolder = pane.addFolder({ title: "SSR错误" });
		errorFolder.addBinding({ error: error.message }, "error", {
			readonly: true,
			label: "错误信息"
		});
		errorFolder.addBinding({ info: "SelectiveSSR初始化失败，将使用标准渲染。" }, "info", {
			readonly: true,
			label: "提示"
		});

	}

	// 窗口大小调整事件监听
	window.addEventListener("resize", () =>
		onResize(container, camera, composer, renderer, compatSSRPass, bloomEffect, groundReflector)
	);

	// 初始化尺寸
	onResize(container, camera, composer, renderer, compatSSRPass, bloomEffect, groundReflector);

	// 渲染循环
	let t0 = 0;
	requestAnimationFrame(function render(timestamp) {

		const deltaTime = timestamp - t0;
		t0 = timestamp;

		fpsMeter.update(timestamp);

		// 处理自动旋转
		if (params.autoRotate) {

			const timer = timestamp * 0.0003;
			camera.position.x = Math.sin(timer) * 0.5;
			camera.position.y = 0.2135;
			camera.position.z = Math.cos(timer) * 0.5;
			camera.lookAt(0, 0.0635, 0);

		} else {

			controls.update(timestamp);

		}

		// 渲染场景
		composer.render();

		requestAnimationFrame(render);

	});

});

// GUI设置函数
function setupGUI(pane, options) {

	const {
		ssrPass,
		compatSSRPass,
		bloomPass,
		bloomEffect,
		brightnessContrastEffect,
		brightnessContrastPass,
		groundReflector,
		testObjects,
		scene,
		hemiLight,
		spotLight,
		controls
	} = options;

	// SSR 控制面板
	const folder = pane.addFolder({ title: "SSR设置" });

	// 基本控制
	folder.addBinding(params, "enableSSR", { label: "启用SSR" })
		.on("change", (e) => {

			compatSSRPass.enabled = e.value;

		});

	folder.addBinding(params, "enableBloom", { label: "启用泛光效果" })
		.on("change", (e) => {

			bloomPass.enabled = e.value;

		});

	folder.addBinding(params, "enableBrightnessContrast", { label: "启用亮度对比度" })
		.on("change", (e) => {

			brightnessContrastPass.enabled = e.value;

		});

	// 添加重置按钮
	const resetBtn = folder.addButton({
		title: "重置效果设置"
	});

	resetBtn.on("click", () => {

		// 重置SSR设置
		const ssrPass = compatSSRPass.threePass;
		ssrPass.thickness = 0.035;
		ssrPass.maxDistance = 0.08;
		ssrPass.opacity = 0.75;
		ssrPass.fresnel = true;
		ssrPass.distanceAttenuation = true;
		ssrPass.bouncing = false;
		ssrPass.infiniteThick = false;
		ssrPass.blur = true;

		if (groundReflector) {

			// 重置反射器设置
			groundReflector.material.uniforms.textureMatrix.value.elements[5] = 1;
			groundReflector.material.uniformsNeedUpdate = true;
			groundReflector.rotation.z = 0;

			// 重置控制参数
			reflectionParams.invertY = false;
			reflectionParams.flipReflector = false;
			reflectionParams.sphereEnhanced = true;
			reflectionParams.curveSampling = true;

			// 更新矩阵
			if (groundReflector.updateMatrices) {

				groundReflector.updateMatrices();

			}

		}

		// 应用球体增强效果
		const spheres = getObjectsByGeometryType(testObjects, SphereGeometry);
		spheres.forEach((sphere, i) => {

			sphere.material.metalness = 1.0;
			sphere.material.roughness = Math.max(0.05, 0.3 - i / 10);

		});

		// 更新控制面板
		pane.refresh();

	});

	folder.addBinding(params, "groundReflector", { label: "启用地面反射" })
		.on("change", (e) => {

			if (e.value) {

				compatSSRPass.threePass.groundReflector = groundReflector;

			} else {

				compatSSRPass.threePass.groundReflector = null;

			}

		});

	folder.addBinding(params, "autoRotate", { label: "自动旋转相机" })
		.on("change", (e) => {

			controls.enabled = !e.value;

		});

	folder.addBinding(params, "otherMeshes", { label: "显示测试对象" })
		.on("change", (e) => {

			testObjects.visible = e.value;

		});

	// SSR参数控制
	const settingsFolder = folder.addFolder({ title: "反射参数" });

	// 反射方向控制参数
	const reflectionParams = {
		invertY: false,
		flipReflector: false,
		sphereEnhanced: true,
		curveSampling: true
	};

	settingsFolder.addBinding(reflectionParams, "invertY", { label: "反转Y轴反射" })
		.on("change", (e) => {

			if (groundReflector) {

				groundReflector.material.uniforms.textureMatrix.value.elements[5] = e.value ? -1 : 1;
				groundReflector.material.uniformsNeedUpdate = true;
				if (groundReflector.updateMatrices) {

					groundReflector.updateMatrices();

				}

			}

		});

	settingsFolder.addBinding(reflectionParams, "flipReflector", { label: "翻转整个反射平面" })
		.on("change", (e) => {

			if (groundReflector) {

				groundReflector.rotation.z = e.value ? Math.PI : 0;
				if (groundReflector.updateMatrices) {

					groundReflector.updateMatrices();

				}

			}

		});

	settingsFolder.addBinding(reflectionParams, "sphereEnhanced", { label: "球体反射增强" })
		.on("change", (e) => {

			const spheres = getObjectsByGeometryType(testObjects, SphereGeometry);
			optimizeSphereReflections(spheres, e.value);

		});

	settingsFolder.addBinding(reflectionParams, "curveSampling", { label: "曲面采样优化" })
		.on("change", (e) => {

			const ssrPass = compatSSRPass.threePass;

			// 优化采样参数
			if (e.value) {

				ssrPass.thickness = 0.035;
				ssrPass.maxDistance = 0.09;
				ssrPass.blur = true;

			} else {

				ssrPass.thickness = 0.025;
				ssrPass.maxDistance = 0.06;
				ssrPass.blur = false;

			}

			// 更新曲面对象材质
			const curvedObjects = [
				...getObjectsByGeometryType(testObjects, TorusGeometry),
				...getObjectsByGeometryType(testObjects, TorusKnotGeometry),
				...getObjectsByGeometryType(testObjects, IcosahedronGeometry)
			];
			optimizeCurvedSurfaceReflections(curvedObjects, e.value);

		});

	// 使用compatSSRPass.threePass获取ssrPass
	settingsFolder.addBinding(compatSSRPass.threePass, "thickness", {
		label: "厚度",
		min: 0,
		max: 0.1,
		step: 0.001
	});

	settingsFolder.addBinding(compatSSRPass.threePass, "infiniteThick", {
		label: "无限厚度"
	});

	settingsFolder.addBinding(compatSSRPass.threePass, "maxDistance", {
		label: "最大距离",
		min: 0,
		max: 0.5,
		step: 0.001
	}).on("change", (e) => {

		if (groundReflector) {

			groundReflector.maxDistance = e.value;

		}

	});

	settingsFolder.addBinding(compatSSRPass.threePass, "opacity", {
		label: "不透明度",
		min: 0,
		max: 1,
		step: 0.01
	}).on("change", (e) => {

		if (groundReflector) {

			groundReflector.opacity = e.value;

		}

	});

	settingsFolder.addBinding(compatSSRPass.threePass, "fresnel", {
		label: "菲涅尔效应"
	}).on("change", (e) => {

		if (groundReflector) {

			groundReflector.fresnel = e.value;

		}

	});

	settingsFolder.addBinding(compatSSRPass.threePass, "distanceAttenuation", {
		label: "距离衰减"
	}).on("change", (e) => {

		if (groundReflector) {

			groundReflector.distanceAttenuation = e.value;

		}

	});

	settingsFolder.addBinding(compatSSRPass.threePass, "bouncing", {
		label: "多次反射"
	});

	settingsFolder.addBinding(compatSSRPass.threePass, "blur", {
		label: "模糊效果"
	});

	// 添加SelectiveSSRPass特有的设置
	const selectiveFolder = folder.addFolder({ title: "选择性SSR设置" });

	// 分辨率分层优化控制面板
	const optimizationFolder = selectiveFolder.addFolder({ title: "🚀 分辨率分层优化" });

	// 启用分辨率缩放控制
	optimizationFolder.addBinding(params, "enableResolutionScaling", {
		label: "启用分辨率缩放"
	}).on("change", (e) => {
		if (ssrPass) {
			ssrPass.setResolutionScaling(e.value);
			console.log(`${e.value ? '启用' : '禁用'}分辨率缩放优化`);
		}
	});

	// 法线渲染分辨率缩放控制
	optimizationFolder.addBinding(params, "normalRenderScale", {
		label: "法线渲染分辨率",
		min: 0.1,
		max: 1.0,
		step: 0.05
	}).on("change", (e) => {
		if (ssrPass) {
			ssrPass.setNormalRenderScale(e.value);
			const resolution = ssrPass.getNormalRenderResolution();
			console.log(`法线渲染分辨率: ${resolution.width}x${resolution.height} (${(resolution.scale * 100).toFixed(0)}%)`);
		}
	});

	// 深度渲染分辨率缩放控制
	optimizationFolder.addBinding(params, "depthRenderScale", {
		label: "深度渲染分辨率",
		min: 0.1,
		max: 1.0,
		step: 0.05
	}).on("change", (e) => {
		if (ssrPass) {
			ssrPass.setDepthRenderScale(e.value);
			const resolution = ssrPass.getDepthRenderResolution();
			console.log(`深度渲染分辨率: ${resolution.width}x${resolution.height} (${(resolution.scale * 100).toFixed(0)}%)`);
		}
	});

	// 分辨率信息显示
	const normalResInfo = optimizationFolder.addBinding({
		info: "1920x1080 (100%)"
	}, "info", {
		readonly: true,
		label: "法线分辨率"
	});

	const depthResInfo = optimizationFolder.addBinding({
		info: "1920x1080 (100%)"
	}, "info", {
		readonly: true,
		label: "深度分辨率"
	});

	// 优化统计信息
	const optimizationStats = optimizationFolder.addBinding({
		info: "像素减少: 0%"
	}, "info", {
		readonly: true,
		label: "优化统计"
	});

	// 性能预设按钮
	const presetFolder = optimizationFolder.addFolder({ title: "性能预设" });

	presetFolder.addButton({
		title: "极致性能 (25%)"
	}).on("click", () => {
		params.normalRenderScale = 0.25;
		params.depthRenderScale = 0.25;
		params.enableResolutionScaling = true;
		if (ssrPass) {
			ssrPass.setResolutionScaling(true);
			ssrPass.setNormalRenderScale(0.25);
			ssrPass.setDepthRenderScale(0.25);
		}
		pane.refresh();
		console.log("切换到极致性能模式 (25%分辨率)");
	});

	presetFolder.addButton({
		title: "平衡模式 (50%)"
	}).on("click", () => {
		params.normalRenderScale = 0.5;
		params.depthRenderScale = 0.5;
		params.enableResolutionScaling = true;
		if (ssrPass) {
			ssrPass.setResolutionScaling(true);
			ssrPass.setNormalRenderScale(0.5);
			ssrPass.setDepthRenderScale(0.5);
		}
		pane.refresh();
		console.log("切换到平衡模式 (50%分辨率)");
	});

	presetFolder.addButton({
		title: "高质量 (100%)"
	}).on("click", () => {
		params.normalRenderScale = 1.0;
		params.depthRenderScale = 1.0;
		params.enableResolutionScaling = false;
		if (ssrPass) {
			ssrPass.setResolutionScaling(false);
			ssrPass.setNormalRenderScale(1.0);
			ssrPass.setDepthRenderScale(1.0);
		}
		pane.refresh();
		console.log("切换到高质量模式 (100%分辨率)");
	});

	// 定时更新分辨率信息
	setInterval(() => {
		if (ssrPass) {
			const normalRes = ssrPass.getNormalRenderResolution();
			const depthRes = ssrPass.getDepthRenderResolution();
			const stats = ssrPass.getOptimizationStats();

			normalResInfo.value = `${normalRes.width}x${normalRes.height} (${(normalRes.scale * 100).toFixed(0)}%)`;
			depthResInfo.value = `${depthRes.width}x${depthRes.height} (${(depthRes.scale * 100).toFixed(0)}%)`;
			optimizationStats.value = `总像素减少: ${stats.pixelReduction.total}`;
		}
	}, 500);

	// 添加使用金属度阈值开关
	selectiveFolder.addBinding(params, "useMetalnessThreshold", {
		label: "使用金属度阈值"
	}).on("change", (e) => {

		ssrPass.useMetalnessThreshold = e.value;
		// 更新选择
		if (e.value) {

			ssrPass.updateSelectionBasedOnMetalness();

		}

	});

	// 添加金属度阈值控制
	selectiveFolder.addBinding(params, "metalnessThreshold", {
		label: "金属度阈值",
		min: 0,
		max: 1,
		step: 0.01
	}).on("change", (e) => {

		ssrPass.setMetalnessThreshold(e.value);

	});

	// 亮度对比度参数
	const bcSettingsFolder = folder.addFolder({ title: "亮度对比度参数" });

	bcSettingsFolder.addBinding(brightnessContrastEffect, "brightness", {
		label: "亮度",
		min: -1,
		max: 1,
		step: 0.01
	});

	bcSettingsFolder.addBinding(brightnessContrastEffect, "contrast", {
		label: "对比度",
		min: -1,
		max: 1,
		step: 0.01
	});

	bcSettingsFolder.addBinding(brightnessContrastEffect.blendMode.opacity, "value", {
		label: "不透明度",
		min: 0,
		max: 1,
		step: 0.01
	});

	// 灯光控制
	const lightsFolder = pane.addFolder({ title: "灯光设置" });

	// 半球光
	const hemiLightFolder = lightsFolder.addFolder({ title: "半球光" });
	hemiLightFolder.addBinding(hemiLight, "intensity", {
		label: "强度",
		min: 0,
		max: 30,
		step: 0.1
	});

	// 聚光灯
	const spotLightFolder = lightsFolder.addFolder({ title: "聚光灯" });
	spotLightFolder.addBinding(spotLight, "intensity", {
		label: "强度",
		min: 0,
		max: 10,
		step: 0.1
	});
	spotLightFolder.addBinding(spotLight, "angle", {
		label: "角度",
		min: 0,
		max: Math.PI / 4,
		step: 0.01
	});
	spotLightFolder.addBinding(spotLight, "penumbra", {
		label: "半影",
		min: 0,
		max: 1,
		step: 0.01
	});
	spotLightFolder.addBinding(spotLight.position, "x", {
		label: "位置X",
		min: -2,
		max: 2,
		step: 0.1
	});
	spotLightFolder.addBinding(spotLight.position, "y", {
		label: "位置Y",
		min: 0,
		max: 2,
		step: 0.1
	});
	spotLightFolder.addBinding(spotLight.position, "z", {
		label: "位置Z",
		min: -2,
		max: 2,
		step: 0.1
	});

	// 环境设置
	const envParams = {
		envMapIntensity: 1.5
	};

	const envFolder = pane.addFolder({ title: "环境设置" });
	envFolder.addBinding(envParams, "envMapIntensity", {
		label: "环境贴图强度",
		min: 0,
		max: 5,
		step: 0.1
	}).on("change", (e) => {

		updateEnvMapIntensity(scene, e.value);

	});

	// 调试工具
	const debugFolder = selectiveFolder.addFolder({ title: "调试工具" });

	// 添加高亮选择区域开关
	debugFolder.addBinding({
		highlightSelected: false
	}, "highlightSelected", {
		label: "高亮选择区域"
	}).on("change", (e) => {

		ssrPass.setHighlightSelected(e.value);

	});

	// 输出选项
	const outputFolder = debugFolder.addFolder({ title: "显示模式" });
	outputFolder.addBinding({
		outputMode: SelectiveSSRPass.OUTPUT.Default,
		modes: {
			"默认 (反射+场景)": SelectiveSSRPass.OUTPUT.Default,
			"仅反射": SelectiveSSRPass.OUTPUT.SSR,
			"原始场景": SelectiveSSRPass.OUTPUT.Beauty,
			"深度": SelectiveSSRPass.OUTPUT.Depth,
			"法线": SelectiveSSRPass.OUTPUT.Normal,
			"掩码": SelectiveSSRPass.OUTPUT.Mask,
			"掩码叠加": SelectiveSSRPass.OUTPUT.Debug
		}
	}, "outputMode", {
		label: "输出类型",
		options: {
			"默认 (反射+场景)": SelectiveSSRPass.OUTPUT.Default,
			"仅反射": SelectiveSSRPass.OUTPUT.SSR,
			"原始场景": SelectiveSSRPass.OUTPUT.Beauty,
			"深度": SelectiveSSRPass.OUTPUT.Depth,
			"法线": SelectiveSSRPass.OUTPUT.Normal,
			"掩码": SelectiveSSRPass.OUTPUT.Mask,
			"掩码叠加": SelectiveSSRPass.OUTPUT.Debug
		}
	}).on("change", (e) => {

		compatSSRPass.threePass.output = e.value;

	});

	// 添加循环切换视图按钮
	const cycleViewBtn = outputFolder.addButton({
		title: "循环切换视图模式"
	});

	cycleViewBtn.on("click", () => {

		// 获取当前输出模式
		let currentMode = compatSSRPass.threePass.output;

		// 可用的模式数组
		const modes = [
			SelectiveSSRPass.OUTPUT.Default,
			SelectiveSSRPass.OUTPUT.SSR,
			SelectiveSSRPass.OUTPUT.Beauty,
			SelectiveSSRPass.OUTPUT.Depth,
			SelectiveSSRPass.OUTPUT.Normal,
			SelectiveSSRPass.OUTPUT.Mask,
			SelectiveSSRPass.OUTPUT.Debug
		];

		// 找到当前模式在数组中的索引
		const currentIndex = modes.indexOf(currentMode);

		// 计算下一个模式的索引（循环）
		const nextIndex = (currentIndex + 1) % modes.length;

		// 设置新的输出模式
		compatSSRPass.threePass.output = modes[nextIndex];

		// 更新控件值
		outputFolder.children[0].value = modes[nextIndex];

	});

}
