import {
	PerspectiveCamera,
	Scene,
	WebGLRenderer,
	Mesh,
	BoxGeometry,
	DirectionalLight,
	AmbientLight,
	CubeTextureLoader,
	TextureLoader,
	Clock,
	Vector3,
	PlaneGeometry,
	DoubleSide,
	MeshStandardMaterial,
	BufferGeometry,
	RepeatWrapping
} from "three";

import {
	InteriorMappingMaterial
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 加载纹理
function loadTextures() {

	return new Promise((resolve) => {

		const cubeTextureLoader = new CubeTextureLoader();
		const textureLoader = new TextureLoader();
		const textures = {};

		// 尝试加载立方体贴图
		cubeTextureLoader.setPath(document.baseURI + "img/textures/skies/sunset/")
			.load(
				["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"],
				(roomCube) => {

					textures.roomCube = roomCube;
					checkAllLoaded();

				},
				undefined, // 进度回调
				() => {

					console.log("无法加载房间立方体贴图，使用替代纹理");
					checkAllLoaded(); // 即使加载失败也继续

				}
			);

		// 加载单张图片立方体贴图
		textureLoader.load(
			document.baseURI + "img/InteriorMappingMaterial/map.png",
			(roomMap) => {

				textures.roomMap = roomMap;
				// 确保贴图重复
				roomMap.wrapS = roomMap.wrapT = RepeatWrapping;
				checkAllLoaded();

			},
			undefined, // 进度回调
			() => {

				console.log("无法加载单张图片立方体贴图");
				checkAllLoaded(); // 即使加载失败也继续

			}
		);

		// 检查是否所有纹理已加载完成
		let loadedCount = 0;
		function checkAllLoaded() {

			loadedCount++;
			if (loadedCount >= 2) { // 两种纹理都尝试加载完成

				resolve(textures);

			}

		}

	});

}

// 演示状态
const demoState = {
	rotatePlane: false, // 默认开启旋转，以便演示侧面效果
	useObjectSpace: true,
	useSingleTexture: true,
	fillFace: true,
	roomScale: 1.0,
	roomVariety: 0.8, // 增加默认的房间变化程度，让房间更有区别
	roomDepth: 0.02, // 保持较小的值，避免异常球形
	visualDepth: 1.2, // 新增视觉深度参数，控制深度感
	roomAspect: 1.5, // 调整默认纵横比，以获得更好的视觉效果
	flipTextureY: true, // 默认在着色器中翻转贴图Y轴，不需要设置flipY=false
	roomsX: 2, // 默认横向2个房间
	roomsY: 3, // 默认纵向3个房间
	gapSize: 0.0, // 默认间隔大小为0，不显示间隔
	gapColor: "#222222", // 默认间隔颜色
	glassStrength: 0.3, // 默认前景玻璃反射强度
	glassColor: "#AADDFF", // 默认前景玻璃颜色 - 更亮的蓝色
	glassBlurStrength: 0.0, // 默认玻璃模糊强度为0，不模糊
	enhancedDepth: false // 默认不启用增强深度模式
};

// 存储初始颜色的标准化值
const initialGlassColor = "#AADDFF";

// 创建演示场景
function createScene(textures) {

	const scene = new Scene();

	// 添加灯光
	const directionalLight = new DirectionalLight(0xffffff, 2.0); // 增强光照
	directionalLight.position.set(0.5, 0.7, 0.5).normalize();
	scene.add(directionalLight);
	directionalLight.intensity = 10;
	const ambientLight = new AmbientLight(0x404040, 0.5);
	ambientLight.intensity = 10;
	scene.add(ambientLight);

	// 创建平面几何体
	const planeGeometry = new PlaneGeometry(10, 10, 1, 1); // 增大平面尺寸

	// 为几何体计算切线
	planeGeometry.computeTangents();

	const material = new InteriorMappingMaterial({
		useObjectSpace: demoState.useObjectSpace,
		roomScale: demoState.roomScale,
		roomVariety: demoState.roomVariety,
		fillFace: demoState.fillFace,
		roomDepth: demoState.roomDepth,
		visualDepth: demoState.visualDepth,
		roomAspect: demoState.roomAspect,
		flipTextureY: demoState.flipTextureY,
		roomsX: demoState.roomsX,
		roomsY: demoState.roomsY,
		gapSize: demoState.gapSize,
		gapColor: demoState.gapColor,
		glassStrength: demoState.glassStrength,
		glassColor: demoState.glassColor,
		glassBlurStrength: demoState.glassBlurStrength,
		enhancedDepth: demoState.enhancedDepth
	});

	// 根据默认状态设置纹理
	if (demoState.useSingleTexture && textures.roomMap) {

		material.roomMap = textures.roomMap;

	} else if (textures.roomCube) {

		material.roomCube = textures.roomCube;

	}

	const plane = new Mesh(planeGeometry, material);
	plane.position.y = 5; // 稍微提高位置
	scene.add(plane);

	// 添加简单的地面 - 扩大地面尺寸
	const groundGeometry = new PlaneGeometry(40, 40);
	const groundMaterial = new MeshStandardMaterial({
		color: 0x333333,
		roughness: 0.9,
		metalness: 0.1,
		side: DoubleSide
	});
	const ground = new Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = 0;
	scene.add(ground);

	return { scene, plane };

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
		container.prepend(renderer.domElement);

		// 相机和控制器 - 调整位置更好地查看平面
		const camera = new PerspectiveCamera();
		const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
		const settings = controls.settings;
		settings.general.mode = ControlMode.THIRD_PERSON;
		settings.translation.enabled = true;
		controls.position.set(0, 5, 15); // 稍微提高相机高度，增加距离
		controls.lookAt(0, 5, 0);

		// 创建场景
		const { scene, plane } = createScene(textures); // 使用plane而不是building

		// 设置时钟
		const clock = new Clock();

		// 配置GUI控制面板
		const fpsMeter = new FPSMeter();
		const pane = new Pane({ container: container.querySelector(".tp") });
		pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

		// 添加旋转平面选项
		pane.addBinding(demoState, "rotatePlane", {
			label: "旋转平面"
		}).on("change", (event) => {

			// 当用户关闭旋转时，重置平面旋转到正面
			if (!event.value) {

				plane.rotation.y = 0;

			}

		});

		const folder = pane.addFolder({ title: "室内映射材质参数" });

		// 修复：使用demoState中的useObjectSpace属性
		folder.addBinding(demoState, "useObjectSpace", {
			label: "使用对象空间"
		}).on("change", (event) => {

			plane.material.useObjectSpace = event.value; // 更改为plane

		});

		// 添加贴图类型切换选项
		folder.addBinding(demoState, "useSingleTexture", {
			label: "使用单张贴图"
		}).on("change", (event) => {

			if (event.value) {

				plane.material.roomCube = null; // 更改为plane
				plane.material.roomMap = textures.roomMap;

			} else {

				plane.material.roomCube = textures.roomCube;

			}

		});

		// 添加填满面模式切换选项
		folder.addBinding(demoState, "fillFace", {
			label: "填满整个面"
		}).on("change", (event) => {

			plane.material.fillFace = event.value; // 更改为plane

		});

		folder.addBinding(demoState, "roomScale", {
			label: "房间尺寸",
			min: 0.01,
			max: 3.0,
			step: 0.01
		}).on("change", (event) => {

			console.log("Log-- ", event.value, "event.value");
			plane.material.roomScale = event.value; // 更改为plane

		});

		folder.addBinding(demoState, "roomVariety", {
			label: "房间变化程度",
			min: 0,
			max: 1.0,
			step: 0.05
		}).on("change", (event) => {

			plane.material.roomVariety = event.value; // 更改为plane

		});

		// 在GUI中添加房间深度控制滑块
		folder.addBinding(demoState, "roomDepth", {
			label: "房间深度(数学)",
			min: 0.01,
			max: 0.1,
			step: 0.01
		}).on("change", (event) => {

			plane.material.roomDepth = event.value;

		});

		// 在GUI中添加房间视觉深度控制滑块
		folder.addBinding(demoState, "visualDepth", {
			label: "房间深度(视觉)",
			min: 0.01,
			max: 2.5,
			step: 0.01
		}).on("change", (event) => {

			plane.material.visualDepth = event.value;

		});

		// 在GUI中添加房间纵横比控制滑块
		folder.addBinding(demoState, "roomAspect", {
			label: "房间纵横比",
			min: 0.5,
			max: 2.0,
			step: 0.1
		}).on("change", (event) => {

			plane.material.roomAspect = event.value;

		});

		// 添加贴图Y轴翻转控制选项
		folder.addBinding(demoState, "flipTextureY", {
			label: "贴图Y轴翻转"
		}).on("change", (event) => {

			plane.material.flipTextureY = event.value;

		});

		// 添加增强深度模式选项
		folder.addBinding(demoState, "enhancedDepth", {
			label: "增强深度模式"
		}).on("change", (event) => {

			plane.material.enhancedDepth = event.value;

			// 如果启用增强深度模式，自动调整房间深度为更合适的值
			if (event.value && demoState.roomDepth < 0.3) {

				demoState.roomDepth = 0.5; // 设置为标准深度
				plane.material.roomDepth = 0.5;
				pane.refresh(); // 刷新GUI显示

			}

			// 如果启用增强深度，并且当前是填充面模式，提示用户
			if (event.value && plane.material.fillFace) {

				console.warn("增强深度模式与填充面模式不兼容，建议关闭填充面模式以获得最佳效果");

			}

		});

		// 增加说明提示
		folder.addBinding({
			enhancedDepthInfo: "增强深度模式在roomDepth=0.5时效果最佳，<0.5更深，>0.5更浅"
		}, "enhancedDepthInfo", {
			label: "增强深度说明",
			readonly: true
		});

		// 添加房间布局控制选项
		const roomLayoutFolder = pane.addFolder({ title: "房间布局设置" });

		// 添加横向房间数量控制
		roomLayoutFolder.addBinding(demoState, "roomsX", {
			label: "横向房间数",
			min: 1,
			max: 10,
			step: 1
		}).on("change", (event) => {

			plane.material.roomsX = event.value;

		});

		// 添加纵向房间数量控制
		roomLayoutFolder.addBinding(demoState, "roomsY", {
			label: "纵向房间数",
			min: 1,
			max: 10,
			step: 1
		}).on("change", (event) => {

			plane.material.roomsY = event.value;

		});

		// 添加间隔大小控制
		roomLayoutFolder.addBinding(demoState, "gapSize", {
			label: "间隔大小",
			min: 0,
			max: 0.3, // 减小最大值，避免间隔过大
			step: 0.01
		}).on("change", (event) => {

			plane.material.gapSize = event.value;

		});

		// 添加间隔颜色控制
		roomLayoutFolder.addBinding(demoState, "gapColor", {
			label: "间隔颜色",
			view: "color"
		}).on("change", (event) => {

			plane.material.gapColor = event.value;

		});

		// 添加玻璃效果控制选项
		const glassEffectFolder = pane.addFolder({ title: "玻璃效果设置" });

		// 添加玻璃反射强度控制
		glassEffectFolder.addBinding(demoState, "glassStrength", {
			label: "玻璃反射强度",
			min: 0.0,
			max: 1.0,
			step: 0.01
		}).on("change", (event) => {

			plane.material.glassStrength = event.value;

		});

		// 添加玻璃模糊强度控制
		glassEffectFolder.addBinding(demoState, "glassBlurStrength", {
			label: "玻璃模糊强度",
			min: 0.0,
			max: 1.0,
			step: 0.01
		}).on("change", (event) => {

			plane.material.glassBlurStrength = event.value;

		});

		// 添加玻璃颜色控制
		glassEffectFolder.addBinding(demoState, "glassColor", {
			label: "玻璃颜色",
			view: "color"
		}).on("change", (event) => {

			// 标准化处理颜色值
			const color = event.value;
			plane.material.glassColor = color;

			// 强制更新材质的uniforms
			plane.material.needsUpdate = true;

		});

		// 添加重置玻璃颜色按钮
		glassEffectFolder.addButton({
			title: "重置为默认颜色"
		}).on("click", () => {

			// 重置为初始值
			demoState.glassColor = initialGlassColor;
			plane.material.glassColor = initialGlassColor;
			plane.material.needsUpdate = true;
			// 通知GUI更新
			pane.refresh();

		});

		// 在玻璃控制区添加提示文本
		glassEffectFolder.addBinding({
			info: "注意: 建议选择较亮的颜色作为玻璃颜色以获得最佳效果"
		}, "info", {
			label: "提示",
			readonly: true
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

			// 如果需要演示旋转平面
			if (demoState.rotatePlane) {

				const time = clock.getElapsedTime();
				plane.rotation.y = time * 0.2; // 保持缓慢旋转

			}

			// 更新平面模型的矩阵
			plane.updateMatrixWorld(); // 更改为plane

			// 更新材质
			plane.material.update(deltaTime); // 更改为plane

			renderer.render(scene, camera);
			requestAnimationFrame(render);

		}

		window.addEventListener("resize", onResize);
		onResize();
		requestAnimationFrame(render);

	});

});
