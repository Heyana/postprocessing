import {
    AnimationMixer,
    Color,
    CubeTextureLoader,
    GLTFLoader,
    LoadingManager,
    PerspectiveCamera,
    Raycaster,
    Scene,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    VSMShadowMap,
    WebGLRenderer
} from "three";
const myConsole = {
    log: (...args) => {
        return;
    },
    time: (...args) => {
        return;
    },
    timeEnd: (...args) => {
        return;
    }
}
import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    KernelSize,
    RenderPass,
    OutlineManager,
    SharedOutlineEffect,
    OverrideMaterialManager
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

    // 创建左上角开关面板的容器
    const switchContainer = document.createElement("div");
    switchContainer.style.position = "absolute";
    switchContainer.style.top = "20px";
    switchContainer.style.left = "20px";
    switchContainer.style.zIndex = "1000";
    switchContainer.style.background = "rgba(0, 0, 0, 0.7)";
    switchContainer.style.padding = "15px";
    switchContainer.style.borderRadius = "8px";
    switchContainer.style.color = "white";
    switchContainer.style.boxShadow = "0 4px 8px rgba(0,0,0,0.5)";
    switchContainer.style.minWidth = "220px";
    container.appendChild(switchContainer);

    // 添加使用说明标题
    const instructionTitle = document.createElement("div");
    instructionTitle.textContent = "轮廓效果控制";
    instructionTitle.style.fontWeight = "bold";
    instructionTitle.style.fontSize = "16px";
    instructionTitle.style.marginBottom = "10px";
    instructionTitle.style.borderBottom = "1px solid rgba(255,255,255,0.3)";
    instructionTitle.style.paddingBottom = "5px";
    switchContainer.appendChild(instructionTitle);

    // 添加简短说明
    const instruction = document.createElement("div");
    instruction.innerHTML = "点击模型添加轮廓效果<br>启用叠加模式后，可同时应用多种轮廓";
    instruction.style.fontSize = "12px";
    instruction.style.marginBottom = "15px";
    instruction.style.color = "#aaaaaa";
    switchContainer.appendChild(instruction);

    // Camera & Controls

    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = false;
    controls.position.set(2, 2, 10);

    // Scene, Lights, Objects

    const scene = new Scene();
    scene.background = assets.get("sky");
    scene.add(Shapes.createLights());
    const actors = Shapes.createActors();
    scene.add(actors);

    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.2);
    actors.add(riggedSimple.scene);

    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    const step = 2.0 * Math.PI / actors.children.length;
    const radius = 3.0;
    let angle = 3.5;

    for (const mesh of actors.children) {
        // Arrange the objects in a circle.
        mesh.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
        angle += step;
    }

    // Post Processing

    OverrideMaterialManager.workaroundEnabled = true;
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);

    const composer = new EffectComposer(renderer, { multisampling });

    // Create a shared outline manager
    const outlineManager = new OutlineManager(scene, camera, {
        resolutionScale: 0.75,
        multisampling
    });

    // Create multiple outline effects with different colors


    const blueOutlineEffect = new SharedOutlineEffect(outlineManager, {
        blendFunction: BlendFunction.SCREEN,
        patternScale: 35, // 略微不同的模式缩放，使叠加效果更明显
        visibleEdgeColor: 0x0000ff, // Blue
        hiddenEdgeColor: 0x000055, // Dark Blue
        resolutionScale: 0.75,
        blur: true, // 默认启用模糊
        kernelSize: KernelSize.VERY_SMALL, // 使用最小的kernel大小
        xRay: true,
        edgeStrength: 1.0, // 默认强度
    });
    const redOutlineEffect = new SharedOutlineEffect(outlineManager, {
        blendFunction: BlendFunction.SCREEN,
        patternScale: 40,
        visibleEdgeColor: 0xff0000, // Red
        hiddenEdgeColor: 0x550000, // Dark Red
        resolutionScale: 0.75,
        blur: true, // 默认启用模糊
        kernelSize: KernelSize.HUGE, // 使用最大的kernel大小
        xRay: true,
        edgeStrength: 10.0, // 默认强度
    });
    myConsole.log('Log-- ', blueOutlineEffect, 'blueOutlineEffect');
    // Set different selection layers to prevent color mixing
    redOutlineEffect.selectionLayer = 21; // 使用单独的层
    blueOutlineEffect.selectionLayer = 22; // 使用另一个单独的层

    // 调整初始对象选择，便于演示轮廓叠加效果
    // 添加第一、二个对象到红色轮廓
    redOutlineEffect.selection.add(actors.children[0]);
    redOutlineEffect.selection.add(actors.children[1]);

    // 添加第二、三个对象到蓝色轮廓（注意第二个对象同时拥有两种轮廓）
    blueOutlineEffect.selection.add(actors.children[1]);
    blueOutlineEffect.selection.add(actors.children[2]);

    // 创建对象标签函数
    function createObjectLabels() {
        const objectLabels = document.createElement("div");
        objectLabels.style.position = "absolute";
        objectLabels.style.top = "20px";
        objectLabels.style.right = "20px";
        objectLabels.style.zIndex = "1000";
        objectLabels.style.background = "rgba(0, 0, 0, 0.7)";
        objectLabels.style.padding = "15px";
        objectLabels.style.borderRadius = "8px";
        objectLabels.style.color = "white";
        objectLabels.style.boxShadow = "0 4px 8px rgba(0,0,0,0.5)";
        objectLabels.style.fontSize = "14px";
        objectLabels.style.minWidth = "180px";
        container.appendChild(objectLabels);

        const heading = document.createElement("div");
        heading.textContent = "对象轮廓状态";
        heading.style.fontWeight = "bold";
        heading.style.marginBottom = "10px";
        heading.style.borderBottom = "1px solid rgba(255,255,255,0.3)";
        heading.style.paddingBottom = "5px";
        objectLabels.appendChild(heading);

        // 添加图例说明
        const legend = document.createElement("div");
        legend.style.display = "flex";
        legend.style.flexDirection = "column";
        legend.style.gap = "5px";
        legend.style.marginBottom = "10px";
        legend.style.fontSize = "12px";

        // 红色图例
        const redLegend = document.createElement("div");
        redLegend.style.display = "flex";
        redLegend.style.alignItems = "center";

        const redDot = document.createElement("div");
        redDot.style.width = "10px";
        redDot.style.height = "10px";
        redDot.style.borderRadius = "50%";
        redDot.style.background = "#ff0000";
        redDot.style.marginRight = "5px";

        redLegend.appendChild(redDot);
        redLegend.appendChild(document.createTextNode("红色轮廓"));

        // 蓝色图例
        const blueLegend = document.createElement("div");
        blueLegend.style.display = "flex";
        blueLegend.style.alignItems = "center";

        const blueDot = document.createElement("div");
        blueDot.style.width = "10px";
        blueDot.style.height = "10px";
        blueDot.style.borderRadius = "50%";
        blueDot.style.background = "#0000ff";
        blueDot.style.marginRight = "5px";

        blueLegend.appendChild(blueDot);
        blueLegend.appendChild(document.createTextNode("蓝色轮廓"));

        // 叠加图例
        const mixedLegend = document.createElement("div");
        mixedLegend.style.display = "flex";
        mixedLegend.style.alignItems = "center";

        const mixedDot = document.createElement("div");
        mixedDot.style.width = "10px";
        mixedDot.style.height = "10px";
        mixedDot.style.borderRadius = "50%";
        mixedDot.style.background = "linear-gradient(135deg, #ff0000 50%, #0000ff 50%)";
        mixedDot.style.marginRight = "5px";

        mixedLegend.appendChild(mixedDot);
        mixedLegend.appendChild(document.createTextNode("双重轮廓"));

        legend.appendChild(redLegend);
        legend.appendChild(blueLegend);
        legend.appendChild(mixedLegend);

        objectLabels.appendChild(legend);

        // 为每个对象创建标签
        for (let i = 0; i < actors.children.length; i++) {
            const label = document.createElement("div");
            label.style.display = "flex";
            label.style.alignItems = "center";
            label.style.margin = "5px 0";

            const colorIndicator = document.createElement("div");
            colorIndicator.id = `object-color-${i}`;
            colorIndicator.style.width = "12px";
            colorIndicator.style.height = "12px";
            colorIndicator.style.borderRadius = "50%";
            colorIndicator.style.marginRight = "8px";

            // 初始化颜色指示器
            updateObjectColorIndicator(i, colorIndicator);

            const text = document.createElement("span");
            text.textContent = `对象 ${i + 1}`;

            label.appendChild(colorIndicator);
            label.appendChild(text);
            objectLabels.appendChild(label);
        }

        // 返回更新函数，以便稍后更新指示器
        return function updateLabels() {
            for (let i = 0; i < actors.children.length; i++) {
                const colorIndicator = document.getElementById(`object-color-${i}`);
                if (colorIndicator) {
                    updateObjectColorIndicator(i, colorIndicator);
                }
            }
        };
    }

    // 更新对象颜色指示器
    function updateObjectColorIndicator(objectIndex, indicator) {
        const object = actors.children[objectIndex];
        const hasRed = redOutlineEffect.selection.has(object);
        const hasBlue = blueOutlineEffect.selection.has(object);

        if (hasRed && hasBlue) {
            // 同时有红色和蓝色轮廓
            indicator.style.background = "linear-gradient(135deg, #ff0000 50%, #0000ff 50%)";
            indicator.style.boxShadow = "0 0 3px rgba(128,0,128,0.8)";
        } else if (hasRed) {
            // 只有红色轮廓
            indicator.style.background = "#ff0000";
            indicator.style.boxShadow = "0 0 3px rgba(255,0,0,0.8)";
        } else if (hasBlue) {
            // 只有蓝色轮廓
            indicator.style.background = "#0000ff";
            indicator.style.boxShadow = "0 0 3px rgba(0,0,255,0.8)";
        } else {
            // 没有轮廓
            indicator.style.background = "#555555";
            indicator.style.boxShadow = "none";
        }
    }

    // 创建对象标签并获取更新函数
    const updateObjectLabels = createObjectLabels();

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, redOutlineEffect, blueOutlineEffect));

    // Object Picking

    const ndc = new Vector2();
    const raycaster = new Raycaster();
    renderer.domElement.addEventListener("pointerdown", (event) => {

        const clientRect = container.getBoundingClientRect();
        const clientX = event.clientX - clientRect.left;
        const clientY = event.clientY - clientRect.top;
        ndc.x = (clientX / container.clientWidth) * 2.0 - 1.0;
        ndc.y = -(clientY / container.clientHeight) * 2.0 + 1.0;
        raycaster.setFromCamera(ndc, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;

            // 支持轮廓叠加的新逻辑
            if (params.enableOverlap) {
                // 叠加模式: 切换轮廓状态而不删除其他轮廓
                if (params.useBlueOutline) {
                    // 切换蓝色轮廓
                    if (blueOutlineEffect.selection.has(object)) {
                        blueOutlineEffect.selection.delete(object);
                    } else {
                        blueOutlineEffect.selection.add(object);
                    }
                } else {
                    // 切换红色轮廓
                    if (redOutlineEffect.selection.has(object)) {
                        redOutlineEffect.selection.delete(object);
                    } else {
                        redOutlineEffect.selection.add(object);
                    }
                }
            } else {
                // 传统模式: 互斥轮廓
                // 清除两个效果中的对象
                redOutlineEffect.selection.delete(object);
                blueOutlineEffect.selection.delete(object);

                // 根据开关状态决定使用哪个轮廓效果
                if (params.useBlueOutline) {
                    blueOutlineEffect.selection.add(object);
                } else {
                    redOutlineEffect.selection.add(object);
                }
            }

            // Force the shared manager to update
            outlineManager.setNeedsUpdate();

            // 更新对象标签
            updateObjectLabels();
        }

    });

    // Settings

    const fpsMeter = new FPSMeter();
    const color = new Color();

    const params = {
        "patternTexture": false,
        "multisampling": true,
        "redVisibleEdgeColor": color.copy(redOutlineEffect.visibleEdgeColor).convertLinearToSRGB().getHex(),
        "redHiddenEdgeColor": color.copy(redOutlineEffect.hiddenEdgeColor).convertLinearToSRGB().getHex(),
        "blueVisibleEdgeColor": color.copy(blueOutlineEffect.visibleEdgeColor).convertLinearToSRGB().getHex(),
        "blueHiddenEdgeColor": color.copy(blueOutlineEffect.hiddenEdgeColor).convertLinearToSRGB().getHex(),
        "useBlueOutline": false, // 默认使用红色轮廓
        "enableOverlap": false   // 新增：是否允许轮廓叠加
    };

    // 创建左上角的开关面板
    const switchPane = new Pane({ container: switchContainer });
    switchPane.addBinding(params, "useBlueOutline", {
        label: "点击模型使用蓝色轮廓"
    })
        .on("change", (e) => {
            // 更新颜色指示器
            if (e.value) {
                colorSwatch.style.background = "#0000ff";
                colorSwatch.style.boxShadow = "0 0 5px rgba(0,0,255,0.8)";
            } else {
                colorSwatch.style.background = "#ff0000";
                colorSwatch.style.boxShadow = "0 0 5px rgba(255,0,0,0.8)";
            }
            myConsole.log("轮廓颜色切换为:", e.value ? "蓝色" : "红色");
        });

    // 添加轮廓叠加选项
    switchPane.addBinding(params, "enableOverlap", {
        label: "启用轮廓叠加"
    })
        .on("change", (e) => {
            // mainPane相关操作移到mainPane初始化后
            if (e.value) {
                // 启用叠加时，更新颜色指示器
                colorSwatch.style.background = "linear-gradient(135deg, #ff0000 50%, #0000ff 50%)";
                colorSwatch.style.boxShadow = "0 0 5px rgba(128,0,128,0.8)";

                // 更新说明文本
                instruction.innerHTML = "点击模型切换所选轮廓状态<br>可以同时应用红色和蓝色轮廓";
            } else {
                // 关闭叠加时恢复之前的状态
                if (params.useBlueOutline) {
                    colorSwatch.style.background = "#0000ff";
                    colorSwatch.style.boxShadow = "0 0 5px rgba(0,0,255,0.8)";
                } else {
                    colorSwatch.style.background = "#ff0000";
                    colorSwatch.style.boxShadow = "0 0 5px rgba(255,0,0,0.8)";
                }

                // 更新说明文本
                instruction.innerHTML = "点击模型添加轮廓效果<br>启用叠加模式后，可同时应用多种轮廓";
            }
            myConsole.log("轮廓叠加模式:", e.value ? "启用" : "禁用");
        });

    // 创建颜色指示器
    const colorIndicator = document.createElement("div");
    colorIndicator.style.display = "flex";
    colorIndicator.style.alignItems = "center";
    colorIndicator.style.justifyContent = "space-between";
    colorIndicator.style.marginTop = "10px";
    colorIndicator.style.padding = "5px";
    colorIndicator.style.borderRadius = "4px";
    colorIndicator.style.background = "rgba(255, 255, 255, 0.1)";

    const colorLabel = document.createElement("div");
    colorLabel.textContent = "当前轮廓颜色:";
    colorLabel.style.marginRight = "10px";

    const colorSwatch = document.createElement("div");
    colorSwatch.style.width = "20px";
    colorSwatch.style.height = "20px";
    colorSwatch.style.borderRadius = "50%";
    colorSwatch.style.background = "#ff0000"; // 默认红色
    colorSwatch.style.boxShadow = "0 0 5px rgba(255,0,0,0.8)";
    colorSwatch.style.transition = "all 0.3s ease";

    colorIndicator.appendChild(colorLabel);
    colorIndicator.appendChild(colorSwatch);

    // 添加颜色指示器到容器
    switchContainer.appendChild(colorIndicator);

    // 右侧主控制面板
    const mainPane = new Pane({ container: container.querySelector(".tp") });
    mainPane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 添加轮廓叠加设置面板 - 移到这里，在mainPane初始化之后
    const folderOverlap = mainPane.addFolder({ title: "轮廓叠加设置", expanded: false });

    // 添加红色轮廓厚度控制
    folderOverlap.addBinding(redOutlineEffect, "edgeStrength", {
        label: "红色轮廓强度",
        min: 0.2,
        max: 4.0,
        step: 0.1
    });

    // 添加蓝色轮廓厚度控制
    folderOverlap.addBinding(blueOutlineEffect, "edgeStrength", {
        label: "蓝色轮廓强度",
        min: 0.2,
        max: 4.0,
        step: 0.1
    });

    // 添加切换按钮 - 快速预设不同厚度组合
    const overlapPresets = {
        "redThicker": function () {
            redOutlineEffect.edgeStrength = 2.0;
            blueOutlineEffect.edgeStrength = 1.0;
        },
        "blueThicker": function () {
            redOutlineEffect.edgeStrength = 1.0;
            blueOutlineEffect.edgeStrength = 2.0;
        },
        "bothEqual": function () {
            redOutlineEffect.edgeStrength = 1.5;
            blueOutlineEffect.edgeStrength = 1.5;
        }
    };

    // 添加预设按钮
    folderOverlap.addButton({ title: "红色轮廓更粗" }).on("click", overlapPresets.redThicker);
    folderOverlap.addButton({ title: "蓝色轮廓更粗" }).on("click", overlapPresets.blueThicker);
    folderOverlap.addButton({ title: "均衡粗细" }).on("click", overlapPresets.bothEqual);

    // 更新enableOverlap的change处理函数
    document.addEventListener("DOMContentLoaded", () => {
        const overlapBinding = switchPane.controller_.bindings_.find(b => b.binding.target.enableOverlap !== undefined);
        if (overlapBinding) {
            overlapBinding.on("change", (e) => {
                // 显示或隐藏叠加设置面板
                folderOverlap.expanded = e.value;

                // 启用叠加时，默认设置不同的边缘强度，以便能看到叠加效果
                if (e.value) {
                    overlapPresets.bothEqual();
                } else {
                    // 重置边缘强度到默认值
                    redOutlineEffect.edgeStrength = 1.0;
                    blueOutlineEffect.edgeStrength = 1.0;
                }
            });
        }
    });

    const folderShared = mainPane.addFolder({ title: "Shared Settings" });
    folderShared.addBinding(outlineManager, "resolutionScale", { label: "resolution", min: 0.5, max: 1, step: 0.05 })
        .on("change", () => {
            // Update size when resolution scale changes
            const width = container.clientWidth, height = container.clientHeight;
            outlineManager.setSize(width, height);
        });

    folderShared.addBinding(params, "multisampling")
        .on("change", (e) => {
            const value = e.value ? multisampling : 0;
            outlineManager.renderTargetMask.samples = value;
            outlineManager.renderTargetMask.dispose();
            outlineManager.setNeedsUpdate();
        });

    folderShared.addBinding(params, "patternTexture")
        .on("change", (e) => {
            const texture = e.value ? assets.get("pattern") : null;
            redOutlineEffect.patternTexture = texture;
            blueOutlineEffect.patternTexture = texture;
        });

    // Red outline settings
    const folderRed = mainPane.addFolder({ title: "Red Outline" });
    folderRed.addBinding(redOutlineEffect.blurPass, "kernelSize", { options: KernelSize });
    folderRed.addBinding(redOutlineEffect.blurPass, "enabled", { label: "blur" });
    folderRed.addBinding(redOutlineEffect, "patternScale", { min: 20, max: 100, step: 0.1 });
    folderRed.addBinding(redOutlineEffect, "edgeStrength", { min: 0, max: 10, step: 0.01 });
    folderRed.addBinding(redOutlineEffect, "pulseSpeed", { min: 0, max: 2, step: 0.01 });
    folderRed.addBinding(params, "redVisibleEdgeColor", { view: "color", label: "visibleEdgeColor" })
        .on("change", (e) => redOutlineEffect.visibleEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderRed.addBinding(params, "redHiddenEdgeColor", { view: "color", label: "hiddenEdgeColor" })
        .on("change", (e) => redOutlineEffect.hiddenEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderRed.addBinding(redOutlineEffect, "xRay");

    // Blue outline settings
    const folderBlue = mainPane.addFolder({ title: "Blue Outline" });
    folderBlue.addBinding(blueOutlineEffect.blurPass, "kernelSize", { options: KernelSize });
    folderBlue.addBinding(blueOutlineEffect.blurPass, "enabled", { label: "blur" });
    folderBlue.addBinding(blueOutlineEffect, "patternScale", { min: 20, max: 100, step: 0.1 });
    folderBlue.addBinding(blueOutlineEffect, "edgeStrength", { min: 0, max: 10, step: 0.01 });
    folderBlue.addBinding(blueOutlineEffect, "pulseSpeed", { min: 0, max: 2, step: 0.01 });
    folderBlue.addBinding(params, "blueVisibleEdgeColor", { view: "color", label: "visibleEdgeColor" })
        .on("change", (e) => blueOutlineEffect.visibleEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderBlue.addBinding(params, "blueHiddenEdgeColor", { view: "color", label: "hiddenEdgeColor" })
        .on("change", (e) => blueOutlineEffect.hiddenEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderBlue.addBinding(blueOutlineEffect, "xRay");

    // Resize Handler

    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
        outlineManager.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // Stats for performance monitoring
    const perfStats = {
        depthPassTime: 0,
        maskPassTime: 0,
        redOutlineTime: 0,
        blueOutlineTime: 0,
        totalTime: 0
    };

    // Add performance stats folder
    const folderPerf = mainPane.addFolder({ title: "Performance" });
    folderPerf.addBinding(perfStats, "depthPassTime", { label: "Depth Pass (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "maskPassTime", { label: "Mask Pass (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "redOutlineTime", { label: "Red Outline (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "blueOutlineTime", { label: "Blue Outline (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "totalTime", { label: "Total Outline (ms)", readonly: true });

    // Create our own timer system instead of using myConsole._times which is browser-dependent
    const customTimers = new Map();

    // Override myConsole.time to use our custom timers
    const originalTime = myConsole.time;
    myConsole.time = function (label) {
        customTimers.set(label, performance.now());
        return originalTime.apply(console, arguments);
    };

    // Override myConsole.timeEnd to capture timings
    const originalTimeEnd = myConsole.timeEnd;
    myConsole.timeEnd = function (label) {
        const result = originalTimeEnd.apply(console, arguments);

        // Only proceed if we have a start time for this timer
        if (customTimers.has(label)) {
            const startTime = customTimers.get(label);
            const duration = performance.now() - startTime;
            customTimers.delete(label);

            // Capture the time for our stats
            if (label === "SharedOutline.depthPass") {
                perfStats.depthPassTime = duration;
            } else if (label === "SharedOutline.maskPass") {
                perfStats.maskPassTime = duration;
            } else if (label === "SharedOutlineEffect.outlinePass") {
                // Check which outline effect is active based on our custom markers
                if (customTimers.has("SharedOutlineEffect.update.redOutline")) {
                    perfStats.redOutlineTime = duration;
                } else if (customTimers.has("SharedOutlineEffect.update.blueOutline")) {
                    perfStats.blueOutlineTime = duration;
                }
            } else if (label === "SharedOutline.update") {
                perfStats.totalTime = duration;
            }
        }

        return result;
    };

    // Add custom timestamps to distinguish between red and blue outline updates
    const originalUpdate = redOutlineEffect.update;
    redOutlineEffect.update = function (renderer, inputBuffer, deltaTime) {
        myConsole.time("SharedOutlineEffect.update.redOutline");
        const result = originalUpdate.call(this, renderer, inputBuffer, deltaTime);
        myConsole.timeEnd("SharedOutlineEffect.update.redOutline");
        customTimers.delete("SharedOutlineEffect.update.redOutline");
        return result;
    };

    const originalUpdateBlue = blueOutlineEffect.update;
    blueOutlineEffect.update = function (renderer, inputBuffer, deltaTime) {
        myConsole.time("SharedOutlineEffect.update.blueOutline");
        const result = originalUpdateBlue.call(this, renderer, inputBuffer, deltaTime);
        myConsole.timeEnd("SharedOutlineEffect.update.blueOutline");
        customTimers.delete("SharedOutlineEffect.update.blueOutline");
        return result;
    };

    // Render Loop

    let t0 = 0;

    requestAnimationFrame(function render(timestamp) {

        const deltaTime = timestamp - t0;
        t0 = timestamp;

        fpsMeter.update(timestamp);
        controls.update(timestamp);
        animationMixer.update(deltaTime * 1e-3);

        // 更新对象标签状态
        updateObjectLabels();

        composer.render();
        requestAnimationFrame(render);

    });

})); 