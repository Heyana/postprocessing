import { RGBADepthPacking } from "three";
import { DepthPass } from "../passes/DepthPass.js";
import { log } from "../utils/PerformanceLogger.js";
/**
 * 一个轻量级的共享深度通道。
 * 
 * 这个类不执行实际渲染，而是提供了与DepthPass兼容的API，
 * 但使用由MRT渲染生成的共享深度纹理。
 */
export class SharedDepthPass extends DepthPass {

    /**
     * 构造一个新的共享深度通道。
     *
     * @param {Texture} sharedDepthTexture - MRT渲染生成的共享深度纹理。
     * @param {Number} [depthPacking=RGBADepthPacking] - 深度打包格式。
     */
    constructor(sharedDepthTexture, depthPacking = RGBADepthPacking) {
        super(null, null); // 传递空场景和相机，因为不会实际渲染

        // 保存共享深度纹理
        this._sharedTexture = sharedDepthTexture;

        // 直接设置texture属性，确保能被访问到
        // 这解决了getter可能被覆盖的问题
        this.texture = sharedDepthTexture;

        // 设置深度打包格式
        this.depthPacking = depthPacking;

        // 标记为虚拟深度通道
        this.isVirtualDepthPass = true;
        this.isSharedDepthPass = true;

        // 记录创建时纹理ID用于调试
        const textureId = sharedDepthTexture ? (sharedDepthTexture.id || "未知") : "无";
        log(`SharedDepthPass创建完成，使用纹理ID: ${textureId}`);
    }

    /**
     * 覆盖render方法，不执行实际渲染。
     * 因为深度信息已经在MRT渲染中生成。
     */
    render() {
        // 空实现，不需要执行任何渲染
    }

    /**
     * 返回深度纹理。
     * 注意：为了兼容性，我们同时提供getter和直接属性
     *
     * @return {Texture} 深度纹理。
     */
    get texture() {
        // 添加防护检查，确保不返回undefined
        if (!this._sharedTexture) {
            log("SharedDepthPass: 深度纹理未初始化或无效");
            return null; // 返回null而不是undefined
        }
        return this._sharedTexture;
    }

    /**
     * 设置深度纹理。
     * 这将同时更新getter和直接属性
     */
    set texture(value) {
        this._sharedTexture = value;
        // 不需要额外操作，因为getter会从_sharedTexture读取
    }

    /**
     * 设置共享深度纹理。
     *
     * @param {Texture} texture - 新的共享深度纹理。
     */
    setTexture(texture) {
        if (!texture) {
            log("SharedDepthPass.setTexture: 尝试设置空纹理");
            return;
        }

        // 保存纹理引用
        this._sharedTexture = texture;
        this.texture = texture; // 同时更新直接属性

        // 检查和更新纹理尺寸
        const textureId = texture.id || "未知";
        let width = texture.width;
        let height = texture.height;

        // 如果纹理尺寸无效，尝试从源获取尺寸信息
        if (!width || !height || width === 0 || height === 0) {
            // 尝试从渲染目标获取
            if (texture.renderTarget) {
                width = texture.renderTarget.width;
                height = texture.renderTarget.height;
                log(`SharedDepthPass: 从renderTarget获取纹理尺寸: ${width}x${height}`);

                // 更新纹理尺寸属性
                texture.width = width;
                texture.height = height;
            } else {
                // 使用默认尺寸
                width = 1920;
                height = 1080;
                log(`SharedDepthPass: 无法获取纹理尺寸，使用默认值: ${width}x${height}`);

                // 更新纹理尺寸属性
                texture.width = width;
                texture.height = height;
            }
        }

        log(`SharedDepthPass纹理已更新，ID: ${textureId}, 尺寸: ${width}x${height}`);
    }

    /**
     * 设置共享深度纹理的别名方法（向后兼容）。
     *
     * @param {Texture} texture - 新的共享深度纹理。
     * @deprecated 使用setTexture代替
     */
    setSharedTexture(texture) {
        log("SharedDepthPass.setSharedTexture已弃用，请使用setTexture代替");
        this.setTexture(texture);
    }
} 