import {
    RenderPass,
    ThreeCompatPass,
    EffectComposer,
    SSRPass, ReflectorForSSRPass,
    CopyPass,
    SelectiveBloomEffect,
    BrightnessContrastEffect,
    BlendFunction,
    EffectPass,
    EnhancedThreeCompatPass, SelectiveSSRPass
} from "postprocessing";
import {
    BoxGeometry,
    Color,
    ConeGeometry,
    CubeTextureLoader,
    Fog,
    GLTFLoader,
    Group,
    HemisphereLight,
    IcosahedronGeometry,
    LoadingManager,
    Mesh,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    Raycaster,
    Scene,
    SphereGeometry,
    SpotLight,
    SRGBColorSpace,
    TextureLoader,
    TorusGeometry,
    TorusKnotGeometry,
    Vector2,
    MeshPhongMaterial,
    VSMShadowMap,
    WebGLRenderer,
    NormalBlending,
    BasicDepthPacking
} from "run-scene-core";


// 直接获取VENDOR对象中需要的类

console.log('Log-- ', ReflectorForSSRPass, 'ReflectorForSSRPass');

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 全局参数设置
const params = {
    enableSSR: true,
    enableBloom: true,
    enableBrightnessContrast: true,
    autoRotate: false,
    otherMeshes: true,
    groundReflector: true,
    showHelpers: true
};

// 全局变量声明，提升作用域
let ssrPass = null; // 声明为全局变量，在try块中会赋值

// 加载资源
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
        let loadErrors = [];

        // 修改错误处理，不立即拒绝Promise
        loadingManager.onError = (url) => {
            console.warn(`Failed to load ${url}, continuing without it`);
            loadErrors.push(url);
        };

        loadingManager.onLoad = () => {
            // 即使有一些资源加载失败，我们也会继续
            if (loadErrors.length > 0) {
                console.warn(`Some resources failed to load: ${loadErrors.join(', ')}`);
            }
            resolve(assets);
        };



        // 环境贴图
        cubeTextureLoader.load(urls, (t) => {
            t.colorSpace = SRGBColorSpace;
            assets.set("sky", t);
        });
    });
}

// 创建额外的几何体对象（参考案例）
function createTestObjects() {
    const objects = new Group();
    objects.name = "testObjects";

    // 绿色立方体
    const boxGeometry = new BoxGeometry(0.05, 0.05, 0.05);
    const boxMaterial = new MeshStandardMaterial({
        color: 'green',
        roughness: 0.2,  // 降低粗糙度以增强反射
        metalness: 0.8,  // 保持金属度
        envMapIntensity: 1.5 // 增加环境贴图影响
    });
    const boxMesh = new Mesh(boxGeometry, boxMaterial);
    boxMesh.position.set(-0.12, 0.025, 0.015);
    boxMesh.castShadow = boxMesh.receiveShadow = true;
    objects.add(boxMesh);

    // 青色二十面体
    const icosaGeometry = new IcosahedronGeometry(0.025, 4);
    const icosaMaterial = new MeshStandardMaterial({
        color: 'cyan',
        roughness: 0.2,    // 保持粗糙度
        metalness: 0.8,    // 保持金属度
        envMapIntensity: 1.5 // 增加环境贴图影响
    });
    const icosaMesh = new Mesh(icosaGeometry, icosaMaterial);
    icosaMesh.position.set(-0.05, 0.025, 0.08);
    icosaMesh.castShadow = icosaMesh.receiveShadow = true;
    objects.add(icosaMesh);

    // 黄色圆锥
    const coneGeometry = new ConeGeometry(0.025, 0.05, 64);
    const coneMaterial = new MeshStandardMaterial({
        color: 'yellow',
        roughness: 0.2,    // 保持粗糙度
        metalness: 0.8,    // 保持金属度
        envMapIntensity: 1.5 // 增加环境贴图影响
    });
    const coneMesh = new Mesh(coneGeometry, coneMaterial);
    coneMesh.position.set(-0.05, 0.025, -0.055);
    coneMesh.castShadow = coneMesh.receiveShadow = true;
    objects.add(coneMesh);

    // 添加一组具有不同金属度和粗糙度的球体
    for (let i = 0; i < 5; i++) {
        const sphereGeometry = new SphereGeometry(0.025, 64, 64); // 增加细分提高精度
        // 根据SSRPass工作原理优化材质
        const sphereMaterial = new MeshStandardMaterial({
            color: new Color().setHSL(i / 5, 0.7, 0.5),
            // 降低金属度，增加环境贴图强度以提高亮度
            metalness: 0.7 + (i * 0.05),  // 0.7-0.9的金属度范围
            roughness: 0.1 + (i / 20),    // 保持原有粗糙度变化
            envMapIntensity: 2.0          // 大幅增加环境贴图影响
        });
        const sphereMesh = new Mesh(sphereGeometry, sphereMaterial);
        sphereMesh.position.set(0.1 + i * 0.06, 0.025, 0);
        sphereMesh.castShadow = sphereMesh.receiveShadow = true;
        objects.add(sphereMesh);
    }

    // 添加更多测试模型组
    createAdditionalModels(objects);

    return objects;
}

