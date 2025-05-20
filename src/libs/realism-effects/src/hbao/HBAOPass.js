import { AOPass } from "../ao/AOPass";

import hbao_utils from "./shader/hbao_utils.glsl";
import fragmentShader from "./shader/hbao.frag";

const finalFragmentShader = fragmentShader.replace("#include <hbao_utils>", hbao_utils);

class HBAOPass extends AOPass {

	constructor(camera, scene) {

		super(camera, scene, finalFragmentShader);

	}

}

export { HBAOPass };
