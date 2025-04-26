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
// 添加采样步数uniform变量
uniform int volumetricCloudStepsUniform;
uniform int volumetricLightStepsUniform;
uniform int cloudShadowingStepsUniform;
uniform int volumetricLightShadowStepsUniform;

// 添加夜空相关参数
uniform int enableStars;
uniform float starIntensity;
uniform float starDensity;
uniform float starSize; // 星星大小参数
uniform float starMovementSpeed; // 星星移动速度参数
uniform int enableMoon;
uniform vec3 moonPosition;
uniform float moonSize;
uniform float moonIntensity;
uniform int enableAurora;
uniform float auroraIntensity;
uniform vec3 auroraColor;
uniform float nightIntensity;

// 配置选项
#define VOLUMETRIC_LIGHT
//#define SPHERICAL_PROJECTION

// 云配置参数
#define cloudSpeed 0.02
#define cloudHeight 1600.0
#define cloudThickness 500.0

// 雾配置参数
#define fogDensity 0.00003

// 步进参数 - 使用默认值，但实际在运行时会使用uniform变量值
#define volumetricCloudSteps (volumetricCloudStepsUniform > 0 ? volumetricCloudStepsUniform : 16)
#define volumetricLightSteps (volumetricLightStepsUniform > 0 ? volumetricLightStepsUniform : 8)
#define cloudShadowingSteps (cloudShadowingStepsUniform > 0 ? cloudShadowingStepsUniform : 12)
#define volumetricLightShadowSteps (volumetricLightShadowStepsUniform > 0 ? volumetricLightShadowStepsUniform : 4)

// 星空配置参数
#define STAR_BRIGHTNESS 1.5
#define STAR_FLICKER_SPEED 0.75
#define STAR_LAYERS 4  // 定义星星的噪声层数，类似云层

// 极光配置参数
#define AURORA_STEPS 50
#define AURORA_SPEED 0.02      // 降低动画速度
#define AURORA_HEIGHT 0.03    // 大幅降低高度移动速度
#define AURORA_OFFSET 0.006

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
    
    // 使用太阳高度调整散射强度，当太阳位于地平线以下时，减弱散射
    float dayFactor = smoothstep(-0.15, 0.15, lDotU);
    vec3 finalScatter = (scatterSun * absorbSun + sunSpot) * sunBrightness * intensity;
    
    // 当太阳在地平线下，根据nightIntensity调整夜空亮度
    float nightFactor = (1.0 - dayFactor) * nightIntensity;
    finalScatter = mix(finalScatter * dayFactor, vec3(nightFactor * 0.02), 1.0 - dayFactor);
    
    return finalScatter;
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
    
    // 使用太阳高度调整散射强度
    float dayFactor = smoothstep(-0.15, 0.15, lDotU);
    vec3 finalScatter = (scatterSun * absorbSun) * sunBrightness * intensity;
    
    // 当太阳在地平线下，根据nightIntensity调整夜空亮度
    float nightFactor = (1.0 - dayFactor) * nightIntensity;
    finalScatter = mix(finalScatter * dayFactor, vec3(nightFactor * 0.02), 1.0 - dayFactor);
    
    return finalScatter;
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
    float rSteps = cloudThickness / float(volumetricLightShadowSteps) / abs(pos.sunVector.y);
    
    vec3 increment = pos.sunVector * rSteps;
    vec3 position = pos.sunVector * (cloudHeight - p.y) / pos.sunVector.y + p;
    
    float transmittance = 0.0;
    
    for (int i = 0; i < volumetricLightShadowSteps; i++, position += increment) {
        transmittance += getClouds(position);
    }
    
    return exp2(-transmittance * rSteps);
}

