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
    SelectiveBloomEffect,
    SelectiveSSRPass,
    RenderPass,
    // RenderPassGbuffer as RenderPass
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
    depthRenderScale: 0.5,         // 深度渲染分辨率比例 (0.5 = 50%分辨率)

    // 对象ID相关参数
    enableObjectId: false,          // 启用对象ID系统
    showObjectIdDebug: false,       // 显示对象ID调试信息
    objectIdVisualization: 'off'    // 对象ID可视化模式: 'off', 'colorful', 'grayscale'
};

// 全局变量声明
let ssrPass = null;
let objectIdManager = null;
let debugInfo = { objectCount: 0, idStats: null };

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
        // depth: true,
    });
    console.log('Log-- ', renderer.capabilities.isWebGL2, 'renderer.capabilities.isWebGL2');

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
    let gBufferPass = null;

    // GUI控制面板设置
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    try {

        // 创建增强版RenderPass（集成G-Buffer功能和对象ID）
        gBufferPass = new RenderPass(scene, camera, null, {
            enableGBuffer: true,
            enableObjectId: params.enableObjectId,  // 启用对象ID
            resolutionScale: 1.0
        });

        // 获取对象ID管理器的引用
        if (params.enableObjectId) {
            objectIdManager = gBufferPass.getObjectIdManager();
            console.log("🆔 ObjectIdManager initialized:", objectIdManager);
        } else {
            console.log("🆔 对象ID功能已禁用，使用传统G-Buffer渲染");
        }

        // 获取G-Buffer纹理
        const gBufferTextures = gBufferPass.getGBufferTextures();


        // 调试G-Buffer纹理
        if (gBufferTextures) {
            console.log("🎯 G-Buffer纹理检查:");
            console.log("  - gLitColor:", gBufferTextures.gLitColor);
            console.log("  - gNormal:", gBufferTextures.gNormal);
            console.log("  - gDepth:", gBufferTextures.gDepth);
            console.log("  - gPosition:", gBufferTextures.gPosition);
            if (params.enableObjectId && gBufferTextures.gObjectId) {
                console.log("  - gObjectId:", gBufferTextures.gObjectId);
                console.log("🆔 对象ID纹理已生成");
            } else if (params.enableObjectId) {
                console.warn("⚠️ 对象ID已启用但纹理未生成");
            }
        } else {
            console.warn("⚠️ G-Buffer纹理为null!");
        }

        // 更新调试信息
        if (objectIdManager) {
            const scanResult = objectIdManager.scanScene(scene, false); // 不强制更新，只统计
            debugInfo.objectCount = scanResult.total; // 使用总网格数
            debugInfo.idStats = objectIdManager.getStats();
            console.log("📈 对象ID统计:", debugInfo.idStats);
            console.log("🔍 扫描结果:", scanResult);
        }

        // 创建SelectiveSSRPass并传入G-Buffer纹理
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
            composer,
            gBufferTextures: gBufferTextures
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

        // 添加G-Buffer Pass（替代RenderPass，同时渲染场景和G-Buffer数据）
        composer.addPass(gBufferPass);
        // ⚠️ 重要：因为后面还有SSR Pass，所以不能renderToScreen，需要渲染到inputBuffer
        gBufferPass.renderToScreen = false;

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
            gBufferPass,
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



    // 初始化尺寸

    // 渲染循环
    let t0 = 0;
    let frameCount = 0;
    requestAnimationFrame(function render(timestamp) {

        const deltaTime = timestamp - t0;
        t0 = timestamp;
        frameCount++;

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

        // 更新对象ID统计信息（每30帧更新一次以提高性能）
        if (params.enableObjectId && objectIdManager && frameCount % 30 === 0) {
            // 内联统计更新逻辑
            if (objectIdManager && params.enableObjectId) {
                const stats = objectIdManager.getStats();
                const scanResult = objectIdManager.scanScene(scene, false);
                debugInfo.idStats = stats;
                debugInfo.objectCount = scanResult.total;

                if (params.showObjectIdDebug) {
                    console.log("📈 对象ID统计更新:", stats);
                    console.log("🔍 场景扫描:", scanResult);
                }
            }
        }

        // 渲染场景
        composer.render();

        requestAnimationFrame(render);

    });
    // 窗口大小调整事件监听
    window.addEventListener("resize", () =>
        onResize(container, camera, composer, renderer, compatSSRPass, bloomEffect, groundReflector)
    );

    // 初始化尺寸
    onResize(container, camera, composer, renderer, compatSSRPass, bloomEffect, groundReflector);

});

