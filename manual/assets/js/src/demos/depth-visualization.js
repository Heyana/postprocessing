import {
    AnimationMixer,
    BoxGeometry,
    Color,
    CubeTextureLoader,
    CylinderGeometry,
    GLTFLoader,
    Group,
    LoadingManager,
    Mesh,
    MeshStandardMaterial,
    OrthographicCamera,
    PerspectiveCamera,
    PlaneGeometry,
    Raycaster,
    Scene,
    ShaderMaterial,
    SphereGeometry,
    SRGBColorSpace,
    TextureLoader,
    TorusKnotGeometry,
    Vector2,
    VSMShadowMap,
    WebGLRenderer,
    WebGLRenderTarget
} from "three";

import {
    EffectComposer,
    EffectPass,
    RenderPass,
    SelectiveSSAOEffect,
    Selection,
    ShaderPass
} from "postprocessing";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import * as Shapes from "../objects/Shapes";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 简单的深度可视化着色器
const DepthVisualizer = {
    uniforms: {
        "tDiffuse": { value: null },
        "cameraNear": { value: 0.1 },
        "cameraFar": { value: 100 },
    },
    vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
    fragmentShader: `
		uniform sampler2D tDiffuse;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;
		
		float linearizeDepth(float depth) {
			float z = depth * 2.0 - 1.0; // 转换到 NDC
			return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
		}
		
		void main() {
			float depth = texture2D(tDiffuse, vUv).r;
			float linearDepth = linearizeDepth(depth) / cameraFar;
			gl_FragColor = vec4(vec3(linearDepth), 1.0);
		}
	`
};

// 深度对比可视化着色器
const DepthCompareVisualizer = {
    uniforms: {
        "depthBuffer0": { value: null },
        "depthBuffer1": { value: null },
        "maskTexture": { value: null },
        "cameraNear": { value: 0.1 },
        "cameraFar": { value: 100 },
        "visualizationMode": { value: 0 }
    },
    vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
    fragmentShader: `
		uniform sampler2D depthBuffer0;
		uniform sampler2D depthBuffer1;
		uniform sampler2D maskTexture;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform int visualizationMode;
		varying vec2 vUv;
		
		float linearizeDepth(float depth) {
			float z = depth * 2.0 - 1.0;
			return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
		}
		
		void main() {
			float depth0 = texture2D(depthBuffer0, vUv).r;
			float depth1 = texture2D(depthBuffer1, vUv).r;
			float mask = texture2D(maskTexture, vUv).r;
			
			float linearDepth0 = linearizeDepth(depth0) / cameraFar;
			float linearDepth1 = linearizeDepth(depth1) / cameraFar;
			
			// 显示模式选择
			if (visualizationMode == 0) {
				// 全局深度图
				gl_FragColor = vec4(vec3(linearDepth0), 1.0);
			} else if (visualizationMode == 1) {
				// 选定层深度图
				gl_FragColor = vec4(vec3(linearDepth1), 1.0);
			} else if (visualizationMode == 2) {
				// 遮罩可视化
				gl_FragColor = vec4(vec3(mask), 1.0);
			} else if (visualizationMode == 3) {
				// 深度差异可视化
				float diff = abs(linearDepth0 - linearDepth1);
				gl_FragColor = vec4(diff * 10.0, 0.0, 0.0, 1.0);
			} else if (visualizationMode == 4) {
				// 彩色深度图0
				vec3 color0 = vec3(
					smoothstep(0.0, 0.3, linearDepth0),
					smoothstep(0.3, 0.6, linearDepth0),
					smoothstep(0.6, 1.0, linearDepth0)
				);
				gl_FragColor = vec4(color0, 1.0);
			} else if (visualizationMode == 5) {
				// 彩色深度图1
				vec3 color1 = vec3(
					smoothstep(0.0, 0.3, linearDepth1),
					smoothstep(0.3, 0.6, linearDepth1),
					smoothstep(0.6, 1.0, linearDepth1)
				);
				gl_FragColor = vec4(color1, 1.0);
			} else if (visualizationMode == 6) {
				// 深度0和深度1对比（分屏）
				vec3 color;
				if (vUv.x < 0.5) {
					color = vec3(linearDepth0);
				} else {
					color = vec3(linearDepth1);
				}
				gl_FragColor = vec4(color, 1.0);
			} else if (visualizationMode == 7) {
				// 深度0、深度1和遮罩合成可视化
				vec3 colorDepth0 = vec3(linearDepth0, 0.0, 0.0);
				vec3 colorDepth1 = vec3(0.0, linearDepth1, 0.0);
				vec3 colorMask = vec3(0.0, 0.0, mask);
				vec3 composite = colorDepth0 + colorDepth1 + colorMask;
				gl_FragColor = vec4(composite, 1.0);
			}
		}
	`
};

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

