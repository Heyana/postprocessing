import {
	AnimationMixer,
	AmbientLight,
	Color,
	CubeTextureLoader,
	DirectionalLight,
	GLTFLoader,
	HemisphereLight,
	Group,
	LoadingManager,
	Mesh,
	PerspectiveCamera,
	Raycaster,
	Scene,
	SphereGeometry,
	PlaneGeometry,
	MeshStandardMaterial,
	MeshBasicMaterial,
	ShaderMaterial,
	SRGBColorSpace,
	TextureLoader,
	Vector2,
	Vector3,
	VSMShadowMap,
	WebGLRenderer,
	RGBAFormat,
	RGFormat,
	RGBFormat,
	FloatType,
	LinearFilter
} from "run-scene-core";

import {
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	MRTRenderPass,
	ShaderPass,
	NormalPass,
	DepthPass
} from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Shapes from "../objects/Shapes";

// 自定义着色器，用于在屏幕上显示不同的渲染目标
// 这个版本会根据实际可用的通道动态设置
const createDisplayShader = (availableChannels = []) => ({
	uniforms: {
		// 为每个可能的通道创建uniform，但仅使用可用的通道
		"tColor": { value: null },
		"tNormal": { value: null },
		"tDepth": { value: null },
		"tWorldPos": { value: null },
		"tPBR": { value: null },
		"tRoughness": { value: null },
		"tMetalness": { value: null },
		"tAO": { value: null },
		"tMotion": { value: null },
		"tEmission": { value: null },
		"tID": { value: null },
		"tMask": { value: null },
		"tShadow": { value: null },
		"tVelocity": { value: null },
		"tCustom": { value: null },
		"tOriginal": { value: null },
		"displayMode": { value: 0 },
		"numChannels": { value: availableChannels.length || 1 },
		"splitView": { value: false }, // 是否使用分屏对比模式
		"splitPosition": { value: 0.5 } // 分屏位置(0-1)
	},
	vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
	fragmentShader: /* glsl */`
        precision highp float;
        
        uniform sampler2D tColor;
        uniform sampler2D tNormal;
        uniform sampler2D tDepth;
        uniform sampler2D tWorldPos;
        uniform sampler2D tPBR;
        uniform sampler2D tRoughness;
        uniform sampler2D tMetalness;
        uniform sampler2D tAO;
        uniform sampler2D tMotion;
        uniform sampler2D tEmission;
        uniform sampler2D tID;
        uniform sampler2D tMask;
        uniform sampler2D tShadow;
        uniform sampler2D tVelocity;
        uniform sampler2D tCustom;
        uniform sampler2D tOriginal;
        uniform int displayMode;
        uniform int numChannels;
        uniform bool splitView;
        uniform float splitPosition;
        varying vec2 vUv;

        // 辅助函数 - 返回纹理颜色
        vec4 getTexColor(sampler2D tex, vec2 uv) {
            return texture2D(tex, uv);
        }

        // 根据当前显示模式选择正确的纹理
        vec4 getTextureByMode(int mode, vec2 uv) {
            if(mode == 0) {
                // 颜色通道
                return getTexColor(tColor, uv);
            } else if(mode == 1) {
                // 法线通道
                return getTexColor(tNormal, uv);
            } else if(mode == 2) {
                // 深度通道
                return getTexColor(tDepth, uv);
            } else if(mode == 3) {
                // 世界位置通道
                return getTexColor(tWorldPos, uv);
            } else if(mode == 4) {
                // PBR属性通道
                return getTexColor(tPBR, uv);
            } else if(mode == 5) {
                // 粗糙度通道
                return getTexColor(tRoughness, uv);
            } else if(mode == 6) {
                // 金属度通道
                return getTexColor(tMetalness, uv);
            } else if(mode == 7) {
                // 环境光遮蔽通道
                return getTexColor(tAO, uv);
            } else if(mode == 8) {
                // 运动向量通道
                vec4 motionTex = getTexColor(tMotion, uv);
                return vec4(motionTex.rg * 0.5 + 0.5, 0.0, 1.0);
            } else if(mode == 9) {
                // 自发光通道
                return getTexColor(tEmission, uv);
            } else if(mode == 10) {
                // ID通道
                return getTexColor(tID, uv);
            } else if(mode == 12) {
                // 原始/正常画面通道
                return getTexColor(tOriginal, uv);
            } else {
                // 默认灰色
                return vec4(0.5, 0.5, 0.5, 1.0);
            }
        }

        void main() {
            if(splitView) {
                // 分屏对比模式 - 左侧显示原始渲染，右侧显示当前选择的通道
                if(vUv.x < splitPosition) {
                    // 左侧显示原始渲染
                    gl_FragColor = getTexColor(tOriginal, vUv);
                } else {
                    // 右侧显示当前选择的通道
                    gl_FragColor = getTextureByMode(displayMode, vUv);
                    
                    // 在分界线附近绘制一个细线
                    if(abs(vUv.x - splitPosition) < 0.002) {
                        gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
                    }
                }
            } else if(displayMode == 11) {
                // 多通道拼接显示 - 使用固定的2x4网格
                // 计算网格单元
                float cols = 4.0;
                float rows = 2.0;
                vec2 gridSize = vec2(cols, rows);
                vec2 gridUV = fract(vUv * gridSize);
                int gridX = int(vUv.x * cols);
                int gridY = int(vUv.y * rows);
                int index = int(gridY * int(cols)) + gridX;
                
                // 根据索引选择不同通道的纹理
                if(index == 0) {
                    gl_FragColor = getTexColor(tColor, gridUV);
                } else if(index == 1) {
                    gl_FragColor = getTexColor(tNormal, gridUV);
                } else if(index == 2) {
                    gl_FragColor = getTexColor(tDepth, gridUV);
                } else if(index == 3) {
                    gl_FragColor = getTexColor(tWorldPos, gridUV);
                } else if(index == 4) {
                    gl_FragColor = getTexColor(tPBR, gridUV);
                } else if(index == 5) {
                    vec4 motionTex = getTexColor(tMotion, gridUV);
                    gl_FragColor = vec4(motionTex.rg * 0.5 + 0.5, 0.0, 1.0);
                } else if(index == 6) {
                    gl_FragColor = getTexColor(tOriginal, gridUV);
                } else {
                    gl_FragColor = vec4(0.2, 0.2, 0.2, 1.0);
                }
                
                // 绘制网格线
                if(fract(vUv.x * cols) < 0.01 || fract(vUv.y * rows) < 0.01) {
                    gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
                }
            } else {
                // 单通道显示模式
                gl_FragColor = getTextureByMode(displayMode, vUv);
            }
        }
    `
});

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
		loadingManager.onError = (url) => reject(new Error(`加载失败: ${url}`));

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

