/**
 * 降雨效果演示
 *
 * 展示RainfallEffect的各种降雨效果，包括不同强度的雨、闪电等
 */

import * as THREE from "three";
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
    Vector2,
    Vector3,
    WebGLRenderer,
    BoxGeometry,
    Color
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    RainfallEffect
} from "postprocessing";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 创建场景物体
function createScene() {
    const group = new Group();

    // 添加地面
    const ground = new Mesh(
        new PlaneGeometry(50, 50, 1, 1),
        new MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.3,
            metalness: 0.1
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    group.add(ground);

    // 添加一些建筑物来测试雨效果
    const buildings = new Group();

    // 建筑1 - 现代风格
    const building1 = new Mesh(
        new BoxGeometry(3, 8, 3),
        new MeshStandardMaterial({
            color: 0x6699cc,
            roughness: 0.4,
            metalness: 0.6
        })
    );
    building1.position.set(-6, 2, -6);
    building1.castShadow = building1.receiveShadow = true;
    buildings.add(building1);

    // 建筑2 - 传统风格
    const building2 = new Mesh(
        new BoxGeometry(4, 6, 4),
        new MeshStandardMaterial({
            color: 0xcc9966,
            roughness: 0.8,
            metalness: 0.2
        })
    );
    building2.position.set(6, 1, -4);
    building2.castShadow = building2.receiveShadow = true;
    buildings.add(building2);

    // 建筑3 - 高楼
    const building3 = new Mesh(
        new BoxGeometry(2.5, 12, 2.5),
        new MeshStandardMaterial({
            color: 0x99cc99,
            roughness: 0.5,
            metalness: 0.4
        })
    );
    building3.position.set(0, 4, -8);
    building3.castShadow = building3.receiveShadow = true;
    buildings.add(building3);

    // 建筑4 - 低矮建筑
    const building4 = new Mesh(
        new BoxGeometry(5, 3, 2),
        new MeshStandardMaterial({
            color: 0xcc6699,
            roughness: 0.7,
            metalness: 0.3
        })
    );
    building4.position.set(-3, -0.5, 5);
    building4.castShadow = building4.receiveShadow = true;
    buildings.add(building4);

    group.add(buildings);

    // 添加一些装饰性物体
    const decorations = new Group();

    // 路灯
    for (let i = 0; i < 4; i++) {
        const lampPost = new Mesh(
            new BoxGeometry(0.2, 4, 0.2),
            new MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.8,
                metalness: 0.2
            })
        );

        const angle = (i / 4) * Math.PI * 2;
        const radius = 8;
        lampPost.position.set(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
        );
        lampPost.castShadow = lampPost.receiveShadow = true;
        decorations.add(lampPost);

        // 路灯顶部
        const lampTop = new Mesh(
            new BoxGeometry(0.8, 0.3, 0.8),
            new MeshStandardMaterial({
                color: 0xffffdd,
                roughness: 0.2,
                metalness: 0.1,
                emissive: new Color(0x444422)
            })
        );
        lampTop.position.copy(lampPost.position);
        lampTop.position.y = 2.2;
        decorations.add(lampTop);
    }

    group.add(decorations);

    return group;
}

