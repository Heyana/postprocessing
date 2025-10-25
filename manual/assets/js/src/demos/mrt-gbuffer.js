import {
	ClampToEdgeWrapping,
	PerspectiveCamera,
	PlaneGeometry,
	BoxGeometry,
	SphereGeometry,
	TorusKnotGeometry,
	Mesh,
	RawShaderMaterial,
	Scene,
	SRGBColorSpace,
	TextureLoader,
	WebGLRenderer,
	WebGLRenderTarget,
	FloatType,
	NearestFilter,
	OrthographicCamera,
	Color,
	GLSL3,
	CanvasTexture
} from "run-scene-core";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Pane } from "tweakpane";

// G-Buffer 顶点着色器
const gbufferVertexShader = `
in vec3 position;
in vec3 normal;
in vec2 uv;

out vec3 vNormal;
out vec3 vViewPosition;
out vec2 vUv;
out float vDepth;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform float cameraNear;
uniform float cameraFar;

void main() {
	vUv = uv;
	
	// 计算视图空间位置
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	vViewPosition = mvPosition.xyz;
	
	// 计算世界空间法线
	vec3 transformedNormal = normalMatrix * normal;
	vNormal = normalize(transformedNormal);
	
	// 计算线性深度
	vDepth = (-mvPosition.z - cameraNear) / (cameraFar - cameraNear);
	
	gl_Position = projectionMatrix * mvPosition;
}
`;

// G-Buffer 片元着色器
const gbufferFragmentShader = `
precision highp float;
precision highp int;

// MRT 输出：同时输出到4个纹理
layout(location = 0) out vec4 gColor;    // 颜色
layout(location = 1) out vec4 gNormal;   // 法线
layout(location = 2) out vec4 gDepth;    // 深度
layout(location = 3) out vec4 gPosition; // 位置

in vec3 vNormal;
in vec3 vViewPosition;
in vec2 vUv;
in float vDepth;

uniform sampler2D tDiffuse;
uniform vec3 baseColor;

void main() {
	// 输出1：基础颜色
	vec4 texColor = texture(tDiffuse, vUv);
	gColor = vec4(baseColor * texColor.rgb, 1.0);
	
	// 输出2：视图空间法线 (范围 -1~1 映射到 0~1)
	gNormal = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);
	
	// 输出3：线性深度
	gDepth = vec4(vec3(vDepth), 1.0);
	
	// 输出4：视图空间位置
	gPosition = vec4(vViewPosition, 1.0);
}
`;

// 后处理顶点着色器
const postprocessVertexShader = `
in vec3 position;
in vec2 uv;
out vec2 vUv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 后处理片元着色器
const postprocessFragmentShader = `
precision highp float;
precision highp int;

layout(location = 0) out vec4 fragColor;

in vec2 vUv;

uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tPosition;
uniform int displayMode;
uniform float aoRadius;
uniform float aoIntensity;
uniform int aoSamples;

// 简单的 SSAO 效果演示
vec3 computeSSAO() {
	vec3 normal = texture(tNormal, vUv).rgb * 2.0 - 1.0;
	float depth = texture(tDepth, vUv).r;
	
	float ao = 0.0;
	float radius = aoRadius;
	int samples = aoSamples;
	
	for(int i = 0; i < samples; i++) {
		float angle = float(i) / float(samples) * 6.28318530718;
		float dist = float(i) / float(samples) * radius;
		
		vec2 offset = vec2(cos(angle), sin(angle)) * dist * 0.02;
		float sampleDepth = texture(tDepth, vUv + offset).r;
		
		if(sampleDepth > depth) {
			ao += 1.0;
		}
	}
	
	ao = 1.0 - (ao / float(samples) * aoIntensity);
	return vec3(ao);
}

