import {
    AnimationMixer,
    AmbientLight,
    Color,
    CubeTextureLoader,
    DirectionalLight,
    GLTFLoader,
    HemisphereLight,
    Group,
    LoadingManager,
    Mesh,
    PerspectiveCamera,
    Raycaster,
    Scene,
    SphereGeometry,
    PlaneGeometry,
    MeshStandardMaterial,
    MeshBasicMaterial,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    VSMShadowMap,
    WebGLRenderer
} from "three";

import {
    BlendFunction,
    SharpenEffect,
    AdaptiveSharpenEffect,
    OverrideMaterialManager,
    EffectComposer,
    EffectPass,
    RenderPass,
    BloomEffect,
    DepthOfFieldEffect,
    OutlineEffect
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

// 创建一个带纹理的平面，用于展示锐化效果
function createDetailedPlane(positionY, textureUrl) {
    const group = new Group();
    const geometry = new PlaneGeometry(6, 2);
    const material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.2
    });

    const plane = new Mesh(geometry, material);
    plane.position.set(0, positionY, 0);
    plane.rotation.x = -Math.PI / 4; // 稍微倾斜以更好地展示效果
    plane.castShadow = false;
    plane.receiveShadow = true;

    group.add(plane);
    return { group, plane };
}

window.addEventListener("load", () => load().then((assets) => {
    // Renderer
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

    // Camera & Controls
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = false;
    controls.position.set(0, 2, 8);

    // Scene, Lights, Objects
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加灯光
    const hemisphereLight = new HemisphereLight(0xffffbb, 0x080820, 1);
    scene.add(hemisphereLight);

    const directionalLight = new DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // 添加地面
    const ground = new Mesh(
        new PlaneGeometry(20, 20),
        new MeshStandardMaterial({ color: 0x999999, roughness: 0.8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);

    // 添加模型
    const actors = new Group();
    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.5);
    riggedSimple.scene.position.set(0, 0, 0);
    actors.add(riggedSimple.scene);
    scene.add(actors);

    // 添加几个不同材质的球体
    const spheresGroup = new Group();

    // 创建不同材质的球体
    function createMaterialSphere(position, material) {
        const sphere = new Mesh(
            new SphereGeometry(0.5, 32, 32),
            material
        );
        // 处理Vector2转换为3D位置 (x, y值使用传入的Vector2，z值设为0)
        if (position instanceof Vector2) {
            sphere.position.set(position.x, position.y, 0);
        } else {
            sphere.position.copy(position);
        }
        sphere.castShadow = sphere.receiveShadow = true;
        spheresGroup.add(sphere);
        return sphere;
    }

    // 金属球
    const metallicSphere = createMaterialSphere(
        new Vector2(-2, 0.5),
        new MeshStandardMaterial({
            color: 0x3366cc,
            roughness: 0.1,
            metalness: 1.0
        })
    );

    // 粗糙球
    const roughSphere = createMaterialSphere(
        new Vector2(0, 0.5),
        new MeshStandardMaterial({
            color: 0xcc3366,
            roughness: 0.9,
            metalness: 0.1
        })
    );

    // 玻璃球
    const glassSphere = createMaterialSphere(
        new Vector2(2, 0.5),
        new MeshStandardMaterial({
            color: 0x33cc99,
            roughness: 0.05,
            metalness: 0.2,
            transparent: true,
            opacity: 0.8
        })
    );

    scene.add(spheresGroup);

    // 添加动画
    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    // Post Processing
    OverrideMaterialManager.workaroundEnabled = true;
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);

    const composer = new EffectComposer(renderer, { multisampling });

    // 添加基本渲染通道
    composer.addPass(new RenderPass(scene, camera));

    // 添加模糊效果
    const bloomEffect = new BloomEffect({
        intensity: 0.5,
        luminanceThreshold: 0.3
    });

    const dofEffect = new DepthOfFieldEffect(camera, {
        focusDistance: 0.02,
        focalLength: 0.5,
        bokehScale: 5.0
    });

    // 创建一个定向光作为普通光源
    const sunLight = new DirectionalLight(0xffffbb, 2);
    sunLight.position.set(3, 5, 2);
    scene.add(sunLight);

    // 添加模糊效果通道 - 不包含GodRaysEffect
    const blurPass = new EffectPass(camera, bloomEffect, dofEffect);
    // composer.addPass(blurPass);

    // 添加轮廓效果
    const outlineEffect = new OutlineEffect(scene, camera, {
        blendFunction: BlendFunction.SCREEN,
        edgeStrength: 3.0,
        pulseSpeed: 0.0,
        visibleEdgeColor: 0xffcc00,
        hiddenEdgeColor: 0xff5500,
        blur: true,
        xRay: true
    });

    // 将球体添加到轮廓效果选择
    outlineEffect.selection.add(metallicSphere);
    outlineEffect.selection.add(roughSphere);
    outlineEffect.selection.add(glassSphere);

    // 添加轮廓效果通道
    const outlinePass = new EffectPass(camera, outlineEffect);
    composer.addPass(outlinePass);

    // 创建两个不同的锐化效果
    const basicSharpenEffect = new SharpenEffect({
        blendFunction: BlendFunction.NORMAL,
        intensity: 0.5,
        kernelSize: 1.0
    });
    // 设置初始不透明度
    basicSharpenEffect.blendMode.opacity.value = 1.0;

    const adaptiveSharpenEffect = new AdaptiveSharpenEffect({
        blendFunction: BlendFunction.NORMAL,
        intensity: 0.3,
        kernelSize: 1.0,
        adaptiveSharpening: true,
        threshold: 0.1
    });
    // 设置初始不透明度
    adaptiveSharpenEffect.blendMode.opacity.value = 1.0;

    // 默认禁用自适应锐化效果，只启用一个
    adaptiveSharpenEffect.enabled = false;

    // 创建一个包含两种锐化效果的通道
    const sharpenPass = new EffectPass(camera, basicSharpenEffect);

    // 添加锐化通道
    composer.addPass(sharpenPass);

    // Settings
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 锐化设置
    const folder = pane.addFolder({ title: "锐化效果设置" });

    // 创建参数对象
    const params = {
        "effectType": "basic", // 基本锐化或自适应锐化
        "intensity": 0.5,
        "kernelSize": 1.0,
        "opacity": 1.0,  // 添加不透明度参数
        "adaptiveSharpening": true,
        "threshold": 0.1,
        "multisampling": true,
        "splitView": false, // 分屏对比效果
        "outlineEnabled": true, // 轮廓效果开关
        "outlineStrength": 3.0, // 轮廓强度
        "outlineColor": '#ffcc00', // 轮廓颜色
        "xRay": true // X射线模式
    };

    // 添加效果开关
    folder.addBinding(params, "effectType", {
        options: {
            "基本锐化": "basic",
            "自适应锐化": "adaptive"
        }
    }).on("change", () => {
        if (params.effectType === "basic") {
            basicSharpenEffect.enabled = true;
            adaptiveSharpenEffect.enabled = false;
        } else {
            basicSharpenEffect.enabled = false;
            adaptiveSharpenEffect.enabled = true;
        }
    });

    folder.addBinding(params, "opacity", { min: 0, max: 1.0, step: 0.05, label: "不透明度" })
        .on("change", () => {
            // 为两个效果都设置不透明度，根据当前激活的效果生效
            basicSharpenEffect.blendMode.opacity.value = params.opacity;
            adaptiveSharpenEffect.blendMode.opacity.value = params.opacity;
        });

    folder.addBinding(params, "intensity", { min: 0, max: 2.0, step: 0.05 })
        .on("change", () => {
            if (params.effectType === "basic") {
                basicSharpenEffect.intensity = params.intensity;
            } else {
                adaptiveSharpenEffect.intensity = params.intensity;
            }
        });

    folder.addBinding(params, "kernelSize", { min: 0.5, max: 2.0, step: 0.1 })
        .on("change", () => {
            if (params.effectType === "basic") {
                basicSharpenEffect.kernelSize = params.kernelSize;
            } else {
                adaptiveSharpenEffect.kernelSize = params.kernelSize;
            }
        });

    // 自适应锐化特有参数
    const adaptiveFolder = folder.addFolder({ title: "自适应锐化参数" });

    adaptiveFolder.addBinding(params, "adaptiveSharpening")
        .on("change", () => {
            adaptiveSharpenEffect.adaptiveSharpening = params.adaptiveSharpening;
        });

    adaptiveFolder.addBinding(params, "threshold", { min: 0.01, max: 0.5, step: 0.01 })
        .on("change", () => {
            adaptiveSharpenEffect.threshold = params.threshold;
        });

    // 场景特定参数
    const sceneFolder = pane.addFolder({ title: "场景设置" });

    sceneFolder.addBinding(params, "multisampling")
        .on("change", (e) => {
            composer.multisampling = e.value ? multisampling : 0;
        });

    // 轮廓效果参数
    const outlineFolder = pane.addFolder({ title: "轮廓效果设置" });

    outlineFolder.addBinding(params, "outlineEnabled")
        .on("change", (e) => {
            outlineEffect.enabled = e.value;
        });

    outlineFolder.addBinding(params, "outlineStrength", { min: 0, max: 10, step: 0.1 })
        .on("change", (e) => {
            outlineEffect.edgeStrength = e.value;
        });

    outlineFolder.addBinding(params, "outlineColor", { view: 'color' })
        .on("change", (e) => {
            outlineEffect.visibleEdgeColor.set(e.value);
        });

    outlineFolder.addBinding(params, "xRay")
        .on("change", (e) => {
            outlineEffect.xRay = e.value;
        });

    // Resize Handler
    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // Render Loop
    let t0 = 0;

    function animate(timestamp) {
        const deltaTime = timestamp - t0;
        t0 = timestamp;

        fpsMeter.update(timestamp);
        controls.update(timestamp);
        animationMixer.update(deltaTime * 1e-3);

        // 旋转球体组
        spheresGroup.rotation.y += 0.005;

        composer.render();
        requestAnimationFrame(animate);
    }

    // 添加点击交互 - 选择/取消选择球体
    const raycaster = new Raycaster();
    const mouse = new Vector2();

    function onMouseClick(event) {
        // 计算鼠标在归一化设备坐标中的位置
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // 从相机和鼠标位置更新拾取射线
        raycaster.setFromCamera(mouse, camera);

        // 计算与球体组中物体的交叉点
        const intersects = raycaster.intersectObjects(spheresGroup.children);

        // 如果有交叉，切换选中状态
        if (intersects.length > 0) {
            const selectedObject = intersects[0].object;
            if (outlineEffect.selection.has(selectedObject)) {
                outlineEffect.selection.delete(selectedObject);
            } else {
                outlineEffect.selection.add(selectedObject);
            }
        }
    }

    container.addEventListener('click', onMouseClick);

    requestAnimationFrame(animate);
})); 