// 太阳可见性
float getSunVisibility(vec3 p, positionStruct pos) {
    float rSteps = cloudThickness / float(cloudShadowingSteps);
    
    vec3 increment = pos.sunVector * rSteps;
    vec3 position = increment * 0.5 + p;
    
    float transmittance = 0.0;
    
    for (int i = 0; i < cloudShadowingSteps; i++, position += increment) {
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
    
    float iSteps = 1.0 / float(volumetricLightSteps);
    
    vec3 increment = pos.worldVector * cloudHeight / clamp(pos.worldVector.y, 0.1, 1.0) * iSteps;
    vec3 rayPosition = increment * dither;
    
    float stepLength = length(increment);
    
    vec3 scattering = vec3(0.0);
    vec3 transmittance = vec3(1.0);
    
    float lDotW = dot(pos.sunVector, pos.worldVector);
    float phase = hgPhase(lDotW, 0.8);
    
    vec3 skyLight = calcAtmosphericScatterTop(pos);
    
    for (int i = 0; i < volumetricLightSteps; i++, rayPosition += increment) {
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
    
    float iSteps = 1.0 / float(volumetricCloudSteps);
    
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
    
    for (int i = 0; i < volumetricCloudSteps; i++, cloudPosition += increment) {
        float opticalDepth = getClouds(cloudPosition) * stepLength;
        
        if (opticalDepth <= 0.0)
            continue;
        
        scattering += getVolumetricCloudsScattering(opticalDepth, phase, cloudPosition, sunColor, skyLight, pos) * transmittance;
        transmittance *= exp2(-opticalDepth);
    }
    
    return mix(color * transmittance + scattering, color, clamp(length(startPosition) * 0.00001, 0.0, 1.0));
}

// 哈希函数用于星空生成
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 233.53));
    p += dot(p, p + 23.234);
    return fract(p.x * p.y);
}

// 改进的哈希函数，用于点状星星生成
float hash21Better(vec2 p) {
    p = fract(p * vec2(123.34, 345.67));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

// 辅助函数 - 三角噪声
float tri(float x) {
    return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

// 二维三角噪声
vec2 tri2(vec2 p) {
    return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x)));
}

// 点状星星函数 - 创建一个单一的星星点
float star(vec2 uv, float flare) {
    float d = length(uv);
    float m = 0.05 / d;
    
    // 中心亮点
    float rays = max(0.0, 1.0 - abs(uv.x * uv.y * 1000.0));
    m += rays * flare;
    
    // 星星大小衰减
    m *= smoothstep(0.3, 0.0, d);
    
    return m;
}

// 星空生成函数 - 重新设计为使用点状星星
vec3 generateStars(vec3 dir, float time) {
    if (enableStars == 0) return vec3(0.0);
    
    // 确保只在天空上部生成星星
    if (dir.y < 0.02) return vec3(0.0);
    
    // 使用方向向量生成球面UV坐标
    vec2 uv = vec2(
        atan(dir.z, dir.x) / (2.0 * pi) + 0.5,
        asin(dir.y) / pi + 0.5
    );
    
    // 计算云层移动偏移量，与云层使用相同的移动速度，确保有效移动
    float timeOffset = time * cloudSpeed * float(animateClouds);
    vec2 movement = vec2(timeOffset, timeOffset * 0.5) * starMovementSpeed;
    
    // 将天空分割成网格，每个单元生成一个星星
    float cellSize = 0.02 * (1.0 / starDensity); // 控制星星密度
    vec2 cellUV = fract(uv / cellSize);          // 单元内坐标 [0,1]
    vec2 cellID = floor(uv / cellSize);          // 单元ID
    
    vec3 starColor = vec3(0.0);
    
    // 遍历当前单元周围的单元，以确保边界附近的星星也能看到
    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {
            // 当前检查的单元格ID
            vec2 offset = vec2(x, y);
            vec2 neighborCellID = cellID + offset;
            
            // 将timeOffset加入哈希输入，使星星移动
            vec2 hashInput = neighborCellID + movement;
            
            // 使用改进的哈希函数来决定是否在该单元格中放置星星
            float starRandom = hash21Better(hashInput); 
            
            // 星星的概率 - 降低阈值使星星更容易出现
            if(starRandom > (1.0 - 0.015 * starDensity)) {
                // 根据单元格和随机值决定星星在单元格内的位置
                vec2 starPosition = offset + vec2(
                    hash21(neighborCellID + 2.45),
                    hash21(neighborCellID + 1.68)
                );
                
                // 计算当前像素到星星的距离
                vec2 fragToStar = starPosition - cellUV;
                
                // 星星亮度和大小因子
                float brightness = starRandom * 0.6 + 0.4; // 确保某些星星更亮
                
                // 星星大小 - 由starSize控制
                float starScale = (0.006 + starRandom * 0.004) * starSize;
                
                // 星星闪烁
                float flicker = sin(time * STAR_FLICKER_SPEED * starRandom) * 0.15 + 0.85;
                
                // 渲染点状星星
                float s = star(fragToStar / starScale, starRandom * 1.5) * brightness * flicker;
                
                // 根据随机值决定星星颜色
                vec3 color = mix(
                    vec3(0.9, 0.9, 1.0),  // 白色/蓝色星星
                    vec3(1.0, 0.8, 0.6),  // 黄色/红色星星
                    hash21(neighborCellID + 7.89)
                );
                
                // 添加一些特殊颜色的星星
                if(starRandom > 0.995) {
                    // 红色恒星
                    color = vec3(1.0, 0.5, 0.5);
                } else if(starRandom < 0.005) {
                    // 蓝色恒星
                    color = vec3(0.5, 0.7, 1.0);
                }
                
                // 累加星星颜色
                starColor += color * s * starIntensity * STAR_BRIGHTNESS;
            }
        }
    }
    
    return starColor;
}

