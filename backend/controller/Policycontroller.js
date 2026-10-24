import { getPolicy } from "../utils/policy.js";
import { sendError } from "../utils/httpError.js";

// GET /api/policy  (public - guests can read the policy before signing up)
export async function getPolicyHandler(req, res) {
  try {
    res.json({ policy: await getPolicy() });
  } catch (err) {
    sendError(res, err, "Get policy");
  }
}