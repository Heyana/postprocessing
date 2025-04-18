import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
    AmbientLight,
    AnimationMixer,
    CineonToneMapping,
    Clock,
    DirectionalLight,
    Fog,
    Group,
    HalfFloatType,
    LinearToneMapping,
    LoadingManager,
    MathUtils,
    Mesh,
    MeshStandardMaterial,
    PCFSoftShadowMap,
    PerspectiveCamera,
    PlaneGeometry,
    ReinhardToneMapping,
    Scene,
    ShadowMaterial,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    VSMShadowMap,
    WebGLRenderer,
    GLTFLoader, BoxGeometry,
    CubeTextureLoader
} from "three";

import {
    BlendFunction,
    DepthPass,
    EffectComposer,
    EffectPass,
    NormalPass,
    RenderPass,
    SnowfallEffect,
    SnowOverlayEffect
} from "postprocessing";

import { ControlMode, SpatialControls } from "spatial-controls";
import { Pane } from "tweakpane";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import { Tree } from '@dgreenheck/ez-tree';

function load() {

    const assets = new Map();
    const loadingManager = new LoadingManager();
    const gltfLoader = new GLTFLoader(loadingManager);
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

        cubeTextureLoader.load(urls, (t) => {
            t.colorSpace = SRGBColorSpace;
            assets.set("sky", t);
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
            color: 0xffffff,
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

    // 使用ez-tree库创建树木
    const trees = new Group();

    // 添加树1
    const tree1 = new Tree()
    tree1.generate();
    tree1.position.set(-3, -2, 0);
    tree1.scale.set(0.5, 0.5, 0.5);
    tree1.traverse(object => {
        if (object.isMesh) {
            object.castShadow = object.receiveShadow = true;
        }
    });
    trees.add(tree1);

    // 添加树2
    const tree2 = new Tree()
    tree2.generate();
    tree2.position.set(4, -2, -2);
    tree2.scale.set(0.7, 0.7, 0.7);
    tree2.traverse(object => {
        if (object.isMesh) {
            object.castShadow = object.receiveShadow = true;
        }
    });
    trees.add(tree2);

    group.add(trees);

    return group;
}

window.addEventListener("load", () => load().then((assets) => {

    // Renderer
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: true,
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

    // Camera & Controls
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = true;
    controls.position.set(0, 3, 10);

    // Scene, Lights, Objects
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加灯光 - 冬日阳光感
    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    // 添加环境光
    const ambientLight = new AmbientLight(0xaabbff, 0.3);
    scene.add(ambientLight);

    // 添加场景物体
    const sceneObjects = createScene();
    scene.add(sceneObjects);

    // 添加角色
    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.2);
    riggedSimple.scene.position.set(0, -2, 0);
    scene.add(riggedSimple.scene);

    // 添加动画
    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    // Post Processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // 创建深度和法线通道 (用于积雪效果)
    const normalPass = new NormalPass(scene, camera);

    // 创建积雪覆盖效果
    const snowOverlayEffect = new SnowOverlayEffect(camera, normalPass.texture, composer, {
        blendFunction: BlendFunction.NORMAL,
        snowAmount: 0.5,
        snowHeight: 20.0,
        snowBrightness: 1.5,
        additiveBlending: false,
        snowColor: 0xffffff
    });

    // 创建雪花飘落效果
    const snowfallEffect = new SnowfallEffect({
        blendFunction: BlendFunction.ADD,
        density: 1.0,
        snowSpeed: 0.3,
        snowSize: 0.4,
        windDirection: new Vector2(0.3, 0.1),
        snowColor: 0xffffff,
        alphaTest: 0.01,
        debugMode: 0,
        activeLayer: -1
    });

    // 添加效果通道
    composer.addPass(normalPass);
    composer.addPass(new EffectPass(camera, snowOverlayEffect));
    composer.addPass(new EffectPass(camera, snowfallEffect));

    // GUI
    const pane = new Pane({ container: container.querySelector(".tp") });
    const fpsMeter = new FPSMeter();
    const clock = performance;

    const folder = pane.addFolder({ title: "设置" });
    folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

    // 积雪覆盖效果控制
    const snowOverlayFolder = folder.addFolder({ title: "积雪覆盖" });
    snowOverlayFolder.addBinding(snowOverlayEffect, "snowAmount", { label: "积雪量", min: 0, max: 1, step: 0.01 });
    snowOverlayFolder.addBinding(snowOverlayEffect, "snowHeight", { label: "雪线高度", min: 1, max: 50, step: 0.1 });
    snowOverlayFolder.addBinding(snowOverlayEffect, "snowBrightness", { label: "雪亮度", min: 0.5, max: 3, step: 0.1 });
    snowOverlayFolder.addBinding(snowOverlayEffect, "additiveBlending", { label: "加性混合" });
    snowOverlayFolder.addBinding(snowOverlayEffect, "alphaTest", { label: "透明度阈值", min: 0, max: 1, step: 0.01 });

    // 添加垂直面雪阈值控制
    snowOverlayFolder.addBinding(snowOverlayEffect, "normalThreshold", {
        label: "垂直面阈值",
        min: 0,
        max: 1,
        step: 0.01
    });

    // 添加视角稳定性控制
    snowOverlayFolder.addBinding(snowOverlayEffect, "viewStability", {
        label: "视角稳定性",
        min: 0,
        max: 1,
        step: 0.01
    });

    // 添加积雪分布控制
    const distributionFolder = snowOverlayFolder.addFolder({ title: "积雪分布" });

    // 添加雪的不均匀度控制
    distributionFolder.addBinding(snowOverlayEffect, "snowNoisiness", {
        label: "不均匀度",
        min: 0,
        max: 1,
        step: 0.01
    });

    // 添加雪的堆积强度控制
    distributionFolder.addBinding(snowOverlayEffect, "snowAccumulation", {
        label: "堆积强度",
        min: 0,
        max: 1.5,
        step: 0.01
    });

    // 添加坡度控制 (当前后台功能暂时禁用，待重新实现)
    const slopeFolder = snowOverlayFolder.addFolder({ title: "坡度设置（暂未启用）" });
    slopeFolder.addBinding(snowOverlayEffect, "slopeMinAngle", {
        label: "最小雪面角度",
        min: 0,
        max: 0.5,
        step: 0.01
    }).on("change", (e) => {
        // 确保最小角度不大于最大角度
        if (e.value > snowOverlayEffect.slopeMaxAngle) {
            snowOverlayEffect.slopeMinAngle = snowOverlayEffect.slopeMaxAngle;
        }
    });

    slopeFolder.addBinding(snowOverlayEffect, "slopeMaxAngle", {
        label: "最大雪面角度",
        min: 0.1,
        max: 1,
        step: 0.01
    }).on("change", (e) => {
        // 确保最大角度不小于最小角度
        if (e.value < snowOverlayEffect.slopeMinAngle) {
            snowOverlayEffect.slopeMaxAngle = snowOverlayEffect.slopeMinAngle;
        }
    });

    // 添加雪色控制
    const snowColorParams = {
        snowColor: "#ffffff"
    };

    snowOverlayFolder.addBinding(snowColorParams, "snowColor", { label: "雪颜色" }).on("change", (e) => {
        snowOverlayEffect.snowColor.set(e.value);
    });

    // 雪花飘落效果控制
    const snowfallFolder = folder.addFolder({ title: "雪花飘落" });
    snowfallFolder.addBinding(snowfallEffect, "density", { label: "雪花密度", min: 0, max: 1, step: 0.01 });
    snowfallFolder.addBinding(snowfallEffect, "snowSpeed", { label: "下落速度", min: 0, max: 1, step: 0.01 });
    snowfallFolder.addBinding(snowfallEffect, "snowSize", { label: "雪花大小", min: 0, max: 1, step: 0.01 });

    // 风向控制
    const windFolder = snowfallFolder.addFolder({ title: "风向" });
    const windParams = {
        windX: snowfallEffect.windDirection.x,
        windY: snowfallEffect.windDirection.y
    };

    windFolder.addBinding(windParams, "windX", { label: "风向 X", min: -1, max: 1, step: 0.01 }).on("change", (e) => {
        snowfallEffect.windDirection.x = e.value;
    });

    windFolder.addBinding(windParams, "windY", { label: "风向 Y", min: -1, max: 1, step: 0.01 }).on("change", (e) => {
        snowfallEffect.windDirection.y = e.value;
    });

    // 雪花颜色控制
    const snowflakeColorParams = {
        snowflakeColor: "#ffffff"
    };

    snowfallFolder.addBinding(snowflakeColorParams, "snowflakeColor", { label: "雪花颜色" }).on("change", (e) => {
        snowfallEffect.snowColor.set(e.value);
    });

    // 添加透明度测试控制
    snowfallFolder.addBinding(snowfallEffect, "alphaTest", { label: "透明度阈值", min: 0, max: 1, step: 0.01 });

    // 添加雪花调试控制
    const debugFolder = snowfallFolder.addFolder({ title: "调试选项" });

    // 调试模式选择
    const debugModeOptions = {
        "关闭调试": 0,
        "显示UV坐标": 1,
        "显示旋转UV": 2,
        "显示雪花层1": 3,
        "显示雪花层2": 4,
        "显示雪花层3": 5,
        "显示雪花层4": 6,
        "显示雪花层5": 7,
        "显示纯色": 8
    };

    debugFolder.addBinding(snowfallEffect, "debugMode", {
        label: "调试模式",
        options: debugModeOptions
    });

    // 活跃层选择
    const layerOptions = {
        "全部图层": -1,
        "图层1 (大尺度)": 0,
        "图层2 (中尺度)": 1,
        "图层3 (中小尺度)": 2,
        "图层4 (小尺度)": 3,
        "图层5 (超小尺度)": 4
    };

    debugFolder.addBinding(snowfallEffect, "activeLayer", {
        label: "显示图层",
        options: layerOptions
    });

    // 添加混合模式选择（对调试特别有用）
    const blendModeOptions = {
        "ADD": BlendFunction.ADD,
        "ALPHA": BlendFunction.ALPHA,
        "AVERAGE": BlendFunction.AVERAGE,
        "COLOR_BURN": BlendFunction.COLOR_BURN,
        "COLOR_DODGE": BlendFunction.COLOR_DODGE,
        "DARKEN": BlendFunction.DARKEN,
        "DIFFERENCE": BlendFunction.DIFFERENCE,
        "DIVIDE": BlendFunction.DIVIDE,
        "DST": BlendFunction.DST,
        "EXCLUSION": BlendFunction.EXCLUSION,
        "LIGHTEN": BlendFunction.LIGHTEN,
        "MULTIPLY": BlendFunction.MULTIPLY,
        "NEGATION": BlendFunction.NEGATION,
        "NORMAL": BlendFunction.NORMAL,
        "OVERLAY": BlendFunction.OVERLAY,
        "REFLECT": BlendFunction.REFLECT,
        "SCREEN": BlendFunction.SCREEN,
        "SRC": BlendFunction.SRC,
        "SUBTRACT": BlendFunction.SUBTRACT
    };

    debugFolder.addBinding({ blendMode: BlendFunction.SCREEN }, "blendMode", {
        label: "混合模式",
        options: blendModeOptions
    }).on("change", (e) => {
        snowfallEffect.blendMode.setBlendFunction(e.value);
    });

    // 添加启用/禁用效果的选项
    const params = {
        enableSnowOverlay: true,
        enableSnowfall: true
    };

    folder.addBinding(params, "enableSnowOverlay", { label: "启用积雪覆盖" }).on("change", (e) => {
        snowOverlayEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
    });

    folder.addBinding(params, "enableSnowfall", { label: "启用雪花飘落" }).on("change", (e) => {
        snowfallEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
    });

    // 调整窗口大小
    let lastTime = 0;

    function onResize() {
        const dpr = window.devicePixelRatio.toFixed(1);
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        // 更新相机
        camera.fov = calculateVerticalFoV(90, aspect);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        // 更新渲染器和效果合成器
        renderer.setSize(width, height);
        renderer.setPixelRatio(dpr);
        composer.setSize(width, height);
    }

    window.addEventListener("resize", () => onResize());
    onResize();

    // 渲染循环
    requestAnimationFrame(function render(timestamp) {
        fpsMeter.update(timestamp);
        const elapsed = clock.now() - lastTime;
        lastTime = clock.now();

        // 更新控制器和动画
        if (elapsed > 0) {
            const delta = elapsed * 0.001;
            controls.update(timestamp, delta);
            if (animationMixer !== undefined) {
                animationMixer.update(delta);
            }
        }

        // 渲染场景
        composer.render();
        requestAnimationFrame(render);
    });
})); 