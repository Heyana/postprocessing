uniform sampler2D noiseTexture;
uniform vec2 resolution;
uniform float time;
uniform int animateClouds;
uniform vec3 sunPosition;
uniform float intensity;
uniform float rayleighCoefficient;
uniform float mieCoefficient;
uniform float mieDirectionalG;
uniform float cloudiness;
uniform mat4 viewMatrix;
uniform float fov;  // 添加FOV参数
uniform float skyBlueness; // 添加天空蓝度参数
uniform float cloudAmount; // 添加云层数量参数
uniform float cloudScale; // 添加云层尺度参数
uniform float cloudThreshold; // 添加云层阈值参数

// 配置选项
#define VOLUMETRIC_LIGHT
//#define SPHERICAL_PROJECTION

// 云配置参数
#define cloudSpeed 0.02
#define cloudHeight 1600.0
#define cloudThickness 500.0

// 雾配置参数
#define fogDensity 0.00003

// 步进参数
#define volumetricCloudSteps 16
#define volumetricLightSteps 8
#define cloudShadowingSteps 12
#define volumetricLightShadowSteps 4

// 散射参数
const float sunBrightness = 3.0;
#define earthRadius 6371000.0
const float pi = 3.1415926535897932384626433832795;
const float rPi = 1.0 / pi;
const float hPi = pi * 0.5;
const float tau = pi * 2.0;
const float rLOG2 = 1.0 / log(2.0);

//////////////////////////////////////////////////////////////////

// Bayer抖动函数
float bayer2(vec2 a){
    a = floor(a);
    return fract(dot(a, vec2(.5, a.y * .75)));
}

#define bayer4(a)   (bayer2(.5*(a))*.25+bayer2(a))
#define bayer8(a)   (bayer4(.5*(a))*.25+bayer2(a))
#define bayer16(a)  (bayer8(.5*(a))*.25+bayer2(a))

// 射线球体相交
vec2 rsi(vec3 position, vec3 direction, float radius) {
    float PoD = dot(position, direction);
    float radiusSquared = radius * radius;

    float delta = PoD * PoD + radiusSquared - dot(position, position);
    if (delta < 0.0) return vec2(-1.0);
    delta = sqrt(delta);

    return -PoD + vec2(-delta, delta);
}

// 旋转矩阵
mat3 rotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    
    float xx = axis.x * axis.x;
    float yy = axis.y * axis.y;
    float zz = axis.z * axis.z;
    
    float xy = axis.x * axis.y;
    float xz = axis.x * axis.z;
    float zy = axis.z * axis.y;
    
    return mat3(oc * xx + c, oc * xy - axis.z * s, oc * xz + axis.y * s,
                oc * xy + axis.z * s, oc * yy + c, oc * zy - axis.x * s, 
                oc * xz - axis.y * s, oc * zy + axis.x * s, oc * zz + c);
}

// 位置结构体
struct positionStruct {
    vec2 texcoord;
    vec3 worldPosition;
    vec3 worldVector;
    vec3 sunVector;
};

vec3 sphereToCart(vec3 sphere) {
    vec2 c = cos(sphere.xy);
    vec2 s = sin(sphere.xy);
    
    return sphere.z * vec3(c.x * c.y, s.y, s.x * c.y);
}

vec3 calculateWorldSpacePosition(vec2 p) {
    p = p * 2.0 - 1.0;
    
    vec3 worldSpacePosition = vec3(p.x, p.y, 1.0);
    
    #ifdef SPHERICAL_PROJECTION
        worldSpacePosition = sphereToCart(worldSpacePosition * vec3(pi, hPi, 1.0));
    #endif
    
    return worldSpacePosition;
}

void gatherPositions(inout positionStruct pos, vec2 fragCoord, vec2 screenResolution) {
    pos.texcoord = fragCoord / screenResolution;
    
    // 设置世界位置和方向
    // 使用fov参数调整视图方向
    float fovFactor = tan(radians(fov * 0.5));
    vec2 screenPos = pos.texcoord * 2.0 - 1.0;
    vec3 viewDir = normalize(vec3(screenPos.x * resolution.x / resolution.y * fovFactor, screenPos.y * fovFactor, -1.0));
    
    vec4 worldDir = viewMatrix * vec4(viewDir, 0.0);
    pos.worldPosition = worldDir.xyz;
    pos.worldVector = normalize(pos.worldPosition);
    
    // 设置太阳向量
    pos.sunVector = normalize(sunPosition);
}

///////////////////////////////////////////////////////////////////////////////////

// 散射相关计算
#define d0(x) (abs(x) + 1e-8)
#define d02(x) (abs(x) + 1e-3)

