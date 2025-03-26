import {
    RenderPass,
    ThreeCompatPass,
    CopyPass
} from "postprocessing";
import {
    BoxGeometry,
    EffectComposer,
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
    Scene,
    SphereGeometry,
    SpotLight,
    SRGBColorSpace,
    TextureLoader,
    TorusGeometry,
    TorusKnotGeometry,
    MeshPhongMaterial,
    VSMShadowMap,
    WebGLRenderer
} from "three";

// 直接获取VENDOR对象中需要的类
const SSRPass = window.VENDOR.SSRPass;
const ReflectorForSSRPass = window.VENDOR.ReflectorForSSRPass || null;

console.log('Log-- ', ReflectorForSSRPass, 'ReflectorForSSRPass');

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 全局参数设置
const params = {
    enableSSR: true,
    autoRotate: false,
    otherMeshes: true,
    groundReflector: true,
    showHelpers: true
};

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

    // // 添加一组具有不同金属度和粗糙度的球体
    // for (let i = 0; i < 5; i++) {
    //     const sphereGeometry = new SphereGeometry(0.025, 64, 64); // 增加细分提高精度
    //     // 根据SSRPass工作原理优化材质
    //     const sphereMaterial = new MeshStandardMaterial({
    //         color: new Color().setHSL(i / 5, 0.7, 0.5),
    //         // 降低金属度，增加环境贴图强度以提高亮度
    //         metalness: 0.7 + (i * 0.05),  // 0.7-0.9的金属度范围
    //         roughness: 0.1 + (i / 20),    // 保持原有粗糙度变化
    //         envMapIntensity: 2.0          // 大幅增加环境贴图影响
    //     });
    //     const sphereMesh = new Mesh(sphereGeometry, sphereMaterial);
    //     sphereMesh.position.set(0.1 + i * 0.06, 0.025, 0);
    //     sphereMesh.castShadow = sphereMesh.receiveShadow = true;
    //     objects.add(sphereMesh);
    // }

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

    console.log('Log-- ', ReflectorForSSRPass, 'ReflectorForSSRPass');
    if (ReflectorForSSRPass) {
        // 使用更大的反射平面
        const geometry = new PlaneGeometry(2, 2);
        groundReflector = new ReflectorForSSRPass(geometry, {
            clipBias: 0.0003,          // 保持原值
            textureWidth: window.innerWidth,
            textureHeight: window.innerHeight,
            color: 0xaaaaaa,           // 更亮的反射色
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

    // 添加测试对象
    const testObjects = createTestObjects();
    scene.add(testObjects);

    // 选择要特别反射的对象，排除半透明物体
    testObjects.children.forEach((object, index) => {
        // 检查对象材质，排除半透明物体
        selects.push(object);
    });

    // 后期处理设置
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);
    const composer = new EffectComposer(renderer);

    // 使用ThreeCompatPass包装SSRPass
    let compatSSRPass = null;

    // GUI控制面板设置
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    try {
        // 检查SSRPass是否可用
        if (!SSRPass) {
            throw new Error("SSRPass is not available in the VENDOR object");
        }

        // 创建Three.js的SSRPass
        let ssrPass = new SSRPass({
            renderer,
            scene,
            camera,
            width: window.innerWidth,
            height: window.innerHeight,
            // encoding: renderer.outputColorSpace,
            groundReflector: params.groundReflector ? groundReflector : null,
            selects: []
        });
        console.log('Log-- ', ssrPass, 'ssrPass');
        // ssrPass.selective = false
        console.log('Log-- ', selects, 'selects');

        // 设置SSRPass的初始参数
        ssrPass.thickness = 0.018;       // 设置适中厚度值，避免光线穿透问题
        ssrPass.maxDistance = 0.1;       // 控制反射追踪距离
        ssrPass.opacity = 0.85;          // 降低反射不透明度，让更多原始光照通过
        ssrPass.fresnel = true;          // 启用菲涅尔效应
        ssrPass.distanceAttenuation = true; // 启用距离衰减
        ssrPass.bouncing = true;         // 启用多次反射
        ssrPass.infiniteThick = false;   // 禁用无限厚度
        ssrPass.blur = true;             // 启用模糊

        // 使用ThreeCompatPass包装SSRPass
        compatSSRPass = new ThreeCompatPass(ssrPass, "SSRCompatPass");
        compatSSRPass.enabled = params.enableSSR;

        // 首先添加基本渲染Pass
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        // 然后添加SSR效果
        composer.addPass(compatSSRPass);

        // 添加一个CopyPass作为最终输出
        // 这有助于确保SSRPass的结果能够正确地传递到屏幕
        const copyPass = new CopyPass();
        composer.addPass(copyPass);

        // SSR 控制面板设置
        const folder = pane.addFolder({ title: "SSR设置" });

        // 基本控制
        folder.addBinding(params, "enableSSR", { label: "启用SSR" })
            .on("change", (e) => {
                compatSSRPass.enabled = e.value;
            });

        // 添加重置按钮 - 使用正确的Tweakpane按钮API
        const resetBtn = folder.addButton({
            title: "重置效果设置"
        });

        resetBtn.on("click", () => {
            // 确保通过compatSSRPass访问内部的ssrPass
            const ssrPass = compatSSRPass.threePass;

            // 重置SSR设置为最佳效果
            ssrPass.thickness = 0.018;
            ssrPass.maxDistance = 0.1;
            ssrPass.opacity = 0.85;       // 更新为优化后的值
            ssrPass.fresnel = true;
            ssrPass.distanceAttenuation = true;
            ssrPass.bouncing = true;
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
                    // 过滤掉半透明材质的对象
                    const filteredSelects = testObjects.children.filter(obj => {
                        // 检查是否是半透明物体
                        if (obj.material && obj.material.transparent) return false;
                        if (obj.material && obj.material.transmission > 0) return false;
                        return true;
                    });
                    compatSSRPass.threePass.selects = filteredSelects;
                } else {
                    compatSSRPass.threePass.groundReflector = null;
                    compatSSRPass.threePass.selects = [];
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
                    ssrPass.thickness = 0.018;  // 保持适中厚度
                    // SSRShader有个MAX_STEP限制，影响采样效果
                    // 我们间接优化采样步长
                    ssrPass.maxDistance = 0.12; // 略微增加最大距离
                    ssrPass.blur = true;        // 开启模糊以平滑反射
                } else {
                    // 恢复默认参数
                    ssrPass.thickness = 0.018;
                    ssrPass.maxDistance = 0.1;
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

    } catch (error) {
        console.error("Error setting up SSRPass:", error);
        // 创建一个错误信息面板
        const errorFolder = pane.addFolder({ title: "SSR错误" });
        errorFolder.addBinding({ error: error.message }, "error", {
            readonly: true,
            label: "错误信息"
        });
        errorFolder.addBinding({ info: "SSR初始化失败，将使用标准渲染。" }, "info", {
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
        if (params.enableSSR) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }

        requestAnimationFrame(render);
    });
})); 