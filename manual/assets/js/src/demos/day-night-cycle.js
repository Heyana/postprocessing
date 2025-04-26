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
    TextureLoader,
    Vector2,
    WebGLRenderer,
    BoxGeometry
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    DayNightCycleEffect
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
        textureLoader.load(`${document.baseURI}img/textures/noise/DayAndNightSkyCycle.png`, (t) => {
            assets.set("noiseTexture", t);
        });
    });
}

// 创建场景物体 - 简化为只有一个地面和一个立方体
function createScene() {
    const group = new Group();

    // 添加地面
    const ground = new Mesh(
        new PlaneGeometry(20, 20, 1, 1),
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

    // 添加一个立方体
    const cube = new Mesh(
        new BoxGeometry(2, 2, 2),
        new MeshStandardMaterial({
            color: 0x8899aa,
            roughness: 0.7,
            metalness: 0.2
        })
    );
    cube.position.set(0, 0, 0);
    cube.castShadow = true;
    cube.receiveShadow = true;
    group.add(cube);

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
    scene.background = new THREE.Color(0x000000); // 黑色背景

    // 添加基本光源
    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
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

    // 创建简化版日夜循环天空效果
    const dayNightCycleEffect = new DayNightCycleEffect({
        blendFunction: BlendFunction.SCREEN
    });

    // 设置噪声纹理
    dayNightCycleEffect.setNoiseTexture(assets.get("noiseTexture"));

    // 添加效果通道
    const effectPass = new EffectPass(camera, dayNightCycleEffect);
    composer.addPass(effectPass);

    // 简化的GUI
    const pane = new Pane({ container: container.querySelector(".tp") });
    const fpsMeter = new FPSMeter();
    const clock = new Clock();

    const folder = pane.addFolder({ title: "设置" });
    folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

    // 混合模式控制
    const blendModeOptions = {
        "SCREEN": BlendFunction.SCREEN,
        "ADD": BlendFunction.ADD,
        "NORMAL": BlendFunction.NORMAL,
        "ALPHA": BlendFunction.ALPHA
    };

    folder.addBinding({ blendMode: BlendFunction.SCREEN }, "blendMode", {
        label: "混合模式",
        options: blendModeOptions
    }).on("change", (e) => {
        dayNightCycleEffect.blendMode.setBlendFunction(e.value);
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

        // 旋转立方体
        sceneObjects.children[1].rotation.y += delta * 0.5;

        // 渲染场景
        composer.render(delta);
        requestAnimationFrame(render);
    });
})); 