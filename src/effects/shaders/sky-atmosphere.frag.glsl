uniform sampler2D noiseTexture;
uniform vec2 resolution;
uniform float time;
uniform int animateClouds;
uniform vec3 sunPosition;
uniform float intensity;
uniform float sunBrightness;
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
uniform float starSize; // 新增：星星大小参数
uniform int enableMoon;
uniform vec3 moonPosition;
uniform float moonSize;
uniform float moonIntensity;
uniform int enableAurora;
uniform float auroraIntensity;
uniform float auroraDensity; // 新增：极光密度参数
uniform vec3 auroraColor;
uniform float nightIntensity;

// 颜色叠加参数
uniform vec3 colorOverlay;
uniform float colorOverlayStrength;
uniform int colorOverlayAffectsClouds;

// 太阳颜色参数
uniform vec3 sunColor;

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

// 极光配置参数
#define AURORA_STEPS 50
#define AURORA_SPEED 0.02      // 降低动画速度
#define AURORA_HEIGHT 0.03    // 大幅降低高度移动速度
#define AURORA_OFFSET 0.006

// 散射参数
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
    
    // 应用太阳颜色到散射结果
    finalScatter *= sunColor;
    
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
    
    // 应用太阳颜色到散射结果
    finalScatter *= sunColor;
    
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
    
    // 修复：使用包装的时间值避免精度问题
    float wrappedTime = fract(time * cloudSpeed * 0.01) * 100.0;
    float timeOffset = wrappedTime * float(animateClouds);
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

// -------- Shadertoy Aurora & Stars 实现 --------
// 以下代码直接从shadertoy移植，保持原始实现以确保视觉效果一致

// 从shadertoy移植的矩阵函数
mat2 mm2(in float a){
    float c = cos(a), s = sin(a);
    return mat2(c,s,-s,c);
}
mat2 m2 = mat2(0.95534, 0.29552, -0.29552, 0.95534);

// 三角波函数
float tri(in float x){
    return clamp(abs(fract(x)-.5),0.01,0.49);
}

// 二维三角波
vec2 tri2(in vec2 p){
    return vec2(tri(p.x)+tri(p.y),tri(p.y+tri(p.x)));
}

// 三角噪声2D - 修复精度问题
float triNoise2d(in vec2 p, float spd)
{
    float z=1.8;
    float z2=2.5;
    float rz = 0.;
    p *= mm2(p.x*0.06);
    vec2 bp = p;
    
    // 修复：使用fract保持时间值在合理范围内，避免精度丢失
    float wrappedTime = fract(time * spd * 0.1) * 10.0;
    
    for (float i=0.; i<5.; i++ )
    {
        vec2 dg = tri2(bp*1.85)*.75;
        dg *= mm2(wrappedTime);
        p -= dg/z2;

        bp *= 1.3;
        z2 *= .45;
        z *= .42;
        p *= 1.21 + (rz-1.0)*.02;
        
        rz += tri(p.x+tri(p.y))*z;
        p*= -m2;
    }
    return clamp(1./pow(rz*29., 1.3),0.,.55);
}

// 更好的哈希函数 - 从shadertoy移植
float hash21(in vec2 n){ 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); 
}

vec3 nmzHash33(vec3 q)
{
    uvec3 p = uvec3(ivec3(q));
    p = p*uvec3(374761393U, 1103515245U, 668265263U) + p.zxy + p.yzx;
    p = p.yzx*(p.zxy^(p >> 3U));
    return vec3(p^(p >> 16U))*(1.0/vec3(0xffffffffU));
}

// 星星生成 - 修复精度问题
vec3 stars(in vec3 p)
{
    // 修复：使用包装的时间值避免精度问题
    float wrappedTime = fract(time * cloudSpeed * 0.002) * 500.0;
    float timeOffset = wrappedTime * 0.2 * float(animateClouds);
    vec3 starMovement = vec3(timeOffset, 0.0, timeOffset);
    
    vec3 c = vec3(0.);
    float res = resolution.x;
    
    for (float i=0.;i<4.;i++)
    {
        // 添加移动到星星位置
        vec3 adjustedP = p + starMovement * (i + 1.0) * 0.02;
        
        vec3 q = fract(adjustedP*(.15*res*starDensity))-0.5;
        vec3 id = floor(adjustedP*(.15*res*starDensity));
        vec2 rn = nmzHash33(id).xy;
        float c2 = 1.-smoothstep(0.,.6*starSize,length(q));
        c2 *= step(rn.x,.0005+i*i*0.001*starDensity);
        c += c2*(mix(vec3(1.0,0.49,0.1),vec3(0.75,0.9,1.),rn.y)*0.1+0.9)*starIntensity;
        p *= 1.3;
    }
    return c*c*.8;
}

// 天空背景 - 从shadertoy移植
vec3 bg(in vec3 rd)
{
    float sd = dot(normalize(vec3(-0.5, -0.6, 0.9)), rd)*0.5+0.5;
    sd = pow(sd, 5.);
    vec3 col = mix(vec3(0.05,0.1,0.2), vec3(0.1,0.05,0.2), sd);
    return col*.63*nightIntensity;
}

