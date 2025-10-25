import {
    PerspectiveCamera,
    OrthographicCamera,
    BoxGeometry,
    SphereGeometry,
    TorusKnotGeometry,
    Mesh,
    MeshStandardMaterial,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
    Color,
    AmbientLight,
    DirectionalLight,
    CanvasTexture,
    ShaderMaterial,
    PlaneGeometry
} from "run-scene-core";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Pane } from "tweakpane";
import {
    EffectComposer,
    RenderPass,
    BlendFunction,
    GBufferPass,
} from "postprocessing";

// 导入增强版SSR Pass

// 创建默认纹理
function createDefaultTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // 创建UV网格纹理
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    for (let i = 0; i < 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

// 简单的FPS计算器
class SimpleFPSMeter {
    constructor() {
        this.fps = 0;
        this.lastTime = 0;
        this.frames = 0;
    }

    update(timestamp) {
        this.frames++;
        if (timestamp - this.lastTime >= 1000) {
            this.fps = Math.round((this.frames * 1000) / (timestamp - this.lastTime));
            this.frames = 0;
            this.lastTime = timestamp;
        }
    }
}

// G-Buffer可视化材质
function createGBufferVisualizationMaterial(gBufferTextures) {
    return new ShaderMaterial({
        uniforms: {
            gColor: { value: gBufferTextures.gColor },
            gNormal: { value: gBufferTextures.gNormal },
            gDepth: { value: gBufferTextures.gDepth },
            gPosition: { value: gBufferTextures.gPosition },
            displayMode: { value: 0 }
        },
        vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
        fragmentShader: `
			uniform sampler2D gColor;
			uniform sampler2D gNormal;
			uniform sampler2D gDepth;
			uniform sampler2D gPosition;
			uniform int displayMode;
			varying vec2 vUv;

			vec3 linearToSRGB(vec3 color) {
				return pow(color, vec3(1.0/2.2));
			}

			void main() {
				vec3 result;
				
				if(displayMode == 0) {
					result = linearToSRGB(texture2D(gColor, vUv).rgb);
				}
				else if(displayMode == 1) {
					result = texture2D(gNormal, vUv).rgb;
				}
				else if(displayMode == 2) {
					float depth = texture2D(gDepth, vUv).r;
					result = vec3(depth);
				}
				else if(displayMode == 3) {
					vec3 pos = texture2D(gPosition, vUv).rgb;
					result = normalize(pos) * 0.5 + 0.5;
				}
				else if(displayMode == 4) {
					// 分屏显示
					vec2 uv = vUv * 2.0;
					if(uv.x < 1.0 && uv.y < 1.0) {
						result = linearToSRGB(texture2D(gColor, vUv).rgb);
					} else if(uv.x >= 1.0 && uv.y < 1.0) {
						result = texture2D(gNormal, vUv).rgb;
					} else if(uv.x < 1.0 && uv.y >= 1.0) {
						float depth = texture2D(gDepth, vUv).r;
						result = vec3(depth);
					} else {
						vec3 pos = texture2D(gPosition, vUv).rgb;
						result = normalize(pos) * 0.5 + 0.5;
					}
				}
				
				gl_FragColor = vec4(result, 1.0);
			}
		`
    });
}

window.addEventListener("load", () => {
    // 渲染器
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: true
    });

    const container = document.querySelector(".viewport");
    if (!container) {
        console.error("未找到.viewport容器");
        return;
    }

    container.prepend(renderer.domElement);

    // 摄像机和控制器
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2, 8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 场景和光照
    const scene = new Scene();
    scene.background = new Color(0x222222);

    // 添加光照
    const ambientLight = new AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 创建纹理
    const texture = createDefaultTexture();

    // 创建测试物体（使用标准材质）
    const materials = [
        new MeshStandardMaterial({
            color: new Color(1.0, 0.3, 0.3),
            map: texture,
            metalness: 0.8,
            roughness: 0.2
        }),
        new MeshStandardMaterial({
            color: new Color(0.3, 1.0, 0.3),
            map: texture,
            metalness: 0.1,
            roughness: 0.7
        }),
        new MeshStandardMaterial({
            color: new Color(0.3, 0.3, 1.0),
            map: texture,
            metalness: 0.5,
            roughness: 0.3
        })
    ];

    const torusKnot = new Mesh(
        new TorusKnotGeometry(1, 0.3, 128, 32),
        materials[0]
    );
    torusKnot.position.set(-3, 0, 0);
    scene.add(torusKnot);

    const sphere = new Mesh(
        new SphereGeometry(0.8, 64, 64),
        materials[1]
    );
    sphere.position.set(0, 0, 0);
    scene.add(sphere);

    const box = new Mesh(
        new BoxGeometry(1, 1, 1),
        materials[2]
    );
    box.position.set(3, 0, 0);
    scene.add(box);

    // 创建EffectComposer
    const composer = new EffectComposer(renderer, {
        multisampling: 0
    });

    // 添加基础渲染通道
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 尝试添加G-Buffer Pass和增强版SSR
    let gBufferPass = null;
    let ssrPass = null;
    let visualizationMaterial = null;
    let visualizationScene = null;
    let visualizationCamera = null;
    let visualizationQuad = null;

    try {
        // 检查是否有G-Buffer Pass
        if (typeof GBufferPass !== 'undefined') {
            gBufferPass = new GBufferPass(scene, camera, {
                resolutionScale: 1.0
            });
            composer.addPass(gBufferPass);

            // 创建增强版SSR Pass（智能使用G-Buffer数据）
            setTimeout(() => {
                const gBufferTextures = gBufferPass.getGBufferTextures();
                if (gBufferTextures) {
                    // 使用增强版SSR，优先使用G-Buffer数据
                    ssrPass = new SelectiveSSRPassGBufferEnhanced({
                        renderer,
                        scene,
                        camera,
                        width: container.clientWidth || window.innerWidth,
                        height: container.clientHeight || window.innerHeight,
                        gBufferTextures: gBufferTextures,
                        composer,
                        bouncing: false,
                        groundReflector: null
                    });

                    // 添加一些测试对象到SSR选择中
                    ssrPass.addToSelection(sphere); // 添加球体到反射选择
                    ssrPass.addToSelection(torusKnot); // 添加环面结到反射选择

                    composer.addPass(ssrPass);

                    // 创建可视化场景
                    visualizationScene = new Scene();
                    visualizationCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
                    visualizationMaterial = createGBufferVisualizationMaterial(gBufferTextures);
                    visualizationQuad = new Mesh(new PlaneGeometry(2, 2), visualizationMaterial);
                    visualizationScene.add(visualizationQuad);

                    console.log("🎯 G-Buffer + 增强SSR架构初始化成功！");
                    console.log("📊 SSR性能提升：使用G-Buffer数据，避免重复渲染");
                    console.log("🔧 已添加选择对象到SSR反射中");
                }
            }, 100);
        } else {
            console.warn("GBufferPass不可用，使用标准渲染流程");
        }
    } catch (error) {
        console.warn("G-Buffer初始化失败，使用标准渲染流程:", error);
    }

    // GUI设置
    const fpsMeter = new SimpleFPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") || document.body });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const params = {
        "rendering mode": "Normal",
        "gbuffer display": "Color",
        "animate objects": true,
        "rotation speed": 1.0,
        "ssr enabled": true,
        "ssr output": "Default",
        "ssr opacity": 1.0,
        "ssr thickness": 0.035,
        "ssr max distance": 0.08,
        "ssr blur": true,
        "show performance": false
    };

    const renderingModes = {
        "Normal": "normal",
        "G-Buffer Visualization": "gbuffer"
    };

    const ssrOutputModes = {
        "Default": 0,
        "SSR Only": 1,
        "Beauty": 3,
        "Depth": 4,
        "Normal": 5
    };

    const gbufferDisplayModes = {
        "Color": 0,
        "Normal": 1,
        "Depth": 2,
        "Position": 3,
        "Split View": 4
    };

    const folder = pane.addFolder({ title: "G-Buffer Composer Architecture" });

    folder.addBinding(params, "rendering mode", {
        options: renderingModes
    });

    folder.addBinding(params, "gbuffer display", {
        options: gbufferDisplayModes
    }).on("change", (e) => {
        if (visualizationMaterial) {
            visualizationMaterial.uniforms.displayMode.value = e.value;
        }
    });

    const animFolder = folder.addFolder({ title: "Animation" });
    animFolder.addBinding(params, "animate objects");
    animFolder.addBinding(params, "rotation speed", {
        min: 0.0, max: 3.0, step: 0.1
    });

    const ssrFolder = folder.addFolder({ title: "SSR (Using G-Buffer Data)" });
    ssrFolder.addBinding(params, "ssr enabled").on("change", (e) => {
        if (ssrPass) {
            ssrPass.enabled = e.value;
        }
    });

    ssrFolder.addBinding(params, "ssr output", {
        options: ssrOutputModes
    }).on("change", (e) => {
        if (ssrPass) {
            ssrPass.output = e.value;
        }
    });

    ssrFolder.addBinding(params, "ssr opacity", {
        min: 0.0, max: 1.0, step: 0.01
    }).on("change", (e) => {
        if (ssrPass) {
            ssrPass.opacity = e.value;
        }
    });

    ssrFolder.addBinding(params, "ssr thickness", {
        min: 0.001, max: 0.1, step: 0.001
    }).on("change", (e) => {
        if (ssrPass) {
            ssrPass.thickness = e.value;
        }
    });

    ssrFolder.addBinding(params, "ssr max distance", {
        min: 0.01, max: 0.5, step: 0.01
    }).on("change", (e) => {
        if (ssrPass) {
            ssrPass.maxDistance = e.value;
        }
    });

    ssrFolder.addBinding(params, "ssr blur").on("change", (e) => {
        if (ssrPass) {
            ssrPass.blur = e.value;
        }
    });

    // 窗口大小调整
    function onResize() {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        composer.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // 渲染循环
    function render(timestamp) {
        fpsMeter.update(timestamp);
        controls.update();

        // 物体动画
        if (params["animate objects"]) {
            scene.children.forEach((child, index) => {
                if (child.isMesh && child.geometry) {
                    child.rotation.x += 0.005 * (index + 1) * params["rotation speed"];
                    child.rotation.y += 0.007 * (index + 1) * params["rotation speed"];
                }
            });
        }

        // 根据渲染模式选择渲染方式
        if (params["rendering mode"] === "gbuffer" && visualizationScene && gBufferPass) {
            // G-Buffer可视化模式
            gBufferPass.render(renderer);
            renderer.setRenderTarget(null);
            renderer.render(visualizationScene, visualizationCamera);
        } else {
            // 正常的效果组合器渲染
            composer.render();
        }

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    // 输出架构信息
    console.log("🏗️ G-Buffer + Enhanced SSR Architecture Demo");
    console.log("=".repeat(60));
    console.log("✅ 核心概念：G-Buffer作为数据提供者");
    console.log("✅ 性能优化：场景只渲染一次到G-Buffer");
    console.log("✅ 数据共享：多个后处理效果使用相同数据");
    console.log("✅ 扩展性：新效果可轻松接入G-Buffer");
    console.log("=".repeat(60));

    if (gBufferPass) {
        console.log("🎯 G-Buffer数据层：");
        console.log("  - gColor: 基础颜色 + 纹理");
        console.log("  - gNormal: 视图空间法线");
        console.log("  - gDepth: 线性深度值");
        console.log("  - gPosition: 视图空间位置");
        console.log("🚀 当前使用G-Buffer的效果：");
        console.log("  - ✅ SSR (屏幕空间反射) - 增强版");
        console.log("  - 🎯 智能数据复用：避免重复法线/深度渲染");
        console.log("  - 📊 性能提升：减少渲染通道，共享高精度数据");
        console.log("🔮 未来可扩展：");
        console.log("  - SSAO、SSGI、Motion Blur、Volumetric等");
    } else {
        console.log("⚠️  G-Buffer Pass不可用，使用标准渲染流程");
    }
});