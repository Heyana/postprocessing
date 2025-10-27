import {
	Matrix4,
	Vector2
} from "run-scene-core";
/**
 * References:
 * https://lettier.github.io/3d-game-shaders-for-beginners/screen-space-reflection.html
 */

const SSRShader = {

	name: "SSRShader",

	defines: {
		MAX_STEP: 0,
		PERSPECTIVE_CAMERA: true,
		DISTANCE_ATTENUATION: true,
		FRESNEL: true,
		INFINITE_THICK: false,
		SELECTIVE: false,
		USE_OBJECT_ID: false,  // 新增：是否使用ObjectId进行选择性渲染
		DEBUG_OBJECT_ID: false  // 新增：调试ObjectId选择逻辑
	},

	uniforms: {
		"tDiffuse": { value: null },
		"tNormal": { value: null },
		"tMetalness": { value: null },
		"tDepth": { value: null },
		"maskTexture": { value: null },
		"tObjectId": { value: null },  // 新增：ObjectId纹理
		"selectedObjectIds": { value: [] },  // 新增：选中对象ID数组
		"cameraNear": { value: null },
		"cameraFar": { value: null },
		"resolution": { value: new Vector2() },
		"cameraProjectionMatrix": { value: new Matrix4() },
		"cameraInverseProjectionMatrix": { value: new Matrix4() },
		"opacity": { value: .5 },
		"maxDistance": { value: 180 },
		"cameraRange": { value: 0 },
		"thickness": { value: .018 },
		"reflectionStrength": { value: 1.0 },
		"metalnessThreshold": { value: 1.0 },
		"debugMode": { value: 0 },
		"brightnessThreshold": { value: 1.0 },
		"maskThreshold": { value: 0.01 },
		"readBuffer": { value: null },
		"normalBuffer": { value: null },
		"depthTexture": { value: null },
		"depthPass1": { value: null }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`
	// precision highp float;
	precision highp sampler2D;
	varying vec2 vUv;
	uniform sampler2D tDepth;
	uniform sampler2D tNormal;
	uniform sampler2D tMetalness;
	uniform sampler2D tDiffuse;
	uniform sampler2D maskTexture;
	uniform sampler2D tObjectId;  // 新增：ObjectId纹理
	uniform float selectedObjectIds[256];  // 新增：选中对象ID数组，最多256个
	uniform float cameraRange;
	uniform vec2 resolution;
	uniform float opacity;
	uniform float cameraNear;
	uniform float cameraFar;
	uniform float maxDistance;
	uniform float thickness;
	uniform float reflectionStrength;
	uniform mat4 cameraProjectionMatrix;
	uniform mat4 cameraInverseProjectionMatrix;
	#include <packing>
	float pointToLineDistance(vec3 x0, vec3 x1, vec3 x2) {
		//x0: point, x1: linePointA, x2: linePointB
		//https://mathworld.wolfram.com/Point-LineDistance3-Dimensional.html
		return length(cross(x0-x1,x0-x2))/length(x2-x1);
	}
	float pointPlaneDistance(vec3 point,vec3 planePoint,vec3 planeNormal){
		// https://mathworld.wolfram.com/Point-PlaneDistance.html
		//// https://en.wikipedia.org/wiki/Plane_(geometry)
		//// http://paulbourke.net/geometry/pointlineplane/
		float a=planeNormal.x,b=planeNormal.y,c=planeNormal.z;
		float x0=point.x,y0=point.y,z0=point.z;
		float x=planePoint.x,y=planePoint.y,z=planePoint.z;
		float d=-(a*x+b*y+c*z);
		float distance=(a*x0+b*y0+c*z0+d)/sqrt(a*a+b*b+c*c);
		return distance;
	}
	float getDepth( const in vec2 uv ) {
		return texture2D( tDepth, uv ).x;
	}
	float getViewZ( const in float depth ) {
		#ifdef PERSPECTIVE_CAMERA
			return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
		#else
			return orthographicDepthToViewZ( depth, cameraNear, cameraFar );
		#endif
	}
	vec3 getViewPosition( const in vec2 uv, const in float depth/*clip space*/, const in float clipW ) {
		vec4 clipPosition = vec4( ( vec3( uv, depth ) - 0.5 ) * 2.0, 1.0 );//ndc
		clipPosition *= clipW; //clip
		return ( cameraInverseProjectionMatrix * clipPosition ).xyz;//view
	}
	vec3 getViewNormal( const in vec2 uv ) {
		return unpackRGBToNormal( texture2D( tNormal, uv ).xyz );
	}
	vec2 viewPositionToXY(vec3 viewPosition){
		vec2 xy;
		vec4 clip=cameraProjectionMatrix*vec4(viewPosition,1);
		xy=clip.xy;//clip
		float clipW=clip.w;
		xy/=clipW;//NDC
		xy=(xy+1.)/2.;//uv
		xy*=resolution;//screen
		return xy;
	}
	// 检查当前像素的对象ID是否在选中列表中
	bool isObjectSelected(float objectId) {
		// 如果objectId为0，表示无效ID，不选中
		if(objectId < 0.001) return false;
		
		// 遍历选中的对象ID列表
		for(int i = 0; i < 256; i++) {
			float selectedId = selectedObjectIds[i];
			// 如果遇到0，表示列表结束
			if(selectedId < 0.001) break;
			// 如果匹配，返回true
			// 阈值设置为1/255的一半，确保能匹配到相同的ID
			// 1/255 ≈ 0.00392，所以使用0.002作为阈值
			if(abs(objectId - selectedId) < 0.002) return true;
		}
		return false;
	}
	
	void main(){
		#ifdef USE_OBJECT_ID
			// 使用ObjectId纹理进行选择性渲染
			vec4 objectIdData = texture2D(tObjectId, vUv);
			float objectId = objectIdData.r;
			
			// 🔍 调试：可视化ObjectId选择结果
			#ifdef DEBUG_OBJECT_ID
				// 绿色=选中, 红色=未选中, 蓝色=无效ID
				if(objectId < 0.001) {
					gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); // 蓝色：无效ID
					return;
				}
				if(isObjectSelected(objectId)) {
					gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); // 绿色：选中
				} else {
					gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // 红色：未选中
				}
				return;
			#endif
			
			if(!isObjectSelected(objectId)) return;
		#else
			// 传统的mask纹理方式
			float metalness=texture2D(maskTexture,vUv).r;
			if(metalness==0.0) return;
		#endif

		float depth = getDepth( vUv );
		float viewZ = getViewZ( depth );
		if(-viewZ>=cameraFar) return;

		float clipW = cameraProjectionMatrix[2][3] * viewZ+cameraProjectionMatrix[3][3];
		vec3 viewPosition=getViewPosition( vUv, depth, clipW );

		vec2 d0=gl_FragCoord.xy;
		vec2 d1;

		vec3 viewNormal=getViewNormal( vUv );

		#ifdef PERSPECTIVE_CAMERA
			vec3 viewIncidentDir=normalize(viewPosition);
			vec3 viewReflectDir=reflect(viewIncidentDir,viewNormal);
		#else
			vec3 viewIncidentDir=vec3(0,0,-1);
			vec3 viewReflectDir=reflect(viewIncidentDir,viewNormal);
		#endif

		float maxReflectRayLen=maxDistance/dot(-viewIncidentDir,viewNormal);
		// dot(a,b)==length(a)*length(b)*cos(theta) // https://www.mathsisfun.com/algebra/vectors-dot-product.html
		// if(a.isNormalized&&b.isNormalized) dot(a,b)==cos(theta)
		// maxDistance/maxReflectRayLen=cos(theta)
		// maxDistance/maxReflectRayLen==dot(a,b)
		// maxReflectRayLen==maxDistance/dot(a,b)

		vec3 d1viewPosition=viewPosition+viewReflectDir*maxReflectRayLen;
		#ifdef PERSPECTIVE_CAMERA
			if(d1viewPosition.z>-cameraNear){
				//https://tutorial.math.lamar.edu/Classes/CalcIII/EqnsOfLines.aspx
				float t=(-cameraNear-viewPosition.z)/viewReflectDir.z;
				d1viewPosition=viewPosition+viewReflectDir*t;
			}
		#endif
		d1=viewPositionToXY(d1viewPosition);

		float totalLen=length(d1-d0);
		float xLen=d1.x-d0.x;
		float yLen=d1.y-d0.y;
		float totalStep=max(abs(xLen),abs(yLen));
		float xSpan=xLen/totalStep;
		float ySpan=yLen/totalStep;
		for(float i=0.;i<float(MAX_STEP);i++){
			if(i>=totalStep) break;
			vec2 xy=vec2(d0.x+i*xSpan,d0.y+i*ySpan);
			if(xy.x<0.||xy.x>resolution.x||xy.y<0.||xy.y>resolution.y) break;
			float s=length(xy-d0)/totalLen;
			vec2 uv=xy/resolution;

			float d = getDepth(uv);
			float vZ = getViewZ( d );
			if(-vZ>=cameraFar) continue;
			float cW = cameraProjectionMatrix[2][3] * vZ+cameraProjectionMatrix[3][3];
			vec3 vP=getViewPosition( uv, d, cW );

			#ifdef PERSPECTIVE_CAMERA
				// https://comp.nus.edu.sg/~lowkl/publications/lowk_persp_interp_techrep.pdf
				float recipVPZ=1./viewPosition.z;
				float viewReflectRayZ=1./(recipVPZ+s*(1./d1viewPosition.z-recipVPZ));
			#else
				float viewReflectRayZ=viewPosition.z+s*(d1viewPosition.z-viewPosition.z);
			#endif

			// if(viewReflectRayZ>vZ) continue; // will cause "npm run make-screenshot webgl_postprocessing_ssr" high probability hang.
			// https://github.com/mrdoob/three.js/pull/21539#issuecomment-821061164
			if(viewReflectRayZ<=vZ){

				bool hit;
				#ifdef INFINITE_THICK
					hit=true;
				#else
					float away=pointToLineDistance(vP,viewPosition,d1viewPosition);

					float minThickness;
					vec2 xyNeighbor=xy;
					xyNeighbor.x+=1.;
					vec2 uvNeighbor=xyNeighbor/resolution;
					vec3 vPNeighbor=getViewPosition(uvNeighbor,d,cW);
					minThickness=vPNeighbor.x-vP.x;
					minThickness*=3.;
					float tk=max(minThickness,thickness);

					hit=away<=tk;
				#endif

				if(hit){
					vec3 vN=getViewNormal( uv );
					if(dot(viewReflectDir,vN)>=0.) continue;
					float distance=pointPlaneDistance(vP,viewPosition,viewNormal);
					if(distance>maxDistance) break;
					float op=opacity;
					#ifdef DISTANCE_ATTENUATION
						float ratio=1.-(distance/maxDistance);
						float attenuation=ratio*ratio;
						op=opacity*attenuation;
					#endif
					#ifdef FRESNEL
						float fresnelCoe=(dot(viewIncidentDir,viewReflectDir)+1.)/2.;
						op*=fresnelCoe;
					#endif
					vec4 reflectColor=texture2D(tDiffuse,uv);
					gl_FragColor.xyz=reflectColor.xyz * reflectionStrength;
					gl_FragColor.a=op;
					break;
				}
			}
		}
	}
`

};

const SSRDepthShader = {

	name: "SSRDepthShader",

	defines: {
		"PERSPECTIVE_CAMERA": 1
	},

	uniforms: {

		"tDepth": { value: null },
		"cameraNear": { value: null },
		"cameraFar": { value: null }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDepth;

		uniform float cameraNear;
		uniform float cameraFar;

		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 uv ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, uv ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, uv ).x;

			#endif

		}

		void main() {

			float depth = getLinearDepth( vUv );
			float d = 1.0 - depth;
			// d=(d-.999)*1000.;
			gl_FragColor = vec4( vec3( d ), 1.0 );

		}

	`

};

const SSRBlurShader = {

	name: "SSRBlurShader",

	uniforms: {

		"tDiffuse": { value: null },
		"resolution": { value: new Vector2() },
		"opacity": { value: .5 }

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform vec2 resolution;
		varying vec2 vUv;
		void main() {
			//reverse engineering from PhotoShop blur filter, then change coefficient

			vec2 texelSize = ( 1.0 / resolution );

			vec4 c=texture2D(tDiffuse,vUv);

			vec2 offset;

			offset=(vec2(-1,0))*texelSize;
			vec4 cl=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(1,0))*texelSize;
			vec4 cr=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(0,-1))*texelSize;
			vec4 cb=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(0,1))*texelSize;
			vec4 ct=texture2D(tDiffuse,vUv+offset);

			// float coeCenter=.5;
			// float coeSide=.125;
			float coeCenter=.2;
			float coeSide=.2;
			float a=c.a*coeCenter+cl.a*coeSide+cr.a*coeSide+cb.a*coeSide+ct.a*coeSide;
			vec3 rgb=(c.rgb*c.a*coeCenter+cl.rgb*cl.a*coeSide+cr.rgb*cr.a*coeSide+cb.rgb*cb.a*coeSide+ct.rgb*ct.a*coeSide)/a;
			gl_FragColor=vec4(rgb,a);

		}
	`


};

export { SSRShader, SSRDepthShader, SSRBlurShader };
