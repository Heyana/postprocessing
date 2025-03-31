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

import * as THREE from "three";
import {
    BlendFunction,
    SSGIEffect,
    OverrideMaterialManager,
    EffectComposer,
    EffectPass,
    SSREffect,
    RenderPass
} from "postprocessing";

// 导入 VelocityDepthNormalPass - 使用项目内的路径

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

// 创建一组具有不同材质特性的球体
function createMaterialSpheres() {
    const group = new Group();

    // 创建具有不同粗糙度和金属度的球体
    const sphereGeometry = new SphereGeometry(0.5, 32, 32);
    const sphereCount = 5;
    const spacing = 1.2;

    // 创建一行具有不同粗糙度的球体（从光滑到粗糙）
    for (let i = 0; i < sphereCount; i++) {
        const roughness = i / (sphereCount - 1);
        const sphere = new Mesh(
            sphereGeometry,
            new MeshStandardMaterial({
                color: 0xffffff,
                roughness: roughness,
                metalness: 0.0
            })
        );
        sphere.position.set(i * spacing - (spacing * (sphereCount - 1)) / 2, 1, 0);
        sphere.castShadow = sphere.receiveShadow = true;
        group.add(sphere);
    }

    // 创建一行具有不同金属度的球体（从非金属到金属）
    for (let i = 0; i < sphereCount; i++) {
        const metalness = i / (sphereCount - 1);
        const sphere = new Mesh(
            sphereGeometry,
            new MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.1,
                metalness: metalness
            })
        );
        sphere.position.set(i * spacing - (spacing * (sphereCount - 1)) / 2, -1, 0);
        sphere.castShadow = sphere.receiveShadow = true;
        group.add(sphere);
    }

    return group;
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
    controls.position.set(2, 2, 10);

    // 场景、灯光和对象
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加增强的灯光
    const lights = Shapes.createLights();
    // 增强直接光照强度
    lights.children.forEach(light => {
        if (light.isDirectionalLight) {
            light.intensity *= 1.5; // 增强直射光强度
        } else if (light.isAmbientLight) {
            light.intensity *= 2.0; // 显著增强环境光
        }
    });
    scene.add(lights);

    // 添加场景对象
    const actors = Shapes.createActors();
    scene.add(actors);

    // 添加材质球体组
    const materialSpheres = createMaterialSpheres();
    scene.add(materialSpheres);

    // 添加角色模型
    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.2);
    actors.add(riggedSimple.scene);

    // 设置动画
    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    // 排列场景中的对象
    const step = 2.0 * Math.PI / actors.children.length;
    const radius = 3.0;
    let angle = 3.5;

    for (const mesh of actors.children) {
        // 将对象排列成圆形
        mesh.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
        angle += step;
    }

    // 后处理
    OverrideMaterialManager.workaroundEnabled = true;
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);

    const composer = new EffectComposer(renderer, { multisampling });

    // 添加基本渲染通道
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 添加VelocityDepthNormalPass通道 - 这是SSGI效果所必需的
    // const velocityDepthNormalPass = new VelocityDepthNormalPass(scene, camera);
    // composer.addPass(velocityDepthNormalPass);

    // 设置渲染器色调映射
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;

    // 创建SSGI效果 - 使用简化配置
    const ssgiEffect = new SSGIEffect(composer, scene, camera, {
        // 基本参数
        distance: 10,
        thickness: 10,
        autoThickness: true,

        // 质量控制
        resolutionScale: 1.0,
        steps: 20,
        refineSteps: 5,

        // 降噪设置
        denoiseIterations: 2,
        denoiseKernel: 3,
        denoiseDiffuse: 20,
        denoiseSpecular: 20,
        denoiseAlgorithm: "gaussian-bilateral", // 默认使用高斯双边滤波器

        // 高斯双边滤波器参数
        sigmaSpace: 2.0,
        sigmaRange: 0.05,
        radius: 3,

        // 模式和混合
        mode: "ssgi",
        diffuseOnly: false,
        missedRays: true,
        blend: 0.9,

        // 采样策略
        importanceSampling: true,

        // 其他
        enableDynamicRayCount: true,
        enableJitter: true,

        // 速度通道
        // velocityDepthNormalPass: velocityDepthNormalPass,

        // 尺寸
        width: container.clientWidth,
        height: container.clientHeight
    });

    // 确保SSGI Pass被设置为最后一个通道
    composer.addPass(new EffectPass(camera, ssgiEffect));
    console.log('Log-- ', ssgiEffect, 'ssgiEffect');

    // UI控制面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 灯光设置
    const lightFolder = pane.addFolder({ title: "灯光设置" });

    // 查找场景中的灯光并添加控制
    let directionalLight = null;
    let ambientLight = null;

    lights.children.forEach(light => {
        if (light.isDirectionalLight) {
            directionalLight = light;
        } else if (light.isAmbientLight) {
            ambientLight = light;
        }
    });

    if (directionalLight) {
        lightFolder.addBinding(directionalLight, "intensity", {
            min: 0, max: 5, step: 0.1,
            label: "主光源强度"
        });
        lightFolder.addBinding(directionalLight.color, "r", {
            min: 0, max: 1, step: 0.01,
            label: "主光源-红"
        });
        lightFolder.addBinding(directionalLight.color, "g", {
            min: 0, max: 1, step: 0.01,
            label: "主光源-绿"
        });
        lightFolder.addBinding(directionalLight.color, "b", {
            min: 0, max: 1, step: 0.01,
            label: "主光源-蓝"
        });
    }

    if (ambientLight) {
        lightFolder.addBinding(ambientLight, "intensity", {
            min: 0, max: 5, step: 0.1,
            label: "环境光强度"
        });
        lightFolder.addBinding(ambientLight.color, "r", {
            min: 0, max: 1, step: 0.01,
            label: "环境光-红"
        });
        lightFolder.addBinding(ambientLight.color, "g", {
            min: 0, max: 1, step: 0.01,
            label: "环境光-绿"
        });
        lightFolder.addBinding(ambientLight.color, "b", {
            min: 0, max: 1, step: 0.01,
            label: "环境光-蓝"
        });
    }

    // SSGI设置
    const folder = pane.addFolder({ title: "SSGI设置" });

    folder.addBinding(ssgiEffect, "distance", { min: 0.1, max: 20, step: 0.1 });
    folder.addBinding(ssgiEffect, "thickness", { min: 0.1, max: 20, step: 0.1 });
    folder.addBinding(ssgiEffect, "resolutionScale", { min: 0.25, max: 1, step: 0.05 });

    // 添加混合模式控制
    folder.addBinding(ssgiEffect, "blend", { min: 0, max: 1, step: 0.01, label: "混合强度" });

    // 使用checkbox代替自定义对象
    folder.addBinding({ enabled: true }, "enabled", { label: "启用SSGI" })
        .on("change", (e) => {
            // 通过控制EffectPass的enabled属性来安全地切换效果
            composer.passes.forEach(pass => {
                if (pass.effects && pass.effects.length > 0) {
                    // 找到包含SSGI效果的EffectPass
                    if (pass.effects.some(effect => effect instanceof SSGIEffect)) {
                        pass.enabled = e.value;
                    }
                }
            });
        });

    // 混合模式选择 - 使用预定义的安全选项
    const blendModes = {
        "正常": BlendFunction.NORMAL,
        "相加": BlendFunction.ADD,
        "屏幕": BlendFunction.SCREEN
    };

    const blendSettings = {
        blendFunction: "正常"
    };

    folder.addBinding(blendSettings, "blendFunction", {
        options: blendModes,
        label: "混合模式"
    }).on("change", (e) => {
        try {
            ssgiEffect.blendMode.blendFunction = blendModes[e.value];
        } catch (err) {
            console.warn("更改混合模式时出错:", err);
        }
    });

    // 采样设置
    const samplingFolder = pane.addFolder({ title: "采样设置" });
    samplingFolder.addBinding(ssgiEffect, "steps", { min: 1, max: 40, step: 1 });
    samplingFolder.addBinding(ssgiEffect, "refineSteps", { min: 0, max: 10, step: 1 });
    samplingFolder.addBinding(ssgiEffect, "importanceSampling");
    samplingFolder.addBinding(ssgiEffect, "missedRays");

    // 降噪设置
    const denoiseFolder = pane.addFolder({ title: "降噪设置" });

    // 添加降噪算法选择
    const denoiseAlgorithmSettings = {
        algorithm: "gaussian-bilateral"  // 改为默认使用高斯双边降噪
    };

    denoiseFolder.addBinding(denoiseAlgorithmSettings, "algorithm", {
        options: {
            "泊松滤波器": "poisson",
            "高斯双边滤波器": "gaussian-bilateral"
        },
        label: "降噪算法"
    }).on("change", (e) => {
        // 更新SSGI效果的降噪算法
        ssgiEffect.denoiseAlgorithm = e.value;

        // 需要重新创建效果的降噪部分
        ssgiEffect.reset();

        // 输出日志
        console.log("切换到降噪算法:", e.value);

        // 更新UI显示 - 在切换算法时显示/隐藏相关控件
        gaussianBilateralFolder.hidden = e.value !== "gaussian-bilateral";

        // 刷新UI
        pane.refresh();
    });

    denoiseFolder.addBinding(ssgiEffect, "denoiseIterations", { min: 1, max: 3, step: 1 });
    denoiseFolder.addBinding(ssgiEffect, "depthPhi", { min: 0.1, max: 10, step: 0.1 });
    denoiseFolder.addBinding(ssgiEffect, "normalPhi", { min: 0.1, max: 100, step: 0.1 });
    denoiseFolder.addBinding(ssgiEffect, "roughnessPhi", { min: 0.1, max: 10, step: 0.1 });

    // 预设选项
    const presets = {
        preset: "medium"
    };

    folder.addBinding(presets, "preset", {
        options: {
            低质量: "low",
            中质量: "medium",
            高质量: "high"
        }
    }).on("change", (e) => {
        // 应用预设
        switch (e.value) {
            case "low":
                ssgiEffect.steps = 10;
                ssgiEffect.refineSteps = 2;
                ssgiEffect.resolutionScale = 0.5;
                break;
            case "medium":
                ssgiEffect.steps = 20;
                ssgiEffect.refineSteps = 4;
                ssgiEffect.resolutionScale = 0.75;
                break;
            case "high":
                ssgiEffect.steps = 40;
                ssgiEffect.refineSteps = 4;
                ssgiEffect.resolutionScale = 1;
                break;
        }

        // 更新UI显示
        pane.refresh();
    });

    // 材质调整选项
    const materialFolder = pane.addFolder({ title: "场景材质" });

    // 创建一个函数来遍历场景中的所有材质
    function traverseMaterials(object, callback) {
        if (object.material) {
            callback(object.material);
        }

        if (object.children && object.children.length > 0) {
            object.children.forEach(child => traverseMaterials(child, callback));
        }
    }

    // 创建材质控制对象
    const materialSettings = {
        roughness: 0.5,
        metalness: 0.5,
        color: '#ffffff',
        applyToAll: function () {
            traverseMaterials(scene, (material) => {
                if (material.isMeshStandardMaterial) {
                    material.roughness = materialSettings.roughness;
                    material.metalness = materialSettings.metalness;
                    material.color.set(materialSettings.color);
                    material.needsUpdate = true;
                }
            });
        },
        resetMaterials: function () {
            // 重置材质球体
            materialSpheres.children.forEach((sphere, index) => {
                const material = sphere.material;
                if (material.isMeshStandardMaterial) {
                    // 根据位置设置合适的属性
                    if (index < 5) { // 上排 - 不同粗糙度
                        material.roughness = index / 4;
                        material.metalness = 0.0;
                    } else { // 下排 - 不同金属度
                        material.roughness = 0.1;
                        material.metalness = (index - 5) / 4;
                    }
                    material.color.set(0xffffff);
                    material.needsUpdate = true;
                }
            });
        }
    };

    materialFolder.addBinding(materialSettings, 'roughness', { min: 0, max: 1, step: 0.01 });
    materialFolder.addBinding(materialSettings, 'metalness', { min: 0, max: 1, step: 0.01 });
    materialFolder.addBinding(materialSettings, 'color');

    // 使用addButton创建按钮，而非addBinding绑定函数
    materialFolder.addButton({
        title: "应用到所有材质"
    }).on("click", () => {
        traverseMaterials(scene, (material) => {
            if (material.isMeshStandardMaterial) {
                material.roughness = materialSettings.roughness;
                material.metalness = materialSettings.metalness;
                material.color.set(materialSettings.color);
                material.needsUpdate = true;
            }
        });
    });

    materialFolder.addButton({
        title: "重置材质"
    }).on("click", () => {
        // 重置材质球体
        materialSpheres.children.forEach((sphere, index) => {
            const material = sphere.material;
            if (material.isMeshStandardMaterial) {
                // 根据位置设置合适的属性
                if (index < 5) { // 上排 - 不同粗糙度
                    material.roughness = index / 4;
                    material.metalness = 0.0;
                } else { // 下排 - 不同金属度
                    material.roughness = 0.1;
                    material.metalness = (index - 5) / 4;
                }
                material.color.set(0xffffff);
                material.needsUpdate = true;
            }
        });
    });

    // 场景设置
    const sceneFolder = pane.addFolder({ title: "场景控制" });

    // 添加调试面板，用于查看不同通道
    const debugFolder = pane.addFolder({ title: "调试视图" });

    // 可查看的纹理选项
    const textureOptions = {
        "最终效果": "final",
        "SSGI原始输出": "ssgi_raw",
        "降噪后结果": "denoised",
        "降噪中间步骤": "denoise_step",
        "G-Buffer法线": "normal",
        "G-Buffer粗糙度": "roughness",
        "G-Buffer金属度": "metalness"
    };

    const debugSettings = {
        currentView: "final",
        denoiseMidStep: 0
    };

    // 存储原始输出纹理的引用，以便可以在调试和正常模式之间切换
    const originalOutputTexture = ssgiEffect.outputTexture;

    // 更新通道视图的函数
    function updateDebugView() {
        // 重置到原始输出
        ssgiEffect.outputTexture = originalOutputTexture;

        switch (debugSettings.currentView) {
            case "final":
                // 使用最终合成结果
                ssgiEffect.outputTexture = originalOutputTexture;
                break;
            case "ssgi_raw":
                // 查看SSGI原始输出（未经降噪处理）
                if (ssgiEffect.ssgiPass && ssgiEffect.ssgiPass.texture) {
                    ssgiEffect.outputTexture = ssgiEffect.ssgiPass.texture;
                    console.log("显示SSGI原始输出");
                }
                break;
            case "denoised":
                // 查看降噪后的结果
                if (ssgiEffect.denoiser && ssgiEffect.denoiser.texture) {
                    ssgiEffect.outputTexture = ssgiEffect.denoiser.texture;
                    console.log("显示降噪后结果");
                }
                break;
            case "denoise_step":
                // 查看降噪中间步骤
                if (ssgiEffect.denoiser && ssgiEffect.denoiser.denoisePass) {
                    // 尝试访问多步降噪的中间结果
                    const stepIndex = Math.min(debugSettings.denoiseMidStep, 1); // 限制到可用纹理
                    if (ssgiEffect.denoiser.denoisePass.renderTargetB &&
                        ssgiEffect.denoiser.denoisePass.renderTargetB.texture &&
                        ssgiEffect.denoiser.denoisePass.renderTargetB.texture[stepIndex]) {
                        ssgiEffect.outputTexture = ssgiEffect.denoiser.denoisePass.renderTargetB.texture[stepIndex];
                        console.log(`显示降噪步骤 ${stepIndex} 的结果`);
                    }
                }
                break;
            case "normal":
            case "roughness":
            case "metalness":
                // 使用G-Buffer中的特定通道
                ssgiEffect.outputTexture = debugSettings.currentView;
                console.log(`显示G-Buffer ${debugSettings.currentView} 通道`);
                break;
        }
    }

    debugFolder.addBinding(debugSettings, "currentView", {
        options: textureOptions,
        label: "查看通道"
    }).on("change", updateDebugView);

    // 如果选择了中间降噪步骤，允许选择步骤索引
    debugFolder.addBinding(debugSettings, "denoiseMidStep", {
        min: 0, max: 1, step: 1,
        label: "降噪步骤索引",
        hidden: debugSettings.currentView !== "denoise_step"
    }).on("change", () => {
        if (debugSettings.currentView === "denoise_step") {
            updateDebugView();
        }
    });

    // 添加调试辅助按钮
    debugFolder.addButton({
        title: "诊断黑点"
    }).on("click", () => {
        // 打印关键信息到控制台
        console.log("SSGI诊断信息:", {
            "SSGI模式": ssgiEffect.mode,
            "采样步数": ssgiEffect.steps,
            "降噪迭代": ssgiEffect.denoiseIterations,
            "分辨率缩放": ssgiEffect.resolutionScale,
            "降噪算法": ssgiEffect.denoiseAlgorithm,
            "纹理情况": {
                "原始SSGI纹理": ssgiEffect.ssgiPass && ssgiEffect.ssgiPass.texture ? "可用" : "不可用",
                "降噪器纹理": ssgiEffect.denoiser && ssgiEffect.denoiser.texture ? "可用" : "不可用",
                "denoisePass纹理": ssgiEffect.denoiser && ssgiEffect.denoiser.denoisePass ? "可用" : "不可用"
            }
        });

        // 尝试直接切换到高斯双边降噪
        if (ssgiEffect.denoiseAlgorithm !== "gaussian-bilateral") {
            console.log("自动切换到高斯双边降噪尝试解决黑点问题");

            // 更新UI
            denoiseAlgorithmSettings.algorithm = "gaussian-bilateral";

            // 更新效果
            ssgiEffect.denoiseAlgorithm = "gaussian-bilateral";
            ssgiEffect.reset();

            // 刷新UI
            pane.refresh();
        }

        // 依次切换到不同视图进行比较
        debugSettings.currentView = "ssgi_raw";
        updateDebugView();

        // 设置一个延时，先查看原始SSGI，再查看降噪后的结果
        setTimeout(() => {
            debugSettings.currentView = "denoised";
            updateDebugView();
            pane.refresh();
        }, 2000);
    });

    // 在debugFolder部分添加一个紧急修复按钮，用于在高斯滤波器出现问题时直接切回泊松降噪
    debugFolder.addButton({
        title: "紧急修复 - 切回泊松降噪"
    }).on("click", () => {
        console.log("执行紧急修复 - 切回泊松降噪算法");

        // 更新UI选择
        denoiseAlgorithmSettings.algorithm = "poisson";

        // 直接设置算法
        ssgiEffect.denoiseAlgorithm = "poisson";

        // 重置效果
        ssgiEffect.reset();

        // 显式刷新UI
        pane.refresh();

        // 提示用户已切换回泊松降噪
        alert("已切换回泊松降噪算法，场景应该可以正常显示");
    });

    // 添加专门的高斯双边滤波器参数控制
    const gaussianBilateralFolder = pane.addFolder({
        title: "高斯双边滤波器参数",
        expanded: true,  // 默认展开
        hidden: denoiseAlgorithmSettings.algorithm !== "gaussian-bilateral"
    });

    // 高斯双边滤波器的特殊参数
    gaussianBilateralFolder.addBinding(ssgiEffect, "sigmaSpace", {
        min: 0.5, max: 5.0, step: 0.1,
        label: "空间标准差"
    });

    gaussianBilateralFolder.addBinding(ssgiEffect, "sigmaRange", {
        min: 0.01, max: 0.2, step: 0.01,
        label: "范围标准差"
    });

    gaussianBilateralFolder.addBinding(ssgiEffect, "radius", {
        min: 1, max: 5, step: 0.5,
        label: "采样半径"
    });

    // 将迭代控件移到高斯双边滤波器文件夹中
    gaussianBilateralFolder.addBinding(ssgiEffect, "denoiseIterations", {
        min: 1, max: 3, step: 1,
        label: "迭代次数"
    });

    // 高斯双边滤波器的预设按钮
    gaussianBilateralFolder.addButton({
        title: "轻度降噪 (保留细节)"
    }).on("click", () => {
        ssgiEffect.sigmaSpace = 1.0;
        ssgiEffect.sigmaRange = 0.03;
        ssgiEffect.radius = 2;
        ssgiEffect.denoiseIterations = 1;
        ssgiEffect.reset();
        pane.refresh();
    });

    gaussianBilateralFolder.addButton({
        title: "中度降噪 (平衡)"
    }).on("click", () => {
        ssgiEffect.sigmaSpace = 2.0;
        ssgiEffect.sigmaRange = 0.05;
        ssgiEffect.radius = 3;
        ssgiEffect.denoiseIterations = 2;
        ssgiEffect.reset();
        pane.refresh();
    });

    gaussianBilateralFolder.addButton({
        title: "强力降噪 (消除噪点)"
    }).on("click", () => {
        ssgiEffect.sigmaSpace = 3.0;
        ssgiEffect.sigmaRange = 0.1;
        ssgiEffect.radius = 4;
        ssgiEffect.denoiseIterations = 3;
        ssgiEffect.reset();
        pane.refresh();
    });

    // 降噪强度调节（方便测试黑点与降噪的关系）
    debugFolder.addBinding(ssgiEffect, "denoiseIterations", {
        min: 0, max: 5, step: 1,
        label: "降噪迭代次数"
    }).on("change", updateDebugView);

    // 添加SSGI步数实时调整（可能会影响黑点）
    debugFolder.addBinding(ssgiEffect, "steps", {
        min: 4, max: 40, step: 1,
        label: "SSGI采样步数"
    }).on("change", () => {
        // 重置SSGI效果以应用新的采样步数
        ssgiEffect.reset();
        updateDebugView();
    });

    // 添加其他可能影响黑点的参数
    debugFolder.addBinding(ssgiEffect, "thickness", {
        min: 0.1, max: 5.0, step: 0.1,
        label: "厚度"
    }).on("change", () => {
        ssgiEffect.reset();
        updateDebugView();
    });

    debugFolder.addBinding(ssgiEffect, "resolutionScale", {
        min: 0.25, max: 1.0, step: 0.05,
        label: "分辨率缩放"
    }).on("change", () => {
        ssgiEffect.reset();
        updateDebugView();
    });

    // 添加黑点修复选项
    const fixSettings = {
        fixEnabled: false,
        clampValue: 5.0,
        minLuminance: 0.01,
        fixType: "clamp"
    };

    const fixFolder = pane.addFolder({ title: "黑点修复" });

    fixFolder.addBinding(fixSettings, "fixEnabled", {
        label: "启用黑点修复"
    }).on("change", (e) => {
        // 应用或移除黑点修复
        applyBlackSpotFix(e.value);
    });

    fixFolder.addBinding(fixSettings, "fixType", {
        options: {
            "限制亮度": "clamp",
            "最小亮度": "minLuminance",
            "替换降噪器": "replaceDenoiser"
        },
        label: "修复类型"
    }).on("change", () => {
        if (fixSettings.fixEnabled) {
            applyBlackSpotFix(true);
        }
    });

    fixFolder.addBinding(fixSettings, "clampValue", {
        min: 1.0, max: 10.0, step: 0.1,
        label: "亮度限制值"
    }).on("change", () => {
        if (fixSettings.fixEnabled && fixSettings.fixType === "clamp") {
            applyBlackSpotFix(true);
        }
    });

    fixFolder.addBinding(fixSettings, "minLuminance", {
        min: 0.001, max: 0.1, step: 0.001,
        label: "最小亮度"
    }).on("change", () => {
        if (fixSettings.fixEnabled && fixSettings.fixType === "minLuminance") {
            applyBlackSpotFix(true);
        }
    });

    // 黑点修复逻辑
    function applyBlackSpotFix(enable) {
        if (enable) {
            console.log(`应用黑点修复: ${fixSettings.fixType}`);

            // 根据修复类型应用不同的解决方案
            switch (fixSettings.fixType) {
                case "clamp":
                    // 方案1: 限制SSGI的亮度值，防止过亮的值导致黑点
                    if (ssgiEffect.ssgiPass && ssgiEffect.ssgiPass.fullscreenMaterial) {
                        // 添加亮度限制到shader
                        const material = ssgiEffect.ssgiPass.fullscreenMaterial;
                        if (!material.defines.CLAMP_INTENSITY) {
                            material.defines.CLAMP_INTENSITY = "";
                            material.uniforms.maxIntensity = { value: fixSettings.clampValue };

                            // 修补片段着色器，在输出之前添加亮度限制
                            const originalFragmentShader = material.fragmentShader;
                            if (!originalFragmentShader.includes("clamp(gl_FragColor.rgb, 0.0, maxIntensity)")) {
                                const patchedShader = originalFragmentShader.replace(
                                    /gl_FragColor\s*=\s*vec4\([^;]+;/g,
                                    (match) => {
                                        return match.slice(0, -1) +
                                            ";\ngl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, maxIntensity);";
                                    }
                                );

                                material.fragmentShader = patchedShader;
                                material.needsUpdate = true;
                                ssgiEffect.reset();
                            }
                        } else {
                            // 更新亮度限制值
                            material.uniforms.maxIntensity.value = fixSettings.clampValue;
                        }
                    }
                    break;

                case "minLuminance":
                    // 方案2: 设置最小亮度，防止过暗的值
                    if (ssgiEffect.ssgiPass && ssgiEffect.ssgiPass.fullscreenMaterial) {
                        const material = ssgiEffect.ssgiPass.fullscreenMaterial;
                        if (!material.defines.MIN_LUMINANCE) {
                            material.defines.MIN_LUMINANCE = "";
                            material.uniforms.minLuminance = { value: fixSettings.minLuminance };

                            // 修补片段着色器，设置最小亮度
                            const originalFragmentShader = material.fragmentShader;
                            if (!originalFragmentShader.includes("max(luminance(gl_FragColor.rgb), minLuminance)")) {
                                // 添加luminance函数（如果不存在）
                                let patchedShader = originalFragmentShader;
                                if (!patchedShader.includes("float luminance(vec3 color)")) {
                                    patchedShader = "float luminance(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }\n" + patchedShader;
                                }

                                // 修补输出
                                patchedShader = patchedShader.replace(
                                    /gl_FragColor\s*=\s*vec4\([^;]+;/g,
                                    (match) => {
                                        return match.slice(0, -1) +
                                            ";\nfloat lum = luminance(gl_FragColor.rgb);\nif(lum > 0.0 && lum < minLuminance) { gl_FragColor.rgb *= minLuminance / lum; }";
                                    }
                                );

                                material.fragmentShader = patchedShader;
                                material.needsUpdate = true;
                                ssgiEffect.reset();
                            }
                        } else {
                            // 更新最小亮度值
                            material.uniforms.minLuminance.value = fixSettings.minLuminance;
                        }
                    }
                    break;

                case "replaceDenoiser":
                    // 方案3: 使用更保守的降噪设置
                    ssgiEffect.depthPhi = 2.0;  // 更保守的深度平滑
                    ssgiEffect.normalPhi = 50.0; // 更保守的法线平滑
                    ssgiEffect.roughnessPhi = 1.0; // 更保守的粗糙度平滑
                    ssgiEffect.denoiseIterations = 3; // 使用更多迭代
                    ssgiEffect.reset();
                    break;
            }

            // 应用更改后刷新视图
            updateDebugView();
        } else {
            console.log("禁用黑点修复");

            // 移除所有修复
            if (ssgiEffect.ssgiPass && ssgiEffect.ssgiPass.fullscreenMaterial) {
                const material = ssgiEffect.ssgiPass.fullscreenMaterial;

                // 移除亮度限制定义
                delete material.defines.CLAMP_INTENSITY;
                delete material.defines.MIN_LUMINANCE;

                // 重置降噪参数
                ssgiEffect.depthPhi = 0.5;
                ssgiEffect.normalPhi = 5.0;
                ssgiEffect.roughnessPhi = 0.5;
                ssgiEffect.denoiseIterations = 2;

                material.needsUpdate = true;
                ssgiEffect.reset();
                updateDebugView();
            }
        }
    }

    // 使用标准按钮API创建比较按钮
    let compareMode = false;

    const compareButton = sceneFolder.addButton({
        title: "关闭SSGI（比较）"
    }).on("click", () => {
        compareMode = !compareMode;

        // 获取SSGI效果所在的EffectPass
        let ssgiPass = null;
        composer.passes.forEach(pass => {
            if (pass.effects && pass.effects.length > 0) {
                if (pass.effects.some(effect => effect instanceof SSGIEffect)) {
                    ssgiPass = pass;
                }
            }
        });

        if (ssgiPass) {
            // 切换效果
            ssgiPass.enabled = !compareMode;
        }

        // 更新按钮文本
        compareButton.title = compareMode ? "开启SSGI" : "关闭SSGI（比较）";
    });

    // 调整大小处理
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