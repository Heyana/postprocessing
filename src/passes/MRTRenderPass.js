import { OverrideMaterialManager } from "../core/OverrideMaterialManager.js";
import { ClearPass } from "./ClearPass.js";
import { Pass } from "./Pass.js";
import { timeLog, timeEndLog, log } from "../utils/PerformanceLogger.js";
import {
	WebGLMultipleRenderTargets,
	Vector2,
	ShaderMaterial,
	GLSL3,
	FrontSide,
	NoBlending
} from "three";

/**
 * 多渲染目标(MRT)渲染通道
 *
 * 此通道可以将场景渲染到多个渲染目标(如颜色、法线、深度等)
 *
 * 这个通道使用一个 {@link ClearPass} 来清除目标缓冲区
 */
export class MRTRenderPass extends Pass {

	isMRTRenderPass = true;

	// 定义支持的通道类型常量
	static CHANNEL_COLOR = "color"; // 颜色通道
	static CHANNEL_NORMAL = "normal"; // 法线通道
	static CHANNEL_DEPTH = "depth"; // 深度通道
	static CHANNEL_POSITION = "position"; // 世界位置通道
	static CHANNEL_PBR = "pbr"; // PBR属性通道(粗糙度/金属度/AO)
	static CHANNEL_ROUGHNESS = "roughness"; // 粗糙度单独通道
	static CHANNEL_METALNESS = "metalness"; // 金属度单独通道
	static CHANNEL_AO = "ao"; // 环境光遮蔽单独通道
	static CHANNEL_MOTION = "motion"; // 运动向量通道
	static CHANNEL_EMISSION = "emission"; // 自发光通道
	static CHANNEL_ID = "id"; // 对象ID通道
	static CHANNEL_MASK = "mask"; // 遮罩通道
	static CHANNEL_SHADOW = "shadow"; // 阴影通道
	static CHANNEL_VELOCITY = "velocity"; // 速度通道(与motion类似但计算方式不同)
	static CHANNEL_CUSTOM = "custom"; // 自定义通道
	static CHANNEL_ORIGINAL = "original"; // 原始/正常画面通道 - 不使用特效着色器，直接显示物体的原始渲染

	// 默认通道配置
	static DEFAULT_CHANNELS = [
		MRTRenderPass.CHANNEL_COLOR,
		MRTRenderPass.CHANNEL_NORMAL,
		MRTRenderPass.CHANNEL_DEPTH
	];

	/**
     * 构造新的多渲染目标渲染通道
     *
     * @param {Scene} scene - 要渲染的场景
     * @param {Camera} camera - 用于渲染场景的相机
     * @param {Object} [options] - 渲染选项
     * @param {Number} [options.outputCount=2] - 输出渲染目标的数量
     * @param {Array} [options.channels] - 要生成的通道类型数组，如 ['color', 'normal', 'depth']
     * @param {Object} [options.formats] - 各个渲染目标的格式设置
     * @param {Material} [overrideMaterial=null] - 覆盖材质
     */
	constructor(scene, camera, options = {}, overrideMaterial = null) {

		super("MRTRenderPass", scene, camera);

		this.needsSwap = false;

		// 用户指定的通道类型数组
		this.channels = options.channels || MRTRenderPass.DEFAULT_CHANNELS;

		// 默认输出数量为通道数量或2(如果未指定)
		// 注意：这里将在patchMaterials中重新计算为实际需要的通道数量
		this.outputCount = options.outputCount || Math.max(2, this.channels.length);
		this.formats = options.formats || null;

		/**
         * MRT渲染目标
         *
         * @type {WebGLMultipleRenderTargets}
         * @private
         */
		this.renderTargets = null;

		/**
         * 清除通道
         *
         * @type {ClearPass}
         * @readonly
         */
		this.clearPass = new ClearPass();

		/**
         * 覆盖材质管理器
         *
         * @type {OverrideMaterialManager}
         * @private
         */
		this.overrideMaterialManager = (overrideMaterial === null) ? null : new OverrideMaterialManager(overrideMaterial);

		/**
         * 是否忽略场景背景
         *
         * @type {Boolean}
         */
		this.ignoreBackground = false;

		/**
         * 是否跳过阴影贴图自动更新
         *
         * @type {Boolean}
         */
		this.skipShadowMapUpdate = false;

		/**
         * 要渲染的对象选择
         *
         * @type {Selection}
         * @readonly
         */
		this.selection = null;

		// 渲染目标数组，将被渲染结果填充
		this.buffers = [];

		// 通道映射表，存储通道索引与类型的对应关系
		this.channelMap = new Map();

		// 创建MRT专用材质
		this.createMRTMaterial();

		/**
         * 是否使用材质修补模式而不是overrideMaterial
         *
         * @type {Boolean}
         */
		this.useMaterialPatching = true;

		/**
         * 保存已修改的材质用于恢复
         *
         * @type {Array}
         * @private
         */
		this.patchedMaterials = [];

		/**
         * 是否已应用材质修补
         *
         * @type {Boolean}
         * @private
         */
		this.materialsPatched = false;

		/**
         * 实际使用的活跃通道列表
         *
         * @type {Array}
         * @private
         */
		this.activeChannels = [];

	}

