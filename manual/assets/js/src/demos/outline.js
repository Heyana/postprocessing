import {
	AnimationMixer,
	Color,
	CubeTextureLoader,
	GLTFLoader,
	Group,
	LoadingManager,
	Mesh,
	PerspectiveCamera,
	Raycaster,
	Scene,
	SphereGeometry,
	MeshStandardMaterial,
	SRGBColorSpace,
	TextureLoader,
	Vector2,
	Vector3,
	VSMShadowMap,
	WebGLRenderer
} from "three";

import {
	BlendFunction,
	OutlineEffect,
	OverrideMaterialManager,
	EffectComposer,
	EffectPass,
	KernelSize,
	RenderPass
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

// 创建一组球体
function createSphereGroup(color, positionY) {
	const group = new Group();

	// 创建三个球体，水平排列
	for (let i = 0; i < 3; i++) {
		const sphere = new Mesh(
			new SphereGeometry(0.5, 32, 32),
			new MeshStandardMaterial({ color })
		);
		sphere.position.set(i * 1.5 - 1.5, 0, 0);
		sphere.castShadow = sphere.receiveShadow = true;
		group.add(sphere);
	}

	// 设置组的垂直位置
	group.position.set(0, positionY, 0);

	return group;
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
	renderer.shadowMap.type = VSMShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
	renderer.shadowMap.enabled = true;

	const container = document.querySelector(".viewport");
	container.prepend(renderer.domElement);

	// Camera & Controls

	const camera = new PerspectiveCamera();
	const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
	const settings = controls.settings;
	settings.general.mode = ControlMode.THIRD_PERSON;
	settings.rotation.sensitivity = 2.2;
	settings.rotation.damping = 0.05;
	settings.zoom.damping = 0.1;
	settings.translation.enabled = false;
	controls.position.set(2, 2, 10);

	// Scene, Lights, Objects

	const scene = new Scene();
	scene.background = assets.get("sky");
	scene.add(Shapes.createLights());
	const actors = Shapes.createActors();
	scene.add(actors);

	// 创建五组球体，每组不同颜色
	const sphereGroups = [
		createSphereGroup(0xff0000, 2),    // 红色
		createSphereGroup(0x00ff00, 1),    // 绿色
		createSphereGroup(0x0000ff, 0),    // 蓝色
		createSphereGroup(0xffff00, -1),   // 黄色
		createSphereGroup(0xff00ff, -2)    // 紫色
	];

	// 将所有球体组添加到场景
	sphereGroups.forEach(group => scene.add(group));

	const riggedSimple = assets.get("rigged-simple");
	riggedSimple.scene.scale.multiplyScalar(0.2);
	actors.add(riggedSimple.scene);

	const animationMixer = new AnimationMixer(riggedSimple.scene);
	const action = animationMixer.clipAction(riggedSimple.animations[0]);
	action.play();

	const step = 2.0 * Math.PI / actors.children.length;
	const radius = 3.0;
	let angle = 3.5;

	for (const mesh of actors.children) {

		// Arrange the objects in a circle.
		mesh.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
		angle += step;

	}

	// Post Processing

	OverrideMaterialManager.workaroundEnabled = true;
	const multisampling = Math.min(4, renderer.capabilities.maxSamples);

	const composer = new EffectComposer(renderer, { multisampling });

	// 创建五个不同颜色的轮廓效果
	const outlineEffects = [
		new OutlineEffect(scene, camera, {
			blendFunction: BlendFunction.SCREEN,
			patternScale: 40,
			visibleEdgeColor: 0xff0000,
			hiddenEdgeColor: 0x550000,
			resolutionScale: 0.75,
			blur: true,
			xRay: true,
			multisampling
		}),
		new OutlineEffect(scene, camera, {
			blendFunction: BlendFunction.SCREEN,
			patternScale: 40,
			visibleEdgeColor: 0x00ff00,
			hiddenEdgeColor: 0x005500,
			resolutionScale: 0.75,
			blur: true,
			xRay: true,
			multisampling
		}),
		new OutlineEffect(scene, camera, {
			blendFunction: BlendFunction.SCREEN,
			patternScale: 40,
			visibleEdgeColor: 0x0000ff,
			hiddenEdgeColor: 0x000055,
			resolutionScale: 0.75,
			blur: true,
			xRay: true,
			multisampling
		}),
		new OutlineEffect(scene, camera, {
			blendFunction: BlendFunction.SCREEN,
			patternScale: 40,
			visibleEdgeColor: 0xffff00,
			hiddenEdgeColor: 0x555500,
			resolutionScale: 0.75,
			blur: true,
			xRay: true,
			multisampling
		}),
		new OutlineEffect(scene, camera, {
			blendFunction: BlendFunction.SCREEN,
			patternScale: 40,
			visibleEdgeColor: 0xff00ff,
			hiddenEdgeColor: 0x550055,
			resolutionScale: 0.75,
			blur: true,
			xRay: true,
			multisampling
		})
	];

	// 将每个球体添加到对应的轮廓效果中
	sphereGroups.forEach((group, index) => {
		group.children.forEach(sphere => {
			outlineEffects[index].selection.add(sphere);
		});
	});

	// 添加基本渲染通道
	composer.addPass(new RenderPass(scene, camera));

	// 添加所有轮廓效果到一个通道中
	composer.addPass(new EffectPass(camera, ...outlineEffects));
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
		const intersects = raycaster.intersectObjects(scene.children, true);

		if (intersects.length > 0) {
			// 找到点击的对象
			const object = intersects[0].object;

			// 查找对象所属的组
			let groupIndex = -1;

			sphereGroups.forEach((group, index) => {
				if (group.children.includes(object)) {
					groupIndex = index;
				}
			});

			// 如果找到了组，切换该组中所有球体的选择状态
			if (groupIndex >= 0) {
				const group = sphereGroups[groupIndex];
				const effect = outlineEffects[groupIndex];

				// 检查第一个球体是否已被选中
				const firstSphere = group.children[0];
				const isSelected = effect.selection.has(firstSphere);

				// 切换整个组的选择状态
				group.children.forEach(sphere => {
					if (isSelected) {
						effect.selection.delete(sphere);
					} else {
						effect.selection.add(sphere);
					}
				});
			} else {
				// 如果不是球体组中的对象，检查是否在原始actors中
				for (const effect of outlineEffects) {
					effect.selection.toggle(object);
				}
			}
		}
	});

	// Settings

	const fpsMeter = new FPSMeter();
	const color = new Color();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// 创建参数对象
	const params = {
		"patternTexture": false,
		"multisampling": true,
	};

	const folder = pane.addFolder({ title: "Settings" });

	// 为第一个轮廓效果添加控制
	folder.addBinding(outlineEffects[0].resolution, "scale", { label: "resolution", min: 0.5, max: 1, step: 0.05 });
	folder.addBinding(params, "multisampling")
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.multisampling = e.value ? multisampling : 0;
			});
		});
	folder.addBinding(outlineEffects[0].blurPass, "kernelSize", { options: KernelSize })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.blurPass.kernelSize = e.value;
			});
		});
	folder.addBinding(outlineEffects[0].blurPass, "enabled", { label: "blur" })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.blurPass.enabled = e.value;
			});
		});
	folder.addBinding(params, "patternTexture")
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.patternTexture = (e.value ? assets.get("pattern") : null);
			});
		});
	folder.addBinding(outlineEffects[0], "patternScale", { min: 20, max: 100, step: 0.1 })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.patternScale = e.value;
			});
		});
	folder.addBinding(outlineEffects[0], "edgeStrength", { min: 0, max: 10, step: 0.01 })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.edgeStrength = e.value;
			});
		});
	folder.addBinding(outlineEffects[0], "pulseSpeed", { min: 0, max: 2, step: 0.01 })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.pulseSpeed = e.value;
			});
		});
	folder.addBinding(outlineEffects[0], "xRay")
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.xRay = e.value;
			});
		});
	folder.addBinding(outlineEffects[0].blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.blendMode.opacity.value = e.value;
			});
		});
	folder.addBinding(outlineEffects[0].blendMode, "blendFunction", { options: BlendFunction })
		.on("change", (e) => {
			outlineEffects.forEach(effect => {
				effect.blendMode.blendFunction = e.value;
			});
		});

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

	let t0 = 0;

	requestAnimationFrame(function render(timestamp) {

		const deltaTime = timestamp - t0;
		t0 = timestamp;

		fpsMeter.update(timestamp);
		controls.update(timestamp);
		animationMixer.update(deltaTime * 1e-3);
		composer.render();
		requestAnimationFrame(render);

	});

}));
