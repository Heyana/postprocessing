# 天气系统使用指南

本文档介绍如何使用新创建的后处理天气系统，包括降雨效果和智能天气管理器。

## 🌧️ 快速开始

### 1. 基本降雨效果

```javascript
import { RainfallEffect, EffectComposer, RenderPass, EffectPass } from "postprocessing";
import { BlendFunction } from "postprocessing";

// 创建降雨效果
const rainfallEffect = new RainfallEffect({
    blendFunction: BlendFunction.ALPHA,
    intensity: 0.6,
    rainSpeed: 1.0,
    rainSize: 0.15,
    windDirection: new THREE.Vector2(0.1, 0),
    enableLighting: true // 启用闪电效果
});

// 添加到后处理管线
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera, rainfallEffect));
```

### 2. 智能天气管理器

```javascript
import { WeatherManager } from "postprocessing";

// 创建天气管理器
const weatherManager = new WeatherManager({
    enableTransitions: true,
    transitionSpeed: 1.0
});

// 设置天气管理器的相机
weatherManager.effects.sky.setCamera(camera);

// 获取所有需要的效果并添加到后处理
const effects = weatherManager.getEffects();
const effectPass = new EffectPass(camera, ...effects);
composer.addPass(effectPass);

// 切换天气（会平滑过渡）
weatherManager.setWeather('rain');

// 在渲染循环中更新
function animate() {
    const deltaTime = clock.getDelta();
    weatherManager.update(deltaTime);
    composer.render(deltaTime);
    requestAnimationFrame(animate);
}
```

## 🎮 可用天气类型

### 晴朗天气
- `'clear'` - 晴天：蓝天白云，阳光明媚
- `'cloudy'` - 多云：适度云层覆盖
- `'overcast'` - 阴天：厚重云层

### 降雨天气
- `'lightRain'` - 小雨：轻柔细雨
- `'rain'` - 中雨：正常降雨强度
- `'heavyRain'` - 大雨：强烈降雨
- `'storm'` - 暴风雨：最强降雨+闪电

### 降雪天气
- `'lightSnow'` - 小雪：轻盈雪花
- `'snow'` - 中雪：稳定降雪
- `'heavySnow'` - 大雪：密集雪花
- `'blizzard'` - 暴雪：最强降雪+强风

### 特殊天气
- `'fog'` - 大雾：浓厚雾气

## 🔧 高级功能

### 降雨效果预设

```javascript
// 使用内置预设快速设置
rainfallEffect.setRainPreset('light');    // 小雨
rainfallEffect.setRainPreset('moderate'); // 中雨
rainfallEffect.setRainPreset('heavy');    // 大雨
rainfallEffect.setRainPreset('storm');    // 暴风雨
```

### 天气过渡控制

```javascript
// 立即切换（无过渡）
weatherManager.setWeather('storm', true);

// 调整过渡速度
weatherManager.setTransitionSpeed(2.0); // 2倍速

// 检查过渡状态
if (weatherManager.isTransitioning()) {
    const progress = weatherManager.getTransitionProgress();
    console.log(`过渡进度: ${(progress * 100).toFixed(1)}%`);
}
```

### 自定义天气参数

```javascript
// 降雨效果详细参数
const rainfallEffect = new RainfallEffect({
    intensity: 0.8,                     // 降雨强度 (0-1)
    rainSpeed: 1.2,                     // 雨滴速度
    rainSize: 0.15,                     // 雨滴大小
    windDirection: new Vector2(0.2, 0), // 风向 (x=水平, y=垂直)
    rainAngle: 15.0,                    // 雨滴角度 (度)
    rainColor: 0x87ceeb,                // 雨滴颜色
    wetness: 0.5,                       // 湿润程度 (0-1)
    puddleIntensity: 0.3,               // 积水强度 (0-1)
    mistIntensity: 0.2,                 // 雨雾强度 (0-1)
    enableLighting: true,               // 启用闪电
    lightningFrequency: 0.1,            // 闪电频率
    lightningColor: new Vector3(1.0, 0.9, 0.8) // 闪电颜色
});
```

## 📱 性能优化

### 移动设备优化

```javascript
// 检测移动设备并降低质量
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const weatherManager = new WeatherManager({
    enableTransitions: !isMobile, // 移动设备禁用过渡
    transitionSpeed: isMobile ? 2.0 : 1.0, // 移动设备加速过渡
    effectOptions: {
        rain: {
            intensity: isMobile ? 0.4 : 0.6, // 降低移动设备的雨强度
            enableLighting: !isMobile         // 移动设备禁用闪电
        }
    }
});
```

### 动态质量调整