// 创建更适合展示深度对比的场景对象
function createTestObjects() {
    const group = new Group();

    // 1. 创建地台
    const platformSize = 6;
    const platformHeight = 0.2;
    const platform = new Mesh(
        new BoxGeometry(platformSize, platformHeight, platformSize),
        new MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8, metalness: 0.0 })
    );
    platform.position.y = -1.5;
    platform.receiveShadow = true;
    group.add(platform);

    // 2. 添加测试几何体，分配不同层
    // 柱体 - 默认层
    const cylinder = new Mesh(
        new CylinderGeometry(0.3, 0.3, 4, 20),
        new MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6, metalness: 0.0 })
    );
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, 0, 0);
    cylinder.castShadow = cylinder.receiveShadow = true;
    cylinder.name = "cylinder-default-layer";
    group.add(cylinder);

    // 球体 - 层1
    const sphere = new Mesh(
        new SphereGeometry(0.5, 32, 32),
        new MeshStandardMaterial({ color: 0xff5555, roughness: 0.5, metalness: 0.0 })
    );
    sphere.position.set(-1.5, 0, -1);
    sphere.castShadow = sphere.receiveShadow = true;
    sphere.name = "sphere-layer1";
    // sphere.layers.set(1);  // 设置为层1
    group.add(sphere);

    // 立方体 - 层2
    const cube = new Mesh(
        new BoxGeometry(0.8, 0.8, 0.8),
        new MeshStandardMaterial({ color: 0x5555ff, roughness: 0.5, metalness: 0.0 })
    );
    cube.position.set(1.5, 0, -1);
    cube.castShadow = cube.receiveShadow = true;
    cube.name = "cube-layer2";
    group.add(cube);

    // 环面结 - 层3
    const torusKnot = new Mesh(
        new TorusKnotGeometry(0.5, 0.2, 64, 16),
        new MeshStandardMaterial({ color: 0x55ff55, roughness: 0.3, metalness: 0.2 })
    );
    torusKnot.position.set(0, 0.7, 1.5);
    torusKnot.castShadow = torusKnot.receiveShadow = true;
    torusKnot.name = "torus-layer3";
    group.add(torusKnot);

    return group;
}