// 创建各种材质的测试对象
function createTestObjects(scene) {

	// 创建地面
	const ground = new Mesh(
		new PlaneGeometry(20, 20, 20, 20),
		new MeshStandardMaterial({
			color: 0x999999,
			roughness: 0.8,
			metalness: 0.2
		})
	);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -1;
	ground.receiveShadow = true;
	scene.add(ground);

	// 创建材质球组
	const materialsGroup = new Group();

	// 创建不同材质的球体
	function createMaterialSphere(position, material) {

		const sphere = new Mesh(
			new SphereGeometry(0.5, 32, 32),
			material
		);
		sphere.position.copy(position);
		sphere.castShadow = sphere.receiveShadow = true;
		materialsGroup.add(sphere);
		return sphere;

	}

	// 金属球
	createMaterialSphere(
		new Vector3(-2.5, 0.5, 0),
		new MeshStandardMaterial({
			color: 0x3366cc,
			roughness: 0.1,
			metalness: 1.0
		})
	);

	// 粗糙球
	createMaterialSphere(
		new Vector3(-0.8, 0.5, 0),
		new MeshStandardMaterial({
			color: 0xcc3366,
			roughness: 0.9,
			metalness: 0.1
		})
	);

	// 光滑球
	createMaterialSphere(
		new Vector3(0.8, 0.5, 0),
		new MeshStandardMaterial({
			color: 0x33cc99,
			roughness: 0.2,
			metalness: 0.5
		})
	);

	// 玻璃球
	createMaterialSphere(
		new Vector3(2.5, 0.5, 0),
		new MeshStandardMaterial({
			color: 0xaaccff,
			roughness: 0.05,
			metalness: 0.2,
			transparent: true,
			opacity: 0.7
		})
	);

	// 添加一个发光的球体
	createMaterialSphere(
		new Vector3(0, 0.5, -2.5),
		new MeshStandardMaterial({
			color: 0xffaa22,
			roughness: 0.2,
			metalness: 0.3,
			emissive: 0xff5500,
			emissiveIntensity: 0.5
		})
	);

	// 添加一个金属度为1.0的蓝色模型在地面上
	createMaterialSphere(
		new Vector3(-2.5, 0, 2.5),
		new MeshStandardMaterial({
			color: 0x0066cc, // 蓝色
			roughness: 0.2,
			metalness: 1.0 // 金属度1.0
		})
	);

	// 添加一个粗糙度为1.0的黄色模型在地面上
	createMaterialSphere(
		new Vector3(0, 0, 2.5),
		new MeshStandardMaterial({
			color: 0xffcc00, // 黄色
			roughness: 1.0, // 粗糙度1.0
			metalness: 0.0
		})
	);

	// 添加一个自发光为1.0的红色模型在地面上
	createMaterialSphere(
		new Vector3(2.5, 0, 2.5),
		new MeshStandardMaterial({
			color: 0xff0000, // 红色
			roughness: 0.3,
			metalness: 0.2,
			emissive: 0xff0000, // 红色自发光
			emissiveIntensity: 1.0 // 自发光强度1.0
		})
	);

	scene.add(materialsGroup);
	return materialsGroup;

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
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
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
	const hemisphereLight = new HemisphereLight(0xffffbb, 0x080820, 1);
	scene.add(hemisphereLight);

	const directionalLight = new DirectionalLight(0xffffff, 1);
	directionalLight.position.set(5, 10, 7.5);
	directionalLight.castShadow = true;
	scene.add(directionalLight);

	// 添加测试对象
	const materialsGroup = createTestObjects(scene);

	// 添加模型
	const actors = new Group();
	const riggedSimple = assets.get("rigged-simple");
	riggedSimple.scene.scale.multiplyScalar(0.5);
	riggedSimple.scene.position.set(0, 0, 0);
	actors.add(riggedSimple.scene);
	scene.add(actors);

	// 添加动画
	const animationMixer = new AnimationMixer(riggedSimple.scene);
	const action = animationMixer.clipAction(riggedSimple.animations[0]);
	action.play();

	// 后处理设置
	const multisampling = Math.min(4, renderer.capabilities.maxSamples);

	// 创建标准EffectComposer
	const composer = new EffectComposer(renderer, { multisampling });

	// 创建MRT渲染通道，可以自定义需要的通道
	const mrtRenderPass = new MRTRenderPass(scene, camera, {
		channels: [
			MRTRenderPass.CHANNEL_COLOR, // 颜色通道
			MRTRenderPass.CHANNEL_NORMAL, // 法线通道
			MRTRenderPass.CHANNEL_DEPTH, // 深度通道
			MRTRenderPass.CHANNEL_ROUGHNESS, // 世界位置通道
			MRTRenderPass.CHANNEL_METALNESS, // PBR属性通道
			MRTRenderPass.CHANNEL_EMISSION, // 运动向量通道
			MRTRenderPass.CHANNEL_ORIGINAL, // 原始/正常画面通道 - 新增
			MRTRenderPass.CHANNEL_ID // 对象ID通道
			// 如果需要单独的材质属性，请使用下面的配置（最多8个通道）
			// MRTRenderPass.CHANNEL_ROUGHNESS,   // 粗糙度通道
			// MRTRenderPass.CHANNEL_METALNESS,   // 金属度通道
			// MRTRenderPass.CHANNEL_AO,          // 环境光遮蔽通道
		],
		formats: [
			// 颜色输出格式 - 使用RGBA确保兼容性
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter,
				colorSpace: SRGBColorSpace
			},
			// 法线输出格式 - 使用RGBA而非RGB增加兼容性
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			},
			// 深度输出格式
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			},
			// 世界位置输出格式
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			},
			// PBR属性输出格式
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			},
			// 运动向量输出格式 - 使用RGBA代替RG格式
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			},
			// 自发光输出格式
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			},
			// ID输出格式
			{
				format: RGBAFormat,
				type: FloatType,
				minFilter: LinearFilter,
				magFilter: LinearFilter
			}
		]
	});

	// 渲染标准视图的渲染通道

	// 创建一个自定义的着色器通道，用于显示不同的渲染目标
	const displayMaterial = new ShaderMaterial(createDisplayShader(mrtRenderPass.channels));
	const displayPass = new ShaderPass(displayMaterial);

	// 将MRT渲染通道添加到composer
	composer.addPass(mrtRenderPass);

	// 然后添加显示通道
	composer.addPass(displayPass);

	// 设置
	const fpsMeter = new FPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	// MRT设置面板
	const folder = pane.addFolder({ title: "多渲染目标设置" });

	// 创建参数对象
	const params = {
		"displayMode": 0,
		"rotateObjects": true,
		"multisampling": true,
		"splitView": false, // 新增：是否启用分屏对比模式
		"splitPosition": 0.5 // 新增：分屏位置
	};

	// 设置初始分屏参数
	displayMaterial.uniforms.splitView.value = params.splitView;
	displayMaterial.uniforms.splitPosition.value = params.splitPosition;

	// 使用空选项初始化显示模式选择（将在首次渲染后更新）
	folder.addBinding(params, "displayMode", {
		label: "显示通道",
		options: { "加载中...": 0 } // 初始只有一个占位选项
	}).on("change", (e) => {

		displayMaterial.uniforms.displayMode.value = e.value;

	});


	// 添加旋转控制
	folder.addBinding(params, "rotateObjects")
		.on("change", (e) => {
			// 这里不需要做什么，我们会在动画循环中使用这个参数
		});

	// 添加多重采样控制
	folder.addBinding(params, "multisampling")
		.on("change", (e) => {

			composer.multisampling = e.value ? multisampling : 0;

		});

	// 添加分屏对比模式控制
	folder.addBinding(params, "splitView", {
		label: "分屏对比模式"
	}).on("change", (e) => {

		displayMaterial.uniforms.splitView.value = e.value;

	});

	folder.addBinding(params, "splitPosition", {
		label: "分界线位置",
		min: 0.1,
		max: 0.9,
		step: 0.01
	}).on("change", (e) => {

		displayMaterial.uniforms.splitPosition.value = e.value;

	});


	// 窗口大小调整处理
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
	let t0 = 0;
	let frameCount = 0;

	function animate(timestamp) {

		const deltaTime = timestamp - t0;
		t0 = timestamp;

		// 增加帧计数
		frameCount++;

		// 确保尺寸正确初始化 - 在前几帧手动触发重新调整大小
		if (frameCount < 5) {

			onResize();

		}

		fpsMeter.update(timestamp);
		controls.update(timestamp);
		animationMixer.update(deltaTime * 1e-3);

		// 如果启用了旋转，则旋转材质球组
		if (params.rotateObjects) {

			materialsGroup.rotation.y += 0.005;

		}

		// 检查MRT缓冲区是否正确初始化
		let bufferStatus = "MRT缓冲区:";
		if (mrtRenderPass.buffers) {

			bufferStatus += ` 数量=${mrtRenderPass.buffers.length}`;

			// 只在调试时输出一次所有纹理信息
			if (frameCount === 10) {

				for (let i = 0; i < mrtRenderPass.buffers.length; i++) {

				}

			}

		} else {

			bufferStatus += " 未初始化";

		}

		// 只在初始帧输出状态信息
		if (frameCount <= 10) {

			console.log(bufferStatus);

		}

		// 更新MRT渲染通道的结果给显示着色器
		if (mrtRenderPass.buffers && mrtRenderPass.buffers.length > 0) {

			// 获取可用的通道列表
			const availableChannels = mrtRenderPass.getAvailableChannels();

			// 为所有可能的通道设置纹理（不可用的将保持为null）
			const channelMapping = {
				[MRTRenderPass.CHANNEL_COLOR]: "tColor",
				[MRTRenderPass.CHANNEL_NORMAL]: "tNormal",
				[MRTRenderPass.CHANNEL_DEPTH]: "tDepth",
				[MRTRenderPass.CHANNEL_POSITION]: "tWorldPos",
				[MRTRenderPass.CHANNEL_PBR]: "tPBR",
				[MRTRenderPass.CHANNEL_ROUGHNESS]: "tRoughness",
				[MRTRenderPass.CHANNEL_METALNESS]: "tMetalness",
				[MRTRenderPass.CHANNEL_AO]: "tAO",
				[MRTRenderPass.CHANNEL_MOTION]: "tMotion",
				[MRTRenderPass.CHANNEL_EMISSION]: "tEmission",
				[MRTRenderPass.CHANNEL_ID]: "tID",
				[MRTRenderPass.CHANNEL_MASK]: "tMask",
				[MRTRenderPass.CHANNEL_SHADOW]: "tShadow",
				[MRTRenderPass.CHANNEL_VELOCITY]: "tVelocity",
				[MRTRenderPass.CHANNEL_CUSTOM]: "tCustom",
				[MRTRenderPass.CHANNEL_ORIGINAL]: "tOriginal"
			};

			// 首先清空所有纹理
			Object.values(channelMapping).forEach(uniformName => {

				displayMaterial.uniforms[uniformName].value = null;

			});

			// 然后设置可用的纹理
			availableChannels.forEach(channelType => {

				const uniformName = channelMapping[channelType];
				if (uniformName && displayMaterial.uniforms[uniformName]) {

					displayMaterial.uniforms[uniformName].value =
						mrtRenderPass.getChannelTexture(channelType);

				}

			});

			// 输出可用通道信息
			if (frameCount === 20) {

				console.log("可用的渲染通道:", availableChannels);

				// 根据通道数更新UI选项
				updateDisplayModeOptions(availableChannels);

			}

		}

		// 渲染
		try {

			composer.render();

		} catch (e) {

			if (frameCount % 60 === 0) { // 限制错误日志频率

				console.error("渲染错误:", e);

			}

		}

		requestAnimationFrame(animate);

	}

	// 根据可用通道更新UI显示选项
	function updateDisplayModeOptions(availableChannels) {

		// 创建一个新的选项对象，格式为 {标签: 值}
		const newOptions = {};

		// 通道映射 - 通道类型到显示模式索引
		const channelModeMap = {
			[MRTRenderPass.CHANNEL_COLOR]: 0,
			[MRTRenderPass.CHANNEL_NORMAL]: 1,
			[MRTRenderPass.CHANNEL_DEPTH]: 2,
			[MRTRenderPass.CHANNEL_POSITION]: 3,
			[MRTRenderPass.CHANNEL_PBR]: 4,
			[MRTRenderPass.CHANNEL_ROUGHNESS]: 5,
			[MRTRenderPass.CHANNEL_METALNESS]: 6,
			[MRTRenderPass.CHANNEL_AO]: 7,
			[MRTRenderPass.CHANNEL_MOTION]: 8,
			[MRTRenderPass.CHANNEL_EMISSION]: 9,
			[MRTRenderPass.CHANNEL_ID]: 10,
			[MRTRenderPass.CHANNEL_ORIGINAL]: 12
		};

		// 通道显示名称映射
		const channelDisplayNames = {
			[MRTRenderPass.CHANNEL_COLOR]: "颜色",
			[MRTRenderPass.CHANNEL_NORMAL]: "法线",
			[MRTRenderPass.CHANNEL_DEPTH]: "深度",
			[MRTRenderPass.CHANNEL_POSITION]: "世界位置",
			[MRTRenderPass.CHANNEL_PBR]: "PBR属性",
			[MRTRenderPass.CHANNEL_ROUGHNESS]: "粗糙度",
			[MRTRenderPass.CHANNEL_METALNESS]: "金属度",
			[MRTRenderPass.CHANNEL_AO]: "环境光遮蔽",
			[MRTRenderPass.CHANNEL_MOTION]: "运动向量",
			[MRTRenderPass.CHANNEL_EMISSION]: "自发光",
			[MRTRenderPass.CHANNEL_ID]: "对象ID",
			[MRTRenderPass.CHANNEL_MASK]: "遮罩",
			[MRTRenderPass.CHANNEL_SHADOW]: "阴影",
			[MRTRenderPass.CHANNEL_VELOCITY]: "速度向量",
			[MRTRenderPass.CHANNEL_CUSTOM]: "自定义",
			[MRTRenderPass.CHANNEL_ORIGINAL]: "原始画面"
		};

		// 为每个可用通道添加选项
		availableChannels.forEach(channelType => {

			if (channelType in channelModeMap) {

				const displayName = channelDisplayNames[channelType] || `通道${channelType}`;
				newOptions[displayName] = channelModeMap[channelType];

			}

		});

		// 总是添加"全部通道"选项
		newOptions["全部通道"] = 11; // 对应着色器中的多通道视图模式

		// 确保"原始画面"选项存在
		if (availableChannels.includes(MRTRenderPass.CHANNEL_ORIGINAL)) {

			newOptions["原始画面"] = channelModeMap[MRTRenderPass.CHANNEL_ORIGINAL];

		}

		// 查找显示模式控件
		const binding = folder.children.find(child =>
			child.label === "显示通道" || child.label === "displayMode");

		if (binding) {

			// 存储当前选择的值
			const currentValue = params.displayMode;

			try {

				// 创建控件的完整配置对象
				const config = {
					label: binding.label,
					options: newOptions
				};

				// 移除旧控件
				folder.remove(binding);

				// 创建新控件
				const newBinding = folder.addBinding(params, "displayMode", config);

				// 如果当前值不在新选项中，重置为第一个选项
				if (!Object.values(newOptions).includes(currentValue)) {

					params.displayMode = Object.values(newOptions)[0];

				}

				// 确保着色器uniform值更新
				displayMaterial.uniforms.displayMode.value = params.displayMode;

				// 添加change事件监听器
				newBinding.on("change", (e) => {

					displayMaterial.uniforms.displayMode.value = e.value;

				});

			} catch (e) {

				console.error("更新显示模式选项时出错:", e);

			}

		}

	}

	requestAnimationFrame(animate);

}));