vec3 mieCoeffVector;
vec3 rayleighCoeffVector;
vec3 totalCoeff;

void initScattering() {
    rayleighCoeffVector = vec3(0.27, 0.5, 1.0 + skyBlueness) * rayleighCoefficient * 1e-5;
    mieCoeffVector = vec3(0.5) * mieCoefficient * 1e-6;
    totalCoeff = rayleighCoeffVector + mieCoeffVector;
}

vec3 scatter(vec3 coeff, float depth){
    return coeff * depth;
}

vec3 absorb(vec3 coeff, float depth){
    return exp2(scatter(coeff, -depth));
}

float calcParticleThickness(float depth){
    depth = depth * 2.0;
    depth = max(depth + 0.01, 0.01);
    depth = 1.0 / depth;
    
    return 100000.0 * depth;   
}

float calcParticleThicknessConst(const float depth){
    return 100000.0 / max(depth * 2.0 - 0.01, 0.01);   
}

float rayleighPhase(float x){
    return 0.375 * (1.0 + x*x);
}

float hgPhase(float x, float g) {
    float g2 = g*g;
    return 0.25 * ((1.0 - g2) * pow(1.0 + g2 - 2.0*g*x, -1.5));
}

float miePhaseSky(float x, float depth) {
    return hgPhase(x, exp2(-0.000003 * depth));
}

float powder(float od) {
    return 1.0 - exp2(-od * 2.0);
}

float calculateScatterIntergral(float opticalDepth, float coeff){
    float a = -coeff * rLOG2;
    float b = -1.0 / coeff;
    float c = 1.0 / coeff;

    return exp2(a * opticalDepth) * b + c;
}

vec3 calculateScatterIntergral(float opticalDepth, vec3 coeff){
    vec3 a = -coeff * rLOG2;
    vec3 b = -1.0 / coeff;
    vec3 c = 1.0 / coeff;

    return exp2(a * opticalDepth) * b + c;
}

// 大气散射计算
vec3 calcAtmosphericScatter(positionStruct pos, out vec3 absorbLight){
    const float ln2 = log(2.0);
    
    float lDotW = dot(pos.sunVector, pos.worldVector);
    float lDotU = dot(pos.sunVector, vec3(0.0, 1.0, 0.0));
    float uDotW = dot(vec3(0.0, 1.0, 0.0), pos.worldVector);
    
    float opticalDepth = calcParticleThickness(uDotW);
    float opticalDepthLight = calcParticleThickness(lDotU);
    
    vec3 scatterView = scatter(totalCoeff, opticalDepth);
    vec3 absorbView = absorb(totalCoeff, opticalDepth);
    
    vec3 scatterLight = scatter(totalCoeff, opticalDepthLight);
    absorbLight = absorb(totalCoeff, opticalDepthLight);
        
    vec3 absorbSun = abs(absorbLight - absorbView) / d0((scatterLight - scatterView) * ln2);
    
    vec3 mieScatter = scatter(mieCoeffVector, opticalDepth) * miePhaseSky(lDotW, opticalDepth);
    vec3 rayleighScatter = scatter(rayleighCoeffVector, opticalDepth) * rayleighPhase(lDotW);
    
    vec3 scatterSun = mieScatter + rayleighScatter;
    
    vec3 sunSpot = smoothstep(0.9999, 0.99993, lDotW) * absorbView * sunBrightness;
    
    return (scatterSun * absorbSun + sunSpot) * sunBrightness * intensity;
}

vec3 calcAtmosphericScatterTop(positionStruct pos){
    const float ln2 = log(2.0);
    
    float lDotU = dot(pos.sunVector, vec3(0.0, 1.0, 0.0));
    
    float opticalDepth = calcParticleThicknessConst(1.0);
    float opticalDepthLight = calcParticleThickness(lDotU);
    
    vec3 scatterView = scatter(totalCoeff, opticalDepth);
    vec3 absorbView = absorb(totalCoeff, opticalDepth);
    
    vec3 scatterLight = scatter(totalCoeff, opticalDepthLight);
    vec3 absorbLight = absorb(totalCoeff, opticalDepthLight);
    
    vec3 absorbSun = d02(absorbLight - absorbView) / d02((scatterLight - scatterView) * ln2);
    
    vec3 mieScatter = scatter(mieCoeffVector, opticalDepth) * 0.25;
    vec3 rayleighScatter = scatter(rayleighCoeffVector, opticalDepth) * 0.375;
    
    vec3 scatterSun = mieScatter + rayleighScatter;
    
    return (scatterSun * absorbSun) * sunBrightness * intensity;
}