function load() {

    const assets = new Map();
    const loadingManager = new LoadingManager();
    // 降雨效果会自动创建噪声纹理，但保持结构一致性

    return new Promise((resolve, reject) => {

        loadingManager.onLoad = () => resolve(assets);
        loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

        // RainfallEffect会自动处理噪声纹理创建
        resolve(assets);

    });

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
    controls.position.set(0, 3, 12);

    // 场景设置
    const scene = new Scene();
    scene.background = new Color(0x2d2d2d); // 阴天的灰色背景

    // 添加定向光源 - 模拟太阳光（雨天较弱）
    const directionalLight = new DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // 添加环境光（雨天稍强一些）
    const ambientLight = new AmbientLight(0x404040, 0.4);
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

    // 创建降雨效果
    const rainfallEffect = new RainfallEffect({
        blendFunction: BlendFunction.ALPHA,
        intensity: 0.6,
        rainSpeed: 1.0,
        rainSize: 0.15,
        windDirection: new Vector2(0.1, 0),
        rainAngle: 10,
        rainColor: 0x87ceeb,
        wetness: 0.4,
        puddleIntensity: 0.3,
        mistIntensity: 0.2,
        enableLighting: false,
        lightningFrequency: 0.1
    });

    // 添加效果通道
    const effectPass = new EffectPass(camera, rainfallEffect);
    composer.addPass(effectPass);

    // GUI控制
    const pane = new Pane({ container: container.querySelector(".tp") });
    const fpsMeter = new FPSMeter();
    const clock = new Clock();

    const folder = pane.addFolder({ title: "降雨效果设置" });
    folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

    // 降雨预设
    const presetFolder = folder.addFolder({ title: "降雨预设" });
    const presetParams = { preset: "moderate" };

    presetFolder.addBinding(presetParams, "preset", {
        label: "预设",
        options: {
            "小雨": "light",
            "中雨": "moderate",
            "大雨": "heavy",
            "暴风雨": "storm"
        }
    }).on("change", (e) => {
        rainfallEffect.setRainPreset(e.value);
    });

    // 基本降雨参数
    const rainFolder = folder.addFolder({ title: "降雨参数" });

    rainFolder.addBinding(rainfallEffect, "intensity", {
        label: "降雨强度",
        min: 0,
        max: 1,
        step: 0.01
    });

    rainFolder.addBinding(rainfallEffect, "rainSpeed", {
        label: "雨滴速度",
        min: 0.1,
        max: 3.0,
        step: 0.1
    });

    rainFolder.addBinding(rainfallEffect, "rainSize", {
        label: "雨滴大小",
        min: 0.05,
        max: 0.5,
        step: 0.01
    });

    // 创建角度控制参数对象
    const angleParams = { angle: 10 };
    rainFolder.addBinding(angleParams, "angle", {
        label: "雨滴角度",
        min: -45,
        max: 45,
        step: 1
    }).on("change", (e) => {
        rainfallEffect.rainAngle = e.value;
    });

    // 雨滴颜色
    const colorParams = { color: { r: 135, g: 206, b: 235 } };
    rainFolder.addBinding(colorParams, "color", {
        label: "雨滴颜色"
    }).on("change", (e) => {
        const color = new Color(e.value.r / 255, e.value.g / 255, e.value.b / 255);
        rainfallEffect.rainColor = color;
    });

    // 风向控制
    const windFolder = folder.addFolder({ title: "风向效果" });

    const windParams = {
        windX: 0.1,
        windY: 0
    };

    windFolder.addBinding(windParams, "windX", {
        label: "水平风力",
        min: -0.5,
        max: 0.5,
        step: 0.01
    }).on("change", (e) => {
        rainfallEffect.windDirection.x = e.value;
    });

    windFolder.addBinding(windParams, "windY", {
        label: "垂直风力",
        min: -0.2,
        max: 0.2,
        step: 0.01
    }).on("change", (e) => {
        rainfallEffect.windDirection.y = e.value;
    });

    // 环境效果
    const environmentFolder = folder.addFolder({ title: "环境效果" });

    environmentFolder.addBinding(rainfallEffect, "wetness", {
        label: "湿润程度",
        min: 0,
        max: 1,
        step: 0.01
    });

    environmentFolder.addBinding(rainfallEffect, "puddleIntensity", {
        label: "积水强度",
        min: 0,
        max: 1,
        step: 0.01
    });

    environmentFolder.addBinding(rainfallEffect, "mistIntensity", {
        label: "雨雾强度",
        min: 0,
        max: 1,
        step: 0.01
    });

    // 闪电效果
    const lightningFolder = folder.addFolder({ title: "闪电效果" });

    lightningFolder.addBinding(rainfallEffect, "enableLighting", {
        label: "启用闪电"
    });

    lightningFolder.addBinding(rainfallEffect, "lightningFrequency", {
        label: "闪电频率",
        min: 0.01,
        max: 0.5,
        step: 0.01
    });

    // 闪电颜色
    const lightningColorParams = { color: { r: 255, g: 230, b: 204 } };
    lightningFolder.addBinding(lightningColorParams, "color", {
        label: "闪电颜色"
    }).on("change", (e) => {
        const color = new Vector3(e.value.r / 255, e.value.g / 255, e.value.b / 255);
        rainfallEffect.uniforms.get("lightningColor").value = color;
    });

    // 混合模式控制
    const blendModeOptions = {
        "ALPHA": BlendFunction.ALPHA,
        "SCREEN": BlendFunction.SCREEN,
        "ADD": BlendFunction.ADD,
        "NORMAL": BlendFunction.NORMAL,
        "OVERLAY": BlendFunction.OVERLAY
    };

    folder.addBinding({ blendMode: BlendFunction.ALPHA }, "blendMode", {
        label: "混合模式",
        options: blendModeOptions
    }).on("change", (e) => {
        rainfallEffect.blendMode.setBlendFunction(e.value);
    });

    // 效果开关
    const enableParams = { enableEffect: true };
    folder.addBinding(enableParams, "enableEffect", {
        label: "启用降雨效果"
    }).on("change", (e) => {
        rainfallEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
    });

    // 场景控制
    const sceneFolder = folder.addFolder({ title: "场景设置" });

    const sceneParams = {
        backgroundBrightness: 0.2,
        lightIntensity: 0.6
    };

    sceneFolder.addBinding(sceneParams, "backgroundBrightness", {
        label: "背景亮度",
        min: 0,
        max: 1,
        step: 0.01
    }).on("change", (e) => {
        const gray = Math.floor(e.value * 255);
        scene.background.setRGB(gray / 255, gray / 255, gray / 255);
    });

    sceneFolder.addBinding(sceneParams, "lightIntensity", {
        label: "光照强度",
        min: 0.1,
        max: 2.0,
        step: 0.1
    }).on("change", (e) => {
        directionalLight.intensity = e.value;
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

        // 更新降雨效果的尺寸
        rainfallEffect.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // 渲染循环
    requestAnimationFrame(function render(timestamp) {
        fpsMeter.update(timestamp);
        const delta = clock.getDelta();

        // 更新控制器
        controls.update(timestamp, delta);

        // 更新降雨效果
        rainfallEffect.update(renderer, null, delta);

        // 渲染场景
        composer.render(delta);
        requestAnimationFrame(render);
    });

}));
