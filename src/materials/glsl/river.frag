// 河流材质片段着色器
// 直接基于"Where the River Goes"着色器实现

uniform float time;
uniform sampler2D flowMap;
uniform sampler2D normalMap;
uniform sampler2D foamMap;
uniform float flowSpeed;
uniform vec3 waterColor;
uniform float transparency;
uniform float foamIntensity;
uniform float waterDepth;
uniform vec2 textureSize;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;

// 来自顶点着色器的数据
varying vec2 vUv;
varying vec3 vPosition;       // 模型空间位置
varying vec3 vNormal;
varying vec3 vWorldPosition;  // 世界空间位置
varying vec3 vViewDirection;
varying mat3 vNormalMatrix;

// 常量定义
#define MOD2 vec2(4.438975, 3.972973)
#define FOAM_ENABLED 1

// 哈希函数 - 直接从原始着色器复制
float Hash(float p) {
    vec2 p2 = fract(vec2(p) * MOD2);
    p2 += dot(p2.yx, p2.xy + 19.19);
    return fract(p2.x * p2.y);
}

// 平滑噪声 - 直接从原始着色器复制
float SmoothNoise(in vec2 o) {
    vec2 p = floor(o);
    vec2 f = fract(o);
        
    float n = p.x + p.y * 57.0;

    float a = Hash(n + 0.0);
    float b = Hash(n + 1.0);
    float c = Hash(n + 57.0);
    float d = Hash(n + 58.0);
    
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    
    vec2 t = 3.0 * f2 - 2.0 * f3;
    
    float u = t.x;
    float v = t.y;

    float res = a + (b-a)*u + (c-a)*v + (a-b+d-c)*u*v;
    
    return res;
}