// 月亮生成函数
vec3 generateMoon(positionStruct pos) {
    if (enableMoon == 0) return vec3(0.0);
    
    // 月亮方向
    vec3 moonDir = normalize(moonPosition);
    
    // 计算视线方向与月亮方向的夹角余弦值
    float cosAngle = dot(pos.worldVector, moonDir);
    
    // 月亮的大小和亮度
    float moonRadius = moonSize;
    float moonGlow = smoothstep(0.9995, 0.9999, cosAngle) * moonIntensity;
    
    // 月亮的主体
    float moonDisk = smoothstep(cos(moonRadius), cos(moonRadius * 0.98), cosAngle);
    
    // 月球表面细节
    vec3 moonColor = vec3(1.0, 0.98, 0.9);  // 略带黄色的月亮
    
    // 月晕效果
    float halo = 0.5 * pow(max(0.0, cosAngle), 64.0) * moonIntensity;
    vec3 haloColor = vec3(0.8, 0.9, 1.0);  // 蓝白色月晕
    
    return moonColor * moonDisk * moonIntensity + haloColor * halo;
}

// 极光生成函数 - 从shadertoy移植
float triNoise2d(vec2 p, float spd) {
    float z = 1.8;
    float z2 = 2.5;
    float rz = 0.0;
    
    // 创建一个简单的2x2旋转矩阵
    float angle = 0.3;  // 约17°
    float c = cos(angle);
    float s = sin(angle);
    mat2 m2 = mat2(c, s, -s, c);
    
    // 创建旋转矩阵
    angle = p.x * 0.06;
    c = cos(angle);
    s = sin(angle);
    mat2 mm2 = mat2(c, s, -s, c);
    
    p *= mm2;
    vec2 bp = p;
    
    for (float i = 0.0; i < 5.0; i++) {
        vec2 dg = tri2(bp * 1.85) * 0.75;
        dg *= m2;
        p -= dg / z2;
        
        bp *= 1.3;
        z2 *= 0.45;
        z *= 0.42;
        p *= 1.21 + (rz - 1.0) * 0.02;
        
        rz += tri(p.x + tri(p.y)) * z;
        p *= -m2;
    }
    
    return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.55);
}