// 简单的边缘检测
vec3 computeEdges() {
	vec2 texelSize = vec2(1.0) / vec2(textureSize(tNormal, 0));
	
	vec3 n0 = texture(tNormal, vUv).rgb;
	vec3 n1 = texture(tNormal, vUv + vec2(texelSize.x, 0.0)).rgb;
	vec3 n2 = texture(tNormal, vUv + vec2(0.0, texelSize.y)).rgb;
	
	float normalDiff = length(n0 - n1) + length(n0 - n2);
	
	float d0 = texture(tDepth, vUv).r;
	float d1 = texture(tDepth, vUv + vec2(texelSize.x, 0.0)).r;
	float d2 = texture(tDepth, vUv + vec2(0.0, texelSize.y)).r;
	
	float depthDiff = abs(d0 - d1) + abs(d0 - d2);
	
	float edge = smoothstep(0.1, 0.2, normalDiff + depthDiff * 10.0);
	return vec3(1.0 - edge);
}

vec3 linearToSRGB(vec3 color) {
	return pow(color, vec3(1.0/2.2));
}

void main() {
	vec3 color = texture(tColor, vUv).rgb;
	vec3 normal = texture(tNormal, vUv).rgb;
	float depth = texture(tDepth, vUv).r;
	
	vec3 result;
	
	if(displayMode == 0) {
		// 最终效果：颜色 + AO + 边缘
		vec3 ao = computeSSAO();
		vec3 edges = computeEdges();
		result = color * ao * edges;
		result = linearToSRGB(result);
	}
	else if(displayMode == 1) {
		result = linearToSRGB(color);
	}
	else if(displayMode == 2) {
		result = normal;
	}
	else if(displayMode == 3) {
		result = vec3(depth);
	}
	else if(displayMode == 4) {
		result = computeSSAO();
	}
	else if(displayMode == 5) {
		// 分屏显示
		vec2 uv = vUv * 2.0;
		if(uv.x < 1.0 && uv.y < 1.0) {
			result = linearToSRGB(color);
		} else if(uv.x >= 1.0 && uv.y < 1.0) {
			result = normal;
		} else if(uv.x < 1.0 && uv.y >= 1.0) {
			result = vec3(depth);
		} else {
			result = computeSSAO();
		}
	}
	
	fragColor = vec4(result, 1.0);
}
`;

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
	texture.wrapS = ClampToEdgeWrapping;
	texture.wrapT = ClampToEdgeWrapping;
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
	camera.position.set(0, 0, 8);

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;

	// 场景
	const scene = new Scene();
	scene.background = new Color(0x222222);

	// 创建纹理
	const texture = createDefaultTexture();

	// 创建 MRT G-Buffer
	const width = container.clientWidth || window.innerWidth;
	const height = container.clientHeight || window.innerHeight;

	const gBufferRenderTarget = new WebGLRenderTarget(width, height, {
		count: 4, // 创建4个纹理附件
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		type: FloatType
	});

	// 创建 G-Buffer 材质
	const gBufferMaterial = new RawShaderMaterial({
		name: 'G-Buffer Material',
		vertexShader: gbufferVertexShader,
		fragmentShader: gbufferFragmentShader,
		uniforms: {
			tDiffuse: { value: texture },
			baseColor: { value: new Color(1, 1, 1) },
			cameraNear: { value: camera.near },
			cameraFar: { value: camera.far }
		},
		glslVersion: GLSL3
	});

	// 添加测试物体
	const torusKnot = new Mesh(
		new TorusKnotGeometry(1, 0.3, 128, 32),
		gBufferMaterial.clone()
	);
	torusKnot.position.set(-3, 0, 0);
	torusKnot.material.uniforms.baseColor.value = new Color(1.0, 0.3, 0.3);
	scene.add(torusKnot);

	const sphere = new Mesh(
		new SphereGeometry(0.8, 64, 64),
		gBufferMaterial.clone()
	);
	sphere.position.set(0, 0, 0);
	sphere.material.uniforms.baseColor.value = new Color(0.3, 1.0, 0.3);
	scene.add(sphere);

	const box = new Mesh(
		new BoxGeometry(1, 1, 1),
		gBufferMaterial.clone()
	);
	box.position.set(3, 0, 0);
	box.material.uniforms.baseColor.value = new Color(0.3, 0.3, 1.0);
	scene.add(box);

	// 后处理场景
	const postScene = new Scene();
	const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

	const postMaterial = new RawShaderMaterial({
		name: 'Post-Process Material',
		vertexShader: postprocessVertexShader,
		fragmentShader: postprocessFragmentShader,
		uniforms: {
			tColor: { value: gBufferRenderTarget.textures[0] },
			tNormal: { value: gBufferRenderTarget.textures[1] },
			tDepth: { value: gBufferRenderTarget.textures[2] },
			tPosition: { value: gBufferRenderTarget.textures[3] },
			displayMode: { value: 0 },
			aoRadius: { value: 0.5 },
			aoIntensity: { value: 0.8 },
			aoSamples: { value: 16 }
		},
		glslVersion: GLSL3
	});

	const postQuad = new Mesh(
		new PlaneGeometry(2, 2),
		postMaterial
	);
	postScene.add(postQuad);

	// GUI设置
	const fpsMeter = new SimpleFPSMeter();
	const pane = new Pane({ container: container.querySelector(".tp") || document.body });
	pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

	const params = {
		"display mode": "Final Effect",
		"ao radius": 0.5,
		"ao intensity": 0.8,
		"ao samples": 16,
		"animate objects": true,
		"rotation speed": 1.0
	};

	const modeNames = {
		"Final Effect": 0,
		"Color Buffer": 1,
		"Normal Buffer": 2,
		"Depth Buffer": 3,
		"AO Only": 4,
		"Split View": 5
	};

	const folder = pane.addFolder({ title: "MRT G-Buffer Settings" });
	folder.addBinding(params, "display mode", {
		options: modeNames
	}).on("change", (e) => {
		postMaterial.uniforms.displayMode.value = e.value;
	});

	const aoFolder = folder.addFolder({ title: "SSAO Settings" });
	aoFolder.addBinding(params, "ao radius", {
		min: 0.1, max: 2.0, step: 0.1
	}).on("change", (e) => {
		postMaterial.uniforms.aoRadius.value = e.value;
	});
	aoFolder.addBinding(params, "ao intensity", {
		min: 0.0, max: 2.0, step: 0.1
	}).on("change", (e) => {
		postMaterial.uniforms.aoIntensity.value = e.value;
	});
	aoFolder.addBinding(params, "ao samples", {
		min: 4, max: 32, step: 4
	}).on("change", (e) => {
		postMaterial.uniforms.aoSamples.value = e.value;
	});

	const animFolder = folder.addFolder({ title: "Animation" });
	animFolder.addBinding(params, "animate objects");
	animFolder.addBinding(params, "rotation speed", {
		min: 0.0, max: 3.0, step: 0.1
	});

	// 窗口大小调整
	function onResize() {
		const width = container.clientWidth || window.innerWidth;
		const height = container.clientHeight || window.innerHeight;

		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		renderer.setSize(width, height);
		gBufferRenderTarget.setSize(width, height);
	}

	window.addEventListener("resize", onResize);
	onResize();

	// 渲染循环
	function render(timestamp) {
		fpsMeter.update(timestamp);
		controls.update();

		// 动画物体
		if (params["animate objects"]) {
			scene.children.forEach((child, index) => {
				if (child.isMesh) {
					child.rotation.x += 0.005 * (index + 1) * params["rotation speed"];
					child.rotation.y += 0.007 * (index + 1) * params["rotation speed"];
				}
			});
		}

		// 渲染流程
		// 第1步：渲染场景到 G-Buffer
		renderer.setRenderTarget(gBufferRenderTarget);
		renderer.render(scene, camera);

		// 第2步：使用 G-Buffer 进行后处理
		renderer.setRenderTarget(null);
		renderer.render(postScene, postCamera);

		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
});