// 极光生成 - 从shadertoy直接移植，增加密度控制
vec4 aurora(vec3 ro, vec3 rd)
{
    // 修复：使用包装的时间值避免精度问题
    float wrappedTime = fract(time * cloudSpeed * 0.01) * 100.0;
    float timeOffset = wrappedTime * float(animateClouds);
    vec2 cloudMovement = vec2(timeOffset, timeOffset);
    
    vec4 col = vec4(0);
    vec4 avgCol = vec4(0);
    
    // 调整步进数量基于密度
    float stepCount = 50.0 * auroraDensity;
    
    for(float i=0.;i<stepCount;i++)
    {
        float of = 0.006*hash21(gl_FragCoord.xy)*smoothstep(0.,15., i);
        float pt = ((.8+pow(i,1.4)*.002)-ro.y)/(rd.y*2.+0.4);
        pt -= of;
        vec3 bpos = ro + pt*rd;
        
        // 添加云层一致的移动
        vec2 p = bpos.zx + cloudMovement;
        
        float rzt = triNoise2d(p, 0.06);
        vec4 col2 = vec4(0,0,0, rzt);
        col2.rgb = (sin(1.-auroraColor+i*0.043)*0.5+0.5)*rzt;
        avgCol =  mix(avgCol, col2, .5);
        col += avgCol*exp2(-i*0.065 - 2.5)*smoothstep(0.,5., i);
    }
    
    col *= (clamp(rd.y*15.+.4,0.,1.));
    
    // 应用密度调整和亮度控制，但不包括nightIntensity，我们会在应用极光时加入nightIntensity
    float densityFactor = 1.0 / max(auroraDensity, 0.1);
    col *= 1.8 * auroraIntensity * densityFactor;
    
    return col;
}

// 从shadertoy移植的月亮生成函数
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
    
    // 根据开关决定是否在早期阶段对整体天空色调进行调整
    if (colorOverlayStrength > 0.0 && colorOverlayAffectsClouds == 1) {
        vec3 colorTint = colorOverlay;
        
        // 使用温和的色调调整，影响整个天空光照系统（包括云层）
        vec3 tintedColor = color * colorTint;
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        vec3 tintedColor2 = normalize(colorTint) * luminance * length(colorTint);
        vec3 finalTint = mix(tintedColor, tintedColor2, 0.4);
        
        // 温和地调整整体天空颜色，强度降低避免过度
        color = mix(color, finalTint, colorOverlayStrength * 0.4);
    }
    
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
    
    // 夜空渲染 - 完全按照原始Shadertoy实现
    if (isNight > 0.0) {
        // 准备光线参数 - 完全匹配Shadertoy
        vec3 ro = vec3(0.0, 0.0, -6.7); // 光线原点
        vec3 rd = pos.worldVector;       // 光线方向
        
        // 应用与Shadertoy相同的视角旋转
        vec2 mo = vec2(-0.1, 0.1);      // 模拟Shadertoy中的默认鼠标位置
        rd.yz *= mm2(mo.y);              // 旋转Y-Z平面
        rd.xz *= mm2(mo.x + sin(fract(time*0.005)*2.0*pi)*0.2); // 修复：使用包装时间避免精度问题
        
        vec3 col = vec3(0.0);
        vec3 brd = rd;
        float fade = smoothstep(0.0, 0.01, abs(brd.y))*0.1+0.9;
        
        // 计算背景
        col = bg(rd)*fade;
        
        // 移除水面反射，所有方向都使用相同的天空渲染
        // 极光效果仅当启用时计算
        if (enableAurora == 1) {
            // 应用极光，并将nightIntensity应用到极光亮度上
            vec4 aur = smoothstep(0.0, 1.5, aurora(ro, rd))*fade*nightIntensity;
            // 混合极光 - 注意这里使用的是aur.a
            col = col*(1.0-aur.a) + aur.rgb;
        }
        
        // 添加星星
        if (enableStars == 1) {
            col += stars(rd)*cloudOcclusion;
        }
        
        // 添加月亮
        if (enableMoon == 1) {
            col += generateMoon(pos)*cloudOcclusion;
        }
        
        // 混合夜空和白天天空
        color = mix(color, col, isNight);
    }
    
    // 保存原始天空颜色
    vec3 originalSkyColor = color;
    
    // 计算云层和体积光
    color = calculateVolumetricClouds(pos, color, dither, lightAbsorb);
    color = calculateVolumetricLight(pos, color, dither, lightAbsorb);
    
    // 优化：统一计算天空遮罩，避免重复
    if (colorOverlayStrength > 0.0) {
        // 统一计算云层影响度和天空遮罩
        vec3 colorChange = color - originalSkyColor;
        float cloudInfluence = length(colorChange) / (length(originalSkyColor) + 0.001);
        float skyMask = 1.0 - clamp(cloudInfluence * 3.0, 0.0, 1.0);
        
        // 预计算颜色叠加结果
        vec3 colorTint = colorOverlay;
        vec3 tintedColor = originalSkyColor * colorTint;
        float luminance = dot(originalSkyColor, vec3(0.299, 0.587, 0.114));
        vec3 tintedColor2 = normalize(colorTint) * luminance * length(colorTint);
        vec3 finalTint = mix(tintedColor, tintedColor2, 0.3);
        
        if (colorOverlayAffectsClouds == 0) {
            // 不影响云层：只对纯天空区域应用
            if (skyMask > 0.05) {
                vec3 tintedSky = mix(originalSkyColor, finalTint, colorOverlayStrength);
                vec3 skyTintDiff = tintedSky - originalSkyColor;
                color += skyTintDiff * skyMask;
            }
        } else {
            // 影响云层：对纯天空区域额外强化
            if (skyMask > 0.3) {
                vec3 tintedSky = mix(originalSkyColor, finalTint, colorOverlayStrength * 0.6);
                vec3 skyTintDiff = tintedSky - originalSkyColor;
                color += skyTintDiff * skyMask * skyMask;
            }
        }
    }
    
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