vec3 generateAurora(positionStruct pos) {
    if (enableAurora == 0) return vec3(0.0);
    
    // 视线向量
    vec3 dir = pos.worldVector;
    
    // 确保极光只在天空上部/北部区域生成
    if (dir.y < 0.0) return vec3(0.0);
    
    // 对视线向量进行旋转，改善极光形状和位置
    mat3 rotX = rotationMatrix(vec3(1.0, 0.0, 0.0), -0.2);
    mat3 rotZ = rotationMatrix(vec3(0.0, 0.0, 1.0), 0.1);
    dir = rotZ * rotX * dir;
    dir.y *= 2.0;  // 拉伸垂直方向，使极光看起来更像"帘子"
    
    // 计算光线位置 - 降低动画速度
    vec3 rayOrigin = vec3(0.0, 0.0, 0.0);
    rayOrigin.z += time * AURORA_HEIGHT; // 极大降低z方向移动速度
    
    vec4 aurora = vec4(0.0);
    vec4 avgCol = vec4(0.0);
    
    // 极光生成步进循环 - 调整参数让形状更自然
    for (int i = 0; i < AURORA_STEPS; i++) {
        float offset = AURORA_OFFSET * hash21(gl_FragCoord.xy) * smoothstep(0.0, 15.0, float(i) * 1.0);
        float pt = ((0.6 + pow(float(i), 1.3) * 0.004) - rayOrigin.y) / (dir.y * 1.5 + 0.4);
        pt -= offset;
        
        vec3 rayPos = rayOrigin + pt * dir;
        // 调整波动参数
        vec2 p = rayPos.zx + sin(time * 0.1 + rayPos.z * 0.2) * 0.5;
        
        float noise = triNoise2d(p, AURORA_SPEED);
        vec4 col2 = vec4(0.0, 0.0, 0.0, noise);
        
        // 使用极光颜色参数 - 改善色彩效果
        col2.rgb = (sin(1.0 - auroraColor + (float(i) * 1.0) * 0.03) * 0.5 + 0.5) * noise;
        
        avgCol = mix(avgCol, col2, 0.6);
        aurora += avgCol * exp2((-float(i) * 0.8) * 0.05 - 2.0) * smoothstep(0.0, 8.0, float(i) * 0.8);
    }
    
    // 根据视线向上的比例调整极光强度 - 改进形状
    aurora *= clamp(dir.y * 8.0 + 0.4, 0.0, 1.0);
    
    // 应用极光强度参数
    aurora *= auroraIntensity;
    
    // 添加光晕效果，使极光更有层次感
    aurora.rgb += aurora.rgb * aurora.a * 0.5;
    
    return aurora.rgb;
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
    
    // 检测是否应该渲染夜空场景
    float sunHeight = dot(pos.sunVector, vec3(0.0, 1.0, 0.0));
    float isNight = smoothstep(0.1, -0.1, sunHeight);
    
    // 计算云层遮挡效果（预计算）
    float cloudOcclusion = 1.0;
    if (pos.worldVector.y > 0.0) {
        float bottomSphere = rsi(vec3(0.0, 1.0, 0.0) * earthRadius, pos.worldVector, earthRadius + cloudHeight).y;
        float topSphere = rsi(vec3(0.0, 1.0, 0.0) * earthRadius, pos.worldVector, earthRadius + cloudHeight + cloudThickness).y;
        
        if (bottomSphere > 0.0 && topSphere > 0.0) {
            vec3 startPosition = pos.worldVector * bottomSphere;
            vec3 endPosition = pos.worldVector * topSphere;
            vec3 cloudPosition = startPosition;
            
            float stepLength = length(endPosition - startPosition) / 8.0; // 使用较少的步数检测云
            vec3 increment = pos.worldVector * stepLength;
            
            for (int i = 0; i < 8; i++, cloudPosition += increment) {
                float cloudDensity = getClouds(cloudPosition);
                if (cloudDensity > 0.01) {
                    cloudOcclusion = 0.0;
                    break;
                }
            }
        }
    }
    
    // 添加星空 - 考虑云层遮挡
    if (enableStars == 1) {
        vec3 stars = generateStars(pos.worldVector, time);
        color += stars * isNight * cloudOcclusion;  // 在有云的地方不显示星星
    }
    
    // 添加月亮 - 也考虑云层遮挡
    if (enableMoon == 1) {
        vec3 moon = generateMoon(pos);
        color += moon * isNight * cloudOcclusion;  // 月亮也受云层遮挡
    }
    
    // 添加极光 - 极光应该在云层之下
    if (enableAurora == 1) {
        vec3 aurora = generateAurora(pos);
        color += aurora * isNight;  // 极光不受云层遮挡
    }
    
    // 继续处理云层和体积光
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