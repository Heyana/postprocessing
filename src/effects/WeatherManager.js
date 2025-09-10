import { Vector2, Vector3 } from "three";
import { SkyAtmosphereEffect } from "./SkyAtmosphereEffect.js";
import { SnowfallEffect } from "./SnowfallEffect.js";
import { RainfallEffect } from "./RainfallEffect.js";
import { VolumetricFogEffect } from "./VolumetricFogEffect.js";

/**
 * 天气系统管理器 - 统一管理各种天气效果
 * 
 * 该管理器提供了简化的API来控制复杂的天气系统，
 * 可以平滑地在不同天气状态之间过渡
 */
export class WeatherManager {

    /**
     * 构造天气管理器
     * 
     * @param {Object} [options] - 配置选项
     * @param {Boolean} [options.enableTransitions=true] - 是否启用天气过渡动画
     * @param {Number} [options.transitionSpeed=1.0] - 天气过渡速度
     * @param {Object} [options.effectOptions] - 各种效果的默认配置
     */
    constructor({
        enableTransitions = true,
        transitionSpeed = 1.0,
        effectOptions = {}
    } = {}) {

        this.enableTransitions = enableTransitions;
        this.transitionSpeed = transitionSpeed;

        // 当前天气状态
        this.currentWeather = 'clear';
        this.targetWeather = 'clear';
        this.transitionProgress = 1.0;

        // 效果实例
        this.effects = {};

        // 天气预设定义
        this.weatherPresets = {
            clear: {
                name: '晴天',
                sky: { cloudiness: 0.2, intensity: 12.0 },
                rain: { intensity: 0 },
                snow: { density: 0 },
                fog: { density: 0 }
            },

            cloudy: {
                name: '多云',
                sky: { cloudiness: 0.7, intensity: 9.0 },
                rain: { intensity: 0 },
                snow: { density: 0 },
                fog: { density: 0.1 }
            },

            overcast: {
                name: '阴天',
                sky: { cloudiness: 1.2, intensity: 6.0 },
                rain: { intensity: 0 },
                snow: { density: 0 },
                fog: { density: 0.2 }
            },

            lightRain: {
                name: '小雨',
                sky: { cloudiness: 1.0, intensity: 7.0 },
                rain: { intensity: 0.3, preset: 'light' },
                snow: { density: 0 },
                fog: { density: 0.15 }
            },

            rain: {
                name: '中雨',
                sky: { cloudiness: 1.3, intensity: 5.0 },
                rain: { intensity: 0.6, preset: 'moderate' },
                snow: { density: 0 },
                fog: { density: 0.25 }
            },

            heavyRain: {
                name: '大雨',
                sky: { cloudiness: 1.8, intensity: 4.0 },
                rain: { intensity: 0.8, preset: 'heavy' },
                snow: { density: 0 },
                fog: { density: 0.3 }
            },

            storm: {
                name: '暴风雨',
                sky: { cloudiness: 2.0, intensity: 3.0 },
                rain: { intensity: 1.0, preset: 'storm' },
                snow: { density: 0 },
                fog: { density: 0.4 }
            },

            lightSnow: {
                name: '小雪',
                sky: { cloudiness: 0.8, intensity: 6.0, colorOverlay: new Vector3(0.9, 0.95, 1.0), colorOverlayStrength: 0.2 },
                rain: { intensity: 0 },
                snow: { density: 0.3, snowSpeed: 0.15, windDirection: new Vector2(0.05, 0) },
                fog: { density: 0.1 }
            },

            snow: {
                name: '中雪',
                sky: { cloudiness: 1.2, intensity: 4.0, colorOverlay: new Vector3(0.85, 0.9, 1.0), colorOverlayStrength: 0.3 },
                rain: { intensity: 0 },
                snow: { density: 0.6, snowSpeed: 0.2, windDirection: new Vector2(0.1, 0) },
                fog: { density: 0.2 }
            },

            heavySnow: {
                name: '大雪',
                sky: { cloudiness: 1.8, intensity: 3.0, colorOverlay: new Vector3(0.8, 0.85, 1.0), colorOverlayStrength: 0.4 },
                rain: { intensity: 0 },
                snow: { density: 0.9, snowSpeed: 0.25, windDirection: new Vector2(0.15, 0) },
                fog: { density: 0.35 }
            },

            blizzard: {
                name: '暴雪',
                sky: { cloudiness: 2.2, intensity: 2.0, colorOverlay: new Vector3(0.75, 0.8, 1.0), colorOverlayStrength: 0.5 },
                rain: { intensity: 0 },
                snow: { density: 1.0, snowSpeed: 0.35, windDirection: new Vector2(0.3, 0) },
                fog: { density: 0.5 }
            },

            fog: {
                name: '大雾',
                sky: { cloudiness: 0.5, intensity: 8.0 },
                rain: { intensity: 0 },
                snow: { density: 0 },
                fog: { density: 0.8 }
            }
        };

        // 创建效果实例
        this.initializeEffects(effectOptions);
    }

