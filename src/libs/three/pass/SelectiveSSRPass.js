import { SSRPass } from './SSRPass.js';
import { Selection } from '../../../core/Selection.js';

/**
 * SelectiveSSRPass - 选择性屏幕空间反射通道
 * 
 * 这个通道继承自SSRPass，但增加了选择性功能，可以指定哪些对象需要渲染SSR效果，
 * 从而提高性能，避免对所有场景对象进行处理。
 */
class SelectiveSSRPass extends SSRPass {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {WebGLRenderer} options.renderer - 渲染器
     * @param {Scene} options.scene - 场景
     * @param {Camera} options.camera - 相机
     * @param {Number} options.width - 宽度
     * @param {Number} options.height - 高度
     * @param {ReflectorForSSRPass} [options.groundReflector] - 地面反射器
     * @param {Boolean} [options.bouncing=false] - 是否开启多次反射
     * @param {Number} [options.selectionLayer=21] - 选择层索引
     */
    constructor(options) {
        super(options);

        /**
         * 对象选择器
         * @type {Selection}
         */
        this.selection = new Selection(undefined, options.selectionLayer || 21);

        /**
         * 是否反转选择（选择不在selection中的对象）
         * @type {Boolean}
         */
        this.inverted = false;

        /**
         * 是否忽略背景
         * @type {Boolean}
         */
        this.ignoreBackground = true;

        // 存储原始图层
        this._originalLayers = new Map();
        this._visibilityCache = new WeakMap();
    }

    /**
     * 覆盖原始渲染方法，添加选择性渲染逻辑
     * @override
     */
    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        // 在渲染前准备选择性渲染
        this._prepareSelectionBeforeRender(this.scene);

        // 调用父类的渲染方法
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);

        // 渲染后恢复对象的原始状态
        this._restoreSelectionAfterRender();
    }

    /**
     * 在渲染前准备选择性渲染
     * @private
     * @param {Scene} scene - 场景
     */
    _prepareSelectionBeforeRender(scene) {
        // 清除缓存
        this._originalLayers.clear();

        // 遍历场景中的所有对象
        scene.traverse((object) => {
            if (object.isMesh) {
                // 保存原始图层
                this._originalLayers.set(object, object.layers.mask);

                // 保存原始可见性
                this._visibilityCache.set(object, object.visible);

                // 确定对象是否应该被SSR渲染
                const selected = this.selection.has(object);
                const include = this.inverted ? !selected : selected;

                if (include) {
                    // 激活选择层使对象被SSR渲染
                    object.layers.enable(this.selection.layer);
                } else if (!this.ignoreBackground) {
                    // 如果不忽略背景，对未选中对象进行特殊处理
                    object.layers.enable(this.selection.layer);
                } else {
                    // 否则禁用选择层
                    object.layers.disable(this.selection.layer);
                    // 在SSR渲染阶段隐藏对象
                    object.visible = false;
                }
            }
        });
    }

    /**
     * 在渲染后恢复对象的原始状态
     * @private
     */
    _restoreSelectionAfterRender() {
        // 恢复所有对象的原始图层和可见性
        for (const [object, mask] of this._originalLayers) {
            object.layers.mask = mask;
            object.visible = this._visibilityCache.get(object);
        }
    }

    /**
     * 设置选择层
     * @param {Number} layer - 选择层索引
     */
    setSelectionLayer(layer) {
        this.selection.layer = layer;
    }

    /**
     * 设置选择反转
     * @param {Boolean} inverted - 是否反转选择
     */
    setInverted(inverted) {
        this.inverted = inverted;
    }

    /**
     * 设置是否忽略背景
     * @param {Boolean} ignore - 是否忽略背景
     */
    setIgnoreBackground(ignore) {
        this.ignoreBackground = ignore;
    }

    /**
     * 添加对象到选择集
     * @param {Object3D} object - 要添加的对象
     */
    addSelection(object) {
        this.selection.add(object);
    }

    /**
     * 从选择集中移除对象
     * @param {Object3D} object - 要移除的对象
     */
    removeSelection(object) {
        this.selection.delete(object);
    }

    /**
     * 切换对象的选择状态
     * @param {Object3D} object - 要切换的对象
     */
    toggleSelection(object) {
        if (this.selection.has(object)) {
            this.selection.delete(object);
        } else {
            this.selection.add(object);
        }
    }

    /**
     * 清空选择集
     */
    clearSelection() {
        this.selection.clear();
    }

    /**
     * 资源释放
     * @override
     */
    dispose() {
        this._originalLayers.clear();
        this._visibilityCache = new WeakMap();
        super.dispose();
    }
}

export { SelectiveSSRPass }; 