// 这些变量已经由Three.js自动定义，不需要再声明
// uniform mat4 projectionMatrix;
// uniform mat4 modelViewMatrix;
// uniform vec3 cameraPosition;

// attribute vec3 position;
// attribute vec2 uv;

// varying vec2 vUv;
varying vec4 vRay;

uniform vec3 frustumCorners[4];

// 不再定义main函数，改为define跟踪函数
// 创建一个计算函数，让框架来调用
void setupRay() {
    // 根据顶点位置索引选择对应的视锥体角向量
    int index = int(position.z + 0.5); // 使用z坐标作为索引
    
    // 确保索引在有效范围内
    index = clamp(index, 0, 3);
    
    // 设置光线方向
    vRay = vec4(frustumCorners[index], 1.0);
}

// 在vertexShader注入点插入setupRay函数调用
#define FRAGMENT_HEAD_INJECT setupRay(); 