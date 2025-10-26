/**
 * Object ID Manager for G-Buffer selective rendering
 * 
 * 管理场景中对象的唯一ID，用于G-Buffer中的对象标识和选择性渲染
 */

export class ObjectIdManager {

    /**
     * 构造对象ID管理器
     */
    constructor() {

        /**
         * 对象到ID的映射
         * @type {WeakMap<Object3D, number>}
         * @private
         */
        this.objectToId = new WeakMap();

        /**
         * ID到对象的映射
         * @type {Map<number, Object3D>}
         * @private  
         */
        this.idToObject = new Map();

        /**
         * 下一个可用的ID
         * @type {number}
         * @private
         */
        this.nextId = 1; // 从1开始，0保留给背景

        /**
         * 最大ID值（用于优化）
         * @type {number}
         */
        this.maxId = 255; // 默认支持255个对象

        /**
         * 回收的ID队列
         * @type {Array<number>}
         * @private
         */
        this.recycledIds = [];

        /**
         * 调试模式
         * @type {boolean}
         */
        this.debug = false;

    }

    /**
     * 获取对象的ID，如果不存在则分配新ID
     * 
     * @param {Object3D} object - Three.js对象
     * @returns {number} 对象的唯一ID
     */
    getObjectId(object) {

        if (!object) {

            if (this.debug) console.warn("ObjectIdManager: 尝试获取null对象的ID");
            return 0; // 背景ID

        }

        // 如果对象已有ID，直接返回
        if (this.objectToId.has(object)) {

            return this.objectToId.get(object);

        }

        // 分配新ID
        const id = this.allocateId();
        this.objectToId.set(object, id);
        this.idToObject.set(id, object);

        if (this.debug) {

            console.log(`ObjectIdManager: 为对象 ${object.name || object.uuid} 分配ID: ${id}`);

        }

        return id;

    }

    /**
     * 分配一个新的ID
     * 
     * @returns {number} 新分配的ID
     * @private
     */
    allocateId() {

        // 优先使用回收的ID
        if (this.recycledIds.length > 0) {

            return this.recycledIds.pop();

        }

        // 检查是否超出最大ID
        if (this.nextId > this.maxId) {

            console.error(`ObjectIdManager: ID已超出最大值 ${this.maxId}`);
            return this.maxId; // 返回最大ID作为fallback

        }

        return this.nextId++;

    }

    /**
     * 释放对象的ID
     * 
     * @param {Object3D} object - 要释放ID的对象
     */
    releaseObjectId(object) {

        if (!this.objectToId.has(object)) {

            if (this.debug) console.warn("ObjectIdManager: 尝试释放不存在ID的对象");
            return;

        }

        const id = this.objectToId.get(object);
        this.objectToId.delete(object);
        this.idToObject.delete(id);

        // 回收ID供重用
        this.recycledIds.push(id);

        if (this.debug) {

            console.log(`ObjectIdManager: 释放对象 ${object.name || object.uuid} 的ID: ${id}`);

        }

    }

    /**
     * 通过ID获取对象
     * 
     * @param {number} id - 对象ID
     * @returns {Object3D|null} 对应的对象，如果不存在返回null
     */
    getObjectById(id) {

        return this.idToObject.get(id) || null;

    }

    /**
     * 获取选中对象的ID数组
     * 
     * @param {Set|Array|Selection} selection - 选中对象集合
     * @returns {Array<number>} 选中对象的ID数组
     */
    getSelectedObjectIds(selection) {

        const ids = [];

        if (!selection) return ids;

        // 处理Set和Selection对象
        if (selection.forEach && typeof selection.forEach === 'function') {

            selection.forEach(obj => {

                const id = this.getObjectId(obj);
                if (id > 0) ids.push(id); // 排除背景ID(0)

            });

        } else if (Array.isArray(selection)) {

            // 处理数组
            for (const obj of selection) {

                const id = this.getObjectId(obj);
                if (id > 0) ids.push(id);

            }

        }

        return ids;

    }

    /**
     * 自动扫描场景并为所有网格对象分配ID
     * 
     * @param {Scene} scene - Three.js场景
     * @param {boolean} forceUpdate - 是否强制更新已有ID的对象
     * @returns {{assigned: number, total: number, existing: number}} 扫描结果统计
     */
    scanScene(scene, forceUpdate = false) {

        let assignedCount = 0;  // 新分配的ID数量
        let totalMeshCount = 0; // 总网格数量
        let existingCount = 0;  // 已存在ID的数量

        scene.traverse((object) => {

            // 只处理网格对象
            if (object.isMesh) {
                totalMeshCount++;

                // 如果已经有ID
                if (this.objectToId.has(object)) {
                    existingCount++;

                    // 如果强制更新，重新分配
                    if (forceUpdate) {
                        this.getObjectId(object);
                        assignedCount++;
                    }
                } else {
                    // 对象没有ID，分配新ID
                    this.getObjectId(object);
                    assignedCount++;
                }

            }

        });

        if (this.debug) {
            if (assignedCount === 0 && existingCount > 0) {
                // console.log(`ObjectIdManager: 扫描场景完成，共 ${totalMeshCount} 个网格，所有对象已有ID（${existingCount}个）`);
            } else if (assignedCount > 0) {
                console.log(`ObjectIdManager: 扫描场景完成，新分配 ${assignedCount} 个ID，共 ${totalMeshCount} 个网格`);
            } else {
                // console.log(`ObjectIdManager: 扫描场景完成，共 ${totalMeshCount} 个网格，无需分配ID`);
            }
        }

        // 返回详细统计信息
        return {
            assigned: assignedCount,
            total: totalMeshCount,
            existing: existingCount
        };

    }

    /**
     * 清除所有ID映射
     */
    clear() {

        this.objectToId = new WeakMap();
        this.idToObject.clear();
        this.recycledIds = [];
        this.nextId = 1;

        if (this.debug) {

            console.log("ObjectIdManager: 已清除所有ID映射");

        }

    }

    /**
     * 获取管理器状态信息
     * 
     * @returns {Object} 状态信息
     */
    getStats() {

        return {
            allocatedCount: this.idToObject.size,
            nextId: this.nextId,
            recycledCount: this.recycledIds.length,
            maxId: this.maxId,
            usagePercentage: ((this.nextId - 1) / this.maxId * 100).toFixed(1) + '%'
        };

    }

    /**
     * 设置最大ID值
     * 
     * @param {number} maxId - 新的最大ID值
     */
    setMaxId(maxId) {

        if (maxId < this.nextId - 1) {

            console.warn(`ObjectIdManager: 新的最大ID ${maxId} 小于当前已分配的ID数量 ${this.nextId - 1}`);
            return false;

        }

        this.maxId = maxId;
        return true;

    }

    /**
     * 启用/禁用调试模式
     * 
     * @param {boolean} enabled - 是否启用调试
     */
    setDebug(enabled) {

        this.debug = enabled;

    }

}