	set mainScene(value) {

		this.scene = value;

	}

	set mainCamera(value) {

		this.camera = value;

	}

	get renderToScreen() {

		return super.renderToScreen;

	}

	set renderToScreen(value) {

		super.renderToScreen = value;
		this.clearPass.renderToScreen = value;

	}

	/**
     * 当前覆盖材质
     *
     * @type {Material}
     */
	get overrideMaterial() {

		const manager = this.overrideMaterialManager;
		return (manager !== null) ? manager.material : null;

	}

	set overrideMaterial(value) {

		const manager = this.overrideMaterialManager;

		if(value !== null) {

			if(manager !== null) {

				manager.setMaterial(value);

			} else {

				this.overrideMaterialManager = new OverrideMaterialManager(value);

			}

		} else if(manager !== null) {

			manager.dispose();
			this.overrideMaterialManager = null;

		}

	}

	/**
     * 是否应在渲染前清除目标缓冲区
     *
     * @type {Boolean}
     */
	get clear() {

		return this.clearPass.enabled;

	}

	set clear(value) {

		this.clearPass.enabled = value;

	}

	/**
     * 初始化多渲染目标
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	initRenderTargets(renderer, width, height) {

		if(this.renderTargets !== null) {

			this.renderTargets.dispose();

		}

		const size = renderer.getSize(new Vector2());
		const pixelRatio = renderer.getPixelRatio();
		const effectiveWidth = width || (size.width * pixelRatio);
		const effectiveHeight = height || (size.height * pixelRatio);

		// 检查尺寸是否有效
		if(effectiveWidth <= 0 || effectiveHeight <= 0) {

			console.warn("MRTRenderPass: 尝试创建尺寸为零的渲染目标", effectiveWidth, effectiveHeight);
			return null;

		}

		// 检测WebGL2功能和限制
		const gl = renderer.getContext();
		const isWebGL2 = gl instanceof WebGL2RenderingContext;
		const maxDrawBuffers = isWebGL2 ? gl.getParameter(gl.MAX_DRAW_BUFFERS) : 1;

		// 输出WebGL兼容性信息
		console.log(`WebGL信息: WebGL2=${isWebGL2}, 最大绘制缓冲区=${maxDrawBuffers}`);

		// 调整输出数量不超过设备支持的最大数量
		const effectiveOutputCount = Math.min(this.outputCount, maxDrawBuffers);

		if(effectiveOutputCount < this.outputCount) {

			console.warn(`MRTRenderPass: 设备仅支持${maxDrawBuffers}个渲染目标，而不是请求的${this.outputCount}个`);
			this.outputCount = effectiveOutputCount;

		}

		// 检查是否准备就绪
		if(this.activeChannels.length !== this.outputCount) {

			console.warn(`MRTRenderPass: 活跃通道数量(${this.activeChannels.length})与输出数量(${this.outputCount})不匹配！`);
			// 如果可能，调整输出数量以匹配活跃通道
			if(this.activeChannels.length > 0) {

				this.outputCount = this.activeChannels.length;

			}

		}

		console.log(`MRTRenderPass: 创建${this.outputCount}个渲染目标, 当前活跃通道:`,
			this.activeChannels.map((channel, index) => `${index}: ${channel}`).join(", "));

		// 创建多渲染目标
		try {

			this.renderTargets = new WebGLMultipleRenderTargets(
				effectiveWidth,
				effectiveHeight,
				this.outputCount
			);

			// 给每个纹理命名并配置
			for(let i = 0; i < this.outputCount; i++) {

				const texture = this.renderTargets.texture[i];
				texture.name = `MRTRenderPass.Target${i}`;

				// 如果有对应的通道格式配置，应用它
				if(this.formats && this.formats[i]) {

					const format = this.formats[i];
					// 应用格式配置
					if(format.format !== undefined) { texture.format = format.format; }
					if(format.type !== undefined) { texture.type = format.type; }
					if(format.colorSpace !== undefined) { texture.colorSpace = format.colorSpace; }
					if(format.minFilter !== undefined) { texture.minFilter = format.minFilter; }
					if(format.magFilter !== undefined) { texture.magFilter = format.magFilter; }

				}

				// 确保所有纹理都正确初始化
				if(!texture.image || texture.image.width <= 0 || texture.image.height <= 0) {

					console.warn(`MRTRenderPass: 纹理${i}初始化失败或尺寸为零`);

				} else {

					console.log(`MRTRenderPass: 纹理${i}初始化成功 (${texture.image.width}x${texture.image.height})`);

				}

			}

			return this.renderTargets;

		} catch(e) {

			console.error("MRTRenderPass: 初始化渲染目标时出错", e);
			return null;

		}

	}

	/**
     * 获取渲染目标纹理
     *
     * @param {Number} index - 纹理索引
     * @returns {Texture} 指定索引的渲染目标纹理
     */
	getTexture(index = 0) {

		if(this.renderTargets === null) {

			return null;

		}
		return this.renderTargets.texture[index];

	}

