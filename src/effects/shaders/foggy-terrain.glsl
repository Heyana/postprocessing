// 迷雾地形效果
// 基于 Shadertoy: Foggy Terrain
// 直接从原始代码移植，保持渲染逻辑完全一致

uniform float time;
uniform vec2 resolution;
uniform float terrainHeight;
uniform float fogDensity;

// 新增参数
uniform float fogMinDistance; // 雾的最近距离
uniform float fogFalloff;     // 雾的衰减速度
uniform vec3 fogColor;        // 雾的颜色
uniform bool hideTerrainMesh; // 是否隐藏地形网格，只显示雾效果

// 相机参数
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;
uniform float cameraNear;
uniform float cameraFar;

// IÃ±igo Quilez的噪声函数
float hash(float n)
{
  return fract(cos(n) * 41415.92653);
}
float noise( in vec3 x )
{
  vec3 p  = floor(x);
  vec3 f  = smoothstep(0.0, 1.0, fract(x));
  float n = p.x + p.y*57.0 + 113.0*p.z;

  return mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
    mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
    mix(mix( hash(n+113.0), hash(n+114.0),f.x),
    mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
}
mat3 m = mat3( 0.00,  1.60,  1.20, 
			  -1.60,  0.72, -0.96, 
			  -1.20, -0.96,  2.28 );
float fbm( vec3 p ) // 实验和修改过的
{
  float f = 0.5000 * noise( p ); p = m * p * 0.72;
  f += 0.2500 * noise( p ); p = m * p * 0.73;
  f += 0.1250 * noise( p ); p = m * p * 0.74;
  f += 0.0625 * noise( p ); p = m * p * 0.75; 
  f += 0.03125 * noise( p ); p = m * p;
  return f;
}

// 场景定义
float objFloor(in vec3 p, in float height) // 地形只是一个带噪声的平面
{
	return p.y + height * fbm(vec3(p.xz, 10));
}
vec2 scene(in vec3 p)
{
	vec2 floorPlane = vec2(objFloor(p, terrainHeight),
						   1.0);
	return floorPlane;
}

// 光线追踪相关
vec3 calcNormal(in vec3 p)
{
	vec3 e = vec3(0.001, 0.0, 0.0);
	
	vec3 n;
	n.x = scene(p + e.xyy).x - scene(p - e.xyy).x;
	n.y = scene(p + e.yxy).x - scene(p - e.yxy).x;
	n.z = scene(p + e.yyx).x - scene(p - e.yyx).x;
	
	return normalize(n);
}

// 增加最大深度和步数，扩大渲染范围
#define MAX_STEPS 128
#define MAX_DEPTH 100.0

vec2 intersect(in vec3 origin, in vec3 direction)
{
	float rayLength = 0.0;
	vec2 hit = vec2(1.);
	for (int i = 0; i < MAX_STEPS; ++i)
	{
		if (hit.x < 0.001 || rayLength > MAX_DEPTH)
			break;
		
		hit = scene(origin + direction * rayLength);
		 
		// 使用略微减少的步长来减少波形伪影
		rayLength += hit.x * 0.6;
	}
		
	return vec2(rayLength, rayLength > MAX_DEPTH ? 
						   0. : hit.y);
}

// 计算基于距离的雾效果
float calculateFog(float distance) {
    // 应用最小距离，小于最小距离的部分没有雾
    float adjustedDistance = max(0.0, distance - fogMinDistance);
    
    // 使用指数衰减计算雾的浓度
    float fogAmount = 1.0 - exp(-adjustedDistance * fogFalloff * fogDensity);
    
    return clamp(fogAmount, 0.0, 1.0);
}

// 渲染迷雾地形
vec4 renderFoggyTerrain(in vec2 uv)
{
	// 设置空间
	vec2 p = (uv * 2.0 - 1.0); p.x *= resolution.x / resolution.y;
	
	// 获取相机位置和目标
	vec3 origin = vec3(3. * cos(time * 0.0),  // 停止自动旋转
					   1,
					   2. * sin(time * 0.0)); // 停止自动旋转
	
	// 如果提供了相机位置，使用相机位置
	if(cameraPosition != vec3(0.0)) {
		origin = cameraPosition;
	}
	
	vec3 target = vec3(0,0,0);
	
	// 摄像机方向 - 如果有视图矩阵，使用它
	vec3 direction;
	vec3 right;
	vec3 up;
	
	if(viewMatrix != mat4(0.0)) {
		// 从视图矩阵提取相机方向
		direction = -normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
		right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
		up = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
	} else {
		// 使用默认相机方向
		direction = normalize(target - origin);
		right = normalize(cross(direction, vec3(0,1,0)));
		up = normalize(cross(right, direction));
	}
	
	// 光线方向
	vec3 rayDirection = normalize(p.x * right + p.y * up + 1.5 * direction);
	
	// 场景着色 - 使用自定义的雾颜色和天空的混合
	vec3 skyColor = mix(vec3(32./255.), // 背景
					vec3(225./255.),
					uv.y);
					
	// 应用雾的颜色
	vec3 color = skyColor;
	
	// x 是交点的距离，y 是材质
	vec2 result = intersect(origin, rayDirection);
	
	// 计算基于距离的雾
	float fogAmount = calculateFog(result.x);
	
	if (result.y > 0.5 && !hideTerrainMesh)
	{
		vec3 position = origin + rayDirection * result.x;
		vec3 normal = calcNormal(position);
		vec3 light = normalize(vec3(0., 3., -1.));
		
		// 使用噪声作为基础颜色
		vec3 terrainColor = vec3(fbm(vec3(position.xz, 10)));
		
		// 添加光照效果
		terrainColor *= max(0.3, dot(normal, light));
		
		// 应用雾气 - 使用自定义颜色
		color = mix(terrainColor, fogColor, fogAmount);
	} else {
	    // 如果没有地形交点或者地形被隐藏，只应用雾效果
	    // 修改：将 MAX_DEPTH * 0.5 改为更合理的值，确保足够的雾浓度
	    float skyFogAmount = calculateFog(MAX_DEPTH * 0.3);
	    
	    // 修改：增强雾气强度并确保使用正确的雾颜色
	    // 当 hideTerrainMesh 为 true 时，确保空气中也应用了正确的雾颜色
	    if (hideTerrainMesh) {
	        // 直接使用更强的雾气浓度和完全的雾颜色
	        color = mix(skyColor, fogColor, skyFogAmount * fogDensity);
	    } else {
	        // 使用原来的混合方式
	        color = mix(skyColor, fogColor, skyFogAmount * fogDensity * 0.5);
	    }
	}
	
	return vec4(color, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)
{
	// 渲染迷雾地形
	vec4 terrainColor = renderFoggyTerrain(uv);
	
	// 读取深度值
	#ifdef USE_DEPTH
	float depth = texture2D(depthBuffer, uv).r;
	
	// 将深度值转换为线性深度 (0-1)
	float linearDepth = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
	linearDepth = linearDepth / cameraFar; // 归一化到0-1
	
	// 改进的深度混合
	float skyMask = step(0.9999, depth); // 纯天空部分（最远处）
	
	// 基于最小距离的深度混合因子
	float adjustedLinearDepth = max(0.0, linearDepth - fogMinDistance / cameraFar);
	
	// 基于线性深度的雾气混合因子 - 使用自定义衰减
	float fogFactor = clamp(adjustedLinearDepth * fogDensity * fogFalloff * 5.0, 0.0, 1.0);
	
	// 混合策略改进:
	// 1. 先将输入颜色与自定义雾颜色混合，得到带雾的前景
	vec4 foggedColor;
	if(hideTerrainMesh) {
	    // 如果隐藏地形，直接混合输入颜色和雾颜色 - 确保使用正确的雾颜色
	    foggedColor = mix(inputColor, vec4(fogColor, 1.0), fogFactor);
	} else {
	    // 否则使用之前的混合策略
	    foggedColor = mix(inputColor, terrainColor, fogFactor);
	}
	
	// 2. 在天空区域（最远处）使用完整的效果
	outputColor = mix(foggedColor, terrainColor, skyMask);
	#else
	// 如果没有深度信息，直接输出效果
	outputColor = terrainColor;
	#endif
} 