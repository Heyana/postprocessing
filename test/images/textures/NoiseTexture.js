import test from "ava";
import { NoiseTexture } from "postprocessing";

test("can be created", t => {

	t.truthy(new NoiseTexture(1, 1));

});