```javascript
// 根据帧率动态调整质量
let frameCount = 0;
let lastTime = performance.now();

function checkPerformance() {
    frameCount++;
    const now = performance.now();
    
    if (now - lastTime >= 1000) { // 每秒检查一次
        const fps = frameCount * 1000 / (now - lastTime);
        
        if (fps < 30) {
            // 降低质量
            if (weatherManager.getCurrentWeather().includes('rain')) {
                weatherManager.effects.rain.enableLighting = false;
            }
        }
        
        frameCount = 0;
        lastTime = now;
    }
}
```

## 🎨 样式自定义

### 创建自定义天气预设

```javascript
// 扩展WeatherManager的预设
weatherManager.weatherPresets.customStorm = {
    name: '超强暴风雨',
    sky: { cloudiness: 2.5, intensity: 2.0 },
    rain: { intensity: 1.0, preset: 'storm' },
    snow: { density: 0 },
    fog: { density: 0.6 }
};

// 使用自定义预设
weatherManager.setWeather('customStorm');
```

### 颜色主题

```javascript
// 冷色调雨天
rainfallEffect.rainColor = new THREE.Color(0.4, 0.6, 0.9);
weatherManager.effects.sky.colorOverlay.set(0.8, 0.9, 1.0);
weatherManager.effects.sky.colorOverlayStrength = 0.3;

// 暖色调雪天  
weatherManager.effects.snow.snowColor = new THREE.Color(1.0, 0.95, 0.8);
```

## 🚀 集成示例

### 与GUI集成

```javascript
import { Pane } from 'tweakpane';

const pane = new Pane();
const weatherFolder = pane.addFolder({ title: '天气控制' });

// 天气选择
weatherFolder.addBinding({ weather: 'clear' }, 'weather', {
    label: '天气类型',
    options: {
        '晴天': 'clear',
        '雨天': 'rain', 
        '雪天': 'snow',
        '暴风雨': 'storm'
    }
}).on('change', (e) => {
    weatherManager.setWeather(e.value);
});

// 降雨参数
const rainFolder = weatherFolder.addFolder({ title: '降雨设置' });
rainFolder.addBinding(rainfallEffect, 'intensity', { min: 0, max: 1 });
rainFolder.addBinding(rainfallEffect, 'rainSpeed', { min: 0.1, max: 3.0 });
```

### 与音效系统集成

```javascript
// 天气变化时触发音效
class WeatherAudioManager {
    constructor(weatherManager) {
        this.weatherManager = weatherManager;
        this.currentWeather = null;
        
        // 监听天气变化
        setInterval(() => {
            const weather = weatherManager.getCurrentWeather();
            if (weather !== this.currentWeather) {
                this.onWeatherChanged(this.currentWeather, weather);
                this.currentWeather = weather;
            }
        }, 100);
    }
    
    onWeatherChanged(from, to) {
        // 停止旧音效
        this.stopWeatherAudio(from);
        
        // 播放新音效
        this.playWeatherAudio(to);
    }
    
    playWeatherAudio(weather) {
        switch(weather) {
            case 'rain':
            case 'heavyRain':
                this.playAudio('rain.mp3', true); // 循环播放
                break;
            case 'storm':
                this.playAudio('thunder.mp3');
                this.playAudio('rain.mp3', true);
                break;
            case 'snow':
                this.playAudio('wind.mp3', true);
                break;
        }
    }
    
    stopWeatherAudio(weather) {
        // 停止相关音效
    }
    
    playAudio(filename, loop = false) {
        // 播放音频文件
    }
}

const audioManager = new WeatherAudioManager(weatherManager);
```

## 📚 更多资源

- 查看 `manual/content/demos/utility/rainfall.zh.md` 了解降雨效果详情
- 查看 `manual/content/demos/utility/weather-system.zh.md` 了解天气管理器详情  
- 运行 `manual/assets/js/src/demos/rainfall.js` 体验降雨效果演示
- 运行 `manual/assets/js/src/demos/weather-system.js` 体验天气管理器演示

## 🐛 故障排除

### 常见问题

1. **效果不显示**
   - 确保已正确添加到后处理管线
   - 检查混合模式是否合适
   - 验证效果的opacity是否为0

2. **性能问题**
   - 降低降雨强度
   - 禁用闪电效果
   - 减少采样步数

3. **过渡不平滑**
   - 增加过渡速度
   - 确保enableTransitions为true
   - 检查目标天气是否存在

### 调试技巧

```javascript
// 启用调试信息
console.log('当前天气:', weatherManager.getCurrentWeather());
console.log('活跃效果:', weatherManager.getEffects().map(e => e.name));
console.log('过渡状态:', weatherManager.isTransitioning());

// 监控性能
const stats = new Stats();
document.body.appendChild(stats.dom);
```

享受创建动态天气系统的乐趣！🌈