// 3D噪声函数
float Get3DNoise(vec3 pos) {
    float p = floor(pos.z);
    float f = pos.z - p;
    
    const float invNoiseRes = 1.0 / 64.0;
    
    float zStretch = 17.0 * invNoiseRes;
    
    vec2 coord = pos.xy * invNoiseRes + (p * zStretch);
    
    vec2 noise = vec2(texture2D(noiseTexture, coord).x,
                      texture2D(noiseTexture, coord + zStretch).x);
    
    return mix(noise.x, noise.y, f);
}

// 云计算
float getClouds(vec3 p) {
    p = vec3(p.x, length(p + vec3(0.0, earthRadius, 0.0)) - earthRadius, p.z);
    
    if (p.y < cloudHeight || p.y > cloudHeight + cloudThickness)
        return 0.0;
    
    float timeOffset = time * cloudSpeed * float(animateClouds);
    vec3 movement = vec3(timeOffset, 0.0, timeOffset);
    
    vec3 cloudCoord = (p * 0.001 * cloudScale) + movement;
    
    float noise = Get3DNoise(cloudCoord) * 0.5;
    noise += Get3DNoise(cloudCoord * 2.0 + movement) * 0.25;
    noise += Get3DNoise(cloudCoord * 7.0 - movement) * 0.125;
    noise += Get3DNoise((cloudCoord + movement) * 16.0) * 0.0625;
    
    const float top = 0.004;
    const float bottom = 0.01;
    
    float horizonHeight = p.y - cloudHeight;
    float treshHold = (1.0 - exp2(-bottom * horizonHeight)) * exp2(-top * horizonHeight);
    
    float clouds = smoothstep(0.55 - cloudThreshold * 0.1, 0.6 + cloudThreshold * 0.1, noise);
    clouds *= treshHold;
    
    return clouds * cloudiness * 0.05 * cloudAmount;
}

// 云阴影
float getCloudShadow(vec3 p, positionStruct pos) {
    const int steps = volumetricLightShadowSteps;
    float rSteps = cloudThickness / float(steps) / abs(pos.sunVector.y);
    
    vec3 increment = pos.sunVector * rSteps;
    vec3 position = pos.sunVector * (cloudHeight - p.y) / pos.sunVector.y + p;
    
    float transmittance = 0.0;
    
    for (int i = 0; i < steps; i++, position += increment) {
        transmittance += getClouds(position);
    }
    
    return exp2(-transmittance * rSteps);
}

// 太阳可见性
float getSunVisibility(vec3 p, positionStruct pos) {
    const int steps = cloudShadowingSteps;
    const float rSteps = cloudThickness / float(steps);
    
    vec3 increment = pos.sunVector * rSteps;
    vec3 position = increment * 0.5 + p;
    
    float transmittance = 0.0;
    
    for (int i = 0; i < steps; i++, position += increment) {
        transmittance += getClouds(position);
    }
    
    return exp2(-transmittance * rSteps);
}

// 相位函数
float phase2Lobes(float x) {
    float m = 0.6;
    float gm = mieDirectionalG;
    
    float lobe1 = hgPhase(x, 0.8 * gm);
    float lobe2 = hgPhase(x, -0.5 * gm);
    
    return mix(lobe2, lobe1, m);
}

// 体积云散射
vec3 getVolumetricCloudsScattering(float opticalDepth, float phase, vec3 p, vec3 sunColor, vec3 skyLight, positionStruct pos) {
    float intergal = calculateScatterIntergral(opticalDepth, 1.11);
    
    float beersPowder = powder(opticalDepth * log(2.0));
    
    vec3 sunlighting = (sunColor * getSunVisibility(p, pos) * beersPowder) * phase * hPi * sunBrightness;
    vec3 skylighting = skyLight * 0.25 * rPi;
    
    return (sunlighting + skylighting) * intergal * pi;
}

// 高度雾光学深度
float getHeightFogOD(float height) {
    const float falloff = 0.001;
    
    return exp2(-height * falloff) * fogDensity;
}

// 体积光散射
vec3 getVolumetricLightScattering(float opticalDepth, float phase, vec3 p, vec3 sunColor, vec3 skyLight, positionStruct pos) {
    float intergal = calculateScatterIntergral(opticalDepth, 1.11);
    
    vec3 sunlighting = sunColor * phase * hPi * sunBrightness;
    sunlighting *= getCloudShadow(p, pos);
    vec3 skylighting = skyLight * 0.25 * rPi;
    
    return (sunlighting + skylighting) * intergal * pi;
}