	/**
     * 根据通道类型获取对应的渲染目标纹理
     *
     * @param {String} channelType - 通道类型，如 'color', 'normal', 'depth' 等
     * @returns {Texture} 对应通道类型的渲染目标纹理，如果未找到则返回null
     */
	getChannelTexture(channelType) {

		if(this.renderTargets === null || !this.channelMap.has(channelType)) {

			return null;

		}
		const index = this.channelMap.get(channelType);
		return this.renderTargets.texture[index];

	}

	/**
     * 检查是否存在特定类型的通道
     *
     * @param {String} channelType - 要检查的通道类型
     * @returns {Boolean} 如果通道存在返回true，否则返回false
     */
	hasChannel(channelType) {

		return this.channelMap.has(channelType);

	}

	/**
     * 获取特定通道类型对应的索引
     *
     * @param {String} channelType - 通道类型
     * @returns {Number} 通道索引，如果未找到则返回-1
     */
	getChannelIndex(channelType) {

		return this.channelMap.has(channelType) ? this.channelMap.get(channelType) : -1;

	}

	/**
     * 获取所有可用的通道类型
     *
     * @returns {Array} 可用通道类型的数组
     */
	getAvailableChannels() {

		return [...this.channelMap.keys()];

	}

	/**
     * 创建多渲染目标(MRT)专用材质
     * 该材质会为每个渲染目标提供一个输出
     */
	createMRTMaterial() {

		// 生成着色器输出声明
		let outputDeclarations = "";
		let outputAssignments = "";

		// 用户可能配置的输出通道数，最多支持8个（WebGL2的限制）
		const effectiveOutputCount = Math.min(this.outputCount, 8);

		// 清空通道映射
		this.channelMap.clear();

		// 创建通道映射，将通道类型映射到对应的索引
		for(let i = 0; i < Math.min(this.channels.length, effectiveOutputCount); i++) {

			this.channelMap.set(this.channels[i], i);

		}

		for(let i = 0; i < effectiveOutputCount; i++) {

			outputDeclarations += `layout(location = ${i}) out vec4 gOutput${i};\n`;

			// 获取当前索引对应的通道类型
			const channelType = i < this.channels.length ? this.channels[i] : null;

			// 根据通道类型生成相应的输出赋值
			switch(channelType) {

				case MRTRenderPass.CHANNEL_COLOR:
					// 通道: 颜色 (RGB + Alpha)
					outputAssignments += `gOutput${i} = vec4(diffuseColor, 1.0);\n`;
					break;

				case MRTRenderPass.CHANNEL_NORMAL:
					// 通道: 法线 (世界空间法线映射到[0,1]范围)
					outputAssignments += `gOutput${i} = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);\n`;
					break;

				case MRTRenderPass.CHANNEL_DEPTH:
					// 通道: 深度 (非线性映射以突出细节)
					outputAssignments += `
                        // 计算到相机的距离
                        float depth = abs(vViewPosition.z);
                        // 应用非线性映射以增强近距离的变化
                        float mappedDepth = 1.0 - exp(-0.1 * depth);
                        gOutput${i} = vec4(vec3(mappedDepth), 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_POSITION:
					// 通道: 世界位置 (缩放到合理范围)
					outputAssignments += `
                        // 将世界位置映射到合理颜色范围
                        vec3 worldPosNormalized = vWorldPosition * 0.1;
                        // 对每个分量进行循环映射，避免过大或过小的值
                        worldPosNormalized = fract(worldPosNormalized + 0.5);
                        gOutput${i} = vec4(worldPosNormalized, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_PBR:
					// 通道: 模拟PBR属性 (R=粗糙度, G=金属度, B=环境光遮蔽)
					outputAssignments += `
                        // 基于位置生成伪PBR属性
                        float pbr_roughness = fract(vWorldPosition.x * 0.5) * 0.8 + 0.2;
                        float pbr_metalness = fract(vWorldPosition.y * 0.5) * 0.8 + 0.2;
                        float pbr_ao = fract(vWorldPosition.z * 0.5) * 0.5 + 0.5;
                        gOutput${i} = vec4(pbr_roughness, pbr_metalness, pbr_ao, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_ROUGHNESS:
					// 通道: 单独的粗糙度
					outputAssignments += `
                        // 基于位置生成粗糙度
                        float rough_value = fract(vWorldPosition.x * 0.5) * 0.8 + 0.2;
                        gOutput${i} = vec4(vec3(rough_value), 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_METALNESS:
					// 通道: 单独的金属度
					outputAssignments += `
                        // 基于位置生成金属度
                        float metal_value = fract(vWorldPosition.y * 0.5) * 0.8 + 0.2;
                        gOutput${i} = vec4(vec3(metal_value), 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_AO:
					// 通道: 单独的环境光遮蔽
					outputAssignments += `
                        // 基于位置生成环境光遮蔽
                        float ao_value = fract(vWorldPosition.z * 0.5) * 0.5 + 0.5;
                        gOutput${i} = vec4(vec3(ao_value), 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_MOTION:
					// 通道: 运动向量 (用于运动模糊) - 这里使用简化模拟
					outputAssignments += `
                        // 模拟运动向量 - 使用世界坐标的变化率作为运动方向
                        vec2 motion = vec2(
                            sin(vWorldPosition.x * 0.1 + time) * 0.5,
                            cos(vWorldPosition.y * 0.1 + time) * 0.5
                        ) * 0.1;
                        gOutput${i} = vec4(motion.x, motion.y, 0.0, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_EMISSION:
					// 通道: 自发光/发光贴图 - 模拟某些区域发光效果
					outputAssignments += `
                        // 基于UV坐标生成发光图案
                        float emissionPattern = 
                            max(0.0, 
                                sin(vUv.x * 20.0 + time) * sin(vUv.y * 20.0 + time) * 2.0
                            );
                        // 生成随机颜色发光
                        vec3 emissionColor = vBaseColor * emissionPattern * 2.0;
                        gOutput${i} = vec4(emissionColor, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_ID:
					// 通道: 对象ID - 用于拾取和选择
					outputAssignments += `
                        // 使用世界位置的哈希作为伪对象ID
                        // 真实应用中应从uniform或顶点属性获取
                        float id = fract(
                            sin(dot(floor(vWorldPosition), vec3(12.9898, 78.233, 45.543))) * 43758.5453
                        );
                        // 使用不同颜色显示不同ID
                        vec3 idColor = vec3(id, fract(id * 13.0), fract(id * 27.0));
                        gOutput${i} = vec4(idColor, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_MASK:
					// 通道: 遮罩 - 可用于各种遮罩效果
					outputAssignments += `
                        // 基于UV创建一个棋盘格图案作为遮罩示例
                        float mask = mod(floor(vUv.x * 10.0) + floor(vUv.y * 10.0), 2.0);
                        gOutput${i} = vec4(vec3(mask), 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_SHADOW:
					// 通道: 阴影信息
					outputAssignments += `
                        // 使用简单的梯度作为阴影示例
                        // 真实应用中应获取实际阴影信息
                        float shadowValue = max(0.0, 1.0 - vViewPosition.z * 0.1);
                        gOutput${i} = vec4(vec3(shadowValue), 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_VELOCITY:
					// 通道: 速度向量 - 与运动不同的计算方式
					outputAssignments += `
                        // 基于时间和位置计算的速度场
                        vec2 velocity = vec2(
                            sin(vWorldPosition.y * 0.2 + time * 2.0),
                            cos(vWorldPosition.x * 0.2 + time * 2.0)
                        ) * 0.15;
                        gOutput${i} = vec4(velocity.x, velocity.y, 0.0, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_CUSTOM:
					// 通道: 自定义 - 用户可以在这里添加自己的计算逻辑
					outputAssignments += `
                        // 示例自定义输出 - 使用时间变化的花纹
                        vec3 customColor = vec3(
                            0.5 + 0.5 * sin(vUv.x * 20.0 + time),
                            0.5 + 0.5 * sin(vUv.y * 20.0 + time * 0.7),
                            0.5 + 0.5 * sin((vUv.x + vUv.y) * 10.0 + time * 1.3)
                        );
                        gOutput${i} = vec4(customColor, 1.0);
                    `;
					break;

				case MRTRenderPass.CHANNEL_ORIGINAL:
					// 通道: 原始/正常渲染 - 尝试使用物体的原始颜色和光照
					outputAssignments += `
                       vec3 customColor = vec3(
                            0.5 + 0.5 * sin(vUv.x * 20.0 + time),
                            0.5 + 0.5 * sin(vUv.y * 20.0 + time * 0.7),
                            0.5 + 0.5 * sin((vUv.x + vUv.y) * 10.0 + time * 1.3)
                        );
                        gOutput${i} = vec4(customColor, 1.0);
                    `;
					break;

				default:
					// 默认输出 - 灰色
					outputAssignments += `gOutput${i} = vec4(0.5, 0.5, 0.5, 1.0);\n`;
					break;

			}

		}

		// 创建多渲染目标材质
		this.mrtMaterial = new ShaderMaterial({
			uniforms: {
				// 可以在这里添加额外的uniform
				time: { value: 0.0 }
			},
			vertexShader: `
                out vec3 vNormal;
                out vec2 vUv;
                out vec3 vViewPosition;
                out vec3 vWorldPosition;
                // 使用自定义属性传递颜色信息
                out vec3 vBaseColor;
                
                void main() {
                    vUv = uv;
                    vNormal = normalMatrix * normal;
                    
                    // 计算世界空间位置
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    
                    // 计算视图空间位置
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = mvPosition.xyz;
                    
                    // 生成一个基于位置的颜色 (在没有实际颜色输入时的替代方案)
                    // 这样每个物体都会根据其位置有不同的颜色
                    vBaseColor = normalize(abs(worldPosition.xyz)) * 0.5 + 0.5;
                    
                    // 最终投影
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
			fragmentShader: `
                precision highp float;
                precision highp int;
                
                ${outputDeclarations}
                
                // 来自顶点着色器的变量
                in vec3 vNormal;
                in vec2 vUv;
                in vec3 vViewPosition;
                in vec3 vWorldPosition;
                in vec3 vBaseColor;
                
                // Uniform变量
                uniform float time;
                uniform sampler2D tDiffuse;
                // 计算颜色 - 这里使用多种方法来确保颜色可见
                vec3 getDiffuseColor() {
                    // 基础颜色（来自顶点着色器）
                    vec3 baseColor = vBaseColor;
                    
                    // 调整颜色 - 增加饱和度
                    vec3 enhancedColor = baseColor;
                    
                    // 使用UV坐标添加变化
                    vec3 uvColor = vec3(
                        fract(vUv.x * 5.0),
                        fract(vUv.y * 5.0),
                        fract((vUv.x + vUv.y) * 2.5)
                    );
                    
                    // 混合颜色源以创建更鲜艳的结果
                    return mix(enhancedColor, uvColor, 0.3) * 0.8 + 0.2;
                }
                
                void main() {
                    // 获取漫反射颜色
                    vec3 diffuseColor = getDiffuseColor();
                    
                    // 为每个渲染目标提供输出
                    ${outputAssignments}
                }
            `,
			glslVersion: GLSL3,
			side: FrontSide,
			blending: NoBlending
		});

	}

	/**
     * 修补场景中所有支持的材质，添加MRT输出
     * 这允许我们获取真实的材质属性，如金属度、粗糙度等
     *
     * @returns {Number} 被修改的材质数量
     */
	patchMaterials() {

		if(this.materialsPatched) {

			return 0; // 已经修补过，避免重复修补

		}

		// 清空之前的修补材质列表
		this.patchedMaterials = [];

		// 需要生成的通道列表
		const channelsNeeded = this.channels.slice();

		// 检查是否需要修补特定属性
		const needRoughness = channelsNeeded.includes(MRTRenderPass.CHANNEL_ROUGHNESS) ||
            channelsNeeded.includes(MRTRenderPass.CHANNEL_PBR);
		const needMetalness = channelsNeeded.includes(MRTRenderPass.CHANNEL_METALNESS) ||
            channelsNeeded.includes(MRTRenderPass.CHANNEL_PBR);
		const needEmission = channelsNeeded.includes(MRTRenderPass.CHANNEL_EMISSION);

		// 如果不需要任何材质特定属性，则不需要修补
		if(!needRoughness && !needMetalness && !needEmission) {

			return 0;

		}

		// 确定要实际输出的通道
		const activeChannels = [];

		// 始终添加颜色输出
		activeChannels.push(MRTRenderPass.CHANNEL_COLOR);

		// 添加法线输出（如果需要）
		if(channelsNeeded.includes(MRTRenderPass.CHANNEL_NORMAL)) {

			activeChannels.push(MRTRenderPass.CHANNEL_NORMAL);

		}

		// 添加深度输出（如果需要）
		if(channelsNeeded.includes(MRTRenderPass.CHANNEL_DEPTH)) {

			activeChannels.push(MRTRenderPass.CHANNEL_DEPTH);

		}

		// 添加世界位置输出（如果需要）
		if(channelsNeeded.includes(MRTRenderPass.CHANNEL_POSITION)) {

			activeChannels.push(MRTRenderPass.CHANNEL_POSITION);

		}

		// 添加PBR输出（如果需要）
		if(channelsNeeded.includes(MRTRenderPass.CHANNEL_PBR)) {

			activeChannels.push(MRTRenderPass.CHANNEL_PBR);

		} else {

			// 如果不需要组合PBR通道，但需要单独的粗糙度/金属度通道
			if(needRoughness) {

				activeChannels.push(MRTRenderPass.CHANNEL_ROUGHNESS);

			}
			if(needMetalness) {

				activeChannels.push(MRTRenderPass.CHANNEL_METALNESS);

			}

		}

		// 添加自发光输出（如果需要）
		if(needEmission) {

			activeChannels.push(MRTRenderPass.CHANNEL_EMISSION);

		}

		// 保存活跃通道列表
		this.activeChannels = activeChannels;

		// 更新实际使用的输出通道数量 - 这是关键，确保WebGLMultipleRenderTargets的输出数与着色器输出匹配
		this.outputCount = activeChannels.length;

		console.log(`设置MRT输出数量: ${this.outputCount}`);

		// 计算输出位置 - 创建连续的索引映射
		const outputIndices = {};
		activeChannels.forEach((channel, index) => {

			outputIndices[channel] = index;

		});

		// 创建MRT顶点着色器代码
		const mrtVertexShader = /* glsl */`
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                
                vNormal = normalMatrix * normal;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

		// 创建MRT片段着色器代码 - 开头部分
		const mrtFragmentShaderHead = /* glsl */`
            precision highp float;
            precision highp int;
            
            // 输出变量声明
        `;

		// 为每个实际输出通道创建声明
		let outputDeclarations = "";
		for(let i = 0; i < activeChannels.length; i++) {

			outputDeclarations += `layout(location = ${i}) out vec4 gOutput${i};\n`;

		}

		// 片段着色器通用变量
		const mrtFragmentShaderCommon = /* glsl */`
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            
            // 材质属性从uniforms获取
            uniform vec3 diffuseColor;
            uniform float roughness;
            uniform float metalness;
            uniform vec3 emissive;
            uniform float opacity;
            
            // 纹理uniforms
            uniform sampler2D map;
            uniform sampler2D normalMap;
            uniform sampler2D roughnessMap;
            uniform sampler2D metalnessMap;
            uniform sampler2D emissiveMap;
            uniform sampler2D aoMap;
            
            // 控制标志
            uniform bool useMap;
            uniform bool useNormalMap;
            uniform bool useRoughnessMap;
            uniform bool useMetalnessMap;
            uniform bool useEmissiveMap;
            uniform bool useAOMap;
        `;

		// 片段着色器主函数
		let mrtFragmentShaderMain = /* glsl */`
            void main() {
                // 基础颜色处理
                vec4 texelColor = vec4(1.0);
                if(useMap) {
                    texelColor = texture(map, vUv);
                }
                vec4 baseColor = vec4(diffuseColor, opacity) * texelColor;
                
                // 计算粗糙度
                float roughnessValue = roughness;
                if(useRoughnessMap) {
                    roughnessValue *= texture(roughnessMap, vUv).r;
                }
                
                // 计算金属度
                float metalnessValue = metalness;
                if(useMetalnessMap) {
                    metalnessValue *= texture(metalnessMap, vUv).r;
                }
                
                // 计算环境光遮蔽
                float aoValue = 1.0;
                if(useAOMap) {
                    aoValue = texture(aoMap, vUv).r;
                }
                
                // 计算自发光
                vec3 emissiveValue = emissive;
                if(useEmissiveMap) {
                    emissiveValue *= texture(emissiveMap, vUv).rgb;
                }
                
                // 计算法线信息
                vec3 normalVector = normalize(vNormal);
                
                // 输出到各个渲染目标
        `;

		// 确保对每个声明的输出都进行赋值，这很重要
		for(let i = 0; i < activeChannels.length; i++) {

			const channel = activeChannels[i];
			// 根据通道类型为每个输出添加对应的赋值
			if(channel === MRTRenderPass.CHANNEL_COLOR) {

				mrtFragmentShaderMain += `
                // 输出颜色
                gOutput${i} = baseColor;
                `;

			} else if(channel === MRTRenderPass.CHANNEL_NORMAL) {

				mrtFragmentShaderMain += `
                // 输出法线
                gOutput${i} = vec4(normalVector * 0.5 + 0.5, 1.0);
                `;

			} else if(channel === MRTRenderPass.CHANNEL_DEPTH) {

				mrtFragmentShaderMain += `
                // 输出深度
                float depth = abs(vViewPosition.z);
                float mappedDepth = 1.0 - exp(-0.1 * depth);
                gOutput${i} = vec4(vec3(mappedDepth), 1.0);
                `;

			} else if(channel === MRTRenderPass.CHANNEL_POSITION) {

				mrtFragmentShaderMain += `
                // 输出世界位置
                vec3 worldPosNormalized = vWorldPosition * 0.1;
                worldPosNormalized = fract(worldPosNormalized + 0.5);
                gOutput${i} = vec4(worldPosNormalized, 1.0);
                `;

			} else if(channel === MRTRenderPass.CHANNEL_ROUGHNESS) {

				mrtFragmentShaderMain += `
                // 输出真实粗糙度
                gOutput${i} = vec4(vec3(roughnessValue), 1.0);
                `;

			} else if(channel === MRTRenderPass.CHANNEL_METALNESS) {

				mrtFragmentShaderMain += `
                // 输出真实金属度
                gOutput${i} = vec4(vec3(metalnessValue), 1.0);
                `;

			} else if(channel === MRTRenderPass.CHANNEL_PBR) {

				mrtFragmentShaderMain += `
                // 输出真实PBR属性 (R=粗糙度, G=金属度, B=AO)
                gOutput${i} = vec4(roughnessValue, metalnessValue, aoValue, 1.0);
                `;

			} else if(channel === MRTRenderPass.CHANNEL_EMISSION) {

				mrtFragmentShaderMain += `
                // 输出真实自发光
                gOutput${i} = vec4(emissiveValue, 1.0);
                `;

			} else {

				// 为任何其他通道提供默认输出，确保所有输出都有值
				mrtFragmentShaderMain += `
                // 默认输出
                gOutput${i} = vec4(0.5, 0.5, 0.5, 1.0);
                `;

			}

		}

		// 完成片段着色器主函数
		mrtFragmentShaderMain += `
            }
        `;

		// 组合完整的片段着色器
		const mrtFragmentShader = mrtFragmentShaderHead + outputDeclarations + mrtFragmentShaderCommon + mrtFragmentShaderMain;

		// 记录调试信息
		console.log("MRT通道配置:", activeChannels.map((channel, index) => `${index}: ${channel}`).join(", "));
		console.log("MRT输出数量:", activeChannels.length);
		console.log("着色器输出声明数量:", outputDeclarations.split("layout(location").length - 1);

		// 遍历场景中的所有对象
		let patchCount = 0;
		this.scene.traverse((object) => {

			if(!object.isMesh || !object.material) {

				return;

			}

			// 处理单个材质或材质数组
			const materials = Array.isArray(object.material) ? object.material : [object.material];
			const mrtMaterials = [];


			materials.forEach((material, index) => {

				// 仅修补标准材质、物理材质等含有PBR属性的材质
				if(!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) {

					mrtMaterials.push(null); // 不支持的材质保持为null
					return;

				}

				try {

					// 创建新的GLSL3 MRT材质
					const mrtMaterial = new ShaderMaterial({
						vertexShader: mrtVertexShader,
						fragmentShader: mrtFragmentShader,
						glslVersion: GLSL3,
						uniforms: {
							// 基础属性
							diffuseColor: { value: material.color ? material.color.clone() : new Color(1, 1, 1) },
							roughness: { value: material.roughness !== undefined ? material.roughness : 0.5 },
							metalness: { value: material.metalness !== undefined ? material.metalness : 0.0 },
							emissive: { value: material.emissive ? material.emissive.clone() : new Color(0, 0, 0) },
							opacity: { value: material.opacity !== undefined ? material.opacity : 1.0 },

							// 纹理
							map: { value: material.map || null },
							normalMap: { value: material.normalMap || null },
							roughnessMap: { value: material.roughnessMap || null },
							metalnessMap: { value: material.metalnessMap || null },
							emissiveMap: { value: material.emissiveMap || null },
							aoMap: { value: material.aoMap || null },

							// 控制标志
							useMap: { value: !!material.map },
							useNormalMap: { value: !!material.normalMap },
							useRoughnessMap: { value: !!material.roughnessMap },
							useMetalnessMap: { value: !!material.metalnessMap },
							useEmissiveMap: { value: !!material.emissiveMap },
							useAOMap: { value: !!material.aoMap }
						},
						transparent: material.transparent,
						side: material.side
					});

					// 将原始材质和MRT材质存储起来
					mrtMaterials.push(mrtMaterial);
					patchCount++;

				} catch(e) {

					console.error("创建MRT材质失败:", e);
					mrtMaterials.push(null);

				}

			});

			// 如果至少有一个材质被替换，保存对象状态
			if(mrtMaterials.some(m => m !== null)) {

				this.patchedMaterials.push({
					object: object,
					originalMaterials: materials.slice(),
					mrtMaterials: mrtMaterials
				});

			}

		});

		// 确保渲染目标为null，强制在下一次渲染时重新创建
		if(this.renderTargets !== null) {

			this.renderTargets.dispose();
			this.renderTargets = null;

		}

		// 更新通道映射表
		this.channelMap.clear();
		activeChannels.forEach((channel, index) => {

			this.channelMap.set(channel, index);

		});

		this.materialsPatched = true;
		return patchCount;

	}

	/**
     * 恢复所有被修补的材质到原始状态
     *
     * @returns {Number} 被恢复的材质数量
     */
	restoreMaterials() {

		if(!this.materialsPatched) {

			return 0;

		}

		let restoreCount = 0;

		// 恢复每一个被修补的对象的材质
		this.patchedMaterials.forEach(({ object, originalMaterials }) => {

			if(!object) { return; }

			// 恢复原始材质
			if(Array.isArray(originalMaterials)) {

				object.material = originalMaterials;

			} else if(originalMaterials) {

				object.material = originalMaterials;

			}

			restoreCount++;

		});

		// 清空修补列表
		this.patchedMaterials = [];
		this.materialsPatched = false;

		return restoreCount;

	}

	/**
     * 应用MRT材质到场景中的对象
     * 在渲染前调用
     *
     * @private
     */
	_applyMRTMaterials() {

		this.patchedMaterials.forEach(({ object, mrtMaterials }) => {

			if(!object) { return; }

			// 应用MRT材质
			if(Array.isArray(mrtMaterials)) {

				// 如果原本是材质数组
				const appliedMaterials = mrtMaterials.map((mrtMat, index) =>
					mrtMat !== null ? mrtMat : object.material[index]
				);
				object.material = appliedMaterials;

			} else if(mrtMaterials) {

				// 如果是单一材质
				object.material = mrtMaterials;

			}

		});

	}

	/**
     * 恢复原始材质到场景中的对象
     * 在渲染后调用
     *
     * @private
     */
	_restoreOriginalMaterials() {

		this.patchedMaterials.forEach(({ object, originalMaterials }) => {

			if(!object) { return; }

			// 恢复原始材质
			object.material = originalMaterials;

		});

	}

	/**
     * 渲染场景到多个渲染目标
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 包含上一个通道结果的帧缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 作为输出渲染目标的帧缓冲区，除非此通道渲染到屏幕
     * @param {Number} [deltaTime] - 上一帧和当前帧之间的时间（秒）
     * @param {Boolean} [stencilTest] - 指示模板蒙版是否处于活动状态
     */
	render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {

		timeLog("MRTRenderPass.render");

		try {

			const scene = this.scene;
			const camera = this.camera;
			const selection = this.selection;
			const mask = camera.layers.mask;
			const background = scene.background;
			const shadowMapAutoUpdate = renderer.shadowMap.autoUpdate;

			// 检查是否需要使用材质修补模式
			if(this.useMaterialPatching) {

				// 如果启用了材质修补，但尚未应用，则应用修补
				if(!this.materialsPatched) {

					const patchCount = this.patchMaterials();
					if(patchCount > 0) {

						console.log(`MRTRenderPass: 为${patchCount}个材质创建了MRT支持`);

					}

					// 确保渲染目标数量与当前输出通道数量匹配
					this.renderTargets = null; // 强制重新创建

				}

			}

			// 如果renderTargets未初始化或尺寸为零，初始化它
			if(this.renderTargets === null ||
                (this.renderTargets.width <= 0 || this.renderTargets.height <= 0)) {

				this.initRenderTargets(renderer);

			}

			// 检查渲染目标是否正确初始化
			if(this.renderTargets === null) {

				console.error("MRTRenderPass: 渲染目标初始化失败");
				return;

			}

			// 检查渲染目标数量是否与着色器输出匹配
			if(this.renderTargets.texture.length !== this.outputCount) {

				console.error(`MRTRenderPass: 渲染目标数量(${this.renderTargets.texture.length})与输出数量(${this.outputCount})不匹配！`);

			}

			// 获取场景中第一个子对象的类名（如果存在）
			let childClassName = "无子对象";
			if(scene && scene.children && scene.children.length > 0) {

				childClassName = scene.children[0].constructor.name;

			}
			log(`MRTRenderPass 渲染场景, 第一个子对象类型: ${childClassName}, 渲染目标数量: ${this.renderTargets.texture.length}`);

			// 更新着色器中的time参数，用于动态效果
			if(this.mrtMaterial && this.mrtMaterial.uniforms && this.mrtMaterial.uniforms.time) {

				this.mrtMaterial.uniforms.time.value = performance.now() * 0.001;

			}

			if(selection !== null) {

				camera.layers.set(selection.getLayer());

			}

			if(this.skipShadowMapUpdate) {

				renderer.shadowMap.autoUpdate = false;

			}

			if(this.ignoreBackground || this.clearPass.overrideClearColor !== null) {

				scene.background = null;

			}

			if(this.clearPass.enabled) {

				// 应用于所有MRT目标
				this.clearPass.render(renderer, this.renderTargets);

			}

			// 设置MRT渲染目标
			renderer.setRenderTarget(this.renderTargets);

			// 保存当前的覆盖材质
			const currentOverrideMaterial = scene.overrideMaterial;

			if(this.useMaterialPatching) {

				// 应用MRT材质
				this._applyMRTMaterials();

				// 使用材质修补模式时，不设置覆盖材质
				scene.overrideMaterial = null;

			} else {

				// 使用MRT专用材质渲染场景
				scene.overrideMaterial = this.mrtMaterial;

			}

			// 渲染之前打印一下当前状态
			console.log(`MRTRenderPass: 开始渲染, 输出数量: ${this.outputCount}, 材质已修补: ${this.materialsPatched}, 使用材质修补: ${this.useMaterialPatching}`);

			// 渲染场景
			try {

				renderer.render(scene, camera);
				console.log("MRTRenderPass: 渲染成功");

			} catch(renderError) {

				console.error("MRTRenderPass: 渲染错误:", renderError);

			}

			// 如果使用了材质修补模式，恢复原始材质
			if(this.useMaterialPatching) {

				this._restoreOriginalMaterials();

			}

			// 恢复原来的覆盖材质
			scene.overrideMaterial = currentOverrideMaterial;

			// 如果需要，将MRT的第一个渲染目标复制到输出缓冲区
			if(!this.renderToScreen && outputBuffer !== null) {
				// 这里可以添加复制操作，将MRT的第一个输出复制到outputBuffer
			}

			// 恢复原始值
			camera.layers.mask = mask;
			scene.background = background;
			renderer.shadowMap.autoUpdate = shadowMapAutoUpdate;

			// 将渲染目标数组填充为MRT的纹理
			this.buffers = [];
			for(let i = 0; i < this.outputCount; i++) {

				this.buffers.push(this.renderTargets.texture[i]);

			}

		} catch(e) {

			console.error("MRTRenderPass.render 执行错误:", e);

		}

		timeEndLog("MRTRenderPass.render");

	}

	/**
     * 更新通道的大小
     *
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		if(this.renderTargets !== null) {

			this.renderTargets.setSize(width, height);

		}
		this.clearPass.setSize(width, height);

	}

	/**
     * 释放资源
     */
	dispose() {

		// 确保恢复所有材质
		if(this.materialsPatched) {

			this.restoreMaterials();

		}

		super.dispose();

		if(this.renderTargets !== null) {

			this.renderTargets.dispose();

		}

		if(this.overrideMaterialManager !== null) {

			this.overrideMaterialManager.dispose();

		}

		if(this.mrtMaterial !== null && this.mrtMaterial !== undefined) {

			this.mrtMaterial.dispose();

		}

		this.clearPass.dispose();

	}

}
