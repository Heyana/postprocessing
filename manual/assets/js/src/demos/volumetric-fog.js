// 移除直接导入，使用全局 THREE 对象
// 注意：为确保应用中只有一个 Three.js 实例，我们应该在 webpack 配置中添加:
// resolve: { alias: { 'three': path.resolve('./node_modules/three') } }
import * as THREE from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    VolumetricFogEffect,
    BloomEffect,
    SSAOEffect,
    DepthPass,
    ShaderPass
} from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 使用导入的THREE对象
const {
    AmbientLight,
    BoxGeometry,
    CubeTextureLoader,
    DirectionalLight,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    PointLight,
    Scene,
    SphereGeometry,
    Vector3,
    WebGLRenderer,
    Uniform,
    Color
} = THREE;

function load() {
    const assets = new Map();
    const cubeTextureLoader = new CubeTextureLoader();

    const path = document.baseURI + "img/textures/skies/sunset/";
    const format = ".png";
    const urls = [
        path + "px" + format, path + "nx" + format,
        path + "py" + format, path + "ny" + format,
        path + "pz" + format, path + "nz" + format
    ];

    return new Promise((resolve, reject) => {
        cubeTextureLoader.load(urls, (cubeTexture) => {
            assets.set("sky", cubeTexture);
            resolve(assets);
        }, null, reject);
    });
}