// 体积光计算
vec3 calculateVolumetricLight(positionStruct pos, vec3 color, float dither, vec3 sunColor) {
    #ifndef VOLUMETRIC_LIGHT
        return color;
    #endif
    
    const int steps = volumetricLightSteps;
    const float iSteps = 1.0 / float(steps);
    
    vec3 increment = pos.worldVector * cloudHeight / clamp(pos.worldVector.y, 0.1, 1.0) * iSteps;
    vec3 rayPosition = increment * dither;
    
    float stepLength = length(increment);
    
    vec3 scattering = vec3(0.0);
    vec3 transmittance = vec3(1.0);
    
    float lDotW = dot(pos.sunVector, pos.worldVector);
    float phase = hgPhase(lDotW, 0.8);
    
    vec3 skyLight = calcAtmosphericScatterTop(pos);
    
    for (int i = 0; i < steps; i++, rayPosition += increment) {
        float opticalDepth = getHeightFogOD(rayPosition.y) * stepLength;
        
        if (opticalDepth <= 0.0)
            continue;
        
        scattering += getVolumetricLightScattering(opticalDepth, phase, rayPosition, sunColor, skyLight, pos) * transmittance;
        transmittance *= exp2(-opticalDepth);
    }
    
    return color * transmittance + scattering;
}

// 体积云计算
vec3 calculateVolumetricClouds(positionStruct pos, vec3 color, float dither, vec3 sunColor) {
    if (pos.worldVector.y < 0.0)
        return color;
    
    const int steps = volumetricCloudSteps;
    const float iSteps = 1.0 / float(steps);
    
    float bottomSphere = rsi(vec3(0.0, 1.0, 0.0) * earthRadius, pos.worldVector, earthRadius + cloudHeight).y;
    float topSphere = rsi(vec3(0.0, 1.0, 0.0) * earthRadius, pos.worldVector, earthRadius + cloudHeight + cloudThickness).y;
    
    if (bottomSphere < 0.0 || topSphere < 0.0)
        return color;
    
    vec3 startPosition = pos.worldVector * bottomSphere;
    vec3 endPosition = pos.worldVector * topSphere;
    
    vec3 increment = (endPosition - startPosition) * iSteps;
    vec3 cloudPosition = increment * dither + startPosition;
    
    float stepLength = length(increment);
    
    vec3 scattering = vec3(0.0);
    float transmittance = 1.0;
    
    float lDotW = dot(pos.sunVector, pos.worldVector);
    float phase = phase2Lobes(lDotW);
    
    vec3 skyLight = calcAtmosphericScatterTop(pos);
    
    for (int i = 0; i < steps; i++, cloudPosition += increment) {
        float opticalDepth = getClouds(cloudPosition) * stepLength;
        
        if (opticalDepth <= 0.0)
            continue;
        
        scattering += getVolumetricCloudsScattering(opticalDepth, phase, cloudPosition, sunColor, skyLight, pos) * transmittance;
        transmittance *= exp2(-opticalDepth);
    }
    
    return mix(color * transmittance + scattering, color, clamp(length(startPosition) * 0.00001, 0.0, 1.0));
}

// 色调映射
vec3 robobo1221Tonemap(vec3 color) {
    #define rTOperator(x) (x / sqrt(x*x+1.0))
    
    float l = length(color);
    
    color = mix(color, color * 0.5, l / (l+1.0));
    color = rTOperator(color);
    
    return color;
}

// 主函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    positionStruct pos;
    gatherPositions(pos, uv * resolution, resolution);
    
    float dither = bayer16(uv * resolution);
    
    // 初始化散射参数
    initScattering();
    
    vec3 lightAbsorb;
    
    vec3 color = vec3(0.0);
    color = calcAtmosphericScatter(pos, lightAbsorb);
    color = calculateVolumetricClouds(pos, color, dither, lightAbsorb);
    color = calculateVolumetricLight(pos, color, dither, lightAbsorb);
    
    color = robobo1221Tonemap(color * 0.5);
    color = pow(color, vec3(1.0 / 2.2)); // gamma校正
    
    // 使用深度缓冲决定是否绘制天空
    #ifdef USE_DEPTH
        // 读取深度值
        float depth = texture2D(depthBuffer, uv).r;
        // 在这里我们仅在深度值为1.0（远平面）的地方绘制天空
        float skyMask = step(0.9999, depth);
        // 使用透明度为 skyMask 的方式进行混合
        outputColor = mix(inputColor, vec4(color, 1.0), skyMask);
    #else
        // 如果没有深度信息，则按照固定透明度混合
        outputColor = mix(inputColor, vec4(color, 1.0), 0.9);
    #endif
} 