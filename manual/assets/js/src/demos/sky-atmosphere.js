import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
    AmbientLight,
    Clock,
    DirectionalLight,
    Group,
    HalfFloatType,
    LoadingManager,
    Mesh,
    MeshStandardMaterial,
    PCFSoftShadowMap,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    Vector3,
    WebGLRenderer,
    BoxGeometry,
    CubeTextureLoader
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    SkyAtmosphereEffect
} from "postprocessing";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

function load() {
    const assets = new Map();
    const loadingManager = new LoadingManager();
    const textureLoader = new TextureLoader(loadingManager);

    return new Promise((resolve, reject) => {
        loadingManager.onLoad = () => resolve(assets);
        loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

        // 加载噪声纹理
        textureLoader.load(`${document.baseURI}img/textures/noise/sky_channel1.png`, (t) => {
            assets.set("noiseTexture", t);
        });
    });
}

// 创建场景物体
function createScene() {
    const group = new Group();

    // 添加地面
    const ground = new Mesh(
        new PlaneGeometry(50, 50, 1, 1),
        new MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.1
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    group.add(ground);

    // 添加一些立方体建筑
    const buildings = new Group();

    // 大楼1
    const building1 = new Mesh(
        new BoxGeometry(2, 6, 2),
        new MeshStandardMaterial({
            color: 0x8899aa,
            roughness: 0.7,
            metalness: 0.2
        })
    );
    building1.position.set(-5, 1, -5);
    building1.castShadow = building1.receiveShadow = true;
    buildings.add(building1);

    // 大楼2
    const building2 = new Mesh(
        new BoxGeometry(3, 4, 3),
        new MeshStandardMaterial({
            color: 0xaa9988,
            roughness: 0.8,
            metalness: 0.1
        })
    );
    building2.position.set(5, 0, -3);
    building2.castShadow = building2.receiveShadow = true;
    buildings.add(building2);

    // 大楼3
    const building3 = new Mesh(
        new BoxGeometry(2, 8, 2),
        new MeshStandardMaterial({
            color: 0x99aacc,
            roughness: 0.6,
            metalness: 0.3
        })
    );
    building3.position.set(0, 2, -7);
    building3.castShadow = building3.receiveShadow = true;
    buildings.add(building3);

    group.add(buildings);

    return group;
}

window.addEventListener("load", () => load().then((assets) => {

    // 渲染器
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: true,
        stencil: false,
        depth: true
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    renderer.shadowMap.type = PCFSoftShadowMap;
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
    settings.translation.enabled = true;
    controls.position.set(0, 3, 10);

    // 场景、灯光和物体
    const scene = new Scene();
    scene.background = new THREE.Color(0x000000); // 黑色背景，让大气散射效果更明显

    // 添加定向光源 - 模拟太阳光
    const sunPosition = new Vector3(5, 10, 5).normalize().multiplyScalar(10);
    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.copy(sunPosition);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    // 添加环境光
    const ambientLight = new AmbientLight(0x404040, 0.2);
    scene.add(ambientLight);

    // 添加场景物体
    const sceneObjects = createScene();
    scene.add(sceneObjects);

    // 后期处理
    const composer = new EffectComposer(renderer, {
        frameBufferType: HalfFloatType
    });
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 创建大气散射效果
    const skyAtmosphereEffect = new SkyAtmosphereEffect({
        blendFunction: BlendFunction.SCREEN,
        sunPosition: sunPosition.clone().normalize(),
        animateClouds: true,
        intensity: 12.0,
        rayleighCoefficient: 1.0,
        mieCoefficient: 0.8,
        mieDirectionalG: 0.8,
        cloudiness: 1.0,
        skyBlueness: 0.5,
        cloudAmount: 1.0,
        cloudScale: 1.0,
        cloudThreshold: 0.0
    });

    // 设置噪声纹理
    skyAtmosphereEffect.setNoiseTexture(assets.get("noiseTexture"));

    // 添加相机设置
    skyAtmosphereEffect.setCamera(camera);

    // 添加效果通道
    const effectPass = new EffectPass(camera, skyAtmosphereEffect);
    composer.addPass(effectPass);

    // GUI
    const pane = new Pane({ container: container.querySelector(".tp") });
    const fpsMeter = new FPSMeter();
    const clock = new Clock();

    const folder = pane.addFolder({ title: "设置" });
    folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

    // 大气散射效果控制
    const skyFolder = folder.addFolder({ title: "大气与云层" });

    // 添加天空蓝度控制
    skyFolder.addBinding(skyAtmosphereEffect, "skyBlueness", {
        label: "天空蓝度",
        min: 0.0,
        max: 2.0,
        step: 0.05
    });

    skyFolder.addBinding(skyAtmosphereEffect, "intensity", {
        label: "散射强度",
        min: 1,
        max: 20,
        step: 0.1
    });

    skyFolder.addBinding(skyAtmosphereEffect, "rayleighCoefficient", {
        label: "瑞利散射系数",
        min: 0.1,
        max: 2.0,
        step: 0.05
    });

    skyFolder.addBinding(skyAtmosphereEffect, "mieCoefficient", {
        label: "米氏散射系数",
        min: 0.1,
        max: 2.0,
        step: 0.05
    });

    skyFolder.addBinding(skyAtmosphereEffect, "mieDirectionalG", {
        label: "米氏方向性",
        min: 0,
        max: 0.99,
        step: 0.01
    });

    // 云层参数控制
    const cloudFolder = skyFolder.addFolder({ title: "云层设置" });

    cloudFolder.addBinding(skyAtmosphereEffect, "cloudiness", {
        label: "云层密度",
        min: 0.1,
        max: 10.0,
        step: 0.1
    });

    cloudFolder.addBinding(skyAtmosphereEffect, "cloudAmount", {
        label: "云层数量",
        min: 0.1,
        max: 5.0,
        step: 0.1
    });

    cloudFolder.addBinding(skyAtmosphereEffect, "cloudScale", {
        label: "云层尺度",
        min: 0.2,
        max: 3.0,
        step: 0.1
    });

    cloudFolder.addBinding(skyAtmosphereEffect, "cloudThreshold", {
        label: "云层阈值",
        min: -1.0,
        max: 1.0,
        step: 0.05
    });

    cloudFolder.addBinding(skyAtmosphereEffect, "animateClouds", {
        label: "云层动画"
    });

    // 太阳位置控制
    const sunFolder = skyFolder.addFolder({ title: "太阳位置" });

    const sunParams = {
        elevation: 5,
        azimuth: 175
    };

    // 更新太阳位置的函数
    function updateSunPosition() {
        const phi = THREE.MathUtils.degToRad(90 - sunParams.elevation);
        const theta = THREE.MathUtils.degToRad(sunParams.azimuth);

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        skyAtmosphereEffect.sunPosition.set(x, y, z).normalize();
        directionalLight.position.copy(skyAtmosphereEffect.sunPosition.clone().multiplyScalar(10));
    }

    sunFolder.addBinding(sunParams, "elevation", {
        label: "高度角",
        min: -10,
        max: 90,
        step: 1
    }).on("change", updateSunPosition);

    sunFolder.addBinding(sunParams, "azimuth", {
        label: "方位角",
        min: 0,
        max: 360,
        step: 1
    }).on("change", updateSunPosition);

    // 添加FOV控制
    const viewFolder = folder.addFolder({ title: "视图设置" });

    const viewParams = {
        fov: 60
    };

    viewFolder.addBinding(viewParams, "fov", {
        label: "视场角(FOV)",
        min: 30,
        max: 120,
        step: 1
    }).on("change", (e) => {
        camera.fov = e.value;
        camera.updateProjectionMatrix();
        skyAtmosphereEffect.fov = e.value;  // 更新效果中的FOV
    });

    // 混合模式控制
    const blendModeOptions = {
        "SCREEN": BlendFunction.SCREEN,
        "ADD": BlendFunction.ADD,
        "NORMAL": BlendFunction.NORMAL,
        "OVERLAY": BlendFunction.OVERLAY
    };

    skyFolder.addBinding({ blendMode: BlendFunction.SCREEN }, "blendMode", {
        label: "混合模式",
        options: blendModeOptions
    }).on("change", (e) => {
        skyAtmosphereEffect.blendMode.setBlendFunction(e.value);
    });

    // 启用/禁用效果
    const params = {
        enableEffect: true
    };

    folder.addBinding(params, "enableEffect", {
        label: "启用大气散射"
    }).on("change", (e) => {
        skyAtmosphereEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
    });

    // 调整窗口大小
    function onResize() {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        // 更新相机
        camera.fov = calculateVerticalFoV(90, aspect);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        // 更新渲染器和效果合成器
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio.toFixed(1));
        composer.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // 渲染循环
    requestAnimationFrame(function render(timestamp) {
        fpsMeter.update(timestamp);
        const delta = clock.getDelta();

        // 更新控制器
        controls.update(timestamp, delta);

        // 渲染场景
        composer.render(delta);
        requestAnimationFrame(render);
    });
})); 