    /**
     * 初始化天气效果
     * 
     * @private
     */
    initializeEffects(effectOptions) {
        // 天空大气效果
        this.effects.sky = new SkyAtmosphereEffect(effectOptions.sky || {});

        // 降雨效果
        this.effects.rain = new RainfallEffect(effectOptions.rain || {});

        // 降雪效果
        this.effects.snow = new SnowfallEffect(effectOptions.snow || {});

        // 雾效果（如果存在）
        if (VolumetricFogEffect) {
            this.effects.fog = new VolumetricFogEffect(effectOptions.fog || {});
        }
    }

    /**
     * 获取所有天气效果实例数组
     * 
     * @return {Array} 效果实例数组
     */
    getEffects() {
        const activeEffects = [];

        // 天空效果总是活跃的
        activeEffects.push(this.effects.sky);

        // 根据当前设置添加其他效果
        const currentPreset = this.weatherPresets[this.currentWeather];
        if (!currentPreset) return activeEffects;

        if (currentPreset.rain.intensity > 0) {
            activeEffects.push(this.effects.rain);
        }

        if (currentPreset.snow.density > 0) {
            activeEffects.push(this.effects.snow);
        }

        if (this.effects.fog && currentPreset.fog.density > 0) {
            activeEffects.push(this.effects.fog);
        }

        return activeEffects;
    }

    /**
     * 设置天气状态
     * 
     * @param {String} weatherType - 天气类型
     * @param {Boolean} [immediate=false] - 是否立即切换，不使用过渡动画
     */
    setWeather(weatherType, immediate = false) {
        if (!this.weatherPresets[weatherType]) {
            console.warn(`未知的天气类型: ${weatherType}`);
            return;
        }

        this.targetWeather = weatherType;

        if (immediate || !this.enableTransitions) {
            this.currentWeather = weatherType;
            this.transitionProgress = 1.0;
            this.applyWeatherSettings(weatherType, 1.0);
        } else {
            this.transitionProgress = 0.0;
        }
    }

    /**
     * 获取当前天气类型
     * 
     * @return {String} 当前天气类型
     */
    getCurrentWeather() {
        return this.currentWeather;
    }

    /**
     * 获取天气预设信息
     * 
     * @param {String} weatherType - 天气类型
     * @return {Object} 天气预设信息
     */
    getWeatherInfo(weatherType) {
        return this.weatherPresets[weatherType];
    }

    /**
     * 获取所有可用的天气类型
     * 
     * @return {Array} 天气类型数组
     */
    getAvailableWeatherTypes() {
        return Object.keys(this.weatherPresets);
    }

    /**
     * 应用天气设置
     * 
     * @param {String} weatherType - 天气类型
     * @param {Number} strength - 应用强度 (0-1)
     * @private
     */
    applyWeatherSettings(weatherType, strength = 1.0) {
        const preset = this.weatherPresets[weatherType];
        if (!preset) return;

        // 应用天空设置
        if (preset.sky) {
            this.applyEffectSettings(this.effects.sky, preset.sky, strength);
        }

        // 应用降雨设置
        if (preset.rain) {
            this.applyEffectSettings(this.effects.rain, preset.rain, strength);
            if (preset.rain.preset) {
                this.effects.rain.setRainPreset(preset.rain.preset);
            }
        }

        // 应用降雪设置
        if (preset.snow) {
            this.applyEffectSettings(this.effects.snow, preset.snow, strength);
        }

        // 应用雾效果设置
        if (preset.fog && this.effects.fog) {
            this.applyEffectSettings(this.effects.fog, preset.fog, strength);
        }
    }