window.addEventListener("load", () => load().then((assets) => {
    // 渲染器
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: true
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
    controls.position.set(5, 3, 6);
    controls.lookAt(0, 0, 0);

    // 场景、灯光和对象
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加增强的灯光
    const lights = Shapes.createLights();
    scene.add(lights);

    // 添加测试对象
    const testObjects = createTestObjects();
    scene.add(testObjects);

    // 添加角色模型
    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.3);
    riggedSimple.scene.position.set(2, -1.5, -1);
    riggedSimple.scene.rotation.y = -Math.PI / 4;
    scene.add(riggedSimple.scene);

    // 设置动画
    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    // 后处理
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);
    const composer = new EffectComposer(renderer, { multisampling });

    // 添加基本渲染通道
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 创建SSAO效果，主要用于获取深度纹理
    const ssaoEffect = new SelectiveSSAOEffect(composer, camera, scene, {
        resolutionScale: 1.0,
        spp: 16,
        distance: 1.0,
        power: 2,
        bias: 0.001,
        samples: 8,
        rings: 4,
        color: new Color(0xff0000),
    });

    // 创建深度可视化着色器通道
    const depthVisualizerMaterial = new ShaderMaterial(DepthCompareVisualizer);
    const depthVisualizePass = new ShaderPass(depthVisualizerMaterial);
    composer.addPass(depthVisualizePass);

    // 为了显示效果，我们不添加SSAO效果通道
    // 只使用它来获取深度纹理

    // 创建四个渲染目标来显示深度图和结果
    const viewportWidth = container.clientWidth / 2;
    const viewportHeight = container.clientHeight / 2;


    // 创建深度可视化面板
    const depthViewerMaterial = new ShaderMaterial(DepthVisualizer);

    // 创建显示面板
    const viewPlane = new Mesh(
        new PlaneGeometry(1, 1),
        depthViewerMaterial
    );
    const orthoScene = new Scene();
    orthoScene.add(viewPlane);

    // 为四个视图区域创建渲染目标
    const renderTargets = [];
    for (let i = 0; i < 4; i++) {
        renderTargets.push(new WebGLRenderTarget(viewportWidth, viewportHeight));
    }

    // UI控制面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 深度可视化控制
    const depthSettings = {
        visualizationMode: 0,
        selectedLayer: 0,
        showComparison: true
    };

    const vizFolder = pane.addFolder({ title: "深度可视化设置" });

    // 添加可视化模式选择
    vizFolder.addBinding(depthSettings, "visualizationMode", {
        options: {
            "全局深度图": 0,
            "选定层深度图": 1,
            "遮罩可视化": 2,
            "深度差异": 3,
            "彩色深度图0": 4,
            "彩色深度图1": 5,
            "分屏对比": 6,
            "三合一可视化": 7
        },
        label: "可视化模式"
    }).on("change", (e) => {
        depthVisualizerMaterial.uniforms.visualizationMode.value = e.value;
    });


    // 添加说明文本
    vizFolder.addBinding({
        explanation: "此演示显示深度图的工作原理及其在SelectiveAOEffect中的应用"
    }, "explanation", {
        readonly: true,
        label: "说明"
    });

    // 调整大小处理
    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);

        // 更新深度可视化区域尺寸
        const viewportWidth = width / 2;
        const viewportHeight = height / 2;
        for (const rt of renderTargets) {
            rt.setSize(viewportWidth, viewportHeight);
        }
    }

    window.addEventListener("resize", onResize);
    onResize();

    // 渲染循环
    let t0 = 0;

    // 添加鼠标射线和忽略列表
    const raycaster = new Raycaster();
    const mouse = new Vector2();

    // 添加点击事件处理
    renderer.domElement.addEventListener('click', (event) => {
        // 计算鼠标位置的归一化设备坐标 (-1 到 +1)
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // 设置射线从相机发出经过鼠标位置
        raycaster.setFromCamera(mouse, camera);

        // 计算物体和射线的焦点
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            if (object.isMesh) {
                console.log('点击了模型:', object.name || '未命名模型');

                try {
                    // 检查对象是否在Selection中
                    if (ssaoEffect.ignoreSelection.has(object)) {
                        console.log('从忽略列表中移除模型');
                        // 从Selection中移除对象
                        ssaoEffect.ignoreSelection.delete(object);
                    } else {
                        console.log('添加模型到忽略列表');
                        // 添加对象到Selection
                        ssaoEffect.ignoreSelection.add(object);
                    }

                    console.log('Log-- ', ssaoEffect.ignoreSelection, ' ssaoEffect.ignoreSelection');
                    // 更新忽略计数
                    pane.refresh();
                } catch (error) {
                    console.error('处理Selection时出错:', error);
                }
            }
        }
    });

    function updateDepthTextures() {
        // 更新相机参数到着色器
        depthVisualizerMaterial.uniforms.cameraNear.value = camera.near;
        depthVisualizerMaterial.uniforms.cameraFar.value = camera.far;

        // 获取深度纹理
        if (ssaoEffect.aoPass && ssaoEffect.aoPass.fullscreenMaterial) {
            // 全局深度纹理
            const composerDepthTexture = composer.depthTexture;
            if (composerDepthTexture) {
                depthVisualizerMaterial.uniforms.depthBuffer0.value = composerDepthTexture;
            }

            // 选定层深度纹理
            if (ssaoEffect.depthPass && ssaoEffect.depthPass.renderTarget) {
                depthVisualizerMaterial.uniforms.depthBuffer1.value = ssaoEffect.depthPass.renderTarget.texture;
            }

            // 遮罩纹理
            if (ssaoEffect.renderTargetMask) {
                depthVisualizerMaterial.uniforms.maskTexture.value = ssaoEffect.renderTargetMask.texture;
            }
        }
    }

    requestAnimationFrame(function render(timestamp) {
        const deltaTime = timestamp - t0;
        t0 = timestamp;

        fpsMeter.update(timestamp);
        controls.update(timestamp);
        animationMixer.update(deltaTime * 1e-3);

        // 更新深度纹理到着色器
        updateDepthTextures();

        // 渲染主场景和深度可视化
        composer.render();

        requestAnimationFrame(render);
    });
}));
