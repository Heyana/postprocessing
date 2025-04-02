import {
    AnimationMixer,
    CubeTextureLoader,
    GLTFLoader,
    Group,
    LoadingManager,
    Mesh,
    PerspectiveCamera,
    Scene,
    SphereGeometry,
    MeshStandardMaterial,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    Vector3,
    VSMShadowMap,
    WebGLRenderer,
    BoxGeometry,
    Clock,
    PlaneGeometry
} from "three";

import {
    EffectComposer,
    EffectPass,
    RenderPass,
    TRAAEffect,
    VelocityPass,
    NormalPass
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

// 创建具有细微细节的网格场景，以便更好地展示抗锯齿效果
function createDetailedScene() {
    const group = new Group();

    // 基本几何体
    const boxGeometry = new BoxGeometry(0.8, 0.8, 0.8);
    const sphereGeometry = new SphereGeometry(0.4, 32, 32);

    // 创建网格布局
    const gridSize = 4;
    const spacing = 1.5;
    const offset = (gridSize - 1) * spacing / 2;

    for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
            const material = new MeshStandardMaterial({
                color: Math.random() * 0xffffff,
                roughness: Math.random() * 0.7 + 0.3,
                metalness: Math.random() * 0.8
            });

            // 交替使用球体和立方体
            const isEven = (x + z) % 2 === 0;
            const mesh = new Mesh(
                isEven ? boxGeometry : sphereGeometry,
                material
            );

            // 放置在网格中并添加高度变化，形成更多边缘
            mesh.position.set(
                x * spacing - offset,
                (Math.random() * 0.5) - 0.25,
                z * spacing - offset
            );

            // 添加微小的旋转，增加边缘
            mesh.rotation.set(
                Math.random() * 0.5,
                Math.random() * 0.5,
                Math.random() * 0.5
            );

            mesh.castShadow = true;
            mesh.receiveShadow = true;

            group.add(mesh);
        }
    }

    return group;
}

// 创建地板函数
function createFloor() {
    const geometry = new PlaneGeometry(20, 20, 32, 32); // 增加细分，更好地展示抗锯齿效果
    const material = new MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.7,
        metalness: 0.1
    });
    const floor = new Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    return floor;
}

