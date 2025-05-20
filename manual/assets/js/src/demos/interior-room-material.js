import {
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    Mesh,
    PlaneGeometry,
    DirectionalLight,
    AmbientLight,
    TextureLoader,
    RepeatWrapping,
    Clock,
    MeshBasicMaterial,
    BoxGeometry,
    Group,
    Vector2
} from "three";

import {
    InteriorRoomMaterial
} from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode } from "spatial-controls";
import { SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 加载室内纹理
function loadTexture(url) {
    return new Promise((resolve, reject) => {
        const textureLoader = new TextureLoader();
        textureLoader.load(
            url,
            (texture) => {
                texture.wrapS = RepeatWrapping;
                texture.wrapT = RepeatWrapping;
                console.log(`纹理加载成功: ${url}`);
                resolve(texture);
            },
            undefined,
            (error) => {
                console.error(`纹理加载失败: ${url}`, error);
                reject(error);
            }
        );
    });
}

// 创建假室内演示场景
function createScene(texture) {
    const scene = new Scene();

    // 添加灯光
    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);

    const ambientLight = new AmbientLight(0x404040);
    scene.add(ambientLight);

    // 创建一个建筑框架组
    const building = new Group();
    scene.add(building);

    // 创建简单的建筑外墙 (使用基础材质)
    const wallMaterial = new MeshBasicMaterial({ color: 0xcccccc });

    // 前墙 (有窗户的墙)
    const frontWall = new Mesh(
        new BoxGeometry(5, 3, 0.1),
        wallMaterial
    );
    frontWall.position.z = -2.5;
    building.add(frontWall);

    // 在前墙上挖个"窗户"
    const windowHole = new Mesh(
        new BoxGeometry(1.5, 1.5, 0.2),
        new MeshBasicMaterial({ color: 0x000000 })
    );
    windowHole.position.set(0, 0, -2.45);
    building.add(windowHole);

    // 创建使用InteriorRoomMaterial的平面作为窗户
    const interiorMaterial = new InteriorRoomMaterial({
        roomDepth: 5.0,
        interiorTexture: texture
    });

    // 立即设置分辨率，避免黑屏问题
    const initialResolution = new Vector2(800, 600);
    interiorMaterial.setResolution(initialResolution.x, initialResolution.y);

    const windowPlane = new Mesh(
        new PlaneGeometry(1.45, 1.45, 1, 1),
        interiorMaterial
    );
    windowPlane.position.set(0, 0, -2.39);  // 略微向前移动，避免Z-fighting
    building.add(windowPlane);

    return { scene, windowPlane };
}

window.addEventListener("load", () => {
    console.log("页面加载，开始初始化场景");

    // 基本设置
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);

    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 相机和控制器
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.translation.enabled = true;
    controls.position.set(0, 0, 2);
    controls.lookAt(0, 0, 0);

    console.log("开始加载纹理...");
    // 加载纹理并创建场景
    loadTexture("img/InteriorMappingMaterial/wall.png")
        .then(texture => {
            console.log("纹理加载完成，创建场景");
            const { scene, windowPlane } = createScene(texture);

            // 设置时钟
            const clock = new Clock();

            // 配置GUI控制面板
            const fpsMeter = new FPSMeter();
            const pane = new Pane({ container: container.querySelector(".tp") });
            pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

            const folder = pane.addFolder({ title: "单室内假材质参数" });
            folder.addBinding(windowPlane.material.uniforms.roomDepth, "value", {
                label: "房间深度",
                min: 1.0,
                max: 10.0,
                step: 0.1
            });

            // 窗口大小调整处理
            function onResize() {
                const width = container.clientWidth, height = container.clientHeight;
                camera.aspect = width / height;
                camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);

                console.log(`更新分辨率: ${width}x${height}`);
                // 更新材质的分辨率
                windowPlane.material.setResolution(width, height);
            }

            // 渲染循环
            function render() {
                const deltaTime = clock.getDelta();
                fpsMeter.update();
                controls.update();

                // 更新室内材质
                windowPlane.material.update(deltaTime);

                renderer.render(scene, camera);
                requestAnimationFrame(render);
            }

            window.addEventListener("resize", onResize);
            onResize();
            requestAnimationFrame(render);
        })
        .catch(error => {
            console.error("场景创建失败", error);
            // 创建简单的错误提示场景
            const scene = new Scene();
            const camera = new PerspectiveCamera(70, 1, 0.1, 10);
            camera.position.z = 5;

            const errorMesh = new Mesh(
                new PlaneGeometry(4, 1),
                new MeshBasicMaterial({ color: 0xff0000 })
            );
            scene.add(errorMesh);

            function onResize() {
                const width = container.clientWidth, height = container.clientHeight;
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
            }

            function render() {
                renderer.render(scene, camera);
                requestAnimationFrame(render);
            }

            window.addEventListener("resize", onResize);
            onResize();
            requestAnimationFrame(render);
        });
}); 