// GUI设置函数
function setupGUI(pane, options) {

    const {
        ssrPass,
        compatSSRPass,
        gBufferPass,
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

    // 对象ID调试控制
    const objectIdFolder = debugFolder.addFolder({ title: "对象ID调试" });

    objectIdFolder.addBinding(params, "enableObjectId", {
        label: "启用对象ID"
    }).on("change", (e) => {
        if (gBufferPass) {
            // 对象ID在G-Buffer模式下总是启用的
            // 只需要获取ObjectIdManager引用即可
            objectIdManager = gBufferPass.getObjectIdManager();
            console.log("🆔 对象ID功能:", e.value ? "已启用（G-Buffer模式下总是可用）" : "标记为禁用");
        }
    });

    objectIdFolder.addBinding(params, "showObjectIdDebug", {
        label: "显示调试信息"
    });

    objectIdFolder.addBinding(params, "objectIdVisualization", {
        label: "可视化模式",
        options: {
            "关闭": "off",
            "彩色": "colorful",
            "灰度": "grayscale"
        }
    }).on("change", (e) => {
        console.log("🎭 对象ID可视化模式:", e.value);

        // 实现可视化逻辑
        if (e.value === "off") {
            // 关闭可视化，切换到默认模式
            compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.Default;
        } else {
            // 切换到对象ID可视化模式
            compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferObjectId;

            // 设置可视化模式（如果材质存在）
            if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
                const mode = e.value === "colorful" ? 0 : 1; // 0=彩色, 1=灰度
                compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = mode;
                console.log(`设置可视化模式: ${e.value} (${mode})`);
            }
        }
    });

    // 对象ID状态显示
    const objectIdStats = {
        objectCount: 0,
        allocatedIds: 0,
        usagePercentage: "0%",
        nextId: 1
    };

    objectIdFolder.addBinding(objectIdStats, "objectCount", {
        label: "对象数量",
        readonly: true
    });

    objectIdFolder.addBinding(objectIdStats, "allocatedIds", {
        label: "已分配ID",
        readonly: true
    });

    objectIdFolder.addBinding(objectIdStats, "usagePercentage", {
        label: "使用率",
        readonly: true
    });

    // 更新统计信息的函数
    const updateObjectIdStats = () => {
        if (objectIdManager && params.enableObjectId) {
            const stats = objectIdManager.getStats();
            objectIdStats.allocatedIds = stats.allocatedCount;
            objectIdStats.usagePercentage = stats.usagePercentage;
            objectIdStats.nextId = stats.nextId;

            // 统计场景中的对象数量
            let meshCount = 0;
            scene.traverse((obj) => {
                if (obj.isMesh) meshCount++;
            });
            objectIdStats.objectCount = meshCount;

            // 同时更新全局debugInfo
            debugInfo.idStats = stats;
        }
    };

    // 对象ID快速可视化按钮
    objectIdFolder.addButton({
        title: "🎭 彩色可视化"
    }).on("click", () => {
        params.objectIdVisualization = "colorful";
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferObjectId;
        if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
            compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = 0;
        }
        console.log("🎭 切换到彩色对象ID可视化");
    });

    objectIdFolder.addButton({
        title: "⬜ 灰度可视化"
    }).on("click", () => {
        params.objectIdVisualization = "grayscale";
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferObjectId;
        if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
            compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = 1;
        }
        console.log("⬜ 切换到灰度对象ID可视化");
    });

    // 对象ID操作按钮
    objectIdFolder.addButton({
        title: "🔍 检查场景状态"
    }).on("click", () => {
        if (objectIdManager) {
            const scanResult = objectIdManager.scanScene(scene, false); // 不强制更新，只统计
            const stats = objectIdManager.getStats();

            console.log("🔍 场景对象ID状态检查:");
            console.log(`  - 网格对象数量: ${scanResult.total}`);
            console.log(`  - 已分配ID数: ${scanResult.existing}`);
            console.log(`  - 未分配ID数: ${scanResult.total - scanResult.existing}`);
            console.log(`  - ID分配率: ${((scanResult.existing / scanResult.total) * 100).toFixed(1)}%`);
            console.log(`  - ID使用统计:`, stats);

            if (typeof updateObjectIdStats === 'function') {
                updateObjectIdStats();
            }
        }
    });

    objectIdFolder.addButton({
        title: "🔄 重新分配ID"
    }).on("click", () => {
        if (objectIdManager) {
            const scanResult = objectIdManager.scanScene(scene, true); // 强制更新
            console.log(`🔄 强制重新分配ID: 更新${scanResult.assigned}个，共${scanResult.total}个网格`);
            if (typeof updateObjectIdStats === 'function') {
                updateObjectIdStats();
            }
        }
    });

    objectIdFolder.addButton({
        title: "清除所有ID"
    }).on("click", () => {
        if (objectIdManager) {
            objectIdManager.clear();
            console.log("🧯️ 所有对象ID已清除");
            if (typeof updateObjectIdStats === 'function') {
                updateObjectIdStats();
            }
        }
    });

    objectIdFolder.addButton({
        title: "🔍 调试ID分配"
    }).on("click", () => {
        console.log("🔍 开始调试对象ID分配...");

        if (objectIdManager) {
            console.log("📊 对象ID管理器状态:");
            const stats = objectIdManager.getStats();
            console.log(`  - 最大ID: ${stats.maxId}`);
            console.log(`  - 下一个ID: ${stats.nextId}`);
            console.log(`  - 已分配数量: ${stats.allocatedCount}`);

            // 输出所有对象的ID和归一化值
            console.log("🆔 对象ID详细信息:");
            let count = 0;
            for (const [id, object] of objectIdManager.idToObject) {
                const normalizedId = id / 255.0;
                console.log(`  - 对象${count + 1}: ${object.name || object.uuid.slice(0, 8)}`);
                console.log(`    原始ID=${id}, 归一化ID=${normalizedId.toFixed(6)}`);

                // 检查归一化值是否会被误判为背景
                if (normalizedId < 0.001) {
                    console.warn(`    ⚠️ 这个ID值太小，会被判断为背景！`);
                } else {
                    console.log(`    ✅ ID值正常，大于背景阈值0.001`);
                }
                count++;
            }

            // 计算预期的颜色差异
            if (stats.allocatedCount > 1) {
                const ids = Array.from(objectIdManager.idToObject.keys()).sort((a, b) => a - b);
                const minId = ids[0];
                const maxId = ids[ids.length - 1];
                console.log("🎨 颜色差异分析:");
                console.log(`  - ID范围: ${minId} - ${maxId}`);
                console.log(`  - 归一化范围: ${(minId / 255.0).toFixed(6)} - ${(maxId / 255.0).toFixed(6)}`);
            }
        } else {
            console.warn("⚠️ ObjectIdManager不可用");
        }
    });


    objectIdFolder.addButton({
        title: "🔄 强制重新渲染"
    }).on("click", () => {
        console.log("🔄 强制重新渲染对象ID...");

        // 强制更新G-Buffer
        if (gBufferPass && gBufferPass.forceGBufferUpdate) {
            gBufferPass.forceGBufferUpdate();
        }

        // 重新分配ID
        if (objectIdManager) {
            objectIdManager.clear();
            const scanResult = objectIdManager.scanScene(scene, true);
            console.log(`🔄 重新分配了${scanResult.assigned}个ID`);
        }

        console.log("🔄 重新渲染完成，请观察颜色变化");
    });

    // 烘焙ID渲染测试
    const renderingFolder = pane.addFolder({
        title: "⚡ 烘焙ID渲染",
        expanded: false
    });

    renderingFolder.addButton({
        title: "📊 渲染性能测试"
    }).on("click", () => {
        console.log("📊 开始渲染性能测试...");

        let frameCount = 0;
        let totalTime = 0;
        const maxFrames = 60; // 测试60帧

        const performanceTest = () => {
            const startTime = performance.now();

            // 触发一次渲染
            if (composer) {
                composer.render();
            }

            const endTime = performance.now();
            totalTime += (endTime - startTime);
            frameCount++;

            if (frameCount < maxFrames) {
                requestAnimationFrame(performanceTest);
            } else {
                const avgFrameTime = totalTime / frameCount;
                const fps = 1000 / avgFrameTime;

                console.log("📊 渲染性能测试结果:");
                console.log(`  - 平均帧时间: ${avgFrameTime.toFixed(2)}ms`);
                console.log(`  - 估计FPS: ${fps.toFixed(1)}`);
                console.log(`  - 总耗时: ${totalTime.toFixed(2)}ms (${frameCount}帧)`);
                console.log(`  - 渲染方案: 烘焙ID一次渲染`);
            }
        };

        performanceTest();
    });

    renderingFolder.addButton({
        title: "⚡ 直接测试烘焙ID"
    }).on("click", () => {
        console.log("⚡ 直接测试烘焙ID渲染...");

        if (gBufferPass && gBufferPass.renderGBufferWithObjectIdOptimized) {
            const startTime = performance.now();

            // 直接调用烘焙ID渲染方法
            gBufferPass.renderGBufferWithObjectIdOptimized(renderer, scene, camera);

            const endTime = performance.now();

            console.log("⚡ 烘焙ID渲染完成:");
            console.log(`  - 耗时: ${(endTime - startTime).toFixed(2)}ms`);
            console.log(`  - 特点: ID烘焙到着色器常量`);
            console.log(`  - 优势: 一次renderer.render()调用`);
            console.log(`  - 缓存: 相同ID复用材质`);

            // 切换到对象ID可视化查看效果
            if (compatSSRPass && compatSSRPass.threePass) {
                compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferObjectId;
                if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
                    compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = 0;
                }
                console.log("🎨 已切换到ID可视化模式");
            }
        } else {
            console.warn("⚠️ 烘焙ID渲染方法不可用");
        }
    });

    renderingFolder.addButton({
        title: "🧹 清理材质缓存"
    }).on("click", () => {
        if (gBufferPass && gBufferPass.clearMaterialCache) {
            gBufferPass.clearMaterialCache();
            console.log("🧹 材质缓存已清理");
        } else {
            console.warn("⚠️ 材质缓存清理功能不可用");
        }
    });

    objectIdFolder.addButton({
        title: "输出ID统计"
    }).on("click", () => {
        if (objectIdManager) {
            const stats = objectIdManager.getStats();
            console.log("📈 对象ID统计信息:", stats);

            // 显示详细信息
            console.log("🔍 详细信息:");
            scene.traverse((obj) => {
                if (obj.isMesh && objectIdManager.objectToId.has(obj)) {
                    const id = objectIdManager.getObjectId(obj);
                    console.log(`  - ${obj.name || obj.uuid.substr(0, 8)}: ID=${id}`);
                }
            });
        }
    });

    // G-Buffer调试信息按钮
    debugFolder.addButton({
        title: "检查G-Buffer状态"
    }).on("click", () => {
        const gBufferTextures = gBufferPass.getGBufferTextures();
        if (gBufferTextures) {
            console.log("🔍 G-Buffer状态检查:");
            console.log("  - gColor纹理:", gBufferTextures.gColor ? "✅" : "❌");
            console.log("  - gLitColor纹理:", gBufferTextures.gLitColor ? "✅" : "❌");
            console.log("  - gNormal纹理:", gBufferTextures.gNormal ? "✅" : "❌");
            console.log("  - gDepth纹理:", gBufferTextures.gDepth ? "✅" : "❌");
            console.log("  - gPosition纹理:", gBufferTextures.gPosition ? "✅" : "❌");
            console.log("  - gObjectId纹理:", gBufferTextures.gObjectId ? "✅" : "❌");
            console.log("  - depthTexture:", gBufferTextures.depthTexture ? "✅" : "❌");
            console.log("  - 渲染目标大小:", gBufferTextures.gColor?.image?.width + "x" + gBufferTextures.gColor?.image?.height);
            console.log("  - SSR使用G-Buffer:", ssrPass.usingGBuffer ? "✅" : "❌");
            console.log("  - SSR的gBufferTextures:", ssrPass.gBufferTextures);

            // 额外的纹理详细信息
            if (gBufferTextures.gNormal) {
                console.log("  - gNormal纹理格式:", gBufferTextures.gNormal.format);
                console.log("  - gNormal纹理类型:", gBufferTextures.gNormal.type);
            }

            // 🔍 新增：检查纹理是否相同
            console.log("  - gColor === gLitColor:", gBufferTextures.gColor === gBufferTextures.gLitColor);
        } else {
            console.warn("❌ G-Buffer纹理未生成!");
            console.log("  - 检查RenderPass是否启用G-Buffer");
            console.log("  - gBufferPass.enableGBuffer:", gBufferPass.enableGBuffer);
        }
    });

    // 测试 MRT 渲染按钮
    debugFolder.addButton({
        title: "🔬 测试MRT渲染"
    }).on("click", () => {
        console.log("🔬 ========== MRT 渲染测试 ==========");

        // 1. 检查 RenderPass 状态
        console.log("📋 1. RenderPass 状态:");
        console.log("  - enableGBuffer:", gBufferPass.enableGBuffer);
        console.log("  - renderToScreen:", gBufferPass.renderToScreen);
        console.log("  - sceneMaterialsPatched:", gBufferPass.sceneMaterialsPatched);

        // 2. 检查 G-Buffer 渲染目标
        const gBufferTextures = gBufferPass.getGBufferTextures();
        console.log("📋 2. G-Buffer 渲染目标:");
        if (gBufferPass.gBufferRenderTarget) {
            console.log("  - count:", gBufferPass.gBufferRenderTarget.count);
            console.log("  - textures数量:", gBufferPass.gBufferRenderTarget.textures?.length);
            console.log("  - width:", gBufferPass.gBufferRenderTarget.width);
            console.log("  - height:", gBufferPass.gBufferRenderTarget.height);
        } else {
            console.warn("  ❌ gBufferRenderTarget 未创建！");
        }

        // 3. 检查 SSR Pass 的 G-Buffer 引用
        console.log("📋 3. SSR Pass 的 G-Buffer 引用:");
        console.log("  - usingGBuffer:", ssrPass.usingGBuffer);
        console.log("  - gBufferTextures:", ssrPass.gBufferTextures);
        if (ssrPass.gBufferTextures) {
            console.log("    - gLitColor:", !!ssrPass.gBufferTextures.gLitColor);
            console.log("    - gNormal:", !!ssrPass.gBufferTextures.gNormal);
            console.log("    - gDepth:", !!ssrPass.gBufferTextures.gDepth);
        }

        // 4. 切换到 G-Buffer 颜色显示模式
        console.log("📋 4. 切换到 G-Buffer 颜色显示:");
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferColor;
        console.log("  ✅ 已切换到 GBufferColor 模式");
        console.log("  👁️ 现在应该看到 MRT 渲染的颜色通道");
        console.log("  💡 如果看到正确的彩色场景，说明 MRT 渲染正常");
    });

    // 测试法线可视化按钮
    debugFolder.addButton({
        title: "测试法线可视化"
    }).on("click", () => {
        console.log("🔍 切换到法线显示模式...");
        // 临时切换到法线模式
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.Normal;
        console.log("  - 当前输出模式:", compatSSRPass.threePass.output);
        console.log("  - 法线模式常量:", SelectiveSSRPass.OUTPUT.Normal);
        console.log("  - 使用G-Buffer:", compatSSRPass.threePass.usingGBuffer ? "是" : "否");

        // 输出G-Buffer纹理信息
        const gBufferTextures = compatSSRPass.threePass.gBufferTextures;
        if (gBufferTextures && gBufferTextures.gNormal) {
            console.log("  - G-Buffer法线纹理存在: ✅");
            console.log("  - 纹理ID:", gBufferTextures.gNormal.id);
        } else {
            console.log("  - G-Buffer法线纹理: ❌");
        }
    });

    // G-Buffer通道显示控制
    const displayModeOptions = {
        "Default": SelectiveSSRPass.OUTPUT.Default,
        "SSR": SelectiveSSRPass.OUTPUT.SSR,
        "Beauty": SelectiveSSRPass.OUTPUT.Beauty,
        "Depth": SelectiveSSRPass.OUTPUT.Depth,
        "Normal": SelectiveSSRPass.OUTPUT.Normal,
        "Metalness": SelectiveSSRPass.OUTPUT.Metalness,
        "G-Buffer Color": SelectiveSSRPass.OUTPUT.GBufferColor,
        "G-Buffer Position": SelectiveSSRPass.OUTPUT.GBufferPosition,
        "G-Buffer ObjectId": SelectiveSSRPass.OUTPUT.GBufferObjectId, // 对象ID可视化
        "Mask": SelectiveSSRPass.OUTPUT.Mask,
        "Debug": SelectiveSSRPass.OUTPUT.Debug
    };

    debugFolder.addBinding({
        displayMode: "Default"
    }, "displayMode", {
        label: "显示模式",
        options: displayModeOptions
    }).on("change", (e) => {
        const mode = displayModeOptions[e.value];
        compatSSRPass.threePass.output = mode;
        console.log(`🎯 切换显示模式: ${e.value} (${mode})`);

        // 输出当前G-Buffer状态
        if (mode >= SelectiveSSRPass.OUTPUT.GBufferColor) {
            const gBufferTextures = compatSSRPass.threePass.gBufferTextures;
            console.log("📊 G-Buffer纹理状态:");
            console.log("  - gColor:", gBufferTextures?.gColor ? "✅" : "❌");
            console.log("  - gNormal:", gBufferTextures?.gNormal ? "✅" : "❌");
            console.log("  - gDepth:", gBufferTextures?.gDepth ? "✅" : "❌");
            console.log("  - gPosition:", gBufferTextures?.gPosition ? "✅" : "❌");
            console.log("  - gObjectId:", gBufferTextures?.gObjectId ? "✅" : "❌");
        }
    });

    // 快捷通道切换按钮
    const channelFolder = debugFolder.addFolder({ title: "G-Buffer通道快捷切换" });

    channelFolder.addButton({
        title: "📸 颜色通道"
    }).on("click", () => {
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferColor;
        console.log("🎨 切换到G-Buffer颜色通道");
    });

    channelFolder.addButton({
        title: "🧭 法线通道"
    }).on("click", () => {
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.Normal;
        console.log("🧭 切换到G-Buffer法线通道");
    });

    channelFolder.addButton({
        title: "📏 深度通道"
    }).on("click", () => {
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.Depth;
        console.log("📏 切换到G-Buffer深度通道");
    });

    channelFolder.addButton({
        title: "📍 位置通道"
    }).on("click", () => {
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferPosition;
        console.log("📍 切换到G-Buffer位置通道");
    });

    channelFolder.addButton({
        title: "🆔 对象ID通道（彩色）"
    }).on("click", () => {
        if (!compatSSRPass || !compatSSRPass.threePass) {
            console.warn("⚠️ SSR Pass 不可用");
            return;
        }

        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferObjectId;

        // 设置彩色模式
        if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
            compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = 0;
        }

        console.log("🆔 切换到对象ID通道（彩色模式）");

        // 检查对象ID纹理是否可用
        const gBufferTextures = gBufferPass.getGBufferTextures();
        if (gBufferTextures && gBufferTextures.gObjectId) {
            console.log("✅ 对象ID纹理可用");
            console.log("  - 纹理尺寸:", gBufferTextures.gObjectId.image?.width + 'x' + gBufferTextures.gObjectId.image?.height);

            // 显示统计信息
            if (objectIdManager) {
                const stats = objectIdManager.getStats();
                console.log("📈 对象ID统计:", stats);
            }
        } else {
            console.warn("⚠️ 对象ID纹理不可用，请检查enableObjectId设置");
        }
    });

    channelFolder.addButton({
        title: "🆔 对象ID通道（灰度）"
    }).on("click", () => {
        if (!compatSSRPass || !compatSSRPass.threePass) {
            console.warn("⚠️ SSR Pass 不可用");
            return;
        }

        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.GBufferObjectId;

        // 设置灰度模式
        if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
            compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = 1;
        }

        console.log("🆔 切换到对象ID通道（灰度模式）");
    });

    channelFolder.addButton({
        title: "⚡ SSR效果"
    }).on("click", () => {
        compatSSRPass.threePass.output = SelectiveSSRPass.OUTPUT.Default;
        console.log("⚡ 切换到SSR效果");
    });

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
            SelectiveSSRPass.OUTPUT.GBufferColor,
            SelectiveSSRPass.OUTPUT.GBufferPosition,
            SelectiveSSRPass.OUTPUT.GBufferObjectId, // 新增对象ID模式
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

        // 特殊处理对象ID模式
        if (modes[nextIndex] === SelectiveSSRPass.OUTPUT.GBufferObjectId) {
            console.log("🆔 循环切换到对象ID可视化模式");

            // 设置默认彩色模式
            if (compatSSRPass.threePass.gBufferObjectIdMaterial) {
                compatSSRPass.threePass.gBufferObjectIdMaterial.uniforms.visualizationMode.value = 0;
            }

            // 检查对象ID状态
            if (objectIdManager) {
                const stats = objectIdManager.getStats();
                console.log("📈 当前对象ID统计:", stats);
            }
        } else {
            // 显示其他模式名称
            const modeNames = {
                [SelectiveSSRPass.OUTPUT.Default]: "默认模式",
                [SelectiveSSRPass.OUTPUT.SSR]: "SSR效果",
                [SelectiveSSRPass.OUTPUT.Beauty]: "原始场景",
                [SelectiveSSRPass.OUTPUT.Depth]: "深度通道",
                [SelectiveSSRPass.OUTPUT.Normal]: "法线通道",
                [SelectiveSSRPass.OUTPUT.GBufferColor]: "G-Buffer颜色",
                [SelectiveSSRPass.OUTPUT.GBufferPosition]: "G-Buffer位置",
                [SelectiveSSRPass.OUTPUT.Mask]: "掩码通道",
                [SelectiveSSRPass.OUTPUT.Debug]: "调试模式"
            };
            const modeName = modeNames[modes[nextIndex]] || `模式${modes[nextIndex]}`;
            console.log(`🔄 循环切换到: ${modeName}`);
        }

    });

}

/**
 * Handles window resize events.
 *
 * @param {HTMLElement} container - The container element.
 * @param {PerspectiveCamera} camera - The camera.
 * @param {EffectComposer} composer - The effect composer.
 * @param {WebGLRenderer} renderer - The renderer.
 * @param {EnhancedThreeCompatPass} ssrPass - The SSR pass.
 * @param {SelectiveBloomEffect} bloomEffect - The bloom effect.
 * @param {ReflectorForSSRPass} groundReflector - The ground reflector.
 * @param {RenderPass} gBufferPass - The G-Buffer enabled render pass.
 */

