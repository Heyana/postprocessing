import {
    Color,
    CubeTextureLoader,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
    PlaneGeometry,
    MeshStandardMaterial,
    Mesh,
    BoxGeometry,
    Group,
    Vector3
} from "three";
import * as THREE from "three";
import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    UniformFogEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Domain from "../objects/Domain";

// 创建地面
function createGround() {
    const geometry = new PlaneGeometry(1000, 1000);
    const material = new MeshStandardMaterial({
        color: 0x4a9e6f,  // 更亮的绿色
        roughness: 0.6,   // 降低粗糙度
        metalness: 0.1    // 降低金属度
    });
    const ground = new Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    return ground;
}

// 创建模拟树林
function createForest() {
    const forest = new Group();
    const boxGeometry = new BoxGeometry(1, 1, 1);

    // 创建不同高度和位置的树
    const treeCount = 100;
    const positions = [];
    const heights = [];

    // 生成随机位置和高度
    for (let i = 0; i < treeCount; i++) {
        const x = (Math.random() - 0.5) * 200;
        const z = (Math.random() - 0.5) * 200;
        const height = 2 + Math.random() * 8; // 2-10米高
        positions.push(new Vector3(x, height / 2, z));
        heights.push(height);
    }

    // 按距离排序，远处的树先渲染
    positions.sort((a, b) => {
        const distA = a.length();
        const distB = b.length();
        return distB - distA;
    });

    // 创建树
    positions.forEach((pos, index) => {
        const height = heights[index];
        const material = new MeshStandardMaterial({
            color: new Color(0x3d6a3d).multiplyScalar(0.9 + Math.random() * 0.2), // 更亮的绿色
            roughness: 0.7,  // 降低粗糙度
            metalness: 0.1   // 降低金属度
        });

        // 树干
        const trunk = new Mesh(
            new BoxGeometry(0.5, height * 0.7, 0.5),
            material
        );
        trunk.position.copy(pos);
        trunk.position.y = height * 0.35;
        forest.add(trunk);

        // 树冠
        const crown = new Mesh(
            new BoxGeometry(height * 0.8, height * 0.6, height * 0.8),
            material
        );
        crown.position.copy(pos);
        crown.position.y = height * 0.8;
        forest.add(crown);
    });

    return forest;
}

function load() {
    const assets = new Map();
    const loadingManager = new LoadingManager();
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

        cubeTextureLoader.load(urls, (t) => {
            t.colorSpace = SRGBColorSpace;
            assets.set("sky", t);
        });
    });
}

window.addEventListener("load", () => load().then((assets) => {
    // 渲染器
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: true  // 启用深度缓冲
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 相机与控制器
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = true;
    controls.position.set(20, 15, 50);

    // 场景、灯光、物体
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 创建自定义灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // 环境光
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // 主方向光
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // 添加辅助灯光
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); // 半球光
    scene.add(hemisphereLight);

    // 添加地面和树林
    const ground = createGround();
    const forest = createForest();
    scene.add(ground);
    scene.add(forest);

    // 后期处理
    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    const effect = new UniformFogEffect({
        fogDensity: 0.015,  // 降低雾密度
        fogColor: new Color(0xccccdd), // 更亮的雾颜色
        fogMinDist: 100,
        quality: 0.5,
        occludeSky: 0.0,
        segments: 3,
        camera: camera
    });

    const effectPass = new EffectPass(camera, effect);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effectPass);

    // 设置面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "均匀雾效果" });

    // 添加质量控制
    folder.addBinding(effect, "quality", {
        min: 0, max: 1, step: 0.1,
        label: "质量"
    });

    // 雾气参数控制
    const fogFolder = folder.addFolder({ title: "雾气参数" });

    // 添加雾密度控制
    fogFolder.addBinding(effect, "fogDensity", {
        min: 0, max: 0.1, step: 0.001,
        label: "雾气密度"
    });

    // 添加雾颜色控制
    const fogColorParams = { color: { r: effect.fogColor.r, g: effect.fogColor.g, b: effect.fogColor.b } };
    fogFolder.addBinding(fogColorParams, "color", {
        color: { type: "float" },
        label: "雾气颜色"
    }).on("change", (e) => {
        effect.fogColor = new Color(e.value.r, e.value.g, e.value.b);
    });

    // 添加雾最小距离控制
    fogFolder.addBinding(effect, "fogMinDist", {
        min: 0, max: 1000, step: 1,
        label: "最小距离"
    });

    // 添加分段数控制
    fogFolder.addBinding(effect, "segments", {
        min: 1, max: 10, step: 1,
        label: "分段数"
    });

    // 添加天空遮挡控制
    fogFolder.addBinding(effect, "occludeSky", {
        min: 0, max: 1, step: 0.1,
        label: "天空遮挡"
    });

    // 体积雾团参数调节
    const fogVolumeFolder = fogFolder.addFolder({ title: "体积雾团参数" });
    fogVolumeFolder.addBinding(effect, "fogSteps", { min: 4, max: 64, step: 1, label: "采样步数" });
    fogVolumeFolder.addBinding(effect, "fogScale", { min: 0.01, max: 0.5, step: 0.01, label: "雾团大小" });
    fogVolumeFolder.addBinding(effect, "fogStrength", { min: 0.1, max: 3.0, step: 0.01, label: "雾团强度" });
    fogVolumeFolder.addBinding(effect, "fogEdgeMin", { min: 0.0, max: 1.0, step: 0.01, label: "平滑起点" });
    fogVolumeFolder.addBinding(effect, "fogEdgeMax", { min: 0.0, max: 1.0, step: 0.01, label: "平滑终点" });
    fogVolumeFolder.addBinding(effect, "fogAtten", { min: 0.0, max: 0.1, step: 0.001, label: "距离衰减" });
    fogVolumeFolder.addBinding(effect, "fogFadeWidth", { min: 0.01, max: 10000.0, step: 0.01, label: "近距离淡入宽度" });

    // 添加混合模式控制
    folder.addBinding(effect.blendMode.opacity, "value", {
        label: "透明度",
        min: 0, max: 1, step: 0.01
    });

    folder.addBinding(effect.blendMode, "blendFunction", {
        options: BlendFunction,
        label: "混合模式"
    });

    // 大小调整处理
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
    requestAnimationFrame(function render(timestamp) {
        fpsMeter.update(timestamp);
        controls.update(timestamp);
        composer.render();
        requestAnimationFrame(render);
    });
})); 