// FBM - 直接从原始着色器复制
float FBM(vec2 p, float ps) {
    float f = 0.0;
    float tot = 0.0;
    float a = 1.0;
    for(int i=0; i<5; i++) {
        f += SmoothNoise(p) * a;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

// 带梯度的噪声 - 直接从原始着色器复制
vec3 SmoothNoise_DXY(in vec2 o) {
    vec2 p = floor(o);
    vec2 f = fract(o);
        
    float n = p.x + p.y * 57.0;

    float a = Hash(n + 0.0);
    float b = Hash(n + 1.0);
    float c = Hash(n + 57.0);
    float d = Hash(n + 58.0);
    
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    
    vec2 t = 3.0 * f2 - 2.0 * f3;
    vec2 dt = 6.0 * f - 6.0 * f2;
    
    float u = t.x;
    float v = t.y;
    float du = dt.x;    
    float dv = dt.y;    

    float res = a + (b-a)*u + (c-a)*v + (a-b+d-c)*u*v;
    
    float dx = (b-a)*du + (a-b+d-c)*du*v;
    float dy = (c-a)*dv + (a-b+d-c)*u*dv;
    
    return vec3(dx, dy, res);
}

// 带梯度的FBM - 直接从原始着色器复制
vec3 FBM_DXY(vec2 p, vec2 flow, float ps, float df) {
    vec3 f = vec3(0.0);
    float tot = 0.0;
    float a = 1.0;
    for(int i=0; i<4; i++) {
        p += flow;
        flow *= -0.75; // 每个八度反转流向
        vec3 v = SmoothNoise_DXY(p);
        f += v * a;
        p += v.xy * df;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

// 获取河流蜿蜒 - 使用模型坐标
float GetRiverMeander(const float x) {
    return sin(x * 0.3) * 1.5;
}

float GetRiverMeanderDx(const float x) {
    return cos(x * 0.3) * 1.5 * 0.3;
}

// 获取河床偏移 - 使用模型坐标
float GetRiverBedOffset(const vec3 vPos) {
    float fRiverBedDepth = 0.3 + (0.5 + 0.5 * sin(vPos.x * 0.001 + 3.0)) * 0.4;
    float fRiverBedWidth = 2.0 + cos(vPos.x * 0.1) * 1.0;
    
    float fRiverBedAmount = smoothstep(fRiverBedWidth, fRiverBedWidth * 0.5, abs(vPos.z - GetRiverMeander(vPos.x)));
        
    return fRiverBedAmount * fRiverBedDepth;    
}

// 获取基础水流 - 使用模型坐标
vec2 GetBaseFlow(const vec2 vPos) {
    return vec2(1.0, GetRiverMeanderDx(vPos.x));
}

// 获取水流距离 - 使用模型坐标
float GetFlowDistance(const vec2 vPos) {
    float riverMeander = GetRiverMeander(vPos.x);
    float dist = abs(vPos.y - riverMeander);
    float riverWidth = 2.0 + cos(vPos.x * 0.1) * 1.0;
    return smoothstep(riverWidth, 0.0, dist);
}

// 获取梯度 - 使用模型坐标
vec2 GetGradient(const vec2 vPos) {
    vec2 vDelta = vec2(0.01, 0.00);
    float dx = GetFlowDistance(vPos + vDelta.xy) - GetFlowDistance(vPos - vDelta.xy);
    float dy = GetFlowDistance(vPos + vDelta.yx) - GetFlowDistance(vPos - vDelta.yx);
    return vec2(dx, dy);
}

// 获取流速 - 使用模型坐标
vec3 GetFlowRate(const vec2 vPos) {
    vec2 vBaseFlow = GetBaseFlow(vPos);
    vec2 vFlow = vBaseFlow;
    
    float fFoam = 0.0;
    float fDist = GetFlowDistance(vPos);
    vec2 vGradient = GetGradient(vPos);
    
    vFlow += -vGradient * 40.0 / (1.0 + fDist * 1.5);
    vFlow *= 1.0 / (1.0 + fDist * 0.5);

    float fBehindObstacle = 0.5 - dot(normalize(vGradient), -normalize(vFlow)) * 0.5;
    float fSlowDist = clamp(fDist * 5.0, 0.0, 1.0);
    fSlowDist = mix(fSlowDist * 0.9 + 0.1, 1.0, fBehindObstacle * 0.9);
    fSlowDist = 0.5 + fSlowDist * 0.5;
    vFlow *= fSlowDist;
    
    // 泡沫计算
    float fFoamScale1 = 0.5;
    float fFoamCutoff = 0.4;
    float fFoamScale2 = 0.35;
    
    fFoam = abs(length(vFlow)) * fFoamScale1;
    fFoam += clamp(fFoam - fFoamCutoff, 0.0, 1.0);
    fFoam = 1.0 - pow(fDist, fFoam * fFoamScale2);
    
    return vec3(vFlow * 0.6, fFoam);
}

// 采样水面法线
vec4 SampleWaterNormal(vec2 vUV, vec2 vFlowOffset, float fMag, float fFoam) {
    // 使用纹理或程序化生成法线
    vec4 normalSample = texture2D(normalMap, vUV + vFlowOffset);
    if(normalSample.r > 0.01 || normalSample.g > 0.01 || normalSample.b > 0.01) {
        vec3 normalFromMap = normalSample.rgb * 2.0 - 1.0;
        float fScale = max(0.25, 1.0 - fFoam * 5.0); // 减弱泡沫区域法线
        vec3 vBlended = mix(vec3(0.0, 1.0, 0.0), normalize(vec3(normalFromMap.x, fMag, normalFromMap.y)), fScale);
        return vec4(normalize(vBlended), normalSample.z * fScale);
    } else {
        vec2 vFilterWidth = max(abs(dFdx(vUV)), abs(dFdy(vUV)));
        float fFilterWidth = max(vFilterWidth.x, vFilterWidth.y);
        
        float fScale = (1.0 / (1.0 + fFilterWidth * fFilterWidth * 2000.0));
        float fGradientAscent = 0.25 + (fFoam * -1.5);
        vec3 dxy = FBM_DXY(vUV * 20.0, vFlowOffset * 20.0, 0.75 + fFoam * 0.25, fGradientAscent);
        fScale *= max(0.25, 1.0 - fFoam * 5.0); // 减弱泡沫区域法线
        vec3 vBlended = mix(vec3(0.0, 1.0, 0.0), normalize(vec3(dxy.x, fMag, dxy.y)), fScale);
        return vec4(normalize(vBlended), dxy.z * fScale);
    }
}

// 采样水面泡沫
float SampleWaterFoam(vec2 vUV, vec2 vFlowOffset, float fFoam) {
    vec4 foamSample = texture2D(foamMap, vUV + vFlowOffset * 0.5);
    if(foamSample.r > 0.01 || foamSample.g > 0.01 || foamSample.b > 0.01) {
        return foamSample.r;
    } else {
        float f = FBM_DXY(vUV * 30.0, vFlowOffset * 50.0, 0.8, -0.5).z;
        float fAmount = 0.2;
        f = max(0.0, (f - fAmount) / fAmount);
        return pow(0.5, f);
    }
}

// 采样流动法线
vec4 SampleFlowingNormal(const vec2 vUV, const vec2 vFlowRate, const float fFoam, const float time, out float fOutFoamTex) {
    float fMag = 2.5 / (1.0 + dot(vFlowRate, vFlowRate) * 5.0);
    float t0 = fract(time);
    float t1 = fract(time + 0.5);
    
    float i0 = floor(time);
    float i1 = floor(time + 0.5);
    
    float o0 = t0 - 0.5;
    float o1 = t1 - 0.5;
    
    vec2 vUV0 = vUV + vec2(Hash(i0), Hash(i0 + 42.0)) * 0.01;
    vec2 vUV1 = vUV + vec2(Hash(i1), Hash(i1 + 42.0)) * 0.01;
    
    vec4 sample0 = SampleWaterNormal(vUV0, vFlowRate * o0, fMag, fFoam);
    vec4 sample1 = SampleWaterNormal(vUV1, vFlowRate * o1, fMag, fFoam);

    float weight = abs(t0 - 0.5) * 2.0;

#if FOAM_ENABLED
    float foam0 = SampleWaterFoam(vUV0, vFlowRate * o0 * 0.25, fFoam);
    float foam1 = SampleWaterFoam(vUV1, vFlowRate * o1 * 0.25, fFoam);
    fOutFoamTex = mix(foam0, foam1, weight);
#else
    fOutFoamTex = 0.0;
#endif
    
    vec4 result = mix(sample0, sample1, weight);
    result.xyz = normalize(result.xyz);

    return result;
}

// 计算菲涅尔反射
vec3 GetFresnel(vec3 vView, vec3 vNormal, vec3 vR0, float fGloss) {
    float NdotV = max(0.0, dot(vView, vNormal));
    return vR0 + (vec3(1.0) - vR0) * pow(1.0 - NdotV, 5.0) * pow(fGloss, 20.0);
}

// 主函数
void main() {
    // 使用模型空间坐标而不是世界空间坐标
    vec2 modelPos = vec2(vPosition.x, vPosition.z);
    
    // 使用GetFlowRate获取流速和泡沫
    vec3 vFlowRateAndFoam = GetFlowRate(modelPos);
    vec2 vFlowRate = vFlowRateAndFoam.xy * flowSpeed;
    float fFoam = vFlowRateAndFoam.z * foamIntensity;
    
    // 时间缩放
    float scaledTime = time * 0.5;
    
    // 法线和泡沫采样 - 使用模型空间坐标
    float fWaterFoamTex = 0.0;
    vec4 vWaterNormalAndHeight = SampleFlowingNormal(modelPos, vFlowRate, fFoam, scaledTime, fWaterFoamTex);
    vec3 waterNormal = vWaterNormalAndHeight.xyz;
    
    // 转换法线到世界空间
    vec3 worldNormal = normalize(vNormalMatrix * waterNormal);
    
    // 光照计算
    float sunDiffuse = max(0.0, dot(worldNormal, sunDirection));
    vec3 halfVector = normalize(sunDirection + vViewDirection);
    float specular = pow(max(0.0, dot(worldNormal, halfVector)), 64.0);
    
    // 菲涅尔反射
    vec3 fresnelTerm = GetFresnel(vViewDirection, worldNormal, vec3(0.02), 0.95);
    
    // 反射方向
    vec3 reflectDir = reflect(-vViewDirection, worldNormal);
    
    // 环境反射 (天空)
    vec3 skyReflection = mix(skyColor, sunColor, pow(max(0.0, dot(reflectDir, sunDirection)), 8.0));
    
    // 水深计算 - 使用模型空间的流距离
    float depth = waterDepth * (1.0 - GetFlowDistance(modelPos));
    
    // 水颜色
    vec3 waterColorWithDepth = waterColor * (0.5 + 0.5 * depth);
    
    // 漫反射和环境光
    vec3 diffuseLight = sunColor * sunDiffuse * 0.5 + skyColor * 0.5;
    vec3 diffuseTerm = waterColorWithDepth * diffuseLight;
    
    // 镜面反射
    vec3 specularTerm = sunColor * specular * fresnelTerm;
    
    // 环境反射
    vec3 reflectionTerm = skyReflection * fresnelTerm;
    
    // 泡沫颜色
    vec3 foamColor = vec3(1.0) * (0.8 + 0.2 * sunDiffuse);
    
    // 泡沫强度调整
#if FOAM_ENABLED
    float foamStrength = fFoam * (1.0 - fWaterFoamTex);
#else
    float foamStrength = 0.0;
#endif
    
    // 最终颜色
    vec3 finalColor = mix(
        diffuseTerm + specularTerm + reflectionTerm,
        foamColor,
        foamStrength
    );
    
    // 水深衰减
    finalColor *= exp(-depth * 0.5);
    
    // 输出带透明度的颜色
    gl_FragColor = vec4(finalColor, transparency);
} 