// 新增加的测试模型组
function createAdditionalModels(parent) {
    // ==== 添加一个金属环面 ====
    const torusGeometry = new TorusGeometry(0.03, 0.01, 16, 50);
    const torusMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.07
    });
    const torusMesh = new Mesh(torusGeometry, torusMaterial);
    torusMesh.position.set(-0.15, 0.05, -0.1);
    torusMesh.rotation.x = Math.PI / 4;
    torusMesh.castShadow = torusMesh.receiveShadow = true;
    parent.add(torusMesh);

    // ==== 添加一个半透明球体 ====
    const glassGeometry = new SphereGeometry(0.03, 64, 64);
    const glassMaterial = new MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.2,
        roughness: 0.1,
        transmission: 0.8,   // 稍微降低透明度
        thickness: 0.01,     // 增加材质厚度，提高可见度
        envMapIntensity: 1.0,
        clearcoat: 0.5,      // 降低清漆效果
        clearcoatRoughness: 0.2
    });
    const glassMesh = new Mesh(glassGeometry, glassMaterial);
    glassMesh.position.set(0.3, 0.05, -0.1);
    glassMesh.castShadow = true;
    glassMesh.receiveShadow = true;
    // 确保半透明物体不被包含在地面反射的特殊处理对象中
    parent.add(glassMesh);

    // ==== 添加一个金属材质立方体 ====
    const metalBoxGeometry = new BoxGeometry(0.05, 0.05, 0.05);
    const metalBoxMaterial = new MeshStandardMaterial({
        color: 0xC0C0C0,
        metalness: 1.0,
        roughness: 0.05,
        envMapIntensity: 1.0
    });
    const metalBoxMesh = new Mesh(metalBoxGeometry, metalBoxMaterial);
    metalBoxMesh.position.set(0.2, 0.025, 0.1);
    metalBoxMesh.rotation.y = Math.PI / 4;
    metalBoxMesh.castShadow = metalBoxMesh.receiveShadow = true;
    parent.add(metalBoxMesh);

    // ==== 添加一个扭曲的几何体 ====
    const twistedGeometry = new TorusKnotGeometry(0.02, 0.007, 50, 16);
    const twistedMaterial = new MeshStandardMaterial({
        color: 0xFF00FF,
        metalness: 0.8,
        roughness: 0.2,
    });
    const twistedMesh = new Mesh(twistedGeometry, twistedMaterial);
    twistedMesh.position.set(-0.2, 0.05, 0.1);
    twistedMesh.castShadow = twistedMesh.receiveShadow = true;
    parent.add(twistedMesh);
}

