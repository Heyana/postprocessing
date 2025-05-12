import {
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    Mesh,
    PlaneGeometry,
    SphereGeometry,
    TorusGeometry,
    BoxGeometry,
    DirectionalLight,
    AmbientLight,
    CubeTextureLoader,
    TextureLoader,
    Clock,
    RepeatWrapping,
    DoubleSide,
    MeshStandardMaterial,
    Group
} from "three";

import {
    TangentSpaceInteriorMaterial
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 加载纹理
function loadTextures() {
    return new Promise((resolve) => {
        const cubeTextureLoader = new CubeTextureLoader();
        const textureLoader = new TextureLoader();
        const textures = {};

        // 尝试加载立方体贴图
        cubeTextureLoader.setPath(document.baseURI + "img/textures/skies/sunset/")
            .load(
                ["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"],
                (roomCube) => {
                    textures.roomCube = roomCube;
                    checkAllLoaded();
                },
                undefined, // 进度回调
                () => {
                    console.log("无法加载房间立方体贴图，使用替代纹理");
                    checkAllLoaded(); // 即使加载失败也继续
                }
            );

        // 加载单张图片立方体贴图
        textureLoader.load(
            document.baseURI + "img/InteriorMappingMaterial/map.png",
            (roomMap) => {
                textures.roomMap = roomMap;
                // 确保贴图重复
                roomMap.wrapS = roomMap.wrapT = RepeatWrapping;
                checkAllLoaded();
            },
            undefined, // 进度回调
            () => {
                console.log("无法加载单张图片立方体贴图");
                checkAllLoaded(); // 即使加载失败也继续
            }
        );

        // 检查是否所有纹理已加载完成
        let loadedCount = 0;
        function checkAllLoaded() {
            loadedCount++;
            if (loadedCount >= 2) { // 两种纹理都尝试加载完成
                resolve(textures);
            }
        }
    });
}

// 演示状态
const demoState = {
    rotateObjects: true,       // 默认开启旋转，演示在曲面上的效果
    useSingleTexture: true,
    roomScale: 1.0,
    roomVariety: 0.8,          // 增加默认的房间变化程度，让房间更有区别
    roomDepth: 0.5,            // 默认值为0.5，标准深度
    roomsX: 2,                 // 默认横向2个房间
    roomsY: 3,                 // 默认纵向3个房间
    gapSize: 0.05,             // 默认间隔大小
    gapColor: "#222222",       // 默认间隔颜色
    glassStrength: 0.3,        // 默认前景玻璃反射强度
    glassColor: "#AADDFF",     // 默认前景玻璃颜色 - 更亮的蓝色
    flipTextureY: true,        // 默认在着色器中翻转贴图Y轴
    showSphere: true,          // 显示球体模型
    showTorus: true,           // 显示环面模型
    showPlane: true,           // 显示平面模型
    showCube: true,            // 显示立方体模型
    handleBackFaces: false,    // 默认不特殊处理背面
    invert3DDepthOnBackFace: true,  // 默认在背面时翻转Y轴方向
    useOriginalRaytracing: false    // 默认不使用原始光线追踪算法
};

// 存储初始颜色的标准化值
const initialGlassColor = "#AADDFF";

// 创建演示场景
function createScene(textures) {
    const scene = new Scene();
    const objects = new Group();
    scene.add(objects);

    // 添加灯光
    const directionalLight = new DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(0.5, 0.7, 0.5).normalize();
    scene.add(directionalLight);
    directionalLight.intensity = 10;
    const ambientLight = new AmbientLight(0x404040, 0.5);
    ambientLight.intensity = 10;
    scene.add(ambientLight);

    // 创建材质
    const material = new TangentSpaceInteriorMaterial({
        roomScale: demoState.roomScale,
        roomVariety: demoState.roomVariety,
        roomDepth: demoState.roomDepth,
        roomsX: demoState.roomsX,
        roomsY: demoState.roomsY,
        gapSize: demoState.gapSize,
        gapColor: demoState.gapColor,
        glassStrength: demoState.glassStrength,
        glassColor: demoState.glassColor,
        flipTextureY: demoState.flipTextureY,
        handleBackFaces: demoState.handleBackFaces,
        invert3DDepthOnBackFace: demoState.invert3DDepthOnBackFace,
        useOriginalRaytracing: demoState.useOriginalRaytracing
    });

    // 根据默认状态设置纹理
    if (demoState.useSingleTexture && textures.roomMap) {
        material.roomMap = textures.roomMap;
    } else if (textures.roomCube) {
        material.roomCube = textures.roomCube;
    }

    // 创建平面
    const planeGeometry = new PlaneGeometry(5, 5, 10, 10);
    planeGeometry.computeTangents(); // 计算切线，确保切线空间正常工作
    const plane = new Mesh(planeGeometry, material);
    plane.position.set(0, 0, 0);
    plane.visible = demoState.showPlane;
    objects.add(plane);

    // 创建球体
    const sphereGeometry = new SphereGeometry(2.5, 32, 32);
    sphereGeometry.computeTangents(); // 计算切线，确保切线空间正常工作
    const sphere = new Mesh(sphereGeometry, material);
    sphere.position.set(-6, 0, 0);
    sphere.visible = demoState.showSphere;
    objects.add(sphere);

    // 创建环面
    const torusGeometry = new TorusGeometry(2, 0.8, 32, 64);
    torusGeometry.computeTangents(); // 计算切线，确保切线空间正常工作
    const torus = new Mesh(torusGeometry, material);
    torus.position.set(6, 0, 0);
    torus.visible = demoState.showTorus;
    objects.add(torus);

    // 创建立方体
    const cubeGeometry = new BoxGeometry(4, 4, 4, 10, 10, 10);
    cubeGeometry.computeTangents(); // 计算切线，确保切线空间正常工作
    const cube = new Mesh(cubeGeometry, material);
    cube.position.set(0, 6, 0);
    cube.rotation.set(Math.PI / 6, Math.PI / 6, 0); // 略微旋转以便更好地展示效果
    cube.visible = demoState.showCube;
    objects.add(cube);

    // 添加简单的地面
    const groundGeometry = new PlaneGeometry(40, 40);
    const groundMaterial = new MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.9,
        metalness: 0.1,
        side: DoubleSide
    });
    const ground = new Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -4;
    scene.add(ground);

    return { scene, objects, plane, sphere, torus, cube };
}