window.addEventListener("load", () => load().then((assets) => {
    // 渲染器
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false, // 关闭内置抗锯齿，以便更好地展示TRAA效果
        stencil: false,
        depth: false
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    renderer.shadowMap.type = VSMShadowMap;
    renderer.shadowMap.autoUpdate = true;
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
    const lights = Shapes.createLights();
    scene.add(lights);

    // 添加场景对象
    const floor = createFloor();
    scene.add(floor);

    // 添加网格对象
    const sceneObjects = createDetailedScene();
    scene.add(sceneObjects);

    // 添加角色模型
    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.2);
    riggedSimple.scene.position.set(0, 0, 0);
    scene.add(riggedSimple.scene);

    // 设置动画
    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    // 创建时钟用于动画
    const clock = new Clock();

    // 后处理
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);
    const composer = new EffectComposer(renderer, { multisampling });

    // 添加基本渲染通道
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 创建速度通道 - 这是TRAA效果所必需的
    const velocityPass = new VelocityPass(scene, camera);
    composer.addPass(velocityPass);

    // 可选：创建法线通道 - 某些情况下可以提高TRAA效果质量

    // 创建TRAA效果 - 现在正确传入velocityPass作为第三个参数
    const traaEffect = new TRAAEffect(scene, camera, velocityPass, {
        blend: 0.8,           // 与前一帧的混合程度
        temporalEdgeLimit: 1.0, // 时间边缘限制
        neighborhoodClampIntensity: 0.5, // 邻域值限制强度
        // enableTemperatureCorrection: true // 启用温度校正
    });

    // 添加效果通道
    composer.addPass(new EffectPass(camera, traaEffect));

    // UI控制面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // TRAA设置
    const folder = pane.addFolder({ title: "TRAA设置" });

    // 创建代理对象用于UI控制
    const traaSettings = {
        enabled: true,
        blend: 0.8,
        temporalEdgeLimit: 1.0,
        neighborhoodClampIntensity: 0.5,
        enableTemperatureCorrection: true
    };

    folder.addBinding(traaSettings, "enabled", {
        label: "启用TRAA"
    }).on("change", (e) => {
        traaEffect.enabled = e.value;
    });

    folder.addBinding(traaSettings, "blend", {
        min: 0,
        max: 1.0,
        step: 0.01,
        label: "混合系数"
    }).on("change", (e) => {
        // 由于TRAAEffect的内部结构，需要通过temporalReprojectPass来访问参数
        if (traaEffect.temporalReprojectPass) {
            traaEffect.temporalReprojectPass.blend = e.value;
        }
    });

    folder.addBinding(traaSettings, "temporalEdgeLimit", {
        min: 0.1,
        max: 2.0,
        step: 0.1,
        label: "时间边缘限制"
    }).on("change", (e) => {
        if (traaEffect.temporalReprojectPass) {
            traaEffect.temporalReprojectPass.temporalEdgeLimit = e.value;
        }
    });

    folder.addBinding(traaSettings, "neighborhoodClampIntensity", {
        min: 0,
        max: 1.0,
        step: 0.01,
        label: "邻域限制强度"
    }).on("change", (e) => {
        if (traaEffect.temporalReprojectPass) {
            traaEffect.temporalReprojectPass.neighborhoodClampIntensity = e.value;
        }
    });

    folder.addBinding(traaSettings, "enableTemperatureCorrection", {
        label: "温度校正"
    }).on("change", (e) => {
        if (traaEffect.temporalReprojectPass) {
            traaEffect.temporalReprojectPass.enableTemperatureCorrection = e.value;
        }
    });

    // 添加抗锯齿对比控制
    const compareSettings = {
        showComparison: false
    };

    folder.addBinding(compareSettings, "showComparison", {
        label: "显示对比效果"
    }).on("change", (e) => {
        // 如果选择显示对比效果，我们可以只处理一半屏幕
        if (traaEffect.setComparisonMode) {
            traaEffect.setComparisonMode(e.value);
        } else if (traaEffect.temporalReprojectPass) {
            // 或者试图设置截取区域
            try {
                traaEffect.enabled = !e.value;
                renderPass.fullscreenMaterial.uniforms.opacity.value = e.value ? 0.5 : 1.0;
            } catch (error) {
                console.log("无法设置对比模式", error);
            }
        }
    });

    // 相机和运动控制
    const controlFolder = pane.addFolder({ title: "相机与运动控制" });

    const cameraSettings = {
        enableRotation: true,
        rotationSpeed: 0.2,
        objectsAnimation: true
    };

    controlFolder.addBinding(cameraSettings, "enableRotation", {
        label: "自动旋转相机"
    });

    controlFolder.addBinding(cameraSettings, "rotationSpeed", {
        min: 0.05,
        max: 0.5,
        step: 0.01,
        label: "旋转速度"
    });

    controlFolder.addBinding(cameraSettings, "objectsAnimation", {
        label: "物体动画"
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
    let lastTime = 0;

    requestAnimationFrame(function render(timestamp) {
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;
        const timeElapsed = clock.getElapsedTime();

        fpsMeter.update(timestamp);

        if (!cameraSettings.enableRotation) {
            controls.update(timestamp);
        } else {
            // 相机旋转
            controls.position.x = Math.sin(timeElapsed * cameraSettings.rotationSpeed) * 8;
            controls.position.z = Math.cos(timeElapsed * cameraSettings.rotationSpeed) * 8;
            controls.update(deltaTime);
        }

        animationMixer.update(deltaTime * 0.001);

        // 让物体旋转和移动，以更好地展示抗锯齿效果
        if (cameraSettings.objectsAnimation) {
            sceneObjects.children.forEach((object, index) => {
                object.rotation.y = timeElapsed * 0.3 + index * 0.1;

                // 添加轻微的垂直运动
                const originalY = (index % 2) * 0.5 - 0.25;
                object.position.y = originalY + Math.sin(timeElapsed * 0.5 + index) * 0.15;
            });
        }

        composer.render();
        requestAnimationFrame(render);
    });
})); 