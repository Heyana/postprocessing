import {
	CubeTextureLoader,
	FogExp2,
	Group,
	IcosahedronGeometry,
	LoadingManager,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	Raycaster,
	Scene,
	SRGBColorSpace,
	Vector2,
	WebGLRenderer,
	Color
} from "three";

import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	SelectiveBloomEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls } from "spatial-controls";
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

	const camera = new PerspectiveCamera();
	const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
	const settings = controls.settings;
	settings.rotation.sensitivity = 2.2;
	settings.rotation.damping = 0.05;
	settings.translation.damping = 0.1;
	controls.position.set(0, 0, 1);
	controls.lookAt(0, 0, 0);

	// Scene, Lights, Objects

	const scene = new Scene();
	scene.fog = new FogExp2(0x373134, 0.06);
	scene.background = assets.get("sky");
	scene.add(Domain.createLights());
	scene.add(Domain.createEnvironment(scene.background));
	scene.add(Domain.createActors(scene.background));

	const orbs = new Group();

	const n = 12;
	const step = 2.0 * Math.PI / n;
	const radius = 4.0;
	let angle = 0.0;

	for(let i = 0; i < n; ++i) {

		const orb = new Mesh(
			new IcosahedronGeometry(1, 3),
			new MeshBasicMaterial({
				color: Math.random() * 0xffffff
			})
		);

		// Arrange the objects in a circle.
		orb.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
		orb.scale.setScalar(0.15);
		orbs.add(orb);
		angle += step;

	}

	scene.add(orbs);

	// Post Processing

	const composer = new EffectComposer(renderer, {
		multisampling: Math.min(4, renderer.capabilities.maxSamples)
	});

	const effect = new SelectiveBloomEffect(scene, camera, {
		luminanceThreshold: 0.3,
		luminanceSmoothing: 0.2,
		mipmapBlur: true,
		intensity: 4.0,
		bloomColor: 0x88ccff
	});

	effect.inverted = true;
	composer.addPass(new RenderPass(scene, camera));
	composer.addPass(new EffectPass(camera, effect));

	// Object Picking

	const ndc = new Vector2();
	const raycaster = new Raycaster();
	renderer.domElement.addEventListener("pointerdown", (event) => {

		const clientRect = container.getBoundingClientRect();
		const clientX = event.clientX - clientRect.left;
		const clientY = event.clientY - clientRect.top;
		ndc.x = (clientX / container.clientWidth) * 2.0 - 1.0;
		ndc.y = -(clientY / container.clientHeight) * 2.0 + 1.0;
		raycaster.setFromCamera(ndc, camera);
		const intersects = raycaster.intersectObjects(orbs.children, true);

		if(intersects.length > 0) {

			effect.selection.toggle(intersects[0].object);

		}

	});

	// Settings

	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	const folder = pane.addFolder({ title: "Settings" });
	folder.addBinding(effect, "intensity", { min: 0, max: 10, step: 0.01 });
	folder.addBinding(effect.mipmapBlurPass, "radius", { min: 0, max: 1, step: 1e-3 });
	folder.addBinding(effect.mipmapBlurPass, "levels", { min: 1, max: 9, step: 1 });

	// 添加辉光颜色控制 - 使用自定义对象来处理颜色
	const colorConfig = {
		color: effect.bloomColor.getHex(),
		enableAnimation: false // 添加动画控制开关
	};

	folder.addBinding(colorConfig, "color", {
		view: "color",
		label: "辉光颜色"
	}).on("change", (event) => {

		effect.bloomColor = new Color(event.value);

	});

	// 添加颜色动画切换按钮
	folder.addBinding(colorConfig, "enableAnimation", {
		label: "颜色动画"
	}).on("change", (event) => {

		enableColorAnimation = event.value;

	});

	let subfolder = folder.addFolder({ title: "Luminance Filter" });
	subfolder.addBinding(effect.luminancePass, "enabled");
	subfolder.addBinding(effect.luminanceMaterial, "threshold", { min: 0, max: 1, step: 0.01 });
	subfolder.addBinding(effect.luminanceMaterial, "smoothing", { min: 0, max: 1, step: 0.01 });

	subfolder = folder.addFolder({ title: "Selection" });
	subfolder.addBinding(effect, "inverted");
	subfolder.addBinding(effect, "ignoreBackground");

	folder.addBinding(effect.blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 });
	folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction });

	// Resize Handler

	function onResize() {

		const width = container.clientWidth, height = container.clientHeight;
		camera.aspect = width / height;
		camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
		camera.updateProjectionMatrix();
		composer.setSize(width, height);

	}

	window.addEventListener("resize", onResize);
	onResize();

	// Render Loop

	// 添加时间变化的辉光颜色效果
	const initialColor = new Color(0x88ccff);
	const targetColor = new Color(0xff88cc);
	let colorPhase = 0;
	// 控制是否启用颜色动画
	let enableColorAnimation = false;

	requestAnimationFrame(function render(timestamp) {

		fpsMeter.update(timestamp);
		controls.update(timestamp);

		// 如果启用了颜色动画，才执行颜色变化
		if(enableColorAnimation) {

			// 平滑地在两种颜色之间切换
			colorPhase = (colorPhase + 0.005) % (Math.PI * 2);
			const mixFactor = (Math.sin(colorPhase) + 1) * 0.5;
			const currentColor = new Color().lerpColors(initialColor, targetColor, mixFactor);
			effect.bloomColor = currentColor;
			// 更新控制面板中的颜色显示
			colorConfig.color = currentColor.getHex();

		}

		composer.render();
		requestAnimationFrame(render);

	});

}));