window.addEventListener("load", () => load().then((assets) => {
    // 渲染器设置
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: false
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    renderer.shadowMap.enabled = true;

    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 相机和控制器设置
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = true;
    settings.translation.sensitivity = 1.0;
    controls.position.set(0, 2, 9);
    controls.lookAt(new Vector3(0, 0, 0));

    // 场景设置
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加环境光和主光源
    const ambientLight = new AmbientLight(0x404040, 1.0);
    scene.add(ambientLight);

    // 添加主方向光（用于照亮雾气和产生阴影）
    const directionalLight = new DirectionalLight(0xffbb77, 1.5);
    directionalLight.position.set(-2, 4, 3);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.far = 20;
    directionalLight.shadow.bias = -0.0001;
    scene.add(directionalLight);

    // 添加一个散射点光源（用于展示体积雾的光散射效果）
    const pointLight = new PointLight(0x3366ff, 15, 20);
    pointLight.position.set(2, 3, 2);
    scene.add(pointLight);

    // 添加第二个点光源，增强体积雾效果
    const pointLight2 = new PointLight(0xff6633, 12, 15);
    pointLight2.position.set(-5, 2, -3);
    scene.add(pointLight2);

    // 创建一个地面
    const plane = new Mesh(
        new PlaneGeometry(20, 20),
        new MeshStandardMaterial({ color: 0x444455, roughness: 0.8 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -1;
    plane.receiveShadow = true;
    scene.add(plane);

    // 添加一些物体以便展示体积雾如何与场景交互
    // 中间的大立方体
    const box = new Mesh(
        new BoxGeometry(1.5, 1.5, 1.5),
        new MeshStandardMaterial({ color: 0x884422, roughness: 0.5 })
    );
    box.position.set(0, 0, 0);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);

    // 添加一些小球体围绕中心
    const spheres = [];
    const sphereCount = 5;
    const radius = 3;

    for (let i = 0; i < sphereCount; i++) {
        const angle = (i / sphereCount) * Math.PI * 2;
        const sphere = new Mesh(
            new SphereGeometry(0.5, 32, 32),
            new MeshStandardMaterial({
                color: 0x3366FF,
                roughness: 0.2,
                metalness: 0.8
            })
        );

        sphere.position.x = Math.cos(angle) * radius;
        sphere.position.z = Math.sin(angle) * radius;
        sphere.position.y = 0.5;
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        scene.add(sphere);
        spheres.push(sphere);
    }

    // 效果合成器设置
    const composer = new EffectComposer(renderer, {
        depthBuffer: true,
        stencilBuffer: false
    });

    // 基本渲染通道
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 创建用于深度的单独渲染目标和渲染器
    // 这是为了完全分离深度渲染和效果渲染，避免反馈循环
    const depthRenderTarget = new THREE.WebGLRenderTarget(
        window.innerWidth * renderer.getPixelRatio(),
        window.innerHeight * renderer.getPixelRatio(),
        {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false
        }
    );

    // 创建用于深度复制的材质
    const depthCopyMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking
    });

    // 强制编译深度材质以避免首次渲染时的问题
    const dummyScene = new THREE.Scene();
    const dummySphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 8),
        depthCopyMaterial
    );
    dummyScene.add(dummySphere);

    // 一次性预渲染以确保着色器已编译
    const dummyTarget = new THREE.WebGLRenderTarget(1, 1);
    const currentRenderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(dummyTarget);
    renderer.render(dummyScene, camera);
    renderer.setRenderTarget(currentRenderTarget);
    dummyTarget.dispose();

    // 为深度渲染创建独立的场景和相机的拷贝
    const depthScene = new THREE.Scene();
    const depthCamera = camera.clone();

    // 同步深度场景与主场景（仅用于渲染深度）
    function syncDepthScene() {
        try {
            // 同步相机参数
            depthCamera.position.copy(camera.position);
            depthCamera.rotation.copy(camera.rotation);
            depthCamera.quaternion.copy(camera.quaternion);
            depthCamera.scale.copy(camera.scale);
            depthCamera.fov = camera.fov;
            depthCamera.aspect = camera.aspect;
            depthCamera.near = camera.near;
            depthCamera.far = camera.far;
            depthCamera.updateProjectionMatrix();

            // 不执行复杂的场景克隆，让 renderDepth() 函数负责创建网格
            // 这里只需要确保相机参数同步即可
            return true;
        } catch (error) {
            console.error("同步深度场景时出错:", error);
            return false;
        }
    }

    // 创建独立的深度渲染函数
    function renderDepth() {
        try {
            // 同步深度相机与主相机
            syncDepthScene();

            // 保存当前的渲染目标
            const currentRenderTarget = renderer.getRenderTarget();

            // 清空深度场景中的所有现有网格
            while (depthScene.children.length > 0) {
                depthScene.remove(depthScene.children[0]);
            }

            // 为每个场景中的可见网格创建一个深度渲染用的克隆
            scene.traverseVisible(object => {
                if (object.isMesh) {
                    try {
                        // 创建一个新的网格，复用原始网格的几何体但使用深度材质
                        const clonedMesh = new THREE.Mesh(
                            object.geometry,
                            depthCopyMaterial // 直接使用深度材质
                        );

                        // 复制变换信息
                        clonedMesh.position.copy(object.position);
                        clonedMesh.rotation.copy(object.rotation);
                        clonedMesh.quaternion.copy(object.quaternion);
                        clonedMesh.scale.copy(object.scale);

                        // 确保世界矩阵正确复制
                        object.updateMatrixWorld(true);
                        clonedMesh.matrixWorld.copy(object.matrixWorld);

                        // 保留可见性
                        clonedMesh.visible = object.visible;

                        // 添加到深度场景
                        depthScene.add(clonedMesh);
                    } catch (e) {
                        console.error("克隆网格时出错:", e);
                    }
                }
            });

            // 更新深度场景矩阵
            depthScene.updateMatrixWorld(true);

            // 设置深度渲染目标
            renderer.setRenderTarget(depthRenderTarget);

            // 清除帧缓冲区
            renderer.clear(true, true, true);

            // 渲染整个深度场景
            renderer.render(depthScene, depthCamera);

            // 输出调试信息
            if (depthRenderTarget.texture) {
                console.log("已成功渲染到深度纹理, 尺寸:",
                    depthRenderTarget.width, "x", depthRenderTarget.height);
            }

            // 恢复原始渲染目标
            renderer.setRenderTarget(currentRenderTarget);

            return depthRenderTarget.texture;
        } catch (error) {
            console.error("深度渲染错误:", error);
            console.error("错误堆栈:", error.stack);
            return null;
        }
    }

    // 创建体积雾效果
    const volumetricFogEffect = new VolumetricFogEffect({
        blendFunction: BlendFunction.NORMAL,
        density: 0.4,
        heightFalloff: 0.05,
        baseHeight: -2,
        color: 0xaabbcc,
        scattering: 0.7,
        extinction: 0.05,
        samples: 16
    });

    // 明确设置相机引用 - 这是关键
    volumetricFogEffect.uniforms.set("camera", new Uniform(camera));

    // 设置体积雾效果的光源属性
    volumetricFogEffect.setLight(
        directionalLight.position,
        directionalLight.color,
        directionalLight.intensity * 2
    );

    // 添加SSAO效果（为场景增加深度感）
    const ssaoEffect = new SSAOEffect(camera, null, {
        blendFunction: BlendFunction.MULTIPLY,
        samples: 16,
        rings: 7,
        distanceThreshold: 1.0,
        distanceFalloff: 0.0,
        rangeThreshold: 0.05,
        rangeFalloff: 0.1,
        luminanceInfluence: 0.6,
        radius: 7,
        scale: 0.85,
        bias: 0.5
    });

    // 添加泛光效果（增强光源的视觉效果）
    const bloomEffect = new BloomEffect({
        blendFunction: BlendFunction.SCREEN,
        kernelSize: 3,
        luminanceThreshold: 0.6,
        luminanceSmoothing: 0.3,
        intensity: 0.5
    });

    // 修改 setTimeout 以使用我们的独立深度渲染函数
    // 使用更长的延迟以确保场景完全加载
    const initDepthTexture = () => {
        try {
            // 手动渲染深度并设置给体积雾效果
            console.log("初始化独立深度渲染...");

            // 确保场景和相机已经准备好
            if (!scene || !camera) {
                console.warn("场景或相机未准备好，等待加载...");
                setTimeout(initDepthTexture, 250);
                return;
            }

            // 渲染深度
            const depthTexture = renderDepth();

            if (depthTexture) {
                console.log("初始深度纹理创建成功，设置给体积雾效果");
                // 设置深度纹理，使用RGBADepthPacking
                volumetricFogEffect.setDepthTexture(depthTexture, THREE.RGBADepthPacking);

                // 开启一次性调试输出
                volumetricFogEffect.debug = true;
            } else {
                console.warn("深度纹理创建失败，将在下一帧重试");
                setTimeout(initDepthTexture, 100);
            }
        } catch (error) {
            console.error("初始化深度纹理时出错:", error);
            console.error("错误堆栈:", error.stack);
            setTimeout(initDepthTexture, 250);  // 延迟重试
        }
    };

    setTimeout(initDepthTexture, 250);

    // 添加EffectPass到Composer之前，检查着色器是否可以成功编译
    function addEffectWithErrorHandling(composer, effect, camera) {
        try {
            const pass = new EffectPass(camera, effect);

            // 尝试创建通道但不立即添加到composer
            pass.initialize = function (renderer, alpha, frameBufferType) {
                try {
                    // 调用原始初始化
                    EffectPass.prototype.initialize.call(this, renderer, alpha, frameBufferType);
                    console.log(`${effect.name} 着色器编译成功`);
                    return true;
                } catch (error) {
                    console.error(`${effect.name} 着色器编译失败:`, error);

                    // 显示错误信息，帮助用户理解问题
                    const errorElement = document.createElement("div");
                    errorElement.style.position = "absolute";
                    errorElement.style.top = "10px";
                    errorElement.style.left = "10px";
                    errorElement.style.color = "red";
                    errorElement.style.background = "rgba(0,0,0,0.7)";
                    errorElement.style.padding = "10px";
                    errorElement.style.borderRadius = "5px";
                    errorElement.style.zIndex = "1000";
                    errorElement.innerHTML = `<h3>着色器编译错误</h3><p>${effect.name} 无法编译。请检查控制台以获取详细信息。</p>`;

                    document.body.appendChild(errorElement);
                    return false;
                }
            };

            composer.addPass(pass);
            return pass;
        } catch (error) {
            console.error(`无法创建 ${effect.name} 通道:`, error);
            return null;
        }
    }

    // 注意通道顺序：确保深度依赖型效果按正确顺序添加
    // SSAO通常需要在其他效果之前
    addEffectWithErrorHandling(composer, ssaoEffect, camera);

    // 体积雾效果
    addEffectWithErrorHandling(composer, volumetricFogEffect, camera);

    // 最后是泛光效果
    addEffectWithErrorHandling(composer, bloomEffect, camera);

    // 控制UI设置
    const pane = new Pane({ container: container.querySelector(".tp") });
    const fpsMeter = new FPSMeter();
    const clock = performance;
    let lastTime = performance.now();
    let lastDepthRenderTime = 0; // 跟踪上次深度纹理渲染时间

    // 添加FPS指示器
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 添加体积雾效果控制
    const fogFolder = pane.addFolder({ title: "体积雾效果" });
    fogFolder.addBinding(volumetricFogEffect, "density", { label: "密度", min: 0, max: 0.5, step: 0.01 });
    fogFolder.addBinding(volumetricFogEffect, "heightFalloff", { label: "高度衰减", min: 0, max: 0.5, step: 0.01 });
    fogFolder.addBinding(volumetricFogEffect, "baseHeight", { label: "基准高度", min: -5, max: 5, step: 0.1 });
    fogFolder.addBinding(volumetricFogEffect, "scattering", { label: "散射系数", min: 0, max: 1.0, step: 0.01 });
    fogFolder.addBinding(volumetricFogEffect, "extinction", { label: "衰减系数", min: 0, max: 1.0, step: 0.01 });

    // 雾气颜色控制
    const fogColorParams = { color: "#8899aa" };
    fogFolder.addBinding(fogColorParams, "color", { label: "雾颜色" }).on("change", (e) => {
        volumetricFogEffect.color.set(e.value);
    });

    // 光源控制
    const lightFolder = pane.addFolder({ title: "光源设置" });

    // 方向光控制
    const dirLightParams = {
        color: "#ffbb77",
        intensity: 1.5
    };

    lightFolder.addBinding(dirLightParams, "color", { label: "主光源颜色" }).on("change", (e) => {
        directionalLight.color.set(e.value);
        volumetricFogEffect.setLight(
            directionalLight.position,
            directionalLight.color,
            directionalLight.intensity
        );
    });

    lightFolder.addBinding(dirLightParams, "intensity", { label: "主光源强度", min: 0, max: 3, step: 0.1 }).on("change", (e) => {
        directionalLight.intensity = e.value;
        volumetricFogEffect.setLight(
            directionalLight.position,
            directionalLight.color,
            directionalLight.intensity
        );
    });

    // 点光源控制
    const pointLightParams = {
        color: "#3366ff",
        intensity: 10
    };

    lightFolder.addBinding(pointLightParams, "color", { label: "点光源颜色" }).on("change", (e) => {
        pointLight.color.set(e.value);
    });

    lightFolder.addBinding(pointLightParams, "intensity", { label: "点光源强度", min: 0, max: 20, step: 0.5 }).on("change", (e) => {
        pointLight.intensity = e.value;
    });

    // 预设选项
    const presets = {
        preset: "日间雾气"
    };

    const presetOptions = {
        "日间雾气": {
            density: 0.15,
            heightFalloff: 0.1,
            baseHeight: -1,
            color: "#8899aa",
            scattering: 0.2,
            extinction: 0.1,
            dirLightColor: "#ffbb77",
            dirLightIntensity: 1.5,
            pointLightColor: "#3366ff",
            pointLightIntensity: 10
        },
        "浓雾": {
            density: 0.3,
            heightFalloff: 0.05,
            baseHeight: -2,
            color: "#667788",
            scattering: 0.1,
            extinction: 0.2,
            dirLightColor: "#aaaaaa",
            dirLightIntensity: 1.0,
            pointLightColor: "#5599ff",
            pointLightIntensity: 15
        },
        "晨雾": {
            density: 0.1,
            heightFalloff: 0.15,
            baseHeight: -0.5,
            color: "#c4d7f0",
            scattering: 0.3,
            extinction: 0.05,
            dirLightColor: "#ffcc88",
            dirLightIntensity: 2.0,
            pointLightColor: "#80a0ff",
            pointLightIntensity: 5
        },
        "低地雾": {
            density: 0.4,
            heightFalloff: 0.4,
            baseHeight: -0.8,
            color: "#ffffff",
            scattering: 0.15,
            extinction: 0.05,
            dirLightColor: "#ffffaa",
            dirLightIntensity: 1.8,
            pointLightColor: "#aaccff",
            pointLightIntensity: 8
        }
    };

    fogFolder.addBinding(presets, "preset", {
        label: "预设",
        options: {
            "日间雾气": "日间雾气",
            "浓雾": "浓雾",
            "晨雾": "晨雾",
            "低地雾": "低地雾"
        }
    }).on("change", (e) => {
        const preset = presetOptions[e.value];

        volumetricFogEffect.density = preset.density;
        volumetricFogEffect.heightFalloff = preset.heightFalloff;
        volumetricFogEffect.baseHeight = preset.baseHeight;
        volumetricFogEffect.color.set(preset.color);
        volumetricFogEffect.scattering = preset.scattering;
        volumetricFogEffect.extinction = preset.extinction;

        fogColorParams.color = preset.color;

        directionalLight.color.set(preset.dirLightColor);
        directionalLight.intensity = preset.dirLightIntensity;

        pointLight.color.set(preset.pointLightColor);
        pointLight.intensity = preset.pointLightIntensity;

        dirLightParams.color = preset.dirLightColor;
        dirLightParams.intensity = preset.dirLightIntensity;

        pointLightParams.color = preset.pointLightColor;
        pointLightParams.intensity = preset.pointLightIntensity;

        volumetricFogEffect.setLight(
            directionalLight.position,
            directionalLight.color,
            directionalLight.intensity
        );

        pane.refresh();
    });

    // 响应式调整
    function onResize() {
        const dpr = window.devicePixelRatio;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        camera.fov = calculateVerticalFoV(90, aspect);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        renderer.setPixelRatio(dpr);
        composer.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // 设置调试标志
    let debugMode = 0.0; // 0=正常, 1=深度纹理, 2=线性深度

    // 添加键盘控制
    window.addEventListener("keydown", (event) => {
        // 按D键切换调试模式
        if (event.key === "d" || event.key === "D") {
            debugMode = (debugMode + 1.0) % 3.0;

            // 更新着色器中的调试标志
            volumetricFogEffect.uniforms.set("debug_mode", new Uniform(debugMode));

            // 输出当前调试模式
            const modes = ["正常渲染", "深度纹理", "线性深度"];
            console.log(`切换到调试模式: ${modes[Math.round(debugMode)]}`);
        }

        // 按R键重新渲染深度纹理
        if (event.key === "r" || event.key === "R") {
            console.log("手动刷新深度纹理");
            const depthTexture = renderDepth();
            if (depthTexture) {
                volumetricFogEffect.setDepthTexture(depthTexture, THREE.RGBADepthPacking);
            }
        }
    });

    // 动画循环
    requestAnimationFrame(function render(timestamp) {
        const currentTime = performance.now();
        const elapsed = (currentTime - lastTime) || 0;
        lastTime = currentTime;

        // 更新控制器 - 添加这一行修复交互问题
        controls.update(timestamp, elapsed * 0.001);

        // 更新动画
        box.rotation.x += elapsed * 0.0005;
        box.rotation.y += elapsed * 0.001;

        // 更新光源位置
        pointLight.position.set(
            Math.sin(currentTime * 0.001) * 10,
            4 + Math.sin(currentTime * 0.0005) * 2,
            Math.cos(currentTime * 0.001) * 10
        );

        // 更新第二个点光源的位置
        pointLight2.position.set(
            Math.sin(currentTime * 0.0008 + 2.0) * 8,
            3 + Math.cos(currentTime * 0.0006) * 2,
            Math.cos(currentTime * 0.0008 + 2.0) * 8
        );

        // 定期更新深度纹理，但不必每帧都更新
        if (currentTime - lastDepthRenderTime > 100) { // 每100ms更新一次
            try {
                // 渲染深度并更新体积雾效果中的深度纹理
                const depthTexture = renderDepth();
                if (depthTexture) {
                    // 无论是否为相同纹理，每帧都设置深度纹理
                    volumetricFogEffect.setDepthTexture(depthTexture, THREE.RGBADepthPacking);
                }
                lastDepthRenderTime = currentTime;
            } catch (error) {
                console.error("深度渲染错误:", error);
            }
        }

        // 渲染场景
        try {
            // 渲染场景 - 使用增量时间作为渲染时间参数
            composer.render(0.001 * elapsed);
        } catch (error) {
            console.error("主场景渲染错误:", error);
        }

        requestAnimationFrame(render);
    });
})); 