    /**
     * 应用效果设置
     * 
     * @param {Effect} effect - 效果实例
     * @param {Object} settings - 设置对象
     * @param {Number} strength - 应用强度
     * @private
     */
    applyEffectSettings(effect, settings, strength) {
        Object.entries(settings).forEach(([key, value]) => {
            if (key === 'preset') return; // 跳过预设键

            if (effect[key] !== undefined) {
                if (typeof value === 'number') {
                    effect[key] = value * strength;
                } else {
                    effect[key] = value;
                }
            }
        });
    }

    /**
     * 更新天气系统
     * 
     * @param {Number} deltaTime - 时间增量
     */
    update(deltaTime) {
        // 处理天气过渡
        if (this.transitionProgress < 1.0 && this.currentWeather !== this.targetWeather) {
            this.transitionProgress += deltaTime * this.transitionSpeed;
            this.transitionProgress = Math.min(1.0, this.transitionProgress);

            if (this.transitionProgress >= 1.0) {
                this.currentWeather = this.targetWeather;
                this.applyWeatherSettings(this.currentWeather, 1.0);
            } else {
                // 在过渡期间混合两种天气状态
                this.blendWeatherStates(this.currentWeather, this.targetWeather, this.transitionProgress);
            }
        }

        // 更新所有效果
        Object.values(this.effects).forEach(effect => {
            if (effect && effect.update) {
                effect.update(null, null, deltaTime);
            }
        });
    }

    /**
     * 混合两种天气状态
     * 
     * @param {String} fromWeather - 起始天气
     * @param {String} toWeather - 目标天气
     * @param {Number} progress - 过渡进度 (0-1)
     * @private
     */
    blendWeatherStates(fromWeather, toWeather, progress) {
        const fromPreset = this.weatherPresets[fromWeather];
        const toPreset = this.weatherPresets[toWeather];

        if (!fromPreset || !toPreset) return;

        // 混合天空设置
        this.blendEffectSettings(this.effects.sky, fromPreset.sky, toPreset.sky, progress);

        // 混合降雨设置
        this.blendEffectSettings(this.effects.rain, fromPreset.rain, toPreset.rain, progress);

        // 混合降雪设置
        this.blendEffectSettings(this.effects.snow, fromPreset.snow, toPreset.snow, progress);

        // 混合雾设置
        if (this.effects.fog) {
            this.blendEffectSettings(this.effects.fog, fromPreset.fog, toPreset.fog, progress);
        }
    }

    /**
     * 混合效果设置
     * 
     * @param {Effect} effect - 效果实例
     * @param {Object} fromSettings - 起始设置
     * @param {Object} toSettings - 目标设置
     * @param {Number} progress - 进度
     * @private
     */
    blendEffectSettings(effect, fromSettings, toSettings, progress) {
        if (!fromSettings || !toSettings) return;

        const allKeys = new Set([...Object.keys(fromSettings), ...Object.keys(toSettings)]);

        allKeys.forEach(key => {
            if (key === 'preset') return; // 跳过预设键

            const fromValue = fromSettings[key] || 0;
            const toValue = toSettings[key] || 0;

            if (effect[key] !== undefined) {
                if (typeof fromValue === 'number' && typeof toValue === 'number') {
                    effect[key] = fromValue + (toValue - fromValue) * progress;
                } else if (progress > 0.5) {
                    effect[key] = toValue;
                } else {
                    effect[key] = fromValue;
                }
            }
        });
    }

    /**
     * 设置过渡速度
     * 
     * @param {Number} speed - 过渡速度
     */
    setTransitionSpeed(speed) {
        this.transitionSpeed = Math.max(0.1, speed);
    }

    /**
     * 获取过渡速度
     * 
     * @return {Number} 过渡速度
     */
    getTransitionSpeed() {
        return this.transitionSpeed;
    }

    /**
     * 启用或禁用天气过渡
     * 
     * @param {Boolean} enable - 是否启用
     */
    setTransitionsEnabled(enable) {
        this.enableTransitions = enable;
    }

    /**
     * 检查是否正在过渡
     * 
     * @return {Boolean} 是否正在过渡
     */
    isTransitioning() {
        return this.transitionProgress < 1.0 && this.currentWeather !== this.targetWeather;
    }

    /**
     * 获取过渡进度
     * 
     * @return {Number} 过渡进度 (0-1)
     */
    getTransitionProgress() {
        return this.transitionProgress;
    }
}
