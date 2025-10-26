/**
 * Object ID Test - 简单测试对象ID功能
 */
import {
    EffectComposer,
    RenderPass
} from "postprocessing";
import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    BoxGeometry,
    MeshBasicMaterial,
    Mesh,
    DirectionalLight,
    AmbientLight,
    Vector2
} from "run-scene-core";

// 简单的测试程序
window.addEventListener("load", async () => {
    console.log("🧪 开始对象ID测试");

    // 创建基础渲染设置
    const renderer = new WebGLRenderer();
    const container = document.querySelector(".viewport");
    if (container) {
        container.prepend(renderer.domElement);
    } else {
        document.body.appendChild(renderer.domElement);
    }

    // 创建场景
    const scene = new Scene();
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    // 添加光照
    const ambientLight = new AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // 创建测试对象
    const geometry = new BoxGeometry(1, 1, 1);
    const materials = [
        new MeshBasicMaterial({ color: 0xff0000 }), // 红色
        new MeshBasicMaterial({ color: 0x00ff00 }), // 绿色
        new MeshBasicMaterial({ color: 0x0000ff }), // 蓝色
    ];

    const cubes = [];
    for (let i = 0; i < 3; i++) {
        const cube = new Mesh(geometry, materials[i]);
        cube.position.x = (i - 1) * 2;
        cube.name = `Cube_${i}`;
        scene.add(cube);
        cubes.push(cube);
    }

    console.log("📦 创建了3个测试立方体");

    try {
        // 创建后期处理
        const composer = new EffectComposer(renderer, {
            multisampling: Math.min(4, renderer.capabilities.maxSamples)
        });

        // 创建启用对象ID的RenderPass
        const renderPass = new RenderPass(scene, camera, null, {
            enableGBuffer: true,
            enableObjectId: true,
            resolutionScale: 1.0
        });

        composer.addPass(renderPass);

        console.log("🎨 EffectComposer和RenderPass已创建");

        // 获取对象ID管理器
        const objectIdManager = renderPass.getObjectIdManager();

        if (!objectIdManager) {
            console.error("❌ 对象ID管理器未初始化");
            return;
        }

        console.log("🆔 对象ID管理器已获取:", objectIdManager);

        // 手动为对象分配ID并测试
        cubes.forEach((cube, index) => {
            const id = objectIdManager.getObjectId(cube);
            console.log(`📋 ${cube.name}: ID=${id}`);
        });

        // 获取统计信息
        const stats = objectIdManager.getStats();
        console.log("📊 对象ID统计:", stats);

        // 获取G-Buffer纹理
        const gBufferTextures = renderPass.getGBufferTextures();

        if (gBufferTextures) {
            console.log("✅ G-Buffer纹理检查:");
            Object.keys(gBufferTextures).forEach(key => {
                const texture = gBufferTextures[key];
                console.log(`  - ${key}:`, texture ? "✅" : "❌");
            });
        } else {
            console.warn("⚠️ G-Buffer纹理为null");
        }

        // 渲染循环
        let frameCount = 0;
        function animate() {
            frameCount++;

            // 旋转立方体
            cubes.forEach((cube, index) => {
                cube.rotation.x += 0.01;
                cube.rotation.y += 0.01 * (index + 1);
            });

            // 每60帧输出一次调试信息
            if (frameCount % 60 === 0) {
                console.log(`🔄 Frame ${frameCount}: 渲染正常`);

                // 检查对象ID状态
                const currentStats = objectIdManager.getStats();
                console.log(`📈 当前统计: 分配=${currentStats.allocatedCount}, 使用率=${currentStats.usagePercentage}`);
            }

            // 渲染
            try {
                composer.render();
            } catch (error) {
                console.error("❌ 渲染错误:", error);
                return; // 停止动画循环
            }

            requestAnimationFrame(animate);
        }

        // 设置尺寸
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);

        console.log("🚀 开始渲染循环");
        animate();

        // 窗口大小调整
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            composer.setSize(window.innerWidth, window.innerHeight);
        });

        console.log("✅ 对象ID测试初始化完成");

    } catch (error) {
        console.error("❌ 测试初始化失败:", error);
        console.error("Stack trace:", error.stack);
    }
});
