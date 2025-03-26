import {
    RenderPass,
    EffectComposer,
    EffectPass,
    SSREffect
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
const ReflectorForSSRPass = window.VENDOR.ReflectorForSSRPass || null;


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

// 创建测试对象
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

    // 添加更多测试模型
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
    scene.add(plane);

    // 创建ground reflector (如果ReflectorForSSRPass可用)
    let groundReflector = null;

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
    } else {
        console.warn("ReflectorForSSRPass not available. Ground reflections disabled.");
        params.groundReflector = false;
    }

    // 添加测试对象
    const testObjects = createTestObjects();
    scene.add(testObjects);

    // 后期处理设置
    const composer = new EffectComposer(renderer);

    // 添加基本渲染通道
    const renderPass = new RenderPass(scene, camera);

    composer.addPass(renderPass);

    // 创建SSR效果
    let ssrEffect = null;

    try {
        console.log("正在尝试创建SSREffect...");

        // 创建SSREffect时添加更多的调试信息
        ssrEffect = new SSREffect(scene, camera, {
            thickness: 0.05,             // 增加厚度，使反射更明显
            maxDistance: 0.5,            // 增加反射距离
            opacity: 1.0,                // 最大不透明度
            fresnel: true,               // 启用菲涅尔效应（角度反射）
            distanceAttenuation: true,   // 启用距离衰减
            bouncing: true,              // 启用多次反射
            infiniteThick: false,        // 禁用无限厚度
            blur: true,                  // 启用模糊效果
            resolutionScale: 1.0,        // 使用全分辨率渲染
            groundReflector: params.groundReflector ? groundReflector : null
        });

        console.log("SSREffect创建成功，当前状态:", ssrEffect);

        // 为所有对象添加反射效果
        console.log("添加所有对象到SSR选择集");
        // 添加所有带金属材质的对象
        scene.traverse(object => {
            try {
                if (object && object.isMesh) {
                    // 确保材质有金属属性
                    if (object.material && (object.material.metalness !== undefined || object.material.specular !== undefined)) {
                        // 将金属度提高到至少0.5
                        if (object.material.metalness !== undefined) {
                            object.material.metalness = Math.max(0.5, object.material.metalness);
                        }
                        ssrEffect.selection.add(object);
                        console.log(`添加金属对象到SSR选择集: ${object.name || '未命名'}`);
                    }
                }
            } catch (err) {
                console.error(`添加对象到SSR选择集时出错:`, err);
            }
        });

        // 添加测试对象集中的所有对象
        testObjects.traverse(object => {
            try {
                if (object && object.isMesh) {
                    ssrEffect.selection.add(object);
                    console.log(`添加测试对象到SSR选择集: ${object.name || '未命名'}`);
                }
            } catch (err) {
                console.error(`添加测试对象到SSR选择集时出错:`, err);
            }
        });

        console.log('SSR选择集对象数量:', ssrEffect.selection.size);

        // 创建效果通道
        const ssrPass = new EffectPass(camera, ssrEffect);
        composer.addPass(ssrPass);

    } catch (error) {
        console.error("创建SSREffect失败:", error);

        // 根据错误类型显示不同的提示
        let errorMessage = "屏幕空间反射效果创建失败。";

        if (error instanceof ReferenceError) {
            if (error.message.includes("super constructor")) {
                errorMessage += " 类构造函数错误: 在super()调用前尝试访问this";
                console.error("构造函数错误：在调用super()之前不能访问或使用this");
            } else {
                errorMessage += ` 引用错误: ${error.message}`;
            }
        } else if (error.message && error.message.includes("mainImage")) {
            errorMessage += " 着色器函数错误：请检查片段着色器";
            console.error("着色器函数错误：请检查片段着色器是否包含正确的mainImage函数");
        } else if (error.message && error.message.includes("normalPass")) {
            errorMessage += " 法线通道错误：无法创建或使用法线通道";
            console.error("法线通道错误：", error.message);
        } else {
            errorMessage += ` ${error.name}: ${error.message}`;
        }

        // 在页面上显示一个警告
        const warningElement = document.createElement("div");
        warningElement.style.position = "absolute";
        warningElement.style.top = "10px";
        warningElement.style.left = "10px";
        warningElement.style.backgroundColor = "rgba(255,0,0,0.7)";
        warningElement.style.color = "white";
        warningElement.style.padding = "10px";
        warningElement.style.borderRadius = "5px";
        warningElement.style.zIndex = "1000";
        warningElement.textContent = errorMessage;
        document.body.appendChild(warningElement);

        // 备用方案：仅显示基本场景渲染
        console.log("使用基本场景渲染作为备用方案");
    }

    // GUI控制面板设置
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 如果SSR效果创建成功，添加控制项
    if (ssrEffect) {
        const folder = pane.addFolder({ title: "SSR设置" });

        // 基本控制
        folder.addBinding(params, "enableSSR", { label: "启用SSR" })
            .on("change", (e) => {
                if (ssrEffect) {
                    ssrEffect.enabled = e.value;
                }
            });

        // 添加重置按钮
        const resetBtn = folder.addButton({
            title: "重置效果设置"
        });

        resetBtn.on("click", () => {
            if (ssrEffect) {
                // 重置SSR设置为最佳效果
                ssrEffect.thickness = 0.05;
                ssrEffect.maxDistance = 0.5;
                ssrEffect.opacity = 1.0;
                ssrEffect.fresnel = true;
                ssrEffect.distanceAttenuation = true;
                ssrEffect.bouncing = true;
                ssrEffect.infiniteThick = false;
                ssrEffect.blur = true;

                if (groundReflector) {
                    // 重置反射器设置
                    groundReflector.material.uniforms.textureMatrix.value.elements[5] = 1;
                    groundReflector.material.uniformsNeedUpdate = true;
                    groundReflector.rotation.z = 0;
                }

                // 更新控制面板
                pane.refresh();
            }
        });

        // 地面反射控制
        if (ReflectorForSSRPass) {
            folder.addBinding(params, "groundReflector", { label: "启用地面反射" })
                .on("change", (e) => {
                    if (ssrEffect) {
                        ssrEffect.groundReflector = e.value ? groundReflector : null;
                    }
                });
        }

        // 场景控制
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

        // 添加反射方向控制
        const reflectionParams = {
            invertY: false,
            flipReflector: false
        };

        if (groundReflector) {
            settingsFolder.addBinding(reflectionParams, "invertY", { label: "反转Y轴反射" })
                .on("change", (e) => {
                    if (groundReflector) {
                        // 修改Y轴缩放因子
                        groundReflector.material.uniforms.textureMatrix.value.elements[5] = e.value ? -1 : 1;
                        groundReflector.material.uniformsNeedUpdate = true;
                    }
                });

            settingsFolder.addBinding(reflectionParams, "flipReflector", { label: "翻转整个反射平面" })
                .on("change", (e) => {
                    if (groundReflector) {
                        // 通过旋转反射平面实现反转
                        groundReflector.rotation.z = e.value ? Math.PI : 0;
                    }
                });
        }

        // SSR参数控制
        settingsFolder.addBinding(ssrEffect, "thickness", {
            label: "厚度",
            min: 0,
            max: 0.1,
            step: 0.001
        });

        settingsFolder.addBinding(ssrEffect, "infiniteThick", {
            label: "无限厚度"
        });

        settingsFolder.addBinding(ssrEffect, "maxDistance", {
            label: "最大距离",
            min: 0,
            max: 0.5,
            step: 0.001
        });

        settingsFolder.addBinding(ssrEffect, "opacity", {
            label: "不透明度",
            min: 0,
            max: 1,
            step: 0.01
        });

        settingsFolder.addBinding(ssrEffect, "fresnel", {
            label: "菲涅尔效应"
        });

        settingsFolder.addBinding(ssrEffect, "distanceAttenuation", {
            label: "距离衰减"
        });

        settingsFolder.addBinding(ssrEffect, "bouncing", {
            label: "多次反射"
        });

        settingsFolder.addBinding(ssrEffect, "blur", {
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
            // 更新所有材质的环境贴图强度
            scene.traverse((obj) => {
                if (obj.isMesh && obj.material) {
                    if (obj.material.envMap !== undefined || obj.material.envMapIntensity !== undefined) {
                        obj.material.envMapIntensity = e.value;
                        obj.material.needsUpdate = true;
                    }
                }
            });
        });
    } else {
        // 创建错误信息面板
        const errorFolder = pane.addFolder({ title: "SSR错误" });
        errorFolder.addBinding({ info: "SSR效果初始化失败，将使用标准渲染。" }, "info", {
            readonly: true,
            label: "错误信息"
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

        // 更新地面反射器尺寸
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

        // 如果SSR效果可用且出现了法线纹理错误，尝试额外的补救措施
        if (ssrEffect && ssrEffect.normalPass) {
            try {
                // 手动更新normalPass的渲染目标
                if (ssrEffect.normalPass.renderTarget) {
                    const rt = ssrEffect.normalPass.renderTarget;
                    if (rt.width < 1 || rt.height < 1) {
                        console.log("修复normalPass渲染目标尺寸");
                        rt.setSize(
                            Math.max(1, container.clientWidth * 0.5),
                            Math.max(1, container.clientHeight * 0.5)
                        );
                    }
                }
            } catch (e) {
                console.error("尝试修复normalPass时出错:", e);
            }
        }

        // 渲染
        composer.render(deltaTime);

        requestAnimationFrame(render);
    });
})); 