// 主程序入口
window.addEventListener("load", () => load().then((assets) => {
    // 渲染器设置
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: true
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    renderer.shadowMap.type = VSMShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.shadowMap.enabled = true;

    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 场景设置
    const scene = new Scene();
    scene.background = new Color(0x443333);
    scene.fog = new Fog(0x443333, 1, 4);

    // 加载环境贴图后，应用到场景
    if (assets.get("sky")) {
        scene.background = assets.get("sky");
        scene.environment = assets.get("sky"); // 添加环境贴图用于反射和照明
    }

    // 摄像机设置
    const camera = new PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 15);
    // camera.position.set(0, 0.2, 0.5);

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

    // 灯光设置
    const hemiLight = new HemisphereLight(0xffffff, 0x8d7c7c, 5); // 更亮的半球光
    scene.add(hemiLight);

    const spotLight = new SpotLight(0xffffff, 12); // 增加强度
    spotLight.position.set(-1, 1, 1);
    spotLight.angle = Math.PI / 16;
    spotLight.penumbra = 0.5;
    spotLight.castShadow = true;
    spotLight.shadow.bias = -0.0001;
    scene.add(spotLight);

    const plane = new Mesh(
        new PlaneGeometry(8, 8),
        new MeshPhongMaterial({ color: 0xcbcbcb })
    );
    plane.rotation.x = - Math.PI / 2;
    plane.position.y = - 0.0001;
    // plane.receiveShadow = true;
    scene.add(plane);

    // 创建ground reflector (如果ReflectorForSSRPass可用)
    let groundReflector = null;
    const selects = [];

    // 添加测试对象
    const testObjects = createTestObjects();
    scene.add(testObjects);

    // 添加点击交互所需的变量
    const raycaster = new Raycaster();
    const mouse = new Vector2();
    let selectedObjects = new Set(); // 使用Set存储已选择的对象

    // 添加点击事件处理
    function onMouseClick(event) {
        // 如果ssrPass未初始化，则不处理点击事件
        if (!ssrPass) {
            console.warn("SSR Pass尚未初始化，无法处理选择操作");
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

            // 切换选中状态
            if (selectedObjects.has(object)) {
                // 移除对象
                selectedObjects.delete(object);
                // 从SelectiveSSRPass的选择中移除
                ssrPass.selection.delete(object);

                // 恢复原始材质
                if (object._originalEmissive) {
                    object.material.emissive.copy(object._originalEmissive);
                }
            } else {
                // 添加对象
                selectedObjects.add(object);
                // 添加到SelectiveSSRPass的选择中
                ssrPass.selection.add(object);

                // 保存原始发光颜色并设置高亮
                if (!object._originalEmissive) {
                    object._originalEmissive = object.material.emissive.clone();
                }
                object.material.emissive.set(0x333333); // 添加微弱发光以指示选中
            }

            // 更新UI显示
            updateSelectionDisplay();
        }
    }

    if (ReflectorForSSRPass) {
        // 使用更大的反射平面
        const geometry = new PlaneGeometry(2, 2);
        groundReflector = new ReflectorForSSRPass(geometry, {
            clipBias: 0.0003,
            textureWidth: window.innerWidth,
            textureHeight: window.innerHeight,
            color: 0x888888,
            useDepthTexture: true,
        });
        groundReflector.material.depthWrite = false;
        groundReflector.rotation.x = - Math.PI / 2;
        groundReflector.visible = false;
        scene.add(groundReflector);

        console.log('Log-- ', groundReflector, 'groundReflector');
        // 注意：不要手动设置visible=true，让SSRPass内部控制其可见性
        // groundReflector在SSRPass内部渲染时会临时设置为可见，然后恢复为不可见
    } else {
        console.warn("ReflectorForSSRPass not available. Ground reflections disabled.");
        params.groundReflector = false;
    }

    // 后期处理设置
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);
    const composer = new EffectComposer(renderer, {
        multisampling: 8
    });

    // 确保创建深度纹理，以便所有效果共享
    // composer.createDepthTexture();

    // 使用EnhancedThreeCompatPass包装SSRPass
    let compatSSRPass = null;

    // 添加SelectiveBloom效果
    let bloomEffect = null;
    let bloomPass = null;

    // 添加BrightnessContrast效果
    let brightnessContrastEffect = null;
    let brightnessContrastPass = null;

    // 存储可选择的对象列表，用于Bloom效果
    let selectableObjects = new Set();

    // 初始化对象选择状态
    testObjects.children.forEach(object => {
        // 默认不选择任何对象用于bloom效果
        object._selectedForBloom = false;
        // 保存到可选对象列表
        selectableObjects.add(object);
    });

    // GUI控制面板设置
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    try {
        // 检查SelectiveSSRPass是否可用
        if (!SelectiveSSRPass) {
            throw new Error("SelectiveSSRPass is not available");
        }

        // 创建SelectiveSSRPass (替代原来的SSRPass)
        ssrPass = new SelectiveSSRPass({
            renderer,
            scene,
            camera,
            width: window.innerWidth,
            height: window.innerHeight,
            // encoding: renderer.outputColorSpace,
            groundReflector: params.groundReflector ? groundReflector : null,
            selectionLayer: 21 // 指定选择层
        });

        // 设置SSRPass的初始参数
        ssrPass.thickness = 0.035;        // 从0.001增加到0.035
        ssrPass.maxDistance = 0.08;       // 适当增加
        ssrPass.opacity = 0.75;           // 略微降低反射强度
        ssrPass.fresnel = true;           // 启用菲涅尔效应
        ssrPass.distanceAttenuation = true; // 启用距离衰减
        ssrPass.bouncing = false;         // 禁用多次反射，简化计算
        ssrPass.infiniteThick = false;    // 禁用无限厚度
        ssrPass.blur = true;              // 确保模糊开启

        // 添加SelectiveSSRPass特有的参数
        ssrPass.inverted = false;         // 不反转选择
        ssrPass.ignoreBackground = true;  // 忽略背景

        // 调整SSRPass的材质参数，解决白色条纹问题
        if (ssrPass.ssrMaterial) {
            // 调整SSR材质属性
            ssrPass.ssrMaterial.defines.MAX_STEP = Math.sqrt(window.innerWidth * window.innerWidth + window.innerHeight * window.innerHeight);
            ssrPass.ssrMaterial.uniforms['maxDistance'].value = 0.08;
            ssrPass.ssrMaterial.uniforms['thickness'].value = 0.035;
            // 重要：确保SSR材质更新
            ssrPass.ssrMaterial.needsUpdate = true;

            if (ssrPass.copyMaterial) {
                // 确保复制材质的混合模式正确
                ssrPass.copyMaterial.blending = NormalBlending;
                ssrPass.copyMaterial.needsUpdate = true;
            }

            // 打印材质状态用于调试
            console.log("SSR材质配置:", {
                maxDistance: ssrPass.ssrMaterial.uniforms['maxDistance'].value,
                thickness: ssrPass.ssrMaterial.uniforms['thickness'].value,
                MAX_STEP: ssrPass.ssrMaterial.defines.MAX_STEP,
                FRESNEL: ssrPass.ssrMaterial.defines.FRESNEL,
                INFINITE_THICK: ssrPass.ssrMaterial.defines.INFINITE_THICK
            });
        }

        // 使用EnhancedThreeCompatPass包装SSRPass
        compatSSRPass = new EnhancedThreeCompatPass(ssrPass, "SelectiveSSRPass", "ssr");
        compatSSRPass.enabled = params.enableSSR;

        // 确保SSRPass使用默认输出模式 (混合原始场景和反射)
        ssrPass.output = SSRPass.OUTPUT.Default;

        // 启用调试日志来跟踪问题
        compatSSRPass.setDebug(true);

        console.log("配置渲染通道：", {
            bloomPass,
            compatSSRPass,
            brightnessContrastPass
        });

        // 首先添加基本渲染Pass
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        // 创建并添加SelectiveBloom效果（在SSR之前）
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
        composer.addPass(bloomPass, 1);

        // 添加SSRPass（在Bloom之后）
        compatSSRPass.threePass.output = 0; // 确保使用默认输出模式
        composer.addPass(compatSSRPass);

        // 添加BrightnessContrast效果（在SSR之后）
        brightnessContrastEffect = new BrightnessContrastEffect({
            blendFunction: BlendFunction.NORMAL,
            brightness: 0.05,
            contrast: 0.1
        });
        brightnessContrastPass = new EffectPass(camera, brightnessContrastEffect);
        brightnessContrastPass.enabled = params.enableBrightnessContrast;
        composer.addPass(brightnessContrastPass);

        // 添加一个最终的CopyPass，确保结果正确显示
        // composer.addPass(new CopyPass());

        // SSR 控制面板设置
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

        // 添加模型选择列表（用于Bloom效果）



        // 添加重置按钮 - 使用正确的Tweakpane按钮API
        const resetBtn = folder.addButton({
            title: "重置效果设置"
        });

        resetBtn.on("click", () => {
            // 确保通过compatSSRPass访问内部的ssrPass
            const ssrPass = compatSSRPass.threePass;

            // 重置SSR设置为最佳效果
            ssrPass.thickness = 0.035;
            ssrPass.maxDistance = 0.08;
            ssrPass.opacity = 0.75;
            ssrPass.fresnel = true;
            ssrPass.distanceAttenuation = true;
            ssrPass.bouncing = false;
            ssrPass.infiniteThick = false;
            ssrPass.blur = true;

            if (groundReflector) {
                // 单独对Y轴进行操作，其他参数保持不变
                groundReflector.material.uniforms.textureMatrix.value.elements[5] = 1;
                groundReflector.material.uniformsNeedUpdate = true;

                // 重置反射平面旋转
                groundReflector.rotation.z = 0;

                // 重置控制参数
                reflectionParams.invertY = false;
                reflectionParams.flipReflector = false;
                reflectionParams.sphereEnhanced = true; // 保持球体增强为激活状态
                reflectionParams.curveSampling = true;  // 保持曲面优化为激活状态

                // 强制更新矩阵
                if (groundReflector.updateMatrices) {
                    groundReflector.updateMatrices();
                }
            }

            // 更新球体材质
            const spheres = [];
            testObjects.children.forEach(child => {
                if (child.geometry instanceof SphereGeometry) {
                    spheres.push(child);
                }
            });

            // 应用增强效果
            spheres.forEach((sphere, i) => {
                sphere.material.metalness = 1.0
                sphere.material.roughness = Math.max(0.05, 0.3 - i / 10);
            });

            // 更新控制面板
            pane.refresh();
        });

        folder.addBinding(params, "groundReflector", { label: "启用地面反射" })
            .on("change", (e) => {
                if (e.value) {
                    compatSSRPass.threePass.groundReflector = groundReflector;
                    // 使用当前的选择集合
                    compatSSRPass.threePass.selects = Array.from(selectedObjects);
                } else {
                    compatSSRPass.threePass.groundReflector = null;
                    // 保持当前的选择集合
                    compatSSRPass.threePass.selects = Array.from(selectedObjects);
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

        // 添加Bloom效果参数控制
        const bloomSettingsFolder = folder.addFolder({ title: "泛光参数" });

        bloomSettingsFolder.addBinding(bloomEffect, "intensity", {
            label: "强度",
            min: 0,
            max: 5,
            step: 0.1
        });

        bloomSettingsFolder.addBinding(bloomEffect.mipmapBlurPass, "radius", {
            label: "半径",
            min: 0,
            max: 1,
            step: 0.01
        });

        bloomSettingsFolder.addBinding(bloomEffect.luminanceMaterial, "threshold", {
            label: "亮度阈值",
            min: 0,
            max: 1,
            step: 0.01
        });

        bloomSettingsFolder.addBinding(bloomEffect.luminanceMaterial, "smoothing", {
            label: "平滑度",
            min: 0,
            max: 1,
            step: 0.01
        });

        // 添加亮度对比度参数控制
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

        // 添加反射质量调整说明
        settingsFolder.addBinding({ tip: "如果反射看起来不对，请尝试调整以下参数" }, "tip", {
            readonly: true,
            label: "提示"
        });

        // 添加反射方向控制
        const reflectionParams = {
            invertY: false,
            flipReflector: false,  // 翻转反射器选项
            sphereEnhanced: true,  // 球体增强反射选项
            curveSampling: true    // 新增：曲面采样优化选项
        };

        settingsFolder.addBinding(reflectionParams, "invertY", { label: "反转Y轴反射" })
            .on("change", (e) => {
                if (groundReflector) {
                    // 只修改Y轴缩放因子，保留其他变换
                    groundReflector.material.uniforms.textureMatrix.value.elements[5] = e.value ? -1 : 1;
                    groundReflector.material.uniformsNeedUpdate = true;

                    // 触发反射器更新
                    if (groundReflector.updateMatrices) {
                        groundReflector.updateMatrices();
                    }
                }
            });

        // 添加整个反射平面翻转选项
        settingsFolder.addBinding(reflectionParams, "flipReflector", { label: "翻转整个反射平面" })
            .on("change", (e) => {
                if (groundReflector) {
                    // 通过旋转反射平面实现反转
                    if (e.value) {
                        // 翻转反射平面
                        groundReflector.rotation.z = Math.PI;
                    } else {
                        // 恢复正常
                        groundReflector.rotation.z = 0;
                    }

                    // 强制更新
                    if (groundReflector.updateMatrices) {
                        groundReflector.updateMatrices();
                    }
                }
            });

        // 添加球体反射增强选项
        settingsFolder.addBinding(reflectionParams, "sphereEnhanced", { label: "球体反射增强" })
            .on("change", (e) => {
                // 获取所有球体
                const spheres = [];
                testObjects.children.forEach(child => {
                    if (child.geometry instanceof SphereGeometry) {
                        spheres.push(child);
                    }
                });

                // 更新球体的材质属性
                spheres.forEach((sphere, i) => {
                    if (e.value) {
                        // 增强模式：更高金属度，更低粗糙度
                        sphere.material.metalness = 0.95;
                        sphere.material.roughness = Math.max(0.05, 0.08 + (i / 50));
                    } else {
                        // 正常模式：恢复更适中的值
                        sphere.material.metalness = 0.9;
                        sphere.material.roughness = 0.1 + (i / 20);
                    }
                });
            });

        // 添加曲面采样优化选项
        settingsFolder.addBinding(reflectionParams, "curveSampling", { label: "曲面采样优化" })
            .on("change", (e) => {
                const ssrPass = compatSSRPass.threePass;

                // 这里修改SSRPass的内部参数以优化曲面反射
                if (e.value) {
                    // 增强曲面反射质量的参数
                    ssrPass.thickness = 0.035;  // 保持适中厚度
                    // SSRShader有个MAX_STEP限制，影响采样效果
                    // 我们间接优化采样步长
                    ssrPass.maxDistance = 0.08; // 略微增加最大距离
                    ssrPass.blur = true;        // 开启模糊以平滑反射
                } else {
                    // 恢复默认参数
                    ssrPass.thickness = 0.035;
                    ssrPass.maxDistance = 0.08;
                    ssrPass.blur = true;
                }

                // 更新所有复杂几何体的材质
                testObjects.children.forEach(child => {
                    if (
                        child.geometry instanceof TorusGeometry ||
                        child.geometry instanceof TorusKnotGeometry ||
                        child.geometry instanceof IcosahedronGeometry
                    ) {
                        if (e.value) {
                            // 优化曲面物体的材质参数
                            child.material.roughness = Math.max(0.05, child.material.roughness * 0.7);
                            child.material.metalness = Math.min(0.98, child.material.metalness * 1.1);
                        } else {
                            // 还原基本材质参数
                            if (child.geometry instanceof TorusGeometry) {
                                child.material.roughness = 0.07;
                                child.material.metalness = 1.0;
                            } else if (child.geometry instanceof TorusKnotGeometry) {
                                child.material.roughness = 0.2;
                                child.material.metalness = 0.8;
                            } else if (child.geometry instanceof IcosahedronGeometry) {
                                child.material.roughness = 0.2;
                                child.material.metalness = 0.8;
                            }
                        }
                    }
                });
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

        // 添加选择模式控制到GUI
        folder.addBinding(
            { showSelectInfo: "点击场景中的物体以选择/取消选择它们进行反射" },
            "showSelectInfo",
            { label: "选择提示", readonly: true }
        );

        // 添加按钮清空选择
        const clearSelectionBtn = folder.addButton({
            title: "清空选择列表"
        });

        clearSelectionBtn.on("click", () => {
            // 恢复所有物体的原始材质
            selectedObjects.forEach(obj => {
                if (obj._originalEmissive) {
                    obj.material.emissive.copy(obj._originalEmissive);
                }
            });

            // 清空选择集合
            selectedObjects.clear();

            // 清空SelectiveSSRPass的选择
            ssrPass.selection.clear();

            // 更新UI显示
            updateSelectionDisplay();
        });

        // 添加按钮选择所有物体
        const selectAllBtn = folder.addButton({
            title: "选择所有物体"
        });

        selectAllBtn.on("click", () => {
            // 选择所有测试对象
            testObjects.children.forEach(obj => {
                if (!selectedObjects.has(obj)) {
                    selectedObjects.add(obj);

                    // 添加到SelectiveSSRPass的选择中
                    ssrPass.selection.add(obj);

                    // 保存原始发光颜色并设置高亮
                    if (!obj._originalEmissive) {
                        obj._originalEmissive = obj.material.emissive.clone();
                    }
                    obj.material.emissive.set(0x333333); // 添加微弱发光以指示选中
                }
            });

            // 更新UI显示
            updateSelectionDisplay();
        });

        // 添加显示当前选择数量的绑定
        const selectCountBinding = folder.addBinding(
            { count: "已选择: 0 个物体" },
            "count",
            { label: "选择状态", readonly: true }
        );

        // 添加更新选择显示的函数
        function updateSelectionDisplay() {
            // 如果有selectCountBinding，则更新选择数量显示
            if (selectCountBinding) {
            }
        }

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

        // 添加全局环境参数控制
        const envParams = {
            envMapIntensity: 1.5 // 初始环境贴图强度
        };

        // 在SSR控制面板之后添加环境控制面板
        const envFolder = pane.addFolder({ title: "环境设置" });

        envFolder.addBinding(envParams, "envMapIntensity", {
            label: "环境贴图强度",
            min: 0,
            max: 5,
            step: 0.1
        }).on("change", (e) => {
            // 更新所有使用环境贴图的材质
            scene.traverse((obj) => {
                if (obj.isMesh && obj.material) {
                    // 对于标准材质和物理材质
                    if (obj.material.envMap !== undefined || obj.material.envMapIntensity !== undefined) {
                        obj.material.envMapIntensity = e.value;
                        obj.material.needsUpdate = true;
                    }
                }
            });
        });

        // 添加SSR输出模式的调试控制
        settingsFolder.addBinding(
            {
                outputMode: compatSSRPass.threePass.output,
                modes: {
                    "Default (场景+反射)": SSRPass.OUTPUT.Default,
                    "仅反射": SSRPass.OUTPUT.SSR,
                    "仅美观": SSRPass.OUTPUT.Beauty,
                    "深度": SSRPass.OUTPUT.Depth,
                    "法线": SSRPass.OUTPUT.Normal,
                    "金属度": SSRPass.OUTPUT.Metalness
                }
            },
            "outputMode",
            {
                label: "输出模式",
                options: {
                    "Default (场景+反射)": SSRPass.OUTPUT.Default,
                    "仅反射": SSRPass.OUTPUT.SSR,
                    "仅美观": SSRPass.OUTPUT.Beauty,
                    "深度": SSRPass.OUTPUT.Depth,
                    "法线": SSRPass.OUTPUT.Normal,
                    "金属度": SSRPass.OUTPUT.Metalness
                }
            }
        ).on("change", (e) => {
            compatSSRPass.threePass.output = e.value;
            console.log("SSR输出模式切换为:", e.value);
        });

        // 在SSR设置面板中添加SelectiveSSRPass特有的设置
        const selectiveFolder = folder.addFolder({ title: "选择性SSR设置" });

        // 添加反转选择控制
        selectiveFolder.addBinding(ssrPass, "inverted", {
            label: "反转选择"
        }).on("change", () => {
            updateSelectionDisplay();
        });

        // 添加忽略背景控制
        selectiveFolder.addBinding(ssrPass, "ignoreBackground", {
            label: "忽略背景"
        });

        // 在创建完SSRPass后，添加点击事件监听
        renderer.domElement.addEventListener('click', onMouseClick);

    } catch (error) {
        console.error("Error setting up SelectiveSSRPass:", error);
        // 创建一个错误信息面板
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

    // 窗口大小调整处理
    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(35, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
        renderer.setSize(width, height);

        // 更新SSRPass和地面反射器的尺寸
        if (compatSSRPass && compatSSRPass.threePass) {
            compatSSRPass.threePass.width = width;
            compatSSRPass.threePass.height = height;
            compatSSRPass.threePass.setSize(width, height);
        }

        // 更新SelectiveBloom效果的尺寸
        if (bloomEffect) {
            bloomEffect.setSize(width, height);
        }

        if (groundReflector) {
            groundReflector.getRenderTarget().setSize(width, height);
            groundReflector.resolution.set(width, height);
        }
    }

    window.addEventListener("resize", onResize);
    onResize();

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

        // 选择渲染方式
        composer.render();

        requestAnimationFrame(render);
    });
})); 