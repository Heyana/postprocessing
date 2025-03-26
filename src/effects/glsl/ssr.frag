uniform sampler2D tDiffuse;
uniform sampler2D tSSR;
uniform sampler2D tNormal;
uniform float opacity;

varying vec2 vUv;

void main() {
    // 获取原始场景颜色
    vec4 sceneColor = texture2D(tDiffuse, vUv);
    
    // 获取SSR渲染的结果
    vec4 ssrColor = texture2D(tSSR, vUv);
    
    // 获取法线信息，用于判断是否应该应用反射
    vec4 normalData = texture2D(tNormal, vUv);
    vec3 normal = normalize(normalData.rgb * 2.0 - 1.0);
    
    // 计算反射因子
    float reflectionFactor = opacity;
    
    // 如果法线为零，表示这是背景，不应用反射
    if (length(normal) < 0.1) {
        reflectionFactor = 0.0;
    }
    
    // 基于法线方向计算菲涅尔效应（观察角度越斜，反射越强）
    // 通过计算视线方向（总是指向屏幕）和法线的夹角来实现
    float viewDotNormal = abs(normal.z); // z方向是指向相机的方向
    float fresnel = pow(1.0 - viewDotNormal, 5.0);
    
    // 将菲涅尔效应与基础反射因子结合
    reflectionFactor *= mix(0.5, 1.0, fresnel);
    
    // 应用SSR颜色的alpha值来调整反射强度
    reflectionFactor *= ssrColor.a;
    
    // 混合原始场景颜色和SSR结果
    gl_FragColor = mix(sceneColor, vec4(ssrColor.rgb, 1.0), reflectionFactor);
} 