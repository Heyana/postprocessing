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
        cloudThreshold: 0.0,
        enableStars: false,
        starIntensity: 1.0,
        starDensity: 0.5,
        enableMoon: false,
        moonPosition: new Vector3(-0.5, 0.2, -1).normalize(),
        moonSize: 0.02,
        moonIntensity: 1.0,
        enableAurora: false,
        auroraIntensity: 1.5,
        auroraColor: new Vector3(2.15, -1.0, 1.0),
        nightIntensity: 0.2
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

    // 添加夜空控制
    const nightSkyFolder = folder.addFolder({ title: "夜空设置" });

    nightSkyFolder.addBinding(skyAtmosphereEffect, "nightIntensity", {
        label: "夜空亮度",
        min: 0.0,
        max: 1.0,
        step: 0.01
    });

    // 星空控制
    const starFolder = nightSkyFolder.addFolder({ title: "星空" });

    starFolder.addBinding(skyAtmosphereEffect, "enableStars", {
        label: "启用星空"
    });

    starFolder.addBinding(skyAtmosphereEffect, "starIntensity", {
        label: "星星亮度",
        min: 0.1,
        max: 5.0,
        step: 0.1
    });

    starFolder.addBinding(skyAtmosphereEffect, "starDensity", {
        label: "星星密度",
        min: 0.1,
        max: 2000.0,
        step: 0.1
    });

    // 添加星星大小控制
    starFolder.addBinding(skyAtmosphereEffect, "starSize", {
        label: "星星大小",
        min: 0.1,
        max: 5.0,
        step: 0.1
    });

    // 添加星星移动速度控制
    starFolder.addBinding(skyAtmosphereEffect, "starMovementSpeed", {
        label: "星星移动速度",
        min: 0.0,  // 0表示星星不随云层移动
        max: 3.0,  // 3表示星星移动速度是云层的3倍
        step: 0.1
    });

    // 月亮控制
    const moonFolder = nightSkyFolder.addFolder({ title: "月亮" });

    // 月亮位置参数
    const moonPosParams = {
        elevation: 20,
        azimuth: 35
    };

    // 太阳位置参数（提前定义，避免顺序问题）
    const sunParams = {
        elevation: 5,
        azimuth: 175
    };

    // 更新太阳位置的函数（提前定义）
    function updateSunPosition() {
        const phi = THREE.MathUtils.degToRad(90 - sunParams.elevation);
        const theta = THREE.MathUtils.degToRad(sunParams.azimuth);

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        skyAtmosphereEffect.sunPosition.set(x, y, z).normalize();
        directionalLight.position.copy(skyAtmosphereEffect.sunPosition.clone().multiplyScalar(10));

        // 同时更新月亮位置，使其与太阳位置相反
        updateMoonPositionOpposite();
    }

    // 计算月亮位置为太阳的反方向（提前定义）
    function updateMoonPositionOpposite() {
        // 计算月亮的高度角和方位角（与太阳相反）
        const moonElevation = sunParams.elevation > 0 ? -sunParams.elevation : Math.abs(sunParams.elevation) + 5;
        const moonAzimuth = (sunParams.azimuth + 180) % 360;

        // 更新UI控件值
        if (moonPosParams.elevation !== moonElevation) {
            moonPosParams.elevation = moonElevation;
        }

        if (moonPosParams.azimuth !== moonAzimuth) {
            moonPosParams.azimuth = moonAzimuth;
        }

        // 计算月亮位置
        const phi = THREE.MathUtils.degToRad(90 - moonElevation);
        const theta = THREE.MathUtils.degToRad(moonAzimuth);

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        skyAtmosphereEffect.moonPosition.set(x, y, z).normalize();
    }

    // 添加月亮锁定选项
    const moonLockParams = {
        lockToSun: true  // 默认锁定
    };

    moonFolder.addBinding(moonLockParams, "lockToSun", {
        label: "锁定与太阳相反"
    }).on("change", (e) => {
        // 如果重新锁定，立即更新月亮位置
        if (e.value) {
            updateMoonPositionOpposite();
        }
    });

    moonFolder.addBinding(skyAtmosphereEffect, "enableMoon", {
        label: "启用月亮"
    });

    moonFolder.addBinding(skyAtmosphereEffect, "moonSize", {
        label: "月亮大小",
        min: 0.005,
        max: 0.1,
        step: 0.001
    });

    moonFolder.addBinding(skyAtmosphereEffect, "moonIntensity", {
        label: "月亮亮度",
        min: 0.1,
        max: 5.0,
        step: 0.1
    });

    // 月亮位置控制 - 仅当不锁定时可用
    const moonPosFolder = moonFolder.addFolder({
        title: "月亮位置控制",
        expanded: false
    });

    moonPosFolder.addBinding(moonPosParams, "elevation", {
        label: "月亮高度角",
        min: -10,
        max: 90,
        step: 1
    }).on("change", (e) => {
        if (!moonLockParams.lockToSun) {
            const phi = THREE.MathUtils.degToRad(90 - moonPosParams.elevation);
            const theta = THREE.MathUtils.degToRad(moonPosParams.azimuth);

            const x = Math.sin(phi) * Math.cos(theta);
            const y = Math.cos(phi);
            const z = Math.sin(phi) * Math.sin(theta);

            skyAtmosphereEffect.moonPosition.set(x, y, z).normalize();
        }
    });

    moonPosFolder.addBinding(moonPosParams, "azimuth", {
        label: "月亮方位角",
        min: 0,
        max: 360,
        step: 1
    }).on("change", (e) => {
        if (!moonLockParams.lockToSun) {
            const phi = THREE.MathUtils.degToRad(90 - moonPosParams.elevation);
            const theta = THREE.MathUtils.degToRad(moonPosParams.azimuth);

            const x = Math.sin(phi) * Math.cos(theta);
            const y = Math.cos(phi);
            const z = Math.sin(phi) * Math.sin(theta);

            skyAtmosphereEffect.moonPosition.set(x, y, z).normalize();
        }
    });

    // 初始化月亮位置为太阳的反方向
    updateMoonPositionOpposite();

    // 极光控制
    const auroraFolder = nightSkyFolder.addFolder({ title: "极光" });

    auroraFolder.addBinding(skyAtmosphereEffect, "enableAurora", {
        label: "启用极光"
    });

    auroraFolder.addBinding(skyAtmosphereEffect, "auroraIntensity", {
        label: "极光强度",
        min: 0.1,
        max: 5.0,
        step: 0.1
    });

    // 极光颜色控制
    const auroraColorParams = {
        red: 2.15,
        green: -1.0,
        blue: 1.0
    };

    // 更新极光颜色的函数
    function updateAuroraColor() {
        skyAtmosphereEffect.auroraColor.set(
            auroraColorParams.red,
            auroraColorParams.green,
            auroraColorParams.blue
        );
    }

    auroraFolder.addBinding(auroraColorParams, "red", {
        label: "红色系数",
        min: -3.0,
        max: 3.0,
        step: 0.05
    }).on("change", updateAuroraColor);

    auroraFolder.addBinding(auroraColorParams, "green", {
        label: "绿色系数",
        min: -3.0,
        max: 3.0,
        step: 0.05
    }).on("change", updateAuroraColor);

    auroraFolder.addBinding(auroraColorParams, "blue", {
        label: "蓝色系数",
        min: -3.0,
        max: 3.0,
        step: 0.05
    }).on("change", updateAuroraColor);

    // 添加采样步数控制
    const samplingFolder = skyFolder.addFolder({ title: "高级渲染设置" });

    samplingFolder.addBinding(skyAtmosphereEffect, "volumetricCloudSteps", {
        label: "体积云采样步数",
        min: 8,
        max: 64,
        step: 1
    });

    samplingFolder.addBinding(skyAtmosphereEffect, "volumetricLightSteps", {
        label: "体积光采样步数",
        min: 4,
        max: 32,
        step: 1
    });

    samplingFolder.addBinding(skyAtmosphereEffect, "cloudShadowingSteps", {
        label: "云阴影采样步数",
        min: 4,
        max: 32,
        step: 1
    });

    samplingFolder.addBinding(skyAtmosphereEffect, "volumetricLightShadowSteps", {
        label: "体积光阴影采样步数",
        min: 2,
        max: 16,
        step: 1
    });

    // 太阳位置控制
    const sunFolder = skyFolder.addFolder({ title: "太阳位置" });

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

    // 初始化太阳位置
    updateSunPosition();

    // 添加快速预设按钮
    const presetFolder = folder.addFolder({ title: "场景预设" });

    const presets = {
        daytime: function () {
            sunParams.elevation = 45;
            sunParams.azimuth = 180;
            updateSunPosition();
            skyAtmosphereEffect.enableStars = false;
            skyAtmosphereEffect.enableMoon = false;
            skyAtmosphereEffect.enableAurora = false;
            skyAtmosphereEffect.intensity = 12.0;
            skyAtmosphereEffect.skyBlueness = 0.5;
        },
        sunset: function () {
            sunParams.elevation = 2;
            sunParams.azimuth = 260;
            updateSunPosition();
            skyAtmosphereEffect.enableStars = false;
            skyAtmosphereEffect.enableMoon = false;
            skyAtmosphereEffect.enableAurora = false;
            skyAtmosphereEffect.intensity = 15.0;
            skyAtmosphereEffect.skyBlueness = 0.3;
        },
        night: function () {
            sunParams.elevation = -5;
            sunParams.azimuth = 180;
            updateSunPosition();
            skyAtmosphereEffect.enableStars = true;
            skyAtmosphereEffect.enableMoon = true;
            skyAtmosphereEffect.enableAurora = false;
            skyAtmosphereEffect.intensity = 12.0;
            skyAtmosphereEffect.nightIntensity = 0.2;
            // 更新星星参数为更自然的值
            skyAtmosphereEffect.starIntensity = 1.0;
            skyAtmosphereEffect.starDensity = 0.4;
            skyAtmosphereEffect.starSize = 1.5;
            skyAtmosphereEffect.starMovementSpeed = 0.3;
            skyAtmosphereEffect.moonIntensity = 1.2;
            moonPosParams.elevation = 30;
            moonPosParams.azimuth = 45;
            updateMoonPositionOpposite();
        },
        aurora: function () {
            sunParams.elevation = -8;
            sunParams.azimuth = 180;
            updateSunPosition();
            skyAtmosphereEffect.enableStars = true;
            skyAtmosphereEffect.enableMoon = true;
            skyAtmosphereEffect.enableAurora = true;
            skyAtmosphereEffect.intensity = 12.0;
            skyAtmosphereEffect.nightIntensity = 0.15;
            // 更新星星参数为更自然的值
            skyAtmosphereEffect.starIntensity = 0.8;
            skyAtmosphereEffect.starDensity = 0.5;
            skyAtmosphereEffect.starSize = 1.2;
            skyAtmosphereEffect.starMovementSpeed = 0.5;
            skyAtmosphereEffect.moonIntensity = 0.8;
            skyAtmosphereEffect.auroraIntensity = 1.5;
            auroraColorParams.red = 2.15;
            auroraColorParams.green = -1.0;
            auroraColorParams.blue = 1.0;
            updateAuroraColor();
            moonPosParams.elevation = 20;
            moonPosParams.azimuth = 35;
            updateMoonPositionOpposite();
        }
    };

    presetFolder.addButton({ title: "白天" }).on("click", presets.daytime);
    presetFolder.addButton({ title: "日落" }).on("click", presets.sunset);
    presetFolder.addButton({ title: "星空夜景" }).on("click", presets.night);
    presetFolder.addButton({ title: "极光夜景" }).on("click", presets.aurora);

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