window.addEventListener("load", () => {
    // 加载纹理
    loadTextures().then(textures => {
        // 基本设置
        const renderer = new WebGLRenderer({
            powerPreference: "high-performance",
            antialias: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);

        const container = document.querySelector(".viewport");
        container.prepend(renderer.domElement);

        // 相机和控制器
        const camera = new PerspectiveCamera();
        const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
        const settings = controls.settings;
        settings.general.mode = ControlMode.THIRD_PERSON;
        settings.translation.enabled = true;
        controls.position.set(0, 0, 12);  // 调整相机位置
        controls.lookAt(0, 0, 0);

        // 创建场景
        const { scene, objects, plane, sphere, torus, cube } = createScene(textures);

        // 设置时钟
        const clock = new Clock();

        // 配置GUI控制面板
        const fpsMeter = new FPSMeter();
        const pane = new Pane({ container: container.querySelector(".tp") });
        pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

        // 添加旋转控制选项
        pane.addBinding(demoState, "rotateObjects", {
            label: "旋转对象",
        }).on("change", (event) => {
            // 当用户关闭旋转时，重置旋转
            if (!event.value) {
                objects.rotation.y = 0;
            }
        });

        // 添加模型显示控制
        pane.addBinding(demoState, "showPlane", {
            label: "显示平面"
        }).on("change", (event) => {
            plane.visible = event.value;
        });

        pane.addBinding(demoState, "showSphere", {
            label: "显示球体"
        }).on("change", (event) => {
            sphere.visible = event.value;
        });

        pane.addBinding(demoState, "showTorus", {
            label: "显示环面"
        }).on("change", (event) => {
            torus.visible = event.value;
        });

        pane.addBinding(demoState, "showCube", {
            label: "显示立方体"
        }).on("change", (event) => {
            cube.visible = event.value;
        });

        const folder = pane.addFolder({ title: "切线空间室内映射材质参数" });

        // 添加贴图类型切换选项
        folder.addBinding(demoState, "useSingleTexture", {
            label: "使用单张贴图"
        }).on("change", (event) => {
            if (event.value) {
                plane.material.roomCube = null;
                plane.material.roomMap = textures.roomMap;
            } else {
                plane.material.roomCube = textures.roomCube;
            }
        });

        folder.addBinding(demoState, "roomScale", {
            label: "房间尺寸",
            min: 0.01,
            max: 3.0,
            step: 0.01
        }).on("change", (event) => {
            plane.material.roomScale = event.value;
        });

        folder.addBinding(demoState, "roomVariety", {
            label: "房间变化程度",
            min: 0,
            max: 1.0,
            step: 0.05
        }).on("change", (event) => {
            plane.material.roomVariety = event.value;
        });

        // 在GUI中添加房间深度控制滑块
        folder.addBinding(demoState, "roomDepth", {
            label: "房间深度",
            min: 0.001,
            max: 0.999,
            step: 0.01
        }).on("change", (event) => {
            plane.material.roomDepth = event.value;
        });

        // 添加说明提示
        folder.addBinding({
            depthInfo: "深度参数: 0.5为标准深度，<0.5更深，>0.5更浅"
        }, "depthInfo", {
            label: "深度参数说明",
            readonly: true
        });

        // 添加贴图Y轴翻转控制选项
        folder.addBinding(demoState, "flipTextureY", {
            label: "贴图Y轴翻转",
        }).on("change", (event) => {
            plane.material.flipTextureY = event.value;
        });

        // 添加背面处理选项
        folder.addBinding(demoState, "handleBackFaces", {
            label: "处理背面",
        }).on("change", (event) => {
            plane.material.handleBackFaces = event.value;
        });

        // 添加背面反转3D深度方向选项
        folder.addBinding(demoState, "invert3DDepthOnBackFace", {
            label: "背面翻转Y轴方向",
        }).on("change", (event) => {
            plane.material.invert3DDepthOnBackFace = event.value;
        });

        // 添加原始光线追踪选项
        folder.addBinding(demoState, "useOriginalRaytracing", {
            label: "使用原始光线追踪",
        }).on("change", (event) => {
            plane.material.useOriginalRaytracing = event.value;
        });

        // 添加房间布局控制选项
        const roomLayoutFolder = pane.addFolder({ title: "房间布局设置" });

        // 添加横向房间数量控制
        roomLayoutFolder.addBinding(demoState, "roomsX", {
            label: "横向房间数",
            min: 1,
            max: 10,
            step: 1
        }).on("change", (event) => {
            plane.material.roomsX = event.value;
        });

        // 添加纵向房间数量控制
        roomLayoutFolder.addBinding(demoState, "roomsY", {
            label: "纵向房间数",
            min: 1,
            max: 10,
            step: 1
        }).on("change", (event) => {
            plane.material.roomsY = event.value;
        });

        // 添加间隔大小控制
        roomLayoutFolder.addBinding(demoState, "gapSize", {
            label: "间隔大小",
            min: 0,
            max: 0.3,
            step: 0.01
        }).on("change", (event) => {
            plane.material.gapSize = event.value;
        });

        // 添加间隔颜色控制
        roomLayoutFolder.addBinding(demoState, "gapColor", {
            label: "间隔颜色",
            view: "color"
        }).on("change", (event) => {
            plane.material.gapColor = event.value;
        });

        // 添加玻璃效果控制选项
        const glassEffectFolder = pane.addFolder({ title: "玻璃效果设置" });

        // 添加玻璃反射强度控制
        glassEffectFolder.addBinding(demoState, "glassStrength", {
            label: "玻璃反射强度",
            min: 0.0,
            max: 1.0,
            step: 0.01
        }).on("change", (event) => {
            plane.material.glassStrength = event.value;
        });

        // 添加玻璃颜色控制
        glassEffectFolder.addBinding(demoState, "glassColor", {
            label: "玻璃颜色",
            view: "color"
        }).on("change", (event) => {
            // 标准化处理颜色值
            const color = event.value;
            plane.material.glassColor = color;

            // 强制更新材质的uniforms
            plane.material.needsUpdate = true;
        });

        // 添加重置玻璃颜色按钮
        glassEffectFolder.addButton({
            title: "重置为默认颜色"
        }).on("click", () => {
            // 重置为初始值
            demoState.glassColor = initialGlassColor;
            plane.material.glassColor = initialGlassColor;
            plane.material.needsUpdate = true;
            // 通知GUI更新
            pane.refresh();
        });

        // 在玻璃控制区添加提示文本
        glassEffectFolder.addBinding({
            info: "注意: 建议选择较亮的颜色作为玻璃颜色以获得最佳效果"
        }, "info", {
            label: "提示",
            readonly: true
        });

        // 窗口大小调整处理
        function onResize() {
            const width = container.clientWidth, height = container.clientHeight;
            camera.aspect = width / height;
            camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }

        // 渲染循环
        function render() {
            const deltaTime = clock.getDelta();
            fpsMeter.update();
            controls.update(deltaTime);

            // 如果需要演示旋转对象
            if (demoState.rotateObjects) {
                const time = clock.getElapsedTime();
                objects.rotation.y = time * 0.2;  // 保持缓慢旋转
            }

            // 更新材质
            plane.material.update(deltaTime);

            renderer.render(scene, camera);
            requestAnimationFrame(render);
        }

        window.addEventListener("resize", onResize);
        onResize();
        requestAnimationFrame(render);
    });
}); 