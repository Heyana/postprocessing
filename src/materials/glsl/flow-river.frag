// 流动河流材质片段着色器

uniform float time;
uniform float flowSpeed;
uniform vec3 waterColor;
uniform float transparency;
uniform vec2 resolution;

// 从顶点着色器接收的数据
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// 常量定义
#define MOD2 vec2(4.438975, 3.972973)

// 旋转矩阵函数
mat2 rotate2D(float r) {
    return mat2(cos(r), sin(r), -sin(r), cos(r));
}

// 哈希函数
float hash(float p) {
    vec2 p2 = fract(vec2(p) * MOD2);
    p2 += dot(p2.yx, p2.xy + 19.19);
    return fract(p2.x * p2.y);
}

// 平滑噪声
float smoothNoise(in vec2 o) {
    vec2 p = floor(o);
    vec2 f = fract(o);
    
    float n = p.x + p.y * 57.0;
    
    float a = hash(n + 0.0);
    float b = hash(n + 1.0);
    float c = hash(n + 57.0);
    float d = hash(n + 58.0);
    
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    
    vec2 t = 3.0 * f2 - 2.0 * f3;
    
    float u = t.x;
    float v = t.y;
    
    float res = a + (b-a)*u + (c-a)*v + (a-b+d-c)*u*v;
    
    return res;
}

// FBM (分形布朗运动)
float fbm(vec2 p, float ps) {
    float f = 0.0;
    float tot = 0.0;
    float a = 1.0;
    for(int i=0; i<5; i++) {
        f += smoothNoise(p) * a;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

// 带梯度的噪声
vec3 smoothNoiseDXY(in vec2 o) {
    vec2 p = floor(o);
    vec2 f = fract(o);
    
    float n = p.x + p.y * 57.0;
    
    float a = hash(n + 0.0);
    float b = hash(n + 1.0);
    float c = hash(n + 57.0);
    float d = hash(n + 58.0);
    
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

// 带梯度的FBM
vec3 fbmDXY(vec2 p, vec2 flow, float ps, float df) {
    vec3 f = vec3(0.0);
    float tot = 0.0;
    float a = 1.0;
    for(int i=0; i<4; i++) {
        p += flow;
        flow *= -0.75;
        vec3 v = smoothNoiseDXY(p);
        f += v * a;
        p += v.xy * df;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

void main() {
    // 计算流动的UV坐标
    vec2 uv = vUv;
    vec2 flow = vec2(1.0, 0.0) * flowSpeed;
    
    // 计算分形噪声
    float noise = fbm(uv * 10.0 + time * flow, 0.5);
    vec3 noiseGradient = fbmDXY(uv * 10.0 + time * flow, flow * 0.1, 0.5, 0.1);
    
    // 计算法线
    vec3 normal = normalize(vNormal + vec3(noiseGradient.xy * 0.1, 1.0));
    
    // 计算光照
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diffuse = max(dot(normal, lightDir), 0.0);
    
    // 计算反射
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 reflectDir = reflect(-lightDir, normal);
    float specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    
    // 计算最终颜色
    vec3 color = waterColor;
    color = mix(color, color * 1.2, diffuse);
    color += vec3(1.0) * specular * 0.5;
    color = mix(color, vec3(1.0), noise * 0.1);
    
    // 输出带透明度的颜色
    gl_FragColor = vec4(color, transparency);
} 