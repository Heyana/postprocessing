/**
 * Screen Space Reflection Shader
 * Based on: https://github.com/mrdoob/three.js/blob/dev/examples/jsm/shaders/SSRShader.js
 */

import { Vector2 } from 'three';

const SSRShader = {
  defines: {
    MAX_STEP: 0,
    PERSPECTIVE_CAMERA: true,
    FRESNEL: 1,
    INFINITE_THICK: 0,
    SELECTIVE: 0,
    BOUNCING: 0,
    DISTANCE_ATTENUATION: 1,
  },
  uniforms: {
    'tDiffuse': { value: null },
    'tNormal': { value: null },
    'tMetalness': { value: null },
    'tDepth': { value: null },
    'cameraNear': { value: null },
    'cameraFar': { value: null },
    'resolution': { value: new Vector2() },
    'cameraRange': { value: null },
    'thickness': { value: 0.018 },
    'opacity': { value: 0.85 },
    'maxDistance': { value: 0.1 },
    'roughness': { value: 0.5 },
    'reflectorOffset': { value: 0.002 },
    'hasReflector': { value: 0 },
    'reflectorNormal': { value: null },
    'reflectorMatrix': { value: null },
    'view': { value: null },
    'viewInverse': { value: null },
    'projection': { value: null },
    'projectionInverse': { value: null }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    precision highp int;
    
    varying vec2 vUv;
    
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tMetalness;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float cameraRange;
    uniform vec2 resolution;
    uniform float thickness;
    uniform float maxDistance;
    uniform float opacity;
    uniform float roughness;
    uniform float reflectorOffset;
    uniform int hasReflector;
    uniform vec3 reflectorNormal;
    uniform mat4 reflectorMatrix;
    uniform mat4 view;
    uniform mat4 viewInverse;
    uniform mat4 projection;
    uniform mat4 projectionInverse;
    
    #include <packing>
    
    float distanceSquared(vec2 a, vec2 b) {
      a -= b;
      return dot(a, a);
    }
    
    // Unpack from RGBA normalized to float
    float unpackRGBAToDepth(const in vec4 v) {
      return dot(v, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 160581375.0));
    }
    
    // Get screen space position from depth
    vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
      vec4 clipSpacePosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
      vec4 viewSpacePosition = projectionInverse * clipSpacePosition;
      viewSpacePosition /= viewSpacePosition.w;
      return viewSpacePosition.xyz;
    }
    
    // Project point to screen space
    vec2 projectToScreen(vec3 position) {
      vec4 projectedPosition = projection * vec4(position, 1.0);
      projectedPosition.xy /= projectedPosition.w;
      projectedPosition.xy = projectedPosition.xy * 0.5 + 0.5;
      return projectedPosition.xy;
    }
    
    // Calculate reflection vector using normal
    vec3 computeReflection(vec3 viewPosition, vec3 normal) {
      return reflect(normalize(viewPosition), normal);
    }
    
    void main() {
      // Get screen position
      vec2 screenPosition = vUv;
      
      // Read texture values
      vec4 diffuse = texture2D(tDiffuse, screenPosition);
      vec4 normalColor = texture2D(tNormal, screenPosition);
      vec4 depthColor = texture2D(tDepth, screenPosition);
      vec4 metalnessColor = texture2D(tMetalness, screenPosition);
      
      // Skip calculations for non-reflective areas (black in metalness map)
      if (metalnessColor.r == 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
      }
      
      // Get metalness for this pixel
      float metalness = metalnessColor.r;
      
      // Unpack normal value (assuming normalized normal in world space is saved in texture)
      vec3 normal = normalize(normalColor.rgb * 2.0 - 1.0);
      
      // Get depth value
      float depth = depthColor.r;
      
      // Get view position from depth
      vec3 viewPosition = getViewPosition(screenPosition, depth);
      
      // Calculate reflection vector
      vec3 reflection = computeReflection(viewPosition, normal);
      
      // Initial position for raymarching
      vec3 currentPosition = viewPosition + reflection * thickness;
      
      // Compute the maximum steps
      float maxSteps = float(MAX_STEP);
      
      // Max raymarching distance
      float maxRayDistance = maxDistance;
      
      // Adaptive step size based on screen size
      float stride = maxRayDistance / maxSteps;
      
      // Initialize variables for raymarching
      vec2 hitPixel = vec2(0.0);
      vec3 hitPoint = vec3(0.0);
      float stepping = stride;
      float totalDistance = 0.0;
      bool hit = false;
      bool isOutOfBounds = false;
      
      // Main raymarching loop
      for (float i = 0.0; i < MAX_STEP; i++) {
        if (hit || isOutOfBounds) break;
        
        // Update current position
        currentPosition += reflection * stepping;
        totalDistance += stepping;
        
        // Exit if we've gone too far
        if (totalDistance > maxRayDistance) {
          break;
        }
        
        // Project current position to screen space
        vec2 currentCoord = projectToScreen(currentPosition);
        
        // Check if we're still in screen space
        if (currentCoord.x < 0.0 || currentCoord.x > 1.0 || 
            currentCoord.y < 0.0 || currentCoord.y > 1.0) {
          isOutOfBounds = true;
          break;
        }
        
        // Read depth at current position
        float currentDepth = unpackRGBAToDepth(texture2D(tDepth, currentCoord));
        
        // Get view space position at this point
        vec3 sampleViewPosition = getViewPosition(currentCoord, currentDepth);
        
        // Calculate the difference between ray and scene depth
        float viewPosDiff = abs(sampleViewPosition.z - currentPosition.z);
        
        // Check for intersection
        float thicknessFactor = mix(1.0, 0.0, step(thickness, 0.0));
        
        if (viewPosDiff < thickness) {
          // Found an intersection
          hit = true;
          hitPixel = currentCoord;
          hitPoint = currentPosition;
        }
        
        // Adaptive stepping - get closer to surface as we progress
        stepping = stride * mix(1.0, i / maxSteps, 0.5);
      }
      
      // If we got a hit, sample the color at that position
      vec4 hitColor = vec4(0.0);
      float reflectionIntensity = opacity;
      
      if (hit) {
        // Calculate Fresnel reflection factor if enabled
        #ifdef FRESNEL
        float fresnel = pow(clamp(1.0 - dot(-normalize(viewPosition), normal), 0.0, 1.0), 5.0);
        reflectionIntensity *= fresnel;
        #endif
        
        // Apply distance attenuation if enabled
        #ifdef DISTANCE_ATTENUATION
        float attenuation = 1.0 - clamp(totalDistance / maxRayDistance, 0.0, 1.0);
        reflectionIntensity *= attenuation * attenuation;
        #endif
        
        // Sample color at hit position
        hitColor = texture2D(tDiffuse, hitPixel);
        
        // Apply reflection intensity
        hitColor.a = reflectionIntensity;
      } else if (hasReflector == 1) {
        // Check for reflector intersection if enabled
        vec4 worldPos = viewInverse * vec4(viewPosition, 1.0);
        vec4 reflectorPos = reflectorMatrix * worldPos;
        float dotProduct = dot(normalize(reflection), reflectorNormal);
        
        if (dotProduct < 0.0) {
          // Ray hits reflector
          vec2 reflectorUv = reflectorPos.xy / reflectorPos.w * 0.5 + 0.5;
          
          // Check if the UV coordinates are within bounds
          if (reflectorUv.x >= 0.0 && reflectorUv.x <= 1.0 && 
              reflectorUv.y >= 0.0 && reflectorUv.y <= 1.0) {
            // Sample color from the reflector
            hitColor = texture2D(tDiffuse, reflectorUv);
            
            // Apply Fresnel if enabled
            #ifdef FRESNEL
            float fresnel = pow(clamp(1.0 - dot(-normalize(viewPosition), normal), 0.0, 1.0), 5.0);
            reflectionIntensity *= fresnel;
            #endif
            
            hitColor.a = reflectionIntensity;
            hit = true;
          }
        }
      }
      
      gl_FragColor = hitColor;
    }
  `
};

const BlurShaderUtils = {
  generateFragmentShader: function (kernelSize) {
    let gaussian = [];
    const halfWidth = Math.floor(kernelSize / 2);

    for (let i = 0; i < kernelSize; i++) {
      const x = i - halfWidth;
      const sigma = halfWidth * 0.5;
      const weight = Math.exp(-(x * x) / (2.0 * sigma * sigma)) / (Math.sqrt(2.0 * Math.PI) * sigma);
      gaussian.push(weight);
    }

    // Normalize
    let sum = 0;
    for (let i = 0; i < kernelSize; i++) {
      sum += gaussian[i];
    }

    for (let i = 0; i < kernelSize; i++) {
      gaussian[i] /= sum;
    }

    let source = `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform vec2 direction;
      
      varying vec2 vUv;
      
      void main() {
        vec2 texelSize = 1.0 / resolution;
        vec4 result = vec4(0.0);
    `;

    for (let i = 0; i < kernelSize; i++) {
      const offset = i - Math.floor(kernelSize / 2);

      source += `
        result += texture2D(tDiffuse, vUv + texelSize * ${offset}.0 * direction) * ${gaussian[i].toFixed(8)};
      `;
    }

    source += `
        gl_FragColor = result;
      }
    `;

    return source;
  }
};

export { SSRShader, BlurShaderUtils }; 